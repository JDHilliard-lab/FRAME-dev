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
    window.__api = { _elevReqStamps, _elevReqWallForKey, setElevRequired, CAT_WALL_FIELDS, get elevs() { return elevations; } };
  `;
  const quiet = console.error; console.error = () => {};
  window.eval(src + '\n' + block);
  console.error = quiet;
  const A = window.__api;
  const results = [];
  const check = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

  await check('EXACT ASK: a ticked wall\'s spec page prints ELEVATION REQUIRED / Artwork size to be confirmed, red, top right', async () => {
    window.__setup(true);
    const d = window.__drawn('spec:L3.ART.S1-01');
    if (d.length !== 2) throw new Error('drew ' + d.length + ' notes');
    if (d[0].text !== 'ELEVATION REQUIRED' || d[1].text !== 'Artwork size to be confirmed') throw new Error(JSON.stringify(d.map(a => a.text)));
    if (!/^#e00000$/i.test(d[0].color)) throw new Error('not red: ' + d[0].color);
    if (d[0].align !== 'right' || !(d[0].x + d[0].w > 0.9) || !(d[0].y < 0.1)) throw new Error('not top right: ' + JSON.stringify(d[0]));
  });
  await check('the wall\'s own pages (breaker, install, elevation) are stamped, in the title column', async () => {
    window.__setup(true);
    ['spec:elevgrp:L3.ART.S1-01', 'spec:elev:0', 'ig:S1-01 MEETING'].forEach(k => {
      const d = window.__drawn(k);
      if (d.length !== 2) throw new Error(k + ' drew ' + d.length);
      if (d[0].align !== 'left' || !(d[0].x < 0.05)) throw new Error(k + ' not in the title column: ' + JSON.stringify(d[0]));
    });
  });
  await check('another wall\'s pages and other pages are not stamped', async () => {
    window.__setup(true);
    ['spec:L3.ART.S1-02', 'spec:elevgrp:L3.ART.S1-02', 'spec:elev:1', 'ig:S1-02 CORRIDOR', 'layout:p1', 'cover'].forEach(k => {
      if (window.__drawn(k).length) throw new Error(k + ' stamped');
    });
  });
  await check('unticked, nothing prints; the stamp is never stored on the page', async () => {
    window.__setup(false);
    if (window.__drawn('spec:L3.ART.S1-01').length) throw new Error('stamped while off');
    window.__setup(true);
    window.__drawn('spec:L3.ART.S1-01');
    const stored = window.__annJson();
    if (/ELEVATION REQUIRED/.test(stored)) throw new Error('stored: ' + stored);
  });
  await check('the designer\'s own second line replaces the default', async () => {
    window.__setup(true, 'Artwork size + location to be confirmed');
    const d = window.__drawn('spec:L3.ART.S1-01');
    if (d[1].text !== 'Artwork size + location to be confirmed') throw new Error(d[1] && d[1].text);
  });
  await check('a page that already has a hand-made ELEVATION REQUIRED note gets no second one', async () => {
    window.__setup(true);
    window.__addAnn('spec:L3.ART.S1-01', { type: 'note', text: 'ELEVATION REQUIRED', x: 0.5, y: 0.05 });
    const d = window.__drawn('spec:L3.ART.S1-01');
    if (d.length !== 1) throw new Error('drew ' + d.length + ' (hand-made plus auto?)');
  });
  await check('the checkbox writes the flag and note to the wall; unticking deletes both keys', async () => {
    window.__setup(false);
    document.getElementById('elevRequired').checked = true;
    document.getElementById('elevRequiredNote').value = 'Location to be confirmed';
    A.setElevRequired();
    if (A.elevs[0].elevRequired !== true || A.elevs[0].elevRequiredNote !== 'Location to be confirmed') throw new Error(JSON.stringify(A.elevs[0]));
    if (document.getElementById('elevRequiredNote').style.display === 'none') throw new Error('note box hidden while ticked');
    document.getElementById('elevRequired').checked = false;
    document.getElementById('elevRequiredNote').value = '';
    A.setElevRequired();
    if ('elevRequired' in A.elevs[0] || 'elevRequiredNote' in A.elevs[0]) throw new Error('keys kept');
  });
  await check('Deck Studio shows the stamp on the page preview', async () => {
    if (!/_elevReqStamps\(key\)\.forEach\(a => \{[\s\S]{0,200}dataset\.elevReq/.test(src)) throw new Error('preview overlay missing');
  });
  await check('catalogue options inherit the flag from their wall', async () => {
    if (A.CAT_WALL_FIELDS.indexOf('elevRequired') < 0 || A.CAT_WALL_FIELDS.indexOf('elevRequiredNote') < 0) throw new Error(JSON.stringify(A.CAT_WALL_FIELDS));
  });

  const bad = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
