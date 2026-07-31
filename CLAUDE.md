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
- **No em dashes in written output.** Casual, direct tone.

## Testing — do this every time
```
node tests/run-all.js        # must print ALL GREEN before anything ships
```
87 files, 834 checks. Add a new `tests/test_<topic>.js` for every fix; each should
reproduce the actual reported bug, not just assert the new code exists. If a test
fails because behaviour intentionally changed, update the test and say so explicitly —
never delete a check to make the suite pass.

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
- `annotationStyle.font` and `imageCodeStyle.fontToken` hold library tokens;
  `annotationStyle.fontFamily` and `imageCodeStyle.font` are **derived** CSS
  stacks that `_normalizeAnnotationStyle()` / `_normalizeImageCodeStyle()` keep
  in sync — every renderer reads the derived field, so don't set it by hand.
  Studio defaults: dims = Messina (size/colour stay the user's call);
  captions and image codes = Messina 9pt `#9c9c9c`, matching
  `_specCodeStyle()`.
- `computeArtDrawRect` is the **single source of truth** for artwork crop/fit across
  all five render paths (dashboard preview, elevation DOM, canvas/PNG, SVG, PDF).
- `_coverRect()` / `_cropToCanvas()` are the shared crop math for page background
  images. The DOM preview and the PDF must agree exactly — they diverged once because
  the DOM used aspect-blind CSS while the PDF used real cover-fit math.
- `scheduleAutosave()` is the central debounce hook. Nearly every mutation calls it,
  which makes it the reliable place to hang follow-on work (e.g. thumbnail refresh).
- `_resolveFooter()` handles footer theming. `'auto'` means *read this page's own
  theme* — not a fixed default.
- Templates live in `editorialContent.templates`; `type` doubles as the category key.
  Project JSON is the exchange format for template library updates.
- `_dsThumbCacheKey()` ↔ `data-thumb-key` identifies rail cells.
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
- `annotationStyle.dimEnds` (`'none'|'tick'`) is the dimension-end style, set in the
  Elevations gear (Line Ends). `'tick'` = architectural 45° obliques: `_dimTicksHTML()`
  appends two per line, `--dim-line-w`/`--dim-tick-w` split the user's single weight
  into the light-line/heavy-tick hierarchy, and `_dimExtOverhang()` runs extension
  lines past the intersection. `DIM_TICK_LEN`/`DIM_EXT_OVERHANG` are print constants
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
- **The Elevations tab is the source of truth** for which measurements appear on
  elevation pages. Layout-guide *styling* is global; the figure's *position* is
  per-elevation. Breaker captures honour `_breakerMeasure()` ("Show layout guides").
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
- **Vertical dimension text is only rotated on the outer WALL dims**
  (`.arch-label-rot`). The architectural standard wants every vertical dimension
  rotated 90° CCW, and it's the only treatment that can't crash into anything. The
  spacing/custom vertical dims are blocked on their drag arrows: `buildDimControls`
  appends them as children of the label, so rotating the label rotates them too and
  up/down become left/right. Fix is either counter-rotating the arrow cluster or
  moving the arrows onto the unrotated dim container (what `.hang-dim-num` already
  does).
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
