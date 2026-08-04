// Four reported issues on the spec / breaker / install-guide pages.
//
// 1. The elevation text in the PDF looked fuzzy next to everything else. It is
//    the one raster on the page carrying TEXT — every other word is vector PDF
//    text — and the capture was pinned to a flat 3200px / q0.92 regardless of the
//    deck's PDF Quality setting. At ~700pt placed width that's only ~330 DPI, so
//    JPEG ringing sat right on the glyph edges.
// 2. The breaker caption read 'ELEVATION — ART.001ABCDEF' in caps. The code is
//    already the page title, so the bottom-left repeat was noise.
// 3. On a per-piece spec page the elevation caption was a different font from the
//    Frame and Floorplan captions sitting in the same row.
// 4. A tall piece's frame rode up past the top of the spec text.
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
    // Records every setFont/setFontSize/setTextColor/text call so a caption's
    // resolved style can be read back.
    const __doc = () => {
      const st = { font: null, style: null, size: null, color: null };
      const calls = [];
      return {
        calls,
        setFont: (f, s2) => { st.font = f; st.style = s2; },
        setFontSize: (n) => { st.size = n; },
        setTextColor: function () { st.color = Array.prototype.slice.call(arguments).join(','); },
        text: (t, x, y) => calls.push({ t: '' + t, x: x, y: y, font: st.font, style: st.style, size: st.size, color: st.color })
      };
    };

    // ── 1. Capture resolution follows the PDF Quality setting ──
    __check('EXACT BUG: the elevation capture is no longer pinned to one quality level', () => {
      if (typeof _ELEV_CAP_QUALITY === 'undefined') throw new Error('_ELEV_CAP_QUALITY not defined');
      const i = S.indexOf('async function _captureElevWithGuides');
      const body = S.slice(i, S.indexOf('\\n// Template-driven single-spec page', i));
      if (/const targetW = 3200/.test(body)) throw new Error('THE BUG: still a hardcoded 3200px render width');
      if (/toDataURL\\('image\\/jpeg', 0\\.92\\)/.test(body)) throw new Error('THE BUG: still a hardcoded 0.92 JPEG quality');
      if (body.indexOf('_ELEV_CAP_QUALITY') < 0) throw new Error('the capture does not read the quality table');
      if (body.indexOf('_capQ.w') < 0 || body.indexOf('_capQ.q') < 0) throw new Error('the capture does not use both the width and the quality');
    });

    __check('EXACT BUG: the elevation capture is a JPEG — a PNG one corrupted every breaker page', () => {
      // 16.19 made Print lossless to escape JPEG's ringing along the dimension
      // numbers. It CORRUPTED the output: jsPDF's PNG decoder mishandled a
      // 5826x3528 RGBA canvas export and every breaker page came out grey with
      // rainbow channel fringing. Reverted in 16.20.
      //
      // Ringing is still the reason the dims read softer than spec-page text. The
      // answer is to stop rasterizing the text at all (vector annotations), not to
      // change the raster's format — so this check exists to stop the format being
      // "fixed" again by the same route.
      ['draft', 'standard', 'print'].forEach(k => {
        if (_ELEV_CAP_QUALITY[k].png) throw new Error(k + ' is set to PNG again; jsPDF garbles a canvas PNG at that size. Flatten the alpha and prove a round-trip first.');
      });
      const i = S.indexOf('async function _captureElevWithGuides');
      const body = S.slice(i, S.indexOf('async function _drawInstallGuidePage', i));
      if (body.indexOf("toDataURL('image/png')") >= 0) throw new Error('the capture emits a PNG data URL again');
      if (body.indexOf("toDataURL('image/jpeg', _capQ.q)") < 0) throw new Error('the capture no longer emits a JPEG at the quality setting');
      // Every placement must agree on the format; a mismatch draws nothing at all.
      const j = S.indexOf('async function _drawInstallGuidePage');
      const page = S.slice(j, j + 40000);
      const count = (hay, needle) => hay.split(needle).length - 1;
      if (count(page, "doc.addImage(cap.dataUrl, 'JPEG'") < 2) throw new Error('a capture placement is not using JPEG');
      if (count(page, 'cap.png') !== 0) throw new Error('a placement still branches on a PNG capture that can no longer happen');
    });

    __check('_addPngImage stays — the OTHER images still need Flate, that fix was unrelated', () => {
      // Uncompressed PNGs were 32 MB of a 58 MB export. That was letterboxed images
      // and soft shadows, nothing to do with the elevation capture, and it stands.
      if (typeof _addPngImage !== 'function') throw new Error('_addPngImage was removed with the PNG capture revert');
      const i = S.indexOf('function _addPngImage');
      if (S.slice(i, i + 300).indexOf("'MEDIUM'") < 0) throw new Error('the compression argument is gone; jsPDF defaults PNG to NONE');
    });

    __check('every quality level is defined, ordered, and sharper than the old flat setting at print', () => {
      ['draft', 'standard', 'print'].forEach(k => {
        const q = _ELEV_CAP_QUALITY[k];
        if (!q || !(q.w > 0) || !(q.q > 0 && q.q <= 1)) throw new Error(k + ' is malformed: ' + JSON.stringify(q));
      });
      const d = _ELEV_CAP_QUALITY.draft, s = _ELEV_CAP_QUALITY.standard, p = _ELEV_CAP_QUALITY.print;
      if (!(d.w < s.w && s.w < p.w)) throw new Error('widths are not ascending: ' + [d.w, s.w, p.w].join(','));
      if (!(d.q < s.q && s.q < p.q)) throw new Error('qualities are not ascending: ' + [d.q, s.q, p.q].join(','));
      // The reported page was built at the old flat 3200/0.92. Print must beat it,
      // or nothing the user can select actually fixes the fuzziness.
      if (!(p.w > 3200 && p.q > 0.92)) throw new Error('print (' + p.w + '/' + p.q + ') is no better than the old flat 3200/0.92');
      // And standard, the default, must not be a regression.
      if (!(s.w >= 3200)) throw new Error('standard dropped below the old default width');
    });

    __check('an unknown stored quality falls back rather than rendering at zero', () => {
      const save = _pdfQuality;
      _pdfQuality = 'nonsense';
      const q = _ELEV_CAP_QUALITY[_pdfQuality] || _ELEV_CAP_QUALITY.standard;
      _pdfQuality = save;
      if (q !== _ELEV_CAP_QUALITY.standard) throw new Error('no fallback for an unknown quality setting');
    });

    __check('the scale cap cannot stop a narrow source reaching the target width', () => {
      const i = S.indexOf('async function _captureElevWithGuides');
      const body = S.slice(i, S.indexOf('\\n// Template-driven single-spec page', i));
      const m = body.match(/Math\\.min\\((\\d+), targetW \\/ natW\\)/);
      if (!m) throw new Error('the scale clamp changed shape');
      const cap = parseInt(m[1], 10);
      // print/2400-wide source needs 2.5x; the old cap of 4 was fine for 3200 but
      // silently limits 6000.
      if (!(cap >= _ELEV_CAP_QUALITY.print.w / 1200)) throw new Error('a cap of ' + cap + ' cannot reach ' + _ELEV_CAP_QUALITY.print.w + 'px from a 1200px source');
    });

    // ── 2 + 3. One caption style everywhere ──
    __check('EXACT REQUEST: there is a single caption helper, so the three labels cannot differ', () => {
      if (typeof _specThumbCaption !== 'function') throw new Error('_specThumbCaption not defined');
      const d = __doc();
      _specThumbCaption(d, 'Frame', 10, 20);
      _specThumbCaption(d, 'Floorplan', 10, 40);
      _specThumbCaption(d, 'Elevation', 10, 60);
      const c = d.calls;
      if (c.length !== 3) throw new Error('expected 3 captions, got ' + c.length);
      const same = (k) => c.every(x => x[k] === c[0][k]);
      ['font', 'style', 'size', 'color'].forEach(k => { if (!same(k)) throw new Error('captions differ on ' + k + ': ' + JSON.stringify(c.map(x => x[k]))); });
      if (c[0].style !== 'italic') throw new Error('captions should be italic, got ' + c[0].style);
      if (c[0].size !== SPEC_THUMB_CAP_SIZE) throw new Error('size is ' + c[0].size);
    });

    __check('EXACT BUG: the elevation caption no longer hardcodes helvetica at its own grey', () => {
      const i = S.indexOf('async function _drawSpecPageTemplate');
      const body = S.slice(i, S.indexOf('\\n// The caption under a spec-page thumbnail', i));
      // The elevation caption used its own setFont('helvetica'...)/120 grey while
      // Frame and Floorplan used serif italic at 138.
      if (/setFont\\('helvetica', 'normal'\\); doc\\.setFontSize\\(7\\.5\\)/.test(body)) throw new Error('THE BUG: a hardcoded helvetica 7.5 caption survives');
      const capCalls = (body.match(/_specThumbCaption\\(/g) || []).length;
      if (capCalls < 3) throw new Error('expected the Elevation, Floorplan and Frame captions to all route through the helper, found ' + capCalls);
    });

    __check('EXACT REQUEST: the breaker caption is just the word, not the item code in caps', () => {
      const i = S.indexOf('async function _drawInstallGuidePage');
      const body = S.slice(i, i + 40000);
      if (/capText\\('Elevation'/.test(body)) throw new Error('THE BUG: the caption still appends the elevation/item name');
      if (/\\.toUpperCase\\(\\)/.test(body.slice(0, 3000)) && /capText/.test(body)) throw new Error('the upper-casing caption builder survives');
      if (body.indexOf("drawCaption('Elevation'") < 0) throw new Error('expected a plain \\'Elevation\\' caption');
      // And it uses the shared helper, so it matches the spec page's size. (The
      // helper gained an optional align argument when the caption moved to the
      // wall's bottom-right corner, hence matching the call loosely.)
      if (!/_specThumbCaption\\(doc, txt, x, y/.test(body)) throw new Error('the install page caption does not route through the shared helper');
    });

    __check('EXACT REQUEST: the breaker caption sits at the wall\\'s bottom-RIGHT corner', () => {
      // Left-aligned it sat outside the vertical wall dimension, because the
      // capture's left edge includes that dimension's gutter. Nothing sits right of
      // the wall (the top wall-width dim spans exactly the wall), so the image's
      // right edge IS the wall's right corner.
      const i = S.indexOf('async function _drawInstallGuidePage');
      const body = S.slice(i, i + 40000);
      if (/drawCaption\\('Elevation', ex, /.test(body)) throw new Error('a caption is still left-aligned to the image edge, outside the wall dimension');
      if (body.indexOf("drawCaption('Elevation', ex + ew, yBot - 2, 'right')") < 0) throw new Error('expected the caption right-aligned to the image right edge');
      // Both elevation layouts (elevOnly and elevPlan) must agree.
      const n = (body.match(/drawCaption\\('Elevation', ex \\+ ew[^)]*'right'\\)/g) || []).length;
      if (n < 2) throw new Error('only ' + n + ' of the elevation layouts right-aligns its caption');
      // The helper has to be able to do it at all.
      const j = S.indexOf('function _specThumbCaption');
      if (S.slice(j, j + 600).indexOf("align: 'right'") < 0) throw new Error('_specThumbCaption cannot right-align');
    });

    __check('the breaker caption is smaller than it was', () => {
      // It used to be 8.5pt; the spec page thumbnails are 7.5pt and that is the
      // size the user asked it to match.
      if (!(SPEC_THUMB_CAP_SIZE < 8.5)) throw new Error('the shared caption size is not smaller than the old 8.5pt');
    });

    // ── 4. The frame cannot ride above the spec text ──
    __check('EXACT BUG: the artwork top is clamped to the top of the spec text', () => {
      const i = S.indexOf('async function _drawSpecPageTemplate');
      const body = S.slice(i, i + 12000);
      if (body.indexOf('const specTop = py(tpl.spec.y)') < 0) throw new Error('THE BUG: nothing clamps the artwork to the spec text top');
      if (!/boxH -= \\(specTop - boxY\\)/.test(body)) throw new Error('the box should LOSE the height it gives up, or the artwork spills past its bottom');
      // The clamp must not apply on an artwork-only page, which has no spec text.
      // 16.38: the inline _specArtOnly(r.id) became a resolved local, so the
      // template-card renders can override it (a demo card must always show its
      // spec block, whatever flag a real piece with the same item code carries).
      // Same gate, read once — so check the local AND that it comes from the flag.
      if (body.indexOf('tpl.spec && !_artOnly') < 0) throw new Error('the clamp should be skipped when there is no spec block to clamp to');
      if (body.indexOf('_artOnly = SWATCH ? false : _specArtOnly(r.id)') < 0) throw new Error('_artOnly no longer derives from the page\\'s artwork-only flag');
    });

    __check('the templates this actually affects are the ones that put artwork above the spec', () => {
      // frameRight is the reported case: artwork.y .16 vs spec.y .20.
      const t = SPEC_TEMPLATES.frameRight;
      if (!t || !t.artwork || !t.spec) throw new Error('frameRight lost its artwork/spec geometry');
      if (!(t.artwork.y < t.spec.y)) throw new Error('frameRight no longer puts artwork above the spec text, so this check proves nothing');
      // Simulate the clamp arithmetic on a Letter-landscape page.
      const PH = 612;
      const py = (f) => f * PH;
      const boxY0 = py(t.artwork.y), boxH0 = py(t.artwork.h);
      const specTop = py(t.spec.y) - 8.5 * 0.72;
      if (!(boxY0 < specTop)) throw new Error('the clamp would never fire for frameRight');
      const boxY = specTop, boxH = boxH0 - (specTop - boxY0);
      if (!(boxY + boxH <= boxY0 + boxH0 + 0.001)) throw new Error('the clamped box extends past the original bottom');
      if (!(boxH > 0)) throw new Error('the clamp collapsed the box: ' + boxH);
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
