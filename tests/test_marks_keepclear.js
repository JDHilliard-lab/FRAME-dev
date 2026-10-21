// 19.47, three tools for hangs that are not straightforward:
//  1. FREE LINES ("draw some additional lines freestyle in the elevation layout"): any
//     angle, arrowheads, dashed, a label, ends attached to frames / blocks / the wall,
//     printed as vectors (passthrough <svg>) with the label as a real text element.
//  2. KEEP CLEAR: a context block art must not cover; a frame over one is flagged on the
//     wall (never exported) and in Preflight.
//  3. THIS PAGE NOTES: a deck note can be left off one wall's page, and a wall can carry a
//     note of its own.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => {
      try { fn(); window.__testResults.push({ label, ok: true }); }
      catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); }
    };
    _autosaveToldUser = true;
    let __pushes = 0;
    scheduleAutosave = () => {}; pushHistory = () => { __pushes++; };
    const fr = (id, letter, x, y, w, h) => ({ id: id, letter: letter, x: x, y: y, w: w, h: h, active: true, dimTo: [] });
    const setup = () => {
      editorialContent = _editorialDefaults();
      editorialContent.installNotes = { keys: { aff: true, verify: true } };
      editorialContent.specDualUnit = '';
      elevUnit = 'in'; dashUnit = 'in';
      dashProjectData = [{ id: 'ART.1', product: 'Framed Art', extW: 30, extH: 30 }];
      elevations = [{ id: 'w1', name: 'ART.1 | Office', wallW: 160, wallH: 108, frames: [fr('ART.1', 'A', 60, 45, 30, 30)], contextBlocks: [] }];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      selectedMark = null; markToolActive = false; markFirstAnchor = null;
      try { drawElevAll(); } catch (e) {}
    };
    // Clicks at given wall inches (jsdom has no layout to measure).
    const clickAt = (x, y, opts) => { eventToElevInches = () => ({ x: x, y: y });
      handleMarkToolClick(Object.assign({ preventDefault() {}, stopPropagation() {}, shiftKey: false }, opts || {})); };
    const layer = () => document.getElementById('mark-layer');

    // ── 1. free lines ──
    __check('EXACT REQUEST: two clicks draw a line; the tool hands back to Select with it selected', () => {
      setup();
      toggleMarkTool(true);
      if (!document.getElementById('markToolBtn').classList.contains('active')) throw new Error('dock button not lit');
      clickAt(20, 95);                  // free point
      clickAt(60, 75);                  // the frame's top-left corner: an anchor
      const m = getElevMarks()[0];
      if (!m) throw new Error('no line stored');
      if (m.b.ref !== 'frame' || m.b.letter !== 'A') throw new Error('the end on the frame did not attach to it: ' + JSON.stringify(m.b));
      if (markToolActive) throw new Error('tool still armed after one line');
      if (selectedMark !== m.id) throw new Error('the new line is not selected');
      if (!layer().querySelector('.mark-pop .mark-pop-label')) throw new Error('no label box for the selected line');
    });
    __check('it renders as a vector passthrough with an arrowhead, and a real text label', () => {
      setup();
      elevations[0].marks = [{ id: 'm1', a: { ref: 'free', x: 20, y: 95 }, b: { ref: 'frame', letter: 'A', xc: 'x0', yc: 'y1' }, arrow: 'end', dash: true, label: 'ALIGN TO MULLION' }];
      drawElevAll();
      const pass = layer().querySelector('[data-mark-id="m1"] [data-svg-passthrough] svg');
      if (!pass) throw new Error('no passthrough svg');
      const lines = pass.querySelectorAll('line');
      if (lines.length !== 3) throw new Error('expected the stroke + 2 arrowhead legs, got ' + lines.length);
      if (!lines[0].getAttribute('stroke-dasharray')) throw new Error('dashed line has no dash');
      const ops = _elevAnnOps('<svg xmlns="http://www.w3.org/2000/svg">' + pass.innerHTML + '</svg>');
      if (ops.filter(o => o.t === 'line').length !== 3 || !ops[0].dash) throw new Error('the PDF reader does not see the lines: ' + JSON.stringify(ops));
      const lab = layer().querySelector('[data-mark-id="m1"] .mark-label');
      if (!lab || lab.textContent !== 'ALIGN TO MULLION') throw new Error('label missing');
      if (lab.closest('[data-export-skip]') || lab.closest('[data-svg-passthrough]')) throw new Error('the label must export as text, outside the passthrough');
      if (pass.querySelector('text')) throw new Error('an svg <text> would print twice');
    });
    __check('an end on a frame follows the frame when it moves', () => {
      setup();
      elevations[0].marks = [{ id: 'm1', a: { ref: 'free', x: 20, y: 95 }, b: { ref: 'frame', letter: 'A', xc: 'x0', yc: 'y1' }, arrow: 'end', dash: false, label: '' }];
      const before = resolveStoredAnchor(elevations[0].marks[0].b);
      elevFrames[0].x += 10;
      const after = resolveStoredAnchor(elevations[0].marks[0].b);
      if (Math.abs(after.x - before.x - 10) > 1e-9) throw new Error('did not follow: ' + before.x + ' -> ' + after.x);
    });
    __check('Shift locks a free end to 45 degrees', () => {
      setup();
      toggleMarkTool(true);
      clickAt(10, 10);
      clickAt(40, 38, { shiftKey: true });
      const m = getElevMarks()[0], pa = resolveStoredAnchor(m.a), pb = resolveStoredAnchor(m.b);
      if (Math.abs((pb.x - pa.x) - (pb.y - pa.y)) > 1e-6) throw new Error('not 45 degrees: ' + JSON.stringify([pa, pb]));
    });
    __check('settings write through, and Delete removes the line, not the frames', () => {
      setup();
      elevations[0].marks = [{ id: 'm1', a: { ref: 'free', x: 20, y: 95 }, b: { ref: 'free', x: 50, y: 95 }, arrow: 'end', dash: false, label: '' }];
      setMarkField('m1', 'arrow', 'both'); setMarkField('m1', 'dash', true); setMarkField('m1', 'label', '  Clear of switch  ');
      const m = getElevMarks()[0];
      if (m.arrow !== 'both' || m.dash !== true || m.label !== 'Clear of switch') throw new Error(JSON.stringify(m));
      selectedMark = 'm1'; elevFrames[0].selected = true;
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      if (getElevMarks().length) throw new Error('Delete left the line');
      if (!elevations[0].frames.length) throw new Error('Delete took the frame too');
    });
    __check('a zero-length click pair makes nothing', () => {
      setup(); toggleMarkTool(true); clickAt(30, 30); clickAt(30.1, 30);
      if (getElevMarks().length) throw new Error('made a dot');
    });
    __check('the layer is in both export lists and the capture crop', () => {
      const S = window.__src;
      const a = S.indexOf('const annotationLayers = [');
      if (S.slice(a, S.indexOf('];', a)).indexOf("'mark-layer'") < 0) throw new Error('not in annotationLayers (missing from the PDF)');
      const b = S.indexOf("'group-dim-layer','figure-dim-layer','glazing-dim-layer','context-layer'");
      if (S.slice(b, b + 200).indexOf("'mark-layer'") < 0) throw new Error('not in the artboard bounds (cropped off)');
      // 19.53: free lines are a GUIDE (All guides off hides them), so the crop takes them only
      // while they show, like every other guide.
      if (!_ELEV_GUIDE_LAYERS.some(g => g[0] === 'mark-layer')) throw new Error('free lines are not a guide');
      if (!('mark-layer' in _elevGuideVis())) throw new Error('pages cannot tell whether free lines show');
      if (_CAP_BASE_BOXES.indexOf('mark-layer') >= 0) throw new Error('hidden free lines would still widen the crop');
      if (CAT_WALL_DEEP.indexOf('marks') < 0) throw new Error('catalogue options would not mirror them');
    });

    // ── 2. keep clear ──
    __check('Keep clear items are keep-clear; an existing thermostat is not, until ticked', () => {
      setup();
      const kc = { id: 'k1', preset: 'kc-thermostat', x: 0, y: 0, w: 5, h: 5 };
      const old = { id: 'k2', preset: 'thermostat', x: 0, y: 0, w: 5, h: 5 };
      if (!_ctxAvoid(kc)) throw new Error('library keep-clear item is not');
      if (_ctxAvoid(old)) throw new Error('an existing Fixtures thermostat changed meaning');
      elevations[0].contextBlocks = [old];
      toggleContextAvoid(0);
      if (old.avoid !== true) throw new Error('toggle did not store');
      toggleContextAvoid(0);
      if ('avoid' in old) throw new Error('back to the default should store nothing');
    });
    __check('EXACT REQUEST: a frame over a keep-clear block is flagged on the wall and in Preflight', () => {
      setup();
      elevations[0].contextBlocks = [{ id: 'k1', preset: 'kc-switch', x: 62, y: 50, w: 3, h: 5, label: 'Switch' }];
      const c = _elevClashes(elevations[0]);
      if (c.length !== 1 || c[0].frame.id !== 'ART.1') throw new Error('clash not found: ' + c.length);
      drawElevAll();
      const box = layer().querySelector('.elev-clash');
      if (!box) throw new Error('no clash mark on the wall');
      if (!box.getAttribute('data-export-skip') || !box.getAttribute('data-html2canvas-ignore')) throw new Error('the clash mark would print');
      const it = _dsRunPreflight().find(x => /keep clear/.test(x.text));
      if (!it || it.sev !== 'warn' || !it.wall || it.wall.elevId !== 'w1') throw new Error('no Preflight warning with its wall: ' + JSON.stringify(it));
      // moved clear: gone
      elevations[0].contextBlocks[0].x = 100;
      if (_elevClashes(elevations[0]).length) throw new Error('still flagged after moving clear');
    });
    __check('a keep-clear block is hatched on the wall', () => {
      setup();
      elevations[0].contextBlocks = [{ id: 'k1', preset: 'kc-zone', x: 10, y: 10, w: 24, h: 24, label: 'Keep clear' }];
      drawElevAll();
      const el = document.querySelector('#context-layer .ctx-block');
      if (!el || !el.classList.contains('ctx-avoid')) throw new Error('no keep-clear class');
      if (!el.querySelector('.ctx-fill')) throw new Error('no hatch');
    });

    // ── 3. this page notes ──
    __check('EXACT REQUEST: a deck note can be left off one wall\\'s page, and a wall note prints there only', () => {
      setup();
      elevations.push({ id: 'w2', name: 'Other', wallW: 100, wallH: 108, frames: [fr('X', 'A', 30, 40, 20, 20)] });
      const verify = _installNoteText(FRAME_INSTALL_NOTES.find(n => n.key === 'verify'));
      elevations[0].notesOff = ['std:verify'];
      elevations[0].wallNote = 'Art sits on the shelf.\\nDo not fix to wall.';
      const here = _installNoteLines(elevations[0]), there = _installNoteLines(elevations[1]);
      if (here.indexOf(verify) >= 0) throw new Error('the note turned off here still prints');
      if (there.indexOf(verify) < 0) throw new Error('it went missing on another wall');
      if (here.slice(-2).join('|') !== 'Art sits on the shelf.|Do not fix to wall.') throw new Error('wall note: ' + JSON.stringify(here));
      if (there.join('|').indexOf('shelf') >= 0) throw new Error('the wall note leaked to another page');
    });
    __check('the This page panel writes through, and notes never recapture the drawing', () => {
      setup();
      const sig0 = _elevCaptureSignature();
      _dsClearBuiltAll = () => {}; _dsRenderTools = () => {}; _dsRefresh = () => {}; _dsPriorityRerender = () => {};
      const body = document.createElement('div');
      _dsInstallNotesInto(body, { kind: 'spec', _install: true, _elevIdx: 0, elev: elevations[0], _ovKey: 'elev:0' });
      const row = body.querySelector('[data-pgnote="std:verify"] input');
      if (!row) throw new Error('no This page row for a ticked deck note');
      row.checked = false; row.onchange();
      if (!(elevations[0].notesOff || []).includes('std:verify')) throw new Error('untick did not store');
      const ta = body.querySelector('[data-wall-note]');
      ta.value = 'Shelf mounted.'; ta.onchange();
      if (elevations[0].wallNote !== 'Shelf mounted.') throw new Error('wall note did not store');
      if (_elevCaptureSignature() !== sig0) throw new Error('a note changed the capture signature (every wall would recapture)');
    });
  `;

  try {
    window.eval('window.__src = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = window.__testResults || [];
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
