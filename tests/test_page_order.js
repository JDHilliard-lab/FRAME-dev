// 20.51: CODE ORDER IS PAGE ORDER, AND THE DESIGNER SETS IT. A Ford file (L3.ART.S16-01
// codes, no pattern stored, plans named "Level 03 | Sector 23") moved a placement to the
// Sector 23 plan and its code stayed S16-01: the project had no pattern and its plans no
// sector, so the move had nothing to recode with. Now:
//  - a project whose codes all read as a structured preset adopts it on settle, and a plan
//    named "... Sector 23" takes sector 23 (never over a designer's choice, house included);
//  - pattern codes KEEP a gap, and the gesture that made it ASKS: keep it (the client has those
//    codes) or close it and renumber;
//  - plans print in level, then sector order; pinning a piece on another sector's plan asks;
//  - the Items tab shows This plan / All plans; legend and Items rows drag to renumber;
//  - a placement on a plan whose sector its code does not name is flagged with a Recode fix;
//  - the Page order window trades numbers among one plan's placements (_codesSetOrder), so
//    pages, pins and codes follow a drag, and nothing outside that plan moves.
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
    const keys = (li) => _pageOrderList(li).map(g => g.key).join(' ');
    const ford = () => {
      setup(['L3.ART.S16-01A', 'L3.ART.S16-01B', 'L3.ART.S16-02', 'L3.ART.S16-03', 'L3.ART.S23-01', 'L3.ART.S23-02'], null);
      delete editorialContent.codePattern;
      floorplanLevels = [{ name: 'Level 03 | Sector 16', imageData: '', imageName: '' }, { name: 'Level 03 | Sector 23', imageData: '', imageName: '' }];
      dashProjectData.forEach(r => { const z = /S(\\d+)-/.exec(r.id)[1]; r.zone = z; r.level = z === '23' ? 1 : 0; });
    };

    __check('an older project adopts the pattern its codes already follow, and its plans their sector', () => {
      ford();
      _codesInferPattern(); _codesSettle();
      if (editorialContent.codePattern !== '{level}.{type}.S{zone}-{nn}') throw new Error('pattern ' + editorialContent.codePattern);
      if (floorplanLevels[0].zone !== '16' || floorplanLevels[1].zone !== '23') throw new Error('zones ' + floorplanLevels.map(l => l.zone));
    });
    __check('a designer choice is never overridden (house stays house)', () => {
      ford(); editorialContent.codePattern = '';
      _codesInferPattern(); _codesSettle();
      if (editorialContent.codePattern !== '') throw new Error('pattern became ' + editorialContent.codePattern);
    });
    __check('house codes are not inferred as a pattern', () => {
      setup(['ART.1', 'ART.2'], null); delete editorialContent.codePattern;
      _codesInferPattern(); _codesSettle();
      if (editorialContent.codePattern !== undefined) throw new Error('pattern became ' + editorialContent.codePattern);
    });
    __check('the bug: moving a placement to the Sector 23 plan recodes it to the end of Sector 23', () => {
      ford(); _codesInferPattern(); _codesSettle();
      _movePlacementToLevel('L3.ART.S16-01', 1);
      if (keys(1) !== 'L3.ART.S23-01 L3.ART.S23-02 L3.ART.S23-03') throw new Error('sector 23: ' + keys(1));
      if (!R('L3.ART.S23-03A') || R('L3.ART.S23-03A').zone !== '23') throw new Error('pieces did not follow: ' + dashProjectData.map(r => r.id + '/' + r.zone));
      // The gap it leaves in Sector 16 is KEPT (the client may have those codes)...
      if (keys(0) !== 'L3.ART.S16-02 L3.ART.S16-03') throw new Error('sector 16 closed up on its own: ' + keys(0));
    });
    __check('the gap question: a new gap asks, Keep leaves it, Close renumbers; an old gap never asks', () => {
      ford(); _codesInferPattern(); _codesSettle(); _codesGapReset();
      const asked = [];
      const was = showConfirmModal;
      showConfirmModal = (t, b, y, n, onY, onN) => asked.push({ t: t, onY: onY, onN: onN });
      _movePlacementToLevel('L3.ART.S16-01', 1);
      const fresh = _codesGapCheck();
      if (fresh.join() !== 'L3.ART.S16-01') throw new Error('fresh gaps ' + fresh);
      if (_codesGapCheck().length) throw new Error('asked twice about the same gap');
      _codesGapAsk(fresh);
      if (asked.length !== 1 || asked[0].t.indexOf('L3.ART.S16-01') < 0) throw new Error('question ' + JSON.stringify(asked.map(a => a.t)));
      asked[0].onY();   // Keep the gap
      if (keys(0) !== 'L3.ART.S16-02 L3.ART.S16-03') throw new Error('keep changed codes: ' + keys(0));
      asked[0].onN();   // Close the gap and renumber
      if (keys(0) !== 'L3.ART.S16-01 L3.ART.S16-02') throw new Error('close did not renumber: ' + keys(0));
      if (Object.keys(_codesPatternGaps()).length) throw new Error('gaps left ' + JSON.stringify(_codesPatternGaps()));
      showConfirmModal = was;
    });
    __check('pattern gaps close per stem only when asked', () => {
      setup(['L3.ART.S16-01', 'L3.ART.S16-04', 'L3.ART.S23-02'], LEVEL_SECTOR);
      dashProjectData.forEach(r => { r.zone = /S(\\d+)-/.exec(r.id)[1]; });
      _codesSettle();
      if (ids() !== 'L3.ART.S16-01 L3.ART.S16-04 L3.ART.S23-02') throw new Error('settle closed them: ' + ids());
      _codesCloseGaps();
      if (ids() !== 'L3.ART.S16-01 L3.ART.S16-02 L3.ART.S23-01') throw new Error(ids());
    });
    __check('a placement moved by an older build is flagged and Recode fixes it (row-tracked, two in a row; the gap stays)', () => {
      ford(); _codesInferPattern(); _codesSettle();
      // As a pre-20.51 move left it: on the Sector 23 plan, coded and pinned for Sector 16.
      ['L3.ART.S16-01A', 'L3.ART.S16-01B', 'L3.ART.S16-03'].forEach(id => { const r = R(id); r.level = 1; r.planPins = [{ lv: 0, x: 0.2, y: 0.2 }]; _fpSyncPrimary(r); r.level = 1; });
      const mm = _codesSectorMismatches();
      if (mm.length !== 2) throw new Error('flagged ' + JSON.stringify(mm.map(m => m.key)));
      const pf = _sectorMismatchPreflight([]);
      if (pf.length !== 2 || !pf[0].fix || pf[0].sev !== 'warn') throw new Error('preflight ' + JSON.stringify(pf.map(p => p.sev)));
      pf.forEach(p => p.fix.run());
      if (_codesSectorMismatches().length) throw new Error('still flagged after Recode');
      if (keys(1) !== 'L3.ART.S23-01 L3.ART.S23-02 L3.ART.S23-03 L3.ART.S23-04') throw new Error('sector 23: ' + keys(1));
      if (keys(0) !== 'L3.ART.S16-02') throw new Error('sector 16: ' + keys(0));
      const r = R('L3.ART.S23-03A');
      if (!r || !_fpTempPin(r) || _fpPinsAll(r).some(p => p.lv === 0)) throw new Error('pin did not come across: ' + JSON.stringify(r && _fpPinsAll(r)));
    });
    __check('page order: a reorder trades numbers and pages follow', () => {
      setup(['L3.ART.S16-01', 'L3.ART.S16-02A', 'L3.ART.S16-02B', 'L3.ART.S16-03'], LEVEL_SECTOR);
      dashProjectData.forEach(r => { r.zone = '16'; r.location = { '01': 'LOBBY', '02': 'ELEVATOR', '03': 'ENTRANCE' }[/-(\\d+)/.exec(r.id)[1]]; });
      const res = _codesSetOrder(['L3.ART.S16-03', 'L3.ART.S16-01', 'L3.ART.S16-02'], { quiet: true });
      const order = _pageOrderList(0).map(g => g.location).join(' ');
      if (order !== 'ENTRANCE LOBBY ELEVATOR') throw new Error('order ' + order);
      if (ids() !== 'L3.ART.S16-01 L3.ART.S16-02 L3.ART.S16-03A L3.ART.S16-03B') throw new Error(ids());
      if (res.length !== 3) throw new Error('moves ' + JSON.stringify(res));
      const specOrder = _deckSpecRows().map(r => r.location).join(' ');
      if (specOrder !== 'ENTRANCE LOBBY ELEVATOR ELEVATOR') throw new Error('spec pages ' + specOrder);
    });
    __check('page order on house codes moves only one plan\u2019s numbers', () => {
      setup([['ART.1', { level: 0 }], ['ART.2', { level: 1 }], ['ART.3', { level: 0 }], ['ART.4', { level: 1 }]], '');
      _codesSetOrder(['ART.3', 'ART.1'], { quiet: true });
      const lv = dashProjectData.map(r => r.id + '@' + r.level).join(' ');
      // Plan 0 held 1 and 3; it still does, swapped. Plan 1 is untouched.
      if (lv !== 'ART.1@0 ART.2@1 ART.3@0 ART.4@1') throw new Error(lv);
      if (keys(0) !== 'ART.1 ART.3') throw new Error(keys(0));
    });
    __check('the window: one card per placement, steps reorder, Done closes', () => {
      setup(['L3.ART.S16-01', 'L3.ART.S16-02', 'L3.ART.S16-03'], LEVEL_SECTOR);
      dashProjectData.forEach(r => { r.zone = '16'; r.location = 'ROOM ' + r.id.slice(-1); });
      const ov = openPageOrder(0);
      const cells = ov.querySelectorAll('[data-po-key]');
      if (cells.length !== 3) throw new Error(cells.length + ' cards');
      if (!ov.querySelector('[data-modal-close]')) throw new Error('no close control');
      cells[2].querySelector('[data-po-step="-1"]').onclick({ stopPropagation() {} });
      const now = [...document.querySelectorAll('#pageOrderModal .po-loc')].map(e => e.textContent).join(',');
      if (now !== 'ROOM 1,ROOM 3,ROOM 2') throw new Error('after step: ' + now);
      document.querySelector('#pageOrderModal [data-modal-close]').onclick();
      if (document.getElementById('pageOrderModal')) throw new Error('did not close');
    });
    __check('plans print in level, then sector order, whatever order they were added', () => {
      setup(['ART.1'], '');
      floorplanLevels = [{ name: 'Level 03 | Sector 16', zone: '16' }, { name: 'Level 03 | Sector 24', zone: '24' }, { name: 'Level 03 | Sector 23', zone: '23' }, { name: 'Level 10', imageData: 'x' }, { name: 'Level 2', imageData: 'x' }];
      dashProjectData = [0, 1, 2].map(li => row('ART.' + (li + 1), { level: li }));
      const ord = _planLevelOrder().map(i => floorplanLevels[i].name).join(' / ');
      if (ord !== 'Level 2 / Level 03 | Sector 16 / Level 03 | Sector 23 / Level 03 | Sector 24 / Level 10') throw new Error(ord);
      const pages = _deckPageList().filter(d => d.kind === 'floorplan').map(d => floorplanLevels[d.level].name).join(' / ');
      if (pages.indexOf('Sector 16 / Level 03 | Sector 23 / Level 03 | Sector 24') < 0) throw new Error('deck: ' + pages);
      editorialContent.planOrder = 'manual'; editorialContent.planSeq = [1, 0];
      if (floorplanLevels[_planLevelOrder()[0]].zone !== '24') throw new Error('manual order ignored');
    });
    __check('pinning a piece on another sector’s plan asks: Move recodes, Both keeps the code', () => {
      ford(); _codesInferPattern(); _codesSettle();
      R('L3.ART.S16-02').planPins = [{ lv: 0, x: 0.1, y: 0.1 }]; _fpSyncPrimary(R('L3.ART.S16-02'));
      const was = showConfirmModal; let q = null;
      showConfirmModal = (t, b, y, n, onY, onN, o) => { q = { t: t, onY: onY, alt: o && o.alt }; };
      let done = 0;
      _fpPlaceGroup(_fpFindGroup('L3.ART.S16-02'), 1, 0.5, 0.5, () => done++);
      if (!q || q.t.indexOf('Sector 23') < 0 || !q.alt) throw new Error('did not ask: ' + (q && q.t));
      q.onY();
      const r = R('L3.ART.S23-03');
      if (!r || done !== 1) throw new Error('not moved: ' + ids());
      const p = _fpPinsAll(r);
      if (p.length !== 1 || p[0].lv !== 1 || p[0].temp || p[0].x !== 0.5) throw new Error('pins ' + JSON.stringify(p));
      // Same plan's sector: no question, a plain pin.
      q = null; _fpPlaceGroup(_fpFindGroup('L3.ART.S23-01'), 1, 0.3, 0.3, () => done++);
      if (q || done !== 2) throw new Error('asked on its own sector');
      // Show on both plans keeps the code and adds a second pin.
      _fpPlaceGroup(_fpFindGroup('L3.ART.S16-03'), 1, 0.7, 0.7, () => done++);
      q.alt.onClick();
      if (!R('L3.ART.S16-03') || _fpPinsAll(R('L3.ART.S16-03')).length !== 1 || done !== 3) throw new Error('both: ' + ids());
      showConfirmModal = was;
    });
    __check('dragging S16-04 up after S16-01 renumbers the codes between (Items and legend share it)', () => {
      setup(['L3.ART.S16-01', 'L3.ART.S16-02', 'L3.ART.S16-03', 'L3.ART.S16-04'], LEVEL_SECTOR);
      dashProjectData.forEach(r => { r.zone = '16'; r.location = 'ROOM ' + r.id.slice(-1); });
      const fin = _codesMoveBesideAny('L3.ART.S16-04', 'L3.ART.S16-01', true);
      if (fin !== 'L3.ART.S16-02') throw new Error('landed as ' + fin);
      const locs = _pageOrderList(0).map(g => g.location).join(',');
      if (locs !== 'ROOM 1,ROOM 4,ROOM 2,ROOM 3') throw new Error(locs);
    });
    __check('the Items tab: plan buttons, This plan shows one plan, All plans heads each plan', () => {
      ford(); _codesInferPattern(); _codesSettle();
      const t = document.createElement('div'); document.body.appendChild(t);
      _fpItemScope = 'plan';
      _fpPanelItems(t, { kind: 'floorplan', level: 1 });
      if (t.querySelectorAll('[data-fp-plan]').length !== 2) throw new Error('plan buttons ' + t.querySelectorAll('[data-fp-plan]').length);
      const shown = () => [...document.querySelectorAll('#dsFpItemList [data-fp-key]')].map(r => r.dataset.fpKey).join(' ');
      if (shown() !== 'L3.ART.S23-01 L3.ART.S23-02') throw new Error('this plan: ' + shown());
      t.remove();
      const t2 = document.createElement('div'); document.body.appendChild(t2);
      _fpItemScope = 'all';
      _fpPanelItems(t2, { kind: 'floorplan', level: 1 });
      if (document.querySelectorAll('[data-fp-planhead]').length !== 2) throw new Error('headings');
      if (shown().split(' ').length !== 5) throw new Error('all plans: ' + shown());
      t2.remove(); _fpItemScope = 'plan';
    });
    __check('the Deck Studio plans button lists every plan in deck order', () => {
      setup(['ART.1'], '');
      floorplanLevels = [{ name: 'S16', zone: '16' }, { name: 'S24', zone: '24' }, { name: 'S23', zone: '23' }];
      if (!document.getElementById('dsTabBtnPlans')) throw new Error('no button in the header');
      const m = openPlansMenu(document.getElementById('dsTabBtnPlans'));
      const labels = [...document.querySelectorAll('.frame-menu button')].map(b => b.textContent);
      if (labels.slice(0, 3).map(l => l.trim().slice(0, 3)).join() !== 'S16,S23,S24') throw new Error(labels.join('|'));
      const open = document.querySelector('.frame-menu'); if (open && open._close) open._close();
    });
    __check('the floorplan Items panel and Ctrl+K open it', () => {
      setup(['ART.1', 'ART.2'], '');
      if (!_jumpEntries().some(e => e.title === 'Page order')) throw new Error('not in Jump to');
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
