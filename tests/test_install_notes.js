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
      const footers = (body.match(/_drawPdfFooter\\(/g) || []).length;
      if (footers > 1 && (body.match(/_drawInstallNoteBox\\(/g) || []).length !== 1) throw new Error('the box should be drawn exactly once, up front — not repeated per exit');
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
      if (body.indexOf('variants: false') < 0) throw new Error('a breaker is always elevation-only, so the layout variants should be hidden');
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
