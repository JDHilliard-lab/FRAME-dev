// Widening the wall rail without shrinking the elevation.
//
// The request: give the rail (the column of wall tabs down the right of the
// drawing) more room, but do NOT make the drawing smaller. Those pull against
// each other, because drawElevAll fits the wall to
//     workspace width - #export-wrap padding - scrollbar reserve
// and the rail eats into workspace width. So the 30px the rail gained is paid
// for by #export-wrap's horizontal padding (80px a side -> 65px), leaving the
// usable area — and therefore the fitted drawing — byte-identical.
//
// Two ways that can silently break, both checked here:
//   1. Someone changes the rail width or the padding on its own. The invariant
//      is rail + horizontal padding == 280px.
//   2. drawElevAll used to subtract a hardcoded 160 for the padding. With the
//      padding now different per axis, a literal is wrong; it has to measure.
//
// And the export paths, which feed the elevation images inside the PDF, must
// still render at the pre-rail scale — dimension text and line weights are CSS
// px that don't scale with elevScale, so a wider usable area thins every label
// relative to the wall. They pin the padding back to 80px a side for the same
// reason they hide the rail.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
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

    const CSS = window.__cssSrc;
    const S = window.__appSrc;

    // Pull a declaration out of a rule block in style.css. A selector can have
    // more than one block (.elev-sidebar has its width in one and
    // --elev-col-template in another), so scan them all for the property.
    const __decl = (selector, prop) => {
      const re = new RegExp('(?:^|;|\\\\{)\\\\s*' + prop + '\\\\s*:\\\\s*([^;}]+)');
      let i = CSS.indexOf(selector + ' {'), found = false;
      while (i >= 0) {
        found = true;
        const m = re.exec(CSS.slice(i, CSS.indexOf('}', i)));
        if (m) return m[1].trim();
        i = CSS.indexOf(selector + ' {', i + 1);
      }
      if (!found) throw new Error(selector + ' rule not found in style.css');
      throw new Error(selector + ' has no ' + prop + ' declaration');
    };
    // CSS padding shorthand -> {x, y} totals.
    const __padTotals = (shorthand) => {
      const p = shorthand.split(/\\s+/).map(v => parseFloat(v) || 0);
      const top = p[0];
      const right = p.length > 1 ? p[1] : p[0];
      const bottom = p.length > 2 ? p[2] : top;
      const left = p.length > 3 ? p[3] : right;
      return { x: left + right, y: top + bottom };
    };

    const RAIL_W = parseFloat(__decl('.elev-wall-rail', 'width'));
    const SIDEBAR_W = parseFloat(__decl('.elev-sidebar', 'width'));
    const WRAP_PAD = __padTotals(__decl('#export-wrap', 'padding'));

    // ── The three numbers, and the budget they share ──
    __check('the wall rail is wider than the 120px it shipped at', () => {
      if (!(RAIL_W > 120)) throw new Error('.elev-wall-rail width is ' + RAIL_W + 'px — the whole point of the change was more room for wall names');
    });

    __check('EXACT REQUIREMENT: the rail\\'s extra width comes out of the sidebar and the wrap padding, not out of the drawing', () => {
      // 720 = the original 440px sidebar + 120px rail + 160px (2 x 80) of
      // horizontal padding. Anything else means the fitted elevation resized.
      const budget = SIDEBAR_W + RAIL_W + WRAP_PAD.x;
      if (budget !== 720) throw new Error('sidebar ' + SIDEBAR_W + ' + rail ' + RAIL_W + ' + horizontal padding ' + WRAP_PAD.x + ' = ' + budget + 'px, expected 720px. The drawing just got ' + Math.abs(budget - 720) + 'px ' + (budget > 720 ? 'SMALLER' : 'LARGER') + ' at fit-to-window.');
    });

    __check('vertical padding is untouched, so the fit is unchanged on the height axis too', () => {
      if (WRAP_PAD.y !== 160) throw new Error('#export-wrap vertical padding totals ' + WRAP_PAD.y + 'px, expected 160px — the rail costs no vertical space, so nothing should have been traded away here');
    });

    __check('the wrap padding is not trimmed past the point where the outer wall dimensions clip', () => {
      // createElevArchDim draws the wall width/height dims 6in outside the wall
      // (offsetDist = 6 * unitFactor), which is ~74px at a typical fit scale,
      // and at fit the padded content is only ~9px inside the workspace either
      // side. 65px a side is the floor; below it the wall-height dimension gets
      // clipped off the left edge. Take further width from .elev-sidebar.
      if (!(WRAP_PAD.x / 2 >= 65)) throw new Error('horizontal padding is down to ' + (WRAP_PAD.x / 2) + 'px a side; the outer wall-height dimension sits ~74px out and would clip');
    });

    __check('the sidebar is not squeezed below what its frame list needs', () => {
      // --elev-col-template columns + gaps = 348px, .elev-frame-list adds 40px
      // of horizontal padding, and the letter column needs ~28px.
      const tpl = __decl('.elev-sidebar', '--elev-col-template');
      const cols = tpl.trim().split(/\\s+/).map(v => parseFloat(v) || 0);
      const need = cols.reduce((a, b) => a + b, 0) + (cols.length - 1) * 4 + 40 + 28;
      if (!(SIDEBAR_W >= need)) throw new Error('.elev-sidebar is ' + SIDEBAR_W + 'px but the frame list needs ' + need + 'px — the icon columns would overflow or the letter column would collapse');
    });

    // ── The fit maths ──
    __check('EXACT BUG: drawElevAll measures #export-wrap padding instead of hardcoding 160', () => {
      const i = S.indexOf('function drawElevAll');
      if (i < 0) throw new Error('drawElevAll not found');
      const body = S.slice(i, i + 4000);
      if (/wsW\\s*-\\s*160/.test(body) || /wsH\\s*-\\s*160/.test(body)) throw new Error('still subtracting a literal 160 for the padding — that was 2 x 80px and the padding is no longer 80px on both axes, so the fit is off by 30px');
      if (body.indexOf('_elevWrapPadding()') < 0) throw new Error('drawElevAll does not call _elevWrapPadding(), so the padding is not being measured');
    });

    __check('_elevWrapPadding reads the element\\'s real padding, per axis', () => {
      const wrap = document.getElementById('export-wrap');
      const old = wrap.style.padding;
      wrap.style.padding = '10px 20px 30px 40px';
      const p = _elevWrapPadding();
      wrap.style.padding = old;
      if (p.y !== 40) throw new Error('vertical total should be 10 + 30 = 40, got ' + p.y);
      if (p.x !== 60) throw new Error('horizontal total should be 20 + 40 = 60, got ' + p.x);
    });

    __check('_elevWrapPadding falls back to the stylesheet values rather than 0 when nothing can be measured', () => {
      // A view that is display:none computes to 0 padding on some engines, and a
      // 0 here would inflate the scale instead of just being slightly off.
      const wrap = document.getElementById('export-wrap');
      const old = wrap.style.padding;
      wrap.style.padding = '0px';
      const p = _elevWrapPadding();
      wrap.style.padding = old;
      if (p.x !== 130 || p.y !== 160) throw new Error('expected the 130 / 160 fallback, got ' + p.x + ' / ' + p.y);
    });

    // ── The actual outcome the user asked for ──
    __check('EXACT REQUIREMENT: the fitted wall is the SAME size with the wide rail as it was with the narrow one', () => {
      elevations = [{ name: 'Wall A', frames: [], wallW: 185, wallH: 108, personPos: { x: -60 } }];
      currentElevIndex = 0; currentView = 'elevation';
      elevFrames = elevations[0].frames;
      elevZoomFactor = 1;
      document.getElementById('wallW').value = '185';
      document.getElementById('wallH').value = '108';

      // The whole elevation view; the workspace is whatever the sidebar and the
      // rail leave behind, which is exactly the geometry under test.
      const FULL = 1680;
      const ws = document.querySelector('#view-elevation .workspace');
      const wrap = document.getElementById('export-wrap');
      const oldPad = wrap.style.padding;
      let railW = 120, sidebarW = 440;
      Object.defineProperty(ws, 'clientWidth', { get: () => FULL - railW - sidebarW, configurable: true });
      Object.defineProperty(ws, 'clientHeight', { get: () => 800, configurable: true });

      // Before: 440px sidebar, 120px rail, 80px padding a side.
      railW = 120; sidebarW = 440; wrap.style.padding = '80px';
      drawElevAll();
      const before = parseFloat(document.getElementById('wall').style.width);

      // After: the shipped widths.
      railW = RAIL_W; sidebarW = SIDEBAR_W; wrap.style.padding = __decl('#export-wrap', 'padding');
      drawElevAll();
      const after = parseFloat(document.getElementById('wall').style.width);

      // Sanity: the rail really did take width off the workspace.
      if (!(RAIL_W > 120)) throw new Error('rail did not get wider, so this check proves nothing');
      wrap.style.padding = oldPad;
      if (Math.abs(after - before) > 0.001) throw new Error('the wall is ' + after + 'px wide now vs ' + before + 'px before — widening the rail was NOT supposed to change the drawing');
    });

    __check('a rail that grew without the trade-off really would shrink the drawing', () => {
      // Proves the check above is measuring something, not passing vacuously.
      const FULL = 1680;
      const ws = document.querySelector('#view-elevation .workspace');
      const wrap = document.getElementById('export-wrap');
      const oldPad = wrap.style.padding;
      let railW = 120;
      Object.defineProperty(ws, 'clientWidth', { get: () => FULL - railW - 440, configurable: true });
      wrap.style.padding = '80px';
      railW = 120; drawElevAll();
      const before = parseFloat(document.getElementById('wall').style.width);
      railW = RAIL_W; drawElevAll();
      const naive = parseFloat(document.getElementById('wall').style.width);
      wrap.style.padding = oldPad;
      if (!(naive < before)) throw new Error('expected the untraded wider rail to shrink the wall; got ' + naive + ' vs ' + before);
    });

    // ── Exports must not inherit the tighter screen padding ──
    __check('both export paths pin #export-wrap padding to the reference value before their redraw', () => {
      if (S.indexOf("ELEV_EXPORT_WRAP_PADDING = '80px'") < 0) throw new Error('ELEV_EXPORT_WRAP_PADDING is not the historical 80px, so exported elevations render at a different scale than every deck shipped before');
      ['exportElevPNG', 'exportElevSVG'].forEach(fn => {
        const i = S.indexOf('async function ' + fn);
        if (i < 0) throw new Error(fn + ' not found');
        const end = S.indexOf('\\nasync function ', i + 10);
        const body = S.slice(i, end > 0 ? end : i + 60000);
        const pin = body.indexOf('ELEV_EXPORT_WRAP_PADDING');
        if (pin < 0) throw new Error(fn + ' does not pin the export-wrap padding — it would measure the tighter 65px screen padding and render every dimension label finer than before');
        // The pin is only worth anything if it lands BEFORE the redraw that
        // measures it.
        const firstDraw = body.indexOf('drawElevAll()');
        if (!(pin < firstDraw)) throw new Error(fn + ' pins the padding AFTER its drawElevAll(), which is the call that measures it');
      });
    });

    __check('both export paths restore the caller\\'s padding in their finally block', () => {
      ['exportElevPNG', 'exportElevSVG'].forEach(fn => {
        const i = S.indexOf('async function ' + fn);
        const end = S.indexOf('\\nasync function ', i + 10);
        const body = S.slice(i, end > 0 ? end : i + 60000);
        const fin = body.lastIndexOf('finally');
        if (fin < 0) throw new Error(fn + ' has no finally block');
        const restore = /style\\.padding\\s*=\\s*(?:oldExportWrapPadding|_svgWrapPadInline)/g;
        let last = -1, m;
        while ((m = restore.exec(body))) last = m.index;
        if (last < 0) throw new Error(fn + ' never restores the padding');
        if (!(last > fin)) throw new Error(fn + ' restores the padding OUTSIDE its finally — a cancelled export would leave the export padding stuck on screen');
      });
    });

    __check('EXACT BUG: the PNG path restores the CALLER\\'s padding, not its own pin', () => {
      // oldExportWrapPadding is captured further down the function, after the
      // pin. Re-reading style.padding there would capture '80px' and leave the
      // export padding inline on screen for good.
      const i = S.indexOf('async function exportElevPNG');
      const end = S.indexOf('\\nasync function ', i + 10);
      const body = S.slice(i, end > 0 ? end : i + 60000);
      if (/const oldExportWrapPadding = exportWrap\\.style\\.padding/.test(body)) throw new Error('oldExportWrapPadding is re-read from the element after the pin, so restoring it leaves the 80px export padding stuck on screen');
      if (body.indexOf('const oldExportWrapPadding = _wrapPadInline') < 0) throw new Error('oldExportWrapPadding should be the value captured before the pin');
    });
  `;

  try {
    window.eval(
      'window.__appSrc = ' + JSON.stringify(src) + ';\n' +
      'window.__cssSrc = ' + JSON.stringify(cssSrc) + ';\n' +
      src + '\n' + testBlock
    );
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
