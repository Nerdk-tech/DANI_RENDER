const axios = require('axios');
const OMEGA = 'https://omegatech-api.dixonomega.tech/api/tools';

function extractTikTokUrl(text) {
  const match = text.match(/https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)[^\s]*/i);
  return match ? match[0] : null;
}

async function tiktokCommand(sock, chatId, message, arg) {
  const url = extractTikTokUrl(arg || '');

  if (!url) {
    return sock.sendMessage(chatId, {
      text:
        `*Dani TikTok Views*\n\n` +
        `Boost your TikTok video views.\n\n` +
        `*Usage:*\n_dani ttviews [tiktok link]_\n\n` +
        `Example:\n_dani ttviews https://vm.tiktok.com/xxxxxxx_`
    }, { quoted: message });
  }

  await sock.sendMessage(chatId, {
    text: `Sending views to your video. Give me a moment.`
  }, { quoted: message });

  let lastErr;

  // Try v2 first
  try {
    const { data } = await axios.post(
      `${OMEGA}/tiktok-views-v2`,
      { url },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );

    if (data?.success || data?.status === 'success' || data?.message) {
      const views  = data?.views || data?.count || data?.amount || 'sent';
      const status = data?.message || data?.status || 'Done';
      return sock.sendMessage(chatId, {
        text:
          `*TikTok Views Sent*\n\n` +
          `*Video:* ${url}\n` +
          `*Views:* ${views}\n` +
          `*Status:* ${status}\n\n` +
          `_Views may take a few minutes to appear._`
      }, { quoted: message });
    }
    throw new Error(data?.error || data?.message || 'No success response');
  } catch (e) { lastErr = e; }

  // Try v1 fallback
  try {
    const { data } = await axios.post(
      `${OMEGA}/tiktok-views`,
      { url },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );

    if (data?.success || data?.status === 'success' || data?.message) {
      const views  = data?.views || data?.count || data?.amount || 'sent';
      const status = data?.message || data?.status || 'Done';
      return sock.sendMessage(chatId, {
        text:
          `*TikTok Views Sent*\n\n` +
          `*Video:* ${url}\n` +
          `*Views:* ${views}\n` +
          `*Status:* ${status}\n\n` +
          `_Views may take a few minutes to appear._`
      }, { quoted: message });
    }
    throw new Error(data?.error || 'v1 also failed');
  } catch (e) { lastErr = e; }

  // Try GET format
  try {
    const { data } = await axios.get(
      `${OMEGA}/tiktok-views?url=${encodeURIComponent(url)}`,
      { timeout: 30000 }
    );
    if (data?.success || data?.status === 'success') {
      return sock.sendMessage(chatId, {
        text: `Views sent to your video. Should appear within a few minutes.`
      }, { quoted: message });
    }
  } catch (e) { lastErr = e; }

  return sock.sendMessage(chatId, {
    text: `TikTok views failed: ${lastErr?.message?.slice(0, 120)}\n\nMake sure the link is a valid public TikTok video.`
  }, { quoted: message });
}

module.exports = tiktokCommand;
