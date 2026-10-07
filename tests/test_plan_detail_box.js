// PLAN DETAIL MARK (17.88). "The plan detail would only highlight the drawn line with a
// red dashed box around it... 2pt line weights for the red lines. Also, we do not want
// to include the circle number on the plan detail on spec page or the breaker pages."
// The canvas and the doc here VALIDATE what they are handed (finite numbers, a real
// dash), the lesson of the 17.71 note ink: a recorder that swallows arguments proves
// nothing.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const NL = String.fromCharCode(10);
const results = [];
const check = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message + (process.env.DBG ? e.stack : '') }); } };

const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
let ops = [];
const fin = (v, what) => { if (typeof v !== 'number' || !isFinite(v)) throw new Error(what + ' got ' + v); };
window.HTMLCanvasElement.prototype.getContext = function () {
  const st = { lineWidth: 1, strokeStyle: '#000', globalAlpha: 1, dash: [] };
  return new Proxy({}, {
    get(t, k) {
      if (k in st && k !== 'dash') return st[k];
      if (k === 'setLineDash') return (a) => { a.forEach(v => fin(v, 'dash')); st.dash = a.slice(); };
      if (k === 'arc') return () => ops.push({ op: 'arc' });
      if (k === 'fillText') return () => ops.push({ op: 'text' });
      if (k === 'strokeRect') return (x, y, w, h) => { [x, y, w, h].forEach(v => fin(v, 'strokeRect')); ops.push({ op: 'rect', x, y, w, h, lw: st.lineWidth, dash: st.dash.slice(), ink: st.strokeStyle }); };
      if (k === 'moveTo' || k === 'lineTo') return (x, y) => { fin(x, k); fin(y, k); ops.push({ op: k, x, y }); };
      if (k === 'stroke') return () => ops.push({ op: 'stroke', lw: st.lineWidth });
      return () => {};
    },
    set(t, k, v) { st[k] = v; return true; },
  });
};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA';
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;
const quiet = console.error; console.error = () => {};
window.eval(APP + NL + [
  '_autosaveToldUser = true;',
  '_loadImg = function () { return Promise.resolve({ naturalWidth: 1000, naturalHeight: 800, width: 1000, height: 800 }); };',
  'window.__fx = {',
  '  get rows() { return dashProjectData; }, set rows(v) { dashProjectData = v; },',
  '  set levels(v) { floorplanLevels = v; },',
  '  crop: _planCropCanvasForRow, box: _drawPlanBoxPdf, BOX: PLAN_DETAIL_BOX_PT,',
  '};',
].join(NL));
console.error = quiet;
const fx = window.__fx;

const row = (id, extra) => Object.assign({ id: id, level: 0, planPins: [{ lv: 0, x: 0.5, y: 0.5 }], planX: 0.5, planY: 0.5, category: '' }, extra || {});
fx.levels = [{ name: 'L1', imageData: 'data:image/png;base64,AAAA' }];

