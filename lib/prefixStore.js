const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'data', 'prefix.json');

const DEFAULTS = { prefix: '.', noPrefix: true, offline: false };

function readState() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; }
  catch { return { ...DEFAULTS }; }
}
function writeState(state) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
}
function getPrefix()         { return readState().prefix || '.'; }
function getState()          { return readState(); }
function setPrefix(prefix)   { const s = readState(); s.prefix = prefix; s.noPrefix = false; writeState(s); return s; }
function setNoPrefix(on=true){ const s = readState(); s.noPrefix = !!on; if (on) s.prefix = ''; writeState(s); return s; }
function setOffline(val)     { const s = readState(); s.offline = !!val; writeState(s); return s; }

module.exports = { getPrefix, getState, setPrefix, setNoPrefix, setOffline };
