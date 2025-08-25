const mongoose = require('mongoose');

// Tracks which users voted on which joke message
const VoterSchema = new mongoose.Schema({
  jokeMessageId: { type: String, required: true },
  userId: { type: String, required: true },
}, {
  timestamps: true,
});

// Enforce one vote per user per joke
VoterSchema.index({ jokeMessageId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Voter', VoterSchema);
