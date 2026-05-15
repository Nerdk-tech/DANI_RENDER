const fs = require('fs');
const path = require('path');
function ensureDir(p){ fs.mkdirSync(p, { recursive:true }); }
function loadJson(file, fallback){ try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch { return fallback; } }
function saveJson(file, data){ ensureDir(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
module.exports = { ensureDir, loadJson, saveJson };
