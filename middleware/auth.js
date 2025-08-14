const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Access denied. No token provided.' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token or user inactive.' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ 
      success: false, 
      error: 'Invalid token.' 
    });
  }
};

// Admin middleware for manual control
const adminAuth = async (req, res, next) => {
  try {
    const adminSecret = req.header('Admin-Secret');
    
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access denied.' 
      });
    }

    next();
  } catch (error) {
    res.status(403).json({ 
      success: false, 
      error: 'Admin authentication failed.' 
    });
  }
};

module.exports = { auth, adminAuth };