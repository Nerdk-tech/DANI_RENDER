require('dotenv').config();
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const chalk = require('chalk');
const pino = require('pino');
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadContentFromMessage,
} = require('@whiskeysockets/baileys');

const aiCommand        = require('./commands/ai');
const helpCommand      = require('./commands/help');
const playCommand      = require('./commands/music');
const weatherCommand   = require('./commands/weather');
const searchCommand    = require('./commands/search');
const imageCommand     = require('./commands/image');
const imageEditCommand = require('./commands/imageEdit');
const sttCommand       = require('./commands/stt');
const ttsCommand       = require('./commands/tts');
const setprefixCommand = require('./commands/setprefix');
const noprefixCommand  = require('./commands/noprefix');
const settingsCommand  = require('./commands/settings');
const terminalCommand  = require('./commands/terminal');
const pingCommand      = require('./commands/ping');
const vcfCommand       = require('./commands/vcf');
const reviewCommand    = require('./commands/review');
const videoCommand     = require('./commands/video');
const roleplayCommand  = require('./commands/roleplay');
const gamesCommand     = require('./commands/games');
const { groupCommand, checkAntiHijack, handleWelcome, checkAntiLink, tagAll, getGroup } = require('./commands/grouptools');
const otpCommand       = require('./commands/otp');
const lyricsCommand    = require('./commands/lyrics');
const tiktokCommand    = require('./commands/tiktok');
const { levelupCommand, trackXP } = require('./commands/levelup');
const { getState, getPrefix } = require('./lib/prefixStore');
const { startServer }         = require('./server');

// Known master numbers
const MASTER_NUMBERS = ['2349120185747', '2347054943196'];

const BOT_NAME    = process.env.BOT_NAME || 'Dani';

// Shared state — server.js reads this to report live status
const sharedState = {
  waConnected: false,
  startedAt:   Date.now(),
};
const SESSION_DIR = path.join(__dirname, 'session');

// Simple phone validation — must be 7–15 digits (E.164 range)
function isValidPhone(num) {
  return /^\d{7,15}$/.test(num);
}

