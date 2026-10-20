// REPORTED BUG: "the EGD is getting an elevation breaker page in the generated PDF
// even though it is not showing in Deck Studio."
//
// (18.32: there is now ONE. The export walks _deckPageList; see test_export_walks_deck.)
// Cause: there were TWO page-list builders. _deckPageList drives Deck Studio; the PDF
// export's _stepsFor mirrors it BY HAND and its own comment says "Mirrors
// _deckPageList". The flat-graphic breaker skip was written inline in _deckPageList
// only, so the studio dropped the breaker and the export still printed one.
//
// A comment saying "mirrors X" is not a mechanism. Both now call the same
// _breakerSkipUnit, and the same _partitionFlatMembers for the Group A/B/C split —
// which was the SECOND divergence of the same kind, found while fixing the first:
// the export routed a grouped wallcovering through _drawSpecSetPageBody and drew it
// as a set member (a letter, a frame mockup of a 240" wall, unstyled spec text) while
// the studio showed the correct egdDetail sheet.
//
// These checks are deliberately about AGREEMENT rather than about either builder's
// output on its own — a page the preview doesn't show is the whole complaint.
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
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const S = window.__appSrc;
    scheduleAutosave = () => {}; pushHistory = () => {};

    // Since 18.32 the export has no page list of its own; it walks the studio's.
    const __exportWalksStudio = () => {
      const a = S.indexOf('async function _buildSpecPagePDF');
      const body = S.slice(a, S.indexOf('\\nasync function exportDashNativePNG', a));
      if (body.indexOf('const pages = _deckPageList();') < 0) throw new Error('the PDF export no longer walks _deckPageList');
    };
    const flat = (id) => ({ id: id, product: 'Wallcovering (EGD)', extW: 192, extH: 120, location: 'Lobby' });
    const framed = (id) => ({ id: id, product: 'Framed Art', extW: 24, extH: 30, location: 'Lobby' });

    // ── The reported bug ────────────────────────────────────────────────────
    __check('EXACT BUG: a wallcovering-only wall skips its breaker in BOTH builders', () => {
      // The studio's rule, now shared. If these two ever disagree again, the PDF
      // grows a page the preview never showed.
      editorialContent.breakerSkipFlat = undefined;      // absent reads as ON
      if (!_breakerSkipUnit([flat('EGD-1')])) throw new Error('a lone wallcovering should skip its breaker');
      if (!_breakerSkipUnit([flat('EGD-1'), flat('EGD-2')])) throw new Error('an all-flat wall should skip its breaker');
    });

    __check('a framed wall still gets its breaker — the skip is per product, not deck-wide', () => {
      // A breaker shows a hang no single spec page can. Presentations mix the two,
      // so this must not become a global switch.
      if (_breakerSkipUnit([framed('ART-1')])) throw new Error('framed art lost its breaker');
      // Mixed: there is framed art on this wall, so the hang is still worth showing.
      if (_breakerSkipUnit([flat('EGD-1'), framed('ART-1')])) throw new Error('a mixed wall should keep its breaker');
      if (_breakerSkipUnit([])) throw new Error('an empty unit should not claim a skip');
      if (_breakerSkipUnit(null)) throw new Error('null members should not claim a skip');
    });

    __check('the skip is defeatable, and OFF means the breaker comes back everywhere', () => {
      editorialContent.breakerSkipFlat = false;
      if (_breakerSkipUnit([flat('EGD-1')])) throw new Error('with the setting off a flat wall should keep its breaker');
      editorialContent.breakerSkipFlat = true;
      if (!_breakerSkipUnit([flat('EGD-1')])) throw new Error('with the setting on it should skip again');
      editorialContent.breakerSkipFlat = undefined;
    });

    __check('the one page list calls the shared predicate, and the PDF walks that list', () => {
      // This is the actual regression guard. The bug was a clause living in one
      // builder while the other had a comment claiming to mirror it.
      const uses = (S.match(/_breakerSkipUnit\\(/g) || []).length;
      // 18.32: the definition plus ONE caller. The export walks _deckPageList, so a
      // second caller would mean a second page list had grown back.
      // 19.44: plus _breakerWallShare, which asks it so a skipped flat-only unit never
      // earns the wall's one breaker. It is a helper of _breakerElevFor, not a page list.
      if (uses !== 3) throw new Error('expected the definition, _deckPageList and _breakerWallShare, found ' + uses + ' mentions');
      const sh = S.indexOf('function _breakerWallShare');
      if (sh < 0 || S.slice(sh, S.indexOf('\\n}', sh)).indexOf('_breakerSkipUnit(') < 0) throw new Error('the third mention is not _breakerWallShare');
      // The studio builder.
      const dpl = S.indexOf('function _deckPageList');
      if (dpl < 0) throw new Error('_deckPageList not found');
      if (S.slice(dpl, dpl + 12000).indexOf('_breakerSkipUnit(') < 0) throw new Error('_deckPageList does not use the shared predicate');
      // The export. Since 18.32 it has no builder of its own: it walks _deckPageList,
      // so it cannot print a breaker the studio skipped (test_export_walks_deck runs it).
      __exportWalksStudio();
      // And the old inline copy must not come back.
      if (S.indexOf('_flatOnly && _breakerSkipFlat()') >= 0) throw new Error('the inline copy of the skip is back in _deckPageList');
    });

    // ── The second divergence, found while fixing the first ────────────────
    __check('_partitionFlatMembers pulls flat graphics out of a group unit', () => {
      const p = _partitionFlatMembers([framed('A'), flat('EGD-1'), framed('B')]);
      if (!p) throw new Error('a group containing a wallcovering must split');
      if (p.flats.length !== 1 || p.flats[0].id !== 'EGD-1') throw new Error('wrong flats');
      if (p.rest.length !== 2) throw new Error('the framed members should be left as a group');
      // Null when there is nothing to split, so the common path is untouched.
      if (_partitionFlatMembers([framed('A'), framed('B')])) throw new Error('an all-framed group should not split');
      if (_partitionFlatMembers([])) throw new Error('an empty group should not split');
    });

    __check('EXACT BUG 2: the PDF splits flat graphics out of Group A/B/C too', () => {
      // Without this the export renders a wallcovering through _drawSpecSetPageBody:
      // a letter, a frame mockup of a 240" wall, unstyled spec text. The studio
      // preview beside it shows the correct egdDetail sheet.
      // 18.32: the PDF walks _deckPageList, so the studio's split IS the export's split.
      __exportWalksStudio();
      // Both studio paths, breaker and non-breaker, go through it.
      const dpl = S.indexOf('function _deckPageList');
      const body = S.slice(dpl, S.indexOf('\\nfunction ', dpl + 10));
      if (body.split('_splitFlatUnits(u)').length - 1 < 2) throw new Error('only one of the breaker / non-breaker paths splits flats');
      // And the one dispatch sends a flat page to its own sheet BEFORE the generic
      // template branch, where egdDetail's custom flag would draw a frame mockup.
      const d = S.indexOf('async function _drawDeckSpecPage');
      const db = S.slice(d, S.indexOf('\\n}\\n', d));
      if (db.indexOf('T.flat') < 0 || db.indexOf('T.flat') > db.indexOf('_drawSpecPageTemplate(')) throw new Error('the flat branch is missing or sits behind the template branch');
    });

    __check('a MANUAL group is left alone in both builders — it is the user instruction', () => {
      // One builder now (18.32); its non-breaker call site is guarded on _manual.
      const dpl = S.indexOf('function _deckPageList');
      if (S.slice(dpl, dpl + 12000).indexOf('if (!u._manual) { const sp = _splitFlatUnits(u)') < 0) throw new Error('_deckPageList splits manual groups, or lost its split');
      __exportWalksStudio();
    });

    __check('the studio split now delegates to the shared partition, not its own filter', () => {
      const i = S.indexOf('const _splitFlatUnits = (u) =>');
      if (i < 0) throw new Error('_splitFlatUnits not found');
      const body = S.slice(i, i + 900);
      if (body.indexOf('_partitionFlatMembers(') < 0) throw new Error('_splitFlatUnits still filters for itself');
      // Its own copy of the predicate would be the next thing to drift.
      if (body.indexOf('members.filter(m => m && _isFlatGraphic') >= 0) throw new Error('the local filter is back');
    });

    __check('a split-out flat page keeps the group key on the framed remainder', () => {
      // Same key, so per-page settings and approval stay attached and the page count
      // stays right rather than a set silently losing pieces.
      const sf = S.indexOf('const _splitFlatUnits = (u) =>');
      const body = S.slice(sf, sf + 1600);
      if (body.indexOf('Object.assign({}, u, { members: rest') < 0) {
        throw new Error('the framed remainder does not inherit the group unit');
      }
    });
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const all = window.__testResults || [];
  let failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
