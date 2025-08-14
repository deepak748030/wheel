const express = require('express');
const { body, validationResult } = require('express-validator');
const { 
  getBalance, 
  deposit, 
  withdraw, 
  getTransactions,
  claimDailyBonus 
} = require('../controllers/walletController');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Validation middleware
const validateDeposit = [
  body('amount')
    .isFloat({ min: 1, max: 100000 })
    .withMessage('Amount must be between ₹1 and ₹100,000'),
  body('paymentMethod')
    .notEmpty()
    .withMessage('Payment method is required'),
];

const validateWithdraw = [
  body('amount')
    .isFloat({ min: 100 })
    .withMessage('Minimum withdrawal amount is ₹100'),
  body('paymentMethod')
    .notEmpty()
    .withMessage('Payment method is required'),
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
router.get('/balance', auth, getBalance);
router.post('/deposit', auth, validateDeposit, handleValidationErrors, deposit);
router.post('/withdraw', auth, validateWithdraw, handleValidationErrors, withdraw);
router.get('/transactions', auth, getTransactions);
router.post('/daily-bonus', auth, claimDailyBonus);

module.exports = router;