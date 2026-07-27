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

    // ── 3. Behavioral: _drawInstallGuidePage takes a CLEAN capture (guides
    //       suppressed) for elevgrp pages, and a full-guides capture without ──
    __checkAsync('_drawInstallGuidePage: elevgrp arg -> clean capture; plain arg -> full-guides capture', async () => {
      elevations = [{ name: 'WALL A', wallW: 240, wallH: 96, frames: [{ id: 'ART.001', letter: 'A', x: 0.4, y: 0.4, w: 0.1, h: 0.1, active: true, dimTo: [] }] }];
      dashProjectData = [{ id: 'ART.001', location: 'Wall A' }];
      floorplanLevels = [{ name: 'Level 1', imageData: '' }];
      annotationStyle = {}; dimVisibility = {}; _dsEditGen = 0;
      editorialContent.installGuide = { variant: 'elevPlan', legend: true };
      editorialContent.pageFooters = {};
      _igNoCapture = false;
      for (const k in _igCapCache) delete _igCapCache[k];
      const captureCalls = [];
      _captureElevWithGuides = async (idx, mopts) => { captureCalls.push({ idx, mopts }); return { dataUrl: 'data:image/png;base64,AAAA', w: 800, h: 400 }; };

      // Breaker-style call: elev carries the elevgrp ovKey (as both the
      // preview desc and — after the fix — the export step build it).
      const brElev = Object.assign({}, elevations[0], { name: 'ART.001', _noPlan: false, _measure: false, _idx: 0, _ovKey: 'elevgrp:g1' });
      _curFooter = _resolveFooter('spec:elevgrp:g1');
      let rec = new CanvasPdfRec(936, 540);
      await _drawInstallGuidePage(rec, {}, 1, { location: '', code: '', version: '' }, brElev, { PW: 936, PH: 540, M: 40 });
      if (!captureCalls.length) throw new Error('breaker render never captured');
      const brCall = captureCalls[captureCalls.length - 1];
      if (!brCall.mopts || brCall.mopts.spacing !== false || brCall.mopts.hangHeight !== false || brCall.mopts.wallDims !== false) {
        throw new Error('breaker capture was NOT clean (guides not suppressed): ' + JSON.stringify(brCall.mopts));
      }

      // Plain install-guide call: same elevation, no elevgrp key.
      for (const k in _igCapCache) delete _igCapCache[k];
      const igElev = Object.assign({}, elevations[0], { _idx: 0 });
      _curFooter = _resolveFooter('spec:elev:0');
      rec = new CanvasPdfRec(936, 540);
      await _drawInstallGuidePage(rec, {}, 1, { location: '', code: '', version: '' }, igElev, { PW: 936, PH: 540, M: 40 });
      const igCall = captureCalls[captureCalls.length - 1];
      if (igCall.mopts !== undefined) throw new Error('install-guide capture unexpectedly suppressed guides: ' + JSON.stringify(igCall.mopts));
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
