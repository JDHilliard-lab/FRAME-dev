# FRAME — project notes for Claude Code

Browser-based presentation builder for art consulting (Farmboy Fine Arts).
Replaces manual InDesign work: wall elevations, artwork spec pages, client PDFs.

## Stack / ground rules
- **Vanilla JS only.** One large `app.js` (~27k lines) + `index.html`. No frameworks,
  no build step, no bundler, no JSX, no Tailwind. Everything shares one global scope.
- Vendored libs: `lib-jspdf.min.js` (UMD), `lib-jszip.min.js`.
- **TWO SITES, ONE TREE.** Dev is `jdhilliard-lab.github.io/FRAME-dev` (repo `FRAME-dev`,
  remote `origin`); stable is `jdhilliard-lab.github.io/FRAME` (repo `FRAME`, remote
  `stable`). They run **byte-identical files**: `APP_BUILD` is *derived from the URL*,
  never hand-edited, so a release is a push with nothing to remember to flip. A line that
  must differ between the two repos forever is the line that eventually gets promoted by
  mistake, putting a green "production" dot on the dev build. An unrecognised location
  (`file://`, localhost, a test harness) reads as **dev**, because the safe error is
  calling a build unreleased rather than calling a working copy live.
  Promote with `node tools/promote.js` (dry run) then `--push`. It gates on a clean
  working tree, dev already pushed to origin, ALL GREEN, and `style.css?v=` matching
  `APP_VERSION`; then it writes ONE snapshot commit (`git commit-tree`) of the dev tree
  onto the stable history. Deliberately **not a merge** — the histories diverged long ago
  and nobody wants fifteen dev commits in a release log — and **not a force-push**, because
  the one thing a stable site owes you is the ability to revert.
  `APP_VERSION` drives the version pill; bump it on every change so it's obvious in the
  browser which build is loaded. **And add a line for it to Help's What's New**
  (`HELP_REFERENCE_DATA`, section `version`): `test_help_and_steps.js` fails while What's
  New does not mention the current `APP_VERSION`. That is deliberate. Nothing forced it
  before, which is how Help sat at v1.1 while the app reached 17.82.
- **THREE THINGS IN `index.html` CARRY `<APP_VERSION>` AND ALL THREE MUST MATCH IT**:
  `style.css?v=`, `app.js?v=`, and `window.FRAME_HTML_VERSION`. Pinned by
  `test_build_version_pin.js` and `test_dash_visible_and_tick_clearance.js`, and gated
  again by `tools/promote.js`, so a forgotten bump fails the suite and cannot ship.
  Unversioned, a browser serves a cached stylesheet next to a fresh `app.js`: the
  version pill reads new, the exports are new, and anything needing a new CSS rule
  is silently *absent*. That's how the gradient dashes vanished on screen while
  still exporting correctly.
  **The REVERSE was unguarded until 17.80 and is the worse direction.** `app.js` had no
  query at all, so a browser could serve fresh HTML and fresh CSS against a CACHED
  `app.js` - and the version pill is read *out of* `app.js`, so the one indicator a
  designer would check agrees with itself and is wrong.
  **The query string alone cannot fix a browser that already holds a mismatched pair**,
  because the URL in the cached HTML is the old one. So `index.html` also stamps the
  version it was built against and `_checkBuildPairing()` compares the two at boot,
  from the two files themselves. It must be stamped BEFORE the `<script>` tag or it
  reads `undefined`, and it is wired into BOTH boot branches. Deliberately not fatal:
  the app mostly works, and telling someone their tab is stale beats refusing to open
  a project. A page with no stamp (a test harness, an older build) is left alone.
- **No em dashes in written output.** Casual, direct tone.

## Testing — do this every time
```
node tests/run-all.js        # must print ALL GREEN before anything ships
```
159 files, 2184 checks. Add a new `tests/test_<topic>.js` for every fix; each should
reproduce the actual reported bug, not just assert the new code exists. If a test
fails because behaviour intentionally changed, update the test and say so explicitly —
never delete a check to make the suite pass.

**EVERY BACKSLASH IN A TEST BLOCK IS DOUBLED.** The checks live inside a template
literal, so `\s` reaches the parser as a bare `s` and `\(` as `(`. A regex written
the normal way therefore either matches the wrong thing silently (`/[L\s]+/` becomes
`/[Ls]+/` and stops splitting on spaces) or throws "Unterminated group" at load. Same for
`\${`, which the outer literal will otherwise interpolate. Prefer `indexOf` and
`split().length` over a regex in these files; reach for a regex only when you need one,
and double every escape when you do. This has cost time six times in one session.

**`node --check` CANNOT SEE A CALL TO A FUNCTION THAT DOES NOT EXIST.** 17.68 shipped
`_round2(...)` in the breaker page's letter legend; the identifier had never existed,
because a rename inside the edit that introduced it silently failed to apply. The file
parsed, the whole suite went green, and the page threw a ReferenceError the first time
it was opened. That is the third trap in this family after the blanket rename that
rewrote a declaration into a self-call and the landmark slice that deleted
`_dsPinChrome`: **a parse is not a load, and a load is not a render.**
`test_no_undefined_helpers.js` now asserts every bare `_helper()` call resolves to a
declaration. It scans the RAW source: stripping comments first looked obviously right,
removed three false positives and FORTY-FOUR real declarations, because app.js carries
`/*` inside string literals and a naive block-comment strip swallows everything to the
next `*/`. Four names are allowlisted instead - `_` and `_r` are groups inside
`_parseFrameFile`'s regex literal, `_img` and `_igCaptureUsed` appear in prose.

**A STUB THAT SWALLOWS ITS ARGUMENTS PROVES NOTHING.** 17.71 gave the installation note
an ink and read the colour as an ARRAY - but `_annHexToRgb` returns `{r, g, b}`, so
`setTextColor` was handed `undefined` three times and the note printed in nothing at
all, on screen and in the PDF. It survived FOUR rounds of debugging because every probe
and every harness stubbed `setTextColor` as a no-op: a stub that ignores its arguments
cannot notice it was passed rubbish, and the recorded `text()` calls looked perfect.
The check that catches it VALIDATES instead of recording - it fails the test if any
colour channel is not a finite number - and it was confirmed by putting the bug back and
watching it fail. Same family as the `_round2` ReferenceError: **a parse is not a load, a
load is not a render, and a recording stub is not a renderer.**
Two other lessons from the same bug. `_annHexToRgb` returns an OBJECT; anything reading
`[0]/[1]/[2]` off it is silently broken. And `FRAME_TEXT_INKS` leads with `#ffffff`
because type on a dark page needs it, which makes it the wrong palette for anything
printing on a white sheet - the note picker uses `FRAME_NOTE_INKS`, the same ramp without
white, and `_installNoteInk` falls a too-pale stored value back to the default rather
than printing invisibly. The same reasoning `FRAME_GREY_RAMP` already carries.

**Anchor a source-level check on the code it is about, not a character distance from
it.** A window like `S.slice(i, i + 1600)` reads as the code having been deleted the
moment the function grows past it, and several checks here compare TWO landmarks while
only guaranteeing they have read far enough for one. Slice between landmarks
(`S.slice(start, S.indexOf(nextFunction))`) instead.

A test that needs to `await` mid-way must keep its checks in the **same
`window.eval`** as `app.js`: an indirect eval puts its top-level `const`/`let` in a
scope of its own, so a second `window.eval` sees the `function`s but not
`SPEC_TEMPLATES`, `editorialContent` or `dashDefaultData`. Wrap the whole thing in
one `async` IIFE assigned to a `window.__…` promise and await that from Node.

## Architecture anchors (hard-won; don't rediscover)
- `FRAME_FONT_LIBRARY` is the **only** font list. Every picker (Deck Studio type
  menu, gear popups, layout toolbar, Elevations Settings) is built by
  `_fillFontSelect()`; static ones in `index.html` are marked
  `data-font-select` and filled by `_initFontSelects()` on boot. Two groups:
  *Brand* (`display`=Druk, `sans`=Sans, `serif`=Messina — embedded in the PDF)
  and *Universal* (Arial, Helvetica, Segoe UI, Verdana, Tahoma, Courier New).
  Tokens are the persisted values. `_fontCss()` = browser stack, `_font()` =
  jsPDF name, `_pdfFontStyle()` = bold only for Druk, `_fontToken()` migrates
  the raw CSS stacks the Elevations panel used to store. Brand `sans` must keep
  a stack distinct from universal Arial/Helvetica or that migration is
  ambiguous.
- `FRAME_SWATCH_FAMILIES` / `_frameSwatchesInto()` is the shared colour
  quick-pick, used by the Deck Studio popups and the Elevations Settings modal.
  `opts.families` swaps the palette without forking the renderer —
  `FRAME_GREY_RAMP` (black→light grey, no hues, **no pure white**: a white figure
  is invisible) drives the Scale Figure shade strip that replaced its dropdown.
  A shade IS a grey, because the figure is painted by `brightness(0) invert(n)`;
  `_shadeToHex`/`_hexToShade` convert, so there's no second table of values, and
  `_personShadeNearestHex()` rings the closest dot so a project carrying an old
  dropdown value (0.3/0.68/0.82) doesn't look like nothing is selected.
  `_personShadeFilter()` is the one filter expression, used by the wall figure AND
  the Settings preview, so the panel can't show something the drawing won't.
