const { setNoPrefix } = require('../lib/prefixStore');
module.exports = async (sock, chatId, message) => {
  setNoPrefix(true);
  return sock.sendMessage(chatId, { text: 'No-prefix mode enabled.' }, { quoted: message });
};
