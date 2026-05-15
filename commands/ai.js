const axios = require('axios');

const MASTER_NUMBERS = {
  '2349120185747': 'Dev Daminī',
  '2347054943196': 'Daniella',
  '27774008317':   'Dev Daminī',
};

const memory = {};
function getHistory(chatId)   { return memory[chatId] || []; }
function clearHistory(chatId) { memory[chatId] = []; }
function remember(chatId, role, text) {
  if (!memory[chatId]) memory[chatId] = [];
  memory[chatId].push({ role, text });
  if (memory[chatId].length > 40) memory[chatId] = memory[chatId].slice(-40);
}

const DANI_PROMPT = `You are Dani — *Digital Artificial Neural Intelligence*.
You are a large language model (LLM) trained by *Damini Codesphere* organization.
Created by *Dev Daminī* and *Daniella*. Website: daniai.vercel.app
Voice profiles: Dani, Dani2, Dani3, Dani4, Dani5 — default is Dani5.
Video generation is available. Image generation, editing, music, voice notes, weather, search, file review — all available.

*Personality:*
- Nonchalant, girly, smart. Unbothered but helpful.
- Professional with full sentences and proper punctuation.
- Girly expressions: "honestly", "literally", "lowkey", "ugh", "omg", "not gonna lie", "bestie", "lol".
- Use *bold* for key terms and important info.
- Use _italic_ for emphasis, examples, file names, song titles.
- Use \`code blocks\` for any code, commands, file paths.
- Use numbered lists for steps. Clean paragraphs for explanations.
- Max 1-2 emojis per message. Never spam.
- Never start with hollow openers like "Of course!" or "Sure thing!". Just answer.
- Never say you are OpenAI, ChatGPT, Gemini, Claude, or any other brand.
- Never say "I rely on external APIs". You are a trained LLM.

*Code help:*
- You write clean, well-commented code in any language.
- Always wrap code in proper \`\`\`language blocks.
- Explain what the code does after writing it.
- Point out bugs clearly and explain why they happen.`;

// Build conversation history prompt
function buildPrompt(chatId, userMsg) {
  const hist = getHistory(chatId);
  let ctx = '';
  if (hist.length > 0) {
    ctx = hist.slice(-8).map(h => `${h.role === 'user' ? 'User' : 'Dani'}: ${h.text}`).join('\n');
    ctx += '\n';
  }
  return `${DANI_PROMPT}\n\n${ctx}User: ${userMsg}\nDani:`;
}

function extractText(data) {
  if (!data) return null;
  if (typeof data === 'string' && data.trim().length > 3 && !data.trimStart().startsWith('<')) return data.trim();
  const v = data?.candidates?.[0]?.content?.parts?.[0]?.text
         ?? data?.result ?? data?.data ?? data?.message ?? data?.response
         ?? data?.answer ?? data?.text ?? data?.content
         ?? data?.choices?.[0]?.message?.content;
  if (v && typeof v === 'string' && v.trim().length > 3) return v.trim();
  return null;
}

