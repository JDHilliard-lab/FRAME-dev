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
71 files, 602 checks. Add a new `tests/test_<topic>.js` for every fix; each should
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
- `buildSpecStrings` emits `Matboard` **only for float mounts**; standard framed art
  emits `Mat 1`/`Mat 2`. Any `wanted` filter listing one must list all three, and the
  DOM-preview lists in `_deckMockHTML` must match the PDF ones or the two drift.
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
