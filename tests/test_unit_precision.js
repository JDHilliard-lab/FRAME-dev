// 18.60: ROUNDING IS ONE PROJECT SETTING PER UNIT, AND EVERY ELEVATION NUMBER CARRIES ITS UNIT.
//
// Asked for: "can we have everything consistent... options in the settings to have
// rounded to certain decimals... 0.#, 0.##, 0.###, 0.####", and "we need to include the
// cm and mm at the end of the numbers in the elevation drawings".
// Before: the same 1.875" moulding printed 2" on an elevation, 1.875" on its spec page and
// 1.88" in the letter legend; its mm companion was 47.6 on the spec page and 48 on the
// elevation; and a single-unit elevation printed interior numbers bare ("1727").
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
  '  units: function (u, dual) { dashUnit = u; elevUnit = u; editorialContent.specDualUnit = dual || ""; },',
  '  setPrec: function (p) { editorialContent.unitPrecision = p; },',
  '  get prec() { return editorialContent.unitPrecision; },',
  '  sig: function () { return _elevCaptureSignature(); },',
  '  fromFile: function (ed) { return _editorialFromFile(ed); },',
  '  dashFmt: function (v) { return dashFmt(v); },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
const doc = window.document;
window.pushHistory = () => {}; window.scheduleAutosave = () => {};

// The same piece the user named: a 1.875" moulding.
const PIECE = () => ({ id: 'ART.1', product: 'Framed Art', m1A: false, fW: 1.875, fHeight: 1.875, rabbetDepth: 0,
  extW: 24, extH: 24, bleed: 0, mount: 'Standard Mount', glass: '2mm Standard' });
const specLine = (label) => (window.buildSpecStrings(PIECE()).lines.find(l => l.label === label) || {}).value;

check('defaults: inches to 0.###, mm whole, cm to 0.#', () => {
  fx.setPrec(undefined);
  if (window._fmtUnitNum(1.875, 'in') !== '1.875') throw new Error('in: ' + window._fmtUnitNum(1.875, 'in'));
  if (window._fmtUnitNum(47.625, 'mm') !== '48') throw new Error('mm: ' + window._fmtUnitNum(47.625, 'mm'));
  if (window._fmtUnitNum(4.7625, 'cm') !== '4.8') throw new Error('cm: ' + window._fmtUnitNum(4.7625, 'cm'));
  if (window._fmtUnitNum(24, 'in') !== '24') throw new Error('trailing zeros kept: ' + window._fmtUnitNum(24, 'in'));
});

check('EXACT ASK: one moulding prints the same on the spec page, the elevation and the legend', () => {
  fx.setPrec(undefined); fx.units('in', 'mm');
  const spec = specLine('Frame Size');
  const elev = window.elevFmtU(1.875);
  const leg = window._igLegDimText(1.875, 1.875).split(' × ')[0];
  const want = '1.875"(48mm)';
  if (spec.indexOf(want) !== 0) throw new Error('spec page: ' + spec);
  if (elev !== want) throw new Error('elevation: ' + elev);
  if (leg !== want) throw new Error('legend: ' + leg);
  fx.units('in', '');
});

check('every rounding choice reaches spec page, elevation and legend', () => {
  fx.units('in', 'mm');
  [[0, '2"(48mm)'], [1, '1.9"(47.6mm)'], [2, '1.88"(47.63mm)'], [4, '1.875"(47.625mm)']].forEach(([d, want]) => {
    fx.setPrec({ in: d, mm: d, cm: d });
    const spec = specLine('Frame Size'), elev = window.elevFmtU(1.875), leg = window._igLegDimText(1.875, 1.875).split(' × ')[0];
    if (spec.indexOf(want) !== 0 || elev !== want || leg !== want) throw new Error(d + ' places: spec ' + spec + ' / elev ' + elev + ' / legend ' + leg);
  });
  fx.setPrec(undefined); fx.units('in', '');
});

check('a metric-only project rounds its own unit, not inches', () => {
  fx.setPrec({ in: 3, mm: 1, cm: 1 }); fx.units('mm', '');
  if (window.elevFmtU(47.625) !== '47.6 mm') throw new Error('mm elevation: ' + window.elevFmtU(47.625));
  fx.setPrec(undefined); fx.units('in', '');
});

