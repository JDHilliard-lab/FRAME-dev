// AN OPTION'S DASHBOARD ROW TAKES THE MOCKUP SLOT'S SPEC, NOT ONLY ITS FRAME (17.98).
//  "when adding an option different frame count and images you can see its not rendering
//   properly in the preview but is correct in the elevations and elevation detail in the
//   spec page"
// _catSyncOption kept the option's elevation FRAMES in step with the mockup and left the
// option's ROWS as they were cloned. The spec text, the group page's artwork mockups and
// the CSV all read the row, so changing a slot's size or mats after the options existed
// (or giving a new frame set its own sizes) printed the old piece on every option page
// while the wall drew the new one.
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
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
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

    const slotRowOf = (wall, L) => { const f = wall.frames.filter(x => x.letter === L)[0]; return dashProjectData.filter(r => r.id === f.id)[0]; };
    const editRow = (r, vals) => { Object.assign(r, vals); pushUpdatesToElevations(dashProjectData.indexOf(r)); };
    const wallOf = code => elevations.filter(e => _catBaseCode(e) === code && _isCatalogueMaster(e))[0];
    const optOf = name => elevations.filter(e => e.name === name)[0];

    __check('EXACT BUG: a new frame set given its own sizes prints those sizes on its option spec page', () => {
      project();
      kind('images'); kind('setNew', 'Salon');
      const mB = wallOf('ART.1B');
      if (!mB) throw new Error('no set 2: ' + walls());
      // The designer resizes set 2 in the dashboard, after its option already exists.
      editRow(slotRowOf(mB, 'A'), { extW: 40, extH: 30, m1T: 4, m1B: 4, m1L: 4, m1R: 4, fCode: 'MICH 41-35' });
      const opt = _catOptionsOf(mB)[0];
      _deckPageList();
      const fr = opt.frames.filter(f => f.letter === 'A')[0];
      const r = dashProjectData.filter(x => x.id === fr.id)[0];
      if (Math.abs(fr.w - 40) > 0.01) throw new Error('setup: the option frame did not follow (' + fr.w + ')');
      if (parseFloat(r.extW) !== 40 || parseFloat(r.extH) !== 30) throw new Error('option row still ' + r.extW + ' x ' + r.extH + ' while the wall draws 40 x 30');
      if (r.fCode !== 'MICH 41-35' || parseFloat(r.m1T) !== 4) throw new Error('moulding/mats did not follow: ' + r.fCode + ' ' + r.m1T);
      const spec = JSON.stringify(buildSpecStrings(r));
      if (spec.indexOf('40') < 0) throw new Error('spec text does not carry the new size: ' + spec.slice(0, 300));
    });

    __check('an option keeps what it OWNS: its artwork, image code and notes survive the mirror', () => {
      project();
      kind('images');
      const m = wallOf('ART.1');
      const opt = _catOptionsOf(m)[1] || _catOptionsOf(m)[0];
      const fr = opt.frames[0];
      const r = dashProjectData.filter(x => x.id === fr.id)[0];
      r.artworkUrl = 'data:image/png;base64,AAAA'; r.imageCode = 'IMG-9'; r.notes = 'its own note';
      editRow(slotRowOf(m, fr.letter), { extW: 33 });
      _deckPageList();
      if (parseFloat(r.extW) !== 33) throw new Error('size did not follow: ' + r.extW);
      if (r.artworkUrl !== 'data:image/png;base64,AAAA' || r.imageCode !== 'IMG-9' || r.notes !== 'its own note') throw new Error('the option lost what it owns');
      if (r.id !== fr.id) throw new Error('the row id moved');
    });

    __check("a LAYOUT option follows the set primary spec through the layout slot row", () => {
      project();
      kind('images'); kind('arrangeNew', 'Rearranged');
      const mA = wallOf('ART.1'), mB = wallOf('ART.1B');
      if (!mB) throw new Error('no layout B: ' + walls());
      editRow(slotRowOf(mA, 'B'), { extW: 19, extH: 27 });
      _deckPageList();
      const lr = slotRowOf(mB, 'B');
      if (parseFloat(lr.extW) !== 19) throw new Error('layout slot row still ' + lr.extW);
      const opt = _catOptionsOf(mB)[0];
      const fr = opt.frames.filter(f => f.letter === 'B')[0];
      const r = dashProjectData.filter(x => x.id === fr.id)[0];
      if (parseFloat(r.extW) !== 19 || parseFloat(r.extH) !== 27) throw new Error('layout option row still ' + r.extW + ' x ' + r.extH);
      // And the layout's POSITION is still its own.
      const fa = mA.frames.filter(f => f.letter === 'B')[0], fb = mB.frames.filter(f => f.letter === 'B')[0];
      fb.x = fa.x + 50; _deckPageList();
      if (fb.x === fa.x) throw new Error('the layout lost its position');
    });

    __check("a frame set sizes do NOT reach the other set options", () => {
      project();
      kind('images'); kind('setNew', 'Salon');
      const mA = wallOf('ART.1'), mB = wallOf('ART.1B');
      editRow(slotRowOf(mB, 'A'), { extW: 51 });
      _deckPageList();
      _catOptionsOf(mA).forEach(o => o.frames.forEach(f => {
        const r = dashProjectData.filter(x => x.id === f.id)[0];
        if (parseFloat(r.extW) === 51) throw new Error(r.id + ' took set 2 sizes');
      }));
    });
  `;
  try {
    window.__appSrc = src;
    window.eval(src + '\n' + testBlock);
  } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = window.__testResults || [];
  const failures = results.filter(r => !r.ok);
  results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' -> ' + r.err); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
