# Production, pricing and Preflight

Part of the FRAME rulebook (see `CLAUDE.md`). Covers Production window, prices and rate cards, RFQ/RFI and Salesforce sheets, samples, labels, shipping, brand standards, IFS and Preflight checks, the deck driver and FRAME_API.
Same format as `CLAUDE.md`: the rule, the names, the trap, one clause of why. Add new rules for this area HERE.

- **PREFLIGHT WEARS ITS RESULT (19.44, `_pfBadgeSchedule` / `_pfBadgePaint`, `PF_BADGE_BTNS`).**
  `data-pf` = err / warn / ok + `data-pf-n` count on every Preflight button; spelling never
  colours it. Re-run debounced off `scheduleAutosave`, only while the deck view is showing
  (stale otherwise, caught up by `_dsDockSync`); `_pfBadgeRunning` ignores the autosaves its own
  page-list build triggers. **Preflight must stay READ-ONLY** (it runs in the background now):
  `_dsSpellIgnoreList` no longer seeds `spellIgnore` (the guided tour test caught it).
- **`window.FRAME_API` IS THE DRIVER'S DOOR (19.86)**, for the planned deck-building agent and any headless
  script. Each call WRAPS the UI's own function (`_placementMint`/`_placementHang`, `applyArtworkToRowIndex`, the
  `_dsMasterToDeck` page recipe, `renderDeckPageCanvas`, `exportSpecPagePDF({returnPdf})`, `_projectFileText` /
  `_readProjectText`); never give it rules of its own. Inches in and out, items by code, walls by `elev.id`,
  pages by KEY. A call is ONE undo entry (`_apiFoldHistory`) and fails as `{error}`, never a modal or a hang
  (decode an image before the intake, which answers a bad file with a modal and no callback). `returnPdf` skips
  the save AND the missing-walls question. New pages default to the END of the deck. `test_frame_api` (jsdom);
  canvas, images and the real PDF need headless Chrome.
- **PRODUCTION IS ONE WINDOW WORKING FROM THE ROWS (19.87, `openProduction(tab)`, `PROD_TABS`, `_prodShow`).**
  Everything after the deck (samples, vendors, pricing, issues) reads `_deckSpecRows()`; never a second item list.
  **Samples:** codes are DERIVED (`_sampleItems`: `fCode` on rows `_rowTakesFrameSample`, mats via `_rowMatNames`
  mirroring `buildSpecStrings`); only the verdict is stored, `editorialContent.samples['f:'|'m:' + code] = {st, use,
  note, at}`, one writer `setSampleStatus` (prunes empties). `sampleReplace` swaps through `_salonFrameDress` (library)
  or the typed code, pushes to wall copies, ONE undo. Preflight (`_samplePreflight`): rejected and still used = err;
  IFS (`_deckIsIFS`, read off the footer version, no stage setting) and not approved = warn. Issues carry `prod`.
- **THE ART TYPE IS HOW THE PIECE IS BOUGHT (20.07, `_artTypePreflight`).** FAO/original with a `sourceUrl` host in
  `SHOP_HOST_RE` warns; `COMMISSION_NOTE_RE` text on a spec page must sit with an `_rowIsCommission` piece and a
  commission needs it. The two presets (`Commission note`, `Original artwork note`) are in `_DS_NOTE_PRESETS`; the
  original note must NOT match `COMMISSION_NOTE_RE` (tested).
- **WEIGHT AND A NEW PICTURE (20.28).** Row `weightLbs` (`#m_weight`) adds a Weight legend line only on a wall where a
  piece has one (`_igLegHasWeight`, BOTH key lists: `_igLegKeys` and `_legLines`, or the height reserved and the
  lines drawn disagree). `_artIdentityResetOnSwap` clears title/artist/affil/medium/year when the image code changes
  to a DIFFERENT code (same code with an extension keeps them); the form's `m_artist`/`m_artworkTitle` must be
  cleared too or `syncDashAndCalculate` writes them straight back.
- **ANOTHER JOB'S TEXT (20.28, `_leftoverPreflight`, `FILE_STAMP_RE`).** Typed text with a file stamp (8+ letters
  before `.V<n>`) not containing this project's code or name is flagged; no code and no name = no check. In an IFS
  also typed "Elevation Pending" and "Title N/A". The PDF is `_deckPdfFileName()` (date.code.version), the
  version box takes 12 characters for a scope prefix (GR.V4).
