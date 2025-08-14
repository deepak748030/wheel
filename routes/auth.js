const express = require('express');
const { body, validationResult } = require('express-validator');
const { register, login, getProfile } = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Validation middleware
const validateRegistration = [
  body('playerName')
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('Player name must be between 3-20 characters'),
  body('mobileNumber')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Invalid mobile number format'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
];

const validateLogin = [
  body('mobileNumber')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Invalid mobile number format'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

// Handle validation errors
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
router.post('/register', validateRegistration, handleValidationErrors, register);
router.post('/login', validateLogin, handleValidationErrors, login);
router.get('/profile', auth, getProfile);

module.exports = router;