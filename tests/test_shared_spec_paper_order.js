// Shared-spec row order: Paper Size belongs with the paper, not with the sizes.
//
// Reported from a real page — one float-mounted piece (B) among five framed
// ones. Paper Size sat in the sizes group, so B's build was split across the
// whole block:
//
//     Matboard B    B 97 White Mat Box
//     Paper Type B  Fine Art Paper / Deckled Edge
//     Mat 1 A/C–E   3"(7.62cm) AA, B 97 White
//     ...
//     Paper Size B  27.5"(69.85cm)W × 13.5"(34.29cm)H   <- stranded down here,
//     Art Dimensions A  29"(73.66cm)W × 21"(53.34cm)H          reading as a size
//
// Paper Size moved into the mat/paper category, after Matboard, and the mats
// moved ahead of the float-mount trio. B's three rows are now contiguous and the
// sizes group holds only Art Dimensions and Overall Dimensions.
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

    // The reported set: A and C–E framed and matted, B float-mounted, F framed
    // and unmatted. All six share a frame, so the frame rows collapse and the
    // mat/paper block is what varies.
    const mk = (id, o) => Object.assign({}, dashDefaultData, {
      id: id, product: 'Framed Art',
      fCode: 'MICH 432-22', fColorName: 'White', fW: 0.875, fHeight: 1.25, rabbetDepth: 1,
      mount: 'Standard Mount', hardware: 'None', glass: '2mm Standard',
      m1A: false, m2A: false
    }, o || {});
    const matted = (id, w, h) => mk(id, { extW: w, extH: h, m1A: true, m1T: 3, m1B: 3, m1L: 3, m1R: 3, m1ColorName: 'B 97 White' });
    const SET = [
      matted('ART-A', 36, 28),
      mk('ART-B', { extW: 32, extH: 18, useFloatMount: true, sbBackerColorName: 'B 97 White', paperType: 'Fine Art Paper', sbPaperEdge: 'torn', sbPaperMargin: 1.5, sbPaperBorder: 0 }),
      matted('ART-C', 24, 24),
      matted('ART-D', 18, 18),
      matted('ART-E', 32, 28),
      mk('ART-F', { extW: 22, extH: 12 })
    ];
    const __bases = (rows) => { const out = []; rows.forEach(r => { if (out.indexOf(r.base) < 0) out.push(r.base); }); return out; };
    const __rows = () => _specSetRows(SET, _setLetters(SET.length));

    __check('EXACT BUG: Paper Size no longer sits among the Art Dimensionss', () => {
      const bases = __bases(__rows());
      const ps = bases.indexOf('Paper Size');
      const isz = bases.indexOf('Art Dimensions');
      if (ps < 0) throw new Error('Paper Size vanished: ' + bases.join(' > '));
      if (isz < 0) throw new Error('Art Dimensions vanished: ' + bases.join(' > '));
      if (!(ps < isz)) throw new Error('THE BUG: Paper Size still lands with the sizes -> ' + bases.join(' > '));
    });

    __check('EXACT REQUEST: B\\'s three float-mount rows are contiguous', () => {
      const rows = __rows();
      const idx = [];
      rows.forEach((r, i) => { if (['Matboard', 'Paper Size', 'Paper Type'].indexOf(r.base) >= 0) idx.push(i); });
      if (idx.length !== 3) throw new Error('expected 3 float-mount rows, got ' + idx.length);
      if (idx[2] - idx[0] !== 2) throw new Error('B\\'s rows are split apart: ' + rows.map(r => r.label).join(' | '));
      // All three are B's alone, so each carries the letter.
      idx.forEach(i => { if (rows[i].label.indexOf(' B') < 0) throw new Error('expected a B suffix on "' + rows[i].label + '"'); });
    });

    __check('the mat row comes first, then the float-mount build', () => {
      const bases = __bases(__rows());
      const seq = bases.filter(b => ['Mat 1', 'Matboard', 'Paper Size', 'Paper Type'].indexOf(b) >= 0);
      if (seq.join(' > ') !== 'Mat 1 > Matboard > Paper Size > Paper Type') throw new Error('got ' + seq.join(' > '));
    });

    __check('the sizes group holds ONLY the two size labels, and ends the block', () => {
      const bases = __bases(__rows());
      const tail = bases.slice(bases.indexOf('Art Dimensions'));
      if (tail.join(' > ') !== 'Art Dimensions > Overall Dimensions') throw new Error('the block no longer ends on just the sizes: ' + tail.join(' > '));
      if (SPEC_ROW_GROUPS[SPEC_ROW_GROUPS.length - 1].join(',') !== 'Art Dimensions,Overall Dimensions') throw new Error('the last SPEC_ROW_GROUPS entry is ' + SPEC_ROW_GROUPS[SPEC_ROW_GROUPS.length - 1].join(','));
    });

    __check('Paper Size and Art Dimensions are in different categories, so a half-line gap separates them', () => {
      // The renderer spaces the block by row.group; same group = no gap.
      const rows = __rows();
      const ps = rows.find(r => r.base === 'Paper Size');
      const isz = rows.find(r => r.base === 'Art Dimensions');
      const mb = rows.find(r => r.base === 'Matboard');
      if (ps.group === isz.group) throw new Error('Paper Size shares a category with Art Dimensions, so they would print with no gap between them');
      if (ps.group !== mb.group) throw new Error('Paper Size is not in the same category as Matboard, so a gap would split B\\'s rows');
    });

    __check('every label buildSpecStrings can emit is still placed, none fell through to the unknown slot', () => {
      // A label missing from SPEC_ROW_GROUPS silently lands in the catch-all
      // group, which is how Paper Size would go missing after a rename.
      ['Application', 'Mount', 'Hardware', 'Glass', 'Backing Board', 'Frame Size', 'Frame Code',
       'Mat 1', 'Mat 2', 'Matboard', 'Paper Size', 'Paper Type', 'White Border', 'Float Reveal',
       'Stretcher Bar', 'Notes', 'Art Dimensions', 'Overall Dimensions'].forEach(l => {
        if (_specRowSlot(l).group === _SPEC_ROW_UNKNOWN_GROUP) throw new Error(l + ' is not listed in SPEC_ROW_GROUPS');
      });
      // Paper Size is still a per-piece quantity, so an all-covering row keeps
      // its count prefix even though it moved category.
      if (SPEC_QTY_LABELS.indexOf('Paper Size') < 0) throw new Error('Paper Size dropped out of SPEC_QTY_LABELS');
    });

    __check('an all-float-mount set reads in build order too', () => {
      const fm = (id, o) => mk(id, Object.assign({ extW: 20, extH: 16, useFloatMount: true, sbBackerColorName: 'B 97 White', paperType: 'Fine Art Paper', sbPaperMargin: 1.5, sbPaperBorder: 1 }, o || {}));
      const set3 = [fm('A'), fm('B', { extW: 24 }), fm('C')];
      const bases = __bases(_specSetRows(set3, _setLetters(3)));
      const seq = bases.filter(b => ['Matboard', 'Paper Size', 'Paper Type', 'White Border', 'Art Dimensions', 'Overall Dimensions'].indexOf(b) >= 0);
      if (seq.join(' > ') !== 'Matboard > Paper Size > Paper Type > White Border > Art Dimensions > Overall Dimensions') throw new Error('got ' + seq.join(' > '));
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
