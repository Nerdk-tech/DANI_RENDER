const axios = require('axios');

const FAL_KEY = process.env.FAL_KEY || '28ff6197-6de0-4f3f-adea-58e41cee42fc:c2a745be95649d004aee6ae5b1c1ae54';

// Try multiple fal models
const FAL_MODELS = [
  'fal-ai/wan/v2.1/1.3b/text-to-video',
  'fal-ai/wan-t2v-1.3b',
  'fal-ai/fast-animatediff/text-to-video',
  'fal-ai/ltx-video',
];

async function submitToFal(model, prompt) {
  const { data } = await axios.post(
    `https://queue.fal.run/${model}`,
    { prompt, num_frames: 49, fps: 16 },
    {
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );
  return data?.request_id || data?.id || null;
}

async function pollFal(model, requestId) {
  const start = Date.now();
  const maxWait = 5 * 60 * 1000; // 5 min

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 8000));
    try {
      const { data } = await axios.get(
        `https://queue.fal.run/${model}/requests/${requestId}`,
        { headers: { 'Authorization': `Key ${FAL_KEY}` }, timeout: 15000 }
      );

      const status = data?.status?.toUpperCase() || '';
      if (status === 'COMPLETED' || data?.video || data?.output) {
        return data?.output?.video?.url
            || data?.output?.url
            || data?.video?.url
            || data?.video
            || null;
      }
      if (status === 'FAILED') throw new Error('Generation failed on fal server.');
    } catch (e) {
      if (e.message.includes('failed on fal')) throw e;
      // Network error — keep polling
    }
  }
  throw new Error('Timed out after 5 minutes.');
}

async function videoCommand(sock, chatId, message, prompt) {
  if (!prompt) return sock.sendMessage(chatId, {
    text: `Tell me what to generate.\n\nExample: _dani video a girl dancing in Tokyo at night, cinematic quality_`
  }, { quoted: message });

  await sock.sendMessage(chatId, {
    text: `Generating your video. This takes 2-4 minutes — I'll send it when it's done.`
  }, { quoted: message });

  let lastErr;
  for (const model of FAL_MODELS) {
    try {
      const requestId = await submitToFal(model, prompt);
      if (!requestId) continue;

      const videoUrl = await pollFal(model, requestId);
      if (!videoUrl) continue;

      return sock.sendMessage(chatId, {
        video:       { url: videoUrl },
        caption:     `_${prompt}_`,
        gifPlayback: false,
      }, { quoted: message });

    } catch (e) {
      lastErr = e;
      if (e.message.includes('failed on fal')) break; // real failure, don't retry
      continue; // try next model
    }
  }

  return sock.sendMessage(chatId, {
    text: `Video generation failed: ${lastErr?.message?.slice(0, 120) || 'All models returned errors'}.\n\nTry a simpler prompt or try again in a few minutes.`
  }, { quoted: message });
}

module.exports = videoCommand;
