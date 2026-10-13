// 18.43: THE PER-PIECE ELEVATION THUMBNAIL IS CAPTIONED "Elevation".
//
// Reported: on a per-piece spec page the wall thumbnail was captioned with the
// wall's name (usually the piece's own code, e.g. ART.1.1), while the Group A/B/C
// pages say plain "Elevation". This renders a real per-piece page through
// CanvasPdfRec with the piece on a wall and reads the caption back.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const noop = () => ctx2d;
  const ctx2d = new Proxy({}, { get: (t, k) => {
    if (k === 'measureText') return (s) => ({ width: ('' + (s || '')).length * 6 });
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, (w | 0) * (h | 0) * 4)), width: w, height: h });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: () => {} });
    if (k === 'canvas') return undefined;
    return k in t ? t[k] : noop;
  }, set: (t, k, v) => { t[k] = v; return true; } });
  window.HTMLCanvasElement.prototype.getContext = () => ctx2d;
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    window.__run = (async () => {
      scheduleAutosave = () => {}; _autosaveToldUser = true;
      dashUnit = 'in'; elevUnit = 'in';
      const r = Object.assign(_cloneData(dashDefaultData), { id: 'ART.1.1A', location: 'LOBBY', extW: 30, extH: 40 });
      dashProjectData = [r];
      elevations = [{ id: 'e1', name: 'ART.1.1', wallW: 185, wallH: 108,
        frames: [{ id: 'ART.1.1A', letter: 'A', x: 20, y: 40, w: 30, h: 40, active: true, dimTo: [] }] }];
      floorplanLevels = [{ name: 'Level 1', imageData: '' }];
      // The thumbnail itself is a raster; hand back a real canvas so the caption
      // path runs (jsdom cannot draw the wall).
      renderElevationToCanvas = async () => { const c = document.createElement('canvas'); c.width = 400; c.height = 240; return { canvas: c, wallLeftFrac: 0 }; };
      editorialContent.specSlots = { frame: true, profile: true, plan: true, elevation: true };
      const rec = new CanvasPdfRec(936, 540);
      await _drawSpecPageTemplate(rec, {}, 1, { location: '', code: '', version: '' }, r, 'frameSpecDetail', { PW: 936, PH: 540, M: 40 });
      const texts = rec.ops.filter(o => o.t === 'text').map(o => o.str);
      __check('the wall thumbnail drew (fixture sanity)', () => {
        if (!_elevShowingPiece('ART.1.1A')) throw new Error('the piece is not on a wall in the fixture');
        if (texts.indexOf('Floorplan') < 0) throw new Error('no thumbnail band drawn: ' + texts.join(' | '));
      });
      __check('EXACT BUG: the elevation thumbnail is captioned "Elevation", not the wall name', () => {
        if (texts.indexOf('ART.1.1') >= 0) throw new Error('the caption still prints the wall name ART.1.1');
        if (texts.indexOf('Elevation') < 0) throw new Error('no "Elevation" caption: ' + texts.join(' | '));
      });
    })();
  `;
  try {
    window.eval(src + '\n' + testBlock);
    await window.__run;
  } catch (e) { console.error('LOAD/RUN FAILED:', e.stack || e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
