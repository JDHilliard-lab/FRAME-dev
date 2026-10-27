# FRAME: project notes for Claude Code

Browser-based presentation builder for art consulting (Farmboy Fine Arts).
Replaces manual InDesign work: wall elevations, artwork spec pages, client PDFs.

This file is the condensed rulebook. The full long-form notes, with the history and
incident write-ups behind each rule, are in `docs/claude-notes-archive.md` (as of
18.34, not maintained). Read the archive when a rule here needs its backstory; add new
rules HERE, short: the rule, the names, the trap, one clause of why.

## Stack / ground rules
- **Vanilla JS only.** `app.js` (~50k lines, one global scope) + `templates.js` +
  `index.html` + `style.css`. No frameworks, build step, bundler, JSX or Tailwind.
  Vendored libs: `lib-jspdf.min.js` (UMD), `lib-jszip.min.js`.
- **TWO SITES, ONE TREE.** Dev is `jdhilliard-lab.github.io/FRAME-dev` (repo `FRAME-dev`,
  remote `origin`); stable is `jdhilliard-lab.github.io/FRAME` (repo `FRAME`, remote
  `stable`). Byte-identical files: `APP_BUILD` is derived from the URL, never
  hand-edited; an unrecognised location (`file://`, localhost, a harness) reads as dev.
  Promote with `node tools/promote.js` (dry run) then `--push`: it gates on a clean tree,
  dev pushed, ALL GREEN and every `?v=` matching `APP_VERSION`, then writes ONE snapshot
  commit (`git commit-tree`) onto stable. Not a merge, not a force-push.
- **Bump `APP_VERSION` on every change and add a What's New line** (`HELP_REFERENCE_DATA`,
  section `version`); `test_help_and_steps.js` fails until What's New mentions it.
- **FOUR THINGS IN `index.html` CARRY `APP_VERSION` AND ALL MUST MATCH IT**: `style.css?v=`,
  `templates.js?v=`, `app.js?v=` and `window.FRAME_HTML_VERSION`. Pinned by
  `test_build_version_pin.js` / `test_dash_visible_and_tick_clearance.js` and gated by
  `promote.js`. The stamp must be set BEFORE the `<script>` tags; `_checkBuildPairing()`
  compares it with `APP_VERSION` at boot (wired into BOTH boot branches, deliberately not
  fatal, a page with no stamp is left alone), because a query string cannot fix a browser
  that already holds a mismatched cached pair.
- **`templates.js` holds the master layout templates** (`window.FRAME_MASTER_TEMPLATES`,
  ~634 KB, photos embedded on purpose: an applied template copies its image data into the
  project, and a URL there breaks offline and `file://` projects). It loads BEFORE
  `app.js`, which reads it once as `IDML_MASTER_TEMPLATES` with a `[]` fallback. A test
  needing the real data prepends `templates.js` to the source it evals.
- **No em dashes in written output.** Casual, direct tone.

## Testing: do this every time
```
node tests/run-all.js        # must print ALL GREEN before anything ships
```
Add a `tests/test_<topic>.js` for every fix that reproduces the actual bug, and confirm it
by putting the bug back and watching it fail. If behaviour intentionally changed, update
the test and say so; never delete a check just to go green. A file that fails in the full
run but passes alone is usually load timing: rerun before chasing it.

- **EVERY BACKSLASH IN A TEST BLOCK IS DOUBLED.** Checks live inside a template literal, so
  `\s` arrives as `s`, `\(` as `(`, `\n` as a real newline (a syntax error inside a quoted
  string) and `\${` interpolates. Prefer `indexOf` and `split().length`; a regex containing
  `var(--x)` matches nothing because the parens are a group.
- **A PARSE IS NOT A LOAD, A LOAD IS NOT A RENDER, A RECORDING STUB IS NOT A RENDERER.**
  `node --check` cannot see a call to a function that does not exist, nor a stray
  identifier, nor a TDZ read. `test_no_undefined_helpers.js` checks every bare `_helper()`
  call resolves (it scans RAW source: app.js has `/*` inside strings). Grep a new
  identifier before trusting a parse, and grep a NEW NAME before using it: one global scope
  means a second declaration silently replaces the first (`test_ds_tool_dock` fails on any
  duplicate top-level function). A stub that ignores its arguments cannot notice garbage:
  validate (e.g. every colour channel finite) rather than record.
  `_annHexToRgb` returns `{r, g, b}`, never an array.
- **Module-scope ordering is load-bearing.** A `const`/`let` read by code that RUNS at
  module scope must be declared above it, or the file dies on boot in the TDZ
  (`TITLE_SIZE_DEFAULT` above `editorialContent`, `_elevIdSeq` above `elevations`,
  `IG_LEG_TOP_GAP` above `_igLegTop`). Where the inputs are declared later, make it a
  function (`_pageBgMaxEdge`, `_subtitleClear`).
- **Anchor a source-level check on landmarks, not a character distance.**
  `S.slice(start, S.indexOf(nextFunction))`, never `S.slice(i, i + 1600)`. When deleting a
  slice between two landmarks, assert what it CONTAINS first (that is how `_dsPinChrome`
  was once deleted along with the thing being removed). Rename by whole identifier only.
- **Indirect eval scoping.** Each `window.eval` gets its own top-level `const`/`let`
  scope, so a check that awaits mid-way must stay in the SAME eval as `app.js`: wrap it in
  one `async` IIFE assigned to `window.__...` and await that from Node. To read app.js's
  consts from a test, read them inside that eval.
- **jsdom gaps.** No canvas (stub `getContext`; a no-op Proxy context lets a real export
  run), no layout, no `innerText`. Inline `onclick` only runs under `runScripts:
  'dangerously'`. A `var()` set through a shorthand is dropped from `.style` (read
  `getAttribute('style')`). Real jsPDF loads under Node via `require('lib-jspdf.min.js')`.
  For anything about what a browser actually draws or measures, use headless Chrome
  (`--headless=new --dump-dom` with a probe page writing results into `document.title`).
- **jsdom has no IndexedDB, so set `_autosaveToldUser = true` in any harness that pushes
  history or opens dialogs.** Otherwise the first debounced autosave (500 ms) fails and
  opens the "nothing is backing up your work" modal, which blocks `undo()` and shows up in
  dialog checks. Alone a file often finishes first; under the parallel suite it does not,
  which is how a file passes alone and fails in `run-all`.
- **A probe page reading app state through an iframe:** top-level `let`/`const`
  (`editorialContent`, `_igCapCache`, `_elevPrimeActive`, ...) are NOT `window` properties;
  read and write them with `w.eval('...')`. Deck Studio has no pages until the Pages tab
  opens (`_dsTab('pages')`). Wrap the probe body in try/catch and write the error to the
  title, or a throw just looks like a hang.
- **Mixed line endings.** `style.css` and some tests (e.g. `test_egd_wf_product.js`) are
  partly CRLF; a multi-line edit anchor written with `\n` matches nothing there.
## Architecture anchors (hard-won; don't rediscover)
- `FRAME_FONT_LIBRARY` is the **only** font list. Every picker is built by
  `_fillFontSelect()`; static ones in `index.html` carry `data-font-select` and are
  filled by `_initFontSelects()` on boot. Groups: *Brand* (`display`=Druk, `sans`=Sans,
  `serif`=Messina, embedded in the PDF) and *Universal* (Arial, Helvetica, Segoe UI,
  Verdana, Tahoma, Courier New). Tokens are persisted. `_fontCss()` = browser stack,
  `_font()` = jsPDF name, `_pdfFontStyle()` = bold only for Druk, `_fontToken()` migrates
  old raw CSS stacks. Brand `sans` must keep a stack distinct from Arial/Helvetica or that
  migration is ambiguous.
- `FRAME_SWATCH_FAMILIES` / `_frameSwatchesInto()` is the shared colour quick-pick;
  `opts.families` swaps the palette. `FRAME_GREY_RAMP` (no hues, **no pure white**: a
  white figure is invisible) drives the Scale Figure shade strip. A shade is a grey
  (`brightness(0) invert(n)`); `_shadeToHex`/`_hexToShade` convert, `_personShadeNearestHex()`
  rings the closest dot for old values (0.3/0.68/0.82). `_personShadeFilter()` is the one
  filter, used by the wall figure AND the Settings preview.
- **Scale-figure height dim** (`dimVisibility.figureHeight`, off by default,
  `renderFigureHeightDim`) uses the shared dim parts (segments, `annotationStyle`,
  Line Ends, `buildDimControls` chevrons, dashed leader to the crown). `ELEV_PERSON_HEIGHT_IN`
  is the one height. Number goes through `elevFmtU` like other interior dims (AFF keeps its
  mark regardless). It lives in its **own layer above the dim layers**, NOT inside
  `#person-wrap` (that opens a stacking context). **Register any new layer in both export
  lists**, `annotationLayers` and the artboard-bounds list, or it is missing from the PDF or
  cropped. `personPos.dimOff` is a fraction of figure width (clamped ±1 by
  `ELEV_FIG_DIM_RANGE`), `dimLblOff` slides the number, `ELEV_FIG_DIM_DEFAULT` = -0.5 (box
  left edge; do not tune to the current art). Leader length IS the offset.
- **`buildDimControls({rotateLabel: true})`** hangs the chevrons off an **unrotated
  stand-in box** sized to the rotated label's footprint (the `.hang-dim-num` trick), so
  they don't rotate with the label. It skips the segment bias, and **must not force
  `position: relative`** on the label, or `.arch-label-rot`'s `top: 50%` breaks and the
  number hangs off the line.
- **All sliders are one global `input[type=range]` rule** in style.css (2px track, 11px
  dot, no opt-in class). WebKit and Gecko pseudo-elements don't inherit each other, so
  write every rule twice. WebKit thumb needs `margin-top: (track - thumb) / 2`.
- `annotationStyle.font` and `imageCodeStyle.fontToken` hold tokens;
  `annotationStyle.fontFamily` and `imageCodeStyle.font` are **derived** stacks kept by
  `_normalizeAnnotationStyle()` / `_normalizeImageCodeStyle()`. Never set them by hand.
  Defaults: dims = Messina; captions and image codes = Messina 9pt `#9c9c9c`
  (`_specCodeStyle()`).
- `computeArtDrawRect` is the **single source of truth** for artwork crop/fit across all
  five render paths (dashboard preview, elevation DOM, canvas/PNG, SVG, PDF).
- **The product-type model.** `FRAME_PRODUCTS` (app.js) and `<select id="m_product">`
  (index.html) are hand-synced: update both. ~20 branch sites use inconsistent local names
  (`isC`/`isCanvas`/`isFloater`, `isFL`/`isFrameless`/`iFL`); find them all.
  **`"Sourced Object"` has no branch anywhere** and renders/specs as Framed Art; not a precedent.
  **Flat graphics** (`FLAT_GRAPHIC_PRODUCTS` + `_isFlatGraphic()`): wallcovering (EGD) and
  window film (WF). Overall size IS the graphic: no moulding, mat, glass, rabbet, stretcher
  or drop shadow. Next flat product is an array entry. Extra field: `material` (free text).
  Placement needs no product branch: `makeElevDraggable` is product-agnostic.
  Traps: the `isFrameless` branch of `renderFrameToCanvas` **ignores `opts.artworkImg` and
  `opts.wireframe`** (punches a hole), so don't copy it; the flat branch must sit **before** it.
  **Placement does NOT auto-fill a flat graphic**: `_shouldAutoFitFlat` gates both paths
  (Push to Wall and Add & Arrange) and fills only in **EGD wall mode** AND **Wallcovering**,
  because `fitFlatGraphicToWall` rewrites `row.extW`/`row.extH` irrecoverably. Window film is
  sized to the glass, never auto-filled. The **Fit to wall button is deliberately ungated**.
  An unfilled flat graphic must advance `startX` in the bulk importer or they stack at x=0.
  Bleed `FLAT_GRAPHIC_BLEED_IN` = **2"**, seeded on product change, never over a typed
  value. `FLAT_GRAPHIC_APPLICATION` is both the Application row text and the seeded
  substrate (no separate Material row).
- **The flat-graphic sheet is `egdDetail`, RESOLVED not chosen.** `_specTplResolve` returns
  it for any flat-graphic row **ahead of everything, including the group template** (behind
  it, a wallcovering drew as a set member). `_splitFlatUnits` in `_deckPageList` pulls flat
  graphics out of group units onto their own sheets (same key, so per-page settings and
  approval stay); returns null when nothing is flat. A **manual** group is left alone.
  Excluded from the picker by `!SPEC_TEMPLATES[k].flat`. It carries `flat: true` and
  `custom: true`, so its branch in `_drawDeckPage` must sit **before** the generic template
  branch.
  Prints Application + Art Type + Overall Dimensions only; **Image Size and Mount are not
  printed** (bleed is production data) but reach the CSV. Layout: title + spec top-left,
  floorplan bottom-left, elevation **bottom-right**, left edge `M + colW + gutter` from the
  same `colW` as the spec rows, top clearing the title band.
  **`_captureElevWithGuides` SPLITS its output**: `cap.dataUrl` is picSvg (frames, artwork,
  figure), `cap.vec` is annSvg (dims, AFF, **baseboard**), which must be replayed with
  `_drawElevAnnOps(doc, cap.vec, <same rect as the image>)`. It is try/catch-wrapped, so a
  wrong rect fails **silently**. `_igElevCapture(elevIdx)` is the ONE cache/retry/suppressor
  path; never call `_captureElevWithGuides` from a page renderer.
- **Glazing is `elev.glazing`, an ARRAY of runs** `{x, y, h, panels:[…]}` in `elevUnit`,
  bottom-left like a frame. Panel widths are an **array**, never `{count, equal}`.
  **Run width is DERIVED (`_glazingRunWidth`), never stored.** The Width field is an
  operation: `_gzSetTotal` rescales panels proportionally (count rescales too); editing one
  panel width moves the total. `_gzSetTotal` puts the **rounding residual on the last
  panel**; `equalizeGlazingPanels` **delegates** to it, never divides locally.
  `_glazingSeams` returns **internal** mullions only (outer edges duplicate snap targets).
  `_scaleElevGlazing` converts `x`/`y`/`h` **and the panels array** on load and unit toggle.
  `#glazing-layer` is above `#frame-layer` and in `annotationLayers` (now z 9; see context
  blocks). `renderGlazingRuns` must run **after** `drawElevTargetedSpacing()`, which clears
  `#dim-layer`.
  Panels are **lettered** (`_glazingPanelLabel` = `getElevLetter`, 27th is AA). Collisions
  with frame letters are handled by **qualifying, not renaming**: a small chip in dim ink on
  screen, `WF-1.B` in the CSV and filenames. A **clipped** schedule keeps the wall letter.
  Multi-panel runs also dimension overall W and H via `elevFmtU`, never `_spacingLabel`
  (an overall must not print EQ); skipped on a single lite.
  `_updatePrintOutputHint` explains an empty Split schedule (`_glazingScheduleForFrame`
  stays quiet). `test_wf_glazing_panels`' `data-svg-pen` rule covers every **stroke** in
  `#glazing-layer`, not every child (`emitEl` sends text elements down the text path).
  `renderGlazingControls()` (`<details id="sec-glazing">`, not `toggleDashSection`) is
  called from the **top** of `initElevControls`, before its no-frames early return.
- **`printOutput` (`'full'|'panels'`) is per ROW and WINDOW FILM only.** Split = one
  artboard per panel, each panel + bleed on every edge as `_rowOpeningAndPrint` does
  (one-panel split equals full-file numbers, pinned). WF-only is enforced in the **data**,
  not just by hiding `#printOutputRow`. New field, so it needs `dashDefaultData`, the
  `dashHtIn` field map **and** `syncDashAndCalculate` or a keystroke wipes it. NOT carried
  onto elevation frames; `_glazingScheduleForFrame` takes the mode as an argument.
  `_glazingPanelPrints(run, bleed, h, range)` **clips to the graphic's span**; the lap is set
  from position in the *emitted* list, not the panel index. `_glazingRunForFrame` picks by
  **greatest overlap**. `_drawGlazingSchedule` uses the spec rows' unit convention (inches
  first under dual units) and returns the new `y` so the floorplan gives up height. CSV
  columns `Material, Print Output, Print Panels (in)` are **appended at the end** (InDesign
  reads by name). `_flatGraphicElevFor()` is the ONE "which wall is this graphic on".
- **`printOutput` IS SETTABLE FROM TWO PANELS**: the dashboard and Deck Studio's
  `_dsPrintOutputInto`, an inline checkbox in the main flow directly above Dual units, in
  Per-piece and Group A/B/C. Keep it there, not folded away. Both write through
  `setRowPrintOutput` (WF-only in the data) and read `_printOutputHintText` (one wording).
  Toggling must `_dsClearBuiltAll()` + `_dsRefresh()`.
- **`_dsPrintOutputInto` TAKES THE PAGE, NOT A ROW.** Graphics sharing a wall share a sheet
  (`_mergeFlatPages`) and `desc.row` is only the first. It writes every window-film member
  and shows **indeterminate** when they disagree.
- **A GLAZING RUN IS DRAGGED BY A GRIP, NEVER BY THE GLASS.** Only `.gz-grip` takes pointer
  events; the run outline keeps `pointer-events:none` (else it blocks every graphic on the
  glass). The grip carries **both** `data-export-skip` and `data-html2canvas-ignore` (PNG
  path reads neither list). Shown only on the **Glass tab**, so `switchElevTab` must redraw.
  Snapping uses the shared engine with `skip.glazingIdx`. One undo entry on mouseup, only if
  moved. Not clamped to the wall.
- **`buildWfWall` IS THE STANDARD WF ELEVATION** (`WF_WALL_PRESET`: 185x108 wall, one
  100x82 run at x=45 on a 4in sill, three equal panels) and opens the Glass tab. It sizes the
  WALL only when blank (`_wfWallIsBlank`); it still adds glass to a sized wall.
  **WF WALL is DERIVED from `elev.glazing`, never stored**; not exclusive with ART/EGD
  (`#wallModeHint` explains). **A second run continues the first** (`WF_NEXT_RUN`: same sill
  and head, right of the last run, one panel wide), not clamped. Panel widths snap to a
  sixteenth and the LAST absorbs the residual; don't assert all panels equal.
- **`_egdWallGoverns` IS THE ONE ANSWER TO "WHAT DOES EGD WALL MODE TOUCH": WALLCOVERING.**
  `_shouldAutoFitFlat`, `toggleEgdWall` and `_clampFlatToWall` all go through it; testing
  "is it flat" sweeps window film in and tears it off its panes. A glazed wall is NOT an EGD
  wall; on ART is correct, and `#wallModeHint` (keyed to `elev.glazing`) says so.
- **THE WALL MODE IS TWO NAMED BUTTONS** (`artWallBtn` / `egdWallBtn`, both
  `setElevWallMode`), in the wall section under W/H. Exactly one lit, from
  `_isEgdWall(elevations[currentElevIndex])`. EGD mode is **per elevation** while the rest of
  that panel is deck-wide. It has its own `.wall-mode-btn.active` rule (a test reads the
  stylesheet). ART carries the accent too. **ART is the default**: `egdWall` absent = art
  wall, nothing written. Don't make it a single labelled toggle (it shows one state and
  overflows the Add & Arrange row). The context-block tool lives on the Context tab; both
  `getElementById('contextToolBtn')` reads are null-guarded.
  **`#bulkDropdownList` is `width:max-content`** so item codes never truncate; the product
  label gives way instead.
- **A LONG PANEL SCHEDULE SPLITS INTO TWO COLUMNS** (`FLAT_SCHED_SPLIT_AT` = 9) so it
  doesn't squeeze the elevation; split rather than shrink (dual-unit cells would wrap). The
  continuation keeps the rule and headers, drops the title and the `ALL PRINT FILES` footer,
  and borrows the second spec column ONLY on a single-graphic sheet.
- **ITEM CODES ARE IN NUMBER ORDER EVERYWHERE, AND IT IS NOT A SETTING.** Never add a
  toggle. Enforced on the DATA (`dashProjectData` stored order): `_codesSortRows()` (type
  order ART, EGD, WF from `_codePrefixOrder`, then number, then piece letter) and
  `_codesSortWalls()` (by lowest code on the wall; blank walls last).
  **Four gestures, one rule each.** `_codesSettle()` after add/delete/recode;
  `_codesAdoptRowOrder()` after a user reorder (renumbers); `_codesMovePlacement` /
  `_codesMoveBeside` for the Items drag; `_codesRenameRow` for a typed code (number is a
  position, new prefix recodes via `_recodeForCategory`, letter change renames one piece,
  number change on one piece moves the set). None push history; the caller does.
  **A structured or catalogue code is never renumbered and RESERVES its number**
  (`_renumberPrefix`). **`applyIdRename(…, quiet)`** skips its re-renders;
  `_codesRefreshViews()` redraws once. `_fpRenameGroup` also renames a wall named after the
  code, at a word boundary.
  **The code field commits on change, never per keystroke** (table cell, `m_itemCode`, wall
  frame field), or typing ART.12 passes through ART.1 and merges frames.
  `_codesSortRows()` also runs atop `renderDashTable`, `_deckPageList` and `_fpFillItemList`
  as a safety net, which is why removing a settle from `_fpAddCodes` stays green.
  **The floorplan Items list is where codes are run from**; `_jumpToCodes()` opens it with a
  Back bar (`deckReturnBar`, filled by `_returnBarInto`).
- **NOTHING FLOATS: + Add Wall and + Add Item ask WHICH PLACEMENT** (`_askPlacement`,
  `_placementList`, `_placementMint`, `_placementHang`, `_placementGrow`). Wall mode offers
  unhung codes or a new code on its own wall; item mode grows an existing code (next free
  letters, single ART.4 renamed ART.4A first, new frames hung RIGHT of the set at
  `SET_GAP_IN`) or mints one with no wall. Catalogue rows never offered (`_catalogueRowIds`).
  One history entry: `_fpAddCodes(..., {quiet})`. A duplicate keeps its prefix
  (`_codePrefixOfRow`).
  **CSV import follows the same rules** (`_csvPlaceRows`): export appends a trailing
  `Category` column; import resolves category from it, else prefix + product; a code with no
  `PREFIX.n` gets the next code of its type (separated single-letter stems like `Lobby-A`
  stay one set); a parsing code is never touched. Bulk Images never creates rows.
  **A LOCAL `const` NAMED LIKE A GLOBAL FUNCTION SHADOWS IT FOR THE WHOLE BLOCK** (TDZ
  throw). `drawElevAll` uses `_openSfx`, not `const unitSuffix`.
- **`r.level` IS A 0-BASED PLAN INDEX, ALWAYS A NUMBER.** `dashDefaultData.level` is `0`.
  `_rowLevelsMigrate` (in `_fpMigrate`) converts an UNPINNED row's legacy 1-based string;
  never touches a pinned row or a number. Dashboard control is a `<select>` of plan names
  (`_fillLevelSelect`), disabled while pinned. Every write stores `_deckLvlOf(...)`;
  `_fpGroups` compares numbers.
  **A new placement adopts the untouched default wall** (`_elevPristine`: default name,
  nothing on, traced on or linked to it).
- **A ROW CAN BE PINNED ON SEVERAL PLANS** (`r.planPins = [{lv,x,y}]`).
  **Quantity is NOT affected**: qty comes from elevation frames
  (`recalculateDashboardQuantities`); a test pins that qty never reads `planPins`.
  **`r.planX`/`r.planY`/`r.level` are the PRIMARY**, a derived mirror of `planPins[0]` kept by
  `_fpSyncPrimary`. Adding a pin on a second plan must **not** move the primary.
  **`_fpGroups(level)`**: with a level, resolves to that plan's pin and sets `g.level`;
  without, the primary. `_fpPins` is **read-only** (never seed on read).
  **Two placement UIs** (Deck Studio centre and the markup tool) must both go through
  `_fpSetPin`/`_fpClearPin`; a test pins all six handlers.
  **The wall line is per plan too** (`r.planWalls`, derived primary in
  `r.wallLine`/`r.wallLines`/`r.wallPanels`). `_fpGroups(level)` resolves BOTH pin and line.
  The Single/Diptych/Custom mode is per plan too.
  **Deleting a level must RENUMBER the pins (and wall lines) above it**, or they silently
  re-home onto the plan that slid into the slot.
- **`_deckPlanSlots` IS THE FLOORPLAN/SPEC PAGE ORDER.** It returns neutral slots
  (`{t:'key',li}` / `{t:'detail',li,pd}` / `{t:'unit',li,u}`), not pages; `_deckPageList`
  maps them to descriptors.
  `editorialContent.planOrder`: `byLevel` (default; plan, then that level's specs, next
  level), `plansFirst` (all plans, then all specs), `manual` (plans in
  `editorialContent.planSeq`, then specs in the same sequence; behaves like `plansFirst`).
  A test pins that all modes contain exactly the same pages. An unrecognised value falls
  back, never stored.
  `planSeq` is sparse and reconciled against existing levels on every read (`_deckPlanSeq`):
  new levels append, deleted ones drop out (no blank page). `moveDeckPlan` seeds from the
  resolved order.
  The control appears twice (Project tab, floorplan Plan tab) and is ONE setting: both read
  `_deckPlanOrder()` and write through `setDeckPlanOrder`; never assign
  `editorialContent.planOrder` directly (tested). Both selects need an explicit inline
  height: the global `select` rule pins 26px, so padding alone clips descenders.
  A plan detail pinned before a unit follows that unit in every mode; unanchored details
  travel with their plan. `_deckEmitLevels` is the one "does this level emit" test.
