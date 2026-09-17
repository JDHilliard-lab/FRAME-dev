// The Project tab's Include-pages list.
//
// Two real bugs and one restructure are pinned here.
//
// (1) THE INCLUDE STATE WAS NEVER PERSISTED. `_dsInclude()` read the checkboxes
//     straight off the DOM and nothing ever wrote them anywhere, while
//     `editorialContent.presentationType` WAS saved. So picking Final Spec,
//     saving and reopening gave you the Final Spec button lit next to every
//     checkbox back at its markup default: the preset looked applied and was
//     not. The checkboxes are project data and now live in
//     `editorialContent.includePages`.
//
// (2) TWO HARDCODED KEY LISTS. `_dsInclude` read ten keys and
//     `applySpecPdfModal` read eleven. That is the drift this file keeps paying
//     for, so there is one `DECK_INCLUDE_PAGES` now.
//
// (3) THE FLOORPLAN ORDER SELECT FLOATED BELOW THE WHOLE LIST, far enough from
//     the page it orders that designers never found it, and it stayed live when
//     Floorplan Key was unchecked — offering an ordering of pages the deck did
//     not contain. It is nested under its own checkbox and marked
//     `data-inc-sub`, which dims AND disables it. Dimming alone leaves a control
//     tabbable and still changeable from the keyboard, which is the "looks off,
//     edits anyway" trap.
//
// Source questions are asked in Node scope, where a backslash is a backslash.
// Only the behaviour half goes through window.eval, and it uses indexOf rather
// than regex throughout for the reason the rest of this folder does.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  const results = [];
  const check = (label, fn) => {
    try { fn(); results.push({ label, ok: true }); }
    catch (e) { results.push({ label, ok: false, err: e.message }); }
  };

  // Slice between two landmarks, and fail loudly if the closing one is not after
  // the opening one. A bare indexOf(end, start) returns -1 when the end landmark
  // sits EARLIER in the file, and slice(start, -1) then reads to the end of app.js
  // — which is how a source check silently starts matching unrelated code. That
  // happened here: the footer check found _dsAddFooter's own definition.
  const bodyOf = (startMark, endMark) => {
    const a = src.indexOf(startMark);
    if (a < 0) throw new Error('start landmark missing: ' + startMark);
    const b = src.indexOf(endMark, a + startMark.length);
    if (b < 0) throw new Error('end landmark ' + endMark + ' does not follow ' + startMark + ' — this check would read the rest of the file');
    return src.slice(a, b);
  };
  // ── Source-level ────────────────────────────────────────────────────────
  check('the floorplan order select sits BETWEEN Floorplan Key and the next page, not after the list', () => {
    const fpBox = htmlSrc.indexOf('id="specInc_floorplanKey"');
    const order = htmlSrc.indexOf('id="specPlanOrder"');
    const nextBox = htmlSrc.indexOf('id="specInc_spec"');
    if (fpBox < 0 || order < 0 || nextBox < 0) throw new Error('one of the three anchors is missing from index.html');
    if (!(fpBox < order && order < nextBox)) {
      throw new Error('order select is at ' + order + ', outside Floorplan Key (' + fpBox + ') .. Spec Pages (' + nextBox + ')');
    }
  });

  check('the order block declares its parent page with data-inc-sub', () => {
    const sub = htmlSrc.indexOf('data-inc-sub="floorplanKey"');
    const order = htmlSrc.indexOf('id="specPlanOrder"');
    if (sub < 0) throw new Error('no data-inc-sub="floorplanKey" in index.html');
    if (!(sub < order)) throw new Error('data-inc-sub wrapper does not open before the select it governs');
  });

  check('the select was MOVED, not copied — exactly one specPlanOrder in the markup', () => {
    const n = htmlSrc.split('id="specPlanOrder"').length - 1;
    if (n !== 1) throw new Error('expected 1 specPlanOrder, found ' + n);
  });

  check('the include list carries the id its one delegated listener binds to', () => {
    if (htmlSrc.indexOf('id="specIncList"') < 0) throw new Error('#specIncList missing — the change listener has nothing to bind to');
  });

  check('there is ONE key list, not a hardcoded set per reader', () => {
    if (src.indexOf('const DECK_INCLUDE_PAGES') < 0) throw new Error('DECK_INCLUDE_PAGES not defined');
    // The old inline list is what this replaced; its reappearance is the drift.
    if (src.indexOf("cover: ck('specInc_cover', true)") >= 0) {
      throw new Error('_dsInclude still builds its own hardcoded key list');
    }
  });

  check('include inputs are seeded from the same three places the plan order select is', () => {
    // boot / project load / undo restore. seedDeckPlanOrderInput has had these
    // three for a while; an include seed missing one is a page list that is
    // right until you undo.
    const plan = src.split('seedDeckPlanOrderInput()').length - 1;
    const inc = (src.split('seedDeckIncludeInputs()').length - 1) + (src.split('_dsIncludeInit()').length - 1);
    // Each name also appears once in its own declaration.
    if (plan < 4) throw new Error('expected 3 seedDeckPlanOrderInput call sites + 1 declaration, found ' + plan + ' total');
    if (inc < plan) throw new Error('include seeded from fewer places (' + inc + ') than the plan order select (' + plan + ')');
  });

  check('the preview strip uses the one tab component, not a fifth hand-rolled one', () => {
    if (src.indexOf("tabs.className = 'frame-tabs wrap'") < 0) throw new Error('the preview strip is not a .frame-tabs');
    if (src.indexOf("b.className = 'frame-tab' + (sec.key === _dsPreviewTab ? ' active' : '')") < 0) {
      throw new Error('tab state is not the .active class — a rewritten style string is how the other strips drifted');
    }
  });

  check('.frame-tabs.wrap exists, because ten tabs do not fit one line', () => {
    const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
    if (css.indexOf('.frame-tabs.wrap') < 0) throw new Error('no .frame-tabs.wrap rule — the strip overflows its column');
    if (css.indexOf('.frame-tabs.fit') < 0) throw new Error('.frame-tabs.fit went missing');
  });

  check('an ELEMENT page stops at the HTML mock and is never overwritten by the canvas', () => {
    // The canvas shim lacks Druk's metrics and overlaps large display type, which
    // is a known open item. The cover preview always avoided it for element pages;
    // generalising to every section had to keep that, or Cover / Narrative /
    // Strategy / Good Art all regress into the worse renderer.
    const body = bodyOf('async function _dsRenderCoverPreview()', 'function _dsOpenTemplateEditor');
    const guard = body.indexOf('if (hasEls)');
    const canvas = body.indexOf('renderDeckPageCanvas');
    if (guard < 0) throw new Error('the element-page early return is gone');
    if (canvas < 0) throw new Error('the canvas fallback is gone');
    if (!(guard < canvas)) throw new Error('the early return no longer precedes the canvas render');
  });

  check('a tab clicked mid-render cannot be painted over by the previous one', () => {
    const body = bodyOf('async function _dsRenderCoverPreview()', 'function _dsOpenTemplateEditor');
    if (body.indexOf('const token = ++_dsPreviewToken') < 0) throw new Error('no render token taken');
    const guards = body.split('token !== _dsPreviewToken').length - 1;
    if (guards < 2) throw new Error('only ' + guards + ' stale-token guard(s); the await points each need one');
  });

  check('the Spec tab reuses the shared demo builder, not a hand-rolled fake page', () => {
    if (src.indexOf('demo: () => _specTplDemoDesc(') < 0) {
      throw new Error('the spec preview does not go through _specTplDemoDesc — a second demo would drift from the template picker cards');
    }
  });

  check('element-page previews borrow _dsAddFooter rather than drawing their own', () => {
    // The footer is part of the page. Canvas pages already carry it from
    // _drawPdfFooter through the same doc the real PDF uses; the HTML mock has none,
    // and a second footer builder here would be a third geometry to keep in step.
    const body = bodyOf('async function _dsRenderCoverPreview()', 'function _dsOpenTemplateEditor');
    if (body.indexOf('_dsAddFooter(') < 0) throw new Error('no footer on the HTML-mock branch');
    if (src.indexOf('function _dsAddFooter') < 0) throw new Error('_dsAddFooter itself is gone');
  });

  check('type defaults moved to the Project tab and the Aa toolbar button is gone', () => {
    if (src.indexOf('function _dsTypeDefaultsInto') < 0) throw new Error('no Project-tab type block');
    if (htmlSrc.indexOf('dsTypeBtn') >= 0) throw new Error('the Aa toolbar button is still in the markup');
    if (src.indexOf('_dsOpenTypeMenu') >= 0) throw new Error('the Aa popup survives as dead code');
    if (src.indexOf("_dsTypeDefaultsInto(document.getElementById('dsProjType'))") < 0) {
      throw new Error('nothing renders the type block into the Project tab');
    }
  });

  check('_dsTypeSection survives the move — the four controls are not rebuilt by hand', () => {
    if (src.indexOf('function _dsTypeSection') < 0) throw new Error('_dsTypeSection was deleted with the popup');
    const body = bodyOf('function _dsTypeDefaultsInto', 'function _dsAnnCycleAlign');
    const uses = body.split('_dsTypeSection(').length - 1;
    if (uses !== 4) throw new Error('expected 4 _dsTypeSection rows (titles, subheadings, paragraphs, captions), found ' + uses);
    if (body.indexOf('_specFont()') < 0) throw new Error('the spec-text font control did not come across');
  });

  check('the caption default has ONE definition, and the old Druk seed cannot come back', () => {
    if (src.indexOf('function _specCodeStyleDefault') < 0) throw new Error('no single caption default');
    if (src.indexOf("font: 'display', size: 16, color: '#141414'") >= 0) {
      throw new Error('the Druk 16 near-black seed is back — it overrode the studio default on every new project');
    }
    // A function, not a shared object: Object.assign copies the reference, which is
    // why _starterDeck() is a function too.
    if (src.indexOf('function _specCodeStyleDefault() { return {') < 0) {
      throw new Error('the default is not returned fresh — one project could edit another\u2019s captions');
    }
  });

  check('spec text labels stay NEAR-BLACK — only the font default moved', () => {
    // Asked for explicitly: spec text is Messina and black; the grey 9pt is the
    // caption / image-code style, which is a different row in the panel.
    const n = src.split('setTextColor(40, 40, 40)').length - 1;
    if (n < 5) throw new Error('spec label colour sites dropped to ' + n + ' — something greyed the spec list');
  });

  check('the floating Quick Styles palette is REMOVED, not just hidden', () => {
    // It was a second copy of the list the text gear already docks onto the box being
    // styled — same styles, same apply, same 'Edit styles…' route — in a draggable
    // window parked over the page it was restyling.
    ['_dsToggleStylePalette', '_dsRenderStylePalette', '_dsStylePalOpen', '_dsStylePalPos', '_dsStylePalette'].forEach(n => {
      if (src.indexOf(n) >= 0) throw new Error(n + ' survives — a hidden control is still a control to maintain');
    });
    if (htmlSrc.indexOf('dsMbStyles') >= 0) throw new Error('the palette button is still in the markup');
  });

  check('removing it did NOT orphan the style editor', () => {
    // The palette footer was one of two routes to the Styles tab. The other is the
    // docked section, which had to survive or styles become uneditable.
    if (src.indexOf('function _dsDockedStylesSection') < 0) throw new Error('the docked styles section went with the palette');
    if (src.indexOf('function _dsRenderStylesTab') < 0) throw new Error('the style editor itself is gone');
    if (src.indexOf("_dsTab('styles')") < 0) throw new Error('nothing routes to the Styles tab any more');
  });
  check('the page-settings gear is removed, duplicate guide toggle and all', () => {
    ['_dsOpenSettingsMenu', '_dsShowGuides', 'dsStyleGear'].forEach(n => {
      if (src.indexOf(n) >= 0) throw new Error(n + ' survives');
    });
    if (htmlSrc.indexOf('dsStyleGear') >= 0) throw new Error('the gear button is still in the markup');
  });

  check('guides now have ONE source of truth, the persisted deck setting', () => {
    // The gear held a module flag OR-ed into the paint call, so it and the Guides
    // menu's own 'Show guides' checkbox disagreed by construction.
    if (src.indexOf('_dsShowGuides || G.show') >= 0) throw new Error('the OR-ed second guide flag is back');
    if (src.indexOf('_setDeckGuide({ show: v })') < 0) throw new Error('the real deck-wide guide toggle is gone');
  });

  check('the two real gear actions were rehomed, not deleted', () => {
    if (src.indexOf('function _dsPageActionsInto') < 0) throw new Error('no page-actions block');
    if (src.indexOf('_dsPageActionsInto(t, desc)') < 0) throw new Error('nothing calls it');
    // Ahead of the kind-specific branches, several of which return early.
    const place = src.indexOf('_dsPlaceRelativeInto(t, desc);');
    const call = src.indexOf('_dsPageActionsInto(t, desc);');
    const fp = src.indexOf("if (desc.kind === 'floorplan') {", place);
    if (!(place < call && call < fp)) throw new Error('page actions render after an early-returning branch, so some page kinds lose them');
  });

  check('_dsPopup closes the popups that EXIST, not two that were deleted', () => {
    if (src.indexOf("['dsTypeMenu', 'dsSettingsMenu'].forEach") >= 0) throw new Error('the stale close-list is back');
    if (src.indexOf('const _DS_POPUP_IDS') < 0) throw new Error('no popup id list');
    ['dsArrowShapeMenu', 'dsPlaceholderMenu', 'dsTextMenu'].forEach(id => {
      if (src.indexOf("_dsPopup('" + id) < 0) throw new Error(id + ' is listed but nothing opens it');
    });
  });

  check('tools-panel segmented rows go through ONE builder, not two broken copies', () => {
    if (src.indexOf('function _dsSegRowInto') < 0) throw new Error('no shared segmented-row builder');
    // Both call sites: Frame Recommendations and the Thank You contact layout.
    const uses = src.split('_dsSegRowInto(').length - 1;
    if (uses < 3) throw new Error('only ' + (uses - 1) + ' call site(s); expected the frameRec and contacts rows');
  });

  check('EXACT BUG: no action-btn segmented row keeps a flex basis of auto', () => {
    // .action-btn is width:100%, and flex:1 1 auto takes its basis FROM that width, so
    // each button claimed the whole panel and flex-wrap gave it its own row. Ten such
    // rows is what made the Frame Recommendations panel scroll.
    ['flex:1 1 auto; min-width:48px', 'flex:1 1 auto; min-width:56px'].forEach(bad => {
      if (src.indexOf(bad) >= 0) throw new Error('a full-width stacked segmented row is back: ' + bad);
    });
  });

  check('the builder uses the one tab component and wrap, never fit', () => {
    const body = bodyOf('function _dsSegRowInto', 'function _dsPageActionsInto');
    if (body.indexOf("'frame-tabs wrap'") < 0) throw new Error('not a .frame-tabs wrap row');
    if (body.indexOf('frame-tabs fit') >= 0) throw new Error('fit sets flex:1, which spills a nowrap label out of a squeezed tab');
    if (body.indexOf('_tplTabClass(') < 0) throw new Error('selection is not the shared .active class');
  });

  check('ALL THREE gear popups use the shared swatch grid', () => {
    // They drew the same colour list three different ways: the arrow popup with a
    // transparent unselected border, the text popup with var(--border-color) and no
    // white handling, the shape popup as colour RINGS filled in when chosen.
    if (src.indexOf('_frameSwatchList().forEach') >= 0) throw new Error('a gear popup still hand-rolls its swatch strip');
    ['_dsOpenArrowGearPopup', '_dsOpenGearPopup', '_dsOpenTextGearPopup'].forEach(fn => {
      const a = src.indexOf('function ' + fn);
      if (a < 0) throw new Error(fn + ' is gone');
    });
    // Four grids: arrow colour, shape fill, shape stroke, text colour.
    const n = src.split('_frameSwatchesInto(').length - 1;
    if (n < 9) throw new Error('only ' + n + ' _frameSwatchesInto references; expected the popups plus the existing callers');
  });

  check('the stroke weight stepper is labelled, not parked on the swatch row', () => {
    const body = bodyOf('function _dsOpenGearPopup', 'function _dsResolveCaptionText');
    // The labels are a COLUMN now rather than a header line above each group, so they
    // are built by sec()/swIn() instead of lbl() - and the two long ones are shortened
    // to fit that column, carrying their full wording as a tooltip. What is asserted is
    // unchanged: the weight stepper has a name of its own and is not parked on the
    // swatch row, and fill and stroke are named separately.
    if (body.indexOf("sec('Weight'") < 0) throw new Error('stroke weight still has no label of its own');
    if (body.indexOf("swIn('Fill'") < 0 || body.indexOf("swIn('Stroke'") < 0) throw new Error('fill and stroke are not separately labelled');
    if (body.indexOf("sec('Radius'") < 0) throw new Error('the corner radius lost its label');
    // A shortened label must still say what it means somewhere.
    ["sec('Weight',", "sec('Radius',", "swIn('Fill',", "swIn('Stroke',"].forEach(m => {
      const at = body.indexOf(m);
      const args = body.slice(at, body.indexOf(')', at));
      if (args.split("'").length < 5) throw new Error(m + ' has no tooltip, so a shortened label explains nothing');
    });
  });

  check('fit-to-image and its lock are in the popup', () => {
    const body = bodyOf('function _dsOpenGearPopup', 'function _dsResolveCaptionText');
    if (body.indexOf('Fit box to image') < 0) throw new Error('no fit-box-to-image control');
    if (body.indexOf('_dsShapeFitToImage(a)') < 0) throw new Error('the control does not call the shared fit');
    if (body.indexOf('a.lockAspect = lkC.checked') < 0) throw new Error('no lock checkbox');
  });

  check('EXACT BUG: the preview mock no longer clips its own glyphs', () => {
    // Both text divs in _mbThumbInner / _dsAnnotationsThumbHTML had overflow:hidden on
    // a box with NO height, so the only thing it could clip was a glyph taller than its
    // line box. A display face at tight leading is exactly that: the starter heading is
    // size 0.06 with leading 21, a line-height of 0.65, so Druk caps had their tops and
    // tails cut off. Checked file-wide because that exact pairing only ever existed in
    // those two divs.
    if (src.indexOf('overflow:hidden;white-space:pre-wrap') >= 0) throw new Error('a preview text div is clipping again');
    // And the divs themselves are still there, styled by the same leading formula.
    const n = src.split("';color:' + _ink + ';white-space:pre-wrap").length - 1;
    if (n !== 2) throw new Error('expected 2 unclipped preview text divs, found ' + n);
  });

  check('the live editor it mirrors never clipped either', () => {
    // _mbThumbInner's own comment says its line-height must match renderMoodboardCanvas
    // exactly. The clipping was the one part that did not match.
    const i = src.indexOf("box.style.cssText = 'position:absolute; left:' + (t.x * 100)");
    if (i < 0) throw new Error('the live text box is gone');
    const line = src.slice(i, src.indexOf(String.fromCharCode(10), i));
    if (line.indexOf('overflow:hidden') >= 0) throw new Error('the live editor started clipping too');
  });

  // ── Behaviour ───────────────────────────────────────────────────────────
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){} });
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
    const __box = (k) => document.getElementById('specInc_' + k);
    const __sub = () => document.querySelector('[data-inc-sub="floorplanKey"]');
    const __sel = () => document.getElementById('specPlanOrder');

    editorialContent = editorialContent || {};
    pushHistory = () => {};
    scheduleAutosave = () => {};
    _dsClearBuiltAll = () => {};

    __check('unchecking Floorplan Key DISABLES the order select, not just dims it', () => {
      __box('floorplanKey').checked = false;
      _dsSyncIncludeSubs();
      if (__sel().disabled !== true) throw new Error('select still enabled — keyboard can change a setting that looks off');
      if (__sub().style.opacity !== '0.45') throw new Error('wrapper not dimmed, opacity is ' + JSON.stringify(__sub().style.opacity));
      if (__sub().style.pointerEvents !== 'none') throw new Error('wrapper still takes pointer events');
    });

    __check('re-checking it restores the control completely', () => {
      __box('floorplanKey').checked = true;
      _dsSyncIncludeSubs();
      if (__sel().disabled !== false) throw new Error('select left disabled after the page was switched back on');
      if (__sub().style.pointerEvents === 'none') throw new Error('wrapper still inert');
      if (__sub().style.opacity === '0.45') throw new Error('wrapper still dimmed');
    });

    __check('include state survives a save and reload (the reported bug)', () => {
      __box('timeline').checked = false;
      __box('frameRec').checked = true;
      __box('spec').checked = false;
      _dsIncludeSave();
      const stored = JSON.parse(JSON.stringify(editorialContent.includePages));
      // Reload: the markup defaults come back, then the project is applied.
      DECK_INCLUDE_PAGES.forEach(p => { const e = __box(p.key); if (e) e.checked = true; });
      editorialContent.includePages = stored;
      seedDeckIncludeInputs();
      if (__box('timeline').checked !== false) throw new Error('timeline came back on');
      if (__box('spec').checked !== false) throw new Error('spec pages came back on');
      if (__box('frameRec').checked !== true) throw new Error('frameRec did not survive');
    });

    __check('a file with no includePages keeps the markup defaults, not an empty deck', () => {
      DECK_INCLUDE_PAGES.forEach(p => { const e = __box(p.key); if (e) e.checked = true; });
      delete editorialContent.includePages;
      seedDeckIncludeInputs();
      const off = DECK_INCLUDE_PAGES.filter(p => { const e = __box(p.key); return e && !e.checked; });
      if (off.length) throw new Error('an older file switched pages off: ' + off.map(p => p.key).join(', '));
    });

    __check('a key missing from a stored map keeps its default (a page this build added since)', () => {
      DECK_INCLUDE_PAGES.forEach(p => { const e = __box(p.key); if (e) e.checked = true; });
      editorialContent.includePages = { cover: false };   // an old, short map
      seedDeckIncludeInputs();
      if (__box('cover').checked !== false) throw new Error('the stored key was not applied');
      if (__box('contacts').checked !== true) throw new Error('a key absent from the map was read as excluded');
    });

    __check('picking a presentation type writes the boxes it ticked into the project', () => {
      editorialContent.includePages = null;
      _dsRenderPresetBar = () => {};
      _dsRefresh = () => {};
      _dsApplyPresentationType('install');
      const m = editorialContent.includePages;
      if (!m) throw new Error('preset left includePages unwritten — this is the lit-button-default-boxes bug');
      if (m.narrative !== false) throw new Error('Install Guide should exclude the art narrative, got ' + m.narrative);
      if (m.floorplanKey !== true) throw new Error('Install Guide should include the floorplan key');
      if (editorialContent.presentationType !== 'install') throw new Error('type key not stored');
    });

    __check('the preset also re-syncs the nested control it just switched off', () => {
      __box('floorplanKey').checked = true; _dsSyncIncludeSubs();
      _dsRenderPresetBar = () => {};
      _dsRefresh = () => {};
      _dsApplyPresentationType('concept');   // concept excludes the floorplan key
      if (__box('floorplanKey').checked !== false) throw new Error('Concept left the floorplan key on');
      if (__sel().disabled !== true) throw new Error('order select left live under a page the preset just excluded');
    });

    __check('_dsInclude returns every key in the one list (no reader/list drift)', () => {
      const got = _dsInclude();
      DECK_INCLUDE_PAGES.forEach(p => {
        if (!(p.key in got)) throw new Error('_dsInclude does not return ' + p.key);
      });
      if (Object.keys(got).length !== DECK_INCLUDE_PAGES.length) {
        throw new Error('_dsInclude returned ' + Object.keys(got).length + ' keys for a list of ' + DECK_INCLUDE_PAGES.length);
      }
    });

    __check('preview tabs are one per INCLUDED section, in deck order', () => {
      const bar = document.createElement('div'); bar.id = 'dsProjPrevTabs'; document.body.appendChild(bar);
      const holder = document.createElement('div'); holder.id = 'dsProjCoverPrev'; document.body.appendChild(holder);
      const capEl = document.createElement('div'); capEl.id = 'dsProjPrevCap'; document.body.appendChild(capEl);
      _dsRenderCoverPreview = () => {};   // the strip is what is under test, not the render
      DECK_INCLUDE_PAGES.forEach(p => { const e = __box(p.key); if (e) e.checked = true; });
      const secs = _dsPreviewSections();
      const keys = secs.map(x => x.key);
      if (keys.indexOf('cover') !== 0) throw new Error('cover is not the first tab, got ' + keys.join(','));
      if (keys.indexOf('contacts') !== keys.length - 1) throw new Error('Thank You is not last, got ' + keys.join(','));
      secs.forEach(x => { if (!x.desc) throw new Error(x.key + ' has a tab but no page behind it'); });
    });

    __check('a match-based tab follows the LIVE page list; a demo-based one does not', () => {
      // With the Spec demo in place there is no ordinary setup left where an included
      // section builds no page — every other section emits unconditionally — so the
      // rule is pinned against the resolver itself. Both halves matter: a tab for a
      // page the deck never built previews nothing, and a demo tab that vanished with
      // an empty dashboard is the gap this whole change closed.
      DECK_INCLUDE_PAGES.forEach(p => { const e = __box(p.key); if (e) e.checked = true; });
      const real = _deckPageList;
      try {
        const only = real().filter(d => d.kind === 'fixed' && d.fixed === 'cover');
        _deckPageList = () => only;
        const keys = _dsPreviewSections().map(x => x.key);
        if (keys.indexOf('cover') < 0) throw new Error('the one page that IS in the list lost its tab');
        if (keys.indexOf('narrative') >= 0) throw new Error('a tab appeared for a page the deck never built');
        if (keys.indexOf('slogan') >= 0) throw new Error('a tab appeared for a page the deck never built');
        if (keys.indexOf('spec') < 0) throw new Error('the demo tab followed the page list — it must not');
      } finally { _deckPageList = real; }
    });

    __check('unchecking a page removes its tab', () => {
      DECK_INCLUDE_PAGES.forEach(p => { const e = __box(p.key); if (e) e.checked = true; });
      if (_dsPreviewSections().map(x => x.key).indexOf('slogan') < 0) throw new Error('setup: no Good Art tab to remove');
      __box('slogan').checked = false;
      if (_dsPreviewSections().map(x => x.key).indexOf('slogan') >= 0) throw new Error('tab survived its page being excluded');
    });

    __check('switching off the ACTIVE tab moves the selection instead of stranding it', () => {
      DECK_INCLUDE_PAGES.forEach(p => { const e = __box(p.key); if (e) e.checked = true; });
      _dsPreviewTab = 'narrative';
      _dsRenderPreviewTabs();
      if (_dsPreviewTab !== 'narrative') throw new Error('setup: narrative tab not selectable');
      __box('narrative').checked = false;
      _dsRenderPreviewTabs();
      if (_dsPreviewTab === 'narrative') throw new Error('still pointing at a page the deck no longer contains');
      const keys = _dsPreviewSections().map(x => x.key);
      if (keys.indexOf(_dsPreviewTab) < 0) throw new Error('selection landed on a section with no tab: ' + _dsPreviewTab);
    });

    __check('the strip paints the active tab with .active and exactly one of them', () => {
      DECK_INCLUDE_PAGES.forEach(p => { const e = __box(p.key); if (e) e.checked = true; });
      _dsSelectPreviewTab('strategy');
      const bar = document.getElementById('dsProjPrevTabs');
      const all = Array.prototype.slice.call(bar.querySelectorAll('.frame-tab'));
      if (!all.length) throw new Error('no tabs rendered');
      const on = all.filter(b => b.classList.contains('active'));
      if (on.length !== 1) throw new Error(on.length + ' tabs marked active');
      if (on[0].textContent !== 'Strategy') throw new Error('wrong tab lit: ' + on[0].textContent);
    });

    __check('the Spec tab is there with NOTHING on the dashboard — which is when type gets set', () => {
      dashProjectData = [];
      DECK_INCLUDE_PAGES.forEach(p => { const e = __box(p.key); if (e) e.checked = true; });
      const secs = _dsPreviewSections();
      const spec = secs.filter(x => x.key === 'spec')[0];
      if (!spec) throw new Error('no Spec tab on an empty deck — the reported gap');
      if (!spec.demo) throw new Error('the Spec tab is not flagged as a demo, so its caption will claim it is your page');
      if (!spec.desc || spec.desc.kind !== 'spec') throw new Error('the demo is not a spec descriptor');
    });

    __check('the demo carries the slots a designer is here to style', () => {
      dashProjectData = [];
      const d = _dsPreviewSections().filter(x => x.key === 'spec')[0].desc;
      const r = d.row || {};
      if (!r.imageCode) throw new Error('no image code on the demo piece, so the caption font has nothing to show');
      if (!r.fCode) throw new Error('no frame code, so the spec text list is short a row');
      if (!d.title) throw new Error('no title, so the title font has nothing to show');
    });

    __check('the demo follows the deck spec template, so the preview matches the chosen layout', () => {
      editorialContent.specTemplate = 'setRow';
      let d = _dsPreviewSections().filter(x => x.key === 'spec')[0].desc;
      if (d._specTpl !== 'setRow') throw new Error('demo ignored the deck template, got ' + d._specTpl);
      editorialContent.specTemplate = 'frameRight';
      d = _dsPreviewSections().filter(x => x.key === 'spec')[0].desc;
      if (d._specTpl !== 'frameRight') throw new Error('demo did not follow a template change');
    });

    __check('unticking Spec Pages still removes the tab, demo or not', () => {
      __box('spec').checked = false;
      if (_dsPreviewSections().some(x => x.key === 'spec')) throw new Error('the demo tab ignored its own checkbox');
      __box('spec').checked = true;
    });

    __check('the docked style list still lists and applies every named style', () => {
      const wrap = _dsDockedStylesSection(3, '_dsTestDocked');
      document.body.appendChild(wrap);
      const btns = wrap.querySelectorAll('[data-style-id]');
      const styles = _dsTextStyles();
      if (!styles.length) throw new Error('no styles seeded');
      if (btns.length !== styles.length) throw new Error('docked list shows ' + btns.length + ' of ' + styles.length + ' styles');
      if ((wrap.textContent || '').indexOf('Edit styles') < 0) throw new Error('no route to the style editor from the docked list');
    });
    __check('a segmented row is ONE row of tabs, with exactly one lit', () => {
      const host = document.createElement('div'); document.body.appendChild(host);
      let picked = null;
      const row = _dsSegRowInto(host, [['none', 'None'], ['vendor', 'Vendor'], ['type', 'Type']], 'vendor', v => { picked = v; });
      if (!row || !row.classList.contains('frame-tabs')) throw new Error('row is not a .frame-tabs');
      if (!row.classList.contains('wrap')) throw new Error('row cannot wrap, so it will overflow the panel');
      const tabs = row.querySelectorAll('.frame-tab');
      if (tabs.length !== 3) throw new Error('expected 3 tabs in one row, found ' + tabs.length);
      // The whole point: three choices, ONE row, not three stacked full-width buttons.
      if (row.querySelectorAll('.action-btn').length) throw new Error('still using action-btn, which is width:100% and will stack');
      const lit = Array.prototype.filter.call(tabs, b => b.classList.contains('active'));
      if (lit.length !== 1) throw new Error(lit.length + ' tabs lit');
      if (lit[0].textContent !== 'Vendor') throw new Error('wrong tab lit: ' + lit[0].textContent);
      tabs[2].onclick();
      if (picked !== 'type') throw new Error('click did not report the picked value, got ' + picked);
    });

    __check('a third column in an option carries a tooltip, for a shortened label', () => {
      const host = document.createElement('div'); document.body.appendChild(host);
      const row = _dsSegRowInto(host, [['type', 'Type', 'Group by frame type']], 'type', () => {});
      const b = row.querySelector('.frame-tab');
      if (b.title !== 'Group by frame type') throw new Error('tooltip not set, so a trimmed label loses its meaning');
    });

    __check('the square lock is exactly the ratio lock at 1, so old shapes are unchanged', () => {
      const w = 0.25;
      const old = w * (936 / 540);   // the formula _dsShapeSquareH had before
      if (Math.abs(_dsShapeSquareH(w) - old) > 1e-9) throw new Error('square height changed');
      if (Math.abs(_dsShapeRatioH(w, 1) - old) > 1e-9) throw new Error('ratio 1 is not square');
      // lockRatio absent must mean 1, or every shape already saved with lockAspect
      // would start snapping to something else.
      if (_dsShapeHeldRatio({ lockAspect: true }) !== 1) throw new Error('a legacy locked shape no longer holds 1:1');
      if (_dsShapeHeldRatio({ lockRatio: 0 }) !== 1) throw new Error('a zero ratio must fall back to 1, not divide by zero');
    });

    __check('a held ratio produces a box of that ratio in PAGE PIXELS', () => {
      const w = 0.25;
      [1, 1.5, 2, 0.75].forEach(r => {
        const h = _dsShapeRatioH(w, r);
        const got = (w * 936) / (h * 540);
        if (Math.abs(got - r) > 1e-6) throw new Error('ratio ' + r + ' produced ' + got);
      });
    });

    __check('fit box to image reshapes to the picture and drops the pan', () => {
      const a = { type: 'shape', w: 0.25, h: 0.2, dataUrl: 'data:x', aspect: 2, zoom: 2.5, panX: 12, panY: -4 };
      if (_dsShapeFitToImage(a) !== true) throw new Error('refused a box that has an image and an aspect');
      const got = (a.w * 936) / (a.h * 540);
      if (Math.abs(got - 2) > 1e-6) throw new Error('box ratio is ' + got + ', not the image 2');
      if (a.w !== 0.25) throw new Error('width moved; it is the dimension set from the layout');
      if (a.zoom !== 1 || a.panX !== 0 || a.panY !== 0) throw new Error('a stale pan survived a box that now matches the image');
    });

    __check('fit box to image refuses when there is nothing to fit to', () => {
      if (_dsShapeFitToImage({ type: 'shape', w: 0.25, h: 0.2 }) !== false) throw new Error('fitted a box with no image');
      if (_dsShapeFitToImage({ type: 'shape', w: 0.25, h: 0.2, dataUrl: 'data:x', aspect: 0 }) !== false) throw new Error('fitted to a zero aspect');
      if (_dsShapeFitToImage(null) !== false) throw new Error('threw on no element');
    });

    __check('captions/image code default to Messina 9pt grey on all three paths', () => {
      const want = { font: 'serif', size: 9, color: '#9c9c9c' };
      // 1. a brand new project
      const fresh = _editorialDefaults().specCodeStyle;
      Object.keys(want).forEach(k => {
        if (fresh[k] !== want[k]) throw new Error('new project caption ' + k + ' is ' + fresh[k] + ', not ' + want[k]);
      });
      // 2. the reader's own fallback
      const saved = editorialContent.specCodeStyle;
      delete editorialContent.specCodeStyle;
      const got = _specCodeStyle();
      editorialContent.specCodeStyle = saved;
      Object.keys(want).forEach(k => {
        if (got[k] !== want[k]) throw new Error('_specCodeStyle ' + k + ' is ' + got[k] + ', not ' + want[k]);
      });
    });

    __check('each call gets its OWN object, so one deck cannot edit another\u2019s captions', () => {
      const a = _specCodeStyleDefault();
      const b = _specCodeStyleDefault();
      if (a === b) throw new Error('the default is a shared reference');
      // Compared against what this call actually returned, not a hardcoded colour:
      // otherwise a change of default value fails here claiming shared state.
      const was = b.color;
      a.color = '#ff0000';
      if (b.color !== was) throw new Error('mutating one default changed the other');
      if (_editorialDefaults().specCodeStyle.color !== was) throw new Error('the seed shares the mutated object');
    });

    __check('a project that already stored a caption style keeps it', () => {
      editorialContent.specCodeStyle = { font: 'display', size: 16, color: '#141414' };
      const got = _specCodeStyle();
      if (got.font !== 'display' || got.size !== 16 || got.color !== '#141414') {
        throw new Error('an existing deck was overwritten by the new default');
      }
      delete editorialContent.specCodeStyle;
    });

    __check('spec text defaults to Messina, matching the captions beside it', () => {
      delete editorialContent.specFont;
      if (_specFont() !== 'serif') throw new Error('spec text default is ' + _specFont() + ', not Messina');
      // An unknown token still degrades to the default rather than to Sans.
      editorialContent.specFont = 'notafont';
      if (_specFont() !== 'serif') throw new Error('bad token fell back to ' + _specFont());
      // A project that HAS chosen a face keeps it.
      editorialContent.specFont = 'arial';
      if (_specFont() !== 'arial') throw new Error('an explicit choice was overridden by the new default');
      delete editorialContent.specFont;
    });
    __check('the Project-tab type controls write the deck-wide styles', () => {
      const host = document.createElement('div'); host.id = 'dsProjTypeTest'; document.body.appendChild(host);
      _dsRenderCoverPreview = () => {};
      _dsClearBuiltAll = () => {};
      _dsTypeDefaultsInto(host);
      const sels = host.querySelectorAll('select');
      if (sels.length !== 5) throw new Error('expected 5 font pickers (titles, subheadings, paragraphs, captions, spec text), found ' + sels.length);
      const nums = host.querySelectorAll('input[type="number"]');
      if (nums.length !== 4) throw new Error('expected 4 size fields, found ' + nums.length);
      const cols = host.querySelectorAll('input[type="color"]');
      if (cols.length !== 4) throw new Error('expected 4 colour fields, found ' + cols.length);
      // Spec text is the LAST font picker and carries no size or colour of its own.
      const spec = sels[sels.length - 1];
      spec.value = 'serif'; spec.onchange();
      if (editorialContent.specFont !== 'serif') throw new Error('spec font not stored, got ' + editorialContent.specFont);
      nums[0].value = '31'; nums[0].onchange();
      if (_titleStyle().size !== 31) throw new Error('title size not stored, got ' + _titleStyle().size);
      nums[1].value = '17'; nums[1].onchange();
      if (_subtitleStyle().size !== 17) throw new Error('subheading size not stored, got ' + _subtitleStyle().size);
      // Captions are the LAST colour.
      const capCol = cols[cols.length - 1];
      capCol.value = '#123456'; capCol.oninput();
      if (_specCodeStyle().color !== '#123456') throw new Error('caption colour not stored, got ' + _specCodeStyle().color);
    });

    __check('ticking a box through the delegated listener persists it', () => {
      _dsIncludeInit();
      DECK_INCLUDE_PAGES.forEach(p => { const e = __box(p.key); if (e) e.checked = true; });
      editorialContent.includePages = null;
      const cb = __box('slogan');
      cb.checked = false;
      cb.dispatchEvent(new window.Event('change', { bubbles: true }));
      if (!editorialContent.includePages) throw new Error('no listener fired — the change never reached the project');
      if (editorialContent.includePages.slogan !== false) throw new Error('listener fired but stored the wrong state');
    });
  `;

  try {
    window.eval(src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  (window.__testResults || []).forEach(r => results.push(r));

  const failed = results.filter(r => !r.ok);
  results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' -> ' + r.err); });
  console.log('\n--- Summary ---');
  if (failed.length) { console.log(failed.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