- **WALL LABELS ARE A PRODUCTION TAB (20.06, `_prodLabelsInto`, `setRowLabel`, `_labelLines`, `_labelSheetPdf`, `_labelCsv`).**
  Row fields `artworkTitle`/`artist` (hidden in the form) plus `artistAffil`, `artMedium`, `artYear`; `labelOff` '1'/'0'
  only when it differs from `_labelDefaultOn` (objects and flat graphics off). Sheet = Avery 5163 (4"x2", 2x5 Letter).
  Empty parts are left out, never printed blank.
- **THE STAGE IS THE PRESENTATION TYPE (20.04, `_deckStage`, `PRES_STAGE`).** `_deckIsIFS` is true for Final Spec
  and Install Guide (the footer box `#specPdfVersion` is maxlength 4, so "V6" never says IFS). `_ifsAuditPreflight`
  (always: duplicate placement codes, punctuation-blind; `PAGE_PLACEHOLDER_RE` on typed page text via `_pfPageTexts`,
  warn, err in an IFS; IFS only: OPTION headings, no size / frame code (err), no glass on `IFS_GLAZED`, no stretcher
  depth on `IFS_CANVAS`, no title/artist on `_rowIsPurchase` non-objects) and `_stagePreflight` (a formal stage name in
  `DECK_STAGES` that is not the deck's stage; a `V<n>` ≠ the footer's on the cover or beside a stage name, never in
  body copy). The starter deck's own filler is flagged on purpose.
- **IFS READINESS (19.88, `_readinessPreflight`).** Always: one `_imgCodeKey` on two `_artSig`s (reuse those two,
  never a new signature). IFS only: TBD in image code / `buildSpecStrings` values / notes, a catalogue placement with
  more than one option, footer `V<n>` vs the project file name's `V<n>`.
- **VENDORS AND THE PACK (19.89, `r.vendorName`, `r.sourceUrl`, `setRowsProduction`, `_prodPackPlan`,
  `_prodPackFiles`, `downloadProductionPack`).** Row fields outside the form survive sync (it copies unknown keys).
  `_rowIsPurchase` (Sourced Object, FAO/FCM/FSO/FSL code, original/commission/sourced art type) NEVER goes on an RFI.
  A per-vendor RFI is `buildDashCSVString({only})`, never a second CSV writer. `Vendor,Source URL` trail `Category`.
  Contact sheet caption `_contactSheetCaption` = image code + `_WxH` at PRINT size, project unit, no extension.
- **WILL IT PRINT SHARP (20.10, `_artIncomingPx`, `_linkPx`, `artLink.pw/ph`, `_artPrintPpi`, `_printResPreflight`).** The
  import keeps a 1200 px copy, so the ORIGINAL's pixels ride on the link (set beside `_artIncomingFile`, SVG none;
  `_linkReadFile` passes them to `_linkApply`). ppi = min(pw/printW, ph/printH) / artZoom, print size from
  `_rowOpeningAndPrint` in inches. Under `PRINT_PPI_MIN` 150 (`FLAT_PPI_MIN` 75): warn, err in an IFS. No pixels = not judged.
- **THE SIZES ADD UP (20.11, `_rowOpeningAndPrint(...).short`, `_sizeMathPreflight`).** `short` = a sized piece whose
  opening was <= 0 BEFORE the clamp; warn, err in an IFS.
- **EVERY PICTURE HAS A HOUSE CODE (20.12, `HOUSE_IMG_CODE_RE`, `_imgCodeShapePreflight`).** Letters 2-5 then TWO dotted
  number groups (JZY.010.00219; IMG_4021 must fail). Blank / TBD skipped (other checks). Warn, err in an IFS. Test fixtures with real pictures
  need a house image code or they gain this warning.
- **THE QUOTE TEMPLATE'S RULES (20.16, `ROYALTY_10_CODES`, `PRINTED_PANEL_BLEED_IN`, `MAX_MAKE`, `_maxMakeIssues`,
  `_canvasDepthIssue`, `STD_STRETCHER_DEPTHS`, `_maxMakePreflight`).** From the real `2026 QUOTE TEMPLATE - Terms and
  Conditions.xltx`: royalty 10% is a list of twelve prefixes, not PEN alone. Didactic Panel bleed 0.125 (printed panel);
  `_rfqMount` tests the panel BEFORE `_isFlatGraphic` (it is one, so it read as EGD). Max sizes in INCHES, short x long,
  shown in the project unit; mat/glass judged at overall - 2 x fW + 0.5 (rabbet lip). Floater: stretcher deeper than
  `rabbetDepth` = proud canvas; offer the deepest standard depth, never a custom one (costs more). Warn, err in an IFS.
