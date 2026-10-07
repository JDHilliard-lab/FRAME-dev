// DROP AN IMAGE ON A SPEC PAGE (17.88): "We also made it possible to drag images onto
// the spec pages to swap images in frames." The frame under the pointer is found from
// the rects the renderer recorded; a single-piece page takes the drop anywhere.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const NL = String.fromCharCode(10);
const results = [];
const check = (label, fn) => { try { fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;
const quiet = console.error; console.error = () => {};
window.eval(APP + NL + [
  '_autosaveToldUser = true;',
  'window.__applied = [];',
  'processArtworkFile = function (f, cb) { cb("data:image/png;base64," + "Q".repeat(100), f.name.replace(/[.][^.]+$/, ""), 10, 10); };',
  'applyArtworkToRowIndex = function (idx, url, name) { window.__applied.push({ idx: idx, name: name }); };',
  '_dsRefresh = function () {}; _dsRenderCenter = function () {}; _dsPriorityRerender = function () {};',
  '_toast = function (t) { window.__toasted = t; return null; };',
  'window.__fx = { wire: _dsWireSpecArtDrop, rects: _specArtRects, key: _deckPageKey, set rows(v) { dashProjectData = v; } };',
].join(NL));
console.error = quiet;
const fx = window.__fx;
const doc = window.document;

const mkPage = () => {
  const p = doc.createElement('div');
  p.getBoundingClientRect = () => ({ left: 0, top: 0, width: 936, height: 540, right: 936, bottom: 540 });
  doc.body.appendChild(p);
  return p;
};
const drop = (page, x, y, name) => {
  const e = new window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clientX', { value: x }); Object.defineProperty(e, 'clientY', { value: y });
  Object.defineProperty(e, 'dataTransfer', { value: { types: ['Files'], files: [{ name: name || 'lake.jpg', type: 'image/jpeg' }] } });
  page.dispatchEvent(e);
};
const rows = [{ id: 'ART.1A' }, { id: 'ART.1B' }, { id: 'ART.2' }];

check('EXACT ASK: an image dropped on frame B of a group page goes to B', () => {
  fx.rows = rows;
  const desc = { kind: 'spec', row: rows[0], members: [rows[0], rows[1]], _ovKey: 'ART.1', title: 'ART.1' };
  fx.rects[fx.key(desc)] = [{ id: 'ART.1A', x: 400, y: 100, w: 100, h: 150 }, { id: 'ART.1B', x: 600, y: 100, w: 100, h: 100 }];
  const page = mkPage(); fx.wire(page, desc);
  window.__applied = [];
  drop(page, 650, 150, 'lake.jpg');
  if (window.__applied.length !== 1 || window.__applied[0].idx !== 1) throw new Error('applied ' + JSON.stringify(window.__applied));
  if (window.__applied[0].name !== 'lake') throw new Error('file name not carried');
});

check('a drop between frames on a group page places nothing and says why', () => {
  const desc = { kind: 'spec', row: rows[0], members: [rows[0], rows[1]], _ovKey: 'ART.1', title: 'ART.1' };
  const page = mkPage(); fx.wire(page, desc);
  window.__applied = []; window.__toasted = null;
  drop(page, 560, 400);
  if (window.__applied.length) throw new Error('placed an image with no frame under the pointer');
  if (!window.__toasted) throw new Error('said nothing');
});

check('a single-piece page takes the drop anywhere on it', () => {
  const desc = { kind: 'spec', row: rows[2], _ovKey: 'ART.2', title: 'ART.2' };
  fx.rects[fx.key(desc)] = [];
  const page = mkPage(); fx.wire(page, desc);
  window.__applied = [];
  drop(page, 20, 20);
  if (window.__applied.length !== 1 || window.__applied[0].idx !== 2) throw new Error('applied ' + JSON.stringify(window.__applied));
});

check('a non-image file is ignored', () => {
  const desc = { kind: 'spec', row: rows[2], _ovKey: 'ART.2', title: 'ART.2' };
  const page = mkPage(); fx.wire(page, desc);
  window.__applied = [];
  const e = new window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: { types: ['Files'], files: [{ name: 'notes.pdf', type: 'application/pdf' }] } });
  page.dispatchEvent(e);
  if (window.__applied.length) throw new Error('a PDF was put in a frame');
});

check('the drop goes through applyArtworkToRowIndex, the path with undo and the duplicate check', () => {
  const a = APP.indexOf('function _dsWireSpecArtDrop');
  const body = APP.slice(a, APP.indexOf(NL + '}', a));
  if (body.indexOf('applyArtworkToRowIndex(idx') < 0) throw new Error('a private write path');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
console.log(NL + '--- Summary ---');
if (failed.length) console.log(failed.length + ' FAILURES');
else console.log('ALL PASSED (' + results.length + ')');
