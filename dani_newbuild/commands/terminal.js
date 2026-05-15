const { exec } = require('child_process');

// Only safe, non-destructive commands allowed
const ALLOWED = /^(curl\s|touch\s|ls(\s|$)|pwd$|echo\s|cat\s|whoami$|date$|uname|node\s)/i;

async function terminalCommand(sock, chatId, message, cmd) {
  if (!cmd) return sock.sendMessage(chatId, { text: `Give me a command to run.` }, { quoted: message });

  if (!ALLOWED.test(cmd.trim())) {
    return sock.sendMessage(chatId, {
      text: `I can only run: curl, touch, ls, pwd, echo, cat, whoami, date, uname, node.\nNothing destructive.`
    }, { quoted: message });
  }

  return new Promise((resolve) => {
    exec(cmd, { timeout: 10000 }, async (err, stdout, stderr) => {
      const out = (stdout || stderr || err?.message || 'No output').slice(0, 2000);
      await sock.sendMessage(chatId, { text: `\`\`\`\n${out}\n\`\`\`` }, { quoted: message });
      resolve();
    });
  });
}

module.exports = terminalCommand;
