// 19.63, "For ART.4 I have two pieces of artwork on one wall, but while in Group ABC
// presentation layout they get their own spec pages, but I think they would be fine together
// and I would want them displayed side by side rather then displayed as is on wall which would
// shrink them down and have them far apart, might need settings for designers to control."
// Codes can share one Group A/B/C page (a combined page), laid out side by side or as hung.
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
      if (k === 'measureText') return (str) => ({ width: String(str || '').length * 5 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  window.HTMLCanvasElement.prototype.getContext = function () { return this.__ctx || (this.__ctx = mkCtx()); };
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
    _planCropCanvasForRow = async () => null; _sharedSpecFrames = async () => [];
    renderElevationToCanvas = async () => null;
    const row = (id, w, h) => Object.assign({}, dashDefaultData, { id: id, product: 'Framed Art', extW: w || 31, extH: h || 36, level: 0 });
    const fr = (id, letter, x, w, h) => ({ id: id, letter: letter, x: x, y: 40, w: w || 31, h: h || 36, active: true, dimTo: [] });
    const setup = () => {
      editorialContent = _editorialDefaults();
      editorialContent.specTemplate = 'setLegend';
      dashUnit = 'in'; elevUnit = 'in';
      dashProjectData = [row('ART.3'), row('ART.4'), row('ART.5', 24, 30)];
      elevations = [{ id: 'w3', name: 'ART.3', wallW: 120, wallH: 108, frames: [fr('ART.3', 'A', 40)] },
                    { id: 'w4', name: 'ART.4 / 5', wallW: 320, wallH: 112, frames: [fr('ART.4', 'A', 34), fr('ART.5', 'A', 260, 24, 30)] }];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
    };
    const specs = () => _deckPageList().filter(d => d.kind === 'spec');
    const combined = () => specs().find(d => d._manual);
    // where the pieces land on the page
    const placed = async (d) => {
      const out = {}; const real = _specArtRectAdd;
      _specArtRectAdd = (id, x, y, w, h) => { out[id] = { x, y, w, h }; };
      try { await _drawDeckSpecPage(new CanvasPdfRec(936, 540), d, { logos: {}, meta: {}, pageNum: 1, PW: 936, PH: 540, M: 40 }); }
      finally { _specArtRectAdd = real; }
      return out;
    };

    __check('EXACT REQUEST: ART.4 and ART.5 (one wall, two codes) share one Group A/B/C page', () => {
      setup();
      const s0 = specs().map(d => d.title).join(' ');
      if (s0 !== 'ART.3 ART.4 ART.5') throw new Error('fixture: ' + s0);
      const k = _combineUnitWith('ART.4', 'ART.5');
      if (k.indexOf('mg:') !== 0) throw new Error('not combined: ' + k);
      const s = specs().map(d => d.title).join(' ');
      if (s !== 'ART.3 ART.4 / ART.5') throw new Error('pages: ' + s);
      const d = combined();
      if (_deckSpecTpl(d) !== 'setLegend') throw new Error('drawn as ' + _deckSpecTpl(d) + ', not a Group A/B/C page');
      if (dashProjectData.map(r => r.id).join(',') !== 'ART.3,ART.4,ART.5') throw new Error('the codes were changed');
    });
    __check('EXACT REQUEST: side by side, not as hung: one size, centres level, close together', async () => {
      setup(); _combineUnitWith('ART.4', 'ART.5');
      const d = combined();
      if (_specUnitArrange(d._ovKey, true) !== 'side') throw new Error('a combined page should start side by side');
      const p = await placed(d);
      const a = p['ART.4'], b = p['ART.5'];
      if (!a || !b) throw new Error('pieces not placed: ' + JSON.stringify(p));
      const k = a.w / 31;
      if (Math.abs(b.w / 24 - k) > 1e-6) throw new Error('not one scale');
      if (Math.abs((a.y + a.h / 2) - (b.y + b.h / 2)) > 0.01) throw new Error('centres not level');
      const gapIn = (b.x - (a.x + a.w)) / k;
      if (Math.abs(gapIn - SPEC_SIDE_GAP_IN) > 0.01) throw new Error('gap is ' + gapIn.toFixed(2) + 'in, not ' + SPEC_SIDE_GAP_IN);
      // as hung they sit 195in apart on the wall, so they come out much smaller
      setSpecUnitArrange(d._ovKey, 'hung', true);
      const h = await placed(combined());
      if (!(h['ART.4'].w < a.w * 0.6)) throw new Error('as hung was not the wall layout: ' + h['ART.4'].w + ' vs ' + a.w);
      if (!editorialContent.unitArrange || editorialContent.unitArrange['spec:' + d._ovKey] !== 'hung') throw new Error('as hung not stored for the combined page');
      setSpecUnitArrange(d._ovKey, 'side', true);
      if (editorialContent.unitArrange) throw new Error('the default was stored');
    });
    __check('the page is titled with its codes and says which letter is which', async () => {
      setup(); _combineUnitWith('ART.4', 'ART.5');
      let got = null; const real = _drawPageTitle;
      _drawPageTitle = function (doc, PW, PH, t, sub) { got = { t: t, sub: sub }; return real.apply(this, arguments); };
      try { await placed(combined()); } finally { _drawPageTitle = real; }
      if (!got || got.t !== 'ART.4 / ART.5') throw new Error('title ' + JSON.stringify(got));
      if (got.sub.indexOf('A ART.4') < 0 || got.sub.indexOf('B ART.5') < 0) throw new Error('subheading ' + got.sub);
    });
    __check('an ordinary set keeps as hung, and can go side by side', () => {
      setup();
      if (_specUnitArrange('ART.3', false) !== 'hung') throw new Error('a set should start as hung');
      const d = specs().find(x => x.title === 'ART.3');
      const k0 = _dsThumbCacheKey(d);
      setSpecUnitArrange('ART.3', 'side', false);
      if (_dsThumbCacheKey(d) === k0) throw new Error('the thumbnail ignores the arrangement');
    });
    __check('the codes on the same wall are offered first', () => {
      setup();
      const o = _specSetKeysForCombine('ART.4');
      if (!o.length || o[0].key !== 'ART.5' || !o[0].sameWall || o.some(x => x.key === 'ART.4')) throw new Error(JSON.stringify(o));
    });
    __check('separating them gives each its own page back', () => {
      setup(); _combineUnitWith('ART.4', 'ART.5');
      const host = document.createElement('div');
      _dsUnitPagesInto(host, combined());
      if (host.textContent.indexOf('Combined page: ART.4 / ART.5') < 0) throw new Error(host.textContent);
      host.querySelector('#dsUnitUngroup').onclick();
      const s = specs().map(d => d.title).join(' ');
      if (s !== 'ART.3 ART.4 ART.5') throw new Error(s);
    });
    __check('a page combined in an older version opens as a Group A/B/C page', () => {
      setup();
      editorialContent.manualGroups = [{ id: 'mg_old', members: ['ART.4', 'ART.5'], layout: 'setRight' }];
      const d = combined();
      if (!d || _deckSpecTpl(d) !== 'setLegend' || d.title !== 'ART.4 / ART.5') throw new Error(JSON.stringify(d && [d.title, _deckSpecTpl(d)]));
    });
  `;

  try {
    window.eval('window.__src = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
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
