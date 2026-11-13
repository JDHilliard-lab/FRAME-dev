# Catalogues

Part of the FRAME rulebook (see `CLAUDE.md`). Covers catalogue mockups, arrangements, options, frame sets and their pages.
Same format as `CLAUDE.md`: the rule, the names, the trap, one clause of why. Add new rules for this area HERE.

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
