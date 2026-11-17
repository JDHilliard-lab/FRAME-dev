// 20.60: a thin grey border round the plan on floorplan pages, deck default on, per-level override, All plans.
// "Elevation required"; its wall pages and its sets' spec pages print the red stamp the
// studio uses ("ELEVATION REQUIRED" / "Artwork size to be confirmed"). Computed per page
// from the wall, never stored in editorialContent.annotations.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const any = new Proxy(function () {}, { get: (_, k) => k === Symbol.toPrimitive ? () => 0 : any, apply: () => any });
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({ measureText: (s) => ({ width: (s || '').length * 6 }) }, { get: (o, k) => (k in o ? o[k] : any), set: (o, k, v) => { o[k] = v; return true; } });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const block = `
    _autosaveToldUser = true;
    scheduleAutosave = () => {};
    _dsRefresh = () => {};
    window.__menu = null; _frameMenu = (a, items) => { window.__menu = items; };
    window.__setup = () => {
      floorplanLevels = [{ name: 'Level 01', imageData: null }, { name: 'Level 02', imageData: null }];
      delete editorialContent.planBorder;
    };
    window.__rects = (opts) => {
      const rects = [];
      const doc = new Proxy({}, { get: (o, k) => {
        if (k === 'internal') return { pageSize: { getWidth: () => 936, getHeight: () => 540 } };
        if (k === 'rect') return (x, y, w, h, st) => { rects.push({ x, y, w, h, st }); };
        if (k === 'getTextWidth') return () => 10;
        if (k === 'splitTextToSize') return (t) => [String(t)];
        if (k === 'getFontSize') return () => 10;
        if (k === 'getLineHeightFactor') return () => 1.15;
        return () => doc;
      } });
      const img = { naturalWidth: 1000, naturalHeight: 800, src: 'data:image/jpeg;base64,AAAA' };
      try { _drawFloorplanKeyPage(doc, {}, 2, {}, [], img, 'Level 01', opts); } catch (e) { window.__err = String(e && e.stack || e); }
      const f = _fpPlanFit(936, 540, 1000, 800);
      return rects.filter(r => Math.abs(r.x - f.dx) < 0.01 && Math.abs(r.y - f.dy) < 0.01 && Math.abs(r.w - f.dw) < 0.01 && r.st === 'S');
    };
    window.__drawAnn = (doc, a) => _drawOneAnnotation(doc, a, 936, 540);
    window.__api = { _planBorderPrints, _setPlanBorderLevel, _setPlanBorderAll, _planBorderToggle, _fpPanelPlan, get lv() { return floorplanLevels; }, get ec() { return editorialContent; } };
  `;
  const quiet = console.error; console.error = () => {};
  window.eval(src + '\n' + block);
  console.error = quiet;
  const A = window.__api;
  const _drawOneAnnotationForTest = window.__drawAnn;
  const results = [];
  const check = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

  await check('EXACT ASK: a floorplan page draws a thin light grey line round the plan', async () => {
    window.__setup();
    const r = window.__rects({ border: A._planBorderPrints(0) });
    if (window.__err) throw new Error(window.__err);
    if (r.length !== 1) throw new Error('border rects ' + r.length);
  });
  await check('off when the option is off', async () => {
    window.__setup();
    if (window.__rects({ border: false }).length !== 0) throw new Error('drew a border while off');
  });
  await check('deck default is on; the deck switch turns every plan off and clears per-page values', async () => {
    window.__setup();
    if (!A._planBorderPrints(0) || !A._planBorderPrints(1)) throw new Error('not on by default');
    A._setPlanBorderLevel(1, false);
    if (A._planBorderPrints(1) !== false || A._planBorderPrints(0) !== true) throw new Error('per-level override wrong');
    A._setPlanBorderAll(false);
    if (A._planBorderPrints(0) || A._planBorderPrints(1)) throw new Error('All off did not apply');
    if ('planBorder' in A.lv[1]) throw new Error('per-level value kept after All');
    A._setPlanBorderAll(true);
    if (!A._planBorderPrints(0) || ('planBorder' in A.ec)) throw new Error('All on did not restore the default');
  });
  await check('a per-page value matching the deck stores nothing', async () => {
    window.__setup();
    A._setPlanBorderLevel(0, true);
    if ('planBorder' in A.lv[0]) throw new Error('stored a redundant value');
  });
  await check('the Plan tab has the tick and an All plans menu', async () => {
    window.__setup();
    const row = A._planBorderToggle(0);
    const cb = row.querySelector('[data-plan-border]');
    if (!cb || !cb.checked) throw new Error('no ticked checkbox');
    cb.checked = false; cb.onchange();
    if (A._planBorderPrints(0) !== false) throw new Error('tick did not turn it off');
    row.querySelector('button').onclick();
    if (!window.__menu || window.__menu.length !== 2) throw new Error('no All plans menu');
    if (!/_fpPanelPlan\(t, desc\) \{\s*_fpPlanOrderInto\(t\);\s*t\.appendChild\(_planBorderToggle\(desc\.level\)\)/.test(src)) throw new Error('not in the Plan tab');
  });
  await check('20.61: a picture box with a stroke prints its border in the PDF', async () => {
    const rects = [];
    const doc = new Proxy({}, { get: (o, k) => { if (k === 'rect') return (x, y, w, h, st) => rects.push(st); if (k === 'roundedRect') return (x, y, w, h, r1, r2, st) => rects.push(st); return () => doc; } });
    _drawOneAnnotationForTest(doc, { type: 'shape', shape: 'rect', x: 0.5, y: 0.2, w: 0.4, h: 0.5, dataUrl: 'data:image/png;base64,AAAA', stroke: '#bcbec0', strokeW: 0.5, radius: 0 });
    if (rects.indexOf('S') < 0) throw new Error('no stroke drawn: ' + JSON.stringify(rects));
  });
  await check('the PDF passes the option to the drawer', async () => {
    if (src.indexOf("{ border: _planBorderPrints(desc.level) }") < 0) throw new Error('caller does not pass it');
  });

  const bad = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
