// 19.69: a wallcovering prints BEHIND the framed art on its wall, in the PDF capture and
// the SVG download as on screen.
//
// Found rebuilding Ford Admin Rouge V3: eight framed photos hang over a 272" timeline
// wallcovering. On the wall they drew correctly (drawElevAll sorts flat graphics first),
// but every deck page showed the wallcovering on top of them: exportElevSVG and the
// spec-page thumbnail (renderElevationToCanvas) walked elev.frames in ARRAY order, and
// the wallcovering had been added after the frames. The drop shadows, spliced in "under
// every frame", went under the wallcovering too.
//
// Behavioural: the real export and the real thumbnail renderer run on a wall whose
// wallcovering comes AFTER a framed piece in the array; the frame rasters and shadow are
// stubbed with markers so the output ORDER can be read.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const noop = () => ctx2d;
  const ctx2d = new Proxy({}, { get: (t, k) => {
    if (k === 'measureText') return () => ({ width: 0 });
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(4), width: w, height: h });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: () => {} });
    if (k === 'canvas') return undefined;
    return k in t ? t[k] : noop;
  }, set: (t, k, v) => { t[k] = v; return true; } });
  window.HTMLCanvasElement.prototype.getContext = () => ctx2d;
  // jsdom has no layout: give every element a box, so the export places (and shadows) frames.
  window.Element.prototype.getBoundingClientRect = function () { return { left: 10, top: 10, right: 110, bottom: 90, width: 100, height: 80, x: 10, y: 10 }; };
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = async (label, fn) => { try { await fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    scheduleAutosave = () => {}; pushHistory = () => {}; _autosaveToldUser = true;
    const base = { w: 24, h: 30, fW: 1.25, fType: 'color', fColor: '#111111', m1A: false, m1T: 0, m1B: 0, m1L: 0, m1R: 0, m2: 0, m2A: false,
      active: true, dimTo: [], distToggles: { ceiling: false, floor: false, left: false, right: false } };
    const seed = () => {
      elevUnit = 'in'; dashUnit = 'in';
      // The framed piece FIRST in the array, the wallcovering after it: the Ford order.
      elevations = [{ name: 'Timeline', wallW: 150, wallH: 100, personPos: { x: -60 }, frames: [
        Object.assign({}, base, { id: 'ART.2A', letter: 'A', product: 'Framed Art', x: 40, y: 50 }),
        Object.assign({}, base, { id: 'ART.3', letter: 'B', product: 'Wallcovering (EGD)', fW: 0, w: 150, h: 96, x: 0, y: 4 }),
      ] }];
      currentElevIndex = 0; elevFrames = elevations[0].frames; elevZoomFactor = 1;
      const ws = document.querySelector('#view-elevation .workspace');
      Object.defineProperty(ws, 'clientWidth', { get: () => 1100, configurable: true });
      Object.defineProperty(ws, 'clientHeight', { get: () => 800, configurable: true });
      drawElevAll();
    };
    const marker = (d) => 'data:image/png;base64,MARK' + String(d && d.product || '').replace(/[^A-Za-z]/g, '');
    const fakeCanvas = (d) => ({ canvas: { width: 1, height: 1, toDataURL: () => marker(d) } });

    window.__run = (async () => {
      await __check('EXACT ASK: the PDF capture draws the wallcovering BEFORE (behind) the framed art', async () => {
        seed();
        const keepR = renderFrameToCanvas, keepS = _frameShadowCanvas, keepP = frameFx.pageShadow;
        renderFrameToCanvas = fakeCanvas;
        _frameShadowCanvas = (d) => (d && !_isFlatGraphic(d.product)) ? { canvas: { toDataURL: () => 'data:image/png;base64,SHADOW' }, padIn: 0.5 } : null;
        frameFx.pageShadow = true;
        let res;
        try { res = await exportElevSVG({ returnBlob: true, forCapture: true }); }
        finally { renderFrameToCanvas = keepR; _frameShadowCanvas = keepS; frameFx.pageShadow = keepP; }
        const svg = String(res && res.picSvg || '');
        const wc = svg.indexOf('MARKWallcoveringEGD'), fa = svg.indexOf('MARKFramedArt'), sh = svg.indexOf('SHADOW');
        if (wc < 0 || fa < 0) throw new Error('a frame is missing from the capture (wallcovering ' + wc + ', framed ' + fa + ')');
        if (wc > fa) throw new Error('the wallcovering is drawn OVER the framed art');
        if (sh < 0) throw new Error('no drop shadow in the capture');
        if (sh < wc) throw new Error('the framed art shadow went under the wallcovering');
        if (sh > fa) throw new Error('the shadow is drawn over its frame');
      });
      await __check('the SVG download (same loop, no shadows) has the same order', async () => {
        seed();
        const keepR = renderFrameToCanvas;
        renderFrameToCanvas = fakeCanvas;
        let res;
        try { res = await exportElevSVG({ returnBlob: true }); } finally { renderFrameToCanvas = keepR; }
        const svg = String(res && res.picSvg || '');
        const wc = svg.indexOf('MARKWallcoveringEGD'), fa = svg.indexOf('MARKFramedArt');
        if (wc < 0 || fa < 0) throw new Error('a frame is missing from the SVG');
        if (wc > fa) throw new Error('the wallcovering is drawn OVER the framed art');
      });
      await __check('the spec-page elevation thumbnail draws the wallcovering first too', async () => {
        seed();
        const keepR = renderFrameToCanvas, seen = [];
        renderFrameToCanvas = (d) => { seen.push(d.product); return fakeCanvas(d); };
        try { await renderElevationToCanvas(elevations[0]); } finally { renderFrameToCanvas = keepR; }
        if (seen.length !== 2) throw new Error('drew ' + seen.length + ' frames: ' + seen.join(', '));
        if (seen[0] !== 'Wallcovering (EGD)') throw new Error('drawn in this order: ' + seen.join(', '));
      });
      await __check('the wall array is not reordered (frames are addressed by index)', async () => {
        seed();
        const keepR = renderFrameToCanvas;
        renderFrameToCanvas = fakeCanvas;
        try { await exportElevSVG({ returnBlob: true, forCapture: true }); await renderElevationToCanvas(elevations[0]); } finally { renderFrameToCanvas = keepR; }
        if (elevations[0].frames[0].id !== 'ART.2A') throw new Error('the export sorted the wall itself');
      });
    })();
  `;
  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
    await window.__run;
  } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
