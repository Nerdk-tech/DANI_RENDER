const axios = require('axios');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

function isHtml(d) {
  return typeof d === 'string' && d.trimStart().startsWith('<');
}

function findAudioUrl(obj, depth = 0) {
  if (depth > 8 || !obj) return null;
  if (typeof obj === 'string') {
    const s = obj.trim();
    if (/^https?:\/\/.+\.(mp3|mp4|m4a|ogg|opus|wav|aac)(\?.*)?$/i.test(s)) return s;
    if (/^https?:\/\/.+(\/audio\/|\/dl\/|\/download\/|\/stream\/|\/mp3\/)/.test(s)) return s;
    return null;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) { const r = findAudioUrl(item, depth+1); if (r) return r; }
    return null;
  }
  if (typeof obj === 'object') {
    for (const k of ['download_url','download','dl','url','mp3','audio','link','stream','src','media','file','mp3_url','audio_url','downloadUrl','result']) {
      if (obj[k]) { const r = findAudioUrl(obj[k], depth+1); if (r) return r; }
    }
    for (const k of Object.keys(obj)) {
      const r = findAudioUrl(obj[k], depth+1); if (r) return r;
    }
  }
  return null;
}

// ── Primary: David Cyril API ─────────────────────────────────────────────────
async function tryDavidCyril(query) {
  try {
    const { data } = await axios.get(
      `https://apis.davidcyril.name.ng/play?query=${encodeURIComponent(query)}&apikey=`,
      { timeout: 60000 }
    );
    if (!data?.status || !data?.result?.download_url) return null;

    const audioResp = await axios.get(data.result.download_url, {
      responseType: 'arraybuffer',
      timeout: 120000,
    });
    const buf = Buffer.from(audioResp.data);
    if (buf.length < 1000) return null;

    return {
      buffer:    buf,
      title:     data.result.title    || query,
      duration:  data.result.duration || '',
      views:     data.result.views    || 0,
      thumbnail: data.result.thumbnail || '',
      videoUrl:  data.result.video_url || '',
    };
  } catch { return null; }
}

// ── YouTube search ────────────────────────────────────────────────────────────
async function getYouTubeUrl(query) {
  const enc  = encodeURIComponent(query);
  // Use YouTube Data API v3 if key is set, else free endpoints
  const ytKey = process.env.YOUTUBE_API_KEY;
  if (ytKey) {
    try {
      const { data } = await axios.get(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${enc}&type=video&maxResults=1&key=${ytKey}`,
        { timeout: 10000 }
      );
      const id = data?.items?.[0]?.id?.videoId;
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    } catch {}
  }

  // Free fallbacks
  const apis = [
    `https://api.siputzx.my.id/api/search/youtube?query=${enc}`,
    `https://api.nekorinn.my.id/search/youtube?query=${enc}`,
    `https://api.ryzendesu.vip/api/search/yt?query=${enc}`,
  ];
  for (const url of apis) {
    try {
      const { data } = await axios.get(url, { timeout: 12000 });
      if (isHtml(data)) continue;
      const items = data?.result ?? data?.data ?? data?.videos ?? data?.items ?? [];
      const list  = Array.isArray(items) ? items : [];
      const first = list[0];
      if (!first) continue;
      const id   = first?.id ?? first?.videoId ?? first?.video_id;
      const link = first?.url ?? first?.link ?? first?.videoUrl;
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(String(id))) return `https://www.youtube.com/watch?v=${id}`;
      if (link && (link.includes('youtube.com') || link.includes('youtu.be'))) return link;
    } catch { continue; }
  }
  return null;
}

// ── Fallback downloaders ──────────────────────────────────────────────────────
async function tryFallbackDownloaders(target) {
  const enc  = encodeURIComponent(target);
  const apis = [
    `https://api.privatezia.biz.id/api/downloader/ytmp3?url=${enc}`,
    `https://api.siputzx.my.id/api/downloader/ytmp3?url=${enc}`,
    `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${enc}`,
    `https://izumiiiiiiii.dpdns.org/downloader/youtube-play?query=${enc}`,
    `https://apis.prexzyvilla.site/download/ytdownload?url=${enc}&type=audio&format=mp3&quality=128`,
    `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${enc}`,
    `https://api.nekorinn.my.id/downloader/youtube?url=${enc}`,
  ];
  for (const url of apis) {
    try {
      const { data } = await axios.get(url, { timeout: 40000 });
      if (isHtml(data)) continue;
      const found = findAudioUrl(data);
      if (found) return found;
    } catch { continue; }
  }
  return null;
}

async function playCommand(sock, chatId, message, query) {
  if (!query) return sock.sendMessage(chatId, { text: `What do you want me to play?` }, { quoted: message });

  await sock.sendMessage(chatId, { text: `Give me a sec, looking for _${query}_.` }, { quoted: message });

  // ── Step 1: David Cyril (best — downloads buffer + sends with metadata card) ──
  const result = await tryDavidCyril(query);
  if (result) {
    try {
      return await sock.sendMessage(chatId, {
        audio:    result.buffer,
        mimetype: 'audio/mpeg',
        fileName: `${result.title}.mp3`,
        contextInfo: {
          externalAdReply: {
            thumbnailUrl:          result.thumbnail,
            title:                 result.title,
            body:                  `${result.views ? `👁️ ${Number(result.views).toLocaleString()} • ` : ''}⏱️ ${result.duration}`,
            sourceUrl:             result.videoUrl,
            renderLargerThumbnail: true,
            mediaType:             1,
          },
        },
      }, { quoted: message });
    } catch {
      // contextInfo failed — send plain
      return sock.sendMessage(chatId, {
        audio:    result.buffer,
        mimetype: 'audio/mpeg',
        fileName: `${result.title}.mp3`,
      }, { quoted: message });
    }
  }

  // ── Step 2: YouTube search → fallback downloaders ────────────────────────
  let audioUrl = null;

  if (query.includes('youtube.com') || query.includes('youtu.be')) {
    audioUrl = await tryFallbackDownloaders(query);
  } else {
    const ytUrl = await getYouTubeUrl(query);
    if (ytUrl) audioUrl = await tryFallbackDownloaders(ytUrl);
    if (!audioUrl) audioUrl = await tryFallbackDownloaders(query);
  }

  if (audioUrl) {
    return sock.sendMessage(chatId, {
      audio:    { url: audioUrl },
      mimetype: 'audio/mpeg',
      fileName: `${query}.mp3`,
    }, { quoted: message });
  }

  return sock.sendMessage(chatId, {
    text: `Couldn't find _${query}_. Try pasting the YouTube link directly.`
  }, { quoted: message });
}

module.exports = playCommand;
