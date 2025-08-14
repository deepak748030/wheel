const mongoose = require('mongoose');
const Game = require('../models/Game');
const Bet = require('../models/Bet');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// Get current active game
const getCurrentGame = async (req, res) => {
  try {
    const currentGame = await Game.findOne({ 
      status: { $in: ['waiting', 'spinning'] } 
    }).sort({ createdAt: -1 });

    if (!currentGame) {
      return res.json({ 
        success: true, 
        message: 'No active game',
        game: null 
      });
    }

    // Get live bets for current game
    const liveBets = await Bet.find({ gameId: currentGame._id })
      .populate('userId', 'playerName')
      .select('betNumber betAmount userId createdAt')
      .sort({ createdAt: -1 })
      .limit(50);

    // Calculate time remaining
    const now = new Date();
    const timeRemaining = Math.max(0, Math.floor((currentGame.spinEndTime - now) / 1000));

    res.json({ 
      success: true, 
      game: {
        ...currentGame.toObject(),
        timeRemaining
      },
      liveBets: liveBets.map(bet => ({
        betNumber: bet.betNumber,
        betAmount: bet.betAmount,
        playerName: bet.userId.playerName,
        timestamp: bet.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Place a bet
const placeBet = async (req, res) => {
  try {
    const { betNumber, betAmount } = req.body;
    const userId = req.user._id;

    // Validation
    if (betNumber < 0 || betNumber > 9) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid bet number. Must be between 0-9' 
      });
    }

    if (betAmount < 10 || betAmount > 50000) {
      return res.status(400).json({ 
        success: false, 
        error: 'Bet amount must be between ₹10 and ₹50,000' 
      });
    }

    // Check user balance
    const user = await User.findById(userId);
    if (user.walletBalance < betAmount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Insufficient balance' 
      });
    }

    // Get current game
    let currentGame = await Game.findOne({ status: 'waiting' })
      .sort({ createdAt: -1 });
    
    if (!currentGame) {
      return res.status(400).json({ 
        success: false, 
        error: 'No active game available for betting' 
      });
    }

    // Check if user already placed bet for this game
    const existingBet = await Bet.findOne({ 
      userId, 
      gameId: currentGame._id 
    });
    
    if (existingBet) {
      return res.status(400).json({ 
        success: false, 
        error: 'You have already placed a bet for this game' 
      });
    }

    // Deduct bet amount from user wallet
    const balanceBefore = user.walletBalance;
    user.walletBalance -= betAmount;
    await user.save();

    // Create bet record
    const bet = new Bet({
      userId,
      gameId: currentGame._id,
      betNumber,
      betAmount,
      multiplier: 4
    });
    await bet.save();

    // Create bet transaction
    await new Transaction({
      userId,
      type: 'bet',
      amount: -betAmount,
      description: `Bet ₹${betAmount} on number ${betNumber} - Game #${currentGame.periodNumber}`,
      gameId: currentGame._id,
      balanceBefore,
      balanceAfter: user.walletBalance
    }).save();

    // Update game statistics
    currentGame.totalBets += 1;
    currentGame.totalAmount += betAmount;
    await currentGame.save();

    // Emit live bet to all connected users
    req.app.get('io').emit('liveBet', {
      gameId: currentGame._id,
      periodNumber: currentGame.periodNumber,
      betNumber,
      betAmount,
      playerName: user.playerName,
      userId: user._id,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Bet placed successfully',
      bet: {
        id: bet._id,
        betNumber,
        betAmount,
        gameId: currentGame._id,
        periodNumber: currentGame.periodNumber
      },
      walletBalance: user.walletBalance
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get game history
const getGameHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const games = await Game.find({ status: 'completed' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('periodNumber winningNumber totalBets totalAmount totalWinAmount winnersCount createdAt isManuallyControlled');

    const total = await Game.countDocuments({ status: 'completed' });

    res.json({ 
      success: true, 
      games,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalGames: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get user's bet history
const getUserBets = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const bets = await Bet.find({ userId: req.user._id })
      .populate('gameId', 'periodNumber winningNumber createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Bet.countDocuments({ userId: req.user._id });

    res.json({ 
      success: true, 
      bets: bets.map(bet => ({
        id: bet._id,
        periodNumber: bet.gameId.periodNumber,
        betNumber: bet.betNumber,
        betAmount: bet.betAmount,
        winningNumber: bet.gameId.winningNumber,
        isWin: bet.isWin,
        winAmount: bet.winAmount,
        status: bet.status,
        timestamp: bet.createdAt,
        gameDate: bet.gameId.createdAt
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalBets: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get user's game statistics
const getUserStats = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get betting statistics
    const totalBets = await Bet.countDocuments({ userId });
    const totalWins = await Bet.countDocuments({ userId, isWin: true });
    const totalBetAmount = await Bet.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: '$betAmount' } } }
    ]);
    const totalWinAmount = await Bet.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), isWin: true } },
      { $group: { _id: null, total: { $sum: '$winAmount' } } }
    ]);

    const stats = {
      totalBets,
      totalWins,
      winRate: totalBets > 0 ? ((totalWins / totalBets) * 100).toFixed(2) : 0,
      totalBetAmount: totalBetAmount[0]?.total || 0,
      totalWinAmount: totalWinAmount[0]?.total || 0,
      netProfit: (totalWinAmount[0]?.total || 0) - (totalBetAmount[0]?.total || 0)
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

module.exports = {
  getCurrentGame,
  placeBet,
  getGameHistory,
  getUserBets,
  getUserStats
};