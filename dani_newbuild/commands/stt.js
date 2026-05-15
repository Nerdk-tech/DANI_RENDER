const axios = require('axios');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

const STT_KEY = process.env.STT_KEY || 'sk_e48fe210022cc87d560bfb767a84ff8254d1358f82f737b5';

async function transcribeAssemblyAI(buffer) {
  const tmpPath = path.join(os.tmpdir(), `dani-stt-${Date.now()}.ogg`);
  fs.writeFileSync(tmpPath, buffer);

  // Upload
  const uploadRes = await axios.post(
    'https://api.assemblyai.com/v2/upload',
    fs.createReadStream(tmpPath),
    {
      headers: {
        'Authorization': STT_KEY,
        'Content-Type': 'application/octet-stream',
        'Transfer-Encoding': 'chunked',
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 60000,
    }
  );
  try { fs.unlinkSync(tmpPath); } catch {}

  const uploadUrl = uploadRes.data?.upload_url;
  if (!uploadUrl) throw new Error('Upload returned no URL');

  // Request transcript
  const { data: transcript } = await axios.post(
    'https://api.assemblyai.com/v2/transcript',
    { audio_url: uploadUrl, language_code: 'en_us' },
    {
      headers: { 'Authorization': STT_KEY, 'Content-Type': 'application/json' },
      timeout: 30000,
    }
  );

  // Poll
  const id = transcript.id;
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const { data: poll } = await axios.get(
      `https://api.assemblyai.com/v2/transcript/${id}`,
      { headers: { 'Authorization': STT_KEY }, timeout: 20000 }
    );
    if (poll.status === 'completed') return poll.text || '';
    if (poll.status === 'error') throw new Error(poll.error || 'Transcription error');
  }
  throw new Error('Timed out waiting for transcript');
}

async function sttCommand(sock, chatId, message, audioBuffer) {
  if (!audioBuffer || audioBuffer.length === 0) {
    return sock.sendMessage(chatId, {
      text: `Reply to a voice note and say _transcribe_.`
    }, { quoted: message });
  }

  await sock.sendPresenceUpdate('composing', chatId).catch(() => {});
  await sock.sendMessage(chatId, { text: `Transcribing, give me a moment.` }, { quoted: message });

  try {
    const text = await transcribeAssemblyAI(audioBuffer);
    await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
    return sock.sendMessage(chatId, {
      text: text
        ? `*Transcript*\n\n${text}`
        : `Couldn't make out what was said — audio may be too short or unclear.`
    }, { quoted: message });
  } catch (e) {
    await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
    return sock.sendMessage(chatId, {
      text: `Transcription failed: ${e.message?.slice(0, 150)}`
    }, { quoted: message });
  }
}

module.exports = sttCommand;
