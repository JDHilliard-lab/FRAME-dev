// Shared-spec block: Frame Size and Frame Code pivot per letter group.
//
// _specSetRows was label-major — every Frame Code row, then every Frame Size
// row. On a hang with three mouldings that means pairing letter runs by eye to
// work out which code goes with which profile:
//
//     Frame Code A/B/D/E   MICH 247-81
//     Frame Code C         MICH 432-20
//     Frame Code F         MICH 41-35
//     Frame Size A/B/D/E   0.75"W x 0.75"D, Rabbet 0.625"
//     Frame Size C         0.875"W x 1.25"D, Rabbet 1"
//     Frame Size F         1.25"W x 1.125"D, Rabbet 0.75"
//
// The two labels describe one physical thing, so they now emit together per
// group (SPEC_ROW_CLUSTERS). Everything else stays label-major — 'Mount' and
// 'Glass' aren't part of the frame, so pairing them off would just repeat them.
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

    // Drive _specSetRows off buildSpecStrings' real output shape ({label, value}
    // lines) rather than a whole dashboard row, so these checks are about the
    // grouping and nothing else.
    window.__realBuildSpecStrings = buildSpecStrings;
    const __stub = (specs) => {
      window.__specs = specs;
      buildSpecStrings = (r) => ({ lines: (window.__specs[r.id] || []).map(p => ({ label: p[0], value: p[1] })) });
    };
    const __rowsFor = (ids) => _specSetRows(ids.map(id => ({ id: id })), _setLetters(ids.length));
    const __lines = (rows) => rows.map(r => r.label + '  ' + (r.value || ''));

    // The reported case: six pieces, three mouldings, sizes and codes varying
    // together.
    const SIX = {
      A: [['Frame Size', '0.75\\"W × 0.75\\"D, Rabbet 0.625\\"'], ['Frame Code', 'MICH 247-81']],
      B: [['Frame Size', '0.75\\"W × 0.75\\"D, Rabbet 0.625\\"'], ['Frame Code', 'MICH 247-81']],
      C: [['Frame Size', '0.875\\"W × 1.25\\"D, Rabbet 1\\"'], ['Frame Code', 'MICH 432-20']],
      D: [['Frame Size', '0.75\\"W × 0.75\\"D, Rabbet 0.625\\"'], ['Frame Code', 'MICH 247-81']],
      E: [['Frame Size', '0.75\\"W × 0.75\\"D, Rabbet 0.625\\"'], ['Frame Code', 'MICH 247-81']],
      F: [['Frame Size', '1.25\\"W × 1.125\\"D, Rabbet 0.75\\"'], ['Frame Code', 'MICH 41-35']]
    };

    __check('EXACT REQUEST: each moulding prints its Frame Code then its Frame Size, group by group', () => {
      __stub(SIX);
      const got = __lines(__rowsFor(['A','B','C','D','E','F']));
      const want = [
        'Frame Code A/B/D/E  MICH 247-81',
        'Frame Size A/B/D/E  0.75\\"W × 0.75\\"D, Rabbet 0.625\\"',
        'Frame Code C  MICH 432-20',
        'Frame Size C  0.875\\"W × 1.25\\"D, Rabbet 1\\"',
        'Frame Code F  MICH 41-35',
        'Frame Size F  1.25\\"W × 1.125\\"D, Rabbet 0.75\\"'
      ];
      if (got.join(' | ') !== want.join(' | ')) throw new Error('got:\\n  ' + got.join('\\n  ') + '\\nwant:\\n  ' + want.join('\\n  '));
    });

    __check('the old label-major order is really gone (no Size/Size/Size then Code/Code/Code)', () => {
      __stub(SIX);
      const bases = __rowsFor(['A','B','C','D','E','F']).map(r => r.base);
      // Label-major would be C,C,C,S,S,S. Paired is C,S,C,S,C,S.
      if (bases.join(',') !== 'Frame Code,Frame Size,Frame Code,Frame Size,Frame Code,Frame Size') throw new Error('row order is ' + bases.join(','));
    });

    __check('the letter runs survive the pivot, ranges included', () => {
      // A–D share a moulding, E and F differ: the run collapses to a range.
      __stub({
        A: [['Frame Size', 'S1'], ['Frame Code', 'C1']],
        B: [['Frame Size', 'S1'], ['Frame Code', 'C1']],
        C: [['Frame Size', 'S1'], ['Frame Code', 'C1']],
        D: [['Frame Size', 'S1'], ['Frame Code', 'C1']],
        E: [['Frame Size', 'S2'], ['Frame Code', 'C2']],
        F: [['Frame Size', 'S3'], ['Frame Code', 'C3']]
      });
      const got = __lines(__rowsFor(['A','B','C','D','E','F']));
      if (got[0].indexOf('Frame Code A–D') !== 0) throw new Error('expected the A–D range on the first row, got "' + got[0] + '"');
      if (got[1].indexOf('Frame Size A–D') !== 0) throw new Error('the size row lost the same run: "' + got[1] + '"');
    });

    // ── What must NOT change ──
    __check('a set that shares one moulding still prints two plain rows, no letters', () => {
      __stub({
        A: [['Frame Size', 'S1'], ['Frame Code', 'C1']],
        B: [['Frame Size', 'S1'], ['Frame Code', 'C1']]
      });
      const got = __lines(__rowsFor(['A','B']));
      if (got.join(' | ') !== 'Frame Code  C1 | Frame Size  S1') throw new Error('collapsing a uniform set regressed: ' + got.join(' | '));
    });

    __check('a size shared by everyone stays ONE row when only the codes differ', () => {
      // The pivot would otherwise repeat the identical size under every code.
      __stub({
        A: [['Frame Size', 'S1'], ['Frame Code', 'C1']],
        B: [['Frame Size', 'S1'], ['Frame Code', 'C2']]
      });
      const got = __lines(__rowsFor(['A','B']));
      if (got.join(' | ') !== 'Frame Code A  C1 | Frame Code B  C2 | Frame Size  S1') throw new Error('got: ' + got.join(' | '));
    });

    __check('a piece missing its Frame Code still gets its Frame Size row, and no None row appears', () => {
      __stub({
        A: [['Frame Size', 'S1'], ['Frame Code', 'C1']],
        B: [['Frame Size', 'S2']]
      });
      const got = __lines(__rowsFor(['A','B']));
      if (got.join(' | ') !== 'Frame Code A  C1 | Frame Size A  S1 | Frame Size B  S2') throw new Error('got: ' + got.join(' | '));
      if (got.join(' ').indexOf('None') >= 0) throw new Error('a None row appeared');
    });

    __check('labels outside the cluster are untouched — Mount and Glass still collapse to one line each', () => {
      __stub({
        A: [['Mount', 'Float'], ['Glass', 'Museum'], ['Frame Size', 'S1'], ['Frame Code', 'C1']],
        B: [['Mount', 'Float'], ['Glass', 'Museum'], ['Frame Size', 'S2'], ['Frame Code', 'C2']]
      });
      const got = __lines(__rowsFor(['A','B']));
      if (got.join(' | ') !== 'Mount  Float | Glass  Museum | Frame Code A  C1 | Frame Size A  S1 | Frame Code B  C2 | Frame Size B  S2') throw new Error('got: ' + got.join(' | '));
    });

    __check('the cluster does not drag rows out of their SPEC_ROW_GROUPS category', () => {
      // Frame Code/Size sit in group 2; the sizes stay last, and the group index
      // is what drives the renderer's half-line gaps.
      __stub({
        A: [['Overall Dimensions', '24\\"W × 24\\"H'], ['Frame Code', 'C1'], ['Mount', 'Float'], ['Frame Size', 'S1']],
        B: [['Overall Dimensions', '30\\"W × 30\\"H'], ['Frame Code', 'C2'], ['Mount', 'Float'], ['Frame Size', 'S2']]
      });
      const rows = __rowsFor(['A','B']);
      const bases = rows.map(r => r.base);
      if (bases.join(',') !== 'Mount,Frame Code,Frame Size,Frame Code,Frame Size,Overall Dimensions,Overall Dimensions') throw new Error('row order is ' + bases.join(','));
      const groups = rows.map(r => r.group);
      for (let i = 1; i < groups.length; i++) {
        if (groups[i] < groups[i - 1]) throw new Error('group indexes go backwards: ' + groups.join(','));
      }
      if (rows.filter(r => r.base === 'Frame Size')[0].group !== rows.filter(r => r.base === 'Frame Code')[0].group) throw new Error('paired rows landed in different categories, so a half-line gap would split them');
    });

    __check('the per-set quantity prefix still only lands on all-covering size rows', () => {
      __stub({
        A: [['Overall Dimensions', '24\\"W × 24\\"H'], ['Frame Size', 'S1'], ['Frame Code', 'C1']],
        B: [['Overall Dimensions', '24\\"W × 24\\"H'], ['Frame Size', 'S2'], ['Frame Code', 'C2']]
      });
      const got = __lines(__rowsFor(['A','B']));
      if (got.indexOf('Overall Dimensions  2 @ 24\\"W × 24\\"H') < 0) throw new Error('lost the qty prefix: ' + got.join(' | '));
      // Frame rows carry letters, so they must never get a count.
      got.filter(l => l.indexOf('Frame ') === 0).forEach(l => { if (/ \\d+ @ /.test(l)) throw new Error('a lettered frame row got a count: ' + l); });
    });

    __check('a single-piece set is unchanged', () => {
      __stub({ A: [['Frame Size', 'S1'], ['Frame Code', 'C1']] });
      const got = __lines(__rowsFor(['A']));
      if (got.join(' | ') !== 'Frame Code  C1 | Frame Size  S1') throw new Error('got: ' + got.join(' | '));
    });

    __check('the cluster is data-driven, code before size, and only the frame pair is in it', () => {
      if (typeof SPEC_ROW_CLUSTERS === 'undefined') throw new Error('SPEC_ROW_CLUSTERS not defined');
      const flat = SPEC_ROW_CLUSTERS.reduce((a, c) => a.concat(c), []);
      if (flat.join(',') !== 'Frame Code,Frame Size') throw new Error('unexpected cluster contents: ' + flat.join(','));
      // Both labels must live in the same SPEC_ROW_GROUPS entry, or the
      // renderer's category gap would split every pair.
      const g = SPEC_ROW_CLUSTERS[0].map(l => _specRowSlot(l).group);
      if (g[0] !== g[1]) throw new Error('Frame Code and Frame Size are in different SPEC_ROW_GROUPS categories');
      // The cluster order and the SPEC_ROW_GROUPS order must agree, or the two
      // would fight over which comes first.
      const slot = SPEC_ROW_CLUSTERS[0].map(l => _specRowSlot(l).idx);
      if (!(slot[0] < slot[1])) throw new Error('SPEC_ROW_GROUPS puts Frame Size before Frame Code while the cluster says otherwise');
    });

    __check('EXACT REQUEST: per-piece pages get code before size too, from the emission order', () => {
      // The per-piece renderers walk buildSpecStrings' lines array as emitted —
      // SPEC_ROW_GROUPS does not reach them, so the push order has to match.
      const real = window.__realBuildSpecStrings;
      const r = Object.assign({}, dashDefaultData, {
        id: 'ART.001', product: 'Framed Art', m1A: false,
        fW: 0.75, fHeight: 0.75, rabbetDepth: 0.625,
        fCode: 'MICH-247-81', fColorName: 'Natural', extW: 18, extH: 18, bleed: 0
      });
      const labels = real(r).lines.map(l => l.label);
      const c = labels.indexOf('Frame Code'), s = labels.indexOf('Frame Size');
      if (c < 0 || s < 0) throw new Error('frame rows missing: ' + labels.join(','));
      if (!(c < s)) throw new Error('buildSpecStrings still emits Frame Size first, so per-piece pages disagree with the shared block: ' + labels.join(','));
    });

    __check('both consumers read the same rows, so the DOM mock and the PDF cannot drift', () => {
      const S = window.__appSrc;
      const hits = (S.match(/_specSetRows\\(/g) || []).length;
      // One definition + the mock card + the PDF shared-spec column.
      if (hits < 3) throw new Error('expected the mock and the PDF column to both call _specSetRows, found ' + hits + ' references');
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
