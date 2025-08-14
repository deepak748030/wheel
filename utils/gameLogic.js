const Game = require('../models/Game');
const Bet = require('../models/Bet');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// Generate winning number (manual or random)
function generateWinningNumber(game) {
  if (game && game.isManuallyControlled && game.manualWinningNumber !== null) {
    return game.manualWinningNumber;
  }
  return Math.floor(Math.random() * 10); // Random 0-9
}

// Process game completion and calculate winnings
async function processGameCompletion(gameId, io) {
  try {
    const game = await Game.findById(gameId);
    if (!game || game.status !== 'spinning') return;

    const winningNumber = generateWinningNumber(game);
    
    // Update game with result
    game.winningNumber = winningNumber;
    game.status = 'completed';
    
    // Get all bets for this game
    const bets = await Bet.find({ gameId: game._id }).populate('userId');
    
    let totalWinAmount = 0;
    let winnersCount = 0;
    
    // Process each bet
    for (const bet of bets) {
      const isWin = bet.betNumber === winningNumber;
      
      if (isWin) {
        const winAmount = bet.betAmount * 4; // 4x multiplier
        totalWinAmount += winAmount;
        winnersCount++;
        
        // Update bet record
        bet.isWin = true;
        bet.winAmount = winAmount;
        bet.status = 'won';
        await bet.save();

        // Update user balance
        const user = await User.findById(bet.userId._id);
        const balanceBefore = user.walletBalance;
        user.walletBalance += winAmount;
        user.totalEarnings += winAmount;
        await user.save();

        // Create win transaction
        await new Transaction({
          userId: user._id,
          type: 'win',
          amount: winAmount,
          description: `Win from Game #${game.periodNumber} - Number ${winningNumber} (4x)`,
          gameId: game._id,
          balanceBefore,
          balanceAfter: user.walletBalance
        }).save();
      } else {
        // Update losing bet
        bet.status = 'lost';
        await bet.save();
      }
    }

    // Update game statistics
    game.totalWinAmount = totalWinAmount;
    game.winnersCount = winnersCount;
    await game.save();

    // Emit game result to all connected users
    io.emit('gameResult', {
      gameId: game._id,
      periodNumber: game.periodNumber,
      winningNumber,
      totalBets: game.totalBets,
      totalAmount: game.totalAmount,
      totalWinAmount,
      winnersCount,
      isManuallyControlled: game.isManuallyControlled,
      timestamp: new Date()
    });

    console.log(`Game #${game.periodNumber} completed - Winning Number: ${winningNumber}, Winners: ${winnersCount}, Total Win Amount: ₹${totalWinAmount}`);

    // Start new game after 2 seconds
    setTimeout(() => {
      startNewGame(io);
    }, 2000);

  } catch (error) {
    console.error('Error processing game completion:', error);
  }
}

// Start a new game
async function startNewGame(io) {
  try {
    // Get last game period number
    const lastGame = await Game.findOne().sort({ periodNumber: -1 });
    const periodNumber = lastGame ? lastGame.periodNumber + 1 : 1001;

    // Create new game
    const game = new Game({
      periodNumber,
      winningNumber: 0, // Will be set when game completes
      spinStartTime: new Date(),
      spinEndTime: new Date(Date.now() + 20000), // 20 seconds for betting
      status: 'waiting'
    });

    await game.save();

    // Emit new game to all connected users
    io.emit('newGame', {
      gameId: game._id,
      periodNumber: game.periodNumber,
      spinEndTime: game.spinEndTime,
      bettingTimeRemaining: 20
    });

    console.log(`New Game #${game.periodNumber} started - Betting phase (20 seconds)`);

    // After 20 seconds, start spinning phase
    setTimeout(async () => {
      game.status = 'spinning';
      await game.save();
      
      io.emit('gameSpinning', { 
        gameId: game._id,
        periodNumber: game.periodNumber
      });
      
      console.log(`Game #${game.periodNumber} spinning phase started (3 seconds)`);
      
      // After 3 seconds of spinning, complete the game
      setTimeout(() => {
        processGameCompletion(game._id, io);
      }, 3000);
    }, 20000);

  } catch (error) {
    console.error('Error starting new game:', error);
  }
}

// Manual control functions
async function setManualWinningNumber(gameId, winningNumber) {
  try {
    const game = await Game.findById(gameId);
    if (!game || game.status !== 'waiting') {
      throw new Error('Game not found or not in waiting state');
    }

    game.isManuallyControlled = true;
    game.manualWinningNumber = winningNumber;
    await game.save();

    return game;
  } catch (error) {
    throw error;
  }
}

async function removeManualControl(gameId) {
  try {
    const game = await Game.findById(gameId);
    if (!game) {
      throw new Error('Game not found');
    }

    game.isManuallyControlled = false;
    game.manualWinningNumber = null;
    await game.save();

    return game;
  } catch (error) {
    throw error;
  }
}

module.exports = {
  generateWinningNumber,
  processGameCompletion,
  startNewGame,
  setManualWinningNumber,
  removeManualControl
};