- **A CANVAS'S SIDES (20.17, `_canvasWrapOf`, `canvasSides`, `CANVAS_SIDES`, `_canvasSidesInfo`, `_canvasRoomCrop`,
  `canvasSidesMakeRoom`, `_canvasSidesNote`, `_canvasSidesPreflight`, `_stdStretcherFor`).** Floater print = art + 2 x
  `_canvasWrapOf` (typed wrap, else depth + 0.5"); the RFQ O cell keeps `N+0.5` only when it agrees. The crop is STILL the
  face everywhere (`computeArtDrawRect` untouched): 'image' means the picture outside the crop is the wrap, judged by
  `_canvasSidesInfo.short`; the dashboard band `.canvas-sides-ghost` is screen only. `_artPrintPpi` spreads a floater over
  its FACE. Rabbet/depth auto-fill uses `STD_STRETCHER_DEPTHS` (never depth = rabbet). `HOUSE_BUFFER_PCT` 3 applies when
  the card's buffer is blank (0 = none); pricing fixtures not about the buffer pass `{ buffer: 0 }`.
- **ISSUES (19.90, `markIssued`, `_issueSnapshot`, `_issueDiff`, `editorialContent.issues`, max `ISSUE_KEEP`).** A
  record is TEXT ONLY: `buildSpecStrings` lines + image code, product, location, qty, vendor and `_artSig` (never a
  data URL; tested). Keyed by row id, so a renumber reads as removed + added. The pack adds the latest diff.
- **PRICES (19.91, `setRowPrice`, `_priceRow`, `_priceTotals`, `editorialContent.pricing` = {markup, budget,
  currency, rates}).** Row fields `unitCost` + `costSrc` ('quote'|'estimate') + `costAt`, `unitSell` (only when typed),
  `allowance`. A typed or imported cost is a dated QUOTE; `updateEstimates` refreshes only estimates (tested: a quote
  survives). Qty = walls, a piece on no wall prices as 1, a catalogue option as 0. Prices NEVER in deck renderers
  (test reads `buildSpecStrings`, `_deckMockHTML`, `_drawDeckPage`). Rate card is per project + localStorage
  `RATE_CARD_KEY`, never the repo (the site is public). Excel: `_xlsxBlob` (inlineStr, formulas, styles incl. a Normal
  cellStyle or openpyxl warns) and `_xlsxReadRows` (shared strings, columns by `r` ref); import reads columns BY NAME
  (`PRICE_IMPORT_COLS`), never Qty, and does not freeze a cached `cost x markup` Unit Sell into a hand price.
  Salesforce gets a CSV (`_salesforceLinesCSV`); no API (static site, no tokens).
- **THE PRODUCTION BUTTON IS THE BUDGET (19.93, 19.95, `#dashProdBtn`, `_dashBudgetInfo`, `_dashBudgetSync`,
  `_dashProdAttention`).** The ONE way into Production from the dashboard (samples and prices are NOT in the Edit /
  Export menus; Production pack stays in Export; Ctrl+K lists the four tabs). Reads Production until priced, then built from `_priceTotals` / `_priceRow` (never its own sums): sell vs budget and the selected
  piece vs its allowance, `data-over` amber; `.prod-btn-badge` counts samples preflight + resized + stale quotes,
  `data-tab` = the tab that count is about. The toolbar test pins SEVEN buttons. Refreshed by `_syncNavBadges` (every edit) and `loadDashDataIntoControls`
  (selection). Screen only.
- **THE PRICE FOLLOWS THE SIZE (19.94, `_priceRow`, `_priceSizeKey`, `r.priceFor`).** An estimate is NEVER a
  stored number: `_priceRow` works it out from the rate card and the current size on every read (a stored legacy
  estimate is used only when the card no longer covers the product). A quote or a typed sell records `priceFor`
  (overall size in inches to a sixteenth, `setRowPrice`); resized, the new size's estimate stands in (typed sell
  ignored) and the piece is flagged `resized` (Pricing tab, chip tip); back at the quoted size the quote returns; no
  rate card = quote kept, flagged. `syncDashAndCalculate` calls `_dashBudgetSync` on every keystroke (live pass too).
  Import compares against `_priceRow(r).cost`, or a round-tripped estimate becomes a quote. No Update estimates button.
