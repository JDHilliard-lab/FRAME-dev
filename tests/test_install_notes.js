// Installation notes: a tick list of standard notes that print in an
// INSTALLATION NOTE box on install-guide AND elevation breaker pages.
//
// Three things are easy to get wrong here:
//   1. Reaching both page kinds. _igCfg deliberately forces a fixed base for
//      breaker pages so Install-guide globals can't bleed onto them — notes are
//      the one setting that SHOULD reach both, so they live outside _igCfg.
//   2. Not overlapping the drawing. The box sits in the top-right corner on the
//      title row, and its height is measured BEFORE the layout so the drawing's
//      top clears it — rather than being drawn on top afterwards. (It began as a
//      full-width band across the bottom; height is the expensive thing to spend,
//      because the elevation scales to whatever is left.)
//   3. Surviving the renderer's early returns. _drawInstallGuidePage has several
//      (no capture yet, no active artwork, the schematic fallback), each drawing
//      its own footer — exactly the trap CLAUDE.md records for _drawSpecSetPage.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};
    const S = window.__appSrc;
    scheduleAutosave = () => {}; pushHistory = () => {};
    _dsClearBuiltAll = () => {}; _dsRefresh = () => {}; _dsRenderTools = () => {}; _dsPriorityRerender = () => {};

    const __reset = () => { editorialContent.installNotes = { keys: {}, custom: '' }; editorialContent.specDualUnit = ''; };
    // Enough of a jsPDF surface to measure and draw against.
    const __doc = () => {
      const calls = [];
      return {
        calls,
        splitTextToSize: (t, w) => { const n = Math.max(8, Math.floor(w / 3.6)); return t.match(new RegExp('.{1,' + n + '}(\\\\s|$)', 'g')) || [t]; },
        setFont: () => {}, setFontSize: () => {}, setTextColor: () => {},
        setDrawColor: () => {}, setLineWidth: () => {}, setLineDashPattern: () => {},
        rect: (x, y, w, h) => calls.push({ t: 'rect', x, y, w, h }),
        text: (s2, x, y) => calls.push({ t: 'text', s: s2, x, y })
      };
    };

    __check('nothing is ticked by default, so no box and no reserved space', () => {
      __reset();
      if (_installNoteLines().length !== 0) throw new Error('default notes: ' + JSON.stringify(_installNoteLines()));
      if (_installNoteBoxH(__doc(), 520) !== 0) throw new Error('reserved height with nothing ticked');
      const d = __doc();
      _drawInstallNoteBox(d, 40, 700, 520);
      if (d.calls.length !== 0) throw new Error('drew something with nothing ticked');
    });

    __check('EXACT REQUEST: the AFF note is the one the user asked for, reason included', () => {
      __reset();
      editorialContent.installNotes.keys.aff = true;
      const t = _installNoteLines()[0];
      if (!/Align the centre of all artwork to/.test(t)) throw new Error('got: ' + t);
      if (!/above finished floor/.test(t)) throw new Error('AFF is not spelled out: ' + t);
      if (!/Do not align to the top or bottom of the frame/.test(t)) throw new Error('the DO NOT half is missing: ' + t);
    });

    __check('the AFF note carries the live hang height, not a hardcoded one', () => {
      __reset();
      editorialContent.installNotes.keys.aff = true;
      // Stored in INCHES (elevHangIn); the Settings input is its display.
      const save = elevHangIn;
      elevHangIn = 60;
      const a = _installNoteLines()[0];
      elevHangIn = 57;
      const b = _installNoteLines()[0];
      elevHangIn = save;
      if (a.indexOf('60\\"') < 0) throw new Error('a 60in hang height gave: ' + a);
      if (b.indexOf('57\\"') < 0) throw new Error('a 57in hang height gave: ' + b);
      if (/AFF AFF/.test(a)) throw new Error('AFF doubled up: ' + a);
    });

    __check('ticked notes print in list order, not tick order', () => {
      __reset();
      // Tick them backwards.
      editorialContent.installNotes.keys = { level: true, verify: true, aff: true };
      const lines = _installNoteLines();
      const order = FRAME_INSTALL_NOTES.filter(n => ['aff', 'verify', 'level'].indexOf(n.key) >= 0).map(n => n.key);
      if (lines.length !== 3) throw new Error('expected 3 notes, got ' + lines.length);
      // aff is first in the library, so it must be first out.
      if (order[0] !== 'aff') throw new Error('library order changed; update this check');
      if (!/Align the centre of all artwork/.test(lines[0])) throw new Error('first line is: ' + lines[0]);
    });

    __check('free-text notes append after the standard ones, one per line', () => {
      __reset();
      editorialContent.installNotes.keys.aff = true;
      editorialContent.installNotes.custom = 'Site contact: Jordan.\\n\\nFilm stays on until sign-off.\\n  ';
      const lines = _installNoteLines();
      if (lines.length !== 3) throw new Error('expected 1 standard + 2 custom, got ' + JSON.stringify(lines));
      if (lines[1] !== 'Site contact: Jordan.') throw new Error('custom line 1: ' + lines[1]);
      if (lines[2] !== 'Film stays on until sign-off.') throw new Error('blank and whitespace-only lines should be dropped: ' + JSON.stringify(lines));
    });

    __check('custom text alone is enough to produce a box', () => {
      __reset();
      editorialContent.installNotes.custom = 'Deliver to loading dock B.';
      if (_installNoteLines().length !== 1) throw new Error('custom-only produced ' + _installNoteLines().length + ' lines');
      if (!(_installNoteBoxH(__doc(), 520) > 0)) throw new Error('custom-only reserved no space');
    });

    // ── The dual-units note tracks the setting ──
    __check('the dual-units note auto-ticks with dual units and disappears without them', () => {
      __reset();
      if (_installNoteLines().length !== 0) throw new Error('units note appeared with dual units off');
      editorialContent.specDualUnit = 'mm';
      const on = _installNoteLines();
      if (on.length !== 1 || !/millimetre/.test(on[0])) throw new Error('expected the mm units note, got ' + JSON.stringify(on));
      if (!/Inches govern/.test(on[0])) throw new Error('the note should say which unit governs: ' + on[0]);
      editorialContent.specDualUnit = 'cm';
      if (!/centimetre/.test(_installNoteLines()[0])) throw new Error('the note did not follow the cm setting: ' + _installNoteLines()[0]);
      editorialContent.specDualUnit = '';
      if (_installNoteLines().length !== 0) throw new Error('the units note outlived the setting');
    });

    __check('an explicit tick still beats the units note default, in both directions', () => {
      __reset();
      editorialContent.specDualUnit = 'mm';
      editorialContent.installNotes.keys.units = false;
      if (_installNoteLines().length !== 0) throw new Error('unticking the units note did not stick');
      editorialContent.specDualUnit = '';
      editorialContent.installNotes.keys.units = true;
      if (_installNoteLines().length !== 0) throw new Error('a stale tick printed a units note with dual units off, which would be nonsense');
    });

    // ── The box ──
    __check('EXACT REQUEST: the block is headed INSTALLATION NOTE', () => {
      __reset();
      editorialContent.installNotes.keys.aff = true;
      const d = __doc();
      _drawInstallNoteBox(d, 40, 640, 150, 480);
      const texts = d.calls.filter(c => c.t === 'text').map(c => c.s);
      if (texts[0] !== 'INSTALLATION NOTE') throw new Error('heading is: ' + texts[0]);
      if (texts.length < 2) throw new Error('the heading printed but the note did not');
      // No outline any more: it's a full-height column, and a border round one reads
      // far heavier than the text inside it (matches the reference drawings).
      if (d.calls.some(c => c.t === 'rect')) throw new Error('a border was drawn round the column');
    });

    __check('notes read as separate paragraphs, not one run-on block', () => {
      __reset();
      editorialContent.installNotes.keys = { aff: true, group: true, verify: true };
      const d = __doc();
      _drawInstallNoteBox(d, 40, 100, 150, 480);
      const ys = d.calls.filter(c => c.t === 'text').map(c => c.y);
      // Somewhere between notes the step must exceed the plain line leading.
      let steps = [];
      for (let i = 1; i < ys.length; i++) steps.push(+(ys[i] - ys[i - 1]).toFixed(2));
      const maxStep = Math.max.apply(null, steps), minStep = Math.min.apply(null, steps);
      if (!(maxStep > minStep + 1)) throw new Error('no paragraph gap between notes; steps: ' + steps.join(','));
    });

    __check('EXACT RISK: the box is measured BEFORE the layout, and the drawing clears it', () => {
      // The box moved from a full-width band across the BOTTOM to the top-right
      // corner, on the title row: the elevation scales to whatever height is left,
      // so height was the expensive thing to spend and the corner was already
      // empty. This used to assert the SR.B shrink; the invariant now is that the
      // drawing's top clears the box.
      const i = S.indexOf('async function _drawInstallGuidePage');
      const body = S.slice(i, i + 4000);
      const hAt = body.indexOf('_installNoteBoxH');
      const mAt = body.indexOf('const M = SR.L');
      if (hAt < 0) throw new Error('the page never measures the note box');
      if (!(hAt < mAt)) throw new Error('the measurement must happen before the layout starts');
      if (body.indexOf('_igNoteBottom') < 0) throw new Error('nothing records where the note box ends');
      const topAt = S.indexOf('const _igTop = ');
      const topLine = S.slice(topAt, S.indexOf('\\n', topAt));
      if (topLine.indexOf('_igNoteBottom') < 0) throw new Error('the drawing top does not clear the note box, so a long note set would be drawn over: ' + topLine);
      if (topLine.indexOf('Math.max') < 0) throw new Error('the drawing top should take the LOWER of the title block and the note box, not just one');
    });

    __check('EXACT BUG: the notes take WIDTH off the right, so the drawing keeps its height', () => {
      // Ticking every note made a full-width band tall enough to shrink the
      // elevation badly. On a widescreen page the drawing is height-constrained and
      // has spare width, so a right-hand column costs a fraction of what a band did.
      const i = S.indexOf('async function _drawInstallGuidePage');
      const body = S.slice(i, i + 4000);
      if (body.indexOf('SR.R - _igNoteW') < 0) throw new Error('the column is not anchored to the right edge');
      if (body.indexOf('SR.R -= (_igNoteW + IG_NOTE_GUTTER)') < 0) throw new Error('THE BUG: the column does not take its width off the drawing area, so it would overlap the elevation');
      if (/SR\\.B -= /.test(body)) throw new Error('THE BUG: something still takes height off the bottom for the notes');
      if (body.indexOf('_installNoteBoxH(doc, _igNoteW, SR.B - SR.T') < 0) throw new Error('the height is not measured at the column width and page height');
    });

    __check('the column is narrow, and clamped so it neither towers nor eats the drawing', () => {
      if (typeof IG_NOTE_W_FRAC === 'undefined') throw new Error('IG_NOTE_W_FRAC is gone');
      if (!(IG_NOTE_W_FRAC > 0.1 && IG_NOTE_W_FRAC < 0.25)) throw new Error('IG_NOTE_W_FRAC of ' + IG_NOTE_W_FRAC + ' is not a narrow column');
      if (!(IG_NOTE_W_MIN < IG_NOTE_W_MAX)) throw new Error('the clamp is inverted');
      // Clamped at both ends, whatever the page size.
      if (_installNoteColW(400) !== IG_NOTE_W_MIN) throw new Error('a narrow page did not clamp up to the minimum');
      if (_installNoteColW(4000) !== IG_NOTE_W_MAX) throw new Error('a very wide page did not clamp down to the maximum');
      const mid = _installNoteColW(1000);
      if (!(mid >= IG_NOTE_W_MIN && mid <= IG_NOTE_W_MAX)) throw new Error('mid-size page gave ' + mid);
    });

    __check('EXACT RISK: ticking EVERY note shrinks the type rather than overflowing the page', () => {
      __reset();
      FRAME_INSTALL_NOTES.forEach(n => { editorialContent.installNotes.keys[n.key] = true; });
      editorialContent.specDualUnit = 'mm';   // brings the units note in too
      const colW = _installNoteColW(920);
      const maxH = 480;
      const h = _installNoteBoxH(__doc(), colW, maxH);
      editorialContent.specDualUnit = '';
      if (!(h > 0)) throw new Error('every note ticked produced no column');
      if (h > maxH) throw new Error('the column runs ' + h.toFixed(0) + 'pt past a ' + maxH + 'pt page instead of shrinking to fit');
      // And it must not shrink below readable.
      const d = __doc();
      _drawInstallNoteBox(d, 40, 40, colW, maxH);
      if (!d.calls.some(c => c.t === 'text')) throw new Error('nothing drawn');
      if (typeof IG_NOTE_FS_MIN === 'undefined' || !(IG_NOTE_FS_MIN >= 5)) throw new Error('the type floor is gone or unreadably low');
    });

    __check('a couple of notes are left at full size — the shrink only kicks in when needed', () => {
      __reset();
      editorialContent.installNotes.keys = { aff: true, group: true };
      const colW = _installNoteColW(920);
      const tall = _installNoteBoxH(__doc(), colW, 480);
      const same = _installNoteBoxH(__doc(), colW, 10000);
      if (Math.abs(tall - same) > 0.01) throw new Error('a short note set was shrunk anyway: ' + tall + ' vs ' + same);
    });

    __check('EXACT RISK: the box survives every early return in the renderer', () => {
      // Several exits each draw their own footer. Drawing the box up front is what
      // covers all of them; drawing it last would be forgotten at the next one.
      const i = S.indexOf('async function _drawInstallGuidePage');
      let end = S.indexOf('\\nfunction ', i + 10);
      const body = S.slice(i, end > 0 ? end : i + 40000);
      const drawAt = body.indexOf('_drawInstallNoteBox(');
      if (drawAt < 0) throw new Error('the page never draws the note box');
      const firstReturn = body.indexOf('return;');
      if (!(firstReturn < 0 || drawAt < firstReturn)) throw new Error('the box is drawn after an early return, so some pages would lose it');
      // TWO draw calls since 17.70, and that is not the trap this guards. The box has a
      // SIDE now: a right column is drawn up front, a left one is deferred until the
      // title band is measured, because it has to stack under the letter legend. They
      // are mutually exclusive branches of one conditional, and what still has to be true
      // that BOTH land ahead of every early return - that is what covers each exit.
      const calls = body.split('_drawInstallNoteBox(').length - 1;
      if (calls < 1) throw new Error('the box is never drawn');
      if (calls > 2) throw new Error(calls + ' draw calls: the box is being repeated per exit again');
      if (firstReturn >= 0) {
        const lastDraw = body.lastIndexOf('_drawInstallNoteBox(');
        if (!(lastDraw < firstReturn)) throw new Error('a note draw sits after an early return, so some pages would lose it');
      }
      if (body.indexOf('if (!_igNoteLeft) {') < 0) throw new Error('the two draws are not one either/or on the side');
    });

    __check('a long note set reserves proportionally more room', () => {
      __reset();
      editorialContent.installNotes.keys = { aff: true };
      const one = _installNoteBoxH(__doc(), 520);
      editorialContent.installNotes.keys = { aff: true, group: true, spacing: true, verify: true, hardware: true, level: true };
      const many = _installNoteBoxH(__doc(), 520);
      if (!(many > one)) throw new Error('six notes reserved ' + many + 'pt vs one note ' + one + 'pt');
      // And a narrower box wraps more, so it gets taller.
      const narrow = _installNoteBoxH(__doc(), 240);
      if (!(narrow > many)) throw new Error('a narrower box should wrap taller: ' + narrow + ' vs ' + many);
    });

    // ── Wiring ──
    __check('EXACT REQUEST: the tick list is reachable from the install-guide AND breaker panels', () => {
      if (S.indexOf('function _dsInstallNotesInto') < 0) throw new Error('no _dsInstallNotesInto helper');
      // _dsInstallGuideControls serves install-guide mode AND a breaker page's own
      // settings, so one call there covers both.
      const i = S.indexOf('function _dsInstallGuideControls');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (body.indexOf('_dsInstallNotesInto(') < 0) throw new Error('the install-guide panel does not show the notes list');
      const calls = (S.match(/_dsInstallGuideControls\\(/g) || []).length;
      if (calls < 3) throw new Error('expected the definition plus the install-guide and breaker call sites, found ' + calls);
    });

    __check('EXACT BUG: a breaker page selected in Per-piece / Group A/B/C shows the notes list', () => {
      // A breaker IS an install-guide page — same renderer, same notes — but it is
      // not _manual and the deck is not in Install-guide mode, so it fell through
      // to the spec TEMPLATE picker. The tick list was then reachable only by
      // switching the whole deck to Install guide, which nobody would guess.
      const i = S.indexOf('if (desc._install && !desc._manual)');
      if (i < 0) throw new Error('THE BUG: nothing handles a non-manual install/breaker page before the mode branches');
      const body = S.slice(i, i + 1600);
      if (body.indexOf('_dsInstallGuideControls(') < 0) throw new Error('the breaker branch does not show the install controls (which carry the notes)');
      // 'breaker', not false, since 17.70. A breaker used to be FORCED elevation-only so
      // that Install-guide's globals could not bleed onto it; breaker-owned slots do that
      // job now without also making the plan unreachable. What must stay true is that a
      // breaker never gets the FULL set - a moulding gallery is an install-guide idea.
      if (body.indexOf("variants: 'breaker'") < 0) throw new Error('the breaker panel does not ask for the reduced variant set');
      if (body.indexOf('variants: true') >= 0) throw new Error('a breaker is being offered the full install-guide layout set');
      // It must come BEFORE the per-piece / group branches, or they claim the page.
      const grp = S.indexOf('} else if (isGroupGlobal) {', i);
      const man = S.indexOf('if (desc._manual) {', i);
      if (!(man > i)) throw new Error('the breaker branch must sit ahead of the _manual branch');
      if (grp > 0 && !(grp > i)) throw new Error('the breaker branch must sit ahead of the group branch');
    });

    __check('the note CONTENT is deck-wide and deliberately NOT part of _igCfg', () => {
      // _igCfg forces a fixed base for breaker pages so Install-guide globals can't
      // bleed onto them, so which notes are ticked must live outside it or a breaker
      // would never see them. The note column's SIZE is a different matter and does
      // belong in _igCfg — it's a per-page layout trade-off against the drawing, and
      // breakers get their own global slots for it (breakerNoteW/breakerNoteFs).
      const i = S.indexOf('function _igCfg');
      const body = S.slice(i, S.indexOf('function _igSet'));
      if (/installNotes/.test(body)) throw new Error('the note content leaked into _igCfg, where breaker pages would never see it');
      if (/FRAME_INSTALL_NOTES/.test(body)) throw new Error('_igCfg is reading the note library');
      const j = S.indexOf("const simple = ['variant'");
      const line = S.slice(j, S.indexOf('\\n', j));
      ['keys', 'custom'].forEach(f => { if (line.indexOf(\"'\" + f + \"'\") >= 0) throw new Error('note content field ' + f + ' leaked into the _igSet field list'); });
      // The sizing fields SHOULD be there, and must have breaker slots or the
      // sliders would silently do nothing on a breaker page.
      if (line.indexOf(\"'noteW'\") < 0 || line.indexOf(\"'noteFs'\") < 0) throw new Error('the note sizing fields are not persisted: ' + line);
      const k = S.indexOf('const BREAKER_SLOT =');
      const slotLine = S.slice(k, S.indexOf('\\n', k));
      if (slotLine.indexOf('breakerNoteW') < 0 || slotLine.indexOf('breakerNoteFs') < 0) throw new Error('the note sizing fields have no breaker slots, so the sliders would do nothing on a breaker: ' + slotLine);
    });

    __check('EXACT REQUEST: the width and text-size sliders actually change the layout', () => {
      __reset();
      editorialContent.installNotes.keys = { aff: true, group: true, verify: true };
      const safeW = 920;
      const wideCol = _installNoteColW(safeW, { noteW: 1.5 });
      const narrowCol = _installNoteColW(safeW, { noteW: 0.6 });
      const baseCol = _installNoteColW(safeW, null);
      if (!(narrowCol < baseCol && baseCol < wideCol)) throw new Error('width multiplier did nothing: ' + [narrowCol, baseCol, wideCol].join(' / '));
      // A narrower column leaves the drawing more room — the whole point.
      if (!(narrowCol < 128)) throw new Error('the slider cannot go below the automatic floor, so it cannot buy the drawing any width: ' + narrowCol);
      // Text size scales the type, and the height follows it.
      const small = _installNoteBoxH(__doc(), baseCol, 10000, _installNoteFsScale({ noteFs: 0.7 }));
      const big = _installNoteBoxH(__doc(), baseCol, 10000, _installNoteFsScale({ noteFs: 1.4 }));
      if (!(small < big)) throw new Error('text size did nothing: ' + small + ' vs ' + big);
    });

    __check('the sliders are clamped, and junk values fall back to 100%', () => {
      [null, undefined, {}, { noteW: 'wide' }, { noteW: NaN }].forEach(c => {
        const w = _installNoteColW(920, c);
        if (!(w > 0) || !isFinite(w)) throw new Error(JSON.stringify(c) + ' gave a column width of ' + w);
      });
      if (_installNoteFsScale({ noteFs: 99 }) > IG_NOTE_SCALE_MAX) throw new Error('text size is not clamped up');
      if (_installNoteFsScale({ noteFs: 0.01 }) < IG_NOTE_SCALE_MIN) throw new Error('text size is not clamped down');
      if (_installNoteFsScale(null) !== 1) throw new Error('no config should read as 100%');
    });

    __check('a hand-set size still auto-shrinks rather than running off the page', () => {
      __reset();
      FRAME_INSTALL_NOTES.forEach(n => { editorialContent.installNotes.keys[n.key] = true; });
      const col = _installNoteColW(920, { noteW: 0.6 });   // narrow AND every note
      const h = _installNoteBoxH(__doc(), col, 480, _installNoteFsScale({ noteFs: 1.4 }));
      if (h > 480) throw new Error('a large hand-set size overflowed the page instead of shrinking: ' + h.toFixed(0));
    });

    __check('the note keys are stable, and every note has label + text', () => {
      // Renaming a key silently unticks it on every saved project.
      const keys = FRAME_INSTALL_NOTES.map(n => n.key);
      const expect = ['aff', 'group', 'spacing', 'verify', 'hardware', 'level', 'units'];
      if (keys.join(',') !== expect.join(',')) throw new Error('note keys changed: ' + keys.join(','));
      FRAME_INSTALL_NOTES.forEach(n => {
        if (!n.label) throw new Error(n.key + ' has no label for the tick list');
        if (typeof n.text !== 'function') throw new Error(n.key + ' text should be a function so live values stay live');
      });
    });

    __check('a malformed stored setting cannot break the page', () => {
      [null, undefined, 'nope', 42, [], { keys: 'x', custom: 9 }].forEach(v => {
        editorialContent.installNotes = v;
        let lines;
        try { lines = _installNoteLines(); } catch (e) { throw new Error(JSON.stringify(v) + ' threw: ' + e.message); }
        if (!Array.isArray(lines)) throw new Error(JSON.stringify(v) + ' gave ' + typeof lines);
      });
      __reset();
    });

    // Slice a function by its OWN extent. A landmark that happens to sit nearby is how a
    // check ends up reading an empty string and passing on nothing.
    const NLFN = String.fromCharCode(10) + 'function ';
    const fnBody = (name) => {
      const at = S.indexOf('function ' + name + '(');
      if (at < 0) throw new Error('missing function ' + name);
      const end = S.indexOf(NLFN, at + 1);
      return S.slice(at, end < 0 ? S.length : end);
    };

    // ── 17.72: THE NOTES PANEL IS A LIST, AN ADD BUTTON AND ONE EDITOR ───
    __check('a custom note is a ROW with its own tick, not a line in a textarea', () => {
      editorialContent.installNotes = { keys: {}, custom: 'first line\\nsecond line' };
      const list = _installNoteList();
      if (list.length !== 2) throw new Error('the old textarea did not migrate: ' + JSON.stringify(list));
      if (!list[0].id || !list[1].id) throw new Error('a migrated note has no id');
      if (!list[0].on) throw new Error('a migrated note came back unticked, so it would stop printing');
      if (list[0].text !== 'first line') throw new Error('text is ' + list[0].text);
    });

    __check('the legacy custom string stays a DERIVED mirror', () => {
      // The field is already in saved projects, so a file written here still prints in a
      // build that only knows the string - the same shape variationOf keeps.
      editorialContent.installNotes = { keys: {}, custom: 'a\\nb' };
      const list = _installNoteList();
      list[1].on = false;
      _installNoteSyncCustom();
      if (editorialContent.installNotes.custom !== 'a') throw new Error('mirror is ' + JSON.stringify(editorialContent.installNotes.custom));
      list.push({ id: 'x1', text: 'c', on: true });
      _installNoteSyncCustom();
      if (editorialContent.installNotes.custom !== 'a\\nc') throw new Error('mirror after add is ' + JSON.stringify(editorialContent.installNotes.custom));
    });

    __check('an unticked custom note stops printing but is NOT deleted', () => {
      editorialContent.installNotes = { keys: {}, custom: '' };
      const list = _installNoteList();
      list.push({ id: 'k1', text: 'do not break dry wall', on: true });
      if (_installNoteLines().indexOf('do not break dry wall') < 0) throw new Error('a ticked custom note did not print');
      list[0].on = false;
      if (_installNoteLines().indexOf('do not break dry wall') >= 0) throw new Error('an unticked note still prints');
      if (_installNoteList().length !== 1) throw new Error('unticking deleted the note');
    });

    __check('a STANDARD note can be reworded, and Reset gives the house wording back', () => {
      editorialContent.installNotes = { keys: {}, custom: '' };
      const note = FRAME_INSTALL_NOTES[0];
      editorialContent.installNotes.keys[note.key] = true;
      const houseText = note.text();
      if (_installNoteText(note) !== houseText) throw new Error('the built-in wording did not resolve');
      _installNoteEdits()[note.key] = 'Hang everything at 1500mm to centre.';
      if (_installNoteText(note) !== 'Hang everything at 1500mm to centre.') throw new Error('the override did not win');
      if (_installNoteLines()[0] !== 'Hang everything at 1500mm to centre.') throw new Error('the page still prints the built-in');
      delete _installNoteEdits()[note.key];
      if (_installNoteText(note) !== houseText) throw new Error('Reset did not restore the built-in');
    });

    __check('ONE resolver for a note wording, so the panel cannot disagree with the page', () => {
      // The panel shows the text on a help dot and the page prints it; two readings of
      // "which wording" is the trap the image code had.
      const lines = fnBody('_installNoteLines');
      if (lines.indexOf('_installNoteText(n)') < 0) throw new Error('the page does not use the resolver');
      const panel = fnBody('_dsInstallNotesInto');
      if (panel.indexOf('_installNoteText(note)') < 0) throw new Error('the panel does not use the resolver');
    });

    __check('the panel offers an add button and one editor, and selection is panel state', () => {
      const b = fnBody('_dsInstallNotesInto');
      if (b.indexOf('Add note') < 0) throw new Error('there is no add button');
      if (b.indexOf('_dsNoteSel') < 0) throw new Error('nothing tracks which note is selected');
      if (S.indexOf('let _dsNoteSel') < 0) throw new Error('the selection is not module state');
      if (S.indexOf('editorialContent.noteSel') >= 0) throw new Error('the selection was stored in the project');
      // A new note arrives selected, or adding one and hunting for where to type it is
      // two steps for one intention.
      if (b.indexOf("_dsNoteSel = 'c:' + r.id") < 0) throw new Error('a new note does not select itself');
    });

    __check('the tick and the label are SEPARATE targets', () => {
      // Choosing which note to read must never change what prints.
      const b = fnBody('_dsInstallNotesInto');
      if (b.indexOf('cb.onclick = (e) => e.stopPropagation();') < 0) throw new Error('clicking the tick also selects the row');
    });

    __check('no paragraph of help survives in this panel', () => {
      // Every one cost three or four lines and pushed the Layout buttons below the fold.
      // The WORDS are kept - they hang off a help dot - so this counts PARAGRAPH
      // ELEMENTS, not the strings. Searching for the strings matches the tooltips that
      // now carry them, which is the opposite of the thing being asserted.
      const b = fnBody('_dsInstallGuideControls');
      const paras = b.split("createElement('p')").length - 1;
      if (paras > 0) throw new Error(paras + ' help paragraph(s) still built in this panel');
      ['legNote', 'wNote', 'psNote', 'pNote'].forEach(v => {
        if (b.indexOf('const ' + v) >= 0) throw new Error('the ' + v + ' paragraph is back');
      });
      if (b.indexOf('secLbl(') < 0) throw new Error('secLbl is gone');
      if (b.indexOf('_dsHelpDot(') < 0) throw new Error('nothing in this panel uses a help dot');
    });

    __check('ONE button goes to the elevation, and it is the one that records a return', () => {
      const b = fnBody('_dsInstallGuideControls');
      if (b.indexOf('_dsJumpToElevation(desc)') < 0) throw new Error('the jump that records a return trip is gone');
      // The BUTTON, not the word: the comment explaining why the second one went still
      // names it, and matching prose is how a check asserts the opposite of its intent.
      if (b.indexOf('goB.textContent') >= 0) throw new Error('the second, return-less jump button is back');
      const raw = b.split("switchView('elevation'").length - 1;
      if (raw > 0) throw new Error(raw + ' raw switchView jumps in this panel; they leave no way back');
    });

    __check('Presentation layout sits ABOVE Page appearance on a breaker page', () => {
      // Appearance is still BUILT up front, because several branches return early and it
      // belongs to all of them; it is MOVED, not rebuilt.
      if (S.indexOf('function _dsMoveAppearanceAfter') < 0) throw new Error('nothing repositions the appearance section');
      const at = S.indexOf('if (desc._install && !desc._manual) {');
      if (at < 0) throw new Error('the breaker branch moved');
      const br = S.slice(at, at + 2400);
      if (br.indexOf('_dsMoveAppearanceAfter(t,') < 0) throw new Error('the breaker branch does not reposition it');
      const tools = fnBody('_dsRenderTools');
      if (tools.indexOf('_dsPageAppearanceInto(t, desc);') < 0) throw new Error('appearance is no longer built ahead of the branches');
    });

    // ── A STUB THAT SWALLOWS ITS ARGUMENTS PROVES NOTHING ────────────────
    // 17.71 gave the note an ink and read the colour as an ARRAY. _annHexToRgb returns
    // {r,g,b}, so setTextColor was handed undefined three times and the note printed in
    // nothing at all - on the page, in the PDF, everywhere. It was invisible to every
    // probe because the stubs all had an empty setTextColor: a no-op cannot notice it was
    // passed rubbish. Same family as the _round2 ReferenceError - a parse is not a
    // render, and a recording stub is not a renderer.
    __check('EXACT BUG: the note box never sets a colour channel to undefined or NaN', () => {
      const bad = [];
      const drawn = [];
      const doc = {
        setFont() {}, setFontSize() {}, setLineDashPattern() {},
        setTextColor() {
          const a = Array.prototype.slice.call(arguments);
          if (a.length !== 1 && a.length !== 3) bad.push('setTextColor arity ' + a.length);
          a.forEach((v, i) => {
            if (typeof v !== 'number' || !isFinite(v)) bad.push('setTextColor arg ' + i + ' = ' + String(v));
          });
        },
        text(t) { drawn.push(String(t)); },
        splitTextToSize(t, w) {
          const per = Math.max(8, Math.floor(w / 3.2)); const o = []; let str = t;
          while (str.length > per) { o.push(str.slice(0, per)); str = str.slice(per); }
          o.push(str); return o;
        }
      };
      editorialContent.installNotes = { keys: {}, custom: '' };
      editorialContent.installNotes.keys[FRAME_INSTALL_NOTES[0].key] = true;
      _drawInstallNoteBox(doc, 22, 240, 150, 240, 1, '#e00000');
      if (bad.length) throw new Error(bad.join('; '));
      if (!drawn.length) throw new Error('the note drew no text at all');
      if (drawn.indexOf('INSTALLATION NOTE') < 0) throw new Error('the heading never printed');
    });

    __check('the colour helpers speak the {r,g,b} shape _annHexToRgb returns', () => {
      const c = _annHexToRgb('#141414');
      if (typeof c.r !== 'number') throw new Error('_annHexToRgb no longer returns {r,g,b}');
      if (Array.isArray(c)) throw new Error('_annHexToRgb returns an array now; the note drawer indexes by key');
      const body = _installNoteBodyRgb(c);
      ['r', 'g', 'b'].forEach(k => {
        if (typeof body[k] !== 'number' || !isFinite(body[k])) throw new Error('_installNoteBodyRgb.' + k + ' = ' + body[k]);
      });
      // And lighter than the heading, which is the relationship it exists to keep.
      if (!(body.r > c.r)) throw new Error('the body did not lift off the heading');
    });

    __check('A NOTE INK IS NEVER WHITE, and a stored pale one falls back', () => {
      // White is the first swatch in FRAME_TEXT_INKS because type on a dark page needs
      // it. An install or breaker sheet is always white, so picking it there prints a
      // note nobody can see and nothing on the page says why.
      const inks = [];
      FRAME_NOTE_INKS.forEach(f => f.colors.forEach(c => inks.push(c.toLowerCase())));
      if (inks.indexOf('#ffffff') >= 0) throw new Error('the note palette still offers white');
      if (inks.indexOf('#e00000') < 0) throw new Error('the note palette lost red, which is what an urgent note is set in');
      // A project that picked white before the palette changed must not go on printing
      // nothing while the tick list insists the note is on.
      if (_installNoteInk('#ffffff') !== IG_NOTE_INK_DEFAULT) throw new Error('a stored white still resolves to white');
      if (_installNoteInk('#e00000') !== '#e00000') throw new Error('a real ink was rejected');
      if (_installNoteInk('#141414') !== '#141414') throw new Error('the default was rejected');
      const b = fnBody('_dsNoteSizeSliders');
      if (b.indexOf('FRAME_NOTE_INKS') < 0) throw new Error('the picker still offers the full text palette');
    });

    __check('the panel shows what the page will print', () => {
      // Three reports of "the notes are not showing up" came down to the panel having no
      // opinion: the tick list says a note is ON and the page was the only other place
      // that knew. Nothing in the chip means nothing prints.
      const b = fnBody('_dsInstallNotesInto');
      if (b.indexOf('_installNoteLines()') < 0) throw new Error('the panel does not resolve the printed lines');
      if (b.indexOf('Prints on the page') < 0) throw new Error('there is no preview of what prints');
      if (b.indexOf("background:#ffffff") < 0) throw new Error('the preview is not on white, so a pale ink would still look fine');
    });

    // ── 17.74: ONE WIDTH BUDGET, TWO WINDOWS ONTO IT ────────────────────
    __check('Column width and Elevation width are the SAME number from two ends', () => {
      const W = _igNominalContentW();
      const cfg = { legendW: 170 };
      const col = _igColW(cfg, W);
      const elev = _igElevW(cfg, W);
      if (Math.abs((col + elev + IG_COL_GUTTER) - W) > 0.01) throw new Error('the two do not add up to the content width: ' + col + ' + ' + elev + ' + ' + IG_COL_GUTTER + ' vs ' + W);
      // And writing through the elevation end lands back on the same column.
      const back = _igColWForElevW(elev, W);
      if (Math.abs(back - col) > 0.01) throw new Error('the round trip moved the column: ' + back + ' vs ' + col);
    });

    __check('THE FAIL-SAFE BINDS BOTH WAYS: neither side can starve the other', () => {
      const W = _igNominalContentW();
      // Push the column absurdly wide.
      const wide = _igColW({ legendW: 9999 }, W);
      if (wide > IG_COL_MAX) throw new Error('the column ran past its cap: ' + wide);
      const leftForElev = W - wide - IG_COL_GUTTER;
      if (leftForElev < W * IG_ELEV_MIN_FRAC - 0.01) throw new Error('the drawing was squeezed below its floor: ' + leftForElev + ' of ' + W);
      // Push it absurdly narrow.
      const thin = _igColW({ legendW: 1 }, W);
      if (thin < IG_COL_MIN) throw new Error('the column went under its floor: ' + thin);
      // And through the elevation slider, which writes the same stored number.
      const greedy = _igColWForElevW(W, W);
      if (greedy < IG_COL_MIN) throw new Error('dragging the elevation to full width starved the column: ' + greedy);
      const tiny = _igColWForElevW(0, W);
      if (tiny > IG_COL_MAX) throw new Error('dragging the elevation to nothing blew past the column cap: ' + tiny);
    });

    __check('a narrow page cannot produce a column wider than its own share', () => {
      // The cap is a FRACTION as well as a number, so a small page clamps before 340pt.
      const small = 400;
      const col = _igColW({ legendW: 340 }, small);
      if (col > small * (1 - IG_ELEV_MIN_FRAC) - IG_COL_GUTTER + 0.01) throw new Error('a narrow page let the column take ' + col + ' of ' + small);
      if (_igElevW({ legendW: 340 }, small) < small * IG_ELEV_MIN_FRAC - 0.01) throw new Error('the drawing lost its share on a narrow page');
    });

    __check('ONE stored number, so the two sliders cannot disagree', () => {
      const b = fnBody('_dsInstallGuideControls');
      if (b.indexOf("slider('Column width'") < 0) throw new Error('there is no column width slider');
      if (b.indexOf("slider('Elevation width'") < 0) throw new Error('there is no elevation width slider');
      // Both write legendW - a second stored field is how they start drifting.
      if (b.indexOf('commit({ legendW: _igColWForElevW(v, contentW) })') < 0) throw new Error('the elevation slider does not write the shared number');
      if (b.indexOf('elevW:') >= 0 || b.indexOf('breakerElevW') >= 0) throw new Error('a second width field was introduced');
    });

    __check('the note multiplier is offered for a RIGHT column only', () => {
      // On the left the notes share the legend's column, so the % slider sized a width
      // nothing read. An inert control beside a live one teaches that the panel is broken.
      const b = fnBody('_dsNoteSizeSliders');
      const at = b.indexOf("slider('Column width', 'noteW'");
      if (at < 0) throw new Error('the note width slider is gone entirely');
      if (b.slice(Math.max(0, at - 120), at).indexOf("cfg().noteSide !== 'left'") < 0) throw new Error('the note multiplier still shows on a left column');
    });

    // ── THE LEGEND SITS UNDER THE SUBHEADING ────────────────────────────
    __check('the legend has its OWN top, higher than the drawing area', () => {
      const b = fnBody('_drawInstallGuidePage');
      if (b.indexOf('const _igLegTop =') < 0) throw new Error('the legend still starts at the drawing top');
      if (b.indexOf('_igBand.sub + _subtitleClear()') < 0) throw new Error('the legend top is not measured off the subheading');
      // Both layout branches draw from it, or one of them keeps the old hole.
      const uses = b.split('drawLegendBlocks(M, _igLegTop').length - 1;
      if (uses !== 2) throw new Error(uses + ' branches draw the legend from its own top; expected 2');
      // And the notes follow it up, or they would overlap the legend that moved.
      if (b.indexOf('const ny = _igLegTop +') < 0) throw new Error('the notes did not follow the legend up');
    });

    __check('the legend steps OVER the item code when a page carries one', () => {
      const b = fnBody('_drawInstallGuidePage');
      if (b.indexOf('(_igCodeId ? 10 : 0)') < 0) throw new Error('the legend can print through the item code');
      // ONE code id, or the clearance and the drawn code disagree about whether there is one.
      if (b.indexOf('const codeId = _igCodeId;') < 0) throw new Error('the item code is resolved twice');
    });

    __check('the legend metrics are declared BEFORE the first thing that reads them', () => {
      // _igLegTop uses IG_LEG_TOP_GAP. A const declared further into the function is read
      // in the TDZ: the file parses, node --check passes, and every install and breaker
      // page throws on render. Third time this trap has been sprung in this file.
      // 17.96: they moved to MODULE scope, ahead of the function, because the shared
      // legend measure (_igLegendHeight) runs outside it. Same invariant, new place.
      const decl = S.indexOf('const IG_LEG_ROW_H');
      const use = S.indexOf('IG_LEG_TOP_GAP;', S.indexOf('function _drawInstallGuidePage('));
      if (decl < 0) throw new Error('the legend metrics are gone');
      if (!(decl < S.indexOf('function _drawInstallGuidePage('))) throw new Error('the legend metrics are not declared ahead of the page renderer');
      if (!(decl < use)) throw new Error('IG_LEG_TOP_GAP is read before it is declared');
    });

    // ── 17.75: THE ELEVATION WIDTH SLIDER HAD TO MEAN SOMETHING ─────────
    __check('EXACT BUG: a widescreen elevation is HEIGHT-bound, so width alone did nothing', () => {
      // fitIn takes the smaller of the two fits. On a 915x340 content area a 1.9-aspect
      // wall is already as wide as its height allows, so the slider only bit below about
      // 646pt and "make it bigger" did nothing at all. The drawing rises beside the title
      // now, which is the only place the extra height could come from.
      const b = fnBody('_drawInstallGuidePage');
      if (b.indexOf('const _igDrawTop = (left) =>') < 0) throw new Error('nothing decides whether the drawing may rise');
      const uses = b.split('_igDrawTop(ex0)').length - 1;
      if (uses !== 2) throw new Error(uses + ' layout branches ask; expected 2');
      // Both must FIT against the raised top, or one of them rises and stays small.
      if (b.indexOf('fitIn(aspect, SR.R - ex0, yBot - capH - eTop)') < 0) throw new Error('the elevation-only fit ignores the raised top');
      if (b.indexOf('fitIn(aspect, SR.R - ex0, (yBot - capH) - eTop)') < 0) throw new Error('the plan-variant fit ignores the raised top');
    });

    __check('it rises only when it MEASURABLY clears the title, never on an assumption', () => {
      // A wall name is user text with no length limit. Guessing from the column width
      // would print the drawing through a long heading.
      const b = fnBody('_drawInstallGuidePage');
      if (b.indexOf('_igTitleRight') < 0) throw new Error('the title block is not measured');
      if (b.indexOf('doc.getTextWidth((zone') < 0) throw new Error('the heading width is not measured');
      if (b.indexOf("doc.getTextWidth('ELEVATION DETAIL'") < 0) throw new Error('the subheading is not in the measurement');
      // …and it measures the SUBHEADING AS PRINTED. A catalogue page prints the layout
      // name beside it, and measuring the bare words would underestimate the title block
      // by exactly the part that grows with user text.
      if (b.indexOf('_catLayoutTag(arg)') < 0) throw new Error('the layout name is drawn but not measured');
      if (b.indexOf('_igCodeId + ') < 0) throw new Error('the item code is not in the measurement');
      if (b.indexOf('IG_TITLE_CLEAR') < 0) throw new Error('there is no gap between the title and the drawing');
      // And it degrades to the safe answer if anything throws while measuring.
      const at = b.indexOf('catch (e) { _igTitleRight = SR.R; }');
      if (at < 0) throw new Error('a failed measurement does not fall back to the safe full width');
    });

    // ── THE LEGEND FOLLOWS THE SPEC DUAL-UNIT SETTING ───────────────────
    __check('the legend prints dual units exactly as the spec pages beside it do', () => {
      const keepU = (typeof dashUnit !== 'undefined') ? dashUnit : 'in';
      const keepD = editorialContent.specDualUnit;
      dashUnit = 'in';
      editorialContent.specDualUnit = '';
      if (_igLegDimText(24, 24) !== '24 × 24 in') throw new Error('dual off: ' + _igLegDimText(24, 24));
      editorialContent.specDualUnit = 'mm';
      const mm = _igLegDimText(24, 24);
      if (mm.indexOf('609.6mm') < 0) throw new Error('dual mm did not print the companion: ' + mm);
      if (mm.indexOf('24') !== 0) throw new Error('INCHES must lead whatever the project stores: ' + mm);
      editorialContent.specDualUnit = 'cm';
      if (_igLegDimText(32, 18).indexOf('cm') < 0) throw new Error('dual cm did not print');
      // A missing or zero size stays an em dash rather than printing 0.
      editorialContent.specDualUnit = 'mm';
      if (_igLegDimText(0, 0) !== '—') throw new Error('an empty size printed a number');
      if (_igLegDimText(undefined, 10) !== '—') throw new Error('a missing size printed a number');
      dashUnit = keepU; editorialContent.specDualUnit = keepD;
    });

    __check('BOTH legend lines go through the one formatter', () => {
      // Overall dimensions and Art dimensions printed two different ways before: the
      // stored sizes raw, labelled with elevUnit rather than the dashUnit they are in.
      // 17.96: built once in _igLegVals, which the measure and the drawer both read.
      const b = fnBody('_igLegVals');
      if (fnBody('_drawInstallGuidePage').indexOf('_igLegVals(rr)') < 0) throw new Error('the drawer builds its own values');
      if (b.indexOf('const dims = _igLegDimText(rr.extW, rr.extH);') < 0) throw new Error('overall dimensions bypass the formatter');
      if (b.indexOf('_igLegDimText(_op.openW, _op.openH)') < 0) throw new Error('art dimensions bypass the formatter');
      if (b.indexOf("' ' + _u") >= 0) throw new Error('a hand-built unit suffix survives in the legend');
    });
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const all = window.__testResults || [];
  let failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
