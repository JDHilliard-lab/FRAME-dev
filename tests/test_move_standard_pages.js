// 20.03: THE STANDARD PAGES CAN BE MOVED.
//
// Asked for after reading ten real studio decks: Process + Timeline sat at the END of some
// presentations and Frame Recommendations in different places, while FRAME fixed both. The
// standard pages (not the cover) now move like an inserted page: drag, page number, or
// before/after. A move is stored in editorialContent.pagePlace[key] = the key the page
// follows, and _deckPageList resolves it in the same pass as inserted pages' afterKey.
// These checks run the REAL page list and the REAL move.
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
  '  fresh: function (layout) { editorialContent = _editorialDefaults(); editorialContent.layoutPages = layout || []; return this.list(); },',
  '  list: function () { _dsPages = _deckPageList(); return _dsPages.map(_deckPageKey); },',
  '  desc: function (key) { return _dsPages.find(d => _deckPageKey(d) === key); },',
  '  move: function (key, to) { this.list(); const ok = _dsMovePageTo(this.desc(key), to); return { ok: ok, keys: this.list() }; },',
  '  ec: function () { return editorialContent; },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;

// Every standard page on, whatever the markup defaults are.
window.document.querySelectorAll('[id^="specInc_"]').forEach(e => { e.checked = true; });
window._dsRefresh = () => {};
window._dsSelectPage = () => {};
window._confirmDestroy = (o) => { o.onConfirm(); };
window._toast = () => null;

const STD = ['fixed:cover', 'card:timeline', 'fixed:understanding', 'fixed:narrative', 'fixed:strategy', 'card:frameRec', 'fixed:slogan', 'card:contacts'];
const std = (keys) => keys.filter(k => STD.indexOf(k) >= 0);

check('an untouched deck keeps the usual order (else the checks below prove nothing)', () => {
  const k = std(fx.fresh());
  if (k.join() !== STD.join()) throw new Error(k.join(' > '));
});

check('EXACT ASK: Process / Timeline moves to the end of the presentation, and stays there', () => {
  fx.fresh();
  const last = fx.list().length - 1;
  const r = fx.move('card:timeline', last);
  if (!r.ok) throw new Error('the move was refused');
  if (r.keys[r.keys.length - 1] !== 'card:timeline') throw new Error('last page is ' + r.keys[r.keys.length - 1]);
  if (std(r.keys).join() !== ['fixed:cover', 'fixed:understanding', 'fixed:narrative', 'fixed:strategy', 'card:frameRec', 'fixed:slogan', 'card:contacts', 'card:timeline'].join()) throw new Error(std(r.keys).join(' > '));
  if (fx.ec().pagePlace['card:timeline'] !== 'card:contacts') throw new Error('stored as ' + JSON.stringify(fx.ec().pagePlace));
  // a rebuild (what every redraw and the PDF export do) reads it back the same
  if (fx.list()[fx.list().length - 1] !== 'card:timeline') throw new Error('lost on rebuild');
});

check('EXACT ASK: Frame Recommendations goes where the designer puts it (straight after the cover)', () => {
  fx.fresh();
  const r = fx.move('card:frameRec', 1);
  if (r.keys[1] !== 'card:frameRec') throw new Error(r.keys.slice(0, 4).join(' > '));
  if (r.keys[2] !== 'card:timeline') throw new Error('the rest of the deck shifted: ' + r.keys.slice(0, 4).join(' > '));
});

check('a page that followed the moved page stays where it was, not dragged along', () => {
  const L = { id: 'pgL', type: 'custom', title: 'Divider', elements: [], afterKey: 'card:timeline' };
  const before = fx.fresh([L]);
  if (before.indexOf('layout:pgL') !== before.indexOf('card:timeline') + 1) throw new Error('setup: ' + before.join(' > '));
  const r = fx.move('card:timeline', r0len() - 1);
  if (r.keys[1] !== 'layout:pgL') throw new Error('the divider moved too: ' + r.keys.slice(0, 4).join(' > '));
  if (r.keys[r.keys.length - 1] !== 'card:timeline') throw new Error('timeline is not last');
  function r0len() { return before.length; }
});

check('a standard page dropped between an anchor and an inserted page lands in that gap', () => {
  const L = { id: 'pgM', type: 'custom', title: 'Mood', elements: [], afterKey: 'fixed:cover' };
  const k0 = fx.fresh([L]);
  if (k0[1] !== 'layout:pgM') throw new Error('setup: ' + k0.slice(0, 3).join(' > '));
  const r = fx.move('fixed:slogan', 1);
  if (r.keys.slice(0, 3).join() !== 'fixed:cover,fixed:slogan,layout:pgM') throw new Error(r.keys.slice(0, 4).join(' > '));
});

check('an inserted page can be anchored after a moved standard page, and follows it', () => {
  fx.fresh();
  fx.move('card:frameRec', 1);
  fx.ec().layoutPages = [{ id: 'pgN', type: 'custom', title: 'Frames intro', elements: [], afterKey: 'card:frameRec' }];
  const k = fx.list();
  if (k.indexOf('layout:pgN') !== k.indexOf('card:frameRec') + 1) throw new Error(k.slice(0, 5).join(' > '));
});

check('the cover never moves, and says why', () => {
  fx.fresh();
  if (window._dsMovePageTo(fx.desc('fixed:cover'), 3)) throw new Error('the cover moved');
  if (fx.list()[0] !== 'fixed:cover') throw new Error('cover is not first');
  if (!window._dsPageLockNote(fx.desc('fixed:cover'))) throw new Error('no reason given');
});

check('a moved page travels with the project: file, undo snapshot', () => {
  fx.fresh();
  fx.move('card:timeline', fx.list().length - 1);
  const ed = window._editorialFromFile(JSON.parse(JSON.stringify(fx.ec())));
  if (!ed.pagePlace || ed.pagePlace['card:timeline'] !== 'card:contacts') throw new Error('lost in the file: ' + JSON.stringify(ed.pagePlace));
  const snap = JSON.stringify(window.snapshotProjectState());
  if (snap.indexOf('pagePlace') < 0) throw new Error('not in the undo snapshot');
});

check('Reset page order counts moved standard pages and puts them back', () => {
  fx.fresh();
  fx.move('card:timeline', fx.list().length - 1);
  fx.move('card:frameRec', 1);
  if (window._dsHandPlacedCount() !== 2) throw new Error('count ' + window._dsHandPlacedCount());
  window._dsResetLayoutOrder();
  if (std(fx.list()).join() !== STD.join()) throw new Error(std(fx.list()).join(' > '));
  if (window._dsHandPlacedCount() !== 0) throw new Error('count after reset ' + window._dsHandPlacedCount());
});

check('a moved page that is switched off is simply absent, and nothing else shifts', () => {
  fx.fresh();
  fx.move('card:timeline', fx.list().length - 1);
  const e = window.document.getElementById('specInc_timeline');
  if (!e) throw new Error('no Process / Timeline checkbox to switch off');
  e.checked = false;
  try {
    const k = std(fx.list());
    if (k.indexOf('card:timeline') >= 0) throw new Error('still listed');
    if (k.join() !== STD.filter(x => x !== 'card:timeline').join()) throw new Error(k.join(' > '));
  } finally { e.checked = true; }
});

const bad = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
console.log('\n--- Summary ---');
console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad.length ? 1 : 0);
