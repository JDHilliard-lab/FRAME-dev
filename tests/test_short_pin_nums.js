// 20.18: A PIN HOLDS TWO DIGITS. Fairmont Chateau Laurier's client codes (ART-1001, -1002-A/B,
// -1003) printed "1001" in a plan pin sized for two digits and spilled out of the circle.
// Long numbers show their last two (01, 02, 03) while those stay unique; otherwise the long
// ones are numbered in code order. The code itself never changes.
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
  'window.__fx = function (ids) {',
  '  editorialContent = _editorialDefaults(); dashUnit = "in";',
  '  dashProjectData = ids.map(id => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), { id: id, product: "Framed Art", extW: 20, extH: 20 }));',
  '  const out = {}; _fpGroups().forEach(g => { out[g.key] = g.num + (g.fullNum ? "<" + g.fullNum : ""); }); return out;',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
const eq = (got, want) => { const a = JSON.stringify(got), b = JSON.stringify(want); if (a !== b) throw new Error(a + ' vs ' + b); };

check('EXACT BUG: Fairmont ART-1001 / 1002-A/B / 1003 pin as 01, 02, 03 (a set is one pin)', () => {
  eq(fx(['ART-1001', 'ART-1002-A', 'ART-1002-B', 'ART-1003']), { 'ART-1001': '01<1001', 'ART-1002': '02<1002', 'ART-1003': '03<1003' });
});
check('short codes are untouched', () => {
  eq(fx(['ART.1', 'ART.2A', 'ART.2B', 'ART-12']), { 'ART.1': '01', 'ART.2': '02', 'ART-12': '12' });
});
check('last two digits that clash (1001 and 2001) fall back to 01, 02 in code order', () => {
  eq(fx(['ART-2001', 'ART-1001']), { 'ART-2001': '02<2001', 'ART-1001': '01<1001' });
});
check('a short code already using 05 is skipped, and 00 is never a pin', () => {
  eq(fx(['ART.5', 'ART-1005']), { 'ART.5': '05', 'ART-1005': '01<1005' });
  eq(fx(['ART-1100']), { 'ART-1100': '01<1100' });
});
check('three-digit codes shorten too (ART-101 -> 01)', () => {
  eq(fx(['ART-101', 'ART-102']), { 'ART-101': '01<101', 'ART-102': '02<102' });
});

const bad = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
console.log('\n--- Summary ---');
console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad.length ? 1 : 0);
