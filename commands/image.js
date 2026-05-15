const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

function findImageUrl(obj, depth = 0) {
  if (depth > 6 || !obj) return null;
  if (typeof obj === 'string') {
    const s = obj.trim();
    if (/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(s)) return s;
    if (/^https?:\/\/.+(image|img|photo|generate|output|cdn)/i.test(s) && s.length > 15) return s;
    return null;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) { const r = findImageUrl(item, depth+1); if (r) return r; }
    return null;
  }
  if (typeof obj === 'object') {
    for (const k of ['url','image','img','output','src','link','photo','data','result','images','0']) {
      if (obj[k]) { const r = findImageUrl(obj[k], depth+1); if (r) return r; }
    }
    for (const k of Object.keys(obj)) {
      const r = findImageUrl(obj[k], depth+1); if (r) return r;
    }
  }
  return null;
}

async function imageCommand(sock, chatId, message, prompt) {
  if (!prompt) return sock.sendMessage(chatId, { text: `Tell me what to generate.` }, { quoted: message });
  await sock.sendMessage(chatId, { text: `Generating your image now.` }, { quoted: message });

  const enc = encodeURIComponent(prompt);
  const neg = encodeURIComponent('blurry,low quality,distorted,ugly,deformed,nsfw');

  const endpoints = [
    // Pollinations — reliable, returns binary image directly
    { url: `https://image.pollinations.ai/prompt/${enc}?width=1024&height=1024&nologo=true&seed=${Date.now()}`, binary: true },
    // Prexzy
    { url: `https://apis.prexzyvilla.site/ai/realistic?prompt=${enc}&negative_prompt=${neg}`, binary: false },
    // Ryzen
    { url: `https://api.ryzendesu.vip/api/ai/imagine?prompt=${enc}`, binary: false },
    // Siputzx
    { url: `https://api.siputzx.my.id/api/ai/text2image?prompt=${enc}`, binary: true },
    // Widipe
    { url: `https://widipe.com/imagine?prompt=${enc}`, binary: false },
    // Itzpire
    { url: `https://itzpire.site/api/ai/text2img?prompt=${enc}`, binary: false },
    // Nekorinn
    { url: `https://api.nekorinn.my.id/ai/imagine?prompt=${enc}`, binary: false },
  ];

  for (const ep of endpoints) {
    try {
      const resp = await axios.get(ep.url, {
        timeout: 50000,
        responseType: ep.binary ? 'arraybuffer' : 'json',
        validateStatus: s => s < 400,
      });

      const ct = (resp.headers?.['content-type'] || '').toLowerCase();

      // Binary image response
      if (ct.startsWith('image/') || ep.binary) {
        const buf = Buffer.from(resp.data);
        if (buf.length < 1000) continue; // too small = error response
        const ext = ct.includes('png') ? 'png' : 'jpg';
        const out = path.join(os.tmpdir(), `dani-img-${Date.now()}.${ext}`);
        fs.writeFileSync(out, buf);
        await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
        return sock.sendMessage(chatId, {
          image: fs.readFileSync(out),
          mimetype: ct.startsWith('image/') ? ct : 'image/jpeg',
          caption: prompt,
        }, { quoted: message });
      }

      // JSON response with URL
      if (ct.includes('json') || typeof resp.data === 'object') {
        const imgUrl = findImageUrl(resp.data);
        if (!imgUrl) continue;

        // Download the image to send as buffer (avoids WhatsApp document display issue)
        const imgResp = await axios.get(imgUrl, { timeout: 30000, responseType: 'arraybuffer' });
        const buf = Buffer.from(imgResp.data);
        if (buf.length < 1000) continue;
        const imgCt = (imgResp.headers?.['content-type'] || 'image/jpeg').toLowerCase();
        const ext = imgCt.includes('png') ? 'png' : 'jpg';
        const out = path.join(os.tmpdir(), `dani-img-${Date.now()}.${ext}`);
        fs.writeFileSync(out, buf);
        return sock.sendMessage(chatId, {
          image: fs.readFileSync(out),
          mimetype: imgCt.startsWith('image/') ? imgCt : 'image/jpeg',
          caption: prompt,
        }, { quoted: message });
      }

    } catch { continue; }
  }

  return sock.sendMessage(chatId, {
    text: `Image generation failed on all endpoints. Try a simpler or different prompt.`
  }, { quoted: message });
}

module.exports = imageCommand;
