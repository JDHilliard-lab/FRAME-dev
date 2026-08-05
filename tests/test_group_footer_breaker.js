// Two reported bugs, both in Group A/B/C ("Set") spec mode:
//
//  1. "My footer is missing when I have the spec set to Group A/B/C."
//     _drawSpecSetPage has three exit paths (side-by-side, to-scale, stacked)
//     and NONE of them called _drawPdfFooter, so every Group A/B/C page shipped
//     with no page number, no project line and no logo.
//  2. "I would like the ability to add an elevation breaker page to the
//     Group A/B/C option since I might use this as an install-guide deck."
//     The breaker toggle was gated off in group mode (`!isGroupSpec`) and its
//     checkbox only existed inside the Per-piece tools branch.
//
// Plus the general ask: "can we make sure all pages end up getting a footer" —
// covered by the _pdfFooterDrawn ledger + the end-of-build sweep.
const { JSDOM } = require('jsdom');
const fs = require('fs');

(async () => {
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => {
      try { fn(); window.__testResults.push({ label, ok: true }); }
      catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); }
    };
    // Async checks run SERIALLY: several of them swap the global
    // _drawPdfFooter for a spy, and interleaving them would let one check's
    // stub eat another's calls (a real false-negative we hit while writing this).
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __checkAsync = (label, fn) => {
      __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true }))
        .catch(e => ({ label, ok: false, err: e.message })));
      window.__asyncChecks.push(__chain);
    };

    scheduleAutosave = () => {}; pushHistory = () => {};
    _dsRenderRail = () => {}; _dsRenderCenter = () => {}; _dsRenderTools = () => {};
    _dsClearBuiltAll = () => {}; _dsRefresh = () => {};

    // Three pieces that _artGroupKey folds into ONE group: ART-2.1-A/-B/-C.
    const GROUP_ROWS = [
      { id: 'ART-2.1-A', imageCode: 'IMG-A', level: 0, location: 'Lobby', extW: 24, extH: 36 },
      { id: 'ART-2.1-B', imageCode: 'IMG-B', level: 0, location: 'Lobby', extW: 24, extH: 36 },
      { id: 'ART-2.1-C', imageCode: 'IMG-C', level: 0, location: 'Lobby', extW: 24, extH: 36 }
    ];
    const resetProject = () => {
      editorialContent = _editorialDefaults();
      editorialContent.annotations = {};
      editorialContent.pageFooters = {};
      dashProjectData = GROUP_ROWS.map(r => Object.assign({}, r));
      elevations = [{ name: 'WALL A', wallW: 240, wallH: 96, frames: GROUP_ROWS.map((r, i) => ({ id: r.id, letter: 'ABC'[i], x: 0.2 + i * 0.2, y: 0.4, w: 0.12, h: 0.18, active: true, dimTo: [] })) }];
      floorplanLevels = [{ name: 'Level 1', imageData: '' }];
    };

    // ── 1. THE EXACT REPORTED BUG: a Group A/B/C page draws no footer ──
    // Every one of the three set arrangements must call _drawPdfFooter exactly
    // once, for the page number it was handed.
    __checkAsync('EXACT BUG: every Group A/B/C arrangement draws a footer', async () => {
      resetProject();
      const realFooter = _drawPdfFooter;
      const calls = [];
      _drawPdfFooter = (doc, logos, pageNum, meta) => { calls.push(pageNum); };
      try {
        const unit = { rep: dashProjectData[0], members: dashProjectData, key: 'ART-2.1' };
        for (const tpl of ['setRight', 'setRow', 'setScale', 'setLegend']) {
          calls.length = 0;
          const rec = new CanvasPdfRec(936, 540);
          await _drawSpecSetPage(rec, {}, 7, { location: 'Lobby', code: 'PRJ', version: '1' }, unit, tpl, { PW: 936, PH: 540, M: 40 });
          if (calls.length !== 1) throw new Error(tpl + ': expected exactly 1 footer, got ' + calls.length + ' (the reported bug is 0)');
          if (calls[0] !== 7) throw new Error(tpl + ': footer drawn for page ' + calls[0] + ', expected 7');
        }
      } finally { _drawPdfFooter = realFooter; }
    });

    // A body that blows up mid-draw (bad ctx, missing artwork, whatever) must
    // still leave a footer behind — that's why the footer lives in the wrapper.
    __checkAsync('a set page whose body throws still gets its footer', async () => {
      resetProject();
      const realFooter = _drawPdfFooter;
      const calls = [];
      _drawPdfFooter = (doc, logos, pageNum) => { calls.push(pageNum); };
      try {
        const rec = new CanvasPdfRec(936, 540);
        let threw = false;
        try {
          // No ctx at all -> the body dies on ctx.PW immediately.
          await _drawSpecSetPage(rec, {}, 3, {}, { rep: dashProjectData[0], members: dashProjectData, key: 'ART-2.1' }, 'setRight', null);
        } catch (e) { threw = true; }
        if (!threw) throw new Error('expected the body to throw with a null ctx; the check below proves nothing otherwise');
        if (calls.length !== 1 || calls[0] !== 3) throw new Error('no footer after the body threw: ' + JSON.stringify(calls));
      } finally { _drawPdfFooter = realFooter; }
    });

    // The footer really renders text (page number + project line), not just a
    // no-op call: recorded ops on the canvas recorder must include the number.
    __checkAsync('the set page footer actually paints the page number and project line', async () => {
      resetProject();
      const rec = new CanvasPdfRec(936, 540);
      _curPageKey = 'spec:ART-2.1';
      _curFooter = _resolveFooter('spec:ART-2.1');
      await _drawSpecSetPage(rec, {}, 12, { location: 'LOBBY', code: 'PRJ-9', version: '2' }, { rep: dashProjectData[0], members: dashProjectData, key: 'ART-2.1' }, 'setRight', { PW: 936, PH: 540, M: 40 });
      const texts = (rec.ops || []).filter(o => o && o.t === 'text').map(o => Array.isArray(o.str) ? o.str.join(' ') : ('' + (o.str == null ? '' : o.str)));
      if (!texts.some(s => s.trim() === '12')) throw new Error('page number 12 never drawn; footer text ops: ' + JSON.stringify(texts.slice(-6)));
      if (!texts.some(s => s.indexOf('PRJ-9.2') >= 0)) throw new Error('project code.version never drawn: ' + JSON.stringify(texts.slice(-6)));
    });

    // ── 2. Breaker pages in Group A/B/C mode ──
    __check('EXACT REQUEST: breakers on + Group A/B/C emits [elevation breaker, ONE grouped spec page]', () => {
      resetProject();
      editorialContent.specTemplate = 'setRight';
      editorialContent.elevBreakers = true;
      const specs = _deckPageList().filter(d => d.kind === 'spec');
      if (!specs.length) throw new Error('no spec pages at all');
      const breakers = specs.filter(d => d._install);
      if (breakers.length !== 1) throw new Error('expected 1 elevation breaker for the one wall group, got ' + breakers.length + ' (0 = the feature is still gated off in group mode)');
      if (breakers[0]._ovKey !== 'elevgrp:ART-2.1') throw new Error('breaker carries the wrong ovKey: ' + breakers[0]._ovKey);
      if (breakers[0].title !== 'ART-2.1ABC') throw new Error('breaker title should be the combined group code: ' + breakers[0].title);
      const grouped = specs.filter(d => !d._install);
      if (grouped.length !== 1) throw new Error('group mode must still put A/B/C on ONE page, got ' + grouped.length + ' spec pages');
      if ((grouped[0].members || []).length !== 3) throw new Error('the grouped page lost members: ' + JSON.stringify((grouped[0].members || []).map(m => m.id)));
      if (grouped[0]._specTpl !== 'setRight') throw new Error('grouped page was re-routed to a per-piece template: ' + grouped[0]._specTpl);
      if (specs.indexOf(breakers[0]) > specs.indexOf(grouped[0])) throw new Error('the breaker must come BEFORE its spec page');
    });

    __check('breakers off in Group A/B/C mode still emits just the one grouped page', () => {
      resetProject();
      editorialContent.specTemplate = 'setRight';
      editorialContent.elevBreakers = false;
      const specs = _deckPageList().filter(d => d.kind === 'spec');
      if (specs.some(d => d._install)) throw new Error('a breaker appeared with the toggle off');
      if (specs.length !== 1) throw new Error('expected exactly 1 grouped spec page, got ' + specs.length);
    });

    __check('Per-piece mode is unchanged: breaker + one page per piece', () => {
      resetProject();
      editorialContent.specTemplate = 'frameRight';
      editorialContent.elevBreakers = true;
      const specs = _deckPageList().filter(d => d.kind === 'spec');
      const breakers = specs.filter(d => d._install);
      const singles = specs.filter(d => !d._install);
      if (breakers.length !== 1) throw new Error('expected 1 breaker, got ' + breakers.length);
      if (singles.length !== 3) throw new Error('per-piece mode must keep one page per piece, got ' + singles.length);
    });

    __check('Install-guide mode still opts out of breakers (it already draws every wall)', () => {
      resetProject();
      editorialContent.specTemplate = 'installGuide';
      editorialContent.elevBreakers = true;
      const specs = _deckPageList().filter(d => d.kind === 'spec');
      const grpBreakers = specs.filter(d => d._install && ('' + d._ovKey).indexOf('elevgrp:') === 0);
      if (grpBreakers.length) throw new Error('install-guide mode grew duplicate breaker pages: ' + grpBreakers.length);
    });

    // The export walk builds its own plan (_stepsFor); it must agree with
    // _deckPageList or the PDF and the studio disagree about page count.
    __check('the EXPORT walk also allows breakers in group mode and follows them with the grouped page', () => {
      const s = window.__appSrc;
      const gate = s.match(/const _useBreakers = _elevBreakers\\(\\)[^;]*;/g) || [];
      if (gate.length !== 2) throw new Error('expected 2 _useBreakers gates (studio + export), found ' + gate.length);
      gate.forEach(g => { if (/_specIsGroup|isGroupSpec/.test(g)) throw new Error('a _useBreakers gate still excludes group mode: ' + g); });
      // ONE grouped spec page after the breaker, not a page per member. 16.53 routed
      // this through _specStepsFor so a flat graphic can be split onto its own sheet
      // (the export used to draw a wallcovering as a set member), but the grouped
      // case must still collapse to the single unit — which is what _specStepsFor
      // returns when nothing in the group is flat.
      if (!/if \\(_specIsGroup\\) out\\.push\\.apply\\(out, _specStepsFor\\(u, li\\)\\);/.test(s)) throw new Error('the export breaker step does not emit the single grouped spec page');
      if (!/return \\[\\{ type: 'spec', unit: u, li: li \\}\\];/.test(s)) throw new Error('_specStepsFor no longer falls back to the single grouped unit');
    });

    // ── 3. "Make sure ALL pages end up getting a footer" ──
    __check('_drawPdfFooter records into the build ledger, including hidden-footer pages', () => {
      const rec = new CanvasPdfRec(936, 540);
      _pdfFooterDrawn = {};
      _curFooter = { text: 'dark', leftTheme: 'dark' };
      _drawPdfFooter(rec, {}, 4, { location: '', code: '', version: '' });
      if (!_pdfFooterDrawn[4]) throw new Error('page 4 not marked in the ledger');
      // A page that deliberately hides its footer must still be marked, or the
      // sweep would "repair" it and force a footer the user turned off.
      _curFooter = { text: 'dark', leftTheme: 'dark', hideFooter: true };
      _drawPdfFooter(rec, {}, 5, { location: '', code: '', version: '' });
      if (!_pdfFooterDrawn[5]) throw new Error('a hideFooter page was left unmarked, so the sweep would override the opt-out');
      _pdfFooterDrawn = null;
      // Outside a build the ledger is null and must not blow up.
      _curFooter = { text: 'dark', leftTheme: 'dark' };
      _drawPdfFooter(rec, {}, 6, { location: '', code: '', version: '' });
    });

    __check('the PDF build sweeps any page a drawer forgot', () => {
      const s = window.__appSrc;
      if (!/_pdfFooterDrawn = \\{\\};/.test(s)) throw new Error('the build never opens a footer ledger');
      const sweep = s.indexOf('Footer safety sweep');
      if (sweep < 0) throw new Error('no end-of-build footer sweep');
      const annPass = s.indexOf('_drawAnnotations(doc, _pageKeys[p], PW, PH)');
      if (annPass < 0 || sweep > annPass) throw new Error('the sweep must run BEFORE the annotation pass so annotations stay on top');
      const body = s.slice(sweep, sweep + 1400);
      if (body.indexOf('if (_pdfFooterDrawn[p]) continue;') < 0) throw new Error('the sweep does not skip pages that already have a footer');
      if (body.indexOf('_resolveFooter(k)') < 0) throw new Error('the sweep does not resolve the page\\'s own footer theme');
    });

    // ── 4. The toggle is reachable from the group-mode tools panel ──
    __check('the breaker checkbox renders in BOTH Per-piece and Group A/B/C tools', () => {
      resetProject();
      const mk = () => { const d = document.createElement('div'); _dsBreakerToggleInto(d, false); return d; };
      // 16.45: a THIRD checkbox joined the block — skip breakers for wallcovering /
      // window film, whose own sheet already carries the dimensioned elevation, while
      // framed-art walls keep theirs. Asserting WHICH three rather than a bare count,
      // so a future addition fails with a useful message instead of an off-by-one.
      const labelsOf = (el) => el.textContent;
      const perPiece = mk();
      if (perPiece.querySelectorAll('input[type=checkbox]').length !== 3) throw new Error('per-piece block should have breaker + elevation-only + skip-flat checkboxes');
      if (perPiece.textContent.indexOf('Add elevation breaker page') < 0) throw new Error('breaker label missing');
      if (perPiece.textContent.indexOf('Elevation only') < 0) throw new Error('elevation-only label missing');
      if (perPiece.textContent.indexOf('wallcovering / window film') < 0) throw new Error('skip-flat label missing');
      if (perPiece.textContent.indexOf('these individual spec pages') < 0) throw new Error('per-piece wording missing');
      const grp = document.createElement('div');
      _dsBreakerToggleInto(grp, true);
      if (grp.querySelectorAll('input[type=checkbox]').length !== 3) throw new Error('group block should have the same three checkboxes');
      if (labelsOf(grp).indexOf('wallcovering / window film') < 0) throw new Error('the group panel is missing the skip-flat option');
      if (grp.textContent.indexOf('A/B/C spec page') < 0) throw new Error('group wording missing: ' + grp.textContent.slice(0, 200));
      // and the group branch of the tools panel must actually call it
      if (!/_dsBreakerToggleInto\\(head, true\\)/.test(window.__appSrc)) throw new Error('the Group A/B/C tools branch never calls _dsBreakerToggleInto');
      if (!/_dsBreakerToggleInto\\(head, false\\)/.test(window.__appSrc)) throw new Error('the Per-piece tools branch never calls _dsBreakerToggleInto');
    });

    __check('the checkbox writes elevBreakers / breakerNoPlan straight through', () => {
      resetProject();
      const d = document.createElement('div');
      _dsBreakerToggleInto(d, true);
      const cbs = d.querySelectorAll('input[type=checkbox]');
      cbs[0].checked = true; cbs[0].onchange();
      if (!_elevBreakers()) throw new Error('elevBreakers not set');
      const d2 = document.createElement('div');
      _dsBreakerToggleInto(d2, true);
      const cbs2 = d2.querySelectorAll('input[type=checkbox]');
      if (cbs2[1].disabled) throw new Error('elevation-only stayed disabled after breakers were turned on');
      cbs2[1].checked = true; cbs2[1].onchange();
      if (!_breakerNoPlan()) throw new Error('breakerNoPlan not set');
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
  const asyncResults = await Promise.all(window.__asyncChecks || []);
  const all = results.concat(asyncResults);
  let failures = [];
  all.forEach(r => {
    console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err));
    if (!r.ok) failures.push(r.label);
  });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
