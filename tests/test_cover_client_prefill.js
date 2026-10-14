// 18.56: THE CLIENT TYPED ON THE START SCREEN GOES ON THE COVER.
//
// New project asked for the client, set the dashboard's Client Name, and left the cover
// reading CLIENT NAME. Now the starter's own CLIENT NAME placeholder takes the client.
// Only that exact placeholder: a cover someone already wrote is never touched, and no
// client leaves the placeholder as it was.
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
  '  fresh: function () { editorialContent = _editorialDefaults(); },',
  '  cover: function () { return editorialContent.coverPage.elements.filter(function (e) { return e && e.type === "text"; }).map(function (e) { return e.text; }); },',
  '  setCover: function (i, t) { editorialContent.coverPage.elements[i].text = t; },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
// Landing on the floorplan opens Deck Studio, which jsdom cannot lay out; the cover
// is written before that, so skip the landing.
window._dsGoFloorplanItems = () => {};

check('the starter cover still carries the CLIENT NAME placeholder (else this proves nothing)', () => {
  fx.fresh();
  if (fx.cover().indexOf('CLIENT NAME') < 0) throw new Error('starter cover has no CLIENT NAME line: ' + fx.cover().join(' | '));
});

check('EXACT BUG: a new project puts the client on the cover', () => {
  fx.fresh();
  window._startNewProject({ name: 'Hotel Lobby', client: '  Acme Hotels ', unit: 'in' });
  const t = fx.cover();
  if (t.indexOf('CLIENT NAME') >= 0) throw new Error('cover still says CLIENT NAME');
  if (t.indexOf('Acme Hotels') < 0) throw new Error('client not on the cover: ' + t.join(' | '));
  if (window.document.getElementById('g_client').value !== 'Acme Hotels') throw new Error('dashboard client field not set');
});

check('the heading and subheading are left alone', () => {
  fx.fresh();
  window._startNewProject({ name: 'Hotel Lobby', client: 'Acme', unit: 'in' });
  const t = fx.cover();
  if (t.indexOf('COVER PAGE HEADING') < 0 || t.indexOf('SUBHEADING') < 0) throw new Error('heading or subheading changed: ' + t.join(' | '));
});

check('no client given: the placeholder stays', () => {
  fx.fresh();
  window._startNewProject({ name: 'Hotel Lobby', client: '', unit: 'in' });
  if (fx.cover().indexOf('CLIENT NAME') < 0) throw new Error('placeholder replaced with nothing');
});

check('a cover line someone already wrote is never overwritten', () => {
  fx.fresh();
  const i = fx.cover().indexOf('CLIENT NAME');
  fx.setCover(i, 'THE GRAND');
  window._startNewProject({ name: 'Hotel Lobby', client: 'Acme', unit: 'in' });
  if (fx.cover().indexOf('THE GRAND') < 0) throw new Error('written cover text was replaced');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS: ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)));
if (failed.length) { console.log(failed.length + ' FAILURE' + (failed.length > 1 ? 'S' : '')); process.exit(1); }
console.log('ALL PASSED (' + results.length + ')');
process.exit(0);
