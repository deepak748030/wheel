const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// Register new user
const register = async (req, res) => {
  try {
    const { playerName, mobileNumber, password, referralCode } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ mobileNumber });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: 'Mobile number already registered' 
      });
    }

    // Create new user
    const user = new User({ playerName, mobileNumber, password });
    
    // Handle referral if provided
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer) {
        user.referredBy = referrer._id;
        
        // Give referral bonus to referrer
        referrer.walletBalance += 30;
        referrer.totalReferrals += 1;
        referrer.totalEarnings += 30;
        await referrer.save();
        
        // Create referral transaction for referrer
        await new Transaction({
          userId: referrer._id,
          type: 'referral',
          amount: 30,
          description: `Referral bonus for ${playerName}`,
          balanceBefore: referrer.walletBalance - 30,
          balanceAfter: referrer.walletBalance
        }).save();
      }
    }
    
    await user.save();

    // Give welcome bonus
    const welcomeBonus = 100;
    user.walletBalance += welcomeBonus;
    await user.save();

    // Create welcome bonus transaction
    await new Transaction({
      userId: user._id,
      type: 'bonus',
      amount: welcomeBonus,
      description: 'Welcome bonus',
      balanceBefore: 0,
      balanceAfter: welcomeBonus
    }).save();

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: {
        id: user._id,
        playerName: user.playerName,
        mobileNumber: user.mobileNumber,
        walletBalance: user.walletBalance,
        referralCode: user.referralCode
      }
    });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { mobileNumber, password } = req.body;

    const user = await User.findOne({ mobileNumber });
    if (!user || !await user.comparePassword(password)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }

    if (!user.isActive) {
      return res.status(400).json({ 
        success: false, 
        error: 'Account is deactivated' 
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        playerName: user.playerName,
        mobileNumber: user.mobileNumber,
        walletBalance: user.walletBalance,
        referralCode: user.referralCode,
        totalEarnings: user.totalEarnings,
        totalReferrals: user.totalReferrals
      }
    });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get user profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json({
      success: true,
      user: {
        id: user._id,
        playerName: user.playerName,
        mobileNumber: user.mobileNumber,
        walletBalance: user.walletBalance,
        referralCode: user.referralCode,
        totalEarnings: user.totalEarnings,
        totalReferrals: user.totalReferrals,
        dailyBonusStreak: user.dailyBonusStreak,
        lastBonusDate: user.lastBonusDate
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

module.exports = { register, login, getProfile };