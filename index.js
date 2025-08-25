// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const mongoose = require('mongoose');
const Joke = require('./models/Joke');
const User = require('./models/User');
const Voter = require('./models/voters');
const { calculateRank } = require('./utils/rankUtils');

// Reaction-to-points mapping
const reactionPoints = {
  '😂': 40,
  '1_Hentai': 50,
  'dp': 10,
  'ME': 15,
  'boss': 30,
  'kodak': -20,
  '🤓': -10,
  'mikejak': 3,
  '😒': -15,
};

// Rank tiers for promotion/demotion logic
const rankHierarchy = [
  'Bronze',
  'Silver',
  'Gold',
  'Platinum',
  'Diamond',
  'Ascendant',
  'Grandmaster',
];

// List of available commands
const commandsList = [
  { cmd: '!rankjoke [points]', desc: 'Reply to a joke message to add or deduct points (±100 max).' },
  { cmd: '!leaderboard', desc: 'Show the top 5 users by total points.' },
  { cmd: '!randomJoke', desc: 'Fetch a random stored joke.' },
  { cmd: '!myrank', desc: 'Show your personal total points and rank.' },
  { cmd: '!bestjoke', desc: 'Display the highest scoring joke.' },
  { cmd: '!commands', desc: 'List all available commands.' },
];

// Create client with partials for reaction events
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));

// Helper to apply points (common for commands & reactions)
async function applyPoints(jokeMessageId, originalAuthor, points, channel) {
  // update vote record
  try {
    await Voter.create({ jokeMessageId, userId: originalAuthor.id });
  } catch (e) {
    // already voted or duplicate, skip
  }

  // update joke doc
  await Joke.findOneAndUpdate(
    { messageId: jokeMessageId },
    {
      $setOnInsert: {
        user: originalAuthor.username,
        userId: originalAuthor.id,
        content: originalAuthor.content || originalAuthor.username,
      },
      $inc: { points },
    },
    { upsert: true }
  );

  // update user total points
  const userDoc = await User.findOneAndUpdate(
    { userId: originalAuthor.id },
    {
      $setOnInsert: { userName: originalAuthor.username },
      $addToSet: { jokes: jokeMessageId },
      $inc: { points },
    },
    { upsert: true, new: true }
  );

  // promotion/demotion check
  const oldRank = userDoc.rank;
  const newRank = calculateRank(userDoc.points);
  if (newRank !== oldRank) {
    const oldIdx = rankHierarchy.indexOf(oldRank);
    const newIdx = rankHierarchy.indexOf(newRank);
    userDoc.rank = newRank;
    await userDoc.save();
    if (newIdx > oldIdx) {
      channel.send(`🎉 Congratulations <@${originalAuthor.id}>, you've been promoted to ${newRank}!`);
    } else {
      channel.send(`😢 Uh oh, <@${originalAuthor.id}>, you've been demoted to ${newRank}. Keep trying!`);
    }
  }

  // confirmation
  channel.send(
    `Added ${points} point(s) to ${originalAuthor.username}'s joke. They now have ${userDoc.points} total point(s) and are ${userDoc.rank}.`
  );
}

// Handle text commands
client.on('messageCreate', async msg => {
  if (msg.author.bot) return;
  const content = msg.content.trim();
  const prefix = '!rankjoke';

  // commands list
  if (content === '!commands') {
    const lines = commandsList.map(c => `**${c.cmd}**: ${c.desc}`);
    return msg.reply('Available commands:\n' + lines.join('\n'));
  }

  if (content === '!randomJoke') {
    const [random] = await Joke.aggregate([{ $sample: { size: 1 } }]);
    return msg.reply(random ? random.content : 'No jokes stored yet.');
  }

  if (content === '!myrank') {
    const user = await User.findOne({ userId: msg.author.id });
    return msg.reply(
      user
        ? `${msg.author.username}, you have ${user.points} point(s) and your rank is ${user.rank}.`
        : "You don't have any points yet."
    );
  }

  if (content === '!leaderboard') {
    const top = await User.find().sort({ points: -1 }).limit(5);
    if (!top.length) return msg.reply('No users have been ranked yet.');
    const lines = top.map((u, i) => `${i + 1}. ${u.userName} — ${u.points} pts (${u.rank})`);
    return msg.reply('🏆 **Leaderboard** 🏆\n' + lines.join('\n'));
  }

  if (content === '!bestjoke') {
    const best = await Joke.findOne().sort({ points: -1 }).lean();
    return msg.reply(
      best
        ? `😂 Best joke: "${best.content}" by ${best.user} — ${best.points} pt(s).`
        : 'No jokes have been ranked yet.'
    );
  }

  // rankjoke reply command
  if (content.startsWith(prefix) && msg.reference?.messageId) {
    const original = await msg.channel.messages.fetch(msg.reference.messageId);
    if (!original || original.author.bot || original.author.id === msg.author.id) {
      return msg.reply("Can't rank this message.");
    }
    const arg = content.slice(prefix.length).trim().split(/\s+/)[0];
    if (!/^-?\d+$/.test(arg)) return msg.reply(`Invalid points. Usage: ${prefix} [points]`);
    const points = parseInt(arg, 10);
    if (points < -100 || points > 100) return msg.reply('Points must be between -100 and 100.');
    // enforce one vote
    const existing = await Voter.findOne({ jokeMessageId: original.id, userId: msg.author.id });
    if (existing) return msg.reply('You have already ranked this joke.');
    // apply
    await applyPoints(original.id, original.author, points, msg.channel);
  }
});

// Handle reaction-based ranking
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch();
  const emoji = reaction.emoji.name;
  const points = reactionPoints[emoji];
  if (!points) return;
  const msg = reaction.message;
  if (!msg || msg.author.bot) return;
  // enforce one vote per user per joke
  const existing = await Voter.findOne({ jokeMessageId: msg.id, userId: user.id });
  if (existing) return;
  // create voter
  await Voter.create({ jokeMessageId: msg.id, userId: user.id });
  // apply
  await applyPoints(msg.id, msg.author, points, msg.channel);
});

client.login(process.env.DISCORD_TOKEN);