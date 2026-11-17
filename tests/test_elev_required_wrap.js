// 20.59: ELEVATION REQUIRED stamp that wraps lifts clear of the plan; clicking it in Deck Studio
// offers edit / remove / make a movable note. Setup copied from test_elev_required.js.
// (20.33 header follows)
// 20.33: ELEVATION REQUIRED. A wall the client has not sent an elevation for is ticked
// "Elevation required"; its wall pages and its sets' spec pages print the red stamp the
// studio uses ("ELEVATION REQUIRED" / "Artwork size to be confirmed"). Computed per page
// from the wall, never stored in editorialContent.annotations.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const any = new Proxy(function () {}, { get: (_, k) => k === Symbol.toPrimitive ? () => 0 : any, apply: () => any });
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({ measureText: (s) => ({ width: (s || '').length * 6 }) }, { get: (o, k) => (k in o ? o[k] : any), set: (o, k, v) => { o[k] = v; return true; } });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const block = `
    _autosaveToldUser = true;
    scheduleAutosave = () => {};
    window.__setup = (flag, note) => {
      elevations = [
        { id: 'w1', name: 'S1-01 MEETING', wallW: 144, wallH: 108, frames: [{ id: 'L3.ART.S1-01A', x: 20, y: 40, w: 30, h: 40 }, { id: 'L3.ART.S1-01B', x: 60, y: 40, w: 30, h: 40 }] },
        { id: 'w2', name: 'S1-02 CORRIDOR', wallW: 144, wallH: 108, frames: [{ id: 'L3.ART.S1-02', x: 20, y: 40, w: 30, h: 40 }] }
      ];
      if (flag) elevations[0].elevRequired = true;
      if (note) elevations[0].elevRequiredNote = note;
      editorialContent.annotations = {};
      currentElevIndex = 0;
      _wallFinishSync();
    };
    window.__drawn = (key) => {
      const out = [];
      const keep = _drawOneAnnotation;
      _drawOneAnnotation = (doc, a) => { out.push(a); };
      try { _drawAnnotations({}, key, 936, 540); } finally { _drawOneAnnotation = keep; }
      return out;
    };
    window.__annJson = () => JSON.stringify(editorialContent.annotations || {});
    window.__addAnn = (k, a) => { editorialContent.annotations[k] = [a]; };
    window.__menu = null; _frameMenu = (anchor, items) => { window.__menu = items; }; _dsRenderCenter = () => {}; switchView = (v, i) => { window.__view = [v, i]; };
    window.__api = { _elevReqStamps, _elevReqNoteLines, _elevReqMenu, _elevReqWallForKey, setElevRequired, CAT_WALL_FIELDS, get elevs() { return elevations; } };
  `;
  const quiet = console.error; console.error = () => {};
  window.eval(src + '\n' + block);
  console.error = quiet;
  const A = window.__api;
  const results = [];
  const check = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };


  const LONG = 'Only the vanity wall is drawn (AI5132-10 / 4): verify wall on site';
  const bottom = (d) => d[1].y + A._elevReqNoteLines(d[1].text, d[1].w) * 0.019 * 1.2;
  await check('EXACT ASK: a two-line note on a wall page ends clear of the plan thumbnail (by 0.60, plan at ~0.62)', async () => {
    window.__setup(true, LONG);
    if (A._elevReqNoteLines(LONG, 0.24) !== 2) throw new Error('lines ' + A._elevReqNoteLines(LONG, 0.24));
    ['spec:elevgrp:L3.ART.S1-01', 'spec:elev:0', 'ig:S1-01 MEETING'].forEach(k => {
      const d = window.__drawn(k);
      if (!(bottom(d) <= 0.60)) throw new Error(k + ' note ends at ' + bottom(d));
      if (!(d[0].y < 0.53)) throw new Error(k + ' did not lift: ' + d[0].y);
      if (!(d[0].y >= 0.5)) throw new Error(k + ' lifted into the legend: ' + d[0].y);
    });
  });
  await check('a one-line note sits at 0.53 with room above the plan; a spec page still grows down from the top', async () => {
    window.__setup(true, 'Client to confirm scope: display unit');
    const d = window.__drawn('spec:elev:0');
    if (d[0].y !== 0.53) throw new Error('moved: ' + d[0].y);
    if (!(bottom(d) <= 0.60)) throw new Error('one line ends at ' + bottom(d) + ', too close to the plan');
    window.__setup(true, LONG);
    const s = window.__drawn('spec:L3.ART.S1-01');
    if (s[0].y !== 0.05) throw new Error('spec moved: ' + s[0].y);
  });
  await check('a 48-character note (Ford EB) is one line, so the stamp does not lift for it', async () => {
    const n = A._elevReqNoteLines("Wall size from Ford's site photo: verify on site", 0.24);
    if (n !== 1) throw new Error('lines ' + n);
  });
  await check('the Deck Studio stamp is clickable and opens the menu', async () => {
    if (!/dataset\.elevReq[\s\S]{0,900}_elevReqMenu\(el, key\)/.test(src)) throw new Error('no click handler');
    window.__setup(true);
    A._elevReqMenu({}, 'ig:S1-01 MEETING');
    if (!window.__menu || window.__menu.length !== 3) throw new Error('menu ' + JSON.stringify(window.__menu));
  });
  await check('Edit opens that wall in Elevations', async () => {
    window.__setup(true);
    A._elevReqMenu({}, 'spec:elevgrp:L3.ART.S1-01');
    window.__menu[0].onClick();
    if (JSON.stringify(window.__view) !== '["elevation",0]') throw new Error(JSON.stringify(window.__view));
  });
  await check('Remove clears the flag and note on the wall', async () => {
    window.__setup(true, LONG);
    A._elevReqMenu({}, 'spec:elev:0');
    window.__menu[1].onClick();
    if ('elevRequired' in A.elevs[0] || 'elevRequiredNote' in A.elevs[0]) throw new Error(JSON.stringify(A.elevs[0]));
    if (window.__drawn('spec:elev:0').length) throw new Error('still stamped');
  });
  await check('Make it a movable note: two plain notes on this page only, and the computed stamp steps aside', async () => {
    window.__setup(true, LONG);
    A._elevReqMenu({}, 'ig:S1-01 MEETING');
    window.__menu[2].onClick();
    const own = JSON.parse(window.__annJson())['ig:S1-01 MEETING'] || [];
    if (own.length !== 2 || own.some(a => a._auto)) throw new Error(JSON.stringify(own));
    if (own[0].text !== 'ELEVATION REQUIRED' || own[1].text !== LONG) throw new Error(JSON.stringify(own.map(a => a.text)));
    const dr = window.__drawn('ig:S1-01 MEETING'); if (dr.length !== 2 || dr.some(a => a._auto)) throw new Error('page draws ' + dr.length + ' incl. computed: ' + JSON.stringify(dr.map(a => a._auto || 'own')));
    if (window.__drawn('spec:elev:0').length !== 2) throw new Error('other pages lost the stamp');
  });

  const bad = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
