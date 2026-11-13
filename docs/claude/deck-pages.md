# Deck pages and rendering

Part of the FRAME rulebook (see `CLAUDE.md`). Covers the page list, spec / group / install / breaker / contents pages, titles, thumbnails, the rail, PDF and canvas drawing.
Same format as `CLAUDE.md`: the rule, the names, the trap, one clause of why. Add new rules for this area HERE.

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
- **A LONG PANEL SCHEDULE SPLITS INTO TWO COLUMNS** (`FLAT_SCHED_SPLIT_AT` = 9) so it
  doesn't squeeze the elevation; split rather than shrink (dual-unit cells would wrap). The
  continuation keeps the rule and headers, drops the title and the `ALL PRINT FILES` footer,
  and borrows the second spec column ONLY on a single-graphic sheet.
- **INSERTED PAGES AND THE STANDARD PAGES MOVE; GENERATED PAGES DO NOT** (`_dsPageMovable`).
  20.03: `DECK_FLOAT_KEYS` (timeline, understanding, narrative, strategy, frameRec, slogan,
  contacts; never the cover) move by `editorialContent.pagePlace[key]` = the key they follow,
  stored only once moved, resolved in the SAME multi-pass pin loop as layout `afterKey` (either
  can anchor to the other). Moving one re-anchors pages pinned to it onto its old neighbour (they
  stay put), and a pinned neighbour sharing the new anchor onto it. Reset clears `pagePlace`;
  `_dsHandPlacedCount` is the one count. Floorplans, plan details, spec pages and breakers are
  placed by `_deckPageList` / `_deckPlanSlots` from the data; don't add per-page overrides for
  them (manual plan order covers it).
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
- **THE SELECTED RAIL CELL IS A CLONE OF THE CENTRE (`_dsSyncActiveThumbnailMirror`), AND
  `cloneNode` DROPS CANVAS PIXELS.** `_dsCopyCanvasPixels` copies them, or canvas-drawn pages
  go blank in the rail while selected.
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
- **THE FOOTER'S CODE AND LOCATION ARE DECK-WIDE (`_deckFooterMeta`)**: the Project tab's
  document code / version / location, used by the PDF and both preview renderers, never the
  piece's own id/location.
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
- Breaker pages read the legend from their **own** `installGuide.breakerLegend*` slots
  (`_igSet(..., forBreaker)`) so Install-guide globals can't bleed onto breakers.
- **PDF text wrapping must measure with jsPDF, never a canvas.** `_drawRichTextPdf` passes
  `_richPdfMeasure(doc)` into `_layoutRichLines`; both measure and draw take font state from
  `_richPdfFont()`. `_richMeasureTrusted` is canvas-only. Letter spacing is added outside
  the measurer (`getTextWidth` excludes charSpace). Add `halfLead` per line to match CSS
  half-leading (jsPDF `baseline:'top'` has none); position offset only, `cy` advances by
  plain leading.
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
- **Every surface that pictures a page sets text UNKERNED** (`font-kerning:none` on the
  `white-space:pre-wrap` tiles and the deck centre / rail / Project preview / layout
  canvases, `fontKerning = 'none'` on `CanvasPdfRec`'s and `_richMeasureCtx`'s contexts),
  because jsPDF never kerns and kerned browser text runs 0.5 to 5% narrower. A new text
  renderer must do the same (`test_type_unkerned`).
- **A preview is cached only if its render was complete** (`_igRenderWasComplete()` gates
  every cache write; `_igCaptureDeferred` marks a suppressed capture incomplete), or a
  "Hit Build" placeholder gets cached as the finished page and never re-renders.
- **THE DECK STUDIO DOCK HOLDS THE PAGE TOOLS AND SELECTION ACTIONS (18.38).** Guides,
  Layers (hidden), Preview, Preflight, then `#dsSelGroup` (`.ds-dock-group`: settings,
  front, back, delete). Front/back/delete go through `_dsSelToFront` / `_dsSelToBack` /
  `_dsSelDelete`, which pick a layout-page box (`_dsMbHasSel`) or a page note.
- **PREVIEWS REBUILD BY THEMSELVES (18.39).** `_dsBuildAllThumbs` primes elevation
  captures by default, SILENTLY (`onStep: _dsPrimeProgress` feeds `#dsThumbProgress`, which
  has a Stop link); `opts.prime === false` skips it. `_dsRefresh` calls
  `_dsScheduleAutoBuild` (1.5 s debounce, deck open only). There is no Build all button;
  `_dsRebuildEverything` (the small icon by the page filter) forces a full rebuild.
- **The Deck Studio dock (18.40):** Text box and Paragraph are in the Text menu
  (`dsDockNotes`), Upload image in Shapes; no standalone T or image button. Selection
  settings is a gear, never the theme sun.
