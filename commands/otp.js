const axios = require('axios');
const PREXZY = 'https://apis.prexzyvilla.site/vnum';

function isHtml(d) { return typeof d === 'string' && d.trimStart().startsWith('<'); }

// VeePN supported countries (real list from their API)
const VEEPN_COUNTRIES = [
  { code: 'US', flag: '🇺🇸', name: 'United States' },
  { code: 'UK', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'CA', flag: '🇨🇦', name: 'Canada' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: 'DE', flag: '🇩🇪', name: 'Germany' },
  { code: 'FR', flag: '🇫🇷', name: 'France' },
  { code: 'SE', flag: '🇸🇪', name: 'Sweden' },
  { code: 'NL', flag: '🇳🇱', name: 'Netherlands' },
  { code: 'PL', flag: '🇵🇱', name: 'Poland' },
  { code: 'UA', flag: '🇺🇦', name: 'Ukraine' },
  { code: 'RU', flag: '🇷🇺', name: 'Russia' },
  { code: 'IN', flag: '🇮🇳', name: 'India' },
  { code: 'PH', flag: '🇵🇭', name: 'Philippines' },
  { code: 'ID', flag: '🇮🇩', name: 'Indonesia' },
  { code: 'VN', flag: '🇻🇳', name: 'Vietnam' },
  { code: 'TH', flag: '🇹🇭', name: 'Thailand' },
  { code: 'MY', flag: '🇲🇾', name: 'Malaysia' },
  { code: 'BR', flag: '🇧🇷', name: 'Brazil' },
  { code: 'MX', flag: '🇲🇽', name: 'Mexico' },
  { code: 'NG', flag: '🇳🇬', name: 'Nigeria' },
];

function extractNumber(item) {
  if (typeof item === 'string') return item.replace(/\D/g,'');
  return (item?.number ?? item?.phone ?? item?.num ?? item?.value ?? '');
}

async function getNumber(country) {
  // Try VeePN
  try {
    const { data } = await axios.get(
      `${PREXZY}/veepn-numbers?country=${country}`,
      { timeout: 18000 }
    );
    if (!isHtml(data) && data) {
      const list = data?.result ?? data?.data ?? data?.numbers ?? (Array.isArray(data) ? data : []);
      if (Array.isArray(list) && list.length > 0) {
        const num = extractNumber(list[0]);
        if (num && num.length > 5) return { number: num, source: 'VeePN' };
      }
    }
  } catch {}

  // Try SMS24
  try {
    const { data } = await axios.get(
      `${PREXZY}/sms24-numbers?country=${country}`,
      { timeout: 18000 }
    );
    if (!isHtml(data) && data) {
      const list = data?.result ?? data?.data ?? data?.numbers ?? (Array.isArray(data) ? data : []);
      if (Array.isArray(list) && list.length > 0) {
        const num = extractNumber(list[0]);
        if (num && num.length > 5) return { number: num, source: 'SMS24' };
      }
    }
  } catch {}

  return null;
}

async function getMessages(number) {
  const clean = String(number).replace(/\D/g, '');

  // Try VeePN messages
  try {
    const { data } = await axios.get(
      `${PREXZY}/veepn-messages?number=${clean}&page=1&count=10`,
      { timeout: 18000 }
    );
    if (!isHtml(data) && data) {
      const list = data?.result ?? data?.data ?? data?.messages ?? (Array.isArray(data) ? data : []);
      if (Array.isArray(list) && list.length > 0) return { messages: list, source: 'VeePN' };
    }
  } catch {}

  // Try SMS24 messages
  try {
    const { data } = await axios.get(
      `${PREXZY}/sms24-messages?number=${clean}`,
      { timeout: 18000 }
    );
    if (!isHtml(data) && data) {
      const list = data?.result ?? data?.data ?? data?.messages ?? (Array.isArray(data) ? data : []);
      if (Array.isArray(list) && list.length > 0) return { messages: list, source: 'SMS24' };
    }
  } catch {}

  return null;
}

