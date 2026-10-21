// 19.46, on the Ford Salt Lake City deck:
//  1. "some of the spec page thumbnails change in size ... longer walls are causing the
//     thumbnails to go smaller". The floorplan and frame strip followed the elevation's
//     DRAWN height; a long wall draws short, so the whole row shrank. They now follow the
//     elevation BOX, on group pages and per-piece pages alike.
//  2. "one of my elevations is crashing into the specs, the scale is too big. ART.15":
//     with hang height off, no guide spanned the wall, so the picture was cropped to the
//     art while the wall outline drew full width. The wall is now always in the crop.
//  3. "the lounge chair is not being rendered in the smaller thumbnails": its lines were
//     screen-pixel weights on a canvas ~8x the printed size, so they vanished.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const mkCtx = () => new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s || '').length * 5 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  window.HTMLCanvasElement.prototype.getContext = function () { return this.__ctx || (this.__ctx = mkCtx()); };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __check = (label, fn) => {
      __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true }))
        .catch(e => ({ label, ok: false, err: e.message })));
      window.__asyncChecks.push(__chain);
    };
    _autosaveToldUser = true;
    scheduleAutosave = () => {}; pushHistory = () => {};
    _planCropCanvasForRow = async () => null;          // the plan reserves a swatch box: its size is what we read
    _sharedSpecFrames = async () => [];
    const fakeElev = (w, h) => async () => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      return { canvas: c, wIn: w / 10, hIn: h / 10, wallLeftFrac: 0, wallRightFrac: 1, wallTopFrac: 0 };
    };
    const fr = (id, letter, x, w) => ({ id: id, letter: letter, x: x, y: 40, w: w, h: 30, active: true, dimTo: [] });
    const setup = (tpl) => {
      editorialContent = _editorialDefaults();
      editorialContent.specTemplate = tpl;
      editorialContent.specGroupSlots = { frame: false, profile: false, plan: true, elevation: true };
      editorialContent.specSlots = { frame: false, profile: false, plan: true, elevation: true };
      elevUnit = 'in'; dashUnit = 'in';
      floorplanLevels = [{ name: 'L1', imageData: '' }];
      dashProjectData = [{ id: 'ART.1', product: 'Framed Art', extW: 30, extH: 30, level: 0 }];
      elevations = [{ id: 'w1', name: 'ART.1', wallW: 120, wallH: 108, frames: [fr('ART.1', 'A', 40, 30)] }];
    };
    // The Floorplan box size, and the elevation's drawn rect, for an elevation of aspect w:h.
    const planBox = async (tpl, w, h) => {
      setup(tpl);
      renderElevationToCanvas = fakeElev(w, h);
      const boxes = [];
      const realSw = _specSwatchBox;
      _specSwatchBox = function (doc, x, y, bw, bh, cap) { if (cap === 'Floorplan') boxes.push([bw, bh, y + bh]); return realSw.apply(this, arguments); };
      try {
        const rec = new CanvasPdfRec(936, 540);
        if (tpl === 'setLegend') {
          await _drawSpecSetPage(rec, {}, 3, {}, { rep: dashProjectData[0], members: dashProjectData, key: 'ART.1' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
        } else {
          await _drawSpecPageTemplate(rec, {}, 3, {}, dashProjectData[0], 'frameSpecDetail', { PW: 936, PH: 540, M: 40 });
        }
      } finally { _specSwatchBox = realSw; }
      if (!boxes.length) throw new Error(tpl + ': no floorplan box drawn');
      return boxes[0];
    };

    ['setLegend', 'frameSpecDetail'].forEach(tpl => {
      __check('EXACT BUG (' + tpl + '): a long wall does not shrink the floorplan beside it', async () => {
        const square = await planBox(tpl, 400, 300);     // an ART.1-like wall
        const long = await planBox(tpl, 1200, 300);      // ART.4: 320in of corridor
        if (Math.abs(square[1] - long[1]) > 0.01) throw new Error('floorplan ' + square[1].toFixed(1) + ' tall beside a normal wall, ' + long[1].toFixed(1) + ' beside a long one');
        if (Math.abs(square[2] - long[2]) > 0.01) throw new Error('the row moved: bottoms ' + square[2] + ' vs ' + long[2]);
      });
    });

    __check('EXACT BUG: the capture crop always holds the whole wall, even with no guide spanning it', async () => {
      const realLoad = _loadImg;
      _loadImg = async () => ({ width: 1200, height: 700, naturalWidth: 1200, naturalHeight: 700 });
      try {
        const cap = { allGuides: true, dataUrl: 'data:image/jpeg;base64,AAAA', w: 1200, h: 700,
          vec: { w: 120, h: 70, ops: [{ t: 'line', x1: 10, y1: 65, x2: 110, y2: 65 }] },
          boxes: { wall: [10, 5, 110, 65], 'frame-layer': [50, 20, 60, 30] }, pad: { left: 5, safe: 2 } };
        const v = await _capView(cap);
        if (v.vec.w < 100) throw new Error('crop is ' + v.vec.w + ' wide, narrower than the 100-wide wall (the ART.15 bug)');
      } finally { _loadImg = realLoad; }
      if (_CAP_BASE_BOXES.indexOf('wall') < 0) throw new Error('the wall is not a base box');
      const S = window.__src, i = S.indexOf('boxes.wall = [');
      if (i < 0) throw new Error('exportElevSVG no longer records the wall box');
    });

    __check('EXACT BUG: context line art in a thumbnail is weighted for the printed size', async () => {
      setup('setLegend');
      elevations[0].contextBlocks = [{ id: 'c1', x: 70, y: 0, w: 32, h: 30, preset: 'lounge', label: 'Lounge Chair' }];
      elevations[0].frames[0].active = false;
      let pxScale = null, bw = null;
      const real = _ctxArtSvg;
      _ctxArtSvg = function (p, ink, s) { pxScale = s; return real.apply(this, arguments); };
      _loadImgRaw = async () => null;
      try {
        renderElevationToCanvas = window.__realREC;
        const er = await renderElevationToCanvas(elevations[0], null, { dpi: 28 });
        bw = 32 * 28;
        const cw = er.canvas.width;
        const objPx = CTX_LW_OBJ / pxScale * (bw / 32);   // the object line, in canvas pixels
        if (!(objPx >= cw / 260 - 0.01)) throw new Error('object line is ' + objPx.toFixed(2) + 'px on a ' + cw + 'px canvas; it vanishes when printed ~8x smaller');
      } finally { _ctxArtSvg = real; }
    });
  `;

  try {
    window.eval('window.__src = ' + JSON.stringify(src) + ';\n' + src + '\nwindow.__realREC = renderElevationToCanvas;\n' + testBlock);
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
