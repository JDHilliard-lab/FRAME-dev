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
  window.HTMLCanvasElement.prototype.getContext = () => ({
    scale(){}, fillRect(){}, drawImage(){}, measureText: (s) => ({ width: (s||'').length * 6 }),
    fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){},
    setLineDash(){}, getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData(){}, translate(){}, rotate(){},
    fillText(){}, strokeText(){}, clip(){}, rect(){}, quadraticCurveTo(){}, bezierCurveTo(){}, setTransform(){}, transform(){}
  });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  // Test checks run appended to the SAME eval as app.js — top-level let/const
  // bindings (editorialContent, floorplanLevels, etc.) are scoped per-eval-call
  // in V8, so a second window.eval() can't see them. This block collects
  // pass/fail into window.__testResults for the harness below to read out.
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => {
      try { fn(); window.__testResults.push({ label, ok: true }); }
      catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); }
    };

    floorplanLevels = [{ name: 'Level 1', imageData: '', imageName: '' }];
    editorialContent = editorialContent || {};
    editorialContent.pageFooters = {};
    editorialContent.footer = {};

    __check('_fpKeyEntries(0, null)', () => {
      const out = _fpKeyEntries(0, null);
      if (!Array.isArray(out)) throw new Error('not array');
    });

    __check('_fpPlanRect', () => {
      const r = _fpPlanRect(936, 540, 40);
      if (!(r.w > 0 && r.h > 0)) throw new Error('bad rect');
    });

    __check('_fpPlanFit', () => {
      const f = _fpPlanFit(936, 540, 40, 800, 600);
      if (!(f.dw > 0 && f.dh > 0)) throw new Error('bad fit');
    });

    __check('_resolveFooter hideFooter default false', () => {
      const F = _resolveFooter('floorplan:0');
      if (F.hideFooter !== false) throw new Error('unexpected default: ' + F.hideFooter);
    });

    __check('_resolveFooter hideFooter override', () => {
      editorialContent.pageFooters['floorplan:0'] = { hideFooter: true };
      const F = _resolveFooter('floorplan:0');
      if (F.hideFooter !== true) throw new Error('override not applied: ' + JSON.stringify(F));
      delete editorialContent.pageFooters['floorplan:0'];
    });

    __check('_dsAddFooter runs and adds a footer node', () => {
      const page = document.createElement('div');
      document.body.appendChild(page);
      const desc = { kind: 'floorplan', level: 0 };
      _dsIndex = 0;
      _dsAddFooter(page, 936, 540, desc);
      if (!page.querySelector('[data-ds-footer]')) throw new Error('footer node missing');
    });

    __check('_dsAddFooter respects hideFooter override', () => {
      const page = document.createElement('div');
      document.body.appendChild(page);
      const desc = { kind: 'floorplan', level: 0 };
      editorialContent.pageFooters['floorplan:0'] = { hideFooter: true };
      _dsIndex = 0;
      _dsAddFooter(page, 936, 540, desc);
      if (page.querySelector('[data-ds-footer]')) throw new Error('footer should be hidden');
      delete editorialContent.pageFooters['floorplan:0'];
    });

    __check('_dsAddFooter is idempotent (no double footer)', () => {
      const page = document.createElement('div');
      document.body.appendChild(page);
      const desc = { kind: 'floorplan', level: 0 };
      _dsIndex = 0;
      _dsAddFooter(page, 936, 540, desc);
      _dsAddFooter(page, 936, 540, desc);
      if (page.querySelectorAll('[data-ds-footer]').length !== 1) throw new Error('footer duplicated');
    });

    __check('_drawFloorplanKeyPage with CanvasPdfRec, no image', () => {
      const rec = new CanvasPdfRec(936, 540);
      _drawFloorplanKeyPage(rec, {}, 1, { location: '', code: '', version: '' }, [], null, 'Level 1');
      if (!rec.ops || !rec.ops.length) throw new Error('no ops recorded');
    });

    __check('_drawFloorplanKeyPage footer honors hideFooter', () => {
      editorialContent.pageFooters['floorplan:0'] = { hideFooter: true };
      _curFooter = _resolveFooter('floorplan:0');
      const rec = new CanvasPdfRec(936, 540);
      _drawFloorplanKeyPage(rec, {}, 1, { location: '', code: '', version: '' }, [], null, 'Level 1');
      const hasFooterText = rec.ops.some(o => o.t === 'text' && typeof o.str === 'string' && o.str.indexOf('Copyright') >= 0);
      if (hasFooterText) throw new Error('footer text printed despite hideFooter');
      delete editorialContent.pageFooters['floorplan:0'];
      _curFooter = { text: 'dark', leftTheme: 'dark' };
    });

    __check('_drawFloorplanKeyPage prints footer normally', () => {
      _curFooter = _resolveFooter('floorplan:0');
      const rec = new CanvasPdfRec(936, 540);
      _drawFloorplanKeyPage(rec, {}, 1, { location: '', code: '', version: '' }, [], null, 'Level 1');
      const hasFooterText = rec.ops.some(o => o.t === 'text' && typeof o.str === 'string' && o.str.indexOf('Copyright') >= 0);
      if (!hasFooterText) throw new Error('footer text missing');
    });

    __check('_fpPlanRect matches studio center math at S=1', () => {
      const r1 = _fpPlanRect(936, 540, 40);
      const r2 = _fpPlanRect(936, 540, 40);
      if (r1.x !== r2.x || r1.w !== r2.w) throw new Error('non-deterministic rect');
    });

    window.__asyncChecks = [];
    const __checkAsync = (label, fn) => window.__asyncChecks.push(
      Promise.resolve().then(fn).then(() => ({ label, ok: true }))
        .catch(e => ({ label, ok: false, err: e.message }))
    );

    __checkAsync('renderDeckPageCanvas floorplan (no image)', async () => {
      const desc = { kind: 'floorplan', level: 0, title: 'Level 1' };
      _dsPages = [desc]; _dsIndex = 0;
      const cv = await renderDeckPageCanvas(desc, null, { fpNoPins: true });
      if (!cv || !cv.toDataURL) throw new Error('no canvas returned');
    });

    __checkAsync('_dsRenderCenterFloorplan renders without throwing (no image)', async () => {
      const c = document.createElement('div');
      c.clientWidth = 900; c.clientHeight = 540;
      document.body.appendChild(c);
      const desc = { kind: 'floorplan', level: 0, title: 'Level 1' };
      _dsPages = [desc]; _dsIndex = 0;
      _dsRenderCenterFloorplan(desc, c, 900, 520);
      await new Promise(r => setTimeout(r, 50));
      if (!c.querySelector('div')) throw new Error('nothing rendered');
    });

    __checkAsync('_drawCoverPage draws footer without throwing', async () => {
      const rec = new CanvasPdfRec(936, 540);
      _drawCoverPage(rec, {}, 1, { location: '', code: '', version: '' });
      if (!rec.ops || !rec.ops.length) throw new Error('no ops recorded');
    });
  `;

  try {
    window.eval(src + '\n' + testBlock);
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
  if (failures.length) {
    console.log(failures.length + ' FAILURES');
    process.exit(1);
  } else {
    console.log('ALL PASSED (' + all.length + ')');
  }
})();
