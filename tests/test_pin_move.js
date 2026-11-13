// 20.50: A MOVED PLACEMENT'S PIN. Moving a placement to another level used to leave its pin on
// the old plan, and because a pinned piece takes its level from its FIRST pin, pinning it on
// the new plan snapped it straight back to the old level (spec page grouped under the old
// level, old plan still showing it). An older project, whose rows carry one pin with no
// planPins array, went wrong the other way: the old pin jumped onto the new plan at the
// same x/y, looking deliberate.
//
// Now the old plan's pin goes and a TEMPORARY pin lands on the new plan (among its sector's
// pieces, else mid-plan, never stacked), drawn amber with a "?" in the editor, never
// printed, counted as unplaced, and flagged by Preflight (an error in an IFS). A sector
// change keeps the pin but flags it for a check. Dragging or "keep spot" confirms either.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // A recording no-op context: every call is logged, every read returns something callable.
  window.__calls = [];
  const mkCtx = () => new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s || '').length * 5 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      return (...a) => { window.__calls.push([k, a]); };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  window.HTMLCanvasElement.prototype.getContext = function () { return this.__ctx || (this.__ctx = mkCtx()); };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __check = (label, fn) => {
      __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true }))
        .catch(e => ({ label, ok: false, err: e.message })));
      window.__asyncChecks.push(__chain);
    };
    _autosaveToldUser = true;
    scheduleAutosave = () => {}; pushHistory = () => {};
    _loadImg = () => Promise.reject(new Error('no images in test'));

    const row = (id, extra) => Object.assign({ id: id, product: 'Framed Art', category: 'framed', extW: 20, extH: 20, qty: 1, level: 0 }, extra || {});
    const fr = (id, letter, x) => ({ id: id, letter: letter, x: x, y: 40, w: 20, h: 20, active: true, dimTo: [] });
    const LEVEL_SECTOR = '{level}.{type}.S{zone}-{nn}';
    const setup = (ids, pat) => {
      editorialContent = _editorialDefaults();
      editorialContent.codePattern = pat == null ? LEVEL_SECTOR : pat;
      floorplanLevels = [{ name: 'Level 03', imageData: '', imageName: '' }, { name: 'Level 04', imageData: '', imageName: '' }, { name: 'Guestroom B', imageData: '', imageName: '' }];
      elevUnit = 'in'; dashUnit = 'in';
      dashProjectData = (ids || []).map(x => typeof x === 'string' ? row(x) : row(x[0], x[1]));
      elevations = [];
      currentElevIndex = 0; elevFrames = [];
      dashSelectedRowIndex = 0;
    };
    const ids = () => dashProjectData.map(r => r.id).join(' ');


    const R = (id) => dashProjectData.find(r => r.id === id);
    const pinned = (id, lv, x, y) => [id, { level: lv, planX: x, planY: y, planPins: [{ lv: lv, x: x, y: y }] }];

    __check('the bug: pinning a moved piece on its new plan keeps it on the new level', () => {
      setup([pinned('ART.1', 0, 0.2, 0.3)], '');
      _movePlacementToLevel('ART.1', 1);
      const r = R('ART.1');
      if (r.level !== 1) throw new Error('move did not set the level: ' + r.level);
      _fpSetPin(r, 1, 0.6, 0.7);
      if (r.level !== 1) throw new Error('snapped back to level ' + r.level + ' once pinned on the new plan');
      const p = _fpPinsAll(r);
      if (p.length !== 1 || p[0].lv !== 1 || p[0].temp) throw new Error('pins: ' + JSON.stringify(p));
      if (r.planX !== 0.6 || r.planY !== 0.7) throw new Error('primary not the new pin');
    });
    __check('an older row (one pin, no planPins) does not drag its pin onto the new plan', () => {
      setup([['ART.1', { level: 0, planX: 0.2, planY: 0.3 }]], '');
      _movePlacementToLevel('ART.1', 1);
      const r = R('ART.1');
      if (_fpPins(r).length) throw new Error('a real pin survived the move: ' + JSON.stringify(_fpPins(r)));
      const tp = _fpTempPinOn(r, 1);
      if (!tp) throw new Error('no temporary pin on the new plan');
      if (tp.x === 0.2 && tp.y === 0.3) throw new Error('the temporary pin is just the old x/y');
    });
    __check('the temporary pin lands among its sector on the new plan, else mid-plan, never stacked', () => {
      setup([pinned('ART.1', 0, 0.9, 0.9), ['ART.2', { level: 1, zone: '24', planX: 0.2, planY: 0.2, planPins: [{ lv: 1, x: 0.2, y: 0.2 }] }],
             ['ART.3', { level: 1, zone: '24', planX: 0.4, planY: 0.4, planPins: [{ lv: 1, x: 0.4, y: 0.4 }] }],
             ['ART.4', { level: 1, zone: '30', planX: 0.9, planY: 0.1, planPins: [{ lv: 1, x: 0.9, y: 0.1 }] }], pinned('ART.5', 0, 0.5, 0.5), pinned('ART.6', 0, 0.5, 0.5)], '');
      R('ART.1').zone = '24';
      const res = _movePlacementToLevel('ART.1', 1);
      const t1 = _fpTempPinOn(R('ART.1'), 1);
      if (Math.abs(t1.x - 0.3) > 0.001 || Math.abs(t1.y - 0.3) > 0.001 || res.landed.from !== 'sector') throw new Error('not in the middle of sector 24: ' + JSON.stringify(t1));
      _movePlacementToLevel('ART.5', 1);
      const t5 = _fpTempPinOn(R('ART.5'), 1);
      if (!(Math.abs(t5.x - 0.5) < 0.06 && Math.abs(t5.y - 0.5) < 0.06)) throw new Error('no sector: should land near mid-plan, got ' + JSON.stringify(t5));
      _movePlacementToLevel('ART.6', 1);
      const t6 = _fpTempPinOn(R('ART.6'), 1);
      if (Math.hypot(t6.x - t5.x, t6.y - t5.y) < 0.02) throw new Error('two moved pieces stacked on one spot');
    });
    __check('a temporary pin is not a placement: never printed, counted unplaced', () => {
      setup([pinned('ART.1', 0, 0.2, 0.3)], '');
      _movePlacementToLevel('ART.1', 1);
      const r = R('ART.1');
      if (r.planX != null || r.planY != null) throw new Error('the primary position should be empty');
      const g1 = _fpGroups(1).find(g => g.key === 'ART.1'), g0 = _fpGroups().find(g => g.key === 'ART.1'), gOld = _fpGroups(0).find(g => g.key === 'ART.1');
      if (g1.planX != null || g0.planX != null || gOld.planX != null) throw new Error('a plan renderer would draw it');
      if (_fpPins(r).length) throw new Error('_fpPins returned the temporary pin');
    });
    __check('pins on other plans stay; one already on the new plan takes the lead with no stand-in', () => {
      setup([['ART.1', { level: 0, planX: 0.2, planY: 0.3, planPins: [{ lv: 0, x: 0.2, y: 0.3 }, { lv: 2, x: 0.7, y: 0.7 }] }],
             ['ART.2', { level: 0, planX: 0.2, planY: 0.3, planPins: [{ lv: 0, x: 0.2, y: 0.3 }, { lv: 1, x: 0.5, y: 0.6 }] }]], '');
      _movePlacementToLevel('ART.1', 1);
      const a = _fpPinsAll(R('ART.1'));
      if (!a[0].temp || a[0].lv !== 1 || !a.some(p => p.lv === 2 && !p.temp) || a.some(p => p.lv === 0)) throw new Error('ART.1 pins: ' + JSON.stringify(a));
      if (R('ART.1').level !== 1) throw new Error('level ' + R('ART.1').level);
      _movePlacementToLevel('ART.2', 1);
      const b = _fpPinsAll(R('ART.2'));
      if (b.length !== 1 || b[0].lv !== 1 || b[0].temp || R('ART.2').planX !== 0.5) throw new Error('ART.2 pins: ' + JSON.stringify(b));
    });
    __check('pinning the moved piece on a third plan replaces the stand-in', () => {
      setup([pinned('ART.1', 0, 0.2, 0.3)], '');
      _movePlacementToLevel('ART.1', 1);
      _fpSetPin(R('ART.1'), 2, 0.4, 0.4);
      const p = _fpPinsAll(R('ART.1'));
      if (p.some(q => q.temp) || p.length !== 1 || R('ART.1').level !== 2) throw new Error(JSON.stringify(p) + ' level ' + R('ART.1').level);
    });
    __check('keep spot makes the temporary pin real where it landed, one call', () => {
      setup([pinned('ART.1', 0, 0.2, 0.3)], '');
      _movePlacementToLevel('ART.1', 1);
      const tp = _fpTempPinOn(R('ART.1'), 1);
      if (!_fpConfirmPin('ART.1', 1)) throw new Error('confirm refused');
      const r = R('ART.1');
      if (_fpTempPin(r) || r.planX !== tp.x || r.planY !== tp.y || r.level !== 1) throw new Error(JSON.stringify(_fpPinsAll(r)));
    });
    __check('a sector change keeps the pin, flags it, and drag or keep spot clears the flag', () => {
      setup([pinned('ART.1', 0, 0.2, 0.3)], '');
      if (_fpFlagCheck([R('ART.1')]) !== 1) throw new Error('not flagged');
      const g = _fpGroups(0).find(x => x.key === 'ART.1');
      if (!g.check || g.planX !== 0.2) throw new Error('flagged pin must still print in place: ' + JSON.stringify({ check: g.check, x: g.planX }));
      _fpConfirmPin('ART.1', 0);
      if (_fpPins(R('ART.1'))[0].check) throw new Error('keep spot did not clear the flag');
      _fpFlagCheck([R('ART.1')]); _fpSetPin(R('ART.1'), 0, 0.25, 0.3);
      if (_fpPins(R('ART.1'))[0].check) throw new Error('dragging did not clear the flag');
      setup([['ART.2', {}]], '');
      if (_fpFlagCheck([R('ART.2')]) !== 0 || Array.isArray(R('ART.2').planPins)) throw new Error('an unpinned piece got a pin array');
    });
    __check('Preflight flags both: a warning while in progress, an error in an IFS', () => {
      setup([pinned('ART.1', 0, 0.2, 0.3), pinned('ART.2', 0, 0.6, 0.6), pinned('ART.3', 0, 0.8, 0.8)], '');
      _movePlacementToLevel('ART.1', 1);
      _fpFlagCheck([R('ART.2')]);
      const ifs0 = _deckIsIFS;
      _deckIsIFS = () => false;
      let pf = _pinMovePreflight([{ kind: 'floorplan', level: 1 }]);
      const a = pf.find(x => x.pinMove === 'ART.1'), b = pf.find(x => x.pinMove === 'ART.2');
      if (!a || !b || pf.length !== 2) throw new Error('items: ' + JSON.stringify(pf));
      if (a.sev !== 'warn' || b.sev !== 'warn' || a.idx !== 0) throw new Error('severity or page: ' + JSON.stringify(pf));
      _deckIsIFS = () => true;
      pf = _pinMovePreflight([]);
      _deckIsIFS = ifs0;
      if (pf.some(x => x.sev !== 'err')) throw new Error('not errors in an IFS');
      const run = _dsRunPreflight().filter(x => /ART\.1/.test(x.text));
      if (run.some(x => /no floorplan pin/.test(x.text))) throw new Error('the generic no-pin line doubled up on the moved piece');
    });
    __check('the editor draws it amber with a ?, and the Items row offers keep spot', () => {
      setup([pinned('ART.1', 0, 0.2, 0.3)], '');
      _movePlacementToLevel('ART.1', 1);
      const g = _fpGroups(1).find(x => x.key === 'ART.1');
      const tp = _fpTempPinOn(g.rows[0], 1);
      const el = _dsMakePin(Object.assign({}, g, { planX: tp.x, planY: tp.y, temp: true }), 1);
      if (!el.hasAttribute('data-fp-temp') || el.textContent.indexOf('?') !== 0) throw new Error('temp pin look');
      const row = _fpItemRow(g, { level: 1 });
      const chip = row.querySelector('[data-fp-flag="temp"]');
      if (!chip) throw new Error('no flag on the Items row');
      chip.onclick({ stopPropagation() {} });
      if (_fpTempPin(R('ART.1')) || R('ART.1').planX == null) throw new Error('the chip did not keep the spot');
    });
    __check('the dashboard level picker is locked while a moved pin waits', () => {
      setup([pinned('ART.1', 0, 0.2, 0.3)], '');
      _movePlacementToLevel('ART.1', 1);
      const sel = document.getElementById('m_level');
      if (!sel || sel.tagName !== 'SELECT') return;
      _fillLevelSelect(R('ART.1'));
      if (!sel.disabled) throw new Error('the level could be changed under a waiting pin');
    });
  `;

  try {
    window.eval(src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = await Promise.all(window.__asyncChecks || []);
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
