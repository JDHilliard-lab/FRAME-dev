// THE APP'S OWN CHROME IS SET IN THE STUDIO'S TYPE (17.85). The body was system-ui, so
// the tool that builds Farmboy decks in Druk, Messina and the brand Sans spoke in
// whatever the OS shipped. Plain Node: these are questions about the source.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const NL = String.fromCharCode(10);
const results = [];
const check = (label, fn) => { try { fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

check('the body reads the brand Sans, not the OS face', () => {
  if (CSS.indexOf('body { font-family: var(--ui-font);') < 0) throw new Error('body is not on --ui-font');
  if (CSS.indexOf('font-family: system-ui, -apple-system, sans-serif;') >= 0) throw new Error('the system-ui stack is back');
});

check('--ui-font IS the font library brand Sans stack, so the two cannot drift', () => {
  const a = APP.indexOf("token: 'sans'");
  const lib = APP.slice(a, APP.indexOf(NL, a));
  const m = lib.indexOf('css: "') + 6;
  const stack = lib.slice(m, lib.indexOf('"', m)).split(',').map(s => s.trim()).join(',');
  const c = CSS.indexOf('--ui-font:') + 10;
  const ui = CSS.slice(c, CSS.indexOf(';', c)).split(',').map(s => s.trim()).join(',');
  if (stack !== ui) throw new Error('library sans "' + stack + '" vs UI "' + ui + '"');
});

check('headings that name a place (view tabs, section titles) are Druk', () => {
  if (CSS.indexOf("--ui-display: 'Druk',") < 0) throw new Error('--ui-display does not lead with Druk');
  ['.nav-tab {' + NL + '    font-family: var(--ui-display);', '.section-title {' + NL + '    font-family: var(--ui-display);'].forEach(k => {
    if (CSS.indexOf(k) < 0) throw new Error('missing: ' + k.split(NL)[0]);
  });
  if (HTML.indexOf("@font-face { font-family: 'Druk'") < 0) throw new Error('Druk is never loaded for the page');
});

check('buttons and fields inherit it (they do not by default)', () => {
  if (CSS.indexOf('button, input, select, textarea { font-family: inherit; }') < 0) throw new Error('form controls keep the OS face');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
console.log(NL + '--- Summary ---');
if (failed.length) console.log(failed.length + ' FAILURES');
else console.log('ALL PASSED (' + results.length + ')');
