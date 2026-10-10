// The plan legend labels a catalogue PLACEMENT (ART.1), with its layouts (ART.1B-A...)
// and image options (ART.1.2A...) filtered off the plan. Listed as "not done yet" in
// the notes; 17.97's spelling resolved it, and this pins it so it stays resolved.
// AN ALTERNATE ARRANGEMENT SAYS SO ON ITS BREAKER, AND AN OPTION PAGE SAYS WHICH OPTION (17.99).
//  "when I do an option with same frames new arrangement or different frame count and
//   images and then the breaker page.. should that get an additional title like alternate
//   layout some short title that lets people know this is an alternate set/layout for the
//   placement"
// The breaker for ART.1B read ELEVATION DETAIL · B, and the letter told a client nothing.
// Now: the original reads ELEVATION DETAIL, a re-hang of the same frames ALTERNATE LAYOUT,
// a different set of frames ALTERNATE FRAME SET, each with the designer's name after a
// dot. An option's group page carries OPTION n (plus the alternate kind) as its subheading.
// NO REGEX IN THIS FILE: patterns in a test block lose their backslashes.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // A canvas context that answers ANY call: the per-piece page reaches far more of the 2D
  // API than the group page, and a hand-listed stub fails on the first method it forgot.
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => {
    if (k in t) return t[k];
    // NOT thenable: answering 'then' makes every await on a context hang forever.
    if (k === 'then' || typeof k === 'symbol') return undefined;
    if (k === 'measureText') return (str) => ({ width: String(str || '').length * 6 });
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
    return () => {};
  } });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.Path2D = function () { return new Proxy({}, { get: (t, k) => (k === 'then' || typeof k === 'symbol') ? undefined : () => {} }); };
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    window.__done = (async () => {
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _toast = function () { return null; };
    const __realConfirm = showConfirmModal;
    showConfirmModal = function () { __realConfirm.apply(this, arguments); const y = document.querySelector('#infoModalButtons button'); if (y) y.click(); };
    const slot = (id, letter, x) => ({ id: id, letter: letter, w: 24, h: 30, x: x, y: 48, fW: 1, fType: 'color', fColor: '#111', fCode: 'BLK',
      m1A: true, m1: 2, product: 'Framed Art', artworkUrl: '', imageCode: '', active: true, dimTo: [], distToggles: {} });
    const row = (id, extra) => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), { id: id, qty: 0, product: 'Framed Art', extW: 24, extH: 30, level: 0, notes: 'was ' + id }, extra || {});
    // The reported shape: a three-piece placement ART.1 (A B C), with plain codes either side.
    const project = (withNeighbours) => {
      elevations.length = 0; dashProjectData.length = 0;
      editorialContent = _editorialDefaults();
      if (withNeighbours) { dashProjectData.push(row('ART.2')); }
      ['A', 'B', 'C'].forEach(L => dashProjectData.push(row('ART.1' + L)));
      if (withNeighbours) { dashProjectData.push(row('ART.3')); }
      elevations.push({ id: _elevNewId(), name: 'ART.1', wallW: 185, wallH: 108, personPos: { x: -60 },
        frames: [slot('ART.1A', 'A', 40), slot('ART.1B', 'B', 80), slot('ART.1C', 'C', 120)] });
      currentElevIndex = 0; currentView = 'elevation';
      undoStack.length = 0; redoStack.length = 0; _isFirstHistoryPush = true;
      return elevations[0];
    };
    const walls = () => elevations.map(e => e.name).join();
    const options = () => elevations.filter(e => e.catalogueOption).map(e => e.name + '=' + e.catalogueOption).join();
    const optIds = () => dashProjectData.filter(r => r.id.indexOf('ART.1.') === 0).map(r => r.id).join();
    const kind = (k, label) => _catAddOptionOfKind(elevations.indexOf(elevations.filter(e => _isCatalogueMaster(e))[0] || elevations[0]), k, label);

    const wallOf = code => elevations.filter(e => _catBaseCode(e) === code && _isCatalogueMaster(e))[0];
    const fnBody = (name) => { const S = window.__appSrc; const i = S.indexOf('function ' + name + '('); const j = S.indexOf(String.fromCharCode(10) + '}', i); return S.slice(i, j); };
    const groupSubText = async (opt) => {
      const rows = opt.frames.map(f => dashProjectData.filter(r => r.id === f.id)[0]).filter(Boolean);
      const rec = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(rec, {}, 4, {}, { rep: rows[0], members: rows, key: opt.name }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      return rec.ops.filter(o => o.t === 'text').map(o => String(o.str)).join(' | ');
    };

    __check('the plan shows ONE pin per placement, keyed by the placement code (ART.1), not by an arrangement', () => {
      project(true);
      kind('images'); kind('arrangeNew', ''); kind('setNew', 'Salon hang'); kind('images');
      _catSyncAllOptions();
      dashProjectData.forEach(r => { r.planPins = [{ lv: 0, x: 0.5, y: 0.5 }]; r.planX = 0.5; r.planY = 0.5; });
      _codesSettle(); _catSyncAllOptions();
      const gs = _fpGroups(0);
      const art1 = gs.filter(g => g.key.indexOf('ART.1') === 0);
      if (art1.length !== 1) throw new Error('expected one ART.1 group on the plan, got ' + art1.map(g => g.key).join(', '));
      if (art1[0].key !== 'ART.1') throw new Error('the legend reads ' + art1[0].key + ' instead of the placement ART.1');
      if (art1[0].ids.some(id => id.indexOf('ART.1.') === 0 || id.indexOf('-') >= 0)) throw new Error('an option or alternate arrangement row joined the placement group: ' + art1[0].ids.join(', '));
      if (!gs.some(g => g.key === 'ART.2') || !gs.some(g => g.key === 'ART.3')) throw new Error('the neighbours lost their pins');
    });

    __check('the plan shows ONE pin per placement, keyed by the placement code (ART.1), not by an arrangement', () => {
      project(true);
      kind('images'); kind('arrangeNew', ''); kind('setNew', 'Salon hang'); kind('images');
      _catSyncAllOptions();
      dashProjectData.forEach(r => { r.planPins = [{ lv: 0, x: 0.5, y: 0.5 }]; r.planX = 0.5; r.planY = 0.5; });
      _codesSettle(); _catSyncAllOptions();
      const gs = _fpGroups(0);
      const art1 = gs.filter(g => g.key.indexOf('ART.1') === 0);
      if (art1.length !== 1) throw new Error('expected one ART.1 group on the plan, got ' + art1.map(g => g.key).join(', '));
      if (art1[0].key !== 'ART.1') throw new Error('the legend reads ' + art1[0].key + ' instead of the placement ART.1');
      if (art1[0].ids.some(id => id.indexOf('ART.1.') === 0 || id.indexOf('-') >= 0)) throw new Error('an option or alternate arrangement row joined the placement group: ' + art1[0].ids.join(', '));
      if (!gs.some(g => g.key === 'ART.2') || !gs.some(g => g.key === 'ART.3')) throw new Error('the neighbours lost their pins');
    });

})();
  `;
  try {
    window.__appSrc = src;
    window.eval(src + '\n' + testBlock);
    await window.__done;
  } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = window.__testResults || [];
  const failures = results.filter(r => !r.ok);
  results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' -> ' + r.err); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
