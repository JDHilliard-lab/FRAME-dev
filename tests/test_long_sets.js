// 19.64, on an 11-frame salon preset:
//  1. "on the floorplan it says ART.1 | A/B/C/D/E/F/G/H/I/J/K which is taking up so much space,
//     once something goes past C it should be ART.1 | A-K".
//  2. "on a spec page ... have the opportunity to split it into two pages, or three pages
//     depending if it goes past 12 frames". (A group page also dropped a 13th piece silently.)
//  3. "for the per-piece spec pages the elevation thumbnail ... can we have it be consistent for
//     all pages so the first couple frames show the left half of the elevation and then the
//     right half", with a break line where the wall is cut.
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
    const L = 'ABCDEFGHIJKLM';
    const setup = (n) => {
      editorialContent = _editorialDefaults();
      editorialContent.specTemplate = 'setLegend';
      dashUnit = 'in'; elevUnit = 'in';
      dashProjectData = []; const frames = [];
      for (let i = 0; i < n; i++) { const id = 'ART.1' + L[i]; dashProjectData.push(Object.assign({}, dashDefaultData, { id: id, product: 'Framed Art', extW: 20, extH: 24, level: 0 })); frames.push({ id: id, letter: L[i], x: 10 + i * 26, y: 40, w: 20, h: 24, active: true, dimTo: [] }); }
      elevations = [{ id: 'w1', name: 'ART.1', wallW: 20 + n * 26, wallH: 108, frames: frames }];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
    };
    const specs = () => _deckPageList().filter(d => d.kind === 'spec');

    // 1. the plan
    __check('EXACT REQUEST: the plan reads A-K past three letters, and keeps A / B / C', () => {
      if (_planLetters('ABCDEFGHIJK'.split(''), ' / ') !== 'A\\u2013K') throw new Error(_planLetters('ABCDEFGHIJK'.split(''), ' / '));
      if (_planLetters(['A', 'B', 'C'], ' / ') !== 'A / B / C') throw new Error('three letters were shortened');
      if (_planLetters(['A', 'B', 'C', 'D', 'F'], ' / ') !== 'A\\u2013D / F') throw new Error('a gap was lost: ' + _planLetters(['A', 'B', 'C', 'D', 'F'], ' / '));
      const S = window.__src || '';
      const a = S.indexOf('const _keyRest = (en) =>');
      if (a < 0 || S.slice(a, S.indexOf('\\n', a)).indexOf('_planLetters(en.letters') < 0) throw new Error('the plan key does not shorten its letters');
    });

    // 2. splitting
    __check('EXACT REQUEST: an 11-piece set can go over 2 pages, letters continuing, each its own page', async () => {
      setup(11);
      setSpecUnitSplit('ART.1', 2, 11);
      const p = specs();
      if (p.length !== 2 || p[0].members.length !== 6 || p[1].members.length !== 5) throw new Error(p.map(d => d.members.length).join('+'));
      if (_deckPageKey(p[0]) === _deckPageKey(p[1])) throw new Error('both parts share one page key');
      let sub = null; const real = _drawPageTitle;
      _drawPageTitle = function (doc, PW, PH, t, s) { sub = s; return real.apply(this, arguments); };
      try { await _drawDeckSpecPage(new CanvasPdfRec(936, 540), p[1], { logos: {}, meta: {}, pageNum: 1, PW: 936, PH: 540, M: 40 }); }
      finally { _drawPageTitle = real; }
      if (sub !== 'G\\u2013K \\u00b7 2 OF 2') throw new Error('part 2 subheading: ' + sub);
      if (_dsThumbCacheKey(p[0]) === _dsThumbCacheKey(p[1])) throw new Error('the parts share a thumbnail');
      setSpecUnitSplit('ART.1', 1, 11);
      if (editorialContent.unitSplit) throw new Error('one page is the default and was stored');
      if (specs().length !== 1) throw new Error('did not go back to one page');
    });
    __check('EXACT BUG: past 12 a set splits by itself instead of dropping pieces', () => {
      setup(13);
      const p = specs();
      const n = p.reduce((a, d) => a + d.members.length, 0);
      if (p.length !== 2 || n !== 13) throw new Error(p.length + ' pages holding ' + n + ' of 13');
    });
    __check('renumbering a set carries its later parts\\' settings', () => {
      setup(11);
      editorialContent.approvalStatus = { 'spec:ART.1~2': 'approved' };
      _renamePageKeys('ART.1', 'ART.4');
      if (editorialContent.approvalStatus['spec:ART.4~2'] !== 'approved' || editorialContent.approvalStatus['spec:ART.1~2']) throw new Error(JSON.stringify(editorialContent.approvalStatus));
    });

    // 3. fixed windows
    __check('EXACT REQUEST: every page of one wall shows one of the same windows, left pieces left, right pieces right', () => {
      const c = document.createElement('canvas'); c.width = 2400; c.height = 300;
      const er = { canvas: c, wIn: 240, hIn: 30, wallLeftFrac: 0, wallRightFrac: 1, wallTopFrac: 0 };
      const at = (f) => { const ft = _elevThumbFit(er, 100, 400, [f, f + 0.03]); return Math.round(-ft.er.wallLeftFrac * ft.canvas.width); };
      const starts = [0.02, 0.1, 0.2, 0.45, 0.55, 0.8, 0.95].map(at);
      const uniq = starts.filter((v, i) => starts.indexOf(v) === i);
      if (uniq.length !== 2) throw new Error('windows: ' + starts.join(','));
      if (!(starts[0] === 0 && starts[6] > 0 && starts[0] === starts[1] && starts[5] === starts[6])) throw new Error('left/right not consistent: ' + starts.join(','));
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
