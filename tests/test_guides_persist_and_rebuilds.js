// 19.39: THE GUIDES TRAVEL WITH THE PROJECT, AND A NO-OP NEVER REBUILDS THE DECK.
//
// Three reports from the Ford SLC install guide:
//   1. Reopening the project showed every elevation with its dimensions hidden: which
//      layers show lived only in the page, so a designer thought the mark-up was lost.
//   2. Thumbnails rebuilt "all the time": pressing M (the measure tool) or ticking an
//      edge gap re-saved the guide settings even when nothing changed, which dropped
//      every elevation capture and every page thumbnail in the deck.
//   3. Turning a guide on in the Elevations tab flashed the wall: the deck's selected
//      page was rebuilt in the background, its capture loaded walls in place on the
//      visible tab, and you were left on a different wall.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  const quiet = console.error; console.error = () => {};
  window.eval(src + `
    _autosaveToldUser = true; scheduleAutosave = () => {};
    window.__fx = {
      show: (lid) => { const l = document.getElementById(lid); return !!(l && l.style.display === 'block'); },
      setShown: (lid, on) => { const l = document.getElementById(lid); l.style.display = on ? 'block' : 'none'; },
      toggle: (lid, bid) => toggleElevLayer(lid, document.getElementById(bid)),
      guides: () => JSON.parse(JSON.stringify(editorialContent.elevGuides || null)),
      payload: () => JSON.stringify(_projectPayload()),
      open: (text) => _readProjectText(text),
      setGuidesField: (v) => { editorialContent.elevGuides = v; },
      // An INSTALL page's thumbnail: 19.43 refreshes only the pages that draw an elevation.
      seedThumb: () => { window.__ed = window.__ed || { kind: 'spec', type: 'install', _install: true, _specTpl: 'installGuide', row: {}, elev: {}, title: 'W', _ovKey: 'elev:0' }; _dsPages = [window.__ed]; _dsIndex = 0; _dsThumbCache[_dsThumbCacheKey(window.__ed)] = 'data:x'; },
      thumbAlive: () => !!_dsThumbCache[_dsThumbCacheKey(window.__ed)],
      saveDims: () => saveDimVisibility(),
      flipDim: (k) => { dimVisibility[k] = !dimVisibility[k]; },
      lineTool: (on) => toggleLineTool(on),
      queuePreviewClosed: () => {
        _dsPages = [{ kind: 'spec', type: 'install', _install: true, _specTpl: 'installGuide', row: {}, elev: {}, title: 'W' }];
        _dsIndex = 0; _dsPreviewQueued = false;
        _dsQueuePreview();
        return { queued: _dsPreviewQueued, timer: !!_dsPreviewTimer, open: _dsIsOpen() };
      },
    };
  `);
  console.error = quiet;
  const fx = window.__fx;
  const results = [];
  const check = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

  await check('EXACT BUG: turning layers on is written into the project', async () => {
    fx.setShown('dim-layer', false); fx.setShown('custom-lines-layer', false); fx.setShown('person-wrap', false);
    fx.toggle('dim-layer', 'dimToggle'); fx.toggle('custom-lines-layer', 'customLinesToggle'); fx.toggle('person-wrap', 'personToggle');
    const g = fx.guides();
    if (!g || !g.layers) throw new Error('nothing recorded: ' + JSON.stringify(g));
    ['dim-layer', 'custom-lines-layer', 'person-wrap'].forEach(l => { if (g.layers[l] !== true) throw new Error(l + ' not recorded as on'); });
    if (fx.payload().indexOf('"elevGuides"') < 0) throw new Error('the saved project does not carry it');
  });

  await check('EXACT BUG: opening the project puts the layers back on', async () => {
    const text = fx.payload();
    // A fresh session: everything hidden, as every page load starts.
    ['dim-layer', 'custom-lines-layer', 'person-wrap', 'guide-layer'].forEach(l => fx.setShown(l, false));
    fx.open(text);
    await new Promise(r => setTimeout(r, 50));
    ['dim-layer', 'custom-lines-layer', 'person-wrap'].forEach(l => { if (!fx.show(l)) throw new Error(l + ' is hidden after reopening'); });
    if (fx.show('guide-layer')) throw new Error('a layer that was off came back on');
  });

  await check('a project saved before 19.39 (no guide record) opens exactly as before', async () => {
    fx.setGuidesField(undefined);
    const text = fx.payload();
    fx.setShown('dim-layer', false);
    fx.open(text);
    await new Promise(r => setTimeout(r, 50));
    if (fx.show('dim-layer')) throw new Error('turned a layer on with nothing recorded');
  });

  await check('EXACT BUG: re-saving unchanged guide settings keeps every thumbnail', async () => {
    fx.saveDims();               // settle whatever is current
    fx.seedThumb();
    fx.saveDims();               // nothing changed
    if (!fx.thumbAlive()) throw new Error('a no-op save wiped the thumbnails');
    fx.lineTool(true); fx.lineTool(false);   // M: the measure-line layer is already on
    if (!fx.thumbAlive()) throw new Error('arming the measure tool wiped the thumbnails');
  });

  await check('a REAL guide change still rebuilds (else the check above proves nothing)', async () => {
    fx.seedThumb();
    fx.flipDim('wallDims');
    fx.saveDims();
    if (fx.thumbAlive()) throw new Error('a real change left stale thumbnails');
  });

  await check('EXACT BUG: no deck page is rebuilt in the background while the deck is closed', async () => {
    const r = fx.queuePreviewClosed();
    if (r.open) throw new Error('fixture: the deck is open');
    if (r.queued || r.timer) throw new Error('a background page build was queued with the deck closed');
  });

  const failed = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ' :: ' + r.err)));
  console.log(failed.length ? (failed.length + ' FAILED') : 'ALL PASSED (' + results.length + ')');
  process.exit(failed.length ? 1 : 0);
})();
