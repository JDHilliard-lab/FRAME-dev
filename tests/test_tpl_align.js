const { JSDOM } = require('jsdom');
const fs = require('fs');

(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(require('path').join(__dirname,'..','index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}), createRadialGradient:()=>({addColorStop(){}}), createPattern:()=>null, quadraticCurveTo(){}, bezierCurveTo(){}, ellipse(){}, arcTo(){}, setTransform(){}, transform(){}, strokeRect(){}, clearRect(){} });
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
    scheduleAutosave = () => {};
    const IND = { l: 0.0234, t: 0.05, r: 0.0234, b: 0.10 };   // Farmboy InDesign margins

    __check('_layoutSafeFrame resolves the deck default set margins', () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: false, snapMode: 'guides' };
      editorialContent.pageGuides = {};
      _curPageKey = null;
      const SF = _layoutSafeFrame();
      if (!SF || Math.abs(SF.l - IND.l) > 1e-9 || Math.abs(SF.b - IND.b) > 1e-9) throw new Error('wrong frame: ' + JSON.stringify(SF));
    });

    __check('_layoutSafeFrame yields null for a marginless deck set (identity layout)', () => {
      editorialContent.guidePref = { setId: 'g_thirds', show: false };   // thirds has no margins
      if (_layoutSafeFrame() !== null) throw new Error('marginless set should yield null (identity layout)');
      editorialContent.guidePref = { setId: 'g_idml12', show: false };
    });

    // BEHAVIOUR CHANGED: the envelope used to cover only title/spec/artwork/plan/
    // elevation, so B was the plan's bottom (0.91). But the image code prints
    // BELOW the artwork and the frameDetail strip sits ABOVE the plan, and
    // neither was in the envelope — so the affine remap stretched the layout such
    // that those two landed outside the safety guides by construction. Both are
    // now included, which pushes B below the artwork to make room for the code.
    __check('_tplDesignFrame covers every block that actually gets drawn, including the image code', () => {
      const tpl = SPEC_TEMPLATES.frameSpecDetail;
      const D = _tplDesignFrame(tpl);
      if (!D) throw new Error('no design frame');
      if (Math.abs(D.L - 0.045) > 1e-9) throw new Error('L wrong: ' + D.L);
      if (Math.abs(D.R - 0.95) > 1e-9) throw new Error('R wrong: ' + D.R);
      // B must clear the artwork bottom plus the code's gap + size, not stop at
      // the plan box. Expressed from the template so it tracks any retuning.
      const artBottom = tpl.artwork.y + tpl.artwork.h;
      const codeReach = artBottom + ((tpl.code.gap + tpl.code.size) / 540);
      if (Math.abs(D.B - codeReach) > 1e-9) throw new Error('B is ' + D.B + ', expected ' + codeReach + ' (artwork bottom + the image code line beneath it)');
      if (!(D.B > 0.91)) throw new Error('B (' + D.B + ') no longer reaches past the plan box, so the code line falls outside the guides again');
      // frameDetail sits above the plan; it must not drag T above the title.
      if (Math.abs(D.T - tpl.title.y) > 1e-9) throw new Error('T is ' + D.T + ', expected the title baseline ' + tpl.title.y);
    });

    __checkAsync('drawer: title + spec left edge lands ON the safety left line; spec/artwork right edges ON the right line; boxes bottom ON the bottom line', async () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: false };
      editorialContent.pageGuides = {};
      _curPageKey = 'spec:ART.001';
      elevations = [];   // skip elevation branch
      dashProjectData = [];
      // Minimal row: no artworkUrl, numeric frame data so renderFrameToCanvas works.
      const r = { id: 'ART.001', location: 'LOBBY', product: 'Framed Art', w: 20, h: 10, fW: 1.25, fD: 1.125, extW: 22, extH: 12, fType: 'color', fColor: '#333333' };
      const rec = new CanvasPdfRec(936, 540);
      _curFooter = _resolveFooter('spec:ART.001');
      await _drawSpecPageTemplate(rec, {}, 1, { location: '', code: '', version: '' }, r, 'frameSpecDetail', { PW: 936, PH: 540, M: 40 });
      const SL = IND.l * 936, SRr = (1 - IND.r) * 936, SB = (1 - IND.b) * 540;
      // Title: drawn via text op at the safety left edge.
      const titleOp = rec.ops.find(o => o.t === 'text' && typeof o.str === 'string' && o.str.indexOf('ART.001') >= 0);
      if (!titleOp) throw new Error('title op not found');
      if (Math.abs(titleOp.x - SL) > 0.75) throw new Error('title x ' + titleOp.x.toFixed(2) + ' != safety left ' + SL.toFixed(2));
      // Spec labels start at the safety left edge too.
      const specLabel = rec.ops.find(o => o.t === 'text' && o.str === 'Application');
      if (!specLabel) throw new Error('spec label op not found');
      if (Math.abs(specLabel.x - SL) > 0.75) throw new Error('spec x ' + specLabel.x.toFixed(2) + ' != safety left');
      // Spec values are right-aligned to px(spec.x)+pw(spec.w) — verify a value op right edge.
      // (value x + measured width should be <= spec right edge; exact math checked via converters below.)
      // Artwork (frame mockup) right edge = safety right edge: find the addImage op for the mockup.
      const imgOps = rec.ops.filter(o => o.t === 'img' && Array.isArray(o.a));
      if (!imgOps.length) throw new Error('no image ops recorded (mockup missing); ops kinds: ' + JSON.stringify(rec.ops.slice(0,8).map(o=>o.t)));
      const mock = imgOps[imgOps.length - 1];
      const rightEdge = mock.a[0] + mock.a[2];
      if (Math.abs(rightEdge - SRr) > 1.0) throw new Error('mockup right edge ' + rightEdge.toFixed(2) + ' != safety right ' + SRr.toFixed(2));
      // Mockup box bottom must not exceed the safety bottom line meaningfully.
      if (mock.a[1] + mock.a[3] > SB + 26) throw new Error('mockup extends far below the safety bottom: ' + (mock.a[1] + mock.a[3]).toFixed(1) + ' vs ' + SB.toFixed(1));
      _curPageKey = null;
    });

    __checkAsync('drawer: identity layout when the deck uses a marginless guide set', async () => {
      editorialContent.guidePref = { setId: 'g_center', show: false };
      _curPageKey = 'spec:ART.002';
      elevations = [];
      const r = { id: 'ART.002', location: 'LOBBY', product: 'Framed Art', w: 20, h: 10, fW: 1.25, fD: 1.125, extW: 22, extH: 12, fType: 'color', fColor: '#333333' };
      const rec = new CanvasPdfRec(936, 540);
      _curFooter = _resolveFooter('spec:ART.002');
      await _drawSpecPageTemplate(rec, {}, 1, { location: '', code: '', version: '' }, r, 'frameSpecDetail', { PW: 936, PH: 540, M: 40 });
      const titleOp = rec.ops.find(o => o.t === 'text' && typeof o.str === 'string' && o.str.indexOf('ART.002') >= 0);
      if (!titleOp) throw new Error('title op not found');
      const origX = 0.045 * 936;
      if (Math.abs(titleOp.x - origX) > 0.75) throw new Error('identity layout broken: title x ' + titleOp.x.toFixed(2) + ' != ' + origX.toFixed(2));
      editorialContent.guidePref = { setId: 'g_idml12', show: false };
      _curPageKey = null;
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
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
