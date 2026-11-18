// 20.64: an OUTLINE frame (elev.frameStyle 'outline', 20.62) still shows what the editor
// shows inside it. Ford Hub L1 pantry: the Elevations tab showed grey blocks lettered A, B, C
// (wireframe), the install page printed three empty black boxes with the client drawing
// reading straight through them. The outline branch of exportElevSVG skipped
// _maybeAddArtworkToSvg, which is where the wireframe block, its letter and the artwork go.
// Behavioural: the real export on a real wall.
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
    const base = { w: 24, h: 30, fW: 1.25, fType: 'color', fColor: '#111111', m1A: true, m1T: 3, m1B: 3, m1L: 3, m1R: 3, m2: 0, m2A: false,
      active: true, dimTo: [], distToggles: { ceiling: false, floor: false, left: false, right: false } };
    const seed = (art) => {
      elevUnit = 'in'; dashUnit = 'in';
      const fr = Object.assign({}, base, { id: 'ART.1A', letter: 'A', product: 'Framed Art', x: 40, y: 50 });
      if (art) { fr.artworkUrl = 'data:image/png;base64,ARTWORKMARK'; fr.artworkW = 100; fr.artworkH = 120; }
      elevations = [{ name: 'Pantry', wallW: 150, wallH: 100, personPos: { x: -60 }, frameStyle: 'outline', frames: [fr] }];
      currentElevIndex = 0; elevFrames = elevations[0].frames; elevZoomFactor = 1;
      const ws = document.querySelector('#view-elevation .workspace');
      Object.defineProperty(ws, 'clientWidth', { get: () => 1100, configurable: true });
      Object.defineProperty(ws, 'clientHeight', { get: () => 800, configurable: true });
      drawElevAll();
    };
    const cap = async () => {
      const keepR = renderFrameToCanvas; let frameRaster = 0;
      renderFrameToCanvas = () => { frameRaster++; return { canvas: { width: 1, height: 1, toDataURL: () => 'data:image/png;base64,FRAMERASTER' } }; };
      _imgDownsized = async (u) => u;
      let res; try { res = await exportElevSVG({ returnBlob: true, forCapture: true }); } finally { renderFrameToCanvas = keepR; }
      return { svg: String(res && res.picSvg || ''), frameRaster };
    };

    window.__run = (async () => {
      await __check('EXACT ASK: an outline frame on a wireframe wall prints the grey block and its letter, as the editor shows', async () => {
        seed(false); setElevWireframe(true);
        const { svg } = await cap();
        const paper = svg.indexOf('data-frame-paper'), grey = svg.indexOf('fill="' + ELEV_WF_FILL + '"'), out = svg.indexOf('data-frame-outline');
        const letter = svg.search(/<text[^>]*>A<[/]text>/);
        if (out < 0) throw new Error('no outline');
        if (grey < 0) throw new Error('no grey placeholder block (the 20.62 bug: the box was empty)');
        if (letter < 0) throw new Error('no letter A');
        if (paper < 0) throw new Error('no paper fill: the client drawing reads through the frame');
        if (!(paper < grey && grey < letter && letter < out)) throw new Error('order paper ' + paper + ', grey ' + grey + ', letter ' + letter + ', outline ' + out);
      });
      await __check('the opening is the editor\\'s opening (inside the mat), not the whole frame', async () => {
        seed(false); setElevWireframe(true);
        const { svg } = await cap();
        const g = /<rect x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)" fill="#b9b9b9"/.exec(svg);
        const p = /<rect data-frame-paper="1" x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"/.exec(svg);
        if (!g || !p) throw new Error('missing ' + (!g ? 'grey' : 'paper'));
        if (!(parseFloat(g[3]) <= parseFloat(p[3]))) throw new Error('grey wider than the frame');
      });
      await __check('with artwork and wireframe off, the artwork prints inside the outline (later art drops in)', async () => {
        seed(true); setElevWireframe(false);
        const { svg } = await cap();
        const art = svg.indexOf('ARTWORKMARK'), out = svg.indexOf('data-frame-outline');
        if (art < 0) throw new Error('artwork missing from an outline frame');
        if (!(art < out)) throw new Error('outline must sit on top of the artwork');
      });
      await __check('still an outline: no frame raster, no shadow', async () => {
        seed(true); setElevWireframe(true);
        const { svg, frameRaster } = await cap();
        if (frameRaster) throw new Error('the moulding raster was drawn ' + frameRaster + 'x');
        if (svg.indexOf('data-frame-shadow') >= 0) throw new Error('shadow drawn');
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
