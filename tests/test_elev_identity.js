// A WALL'S IDENTITY IS AN ID, NEVER ITS INDEX IN `elevations`.
//
// Every object in this file that pointed AT an elevation pointed at its array
// index, and `variationOf` is what that cost: THREE hand-written renumbering
// blocks for ONE field. reorderElevation shifted the indices in two directions
// (and its own comment proposed giving up and clearing the link instead), and
// deleteElevation carried two more - one to promote orphans, one to shift
// everything above the hole down by one. Each had to stay right on its own,
// none was tested, and the same trap has already been dug out of _dsDragFromKey,
// the context blocks and the floorplan level pins.
//
// `variationOfId` is the truth now; `variationOf` survives as a DERIVED numeric
// mirror, the way r.planX mirrors planPins[0], so a project written here still
// opens in a build that only knows the number.
//
// Why it matters beyond tidiness: a variation is skipped by
// recalculateDashboardQuantities so a duplicated wall does not double-bill. Lose
// or mis-point that link and the quantity is silently wrong - frames that ARE
// being ordered read qty 0, or frames shown twice get billed twice.
//
// NO REGEX IN THIS FILE. Patterns written into a test block here lose their
// backslashes on the way in; indexOf and split().length cannot do that.
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
  window.confirm = () => true;
  window.alert = () => {};
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    // The app no longer calls window.confirm. Destructive actions ask through its
    // own dialog now (_confirmDestroy, then showConfirmModal), so "assume the
    // designer says yes" means pressing that dialog's real confirm button - which
    // also exercises the button's wiring rather than skipping past it.
    const __realConfirm = showConfirmModal;
    showConfirmModal = function () {
      __realConfirm.apply(this, arguments);
      const __yes = document.querySelector('#infoModalButtons button');
      if (__yes) __yes.click();
    };
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const S = window.__appSrc;
    // Renderers are irrelevant here and blow up on a jsdom DOM. Every function
    // under test does its data work BEFORE it repaints, so swallowing the repaint
    // still exercises the real handler rather than a reimplementation of it.
    const quiet = (fn) => { try { fn(); } catch (e) {} };
    // Slice a function by its OWN extent, never by a landmark that happens to sit
    // nearby: _cloneData is declared BEFORE restoreProjectState, so slicing to it
    // produced an empty string and the check passed on nothing.
    const NLFN = String.fromCharCode(10) + 'function ';
    const fnBody = (name) => {
      const at = S.indexOf('function ' + name + '(');
      if (at < 0) throw new Error('missing function ' + name);
      const end = S.indexOf(NLFN, at + 1);
      return S.slice(at, end < 0 ? S.length : end);
    };
    const wall = (name) => ({ id: _elevNewId(), name: name, frames: [], wallW: 185, wallH: 108, personPos: { x: -60 } });
    const setWalls = (arr) => { elevations.length = 0; arr.forEach(w => elevations.push(w)); currentElevIndex = 0; };

    __check('the id counter is declared ABOVE let elevations, or the file dies on boot', () => {
      // That literal RUNS at module scope and now calls _elevNewId(), so a counter
      // declared further down is read in the TDZ. Same trap as TITLE_SIZE_DEFAULT.
      const seq = S.indexOf('let _elevIdSeq');
      const els = S.indexOf('let elevations = [{');
      if (seq < 0) throw new Error('no _elevIdSeq declaration');
      if (els < 0) throw new Error('no elevations declaration');
      if (seq > els) throw new Error('_elevIdSeq is declared after elevations');
    });

    __check('every wall has a stable id, and asking twice gives the same one', () => {
      setWalls([wall('A'), wall('B')]);
      const a1 = _elevId(elevations[0]), a2 = _elevId(elevations[0]);
      if (!a1) throw new Error('no id assigned');
      if (a1 !== a2) throw new Error('the id changed between two reads');
      if (a1 === _elevId(elevations[1])) throw new Error('two walls share an id');
    });

    __check('a wall that predates ids gets one on first ask, without a load path', () => {
      const old = { name: 'legacy', frames: [], wallW: 100, wallH: 100, personPos: { x: 0 } };
      setWalls([old]);
      const id = _elevId(old);
      if (!id) throw new Error('no id backfilled');
      if (old.id !== id) throw new Error('the id was not written back onto the wall');
    });

    // ── THE REPORTED CLASS OF BUG: the array moves, the link must not ──────
    __check('REORDER: a variation still points at the SAME wall afterwards', () => {
      setWalls([wall('source'), wall('middle'), wall('copy')]);
      const srcObj = elevations[0];
      elevations[2].isVariation = true;
      elevations[2].variationOfId = _elevId(srcObj);
      _elevSyncVariationPrimary();
      // Drag the source from the front to the back.
      quiet(() => reorderElevation(0, 2));
      const copy = elevations.find(e => e.name === 'copy');
      if (!copy) throw new Error('the copy vanished');
      if (_elevById(copy.variationOfId) !== srcObj) throw new Error('the variation now points at a different wall');
    });

    __check('REORDER: the numeric mirror is re-derived, so an older build still reads it', () => {
      setWalls([wall('source'), wall('middle'), wall('copy')]);
      const srcObj = elevations[0];
      elevations[2].isVariation = true;
      elevations[2].variationOfId = _elevId(srcObj);
      _elevSyncVariationPrimary();
      quiet(() => reorderElevation(0, 2));
      const copy = elevations.find(e => e.name === 'copy');
      if (copy.variationOf !== elevations.indexOf(srcObj)) {
        throw new Error('mirror is ' + copy.variationOf + ', source sits at ' + elevations.indexOf(srcObj));
      }
    });

    __check('DELETE a wall ABOVE the source: the link survives and the mirror shifts', () => {
      setWalls([wall('spare'), wall('source'), wall('copy')]);
      const srcObj = elevations[1];
      elevations[2].isVariation = true;
      elevations[2].variationOfId = _elevId(srcObj);
      _elevSyncVariationPrimary();
      quiet(() => deleteElevation(0, { stopPropagation: function () {} }));
      const copy = elevations.find(e => e.name === 'copy');
      if (!copy) throw new Error('the copy vanished');
      if (_elevById(copy.variationOfId) !== srcObj) throw new Error('the variation lost or re-pointed its source');
      if (copy.variationOf !== elevations.indexOf(srcObj)) throw new Error('the numeric mirror was not re-derived');
      if (copy.isVariation !== true) throw new Error('the copy stopped being a variation for no reason');
    });

    __check('DELETE THE SOURCE: the variation is PROMOTED, or its quantity reads 0', () => {
      setWalls([wall('source'), wall('copy')]);
      elevations[1].isVariation = true;
      elevations[1].variationOfId = _elevId(elevations[0]);
      _elevSyncVariationPrimary();
      quiet(() => deleteElevation(0, { stopPropagation: function () {} }));
      const copy = elevations.find(e => e.name === 'copy');
      if (!copy) throw new Error('the copy vanished');
      if (copy.isVariation) throw new Error('the orphan is still flagged a variation, so its frames will not be counted');
      if (copy.variationOfId) throw new Error('the orphan still points at a wall that is gone');
      if ('variationOf' in copy) throw new Error('the stale numeric mirror survived');
    });

    // ── The quantity rule the link exists to protect ──────────────────────
    __check('a variation does not double-bill, and a promoted orphan is counted', () => {
      currentView = 'elevation';
      dashProjectData.length = 0;
      dashProjectData.push({ id: 'ART.001', qty: 0 });
      const mk = (n) => { const w = wall(n); w.frames.push({ id: 'ART.001', active: true }); return w; };
      setWalls([mk('source'), mk('copy')]);
      elevations[1].isVariation = true;
      elevations[1].variationOfId = _elevId(elevations[0]);
      _elevSyncVariationPrimary();
      recalculateDashboardQuantities();
      if (dashProjectData[0].qty !== 1) throw new Error('a variation double-billed: qty ' + dashProjectData[0].qty);
      // Now delete the source. The survivor is a real wall and must be counted.
      quiet(() => deleteElevation(0, { stopPropagation: function () {} }));
      recalculateDashboardQuantities();
      if (dashProjectData[0].qty !== 1) throw new Error('the promoted orphan was not counted: qty ' + dashProjectData[0].qty);
    });

    // ── Duplicate ─────────────────────────────────────────────────────────
    __check('DUPLICATE: the copy gets its OWN id, not the source it was cloned from', () => {
      setWalls([wall('source')]);
      currentView = 'elevation'; currentElevIndex = 0;
      const srcId = _elevId(elevations[0]);
      quiet(() => duplicateCurrentElevation());
      if (elevations.length !== 2) throw new Error('no copy was made');
      const copy = elevations[1];
      if (!copy.id) throw new Error('the copy has no id');
      if (copy.id === srcId) throw new Error('the copy carries the source id - _elevById would return whichever it met first');
      if (copy.variationOfId !== srcId) throw new Error('the copy does not point back at its source');
    });

    __check('DUPLICATE does not re-encode artwork: _cloneData, never a JSON round trip', () => {
      // An elevation's frames carry artworkUrl, a base64 data URL of megabytes.
      const body = fnBody('duplicateCurrentElevation');
      if (body.indexOf('JSON.parse(JSON.stringify') >= 0) throw new Error('the JSON round trip is back');
      if (body.indexOf('_cloneData(src)') < 0) throw new Error('the duplicate does not use _cloneData');
    });

    // ── Migration off the old index-keyed field ───────────────────────────
    __check('MIGRATION: a numeric variationOf is read against the order it was SAVED in', () => {
      const a = { name: 'source', frames: [], wallW: 100, wallH: 100, personPos: { x: 0 } };
      const b = { name: 'other', frames: [], wallW: 100, wallH: 100, personPos: { x: 0 } };
      const c = { name: 'copy', frames: [], wallW: 100, wallH: 100, personPos: { x: 0 }, isVariation: true, variationOf: 0 };
      setWalls([a, b, c]);
      _elevMigrateIds();
      if (!a.id || !c.id) throw new Error('ids were not assigned');
      if (c.variationOfId !== a.id) throw new Error('the old index did not resolve to the saved-order wall');
      if (c.variationOf !== 0) throw new Error('the numeric mirror is wrong after migration');
      // And it must not re-run against a file that already has ids.
      const before = c.variationOfId;
      _elevMigrateIds();
      if (c.variationOfId !== before) throw new Error('migration is not idempotent');
    });

    __check('MIGRATION: a numeric variationOf pointing nowhere promotes rather than sticking', () => {
      const c = { name: 'orphan', frames: [], wallW: 100, wallH: 100, personPos: { x: 0 }, isVariation: true, variationOf: 7 };
      setWalls([c]);
      _elevMigrateIds();
      if (c.isVariation) throw new Error('an unresolvable link left the wall flagged, so its frames will not be counted');
    });

    __check('BOTH install points migrate: project open and restoreProjectState', () => {
      // Undo, autosave-restore and version history all funnel through
      // restoreProjectState; a file opened from disk does not.
      const rBody = fnBody('restoreProjectState');
      if (rBody.indexOf('_elevMigrateIds()') < 0) throw new Error('restoreProjectState does not migrate');
      if (S.indexOf('if (data.elevations) elevations = data.elevations;') < 0) throw new Error('the project-open assignment moved');
      const o = S.indexOf('if (data.elevations) elevations = data.elevations;');
      if (S.slice(o, o + 200).indexOf('_elevMigrateIds()') < 0) throw new Error('the project-open path does not migrate');
    });

    // ── The blocks this replaced must not come back ───────────────────────
    __check('no index-shifting blocks survive anywhere', () => {
      // Three of them, in two functions, each of which had to stay right alone.
      if (S.indexOf('variationOf--') >= 0) throw new Error('an index-decrement block is back');
      if (S.indexOf('variationOf++') >= 0) throw new Error('an index-increment block is back');
      if (S.indexOf('elev.variationOf = toIdx') >= 0) throw new Error('reorder is patching the index by hand again');
    });

    __check('nothing writes variationOf except the one mirror function', () => {
      // A second writer is how the mirror and the id start disagreeing.
      const writes = S.split('.variationOf = ').length - 1;
      const inSync = fnBody('_elevSyncVariationPrimary').split('.variationOf = ').length - 1;
      if (writes !== inSync) throw new Error(writes + ' writes to variationOf, ' + inSync + ' of them in _elevSyncVariationPrimary');
    });
  `;

  try {
    window.__appSrc = src;
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
