// 18.33: the master layout templates moved out of app.js into templates.js. The one
// constant was 634 KB on a single line (~560 KB of it four base64 photos), which kept
// app.js too large for GitHub to display. index.html loads templates.js FIRST; app.js
// reads window.FRAME_MASTER_TEMPLATES once and falls back to an empty list.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const TPL = fs.readFileSync(path.join(root, 'templates.js'), 'utf8');

let fails = 0, n = 0;
const check = (label, fn) => { n++; try { fn(); console.log('OK:   ' + label); } catch (e) { fails++; console.log('FAIL: ' + label + ' -> ' + e.message); } };

check('app.js carries no giant line any more', () => {
  const longest = APP.split('\n').reduce((m, l) => Math.max(m, l.length), 0);
  if (longest > 50000) throw new Error('longest line is ' + longest + ' chars; the template data is back in app.js');
  if (APP.indexOf('data:image/jpeg;base64,') >= 0 && APP.indexOf('"name":"Farmboy') >= 0) throw new Error('template data is embedded in app.js again');
});

const load = (withTemplates) => {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = () => ({});
  w.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = w; global.document = w.document; global.navigator = w.navigator;
  const quiet = console.error; console.error = () => {};
  // Two SEPARATE evals, the way two <script> tags run: a const in one would be invisible
  // to the other, which is why the hand-off is a window property.
  try { if (withTemplates) w.eval(TPL); w.eval(APP + '\nwindow.__list = IDML_MASTER_TEMPLATES;'); } finally { console.error = quiet; }
  return w;
};

check('with templates.js loaded first, app.js sees all 34 masters', () => {
  const w = load(true);
  const list = w.__list;
  if (!Array.isArray(list) || list.length !== 34) throw new Error('got ' + (list && list.length));
  if (list[0].name.indexOf('Cover Page') < 0) throw new Error('first master is ' + list[0].name);
  if (list !== w.FRAME_MASTER_TEMPLATES) throw new Error('app.js copied the list, so a master edit would not persist on the shared one');
});

check('without it (a harness, a failed load) the list is empty, not a ReferenceError', () => {
  const w = load(false);
  const list = w.__list;
  if (!Array.isArray(list) || list.length !== 0) throw new Error('expected an empty list');
});

console.log('\n--- Summary ---');
if (fails) { console.log(fails + ' FAILURES'); process.exit(1); }
console.log('ALL PASSED (' + n + ')');
process.exit(0);
