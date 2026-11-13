# Item codes, placements and floor plans

Part of the FRAME rulebook (see `CLAUDE.md`). Covers item codes, renumbering, code patterns, placements, plan pins, wall lines, plan and page order, the floorplan panel.
Same format as `CLAUDE.md`: the rule, the names, the trap, one clause of why. Add new rules for this area HERE.

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
- **A MOVED PLACEMENT'S PIN IS TEMPORARY UNTIL PLACED (20.50, `_fpPinsAll`, `_fpTempPin(On)`, `_fpLandingSpot`,
  `_fpFlagCheck`, `_fpConfirmPin`, `_pinMovePreflight`).** A pin may carry `temp` (moved to that level, no spot yet) or
  `check` (real pin, sector changed). `_fpPins` NEVER returns a temp pin, so it is unplaced to every counter and never
  printed (every page draws from `_fpGroups`); only the editor draws it (amber `?`, `data-fp-temp`). `_fpSyncPrimary`
  takes the LEVEL from the first pin of `_fpPinsAll`, temp or not: taking it from the first real pin is what snapped a
  moved piece back to its old level. `_fpSetPin` writes a plain pin (clears both flags) and replaces a temp pin on
  another plan. `_movePlacementToLevel` reads pins BEFORE changing `r.level` (a legacy pin derives from it). Test
  `tests/test_pin_move.js`.
- **PAGE ORDER IS CODE ORDER, SET BY TRADING NUMBERS (20.51, `openPageOrder`, `_codesSetOrder`, `_codesMoveBesideAny`,
  `_codesFamKey`, `_pageOrderList`).** Three gestures, one engine: the Page order window, a drag on a floor plan page's
  LEGEND line (`_dsFpLegendDrag`, on the `.ds-fp-listlink` overlay; a click still opens the spec page) and an Items row
  drag (now pattern codes too). `_codesSetOrder(keys)` hands out the numbers those placements ALREADY hold, per family
  (`'h:'` house prefix via `_renumberPrefix`, `'p:'` pattern stem via `_codePatternFamily`), so nothing else moves.
- **PATTERN CODES KEEP THEIR GAPS AND THE GESTURE ASKS (20.51, `_codesPatternGaps`, `_codesGapCheck`, `_codesGapAsk`,
  `_codesCloseGaps`, `_renumberPatternStems`).** `_codesSettle` closes HOUSE gaps only; a pattern gap may be a code the
  client has. A gesture that makes a NEW gap (checked against `_codesGapBase`, from `_artAfterChange`, `deleteDashRow`,
  `_codesZoneEdited`, the pin-move paths) asks Keep / Close; Close folds into that gesture's undo entry. Open, undo and
  redo reset the baseline (never ask about old gaps); no baseline yet = no question.
- **AN OLDER PROJECT NAMES ITS PATTERN AT OPEN ONLY (20.51, `_codesInferPattern`, `_levelZonesInfer`).** Called in the
  project-open path before the settle, never from `_codesSettle` (tests build pattern-shaped codes without one). Adopts
  a level/sector preset only when `codePattern` is UNDEFINED and every placement parses; plans take a sector from
  "Sector 23" in their name (or 3 in 4 of their placements). A code whose sector is not its plan's is a Preflight warn
  with the generic `it.fix` button (`_codesFixSector`, resolved by ROW: a fix renumbers nothing but its own code).
- **A STUCK PLACEMENT IS FIXED WHERE IT IS SEEN (20.52, `_codesFixSectorAll`).** A plan whose placements are coded for
  another sector shows `.fp-recode-banner` (`data-fp-recode`) atop its Items tab with Recode / Recode all (one undo entry,
  gaps asked once). Move to level on the plan it already sits on recodes it (it did nothing: the trap designers hit).
- **PLANS PRINT IN LEVEL, THEN SECTOR ORDER (20.51, `_planLevelsSorted`, `_planLevelOrder`).** `_deckEmitLevels` sorts
  naturally by `_levelCode`, then `_levelZone` (both plans must have one), add order breaking ties, ONLY when every plan
  has a level number; Guest A / Guest B and two unsectored plans on one level keep their add order (deliberate there;
  `test_row_level` and `test_install_by_level` pin it). Never sort by name. Manual plan order reorders that. Every on-screen list of plans (markup
  level bar, Page order tabs, Move to level menu, plans button, Items plan strip) reads `_planLevelOrder()`.
- **A PIN ON ANOTHER SECTOR'S PLAN ASKS (20.51, `_fpPlaceGroup`, `_fpOtherSector`).** Both placement UIs (Deck Studio
  centre `_dsFpPlace`, markup `_fpPlaceFromEvent`) go through it: Move it here (recode via `_movePlacementToLevel`, then a
  plain pin) or Show on both plans (a second pin, code kept). Not asked on a drag of an existing pin on that plan.
