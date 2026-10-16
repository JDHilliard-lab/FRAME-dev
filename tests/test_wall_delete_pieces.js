// 19.04: deleting a wall asks about its pieces. Reported: "I deleted an elevation and now
// I cannot figure out how to get these frames back on a wall ... I will do several
// options then a client will select one ... what will be the best way to delete images
// and frames from the presentation so they are not left floating". A plain wall delete
// kept every piece in the Dashboard, unhung and still printing spec pages, with no way
// to say "and the pieces too". Pieces that hang on THIS wall only are now offered both
// ways: delete them with the wall, or keep them to hang again.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, k) => k in t ? t[k] : (k === 'measureText' ? () => ({ width: 0 }) : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } }); };
  window.fetch = () => Promise.reject(new Error('no network in test'));
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _autosaveToldUser = true;
    const row = (id) => Object.assign(_cloneData(dashDefaultData), { id: id, extW: 20, extH: 24 });
    const fr = (id, x) => ({ id: id, letter: 'A', x: x, y: 40, w: 20, h: 24, fW: 1, product: 'Framed Art', active: true });
    // Option A wall: ART.1A + ART.1B. Option B wall: ART.2, plus ART.1A shown again.
    // ART.3 is on no wall at all.
    const setup = () => {
      dashProjectData = [row('ART.1A'), row('ART.1B'), row('ART.2'), row('ART.3')];
      dashSelectedRowIndex = 0;
      elevations = [
        { id: _elevNewId(), name: 'Option A', frames: [fr('ART.1A', 10), fr('ART.1B', 40)], wallW: 185, wallH: 108, personPos: { x: -60 } },
        { id: _elevNewId(), name: 'Option B', frames: [fr('ART.2', 10), fr('ART.1A', 40)], wallW: 185, wallH: 108, personPos: { x: -60 } },
      ];
      currentElevIndex = 0;
      historyStack = []; historyIndex = -1; pushHistory();
      return dashProjectData[1];   // ART.1B, the piece that hangs on Option A only
    };
    const ask = (i) => {
      deleteElevation(i);
      const btns = Array.from(document.querySelectorAll('#infoModalButtons button'));
      return { yes: btns[0], alt: document.querySelector('#infoModalButtons [data-confirm-alt]'), body: document.getElementById('infoModalBody').innerText, btns };
    };
    __check('only the pieces that hang on no other wall are offered', () => {
      setup();
      const ids = _elevOwnPieceIds(elevations[0]);
      if (ids.join() !== 'ART.1B') throw new Error(ids.join());
    });
    __check('EXACT BUG: the delete asks about the pieces, naming them', () => {
      setup();
      const q = ask(0);
      if (!q.alt) throw new Error('no second answer');
      if (q.yes.innerText !== 'Delete wall and 1 piece') throw new Error('yes reads ' + q.yes.innerText);
      if (q.alt.innerText !== 'Delete wall, keep pieces') throw new Error('alt reads ' + q.alt.innerText);
      if (q.body.indexOf('ART.1B') < 0 || q.body.indexOf('+ Add Wall') < 0) throw new Error(q.body);
      if (q.body.indexOf('Ctrl+Z') < 0) throw new Error('lost the undo sentence');
      q.btns[q.btns.length - 1].onclick();
    });
    __check('Delete wall and pieces takes the wall and its own pieces, nothing hung elsewhere', () => {
      const own = setup();
      const shared = dashProjectData[0];
      ask(0).yes.onclick();
      if (elevations.length !== 1 || elevations[0].name !== 'Option B') throw new Error('walls: ' + elevations.map(e => e.name).join());
      if (dashProjectData.indexOf(own) >= 0) throw new Error('the piece only on that wall survived');
      if (dashProjectData.indexOf(shared) < 0) throw new Error('a piece also on Option B was deleted');
      if (dashProjectData.length !== 3) throw new Error(dashProjectData.length + ' rows');
    });
    __check('...and one Ctrl+Z brings back the wall and the piece', () => {
      const own = setup();
      ask(0).yes.onclick();
      undo();
      if (elevations.length !== 2) throw new Error(elevations.length + ' walls after undo');
      if (!dashProjectData.some(r => r.id === own.id)) throw new Error('piece not restored');
    });
    __check('Delete wall, keep pieces leaves every piece in the Dashboard (the old behaviour)', () => {
      setup();
      elevations[1].frames = [fr('ART.2', 10)];   // so the whole ART.1 set comes off with the wall
      ask(0).alt.onclick();
      if (elevations.length !== 1) throw new Error(elevations.length + ' walls');
      if (dashProjectData.length !== 4) throw new Error(dashProjectData.length + ' rows');
      if (!_placementList().some(g => !g.onWall && g.rows.some(r => r.id.indexOf('ART.1') === 0))) throw new Error('the kept pieces are not offered by + Add Wall');
    });
    __check('a wall whose pieces all hang elsewhere asks the plain question', () => {
      setup();
      elevations[0].frames = [fr('ART.1A', 10)];
      const q = ask(0);
      if (q.alt) throw new Error('offered to delete a piece that hangs on Option B');
      q.btns[q.btns.length - 1].onclick();
    });
    __check('catalogue walls are never offered (an option already takes its rows)', () => {
      setup();
      elevations[0].catalogueOption = true; elevations[0].variationOfId = _elevId(elevations[1]); elevations[1].catalogueMaster = true;
      if (_elevOwnPieceIds(elevations[0]).length) throw new Error('option offered');
      if (_elevOwnPieceIds(elevations[1]).length) throw new Error('mockup offered');
    });
    __check('never deletes the last rows of the project', () => {
      dashProjectData = [row('ART.1')];
      elevations = [{ id: _elevNewId(), name: 'Only', frames: [fr('ART.1', 10)], wallW: 185, wallH: 108, personPos: { x: -60 } }];
      if (_elevOwnPieceIds(elevations[0]).length) throw new Error('offered to empty the Dashboard');
    });
  `;
  try { window.eval(src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
