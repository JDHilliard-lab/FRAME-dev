// 19.71: WALL LAYERS. Asked on the Ford Admin Rouge timeline wall: "being able to drop in
// layers onto a wall. First the wallcovering, then the frame mockups, then the didactic
// panels." Three layers (ELEV_LAYERS), drawn in that order by the wall, the PDF capture and
// the spec-page thumbnail, whatever the wall's array order. A piece can be moved to
// another layer from the Art list. Plus the Didactic Panel product (flat, no bleed,
// on top by default), which replaces the window film stand-in.
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

    // ARRAY order is the worst case: panel first, framed second, wallcovering last.
    const seed = (opts) => {
      opts = opts || {};
      elevUnit = 'in'; dashUnit = 'in';
      elevations = [{ id: 'wT', name: 'Timeline', wallW: 150, wallH: 100, egdWall: true, personPos: { x: -60 }, frames: [
        Object.assign({}, base, { id: 'ART.3A', letter: 'A', product: 'Didactic Panel', fW: 0, w: 20, h: 8, x: 60, y: 60 }, opts.A || {}),
        Object.assign({}, base, { id: 'ART.2A', letter: 'B', product: 'Framed Art', x: 40, y: 50 }, opts.B || {}),
        Object.assign({}, base, { id: 'ART.3', letter: 'C', product: 'Wallcovering (EGD)', fW: 0, w: 150, h: 96, x: 0, y: 4 }),
      ] }];
      currentElevIndex = 0; elevFrames = elevations[0].frames; elevZoomFactor = 1;
      const ws = document.querySelector('#view-elevation .workspace');
      Object.defineProperty(ws, 'clientWidth', { get: () => 1100, configurable: true });
      Object.defineProperty(ws, 'clientHeight', { get: () => 800, configurable: true });
      drawElevAll();
    };
    const marker = (d) => 'data:image/png;base64,MARK' + String(d && d.product || '').replace(/[^A-Za-z]/g, '');
    const fakeCanvas = (d) => ({ canvas: { width: 1, height: 1, toDataURL: () => marker(d) } });
    const screenOrder = () => Array.from(document.querySelectorAll('#frame-layer .frame-vis[data-frame-letter]')).map(n => n.getAttribute('data-frame-letter')).join('');
    const capture = async () => {
      const keepR = renderFrameToCanvas, keepS = _frameShadowCanvas, keepP = frameFx.pageShadow;
      renderFrameToCanvas = fakeCanvas;
      _frameShadowCanvas = (d) => (d && !_isFlatGraphic(d.product)) ? { canvas: { toDataURL: () => 'data:image/png;base64,SHADOW' }, padIn: 0.5 } : null;
      frameFx.pageShadow = true;
      try { const res = await exportElevSVG({ returnBlob: true, forCapture: true }); return String(res && res.picSvg || ''); }
      finally { renderFrameToCanvas = keepR; _frameShadowCanvas = keepS; frameFx.pageShadow = keepP; }
    };

    window.__run = (async () => {
      await __check('EXACT ASK: on screen the wall stacks wallcovering, then framed art, then the didactic panel', async () => {
        seed();
        const o = screenOrder();
        if (o !== 'CBA') throw new Error('stacked bottom to top as ' + o + ' (want C wallcovering, B framed, A panel)');
      });
      await __check('the PDF capture stacks the same way, with the framed shadow between graphic and art', async () => {
        seed();
        const svg = await capture();
        const wc = svg.indexOf('MARKWallcoveringEGD'), fa = svg.indexOf('MARKFramedArt'), dp = svg.indexOf('MARKDidacticPanel'), sh = svg.indexOf('SHADOW');
        if (wc < 0 || fa < 0 || dp < 0) throw new Error('missing from the capture: wc ' + wc + ' framed ' + fa + ' panel ' + dp);
        if (!(wc < fa && fa < dp)) throw new Error('order wc ' + wc + ' framed ' + fa + ' panel ' + dp);
        if (!(sh > wc && sh < fa)) throw new Error('shadow at ' + sh + ', not between the graphic and the framed art');
      });
      await __check('the spec-page thumbnail stacks the same way', async () => {
        seed();
        const keepR = renderFrameToCanvas, seen = [];
        renderFrameToCanvas = (d) => { seen.push(d.product); return fakeCanvas(d); };
        try { await renderElevationToCanvas(elevations[0]); } finally { renderFrameToCanvas = keepR; }
        if (seen.join('|') !== 'Wallcovering (EGD)|Framed Art|Didactic Panel') throw new Error('drawn as ' + seen.join(', '));
      });
      await __check('a piece moved to another layer moves in every renderer (framed art on top of the panel)', async () => {
        seed();
        const bi = elevFrames.findIndex(f => f.letter === 'B');
        setElevFrameLayer(bi, 'top');
        if (elevFrames[bi].layer !== 'top') throw new Error('not stored');
        if (screenOrder() !== 'CAB') throw new Error('screen ' + screenOrder());
        const svg = await capture();
        if (!(svg.indexOf('MARKDidacticPanel') < svg.indexOf('MARKFramedArt'))) throw new Error('capture did not follow');
        setElevFrameLayer(bi, 'art');
        if ('layer' in elevFrames[bi]) throw new Error('back to its own layer should store nothing');
      });
      await __check('the Art list groups by layer, top first, and the letter opens the layer menu', async () => {
        seed(); initElevControls();
        const heads = Array.from(document.querySelectorAll('#frame-controls .elev-layer-head')).map(h => h.getAttribute('data-layer')).join(',');
        if (heads !== 'top,art,graphic') throw new Error('headings ' + heads);
        const btn = document.querySelector('#frame-controls .elev-layer-btn');
        if (!btn) throw new Error('no layer button');
        if ((btn.getAttribute('onclick') || '').indexOf('openElevLayerMenu(') !== 0) throw new Error('letter is not wired to the menu');
        openElevLayerMenu(+btn.getAttribute('data-layer-of'), btn);   // inline onclick does not run here
        const menu = document.querySelector('.frame-menu');
        if (!menu || menu.querySelectorAll('button').length !== 3) throw new Error('menu missing or wrong size');
        menu._close();
      });
      await __check('a wall with only framed art shows no layer headings', async () => {
        seed(); elevations[0].frames = elevFrames = elevFrames.filter(f => f.product === 'Framed Art'); initElevControls();
        if (document.querySelector('#frame-controls .elev-layer-head')) throw new Error('headings on a one-layer wall');
      });
      await __check('Didactic Panel is a flat product: listed, no bleed, its own application, not pinned by EGD wall mode', async () => {
        if (FRAME_PRODUCTS.indexOf('Didactic Panel') < 0 || !_isFlatGraphic('Didactic Panel')) throw new Error('not a flat product');
        const opts = Array.from(document.querySelectorAll('#m_product option')).map(o => o.value);
        if (opts.indexOf('Didactic Panel') < 0) throw new Error('not in the dropdown');
        if (_flatBleedIn('Didactic Panel') !== 0) throw new Error('panel bleed ' + _flatBleedIn('Didactic Panel'));
        if (_flatBleedIn('Wallcovering (EGD)') !== 2) throw new Error('wallcovering bleed changed');
        if (FLAT_GRAPHIC_APPLICATION['Didactic Panel'] !== 'Printed Acrylic Panel') throw new Error('application');
        seed();
        const a = elevFrames[0];
        if (_clampFlatToWall(elevations[0], a)) throw new Error('EGD wall mode clamped a panel');
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
