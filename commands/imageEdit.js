const axios    = require('axios');
const FormData = require('form-data');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const OMEGA_BASE = 'https://omegatech-api.dixonomega.tech/api';

// ── Upload image to tmp.malvryx.dev ─────────────────────────────────────────
async function uploadToMalvryx(buf) {
  try {
    const form = new FormData();
    form.append('file', buf, { filename: 'image.jpg' });
    form.append('type', 'permanent');
    const { data } = await axios.post('https://tmp.malvryx.dev/upload', form, {
      headers: form.getHeaders(), timeout: 20000,
    });
    return data?.cdnUrl || data?.directUrl || null;
  } catch { return null; }
}

async function uploadImage(buf) {
  const u1 = await uploadToMalvryx(buf);
  if (u1) return u1;
  // imgbb fallback
  try {
    const form = new FormData();
    form.append('image', buf.toString('base64'));
    const { data } = await axios.post('https://api.imgbb.com/1/upload?key=2e7e82520b81ff82b33e00a97c7f5a7c', form, {
      headers: form.getHeaders(), timeout: 20000,
    });
    const u = data?.data?.url || data?.data?.display_url;
    if (u) return u;
  } catch {}
  // catbox fallback
  try {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', buf, { filename: 'image.jpg', contentType: 'image/jpeg' });
    const { data } = await axios.post('https://catbox.moe/user/api.php', form, {
      headers: form.getHeaders(), timeout: 20000,
    });
    if (typeof data === 'string' && data.startsWith('https://')) return data.trim();
  } catch {}
  return null;
}

// ── Download quoted image ────────────────────────────────────────────────────
async function downloadQuotedImage(message) {
  try {
    const ctx  = message.message?.extendedTextMessage?.contextInfo;
    const qMsg = ctx?.quotedMessage;
    if (!qMsg?.imageMessage) return null;
    const fakeMsg = {
      key: { remoteJid: message.key.remoteJid, id: ctx.stanzaId, participant: ctx.participant, fromMe: false },
      message: qMsg,
    };
    const buf = await downloadMediaMessage(fakeMsg, 'buffer', {});
    return (buf && buf.length > 100) ? buf : null;
  } catch { return null; }
}

// ── Poll nano-banana2 for result ─────────────────────────────────────────────
async function pollNanoBanana(taskId, fingerprint, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const { data } = await axios.get(
        `${OMEGA_BASE}/ai/nano-banana2-result?task_id=${taskId}${fingerprint ? `&fingerprint=${fingerprint}` : ''}`,
        { timeout: 15000 }
      );
      if (data?.status === 'completed' && data?.image_url) return data.image_url;
      if (data?.status === 'failed') throw new Error('Nano Banana task failed on server.');
    } catch (e) {
      if (e.message.includes('Nano Banana')) throw e;
    }
  }
  throw new Error('Image edit timed out after 2.5 minutes.');
}

function findUrl(obj, d = 0) {
  if (d > 5 || !obj) return null;
  if (typeof obj === 'string' && /^https?:\/\/.+(jpg|png|webp|image|img)/i.test(obj)) return obj;
  if (Array.isArray(obj)) { for (const i of obj) { const r = findUrl(i, d+1); if (r) return r; } }
  if (typeof obj === 'object') {
    for (const k of ['url','image','img','output','result','data','image_url']) {
      if (obj[k]) { const r = findUrl(obj[k], d+1); if (r) return r; }
    }
  }
  return null;
}

async function imageEditCommand(sock, chatId, message, prompt, passedUrl) {
  if (!prompt) return sock.sendMessage(chatId, { text: `Tell me what to change about the image.` }, { quoted: message });

  let imgBuf = null;
  let imgUrl = (passedUrl && passedUrl.startsWith('http')) ? passedUrl : null;

  if (!imgUrl) {
    await sock.sendMessage(chatId, { text: `Downloading your image...` }, { quoted: message });
    imgBuf = await downloadQuotedImage(message);
    if (!imgBuf) return sock.sendMessage(chatId, { text: `Reply to an image and tell me what to change.` }, { quoted: message });
    imgUrl = await uploadImage(imgBuf);
    if (!imgUrl) return sock.sendMessage(chatId, { text: `Couldn't upload your image. Try again.` }, { quoted: message });
  }

  await sock.sendMessage(chatId, { text: `Editing your image — this takes about 30-60 seconds.` }, { quoted: message });

  // ── Primary: Nano Banana 2 (Dixon Omega) ─────────────────────────────────
  try {
    const form = new FormData();
    form.append('image_url', imgUrl);
    form.append('prompt', prompt);

    const { data: initRes } = await axios.post(
      `${OMEGA_BASE}/ai/nano-banana2`,
      form,
      { headers: form.getHeaders(), timeout: 30000 }
    );

    const taskId      = initRes?.task_id || initRes?.id;
    const fingerprint = initRes?.fingerprint;

    if (!taskId) throw new Error('Nano Banana did not return a task ID.');

    const resultUrl = await pollNanoBanana(taskId, fingerprint);
    return sock.sendMessage(chatId, {
      image:   { url: resultUrl },
      caption: prompt,
    }, { quoted: message });

  } catch (e) {
    // ── Fallback: Flux Pro 2 Edit (OmegaTech) ──────────────────────────────
    try {
      const { data: initRes } = await axios.post(
        `${OMEGA_BASE}/ai/flux-pro2-edit`,
        { image1: imgUrl, prompt, aspect_ratio: 'auto' },
        { timeout: 30000 }
      );
      if (initRes?.success && initRes?.task_id) {
        // Poll nano-banana2-result (same polling endpoint)
        const resultUrl = await pollNanoBanana(initRes.task_id, null, 25);
        return sock.sendMessage(chatId, { image: { url: resultUrl }, caption: prompt }, { quoted: message });
      }
    } catch {}

    // ── Fallback: img2img endpoints ────────────────────────────────────────
    const enc    = encodeURIComponent(prompt);
    const encImg = encodeURIComponent(imgUrl);
    const fallbacks = [
      () => axios.get(`https://apis.prexzyvilla.site/ai/img2img?prompt=${enc}&image=${encImg}`, { timeout: 60000 }),
      () => axios.get(`https://api.ryzendesu.vip/api/ai/img2img?prompt=${enc}&url=${encImg}`, { timeout: 60000 }),
      () => axios.get(`https://widipe.com/img2img?prompt=${enc}&url=${encImg}`, { timeout: 60000 }),
    ];
    for (const fn of fallbacks) {
      try {
        const { data, headers } = await fn();
        const ct = (headers?.['content-type'] || '').toLowerCase();
        if (ct.startsWith('image/')) {
          const out = path.join(os.tmpdir(), `dani-edit-${Date.now()}.jpg`);
          fs.writeFileSync(out, Buffer.from(data));
          return sock.sendMessage(chatId, { image: fs.readFileSync(out), caption: prompt }, { quoted: message });
        }
        const u = findUrl(data);
        if (u) return sock.sendMessage(chatId, { image: { url: u }, caption: prompt }, { quoted: message });
      } catch { continue; }
    }

    return sock.sendMessage(chatId, {
      text: `Image edit failed: ${e.message?.slice(0, 120)}`
    }, { quoted: message });
  }
}

module.exports = imageEditCommand;
