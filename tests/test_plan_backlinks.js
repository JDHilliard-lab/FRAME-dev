// PLAN LINKS AND THE OPTION WALL LINE (18.23). "can we make sure the draw line on the
// floorplan is on the spec and elevation breaker pages... can we make all the plan
// details clickable links that jump you back to the floorplan page, and also in the
// floor plan page for items on the left".
// (1) A catalogue OPTION's spec page took its plan crop from _catRowAsPlanGroup, which
//     carried the pin and dropped the wall line, so the crop drew the red box around
//     nothing. (2) A plan detail page recorded no link rect, so neither the PDF nor
//     Deck Studio could click through to the floorplan. (3) A catalogue placement's key
//     list row pointed at mockup slots, which never get a spec page.
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
  const st = { lineWidth: 1, strokeStyle: '#000', globalAlpha: 1 };
  return new Proxy({}, {
    get(t, k) {
      if (k in st) return st[k];
      if (k === 'moveTo' || k === 'lineTo') return (x, y) => { fin(x, k); fin(y, k); ops.push({ op: k, x, y, ink: st.strokeStyle }); };
      if (k === 'strokeRect') return () => ops.push({ op: 'rect' });
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
  'window.__optIds = {};',
  '_catOptionRowIds = function () { return window.__optIds; };',
  'window.__fx = {',
  '  set rows(v) { dashProjectData = v; }, set levels(v) { floorplanLevels = v; },',
  '  set key(v) { _curPageKey = v; }, rects: _specPlanRects,',
  '  set pages(v) { _dsPages = v; },',
  '  crop: _planCropCanvasForRow, asGroup: _catRowAsPlanGroup, detail: _drawPlanDetailPage,',
  '  area: _planDetailArea, link: _linkSpecPlanRects, specIdx: _dsSpecPageIndexFor, entries: _fpKeyEntries,',
  '};',
].join(NL));
console.error = quiet;
const fx = window.__fx;
const SEG = { x1: 0.4, y1: 0.5, x2: 0.6, y2: 0.5 };
const row = (id, extra) => Object.assign({ id: id, level: 0, planPins: [{ lv: 0, x: 0.5, y: 0.5 }], planX: 0.5, planY: 0.5, category: 'framed',
  wallLines: [SEG], planWalls: [{ lv: 0, wallLines: [SEG], wallPanels: 'custom' }] }, extra || {});
fx.levels = [{ name: 'L1', imageData: 'data:image/png;base64,AAAA' }];
const docStub = (links) => new Proxy({ internal: { pageSize: { getWidth: () => 936, getHeight: () => 540 } } }, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'link') return (x, y, w, h, o) => links.push({ x, y, w, h, page: o && o.pageNumber });
    if (k === 'splitTextToSize') return (s) => [String(s)];
    if (k === 'getTextWidth') return () => 10;
    if (k === 'getFontSize') return () => 10;
    return () => 0;
  },
});

(async () => {
  await check('EXACT ASK: a catalogue OPTION row hands its wall line and category to the spec page plan crop', async () => {
    const r = row('ART.1.1A');
    window.__optIds = { 'ART.1.1A': true };
    const g = fx.asGroup(r);
    if (!g) throw new Error('no group');
    if (!g.wallLines || g.wallLines.length !== 1) throw new Error('wall line dropped: ' + JSON.stringify(g));
    if (g.category !== 'framed') throw new Error('category dropped');
  });
  await check('the option crop actually STROKES the wall line, not just the box', async () => {
    fx.rows = [row('ART.1.1A')];
    window.__optIds = { 'ART.1.1A': true };
    ops = [];
    const oc2 = await fx.crop(row('ART.1.1A'), { zoom: 3, aspect: 1 });
    if (!oc2) throw new Error('no crop');
    const lines = ops.filter(o => o.op === 'lineTo');
    if (lines.length < 1) throw new Error('no wall line drawn on the option crop');
    if (!ops.some(o => o.op === 'rect')) throw new Error('box missing');
  });
  await check('a plan detail page records its plan as a link rect, reset on every render', async () => {
    fx.rows = [row('ART.1')];
    fx.key = 'plandetail:pd1';
    const pd = { id: 'pd1', level: 0, ids: ['ART.1'], title: 'Detail' };
    await fx.detail(docStub([]), {}, 1, {}, pd);
    await fx.detail(docStub([]), {}, 1, {}, pd);
    const rs = fx.rects['plandetail:pd1'] || [];
    if (rs.length !== 1) throw new Error('expected one rect, got ' + rs.length);
    const A = fx.area(936, 540);
    if (Math.abs(rs[0].x - A.x) > 0.01 || Math.abs(rs[0].w - A.w) > 0.01) throw new Error('rect is not the plan area');
    const links = [];
    fx.link(docStub(links), 'plandetail:pd1', { 0: 4 }, 2);
    if (links.length !== 1 || links[0].page !== 4) throw new Error('not linked to the level floorplan: ' + JSON.stringify(links));
  });
  await check('the PDF export links the plan detail step, and Deck Studio lays a click-through over its plan', async () => {
    const i = APP.indexOf("if (step.type === 'detail') {");
    const seg = APP.slice(i, APP.indexOf("if (step.type === 'install') {", i));
    if (seg.indexOf('_linkSpecPlanRects(') < 0) throw new Error('detail step does not link');
    const j = APP.indexOf("lk.className = 'ds-plan-backlink");
    if (j < 0 || APP.indexOf('_dsJumpToFloorplan(', j) - j > 600) throw new Error('no Deck Studio back link on plan detail');
  });
  await check('EXACT ASK: a catalogue placement in the key list opens its BREAKER in Deck Studio', async () => {
    const brk = { kind: 'spec', _install: true, _groupKey: 'ART.1.1', elev: { frames: [{ id: 'ART.1A' }, { id: 'ART.1B' }] } };
    const opt = { kind: 'spec', members: [{ id: 'ART.1.1A' }] };
    fx.pages = [{ kind: 'floorplan' }, opt, brk];
    const i = fx.specIdx('ART.1');
    if (i !== 2) throw new Error('expected the breaker at 2, got ' + i);
  });
  await check('...and with breakers off, its first option page', async () => {
    fx.pages = [{ kind: 'floorplan' }, { kind: 'spec', members: [{ id: 'ART.1.1A' }] }];
    if (fx.specIdx('ART.1') !== 1) throw new Error('no option fallback');
    fx.pages = [{ kind: 'floorplan' }, { kind: 'spec', members: [{ id: 'ART.10A' }] }];
    if (fx.specIdx('ART.1') !== -1) throw new Error('ART.10 matched ART.1');
  });
  await check('the PDF key list falls back to the placement’s first option page', async () => {
    fx.rows = [row('ART.1A')];
    window.__optIds = {};
    const es = fx.entries(0, { 'ART.1.2A': 9, 'ART.1.1A': 7, 'ART.10A': 3 });
    const e = es.find(x => x.key === 'ART.1');
    if (!e || e.linkPage !== 7) throw new Error('linkPage ' + (e && e.linkPage));
  });

  let bad = 0;
  results.forEach(r => { if (!r.ok) bad++; console.log((r.ok ? 'ok:   ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)); });
  console.log(bad ? (bad + ' FAILURES') : ('ALL PASSED (' + results.length + ')'));
  process.exit(bad ? 1 : 0);
})();
