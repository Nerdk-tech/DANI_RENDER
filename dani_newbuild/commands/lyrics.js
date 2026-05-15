const axios = require('axios');

async function lyricsCommand(sock, chatId, message, query) {
  if (!query) return sock.sendMessage(chatId, {
    text: `Tell me the song.\nExample: _dani lyrics The Night We Met Lord Huron_`
  }, { quoted: message });

  await sock.sendMessage(chatId, { text: `Finding lyrics for _${query}_...` }, { quoted: message });

  try {
    const { data } = await axios.get(
      `https://apis.prexzyvilla.site/ai/genlyrics?prompt=${encodeURIComponent(query)}`,
      { timeout: 25000 }
    );

    const lyrics = data?.result ?? data?.data ?? data?.lyrics ?? data?.text ?? data?.message;
    if (!lyrics || String(lyrics).trim().length < 20) {
      return sock.sendMessage(chatId, {
        text: `Couldn't find lyrics for _${query}_. Try the exact song name and artist.`
      }, { quoted: message });
    }

    const text = String(lyrics).trim();
    // Split into chunks if too long for one message
    if (text.length <= 3500) {
      return sock.sendMessage(chatId, {
        text: `*${query}*\n\n${text}`
      }, { quoted: message });
    }

    // Send in parts
    const chunks = [];
    let i = 0;
    while (i < text.length) {
      chunks.push(text.slice(i, i + 3500));
      i += 3500;
    }
    for (let j = 0; j < chunks.length; j++) {
      await sock.sendMessage(chatId, {
        text: j === 0 ? `*${query}*\n\n${chunks[j]}` : chunks[j]
      }, j === 0 ? { quoted: message } : {});
    }
  } catch (e) {
    return sock.sendMessage(chatId, {
      text: `Lyrics fetch failed. ${e.message?.slice(0, 100)}`
    }, { quoted: message });
  }
}

module.exports = lyricsCommand;
