const express = require('express');
const { body, validationResult } = require('express-validator');
const { adminAuth } = require('../middleware/auth');
const { setManualWinningNumber, removeManualControl } = require('../utils/gameLogic');
const Game = require('../models/Game');
const router = express.Router();

// Set manual winning number
router.post('/set-winning-number', adminAuth, async (req, res) => {
  try {
    const { winningNumber } = req.body;
    
    if (winningNumber < 0 || winningNumber > 9) {
      return res.status(400).json({ 
        success: false, 
        error: 'Winning number must be between 0-9' 
      });
    }

    // Get current waiting game
    const currentGame = await Game.findOne({ status: 'waiting' })
      .sort({ createdAt: -1 });
    
    if (!currentGame) {
      return res.status(404).json({ 
        success: false, 
        error: 'No active game found' 
      });
    }

    const updatedGame = await setManualWinningNumber(currentGame._id, winningNumber);

    // Emit manual control notification
    req.app.get('io').emit('manualControl', {
      gameId: updatedGame._id,
      periodNumber: updatedGame.periodNumber,
      manualWinningNumber: winningNumber,
      isManuallyControlled: true
    });

    res.json({
      success: true,
      message: `Winning number ${winningNumber} set for Game #${updatedGame.periodNumber}`,
      game: {
        id: updatedGame._id,
        periodNumber: updatedGame.periodNumber,
        isManuallyControlled: updatedGame.isManuallyControlled,
        manualWinningNumber: updatedGame.manualWinningNumber
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Remove manual control
router.post('/remove-manual-control', adminAuth, async (req, res) => {
  try {
    const currentGame = await Game.findOne({ status: 'waiting' })
      .sort({ createdAt: -1 });
    
    if (!currentGame) {
      return res.status(404).json({ 
        success: false, 
        error: 'No active game found' 
      });
    }

    const updatedGame = await removeManualControl(currentGame._id);

    // Emit manual control removal notification
    req.app.get('io').emit('manualControl', {
      gameId: updatedGame._id,
      periodNumber: updatedGame.periodNumber,
      isManuallyControlled: false
    });

    res.json({
      success: true,
      message: `Manual control removed for Game #${updatedGame.periodNumber}. Will be random.`,
      game: {
        id: updatedGame._id,
        periodNumber: updatedGame.periodNumber,
        isManuallyControlled: updatedGame.isManuallyControlled
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get current game status (admin view)
router.get('/current-game', adminAuth, async (req, res) => {
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

    // Get bet statistics
    const Bet = require('../models/Bet');
    const betStats = await Bet.aggregate([
      { $match: { gameId: currentGame._id } },
      {
        $group: {
          _id: '$betNumber',
          count: { $sum: 1 },
          totalAmount: { $sum: '$betAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      game: currentGame,
      betStatistics: betStats,
      timeRemaining: Math.max(0, Math.floor((currentGame.spinEndTime - new Date()) / 1000))
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;