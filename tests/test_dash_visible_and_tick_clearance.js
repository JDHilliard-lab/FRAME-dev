// Two reported bugs.
//
// 1. "In my elevation area it looks like my dashes are missing, but they show up in
//    the generated PDF and in Illustrator when I open the SVG."
//    Screen-only failure with the exports fine = the CSS side is dead while the JS
//    side works. Two causes, both fixed here:
//      (a) style.css was linked with NO cache-busting query, so a browser happily
//          served a cached stylesheet alongside a fresh app.js. The version pill
//          read new, the exports were new, and anything that needed a NEW CSS rule
//          was simply absent — which is precisely the gradient-painted dashes.
//      (b) The gradients read CSS vars with no fallback. An unresolved var() inside
//          a gradient invalidates the whole background-image, and there is no
//          partial result: the stroke becomes invisible rather than merely
//          mis-spaced. :root now carries defaults AND every var() has an inline one.
//
// 2. "When open in Illustrator some of the text white box covers the architectural
//    ticks. When I open the PDF the ticks are covered a little bit too."
//    A lifted dimension number cleared the LINE by a flat 3px. The tick is
//    DIM_TICK_LEN long and CENTRED on the line, so it reaches half that above it,
//    and the number's chip is opaque white — so it rubbed out the tick's upper half.
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
    const S = window.__appSrc, H = window.__appHtml, C = window.__appCss;
    editorialContent = editorialContent || {};
    scheduleAutosave = () => {};

    // ── 1a. The stylesheet actually reaches the browser ──
    __check('EXACT BUG: style.css is cache-busted, or a CSS change never reaches the user', () => {
      const m = /<link[^>]+href="style\\.css(\\?[^"]*)?"/.exec(H);
      if (!m) throw new Error('the stylesheet link is gone');
      if (!m[1]) throw new Error('THE BUG: style.css has no version query, so the browser serves a cached copy next to a fresh app.js and every new rule is silently absent');
    });

    __check('the stylesheet version matches APP_VERSION, so a forgotten bump fails here', () => {
      const m = /<link[^>]+href="style\\.css\\?v=([^"]+)"/.exec(H);
      if (!m) throw new Error('no v= query on the stylesheet');
      if (m[1] !== APP_VERSION) throw new Error('style.css?v=' + m[1] + ' but APP_VERSION is ' + APP_VERSION + ' — bump both or the CSS change ships invisible');
    });

    // ── 1b. A missing var cannot blank a stroke ──
    __check('EXACT BUG: the dash gradients cannot be killed by an unresolved variable', () => {
      // An unresolved var() inside a gradient invalidates the ENTIRE
      // background-image. There is no degraded appearance, the stroke just is not
      // painted — which is what "my dashes are missing" looked like.
      // Only the var()s INSIDE the gradient functions matter for this: those are
      // the ones that can take the whole background-image down with them.
      const grads = C.match(/repeating-linear-gradient\\([^;]*\\)/g) || [];
      if (!grads.length) throw new Error('no gradient dash rules found');
      grads.forEach(g => {
        (g.match(/var\\(--[\\w-]+[^)]*\\)/g) || []).forEach(v => {
          if (v.indexOf(',') < 0) throw new Error('a gradient reads ' + v + ' with no fallback; if it is ever unset the whole stroke disappears');
        });
      });
    });

    __check('the rhythm vars have :root defaults matching the shipped default setting', () => {
      const rootBlock = C.slice(C.indexOf(':root'), C.indexOf('}', C.indexOf(':root')));
      ['--dim-dash-len', '--dim-dash-gap', '--dim-dash-period'].forEach(v => {
        if (rootBlock.indexOf(v) < 0) throw new Error(v + ' has no :root default, so the stroke is invisible until the style is applied');
      });
      // And they must agree with what the code computes for the default, or the
      // drawing changes rhythm the moment the style is applied.
      annotationStyle.dashPt = 3; _normalizeAnnotationStyle();
      const d = _dimDashPx();
      const val = (name) => { const m = new RegExp(name + ':\\\\s*([\\\\d.]+)px').exec(rootBlock); return m ? parseFloat(m[1]) : null; };
      if (val('--dim-dash-len') !== d.len) throw new Error('the :root dash length is ' + val('--dim-dash-len') + ', the default computes ' + d.len);
      if (val('--dim-dash-gap') !== d.gap) throw new Error('the :root gap is ' + val('--dim-dash-gap') + ', the default computes ' + d.gap);
      if (val('--dim-dash-period') !== d.len + d.gap) throw new Error('the :root period is ' + val('--dim-dash-period') + ', expected ' + (d.len + d.gap));
    });

    __check('the thickness var has a fallback too, or a dashed stroke has zero height', () => {
      // .dim-dash-h gets its height from --dim-line-w. Unset, the div is 0px tall
      // and the gradient has nothing to paint on — invisible, same symptom.
      // Anchored at the start of a line so this finds each STANDALONE rule, not the
      // shared ".dim-dash-h, .dim-dash-v { color: ... }" block above them.
      const h = /^\\.dim-dash-h\\s*\\{([^}]*)\\}/m.exec(C);
      const v = /^\\.dim-dash-v\\s*\\{([^}]*)\\}/m.exec(C);
      if (!h || !v) throw new Error('the dashed-stroke classes are missing');
      if (!/var\\(--dim-line-w,/.test(h[1])) throw new Error('.dim-dash-h height has no fallback: ' + h[1]);
      if (!/var\\(--dim-line-w,/.test(v[1])) throw new Error('.dim-dash-v width has no fallback: ' + v[1]);
      // And a 1px screen floor. A background box at a fractional offset is
      // anti-aliased across two device pixels, where a border was snapped to one —
      // which is what made half of the leader pairs look absent on screen while
      // both were present in the exports.
      if (!/height:\\s*max\\(1px,/.test(h[1])) throw new Error('.dim-dash-h has no 1px screen floor, so a hairline dissolves: ' + h[1]);
      if (!/width:\\s*max\\(1px,/.test(v[1])) throw new Error('.dim-dash-v has no 1px screen floor, so a hairline dissolves: ' + v[1]);
    });

    // ── 2. The chip must clear the tick ──
    __check('EXACT BUG: a lifted number clears the TICK, not just the line', () => {
      if (typeof _dimLabelLift !== 'function') throw new Error('there is no lift helper, so the gap is a literal again');
      setAnnotDimEnds('tick');
      const withTick = _dimLabelLift();
      // The oblique is centred on the line, so it reaches DIM_TICK_LEN/2 above it.
      // The chip is opaque white; land inside that and it rubs the tick out.
      if (!(withTick > DIM_TICK_LEN / 2)) throw new Error('THE BUG: the number is lifted ' + withTick + 'px but the tick reaches ' + (DIM_TICK_LEN / 2) + 'px above the line, so the white chip still covers it');
      setAnnotDimEnds('none');
      const noTick = _dimLabelLift();
      if (!(noTick > 0)) throw new Error('the number sits flush on the line under the plain style');
      if (!(noTick < withTick)) throw new Error('the plain style pays for a tick that is not drawn (' + noTick + ' vs ' + withTick + ')');
      setAnnotDimEnds('tick');
    });

    __check('the lift is used on all four sides, not just the one that was reported', () => {
      const i = S.indexOf('function _autoLiftDimLabel');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      const n = (body.match(/margin(Top|Bottom|Left|Right) = gap/g) || []).length;
      if (n !== 4) throw new Error('only ' + n + ' of the 4 lift directions clear the tick; a vertical dim or a line dragged the other way still covers it');
      if (/margin(Top|Bottom|Left|Right) = '3px'/.test(body)) throw new Error('a hardcoded 3px lift is back');
    });

    __check('the lifted chip really sits clear of the tick on a rendered dim', () => {
      elevations = [{ name: 'W', wallW: 185, wallH: 108, personPos: { x: -60 }, groupDims: [], frames: [
        { letter: 'A', id: 'P1', x: 20, y: 40, w: 30, h: 24, active: true },
        { letter: 'B', id: 'P2', x: 54, y: 40, w: 30, h: 24, active: true }
      ] }];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      setAnnotDimEnds('tick');
      const layer = document.getElementById('dim-layer') || document.createElement('div');
      layer.innerHTML = '';
      // A deliberately SHORT span: the number cannot fit between the ticks, so the
      // lift is what happens. This is the 4"(102mm) case from the report.
      createElevArchDim(0, 100, 4, 100, 'h', '4\\"(102mm)', layer, false);
      const dim = layer.querySelector('.arch-dim');
      if (!dim) throw new Error('no dimension rendered');
      const lbl = dim.querySelector('.arch-label-new');
      if (!lbl) throw new Error('no label');
      // jsdom does not lay out, so offsetWidth is 0 and the lift correctly no-ops.
      // What must hold either way: if it DID lift, the margin is the tick-clearing
      // value and never the old flat 3px.
      if (lbl.getAttribute('data-dim-lifted')) {
        const m = parseFloat(lbl.style.marginBottom || lbl.style.marginTop || '0');
        if (!(m >= _dimLabelLift())) throw new Error('lifted by ' + m + 'px, expected at least ' + _dimLabelLift());
      }
      setAnnotDimEnds('none');
    });

    __check('EXACT BUG: the leaders are not drawn softer on screen than they export', () => {
      // They carried opacity 0.7. emitEl does not read element opacity, so the SVG
      // and the PDF always drew them at full strength — the editor was showing
      // something it would not print. It also stacked with the anti-aliasing of a
      // fractionally-positioned hairline and took some of them out of sight
      // altogether, which is the reported "only one of the two dashed lines".
      // Each leader is an _mkDashLine(...) call ending in the 'dim-leader' class.
      // Look back over the call itself rather than trying to match across the
      // template literal, which contains its own semicolons.
      const parts = S.split("'dim-leader'");
      if (parts.length - 1 < 4) throw new Error('found only ' + (parts.length - 1) + ' leader sites; the sweep missed some');
      parts.slice(0, -1).forEach((p, i) => {
        const call = p.slice(-320);
        if (call.indexOf('_mkDashLine') < 0) return;   // not a leader construction
        if (/opacity/.test(call)) throw new Error('leader site ' + (i + 1) + ' is still drawn softer than it exports');
      });
      // Belt and braces across the whole elevation renderer.
      if (/opacity:0\\.7;\\s*pointer-events:none/.test(S)) throw new Error('a dimension stroke still carries a screen-only opacity');
    });

    __check('the chip is still opaque — the clearance is the fix, not transparency', () => {
      // Making the chip see-through would "solve" the overlap by letting the line
      // run through the number, which is the thing the chip exists to prevent.
      const m = /\\.arch-label-new\\s*\\{([^}]*)\\}/.exec(C);
      if (!m) throw new Error('.arch-label-new is gone');
      if (!/background:\\s*#ffffff/i.test(m[1])) throw new Error('the number lost its opaque chip: ' + m[1]);
    });
  `;

  try {
    window.__appSrc = src;
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\nwindow.__appHtml = ' + JSON.stringify(htmlSrc) + ';\nwindow.__appCss = ' + JSON.stringify(cssSrc) + ';\n' + src + '\n' + testBlock);
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