(async () => {
  await check('EXACT ASK: the spec page plan detail draws NO numbered circles, even with neighbours in view', async () => {
    fx.rows = [row('ART.1', { wallLines: [{ x1: 0.45, y1: 0.5, x2: 0.55, y2: 0.5 }], planWalls: [{ lv: 0, wallLines: [{ x1: 0.45, y1: 0.5, x2: 0.55, y2: 0.5 }], wallPanels: 'custom' }] }),
               row('ART.2', { planPins: [{ lv: 0, x: 0.52, y: 0.52 }], planX: 0.52, planY: 0.52 })];
    ops = [];
    const c = await fx.crop(fx.rows[0], { zoom: 3, aspect: 1, placedPt: 170 });
    if (!c) throw new Error('no crop');
    if (ops.some(o => o.op === 'arc' || o.op === 'text')) throw new Error('a pin circle or number was drawn');
  });

  await check('EXACT ASK: one red dashed box, 2pt at print size, around the drawn line', async () => {
    ops = [];
    const c = await fx.crop(fx.rows[0], { zoom: 3, aspect: 1, placedPt: 170 });
    const rects = ops.filter(o => o.op === 'rect');
    if (rects.length !== 1) throw new Error(rects.length + ' boxes');
    const b = rects[0], ppt = c.width / 170;
    if (Math.abs(b.lw - 2 * ppt) > 1e-6) throw new Error('box is ' + (b.lw / ppt) + 'pt, want 2pt');
    if (!b.dash.length) throw new Error('box is not dashed');
    if (String(b.ink).toLowerCase() !== '#e02b2b') throw new Error('box ink ' + b.ink);
    // The line's two ends are inside the box.
    const ends = ops.filter(o => o.op === 'moveTo' || o.op === 'lineTo');
    if (ends.length < 2) throw new Error('the wall line was not drawn');
    ends.forEach(e => { if (e.x < b.x || e.x > b.x + b.w || e.y < b.y || e.y > b.y + b.h) throw new Error('a line end is outside the box'); });
  });

  await check('only THIS piece\'s line is drawn, not a neighbour\'s', async () => {
    fx.rows[1].planWalls = [{ lv: 0, wallLines: [{ x1: 0.6, y1: 0.6, x2: 0.62, y2: 0.62 }], wallPanels: 'custom' }];
    ops = [];
    await fx.crop(fx.rows[0], { zoom: 3, aspect: 1 });
    if (ops.filter(o => o.op === 'moveTo').length !== 1) throw new Error('drew ' + ops.filter(o => o.op === 'moveTo').length + ' lines');
  });

  await check('a long line is not cut off: the crop widens to hold both ends', async () => {
    fx.rows = [row('ART.1', { planWalls: [{ lv: 0, wallLines: [{ x1: 0.1, y1: 0.5, x2: 0.9, y2: 0.5 }], wallPanels: 'custom' }] })];
    ops = [];
    const c = await fx.crop(fx.rows[0], { zoom: 3, aspect: 1 });
    ops.filter(o => o.op === 'moveTo' || o.op === 'lineTo').forEach(e => {
      if (e.x < 0 || e.x > c.width) throw new Error('a line end fell outside the crop');
    });
  });

  await check('no line drawn yet: the box marks the pin, still with no circle', async () => {
    fx.rows = [row('ART.1')];
    ops = [];
    await fx.crop(fx.rows[0], { zoom: 3, aspect: 1 });
    if (ops.filter(o => o.op === 'rect').length !== 1) throw new Error('no box at the pin');
    if (ops.some(o => o.op === 'arc')) throw new Error('drew a circle');
  });

  await check('EXACT ASK: the breaker plan gets the same 2pt dashed box and no dot', async () => {
    const calls = [];
    const doc = {
      setDrawColor: (r, g, b) => { [r, g, b].forEach(v => fin(v, 'setDrawColor')); calls.push(['ink', r, g, b]); },
      setLineWidth: (w) => { fin(w, 'setLineWidth'); calls.push(['lw', w]); },
      setLineDashPattern: (a) => { calls.push(['dash', a.slice()]); },
      rect: (x, y, w, h, m) => { [x, y, w, h].forEach(v => fin(v, 'rect')); calls.push(['rect', m]); },
      circle: () => calls.push(['circle']),
    };
    const r = row('ART.1', { planWalls: [{ lv: 0, wallLines: [{ x1: 0.4, y1: 0.5, x2: 0.6, y2: 0.5 }], wallPanels: 'custom' }] });
    fx.box(doc, [r], (p) => [p.planX, p.planY], 10, 10, 200, 160);
    if (calls.some(c => c[0] === 'circle')) throw new Error('a dot was drawn');
    const lw = calls.filter(c => c[0] === 'lw').pop();
    if (!lw || lw[1] !== 2) throw new Error('box weight ' + (lw && lw[1]));
    const dashes = calls.filter(c => c[0] === 'dash');
    if (!dashes.length || !dashes[0][1].length) throw new Error('not dashed');
    if (dashes[dashes.length - 1][1].length) throw new Error('dash left switched on for whatever draws next');
    if (calls.filter(c => c[0] === 'rect' && c[1] === 'S').length !== 1) throw new Error('expected one stroked box');
    const ink = calls.find(c => c[0] === 'ink');
    if (!ink || ink[1] !== 224 || ink[2] !== 43) throw new Error('box ink ' + JSON.stringify(ink));
  });

  await check('the breaker plan code no longer draws red dots', async () => {
    const a = APP.indexOf('const drawPlanAt = async');
    const body = APP.slice(a, APP.indexOf('const legendOn = !!(cfg.legend', a));
    if (body.indexOf("doc.circle(") >= 0) throw new Error('drawPlanAt still draws a circle');
    if (body.indexOf('_drawPlanBoxPdf(') < 0) throw new Error('drawPlanAt does not draw the box');
  });

  await check('EXACT BUG: the breaker Plan size slider reaches 140% (it was clamped at 100%)', async () => {
    if (APP.indexOf("const planScale = Math.max(0.4, Math.min(1.4, cfg.planScale || 1));") < 0) throw new Error('still clamped');
    const sl = APP.indexOf("slider('Plan size', 0.4, 1.4");
    if (sl < 0) throw new Error('the slider range changed; keep the clamp in step with it');
    // A plan grown past its column pushes the elevation right instead of being drawn under it.
    if (APP.indexOf('const ex0 = Math.max(M + leftW, pr ? (pr.x + pr.w) : 0) + gutter;') < 0) throw new Error('a wide plan would sit under the elevation');
  });

  const failed = results.filter(r => !r.ok);
  results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
  console.log(NL + '--- Summary ---');
  if (failed.length) console.log(failed.length + ' FAILURES');
  else console.log('ALL PASSED (' + results.length + ')');
})();
