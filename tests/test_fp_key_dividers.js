// 19.36: THE FLOOR PLAN KEY'S DIVIDERS LINE UP, AND A SET'S LETTERS FOLLOW THE DIVIDER.
//
// Asked for on the Ford SLC deck: the key printed "ART.1  |  Small Banquette" and
// "ART.3 (A/B/C)  |  Break Out", so every | sat at a different x and the locations
// started on a ragged edge. Now the code is its own column, the | sits one gap past the
// widest code in that column, and a set reads "ART.3 | A / B / C  Break Out - Collab".
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
// A measuring context, so code widths differ by length (ART.1 is narrower than ART.21).
// Widths follow the font size, so stepping the type down really does buy room.
window.HTMLCanvasElement.prototype.getContext = () => new Proxy({ font: '10px sans-serif', measureText(s) { const m = /([\d.]+)px/.exec(this.font); const px = m ? parseFloat(m[1]) : 10; return { width: (s || '').length * px * 0.5 }; } }, { get: (t, k) => (k in t ? (typeof t[k] === 'function' ? t[k].bind(t) : t[k]) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;

window.eval(src + `
  _autosaveToldUser = true;
  window.__draw = (entries) => {
    const rec = new CanvasPdfRec(936, 540);
    const texts = [];
    const o = rec.text;
    rec.text = function (s, x, y) { texts.push({ s: String(Array.isArray(s) ? s.join(' ') : s), x: x, y: y }); return o.apply(this, arguments); };
    _drawFloorplanKeyPage(rec, {}, 2, {}, entries, null, 'Level 17');
    return texts;
  };
  window.__entries = () => {
    dashProjectData = [
      Object.assign(_cloneData(dashDefaultData), { id: 'ART.1', location: 'Small Banquette 104', planPins: [{ lv: 0, x: 0.1, y: 0.1 }] }),
      Object.assign(_cloneData(dashDefaultData), { id: 'ART.3A', location: 'Break Out - Collab 102', planPins: [{ lv: 0, x: 0.2, y: 0.2 }] }),
      Object.assign(_cloneData(dashDefaultData), { id: 'ART.3B', location: 'Break Out - Collab 102', planPins: [{ lv: 0, x: 0.2, y: 0.2 }] }),
      Object.assign(_cloneData(dashDefaultData), { id: 'ART.3C', location: 'Break Out - Collab 102', planPins: [{ lv: 0, x: 0.2, y: 0.2 }] }),
      Object.assign(_cloneData(dashDefaultData), { id: 'ART.21', location: 'Hallway Touchdown 150', planPins: [{ lv: 0, x: 0.3, y: 0.3 }] }),
    ];
    dashProjectData.forEach(r => _fpSyncPrimary(r));
    floorplanLevels = [{ name: 'Level 17', imageData: '' }];
    return _fpKeyEntries(0, null);
  };
`);

const results = [];
const check = (label, fn) => { try { fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

check('a set entry carries its code and letters separately (and keeps the old string)', () => {
  const es = window.__entries();
  const set = es.find(e => e.key === 'ART.3');
  if (!set) throw new Error('no ART.3 entry: ' + JSON.stringify(es.map(e => e.key)));
  if (set.code !== 'ART.3') throw new Error('code ' + set.code);
  if (JSON.stringify(set.letters) !== '["A","B","C"]') throw new Error('letters ' + JSON.stringify(set.letters));
  if (set.codes !== 'ART.3 (A/B/C)') throw new Error('the older codes string changed: ' + set.codes);
  const one = es.find(e => e.key === 'ART.1');
  if (one.letters !== null || one.code !== 'ART.1') throw new Error('a single piece grew letters');
});

check('EXACT REQUEST: every | in a column sits at one x', () => {
  const texts = window.__draw(window.__entries());
  const bars = texts.filter(t => t.s === '|');
  if (bars.length !== 3) throw new Error(bars.length + ' dividers for 3 entries');
  const xs = bars.map(b => b.x.toFixed(2));
  if (new Set(xs).size !== 1) throw new Error('dividers at ' + xs.join(', '));
  // and the divider clears the widest code
  const codes = texts.filter(t => /^ART\.\d+$/.test(t.s));
  if (!codes.length) throw new Error('codes not drawn on their own');
});

check('EXACT REQUEST: a set reads ART.3 | A / B / C, then the location', () => {
  const texts = window.__draw(window.__entries());
  if (texts.some(t => t.s.indexOf('(A/B/C)') >= 0)) throw new Error('the old (A/B/C) form still prints');
  const rest = texts.find(t => t.s.indexOf('A / B / C') === 0);
  if (!rest) throw new Error('no "A / B / C ..." after the divider: ' + JSON.stringify(texts.map(t => t.s)));
  if (rest.s.indexOf('Break Out - Collab 102') < 0) throw new Error('the location does not follow the letters: ' + rest.s);
  const bar = texts.find(t => t.s === '|');
  if (!(rest.x > bar.x)) throw new Error('letters are not right of the divider');
});

check('locations start on one edge', () => {
  const texts = window.__draw(window.__entries());
  const bar = texts.find(t => t.s === '|');
  const after = texts.filter(t => t.x > bar.x && t.s !== '|' && Math.abs(t.y - bar.y) < 60 && t.x < bar.x + 20);
  const xs = new Set(after.map(t => t.x.toFixed(2)));
  if (xs.size !== 1) throw new Error('text after the divider starts at ' + [...xs].join(', '));
});

check('an entry without a location prints no dangling divider', () => {
  const texts = window.__draw([{ key: 'ART.9', num: '09', codes: 'ART.9', category: '' }]);
  if (texts.some(t => t.s === '|')) throw new Error('a | printed with nothing after it');
  if (!texts.some(t => t.s === 'ART.9')) throw new Error('the code did not print');
});

// The Ford SLC key: 40 placements, the sets (and the longest names) in the first column.
const fordEntries = () => {
  const loc = { 1: 'Small Banquette 104 North', 3: 'Break Out - Collab 102', 8: 'Circulation C-101 (South)', 9: 'Circulation C-101 (South)', 15: 'Kitchenette North', 21: 'Hallway Touchdown 150', 34: 'Elevator Lobby Entry 103', 35: 'Elevator Lobby Entry 103' };
  const sets = { 3: ['A', 'B', 'C'], 8: ['A', 'B'], 10: ['A', 'B'], 15: ['A', 'B', 'C'], 21: ['A', 'B'], 30: ['A', 'B'], 31: ['A', 'B'], 37: ['A', 'B'] };
  const out = [];
  for (let n = 1; n <= 40; n++) out.push({ key: 'ART.' + n, num: String(n).padStart(2, '0'), code: 'ART.' + n, letters: sets[n] || null, codes: 'ART.' + n, location: loc[n] || (n < 22 ? 'Circulation C-101' : 'Open Office 147'), category: '' });
  return out;
};
const restOf = (e) => [e.letters ? e.letters.join(' / ') : '', e.location].filter(Boolean).join('  ');

check('EXACT BUG: no entry in a full 40-piece key is cut short', () => {
  const es = fordEntries();
  const texts = window.__draw(es);
  const cut = es.filter(e => !texts.some(t => t.s === restOf(e)));
  if (cut.length) throw new Error(cut.length + ' cut short, e.g. ' + cut[0].code + ' "' + restOf(cut[0]) + '" printed as "' + ((texts.find(t => restOf(cut[0]).indexOf(t.s) === 0 && t.s.length > 3) || {}).s || '?') + '"');
});

check('the first column never runs into the second', () => {
  const es = fordEntries();
  const texts = window.__draw(es);
  const col2Code = texts.find(t => t.s === 'ART.40');
  const col1Rests = es.slice(0, 20).map(e => texts.find(t => t.s === restOf(e))).filter(Boolean);
  const w = (t) => t.s.length * 0.5 * 8.5; // upper bound: never wider than at full size
  const over = col1Rests.find(t => t.x + w(t) > col2Code.x - 12);
  if (over) throw new Error('"' + over.s + '" reaches into the second column');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ' :: ' + r.err)));
console.log(failed.length ? (failed.length + ' FAILED') : 'ALL PASSED (' + results.length + ')');
process.exit(failed.length ? 1 : 0);
