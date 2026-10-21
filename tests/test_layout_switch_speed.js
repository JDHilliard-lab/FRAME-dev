// 19.56, "when I jump between per-piece, Group A/B/C, and Install guide presentation layouts it
// should almost be instant... designers getting frustrated when clicking through different
// settings". Measured on the Ford deck: going BACK to a layout rebuilt every preview (23 s per
// piece, 16 s group) because the switch wiped the thumbnails and the frame mockups; every rail
// rebuild re-parsed each thumbnail's data URL and the cover's 12 MB of markup; every spec
// preview JPEG-encoded its pictures only to decode them again.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  let encodes = 0;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.HTMLCanvasElement.prototype.toDataURL = () => { encodes++; return 'data:image/jpeg;base64,AAAA'; };
  window.__encodes = () => encodes;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  const testBlock = `
    window.__testResults = []; window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __check = (label, fn) => { __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true })).catch(e => ({ label, ok: false, err: e.message }))); window.__asyncChecks.push(__chain); };
    _autosaveToldUser = true; scheduleAutosave = () => {};
    const S = window.__src;

    __check('EXACT BUG: a layout switch no longer wipes the thumbnails or the frame mockups', () => {
      const a = S.indexOf('const switchMode = (tpl) => {');
      const body = S.slice(a, S.indexOf('const mkMode = ', a));
      if (body.indexOf('_dsClearBuiltAll()') >= 0) throw new Error('switchMode still calls _dsClearBuiltAll (rebuilds the whole deck on every switch)');
      if (body.indexOf('_dsParkThumbs()') < 0 || body.indexOf('_dsUnparkThumbs()') < 0) throw new Error('the switch does not park and bring back previews');
      if (body.indexOf('_dsParkedGen = _dsEditGen') < 0) throw new Error('the parked previews are not tied to the edit count');
    });
    __check('parked previews come back on the return trip, and are dropped after an edit', () => {
      _dsThumbCache = { 'spec:ART.1|medium|frameSpecDetail|1111': 'data:per' };
      _dsParkedGen = -1; _dsEditGen = 10;
      _dsParkThumbs();                 // leaving Per piece
      _dsParkedGen = _dsEditGen;       // as the switch does after its own history push
      _dsThumbCache = {};              // the Group pages (none built yet)
      _dsParkThumbs();                 // leaving Group: no edit since, keep what is parked
      _dsThumbCache = {}; _dsUnparkThumbs();
      if (_dsThumbCache['spec:ART.1|medium|frameSpecDetail|1111'] !== 'data:per') throw new Error('Per piece previews did not come back');
      _dsParkedGen = _dsEditGen; _dsEditGen++;   // an edit between switches
      _dsThumbCache = {}; _dsParkThumbs(); _dsUnparkThumbs();
      if (_dsThumbCache['spec:ART.1|medium|frameSpecDetail|1111']) throw new Error('a stale parked preview survived an edit');
      _dsThumbParked = { k: 'x' }; _dsClearBuiltAll();
      if (Object.keys(_dsThumbParked).length) throw new Error('a full invalidation kept parked previews');
    });
    __check('a preview canvas goes to the preview renderer as is; a real PDF still gets the encoded image', () => {
      const c = document.createElement('canvas');
      const before = window.__encodes();
      if (_docImgSrc(new CanvasPdfRec(936, 540), c, 'image/jpeg', 0.9) !== c) throw new Error('the preview was handed a string');
      if (window.__encodes() !== before) throw new Error('the preview path encoded');
      const fakePdf = { addImage() {} };
      if (typeof _docImgSrc(fakePdf, c, 'image/jpeg', 0.9) !== 'string') throw new Error('the PDF path lost its encoded image');
      const n = (S.match(/_docImgSrc\\(doc, /g) || []).length;
      if (n < 7) throw new Error('only ' + n + ' spec-page images go through _docImgSrc');
    });
    __check('a file image (library corner, the figure) is fetched once', () => {
      const a = _loadImg('library/x/corner.jpg'), b = _loadImg('library/x/corner.jpg');
      if (a !== b) throw new Error('the same file was loaded twice');
      const d = _loadImg('blob:https://example.com/abc'), e2 = _loadImg('blob:https://example.com/abc');
      if (d === e2) throw new Error('a blob: URL was cached (it can be revoked)');
    });
    __check('EXACT BUG: a cached thumbnail is the same <img> across rail rebuilds', () => {
      const t1 = document.createElement('div'), t2 = document.createElement('div');
      _dsRailGen++; _dsThumbImgInto(t1, 'data:image/jpeg;base64,THUMB1');
      const im = t1.querySelector('img');
      _dsRailGen++; _dsThumbImgInto(t2, 'data:image/jpeg;base64,THUMB1');
      if (t2.querySelector('img') !== im) throw new Error('a new <img> (a fresh synchronous data: load) on every rebuild');
      const t3 = document.createElement('div'); _dsThumbImgInto(t3, 'data:image/jpeg;base64,THUMB1');
      if (t3.querySelector('img') === im || !t2.querySelector('img')) throw new Error('a second use in one rebuild stole the first cell\\'s image');
    });
    __check('EXACT BUG: a designed page preview (the cover) is parsed once, not on every rebuild', () => {
      const h = '<div class="cov">' + 'x'.repeat(50) + '</div>';
      const t1 = document.createElement('div'), t2 = document.createElement('div');
      _dsRailGen++; _dsHtmlInto(t1, h); const node = t1.firstChild;
      _dsRailGen++; _dsHtmlInto(t2, h);
      if (t2.firstChild !== node) throw new Error('re-parsed');
      _dsRailGen++; _dsThumbImgSweep();
      if (_dsThumbHtmlEls.has(h)) throw new Error('an unused preview is kept (edited covers would pile up)');
    });
    __check('a large photo in a rail preview is swapped for a small copy', async () => {
      const big = 'data:image/jpeg;base64,' + 'A'.repeat(DS_SLIM_MIN + 10);
      const realDown = _imgDownsized;
      _imgDownsized = async () => 'data:image/jpeg;base64,SMALL';
      try {
        const html = '<div style="background:url(&quot;' + big + '&quot;)"></div><img src="' + big + '">';
        const first = _dsThumbSlim(html);
        if (first.indexOf('SMALL') >= 0) throw new Error('fixture: small copy before it was made');
        await new Promise(r => setTimeout(r, 20));
        const second = _dsThumbSlim(html);
        if (second.indexOf(big) >= 0 || (second.match(/SMALL/g) || []).length !== 2) throw new Error('the full photo is still in the preview');
        if (_dsThumbSlim('<div>small</div>') !== '<div>small</div>') throw new Error('small markup changed');
      } finally { _imgDownsized = realDown; }
    });
  `;
  try { window.eval('window.__src = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock); } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = await Promise.all(window.__asyncChecks || []);
  const bad = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + all.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
