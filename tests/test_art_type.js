// 20.07: THE ART TYPE IS HOW THE PIECE IS BOUGHT, AND THE NOTE FITS THE WORK.
//
// One Park Tower: clay panels bought on Etsy were coded and labelled as originals (FAO),
// shown in the seller's renders, and returned in full when the colour and finish did not
// match. The same deck printed the commission disclaimer on gallery originals. Preflight now
// flags a shop-bought piece coded as an original, a commission note on a page with no
// commission, and a commission with no note; the Text menu has a commission note and an
// original-artwork note to pick from.
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
  '  setup: function (rows, notes) {',
  '    editorialContent = _editorialDefaults();',
  '    dashProjectData = rows.map(r => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), r));',
  '    editorialContent.annotations = {};',
  '    Object.keys(notes || {}).forEach(k => { editorialContent.annotations[k] = [{ type: "note", text: notes[k], x: 0.1, y: 0.8, w: 0.3, h: 0.1 }]; });',
  '    return _artTypePreflight(_deckPageList()).map(x => x.text);',
  '  },',
  '  presets: function () { return _DS_NOTE_PRESETS.map(p => p[0]); },',
  '  note: function (name) { return (_DS_NOTE_PRESETS.find(p => p[0] === name) || [])[1]; },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
window.document.querySelectorAll('[id^="specInc_"]').forEach(e => { e.checked = true; });
const R = (o) => Object.assign({ id: 'ART.1', product: 'Framed Art', extW: 24, extH: 30, artworkUrl: 'data:image/png;base64,AA' }, o);
const any = (list, re) => list.some(t => re.test(t));

check('EXACT BUG: an original (FAO) bought on Etsy is flagged as a shop piece', () => {
  const pf = fx.setup([R({ imageCode: 'FAO.010.00031', sourceUrl: 'https://www.etsy.com/listing/123/clay-panel' })]);
  if (!any(pf, /ART\.1 — bought from etsy\.com but coded as an original/)) throw new Error(pf.join(' | '));
});

check('the same piece coded FSO, or an FAO from a gallery, is fine', () => {
  if (fx.setup([R({ imageCode: 'FSO.010.00031', sourceUrl: 'https://www.etsy.com/listing/123' })]).some(t => /bought from/.test(t))) throw new Error('FSO flagged');
  if (fx.setup([R({ imageCode: 'FAO.010.00031', sourceUrl: 'https://ninomiergallery.com/artists/x' })]).some(t => /bought from/.test(t))) throw new Error('gallery flagged');
});

check('EXACT BUG: the commission note on a page of gallery originals is flagged', () => {
  const pf = fx.setup([R({ imageCode: 'FAO.010.00031' })], { 'spec:ART.1': fx.note('Commission note') });
  if (!any(pf, /carries the commission note, but nothing on it is a commission/)) throw new Error(pf.join(' | '));
});

check('a commission with its note is fine; a commission without one is flagged', () => {
  if (any(fx.setup([R({ imageCode: 'FCM.010.00002' })], { 'spec:ART.1': fx.note('Commission note') }), /commission/)) throw new Error('flagged a correct page');
  const pf = fx.setup([R({ imageCode: 'FCM.010.00002' })]);
  if (!any(pf, /ART\.1 is a commission with no commission note/)) throw new Error(pf.join(' | '));
});

check('the Text menu offers a commission note and an original-artwork note, and they say different things', () => {
  const p = fx.presets();
  if (p.indexOf('Commission note') < 0 || p.indexOf('Original artwork note') < 0) throw new Error(p.join(', '));
  const re = /represents the artist.?s style|may differ in composition/i;
  if (!re.test(fx.note('Commission note'))) throw new Error('the commission note would not be recognised');
  if (re.test(fx.note('Original artwork note'))) throw new Error('the original note reads as a commission note');
});

check('Preflight runs it', () => {
  const S = APP.slice(APP.indexOf('function _dsRunPreflight'), APP.indexOf('function _pfBadgeSchedule'));
  if (S.indexOf('_artTypePreflight(pages)') < 0) throw new Error('not wired into Preflight');
});

const bad = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
console.log('\n--- Summary ---');
console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad.length ? 1 : 0);
