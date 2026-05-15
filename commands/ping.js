const axios = require('axios');

// All endpoints Dani uses — grouped for clarity
const ENDPOINTS = [
  // AI
  { name: 'AI — Prexzy',        url: 'https://apis.prexzyvilla.site/ai/aichat?prompt=test' },
  { name: 'AI — Ryzen GPT',     url: 'https://api.ryzendesu.vip/api/ai/chatgpt?text=test' },
  { name: 'AI — Widipe',        url: 'https://widipe.com/openai?text=test' },
  { name: 'AI — Siputzx',       url: 'https://api.siputzx.my.id/api/ai/gemini-pro?content=test' },
  { name: 'AI — Vapis',         url: 'https://vapis.my.id/api/gemini?q=test' },
  { name: 'AI — Nekorinn',      url: 'https://api.nekorinn.my.id/ai/gpt?text=test' },
  // Music
  { name: 'Music — Privatezia', url: 'https://api.privatezia.biz.id/api/downloader/ytmp3?url=test' },
  { name: 'Music — Ryzen',      url: 'https://api.ryzendesu.vip/api/downloader/ytmp3?url=test' },
  { name: 'Music — Siputzx',    url: 'https://api.siputzx.my.id/api/downloader/ytmp3?url=test' },
  { name: 'Music — Izumi',      url: 'https://izumiiiiiiii.dpdns.org/downloader/youtube-play?query=test' },
  // Image
  { name: 'Image — Siputzx',    url: 'https://api.siputzx.my.id/api/ai/text2image?prompt=test' },
  { name: 'Image — Prexzy',     url: 'https://apis.prexzyvilla.site/ai/realistic?prompt=test' },
  { name: 'Image — Ryzen',      url: 'https://api.ryzendesu.vip/api/ai/imagine?prompt=test' },
  { name: 'Image — Pollinations', url: 'https://image.pollinations.ai/prompt/test?width=64&height=64&nologo=true' },
  // Search
  { name: 'Search — Dani',      url: 'https://dani-search.vercel.app/q?=test' },
  { name: 'Search — Siputzx',   url: 'https://api.siputzx.my.id/api/search/google?query=test' },
  // Weather
  { name: 'Weather — OpenWeather', url: `https://api.openweathermap.org/data/2.5/weather?q=Lagos&appid=${process.env.OPENWEATHER_KEY}&units=metric` },
  // TTS
  { name: 'TTS — ElevenLabs',   url: 'https://api.elevenlabs.io/v1/voices', customHeaders: { 'xi-api-key': process.env.TTS_KEY } },
  // STT
  { name: 'STT — AssemblyAI',   url: 'https://api.assemblyai.com/v2/transcript', method: 'GET', customHeaders: { authorization: process.env.STT_KEY } },
];

function statusEmoji(code) {
  if (!code) return '❌';
  if (code >= 200 && code < 300) return '✅';
  if (code >= 400 && code < 500) return '⚠️';
  return '❌';
}

async function checkOne({ url, customHeaders, method = 'GET' }) {
  const start = Date.now();
  try {
    const resp = await axios({ method, url, headers: customHeaders || {}, timeout: 10000, validateStatus: () => true });
    return { status: resp.status, ms: Date.now() - start };
  } catch (e) {
    return { status: null, ms: Date.now() - start, error: e.message?.slice(0, 60) };
  }
}

async function pingCommand(sock, chatId, message, arg) {
  // Single endpoint check: .ping https://someurl.com
  if (arg && arg.startsWith('http')) {
    await sock.sendMessage(chatId, { text: `Checking ${arg}...` }, { quoted: message });
    const start = Date.now();
    try {
      const resp = await axios.get(arg, { timeout: 15000, validateStatus: () => true });
      const ms = Date.now() - start;
      const ct = resp.headers?.['content-type'] || 'unknown';
      let body;
      if (typeof resp.data === 'object') body = JSON.stringify(resp.data, null, 2).slice(0, 1500);
      else body = String(resp.data).slice(0, 1500);

      return sock.sendMessage(chatId, {
        text: `*Endpoint Check*\n\n*URL:* ${arg}\n*Status:* ${statusEmoji(resp.status)} ${resp.status}\n*Time:* ${ms}ms\n*Content-Type:* ${ct}\n\n*Raw Response:*\n\`\`\`\n${body}\n\`\`\``
      }, { quoted: message });
    } catch (e) {
      return sock.sendMessage(chatId, {
        text: `*Endpoint Check*\n\n*URL:* ${arg}\n*Status:* ❌ Error\n*Error:* ${e.message}`
      }, { quoted: message });
    }
  }

  // Full status check of all endpoints
  await sock.sendMessage(chatId, { text: `Running status check on all endpoints. Give me a moment.` }, { quoted: message });

  const results = await Promise.all(ENDPOINTS.map(async (ep) => {
    const r = await checkOne(ep);
    return { name: ep.name, ...r };
  }));

  const lines = results.map(r => {
    const emoji = statusEmoji(r.status);
    const code  = r.status ? String(r.status) : (r.error || 'timeout');
    const ms    = r.ms ? `${r.ms}ms` : '';
    return `${emoji} *${r.name}* — ${code} ${ms}`;
  });

  const online  = results.filter(r => r.status >= 200 && r.status < 300).length;
  const total   = results.length;

  return sock.sendMessage(chatId, {
    text: `*Dani Endpoint Status*\n_${online}/${total} online_\n\n${lines.join('\n')}`
  }, { quoted: message });
}

module.exports = pingCommand;
