const mongoose = require("mongoose");

const JokeSchema = new mongoose.Schema({
  user: String,
  userId: String,
  messageId: String,
  content: String,
  points: { type: Number, default: 0 },
});



module.exports = mongoose.model("Joke", JokeSchema);
