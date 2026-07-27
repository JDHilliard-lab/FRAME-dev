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
57 files, 443 checks. Add a new `tests/test_<topic>.js` for every fix; each should
reproduce the actual reported bug, not just assert the new code exists. If a test
fails because behaviour intentionally changed, update the test and say so explicitly —
never delete a check to make the suite pass.

## Architecture anchors (hard-won; don't rediscover)
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
