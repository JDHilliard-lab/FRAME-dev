// 19.45, from a coworker's mark-ups on the Ford Salt Lake City install guide:
//  1. "the artwork is on a shelf and higher than the 57" ... my installation notes are
//     conflicting" / "DONT NEED THIS DIM": hang height is turned off PER WALL, and the
//     install note on that wall stops telling the installer to centre at 57".
//  2. "CENTER PIECE OVER CREDENZA": a dashed centre line through a context block
//     (CL CREDENZA) replaces the wall centre line, and the note says to centre on it.
//  3. Spec-page elevation thumbnails were missing the context blocks the breaker shows.
//  4. Group A/B/C artwork anchors RIGHT, on the elevation thumbnail's right edge.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // A recording no-op context: every call is logged, every read returns something callable.
  window.__calls = [];
  const mkCtx = () => new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s || '').length * 5 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      return (...a) => { window.__calls.push([k, a]); };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  window.HTMLCanvasElement.prototype.getContext = function () { return this.__ctx || (this.__ctx = mkCtx()); };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __check = (label, fn) => {
      __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true }))
        .catch(e => ({ label, ok: false, err: e.message })));
      window.__asyncChecks.push(__chain);
    };
    _autosaveToldUser = true;
    scheduleAutosave = () => {}; pushHistory = () => {};
    _loadImg = () => Promise.reject(new Error('no images in test'));

    const fr = (id, letter, x, y, w, h) => ({ id: id, letter: letter, x: x, y: y, w: w, h: h, active: true, dimTo: [] });
    const setup = () => {
      editorialContent = _editorialDefaults();
      editorialContent.installNotes = { keys: { aff: true, group: true, verify: true } };
      editorialContent.specDualUnit = '';
      elevUnit = 'in'; dashUnit = 'in';
      dashProjectData = [{ id: 'ART.25', product: 'Framed Art', extW: 25, extH: 32 }];
      elevations = [{ id: 'w25', name: 'ART.25 | Office 152', wallW: 160, wallH: 108,
        frames: [fr('ART.25', 'A', 112, 45, 25, 32)],
        contextBlocks: [{ id: 'cb1', x: 107, y: 0, w: 52, h: 31, label: 'Credenza' }] }];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
    };
    const guides = () => { drawElevGuides(160, 108); return document.getElementById('guide-layer'); };

    // ── 1. hang height per wall ──
    __check('EXACT BUG: hang height off on THIS wall drops the hang line, the AFF dim and the target', () => {
      setup();
      let g = guides();
      if (!g.querySelector('.hang-guide') || !g.querySelector('.floor-hang-dim')) throw new Error('fixture: no hang guide to start with');
      setElevHangGuide(false);
      g = guides();
      if (g.querySelector('.hang-guide')) throw new Error('hang line still drawn');
      if (g.querySelector('.floor-hang-dim')) throw new Error('57" AFF dimension still drawn (the "DONT NEED THIS DIM")');
      if (g.querySelector('[data-svg-passthrough]')) throw new Error('target still drawn');
      if (!g.querySelector('.center-guide')) throw new Error('the wall centre line went with it');
      setElevHangGuide(true);
      if (!guides().querySelector('.hang-guide')) throw new Error('turning it back on did not restore it');
      if ('hangGuide' in elevations[0]) throw new Error('the default should leave nothing stored');
    });
    __check('another wall keeps its hang height', () => {
      setup();
      elevations.push({ id: 'w2', name: 'Other', wallW: 120, wallH: 108, frames: [fr('X', 'A', 40, 40, 20, 20)] });
      setElevHangGuide(false);
      currentElevIndex = 1;
      if (!guides().querySelector('.hang-guide')) throw new Error('turning it off on one wall hid it on another');
    });

    // ── 2. centre line through a context block ──
    __check('EXACT BUG: a CL through the credenza replaces the wall CL, labelled CL CREDENZA', () => {
      setup();
      toggleContextCL(0);
      const g = guides();
      const cls = g.querySelectorAll('.center-guide');
      if (cls.length !== 1) throw new Error('expected only the credenza CL, got ' + cls.length + ' centre lines');
      const c = cls[0];
      if (!c.classList.contains('ctx-cl-guide')) throw new Error('the wall CL is still the one drawn');
      if (Math.abs(parseFloat(c.style.left) - (107 + 26) * elevScale) > 0.01) throw new Error('not through the credenza centre: ' + c.style.left);
      if (c.textContent !== 'CL CREDENZA') throw new Error('label: ' + c.textContent);
      if (c.getAttribute('data-svg-dash') !== '1' || c.getAttribute('data-svg-pen') !== 'line') throw new Error('not exported as a dashed stroke');
      setElevWallCL(true);
      if (guides().querySelectorAll('.center-guide').length !== 2) throw new Error('wall CL back on should draw both');
    });

    // ── notes follow the wall ──
    __check('EXACT BUG: the install note stops saying 57" on a wall hung to the credenza, and says what governs', () => {
      setup();
      const plain = _installNoteLines(elevations[0]).join(' | ');
      if (plain.indexOf('Align the centre of all artwork') < 0) throw new Error('fixture: aff note missing: ' + plain);
      setElevHangGuide(false); toggleContextCL(0);
      const n = _installNoteLines(elevations[0]);
      const t = n.join(' | ');
      if (t.indexOf('Align the centre of all artwork') >= 0) throw new Error('the conflicting 57" note still prints: ' + t);
      if (t.indexOf('Align the geometric centre of the whole group to the hang height') >= 0) throw new Error('the group hang-height note still prints');
      if (t.indexOf('dimensions shown on this elevation') < 0) throw new Error('no replacement height note: ' + t);
      if (t.indexOf('Centre the artwork on the credenza, on the line marked CL CREDENZA, not on the wall centre.') < 0) throw new Error('no CL note: ' + t);
      if (t.indexOf('Confirm all wall dimensions on site') < 0) throw new Error('an unrelated note was lost');
      // the breaker hands the drawer a COPY of the wall; the flags must survive the copy
      const copy = Object.assign({}, elevations[0], { name: 'ART.25' });
      if (_installNoteLines(copy).join(' | ') !== t) throw new Error('a breaker copy reads differently');
      // No wall = the deck-wide list, unchanged
      if (_installNoteLines().join(' | ') !== plain) throw new Error('the panel list changed');
    });
    __check('the Guides tab shows THIS WALL with both switches and a chip per block', () => {
      setup();
      _elevWallGuidesSync();
      const box = document.getElementById('elevWallGuides');
      if (!box.querySelector('[data-ewg=hang]') || !box.querySelector('[data-ewg=wallcl]')) throw new Error('switches missing');
      const chip = box.querySelector('[data-ewg-cl="0"]');
      if (!chip || chip.textContent !== 'Credenza') throw new Error('no Credenza chip');
      chip.onclick ? chip.onclick() : window.eval('toggleContextCL(0)');
      if (!elevations[0].contextBlocks[0].cl) throw new Error('chip did not set the CL');
    });

    // ── 3. thumbnails draw the context blocks ──
    __check('EXACT BUG: the spec-page elevation thumbnail draws the credenza', async () => {
      setup();
      elevations[0].frames[0].active = false;   // frames are not what this checks
      window.__calls.length = 0;
      const er = await renderElevationToCanvas(elevations[0], null, { dpi: 10 });
      if (!er) throw new Error('no render');
      // wall at 10 ppi; padIn 6, person default x = -20in -> left extra 26in
      const left = 26 * 10, floor = (6 + 108) * 10;
      const hit = window.__calls.find(c => c[0] === 'fillRect' && Math.abs(c[1][0] - (left + 1070)) < 0.01
        && Math.abs(c[1][1] - (floor - 310)) < 0.01 && Math.abs(c[1][2] - 520) < 0.01 && Math.abs(c[1][3] - 310) < 0.01);
      if (!hit) throw new Error('no fill for the credenza block; fillRects: ' + JSON.stringify(window.__calls.filter(c => c[0] === 'fillRect').map(c => c[1])));
      const lab = window.__calls.find(c => c[0] === 'fillText' && c[1][0] === 'CREDENZA');
      if (!lab) throw new Error('label not drawn');
    });

    // ── 4. Group A/B/C right anchor ──
    __check('Group A/B/C: the artwork right edge is the same line whatever the group width', async () => {
      const rights = [];
      for (const w of [20, 60]) {
        setup();
        editorialContent.specTemplate = 'setLegend';
        dashProjectData = [{ id: 'ART.9A', product: 'Framed Art', extW: w, extH: 30 }, { id: 'ART.9B', product: 'Framed Art', extW: w, extH: 30 }];
        elevations = [{ id: 'w9', name: 'ART.9', wallW: 300, wallH: 108, frames: [fr('ART.9A', 'A', 40, 40, w, 30), fr('ART.9B', 'B', 44 + w, 40, w, 30)] }];
        const rects = [];
        const real = _specArtRectAdd;
        _specArtRectAdd = (id, x, y, bw, bh) => rects.push(x + bw);
        try {
          const unit = { rep: dashProjectData[0], members: dashProjectData, key: 'ART.9' };
          await _drawSpecSetPage(new CanvasPdfRec(936, 540), {}, 3, {}, unit, 'setLegend', { PW: 936, PH: 540, M: 40 });
        } finally { _specArtRectAdd = real; }
        if (!rects.length) throw new Error('no artwork placed');
        rights.push(Math.max.apply(null, rects));
      }
      if (Math.abs(rights[0] - rights[1]) > 0.5) throw new Error('right edges differ: ' + rights.join(' vs ') + ' (centred, not right-anchored)');
    });
  `;

  try {
    window.eval(src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = await Promise.all(window.__asyncChecks || []);
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
