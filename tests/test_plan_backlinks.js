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
  '  set key(v) { _curPageKey = v; }, rects: _specPlanRects, begin: _specPlanRectsBegin, commit: _specPlanRectsCommit, add: _specPlanRectAdd,',
  '  set pages(v) { _dsPages = v; },',
  '  crop: _planCropCanvasForRow, asGroup: _catRowAsPlanGroup, detail: _drawPlanDetailPage,',
  '  get ret() { return _viewReturn; }, set els(v) { elevations = v; }, set sv(f) { switchView = f; }, ret0() { _viewReturn = null; },',
  '  backlinks: _dsPlanBacklinks, pageKey: _deckPageKey, set jump(f) { _dsJumpToFloorplan = f; },',
  '  area: _planDetailArea, marks: _drawPlanCropMarks, LPT: PLAN_DETAIL_LINE_PT, LRGB: PLAN_DETAIL_LINE_RGB, link: _linkSpecPlanRects, specIdx: _dsSpecPageIndexFor, entries: _fpKeyEntries,',
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
    for (let n = 0; n < 2; n++) { const d = docStub([]); fx.begin(d, 'plandetail:pd1'); await fx.detail(d, {}, 1, {}, pd); fx.commit(d); }
    const rs = fx.rects['plandetail:pd1'] || [];
    if (rs.length !== 1) throw new Error('expected one rect, got ' + rs.length);
    const A = fx.area(936, 540);
    if (Math.abs(rs[0].x - A.x) > 0.01 || Math.abs(rs[0].w - A.w) > 0.01) throw new Error('rect is not the plan area');
    const links = [];
    fx.link(docStub(links), 'plandetail:pd1', { 0: 4 }, 2);
    if (links.length !== 1 || links[0].page !== 4) throw new Error('not linked to the level floorplan: ' + JSON.stringify(links));
  });
  await check('the PDF export links the plan detail step, and Deck Studio lays a click-through over its plan', async () => {
    // 18.32: the export walks the studio list, one link call for spec AND plan detail pages.
    if (APP.indexOf("if (desc.kind === 'spec' || desc.kind === 'planDetail') _linkSpecPlanRects(doc, key, _fpLevelKeyPage, fpKeyPageNum);") < 0) throw new Error('detail step does not link');
    // 18.25: the element is built by _dsPlanBacklinkEl, shared with the spec pages.
    const j = APP.indexOf('function _dsPlanBacklinkEl(');
    const body = APP.slice(j, APP.indexOf('function _dsPlanBacklinks(', j));
    if (j < 0 || body.indexOf('_dsJumpToFloorplan(') < 0) throw new Error('no Deck Studio back link on plan detail');
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

  await check('18.24 EXACT ASK: a spec page plan line prints at the BREAKER weight and ink, whatever size the thumbnail is', async () => {
    window.__optIds = {};
    ops = [];
    const pc = await fx.crop(row('ART.1A'), { zoom: 3, aspect: 1, vector: true });
    if (ops.some(o => o.op === 'lineTo')) throw new Error('vector crop still bakes a raster line');
    [60, 170, 300].forEach(size => {
      const calls = [];
      let lw = null, ink = null;
      const doc = new Proxy({}, { get(t, k) {
        if (k === 'setLineWidth') return (v) => { fin(v, 'lw'); lw = v; };
        if (k === 'setDrawColor') return (r, g, b) => { [r, g, b].forEach(v => fin(v, 'ink')); ink = [r, g, b]; };
        if (k === 'line') return (...a) => { a.forEach(v => fin(v, 'line')); calls.push({ lw: lw, ink: ink.join(',') }); };
        return () => {};
      } });
      fx.marks(doc, pc, 10, 10, size, size);
      if (!calls.length) throw new Error('no line at ' + size);
      if (calls.some(c => c.lw !== fx.LPT || c.ink !== fx.LRGB.join(','))) throw new Error('at ' + size + 'pt drew ' + JSON.stringify(calls[0]));
    });
  });
  await check('every spec layout and both breaker paths draw through the one line drawer', async () => {
    const n = APP.split('_planCropCanvasForRow(').length - 2;   // minus the declaration
    const v = APP.split('vector: true });').length - 1;
    if (n !== v) throw new Error(n + ' crop callers, ' + v + ' vector');
    if (APP.split('_drawPlanCropMarks(doc, pc,').length - 2 !== n) throw new Error('a crop caller draws no marks');
    if (APP.indexOf('setLineWidth(2.2)') >= 0) throw new Error('a local 2.2 survives');
    if (APP.split('_drawPlanLinePdf(doc, pins,').length - 1 !== 2) throw new Error('breaker paths not shared');
  });

  await check('18.25 EXACT ASK: the whole plan thumbnail is a button that opens its floorplan', async () => {
    const desc = { kind: 'spec', row: { id: 'ART.3A' }, members: [{ id: 'ART.3A' }] };
    const key = fx.pageKey(desc);
    fx.rects[key] = [{ x: 30, y: 400, w: 150, h: 120, level: 1 }];
    const page = window.document.createElement('div');
    page.innerHTML = '<img><div class="note"></div>';
    let went = null;
    fx.jump = (lv) => { went = lv; return true; };
    fx.backlinks(page, desc);
    fx.backlinks(page, desc);   // a re-render must not stack a second one
    const bs = page.querySelectorAll('.ds-plan-backlink');
    if (bs.length !== 1) throw new Error(bs.length + ' buttons');
    const b = bs[0];
    if (b.style.left !== (30 / 936 * 100) + '%' || b.style.height !== (120 / 540 * 100) + '%') throw new Error('not over the whole plan: ' + b.style.cssText);
    if (page.children[1] !== b) throw new Error('not directly above the page image, so it would cover notes');
    if (b.className.indexOf('_dsChrome') < 0) throw new Error('would show in thumbnails');
    b.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    if (went !== 1) throw new Error('jumped to ' + went);
  });
  await check('...wired on EVERY Deck Studio path: built image, fresh render, and plan detail pages', async () => {
    const bi = APP.indexOf("const _builtSrc = (desc.kind === 'spec')");
    const built = APP.slice(bi, APP.indexOf('return;', bi));
    if (built.indexOf('_dsPlanBacklinks(page, desc)') < 0) throw new Error('a built page (most breakers) has a dead plan');
    const si = APP.indexOf("specBase.innerHTML = ''; specBase.appendChild(cv2);");
    if (APP.slice(si, si + 200).indexOf('_dsPlanBacklinks(page, desc)') < 0) throw new Error('not re-laid when the render lands');
    const pi = APP.indexOf("if (desc.kind === 'planDetail' && desc.pd) {", APP.indexOf('renderDeckPageCanvas(desc).then'));
    if (APP.slice(pi, pi + 400).indexOf('_dsPlanBacklinkEl(') < 0) throw new Error('plan detail page not a button');
    const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
    const ci = css.indexOf('.ds-plan-backlink:hover');
    if (ci < 0 || css.slice(ci, css.indexOf('}', ci)).indexOf('var(--selected)') < 0) throw new Error('no hover cue in --selected');
  });

  await check('18.26 EXACT ASK: two pages rendering at once each keep THEIR OWN plan link', async () => {
    // The centre page and a rail thumbnail interleave across an await (an elevation
    // capture); _curPageKey ends up naming whichever started last.
    const A = {}, B = {};
    fx.begin(A, 'spec:ART.1');
    fx.key = 'spec:ART.1';
    fx.begin(B, 'spec:ART.2');
    fx.key = 'spec:ART.2';           // B set the global last...
    fx.add(A, 20, 400, 130, 130, 0); // ...and A draws its plan now
    fx.add(B, 22, 410, 67, 67, 1);
    fx.commit(B); fx.commit(A);
    const a = fx.rects['spec:ART.1'], b = fx.rects['spec:ART.2'];
    if (!a || a.length !== 1 || a[0].w !== 130) throw new Error('ART.1 holds ' + JSON.stringify(a));
    if (!b || b.length !== 1 || b[0].level !== 1) throw new Error('ART.2 holds ' + JSON.stringify(b));
    // A second render of the same page REPLACES its list rather than stacking onto it.
    const A2 = {}; fx.begin(A2, 'spec:ART.1'); fx.add(A2, 20, 400, 130, 130, 0); fx.commit(A2);
    if (fx.rects['spec:ART.1'].length !== 1) throw new Error('re-render stacked rects');
  });
  await check('...and every preview path begins and commits its own list', async () => {
    const si = APP.indexOf('async function renderSpecPageCanvas(');
    const sb = APP.slice(si, APP.indexOf('function _previewQuality(', si));
    if (sb.indexOf('_specPlanRectsBegin(rec,') < 0 || sb.indexOf('_specPlanRectsCommit(rec)') < 0) throw new Error('spec preview does not own its rects');
    if (APP.indexOf('_specPlanRects[_curPageKey]') >= 0) throw new Error('something still files rects by the global key');
    // 18.32: renderDeckPageCanvas begins and commits around the shared dispatch for
    // every page kind, plan details included.
    const pi = APP.indexOf('async function renderDeckPageCanvas(');
    const pb = APP.slice(pi, APP.indexOf('function _dsThumbCacheKey(', pi));
    const b0 = pb.indexOf('_specPlanRectsBegin(rec,'), d0 = pb.indexOf('_drawDeckPage('), c0 = pb.indexOf('_specPlanRectsCommit(rec)');
    if (b0 < 0 || c0 < 0 || !(b0 < d0 && d0 < c0)) throw new Error('plan detail preview does not commit');
  });

  await check('18.27 EXACT ASK: the elevation thumbnail opens ITS WALL, with a way back to this spec page', async () => {
    fx.els = [{ id: 'eA', name: 'Lobby', frames: [] }, { id: 'eB', name: 'Corridor', frames: [] }];
    const desc = { kind: 'spec', title: 'ART.1.5', row: { id: 'ART.1.5A' }, members: [{ id: 'ART.1.5A' }] };
    const key = fx.pageKey(desc);
    fx.rects[key] = [{ x: 30, y: 400, w: 100, h: 100, level: 0 }, { x: 140, y: 400, w: 150, h: 100, level: 0, kind: 'elev', elevId: 'eB' }];
    const page = window.document.createElement('div'); page.innerHTML = '<img>';
    let went = null, fp = null;
    fx.sv = (v, i) => { went = v + ':' + i; };
    fx.jump = (lv) => { fp = lv; return true; };
    fx.ret0();
    fx.backlinks(page, desc);
    const bs = page.querySelectorAll('.ds-plan-backlink');
    if (bs.length !== 2) throw new Error(bs.length + ' buttons');
    const ev = Array.from(bs).find(b => b.textContent.indexOf('elevation') >= 0);
    if (!ev) throw new Error('no Open elevation label');
    ev.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    if (went !== 'elevation:1') throw new Error('went to ' + went + (fp != null ? ' / floorplan ' + fp : ''));
    const r = fx.ret;
    if (!r || r.view !== 'deck' || r.at !== 'elevation' || r.key !== key || r.title !== 'ART.1.5') throw new Error('no return trip: ' + JSON.stringify(r));
    // The plan button beside it still opens the floorplan.
    went = null; fp = null;
    Array.from(bs).find(b => b !== ev).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    if (fp !== 0 || went) throw new Error('plan button went to ' + went + ' / ' + fp);
  });
  await check('...every elevation thumbnail site names the wall it drew', async () => {
    const n = APP.split('// opens its wall (18.27)').length - 1;
    if (n !== 4) throw new Error(n + ' sites, expected 4 (two group layouts, flat, template; the classic drawer went in 18.34)');
    if (APP.indexOf('links to the floorplan (17.96)') >= 0) throw new Error('an elevation thumbnail still records itself as a plan');
  });

  let bad = 0;
  results.forEach(r => { if (!r.ok) bad++; console.log((r.ok ? 'ok:   ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)); });
  console.log(bad ? (bad + ' FAILURES') : ('ALL PASSED (' + results.length + ')'));
  process.exit(bad ? 1 : 0);
})();