- **A WALL LINE IS DRAWN BY FIVE RENDERERS AND NONE SHARES A PATH**: Deck Studio centre
  (SVG), rail thumbnail (`_deckMockHTML`), floorplan key page (`doc.line`, jsPDF or
  `CanvasPdfRec`), plan detail page and spec-page plan thumbnail (both via `<canvas>`).
  All read `FP_WALL_LINE_ALPHA`; never a local number.
  It is alpha, not multiply: vendored jsPDF `GState` keeps only `opacity` and
  `stroke-opacity` and silently drops other keys. `_fpDocLineAlpha` degrades to solid when
  there is no `GState`; the key page must reset alpha to 1 or pins and legend inherit it.
  `CanvasPdfRec` implements `setGState` with fill and stroke alpha tracked separately, and
  `render()` must actually read `st.sa`.
- **The floorplan panel is three tabs** (`_fpPanelTab`: Items / Categories / Plan). Items
  has a filter, an **Unplaced** toggle, collapsible category groups, the code shown on each
  row and a colour-chip category picker. All module state, never project data.
  `_fpFillItemList` rebuilds the list alone: re-rendering the panel per keystroke destroys
  the input being typed in.
- **Shift locks a wall line to an axis** (`_fpAxisLock`) in drag and click-to-click modes.
  Apply it in BOTH preview and commit. Decide the dominant axis in pixels, not normalised
  0..1 (plans are rarely square).
- **The loupe** (`_fpLoupeShow`) magnifies under the cursor while placing a pin or line; not
  a plan zoom, because the preview IS the printed page. `position: fixed` on `<body>` so
  overflow can't clip it. Hide it on every disarm path; keep it tracking through a drag.
- **A floorplan page has no Templates tab** (`_dsPageTakesTemplates`); hidden, not
  disabled, Layers stays. Re-apply the hide via `_dsSyncToolsTabBar` after `_dsToolsTab`
  runs, and fall back to Page if Templates was open when a plan is selected.
