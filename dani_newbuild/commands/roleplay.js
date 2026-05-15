const axios = require('axios');
const GKEY  = process.env.GEMINI_KEY;

const SECTIONS = {
  romance:   'You are roleplaying as a warm, caring romantic partner. Stay in character. Be sweet, attentive, emotionally expressive.',
  friend:    'You are roleplaying as a loyal best friend. Casual, honest, supportive, sometimes sarcastic but always there.',
  villain:   'You are roleplaying as a charismatic villain. Intelligent, menacing, theatrical, but never actually harmful.',
  teacher:   'You are roleplaying as a patient, knowledgeable teacher. Explain everything clearly and encouragingly.',
  therapist: 'You are roleplaying as a calm, empathetic therapist. Listen carefully, reflect feelings, ask good questions.',
  custom:    null,
};

const activeSessions = {};

async function roleplayCommand(sock, chatId, message, arg) {
  const lower = (arg || '').toLowerCase().trim();

  // Show sections
  if (!arg || lower === 'help' || lower === 'list') {
    return sock.sendMessage(chatId, {
      text: `*Dani Roleplay*\n\nChoose a section:\n\n` +
            `_dani roleplay romance_ — romantic partner\n` +
            `_dani roleplay friend_ — best friend\n` +
            `_dani roleplay villain_ — charismatic villain\n` +
            `_dani roleplay teacher_ — patient teacher\n` +
            `_dani roleplay therapist_ — calm therapist\n` +
            `_dani roleplay custom [describe the character]_ — any character you want\n\n` +
            `_dani roleplay stop_ — end the session`
    }, { quoted: message });
  }

  if (lower === 'stop' || lower === 'end' || lower === 'exit') {
    delete activeSessions[chatId];
    return sock.sendMessage(chatId, { text: `Roleplay session ended. Back to normal.` }, { quoted: message });
  }

  // Start a section
  for (const [key, persona] of Object.entries(SECTIONS)) {
    if (lower === key || lower.startsWith(key + ' ')) {
      const customDesc = lower.startsWith('custom ') ? arg.slice(7).trim() : null;
      const systemPrompt = customDesc
        ? `You are roleplaying as: ${customDesc}. Stay in character. Be creative and immersive.`
        : persona;
      activeSessions[chatId] = { persona: systemPrompt, history: [] };
      return sock.sendMessage(chatId, {
        text: `*Roleplay started* — ${key}${customDesc ? `: _${customDesc}_` : ''}.\n\nSay _dani roleplay stop_ to end the session.\n\nLet's go...`
      }, { quoted: message });
    }
  }

  // Continue active roleplay
  if (activeSessions[chatId]) {
    const session = activeSessions[chatId];
    session.history.push({ role: 'user', parts: [{ text: arg }] });
    if (session.history.length > 20) session.history = session.history.slice(-20);

    try {
      const { data } = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GKEY}`,
        {
          system_instruction: { parts: [{ text: session.persona }] },
          contents: session.history,
        },
        { timeout: 20000 }
      );
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply) {
        session.history.push({ role: 'model', parts: [{ text: reply }] });
        return sock.sendMessage(chatId, { text: reply }, { quoted: message });
      }
    } catch {}
    return sock.sendMessage(chatId, { text: `Roleplay AI is down. Try again.` }, { quoted: message });
  }

  return sock.sendMessage(chatId, {
    text: `Type _dani roleplay_ to see available sections.`
  }, { quoted: message });
}

module.exports = roleplayCommand;
