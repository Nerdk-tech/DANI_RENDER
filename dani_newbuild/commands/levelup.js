const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

const LEVELS_FILE = path.join(__dirname, '../data/levels.json');

function loadLevels() {
  try { return JSON.parse(fs.readFileSync(LEVELS_FILE, 'utf8')); }
  catch { return {}; }
}

function saveLevels(data) {
  fs.mkdirSync(path.dirname(LEVELS_FILE), { recursive: true });
  fs.writeFileSync(LEVELS_FILE, JSON.stringify(data, null, 2));
}

function calcLevel(xp) {
  return Math.floor(0.1 * Math.sqrt(xp));
}

function xpForLevel(level) {
  return Math.pow(level / 0.1, 2);
}

function addXP(userId, amount = 10) {
  const levels = loadLevels();
  if (!levels[userId]) levels[userId] = { xp: 0, level: 0, messages: 0, name: '' };
  levels[userId].xp       += amount;
  levels[userId].messages += 1;
  const newLevel = calcLevel(levels[userId].xp);
  const leveledUp = newLevel > levels[userId].level;
  levels[userId].level = newLevel;
  saveLevels(levels);
  return { ...levels[userId], leveledUp };
}

function getProfile(userId) {
  const levels = loadLevels();
  return levels[userId] || { xp: 0, level: 0, messages: 0 };
}

function getLeaderboard(limit = 10) {
  const levels = loadLevels();
  return Object.entries(levels)
    .sort(([,a],[,b]) => b.xp - a.xp)
    .slice(0, limit)
    .map(([id, data], i) => ({ rank: i+1, id, ...data }));
}

// Generate a simple rank card as text (no canvas needed)
function buildRankCard(name, profile, rank) {
  const level    = profile.level;
  const xp       = profile.xp;
  const nextXP   = Math.floor(xpForLevel(level + 1));
  const progress = Math.min(Math.round((xp / nextXP) * 20), 20);
  const bar      = '█'.repeat(progress) + '░'.repeat(20 - progress);
  const pct      = Math.round((xp / nextXP) * 100);

  return (
    `╔══════════════════════╗\n` +
    `║  ⚡ *RANK CARD*       ║\n` +
    `╚══════════════════════╝\n\n` +
    `👤 *${name}*\n` +
    `🏅 Rank: *#${rank}*\n` +
    `⭐ Level: *${level}*\n` +
    `💬 Messages: *${profile.messages}*\n` +
    `✨ XP: *${xp.toLocaleString()}* / ${nextXP.toLocaleString()}\n\n` +
    `${bar}\n` +
    `_${pct}% to Level ${level + 1}_`
  );
}

async function levelupCommand(sock, chatId, message, arg, senderNum, senderName) {
  const lower = (arg || '').toLowerCase().trim();
  const userId = senderNum;

  // Show leaderboard
  if (lower === 'top' || lower === 'leaderboard' || lower === 'lb') {
    const lb    = getLeaderboard(10);
    const levels = loadLevels();
    const lines  = lb.map((entry, i) => {
      const medal = ['🥇','🥈','🥉'][i] || `${i+1}.`;
      const name  = entry.name || entry.id.slice(-6);
      return `${medal} *${name}* — Lvl ${entry.level} | ${entry.xp.toLocaleString()} XP`;
    }).join('\n');

    return sock.sendMessage(chatId, {
      text: `*⚡ Dani Leaderboard*\n\n${lines || 'No data yet. Start chatting to earn XP!'}`
    }, { quoted: message });
  }

  // Show profile of a specific user or self
  const profile = getProfile(userId);
  const levels  = loadLevels();

  // Update name
  if (senderName && levels[userId]) {
    levels[userId].name = senderName;
    saveLevels(levels);
  }

  // Calculate rank
  const allUsers = Object.entries(loadLevels()).sort(([,a],[,b]) => b.xp - a.xp);
  const rank     = allUsers.findIndex(([id]) => id === userId) + 1;

  const card = buildRankCard(senderName || userId.slice(-6), profile, rank || '?');

  // Try to get and send profile pic
  try {
    const ppUrl = await sock.profilePictureUrl(senderNum + '@s.whatsapp.net', 'image').catch(() => null);
    if (ppUrl) {
      return sock.sendMessage(chatId, {
        image:   { url: ppUrl },
        caption: card,
      }, { quoted: message });
    }
  } catch {}

  // No profile pic — text only
  return sock.sendMessage(chatId, { text: card }, { quoted: message });
}

// XP tracker — call this from main.js on every message
function trackXP(userId, name) {
  const result = addXP(userId, Math.floor(Math.random() * 5) + 5); // 5-10 XP per message
  const levels = loadLevels();
  if (levels[userId] && name) { levels[userId].name = name; saveLevels(levels); }
  return result;
}

module.exports = { levelupCommand, trackXP };
