// Wall context: the client's elevation faded in behind the wall as a tracing guide,
// and the CONTEXT BLOCKS traced off it — doors, windows, millwork, a TV. Two features,
// one workflow, and one contract that decides whether this ships correctly:
//
//   THE UNDERLAY NEVER EXPORTS. THE BLOCKS ALWAYS DO.
//
// That split has to hold in THREE places, because there are three renderers and none
// of them shares a list with the others:
//   1. exportElevSVG walks `annotationLayers` — '#context-layer' is deliberately NOT
//      in it, because annotation is written OVER the rasterised artwork and a door
//      printed on top of the piece beside it is the wrong drawing. Blocks are emitted
//      into the SVG's BACK layer instead, ahead of the frames.
//   2. the artboard-bounds list gets '#context-layer' (a millwork run continues past
//      the corner and must not be cropped) and never '#underlay-layer' (an unaligned
//      client drawing would silently resize every exported elevation).
//   3. exportElevPNG rasterises the LIVE DOM through html2canvas, which reads neither
//      list, so it hides '#underlay-layer' outright.
// Miss any one and the tracing guide ships to the client, or the context vanishes.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  // The tracer that produced the five bed drawings. Read here rather than inside the
  // eval, which has no `require`, for the same reason app.js and index.html are.
  const toolSrc = fs.readFileSync(path.join(root, 'tools', 'trace-cad-svg.js'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const S = window.__appSrc, H = window.__indexHtml, C = window.__css, T = window.__toolSrc;
    scheduleAutosave = () => {};

    const seed = (opts) => {
      opts = opts || {};
      elevUnit = 'in'; dashUnit = 'in';
      elevations = [{ name: 'Lobby', wallW: 240, wallH: 108, frames: [], personPos: { x: -60 },
        contextBlocks: opts.blocks || [], underlay: opts.underlay }];
      if (!opts.underlay) delete elevations[0].underlay;
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      elevZoomFactor = 1;
      const wwEl = document.getElementById('wallW'), whEl = document.getElementById('wallH');
      if (wwEl) wwEl.value = '240'; if (whEl) whEl.value = '108';
      const ws = document.querySelector('#view-elevation .workspace');
      if (ws) { Object.defineProperty(ws, 'clientWidth', { get: () => 1100, configurable: true });
                Object.defineProperty(ws, 'clientHeight', { get: () => 800, configurable: true }); }
      return elevations[0];
    };

    // ── The model ───────────────────────────────────────────────────────────
    __check('an elevation with no context is not broken by asking, and is not written to', () => {
      const e = seed();
      if (_elevContextBlocks(e).length !== 0) throw new Error('a fresh wall should have no blocks');
      // Lazily created like glazing / customLines, so an older project loads clean.
      if (!Array.isArray(e.contextBlocks)) throw new Error('the array was not created on demand');
      if (_elevContextBlocks(null).length !== 0) throw new Error('null elevation blew up');
      // The UNDERLAY reader must NOT seed. Merely asking whether a wall has one used to
      // be the kind of thing that writes an empty object into the project, and from
      // there into every autosave and every undo snapshot.
      const e2 = seed();
      if (_elevUnderlay(e2) !== null) throw new Error('a wall with no client elevation should read null');
      if ('underlay' in e2) throw new Error('asking created an underlay key on the elevation');
      if (_elevUnderlay({ underlay: { src: '' } }) !== null) throw new Error('an empty src should read as no underlay');
      if (_elevUnderlay(null) !== null) throw new Error('null elevation blew up');
    });

    __check('the fade is clamped away from BOTH ends, where it stops meaning anything', () => {
      // 0 is indistinguishable from having no underlay ("nothing happened"), and 1 is
      // indistinguishable from real drawing content.
      if (_underlayOpacity({ opacity: 0 }) < 0.05) throw new Error('a 0 fade was allowed through');
      if (_underlayOpacity({ opacity: 1 }) > 0.95) throw new Error('a fully opaque underlay was allowed through');
      if (_underlayOpacity({ opacity: -5 }) < 0.05) throw new Error('a negative fade was not clamped');
      if (_underlayOpacity({}) !== UNDERLAY_DEFAULT_OPACITY) throw new Error('a missing fade should default');
      if (_underlayOpacity({ opacity: 'abc' }) !== UNDERLAY_DEFAULT_OPACITY) throw new Error('junk should default, not NaN');
      if (Math.abs(_underlayOpacity({ opacity: 0.4 }) - 0.4) > 1e-9) throw new Error('a real value was altered');
    });

    // ── Units ───────────────────────────────────────────────────────────────
    __check('EXACT RISK: context converts with the wall, the underlay included', () => {
      // These fields are not in the hand-maintained frame allowlists, so without their
      // own conversion a cm project draws a door in the wrong PLACE — worse than a wrong
      // number, because art gets hung against it. And an unconverted underlay slides out
      // from under everything traced off it.
      const e = { contextBlocks: [{ x: 10, y: 0, w: 36, h: 84, label: 'Door' }],
                  underlay: { src: 'data:image/png;base64,AA', x: 5, y: 2, w: 240, h: 108, opacity: 0.4 } };
      _scaleElevContext(e, 2.54);
      const b = e.contextBlocks[0];
      if (Math.abs(b.x - 25.4) > 0.001) throw new Error('block x did not convert: ' + b.x);
      if (Math.abs(b.w - 91.44) > 0.001) throw new Error('block w did not convert: ' + b.w);
      if (Math.abs(b.h - 213.36) > 0.001) throw new Error('block h did not convert: ' + b.h);
      if (b.label !== 'Door') throw new Error('the label was mangled by a unit change');
      const u = e.underlay;
      if (Math.abs(u.x - 12.7) > 0.001) throw new Error('underlay x did not convert: ' + u.x);
      if (Math.abs(u.w - 609.6) > 0.001) throw new Error('underlay w did not convert: ' + u.w);
      if (Math.abs(u.h - 274.32) > 0.001) throw new Error('underlay h did not convert: ' + u.h);
      // src and opacity are not dimensions and must survive untouched — a converted
      // opacity would fade the guide out completely on the first unit toggle.
      if (u.src !== 'data:image/png;base64,AA') throw new Error('the image src was scaled');
      if (u.opacity !== 0.4) throw new Error('the fade was scaled as if it were a dimension');
      // Junk must not blow up either conversion site mid-load.
      _scaleElevContext({ contextBlocks: [null] }, 2);
      _scaleElevContext(null, 2);
      _scaleElevContext({}, 0);
    });

    __check('BOTH conversion sites call it — project load AND the unit toggle', () => {
      // Wiring one and not the other is the exact shape of the bug this guards: it looks
      // right until someone opens an inches project in cm, or toggles the unit.
      const lm = S.indexOf('function loadMasterProject');
      if (lm < 0) throw new Error('could not find loadMasterProject');
      if (S.slice(lm, lm + 9000).indexOf('_scaleElevContext(elev, f)') < 0) {
        throw new Error('project load does not convert wall context');
      }
      const su = S.indexOf('function setUnit(');
      if (su < 0) throw new Error('could not find setUnit');
      if (S.slice(su, su + 4000).indexOf('_scaleElevContext(elev, f)') < 0) {
        throw new Error('the unit toggle does not convert wall context');
      }
    });

    // ── Rendering ───────────────────────────────────────────────────────────
    __check('blocks render into #context-layer, bottom-left in wall coords like a frame', () => {
      const e = seed({ blocks: [{ x: 24, y: 0, w: 36, h: 84, label: 'Door' }] });
      drawElevAll();
      const layer = document.getElementById('context-layer');
      if (!layer) throw new Error('#context-layer is missing from index.html');
      const els = layer.querySelectorAll('.ctx-block');
      if (els.length !== 1) throw new Error('expected one block, drew ' + els.length);
      const el = els[0];
      // y is measured UP from the floor and the layer's y grows DOWN, the same flip
      // renderGroupDims does. A door at y=0, 84 high, on a 108 wall tops out at 24.
      if (Math.abs(parseFloat(el.style.left) - 24 * elevScale) > 0.5) throw new Error('left is wrong: ' + el.style.left);
      if (Math.abs(parseFloat(el.style.top) - 24 * elevScale) > 0.5) throw new Error('top did not flip y: ' + el.style.top);
      if (Math.abs(parseFloat(el.style.width) - 36 * elevScale) > 0.5) throw new Error('width is wrong');
      if (Math.abs(parseFloat(el.style.height) - 84 * elevScale) > 0.5) throw new Error('height is wrong');
      // The layer is rebuilt each pass, not appended to — drawElevAll runs on every
      // mousemove of a drag, so a missing clear piles up thousands of blocks.
      drawElevAll(); drawElevAll();
      if (layer.querySelectorAll('.ctx-block').length !== 1) throw new Error('the layer is not cleared between redraws');
    });

    __check('a zero-size or junk block is skipped rather than drawn as a hairline', () => {
      seed({ blocks: [{ x: 0, y: 0, w: 0, h: 84 }, { x: 0, y: 0, w: 36, h: 0 }, { x: 0, y: 0, w: 'x', h: 'y' }] });
      drawElevAll();
      if (document.getElementById('context-layer').querySelectorAll('.ctx-block').length !== 0) {
        throw new Error('a degenerate block was drawn');
      }
    });

    __check('the label is DROPPED when the block is too small to hold it', () => {
      // Dynamic behaviour over a control that can produce broken output: a label that
      // does not fit is not a label, and shrinking it to nothing or spilling it over the
      // neighbours are both worse than omitting it.
      seed({ blocks: [{ x: 0, y: 0, w: 36, h: 84, label: 'Door' }, { x: 100, y: 0, w: 1, h: 1, label: 'Tiny' }] });
      drawElevAll();
      const els = document.getElementById('context-layer').querySelectorAll('.ctx-block');
      if (!els[0].querySelector('.ctx-label')) throw new Error('a full-size door lost its label');
      if (els[1].querySelector('.ctx-label')) throw new Error('a 1-inch block was given a label it cannot hold');
      // An unlabelled block still draws — it is a shape on the wall, not a caption.
      seed({ blocks: [{ x: 0, y: 0, w: 36, h: 84, label: '' }] });
      drawElevAll();
      const bare = document.getElementById('context-layer').querySelectorAll('.ctx-block');
      if (bare.length !== 1) throw new Error('an unlabelled block did not draw');
      if (bare[0].querySelector('.ctx-label')) throw new Error('an empty label produced an empty caption element');
    });

    __check('the underlay renders faded, and vanishes with the image rather than lingering', () => {
      seed({ underlay: { src: 'data:image/png;base64,AA', x: 0, y: 0, w: 240, h: 108, opacity: 0.25 } });
      drawElevAll();
      const layer = document.getElementById('underlay-layer');
      if (!layer) throw new Error('#underlay-layer is missing from index.html');
      const img = layer.querySelector('img');
      if (!img) throw new Error('the client elevation did not render');
      if (Math.abs(parseFloat(img.style.opacity) - 0.25) > 1e-6) throw new Error('the fade was not applied: ' + img.style.opacity);
      // It must never intercept a drag meant for the drawing on top of it.
      if (img.style.pointerEvents !== 'none') throw new Error('the guide can swallow clicks');
      // Removing it must clear the layer, not leave the last image behind.
      removeElevUnderlay();
      if (document.getElementById('underlay-layer').querySelector('img')) throw new Error('the image survived removal');
      if ('underlay' in elevations[0]) throw new Error('the underlay key survived removal');
    });

    __check('the underlay is under the grid; context stands IN FRONT of the wall surface', () => {
      // The stack IS the feature: tracing guide at the back, then the wall and everything
      // ON it, then the objects standing in front of it.
      // CHANGED (16.82): context moved from 3 (under the art) to 8 (over it). A block is
      // opaque now and a thing in the room, so it hides what is behind it — which is how
      // you see which part of a wallcovering graphic a headboard is going to cover.
      const z = (id) => { const m = new RegExp('id="' + id + '"[^>]*z-index:(\\\\d+)').exec(H); return m ? parseInt(m[1], 10) : null; };
      const ul = z('underlay-layer'), grid = z('grid-layer'), ctx = z('context-layer'),
            fr = z('frame-layer'), gz = z('glazing-layer');
      if (ul === null || grid === null || ctx === null || fr === null || gz === null) throw new Error('could not read the layer z-indexes');
      if (!(ul < grid)) throw new Error('the tracing guide (' + ul + ') is not under the grid (' + grid + ')');
      if (!(ctx > grid)) throw new Error('context (' + ctx + ') is not over the grid (' + grid + ')');
      if (!(ctx > fr)) throw new Error('context (' + ctx + ') is not over the art (' + fr + '), so it cannot mask a graphic');
      // Mullions stay on top of context, and NOT as a preference: #glazing-layer is an
      // annotation layer, so the export draws it over everything rasterised whatever the
      // screen does. At 7 — under the blocks — a window traced as context covered its own
      // mullions on screen while the PDF still drew them on top.
      const annList = S.slice(S.indexOf('const annotationLayers = ['), S.indexOf('];', S.indexOf('const annotationLayers = [')));
      if (annList.indexOf('glazing-layer') >= 0 && !(gz > ctx)) {
        throw new Error('glazing (' + gz + ') is under context (' + ctx + ') on screen but over it in the export');
      }
    });

    // ── The export contract ─────────────────────────────────────────────────
    __check('EXACT RISK: the tracing guide is in NONE of the three export paths', () => {
      // 1. the SVG's annotation walk
      const ai = S.indexOf('const annotationLayers = [');
      const annList = S.slice(ai, S.indexOf('];', ai));
      if (annList.indexOf('underlay-layer') >= 0) throw new Error('the underlay is in annotationLayers, so it prints');
      // 2. the artboard-bounds list — an unaligned oversized drawing would resize every
      //    exported elevation on the wall.
      const bi = S.indexOf("['frame-layer','arch-dim-layer','dim-layer','floor-ceiling-layer'");
      if (bi < 0) throw new Error('could not find the artboard-bounds list');
      const boundsList = S.slice(bi, S.indexOf('].forEach', bi));
      if (boundsList.indexOf('underlay-layer') >= 0) throw new Error('the underlay can expand the artboard');
      // 3. html2canvas reads neither list, so the PNG path must hide the layer itself —
      //    and restore it, or the guide is gone for the rest of the session.
      const pi = S.indexOf('async function exportElevPNG');
      const png = S.slice(pi, S.indexOf('\\nasync function', pi + 10) + 1 || S.length);
      if (png.indexOf("getElementById('underlay-layer')") < 0) {
        throw new Error('exportElevPNG does not hide the underlay, so it lands in the PNG and every PDF elevation');
      }
      if (png.indexOf('_ulLayer.style.display = _ulDisp') < 0) {
        throw new Error('exportElevPNG hides the underlay and never puts it back');
      }
      // The renderer also marks it export-skip, so anything that later learns to walk
      // this layer still has to honour the flag emitEl already checks.
      const ri = S.indexOf('function renderElevUnderlay');
      if (S.slice(ri, ri + 2000).indexOf("data-export-skip") < 0) throw new Error('the underlay image is not marked export-skip');
    });

    __check('EXACT RISK: context blocks reach the PDF, and OVER the art so they mask it', () => {
      // CHANGED (16.82): blocks are opaque and occlude, so they are emitted LAST in the
      // back layer instead of first. A bed masks the wallcovering it stands in front of,
      // which is the point of the fill — see the CONTEXT_FILL check below.
      //
      // They are still kept OUT of annotationLayers, but the reason is now mechanical
      // rather than a z-order one: that list is replayed into the PDF as parsed vector
      // ops (_elevAnnOps), which understand rect / line / text and would silently drop
      // the nested <svg> of line art every library block carries.
      const ai = S.indexOf('const annotationLayers = [');
      const annList = S.slice(ai, S.indexOf('];', ai));
      if (annList.indexOf('context-layer') >= 0) {
        throw new Error('#context-layer is in annotationLayers, so its line art is dropped from the PDF');
      }
      // Anchored on the emission block's own heading, NOT on the selector: the baseboard
      // occlusion pass below queries the same '#context-layer .ctx-block' and sits earlier
      // in the file, so a selector-based anchor silently reads the wrong loop.
      const ci = S.indexOf('// ── CONTEXT BLOCKS (back layer');
      if (ci < 0) throw new Error('nothing emits context blocks into the SVG at all');
      if (S.slice(ci, ci + 3000).indexOf('ctxLayer.push') < 0) {
        throw new Error('context blocks are not pushed into the SVG context layer');
      }
      // ctxLayer has to actually reach the back layer, and AFTER it — the whole ordering
      // rests on this one concat, and it has to happen before BOTH consumers (the
      // downloaded SVG and the returnBlob split) or one of them loses the blocks.
      const flush = S.indexOf('backLayer.push(...ctxLayer)');
      if (flush < 0) throw new Error('ctxLayer is never folded into the back layer, so blocks vanish from the SVG');
      const dl = S.indexOf('<g id="frames-and-character">');
      const rb = S.indexOf('picSvg: head');
      if (!(flush < dl) || !(flush < rb)) {
        throw new Error('the flush happens after a consumer, so that export path drops the context blocks');
      }
      // And the artboard must grow for a block that overhangs the wall — a millwork run
      // legitimately continues past the corner.
      const bi = S.indexOf("['frame-layer','arch-dim-layer','dim-layer','floor-ceiling-layer'");
      const boundsList = S.slice(bi, S.indexOf('].forEach', bi));
      if (boundsList.indexOf('context-layer') < 0) throw new Error('an overhanging block gets cropped off the artboard');
    });

    // ── Drawing and editing ─────────────────────────────────────────────────
    __check('the draw tool is a MODE, exclusive with every other wall mode, and escapable', () => {
      seed();
      toggleContextTool(false);
      if (contextToolActive) throw new Error('the tool did not start off');
      // Every wall mode wants the same mousedown; whichever bound last would silently win.
      toggleLineTool(true);
      toggleContextTool(true);
      if (!contextToolActive) throw new Error('the context tool did not turn on');
      if (lineToolActive) throw new Error('the measure tool is still armed alongside it');
      if (_ulPlacing) throw new Error('underlay placing is still armed alongside it');
      // Escape has to reach it or the mode is a trap.
      const ki = S.indexOf("e.key === 'Escape' && (lineToolActive");
      if (ki < 0) throw new Error('could not find the Escape handler');
      if (S.slice(ki, ki + 1600).indexOf('toggleContextTool(false)') < 0) {
        throw new Error('Escape cannot leave the context tool');
      }
      toggleContextTool(false);
      if (contextToolActive) throw new Error('the tool did not turn off');
    });

    __check('picking a DIFFERENT shape re-arms the tool instead of switching it off', () => {
      // A toggle keyed only on on/off turns itself off when you click 'Circle' while
      // 'Box' is armed, which obviously meant circle.
      seed();
      toggleContextTool(false);
      armContextShape('rect');
      if (!contextToolActive || _ctxArmedPreset !== 'rect') throw new Error('arming Box failed');
      armContextShape('circle');
      if (!contextToolActive) throw new Error('picking a different shape switched the tool off');
      if (_ctxArmedPreset !== 'circle') throw new Error('the armed shape did not change');
      // Clicking the SAME shape again is still a toggle off — that is the way out.
      armContextShape('circle');
      if (contextToolActive) throw new Error('re-clicking the armed shape did not disarm');
    });

    __check('EXACT RISK: the draw tool is checked BEFORE the drag/marquee handlers', () => {
      // Tracing means drawing a block over the top of one already placed. Checked after
      // the .draggable test, that drag would MOVE the existing block instead of starting
      // a new one — which reads as the tool being broken.
      const wi = S.indexOf('wall.onmousedown = function(e) {');
      if (wi < 0) throw new Error('could not find the wall mousedown handler');
      const body = S.slice(wi, S.indexOf('_elevMarqueeStart(e);', wi));
      const tool = body.indexOf('_ctxDrawStart(e)');
      // Anchored on the CALL, not on the '.draggable' selector string — that also
      // appears in the comment explaining this very ordering, so matching the prose
      // would let the real check pass while the code was wrong.
      const drag = body.indexOf('e.target.closest(');
      if (tool < 0) throw new Error('the wall never starts a context draw');
      if (drag < 0) throw new Error('could not find the drag passthrough test');
      if (!(tool < drag)) throw new Error('the draggable test runs first, so drawing over a block moves it');
      // A block must also be excluded from the marquee passthrough list, or clicking one
      // starts a rubber-band selection instead of grabbing it.
      if (body.indexOf('.ctx-block') < 0) throw new Error('a click on a block falls through to the marquee');
      // FRAMES too. Tracing means dragging a block across art that is already placed —
      // a door behind a piece, millwork under a row of them. The frame drag binds on the
      // frame element itself, so wall.onmousedown never sees that event: the guard has
      // to be inside makeElevDraggable as well, and it must NOT stopPropagation or the
      // draw never starts.
      const mi = S.indexOf('function makeElevDraggable');
      const md = S.slice(mi, mi + 1400);
      if (md.indexOf('contextToolActive') < 0) {
        throw new Error('dragging a context block over existing art moves the art instead');
      }
      // Same for an existing block: it yields to the tool rather than being grabbed.
      const ci = S.indexOf('function _makeContextDraggable');
      if (S.slice(ci, ci + 900).indexOf('contextToolActive') < 0) {
        throw new Error('drawing over an existing block moves that block instead');
      }
    });

    __check('EXACT REPORT: a CLICK places the library size; a DRAG gives a custom one', () => {
      // "some of the library items are showing dimensions, but when I drag it creates
      // whatever shape not a locked dimension of that object." A click now means "give me
      // the real thing" — you should not have to drag a 36x84 door by eye and then fix it
      // in two fields. A drag still wins, because a size you dragged is a measurement.
      const e = seed();
      const wall = document.getElementById('wall');
      drawElevAll();
      const rect0 = { left: 0, top: 0, right: 240 * elevScale, bottom: 108 * elevScale };
      wall.getBoundingClientRect = () => rect0;
      const md0 = (x, y) => ({ clientX: x, clientY: y, button: 0, preventDefault(){}, stopPropagation(){} });
      // Click with the guestroom door armed → exactly 36 x 84, on the floor, wherever
      // vertically it was clicked.
      armContextShape('door-guest');
      _ctxDrawStart(md0(100 * elevScale, rect0.bottom - 70 * elevScale));
      _ctxDrawUp(md0(100 * elevScale, rect0.bottom - 70 * elevScale));
      let b = _elevContextBlocks(e)[0];
      if (!b) throw new Error('a click placed nothing');
      if (Math.abs(b.w - 36) > 0.001 || Math.abs(b.h - 84) > 0.001) {
        throw new Error('the click did not use the library size: ' + b.w + 'x' + b.h);
      }
      if (b.y !== 0) throw new Error('a door must land on the floor, not at the click height: ' + b.y);
      if (b.preset !== 'door-guest') throw new Error('the block does not record which library item it is');
      // A 'center' AFF item resolves to bottom = aff - h/2. A TV at 60in AFF centre with
      // a 28in panel sits at 46 — getting this wrong hangs every TV a foot too high.
      e.contextBlocks.length = 0;
      armContextShape('tv-55');
      _ctxDrawStart(md0(50 * elevScale, rect0.bottom - 10 * elevScale));
      _ctxDrawUp(md0(50 * elevScale, rect0.bottom - 10 * elevScale));
      b = _elevContextBlocks(e)[0];
      if (Math.abs(b.h - 28) > 0.001) throw new Error('the TV height is wrong: ' + b.h);
      if (Math.abs(b.y - 46) > 0.001) throw new Error('a centre-AFF item did not resolve to its bottom: ' + b.y);
      if (Math.abs(b.w - 48.5) > 0.001) throw new Error('the TV width is wrong: ' + b.w);
      e.contextBlocks.length = 0;
      wall.getBoundingClientRect = () => rect0;
      const rect = rect0;
      // A click with the BASIC Box armed places nothing: those shapes have no true size
      // worth dropping, so the tool stays forgiving about a stray click there.
      armContextShape('rect');
      _ctxDrawStart(md0(50, 50));
      _ctxDrawUp(md0(50, 50));
      if (_elevContextBlocks(e).length !== 0) throw new Error('a stray click on a Basic shape created a block');
      toggleContextTool(true);
      const md = (x, y) => ({ clientX: x, clientY: y, button: 0, preventDefault(){}, stopPropagation(){} });
      // A real drag, dragged UP-LEFT so the negative direction is covered too — the
      // block is min/abs of the two corners, not "second point minus first".
      const x0 = 100 * elevScale, y0 = rect.bottom - 90 * elevScale;
      const x1 = 40 * elevScale,  y1 = rect.bottom - 0;
      _ctxDrawStart(md(x0, y0));
      _ctxDrawUp(md(x1, y1));
      const blocks = _elevContextBlocks(e);
      if (blocks.length !== 1) throw new Error('a real drag did not create a block');
      b = blocks[0];
      if (Math.abs(b.x - 40) > 1.01) throw new Error('x should be the LEFT of the two corners, got ' + b.x);
      if (Math.abs(b.y - 0) > 1.01) throw new Error('y should be the LOWER of the two corners, got ' + b.y);
      if (Math.abs(b.w - 60) > 1.01) throw new Error('width should be the absolute span, got ' + b.w);
      if (Math.abs(b.h - 90) > 1.01) throw new Error('height should be the absolute span, got ' + b.h);
      // A DRAG overrides the library size — the TV armed above is 48.5x28 and this is not.
      if (Math.abs(b.w - 48.5) < 0.5) throw new Error('the drag was overridden by the library size');
      // EXACT REPORT: "once I draw it I can use the m tool to attach a measurement line
      // to it… currently I have to type in the dimensions from floor and from left, but
      // that is going to be annoying." The tool used to STAY on, and _makeContextDraggable
      // yields to it — so the block you had just drawn could not be nudged without first
      // finding Escape. It now hands back to select mode after one block, which is what
      // makes draw-then-move consecutive.
      if (contextToolActive) throw new Error('the tool stayed armed, so the block just drawn cannot be dragged');
      const wallCur = document.getElementById('wall').style.cursor;
      if (wallCur === 'crosshair') throw new Error('the wall still shows the draw cursor after handing back');
      // And the drag handler must now actually take it.
      const el = document.getElementById('context-layer').querySelector('.ctx-block');
      if (!el || typeof el.onmousedown !== 'function') throw new Error('the new block has no drag handler');
    });

    __check('a drawn block takes the ARMED shape, at the size it was dragged', () => {
      const e = seed();
      const wall = document.getElementById('wall');
      drawElevAll();
      const rect = { left: 0, top: 0, right: 240 * elevScale, bottom: 108 * elevScale };
      wall.getBoundingClientRect = () => rect;
      const md = (x, y) => ({ clientX: x, clientY: y, button: 0, preventDefault(){}, stopPropagation(){} });
      armContextShape('circle');
      _ctxDrawStart(md(10 * elevScale, rect.bottom - 40 * elevScale));
      _ctxDrawUp(md(34 * elevScale, rect.bottom - 10 * elevScale));
      const b = _elevContextBlocks(e)[0];
      if (!b) throw new Error('nothing was drawn');
      if (b.shape !== 'ellipse') throw new Error('the armed shape was ignored: ' + b.shape);
      // The DRAGGED size wins over the preset's — a size you just dragged is an instruction.
      if (Math.abs(b.w - 24) > 1.01) throw new Error('the preset size overrode the drag: ' + b.w);
      if (Math.abs(b.h - 30) > 1.01) throw new Error('the preset size overrode the drag: ' + b.h);
      if (!b.id) throw new Error('a drawn block has no stable id, so nothing can anchor to it');
    });

    __check('one reading of the drag-snap field, shared with the frame drag', () => {
      // A block traced against a frame has to land on the same lattice the frame does,
      // and two readings of one input is exactly how they stop agreeing.
      const el = document.getElementById('dragSnap');
      elevUnit = 'in';
      if (el) {
        el.value = '4';
        if (_elevSnapStep() !== 4) throw new Error('the snap field is not read: ' + _elevSnapStep());
        if (_ctxSnap(9) !== 8) throw new Error('a block does not snap to the field: ' + _ctxSnap(9));
        el.value = '';
        if (Math.abs(_elevSnapStep() - 1) > 1e-9) throw new Error('an empty field should fall back to 1in/1cm');
        el.value = '0';
        if (Math.abs(_elevSnapStep() - 1) > 1e-9) throw new Error('a zero snap would divide by zero');
      }
      // The frame drag must go through the same function, not its own copy of the read.
      const mi = S.indexOf('function makeElevDraggable');
      const body = S.slice(mi, S.indexOf('\\nfunction ', mi + 10));
      if (body.indexOf('_elevSnapStep()') < 0) throw new Error('the frame drag kept its own copy of the snap read');
      if (body.indexOf("getElementById('dragSnap')") >= 0) throw new Error('the frame drag still reads the field directly');
    });

    __check('the label is stored as typed and only SHOUTED in display', () => {
      // Storing the shouted form makes the field un-editable in the normal way and
      // survives any later decision to stop shouting.
      const e = seed({ blocks: [{ x: 0, y: 0, w: 36, h: 84, label: '' }] });
      setContextLabel(0, 'Coat closet');
      if (e.contextBlocks[0].label !== 'Coat closet') throw new Error('the stored label was transformed: ' + e.contextBlocks[0].label);
      if (C.indexOf('text-transform: uppercase') < 0) throw new Error('.ctx-label does not shout in CSS');
      // Bounded, so a pasted paragraph cannot become a label.
      setContextLabel(0, 'x'.repeat(200));
      if (e.contextBlocks[0].label.length !== 40) throw new Error('the label is unbounded: ' + e.contextBlocks[0].label.length);
      setContextLabel(0, null);
      if (e.contextBlocks[0].label !== '') throw new Error('a null label became the string "null"');
    });

    __check('add / edit / delete address the right block on a wall carrying several', () => {
      const e = seed({ blocks: [{ x: 0, y: 0, w: 36, h: 84, label: 'A' }, { x: 100, y: 0, w: 60, h: 40, label: 'B' }] });
      setContextField(1, 'w', 72);
      if (e.contextBlocks[1].w !== 72) throw new Error('the edit did not land on block B');
      if (e.contextBlocks[0].w !== 36) throw new Error('the edit also moved block A');
      // A negative size is a typo, not a shape.
      setContextField(1, 'h', -20);
      if (e.contextBlocks[1].h !== 0) throw new Error('a negative height was stored: ' + e.contextBlocks[1].h);
      // x/y stay signed: a block legitimately overhangs the wall to the left.
      setContextField(1, 'x', -12);
      if (e.contextBlocks[1].x !== -12) throw new Error('an overhanging block was clamped to the wall');
      removeContextBlock(0);
      if (e.contextBlocks.length !== 1) throw new Error('delete removed the wrong number of blocks');
      if (e.contextBlocks[0].label !== 'B') throw new Error('delete removed the wrong block');
      removeContextBlock(9);
      if (e.contextBlocks.length !== 1) throw new Error('an out-of-range delete removed something');
      addContextBlock();
      if (e.contextBlocks.length !== 2) throw new Error('add did not add');
      // Added somewhere visible, not stacked under the wall's corner dimensions.
      const nb = e.contextBlocks[1];
      if (!(nb.w > 0 && nb.h > 0)) throw new Error('the added block has no size');
      if (nb.x <= 0) throw new Error('the added block landed in the corner, where it reads as a fault');
    });

    __check('both panels are built AHEAD of the no-frames early return', () => {
      // A bare wall being traced from a client elevation has no frames on it yet — the
      // same trap the glazing editor hit, where the panel was unreachable on exactly the
      // wall that needed it.
      const ii = S.indexOf('function initElevControls');
      const head = S.slice(ii, S.indexOf('if (elevFrames.length === 0)', ii));
      if (head.indexOf('renderUnderlayControls()') < 0) throw new Error('the client-elevation panel is behind the early return');
      if (head.indexOf('renderContextControls()') < 0) throw new Error('the context panel is behind the early return');
      // And the markup they fill has to exist.
      if (H.indexOf('id="underlayControls"') < 0) throw new Error('#underlayControls is missing from index.html');
      if (H.indexOf('id="contextControls"') < 0) throw new Error('#contextControls is missing from index.html');
      seed();
      renderUnderlayControls(); renderContextControls();
      const ub = document.getElementById('underlayControls');
      if (ub.innerHTML.indexOf('pickElevUnderlay') < 0) throw new Error('an empty wall offers no way to add a client elevation');
      const cb = document.getElementById('contextControls');
      if (cb.innerHTML.indexOf('addContextBlock') < 0) throw new Error('an empty wall offers no way to add a block');
    });

    __check('the fade slider is live, and reports the value it is setting', () => {
      // A fade you have to release the mouse to see is a fade you cannot set.
      const e = seed({ underlay: { src: 'data:image/png;base64,AA', x: 0, y: 0, w: 240, h: 108, opacity: 0.35 } });
      renderUnderlayControls();
      const box = document.getElementById('underlayControls');
      const sl = box.querySelector('input[type="range"]');
      if (!sl) throw new Error('there is no fade slider');
      if (sl.getAttribute('oninput').indexOf('setUnderlayOpacityLive') < 0) throw new Error('the slider is not live on input');
      if (!box.querySelector('#underlayOpacityOut')) throw new Error('the slider does not report its value');
      setUnderlayOpacityLive(70);
      if (Math.abs(e.underlay.opacity - 0.7) > 1e-9) throw new Error('the live handler did not set the fade: ' + e.underlay.opacity);
      if (document.getElementById('underlayOpacityOut').textContent !== '70%') throw new Error('the readout did not follow');
      // Fit puts it back on the wall it belongs to.
      setUnderlayField('x', 40);
      fitUnderlayToWall();
      if (e.underlay.x !== 0 || e.underlay.y !== 0) throw new Error('Fit did not re-anchor the image');
      if (e.underlay.w !== 240 || e.underlay.h !== 108) throw new Error('Fit did not size to the wall');
      // …and keeps the fade, which is a separate decision from placement.
      if (Math.abs(e.underlay.opacity - 0.7) > 1e-9) throw new Error('Fit reset the fade');
    });

    // ── The client elevation: aspect, and calibrating off a known dimension ──
    __check('EXACT REPORT: an imported drawing is CONTAINED at its true aspect, never stretched', () => {
      // "For the client elevation when I drop it in it stretches." It used to be sized
      // to the wall's exact width AND height, which distorts every image that is not
      // the wall's own proportion. Contained, not covered: an overflowing image loses
      // its edges, and the edges are where the reference dimensions usually are.
      const wide = _underlayContain(2000, 500, 240, 108);   // 4:1 image on a 2.22:1 wall
      if (Math.abs(wide.w / wide.h - 4) > 1e-6) throw new Error('the aspect was not preserved: ' + wide.w + 'x' + wide.h);
      if (wide.w > 240.001 || wide.h > 108.001) throw new Error('the fit overflowed the wall');
      if (Math.abs(wide.w - 240) > 0.01) throw new Error('a wide image should be width-limited, got ' + wide.w);
      const tall = _underlayContain(500, 2000, 240, 108);
      if (Math.abs(tall.h - 108) > 0.01) throw new Error('a tall image should be height-limited, got ' + tall.h);
      if (Math.abs(tall.w / tall.h - 0.25) > 1e-6) throw new Error('the tall aspect was not preserved');
      // No natural size (a decode failure) → fall back to the box rather than 0x0.
      const none = _underlayContain(0, 0, 240, 108);
      if (none.w !== 240 || none.h !== 108) throw new Error('a sizeless image did not fall back to the box');
    });

    __check('the aspect lock is ON by default and holds when either dimension is typed', () => {
      const u = { src: 'x', natW: 1000, natH: 500, x: 0, y: 0, w: 200, h: 100 };
      if (!_underlayLocked(u)) throw new Error('the lock should default ON — a lock you must find is off when it matters');
      if (Math.abs(_underlayAspect(u) - 2) > 1e-9) throw new Error('the aspect came from the box, not the image');
      // Typing W moves H, and the typed number is the one you get.
      _underlayResize(u, 'w', 300);
      if (u.w !== 300) throw new Error('the driver dimension was altered: ' + u.w);
      if (Math.abs(u.h - 150) > 1e-6) throw new Error('height did not follow the lock: ' + u.h);
      // …and the other way round.
      _underlayResize(u, 'h', 100);
      if (u.h !== 100) throw new Error('the driver dimension was altered: ' + u.h);
      if (Math.abs(u.w - 200) > 1e-6) throw new Error('width did not follow the lock: ' + u.w);
      // Unlocked, they move independently again — free stretch stays available.
      u.lockAspect = false;
      _underlayResize(u, 'w', 999);
      if (u.h !== 100) throw new Error('height moved while the lock was off');
      // An image that reported no natural size has NO aspect to hold, and must degrade
      // to free stretch rather than inventing one from the current box and locking the
      // distortion in.
      const noNat = { src: 'x', w: 200, h: 100 };
      if (_underlayAspect(noNat) !== null) throw new Error('an aspect was invented from the box');
      _underlayResize(noNat, 'w', 400);
      if (noNat.h !== 100) throw new Error('a sizeless image was resized against a guessed aspect');
    });

    __check('EXACT WORKFLOW: calibrate off a known dimension, and the reference stays put', () => {
      // The in-app replacement for the Photoshop round trip: crop to the 4" baseboard,
      // Reveal All, marquee a known size. Here: click the two ends of the baseboard,
      // type 4, and the image scales to it.
      const e = seed({ underlay: { src: 'x', natW: 1000, natH: 500, x: 0, y: 0, w: 100, h: 50, opacity: 0.4 } });
      const wall = document.getElementById('wall');
      drawElevAll();
      const rect = { left: 0, top: 0, right: 240 * elevScale, bottom: 108 * elevScale };
      wall.getBoundingClientRect = () => rect;
      const md = (x, y) => ({ clientX: x, clientY: y, button: 0, preventDefault(){}, stopPropagation(){} });
      toggleUnderlayCalibrate(true);
      if (!_ulCalibrateActive) throw new Error('calibrate did not arm');
      // Two clicks 8 units apart vertically, on something that is really 4.
      _ulCalibrateClick(md(20 * elevScale, rect.bottom - 2 * elevScale));
      _ulCalibrateClick(md(20 * elevScale, rect.bottom - 10 * elevScale));
      if (Math.abs(_ulCalSpan - 8) > 0.02) throw new Error('the measured span is wrong: ' + _ulCalSpan);
      applyUnderlayCalibration(4);
      const u = e.underlay;
      // Half the size, BOTH axes by the same factor — a calibration is a scale, never a
      // stretch, and this is the one place holding the aspect is not optional.
      if (Math.abs(u.w - 50) > 0.02) throw new Error('width did not scale: ' + u.w);
      if (Math.abs(u.h - 25) > 0.02) throw new Error('height did not scale: ' + u.h);
      if (Math.abs((u.w / u.h) - 2) > 1e-6) throw new Error('calibration distorted the image');
      // Scaled about the FIRST click, so the feature just pointed at does not slide away.
      // First click was at y=2; the image started at y=0, so it ends at 2 - 2*0.5 = 1.
      if (Math.abs(u.y - 1) > 0.02) throw new Error('the reference point moved: y=' + u.y);
      // Done calibrating → straight into placing, because scale is settled and sliding
      // it onto the wall is the next thing anyone does.
      if (_ulCalibrateActive) throw new Error('still calibrating after applying');
      if (!_ulPlacing) throw new Error('did not hand over to placing');
      togglePlaceUnderlay(false);
    });

    __check('calibration refuses the inputs that would send the image to infinity', () => {
      const e = seed({ underlay: { src: 'x', natW: 1000, natH: 500, x: 0, y: 0, w: 100, h: 50 } });
      const wall = document.getElementById('wall');
      drawElevAll();
      const rect = { left: 0, top: 0, right: 240 * elevScale, bottom: 108 * elevScale };
      wall.getBoundingClientRect = () => rect;
      const md = (x, y) => ({ clientX: x, clientY: y, button: 0, preventDefault(){}, stopPropagation(){} });
      toggleUnderlayCalibrate(true);
      // Two clicks in the SAME place measure nothing — a restart, not a divide by zero.
      _ulCalibrateClick(md(30 * elevScale, rect.bottom - 30 * elevScale));
      _ulCalibrateClick(md(30 * elevScale, rect.bottom - 30 * elevScale));
      if (_ulCalSpan) throw new Error('a zero-length span was accepted');
      if (_ulCalFirst) throw new Error('the pending first point was not cleared for a restart');
      // A real span, then junk for the real-world value.
      _ulCalibrateClick(md(20 * elevScale, rect.bottom - 2 * elevScale));
      _ulCalibrateClick(md(20 * elevScale, rect.bottom - 10 * elevScale));
      const before = e.underlay.w;
      applyUnderlayCalibration(0);
      applyUnderlayCalibration(-5);
      applyUnderlayCalibration('abc');
      if (e.underlay.w !== before) throw new Error('a junk calibration value changed the image');
      _ulCancelCalibrate();
      if (_ulCalibrateActive || _ulCalSpan) throw new Error('cancel did not clear the mode');
      // The markers are transient authoring chrome and must not survive it.
      if (document.querySelectorAll('#wall ._ulCalMark').length) throw new Error('calibration marks were left on the wall');
    });

    __check('calibrating and placing own the pointer outright, and yield to each other', () => {
      // Both clicks land on the IMAGE, which is under the art — so a click that happens
      // to hit a frame or a block is still a calibration click, not a drag.
      const mi = S.indexOf('function makeElevDraggable');
      if (S.slice(mi, mi + 1400).indexOf('_ulCalibrateActive') < 0) {
        throw new Error('a calibrate click landing on a frame starts a frame drag');
      }
      const ci = S.indexOf('function _makeContextDraggable');
      if (S.slice(ci, ci + 1100).indexOf('_ulCalibrateActive') < 0) {
        throw new Error('a calibrate click landing on a block moves that block');
      }
      const wi = S.indexOf('wall.onmousedown = function(e) {');
      const body = S.slice(wi, S.indexOf('_elevMarqueeStart(e);', wi));
      if (body.indexOf('_ulCalibrateClick(e)') < 0) throw new Error('the wall never routes a calibrate click');
      // Only one mode at a time.
      seed({ underlay: { src: 'x', natW: 100, natH: 100, x: 0, y: 0, w: 50, h: 50 } });
      togglePlaceUnderlay(true);
      if (!_ulPlacing) throw new Error('placing did not arm');
      toggleUnderlayCalibrate(true);
      if (_ulPlacing) throw new Error('placing survived alongside calibrating');
      toggleContextTool(true);
      if (_ulCalibrateActive) throw new Error('calibrating survived alongside the context tool');
      toggleContextTool(false);
    });

    // ── Shapes ──────────────────────────────────────────────────────────────
    __check('presets seed real-world sizes; unknown shapes fall back to a box', () => {
      // Authored in inches and converted, so a cm project gets a real 84in door.
      const door = CONTEXT_PRESETS.find(p => p.key === 'door-guest');
      if (!door || door.h !== 84 || door.aff !== 0) throw new Error('the door preset is not a door on the floor');
      const shelf = CONTEXT_PRESETS.find(p => p.key === 'shelf');
      if (!shelf || shelf.shape !== 'shelf') throw new Error('the shelf preset lost its shape');
      // A shape the renderer does not know draws as a box rather than vanishing.
      if (_ctxShape({ shape: 'sofa' }) !== 'rect') throw new Error('an unknown shape did not fall back');
      if (_ctxShape({}) !== 'rect') throw new Error('a shapeless block did not fall back');
      if (_ctxShape(null) !== 'rect') throw new Error('a null block blew up');
      // Click-to-add uses the preset's own real-world size.
      const e = seed();
      addContextBlock('tv-55');
      const b = e.contextBlocks[0];
      if (b.shape !== 'tv' || b.label !== 'TV') throw new Error('the preset did not seed the block');
      // A 55in TV is a 55in DIAGONAL, which is 48.5in wide — the number that matters on
      // an elevation is the width, and getting that wrong is how art ends up planned
      // against a screen a foot narrower than the drawing says.
      if (Math.abs(b.w - 48.5) > 0.01) throw new Error('the 55in TV is not 48.5in wide: ' + b.w);
      // A catalogue item is NOT shrunk to fit the wall: a 120in wainscot on a 96in wall
      // runs past the corner, and silently resizing it would make the drawing lie about
      // the size of a real object. Overhang is legal (see the artboard-bounds note).
      const e2 = seed(); e2.wallW = 36; e2.wallH = 108;
      addContextBlock('bed-king');
      if (Math.abs(e2.contextBlocks[0].w - 76) > 0.01) {
        throw new Error('a king bed was silently shrunk to its wall: ' + e2.contextBlocks[0].w);
      }
    });

    __check('presets convert to the project unit, so a cm wall gets a real 84in door', () => {
      // Sizes are authored in inches. A cm project must get a 213cm door, not an 84cm one.
      seed();
      elevUnit = 'cm'; dashUnit = 'cm';
      const box = _ctxPresetBox(_ctxPreset('door-guest'), 300);
      if (Math.abs(box.h - 213.36) > 0.01) throw new Error('the door did not convert: ' + box.h);
      if (Math.abs(box.w - 91.44) > 0.01) throw new Error('the door width did not convert: ' + box.w);
      // …and a centre-AFF item converts the AFF too, not just the size.
      const tv = _ctxPresetBox(_ctxPreset('tv-55'), 300);
      if (Math.abs(tv.y - (60 * 2.54 - (28 * 2.54) / 2)) > 0.01) throw new Error('the centre AFF did not convert: ' + tv.y);
      elevUnit = 'in'; dashUnit = 'in';
    });

    __check('library line art is a front elevation whose viewBox matches its real size', () => {
      // The rules the assets are held to: strict front elevation, viewBox exactly the
      // item's w x h so nothing is pre-distorted, and the stroke convention applied ONCE
      // on the wrapper rather than repeated per node.
      const withArt = CONTEXT_PRESETS.filter(p => p.svg);
      if (withArt.length < 10) throw new Error('only ' + withArt.length + ' items have line art');
      withArt.forEach(p => {
        const svg = _ctxArtSvg(p);
        if (svg.indexOf('viewBox="0 0 ' + p.w + ' ' + p.h + '"') < 0) {
          throw new Error(p.key + ' viewBox does not match its ' + p.w + 'x' + p.h + ' size');
        }
        if (svg.indexOf('fill="none"') < 0) throw new Error(p.key + ' is not stroke-only');
        if (svg.indexOf('preserveAspectRatio="none"') < 0) throw new Error(p.key + ' will not fill its block');
        // currentColor on screen, so ONE place sets the ink.
        if (svg.indexOf('stroke="currentColor"') < 0) throw new Error(p.key + ' does not inherit its colour');
        // No stray fills that would make it a solid blob instead of line art.
        if (/fill="(?!none)[^"]+"/.test(p.svg)) throw new Error(p.key + ' has a hardcoded fill');
      });
      // The export substitutes a LITERAL hex: once the markup leaves the page there is no
      // CSS colour to inherit and every stroke falls back to black.
      const ex = _ctxArtSvg(withArt[0], _ctxInkHex());
      if (ex.indexOf('currentColor') >= 0) throw new Error('the export still relies on currentColor');
      if (ex.indexOf(_ctxInkHex()) < 0) throw new Error('the export ink was not substituted');
      if (_ctxArtSvg(null) !== '' || _ctxArtSvg({ w: 1, h: 1 }) !== '') throw new Error('an art-less item did not return empty');
    });

    __check('EXACT BUG: stroke widths are DIVIDED by the draw scale, not left to scale', () => {
      // "very thick black lines… does not look professional." Not a taste problem: the
      // art leaned on vector-effect="non-scaling-stroke" set on the wrapping <g>, and
      // VECTOR-EFFECT IS NOT AN INHERITED PROPERTY — it applied to the <g> and to none of
      // the shapes inside. Every stroke therefore scaled with the viewBox: on a 185in
      // wall at a fitted zoom (~6.4 px per inch) an authored 0.9 rendered near 6px of
      // solid black, and the heavier ones far worse.
      const tv = CONTEXT_PRESETS.find(p => p.key === 'tv-55');
      // At 6.4x, an authored 0.9px object line must come out as 0.9/6.4 user units.
      const at = _ctxArtSvg(tv, null, 6.4);
      const want = (CTX_LW_OBJ / 6.4).toFixed(4);
      if (at.indexOf('stroke-width="' + want + '"') < 0) {
        throw new Error('the object line was not divided by the scale; got ' + at.slice(0, 260));
      }
      // Bigger block → thinner user-unit stroke, so the RENDERED weight is constant.
      const big = _ctxArtSvg(tv, null, 20), small = _ctxArtSvg(tv, null, 2);
      const first = (s) => parseFloat((s.match(/stroke-width="([\\d.]+)"/) || [])[1]);
      if (!(first(big) < first(small))) throw new Error('a larger block does not get a thinner user-unit stroke');
      // A scale of 1 (or a missing one) must not blow up or invert.
      if (!isFinite(first(_ctxArtSvg(tv, null, 1)))) throw new Error('scale 1 produced a non-finite width');
      if (!isFinite(first(_ctxArtSvg(tv)))) throw new Error('a missing scale produced a non-finite width');
      if (first(_ctxArtSvg(tv, null, 0)) !== first(_ctxArtSvg(tv, null, 1))) {
        throw new Error('a zero scale did not fall back to 1, so it divided by zero');
      }
      // The DASH RUN converts too — left unscaled, a hidden line comes out solid. Taken
      // from the CLOSED-cabinet vanity, where the bowl really is concealed: on the ADA
      // one the knee space is open, so its bowl is a visible object line.
      const van = CONTEXT_PRESETS.find(p => p.key === 'vanity-60');
      const dashed = _ctxArtSvg(van, null, 8);
      const da = (dashed.match(/stroke-dasharray="([\\d.]+) ([\\d.]+)"/) || []);
      if (!da.length) throw new Error('the hidden line lost its dash pattern');
      if (parseFloat(da[1]) >= 2.2) throw new Error('the dash run was not scaled: ' + da[1]);
      // BOTH renderers pass a scale, or one of them is back to the original bug.
      const ri = S.indexOf('wrap.innerHTML = _ctxArtSvg(');
      if (ri < 0 || S.slice(ri, ri + 120).indexOf('pw /') < 0) {
        throw new Error('the on-screen renderer does not pass a draw scale');
      }
      const xi = S.indexOf('ctxLayer.push(_ctxArtSvg(artP');
      if (xi < 0 || S.slice(xi, xi + 160).indexOf('p.w /') < 0) {
        throw new Error('the SVG export does not pass a draw scale');
      }
    });

    __check('context is LINE WORK on an OPAQUE body, and carries no hatch by default', () => {
      // CHANGED (16.82): the fill is opaque WHITE, not transparent. The reasoning that
      // dropped the original fill was about TONE — a stack of grey boxes competing with
      // the art — and white does not bring tone back. What transparent could not do is
      // OCCLUDE, and occlusion is the point: a block is an object in the room, so the
      // baseboard runs behind a bed and a wallcovering graphic is masked by the headboard
      // that will really stand in front of it.
      // Still no tint and no shade: a grey body is the thing that was wrong before.
      if (CONTEXT_FILL === 'transparent') {
        throw new Error('context blocks are transparent again, so nothing masks a graphic behind them');
      }
      if (!/^#(f{3}|f{6})$/i.test(CONTEXT_FILL)) {
        throw new Error('the context body is not plain white, so it reads as tone: ' + CONTEXT_FILL);
      }
      // A TV is the one shape with tone, and it has to be OPAQUE tone — an alpha would
      // let the wallcovering behind it show through a television.
      const ti = S.indexOf("shape === 'tv'");
      const tvRule = S.slice(ti, ti + 160);
      if (tvRule.indexOf('rgba(') >= 0) throw new Error('the TV panel is translucent, so a graphic shows through it');
      // The rubber band keeps a wash — it is transient authoring feedback, not drawing.
      if (CONTEXT_DRAW_FILL === 'transparent') throw new Error('the draw rubber band is invisible');
      const di = S.indexOf('function _ctxDrawStart');
      if (S.slice(di, di + 900).indexOf('CONTEXT_DRAW_FILL') < 0) throw new Error('the rubber band lost its wash');
      // NOTHING in the library ships with a surface hatch: it turned a table into a
      // hatched slab and a mirror into a scribble. The two panel presets are the
      // exception, because the surface IS what they are.
      CONTEXT_PRESETS.forEach(p => {
        if (p.fill !== 'plain' && p.key !== 'wood' && p.key !== 'glass') {
          throw new Error(p.key + ' ships with a ' + p.fill + ' hatch by default');
        }
      });
      // …and when it IS opted into, it is sparse and pale rather than a solid texture.
      if (CTX_WOOD_STEP < 14 || CTX_GLASS_STEP < 18) throw new Error('the hatch is still dense');
      const ops = _ctxFillOps('wood', 100, 60);
      if (ops.length > 5) throw new Error('a 60px-tall block still gets ' + ops.length + ' grain lines');
    });

    __check('the assets read as CAD: a line weight hierarchy and square corners', () => {
      // "right now they look kind of like kid drawings. I want it to look more like
      // Institutional Furniture CAD Drawings." One uniform stroke reads as hand-drawn
      // however accurate the geometry underneath is — the weight hierarchy is the single
      // thing that separates a spec drawing from a sketch.
      if (!(CTX_LW_OBJ > CTX_LW_DET && CTX_LW_DET > CTX_LW_FINE)) {
        throw new Error('the three weights are not a hierarchy: ' + [CTX_LW_OBJ, CTX_LW_DET, CTX_LW_FINE].join('/'));
      }
      // Mitre joins and butt caps. Rounded joins on a heavy outline is most of what made
      // these look hand-drawn.
      const sample = _ctxArtSvg(CONTEXT_PRESETS.find(p => p.key === 'credenza'), null, 1);
      if (sample.indexOf('stroke-linejoin="miter"') < 0) throw new Error('corners are still rounded');
      if (sample.indexOf('stroke-linecap="butt"') < 0) throw new Error('line ends are still rounded');
      // The wrapper defaults to the DETAIL weight, so an asset declaring no group lands
      // mid-hierarchy rather than at a hairline. Compared at scale 1 through the same
      // conversion the widths go through, so this cannot pass on a raw literal.
      if (sample.indexOf('stroke-width="' + CTX_LW_DET.toFixed(4) + '"') < 0) {
        throw new Error('the wrapper weight is not the detail line');
      }
      // THIN. This line work sits behind the artwork and must never compete with it.
      if (CTX_LW_OBJ > 1) throw new Error('the object line is back to a heavy weight: ' + CTX_LW_OBJ);
      // Every drawn asset actually USES the hierarchy — at least two weights. A single
      // weight throughout is the thing being fixed here, so one is a regression.
      CONTEXT_PRESETS.filter(p => p.svg).forEach(p => {
        const weights = new Set((p.svg.match(/stroke-width="([\\d.]+)"/g) || []));
        if (weights.size < 2) throw new Error(p.key + ' is drawn at a single line weight');
        // …and the heaviest weight present is the object line, i.e. the outer profile is
        // never lighter than the detail inside it.
        if (p.svg.indexOf('stroke-width="' + CTX_LW_OBJ + '"') < 0) {
          throw new Error(p.key + ' has no object line, so nothing reads as its profile');
        }
      });
      // Hidden geometry is DASHED, the drafting convention. It belongs on the CLOSED
      // vanity, whose bowl really is concealed behind the cabinet front — and NOT on the
      // ADA one, where the open knee space means you can see the bowl and a dashed line
      // would claim otherwise.
      const van = CONTEXT_PRESETS.find(p => p.key === 'vanity-60');
      if (van.svg.indexOf('stroke-dasharray') < 0) throw new Error('the concealed bowl is not drawn as a hidden line');
      const adaVan = CONTEXT_PRESETS.find(p => p.key === 'vanity-ada');
      if (adaVan.svg.indexOf('stroke-dasharray') >= 0) throw new Error('the ADA bowl is dashed, but open knee space makes it visible');
      // Construction detail: a door is a jamb + leaf + three hinges + a lever, not a
      // rectangle with a dot on it. Counted rather than eyeballed so the detail cannot
      // quietly be simplified away again.
      const door = CONTEXT_PRESETS.find(p => p.key === 'door-guest');
      const hinges = (door.svg.match(/<rect x="2" y="[\\d.]+" width="0.7"/g) || []).length;
      if (hinges !== 3) throw new Error('the door does not carry three butt hinges, got ' + hinges);
      // The lever sits at a real 36in AFF on an 84in leaf, so cy is 84 - 36 = 48.
      if (door.svg.indexOf('cy="48"') < 0) throw new Error('the door lever is not at 36in AFF');
      const ada = CONTEXT_PRESETS.find(p => p.key === 'door-ada-bath');
      if (ada.svg.indexOf('cy="46"') < 0) throw new Error('the ADA lever is not at 34in AFF on an 80in leaf');
      // Casework carries a toe kick — the detail that most says "millwork" in elevation.
      const cred = CONTEXT_PRESETS.find(p => p.key === 'credenza');
      if (cred.svg.indexOf('M2.5 24 h67 v6 h-67 z') < 0) throw new Error('the credenza lost its toe kick');
    });

    __check('EXACT ASK: the side view carries DIMENSIONS, not just a different drawing', () => {
      // A guestroom is drawn from four walls and the same furniture lands on more than
      // one. A bed from the headboard wall is 60in wide; along the wall it runs 80in long
      // and 36in tall, because the headboard and pillow rise above the mattress. A toggle
      // that only swapped artwork would leave the drawing lying about the size beside it.
      const e = seed();
      addContextBlock('bed-queen');
      let b = e.contextBlocks[0];
      if (_ctxViewOf(b) !== 'front') throw new Error('a new block is not born facing front');
      if (Math.abs(b.w - 60) > 0.01 || Math.abs(b.h - 24) > 0.01) throw new Error('the front size is wrong');
      setContextView(0, 'side');
      b = e.contextBlocks[0];
      if (_ctxViewOf(b) !== 'side') throw new Error('the view did not change');
      if (Math.abs(b.w - 80) > 0.01) throw new Error('the side did not take the real 80in length: ' + b.w);
      if (Math.abs(b.h - 36) > 0.01) throw new Error('the side did not get taller for the headboard: ' + b.h);
      // The FLOOR is held: a bed turned in place must not climb the wall.
      if (b.y !== 0) throw new Error('turning the bed lifted it off the floor: ' + b.y);
      setContextView(0, 'front');
      if (Math.abs(e.contextBlocks[0].w - 60) > 0.01) throw new Error('turning back did not restore the front size');
      // The DRAWING follows the view, resolved from the stored key + view so the screen
      // and the export cannot pick different ones.
      const front = _ctxArtFor('bed-queen', 'front'), side = _ctxArtFor('bed-queen', 'side');
      if (!front || !side) throw new Error('a bed is missing one of its views');
      if (front.svg === side.svg) throw new Error('both views draw the same thing');
      if (side.w !== 80 || side.h !== 36) throw new Error('the side art is not at the side size');
      // An item with NO side cannot be turned — silently doing nothing reads as a broken
      // control, so the data refuses and the picker is disabled.
      const e2 = seed();
      addContextBlock('grab-36');
      const before = e2.contextBlocks[0].w;
      setContextView(0, 'side');
      if (_ctxViewOf(e2.contextBlocks[0]) === 'side') throw new Error('an item with no side view was turned');
      if (e2.contextBlocks[0].w !== before) throw new Error('a refused turn still resized the block');
      if (_ctxHasSide(_ctxPreset('grab-36'))) throw new Error('a grab bar should have no side view');
      if (_ctxArtFor('grab-36', 'side').svg !== _ctxPreset('grab-36').svg) {
        throw new Error('asking for a missing side did not fall back to the front drawing');
      }
      // Junk in: no view change, no crash.
      setContextView(0, 'sideways');
      if (_ctxViewOf(e2.contextBlocks[0]) !== 'front') throw new Error('an invalid view was accepted');
      if (_ctxArtFor(null, 'side') !== null) throw new Error('a null preset blew up');
      if (_ctxArtFor('no-such-item', 'side') !== null) throw new Error('an unknown preset returned art');
    });

    __check('EXACT ASK: shuffle through bed styles, size stays, headboard height follows', () => {
      // "would I be able to shuffle through each bed type as a choice of bed" — five
      // styles traced from the reference sheet, cycled on ONE bed item. Style is not
      // size: a queen stays 60in wide whichever headboard it has, and only the height
      // moves, which is the number that matters when art goes above it.
      if (BED_STYLE_VARIANTS.length !== 5) throw new Error('expected 5 bed styles, got ' + BED_STYLE_VARIANTS.length);
      BED_STYLE_VARIANTS.forEach(v => {
        if (!v.key || !v.name) throw new Error('a style has no key or name');
        if (!(v.w > 0) || !(v.h > 0)) throw new Error(v.key + ' has no aspect');
        if (v.w !== 100) throw new Error(v.key + ' is not normalised to 100 units wide');
        if (!v.svg || v.svg.indexOf('<path') < 0) throw new Error(v.key + ' has no geometry');
        // Traced art still has to carry the weight hierarchy, or it reads flatter than
        // the hand-drawn assets beside it.
        if (v.svg.indexOf('stroke-width="' + CTX_LW_OBJ + '"') < 0) throw new Error(v.key + ' has no object line');
      });
      const keys = BED_STYLE_VARIANTS.map(v => v.key);
      if (new Set(keys).size !== keys.length) throw new Error('duplicate style keys');
      // All three bed sizes offer the same styles — that is the whole point of keeping
      // style and size apart.
      ['bed-queen', 'bed-king', 'bed-full'].forEach(k => {
        if (_ctxVariants(_ctxPreset(k)).length !== 5) throw new Error(k + ' does not offer the styles');
      });
      const e = seed();
      addContextBlock('bed-queen');
      let b = e.contextBlocks[0];
      const w0 = b.w;
      if (_ctxVariantOf(b) !== '') throw new Error('a new bed should start on its own drawing');
      const v1 = BED_STYLE_VARIANTS[2];        // the tall upholstered one
      setContextVariant(0, v1.key);
      b = e.contextBlocks[0];
      if (b.variant !== v1.key) throw new Error('the style did not change');
      if (Math.abs(b.w - w0) > 0.001) throw new Error('changing style changed the bed SIZE: ' + b.w);
      if (Math.abs(b.h - w0 * (v1.h / v1.w)) > 0.01) throw new Error('the height did not follow the drawing: ' + b.h);
      if (b.h <= 24) throw new Error('a tall headboard should reach further up the wall than the mattress');
      if (b.y !== 0) throw new Error('the bed left the floor');
      // The art actually swaps, at the variant's own viewBox.
      const art = _ctxArtFor('bed-queen', 'front', v1.key);
      if (!art || art.variant !== v1.key) throw new Error('the drawing did not switch');
      if (art.h !== v1.h) throw new Error('the variant viewBox is wrong');
      // CYCLING wraps, and slot zero is the item's own drawing, so the hand-drawn
      // original is always something you can shuffle back to.
      setContextVariant(0, '');
      for (let i = 0; i < 5; i++) cycleContextVariant(0, 1);
      if (_ctxVariantOf(e.contextBlocks[0]) !== keys[4]) throw new Error('forward cycling is off: ' + _ctxVariantOf(e.contextBlocks[0]));
      cycleContextVariant(0, 1);
      if (_ctxVariantOf(e.contextBlocks[0]) !== '') throw new Error('cycling did not wrap back to Standard');
      cycleContextVariant(0, -1);
      if (_ctxVariantOf(e.contextBlocks[0]) !== keys[4]) throw new Error('backward cycling is off');
      // Junk and no-variant items are refused rather than blanking the drawing.
      setContextVariant(0, 'nope');
      if (_ctxVariantOf(e.contextBlocks[0]) !== keys[4]) throw new Error('an unknown style key was accepted');
      const e2 = seed();
      addContextBlock('door-guest');
      setContextVariant(0, 'b67');
      if (_ctxVariantOf(e2.contextBlocks[0])) throw new Error('an item with no styles took one');
      cycleContextVariant(0, 1);
      if (_ctxVariantOf(e2.contextBlocks[0])) throw new Error('cycling an item with no styles did something');
    });

    __check('a style reaches the screen and the export, and never the side view', () => {
      const e = seed();
      addContextBlock('bed-king');
      setContextVariant(0, BED_STYLE_VARIANTS[0].key);
      drawElevAll();
      const art = document.getElementById('context-layer').querySelector('.ctx-art');
      if (!art) throw new Error('the styled bed lost its art');
      if (art.dataset.ctxArtVariant !== BED_STYLE_VARIANTS[0].key) {
        throw new Error('the style is not published to the exporter');
      }
      const vb = art.querySelector('svg').getAttribute('viewBox');
      if (vb !== '0 0 100 ' + BED_STYLE_VARIANTS[0].h) throw new Error('the wrong viewBox was drawn: ' + vb);
      // The export must resolve through the same three-part key.
      const xi = S.indexOf('const artP = artEl ?');
      if (S.slice(xi, xi + 220).indexOf('ctxArtVariant') < 0) throw new Error('the export ignores the style');
      // FRONT ONLY: the source sheet is frontal elevation, so a turned bed falls back to
      // the hand-drawn side rather than stretching a front drawing into a side box.
      const side = _ctxArtFor('bed-king', 'side', BED_STYLE_VARIANTS[0].key);
      if (side.variant) throw new Error('a front-only style leaked into the side view');
      if (side.w !== _ctxPreset('bed-king').side.w) throw new Error('the side view lost its own size');
    });

    __check('the side view reaches the screen and the export, not just the model', () => {
      const e = seed();
      addContextBlock('sofa');
      setContextView(0, 'side');
      drawElevAll();
      const el = document.getElementById('context-layer').querySelector('.ctx-block');
      const art = el.querySelector('.ctx-art');
      if (!art) throw new Error('the turned sofa lost its art');
      if (art.dataset.ctxArtView !== 'side') throw new Error('the view is not published to the exporter');
      const drawn = art.querySelector('svg').getAttribute('viewBox');
      const sideP = _ctxPreset('sofa').side;
      if (drawn !== '0 0 ' + sideP.w + ' ' + sideP.h) throw new Error('the front viewBox was drawn for a side view: ' + drawn);
      // The exporter must resolve through the SAME function, or a turned block prints
      // its front drawing stretched into a side-shaped box.
      const xi = S.indexOf('const artP = artEl ?');
      if (xi < 0) throw new Error('the export no longer resolves art by preset + view');
      if (S.slice(xi, xi + 200).indexOf('ctxArtView') < 0) throw new Error('the export ignores the view');
    });

    __check('the pillows are back, and the bathroom and bedroom got real detail', () => {
      // "Is there anyway we can get more detail, like pillows on the beds… Need more
      // bedroom details… lamps, sofa, side chair, lounge chair, they all look kind of
      // blocky right now."
      const g = (k) => CONTEXT_PRESETS.find(p => p.key === k);
      ['bed-queen', 'bed-king', 'bed-full'].forEach(k => {
        // Pillow domes are cubic curves on the mattress deck — a bed drawn only with
        // rects and straight lines is the version that had none.
        if ((g(k).svg.match(/ C[\\d.]/g) || []).length < 1) throw new Error(k + ' has no pillow profile');
        if (!_ctxHasSide(g(k))) throw new Error(k + ' has no side view');
      });
      // A bathroom category with the fixtures a hospitality bath actually carries.
      if (!CONTEXT_LIBRARY.some(c => c.cat === 'Bath')) throw new Error('there is no Bath category');
      ['vanity-ada', 'vanity-60', 'lav-wall', 'toilet-ada', 'toilet-tank', 'tub', 'shower',
       'grab-36', 'grab-42', 'towel-bar'].forEach(k => {
        if (!g(k)) throw new Error('missing bath item ' + k);
      });
      // SINK DETAIL: the ADA vanity draws a real basin with a rim and a drain, not a box.
      const van = g('vanity-ada');
      if (van.svg.indexOf('circle') < 0) throw new Error('the ADA vanity has no drain');
      if ((van.svg.match(/a[\\d.]+ [\\d.]+ 0 0 0/g) || []).length < 2) {
        throw new Error('the ADA vanity basin is not drawn as a bowl');
      }
      // Code heights, which are the reason these are library items at all.
      if (g('grab-36').aff !== 34 || g('grab-42').aff !== 34) throw new Error('grab bars are not at 34in AFF');
      if (g('towel-bar').aff !== 48) throw new Error('the towel bar is not at 48in AFF');
      if (g('toilet-tank').h !== 30) throw new Error('a tank toilet should run to its 30in lid');
      // Lamps, and a table lamp defaults to the NIGHTSTAND top rather than the floor.
      if (g('lamp-table').aff !== 25) throw new Error('a table lamp should sit on the 25in nightstand top');
      if (g('lamp-floor').aff !== 0) throw new Error('a floor lamp should sit on the floor');
      // Seating is no longer stacked rectangles: tapered legs and curved crests mean
      // diagonal line segments and curves, which a box drawing has none of.
      ['chair', 'lounge', 'sofa'].forEach(k => {
        const s = g(k).svg;
        if ((s.match(/[LC] ?-?[\\d.]/g) || []).length < 4) throw new Error(k + ' is still drawn as plain boxes');
        if (!_ctxHasSide(g(k))) throw new Error(k + ' has no side view');
      });
    });

    __check('a block from a library item draws its art, on screen and in the export', () => {
      const e = seed();
      addContextBlock('door-guest');
      drawElevAll();
      const el = document.getElementById('context-layer').querySelector('.ctx-block');
      const art = el.querySelector('.ctx-art');
      if (!art) throw new Error('the door did not draw its line art');
      if (art.dataset.ctxArt !== 'door-guest') throw new Error('the art is not keyed back to its library item');
      if (!art.querySelector('svg')) throw new Error('no svg was rendered');
      // The art carries its own outline, so the div must NOT also draw a border — two
      // outlines a hairline apart reads as a rendering fault. Asserted on the marker
      // class and the inline declaration, because the border shorthand serialises
      // differently across engines ('medium none', 'medium', '') and is not a reliable
      // probe for "no border".
      if (!el.classList.contains('ctx-has-art')) throw new Error('an art block is not marked as one');
      if (el.style.cssText.indexOf('1px solid') >= 0) {
        throw new Error('the block draws its own outline over the art: ' + el.style.cssText);
      }
      // The project stores the KEY, never the SVG string: the art then improves for
      // existing projects, and a save does not carry a copy of every drawing (which
      // would ride in every autosave and undo snapshot too).
      const b = e.contextBlocks[0];
      if (b.preset !== 'door-guest') throw new Error('the library key was not stored');
      if (JSON.stringify(b).indexOf('<') >= 0) throw new Error('SVG markup was stored in the project');
      // An unknown key (a hand-edited file) falls back to the primitive rather than
      // rendering nothing.
      b.preset = 'no-such-item';
      drawElevAll();
      const el2 = document.getElementById('context-layer').querySelector('.ctx-block');
      if (el2.querySelector('.ctx-art')) throw new Error('an unknown preset produced art');
      if (el2.classList.contains('ctx-has-art')) throw new Error('an unknown preset is still marked as art');
      if (el2.style.cssText.indexOf('1px solid') < 0) throw new Error('the fallback lost its outline');
      // The export emits it as a nested <svg>, over the tint and the surface hint — the
      // same stack as the screen.
      const ai = S.indexOf('const artEl = ctxEl.querySelector(');
      if (ai < 0) throw new Error('the export ignores library art');
      const tail = S.slice(ai, ai + 7000);
      if (tail.indexOf('_ctxArtSvg(artP, _ctxInkHex()') < 0) throw new Error('the export does not emit the art');
      if (!(tail.indexOf('_ctxFillOps(') < tail.indexOf('_ctxArtSvg(artP'))) {
        throw new Error('the export draws the art UNDER the surface hint, unlike the screen');
      }
    });

    __check('EXACT REPORT: Delete removes the selected blocks, no scrolling to find an x', () => {
      // "need to be able to use the delete button to get rid of all context block, I do
      // not want to have to scroll through and click the x to delete it."
      const e = seed({ blocks: [
        { id: 'a', shape: 'rect', x: 0,  y: 0, w: 10, h: 10 },
        { id: 'b', shape: 'rect', x: 20, y: 0, w: 10, h: 10 },
        { id: 'c', shape: 'rect', x: 40, y: 0, w: 10, h: 10 },
      ] });
      if (_ctxSelectedCount() !== 0) throw new Error('a fresh wall has a selection');
      e.contextBlocks[0].selected = true;
      e.contextBlocks[2].selected = true;
      if (_ctxSelectedCount() !== 2) throw new Error('the count is wrong');
      if (deleteSelectedContextBlocks() !== 2) throw new Error('delete did not report what it removed');
      if (e.contextBlocks.length !== 1 || e.contextBlocks[0].id !== 'b') {
        throw new Error('delete removed the wrong blocks: ' + e.contextBlocks.map(x => x.id).join(','));
      }
      // Nothing selected → nothing happens, and it says so, so the key handler knows not
      // to swallow Delete and break it everywhere else.
      if (deleteSelectedContextBlocks() !== 0) throw new Error('delete with no selection claimed a deletion');
      if (e.contextBlocks.length !== 1) throw new Error('delete with no selection removed something');
      // Select-all then Delete clears a traced wall in two keystrokes.
      seed({ blocks: [{ id: '1', x: 0, y: 0, w: 5, h: 5 }, { id: '2', x: 9, y: 0, w: 5, h: 5 }] });
      if (selectAllContextBlocks() !== 2) throw new Error('select-all did not take everything');
      if (deleteSelectedContextBlocks() !== 2) throw new Error('select-all + delete did not clear the wall');
      // The key handler must be wired, gated on there BEING a selection, and must not
      // steal Delete from the custom-line branch when nothing is selected.
      const di = S.indexOf("(e.key === 'Delete' || e.key === 'Backspace') && _ctxSelectedCount()");
      if (di < 0) throw new Error('Delete is not wired to context blocks');
      const cli = S.indexOf("(e.key === 'Delete' || e.key === 'Backspace') && selectedCustomLine");
      if (!(di < cli)) throw new Error('the custom-line Delete branch runs first and shadows this one');
      // Ctrl+A is scoped to the Context tab so it cannot hijack select-all elsewhere.
      const si = S.indexOf("(e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey)");
      if (si < 0) throw new Error('Ctrl+A is not wired');
      if (S.slice(si, si + 200).indexOf("_elevSidebarTab === 'context'") < 0) {
        throw new Error('Ctrl+A is not scoped to the Context tab');
      }
    });

    __check('selection is extendable and is dropped when you click away', () => {
      // Ctrl/Shift-click extends, the same modifier set frames use — that is what lets
      // Delete take several at once. Captured at MOUSEDOWN, since by mouseup the key may
      // have been released.
      const ci = S.indexOf('function _makeContextDraggable');
      const body = S.slice(ci, ci + 3000);
      if (body.indexOf('e.ctrlKey || e.metaKey || e.shiftKey') < 0) {
        throw new Error('a block click cannot extend the selection');
      }
      // A block left selected after you click elsewhere is a block Delete would silently
      // take, so both the empty-wall click and a frame click clear it.
      const mu = S.indexOf('function _elevMarqueeUp');
      if (S.slice(mu, mu + 1400).indexOf('_ctxClearSelection()') < 0) {
        throw new Error('clicking empty wall leaves a block selected');
      }
      const fd = S.indexOf('function makeElevDraggable');
      if (S.slice(fd, fd + 2000).indexOf('_ctxClearSelection()') < 0) {
        throw new Error('clicking a frame leaves a block selected');
      }
      // Marquee picks blocks up too, matched by ID rather than index.
      if (S.slice(mu, mu + 2600).indexOf('dataset.ctxId') < 0) {
        throw new Error('the marquee cannot select context blocks');
      }
      const e = seed({ blocks: [{ id: 'a', x: 0, y: 0, w: 10, h: 10 }] });
      e.contextBlocks[0].selected = true;
      if (!_ctxClearSelection()) throw new Error('clearing reported no change when there was one');
      if (e.contextBlocks[0].selected) throw new Error('the selection survived');
      if (_ctxClearSelection()) throw new Error('clearing an empty selection reported a change');
    });

    __check('Clear all confirms, and only touches this wall', () => {
      let asked = null;
      const realConfirm = window.showConfirmModal;
      window.showConfirmModal = (t, b, y, n, onYes) => { asked = { t, b }; onYes(); };
      elevUnit = 'in'; dashUnit = 'in';
      elevations = [
        { name: 'A', wallW: 240, wallH: 108, frames: [], personPos: { x: -60 },
          contextBlocks: [{ id: 'a', x: 0, y: 0, w: 5, h: 5 }, { id: 'b', x: 9, y: 0, w: 5, h: 5 }],
          underlay: { src: 'x', natW: 10, natH: 10, x: 0, y: 0, w: 10, h: 10 } },
        { name: 'B', wallW: 240, wallH: 108, frames: [], personPos: { x: -60 },
          contextBlocks: [{ id: 'c', x: 0, y: 0, w: 5, h: 5 }] },
      ];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      clearAllContextBlocks();
      if (!asked) throw new Error('a bulk delete did not confirm first');
      if (asked.b.indexOf('Undo') < 0) throw new Error('the confirmation does not say it is reversible');
      if (elevations[0].contextBlocks.length !== 0) throw new Error('Clear all did not clear this wall');
      if (elevations[1].contextBlocks.length !== 1) throw new Error('Clear all reached another wall');
      if (!elevations[0].underlay) throw new Error('Clear all removed the client elevation too');
      // Nothing to clear → no dialog, rather than an empty confirmation.
      asked = null;
      clearAllContextBlocks();
      if (asked) throw new Error('Clear all prompted with nothing to delete');
      window.showConfirmModal = realConfirm;
    });

    __check('the library covers the hospitality vocabulary, with sane real-world sizes', () => {
      // Guestrooms, lobbies, corridors, elevator lobbies — the elevations this tool is
      // pointed at. A library is only worth having if the numbers are right.
      const cats = CONTEXT_LIBRARY.map(c => c.cat);
      ['Openings', 'Millwork', 'Furniture', 'Fixtures', 'Basic'].forEach(c => {
        if (cats.indexOf(c) < 0) throw new Error('missing category ' + c);
      });
      ['Beds', 'Doors'].forEach(c => {
        if (cats.indexOf(c) < 0) throw new Error('missing category ' + c);
      });
      ['door-guest', 'door-ada-bath', 'door-closet', 'bed-queen', 'bed-king', 'bed-full',
       'tv-55', 'vanity-ada', 'toilet-ada', 'sconce',
       'window', 'shelf', 'credenza', 'headboard', 'chair', 'table',
       'nightstand', 'mirror', 'handrail', 'elevator'].forEach(k => {
        if (!CONTEXT_PRESETS.some(p => p.key === k)) throw new Error('missing library item ' + k);
      });
      // Keys must be unique or _ctxPreset silently resolves to whichever came first.
      const keys = CONTEXT_PRESETS.map(p => p.key);
      if (new Set(keys).size !== keys.length) throw new Error('duplicate keys in the library');
      // Every item has to be drawable and fillable, or it renders as a fallback box and
      // the size in its tooltip is a lie.
      CONTEXT_PRESETS.forEach(p => {
        if (CONTEXT_SHAPES.indexOf(p.shape) < 0) throw new Error(p.key + ' has an unknown shape');
        if (CONTEXT_FILLS.indexOf(p.fill) < 0) throw new Error(p.key + ' has an unknown fill');
        if (!(p.w > 0) || !(p.h > 0)) throw new Error(p.key + ' has no size');
      });
      // EVERY dimension the user specified, exactly. These are the numbers art gets
      // planned against, so a typo here is a wrong drawing, not a cosmetic slip.
      const g = (k) => CONTEXT_PRESETS.find(p => p.key === k);
      const dim = (k, w, h) => {
        const p = g(k);
        if (p.w !== w || p.h !== h) throw new Error(k + ' should be ' + w + 'x' + h + ', got ' + p.w + 'x' + p.h);
      };
      dim('bed-queen', 60, 24); dim('bed-king', 76, 24); dim('bed-full', 54, 24);
      dim('door-guest', 36, 84); dim('door-ada-bath', 36, 80); dim('door-closet', 72, 80);
      dim('tv-55', 48.5, 28); dim('vanity-ada', 48, 34); dim('toilet-ada', 15, 18); dim('sconce', 5, 10);
      // A BED'S ELEVATION HEIGHT IS THE MATTRESS HEIGHT (24in), not its length. Storing
      // the 80in length as the HEIGHT would draw a bed taller than the door beside it, so
      // length is metadata — carried, because someone will ask for it, but never drawn.
      if (g('bed-queen').lengthIn !== 80) throw new Error('the queen length was lost');
      if (g('bed-king').lengthIn !== 80) throw new Error('the king length was lost');
      if (g('bed-full').lengthIn !== 75) throw new Error('the full length was lost');
      ['bed-queen', 'bed-king', 'bed-full'].forEach(k => {
        if (g(k).h !== 24) throw new Error(k + ' does not use the 24in mattress height');
        if (g(k).h === g(k).lengthIn) throw new Error(k + ' is drawing its length as its height');
      });
      // AFF mode is load-bearing: 60in means the CENTRE for a TV and a sconce, the
      // UNDERSIDE for a door. Confusing the two is a foot of wall.
      if (g('tv-55').aff !== 60 || g('tv-55').affMode !== 'center') throw new Error('the TV is not centred at 60in AFF');
      if (g('sconce').aff !== 60 || g('sconce').affMode !== 'center') throw new Error('the sconce is not centred at 60in AFF');
      ['vanity-ada', 'toilet-ada', 'door-guest'].forEach(k => {
        if (g(k).aff !== 0 || g(k).affMode !== 'bottom') throw new Error(k + ' should sit on the floor');
      });
      if (g('handrail').aff !== 34) throw new Error('a corridor handrail sits at 34in AFF');
      if (g('nightstand').h !== 25) throw new Error('a nightstand top is 25in');
      // Surfaces are OPT-IN now — see the line-work check. A window's glazing reads from
      // its sash and muntins, not from a hatch filling it in.
      if (g('window').fill !== 'plain') throw new Error('a window ships with a hatch again');
      if (g('credenza').fill !== 'plain') throw new Error('a credenza ships with a hatch again');
      // An unknown key resolves to the plain Box WITHOUT recursing forever.
      if (_ctxPreset('nope').key !== 'rect') throw new Error('an unknown key did not fall back to Box');
      if (_ctxCatOf('credenza') !== 'Millwork') throw new Error('category lookup is wrong');
      if (_ctxCatOf('nope') !== CONTEXT_LIBRARY[0].cat) throw new Error('an unknown key has no category');
    });

    __check('surface fills draw as real strokes, from ONE generator shared with the export', () => {
      // Not a CSS gradient and not an SVG <pattern>: a gradient cannot be replayed into
      // the export (the trap the dimension dashes had to be dug out of) and a pattern
      // lands in Illustrator as an uneditable fill rather than as line work.
      const wood = _ctxFillOps('wood', 100, 60);
      if (!wood.length) throw new Error('wood produced no grain');
      if (wood.some(o => o.rot)) throw new Error('wood grain should run horizontal');
      if (wood.some(o => o.len !== 100)) throw new Error('grain lines should span the block');
      const glass = _ctxFillOps('glass', 100, 60);
      if (!glass.length) throw new Error('glass produced no hatch');
      if (glass.some(o => o.rot !== 135)) throw new Error('the glass hatch should be 45deg');
      if (_ctxFillOps('plain', 100, 60).length) throw new Error('plain should draw nothing');
      // Bounded, or a 240in wainscot is thousands of DOM nodes on a layer rebuilt on
      // every mousemove of a drag.
      if (_ctxFillOps('wood', 100, 100000).length > 120) throw new Error('the stroke count is unbounded');
      // Too small to read as anything → nothing, rather than a solid smear.
      if (_ctxFillOps('wood', 1, 1).length) throw new Error('a tiny block was filled with grain');
      // The export takes the SCREEN's rendered hatch verbatim rather than regenerating
      // it — one implementation of the clipping, so wood cannot land on different parts
      // in the editor and in Illustrator.
      const ei = S.indexOf("const fillWrapEl = ctxEl.querySelector('.ctx-fill')");
      if (ei < 0) throw new Error('the export ignores the surface entirely');
      // Ids are rewritten on the way out, or two blocks share one clipPath id and the
      // second is cut to the first one's region.
      if (S.slice(ei, ei + 700).indexOf('id="x') < 0) throw new Error('the exported clip ids are not made unique');
      // …and it renders on screen, keyed so the exporter can read it back.
      seed({ blocks: [{ id: 'g', shape: 'rect', fill: 'glass', x: 0, y: 0, w: 48, h: 96 }] });
      drawElevAll();
      const el = document.getElementById('context-layer').querySelector('.ctx-block');
      if (el.dataset.ctxFill !== 'glass') throw new Error('the fill is not published to the exporter');
      if (!el.querySelector('.ctx-fill svg line')) throw new Error('the hatch did not draw on screen');
      // Changing the surface must not disturb the geometry.
      setContextFill(0, 'wood');
      if (elevations[0].contextBlocks[0].fill !== 'wood') throw new Error('the fill did not change');
      setContextFill(0, 'marble');
      if (elevations[0].contextBlocks[0].fill !== 'wood') throw new Error('an invalid fill was accepted');
    });

    __check('EXACT REPORT: a full-wall layer must not swallow clicks meant for what is under it', () => {
      // "I still can not select the blocks and move them around like I can with the
      // frame mockups." #frame-layer is an inset:0 div covering the whole wall at
      // z-index 6, directly over #context-layer at z 3 — with the default
      // pointer-events it ate every click on a block. Every OTHER full-wall layer in
      // this file already sets pointer-events:none; this one was the exception.
      if (!/#frame-layer\\s*\\{[^}]*pointer-events:\\s*none/.test(C)) {
        throw new Error('#frame-layer still swallows clicks meant for context blocks');
      }
      if (!/\\.frame-vis\\s*\\{[^}]*pointer-events:\\s*auto/.test(C)) {
        throw new Error('frames no longer receive their own clicks');
      }
      // Same trap one layer down: #context-layer sat over the underlay.
      if (!/#context-layer\\s*\\{[^}]*pointer-events:\\s*none/.test(C)) {
        throw new Error('#context-layer swallows clicks meant for the client elevation');
      }
      if (!/\\.ctx-block\\s*\\{[^}]*pointer-events:\\s*auto/.test(C)) {
        throw new Error('blocks no longer receive their own clicks');
      }
      // And the block really does carry a drag handler once drawn.
      const e = seed({ blocks: [{ id: 'a', shape: 'rect', x: 10, y: 0, w: 36, h: 84 }] });
      drawElevAll();
      const el = document.getElementById('context-layer').querySelector('.ctx-block');
      if (!el || typeof el.onmousedown !== 'function') throw new Error('a block has no drag handler');
      // A click selects it, which is what links it to its row in the sidebar.
      el.onmousedown({ button: 0, clientX: 5, clientY: 5, preventDefault(){}, stopPropagation(){} });
      if (typeof document.onmouseup === 'function') document.onmouseup({ clientX: 5, clientY: 5 });
      if (!e.contextBlocks[0].selected) throw new Error('clicking a block does not select it');
    });

    __check('SHIFT is fine mode everywhere, and the wheel scales without stretching', () => {
      // Blender-style: hold shift DURING the gesture and the value crawls while the
      // pointer keeps moving normally. Read live off each event, not captured at
      // mousedown, so it can be grabbed and released mid-drag.
      if (!(ELEV_FINE_FACTOR > 0 && ELEV_FINE_FACTOR < 1)) throw new Error('the fine factor does not slow anything down');
      if (_ulFine({ shiftKey: true }) !== ELEV_FINE_FACTOR) throw new Error('shift is not fine mode');
      if (_ulFine({ shiftKey: false }) !== 1) throw new Error('unshifted movement was damped');
      if (_ulFine(null) !== 1) throw new Error('a missing event blew up');
      const mi = S.indexOf('function _ulMoveStart');
      if (S.slice(mi, mi + 1200).indexOf('_ulFine(ev)') < 0) throw new Error('the move drag ignores shift');
      const si = S.indexOf('function _ulScaleStart');
      if (S.slice(si, si + 2200).indexOf('_ulFine(ev)') < 0) throw new Error('the corner scale ignores shift');
      // Wheel scaling: one factor on BOTH axes, about the centre — a wheel is a zoom,
      // never a stretch.
      const e = seed({ underlay: { src: 'x', natW: 200, natH: 100, x: 20, y: 10, w: 100, h: 50 } });
      drawElevAll();
      togglePlaceUnderlay(true);
      const before = e.underlay.w / e.underlay.h;
      const cx = e.underlay.x + e.underlay.w / 2, cy = e.underlay.y + e.underlay.h / 2;
      _ulWheelScale({ deltaY: -100, shiftKey: false, preventDefault(){} });
      const u = e.underlay;
      if (Math.abs((u.w / u.h) - before) > 1e-6) throw new Error('the wheel stretched the image');
      if (!(u.w > 100)) throw new Error('scrolling up did not grow it: ' + u.w);
      if (Math.abs((u.x + u.w / 2) - cx) > 0.02 || Math.abs((u.y + u.h / 2) - cy) > 0.02) {
        throw new Error('the wheel did not scale about the centre');
      }
      // Shift makes a notch a fraction of the size it otherwise is.
      const coarse = u.w;
      _ulWheelScale({ deltaY: -100, shiftKey: true, preventDefault(){} });
      const fineDelta = u.w - coarse;
      if (!(fineDelta > 0) || fineDelta > coarse * ELEV_WHEEL_STEP * 0.9) {
        throw new Error('shift did not slow the wheel down: ' + fineDelta);
      }
      // Arrows nudge by the snap step, and a tenth of it with shift.
      const x0 = u.x;
      _ulArrowNudge({ key: 'ArrowRight', shiftKey: false });
      const step = _elevSnapStep();
      if (Math.abs((u.x - x0) - step) > 1e-6) throw new Error('an arrow did not nudge by the snap step');
      const x1 = u.x;
      _ulArrowNudge({ key: 'ArrowRight', shiftKey: true });
      if (Math.abs((u.x - x1) - step * ELEV_FINE_FACTOR) > 1e-6) throw new Error('shift did not refine the arrow nudge');
      if (_ulArrowNudge({ key: 'Enter' })) throw new Error('a non-arrow key was treated as a nudge');
      togglePlaceUnderlay(false);
    });

    __check('EXACT REPORT: the block list and the palette scroll, and the sidebar has tabs', () => {
      // "I can add a lot but I have no scroll option to see all my different blocks…
      // the list can get bigger and bigger but it does not seem to be contained in the
      // proper window." THE PANE is the scroll region. .elev-sidebar is a flex column
      // whose only scrolling child used to be .elev-frame-list; wrapping the sections in
      // tab panes broke that chain, because a pane with no flex sizing grows to its
      // content and runs off the bottom with nothing to scroll.
      if (!/\\.elev-tabpane\\[data-elevtabpane="context"\\],[\\s\\S]{0,120}\\{[^}]*overflow-y:\\s*auto/.test(C)) {
        throw new Error('the Context pane is not a scroll region');
      }
      // min-height:0 is the load-bearing half — without it a flex child will not shrink
      // below its content, so overflow-y alone still overflows.
      if (!/\\.elev-tabpane\\[data-elevtabpane="context"\\],[\\s\\S]{0,120}\\{[^}]*min-height:\\s*0/.test(C)) {
        throw new Error('the pane has no min-height:0, so it will not shrink to scroll');
      }
      // The ART pane must stay flex:none — it holds the fixed Add & Arrange toolbar, and
      // flex:1 there would squash the frame list that is meant to take the height.
      if (!/\\.elev-tabpane\\[data-elevtabpane="art"\\]\\s*\\{[^}]*flex:\\s*none/.test(C)) {
        throw new Error('the Art pane would steal the frame list height');
      }
      // ONE scroll region per panel: the block list must NOT also scroll, or you get a
      // scroll inside a scroll and have to find the inner one.
      if (/\\.ctx-list\\s*\\{[^}]*overflow-y:\\s*auto/.test(C)) throw new Error('the block list is a nested scroll region again');
      if (!/\\.ctx-palette\\s*\\{[^}]*overflow-y:\\s*auto/.test(C)) throw new Error('the library palette does not scroll');
      seed({ blocks: [{ id: '1', x: 0, y: 0, w: 10, h: 10 }, { id: '2', x: 20, y: 0, w: 10, h: 10 }] });
      renderContextControls();
      const listEl = document.querySelector('#contextControls .ctx-list');
      if (!listEl) throw new Error('the scrolling list container was not rendered');
      if (listEl.querySelectorAll('.gz-run').length !== 2) throw new Error('blocks are not inside the scroll container');
      // "we might need to come up with a better system to organize the elevations, like
      // break them into tabs because it is starting to take away a lot of space from the
      // Add and Arrange of Framed art and WF/EGD."
      ['art', 'context', 'glass'].forEach(k => {
        if (H.indexOf('data-elevtabpane="' + k + '"') < 0) throw new Error('missing the ' + k + ' pane');
        if (H.indexOf('data-elevtab="' + k + '"') < 0) throw new Error('missing the ' + k + ' tab');
      });
      switchElevTab('context');
      const art = document.querySelector('[data-elevtabpane="art"]');
      const ctx = document.querySelector('[data-elevtabpane="context"]');
      if (ctx.style.display === 'none') throw new Error('the selected pane is hidden');
      if (art.style.display !== 'none') throw new Error('the other pane is still showing');
      // Restored with '' and never 'block': .elev-frame-list is a flex child with its
      // own display from the stylesheet, and 'block' would flatten its layout.
      switchElevTab('art');
      if (art.style.display !== '') throw new Error('the pane was restored with a hardcoded display: ' + art.style.display);
      // Panes are HIDDEN, not detached — initElevControls renders into all of them
      // whichever tab is up, and every button must stay findable by id.
      switchElevTab('glass');
      if (!document.getElementById('contextControls')) throw new Error('a hidden pane was detached');
      if (!document.getElementById('egdWallBtn')) throw new Error('a tab switch lost a button other code syncs by id');
      // Drawing a block from the toolbar must bring its tab forward, or the list fills
      // where nobody can see it and the tool reads as broken.
      switchElevTab('art');
      _ctxOpenSection();
      if (_elevSidebarTab !== 'context') throw new Error('adding a block did not surface the Context tab');
      switchElevTab('art');
    });

    __check('shapes render distinctly and export as the right SVG primitive', () => {
      seed({ blocks: [
        { id: 'a', shape: 'ellipse', x: 0,  y: 0, w: 24, h: 24 },
        { id: 'b', shape: 'shelf',   x: 40, y: 48, w: 48, h: 1.5 },
        { id: 'c', shape: 'tv',      x: 120, y: 42, w: 60, h: 34 },
      ] });
      drawElevAll();
      const els = document.getElementById('context-layer').querySelectorAll('.ctx-block');
      if (els.length !== 3) throw new Error('not every shape drew');
      if (els[0].style.borderRadius !== '50%') throw new Error('the ellipse is not round');
      if (els[0].dataset.ctxShape !== 'ellipse') throw new Error('the shape is not published to the exporter');
      // The shelf's TOP edge is the shelf plane — the line art gets measured from — so
      // it is the edge drawn heavy.
      if (parseFloat(els[1].style.borderTopWidth) <= 1) throw new Error('the shelf plane is not emphasised');
      // A CSS border-radius has no equivalent in emitEl's border cases (they only ever
      // emit <rect>), so the exporter must branch on the shape, not re-measure the DOM.
      const ei = S.indexOf("ctxEl.dataset.ctxShape === 'ellipse'");
      if (ei < 0) throw new Error('the SVG export draws a circle as a square');
      if (S.slice(ei, ei + 1200).indexOf('<ellipse') < 0) throw new Error('no <ellipse> is emitted');
      // Changing a shape must not disturb the geometry — a box that turns out to be a
      // TV should not have to be redrawn.
      const e = elevations[0];
      const before = JSON.stringify([e.contextBlocks[0].x, e.contextBlocks[0].w]);
      setContextShape(0, 'tv');
      if (e.contextBlocks[0].shape !== 'tv') throw new Error('the shape did not change');
      if (JSON.stringify([e.contextBlocks[0].x, e.contextBlocks[0].w]) !== before) throw new Error('changing shape moved the block');
      setContextShape(0, 'sofa');
      if (e.contextBlocks[0].shape !== 'tv') throw new Error('an invalid shape was accepted');
    });

    // ── Anchoring and snapping ──────────────────────────────────────────────
    __check('EXACT ASK: the measure tool anchors to a block, by ID and not by index', () => {
      // "once I draw it I can use the m tool to attach a measurement line to it and I can
      // figure out the dims from floor, or other objects I anchor it to."
      const e = seed({ blocks: [
        { id: 'first', shape: 'rect', x: 10, y: 0,  w: 20, h: 20 },
        { id: 'door',  shape: 'rect', x: 60, y: 0,  w: 36, h: 84 },
      ] });
      elevResolvedWallW = 240; elevResolvedWallH = 108;
      const pts = anchorPointsForSnap().filter(p => p.ref === 'context');
      if (pts.length !== 16) throw new Error('expected 8 anchors per block, got ' + pts.length);
      const doorTopLeft = pts.find(p => p.cid === 'door' && p.xc === 'x0' && p.yc === 'y1');
      if (!doorTopLeft) throw new Error('the door has no top-left anchor');
      if (doorTopLeft.x !== 60 || doorTopLeft.y !== 84) throw new Error('the anchor is in the wrong place');
      // It resolves LIVE, so a line stays attached when the block is dragged.
      let r = resolveAnchor({ ref: 'context', cid: 'door', xc: 'x0', yc: 'y1' });
      if (!r || r.x !== 60 || r.y !== 84) throw new Error('the anchor did not resolve');
      e.contextBlocks[1].x = 100;
      r = resolveAnchor({ ref: 'context', cid: 'door', xc: 'x0', yc: 'y1' });
      if (r.x !== 100) throw new Error('the anchor did not follow the block');
      // THE POINT OF THE ID: deleting an EARLIER block shifts every index after it. An
      // index-keyed anchor would silently re-point at a different object on a drawing an
      // installer works from.
      removeContextBlock(0);
      r = resolveAnchor({ ref: 'context', cid: 'door', xc: 'x0', yc: 'y1' });
      if (!r || r.x !== 100) throw new Error('the anchor re-pointed after an earlier block was deleted');
      // A deleted block falls back to the stored position rather than dropping the line,
      // which is what a frame anchor does too.
      const gone = resolveAnchor({ ref: 'context', cid: 'nope', xc: 'x0', yc: 'y0', x: 5, y: 6 });
      if (!gone || gone.x !== 5) throw new Error('a dangling anchor dropped its line');
      // Ids are backfilled on anything created before they existed.
      const old = { contextBlocks: [{ x: 0, y: 0, w: 10, h: 10 }] };
      if (!_elevContextBlocks(old)[0].id) throw new Error('an id-less block was not migrated');
    });

    __check('frames snap to block edges and centres, on both axes', () => {
      // Art is hung in relation to the door and the millwork at least as often as to
      // other art, so "line this piece up with the shelf" has to be a drag.
      const ci = S.indexOf('function _elevSnapTargets');
      const body = S.slice(ci, S.indexOf('let bestX = null', ci));
      ["kind: 'context-left'", "kind: 'context-right'", "kind: 'context-center'"].forEach(k => {
        if (body.indexOf(k) < 0) throw new Error('missing X target ' + k);
      });
      ["kind: 'context-bottom'", "kind: 'context-top'", "kind: 'context-vcenter'"].forEach(k => {
        if (body.indexOf(k) < 0) throw new Error('missing Y target ' + k);
      });
      // And the measure tool's coarse line targets, which are a separate list.
      const e = seed({ blocks: [{ id: 'd', shape: 'rect', x: 60, y: 0, w: 36, h: 84 }] });
      elevResolvedWallW = 240; elevResolvedWallH = 108;
      const t = customLineSnapTargets();
      if (t.xs.indexOf(60) < 0 || t.xs.indexOf(96) < 0) throw new Error('block edges are not line-snap targets');
      if (t.ys.indexOf(84) < 0) throw new Error('the block top is not a line-snap target');
    });

    __check('EXACT REPORT: wood only lands on the parts that ARE wood', () => {
      // "lines going horizontal covering everything… it should only be within parts that
      // can be actual wood." The hatch used to fill the block's whole rectangle, so
      // asking for wood on a bed ran grain straight across the mattress and the pillows.
      const bed = _ctxPreset('bed-queen');
      if (!bed.hatch) throw new Error('the bed declares no wood region');
      // The region is the PLINTH ONLY — it must not reach up into the mattress, whose
      // slab occupies y 0..10.
      if (/M4 19/.test(bed.hatch) === false) throw new Error('the bed wood region is not its plinth: ' + bed.hatch);
      if (bed.hatch.indexOf('height="24"') >= 0 || /h60/.test(bed.hatch)) {
        throw new Error('the bed wood region covers the whole block again');
      }
      // Per VIEW, because the wooden parts differ end-on and lengthwise — the side view
      // gains a headboard.
      if (!bed.side.hatch) throw new Error('the bed side view declares no wood region');
      if (bed.side.hatch === bed.hatch) throw new Error('both views share one region, so one of them is wrong');
      // A door's leaf is timber; its jamb and hardware are not.
      const door = _ctxPreset('door-guest');
      if (!door.hatch || door.hatch.indexOf('x="2"') < 0) throw new Error('the door wood region is not its leaf');
      // Glazing hatches the GLASS inside the sash, not the frame around it.
      const win = _ctxPreset('window');
      if (!win.hatch || win.hatch.indexOf('x="2"') < 0) throw new Error('the window glass region is not inside its sash');
      // NO REGION means NO HATCH on an art block — guessing would put grain back on the
      // bedding, so the safe default is to draw none.
      const e = seed();
      addContextBlock('sofa');
      e.contextBlocks[0].fill = 'wood';
      drawElevAll();
      const sofaEl = document.getElementById('context-layer').querySelector('.ctx-block');
      if (sofaEl.querySelector('.ctx-fill svg line')) throw new Error('a sofa with no wood region was hatched anyway');
      // A block WITH a region does get one, clipped.
      const e2 = seed();
      addContextBlock('bed-queen');
      e2.contextBlocks[0].fill = 'wood';
      drawElevAll();
      const bedEl = document.getElementById('context-layer').querySelector('.ctx-block');
      const fillSvg = bedEl.querySelector('.ctx-fill svg');
      if (!fillSvg) throw new Error('the bed plinth was not hatched');
      if (!fillSvg.querySelector('clipPath')) throw new Error('the hatch is not clipped to the wood region');
      // A PLAIN primitive (no art) still fills its whole box — that is the one case
      // where the rectangle IS the material.
      const e3 = seed({ blocks: [{ id: 'p', shape: 'rect', fill: 'wood', x: 0, y: 0, w: 48, h: 96 }] });
      drawElevAll();
      const plain = document.getElementById('context-layer').querySelector('.ctx-block');
      if (!plain.querySelector('.ctx-fill svg line')) throw new Error('a plain wood panel lost its grain');
    });

    __check('EXACT ASK: blocks move like frames — group drag, arrow nudge, snapping', () => {
      // "need to be able to move the context blocks with the arrow key similar to the
      // framed tools, I really want the same functions as the framed mock ups like group
      // select and move."
      const e = seed({ blocks: [
        { id: 'a', shape: 'rect', x: 0,  y: 0, w: 10, h: 10 },
        { id: 'b', shape: 'rect', x: 40, y: 0, w: 10, h: 10 },
        { id: 'c', shape: 'rect', x: 80, y: 0, w: 10, h: 10 },
      ] });
      const el = document.getElementById('dragSnap'); if (el) el.value = '1';
      // Arrow nudge acts on the WHOLE selection, keeping relative spacing.
      e.contextBlocks[0].selected = true;
      e.contextBlocks[2].selected = true;
      if (nudgeSelectedContextBlocks('ArrowRight', false) !== 2) throw new Error('the nudge did not move both selected blocks');
      if (Math.abs(e.contextBlocks[0].x - 1) > 1e-6) throw new Error('block a did not move one step: ' + e.contextBlocks[0].x);
      if (Math.abs(e.contextBlocks[2].x - 81) > 1e-6) throw new Error('block c did not move with it');
      if (e.contextBlocks[1].x !== 40) throw new Error('an unselected block moved too');
      // Shift refines to a tenth of a step, matching every other precision path here.
      nudgeSelectedContextBlocks('ArrowUp', true);
      if (Math.abs(e.contextBlocks[0].y - ELEV_FINE_FACTOR) > 1e-6) throw new Error('shift did not refine the nudge');
      if (nudgeSelectedContextBlocks('Enter', false) !== 0) throw new Error('a non-arrow key nudged');
      _ctxClearSelection();
      if (nudgeSelectedContextBlocks('ArrowRight', false) !== 0) throw new Error('nudging with nothing selected moved something');
      // Wired to the keyboard, and AHEAD of the underlay-placing branch is wrong — that
      // mode owns the arrows while it is on, so it must be checked first.
      const ki = S.indexOf("_ctxSelectedCount() && e.key.indexOf('Arrow') === 0");
      if (ki < 0) throw new Error('arrow keys are not wired to context blocks');
      if (S.slice(ki, ki + 200).indexOf('!_ulPlacing') < 0) throw new Error('arrow nudge would fight the underlay placing mode');
      // GROUP DRAG and SNAPPING both live in the drag handler.
      const di = S.indexOf('function _makeContextDraggable');
      const body = S.slice(di, di + 3600);
      if (body.indexOf('_ctxComputeSnap(') < 0) throw new Error('a dragged block does not snap to anything');
      if (body.indexOf('renderSnapGuides(') < 0) throw new Error('no snap guides are drawn while dragging a block');
      if (body.indexOf('sel.length > 1') < 0) throw new Error('dragging one of several selected blocks does not move the group');
      // Snapping is SKIPPED for a group — per-block snapping would pull each one to its
      // own target and take the arrangement apart.
      if (body.indexOf('!multi &&') < 0) throw new Error('a group drag still snaps per block');
    });

    __check('the block snap pool is the SAME one frames use', () => {
      // A block that lines up with a frame on screen but not in the model is worse than
      // no snapping at all, so both drags pull from one gatherer.
      const e = seed({ blocks: [{ id: 'a', shape: 'rect', x: 0, y: 0, w: 20, h: 20 }] });
      e.frames.push({ letter: 'A', active: true, x: 100, y: 0, w: 24, h: 24, dimTo: [], distToggles: {} });
      elevFrames = e.frames;
      elevScale = 1;                     // 1 unit == 1px so the threshold is in units
      const wwEl = document.getElementById('wallW'); if (wwEl) wwEl.value = '240';
      // Two units shy of the frame's left edge — inside the snap threshold.
      const r = _ctxComputeSnap(e.contextBlocks[0], 98, 0);
      if (Math.abs(r.snappedX - 100) > 0.001) throw new Error('a block did not snap to a frame edge: ' + r.snappedX);
      if (!r.guides.length) throw new Error('no guide was reported for the block snap');
      // A block must not snap to ITSELF, which would pin it in place.
      const t = _elevSnapTargets({ blockId: 'a' });
      if (t.xTargets.some(x => x.kind === 'context-left' && x.value === 0)) {
        throw new Error('the dragged block is still its own snap target');
      }
      // And the frame drag still works through the same engine.
      const fr = computeSnapForDrag(0, 18, 0);
      if (Math.abs(fr.snappedX - 20) > 0.001) throw new Error('the frame drag broke: ' + fr.snappedX);
    });

    __check('context is inside the capture signature, so a block re-renders the deck pages', () => {
      // _elevCaptureSignature serialises the whole elevations array, so new per-elevation
      // fields ride along for free — but only while that stays true. If it is ever
      // narrowed to a field list, a traced door would be on screen and stale in every
      // cached breaker and install-guide capture.
      const e = seed();
      const before = _elevCaptureSignature();
      e.contextBlocks.push({ x: 0, y: 0, w: 36, h: 84, label: 'Door' });
      if (_elevCaptureSignature() === before) throw new Error('adding a context block did not change the capture signature');
      // The underlay's data URL must not be hashed whole — that is megabytes of base64
      // compared on every history push.
      e.underlay = { src: 'data:image/png;base64,' + 'A'.repeat(5000), x: 0, y: 0, w: 240, h: 108, opacity: 0.4 };
      const sig = _elevCaptureSignature();
      if (sig === null) throw new Error('the signature failed outright with an underlay present');
      if (sig.indexOf('A'.repeat(300)) >= 0) throw new Error('the whole image is being hashed on every edit');
    });

    // ── Proportion lock (16.82) ─────────────────────────────────────────────
    __check('EXACT ASK: scaling a block up keeps its proportions instead of stretching it', () => {
      // "we need to lock the width and height of the context blocks so when you scale
      // them up they are proportioned correctly and not stretching or squishing". The art
      // is drawn with preserveAspectRatio="none" to fill the box, so a box at the wrong
      // proportion distorts every stroke in the drawing — a bed 3x too wide for its height
      // is a bed with 3x-wide hinges, pulls and mattress tape.
      const e = seed();
      const p = _ctxPreset('bed-queen');
      if (!p) throw new Error('the queen bed left the library, so this check is testing nothing');
      e.contextBlocks.push(_ctxNewBlock(p, 0, 0, p.w, p.h));
      const b = e.contextBlocks[0];
      const a0 = b.w / b.h;
      // Scale the WIDTH up: the height must follow, and the shape must be identical.
      setContextField(0, 'w', p.w * 2);
      if (Math.abs(b.w / b.h - a0) > 0.001) throw new Error('scaling the width stretched the block: ' + b.w + 'x' + b.h);
      if (Math.abs(b.h - p.h * 2) > 0.01) throw new Error('the height did not follow the width: ' + b.h);
      // And the other way round — the field typed is the one that stands.
      setContextField(0, 'h', p.h);
      if (Math.abs(b.h - p.h) > 0.001) throw new Error('the typed height was overwritten: ' + b.h);
      if (Math.abs(b.w - p.w) > 0.01) throw new Error('the width did not follow the height: ' + b.w);
    });

    __check('the lock is per block, defaults ON, and a freeform shape is born unlocked', () => {
      // Default ON for the same reason the underlay lock is: a lock you have to go and
      // find is off at the moment it matters. But a hand-traced Box IS whatever rectangle
      // was dragged, so holding a proportion there fights the tool you reached for.
      const door = _ctxNewBlock(_ctxPreset('door-guest'), 0, 0, 36, 84);
      if (!_ctxLocked(door)) throw new Error('a catalogue item is born unlocked');
      const box = CONTEXT_PRESETS.find(p => p.freeform);
      if (!box) throw new Error('no freeform preset to test');
      if (_ctxLocked(_ctxNewBlock(box, 0, 0, 10, 10))) throw new Error('a freeform shape is born locked');
      // A block saved before the flag existed reads as locked, not as unlocked.
      if (!_ctxLocked({ w: 10, h: 10 })) throw new Error('an older block lost the lock by default');
      // Unlocking frees BOTH dimensions again.
      const e = seed();
      e.contextBlocks.push(_ctxNewBlock(_ctxPreset('door-guest'), 0, 0, 36, 84));
      toggleContextLock(0);
      if (_ctxLocked(e.contextBlocks[0])) throw new Error('the toggle did not unlock the block');
      setContextField(0, 'w', 200);
      if (e.contextBlocks[0].h !== 84) throw new Error('an unlocked block still moved its partner dimension');
      // Un-stretch puts it back on the drawing's proportions, keeping the WIDTH — width
      // is the dimension set from the wall, so it is the one to trust.
      resetContextAspect(0);
      const asp = _ctxAspect(e.contextBlocks[0]);
      if (Math.abs(e.contextBlocks[0].w / e.contextBlocks[0].h - asp) > 0.001) {
        throw new Error('un-stretch did not restore the proportion');
      }
      if (e.contextBlocks[0].w !== 200) throw new Error('un-stretch changed the width instead of the height');
    });

    __check('the proportion comes from the DRAWING, and follows the view and the variant', () => {
      // A bed turned to its side and a bed with a taller headboard are different drawings
      // with different proportions. If the lock read one fixed number the turned block
      // would hold the front drawing's shape and squash the side one into it.
      const bed = _ctxPreset('bed-queen');
      if (!_ctxHasSide(bed)) throw new Error('the queen bed lost its side view');
      const front = _ctxNewBlock(bed, 0, 0, bed.w, bed.h);
      const side = Object.assign({}, front, { view: 'side' });
      const af = _ctxAspect(front), as = _ctxAspect(side);
      if (!(af > 0) || !(as > 0)) throw new Error('no aspect was resolved for one of the views');
      if (Math.abs(af - as) < 0.001) throw new Error('the side view reuses the front proportion');
      if (Math.abs(as - bed.side.w / bed.side.h) > 0.001) throw new Error('the side aspect is not the side drawing');
      // A variant is a different headboard height at the same bed width.
      const v = _ctxVariants(bed)[0];
      if (v) {
        const withVar = Object.assign({}, front, { variant: v.key });
        if (Math.abs(_ctxAspect(withVar) - v.w / v.h) > 0.001) throw new Error('a variant does not carry its own proportion');
      }
    });

    __check('a DRAG sets the size and the lock still owns the proportion', () => {
      // A drag is a measurement, so it sets how big — but dragging a catalogue item out by
      // eye and getting a squashed drawing is the same complaint as typing a width and
      // getting one. The item's aspect is CONTAINED in the dragged rectangle, so the block
      // is never bigger than what was asked for.
      const src = S.slice(S.indexOf('function _ctxDrawUp'), S.indexOf('function _ctxBlockAt'));
      if (src.indexOf('_ctxLocked(nb)') < 0) throw new Error('the drag branch ignores the lock');
      if (src.indexOf('Math.min(nb.w / a, nb.h)') < 0) throw new Error('the drag does not contain the aspect in the dragged box');
    });

    // ── Occlusion (16.82) ───────────────────────────────────────────────────
    __check('EXACT ASK: a block masks the baseboard and any graphic behind it', () => {
      // "they should have white fill so they can be in front of the baseboard and also
      // block any graphic if we drop a wallcovering graphic behind it… we do not want any
      // important graphics to get blocked by a bed or headboard or lamp".
      // On screen this is the opaque body plus the z-order. In the EXPORT the baseboard is
      // the trap: it is emitted into midLayer, the VECTOR half written over the rasterised
      // back layer, so a full-width line prints straight across every bed while the editor
      // shows it hidden. It has to be drawn as the gaps instead.
      // Sliced FORWARD from the baseboard site — 'Unit legend' also appears in the
      // renderer, far earlier in the file, and anchoring on it gave an empty slice that
      // passed every indexOf check by accident.
      const bbi = S.indexOf("wall.querySelector('#baseboard-line')");
      if (bbi < 0) throw new Error('the baseboard is no longer emitted into the SVG');
      const bb = S.slice(bbi, bbi + 2200);
      if (bb.indexOf("'#context-layer .ctx-block'") < 0) {
        throw new Error('the exported baseboard ignores the blocks standing in front of it');
      }
      if (bb.indexOf('spans') < 0 || bb.indexOf('sort') < 0) {
        throw new Error('the baseboard is not broken into gaps around the blocks');
      }
      // Still VECTOR line work — the fix must not be "rasterise the baseboard".
      if (bb.indexOf('midLayer.push') < 0) throw new Error('the baseboard stopped being vector line work');
      // A transparent block hides nothing, and the test for that reads the COMPUTED
      // background rather than assuming what CONTEXT_FILL currently is.
      if (bb.indexOf('backgroundColor') < 0) throw new Error('occlusion is assumed rather than read off the block');
    });

    __check('the baseboard gaps are the ones a bed actually covers', () => {
      // The span arithmetic itself: overlapping blocks merge into one gap, a block clear
      // of the baseboard leaves it alone, and the line still reaches both wall edges.
      // Modelled here exactly as the exporter does it, so the shape of the algorithm is
      // pinned even though the DOM measuring is not available in jsdom.
      const run = (x0, x1, blocks, by) => {
        const spans = blocks.filter(b => by >= b.y && by <= b.y + b.h).map(b => [b.x, b.x + b.w]);
        spans.sort((a, b) => a[0] - b[0]);
        const out = []; let cx = x0;
        const seg = (a, b) => { if (b - a > 0.5) out.push([+a.toFixed(1), +b.toFixed(1)]); };
        spans.forEach(([a, b]) => { if (b <= cx) return; if (a > cx) seg(cx, Math.min(a, x1)); cx = Math.max(cx, b); });
        seg(Math.max(cx, x0), x1);
        return out;
      };
      // One bed sitting on the floor: the baseboard survives either side of it.
      let r = run(0, 240, [{ x: 60, y: 0, w: 60, h: 24 }], 4);
      if (JSON.stringify(r) !== JSON.stringify([[0, 60], [120, 240]])) throw new Error('one bed: ' + JSON.stringify(r));
      // A picture at 57in AFF does not touch the baseboard at all.
      r = run(0, 240, [{ x: 60, y: 50, w: 24, h: 24 }], 4);
      if (JSON.stringify(r) !== JSON.stringify([[0, 240]])) throw new Error('a high block broke the baseboard: ' + JSON.stringify(r));
      // Two overlapping blocks are ONE gap, not two — otherwise a sliver of baseboard
      // prints inside the overlap, between two beds pushed together.
      r = run(0, 240, [{ x: 60, y: 0, w: 60, h: 24 }, { x: 100, y: 0, w: 60, h: 24 }], 4);
      if (JSON.stringify(r) !== JSON.stringify([[0, 60], [160, 240]])) throw new Error('overlap: ' + JSON.stringify(r));
      // A block overhanging the left corner: no negative-length segment is emitted.
      r = run(0, 240, [{ x: -30, y: 0, w: 60, h: 24 }], 4);
      if (JSON.stringify(r) !== JSON.stringify([[30, 240]])) throw new Error('overhang: ' + JSON.stringify(r));
    });

    // ── The traced bed drawings (16.82) ─────────────────────────────────────
    __check('EXACT REPORT: the traced beds are joined-up line work, not a field of stubs', () => {
      // "The drawings of beds looked a little janky, you made it sound like you could
      // connect the lines better." They came out of an exploded CAD export as ~109k
      // one-segment paths; the first stitcher stopped dead at every junction and joined
      // only on an exact quantised match, so the drawings arrived as short fragments with
      // trace dust around them and hairpin spikes where a chain doubled back on itself.
      // NB: this whole block is a template literal, so every backslash has to be doubled
      // — \\s written singly collapses to a plain 's' and the split silently stops
      // separating coordinates, which turns every run into nonsense and reads as dust.
      const parse = (d) => d.split('M').filter(Boolean).map(s => {
        const n = s.trim().split(/[L\\s]+/).filter(Boolean).map(Number);
        const p = []; for (let k = 0; k + 1 < n.length; k += 2) p.push([n[k], n[k + 1]]);
        return p;
      });
      const plen = (r) => { let L = 0; for (let i = 1; i < r.length; i++) L += Math.hypot(r[i][0] - r[i-1][0], r[i][1] - r[i-1][1]); return L; };
      if (BED_STYLE_VARIANTS.length !== 5) throw new Error('the bed style set changed size');
      BED_STYLE_VARIANTS.forEach(v => {
        const runs = [];
        (v.svg.match(/ d="([^"]*)"/g) || []).forEach(m => parse(m.slice(4, -1)).forEach(r => runs.push(r)));
        if (runs.length < 10) throw new Error(v.key + ' has almost no geometry left');
        // DUST: a run under 0.9 units on a drawing normalised to 100 wide is a leftover
        // stub, and at hairline weight it reads as fuzz around the drawing. Wingback and
        // Low profile were two thirds dust before this.
        const dust = runs.filter(r => plen(r) < 0.9).length;
        if (dust > 2) throw new Error(v.key + ' still carries ' + dust + ' dust runs');
        // HAIRPINS: a near-reversal over a SHORT spur is a stitching fault, never drawing.
        // Long reversals are left alone — the V between two pillows is a real one.
        let spikes = 0;
        runs.forEach(r => {
          for (let i = 1; i < r.length - 1; i++) {
            const v1 = [r[i][0]-r[i-1][0], r[i][1]-r[i-1][1]], v2 = [r[i+1][0]-r[i][0], r[i+1][1]-r[i][1]];
            const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]);
            if (l1 < 1e-9 || l2 < 1e-9) continue;
            if ((v1[0]*v2[0] + v1[1]*v2[1]) / (l1 * l2) < Math.cos(150 * Math.PI / 180) && Math.min(l1, l2) < 6) spikes++;
          }
        });
        if (spikes) throw new Error(v.key + ' still has ' + spikes + ' short hairpin spikes');
        // The weight hierarchy is what stops traced art reading flatter than the
        // hand-drawn assets beside it — object line, detail, fine, as three nested
        // <g stroke-width> groups. "Simplify the drawing" is exactly the change that
        // would quietly collapse these onto one weight.
        const ws = (v.svg.match(/stroke-width="([\\d.]+)"/g) || []).map(m => parseFloat(m.split('"')[1]));
        if (new Set(ws).size < 3) throw new Error(v.key + ' lost its line-weight hierarchy: ' + ws.join('/'));
        if (!(ws[0] > ws[1] && ws[1] > ws[2])) throw new Error(v.key + ' weights are not heaviest-first: ' + ws.join('/'));
      });
    });

    __check('the tracer keeps corners and refuses only reversals', () => {
      // A square corner is a 90deg turn with exactly one way on. An angle limit that
      // treats it as a junction severs every rectangle in the drawing — a plinth, a drawer
      // face and a mattress edge each came apart into four separately-weighted pieces, and
      // that was the regression the first attempt at this shipped.
      const tool = T;
      if (!tool) throw new Error('the tracer source was not handed to the test');
      if (tool.indexOf('MAX_REVERSE') < 0) throw new Error('the tracer lost its reversal guard');
      if (/const MAX_TURN\\b/.test(tool)) throw new Error('the tracer is vetoing corners by turn angle again');
      if (tool.indexOf('function despike') < 0) throw new Error('the tracer lost its despike pass');
      // Joined by DISTANCE across a cell neighbourhood, not by an exact grid-key match.
      if (tool.indexOf('TOL2') < 0 || tool.indexOf('dist2') < 0) throw new Error('the tracer is back to exact-match joining');
    });
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n'
      + 'window.__indexHtml = ' + JSON.stringify(htmlSrc) + ';\n'
      + 'window.__css = ' + JSON.stringify(cssSrc) + ';\n'
      + 'window.__toolSrc = ' + JSON.stringify(toolSrc) + ';\n' + src + '\n' + testBlock);
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
