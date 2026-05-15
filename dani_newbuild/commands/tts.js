const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const { execSync } = require('child_process');

function splitText(text, maxLen = 400) {
  if (text.length <= maxLen) return [text];
  const chunks    = [];
  const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > maxLen && current) { chunks.push(current.trim()); current = s; }
    else current += s;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text.slice(0, maxLen)];
}

async function downloadMp3(text, outPath) {
  const { data, headers } = await axios.get(
    `https://apis.prexzyvilla.site/tts/beatrice?text=${encodeURIComponent(text)}&speed=1&pi=3.14`,
    { timeout: 120000, responseType: 'arraybuffer' }
  );
  const ct = (headers?.['content-type'] || '').toLowerCase();
  if (ct.includes('json') || ct.includes('html')) throw new Error(`TTS returned non-audio: ${Buffer.from(data).toString('utf8').slice(0, 100)}`);
  const buf = Buffer.from(data);
  if (buf.length < 500) throw new Error('TTS returned empty audio');
  fs.writeFileSync(outPath, buf);
}

async function ttsCommand(sock, chatId, message, text) {
  if (!text) return sock.sendMessage(chatId, { text: `Tell me what to say.` }, { quoted: message });
  await sock.sendPresenceUpdate('recording', chatId).catch(() => {});

  const tmp     = path.join(os.tmpdir(), `dani-tts-${Date.now()}`);
  const oggOut  = `${tmp}.ogg`;
  const mp3List = [];
  const allFiles = [];

  try {
    const chunks = splitText(text, 400);
    for (let i = 0; i < chunks.length; i++) {
      const mp3 = `${tmp}-p${i}.mp3`;
      await downloadMp3(chunks[i], mp3);
      mp3List.push(mp3);
      allFiles.push(mp3);
    }

    let ffCmd;
    if (mp3List.length === 1) {
      ffCmd = `ffmpeg -y -i "${mp3List[0]}" -c:a libopus -b:a 64k -ar 48000 -ac 1 "${oggOut}"`;
    } else {
      const listFile = `${tmp}-list.txt`;
      fs.writeFileSync(listFile, mp3List.map(p => `file '${p}'`).join('\n'));
      allFiles.push(listFile);
      ffCmd = `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c:a libopus -b:a 64k -ar 48000 -ac 1 "${oggOut}"`;
    }

    execSync(ffCmd, { timeout: 90000, stdio: 'pipe' });

    if (!fs.existsSync(oggOut) || fs.statSync(oggOut).size < 100)
      throw new Error('ffmpeg produced empty output');

    const audioBuf = fs.readFileSync(oggOut);
    await sock.sendPresenceUpdate('paused', chatId).catch(() => {});

    // Send as proper WhatsApp voice note — buffer + correct mimetype + ptt
    return sock.sendMessage(chatId, {
      audio:    audioBuf,
      mimetype: 'audio/ogg; codecs=opus',
      ptt:      true,
    }, { quoted: message });

  } catch (e) {
    await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
    return sock.sendMessage(chatId, { text: `Voice note failed: ${e.message?.slice(0, 200)}` }, { quoted: message });
  } finally {
    for (const f of [...allFiles, oggOut]) { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} }
  }
}

module.exports = ttsCommand;
