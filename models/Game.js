const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  periodNumber: {
    type: Number,
    required: true,
    unique: true
  },
  winningNumber: {
    type: Number,
    required: true,
    min: 0,
    max: 9
  },
  spinStartTime: {
    type: Date,
    required: true
  },
  spinEndTime: {
    type: Date,
    required: true
  },
  totalBets: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    default: 0
  },
  totalWinAmount: {
    type: Number,
    default: 0
  },
  winnersCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['waiting', 'spinning', 'completed'],
    default: 'waiting'
  },
  isManuallyControlled: {
    type: Boolean,
    default: false
  },
  manualWinningNumber: {
    type: Number,
    min: 0,
    max: 9,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Game', gameSchema);