- **THE ITEMS TAB IS PER PLAN (20.51, `_fpItemScope`, `_fpPlanStrip`, `_dsGoToPlan`, `openPlansMenu`).** This plan
  (default: rows on that level or pinned on it) / All plans (a `.fp-plan-head` per plan); `_fpFillItemBuckets` is the
  category grouping inside. A plan button strip tops the tab, and `#dsTabBtnPlans` in the Deck Studio header is a menu
  (not a tab state) of the same plans. Test `tests/test_page_order.js`.
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
- **NEW ITEMS FROM PHOTOS (`dashNewFromPhotos`, `_dashItemsFromFiles`).** Finds its new rows by a
  temporary marker stamped through `_fpAddCodes(..., {mark})`, NEVER by the returned code: the
  settle inside the add renumbers (a gap in the numbering made ART.10 into ART.3 before the
  picture loaded). The marker is deleted afterwards. Camera button `#phoneSnapBtn` on the phone
  Items list; Import menu everywhere.
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
- **CODES THAT HANG AS ONE SET ARE SUGGESTED, NEVER REGROUPED (19.44).** `_codesSetSuggestions`
  (same wall, same prefix, every piece hung only there, edge gap <= `CODE_SET_GAP_IN` 12" in
  inches), shown in Preflight (warn, Make set / Keep apart / Wall) and on the wall
  (`#wallSetHint`, `_elevSetHintSync`, top of `initElevControls`). `_codesJoinSet` (no history;
  `_codesJoinSetNow` is the gesture) re-letters in code order via temp ids, then `_codesSettle`.
  Keep apart = `editorialContent.codeSetsApart` (row-id lists), kept current by `applyIdRename`.
  **A wall NAMED FOR EXACTLY ITS CODES follows them** (`_wallNamesFollowCodes`, wraps the
  renumber in `_codesSettle` and the join; `_wallCodeHead` parses `ART.8A / 8B / 9 | Loc`);
  any other name is never touched.
- **PROJECT HANGS CARRY `proj` (19.51).** `asDrawn` presets are grouped into one picker section per
  `p.proj` (absent = 'Ford Engineering Lab', the original set); Ford Salt Lake City is `slc-*`, made
  from its install file (2 and 3 piece hangs too, incl. codes that hang together like 12 / 13 / 14).
  Tests filter the Engineering Lab ones as `asDrawn && !proj`.
- **NO CATEGORY READS AS A "?" (19.51, `.fp-cat-wrap` / `.fp-cat-q`).** The Items row's chip sits in a
  wrapper so a "?" can overlay it (pointer-events none); `FP_ITEM_COLS.cat` is 50 for the CATEGORY head.
  19.52: the chip is a `FP_CAT_CHIP` (22px) square, the height of the line / frames buttons, so the
  three share top and bottom and the row's 5px gap; it need not sit centred under its heading.
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
- **A PROJECT'S CODES CAN FOLLOW THE CLIENT'S PATTERN (20.30, `editorialContent.codePattern`, `_nextPatternCode`,
  `_levelCode`, `row.zone`, `recodeToPattern`, `_codePatternPanelInto`).** Tokens {type} (the category's prefix, editable
  per category), {level} (`floorplanLevels[i].code`, else the number in the level name: Level 03 is L3), {zone} (the
  item's Sector field) and {n}/{nn}/{nnn}. `_nextPlacementCode(prefix, ctx)` tries the pattern first; **a token it
  cannot fill falls back to the house code**, never `L3.ART.S-01`. The number counts on its own stem (per level and
  sector). Pattern codes are not plain codes, so the renumber never touches them. Test: `tests/test_code_pattern.js`.
- **A NUMBER FOLLOWED BY A WORD IS A LEVEL, NOT A PLACEMENT (20.29, `_codeSortParts`, `_nextCodeLike`,
  `_duplicateCodeFor`).** `L3.ART.S16-10A` read as prefix L, number 3, so every Level 3 piece sorted as "L.3" (all A
  pieces, then all B). The house-code number must not be followed by a separator and two letters; such a code
  sorts naturally. A duplicate of a code like it is the next number on its own stem (`L3.ART.S16-11`), padding
  kept; `_codePrefixOfRow` takes the type token inside a client code, never the level. Test:
  `tests/test_structured_codes.js`.
- **A PIECE LETTER FOLLOWS A NUMBER OR A SEPARATOR (20.13, `_artGroupKey`).** One letter is stripped only after a digit
  (`ART.1A`, `ART-1AA` = arrangement A piece A) or a separator (`ART.1.A`, `1B.L3.ART-EF-A`); `1B.L3.ART-EA` is its own
  placement (Ford Hub's existing-inventory codes). Still ONE letter: two-letter runs would break catalogue keys.
- **A CODE FRAME CANNOT PARSE STILL SORTS (20.14, `_codeRowKey` `nat`, `_codeNatCmp`).** After every parsed code, in natural
  order (`1B.L3.ART-02` < `-10` < `-EA`); walls too (`_codesSortWalls` no longer skips them; `empty` walls last).
- **A PIN HOLDS TWO DIGITS (20.18, `_fpShortPinNums`, `g.fullNum`).** `_fpGroups` passes every group through it: an
  all-digit `num` longer than 2 shows its last two while unique and not 00, else the long ones get 01.. in `_codeNatCmp`
  order around the short codes' numbers. Never changes a code; dotted nums untouched.
- **RENAMES ARE LOGGED (20.09, `_codeLogAdd` in `applyIdRename`, `codeLog`/`codeLogSeq`, issue `logSeq`,
  `_codeRenamesSince`).** `_issueDiff` maps every issued code to its current one (renamed pieces first, so a code another
  piece was renamed INTO is no longer the old piece's), returns `renamed`; temp renumber stems collapse in the chain. An
  issue with no `logSeq` (or a log trimmed past it, `CODE_LOG_KEEP`) falls back to same `Artwork` sig + image code.
- **THE BUDGET SKETCH (19.98, `_fpSketchOn`, `_fpSketchDrop`, `_dsFpSketchClick`, `_fpSizeFields`, `_fpBudgetStrip`,
  `FP_SKETCH_SIZES`).** The floor plan add bar has a Size (standard sizes both ways round; never on a flat graphic) and
  Sketch: while on, every plan click mints a piece of the bar's type and size pinned there, ONE undo per click (mint
  `quiet`, found by the `_fpSketchNew` marker, never by the returned code). Stays armed until Esc, Sketch again, or
  arming a code/line; it counts as armed for crosshair, loupe and line deselect. Budget line reads `_dashBudgetInfo`.
  The bar WRAPS to two rows (the tools panel is ~250px; one row squeezed the type picker to 12px).
