const mongoose = require('mongoose');

const betSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  gameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true
  },
  betNumber: {
    type: Number,
    required: true,
    min: 0,
    max: 9
  },
  betAmount: {
    type: Number,
    required: true,
    min: 10,
    max: 50000
  },
  multiplier: {
    type: Number,
    default: 4
  },
  winAmount: {
    type: Number,
    default: 0
  },
  isWin: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['placed', 'won', 'lost'],
    default: 'placed'
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
betSchema.index({ userId: 1, gameId: 1 });
betSchema.index({ gameId: 1, betNumber: 1 });

module.exports = mongoose.model('Bet', betSchema);