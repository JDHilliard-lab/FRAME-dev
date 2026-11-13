# Project data, saving and the frame library

Part of the FRAME rulebook (see `CLAUDE.md`). Covers save and open, autosave, undo, the image pool, units and rounding, frame effects, the frame library and swatches, the offline worker.
Same format as `CLAUDE.md`: the rule, the names, the trap, one clause of why. Add new rules for this area HERE.

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
- **IMAGES AND PACKAGE (20.37, `_projectImages`, `openImagesModal`, `packageProject`, Save menu).** The list is read
  off `_projectPayload()` by ONE walk (`_looksLikeImage` + `classify` by path), deduped by the string like the
  18.81 pool, so it cannot disagree with Save. A new place that stores pictures needs a `classify` branch or it
  lands under Other (still listed, still packaged). Status from the string: data: in the file, http/library linked,
  blob: not saved, an `artworkFile` with no `artworkUrl` missing. Images export AS STORED. The client elevation
  keeps `underlay.name` (file name less extension, `setUnderlayName`). Test `tests/test_images_package.js`.
- **THE PROJECT FILE STORES EACH IMAGE ONCE (18.81).** `_projectFileText(payload)` writes
  `{type: 'frame-project-v7', imagePool: [...], project: <payload>}`, every `data:` string
  >= `POOL_MIN` replaced by `POOL_MARK + index`; `_projectFromFile` (first line of
  `_readProjectText`) puts them back, and passes an older single-level file through. The
  outer type must NOT start with 'master-studio' (older builds refuse instead of opening a
  picture-less deck). Only the FILE is pooled: memory, autosave and undo are not. Real
  project: 44.0 MB -> 28.2 MB, round trip byte-identical.
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
  **A DROPPED .JSON IS THE THIRD OPEN PATH (20.39, `_wireProjectFileDrop`).** Window CAPTURE
  listeners take only a drag whose item type is `application/json` (blank type is a folder,
  the library zone's); everything else passes through to the image zones. The handle is
  asked for synchronously in the drop (`getAsFileSystemHandle`), awaited after the confirm.
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
- **FLOOR PLANS ARE IN THE UNDO ENTRY (`snapshotProjectState({ plans: true })`).** Only the
  undo stack asks for it (autosave and version history store levels beside the snapshot).
  **Every level mutation pushes history** (upload, add, rename, delete). Deleting a level
  renumbers pins AND wall lines, reading `_fpWalls(r)` before `r.level` changes.
  The empty plan slot in Deck Studio is an **Upload floor plan** button; the PDF placeholder
  reads "FLOOR PLAN IMAGE GOES HERE".
- `importDashCSV` strips unit suffixes during column lookup, so CSV headers must include the
  suffix, e.g. `Overall Width (cm)`.
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
- **THE FRAME BROWSER (18.84, `openFrameBrowser`, `_fb*`)** replaces the flat Frame dropdown. Frames are
  addressed by CODE. Project frames = frames on an item (`_fbInUse`, DERIVED from rows, never stored) +
  `editorialContent.frameShortlist` (codes; `_fbShortlist` is READ-ONLY, `_fbSetShortlist` the one
  writer, pushes history, deletes the field when empty). My groupings: localStorage `FB_MINE_KEY`.
  Team groupings (shown as CLIENT GROUPINGS since 20.38: a grouping's optional `client` nests it under one
  vendor-style row, `_fbClientGrouping` = the union, `_fbOpenClients`): `library/groupings.json`, committed by a person; the app is static and never writes
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
- **OFFLINE: `sw.js` (19.26, registered by `_swRegister`, https/localhost only; `?nosw` removes
  it).** Navigation network-first (a release still arrives), versioned `?v=` files cache-first
  and a newer page's versions adopted with the old ones PRUNED (page and app stay a pair for
  `_checkBuildPairing`), everything else stale-while-revalidate capped at `RUNTIME_MAX`. Cache
  names carry the SCOPE (dev and stable share an origin). It reads the versions out of the
  page, so it needs no edit per release. Never caches POSTs or other sites (Google Fonts and
  cdnjs excepted). `test_offline_sw.js` runs it against a fake Cache Storage.
- **A CORRECTED LIBRARY SWATCH NEEDS A LINE IN `LIB_SWATCH_REV` (19.27).** Picking a frame COPIES
  its swatch into the project, so replacing a library image changes nothing for pieces already
  in it. `_libSwatchUpgrade` (from the library load AND `_startScreenClose`, whichever is second)
  re-copies a listed code into rows (and wall copies) whose `swatchRev` is older; only library
  picks (`swatchName === fCode`), never an upload (`swatchCustom`, set by
  `loadDashCustomSwatch`). A swatch is the corner's FACE, a tall cut with cross-faded ends: a
  short slice tiles down the rail as a visible repeat (FA-BW74-2003 was 31px and read as dots).
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
