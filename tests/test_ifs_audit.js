// 20.04: WHAT TEN STUDIO PROJECTS KEPT CATCHING AFTER ISSUE, CAUGHT BEFORE IT.
//
// Reading ten real projects V1 to install, vendors and PMs found the same things in issued
// decks: placeholder text (a filler bio went to a client), pieces with no size or frame code,
// framed paper with no glass, canvas with no stretcher depth, originals with no title or
// artist (17 titles added during one install), OPTION headings in a final IFS, two
// placements with one code, and covers or headings carrying a stale version or stage (a
// whole correction round on one project). Preflight now says so. "Is this an IFS" also
// reads the presentation type (Final Spec, Install Guide): the footer box is 4 characters.
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
  '  setup: function (rows, type) {',
  '    editorialContent = _editorialDefaults();',
  '    if (type) editorialContent.presentationType = type;',
  '    dashProjectData = rows.map(r => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), r));',
  '  },',
  '  run: function () { return _dsRunPreflight().filter(x => x.sev !== "spell"); },',
  '  ec: function () { return editorialContent; },',
  '  cover: function () { return _fixedPageFor("cover").page; },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
window.document.querySelectorAll('[id^="specInc_"]').forEach(e => { e.checked = true; });
const ver = window.document.getElementById('specPdfVersion');
const has = (issues, re, sev) => issues.some(x => re.test(x.text) && (!sev || x.sev === sev));
const OK_ROW = { id: 'ART.1', imageCode: 'FJH.010.00001', product: 'Framed Art', extW: 24, extH: 30, fCode: 'MICH 132-29', glass: 'Acrylic', artworkUrl: 'data:image/png;base64,AA' };

check('EXACT BUG: the starter deck’s filler is flagged on the page it sits on', () => {
  fx.setup([OK_ROW]); ver.value = '';
  const pf = fx.run();
  if (!has(pf, /Cover — still says .CLIENT NAME/)) throw new Error(pf.map(x => x.text).join(' | '));
  if (!has(pf, /still says .*HEADING/)) throw new Error('section headings not flagged');
});

check('EXACT BUG: a filler paragraph on a page is caught (a filler bio once went to a client)', () => {
  fx.setup([OK_ROW]); ver.value = '';
  fx.ec().layoutPages = [{ id: 'pgBio', type: 'custom', title: 'Featured artist', afterKey: 'fixed:cover', elements: [{ type: 'text', text: 'The oldest known paravian fossils come from the Jurassic.' }] }];
  if (!has(fx.run(), /Featured artist — still says .paravian/i)) throw new Error('missed');
});

check('filler is a warning in a draft and an error in an IFS', () => {
  fx.setup([OK_ROW], 'concept'); ver.value = '';
  if (!has(fx.run(), /CLIENT NAME/, 'warn')) throw new Error('not a warning in concept');
  fx.setup([OK_ROW], 'final');
  if (!has(fx.run(), /CLIENT NAME/, 'err')) throw new Error('not an error in Final Spec');
});

check('two placements with one code, punctuation aside, are an error in any deck', () => {
  fx.setup([OK_ROW, Object.assign({}, OK_ROW, { id: 'ART-1' })], 'concept');
  if (!has(fx.run(), /ART\.1 and ART-1 — two placements with the same code/, 'err')) throw new Error(fx.run().map(x => x.text).join(' | '));
});

check('EXACT BUG: Final Spec catches no size, no frame code, no glass, no stretcher depth', () => {
  fx.setup([
    Object.assign({}, OK_ROW, { id: 'ART.1', extW: 0, fCode: '' }),
    Object.assign({}, OK_ROW, { id: 'ART.2', glass: '' }),
    Object.assign({}, OK_ROW, { id: 'ART.3', product: 'Frameless Canvas (Wrapped)', canvasDepth: 0 }),
  ], 'final');
  const pf = fx.run();
  if (!has(pf, /ART\.1 — no overall size or frame code in an IFS/, 'err')) throw new Error(pf.map(x => x.text).join(' | '));
  if (!has(pf, /ART\.2 — no glass in an IFS/, 'warn')) throw new Error('glass');
  if (!has(pf, /ART\.3 — no stretcher depth in an IFS/, 'warn')) throw new Error('stretcher depth');
  if (has(pf, /ART\.3 — .*glass/)) throw new Error('a wrapped canvas was asked for glass');
});