check('EXACT ASK: a single-unit elevation number carries its unit (mm and inches)', () => {
  fx.setPrec(undefined);
  fx.units('mm', '');
  if (window.elevFmtU(1727) !== '1727 mm') throw new Error('mm-only interior dim: ' + window.elevFmtU(1727));
  fx.units('cm', '');
  if (window.elevFmtU(172.7) !== '172.7 cm') throw new Error('cm-only interior dim: ' + window.elevFmtU(172.7));
  fx.units('in', '');
  if (window.elevFmtU(68) !== '68"') throw new Error('inch interior dim: ' + window.elevFmtU(68));
  if (doc.getElementById('unitSuffixToggle')) throw new Error('the Units on/off tile is back');
});

check('setUnitPrecision stores only valid places and leaves the other units alone', () => {
  fx.setPrec(undefined);
  window.setUnitPrecision('mm', 2);
  if (!fx.prec || fx.prec.mm !== 2 || fx.prec.in !== 3 || fx.prec.cm !== 1) throw new Error('stored ' + JSON.stringify(fx.prec));
  window.setUnitPrecision('mm', 9); window.setUnitPrecision('mm', 1.5); window.setUnitPrecision('ft', 1);
  if (fx.prec.mm !== 2 || fx.prec.ft !== undefined) throw new Error('accepted junk: ' + JSON.stringify(fx.prec));
  fx.setPrec(undefined);
});

check('Settings > Units has a Rounding row per unit, and a click sets it', () => {
  fx.setPrec(undefined);
  const host = doc.createElement('div'); doc.body.appendChild(host);
  window._unitControlsInto(host);
  ['Inches', 'Millimetres', 'Centimetres'].forEach(l => {
    const opts = host.querySelectorAll('[data-unit-opt^="' + l + ':"]');
    if (opts.length !== 5) throw new Error(l + ' has ' + opts.length + ' choices');
  });
  const labels = Array.prototype.map.call(host.querySelectorAll('[data-unit-opt^="Inches:"]'), b => b.textContent).join(',');
  if (labels !== '0,0.#,0.##,0.###,0.####') throw new Error('choices read ' + labels);
  if (!host.querySelector('[data-unit-opt="Inches:3"].active')) throw new Error('default not lit');
  host.querySelector('[data-unit-opt="Millimetres:1"]').onclick();
  if (window._unitPrecision('mm') !== 1) throw new Error('click did not set mm');
  if (!host.querySelector('[data-unit-opt="Millimetres:1"].active')) throw new Error('did not redraw lit');
  const ex = host.querySelector('.unit-rounding-example');
  if (!ex || ex.textContent.indexOf('47.6 mm') < 0) throw new Error('example does not follow: ' + (ex && ex.textContent));
  fx.setPrec(undefined);
});

check('a rounding change invalidates the cached elevation captures', () => {
  fx.setPrec(undefined);
  const a = fx.sig();
  fx.setPrec({ in: 1, mm: 0, cm: 1 });
  if (fx.sig() === a) throw new Error('signature ignores rounding');
  fx.setPrec(undefined);
});

check('the setting travels in the project file; an old file gets the defaults', () => {
  const kept = fx.fromFile({ unitPrecision: { in: 2, mm: 1, cm: 2 } });
  if (!kept.unitPrecision || kept.unitPrecision.in !== 2) throw new Error('lost on load');
  const old = fx.fromFile({});
  fx.setPrec(old.unitPrecision);
  if (window._unitPrecision('in') !== 3 || window._unitPrecision('mm') !== 0) throw new Error('old file did not get defaults');
  fx.setPrec(undefined);
});

check('data entry and CSV numbers are NOT rounded by it', () => {
  fx.setPrec({ in: 0, mm: 0, cm: 0 });
  if (fx.dashFmt(1.875) !== 1.875) throw new Error('dashFmt rounded a typed value');
  fx.setPrec(undefined);
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS: ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)));
if (failed.length) { console.log(failed.length + ' FAILURE' + (failed.length > 1 ? 'S' : '')); process.exit(1); }
console.log('ALL PASSED (' + results.length + ')');
process.exit(0);