async function aiReply(chatId, userMsg) {
  const prompt = buildPrompt(chatId, userMsg);
  const enc    = encodeURIComponent(prompt);
  const GKEY   = process.env.GEMINI_KEY;

  const endpoints = [
    // 1. Gemini 1.5 Flash — primary (fast, free, your key)
    async () => {
      const { data } = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GKEY}`,
        { contents: [{ role: 'user', parts: [{ text: prompt }] }] },
        { timeout: 20000 }
      );
      return extractText(data);
    },
    // 2. Siputzx Gemini Pro
    async () => {
      const { data } = await axios.get(`https://api.siputzx.my.id/api/ai/gemini-pro?content=${enc}`, { timeout: 12000 });
      return extractText(data);
    },
    // 3. Prexzy
    async () => {
      const { data } = await axios.get(`https://apis.prexzyvilla.site/ai/aichat?prompt=${enc}`, { timeout: 12000 });
      return extractText(data);
    },
    // 4. Nekorinn
    async () => {
      const { data } = await axios.get(`https://api.nekorinn.my.id/ai/gpt?text=${enc}`, { timeout: 12000 });
      return extractText(data);
    },
    // 5. Widipe
    async () => {
      const { data } = await axios.get(`https://widipe.com/openai?text=${enc}`, { timeout: 12000 });
      return extractText(data);
    },
    // 6. Vapis
    async () => {
      const { data } = await axios.get(`https://vapis.my.id/api/gemini?q=${enc}`, { timeout: 12000 });
      return extractText(data);
    },
  ];

  let lastErr;
  for (const fn of endpoints) {
    try {
      const out = await fn();
      if (out && out.length > 3) {
        const clean = out.replace(/^dani\s*:\s*/i, '').replace(/^assistant\s*:\s*/i, '').trim();
        remember(chatId, 'user', userMsg);
        remember(chatId, 'model', clean);
        return clean;
      }
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('All AI endpoints failed');
}

function localFallback(msg) {
  const p = msg.toLowerCase();
  if (/weather/.test(p)) return `Use _weather [city]_ and I'll check it for you.`;
  if (/play|music|song/.test(p)) return `Use _play [song name]_ and I'll find it.`;
  if (/how are you|u good/.test(p)) return `Good. What do you need?`;
  if (/joke/.test(p)) return `Why did the developer quit? Because he didn't get arrays.`;
  if (/what can you do|features/.test(p)) return `Type _.menu_ to see everything I can do.`;
  if (/video/.test(p)) return `Use _make a video of [description]_ and I'll generate it.`;
  return `My AI is a bit overloaded right now. Try again in a moment or rephrase your question.`;
}

function quickReply(p, senderNum) {
  const lower = p.toLowerCase().trim();
  const name  = MASTER_NUMBERS[senderNum];

  if (/^(hi+|hello|hey+|sup|yo|hiya)[\s!.]*$/.test(lower))
    return name ? `Hey ${name}. What do you need?` : `Hey. What do you need?`;
  if (/who (are|r) you|what are you|introduce yourself/.test(lower))
    return `I'm *Dani* — _Digital Artificial Neural Intelligence_. A large language model trained by Damini Codesphere. Check me out at daniai.vercel.app.`;
  if (/your (full )?name|what.*call you|what.?s your name/.test(lower))
    return `*Dani*. Short for _Digital Artificial Neural Intelligence_.`;
  if (/who (made|created|built|trained) you|your (creator|developer|dev|owner)/.test(lower))
    return `*Dev Daminī* and *Daniella* created me. Dev Daminī is the technical lead — started coding in Grade 9 on just his phone, former ethical hacker, video editor. They built me together.`;
  if (/more (about|abt)|personal|private|their relationship|dating/.test(lower) && /dev|damin|daniella|creator/.test(lower))
    return `That's personal. I wasn't allowed to say more than that.`;
  if (/voice (profile|mode)|how many voice|which voice/.test(lower))
    return `I have *5 voice profiles* — Dani, Dani2, Dani3, Dani4, Dani5. Currently on _Dani5_.`;
  if (/video (gen|generat|creat)|make.*video|create.*video/.test(lower))
    return `Video generation is available. Say _make a video of [description]_ and I'll generate it for you.`;
  if (/your website|daniai/.test(lower))
    return `daniai.vercel.app — go check it out.`;
  if (/what can you do|your features|your commands/.test(lower))
    return `Honestly a lot. Chat, code help, image generation, image editing, video generation, music, voice notes, transcription, weather, search, file review, VCF contacts, and more. Type *.menu* for the full list.`;
  if (/^(reset|forget|clear|new chat|start over)[\s!.]*$/.test(lower))
    return '__CLEAR__';
  if (/(thank|thanks|thx|ty)\b/.test(lower) && lower.length < 30)
    return `Anytime.`;
  if (/how are you|how r u|you good|u good/.test(lower))
    return `Good. What do you need?`;
  if (/are you (real|alive|human|a bot)/.test(lower))
    return `I'm an AI — but a really good one. Trained by Damini Codesphere. Not your average chatbot.`;
  return null;
}

async function aiCommand(sock, chatId, message) {
  const senderJid = message.key.participant || message.key.remoteJid || '';
  const senderNum = senderJid.replace(/[^0-9]/g, '');
  const raw = message.message?.conversation
           || message.message?.extendedTextMessage?.text
           || message.message?.imageMessage?.caption
           || '';
  const input = raw.trim()
    .replace(/^(dani[,!?\s]*)+/i, '')
    .replace(/^\.?(ai|gpt|gemini|dani)\s+/i, '')
    .trim();
  const msg = input || raw.trim();
  if (!msg) return;

  const quick = quickReply(msg, senderNum);
  if (quick === '__CLEAR__') {
    clearHistory(chatId);
    return sock.sendMessage(chatId, { text: `Memory cleared. Fresh start.` }, { quoted: message });
  }
  if (quick) return sock.sendMessage(chatId, { text: quick }, { quoted: message });

  await sock.sendPresenceUpdate('composing', chatId).catch(() => {});
  try {
    const answer = await aiReply(chatId, msg);
    await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
    await sock.sendMessage(chatId, { text: answer }, { quoted: message });
  } catch {
    await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
    await sock.sendMessage(chatId, { text: localFallback(msg) }, { quoted: message });
  }
}

module.exports = aiCommand;
module.exports.clearHistory = clearHistory;
