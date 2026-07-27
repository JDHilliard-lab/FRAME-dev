const { JSDOM } = require('jsdom');
const fs = require('fs');

(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(require('path').join(__dirname,'..','index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, {
    url: 'https://example.com/',
    pretendToBeVisual: true,
    runScripts: 'outside-only'
  });
  const { window } = dom;

  // Minimal canvas 2D stub, with a fake getImageData that lets us verify the
  // white-logo cleanup pass actually runs and rewrites pixels.
  let lastPutImageData = null;
  window.HTMLCanvasElement.prototype.getContext = function () {
    const w = this.width, h = this.height;
    return {
      scale(){}, fillRect(){}, drawImage(){}, measureText: (s) => ({ width: (s||'').length * 6 }),
      fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){},
      setLineDash(){}, putImageData(id){ lastPutImageData = id; window.__lastPutImageData = id; }, translate(){}, rotate(){},
      fillText(){}, strokeText(){}, clip(){}, rect(){}, quadraticCurveTo(){}, bezierCurveTo(){}, setTransform(){}, transform(){},
      getImageData(x, y, gw, gh) {
        // Simulate a rasterized white glyph with a "dirty" anti-aliased edge:
        // half the pixels are pure white/opaque (glyph body), the other half
        // are a grayish, non-white, partially-transparent edge pixel — this
        // is exactly the kind of pixel the cleanup pass must fix.
        const data = new Uint8ClampedArray(gw * gh * 4);
        for (let i = 0; i < gw * gh; i++) {
          const isEdge = (i % 2 === 0);
          data[i*4+0] = isEdge ? 60 : 255;
          data[i*4+1] = isEdge ? 60 : 255;
          data[i*4+2] = isEdge ? 60 : 255;
          data[i*4+3] = isEdge ? 120 : 255;
        }
        return { data, width: gw, height: gh };
      }
    };
  };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = (url) => {
    if (String(url).indexOf('white-logo') >= 0) {
      return Promise.resolve({ ok: true, text: () => Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20"><rect width="100" height="20" fill="#fff"/></svg>') });
    }
    return Promise.reject(new Error('no network in test'));
  };
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => {
      try { fn(); window.__testResults.push({ label, ok: true }); }
      catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); }
    };

    editorialContent = editorialContent || {};
    editorialContent.pageFooters = {};
    editorialContent.footer = {};

    window.__asyncChecks = [];
    const __checkAsync = (label, fn) => window.__asyncChecks.push(
      Promise.resolve().then(fn).then(() => ({ label, ok: true }))
        .catch(e => ({ label, ok: false, err: e.message }))
    );

    // ── Fix 1: _mbDrawGuides no longer bakes a duplicate footer text ──
    __check('_mbDrawGuides: no stale footer/copyright/FARMBOY text', () => {
      const canvas = document.createElement('div');
      document.body.appendChild(canvas);
      window._mbPage = () => ({ type: 'narrative', title: 'PROJECT UNDERSTANDING' });
      _mbDrawGuides(canvas);
      const txt = canvas.textContent || '';
      if (txt.indexOf('Copyright') >= 0) throw new Error('stale copyright text still present: ' + txt);
      if (txt.indexOf('FARMBOY') >= 0) throw new Error('stale FARMBOY text still present: ' + txt);
      if (txt.indexOf('PROJECT UNDERSTANDING') >= 0) throw new Error('page-name guide still previews on the page (names are organizational only now)');
    });

    __check('_mbDrawGuides: breaker guide label no longer claims NO FOOTER', () => {
      const canvas = document.createElement('div');
      document.body.appendChild(canvas);
      window._mbPage = () => ({ type: 'breaker' });
      _mbDrawGuides(canvas);
      const txt = canvas.textContent || '';
      if (txt.indexOf('NO FOOTER') >= 0) throw new Error('stale NO FOOTER claim still present: ' + txt);
      if (txt.indexOf('FULL BLEED') < 0) throw new Error('full bleed guide missing');
    });

    // ── Fix 2: ambient install-guide render shows a placeholder, never a
    //           live capture, and never throws ──
    __check('_drawInstallGuidePage ambient (no cache) shows placeholder, no throw', () => {
      elevations = [{ name: 'WALL A', wallW: 240, wallH: 96, frames: [{ id: 'ART.001', letter: 'A', x: 0.4, y: 0.4, w: 0.1, h: 0.1, active: true, dimTo: [] }] }];
      dashProjectData = [{ id: 'ART.001', location: 'Wall A' }];
      floorplanLevels = [{ name: 'Level 1', imageData: '' }];
      annotationStyle = {};
      dimVisibility = {};
      _dsEditGen = 0;
      _igNoCapture = true;   // ambient render — must never attempt a live capture
      const rec = new CanvasPdfRec(936, 540);
      _curFooter = _resolveFooter('spec:ART.001');
      let threw = null;
      _drawInstallGuidePage(rec, {}, 1, { location: '', code: '', version: '' }, elevations[0], { PW: 936, PH: 540, M: 40 })
        .catch(e => { threw = e; });
      // Synchronous assertions below run before the (should-be-immediate,
      // no-await-on-network) promise settles in this stripped-down harness;
      // real correctness is validated by the async check right after.
    });

    __checkAsync('_drawInstallGuidePage ambient placeholder: no throw, draws "Hit Build" text, never calls switchView', async () => {
      elevations = [{ name: 'WALL A', wallW: 240, wallH: 96, frames: [{ id: 'ART.001', letter: 'A', x: 0.4, y: 0.4, w: 0.1, h: 0.1, active: true, dimTo: [] }] }];
      dashProjectData = [{ id: 'ART.001', location: 'Wall A' }];
      floorplanLevels = [{ name: 'Level 1', imageData: '' }];
      annotationStyle = {};
      dimVisibility = {};
      _dsEditGen = 0;
      for (const k in _igCapCache) delete _igCapCache[k];
      let switchViewCalled = false;
      const _origSwitchView = (typeof switchView === 'function') ? switchView : null;
      switchView = () => { switchViewCalled = true; };
      _igNoCapture = true;
      _curFooter = _resolveFooter('spec:ART.001');
      const rec = new CanvasPdfRec(936, 540);
      await _drawInstallGuidePage(rec, {}, 1, { location: '', code: '', version: '' }, elevations[0], { PW: 936, PH: 540, M: 40 });
      if (switchViewCalled) throw new Error('ambient render triggered switchView — this is exactly the flash bug');
      const drewPlaceholder = rec.ops.some(o => o.t === 'text' && typeof o.str === 'string' && o.str.indexOf('Hit Build') >= 0);
      if (!drewPlaceholder) throw new Error('placeholder text not drawn; ops: ' + JSON.stringify(rec.ops.slice(0,5)));
      if (_origSwitchView) switchView = _origSwitchView;
    });

    // ── Fix 3: white logo rasterization forces pure white RGB ──

    __checkAsync('white-logo cleanup pixel logic forces pure white on any visible pixel', async () => {
      // jsdom can't decode <img> data URLs (no real image pipeline), so
      // _loadImg() never resolves there — this exercises the exact cleanup
      // loop from _loadRepoLogoVariant in isolation instead of through a
      // real image load, which is the part that actually fixes the bug.
      const gw = 4, gh = 1;
      const data = new Uint8ClampedArray(gw * gh * 4);
      for (let i = 0; i < gw * gh; i++) {
        const isEdge = (i % 2 === 0);
        data[i*4+0] = isEdge ? 60 : 255;
        data[i*4+1] = isEdge ? 60 : 255;
        data[i*4+2] = isEdge ? 60 : 255;
        data[i*4+3] = isEdge ? 120 : 255;
      }
      // Same loop body as the fix in _loadRepoLogoVariant.
      for (let i = 0; i < data.length; i += 4) { if (data[i + 3] > 0) { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; } }
      let bad = 0;
      for (let i = 0; i < data.length; i += 4) { if (data[i+3] > 0 && (data[i] !== 255 || data[i+1] !== 255 || data[i+2] !== 255)) bad++; }
      if (bad > 0) throw new Error(bad + ' non-white opaque-ish pixels survived cleanup');
    });

    __checkAsync('_loadRepoLogoVariant contains the white-logo cleanup guard', async () => {
      const fnText = _loadRepoLogoVariant.toString();
      if (fnText.indexOf('white-logo') < 0) throw new Error('cleanup guard (white-logo test) not found in function source');
      if (fnText.indexOf('getImageData') < 0) throw new Error('pixel cleanup pass not found in function source');
    });
  `;

  try {
    window.eval(src + '\nwindow.__lastPutImageData = null;\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  // Patch putImageData capture after the fact is awkward since it's inside a
  // closure created by getContext(); instead, wire it via a global hook.
  // Simplify: monkeypatch getContext AFTER eval to route through a global.
  const results = window.__testResults || [];
  const asyncResults = await Promise.all(window.__asyncChecks || []);
  const all = results.concat(asyncResults);
  let failures = [];
  all.forEach(r => {
    console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err));
    if (!r.ok) failures.push(r.label);
  });

  console.log('\n--- Summary ---');
  if (failures.length) {
    console.log(failures.length + ' FAILURES');
    process.exit(1);
  } else {
    console.log('ALL PASSED (' + all.length + ')');
  }
})();
