const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // Fake Image() that reports a REAL aspect DIFFERENT from a.aspect, to prove
  // the fix trusts real pixels over the stored (stale) value.
  window.HTMLCanvasElement.prototype.getContext = () => ({ save(){}, restore(){}, clip(){}, beginPath(){}, ellipse(){}, drawImage(){}, measureText:()=>({width:6}), scale(){}, fillRect(){}, fill(){}, stroke(){}, moveTo(){}, lineTo(){}, arcTo(){}, closePath(){}, arc(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip2(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,BAKED';
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __checkAsync = (label, fn) => { const p2 = __chain.then(fn).then(() => ({ label, ok: true })).catch(e => ({ label, ok: false, err: e.message })); __chain = p2.then(() => {}); window.__asyncChecks.push(p2); };
    editorialContent = editorialContent || {};
    scheduleAutosave=()=>{};

    // Fake the Image constructor so _loadImg resolves with REAL natural
    // dimensions that deliberately DIFFER from whatever a.aspect claims —
    // fires onload on the next microtask, same as the real loader expects.
    window.Image = function () {
      const im = { onload: null, onerror: null, naturalWidth: 400, naturalHeight: 300 };
      Object.defineProperty(im, 'src', { set() { Promise.resolve().then(() => { if (im.onload) im.onload(); }); } });
      return im;
    };

    __checkAsync('_ensureShapeImage trusts the REAL decoded aspect over a stale a.aspect for THIS bake (crop math correct)', async () => {
      const a = { dataUrl: 'data:image/jpeg;base64,FAKE', aspect: 0.5, fit: 'cover' };   // wildly wrong stored aspect
      Object.keys(_shapeImgCache).forEach(k => delete _shapeImgCache[k]);
      let capturedAspect = null;
      const origImgRect = _imgRect;
      _imgRect = (mode, W, H, aspect, zoom, panX, panY) => { capturedAspect = aspect; return origImgRect(mode, W, H, aspect, zoom, panX, panY); };
      await _ensureShapeImage(a, 100, 100, 'contain');
      _imgRect = origImgRect;
      if (Math.abs(capturedAspect - (400/300)) > 0.01) throw new Error('wrong aspect used: ' + capturedAspect);
    });

    __checkAsync('_ensureShapeImage no longer mutates a.aspect \u2014 doing so drifted the cache key between a priming call and a later draw-time lookup, silently reintroducing raw-byte fallback', async () => {
      const a = { dataUrl: 'data:image/jpeg;base64,FAKE', aspect: 0.5, fit: 'cover' };
      Object.keys(_shapeImgCache).forEach(k => delete _shapeImgCache[k]);
      await _ensureShapeImage(a, 100, 100, 'contain');
      if (a.aspect !== 0.5) throw new Error('a.aspect was mutated, reintroducing the cache-key drift bug: ' + a.aspect);
    });

    __checkAsync('priming then a later draw-time lookup HIT the same cache entry (the actual guarantee this fix depends on)', async () => {
      const a = { dataUrl: 'data:image/jpeg;base64,STABLEKEY', aspect: 0.5, zoom: 1 };
      Object.keys(_shapeImgCache).forEach(k => delete _shapeImgCache[k]);
      const PW = 936;
      // Priming call \u2014 exactly as the new upfront pass makes it.
      const primeH = (a.w || 0.25) * PW * (a.aspect || 0.75);
      await _ensureShapeImage(Object.assign({}, a, { shape: 'rect', w: 0.25 }), 0.25 * PW, primeH, 'contain');
      // Draw-time call \u2014 recomputes pw/ph fresh from a.aspect, exactly as the drawer does.
      const drawH = (a.w || 0.25) * PW * (a.aspect || 0.75);
      const key = _shapeImgKey(Object.assign({}, a, { shape: 'rect', w: 0.25 }), 0.25 * PW, drawH) + '|focontain';
      if (!_shapeImgCache[key]) throw new Error('draw-time key missed the primed cache entry \u2014 the exact bug this fix must prevent');
    });

    __checkAsync('image annotation PDF: zoom<=1 draws via the CONTAIN-baked cache, never the naive full stretch', async () => {
      editorialContent.annotations = { 'layout:pgI': [{ type: 'image', x: 0.1, y: 0.1, w: 0.3, aspect: 0.5, dataUrl: 'data:image/jpeg;base64,FAKE', zoom: 1 }] };
      Object.keys(_shapeImgCache).forEach(k => delete _shapeImgCache[k]);
      // Prime exactly like the export pre-pass does.
      const a = editorialContent.annotations['layout:pgI'][0];
      const PW = 936, PH = 540;
      const pw = (a.w || 0.25) * PW, ph = (a.w || 0.25) * PW * (a.aspect || 0.75);
      await _ensureShapeImage(Object.assign({}, a, { shape: 'rect' }), pw, ph, 'contain');
      const rec = new CanvasPdfRec(936, 540);
      let addImageCalls = [];
      rec.addImage = function (src2, fmt, x, y, w2, h2) { addImageCalls.push({ src: src2, w: w2, h: h2 }); };
      _drawOneAnnotation(rec, a, PW, PH);
      if (!addImageCalls.length) throw new Error('addImage never called');
      if (addImageCalls[0].src.indexOf('BAKED') < 0) throw new Error('did not draw the baked (contain) image: ' + addImageCalls[0].src);
    });

    __check('image annotation PDF: unprimed fallback still letterboxes instead of stretching (source guard)', () => {
      const S = window.__appSrc;
      if (S.indexOf("const cr2 = _imgRect(fitMode, pw, ph, a.aspect || 0.75, a.zoom || 1, a.panX || 0, a.panY || 0);") < 0) throw new Error('manual contain fallback missing');
      if (S.indexOf('doc.addImage(a.dataUrl, fmt, x + cr2.offX, y + cr2.offY, cr2.dW, cr2.dH)') < 0) throw new Error('fallback still stretches full box');
    });

    __check('image/shape priming now runs UPFRONT, before any page is drawn — not after (the actual fix)', () => {
      const S = window.__appSrc;
      const primeIdx = S.indexOf("if (_a2 && _a2.type === 'image' && _a2.dataUrl) { const _fm2 = (_a2.zoom || 1) > 1 ? 'cover' : 'contain';");
      if (primeIdx < 0) throw new Error('upfront priming pass not found');
      const drawLayoutIdx = S.indexOf('const drawLayoutPage = async (page) => {');
      if (drawLayoutIdx < 0) throw new Error('drawLayoutPage not found');
      if (!(primeIdx < drawLayoutIdx)) throw new Error('priming pass does not come before drawLayoutPage is defined \\u2014 ordering regression');
      // The old per-pagenum loop (which ran AFTER all pages were emitted, the
      // actual bug) must no longer prime images/shapes \\u2014 only mockups,
      // which are a different, already-canvas-composited pipeline.
      if (S.indexOf("if (_a && _a.type === 'shape' && _a.dataUrl) { try { await _ensureShapeImage(_a, (_a.w || 0.25) * PW") >= 0) throw new Error('old mistimed shape priming still present');
    });

    __checkAsync('zoomed (cover) case still works: uses cover fit, still trusts real aspect', async () => {
      const a = { dataUrl: 'data:image/jpeg;base64,FAKE2', aspect: 0.5, zoom: 2, panX: 0, panY: 0 };
      Object.keys(_shapeImgCache).forEach(k => delete _shapeImgCache[k]);
      let capturedMode = null;
      const origImgRect = _imgRect;
      _imgRect = (mode, W, H, aspect, zoom, panX, panY) => { capturedMode = mode; return origImgRect(mode, W, H, aspect, zoom, panX, panY); };
      await _ensureShapeImage(Object.assign({}, a, { shape: 'rect' }), 100, 100, 'cover');
      _imgRect = origImgRect;
      if (capturedMode !== 'cover') throw new Error('wrong fit mode for zoomed image: ' + capturedMode);
    });
  `;
  try { window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = window.__testResults || [];
  const asyncResults = await Promise.all(window.__asyncChecks || []);
  const all = results.concat(asyncResults);
  let failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