async function otpCommand(sock, chatId, message, arg) {
  const parts = (arg || '').trim().split(/\s+/);
  const sub   = (parts[0] || '').toLowerCase();

  // Country list
  if (!sub || sub === 'country' || sub === 'countries') {
    const grouped =
      `🌍 *Africa*\n🇳🇬 NG — Nigeria\n\n` +
      `🌎 *Americas*\n🇺🇸 US — United States\n🇨🇦 CA — Canada\n🇧🇷 BR — Brazil\n🇲🇽 MX — Mexico\n\n` +
      `🌍 *Europe*\n🇬🇧 UK — United Kingdom\n🇩🇪 DE — Germany\n🇫🇷 FR — France\n🇸🇪 SE — Sweden\n🇳🇱 NL — Netherlands\n🇵🇱 PL — Poland\n🇺🇦 UA — Ukraine\n🇷🇺 RU — Russia\n\n` +
      `🌏 *Asia*\n🇮🇳 IN — India\n🇵🇭 PH — Philippines\n🇮🇩 ID — Indonesia\n🇻🇳 VN — Vietnam\n🇹🇭 TH — Thailand\n🇲🇾 MY — Malaysia\n\n` +
      `🌏 *Oceania*\n🇦🇺 AU — Australia\n\n` +
      `*Get a number:* _dani number [code]_\nExample: _dani number US_\n\n` +
      `*Check messages:* _dani otp [number]_`;

    return sock.sendMessage(chatId, { text: grouped }, { quoted: message });
  }

  // Get number
  if (sub === 'number' || sub === 'num' || sub === 'get') {
    const countryRaw = parts[1] || 'US';
    const country    = countryRaw.toUpperCase();
    const countryInfo = VEEPN_COUNTRIES.find(c => c.code === country);
    const flag = countryInfo?.flag || '🌐';
    const name = countryInfo?.name || country;

    await sock.sendMessage(chatId, { text: `Getting a ${flag} ${name} number...` }, { quoted: message });

    const result = await getNumber(country);
    if (!result) {
      return sock.sendMessage(chatId, {
        text: `No numbers available for ${flag} *${name}* right now.\n\nTry another country — say _dani country_ to see all options.`
      }, { quoted: message });
    }

    return sock.sendMessage(chatId, {
      text:
        `*Virtual Number — ${flag} ${name}*\n\n` +
        `*Number:* \`${result.number}\`\n` +
        `*Source:* ${result.source}\n\n` +
        `Use this to receive OTPs.\n` +
        `To check messages: _dani otp ${result.number}_\n\n` +
        `_Numbers are shared — use quickly before they expire._`
    }, { quoted: message });
  }

  // Check OTP messages
  if (sub === 'otp' || sub === 'msg' || sub === 'messages' || sub === 'check') {
    const number = parts[1];
    if (!number) {
      return sock.sendMessage(chatId, {
        text: `Provide the number to check.\nExample: _dani otp 12025551234_`
      }, { quoted: message });
    }

    await sock.sendMessage(chatId, { text: `Checking messages for \`${number}\`...` }, { quoted: message });

    const result = await getMessages(number);
    if (!result || result.messages.length === 0) {
      return sock.sendMessage(chatId, {
        text: `No messages for \`${number}\` yet.\n\nMessages take up to 2 minutes to arrive. Try again soon.`
      }, { quoted: message });
    }

    const formatted = result.messages.slice(0, 5).map((m, i) => {
      const from = m.from || m.sender || m.originator || 'Unknown';
      const text = m.text || m.body || m.message || m.content || JSON.stringify(m);
      const time = m.time || m.created_at || m.date || '';
      return `*${i+1}.* From: _${from}_\n${text}${time ? `\n_${time}_` : ''}`;
    }).join('\n\n');

    return sock.sendMessage(chatId, {
      text: `*Messages for* \`${number}\` *(${result.source})*\n\n${formatted}`
    }, { quoted: message });
  }

  // Default help
  return sock.sendMessage(chatId, {
    text:
      `*Dani OTP & Virtual Numbers*\n\n` +
      `_dani country_ — see available countries\n` +
      `_dani number [country]_ — get a virtual number\n` +
      `_dani otp [number]_ — check received OTPs\n\n` +
      `Example:\n_dani number US_\n_dani otp 12025551234_`
  }, { quoted: message });
}

module.exports = otpCommand;
