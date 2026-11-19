// 20.66: crop the client drawing on the wall after it is in, a thin grey border round it on
// the page, and a sheet dropped straight on the panel. "Designers might want to focus on a
// specific area... when the elevation is very long the dimensions look small, and we want to
// trim it down until we are happy." / "A thin grey box to close it off, like the floorplan."
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




    const SHEET = () => Object.assign(U(), { inDeck: true, deckView: 'drawing', x: -72, y: -6, w: 270, h: 144, natW: 1125, natH: 600,
      sheet: { src: 'data:image/png;base64,UVVF', name: 'AI4101-02', natW: 8400, natH: 6000 }, crop: { x: 2700, y: 5000, w: 1125, h: 600 }, cal: { pxPerIn: 4.1667 } });
    __check('the sheet frame maps sheet pixels to the wall, and a plain picture is its own sheet', () => {
      seed(SHEET());
      const F = _ulSheetFrame(elevations[0].underlay);
      if (Math.abs(F.su - 0.24) > 1e-9) throw new Error('units per px ' + F.su);
      if (Math.abs(F.x0 - (-72 - 2700 * 0.24)) > 1e-6 || Math.abs(F.top - (138 + 5000 * 0.24)) > 1e-6) throw new Error(JSON.stringify(F));
      seed(Object.assign(U(), { natW: 946, natH: 425 }));
      const P = _ulSheetOf(elevations[0].underlay);
      if (P.sheet.src !== elevations[0].underlay.src || P.crop.w !== 946 || P.crop.x !== 0) throw new Error('a plain picture should stand as its own sheet');
    });
    __check('dragging an edge trims, dragging inside slides, never off the sheet, never smaller than a sliver', () => {
      const c0 = { x: 100, y: 100, w: 500, h: 300 };
      const e = _ulCropResize(c0, 'e', -200, 0, 1000, 800);
      if (e.x !== 100 || e.w !== 300 || e.h !== 300) throw new Error('east ' + JSON.stringify(e));
      const nw = _ulCropResize(c0, 'nw', -500, -500, 1000, 800);
      if (nw.x !== 0 || nw.y !== 0 || nw.w !== 600 || nw.h !== 400) throw new Error('clamped to the sheet ' + JSON.stringify(nw));
      const mv = _ulCropResize(c0, 'move', 900, 900, 1000, 800);
      if (mv.x !== 500 || mv.y !== 500 || mv.w !== 500) throw new Error('slide ' + JSON.stringify(mv));
      const tiny = _ulCropResize(c0, 'w', 10000, 0, 1000, 800);
      if (!(tiny.w >= 20)) throw new Error('collapsed ' + JSON.stringify(tiny));
    });
    __check('Done cropping keeps the scale: the kept part goes back where it sits on the sheet', () => {
      const f = SRC.slice(SRC.indexOf('async function applyUnderlayCrop('), SRC.indexOf('// ── A THIN GREY BORDER'));
      ['u.x = _ctxRound(F.x0 + c.x * F.su)', 'u.w = _ctxRound(c.w * F.su)', 'u.y = _ctxRound(F.top - (c.y + c.h) * F.su)', 'if (!u.sheet) u.sheet = F.sheet'].forEach(t => { if (f.indexOf(t) < 0) throw new Error('lost: ' + t); });
      if (f.indexOf('u.cal') >= 0) throw new Error('a crop must not touch the calibration');
    });
    __check('crop mode puts the whole sheet, the box and eight handles on the wall, and keeps the printed picture', () => {
      seed(SHEET()); elevScale = 2; _ulPlacing = false;
      toggleUnderlayCrop(true);
      renderElevUnderlay(126.5, 132);
      const L = document.getElementById('underlay-layer');
      if (L.querySelectorAll('._ulCropHandle').length !== 8) throw new Error('handles ' + L.querySelectorAll('._ulCropHandle').length);
      if (!L.querySelector('._ulCropBox') || !L.querySelector('img.elev-underlay-img')) throw new Error('box or kept picture missing');
      elevations.push({ id: 'w2', name: 'W2', wallW: 100, wallH: 100, frames: [], underlay: SHEET() });
      currentElevIndex = 1; renderElevUnderlay(100, 100);
      if (_ulCropping) throw new Error('a crop carried over to another wall');
      currentElevIndex = 0;
    });
    __check('grey border: on by default, per wall stores only a difference, All walls clears them', () => {
      seed(SHEET());
      if (!_elevBorderPrints(elevations[0])) throw new Error('off by default');
      setElevBorderWall(false);
      if (elevations[0].drawingBorder !== false) throw new Error('not stored');
      setElevBorderWall(true);
      if ('drawingBorder' in elevations[0]) throw new Error('the default should store nothing');
      setElevBorderWall(false); _setElevBorderAll(true);
      if ('drawingBorder' in elevations[0] || !_elevBorderPrints(elevations[0])) throw new Error('All walls did not clear');
      _setElevBorderAll(false);
      if (_elevBorderPrints(elevations[0])) throw new Error('All walls off did not take');
      delete editorialContent.elevBorder;
    });
    __check('the border prints 0.5 pt plan grey round the drawing, only when it prints whole and is on', () => {
      const calls = [];
      const doc = { setDrawColor: (...a) => calls.push(['color', a]), setLineWidth: (w) => calls.push(['lw', w]), setLineDashPattern: () => {}, rect: (...a) => calls.push(['rect', a]) };
      const view = { vec: { w: 200, h: 100 }, ulBox: [10, 5, 190, 95] };
      seed(SHEET());
      _igDrawingBorder(doc, view, elevations[0], 100, 50, 400, 200);
      const r = calls.find(c => c[0] === 'rect');
      if (!r || JSON.stringify(r[1]) !== JSON.stringify([120, 60, 360, 180, 'S'])) throw new Error('rect ' + JSON.stringify(r));
      if (!calls.some(c => c[0] === 'lw' && c[1] === PLAN_BORDER_PT)) throw new Error('not the plan border weight');
      calls.length = 0; elevations[0].drawingBorder = false;
      _igDrawingBorder(doc, view, elevations[0], 100, 50, 400, 200);
      if (calls.some(c => c[0] === 'rect')) throw new Error('drew with the border off');
      calls.length = 0; seed(Object.assign(SHEET(), { deckView: undefined }));
      _igDrawingBorder(doc, view, elevations[0], 100, 50, 400, 200);
      if (calls.some(c => c[0] === 'rect')) throw new Error('drew round a wall-cropped drawing');
      const ig = SRC.slice(SRC.indexOf('async function _drawInstallGuidePage('), SRC.indexOf('\\nasync function ', SRC.indexOf('async function _drawInstallGuidePage(') + 10));
      if (ig.split('_igDrawingBorder(doc, cap, elev').length - 1 !== 3) throw new Error('not on every install layout');
      if (SRC.indexOf("ulBox: (cap.boxes && cap.boxes['underlay-layer'])") < 0) throw new Error('the page view does not carry the drawing box');
    });
    __check('handles you can grab: three on the wall (20.67: none round the print area), none while placing', () => {
      seed(SHEET()); elevScale = 2; _ulPlacing = false; _ulCropping = false; _ulCalibrateActive = false;
      renderElevUnderlay(126.5, 132);
      const wall = document.getElementById('wall');
      if (wall.querySelectorAll('._wallHandle').length !== 3) throw new Error('wall handles ' + wall.querySelectorAll('._wallHandle').length);
      if (wall.querySelectorAll('._ulPaHandle').length) throw new Error('20.67: the print area is cropped in the sheet window, not on the wall');
      if ([...wall.querySelectorAll('._wallHandle, ._ulPaHandle')].some(h => h.getAttribute('data-export-skip') !== '1')) throw new Error('a handle could reach an export');
      seed(Object.assign(SHEET(), { deckView: undefined })); renderElevUnderlay(126.5, 132);
      if (wall.querySelectorAll('._ulPaHandle').length) throw new Error('print-area handles on a wall-cropped drawing');
      _ulPlacing = true; renderElevUnderlay(126.5, 132); _ulPlacing = false;
      if (wall.querySelectorAll('._wallHandle').length) throw new Error('wall handles while placing the drawing');
    });
    __check('a wall drag sizes from the right and the top, to the quarter inch, never under a foot', () => {
      const d = { kind: 'ne', w0: 126.5, h0: 132 };
      const s1 = _wallDragSize(d, 20.3, -10.1, 2, 1);   // +10.15in wide, +5.05in high at 2 px per inch
      if (s1.w !== 136.75 || s1.h !== 137) throw new Error(JSON.stringify(s1));
      const s2 = _wallDragSize({ kind: 'e', w0: 126.5, h0: 132 }, -5000, 999, 2, 1);
      if (s2.w !== 12 || s2.h !== 132) throw new Error('floor or height moved, or under a foot: ' + JSON.stringify(s2));
    });
    __check('a sheet can be dropped on the Client elevation panel', () => {
      seed(null); renderUnderlayControls();
      const box = document.getElementById('underlayControls');
      if (!box._ulDropWired) throw new Error('no drop target');
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
