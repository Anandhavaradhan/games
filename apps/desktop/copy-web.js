// Copies the hub page and every game folder into apps/desktop/www before packaging.
// New game folders are picked up automatically.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const out = path.join(__dirname, 'www');
const SKIP_DIRS = new Set(['apps', 'hollowmere-v3-android', 'node_modules']);
const skipFile = (name) => name === 'admin.html' || name.endsWith('.rules') || name.endsWith('.rules.json') || name.endsWith('.md');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
let games = 0;
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
  if (!fs.existsSync(path.join(root, entry.name, 'index.html'))) continue;
  fs.cpSync(path.join(root, entry.name), path.join(out, entry.name), { recursive: true, filter: (src) => !skipFile(path.basename(src)) });
  games++;
}
console.log('copied the hub and ' + games + ' game folder(s) to ' + out);
