// THE ALL-OPTIONS PAGE (18.02): "can we make the all options page thumbnail aligned with
// the option / art titles maybe making them larger, also maybe having an option to have
// them on one page or split them onto multiple pages. ... include little descriptions as
// well if they are alternates, same frames same image, same frames and images different
// arrangements?"
// Rendered through CanvasPdfRec; the frames are rasters, so positions are read off the
// image ops and the labels off the text ops.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const NL = String.fromCharCode(10);

const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      // Size-aware: the layout sizes its columns off the description text, and a flat 6px a
      // character would make a 7.5pt caption measure twice its real width.
      if (k === 'measureText') return (str) => { const m = /([0-9.]+)px/.exec(t.font || ''); return { width: String(str || '').length * (m ? parseFloat(m[1]) : 10) * 0.5 }; };
      if (k === 'getImageData' || k === 'createImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(64), width: 4, height: 4 });
      if (/^create/.test(String(k))) return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;

const body = [
  "_autosaveToldUser = true;",
  "scheduleAutosave = function () {};",
  "switchView = function () {}; _elevLoadWall = function () {};",
  "_dsRefresh = function () {}; _dsRenderRail = function () {}; _dsRenderTools = function () {}; _dsRenderCenter = function () {};",
  "_toast = function () { return null; };",
  "// jsdom never loads an image, so every artwork would wait out _loadImg's 4s timeout.",
  "_loadImg = function () { return Promise.resolve(null); };",
  "window.__res = (async function () {",
  "  const out = [];",
  "  const check = async function (label, fn) { try { await fn(); out.push({ label: label, ok: true }); } catch (e) { out.push({ label: label, ok: false, err: e.message }); } };",
  "  const URL1 = 'data:image/png;base64,' + 'A'.repeat(90), URL2 = 'data:image/png;base64,' + 'B'.repeat(90);",
  "  const mkRow = function (id, w, h, url) { const r = JSON.parse(JSON.stringify(dashDefaultData)); r.id = id; r.extW = w; r.extH = h; r.artworkUrl = url || ''; r.imageCode = url ? ('img-' + id) : ''; return r; };",
  "  const setup = function () {",
  "    editorialContent = _editorialDefaults();",
  "    dashProjectData = [mkRow('ART.1A', 24, 30, URL1), mkRow('ART.1B', 24, 30, URL2)];",
  "    elevations = [{ id: 'w1', name: 'Lobby', wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [",
  "      { id: 'ART.1A', letter: 'A', x: 40, y: 40, w: 24, h: 30, active: true, artworkUrl: URL1 },",
  "      { id: 'ART.1B', letter: 'B', x: 80, y: 40, w: 24, h: 30, active: true, artworkUrl: URL2 }] }];",
  "    currentElevIndex = 0;",
  "  };",
  "  // OPTION 1 (the pictures), OPTION 2 (same frames, new pictures), OPTION 3 (same frames and",
  "  // pictures hung another way), OPTION 4 (a different frame set, empty).",
  "  const build = function () {",
  "    setup();",
  "    _catAddOptionOfKind(0, 'images');",
  "    const opt2 = _catPlacementWalls('ART.1')[1];",
  "    (opt2.wall.frames || []).forEach(function (f, i) { const r = dashProjectData.find(function (x) { return x.id === f.id; }); r.imageCode = 'other-' + i; r.artworkUrl = URL2; });",
  "    const opt1 = elevations.findIndex(function (e) { return e.catalogueOption === '1'; });",
  "    _catAddOptionOfKind(opt1, 'arrange', 'Stacked');",
  "    _catAddOptionOfKind(0, 'setNew', 'Single');",
  "    // OPTION 4 is one big piece, so it sets the scale and stands taller than its row-mates.",
  "    const set2 = _catPlacementWalls('ART.1').find(function (i) { return i.setNum === 2; });",
  "    set2.wall.frames = [set2.wall.frames[0]]; set2.wall.frames[0].w = 48; set2.wall.frames[0].h = 60;",
  "  };",
  "  const draw = async function (part) { const rec = new CanvasPdfRec(936, 540); await _drawCatOverviewPage(rec, {}, 1, {}, 'ART.1', { PW: 936, PH: 540, part: part || 0 }); return rec.ops; };",
  "  const texts = function (ops) { return ops.filter(function (o) { return o.t === 'text'; }); };",
  "  const labels = function (ops) { return texts(ops).filter(function (o) { return /^OPTION [0-9]+$/.test(o.str); }); };",
  "  // The frames belonging to a label: below it, and nearest to it from the left on its row.",
  "  const cellOf = function (ops, L) {",
  "    const ls = labels(ops);",
  "    return ops.filter(function (o) { if (o.t !== 'img') return false;",
  "      const own = ls.filter(function (l) { return l.y < o.a[1] && l.x <= o.a[0] + 0.5; }).sort(function (a, b) { return (b.y - a.y) || (b.x - a.x); })[0];",
  "      return own === L; });",
  "  };",
  "  await check('EXACT ASK: each drawing starts at its OPTION title, left edge on the title', async function () {",
  "    build();",
  "    const ops = await draw();",
  "    const ls = labels(ops);",
  "    if (ls.length !== 4) throw new Error('labels: ' + ls.map(function (l) { return l.str; }).join());",
  "    ls.forEach(function (L) {",
  "      const c = cellOf(ops, L);",
  "      if (!c.length) return;",
  "      const x0 = Math.min.apply(null, c.map(function (o) { return o.a[0]; }));",
  "      if (Math.abs(x0 - L.x) > 0.5) throw new Error(L.str + ' art starts at x=' + x0.toFixed(1) + ', title at ' + L.x.toFixed(1));",
  "    });",
  "  });",
  "  await check('EXACT ASK: the drawing hangs directly under its title, not on the cell floor', async function () {",
  "    build();",
  "    const ops = await draw();",
  "    labels(ops).forEach(function (L) {",
  "      const c = cellOf(ops, L);",
  "      if (!c.length) return;",
  "      const y0 = Math.min.apply(null, c.map(function (o) { return o.a[1]; }));",
  "      const gap = y0 - L.y;",
  "      if (!(gap > 18 && gap < 32)) throw new Error(L.str + ' art starts ' + gap.toFixed(1) + 'pt below its title');",
  "    });",
  "  });",
  "  await check('EXACT ASK: the drawings are larger than the old equal-cell grid', async function () {",
  "    build();",
  "    const ops = await draw();",
  "    const ws = ops.filter(function (o) { return o.t === 'img'; }).map(function (o) { return o.a[2]; });",
  "    // On this fixture a 24in frame drew 66pt wide in the old centred, equal-cell grid and 81pt",
  "    // in the table sized to its contents.",
  "    const w24 = Math.min.apply(null, ws);",
  "    if (!(w24 > 74)) throw new Error('a 24in frame is ' + w24.toFixed(1) + 'pt wide');",
  "  });",
  "  await check('EXACT ASK: a short line says what each alternate changes; OPTION 1 has none', async function () {",
  "    build();",
  "    const t = texts(await draw()).map(function (o) { return o.str; });",
  "    ['Same frames and layout, different images', 'Same frames and images, different layout', 'Different frames'].forEach(function (s) {",
  "      if (t.indexOf(s) < 0) throw new Error('missing: ' + s + ' in ' + JSON.stringify(t));",
  "    });",
  "    const items = _catPlacementWalls('ART.1');",
  "    if (_catOptionDescribe(items[0], items[0]) !== '') throw new Error('option 1 is described');",
  "  });",
  "  await check('the description reads the IMAGES as a set: same pictures reshuffled are the same images', async function () {",
  "    build();",
  "    const items = _catPlacementWalls('ART.1');",
  "    const lay = items.find(function (i) { return i.layout !== items[0].layout && _catAltKind(i.layout) === 'layout'; });",
  "    if (_catOptionDescribe(lay, items[0]) !== 'Same frames and images, different layout') throw new Error('got ' + _catOptionDescribe(lay, items[0]));",
  "  });",
  "  await check('EXACT ASK: Options per page splits the overview over several pages', async function () {",
  "    build();",
  "    setCatOverviewPer(2);",
  "    const ov = _deckPageList().filter(function (d) { return d.kind === 'catov'; });",
  "    if (ov.length !== 2) throw new Error('overview pages: ' + ov.length);",
  "    if (ov.map(_deckPageKey).join() !== 'catov:ART.1,catov:ART.1#2') throw new Error('keys: ' + ov.map(_deckPageKey).join());",
  "    const a = labels(await draw(0)).map(function (l) { return l.str; }).join(), b = labels(await draw(1)).map(function (l) { return l.str; }).join();",
  "    if (a !== 'OPTION 1,OPTION 2' || b !== 'OPTION 3,OPTION 4') throw new Error('page 1: ' + a + ' / page 2: ' + b);",
  "    const sub = texts(await draw(1)).find(function (o) { return o.str.indexOf('OPTIONS 3') === 0; });",
  "    if (!sub) throw new Error('page 2 does not say which options it holds');",
  "    setCatOverviewPer(0);",
  "    if (_deckPageList().filter(function (d) { return d.kind === 'catov'; }).length !== 1) throw new Error('All did not go back to one page');",
  "  });",
  "  await check('a split keeps ONE scale across its pages', async function () {",
  "    build();",
  "    setCatOverviewPer(2);",
  "    const w = function (ops) { return Math.min.apply(null, ops.filter(function (o) { return o.t === 'img'; }).map(function (o) { return o.a[2]; })); };",
  "    // Both pages carry a 24in frame (options 1-3); only page 2 carries the 48in one that sets the scale.",
  "    const p1 = w(await draw(0)), p2 = w(await draw(1));",
  "    if (Math.abs(p1 - p2) > 0.01) throw new Error('24in frames: ' + p1.toFixed(2) + ' vs ' + p2.toFixed(2));",
  "  });",
  "  await check('the PDF export emits the same split pages as Deck Studio (two builders, one rule)', async function () {",
  "    const s = APP_SRC;",
  "    const a = s.indexOf('const _stepsFor = (u, li) => {');",
  "    if (a < 0 || s.slice(a, s.indexOf('const _stepsFor0', a)).indexOf('_catOverviewDescs(ov)') < 0) throw new Error('the export does not emit every overview page');",
  "    const b = s.indexOf('const specPagesFor = (u) => {');",
  "    if (b < 0 || s.slice(b, s.indexOf('const _specPagesFor0', b)).indexOf('_catOverviewDescs(ov)') < 0) throw new Error('the studio does not emit every overview page');",
  "    if (s.indexOf('part: step.part || 0') < 0) throw new Error('the export does not pass the part to the renderer');",
  "  });",
  "  await check('renaming the placement carries a split page settings key with it', async function () {",
  "    editorialContent = _editorialDefaults();",
  "    editorialContent.pageFooters = { 'catov:ART.1#2': { x: 1 } };",
  "    _renamePageKeys('ART.1', 'ART.4');",
  "    if (!editorialContent.pageFooters['catov:ART.4#2']) throw new Error('keys: ' + Object.keys(editorialContent.pageFooters).join());",
  "  });",
  '  return out;',
  '})();',
].join(NL);
const quiet = console.error; console.error = () => {};
window.APP_SRC = APP;
window.eval(APP + NL + 'var APP_SRC = window.APP_SRC;' + NL + body);
console.error = quiet;
window.__res.then((results) => {
  const failed = results.filter(r => !r.ok);
  results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
  console.log(NL + '--- Summary ---');
  if (failed.length) console.log(failed.length + ' FAILURES');
  else console.log('ALL PASSED (' + results.length + ')');
});
