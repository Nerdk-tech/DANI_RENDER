const { setPrefix } = require('../lib/prefixStore');
module.exports = async (sock, chatId, message, prefix) => {
  if (!prefix) return sock.sendMessage(chatId, { text: 'Usage: .setprefix <symbol>' }, { quoted: message });
  setPrefix(prefix);
  return sock.sendMessage(chatId, { text: `Prefix set to ${prefix}` }, { quoted: message });
};
