const express = require('express');
const { body, validationResult } = require('express-validator');
const { 
  getCurrentGame, 
  placeBet, 
  getGameHistory, 
  getUserBets,
  getUserStats 
} = require('../controllers/gameController');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Validation middleware
const validateBet = [
  body('betNumber')
    .isInt({ min: 0, max: 9 })
    .withMessage('Bet number must be between 0-9'),
  body('betAmount')
    .isFloat({ min: 10, max: 50000 })
    .withMessage('Bet amount must be between ₹10 and ₹50,000'),
];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Routes
router.get('/current', auth, getCurrentGame);
router.post('/bet', auth, validateBet, handleValidationErrors, placeBet);
router.get('/history', auth, getGameHistory);
router.get('/bets', auth, getUserBets);
router.get('/stats', auth, getUserStats);

module.exports = router;