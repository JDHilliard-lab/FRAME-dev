# FRAME — project notes for Claude Code

Browser-based presentation builder for art consulting (Farmboy Fine Arts).
Replaces manual InDesign work: wall elevations, artwork spec pages, client PDFs.

## Stack / ground rules
- **Vanilla JS only.** One large `app.js` (~27k lines) + `index.html`. No frameworks,
  no build step, no bundler, no JSX, no Tailwind. Everything shares one global scope.
- Vendored libs: `lib-jspdf.min.js` (UMD), `lib-jszip.min.js`.
- Dev site: `jdhilliard-lab.github.io/FRAME-dev`. `APP_VERSION` + `APP_BUILD='dev'`
  drive the version pill in the header — bump `APP_VERSION` on every change so it's
  obvious in the browser which build is loaded.
- **`index.html` links `style.css?v=<APP_VERSION>` and the two must match** (pinned
  by `test_dash_visible_and_tick_clearance.js`, so a forgotten bump fails the suite).
  Unversioned, a browser serves a cached stylesheet next to a fresh `app.js`: the
  version pill reads new, the exports are new, and anything needing a new CSS rule
  is silently *absent*. That's how the gradient dashes vanished on screen while
  still exporting correctly. Bump both together.
- **No em dashes in written output.** Casual, direct tone.

## Testing — do this every time
```
node tests/run-all.js        # must print ALL GREEN before anything ships
```
112 files, 1268 checks. Add a new `tests/test_<topic>.js` for every fix; each should
reproduce the actual reported bug, not just assert the new code exists. If a test
fails because behaviour intentionally changed, update the test and say so explicitly —
never delete a check to make the suite pass.

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
  layout silently drops the row.
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
  `_dsTplSwatchFonts()` is ONE memoized font wait for the session. The type is baked
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
- **Vertical dimension text is rotated on the outer WALL dims and the scale-figure
  height dim; the spacing/custom ones are still upright.** The blocker is **gone**
  (16.26) — `buildDimControls({rotateLabel: true})` hangs the chevrons off an
  unrotated stand-in box, which is the fix this item asked for. Turning the rest on
  is now just passing the flag from `createElevArchSpacing` and the custom-line
  renderer, plus a look at how the rotated chip crowds a short spacing gap
  (`_autoLiftDimLabel` deliberately no-ops on a rotated label, so a number too tall
  for its gap has no escape hatch yet).
- **Thumbnail canvas renderer mis-lays-out large display type.** It positions text
  using built-in font width tables that lack Druk, so words overlap. The real PDF is
  fine (it embeds the font). Candidate fix: route element pages to the lightweight
  `_mbThumbInner` HTML renderer instead of the canvas path.
- **`app.js` is ~2.4 MB and GitHub won't display it.** ~634 KB is a single line:
  `IDML_MASTER_TEMPLATES`, of which ~560 KB is base64 photos baked into four
  templates (barn, signature, install photo, hardware diagram). Plan, in order:
  (1) move those photos to `assets/` as real image files, (2) move the template
  constant to its own file, (3) split `app.js` by area into several scripts loaded
  in order — safe here because everything shares one global scope.