- The **scale-figure height dimension** (`dimVisibility.figureHeight`, off by
  default, `renderFigureHeightDim`) measures the character floor-to-crown using the
  same parts as every other dimension: shared line segments, `annotationStyle`
  colour/weight/dash, the Line Ends setting, `buildDimControls`' chevrons, and a
  dashed leader from the crown to the line. A standalone caption was built first and
  withdrawn — consistency with the rest of the sheet was the point.
  `ELEV_PERSON_HEIGHT_IN` is the one height: the figure is drawn at it and the
  number reads it. The number goes through `elevFmtU` like every other *interior*
  dim (so it follows both dual units and the suffix toggle) — unlike AFF, which
  keeps its mark regardless.
  It lives in its **own layer above the dim layers**, NOT inside `#person-wrap`:
  that element is position + z-index, so it opens a stacking context its children
  can never escape, and another dim would cross it on screen while the PDF drew it
  on top (the SVG's text group is emitted last). Register a new layer in **both**
  export lists — `annotationLayers` and the artboard-bounds list — or it's on screen
  and missing from the PDF, or cropped at the edge.
  `personPos.dimOff` is a **fraction of the figure's width** either side of centre
  (clamped ±1 by `ELEV_FIG_DIM_RANGE`), so a unit change can't move the line;
  `dimLblOff` slides the number. `ELEV_FIG_DIM_DEFAULT` is −0.5, the **left edge of
  the figure's box** — off the silhouette, and deliberately the box edge rather than
  a value tuned to hug the current character, because the art carries its own
  padding and any tighter number would be wrong for the next figure. The leader
  length IS the offset, so it correctly vanishes when the line runs down the middle
  and there is nothing to connect.
- **`buildDimControls({rotateLabel: true})` unblocks rotated vertical dim numbers.**
  The four chevrons are appended to the LABEL, so rotating the label rotated them
  too and up/down became left/right — the reason only the outer wall dims were
  rotated. With the flag they hang off an **unrotated stand-in box** placed over the
  label and sized to its on-screen footprint (a 90° turn swaps offsetWidth and
  offsetHeight), which is the `.hang-dim-num` trick generalised. It also skips the
  segment bias, because an absolutely-positioned label is out of the flex flow and
  biasing would only open an empty gap — the line runs continuous behind the chip,
  as the wall dims already look. **And it must not force `position: relative`** on
  the label, which is right for an upright one in the flex flow but drops a rotated
  one back into it, where `.arch-label-rot`'s `top: 50%` stops meaning "centred on
  the line" and starts meaning "half its own height below wherever the flow put
  it" — the number hangs off the bottom of the line and out to one side while the
  chevrons, on their own box, stay correctly at mid-line. The spacing/custom
  vertical dims could now adopt this; only the figure dim uses it so far.
- **All sliders are one global `input[type=range]` rule** in style.css — a thin 2px
  track with an 11px dot, no opt-in class, because a class gets forgotten on the
  next slider and then two looks coexist. WebKit and Gecko expose different
  track/thumb pseudo-elements and **neither inherits the other's**, so every rule
  is written twice or one engine silently keeps the chunky native control. The
  WebKit thumb needs `margin-top: (track - thumb) / 2` or it hangs below the line.
- `annotationStyle.font` and `imageCodeStyle.fontToken` hold library tokens;
  `annotationStyle.fontFamily` and `imageCodeStyle.font` are **derived** CSS
  stacks that `_normalizeAnnotationStyle()` / `_normalizeImageCodeStyle()` keep
  in sync — every renderer reads the derived field, so don't set it by hand.
  Studio defaults: dims = Messina (size/colour stay the user's call);
  captions and image codes = Messina 9pt `#9c9c9c`, matching
  `_specCodeStyle()`.
- `computeArtDrawRect` is the **single source of truth** for artwork crop/fit across
  all five render paths (dashboard preview, elevation DOM, canvas/PNG, SVG, PDF).
- **The product-type model.** `FRAME_PRODUCTS` (app.js) and the `<select id="m_product">`
  options in index.html are two hand-synced lists — update both. The enum is branched on
  at ~20 sites whose local names already disagree (`isC`/`isCanvas`/`isFloater`,
  `isFL`/`isFrameless`/`iFL`), so a new product added to some of them looks right in one
  place and wrong in another.
  **`"Sourced Object"` is not a precedent** — it's in the enum and in `buildPngFilename`
  but has **no branch anywhere**, so it silently renders and specs as Framed Art. The
  help text claimed otherwise for a long time; it now says what's true.
  **Flat graphics** (`FLAT_GRAPHIC_PRODUCTS` + `_isFlatGraphic()`) are wallcovering (EGD)
  and window film (WF): the overall size **is** the graphic — no moulding, mat, glass,
  rabbet or stretcher bar, and **no drop shadow**, because they sit flush rather than
  hanging off the wall. One predicate rather than a flag per product, so the next flat
  product (ART-1 Backlit Image is the obvious one) is an array entry, not twenty edits.
  Their only extra field is `material` (free text — the wording is the vendor's).
  Placement needed **no new code**: a placed item is an `elev.frames` entry with
  `w/h/x/y` and `makeElevDraggable` is product-agnostic. If you find yourself adding a
  product branch to the drag handler, something is wrong.
  Two traps when adding a no-frame product:
  the `isFrameless` branch of `renderFrameToCanvas` **ignores `opts.artworkImg` and
  `opts.wireframe`** (it punches a transparent hole and leaves compositing to the
  caller), so copying it verbatim gives an invisible graphic on the wall and no
  wireframe block; and the flat branch must sit **before** it, or the frame geometry
  below runs first.
  **Placement does NOT auto-fill a flat graphic** — `_shouldAutoFitFlat` gates both
  placement paths (Push to Wall and Add & Arrange bulk import, which each had their
  own copy). It fills only when the wall is in **EGD wall mode** AND the product is
  **Wallcovering**. Unconditional filling was destructive, not just surprising:
  `fitFlatGraphicToWall` rewrites `row.extW`/`row.extH` as well as the frame, so a
  size typed in the dashboard was replaced by the wall size with nothing left to
  restore it from — reported as "my WF resets out of nowhere to 400x104" (the wall,
  less its baseboard). Window film is sized to the GLASS, never the wall (WF-3 is
  `TBD x 14"H`, WF-4/WF-5 are privacy bands), so it is never auto-filled even in EGD
  wall mode. The **Fit to wall button is deliberately ungated**: asked for
  explicitly, it still fills. A flat graphic that is not filled must advance `startX`
  in the bulk importer like any other item, or two of them stack at x=0.
  Their bleed is `FLAT_GRAPHIC_BLEED_IN` = **2"**, seeded on product change but never
  over a value the user typed. `FLAT_GRAPHIC_APPLICATION` is both the Application row's
  text and the substrate seeded into the form — on a flat sheet Application **is** the
  material ("Vinyl Wallcovering"), which is why there's no separate Material row.
- **The flat-graphic sheet is `egdDetail`, and it is RESOLVED, not chosen.**
  `_specTplResolve` returns it for any flat-graphic row **ahead of everything, including
  the group template**. It was first placed *behind* the group check, on the reasoning
  that a group template changes page count and must win — that reasoning was about count
  and ignored the consequence: in Group A/B/C mode a wallcovering went through
  `_drawSpecSetPageBody` and drew as a set member, with a letter, a frame mockup of a
  240" wall and unstyled spec text. A correct page count with a broken page on it is not
  the better trade. `_splitFlatUnits` in `_deckPageList` keeps the count right instead:
  it pulls flat graphics out of group units onto their own sheets and leaves any framed
  members their group page (same key, so per-page settings and approval stay attached).
  It returns null when nothing is flat, so the common path is untouched. A **manual**
  group is deliberately left alone — that grouping is the user's explicit instruction. It's excluded
  from the picker grid by `!SPEC_TEMPLATES[k].flat` for the same reason. `flat: true` is
  the marker; it also carries `custom: true` (no coordinate map), so its branch must sit
  **before** the generic template branch in both dispatchers or it renders as a
  frameRight fallback with a frame mockup on it.
  The sheet is Application + Art Type + Overall Dimensions only. **Image Size and Mount
  are computed but not printed** — the 2" bleed is production data, and putting 169.375"
  on a client sheet invites ordering that much wall. Both still reach the CSV.
  Layout: title + spec top-left, floorplan bottom-left, elevation anchored
  **bottom-right** and scaled up. Its left edge is `M + colW + gutter`, derived from the
  same `colW` the spec rows use, so widening that column moves the drawing instead of
  sliding it under the text; its top clears the title band so a long heading can't
  overlap it.
  **`_captureElevWithGuides` SPLITS its output** and this sheet shipped without
  dimensions because of it: `cap.dataUrl` is picSvg (frames, artwork, figure) while
  `cap.vec` is annSvg — wall dims, character dim, AFF callout, **baseboard** — which has
  to be replayed with `_drawElevAnnOps(doc, cap.vec, <same rect as the image>)`. Draw
  only the image and you get a measured wall with no measurements, and `_drawElevAnnOps`
  is wrapped in try/catch so a wrong rect fails **silently**.
  `_igElevCapture(elevIdx)` is the ONE cache/retry/suppressor path, shared by this sheet
  and `_drawInstallGuidePage`. Don't call `_captureElevWithGuides` from a page renderer.
- **Window panels (glazing) are `elev.glazing`, an ARRAY of runs**, each
  `{x, y, h, panels:[…]}` in `elevUnit`, `x`/`y` bottom-left like a frame. Window film
  goes onto glass divided by mullions, and a graphic is fitted so no element lands on a
  seam. Widths are an **array**, never `{count, equal}`: unequal is the general case and
  equal is only a shortcut, so a count-based model has to be rebuilt the moment one
  panel differs. An array of *runs* because one wall can carry a full-height WF-1 on one
  window and a WF-4 privacy band on another.
  **A run's total width is DERIVED (`_glazingRunWidth`) and never stored**, so the two
  can't drift. The Width field is therefore an *operation*: `_gzSetTotal` rescales the
  panels proportionally, which keeps an equal division equal and a 2:1 division 2:1, and
  the panel count rescales for the same reason — count answers "how is this glass
  divided", not "how much glass is there". Editing ONE panel width is the deliberate
  exception that does move the total: a measured panel width is a fact. `_gzSetTotal`
  absorbs the rounding **residual on the last panel** — 610/3 is 203.3333, which re-sums
  to 609.9999, a hairline gap at the wall edge and three dims reading a repeating
  decimal. `equalizeGlazingPanels` **delegates** to that same branch rather than
  dividing locally, or Equal is where the residual comes back.
  `_glazingSeams` returns the **internal** mullions only — the outer edges duplicate the
  wall/frame snap targets, and two identical candidates make the nearest-target search
  pick arbitrarily. `_scaleElevGlazing` converts `x`/`y`/`h` **and the panels array** on
  project load and unit toggle: the array is exactly what the hand-maintained allowlists
  skip, and a run left in inches on a cm project draws mullions in the wrong *places*,
  which silently moves where a graphic gets cut.
  `#glazing-layer` sits **above** `#frame-layer` (z 7 vs 6) and is in `annotationLayers`.
  Above, deliberately: seeing where a seam falls across the artwork is the whole point,
  and the export writes annotation layers over the rasterised art, so putting mullions
  underneath on screen would show one thing in the editor and another in the PDF.
  `renderGlazingRuns` must run **after** `drawElevTargetedSpacing()`, which clears
  `#dim-layer` — it silently wiped every panel dim while leaving the mullions visible.
  Panels are **lettered** (`_glazingPanelLabel` = `getElevLetter`, so a 27th is AA) and
  the same letter appears in three places: a chip tag in the pane, the editor field, and
  the print-schedule row. Frame letters collide by design — a wall can carry a piece B
  and a panel B — so this is handled by **qualifying, not renaming**: the pane tag is a
  small chip in the dimension ink (a frame letter is a large grey glyph on the artwork),
  and anywhere the string could be mistaken for a piece — the CSV, a print filename — it
  carries its item code, `WF-1.B`. A **clipped** schedule keeps the WALL letter;
  renumbering from 1 would point the second file at the first pane.
  A multi-panel run also dimensions its **overall** glass W and H, through `elevFmtU` and
  never `_spacingLabel`: an overall must not print EQ, which is a claim about a repeated
  gap, not about the size of an opening. Skipped on a single lite, where the panel dim
  already IS the overall.
  `_updatePrintOutputHint` is the live line under the Print Output control. Panels belong
  to the WINDOW, so they're defined on the elevation, and Split on a wall with no run
  otherwise yields an empty schedule with nothing to say why — `_glazingScheduleForFrame`
  failing quiet is right for a renderer and wrong for the control that turns it on.
  The panel tags are the reason `test_wf_glazing_panels`' `data-svg-pen` rule reads
  "every **stroke** in `#glazing-layer`" rather than every child: `emitEl` routes an
  element with direct text down its text path, where a pen weight means nothing.
  `renderGlazingControls()` (the sidebar editor, `<details id="sec-glazing">`) is called
  from the **top** of `initElevControls`, ahead of its no-frames early return: glass is
  independent of frames and a window-film-only wall has none, so a call after that return
  leaves the panel unreachable on exactly the wall that needs it. `<details>` and not
  `toggleDashSection`, which rewrites the label span with a chevron.
- **`printOutput` (`'full'|'panels'`) is per ROW and WINDOW FILM only.** Split mode means
  one Illustrator artboard per glazing panel; the lap is **not a new rule**, an artboard
  is panel + bleed on every edge exactly as `_rowOpeningAndPrint` does for a whole
  graphic, so neighbours overlap by 2x bleed and a 2" bleed means the same thing
  everywhere (a test pins that a one-panel split equals the full-file numbers byte for
  byte). WF-only is enforced in the **data** as well as the UI — hiding
  `#printOutputRow` isn't enough, a bulk edit or an imported row could otherwise leave a
  wallcovering in a mode whose schedule has nothing to read. Wallcovering hangs in drops,
  a different subdivision this doesn't model. New field, so it needs
  `dashDefaultData`, the `dashHtIn` field map **and** `syncDashAndCalculate` or a
  keystroke wipes it; it is deliberately **not** carried onto elevation frames, because
  that's two duplicated constructors plus `pushUpdatesToElevations`, so
  `_glazingScheduleForFrame` takes the mode as an argument instead.
  `_glazingPanelPrints(run, bleed, h, range)` **clips to the graphic's span**: a graphic
  over panels 2-3 of a four-panel run is two files, not four, and the other two would
  print blank. The lap is a property of a **shared edge**, so it's set from position in
  the *emitted* list, not the panel's index in the run — otherwise a clipped graphic's
  first file carries a lap on its outside and the installer is told to trim art that was
  never printed. `_glazingRunForFrame` picks by **greatest overlap**, so a hairline past
  a mullion can't re-home the graphic to the other window.
  `_drawGlazingSchedule` prints it on the flat-graphic sheet in the **same unit
  convention as the spec rows above it** (inches first under dual units) — two
  conventions on one sheet is worse than no table. It returns the new `y` so the
  floorplan gives up the height rather than being drawn over, and the sheet's `Material,
  Print Output, Print Panels (in)` CSV columns are **appended at the very end** because
  the InDesign script addresses columns by name. `_flatGraphicElevFor()` is the ONE
  definition of "which wall is this graphic on", shared by the schedule and the capture.
- **`printOutput` IS SETTABLE FROM TWO PANELS** — the dashboard and the Deck Studio spec
  page — because it decides what THAT page prints (one file, or one per panel with the
  schedule table). In Deck Studio it is `_dsPrintOutputInto`: an inline CHECKBOX in the
  panel’s main flow, directly above Dual units, in both Per-piece and Group A/B/C (a flat
  graphic is split onto its own egdDetail sheet whatever the mode).
  It started as a picker in a collapsed section at the bottom and that was wrong for the
  reason it exists: the setting is noticed when you look at the SHEET and see the panels
  producing no schedule, so it has to be where the eye already is, not a fold away and not
  on another tab. This is the one most designers forget.
  Both write through `setRowPrintOutput`, which enforces **window-film-only in the DATA**,
  not just by hiding a control: a bulk edit or an imported row could otherwise leave a
  wallcovering in a mode whose schedule has nothing to read. Both read
  `_printOutputHintText` — ONE wording, because two panels describing the same setting in
  two different sentences is how a user ends up believing they are two settings. Toggling
  must `_dsClearBuiltAll()` + `_dsRefresh()`: the sheet gains or loses a whole table, so
  the page and its thumbnail rebuild rather than being relabelled.
- **`_dsPrintOutputInto` TAKES THE PAGE, NOT A ROW.** Two graphics sharing a wall share a
  sheet (`_mergeFlatPages`) and `desc.row` is only the FIRST of them, so a control bound
  to it changed one graphic while the page showed two — one with a schedule table and one
  with the "set Print Output to split" hint. It writes every window-film member, and shows
  **indeterminate** when they disagree rather than rounding to on or off: rounding is what
  lets a graphic sit unsplit behind a ticked box.
- **A GLAZING RUN IS DRAGGED BY A GRIP, NEVER BY THE GLASS.** `#glazing-layer` is z 9,
  above the frames and the context blocks, so making the run rectangle interactive would
  lay an invisible sheet over every graphic on that glass — and window film graphics live
  exactly there. Only `.gz-grip` opts into pointer events; the run outline keeps
  `pointer-events:none`.
  The grip is authoring furniture, so it carries **both** `data-export-skip` and
  `data-html2canvas-ignore`: this layer IS an annotation layer (so the SVG and PDF emit
  what is left in it) and the PNG path rasterises the live DOM and reads neither list.
  Shown only on the **Glass tab**, which is why `switchElevTab` has to redraw — otherwise
  the grips appear only after some unrelated edit triggers one.
  Snapping goes through the shared engine with a new `skip.glazingIdx`: a dragged run must
  not offer its own seams and edges, which travel with it and would pin it in place. One
  undo entry on mouseup, and only when something moved. Not clamped to the wall, the same
  call `addGlazingRun` makes.
- **`buildWfWall` IS THE STANDARD WF ELEVATION** (`WF_WALL_PRESET`: 185x108 wall, one
  100x82 run at x=45 on a 4in sill, three equal panels) and it opens the Glass tab, so the
  next move is visible rather than something a designer has to be told. It only sizes the
  WALL when the elevation is blank (`_wfWallIsBlank`): a wall already dimensioned or with
  art on it carries a real instruction, and overwriting it is the mistake auto-fitting a
  flat graphic to the wall was. It still adds glass to a wall you already sized.
  **WF WALL is DERIVED, never stored**: a wall with a glazing run IS a window-film wall, so
  the button lights from `elev.glazing` and there is no third flag to go stale when the
  last run is deleted. It is not exclusive with ART/EGD — a glazed wall is normally an ART
  wall, which is what `#wallModeHint` explains.
  **A second run CONTINUES the first** (`WF_NEXT_RUN`): same sill, same head height, to the
  right of the last run, one panel wide. Deliberately not clamped to the wall — a run past
  the corner is the prompt to widen the wall, and shrinking it silently would hide that.
  Panel widths snap to a sixteenth, so "equal" means the non-last panels match and the LAST
  absorbs the residual; that is what makes a run re-sum to its total instead of leaving a
  hairline gap at the edge, and a test asserting all panels equal is asserting the wrong
  thing.
- **`_egdWallGoverns` IS THE ONE ANSWER TO "WHAT DOES EGD WALL MODE TOUCH": WALLCOVERING.**
  `_shouldAutoFitFlat` already said window film is sized to the GLASS and never to the
  wall — and then `toggleEgdWall` and `_clampFlatToWall` both tested "is it flat", which
  swept film straight back in. Switching a glazed wall to EGD therefore tore every film
  graphic off its panes and they had to be re-imported and re-aligned. All three go
  through the predicate now.
  **A wall with glazing is NOT an EGD wall by virtue of having windows.** Film is fitted to
  panes and aligned across mullions, so anything reaching for the wall’s edges is measuring
  the wrong thing — including the clamp, since a privacy band can sit lower than the
  baseboard line. A glazed wall left on ART is correct, and `#wallModeHint` says so on
  screen (keyed to `elev.glazing`), because the only other way to learn it is to switch
  mode and watch the film move.
- **THE WALL MODE IS TWO NAMED BUTTONS** (`artWallBtn` / `egdWallBtn`, both calling
  `setElevWallMode`), sitting under RESET DIMENSION POSITIONS. Exactly one is lit, from
  `_isEgdWall(elevations[currentElevIndex])` — EGD mode is per elevation while every other
  button in that panel is deck-wide, which is the trap here.
  **Its `.active` NEEDS ITS OWN CSS RULE** (`.wall-mode-btn.active`): `.action-btn` has no
  `.active` style anywhere in style.css, so the old toggle set the class and painted
  NOTHING. The state was tracked correctly the whole time and simply never shown — which
  is most of why the mode looked invisible. Setting a class is not the same as having a
  style, and a test now reads the stylesheet for the rule.
  ART carries the accent as much as EGD does: the default has to look chosen, or a
  designer reads "neither is on" and never learns the switch exists.
  It was a 28px icon whose only signal was an `.active` class, so a wall’s mode was
  invisible until you hovered it and the feature had to be explained to every designer.
  16.90 tried ONE labelled toggle and that failed twice over: a toggle can only show the
  state it is in, leaving the other mode unnamed, and a labelled control was wide enough
  to push the item-code picker off the Add & Arrange row — that row is icons plus one long
  select and takes neither. **ART is the default**: `egdWall` absent IS an art wall, so
  nothing is written to a project for the normal case and old files open unchanged.
  The Add & Arrange toolbar also lost the context-block button; the Context TAB owns that
  tool now. Both `getElementById('contextToolBtn')` reads were already null-guarded.
  **The import list sizes to its CONTENT** (`#bulkDropdownList` `width:max-content`), not to
  the narrow trigger it hangs under: the item code is the only thing identifying a frame in
  that list, and a truncated one is a guess rather than a choice. The product label is what
  gives way on a long code, being context rather than identity.
- **A LONG PANEL SCHEDULE SPLITS INTO TWO COLUMNS** (`FLAT_SCHED_SPLIT_AT` = 9), and the
  reason is the ELEVATION, not the table. On the flat-graphic sheet the spec band sets
  where the drawing starts, so a 12-panel schedule owned the whole band and squeezed the
  elevation to a strip with unreadable dimensions. The two-graphic sheet beside it read
  fine for exactly this reason: its specs were already in two columns, so its band was
  half as tall. Split rather than shrink, because a dual-unit cell reads
  `16.69\"(423.9mm)` and halving the column width would wrap every number.
  The continuation column keeps the rule and the headers (so the two align as one table)
  and drops the title and the `ALL PRINT FILES` footer. It borrows the second spec column
  ONLY on a single-graphic sheet — on a shared sheet that column is the other graphic’s,
  and taking it would draw one table through the other’s specs.
- **ITEM CODES ARE IN NUMBER ORDER EVERYWHERE, AND IT IS NOT A SETTING (17.95).** Asked
  for as "set in stone, I do not want designer presentations looking different from one
  another", so there is no toggle and none should be added. Every surface that lists codes
  (dashboard, Items list, plan legend, spec pages, CSV) reads `dashProjectData` in stored
  order, so the rule is enforced on the DATA: `_codesSortRows()` (type order ART, EGD, WF
  from `_codePrefixOrder`, then number, then piece letter) and `_codesSortWalls()` (a wall
  sorts by the lowest code on it; blank walls last). 17.92's renumber closed gaps by
  renaming in place while rows stayed put, which is how a deck read ART.1, ART.3, ART.2.
  **Four gestures, one rule each.** `_codesSettle()` after anything that adds, deletes or
  recodes (closes gaps, sorts rows and walls). `_codesAdoptRowOrder()` after a USER
  reorder (dashboard drag, Move To): the new order IS the instruction, so it renumbers.
  `_codesMovePlacement` / `_codesMoveBeside` for the Items drag. `_codesRenameRow` for a
  typed code: the NUMBER is a position (ART.9 on a five-code project lands as ART.5), a new
  PREFIX recodes through `_recodeForCategory`, a letter change renames one piece, and a
  number change on one piece of a set moves the whole set. None push history; the caller
  does, so a gesture is one Ctrl+Z.
  **A structured or catalogue code is never renumbered and RESERVES its number**
  (`_renumberPrefix`), or ART.5 closes up onto ART.1 beside ART.1.2A and two placements
  print as one. **`applyIdRename(…, quiet)`** skips its four re-renders: a renumber renames
  every piece twice, and per-row redraws made sixty codes crawl; `_codesRefreshViews()`
  redraws once. `_fpRenameGroup` also renames a wall NAMED after the code ("ART.4 LOBBY"),
  at a word boundary.
  **The code field commits on change, never per keystroke** (table cell, `m_itemCode`,
  the wall frame field). The live rename renamed wall frames on every key, so typing ART.12
  passed through ART.1 and merged two pieces' frames irreversibly.
  `_codesSortRows()` also runs at the top of `renderDashTable`, `_deckPageList` and
  `_fpFillItemList` as a cheap safety net (it returns early when already sorted), which is
  why a negative control removing the settle from `_fpAddCodes` stays green.
  **The floorplan Items list is where codes are run from**; `_jumpToCodes()` (dashboard
  Codes button, the Elevations # button, which used to open a template renumber that minted
  a second scheme) opens it with a Back bar (`deckReturnBar`, filled by `_returnBarInto`
  because the panel is built before it is attached). The template renumber modal
  (`openRenumberModal` / `renumberElevation`) is now unreferenced from the UI.
- **A ROW CAN BE PINNED ON SEVERAL PLANS** (`r.planPins = [{lv,x,y}]`). A hotel deck
  carries an overall floor plan plus a plan per guestroom type and the same piece hangs in
  all of them; with one pin per row, placing the code on Guestroom B silently took it off
  Guestroom A, because there was one slot to hold a position.
  **QUANTITY IS NOT AFFECTED, and that decision is what keeps this small.** Qty comes from
  elevation placements (`recalculateDashboardQuantities` counts frames), so a pin says
  *where* a piece appears and never how many are bought. A piece that really repeats is
  placed on more elevations; one shown on three guestroom types but bought once carries a
  note on its spec page. A test pins that qty never reads `planPins`.
  **`r.planX`/`r.planY`/`r.level` survive as the PRIMARY** — a derived mirror of
  `planPins[0]`, kept by `_fpSyncPrimary`. That's what lets the ~40 sites reading a single
  placement (the spec page's plan crop, the validator, the CSV, the level a spec page is
  grouped under) stay exactly as they were. Adding a pin on a second plan must **not** move
  the primary, or the piece's spec page jumps to another level's block just because it was
  also shown in a guestroom.
  **`_fpGroups(level)` takes an OPTIONAL level**, and that one argument is what made this
  a small change: pass one and the group resolves to THAT plan's pin (and sets `g.level`
  from it, so the callers that then filter `g.level === desc.level` keep working); pass
  nothing and it resolves to the primary, which is what every existing caller expected.
  `_fpPins` is **read-only** — seeding an array on read would write a field into every row,
  every autosave and every undo snapshot just for asking, the same trap `_elevUnderlay` has.
  **There are TWO placement UIs** — the Deck Studio centre and the full markup tool — over
  the same data, and both must go through `_fpSetPin`/`_fpClearPin`. One of them still
  writing a single `planX` would quietly undo multi-plan pinning depending on which tool
  you happened to use. A test pins all six handlers.
  **THE WALL LINE IS PER PLAN TOO** (`r.planWalls`, same shape, same derived primary in
  `r.wallLine`/`r.wallLines`/`r.wallPanels`). Making the pin multi-plan and leaving the
  line single shipped as a HALF FIX and was reported immediately: drawing the line on
  Level 2 wiped the Level 1 line, so the piece showed a callout pointing at a wall marking
  that had vanished. A line marks where on a wall a piece hangs, which is a fact about a
  particular plan. `_fpGroups(level)` resolves BOTH halves — resolve one and not the other
  and a plan draws a pin with no wall, or a wall with no pin. The Single/Diptych/Custom
  MODE is per plan as well, including the branch that picks click-to-click vs drag.
  **Deleting a level must RENUMBER the pins above it.** Pins are keyed by level index and
  splicing shifts every index above the removed one, so without the renumber a guestroom
  pin silently re-homes onto whatever plan slid into its slot — a wrong drawing that looks
  completely normal.
- **`_deckPlanSlots` IS THE FLOORPLAN/SPEC PAGE ORDER, and it's the first rule that both
  page-list builders actually share** rather than mirror. It returns neutral **slots**
  (`{t:'key',li}` / `{t:'detail',li,pd}` / `{t:'unit',li,u}`), not pages, for the same
  reason `_partitionFlatMembers` returns only the partition: `_deckPageList` emits page
  descriptors and the export emits render steps, and forcing one shape on both is what
  makes the next caller write its own copy. Each builder maps slots to its own output and
  nothing else.
  `editorialContent.planOrder` picks the mode: **`byLevel`** (plan, then that level's
  specs and elevations, then the next level) is the original behaviour and the default, so
  opening an existing project never silently reorders its deck; **`plansFirst`** emits
  every floorplan first, then all the spec and elevation pages. A test pins that the two
  modes contain **exactly the same pages** — a reorder that adds or drops one is a bug,
  not a mode. An unrecognised value falls back rather than being stored, so a newer file
  opened in an older build can't leave the deck in a mode nothing implements.
  **`manual`** is the third: plans in a hand-set sequence (`editorialContent.planSeq`),
  then all the specs, for a deck carrying an overall floor plan plus several guestroom
  layouts on the SAME level, where the useful grouping is "all the guestrooms together"
  and no rule derived from the level number can express it. It behaves like `plansFirst`
  and not like `byLevel` deliberately: once the plans are in a hand-set sequence they're
  no longer in level order, so interleaving each level's specs behind its plan would
  scatter the specs into that same sequence. The **specs follow the plan sequence** too,
  so both blocks read in the same order.
  `planSeq` is stored sparsely and **reconciled against the levels that actually exist on
  every read** (`_deckPlanSeq`): a level added after the order was set appends rather than
  disappearing, and a deleted one drops out instead of leaving a hole that emits a blank
  page. `moveDeckPlan` seeds from the *resolved* order, so the first nudge on a project
  that has never been hand-ordered starts from what's on screen.
  The control appears **twice** — Project tab and the floorplan panel's Plan tab — and is
  ONE setting, not a copy: both read `_deckPlanOrder()` and write through
  `setDeckPlanOrder`, so changing either re-renders the other. A test pins that the
  floorplan control never assigns `editorialContent.planOrder` directly.
  Both selects set an explicit **height**: the global `select` rule in style.css pins
  every select to 26px, so inline padding without an inline height clips the descenders
  off the option text (which is what "the letters are cut off at the bottom" was).
  A plan detail **pinned before a unit follows that unit** in both modes: the pin is an
  explicit instruction about adjacency and the mode is a default about grouping. Unanchored
  details travel with the plan they zoom into.
  **`_deckEmitLevels` is the other half**, and it was already drifting in FOUR places: the
  studio tested the filtered `rows`, the export tested its `units`, and the two
  install-guide branches tested different things again — so a level could appear in the
  preview and not in the PDF. One function now, called by all four.
- **A WALL LINE IS DRAWN BY FIVE RENDERERS AND NONE OF THEM SHARES A PATH.** The Deck
  Studio centre (SVG `<line>`), the rail thumbnail (`_deckMockHTML`, an HTML div), the
  floorplan key page (`doc.line`, real jsPDF for the export and `CanvasPdfRec` for the
  preview), the plan detail page, and the spec page's plan thumbnail (the last two
  composite onto a `<canvas>` before placing it as an image). `FP_WALL_LINE_ALPHA` is the
  ONE value all five read; a call site with its own number is how the preview starts lying
  about the PDF.
  It's **alpha, not a multiply blend**, and that's forced: jsPDF's `GState` in the
  vendored build whitelists exactly `opacity` and `stroke-opacity` and **silently drops
  every other key**, so multiply could only ever be screen-deep. A Deck Studio that shows
  something the PDF won't print is worse than a slightly weaker line in both. Over the
  white of a plan the two look nearly identical anyway; they differ only where the line
  crosses dark linework, which is exactly where seeing through it is the point (door
  swings). `_fpDocLineAlpha` is guarded so a doc with no `GState` degrades to a solid line
  instead of throwing out of a page render, and the key page must set it **back to 1** or
  the pins and legend inherit it.
  **`CanvasPdfRec` needed `setGState` for this** — the shim is the preview's renderer, so
  without it the preview drew solid over translucent. Fill and stroke alpha are tracked
  separately, as in a real GState, and `render()` has to **read** `st.sa`: recording a
  value and never applying it is the same bug the rotated-label `angle` had.
- **The floorplan panel is three tabs** (`_fpPanelTab`: Items / Categories / Plan). A real
  project runs to ~60 item codes, and every one was a row of five controls in one column
  with the category manager stacked underneath, so a setup task touched once a project was
  permanently eating height from the list worked in constantly. Items carries a filter and
  an **Unplaced** toggle (the question actually asked on a long plan is "what have I not
  placed yet", previously answered by scanning for an amber ring) and groups rows under
  collapsible category headers. The row now shows the **code**, which used to live only in
  a `title` attribute, and the category picker is reduced to a colour chip because it was
  the widest control while being the one changed least. All of it is **module state, never
  project data** — it's where you're looking, the same reasoning as `_ctxPaletteCat`.
  `_fpFillItemList` rebuilds the list ALONE: re-rendering the panel on each keystroke
  destroys the input being typed in, the same live/full split the glazing and context
  editors use.
- **Shift locks a wall line to an axis** (`_fpAxisLock`), in drag mode and click-to-click
  alike. It must be applied in the **preview and the commit**: constrain one and the line
  you were shown is not the line you get. The dominant axis is decided in **pixels**, not
  in the normalised 0..1 the segments are stored in — a plan is rarely square, so a run
  longer in normalised x can be shorter on the page.
- **The loupe** (`_fpLoupeShow`) magnifies under the cursor while a pin or line is being
  placed. Deliberately a loupe and not a zoom of the plan: the centre preview IS the page,
  and zooming it would stop it matching what prints. `position: fixed` on `<body>` so the
  preview's overflow can't clip it at the page edges, which is exactly where a wall line
  usually starts. It must be hidden on every disarm path and must keep tracking **through**
  a drag, not only before one starts.
- **A floorplan page has no Templates tab** (`_dsPageTakesTemplates`). Its layout is drawn
  by the floorplan renderer rather than placed from a coordinate map, so the card grid is a
  control that produces no result; Layers stays, for notes over the plan. Hidden, not
  disabled. Two traps: `_dsToolsTab` rewrites the button's whole `cssText`, so the hide has
  to be re-applied **after** it (`_dsSyncToolsTabBar`) or every tab click brings the button
  back; and sitting ON Templates when a plan is selected has to fall back to Page, or the
  panel goes blank with no way back that reads as deliberate.
- **ONLY INSERTED LAYOUT PAGES CAN BE MOVED** (`_dsPageMovable`). Fixed pages and cards sit
  at hardcoded points in `_deckPageList`; floorplans, plan details, spec pages and breakers
  come out of `_deckPlanSlots` in an order the DATA decides. A per-page override on any of
  those would fight the generator, and the generator is mirrored by the PDF exporter —
  the pairing that has drifted more than anything else in this file. Manual floorplan
  order already covers the real need.
  The distinction used to be invisible: every thumbnail looked equally grabbable, so two
  thirds of a deck silently ignored the controls beside it. `_dsPageLockNote` now says why
  a page can't move AND where its order is decided.
  **`_dsMovePageTo` is the ONE move** — the rail drag, the "move to page N" field and the
  page-actions menu all call it. It reads the anchor off the RESULTING order rather than
  off an offset, so "put this at 3" means the same thing whether the page is above or
  below 3; it drops `place` (the template's own anchor, which would otherwise fight the
  hand-set `afterKey` on the next rebuild); and it re-sorts `layoutPages` via
  `_dsSyncLayoutPageOrder`, because the resolver walks that array ONCE and a page anchored
  to another layout page sitting later in it can't find its anchor and falls to the end of
  the deck. There were three movers before this; the other two are gone or delegate.
  **THE DRAG IS KEYED ON THE PAGE, NEVER ITS INDEX** (`_dsDragFromKey`, resolved fresh by
  `_dsDragFromNow` / `_dsDragSrc`). It captured an index at dragstart and resolved
  `_dsPages[idx]` at drop, so anything rebuilding the rail mid-gesture — an autosave
  sweep, a finishing thumbnail build, a completing elevation prime, all of which call
  `_dsRefresh` and replace `_dsPages` wholesale — moved whatever page had slid into that
  slot. Silently, and plausibly enough not to be noticed until a PDF. Same rule context
  blocks already follow: anchor on a stable id, never an array index.
  `dragover` and `drop` are ONE shared pair wired for every cell before the movable check,
  and a locked cell returns before `draggable` is set — that ordering IS the rule (a
  generated page accepts a drop and cannot be picked up). They were two near-identical
  copies, which is how the stale-index fix would have landed in only one of them.
  **THE GAP BETWEEN TWO PAGES IS ONE ELEMENT WITH TWO JOBS** (`.ds-insstrip`): "insert a
  page here" and, during a drag, "drop it here". The drop bar used to be drawn on the
  CELLS as `.drop-before`/`.drop-after`, but a gap is reachable from either side — as
  "after page 8" or "before page 9" — so crossing one flipped between two indicators in
  slightly different places and read as TWO slots to drop into when there is only ever
  one. Marking the gap gives one gap, one indicator. The two gaps either side of the
  dragged page stay dark: dropping there is a no-op, and lighting them promises a move
  that will not happen.
  It is **always visible** and **tall enough to hold its own button**. Hover-only saved
  scroll and then required telling people the control was there — a control you have to be
  told to hover for is not discoverable, it is a secret. And a 16px button in a 6px strip
  overflowed 5px into the page above and below, which is what "offset and overlaps the
  next page" was. The gap owns ALL the spacing between cells (the cell has no margin), so
  there is one number to change rather than two that drift.
  The elevation rail still marks its TABS, and correctly: they sit flush with no gap
  element between them, so there an edge IS the boundary.
  **`_dsPlaceRelative`** is the third way to move a page — before/after a page NUMBER —
  for when you are thinking about a neighbour rather than a slot. "Before 7" and "after
  7" are different places, which the absolute number box cannot express. It resolves to a
  gap and goes through `_dsMovePageTo`, so it and a drop land identically.
  The rail reorders with the **same gesture and the same `.drop-before`/`.drop-after`
  indicator as the elevation rail** — two rails in one app that reorder differently is two
  things to learn. A locked page is not draggable but IS still a drop target, since placing
  an inserted page between two spec pages is most of what inserted pages are for.
- **THERE ARE TWO PAGE-LIST BUILDERS AND THEY DRIFT.** `_deckPageList` drives Deck
  Studio; the PDF export's `_stepsFor` mirrors it **by hand**, and its own comment used
  to say "Mirrors `_deckPageList`". That comment is not a mechanism. Any rule about
  *which pages exist* has to be a **shared function called by both**, or the PDF grows
  pages the preview never showed — which is the worst kind of bug here, because the
  preview is how the deck gets checked.
  THREE clauses have now drifted this way (`_mergeFlatSteps` was the third, missed
  one commit AFTER this note was written — the studio merged flat sheets and the PDF
  still printed two). Any rule about which pages exist needs wiring into BOTH, and a
  source-level test asserting both call sites, because behaviour tests on one builder
  pass happily while the other is wrong.
  Two clauses had already drifted this way, both found from one report ("the EGD is
  getting a breaker page in the PDF even though it is not showing in Deck Studio"):
  `_breakerSkipUnit(members)` (a wall that is *entirely* flat graphics skips its
  breaker — its own sheet already carries the full dimensioned elevation, so a breaker
  is the same drawing twice) and `_partitionFlatMembers(members)` (in Group A/B/C a
  flat graphic comes **out** of its group onto its own sheet). The export had neither,
  so it printed a phantom breaker *and* drew a grouped wallcovering as a set member.
  `_partitionFlatMembers` returns only the **partition**, not a page shape, because the
  two builders emit genuinely different things (a page descriptor vs a render step) —
  forcing one shape on both is what makes the next caller write its own copy again.
  In the export, a split-out flat page **must carry `_forceTpl: 'egdDetail'`**: the
  dispatch tests `!step._forceTpl && (_specIsGroup || _manual)` *first*, so without it
  the page falls straight back into the set renderer the split exists to avoid.
  Per-piece mode needs no split — it already resolves each row's own template.
- **EGD wall mode** (`elev.egdWall`, `_isEgdWall`, `toggleEgdWall`) is **per elevation**,
  unlike every other button in that guides row — easy to add to the wrong list.
  Anything flat on such a wall is filled to it and pinned inside it above the baseboard
  by `_clampFlatToWall`, called on drag **and** on redraw, and **after** the snap,
  because the wall edges are themselves snap targets. A mode rather than unconditional:
  WF-3 is `TBD × 14"H` and WF-4/WF-5 are privacy bands, none of which fill a wall.
  **Flat graphics render behind framed art unconditionally** — `drawElevAll` sorts them
  to the front of `_drawOrder` while preserving original indices, because
  `makeElevDraggable` and every dim lookup address frames by their index in
  `elevFrames`. That's why no "wallcovering + artwork" mode is needed.
- **WALL CONTEXT is two features and ONE contract: the underlay never exports, the
  blocks always do.** `elev.underlay = {src, x, y, w, h, opacity}` is the client's or
  architect's elevation, faded back behind the wall as a **tracing guide**;
  `elev.contextBlocks = [{x, y, w, h, label}]` are the things traced off it that are not
  art but decide where art can go (doors, windows, millwork, a TV). Both in `elevUnit`,
  `x`/`y` bottom-left like a frame and like a glazing run, so `_ctxPxTop` is the only flip.
  That export split has to hold in **three** places, because there are three renderers and
  none shares a list with the others: `exportElevSVG`'s `annotationLayers`, the
  artboard-bounds list, and `exportElevPNG` (which rasterises the **live DOM** through
  html2canvas and therefore reads neither list, so it hides `#underlay-layer` outright and
  restores it in the same `finally` as the rail). Get one wrong and the tracing guide
  ships to the client.
  **A CONTEXT BLOCK OCCLUDES. `CONTEXT_FILL` is opaque white and `#context-layer` is z 8,
  over `#frame-layer` (6).** A block is an object in the ROOM, so it hides the wall
  surface behind it: the baseboard runs behind a bed, and a wallcovering graphic is masked
  by the headboard that will really stand in front of it. That masking is the feature, not
  a side effect — it's how you see, while designing a 200" graphic, which part of it a bed
  or a lamp is going to cover. It was `transparent` at z 3 (under the art) until 16.82, and
  the reasoning that chose transparent was about **tone** (a stack of grey boxes competing
  with the art), which white doesn't bring back; what transparent could not do is occlude,
  and no hairline outline over a graphic tells you what the object covers.
  The trade is real and was taken deliberately: where a block overlaps a frame it now takes
  the **click** too. That's one honest z-order — you move the furniture to get at the art.
  **`#glazing-layer` had to move to 9** in the same change. It's an *annotation* layer, so
  the export draws mullions over everything rasterised whatever the screen does; left at 7
  a window traced as context covered its own mullions on screen while the PDF still drew
  them on top.
  **The baseboard is the trap this created.** It's emitted into `midLayer` — the VECTOR
  half, written over the rasterised back layer — so a full-width line prints straight
  across every bed while the editor shows it hidden. It's drawn as the **gaps** instead:
  spans of blocks crossing the baseboard y are subtracted, overlapping blocks merge into
  one gap (or a sliver prints between two beds pushed together), and it stays real vector
  line work rather than being rasterised to dodge the problem. Only the baseboard needs
  this — the one wall-outline edge a block could cover is the floor, which is the edge
  furniture stands *on*.
  **Context blocks are still NOT in `annotationLayers`**, but the reason is now mechanical
  rather than a z-order one: that list is replayed into the PDF as parsed vector ops
  (`_elevAnnOps`), which understand rect/line/text and would silently drop the nested
  `<svg>` of line art every library block carries. They're emitted into the SVG's **back
  layer** instead, collected in `ctxLayer` and concatenated on **after** the frames loop
  (`backLayer.push(...ctxLayer)`), read off the DOM through `rectToSvg` so the export
  can't drift from the editor arithmetically. That flush must stay **ahead of both
  consumers** — the downloaded SVG and the `returnBlob` split — or one of them loses every
  block. `#context-layer` **is** in the bounds list
  (a millwork run continues past the corner and must not be cropped); `#underlay-layer`
  is in neither, or an unaligned oversized drawing silently resizes every exported
  elevation on the wall.
  `_scaleElevContext` is called from the **same two sites** as `_scaleElevGlazing`
  (project load with a divergent unit, and the unit toggle) — these fields are not in the
  frames' hand-maintained allowlists, and a mis-placed door is worse than a wrong number
  because art gets hung against it. It scales the underlay too (a guide that doesn't move
  with the wall slides out from under everything traced off it) but never `src` or
  `opacity`, which aren't dimensions.
  The fade is clamped to **0.05–0.95**: a 0 underlay is indistinguishable from no
  underlay ("nothing happened") and a 1 one from real drawing content. `_elevUnderlay()`
  is **read-only** and returns null rather than seeding, or asking whether a wall has one
  writes an empty object into the project and into every autosave and undo snapshot.
  Aspect is deliberately **not** locked — a client elevation is usually a scan or a phone
  photo of a printout, and squaring it against the real wall is the job.
  **The underlay is CONTAINED at its true aspect on import, never stretched to the wall.**
  `natW`/`natH` (the image's natural pixels) are stored so the aspect is a property of the
  IMAGE, not of whatever the box currently is — stretching w and h independently leaves
  nothing to get back to, which is what "when I drop it in it stretches" was. `lockAspect`
  defaults **on** (a lock you have to find is off when it matters) and `_underlayResize`
  moves the partner dimension, so the number you type is the number you get. No natural
  size (a decode failure, an older file) means `_underlayAspect` returns **null** and
  sizing degrades to free stretch rather than inventing an aspect from the current box and
  locking the distortion in. `fitUnderlayToWall` is the one deliberate stretch, labelled
  as such.
  **Calibrate replaces a Photoshop round trip** (crop to the 4" baseboard → Reveal All →
  marquee a known size): click the two ends of anything whose real size you know, type it,
  and the image scales. It scales **about the first click** so the feature just pointed at
  doesn't slide away, and **both axes by one factor** — a calibration is a scale, never a
  stretch. Applying it hands over to Place, because scale is settled and sliding it onto
  the wall is what happens next. Calibrating owns the pointer **outright**: both
  `makeElevDraggable` and `_makeContextDraggable` yield to it, because the thing being
  pointed at is the image *underneath* the art.
  **The draw tool ARMS A PRESET and hands back to select mode after one block.** It used
  to stay on — but `_makeContextDraggable` yields to it, so a block you had just drawn
  couldn't be nudged without finding Escape first ("I have to type in the dimensions from
  floor and from left, but that is going to be annoying"). Draw is the rough placement and
  drag is the adjustment; they have to be consecutive. Re-clicking the armed chip disarms,
  so the palette is the way out as well as the way in. `CONTEXT_PRESETS` (six) seed
  shape + size + label; `CONTEXT_SHAPES` (four) are what actually draw — a TV and a door
  are both rectangles, so a render branch per preset would be five copies of one box.
  Sizes are authored in inches and converted. `<ellipse>` needs its own export branch:
  `emitEl`'s border cases only ever emit `<rect>`, so a CSS `border-radius` prints square
  (the same trap `_elevCenterTarget` needs `data-svg-passthrough` for).
  **Blocks carry a stable `id` because they are anchorable.** `resolveAnchor`'s
  `ref: 'context'` keys on it, never on the array index — deleting an earlier block shifts
  every index after it, and an index-keyed anchor silently re-points at a *different*
  object on a drawing an installer works from. `_elevContextBlocks` backfills ids on read
  (two load paths, one funnel). Blocks are also targets in `computeSnapForDrag` and
  `customLineSnapTargets`: art is hung in relation to the door and the millwork at least
  as often as to other art.
  **A full-wall `inset:0` layer MUST set `pointer-events: none`.** `#frame-layer` was the
  one exception in the file and it silently swallowed every click meant for anything
  beneath it — which is what made context blocks unselectable and undraggable. The
  frames opt back in via `.frame-vis`; `wireElevArtworkDrop` listens on the layer but
  only acts on `e.target.closest('.frame-vis')`, and events still **bubble** from the
  frames, so a click-through layer doesn't break the drop target. `#context-layer` had
  the same flaw over the underlay. Check this first for any "I can't click the thing I
  just made" report.
  **`CONTEXT_LIBRARY`** is seven categories of standard North American hospitality sizes.
  `CONTEXT_PRESETS` is the flattened form — every lookup is by key, and walking the
  categories at each call site is how two of them end up disagreeing about what
  `'door-guest'` means. Three things in it are load-bearing and easy to get wrong:
  **(1) `affMode`.** `aff: 60` means the CENTRE for a TV and a sconce and the UNDERSIDE
  for a door. `_ctxPresetBox` is the ONE place that resolves it (`center` → bottom =
  aff − h/2); getting it wrong hangs every TV a foot too high. It's also the one place
  that converts inches → `elevUnit`, so a cm project gets a real 213cm door.
  **(2) A bed's `h` is its MATTRESS height (24"), not its length.** Seen on a headboard
  wall you get its width by 24"; the 80" length runs into the room and is plan data, kept
  in `lengthIn` and never drawn. Storing it as `h` draws a bed taller than the door.
  **(3) A catalogue item is NOT shrunk to fit the wall.** A 120" wainscot on a 96" wall
  runs past the corner — that's why `#context-layer` is in the artboard-bounds list.
  A **click** places the library size, a **drag** overrides it (`_ctxPlaceAt` vs the drag
  branch of `_ctxDrawUp`); `freeform: true` on Box/Circle makes a click place nothing, so
  the tool stays forgiving exactly where a stray click is likely. `_ctxNewBlock` is the
  one constructor all three creation routes go through.
  **A drag sets the SIZE; `b.lockAspect` owns the PROPORTION.** The art is drawn with
  `preserveAspectRatio="none"` to fill the box, so a box at the wrong proportion silently
  distorts every stroke in it — a bed scaled up by width alone is a bed with 3x-wide
  hinges, pulls and mattress tape, which is what "scale them up… stretching or squishing"
  was. `_ctxAspect(b)` reads the proportion from the **drawing** (view- and variant-aware,
  since a turned bed and a taller headboard are different drawings), falling back to the
  library's authored size for an item with no art and to the block's own box for a
  freeform shape. `_ctxResize(b, driver, value)` moves only the dimension you didn't type,
  the same contract `_underlayResize` has. Default **on**, and stored explicitly by
  `_ctxNewBlock` as `!p.freeform` — a lock you have to find is off when it matters, but a
  hand-traced Box *is* whatever rectangle was dragged and holding a proportion there
  fights the tool you reached for. Drag-create **contains** the item's aspect inside the
  dragged rectangle, so it's never bigger than what was asked for; `resetContextAspect`
  (Un-stretch) keeps the **width**, because width is the dimension set from the wall.
  Turning the lock on deliberately does **not** retro-correct the box: resizing something
  on the wall as a side effect of ticking a checkbox is the kind of change that gets
  noticed a page later, in a PDF.
  **Line art is `p.svg`, and the project stores the KEY (`b.preset`), never the markup.**
  The art then improves for existing projects and a save doesn't carry a copy of every
  drawing into every autosave and undo snapshot. `_ctxArtSvg` applies the whole drawing
  convention ONCE on a wrapping `<g>` — `fill="none"`, `stroke`, and
  `preserveAspectRatio="none"`, so one asset serves a 5" sconce and a 120" credenza.
  **`vector-effect` IS NOT AN INHERITED PROPERTY.** It was set on the wrapping `<g>` and
  applied to the `<g>` and to none of the shapes inside it, so every stroke scaled with
  the viewBox — at a fitted zoom on a 185" wall (~6.4 px/inch) an authored 1.5 rendered
  near 10px of solid black. That was the whole of "very thick black lines"; the geometry
  was never the problem. The fix is `_ctxArtSvg(p, ink, pxScale)`: weights are authored in
  SCREEN PIXELS and **divided by the draw scale** (block width ÷ the item's real width),
  which also converts `stroke-dasharray` — an unscaled dash run turns a hidden line solid.
  Both renderers must pass a scale or one of them is back to the bug. Dividing also beats
  the attribute for portability: Illustrator's non-scaling-stroke support is unreliable,
  and a real user-unit width lands correctly everywhere.
  **The assets are CAD, and the LINE WEIGHT HIERARCHY is what makes them read that way.**
  One uniform stroke looks hand-drawn however accurate the geometry underneath is — that
  was the whole of "they look kind of like kid drawings". Four weights, authored as
  nested `<g stroke-width>` (which overrides the wrapper while still inheriting
  fill/stroke/vector-effect, so no new machinery): `_O` object line (outer profile),
  `_D` detail (leaf, drawer face, cushion), `_F` fine (reveals, hinges, seams, tape
  edges), `_H` hidden (dashed — the basin under the vanity counter). Weights live in ONE
  table (`CTX_LW_*`), never sprinkled per node. Joins are **mitre** and caps **butt**:
  rounded joins on a heavy outline was the other half of the sketch look. Detail is real
  construction — doors carry a 2" jamb, three butt hinges at their true AFF heights, a
  lever at 36" (34" ADA) on a 2.75" backset and a floor undercut; casework carries a top
  slab with an edge reveal, faces on consistent reveals, pulls and a toe kick. A test
  pins the hierarchy, the hinge count, the lever heights and the toe kick, because
  "simplify the drawing" is exactly the change that would quietly undo this.
  **`p.variants` are STYLES, not sizes**, and the distinction is the whole design: a
  queen stays 60" wide whichever headboard it has, so `setContextVariant` leaves the
  width alone and moves only the HEIGHT, derived from the drawing's aspect — which is the
  number that matters when art goes above the bed. Slot zero is the item's own drawing,
  so cycling always passes back through the hand-drawn original. Variants are **front
  only**: `BED_STYLE_VARIANTS` came from a frontal-elevation sheet, so a turned block
  falls back to `p.side` rather than stretching a front drawing into a side-shaped box.
  Those five were traced from a cad-blocks.net SVG — 109k exploded segments, no grouping,
  no text, ONE stroke class — found by clustering path bounding boxes, simplified ~5x, and
  normalised to 100 units wide. The source has no line weights at all, so the hierarchy is
  **inferred from run length** (longest 10% → object, next 35% → detail, rest → fine);
  a guess, but it stops traced art reading flatter than the hand-drawn assets beside it.
  If more are imported, the pipeline (`tools/trace-cad-svg.js`) is: parse → flatten →
  **stitch** → cluster → simplify → despike → bucket by length, and check the licence
  before shipping someone else's geometry.
  **Everything good depends on the stitch, and it has two rules that each shipped wrong
  once.** (1) Join within a **tolerance**, not on an exact quantised key — a grid key
  alone splits any two endpoints straddling a cell boundary however close they are, so a
  headboard outline broke at arbitrary points and each piece was then weighted separately.
  Endpoints are bucketed into cells for *lookup* and matched by real distance across the
  3x3 neighbourhood. (2) Continue **by direction** through a junction rather than stopping
  at one, but let direction only **choose between** candidates — never veto a lone one. An
  exploded CAD block is nothing but junctions, so "exactly one candidate or stop" severed
  every chain; and a turn *limit* severs every square corner instead, which took plinths,
  drawer faces and mattress edges apart into four separately-weighted pieces. The only
  turn refused outright is a **reversal** (`MAX_REVERSE`), which is never drawing.
  A hairpin is the artifact those two produce together and **Douglas-Peucker cannot touch
  one** — a spike deviates from the chord by a lot, which is exactly what RDP keeps — so
  `despike` drops the apex where the turn all but reverses over a *short* spur. Long
  reversals are left: the V between two pillows is a real one.
  `MIN_RUN` (0.9 on a 100-wide drawing) drops trace dust; at hairline weight a field of
  stubs reads as fuzz around the drawing rather than as detail. Fixing the stitch is what
  makes that floor safe — real detail now runs into the outline it belongs to instead of
  being stranded and culled. Measured: polyline counts fell by up to 60% while total ink
  went **up** 100-120%, which is the signature of the fix (fewer, longer, connected runs
  carrying more real geometry) and worth re-checking against if the tracer is touched.
  **`p.side = {w, h, svg}` is the front/side toggle, and it carries DIMENSIONS as well as
  artwork.** A bed from the headboard wall is 60" wide; along the wall it is 80" long and
  36" tall, because the headboard and pillow rise above the mattress. A toggle that only
  swapped the drawing would leave the block lying about the dimension beside it, so
  `setContextView` resizes too — holding the left edge and the floor, since you turn a
  piece in place. It is optional: an item with no side (a grab bar, a sconce) refuses the
  turn in the data and the picker is `disabled` rather than hidden, because a control that
  vanishes reads as a bug. `_ctxArtFor(key, view)` is the ONE resolver, used by the screen
  and the export via `data-ctx-art` + `data-ctx-art-view` — resolve it twice and a turned
  block prints its front drawing stretched into a side-shaped box.
  **Context is LINE WORK on an opaque body, and no library item ships with a surface
  hatch.** White is not a tint: the faint grey that used to sit behind every block read as
  a stack of grey boxes, and the default wood/glass hatches turned a table into a hatched
  slab and a mirror into a scribble — all of it competing with the artwork the drawing
  exists to sell. A CSS background still hit-tests (unlike an SVG `fill="none"`), so
  blocks stay draggable and marquee-selectable. The `tv` shape is the one thing carrying
  tone, and it's written as the **opaque** result of that tone over white
  (`#dedede`, not an `rgba()`) — a translucent panel would let a wallcovering show through
  a television. The hatch is per-block opt-in, sparse and pale;
  `CONTEXT_DRAW_FILL` keeps a wash for the rubber band alone, which is transient
  authoring feedback rather than drawing. The viewBox is the item's own `w h` in inches, so nothing is
  pre-distorted. In the export `currentColor` is substituted for `_ctxInkHex()`: once the
  markup leaves the page there's no CSS `color` to inherit and every stroke falls back to
  black. The art is emitted AFTER the fill ops, matching the screen stack, and the block
  drops its own border (`ctx-has-art`) because the drawing carries its outline.
  **Delete acts on the SELECTION**, gated on `_ctxSelectedCount()` so the clause doesn't
  match when nothing is selected and Delete keeps its meaning for custom lines — that
  branch must stay *after* this one. Ctrl-click extends (captured at mousedown, not read
  at mouseup), the marquee picks blocks up by `dataset.ctxId`, Ctrl+A is scoped to the
  Context tab, and clicking a frame or empty wall calls `_ctxClearSelection()` — a block
  left selected after you look away is a block Delete would silently take. A third axis, `fill` (`plain|wood|glass`), because on an elevation the
  thing that says "joinery" vs "glass" is the SURFACE, not the outline — both are
  rectangles. `_ctxFillOps` is ONE generator for the screen and the SVG, returning plain
  segments: deliberately not a CSS gradient (can't be replayed into the export — the trap
  the dimension dashes had to be dug out of) and not an SVG `<pattern>` (arrives in
  Illustrator as an uneditable fill instead of line work). Spacing is in **screen px and
  doesn't scale**, like `DIM_TICK_LEN` — a grain at "every 3 inches" is a solid black
  block on a 240" wall. Bounded at 120 strokes, because this layer is rebuilt on every
  mousemove of a drag. Each block's clip path needs a **unique id** or the second block
  is cut to the first one's rectangle.
  **`ELEV_FINE_FACTOR` is Shift-as-fine-mode**, read **live off each event** rather than
  captured at mousedown so it can be grabbed and released mid-gesture. The corner scale
  runs off a **virtual pointer** (`vx`/`vy` advancing by the damped delta) or damping
  would do nothing, since size is computed from the cursor's absolute position. Wheel
  scaling is about the image centre, one factor on both axes — a wheel is a zoom, never a
  stretch — and wheel/arrow bursts share `_ulScheduleHistory`, a debounce that turns a
  run of nudges into one undo entry the way a drag's mouseup does. The wheel listener
  must be `{passive: false}` or it can't `preventDefault` and the workspace scrolls under
  the gesture.
  **A material hatch is clipped to `p.hatch`, a region declared PER VIEW.** It used to
  fill the block's whole rectangle, so asking for wood on a bed ran grain across the
  mattress, sheets and pillows. A bed's region is its plinth (plus the headboard in side
  view); a door's is the leaf, not the jamb; a window's is the glass inside the sash.
  **An art block with no region declared gets NO hatch** — guessing would put grain back
  on the bedding. A plain primitive still fills its box, the one case where the rectangle
  IS the material. `_ctxFillSvg` builds it as one clipped `<svg>` and the EXPORT reuses
  the rendered markup verbatim (rewriting ids), so there is one implementation of the
  clipping rather than two that drift.
  **`_elevSnapTargets` / `_elevSnapPick` are the shared snap engine.** `computeSnapForDrag`
  is now a thin wrapper and `_ctxComputeSnap` is the other: a block that lines up with a
  frame on screen but not in the model is worse than no snapping, so both pull from ONE
  pool (wall edges/centre, hang line, frames, glazing seams, other blocks). `skip`
  excludes the dragged thing from its own targets or it pins itself in place. Blocks also
  group-drag and arrow-nudge like frames — snapping is deliberately SKIPPED for a group,
  since per-block snapping pulls each one to its own target and takes the arrangement
  apart. Nudges debounce into one undo entry (`_ctxScheduleHistory`).
  **The sidebar is tabbed** (`switchElevTab`, Art / Context / Glass) because wall context
  and window panels were eating the height Add & Arrange and the frame list need. Panes
  are hidden with `display`, **never detached**: `initElevControls` renders into all four
  containers on every state change whichever tab is up, and several sync paths find
  buttons by id. Restore with `''`, **never `'block'`** — `.elev-frame-list` is a flex
  child whose display comes from the stylesheet.
  **THE PANE IS THE SCROLL REGION, and it needs `min-height: 0`.** `.elev-sidebar` is a
  flex column whose only scrolling child was `.elev-frame-list`; wrapping the sections in
  panes broke that chain, so the Context pane grew to its content and ran off the bottom
  with nothing to scroll. `overflow-y: auto` alone does NOT fix it — a flex child will not
  shrink below its content without `min-height: 0`. The Art pane stays `flex: none`
  because it holds the fixed toolbar and would otherwise squash the frame list. Keep ONE
  scroll region per panel: `.ctx-list` had its own 40vh cap, which put a scroll inside a
  scroll and still overflowed past the cap. Anything that fills a panel
  programmatically must call `_elevShowTabFor` first, or it fills a list nobody can see
  and reads as the tool having done nothing.
  The tool's check must sit **before** the `.draggable` passthrough test in
  `wall.onmousedown`, or dragging a new block over an existing one moves the old one.
  `_elevSnapStep()` is now the ONE reading of the `dragSnap` field, shared with
  `makeElevDraggable`: a block traced against a frame has to land on the same lattice.
  Blocks are free to overhang the wall (no `_clampFlatToWall` equivalent) and a label is
  **dropped**, not shrunk, when the block is too small to hold it. Both sidebar panels are
  built at the **top** of `initElevControls`, ahead of its no-frames early return, for the
  same reason `renderGlazingControls` is: a bare wall being traced has no frames on it yet.
- **A WALL'S IDENTITY IS `elev.id`, NEVER ITS INDEX** (`_elevId`, `_elevById`,
  `_elevIndexById`, `_elevMigrateIds`). Elevations were addressed by array position
  everywhere, and `variationOf` is what that cost: THREE hand-written renumbering
  blocks for ONE field, one in `reorderElevation` and two in `deleteElevation`, none
  of them tested, and the reorder one's own comment proposed giving up and clearing
  the link rather than tracking it. Splice the array and a stored reference points at
  a **different wall**, silently, which is the trap `_dsDragFromKey`, the context
  blocks and the floorplan level pins were each dug out of.
  **`variationOfId` is the truth; `variationOf` survives as a DERIVED numeric
  mirror**, re-derived by `_elevSyncVariationPrimary()` after every array mutation,
  the way `r.planX` mirrors `planPins[0]`. Derived rather than dropped because the
  field is already in saved projects: a file written here still opens in a build that
  only knows the number. One writer, and a test pins that there is only one.
  That function also **promotes an orphan** whose source is gone (clearing
  `isVariation`), which used to be a separate loop in `deleteElevation` and now also
  covers a wall removed by an undo or a project load. It has to: a variation is
  skipped by `recalculateDashboardQuantities` so a duplicate does not double-bill, so
  a link left dangling makes frames that ARE being ordered read **qty 0**.
  **`let _elevIdSeq` is declared ABOVE `let elevations`** and that placement is
  load-bearing: the boot literal RUNS at module scope and now calls `_elevNewId()`,
  so a counter declared further down is read in the TDZ and the file dies on boot.
  Same trap that keeps `TITLE_SIZE_DEFAULT` above `editorialContent`.
  `_elevId()` backfills lazily, like `_elevContextBlocks` does for block ids, so
  there is no load path left to forget; `_elevMigrateIds()` converts an old numeric
  `variationOf` **against the array as saved**, the only order it was ever correct
  in, and is called from **both** install points (the project-open assignment and
  `restoreProjectState`, which undo, autosave-restore and version history all funnel
  through).
  **A CLONE CARRIES THE SOURCE'S ID.** `duplicateCurrentElevation` mints a new one,
  or `_elevIndexById` hands back whichever of the two it meets first. It also uses
  `_cloneData` now rather than a JSON round trip, which was re-encoding every
  `artworkUrl` data URL on the wall.
- **A CATALOGUE IS A DOCUMENT OF CHOICES, NOT AN ORDER** (`_isCatalogueMaster`,
  `_catAddOption`, `_catSyncOption`, `elev.catalogueMaster` / `elev.catalogueOption`).
  A dealership catalogue shows ONE arrangement several times over with different artwork
  in it and the client picks, so every option piece is a real distinct item in the art
  library rather than a second copy of one piece. The reference decks say the quantity
  half out loud on the page: *"each wall will require its own pair of pieces. Consult
  your specific floorplan for full quantity of artwork."* A catalogue deliberately does
  not state quantity.
  **THE MOCKUP IS THE ARRANGEMENT; AN OPTION OWNS ONLY ITS ARTWORK.** `catalogueMaster`
  marks the wall holding the hang. Duplicating it mints an OPTION plus one dashboard row
  per slot, and the option's frames re-read `CAT_SLOT_FIELDS` (size, position, moulding,
  mat, product) off the mockup on every `drawElevAll`. That inheritance is the entire
  reason this is worth building: a free copy gives you the image swapping and not the
  arrangement fixing, so moving one frame on a six-option placement means moving it six
  times and the seventh option added next month is built from whichever copy was to hand.
  Lazy at the point of use rather than pushed from every master edit, because a master is
  dragged sixty times a second and this is the one place an option's geometry is read.
  **ONE LINK FIELD, TWO FLAVOURS.** `variationOfId` already meant "this wall exists
  because that one does", so an option reuses it rather than adding a second link with
  its own orphan rule. `catalogueOption` is what tells them apart, and the difference
  that matters is **`isVariation`**: a layout variation carries it and is skipped by
  `recalculateDashboardQuantities` so a duplicate cannot double-bill, while an art option
  is deliberately NOT flagged, because its pieces genuinely are their own line items.
  Flag an option and all four of its rows read qty 0.
  **THE MOCKUP'S SLOTS ARE A DRAWING, NOT STOCK.** `recalculateDashboardQuantities` skips
  a master outright and `buildDashCSVString` drops its rows through `_catSlotRowIds()`,
  or the schedule offers an imageless, unselectable piece beside the six real choices for
  the same wall. Option rows count normally and land at exactly 1 each, because an option
  row id is unique to its option.
  **THE CODES ALREADY WORKED, WHICH IS WHY THIS WAS SMALL.** `ART-1` is the mockup,
  `ART-1.1` an option, `ART-1.1A` a row. `_artGroupKey('ART-1.1A')` already returned
  `ART-1.1`, `_artGroupNum` already kept the dotted form instead of zero-padding it to
  `01`, and `_breakerCodeFor` already rendered the page title `ART-1.1AB`. Nothing in the
  grouping, page-titling or CSV machinery had to be taught the convention; the only
  missing part was the thing that MINTS it, which was being done by hand. A test pins all
  four, because they are load-bearing for a feature that does not own them.
  `_catBaseCode` is DERIVED from the mockup's own slots and never stored, so renaming a
  slot moves the option codes with it.
  **The switch is PER ELEVATION** (`#catMasterBtn`), on its own row under the wall-mode
  pair rather than as a fourth button in it: ART / EGD / WF say what the SURFACE is, this
  says what the wall is FOR. There is no separate "add option" control, because
  `duplicateCurrentElevation` branches on the flag and retitles itself; two gestures
  behind one button is fine, two behind one unchanged tooltip is how a designer learns
  the wrong one.
  **WIREFRAME IS A QUESTION ABOUT THE WALL, NOT ONLY THE DECK** (`_elevIsWireframe`,
  `_curElevIsWireframe`). A catalogue needs BOTH answers in one deck: grey placement
  drawings on its breakers, real photographs on its option pages. `_isWireframe()` is a
  single deck-wide flag and cannot say that, so a mockup wall now supplies its own.
  **PER ELEVATION, and that is the whole simplification.** A page-kind override was
  designed twice before the data model made it unnecessary: a mockup and its options are
  different WALLS, so the breaker and the option pages already capture different
  elevations. No module flag spanning an await (the trap `ctx.swatch` exists to avoid),
  and no second argument on `_captureElevWithGuides`, whose taking an index and nothing
  else is a pinned invariant so no caller can get a different capture from the editor's.
  The cache follows for free, because `toggleCatalogueMaster` pushes history, which
  re-reads `_elevCaptureSignature` and bumps the `_elevCapGen` in `_igCapKey`.
  The five `renderElevationToCanvas` call sites and both live-elevation renderers ask
  about the wall. **`renderFrameToCanvas` deliberately does NOT**: it draws ONE PIECE, so
  it has a row and no wall, and a mockup's slot rows never print anyway. A test pins that
  split, because "make them all consistent" is exactly the change that would undo it.
  **The `catalogue` preset keeps `wf: false`**, and that looks wrong until you see why:
  turning the deck-wide flag on would grey out the option pages that are the entire
  document. It sets `breakers: true` (a placement's dimensioned drawing IS its location
  page) and `tpl: 'setLegend'`, the shared-spec group page, which is what an option page
  is. `breakers` is read only when the preset declares it, so the five presets that
  predate the field cannot silently switch breakers off when a designer clicks between
  types.
  **A MOCKUP'S SLOTS ARE NOT PAGES AND NOT A WALL ANYONE HANGS ON.** Two shared
  functions came out of one afternoon of real use, both because the alternative was
  teaching the same rule to several hand-written copies:
  `_deckSpecRows()` is now the ONE answer to which dashboard rows earn a spec page, called
  by `_deckPageList` AND the export's `_stepsFor`, which each carried their own copy of
  `filter(r => r && (r.id || r.artworkUrl))`. That is the pairing this file has drifted on
  more than any other, and a mockup's slots are the first rule where a row EXISTING and a
  row DESERVING A PAGE come apart.
  `_elevShowingPiece(rowId, opts)` is the ONE answer to which wall is drawn beside a
  piece. There were FIVE copies (the baked data URL, the flat-graphic sheet, the
  install/breaker renderer, the classic spec page, the template spec page), and a mockup
  won every one of them because it usually sits earlier in the array and shares ids,
  letters and sizes with its options. Reported as "when I switch the presentation type
  back to Final Spec it uses the mockup elevation in the thumbnail".
  **A TRAILING SEPARATOR SURVIVED `_artGroupKey`.** `ART.1.A` gave `ART.1.`, which printed
  as a page titled "ART.1." and, once options were minted from the key, produced
  `ART.1..2A`. Hyphen codes never showed it because the suffix strip already ate `-` and
  `_`; only `.` got through. `_breakerCodeFor` had to learn the same character, since it
  slices the base off each member and strips what is left. Grouping is unchanged either
  way, so this moved the key's SPELLING and not which rows sit together.
  **Options APPEND after the last option**, not at `srcIdx + 1`: inserting next to the
  mockup every time put option 3 in front of options 1 and 2 and the rail read backwards.
  **`Per piece` switched to `'classic'`**, the legacy layout that predates the four SHOW
  ON PAGE ticks, so clicking it gave a page whose ticks mostly did nothing and whose title
  dropped the location. The deck default and the unreadable-value fallback both moved to
  `frameSpecDetail` when the per-piece layout buttons were removed; this button was the
  one caller still holding the old literal. `classic` is still valid as a REMEMBERED
  choice, which `test_mode_memory` pins separately.
  **THE PLACEMENT'S BREAKER IS THE MOCKUP'S DRAWING AND IT PRINTS ONCE**
  (`_breakerElevFor`, `_breakerNameFor`, `_breakerOvKeyFor`, `_catMockupForUnit`). Asked
  for in these words: "one breaker page with grey out with letters and dimensions, then
  following page would show each set". Taken from an option's own wall the breaker is the
  same picture as the option page behind it, with the artwork on it; one per option prints
  the dimensioned drawing three times.
  It is **STATELESS**, so neither builder carries an "already emitted" set the other could
  fall out of step with: the unit that earns the breaker is the FIRST one in the shared
  `units` array belonging to that mockup, which both builders ask independently and get
  the same answer for. Titled with the mockup's own code (`ART.1`) and keyed
  `elevgrp:cat:<elevId>`, so per-page settings stay with the PLACEMENT rather than with
  whichever option happened to come first. The `elevgrp:` prefix is load-bearing -
  `_drawInstallGuidePage` keys every breaker-specific decision off it.
  Both builders had written that "elevation holding most of these members" loop out by
  hand; they stopped being two the moment a catalogue needed a different answer.
  **AN OPTION IS THE SAME WALL, so the WALL follows, not just the frames.** Reported as
  the scale character staying put while the frames moved, which reads as a half-built
  link. `CAT_WALL_FIELDS` (size, EGD mode) and `CAT_WALL_DEEP` (`personPos`,
  `contextBlocks`, `glazing`) all describe the PLACEMENT, so an option has no business
  owning a copy. The deep ones are compared as JSON and cloned only on a difference -
  this runs on every redraw of a dragged wall, and none of them carries image data (a
  context block stores its preset KEY, never the markup).
  **`underlay` is deliberately excluded and STRIPPED at creation**: a tracing guide
  carries a megabyte data URL and never exports, so a copy per option multiplies the
  project for something no option page can show. `groupDims` / `customLines` are excluded
  for the opposite reason - the dimensioned drawing belongs to the mockup's breaker page,
  and dimension lines over an option's artwork is not what any of these pages want.
  **THE PLAN PIN BELONGS TO THE PLACEMENT** (`CAT_ROW_FIELDS` / `CAT_ROW_DEEP`). A
  dealership hangs ONE piece in that spot and picks which image goes in it, so the
  mockup's slot row is pinned once and every option's row mirrors it - including options
  that already existed when the pin was placed. Artwork fields are absent from both lists
  and a test pins that, because the whole model is that an option owns its images and
  nothing else.
  `_deckPageList` calls `_catSyncAllOptions()` before it builds: `drawElevAll` only runs
  while the Elevations tab is drawing, so a deck rebuilt from the Deck tab would otherwise
  render options against whatever the mockup looked like when it was last on screen.
  **AN OPTION IS AN ALTERNATE, NOT A SECOND PLACE ON THE PLAN** (`_catOptionRowIds`,
  filtered out of `_fpGroups`). Inheriting the pin so option spec pages could draw their
  crop immediately put every option in the floorplan legend, four pins on one spot for
  one placement. Filtered at the PLAN rather than left unpinned, because the option still
  needs the pin data - that is the whole reason both halves exist.
  **THE WALL RAIL SAYS WHICH WALL THE OTHERS FOLLOW** (`.wall-tab.cat-mockup` /
  `.cat-option` + `.wall-tab-cat`). A mockup and its options are identical in a list of
  names, and the one thing a designer needs before dragging a frame is which wall is the
  source. A LEFT STRIPE, not a tinted row: `.wall-tab.active` already owns the background
  and two colours fighting over it is how the selected wall stops reading as selected.
  The bracketed mockup name on an option stays AMBER on a blue-striped row, because the
  bracket points at the mockup and takes the mockup's colour.
  **THE INSTALLATION NOTE HAS AN INK** (`noteInk`, `_installNoteInk`,
  `_installNoteBodyRgb`). Red when it must be read before anything is drilled, near black
  for an ordinary instruction, light grey for reference that should not compete with the
  drawing. Breaker and install pages have separate globals (`breakerNoteInk` / `noteInk`)
  like the legend settings, plus the usual per-page override, and `noteInk` had to join
  `_igSet`'s `simple` list or the write is silently dropped. The BODY colour is DERIVED
  from the heading rather than stored, so one pick keeps the two in relationship instead
  of offering two dials for one decision. The drawer takes the ink as an ARGUMENT so the
  measure pass and the draw pass cannot resolve it differently.
  **EVERY SETTING WITH A BREAKER-ONLY GLOBAL MUST BE IN `BREAKER_SLOT`.** A field in
  `_igSet`'s `simple` list but missing from that map is written to the INSTALL slot while
  the breaker goes on reading its own, so the control moves a value nothing reads and
  reads as simply broken. `noteInk` shipped that way for one version ("the notes seem to
  not work anymore"). A test now walks every breaker-global field and checks both.
  **THE BREAKER'S ELEVATION ANCHORS BOTTOM-RIGHT**, in both layout branches, which is the
  reasoning the flat-graphic sheet already carried: it reads against both page edges the
  way the reference sheets do, and slack from the aspect ratio ends up as one gap beside
  the legend rather than two smaller ones with the drawing adrift in the middle.
  **SO THE NOTES MOVED LEFT** (`noteSide`, default `left` on a breaker and `right` on an
  install page, where they have always printed). The column takes its width off whichever
  edge it sits on - `SR.L +=` or `SR.R -=` - and everything below fits to those, so that
  is the whole change.
  **THE LETTER LEGEND IS THREE TICKS** (`legendDims` / `legendArt` / `legendCode`). A
  catalogue mockup carries no artwork, so the image-code line printed a column of em
  dashes on exactly the page that uses the legend most; and art dimensions are what
  somebody ORDERS from while overall dimensions are what somebody HANGS from, which one
  tick could never say. Art dimensions default OFF and the other two ON, so an existing
  page is unchanged, and they come through `_rowOpeningAndPrint` rather than a local sum.
  The block HEIGHT derives from how many lines survive, and the LETTER rides whichever
  line comes first, or unticking the top row takes the letter with it.
  **THE BREAKER'S LEFT COLUMN READS TOP TO BOTTOM: LEGEND, NOTES, PLAN.** One column,
  three things, in the order the reference sheets put them. 17.68 gave the notes their own
  slice of width (`SR.L +=`), which put them BESIDE the legend and squeezed the drawing to
  a strip - "when I have installation notes checked it pushes the letter legend to the
  right". A RIGHT column still takes width off `SR.R`, because there is nothing on that
  side to share with; a LEFT one takes none and stacks inside the column the legend has
  already reserved, at the legend's width so the two align on both edges.
  **A LEFT COLUMN CANNOT BE DRAWN UP FRONT.** The box is drawn before everything precisely
  because `_drawInstallGuidePage` has several early returns that each draw their own
  footer - but a left column has to sit under the legend, below a title band whose height
  is not known that early, and drawing at `SR.T` put it level with the title. So the left
  case is DEFERRED to the moment `_igTop` is computed, which is still ahead of every early
  return. Two `_drawInstallNoteBox` calls now, one per side, and the invariant a test
  guards is no longer "exactly one" but "both land before the first return".
  `IG_LEG_ROW_H` and the block-height expression are SHARED between the height reserved
  for the legend and the height `drawLegendBlocks` actually draws, or the notes overlap it
  the first time a legend line is unticked.
  **A BREAKER IS NO LONGER FORCED TO `elevOnly`.** The force existed so Install-guide's
  globals could not bleed onto every breaker page; `breakerVariant` / `breakerPlan` /
  `breakerPlanScale` do that job without also making the plan unreachable. The panel
  offers a REDUCED set (`variants: 'breaker'`): Elev only or Elev + plan, never
  Elev + frames, because a moulding gallery is an install-guide idea and a location page
  has no use for one. Defaults are unchanged, so an untouched deck renders as before.
  **AN OPTION ROW ANSWERS FOR ITS OWN PLAN CROP** (`_catRowAsPlanGroup`). Leaving options
  out of `_fpGroups` is right for the PLAN and broke every option's spec page, because
  `_planCropCanvasForRow` looked the row's group up there - so the floorplan thumbnail
  vanished from every spec page a catalogue has, in Final Spec too. The row can answer
  because it already MIRRORS the mockup slot's pin, so the fallback reads the row rather
  than reaching back through the walls. A mockup slot never takes that path; it has a
  real group.
  **THE PAGE'S WIDTH IS ONE BUDGET, READ FROM BOTH ENDS** (`_igColW` / `_igElevW` /
  `_igColWForElevW`, `IG_COL_MIN` / `IG_COL_MAX` / `IG_ELEV_MIN_FRAC` / `IG_COL_GUTTER`).
  Column width and Elevation width are the SAME stored number, `legendW`; the elevation
  slider writes through `_igColWForElevW`, so the two cannot disagree and there is no
  second field to go stale. Same shape as a glazing run's Width field, which is an
  operation on one truth rather than a second store. The clamp binds both ways, which is
  the fail-safe that was asked for: the drawing never drops below `IG_ELEV_MIN_FRAC` of
  the width and the column never goes under `IG_COL_MIN`, so pulling either slider past
  the limit simply stops instead of producing a page where the elevation crosses the
  legend.
  **AND A WIDESCREEN ELEVATION IS HEIGHT-CONSTRAINED, which is why the width slider first
  shipped doing NOTHING.** `fitIn` takes the smaller of the two fits, so on a 915x340
  content area a 1.9-aspect wall is already as wide as its height allows and the extra
  width is empty page - widening only bit below about 646pt, which is off the bottom of
  the useful range. The drawing is allowed to rise BESIDE the title instead (`_igDrawTop`),
  which is where the reference sheets put it and the only place the extra height could
  come from.
  It rises only when it **MEASURABLY** clears the title block (`_igTitleRight` +
  `IG_TITLE_CLEAR`), never on an assumption about the column width: a wall name is user
  text with no length limit, so a drawing started at the top margin behind a long heading
  prints through it. The measurement resolves the faces exactly as the two drawers do -
  `_titleStyleFor` / `_subtitleStyleFor` so a per-page type override is measured too, and
  **`_pdfTitleStyle`, because a title prints BOLD**; measuring the heading in regular
  underestimates it, which is the one case this guard exists for. `test_font_library`
  caught that within minutes of it being written. A failed measurement falls back to
  `SR.R`, so the drawing stays under the title rather than risking the overlap.
  **THE LETTER LEGEND FOLLOWS `_specDualUnit()`** through the one `_igLegDimText`
  formatter, because the legend prints SPEC numbers and every spec page beside it already
  printed both units. Inches first whatever the project stores, companion in brackets,
  same convention as the flat-graphic sheet's schedule. It also fixed a quieter bug: the
  stored sizes are in `dashUnit` and were being labelled with `elevUnit`, which only ever
  agreed because the two usually match. Overall dimensions and Art dimensions both go
  through it, or the two lines of one block print in two conventions.
  **THE BREAKER PLAN HAS A TARGET SIZE** (`IG_PLAN_H_FRAC`), not whatever is left over.
  Filling the gap between the column above and the page bottom meant each ticked note
  pushed the plan smaller: the more explaining the notes did, the less readable the
  drawing they explained. The size slider now covers BOTH plan modes rather than only the
  zoomed one, and reaches 140%.
  **AND IT DRAWS THE WALL LINE.** A pin says which room; the line says which wall and how
  much of it, which is what somebody standing in the room needs. Through `_wallAllSegs`
  and `FP_WALL_LINE_ALPHA` like the other five renderers, UNDER the pin so the dot sits on
  its own line, with the alpha put back or everything below inherits it. The zoom crop
  frames the LINE ENDS as well as the pin - centred on the dot alone it cuts a long run in
  half, and the half it loses is the half that says how far the hang extends.
  **The layout-guides grid folds away.** Eight deck-wide toggles, set once and then
  permanent, pushed Layout and Plan view - the controls that decide what the page IS - far
  enough down to be missed. A `<details>` like the glazing editor, closed by default.
  **A PARAGRAPH UNDER A CONTROL COSTS THE CONTROL BELOW IT.** Six of them in the
  install/breaker panel, three or four lines each, pushed Layout and Plan view below the
  fold - "there is too much going on that I missed seeing the Layout option". Every one
  is a `_dsHelpDot` on its label now (`secLbl(txt, help)`, `slider(..., help)`), which
  costs 14px and is read when it is wanted. A test counts `createElement('p')` in that
  function rather than searching for the STRINGS: the words still exist, on the tooltips,
  so a string search asserts the opposite of the intent.
  **ONE JUMP TO THE WALL.** The panel offered two: `Edit <name> in Elevations`, which
  records a return trip through `_dsJumpToElevation`, and a plain `Go to elevations`,
  which called `switchView` raw and left no way back. Two buttons for one destination is
  how a designer learns the worse one, and the worse one was the one with no return.
  **PRESENTATION LAYOUT SITS ABOVE PAGE APPEARANCE** on a spec or breaker page.
  Appearance is still BUILT ahead of the kind-specific branches, because several of them
  return early and it belongs to all of them; `_dsMoveAppearanceAfter` REPOSITIONS the
  built node rather than rebuilding it, so no branch can lose it.
  **A CUSTOM NOTE IS A ROW, NOT A LINE IN A TEXTAREA** (`installNotes.list` =
  `[{id, text, on}]`). One box of newline-separated text could be typed into and nothing
  else: no way to turn a note off without deleting it, and no way to tell which line you
  were editing. `custom` SURVIVES as a derived newline mirror of the ticked ones, the
  same shape `variationOf` keeps, so a file written here still prints in a build that
  only knows the string; the old string MIGRATES once, every line becoming a ticked row.
  **`installNotes.edits[key]` overrides a STANDARD note's wording.** The built-in text is
  the house default, not a rule - a site with its own hanging standard has to be able to
  say so, and deleting the note and retyping it loses the tick that makes it standard.
  `_installNoteText` is the ONE resolver, used by the panel's tooltip AND by
  `_installNoteLines`, or the panel shows one string while the page prints another.
  The tick and the label are separate click targets: choosing which note to READ must
  never change what PRINTS. `_dsNoteSel` is panel state, never project data.
  **THE LEGEND'S LETTER IS ITS OWN COLUMN** (`IG_LEG_LETTER_W`). Glued to the front of
  the first label it pushed line one right and left lines two and three hanging, so the
  three lines of a block started at three different x positions and it read as a
  paragraph rather than a table. Leading came down from 10/6 to 8.6/4 in the same change:
  at three lines per letter the old rhythm spent a third of the column on air, and that
  air is what the notes needed.
  **THE BREAKER PAGE'S WIDTH IS ONE BUDGET** (`_igColW`, `_igElevW`, `_igColWForElevW`).
  Column width and Elevation width are the SAME stored number read from opposite ends,
  which is what makes them track each other instead of being two settings a designer has
  to reconcile: both write `legendW`, the way the Width field on a glazing run is an
  OPERATION on the panels rather than a second store. A second field is how they drift.
  **THE CLAMP IS THE FAIL-SAFE AND IT BINDS BOTH WAYS.** `IG_COL_MIN` / `IG_COL_MAX` stop
  the column, and `IG_ELEV_MIN_FRAC` (0.45) stops it as a FRACTION too, so a narrow page
  clamps before 340pt rather than after it. Dragging either slider past the limit simply
  stops; neither end can starve the other, and the elevation slider writes through the
  same clamp so it cannot get round it.
  **ONE WIDTH FOR THE LEFT COLUMN, legend or no legend.** It used to be the legend's width
  when a legend printed and the note multiplier's when it did not, so the Column width
  slider moved nothing on exactly the page that shows a legend. The note `%` multiplier is
  now offered for a RIGHT-hand column only: an inert control beside a live one is worse
  than no control, because it teaches that the panel does not work.
  **THE LEGEND LAYS EACH LINE OUT; IT DOES NOT ASSUME IT FITS (17.96).** Label left, value
  right-aligned, and nothing checked the two against each other, so at the breaker's 150pt
  default a dual-unit size printed straight over "Overall dimensions" (safe only from about
  195pt). `_igLegLineFit` stacks the value under its label when they do not fit, and only
  then shrinks it (floor `IG_LEG_VAL_FS_MIN`). Block heights therefore VARY, so the height
  the page reserves (`_igLegendHeight`) and the drawer (`_igLegBlockRows`) share one measure,
  or the notes land on a stacked line. **The `IG_LEG_*` metrics are MODULE scope now**: they
  were function-local, and the shared measure runs outside the function, which threw on
  every breaker render while `node --check` passed. No setting, by design.
  **THE LEGEND SITS ON THE SUBHEADING'S CLEARANCE, NOT THE DRAWING'S TOP** (`_igLegTop`).
  `_igTop` carries an extra 22pt that the elevation needs for the wall dimension printed
  above it; the legend needs none of that, and starting it there left an obvious hole
  under ELEVATION DETAIL. It steps over the item code when a page carries one, resolved
  through `_igCodeId` so the clearance and the drawn code cannot disagree about whether
  there is one. Both layout branches and the notes read it, or one of them keeps the hole
  while the other moves.
  **`IG_LEG_TOP_GAP` MUST BE DECLARED ABOVE `_igLegTop`.** It was not, for one commit: the
  file parsed, `node --check` passed, and every install and breaker page threw
  "Cannot access before initialization" on render. Third time this trap has been sprung
  here after `TITLE_SIZE_DEFAULT` and `_elevIdSeq`.
  **A CATALOGUE HAS TWO AXES, AND THE MODEL ONLY HAD ONE.** An option answers "same
  layout, different pictures". The other question is "same spot, different layout": one
  big canvas, a diptych, a triptych, a salon hang, and a rearranged salon hang holding
  the same images, all offered for ONE wall. A mockup was both at once, so there was
  nowhere to put the second layout - reported as "I need a way to make several elevations
  be one placement in the plan view", after trying to express it by marking an option as
  a mockup, which minted colliding row ids.
  **AN ARRANGEMENT IS A SIBLING MOCKUP; A PLACEMENT IS A DERIVED KEY** (`_catPlacementKey`,
  `_catArrLetter`, `_catArrCmp`, `_catArrangementsOf`, `_catPrimaryArr`, `_catAltArrRowIds`,
  `_catAddArrangement`). `ART.001A`, `ART.001B` and `ART.001C` are three walls, three
  breaker pages and three drawings that share the stem `ART.001`. The placement is
  **derived by stripping the trailing letter run**, never stored, exactly as `_catBaseCode`
  is: the slots already carry it and a stored link is a second thing to keep right. A code
  ending in a DIGIT has no arrangement letter and is its own placement, which is what makes
  every project predating this group exactly as it did.
  A three-level tree with a new Placement entity was the obvious alternative and is the
  wrong shape. What was asked for is a GROUPING, and the machinery existed three times
  over: options are already filtered off the plan, the pin already mirrors down two field
  lists, and `_catRowAsPlanGroup` already lets a filtered row draw its own crop. The whole
  feature is one predicate plus one clause in a filter that was already there.
  **THE PRIMARY ARRANGEMENT OWNS THE PIN** - lowest letter, an unlettered original first,
  `Z` before `AA` (shortest letter, then alphabetical). `_catSyncArrangements` mirrors it
  onto the others through the SAME `CAT_ROW_FIELDS` / `CAT_ROW_DEEP` an option uses, and
  runs **before** the option sync in `_catSyncAllOptions`: an option mirrors its own
  mockup's slot row, so if that mockup is an alternate arrangement its slots have to have
  taken the pin first or the option lags a render behind.
  `_catAltArrRowIds` builds its map in ONE pass rather than asking `_catPrimaryArr` per
  wall, because `_fpGroups` calls it on every plan render.
  **`_catAddArrangement` RESOLVES THROUGH THE MOCKUP.** Started from an option,
  `_catBaseCode` gives the OPTION's code (`ART-1.1`), whose placement key is itself
  because it ends in a digit - so the first version minted `ART-1.1B`, a sibling of the
  option rather than of its mockup.
  **ARTWORK IS CARRIED ONTO AN OPTION, NEVER ONTO THE NEW MOCKUP.** A mockup slot is out
  of the CSV, the quantities, the PNG pack and the spec pages, so an image left on one is
  invisible everywhere. That is also what makes "rearrange the salon hang but keep these
  images" a single gesture: the new arrangement comes up empty with its first option
  already holding them.
  **A SEPARATOR IS INTRODUCED WHERE THERE IS NONE**, the one place this does not copy the
  project's own spelling. A wall spelling its slots `ART-1A` has no separator, so
  `ART-1B` + `A` is `ART-1BA` - which is also how arrangement `BA` spells itself, and
  `ART-1B` is already the id of arrangement A's second slot. The convention cannot express
  an arrangement letter, so a hyphen goes in. A project that already uses one (`ART.001A-A`)
  keeps it.
  The plan LEGEND labelling the primary arrangement rather than the placement was
  listed here as pending; 17.97's spelling resolved it (the primary's slots are
  `ART.1A/B/C`, so the group key IS `ART.1`) and `test_catalogue_overview` pins it.
  **NOTHING IN A CATALOGUE BILLS, AND THAT REFINES AN EARLIER DECISION RATHER THAN
  REVERSING IT.** A mockup slot was already skipped. An option now is too
  (`_isCatalogueOption` in `recalculateDashboardQuantities`). The earlier "1 per catalogue
  item" answer was about IDENTITY - is an option's piece its own item with its own code
  and image, or a copy of the mockup's? Still its own, and a test pins that zeroing the
  quantity did not merge the rows. QUANTITY is a different question and a catalogue
  deliberately does not answer it: the reference decks print *"Consult your specific
  floorplan for full quantity of artwork."* Nine option rows at qty 1 claim nine pieces
  get bought when three hang.
  Deliberately **not** done by flagging `isVariation`, which also drives orphan promotion
  and the derived `variationOf` mirror. Its own clause, and a test reads for it.
  **A MOCKUP SLOT TAKES NO ARTWORK** (`_catRowTakesArt` / `_catRefuseArt`). An image
  dropped on one went nowhere and said nothing. Enforced in the DATA at all three write
  paths - `applyArtworkToCurrentRow`, `applyArtworkToRowIndex`, `_bulkApplyArtwork` - plus
  `_bulkMatchPieces`, which must not even OFFER a slot as a relink target. Hiding the
  upload box is not enough, the rule `setRowPrintOutput` already follows for window-film.
  A negative control has to break ONE path at a time: the check names which of the three.
  **THE PNG PACK WAS THE LAST OUTPUT STILL EMITTING SLOTS.** Quantities, spec pages and
  the CSV all filtered them; the batch loop walked `dashProjectData` wholesale, so each
  slot exported an empty file named after the arrangement into a folder bound for a
  printer. When a rule says "excluded from output", check all four.
  **A PLAIN DUPLICATE MUST DROP THE CATALOGUE FLAGS.** `duplicateCurrentElevation`'s
  ordinary path kept `catalogueOption` while overwriting `variationOfId` with the SOURCE's
  id - so a duplicated option pointed at another option rather than at a mockup,
  `_catMasterOf` returned null, `_isCatalogueOption` read false, and
  `toggleCatalogueMaster`'s guard (which exists to stop exactly this) let the wall be
  marked a mockup. That is how a second set of row ids identical to the first got minted.
  **TWO ROWS WITH ONE ID IS CORRUPTION, NOT AN UNTIDY LIST** (`_catRowIdsTaken`, shared by
  both minters): `counts[d.id]` gives both the same quantity, `_elevShowingPiece` returns
  whichever it meets first, and the CSV emits the piece twice. There is no repair once the
  rows exist, so both minters refuse up front.
  **THE DASHBOARD SAYS WHICH ROWS ARE DRAWINGS AND WHICH ARE CHOICES**
  (`.dash-cat-slot` amber, `.dash-cat-option` blue), the same two colours the wall rail
  uses so one language covers both places these walls appear. A LEFT STRIPE on the first
  cell, never a row background: `tr.selected` owns the background and a tint fighting it
  is how the selected row stops reading as selected. On the CELL because a box-shadow on a
  `tr` is unreliable under `border-collapse`. Both sets are computed once per render, not
  per row - each walks every wall.
  **A LAYOUT IS LINKED OR FREE, AND THAT ONE FLAG IS THE WHOLE ORGANISING IDEA**
  (`_catLayoutIsFree`, `catalogueFree`). The designer described two things in one breath:
  four rearrangements of the same three frames, and a single / triptych / salon hang
  offered at one spot. They are the same object with different inheritance.
  LINKED takes the primary's frame SPEC by letter and owns only its positions - change a
  size on ART.1A and B, C and D take it, which is what was asked for in as many words.
  FREE owns its frames outright. **Absent means linked**, so nothing is written for the
  common case and a project predating the distinction opens with its layouts following
  the primary, which is what they were doing anyway.
  **MATCHED BY LETTER, which is what makes one rule cover both cases.** A five-piece
  salon hang under a three-piece primary has no counterpart for D and E, so those are
  simply its own. No second mechanism for "different frame counts".
  **`CAT_SPEC_FIELDS` IS DERIVED FROM `CAT_SLOT_FIELDS`, minus x and y.** An OPTION is
  the same arrangement with different pictures so it takes position too; a LAYOUT is the
  same frames somewhere else, and inheriting x/y would make every layout the same layout
  - the one thing that must never happen. Derived rather than written out again, or a
  field added to a frame reaches one list and not the other.
  **THE WALL RUNS DOWN THE PLACEMENT; THE DIMENSION LINES STOP AT A LAYOUT.** Four
  layouts for one spot are four drawings of the SAME wall, so size, character, context
  and glazing follow the primary. `groupDims` / `customLines` are in `CAT_WALL_DEEP` but
  explicitly skipped on the layout hop: a group dim measures a gap BETWEEN FRAMES and the
  frames are somewhere else on every layout, so it would measure the wrong thing. It
  reaches an OPTION, which is the same arrangement, and stops there.
  **AN OPTION NOW CARRIES THE MOCKUP'S WHOLE DRAWING**, reversing an earlier exclusion.
  `groupDims`, `customLines` and the callout spacers (`CAT_SLOT_DEEP` = `dimTo`,
  `distToggles`) all mirror. The old reasoning was that the dimensioned drawing belongs to
  the breaker page; the designer asking for the opposite is better evidence, because that
  dimension work IS the layout work and a mockup whose measurements do not reach its own
  options means doing it once per option.
  `CAT_SLOT_DEEP` is deep because `distToggles` is an OBJECT: the shallow `!==` compares
  references, so it would copy one every pass and then SHARE it between two walls, which
  aliases them through every undo snapshot.
  **THE CHOICE IS MADE AT CREATION** (`_catLayoutChooser`). Linked and free look identical
  once they exist, so a default is a decision made silently that has to be discovered
  later. The + LAYOUT button opens a chooser naming both kinds and collecting the layout's
  NAME, which is known at that moment and otherwise gets hunted for in a panel afterwards.
  **THE RAIL HAS THREE ROLES, NOT ONE** (`_catRailRoles`, `.cat-primary` / `.cat-layout` /
  `.cat-option`, `.wall-rail-place`). All three used to render the word MOCKUP, so the
  single most important relationship on a placement - WHICH WALL GOVERNS THE REST - was
  invisible and four layouts read as four unrelated walls. Reported as "hard to stay
  focused knowing what is what".
  SOLID amber governs, HOLLOW amber follows it, blue is an image option; the stripe
  answers the question a designer has before touching a frame, which is whether this edit
  reaches other walls. A placement HEADER plus one level of indent turns four near
  identical codes into a tree. The walls are already in order because both minters append
  after the last wall of the placement, so no re-sort is needed - and re-sorting would
  fight the hand drag-reorder this rail already supports.
  Built in ONE pass with a map rather than asking `_catPrimaryArr` per wall: this runs on
  every wall click, rename, drag and undo.
  **THE CODES DID NOT CHANGE, AND THAT WAS THE POINT.** `ART.1` placement, `ART.1B`
  layout, `ART.1B.2` option, `ART.1B.2-A` piece. The hierarchy was always in the code; the
  rail simply never drew it. Fixing the display rather than the convention meant no saved
  project moved.
  **THE LAYOUT'S NAME IS NAVIGATION, THE CODE IS IDENTITY** (`catalogueLabel`,
  `_catLayoutTag`, `_catLayoutTagForRow`). Single / Triptych / Salon hang is how a
  designer thinks about a placement and `ART.1C` is how the deck prints it, so the name
  sits BESIDE the code and is never folded into it. ONE tag builder, shared by the rail,
  the breaker subtitle (`ELEVATION DETAIL · C — Triptych`) and the CSV's trailing
  `Arrangement` column, or the page and the schedule describe the same placement two
  different ways and a designer reads that as two different things.
  The subtitle carrying user text means `_igTitleRight` has to measure it too, or the
  drawing rises into exactly the part of the title block that grows.
  **`_igElevIdx` NEVER EXISTED.** The subtitle was written as
  `_catLayoutTag(elevations[_igElevIdx])` when `arg` IS the elevation on that path.
  `node --check` passed and six test files went red at render. Fourth in this family after
  `_round2`, the blanket rename and the landmark slice, and the one that caught it was the
  existing suite rather than anything new: `test_no_undefined_helpers` checks CALLS, not
  bare identifiers, so a stray variable still gets through. Grep the identifier before
  trusting a parse.
  **A TEST THAT SETS UP BEFORE THE CLONE TESTS THE CLONE, NOT THE MIRROR.**
  `_catAddOption` clones the whole wall, so an option minted from an already-dimensioned
  mockup carries the drawing whatever the sync does - the dimension-mirroring check passed
  with the mirroring deleted until the fields were set AFTER the option existed. Found by
  deleting it.
  **FOUR LEVELS, ALL DERIVED FROM THE CODE** (`CAT_CODE_RE`, `_catCodeParts`,
  `_catPlacementKey`, `_catSetKey`, `_catSetNum`, `_catArrLetter`, `_catSetsOf`,
  `_catPlacementPrimary`):
  `ART.01` placement + frame set 1 + its primary layout, short form; `ART.01A` layout A;
  `ART.01A.1` image set 1; `ART.01.2` FRAME SET 2; `ART.01.2A` layout A of set 2.
  A FRAME SET is a different set of frames offered at the same spot - a single piece
  where set 1 is a salon hang. A LAYOUT is those same frames somewhere else on the wall.
  **THAT DISTINCTION USED TO BE A FLAG (`catalogueFree`) AND IS NOW A LEVEL, which
  RETIRES the flag.** Within a frame set every layout shares the frames, because that is
  what a frame set is; two ways to express one idea was the confusion the level was added
  to remove, so the flag does not survive as an escape hatch and a test asserts it is
  gone rather than merely unused. It shipped and was removed the same day, so no real
  project carried it.
  **THE ONE AMBIGUITY AND HOW IT IS RESOLVED.** `ART.01.2` could read as placement
  `ART.01` set 2, or placement `ART` set `01.2`. The rule is that a PLACEMENT ENDS AT ITS
  FIRST NUMBER GROUP and a second dotted number after it is the frame set. The regex
  requires the WHOLE code to parse, so the lazy prefix only settles early when what
  follows really is `.<digits>` plus letters - which is why `L2.ART-2` still resolves to
  itself rather than to `L2`, and `L2.ART-2.3A` to set 3 of it. A test walks six shapes.
  **IMAGE OPTIONS ARE NOT PARSED.** An option is identified by its LINK
  (`catalogueOption` + `variationOfId`), never by its spelling, which is the only reason
  an old `ART-1.1` cannot be mistaken for a frame set.
  **THREE SCOPES, AND KEEPING THEM APART IS THE WHOLE MODEL** (`_catSyncArrangements`):
  the PLACEMENT owns the wall (size, character, context, glazing) and the one plan pin,
  because every frame set offered at one spot is on the same physical wall; the FRAME SET
  owns the frame SPECS, matched by letter; the LAYOUT owns its positions and its own
  dimension callouts; an OPTION owns only its images. Mixing any two is how a triptych
  ends up wearing a salon hang's frame sizes.
  **ONE PIN PER PLACEMENT** means the primary layout of the PRIMARY SET, so the tiebreak
  is set number FIRST and letter second. A letter-only comparison looks right and is
  wrong the moment set 1's primary is lettered (`ART-1A`) while set 2's is not
  (`ART-1.2`): the unlettered one sorts first and takes the pin. The obvious fixture
  cannot see it, because there both primaries are unlettered and array order covers the
  bug - the check had to be built to make them disagree.
  **ONE MINTER, TWO CODES** (`_catAddArrangement(srcIdx, {newSet})`). A frame set and a
  layout differ only in the code they compute and where they land: a LAYOUT after the
  last wall of ITS SET, a FRAME SET after the last wall of the whole placement. Appending
  a layout at the end of the placement drops `ART.01B` behind `ART.01.2A` and the rail
  stops reading as a tree. The slot renaming, the artwork carry and the collision guard
  are shared, which is where a second copy would drift.
  **`.action-btn` IS `width: 100%`, AND THAT BIT AGAIN.** The `+ LAYOUT` and `+ SET`
  buttons were given `flex: 0 0 auto`, which takes its BASIS from `width` and then forbids
  shrinking - so three buttons in one row each demanded the whole panel and two rendered
  outside the left panel entirely. The pair has its own row now at `flex: 1 1 0` with
  `min-width: 0`, which is what two equal actions want anyway, and the ROW carries the
  hide so a wall outside a catalogue has no empty 26px band. Third time this constant has
  caught someone after the gear popup's Pill button; the check is now general - no
  `.action-btn` in index.html may combine `flex:0 0 auto` with no width of its own.
  **THE RAIL DRAWS THE TREE** (`_catRailRoles`): a placement header, then SOLID amber for
  a frame set's reference drawing, HOLLOW amber for a layout of those frames, blue for an
  image set, at three indents. Badges read `SET n · PRIMARY`, `LAYOUT B`, `IMAGES 1`. The
  CODES DID NOT CHANGE and that was the point - the hierarchy was always in them and the
  rail simply never drew it, so fixing the display rather than the convention moved no
  saved project.
  **SAME IMAGES, DIFFERENT FRAMES IS A TOOL, NOT A LEVEL** (`moveElevArtwork`,
  `ELEV_ART_FIELDS`, `_elevArtPayload` / `_elevApplyArt`). A salon hang reshuffled is
  another IMAGE SET, which the codes already express; what was missing was any way to get
  one without re-importing five files. Two gestures now: duplicating an OPTION mints a
  sibling option CARRYING the pictures, and dragging a row in the frame list moves a
  picture to another frame.
  **THE DRAG IS IN THE LIST, NOT ON THE WALL**, because dragging a frame on the wall
  already means move the frame, and one gesture meaning two things depending on what is
  under it is how a designer learns neither. THE FRAMES DO NOT MOVE: only artwork is
  reassigned, as a list reorder rather than a two-way swap, and the dashboard ROW travels
  with it or the wall and the spec page disagree about which picture is piece B. A drag
  begun on an input or a button belongs to that control, not the row.
  `ELEV_ART_FIELDS` exists because "the artwork" was written out four times and a missed
  field is a picture that half-moves - its crop left behind, or its image code naming the
  wrong file.
  **DUPLICATING AN OPTION USED TO FALL THROUGH TO THE LAYOUT-VARIATION PATH**, producing
  an `isVariation` copy that shared the option's row ids and was neither a new option nor
  anything the model knew. The check that guarded the old bug now asserts the INVARIANT
  instead: nothing may claim to be an option while pointing at a wall that is not a
  mockup. That is the shape that let a wall be marked a mockup and mint colliding ids.
  **`_igElevIdx` NEVER EXISTED**, and a patch script that aborts mid-way writes NOTHING -
  so a substitution reported `ok` in a run that then failed is not applied. Both cost a
  round here. Grep the identifier, and re-check the anchors after a failed patch.
  **THE MATRIX TURNED OUT TO BE TWO VIEWS (18.06).** Per placement it is the Options
  map, which already shows filled / total on every node. What was missing was the
  DECK-WIDE question, "which of the 200 openings still have no picture": that is
  `openCatalogueOverview` / `_catOverviewData`, a row per placement (`_catPlaces`
  order) and a cell per image option (`_catTree` order, so a row reads like its pages).
  An arrangement with no options gets a dashed "no image sets" cell rather than
  vanishing. Offered only once there are two placements, from the Options map, the deck
  panel's Options section and Jump to. A matrix of arrangements x option numbers would
  have been almost all empty, because since 17.97 an option number belongs to exactly
  one arrangement.
  Still to build: the two option page kinds (presentation page, spec
  page), a
  `Catalogue Option` / `Arrangement` CSV column (with qty left BLANK rather than 0, since a
  0 a vendor reads is worse than an absent number), notes on the LEFT of a breaker page
  (they print as a right-hand column today), and Deck Studio arrows and lines that borrow
  `annotationStyle` so a callout matches the drawing under it.
