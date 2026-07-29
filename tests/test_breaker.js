const { JSDOM } = require('jsdom');
const fs = require('fs');

(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(require('path').join(__dirname,'..','index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){} });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => {
      try { fn(); window.__testResults.push({ label, ok: true }); }
      catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); }
    };
    window.__asyncChecks = [];
    const __checkAsync = (label, fn) => window.__asyncChecks.push(
      Promise.resolve().then(fn).then(() => ({ label, ok: true }))
        .catch(e => ({ label, ok: false, err: e.message }))
    );

    editorialContent = editorialContent || {};

    // ── 1. Config resolution: elevgrp: key stays elevation-only even when the
    //       global install-guide settings are fully spec'd out ──
    __check('_igCfg: elevgrp key ignores global install-guide chrome', () => {
      editorialContent.installGuide = { variant: 'elevPlan', legend: true, legendCols: 2, plan: 'zoom' };
      const b = _igCfg('elevgrp:g1');
      if (b.variant !== 'elevOnly') throw new Error('breaker variant leaked: ' + b.variant);
      if (b.legend !== false) throw new Error('breaker legend leaked: ' + b.legend);
      const i = _igCfg('ig:WALL A');
      if (i.variant !== 'elevPlan' || i.legend !== true) throw new Error('install page did not pick up globals: ' + JSON.stringify(i));
    });

    // ── 2. Source-level guard: the EXPORT breaker step now carries the
    //       elevgrp ovKey exactly like the preview desc does ──
    __check('export breaker step includes _ovKey elevgrp (source guard)', () => {
      const src2 = window.__appSrc;
      const lines = src2.split('\\n').filter(l => l.indexOf("type: 'install'") >= 0 && l.indexOf('_breakerCodeFor(u)') >= 0);
      if (!lines.length) throw new Error('export breaker step line not found');
      for (const l of lines) {
        if (l.indexOf("_ovKey: 'elevgrp:' + u.key") < 0) throw new Error('a breaker step line is missing the elevgrp ovKey: ' + l.trim().slice(0, 160));
      }
    });

    // ── 3. Behavioral: BEHAVIOUR CHANGED (v15.86). A breaker used to take a
    //       deliberately CLEAN capture — spacing/hangHeight/wallDims forced
    //       off — behind a "Show layout guides" opt-in. That made guides
    //       plainly visible in the Elevations tab silently vanish from the
    //       breaker page. The Elevations tab is now the sole source of truth:
    //       breaker and install-guide pages capture the elevation IDENTICALLY,
    //       with no guide overrides on either path. This check is inverted
    //       from its original form to assert that. ──
    __checkAsync('_drawInstallGuidePage: elevgrp and plain args both capture the elevation as-is, with no guide overrides', async () => {
      elevations = [{ name: 'WALL A', wallW: 240, wallH: 96, frames: [{ id: 'ART.001', letter: 'A', x: 0.4, y: 0.4, w: 0.1, h: 0.1, active: true, dimTo: [] }] }];
      dashProjectData = [{ id: 'ART.001', location: 'Wall A' }];
      floorplanLevels = [{ name: 'Level 1', imageData: '' }];
      annotationStyle = {}; dimVisibility = {}; _dsEditGen = 0;
      editorialContent.installGuide = { variant: 'elevPlan', legend: true };
      editorialContent.pageFooters = {};
      _igNoCapture = false;
      for (const k in _igCapCache) delete _igCapCache[k];
      const captureCalls = [];
      // Capture EVERY argument, so an override sneaking back in as a 2nd
      // (or later) parameter still fails this check.
      _captureElevWithGuides = async (...args) => { captureCalls.push(args); return { dataUrl: 'data:image/png;base64,AAAA', w: 800, h: 400 }; };

      // Breaker-style call: elev carries the elevgrp ovKey (as both the
      // preview desc and the export step build it).
      const brElev = Object.assign({}, elevations[0], { name: 'ART.001', _noPlan: false, _idx: 0, _ovKey: 'elevgrp:g1' });
      _curFooter = _resolveFooter('spec:elevgrp:g1');
      let rec = new CanvasPdfRec(936, 540);
      await _drawInstallGuidePage(rec, {}, 1, { location: '', code: '', version: '' }, brElev, { PW: 936, PH: 540, M: 40 });
      if (!captureCalls.length) throw new Error('breaker render never captured');
      const brCall = captureCalls[captureCalls.length - 1];
      if (brCall.length !== 1) throw new Error('the exact reported bug: breaker capture passed guide overrides, so it can disagree with the Elevations tab: ' + JSON.stringify(brCall.slice(1)));
      if (brCall[0] !== 0) throw new Error('breaker captured the wrong elevation index: ' + brCall[0]);

      // Plain install-guide call: same elevation, no elevgrp key. Must be
      // byte-for-byte the same capture request as the breaker's.
      const igElev = Object.assign({}, elevations[0], { _idx: 0 });
      _curFooter = _resolveFooter('spec:elev:0');
      rec = new CanvasPdfRec(936, 540);
      await _drawInstallGuidePage(rec, {}, 1, { location: '', code: '', version: '' }, igElev, { PW: 936, PH: 540, M: 40 });
      const igCall = captureCalls[captureCalls.length - 1];
      if (igCall.length !== 1) throw new Error('install-guide capture passed guide overrides: ' + JSON.stringify(igCall.slice(1)));
      if (JSON.stringify(brCall) !== JSON.stringify(igCall)) throw new Error('breaker and install-guide captures differ, so the two page types can disagree: ' + JSON.stringify(brCall) + ' vs ' + JSON.stringify(igCall));

      // ...and because the request is identical, the same elevation state must
      // reuse ONE cache entry rather than keeping clean-vs-guides variants.
      const keys = Object.keys(_igCapCache);
      if (keys.length !== 1) throw new Error('expected a single shared capture cache entry for one elevation state, got ' + keys.length + ': ' + JSON.stringify(keys));
    });
  `;

  try {
    window.__appSrc = src;
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const results = window.__testResults || [];
  const asyncResults = await Promise.all(window.__asyncChecks || []);
  const all = results.concat(asyncResults);
  let failures = [];
  all.forEach(r => {
    console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err));
    if (!r.ok) failures.push(r.label);
  });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
