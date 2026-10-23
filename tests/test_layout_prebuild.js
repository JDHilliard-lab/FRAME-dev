// 19.58, "can you tackle these two tasks to make render times faster": the first visit to a
// presentation layout in a session still rebuilt every preview (Ford deck: 33 s per piece,
// 22 s group).
//  1. Previews draw each frame mockup at the size it is SHOWN. Spec-page mockups were drawn
//     at 96 px per inch (a 48" piece was a 4600 px canvas, its moulding tiled and its shadows
//     blurred at that size) and then shrunk to a thumbnail; the artwork photo was drawn in
//     full size every time. Now 15 s / 9 s, and the PDF keeps 96 dpi.
//  2. The other layouts build themselves while you pause, into the parked set, so the first
//     switch is as quick as a switch back. Without ever changing the project's layout, and
//     stopping the moment anything else happens.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // A recording context: shadow blurs set on it are kept so a check can read them.
  window.__blurs = [];
  const mkCtx = () => new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s || '').length * 5 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, k, v) { if (k === 'shadowBlur' && v > 0) window.__blurs.push(v); t[k] = v; return true; }
  });
  window.HTMLCanvasElement.prototype.getContext = function () { return this.__ctx || (this.__ctx = mkCtx()); };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
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
    scheduleAutosave = () => {}; pushHistory = () => { _dsEditGen++; _dsBgStop(); };
    const S = window.__src;
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const fr = (id, letter, x, w) => ({ id: id, letter: letter, x: x, y: 40, w: w, h: 30, active: true, dimTo: [] });
    const row = (id, w, h) => Object.assign({}, dashDefaultData, { id: id, product: 'Framed Art', extW: w, extH: h, level: 0, artworkUrl: 'data:image/jpeg;base64,PHOTO' + id });
    const setup = () => {
      editorialContent = _editorialDefaults();
      editorialContent.specTemplate = 'frameSpecDetail';
      elevUnit = 'in'; dashUnit = 'in';
      dashProjectData = [row('ART.1', 48, 36), row('ART.2A', 20, 24), row('ART.2B', 20, 24)];
      elevations = [{ id: 'w1', name: 'ART.1', wallW: 160, wallH: 108, frames: [fr('ART.1', 'A', 40, 48)] },
                    { id: 'w2', name: 'ART.2', wallW: 160, wallH: 108, frames: [fr('ART.2A', 'A', 30, 20), fr('ART.2B', 'B', 60, 20)] }];
    };
    // a big photo, so a small copy is worth making
    _loadImg = async () => ({ width: 4000, height: 3000, naturalWidth: 4000, naturalHeight: 3000 });

    // ── 1. previews drawn at their size ──
    __check('EXACT BUG: a preview draws a spec-page frame at the size it is shown, the PDF at 96 dpi', async () => {
      setup();
      const seen = [];
      const real = renderFrameToCanvas;
      renderFrameToCanvas = function (d, sw, o) { seen.push({ dpi: o.dpi, k: o.shadowScale, art: o.artworkImg }); return real.apply(this, arguments); };
      try {
        const rec = new CanvasPdfRec(936, 540); rec._pxPerPt = 1.5;
        await _drawSpecPageTemplate(rec, {}, 3, {}, dashProjectData[0], 'frameSpecDetail', { PW: 936, PH: 540, M: 40 });
      } finally { renderFrameToCanvas = real; }
      const f = seen[0];
      if (!f) throw new Error('no frame mockup drawn');
      if (!(f.dpi < 40)) throw new Error('a 48in frame on a thumbnail was drawn at ' + f.dpi + ' dpi (a ' + Math.round(48 * f.dpi) + ' px canvas)');
      if (Math.abs(f.k - f.dpi / 96) > 1e-9) throw new Error('shadows not scaled with it: ' + f.k);
      if (!f.art || f.art.width >= 4000) throw new Error('the full-size photo was drawn into a thumbnail');
      const pdfDoc = { addImage() {} };
      if (_specFrameDpi(pdfDoc, { extW: 48, extH: 36 }, 300, 200).dpi !== 96) throw new Error('the PDF lost its 96 dpi');
      if (_specFrameDpi(pdfDoc, { extW: 48, extH: 36 }, 300, 200).shadowScale) throw new Error('the PDF shadows were scaled');
    });
    __check('every spec-page frame mockup asks _specFrameDpi (group, as hung, stacked, per piece)', () => {
      const n = S.split('_specFrameDpi(doc, dInches').length - 1;
      if (n !== 4) throw new Error(n + ' sites, expected 4');
      if (S.indexOf('dpi: 96, pad: 0, artworkImg') >= 0) throw new Error('a spec-page mockup still hard-codes 96 dpi');
    });
    __check('a frame drawn smaller casts the same shadow in inches', () => {
      const d = Object.assign(_frameDataInInches(row('X', 20, 20), 'in'), { m1A: true, m1T: 2, m1B: 2, m1L: 2, m1R: 2 });
      window.__blurs.length = 0; renderFrameToCanvas(d, null, { dpi: 96, pad: 0 });
      const full = window.__blurs.slice();
      window.__blurs.length = 0; renderFrameToCanvas(d, null, { dpi: 24, pad: 0, shadowScale: 0.25 });
      const small = window.__blurs.slice();
      if (!full.length || full.length !== small.length) throw new Error('shadow count differs: ' + full.length + ' vs ' + small.length);
      full.forEach((b, i) => { if (Math.abs(small[i] - b * 0.25) > 1e-9) throw new Error('blur ' + i + ': ' + small[i] + ' at 24 dpi vs ' + b + ' at 96'); });
    });
    __check('a small artwork copy is made once and kept; a picture not much bigger is used as it is', async () => {
      _artSmallCache.clear();
      const a = await _artSmall('data:image/jpeg;base64,BIG', 300, 200);
      const b = await _artSmall('data:image/jpeg;base64,BIG', 300, 200);
      if (!a || a.width >= 4000 || a !== b) throw new Error('no kept small copy');
      if (a.width < 300 || a.height < 200) throw new Error('the copy is smaller than its opening: ' + a.width + 'x' + a.height);
      const c = await _artSmall('data:image/jpeg;base64,BIG', 3800, 2900);
      if (c.width !== 4000) throw new Error('made a copy barely smaller than the original');
    });

    // ── 2. the other layouts build while idle ──
    const stubRender = () => {
      const calls = [];
      renderDeckPageCanvas = async function (desc, p, o) {
        if (!(o && o.bg)) _dsBgStop();
        calls.push({ tpl: _specTplResolve(desc._ovKey || ''), bg: !!(o && o.bg) });
        await wait(5);
        return { toDataURL: () => 'data:image/jpeg;base64,BG' };
      };
      return calls;
    };
    const deckOpen = () => { _dsIsOpen = () => true; _thumbQueue.length = 0; _thumbBusy = false; _dsBuildAllActive = false; _elevPrimeActive = false; _igRenderWasComplete = () => true; };
    const realRender = renderDeckPageCanvas;

    __check('EXACT REQUEST: the other layouts are built into the parked previews, the project layout never changes', async () => {
      setup(); deckOpen(); _dsThumbCache = {}; _dsThumbParked = {}; _dsParkedGen = -1; _dsBgDoneSig = '';
      const calls = stubRender();
      try {
        await _dsBgRun();
      } finally { renderDeckPageCanvas = realRender; }
      if (editorialContent.specTemplate !== 'frameSpecDetail') throw new Error('the project layout changed to ' + editorialContent.specTemplate);
      if (_dsBgTpl !== null) throw new Error('the override was left on');
      if (!calls.length || calls.some(c => !c.bg || c.tpl === 'frameSpecDetail')) throw new Error('renders: ' + JSON.stringify(calls));
      if (!calls.some(c => c.tpl === 'setLegend') || !calls.some(c => c.tpl === 'installGuide')) throw new Error('not both other layouts: ' + JSON.stringify(calls));
      // the group layout's own pages, by the keys the switch will look for
      editorialContent.specTemplate = 'setLegend';
      const want = _deckPageList().filter(d => _dsThumbDrawable(d) && d.kind === 'spec').map(d => _dsThumbCacheKey(d));
      editorialContent.specTemplate = 'frameSpecDetail';
      const miss = want.filter(k => !_dsParkHas(k));
      if (!want.length || miss.length) throw new Error('not parked: ' + miss.join(', '));
      if (!want.some(k => k.indexOf('ART.2') === 0 || k.indexOf('spec:ART.2|') === 0)) throw new Error('the ART.2 set page (A and B together) was not among them: ' + want.join(', '));
    });
    __check('EXACT BUG (found while building it): the page list builds the OTHER layout\\'s units', () => {
      setup();
      const list = _dsBgList('setLegend');
      const grp = list.find(d => d.kind === 'spec' && (d.members || []).length === 2);
      if (!grp) throw new Error('the group layout listed per-piece pages (the list read the project layout)');
      if (_dsBgTpl !== null || _dsBgListing) throw new Error('listing left its flags on');
    });
    __check('a press stops it at once, gives the foreground the real layout, and keeps nothing it was drawing', async () => {
      setup(); deckOpen(); _dsThumbCache = {}; _dsThumbParked = {}; _dsParkedGen = -1; _dsBgDoneSig = '';
      let release; const gate = new Promise(r => { release = r; });
      let during = null;
      renderDeckPageCanvas = async function () { await gate; return { toDataURL: () => 'data:image/jpeg;base64,BG' }; };
      try {
        const run = _dsBgRun();
        await wait(0);
        if (_dsBgTpl !== 'setLegend') throw new Error('fixture: not rendering the group layout');
        window.dispatchEvent(new window.Event('pointerdown'));
        during = _specTplResolve('ART.1');
        release(); await run;
      } finally { renderDeckPageCanvas = realRender; _dsBgStop(); }
      if (during !== 'frameSpecDetail') throw new Error('after the press the app saw ' + during);
      if (Object.keys(_dsThumbParked).length) throw new Error('kept a preview drawn after the press');
      if (_dsBgRunning) throw new Error('still running');
    });
    __check('foreground work stops it: a page render, a page list, a history push', async () => {
      for (const act of [() => realRender({ kind: 'nothing' }), () => _deckPageList(), () => pushHistory()]) {
        setup(); deckOpen(); _dsBgDoneSig = '';
        let release; const gate = new Promise(r => { release = r; });
        renderDeckPageCanvas = async function () { await gate; return null; };
        try {
          const run = _dsBgRun(); await wait(0);
          const tok = _dsBgTok;
          await act();
          if (_dsBgTpl !== null || _dsBgTok === tok) throw new Error('not stopped by ' + act);
          release(); await run;
        } finally { renderDeckPageCanvas = realRender; _dsBgStop(); }
      }
    });
    __check('a background page list leaves the contents page alone, and the recorders ignore its renders', () => {
      _dsBgListing = true;
      try { if (_tocSyncAll([]) !== null) throw new Error('synced the contents from another layout'); } finally { _dsBgListing = false; }
      _curPageKey = 'spec:ART.1'; delete _frameStripFit['spec:ART.1'];
      _noteStripFit('scaled', { _bgBuild: true });
      if (_frameStripFit['spec:ART.1']) throw new Error('a background render wrote a strip note');
      delete _dsTitleSlots['spec:ART.1'];
      _noteTitleSlot('title', true, { _bgBuild: true });
      if (_dsTitleSlots['spec:ART.1']) throw new Error('a background render wrote a title slot');
    });
    __check('it waits for a pause: nothing starts while the foreground is still building', async () => {
      setup(); deckOpen(); _dsBgDoneSig = '';
      _thumbQueue.push({ desc: {}, ck: 'x', token: -1 });
      const calls = stubRender();
      try { await _dsBgRun(); } finally { renderDeckPageCanvas = realRender; _thumbQueue.length = 0; _dsBgStop(); }
      if (calls.length) throw new Error('built while the foreground queue was busy');
      if (!(DS_IDLE_PREBUILD_MS >= 2000)) throw new Error('the pause is too short to be a pause: ' + DS_IDLE_PREBUILD_MS);
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
