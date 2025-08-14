const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const walletRoutes = require('./routes/wallet');
const adminRoutes = require('./routes/admin');

// Import utilities
const { startNewGame } = require('./utils/gameLogic');

// Import models
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Store io instance in app for access in routes
app.set('io', io);

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Connected to MongoDB');
  initializeApp();
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error);
  process.exit(1);
});

// Middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "Admin-Secret"],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use(limiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    success: true,
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Get current wheel status (public endpoint)
app.get('/api/wheel/current', async (req, res) => {
  try {
    const Game = require('./models/Game');
    const currentGame = await Game.findOne({ 
      status: { $in: ['waiting', 'spinning'] } 
    }).sort({ createdAt: -1 });
    
    if (!currentGame) {
      return res.json({ 
        success: true, 
        message: 'No active game',
        currentNumber: null,
        periodNumber: null,
        status: 'no_game'
      });
    }

    const timeRemaining = Math.max(0, Math.floor((currentGame.spinEndTime - new Date()) / 1000));

    res.json({
      success: true,
      currentNumber: currentGame.status === 'completed' ? currentGame.winningNumber : 'TBD',
      periodNumber: currentGame.periodNumber,
      status: currentGame.status,
      timeRemaining,
      spinEndTime: currentGame.spinEndTime,
      isManuallyControlled: currentGame.isManuallyControlled,
      manualWinningNumber: currentGame.manualWinningNumber
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  // Join game room
  socket.on('joinGame', (data) => {
    socket.join('gameRoom');
    console.log(`🎮 User ${socket.id} joined game room`);
    
    // Send current game status to newly connected user
    socket.emit('connectionConfirmed', {
      message: 'Connected to game server',
      timestamp: new Date()
    });
  });

  // Handle user authentication via socket
  socket.on('authenticate', async (data) => {
    try {
      const { token } = data;
      if (token) {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        
        if (user) {
          socket.userId = user._id;
          socket.playerName = user.playerName;
          console.log(`🔐 User authenticated: ${user.playerName} (${socket.id})`);
        }
      }
    } catch (error) {
      console.log(`❌ Authentication failed for socket ${socket.id}`);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${socket.id}`);
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error(`❌ Socket error for ${socket.id}:`, error);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// Handle 404 routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Initialize application
async function initializeApp() {
  try {
    // Create default admin user if doesn't exist
    const defaultUser = await User.findOne({ mobileNumber: '7489301982' });
    if (!defaultUser) {
      const user = new User({
        playerName: 'Admin User',
        mobileNumber: '7489301982',
        password: '123456',
        walletBalance: 10000
      });
      await user.save();
      console.log('👤 Default user created: 7489301982 / 123456');
    }
    
    // Start the first game
    console.log('🎮 Starting initial game...');
    startNewGame(io);
    
    // Start server
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🎯 Current wheel: http://localhost:${PORT}/api/wheel/current`);
      console.log(`🎮 Game ready for connections!`);
    });
  } catch (error) {
    console.error('❌ Failed to initialize app:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
    mongoose.connection.close();
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
    mongoose.connection.close();
  });
});