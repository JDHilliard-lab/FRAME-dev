// 18.80: IMAGES PRINT AT THE SIZE THEY PRINT, ARE DECODED ONCE, AND ARE COMPRESSED.
//
// Profiled on a real 30-page deck: the export took 75 s and wrote a 49 MB PDF. 532
// million pixels went through JPEG/PNG encoding (mockups drawn at 96-110 dpi of the
// piece's REAL size, elevation captures embedding every frame at 150 dpi and every
// photo at full resolution), 43 images were decoded 218 times, and 30 MB of the file was
// 14 PNG images stored RAW (frame shadows added as bare 'PNG', PNG plans handed over as
// 'JPEG'). After: about 22 s and 6.7 MB, pages visually identical (pixel-compared).
// These checks pin each mechanism; the end-to-end check runs the REAL export with REAL
// jsPDF and fails if any image in the file is stored without compression.
//
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'templates.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const noop = () => ctx2d;
  const ctx2d = new Proxy({}, { get: (t, k) => {
    if (k === 'measureText') return () => ({ width: 0 });
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, (w | 0) * (h | 0) * 4)), width: w, height: h });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: () => {} });
    if (k === 'canvas') return undefined;
    return k in t ? t[k] : noop;
  }, set: (t, k, v) => { t[k] = v; return true; } });
  window.HTMLCanvasElement.prototype.getContext = () => ctx2d;
  const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  // A real tiny JPEG when one is asked for: jsdom would hand back PNG bytes labelled
  // JPEG, which jsPDF then stores raw, and the end-to-end check would be testing jsdom.
  const JPG1 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  window.HTMLCanvasElement.prototype.toDataURL = (t) => (/jpe?g/.test(t || '') ? JPG1 : PNG1);
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator; global.self = window;
  window.jspdf = { jsPDF: require(path.join(root, 'lib-jspdf.min.js')).jsPDF };

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const S = window.__appSrc;
    const fnBody = (name) => { const a = S.indexOf('function ' + name + '('); const b = S.indexOf('\\nfunction ', a + 10); const c = S.indexOf('\\nasync function ', a + 10); return S.slice(a, Math.min(b < 0 ? 1e9 : b, c < 0 ? 1e9 : c)); };
    window.__run = (async () => {
      scheduleAutosave = () => {}; pushHistory = () => {}; _autosaveToldUser = true;
      __check('a raster is sized to the box it prints in, at the export quality, never enlarged', () => {
        _pdfQuality = 'standard';
        const big = { width: 5760, height: 3840 };
        const r = _rasterFit(big, 200, 200);
        // contain fit 200/5760 = 0.0347; x R 2 x 1.5 = 0.104
        if (Math.abs(r.w - Math.round(5760 * 200 / 5760 * 3)) > 1) throw new Error('width ' + r.w);
        if (Math.abs(r.w / r.h - 1.5) > 0.01) throw new Error('aspect changed');
        const small = _rasterFit({ width: 300, height: 200 }, 900, 500);
        if (small.w !== 300 || small.h !== 200) throw new Error('a small image was enlarged: ' + JSON.stringify(small));
        _pdfQuality = 'print';
        if (_rasterFit(big, 200, 200).w <= r.w) throw new Error('Print does not get more pixels');
        _pdfQuality = 'standard';
        const page = _rasterFit(big, 0, 0);
        if (page.w > PAGE_FORMAT[0] * 2 * 1.5 + 1) throw new Error('no box should mean the page, got ' + page.w);
        const line = _rasterFit(big, 200, 200, 2.5);
        if (!(line.w > r.w)) throw new Error('line work gets no extra headroom');
      });
      __check('every deck-page mockup and elevation thumbnail is sized before it is encoded', () => {
        const n = S.split('_rasterFit(cnv, ').length - 1, m = S.split('_rasterFit(er.canvas, ').length - 1;
        if (n < 8) throw new Error(n + ' mockup sites (expected 8)');
        if (m < 5) throw new Error(m + ' elevation thumbnail sites (expected 5)');
        if (S.indexOf('flat.width = cnv.width; flat.height = cnv.height;') >= 0) throw new Error('a mockup is still flattened at full size');
        if (S.indexOf('flat.width = er.canvas.width; flat.height = er.canvas.height;') >= 0) throw new Error('an elevation thumbnail is still flattened at full size');
      });
      __check('the PDF capture asks for capture-sized frames and artwork; the SVG download does not', () => {
        if (S.indexOf("exportElevSVG({ returnBlob: true, forCapture: true })") < 0) throw new Error('capture does not ask for it');
        const B = fnBody('exportElevSVG');
        if (B.indexOf('(opts && opts.forCapture)') < 0) throw new Error('export ignores it');
        if (B.indexOf('_maybeAddArtworkToSvg(f, el, backLayer, rectToSvg, _href)') < 0) throw new Error('artwork not swapped for the shrunk copy');
        if ((S.match(/_svgExportAs\\('texture', \\(\\) => exportElevSVG\\(\\)\\)/) || []).length !== 1) throw new Error('the SVG download changed');
      });
      {
        const realRaw = _loadImgRaw; let raw = 0, fail = true;
        _loadImgRaw = (u) => { raw++; return Promise.resolve(fail ? null : { naturalWidth: 10, naturalHeight: 10, src: u }); };
        const u = 'data:image/jpeg;base64,' + 'A'.repeat(400);
        await _loadImg(u); await _loadImg(u);
        const failedTwice = raw;
        fail = false; const a = await _loadImg(u), b = await _loadImg(u);
        __check('a data: image is decoded once and shared; a failed load is tried again', () => {
          if (failedTwice !== 2) throw new Error('a failed load was cached: ' + failedTwice + ' decodes');
          if (raw !== 3) throw new Error('decoded ' + raw + ' times');
          if (a !== b) throw new Error('callers did not get the same image');
        });
        raw = 0;
        await _loadImg('blob:x'); await _loadImg('blob:x');
        __check('blob: and repo-file URLs are not cached', () => { if (raw !== 2) throw new Error(raw + ' decodes'); });
        for (let i = 0; i < _IMG_CACHE_MAX + 10; i++) await _loadImg('data:image/jpeg;base64,' + String(i).padStart(4, '0') + 'B'.repeat(400));
        __check('the decode cache stays bounded', () => { if (_imgCache.size > _IMG_CACHE_MAX) throw new Error(_imgCache.size + ' kept'); });
        _loadImgRaw = realRaw;
      }
      __check('PNGs reach the PDF compressed: shadows, plans, logos', () => {
        if (fnBody('_pdfFrameShadow').indexOf("_addPngImage(doc, s.canvas.toDataURL('image/png')") < 0) throw new Error('the frame shadow is added as a bare PNG');
        if (fnBody('_drawFloorplanKeyPage').indexOf('_addPngImage(doc, planImg.src') < 0) throw new Error('a PNG plan page is stored raw');
        if (S.indexOf("if (/^data:image\\\\/png/i.test(srcData || '')) _addPngImage(doc, srcData, px0, py0, pw2, ph2);") < 0) throw new Error('the plan thumbnail on breaker pages is stored raw');
        const bare = (S.match(/addImage\\([^;]*'PNG'[^;]*\\)/g) || []).filter(x => x.indexOf("'MEDIUM'") < 0);
        if (bare.length) throw new Error('bare PNG adds: ' + bare.join(' | '));
      });
      // End to end: the REAL export with REAL jsPDF, with a frame shadow switched on.
      {
        let shown = null; showSpecPdfPreview = (doc) => { shown = doc; };
        _pdfShowOverlay = () => {}; _pdfHideOverlay = () => {}; _pdfProgress = () => {};
        _registerPdfFonts = async () => {}; _loadEditorBrandFonts = async () => {}; _getPdfLogos = async () => ({});
        _captureElevWithGuides = async () => null;
        const row = (id, extra) => Object.assign(_cloneData(dashDefaultData), { id: id, location: 'Lobby', extW: 24, extH: 30 }, extra || {});
        dashUnit = 'in'; elevUnit = 'in';
        dashProjectData = [row('ART.1'), row('ART.2')];
        elevations = [{ id: 'e1', name: 'W', w: 200, h: 108, frames: [{ id: 'ART.1', letter: 'A', x: 20, y: 50, w: 24, h: 30, active: true }] }];
        floorplanLevels = [{ name: 'Level 1', imageData: null }];
        frameFx.pageShadow = true;
        ['cover', 'spec', 'contacts'].forEach(k => { const el = document.getElementById('specInc_' + k); if (el) el.checked = true; });
        window._exportScope = { mode: 'all' };
        let err = null;
        try { await _buildSpecPagePDF({ all: true, include: _dsInclude(), meta: {}, preview: true }); } catch (e) { err = e; }
        __check('EXACT BUG: no image in a real exported PDF is stored without compression', () => {
          if (err) throw new Error('export threw: ' + (err.message || err));
          const out = shown.output();
          const imgs = out.split('/Subtype /Image').length - 1;
          // Each object's dictionary runs from 'obj' to 'stream'; nested << >> (DecodeParms)
          // come before /Filter, so a [^>] pattern stops short and reads a compressed image as raw.
          let raw = 0;
          out.split(' 0 obj').forEach(seg => { const head = seg.slice(0, Math.max(0, seg.indexOf('stream'))); if (head.indexOf('/Subtype /Image') >= 0 && head.indexOf('/Filter') < 0) raw++; });
          if (!imgs) throw new Error('fixture embedded no images');
          if (raw) throw new Error(raw + ' of ' + imgs + ' images stored raw');
        });
      }
    })();
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
    await window.__run;
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
