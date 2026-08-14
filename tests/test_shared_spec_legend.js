// "Shared specs (as hung)" — the fourth Group A/B/C layout.
//
// Reported need: on a salon hang where several frames share a moulding, the
// group page repeated the whole spec block per piece, so "Frame Size / Frame
// Code / Mount / Hardware / Glass" printed six times and swallowed the left
// half of the page. The new layout collapses that into ONE block where the
// letters in each label say who shares the value (Matboard A/D).
//
// Also covers two bugs found while building it:
//  - every group `wanted` filter asked for 'Matboard', which buildSpecStrings
//    only emits for FLOAT-MOUNT rows, so standard framed art showed no mat
//    information at all on group pages.
//  - the letters list had 6 entries while to-scale allows 12 members, so pieces
//    7-12 labelled themselves '7'…'12' instead of G…L.
const { JSDOM } = require('jsdom');
const fs = require('fs');

(async () => {
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => {
      try { fn(); window.__testResults.push({ label, ok: true }); }
      catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); }
    };
    // Serial: these swap globals (_collectProjectFramesCached, dashUnit) and
    // would eat each other's state if interleaved.
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __checkAsync = (label, fn) => {
      __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true }))
        .catch(e => ({ label, ok: false, err: e.message })));
      window.__asyncChecks.push(__chain);
    };

    scheduleAutosave = () => {}; pushHistory = () => {};
    _dsRenderRail = () => {}; _dsRenderCenter = () => {}; _dsRenderTools = () => {};
    _dsClearBuiltAll = () => {}; _dsRefresh = () => {};

    // Six framed-art pieces on one wall. A and D are matted 3", the rest are
    // unmatted. All six share the frame. B and C share an overall size.
    const mk = (id, o) => Object.assign({}, dashDefaultData, {
      id: id, imageCode: 'IMG-' + id.slice(-1), level: '1', location: 'LOUNGE',
      product: 'Framed Art', fCode: 'MICH 432-22', fColorName: 'White',
      fW: 0.875, fHeight: 1.25, rabbetDepth: 1,
      mount: 'Standard Mount', hardware: '3-Point Security', glass: '2mm Standard',
      backing: 'Foamcore', m1A: false, m2A: false
    }, o || {});
    const SET = [
      mk('ART-7.7-A', { extW: 30, extH: 20, m1A: true, m1T: 3, m1B: 3, m1L: 3, m1R: 3, m1ColorName: 'B 97 White' }),
      mk('ART-7.7-B', { extW: 15, extH: 12 }),
      mk('ART-7.7-C', { extW: 15, extH: 12 }),
      mk('ART-7.7-D', { extW: 25, extH: 17, m1A: true, m1T: 3, m1B: 3, m1L: 3, m1R: 3, m1ColorName: 'B 97 White' }),
      mk('ART-7.7-E', { extW: 20, extH: 15 }),
      mk('ART-7.7-F', { extW: 15, extH: 15 })
    ];
    const L6 = _setLetters(6);
    const rowFor = (rows, base) => rows.filter(r => r.base === base);
    const labelsOf = (rows) => rows.map(r => r.label);

    // ── 1. The letters bug ──
    __check('_setLetters covers a 12-piece hang (pieces 7-12 were labelled 7..12)', () => {
      const l = _setLetters(12);
      if (l.length !== 12) throw new Error('length ' + l.length);
      if (l[6] !== 'G' || l[11] !== 'L') throw new Error('got ' + l.join(''));
      if (_setLetters(6).join('') !== 'ABCDEF') throw new Error('six-piece output changed: ' + _setLetters(6).join(''));
      if (_setLetters(0).length) throw new Error('zero members should give no letters');
      // past Z it must not produce undefined
      const big = _setLetters(28);
      if (big[26] !== '27' || big[27] !== '28') throw new Error('past Z: ' + big.slice(26).join(','));
    });

    __check('the group renderer derives letters from _setLetters, not a 6-entry literal', () => {
      const s = window.__appSrc;
      const start = s.indexOf('async function _drawSpecSetPageBody');
      if (start < 0) throw new Error('_drawSpecSetPageBody not found');
      const body = s.slice(start, s.indexOf('\\nasync function ', start + 10));
      if (!/const letters = _setLetters\\(members\\.length\\)/.test(body)) throw new Error('_drawSpecSetPageBody still has its own letters list');
      if (/letters = \\['A', 'B', 'C', 'D', 'E', 'F'\\]/.test(body)) throw new Error('the 6-entry literal is still there');
    });

    // ── 2. _letterRun formatting ──
    __check('_letterRun: slash-joins, collapses runs of 3+', () => {
      const eq = (got, want) => { if (got !== want) throw new Error(got + ' !== ' + want); };
      eq(_letterRun(['A', 'D'], L6), 'A/D');
      eq(_letterRun(['B', 'C', 'E', 'F'], L6), 'B/C/E/F');          // runs of 2 stay expanded
      eq(_letterRun(['A', 'B', 'C', 'D', 'E', 'F'], L6), 'A\\u2013F');
      eq(_letterRun(['A'], L6), 'A');
      eq(_letterRun(['A', 'B'], L6), 'A/B');
      eq(_letterRun(['A', 'B', 'C'], L6), 'A\\u2013C');
      eq(_letterRun([], L6), '');
      // out-of-order input still reads in letter order
      eq(_letterRun(['D', 'A'], L6), 'A/D');
      // mixed: a 3-run plus strays
      eq(_letterRun(['A', 'B', 'C', 'F'], L6), 'A\\u2013C/F');
      // 12-piece hang collapses instead of printing every letter
      eq(_letterRun(_setLetters(12), _setLetters(12)), 'A\\u2013L');
    });

    // ── 3. THE CORE: consolidation ──
    __check('EXACT REQUEST: a value shared by the whole set prints ONCE with no letters', () => {
      const rows = _specSetRows(SET, L6);
      ['Frame Size', 'Frame Code', 'Mount', 'Hardware', 'Glass'].forEach(base => {
        const got = rowFor(rows, base);
        if (got.length !== 1) throw new Error(base + ': expected 1 consolidated row, got ' + got.length + ' -> ' + labelsOf(got).join(' | '));
        if (got[0].label !== base) throw new Error(base + ': shared row should carry no letter suffix, got "' + got[0].label + '"');
        if (got[0].all !== true) throw new Error(base + ': all flag not set');
        if (got[0].letters.length !== 6) throw new Error(base + ': letters should list the whole set');
      });
    });

    __check('EXACT REQUEST: a partially shared value carries the sharing letters', () => {
      const rows = _specSetRows(SET, L6);
      // A and D are the only matted pieces, and they match each other.
      const mats = rows.filter(r => r.base === 'Mat 1');
      if (mats.length !== 1) throw new Error('expected one Mat 1 row for A/D, got ' + mats.length + ' -> ' + labelsOf(mats).join(' | '));
      if (mats[0].label !== 'Mat 1 A/D') throw new Error('wanted "Mat 1 A/D", got "' + mats[0].label + '"');
      if (mats[0].all !== false) throw new Error('a partial row must not be flagged as covering the set');
      if (mats[0].letters.join('') !== 'AD') throw new Error('letters: ' + mats[0].letters.join(''));
    });

    __check('no None rows: pieces without a field simply do not appear for it', () => {
      const rows = _specSetRows(SET, L6);
      const none = rows.filter(r => /^none$/i.test(('' + r.value).trim()));
      if (none.length) throw new Error('found None rows: ' + labelsOf(none).join(' | '));
      // B/C/E/F are unmatted and must not be mentioned on any Mat row
      rows.filter(r => r.base === 'Mat 1').forEach(r => {
        ['B', 'C', 'E', 'F'].forEach(L => { if (r.letters.indexOf(L) >= 0) throw new Error('unmatted piece ' + L + ' listed on ' + r.label); });
      });
    });

    __check('mixed sizes enumerate, and pieces that match each other share a row', () => {
      const rows = _specSetRows(SET, L6);
      const od = rowFor(rows, 'Overall Dimensions');
      // A(30x20) B/C(15x12) D(25x17) E(20x15) F(15x15) = 5 distinct values
      if (od.length !== 5) throw new Error('expected 5 Overall Dimensions rows, got ' + od.length + ' -> ' + labelsOf(od).join(' | '));
      const bc = od.find(r => r.letters.join('') === 'BC');
      if (!bc) throw new Error('B and C share a size and must share a row: ' + labelsOf(od).join(' | '));
      if (bc.label !== 'Overall Dimensions B/C') throw new Error('got "' + bc.label + '"');
      // rows come out in letter order
      const first = od[0];
      if (first.letters[0] !== 'A') throw new Error('rows are not in letter order: ' + labelsOf(od).join(' | '));
    });

    __check('an all-identical set collapses the dimension rows too (the chosen behaviour)', () => {
      const same = [0, 1, 2, 3, 4, 5].map(i => mk('ART-9.9-' + 'ABCDEF'[i], { extW: 30, extH: 20 }));
      const rows = _specSetRows(same, L6);
      const od = rowFor(rows, 'Overall Dimensions');
      if (od.length !== 1) throw new Error('six matching pieces should give ONE size row, got ' + od.length);
      if (od[0].label !== 'Overall Dimensions') throw new Error('no suffix expected, got "' + od[0].label + '"');
    });

    // BEHAVIOUR CHANGED: rows used to come out in buildSpecStrings' emission
    // order, discovered by first encounter across members. That put the
    // rarely-changing build spec in the middle and, worse, dumped any label
    // only SOME pieces emit at the very end (see the White Border check below).
    // Order now comes from SPEC_ROW_GROUPS: application, build, frame,
    // mat/paper, then every size, with Overall Dimensions always last.
    __check('rows follow the category order, with the sizes last', () => {
      const rows = _specSetRows(SET, L6);
      const bases = [];
      rows.forEach(r => { if (bases.indexOf(r.base) < 0) bases.push(r.base); });
      const pos = (b) => bases.indexOf(b);
      if (pos('Application') !== 0) throw new Error('Application should lead: ' + bases.join(' > '));
      // Frame CODE before Frame SIZE — the code is what you order by. Swapped
      // deliberately; buildSpecStrings' emission order was swapped with it so
      // the per-piece pages match.
      const order = ['Application', 'Mount', 'Hardware', 'Glass', 'Backing Board', 'Frame Code', 'Frame Size', 'Mat 1', 'Art Dimensions', 'Overall Dimensions'];
      for (let i = 1; i < order.length; i++) {
        if (pos(order[i]) < 0) continue;
        if (pos(order[i]) < pos(order[i - 1])) throw new Error(order[i] + ' came before ' + order[i - 1] + ': ' + bases.join(' > '));
      }
      if (bases[bases.length - 1] !== 'Overall Dimensions') throw new Error('Overall Dimensions must be last, got ' + bases[bases.length - 1]);
      if (bases[bases.length - 2] !== 'Art Dimensions') throw new Error('Art Dimensions must be second to last, got ' + bases[bases.length - 2]);
      // the build block sits directly under Application, ahead of the frame
      if (pos('Mount') > pos('Frame Size')) throw new Error('the rarely-changing build spec should sit above the frame: ' + bases.join(' > '));
    });

    __check('EXACT BUG: a field only ONE piece has lands in its category, not after Overall Dimensions', () => {
      // Reproduces the reported page: three float-mounted pieces where only B
      // carries a white border. First-encounter ordering discovered White
      // Border after every one of A's labels, so it printed dead last, below
      // Overall Dimensions.
      const fm = (id, o) => mk(id, Object.assign({ useFloatMount: true, sbBackerColorName: 'B 97 White', paperType: 'Fine Art Paper', sbPaperMargin: 1.5, sbPaperBorder: 0 }, o || {}));
      const set3 = [fm('ART.003-A'), fm('ART.003-B', { sbPaperBorder: 1 }), fm('ART.003-C')];
      const rows = _specSetRows(set3, _setLetters(3));
      const bases = [];
      rows.forEach(r => { if (bases.indexOf(r.base) < 0) bases.push(r.base); });
      const wb = bases.indexOf('White Border');
      if (wb < 0) throw new Error('White Border vanished: ' + bases.join(' > '));
      const od = bases.indexOf('Overall Dimensions');
      if (wb > od) throw new Error('THE BUG: White Border printed after Overall Dimensions -> ' + bases.join(' > '));
      // it belongs with the mat/paper block, so ahead of every size row.
      // (This used Paper Size as the proxy for "the sizes" until Paper Size
      // moved INTO the mat/paper block — it describes the paper, not the piece.
      // Art Dimensions is the first real size row now.)
      const isz = bases.indexOf('Art Dimensions');
      if (isz >= 0 && wb > isz) throw new Error('White Border should sit above the sizes: ' + bases.join(' > '));
      const ps = bases.indexOf('Paper Size');
      if (ps >= 0 && ps > isz) throw new Error('Paper Size drifted back down into the sizes: ' + bases.join(' > '));
      // and it is B's alone, so it carries the letter
      const row = rows.find(r => r.base === 'White Border');
      if (row.label !== 'White Border B') throw new Error('wanted "White Border B", got "' + row.label + '"');
    });

    __check('every row is tagged with its category so the page can space the block', () => {
      const rows = _specSetRows(SET, L6);
      rows.forEach(r => { if (typeof r.group !== 'number') throw new Error(r.label + ' has no group tag'); });
      // groups only ever move forward down the block
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].group < rows[i - 1].group) throw new Error('categories are interleaved at ' + rows[i].label);
      }
      const distinct = rows.map(r => r.group).filter((g, i, a) => a.indexOf(g) === i);
      if (distinct.length < 3) throw new Error('expected several categories on a full spec, got ' + distinct.length);
    });

    __check('EXACT REQUEST: a size shared by the whole set prints the count', () => {
      const same = [0, 1, 2].map(i => mk('ART.003-' + 'ABC'[i], { extW: 24, extH: 24 }));
      const rows = _specSetRows(same, _setLetters(3));
      const od = rowFor(rows, 'Overall Dimensions');
      if (od.length !== 1) throw new Error('expected one row, got ' + od.length);
      if (od[0].value.indexOf('3 @ ') !== 0) throw new Error('wanted a "3 @ " prefix, got "' + od[0].value + '"');
      const img = rowFor(rows, 'Art Dimensions');
      if (img.length === 1 && img[0].value.indexOf('3 @ ') !== 0) throw new Error('Art Dimensions missed the count: "' + img[0].value + '"');
      // rows that carry letters already say how many, so they must NOT be counted
      const mixed = _specSetRows(SET, L6);
      rowFor(mixed, 'Overall Dimensions').forEach(r => {
        if (!r.all && /@/.test(r.value)) throw new Error('a lettered row got a count too: ' + r.label + ' = ' + r.value);
      });
      // and non-size rows never get one, however widely shared
      rows.forEach(r => {
        if (SPEC_QTY_LABELS.indexOf(r.base) < 0 && /^\\d+ @ /.test(r.value)) throw new Error('non-size row counted: ' + r.label + ' = ' + r.value);
      });
      // a single-piece set is not a quantity
      const one = _specSetRows([same[0]], _setLetters(1));
      rowFor(one, 'Overall Dimensions').forEach(r => { if (/@/.test(r.value)) throw new Error('one piece should not print "1 @": ' + r.value); });
    });

    __check('a one-piece set still works and needs no letters', () => {
      const rows = _specSetRows([SET[0]], _setLetters(1));
      if (!rows.length) throw new Error('no rows for a single piece');
      if (rows.some(r => !r.all)) throw new Error('a single piece covers the whole set, so nothing should be suffixed: ' + labelsOf(rows.filter(r => !r.all)).join(' | '));
    });

    __check('an empty / broken set degrades to no rows instead of throwing', () => {
      if (_specSetRows([], []).length) throw new Error('empty members gave rows');
      if (_specSetRows(null, null).length) throw new Error('null members gave rows');
      // a row that makes buildSpecStrings throw must be skipped, not fatal
      const rows = _specSetRows([SET[0], { get product() { throw new Error('boom'); } }], _setLetters(2));
      if (!rows.length) throw new Error('one bad row killed the whole block');
    });

    // ── 4. Template registration ──
    __check('setLegend is registered as a group template and shows up as a 4th card', () => {
      const t = SPEC_TEMPLATES.setLegend;
      if (!t) throw new Error('SPEC_TEMPLATES.setLegend missing');
      if (!t.group) throw new Error('must be group:true or it lands in the per-piece grid');
      if (!t.scale) throw new Error('must be scale:true to reuse the as-hung placement');
      if (!t.sharedSpec) throw new Error('sharedSpec flag missing');
      if (!t.label) throw new Error('no user-facing label');
      const s = window.__appSrc;
      if (!/\\['setRight', 'setRow', 'setScale', 'setLegend'\\]/.test(s)) throw new Error('not added to the group card grid');
      // the per-piece grid must still exclude it
      const perPiece = Object.keys(SPEC_TEMPLATES).filter(k => !SPEC_TEMPLATES[k].group && k !== 'installGuide');
      if (perPiece.indexOf('setLegend') >= 0) throw new Error('leaked into the per-piece template list');
    });

    __check('setLegend resolves like the other group templates, and survives mode memory', () => {
      editorialContent = _editorialDefaults();
      editorialContent.specTemplate = 'setLegend';
      // a group template must beat a per-page override, because it changes page count
      editorialContent.specTemplateOverrides = { 'ART-7.7': 'frameRight' };
      if (_specTplResolve('ART-7.7') !== 'setLegend') throw new Error('a per-page override beat the group template: ' + _specTplResolve('ART-7.7'));
      // _tplModeOf / _tplKnown are locals in the tools panel, so mirror their
      // logic here: both key off flags that setLegend must satisfy.
      const mode = (k) => (k === 'installGuide') ? 'install' : ((SPEC_TEMPLATES[k] && SPEC_TEMPLATES[k].group) ? 'group' : 'perPiece');
      if (mode('setLegend') !== 'group') throw new Error('mode is ' + mode('setLegend') + ', not group');
      if (!SPEC_TEMPLATES['setLegend']) throw new Error('unknown to _tplKnown, so mode memory would drop it');
      // the deck-wide sanitizer must not reset it back to classic on reload
      const ec = { specTemplate: 'setLegend' };
      if (!(SPEC_TEMPLATES[ec.specTemplate] || 'classic') || (SPEC_TEMPLATES[ec.specTemplate] ? 'setLegend' : 'classic') !== 'setLegend') throw new Error('sanitizer would drop setLegend on load');
    });

    __check('the as-hung options panel is gated on the flag, not on the setScale string', () => {
      const s = window.__appSrc;
      if (/globalTpl === 'setScale'/.test(s)) throw new Error('still gating the options block on a literal key, so setLegend gets no controls');
      if (!/SPEC_TEMPLATES\\[globalTpl\\] && SPEC_TEMPLATES\\[globalTpl\\]\\.scale/.test(s)) throw new Error('no flag-based gate found');
    });

    __check('one grouped page per set, same as the other group layouts', () => {
      editorialContent = _editorialDefaults();
      editorialContent.annotations = {}; editorialContent.pageFooters = {};
      editorialContent.specTemplate = 'setLegend';
      dashProjectData = SET.map(r => Object.assign({}, r));
      elevations = [{ name: 'WALL A', wallW: 240, wallH: 96, frames: SET.map((r, i) => ({ id: r.id, letter: L6[i], x: 0.1 + i * 0.13, y: 0.4, w: 0.1, h: 0.14, active: true, dimTo: [] })) }];
      floorplanLevels = [{ name: 'Level 1', imageData: '' }];
      const specs = _deckPageList().filter(d => d.kind === 'spec');
      if (specs.length !== 1) throw new Error('expected 1 grouped page, got ' + specs.length);
      if ((specs[0].members || []).length !== 6) throw new Error('members lost: ' + (specs[0].members || []).length);
      if (specs[0]._specTpl !== 'setLegend') throw new Error('page resolved to ' + specs[0]._specTpl);
    });

    // ── 5. Rendering ──
    __checkAsync('EXACT BUG END TO END: the page prints each shared value once, not once per piece', async () => {
      editorialContent = _editorialDefaults();
      editorialContent.annotations = {}; editorialContent.pageFooters = {};
      editorialContent.specTemplate = 'setLegend';
      dashProjectData = SET.map(r => Object.assign({}, r));
      elevations = [{ name: 'WALL A', wallW: 240, wallH: 96, frames: SET.map((r, i) => ({ id: r.id, letter: L6[i], x: 0.1 + i * 0.13, y: 0.4, w: 0.1, h: 0.14, active: true, dimTo: [] })) }];
      floorplanLevels = [{ name: 'Level 1', imageData: '' }];
      _collectProjectFramesCached = async () => [];        // frame strip covered separately

      const rec = new CanvasPdfRec(936, 540);
      _curPageKey = 'spec:ART-7.7'; _curFooter = _resolveFooter('spec:ART-7.7');
      await _drawSpecSetPage(rec, {}, 5, { location: 'LOUNGE', code: 'PRJ', version: '1' },
        { rep: SET[0], members: SET, key: 'ART-7.7' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      const texts = (rec.ops || []).filter(o => o && o.t === 'text').map(o => Array.isArray(o.str) ? o.str.join(' ') : ('' + (o.str == null ? '' : o.str)));
      const count = (needle) => texts.filter(s => s === needle).length;

      if (count('Frame Code') !== 1) throw new Error('THE BUG: "Frame Code" drawn ' + count('Frame Code') + ' times, expected exactly 1');
      if (count('Glass') !== 1) throw new Error('"Glass" drawn ' + count('Glass') + ' times, expected 1');
      if (count('Hardware') !== 1) throw new Error('"Hardware" drawn ' + count('Hardware') + ' times, expected 1');
      if (!texts.some(s => s === 'Mat 1 A/D')) throw new Error('the partially-shared mat row never printed: ' + JSON.stringify(texts.filter(s => /Mat/.test(s))));
      if (!texts.some(s => s === 'Overall Dimensions B/C')) throw new Error('B/C never shared a size row: ' + JSON.stringify(texts.filter(s => /Overall/.test(s))));
      // per-piece item-code headings belong to the OTHER layout and must be gone
      SET.forEach(r => { if (texts.indexOf(r.id) >= 0) throw new Error('per-piece heading ' + r.id + ' still drawn on a shared-spec page'); });
      // letters still label the artwork
      L6.forEach(L => { if (texts.indexOf(L) < 0) throw new Error('letter ' + L + ' missing from the artwork'); });
      // and the footer still lands
      if (!texts.some(s => s.trim() === '5')) throw new Error('no page number, so the footer did not draw');
    });

    __checkAsync('setScale is untouched: it still repeats the spec per piece', async () => {
      editorialContent = _editorialDefaults();
      editorialContent.annotations = {}; editorialContent.pageFooters = {};
      dashProjectData = SET.map(r => Object.assign({}, r));
      elevations = [{ name: 'WALL A', wallW: 240, wallH: 96, frames: SET.map((r, i) => ({ id: r.id, letter: L6[i], x: 0.1 + i * 0.13, y: 0.4, w: 0.1, h: 0.14, active: true, dimTo: [] })) }];
      const rec = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(rec, {}, 2, {}, { rep: SET[0], members: SET, key: 'ART-7.7' }, 'setScale', { PW: 936, PH: 540, M: 40 });
      const texts = (rec.ops || []).filter(o => o && o.t === 'text').map(o => '' + (o.str == null ? '' : o.str));
      const n = texts.filter(s => s === 'Frame Code').length;
      if (n !== 6) throw new Error('setScale should still print Frame Code once per piece (6), got ' + n);
      if (texts.indexOf(SET[0].id) < 0) throw new Error('setScale lost its per-piece headings');
    });

    __checkAsync('artwork-only pages draw no spec block at all', async () => {
      editorialContent = _editorialDefaults();
      editorialContent.annotations = {}; editorialContent.pageFooters = {};
      editorialContent.specArtOnly = { 'ART-7.7': true };
      dashProjectData = SET.map(r => Object.assign({}, r));
      elevations = [{ name: 'WALL A', wallW: 240, wallH: 96, frames: SET.map((r, i) => ({ id: r.id, letter: L6[i], x: 0.1 + i * 0.13, y: 0.4, w: 0.1, h: 0.14, active: true, dimTo: [] })) }];
      _collectProjectFramesCached = async () => [];
      const rec = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(rec, {}, 1, {}, { rep: SET[0], members: SET, key: 'ART-7.7' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      const texts = (rec.ops || []).filter(o => o && o.t === 'text').map(o => '' + (o.str == null ? '' : o.str));
      if (texts.indexOf('Frame Code') >= 0) throw new Error('artwork-only still drew the spec block');
    });

    __checkAsync('the frame strip narrows to the codes on THIS set', async () => {
      const all = [
        { code: 'MICH 432-22', finish: 'White', img: null, profileImg: null, color: '#ffffff' },
        { code: 'MICH-247-81', finish: 'Black', img: null, profileImg: null, color: '#000000' },
        { code: 'NOT-ON-THIS-WALL', finish: 'Gold', img: null, profileImg: null, color: '#c8a02e' }
      ];
      _collectProjectFramesCached = async () => all;
      const mixed = SET.slice(0, 3).concat([Object.assign({}, SET[3], { fCode: 'MICH-247-81' })]);
      const got = await _sharedSpecFrames(mixed);
      const codes = got.map(f => f.code).sort();
      if (codes.length !== 2) throw new Error('expected 2 frames, got ' + JSON.stringify(codes));
      if (codes.indexOf('NOT-ON-THIS-WALL') >= 0) throw new Error('picked up a frame that is not on this set');
      // hyphen/space differences must not split one frame in two
      if (codes.indexOf('MICH-247-81') < 0) throw new Error('code normalization failed: ' + JSON.stringify(codes));
    });

    // renderElevationToCanvas can't run under jsdom, so the thumbnail itself
    // never appears here. Test the strip's geometry contract directly against a
    // box standing in for the thumbnail, then assert on the source that the
    // page really does hand it the thumbnail's rect.
    __check('EXACT REQUEST: the frame strip ends where it is told and matches the box height', () => {
      const rec = new CanvasPdfRec(936, 540);
      const frames = [
        { code: 'MICH 432-22', finish: 'Gold', img: null, profileImg: null, color: '#c8a02e' },
        { code: 'MICH 247-81', finish: 'Black', img: null, profileImg: null, color: '#221a15' }
      ];
      const box = { right: 800, top: 400, height: 60, maxW: 400 };
      const left = _drawFrameStrip(rec, frames, box);
      if (left == null) throw new Error('the strip refused a box it comfortably fits in');
      if (left >= box.right) throw new Error('strip left ' + left + ' is not left of its right edge');
      const labels = (rec.ops || []).filter(o => o && o.t === 'text');
      if (labels.length !== 2) throw new Error('expected 2 code labels, got ' + labels.length);
      if (labels[0].str !== 'MICH 432-22' || labels[1].str !== 'MICH 247-81') throw new Error('codes: ' + labels.map(l => l.str).join(', '));
      // laid out left to right starting at the returned edge
      if (Math.abs(labels[0].x - left) > 0.01) throw new Error('first cell does not start at the returned left edge');
      if (labels[1].x <= labels[0].x) throw new Error('cells are not in order');
      // every cell's art sits inside the box height, and the labels align
      if (labels[0].y !== labels[1].y) throw new Error('code labels are not on one baseline');
      if (labels[0].y > box.top + box.height) throw new Error('the label overran the matched height: ' + labels[0].y + ' vs ' + (box.top + box.height));
      if (labels[0].y < box.top) throw new Error('label above the box top');
      const chips = (rec.ops || []).filter(o => o && o.t === 'rect');
      if (chips.length !== 2) throw new Error('expected a colour chip per frame with no corner image, got ' + chips.length);
      chips.forEach(c => {
        if (Math.abs(c.a[1] - box.top) > 0.01) throw new Error('chip top ' + c.a[1] + ' does not match the box top ' + box.top);
        if (c.a[3] > box.height) throw new Error('chip height ' + c.a[3] + ' exceeds the matched height ' + box.height);
      });
      // the last cell ends on the right edge it was given
      const lastRight = chips[1].a[0] + chips[1].a[2];
      if (lastRight > box.right + 0.01) throw new Error('the strip ran past its right edge: ' + lastRight + ' vs ' + box.right);
    });

    __check('the page anchors the strip to the elevation thumbnail rect', () => {
      const s = window.__appSrc;
      if (!/_thumbBox = \\{ tx: tx, ty: ty, tw: tw, th: th \\}/.test(s)) throw new Error('the elevation thumbnail rect is not captured');
      const i = s.indexOf('Frame corner + profile strip, immediately left of the elevation');
      if (i < 0) throw new Error('the strip is not drawn in the bottom band');
      const blk = s.slice(i, i + 900);
      if (!/_thumbBox \\? _thumbBox\\.th :/.test(blk)) throw new Error('strip height is not matched to the thumbnail');
      if (!/_thumbBox \\? \\(_thumbBox\\.tx - 14\\) :/.test(blk)) throw new Error('strip is not anchored to the LEFT of the thumbnail');
    });

    __checkAsync('with no elevation thumbnail the strip still lands in the band', async () => {
      _collectProjectFramesCached = async () => [
        { code: 'MICH 432-22', finish: 'Gold', img: null, profileImg: null, color: '#c8a02e' }
      ];
      editorialContent = _editorialDefaults();
      editorialContent.annotations = {}; editorialContent.pageFooters = {};
      editorialContent.scaleOpts = { codes: 'frames', elevThumb: false };
      dashProjectData = SET.map(r => Object.assign({}, r));
      elevations = [{ name: 'WALL A', wallW: 240, wallH: 96, frames: SET.map((r, i) => ({ id: r.id, letter: L6[i], x: 0.1 + i * 0.13, y: 0.4, w: 0.1, h: 0.14, active: true, dimTo: [] })) }];
      const rec = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(rec, {}, 1, {}, { rep: SET[0], members: SET, key: 'ART-7.7' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      const ops = rec.ops || [];
      const code = ops.find(o => o && o.t === 'text' && o.str === 'MICH 432-22');
      if (!code) throw new Error('the strip vanished when the elevation thumbnail was off');
      const SR = _safeFrameRect(936, 540);
      if (code.y > SR.B) throw new Error('strip label below the bottom guide at y ' + code.y.toFixed(1));
    });

    __checkAsync('the frame strip drops itself rather than crowding the specs', async () => {
      // 12 distinct frame codes cannot fit as legible cells in the spec column,
      // so the strip must be dropped. Nothing is lost: the codes are already
      // printed as Frame Code rows.
      const many = _setLetters(12).map((L, i) => ({ code: 'CODE-' + i, finish: 'X', img: null, profileImg: null, color: '#888888' }));
      _collectProjectFramesCached = async () => many;
      const big = _setLetters(12).map((L, i) => mk('ART-8.8-' + L, { extW: 20 + i, extH: 15 + i, fCode: 'CODE-' + i }));
      editorialContent = _editorialDefaults();
      editorialContent.annotations = {}; editorialContent.pageFooters = {};
      dashProjectData = big.slice();
      elevations = [{ name: 'WALL B', wallW: 400, wallH: 110, frames: big.map((r, i) => ({ id: r.id, letter: _setLetters(12)[i], x: 0.05 + i * 0.07, y: 0.4, w: 0.05, h: 0.08, active: true, dimTo: [] })) }];
      const rec = new CanvasPdfRec(936, 540);
      let threw = null;
      try {
        await _drawSpecSetPage(rec, {}, 3, {}, { rep: big[0], members: big, key: 'ART-8.8' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      } catch (e) { threw = e; }
      if (threw) throw new Error('a 12-piece hang threw: ' + threw.message);
      const texts = (rec.ops || []).filter(o => o && o.t === 'text').map(o => '' + (o.str == null ? '' : o.str));
      const cells = texts.filter(s => /^CODE-\\d+$/.test(s));
      if (cells.length) throw new Error('the frame strip crowded in anyway with ' + cells.length + ' cells');
      // ...and the specs themselves still drew, with G-L not 7-12
      if (!texts.some(s => /Overall Dimensions/.test(s))) throw new Error('spec rows vanished');
      if (texts.indexOf('7') >= 0) throw new Error('piece 7 labelled itself "7" instead of "G"');
      if (texts.indexOf('L') < 0) throw new Error('12th piece is not labelled L');
    });

    // ── 6. The mat filter bug on the OTHER group layouts ──
    __check('EXACT BUG: standard framed art now shows mat info on stacked / side-by-side pages', () => {
      const s = window.__appSrc;
      const lists = s.match(/\\['Application', 'Frame Size', 'Frame Code'[^\\]]*\\]/g) || [];
      if (lists.length < 4) throw new Error('expected the 4 group spec filters, found ' + lists.length);
      lists.forEach(l => {
        if (l.indexOf("'Mat 1'") < 0) throw new Error("a group spec filter still omits 'Mat 1', so standard framed art shows no mat: " + l);
        if (l.indexOf("'Matboard'") < 0) throw new Error('float-mount rows lost their Matboard line: ' + l);
        if (l.indexOf("'Art Dimensions'") < 0) throw new Error('preview/PDF drift on Art Dimensions is back: ' + l);
      });
    });

    __check('a standard framed-art row really does emit Mat 1 and not Matboard', () => {
      // guards the assumption the fix above rests on
      const labels = buildSpecStrings(SET[0]).lines.map(l => l.label);
      if (labels.indexOf('Mat 1') < 0) throw new Error('matted framed art did not emit Mat 1: ' + labels.join(', '));
      if (labels.indexOf('Matboard') >= 0) throw new Error('framed art unexpectedly emitted Matboard');
    });

    // ── 7. The rail / card mock ──
    __check('the mock renders one merged block, not a per-piece stack', () => {
      editorialContent = _editorialDefaults();
      editorialContent.specTemplate = 'setLegend';
      dashProjectData = SET.map(r => Object.assign({}, r));
      elevations = [{ name: 'WALL A', wallW: 240, wallH: 96, frames: SET.map((r, i) => ({ id: r.id, letter: L6[i], x: 0.1 + i * 0.13, y: 0.4, w: 0.1, h: 0.14, active: true, dimTo: [] })) }];
      const desc = { kind: 'spec', row: SET[0], members: SET, title: 'ART-7.7' };
      const shared = _deckMockHTML(Object.assign({}, desc, { _previewTpl: 'setLegend' }), 150, 90);
      const scale = _deckMockHTML(Object.assign({}, desc, { _previewTpl: 'setScale' }), 150, 90);
      if (!shared || !scale) throw new Error('a mock came back empty');
      if (shared === scale) throw new Error('the two cards render identically, so they are indistinguishable in the picker');
      if (shared.indexOf('A/D') < 0) throw new Error('the merged mock does not show a letter-grouped label');
      // setScale's mock leads each block with the item code; the shared one must not
      if (shared.indexOf('<b>' + SET[0].id + '</b>') >= 0) throw new Error('shared mock still draws per-piece headings');
      if (scale.indexOf('<b>' + SET[0].id + '</b>') < 0) throw new Error('setScale mock lost its per-piece headings');
    });
  `;

  try {
    window.__appSrc = src;
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const results = window.__testResults || [];
  const asyncResults = await Promise.all(window.__asyncChecks || []);
  const all = results.concat(asyncResults);
  let failures = [];
  all.forEach(r => {
    console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err));
    if (!r.ok) failures.push(r.label);
  });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
