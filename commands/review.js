const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const GEMINI_KEY  = process.env.GEMINI_KEY || 'AIzaSyBU7rRjI8deSMhlADXznxBka1mCfhdF_I8';
const OMEGA_BASE  = 'https://omegatech-api.dixonomega.tech/api';

function isHtml(d) { return typeof d === 'string' && d.trimStart().startsWith('<'); }

// ── Gemini Vision — send image + prompt, get real analysis ──────────────────
async function geminiVision(imageBuffer, prompt) {
  const b64 = imageBuffer.toString('base64');
  try {
    // Try Dixon Omega Gemini Flash 2 first
    const form = new FormData();
    form.append('image', imageBuffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
    form.append('prompt', prompt || 'Analyze this image in detail. Describe what you see, the quality, composition, any text visible, and give honest useful feedback.');
    const { data } = await axios.post(`${OMEGA_BASE}/ai/Gemini-flash2`, form, {
      headers: form.getHeaders(), timeout: 30000,
    });
    if (!isHtml(data)) {
      const out = data?.result ?? data?.data ?? data?.text ?? data?.response ?? data?.description;
      if (out && String(out).trim().length > 20) return String(out).trim();
    }
  } catch {}

  // Fallback — Google Gemini Vision directly
  try {
    const { data } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        contents: [{
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: b64 } },
            { text: prompt || 'Analyze this image thoroughly. Describe what you see, give feedback on quality, composition, content, any visible text or design, and actionable suggestions.' }
          ]
        }]
      },
      { timeout: 30000 }
    );
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch { return null; }
}

// ── AI for file review ────────────────────────────────────────────────────────
async function askAI(task) {
  const prompt = `You are Dani, a sharp, nonchalant AI. Review the following and give *specific*, *actionable* feedback. Use *bold* for key points. Be direct. No filler.\n\n${task}`;
  const endpoints = [
    `https://api.siputzx.my.id/api/ai/gemini-pro?content=`,
    `https://apis.prexzyvilla.site/ai/aichat?prompt=`,
    `https://api.nekorinn.my.id/ai/gpt?text=`,
    `https://widipe.com/openai?text=`,
  ];
  for (const base of endpoints) {
    try {
      const { data } = await axios.get(base + encodeURIComponent(prompt), { timeout: 25000 });
      if (isHtml(data)) continue;
      const out = data?.result ?? data?.data ?? data?.message ?? data?.response ?? data?.answer ?? data?.text;
      if (out && String(out).trim().length > 20) return String(out).trim();
    } catch { continue; }
  }
  return null;
}

// ── PDF text extraction (no library needed) ──────────────────────────────────
function pdfToText(buf) {
  try {
    const s   = buf.toString('binary');
    const re  = /\(([^)]{2,400})\)/g;
    const raw = [];
    let m;
    while ((m = re.exec(s)) !== null) {
      const t = m[1].replace(/\\n/g,' ').replace(/\\/g,'').replace(/[^\x20-\x7E]/g,' ').trim();
      if (t.length > 3 && /[a-zA-Z]{2,}/.test(t)) raw.push(t);
    }
    const text = raw.join(' ').replace(/\s+/g,' ').trim();
    return text.length > 80 ? text.slice(0, 9000) : null;
  } catch { return null; }
}

function buildTargetMsg(message) {
  const ctx = message.message?.extendedTextMessage?.contextInfo;
  const q   = ctx?.quotedMessage;
  if (!q) return null;
  return {
    key: { remoteJid: message.key.remoteJid, id: ctx.stanzaId, participant: ctx.participant || message.key.remoteJid, fromMe: false },
    message: q,
  };
}