- **17.97 REPLACED THE FOUR-LEVEL SPELLING: OPTIONS ARE ART.1.1, ART.1.2, ART.1.3 ACROSS THE
  PLACEMENT, AND EVERY ARRANGEMENT IS A LETTER.** The designer chose "option number in the
  code". Read the older catalogue notes above with this in mind: a frame set is NO LONGER
  spelled `ART.01.2`; it is the next free letter of the placement (`ART.1B`) with
  `elev.catalogueSet` stored on the mockup, and `_catSetNum` / `_catSetKey` read the wall
  first (`_catWallSetOf`) and parse only as a legacy fallback. The set KEY they return is a
  grouping key, never a code anything is named with. Layout-vs-set inheritance is unchanged.
  Why: image options and frame sets shared one number line (ART.1.1 images, ART.1.2 frames,
  ART.1.3 images), so "option 3" meant nothing on a page.
  **`_catSettleAll()` runs first inside `_codesSettle()`**: `_catMigrateSetCodes` converts a
  legacy project once, `_catRenumberOptions(place)` numbers options 1..n in TREE order
  (`_catTree`: set, then letter, then stored option number) through two-pass temp renames,
  and `_catOrderWalls(place)` puts the placement's walls in tree order in the slots they
  already hold. Rows of a catalogue sort by their wall and frame position (`catOrd` in
  `_codesSortRows`), which is what makes each breaker be followed by ITS options, in both
  page builders, without touching either.
  **Every arrangement mints its first option** (empty when not carrying), or it produced no
  unit and therefore no breaker and no pages. **Deleting an option deletes its rows**; they
  were orphaned and printed as stray spec pages holding their number.
  **A catalogue placement is a renumber unit like a plain one**: `_codeUnitOf` gives its stem
  (`_catStemOf`, dot codes only) and `_codesRenameStem` renames everything under it at a
  number boundary. Its temp stem must itself parse as a stem (`ZZRN<letters>.9000nn`), or
  the second pass cannot find it. `_renamePageKeys` now also moves `catov:` keys.
