// 20.10: WILL IT PRINT SHARP. In several of the ten studio projects a picture was proposed,
// approved and quoted before anyone found it was a web image. FRAME keeps a 1200 px copy, so it
// never knew the original's size. The import now records the file's own pixels on the link
// (artLink.pw / ph) and Preflight reads them against the print size.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message + (process.env.DBG ? e.stack : '') }); }
};

const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {}, getImageData: () => ({ data: [] }) });
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
window.fetch = () => Promise.reject(new Error('no network in test'));
// A decoder that reports a 4000 x 3000 original.
window.Image = class { set src(v) { this._s = v; this.naturalWidth = 4000; this.naturalHeight = 3000; setTimeout(() => this.onload && this.onload(), 0); } get src() { return this._s; } };
global.window = window; global.document = window.document; global.navigator = window.navigator;
const quiet = console.error; console.error = () => {}; const qlog = console.log; console.log = () => {};
window.eval(APP + NL + [
  '_autosaveToldUser = true;',
  'window.__fx = {',
  '  setup: function (rows, stage) {',
  '    editorialContent = _editorialDefaults(); dashUnit = "in";',
  '    if (stage) editorialContent.presentationType = stage;',
  '    dashProjectData = rows.map(r => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), r));',
  '    return _printResPreflight();',
  '  },',
  '  ppi: function (r) { return _artPrintPpi(Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), r)); },',
  '  imp: function (file) { return new Promise(res => processArtworkFile(file, (u, n, w, h) => { const o = {}; _linkAttach(o); res({ o: o, w: w, h: h }); })); },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
// A wrapped canvas with no wrap prints at its overall size, which keeps the numbers plain.
const R = (o) => Object.assign({ id: 'ART.1', product: 'Frameless Canvas (Wrapped)', canvasWrap: 0, extW: 40, extH: 30, artworkUrl: 'data:image/jpeg;base64,AA', imageCode: 'FGD.010.00001' }, o);

(async () => {
  await check('EXACT BUG: a 1200 x 900 web image proposed at 40 x 30 in is flagged with its ppi', () => {
    const pf = fx.setup([R({ artLink: { id: 'x', pw: 1200, ph: 900 } })]);
    if (pf.length !== 1 || pf[0].text.indexOf('ART.1') !== 0 || pf[0].text.indexOf('1200 × 900 px: 30 ppi') < 0) throw new Error(JSON.stringify(pf));
    if (pf[0].sev !== 'warn' || !pf[0].go || pf[0].go.rowId !== 'ART.1') throw new Error('severity / go ' + JSON.stringify(pf[0]));
  });
  await check('the same picture is an error in a Final Spec deck', () => {
    const pf = fx.setup([R({ artLink: { id: 'x', pw: 1200, ph: 900 } })], 'final');
    if (!pf.length || pf[0].sev !== 'err') throw new Error(JSON.stringify(pf));
  });
  await check('a 6000 x 4500 original at the same size passes; a picture imported before 20.10 is not judged', () => {
    if (fx.setup([R({ artLink: { id: 'x', pw: 6000, ph: 4500 } })]).length) throw new Error('flagged a sharp file');
    if (fx.setup([R({ artLink: { id: 'x' } })]).length || fx.setup([R({})]).length) throw new Error('judged a picture with no recorded pixels');
  });
  await check('cover fit: the tighter axis decides, and a zoomed crop uses fewer pixels', () => {
    if (Math.round(fx.ppi(R({ artLink: { pw: 6000, ph: 3000 } }))) !== 100) throw new Error('tighter axis ' + fx.ppi(R({ artLink: { pw: 6000, ph: 3000 } })));
    if (Math.round(fx.ppi(R({ artLink: { pw: 6000, ph: 4500 }, artZoom: 2 }))) !== 75) throw new Error('zoom');
  });
  await check('a wallcovering is held to a lower bar (read from further away)', () => {
    const big = { product: 'Wallcovering (EGD)', extW: 120, extH: 96, bleed: 0, artLink: { pw: 10000, ph: 8000 } };
    if (fx.setup([R(big)]).length) throw new Error('83 ppi wallcovering flagged');
    if (!fx.setup([R(Object.assign({}, big, { artLink: { pw: 6000, ph: 4800 } }))]).length) throw new Error('50 ppi wallcovering passed');
  });
  await check('the import records the ORIGINAL pixels on the link, not the 1200 px copy', async () => {
    const f = new window.File(['x'], 'FGD.010.00001.jpg', { type: 'image/jpeg' });
    const r = await fx.imp(f);
    if (r.w !== 1200) throw new Error('kept copy ' + r.w);
    if (r.o.artLink.pw !== 4000 || r.o.artLink.ph !== 3000) throw new Error(JSON.stringify(r.o.artLink));
    const svg = await fx.imp(new window.File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));
    if ('pw' in svg.o.artLink) throw new Error('an SVG prints at any size, yet got pixels');
  });
  await check('Preflight runs it', () => {
    const S = APP.slice(APP.indexOf('function _dsRunPreflight'), APP.indexOf('function _pfBadgeSchedule'));
    if (S.indexOf('_printResPreflight()') < 0) throw new Error('not wired into Preflight');
  });
  const bad = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
