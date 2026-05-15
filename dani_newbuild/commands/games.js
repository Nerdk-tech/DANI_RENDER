const axios = require('axios');
const GKEY = process.env.GEMINI_KEY;

const activeGames = {};

/**
 * Fetches 20 items from AI4Chat and picks one randomly to ensure high variety.
 */
async function askStudyAI(gameType) {
  try {
    const prompt = `Generate a list of 20 unique, creative, and engaging ${gameType} questions/tasks for a group chat game. Separate each one with a | character only. No numbering.`;
    
    const { data } = await axios.get(`https://apis.prexzyvilla.site/ai/ai4chat?prompt=${encodeURIComponent(prompt)}`);
    
    const raw = data.results || data.result || "";
    const options = raw.split('|').map(item => item.trim()).filter(item => item.length > 5);
    
    if (options.length === 0) return null;
    return options[Math.floor(Math.random() * options.length)];
  } catch (error) {
    console.error("AI4Chat Error:", error);
    return null;
  }
}

async function gamesCommand(sock, chatId, message, arg) {
  const lower = (arg || '').toLowerCase().trim();

  // --- COMPREHENSIVE MENU ---
  if (!arg || lower === 'help') {
    return sock.sendMessage(chatId, {
      text: `*🎮 DANI ULTIMATE GAMES*\n\n` +
            `*AI4Chat Powered (Infinite Variety):*\n` +
            `• _dani game truth_ - Deep/Awkward truths\n` +
            `• _dani game dare_ - Wild challenges\n` +
            `• _dani game nhie_ - Never Have I Ever\n` +
            `• _dani game wyr_ - Would You Rather\n\n` +
            `*Interactive Games:*\n` +
            `• _dani game trivia_ - AI Trivia quiz\n` +
            `• _dani game riddle_ - Logic puzzles\n` +
            `• _dani game story_ - Collaborative AI story\n\n` +
            `*Quick Fun:*\n` +
            `• _dani game roast_ - Get burned\n` +
            `• _dani game pick_ - Number challenge (1-10)`
    }, { quoted: message });
  }

  // --- TRUTH, DARE, NHIE, WYR (AI4CHAT DRIVEN) ---
  const aiGames = ['truth', 'dare', 'nhie', 'wyr'];
  if (aiGames.includes(lower)) {
    const labels = { truth: '🧐 TRUTH', dare: '🔥 DARE', nhie: '🙊 NHIE', wyr: '⚖️ WYR' };
    const result = await askStudyAI(lower === 'nhie' ? 'Never Have I Ever' : lower === 'wyr' ? 'Would You Rather' : lower);
    
    return sock.sendMessage(chatId, { 
      text: `*${labels[lower]}*\n\n${result || "AI is tired. Try again in a second."}` 
    }, { quoted: message });
  }

  // --- OTHER GAMES ---
  switch (lower) {
    case 'roast':
      const r = await askStudyAI('savage roast');
      return sock.sendMessage(chatId, { text: `💀 *ROAST:*\n${r || "You're proof that God has a sense of humor."}` }, { quoted: message });

    case 'trivia':
      // Using Gemini for structured Trivia logic
      try {
        const { data } = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GKEY}`, {
          contents: [{ role: 'user', parts: [{ text: "Give me a hard trivia question with A, B, C, D options and the answer." }] }]
        });
        const trivia = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Trivia down.";
        return sock.sendMessage(chatId, { text: `🧠 *TRIVIA*\n\n${trivia}` }, { quoted: message });
      } catch { return; }

    case 'riddle':
      try {
        const { data } = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GKEY}`, {
          contents: [{ role: 'user', parts: [{ text: "Give me a clever riddle and its one-word answer separated by a |" }] }]
        });
        const [ques, ans] = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").split('|');
        activeGames[chatId] = { type: 'riddle', answer: ans?.trim() };
        return sock.sendMessage(chatId, { text: `🧩 *RIDDLE:*\n\n${ques?.trim()}\n\n_Reply with 'dani game answer'_` }, { quoted: message });
      } catch { return; }

    case 'answer':
      if (activeGames[chatId]?.type === 'riddle') {
        const answer = activeGames[chatId].answer;
        delete activeGames[chatId];
        return sock.sendMessage(chatId, { text: `✅ *The answer is:* ${answer}` }, { quoted: message });
      }
      break;

    case 'pick':
      const n = Math.floor(Math.random() * 10) + 1;
      const t = ["Sing a song", "Post a goofy selfie", "Rate the bot", "Tell a secret", "Safe", "Text your ex", "Safe", "Send a voice note", "Do 5 pushups", "Truth!"];
      return sock.sendMessage(chatId, { text: `🎲 *PICKED ${n}:* ${t[n-1]}` }, { quoted: message });

    case 'story':
       // Initial story trigger
       try {
        const { data } = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GKEY}`, {
          contents: [{ role: 'user', parts: [{ text: "Start a scary story in 2 sentences. End with ..." }] }]
        });
        const story = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        activeGames[chatId] = { type: 'story', text: story };
        return sock.sendMessage(chatId, { text: `📖 *STORY:*\n\n${story}\n\n_Use 'dani game cont [text]' to continue_` }, { quoted: message });
      } catch { return; }
  }

  // Continuation for Story
  if (lower.startsWith('cont ') && activeGames[chatId]?.type === 'story') {
    const userPart = arg.slice(5);
    activeGames[chatId].text += ` ${userPart}`;
    return sock.sendMessage(chatId, { text: `📝 Added! Use 'dani game end' to finish or 'cont' to add more.` }, { quoted: message });
  }

  if (lower === 'end' && activeGames[chatId]?.type === 'story') {
    delete activeGames[chatId];
    return sock.sendMessage(chatId, { text: `🏁 *STORY ENDED.*` }, { quoted: message });
  }
}

module.exports = gamesCommand;