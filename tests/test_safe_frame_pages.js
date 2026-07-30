// Every spec-family page must draw inside the safety guides.
//
// Reported: on spec pages, breaker pages, elevations, Group A/B/C pages and
// install guides, elements ran past the purple frame — the title straddled the
// top guide, the artwork/frame block passed the right guide, and the floorplan
// and elevation thumbnails (plus their captions) dropped below the bottom guide.
//
// Cause: only two renderers consulted the guide set at all, and even those only
// partly. The rest used a flat `const M = 40` plus values like PH-34, PH*0.92 or
// PH-M-14, all of which sit outside the default 12-column frame
// (t 5% / b 10% / l,r 2.34% of 936x540 => L 21.9, T 27, R 914.1, B 486).
//
// These checks record ops through CanvasPdfRec and assert containment, so a
// renderer that reintroduces a hardcoded margin fails here rather than in a PDF
// someone has already sent to a client.
const { JSDOM } = require('jsdom');
const fs = require('fs');

(async () => {
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}), createRadialGradient:()=>({addColorStop(){}}), createPattern:()=>null, quadraticCurveTo(){}, bezierCurveTo(){}, ellipse(){}, arcTo(){}, setTransform(){}, transform(){}, strokeRect(){}, clearRect(){} });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __checkAsync = (label, fn) => {
      const p = __chain.then(fn).then(() => ({ label, ok: true })).catch(e => ({ label, ok: false, err: e.message }));
      __chain = p.then(() => {});
      window.__asyncChecks.push(p);
    };

    editorialContent = editorialContent || {};
    scheduleAutosave = () => {};
    const PW = 936, PH = 540;
    const CTX = { PW: PW, PH: PH, M: 40 };
    const useDefaultGuides = () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: false, snapMode: 'guides' };
      editorialContent.pageGuides = {};
      _curPageKey = null;
    };
    const ROW = () => ({ id: 'ART.001', location: 'LOBBY', product: 'Framed Art', w: 20, h: 10,
                         fW: 1.25, fD: 1.125, extW: 22, extH: 12, fType: 'color', fColor: '#333333',
                         imageCode: 'WIKI.Some_Long_Image_Code_Here' });

    // Image ops carry [x, y, w, h]; text ops carry a baseline (x, y). Both are
    // checked, with a small tolerance for stroke widths and glyph overshoot.
    const TOL = 1.5;
    // The footer is a deliberate exception: page number, project line, copyright
    // and the Farmboy logo all sit BELOW the bottom guide by design (baseline
    // PH-20, logo band PH-27..PH-16). Excluded by POSITION rather than by matching
    // their text, so the gap between the bottom guide (486) and the footer band
    // (510) is still policed — that is exactly where the overflowing thumbnails
    // and captions were landing.
    const FOOTER_TOP = PH - 30;
    const bounds = (rec) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const seen = [];
      rec.ops.forEach(o => {
        if (o.t === 'img' && Array.isArray(o.a)) {
          if (o.a[1] >= FOOTER_TOP) return;          // footer logo
          minX = Math.min(minX, o.a[0]); minY = Math.min(minY, o.a[1]);
          maxX = Math.max(maxX, o.a[0] + o.a[2]); maxY = Math.max(maxY, o.a[1] + o.a[3]);
          seen.push('img@' + o.a.map(v => Math.round(v)).join(','));
        }
      });
      return { minX, minY, maxX, maxY, seen };
    };
    const textBaselines = (rec) => rec.ops.filter(o =>
      o.t === 'text' && typeof o.str === 'string' && o.str.trim() && o.y < FOOTER_TOP);

    const assertInside = (rec, label) => {
      const SR = _safeFrameRect(PW, PH);
      const b = bounds(rec);
      if (isFinite(b.minX)) {
        if (b.minX < SR.L - TOL) throw new Error(label + ': an image starts at x ' + b.minX.toFixed(1) + ', left guide is ' + SR.L.toFixed(1));
        if (b.maxX > SR.R + TOL) throw new Error(label + ': an image reaches x ' + b.maxX.toFixed(1) + ', right guide is ' + SR.R.toFixed(1));
        if (b.minY < SR.T - TOL) throw new Error(label + ': an image starts at y ' + b.minY.toFixed(1) + ', top guide is ' + SR.T.toFixed(1));
        if (b.maxY > SR.B + TOL) throw new Error(label + ': an image reaches y ' + b.maxY.toFixed(1) + ', bottom guide is ' + SR.B.toFixed(1) + ' (' + b.seen.join(' ') + ')');
      }
      textBaselines(rec).forEach(o => {
        if (o.y > SR.B + TOL) throw new Error(label + ': text "' + o.str.slice(0, 28) + '" has a baseline at y ' + o.y.toFixed(1) + ', below the bottom guide ' + SR.B.toFixed(1));
        if (o.x < SR.L - TOL) throw new Error(label + ': text "' + o.str.slice(0, 28) + '" starts at x ' + o.x.toFixed(1) + ', left of the guide ' + SR.L.toFixed(1));
      });
    };

    // ── The shared helpers ──
    __check('_safeFrameRect resolves the default guide set to points', () => {
      useDefaultGuides();
      const SR = _safeFrameRect(PW, PH);
      if (!SR.fromGuides) throw new Error('did not resolve from the guide set');
      if (Math.abs(SR.L - 0.0234 * PW) > 1e-6) throw new Error('L ' + SR.L);
      if (Math.abs(SR.T - 0.05 * PH) > 1e-6) throw new Error('T ' + SR.T);
      if (Math.abs(SR.R - (1 - 0.0234) * PW) > 1e-6) throw new Error('R ' + SR.R);
      if (Math.abs(SR.B - (1 - 0.10) * PH) > 1e-6) throw new Error('B ' + SR.B);
    });

    __check('_safeFrameRect falls back to the historical 40pt inset for a marginless set', () => {
      editorialContent.guidePref = { setId: 'g_center', show: false };   // no margins
      const SR = _safeFrameRect(PW, PH);
      if (SR.fromGuides) throw new Error('should not claim to come from guides');
      if (SR.L !== 40 || SR.T !== 40 || SR.R !== PW - 40 || SR.B !== PH - 40) throw new Error('unexpected fallback: ' + JSON.stringify(SR));
      useDefaultGuides();
    });

    __check('_fitIn contains an aspect inside a box, limited by whichever side binds', () => {
      let [w, h] = _fitIn(2, 100, 100);        // wide: width binds
      if (Math.abs(w - 100) > 1e-9 || Math.abs(h - 50) > 1e-9) throw new Error('wide: ' + w + 'x' + h);
      [w, h] = _fitIn(0.5, 100, 100);          // tall: height binds
      if (Math.abs(h - 100) > 1e-9 || Math.abs(w - 50) > 1e-9) throw new Error('tall: ' + w + 'x' + h);
      if (w > 100 + 1e-9 || h > 100 + 1e-9) throw new Error('overflowed the box');
    });

    // ── Per page type ──
    __checkAsync('EXACT BUG: a template spec page keeps its artwork, thumbnails and captions inside the guides', async () => {
      useDefaultGuides();
      elevations = []; dashProjectData = [];
      _curPageKey = 'spec:ART.001';
      const rec = new CanvasPdfRec(PW, PH);
      _curFooter = _resolveFooter('spec:ART.001');
      await _drawSpecPageTemplate(rec, {}, 1, { location: '', code: '', version: '' }, ROW(), 'frameSpecDetail', CTX);
      assertInside(rec, 'template spec page');
      _curPageKey = null;
    });

    __checkAsync('a template spec page title sits BELOW the top guide, not straddling it', async () => {
      useDefaultGuides();
      elevations = []; dashProjectData = [];
      _curPageKey = 'spec:ART.001';
      const rec = new CanvasPdfRec(PW, PH);
      _curFooter = _resolveFooter('spec:ART.001');
      await _drawSpecPageTemplate(rec, {}, 1, { location: '', code: '', version: '' }, ROW(), 'frameSpecDetail', CTX);
      const SR = _safeFrameRect(PW, PH);
      const titleOp = rec.ops.find(o => o.t === 'text' && typeof o.str === 'string' && o.str.indexOf('ART.001') >= 0);
      if (!titleOp) throw new Error('title op not found');
      // title.y is a BASELINE and was the topmost thing in the design envelope, so
      // the remap put it exactly ON the top guide and every cap sat above it.
      if (titleOp.y < SR.T + 6) throw new Error('title baseline ' + titleOp.y.toFixed(1) + ' is too close to the top guide ' + SR.T.toFixed(1) + ' — its ascenders would sit outside the frame');
      _curPageKey = null;
    });

    __checkAsync('EXACT BUG: a Group A/B/C page stays inside the guides (its region used to reach 0.92 of the page)', async () => {
      useDefaultGuides();
      elevations = []; dashProjectData = [];
      const members = [ROW(), Object.assign(ROW(), { id: 'ART.002' }), Object.assign(ROW(), { id: 'ART.003' })];
      const unit = { key: 'ART-2.1ABC', rep: members[0], members: members };
      _curPageKey = 'specset:ART-2.1ABC';
      const rec = new CanvasPdfRec(PW, PH);
      _curFooter = _resolveFooter('specset:ART-2.1ABC');
      await _drawSpecSetPage(rec, {}, 1, { location: '', code: '', version: '' }, unit, 'setRight', CTX);
      assertInside(rec, 'Group A/B/C page');
      _curPageKey = null;
    });

    __checkAsync('the shared-spec Group A/B/C page stays inside the guides too', async () => {
      useDefaultGuides();
      elevations = []; dashProjectData = [];
      const members = [ROW(), Object.assign(ROW(), { id: 'ART.002', extW: 40, extH: 30 }), Object.assign(ROW(), { id: 'ART.003' })];
      const unit = { key: 'ART-2.1ABC', rep: members[0], members: members };
      _curPageKey = 'specset:ART-2.1ABC';
      const rec = new CanvasPdfRec(PW, PH);
      _curFooter = _resolveFooter('specset:ART-2.1ABC');
      await _drawSpecSetPage(rec, {}, 1, { location: '', code: '', version: '' }, unit, 'setLegend', CTX);
      assertInside(rec, 'shared-spec Group A/B/C page');
      _curPageKey = null;
    });

    __checkAsync('a Group A/B/C page title clears the top guide', async () => {
      useDefaultGuides();
      elevations = []; dashProjectData = [];
      const members = [ROW()];
      const unit = { key: 'ART-2.1A', rep: members[0], members: members };
      const rec = new CanvasPdfRec(PW, PH);
      _curFooter = _resolveFooter('specset:ART-2.1A');
      await _drawSpecSetPage(rec, {}, 1, { location: '', code: '', version: '' }, unit, 'setRight', CTX);
      const SR = _safeFrameRect(PW, PH);
      const t = rec.ops.find(o => o.t === 'text' && typeof o.str === 'string' && o.str.indexOf('ART-2.1A') >= 0);
      if (!t) throw new Error('group title not found');
      if (t.y < SR.T + 6) throw new Error('group title baseline ' + t.y.toFixed(1) + ' too close to the top guide ' + SR.T.toFixed(1));
      if (Math.abs(t.x - SR.L) > 1) throw new Error('group title x ' + t.x.toFixed(1) + ' is not on the left guide ' + SR.L.toFixed(1));
    });

    __checkAsync('EXACT BUG: an install guide / breaker page no longer draws to PH-34, past the bottom guide', async () => {
      useDefaultGuides();
      elevations = [{ name: 'WALL A', wallW: 185, wallH: 108, frames: [{ id: 'ART.001', letter: 'A', x: 20, y: 40, w: 22, h: 12, active: true, dimTo: [] }] }];
      dashProjectData = [ROW()];
      floorplanLevels = [{ name: 'Level 1', imageData: '' }];
      annotationStyle = {}; dimVisibility = {}; _dsEditGen = 0;
      _igNoCapture = true;                 // no live capture in a test
      for (const k in _igCapCache) delete _igCapCache[k];
      const brElev = Object.assign({}, elevations[0], { name: 'ART-2.1ABCD', _noPlan: false, _idx: 0, _ovKey: 'elevgrp:g1' });
      _curPageKey = 'spec:elevgrp:g1';
      const rec = new CanvasPdfRec(PW, PH);
      _curFooter = _resolveFooter('spec:elevgrp:g1');
      await _drawInstallGuidePage(rec, {}, 1, { location: '', code: '', version: '' }, brElev, CTX);
      assertInside(rec, 'install guide / breaker page');
      _curPageKey = null;
    });

    __checkAsync('an install guide page title block clears the top guide and hugs the left one', async () => {
      useDefaultGuides();
      elevations = [{ name: 'WALL A', wallW: 185, wallH: 108, frames: [{ id: 'ART.001', letter: 'A', x: 20, y: 40, w: 22, h: 12, active: true, dimTo: [] }] }];
      dashProjectData = [ROW()];
      _igNoCapture = true;
      const rec = new CanvasPdfRec(PW, PH);
      _curFooter = _resolveFooter('spec:elev:0');
      await _drawInstallGuidePage(rec, {}, 1, { location: '', code: '', version: '' }, Object.assign({}, elevations[0], { _idx: 0 }), CTX);
      const SR = _safeFrameRect(PW, PH);
      const t = rec.ops.find(o => o.t === 'text' && o.str === 'ELEVATION DETAIL');
      if (!t) throw new Error('"ELEVATION DETAIL" not drawn');
      if (Math.abs(t.x - SR.L) > 1) throw new Error('title block x ' + t.x.toFixed(1) + ' is not on the left guide ' + SR.L.toFixed(1) + ' (it used to be a flat 40pt)');
      if (t.y < SR.T) throw new Error('title block baseline is above the top guide');
    });

    __checkAsync('a classic spec page stays inside the guides too', async () => {
      useDefaultGuides();
      elevations = []; dashProjectData = [ROW()];
      _curPageKey = 'spec:ART.001';
      const rec = new CanvasPdfRec(PW, PH);
      _curFooter = _resolveFooter('spec:ART.001');
      await _drawClassicSpecPage(rec, {}, 1, { location: '', code: '', version: '' }, ROW(), CTX);
      assertInside(rec, 'classic spec page');
      _curPageKey = null;
    });

    // ── Guard against the pattern coming back ──
    __check('the spec-family renderers no longer hardcode their own page margins', () => {
      const S = window.__appSrc;
      // _drawSpecSetPage is now a thin wrapper that guarantees the footer (see
      // test_group_footer_breaker.js); the layout code it used to hold moved to
      // _drawSpecSetPageBody, so that's the function to slice here.
      const fns = ['_drawSpecPageTemplate', '_drawSpecSetPageBody', '_drawInstallGuidePage', '_drawClassicSpecPage'];
      fns.forEach(fn => {
        const i = S.indexOf('async function ' + fn);
        if (i < 0) throw new Error(fn + ' not found');
        // Bound the slice at the next top-level async function.
        const next = S.indexOf('\\nasync function ', i + 10);
        const body = S.slice(i, next > 0 ? next : i + 40000);
        if (body.indexOf('_safeFrameRect') < 0) throw new Error(fn + ' does not resolve the safety frame');
        if (/PH - 34/.test(body)) throw new Error(fn + ' still draws to PH-34, which is below the bottom guide');
        if (/PH \* 0\.9[2-9]/.test(body)) throw new Error(fn + ' still uses a bottom fraction past 0.92 of the page');
      });
    });

    __check('the footer is deliberately NOT clamped — it belongs below the bottom guide', () => {
      const S = window.__appSrc;
      const i = S.indexOf('function _drawPdfFooter');
      const body = S.slice(i, i + 1400);
      if (body.indexOf('_layoutSafeFrame') < 0) throw new Error('the footer should still resolve the frame for its x inset');
      if (body.indexOf('PH - 20') < 0) throw new Error('the footer baseline moved; it is meant to sit below the bottom guide by design');
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
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
