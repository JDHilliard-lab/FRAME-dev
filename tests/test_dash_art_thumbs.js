// 18.61: AN ARTWORK THUMBNAIL ON EVERY DASHBOARD ROW.
//
// A 22px picture at the left of the Img Code cell, or a dashed slot when the piece has no
// artwork yet. Artwork is often a multi-megabyte data URL and the table re-renders on most
// edits, so the table must never carry the full image: each source is shrunk once to a
// small JPEG and cached (key = length + tail), placeholders swap in place when it lands.
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
  '  rows: function (r) { dashProjectData = r; dashSelectedRowIndex = -1; },',
  '  cache: _dashThumbCache, max: DASH_THUMB_CACHE_MAX,',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
const doc = window.document;

// A "big" artwork: long enough that putting it in the table would be the bug.
const BIG = 'data:image/png;base64,' + 'A'.repeat(200000) + 'END1';
const BIG2 = 'data:image/png;base64,' + 'A'.repeat(200000) + 'END2';
const row = (id, art) => Object.assign({}, { id, product: 'Framed Art', location: 'LOBBY', imageCode: id + '_IMG', extW: 24, extH: 24, fW: 0.75, qty: 1 }, art ? { artworkUrl: art } : {});
const render = () => { window.renderDashTable(); return doc.getElementById('rfiBody'); };

check('a row with no artwork shows the dashed empty slot', () => {
  fx.cache.clear();
  fx.rows([row('ART.1')]);
  const b = render();
  if (!b.querySelector('.dash-art-empty')) throw new Error('no empty slot');
  if (b.querySelector('img.dash-art-thumb')) throw new Error('an image for a row with no artwork');
});

check('EXACT RISK: the full artwork never goes into the table, only a keyed placeholder', () => {
  fx.cache.clear();
  fx.rows([row('ART.1', BIG)]);
  const b = render();
  // The KEY carries the last 32 characters on purpose, so look for the image BODY.
  if (b.innerHTML.indexOf('A'.repeat(1000)) >= 0 || b.innerHTML.length > 100000) throw new Error('the megabyte data URL is in the table HTML');
  const p = b.querySelector('.dash-art-pending[data-art-thumb-key]');
  if (!p) throw new Error('no placeholder while the thumbnail is made');
  if (p.getAttribute('data-art-thumb-key') !== window._dashArtThumbKey(BIG)) throw new Error('placeholder key does not match');
});

check('when the thumbnail lands it swaps in place, without re-rendering the row', () => {
  fx.cache.clear();
  fx.rows([row('ART.1', BIG)]);
  const b = render();
  const tr = b.querySelector('tr');
  window._dashArtThumbDone(window._dashArtThumbKey(BIG), 'data:image/jpeg;base64,SMALL');
  if (b.querySelector('tr') !== tr) throw new Error('the row was rebuilt');
  const im = tr.querySelector('img.dash-art-thumb');
  if (!im || im.getAttribute('src') !== 'data:image/jpeg;base64,SMALL') throw new Error('placeholder not swapped');
});

check('a cached thumbnail renders straight away on the next render', () => {
  fx.rows([row('ART.1', BIG)]);
  const b = render();
  if (b.querySelector('.dash-art-pending')) throw new Error('re-made a cached thumbnail');
  if (!b.querySelector('img.dash-art-thumb')) throw new Error('no image from the cache');
});

check('the key tells two same-length images apart (a swap shows the new one)', () => {
  if (window._dashArtThumbKey(BIG) === window._dashArtThumbKey(BIG2)) throw new Error('same key for different pictures');
  if (window._dashArtThumbKey(BIG).length > 60) throw new Error('the key carries the whole URL');
});

check('the cache is bounded', () => {
  fx.cache.clear();
  for (let i = 0; i < fx.max + 25; i++) window._dashArtThumbDone('k' + i, 'data:image/jpeg;base64,x');
  if (fx.cache.size > fx.max) throw new Error('cache grew to ' + fx.cache.size);
  if (fx.cache.has('k0')) throw new Error('the oldest entry survived');
  fx.cache.clear();
});

check('EXACT BUG (18.62): the x2 same-image badge does not sit on the thumbnail', () => {
  fx.cache.clear();
  const r1 = row('ART.1', BIG), r2 = row('ART.2', BIG);
  r1.imageCode = r2.imageCode = 'SAME_CODE';
  fx.rows([r1, r2]);
  const td = render().querySelector('.dash-same-img');
  if (!td) throw new Error('setup: no badge for a shared image');
  const cell = td.parentElement;
  const kids = Array.prototype.slice.call(cell.children);
  if (kids.indexOf(cell.querySelector('.dash-art-thumb')) > kids.indexOf(td)) throw new Error('badge comes before the thumbnail');
  const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const i = CSS.indexOf('.dash-same-img {'), rule = CSS.slice(i, CSS.indexOf('}', i));
  if (rule.indexOf('right:') < 0 || rule.indexOf('left: 2px') >= 0) throw new Error('badge is pinned to the left, over the thumbnail');
  if (CSS.indexOf('.dash-same-img + .tbl-in { padding-right:') < 0) throw new Error('the code runs under the badge');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS: ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)));
if (failed.length) { console.log(failed.length + ' FAILURE' + (failed.length > 1 ? 'S' : '')); process.exit(1); }
console.log('ALL PASSED (' + results.length + ')');
process.exit(0);