- **`_elevArtImgCache` keeps decoded artwork nodes alive across redraws.** `drawElevAll`
  wipes `#frame-layer` and runs on EVERY mousemove of a drag, so rebuilding
  `<img src="data:…">` each pass re-decoded every artwork ~60×/sec. A 24" print hid it;
  a full-wall wallcovering did not — that was the reported stutter. Keyed on **letter +
  source length + last 32 chars**: letter alone shows the previous image after a swap,
  source alone lets two frames sharing an image steal the node from each other (a second
  `appendChild` *moves* it), and the whole data URL in the key is megabytes of string
  work per frame per redraw. Swept per pass, with a guard so a redraw that drew nothing
  isn't read as "all stale".
- **`_spacingLabel(v)` is the one label source for spacing + edge-gap dims**, so
  `dimVisibility.spacingEQ` (print `EQ` instead of the number, the drafting convention
  for equally spaced) can't reach some of the six call sites and not others. An explicit
  toggle, never an automatic "are these equal?" test — EQ is a statement of intent.
- **The drafting standard travels in the project file.** `annotationStyle` and
  `elevDualUnit` are localStorage (per-machine drafting prefs) AND optional top-level
  project keys. Absent means the file predates the idea, so local settings stand —
  loading an old project must not wipe them. Present means **merge** onto the live
  `annotationStyle` (every renderer holds a reference, and a file missing a newer field
  would otherwise leave it undefined), then `_normalizeAnnotationStyle()` +
  `applyAnnotationStyleToCSSVars()` + `saveAnnotationStyle()`. Never trust
  `fontFamily` from the file — it's derived.
- **"New elevation for this graphic"** is an option in the *Push to Wall* selector, NOT
  a side effect of the product dropdown. `loadDashDataIntoControls` calls
  `handleDashProductChange` on every row **selection**, so auto-creating there would
  spawn one wall per flat row every time you clicked through a loaded project, orphan a
  wall whenever you switched product and back, and drift `qty` (which
  `recalculateDashboardQuantities` derives from frame counts). The new wall is sized
  graphic-width × (graphic-height **+ baseboard**), since the graphic sits above the
  baseboard and a wall exactly its height would make fit-to-wall shrink the piece.
  A `<select>` silently ignores a value with no matching option, so the index comes from
  a local, not from re-reading the DOM.
- **`_rowOpeningAndPrint(row)` is the single definition of opening + print-file size.**
  It was copy-pasted into FIVE places — `updateTableRowCalcs`,
  `updateDashVisualsFromDOM`, `renderDashTable`, `buildDashCSVString` and
  `buildSpecStrings`' sizes block — four of which are displays of the fifth. They had
  already drifted: two added bleed to a raw negative opening while two clamped first, so
  an over-matted piece printed two different file sizes. Clamping first won. Takes a
  plain object so the DOM-driven caller can pass assembled form values; converts nothing.
  A new product needs one clause here, not five.
  A new spec **label** needs registering in `SPEC_ROW_GROUPS` *and* in the **five**
  hardcoded allowlists (2 group-page PDF renderers + 3 `_deckMockHTML` previews) or that
  layout silently drops the row. RENAMING one is the same job: a half-landed rename shows
  the row on some layouts and not others.
- **`Art Dimensions` on the spec page is the image OPENING, not the print file.** It was
  the print size (opening + bleed) under the label `Image Size`, which is a production
  number on a client page and invited ordering art at that size. The CSV had drawn this
  distinction all along and keeps its own names: **`Art Size W/H` = opening,
  `Image Size W/H` = print file**. Those columns are addressed BY NAME by the InDesign
  script, so they were deliberately NOT renamed with the row — the page label and the CSV
  header are allowed to differ here, and that is the one place in this file where they do.
- **`_titleBand` / `_drawPageTitle` IS WHERE A HEADING AND SUBHEADING PRINT, on every
  page this file DRAWS rather than lays out from a template.** There were nine answers,
  on pages that sit next to each other in one deck: the floorplan key and the frame list
  at `M + 14` / `M + 30`, Thank You at `M + 18`, Contents and the artwork index at
  `M + 24` off a margin of **54** while everything else used 40, the placeholder at
  `M + 44` and indented another 24pt, the group pages at `TY + 20 * 0.72`, the install
  and flat-graphic sheets at `SR.T + size * 0.72`, and the template spec pages wherever
  the affine remap happened to drop `tpl.title`. Reported as "all the titles look
  different in the preview, which I think will confuse many designers."
  **THE GUIDE SET ALREADY CARRIED THE ANSWER.** `hlines` on the Farmboy sets (0.145 /
  0.205) ARE the two cyan ruler guides: the heading's BASELINE sits on the first and the
  subheading's on the second, which is how the InDesign master is drawn and how every
  layout template in this file was authored. The spec templates still say `title.y .15`
  and `spec.y .2` — they were authored correctly and corrected wrongly downstream.
  A ruler guide past `TITLE_GUIDE_MAX` (0.30) is somebody's layout line, not a title
  line, and is ignored — deliberately BELOW a third, because Rule of Thirds draws at
  0.3333 and honouring it would print the heading a third of the way down the page. A
  set that declares no title lines (Margins only, Rule of Thirds, Center) keeps the
  historical offsets off its OWN safety frame, so only a set that declares them moves
  anything.
  **THE HEADING IS `_titleStyle()`** — the Type defaults dial that used to reach four
  spec renderers and nothing else, which is most of why these titles did not match. Two
  of those four also floored it (`Math.max(ts.size, 22)`), so turning the deck title
  DOWN moved every page except them; the floors are gone. A page with its own type
  override passes it in (`opts.font`/`weight`/`size` — the timeline does) and borrows
  only the POSITION. `opts.color` takes a hex OR an `[r,g,b]` triple, because a page
  that resolves its ink from the page theme already has the triple.
  **THE TYPE IS DRUK 32 OVER DRUK 22** (`TITLE_SIZE_DEFAULT`, `PAGE_SUBTITLE_FONT/SIZE`),
  which is the InDesign master: its heading is 0.06 of a 540pt page (32.4pt) and its
  subheading 0.0408 (22pt). The heading is a dial; **the subheading is not**, because two
  dials for one relationship is how a deck ends up with a 32pt heading over a 10pt
  subhead on one page and not on the next. The subhead keeps its own grey
  (`PAGE_SUBTITLE_INK`) — it is a secondary line, not a second title.
  These four consts sit **above `let editorialContent = _editorialDefaults()`**, and that
  placement is load-bearing: that line RUNS at module scope, so a const declared further
  down is read in the TDZ and the file dies on boot with "Cannot access
  TITLE_SIZE_DEFAULT before initialization". Same trap that made `_specCodeStyleDefault`
  a function; a plain number just needs declaring first. A test pins the ordering.
  **`titleStyle` IS WRITTEN INTO EVERY PROJECT** by `_editorialDefaults()`, so changing
  the default reaches new decks and nothing else. `_mbMigratePages` bumps a stored 22 to
  32 **once**, keyed on `typeDefaultsV` rather than on the value — key it on the value
  and a designer who deliberately sets 22 has it bumped back on every load.
  **A 22pt subheading changed two things a 10pt one never could.** It can overrun the
  page (a level name is user text with no length limit), so it goes through `_dsFitTitle`
  like the heading; and content under it starts from its BASELINE, so the gap has to pay
  for its descenders — `PAGE_SUBTITLE_CLEAR`, derived from the size so there is still one
  number to change. At 10pt the old flat 8pt gap hid this; at 22pt the first spec row's
  caps landed inside the descenders. Only the pages that actually PRINT a subheading use
  it: the rest clear an empty guide line.
  **ONLY WHAT SITS UNDER THE HEADING CLEARS THE BAND.** The floorplan image, the
  spec-page artwork, the as-hung drawing and the flat sheet's elevation are all to the
  RIGHT of the title column, so they rise beside it exactly as before. Pushing the
  as-hung drawing down to the band cost it 37pt for nothing AND squeezed the bottom
  band under it until a 12-moulding frame strip that used to drop itself squeezed in
  instead — a threshold three points away, found by `test_shared_spec_legend`.
  **THE TEMPLATE REMAP'S VERTICAL ANCHOR IS THE TITLE LINE, NOT THE TOP MARGIN.**
  `_drawSpecPageTemplate` maps the design envelope onto the safety frame, and the
  envelope's top IS `tpl.title.y` (the highest thing in every template), so mapping it
  to `SF.t` dragged the title onto the top margin and the spec block behind it. The
  HORIZONTAL half is untouched: a column starting on the left safety edge and a mockup
  ending on the right one is what it was added for, and that part was right.
  **A guide-set switch now drops the built pages** (`_setDeckGuide`), gated on `setId`
  changing. The set does not just draw the frame, it decides the layout — margins AND
  title lines — so switching it re-typesets the deck. `show` / `grid` / `snap` change
  nothing that prints and must not trigger a rebuild, or a checkbox stalls the app.