- **THE COMPANY'S OWN SHEETS (19.96, `_rfqSheet(docType, only)`, `_salesforceLinesCSV`, `_rowRoyalty`, `HOUSE_MARKUP`,
  `VENDOR_CODES` / `_vendorCode`).** From the team's Claude projects (RFQ/RFI Generator, RFQ -> Import Template). Sell =
  cost x (markup + royalty): markup is typed or `HOUSE_MARKUP` 1.8731 (template AK = 87.31% + AJ), royalty F 0 / `ROYALTY_10_CODES` 0.10 /
  else 0.05 or `r.royalty` (stored only when it differs). Margin is AFTER royalties. RFQ = template front sheet, rows 1-8
  header, row 9 titles (`RFQ_COLS`, A to AN), data from row 10, `freeze: 9`; J to M are the template's mount formula ONLY
  where it equals `_rowOpeningAndPrint` (else FRAME's number). RFI = A to AG, no purchases, Total Pieces only. SF CSV is the
  Import Template's 11 columns (H before W, markup a plain number, `_sfClean`). Product Code only for an art-type prefix
  (unknown mapping for prints: ask before guessing). `_xlsxBlob` cells take `border` / `head` / `title` / `pct` and a cached `v`
  beside `f`. Test fixtures that are not about royalty use F image codes.
- **RATE CARD ADD-ONS (19.97, `rates.addons`, `ADDON_KEYS`, `_rowAddons`, `_estimateCost`).** One set for every
  product, each DERIVED from the piece: premium frame by code (`PREMIUM_FRAME_RE`, LJ- / UA-), non-glare off the Glass
  field (`NON_GLARE_RE`; entered at 30x40, scaled by area), sealant from a humid location (`HUMID_LOC_RE`; `r.sealant`
  stored only when it differs, the Pricing tab's tick), oversize past 40x50 either way, `buffer` % on the whole estimate.
  Never on a flat graphic (per sq ft alone). `setRateCard(list, asOf, addons)`: undefined KEEPS the card's add-ons.
  No amounts in the code (public site).
- **COMMERCIAL INVOICES (19.99, Production > Shipping, `editorialContent.shipments`, one writer `setShipment`,
  `_shipLines`, `_shipPort`, `_commercialInvoicePdf`).** An invoice names its pieces by row id; every line is DERIVED
  (`_shipDesc`, `_shipHs` from `SHIP_HS`, qty `_priceQty`, value cost or sell via `_priceRow`) under the line's own
  typed fields (`sh.lines[id]`, blank deletes; unticking a piece drops its override). Port = typed, else Talia's route
  table, else BLANK (never a guess). Address book and signer are localStorage (`SHIP_BOOK_KEY`, `SHIP_SIGNER_KEY`):
  no names or tax ids in the code. Lines print bare numbers; the currency is stated once.
- **BRAND STANDARDS (20.00, Production > Brand standards, `_prodBrandInto`, `setBrandItems`, `addBrandItem`, `BS_MAILS`,
  `_bsMailCtx`, `_bsFill`).** The fixed-price RI / SHS / Ford list lives on THIS COMPUTER (`BS_ITEMS_KEY`, settings incl.
  card fee, Ford rate and saved wording in `BS_SET_KEY`) and travels as a `frame-brand-standards` file (import REPLACES the
  list); never in the code or the project. `addBrandItem` mints through `_fpAddCodes` with the `_bsNew` marker (never the
  returned code), prices through `setRowPrice` (cost = quote, sell = fixed), stamps `stdItem` (what `{custom}` leaves out)
  and `orderQty`, which `_priceQty` reads only when the walls give 0. A blank token prints `[token]`, never ''. `**bold**`
  is `<b>` in the rich copy (`_bsCopyMail`) and stripped in plain text and mailto.
- **THE DECK DRIVER (20.01, `tools/frame-driver.js`, skill `.claude/skills/build-deck`).** Node, no dependencies:
  serves the tree + `/__file?p=` on 127.0.0.1, runs headless Chrome over CDP, takes `call <fn> '<json>'` /
  `render` / `pdf` / `save` / `sheet` / `eval` / `stop`; state in `FRAME_DRIVER_STATE` (default tmp). A `{$file}`
  argument is LOADED AS AN IMAGE and handed on at most 3000 px (Chrome refuses to `fetch` the 50 MB+ print
  originals). FRAME_API 2 adds `setProject`, `setPages`, `removePage`, `setContentsEntry`, `listContacts`,
  `setContacts`, fixed pages in `describePage`/`fillPage` (`_apiFillable`), image `{fit:'whole', caption:'code'}`,
  `false` to remove a slot, `caption` in `describePage`; an API PNG stays PNG only with real alpha. `exportPDF` passes
  what Generate PDF passes (`meta`, `include`, `all`, `preset`), or the footer loses location/code/version.
  `test_frame_driver` runs real Chrome (skips with none).
