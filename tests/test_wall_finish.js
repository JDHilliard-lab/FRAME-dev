// 20.25: WALL FINISH on every wall page. Ford's Level 03 review (Hub 1B, Nov 4 2026):
// "Could we begin to add wall types on each elevation page? Would be helpful to know drywall,
// painted, wood, what wood color, etc to make frame decisions."
// A wall carries wallFinish (material) and wallFinishNote (colour / spec code). The wall's
// install page prints "WALL: WOOD · BLUE WD-11" under its subheading; a blank wall prints
// nothing; catalogue options inherit it from their mockup like the wall size.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, setTransform(){}, resetTransform(){} });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const block = `
    _autosaveToldUser = true;
    scheduleAutosave = () => {};
    window.__render = async (wall) => {
      elevations = [Object.assign({ id: 'w1', name: 'KITCHENETTE', wallW: 144, wallH: 108, frames: [{ id: 'ART-01', letter: 'A', x: 50, y: 37, w: 40, h: 30, active: true, dimTo: [] }] }, wall || {})];
      dashProjectData = [{ id: 'ART-01', location: 'Kitchenette', level: 0, extW: 40, extH: 30 }];
      floorplanLevels = [];
      editorialContent.installGuide = { legend: true };
      editorialContent.installNotes = { keys: {}, list: [], edits: {} };
      editorialContent.pageFooters = {};
      _igNoCapture = false; for (const k in _igCapCache) delete _igCapCache[k];
      _captureElevWithGuides = async () => ({ dataUrl: 'data:image/jpeg;base64,AAAA', w: 1400, h: 1000, vec: [], floorFrac: 0.97, wallRightFrac: 0.995 });
      const rec = new CanvasPdfRec(936, 540);
      const texts = [];
      const oText = rec.text;
      rec.text = function (s, x, y) { const str = Array.isArray(s) ? s.join(' ') : String(s); texts.push({ s: str, x, y }); return oText.apply(this, arguments); };
      _curFooter = _resolveFooter('spec:elev:0');
      await _drawInstallGuidePage(rec, {}, 1, { location: '', code: '', version: '' }, Object.assign({}, elevations[0], { _idx: 0, _ovKey: 'ig:KITCHENETTE' }), { PW: 936, PH: 540, M: 40 });
      return texts;
    };
    window.__ui = (wall) => {
      elevations = [Object.assign({ id: 'w1', name: 'A', wallW: 144, wallH: 108, frames: [] }, wall || {})];
      currentElevIndex = 0;
      _wallFinishSync();
      return { sel: document.getElementById('wallFinish'), note: document.getElementById('wallFinishNote') };
    };
    window.__set = (m, n) => {
      document.getElementById('wallFinish').value = m; document.getElementById('wallFinishNote').value = n;
      setElevWallFinish();
      return { f: elevations[0].wallFinish, n: elevations[0].wallFinishNote, has: 'wallFinish' in elevations[0] };
    };
    window.__catFields = () => CAT_WALL_FIELDS.slice();
    window.__ec = () => editorialContent;
    window.__elevs = () => elevations;
    window.__wfp = (on) => { if (on !== undefined) _setWallFinishPrints(on); return _wallFinishDeckPrints(); };
    window.__perWall = () => {
      elevations = [{ id: 'a', name: 'A', wallW: 100, wallH: 100, frames: [] }, { id: 'b', name: 'B', wallW: 100, wallH: 100, frames: [] }];
      currentElevIndex = 0;
      _setWallFinishPrints(true);
      _setWallFinishPrintsWall(false, elevations[0]);
      const r = { aOff: _wallFinishPrints(elevations[0]), bOn: _wallFinishPrints(elevations[1]), aStored: elevations[0].wallFinishPrint, bStored: elevations[1].wallFinishPrint };
      _setWallFinishPrints(true);
      r.afterAllOn = _wallFinishPrints(elevations[0]); r.leftover = 'wallFinishPrint' in elevations[0];
      _setWallFinishPrints(false);
      _setWallFinishPrintsWall(true, elevations[1]);
      r.deckOffWallOn = _wallFinishPrints(elevations[1]);
      _setWallFinishPrints(true);
      return r;
    };
    window.__reqAll = () => {
      elevations = [{ id: 'a', name: 'A', wallW: 100, wallH: 100, frames: [] }, { id: 'b', name: 'B', wallW: 100, wallH: 100, frames: [], underlay: { src: 'data:image/png;base64,AAAA', x: 0, y: 0, w: 10, h: 10 } }];
      _setElevRequiredAll(true);
      const r = { markedBare: elevations[0].elevRequired === true, markedWithUl: elevations[1].elevRequired === true };
      elevations[1].elevRequired = true;
      _setElevRequiredAll(false);
      r.afterClear = elevations.some(e => e.elevRequired);
      return r;
    };
    window.__ulOffer = () => new Promise((res) => {
      elevations = [{ id: 'a', name: 'A', wallW: 100, wallH: 100, frames: [], elevRequired: true }];
      currentElevIndex = 0;
      let asked = 0;
      const prevConfirm = showConfirmModal;
      showConfirmModal = (t, b, y, n, onYes) => { asked++; onYes && onYes(); };
      const OrigImage = window.Image;
      window.Image = function () { const im = {}; Object.defineProperty(im, 'src', { set() { setTimeout(() => im.onload && im.onload(), 0); } }); im.naturalWidth = 50; im.naturalHeight = 50; return im; };
      importElevUnderlay(new window.Blob(['x'], { type: 'image/png' }));
      setTimeout(() => { showConfirmModal = prevConfirm; window.Image = OrigImage; res({ asked, still: elevations[0].elevRequired === true }); }, 120);
    });
  `;
  const quiet = console.error; console.error = () => {};
  window.eval(src + '\n' + block);
  console.error = quiet;
  const results = [];
  const check = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

  await check('EXACT ASK: a wood wall with a colour prints "WALL: WOOD · BLUE WD-11" on its page, under the subheading', async () => {
    const t = await window.__render({ wallFinish: 'Wood', wallFinishNote: 'Blue WD-11' });
    const line = t.find(x => x.s === 'WALL: WOOD · BLUE WD-11');
    if (!line) throw new Error('not printed; texts: ' + JSON.stringify(t.map(x => x.s).slice(0, 12)));
    const sub = t.find(x => /ELEVATION DETAIL/.test(x.s));
    if (!sub) throw new Error('no subheading');
    if (!(line.y > sub.y)) throw new Error('finish line at y ' + line.y + ' is not under the subheading at ' + sub.y);
  });
  await check('a wall with no finish prints no WALL: line', async () => {
    const t = await window.__render({});
    if (t.some(x => /^WALL:/.test(x.s))) throw new Error('printed ' + t.find(x => /^WALL:/.test(x.s)).s);
  });
  await check('a spec code alone still prints (WALL: PT-1)', async () => {
    const t = await window.__render({ wallFinishNote: 'PT-1' });
    if (!t.some(x => x.s === 'WALL: PT-1')) throw new Error('missing');
  });
  await check('the wall panel shows the wall\'s finish and writes it back; clearing removes the keys', async () => {
    const u = window.__ui({ wallFinish: 'Painted drywall', wallFinishNote: 'White' });
    if (u.sel.value !== 'Painted drywall') throw new Error('select shows ' + JSON.stringify(u.sel.value));
    if (u.note.value !== 'White') throw new Error('note shows ' + JSON.stringify(u.note.value));
    let r = window.__set('Wood', 'Walnut');
    if (r.f !== 'Wood' || r.n !== 'Walnut') throw new Error(JSON.stringify(r));
    r = window.__set('', '');
    if (r.has || r.n !== undefined) throw new Error('blank left keys behind: ' + JSON.stringify(r));
  });
  await check('a finish not in the list (from an older file) still shows in the select', async () => {
    const u = window.__ui({ wallFinish: 'Cork' });
    if (u.sel.value !== 'Cork') throw new Error('select shows ' + JSON.stringify(u.sel.value));
  });
  await check('catalogue options inherit the finish from their mockup, like the wall size', async () => {
    const f = window.__catFields();
    if (f.indexOf('wallFinish') < 0 || f.indexOf('wallFinishNote') < 0) throw new Error(JSON.stringify(f));
  });

  // 20.40: one deck-wide switch. Off hides the line on every wall page and keeps the data;
  // the Elevation tab box and the saved project both carry it; an older file prints as before.
  await check('20.40: Print on pages OFF hides the WALL: line and keeps the wall\'s finish', async () => {
    window.__wfp(false);
    try {
      const t = await window.__render({ wallFinish: 'Wood', wallFinishNote: 'WD-1' });
      if (t.some(x => /^WALL:/.test(x.s))) throw new Error('still printed ' + t.find(x => /^WALL:/.test(x.s)).s);
      if (window.__elevs()[0].wallFinishNote !== 'WD-1') throw new Error('turning printing off cleared the wall\'s finish');
      if (window.__ec().wallFinishPrint !== false) throw new Error('the switch is not stored with the project (editorialContent)');
      window.__ui({ wallFinish: 'Wood' });
      if (document.getElementById('wallFinishPrint').checked) throw new Error('the Elevation tab box does not show the switch is off');
    } finally { window.__wfp(true); }
    const t2 = await window.__render({ wallFinish: 'Wood', wallFinishNote: 'WD-1' });
    if (!t2.some(x => x.s === 'WALL: WOOD · WD-1')) throw new Error('turning it back on did not bring the line back');
    if ('wallFinishPrint' in window.__ec()) throw new Error('ON should leave no key, like an older file');
  });
  await check('20.41: the Wall tab has a per-wall Print tick wired to this wall', async () => {
    window.__ui({});
    const cb = document.getElementById('wallFinishPrint');
    if (!cb || !cb.checked) throw new Error('no Print box, or it starts off');
    if (!cb.closest('[data-elevtabpane="wall"]')) throw new Error('the Print box is not on the Wall tab');
    // jsdom does not run inline handlers here, so check the wiring and drive the setter it calls.
    if ((cb.getAttribute('onchange') || '').indexOf('_setWallFinishPrintsWall(this.checked)') < 0) throw new Error('the box is not wired to the per-wall setter');
    window.__wfp(false); const off = cb.checked; window.__wfp(true);
    if (off) throw new Error('the box did not follow All walls turning off');
    if (!cb.checked) throw new Error('the box did not follow All walls turning back on');
  });
  await check('20.41: one wall can hide its finish while the others print, and All walls overrides both ways', async () => {
    window.__wfp(true);
    const r = window.__perWall();
    if (r.aOff !== false) throw new Error('turning wall A off did not stick: ' + r.aOff);
    if (r.bOn !== true) throw new Error('wall B stopped printing when only A was turned off');
    if (r.aStored !== false || r.bStored !== undefined) throw new Error('stored per-wall values wrong: ' + JSON.stringify(r));
    if (r.afterAllOn !== true || r.leftover) throw new Error('All walls on did not clear wall A\'s own choice');
    if (r.deckOffWallOn !== true) throw new Error('a wall ticked ON under a deck OFF did not print');
    const t = await window.__render({ wallFinish: 'Wood', wallFinishNote: 'WD-1', wallFinishPrint: false });
    if (t.some(x => /^WALL:/.test(x.s))) throw new Error('a wall turned off still printed its finish');
  });
  await check('20.41: All walls for Elevation required marks only walls with no client elevation, and clears all', async () => {
    const r = window.__reqAll();
    if (!r.markedBare || r.markedWithUl) throw new Error('mark-all result wrong: ' + JSON.stringify(r));
    if (r.afterClear) throw new Error('clear-all left a wall marked');
  });
  await check('20.41: adding a client elevation to a wall marked Elevation required offers to untick it', async () => {
    const r = await window.__ulOffer();
    if (r.asked !== 1) throw new Error('asked ' + r.asked + ' times');
    if (r.still) throw new Error('Untick did not clear Elevation required');
  });
  await check('20.41: wall type, client elevation, required, finish and paint are all on the Wall tab; size stays above', async () => {
    const pane = document.querySelector('[data-elevtabpane="wall"]');
    ['artWallBtn', 'egdWallBtn', 'wfWallBtn', 'sec-underlay', 'underlayControls', 'elevRequired', 'elevRequiredAll', 'wallFinish', 'wallFinishNote', 'wallFinishPrintAll', 'wallColorRow'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) throw new Error('#' + id + ' missing');
      if (!pane.contains(el)) throw new Error('#' + id + ' is not on the Wall tab');
    });
    if (pane.contains(document.getElementById('wallW'))) throw new Error('wall size moved into the tab; it should stay above');
    if (document.querySelector('[data-elevtabpane="context"] #sec-underlay')) throw new Error('client elevation still on Context');
  });

  const bad = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