// readline helper
function question(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

// media helpers
async function downloadMediaBuffer(message) {
  const m   = message.message;
  const msg = m?.audioMessage || m?.documentMessage || m?.imageMessage || m?.videoMessage;
  if (!msg) return null;
  const kind   = msg.mimetype?.startsWith('audio') ? 'audio'
               : msg.mimetype?.startsWith('image') ? 'image' : 'video';
  const stream = await downloadContentFromMessage(msg, kind);
  let buf = Buffer.alloc(0);
  for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
  return buf;
}

function quotedImageBuffer(message) {
  // Returns the raw image URL from the quoted message
  // imageEdit.js will download and re-upload it if the URL is not directly accessible
  const q   = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const img = q?.imageMessage;
  if (!img) return null;
  // Prefer the direct media URL; jpegThumbnail is base64 not a URL so skip it
  return img.url || null;
}

// main bot
async function start(phoneNumber) {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version }          = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys,
        pino({ level: 'fatal' }).child({ level: 'fatal' })
      ),
    },
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    defaultQueryTimeoutMs: 60000,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
  });

  // XeonBotInc-style: wait 3s then request pairing code
  if (!sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        let code = await sock.requestPairingCode(phoneNumber);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        console.log('\n' + chalk.bgGreen(chalk.black('  Your Pairing Code : ')) + ' ' + chalk.bold(chalk.white(code)));
        console.log(chalk.yellow('\nTo link your WhatsApp:'));
        console.log(chalk.yellow('  1. Open WhatsApp on your phone'));
        console.log(chalk.yellow('  2. Settings → Linked Devices'));
        console.log(chalk.yellow('  3. Tap "Link a Device"'));
        console.log(chalk.yellow('  4. Select "Link with phone number" and enter the code above\n'));
      } catch (err) {
        console.error(chalk.red('\n❌ Failed to get pairing code:'), err.message || err);
        console.log(chalk.red('Check your number and try again.\n'));
      }
    }, 3000);
  }

  sock.ev.on('creds.update', saveCreds);

  // ── Group events: welcome/goodbye/anti-hijack ────────────────────────────
  sock.ev.on('group-participants.update', async (update) => {
    await handleWelcome(sock, update);
    await checkAntiHijack(sock, update);
  });

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      sharedState.waConnected = true;
      console.log(chalk.green(`\n✅ ${BOT_NAME} is now connected to WhatsApp!\n`));
    }
    if (connection === 'close') {
      const code   = lastDisconnect?.error?.output?.statusCode;
      sharedState.waConnected = false;
      const reason = lastDisconnect?.error?.message || 'unknown';
      if (code === DisconnectReason.loggedOut) {
        console.log(chalk.red('❌ Logged out. Delete the session folder and restart.'));
      } else {
        console.log(chalk.yellow(`⚠️  Disconnected (${code}: ${reason}). Reconnecting in 3s…`));
        setTimeout(() => start(phoneNumber), 3000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m?.message || m.key.fromMe) return;

    const chatId      = m.key.remoteJid;
    const isGroup     = chatId.endsWith('@g.us');
    const senderJid   = m.key.participant || m.key.remoteJid || '';
    const senderNum   = senderJid.replace(/[^0-9]/g, '');
    const isMaster    = MASTER_NUMBERS.includes(senderNum);

    const raw = m.message.conversation
             || m.message.extendedTextMessage?.text
             || m.message.imageMessage?.caption
             || m.message.videoMessage?.caption
             || '';
    const text  = raw.trim();
    const lower = text.toLowerCase();
    const prefix = getPrefix();
    const state  = getState();

    // ── XP tracking — every message earns XP ─────────────────────────────────
    if (senderNum) {
      const pushName = m.pushName || '';
      trackXP(senderNum, pushName);
    }

    // ── Check if bot is in offline mode (skip non-masters) ────────────────
    if (state.offline && !isMaster) return;

    // ── Group logic: respond when dani mentioned, replied to, or tagged ───────
    const daniMentioned  = /\bdani\b/i.test(lower);

    // Extract bot's bare number from sock.user.id (format: "27774008317:5@s.whatsapp.net" or "27774008317@s.whatsapp.net")
    const botJid    = sock.user?.id || sock.user?.jid || '';
    const botNumber = botJid.split('@')[0].split(':')[0];

    // Check all possible message types for context info
    const ctxInfo = m.message?.extendedTextMessage?.contextInfo
                 || m.message?.imageMessage?.contextInfo
                 || m.message?.videoMessage?.contextInfo
                 || m.message?.audioMessage?.contextInfo
                 || m.message?.documentMessage?.contextInfo
                 || {};

    // Reply check — participant who sent the quoted message is the bot
    const ctxParticipant  = ctxInfo?.participant || ctxInfo?.remoteJid || '';
    const ctxParticipantNum = ctxParticipant.split('@')[0].split(':')[0];
    const isReplyToDani   = botNumber.length > 5 && ctxParticipantNum === botNumber;

    // Tag check — bot's JID is in mentionedJid list
    const mentionedJids = ctxInfo?.mentionedJid || [];
    const isTagged      = mentionedJids.some(j => {
      const jNum = (j || '').split('@')[0].split(':')[0];
      return jNum === botNumber && botNumber.length > 5;
    });

    if (isGroup && !daniMentioned && !isReplyToDani && !isTagged) {
      // Still run anti-link check even when Dani not mentioned
      await checkAntiLink(sock, m, chatId);
      return;
    }

    // ── Strip leading "dani" trigger from text ─────────────────────────────
    const stripped = text.replace(/^(dani[,!?\s]*)+/i, '').trim();
    const input    = stripped || text;
    const iLower   = input.toLowerCase();

    try {
      // ── Settings ─────────────────────────────────────────────────────────
      if (/^(dani\s+)?settings(\s|$)/i.test(lower)) {
        const arg = lower.replace(/^(dani\s+)?settings\s*/i, '').trim();
        return settingsCommand(sock, chatId, m, arg);
      }

      // ── Prefix commands ───────────────────────────────────────────────────
      if (lower === '.menu' || (prefix && lower === `${prefix}menu`))
        return helpCommand(sock, chatId, m);
      if (prefix && lower.startsWith(`${prefix}setprefix`))
        return setprefixCommand(sock, chatId, m, text.split(/\s+/).slice(1).join(' '));
      if (prefix && lower.startsWith(`${prefix}noprefix`))
        return noprefixCommand(sock, chatId, m);
      if (prefix && lower.startsWith(`${prefix}play`))
        return playCommand(sock, chatId, m, text.slice(prefix.length + 4).trim());
      if (prefix && lower.startsWith(`${prefix}say`))
        return ttsCommand(sock, chatId, m, text.slice(prefix.length + 3).trim());
      if (prefix && lower.startsWith(`${prefix}weather`))
        return weatherCommand(sock, chatId, m, text.slice(prefix.length + 7).trim());
      if (prefix && lower.startsWith(`${prefix}search`))
        return searchCommand(sock, chatId, m, text.slice(prefix.length + 6).trim());
      if (prefix && lower.startsWith(`${prefix}image`))
        return imageCommand(sock, chatId, m, text.slice(prefix.length + 5).trim());
      if (prefix && lower.startsWith(`${prefix}edit`))
        return imageEditCommand(sock, chatId, m, text.slice(prefix.length + 4).trim(), quotedImageBuffer(m));
      if (prefix && lower.startsWith(`${prefix}transcribe`)) {
        // If replying to a voice note
        const quotedAudio = m.message.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage
                         || m.message.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage;
        if (quotedAudio) {
          const fakeMsg = { message: { audioMessage: quotedAudio }, key: m.key };
          const buf = await downloadMediaBuffer(fakeMsg);
          if (buf) return sttCommand(sock, chatId, m, buf);
        }
        const buf = await downloadMediaBuffer(m);
        if (!buf) return sock.sendMessage(chatId, { text: 'Reply to a voice note.' }, { quoted: m });
        return sttCommand(sock, chatId, m, buf);
      }
      if (prefix && (lower.startsWith(`${prefix}ai`) || lower.startsWith(`${prefix}dani`) || lower.startsWith(`${prefix}gpt`)))
        return aiCommand(sock, chatId, m);
      if (prefix && lower.startsWith(`${prefix}run`))
        return terminalCommand(sock, chatId, m, text.slice(prefix.length + 3).trim());

      // ── Ping / endpoint status checker ───────────────────────────────────────
      if (lower.startsWith('.ping') || /^(dani\s+)?ping\b/i.test(lower)) {
        const arg = input.replace(/^(dani\s+)?ping\s*/i, '').replace(/^\.ping\s*/i, '').trim();
        return pingCommand(sock, chatId, m, arg);
      }

      // ── VCF ───────────────────────────────────────────────────────────────
      if (/^(dani\s+)?vcf\b/i.test(lower) || lower.startsWith('.vcf')) {
        const arg = input.replace(/^(dani\s+)?vcf\s*/i, '').replace(/^\.vcf\s*/i, '').trim();
        return vcfCommand(sock, chatId, m, arg, senderNum, isMaster);
      }

      // ── Review file or image ──────────────────────────────────────────────
      if (/^(dani\s+)?review\b/i.test(lower) || lower.startsWith('.review')) {
        const arg = input.replace(/^(dani\s+)?review\s*/i, '').replace(/^\.review\s*/i, '').trim();
        return reviewCommand(sock, chatId, m, arg);
      }

      // ── OTP / Virtual Numbers ─────────────────────────────────────────────
      if (/^(dani\s+)?(otp|number|country|vnum)\b/i.test(lower) || lower.startsWith('.otp') || lower.startsWith('.number')) {
        const arg = input.replace(/^(dani\s+)?(otp|number|country|vnum)\s*/i, '').replace(/^\.(otp|number)\s*/i, '').trim();
        const sub = lower.match(/\b(otp|number|country)\b/i)?.[1] || 'help';
        return otpCommand(sock, chatId, m, sub + (arg ? ' ' + arg : ''));
      }

      // ── Lyrics ────────────────────────────────────────────────────────────
      if (/^(dani\s+)?lyrics\b/i.test(lower) || lower.startsWith('.lyrics')) {
        const q = input.replace(/^(dani\s+)?lyrics\s*/i, '').replace(/^\.lyrics\s*/i, '').trim();
        return lyricsCommand(sock, chatId, m, q);
      }

      // ── Video generation ──────────────────────────────────────────────────
      if (/^(dani\s+)?(video|vidgen|makevideo|generate video)\b/i.test(lower) || lower.startsWith('.video')) {
        const q = input.replace(/^(dani\s+)?(video|vidgen|makevideo|generate video)\s*/i, '').replace(/^\.video\s*/i, '').trim();
        return videoCommand(sock, chatId, m, q);
      }

      // ── Video generation ──────────────────────────────────────────────────
      if (/^(dani\s+)?(make|create|generate)\s+(a\s+)?video\b/i.test(lower) || /^(dani\s+)?video\b/i.test(lower) || lower.startsWith('.video')) {
        const arg = input.replace(/^(make|create|generate)\s+(a\s+)?video\s*/i, '').replace(/^video\s*/i, '').trim();
        return videoCommand(sock, chatId, m, arg);
      }

      // ── Roleplay ──────────────────────────────────────────────────────────
      if (/^(dani\s+)?roleplay\b/i.test(lower) || lower.startsWith('.roleplay')) {
        const arg = input.replace(/^roleplay\s*/i, '').replace(/^\.roleplay\s*/i, '').trim();
        return roleplayCommand(sock, chatId, m, arg);
      }

      // ── Games ─────────────────────────────────────────────────────────────
      if (/^(dani\s+)?(game|games|trivia|riddle|roast)\b/i.test(lower) || lower.startsWith('.game')) {
        const arg = input.replace(/^(game|games)\s*/i, '').replace(/^\.game\s*/i, '').trim();
        return gamesCommand(sock, chatId, m, arg || lower.replace(/^dani\s*/i,''));
      }

      // ── Group tools ───────────────────────────────────────────────────────
      if (/^(dani\s+)?group\b/i.test(lower) || lower.startsWith('.group')) {
        const arg = input.replace(/^group\s*/i, '').replace(/^\.group\s*/i, '').trim();
        return groupCommand(sock, chatId, m, arg);
      }

      // ── Tag all ───────────────────────────────────────────────────────────
      if (/^(dani\s+)?tagall\b/i.test(lower) || lower.startsWith('.tagall')) {
        const arg = input.replace(/^tagall\s*/i, '').trim();
        return tagAll(sock, chatId, m, arg);
      }

      // ── Natural language routing (with or without "dani" prefix) ─────────

      // Menu
      if (/^menu$/i.test(iLower))
        return helpCommand(sock, chatId, m);

      // Settings (natural)
      if (/^settings/i.test(iLower)) {
        const arg = iLower.replace(/^settings\s*/i, '').trim();
        return settingsCommand(sock, chatId, m, arg);
      }

      // Play music
      if (/^play(\s+me)?\s+\S/i.test(iLower)) {
        const q = input.replace(/^play(\s+me)?\s+/i, '').trim();
        return playCommand(sock, chatId, m, q);
      }

      // Create video (natural language)
      if (/^(create|generate|make)(\s+me)?\s+(a\s+)?video\b/i.test(iLower)) {
        const q = input.replace(/^(create|generate|make)(\s+me)?\s+(a\s+)?video(\s+of)?\s*/i, '').trim();
        return videoCommand(sock, chatId, m, q);
      }

      // Create image
      if (/^(create|generate|make)(\s+me)?\s+(an?\s+)?(image|picture|photo)(\s+of)?\s+\S/i.test(iLower)) {
        const q = input.replace(/^(create|generate|make)(\s+me)?\s+(an?\s+)?(image|picture|photo)(\s+of)?\s*/i, '').trim();
        return imageCommand(sock, chatId, m, q);
      }

      // Edit image (when replying to one)
      if (/^(edit|change|modify)(\s+(this\s+)?(image|photo|picture|background))?\b/i.test(iLower) && quotedImageBuffer(m)) {
        const q = input.replace(/^(edit|change|modify)(\s+(this\s+)?(image|photo|picture|background))?\s*/i, '').trim();
        return imageEditCommand(sock, chatId, m, q, quotedImageBuffer(m));
      }

      // Weather
      if (/\b(weather|temperature|forecast|how hot|how cold)\b/i.test(iLower)) {
        const city = input
          .replace(/^(what'?s?\s+the\s+)?(weather|temperature|forecast)(\s+in|\s+for)?\s*/i, '')
          .replace(/^(how\s+(hot|cold)\s+is\s+it\s+(in|at)?)\s*/i, '')
          .trim();
        if (city) return weatherCommand(sock, chatId, m, city);
      }

      // Search
      if (/^(search|find|look up|google)(\s+for)?\s+\S/i.test(iLower)) {
        const q = input.replace(/^(search|find|look up|google)(\s+for)?\s+/i, '').trim();
        return searchCommand(sock, chatId, m, q);
      }

      // Say / TTS — show "recording" presence
      if (/^say\s+\S/i.test(iLower)) {
        const q = input.replace(/^say\s+/i, '').trim();
        await sock.sendPresenceUpdate('recording', chatId);
        return ttsCommand(sock, chatId, m, q);
      }

      // Transcribe (reply to voice note)
      if (/^(transcribe|voice to text|convert( this)? voice)\b/i.test(iLower)) {
        const quotedAudio = m.message.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage
                         || m.message.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage;
        if (quotedAudio) {
          const fakeMsg = { message: { audioMessage: quotedAudio }, key: m.key };
          const buf = await downloadMediaBuffer(fakeMsg);
          if (buf) return sttCommand(sock, chatId, m, buf);
        }
        const buf = await downloadMediaBuffer(m);
        if (!buf) return sock.sendMessage(chatId, { text: 'Reply to a voice note for me to transcribe it.' }, { quoted: m });
        return sttCommand(sock, chatId, m, buf);
      }

      // Terminal commands (natural: "run curl ...", "run ls", etc.)
      if (/^(run|exec|terminal)\s+\S/i.test(iLower)) {
        const cmd = input.replace(/^(run|exec|terminal)\s+/i, '').trim();
        return terminalCommand(sock, chatId, m, cmd);
      }
      // Direct curl / touch / ls also works
      if (/^(curl|touch|ls|pwd|echo|whoami|date|uname)\b/i.test(iLower))
        return terminalCommand(sock, chatId, m, input);

      // ── Fallback: AI chat ─────────────────────────────────────────────────
      return aiCommand(sock, chatId, m);

    } catch (e) {
      await sock.sendMessage(chatId, { text: `Something went wrong. ${e.message || e}` }, { quoted: m });
    }
  });
}

// entry point
(async () => {
  console.log(chalk.bgBlack(chalk.greenBright(`\n  🤖 ${BOT_NAME} WhatsApp Bot  \n`)));

  let phoneNumber = (process.env.PAIR_PHONE_NUMBER || '').replace(/\D/g, '');

  if (phoneNumber.length >= 7) {
    console.log(chalk.green(`📱 Using number from .env: ${phoneNumber}\n`));
  } else {
    phoneNumber = await question(
      chalk.bgBlack(chalk.greenBright(
        `Please type your WhatsApp number 🤖\nFormat: 2349120185747 (country code + number, no + or spaces) : `
      ))
    );
    phoneNumber = phoneNumber.replace(/\D/g, '');
  }

  if (!isValidPhone(phoneNumber)) {
    console.error(chalk.red('\n❌ Invalid phone number. Must be 7–15 digits with country code, e.g. 2349120185747\n'));
    process.exit(1);
  }

  // Start HTTP dashboard + self-ping
  startServer(sharedState);

  start(phoneNumber);
})();
