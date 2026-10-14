// 18.53: "RESET PAGE ORDER" DOES NOT APPEAR ON A BRAND-NEW PROJECT.
//
// The rail counted every inserted page with an afterKey as hand-placed. The starter
// deck's Moodboard is anchored after Good Art. Good People. by _starterDeck itself, so a
// fresh project showed "Reset page order (1)", and pressing it MOVED the Moodboard away
// from where the starter deck puts it. _dsPageHandPlaced now treats a starter page on its
// starter anchor as home, and reset puts a moved starter page back on that anchor.
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
  '  get pages() { return editorialContent.layoutPages; },',
  '  fresh: function () { editorialContent = _editorialDefaults(); },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;

let toasts = [];
window._toast = (t) => { toasts.push(String(t)); return null; };
window._confirmDestroy = (o) => { o.onConfirm(); };
window._dsRefresh = () => {};

const MOOD = 'pg5ef7lopj50a';
const mood = () => fx.pages.find(p => p && p.id === MOOD);

check('the starter deck still anchors its Moodboard after the slogan (else this test proves nothing)', () => {
  fx.fresh();
  const m = mood();
  if (!m) throw new Error('no starter Moodboard page');
  if (m.afterKey !== 'fixed:slogan') throw new Error('starter Moodboard afterKey is ' + m.afterKey);
});

check('EXACT BUG: a fresh project has no hand-placed pages', () => {
  fx.fresh();
  const n = fx.pages.filter(window._dsPageHandPlaced).length;
  if (n !== 0) throw new Error(n + ' hand-placed page(s) on a fresh project');
});

check('EXACT BUG: reset on a fresh project changes nothing and says so', () => {
  fx.fresh(); toasts = [];
  window._dsResetLayoutOrder();
  if (mood().afterKey !== 'fixed:slogan') throw new Error('reset moved the starter Moodboard to ' + mood().afterKey);
  if (!toasts.some(t => t.indexOf('Nothing to reset') >= 0)) throw new Error('no "Nothing to reset" nudge');
});

check('a Moodboard moved by hand counts, and reset puts it back after the slogan', () => {
  fx.fresh();
  mood().afterKey = 'fixed:cover';
  if (!window._dsPageHandPlaced(mood())) throw new Error('a moved Moodboard is not counted');
  window._dsResetLayoutOrder();
  if (mood().afterKey !== 'fixed:slogan') throw new Error('reset sent the Moodboard to ' + mood().afterKey);
});

check('a page the designer inserted still counts and still resets to its template place', () => {
  fx.fresh();
  const pg = { id: 'pgTest1', type: 'custom', title: 'Mine', elements: [], afterKey: 'fixed:cover' };
  fx.pages.push(pg);
  if (!window._dsPageHandPlaced(pg)) throw new Error('an inserted page is not counted');
  window._dsResetLayoutOrder();
  if (pg.afterKey) throw new Error('reset left the inserted page anchored');
  if (pg.place !== 'afterStrategy') throw new Error('reset did not give it the default place');
});

check('the rail button counts with the same predicate as reset', () => {
  const r = APP.indexOf("'↺ Reset page order ('");
  if (r < 0) throw new Error('rail reset label not found');
  const near = APP.slice(APP.lastIndexOf('const handPlaced', r), r);
  if (near.indexOf('_dsPageHandPlaced') < 0) throw new Error('the rail counts hand-placed pages its own way');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS: ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)));
if (failed.length) { console.log(failed.length + ' FAILURE' + (failed.length > 1 ? 'S' : '')); process.exit(1); }
console.log('ALL PASSED (' + results.length + ')');
process.exit(0);