async function reviewCommand(sock, chatId, message, instruction) {
  const msg       = message.message;
  const ctx       = msg?.extendedTextMessage?.contextInfo;
  const quotedMsg = ctx?.quotedMessage;
  const imageMsg  = msg?.imageMessage || quotedMsg?.imageMessage;
  const docMsg    = msg?.documentMessage || quotedMsg?.documentMessage;

  if (!imageMsg && !docMsg) {
    return sock.sendMessage(chatId, {
      text: `Send or reply to any *image* or *file* and say _dani review_.\n\nYou can add instructions: _"dani review this and check for bugs"_\n\nSupports: images, PDFs, code files, text, JSON, CSV and more.`
    }, { quoted: message });
  }

  const targetMsg = quotedMsg ? buildTargetMsg(message) : message;

  await sock.sendMessage(chatId, {
    text: `Reviewing your ${imageMsg ? 'image' : 'file'}, give me a moment.`
  }, { quoted: message });
  await sock.sendPresenceUpdate('composing', chatId).catch(() => {});

  try {
    // ── IMAGE — use actual Gemini Vision ─────────────────────────────────────
    if (imageMsg) {
      const buf = await downloadMediaMessage(targetMsg, 'buffer', {});
      if (!buf || buf.length < 100) {
        return sock.sendMessage(chatId, { text: `Couldn't download the image. Try again.` }, { quoted: message });
      }

      const prompt = instruction
        ? `Task: ${instruction}. Analyze this image thoroughly and give specific feedback based on the task.`
        : `Analyze this image in full detail. Cover: what it shows, quality, composition, any visible text or design elements, overall impression, and give 3+ concrete improvement suggestions if applicable.`;

      const response = await geminiVision(buf, prompt);
      await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
      return sock.sendMessage(chatId, {
        text: response || `I looked at your image but my vision endpoint returned nothing. Try again or describe it and I'll give feedback.`
      }, { quoted: message });
    }

    // ── DOCUMENT / FILE ───────────────────────────────────────────────────────
    if (docMsg) {
      const filename = docMsg.fileName || 'file';
      const mimetype = (docMsg.mimetype || '').toLowerCase();
      const isPDF    = mimetype.includes('pdf') || filename.toLowerCase().endsWith('.pdf');
      const isText   = !isPDF && (
        /text|json|javascript|typescript|python|markdown|csv|xml|html|plain/i.test(mimetype) ||
        /\.(txt|js|ts|jsx|tsx|json|py|md|csv|xml|html|css|sh|yaml|yml|env|log|c|cpp|java|php|rb|go|rs|kt|swift|sql)$/i.test(filename)
      );

      const buf = await downloadMediaMessage(targetMsg, 'buffer', {});
      let fileContent = null;

      if (buf) {
        if (isPDF) {
          fileContent = pdfToText(buf);
          if (!fileContent) {
            const raw = buf.toString('utf8').replace(/[^\x20-\x7E\n\r\t]/g,' ').replace(/\s+/g,' ').trim();
            if (raw.length > 100) fileContent = raw.slice(0, 9000);
          }
        } else if (isText) {
          try { fileContent = buf.toString('utf8').slice(0, 10000); } catch {}
        }
      }

      const task = fileContent
        ? `Review this file: *"${filename}"*\n\n${instruction ? `Instructions: ${instruction}\n\n` : ''}` +
          `File content:\n\`\`\`\n${fileContent}\n\`\`\`\n\n` +
          `Give: (1) what the file does/contains, (2) errors or issues, (3) improvements, (4) overall quality. Be specific, reference actual content.`
        : `I received a ${isPDF ? 'PDF' : 'binary'} file: *"${filename}"*.\n` +
          `${instruction ? `User wants: ${instruction}\n` : ''}` +
          `I couldn't extract text. Based on the filename, describe what this file likely contains and what to look for when reviewing this type of file.`;

      const response = await askAI(task);
      await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
      return sock.sendMessage(chatId, {
        text: response || `Downloaded _${filename}_ but AI is overloaded. Try again in a moment.`
      }, { quoted: message });
    }

  } catch (e) {
    await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
    return sock.sendMessage(chatId, { text: `Review failed: ${e.message?.slice(0, 150)}` }, { quoted: message });
  }
}

module.exports = reviewCommand;
