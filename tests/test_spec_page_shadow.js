// 18.42: drop shadows on spec pages. Asked: "I do not think I'm getting any drop
// shadows in the actual PDF presentation, which some designers like to do". Every
// spec-page frame image is rendered at pad 0 and flattened onto white, so the outer
// shadow had nowhere to go. Now a separate transparent shadow PNG goes UNDER the
// unchanged frame image, opt-in through Frame effects (frameFx.pageShadow).
// Runs the REAL export with the REAL jsPDF and reads every image it places.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
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
  const JPG1 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  window.HTMLCanvasElement.prototype.toDataURL = function (t) { return (t || '').indexOf('jpeg') >= 0 ? JPG1 : PNG1; };
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator; global.self = window;
  window.jspdf = { jsPDF: require(path.join(root, 'lib-jspdf.min.js')).jsPDF };
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    window.__run = (async () => {
      _autosaveToldUser = true;
      scheduleAutosave = () => {}; pushHistory = () => {};
      _pdfShowOverlay = () => {}; _pdfHideOverlay = () => {}; _pdfProgress = () => {};
      _registerPdfFonts = async () => {}; _loadEditorBrandFonts = async () => {}; _getPdfLogos = async () => ({});
      _captureElevWithGuides = async () => null;
      showSpecPdfPreview = () => {};
      dashUnit = 'in'; elevUnit = 'in';
      dashProjectData = [Object.assign(_cloneData(dashDefaultData), { id: 'ART.1', extW: 24, extH: 30 }), Object.assign(_cloneData(dashDefaultData), { id: 'EGD.1', product: 'Wallcovering (EGD)', extW: 100, extH: 90 })];
      elevations = [];
      editorialContent.specTemplate = 'frameSpecDetail';
      ['cover', 'understanding', 'narrative', 'strategy', 'floorplanKey', 'slogan', 'contacts', 'timeline', 'frameRec'].forEach(k => { const e = document.getElementById('specInc_' + k); if (e) e.checked = false; });
      const sp = document.getElementById('specInc_spec'); if (sp) sp.checked = true;
      window._exportScope = { mode: 'all' };
      const run = async () => {
        const placed = [];
        const D = window.jspdf.jsPDF.API;
        const real = D.addImage;
        D.addImage = function (data, fmt, x, y, w, h) { placed.push({ fmt: String(fmt || ''), x, y, w, h }); return real.apply(this, arguments); };
        try { await _buildSpecPagePDF({ all: true, include: _dsInclude(), meta: {}, preview: true }); }
        finally { D.addImage = real; }
        return placed;
      };
      frameFx.pageShadow = false;
      const off = await run();
      frameFx.pageShadow = true;
      const on = await run();
      frameFx.pageShadow = false;
      __check('off (the default): no shadow image, so existing decks print as before', () => {
        if (off.some(p => p.fmt === 'PNG')) throw new Error('a PNG was placed with the option off');
        if (_frameFxNormalize({}).pageShadow !== false) throw new Error('the default is not off');
      });
      __check('EXACT ASK: on, the framed piece casts a shadow onto the page in the PDF', () => {
        const i = on.findIndex(p => p.fmt === 'PNG');
        if (i < 0) throw new Error('no shadow image in the PDF');
        const frame = on[i + 1];
        if (!frame || frame.fmt !== 'JPEG') throw new Error('the shadow is not drawn straight under a frame image');
        const s = on[i];
        if (!(s.x < frame.x && s.y < frame.y && s.x + s.w > frame.x + frame.w && s.y + s.h > frame.y + frame.h)) throw new Error('the shadow does not surround the frame');
      });
      __check('the frame image itself is the same size and place with the option on', () => {
        const fo = off.filter(p => p.fmt === 'JPEG').map(p => [p.x, p.y, p.w, p.h].map(n => n.toFixed(2)).join(',')).join('|');
        const fn = on.filter(p => p.fmt === 'JPEG').map(p => [p.x, p.y, p.w, p.h].map(n => n.toFixed(2)).join(',')).join('|');
        if (fo !== fn) throw new Error('frames moved: ' + fo + ' vs ' + fn);
      });
      __check('only the framed piece: a wallcovering sheet casts none', () => {
        if (on.filter(p => p.fmt === 'PNG').length !== 1) throw new Error(on.filter(p => p.fmt === 'PNG').length + ' shadow images for one framed piece');
      });
      __check('the drop shadow switch still rules: off means none even on spec pages', () => {
        const prev = dashOuterShadowsOn; dashOuterShadowsOn = false; frameFx.pageShadow = true;
        const got = []; const fakeDoc = { addImage: (...a) => got.push(a) };
        _pdfFrameShadow(fakeDoc, { extW: 24, extH: 30, product: 'Framed Art' }, 0, 0, 100, 125);
        dashOuterShadowsOn = prev; frameFx.pageShadow = false;
        if (got.length) throw new Error('a shadow was drawn with the drop shadow switched off');
      });
      __check('all five spec-page frame sites draw the shadow first', () => {
        const S = window.__appSrc;
        if ((S.match(/_pdfFrameShadow\\(doc, /g) || []).length !== 6) throw new Error('expected the helper plus five call sites');
      });
    })();
  `;
  try { window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock); await window.__run; }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
