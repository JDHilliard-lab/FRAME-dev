// REPORTED BUG: "the EGD is getting an elevation breaker page in the generated PDF
// even though it is not showing in Deck Studio."
//
// Cause: there are TWO page-list builders. _deckPageList drives Deck Studio; the PDF
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

    __check('BOTH page-list builders call the shared predicate — not one, not a copy', () => {
      // This is the actual regression guard. The bug was a clause living in one
      // builder while the other had a comment claiming to mirror it.
      const uses = (S.match(/_breakerSkipUnit\\(/g) || []).length;
      if (uses < 3) throw new Error('expected the definition plus both callers, found ' + uses + ' mentions');
      // The studio builder.
      const dpl = S.indexOf('function _deckPageList');
      if (dpl < 0) throw new Error('_deckPageList not found');
      if (S.slice(dpl, dpl + 12000).indexOf('_breakerSkipUnit(') < 0) throw new Error('_deckPageList does not use the shared predicate');
      // The export builder.
      const sf = S.indexOf('const _stepsFor = (u, li) =>');
      if (sf < 0) throw new Error('_stepsFor not found');
      if (S.slice(sf, sf + 3000).indexOf('_breakerSkipUnit(') < 0) {
        throw new Error('the PDF export still pushes a breaker without asking the shared predicate');
      }
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
      const sf = S.indexOf('const _specStepsFor = (u, li) =>');
      if (sf < 0) throw new Error('the export has no flat-split step builder');
      const body = S.slice(sf, sf + 1400);
      if (body.indexOf('_partitionFlatMembers(') < 0) throw new Error('it does not use the shared partition');
      if (body.indexOf("_forceTpl: 'egdDetail'") < 0) throw new Error('a split-out flat page must force its own sheet');
      // _forceTpl matters specifically: the dispatch tests
      // "!step._forceTpl && _specIsGroup" FIRST, so without it the page falls
      // straight back into the set renderer this split exists to avoid.
      const disp = S.indexOf('if (!step._forceTpl && (_specIsGroup || step.unit._manual))');
      if (disp < 0) throw new Error('the group dispatch branch changed shape — recheck that _forceTpl still bypasses it');
      // Both export paths, breaker and non-breaker, must go through it.
      const stepsFor = S.slice(S.indexOf('const _stepsFor = (u, li) =>'), S.indexOf('const _stepsFor = (u, li) =>') + 3000);
      if ((stepsFor.match(/_specStepsFor\\(/g) || []).length < 2) {
        throw new Error('only one of the breaker / non-breaker export paths splits flats');
      }
    });

    __check('a MANUAL group is left alone in both builders — it is the user instruction', () => {
      const sf = S.indexOf('const _specStepsFor = (u, li) =>');
      if (S.slice(sf, sf + 1400).indexOf('!u._manual') < 0) throw new Error('the export splits manual groups');
      // The studio agrees (its call site is guarded the same way).
      const dpl = S.indexOf('function _deckPageList');
      if (S.slice(dpl, dpl + 12000).indexOf('_splitFlatUnits') < 0) throw new Error('_deckPageList lost its split');
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
      const sf = S.indexOf('const _specStepsFor = (u, li) =>');
      const body = S.slice(sf, sf + 1400);
      if (body.indexOf('Object.assign({}, u, { members: part.rest') < 0) {
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
