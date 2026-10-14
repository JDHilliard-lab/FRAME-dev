// 18.59: THE FOUR "APPLY TO..." BUTTONS ON A SPEC PAGE ARE ONE LINE, SHOWN ONLY WHEN THE
// PAGE HAS ITS OWN LAYOUT.
//
// Apply to current page / all pages / this elevation / selected items were built for the
// layout cards removed in 18.31: they copied the card you had ARMED to a scope. Nothing
// arms any more, so on an ordinary page they copied the deck layout onto itself. A page
// carries its own layout only from an older project; then one line says so and offers
// Reset this page and Copy to... (a menu: all pages, this elevation, chosen items).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message + (process.env.DBG ? e.stack : '') }); }
};

const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;
const quiet = console.error; console.error = () => {}; const qlog = console.log; console.log = () => {};
window.eval(APP + NL + [
  '_autosaveToldUser = true;',
  'window.__fx = {',
  '  get ov() { return editorialContent.specTemplateOverrides; },',
  '  get deckTpl() { return editorialContent.specTemplate; },',
  '  pages: function () { _dsPages = _deckPageList(); return _dsPages; },',
  '  setIdx: function (i) { _dsIndex = i; _dsActiveTab = "pages"; },',
  '  setDeckTpl: function (k) { editorialContent.specTemplate = k; },',
  '  addPiece: function () { _placementMint("framed", _placementSetChoices()[0].value, false); },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
const doc = window.document;

// The rebuild after a change paints thumbnails and the centre, which jsdom cannot.
window._dsRenderCenter = () => {}; window._dsBuildAllThumbs = () => {}; window._dsPriorityRerender = () => {};
window.scheduleAutosave = () => {};

// A second piece, so Choose items has something to tick besides this page.
fx.addPiece();
const specIdx = () => fx.pages().findIndex(d => d.kind === 'spec');
const render = () => {
  const i = specIdx();
  if (i < 0) throw new Error('no spec page in the deck');
  fx.setIdx(i);
  window._dsRenderTools();
  return fx.pages()[i];
};
const panelText = () => (doc.getElementById('dsToolsPageBody') || doc.body).textContent;

check('EXACT BUG: an ordinary spec page shows no Apply-to buttons at all', () => {
  render();
  const t = panelText();
  ['Apply to current page', 'Apply to all pages', 'Apply to this elevation', 'Apply to selected items'].forEach(s => {
    if (t.indexOf(s) >= 0) throw new Error('"' + s + '" is back');
  });
  if (doc.querySelector('.ds-own-layout')) throw new Error('the own-layout line shows on a page that uses the deck layout');
});

check('a page with its own layout says so, with Reset and Copy to', () => {
  const d = render();
  const k = d._ovKey || d.row.id;
  fx.ov[k] = 'custom';
  render();
  const line = doc.querySelector('.ds-own-layout');
  if (!line) throw new Error('no own-layout line');
  if (line.textContent.indexOf('its own layout') < 0) throw new Error('line does not say why it is there');
  const btns = Array.prototype.map.call(line.querySelectorAll('button'), b => b.textContent.trim());
  if (btns.join('|') !== 'Reset this page|Copy to…') throw new Error('buttons are ' + btns.join('|'));
});

check('Reset this page drops the override', () => {
  const d = render();
  const k = d._ovKey || d.row.id;
  fx.ov[k] = 'custom';
  render();
  Array.prototype.find.call(doc.querySelectorAll('.ds-own-layout button'), b => b.textContent.trim() === 'Reset this page').click();
  if (fx.ov[k]) throw new Error('override still there: ' + fx.ov[k]);
});

check('Copy to > All pages makes it the deck layout and clears every override', () => {
  const d = render();
  const k = d._ovKey || d.row.id;
  const was = fx.deckTpl;
  fx.ov[k] = 'custom';
  render();
  Array.prototype.find.call(doc.querySelectorAll('.ds-own-layout button'), b => b.textContent.indexOf('Copy to') === 0).click();
  const items = doc.querySelectorAll('.frame-menu button');
  const all = Array.prototype.find.call(items, b => b.textContent.indexOf('All pages') === 0);
  if (!all) throw new Error('no All pages in the menu');
  all.click();
  if (fx.deckTpl !== 'custom') throw new Error('deck layout is ' + fx.deckTpl);
  if (Object.keys(fx.ov).length) throw new Error('overrides left: ' + JSON.stringify(fx.ov));
  fx.setDeckTpl(was);
});

check('Copy to > Choose items opens the checklist and copies only the ticked codes', () => {
  const d = render();
  const k = d._ovKey || d.row.id;
  fx.ov[k] = 'custom';
  render();
  Array.prototype.find.call(doc.querySelectorAll('.ds-own-layout button'), b => b.textContent.indexOf('Copy to') === 0).click();
  Array.prototype.find.call(doc.querySelectorAll('.frame-menu button'), b => b.textContent.indexOf('Choose items') === 0).click();
  const pick = doc.querySelector('.ds-own-pick');
  if (!pick || pick.style.display === 'none') throw new Error('checklist did not open');
  const boxes = pick.querySelectorAll('input[type="checkbox"]');
  if (!boxes.length) throw new Error('nothing to tick (the deck needs a second spec page)');
  Array.prototype.some.call(boxes, b => b.value === k) && (() => { throw new Error('the page lists itself'); })();
  boxes[0].checked = true;
  Array.prototype.find.call(pick.querySelectorAll('button'), b => b.textContent.indexOf('Copy to ticked') === 0).click();
  if (fx.ov[boxes[0].value] !== 'custom') throw new Error('ticked code did not get the layout');
  if (boxes[1] && fx.ov[boxes[1].value]) throw new Error('an unticked code got it too');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS: ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)));
if (failed.length) { console.log(failed.length + ' FAILURE' + (failed.length > 1 ? 'S' : '')); process.exit(1); }
console.log('ALL PASSED (' + results.length + ')');
process.exit(0);
