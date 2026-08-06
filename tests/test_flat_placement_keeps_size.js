// REPORTED BUG: "my WF resets out of nowhere to 400" x 104"".
//
// 400 x 104 was the wall (400 x 108) minus its 4" baseboard, so this was never a
// random reset — it was fitFlatGraphicToWall firing on placement. Both placement
// paths (Push to Wall, and Add & Arrange's bulk import) called it for ANY flat
// graphic on ANY wall, and that function rewrites `row.extW`/`row.extH` as well as
// the frame. So a size typed in the dashboard was silently replaced by the wall size,
// and because the ROW had been overwritten there was nothing left to restore it from.
//
// Two conditions were missing, both in _shouldAutoFitFlat:
//   • the wall must be in EGD WALL MODE — that mode means "this wall IS the graphic",
//     while a plain wall carries no such promise and a typed size is a real instruction;
//   • the product must be WALLCOVERING — window film is sized to the GLASS, never to
//     the wall (WF-3 is TBD x 14"H, WF-4/WF-5 are privacy bands), so filling a wall
//     with film is wrong even in EGD wall mode.
//
// The Fit to wall BUTTON is deliberately untouched: asked for explicitly, it still
// fills whatever is selected. The bug was never that filling exists, it was that
// placement did it uninvited.
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
    const S = window.__appSrc;
    scheduleAutosave = () => {}; pushHistory = () => {};

    // The reported wall, to the inch: 400 x 108 with a 4" baseboard.
    const seed = (egd) => {
      elevUnit = 'in'; dashUnit = 'in'; elevBaseboardIn = 4;
      elevations = [{ name: 'LOBBY', wallW: 400, wallH: 108, frames: [], personPos: { x: -60 },
        groupDims: [], customLines: [], egdWall: !!egd }];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      return elevations[0];
    };
    const mk = (product, w, h) => ({ id: 'WF-1', product: product, extW: w, extH: h });

    __check('EXACT BUG: placing window film keeps the size that was typed', () => {
      const el = seed(true);                     // even in EGD wall mode
      const f = mk('Window Film (WF)', 202, 82);
      if (_shouldAutoFitFlat(el, f)) throw new Error('window film would still be filled to the wall');
    });

    __check('EXACT BUG: the 400 x 104 the user saw is the wall minus its baseboard', () => {
      // Pinning the arithmetic so the symptom stays recognisable if this ever returns.
      const el = seed(true);
      const f = { id: 'WF-1', product: 'Wallcovering (EGD)', w: 202, h: 82, x: 0, y: 4 };
      dashProjectData = [{ id: 'WF-1', product: 'Wallcovering (EGD)', extW: 202, extH: 82 }];
      fitFlatGraphicToWall(el, f);
      if (f.w !== 400 || f.h !== 104) throw new Error('fit produced ' + f.w + ' x ' + f.h + ', not the reported 400 x 104');
      // And it rewrites the ROW — which is why the typed size could not come back.
      if (dashProjectData[0].extW !== 400 || dashProjectData[0].extH !== 104) {
        throw new Error('fit no longer mirrors onto the row; the rest of this file assumes it does');
      }
    });

    __check('a plain wall never auto-fills, whatever the product', () => {
      const el = seed(false);
      if (_shouldAutoFitFlat(el, mk('Wallcovering (EGD)', 96, 48))) throw new Error('a wallcovering filled a plain wall');
      if (_shouldAutoFitFlat(el, mk('Window Film (WF)', 96, 48))) throw new Error('window film filled a plain wall');
    });

    __check('an EGD wall still auto-fills a WALLCOVERING — the mode must keep working', () => {
      // "This wall IS the graphic" is the whole point of the mode; breaking it would
      // trade one bug for another.
      const el = seed(true);
      if (!_shouldAutoFitFlat(el, mk('Wallcovering (EGD)', 96, 48))) throw new Error('EGD wall mode stopped filling wallcovering');
    });

    __check('framed art is never in scope, and junk does not throw', () => {
      const el = seed(true);
      if (_shouldAutoFitFlat(el, mk('Framed Art', 24, 30))) throw new Error('framed art was treated as a flat graphic');
      if (_shouldAutoFitFlat(el, null)) throw new Error('a null frame claimed a fit');
      if (_shouldAutoFitFlat(null, mk('Wallcovering (EGD)', 96, 48))) throw new Error('a null elevation claimed a fit');
    });

    __check('BOTH placement paths go through the gate, not just one', () => {
      // Push to Wall and Add & Arrange's bulk import each had their own copy of the
      // auto-fit, so fixing one would have left the other resetting sizes.
      const push = S.indexOf('function pushFrameToElevation');
      const bulk = S.indexOf('function importSelectedFramesBulk');
      if (push < 0 || bulk < 0) throw new Error('could not find both placement paths');
      if (S.slice(push, push + 6000).indexOf('_shouldAutoFitFlat(') < 0) throw new Error('Push to Wall still fills unconditionally');
      if (S.slice(bulk, bulk + 6000).indexOf('_shouldAutoFitFlat(') < 0) throw new Error('bulk import still fills unconditionally');
      // The old unconditional test must be gone from both.
      if (S.indexOf('if (_isFlatGraphic(newFrame.product)) fitFlatGraphicToWall(') >= 0) throw new Error('the unconditional bulk-import fill is back');
      if (S.indexOf('if (_isFlatGraphic(f.product)) {\\n        const _newF') >= 0) throw new Error('the unconditional push fill is back');
    });

    __check('the Fit to wall BUTTON is untouched — explicit still means explicit', () => {
      // The bug was uninvited filling, not filling itself.
      const i = S.indexOf('function fitFlatGraphicsToWallAction');
      if (i < 0) throw new Error('the Fit action is gone');
      const body = S.slice(i, i + 1200);
      if (body.indexOf('_shouldAutoFitFlat') >= 0) throw new Error('the explicit button now refuses to fit');
      if (body.indexOf('fitFlatGraphicToWall(elev, f)') < 0) throw new Error('the button no longer fits anything');
    });

    __check('a non-filled flat graphic advances the placement queue like any other item', () => {
      // The bulk importer skipped startX for flat graphics because they filled the wall.
      // One that no longer fills has to take its turn, or two of them stack at x=0.
      const bulk = S.indexOf('function importSelectedFramesBulk');
      const body = S.slice(bulk, bulk + 6000);
      const g = body.indexOf('_shouldAutoFitFlat(');
      if (body.slice(g, g + 220).indexOf('else startX += (newFrame.w + 5);') < 0) {
        throw new Error('a graphic that is not filled does not advance startX, so they overlap');
      }
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
