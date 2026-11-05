// 20.16: three rules from the real 2026 quote template (.xltx) that FRAME got wrong or never
// checked: the twelve 10% royalty artists (FRAME knew only PEN), the 0.125in bleed on a
// printed panel (FRAME gave none, and the RFQ labelled the panel EGD), and the maximum sizes
// a framer can make from one sheet, roll or stick. Plus the floater check: a stretcher
// deeper than the floater's rabbet stands proud of the frame.
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
  '  setup: function (rows, stage, unit) {',
  '    editorialContent = _editorialDefaults(); dashUnit = unit || "in";',
  '    if (stage) editorialContent.presentationType = stage;',
  '    dashProjectData = rows.map(r => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), r));',
  '    return _maxMakePreflight();',
  '  },',
  '  royalty: function (code) { return _rowRoyaltyAuto({ imageCode: code }); },',
  '  bleed: function (p) { return _flatBleedIn(p); },',
  '  mount: function (r) { return _rfqMount(r); },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
const R = (o) => Object.assign({ id: 'ART.1', product: 'Framed Art', fW: 1, m1A: true, m1T: 3, m1B: 3, m1L: 3, m1R: 3, m1ColorName: 'White', glass: '2mm Standard', extW: 24, extH: 30 }, o);
const has = (pf, s) => pf.some(i => i.text.indexOf(s) >= 0);

// 1. Royalties
check('EXACT BUG: all twelve 10% artists from the template take 10%, not just PEN', () => {
  ['AJG', 'ISM', 'JMS', 'LSA', 'PEN', 'LDC', 'NHS', 'SAL', 'STN', 'THK', 'TJB', 'ZPK'].forEach(c => {
    const v = fx.royalty(c + '.010.00152.1');
    if (v !== 0.10) throw new Error(c + ' = ' + v);
  });
});
check('F codes stay 0%, other artists 5%, a longer prefix is not mistaken for a 10% one', () => {
  if (fx.royalty('FUN.wUyMk7ziLT0.1') !== 0) throw new Error('F code');
  if (fx.royalty('MEG.400.02747.1') !== 0.05) throw new Error('MEG');
  if (fx.royalty('PENX.010.00001') !== 0.05) throw new Error('PENX read as PEN');
});

// 2. Printed panel bleed
check('EXACT BUG: a didactic panel (printed acrylic / dibond) takes 0.125in bleed; wallcovering keeps 2in', () => {
  if (fx.bleed('Didactic Panel') !== 0.125) throw new Error('panel ' + fx.bleed('Didactic Panel'));
  if (fx.bleed('Wallcovering (EGD)') !== 2) throw new Error('wallcovering');
});
check('EXACT BUG: the RFQ calls a didactic panel a Printed Panel Product, not EGD', () => {
  if (fx.mount({ product: 'Didactic Panel' }) !== 'dibond') throw new Error(fx.mount({ product: 'Didactic Panel' }));
  if (fx.mount({ product: 'Wallcovering (EGD)' }) !== 'egd') throw new Error('wallcovering');
});

// 3. Maximum sizes
check('a normal 24 x 30 framed print is left alone', () => {
  const pf = fx.setup([R({})]);
  if (pf.length) throw new Error(JSON.stringify(pf));
});
check('a print wider than 59in paper on its short side is flagged', () => {
  const pf = fx.setup([R({ extW: 72, extH: 80, m1A: false, glass: 'Acrylic' })]);
  if (!has(pf, 'on paper')) throw new Error(JSON.stringify(pf));
});
check('glass past 40 x 60 is flagged and acrylic offered; the same size in acrylic is fine', () => {
  const pf = fx.setup([R({ extW: 44, extH: 64, m1A: false })]);
  if (!has(pf, 'the glass is') || !has(pf, 'Use acrylic')) throw new Error(JSON.stringify(pf));
  if (has(fx.setup([R({ extW: 44, extH: 64, m1A: false, glass: 'Non-Glare Acrylic' })]), 'acrylic is')) throw new Error('acrylic flagged');
});
check('a mat needing the 48 x 72 board must be white or cream; past 48 x 72 there is no board', () => {
  const big = { extW: 46, extH: 66, glass: 'Acrylic' };
  if (fx.setup([R(big)]).length) throw new Error('white mat flagged');
  if (!has(fx.setup([R(Object.assign({ m1ColorName: 'Black' }, big))]), 'acid-free white or cream')) throw new Error('black mat not flagged');
  if (!has(fx.setup([R({ extW: 54, extH: 78, glass: 'Acrylic' })]), 'biggest mat board')) throw new Error('oversize mat');
});
check('canvas: the short side limit follows the stretcher depth; past 9.5ft needs a joined bar', () => {
  const C = (o) => R(Object.assign({ product: 'Frameless Canvas (Wrapped)', glass: '', canvasWrap: 2 }, o));
  if (fx.setup([C({ extW: 52, extH: 60, canvasDepth: 0.75 })]).length) throw new Error('52 on 0.75 flagged');
  if (!has(fx.setup([C({ extW: 52, extH: 60, canvasDepth: 2 })]), 'takes at most 51')) throw new Error('52 on 2in not flagged');
  if (!has(fx.setup([C({ extW: 40, extH: 120, canvasDepth: 1.5 })]), 'stretcher bar')) throw new Error('long bar');
});
check('works in mm: a 1200 x 1600 mm glazed print is flagged in mm', () => {
  const pf = fx.setup([R({ extW: 1200, extH: 1600, fW: 25, m1A: false })], null, 'mm');
  if (!has(pf, 'the glass is') || !has(pf, ' mm')) throw new Error(JSON.stringify(pf));
});

// The floater
check('EXACT BUG: a 2in stretcher in a 1.625in rabbet floater stands proud; a 1.5in standard stretcher is offered', () => {
  const pf = fx.setup([R({ product: 'Framed Canvas (Floater)', glass: '', canvasDepth: 2, rabbetDepth: 1.625, extW: 30, extH: 40, fW: 0.5 })]);
  const t = (pf.find(i => i.text.indexOf('proud') >= 0) || {}).text || '';
  if (t.indexOf('0.375 in proud') < 0 || t.indexOf('Use a 1.5 in stretcher') < 0) throw new Error(JSON.stringify(pf));
});
check('a stretcher that fits the rabbet, or an unknown depth, is left alone', () => {
  const F = (o) => R(Object.assign({ product: 'Framed Canvas (Floater)', glass: '', extW: 30, extH: 40, fW: 0.5 }, o));
  if (fx.setup([F({ canvasDepth: 1.5, rabbetDepth: 1.625 })]).length) throw new Error('fits');
  if (fx.setup([F({ canvasDepth: 2, rabbetDepth: 0 })]).length) throw new Error('no rabbet');
});
check('an error in Final Spec, a warning before', () => {
  const r = R({ extW: 44, extH: 64, m1A: false });
  if (fx.setup([r])[0].sev !== 'warn') throw new Error('not warn');
  if (fx.setup([r], 'final')[0].sev !== 'err') throw new Error('not err');
});
check('Preflight runs it', () => {
  const S = APP.slice(APP.indexOf('function _dsRunPreflight'), APP.indexOf('function _pfBadgeSchedule'));
  if (S.indexOf('_maxMakePreflight()') < 0) throw new Error('not wired');
});

const bad = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
console.log('\n--- Summary ---');
console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad.length ? 1 : 0);
