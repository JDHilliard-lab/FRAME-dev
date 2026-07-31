// Dual units: every spec dimension prints in inches with the metric equivalent
// in brackets, so a metric fabricator doesn't convert by hand.
//
//   Frame Size A/C         0.75"(19.1mm)W × 0.75"(19.1mm)D, Rabbet 0.625"(15.9mm)
//   Overall Dimensions A   18"(457.2mm)W × 18"(457.2mm)H
//
// THE REPORTED BUG. Dual units were relative to the project unit, so on a cm
// project picking cm printed cm only (the "same unit, nothing to add" shortcut
// swallowed the companion) and picking mm printed '1.905 cm(19.1mm)'. Inches
// never appeared. They lead with inches now regardless of the project unit —
// which is the point, because the alternative the user was offered was flipping
// the global unit toggle, and that would drag the elevations to inches too.
//
// Also checked here:
//   - OFF is byte-identical to before, on every project unit. The suffixes went
//     from plain strings to functions of the value and every call site changed.
//   - The setting is deck-wide: per-piece pages, Group A/B/C and the shared block
//     all honour it, because buildSpecStrings reads it itself.
//   - The CSV export forces it OFF. Those cells are machine-read.
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

    // A plain framed print: 0.75" profile, 0.625" rabbet, 18" square, 3" mat.
    // \`scale\` restates the same physical piece in another project unit, which is
    // what the reported bug turned on.
    const PIECE = (scale) => {
      const k = scale || 1;
      return {
        id: 'ART.001', product: 'Framed Art',
        m1A: true, m1T: 3 * k, m1B: 3 * k, m1L: 3 * k, m1R: 3 * k, m1ColorName: 'B 97 White',
        fW: 0.75 * k, fHeight: 0.75 * k, rabbetDepth: 0.625 * k,
        fCode: 'MICH-247-81', fColorName: 'Natural Woodgrain',
        extW: 18 * k, extH: 18 * k, bleed: 0,
        mount: 'Standard Mount', glass: '2mm Standard'
      };
    };
    const K = { in: 1, cm: 2.54, mm: 25.4 };
    const __line = (r, label, opts) => {
      const ln = buildSpecStrings(r, opts).lines.find(l => l.label === label);
      return ln ? ln.value : null;
    };
    // Set the project unit + the deck-wide dual setting, read one line back.
    const __as = (unit, dual, label) => {
      const save = dashUnit;
      dashUnit = unit; editorialContent.specDualUnit = dual;
      const out = __line(PIECE(K[unit]), label);
      dashUnit = save; editorialContent.specDualUnit = '';
      return out;
    };

    // ── The reported bug ──
    __check('EXACT BUG: a cm project asking for cm gets inches + cm, not cm alone', () => {
      const got = __as('cm', 'cm', 'Overall Dimensions');
      if (got !== '18\\"(45.72cm)W × 18\\"(45.72cm)H') throw new Error('got "' + got + '"');
    });

    __check('EXACT BUG: a cm project asking for mm gets inches + mm, not cm followed by mm', () => {
      const got = __as('cm', 'mm', 'Overall Dimensions');
      if (/cm/.test(got)) throw new Error('THE BUG: cm leaked into an inches+mm line -> ' + got);
      if (got !== '18\\"(457.2mm)W × 18\\"(457.2mm)H') throw new Error('got "' + got + '"');
    });

    __check('the project unit does not change the printed result at all', () => {
      // Same physical piece, three project units, one dual setting: identical.
      ['Overall Dimensions', 'Frame Size', 'Mat 1'].forEach(label => {
        const seen = ['in', 'cm', 'mm'].map(u => __as(u, 'mm', label));
        if (seen[0] !== seen[1] || seen[1] !== seen[2]) throw new Error(label + ' differs by project unit: ' + JSON.stringify(seen));
      });
    });

    __check('a mm project asking for mm still leads with inches', () => {
      const got = __as('mm', 'mm', 'Overall Dimensions');
      if (got.indexOf('18\\"') !== 0) throw new Error('expected inches first, got "' + got + '"');
      if (got.indexOf('(457.2mm)') < 0) throw new Error('lost the mm companion: "' + got + '"');
    });

    // ── The formatting itself ──
    __check('EXACT REQUEST: the companion rides along after every dimension', () => {
      const got = __as('in', 'mm', 'Frame Size');
      const want = '0.75\\"(19.1mm)W × 0.75\\"(19.1mm)D, Rabbet 0.625\\"(15.9mm)';
      if (got !== want) throw new Error('got  "' + got + '"\\nwant "' + want + '"');
    });

    __check('cm is the other half of the toggle', () => {
      if (__as('in', 'cm', 'Overall Dimensions') !== '18\\"(45.72cm)W × 18\\"(45.72cm)H') throw new Error('got: ' + __as('in', 'cm', 'Overall Dimensions'));
    });

    __check('a mat keeps its AA as a separate word, brackets and all', () => {
      if (__as('in', 'mm', 'Mat 1') !== '3\\"(76.2mm) AA, B 97 White') throw new Error('got: "' + __as('in', 'mm', 'Mat 1') + '"');
      if (__as('in', '', 'Mat 1') !== '3\\" AA, B 97 White') throw new Error('off: "' + __as('in', '', 'Mat 1') + '"');
    });

    __check('no (0mm) for a value that is not set, and nothing bracketed twice', () => {
      const save = dashUnit; dashUnit = 'in'; editorialContent.specDualUnit = 'mm';
      const r = Object.assign(PIECE(), { rabbetDepth: 0, fHeight: 0 });
      const got = __line(r, 'Frame Size');
      dashUnit = save; editorialContent.specDualUnit = '';
      if (got !== '0.75\\"(19.1mm)W') throw new Error('got: "' + got + '"');
      if (/\\)\\s*\\(/.test(got)) throw new Error('doubled brackets: ' + got);
    });

    __check('the same physical size rounds the same whatever unit it is stored in', () => {
      // 0.75 in * 25.4 is 19.049999999999997 in float, while the identical
      // 1.905 cm * 10 is exactly 19.05 — one rounded to 19, the other to 19.1.
      const seen = ['in', 'cm', 'mm'].map(u => __as(u, 'mm', 'Frame Size'));
      if (new Set(seen).size !== 1) throw new Error('float residue leaked into the rounding: ' + JSON.stringify(seen));
    });

    // ── OFF must be exactly what it always was ──
    __check('EXACT RISK: with dual units off, every string is what it always was', () => {
      const before = {
        in: { 'Frame Size': '0.75\\"W × 0.75\\"D, Rabbet 0.625\\"', 'Mat 1': '3\\" AA, B 97 White', 'Overall Dimensions': '18\\"W × 18\\"H' },
        cm: { 'Frame Size': '1.905 cm W × 1.905 cm D, Rabbet 1.587 cm ', 'Mat 1': '7.62 cm AA, B 97 White', 'Overall Dimensions': '45.72 cm W × 45.72 cm H' }
      };
      Object.keys(before).forEach(u => {
        Object.keys(before[u]).forEach(k => {
          const got = __as(u, '', k);
          if (got !== before[u][k]) throw new Error(u + ' / ' + k + ' is "' + got + '", expected "' + before[u][k] + '"');
        });
      });
    });

    __check('a junk setting reads as off rather than printing a bogus suffix', () => {
      ['', 'MM', 'inches', 'true', null, 0, 1, {}].forEach(v => {
        editorialContent.specDualUnit = v;
        if (_specDualUnit() !== '') throw new Error(JSON.stringify(v) + ' normalised to "' + _specDualUnit() + '" instead of off');
      });
      ['mm', 'cm'].forEach(u => { editorialContent.specDualUnit = u; if (_specDualUnit() !== u) throw new Error(u + ' did not round-trip'); });
      editorialContent.specDualUnit = '';
    });

    // ── Deck-wide wiring ──
    __check('EXACT REQUEST: the setting reaches every spec layout, not just the shared block', () => {
      editorialContent.specDualUnit = 'mm';
      // Shared block (Group A/B/C, Shared specs).
      const shared = _specSetRows([PIECE()], _setLetters(1)).find(r => r.base === 'Frame Size');
      if (!shared || shared.value.indexOf('(19.1mm)') < 0) throw new Error('the shared-spec block missed it: ' + (shared && shared.value));
      // Per-piece pages call buildSpecStrings with no options at all.
      if (__line(PIECE(), 'Frame Size').indexOf('(19.1mm)') < 0) throw new Error('a bare buildSpecStrings call — which is what every per-piece page makes — missed it');
      editorialContent.specDualUnit = '';
      if (__line(PIECE(), 'Frame Size').indexOf('(') >= 0) throw new Error('turning it off left the brackets behind');
    });

    __check('an older project that stored it under scaleOpts keeps its choice', () => {
      delete editorialContent.specDualUnit;
      editorialContent.scaleOpts = { codes: 'frames', elevThumb: false, dualUnit: 'cm' };
      if (_specDualUnit() !== 'cm') throw new Error('the migration read did not fire, so a saved project silently loses dual units');
      editorialContent.scaleOpts = { codes: 'frames', elevThumb: false };
      editorialContent.specDualUnit = '';
      // And _scaleOpts no longer pretends to own it.
      if ('dualUnit' in _scaleOpts()) throw new Error('_scaleOpts still reports dualUnit; two places owning one setting is how they drift');
    });

    __check('EXACT RISK: the CSV export forces dual units OFF', () => {
      // Those cells feed the InDesign auto-spec script and importDashCSV. A
      // bracketed second unit inside a dimension would break both.
      const S = window.__appSrc;
      const i = S.indexOf('function buildDashCSVString');
      if (i < 0) throw new Error('buildDashCSVString not found');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (body.indexOf("buildSpecStrings(r, { dualUnit: '' })") < 0) throw new Error('the CSV path does not force dual units off');
      // And prove it at runtime, not just in the source.
      editorialContent.specDualUnit = 'mm';
      const off = __line(PIECE(), 'Frame Size', { dualUnit: '' });
      editorialContent.specDualUnit = '';
      if (off.indexOf('(') >= 0) throw new Error('an explicit { dualUnit: \\'\\' } did not override the deck setting: ' + off);
    });

    __check('the default is off, in the live default and in _editorialDefaults', () => {
      const d = _editorialDefaults();
      if (d.specDualUnit !== '') throw new Error('_editorialDefaults has specDualUnit ' + JSON.stringify(d.specDualUnit));
      const S = window.__appSrc;
      if (S.indexOf(\"specDualUnit: ''\") < 0) throw new Error('the editorialContent literal was not updated alongside _editorialDefaults');
    });

    __check('the control appears in BOTH spec panels and nowhere it would do nothing', () => {
      const S = window.__appSrc;
      if (S.indexOf('function _dsDualUnitInto') < 0) throw new Error('no _dsDualUnitInto helper — the control was inlined, so the two panels can drift');
      const calls = (S.match(/_dsDualUnitInto\\(/g) || []).length;
      if (calls < 3) throw new Error('expected the helper plus a call from each of the two spec panels, found ' + calls + ' references');
      const i = S.indexOf('function _dsDualUnitInto');
      const body = S.slice(i, i + 2600);
      if (body.indexOf('specDualUnit =') < 0) throw new Error('the control does not write the deck-wide setting');
      if (body.indexOf(\"cur || 'mm'\") < 0) throw new Error('unticking should remember the unit rather than resetting the picker');
      if (body.indexOf('_dsClearBuiltAll') < 0 || body.indexOf('_dsRefresh') < 0) throw new Error('the control does not rebuild the previews, so it would only take effect on the next PDF');
      if (body.indexOf('scheduleAutosave') < 0) throw new Error('the setting is not saved');
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
