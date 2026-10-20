// 19.44, reported on the Ford Salt Lake City deck:
//  1. "ART.4 and ART.5 ... creates two elevation breaker pages when I only need one."
//     Two placements on one wall printed the same wall drawing twice (and ART.12/13/14
//     three times), in Per-piece and Group A/B/C alike. ONE BREAKER PER WALL now.
//  2. "the designer should have labeled it ART.12 ABC ... I would have to manually update
//     all the numbers after 12 all the way up to 40." Codes hanging a few inches apart are
//     SUGGESTED as one set (never regrouped on their own) and one call joins them,
//     renumbering everything after and keeping wall names in step.
//  3. Preflight wears its result as a colour and a count, never a popup.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => {
      try { fn(); window.__testResults.push({ label, ok: true }); }
      catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); }
    };
    _autosaveToldUser = true;
    scheduleAutosave = () => {}; pushHistory = () => {};
    _dsRenderRail = () => {}; _dsRenderCenter = () => {}; _dsRenderTools = () => {};
    _dsClearBuiltAll = () => {}; _dsRefresh = () => {};
    _codesRefreshViews = () => {};
    _toast = () => {};

    // Inches, like the Ford walls. x/y are bottom-left in elevUnit.
    const fr = (id, letter, x, w) => ({ id: id, letter: letter, x: x, y: 40, w: w, h: 30, active: true, dimTo: [] });
    const row = (id) => ({ id: id, product: 'Framed Art', level: 0, location: 'Circ', extW: 30, extH: 30, imageCode: 'IMG-' + id });
    const setup = (tpl) => {
      editorialContent = _editorialDefaults();
      editorialContent.annotations = {};
      editorialContent.layoutPages = [];
      editorialContent.specTemplate = tpl;
      editorialContent.elevBreakers = true;
      elevUnit = 'in'; dashUnit = 'in';
      floorplanLevels = [{ name: 'Level 1', imageData: '' }];
      dashProjectData = ['ART.1', 'ART.2', 'ART.3', 'ART.4', 'ART.5', 'ART.6A', 'ART.6B'].map(row);
      elevations = [
        // ART.1 and ART.2 on one long wall, 189" apart (the Ford ART.4 / ART.5): separate pieces, one drawing.
        { id: 'w1', name: 'ART.1 / 2 | Circulation C-102', wallW: 320, wallH: 108, frames: [fr('ART.1', 'A', 34, 31), fr('ART.2', 'B', 254, 31)] },
        // ART.3, ART.4, ART.5 a few inches apart (the Ford ART.12 / 13 / 14): one set coded as three.
        { id: 'w2', name: 'ART.3 / 4 / 5 | Circulation C-101', wallW: 270, wallH: 108, frames: [fr('ART.3', 'A', 77, 30), fr('ART.4', 'B', 111, 48), fr('ART.5', 'C', 163, 30)] },
        { id: 'w3', name: 'ART.6A / 6B | Kitchenette', wallW: 200, wallH: 108, frames: [fr('ART.6A', 'A', 50, 30), fr('ART.6B', 'B', 84, 30)] }
      ];
      try { _elevMigrateIds(); } catch (e) {}
    };
    const breakers = () => _deckPageList().filter(d => d._install);

    // ── 1. ONE BREAKER PER WALL ──
    ['frameSpecDetail', 'setLegend'].forEach(tpl => {
      __check('EXACT BUG (' + tpl + '): ART.1 and ART.2 on one wall print ONE breaker, then both specs', () => {
        setup(tpl);
        const pages = _deckPageList();
        const b = pages.filter(d => d._install && d.elev && d.elev.id === 'w1');
        if (b.length !== 1) throw new Error('expected one breaker for the ART.1 / ART.2 wall, got ' + b.length + ' (the bug is 2)');
        if (b[0].title !== 'ART.1 / ART.2') throw new Error('shared breaker title: ' + b[0].title);
        const at = pages.indexOf(b[0]);
        const next = pages.slice(at + 1, at + 3).map(d => d.row && d.row.id);
        if (next.join(',') !== 'ART.1,ART.2') throw new Error('the two spec pages should follow the breaker: ' + next.join(','));
        const w2 = pages.filter(d => d._install && d.elev && d.elev.id === 'w2');
        if (w2.length !== 1) throw new Error('three placements on one wall: ' + w2.length + ' breakers');
        if (breakers().length !== 3) throw new Error('three walls should give three breakers, got ' + breakers().length);
      });
    });
    __check('the shared breaker keeps the FIRST placement\\'s page key, so its settings stay', () => {
      setup('frameSpecDetail');
      const b = breakers().find(d => d.elev && d.elev.id === 'w1');
      if (b._ovKey !== 'elevgrp:ART.1') throw new Error('ovKey ' + b._ovKey);
      if (_deckPageKey(b) !== 'spec:elevgrp:ART.1') throw new Error('page key ' + _deckPageKey(b));
    });
    __check('pieces on DIFFERENT walls still get a breaker each', () => {
      setup('frameSpecDetail');
      elevations[0].frames = [fr('ART.1', 'A', 34, 31)];
      elevations.push({ id: 'w4', name: 'ART.2 | Lobby', wallW: 120, wallH: 108, frames: [fr('ART.2', 'A', 40, 31)] });
      const t = breakers().map(d => d.title);
      if (t.indexOf('ART.1') < 0 || t.indexOf('ART.2') < 0) throw new Error('lost a breaker: ' + t.join(' | '));
    });
    __check('a wall that is only a skipped flat graphic does not swallow the framed piece\\'s breaker', () => {
      setup('frameSpecDetail');
      dashProjectData.find(r => r.id === 'ART.1').product = 'Wallcovering (EGD)';
      const b = breakers().filter(d => d.elev && d.elev.id === 'w1');
      if (b.length !== 1 || b[0].title !== 'ART.2') throw new Error('expected ART.2 to earn the breaker: ' + b.map(d => d.title).join(' | '));
    });

    // ── 2. SUGGEST, NEVER REGROUP ──
    __check('codes 4" apart on one wall are suggested as a set; 189" apart are not', () => {
      setup('frameSpecDetail');
      const s = _codesSetSuggestions();
      if (s.length !== 1) throw new Error('expected one suggestion, got ' + s.map(x => x.keys.join(',')).join(' | '));
      if (s[0].keys.join(',') !== 'ART.3,ART.4,ART.5') throw new Error('keys ' + s[0].keys.join(','));
      if (Math.abs(s[0].gapIn - 4) > 0.01) throw new Error('gap ' + s[0].gapIn);
      if (_codesJoinPlan(s[0].keys).label !== 'ART.3A, 3B, 3C') throw new Error('label ' + _codesJoinPlan(s[0].keys).label);
      // nothing was renamed by asking
      if (dashProjectData.map(r => r.id).join(' ') !== 'ART.1 ART.2 ART.3 ART.4 ART.5 ART.6A ART.6B') throw new Error('suggesting changed codes');
    });
    __check('the gap is in INCHES whatever the elevation unit', () => {
      setup('frameSpecDetail');
      elevUnit = 'cm';
      elevations.forEach(e => e.frames.forEach(f => { f.x *= 2.54; f.w *= 2.54; f.y *= 2.54; f.h *= 2.54; }));
      if (_codesSetSuggestions().length !== 1) throw new Error('cm walls: ' + _codesSetSuggestions().length);
    });
    __check('Keep apart silences the suggestion, and survives a renumber', () => {
      setup('frameSpecDetail');
      const s = _codesSetSuggestions()[0];
      _codesKeepApart(s.ids);
      if (_codesSetSuggestions().length) throw new Error('still suggested after Keep apart');
      // Deleting ART.1 renumbers everything; the answer must follow the rows.
      dashProjectData = dashProjectData.filter(r => r.id !== 'ART.1');
      elevations[0].frames = elevations[0].frames.filter(f => f.id !== 'ART.1');
      _codesSettle();
      if (dashProjectData.map(r => r.id).join(' ') !== 'ART.1 ART.2 ART.3 ART.4 ART.5A ART.5B') throw new Error('fixture: settle did not renumber: ' + dashProjectData.map(r => r.id).join(' '));
      if (_codesSetSuggestions().length) throw new Error('Keep apart lost across a renumber: ' + JSON.stringify(editorialContent.codeSetsApart));
    });
    __check('Join: ART.3/4/5 become ART.3A/B/C, later codes close the gap, wall names follow', () => {
      setup('setLegend');
      const res = _codesJoinSet(['ART.5', 'ART.3', 'ART.4']);
      if (!res) throw new Error('join refused');
      const ids = dashProjectData.map(r => r.id).join(' ');
      if (ids !== 'ART.1 ART.2 ART.3A ART.3B ART.3C ART.4A ART.4B') throw new Error('codes after join: ' + ids);
      const fids = elevations[1].frames.map(f => f.id).join(' ');
      if (fids !== 'ART.3A ART.3B ART.3C') throw new Error('wall frames: ' + fids);
      if (elevations[1].name !== 'ART.3A / 3B / 3C | Circulation C-101') throw new Error('joined wall name: ' + elevations[1].name);
      if (elevations[2].name !== 'ART.4A / 4B | Kitchenette') throw new Error('renumbered wall name: ' + elevations[2].name);
      if (elevations[0].name !== 'ART.1 / 2 | Circulation C-102') throw new Error('untouched wall renamed: ' + elevations[0].name);
      const b = breakers().find(d => d.elev && d.elev.id === 'w2');
      if (!b || b.title !== 'ART.3ABC') throw new Error('joined set breaker: ' + (b && b.title));
      if (_codesSetSuggestions().length) throw new Error('still suggested after the join');
    });
    __check('a wall name that is not a code list is never rewritten', () => {
      setup('frameSpecDetail');
      elevations[1].name = 'Circulation feature wall';
      elevations[2].name = 'ART.6A LOBBY';
      _codesJoinSet(['ART.3', 'ART.4', 'ART.5']);
      if (elevations[1].name !== 'Circulation feature wall') throw new Error(elevations[1].name);
      if (elevations[2].name !== 'ART.6A LOBBY' && elevations[2].name !== 'ART.4A LOBBY') throw new Error(elevations[2].name);
    });
    __check('catalogue walls and flat graphics are never suggested', () => {
      setup('frameSpecDetail');
      dashProjectData.find(r => r.id === 'ART.4').product = 'Wallcovering (EGD)';
      const s = _codesSetSuggestions();
      if (s.length) throw new Error('a wallcovering joined a set: ' + s[0].keys.join(','));
      setup('frameSpecDetail');
      elevations[1].catalogueMaster = true;
      if (_codesSetSuggestions().length) throw new Error('a catalogue mockup was suggested');
    });
    __check('the wall shows the suggestion quietly, with Make and Keep apart', () => {
      setup('frameSpecDetail');
      currentElevIndex = 1;
      _elevSetHintSync();
      const box = document.getElementById('wallSetHint');
      if (!box || box.style.display === 'none') throw new Error('hint hidden on the suggested wall');
      const btns = box.querySelectorAll('button');
      if (btns.length !== 2 || btns[0].textContent !== 'Make ART.3A, 3B, 3C') throw new Error('buttons: ' + Array.from(btns).map(b => b.textContent).join(' | '));
      currentElevIndex = 0; _elevSetHintSync();
      if (box.style.display !== 'none') throw new Error('hint shown on a wall with nothing to suggest');
    });

    // ── 3. PREFLIGHT WEARS ITS RESULT ──
    __check('Preflight lists the set as a warning with Make set / Keep apart', () => {
      setup('frameSpecDetail');
      const it = _dsRunPreflight().find(x => x.set);
      if (!it || it.sev !== 'warn') throw new Error('no set warning');
      _dsShowPreflight();
      const m = document.getElementById('_dsPreflightModal');
      if (!m.querySelector('[data-pf-act=join]') || !m.querySelector('[data-pf-act=apart]')) throw new Error('row buttons missing');
      m.remove();
    });
    __check('the Preflight buttons turn red / amber with a count, and clear', () => {
      const b = document.getElementById('dsPreflightBtn');
      const p = document.getElementById('projPreflightBtn');
      if (!b || !p) throw new Error('buttons missing');
      _pfBadgePaint([{ sev: 'warn' }, { sev: 'spell' }]);
      if (b.getAttribute('data-pf') !== 'warn' || b.getAttribute('data-pf-n') !== '1') throw new Error('warn: ' + b.getAttribute('data-pf') + ' ' + b.getAttribute('data-pf-n'));
      _pfBadgePaint([{ sev: 'warn' }, { sev: 'err' }]);
      if (p.getAttribute('data-pf') !== 'err' || p.getAttribute('data-pf-n') !== '2') throw new Error('err: ' + p.getAttribute('data-pf'));
      _pfBadgePaint([{ sev: 'spell' }]);
      if (b.getAttribute('data-pf') !== 'ok') throw new Error('spelling alone coloured it');
      const css = fs_css;
      if (css.indexOf('[data-pf="err"]::before') < 0 || css.indexOf('[data-pf="warn"]::before') < 0) throw new Error('badge CSS missing');
    });
    __check('running Preflight writes nothing into the project (it now runs in the background)', () => {
      setup('frameSpecDetail');
      delete editorialContent.spellIgnore;
      _dsRunPreflight();
      if ('spellIgnore' in editorialContent) throw new Error('a read seeded spellIgnore');
    });
  `;

  try {
    const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
    window.eval('const fs_css = ' + JSON.stringify(css) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = window.__testResults || [];
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
