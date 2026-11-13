# FRAME: project notes for Claude Code

Browser-based presentation builder for art consulting (Farmboy Fine Arts).
Replaces manual InDesign work: wall elevations, artwork spec pages, client PDFs.

This file is the condensed rulebook: ground rules, testing, and the rules nearly every task
needs. The rules for each area of the app are in `docs/claude/` (index below): **read the
file for the area you are about to change before changing it.** The long-form history is in
`docs/claude-notes-archive.md` (as of 18.34, not maintained). Add a new rule to the topic
file it belongs to; only a rule that applies across the whole app goes here. Keep it short:
the rule, the names, the trap, one clause of why.

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
## Rules every task needs
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
- **ITEM CODES ARE IN NUMBER ORDER EVERYWHERE, AND IT IS NOT A SETTING** (house codes close gaps on their own;
  pattern codes keep them and the gesture asks, see `docs/claude/codes-and-plans.md`). Never add a
  toggle. Enforced on the DATA (`dashProjectData` stored order): `_codesSortRows()` (type
  order ART, EGD, WF from `_codePrefixOrder`, then number, then piece letter) and
  `_codesSortWalls()` (by lowest code on the wall; blank walls last).
  **Four gestures, one rule each.** `_codesSettle()` after add/delete/recode;
  `_codesAdoptRowOrder()` after a user reorder (renumbers); `_codesMovePlacement` /
  `_codesMoveBeside` for the Items drag; `_codesRenameRow` for a typed code (number is a
  position, new prefix recodes via `_recodeForCategory`, letter change renames one piece,
  number change on one piece moves the set). None push history; the caller does.
  **A NEW CODE COPIES THE PROJECT'S STYLE (20.05, `_codeNumsFor` returns `sep` + `width`)**: the separator and zero
  padding most codes of that prefix use (ties to '.'), the number counted across every style. ART-01 projects mint
  ART-05, never ART.3.
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
- **GREP THE IDENTIFIER BEFORE TRUSTING A PARSE.** `_igElevIdx` never existed; a call
  passed `node --check` and broke render. `test_no_undefined_helpers` checks CALLS, not
  bare identifiers. A patch script that aborts mid-way writes NOTHING, so re-check anchors
  after any failed patch.
- **`_rowOpeningAndPrint(row)` is the single definition of opening + print-file size**, used
  by `updateTableRowCalcs`, `updateDashVisualsFromDOM`, `renderDashTable`,
  `buildDashCSVString` and `buildSpecStrings`. Clamp a negative opening BEFORE adding bleed.
  Takes a plain object (DOM caller passes assembled form values); converts nothing. A new
  product needs one clause here.
  A new spec **label** must be registered in `SPEC_ROW_GROUPS` *and* the **five** hardcoded
  allowlists (2 group-page PDF renderers + 3 `_deckMockHTML` previews) or that layout drops
  the row silently. Renaming one is the same job.
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
- **HELP IS `HELP_REFERENCE_DATA`.** `test_help_and_steps.js` fails if Help names a control
  label not in index.html/app.js, lists an unbound shortcut, uses an em dash, or What's New
  omits `APP_VERSION`. Bodies are **template literals**: no backtick or dollar brace inside.
  `live` entries (`'steps'`) are built by `_helpLiveEntry`. Help opens on Reference; the
  Video tab is hidden until `setHelpVideoUrl`.
- **`CanvasPdfRec` is a SECOND renderer with the jsPDF API** (Deck Studio centre and rail
  thumbnails via `renderDeckPageCanvas` / `renderSpecPageCanvas`). Any `doc.*` feature must
  be implemented in both or the preview silently disagrees (`_drawElevAnnOps` wraps calls in
  `try/catch`, so a missing method fails silently). `render()` must READ every recorded
  option (e.g. `opts.angle`, drawn via `x.rotate(-ang)` at the translated origin).
  Measurement is deliberately not shared (each engine measures what it draws); a 90° label's
  `x` must match across both (`test_canvas_preview_rotation.js`). Check the
  `CanvasPdfRec.prototype` list before adding a `doc.*` call.
- **Measuring speed:** drive Chrome over CDP (`Profiler.start` around a click) against the real Ford project;
  self time in a big anonymous loop with cheap helpers means native DOM work (parsing, sync image loads).

## Area rules (read the one for your task)
- `docs/claude/codes-and-plans.md`: item codes and renumbering, code patterns and sectors,
  placements, plan pins and wall lines, plan and page order, the floorplan Items panel.
- `docs/claude/catalogue.md`: catalogue mockups, arrangements, options, frame sets, their pages.
- `docs/claude/elevations.md`: the Elevations view: walls, glazing, flat graphics (EGD/WF),
  context blocks and underlays, dimensions, guides, marks, shadows, wall captures for pages.
- `docs/claude/deck-pages.md`: Deck Studio pages and drawing: the page list and dispatch,
  spec / group / install / breaker / contents pages, titles, thumbnails, the rail, PDF output.
- `docs/claude/ui-and-styling.md`: dialogs, toasts, colour tokens, tabs, ladders, theme,
  docks, start screen and tour, touch and iPhone.
- `docs/claude/project-data.md`: save/open, autosave, undo, the image pool, units and
  rounding, frame effects, the frame library and swatches, the offline worker.
- `docs/claude/production.md`: Production, pricing, RFQ/RFI/Salesforce sheets, samples,
  labels, shipping, brand standards, IFS and Preflight checks, the driver and FRAME_API.

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
