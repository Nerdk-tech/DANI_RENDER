const fs   = require('fs');
const path = require('path');

const VCF_FILE  = path.join(__dirname, '../data/vcf_contacts.json');
const STATE_FILE = path.join(__dirname, '../data/vcf_state.json');

function loadContacts() {
  try { return JSON.parse(fs.readFileSync(VCF_FILE, 'utf8')); } catch { return []; }
}
function saveContacts(c) {
  fs.mkdirSync(path.dirname(VCF_FILE), { recursive: true });
  fs.writeFileSync(VCF_FILE, JSON.stringify(c, null, 2));
}
function getState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { open: false }; }
}
function setState(s) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

// Build a .vcf file buffer from contact list
function buildVCF(contacts) {
  const cards = contacts.map((c, i) => {
    const num = c.number.replace(/\D/g, '');
    const name = c.name || `Contact ${i + 1}`;
    return `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;TYPE=CELL:+${num}\nEND:VCARD`;
  });
  return Buffer.from(cards.join('\n'), 'utf8');
}

async function vcfCommand(sock, chatId, message, arg, senderNum, isMaster) {
  const a = (arg || '').toLowerCase().trim();

  // ── Admin: open/close submissions ──────────────────────────────────────────
  if (a === 'open') {
    setState({ open: true });
    return sock.sendMessage(chatId, {
      text: `*VCF submissions are now OPEN.*\n\nAnyone can now submit their number.\nSend: *dani vcf join* or *vcf join*`
    }, { quoted: message });
  }

  if (a === 'close') {
    setState({ open: false });
    const contacts = loadContacts();
    return sock.sendMessage(chatId, {
      text: `*VCF submissions are now CLOSED.*\n\n${contacts.length} contact(s) collected so far.\nSend *dani vcf send* to distribute the VCF file.`
    }, { quoted: message });
  }

  // ── Admin: send the VCF file to this chat ──────────────────────────────────
  if (a === 'send') {
    const contacts = loadContacts();
    if (contacts.length === 0) return sock.sendMessage(chatId, { text: `No contacts collected yet.` }, { quoted: message });
    const vcfBuf = buildVCF(contacts);
    const tmpPath = path.join(require('os').tmpdir(), `dani-contacts-${Date.now()}.vcf`);
    fs.writeFileSync(tmpPath, vcfBuf);
    await sock.sendMessage(chatId, {
      document: fs.readFileSync(tmpPath),
      mimetype: 'text/vcard',
      fileName: `Dani_Contacts_${contacts.length}.vcf`,
      caption: `*Dani VCF* — ${contacts.length} contacts.\nSave to your phone and all these people will be in your contacts. They'll see your status!`
    }, { quoted: message });
    try { fs.unlinkSync(tmpPath); } catch {}
    return;
  }

  // ── Admin: clear all contacts ──────────────────────────────────────────────
  if (a === 'clear') {
    saveContacts([]);
    return sock.sendMessage(chatId, { text: `Contact list cleared.` }, { quoted: message });
  }

  // ── Admin: list contacts ───────────────────────────────────────────────────
  if (a === 'list') {
    const contacts = loadContacts();
    if (contacts.length === 0) return sock.sendMessage(chatId, { text: `No contacts yet.` }, { quoted: message });
    const list = contacts.slice(0, 50).map((c, i) => `${i+1}. ${c.name || 'Unknown'} — +${c.number}`).join('\n');
    return sock.sendMessage(chatId, { text: `*VCF Contacts (${contacts.length})*\n\n${list}${contacts.length > 50 ? `\n...and ${contacts.length - 50} more` : ''}` }, { quoted: message });
  }

  // ── User: join — submit your number ───────────────────────────────────────
  if (a === 'join' || a === 'submit' || a === 'add' || a === '') {
    const state = getState();
    if (!state.open) return sock.sendMessage(chatId, {
      text: `VCF submissions are currently closed. Check back later.`
    }, { quoted: message });

    const num = senderNum.replace(/\D/g, '');
    if (!num || num.length < 7) return sock.sendMessage(chatId, { text: `Couldn't get your number. Try sending your number manually: _dani vcf join 2349120000000_` }, { quoted: message });

    // Get display name from WhatsApp
    let name = 'Dani Contact';
    try {
      const pushName = message.pushName || message.verifiedBizName || '';
      if (pushName) name = pushName;
    } catch {}

    const contacts = loadContacts();
    const exists = contacts.find(c => c.number.replace(/\D/g, '') === num);
    if (exists) return sock.sendMessage(chatId, { text: `You're already in the list.` }, { quoted: message });

    contacts.push({ number: num, name, addedAt: new Date().toISOString() });
    saveContacts(contacts);

    return sock.sendMessage(chatId, {
      text: `Done! You've been added to the VCF list.\n\nWhen the file is sent, save the contacts and everyone will see your WhatsApp status. You're number *${contacts.length}* on the list.`
    }, { quoted: message });
  }

  // ── Status check ───────────────────────────────────────────────────────────
  if (a === 'status') {
    const state = getState();
    const contacts = loadContacts();
    return sock.sendMessage(chatId, {
      text: `*Dani VCF*\n\nSubmissions: _${state.open ? 'OPEN' : 'CLOSED'}_\nContacts collected: _${contacts.length}_`
    }, { quoted: message });
  }

  // Default help
  return sock.sendMessage(chatId, {
    text: `*Dani VCF*\n\nGet 500+ WhatsApp status views by saving each other's contacts.\n\n*Commands:*\ndani vcf join — add yourself to the list\ndani vcf status — check if submissions are open`
  }, { quoted: message });
}

module.exports = vcfCommand;
