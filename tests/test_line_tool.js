// The line tool, and the drags around it (18.21).
//
// Asked for: hold Shift to draw a straight line, drop the curved arrow ("it does
// not work and I cannot see a designer using it"), and improve the other tools.
// Pinned here:
//   - ONE constraint (_dsLineConstrain) serves drawing AND the end-handle drag,
//     and the draw tool applies it in the preview AND the commit;
//   - Shift locks to 0/45/90 in PIXELS, not in page fractions (a page is 936x540);
//   - the curve is gone from the menu but a saved curve still draws;
//   - Esc mid-draw drops the line and keeps the tool;
//   - every drag in the annotation layer leaves an undo step, and a plain click
//     leaves none;
//   - a new box never lands exactly on the previous one.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const results = [];
  const check = (label, fn) => { try { fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };
  const bodyOf = (a, b) => {
    const i = src.indexOf(a); if (i < 0) throw new Error('landmark missing: ' + a);
    const j = src.indexOf(b, i + a.length); if (j < 0) throw new Error(b + ' does not follow ' + a);
    return src.slice(i, j);
  };

  // ── source: the draw tool and the handle drag both go through the one rule
  check('the draw tool constrains the PREVIEW and the COMMIT through one endAt()', () => {
    const d = bodyOf('const straight = (shapeKind', 'function _dsAddArtDetail(');
    if (d.indexOf('_dsLineConstrain(') < 0) throw new Error('draw tool does not use the shared constraint');
    const mv = d.indexOf('const mv = (ev) =>'), up = d.indexOf('const up = (ev) =>');
    if (mv < 0 || up < 0) throw new Error('draw handlers not found');
    if (d.slice(mv, d.indexOf('};', mv)).indexOf('endAt(ev)') < 0) throw new Error('the preview is not constrained');
    if (d.slice(up).indexOf('endAt(ev)') < 0) throw new Error('the commit is not constrained: the line drawn differs from the line shown');
  });
  check('the end-handle drag uses the same constraint, not a private copy', () => {
    const d = bodyOf("[['x1', 'y1', 0], ['x2', 'y2', 1]].forEach", 'svg.appendChild(c);');
    if (d.indexOf('_dsLineConstrain(') < 0) throw new Error('handle drag has its own rule again');
    if (d.indexOf('ang < 6 || ang > 174') >= 0) throw new Error('the old inline snap is back');
  });
  check('Esc during a draw drops the line and is not passed on to disarm the tool', () => {
    const d = bodyOf('const straight = (shapeKind', 'function _dsAddArtDetail(');
    const k = d.indexOf('const onKey');
    if (k < 0) throw new Error('no Esc handler on the draw');
    const ks = d.slice(k, d.indexOf('};', k));
    if (ks.indexOf('stopImmediatePropagation') < 0) throw new Error('Esc also reaches the disarm listener');
    if (ks.indexOf('cancelled = true') < 0) throw new Error('mouseup after Esc would still add the line');
    if (d.indexOf("addEventListener('keydown', onKey, true)") < 0) throw new Error('Esc handler is never attached, or not in the capture phase');
  });
  check('an armed drawing layer sits above every object on the page', () => {
    // Found in Chrome, not jsdom: a line started on another line's end grabbed its
    // handle. Annotations stack at 100 + z, z defaulting to 5000 and growing with
    // bring-to-front, so the layer must clear any plausible z.
    if (src.indexOf("z-index:500;';") >= 0) throw new Error('a draw layer is back at z 500, under the annotations');
    const n = src.split("cursor:crosshair; z-index:' + DS_DRAW_LAYER_Z").length - 1;
    if (n !== 2) throw new Error('expected both draw layers (straight and multi-point) on DS_DRAW_LAYER_Z, found ' + n);
    const i = src.indexOf('const DS_DRAW_LAYER_Z = ');
    const v = parseInt(src.slice(i + 24, i + 40), 10);
    if (!(v >= 1000000)) throw new Error('DS_DRAW_LAYER_Z is too low: ' + v);
  });
  check('every drag in the annotation layer leaves an undo step', () => {
    const a = src.indexOf('function _dsRenderAnnots('), b = src.indexOf('function _dsAddArtDetail(');
    const zones = [src.slice(a, b), bodyOf('function _dsShapePanDown(', '\nfunction '), bodyOf('function _dsAnnHandles(', '\nfunction ')];
    const missing = [];
    zones.forEach((z, zi) => {
      let i = 0;
      while ((i = z.indexOf('const up = ', i)) >= 0) {
        const body = z.slice(i, z.indexOf("addEventListener('mouseup', up)", i));
        if (body.indexOf('pushHistory') < 0 && body.indexOf('_dsDragDone(') < 0) missing.push(zi + ':' + z.slice(Math.max(0, i - 120), i).split('\n').pop().trim().slice(0, 50));
        i += 10;
      }
    });
    if (missing.length) throw new Error(missing.length + ' mouseup(s) push no history: ' + missing.join(' | '));
  });

  const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ measureText:()=>({width:6}), scale(){}, fillRect(){}, drawImage(){}, fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'x';
  window.fetch = () => Promise.reject(new Error('none'));
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const W = 936, H = 540;
    const near = (a, b) => Math.abs(a - b) < 1e-6;

    __check('Shift locks a nearly-level line to exactly level', () => {
      const p = _dsLineConstrain(0.2, 0.5, 0.6, 0.53, W, H, { shiftKey: true });
      if (p.y !== 0.5) throw new Error('y drifted: ' + p.y);
    });
    __check('Shift locks a nearly-plumb line to exactly plumb', () => {
      const p = _dsLineConstrain(0.5, 0.2, 0.52, 0.7, W, H, { shiftKey: true });
      if (p.x !== 0.5) throw new Error('x drifted: ' + p.x);
    });
    __check('Shift 45 degrees is 45 on PAPER, not in page fractions', () => {
      // (0.1, 0.1) from the origin is 93.6 x 54 px: about 30 degrees, which locks to 45.
      const p = _dsLineConstrain(0, 0, 0.1, 0.1, W, H, { shiftKey: true });
      const dx = p.x * W, dy = p.y * H;
      if (!near(dx, dy)) throw new Error('not 45 degrees on the page: ' + dx.toFixed(2) + ' x ' + dy.toFixed(2));
      if (near(p.x, p.y)) throw new Error('locked in fractions, which is a shallower line on paper');
    });
    __check('the end follows the pointer ALONG the locked axis (projection, not distance)', () => {
      const p = _dsLineConstrain(0.2, 0.5, 0.7, 0.52, W, H, { shiftKey: true });
      if (!near(p.x, 0.7)) throw new Error('x should follow the pointer: ' + p.x);
    });
    __check('without Shift, a line within 6 degrees of level settles onto it; Alt and steeper lines are left alone', () => {
      const lvl = _dsLineConstrain(0.2, 0.5, 0.6, 0.5 + Math.tan(4 * Math.PI / 180) * (0.4 * W) / H, W, H, {});
      if (lvl.y !== 0.5) throw new Error('4 degrees did not settle level');
      const alt = _dsLineConstrain(0.2, 0.5, 0.6, 0.51, W, H, { altKey: true });
      if (alt.y !== 0.51) throw new Error('Alt did not bypass the settling');
      const steep = _dsLineConstrain(0.2, 0.5, 0.6, 0.6, W, H, {});
      if (steep.y !== 0.6 || steep.x !== 0.6) throw new Error('a deliberate angle was moved');
    });
    __check('the readout is paper convention: rising to the right reads positive', () => {
      const a = _dsLineAngle(0, 0.5, 0.3, 0.5 - 0.3 * W / H, W, H);
      if (a !== 45) throw new Error('expected 45, got ' + a);
      if (_dsLineAngle(0.2, 0.5, 0.6, 0.5, W, H) !== 0) throw new Error('level is not 0');
    });
    __check('the curved arrow is off the menu, but a saved curve still draws', () => {
      if (_DS_LINE_TOOLS.some(t => t[0] === 'curve')) throw new Error('curve still offered');
      const pts = _arrowPathPoints({ type: 'curve', bend: 0.7 }, 0, 0, 100, 0);
      if (pts.length < 10) throw new Error('an existing curve no longer renders as a curve');
    });

    __check('_dsDragDone pushes for a real change and NOT for a plain click', () => {
      let n = 0; const real = pushHistory; pushHistory = () => n++;
      const a = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
      const s0 = _dsGeoSig(a); _dsDragDone(s0, a);
      if (n) throw new Error('a click with no movement made an undo step');
      a.x = 0.15; _dsDragDone(s0, a);
      if (n !== 1) throw new Error('a move made no undo step');
      const b = { type: 'shape', zoom: 1, panX: 0 }; const s1 = _dsGeoSig(b); b.panX = 0.3; _dsDragDone(s1, b);
      if (n !== 2) throw new Error('a pan made no undo step');
      pushHistory = real;
    });

    __check('pressing T twice gives two boxes, not one hidden under the other', () => {
      scheduleAutosave = () => {}; pushHistory = () => {}; _dsRenderRail = () => {}; _dsSelectAnnot = () => {};
      _dsActiveTab = 'pages'; _dsPages = [{ kind: 'spec' }]; _dsIndex = 0; _deckPageKey = () => 'spec:L1';
      editorialContent.annotations = {};
      _dsAddTextBox(); _dsAddTextBox(); _dsAddShape('rect'); _dsAddShape('rect');
      const l = editorialContent.annotations['spec:L1'];
      if (l.length !== 4) throw new Error('expected 4 items, got ' + l.length);
      if (l[0].x === l[1].x && l[0].y === l[1].y) throw new Error('two text boxes on one spot');
      if (l[2].x === l[3].x && l[2].y === l[3].y) throw new Error('two shapes on one spot');
      if (l[0].x !== 0.1 || l[0].y !== 0.12) throw new Error('the FIRST box moved from its usual spot');
    });
  `;
  try { window.eval(src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = results.concat(window.__testResults || []);
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