check('EXACT BUG: an original or commission with no title or artist is flagged in an IFS (labels, invoices)', () => {
  fx.setup([Object.assign({}, OK_ROW, { id: 'ART.4', imageCode: 'FAO.010.00007', artworkTitle: 'N/A', artist: '' })], 'final');
  if (!has(fx.run(), /ART\.4 — no title, artist in an IFS/)) throw new Error(fx.run().map(x => x.text).join(' | '));
  fx.setup([Object.assign({}, OK_ROW, { id: 'ART.4', imageCode: 'FJH.010.00007', artworkTitle: '', artist: '' })], 'final');
  if (has(fx.run(), /ART\.4 — no title/)) throw new Error('a licensed print was asked for a title');
});

check('none of the IFS data checks fire before the IFS', () => {
  fx.setup([Object.assign({}, OK_ROW, { extW: 0, fCode: '', glass: '' })], 'artdev');
  if (has(fx.run(), /in an IFS/)) throw new Error(fx.run().map(x => x.text).join(' | '));
});

check('Final Spec and Install Guide are an IFS even when the footer box just says V6', () => {
  fx.setup([OK_ROW], 'final'); ver.value = 'V6';
  if (!window._deckIsIFS()) throw new Error('Final Spec is not an IFS');
  fx.setup([OK_ROW], 'install');
  if (!window._deckIsIFS()) throw new Error('Install Guide is not an IFS');
  fx.setup([OK_ROW], 'artdev');
  if (window._deckIsIFS()) throw new Error('Art Development read as an IFS');
  ver.value = '';
});

check('an OPTION heading is flagged in an IFS, not in development', () => {
  const opt = [{ id: 'pgO', type: 'custom', title: 'Lobby', afterKey: 'fixed:cover', elements: [{ type: 'text', text: 'LOBBY OPTION TWO' }] }];
  fx.setup([OK_ROW], 'final'); fx.ec().layoutPages = opt;
  if (!has(fx.run(), /Lobby — an OPTION heading in an IFS/)) throw new Error('missed');
  fx.setup([OK_ROW], 'artdev'); fx.ec().layoutPages = opt;
  if (has(fx.run(), /OPTION heading/)) throw new Error('flagged in development');
});

check('EXACT BUG: a stale version or stage on the cover is flagged against the Project tab', () => {
  fx.setup([OK_ROW], 'final'); ver.value = 'V6';
  fx.cover().elements = [{ type: 'text', text: 'CAESARS PALACE VILLAS' }, { type: 'text', text: 'V2 ART DEVELOPMENT' }];
  const pf = fx.run();
  if (!has(pf, /Cover — says V2, .ART DEVELOPMENT., but this deck is V6 Final Spec/)) throw new Error(pf.map(x => x.text).join(' | '));
  fx.cover().elements = [{ type: 'text', text: 'V6 ISSUED FOR SPECIFICATION' }];
  if (has(fx.run(), /but this deck is/)) throw new Error('a correct cover was flagged');
  ver.value = '';
});

check('a version-like word in body copy is not a version (a V8 engine in a Ford narrative)', () => {
  fx.setup([OK_ROW], 'final'); ver.value = 'V6';
  fx.ec().layoutPages = [{ id: 'pgN', type: 'custom', title: 'Narrative', afterKey: 'fixed:cover', elements: [{ type: 'text', text: 'The plant built the V8 that changed everything.' }] }];
  if (has(fx.run(), /Narrative — says V8/)) throw new Error('flagged body copy');
  ver.value = '';
});

const bad = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
console.log('\n--- Summary ---');
console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad.length ? 1 : 0);
