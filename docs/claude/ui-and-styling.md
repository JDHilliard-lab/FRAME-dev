# UI, styling, touch and phone

Part of the FRAME rulebook (see `CLAUDE.md`). Covers dialogs, toasts, colour tokens, tabs, type and corner ladders, theme, docks, start screen, tour, touch, iPhone.
Same format as `CLAUDE.md`: the rule, the names, the trap, one clause of why. Add new rules for this area HERE.

- **All sliders are one global `input[type=range]` rule** in style.css (2px track, 11px
  dot, no opt-in class). WebKit and Gecko pseudo-elements don't inherit each other, so
  write every rule twice. WebKit thumb needs `margin-top: (track - thumb) / 2`.
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
- **ONE SETTINGS GEAR (18.47): `#appSettingsBtn` -> `openAppSettings(tab)`**, in every
  view (no `data-views`). Tabs `APP_SETTINGS_TABS`: `units` (`_unitControlsInto`), `fx`
  (`_frameFxInto`), `elev` (hands off to `openPrecisionModal`, closing Settings first).
  `openFrameFx` / `openUnitMenu` / the units chip / `projFrameFxBtn` all land on their tab;
  there is no separate Frame effects modal (`#frameFxModal` is gone) or units popover.
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
- **SWIPE TO FLIP (19.26, phone only, `_touchSwipeZone` / `_touchSwipeFlip`).** A touch on the
  BACKGROUND of a wall (`#wall`, `#export-wrap`, `#scrollArea`) or deck page (`#dsCenter`,
  `#dsLayoutCanvas`, a canvas) presses nothing until the first move: sideways = flip, else the
  ordinary gesture from the start point, no move = a tap. Never with a drag-drawing tool armed
  or on a floor plan page; an iPad keeps marquee.
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
- **A COLOUR INPUT ON THE DASHBOARD SYNCS LIVE (19.57, `syncDashAndCalculate({live:true})`, `_dashLiveFlush`,
  `DASH_LIVE_MS`).** A picker fires `input` every frame; a full sync rebuilds the item table (~120ms on 50 rows).
  Live writes the row + preview only; table, walls, warnings follow once after the colour settles, or at once on
  `change`. The pending pass tracks the ROW OBJECT, never the index; a full sync of another row flushes it first.
  A new continuous control on the form (colour, slider) takes the live form plus an `onchange` settle.
