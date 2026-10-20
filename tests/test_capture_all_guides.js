// 19.43: ONE CAPTURE PER WALL HOLDS EVERY GUIDE; EACH PAGE SHOWS THE ONES THAT ARE ON.
//
// Reported on the Ford SLC install guide: every guide toggle reloaded "Updating
// elevations" for all 34 walls and rebuilt every preview (53s, 34 captures measured on
// 19.42). A capture is now taken with every guide on; its lines and numbers carry their
// guide (data-gl), the figure is its own image and each layer's extent is recorded, so
// _capView can show exactly the guides that are on, cropped as the export would have
// cropped them, without recapturing anything.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,CROPPED';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  const quiet = console.error; console.error = () => {};
  window.eval(src + `
    _autosaveToldUser = true; scheduleAutosave = () => {};
    _loadImg = async () => ({ naturalWidth: 1000, naturalHeight: 500 });
    // An every-guide capture of a 1000 x 500 artboard: the wall and frames in the middle,
    // wall dims reaching out to x=20, spacing above, a figure on the right.
    window.__cap = () => ({
      dataUrl: 'data:image/jpeg;base64,FULL', w: 2000, h: 1000, allGuides: true,
      vec: { w: 1000, h: 500, ops: [
        { t: 'line', x1: 100, y1: 400, x2: 900, y2: 400, c: '#333', w: 1 },                                   // wall outline (no guide)
        { t: 'line', x1: 20, y1: 100, x2: 20, y2: 400, c: '#e00', w: 1, gl: 'arch-dim-layer' },               // wall dim
        { t: 'text', x: 500, y: 60, s: '4"', fs: 9, c: '#e00', gl: 'dim-layer' },                             // spacing number
        { t: 'line', x1: 300, y1: 250, x2: 700, y2: 250, c: '#e00', w: 1, dash: '6,4', gl: 'guide-layer' }    // hang line
      ] },
      boxes: { 'frame-layer': [300, 150, 700, 350], 'arch-dim-layer': [15, 95, 25, 405], 'dim-layer': [480, 50, 520, 70], 'guide-layer': [100, 240, 900, 260], person: [780, 120, 860, 400] },
      pad: { left: 40, safe: 6 },
      person: { png: 'data:image/png;base64,PERSON', box: [780, 120, 860, 400] },
      floorY: 400, wallRightX: 900
    });
    window.__set = (on) => {
      const lay = (id, v) => { const l = document.getElementById(id); if (l) l.style.display = v ? 'block' : 'none'; };
      lay('dim-layer', on.spacing); lay('guide-layer', on.hang); lay('person-wrap', on.person);
      dimVisibility.wallDims = !!on.wallDims;
    };
    window.__figDimVis = () => { dimVisibility.figureHeight = true; return _elevGuideVis()['figure-dim-layer']; };
    window.__view = async (on) => { window.__set(on); return await _capView(window.__cap()); };
    window.__drawPerson = (v) => { const calls = []; const real = _addPngImage; _addPngImage = (d, s, x, y, w, h) => calls.push({ s: s, x: x, y: y, w: w, h: h }); try { _capDrawPerson({}, v, 0, 0, v.vec.w, v.vec.h); } finally { _addPngImage = real; } return calls; };
  `);
  console.error = quiet;
  const results = [];
  const check = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };
  const tags = (v) => v.vec.ops.map(o => o.gl || 'none').sort().join(',');

  await check('every guide on: all ops kept, cropped to everything (no crop needed past the edges)', async () => {
    const v = await window.__view({ spacing: true, hang: true, person: true, wallDims: true });
    if (tags(v) !== 'arch-dim-layer,dim-layer,guide-layer,none') throw new Error('ops: ' + tags(v));
    if (!v.person) throw new Error('the figure is missing with the person guide on');
  });

  await check('EXACT REQUEST: a hidden guide is simply not drawn (no recapture)', async () => {
    const v = await window.__view({ spacing: false, hang: true, person: true, wallDims: true });
    if (tags(v).indexOf('dim-layer,') >= 0 && tags(v).indexOf('arch-dim-layer') < 0) throw new Error('spacing still drawn');
    if (v.vec.ops.some(o => o.gl === 'dim-layer')) throw new Error('the spacing number is still drawn');
    if (!v.vec.ops.some(o => o.gl === 'guide-layer')) throw new Error('the hang line went too');
  });

  await check('the figure follows the person guide', async () => {
    const off = await window.__view({ spacing: true, hang: true, person: false, wallDims: true });
    if (off.person) throw new Error('the figure prints with the person guide off');
    const on = await window.__view({ spacing: true, hang: true, person: true, wallDims: true });
    const calls = window.__drawPerson(on);
    if (calls.length !== 1 || calls[0].s.indexOf('PERSON') < 0) throw new Error('the figure was not drawn as its own image');
  });

  await check('the figure\'s height dimension goes with the figure, as on screen', async () => {
    window.eval('1');
    const r = await (async () => { window.__set({ spacing: true, hang: true, person: false, wallDims: true }); return window.__figDimVis(); })();
    if (r) throw new Error('the 72" figure dimension prints with the figure hidden');
  });

  await check('hiding the wall dims CROPS the drawing in, as the export would have', async () => {
    const v = await window.__view({ spacing: true, hang: true, person: true, wallDims: false });
    // Without the wall dim at x=15..25 the leftmost content is the hang line at x=100; the
    // crop starts LEFT_EXTRA (40) before it.
    if (v.dataUrl.indexOf('CROPPED') < 0) throw new Error('the picture was not cropped');
    // Visible content spans x 100..900, so the crop is 60 (100 - 40) to 906 (900 + 6).
    if (Math.abs(v.vec.w - (906 - 60)) > 0.01) throw new Error('crop width ' + v.vec.w + ', expected ' + (906 - 60));
    const hang = v.vec.ops.find(o => o.gl === 'guide-layer');
    if (Math.abs(hang.x1 - 240) > 0.01) throw new Error('ops not moved into the crop: hang line starts at ' + hang.x1);
    if (Math.abs(v.person.box[0] - 720) > 0.01) throw new Error('figure not moved into the crop');
  });

  await check('the floor and right wall are re-read for the crop (19.40 / 19.41 alignment keeps working)', async () => {
    const v = await window.__view({ spacing: true, hang: true, person: true, wallDims: false });
    const floorY = v.floorFrac * v.vec.h, wallR = v.wallRightFrac * v.vec.w;
    // crop origin (60, 44): floor 400 -> 356, wall right 900 -> 840
    if (Math.abs(floorY - 356) > 0.01) throw new Error('floor at ' + floorY);
    if (Math.abs(wallR - 840) > 0.01) throw new Error('wall right at ' + wallR);
  });

  await check('a capture without guide data is drawn exactly as it is', async () => {
    const plain = { dataUrl: 'data:image/jpeg;base64,X', w: 10, h: 10, vec: null };
    const v = await window.eval('_capView')(plain);
    if (v !== plain) throw new Error('an old-style capture was changed');
  });

  const failed = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ' :: ' + r.err)));
  console.log(failed.length ? (failed.length + ' FAILED') : 'ALL PASSED (' + results.length + ')');
  process.exit(failed.length ? 1 : 0);
})();
