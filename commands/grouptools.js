const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/group_settings.json');

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return {}; }
}
function saveSettings(s) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(s, null, 2));
}
function getGroup(groupId) {
  const s = loadSettings();
  return s[groupId] || { antihijack: false, antilink: false, welcome: true, goodbye: true };
}
function setGroup(groupId, key, val) {
  const s = loadSettings();
  if (!s[groupId]) s[groupId] = { antihijack: false, antilink: false, welcome: true, goodbye: true };
  s[groupId][key] = val;
  saveSettings(s);
}

// ── Anti-hijack detection ─────────────────────────────────────────────────────
// Suspicious patterns: mass admin promotion, desc change, group settings change by non-owner
async function checkAntiHijack(sock, update) {
  try {
    const { id: groupId, participants, action } = update;
    const settings = getGroup(groupId);
    if (!settings.antihijack) return;

    // If someone is promoting multiple people to admin rapidly — suspicious
    if (action === 'promote' && participants.length >= 3) {
      const botJid = sock.user?.id;
      // Warn the group
      await sock.sendMessage(groupId, {
        text: `⚠️ *Anti-Hijack Alert*\n\n${participants.length} members were promoted to admin at once. This is a common hijack pattern.\n\nIf you didn't do this, *remove those admins immediately* and secure your group.`
      });
    }
  } catch {}
}

// ── Welcome/goodbye ───────────────────────────────────────────────────────────
async function handleWelcome(sock, update) {
  const { id: groupId, participants, action } = update;
  const settings = getGroup(groupId);

  if (action === 'add' && settings.welcome) {
    for (const jid of participants) {
      const num = jid.split('@')[0];
      await sock.sendMessage(groupId, {
        text: `Welcome @${num} to the group! 👋\n\nSay _dani menu_ to see what I can do.`,
        mentions: [jid]
      });
    }
  }

  if (action === 'remove' && settings.goodbye) {
    for (const jid of participants) {
      const num = jid.split('@')[0];
      await sock.sendMessage(groupId, { text: `@${num} has left the group.`, mentions: [jid] });
    }
  }
}

// ── Anti-link ─────────────────────────────────────────────────────────────────
const LINK_REGEX = /(https?:\/\/|wa\.me|whatsapp\.com\/invite|bit\.ly|t\.me)/i;

async function checkAntiLink(sock, m, groupId) {
  const settings = getGroup(groupId);
  if (!settings.antilink) return false;

  const text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
  if (!LINK_REGEX.test(text)) return false;

  // Check if bot is admin before deleting
  try {
    const meta    = await sock.groupMetadata(groupId);
    const botJid  = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
    const botData = meta.participants.find(p => p.id === botJid);
    if (!botData?.admin) return false;

    await sock.sendMessage(groupId, { delete: m.key });
    await sock.sendMessage(groupId, {
      text: `@${m.key.participant?.split('@')[0]} links are not allowed here.`,
      mentions: [m.key.participant]
    });
    return true;
  } catch { return false; }
}

// ── Tag all ───────────────────────────────────────────────────────────────────
async function tagAll(sock, chatId, message, msg) {
  try {
    const meta    = await sock.groupMetadata(chatId);
    const members = meta.participants.map(p => p.id);
    const text    = msg || `Everyone, attention!`;
    const mentions = members.map(jid => `@${jid.split('@')[0]}`).join(' ');
    await sock.sendMessage(chatId, {
      text: `${text}\n\n${mentions}`,
      mentions: members
    }, { quoted: message });
  } catch {
    await sock.sendMessage(chatId, { text: `Couldn't tag everyone. Make sure I'm an admin.` }, { quoted: message });
  }
}

// ── Group command handler ──────────────────────────────────────────────────────
async function groupCommand(sock, chatId, message, arg) {
  const lower = (arg || '').toLowerCase().trim();

  if (lower === 'antihijack on') {
    setGroup(chatId, 'antihijack', true);
    return sock.sendMessage(chatId, {
      text: `*Anti-hijack protection ON.*\n\nI'll monitor for suspicious admin changes and warn the group immediately. Make sure I'm an admin.`
    }, { quoted: message });
  }
  if (lower === 'antihijack off') {
    setGroup(chatId, 'antihijack', false);
    return sock.sendMessage(chatId, { text: `Anti-hijack protection off.` }, { quoted: message });
  }
  if (lower === 'antilink on') {
    setGroup(chatId, 'antilink', true);
    return sock.sendMessage(chatId, { text: `*Anti-link ON.* I'll delete any links posted. Make sure I'm an admin.` }, { quoted: message });
  }
  if (lower === 'antilink off') {
    setGroup(chatId, 'antilink', false);
    return sock.sendMessage(chatId, { text: `Anti-link off.` }, { quoted: message });
  }
  if (lower === 'welcome off') { setGroup(chatId, 'welcome', false); return sock.sendMessage(chatId, { text: `Welcome messages off.` }, { quoted: message }); }
  if (lower === 'welcome on')  { setGroup(chatId, 'welcome', true);  return sock.sendMessage(chatId, { text: `Welcome messages on.` }, { quoted: message }); }
  if (lower === 'goodbye off') { setGroup(chatId, 'goodbye', false); return sock.sendMessage(chatId, { text: `Goodbye messages off.` }, { quoted: message }); }
  if (lower === 'goodbye on')  { setGroup(chatId, 'goodbye', true);  return sock.sendMessage(chatId, { text: `Goodbye messages on.` }, { quoted: message }); }

  // Status
  const g = getGroup(chatId);
  return sock.sendMessage(chatId, {
    text: `*Group Settings*\n\n*Anti-hijack:* _${g.antihijack ? 'on' : 'off'}_\n*Anti-link:* _${g.antilink ? 'on' : 'off'}_\n*Welcome:* _${g.welcome ? 'on' : 'off'}_\n*Goodbye:* _${g.goodbye ? 'on' : 'off'}_\n\nCommands:\ndani group antihijack on/off\ndani group antilink on/off\ndani group welcome on/off\ndani group goodbye on/off`
  }, { quoted: message });
}

module.exports = { groupCommand, checkAntiHijack, handleWelcome, checkAntiLink, tagAll, getGroup };