- **ONLY INSERTED LAYOUT PAGES CAN BE MOVED** (`_dsPageMovable`). Fixed pages, floorplans,
  plan details, spec pages and breakers are placed by `_deckPageList` / `_deckPlanSlots`
  from the data; don't add per-page overrides for them (manual plan order covers it).
  `_dsPageLockNote` says why a page can't move and where its order is decided.
  **`_dsMovePageTo` is the ONE move** (rail drag, "move to page N", page-actions menu). It
  reads the anchor off the RESULTING order, drops `place` (it fights the hand-set
  `afterKey`), and re-sorts `layoutPages` via `_dsSyncLayoutPageOrder` (the resolver walks
  that array once, so an anchor later in it is missed and the page falls to the end).
  **THE DRAG IS KEYED ON THE PAGE, NEVER ITS INDEX** (`_dsDragFromKey`, resolved fresh by
  `_dsDragFromNow` / `_dsDragSrc`): `_dsRefresh` replaces `_dsPages` mid-gesture
  (autosave, thumbnail build, elevation prime), so an index moves the wrong page.
  `dragover`/`drop` are ONE shared pair wired for every cell BEFORE the movable check; a
  locked cell returns before `draggable` is set (accepts a drop, can't be picked up).
  **The gap between pages is one element with two jobs** (`.ds-insstrip`): insert-a-page
  and drop target. Mark the gap, not the cells, or one gap reads as two slots. The two
  gaps beside the dragged page stay dark (no-op). Always visible, tall enough to hold its
  button, and it owns ALL inter-cell spacing (cells have no margin). The elevation rail
  still marks tab edges (`.drop-before`/`.drop-after`) because its tabs are flush.
  **`_dsPlaceRelative`** moves before/after a page NUMBER, resolving to a gap and going
  through `_dsMovePageTo`.
- **THERE IS ONE PAGE LIST AND ONE PAGE DISPATCH (18.32).** `_deckPageList` is the deck;
  the PDF export (`_buildSpecPagePDF`) walks it and draws each descriptor through
  `_drawDeckPage(doc, desc, env)` (spec pages via `_drawDeckSpecPage`), the same function
  `renderDeckPageCanvas` / `renderSpecPageCanvas` use for the preview. A rule about which
  pages exist goes in `_deckPageList` and nowhere else; a rule about which drawer a page
  uses goes in `_drawDeckPage` and nowhere else.
  The CALLER owns the page (create it, `_pageThemeAutoApply`, the plan-link ledger, the
  footer sweep); the dispatch owns what is drawn, and returns false for a page with nothing
  a doc can draw (a freeform spec page) so the preview keeps its live HTML.
  **Frame Recommendations is the one descriptor spanning several PDF pages**: its count
  depends on the async frame library, so the export expands it (`env.frPage`) while the
  studio lists it once. Known gap, not a second list.
  `_deckPageKey` keys plan detail pages `plandetail:<id>`.
  `test_export_walks_deck` runs the REAL export with real jsPDF and compares its page keys
  against `_deckPageList()`.

- **EGD wall mode** (`elev.egdWall`, `_isEgdWall`, `toggleEgdWall`) is **per elevation**,
  unlike the rest of that guides row. Flat graphics it governs are filled to the wall and
  pinned above the baseboard by `_clampFlatToWall`, called on drag AND redraw, AFTER the
  snap (wall edges are snap targets).
  **Flat graphics render behind framed art unconditionally**: `drawElevAll` sorts them to
  the front of `_drawOrder` while preserving original indices, because
  `makeElevDraggable` and every dim lookup address frames by index in `elevFrames`.
- **WALL CONTEXT: the underlay never exports, the blocks always do.**
  `elev.underlay = {src, x, y, w, h, opacity}` is a tracing guide;
  `elev.contextBlocks = [{x, y, w, h, label}]` are doors, windows, millwork, TVs. Both in
  `elevUnit`, `x`/`y` bottom-left; `_ctxPxTop` is the only flip.
  The export split must hold in THREE places: `exportElevSVG`'s `annotationLayers`, the
  artboard-bounds list, and `exportElevPNG` (html2canvas of the live DOM; it hides
  `#underlay-layer` and restores it in the same `finally` as the rail).
  **A context block OCCLUDES**: `CONTEXT_FILL` is opaque white and `#context-layer` is
  z 8, over `#frame-layer` (6); blocks take the click over frames they overlap.
  `#glazing-layer` is z 9 so traced windows don't cover their mullions.
  **Baseboard trap**: it is emitted into `midLayer` (vector, over the raster), so it is
  drawn as GAPS: spans of blocks crossing the baseboard y are subtracted, overlapping
  blocks merged into one gap. Keep it vector.
  **Context blocks are NOT in `annotationLayers`**: `_elevAnnOps` only understands
  rect/line/text and would drop their nested `<svg>` art. They go in the SVG back layer,
  collected in `ctxLayer` and pushed AFTER the frames loop (`backLayer.push(...ctxLayer)`),
  via `rectToSvg`. That flush must stay ahead of both consumers (downloaded SVG and the
  `returnBlob` split). `#context-layer` IS in the bounds list (runs past corners must not
  crop); `#underlay-layer` is in neither.
  `_scaleElevContext` is called from the same two sites as `_scaleElevGlazing` (load with a
  divergent unit, unit toggle); it scales the underlay too but never `src`/`opacity`.
  Underlay fade clamps to **0.05 to 0.95**. `_elevUnderlay()` is READ-ONLY and returns
  null rather than seeding (else every snapshot gets an empty object).
  **The underlay is contained at its true aspect on import, never stretched.** Store
  `natW`/`natH`; `lockAspect` defaults on; `_underlayResize` moves the partner dimension.
  No natural size: `_underlayAspect` returns null and sizing is free. `fitUnderlayToWall`
  is the one deliberate stretch.
  **Calibrate**: click two ends of a known feature, type its size; scales about the FIRST
  click, both axes by one factor, then hands over to Place. While calibrating,
  `makeElevDraggable` and `_makeContextDraggable` both yield.
  **The draw tool arms a preset and returns to select mode after one block**;
  re-clicking the armed chip disarms. `CONTEXT_PRESETS` seed shape + size + label;
  `CONTEXT_SHAPES` (four) are what draw. Sizes authored in inches and converted.
  `<ellipse>` needs its own export branch (`emitEl` border cases only emit `<rect>`).
  **Blocks carry a stable `id`** for anchoring (`resolveAnchor` `ref: 'context'`), never
  an index. `_elevContextBlocks` backfills ids on read. Blocks are snap targets in
  `computeSnapForDrag` and `customLineSnapTargets`.
  **A full-wall `inset:0` layer MUST set `pointer-events: none`.** Frames opt back in via
  `.frame-vis`; `wireElevArtworkDrop` acts only on `e.target.closest('.frame-vis')`. Check
  this first for any "can't click the thing I just made" bug.
  **`CONTEXT_LIBRARY`** (seven categories, North American hospitality sizes);
  `CONTEXT_PRESETS` is its flattened form, always look up by key. Load-bearing:
  (1) `affMode`: `aff: 60` is the CENTRE for a TV/sconce, the UNDERSIDE for a door;
  `_ctxPresetBox` is the one resolver (`center`: bottom = aff - h/2) and the one
  inches-to-`elevUnit` conversion. (2) A bed's `h` is mattress height (24"); its length is
  `lengthIn`, never drawn. (3) Library items are NOT shrunk to fit the wall.
  A click places the library size (`_ctxPlaceAt`), a drag overrides it (`_ctxDrawUp`);
  `freeform: true` (Box/Circle) makes a click place nothing. `_ctxNewBlock` is the one
  constructor.
  **A drag sets the SIZE; `b.lockAspect` owns the PROPORTION** (art uses
  `preserveAspectRatio="none"`, so wrong proportion distorts strokes). `_ctxAspect(b)` reads
  it from the drawing (view- and variant-aware), else library size, else the box.
  `_ctxResize(b, driver, value)` moves only the other dimension. Stored by `_ctxNewBlock`
  as `!p.freeform`. Drag-create contains the aspect inside the dragged rect;
  `resetContextAspect` keeps the width. Turning the lock on does NOT retro-correct the box.
  **Line art is `p.svg`; the project stores the KEY (`b.preset`), never markup.**
  `_ctxArtSvg` applies `fill="none"`, stroke and `preserveAspectRatio="none"` once on a
  wrapping `<g>`.
  **`vector-effect` is NOT inherited**, so it can't be set on the `<g>`. Use
  `_ctxArtSvg(p, ink, pxScale)`: weights are authored in screen px and DIVIDED by the draw
  scale (block width / real width), including `stroke-dasharray`. Both renderers must pass
  a scale.
  **Line weight hierarchy** as nested `<g stroke-width>`: `_O` object, `_D` detail, `_F`
  fine, `_H` hidden (dashed). Weights live only in `CTX_LW_*`. Mitre joins, butt caps.
  Doors carry a 2" jamb, three hinges at true AFF, a lever at 36" (34" ADA) on a 2.75"
  backset and an undercut; casework has a top slab, reveals, pulls, toe kick. Tested; don't
  "simplify" the drawings.
  **`p.variants` are STYLES, not sizes**: `setContextVariant` keeps width, moves only
  height from the drawing's aspect. Slot zero is the original. Front only
  (`BED_STYLE_VARIANTS`); a turned block falls back to `p.side`.
  Traced art pipeline (`tools/trace-cad-svg.js`): parse, flatten, stitch, cluster,
  simplify, despike, bucket by run length (longest 10% object, next 35% detail, rest
  fine). Check the licence before importing. Stitch rules: join within a distance
  TOLERANCE (cells for lookup only, 3x3 neighbourhood), and continue through junctions by
  direction, where direction only chooses between candidates and never vetoes a lone one;
  only a reversal (`MAX_REVERSE`) is refused. `despike` removes short hairpins (RDP can't).
  `MIN_RUN` 0.9 on a 100-wide drawing drops dust. Expect fewer, longer polylines with more
  total ink after a correct stitch.
  **`p.side = {w, h, svg}`** is the front/side toggle and carries DIMENSIONS:
  `setContextView` resizes holding the left edge and floor. Items with no side refuse the
  turn in data; the picker is `disabled`, not hidden. `_ctxArtFor(key, view)` is the ONE
  resolver, used by screen and export via `data-ctx-art` + `data-ctx-art-view`.
  **Context is line work on an opaque white body; no item ships with a hatch.** The `tv`
  shape's tone is opaque `#dedede`, never `rgba()`. `CONTEXT_DRAW_FILL` is the rubber-band
  wash only. viewBox is the item's own `w h` in inches. In the export, `currentColor` is
  replaced with `_ctxInkHex()`. Art is emitted after fill ops; `ctx-has-art` drops the
  block's border.
  **Delete acts on the selection**, gated on `_ctxSelectedCount()`; that branch must stay
  BEFORE the custom-line Delete branch. Ctrl-click extends (captured at mousedown), the
  marquee uses `dataset.ctxId`, Ctrl+A is scoped to the Context tab, and clicking a frame
  or empty wall calls `_ctxClearSelection()`.
  `fill` (`plain|wood|glass`): `_ctxFillOps` is ONE generator for screen and SVG returning
  plain segments (not a CSS gradient, not an SVG `<pattern>`). Spacing in screen px, not
  scaled; capped at 120 strokes. Each clip path needs a unique id.
  **`ELEV_FINE_FACTOR`** (Shift fine mode) is read live off each event. Corner scale uses a
  virtual pointer (`vx`/`vy`) or damping does nothing. Wheel scales about the image
  centre, both axes; wheel/arrow bursts share `_ulScheduleHistory` (one undo entry). The
  wheel listener must be `{passive: false}`.
  **A hatch is clipped to `p.hatch`, declared PER VIEW** (bed plinth, door leaf, window
  glass). An art block with no region gets NO hatch; a plain primitive fills its box.
  `_ctxFillSvg` builds one clipped `<svg>`; the export reuses that markup (ids rewritten).
  **`_elevSnapTargets` / `_elevSnapPick` are the shared snap engine** behind
  `computeSnapForDrag` and `_ctxComputeSnap` (wall edges/centre, hang line, frames,
  glazing seams, blocks). `skip` excludes the dragged thing. Group drags skip snapping.
  Nudges debounce via `_ctxScheduleHistory`.
  **The sidebar is tabbed** (`switchElevTab`, Art / Guides / Context / Glass; the strip sits right under the wall section, and Layout Guides is the Guides tab since 18.51, keeping the frame list above the fold). Since 19.05 they are category tabs (`.elev-cat-tabs`: icon, name, count), still `.frame-tab`/`.active`. Hide panes with
  `display`, never detach (`initElevControls` renders all containers every time). Restore
  with `''`, never `'block'`.
  **The pane is the scroll region and needs `min-height: 0`** (`overflow-y: auto` alone
  doesn't shrink a flex child). Art pane stays `flex: none`. One scroll region per panel
  (no inner caps like `.ctx-list` 40vh). Call `_elevShowTabFor` before filling a panel
  programmatically.
  The draw tool's check must sit BEFORE the `.draggable` passthrough in
  `wall.onmousedown`. `_elevSnapStep()` is the one reading of `dragSnap`, shared with
  `makeElevDraggable`. Blocks may overhang the wall; a label is dropped, not shrunk, when
  it won't fit. Context and glazing panels are built at the TOP of `initElevControls`,
  before its no-frames early return.
- **A WALL'S IDENTITY IS `elev.id`, NEVER ITS INDEX** (`_elevId`, `_elevById`,
  `_elevIndexById`, `_elevMigrateIds`). Splicing the array silently re-points stored
  indices at a different wall.
  **`variationOfId` is the truth; `variationOf` is a DERIVED numeric mirror** (for older
  builds), re-derived only by `_elevSyncVariationPrimary()` after every array mutation
  (one writer, tested). It also promotes orphans (clears `isVariation`), since a dangling
  variation reads qty 0 in `recalculateDashboardQuantities`.
  **`let _elevIdSeq` must be declared ABOVE `let elevations`**: the boot literal calls
  `_elevNewId()` at module scope (TDZ).
  `_elevId()` backfills lazily. `_elevMigrateIds()` converts old numeric `variationOf`
  against the array as saved and is called from both install points (project open and
  `restoreProjectState`).
  **A clone must get a new id**: `duplicateCurrentElevation` mints one (else
  `_elevIndexById` is ambiguous) and copies with `_cloneData`.
  **DELETING A WALL ASKS ABOUT ITS PIECES (19.04).** `_elevOwnPieceIds(wall)` = rows hung (active) on this wall
  and no other; never on a catalogue wall, never every row. When non-empty, `_confirmDestroy` gets an `alt`
  (`Delete wall, keep pieces`) beside `Delete wall and N pieces`; `_deleteElevationNow(idx, {withPieces})`
  re-reads the ids at confirm time and deletes them with the option-rows path (one history entry).
- **CATALOGUE: THE MODEL AND THE CODES.** A catalogue is a document of CHOICES, not an
  order: one placement offered with several arrangements and several sets of artwork, and
  the client picks. It deliberately states no quantity.
  Walls: `elev.catalogueMaster` marks a MOCKUP (an arrangement drawing; `_isCatalogueMaster`,
  switched per elevation by `#catMasterBtn` / `toggleCatalogueMaster`). An OPTION is a wall
  with `catalogueOption` + `variationOfId` pointing at its mockup (`_catMasterOf`,
  `_isCatalogueOption`). Options are identified by that LINK, never by parsing the code.
  Spelling (17.97, current): `ART.1` placement (primary arrangement, short form), `ART.1B`
  another arrangement (layout or frame set, both just the next free letter), `ART.1.1`,
  `ART.1.2`, `ART.1.3` image options numbered across the whole placement, `ART.1.2A` a piece.
  A frame set is stored as `elev.catalogueSet` on the mockup; `_catSetNum` / `_catSetKey`
  read the wall first (`_catWallSetOf`) and parse the code only as a legacy fallback. The
  set key is a grouping key, never a name. The old `ART.01.2` frame-set spelling is legacy
  only (`_catMigrateSetCodes` converts it once).
  The placement is DERIVED from the code by stripping the trailing letter run
  (`_catPlacementKey`, `_catArrLetter`, `CAT_CODE_RE`, `_catCodeParts`), never stored; a
  code ending in a digit is its own placement. A placement ends at its FIRST number group;
  the regex must parse the WHOLE code (so `L2.ART-2` resolves to itself, not `L2`).
  `_catBaseCode` is derived from the mockup's slots, never stored. Existing grouping
  machinery already handles the convention (`_artGroupKey`, `_artGroupNum` keeps dotted
  numbers unpadded, `_breakerCodeFor`); a test pins them. Both must strip a trailing `.`
  separator (`ART.1.A` must not key as `ART.1.`).
  Helpers: `_catArrCmp`, `_catArrangementsOf`, `_catPrimaryArr`, `_catSetsOf`,
  `_catPlacementPrimary`, `_catTree`, `_catPlaces`.
  `catalogueFree` / `_catLayoutIsFree` are RETIRED (a frame set is a level now); do not
  bring the flag back, and copies delete it.

- **CATALOGUE: THREE INHERITANCE SCOPES (`_catSyncArrangements`, `_catSyncOption`,
  `_catSyncAllOptions`).** Keep them apart:
  PLACEMENT owns the wall (`CAT_WALL_FIELDS`: size, EGD mode; `CAT_WALL_DEEP`:
  `personPos`, `contextBlocks`, `glazing`, `groupDims`, `customLines`) and the one plan pin
  (`CAT_ROW_FIELDS` / `CAT_ROW_DEEP`). FRAME SET owns frame SPECS, matched by LETTER
  (`CAT_SPEC_FIELDS`, DERIVED from `CAT_SLOT_FIELDS` minus x and y; deriving keeps a new
  frame field from reaching one list only). A LAYOUT owns its positions and its own
  dimension callouts: `groupDims` / `customLines` are skipped on the layout hop because
  they measure between frames that moved. A letter with no counterpart in the primary
  (a 5-piece hang under a 3-piece primary) is simply its own. An OPTION owns ONLY its
  images and mirrors everything else from its mockup, including `CAT_SLOT_FIELDS`
  positions, `groupDims`, `customLines` and `CAT_SLOT_DEEP` (`dimTo`, `distToggles`).
  Artwork fields are in none of these lists; a test pins that.
  Deep fields are compared as JSON and cloned only on a difference (runs on every redraw
  of a dragged wall). `CAT_SLOT_DEEP` must stay deep: a shallow `!==` on the
  `distToggles` OBJECT would share one object between two walls and alias them through
  undo. `underlay` is never mirrored and is STRIPPED when an option is created (megabyte
  data URL, never exports).
  Sync is lazy, in `drawElevAll`; `_deckPageList` calls `_catSyncAllOptions()` before
  building, because `drawElevAll` only runs while the Elevations tab draws. Arrangement
  sync runs BEFORE option sync inside it, or an option of an alternate arrangement lags a
  render behind.
  ONE PIN PER PLACEMENT: the primary layout of the PRIMARY SET, tiebroken by set number
  FIRST, then letter (unlettered first, shortest letter then alphabetical, so `Z` before
  `AA`). A letter-only compare is wrong when set 1's primary is lettered and set 2's is
  not; a test builds that case on purpose.

- **CATALOGUE: QUANTITY AND OUTPUTS. NOTHING IN A CATALOGUE BILLS.**
  `recalculateDashboardQuantities` skips a mockup outright and skips options via
  `_isCatalogueOption` (its own clause, NOT by setting `isVariation`, which also drives
  orphan promotion and the `variationOf` mirror; a test reads for it). Option rows remain
  distinct items with their own codes and images; a test pins that zeroing qty did not
  merge them. Never flag an option `isVariation`.
  Mockup slot rows are a drawing, not stock: excluded from the CSV (`buildDashCSVString`
  via `_catSlotRowIds()`), quantities, spec pages (`_deckSpecRows()`, the ONE answer to
  which rows earn a spec page) and the PNG pack. When a rule says "excluded from output",
  check all four.
  A mockup slot TAKES NO ARTWORK (`_catRowTakesArt` / `_catRefuseArt`), enforced in the
  DATA at `applyArtworkToCurrentRow`, `applyArtworkToRowIndex`, `_bulkApplyArtwork`, and
  `_bulkMatchPieces` must not offer a slot as a relink target. Negative controls break
  ONE path at a time.
  The CSV carries a trailing `Arrangement` column from `_catLayoutTagForRow`.

- **CATALOGUE: PAGES, BREAKERS AND WIREFRAME.** One breaker per ARRANGEMENT, drawn from the
  MOCKUP, printed once (`_breakerElevFor`, `_breakerNameFor`, `_breakerOvKeyFor`,
  `_catMockupForUnit`). STATELESS: the unit that earns it is the first in the shared
  `units` array belonging to that mockup. Titled with the mockup's code, keyed
  `elevgrp:cat:<elevId>` so per-page settings stay with the placement; the `elevgrp:`
  prefix is load-bearing (`_drawInstallGuidePage` keys breaker decisions off it). The
  placement overview page (`_catOverviewFor`, keys `catov:`) is stateless the same way.
  `_elevShowingPiece(rowId, opts)` is the ONE answer to which wall is drawn beside a
  piece; never let a mockup win it.
  Wireframe is PER WALL (`_elevIsWireframe`, `_curElevIsWireframe`): mockups draw grey
  placement drawings, options draw photos. The `renderElevationToCanvas` call sites and
  both live-elevation renderers ask the wall; `renderFrameToCanvas` deliberately does NOT
  (one piece, no wall); a test pins that split. Do not add a second argument to
  `_captureElevWithGuides` (index-only is pinned). Cache invalidation is free because
  `toggleCatalogueMaster` pushes history.
  The `catalogue` preset keeps `wf: false` (deck-wide wireframe would grey the option
  pages), sets `breakers: true` and `tpl: 'setLegend'`. `breakers` is read only when a
  preset declares it.
  An option row answers for its own plan crop (`_catRowAsPlanGroup`, used by
  `_planCropCanvasForRow`) because options are filtered out of `_fpGroups`.
  `_catSettleAll()` runs FIRST inside `_codesSettle()`: `_catMigrateSetCodes`, then
  `_catRenumberOptions(place)` (options 1..n in `_catTree` order: set, letter, stored
  option number, via two-pass temp renames), then `_catOrderWalls(place)`. Catalogue rows
  sort by wall and frame position (`catOrd` in `_codesSortRows`), which is what puts each
  breaker before ITS options. A placement is a renumber unit: `_codeUnitOf` gives its stem
  (`_catStemOf`, dot codes only) and `_codesRenameStem` renames under it; the temp stem
  must itself parse as a stem (`ZZRN<letters>.9000nn`) or pass two cannot find it.
  `_renamePageKeys` also moves `catov:` keys.
  Every arrangement mints its first option (empty when not carrying) or it yields no unit
  and therefore no pages. Deleting an option deletes its rows.
  Deck-wide coverage view: `openCatalogueOverview` / `_catOverviewData` (a row per
  placement in `_catPlaces` order, a cell per option in `_catTree` order; an arrangement
  with no options gets a dashed "no image sets" cell). Offered only with two or more
  placements.

- **CATALOGUE: THE OPTIONS SHEET (18.64).** A placement whose every option is ONE piece
  (`_catSheetMode`) prints its All-options page as a sheet (`_drawCatSheetPage`): shared spec
  column (`_drawSharedSpecColumn`, `noQty`, option tails `.1` as letters) on EVERY page, mockups
  coded above, image code below. It REPLACES the options' spec pages and sits AFTER the breaker
  (`specPagesFor`). Per page is DERIVED (`_catSheetLayout`: one scale, `CAT_SHEET_MIN_PT` on
  sqrt(area), even split), never a setting. Multi-piece placements keep the drawing overview.
  A single-piece mockup mints `ART.1.1`, not `ART.1.1A` (`_slotL` in `_catAddOption`).
  Its SHOW ON PAGE ticks are a THIRD map (`catSheetSlots` / `catSheetSlotOverrides`,
  `_catSheetSlots`, default plan + elevation OFF), keyed per placement (`_catOverviewKey(place)`)
  so a split agrees; panel is `_dsSpecSlotsInto(..., 'sheet')`. `catov` is thumbnail-drawable.
  **Its left column IS the per-piece page's** (18.66): `_drawSpecPageTemplate(..., {sheet})`
  draws title + thumbnails only and returns `{specX, specW, specY, thumbTop}`; the shared spec
  block is fitted above `thumbTop`. `_specTplMap` is the ONE template-to-page map. Never
  hand-place sheet thumbnails again (`test_cat_options_sheet` compares positions to a real
  per-piece render).
  Options per page is `per` in the SAME map (0 = auto, 1..10 honoured exactly, even past the
  floor; auto splits evenly). `_catSheetLayout(place, PW, PH, {auto})` reports what auto would pick.
- **THE CONTENTS PAGE WRITES ITSELF (18.71).** A layout page of type `toc` is generated:
  `_tocSeed` reads its template ONCE (section-title box + `#<tab>` entries box pairs, rules
  in the annotations) into `page.toc` (grid + style) and removes those slots; `_tocSyncAll`
  runs at the END of `_deckPageList` and rewrites the `_toc` + `locked` elements (writes
  only when `page.toc.sig` changes). They are plain text/arrow elements, so every renderer
  draws them; the editor gives them no pointer. Sections: divider/breaker layout pages,
  else Introduction / per level (or Floor Plans + Artwork) / Closing. Spec runs collapse
  to one Artwork line; a wall breaker absorbs the spec pages after it. Numbers come from
  `_tocPageNums` (same span as the export); the export re-syncs with its real
  `_span`. Overrides: `editorialContent.tocOverrides[pageKey] = {hide, label}`, one
  writer `setTocOverride`, panel `_tocPanelInto`. A `tpledit*` page (template editor) is
  never converted. A page of ANY type holding the template's slots under a CONTENTS heading
  is converted (`_tocLooksLikeContents`), and `_dsApplyTemplateToCurrentPage` carries the
  template's role (toc / breaker, and back off toc). Overrides are stored RELATIVE TO THE
  DEFAULT (`_tocDefaultIn`: a layout page with no heading starts OUT and records `show`;
  everything else records `hide`; `section` overrides `_tocSectionDefault`). The per-page
  tick is `_tocPageInto`, in `_dsRenderTools` after `_dsPageActionsInto`, shown only while
  the deck has a contents page. Lines carry `_tocKey` / `_tocPage`: a PDF link in
  `_drawMoodboardPage` (guarded on `doc.link`, which `CanvasPdfRec` lacks) and a click to
  `_tocGoTo(key)` in the editor (only on `dsLayoutCanvas`). Spec runs split by LOCATION
  (`_tocSpecLoc`, `_tocRunLabel`); placeholder lines are matched on wording
  (`TOC_PLACEHOLDER_RE`, never "came from a template") and go to Preflight. The RAIL counts
  printed pages too (`_dsPrintedStarts` / `_dsPrintedLabel` / `_dsIndexForPrinted`), and a
  typed move number is a printed number. OVERFLOW (18.76) is a REAL layout page
  (`_tocPartOf`, id `<id>~2`, anchored after the first, not movable) created/removed by
  `_tocSyncPage`; a structural change makes `_deckPageList` rebuild ONCE
  (`_tocSyncAll._rebuilding`). `_tocLayout` returns `parts`; type never shrinks, nothing is
  dropped; grid unless it takes more pages than flow. Section titles link (divider, or
  first line). Contents TYPE lives in the FIRST page's `toc.title`/`toc.entry`
  (`_tocSetType`, original kept in `toc.base` for Reset; continued pages follow it).
  `_tocRenameSource` writes a line's rename into the page's biggest text (layout pages
  only) and clears the override. 18.78: the title column WIDENS to the longest title,
  taking only what the lines do not need (no setting); closing pages after the last artwork
  page get Closing in divider mode too; `_tocAutoInk` (page Text Dark, or a dark bg
  colour/gradient) gives white unless the colour is the designer's (`colorSet`, or differs
  from `toc.base`). Options on `toc`: `ruleOff`, `rule.colorSet`, `numColor`, `even`.
  18.79: `_tocStripTemplateRules` runs on EVERY sync (template rules were found doubled
  under the generated ones). Made-up sections rename via `tocsec:<tag>[:<level>]` keys.
  Name fields hold the real text (`_tocNameField`; equal to auto stores nothing) with a
  reset arrow (`_tocResetBtn`).
  Wrapping uses `_tocTextW` (a fixed char table, NOT a font measure,
  because the result is stored); checked against real Messina within ~2%, breaks at 94%.
- **IMAGES PRINT AT THE SIZE THEY PRINT (18.80).** Mockups/thumbnails are still DRAWN as
  before (shadows are fixed pixel blurs; drawing smaller changes the look) but the
  flattened copy is sized by `_rasterFit(cnv, boxW, boxH, head)` before encoding (contain
  fit x `_expR()` x head: 1.5 pictures, 2.5 line work; 0 box = the page). A new deck-page
  raster site must go through it. The PDF capture asks `exportElevSVG({forCapture})` for
  capture-sized frame rasters and `_imgDownsized` artwork; the SVG download and bulk
  export keep full resolution. `_loadImg` caches `data:` decodes (`_imgCache`, LRU 40,
  failed loads not kept); callers must not mutate or re-parent the element.
  **EVERY PNG INTO THE PDF GOES THROUGH `_addPngImage`**, and a PNG source must never be
  added as 'JPEG' (jsPDF stores both RAW: 30 MB of a 35 MB file).
  `test_image_print_size` fails on any raw image in a real export.
- **THE PROJECT FILE STORES EACH IMAGE ONCE (18.81).** `_projectFileText(payload)` writes
  `{type: 'frame-project-v7', imagePool: [...], project: <payload>}`, every `data:` string
  >= `POOL_MIN` replaced by `POOL_MARK + index`; `_projectFromFile` (first line of
  `_readProjectText`) puts them back, and passes an older single-level file through. The
  outer type must NOT start with 'master-studio' (older builds refuse instead of opening a
  picture-less deck). Only the FILE is pooled: memory, autosave and undo are not. Real
  project: 44.0 MB -> 28.2 MB, round trip byte-identical.
- **THE SELECTED RAIL CELL IS A CLONE OF THE CENTRE (`_dsSyncActiveThumbnailMirror`), AND
  `cloneNode` DROPS CANVAS PIXELS.** `_dsCopyCanvasPixels` copies them, or canvas-drawn pages
  go blank in the rail while selected.
- **CATALOGUE: PLAN PINS.** The primary's slot row is pinned once and every arrangement and
  option row mirrors it through `CAT_ROW_FIELDS` / `CAT_ROW_DEEP`, including options that
  existed before the pin. Options (`_catOptionRowIds`) and alternate arrangements
  (`_catAltArrRowIds`) are filtered out of `_fpGroups` so the plan shows one pin per
  placement; they keep the pin data for their spec-page crops. `_catAltArrRowIds` builds
  its map in ONE pass (called on every plan render).

- **CATALOGUE: MINTING AND DUPLICATION TRAPS.** `duplicateCurrentElevation` branches on the
  flag: from a mockup it mints an OPTION (`_catAddOption`, one row per slot, APPENDED after
  the last option, not at `srcIdx + 1`); from an option it mints a sibling option
  CARRYING the pictures. Nothing may claim to be an option while pointing at a wall that is
  not a mockup. A PLAIN duplicate must DROP the catalogue flags, or a copy points at an
  option, `_catMasterOf` returns null and the wall can be marked a mockup, minting
  colliding row ids.
  Two rows with one id is unrecoverable corruption: both minters refuse up front via
  `_catRowIdsTaken`.
  `_catAddArrangement(srcIdx, {newSet})` is the ONE minter for layouts and frame sets
  (opened by `_catLayoutChooser` from `catArrangementAction` / `catFrameSetAction`, which
  also collects the name). A LAYOUT lands after the last wall of ITS SET; a FRAME SET
  after the last wall of the placement. It RESOLVES THROUGH THE MOCKUP when started from
  an option. Artwork is carried onto the new arrangement's first OPTION, never onto the
  mockup. Where slot ids have no separator (`ART-1A`) a hyphen is introduced, since
  `ART-1B` + `A` would collide; an existing separator is kept.
  Test trap: `_catAddOption` clones the whole wall, so set fields AFTER the option exists
  or a mirroring test passes with the mirror deleted.

- **CATALOGUE: RAIL AND DASHBOARD DISPLAY.** `_catRailRoles` (one pass with a map, runs on
  every wall click, rename, drag, undo) draws the tree: `.wall-rail-place` header, then
  `.cat-mockup.cat-primary` (SOLID amber, a frame set's reference drawing, badge
  `SET n · PRIMARY`), `.cat-mockup.cat-layout` (HOLLOW amber, `LAYOUT B`), `.cat-option`
  (blue, `OPTION n`), with `.wall-tab-cat` badges and indents. Use a LEFT STRIPE, never a
  row tint (`.wall-tab.active` owns the background). No re-sort; minters append in order.
  Layout NAME (`catalogueLabel`) is navigation, the code is identity: shown beside, never
  folded in. ONE tag builder, `_catLayoutTag` / `_catLayoutTagForRow`, shared by the rail,
  the breaker subtitle and the CSV. `_igTitleRight` must measure that subtitle.
  Dashboard: `.dash-cat-slot` (amber) and `.dash-cat-option` (blue) as a left stripe on the
  first CELL (`tr.selected` owns the background; box-shadow on a `tr` is unreliable under
  `border-collapse`), sets computed once per render.
  The `+ LAYOUT` / `+ SET` row: `.action-btn` is `width: 100%`, so use `flex: 1 1 0` with
  `min-width: 0`; the ROW carries the hide. No `.action-btn` in index.html may combine
  `flex:0 0 auto` with no width of its own (tested).

- **MOVING ARTWORK BETWEEN FRAMES (`moveElevArtwork`, `ELEV_ART_FIELDS`, `_elevArtPayload` /
  `_elevApplyArt`).** Dragging a row in the frame LIST (never on the wall, where drag
  means move the frame) reassigns artwork as a list reorder; frames do not move, and the
  dashboard ROW travels with the picture. A drag begun on an input or button belongs to
  that control. Always use `ELEV_ART_FIELDS`, or a picture half-moves (crop or image code
  left behind).

- **INSTALLATION NOTES (`installNotes`, `_installNoteText`, `_installNoteLines`).** Custom
  notes are rows, `installNotes.list = [{id, text, on}]`; `custom` survives as a DERIVED
  newline mirror of the ticked rows (old builds still print), and an old string migrates
  once. `installNotes.edits[key]` overrides a standard note's wording; `_installNoteText`
  is the ONE resolver for the tooltip and the page. Tick and label are separate click
  targets; `_dsNoteSel` is panel state, never project data.
  Ink: `noteInk` / `breakerNoteInk` plus per-page override (`_installNoteInk`); the body
  colour is DERIVED from the heading (`_installNoteBodyRgb`); the drawer takes the ink as
  an ARGUMENT so measure and draw passes agree.
  **Every setting with a breaker-only global must be in `_igSet`'s `simple` list AND in
  `BREAKER_SLOT`**, or the control writes the install slot while the breaker reads its
  own. A test walks every breaker-global field.
  `noteSide`: default `left` on a breaker, `right` on an install page. A RIGHT column takes
  width off `SR.R`; a LEFT one takes no width and stacks under the legend at the legend's
  width (left column order: LEGEND, NOTES, PLAN). The note `%` width multiplier is offered
  only for a right-hand column.
  A left box cannot be drawn up front (it depends on the title band): it is deferred to
  where `_igTop` is computed, still ahead of every early return. Two `_drawInstallNoteBox`
  calls, and the tested invariant is both land before the first return.

- **BREAKER / INSTALL PAGE LAYOUT.** The elevation anchors BOTTOM-RIGHT in both layout
  branches. A breaker is not forced to `elevOnly`: `breakerVariant` / `breakerPlan` /
  `breakerPlanScale` keep install globals off it, and the panel offers the reduced set
  (`variants: 'breaker'`): Elev only or Elev + plan, never Elev + frames.
  Width is ONE budget: column width and elevation width are the SAME stored `legendW`
  read from both ends (`_igColW`, `_igElevW`, `_igColWForElevW`). Never add a second field.
  The clamp binds both ways (`IG_COL_MIN`, `IG_COL_MAX`, `IG_ELEV_MIN_FRAC` = 0.45,
  `IG_COL_GUTTER`) and the elevation slider writes through it. One left-column width,
  legend or no legend.
  A widescreen elevation is height-constrained, so it may rise BESIDE the title
  (`_igDrawTop`) only when it MEASURABLY clears it (`_igTitleRight` + `IG_TITLE_CLEAR`),
  measuring with `_titleStyleFor` / `_subtitleStyleFor` and `_pdfTitleStyle` (titles print
  BOLD). A failed measurement falls back to `SR.R`.
  Breaker plan has a target size (`IG_PLAN_H_FRAC`, slider up to 140%, both plan modes)
  and draws the wall line via `_wallAllSegs` + `FP_WALL_LINE_ALPHA`, UNDER the pin, with
  alpha restored after; the zoom crop frames the line ends as well as the pin.
  Panel: layout-guides grid is a `<details>`, closed by default. No explanatory paragraphs
  under controls: use `_dsHelpDot` (`secLbl(txt, help)`, `slider(..., help)`); a test
  counts `createElement('p')` in that function. ONE jump to the wall, through
  `_dsJumpToElevation` (records the return trip). Presentation layout sits above Page
  appearance: appearance is BUILT first (branches return early) and moved by
  `_dsMoveAppearanceAfter`, never rebuilt.

- **LETTER LEGEND.** Three ticks `legendDims` / `legendArt` / `legendCode` (art dims default
  OFF, others ON), sizes via `_rowOpeningAndPrint`; the letter rides whichever line comes
  first and sits in its own column (`IG_LEG_LETTER_W`). Numbers go through
  `_igLegDimText`, following `_specDualUnit()` (inches first, companion in brackets;
  stored sizes are in `dashUnit`, not `elevUnit`).
  `_igLegLineFit` stacks a value under its label when it does not fit, then shrinks it
  (floor `IG_LEG_VAL_FS_MIN`). Heights vary, so the reserved height (`_igLegendHeight`)
  and the drawer (`_igLegBlockRows`, `drawLegendBlocks`, `IG_LEG_ROW_H`) share one
  measure, or notes overlap. The `IG_LEG_*` metrics are MODULE scope (function-local ones
  threw at render while `node --check` passed).
  The legend starts at `_igLegTop` (subheading clearance, stepping over the item code via
  `_igCodeId`), not `_igTop` (which carries 22pt for the wall dimension). Both layout
  branches and the notes read it. **`IG_LEG_TOP_GAP` must be declared ABOVE `_igLegTop`**
  (TDZ; same trap as `TITLE_SIZE_DEFAULT` and `_elevIdSeq`).

- **GREP THE IDENTIFIER BEFORE TRUSTING A PARSE.** `_igElevIdx` never existed; a call
  passed `node --check` and broke render. `test_no_undefined_helpers` checks CALLS, not
  bare identifiers. A patch script that aborts mid-way writes NOTHING, so re-check anchors
  after any failed patch.
- **`_elevArtImgCache` keeps decoded artwork nodes alive across redraws.** `drawElevAll`
  wipes `#frame-layer` on every drag mousemove, so rebuilding `<img src="data:…">` re-decodes
  every artwork ~60x/sec. Key is **letter + source length + last 32 chars**: letter alone
  shows the old image after a swap, source alone lets two frames sharing an image steal the
  node (a second `appendChild` moves it), the full data URL is megabytes of string work.
  Swept per pass, guarded so a redraw that drew nothing isn't read as "all stale".
- **`_spacingLabel(v)` is the one label source for spacing + edge-gap dims** (all six call
  sites), so `dimVisibility.spacingEQ` (print `EQ`) reaches all of them. Explicit toggle,
  never an automatic equality test: EQ is a statement of intent.
- **The drafting standard travels in the project file.** `annotationStyle` and
  `elevDualUnit` are localStorage AND optional top-level project keys. Absent: local
  settings stand (an old project must not wipe them). Present: **merge** onto the live
  `annotationStyle` (renderers hold a reference; a file missing a newer field would leave it
  undefined), then `_normalizeAnnotationStyle()` + `applyAnnotationStyleToCSSVars()` +
  `saveAnnotationStyle()`. Never trust `fontFamily` from the file; it's derived.
- **"New elevation for this graphic"** is an option in the *Push to Wall* selector, NOT a
  side effect of the product dropdown: `loadDashDataIntoControls` calls
  `handleDashProductChange` on every row selection, so creating walls there spawns/orphans
  walls and drifts `qty` (`recalculateDashboardQuantities` counts frames). New wall is
  graphic-width x (graphic-height **+ baseboard**), or fit-to-wall shrinks the piece. A
  `<select>` ignores a value with no matching option, so take the index from a local, not
  the DOM.
- **`_rowOpeningAndPrint(row)` is the single definition of opening + print-file size**, used
  by `updateTableRowCalcs`, `updateDashVisualsFromDOM`, `renderDashTable`,
  `buildDashCSVString` and `buildSpecStrings`. Clamp a negative opening BEFORE adding bleed.
  Takes a plain object (DOM caller passes assembled form values); converts nothing. A new
  product needs one clause here.
  A new spec **label** must be registered in `SPEC_ROW_GROUPS` *and* the **five** hardcoded
  allowlists (2 group-page PDF renderers + 3 `_deckMockHTML` previews) or that layout drops
  the row silently. Renaming one is the same job.
- **`Art Dimensions` on the spec page is the image OPENING, not the print file.** The CSV
  keeps its own names: **`Art Size W/H` = opening, `Image Size W/H` = print file**. The
  InDesign script addresses columns BY NAME, so they are NOT renamed; this is the one place
  page label and CSV header deliberately differ.
- **`_titleBand` / `_drawPageTitle` IS WHERE A HEADING AND SUBHEADING PRINT on every page
  this file DRAWS** (not template-laid-out). Never hand-place a title with local offsets.
  **The guide set carries the answer**: `hlines` on the Farmboy sets (0.145 / 0.205) are the
  heading BASELINE and subheading baseline (spec templates' `title.y .15`, `spec.y .2` match).
  A ruler guide past `TITLE_GUIDE_MAX` (0.30) is ignored (deliberately below a third, or Rule
  of Thirds at 0.3333 would move the heading). A set declaring no title lines (Margins only,
  Rule of Thirds, Center) keeps the historical offsets off its own safety frame.
  **The heading is `_titleStyle()`** everywhere, with no `Math.max(ts.size, 22)` floors. A
  page with its own type override passes `opts.font`/`weight`/`size` and borrows only the
  position. `opts.color` takes a hex OR an `[r,g,b]` triple.
  **Type is Druk 32 over Druk 22** (`TITLE_SIZE_DEFAULT`, `PAGE_SUBTITLE_FONT/SIZE`,
  `PAGE_SUBTITLE_INK` grey), from the InDesign master. Heading is a dial; the subheading
  default is not a second deck dial.
  **TDZ trap:** these consts sit **above `let editorialContent = _editorialDefaults()`**,
  which runs at module scope; declared below it, boot dies with "Cannot access
  TITLE_SIZE_DEFAULT before initialization". A test pins the ordering.
  **`titleStyle` is written into every project** by `_editorialDefaults()`, so a new default
  reaches new decks only. `_mbMigratePages` bumps a stored 22 to 32 **once**, keyed on
  `typeDefaultsV`, never on the value (or a deliberate 22 is bumped every load).
  The subheading goes through `_dsFitTitle` (user text, no length limit), and content under
  it clears its descenders via `_subtitleClear()` (a FUNCTION, since the size is settable).
  Only pages that print a subheading use it.
  **Only what sits UNDER the heading clears the band.** Floorplan image, spec artwork,
  as-hung drawing and flat-sheet elevation sit right of the title column and rise beside it
  (pushing the as-hung drawing down breaks a frame-strip threshold `test_shared_spec_legend`
  pins).
  **`_drawSpecPageTemplate`'s remap anchors VERTICALLY on the title line** (`tpl.title.y`),
  not `SF.t`; the horizontal half maps onto the safety frame edges.
  **`_setDeckGuide` drops built pages only when `setId` changes** (the set decides margins
  and title lines). `show` / `grid` / `snap` must not trigger a rebuild.
- **THE HEADING AND SUBHEADING ARE CLICK TARGETS ON THE RENDERED PAGE**
  (`_dsTitleHandles` + `_dsOpenTitleTypePopup`), inserted BEFORE `_dsRenderAnnots` so a note
  over the title keeps the click.
  **Which pages print a heading is RECORDED, never predicted** (`_dsTitleSlots`, written by
  `_drawPageTitle` / `_applySubtitleType`): a fixed page renders as elements or prose
  depending on content. Spec pages render async, so one debounced `_dsRenderCenter()`
  rebuilds the overlay (cannot loop: second pass records the same values and returns).
  **`_titleStyle()` means the DECK value** (what Type defaults reads). Renderers ask
  `_titleStyleFor()` / `_subtitleStyleFor()`, resolved against `_curPageKey`, set by all four
  render paths before the body draws (same hook as `_curFooter`).
  **Deck-wide is the default scope and stays selected.** `pageTitleStyle[key] = {title, sub}`
  mirrors `pageFooters`; store **only overridden fields**. `_clearPageTypeStyle` prunes empty
  shells (else blank objects ride every autosave/undo snapshot).
  **`_pageTypeChanged` is DEBOUNCED** (colour input fires `oninput` continuously), same shape
  as `_ctxScheduleHistory`.
  **The popup opens left-aligned under the line** from the handle's rect, captured BEFORE
  `_dsRenderCenter()` replaces the element.
- **`FRAME_TEXT_INKS` IS THE FONT-COLOUR QUICK PICK.** Six of its ten are the studio defaults
  (#141414 titles, #6e6e6e subheadings, #9c9c9c captions, #8a8a8a thumbnail captions,
  #222222 body, white), ordered light to dark. Red (`#e00000`, same as the Accents family) is
  on its OWN family row, not an eleventh ramp dot; other true inks join that row.
  **Picks hang off the colour dot** (`_dsInkQuickPicks` + `_dsOpenInkPopover`) for all four
  font colours (deck styles, Type defaults, text gear popup, layout toolbar). Arrow,
  shape-fill, category and timeline-stage pickers are deliberately NOT wired (not type).
  **Cancel BOTH mousedown and click** on the colour input, or the system dialog opens on
  release. Custom… gets through via the `input._inkNative` flag (not unbind/rebind).
  **Inside an already-open panel, the strip goes inline** (`_dsInkStripInto`,
  `_dsTypeSection`'s `opts.inkInline`); in the heading popup it sits between the type row and
  the scope buttons. Same renderer either way (`_frameSwatchesInto` + `FRAME_TEXT_INKS`).
  The element stays a real `<input type="color">` so handlers/tests using `value`/`oninput`
  still work.
  **`_frameSwatchesInto`'s `opts.nearest`** rings the closest dot when near but not exact
  (opt-in). It must resolve across EVERY family, never per family, or two rows each light a
  winner. Check this before adding a family.
- **CHROME STAYS ON THE PAGE (`_dsPinChrome`).** The page clips at the trim, so controls
  hanging off a full-bleed element are CLAMPED onto the page (not moved to an unclipped
  layer). Safe because every drag handler works from pointer deltas, never absolute handle
  position. Elements wholly on the page are not moved.
  `Math.max` must be the OUTER call (`max(PAD, min(size - w - PAD, …))`) or an over-wide
  element goes negative. The clamp subtracts the chrome's own size, writes `left`/`top` in
  px and clears `right`/`bottom`/`transform`/`margin-bottom` (a test asserts none survive in
  any chrome builder).
  **Page size rides on the box** (`box._page`, set at all four annotation boxes);
  `_dsBoxWH` reads the box size back.
  **The editable layout canvas uses `_mbPinChrome`**: boxes are in percent and text has no
  height, so it MEASURES after all boxes are in, and slides each `[data-mb-pin]` control
  (`edge` = resize handles, `pad` = gear and pan disc) inside. A zero-size canvas is left
  alone. `test_mb_chrome_onpage` carries a fake layout engine (jsdom has none).
  **One control per corner on a selected image:** grip + zoom stepper top-left, resize +
  corner-radius top-right, settings bottom-left.
  **Top-right ladders inward** (`DS_CORNER_SLOT`, `_dsCornerSlot`): a diagonal step must be
  >= the handle size (11px) or they overlap, and the radius hangs off the resize handle's
  FINAL (clamped) position, not the box corner.
  **Zoom stepper hangs off the grip** (`box._gripBox`, written by `_dsMoveGrip`), `DS_GRIP_GAP`
  below it; the grip must be BUILT before the stepper.
  **Settings button is a white disc with `svgEdit`**, bottom-left INSIDE the box clear of the
  `sw` handle. Text and arrows keep the plain floating plus (`_dsTextGearButton`, arrow gear;
  `test_v29` pins it). If something ever must sit beyond the trim, it needs a stage wrapper
  plus an unclipped sibling layer; any descendant gets clipped.
  Trap: deleting by landmark slice once swallowed `_dsPinChrome` and the corner ladder;
  assert what a slice CONTAINS before deleting it.
  The yellow radius handle does NOT encode the radius by its distance from the corner (it
  collided with resize); drag works off pointer delta, number lives in the settings popup.
  `_dsCornerFitsLadder` false (box too small for three 20px controls) **drops** the radius
  handle.
- **A RESIZE SNAPS THE DRAGGED EDGE; A MOVE SNAPS THE BOX.** Move: `_dsAnnSnap` (via
  `_mbSnapBox`). Resize: `_dsAnnSnapEdge` snaps ONE moving edge only (offering the far edge
  lets it capture the snap and slide the shape). Alt bypasses both.
- **PANNING IS GATED ON SLACK, NOT ON ZOOM.** Cover-fit can crop at zoom 1.0, so gate on real
  hidden slack, not `zoom > 1`. `_dsShapePanDown` pans only the axis with slack.
- **`DS_ZOOM_STEP` IS THE ONE ZOOM GRAIN** (0.1, stepper and wheel; Shift multiplies). The
  readout `<input>` commits on Enter/blur, **never per keystroke**. `_dsZoomRound` snaps float
  sums to tenths (the field shows d.d).
  Test traps: drive the resize HANDLER (calling the snap helper can't see the call deleted);
  assert a snap never moves an edge further than the threshold (with 12 columns almost any
  value is near some line); `parseFloat('50%')` is 50, so `test_chrome_onpage` rejects any
  chrome position not in px.
- **`_font()` NAMES A BRAND FACE FROM ITS BYTES** (`_pdfBrandFams`, set once by
  `_loadPdfFontData`, **never cleared**), not from what the current jsPDF doc registered
  (`_pdfFontFams`), because a canvas preview has no doc. `display` and `sans` share the core
  name `helvetica`, and `CanvasPdfRec._fam()` maps that to Sans, so falling back draws every
  heading in Sans. `_registerPdfFonts` runs only from PDF export.
  **A canvas render needs BOTH halves**: `_loadEditorBrandFonts` (glyphs) and
  `_loadPdfFontData` (name). `_dsBrandFontsReady()` waits for both, in parallel, bounded,
  memoized; both kick off at boot. `renderDeckPageCanvas` and `renderSpecPageCanvas` each gate
  themselves rather than trusting callers.
- **THE BRAND FACES LOAD IN PARALLEL, AND WHATEVER IS ON SCREEN IS TOLD WHEN THEY ARRIVE.**
  `_loadEditorBrandFontsInner` loads its six faces together, each settling on its own (not
  `Promise.all`, which one missing file would reject), because consumers wait behind
  `_withTimeout(..., 2500)`. The "faces arrived" hook must wake every canvas surface that
  survives the load (`renderMoodboardCanvas`, deck centre, Project tab preview); add any new
  one or it stays in the fallback face. All consumers use the one bounded gate.
- `_coverRect()` / `_cropToCanvas()` are the shared crop math for page background images;
  the DOM preview and PDF must use them both (aspect-blind CSS diverged before).
- **Never `JSON.parse(JSON.stringify(x))` project data; use `_cloneData(x)`.** Rows and frames
  carry megabyte `artworkUrl` data URLs; the round trip duplicated every image per undo
  snapshot (181ms/edit, 1.2GB heap). A structural clone shares the immutable strings.
  `_cloneData` mirrors JSON's quirks (drops `undefined`/functions, nulls non-finite numbers,
  ISO-strings Dates); `test_history_clone_perf.js` pins equivalence, independence and speed.
  No cycle guard needed. `performAutosave` passes **live** objects, never a clone first.
  `_elevCaptureSignature` replaces long strings with their length; keep it that way when
  adding fields.
- `scheduleAutosave()` is the central debounce hook; nearly every mutation calls it, so hang
  follow-on work (e.g. thumbnail refresh) there.
- **PAGE BACKGROUNDS ARE BOUNDED BY RE-ENCODING** (`_boundImageDataUrl`, `_pageBgMaxEdge`,
  `_imageDataHasAlpha`). The cost is RGBA PNG photos (~20x JPEG), not pixel count, so the
  helper **re-encodes**; the dimension ceiling is only a backstop. A test pins that a
  1728x1956 image comes back at 1728x1956: do not "simplify" it into a resize.
  PNG is kept only where transparency is REAL; the alpha scan reads every pixel (a test puts
  the only transparent pixel LAST); an unreadable canvas assumes alpha. Never returns
  something bigger than the input; every failure returns the original.
  Ceiling is `PAGE_FORMAT[0] * _PDF_QUALITY.print.r * PAGE_BG_MAX_ZOOM` (`PAGE_FORMAT` is
  module scope). `_pageBgMaxEdge` is a **function** because those are declared further down
  (TDZ).
  **NOT applied to floorplans (`lv.imageData`) or custom swatches (`swatchDataUrl`)**: line
  work, where JPEG eats hairlines.
  The duplication in the project FILE is pooled since 18.81 (see the image-pool rule).
- **A PROJECT IS SAVED BACK TO THE FILE IT WAS OPENED FROM** (`_projectFileHandle`,
  `openMasterProject`, `saveMasterProject({saveAs})`, `_fsaAvailable`). File System Access
  API (Chrome/Edge, secure context); otherwise the download path stays byte for byte as it
  was (a test drives the no-API case).
  **The handle is session-only and always refers to the project in memory**: set by Open or
  the first Save's picker, CLEARED by any load not through a handle (`<input type=file>`,
  autosave restore). Never persist it across reloads.
  **`_fsaSave` returns `ok` / `cancelled` / `failed`.** Cancel must NOT mark the project clean
  and raises nothing; `failed` reports AND falls through to download.
  `_projectPayload` (one field list for three save paths) and `_readProjectText` (one install
  for two open paths; returns whether it installed, which permits binding the handle).
  Save As is Ctrl+Shift+S plus the Save tooltip, not a nav button (row is full, `nowrap`).
  File name goes in the document title.
  `_confirmDiscardUnsaved` runs before loading, and the picker opens from inside its Yes
  handler (a picker needs a user gesture; after an awaited modal it is refused).
- **ONE AUTOSAVE PER TAB (18.82).** Records are keyed by `_autosaveSession` (the old
  shared `ADB_ID = 'current'` is read and cleared, never written). `_aPrune` keeps the
  newest `AUTOSAVE_KEEP` (5), max `AUTOSAVE_MAX_DAYS`, never this tab's. `clearAutosave`
  deletes ONLY this tab's (+ 'current'). `_autosavePeekAll` lists them; the start screen
  shows the newest not-live one as Continue and the rest in `_startScreenOthers`. A tab
  still open answers `_liveTabSessions` over BroadcastChannel 'frame-tabs' (opened in
  `_bootStart`) and is labelled, never offered. Restoring another tab's backup writes it
  under this session, then deletes the old record. A failed write deletes only earlier
  backups of the SAME project name.
  **Copy reaches the other tabs (18.83):** `_dsCopySelection` wraps `_dsCopySelectionHere`
  and posts `{t:'clip'}` on the same channel; `_tabOnMessage` makes it this tab's
  `_dsClipboard` with `srcKey: null` (pastes in place). Ignores its own echo.
- **THE AUTOSAVE LIVES IN INDEXEDDB** (a real project is ~23 MB vs a ~5 MB localStorage
  budget). Two stores: `ameta` (small: when, session, name) and `adata` (payload), so
  `checkAutosaveOnLoad` asks before reading the payload.
  **`_autosaveFail`** drops a stored record from an EARLIER session and keeps one from this
  session (`_autosaveSession`, minted per page load, read from `ameta`), or the next load
  offers a different project's backup.
  **`_aPut` TAKES A BUILDER, NOT A PAYLOAD**: `elevations` / `editorialContent` are reassigned
  by a project load, so build inside the transaction. Pass live objects (structured clone runs
  synchronously in `put()`); no `_cloneData` first.
  **A failed write is a MODAL, once per session**, then the unsaved dot turns RED and stays
  (even on a clean project).
  `AUTOSAVE_KEY` is a READ-ONLY legacy slot, offered once then cleared. `clearAutosave`
  clears both; its IDB delete is fire-and-forget, so tests must let the transaction commit.
  `performAutosave` is async and **never rejects** (armed from `setTimeout` everywhere).
  `test_autosave_idb.js` traps: a fake store must not refuse DELETE for quota; app.js arms
  its own `checkAutosaveOnLoad` at boot (`setTimeout` 200), so let it run FIRST against an
  empty store or the suite becomes timing-dependent.
- **EVERY DIALOG CLOSES THE SAME WAY: ESCAPE, THE BACKDROP, AND ITS OWN CLOSE CONTROL**
  (`_modalTop`, `_modalClose`, `_modalWatch`, `[data-modal-close]`, `[data-modal-backdrop]`,
  `[data-modal-busy]`). All dialogs, including JS-built ones, use the `.frame-modal` shell
  (no private overlays or z-indexes).
  **Closing CLICKS the dialog's own `[data-modal-close]`** (never blanket `display:none`;
  each dialog owns its cleanup). A test requires exactly one per dialog.
  **Escape** closes anything with a close control, except `.fm-over` tools (they own Escape),
  `[data-modal-busy]` dialogs, and focus in a textarea/rich text. Handler runs in CAPTURE
  phase and stops propagation. **Backdrop** closes only `[data-modal-backdrop]` dialogs, and
  only if the press STARTED on the backdrop (not `e.target === ov` on click).
  **`showConfirmModal(..., opts)`**: `opts.danger` paints Yes destructive and focuses Cancel;
  `opts.mustChoose` has no close control (both answers act, e.g. autosave Restore/Discard).
  **Focus** moves in on open (`[data-modal-initial]` wins), returns to opener, Tab is
  trapped; driven by a MutationObserver per dialog on `style` plus a `<body>` childList
  observer. Every dialog gets `role="dialog"` and `aria-modal`.
  **jsdom traps:** `runScripts: 'outside-only'` never runs inline `onclick`, so dialog tests
  use `'dangerously'`; jsdom has no `innerText`, so identify buttons by position/attribute and
  record question text by wrapping `showConfirmModal`.
- **ONE WAY TO ASK BEFORE DESTROYING SOMETHING: `_confirmDestroy({title, body, confirm,
  undoable, onConfirm})`.** No native `confirm()`/`alert()`.
  **`undoable` is REQUIRED, no default** (its sentence is a promise; a test checks every call
  site). Make deletes undoable with `pushHistory()` rather than warning; a version delete
  (IndexedDB) says it can't be undone.
  **Verb rule: Delete** when gone, **Remove** when taken out of the deck and restorable
  without Ctrl+Z.
  **The answer arrives after the question**, so re-resolve at confirm time: wall by
  `_elevIndexById`, template by object, floorplan category by KEY (`_artCats()` returns the
  built-in constant until `_artCatsEnsure()` writes a copy). `_dsDeleteUserTemplate(idx,
  after)` takes a callback. `_askYesNo` is the promise form. Plan-detail delete is one
  `_deletePlanDetail`.
  Nudges/acknowledgements go to `_toast`; failures and must-reads to `showInfoModal`.
- **NO NATIVE DIALOGS, PROMPTS INCLUDED: `_askFields` / `_askText` / `_askYesNo`.**
  `_askFields` resolves trimmed values or null, disables confirm while a required field is
  empty, takes `list` for a datalist. `_dsAskLeaveTemplate` is the ONE "unsaved template
  edits" question. **`_dsTab` re-enters with `_confirmed`**, never by relying on cleanup to
  clear the session (it looped forever; `test_tab_exit_fix`). Older template tests bridge
  `_askYesNo`/`_askFields` to `window.confirm`/`window.prompt` stubs. Add a
  `test_no_native_dialogs` check, not a native call.
- **FLOOR PLANS ARE IN THE UNDO ENTRY (`snapshotProjectState({ plans: true })`).** Only the
  undo stack asks for it (autosave and version history store levels beside the snapshot).
  **Every level mutation pushes history** (upload, add, rename, delete). Deleting a level
  renumbers pins AND wall lines, reading `_fpWalls(r)` before `r.level` changes.
  The empty plan slot in Deck Studio is an **Upload floor plan** button; the PDF placeholder
  reads "FLOOR PLAN IMAGE GOES HERE".
- **UNDO HAS BUTTONS, AND SAYS WHERE IT WENT** (`#undoBtn` / `#redoBtn`, `_historyWhere`,
  `_historyAnnounce`, `_historyBlockedByDialog`, `updateUndoButtons()`). The notice is derived
  by COMPARING the two snapshots (long strings by length and tail), not by labelling
  `pushHistory` call sites; one notice at a time. **Undo is refused while a dialog is open**,
  except inside a `.fm-over` tool.
- **KEYBOARD FOCUS IS VISIBLE** (the `:focus-visible` block at the end of style.css). Text
  fields use `input:focus`. Native checkbox needs its own rule at (0,2,1) to beat
  `input:focus`; slider focus is on the THUMB, written for both engines.
  **`[data-kbd-click]`** makes a div press like a button on Enter/Space (Space cancelled).
  Opt-in by attribute, not role.
- **HELP IS `HELP_REFERENCE_DATA`.** `test_help_and_steps.js` fails if Help names a control
  label not in index.html/app.js, lists an unbound shortcut, uses an em dash, or What's New
  omits `APP_VERSION`. Bodies are **template literals**: no backtick or dollar brace inside.
  `live` entries (`'steps'`) are built by `_helpLiveEntry`. Help opens on Reference; the
  Video tab is hidden until `setHelpVideoUrl`.
- **EVERY BOOT OPENS ON THE START SCREEN (`openStartScreen`).** Continue (only when
  `_autosavePeek` finds a backup), New project, Open project. `_startNewProject` sets name,
  client, units and ALWAYS lands on the floorplan Items list (house standard). A
  `.frame-modal` with NO close control; opaque. `_bootStart` keeps a test harness on
  `checkAutosaveOnLoad`, which shares `_autosavePeek` / `_autosaveRestoreNow` with Continue.
  `_readProjectText` closes the screen on a successful install.
  **`#bootCover` is the first element in `<body>`** (styled in style.css) so first paint is
  the start background; `openStartScreen` and `_bootStart`'s harness branch remove it, and a
  CSS animation hides it after 6s.
  **Logo is inline SVG (`FRAME_LOGO_PARTS`, byte for byte from the logo files)**, animated in
  SVG user units, off under `prefers-reduced-motion`, `currentColor` for both themes.
  **Next-step bar (`_syncNextStep`)** rides `_syncNavBadges`, shows the one next thing from
  `_projectStepCounts`, folds away after steps 1-3; x is session state. A fresh project's
  placeholder `ART.1` counts as step 1 via `_projectIsFresh`.
- **THE ORDER OF OPERATIONS IS ON THE VIEW TABS** (`_projectStepCounts`, `_projectSteps`,
  `_navStepBadge`, `_syncNavBadges`, `_scheduleNavBadges`): 1 Deck (since 18.57; a project
  starts on its floorplan Items list; badge: pieces not pinned, once a plan image exists),
  2 Frame Dashboard, 3 Elevation (badge: pieces not on a wall). The
  five-step checklist opens Help's Start here, Go buttons via `[data-help-go]`.
  **All derived, never stored**: a piece is `_deckSpecRows()`, on a wall is an ACTIVE frame
  with the row id, pinned is `_fpPins`. Badges update IN PLACE off `scheduleAutosave` (a
  re-render drops keyboard focus).
  **First-run tip is armed at boot, SHOWN on first pointerdown** (a boot-timer toast kept
  headless test processes alive).
  **Declared near the TOP of app.js, right after `_checkBuildPairing`**, so nothing reads
  `NAV_STEP_TIPS` or `_navBadgeTimer` in the TDZ.
- **THE GUIDED TOUR IS READ-ONLY AND ITS STEPS ARE DATA (`FRAME_TOUR`, `startTour`,
  `endTour`, `_tourGo`, `_tourTarget`).** Step = `{ch, view, target, prep, title, body}`;
  `prep` may only NAVIGATE. `test_guided_tour` fails on a pushed undo or changed
  row/wall/plan/deck setting, excepting only the defaults viewing seeds (`pageThemes` entry,
  `hiddenDims`, `frameRec`). A click-eating blocker plus a window CAPTURE keydown swallow
  input; the spotlight is a box-shadow hole in the dimming.
  `target` is a list; first VISIBLE match of any selector wins (`querySelectorAll`); nothing
  visible centres the card, never throws. "Tour this screen" is `_tourStepsFor(view)`. Entry
  points: Help > Start here (`live: 'tour'`), start-screen link, next-step bar (until
  `frameTourDone`). `--z-tour` sits under the alert. Renaming a targeted control: the test
  checks every `#id`/`.class` still exists.
- **UNCAUGHT ERRORS ARE CAUGHT, LOGGED AND SAID ONCE** (`_frameReportError`,
  `_frameErrAnnounce`, `_frameErrors`). Notice leads with `APP_VERSION` and `APP_BUILD`,
  carries fault and stack, says Save Project first, offers Copy via `_dsCopyText`.
  First fault is a modal, a NEW fault a toast, a repeat a console line + slot in a 25-entry
  log. **`error` and `unhandledrejection` are registered at module scope ahead of
  `initMasterApp()`.** Not reported: cross-origin `Script error.` with no file/stack,
  `ResizeObserver loop`, failed `<img>`/`FileReader` loads. The reporter is wrapped so it
  can't become the fault (a test breaks the notifier).
- **THE FOOTER'S CODE AND LOCATION ARE DECK-WIDE (`_deckFooterMeta`)**: the Project tab's
  document code / version / location, used by the PDF and both preview renderers, never the
  piece's own id/location.
- **THE DECK STUDIO CREATION TOOLS ARE ONE DOCK (`#dsToolDock`)**: Select, Text, Notes,
  Lines, Shapes, Image, Position. `_dsDockPlace` MOVES the node between `dsDockLeftSlot` /
  `dsDockRightSlot` / `dsDockTopSlot` (ids preserved); side is localStorage `dsDockSide`.
  `_dsDockSync` (top of `_dsRenderCenter`) lights the tool and lazily places the dock (no boot
  hook). `_dsPopup` flies sideways from a `.ds-dock.vert`. Menu rows are `_dsFlyItem`. Keys
  V T L A R O I go through `_dsDockKey`, after the typing guard in `_dsAnnotKeydown`, never
  with a modifier or open dialog.
  **`_dsLineConstrain` is the ONE line rule** for the draw tool (preview AND commit via
  `endAt`) and end-handle drag: Shift locks 0/45/90 by projection in PIXELS; otherwise within
  `DS_LINE_LEVEL_DEG` settles level/plumb; Alt skips. The armed draw layer is
  `DS_DRAW_LAYER_Z`, above every annotation (at z 500 a new line grabbed another's handle).
  Esc mid-draw is a capture-phase listener that drops the line, keeps the tool. Curved arrow
  is off the menu; saved curves still render.
  **A new elbow is a zig-zag**: bend 0.5; `a.axis = 'v'` is the upright one. `_arrowPathPoints`
  is the ONE path for page, PDF, canvas preview and rail thumbnail. Absent `axis` / stored
  `bend` keep old elbows unchanged. Bend grip `[data-bend-grip]` is a pill mid-riser, visible
  only while selected. `_dsLineLabel`: an elbow without `waypoints`/`pts` is "Elbow arrow".
  **Every annotation drag ends in `_dsDragDone(_dsGeo0, a)` or `pushHistory`**; `_dsDragDone`
  pushes only if `_dsGeoSig` changed. `test_line_tool` scans every `const up`. New boxes go
  through `_dsFreeSpot`.
  **ONE GLOBAL SCOPE MEANS A NAME COLLISION IS A DELETION** (the later declaration wins
  silently; e.g. `_dsAddStamp` is the approval stamp, the status stamp is
  `_dsAddStatusStamp`). `test_ds_tool_dock` fails on any duplicate top-level function. Grep a
  new name before using it.
- **A SET MAY DIFFER FROM THE DECK (19.62, `unitPages`, `unitBreakers`, `_specUnitPagesOf`, `_specUnitBreakerOn`,
  `setSpecUnitPages`, `setSpecUnitBreaker`, `_dsUnitPagesInto`).** Keyed `'spec:' + unit key` (renames follow via
  `_renamePageKeys`), stored only when different from the deck, ignored in Install-guide mode. Units are grouped
  whenever anything is per set (`unitsGrouped`). A page not in the deck's mode carries `_tplFixed` + `_specTpl`
  (`_perPieceTplKey` / `_groupTplKey`, from `specTplMemory`); `_deckSpecTpl` honours it, and so must ANY new place
  that resolves a page's layout (thumbnail key, `_dsPageElevIdx`, the panel branch and its `_pgTpl` gate). Breaker
  sharing (19.44) runs over `brUnits`, only the sets whose breaker is on. Pages carry `_unitKey`
  (`_specUnitKeyOf` falls back to the art group / manual group of the row).
- **A COMBINED PAGE IS A GROUP A/B/C PAGE (19.63, `manualGroups`, `_combineUnitWith`, `_combinedTitle`,
  `_specSetKeysForCombine`, `unitArrange`, `_specUnitArrange`, `SPEC_SIDE_GAP_IN`).** A manual group (codes that
  share a page) renders through `_groupTplKey()` with `_tplFixed`, titled `ART.4 / ART.5`, subheading letters to
  codes; its old `layout` ('setRow'/'setRight') is ignored. Arrangement per set: `side` (one row, one scale, centres
  level, 6in apart) or `hung` (wall positions); default side for a combined page, hung for a set; swapped into
  `geo` in `_drawSpecSetPageBody`. The thumbnail key carries the arrangement and a combined page's codes. The
  controls are in This set (`_dsUnitPagesInto`); the legacy `_dsManualSection` remains only for a combined install
  page. A combined page takes no breaker.
- **BIG SETS (19.64).** The plan lists a set's letters through `_planLetters` (more than three: `_letterRun`
  ranges, A–K). A group page holds `SPEC_SET_PAGE_MAX` (12; the renderer drops the rest), so `groupPages` in
  `_deckPageList` splits a set into `_specUnitParts` pages (auto past 12; `unitSplit` 1..3 per set); part i is
  `_ovKey` `<key>~i`, page key `spec:<key>~i` (`_deckPageKey`), `_letterFrom` offsets its letters, `_renamePageKeys`
  carries `~i` keys. Arrangement and set settings read `unit.setKey`, never the part key.
  **Long walls show FIXED WINDOWS** (`_elevThumbFit`: fewest equal windows of the room's width, the one holding most
  of the page's pieces), so the per-piece room is the TEMPLATE's artwork box, never the drawn piece (else each page
  gets different windows). A cut side draws `_elevBreakLine` (zig-zag), never a wall end.
- **ONE THUMBNAIL ROW HEIGHT FOR THE DECK (19.66, `_groupThumbRowH(PW, PH)`).** The Group A/B/C band height,
  from the guides only; the group page's `thH` IS this function, and the per-piece `_specThumbBox(w, h, rowH)` caps
  its box at it (still on the template's bottom line). ~79pt on the default guides. Change the band in one place.
- **A SET MAY ASK FOR THE WHOLE WALL (19.65, `unitElevFit`, `_specUnitElevFit`, `setSpecUnitElevFit`,
  `_specUnitKeyOfRow`).** `_elevThumbFit(..., whole)` fits the entire wall to the room instead of a window; the
  drawing is then shorter than the row and bottom-aligned (`_thumbBox`/`_elevDrawn` keep the ROW height, so the
  plan and strip do not follow it down). In the thumbnail key as `|ew`; control is This set's Long wall row.
- **FRAME RECOMMENDATIONS NAMES ITSELF (19.61, `_frameRecTitle`, `_frameRecSub`, `setFrameRecText`).**
  `editorialContent.frameRec.title` / `.sub`, stored only when not the default (blank sub = none). Read by
  `_drawFrameRecPage`, the page list title and `_dsThumbCacheKey` (`|fr`); never a literal again.
- **THE THANK YOU PAGE PRINTS THE PROJECT'S OWN LIST (19.13).** `editorialContent.contacts`
  (pipe lines, print order) + `contactsHidden`; `contacts/contacts.json` is a DIRECTORY to pick
  from (`_loadRepoContacts`, `addContactFromDirectory`), never merged in. New projects start
  empty or with the designer's `MY_CONTACTS_KEY` (localStorage) team, seeded in `_startNewProject`.
  A file with no `contactsV` gets the old merged list written in once (`_contactsMigrateLegacy`,
  from the FROZEN `CONTACTS_LEGACY_DIRECTORY`; don't sync it to the json) in `_editorialFromFile`,
  `restoreProjectState` and `_versionRestore`. `_contactsParse` splits on `|` when present (roles
  carry commas).
- `_resolveFooter()` handles footer theming. `'auto'` means *read this page's own theme*,
  not a fixed default.
- Templates live in `editorialContent.templates`; `type` doubles as the category key.
  Project JSON is the exchange format for template library updates.
- **`_starterDeck()` is what a new project opens with**, folded into `_editorialDefaults()`
  (one definition, also used for cold boot). Content exported to
  `.claude/references/Concept.json`. It is a **function, not a constant** (`Object.assign`
  shares references). Every key is top-level so a loaded project overwrites it wholesale.
  **No starter layout page since 19.14** (the Moodboard was removed on request); older decks
  still hold `pg5ef7lopj50a` after `fixed:slogan`, which `_starterLayoutHome` keeps as its home
  so Reset page order leaves it alone. The cover carries a 1.5pt `#000000` rule element
  between client name and heading. `timelineStemPos` is keyed by stage **index** and only
  valid with the default timeline; pin checks to the stage LABEL.
- **LINES ON A DARK PAGE FLIP ON SCREEN AS THEY DO IN THE PDF (19.14).** The PDF flips dark
  draw colours through `_themeRemapInstall`; the layout editor (`_mbLineInk`) and the rail
  thumbnail (`_mbThumbInner`) pass line colours through `_dsDisplayInk`, like their text.
- **A FILE DROPPED ON A DECK STUDIO PAGE IS ITS BACKGROUND (19.14, `_dsWireBgDrop` on
  `#dsCenter`, `_pageBgImageFromFile`, the one setter shared with Page appearance).** It only
  takes drops nothing inside claimed (`e.defaultPrevented`: image boxes, shapes); spec pages
  (artwork drop) and floorplans are excluded in `_dsBgDropTarget`.
- **Thank You: `contactShiftY` (pt, moves the people, not the studio block) and
  `contactNameSize` (`_contactNameSize`, default 12; row height grows with it).**
- The Include-pages list in the Project tab is **checkboxes only**; fixed pages are edited in
  Deck Studio.
- `_dsThumbCacheKey()` ↔ `data-thumb-key` identifies rail cells.
- **SPEC DEMO DATA AND SWATCH MODE** (the template cards and their prewarm/paint/cache
  were deleted in 18.31; this survives for the Type defaults Spec demo).
  `_specTplDemoDesc(key)` builds a standard demo page, `_specTplDemoSet(key)` picks the set:
  `SPEC_TPL_DEMO_ONE` (a 24" square) for single-piece; `SPEC_TPL_DEMO_SALON` (five pieces,
  three mouldings in `SPEC_TPL_DEMO_FRAMES`, A/B/D sharing one, plus one float mount) for
  as-hung. Keep that mix: Shared specs exists to show values splitting by letter. Sizes and
  `x`/`y` live in ONE table, all inches, `y` bottom-up in two rows; `w`/`h` come from
  `extW`/`extH`; `_specTplDemoRow` converts into `dashUnit` or a cm deck prints "24 cm".
  Swatch mode rides on **`ctx.swatch`, never a module flag** (both renderers await inside,
  so an interleaved render would pick up the flag). It forces `wireframe` on mockups, swaps
  floorplan/elevation/corner/profile rasters for `_specSwatchBox()` (captions via
  `_specThumbCaption`), pins `scaleOpts`, feeds `_drawFrameStrip` the demo mouldings
  directly (`_sharedSpecFrames` reads the real library and would drop the strip), uses
  `box.swatch` for grey profile slots, forces artwork-only OFF, and titles group pages with
  `SPEC_TPL_DEMO_GROUP_ID` (`unit.key` is the swatch sentinel).
  `_dsBrandFontsReady()` is ONE memoized, bounded font wait for the session, shared by the
  Project tab preview and the Type defaults Spec demo.
- **`_withTimeout` clears its fallback timer.** A dangling `setTimeout` holds the event
  loop for the full timeout and keeps headless test processes alive.
- **Install-guide mode needs a wall with something on it.** It emits one page per elevation
  and no per-piece spec pages. `_elevHasPlacedFrames()` gates the switch with the same test
  `installDescs()` applies; key the guard on `_tplModeOf(tpl)`, not the literal
  `'installGuide'`. `_dsRefresh` only clamps `_dsIndex`, so after any rebuild of the page
  list around a selection call `_dsRestoreSel(key, kind)` (same page, else first page of
  that kind).
- `_dsInTemplateLibraryMode` gates the Templates destination; `_dsTemplateEditSession`
  tracks the active template edit (edits happen on a real temp page, then copy back).
- `_dsChrome` class marks editing-only UI (handles, grips, marquee) so it can be hidden in
  thumbnails. Gear/action buttons are real `<button>`s; content never uses `button`, so
  hiding all buttons in a thumbnail is safe.
- `_runsFromEditedDom()` must skip `BUTTON` nodes (the settings gear is a DOM child of
  contentEditable text boxes and its "+" leaks into the text). Two text paths, rich-text
  (data-rs spans) and plain/list: fix both.
- Group A/B/C ("set") pages are one renderer, `_drawSpecSetPageBody`, branching on
  SPEC_TEMPLATES flags: `row` = side by side, `scale` = as hung, none = stacked;
  `sharedSpec` rides on `scale` and swaps only the left column. `_drawSpecSetPage` is a thin
  wrapper whose job is the footer (every arrangement returns from its own exit). Letters
  come from `_setLetters()`, never a local literal; cap is 12 members.
- **THE GROUP ARTWORK HANGS FROM THE SPEC LINE, IT IS NOT CENTRED IN A REGION.**
  `artTop = Math.max(regY, GB.body + 8)`, `artH = (regY + regH) - artTop`. Centring in a
  region whose height changes with the ticks made frames sink. `Math.max` floors at the
  region top for guide sets with no title lines (band falls back to `SR.T + 30`). Do NOT
  move `regY`: `test_shared_spec_legend` pins a 3.6pt threshold where a 12-moulding strip
  stops dropping itself. **Every scale term reads `artH`, never `regH`**, geo path and
  fallback alike. Gap to the band is 22pt (`bandY = regY + regH + 22`).
  Test traps: canvas mockups draw nothing in jsdom, so read extent off the LETTERS and image
  codes; a narrow piece drops its code, so a height check needs wide AND stacked pieces in a
  genuinely tall group. `__bandSetup` rebuilds `editorialContent` (where the guide pref
  lives), so switch the guide set AFTER the fixture.
- **THE FRAME STRIP SHRINKS BEFORE IT GIVES WAY (18.89).** Past `box.maxW` it draws its images
  smaller (to `FRAME_STRIP_MIN_SCALE`, bottom-aligned, codes never shrink), then drops PROFILES and
  keeps corners, and only then returns null. It records the outcome per page in `_frameStripFit`
  (`_noteStripFit`, debounced panel rebuild); the Show on page ticks read it for the *no room* note.
  A `measure` is always full size. `test_frame_strip_fit` pins the order.
  **Past half size in one row it WRAPS INTO TWO ROWS in the same band height (18.91)**, lower row's
  codes on the caption baseline; only then profiles go. Nothing else on the page moves. A separate
  row above the band (18.90) was tried and rejected by the designer: it shrank the art.
  Twelve distinct codes fit as two rows of six.
  **18.97: before any of that the gap tightens** (10pt down to `GAP_MIN` 4pt, at full size); two rows use the tight gap.
- **A FRAME STRIP CELL IS AT LEAST AS WIDE AS ITS OWN CODE.** `_drawFrameStrip` lays cells
  right to left ending on `box.right` (the right safety guide on a group page) but draws the
  code left-aligned and unbounded (`MICH 432-29` is ~33pt at 6.5pt vs `MIN_CELL` 26). Widen
  the CELL; never clamp or truncate the label (the strip already drops whole past
  `box.maxW`, and every code prints as a `Frame Code` row). Set the font before measuring:
  the measure runs in the `cells` map, before the draw loop sets it.
- **A SPEC TICK MUST NOT WIPE THE WHOLE THUMBNAIL CACHE.** Group slots are in
  `_dsThumbCacheKey` (`|g` + four digits beside the per-piece `|` form), so neither handler
  in `_dsSpecSlotsInto` may do `_dsThumbCache = {}`; `_dsRefresh` prunes only dead keys.
  Keep both checks: the behavioural one (unrelated page keeps its thumbnail) and the source
  one (wipe not back); the source one alone passes if the key regresses.
- `_specSetRows()` builds the shared-spec block: group pieces sharing a value; a group
  covering everyone drops the letters, else carries them (`Matboard A/D`). No "None" rows.
  Row order comes from `SPEC_ROW_GROUPS`, **not** `buildSpecStrings`' emission order.
  `group` on each row drives the half-line category gaps. `Paper Size` is in the
  **mat/paper** group; the last group is sizes only. `SPEC_ROW_CLUSTERS` is the one
  exception: Frame Size + Frame Code emit per letter group; a label uniform across the set
  is hoisted and prints once. Cluster members must share a `SPEC_ROW_GROUPS` entry.
- **Dual units** are deck-wide: `editorialContent.specDualUnit` (`''|'mm'|'cm'`), read by
  `_specDualUnit()` (migrates old `scaleOpts.dualUnit`). `buildSpecStrings(r, opts)`
  defaults to it; `opts.dualUnit` overrides per call and **only the CSV export uses that**
  (forcing OFF, machine-read cells). Dual mode prints **inches first regardless of project
  unit**; `_pu`/`_pf` convert and `fmt()` is the single place it applies, so every new
  dimension site goes through `fmt()`. `sfxT(v)`/`sfxL(v)` return the old
  `sufTight`/`sufLoose` strings byte for byte when dual is off. `_specDualPart` snaps to 6
  decimals before rounding. UI: `_dsDualUnitInto()` in Per-piece and Group A/B/C panels
  (not Install guide).
- `buildSpecStrings` emits `Matboard` **only for float mounts**; framed art emits
  `Mat 1`/`Mat 2`. Any `wanted` filter listing one must list all three, and the
  `_deckMockHTML` DOM-preview lists must match the PDF ones.
- Elevation fit-to-window: **three widths share one budget**: `.elev-sidebar` 425 +
  `.elev-wall-rail` 165 + 130px horizontal padding = 720. Change one alone and the drawing
  resizes. Padding floor is 65px a side (outer wall dims sit 6in out); sidebar floor ~420px.
  `drawElevAll` measures padding via `_elevWrapPadding()`. Exports pin padding to
  `ELEV_EXPORT_WRAP_PADDING` (80px a side) and hide the rail, since dim text and weights are
  CSS px that don't scale with `elevScale`.
- Elevation guide labels must not share a band with the outer wall dims (6in left and
  above). No `HANG HEIGHT` label: the callout reads `57" AFF` via `_elevAffLabel()` on the
  dim line; centre label is `CL` inside the wall top beside the dashed line.
  `_elevAffLabel` uses `elevFmt` + `unitSuffix()`, not `elevFmtU` (AFF keeps its unit mark
  even with the interior-suffix toggle off).
- **Line weights are POINTS, and absolute.** `ELEV_WEIGHT_PT` (0.25/0.5/0.75/1/2/3) is the
  only pen set; both Settings ladders are built from it by `_seedAnnotWeightControls()`,
  never in HTML. `annotationStyle.lineWeightPt` / `.tickWeightPt` / `.weightLinked`;
  `weight` is only a px mirror kept by `_normalizeAnnotationStyle()` (nothing draws from
  it). **Linked means literally equal** (no derived 2:1 split). Picking a tick weight while
  linked unlinks.
  **Exported SVG declares size in POINTS** (`_elevSvgHead`, the one header builder for the
  download and both PDF halves): `width`/`height` in pt at 1 user unit = 1/`ELEV_PT_TO_PX`
  pt; `viewBox` stays in user units (convert it and every coordinate rescales).
  `_captureElevWithGuides` takes natural size from the **viewBox** and strips the unit, or
  captures rasterize 1.33x off.
  `_svgStrokePx()` is the one stroke formatter and `_elevPenWeight(el)` the one weight
  source: **every** stroke case in `emitEl` (tick, four-border rect, h-line, v-line, both
  background lines) resolves `penW` once and uses it, dasharray included. Ask the setting,
  never the DOM (sub-pixel widths don't survive `getComputedStyle`). Floor is 0.05, not 1;
  three decimals.
  Group dims and the wall's outer extension stubs have no useful class, so they carry
  `data-svg-pen="line"|"tick"`; drop it and the exporter silently re-measures.
- **Dashed strokes are a repeating GRADIENT, never `border-style: dashed`** (a CSS dashed
  border has an uncontrollable rhythm). `.dim-dash-h` / `.dim-dash-v` / `.dim-dash-box`
  paint in `currentColor` and size from `--dim-line-w`; the class supplies thickness, so
  never write `width` on a `-v` or `height` on an `-h` line. Build with `_mkDashLine()` /
  `_dashLineHTML()`, which attach `data-svg-pen` + `data-svg-dash`: **without those the
  stroke silently vanishes from SVG and PDF.** Its `emitEl` case must stay ahead of the
  border cases.
- **The dash rhythm is `annotationStyle.dashPt`, in POINTS and absolute**, on the
  `ELEV_DASH_PT` ladder, gap at `ELEV_DASH_GAP_RATIO` (3:2); independent of stroke weight.
  `_dimDashPx()` is the source, `_dimDashArray()` the SVG form; CSS vars `--dim-dash-len` /
  `--dim-dash-gap` / `--dim-dash-period` (period = len+gap).
  **Every `var()` inside a gradient needs an inline fallback, and the dash vars need
  `:root` defaults**: an unresolved `var()` invalidates the whole `background-image`. Same
  for `--dim-line-w` (unset = 0px tall).
  Thickness `max(1px, …)` is a **screen-only** floor (fractional offsets split a 1px box
  across two device pixels); exports write the true point weight.
- **No `opacity` on dimension strokes.** `emitEl` doesn't read it, so the editor would show
  something the SVG/PDF won't print. Any softening must reach all three renderers.
- **A lifted dimension number clears the TICK, not the line** (`_dimLabelLift()`): the
  oblique is `DIM_TICK_LEN` long, centred on the line. Gap only paid when ticks are on. Keep
  the chip opaque.
  Don't write the word "finally" in comments near `exportElevPNG`/`exportElevSVG`: two tests
  locate their cleanup blocks by searching for it.
  `ELEV_PT_TO_PX = 2` is where points meet pixels: `_dimLineWeight()` multiplies for the
  screen; `_drawElevAnnOps` **divides** to recover points and does **not** scale stroke
  widths by placement scale `k` (k comes from the fit-to-window artboard). Geometry still
  scales by `k`. `CanvasPdfRec` needs nothing extra; the raster fallback (zero ops) keeps the
  old scaled look.
- `annotationStyle.dimEnds` (`'none'|'tick'`), set in Elevations gear (Line Ends). `'tick'`
  = 45° obliques: `_dimTicksHTML()` appends two per line, `--dim-line-w`/`--dim-tick-w`
  carry the weights, `_dimExtOverhang()` runs extension lines past. `DIM_TICK_LEN` /
  `DIM_EXT_OVERHANG` are print px and must NOT scale with `elevScale`. **Never arrowheads**;
  `.dim-arrow` elements are drag controls with `data-export-skip`. A tick is a rotated
  border, so it needs `emitEl`'s `data-svg-tick` case or it vanishes from SVG/PDF.
  Group dims read the **live** `annotationStyle` plus `_dimLineWeight()`/`_dimTickWeight()`;
  never store a per-entry style snapshot (undo/load restores it stale). Their bounding rect
  is always dashed.
- **Installation notes** (`FRAME_INSTALL_NOTES` + `editorialContent.installNotes`) are a
  deck-wide tick list printing an INSTALLATION NOTE box on install-guide **and** breaker
  pages; deliberately outside `_igCfg`. `noteSide` defaults LEFT on a breaker (stacked
  under the legend, at its width) and RIGHT on an install page, where it takes width off
  `SR.R`, never height off `SR.B`; past page height the *type* shrinks (to
  `IG_NOTE_FS_MIN`), not the drawing.
  `_installNoteBoxH()` is measured before layout, and the box must be drawn before any of
  `_drawInstallGuidePage`'s early returns (each draws its own footer). Note `key`s are
  persisted and permanent; wording may change. A breaker selected in Per-piece or Group
  A/B/C mode gets the install-guide panel via the `desc._install && !desc._manual` branch,
  which must stay ahead of the mode branches.
- **A NEW PICTURE NEVER KEEPS THE OLD PICTURE'S SIZE (18.94).** Every artwork apply path writes
  `artworkW/H = w || 0` and every drop passes `(u, n, w, h)`; the dashboard and wall previews correct a
  stored size whose proportions disagree with the pixels (`_artSizeStale`). The spec page reads real
  pixels, so a stale size showed a squashed picture on screen and the true crop in print.
- **SPEC ROW SPACING IS `_specRowFit` (18.94)**, for the PDF and `_deckMockHTML` alike: 8.5 on 13 unless
  the list would pass the frame strip / thumbnails by more than 4pt, then down to 9pt lead, type to 7pt.
- **THE INSTANT SPEC PREVIEW SETS ITS ROWS LIKE THE PDF.** `_deckMockHTML` builds one row
  per `buildSpecStrings` line (bold label, dotted leader, right-aligned value) at the PDF's
  8.5pt on a 13pt rhythm scaled by `h / 540`, with `tpl.spec.y` as the first BASELINE as in
  `_drawSpecPageTemplate`. `test_mock_spec_rows` reads the numbers from the PDF block;
  change both or neither.
- `_specThumbCaption()` is the ONLY way to draw a thumbnail caption (spec, breaker, install).
  Breaker captions are the bare word (the code is the page title).
- `_ELEV_CAP_QUALITY` drives the elevation capture's width + JPEG quality, separate from
  and above `_PDF_QUALITY` (the capture carries text; JPEG ringing shows on glyphs). Not PNG
  (artwork photos make lossless megabytes).
- Per-piece spec pages clamp the artwork top to the spec text top (`specTop` in
  `_drawSpecPageTemplate`); the box loses that height rather than spilling past its bottom.
- **A LIFTED NUMBER'S SIDE IS PINNED BY DRAGGING ITS LINE (18.58).** Without a pin the side
  follows the sign of `data-line-off`, which flipped the number across onto a neighbour mid-drag.
  Pins: `elev.dimLiftSide[id]` (spacing dims; NOT in `dimOffsets`, which `snapDimOffset` aligns
  against) and `line.lblSide` (measure lines); `buildDimControls` writes `data-lift-pin`.
- **AN UNTOUCHED SPACING DIM IS PLACED BY THE DRAWING (19.15, `_spacingAutoPlace`).** No stored
  offset = auto: a number that doesn't fit its gap moves the line to the least-covering spot
  (frames + numbers already placed are obstacles; the pair's own frames weigh 1, others 3; a
  number hanging off its column while the line is in it pays for the overhang). Derived every
  draw at the drawn scale, NEVER written to `dimOffsets`; `_dimAutoOff` (inches, current wall)
  feeds `getDimOffset` so a drag starts from the drawn line. Number size via `_dimLabelPx`
  (0 in jsdom = nothing moves). Side order in `_autoLiftDimLabel`: `data-lift-force` (every
  leader runs one way: number goes the other) > pin > `data-lift-auto` > offset sign.
- **ONE GROUP DIM PER SET OF FRAMES (19.15, `_groupDimKey` = sorted letters).** A repeat
  selects the existing one; `getElevGroupDims` drops saved duplicates. Clicking a group number
  sets `selectedGroupDim` (frames deselected) and Delete removes it; the frame-delete handler
  returns while a group dim is selected, or Delete takes the frames. The × carries
  `data-group-dim` so the wall's deselect-on-press does not redraw it out from under the click.
- **A GROUP DIM IS THE OUTER STRING (19.16).** `renderGroupDims` moves its width line above
  and its height line left of every spacing dim beside the box (`_groupDimObstacles`, DOM rects
  from `#dim-layer` only; `_groupDimClearTop` / `_groupDimClearLeft`), then adds the drag.
  Crossing lines (`ax` = the other axis) are skipped, and edge gaps are never read, or a ceiling
  gap throws the line off the wall. Needs spacing drawn first (`drawElevAll` order).
- `_autoLiftDimLabel(dim, type)` lifts a dim number out of its line when the gap can't
  hold it. It **measures**, so run it after `appendChild` (detached = 0, no-op).
  `data-lbl-off` carries the along-line nudge; the side comes from `data-line-off`, the
  perpendicular drag offset **every dim renderer must publish** (never default to "above").
- **Elevation dual units** are `elevDualUnit` in localStorage (drafting pref, separate from
  the spec setting). Inches lead; `elevFmt()` is the single conversion point; `unitSuffix()`
  follows `_elevPrimaryUnit()`. Companion rounds to whole mm. `_elevDualLast` remembers the
  unit; `elevDualUnit` is '' when off.
- The **target** mark (`_elevCenterTarget`) is on each frame centre AND the wall-centre x
  hang-height crossing (in `guide-layer`). It's inline SVG with `data-svg-passthrough`
  (`emitEl` border cases print a CSS circle as a square); that case stays ahead of the
  border cases.
- The elevation-capture cache (`_igCapCache`) is keyed on **`_elevCapGen`, never
  `_dsEditGen`** (which moves on every edit anywhere). `_elevCapGen` moves only when
  `_elevCaptureSignature()` differs; it compares STATE, fails closed (unhashable =
  changed), and replaces long strings by length. **Write only through `_igCapCacheSet()`,
  never `_igCapCache[k] = …`** (test-pinned): eviction drops stale generations first, then
  oldest, or dead multi-MB captures pile up.
- **Only ONE elevation capture may run at a time** (`_elevCapInFlight`, released in a
  `finally`): one elevation DOM, and interleaved captures corrupt each other's restore. The
  loser returns `null`, marking the page incomplete so nothing caches it. Restore
  `_igNoCapture` from the **live** `_thumbBusy`, never a snapshot (a stale `true` strands
  it forever). `_igCapKey()` is the one key definition, shared by the renderer and the prime
  pass; every input is global or per-elevation state so keys match across views.
- **Elevation captures use an OFF-SCREEN PORTAL, never a view switch.**
  `.view-container.elev-portal` (style.css) lays `#view-elevation` out with
  `position: fixed` (load-bearing: no reflow of the deck). Not `visibility:hidden` /
  `opacity:0` (opacity leaks into the SVG), and `display:none` measures 0.
  `_elevPortalOpen` sets width/height inline from `.app-content`'s real box (viewport
  fallback); ref-counted. `_captureElevWithGuides` calls **no `switchView`**: it opens the
  portal and calls `_elevLoadWall(idx)`. If Elevations is the visible view,
  `_elevPortalOpen` returns false and walls load in place.
- **Elevation captures are BATCHED through `_elevPrimeCaptures()`** behind
  `#elevPrimeOverlay` (above the deck preview modal), restoring the user's wall once at the
  end; `_captureElevWithGuides` skips its own restore while `_elevPrimeActive`, a **module
  flag, not a parameter** (the function takes only an index; two tests pin it).
  `_dsBuildAllThumbs({prime:true})` is phase 1 then thumbnails; the automatic 1.5s
  post-edit sweep passes **no options** (no self-appearing modal). A cancelled phase 1 must
  not roll into phase 2 (`_elevPrimeLastCancelled`), and the loop must **rethrow**
  `_pdfWasCancelError`.
- **`_igNoCapture` means "a background thumbnail render is in flight"** (`_thumbPump` holds
  it per job). `_dsBuildPage` drops the queue, bumps `_thumbRunToken` (as `exportSpecPagePDF`
  does), primes its own wall, restores the rail, and **sets `_igNoCapture = _thumbBusy`**,
  never a snapshot. `_drawInstallGuidePage` checks `!_igNoCapture && !_elevPrimeActive`
  (two independent suppressors).
- Breaker pages read the legend from their **own** `installGuide.breakerLegend*` slots
  (`_igSet(..., forBreaker)`) so Install-guide globals can't bleed onto breakers.
- **PDF text wrapping must measure with jsPDF, never a canvas.** `_drawRichTextPdf` passes
  `_richPdfMeasure(doc)` into `_layoutRichLines`; both measure and draw take font state from
  `_richPdfFont()`. `_richMeasureTrusted` is canvas-only. Letter spacing is added outside
  the measurer (`getTextWidth` excludes charSpace). Add `halfLead` per line to match CSS
  half-leading (jsPDF `baseline:'top'` has none); position offset only, `cy` advances by
  plain leading.
- **Elevation annotations print as real vector PDF.** `exportElevSVG` returns `picSvg`
  (frames/artwork/figure) and `annSvg` (lines + numbers) on **one shared artboard**;
  `_captureElevWithGuides` rasterizes `picSvg` and parses `annSvg` via `_elevAnnOps`, replayed
  by `_drawElevAnnOps`. Both halves share the artboard header, and the **pixel content-crop
  must be skipped** on this path (`if (_vecOK) throw 0;`). Unknown tags skipped; zero ops
  falls back to whole-raster. Traps: `_annHexToRgb` can't read `rgb(r,g,b)` (use
  `_cssColorToRgb`); `'sans-serif'` contains `'serif'`, so `_elevAnnFontRole` tests
  grotesques first; SVG `rotate()` is clockwise, jsPDF `angle` anticlockwise (negate).
- **Rotated labels need two special cases** (pinned by `test_elev_vector_rotated_labels.js`).
  (1) **Never pass `align` to `doc.text`**: jsPDF applies it in unrotated space;
  `_drawElevAnnOps` shifts the anchor itself along `(cos a, -sin a)`. (2) **A rotated
  `<rect>` becomes a quad**: `_elevAnnOps` maps four corners and sets `pts` **only when
  `_matAngle` is non-zero**; `_drawElevAnnOps` draws it with `doc.lines(..., closed)`.
- **`CanvasPdfRec` is a SECOND renderer with the jsPDF API** (Deck Studio centre and rail
  thumbnails via `renderDeckPageCanvas` / `renderSpecPageCanvas`). Any `doc.*` feature must
  be implemented in both or the preview silently disagrees (`_drawElevAnnOps` wraps calls in
  `try/catch`, so a missing method fails silently). `render()` must READ every recorded
  option (e.g. `opts.angle`, drawn via `x.rotate(-ang)` at the translated origin).
  Measurement is deliberately not shared (each engine measures what it draws); a 90° label's
  `x` must match across both (`test_canvas_preview_rotation.js`). Check the
  `CanvasPdfRec.prototype` list before adding a `doc.*` call.
- **The wireframe placement look** (grey block + centred letter) is
  `editorialContent.wireframe`, read by `_isWireframe()`, toggled by `setElevWireframe()`;
  the same flag the Wireframe preset sets. `ELEV_WF_FILL` / `ELEV_WF_INK` /
  `_elevWfLetterPx()` / `_elevWfFontCss()` / `_elevWfFontWeight()` / `_elevWfFontStyle()` are
  the one definition, used by the editor DOM, `_maybeAddArtworkToSvg` and
  `renderFrameToCanvas`. Styling is `annotationStyle.wfSize`/`.wfFont`/`.wfStyle`
  (localStorage, already in `_igGuideStamp`); on/off is project data. `wfSize` is absolute,
  capped to `min(w,h) * 0.8` per opening. The SVG reads family/size off the live element;
  its wireframe branch must come **before** the `!f.artworkUrl` guard. It wins over artwork
  and drops the inset shadow. Letter uses `textContent`; only the opening-size text needs
  `innerText`. It's in `_elevCaptureSignature`, and `setElevWireframe` also drops the
  frame-mockup and deck caches.
- **THERE ARE THREE GEAR POPUPS AND THEY EACH HAVE THEIR OWN `row()`**:
  `_dsOpenArrowGearPopup` / `_dsOpenGearPopup` / `_dsOpenTextGearPopup`. Fix all three; every
  row helper needs `flex-wrap` (a test walks them). Clamp with `_dsClampPopup` AFTER append,
  measuring the real height: never clamp at open time against `popMaxH` (an empty popup
  clamps to ~14% of the window and snaps back on every swatch click). A popup that fits
  stays where dragged; one that overhangs moves by the overhang only. The edge-gap popover
  is NOT clamped (appended empty, CSS-positioned).
- **`silent` MUST REACH THE PRIME.** `_dsBuildPage(silent)` must pass it into
  `_elevPrimeCaptures`, or an automatic refresh pops the render modal whenever the cache
  was dropped.
- **THE JUMP BETWEEN A BREAKER PAGE AND ITS WALL REMEMBERS WHERE IT CAME FROM**
  (`_dsJumpToElevation` / `_elevReturnToDeck`, `#elevReturnBar`). Return point is the page
  KEY, never `_dsIndex`. `_elevReturnToDeck` calls `_dsRefresh()` BEFORE `_dsRestoreSel`.
  Arriving at the deck by any route clears it.
- **LAYOUT GUIDES ARE REACHABLE FROM DECK STUDIO** (`_dsElevGuidesInto`, install/breaker
  panel). Deck-wide, and labelled so (one elevation view). `_dsGuideIsOn` reads exactly as
  `toggleElevLayer` does (unset display = OFF). The toggle flips the Elevations button and
  calls `_elevGuidesChanged()`, and must **NOT** call `drawElevAll` (the hidden view
  measures zero); the next capture redraws through the portal.
- **The Elevations tab is the source of truth** for what appears on elevation pages:
  breaker and install pages both mirror it exactly (no separate "show layout guides" opt-in;
  hence no breaker variant in `_igCapKey`). Guide styling is global; figure position is
  per-elevation.
- **Hang height and baseboard are stored in INCHES** (`elevHangIn` / `elevBaseboardIn`,
  standards `ELEV_STD_HANG_IN` 57, `ELEV_STD_BASEBOARD_IN` 4); inputs are only their display,
  reseeded by `seedHangBaseboardInputs()` on boot, unit change, project load and undo. Saved
  as `hangHeightIn`/`baseboardIn` in project JSON and in `snapshotProjectState`. Display
  rounds to **2dp, not `unitInfo().decimals`** (cm standard is 144.78).
  `_elevCaptureSignature` hashes the inches, not the input text.
- `importDashCSV` strips unit suffixes during column lookup, so CSV headers must include the
  suffix, e.g. `Overall Width (cm)`.

- **EVERY MODAL IS ONE CLASS: `.frame-modal`**, with one `--modal-scrim` and one
  `--modal-blur`. Five z-layers are deliberate: `--z-modal` (over the app), `-over`
  (full-screen tool), `-nested` (on another modal), `-progress` (long work), `-alert`
  (info/confirm, outranks all). Modifiers `.fm-over/.fm-nested/.fm-progress/.fm-alert`.
  Don't tidy: (1) each modal keeps its inline `display:none` (JS opens with
  `.style.display = 'flex'`); (2) `#infoModal` and `#dsGenerateModal` keep an inline
  `z-index` (`showInfoModal` rewrites it; `test_img_intake` reads `.style.zIndex`);
  (3) `#alignModal` is NOT a `.frame-modal` (no scrim, `pointer-events:none`; the shell
  would eat clicks on the wall). `test_modal_shell.js` is plain Node reading source; a
  `new RegExp('…\s…')` built from a string loses its backslash there. Use `indexOf`.

- **THREE BLUE TOKENS.** `--accent` (#3a86ff) brand: nav tabs, primary buttons.
  `--ui-active` (#6a6aff) "control is ON": tab pills, toggles, progress, drag handles.
  `--selected` (#2196f3) "object on the drawing/page is selected" (frames, context blocks,
  glazing all use it). `--warn` (#c98a2e) is amber. Never a raw fallback blue inside
  `var(--accent, …)`.
  **Light theme chrome is monochrome**: `.light-theme` overrides `--accent`, `--ui-active`,
  `--btn-primary` to near-black; surfaces warm off-white, `--bg-input` pure white.
  `--selected` is NOT overridden: every on-canvas outline, handle, grip, marquee and
  line-tool marker must read `--selected`, never a chrome token, or it turns black in light
  mode. `test_light_monochrome.js` lists those renderers by name; add new ones there.
  **`STATUS_DEFS` STAYS A HEX LITERAL**: it feeds `_annHexToRgb` → `doc.setFillColor`, where
  a `var()` parses to nothing.
  **Declare a token AFTER replacing the raw value, never before**, or a blanket replace
  rewrites the declaration into `--x: var(--x)` (resolves to nothing, no error).
  `test_color_tokens.js` checks computed CSS.
  **jsdom keeps a `var()` set on a LONGHAND and drops one set through a SHORTHAND** (`cssText
  = 'border:2px solid var(--ui-active)'` leaves `.style.borderColor` `''`); read
  `getAttribute('style')` instead. **A regex containing `var(--x)` matches nothing** (the
  parens are a group); use `split().length - 1`.
  A `var()` in an SVG presentation attribute resolves on screen; the hazard is only markup
  serialized into an exported file (no `:root`), which is why context art substitutes a real
  colour on export.
- **A PER-PIECE DETAIL PAGE IS FOUR TICKS** (`_specSlots`, `_specTplEffective`,
  `SPEC_SLOT_KEYS` = frame / profile / plan / elevation). Corner and profile are separate
  ticks (a piece can have one photographed and not the other).
  **Two opposite rules, on purpose.** TICKED but empty **reserves** the space
  (`_specSwatchBox`, grey, own caption) so the page stops reflowing while it is filled in.
  UNTICKED **removes** it and everything after **packs left**.
  **The ticks pick the base layout, they do not invent geometry.** `artSpecDetail` /
  `frameSpecDetail` are the no-frames / frames pair; `_specTplEffective` resolves to
  whichever the frame ticks imply, then deletes and repacks, so an untouched deck renders
  byte for byte as before.
  **Seeding is keyed on the field being ABSENT** (not a version counter) and reads the
  template the deck is already on (an `artSpecDetail` deck seeds frames off). Per-PAGE
  template overrides seed the same way.
  **Deck-wide by default with per-page exceptions** (same shape as heading type). Setting a
  tick deck-wide **clears that ONE slot** from every page exception; `_clearSpecSlots`
  prunes empty shells.
  **Three consumers:** `_drawSpecPageTemplate` (PDF), `_deckMockHTML` (instant preview) and
  `_dsThumbCacheKey`. Miss one and the preview lies or a thumbnail goes stale.
  **A template card is NOT filtered by ticks** (`ctx.swatch` takes the raw template).
  **There is ONE per-piece layout and no picture cards or layout buttons**; designers tick
  parts instead. The default, and the fallback for an unreadable stored value, is
  `frameSpecDetail` (load-bearing: a default with no ticks leaves an empty panel).
  **Legacy names (18.34):** `classic` and `frameRight` are renamed to `frameSpecDetail` on
  load by `_specTplRetireLegacy`, called in `_mbMigratePages` right AFTER tick seeding,
  because seeding reads the old name through `SPEC_SLOT_SEEDS` (one table of what each old
  layout actually drew; deck seed and per-page seed must both read it). `SPEC_SLOT_SEEDS`
  therefore still lists `classic`. `_drawClassicSpecPage` is deleted. `_specTplSlotAware`
  covers `artSpecDetail`, `frameSpecDetail`, `frameRight` only.
  **`custom` is NOT slot-aware** (`freeform`, hand-placed); it keeps its own renderer and
  the panel prints a sentence saying there is nothing to tick rather than an empty section.
  **The flat sheet's bail RETURNS before any per-piece control is built** (tests read "the
  bail comes first"; do not turn it back into an inline `!_flatPage &&` guard).
  Test traps: assert the seeded TICKS, not just that the default is slot-aware (`frameRight`
  is slot-aware too but seeds two parts off); the `classic` seed row needs its own check.
  **Group A/B/C: Shared specs is the default and only group layout; no cards.**
  **A group page keeps its OWN tick map** (`specGroupSlots`, `_specGroupSlots`,
  `_setSpecGroupSlot`) because defaults differ: group seed is `elevation` from
  `scaleOpts.elevThumb` (off by default), `frame`/`profile` on, `plan` off. One shared map
  would grow an elevation and plan onto every group page in flight. `_specSlotsFor(tplKey,
  ovKey)` is the one resolver.
  **The band packs RIGHT TO LEFT: elevation, floorplan, profile, corner.** Each thumbnail
  anchors to the box its right neighbour actually drew (`_thumbBox`, rewritten by each).
  Corner and profile stay INTERLEAVED per moulding inside `_drawFrameStrip` (`box.corner` /
  `box.profile`, default true). The old `Elevation thumbnail (bottom-right)` checkbox is
  gone; the Elevation tick is the one control.
  **A template card pins the plan OFF** (a fourth thumbnail pushes the strip past
  `_drawFrameStrip`'s fit check).
  **The card renderer/prewarm (`_dsPrewarmTplSwatches`, `_dsQueueTplSwatch`,
  `_dsPaintTplSwatch`, `_dsTemplateSwatchHTML`) was removed in 18.31**; the demo data
  (`_specTplDemo*`, `SPEC_TPL_DEMO_*`) remains for the Type defaults Spec demo.
  Test traps: source-order checks on the band passed real breaks, so band checks RENDER and
  read the captions. "Both frame ticks off" proves nothing about the strip (`_wantStrip`
  gates it first); test ONE tick off. Slice between landmarks, never `S.slice(i, i + N)`.
  **The strip and the envelope anchor on whichever column survives**, never on `tpl.plan`
  (`_tplDesignFrame` would measure from a plan that is not on the page).
  Traps: `_dsSpecSlotsInto` must be called AFTER `const _flatPage` is declared (TDZ throw
  kills the panel). `tests/test_egd_wf_product.js` is mostly CRLF, like style.css, so a
  multi-line `\n` edit anchor matches nothing.
- **THE IMAGE CODE IS `_dsImageCode` (file name less its LAST extension; dots in a code are
  part of it), AND THE GEAR POPUP SHOWS IT WHETHER OR NOT THE CAPTION PRINTS IT.** ONE
  definition, shared with `_dsResolveCaptionText`. The field is **readonly**.
  **Copy is the shared `svgDup` glyph, LEFT of the field**, addressed by
  `data-act="copy-code"`. Do not draw a second copy icon.
  **The field is `flex: 1 1 60px`, not `1 1 auto`**: in a wrapping flex row an `<input>`
  wraps on its ~180px content width before shrinking, whatever `min-width: 0` says. Same
  trap for any control beside an input in these popups. No stored name: say so, no empty box.
  **`_dsCopyText` needs its fallback**: `navigator.clipboard` is undefined outside a secure
  context (`file://`). Fallback selects the on-screen field and `execCommand`s copy; if
  refused, the text is left selected.
- **THE GEAR POPUP IS A TABLE: A LABEL COLUMN, NOT A HEADER LINE PER SECTION.**
  `sec(label, tip)` returns the control body; `subRow()` is a continuation line in the same
  column; `swIn()` is the block form for `_frameSwatchesInto` (a flex body would put swatch
  families side by side). Same fixed label width as `_dsTypeSection`. Popup is **340px**.
  Shortened labels (Weight, Radius) must carry the full wording as a tooltip (tested).
  **`.action-btn` IS `width: 100%`**: a button with neither a width nor a `flex` becomes a
  full-width slab when it wraps. Size small buttons explicitly.
  **The `sec` wrapper has no `gap` and no `flex-wrap`** (label must stay beside its body;
  spacing is the label's `margin-right`), which keeps "a flex row with a gap must wrap"
  true for every control row, as `test_fp`'s spill check reads.
- **FILLING A SHAPE WITH AN IMAGE IS ONE OPERATION: `_dsSetShapeImage`.** Both the popup
  path (`_dsHandleImageFile`) and the drop path (`_dsReadImageToShape`) go through it.
  It writes `fileName` **unconditionally** (a replacement takes the new name; a nameless
  image clears it so the caption's **Code** source disables itself). The two paths still
  decode/downscale separately (1100px popup, 1400px drop), deliberately. An image that
  predates the field keeps Code disabled with a re-upload tooltip.
- **THE ELEVATION'S GROUND IS NOT A THEME COLOUR (`--elev-ground`).** The drawing is print
  colours in both themes (dimension ink from `annotationStyle`), so `.workspace`
  (`#scrollArea`) must not read `--bg-main` or dark mode hides the outer wall dims.
  Declared once in `:root`, **NOT overridden in `.light-theme`**. It is a shade **darker**
  than `#wall` (#f0f2f5), never lighter or equal (tested both ways). The floating buttons on
  it keep the app theme. Exports are unaffected (`#export-wrap` is transparent,
  `html2canvas` uses `backgroundColor: null`). `_elevWrapPadding()` measures `.workspace`,
  so keep changes there to paint.
- **LIGHT MODE IS OFF-WHITE, AND ONLY THE INPUT IS PURE WHITE.** Surfaces step light to
  dark: input, panel, nav, subpanel, main; that ordering is the rule. `--bg-input` stays
  `#ffffff` (must be the lightest thing so a field reads as typeable). Safe because the
  deck preview reads no theme token.
- **THE THEME TOGGLE SHOWS THE MODE IT WILL SWITCH TO** (sun while dark, moon while
  light). Two `<svg>`s swapped by CSS (`.theme-icon-sun` / `.theme-icon-moon`, like
  `.logo-dark` / `.logo-light`); `toggleTheme()` stays one line (tested). The sun is a
  stroked circle plus eight rays because `.svg-icon` is `fill: none; stroke: currentColor`.
  **`style.css` HAS MIXED LINE ENDINGS** (mostly CRLF): a multi-line anchor written with
  `\n` matches nothing. Edit line by line or try both endings.
- **A CLASS SET IS NOT A STYLE APPLIED: `.action-btn.active` exists.**
  **ORDER IS THE WHOLE RULE.** `.action-btn.active`, `.action-btn:hover`, `.btn-secondary`,
  `.btn-outline`, `.btn-danger` all weigh (0,2,0), so the active block must sit after all
  of them (or a lit `action-btn btn-secondary`, e.g. the wall-mode pair, paints grey), with
  `:disabled` restated last.
  **`test_active_state_visible.js` uses a REAL jsdom matcher**, not class-name string
  comparison (descendant rules like `.unit-toggle button.active` name none of the element's
  classes). It also checks a real `.active` `.action-btn` gets painted.

- **THERE IS A TYPE LADDER AND A CORNER LADDER, AND NOTHING OFF THEM.** Font sizes are
  `--fs-45` … `--fs-120` (0.05rem steps, widening above 0.85); radii are `--r-2` … `--r-10`
  (even steps; 4px is the house value). **Named by VALUE, not role** (`--fs-65`, never
  `--fs-small`). **Ties go to the denser neighbour** (3px radius goes to 4, not 2).
  **50% circles and the single 99px pill are untouched** (shapes, not sizes; tested).
  Heights are deliberately NOT laddered (control band 20 to 34px feeds flex rows whose
  siblings must match); a separate `--ctl-h-*` set is the shape if ever wanted. No rem size
  reaches the PDF (points via `setFontSize`).

- **THERE IS ONE PANEL TAB STRIP: `.frame-tabs` / `.frame-tab`** (pills, segmented
  controls). **`.nav-tab` IS DELIBERATELY NOT THIS** (switches VIEWS, underline style;
  tested).
  **STATE IS A CLASS (`.active`), NEVER A WRITTEN `cssText` STRING**, which would clobber
  other inline state. `_dsToolsTab` still calls `_dsSyncToolsTabBar()` afterwards, only
  because the Templates button's availability depends on the selected page. `.elev-tab-on`
  is gone. `_tplTabCss` is now `_tplTabClass` (returns class names; also used by the
  presentation-preset list and preview-quality segments).
  **`test_tab_component.js` CONTAINS NO REGEX, on purpose**: backslashes get lost in test
  files, and `.frame-tabs.fit > .frame-tab {` contains `.frame-tab {`. Use `indexOf` with a
  leading newline.

- **THE DECK PREVIEW IS A PICTURE OF PAPER, NOT UI: DO NOT TOKENISE IT.** Most raw hex in
  app.js is serialized template/project DATA (`IDML_MASTER_TEMPLATES` in `templates.js`,
  `_starterDeck()`), canvas/PDF calls where `var()` parses to nothing, or the sheet
  previews `_deckMockHTML` / `_mbThumbInner`. `_deckMockHTML` must contain zero `var(--)`
  (theming it shows a grey the PDF will not print). Only the blues and amber were chrome,
  and they are done. `test_preview_is_paper.js` pins this, data included.
  **`SHAPE_DEFAULT_FILL` is the one placeholder grey**, a hex LITERAL (the PDF path hands
  it to `_annHexToRgb`). The 73 `"fill":"#d8d8de"` entries in serialized templates are NOT
  this constant and must stay literal (rewriting them edits saved documents).
  There is no dominant repeated button shape in app.js; a generic `_btn()` factory would
  consolidate almost nothing.

- **ONE RETURN POINT, THREE TRIPS (`_viewReturn`)**: deck to elevation, elevation to
  dashboard (Edit Master), dashboard to elevation. ONE slot (one trip at a time). `view` is
  where the button TAKES you; **`at` is where the trip LANDED** and the only view the bar
  paints in. `_endTripIfWanderedTo(view)` in `switchView` ends the trip anywhere else.
  Anchor on page KEY or row ID, never an index. `_syncDashWallJump` hangs off
  `checkGlobalEditingWarning`.
  **A BLANKET RENAME ATE TWO THINGS AND THE FILE STILL PARSED**: it rewrote a name sharing
  the prefix (`_elevReturnToDeck`) and turned an alias declaration into
  `function _syncReturnBars() { _syncReturnBars(); }` (last hoisted declaration wins,
  infinite recursion). `test_return_trips.js` checks for one-line self-calling functions.
  Rename by whole identifier, or not at all.

- **JUMP TO IS CTRL+K / CMD+K (`openJump`, `_jumpEntries`, `_jumpFilter`, `_jumpGo`).**
  Codes, walls, deck pages and views; rebuilt on every open. A piece is ONE row with up to
  three chips (Piece / Wall / Page); Enter takes the chip for the current view
  (`_jumpDefault`). Navigate by row ID, `elev.id`, page KEY, never index. Punctuation
  ignored both sides (`_jumpCompact`). On the `.frame-modal` shell. A page's search text
  must carry its NUMBER. Ranking: title matches evict subtitle-only matches; a spec page is
  listed alone only for its typed number; each group stays contiguous. jsdom cannot show
  ranking; check in headless Chrome over CDP.
- **`_toast` IS FOR WHAT IS SAFE TO MISS; THE MODAL KEEPS EVERYTHING ELSE.** Toast:
  acknowledgements and "why nothing happened" nudges. Modal (`showInfoModal`): anything you
  must READ to act on, any change you did not ask for, every failure (a test pins examples:
  *Studio defaults exported*, *Units auto-corrected*; "Restored", "Detached as", "No wall
  elevations yet" stay modals).
  **`--z-toast` sits ABOVE `--z-modal-alert`** (toasts are raised from inside modals). The
  host is `pointer-events: none`, each toast re-enables its own. Toasts **stack, never
  queue**. `_toast` returns null without throwing when there is no `document.body`.

- **Every surface that pictures a page sets text UNKERNED** (`font-kerning:none` on the
  `white-space:pre-wrap` tiles and the deck centre / rail / Project preview / layout
  canvases, `fontKerning = 'none'` on `CanvasPdfRec`'s and `_richMeasureCtx`'s contexts),
  because jsPDF never kerns and kerned browser text runs 0.5 to 5% narrower. A new text
  renderer must do the same (`test_type_unkerned`).
- **A preview is cached only if its render was complete** (`_igRenderWasComplete()` gates
  every cache write; `_igCaptureDeferred` marks a suppressed capture incomplete), or a
  "Hit Build" placeholder gets cached as the finished page and never re-renders.
- **Vertical spacing and custom dims pass `rotateLabel: 'auto'`**: `_dimRotateFits`
  rotates the number when it fits the gap, else leaves it upright so `_autoLiftDimLabel`
  can lift it.

- **THE HEADER SHOWS A CONTROL ONLY WHERE IT WORKS (18.36).** A header element with
  `data-views="dashboard elevation"` is hidden elsewhere by `_syncHeaderForView()` (called
  from `renderNavTabs`) via the `.hdr-off` class, never `style.display`, because those
  buttons set `display:flex` inline. Save Project is a split button; `openSaveMenu` holds
  Save / Save As / Versions. Deck Studio has NO save of its own (18.50; it once had a
  fake one that only pushed history).
- **DASHBOARD ROWS SHOW AN ARTWORK THUMBNAIL (18.61, `_dashArtThumbHTML`).** Never the full
  artwork in the table: each source is shrunk once to a 64px JPEG in `_dashThumbCache` (key =
  length + last 32 chars, bounded at `DASH_THUMB_CACHE_MAX`), and a placeholder swaps in place.
- **THE DASHBOARD TOOLBAR IS THREE BUTTONS AND THREE MENUS (18.52, `openDashMenu`).**
  + Add Item (primary), Duplicate, Delete, then Edit / Import / Export menus on the shared
  `_frameMenu`. Menu labels keep the old button wording (Help names them). A new dashboard
  action goes in a menu, not a new button; `test_dash_toolbar_menus` pins six controls.
- **ROUNDING IS ONE PROJECT SETTING PER UNIT (18.60): `_fmtUnitNum(n, unit)`.** Every PRINTED
  dimension (elevation `elevFmt`/`_elevDualPart`/`_elevFmtExact`, spec `fmt` + `_specDualPart`,
  letter legend, glazing schedule, frame-size strings, opening/OD labels, dashboard preview)
  rounds through it to `editorialContent.unitPrecision[unit]` (0..4 places, trailing zeros
  trimmed; defaults `UNIT_PRECISION_DEFAULT` in 3 / mm 0 / cm 1). `setUnitPrecision` is the one
  writer; it is in `_elevCaptureSignature`. NOT for data entry (`dashFmt`) or CSV numbers. A new
  print site must use it, or the same moulding prints two ways again. `_num1` (flat-graphic
  captions, space-bound) is deliberately outside it.
  **Every elevation number carries its unit**: the interior-suffix toggle (`showUnitSuffix`, the
  Units tile) was removed in 18.60.
- **ONE SECOND UNIT PER PROJECT (18.37).** `editorialContent.specDualUnit` drives spec
  pages AND elevations (`_elevDualUnit()` returns `_specDualUnit()`); the old per-computer
  `elevDualUnit` localStorage switch is gone. `setProjectDualUnit` is the one writer.
  Units UI is Settings > Units (`openUnitMenu`; the header chip was removed in 18.57) and
  the Project tab's `#projUnitsHost`; both
  are built by `_unitControlsInto`. New projects get `'mm'` in `_startNewProject` (NOT
  `_editorialDefaults`, or every harness would print dual units); `_editorialFromFile`
  nulls a missing field so an old file keeps none; a file carrying only `elevDualUnit`
  adopts it on load, and saves still write `elevDualUnit` for older builds.
- **THE DECK STUDIO DOCK HOLDS THE PAGE TOOLS AND SELECTION ACTIONS (18.38).** Guides,
  Layers (hidden), Preview, Preflight, then `#dsSelGroup` (`.ds-dock-group`: settings,
  front, back, delete). Front/back/delete go through `_dsSelToFront` / `_dsSelToBack` /
  `_dsSelDelete`, which pick a layout-page box (`_dsMbHasSel`) or a page note.
- **PREVIEWS REBUILD BY THEMSELVES (18.39).** `_dsBuildAllThumbs` primes elevation
  captures by default, SILENTLY (`onStep: _dsPrimeProgress` feeds `#dsThumbProgress`, which
  has a Stop link); `opts.prime === false` skips it. `_dsRefresh` calls
  `_dsScheduleAutoBuild` (1.5 s debounce, deck open only). There is no Build all button;
  `_dsRebuildEverything` (the small icon by the page filter) forces a full rebuild.

- **FRAME EFFECTS (18.41/18.42): every frame shadow has a strength in `frameFx`**
  (`outer`, `frame`, `mat`, `art`, `paper`, 0-2, 1 = the old look exactly, plus the switch
  `pageShadow`). A NEW shadow anywhere must go through `_fxSh` (canvas) or `_fxCss` (inline
  CSS) or read `--fx-*` (style.css), or the panel tunes every view but that one. Saved per
  computer and in the project file, and in `_elevCaptureSignature`. Changing it runs
  `_frameFxChanged` (frames cache, mockups, captures, built pages). The opening's `art`
  shadow is drawn AGAIN after the artwork, because artwork covers the opening (never for
  wireframe, floater, float mount or faux mat). Spec-page frames are flattened JPEGs at
  pad 0, so their drop shadow is a separate transparent PNG from `_pdfFrameShadow`, drawn
  just before each of the five frame `addImage` calls; opt-in, off by default.
- **The Deck Studio dock (18.40):** Text box and Paragraph are in the Text menu
  (`dsDockNotes`), Upload image in Shapes; no standalone T or image button. Selection
  settings is a gear, never the theme sun.

- **THE FRAME BROWSER (18.84, `openFrameBrowser`, `_fb*`)** replaces the flat Frame dropdown. Frames are
  addressed by CODE. Project frames = frames on an item (`_fbInUse`, DERIVED from rows, never stored) +
  `editorialContent.frameShortlist` (codes; `_fbShortlist` is READ-ONLY, `_fbSetShortlist` the one
  writer, pushes history, deletes the field when empty). My groupings: localStorage `FB_MINE_KEY`.
  Team groupings: `library/groupings.json`, committed by a person; the app is static and never writes
  to GitHub (no tokens). Picking goes through `loadDashFromCustomLibrary` via the hidden
  `libVendor`/`libCollection` selects, which must stay in the DOM. Catalogue facts (colour, family,
  profile, series) come from `library/<v>/<c>/catalogue.json`, merged by
  `scripts/build-library-manifest.js` with the `corners/` + `profiles/` paths. Michelangelo source is the
  Google Sheet behind their site search (Photo_3 = corner, Photo_4 = line art); the swatch is the
  corner's face, cross-faded to tile down the rail.
  **Floaters need the lip width (`_f`), which the sheet does NOT carry**: it is read off each series'
  line art (top callout; for stepped/wedge/cove profiles the wall at the canvas). The app derives the
  inset as lip + `FLOATER_SHADOW_REVEAL`, and a collection named *floater* switches the product.
  **THE REVEAL IS A GAP, NOT MOULDING (19.02):** `_floaterRevealOf(inset, unit)` (derived from the inset, never
  `_faceWidth`, which is not unit-converted or carried onto wall frames) is painted dark just outside the canvas in
  all four views (canvas renderer ring, DOM spread shadow `_floaterGapCss` KEPT when the canvas has artwork, SVG ring),
  strength `frameFx.gap`. A lip named in the maker's text (`5/8" Face`) beats one read off a drawing.
  **THE FRAME PICKS THE PRODUCT BOTH WAYS (19.03):** `applySwatchToRow` makes a floater (`_swatchIsFloater`: collection
  name OR `faceWidth > 0`) a floater canvas, and a regular moulding on a FLOATER item Framed Art again. Every other
  product is left alone; the form dropdown follows `row.product`.
  **Larson-Juhl (18.92):** source is their Magento GraphQL (GET only, header `Store: us`, category
  uid `Nzk1` = Mouldings) for sizes/facets, and each product page's fotorama JSON for images (GraphQL
  media is empty). Corners are L-shaped and cropped to one leg; some galleries list the drawing first.
  Codes `LJ-<sku>`, folders `library/larson_juhl/<collection>[-floaters]`. Floater lips read off the
  drawings. Nielsen metal (no photos), Raw Maple (drawings only), fillets, liners, strainers left out.
  The browser's Library groups by VENDOR (`ven:` source, `_fbOpenVendors`), plus a Style filter.
  **Universal Arquati (18.95):** WooCommerce Store API (`/wp-json/wc/store/v1/products`, public) gives
  Width/Height/Rabbet/Collection/Color/Style/Profile as attributes; image 0 is a photo of a strip lying
  sideways (cut end LEFT, code label under it), image 1 the drawing. Rotated a quarter anticlockwise it
  matches MICH. White mouldings need the near-white threshold. Discontinued = '(Discontinued)' in the
  NAME. Floater Width is the LIP; the full rail width is read off the drawing. Codes `UA-<sku>`.
  **International Moulding (18.98):** SvelteKit site; items from POST `newapi.internationalmoulding.com/api/
  inventoryitem/getpagedinventoryitems2` (catalogId 741, own brand id 37, `discontinued` flag, Width = full
  rail); images `s3.amazonaws.com/im-dropbox-sync/<itemnum>-2.jpg` (strip) and `-3.jpg` (drawing).
  **Framerica (18.98):** WooCommerce Store API; sizes parsed from the short description; L corners like LJ;
  drawings picked by the BW profile number (pages carry other profiles' drawings). No floaters.
  Floater folders: never double the suffix when the collection is already named for floaters.
  **ORIENTATION IS PART OF THE SWATCH (18.99):** every corner and swatch has the OUTER edge LEFT and the
  rabbet notch RIGHT (MICH); `renderFrameToCanvas` draws the image's left edge as the outside of the rail.
  IM photos are all mirrored (importer flips); Framerica is mixed (importer reads the notch side).
  **Every corner photo is 150x400 (MICH's shape), cut end at the bottom (18.96).** A taller one reads as a
  sliver in the browser card; the importers crop the bottom 400. A deep shadowbox may be taller, sized
  from the FRAME's own depth/width (cut end = 150*depth/width px, +120 face, max 600), never from a cut
  detected in the photo (fine wood grain fooled it into 1650px corners). Floater corners: wall LEFT,
  floor along the bottom. The browser's Type filter (`FB_KINDS`) splits frames from floaters by faceWidth.
  **Left out on purpose:** Liners and Fillets (they nest inside another frame; FRAME has no such
  product), Flat Surfaces (rabbetless, holds no art), Stretchers (hidden). 627-45 has no photo upstream.
  **Swatch cut:** standard (outer-edge colour change or hard edge) by default; ornate/barnwood faces
  are busy and use the bottom-up smooth-end finder. Never floor a swatch past a real cut: deep shadow
  boxes have a face only ~17% of the photo.
- **THE PROJECT TAB READS SETTINGS BACK, IT DOES NOT HOLD THEM (19.06).** Units, rounding and
  Frame effects are changed in Settings; `#projUnitsHost` is a one-line readback
  (`_projUnitsSummaryInto`, refreshed by `_syncUnitChip` and `setUnitPrecision`) beside Units... and
  `#projFrameFxBtn`. Name, code, location, version are one `.proj-fields` block.
  **Its page preview draws an element page with `_dsElementPageThumbHTML(desc, w, h, undefined,
  true)`** (the rail's builder: theme background, dark ink, notes, footer; `noBadge`), never the
  bare `_deckMockHTML`, which ignores the page theme.
- **FRAMES COME FROM THE LIBRARY (19.09).** New items start in `DEFAULT_FRAME_CODE` (MICH-132-29) via
  `_defaultFrameApply` in `_fpAddCodes` (and the boot placeholder). The swatch loads once
  (`_defaultFrameLoad`, after the bundled library); a row minted before it lands is a black colour
  stand-in with the same code, upgraded by `_defaultFramePending` (object identity, never a row field)
  only while untouched. The dashboard's Frame is ONE card (`#swatchSelectedDisplay` = `.frame-card`,
  `_dashFrameCardSync`); the colour toggle, colour picker, Sync Folder and Upload buttons are gone
  (`#fType`, `#fColor` stay as hidden inputs; colour frames still load and print). A one-off frame is
  **Custom swatch...** in the frame browser foot (`#fbCustomSwatch` -> `#swatchUpload`). Picking a frame
  fills `fColorName` from the catalogue only while it holds nothing or the previous frame's colour.
  The Sync Folder modal code is dormant (previously stored swatches still load).
  **19.10:** the card is a SQUARE picture button (`.frame-card-sq`) with `m_fCode` / `m_fColorName`
  stacked beside it (`.frame-row-fields`); the catalogue line (`#frameCardSub`) is on the heading.
  **Artwork is added only from the preview** (the empty opening's `.art-add-btn` with its caption,
  and drops on `#dash-frame-visual`); the panel's upload row (`#m_artworkDrop`) is gone, and
  `#m_artCropControls` (zoom, Reset, 1:1, Remove = `#m_artworkClear`) shows once there is artwork.
- **ONE SETTINGS GEAR (18.47): `#appSettingsBtn` -> `openAppSettings(tab)`**, in every
  view (no `data-views`). Tabs `APP_SETTINGS_TABS`: `units` (`_unitControlsInto`), `fx`
  (`_frameFxInto`), `elev` (hands off to `openPrecisionModal`, closing Settings first).
  `openFrameFx` / `openUnitMenu` / the units chip / `projFrameFxBtn` all land on their tab;
  there is no separate Frame effects modal (`#frameFxModal` is gone) or units popover.
- **ELEVATION SETTINGS IS ONE SCREEN (18.48, `#precisionModal`, `.es-*` in style.css).**
  Three columns, 26px rows, ~520px tall: no scrolling on a laptop. NO paragraphs: every
  explanation is a static `.help-dot` with `data-help`. Units are NOT set here (Settings >
  Units; `#elevSetUnitsBtn` shows them and goes there). **Line ends are ticks, always**:
  `_normalizeAnnotationStyle` forces `dimEnds = 'tick'` AFTER the weight migration (which
  still reads the stored value), `setAnnotDimEnds` ignores its argument, no control. The
  corner "units" legend on the wall is gone (`unitLegendText` deleted).
- **WIREFRAME IS A LAYOUT GUIDE, SVG FRAMES ARE AN EXPORT CHOICE (18.49).** `#wireframeToggle`
  (View group, beside Artwork) calls `setElevWireframe(!_isWireframe())`; lit by
  `seedElevWireframeToggle` AND `syncLayoutGuideButtonStates` (presets, undo and loads change
  it). Letter STYLE stays in Elevation settings. `svgFrameMode` is NOT stored: the export
  menu picks it per export through `_svgExportAs(mode, run)`, which puts it back (also on a
  throw) so PDF captures never inherit vector frames; `loadSvgFrameMode` clears the old key.
- **ELEVATION SHADOWS ARE IN REAL INCHES (19.05).** `elevScale` is px per elevUnit, so `N * elevScale`
  is N INCHES (the old drop shadow was a 40" blur). Every wall shadow uses the canvas recipe in
  points: `_ePt = elevScale * unitFactor('in', elevUnit) / 72` (outer 35/18/0.55, frame 35/14/0.75
  inset, mat 20/8/0.5625, art 8/3/0.3125; insets carry `dIS`'s 1.25). With artwork the picture
  covers the opening's inset, so `.art-shade` casts it again over the `<img>`.
- **AN EMPTY OPENING ON A DECK PAGE IS `ELEV_EMPTY_OPENING_FILL` (19.17).** `renderFrameToCanvas`
  leaves the opening transparent; on deck pages the drop shadow sits UNDER the frame and showed
  through as black. `opts.emptyFill` fills it (before the opening's inner shadow; never under
  artwork or wireframe). Passed by `renderElevationToCanvas` and by `exportElevSVG` ONLY when
  `forCapture` (`_capK`); downloads stay transparent.
- **ONE DECK-PAGE DROP SHADOW: `_frameShadowCanvas(d, wIn, hIn)`** (gated by `frameFx.pageShadow`,
  "Also on deck pages"). `_pdfFrameShadow` (spec pages) and `exportElevSVG` `forCapture` (breaker
  and install pages) both draw it; the capture splices all shadows in UNDER all frames
  (`_shadowAt`), skips wireframe walls, and the SVG download never gets one.
- **THE ELEVATION TOOL DOCK (19.05, `#elevToolDock` in `#elevDockSlot`)** is Deck Studio's
  `.ds-dock` (not `.vert`: it scrolls and would clip the Add frames flyout `#bulkDropdownList`).
  A 54px column between sidebar and workspace, the one deliberate cost to the on-screen fit
  (`test_elev_rail_width`); BOTH exports hide it beside the rail. Select (V) is lit when no wall
  tool is armed (`_elevDockSync`, from `initElevControls` and `toggleLineTool`), which also writes
  the tab counts (`data-elevtab-n`). Moved ids kept: `lineToolBtn`, `alignBtn`, `groupDimBtn`,
  `fitFlatBtn`, `bulkImportBtn`, `shortcutsBtn`; `contextToolBtn` now exists.
- **INNER SHADOWS ARE TRUE INSETS (18.46, `dIS`)**: the casting stroke runs up to the edge
  and is parked off-canvas with the shadow thrown back by `shadowOffsetX`. The old stroke
  sat 10px outside, so small shadows (Onto artwork, Mat onto mat) never arrived. With NO
  mat the frame recipe casts onto the art (`_openShadow`, `.art-visual.fx-frame-cast`).

- **TOUCH IS ONE LAYER OVER THE MOUSE HANDLERS (19.18, `_touchInstall`, `_touchArms`).** iPad
  landscape is the touch target (iPhone not yet). A finger sends a synthetic mousedown; if its
  handler ARMED a drag (registered mousemove/mouseup, or assigned `document/window.onmousemove`)
  the moves are forwarded and scrolling stops, else the touch scrolls/taps natively. So a NEW
  drag written the house way (mousedown registers document listeners) works by touch for free;
  one that reads moves any other way will not. Inside a real scroller an armed drag waits
  `TOUCH_HOLD_MS`; `TOUCH_SURFACES` drag at once. The layer also listens on the START element,
  because `drawElevAll` rebuilds it mid-drag and a detached node's touches never reach window.
  iOS compat mousedown/up/move are swallowed for `TOUCH_COMPAT_MS`; the trusted click is kept.
  A control shown only on `:hover` needs a line in style.css's `@media (hover: none)` block.
  **19.19:** `_touchMods` (Shift/Ctrl/Alt latched from the `#touchKeys` bar, touch screens only)
  ride on every synthetic mouse event; the bar's Delete dispatches a real Delete keydown, and the
  bar stops its own presses or they clear the selection. `_touchReach` retargets a touch within
  `TOUCH_HANDLE_REACH` to a visible handle no bigger than `TOUCH_HANDLE_MAX` (`TOUCH_HANDLES`,
  incl. any inline `-resize` cursor). The dashboard preview column yields below
  `_dashColumnFits` without touching the saved choice (`_dashWantMode2`); the wall rail folds by
  the `.collapsed` CLASS (`toggleElevRail`), never an inline display, which the exports own.
  **19.20:** keys are tap-to-latch OR hold-while-used (`_touchKeyDown/Up`, `_touchHeld`); a
  touch on the controller is never "the second finger" (`_touchLive`). Row selection on the
  dashboard reads the CLICK, so `_touchClickMods` replaces the trusted click after a touch
  with one carrying latched keys (only while one is on). The joystick sends arrow keydowns
  and folds its undo entries to one per push (`_touchStickFoldHistory`, by identity). The
  dashboard table (`toggleDashTable`, read through `_dashTableFloor()`, never
  `DASH_TABLE_MIN_W` directly) and the elevation sidebar (`toggleElevSidebar`) fold by class;
  BOTH exports unfold the sidebar (`_elevSidebarUnfoldForExport`) so output never depends on
  it. Touch screens get the form as tabs (`_dashTabsInit`, `data-dtab` tags, sections stay put).
  **19.21:** a field marked `data-touch-nofocus` is never auto-focused on a touch screen
  (`_touchNoAutoFocus`, in `_modalOnOpen` and the frame browser): `_modalOnOpen` re-runs on
  every redraw and would raise the keyboard, or walk focus onto the next control, each time.
  `_elevApplyArtFile` is the ONE way a picture file reaches a wall frame (drop and the dock's
  `elevAddArtwork`). Home-screen app: `manifest.webmanifest` (relative start_url/scope: two
  sites, one tree), `icon-180.png`/`icon-512.png`; `_homeScreenTitle` names dev "FRAME dev".
  **19.22:** joystick rim arrows (`_touchArrowDown`) stop their touches so the knob never
  starts. Delete removes a selected dim via `_selDimDelete` = `{id, fn}` recorded by
  `buildDimControls` (keyed by id); frame Delete returns while a dim/line/group dim is selected.
- **AN EXPORT IS NEVER LAID OUT SMALLER THAN A DESKTOP (19.22, `_elevExportFloor`,
  `ELEV_EXPORT_MIN_WS_W/H` = 1494x1034, the workspace an export gets at 1920x1080).** Dim
  numbers and ticks are fixed print sizes, so a smaller drawn wall printed them bigger beside
  it (an iPad deck ~2x). Both exports raise the counter beside the sidebar unfold and lower it
  in the same `finally`; `drawElevAll` floors the measured workspace while it is > 0. A bigger
  screen is untouched (the designer's choice). On SCREEN the iPad still draws ticks relatively
  bigger (screen matches print by design); folding the panels brings it close to desktop.
- **THE LETTER LEGEND DEFAULTS TO 200pt (`IG_LEGEND_W_DEFAULT`)**, install and breaker pages.
- **iPHONE: PORTRAIT TO WORK, LANDSCAPE TO LOOK (19.23, `_phoneApply`, `_phoneBuild`).** A touch
  screen under `PHONE_MAX_W` (600) wide or `PHONE_MAX_H` (500) tall gets `html.phone` (+
  `html.phone-land` sideways); iPads never qualify. NO SECOND COPY OF ANY VIEW: it is CSS on
  those classes plus built elements (`#phoneTabBar`, `#phoneMoreBtn`, `#phoneDashBack`,
  `#phoneMetaToggle`, `#phoneDeckBar`, `#phoneRailClose`, the controller's fold via
  `_phonePadFold`, run from BOTH builders since their order differs). Items = list then
  detail (`_phoneDashDetail`; row fields take no taps in the list; a Shift/Ctrl tap stays on
  the list). Walls = chips / wall / tool strip / panel, every panel section `flex: none`
  (a flex:1 section collapses to nothing in a scrolling panel). Deck = page / `#phoneDeckBar`
  / tools, rail as an All pages sheet. Landscape hides menus on Walls and Deck only
  (`[data-phone-view]`, set by `_phoneSyncTabs`), never Items. `#appShell` is `100dvh` on a
  phone (100vh runs under Safari's toolbar) and carries the safe-area insets
  (`viewport-fit=cover`). Hooks: `_syncHeaderForView` -> `_phoneSyncTabs`, `_dsRenderCenter` ->
  `_phoneDeckBarSync`. A test harness that reloads a dirty page hangs on beforeunload.
  **19.24:** PINCH ZOOMS THE WALL (`_touchPinchBegin/Move/End`, two fingers both inside
  `#scrollArea`, elevation view): drives `elevZoomFactor` like the slider (0.5..3), anchored on
  the fingers via workspace scroll, listeners on both touched elements (frames are rebuilt
  mid-pinch); `html.touch #scrollArea { touch-action: none }` + Safari `gesturestart` held off
  so the app never zooms. The phone controller is the tab bar's Controls (`#phoneTabPad`,
  `_phonePadToggle`); NO floating fold button (it covered buttons). Deck header on a phone:
  `#phoneDeckMenuBtn` holds Generate PDF / Approval / Preflight. All pages sheet zooms each
  rail cell (`--rail-zoom`, `PHONE_RAIL_CELL_W`). Frame browser on a phone: `_fbPhoneChrome`
  (built in `_fbBuildTop`, which rebuilds the row) puts lists in a drawer and folds filters;
  3 across / 5 sideways. `#dsProjRight` (Project preview) is hidden on ANY touch screen.
  Viewport has `maximum-scale=1` (stops iOS zooming into small inputs on focus).
  **19.25:** the frame grid is built `FB_CHUNK` (120) cards at a time with an
  IntersectionObserver sentinel (`_fbRenderGrid`; no IO = all at once, which is what jsdom
  tests see); in-use codes are ONE set per render (`_fbUsedSet`). Phone swatch photos are
  absolutely pinned (Safari ignores % max-height in an aspect-ratio box: it showed a crop).
  On a phone the deck dock lives in `#phoneDeckTools` (both `_dsDockPlace` and `_dsDockSync`
  know it; it goes home when the phone class drops) and the page bar is ONE row above a
  page-sized `#dsCenter`. The tools panel's pinned header has class `.ds-tools-sticky`,
  unpinned on a phone.
- **OFFLINE: `sw.js` (19.26, registered by `_swRegister`, https/localhost only; `?nosw` removes
  it).** Navigation network-first (a release still arrives), versioned `?v=` files cache-first
  and a newer page's versions adopted with the old ones PRUNED (page and app stay a pair for
  `_checkBuildPairing`), everything else stale-while-revalidate capped at `RUNTIME_MAX`. Cache
  names carry the SCOPE (dev and stable share an origin). It reads the versions out of the
  page, so it needs no edit per release. Never caches POSTs or other sites (Google Fonts and
  cdnjs excepted). `test_offline_sw.js` runs it against a fake Cache Storage.
- **SWIPE TO FLIP (19.26, phone only, `_touchSwipeZone` / `_touchSwipeFlip`).** A touch on the
  BACKGROUND of a wall (`#wall`, `#export-wrap`, `#scrollArea`) or deck page (`#dsCenter`,
  `#dsLayoutCanvas`, a canvas) presses nothing until the first move: sideways = flip, else the
  ordinary gesture from the start point, no move = a tap. Never with a drag-drawing tool armed
  or on a floor plan page; an iPad keeps marquee.
- **NEW ITEMS FROM PHOTOS (`dashNewFromPhotos`, `_dashItemsFromFiles`).** Finds its new rows by a
  temporary marker stamped through `_fpAddCodes(..., {mark})`, NEVER by the returned code: the
  settle inside the add renumbers (a gap in the numbering made ART.10 into ART.3 before the
  picture loaded). The marker is deleted afterwards. Camera button `#phoneSnapBtn` on the phone
  Items list; Import menu everywhere.
- **A CORRECTED LIBRARY SWATCH NEEDS A LINE IN `LIB_SWATCH_REV` (19.27).** Picking a frame COPIES
  its swatch into the project, so replacing a library image changes nothing for pieces already
  in it. `_libSwatchUpgrade` (from the library load AND `_startScreenClose`, whichever is second)
  re-copies a listed code into rows (and wall copies) whose `swatchRev` is older; only library
  picks (`swatchName === fCode`), never an upload (`swatchCustom`, set by
  `loadDashCustomSwatch`). A swatch is the corner's FACE, a tall cut with cross-faded ends: a
  short slice tiles down the rail as a visible repeat (FA-BW74-2003 was 31px and read as dots).
- **THE PHONE HEADER'S MIDDLE IS THE VIEW'S CONTROL (19.28, `#phoneCtx`, `_phoneCtxSync`).** Walls:
  the wall name opening `openPhoneWallMenu` (the chip row is hidden on a phone); an item: the
  way back (`#phoneDashBack` hidden); Deck: the tab name, with `#phoneDeckMenuBtn` beside the
  more button holding Project / Pages / Templates + Generate PDF / Approval / Preflight (the
  deck's own tab row is hidden). Synced from `_phoneSyncTabs`, `_phoneDashDetail`, `_dsTab`.
  The item preview REDRAWS when the item screen opens (it was sized while hidden: cropped).
  Frame library vendors are an accordion, and an explicit open/close in `_fbOpenVendors` WINS
  over "the current list is open" (before, the vendor being viewed could never be closed).
- **EVERY EDGE IS PADDED BY ITS SAFE-AREA INSET (19.29).** `viewport-fit=cover` lets the page run
  under the iPhone status bar and home indicator. `#appShell` pads all four, `.frame-modal` pads
  all four (the phone frame browser card is 100%, not 100vw/100dvh), and any phone sheet pinned
  to the top adds `env(safe-area-inset-top)`. A new full-screen or top-pinned element must too.
  Chrome can test it: `Emulation.setSafeAreaInsetsOverride`.
- **PROJECT SALON HANGS ARE `asDrawn` PRESETS (19.30).** `SALON_PRESETS` also holds the Ford
  Engineering Lab V7 hangs (`fel-<area>-<no>`, `src`, `asDrawn: true`): the project's own gaps,
  any piece count up to the 12-letter cap. The 3"-gap and style-mix rules in `test_frame_sets`
  apply to the HOUSE presets only; asDrawn ones must start at 0,0, never overlap and keep 1"+
  gaps.
- **FRAME SETS ARE PICKED FROM PICTURES (19.31, `openFrameSetPicker`).** The floorplan item's
  frames button opens a `.frame-modal` of drawn tiles (`_frameSetThumbSVG`, to scale; frame ink
  from the moulding's catalogue colour via `_frameSetInk`, drawn at least ~1% of the drawing so
  long rows read): Sets / Salon hangs / Ford Engineering Lab. asDrawn preset frames carry `f`, a
  library code; `_fpApplyFrameSetNow` dresses each piece through `applySwatchToRow`
  (`_salonFrameDress`) from `_libSwatchMemo`, which the picker warms on open; anything late is
  dressed by `_salonFrameDressLater`, which RETAKES the top undo snapshot (one gesture, one entry).
- **THE PHONE DECK'S TABS ARE A STRIP ABOVE THE TAB BAR (19.32, `#phoneDeckTabs`, `PHONE_DECK_TABS`,
  `_phoneDeckTabsSync` from `_phoneCtxSync`).** Project / Pages / Templates + `#phoneDeckMenuBtn` (Generate PDF,
  Approval, Preflight; `data-menu-up` makes `_frameMenu` open upward). Portrait Deck only; `--phone-sub-h` adds
  its height to the shell's bottom padding. `#appShell` is PINNED (`position: fixed`, all four edges) on a phone:
  as 100dvh it came out a safe-area short of the fixed bars (dead band). Pinning surfaced the All pages X
  (`.phone-x` beat its `display:none`), now hidden unless `.phone-sheet-open`.
  **19.33:** the strip is ICONS (`PHONE_DECK_TABS` carry svg) plus `PHONE_DECK_TOOLS` (All pages, Preview,
  Preflight via `_phoneDeckToolRun`); the menu keeps Generate PDF + Approval only. The top row (`#phoneDeckBar`)
  NEVER SCROLLS: Preview/Preflight are hidden there, and `_dsSyncToolbar` sets `html.phone-ds-sel` so the
  selection group replaces the page arrows while something is selected.
  **19.34: A COLOUR AND A STRIP PER VIEW.** `--pv-deck/items/walls/ctl` (blue, pink, yellow, grey); `--pv` follows
  `data-phone-view` (and `data-phone-deck` inside Deck: Project grey, Pages blue, Templates purple) and paints
  the header line + title. All three strips are `.phone-substrip`, shown by ID per view: `#phoneItemsBar`
  (`PHONE_ITEMS_TOOLS`, calls the real toolbar functions; the `.dash-toolbar` row is hidden on a phone) and
  `#phoneWallsBar` (built from `.elev-cat-tabs`, buttons carry `data-elevtab` so `switchElevTab` lights them;
  the sidebar strip is hidden). `PHONE_DECK_TOOL_TABS` says which deck tab owns each tool; the others are
  `disabled` (a test harness must be on Pages before clicking Preflight / All pages).
  **19.35:** the open view's `.phone-tab` shares the strip's `--bg-subpanel` (one shape). Camera is `phoneItemPhoto`
  in the Items strip; NO floating buttons on a phone. The controller sets `--phone-pad-h` (`_phonePadSync`) and
  the shell's bottom padding includes it, so it takes room instead of covering. `#shortcutsBtn` hidden on a phone.
  **THE PHONE HAS ITS OWN TOUR (`FRAME_TOUR_PHONE`, picked by `_tourSteps()`)**: a phone hides most desktop tour
  targets. A new phone control worth showing gets a step there; Help's Start here has `On iPhone and iPad`.
- **A SAVED PROJECT KEEPS ITS FOOTER FIELDS AND DECK TICKS (19.30).** `globalMeta.docCode /
  docVersion / docLocation` carry the Project tab's code/version/location (they were never
  saved). `seedDeckIncludeInputs` / `seedDeckPlanOrderInput` must run AFTER the editorial is
  installed in every open path (`_readProjectText`, autosave restore, `_versionRestore`); they
  ran before it, against the previous project's editorial.

- **ONE BREAKER PER WALL (19.44, `_breakerWallShare`, `_breakerWallOf`).** Units whose wall
  (most members) is the same share one breaker: the FIRST in the shared `units` array earns it
  (stateless, like the catalogue mockup), `br.units` lists the peers, `_breakerNameFor` joins
  their codes (`ART.10AB / ART.11`), the key stays `elevgrp:<first unit key>`. Manual groups,
  catalogue units and skipped flat-only units take no part. Memo hangs off the function.
- **CODES THAT HANG AS ONE SET ARE SUGGESTED, NEVER REGROUPED (19.44).** `_codesSetSuggestions`
  (same wall, same prefix, every piece hung only there, edge gap <= `CODE_SET_GAP_IN` 12" in
  inches), shown in Preflight (warn, Make set / Keep apart / Wall) and on the wall
  (`#wallSetHint`, `_elevSetHintSync`, top of `initElevControls`). `_codesJoinSet` (no history;
  `_codesJoinSetNow` is the gesture) re-letters in code order via temp ids, then `_codesSettle`.
  Keep apart = `editorialContent.codeSetsApart` (row-id lists), kept current by `applyIdRename`.
  **A wall NAMED FOR EXACTLY ITS CODES follows them** (`_wallNamesFollowCodes`, wraps the
  renumber in `_codesSettle` and the join; `_wallCodeHead` parses `ART.8A / 8B / 9 | Loc`);
  any other name is never touched.
- **PREFLIGHT WEARS ITS RESULT (19.44, `_pfBadgeSchedule` / `_pfBadgePaint`, `PF_BADGE_BTNS`).**
  `data-pf` = err / warn / ok + `data-pf-n` count on every Preflight button; spelling never
  colours it. Re-run debounced off `scheduleAutosave`, only while the deck view is showing
  (stale otherwise, caught up by `_dsDockSync`); `_pfBadgeRunning` ignores the autosaves its own
  page-list build triggers. **Preflight must stay READ-ONLY** (it runs in the background now):
  `_dsSpellIgnoreList` no longer seeds `spellIgnore` (the guided tour test caught it).

- **THE SET-OUT IS PER WALL (19.45, `_elevHangOn`, `_elevWallClOn`, `_elevBlockCLs`).** The Hang / CL
  toggle stays deck-wide; `elev.hangGuide === false` drops hang line, AFF dim and target on that
  wall; `block.cl` draws `.ctx-cl-guide` (a `center-guide`, dashed, label `_elevBlockCLLabel` =
  "CL CREDENZA") in `#guide-layer`; the wall CL is on unless a block carries a CL, and
  `elev.wallCL` true/false overrides (stored only when it differs from that default). UI is the
  Guides tab's THIS WALL block (`#elevWallGuides`, `_elevWallGuidesSync`, top of
  `initElevControls`) and a CL button per context row. **The notes follow the wall:**
  `_installNoteLines(elev)`; the `aff` tick prints `_installNoteSetOut(elev)` (hang sentence, or
  "dimensions shown" when off, plus a line per block CL); `group` is dropped when hang is off.
  `elev` is threaded through `_installNoteFit` / `_installNoteBoxH` / `_drawInstallNoteBox` (an
  argument, never a module flag: the renderer awaits). No `elev` = the deck-wide panel list.
- **CANVAS ELEVATIONS DRAW CONTEXT BLOCKS (19.45, `_ctxDrawToCanvas`)**, after the frames (they
  occlude), art via `_ctxArtSvg` with `_ctxInkHex()` and explicit width/height, rasterised by
  `_loadImg`. That is the spec-page thumbnail path (`renderElevationToCanvas`).
- **GROUP A/B/C ART IS RIGHT-ANCHORED (19.45)**: the as-hung branch of `_drawSpecSetPageBody` puts
  the group's right edge on `regX + regW`, the elevation thumbnail's right edge.

- **A THUMBNAIL ROW FOLLOWS THE BOX, NEVER THE DRAWING (19.46).** The floorplan square and the
  frame strip take the elevation BOX's height: per-piece `_elevDrawn = {y: boxY0, h: boxH}` with
  the box from `_specThumbBox` (4:3 at the template width, bottom on the template line); group
  `_thumbBox.th = thH` (band height). A long wall draws shorter inside. `test_spec_thumb_size`.
- **THE ELEVATION THUMBNAIL IS AS TALL AS THE ROW (19.60, `_elevThumbFit`, `_elevFocusFrac`,
  `ELEV_THUMB_MAX_FRAC`).** Group and per-piece pages draw it at the row height (never fitted inside the box), as wide
  as its aspect makes it, up to 0.34 of the safe width (per piece also up to the DRAWN artwork, `_artLeftX`); wider
  is CROPPED around the page's pieces. `_drawGroupElevOutline` (now both pages', `opts` ink/lw/bbw) leaves the cut
  side open (wall fractions outside 0..1). The group band packs leftward off the wider box; the strip shrinks.
- **THE WALL IS ALWAYS IN THE CAPTURE CROP (19.46):** `boxes.wall` from `exportElevSVG`, first in
  `_CAP_BASE_BOXES`. The wall outline is an op with no guide, so a crop that only reached the
  wall through a spanning guide (the hang line) mis-scaled every hang-off wall.
- **Canvas context art is weighted for the PRINTED size** (`ctxLinePx = cw / 260` in
  `renderElevationToCanvas`), and loads through `_loadImgRaw` (`_loadImg`'s cache keys on
  length + tail, identical for every block SVG).

- **FREE LINES ARE `elev.marks` (19.47, `renderMarks`, `toggleMarkTool`, key L, `#markToolBtn`).**
  `{id, a, b, arrow: none|end|both, dash, label}`; ends are measure-tool anchors (`stripAnchor` /
  `resolveStoredAnchor`), so they follow frames and blocks and free ends are inches. Drawn in
  `#mark-layer` (a guide since 19.53, Free lines button): the stroke is a `data-svg-passthrough` `<svg>` (vector,
  angled), the LABEL is a plain text element (an svg `<text>` inside a passthrough is walked and
  prints twice). Hit stroke, end handles and the `.mark-pop` strip are `data-export-skip`.
  Registered in `annotationLayers`, the bounds list, `_CAP_BASE_BOXES` and `CAT_WALL_DEEP` (skipped on
  the layout hop like customLines). One line then back to Select, selected. Delete/Escape branches sit
  before the custom-line ones; the frame Delete returns while `selectedMark`.
- **KEEP CLEAR (19.47, `_ctxAvoid`, `_elevClashes`, `renderClashMarks`).** `b.avoid` boolean wins, else
  the preset's `avoid` (only the Keep clear library group): existing thermostats did not change.
  Hatch kind `'avoid'` in `_ctxFillOps` (the DOM fill the export reuses) and in `_ctxDrawToCanvas`.
  Clash marks are screen-only (`data-export-skip` + html2canvas-ignore); Preflight warns with a Wall
  button (`it.wall` without `it.set`).
- **NOTES FOR ONE PAGE LIVE ON THE WALL (19.47):** `elev.notesOff` ('std:key' / 'c:id') and
  `elev.wallNote`, read by `_installNoteLines(elev)`; panel `_dsPageNotesInto` (from
  `_dsInstallNotesInto`, wall = `elevations[desc._elevIdx]`). Both are EXCLUDED from
  `_elevCaptureSignature` (text beside the drawing must not recapture every wall).

- **LINE KINDS (19.48, `MARK_KINDS`, `markKind`, `openMarkKinds` flyout `#markKindList`).** `m.kind`:
  `line` (absent = line), `cl` (one x-anchor, full height, label CL at the top inside the wall),
  `clmid` (two x-anchors, CL at the midpoint), `level` (one y-anchor, full width). The non-line
  kinds store ONLY anchors; `_markEnds(m)` derives the ends from the wall every draw. One-axis
  snapping is `_markAxisAt` / `_markAxisTargets` (centres and edges of frames, blocks, wall;
  `MARK_SNAP_PX`, a centre wins a near tie). L arms the last kind; picking a kind always arms.
- **AN EXPORT-SKIPPED ELEMENT TAKES ITS SUBTREE WITH IT (19.48).** `exportElevSVG`'s `walk` skips
  `data-export-skip` children BEFORE `emitEl` and does not descend; emitEl alone skipped only
  the element, so a selected line's settings strip and the clash tag printed.

- **DECK STUDIO TABS ARE ICONS (19.49, `.frame-tab-icon`).** `dsTabBtnProject/Pages/Templates` and
  `dsToolsBtnPage/Templates/Layers` carry an svg (the `PHONE_DECK_TABS` glyphs, a page, layers) and
  their name as `title` + `aria-label`; code only toggles `.active`, never their text.
  **`#dsToolsPageBody` has NO top padding** (`padding:0 16px 16px` + a 16px `::before` spacer): the
  sticky `.ds-tools-sticky` pins at the scrollport edge, and a padded top let scrolled content show
  in the band above it.

- **THE RAIL'S PINNED BAR OUTRANKS THE RAIL (19.50, `#dsRailBar`, `RAIL_BAR_Z` = 20).** Cells' side
  + / - buttons are z 7; at z 5 they scrolled over the bar and took the rebuild button's click
  (added/removed pages). Every thumbnail box is `isolation:isolate` (and the selected-page mirror
  wrap too), so a preview's own high z (element pages' z 8000 overlay) stays inside it. Anything
  new in the rail stays below `RAIL_BAR_Z`; `test_rail_bar_on_top` renders the rail and checks.

- **PROJECT HANGS CARRY `proj` (19.51).** `asDrawn` presets are grouped into one picker section per
  `p.proj` (absent = 'Ford Engineering Lab', the original set); Ford Salt Lake City is `slc-*`, made
  from its install file (2 and 3 piece hangs too, incl. codes that hang together like 12 / 13 / 14).
  Tests filter the Engineering Lab ones as `asDrawn && !proj`.
- **NO CATEGORY READS AS A "?" (19.51, `.fp-cat-wrap` / `.fp-cat-q`).** The Items row's chip sits in a
  wrapper so a "?" can overlay it (pointer-events none); `FP_ITEM_COLS.cat` is 50 for the CATEGORY head.
  19.52: the chip is a `FP_CAT_CHIP` (22px) square, the height of the line / frames buttons, so the
  three share top and bottom and the row's 5px gap; it need not sit centred under its heading.

- **TWO GUIDE MASTERS (19.53): `toggleMyElevGuides` (`#myGuidesToggle`) and `toggleAllElevGuides`
  (`#allGuidesToggle`).** Turning guides off by EITHER remembers the state
  (`editorialContent.elevGuidesMine`, `_elevGuidesRemember`); My guides on puts that back through
  `_elevGuidesApply(st, true)` (the same apply the project-open restore uses, recorded); All on is
  every guide. Labels say the next action (`_elevGuidesMasterSync`, from every toggle).
  **19.54: "everything" is never remembered** (`_elevGuidesFromAll`, set AFTER All on's own set,
  cleared by any single-guide toggle and by My guides on), or All on then All off overwrote the
  selection with every guide.
  **Free lines are a guide now** (`mark-layer` in `_ELEV_GUIDE_LAYERS` + `#markLayerToggle`, in
  `_elevGuideVis`, NOT in `_CAP_BASE_BOXES`); the layer starts `display:block`, and arming the
  Lines tool shows it.

- **A FLOOR PLAN WALL LINE CAN BE MOVED (19.55, `_fpSelLine`, `_fpWallLinesPaint`, `_fpLineDragStart`,
  `_fpLineNudge`).** The plan's lines are painted by ONE function from `_fpLinePaintCtx` (svg, wrap,
  level, S), which is NOT gated on isConnected (the overlay is built before the page is attached;
  a gate drew nothing). With no tool armed it adds `[data-fp-hit]` click targets on the STORED
  segments (`_fpStoredSegs`; a diptych is one stored run) and, for the selected line, a highlight
  and `.fp-line-end` handles. Drags apply from the mousedown state (no drift), one undo; arrows go
  through a capture-phase keydown (floor plan page only), one undo per burst (`FP_LINE_NUDGE_MS`).
  The rail's selected-page mirror CLONES these (no listeners): a probe must query `#dsCenter`.
  The loupe draws `#dsFpLoupeMark` (the stroke as a square at the landing point, `_fpLineDrawW` x
  `FP_LOUPE_ZOOM`, and the line while drawing) and `#dsFpTip` (`_fpLineTipText`); hide both together.

- **A LAYOUT SWITCH KEEPS THE PREVIEWS (19.56).** `switchMode` must NOT call `_dsClearBuiltAll` (it wiped
  thumbnails AND the frame mockups: 16 to 23 s to come back to a layout). It parks the cache
  (`_dsParkThumbs` / `_dsUnparkThumbs`, `_dsThumbParked`, valid only while `_dsParkedGen === _dsEditGen`,
  gen set AFTER the switch's own push), clears only `_dsBuilt`. Thumbnail keys already carry layout + ticks.
- **THE PAGE RAIL REBUILD IS CHEAP ONLY IF NOTHING IS RE-PARSED (19.56).** Chrome loads a `data:` <img>
  synchronously on insert and parses markup character by character: cached thumbnails go through
  `_dsThumbImgInto` (one kept <img> per data URL, `_dsRailGen` guards a second use in one rebuild),
  markup previews (element pages, mocks) through `_dsHtmlInto` (kept by markup, swept when a rebuild
  did not use them) after `_dsThumbSlim` swaps photos over `DS_SLIM_MIN` for a `_imgDownsized` copy.
  Never `innerHTML = '<img src="' + dataUrl ...` in the rail or centre.
- **A PREVIEW TAKES THE CANVAS (19.56, `_docImgSrc(doc, cnv, mime, q)`)**: a `CanvasPdfRec` gets the canvas,
  jsPDF the encoded string (unchanged). Spec-page image sites go through it. `_loadImg` caches FILE
  paths in `_imgUrlCache` (not `blob:`), apart from the 40-entry data-URL cache.
- **A COLOUR INPUT ON THE DASHBOARD SYNCS LIVE (19.57, `syncDashAndCalculate({live:true})`, `_dashLiveFlush`,
  `DASH_LIVE_MS`).** A picker fires `input` every frame; a full sync rebuilds the item table (~120ms on 50 rows).
  Live writes the row + preview only; table, walls, warnings follow once after the colour settles, or at once on
  `change`. The pending pass tracks the ROW OBJECT, never the index; a full sync of another row flushes it first.
  A new continuous control on the form (colour, slider) takes the live form plus an `onchange` settle.
- **A PREVIEW DRAWS A FRAME AT THE SIZE IT IS SHOWN (19.58, `_specFrameDpi`, `_artSmall`).** The four spec-page
  mockup sites ask `_specFrameDpi(doc, dIn, boxW, boxH)`: a `CanvasPdfRec` (which carries `_pxPerPt`, set by both
  canvas renderers) gets the dpi its box needs plus `shadowScale` (= dpi / 96; `renderFrameToCanvas` scales every
  `_fxSh` blur and offset by it through `_fxShR`, so shadows keep their size in inches). Since 19.59 jsPDF too, at
  exactly what `_rasterFit` keeps (box x `_expR()` x 1.5); never above 96. Artwork for a
  reduced frame (and every elevation thumbnail) comes from `_artSmall` (cover-sized canvas, cached, original when
  not much bigger). A new spec-page mockup site must ask too (`test_layout_prebuild` counts four).
- **THE OTHER LAYOUTS BUILD WHILE YOU PAUSE (19.58, `_dsBgRun`, `_dsBgTpl`, `_dsBgStop`, `_dsParkPut`).** After
  `DS_IDLE_PREBUILD_MS` with an empty thumbnail queue, the other layouts' pages render into the PARKED set.
  `_dsBgTpl` is the layout being built and is read ONLY where the page list and the resolver read the layout
  (`_specTplResolve`, `specTplKey` in `_deckPageList`, the `_previewTpl` fallback); the project's specTemplate never
  changes. Anything stops it and clears `_dsBgTpl` first: capture-phase pointerdown/keydown/wheel/touchstart,
  `_thumbPump`, `_dsBuildAllThumbs`, `_dsRefresh`, `_deckPageList` (unless `_dsBgListing`), both canvas renderers
  (unless `bg`), `pushHistory`. A stopped render is discarded by token. Its list skips `_tocSyncAll`, its pages number
  from `_dsBgPages`, and its doc carries `_bgBuild` so `_noteStripFit` / `_noteTitleSlot` ignore it (pass `doc`).
  It NEVER captures a wall (34 walls = 99 s with 5.5 s freezes); uncaptured install pages render incomplete and are
  not kept. A NEW READ OF THE CURRENT LAYOUT in the render path must honour `_dsBgTpl` or the prebuild is wrong.
- **THE OFFLINE WORKER NEVER HOLDS A RESPONSE FOR ITS CACHE (19.59, `storeRuntime`, `TRIM_EVERY`).** A new
  library file is returned at once; the copy is stored behind it (`event.waitUntil`) and the runtime cache trimmed
  on the first new file and every `TRIM_EVERY` after, down to `RUNTIME_MAX - TRIM_EVERY`, one trim at a time. It used
  to await put + a full `keys()` trim per file, and a frame-browser scroll queued hundreds: picks hung 30 to 60 s.
- **THE FRAME INDEX IS BUILT ONCE PER LIBRARY STATE (19.59, `_fbMemoFresh`, `_fbLibSig`).** `_fbAll()` and
  `_fbByCode()` (no argument) return shared, read-only memos, rebuilt when `dashLocalLibrary` is replaced or its
  collection/frame counts change. Never sort or mutate what they return.
- **A FRAME PICK: ONLY THE LATEST LANDS (19.59, `_libPickSeq`, `LIB_PICK_SLOW_MS`).** `loadDashFromCustomLibrary`
  drops an answer that is not the latest pick (or arrives for another item) and toasts Loading frame past 0.8 s.
- **A SET'S FRAME FACTS APPLY BEFORE ITS PICTURE (19.59).** `applySwatchToRow(..., null)` writes code, width,
  colour, product (floater), inset, depth, rabbet and leaves the swatch fields; `_salonFrameDress` calls it for every
  pending row, so a floater is a floater while its swatch loads, and if it never does.
- **A SPEC THUMBNAIL FADES WHAT IS NOT ON THE PAGE (19.67).** `renderElevationToCanvas(elev, featured)` takes one row
  id (per-piece) or a LIST (group page: `members.map(m => m.id)`, both sites in `_drawSpecSetPageBody`); empty
  or null = every frame full. A split part's `members` are that part's, so the other half fades. Never pass
  null from a group page again (`test_elev_thumb_fade`).
- **DECK READ-THROUGH FIXES (19.68).** Install legend adds an `item` line (`IG_LEG_LABELS.item`,
  value = row id) when `_igLegNeedsItem`: a frame's letter is not its code's trailing letters, or a
  letterless code shares the wall; `_igLegItem` feeds BOTH `_igLegKeys` (reserved height) and
  `_legLines` (drawer). A one-member group page (`_loneLetter`: not a later split part, not manual)
  draws no letter on the art or in the IMAGE CODES lists (`_deckMockHTML` follows). A code under a
  frame goes through `_frameCodeSpan` (own frame + half the gap to same-baseline neighbours, inside
  the art region) and `_frameCodeFit` (keep size and right edge, slide, then shrink to
  `FRAME_CODE_FS_MIN`). A full-height CL (wall or block) is appended by `_elevAppendGuideAround`,
  split around `.ctx-label` text measured by a Range (`_elevLabelGapsAt`); the top run keeps the CL
  word, lower runs are shallow clones (pen/dash attributes kept so they print).
  **The wall capture draws frame rasters at the size it keeps** (`_capFrameDpi(dIn, pos, _capK)`, max
  `ELEV_FRAME_RASTER_DPI` 150, shadows scaled by dpi/150): 150 dpi + shrink was ~70% of an install
  export (279 s -> 67 s on Ford). `_capK` 0 (SVG download) keeps 150. `_imgDownsized` keeps PNG only
  when `_imageDataHasAlpha` says so.
- **WALLCOVERING COORDINATION (19.80).** SPACER is a mark kind (`kind:'spacer'`, `a` an edge point,
  `axis` the edge's fixed axis, `dir`, `size` INCHES, `len` off a point): geometry `_markSpacerGeo`, rect
  `_markRectOf` (box too). Anchors may be `ref:'mark', mid` (resolveAnchor / stripAnchor), so a measure line
  follows a spacer; spacer/box edges are in `anchorPointsForSnap`, `_elevSnapPoint`, `_markAxisTargets` and
  `_elevSnapTargets` (which skips a spacer hanging off the dragged piece, `_markOwner`). FLIP: a lift pin of
  +-2 (`setDimLiftSide`, `L.lblSide`) is the designer's side: beats `data-lift-force`, lifts a number that
  fits, keeps the label upright; `.dim-flip` / key F via `_selDimFlip`. Per wall `elev.gfxFade` (white wash
  over the graphic layer in DOM, `_gfxWashSvg`, canvas) and `elev.dimKnockout` (no chip; export cuts
  `<line>` strings under numbers with `_knockSplitLine`, screen masks lines in `_dimKnockoutScreen`).
  A point on the graphic is its own leader band in `renderCustomLines` (it was the whole wallcovering).
  SPLIT INSTALL PAGES: `cfg.parts` (Full width only, `_igPartsOf`), descs `_igPart/_igParts`, keys
  `spec:elev:<i>~n`, one `_ovKey`. Captured at `_elevCaptureZoom` x (drawElevAll's fit, `_elevCapTargetW`,
  key `_igCapKey(i, z)`, prime jobs `{idx, z}`), cut by `_capWindow` in gaps (`_igWindows`) at one scale (`envW`).
- **A MEASURE END ON A SPACER OR GUIDE BOX IS A POINT (19.81).** `frameBand` in `renderCustomLines` bands a `ref:'mark'` anchor (and a graphic point) as the clicked point, so its leader starts there; frames and context blocks keep their whole-edge band (no dashes beside a printed edge).
- **SPACER CALLOUTS AND PER-PAGE HIDES (19.82).** A measure line with ANY point end (`_customLinePointy`: mark ref or
  gfx) bands BOTH ends as their clicked points, frame and context ends included; frame to frame keeps the edge rule.
  `toggleSpacerDim` adds/removes a line with both ends on the spacer (found by its ends, `_markSpacerDims`, never an
  id); `deleteMark` takes it along. `IG_PAGE_HIDE` / `setIgPageHide` store `perPage[ovKey].hideGuides` (page only,
  `_igHideN`), passed to `_capView(cap, hide)` by the install renderer (person also drops `figure-dim-layer` and
  its crop box), in `_dsThumbCacheKey` as `|hg`; panel `_igPageHideInto` lists what the Elevations tab shows.
- **Measuring speed:** drive Chrome over CDP (`Profiler.start` around a click) against the real Ford project;
  self time in a big anonymous loop with cheap helpers means native DOM work (parsing, sync image loads).

## Design principles used here
- Prefer dynamic behaviour over manual controls: if a layout element won't fit, drop
  it automatically rather than exposing a control that can produce broken output.
- Gear popups are the home for settings; don't duplicate them in the toolbar row.
- A control that can't update live should be removed, not left non-functional.

## Known open items
- **Deliberately not built (18.08 review), reopen only with a concrete page that prints
  badly:** right-hand install notes now move the drawing without shrinking it, and
  auto-shrinking note type would fight the hand-set `noteW`/`noteFs` and `_igColW` budget.
  - The install-notes column nudges the elevation left rather than shrinking its type.
    Blocker: `_installNoteColW` is measured at the top of `_drawInstallGuidePage`, before
    the capture exists. Fixing means drawing notes after the capture and covering all three
    early returns (the `_drawSpecSetPage` footer trap), with a check that every exit draws
    them.
  - The letter legend could scale its own type down (draws at `M`, width `legendW`,
    default 150 on breakers). Same restructure.
- **`app.js` is ~3.1 MB.** Steps (1) and (2) of the old plan are done differently: the
  template constant is `templates.js` (18.33), photos still embedded (moving them to
  `assets/` would put URLs into projects). What's left is (3): split `app.js` by area
  into several scripts loaded in order, safe because everything shares one global scope.
