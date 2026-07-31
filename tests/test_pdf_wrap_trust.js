// THE REPORTED BUG: every paragraph looked right in Deck Studio and then came out
// of the PDF as ONE long line running off the page.
//
// Deck Studio wraps in the DOM; the PDF wraps itself, in _layoutRichLines, using a
// canvas measureText. A previous fix (see test_pdf_text_wrap.js) added a guard that
// skips wrapping when the measurement can't be trusted — because measuring Druk with
// a Helvetica-class substitute reported ~1048pt for a 618pt box and produced a
// phantom second line that landed on the box below.
//
// That guard asked document.fonts.check() with the WHOLE CSS shorthand, fallback
// stack included. check() returns false when ANY family in the list is unavailable,
// and FRAME's brand stacks deliberately name faces that don't exist everywhere:
//   display : 'Druk','Oswald','Arial Narrow',Arial,sans-serif      <- no Oswald on Windows
//   sans    : 'Helvetica Neue',Helvetica,Arial,sans-serif          <- no Helvetica Neue on Windows
// So on Windows every `display` and `sans` run read as untrusted, wrapping was
// skipped, and the text ran off the page. `sans` is the default paragraph font, so it
// hit every prose page in every deck.
//
// The guard now asks only about the faces FRAME actually loads as FontFaces (Druk,
// Messina). A system font resolving to its own fallback measures the same in the
// canvas as the PDF's core font does, so there is nothing to distrust there.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // One persistent 2D stub with a real measureText, so _layoutRichLines can be
  // exercised end to end: width proportional to character count.
  const _ctx2d = { font: '', measureText: (s) => ({ width: ('' + s).length * 7 }) };
  window.HTMLCanvasElement.prototype.getContext = () => _ctx2d;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};
    const S = window.__appSrc;

    // Model a real browser's document.fonts.check: TRUE only when every family in
    // the list is available. \`avail\` is the set of families that exist — loaded
    // FontFaces plus system fonts.
    const __mockFonts = (avail) => {
      document.fonts = {
        check: (css) => {
          const at = ('' + css).indexOf('px ');
          if (at < 0) throw new SyntaxError('bad font shorthand');
          const fams = ('' + css).slice(at + 3).split(',').map(f => f.trim().replace(/['"]/g, ''));
          const generic = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy'];
          return fams.every(f => generic.indexOf(f) >= 0 || avail.indexOf(f) >= 0);
        }
      };
    };
    // A Windows box with the brand TTFs loaded: Druk and Messina are FontFaces,
    // Arial/Helvetica/Times/Georgia are system fonts, Oswald and Helvetica Neue are
    // NOT present.
    const WINDOWS = ['Druk', 'Messina', 'Arial', 'Helvetica', 'Arial Narrow', 'Times New Roman', 'Times', 'Georgia', 'Segoe UI', 'Verdana', 'Tahoma', 'Courier New'];

    __check('EXACT BUG: a sans paragraph on Windows is trusted, so it WRAPS', () => {
      __mockFonts(WINDOWS);
      const css = '400 16px ' + _fontCss('sans', 'sans');
      // Sanity: this is the exact condition that broke it — a whole-stack check is
      // false here because 'Helvetica Neue' is absent.
      if (document.fonts.check(css) !== false) throw new Error('the mock does not reproduce the Windows condition');
      if (!_richMeasureTrusted(css)) throw new Error('THE BUG: a sans run reads as untrusted, so wrapping is skipped and the paragraph runs off the page');
    });

    __check('EXACT BUG: a display heading on Windows is trusted too (no Oswald here)', () => {
      __mockFonts(WINDOWS);
      const css = '700 92px ' + _fontCss('display', 'sans');
      if (document.fonts.check(css) !== false) throw new Error('the mock does not reproduce the Windows condition');
      if (!_richMeasureTrusted(css)) throw new Error('a display run reads as untrusted even though Druk is loaded');
    });

    __check('serif is trusted when Messina is loaded', () => {
      __mockFonts(WINDOWS);
      if (!_richMeasureTrusted('400 16px ' + _fontCss('serif', 'serif'))) throw new Error('serif untrusted with Messina present');
    });

    // ── the other half: the protection that was there for a reason ──
    __check('EXACT RISK: a display run is still DISTRUSTED when Druk is genuinely missing', () => {
      // This is the cover bug the guard exists for: measuring Druk with a
      // Helvetica-class substitute reported ~1048pt against a 618pt box, wrapping a
      // heading onto a phantom second line that landed on the box below it.
      __mockFonts(WINDOWS.filter(f => f !== 'Druk'));
      if (_richMeasureTrusted('700 92px ' + _fontCss('display', 'sans'))) throw new Error('a missing Druk is no longer distrusted — the phantom cover wrap comes back');
    });

    __check('EXACT RISK: a serif run is distrusted when Messina is missing', () => {
      __mockFonts(WINDOWS.filter(f => f !== 'Messina'));
      if (_richMeasureTrusted('400 16px ' + _fontCss('serif', 'serif'))) throw new Error('a missing Messina is no longer distrusted');
    });

    __check('a stack that needs no brand face is always trusted', () => {
      // Nothing to distrust: a system font falling back to its own default measures
      // the same in the canvas as the PDF core font draws.
      __mockFonts([]);
      ['arial', 'helvetica', 'segoe', 'verdana', 'tahoma', 'courier'].forEach(tok => {
        const css = '400 14px ' + _fontCss(tok, 'sans');
        if (css.indexOf('Druk') >= 0 || css.indexOf('Messina') >= 0) return;   // not a universal stack
        if (!_richMeasureTrusted(css)) throw new Error(tok + ' reads as untrusted with no brand face in its stack');
      });
    });

    __check('it fails OPEN: anything it cannot determine still wraps', () => {
      // Running off the page is always worse than a slightly-off wrap.
      document.fonts = { check: () => { throw new Error('boom'); } };
      if (!_richMeasureTrusted('400 16px Whatever')) throw new Error('a throwing check should read as trusted');
      document.fonts = undefined;
      if (!_richMeasureTrusted('400 16px Whatever')) throw new Error('a missing document.fonts should read as trusted');
      document.fonts = { check: 'not a function' };
      if (!_richMeasureTrusted('400 16px Whatever')) throw new Error('a non-function check should read as trusted');
      __mockFonts(WINDOWS);
      if (!_richMeasureTrusted('garbage with no size')) throw new Error('an unparseable shorthand should read as trusted');
    });

    __check('the wrapper asks the helper, not document.fonts directly', () => {
      const i = S.indexOf('function _layoutRichLines');
      const body = S.slice(i, i + 4000);
      if (/document\\.fonts\\.check\\(st\\.css\\)/.test(body)) throw new Error('THE BUG: _layoutRichLines still checks the whole stack itself');
      if (body.indexOf('_richMeasureTrusted(st.css)') < 0) throw new Error('the wrapper does not use the helper');
      // And only the loaded faces are consulted.
      if (S.indexOf("_RICH_BRAND_FACES = ['Druk', 'Messina']") < 0) throw new Error('the brand-face list changed; it must match what _loadEditorBrandFonts loads');
      const j = S.indexOf('const defs = [');
      const defs = S.slice(j, S.indexOf('];', j));
      ['Druk', 'Messina'].forEach(f => { if (defs.indexOf("family: '" + f + "'") < 0) throw new Error(f + ' is in _RICH_BRAND_FACES but is not actually loaded as a FontFace'); });
    });

    // ── THE REAL FIX: the PDF measures with the engine that draws ──
    __check('EXACT BUG: the PDF wraps with jsPDF metrics, not a canvas measureText', () => {
      // The canvas is a different font engine reading CSS stacks, and it substitutes
      // silently when a face isn't available to it. So the wrap was decided from one
      // set of metrics and the text drawn with another: the cover heading wrapped onto
      // a phantom line that landed on the subheading, and the guard added to stop that
      // is what stopped paragraphs wrapping at all. Measuring with jsPDF removes the
      // mismatch by construction.
      if (typeof _richPdfMeasure !== 'function') throw new Error('no jsPDF measurer');
      const i = S.indexOf('function _drawRichTextPdf');
      const body = S.slice(i, i + 900);
      if (body.indexOf('_layoutRichLines(t, w, PH, _richPdfMeasure(doc))') < 0) throw new Error('THE BUG: the PDF path still lays out with the canvas measurer');
    });

    __check('the measurer and the draw loop share one font-state helper', () => {
      // If they can pick different faces or styles, the width a line was wrapped at
      // and the width it prints at diverge again.
      if (typeof _richPdfFont !== 'function') throw new Error('_richPdfFont is gone');
      const m = S.indexOf('function _richPdfMeasure');
      if (S.slice(m, m + 500).indexOf('_richPdfFont(') < 0) throw new Error('the measurer does not use the shared helper');
      const d = S.indexOf('function _drawRichTextPdf');
      if (S.slice(d, S.indexOf('\\nfunction ', d + 10)).indexOf('_richPdfFont(') < 0) throw new Error('the draw loop does not use the shared helper');
      // Same inputs, same answer.
      const a = _richPdfFont('serif', true, true), b = _richPdfFont('serif', true, true);
      if (a.fam !== b.fam || a.style !== b.style) throw new Error('the helper is not deterministic');
      if (_richPdfFont('serif', true, true).style !== 'bolditalic') throw new Error('bold+italic maps to ' + _richPdfFont('serif', true, true).style);
      if (_richPdfFont('serif', false, false).style !== 'normal') throw new Error('plain maps to ' + _richPdfFont('serif', false, false).style);
    });

    __check('EXACT BUG: an exact measurer is trusted unconditionally — no no-wrap fallback', () => {
      // The guard only makes sense for the canvas. Leaving it in the PDF path would
      // reintroduce the runs-off-the-page behaviour whenever a brand face wasn't
      // visible to document.fonts.
      __mockFonts([]);                       // nothing available at all
      const measure = (txt) => ('' + txt).length * 9;
      const t = { text: new Array(40).join('word '), font: 'serif', size: 0.03 };
      const lines = _layoutRichLines(t, 180, 540, measure);
      if (lines.length < 5) throw new Error('with an exact measurer and no fonts available it still refused to wrap: ' + lines.length + ' line(s)');
    });

    __check('the supplied measurer is the one actually used', () => {
      let calls = 0;
      const measure = (txt, st) => { calls++; if (!st || !st.fs) throw new Error('the measurer was not given the run style'); return ('' + txt).length * 5; };
      _layoutRichLines({ text: 'one two three four five', font: 'sans', size: 0.03 }, 60, 540, measure);
      if (!calls) throw new Error('the measurer was never called — the canvas is still being used');
    });

    __check('letter spacing is added on top of the measured width, in both paths', () => {
      // jsPDF applies charSpace per character and getTextWidth excludes it, so the
      // track term has to be added outside the measurer or tracked text overruns.
      const i = S.indexOf('function _layoutRichLines');
      const body = S.slice(i, i + 3000);
      if (body.indexOf('w += t.track * st.fs * txt.length') < 0) throw new Error('the track term is gone');
      const trackAt = body.indexOf('w += t.track');
      const measureAt = body.indexOf('w = measure(txt, st)');
      if (!(measureAt >= 0 && trackAt > measureAt)) throw new Error('the track term must be added after the measurement, not inside it');
    });

    __check('a long paragraph in the default font really does break into lines now', () => {
      __mockFonts(WINDOWS);
      const t = { text: new Array(60).join('word '), font: 'sans', size: 0.03, align: 'left' };
      const lines = _layoutRichLines(t, 200, 540);
      if (lines.length < 5) throw new Error('THE BUG: a 300-character paragraph produced ' + lines.length + ' line(s) in a 200pt box');
      lines.forEach(l => { if (l.w > 200 + 60) throw new Error('a line came out ' + Math.round(l.w) + 'pt wide in a 200pt box'); });
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
