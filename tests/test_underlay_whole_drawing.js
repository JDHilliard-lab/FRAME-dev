// 20.62: the WHOLE client drawing on a wall page, outline frames, and the source sheet in the
// caption. Ford Hub L1 built in InDesign and FRAME side by side: the InDesign sheets show the
// wall in its room (doors, returns, cabinets), which is what an install team reads and how a
// wrong elevation behind the art gets spotted. FRAME clipped the drawing to the wall box.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // A recording no-op context: every call is logged, every read returns something callable.
  window.__calls = [];
  const mkCtx = () => new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s || '').length * 5 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      return (...a) => { window.__calls.push([k, a]); };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  window.HTMLCanvasElement.prototype.getContext = function () { return this.__ctx || (this.__ctx = mkCtx()); };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  window.__src = src;
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __check = (label, fn) => {
      __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true }))
        .catch(e => ({ label, ok: false, err: e.message })));
      window.__asyncChecks.push(__chain);
    };
    _autosaveToldUser = true;
    scheduleAutosave = () => {}; pushHistory = () => {};
    _loadImg = () => Promise.reject(new Error('no images in test'));

    const U = () => ({ src: 'data:image/png;base64,QUJD', x: -10, y: -2, w: 320, h: 145, opacity: 0.35, natW: 946, natH: 425, lockAspect: true });
    const seed = (u) => {
      editorialContent = _editorialDefaults();
      elevUnit = 'in'; dashUnit = 'in';
      dashProjectData = [];
      elevations = [{ id: 'w1', name: 'L3.ART.S24-10 MEETING ROOM', wallW: 249, wallH: 144, frames: [], contextBlocks: [], glazing: [], groupDims: [], customLines: [], hiddenDims: {}, dimOffsets: {} }];
      if (u) elevations[0].underlay = u;
      currentElevIndex = 0; elevFrames = elevations[0].frames;
    };
    const SRC = window.__src;
    const body = (name) => { const i = SRC.indexOf('async function ' + name + '('); const j = SRC.indexOf('\\nasync function ', i + 10); const k = SRC.indexOf('\\nfunction ', i + 10); return SRC.slice(i, Math.min(j < 0 ? 1e12 : j, k < 0 ? 1e12 : k)); };


    __check('the clip is the wall by default and the whole image on Print the whole drawing', () => {
      seed(Object.assign(U(), { inDeck: true }));
      const img = { x: 5, y: 6, w: 940, h: 425 }, wall = { x: 40, y: 0, w: 730, h: 422 };
      let out = _underlayDeckSvg(elevations[0], img, wall, 'w1');
      if (out[0].indexOf('<rect x="40.0" y="0.0" width="730.0" height="422.0"/>') < 0) throw new Error('default no longer clips to the wall: ' + out[0]);
      if (_underlayDeckFull(elevations[0])) throw new Error('whole drawing on by default');
      setUnderlayDeckView('drawing');
      if (elevations[0].underlay.deckView !== 'drawing' || !_underlayDeckFull(elevations[0])) throw new Error('not set');
      out = _underlayDeckSvg(elevations[0], img, wall, 'w1');
      if (out[0].indexOf('<rect x="5.0" y="6.0" width="940.0" height="425.0"/>') < 0) throw new Error('still clipped to the wall: ' + out[0]);
      setUnderlayDeckView('wall');
      if ('deckView' in elevations[0].underlay) throw new Error('the default should store nothing');
    });
    __check('a tracing guide never prints its whole drawing, and the choice recaptures the wall', () => {
      seed(Object.assign(U(), { deckView: 'drawing' }));
      if (_underlayDeckFull(elevations[0])) throw new Error('a guide that is not in the deck reads as printing');
      seed(Object.assign(U(), { inDeck: true }));
      const before = _elevCaptureSignature();
      setUnderlayDeckView('drawing');
      if (_elevCaptureSignature() === before) throw new Error('signature unchanged: the deck would keep the clipped picture');
      const b2 = _elevCaptureSignature();
      setElevFrameStyle('outline');
      if (_elevCaptureSignature() === b2) throw new Error('frame style is not a capture input');
    });
    __check('every wall at once, both choices', () => {
      seed(Object.assign(U(), { inDeck: true }));
      elevations.push({ id: 'w2', name: 'W2', wallW: 100, wallH: 100, frames: [], underlay: U() });
      elevations.push({ id: 'w3', name: 'W3', wallW: 100, wallH: 100, frames: [] });
      _setUnderlayDeckViewAll('drawing');
      if (elevations[0].underlay.deckView !== 'drawing' || elevations[1].underlay.deckView !== 'drawing') throw new Error('not every wall with a drawing');
      _setElevFrameStyleAll('outline');
      if (!elevations.every(e => _elevFramesOutline(e))) throw new Error('outline not on every wall');
      _setElevFrameStyleAll('frame');
      if (elevations.some(e => 'frameStyle' in e)) throw new Error('frames as drawn should store nothing');
      _setUnderlayDeckViewAll('wall');
      if ('deckView' in elevations[0].underlay) throw new Error('wall only should store nothing');
    });
    __check('the caption is plain Elevation unless a source sheet is typed', () => {
      seed(Object.assign(U(), { name: 'ELEV.HUB.L1.ART.S24-11_AI4101-02' }));
      if (_elevCaptionText(elevations[0], 'Elevation') !== 'Elevation') throw new Error('a tracing guide named its sheet');
      elevations[0].underlay.inDeck = true;
      if (_elevCaptionText(elevations[0], 'Elevation') !== 'Elevation') throw new Error('20.63: the caption is plain Elevation until a source is typed, got ' + _elevCaptionText(elevations[0], 'Elevation'));
      setUnderlaySource('Ford AI4101-02 V8');
      if (_elevCaptionText(elevations[0], 'Elevation') !== 'Elevation · Ford AI4101-02 V8') throw new Error('typed source');
      setUnderlaySource('');
      if (_elevCaptionText(elevations[0], 'Elevation') !== 'Elevation') throw new Error('cleared should print just Elevation');
      seed(Object.assign(U(), { inDeck: true, name: 'site photo' }));
      if (_underlaySource(elevations[0]) !== '') throw new Error('invented a sheet');
    });
    __check('the wall panel offers the view, the frame style and the source once the drawing prints', () => {
      seed(U());
      renderUnderlayControls();
      if (document.querySelector('#underlayControls [data-ul-deckview]')) throw new Error('offered on a tracing guide');
      seed(Object.assign(U(), { inDeck: true }));
      renderUnderlayControls();
      const v = document.querySelector('#underlayControls [data-ul-deckview]');
      const f = document.querySelector('#underlayControls [data-frame-style]');
      const s = document.querySelector('#underlayControls [data-ul-source]');
      if (!v || !f || !s || !document.querySelector('#underlayControls [data-frame-style-all]')) throw new Error('missing control');
      if (v.value !== 'wall' || f.value !== 'frame') throw new Error('defaults ' + v.value + ' ' + f.value);
    });
    __check('20.63: the editor crops a wall-cropped drawing at the wall, but not while placing, a guide, or a whole drawing', () => {
      const layer = document.getElementById('underlay-layer');
      seed(Object.assign(U(), { inDeck: true })); elevScale = 2;
      renderElevUnderlay(249, 144);
      if (layer.style.overflow !== 'hidden') throw new Error('a wall-cropped drawing spills past the wall in the editor');
      elevations[0].underlay.deckView = 'drawing'; renderElevUnderlay(249, 144);
      if (layer.style.overflow === 'hidden') throw new Error('a whole drawing was cropped');
      seed(U()); renderElevUnderlay(249, 144);
      if (layer.style.overflow === 'hidden') throw new Error('a tracing guide was cropped');
      seed(Object.assign(U(), { inDeck: true })); _ulPlacing = true; renderElevUnderlay(249, 144); _ulPlacing = false;
      if (layer.style.overflow === 'hidden') throw new Error('cropped while placing: it cannot be lined up');
    });
    __check('export: the whole drawing joins the artboard and the crop; outline frames skip the frame raster; captions name the sheet', () => {
      const b = body('exportElevSVG');
      const iFull = b.indexOf('_underlayDeckFull(elevations[currentElevIndex])');
      if (iFull < 0 || !(iFull < b.indexOf('const SAFE = 6'))) throw new Error('the drawing never reaches the artboard bounds');
      if (b.indexOf("_boxAdd('underlay-layer'") < 0) throw new Error('no underlay box for the page crop');
      if (_CAP_BASE_BOXES.indexOf('underlay-layer') < 0) throw new Error('_capView would crop the drawing back to the wall');
      const iOut = b.indexOf('data-frame-outline'), iRaster = b.indexOf('renderFrameToCanvas(dInches');
      if (iOut < 0 || !(iOut < iRaster)) throw new Error('outline must replace the frame raster');
      if (b.indexOf('floorY = null') < 0) throw new Error('the slab under the floor would drop into the caption band');
      const ig = body('_drawInstallGuidePage');
      if (ig.split('_elevCaptionText(elev').length - 1 !== 3) throw new Error('every Elevation caption should name the sheet');
    });
  `;

  try {
    window.eval(src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = await Promise.all(window.__asyncChecks || []);
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
