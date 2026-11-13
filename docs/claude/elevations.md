# Elevations

Part of the FRAME rulebook (see `CLAUDE.md`). Covers walls, glazing, flat graphics, context blocks, dimensions, guides, marks, shadows, wireframe, wall captures.
Same format as `CLAUDE.md`: the rule, the names, the trap, one clause of why. Add new rules for this area HERE.

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
- `annotationStyle.font` and `imageCodeStyle.fontToken` hold tokens;
  `annotationStyle.fontFamily` and `imageCodeStyle.font` are **derived** stacks kept by
  `_normalizeAnnotationStyle()` / `_normalizeImageCodeStyle()`. Never set them by hand.
  Defaults: dims = Messina; captions and image codes = Messina 9pt `#9c9c9c`
  (`_specCodeStyle()`).
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
- **EGD wall mode** (`elev.egdWall`, `_isEgdWall`, `toggleEgdWall`) is **per elevation**,
  unlike the rest of that guides row. Flat graphics it governs are filled to the wall and
  pinned above the baseboard by `_clampFlatToWall`, called on drag AND redraw, AFTER the
  snap (wall edges are snap targets).
  **Flat graphics render behind framed art unconditionally**: `drawElevAll` sorts them to
  the front of `_drawOrder` while preserving original indices, because
  `makeElevDraggable` and every dim lookup address frames by index in `elevFrames`.
- **WALL CONTEXT: the underlay never exports, the blocks always do** (unless `underlay.inDeck`, 20.31: the
  client's drawing IS the page, so `_underlayDeckSvg` puts it FIRST in `exportElevSVG`'s back layer, clipped to the
  wall rect, full strength; `exportElevPNG` keeps the layer with `overflow:hidden` and opacity 1 instead of hiding
  it. The artboard-bounds list still never includes `#underlay-layer`. Toggle: `setUnderlayInDeck`; test
  `tests/test_underlay_in_deck.js`). FOURTH PLACE (20.36): `renderElevationToCanvas`, the spec-page thumbnail, draws
  it too (over the 20.32 paint, clipped to the wall) through `_underlayImage` (decode cache, resolves null on
  error or after 4 s so a bad image cannot hang a build). Leave any of the four out and that page shows a bare wall.
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
- **MOVING ARTWORK BETWEEN FRAMES (`moveElevArtwork`, `ELEV_ART_FIELDS`, `_elevArtPayload` /
  `_elevApplyArt`).** Dragging a row in the frame LIST (never on the wall, where drag
  means move the frame) reassigns artwork as a list reorder; frames do not move, and the
  dashboard ROW travels with the picture. A drag begun on an input or button belongs to
  that control. Always use `ELEV_ART_FIELDS`, or a picture half-moves (crop or image code
  left behind).
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
- **THE WALL TAB (20.41, `data-elevtabpane="wall"`).** Wall type, client elevation
  (`#sec-underlay`), Elevation required, wall finish and paint live there; only W/H, zoom and
  export stay in `#elev-sec-wall` above the tabs. Underlay paths open `'wall'`, not `'context'`.
  Tab order art, wall, guides, context, glass (pinned by three tests).
