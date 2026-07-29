// Dimensions on elevation breaker pages.
//
// BEHAVIOUR CHANGED (v15.86). This file originally asserted the opposite of
// what it asserts now, so the history matters:
//
//   1. Breakers unconditionally stripped spacing/hangHeight/wallDims from the
//      capture, to guarantee a "clean" section divider.
//   2. That was softened to an opt-in: a "Show layout guides" checkbox
//      (_breakerMeasure) chose between clean and editor-accurate. The checks
//      here pinned that flag, the `_bkGuides` variable, and the clean/guides
//      cache-key split.
//   3. Reported bug: wall dimensions (185"/108") were visibly ON in the
//      Elevations tab but absent from the breaker page — because the opt-in
//      defaulted off. Same for the hang-height/AFF line. Any mode where the
//      breaker can disagree with the editor is the bug, not a feature.
//
// So the split is gone entirely: one capture path, no guide overrides, and the
// Elevations tab is the only place that decides what a wall shows. These checks
// are the inverted form of the originals — they now fail if any mechanism for
// a breaker to diverge from the editor comes back. They are behavioural (they
// drive a real render) rather than source-string matches like the originals.
const { JSDOM } = require('jsdom');
const fs = require('fs');

(async () => {
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
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
    let __chain = Promise.resolve();
    const __checkAsync = (label, fn) => {
      const p = __chain.then(fn).then(() => ({ label, ok: true })).catch(e => ({ label, ok: false, err: e.message }));
      __chain = p.then(() => {});
      window.__asyncChecks.push(p);
    };

    editorialContent = editorialContent || {};

    const __setupElev = () => {
      elevations = [{ name: 'WALL A', wallW: 185, wallH: 108, frames: [{ id: 'ART.001', letter: 'A', x: 0.4, y: 0.4, w: 0.1, h: 0.1, active: true, dimTo: [] }] }];
      dashProjectData = [{ id: 'ART.001', location: 'Wall A' }];
      floorplanLevels = [{ name: 'Level 1', imageData: '' }];
      annotationStyle = {}; _dsEditGen = 0;
      editorialContent.installGuide = {};
      editorialContent.pageFooters = {};
      _igNoCapture = false;
      for (const k in _igCapCache) delete _igCapCache[k];
    };
    // Render a breaker page and report the argument list its capture received.
    const __renderBreaker = async () => {
      const calls = [];
      _captureElevWithGuides = async (...args) => { calls.push(args); return { dataUrl: 'data:image/png;base64,AAAA', w: 800, h: 400 }; };
      const brElev = Object.assign({}, elevations[0], { name: 'ART.001', _noPlan: false, _idx: 0, _ovKey: 'elevgrp:g1' });
      _curFooter = _resolveFooter('spec:elevgrp:g1');
      const rec = new CanvasPdfRec(936, 540);
      await _drawInstallGuidePage(rec, {}, 1, { location: '', code: '', version: '' }, brElev, { PW: 936, PH: 540, M: 40 });
      if (!calls.length) throw new Error('breaker render never captured an elevation');
      return calls[calls.length - 1];
    };

    // ── The reported bug, directly: wall dims ON in the editor must reach the
    //    breaker. Previously the capture forced wallDims:false regardless. ──
    __checkAsync('EXACT BUG: with wall dims ON in the Elevations tab, a breaker capture does NOT strip them', async () => {
      __setupElev();
      dimVisibility = { wallDims: true, spacing: true, groupBox: true, edgeGap: true, imageCode: true, customLines: true };
      const call = await __renderBreaker();
      const overrides = call.slice(1);
      if (overrides.length) throw new Error('the exact reported bug: breaker capture received guide overrides ' + JSON.stringify(overrides) + ' — wall dims/hang height can vanish even though they are on in the editor');
    });

    __checkAsync('the hang-height/AFF line is likewise never force-hidden for a breaker', async () => {
      __setupElev();
      dimVisibility = { wallDims: true };
      const call = await __renderBreaker();
      const o = call.slice(1).find(a => a && typeof a === 'object' && 'hangHeight' in a);
      if (o) throw new Error('a hangHeight override reached the capture: ' + JSON.stringify(o));
    });

    __checkAsync('turning wall dims OFF in the Elevations tab is equally respected — the breaker still just mirrors, it does not re-add them', async () => {
      __setupElev();
      dimVisibility = { wallDims: false };
      const call = await __renderBreaker();
      if (call.slice(1).length) throw new Error('breaker capture overrode the editor state instead of mirroring it: ' + JSON.stringify(call.slice(1)));
    });

    // ── The capture API itself must offer no way to diverge ──
    __check('_captureElevWithGuides accepts an elevation index only, so no caller can override guide visibility', () => {
      if (typeof _captureElevWithGuides !== 'function') throw new Error('_captureElevWithGuides is missing');
      if (_captureElevWithGuides.length !== 1) throw new Error('expected arity 1 (elevIdx); got ' + _captureElevWithGuides.length + ' — a guide-override parameter is back');
    });

    __check('the retired _breakerMeasure opt-in is gone, while the genuine breaker layout options remain', () => {
      if (typeof _breakerMeasure !== 'undefined') throw new Error('_breakerMeasure is back — the clean-vs-guides split is reachable again');
      if (typeof _elevBreakers !== 'function') throw new Error('_elevBreakers (Add elevation breaker page) was removed by mistake');
      if (typeof _breakerNoPlan !== 'function') throw new Error('_breakerNoPlan (Elevation only) was removed by mistake');
    });

    __check('_igCfg exposes no per-page measure config for a breaker to disagree through', () => {
      editorialContent.installGuide = { variant: 'elevPlan', legend: true, measure: { wallDims: false } };
      const b = _igCfg('elevgrp:g1');
      if ('measure' in b) throw new Error('breaker cfg still carries a measure block: ' + JSON.stringify(b.measure));
      const i = _igCfg('ig:WALL A');
      if ('measure' in i) throw new Error('install-guide cfg still carries a measure block: ' + JSON.stringify(i.measure));
      // Its real layout settings must still resolve normally.
      if (i.variant !== 'elevPlan') throw new Error('install-guide variant broke: ' + i.variant);
      if (b.variant !== 'elevOnly') throw new Error('breaker should stay elevation-only: ' + b.variant);
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
