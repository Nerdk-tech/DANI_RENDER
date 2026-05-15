const axios = require('axios');

function isHtml(d) {
  return typeof d === 'string' && d.trimStart().startsWith('<');
}

// Scrape DuckDuckGo instant answers API (no HTML returned to user)
async function duckDuckGo(query) {
  try {
    const { data } = await axios.get(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { timeout: 12000 }
    );
    if (isHtml(data)) return null;

    const results = [];

    // Abstract (Wikipedia-style answer)
    if (data?.AbstractText && data.AbstractText.length > 20) {
      results.push(`*${data.AbstractTitle || query}*\n${data.AbstractText}`);
    }

    // Answer (quick fact)
    if (data?.Answer && data.Answer.length > 3) {
      results.push(`*Answer:* ${data.Answer}`);
    }

    // Related topics
    if (data?.RelatedTopics?.length > 0) {
      const topics = data.RelatedTopics
        .filter(t => t.Text && t.Text.length > 10)
        .slice(0, 3)
        .map((t, i) => `${i + 1}. ${t.Text}${t.FirstURL ? '\n   ' + t.FirstURL : ''}`);
      if (topics.length) results.push(topics.join('\n\n'));
    }

    return results.length > 0 ? results.join('\n\n') : null;
  } catch { return null; }
}

// Fallback: DuckDuckGo HTML scrape for real web results
async function duckDuckGoWeb(query) {
  try {
    const { data } = await axios.get(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        timeout: 12000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DaniBot/1.0)' }
      }
    );
    if (!data || typeof data !== 'string') return null;

    // Extract result snippets without exposing DDG branding
    const titleMatches   = [...data.matchAll(/class="result__title"[^>]*>.*?<a[^>]*>([^<]+)<\/a>/gs)];
    const snippetMatches = [...data.matchAll(/class="result__snippet"[^>]*>([^<]+)</gs)];

    const results = [];
    for (let i = 0; i < Math.min(4, snippetMatches.length); i++) {
      const title   = titleMatches[i]?.[1]?.trim() || '';
      const snippet = snippetMatches[i]?.[1]?.trim() || '';
      if (snippet.length > 15) {
        results.push(`*${i+1}. ${title || 'Result'}*\n${snippet}`);
      }
    }
    return results.length > 0 ? results.join('\n\n') : null;
  } catch { return null; }
}

// Fallback JSON APIs
async function jsonSearch(query) {
  const enc = encodeURIComponent(query);
  const apis = [
    `https://api.siputzx.my.id/api/search/google?query=${enc}`,
    `https://omegatech-api.dixonomega.tech/api/tools/google-search?query=${enc}`,
    `https://apis.prexzyvilla.site/search?q=${enc}`,
    `https://api.nekorinn.my.id/search/google?q=${enc}`,
  ];

  for (const url of apis) {
    try {
      const { data } = await axios.get(url, { timeout: 12000 });
      if (isHtml(data) || !data) continue;

      const arr = data?.result ?? data?.data ?? data?.results ?? data?.items ?? data?.organic ?? [];
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.slice(0, 4).map((r, i) => {
          const title   = r.title || r.name || '';
          const snippet = r.snippet || r.description || r.body || r.content || '';
          const link    = r.link || r.url || '';
          return `*${i+1}. ${title}*${snippet ? '\n' + snippet : ''}${link ? '\n' + link : ''}`;
        }).join('\n\n');
      }

      const t = data?.answer ?? data?.text ?? data?.response;
      if (t && typeof t === 'string' && t.length > 10) return t;
    } catch { continue; }
  }
  return null;
}

async function searchCommand(sock, chatId, message, q) {
  if (!q) return sock.sendMessage(chatId, { text: `What do you want me to search for?` }, { quoted: message });

  await sock.sendPresenceUpdate('composing', chatId).catch(() => {});

  // Try DDG instant answers first (fastest, cleanest)
  let result = await duckDuckGo(q);

  // Fallback: DDG web scrape
  if (!result) result = await duckDuckGoWeb(q);

  // Final fallback: JSON APIs
  if (!result) result = await jsonSearch(q);

  await sock.sendPresenceUpdate('paused', chatId).catch(() => {});

  if (result) {
    return sock.sendMessage(chatId, {
      text: `*${q}*\n\n${result.slice(0, 3500)}`
    }, { quoted: message });
  }

  return sock.sendMessage(chatId, {
    text: `Couldn't find results for _${q}_. Try rephrasing or ask me directly.`
  }, { quoted: message });
}

module.exports = searchCommand;