- **PAGE OPTIONS ARE PER WALL WITH AN "ALL WALLS" (20.41).** Wall finish: deck default
  `editorialContent.wallFinishPrint === false` plus per-wall `elev.wallFinishPrint` (boolean,
  absent = follow deck); `_wallFinishPrints(elev)` resolves it, `_setWallFinishPrints` (all)
  sets the default AND deletes every wall's own value, `_setWallFinishPrintsWall` stores
  nothing when it matches the default. `_wallAllMenu(anchor, 'finish'|'required'|'indeck')`
  is the All walls menu; Required-all marks only walls with no client elevation. New page
  options should follow this shape. Adding a first client elevation to a wall marked
  Elevation required offers to untick it (`_ulOfferClearRequired`).
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
- **THE ELEVATION'S GROUND IS NOT A THEME COLOUR (`--elev-ground`).** The drawing is print
  colours in both themes (dimension ink from `annotationStyle`), so `.workspace`
  (`#scrollArea`) must not read `--bg-main` or dark mode hides the outer wall dims.
  Declared once in `:root`, **NOT overridden in `.light-theme`**. It is a shade **darker**
  than `#wall` (#f0f2f5), never lighter or equal (tested both ways). The floating buttons on
  it keep the app theme. Exports are unaffected (`#export-wrap` is transparent,
  `html2canvas` uses `backgroundColor: null`). `_elevWrapPadding()` measures `.workspace`,
  so keep changes there to paint.
- **Vertical spacing and custom dims pass `rotateLabel: 'auto'`**: `_dimRotateFits`
  rotates the number when it fits the gap, else leaves it upright so `_autoLiftDimLabel`
  can lift it.
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
- **AN EXPORT IS NEVER LAID OUT SMALLER THAN A DESKTOP (19.22, `_elevExportFloor`,
  `ELEV_EXPORT_MIN_WS_W/H` = 1494x1034, the workspace an export gets at 1920x1080).** Dim
  numbers and ticks are fixed print sizes, so a smaller drawn wall printed them bigger beside
  it (an iPad deck ~2x). Both exports raise the counter beside the sidebar unfold and lower it
  in the same `finally`; `drawElevAll` floors the measured workspace while it is > 0. A bigger
  screen is untouched (the designer's choice). On SCREEN the iPad still draws ticks relatively
  bigger (screen matches print by design); folding the panels brings it close to desktop.
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
- **LINE KINDS (19.48, `MARK_KINDS`, `markKind`, `openMarkKinds` flyout `#markKindList`).** `m.kind`:
  `line` (absent = line), `cl` (one x-anchor, full height, label CL at the top inside the wall),
  `clmid` (two x-anchors, CL at the midpoint), `level` (one y-anchor, full width). The non-line
  kinds store ONLY anchors; `_markEnds(m)` derives the ends from the wall every draw. One-axis
  snapping is `_markAxisAt` / `_markAxisTargets` (centres and edges of frames, blocks, wall;
  `MARK_SNAP_PX`, a centre wins a near tie). L arms the last kind; picking a kind always arms.
- **AN EXPORT-SKIPPED ELEMENT TAKES ITS SUBTREE WITH IT (19.48).** `exportElevSVG`'s `walk` skips
  `data-export-skip` children BEFORE `emitEl` and does not descend; emitEl alone skipped only
  the element, so a selected line's settings strip and the clash tag printed.
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
- **DETAIL PAGES AND OUTLINES (19.83).** `cfg.detail` (install-guide `elev:` pages, `_igSet` simple list) adds
  descs `_igDetail/_igDetails` after the wall page, keys `spec:elev:<i>~d<n>`, drawn by `_drawInstallDetailPage`
  (dispatched FIRST in `_drawInstallGuidePage`: no title, notes or legend; drawing at the safety height, caption +
  footer). Count from `_igDetailPlan` (nominal 960x540, ends G 14in, vertical Gv 4in kept SMALL so a planned
  window really fits), zoom `_igDetailZoom` = 1/numScale only: the numbers ZOOM WITH the drawing (holding them at overview size left them unreadable), also in `_dsPageCapJob`, windows `_capWindow(.., n)`. OUTLINES:
  `#outline-layer` guide (`outlineToggle`, `renderPieceOutlines` in drawElevAll, every non-graphic piece, solid
  `data-svg-pen` border), registered in `_ELEV_GUIDE_LAYERS`, `_elevGuideVis`, bounds, annotationLayers,
  `IG_PAGE_HIDE`, `_DS_ELEV_GUIDES`. Install Layout is a `<select>` (`#igLayoutSel`, `selRow`).
- **A PAGE FITS EACH DASHED LINE TO ITS LENGTH AND CUTS WITH THE NUMBERS IT SHOWS (19.84).** `_drawElevAnnOps`
  passes every dashed line through `_dashFitLen(pat, printedLen)` (>= `ELEV_DASH_MIN_N` dashes, starts and ends on
  a dash, never longer than the setting, solid under `ELEV_DASH_MIN_PT`). With knockout, a CAPTURE (`forCapture`)
  is not cut at export: it emits `<rect data-knock>` per number inside its layer group, `_elevAnnOps` parses them
  as `knock` ops (tagged `gl`), and `_knockOps` cuts lines at draw time with the knock ops that survived
  `_capView`'s guide filter (`_capWindow` clips them like rects). Downloads still cut at export (`_knockSplitLine`).
- **HEIGHTS NAME THEIR DATUM (20.28, `elev.datum = {name, hIn}`, `_elevDatum`, `_elevHangLabel`, `setElevDatum`).**
  A client height from a chair rail labelled AFF hangs art ~3 ft low. With a datum the hang dim runs from it
  (`bottom:datPx`), its label is `21" ABOVE CHAIR RAIL`, `.datum-guide` draws the datum with its own AFF height, and
  `_installNoteSetOut` says it. Stored in INCHES; blank name, Floor/AFF or no height = the floor. A drawing input
  (in the capture signature); `installSeq` / `typGapIn` (`_installWallSetOutExtras`) are notes, excluded from it.
- **GLASS IS DRAWING INK, NOT DIMENSION INK (20.26, `_elevGlassInk()`).** The run outline and mullions are black; panel
  dims and letter tags stay `--dim-color`. A function, not a const (drawn from boot paths). A guide layer that starts
  hidden needs a line in style.css's `#label-layer, ... { display: none; }` rule, since `toggleElevLayer` and
  `_elevGuideVis` read an unset inline display as OFF (`#outline-layer` showed while its button said off).
- **ELEVATION REQUIRED IS COMPUTED, NEVER STORED (20.33, `elev.elevRequired`, `elev.elevRequiredNote`, `_elevReqWallForKey`,
  `_elevReqStamps`).** The flag lives on the wall; the stamp is two virtual note annotations made per page key and
  drawn by `_drawAnnotations` (PDF) and `_dsRenderAnnots` (read-only, `data-elev-req`). Never push them into
  `editorialContent.annotations`, or unticking leaves stamps behind. Keys: `spec:elev:<i>`, `spec:elevgrp:<set>`, `ig:<name>`
  are wall pages (stamp left column at y 0.545, above the plan thumbnail: the drawing runs to the top, and 20.33's spot under
  the WALL: line sat on an install page's size legend, 20.34); `spec:<set>` is a spec page (top
  right). A page that already carries a hand-made ELEVATION REQUIRED note gets no second one. `renderDeckPageCanvas`
  (driver `render`) draws NO annotations at all; check stamps in an exported PDF.
- **WALL COLOUR IS ONE READER (20.32, `elev.wallColor` '#rrggbb', `_wallColor`, `_wallColorPaint`, `setElevWallColor`).**
  Optional, deleted when cleared. Every wall painter goes through `_wallColor`: `drawElevAll` calls
  `_wallColorPaint`, `exportElevSVG` pushes a `data-wall-color` rect FIRST in `backLayer` (under the 20.31 underlay),
  and `renderElevationToCanvas` fills the wall before its outline. In `CAT_WALL_FIELDS`.
  20.35: the control is the app's picker (`_frameSwatchesInto` dots from `WALL_PAINT_FAMILIES` + the colour-wheel
  input, `#wallColorNone` slash dot first); a plain picker on its own row went unnoticed. Paint STOPS AT THE BASEBOARD
  (`_wallPaintBaseFrac`): the editor paints a `#wall-paint` layer (first child of #wall) instead of #wall's background,
  so the PNG export no longer touches it; the SVG rect and the thumbnail fill are shortened by the same fraction.
- **WALL FINISH IS NOT WALL MODE (20.25, `elev.wallFinish` / `elev.wallFinishNote`, `_wallFinishText`).** Mode (ART/EGD/WF)
  is what goes ON the wall; finish is the wall itself. Both keys optional and deleted when blank. The install renderer
  prints `_wallFinishText` in the code-line slot of an elevation page (`_igLine3`); both keys are in `CAT_WALL_FIELDS`.
- **THE CONTEXT LIBRARY IS GENERATED BY `tools/ctx-art.js` (20.22).** Drawings, sizes and the palette groups
  live there; `node tools/ctx-art.js --write` rewrites the block between the `// <ctx-library` markers in app.js,
  `--sheet out.html` draws a contact sheet. Never edit that block by hand (`test_ctx_art_generated` fails).
  Style (20.23) is the designer's product-elevation reference: ONE thin even stroke (`CTX_LW_*` equal, 0.8),
  near-square corners (every radius x `RK` 0.55 in `R`), frame members as double lines; shared parts `door()`,
  `toilet()`, `vanity()`, `faucet()`, `pillow()`, `bedding()` carry it, so restyle those first. Draw back to front; `R/P/C(..., true)` =
  opaque (`data-o`), `open()` = a stroke that must stay a line (the body would fill its chord), `HID()` = dashed.
  Groups: Guestroom, Bathroom, Toilets, Office, Glass, Doors, Chairs, Decor, Keep clear, Basic (no `&` in a
  group name: it rides in an inline onclick). Existing keys, sizes and side sizes never change (saved walls);
  the five `BED_STYLE_VARIANTS` keep their keys and 100-wide aspects. Reference sites (First In Architecture
  etc.) forbid redistributing their DWGs: proportions only, never traced in.
- **THE HOSPITALITY SET IS THE DESIGNER'S DRAWINGS (20.24, `tools/ctx-hospitality/*.svg`, `HC_MAP`, `hcFit`).**
  mm, floor at the bottom, `fill="#fff"` = solid (becomes `data-o`), `fill="none"` = glass (becomes the hatch region).
  `HC_MAP` either REPLACES a key (drawing fitted UNIFORMLY into that key's own size, on its floor; refused past
  `HC_TOL` 8% off its proportions) or mints `hc-<id>` at the true size and marks what it supersedes `hidden`
  (kept for saved walls, out of the palette and the sheet). Coordinates are rewritten numerically, never a
  transform (it would scale the one stroke weight). New drawings: drop the file in and add a `HC_MAP` line.
  **See all blocks** (`openContextSheet`, `CTX_SHEET_PX_IN`) is the contact sheet popup: every shown item at one
  scale, built from `CONTEXT_LIBRARY` + `_ctxArtSvg`; a tile arms that block.
- **A CONTEXT BLOCK'S WHITE IS ITS DRAWING, NOT ITS BOX (20.20, `_ctxBodyOn`, `_ctxBodyGroup`, `_ctxBodySvg`,
  `_ctxBodySpansAt`).** Every closed shape in the art is filled white (stroke off, dashes stripped) UNDER the
  lines: `.ctx-body` first in the block on screen (box `background:transparent`), `_ctxBodySvg` in the export in
  place of the box rect, and the canvas thumbnail inlines `_ctxBodyGroup` instead of `fillRect`. Keep clear
  (`_ctxAvoid`) and art-less blocks keep the box. The export's baseboard gap is read off a rasterised body at the
  baseboard height (null without a canvas, then the box). An OPEN CURVE fills across its chord, so a stroke that
  must stay a line carries `fill="none"` in the art (faucets, the toilet side lid, the chair side back).
