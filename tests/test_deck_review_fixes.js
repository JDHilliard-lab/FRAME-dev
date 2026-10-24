// 19.68: fixes from a read-through of the whole Ford Salt Lake City deck (install guide and
// Group A/B/C exports).
//  1. The install legend's letters follow wall position, so on the wall hung ART.9, ART.8B,
//     ART.8A its "A" was ART.9 while ART.8's spec page called a different piece A. When a
//     letter is not its piece's own, the legend now names the item.
//  2. A one-piece Group A/B/C page printed a lone "A" over the frame that referred to nothing.
//  3. An image code longer than its frame ran left into the next piece's code (ART.15) or up
//     to the spec column (ART.3).
//  4. A centre line through a context block struck through its label (BOOTH, CREDENZA...).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // Widths follow the font size (7pt-wide at 10pt), so a fit can be measured.
  window.HTMLCanvasElement.prototype.getContext = function () {
    return this.__ctx || (this.__ctx = new Proxy({ font: '10px sans-serif', measureText(s) { const m = /([\d.]+)px/.exec(this.font); const px = m ? parseFloat(m[1]) : 10; return { width: (s || '').length * px * 0.7 }; }, getImageData() { return { data: new Uint8ClampedArray(4) }; } }, { get: (t, k) => (k in t ? (typeof t[k] === 'function' ? t[k].bind(t) : t[k]) : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } }));
  };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  const quiet = console.error; console.error = () => {};
  window.eval('window.__src = ' + JSON.stringify(src) + ';\n' + src + `
    _autosaveToldUser = true;
    scheduleAutosave = () => {}; pushHistory = () => {};
    _planCropCanvasForRow = async () => null;
    _sharedSpecFrames = async () => [];
    const __rec = () => {
      const rec = new CanvasPdfRec(936, 540); rec._pxPerPt = 2;
      const texts = []; const o = rec.text;
      rec.text = function (s, x, y, op) { const str = String(Array.isArray(s) ? s.join(' ') : s); texts.push({ s: str, x: x, y: y, w: this.getTextWidth(str), align: op && op.align }); return o.apply(this, arguments); };
      rec.__texts = texts;
      return rec;
    };
    const __fr = (id, letter, x, w) => ({ id: id, letter: letter, x: x, y: 37, w: w, h: 30, active: true, dimTo: [] });
    window.__install = async (frames) => {
      elevations = [{ id: 'w1', name: 'Wall', wallW: 160, wallH: 108, frames: frames }];
      dashProjectData = frames.map(f => Object.assign(_cloneData(dashDefaultData), { id: f.id, extW: f.w, extH: f.h, imageCode: 'IMG.' + f.id }));
      floorplanLevels = [];
      editorialContent.installGuide = { legend: true, legendDims: true, legendCode: true };
      editorialContent.pageFooters = {};
      _igNoCapture = false; for (const k in _igCapCache) delete _igCapCache[k];
      _captureElevWithGuides = async () => ({ dataUrl: 'data:image/jpeg;base64,AAAA', w: 800, h: 400, vec: [] });
      const rec = __rec();
      _curFooter = _resolveFooter('spec:elev:0');
      await _drawInstallGuidePage(rec, {}, 1, { location: '', code: '', version: '' }, Object.assign({}, elevations[0], { _idx: 0 }), { PW: 936, PH: 540, M: 40 });
      return rec.__texts;
    };
    window.__group = async (rows, frames) => {
      editorialContent = _editorialDefaults();
      editorialContent.specTemplate = 'setLegend';
      editorialContent.specGroupSlots = { frame: false, profile: false, plan: false, elevation: false };
      elevUnit = 'in'; dashUnit = 'in';
      floorplanLevels = [];
      dashProjectData = rows.map(r => Object.assign(_cloneData(dashDefaultData), r));
      elevations = [{ id: 'w1', name: 'Wall', wallW: 200, wallH: 108, frames: frames }];
      const rec = __rec();
      await _drawSpecSetPage(rec, {}, 3, {}, { rep: dashProjectData[0], members: dashProjectData.slice(), key: rows[0].id.replace(/[A-Z]$/, '') }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      return rec.__texts;
    };
    window.__fr = __fr;
  `);
  console.error = quiet;

  const results = [];
  const check = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };
  const w = window;

  // ── 1. legend names the item ──
  await check('EXACT BUG: a wall lettered against its codes (ART.9, 8B, 8A) names each item in the legend', async () => {
    const t = await w.__install([w.__fr('ART.9', 'A', 10, 30), w.__fr('ART.8B', 'B', 60, 30), w.__fr('ART.8A', 'C', 110, 30)]);
    const items = t.filter(x => x.s === 'Item');
    if (items.length !== 3) throw new Error(items.length + ' Item lines, expected 3');
    ['ART.9', 'ART.8B', 'ART.8A'].forEach(c => { if (!t.some(x => x.s === c)) throw new Error(c + ' not named in the legend'); });
    // The Item line sits on the letter's own line (first line of the block).
    const a = t.find(x => x.s === 'A' && x.x < 300), it0 = items.sort((p, q) => p.y - q.y)[0];
    if (!a || Math.abs(a.y - it0.y) > 0.5) throw new Error('the Item line is not the first line of block A');
  });
  await check("a wall whose letters are its codes' letters (ART.4A = A) prints no Item line", async () => {
    const t = await w.__install([w.__fr('ART.4A', 'A', 10, 30), w.__fr('ART.4B', 'B', 60, 30)]);
    if (t.some(x => x.s === 'Item')) throw new Error('Item line printed where the letter already names the piece');
    if (!t.some(x => x.s === 'Image code')) throw new Error('fixture: no legend drawn, so this proves nothing');
  });
  await check('a one-piece wall prints no Item line (the heading is the code)', async () => {
    const t = await w.__install([w.__fr('ART.40', 'A', 10, 30)]);
    if (t.some(x => x.s === 'Item')) throw new Error('Item line on a one-piece wall');
  });
  await check('the reserved legend height counts the Item line (notes cannot land on it)', async () => {
    const rows = [{ id: 'ART.9', extW: 30, extH: 30 }];
    const rec = new w.CanvasPdfRec(936, 540);
    const h1 = w._igLegendHeight(rec, rows, ['dims', 'code'], 200), h2 = w._igLegendHeight(rec, rows, ['item', 'dims', 'code'], 200);
    if (!(h2 > h1)) throw new Error('height did not grow: ' + h1 + ' vs ' + h2);
  });

  // ── 2. no lone letter ──
  const isLetter = (x) => /^[A-L]$/.test(x.s);
  await check('EXACT BUG: a one-piece Group A/B/C page prints no lone "A"', async () => {
    const t = await w.__group([{ id: 'ART.3', product: 'Framed Art', extW: 30, extH: 30, imageCode: 'IMG.3' }], [w.__fr('ART.3', 'A', 80, 30)]);
    const lone = t.filter(isLetter);
    if (lone.length) throw new Error('letters drawn: ' + lone.map(x => x.s).join());
    if (!t.some(x => x.s === 'IMG.3')) throw new Error('fixture: the image code did not print, so the page drew nothing');
  });
  await check('a two-piece page still letters its pieces', async () => {
    const t = await w.__group([{ id: 'ART.4A', product: 'Framed Art', extW: 30, extH: 30 }, { id: 'ART.4B', product: 'Framed Art', extW: 30, extH: 30 }],
      [w.__fr('ART.4A', 'A', 20, 30), w.__fr('ART.4B', 'B', 80, 30)]);
    if (!t.some(x => x.s === 'A') || !t.some(x => x.s === 'B')) throw new Error('letters missing: ' + t.filter(isLetter).map(x => x.s).join());
  });

  // ── 3. image code stays under its frame ──
  await check('EXACT BUG: long image codes under two narrow neighbours do not run into each other', async () => {
    const L1 = 'FFI.2023_BRONCO_04.1', L2 = 'FFI.2023_BRONCO_04.2';
    // Tall and narrow, so the height sets the scale and each frame draws far narrower
    // than its code.
    const tall = (id, l, x) => Object.assign(w.__fr(id, l, x, 12), { h: 100 });
    const t = await w.__group([{ id: 'ART.15A', product: 'Framed Art', extW: 12, extH: 100, imageCode: L1 }, { id: 'ART.15B', product: 'Framed Art', extW: 12, extH: 100, imageCode: L2 }],
      [tall('ART.15A', 'A', 20), tall('ART.15B', 'B', 35)]);
    const fa = t.find(x => x.s === L1);
    if (fa && fa.w <= 0) throw new Error('fixture: unmeasured code');
    const span = (x) => { const l = x.align === 'right' ? x.x - x.w : x.x; return [l, l + x.w]; };
    const a = t.find(x => x.s === L1), b = t.find(x => x.s === L2);
    if (!a || !b) throw new Error('codes not drawn');
    const [sa, sb] = [span(a), span(b)].sort((p, q) => p[0] - q[0]);
    if (sa[1] > sb[0] - 1) throw new Error('codes overlap: ' + sa[1].toFixed(1) + ' > ' + sb[0].toFixed(1));
  });
  await check('a code that fits its frame keeps its size and its right edge', async () => {
    const rec = new w.CanvasPdfRec(936, 540);
    const f = w._frameCodeFit(rec, 'AB.1', 200, 100, 220);
    if (f.fs !== 6.5 || Math.abs(f.x + f.w - 200) > 0.01) throw new Error('short code moved: ' + JSON.stringify(f));
    const g = w._frameCodeFit(rec, 'A_VERY_LONG_FILE_NAME_INDEED.1', 130, 100, 140);
    if (!(g.fs < 6.5) || g.fs < 5 || g.x < 100 - 0.01) throw new Error('long code: ' + JSON.stringify(g));
    // The space runs to half the gap either side, and not past the art region.
    const sp = w._frameCodeSpan({ bx: 100, by: 0, bw: 40, bh: 50 }, [{ bx: 40, by: 0, bw: 40, bh: 50 }, { bx: 160, by: 0, bw: 40, bh: 50 }, { bx: 140, by: 200, bw: 10, bh: 10 }], 60, 999);
    if (Math.abs(sp.L - 91) > 0.01 || Math.abs(sp.R - 149) > 0.01) throw new Error('span ' + JSON.stringify(sp));
  });

  // ── 4. centre line breaks around a label ──
  await check('EXACT BUG: a centre line crossing a context label is split around it', async () => {
    const d = w.document;
    const wall = d.getElementById('wall'), layer = d.getElementById('context-layer');
    if (!wall || !layer) throw new Error('fixture: no #wall / #context-layer in index.html');
    wall.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300 });
    layer.innerHTML = '<div class="ctx-label">CREDENZA</div>';
    const realRange = d.createRange;
    d.createRange = () => ({ selectNodeContents() {}, getBoundingClientRect: () => ({ left: 170, right: 230, top: 140, bottom: 152, width: 60, height: 12 }) });
    try {
      const gaps = w._elevLabelGapsAt(200);
      if (gaps.length !== 1 || Math.abs(gaps[0][0] - 145) > 0.01 || Math.abs(gaps[0][1] - 163) > 0.01) throw new Error('gaps ' + JSON.stringify(gaps));
      if (w._elevLabelGapsAt(100).length) throw new Error('a line clear of the label was given a gap');
      const host = d.createElement('div');
      const cl = d.createElement('div'); cl.className = 'center-guide dim-dash-v'; cl.setAttribute('data-svg-pen', 'line'); cl.setAttribute('data-svg-dash', '1');
      cl.innerHTML = '<span class="center-label">CL</span>';
      w._elevAppendGuideAround(host, cl, 200, 300);
      const segs = Array.from(host.children);
      if (segs.length !== 2) throw new Error(segs.length + ' segments, expected 2');
      const lo = segs.find(s => s.style.bottom === '0px'), hi = segs.find(s => s.style.bottom === '163px');
      if (!lo || lo.style.height !== '145px') throw new Error('lower run wrong: ' + (lo && lo.style.cssText));
      if (!hi || hi.style.height !== '137px') throw new Error('upper run wrong: ' + (hi && hi.style.cssText));
      if (!hi.querySelector('.center-label') || lo.querySelector('.center-label')) throw new Error('the CL word is not on the top run alone');
      if (lo.getAttribute('data-svg-pen') !== 'line' || lo.getAttribute('data-svg-dash') !== '1') throw new Error('the lower run would not print (pen/dash attributes lost)');
      // No label crossed: one untouched line.
      const host2 = d.createElement('div'), cl2 = cl.cloneNode(true); cl2.style.bottom = ''; cl2.style.height = '';
      w._elevAppendGuideAround(host2, cl2, 100, 300);
      if (host2.children.length !== 1 || cl2.style.height) throw new Error('a clear line was split or resized');
    } finally { d.createRange = realRange; layer.innerHTML = ''; }
  });

  // ── 5. the wall capture draws frames at the size it keeps ──
  await check('EXACT BUG: a capture draws a frame at the dpi it keeps, not 150 dpi', async () => {
    // A 40in frame drawn 200 units wide, capture scale 2: keeps 200 x 2 x 1.5 = 600 px, 15 dpi.
    const d = w._capFrameDpi({ extW: 40, extH: 40 }, { w: 200, h: 200 }, 2);
    if (!(Math.abs(d.dpi - 15) < 0.01)) throw new Error('dpi ' + d.dpi);
    if (!(Math.abs(d.shadowScale - 0.1) < 0.001)) throw new Error('shadows not scaled to keep their size: ' + d.shadowScale);
    const dl = w._capFrameDpi({ extW: 40, extH: 40 }, { w: 200, h: 200 }, 0);
    if (dl.dpi !== 150 || dl.shadowScale) throw new Error('the SVG download (no capture scale) changed: ' + JSON.stringify(dl));
    const big = w._capFrameDpi({ extW: 4, extH: 4 }, { w: 400, h: 400 }, 8);
    if (big.dpi !== 150 || big.shadowScale) throw new Error('went above 150 dpi or scaled shadows at full size: ' + JSON.stringify(big));
    // ...and exportElevSVG actually uses it (landmark slice, not a character count).
    const S = w.__src, i0 = S.indexOf('async function exportElevSVG('), i1 = S.indexOf('\nasync function ', i0 + 10);
    const body = S.slice(i0, i1 > i0 ? i1 : undefined);
    if (body.indexOf('_capFrameDpi(dInches, pos, _capK)') < 0 || body.indexOf('dpi: _fd.dpi, shadowScale: _fd.shadowScale') < 0) throw new Error('exportElevSVG does not draw its frame rasters through _capFrameDpi');
    if (body.indexOf('{ dpi: 150, pad: 0') >= 0) throw new Error('the fixed 150 dpi frame raster is back');
  });
  await check('an opaque PNG artwork shrinks to a JPEG, a transparent one stays PNG', async () => {
    const mimes = [];
    const realLoad = w._loadImg, realGet = w.HTMLCanvasElement.prototype.getContext, realTo = w.HTMLCanvasElement.prototype.toDataURL;
    let alpha = 255;
    w._loadImg = async () => ({ naturalWidth: 2000, naturalHeight: 1000 });
    w.eval('_loadImg = window._loadImg;');
    w.HTMLCanvasElement.prototype.getContext = function () { return { drawImage() {}, getImageData: (x, y, cw, ch) => { const a = new Uint8ClampedArray(cw * ch * 4).fill(255); a[a.length - 1] = alpha; return { data: a }; } }; };
    w.HTMLCanvasElement.prototype.toDataURL = function (m) { mimes.push(m); return 'data:' + m + ';base64,' + 'A'.repeat(64); };
    try {
      await w._imgDownsized('data:image/png;base64,OPAQUE' + 'B'.repeat(100), 300, 150);
      alpha = 0;
      await w._imgDownsized('data:image/png;base64,ALPHA' + 'C'.repeat(100), 300, 150);
    } finally { w._loadImg = realLoad; w.eval('_loadImg = window._loadImg;'); w.HTMLCanvasElement.prototype.getContext = realGet; w.HTMLCanvasElement.prototype.toDataURL = realTo; }
    if (mimes.join() !== 'image/jpeg,image/png') throw new Error('encoded as ' + mimes.join());
  });

  const failed = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ' :: ' + r.err)));
  console.log(failed.length ? (failed.length + ' FAILED') : 'ALL PASSED (' + results.length + ')');
  process.exit(failed.length ? 1 : 0);
})();
