const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  userName: String,
  jokes: [String], // messageIds associated with the user
  points: { type: Number, default: 0 },
  rank: { type: String, default: "Bronze" },
});

module.exports = mongoose.model("User", UserSchema);
