// REPORTED BUG, and the user found the cause: "I took the images into Photoshop,
// cropped them to the exact size of the glass OD for each section, and now everything
// aligns." An artwork image LARGER than its opening was making the elevation jump.
//
// The artboard bounds walk every descendant of the elevation layers and union
// getBoundingClientRect(). That call reports an element's OWN box even when an ancestor
// with overflow:hidden is cropping it — so an oversized artwork contributed its full
// size while only the cropped part was ever visible. The artboard grew, the whole
// artboard was then fitted into the page box, and the drawing came out smaller and
// floating above where it belonged.
//
// It is also the explanation for everything that looked random about it. The wireframe
// toggle (a grey block replaces the image), the scale character, and deleting a framed
// mockup all change what sits inside #frame-layer — and ANY oversized child moved the
// artboard, so the same page behaved differently depending on which of them was on.
//
// Only REAL clipping may be clamped: the outer wall dimensions sit 6in outside the wall
// with no clipping ancestor, and they must stay free to extend the bounds or an export
// crops its own dimension lines off.
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

    // The clamp, lifted out of the capture so it can be exercised directly. JSDOM has no
    // layout, so the DOM cannot produce real rects — these stub getBoundingClientRect
    // and getComputedStyle, which is exactly the pair the real code consults.
    const mkEl = (rect, overflow, parent) => {
      const el = document.createElement('div');
      el.__r = rect; el.__ov = overflow || 'visible';
      el.getBoundingClientRect = () => el.__r;
      if (parent) parent.appendChild(el);
      return el;
    };
    const _cs = window.getComputedStyle;
    window.getComputedStyle = (el) => (el && el.__ov !== undefined) ? { overflow: el.__ov, display: 'block' } : _cs(el);

    // Mirrors the clamp in _captureElevWithGuides. Kept in step by the source checks
    // below rather than by importing it — the real one closes over \`wall\`.
    const clip = (el, stop) => {
      let r = el.getBoundingClientRect();
      let p = el.parentElement;
      while (p && p !== stop) {
        let ov = ''; try { ov = window.getComputedStyle(p).overflow; } catch (e) {}
        if (ov && ov !== 'visible') {
          const pr = p.getBoundingClientRect();
          const l = Math.max(r.left, pr.left), t = Math.max(r.top, pr.top);
          const rr = Math.min(r.right, pr.right), b = Math.min(r.bottom, pr.bottom);
          if (rr <= l || b <= t) return null;
          r = { left: l, top: t, right: rr, bottom: b, width: rr - l, height: b - t };
        }
        p = p.parentElement;
      }
      return r;
    };
    const R = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t });

    __check('EXACT BUG: an oversized artwork is clamped to the opening that crops it', () => {
      const stop = document.createElement('div');
      // A frame opening 100 wide that crops its content...
      const opening = mkEl(R(0, 0, 100, 100), 'hidden', stop);
      // ...holding an image that is three times too big, as a full-bleed crop does.
      const img = mkEl(R(-100, -100, 200, 200), 'visible', opening);
      const got = clip(img, stop);
      if (!got) throw new Error('the image was discarded entirely');
      if (got.left !== 0 || got.top !== 0 || got.right !== 100 || got.bottom !== 100) {
        throw new Error('not clamped to the opening: ' + JSON.stringify(got));
      }
      // Unclamped, this is what used to reach the artboard and move it.
      const raw = img.getBoundingClientRect();
      if (raw.left !== -100) throw new Error('the fixture is wrong; the raw rect should overflow');
    });

    __check('an UNCLIPPED element still extends the bounds — outer wall dims depend on it', () => {
      // The wall dims sit 6in outside the wall with no clipping ancestor. Clamp them and
      // an export crops its own dimension lines off.
      const stop = document.createElement('div');
      const layer = mkEl(R(0, 0, 100, 100), 'visible', stop);
      const dim = mkEl(R(-40, -40, 140, 140), 'visible', layer);
      const got = clip(dim, stop);
      if (!got || got.left !== -40 || got.right !== 140) throw new Error('an unclipped rect was clamped: ' + JSON.stringify(got));
    });

    __check('an element cropped away to nothing is dropped, not counted as a point', () => {
      const stop = document.createElement('div');
      const opening = mkEl(R(0, 0, 100, 100), 'hidden', stop);
      const off = mkEl(R(300, 300, 400, 400), 'visible', opening);   // entirely outside
      if (clip(off, stop) !== null) throw new Error('a fully clipped element still contributed bounds');
    });

    __check('clipping applies through SEVERAL ancestors, not just the parent', () => {
      // A frame sits inside #frame-layer inside #wall; more than one of those can clip.
      const stop = document.createElement('div');
      const outer = mkEl(R(0, 0, 80, 80), 'hidden', stop);
      const inner = mkEl(R(0, 0, 100, 100), 'hidden', outer);
      const img = mkEl(R(-50, -50, 200, 200), 'visible', inner);
      const got = clip(img, stop);
      if (!got || got.right !== 80 || got.bottom !== 80) throw new Error('only the nearest ancestor was applied: ' + JSON.stringify(got));
    });

    __check('the walk STOPS at the wall, so the page around it cannot clamp the export', () => {
      // Everything above #wall (the workspace, the scroller) clips. If the walk did not
      // stop, a scrolled or narrow workspace would silently crop the artboard.
      const stop = mkEl(R(0, 0, 50, 50), 'hidden', null);
      const layer = mkEl(R(0, 0, 100, 100), 'visible', stop);
      const dim = mkEl(R(-20, -20, 120, 120), 'visible', layer);
      const got = clip(dim, stop);
      if (!got || got.left !== -20 || got.right !== 120) throw new Error('the walk did not stop at the wall: ' + JSON.stringify(got));
    });

    // ── The clamp is actually wired into the capture ──────────────────────────
    __check('the capture clamps every contributing rect, not the raw one', () => {
      // exportElevSVG, not _captureElevWithGuides: the capture calls it and reports the
      // artboard IT computes, so this is where the bounds are decided.
      const i = S.indexOf('async function exportElevSVG');
      if (i < 0) throw new Error('exportElevSVG not found');
      const body = S.slice(i, i + 12000);
      if (body.indexOf('const _clipToAncestors = (el) => {') < 0) throw new Error('the clamp helper is gone');
      // The union must use the clamped rect. This is the line the bug lived on.
      if (body.indexOf('const r = _clipToAncestors(el);') < 0) throw new Error('the bounds walk reads the raw rect again');
      if (body.indexOf('const r = el.getBoundingClientRect();\\n                if (r.width === 0') >= 0) {
        throw new Error('the unclamped bounds walk is back');
      }
      // Fully-clipped elements are skipped rather than treated as a zero-size point.
      if (body.indexOf('if (!r) return;') < 0) throw new Error('a fully clipped element is not skipped');
      // And the walk stops at the wall's parent, or the workspace would clamp the export.
      if (body.indexOf('const stop = wall.parentElement;') < 0) throw new Error('the walk does not stop at the wall');
    });

    __check('only non-visible overflow clamps — visible must pass through untouched', () => {
      const i = S.indexOf('const _clipToAncestors = (el) => {');
      const body = S.slice(i, i + 900);
      if (body.indexOf("ov !== 'visible'") < 0) throw new Error('the clamp does not test for real clipping');
      // getComputedStyle can throw on a detached node mid-capture; the walk must survive.
      if (body.indexOf('try { ov = getComputedStyle(p).overflow; } catch (e) {}') < 0) {
        throw new Error('a getComputedStyle failure would abort the bounds walk');
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
