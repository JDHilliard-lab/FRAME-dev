// OPTIONS ARE OPTION 1, 2, 3 INSIDE THEIR PLACEMENT; EVERY ARRANGEMENT GETS A BREAKER
// FOLLOWED BY ITS OPTIONS; A PLACEMENT WITH OPTIONS RENUMBERS LIKE ANY OTHER (17.97).
//  "during a project placements get removed or added so its always a pain re ordering
//   the numbers manually. Also, when making options for placements, can we make sure they
//   stay within that group as an option 1, option 2, option 3 and so on."
//  "I will usually have an elevation breaker page showing the artwork as greyed out and
//   labeled a, b, c then followed by the spec pages showing each option of different
//   images per set option. Options also include totally different frame arrangements, so
//   they would get their own elevation breaker page."
// Chosen: the option number is IN the code (ART.1.1, ART.1.2, ART.1.3), arrangements are
// letters (ART.1, ART.1B), and the frame set an arrangement belongs to is stored on the
// wall. Before: image options and frame sets shared one number line (ART.1.1 images,
// ART.1.2 frames, ART.1.3 images), deleting an option left a gap and orphaned its rows,
// and rows sat in creation order so ART.1.3 printed under frame set 2's breaker.
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

    __check('EXACT ASK: the first option of a placement is Option 1, ART.1.1', () => {
      project();
      kind('images');
      if (options() !== 'ART.1.1=1,ART.1.2=2') throw new Error(options());
      if (optIds().indexOf('ART.1.1A,ART.1.1B,ART.1.1C,ART.1.2A') !== 0) throw new Error(optIds());
    });

    __check('EXACT BUG: a different frame arrangement is a LETTER, and options keep counting 1, 2, 3 across the placement', () => {
      project();
      kind('images');                         // option 1 (the original pictures) + option 2
      kind('setNew', 'Triptych');             // arrangement B, a different set of frames, its own option
      kind('images');                         // another option on arrangement A
      const m = elevations.filter(e => _isCatalogueMaster(e)).map(e => _catBaseCode(e) + (e.catalogueSet ? '/set' + e.catalogueSet : '')).join();
      if (m !== 'ART.1,ART.1B/set2') throw new Error('arrangements ' + m);
      // Tree order: A's three options, then B's one. No shared number line, no gap.
      if (walls() !== 'ART.1,ART.1.1,ART.1.2,ART.1.3,ART.1B,ART.1.4') throw new Error('walls ' + walls());
      if (options() !== 'ART.1.1=1,ART.1.2=2,ART.1.3=3,ART.1.4=4') throw new Error(options());
      const b = elevations.filter(e => e.name === 'ART.1.4')[0];
      if (_catMasterOf(b) !== elevations.filter(e => _catBaseCode(e) === 'ART.1B')[0]) throw new Error('option 4 is not under arrangement B');
    });

    __check('EXACT ASK: each arrangement is a greyed, lettered breaker followed by its own options in order', () => {
      project();
      kind('images'); kind('setNew', 'Triptych'); kind('images');
      editorialContent.elevBreakers = true;
      const pages = _deckPageList().filter(p => p && (p.kind === 'spec' || p.kind === 'breaker' || p._install || p._breaker));
      const seq = pages.map(p => (p._install || p.kind === 'breaker' || p._breaker) ? ('BRK:' + (p.title || '')) : (p.title || (p.row && p.row.id) || '')).join(' | ');
      const iB1 = seq.indexOf('BRK'), iB2 = seq.indexOf('BRK', iB1 + 3);
      if (iB1 < 0 || iB2 < 0) throw new Error('expected two breakers: ' + seq);
      const first = seq.slice(iB1, iB2), second = seq.slice(iB2);
      ['ART.1.1', 'ART.1.2', 'ART.1.3'].forEach(k => { if (first.indexOf(k) < 0) throw new Error(k + ' is not under arrangement A: ' + seq); });
      if (second.indexOf('ART.1.4') < 0 || first.indexOf('ART.1.4') >= 0) throw new Error('option 4 is not under arrangement B: ' + seq);
      if (first.indexOf('ART.1.1') > first.indexOf('ART.1.2') || first.indexOf('ART.1.2') > first.indexOf('ART.1.3')) throw new Error('options out of order: ' + seq);
      if (!_elevIsWireframe(elevations.filter(e => _catBaseCode(e) === 'ART.1B')[0])) throw new Error('the arrangement breaker is not greyed out');
    });

    __check('a new arrangement with no images still gets an option, so it gets a breaker and pages', () => {
      project();
      kind('images'); kind('arrangeNew', 'Salon');
      const mB = elevations.filter(e => _catBaseCode(e) === 'ART.1B')[0];
      if (!mB) throw new Error('no arrangement B: ' + walls());
      if (_catOptionsOf(mB).length !== 1) throw new Error('arrangement B has ' + _catOptionsOf(mB).length + ' options');
    });

    __check('EXACT ASK: deleting an option removes its pieces and the rest renumber with no gap', () => {
      project();
      kind('images'); kind('images');
      if (options() !== 'ART.1.1=1,ART.1.2=2,ART.1.3=3') throw new Error('setup ' + options());
      dashProjectData.filter(r => r.id === 'ART.1.3A')[0].notes = 'third option';
      _deleteElevationNow(elevations.findIndex(e => e.name === 'ART.1.2'));
      if (options() !== 'ART.1.1=1,ART.1.2=2') throw new Error(options());
      if (dashProjectData.some(r => r.id.indexOf('ART.1.3') === 0)) throw new Error('rows left behind: ' + optIds());
      const moved = dashProjectData.filter(r => r.id === 'ART.1.2A')[0];
      if (!moved || moved.notes !== 'third option') throw new Error('option 3 did not become option 2');
      const w = elevations.filter(e => e.name === 'ART.1.2')[0];
      if (!w || w.frames[0].id !== 'ART.1.2A') throw new Error('the wall did not follow');
    });

    __check('EXACT ASK: a placement with options renumbers as a whole when a code before it goes', () => {
      project(true);   // ART.2, ART.1 (catalogue), ART.3
      kind('images');
      // Rename the catalogue to sit at 2 and the plain ones at 1 and 3, then delete ART.1.
      _codesSettle();
      if (dashProjectData.map(r => r.id).indexOf('ART.1A') < 0) throw new Error('setup ' + dashProjectData.map(r => r.id));
      const plain1 = dashProjectData.filter(r => r.id === 'ART.2')[0];
      _codesMovePlacement('ART.2', 1);
      if (plain1.id !== 'ART.1') throw new Error('plain did not move to 1: ' + plain1.id);
      const optRow = dashProjectData.filter(r => r.notes === 'was ART.1A' && !_catOptionRowIds()[r.id])[0];
      if (!optRow || optRow.id !== 'ART.2A') throw new Error('the catalogue slots did not move to 2: ' + (optRow && optRow.id));
      if (options() !== 'ART.2.1=1,ART.2.2=2') throw new Error('options did not follow: ' + options());
      dashSelectedRowIndex = dashProjectData.indexOf(plain1);
      deleteDashRow();
      if (options() !== 'ART.1.1=1,ART.1.2=2') throw new Error('options after delete: ' + options());
      if (!dashProjectData.some(r => r.id === 'ART.2' && r.notes === 'was ART.3')) throw new Error('ART.3 did not close up: ' + dashProjectData.map(r => r.id));
      if (dashProjectData.map(r => r.id).join().indexOf('ART.1A,ART.1B,ART.1C') !== 0) throw new Error('order ' + dashProjectData.map(r => r.id));
    });

    __check('a project written before 17.97 converts once: frame set ART.1.2 becomes ART.1B, options renumber', () => {
      project();
      // The old spelling, built by hand: set 2 slots ART.1.2-A.., its option ART.1.2.1A..,
      // and set 1's option ART.1.1A.. (the shared number line).
      const m = elevations[0]; m.catalogueMaster = true;
      const set2 = { id: _elevNewId(), name: 'ART.1.2', wallW: 185, wallH: 108, personPos: { x: -60 }, catalogueMaster: true,
        frames: [slot('ART.1.2-A', 'A', 60)] };
      const o1 = { id: _elevNewId(), name: 'ART.1.1', wallW: 185, wallH: 108, catalogueOption: '1', variationOfId: m.id,
        frames: ['A', 'B', 'C'].map((L, i) => slot('ART.1.1' + L, L, 40 + i * 40)) };
      const o2 = { id: _elevNewId(), name: 'ART.1.2.1', wallW: 185, wallH: 108, catalogueOption: '1', variationOfId: set2.id,
        frames: [slot('ART.1.2.1A', 'A', 60)] };
      elevations.push(set2, o1, o2);
      ['ART.1.2-A', 'ART.1.1A', 'ART.1.1B', 'ART.1.1C', 'ART.1.2.1A'].forEach(id => dashProjectData.push(row(id)));
      _codesSettle();
      if (set2.catalogueSet !== 2 || _catBaseCode(set2) !== 'ART.1B') throw new Error('set 2 is ' + _catBaseCode(set2) + ' set ' + set2.catalogueSet);
      if (options() !== 'ART.1.1=1,ART.1.2=2') throw new Error(options());
      if (walls() !== 'ART.1,ART.1.1,ART.1B,ART.1.2') throw new Error(walls());
      if (!dashProjectData.some(r => r.id === 'ART.1.2A' && r.notes === 'was ART.1.2.1A')) throw new Error('set 2 option rows: ' + optIds());
    });

    __check('the wall rail badges each option OPTION n', () => {
      project(); kind('images');
      renderWallRail();
      const t = Array.prototype.map.call(document.querySelectorAll('#nav-tabs-container .wall-tab'), x => x.textContent).join(' | ');
      if (t.indexOf('OPTION 1') < 0 || t.indexOf('OPTION 2') < 0) throw new Error(t);
    });

    __check('typing a new number on an option row moves the whole placement; anything else is refused', () => {
      project(true); kind('images'); _codesSettle();
      const i = dashProjectData.findIndex(r => r.id === 'ART.2.1A');
      const inp = document.createElement('input'); inp.value = 'ART.9.1A';
      _codesCommitRowId(i, inp);
      if (dashProjectData[i] && dashProjectData.filter(r => r.notes === 'was ART.1A' && !_catOptionRowIds()[r.id])[0].id !== 'ART.3A') throw new Error('did not move to the end: ' + dashProjectData.map(r => r.id));
      const before = dashProjectData.map(r => r.id).join();
      const j = dashProjectData.findIndex(r => r.id === 'ART.3.1A');
      const inp2 = document.createElement('input'); inp2.value = 'ART.3.7A';
      _codesCommitRowId(j, inp2);
      if (dashProjectData.map(r => r.id).join() !== before) throw new Error('an option number was typed over');
    });

    __check('one Ctrl+Z undoes adding an option', () => {
      project(); kind('images'); pushHistory();
      const before = options();
      kind('images');
      if (options() === before) throw new Error('nothing added');
      undo();
      if (options() !== before) throw new Error('undo left ' + options());
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
