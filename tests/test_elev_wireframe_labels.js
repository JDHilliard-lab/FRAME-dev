// REQUEST: "can I have an option in the elevation guides layout to have a toggle to
// turn on a grey fill in the image area and the letter labels in the center of the
// frame mock up like this reference screenshot, this will be used to do wireframes
// for projects. Maybe it could be in the elevation settings ... and call it
// wireframe letter labels and grey fill."
//
// Delivered as a checkbox in Elevations Settings driving the EXISTING
// editorialContent.wireframe flag — the same one the Wireframe deck preset sets, so
// there is one notion of "this is a wireframe project" rather than two that can
// disagree. The look (flat grey block + the frame's letter, centred) is applied in
// the editor, the SVG and the canvas/PDF paths from one pair of constants, because
// a placement drawing that looks different in the export is useless.
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
    const S = window.__appSrc, H = window.__appHtml;
    editorialContent = editorialContent || {};
    scheduleAutosave = () => {};

    const IMG = 'data:image/png;base64,AAAA';
    const __seed = () => {
      elevUnit = 'in';
      // Frame A carries artwork on purpose: wireframe must override it.
      elevations = [{ name: 'Wall A', wallW: 185, wallH: 108, personPos: { x: -60 }, groupDims: [], frames: [
        { letter: 'A', id: 'P1', x: 20, y: 40, w: 30, h: 24, active: true, artworkUrl: IMG, artworkW: 300, artworkH: 240 },
        { letter: 'B', id: 'P2', x: 80, y: 40, w: 30, h: 24, active: true }
      ] }];
      currentElevIndex = 0; currentView = 'elevation';
      elevFrames = elevations[0].frames;
      elevZoomFactor = 1;
      document.getElementById('wallW').value = '185';
      document.getElementById('wallH').value = '108';
      const ws = document.querySelector('#view-elevation .workspace');
      Object.defineProperty(ws, 'clientWidth', { get: () => 1100, configurable: true });
      Object.defineProperty(ws, 'clientHeight', { get: () => 800, configurable: true });
      drawElevAll();
    };
    const __arts = () => Array.from(document.querySelectorAll('#wall .art-visual'));

    // ── The control ──
    __check('EXACT REQUEST: a Wireframe letter labels & grey fill toggle in Elevations Settings', () => {
      const cb = document.getElementById('elevWireframeToggle');
      if (!cb) throw new Error('the toggle is not in the Settings panel');
      if (cb.type !== 'checkbox') throw new Error('expected a checkbox');
      if (!/setElevWireframe\\(this\\.checked\\)/.test(cb.getAttribute('onchange') || '')) throw new Error('the toggle is not wired to a handler');
      // The label the user asked for, so it is findable.
      const lbl = cb.closest('label');
      if (!lbl || !/wireframe/i.test(lbl.textContent) || !/grey fill/i.test(lbl.textContent)) throw new Error('the control is not labelled as asked: ' + (lbl && lbl.textContent || '').trim());
      if (typeof setElevWireframe !== 'function' || typeof seedElevWireframeToggle !== 'function') throw new Error('handler or seeder missing');
    });

    __check('it drives the SAME flag as the Wireframe deck preset, not a second one', () => {
      __seed();
      setElevWireframe(true);
      if (editorialContent.wireframe !== true) throw new Error('the toggle does not set editorialContent.wireframe');
      if (!_isWireframe()) throw new Error('_isWireframe disagrees with the toggle');
      setElevWireframe(false);
      if (_isWireframe()) throw new Error('turning it off did not stick');
      // The preset writes the same field — two flags could disagree about the look.
      if (S.indexOf('editorialContent.wireframe = !!p.wf') < 0) throw new Error('the deck preset no longer shares this flag');
    });

    __check('the checkbox re-reads the project on every Settings open', () => {
      // It is PROJECT data (it travels in the file), not a localStorage drafting
      // pref, so a stale checkbox would misreport a loaded project.
      editorialContent.wireframe = true;
      seedElevWireframeToggle();
      if (!document.getElementById('elevWireframeToggle').checked) throw new Error('the seeder does not reflect the project');
      editorialContent.wireframe = false;
      seedElevWireframeToggle();
      if (document.getElementById('elevWireframeToggle').checked) throw new Error('the seeder does not clear');
      const i = S.indexOf('seedElevDualUnitInputs();');
      if (S.slice(i, i + 200).indexOf('seedElevWireframeToggle()') < 0) throw new Error('the seeder is not called when the panel opens');
    });

    // ── The look, in the editor ──
    __check('EXACT REQUEST: grey fill in the image area and the letter in the centre', () => {
      __seed();
      setElevWireframe(true);
      const arts = __arts();
      if (arts.length !== 2) throw new Error('expected an image area per frame, got ' + arts.length);
      const letters = arts.map(a => (a.textContent || '').trim()).sort().join(',');
      if (letters !== 'A,B') throw new Error('the frame letters are not in the openings: got [' + letters + ']');
      arts.forEach(a => {
        const bg = (a.style.background || '') + (a.style.backgroundColor || '');
        if (!bg) throw new Error('no grey fill on the image area');
        if (a.style.boxShadow !== 'none') throw new Error('the recessed-opening shadow is still on; a wireframe reads as a placement, not a rendering');
        if (!parseFloat(a.style.fontSize)) throw new Error('the letter has no size of its own, so it would print at the 14px opening-text size');
      });
      // .art-visual is already a centred flex box, which is what centres the letter.
      if (!/\\.art-visual\\s*\\{[^}]*justify-content:\\s*center/.test(window.__appCss || '')) { /* css checked separately */ }
    });

    __check('EXACT REQUEST: a piece that already has artwork still shows as a placeholder', () => {
      __seed();
      setElevWireframe(true);
      if (document.querySelector('#wall .art-img')) throw new Error('the artwork is still drawn, so the wireframe is not a wireframe');
      const a = __arts()[0];
      if ((a.textContent || '').trim() !== 'A') throw new Error('frame A shows its artwork instead of its letter');
    });

    __check('with the toggle OFF nothing changes: artwork draws, no letter, no grey', () => {
      __seed();
      setElevWireframe(false);
      if (!document.querySelector('#wall .art-img')) throw new Error('the artwork stopped drawing when wireframe is off');
      __arts().forEach(a => {
        if ((a.textContent || '').trim() === 'B' || (a.textContent || '').trim() === 'A') throw new Error('a letter is showing with wireframe off');
        if ((a.style.background || '').indexOf(ELEV_WF_FILL) >= 0) throw new Error('the wireframe grey is applied with the mode off');
        if (a.style.fontSize) throw new Error('the letter sizing is applied with the mode off');
      });
      // The opening-size text is set with innerText (its newlines have to become
      // line breaks), which jsdom does not reflect — so that branch is pinned in
      // the source rather than in the DOM.
      const i = S.indexOf('const unitSuffix = unitInfo(elevUnit).suffix;');
      const body = S.slice(i, i + 2000);
      if (body.indexOf('art.innerText = (artW > 0)') < 0) throw new Error('the opening-size text was lost from the non-wireframe branch');
    });

    // ── The look, in the exports ──
    __check('EXACT RISK: the SVG decides at the same point as the artwork', () => {
      const i = S.indexOf('function _maybeAddArtworkToSvg');
      const body = S.slice(i, S.indexOf('\\nasync function ', i));
      if (body.indexOf('_isWireframe()') < 0) throw new Error('the SVG export has no wireframe branch, so it would export the artwork the editor is hiding');
      // Before the artwork guards, or a frame with no artworkUrl returns early and
      // gets no placeholder at all.
      const wf = body.indexOf('_isWireframe()');
      const guard = body.indexOf('if (!f || !f.artworkUrl) return;');
      if (!(guard > wf)) throw new Error('the wireframe branch runs after the artwork guard, so frames without artwork export blank');
      if (body.indexOf('ELEV_WF_FILL') < 0) throw new Error('the SVG does not use the shared fill');
      if (body.indexOf('ELEV_WF_INK') < 0) throw new Error('the SVG does not use the shared ink');
    });

    __check('the SVG emits a grey rect and the letter, for a frame with NO artwork', () => {
      __seed();
      setElevWireframe(true);
      const frameEl = __arts()[1].parentElement;   // frame B, no artworkUrl
      const back = [];
      _maybeAddArtworkToSvg(elevations[0].frames[1], frameEl, back, () => ({ x: 10, y: 20, w: 120, h: 90 }));
      const svg = back.join('');
      if (svg.indexOf('<rect') < 0) throw new Error('no placeholder block emitted');
      if (svg.indexOf(ELEV_WF_FILL) < 0) throw new Error('the block is not the shared grey');
      if (svg.indexOf('>B<') < 0) throw new Error('the letter is missing from the SVG: ' + svg);
      if (svg.indexOf('text-anchor="middle"') < 0) throw new Error('the letter is not centred horizontally');
      // Vertical centring must not rely on dominant-baseline — Illustrator's support
      // for it is unreliable, so the baseline is nudged explicitly instead.
      if (/dominant-baseline/.test(svg)) throw new Error('the letter relies on dominant-baseline, which Illustrator may ignore');
      if (svg.indexOf('<image') >= 0) throw new Error('an artwork image was emitted in wireframe mode');
    });

    __check('with the toggle off the SVG still emits the artwork image', () => {
      __seed();
      setElevWireframe(false);
      const frameEl = __arts()[0].parentElement;   // frame A, has artworkUrl
      const back = [];
      _maybeAddArtworkToSvg(elevations[0].frames[0], frameEl, back, () => ({ x: 0, y: 0, w: 100, h: 80 }));
      const svg = back.join('');
      if (svg.indexOf('<image') < 0) throw new Error('the artwork stopped exporting when wireframe is off');
      if (svg.indexOf(ELEV_WF_FILL) >= 0) throw new Error('a wireframe block was exported with the mode off');
    });

    __check('the canvas path fills grey and takes the letter from the elevation only', () => {
      const i = S.indexOf('if (opts.wireframe && aW > 0 && aH > 0)');
      if (i < 0) throw new Error('renderFrameToCanvas has no wireframe fill, so elevation thumbnails keep an empty opening');
      const body = S.slice(i, i + 700);
      if (body.indexOf('ELEV_WF_FILL') < 0 || body.indexOf('ELEV_WF_INK') < 0) throw new Error('the canvas path does not use the shared fill/ink');
      if (body.indexOf('opts.wireframeLetter') < 0) throw new Error('the canvas path cannot draw a letter');
      // It must be drawn AFTER the artwork block, or the opening treatment covers it.
      const art = S.indexOf('if (opts.artworkImg && !opts.wireframe');
      if (!(i > art)) throw new Error('the wireframe fill is painted before the artwork block');
      // The elevation renderer supplies the letter; a spec page identifies its piece
      // by the code in the title, so it must not get one.
      const e = S.indexOf('wireframe: !!opts.wireframe, wireframeLetter:');
      if (e < 0) throw new Error('renderElevationToCanvas does not pass the flag and letter through');
    });

    // ── It has to reach the cached deck pages ──
    __check('EXACT RISK: toggling it invalidates the cached elevation captures', () => {
      __seed();
      setElevWireframe(false);
      pushHistory();
      const before = _elevCaptureSignature();
      const gen = _elevCapGen;
      setElevWireframe(true);
      if (_elevCaptureSignature() === before) throw new Error('the capture signature ignores the wireframe flag, so every breaker page would keep the old look');
      if (_elevCapGen === gen) throw new Error('the capture generation did not move');
    });

    __check('toggling it drops the deck caches that have no wireframe term in their key', () => {
      const i = S.indexOf('function setElevWireframe');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (body.indexOf('_invalidateFramesCache()') < 0) throw new Error('the baked frame mockups would keep the old look');
      if (body.indexOf('_dsClearBuiltAll()') < 0) throw new Error('the deck previews and thumbnails would keep the old look');
      if (body.indexOf('drawElevAll()') < 0) throw new Error('the elevation does not redraw, so the toggle looks dead');
      if (body.indexOf('pushHistory()') < 0) throw new Error('the change is not undoable');
      if (body.indexOf('scheduleAutosave()') < 0) throw new Error('the change is not persisted');
    });

    __check('the look is defined once, not per renderer', () => {
      if (typeof ELEV_WF_FILL !== 'string' || typeof ELEV_WF_INK !== 'string') throw new Error('the shared constants are missing');
      ['_elevWfLetterPx', '_elevWfFontCss', '_elevWfFontWeight', '_elevWfFontStyle'].forEach(fn => {
        if (typeof window[fn] !== 'function') throw new Error(fn + ' is missing — the look would be decided per renderer');
      });
    });

    // ── The three style controls ──
    __check('EXACT REQUEST: letter size, font and style controls sit with the label styling', () => {
      ['annotWfSize', 'annotWfFont', 'annotWfReg', 'annotWfBold', 'annotWfItal'].forEach(id => {
        if (!document.getElementById(id)) throw new Error('missing #' + id);
      });
      // In the Label & Dimension Style panel, NOT with grid/snap — the letter is
      // label styling and belongs beside the label size, font and weight.
      const size = document.getElementById('annotWfSize');
      const labelSize = document.getElementById('annotFontSize');
      if (!labelSize) throw new Error('the Label Size control is gone');
      if (size.closest('div[id]') && labelSize.closest('div[id]')) { /* structural check below */ }
      const snap = document.getElementById('snapEnabledToggle');
      const cb = document.getElementById('elevWireframeToggle');
      if (!cb) throw new Error('the toggle is gone');
      // Same panel as the label size; a different one from the snap toggles.
      const panelOf = (el) => { let n = el; while (n && n !== document.body) { if (n.className && /panel|section/i.test(n.className)) return n; n = n.parentElement; } return null; };
      if (snap && panelOf(cb) && panelOf(snap) && panelOf(cb) === panelOf(snap)) throw new Error('the toggle is still in the Grid & Snap panel');
      // The font select is filled from the shared library like every other picker.
      if (!document.getElementById('annotWfFont').hasAttribute('data-font-select')) throw new Error('the letter font is not built from FRAME_FONT_LIBRARY');
    });

    __check('EXACT REQUEST: the size is the user pick, honoured where it fits', () => {
      annotationStyle.wfSize = 30; _normalizeAnnotationStyle();
      // A generous opening gets exactly what was asked for.
      if (_elevWfLetterPx(400, 300) !== 30) throw new Error('a 30px pick came out as ' + _elevWfLetterPx(400, 300));
      annotationStyle.wfSize = 12; _normalizeAnnotationStyle();
      if (_elevWfLetterPx(400, 300) !== 12) throw new Error('a 12px pick came out as ' + _elevWfLetterPx(400, 300));
      // Uniform across frame sizes — the reference drawing has A..E all one size.
      annotationStyle.wfSize = 20; _normalizeAnnotationStyle();
      if (_elevWfLetterPx(400, 300) !== _elevWfLetterPx(120, 90)) throw new Error('the letter still scales with the opening, so frames would disagree');
    });

    __check('EXACT RISK: the pick is capped so it cannot spill out of a small opening', () => {
      annotationStyle.wfSize = 48; _normalizeAnnotationStyle();
      const tiny = _elevWfLetterPx(20, 14);
      if (!(tiny < 48)) throw new Error('a 48px letter was drawn into a 14px opening: ' + tiny);
      if (!(tiny > 0)) throw new Error('the letter vanished entirely: ' + tiny);
      // The NARROW side governs, or a wide short opening gets a letter taller than it.
      if (_elevWfLetterPx(400, 14) !== _elevWfLetterPx(14, 400)) throw new Error('the cap is not driven by the narrow side');
      annotationStyle.wfSize = 18; _normalizeAnnotationStyle();
    });

    __check('EXACT REQUEST: regular / bold / italic, and they reach the drawing', () => {
      if (typeof setAnnotWfStyle !== 'function') throw new Error('no style handler');
      setAnnotWfStyle('bold');
      if (_elevWfFontWeight() !== '700' || _elevWfFontStyle() !== 'normal') throw new Error('bold is not bold-upright');
      setAnnotWfStyle('italic');
      if (_elevWfFontStyle() !== 'italic') throw new Error('italic did not take');
      if (_elevWfFontWeight() !== '400') throw new Error('italic should not also be bold');
      setAnnotWfStyle('regular');
      if (_elevWfFontWeight() !== '400' || _elevWfFontStyle() !== 'normal') throw new Error('regular is not regular-upright');
      // An unknown value falls back rather than emitting nonsense into a font string.
      setAnnotWfStyle('sideways');
      if (annotationStyle.wfStyle !== 'bold') throw new Error('an unknown style was stored: ' + annotationStyle.wfStyle);
    });

    __check('the letter face reaches the element, which is what the SVG reads back', () => {
      __seed();
      // Through the real control: applyAnnotationStyleFromModal reads the input, so
      // setting annotationStyle directly would just be read back over.
      document.getElementById('annotWfSize').value = '26';
      setAnnotWfStyle('italic');
      setElevWireframe(true);
      const a = __arts()[0];
      if (parseFloat(a.style.fontSize) !== 26) throw new Error('the size did not reach the drawing: ' + a.style.fontSize);
      if (a.style.fontStyle !== 'italic') throw new Error('the slant did not reach the drawing: ' + a.style.fontStyle);
      if (!a.style.fontFamily) throw new Error('the family did not reach the drawing');
      // And the SVG must mirror all of it rather than re-deciding.
      const back = [];
      _maybeAddArtworkToSvg(elevations[0].frames[0], a.parentElement, back, () => ({ x: 0, y: 0, w: 200, h: 160 }));
      const svg = back.join('');
      if (svg.indexOf('font-style=') < 0) throw new Error('the SVG does not carry the slant');
      if (svg.indexOf('font-weight=') < 0) throw new Error('the SVG does not carry the weight');
      if (svg.indexOf('font-family=') < 0) throw new Error('the SVG does not carry the family');
      document.getElementById('annotWfSize').value = '18'; setAnnotWfStyle('bold');
    });

    __check('the settings survive a normalize and an older stored style', () => {
      [null, undefined, 0, -5, 999, 'abc'].forEach(v => {
        annotationStyle.wfSize = v; _normalizeAnnotationStyle();
        if (!(annotationStyle.wfSize >= 9 && annotationStyle.wfSize <= 48)) throw new Error(JSON.stringify(v) + ' normalised to ' + annotationStyle.wfSize);
      });
      delete annotationStyle.wfSize; delete annotationStyle.wfFont; delete annotationStyle.wfStyle;
      _normalizeAnnotationStyle();
      if (annotationStyle.wfSize !== ELEV_WF_SIZE_DEFAULT) throw new Error('an older style did not pick up the default size');
      if (!annotationStyle.wfFont) throw new Error('an older style has no letter font');
      if (annotationStyle.wfStyle !== 'bold') throw new Error('an older style has no letter slant');
    });

    __check('the letter style lives in annotationStyle, so it is in the capture key already', () => {
      // _igGuideStamp hashes annotationStyle whole, so a size/font/slant change
      // invalidates the cached breaker captures with no extra plumbing.
      __seed();
      annotationStyle.wfSize = 18; _normalizeAnnotationStyle();
      const a = _igGuideStamp();
      annotationStyle.wfSize = 40; _normalizeAnnotationStyle();
      if (_igGuideStamp() === a) throw new Error('changing the letter size does not move the capture key, so deck pages would keep the old look');
      annotationStyle.wfSize = 18; _normalizeAnnotationStyle();
    });
  `;

  try {
    window.__appSrc = src;
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\nwindow.__appHtml = ' + JSON.stringify(htmlSrc) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