- **THE PROJECT TAB READS SETTINGS BACK, IT DOES NOT HOLD THEM (19.06).** Units, rounding and
  Frame effects are changed in Settings; `#projUnitsHost` is a one-line readback
  (`_projUnitsSummaryInto`, refreshed by `_syncUnitChip` and `setUnitPrecision`) beside Units... and
  `#projFrameFxBtn`. Name, code, location, version are one `.proj-fields` block.
  **Its page preview draws an element page with `_dsElementPageThumbHTML(desc, w, h, undefined,
  true)`** (the rail's builder: theme background, dark ink, notes, footer; `noBadge`), never the
  bare `_deckMockHTML`, which ignores the page theme.
- **THE LETTER LEGEND DEFAULTS TO 200pt (`IG_LEGEND_W_DEFAULT`)**, install and breaker pages.
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
- **NOTES FOR ONE PAGE LIVE ON THE WALL (19.47):** `elev.notesOff` ('std:key' / 'c:id') and
  `elev.wallNote`, read by `_installNoteLines(elev)`; panel `_dsPageNotesInto` (from
  `_dsInstallNotesInto`, wall = `elevations[desc._elevIdx]`). Both are EXCLUDED from
  `_elevCaptureSignature` (text beside the drawing must not recapture every wall).
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
- **FULL-BLEED CLOSE-UPS (19.85).** `perPage[ovKey].closeups = [{x, y, z}]` (one writer `setIgCloseups`, cleaned by
  `_igCloseN`; x/y = drawing point at the page centre as 0..1 of the `_capView` drawing, z over "drawing height fills
  the page"), one page each after the details: descs `_igClose/_igCloses`, keys `spec:elev:<i>~c<n>`, drawn by
  `_drawInstallCloseupPage` (dispatched first; marks `_pdfFooterDrawn` so the sweep adds no footer; same capture zoom as
  details). The page records `_igCloseGeo[pageKey]`; `_dsCloseupWire` (both spec branches of `_dsRenderCenter`) previews a
  drag/wheel as a CSS transform on the picture (`.ds-closeup-pic` / the built `<img>`) and commits through the pure
  `_igCloseAfter` (translate is NOT scaled: divide it by m). Panel `_igCloseupPanelInto` returns before the wall controls.
  The floor plan key drops the set's own code from its letters (`_fpKeyEntries`), so ART.3 + ART.3A..I prints A–I.
- **A SPEC PAGE'S STAMPS ARE `_approvalStamps(desc)` (20.08)**, for the PDF post-pass (`_drawApprovalStamps`, right to
  left from the margin; `_drawApprovalStamp` is a wrapper) and the screen (`_dsAddStamp`). A set page marked pending
  with some members' `_pieceStatus` approved/production prints APPROVED <letters> + PENDING <letters> (letters from
  `_letterFrom`); no page status = no stamp, whatever the dashboard says.
- **NOTES AND TITLE / ARTIST ARE NEVER SPEC LINES (20.27).** `buildSpecStrings` emits no Notes row (a long note broke
  the block; title/artist are often unknown). The spec page's right panel, TEXT BOXES (`_dsPieceTextInto`, both the
  Per-piece and Group A/B/C branches), drops them as ordinary `note` annotations (`_dsAddPieceText`): words COPIED,
  not linked; blank = placeholder wording `PAGE_PLACEHOLDER_RE` flags. Both spec drawers record where their rows end
  (`_noteSpecEnd` → `_specBlockEnd[firstId]`, page fractions) so new boxes stack under the block. The `Notes` slot in
  `SPEC_ROW_GROUPS` stays: `_SPEC_ROW_UNKNOWN_GROUP` is an index into it.
- **INSTALL PAGES FOLLOW THEIR PLAN (20.15).** In Install-guide mode with `_deckPlanOrder() === 'byLevel'`, each plan is
  followed by the walls whose first active frame's row is pinned on that level (`_deckLvlOf(r.level)`); unpinned walls
  and the other orders keep "all plans, then all walls".
- **A JUSTIFIED PARAGRAPH'S LAST LINE IS NOT STRETCHED (20.01).** `_layoutRichLines` marks `paraEnd` on each
  hard line's last line; `_drawRichTextPdf` skips it unless `justify-all`, as the editor's CSS does.
- **AN IMAGE-CODE CAPTION IS ONE LINE (20.01, `_drawAnnCaption`, `_capCodeFitPx`, `CAP_CODE_MIN_PT`).** jsPDF's
  `splitTextToSize` cut a code with no spaces mid-code while `CanvasPdfRec` (which never breaks a word) showed it whole;
  a `capSource: 'filename'` caption steps down to fit the box (floor 6pt) in the PDF and on screen.
- **SEVERAL PICTURES, ONE POPUP (20.02, `_dsGearGroup`, `_dsGearGroupApply`, `DS_GEAR_LOOK`).** Opened on a box in a
  multi-selection (`_mbSelAnn`, this page, shapes/images, not locked), the picture popup copies every CHANGED look field
  onto the others in its `refresh`; a control that pushed its own undo step has it retaken (one Ctrl+Z). The dock's
  settings button opens it on a multi-selection. Caption size is `a.capPt` (points, default `CAP_PT_DEFAULT` 9, stored
  only when different), read by `_drawAnnCaption` and the screen caption. BOTH pan-mode (cropped picture) mousedown
  handlers run `_dsAnnShiftToggle` / `_dsAnnGroupDragStart` first, or a moodboard can never be multi-selected.
  API image fills set `radius` 0 unless asked (straight-edged house moodboards). The driver waits for the start screen
  before closing it (it opens after the API is ready and swallows clicks).