- **THE HEADING AND SUBHEADING ARE CLICK TARGETS ON THE RENDERED PAGE**
  (`_dsTitleHandles` + `_dsOpenTitleTypePopup`). The preview is a picture of paper with
  no DOM text to select, so this only became cheap once the title band existed: there is
  ONE answer to where each line sits on every automated page, so two boxes can be placed
  without knowing anything about the page underneath. They go in BEFORE `_dsRenderAnnots`,
  so a note or arrow dropped over the title keeps the click — that one was placed by hand.
  **WHICH PAGES PRINT A HEADING IS RECORDED, NEVER PREDICTED** (`_dsTitleSlots`,
  written by `_drawPageTitle` / `_applySubtitleType`). A predicate by page KIND looked
  obvious and is wrong: a fixed page renders as an element page when it has elements and
  falls back to the prose renderer when it does not, so the answer depends on content,
  and any hand-kept list would drift from the renderers. A spec page renders
  asynchronously, so the overlay is built before the drawer has said anything — one
  debounced `_dsRenderCenter()` closes that gap and cannot loop, because the second pass
  records the same values and returns early.
  **`_titleStyle()` STILL MEANS THE DECK VALUE.** It is what the Type defaults panel
  reads, and folding the current page's override into it would make that panel show one
  page's exception as if it were the house style. Renderers ask `_titleStyleFor()` /
  `_subtitleStyleFor()`, which resolve against `_curPageKey` — set by all four render
  paths before the body draws, the same hook `_curFooter` uses, so nothing is threaded
  through twenty renderers.
  **DECK-WIDE IS THE DEFAULT SCOPE AND STAYS SELECTED.** A per-page control that
  defaults to per-page is how twenty spec pages end up with twenty headings, which is the
  report the band came out of. `pageTitleStyle[key] = { title, sub }` mirrors
  `pageFooters`, and **only the fields actually overridden are stored** — a page that
  pins its size still follows the deck when the typeface changes. `_clearPageTypeStyle`
  prunes the empty shells, or a project that has had every exception removed carries a
  map of blank objects into every autosave and undo snapshot.
  **`_pageTypeChanged` is DEBOUNCED**, because the colour input fires `oninput`
  continuously while its swatch is dragged and each one would re-typeset the whole deck
  and push an undo entry. Same shape as `_ctxScheduleHistory`.
  **THE POPUP OPENS LEFT-ALIGNED UNDER THE LINE**, from the handle's measured rect
  rather than at the cursor — opening at the click put the panel over the text being
  changed, so the one thing you need to watch was the one thing hidden. The rect has to
  be captured BEFORE `_dsRenderCenter()`, which replaces the element it came from.
