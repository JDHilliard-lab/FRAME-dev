// 19.67, "Can we make the elevation fade the artworks in the elevation thumbnail that are not
// featured in the spec". A per-piece page already faded the rest of the wall; a Group A/B/C
// page passed no featured piece, so every frame on the wall printed at full strength, even
// another code's (ART.4 beside ART.5) or the other half of a split set.
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
    _planCropCanvasForRow = async () => null;
    _sharedSpecFrames = async () => [];
    const fr = (id, letter, x, w) => ({ id: id, letter: letter, x: x, y: 40, w: w, h: 30, active: true, dimTo: [] });

    __check('EXACT REQUEST: a list of featured pieces draws them full and fades the rest', async () => {
      elevUnit = 'in';
      const draws = [];
      const realRF = renderFrameToCanvas;
      renderFrameToCanvas = (d) => { const c = document.createElement('canvas'); c.__w = d.extW; return { canvas: c }; };
      const realGet = window.HTMLCanvasElement.prototype.getContext;
      window.HTMLCanvasElement.prototype.getContext = function () {
        if (this.__ctxF) return this.__ctxF;
        const ctx = realGet.call(this);
        ctx.globalAlpha = 1;
        ctx.drawImage = (img) => { if (img && img.__w) draws.push({ w: img.__w, a: ctx.globalAlpha }); };
        return (this.__ctxF = ctx);
      };
      try {
        const elev = { id: 'w1', wallW: 300, wallH: 108, frames: [fr('ART.4A', 'A', 10, 21), fr('ART.4B', 'B', 60, 22), fr('ART.5', 'C', 120, 23)] };
        await renderElevationToCanvas(elev, ['ART.4A', 'ART.4B'], { dpi: 4, tight: true });
        const a = (w) => (draws.find(d => d.w === w) || {}).a;
        if (a(21) !== 1 || a(22) !== 1) throw new Error('the set was faded: ' + a(21) + ', ' + a(22));
        if (!(a(23) < 1)) throw new Error('ART.5 (not on this page) was drawn at ' + a(23));
        draws.length = 0;
        await renderElevationToCanvas(elev, 'ART.5', { dpi: 4, tight: true });
        if (a(23) !== 1 || !(a(21) < 1)) throw new Error('one featured id (per-piece page) no longer works');
        draws.length = 0;
        await renderElevationToCanvas(elev, [], { dpi: 4, tight: true });
        if (draws.some(d => d.a !== 1)) throw new Error('an empty list faded something');
      } finally { renderFrameToCanvas = realRF; window.HTMLCanvasElement.prototype.getContext = realGet; }
    });

    __check('EXACT REQUEST: a Group A/B/C page features its own pieces on the wall thumbnail', async () => {
      editorialContent = _editorialDefaults();
      editorialContent.specTemplate = 'setLegend';
      editorialContent.specGroupSlots = { frame: false, profile: false, plan: false, elevation: true };
      elevUnit = 'in'; dashUnit = 'in';
      floorplanLevels = [{ name: 'L1', imageData: '' }];
      dashProjectData = [{ id: 'ART.4A', product: 'Framed Art', extW: 30, extH: 30, level: 0 },
                         { id: 'ART.4B', product: 'Framed Art', extW: 30, extH: 30, level: 0 },
                         { id: 'ART.5', product: 'Framed Art', extW: 30, extH: 30, level: 0 }];
      elevations = [{ id: 'w1', name: 'ART.4', wallW: 320, wallH: 108, frames: [fr('ART.4A', 'A', 20, 30), fr('ART.4B', 'B', 80, 30), fr('ART.5', 'A', 200, 30)] }];
      const seen = [];
      const realR = renderElevationToCanvas;
      renderElevationToCanvas = async (elev, feat) => { seen.push(feat); return null; };
      try {
        const rec = new CanvasPdfRec(936, 540); rec._pxPerPt = 2;
        await _drawSpecSetPage(rec, {}, 3, {}, { rep: dashProjectData[0], members: dashProjectData.slice(0, 2), key: 'ART.4' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      } finally { renderElevationToCanvas = realR; }
      if (!seen.length) throw new Error('fixture: the page drew no elevation');
      seen.forEach(f => {
        if (!Array.isArray(f) || f.join() !== 'ART.4A,ART.4B') throw new Error('featured ' + JSON.stringify(f) + ', expected ART.4A and ART.4B');
      });
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
