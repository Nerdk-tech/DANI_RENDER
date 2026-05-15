const { getState, setPrefix, setNoPrefix, setOffline } = require('../lib/prefixStore');

async function settingsCommand(sock, chatId, message, arg) {
  const state = getState();
  const a = (arg || '').toLowerCase().trim();

  if (!a) {
    const panel =
`*Dani Settings*

*Prefix:* _${state.prefix || 'none'}_
*No-prefix mode:* _${state.noPrefix ? 'on' : 'off'}_
*Status:* _${state.offline ? 'offline (silent)' : 'online'}_
*Voice:* _Dani5_ (default)

*Commands:*
dani settings prefix . — set prefix
dani settings noprefix — respond to everything
dani settings voice — voice info
dani settings off — go silent
dani settings on — come back online
dani settings reset — reset to default`;
    return sock.sendMessage(chatId, { text: panel }, { quoted: message });
  }

  if (a.startsWith('prefix')) {
    const p = arg.replace(/^prefix\s*/i, '').trim();
    if (!p) return sock.sendMessage(chatId, { text: `Specify a prefix. Example: _dani settings prefix ._` }, { quoted: message });
    setPrefix(p);
    return sock.sendMessage(chatId, { text: `Prefix set to *${p}*.` }, { quoted: message });
  }

  if (a === 'noprefix') {
    setNoPrefix(true);
    return sock.sendMessage(chatId, { text: `No-prefix mode on. Responding to everything now.` }, { quoted: message });
  }

  if (a === 'off') {
    setOffline(true);
    return sock.sendMessage(chatId, { text: `Going silent. Say _dani settings on_ to bring me back.` }, { quoted: message });
  }

  if (a === 'on') {
    setOffline(false);
    return sock.sendMessage(chatId, { text: `I'm back.` }, { quoted: message });
  }

  if (a === 'reset') {
    setPrefix('.');
    setNoPrefix(false);
    setOffline(false);
    return sock.sendMessage(chatId, { text: `Settings reset. Prefix is _._ and no-prefix mode is off.` }, { quoted: message });
  }

  if (a === 'voice') {
    return sock.sendMessage(chatId, {
      text: `*Voice Profiles*\n\nDani, Dani2, Dani3, Dani4, Dani5\nCurrent: _Dani5_\nSwitching: coming soon.`
    }, { quoted: message });
  }

  return sock.sendMessage(chatId, { text: `Unknown setting. Say _dani settings_ to see options.` }, { quoted: message });
}

module.exports = settingsCommand;