- **`FRAME_TEXT_INKS` IS THE FONT-COLOUR QUICK PICK, and it is not an invented ramp:**
  six of its ten ARE the studio defaults (#141414 titles, #6e6e6e subheadings, #9c9c9c
  captions, #8a8a8a thumbnail captions, #222222 body, plus white for type on a dark
  page), so the dot under a designer's current colour is normally already lit. Ordered
  light to dark like a tint chart, unlike the Neutrals row's black-first.
  **THE RAMP IS GREYS AND THE ONE HUE BESIDE IT IS RED**, on its OWN family row. Red is
  what a note or a called-out line weight is set in, so it is a real ink in this studio
  rather than a colour you might fancy — and it is the same `#e00000` the shared Accents
  family already offers, so a red heading and a red annotation match instead of being
  two reds nobody chose. Its own row and not an eleventh dot on the ramp: after #000000
  an extra dot reads as a darker step, and red is a departure from the ramp rather than
  the end of it. Anything else that is an ink rather than a shade joins that row; a
  colour that is neither is still a decision worth making in the picker.
  **THE PICKS HANG OFF THE COLOUR DOT** (`_dsInkQuickPicks` + `_dsOpenInkPopover`), not
  inline beside it. A ten-dot strip under each style is four extra rows in the Type
  defaults column — the panel that had just been compacted to stop it scrolling. On the
  dot it costs no height until asked for, and one implementation covers all four font
  colours (deck styles, Type defaults, the text gear popup, the layout toolbar) rather
  than the two someone remembers to wire up. The arrow, shape-fill, category and
  timeline-stage pickers are deliberately NOT wired: they are not type, and this
  strip there offers the wrong palette.
  **A COLOUR INPUT OPENS ITS SYSTEM DIALOG ON THE CLICK, NOT THE MOUSEDOWN.** Cancelling
  only the mousedown showed the picks while the button was held and then let the RGB
  dialog take the screen on release — reported as “a flash of the grey colour choices and
  then it opens the RGB picker”, with the giveaway that holding the button down showed
  the strip perfectly. `_dsInkQuickPicks` cancels both. Custom… is the one click that IS
  meant to open it and gets through on `input._inkNative`, a flag rather than an unbind
  and rebind, which would leave the input bare if the dialog were dismissed with no
  choice made.
  **INSIDE A PANEL THAT IS ALREADY OPEN, THE STRIP GOES IN THE PANEL** (`_dsInkStripInto`,
  and `_dsTypeSection`'s `opts.inkInline` to stop the row wiring the popover as well). A
  popover over the heading popup is a second floating thing over the first AND the gesture
  that fights the input it hangs off. In the heading popup it sits BETWEEN the type row it
  changes and the scope buttons that decide who the change reaches, which is the order the
  decision is made in. Same renderer either way — `_frameSwatchesInto` with
  `FRAME_TEXT_INKS` — so a colour picked from a panel and one picked from a popover cannot
  come out of different palettes.
  **The element stays a real `<input type="color">`** — only the gesture that opens the
  system picker moves behind Custom — so every existing handler and test that addresses
  it by `value`/`oninput` keeps working, and the full range is still one click away.
  **`_frameSwatchesInto` gained `opts.nearest`**, which rings the closest dot when the
  current colour is near the strip but not on it (#1a1a1a beside #141414). Lighting
  nothing reads as "no colour selected" — the trap `_personShadeNearestHex` was added
  for on the scale figure. Opt-in, so the exact-match strips are unaffected.
  **It resolves across EVERY family, never within each one.** Per-family it picks a winner
  per ROW, which was invisible while there was one row and wrong the moment red got its
  own: a #1a1a1a heading lit the black dot AND the red one, and the strip claimed two
  colours were selected at once. Adding a family is what surfaces this, so check it before
  adding a third.
  **`_subtitleClear()` is a FUNCTION, not a constant**, for the same reason: the
  subheading size is settable now, so a gap computed once from the default would let a
  40pt subhead print straight through the first row under it.
- **CHROME STAYS ON THE PAGE (`_dsPinChrome`).** The page clips at the trim, because it
  is a picture of paper. That is right for CONTENT and wrong for the controls hanging
  off it: the move grip sat at `left:-11px`, the gear at `right:-22px` and the zoom
  stepper at `bottom:100%`, so on a full-bleed element every one of them was outside the
  page and therefore **unreachable** — the control existed and could not be clicked.
  Reported as "I lose my image placeholder setting + since it falls off the screen".
  **CLAMPED, not moved into an unclipped layer above the page.** Every drag handler here
  works from POINTER DELTAS (`ev.clientX - sx`), never from the handle's absolute
  position, which is what makes clamping safe: a handle pulled inside still resizes from
  wherever it was grabbed. It also reads correctly — a handle on the trim says "this
  edge runs off the page". An element wholly on the page is not moved at all.
  `Math.max` must be the OUTER call (`max(PAD, min(size - w - PAD, …))`) or an element
  wider than the page resolves to a negative position and the control leaves the other
  side. The clamp subtracts the chrome's own size, so its far edge is pinned too.
  The clamp writes `left`/`top` in px and clears `right`/`bottom`/`transform`/
  `margin-bottom` — the four properties the unclamped versions positioned with, any of
  which would fight it. A test asserts none of them survive in any chrome builder.
  **The page size rides on the box** (`box._page`, set at all four annotation boxes)
  rather than being threaded through five signatures, so a new control gets the clamp by
  asking for it. `_dsBoxWH` reads the box's own size back off what was written to it.
  **The editable layout canvas is fixed differently (18.03, `_mbPinChrome`).** Its
  boxes are in PERCENT and a text box has no height, so there is nothing to do the
  arithmetic on; it MEASURES instead, after every box is in the canvas, and slides each
  `[data-mb-pin]` control (`edge` = resize handles, `pad` = gear and pan disc) back
  inside. A canvas measuring zero is left alone. `test_mb_chrome_onpage` carries a tiny
  fake layout engine because jsdom has none.
  **A SELECTED IMAGE PUTS ONE CONTROL IN EACH CORNER IT CAN REACH.** Grip and zoom
  stepper top-left, resize and corner-radius top-right, settings bottom-left. They all
  wanted the top-right at one point, and once the clamp pulled them onto the page they
  landed on the same few pixels.
  **The top-right pair ladders inward** (`DS_CORNER_SLOT`, `_dsCornerSlot`): resize on
  the corner, radius one slot in. A DIAGONAL step of d separates two squares of side n
  only if d >= n — both are 11px, so a 10px slot left them overlapping by a pixel on
  each axis. And the radius hangs off the resize handle's FINAL position, not the box
  corner: the resize handle clamps to the trim on a full-bleed element, and a radius
  measured from the unclamped corner closes the gap straight back up.
  **The zoom stepper hangs off the grip the same way** (`box._gripBox`, written by
  `_dsMoveGrip`), left-aligned and `DS_GRIP_GAP` below it. "Close but never touching"
  cannot be a fixed offset from the box for exactly the same reason. The grip must be
  BUILT before the stepper — both call sites drew the stepper first, and nothing else
  depended on that order.
  **The settings button is a white DISC carrying `svgEdit`** — the pen the elevation
  frame list already means "edit this by hand" with — in the bottom-left, the one corner
  nothing else wants. A plain floating plus is right over TEXT and over an ARROW, which
  is why `_dsTextGearButton` and the arrow gear keep it and `test_v29` still pins that;
  it is wrong over a PHOTOGRAPH, where a bare blue glyph reads as punctuation and then
  disappears into the picture. It sits INSIDE the box clear of the `sw` resize handle
  rather than straddling the corner the way the grip does at top-left: the grip already
  covers the `nw` handle, and making a second corner unresizable to place a button is
  not a trade worth repeating.
  **17.46 put that button OUTSIDE the page instead**, which needed a stage wrapper and an
  unclipped sibling layer, because the page clips at the trim and every alternative — an
  absolutely-positioned child, a nested overlay, a `clip-path` — is a DESCENDANT and gets
  cut. The disc solved the visibility that was reaching for, so the stage and the layer
  went with their one consumer. If something genuinely has to sit beyond the trim again,
  that is the shape it takes and nothing simpler works.
  Removing it also demonstrated the landmark-slice trap this file warns about: cutting
  between the layer's opening comment and the next function swallowed `_dsPinChrome` and
  the whole corner ladder, which sat between them. `node --check` passed; the app died on
  the first render. Assert what the slice CONTAINS before deleting it.
  **The yellow handle NO LONGER READS THE RADIUS by its distance from the corner.** That
  was the InDesign convention it was built on and it is exactly what made it collide: at
  the default 3pt radius it sat within a pixel of the resize handle, so the affordance
  was unusable precisely when the shape was square-cornered. It is still a radius
  CONTROL (the drag works off the pointer delta, not the position) and the number lives
  in the settings popup.
  A box too small to hold three 20px controls in its corner (`_dsCornerFitsLadder`)
  **drops** the radius handle rather than stacking it on the settings button — the house
  rule for a control that cannot fit.
- **A RESIZE SNAPS THE DRAGGED EDGE; A MOVE SNAPS THE BOX.** `_dsAnnSnap` (via
  `_mbSnapBox`) had always covered dragging a box around, and its line set already
  included the page edges — but resizing had NO snap at all, which is the gesture you
  actually use to take an image full bleed, so the edge you pushed to the trim landed a
  pixel or two off it every time. `_dsAnnSnapEdge` snaps ONE moving edge: offering the
  other anchors on that axis would let the far edge, which is not moving, capture the
  snap and drag the whole shape sideways. Alt bypasses, as it does for a move.
- **PANNING IS GATED ON SLACK, NOT ON ZOOM.** The old test was `zoom > 1`, which
  describes the commonest way to get slack rather than the thing that matters: squash a
  box and cover-fit crops the image at zoom 1.0, so there is a real hidden strip to
  slide. `_dsShapePanDown` already panned only the axis with slack, so the maths needed
  nothing — only the gate was wrong. Reported as "I cannot pan to adjust the image
  position when it is set to 1.0".
- **`DS_ZOOM_STEP` IS THE ONE ZOOM GRAIN.** It was 0.5 in the stepper and 0.12 on the
  wheel, so the same value answered to two different grains depending on how you reached
  it, and neither let you land on a round number you had in mind. Both are 0.1; Shift
  multiplies. The readout is an `<input>` you can type into, committing on Enter or blur
  and **never per keystroke** — typing "2" on the way to "2.5" would re-render the page
  at 2 and take the caret with it. `_dsZoomRound` exists because float addition does not
  land on tenths (1.1 + 0.1 is 1.2000000000000002) and the field shows d.d, so without it
  the stepper walks the value into digits the field cannot show and a typed 1.2 stops
  matching a stepped 1.2.
  Two test traps found by breaking this deliberately: a check that only calls the snap
  HELPER cannot see the call being deleted from the resize handler, so the handler has to
  be driven; and "0.6 does not snap to 1" proves nothing about the threshold, because
  with a 12-column guide set almost every value is near SOME line — assert instead that a
  snap never moves an edge further than the threshold.
  A test trap worth keeping: `parseFloat('50%')` is `50`, so a control left on a
  percentage centre reads as "50px from the box" and every position assertion passes on
  a value that means something else. `test_chrome_onpage` rejects any chrome position
  not written in px, because the clamp always writes px.
- **`_font()` NAMES A BRAND FACE FROM ITS BYTES, NOT FROM A DOCUMENT REGISTERING IT**
  (`_pdfBrandFams`, set once by `_loadPdfFontData`). It used to read `_pdfFontFams`,
  which meant "registered into the CURRENT jsPDF document" — the wrong question for a
  canvas preview, which has no document at all.
  **`display` and `sans` share the core name `helvetica`**, so the answer is ambiguous
  the moment it falls back: `_font('display')` returned `'helvetica'`, and
  `CanvasPdfRec._fam()` maps that to the SANS stack. Every heading in the Deck Studio
  preview drew in Sans. `_registerPdfFonts` is called from the PDF export and NOWHERE
  ELSE, so a session that never generated a PDF never saw Druk in a preview — this was
  deterministic, not a race. Messina worked the whole time only because its core name
  (`times`) happens to be unambiguous, which is what made the bug so confusing to
  report: "I select Sans and nothing happens, I select Messina and it changes".
  The flag is set from the BYTES and **never cleared** — a document registering its own
  copy must not blank the answer for a preview rendering beside it, which is what the
  old `_pdfFontFams = {}` at the top of `_registerPdfFonts` did.
  **A canvas render needs BOTH halves**: `_loadEditorBrandFonts` for the glyphs and
  `_loadPdfFontData` for the name. Waiting for one and not the other draws Druk-the-shape
  in the Sans stack. `_dsBrandFontsReady()` waits for both, in parallel, bounded, and
  memoized for the session; both are kicked off at boot.
  **Both canvas page renderers gate themselves** (`renderDeckPageCanvas`,
  `renderSpecPageCanvas`) rather than trusting callers: the spec one is reached from the
  deck renderer AND directly from the template-card pump, and a caller that forgets draws
  the whole deck in Helvetica. The gate is memoized, so asking twice costs nothing.
- **THE BRAND FACES LOAD IN PARALLEL, AND WHATEVER IS ON SCREEN IS TOLD WHEN THEY
  ARRIVE.** A canvas draws with whatever the face resolves to at that instant, so a page
  rendered before Druk and Messina land is set in the fallback stack. Reported as "the
  previews are not rendering the headers properly... it ended up updating to what it is
  supposed to look like as I'm writing this", which is the worst shape for this bug: it
  looks broken and then silently corrects, so nobody reports it until they do.
  Two causes compounded. `_loadEditorBrandFontsInner` loaded its SIX faces strictly
  serially (fetch, decode, load, next) while every consumer waits behind
  `_withTimeout(..., 2500)` and then renders with whatever it has — six round trips end
  to end is how that deadline gets missed on a cold load. They load together now; each
  settles on its own and the successes are counted afterwards, because `Promise.all`
  rejects on the first rejection and one missing file would take the other five with it.
  And the loader's "faces arrived" hook woke `renderMoodboardCanvas` plus — only if a
  layout page happened to be open — the deck centre. **Nothing told the Project tab's
  preview**, so a page drawn in the fallback face sat there until some unrelated event
  redrew it. Any new canvas surface that survives across the font load needs adding to
  that hook, or it inherits exactly this bug.
  The preview was also the only consumer awaiting fonts with NO ceiling, so a fetch that
  never settled would have left it on the HTML mock forever. One shared, bounded gate.
- `_coverRect()` / `_cropToCanvas()` are the shared crop math for page background
  images. The DOM preview and the PDF must agree exactly — they diverged once because
  the DOM used aspect-blind CSS while the PDF used real cover-fit math.
- **Never `JSON.parse(JSON.stringify(x))` project data — use `_cloneData(x)`.**
  Frames and dashboard rows carry `artworkUrl`, a base64 data URL of megabytes. The
  round trip re-encodes and re-parses every one of those bytes and returns *new*
  strings, so each of the 50 undo snapshots held a private copy of every image.
  Measured on a 36-frame project with ~1.2MB images: **181ms of blocked main thread
  per undoable edit and 1.2GB of heap for twelve snapshots**, versus 0.1ms and no
  measurable growth. Strings are immutable, so a structural clone shares them and
  only duplicates the small objects around them — exactly as safe, since nothing can
  mutate a string. `_cloneData` deliberately mirrors JSON's quirks (drops `undefined`
  and functions, `null`s non-finite numbers, ISO-strings Dates) because callers were
  written against the round trip; `test_history_clone_perf.js` pins the equivalence,
  the independence (a shared reference would let a later edit rewrite history) and
  the speed. No cycle guard, for the same reason the round trip needed none: this
  data is written to a JSON file, so a cycle is already fatal at save.
  `performAutosave` passes the **live** objects to `JSON.stringify` — cloning first
  copied every image for something serialized on the next line.
  `_elevCaptureSignature` is already cheap (0.05ms) because its replacer swaps long
  strings for their length, so the big payloads are never serialized. Keep it that
  way if you add fields.
- `scheduleAutosave()` is the central debounce hook. Nearly every mutation calls it,
  which makes it the reliable place to hang follow-on work (e.g. thumbnail refresh).
- **A PAGE BACKGROUND WAS THE ONE IMAGE IMPORT WITH NO BOUND, AND THE COST WAS THE
  ENCODING RATHER THAN THE PIXELS** (`_boundImageDataUrl`, `_pageBgMaxEdge`,
  `_imageDataHasAlpha`). Measured on the real project in `.claude/references`: 22.9 MB,
  of which **11.1 MB is two page backgrounds** at 5.51 and 5.58 MB, against 3.9 MB for
  all fourteen pieces of artwork. Every sibling path already bounds (1000 px for
  dashboard artwork, 1100 from the shape popup, 1400 on a drop); this one wrote
  `FileReader`'s result straight into the project.
  **A dimension bound would have saved NOTHING on that file.** Both were 1728x1956
  **RGBA PNGs** - 3.4 megapixels, under what a 936x540pt page can use even at print
  quality with Zoom at 3 - so `resizeImageDataUrl` would have returned them verbatim.
  A photograph stored as RGBA PNG runs about twenty times its JPEG size, and that is
  the entire gap. So this helper **re-encodes**, and its dimension ceiling is a
  backstop against a camera export rather than the lever. A test pins that a 1728x1956
  image comes back at 1728x1956, because "simplify it into a resize" is exactly the
  change that would quietly undo this.
  **PNG is kept wherever transparency is REAL.** A background is composited over the
  theme's own colour, so alpha can matter, but a photo saved as RGBA carries a fully
  opaque alpha channel and loses nothing by dropping it. The scan reads every pixel
  rather than sampling: a stride misses a cut-out corner and flattens it, and a test
  puts the only transparent pixel LAST. An unreadable canvas assumes alpha, because
  guessing the other way destroys something.
  **It never hands back something bigger than what arrived** - a small JPEG re-encoded
  as PNG grows - and every failure path returns the original untouched, so a browser
  with no canvas still imports.
  `PAGE_FORMAT` moved to module scope for this: the ceiling is
  `PAGE_FORMAT[0] * _PDF_QUALITY.print.r * PAGE_BG_MAX_ZOOM`, and two numbers for one
  page size is how a background gets bounded against a page it does not print on.
  `_pageBgMaxEdge` is a **function** because both of those are declared further down
  and a const would read them in the TDZ, the trap `TITLE_SIZE_DEFAULT`, `_elevIdSeq`
  and `IG_LEG_TOP_GAP` were each caught by.
  **Deliberately NOT applied to the floorplan or a custom swatch**, which are the other
  two unbounded paths (`lv.imageData` and `swatchDataUrl`). Both are usually LINE WORK,
  where JPEG ringing eats hairlines and a plan is the drawing an installer works from.
  Those want palette reduction, which is different work.
  **Still open, and measured rather than guessed.** The same file stores each artwork
  TWICE, byte for byte (14 on `dashProjectData[].artworkUrl` and the same 14 on
  `elevations[].frames[].artworkUrl`, 3.9 MB duplicated); 14 `swatchDataUrl` values are
  only 4 distinct images held in 28 places; and `floorplanImage` is byte-identical to
  `floorplanLevels[0].imageData`. About 5.6 MB of pure duplication. Pooling it into an
  image table keyed by content is easy - **and every version of it breaks an older
  build**, which would read the reference tokens as image URLs and show a deck with no
  pictures, silently. The only guard an old build already honours is `data.type`, which
  it tests with `startsWith('master-studio')`, so the safe form is a type it REFUSES
  rather than mangles - and that makes the file unopenable on stable until stable is
  promoted. Worth doing, worth doing deliberately, and not worth doing mid-rollout.
- **A PROJECT IS SAVED BACK TO THE FILE IT WAS OPENED FROM** (`_projectFileHandle`,
  `openMasterProject`, `saveMasterProject({saveAs})`, `_fsaAvailable`). Save used to be
  a DOWNLOAD, always, into a name built from the project name plus today's date, so a
  week on one job left five `caesars-palace_2026-09-0*.json` in Downloads with nothing
  saying which was current, and two designers on one project had no story at all.
  With the File System Access API a project is opened THROUGH a handle and Save writes
  back to it. Chrome and Edge only, and secure-context only, so Firefox, Safari and a
  page opened from `file://` keep the download path **byte for byte as it was**: a
  half-working fallback is worse than the behaviour people already know, and a test
  drives the no-API case to pin that.
  **THE HANDLE IS SESSION-ONLY AND THAT IS THE SAFETY PROPERTY, not a limitation.** It
  is set by Open or by the picker the first Save raises, and CLEARED by any load that
  did not come through a handle - the `<input type=file>` path and an autosave restore
  both clear it, because a `File` from an input cannot be written back to. That keeps
  one invariant worth more than the convenience: **the handle always refers to the
  project currently in memory**, so Save can never write this project over a different
  one. Persisting it across reloads breaks exactly that (a fresh tab holding a starter
  deck would carry a handle to last week's job, and Ctrl+S would overwrite it), so the
  safe version of that ties the handle to a RESTORED AUTOSAVE and is separate work.
  **Three answers from `_fsaSave`, not a boolean**: `ok`, `cancelled`, `failed`. A
  cancel must NOT mark the project clean - a cleared unsaved dot is a lie the designer
  acts on - and dismissing a picker is a decision rather than a fault, so it raises
  nothing. A `failed` write reports AND falls through to the download, because a
  permission or a disk error must not leave the only copy of the work inside a tab.
  **`_projectPayload` and `_readProjectText` exist because there are three ways to save
  and two to open.** A second copy of the field list is how a key reaches one save path
  and not the others; a second copy of the install is how the two opens drift about what
  opening a project MEANS. `_readProjectText` returns whether it installed, which is what
  tells the caller it may bind the file it came from.
  **Save As is Ctrl+Shift+S plus the Save button's tooltip, NOT a fourth nav button.**
  That row is full (theme, view mode, a three-way unit toggle, Load, Save, Versions,
  Bulk Images, the version pill) and it is already `flex-wrap: nowrap`. The tooltip is
  the right home because it is read at the moment of deciding where a save lands, and
  Save raises the picker by itself whenever nothing is bound yet. WHICH FILE THIS IS
  goes in the document title, where every other application puts it.
  **Loading used to discard unsaved work without asking.** `beforeunload` covered
  closing the tab and covered nothing here. `_confirmDiscardUnsaved` runs first and the
  picker opens from inside its Yes handler, because that handler is itself a click: a
  file picker needs a user gesture and one opened after an awaited modal is refused.
- **THE AUTOSAVE LIVES IN INDEXEDDB, AND IT NEVER WORKED ON A REAL PROJECT UNTIL IT
  DID.** `performAutosave` used to `JSON.stringify` the whole project into ONE
  localStorage key. A real deck is far past what that holds: a 14-row, 4-wall project
  in `.claude/references` measures **22.9 MB** against a ~5 MB origin budget, because
  the payload carries every artwork data URL. So the write threw on every project that
  mattered, the catch `console.warn`'d, and a designer had a safety net they did not
  have. Version history already knew this and already used IndexedDB, and says so in
  its own comment; autosave is the one that did not get the memo, and it is the one
  that covers a crash.
  **THE SECOND HALF IS WORSE THAN THE FIRST.** A failed write leaves the PREVIOUS
  successful payload in the slot, so the next load offers to restore *that* one: a
  different project, behind a timestamp that reads as if it were this one.
  `_autosaveFail` therefore drops a stored record belonging to an EARLIER session and
  KEEPS one belonging to this session, which is a genuine older snapshot of the work in
  front of you. `_autosaveSession` is minted once per page load and is the whole of
  that distinction; it reads `ameta` rather than `adata` so the decision costs nothing.
  **TWO STORES, mirroring the version-history split.** `ameta` is a few hundred bytes
  (when, which session, what it was called) and `adata` holds the payload. That is what
  lets `checkAutosaveOnLoad` **ASK BEFORE IT READS 22 MB** - the old code parsed the
  whole project at boot just to fill in the prompt - and it is why the failure path can
  decide staleness without deserialising a project to find out.
  **`_aPut` TAKES A BUILDER, NOT A PAYLOAD.** The payload holds live object references
  and `elevations` / `editorialContent` are reassigned wholesale by a project load, so
  one built before the async open and written after it would autosave the project you
  just closed. Building inside the transaction closes that window. Live objects are
  still deliberately passed: the structured clone runs **synchronously inside `put()`**,
  so the record cannot tear, and `_cloneData` first would copy every artwork data URL
  for nothing on a 500 ms debounce. A test drives that by editing the live project and
  asserting the stored copy did not move.
  **A FAILED WRITE IS REPORTED, NEVER SWALLOWED**, and it is a MODAL rather than a
  toast: the house rule is that a toast carries what is safe to MISS, and "nothing is
  backing up your work" is the exact opposite. Once per session, because this is armed
  off a 500 ms debounce; the unsaved dot then turns RED and stays, and that red state
  shows even on a clean project, because the condition outlives the save that cleared
  the dirty flag.
  `AUTOSAVE_KEY` survives as a READ-ONLY legacy slot so an autosave written by an older
  build is still offered once and then cleared. `clearAutosave` clears both, and its
  IndexedDB delete is deliberately fire-and-forget (two sync callers, nothing downstream
  waits on it), so a test asserting a record is gone has to let the transaction commit.
  `performAutosave` is async and **never rejects**: 246 call sites arm it from a
  `setTimeout`, where a rejection is an unhandled one nobody can catch.
  Two traps in `test_autosave_idb.js` worth knowing before editing it. A fake store that
  refuses a DELETE for quota is wrong and makes the stale-record cleanup look broken;
  and **app.js arms its own `checkAutosaveOnLoad` at boot** (`setTimeout` 200), which
  left to fire mid-run reads whatever record the current check just seeded, gets a falsy
  `confirm`, and clears it. Let it run FIRST against an empty store. Both of those made
  the suite pass or fail on timing, which is worse than not catching the bug at all.
- **EVERY DIALOG CLOSES THE SAME WAY: ESCAPE, THE BACKDROP, AND ITS OWN CLOSE CONTROL**
  (`_modalTop`, `_modalClose`, `_modalWatch`, `[data-modal-close]`, `[data-modal-backdrop]`,
  `[data-modal-busy]`). None of 21 dialogs closed on Escape, while the elevation shortcut
  comment claimed Escape "also closes modals". Five dialogs built in JS (Versions, Bulk
  Images, the layout chooser, the mockup picker, Auto-spacing) had their own overlays and
  their own `e.target === ov` backdrop handler, which has the classic bug: `click` fires on
  the common ancestor of the press and the release, so dragging a text selection out past
  the card closed the dialog. Two of them also sat ABOVE the alert box (z 100040 / 100030),
  so an error raised from inside rendered behind them, and one BELOW every dialog layer
  (z 2000). All five are on the `.frame-modal` shell now.
  **Closing CLICKS the dialog's own `[data-modal-close]` control**, never a blanket
  `display:none`: Bulk Edit moves the real dashboard form back, the Frame Pack build cancels
  a job, and only each dialog knows its own cleanup. A test walks every dialog for exactly one.
  **Escape is deliberate; the backdrop is not.** Escape closes anything with a close
  control, except a full-screen TOOL (`.fm-over`: the floorplan markup and layout editor
  own Escape for "cancel this line"), a `[data-modal-busy]` dialog (the Frame Pack build),
  and focus inside a textarea or rich text. The backdrop closes only `[data-modal-backdrop]`
  dialogs, the ones with nothing to lose, and only if the press STARTED on the backdrop.
  The key handler runs in the CAPTURE phase and stops propagation, so the Escape that
  closes a dialog never also deselects the frames behind it.
  **`showConfirmModal(..., opts)`**: `opts.danger` paints Yes destructive and starts focus
  on Cancel, so a reflexive Enter cancels; `opts.mustChoose` marks no close control, for a
  question where BOTH answers act. The autosave restore prompt is one: its Cancel used to
  MEAN DISCARD, so once Escape closed dialogs, a stray keypress at boot would have deleted
  the backup. It is Restore / Discard now, mustChoose.
  **Focus** moves into a dialog on open (`[data-modal-initial]` wins), returns to the
  opener on close, and Tab stays inside. Driven by one MutationObserver per dialog on its
  own `style` attribute, because dialogs are opened by writing `style.display` from dozens
  of places, plus a `<body>` childList observer (direct children only) for the ones built at
  runtime and closed by removal. Every dialog also gets `role="dialog"` and `aria-modal`.
  **TWO JSDOM TRAPS, both hit writing the tests.** Under `runScripts: 'outside-only'` jsdom
  never runs an inline `onclick="..."` attribute, so clicking a close control does nothing
  and every Escape check passes or fails for the wrong reason: dialog tests use
  `'dangerously'`. And jsdom does not implement `innerText`, which is how the info box sets
  its title, body and button labels, so under test those are EMPTY: identify buttons by
  position and attribute, and record a question's text by wrapping `showConfirmModal`.
- **ONE WAY TO ASK BEFORE DESTROYING SOMETHING: `_confirmDestroy({title, body, confirm,
  undoable, onConfirm})`.** There were sixteen native `confirm()`s and twelve `alert()`s,
  browser chrome over the app in wording that varied call by call; none are left.
  **`undoable` is REQUIRED, with no default**, because the sentence it picks ("You can
  undo this with Ctrl+Z." / "This can't be undone.") is a promise, and a test reads that
  every call site states it. The wall delete said "This cannot be undone" while
  `deleteElevation` pushed history. Worse, five deletes (a text style, a template, a
  template category, a floorplan category, a timeline stage) wrote `editorialContent`
  WITHOUT pushing history, so they genuinely could not be undone and said nothing. All of
  that data is already in the undo snapshot, so each gained a `pushHistory()`: making it
  undoable beats warning about it. A version delete lives in IndexedDB, outside the
  project, and says it cannot be undone.
  **VERB RULE: Delete when the thing is gone, Remove when it is taken out of the deck and
  can be put back without Ctrl+Z** (a built-in page, the overlays on one page).
  **The answer arrives AFTER the question now**, so anything keyed on an index has to be
  re-resolved at confirm time: the wall by `_elevIndexById`, a template by object, a
  floorplan category by KEY - `_artCats()` returns the built-in constant until a project
  customises its list and `_artCatsEnsure()` writes a COPY, so matching by object deletes
  nothing. `_dsDeleteUserTemplate(idx, after)` takes a callback instead of returning a
  boolean. `_askYesNo` is the promise form for async callers. The three copies of the
  plan-detail delete are one `_deletePlanDetail`, and two of its buttons had called a plan
  detail a "breaker", which is a different page.
  **The alerts were sorted by the house rule**: nudges and acknowledgements to `_toast`
  ("That is the last row", "Pushed to wall"), failures and must-reads to `showInfoModal`.
- **NO NATIVE DIALOGS, PROMPTS INCLUDED (18.11): `_askFields` / `_askText` / `_askYesNo`.**
  The 17.x cleanup took out `confirm()` and `alert()` but left eleven `window.prompt()`
  and six `window.confirm()` in the template, style, preset and level code.
  `_askFields` resolves trimmed values or null, disables its confirm button while a
  required field is empty, and takes `list` for a datalist (the style dialog offers
  every existing group, which the old prompt could only list four of in its question).
  `_dsAskLeaveTemplate` is the ONE "unsaved template edits" question; there were four
  wordings. **`_dsTab` re-enters with `_confirmed`**, never by relying on cleanup to
  clear the session: cleanup can throw before nulling it, and the first version looped
  forever re-asking (caught by `test_tab_exit_fix`). Six older template tests were
  written against the native dialogs; they now run their checks `async` and bridge
  `_askYesNo`/`_askFields` back to their `window.confirm`/`window.prompt` stubs, so every
  assertion is unchanged. Add a `test_no_native_dialogs` check, not a native call.
- **FLOOR PLANS ARE IN THE UNDO ENTRY (`snapshotProjectState({ plans: true })`, 18.11).**
  Without it, Ctrl+Z after deleting a level restored the pins' old level numbers onto a
  list that had lost the level, re-homing them onto the wrong plan. ONLY the undo stack
  asks for it: autosave and version history already store the levels beside the
  snapshot, and carrying them inside too would write every plan image twice. The rule
  that comes with it: **every level mutation pushes history** (upload, add, rename,
  delete), or the next unrelated Ctrl+Z silently reverts it. Deleting a level also
  renumbers the WALL LINES now, not just the pins, reading `_fpWalls(r)` before
  `r.level` changes (a legacy row derives its line from `r.level`).
  The empty plan slot in Deck Studio is an **Upload floor plan** button for that level;
  the hint pointed at a button the floorplan panel does not show, and the PDF
  placeholder named a dialog that no longer exists (now "FLOOR PLAN IMAGE GOES HERE").
- **UNDO HAS BUTTONS, AND SAYS WHERE IT WENT** (`#undoBtn` / `#redoBtn`, `_historyWhere`,
  `_historyAnnounce`, `_historyBlockedByDialog`). `updateUndoButtons()` had managed two ids
  that did not exist, so undo was Ctrl+Z only. Undo reverts the whole project, so the change
  is often on a view you are not looking at; a notice now names the wall, piece or deck.
  **Derived by COMPARING the two snapshots**, not by labelling 246 `pushHistory` call
  sites; long strings compare by length and tail, like `_elevCaptureSignature`. One notice
  at a time: ten presses are one conversation. **Undo is refused while a dialog is open**,
  or Ctrl+Z changes the rows Bulk Edit is editing behind it - except inside a `.fm-over`
  tool, where the editing actually happens.
- **KEYBOARD FOCUS IS VISIBLE** (the `:focus-visible` block at the end of style.css). There
  was one `:focus-visible` rule and six turning the outline off, so buttons, sliders and
  checkboxes showed nothing. Text fields were already fine through `input:focus`'s accent
  border and are untouched. A native checkbox does not paint `border-color`, so it needed
  its own rule, at (0,2,1) to beat `input:focus`. Slider focus is on the THUMB, written for
  both engines.
  **`[data-kbd-click]` makes a div press like a button** on Enter or Space (Space is
  cancelled, or it scrolls). The three view tabs, the wall rail and a wall's delete x were
  divs with an `onclick` and no tabindex, so a keyboard could not reach them at all. Opt-in
  by attribute rather than by role, so nothing starts answering keys it did not ask for.
- **HELP IS `HELP_REFERENCE_DATA`, AND ITS TEST IS BUILT TO CATCH IT GOING STALE.** It had
  stopped at v1.1 and said things that were no longer true: walls as "tabs at the top",
  multi-select as Shift-click (it is Ctrl+click; Shift is fine drag), Sort A-Z "leaving the
  wall unchanged" (it RE-LETTERS the frames, which prints), a Sourced Object "hiding the
  frame fields". `test_help_and_steps.js` fails if Help names a control whose label is not
  in index.html or app.js, lists a shortcut no handler binds, uses an em dash, or has a
  What's New that does not mention `APP_VERSION`.
  Bodies are **template literals** so the copy carries apostrophes and attributes with no
  escapes; nothing in it may contain a backtick or a dollar brace. An entry with `live`
  (`'steps'`) is built by `_helpLiveEntry` when the section opens. Help opens on Reference,
  and the Video tab is HIDDEN until `setHelpVideoUrl` gives it something: it used to be the
  tab Help opened on, reading "coming soon".
- **EVERY BOOT OPENS ON THE START SCREEN (`openStartScreen`, 18.10).** It replaced the
  17.91 "Where do you want to start?" chooser, the separate autosave restore modal and
  the first-run toast. Continue (only when `_autosavePeek` finds a backup), New project,
  Open project. New project (`_startNewProject`) sets name, client and units and ALWAYS
  lands on the floorplan Items list: since 17.95 the codes are run from there, so it is a
  house standard, not a question. A `.frame-modal` with NO close control, so Escape and
  the backdrop do nothing; opaque, because the busy app is what you should not be
  looking at yet. `_bootStart` keeps a test harness on `checkAutosaveOnLoad`, which now
  shares `_autosavePeek` / `_autosaveRestoreNow` with the Continue card so the two
  cannot disagree about what counts as a backup. `_readProjectText` closes the screen on
  a successful install (the `<input type=file>` path arrives asynchronously).
  **The logo is inline SVG (`FRAME_LOGO_PARTS`, the six shapes from the logo files,
  byte for byte) so it can come together**: the mark slides in from the left, the
  letters close up from slightly spread with a 70ms stagger, all in SVG user units so
  the move scales with the logo. `prefers-reduced-motion` turns it off. `currentColor`
  covers both themes, since the two logo files differ only in fill.
  **The next-step bar (`_syncNextStep`)** rides `_syncNavBadges`, says the ONE next thing
  from `_projectStepCounts`, and folds away once steps 1 to 3 are done; × is session
  state. A fresh project's placeholder `ART.1` counts as step 1, through `_projectIsFresh`.
- **THE ORDER OF OPERATIONS IS ON THE VIEW TABS** (`_projectStepCounts`, `_projectSteps`,
  `_navStepBadge`, `_syncNavBadges`, `_scheduleNavBadges`). The tabs are numbered 1 Frame
  Dashboard, 2 Elevation, 3 Deck; Elevation's badge counts pieces not on a wall, Deck's
  counts pieces not pinned (only once a plan image exists). The full five steps, two of
  which live inside Deck, are the live checklist that opens Help's Start here, with Go
  buttons wired through `[data-help-go]` rather than inline quoting.
  **All derived, never stored.** "A piece" is `_deckSpecRows()` (so a mockup's slots are not
  work to do), "on a wall" is an ACTIVE frame with the row id (the quantity rule), "pinned"
  is `_fpPins`. `_projectStepCounts` is the cheap half, read on every nav render; only the
  checklist builds the page list. Badges update IN PLACE off `scheduleAutosave`, because
  re-rendering the tabs replaces them and drops keyboard focus off a tab mid-Tab.
  **The first-run tip is ARMED at boot and SHOWN on the first pointerdown.** Shown from a
  boot timer, its 12-second toast kept every headless test process alive ~14 seconds past
  finishing and the suite ran for half an hour - the template-card prewarm trap again.
  **These are declared near the TOP of app.js, straight after `_checkBuildPairing`**, so no
  module-scope code can read `NAV_STEP_TIPS` or `_navBadgeTimer` in the TDZ.
- **UNCAUGHT ERRORS ARE CAUGHT, LOGGED AND SAID ONCE** (`_frameReportError`,
  `_frameErrAnnounce`, `_frameErrors`). Nothing was listening, on a 27k-line file in one
  global scope where a parse is not a load and a load is not a render. Four
  ReferenceErrors have shipped that `node --check` waved through and that died at
  render: `_round2`, `_igElevIdx`, `IG_LEG_TOP_GAP`, and the blanket rename that rewrote
  a declaration into a self-call. On this machine you notice, because the console is
  open. On a designer's machine the button simply does nothing, they work around it, and
  the report arrives a week later as "the breaker pages are weird sometimes".
  The value is **not recovery**, it is turning a silent dead end into something
  reportable: the notice leads with `APP_VERSION` and `APP_BUILD`, carries the fault and
  the stack, tells the designer to Save Project FIRST, and offers Copy details through
  `_dsCopyText` (which already has the `file://` fallback).
  **ONCE, THEN DEDUPED ON THE FAULT.** A render loop raises the same error sixty times a
  second and a modal per occurrence takes the app away from the person trying to save.
  First fault is a modal (a failure is never safe to miss), a NEW fault after that is a
  toast, the same fault again is a console line and a slot in a 25-entry log.
  **Both halves are registered** - `error` and `unhandledrejection` - at module scope
  ahead of `initMasterApp()`, or a fault during init is the one class nobody hears about.
  Two things are deliberately NOT reported: cross-origin `Script error.` with no file or
  stack (nothing to report and nothing to fix), `ResizeObserver loop` (a browser
  scheduling notice), and a failed `<img>`/`FileReader` load, which has ~20 handlers of
  its own already saying something specific about the file that failed. The reporter is
  wrapped so it can never become the fault itself; a test breaks the notifier and checks
  the error still reaches the log.
- `_resolveFooter()` handles footer theming. `'auto'` means *read this page's own
  theme* — not a fixed default.
- Templates live in `editorialContent.templates`; `type` doubles as the category key.
  Project JSON is the exchange format for template library updates.
- **`_starterDeck()` is what a new project opens with**, folded into
  `_editorialDefaults()` and therefore into the cold-boot `editorialContent` too
  (one definition — the boot-time literal that used to sit beside it drifted).
  Its content is a real deck built out of the layout templates and exported to
  `.claude/references/Concept.json`: cover, project understanding, art narrative,
  strategy, slogan, one moodboard layout page, their grey placeholder blocks, and
  the default process/timeline. It is a **function, not a constant** — `Object.assign`
  copies references, so a shared element array would let one project edit another's
  pages. Every key is top-level, so a loaded project overwrites it wholesale and a
  deliberately-emptied cover stays empty. The moodboard page's id is **fixed**
  (`pg5ef7lopj50a`) because its twelve placeholder blocks are keyed `layout:<id>`;
  a generated id orphans all twelve with no error, the page just comes up bare.
  `timelineStemPos` ships with it because that map is keyed by stage **index** and
  only means anything next to the default timeline string: Artwork Selection stems
  straight up from the pill, Procurement stems on the line *before* it (three
  approvals, and the after-pill gap is where the next stage starts). Pin new checks
  to the stage LABEL, not the index.
- The Include-pages list in the Project tab is **checkboxes only**. Cover / Art
  Narrative / Good Art Good People / Thank You each carried a pencil that opened
  the old moodboard-modal editor, which no longer feeds the page you see — a
  control that produces no result. `openFixedPageEditor` is now unreferenced;
  those pages are edited in Deck Studio.
- `_dsThumbCacheKey()` ↔ `data-thumb-key` identifies rail cells.
- **The spec-template cards render a STANDARD DEMO, not your page.** They used to
  render the real page for whichever piece was selected — its photo, its whole spec
  list, a crop of its floorplan, a capture of its wall — so four cards differed by
  everything at once and the arrangement, the only thing you're choosing, was the
  hardest thing to see. `_specTplDemoDesc(key)` builds it, `_specTplDemoSet(key)`
  picks the set:
  - `SPEC_TPL_DEMO_ONE` — a 24" square — for single-piece templates.
  - `SPEC_TPL_DEMO_SALON` — a **five-piece salon hang** across **three mouldings**
    (`SPEC_TPL_DEMO_FRAMES`; A/B/D share one, C and E have their own) with **one
    float mount** — for the as-hung cards. That mix is load-bearing, not decoration:
    Shared specs exists to show values splitting by letter (`Frame Code A/B/D`,
    `Matboard B`) and a uniform set makes it identical to To scale. Stacked and Side
    by side take the first three (Side by side only lays out four columns, five
    stacked rows are unreadable at card size).
  - `extW`/`extH` and `x`/`y` live in **one table** so they can't drift; `w`/`h` come
    from `extW`/`extH` or the mockups letterbox in their slots. `y` is bottom-up wall
    inches, deliberately in two rows — frames on one baseline make the as-hung cards
    look exactly like Side by side. All inches; `_specTplDemoRow` converts into
    `dashUnit`, or a cm deck prints "24 cm".

  Swatch mode rides on **`ctx.swatch`, never a module flag**: both renderers await
  inside, so a background thumbnail render interleaving with a card render would come
  out full of grey placeholders with nothing to say it happened. It: forces
  `wireframe` on the frame mockups (grey block, no letter, whatever the project is
  set to); swaps the floorplan / elevation / frame-corner+profile rasters for
  `_specSwatchBox()` (which captions through `_specThumbCaption`, so a card's labels
  match a page's); **pins `scaleOpts`** (`elevThumb` on, codes on frames) so a card
  advertises every slot the layout can fill *and* can't go stale against a cache key
  that doesn't include them; feeds `_drawFrameStrip` the demo mouldings directly
  (`_sharedSpecFrames` looks codes up in the real library, which the demo isn't in,
  so the strip would silently vanish from the one card that exists to show it), with
  `box.swatch` reserving a grey profile slot beside each corner chip; forces
  artwork-only OFF (that flag is keyed by item code and the demo borrows a plausible
  one); and titles a group page with `SPEC_TPL_DEMO_GROUP_ID`, because `unit.key` is
  the swatch sentinel.
  `_dsTplSwatchKey` is keyed on **template + unit only** — the row id used to be in
  it, so every page you clicked re-rendered all four cards.
  **`_dsPaintTplSwatch` must NOT gate on `isConnected`.** The cards queue their thumb
  div while it is still detached (the grid is appended several lines later), so a
  cache HIT — which paints synchronously — was dropped every time and the card kept
  its instant diagram. A cache MISS goes down the async pump and works, so it read as
  "the demos show when I first open the tool and vanish once I toggle Per piece /
  Group A/B/C": cold cache vs warm. Keying on template + unit turned a latent bug
  into a constant one. Writing innerHTML on a detached node is cheap and correct.
  `_dsTemplateSwatchHTML` gives each group arrangement its **own** blocking; one
  generic diagram for all four (differing only in a caption) is what made them look
  identical, and it's still what shows if a render fails. The as-hung branch is driven
  by `SPEC_TPL_DEMO_SALON` so it can't drift from the render, and it corrects by the
  card's 936:540 aspect — a uniform scale in fraction space squashes a square frame.
  `_dsPrewarmTplSwatches()` fills the whole set in the background so the picker opens
  finished instead of rendering seven cards while you watch. It is triggered from
  **`switchView`'s deck branch, NOT the boot tail** — seven real page renders from boot
  means every load pays for a panel that may never open, and so does every one of the
  100+ test harnesses (measured ~4.5s per file, roughly tripling the suite). It yields
  while `_thumbBusy` / `_elevPrimeActive`, with a bounded retry so a busy deck doesn't
  tick all session. `_dsRepwarmTplSwatches()` rebuilds after a unit or dual-unit change,
  which re-keys every entry.
  **Not persisted to localStorage**, deliberately: `performAutosave` puts the entire
  project — every artwork data URL — in there under one key and fails *silently* on
  quota, so cosmetic card images must not share that budget. Re-evaluate only if
  autosave moves to IndexedDB (a test pins that it hasn't).
  `_dsBrandFontsReady()` is ONE memoized font wait for the session, shared by the
  template cards AND the Project tab's page preview (it was `_dsTplSwatchFonts` until
  the preview wanted it too, at which point the name stopped being true). The type is baked
  into a cache locked for the session, so a card rendered before the brand faces land
  keeps its Arial fallbacks all session — and prewarming made that the normal case.
  Memoized because seven cards each doing two waits is fourteen pending timers.
- **`_withTimeout` clears its fallback timer.** It used to leave the `setTimeout`
  pending, so every call sat on the event loop for its full timeout even when the
  promise resolved immediately. Invisible for one page render; with the template-card
  prewarm it held the loop ~7s past boot and node wouldn't exit for ten seconds. The
  race result is unchanged — only the dangling timer goes.
  The card box is `aspect-ratio: 936/540`, the same declaration the rail's page
  thumbnails use. Its height was a px figure derived from a **nominal** 150px card,
  so a narrower grid column left it 87 tall and squeezed the page into a square —
  which is also why the instant `_dsTemplateSwatchHTML` diagram lays out in
  **percent** (`_pc()`) and spends px only on type.
  `SPEC_TEMPLATES[key].help` is the card's ? modal AND its hover tooltip, built by
  `_dsTplCardName()`; the ? must `stopPropagation`, because the whole cell is the
  pick target.
- **Install-guide mode needs a wall with something on it.** It emits one page per
  elevation and **no per-piece spec pages at all**, and `installDescs()` only counts
  elevations holding an active frame — so clicking it on a deck with nothing placed
  deleted every spec page and added none back. `_elevHasPlacedFrames()` gates the
  switch with the *same* test `installDescs()` applies, so "the button worked" and
  "the mode produced pages" can't disagree. Keep the guard keyed on
  `_tplModeOf(tpl)`, not the literal `'installGuide'` a button happens to pass.
  Separately, `_dsRefresh` only **clamps** `_dsIndex`, so a mode switch left the
  selection pointing into a *different* deck — landing on Good Art Good People.
  `_dsRestoreSel(key, kind)` puts it back on the same PAGE, then falls back to the
  first page of the same kind. Any other change that rebuilds the page list around a
  selection wants it too.
- `_dsInTemplateLibraryMode` gates the Templates destination; `_dsTemplateEditSession`
  tracks the active template edit (edits happen on a real temp page, then copy back).
- `_dsChrome` class marks editing-only UI (handles, grips, marquee) so it can be
  hidden inside thumbnails. Gear/action buttons are real `<button>` tags; content
  never uses `button`, so hiding all buttons in a thumbnail is safe.
- `_runsFromEditedDom()` must skip `BUTTON` nodes — the floating settings gear is a
  real DOM child of contentEditable text boxes and its "+" leaks into the text.
  There are TWO text paths: rich-text (data-rs spans) and plain/list text. Fix both.
- Group A/B/C ("set") pages are all one renderer, `_drawSpecSetPageBody`, branching
  on SPEC_TEMPLATES flags: `row` = side by side, `scale` = as hung, no flag =
  stacked. `sharedSpec` rides on top of `scale` and swaps only the left column.
  `_drawSpecSetPage` is a thin wrapper whose sole job is the footer, because every
  arrangement returns from its own exit and they all used to forget it. Letters
  come from `_setLetters()` — never a local literal; the cap is 12 members.
- **THE GROUP ARTWORK HANGS FROM THE SPEC LINE, IT IS NOT CENTRED IN A REGION.**
  `artTop = Math.max(regY, GB.body + 8)` and `artH = (regY + regH) - artTop`, and both
  halves matter. The pieces used to be centred vertically in a region whose HEIGHT
  changes with the ticks (`regH = bottomBand ? (BB - regY) * 0.72 : (BB - regY)`), so
  unticking everything made the region taller and the frames visibly sank down the page
  — and the no-geo fallback was BOTTOM-aligned, which put them on the page edge. Both
  are reported the same way: "the frames fall to the bottom of the page".
  The top is the line the SPEC COLUMN starts on, so the drawing and the text beside it
  begin together; `Math.max` floors it at the region top, which only binds on a guide
  set that declares no title lines (Margins only, Rule of Thirds, Center) — there the
  band falls back to `SR.T + 30` and would otherwise start the art ABOVE its own region.
  `regY` itself is deliberately NOT moved: `test_shared_spec_legend` pins a 3.6pt
  threshold below it where a 12-moulding frame strip stops dropping itself.
  **Every scale term reads `artH`, never `regH`** — geo path and fallback alike, or the
  art is scaled against a height it does not have and overruns the band. The gap to the
  band is 22pt (`bandY = regY + regH + 22`), which is what "the frames are too close to
  the thumbnail placeholders" was.
  Two test traps here. The pieces are frame mockups rasterised onto a canvas, which
  draws NOTHING under jsdom, so the artwork's extent has to be read off the LETTERS and
  the image codes — and a narrow piece drops its code, so a height check needs a fixture
  whose pieces are wide AND stacked. And every ordinary fixture is width-constrained, so
  a break in the height term changes nothing unless the group is genuinely tall.
  `__bandSetup` rebuilds `editorialContent`, which is where the guide pref lives, so a
  check that switches the guide set must do it AFTER the fixture.
- **A FRAME STRIP CELL IS AT LEAST AS WIDE AS ITS OWN CODE.** `_drawFrameStrip` lays its
  cells out right to left ending exactly on `box.right`, which on a group page IS the
  right safety guide — but the code label is drawn LEFT-ALIGNED on its cell with nothing
  bounding its right end, and a corner chip is routinely much narrower than the code
  under it (`MICH 432-29` measures ~33pt at 6.5pt against a `MIN_CELL` floor of 26). So
  the RIGHTMOST label hung outside the guides while the chip it names sat correctly
  inside them. Reported as "images or text going outside the guide safety area", with
  only FRAME CORNER ticked — the case that makes the strip one narrow cell.
  Fixed by widening the CELL, not by clamping or truncating the label. The strip already
  drops itself whole when it will not fit `box.maxW`, and every code prints in full as a
  `Frame Code` row in the spec block, so a strip that gives way is a much better outcome
  than a label shortened to three characters — which is what a clamp-plus-truncate first
  shipped as, and it cut every code on the page in the test harness.
  The measure has to set the font first: it runs in the `cells` map, before the draw loop
  that normally sets it per cell.
- **A SPEC TICK MUST NOT WIPE THE WHOLE THUMBNAIL CACHE.** `_dsThumbCacheKey` carried the
  per-piece slots and NOT the group ones, so the only way to make a group tick show up
  was `_dsThumbCache = {}` — which sent every cover, floorplan, breaker, install page and
  untouched spec page back to a placeholder and rebuilt all 86 pages of a deck on every
  click. Reported as "a lot of flickering when turning off and on check boxes".
  The group slots are in the key now (`|g` + the four digits, beside the per-piece `|`
  form) and the wipe is gone from both handlers in `_dsSpecSlotsInto`. `_dsRefresh`
  already prunes only the entries whose key is no longer live and says in its own comment
  that it KEEPS valid ones so they do not flash — the wipe was defeating that. A
  page-scoped tick now rebuilds one page.
  The behavioural check drives the real checkbox and asserts an unrelated page keeps its
  cached thumbnail; the source check asserts the wipe has not come back. Keep both — the
  source one alone would pass if the key regressed instead.
- `_specSetRows()` builds the shared-spec block: for each label, group the pieces
  that share a value; a group covering everyone drops the letters, anything else
  carries them (`Matboard A/D`). No "None" rows by design. Row order comes from
  `SPEC_ROW_GROUPS`, **not** from `buildSpecStrings`' emission order — deriving it
  by first encounter dumps any label only some pieces emit (a lone white border)
  after Overall Dimensions. `group` on each row drives the half-line category gaps.
  `Paper Size` lives in the **mat/paper** group, not the sizes group — it describes
  the paper, and next to Image Size it stranded a lone float mount's rows across
  the block. The last group is the sizes and only the sizes.
  `SPEC_ROW_CLUSTERS` is the one exception to label-major order: Frame Size +
  Frame Code emit *per letter group* so each moulding reads as a unit. A label
  that's uniform across the whole set is hoisted out of the pivot and still
  prints once, so "one size, many codes" doesn't repeat the size. Members of a
  cluster must share a `SPEC_ROW_GROUPS` entry or the category gap splits pairs.
- **Dual units** are deck-wide: `editorialContent.specDualUnit` (`''|'mm'|'cm'`),
  read by `_specDualUnit()` (which migrates the old `scaleOpts.dualUnit` slot).
  `buildSpecStrings(r, opts)` defaults to it, so *every* spec layout honours it
  with no threading; `opts.dualUnit` overrides per call and **only the CSV export
  uses that**, forcing OFF because those cells are machine-read. Dual mode prints
  **inches first regardless of the project unit** — `_pu`/`_pf` in
  `buildSpecStrings` convert, and `fmt()` is the single place that applies it, so
  any new dimension site must go through `fmt()` or it stays in the stored unit.
  `sfxT(v)`/`sfxL(v)` replaced the old `sufTight`/`sufLoose` constants; with dual
  off they return those strings byte for byte. `_specDualPart` snaps to 6 decimals
  before display rounding or the same size prints 19 vs 19.1 depending on the
  stored unit. UI: `_dsDualUnitInto()`, in the Per-piece and Group A/B/C panels
  (not Install guide — those pages have no spec text; their dims are the
  elevation renderer's).
- `buildSpecStrings` emits `Matboard` **only for float mounts**; standard framed art
  emits `Mat 1`/`Mat 2`. Any `wanted` filter listing one must list all three, and the
  DOM-preview lists in `_deckMockHTML` must match the PDF ones or the two drift.
- Elevation fit-to-window = `.workspace` width minus `#export-wrap` padding minus
  a scrollbar reserve, so **three widths share one budget**: `.elev-sidebar` 425 +
  `.elev-wall-rail` 165 + 130px horizontal padding = 720 = the original
  440 + 120 + 160. Change any one alone and the drawing resizes. The padding is at
  its floor at 65px a side (outer wall dims are drawn 6in out, ~74px at fit), so
  extra rail width comes from the sidebar, itself floored near 420px by the frame
  list's icon columns. `drawElevAll` *measures* the padding (`_elevWrapPadding()`)
  instead of hardcoding it. Exports pin the padding back to
  `ELEV_EXPORT_WRAP_PADDING` (80px a side) and hide the rail, because dimension
  text and line weights are CSS px that don't scale with `elevScale`.
- Elevation guide labels must not share a band with the outer wall dims, which sit
  6in outside the wall on the left (height) and above it (width). Two did and both
  were fixed by moving, not nudging: `HANG HEIGHT` is **gone** (the callout reads
  `57" AFF` via `_elevAffLabel()`, on the dim line itself), and the centre label is
  `CL` **inside** the wall top, **beside** the dashed line. `_elevAffLabel` uses
  `elevFmt` + `unitSuffix()`, deliberately not `elevFmtU` — AFF keeps its unit mark
  even when the interior-suffix toggle is off. `.hang-label` was the only
  `writing-mode` user in the app, so its html2canvas `onclone` fixup went too.
- **Line weights are POINTS, and absolute.** `ELEV_WEIGHT_PT` is the drafting pen
  set (0.25/0.5/0.75/1/2/3) and the only definition — both Settings ladders are
  built from it by `_seedAnnotWeightControls()`, never written out in the HTML.
  `annotationStyle.lineWeightPt` / `.tickWeightPt` / `.weightLinked` replaced the
  single px slider; `weight` survives only as a px mirror that
  `_normalizeAnnotationStyle()` migrates from and writes back to (nothing draws
  from it). **Linked means literally equal** — the old code *derived* a 2:1
  light-line/heavy-tick split from one weight, and keeping that made "all the same
  weight" unreachable, which was the request. A stored tick-style deck migrates
  *unlinked* onto the two weights that split gave it, so it looks unchanged.
  Picking a tick weight while linked unlinks, because the alternative is a click
  that silently does nothing.
  **The exported SVG declares its size in POINTS** (`_elevSvgHead`, the one header
  builder for both the download and the PDF path's two halves): `width`/`height` in
  pt at **1 user unit = 1/`ELEV_PT_TO_PX` pt**, `viewBox` left in user units so no
  geometry moves. Strokes are written in px, which is points × `ELEV_PT_TO_PX`, so
  a bare unitless root made Illustrator read them as pixels and a 0.5pt line landed
  at 0.75pt. Convert the viewBox too and every coordinate silently rescales.
  Because the attributes now carry a unit, `_captureElevWithGuides` takes its
  natural size from the **viewBox** and its rewrite **strips the unit** — read the
  attributes and every capture rasterizes 1.33x off.
  `_svgStrokePx()` is the one stroke-width formatter and `_elevPenWeight(el)` is the
  one weight source: **every** stroke case in `emitEl` (tick, four-border rect,
  h-line, v-line, both background lines) resolves `penW` once at the top and uses
  it, including for the `stroke-dasharray` runs, which are proportional. Fixing only
  some of the cases is worse than fixing none — that's what left the group box and
  the dashed extension lines at a different weight from the dimension lines beside
  them, all off one setting. A sub-pixel width doesn't survive a `getComputedStyle`
  round trip intact on every engine (0.25pt is half a px, 0.75pt is one and a half),
  so the setting is asked, never the DOM. The floor is 0.05, not 1: `Math.max(1, …)`
  collapsed every pen under 0.5pt onto 0.5pt. Three decimals, or one would re-round
  0.5px into the same trap.
  Group dims and the wall's outer extension stubs are inline-styled with **no useful
  class**, so they carry `data-svg-pen="line"|"tick"`; everything else is matched by
  class. Drop that attribute and the exporter silently falls back to re-measuring —
  no error, just the wrong weight in Illustrator.
  Known gap: `.dim-leader` extension lines carry `opacity: 0.7` on screen and
  `emitEl` does not emit it, so leaders are full strength in the SVG **and** the PDF.
  Decide it deliberately before "fixing" one of the three.
- **Dashed strokes are a repeating GRADIENT, never `border-style: dashed`.** A CSS
  dashed border draws at the *browser's* rhythm and there is no property that asks
  for another, so no setting could reach it — that's why the dashes read as solid
  and why this had to change before Dash spacing could exist. `.dim-dash-h` /
  `.dim-dash-v` / `.dim-dash-box` paint in `currentColor` (so a group dim can set
  its own ink inline, and so `emitEl` reads one computed property to find it) and
  size themselves from `--dim-line-w`. The class supplies the thickness, so a caller
  must never write `width` on a `-v` line or `height` on an `-h` one: inline wins
  and the stroke vanishes. Build them with `_mkDashLine()` / `_dashLineHTML()`,
  which also attach `data-svg-pen` + `data-svg-dash` — **without those markers the
  stroke has no border and no background colour, so every case in `emitEl` skips it
  and it disappears from the SVG and the PDF with no error.** Its case must stay
  ahead of the border cases.
- **The dash rhythm is `annotationStyle.dashPt`, in POINTS and absolute**, on the
  `ELEV_DASH_PT` ladder, gap derived at `ELEV_DASH_GAP_RATIO`. One dial, not two:
  it scales the whole rhythm and keeps the 3:2 of a drafting dash. It used to be
  derived from the stroke width (3x on, 2x off), which at 0.5pt is a 1.5pt dash with
  a 1pt gap — solid at any distance — and meant a weight change silently moved the
  rhythm. `_dimDashPx()` is the source; `_dimDashArray()` is the SVG form; the CSS
  vars are `--dim-dash-len` / `--dim-dash-gap` / `--dim-dash-period` (period is
  len+gap, because a repeating gradient wants the cycle end, not the gap).
  **Every `var()` inside a gradient needs an inline fallback, and the dash vars need
  `:root` defaults.** An unresolved `var()` invalidates the *whole*
  `background-image` — there is no degraded rendering, the stroke is simply not
  painted. Same for the `--dim-line-w` that sets its thickness: unset, the div is
  0px tall and there is nothing to paint on.
  Thickness is `max(1px, …)`: a **screen-only** floor. A background box is painted
  where it lands, and every one of these sits at a fractional offset (inches ×
  `elevScale`), so a 1px box straddles two device pixels at half strength each — a
  *border* was snapped to a whole pixel, which is why converting them made half of
  each leader pair look absent on screen while both were correct in the exports.
  The floor never reaches the exports; they write the true point weight.
- **No `opacity` on dimension strokes.** The leaders carried `0.7`, which `emitEl`
  does not read — so the SVG and the PDF always drew them at full strength and the
  editor was showing something it would not print. It also stacked with the
  anti-aliasing above and pushed some of them out of sight. Drafting convention
  agrees: an extension line is the same ink as the dimension line it serves. Any
  future softening has to reach all three renderers.
- **A lifted dimension number clears the TICK, not the line** (`_dimLabelLift()`).
  The oblique is `DIM_TICK_LEN` long and *centred* on the line, so it reaches half
  that above it; the number's chip is opaque white, so the old flat 3px lift rubbed
  out the tick's upper half in the PDF and in Illustrator. The gap only pays for the
  tick when the tick style is on. Keep the chip opaque — making it transparent
  "fixes" the overlap by letting the line run through the number, which is the exact
  thing the chip exists to prevent.
  Don't write the word "finally" in comments near `exportElevPNG`/`exportElevSVG` —
  two tests locate their cleanup blocks by searching the raw source for it.
  `ELEV_PT_TO_PX = 2` is the one place points and pixels meet: `_dimLineWeight()`
  multiplies by it for the screen, `_drawElevAnnOps` **divides** by it to recover
  the nominal point value and does **not** scale stroke widths by the placement
  scale `k`. That's the fix, not an oversight: `k` derives from the capture
  artboard, which is the *fit-to-window pixel size*, so printed weights used to
  depend on how wide the browser window was. Geometry still scales by `k` (the
  target circle's radius included) — only widths and the dash runs derived from
  them come out of it. `CanvasPdfRec` renders at page-point scale, so the Deck
  Studio preview needs nothing extra; the raster fallback (zero ops parsed) can't
  do this and keeps the old scaled look.
- `annotationStyle.dimEnds` (`'none'|'tick'`) is the dimension-end style, set in the
  Elevations gear (Line Ends). `'tick'` = architectural 45° obliques: `_dimTicksHTML()`
  appends two per line, `--dim-line-w`/`--dim-tick-w` carry the two weights, and
  `_dimExtOverhang()` runs extension lines past the intersection. `DIM_TICK_LEN`/`DIM_EXT_OVERHANG` are print constants
  in px — they must NOT scale with `elevScale`. **Arrowheads are never an option**;
  `.dim-arrow` elements are drag controls and carry `data-export-skip`.
  A tick is a rotated border, so `emitEl`'s axis-aligned border cases can't see it —
  it needs the `data-svg-tick` case, or ticks silently vanish from SVG and PDF.
  Group dims are JS-positioned with inline styles, so they read the **live**
  `annotationStyle` plus the shared `_dimLineWeight()`/`_dimTickWeight()` helpers.
  They used to hold a per-entry style SNAPSHOT resynced by one function only, so
  undo / project-load brought the stale copy back and left the box its old colour
  while every CSS-var dim updated. Don't reintroduce a copy. Their bounding rect is
  always dashed by studio convention, whatever DASHED/SOLID says.
- **Installation notes** (`FRAME_INSTALL_NOTES` + `editorialContent.installNotes`)
  are a deck-wide tick list printing an INSTALLATION NOTE box on install-guide **and**
  breaker pages. Deliberately outside `_igCfg`, which forces a fixed base for breakers
  so Install-guide globals can't bleed onto them — notes are the one setting that must
  reach both. They print as a **narrow column down the right**, taking width off
  `SR.R` — never height off `SR.B`. On a widescreen page the elevation is
  height-constrained and has ~118pt of slack width, so a 150pt column costs it ~6%
  where a full-width band cost ~17%; ticking every note made a band shrink the
  drawing badly. Past the page height the *type* shrinks (to `IG_NOTE_FS_MIN`), not
  the drawing. `_installNoteBoxH()` is measured before the layout; the block is drawn
  **up front**, because `_drawInstallGuidePage` has several early returns that each
  draw their own footer, the same trap as `_drawSpecSetPage`. Note `key`s are
  persisted, so they're permanent; wording is free to change. A **breaker page**
  selected in Per-piece or Group A/B/C mode gets the install-guide panel (and so the
  notes) via the `desc._install && !desc._manual` branch, which must stay ahead of
  the mode branches — otherwise the tick list is reachable only from Install-guide
  mode, which nobody would guess.
- `_specThumbCaption()` is the ONLY way to draw a thumbnail caption (Frame,
  Floorplan, Elevation on spec pages; the breaker/install captions too). They sit
  in a row, so any difference reads as a mistake — the elevation one was hardcoded
  to helvetica at its own grey. Breaker captions are the bare word: the item code
  is already the page title.
- `_ELEV_CAP_QUALITY` drives the elevation capture's render width + JPEG quality,
  separately from and *above* `_PDF_QUALITY`. That capture is the one raster on the
  page carrying **text**, and JPEG ringing on thin black glyphs is what reads as
  fuzzy next to the vector type around it; `_PDF_QUALITY`'s numbers are tuned for
  photos, which hide it. It used to be pinned at 3200px/0.92 whatever the user
  picked. PNG is not an option — the drawing contains artwork photos, so lossless
  runs to megabytes per elevation.
- On per-piece spec pages the artwork top is clamped to the top of the spec text
  (`specTop` in `_drawSpecPageTemplate`); several templates place `artwork.y` above
  `spec.y`. The box loses the height it gives up rather than spilling past its
  bottom.
- `_autoLiftDimLabel(dim, type)` moves a dimension number OUT of its line (above a
  horizontal one, beside a vertical one) when the gap is too narrow to hold it —
  the number sits inside the line normally, with an opaque chip that spilled over
  the frames in mm. It **measures**, so it must run after `appendChild`; a detached
  element reports 0 and it correctly no-ops. `data-lbl-off` carries the user's
  along-line nudge across the switch out of flex flow. **Which** side it lifts to
  comes from `data-line-off`, the perpendicular drag offset every dim renderer must
  publish: extension lines occupy the side the frames are on, so a line dragged
  down puts its number below. Defaulting to "above" everywhere was the bug.
- **Elevation dual units** are `elevDualUnit` in localStorage (a drafting pref, not
  project data) — separate from the spec-page setting on purpose: an elevation is
  dimensioned in a dozen places at once. Inches lead whatever the project unit is;
  `elevFmt()` is the single place that conversion happens and `unitSuffix()` follows
  `_elevPrimaryUnit()`. The companion rounds to the **elevation's** precision (whole
  mm), coarser than the spec pages' on purpose — set-out drawing vs fabrication
  spec. `_elevDualLast` holds the remembered unit; `elevDualUnit` goes '' when off.
- The **target** mark (`_elevCenterTarget`) goes on each frame centre AND on the
  wall-centre × hang-height crossing (in `guide-layer`, so it rides the Guides
  toggle that owns both lines). Circles mean centres — one reading. It's real
  inline SVG carrying
  `data-svg-passthrough`, because `emitEl`'s border cases only emit `<rect>` with no
  border-radius handling — a CSS circle prints as a square. That passthrough case
  must stay ahead of the generic border cases.
- The elevation-capture cache (`_igCapCache`) is keyed on **`_elevCapGen`, never
  `_dsEditGen`**. Both are bumped in `pushHistory`, but `_dsEditGen` moves on every
  undoable edit anywhere, so keying on it made any unrelated change (a ticked note, a
  renamed page) recapture every breaker/install elevation — a view switch to the
  Elevations tab plus SVG plus rasterize, per page. `_elevCapGen` moves only when
  `_elevCaptureSignature()` differs. That signature compares the *state* rather than a
  hand-listed set of fields, which is why it catches what the older stamps missed
  (frame `active`, `distToggles`, group dims, custom lines, the character, hang
  height, baseboard). It **fails closed**: unhashable → treated as changed. Long
  strings are replaced by their length so artwork data URLs aren't compared whole.
  **Write to it only through `_igCapCacheSet()`, never `_igCapCache[k] = …`** (a
  test pins that). Because the key carries `_elevCapGen`, every elevation edit mints
  a new one and the previous entry becomes *permanently unreachable* — and nothing
  evicted it, so a session of nudging frames left hundreds of MB of dead
  multi-megabyte captures behind. That was the gradual slowdown. Eviction drops
  **stale generations first**, then oldest: plain oldest-first would throw away
  another wall's *current* capture while you churn one wall, and that wall would
  recapture for nothing.
- **Only ONE elevation capture may run at a time** (`_elevCapInFlight`, released in
  a `finally`). There is one elevation DOM; a capture loads a wall into it, pins the
  export padding, hides the rail, forces the zoom, builds a multi-megabyte SVG
  string and puts it all back. Two interleaved corrupt each other's restore and hold
  both strings — that was the hard freeze from hitting Generate PDF mid-preview-build.
  The flag guards can't cover it: the export deliberately forces `_igNoCapture` off
  precisely when an in-flight thumbnail render is still running. The loser returns
  `null`, which marks the page incomplete so nothing caches it.
  Restore `_igNoCapture` from the **live** `_thumbBusy`, never a snapshot — the
  snapshot is read while a job may be in flight and that job clears the flag on its
  own way out, so putting a stale `true` back strands it and nothing may ever
  capture again.
  The key itself is `_igCapKey()` — **one definition**, shared by the page renderer
  (which looks a capture up) and the prime pass (which fills it in). It was inline in
  `_drawInstallGuidePage`, so the renderer was the only thing that could name an
  entry, which is why nothing could pre-fill the cache. Every input is global or
  per-elevation *state*, nothing read off the active view, so a key computed in the
  Elevations tab matches one computed in the Deck tab — that's what lets the prime
  pass compute all its keys up front.
- **Elevation captures use an OFF-SCREEN PORTAL, never a view switch.**
  `.view-container.elev-portal` (style.css) lays `#view-elevation` out for real while
  leaving the visible view alone. `position: fixed` is the load-bearing part: it takes
  the view out of flow so the deck beside it keeps full width and doesn't reflow.
  Deliberately **not** `visibility:hidden`/`opacity:0` — the first kills nothing but
  the second leaks into the SVG export, and a `display:none` view measures **0**,
  which is the entire reason the old code had to switch views at all. `_elevPortalOpen`
  sets width/height **inline from `.app-content`'s real box** (viewport fallback) or
  the workspace measures its 240px floor and the fitted scale, and so the drawing,
  differs from what the Elevations tab shows. Ref-counted like the light theme, so a
  batch lays the view out once for N walls.
  `_captureElevWithGuides` therefore calls **no `switchView` at all** — it opens the
  portal and calls `_elevLoadWall(idx)`, which is switchView's elevation branch minus
  the view change (extracted for exactly this). `currentView` never moves, Deck Studio
  is never torn down and rebuilt, and the light theme is scoped to a view nobody can
  see. If the Elevations tab *is* the visible view, `_elevPortalOpen` returns false
  and walls load in place — the same thing clicking a wall does.
- **Elevation captures are BATCHED through `_elevPrimeCaptures()`.** Even with the
  portal, each wall costs a full `_elevLoadWall` redraw plus an SVG render plus a
  rasterize at up to 6000px, and only one `#wall` exists to render into, so two
  captures must never overlap. The batch walks the walls once behind
  `#elevPrimeOverlay` (a full-screen modal with per-wall progress, above the deck
  preview modal's z-index) and restores the user's **wall** once at the end —
  `_captureElevWithGuides` skips its own restore while
  `_elevPrimeActive`. That skip is a **module flag, not a parameter**: the function
  takes an index and nothing else, so no caller can get a different capture from the
  editor's (pinned by two tests). `_dsBuildAllThumbs({prime:true})` is phase 1 →
  thumbnails phase 2; the automatic 1.5s post-edit sweep calls it with **no options**
  because a modal that appears by itself after you type is worse than a placeholder.
  A cancelled phase 1 must not roll into phase 2 (`_elevPrimeLastCancelled` — the
  returned count can't say so), and the loop must **rethrow** `_pdfWasCancelError`
  or Cancel during a PDF build becomes "carry on quietly".
- **`_igNoCapture` means "a background thumbnail render is in flight"**, and
  `_thumbPump` holds it for the life of every job — so Preview during a rail build
  drew the "Hit Build" placeholder, the exact thing Preview replaces. `_dsBuildPage`
  now drops the queue and bumps `_thumbRunToken` (the same move `exportSpecPagePDF`
  makes), primes its own wall, then puts the rail back. It **sets
  `_igNoCapture = _thumbBusy`** rather than restoring a snapshot: a snapshot taken
  while a job was in flight strands the flag true and nothing may ever capture again.
  `_drawInstallGuidePage` checks `!_igNoCapture && !_elevPrimeActive` — two
  independent suppressors, because an unrelated render finishing mid-batch flips the
  save-and-restore boolean back under you.
- Breaker pages read the legend from their **own** `installGuide.breakerLegend*`
  slots (`_igSet(..., forBreaker)`), so the Letter legend control works there without
  reintroducing the Install-guide-globals bleed that `_igCfg`'s forced base prevents.
  `variant`/`plan`/`planScale` stay forced — a breaker is always elevation-only.
- **PDF text wrapping must measure with jsPDF, never a canvas.** `_drawRichTextPdf`
  passes `_richPdfMeasure(doc)` into `_layoutRichLines`, and both it and the draw loop
  get their font state from `_richPdfFont()` — so the width a line wraps at and the
  width it prints at cannot diverge. A canvas `measureText` is a *different font
  engine* reading CSS stacks and substitutes silently; that mismatch caused the cover
  heading to wrap onto a phantom line landing on the subheading, and the guard added
  to stop it (`_richMeasureTrusted`, now canvas-only) then stopped paragraphs wrapping
  at all so they ran off the page. Letter spacing is added *outside* the measurer,
  because `getTextWidth` excludes charSpace. Vertical placement has its own trap:
  Deck Studio uses a unitless CSS `line-height`, so the browser applies HALF-LEADING
  (glyph top = boxTop + (leading - fontSize)/2, negative when leading is tighter than
  the font) while jsPDF's `baseline:'top'` applies none. `_drawRichTextPdf` adds
  `halfLead` per line to match — without it the cover heading dropped ~7pt onto the
  subheading. It is a position offset only; `cy` still advances by the plain leading.
- **Elevation annotations print as real vector PDF, not pixels.** `exportElevSVG`
  returns its three z-groups separately (`picSvg` = frames/artwork/figure, `annSvg` =
  lines + numbers) on **one shared artboard**; `_captureElevWithGuides` rasterizes only
  `picSvg` and parses `annSvg` into ops via `_elevAnnOps`, which
  `_drawElevAnnOps` replays with `doc.line`/`rect`/`text`. Non-negotiables:
  the two halves must share the artboard header, and the **pixel content-crop must be
  skipped** on this path (`if (_vecOK) throw 0;`) or the raster slides out from under
  the ops. Parsing our own SVG is only safe because this module writes it — unknown
  tags are skipped, and zero ops falls back to the old whole-raster path.
  Two traps that nearly shipped: `_annHexToRgb` can't read the `rgb(r,g,b)` strings
  `emitEl` copies from computed styles (use `_cssColorToRgb`), and `'sans-serif'`
  contains `'serif'`, so `_elevAnnFontRole` must test grotesques first. SVG `rotate()`
  is clockwise and jsPDF's text `angle` is anticlockwise — hence the negation.
- **Rotated labels (57" AFF, wall dims, group frames) need two special cases** that the
  axis-aligned ones don't; both shipped broken in 16.21 and are pinned by
  `test_elev_vector_rotated_labels.js`. (1) **Never pass `align` to `doc.text`.** jsPDF
  *does* honour `angle` alongside it, but applies `align` in **unrotated page space**, so
  it subtracts half the text width from X even when the text advances along Y — every
  vertical label slid sideways by half its length. `_drawElevAnnOps` does the anchor
  shift itself along the advance direction `(cos a, -sin a)`, exact at any angle and
  arithmetically identical to jsPDF's for unrotated text. (2) **A rotated `<rect>` must
  become a quad.** The white chip lives inside its label's `rotate()` group; mapping only
  its origin left a 60×17 chip horizontal at a rotated corner instead of upright over its
  number. `_elevAnnOps` maps all four corners and sets `pts` **only when `_matAngle` is
  non-zero**; `_drawElevAnnOps` draws `pts` with `doc.lines(..., closed)` because
  `doc.rect` is axis-aligned only. Keep the `pts`-only-when-rotated guard, or every
  ordinary chip becomes a slower path for nothing.
- **`CanvasPdfRec` is a SECOND renderer with the jsPDF API**, used for the Deck Studio
  centre preview and every rail thumbnail (`renderDeckPageCanvas` /
  `renderSpecPageCanvas`). Anything drawn through a `doc` reaches it too, so a vector
  feature added for the PDF has to be implemented **twice** or the preview silently
  disagrees with the export — which reads to a designer as a broken tool. It shipped
  missing both halves of rotated labels: `text()` recorded `opts.angle` but `render()`
  never read it (vertical dims drew flat), and there was no `lines()` at all, so the
  rotated chip vanished with **no error** because `_drawElevAnnOps` wraps its calls in
  `try/catch`. jsPDF's angle is anticlockwise and canvas `rotate()` is clockwise in this
  y-down space, hence `x.rotate(-ang)`; the label is drawn at the origin of the
  translated frame so the multi-line `lh` advance runs along the text's own axis.
  Measurement is deliberately **not** shared — jsPDF reads embedded TTF metrics and
  canvas reads CSS fonts, so each measures with the engine that will draw. `x` must
  still match across both for a 90° label (the anchor shift is entirely in `y`), which
  is what `test_canvas_preview_rotation.js` pins. When adding a `doc.*` call, check the
  `CanvasPdfRec.prototype` list first.
- **The wireframe placement look** (grey block in the image opening + the frame's
  letter centred on it) is `editorialContent.wireframe`, read by `_isWireframe()`,
  toggled from Elevations Settings by `setElevWireframe()`. Deliberately the **same
  flag the Wireframe deck preset sets** — one notion of "this is a wireframe
  project", so the preset gets the look for free and two flags can't disagree.
  `ELEV_WF_FILL` / `ELEV_WF_INK` / `_elevWfLetterPx()` / `_elevWfFontCss()` /
  `_elevWfFontWeight()` / `_elevWfFontStyle()` are the one definition of the look,
  because it has to be identical in the editor DOM, `_maybeAddArtworkToSvg` and
  `renderFrameToCanvas`. The letter's size/font/slant are
  `annotationStyle.wfSize`/`.wfFont`/`.wfStyle` — **styling sits in `annotationStyle`
  (localStorage, deck-wide) while the on/off is project data**, and the controls sit
  in Label & Dimension Style beside the label size, font and weight, because a
  wireframe letter IS label styling. Because they're in `annotationStyle` they're
  already inside `_igGuideStamp`, so no extra invalidation plumbing.
  `wfSize` is ABSOLUTE, not proportional: uniform letters are what the reference
  drawing has (A..E all one size, since a letter is a label not a measurement). It's
  **capped to `min(w,h) * 0.8`** per opening, which the setting doesn't get to
  override — a small frame at a fitted zoom is a few px tall and 48px would spill
  across its neighbours. The narrow side governs the cap.
  The DOM writes family/weight/slant onto the element and the SVG reads them back
  off it rather than re-reading the setting, so there is no second interpretation. In the SVG the wireframe branch must come **before** the
  `!f.artworkUrl` guard or frames with no art export blank, and it reads size/family
  off the live element so the exported letter is by construction the one on screen.
  It wins over artwork (a piece that HAS art still shows as a placeholder) and drops
  the inset opening shadow, which is both the wrong cue for a placement drawing and
  the part that wouldn't survive to the SVG anyway. The letter uses `textContent`;
  only the opening-size text needs `innerText`, for its embedded newlines.
  It's in `_elevCaptureSignature`, and `setElevWireframe` also drops the frame-mockup
  and deck caches, whose keys carry no wireframe term.
- **THERE ARE THREE GEAR POPUPS AND THEY EACH HAVE THEIR OWN `row()`** — arrow, shape and
  text (`_dsOpenArrowGearPopup` / `_dsOpenGearPopup` / `_dsOpenTextGearPopup`). Fix one
  and you have fixed a third of the problem, which is exactly what happened: the arrow
  popup had `flex-wrap` and the other two did not, so the stroke swatch row (14 swatches,
  a colour input and three controls — about 280px of content in a 216px box) ran off the
  right edge of its own panel. A test now walks EVERY row helper.
  They must also be **clamped and scrollable**, and the clamp must MEASURE
  (`_dsClampPopup`, called after append): two of them placed themselves against a
  hardcoded height guess (320 / 380) and set no `max-height`, so a popup taller than the
  guess ran off the bottom with no way to reach what was under the fold. All three now
  set no `max-height`, so a popup taller than the guess ran off the bottom with no way to
  reach what was under the fold. Wrapping the rows made them taller, which turned that
  latent problem into a visible one.
  Clamping at OPEN time against `popMaxH` was the wrong correction and shipped for one
  version: the popup is empty then, so its real height is unknown, and clamping against
  the MAXIMUM put the ceiling at ~14% of the window — about 118px on a 900px screen — so a
  popup dragged lower snapped back to the top on its next refresh, which is **every swatch
  click**. Open now places roughly and `_dsClampPopup` measures once the popup is in the
  document; a popup that fits stays exactly where it was dragged, and one that overhangs
  moves by the overhang and no further.
  The edge-gap popover is deliberately NOT clamped: it is appended empty and positioned by
  its own CSS class, so measuring reads zero and clamping would move it.
- **`silent` MUST REACH THE PRIME.** `_dsBuildPage(silent)` honoured the flag for its own
  overlay but called `_elevPrimeCaptures([idx])` with no options, so the render modal
  appeared on an AUTOMATIC refresh whenever the elevation cache had been dropped. The
  comment there claimed a cache hit "shows nothing", which was true only while the cache
  stayed warm — a deck-wide guide change drops it every time, so every toggle popped a
  modal. The Preview button still explains its trip; an auto-refresh primes silently.
- **THE JUMP BETWEEN A BREAKER PAGE AND ITS WALL REMEMBERS WHERE IT CAME FROM**
  (`_dsJumpToElevation` / `_elevReturnToDeck`, `#elevReturnBar`). Editing the wall still
  happens in the Elevations tab, because that is where the drawing is; what was missing
  was the way BACK, which meant finding the page again among twenty.
  The return point is the page KEY, never `_dsIndex`: the deck rebuilds constantly and an
  index brings you back to whatever has since taken that slot. `_elevReturnToDeck` calls
  `_dsRefresh()` BEFORE `_dsRestoreSel`, because the deck may have been rebuilt while the
  wall was being edited — a guide toggle does exactly that.
  Arriving at the deck by ANY route clears it, so a later visit to Elevations does not
  offer to return somewhere you already went, and the bar is absent rather than parked.
- **LAYOUT GUIDES ARE REACHABLE FROM DECK STUDIO** (`_dsElevGuidesInto`, on the
  install/breaker panel). Turning the scale character on used to mean leaving Deck Studio
  for the Elevations tab, finding the button, coming back and rebuilding the page. The
  state is one line of DOM on a view that is still in the document while Deck Studio is
  open, so the round trip was never necessary — there was simply no control on this side.
  They are **deck-wide and the label says so**: there is ONE elevation view, so a layer’s
  display is shared by every wall and therefore by every breaker and install page. A
  control that looked per-page here would be lying.
  `_dsGuideIsOn` reads it **exactly the way `toggleElevLayer` does** — an unset display is
  OFF, which is what all eight ship as — or the two panels start out of step on the first
  render. The toggle also flips the Elevations tab’s own button, and calls
  `_elevGuidesChanged()` (dropping every cached capture and page preview), which is the
  "and refresh the page" half of the complaint.
  It deliberately does **NOT** call `drawElevAll`, the one thing it cannot borrow from
  `toggleElevLayer`: the elevation view is hidden behind Deck Studio and a `display:none`
  view measures ZERO, which is the entire reason `_elevPortalOpen` exists. The character’s
  first-show nudge sets `elevPersonPos` and nothing else; the next capture redraws through
  the portal.
- **The Elevations tab is the source of truth** for which measurements appear on
  elevation pages. Layout-guide *styling* is global; the figure's *position* is
  per-elevation. Breaker captures honour `_breakerMeasure()` ("Show layout guides").
- **Hang height and baseboard are stored in INCHES** (`elevHangIn` /
  `elevBaseboardIn`, standards `ELEV_STD_HANG_IN` 57 and `ELEV_STD_BASEBOARD_IN` 4)
  and the inputs are their *display*, reseeded by `seedHangBaseboardInputs()` on
  boot, on every unit change, on project load and on undo. They used to live only
  in the DOM in whatever unit was current, which broke twice: `loadMasterProject`
  set `elevUnit` from the file and never touched the boxes, so an inches project
  opened in cm read 144.78 as *inches*; and `setUnit`'s multiply-the-input pass
  rounded to 2dp, so 57 drifted on every toggle. They're now saved
  (`hangHeightIn`/`baseboardIn` in the project JSON, and in
  `snapshotProjectState` so undo/autosave/version history carry them) — before,
  they weren't persisted at all and a new project inherited the last one's numbers.
  Display rounds to **2dp, not `unitInfo().decimals`**, or the cm standard prints
  144.8 instead of 144.78. A custom height stays custom; the ⌖ buttons snap back.
  `_elevCaptureSignature` hashes the inches, not the input text, or a unit switch
  alone recaptured every elevation.
- `importDashCSV` strips unit suffixes during column lookup, so CSV headers must
  include the suffix, e.g. `Overall Width (cm)`.

- **EVERY MODAL IS ONE CLASS: `.frame-modal`.** There were 22 hand-written overlays in
  index.html carrying the same eight declarations, and they had DRIFTED: five scrim
  darknesses (0.55, 0.6, 0.65, 0.7, 0.8) and two blur radii, so opening two modals in
  sequence visibly flickered the page behind them. Nothing chose those numbers.
  `--modal-scrim` and `--modal-blur` are one value each now.
  **The LAYERS are the opposite of drift and were preserved exactly.** Each of the five
  z-indexes is a real decision about what may cover what, so they were renamed, not
  flattened: `--z-modal` (over the app), `-over` (a full-screen tool), `-nested` (opens
  on top of another modal), `-progress` (long-running work that must not be buried),
  `-alert` (the info/confirm box, which has to outrank all of them because it is how the
  app reports failure). Modifier classes `.fm-over/.fm-nested/.fm-progress/.fm-alert`.
  **Three things here look tidy-able and are not.**
  (1) Each modal keeps its own inline `display:none`, because that is how the JS opens
  and closes them (`.style.display = 'flex'`); an inline value beats the class either way.
  (2) `#infoModal` and `#dsGenerateModal` ALSO keep an inline `z-index`. `showInfoModal`
  rewrites `.style.zIndex` at show time, and `test_img_intake` reads `.style.zIndex` off
  both — move them into the class alone and that file fails pointing at the wrong thing.
  (3) `#alignModal` is deliberately NOT a `.frame-modal`: it has no scrim and
  `pointer-events:none`, so it is a guide layer wearing a modal's shape. Giving it the
  shell would lay an invisible click-eating sheet over the wall.
  `test_modal_shell.js` is plain Node with no jsdom — these are questions about the
  SOURCE, so reading the files directly sidesteps the doubled-backslash template literal.
  It still got bitten by the same class of bug one layer out: a `new RegExp('…\s…')`
  built from a string lost its backslash on the way into the file and silently matched
  nothing. Regex LITERALS survive; strings that become regexes do not. Use `indexOf`.

- **THE BLUES WERE FOUR AND ARE NOW THREE TOKENS.** `--accent` (#3a86ff) is the brand:
  nav tabs, primary buttons. `--ui-active` (#6a6aff) is "this control is switched ON":
  active tab pills, toggles, progress bars, drag handles — hand-written in 164 places.
  `--selected` (#2196f3) is "this object on the wall is selected".
  **That third token fixed a real inconsistency, not a spelling.** A frame outlined in
  #2196f3 while a context block and a glazing run outlined in #6a6aff, so selecting a bed
  and selecting a picture on the SAME drawing looked like two different gestures. The
  frame colour won, because two of its call sites are paired by a comment saying they must
  match. The fourth blue, #3b82f6, existed ONLY as the fallback inside `var(--accent, …)`
  and did not equal `--accent`; all 11 now read the real value. `--warn` (#c98a2e) is the
  same story for amber, which had drifted to #c08a2e across app.js.
  **IN THE LIGHT THEME THE CHROME IS MONOCHROME (17.93).** `.light-theme` overrides
  `--accent`, `--ui-active` and `--btn-primary` to near-black, so a control that is ON
  inverts (light grey, darker on hover, black with white type when chosen), and the
  surfaces are warm off-white rather than blue-grey (`--bg-input` stays pure white).
  `--selected` is NOT overridden: it is the one blue left, for things selected ON THE
  DRAWING OR PAGE, where black would vanish into the linework. That makes the token a
  real contract: every on-canvas outline, handle, grip, marquee and line-tool marker
  reads `--selected`, never a chrome token, or it silently turns black in light mode.
  `test_light_monochrome.js` lists those renderers by name; add a new one there.
  **`STATUS_DEFS` STAYS A HEX LITERAL AND MUST.** It feeds `_annHexToRgb` →
  `doc.setFillColor` for the PDF status legend, and a `var()` there parses to nothing and
  silently drops the swatch.
  **Declare a token AFTER replacing the raw value, never before.** The other way round
  lets the blanket replace rewrite the declaration into `--x: var(--x)`, which resolves to
  nothing and takes the colour out of the UI with no error anywhere. That happened twice
  in one sitting and the suite caught neither, because nothing tested computed CSS.
  `test_color_tokens.js` does now.
  **jsdom KEEPS a `var()` set on a LONGHAND and DROPS one set through a SHORTHAND.**
  `el.style.borderColor = 'var(--ui-active)'` reads back verbatim, while
  `cssText = 'border:2px solid var(--ui-active)'` leaves `.style.borderColor` as `''`. So a
  test comparing two elements' `.style.backgroundColor` finds them EQUAL whichever one is
  lit. Read `getAttribute('style')` instead — four tests had to move to it.
  **A regex containing `var(--x)` matches NOTHING**, because the parentheses are a capture
  group. Two checks in `test_v32` passed while asserting nothing until they moved to
  `split().length - 1`. Same family as the doubled-backslash trap above.
  Worth knowing rather than a rule: `stroke="var(--dim-color)"` already ships in five
  places, so a `var()` in an SVG PRESENTATION attribute does resolve on screen. The hazard
  is only in markup SERIALIZED into an exported file, which has no `:root` to read — which
  is why the context art substitutes a real colour on the way out.

- **A PER-PIECE DETAIL PAGE IS FOUR TICKS, NOT TWO TEMPLATE CARDS** (`_specSlots`,
  `_specTplEffective`, `SPEC_SLOT_KEYS` = frame / profile / plan / elevation). The
  bundle was the wrong unit: a deck part way through is missing these ONE AT A TIME.
  Reported as "if I'm at a stage where I might be missing frames, elevations, plan
  views". The frame corner and the moulding profile get SEPARATE ticks, because a
  piece can have one photographed and not the other.
  **The two rules pull opposite ways on purpose.** TICKED but empty **reserves** the
  space (the shared `_specSwatchBox`, grey, with its own caption): the page being laid
  out has to stop moving while it gets filled in, or every piece you add reflows the
  ones already placed. UNTICKED **removes** it and everything after **packs left** —
  untick the floorplan and the elevation takes the far-left column.
  **THE TICKS PICK THE BASE LAYOUT, THEY DO NOT INVENT GEOMETRY.** `artSpecDetail` and
  `frameSpecDetail` already ARE the no-frames / frames pair, so `_specTplEffective`
  resolves to whichever one the frame ticks imply and then deletes and repacks. That is
  what makes this safe on live decks: a project that never touches a tick renders byte
  for byte as it did. Re-deriving one layout for both would have silently re-typeset
  every artSpecDetail page in flight.
  **The seeding is keyed on the field being ABSENT, not on a version counter**, and it
  reads the template the deck is already on — an artSpecDetail deck chose "no frame
  thumbnails", and defaulting it to all-on puts a corner sample on every page of a
  project already sent to a client. Per-PAGE template overrides are seeded the same way
  or one page pinned to artSpecDetail grows the strip it was pinned to avoid.
  **Deck-wide with a per-page exception, deck-wide selected by default** — the same
  shape and the same reason as the heading type controls. Setting a tick deck-wide
  **clears that ONE slot** from every page exception (a page's other pins stand), or
  "apply to all specs" visibly does not apply to all. `_clearSpecSlots` prunes the
  empty shells.
  **Three consumers, not one.** `_drawSpecPageTemplate` (the PDF), `_deckMockHTML` (the
  instant preview, which IS a picture of the printed sheet) and `_dsThumbCacheKey` —
  miss the mock and the preview lies about the export; miss the key and a thumbnail
  keeps showing a floorplan that has been switched off.
  **A template CARD is deliberately NOT filtered** (`ctx.swatch` takes the raw
  template): a card shows what that layout IS, and filtering it by the deck's current
  ticks makes it advertise the page you already have.
  **THE PER-PIECE PICTURE CARDS ARE GONE.** They were rendered page demos under
  "Click to switch", and once the ticks existed they were a second control for the same
  page inviting the wrong gesture: browsing layouts rather than ticking the parts you
  actually have. Reported as "I do not want designers clicking to switch, I want them
  choosing to check Frame corners, Mould profile, floorplan, elevation".
  **AND THEN THE LAYOUT BUTTONS WENT TOO: THERE IS ONE PER-PIECE LAYOUT.** A row of
  alternatives was the same invitation the cards were. "We will only keep the one
  layout option and designers can control what they show on page with the check boxes."
  **That made the default load-bearing rather than cosmetic.** A new project opened on
  `frameRight`, which drew no ticks — so with the buttons gone, every new project would
  have started on a panel with no control in it. The default is `frameSpecDetail` now,
  and so is the fallback for an unreadable stored value.
  **`_specTplSlotAware` therefore covers `frameRight` and the legacy `classic` too.**
  They re-typeset onto this geometry, which is the lesser evil: the alternative was a
  page with no control at all. `SPEC_SLOT_SEEDS` is what makes it safe — one table
  saying what each old layout ACTUALLY drew, so a frameRight deck seeds elevation ON and
  floorplan and frame strip OFF and keeps the parts it had even though the column widths
  move. The deck seed and the per-page seed read that same table or they drift.
  **`custom` is deliberately NOT slot-aware.** It is `freeform` — a page somebody placed
  by hand — and resolving it onto this geometry would throw that work away. It keeps its
  own renderer, and the panel prints a sentence saying there is nothing to tick rather
  than showing an empty section, because an empty panel reads as broken.
  **The flat sheet's bail RETURNS before any per-piece control is built.** It was an
  inline `!_flatPage &&` guard on the ticks line, which is the same behaviour and a
  worse shape: the invariant the tests here read is "the bail comes first", and an
  inline guard makes that untrue on paper while staying true in fact.
  A negative control caught two things worth keeping in mind. Asserting only that the
  default is *slot-aware* let a real regression through, because `frameRight` is
  slot-aware too and seeds two of the four parts OFF — the check has to assert the
  seeded TICKS, not the template name. And the `classic` seed row needed its own check;
  one table does not mean one test.
  **AND THEN GROUP A/B/C GOT THE SAME TREATMENT.** The line drawn one version earlier —
  "a per-piece page has PARTS, a group page has an ARRANGEMENT" — did not survive
  contact: the four group arrangements differed mainly in how the LEFT COLUMN was built,
  and the consolidated one is what a salon hang wants. **Shared specs is the group
  default and the only group layout offered**, and the four cards are gone.
  **A GROUP PAGE KEEPS ITS OWN TICK MAP** (`specGroupSlots`, `_specGroupSlots`,
  `_setSpecGroupSlot`), and that is not tidiness — the two page kinds disagree about the
  DEFAULTS. A per-piece page has always drawn its elevation; a group page's wall
  thumbnail was `scaleOpts.elevThumb`, **off** by default, and no group page has ever
  had a floorplan. One shared map would have grown an elevation and a floorplan onto
  every group page of every deck in flight. Same four names, same two rules, different
  stored value. `_specSlotsFor(tplKey, ovKey)` is the one resolver, so a renderer asks
  what a page shows without knowing which map answers.
  The seed reads what each deck already drew: `elevation` from `scaleOpts.elevThumb`,
  `frame`/`profile` on (the strip printed when there was room), `plan` off.
  **THE BAND PACKS RIGHT TO LEFT: elevation, floorplan, profile, corner.** Each
  thumbnail anchors to the box its RIGHT-hand neighbour actually drew (`_thumbBox`,
  rewritten by each in turn) rather than to a column of its own, so unticking one slides
  the rest right instead of leaving a hole. The corner and profile stay INTERLEAVED per
  moulding inside `_drawFrameStrip` (`box.corner` / `box.profile`, defaulted true so
  every existing caller is unchanged): a shared-spec page carries three mouldings, and
  splitting them into two blocks would put a corner three cells from its own profile.
  **The `Elevation thumbnail (bottom-right)` checkbox is gone** — the Elevation tick is
  the one answer, and two controls for one setting is how a designer comes to believe
  they are two settings.
  **A template CARD pins the plan OFF.** The band is one row and the strip is the Shared
  specs card's whole point; a fourth thumbnail pushed three mouldings past
  `_drawFrameStrip`'s fit check and the card silently lost the thing it exists to show.
  A card advertises the layout; the ticks are the page.
  **NOTHING PAINTS TEMPLATE CARDS NOW, so the prewarm is off.** It rendered seven real
  pages (~4.5s) on every entry to the deck view to fill a cache no one reads. The
  RENDERER is deliberately still here and still tested — it is correct and a picker may
  want it back — but if the cards never return, `_dsPrewarmTplSwatches`,
  `_dsQueueTplSwatch`, `_dsPaintTplSwatch`, `_dsTemplateSwatchHTML`, `_specTplDemo*` and
  `SPEC_TPL_DEMO_*` are the block to remove together.
  A negative control was worth its weight here: SOURCE-ORDER checks on the band passed
  every break that moved a thumbnail, dropped its rect handoff, or stopped the frame
  ticks reaching the strip. Those four are RENDERED now and read off the captions, which
  is the one mark a band thumbnail leaves whether it drew content or reserved its space.
  And "both frame ticks off" proves nothing about the strip, because `_wantStrip` gates
  it before `_drawFrameStrip` is called — the case that reaches the strip is ONE tick
  off, and what changes is its width.
  Removing the grid re-broke a check that sliced `S.slice(i, i + 4000)` — a character
  distance, already widened once from 1600. The comments above the branch grew and the
  append fell outside the window, which reads exactly like the gate having moved. It
  slices between landmarks now. Two more test edits hit the backtick-in-a-template-
  literal trap and one hit quote-hunting inside one; prefer `indexOf` and counts.
  **The strip and the envelope anchor on whichever column survives**, never on
  `tpl.plan`: with the floorplan unticked the elevation IS the left column, and
  `_tplDesignFrame` measuring from a plan that is no longer on the page maps the strip
  onto empty space.
  Two traps for the next editor. `_dsSpecSlotsInto` is called AFTER `const _flatPage`
  is declared — it reads it, and a `const` read above its declaration is a TDZ throw
  that takes the whole panel out. And `tests/test_egd_wf_product.js` is mostly CRLF, so
  a multi-line edit anchor written with `
` matches nothing there, exactly as in
  style.css.
- **THE IMAGE CODE IS `_dsImageCode` (the file name, less its last extension), AND THE
  GEAR POPUP SHOWS IT WHETHER OR NOT THE CAPTION PRINTS IT.** It used to be reachable
  only by turning the caption ON and switching its source to Code — but that is a
  decision about the DECK, and wanting the code is usually a decision about somewhere
  else entirely: pasting it into a Dropbox or Finder search to find the original file.
  Most boxes never turn the caption on at all.
  ONE definition, shared with `_dsResolveCaptionText`, or the panel shows one string
  while the page prints another — worse than not showing it. Only the LAST extension
  goes, because the dots in a real code are part of it.
  The field is **readonly**, so it cannot drift from the file it names, and it exists
  so Copy has something to select.
  **Copy is the shared `svgDup` glyph, LEFT of the field.** That constant is already the
  universal copy icon (two overlapping rounded rectangles, the Dupe column's), and copy
  and duplicate are the same idea — a second hand-drawn version is how two of them end
  up subtly different. Left, because the field is the thing being read, so the action
  belongs ahead of it; an icon, so the code gets the whole width of the row. Addressed
  by `data-act="copy-code"`, since there is no label text to match on.
  **The field is `flex: 1 1 60px`, not `1 1 auto`.** In a WRAPPING flex row an item is
  wrapped on its hypothetical size before it is ever shrunk, and an `<input>` reports a
  content width around 180px whatever `min-width: 0` says — which is why the button
  beside it kept dropping onto a line of its own. Same trap for any control put next to
  an input in these popups. An image with no name on record says so rather than
  offering an empty box; there is nothing to recover it from.
  **`_dsCopyText` needs its fallback.** `navigator.clipboard` is undefined outside a
  secure context and this app is opened from `file://` about as often as from https, so
  the async API alone leaves the button dead on exactly the machines a designer digs
  through a Dropbox folder on. The fallback selects the field that is already on screen
  and asks the document to copy; if even that is refused the text is left SELECTED,
  which is itself the answer.
- **THE GEAR POPUP IS A TABLE: A LABEL COLUMN, NOT A HEADER LINE PER SECTION.** Eleven
  sections each spending a line on their own name ran it the full height of the screen
  and it still scrolled. `sec(label, tip)` returns the control body; `subRow()` is a
  continuation line indented to the same column; `swIn()` is the block form, because
  `_frameSwatchesInto` lays out its own family rows and a flex body would put the
  families side by side. Same move `_dsTypeSection` made for the type rows, and the
  same fixed label width so the sections read as a table.
  236px → **340px**, which is what pays for the column, and the box comes out roughly
  square. Two labels are shortened to fit it (Weight, Radius) and carry their full
  wording as a tooltip; a test pins that a shortened label still has one.
  **`.action-btn` IS `width: 100%`, so any button with neither a width nor a `flex` is a
  full-width slab the moment it wraps.** That is all the Pill button ever was — it was
  appended to the radius row, overflowed at 236px, and landed on its own line at full
  width. Size a button that is meant to be small.
  **The `sec` WRAPPER deliberately has no `gap` and no `flex-wrap`**: it holds exactly
  two things, the label and the control body, and the label must stay beside its
  controls. Its spacing is the label's own `margin-right`. That keeps "a flex row with a
  gap must wrap" true of every row in the popup that actually holds controls, which is
  what `test_fp`'s spill check reads.
- **FILLING A SHAPE WITH AN IMAGE IS ONE OPERATION: `_dsSetShapeImage`.** It was
  written out twice and had drifted. The Replace… / Add image… button in the gear
  popup goes through `_dsHandleImageFile`; dropping a file straight onto the box goes
  through `_dsReadImageToShape`. Only the SECOND recorded `fileName`, and that field is
  the only thing the caption's **Code** source can read — so an image added the way the
  popup offers could never use it, and the Code button sat disabled directly underneath
  the button that had just failed to enable it. Reported as "my image placeholder
  settings is unable to switch over to image code for the caption".
  The name is written **unconditionally**, never only when the field is empty: a
  replacement has to take the new file's name or the caption goes on quoting a picture
  that is no longer in the box, and a nameless image must clear it so Code correctly
  disables itself again.
  The two paths still **decode and downscale separately** — 1100px long edge from the
  popup, 1400px from a drop — which predates this and is deliberately left alone, but it
  does mean the same photo lands at two resolutions depending on how you added it. What
  they share is what it MEANS to fill a shape, which is where the drift was.
  Code stays disabled on an image that predates the field, with a title saying to
  re-upload: the name was never stored, so there is nothing to recover.
- **THE ELEVATION'S GROUND IS NOT A THEME COLOUR (`--elev-ground`).** The drawing is
  print colours in BOTH themes — the wall, the dimension ink and every line weight come
  from `annotationStyle` and never from a theme var — so the surface it sits on has to be
  a print surface too. `.workspace` read `--bg-main`, so in dark mode the board went
  #1e1e1e and the outer wall dimensions, which are drawn OUTSIDE the wall in near-black,
  were **invisible**: the measurements were on screen and could not be read.
  Declared once in `:root` and deliberately **NOT overridden in `.light-theme`** — a value
  that is the same in both themes is not a theme value, and overriding it is how it
  silently becomes one again.
  A shade **darker** than `#wall` (#f0f2f5), the way a pasteboard sits under a sheet, so
  the wall still reads as the page. Lighter and the wall reads as a hole; equal and the
  page has no edge at all; a test pins both directions.
  The two floating buttons on it keep the APP's theme, because they are chrome rather
  than drawing. Nothing exported is affected: `html2canvas` captures `#export-wrap` with
  `backgroundColor: null` and that element is `background: transparent`, so the board is
  never in the picture.
  `.workspace` is the ONE scroll region of that kind in the app (`#scrollArea`), which is
  why the rule needs no scoping — but `_elevWrapPadding()` measures it, so keep changes
  here to paint.
- **LIGHT MODE IS OFF-WHITE, AND ONLY THE INPUT IS PURE WHITE.** `--bg-nav`, `--bg-panel`
  and `--bg-input` were ALL `#ffffff`, so the nav, every panel and every field were one
  flat sheet of paper and the app glared. Reported as "can we make the light theme mode
  less intense with the white".
  The surfaces now step light to dark — input, panel, nav, subpanel, main — and that
  ordering is the rule, not the five particular values. It also fixed something that was
  never right: `--bg-panel` and `--bg-input` being the same colour meant a field in light
  mode was told apart from the panel behind it **by its border alone**. `--bg-input`
  stays `#ffffff` deliberately: it has to be the lightest thing on screen or a text box
  stops looking like somewhere you can type.
  Safe to change because the deck preview reads NO theme token (see "the deck preview is
  a picture of paper"), so a softer panel cannot move a colour the PDF prints.
- **THE THEME TOGGLE SHOWS THE MODE IT WILL SWITCH TO.** It carried a moon in both
  themes, so the one control whose whole job is to change something never changed itself
  — there was no feedback that the click had landed. Sun while dark, moon while light.
  Two `<svg>`s and a CSS rule (`.theme-icon-sun` / `.theme-icon-moon`), the same swap
  `.logo-dark` / `.logo-light` two lines above it uses, so no JS has to remember to keep
  an icon in step — `toggleTheme()` stays one line and a test pins that it does.
  The sun is a stroked circle plus eight rays, because `.svg-icon` is `fill: none;
  stroke: currentColor` — a filled disc would come out as an empty ring.
  **`style.css` HAS MIXED LINE ENDINGS** (1728 CRLF among 2058 lines), so a multi-line
  anchor written with `\n` matches NOTHING and an edit script reports "not found" on text
  that is plainly there. Edit it line by line, or try both endings.
- **A CLASS SET IS NOT A STYLE APPLIED — `.action-btn.active` now exists.**
  `.action-btn` is on 154 elements and had NO `.active` rule anywhere, so a button
  marked active tracked its state perfectly and painted nothing. That is most of why
  wall mode looked invisible for several versions, and the fix at the time was to give
  `.wall-mode-btn` its own rule — which closed one button and left the trap armed for
  the next one.
  **ORDER IS THE WHOLE RULE.** `.action-btn.active`, `.action-btn:hover`,
  `.btn-secondary`, `.btn-outline` and `.btn-danger` ALL weigh (0,2,0), so source order
  is the only thing deciding. The block has to sit after every one of them or a lit
  button turns grey under the cursor, and a lit `action-btn btn-secondary` — which is
  exactly what the wall-mode pair is — paints plain grey. `:disabled` is restated last,
  because a control you cannot press must not look armed.
  **`test_active_state_visible.js` uses a REAL matcher, not string comparison.** It reads
  every `.active` selector out of style.css (28 of them) and asks jsdom whether each
  element actually matches one. String-comparing class names reported the LIBRARY/COLOR
  pair as unstyled, because the rule that paints it is `.unit-toggle button.active` — a
  descendant selector naming none of the element's own classes. It also sets `.active`
  on a real `.action-btn` and asks whether anything would paint it, which is the original
  bug in its live form.
  Still outstanding and deliberately not touched here: `.elev-tab` marks its selection
  with `.elev-tab-on` rather than `.active`, so two tab strips in one app use two
  conventions. That belongs with the tab-component consolidation, not with this.

- **THERE IS A TYPE LADDER AND A CORNER LADDER, AND NOTHING OFF THEM.** There were
  THIRTY distinct rem font sizes across app.js, style.css and index.html over 894
  declarations, eight of them inside one 0.12rem band (0.58 0.60 0.62 0.64 0.65 0.66
  0.68 0.70) — a third of a pixel apart at a 16px root, invisible to the eye and a
  guarantee that nothing lines up. Eleven border radii from 1px to 11px over 360
  declarations. Neither was a scale; both were sediment.
  `--fs-45` … `--fs-120` is a 0.05rem ladder widening above 0.85 (444 declarations
  moved, none by more than 0.8px); `--r-2` … `--r-10` is even steps (99 moved, none by
  more than 1px, and 4px now carries 224 of the 359).
  **Named by VALUE, not by role.** `--fs-65` says what it is and cannot be misapplied the
  way `--fs-small` can, and the point of a ladder is that 0.62rem is no longer
  expressible — which a semantic name would not enforce.
  **TIES GO TO THE DENSER NEIGHBOUR.** 3px sits exactly between 2 and 4, but 4px carried
  143 of the radii and 2px carried 19; sending it down would have moved 33 corners
  FURTHER from the house value while claiming to unify them. A first pass used
  ties-to-lower because it was tidier to state, and produced exactly that. The rule is
  "join the crowd", and it is written down because it is a judgement, not arithmetic.
  **50% circles and the single 99px pill are untouched.** Those are SHAPES, not sizes —
  any rung would square their ends off — and a test pins that the pill survives.
  Heights were deliberately NOT laddered. `height:` in this file spans dividers (1px),
  scrollbars (8px), icons, bars and controls, so one ladder over all of them would
  flatten differences that mean different things; and the control band 20–34px feeds
  flex rows whose siblings must match, where a 2px move is a layout change rather than a
  cosmetic one. A separate `--ctl-h-*` set for the control band only is the right shape
  if it is ever wanted.
  No rem size reaches the PDF: its text is sized in POINTS through `setFontSize`, so
  this is chrome only.

- **THERE IS ONE PANEL TAB STRIP: `.frame-tabs` / `.frame-tab`.** There were FIVE and no
  two agreed — four pill strips built from hand-written cssText (28/28/26px tall, three
  different font rungs, `font-weight:700` present or absent) plus the elevation sidebar's
  uppercase underline. A designer moving between Deck Studio, the floorplan panel and the
  elevation sidebar met a differently-shaped control doing the same job each time.
  Pills won because four of the five already were, and because these ARE segmented
  controls: three equal choices filling a narrow panel.
  **`.nav-tab` IS DELIBERATELY NOT THIS, and a test pins the difference.** It switches
  VIEWS rather than panes within one, it is the only strip that persists across the whole
  app, and its underline is what makes those two levels legible as different things. One
  tab look for both jobs would be the opposite of cohesive.
  **STATE IS A CLASS (`.active`), NEVER A WRITTEN STYLE STRING** — and that removed a
  documented trap rather than working around it. All four pill strips rewrote their
  buttons' whole `cssText` on every switch, which is exactly why `_dsToolsTab` had to
  call `_dsSyncToolsTabBar()` AFTERWARDS: the rewrite clobbered a `display:none` that
  function had set. Toggling a class touches nothing else. The call remains, but now only
  because the Templates button's availability depends on the selected page.
  `.elev-tab-on` is gone: one strip expressing selection differently from the other four
  AND from `.nav-tab` was the same "two names for one idea" problem in miniature.
  `_tplTabCss` is now `_tplTabClass`, returning class names. Two of its three call sites
  were never tab bars — the presentation-preset list and the preview-quality segments —
  but they are the same thing to a user: one of these is chosen.
  **`test_tab_component.js` CONTAINS NO REGEX, on purpose.** A pattern written into a
  test file here lost its backslashes in transit three separate times in one sitting, and
  `.frame-tabs.fit > .frame-tab {` contains `.frame-tab {`, so an unanchored search reads
  the wrong rule even when the escapes survive. `indexOf` with a leading newline cannot
  do either.

- **THE DECK PREVIEW IS A PICTURE OF PAPER, NOT A PIECE OF THE UI — DO NOT TOKENISE IT.**
  A design audit of this file recommended migrating "the ~400 hardcoded colours in
  app.js" onto theme tokens. That recommendation was WRONG and following it would have
  broken the thing this project cares most about. Of ~900 raw hex values in app.js:
  **259 are serialized template/project DATA** (`IDML_MASTER_TEMPLATES`, `_starterDeck()`)
  describing text and blocks on a printed page; **40 are canvas/PDF calls** where a
  `var()` parses to nothing; and most of the apparent "chrome" is `_deckMockHTML` and
  `_mbThumbInner`, which draw a preview of the printed SHEET. `_deckMockHTML` contains
  zero `var(--)` and that is correct: theming it makes a white page go dark in dark mode
  and, far worse, makes Deck Studio show a grey the PDF will not print.
  The genuinely themeable chrome was the blues and the amber, and that is already done.
  `test_preview_is_paper.js` pins all of it, including the DATA, so the next audit
  cannot make the same recommendation twice.
  **`SHAPE_DEFAULT_FILL` is the one definition of the placeholder grey**, which was
  written out NINE times: the starter deck, the shape creator, the duplicate path, two
  colour-picker defaults, the DOM preview, the rail thumbnail and the PDF renderer. The
  last three are the dangerous ones — the preview and the export resolved the fallback
  independently, so a drift in either shows a grey the client's PDF does not print. It
  is deliberately a LITERAL: the PDF path hands it straight to `_annHexToRgb`.
  The 73 `"fill":"#d8d8de"` entries inside the serialized templates are NOT this
  constant and must stay literal — they describe specific existing blocks on specific
  pages, so rewriting them would edit saved documents.
  Also measured while here, and worth knowing before anyone builds a `_btn()` factory:
  there is **no dominant repeated button shape** in app.js. Of 825 `cssText` assignments
  the most-repeated normalised string appears FOUR times; the rest are one-off positional
  styles. A generic button factory would consolidate almost nothing. The look that DID
  repeat was the tab strip, and that is now `.frame-tab`.

- **ONE RETURN POINT, THREE TRIPS (`_viewReturn`).** Editing a wall happens in the
  Elevations tab and editing a spec happens in the Frame Dashboard, and BOTH round trips
  were missing their second half. The deck one existed as `_elevReturnTo`, but that name
  was also its limit: it could only mean "came from the deck", so **Edit Master**
  (elevation to dashboard) was one-way and dashboard to elevation did not exist at all.
  ONE slot, because you can only be on one trip at a time. Two slots means two back
  buttons that can disagree about where "back" is.
  `view` is where the button TAKES you; **`at` is the view the trip LANDED in**, and the
  bar is painted only there. Without `at`, navigating by hand to a third view showed a
  back button offering to return you somewhere you had never come from.
  `_endTripIfWanderedTo(view)` in `switchView` ends a trip the moment you arrive anywhere
  that is not `at`. That replaced a bare `_elevReturnTo = null` in the deck branch, which
  was sufficient only while the deck was the one place a trip could start.
  Anchored on the page KEY or the row ID, never an index - the deck rebuilds constantly
  and the dashboard re-sorts. `_syncDashWallJump` hangs off `checkGlobalEditingWarning`,
  which already runs on every row selection and already walks the elevations, so "where
  else does this piece exist" is answered once.
  **A BLANKET RENAME ATE TWO THINGS AND THE FILE STILL PARSED.** Renaming `_elevReturnTo`
  to `_viewReturn` also rewrote `_elevReturnToDeck`, which merely SHARES its prefix; and
  renaming the call `_elevSyncReturnBtn()` rewrote that alias's own DECLARATION into
  `function _syncReturnBars() { _syncReturnBars(); }`. Function declarations hoist and
  the LAST one wins, so the real renderer was shadowed by a stub that recursed until the
  stack went. `node --check` passed. The existing tests caught it, and
  `test_return_trips.js` now has a check for one-line functions that call themselves.
  Rename by whole identifier, or not at all.

- **JUMP TO IS CTRL+K / CMD+K (`openJump`, `_jumpEntries`, `_jumpFilter`, `_jumpGo`,
  18.04).** Codes, walls, deck pages and the three views in one list, rebuilt on every
  open so a code renamed a second ago is found by its new name. A piece is ONE row with
  up to three chips (Piece / Wall / Page), never three rows, and Enter takes the chip
  for the view you are in (`_jumpDefault`). Navigation is by row ID, `elev.id` and page
  KEY, never an index. Punctuation is ignored on both sides (`_jumpCompact`), so
  "art1a" finds ART.1A. On the `.frame-modal` shell, so Escape and the backdrop close
  it like everything else. A page's search text must carry its NUMBER, or typing "12"
  finds the twelfth view tab instead.
  Three ranking rules came from LOOKING at it in Chrome (18.09), not from the tests:
  title matches evict subtitle-only matches ("art 1" listed EGD.1 because its subtitle
  says Framed Art), a spec page is listed on its own only for its typed number (it is
  the piece row's Page chip otherwise), and each group stays contiguous. jsdom cannot
  show any of that; a headless Chrome over CDP (Node's built-in WebSocket) can.
- **`_toast` IS FOR WHAT IS NOT A DECISION; THE MODAL KEEPS EVERYTHING ELSE.** There were
  EIGHTY `showInfoModal()` calls and no other way for this app to say anything, so
  "Nothing selected" took over the screen and demanded a click to dismiss information you
  already half-knew.
  The dividing line is whether the notice is **safe to MISS**. A toast gets
  acknowledgements ("Library synced") and nudges explaining why nothing happened ("Select
  a text box first"). A modal keeps anything you must READ to act on (*Studio defaults
  exported* carries instructions), any change you did not ask for (*Units auto-corrected*
  rewrote the project's units), and every failure. A notice you can miss is the wrong
  shape for information you cannot afford to miss - a test pins those three by name.
  18 call sites moved; 63 correctly stayed. 18.12 moved nineteen more (every "Nothing to ..." / "No ..." nudge, "Too small",
  "Favourites full", "Custom layout", "Saved", "Import Complete"); "Restored", "Detached as" and
  "No wall elevations yet" stay modals because each carries something to act on.
  **`--z-toast` sits ABOVE `--z-modal-alert`**, which looks wrong and is not: a toast is
  routinely raised from inside a modal, and one rendering behind the dialog that
  triggered it is worse than not showing it at all.
  The host is `pointer-events: none` and each toast turns them back on for itself, so a
  stack of notices never blocks the page underneath while staying dismissable.
  Notices **stack rather than queue**: two things happening at once should both say so,
  and a queue that shows one and drops the other is how a user learns the second thing
  never happened. `_toast` returns null and does nothing when there is no `document.body`
  (a test harness, a headless render) rather than throwing out of whatever raised it.

## Design principles used here
- Prefer dynamic behaviour over manual controls: if a layout element won't fit, drop
  it automatically rather than exposing a control that can produce broken output.
- Gear popups are the home for settings; don't duplicate them in the toolbar row.
- A control that can't update live should be removed, not left non-functional.

## Known open items
- ~~The elevation is sometimes missing from the generated PDF.~~ **Fixed (16.16).**
  `_drawInstallGuidePage` tested `!cap && _igNoCapture` for its placeholder, so a
  capture that was *allowed* but **failed** matched neither that branch nor the draw
  branch — the page fell through both, exported with no drawing, and counted as
  complete. Now any `!cap` draws a labelled placeholder and flags the render
  incomplete, plus one retry after a settle, since `_captureElevWithGuides` bails to
  null on transient conditions (`lineToolActive`, an SVG export that didn't settle).
- ~~Elevation dimension text reads softer than spec-page text.~~ **Fixed (16.21)**
  by drawing it as real vector PDF text — see the vector-annotation anchor above.
- **SUPERSEDED, deliberately not built (18.08 review):** the two items below predate
  the bottom-right elevation anchor, left-side notes stacked under the legend, the
  `noteW`/`noteFs` sliders, the shared `_igColW` width budget and the 17.96 legend
  layout (`_igLegLineFit` stacks, then shrinks a value). On a widescreen page a right
  column now moves the drawing without shrinking it, and auto-shrinking the note type
  would fight a width the designer set by hand. Reopen only with a concrete page that
  still prints badly.
- **The install-notes column nudges the elevation left instead of shrinking itself.**
  Asked for: keep the drawing at its current size and centred, shrink the note type
  to fit whatever width is spare. The blocker is ordering — `_installNoteColW` is
  measured at the top of `_drawInstallGuidePage`, before the capture exists, so it
  can't yet know the elevation's aspect and therefore the slack. Fix means moving the
  notes draw to *after* the capture, which means covering the renderer's three early
  returns (no capture / no active artwork / schematic fallback). That's the
  `_drawSpecSetPage` footer trap, so it wants a check that enforces every exit draws
  them, not a quick patch.
- ~~A toggle for the notes column: right side vs a row above.~~ **Superseded
  (16.13)** by per-page width + text-size sliders (`noteW`/`noteFs` in `_igCfg`,
  breaker slots `breakerNoteW`/`breakerNoteFs`), which give finer control over the
  same trade-off. A top-row option is still available if wanted, but it costs ~17% of
  drawing height against the column's ~6%, so the sliders are the better lever.
- **Letter legend wants to scale its own type down** so it costs the drawing less
  width (it draws at `M`, width `legendW`, default 150 on breakers). Same restructure.
- ~~A breaker page sometimes won't build its preview.~~ **Fixed (16.13).** Cause was
  cache poisoning, not the guard itself: a render with captures suppressed drew the
  "Hit Build" placeholder and then cached it as the page's finished preview, stamped
  fresh, so it never re-rendered. `_igCaptureDeferred` now marks a render incomplete
  and **every** cache write is gated on `_igRenderWasComplete()`. The centre preview
  (the selected page) is also allowed to capture again, which is what makes a breaker
  build itself; thumbnails stay suppressed so background renders never steal the view.
- ~~Vertical spacing / custom dims are still upright.~~ **Done (18.07).** They pass
  `rotateLabel: 'auto'` and `_dimRotateFits` rotates the number when its length fits the
  gap, else leaves it upright so `_autoLiftDimLabel` can lift it beside the line (a
  rotated label has no escape hatch). The probe is a throwaway upright label in the same
  container, so the measured text is the drawn text. The export needed nothing: `emitEl`
  reads rotation off the computed transform.
- ~~Rich text wraps ~1% differently in Deck Studio and the PDF.~~ **Fixed (18.08), and
  the cause written here before was WRONG.** It blamed a different size basis (nominal
  540 vs the measured element), but the editor scales box width and font size off the
  same page box, so the ratio is exact to within rounding (~0.2%). Measured in real
  Chrome against the vendored jsPDF with the same Druk TTF: unkerned browser text
  matches jsPDF to 0.1pt, and the default KERNED text runs 0.5-1.1% narrower on
  ordinary headings and **5%** on AV/TA pairs. jsPDF never kerns. So every surface that
  shows a picture of a page is unkerned now: the five `white-space:pre-wrap` text tiles
  (inline `font-kerning:none`), a CSS rule on the deck centre / rail / Project preview /
  layout canvases, and `fontKerning = 'none'` on `CanvasPdfRec`'s measuring AND drawing
  contexts and `_richMeasureCtx`. The PDF itself is unchanged. A new text renderer
  must do the same or it starts promising a tighter set than prints
  (`test_type_unkerned` counts the tiles). To measure again: a headless Chrome
  `--dump-dom` page loading the TTF via @font-face beside `lib-jspdf.min.js`.
- ~~Thumbnail canvas renderer mis-lays-out large display type.~~ **Already fixed**:
  `_dsThumbDrawable` returns false for element pages, so the rail draws them with
  `_dsElementPageThumbHTML` (real HTML) and the Project tab preview uses the HTML mock
  too. Pinned by `test_thumb_drawable_fix`.
- **`app.js` is ~2.4 MB and GitHub won't display it.** ~634 KB is a single line:
  `IDML_MASTER_TEMPLATES`, of which ~560 KB is base64 photos baked into four
  templates (barn, signature, install photo, hardware diagram). Plan, in order:
  (1) move those photos to `assets/` as real image files, (2) move the template
  constant to its own file, (3) split `app.js` by area into several scripts loaded
  in order — safe here because everything shares one global scope.
