const User = require('../models/User');
const Transaction = require('../models/Transaction');

// Get wallet balance
const getBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('walletBalance');
    res.json({ 
      success: true, 
      balance: user.walletBalance 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Add money to wallet
const deposit = async (req, res) => {
  try {
    const { amount, paymentMethod } = req.body;

    if (amount <= 0 || amount > 100000) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid amount. Must be between ₹1 and ₹100,000' 
      });
    }

    const user = await User.findById(req.user._id);
    const balanceBefore = user.walletBalance;
    
    // Simulate payment processing (80% success rate)
    const isSuccess = Math.random() > 0.2;
    
    if (!isSuccess) {
      // Create failed transaction record
      await new Transaction({
        userId: user._id,
        type: 'deposit',
        amount,
        description: `Failed deposit via ${paymentMethod}`,
        status: 'failed',
        balanceBefore,
        balanceAfter: balanceBefore,
        referenceId: `DEP_${Date.now()}`
      }).save();

      return res.status(400).json({ 
        success: false, 
        error: 'Payment failed. Please try again.' 
      });
    }

    // Successful payment
    user.walletBalance += amount;
    await user.save();

    // Create successful transaction record
    await new Transaction({
      userId: user._id,
      type: 'deposit',
      amount,
      description: `Deposit via ${paymentMethod}`,
      status: 'completed',
      balanceBefore,
      balanceAfter: user.walletBalance,
      referenceId: `DEP_${Date.now()}`
    }).save();

    res.json({
      success: true,
      message: 'Money added successfully',
      walletBalance: user.walletBalance,
      transactionId: `DEP_${Date.now()}`
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Withdraw money from wallet
const withdraw = async (req, res) => {
  try {
    const { amount, paymentMethod, accountDetails } = req.body;

    if (amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid amount' 
      });
    }

    const user = await User.findById(req.user._id);
    
    if (user.walletBalance < amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Insufficient balance' 
      });
    }

    // Minimum withdrawal check
    if (amount < 100) {
      return res.status(400).json({ 
        success: false, 
        error: 'Minimum withdrawal amount is ₹100' 
      });
    }

    const balanceBefore = user.walletBalance;
    user.walletBalance -= amount;
    await user.save();

    // Create withdrawal transaction (pending status)
    const transaction = await new Transaction({
      userId: user._id,
      type: 'withdrawal',
      amount: -amount,
      description: `Withdrawal via ${paymentMethod}`,
      status: 'pending',
      balanceBefore,
      balanceAfter: user.walletBalance,
      referenceId: `WTH_${Date.now()}`
    }).save();

    res.json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      walletBalance: user.walletBalance,
      transactionId: transaction.referenceId,
      estimatedTime: '24-48 hours'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get transaction history
const getTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const type = req.query.type; // Optional filter by type
    const skip = (page - 1) * limit;

    const filter = { userId: req.user._id };
    if (type) {
      filter.type = type;
    }

    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('gameId', 'periodNumber');

    const total = await Transaction.countDocuments(filter);

    res.json({ 
      success: true, 
      transactions: transactions.map(txn => ({
        id: txn._id,
        type: txn.type,
        amount: txn.amount,
        description: txn.description,
        status: txn.status,
        balanceBefore: txn.balanceBefore,
        balanceAfter: txn.balanceAfter,
        referenceId: txn.referenceId,
        gameId: txn.gameId?._id,
        periodNumber: txn.gameId?.periodNumber,
        timestamp: txn.createdAt
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalTransactions: total,
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

// Claim daily bonus
const claimDailyBonus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if bonus already claimed today
    if (user.lastBonusDate && user.lastBonusDate >= today) {
      return res.status(400).json({
        success: false,
        error: 'Daily bonus already claimed today'
      });
    }

    // Calculate bonus amount based on streak
    let bonusAmount = 50; // Day 1
    if (user.dailyBonusStreak === 1) bonusAmount = 100; // Day 2
    if (user.dailyBonusStreak >= 2) bonusAmount = 200; // Day 3+

    // Check if streak should continue
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (!user.lastBonusDate || user.lastBonusDate < yesterday) {
      // Reset streak if missed a day
      user.dailyBonusStreak = 0;
      bonusAmount = 50;
    }

    // Update user
    const balanceBefore = user.walletBalance;
    user.walletBalance += bonusAmount;
    user.dailyBonusStreak += 1;
    user.lastBonusDate = today;
    await user.save();

    // Create bonus transaction
    await new Transaction({
      userId: user._id,
      type: 'bonus',
      amount: bonusAmount,
      description: `Daily bonus - Day ${user.dailyBonusStreak}`,
      balanceBefore,
      balanceAfter: user.walletBalance
    }).save();

    res.json({
      success: true,
      message: 'Daily bonus claimed successfully',
      bonusAmount,
      streak: user.dailyBonusStreak,
      walletBalance: user.walletBalance,
      nextBonusAmount: user.dailyBonusStreak === 1 ? 100 : 200
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

module.exports = {
  getBalance,
  deposit,
  withdraw,
  getTransactions,
  claimDailyBonus
};