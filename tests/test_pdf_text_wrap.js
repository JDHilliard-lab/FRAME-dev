// Cover page text: heading and subheading crashed together in the PDF while
// looking correct in Deck Studio.
//
// It was not the leading maths — that agrees between the two paths. The PDF
// decides where text WRAPS using a canvas 2D measureText, and the export never
// waited for the brand fonts (Druk/Messina) to load in the browser.
// _registerPdfFonts embeds the TTFs into jsPDF but does nothing for that canvas,
// so measurement fell back to a Helvetica-class face which is much wider:
// "COVER PAGE HEADING" measured ~1048pt against a 618pt box and wrapped onto a
// second line. The cover's leading (77) is LESS than its font size (~92), so
// that phantom second line landed inside the SUBHEADING box below it.
//
// Two defences: the export now waits for the fonts (the preview paths already
// did), and the wrapper refuses to wrap on an untrustworthy measurement.
const { JSDOM } = require('jsdom');
const fs = require('fs');

(async () => {
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
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

    // The real cover heading, straight out of IDML_MASTER_TEMPLATES.
    const PH = 540, PW = 936;
    const HEADING = { type: 'text', x: 0.09735042735042736, y: 0.31389534883720926, w: 0.66,
                      text: 'COVER PAGE HEADING', font: 'display', size: 0.1699153933038768,
                      color: '#000000', align: 'left', caps: 'upper', bold: true, track: 0, leading: 77 };
    const SUBHEADING = Object.assign({}, HEADING, { text: 'SUBHEADING', y: 0.48281369240866384, outline: true });
    const boxW = HEADING.w * PW;                       // 617.76pt

    // Stand in for a font that measures much wider than Druk — what a
    // Helvetica-class fallback actually does at this size.
    const __wideMetrics = () => {
      _richMeasureCtx = () => ({
        font: '',
        measureText: (s) => ({ width: (s || '').length * 58 })   // 'COVER PAGE HEADING' -> 1044pt
      });
    };
    // ...and a face that fits, like the real Druk (~522pt for the same string).
    const __narrowMetrics = () => {
      _richMeasureCtx = () => ({
        font: '',
        measureText: (s) => ({ width: (s || '').length * 29 })   // -> 522pt
      });
    };
    const __setFontAvailable = (yes) => {
      if (!document.fonts) document.fonts = {};
      document.fonts.check = () => yes;
    };

    __check('the wide fallback really would wrap this heading (the hazard is real)', () => {
      __wideMetrics();
      const w = _richMeasureCtx().measureText('COVER PAGE HEADING').width;
      if (!(w > boxW)) throw new Error('test setup: fallback width ' + w + ' should exceed the ' + boxW + 'pt box');
    });

    __check('EXACT BUG: an untrustworthy measurement does not wrap the heading onto a second line', () => {
      __wideMetrics();
      __setFontAvailable(false);          // brand font not loaded — measurement is a fallback
      const lines = _layoutRichLines(HEADING, boxW, PH);
      if (lines.length !== 1) {
        throw new Error('the exact reported bug: heading wrapped to ' + lines.length + ' lines. With leading 77 under a ' + (HEADING.size * PH).toFixed(1) + 'pt font, line 2 sits ~' + (HEADING.y * PH + 77).toFixed(0) + 'pt, inside the SUBHEADING box at ' + (SUBHEADING.y * PH).toFixed(0) + 'pt — that is the crash');
      }
    });

    __check('a phantom second line would genuinely land inside the subheading box', () => {
      // Documents WHY a stray wrap is so damaging here, so nobody "fixes" the
      // wrap guard later without realising tight leading is the amplifier.
      const fsPt = HEADING.size * PH;                    // ~91.75
      const lead = HEADING.leading;                      // 77
      if (!(lead < fsPt)) throw new Error('cover leading is no longer tighter than its font size; this check needs revisiting');
      const line2Top = HEADING.y * PH + lead;            // ~246.5
      const subTop = SUBHEADING.y * PH;                  // ~260.7
      if (!(line2Top + fsPt > subTop)) throw new Error('a second line would no longer overlap the subheading; the geometry changed');
    });

    __check('when the brand font IS available, wrapping still works (the guard is not a blanket disable)', () => {
      __wideMetrics();
      __setFontAvailable(true);
      const lines = _layoutRichLines(HEADING, boxW, PH);
      if (lines.length < 2) throw new Error('wrapping was disabled outright — long copy would now overflow its box instead of wrapping');
    });

    __check('real Druk-width metrics keep the heading on one line either way', () => {
      __narrowMetrics();
      [true, false].forEach(avail => {
        __setFontAvailable(avail);
        const lines = _layoutRichLines(HEADING, boxW, PH);
        if (lines.length !== 1) throw new Error('heading wrapped at Druk widths (fonts.check=' + avail + '), got ' + lines.length + ' lines');
      });
    });

    __check('a missing fonts.check API is treated as "measurable" rather than breaking wrapping', () => {
      __wideMetrics();
      if (document.fonts) delete document.fonts.check;
      const lines = _layoutRichLines(HEADING, boxW, PH);
      if (lines.length < 2) throw new Error('with no fonts.check available the wrapper should behave as before, got ' + lines.length + ' lines');
    });

    __check('the export waits for the brand fonts before it draws anything', () => {
      const S = window.__appSrc;
      const i = S.indexOf('async function _buildSpecPagePDF');
      if (i < 0) throw new Error('_buildSpecPagePDF not found');
      const head = S.slice(i, i + 3000);
      if (head.indexOf('_loadEditorBrandFonts') < 0) throw new Error('the export never waits for the brand fonts, so measureText uses a fallback face and text wraps differently than in Deck Studio');
      if (head.indexOf('fonts.ready') < 0) throw new Error('the export does not await document.fonts.ready');
      // Must happen before the page walk starts, not after.
      const wait = head.indexOf('_loadEditorBrandFonts');
      const firstDraw = head.indexOf('newPage');
      if (firstDraw > 0 && wait > firstDraw) throw new Error('the font wait happens after drawing begins');
    });
  `;

  try {
    window.__appSrc = src;
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
