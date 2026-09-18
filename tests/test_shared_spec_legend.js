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
    __check('setLegend is registered as a group template and is the group default', () => {
      const t = SPEC_TEMPLATES.setLegend;
      if (!t) throw new Error('SPEC_TEMPLATES.setLegend missing');
      if (!t.group) throw new Error('must be group:true or it lands in the per-piece grid');
      if (!t.scale) throw new Error('must be scale:true to reuse the as-hung placement');
      if (!t.sharedSpec) throw new Error('sharedSpec flag missing');
      if (!t.label) throw new Error('no user-facing label');
      const s = window.__appSrc;
      // The four group CARDS are gone - the SHOW ON PAGE ticks replaced them, the same
      // move the per-piece panel made - so being in the grid is no longer what makes
      // this layout reachable. Being the DEFAULT is.
      if (s.indexOf("switchMode('setLegend')") < 0) throw new Error('Group A/B/C no longer opens on Shared specs');
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

    __check('the strip anchors to whatever thumbnail sits on its right', () => {
      // It used to say "the elevation", and that stopped being the whole truth when
      // the floorplan joined the band: right to left it reads elevation, plan,
      // profile, corner, and each one anchors to the box its neighbour actually drew
      // rather than to a column of its own. Untick the elevation and everything
      // slides right - which is the behaviour, so read THAT and not the wording.
      const s = window.__appSrc;
      const i = s.indexOf('Frame corner + profile strip, immediately left of');
      if (i < 0) throw new Error('the strip is not drawn in the bottom band');
      const blk = s.slice(i, s.indexOf('opts.codes === ', i));
      if (blk.indexOf('_thumbBox ? _thumbBox.th :') < 0) throw new Error('strip height is not matched to the thumbnail on its right');
      if (blk.indexOf('_thumbBox ? (_thumbBox.tx - 14) :') < 0) throw new Error('strip is not anchored to the LEFT of that thumbnail');
      // And every thumbnail in the band advances the same cursor, or two of them
      // stack on the same pixels.
      const band = s.slice(s.indexOf('Bottom band: image-code legend'), i);
      if (band.split('_thumbBox = {').length - 1 < 3) throw new Error('not every band thumbnail records its rect for the next one');
    });

    // ---- The band is four ticks, laid right to left ----
    // These RENDER the page rather than reading the source. A negative control proved
    // why: source-order checks passed every one of the breaks that moved a thumbnail,
    // dropped its rect handoff, or stopped the frame ticks reaching the strip.
    const __bandSetup = (groupTicks, withWall) => {
      _collectProjectFramesCached = async () => [
        { code: 'MICH 432-22', finish: 'Gold', img: null, profileImg: null, color: '#c8a02e' }
      ];
      editorialContent = _editorialDefaults();
      editorialContent.annotations = {}; editorialContent.pageFooters = {};
      editorialContent.scaleOpts = { codes: 'frames' };
      editorialContent.specGroupSlots = Object.assign({ frame: true, profile: true, plan: true, elevation: true }, groupTicks || {});
      editorialContent.specGroupSlotOverrides = {};
      dashProjectData = SET.map(r => Object.assign({}, r));
      elevations = withWall ? [{ name: 'WALL A', wallW: 240, wallH: 96, frames: SET.map((r, i) => ({ id: r.id, letter: L6[i], x: 0.1 + i * 0.13, y: 0.4, w: 0.1, h: 0.14, active: true, dimTo: [] })) }] : [];
    };
    // A caption is the one mark every band thumbnail leaves, whether it drew content
    // or reserved its space, so the order can be read off the captions alone.
    const __capX = (ops, word) => { const o = (ops || []).find(op => op && op.t === 'text' && op.str === word); return o ? o.x : null; };

    // The artwork's top must not move when a tick does. The region's HEIGHT changes
    // with the bottom band, and the art used to be CENTRED in it, so turning every
    // tick off dropped the frames into the middle of a page-tall region.
    // Read off the LETTER and the IMAGE CODE, not the frame mockups: a mockup is a
    // rasterised canvas and nothing rasterises in jsdom, while both of these are drawn
    // from the slot geometry and survive a failed render on purpose (that is why the
    // letter is drawn outside the mockup try in the first place).
    //
    // The letter sits 2pt above its slot; the code sits 7pt below it.
    const __artBox = (ops) => {
      const L = (ops || []).filter(o => o && o.t === 'text' && /^[A-Z]$/.test(o.str || ''));
      // An image code has a dot and NO spaces. Without the space test this matched the
      // footer's copyright line, which sits below the bottom guide and reported the art
      // as ending 27pt past the page.
      const C = (ops || []).filter(o => o && o.t === 'text' && (o.str || '').indexOf('.') > 0
        && (o.str || '').indexOf(' ') < 0 && (o.str || '').length > 8 && o.y < 470);
      if (!L.length) return null;
      const top = Math.min.apply(null, L.map(o => o.y)) + 2;
      const bot = C.length ? (Math.max.apply(null, C.map(o => o.y)) - 7) : top;
      return { top: top, bot: bot };
    };
    const __artTop = (ops) => { const b = __artBox(ops); return b ? b.top : null; };

    __checkAsync('EXACT BUG: the frames do not fall down the page when every tick is off', async () => {
      __bandSetup({}, true);
      const all = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(all, {}, 1, {}, { rep: SET[0], members: SET, key: 'ART-7.7' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      const topAll = __artTop(all.ops);
      __bandSetup({ frame: false, profile: false, plan: false, elevation: false }, true);
      const none = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(none, {}, 1, {}, { rep: SET[0], members: SET, key: 'ART-7.7' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      const topNone = __artTop(none.ops);
      if (topAll == null || topNone == null) throw new Error('no artwork drawn in one of the two passes');
      if (Math.abs(topNone - topAll) > 1) throw new Error('the frames moved when the ticks changed: ' + topAll.toFixed(1) + ' with all on, ' + topNone.toFixed(1) + ' with all off');
    });

    __checkAsync('EXACT BUG: with NO wall either, the frames still hang from the top', async () => {
      // No wall means no geometry, so the pieces line up on a baseline - the path that
      // used to bottom them out on the page edge. Driven separately because the check
      // above has a wall and never reaches it.
      __bandSetup({}, false);
      const all = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(all, {}, 1, {}, { rep: SET[0], members: SET, key: 'ART-7.7' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      const topAll = __artTop(all.ops);
      __bandSetup({ frame: false, profile: false, plan: false, elevation: false }, false);
      const none = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(none, {}, 1, {}, { rep: SET[0], members: SET, key: 'ART-7.7' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      const topNone = __artTop(none.ops);
      if (topAll == null || topNone == null) throw new Error('no artwork drawn in one of the two passes');
      if (Math.abs(topNone - topAll) > 1) throw new Error('the baseline fell with the ticks: ' + topAll.toFixed(1) + ' vs ' + topNone.toFixed(1));
      const SR = _safeFrameRect(936, 540);
      if (topAll > SR.T + (SR.B - SR.T) * 0.45) throw new Error('the frames start halfway down the page: ' + topAll.toFixed(1));
    });

    __checkAsync('a TALL group is scaled to the height it actually has', async () => {
      // Every other fixture here is width-constrained, so the height term never
      // decides and swapping it for the old region height changed nothing.
      // Two wide pieces STACKED, so the bounding box is tall and the height term wins,
      // while each piece stays wide enough to print its code - which is the only mark
      // at the BOTTOM of the artwork that survives a jsdom render.
      const tall = SET.slice(0, 2).map(r => Object.assign({}, r, { extW: 72, extH: 38 }));
      __bandSetup({}, true);
      elevations = [{ name: 'WALL A', wallW: 240, wallH: 96, frames: tall.map((r, i) => ({ id: r.id, letter: L6[i], x: 0.2, y: 0.1 + i * 0.45, w: 0.3, h: 0.4, active: true, dimTo: [] })) }];
      dashProjectData = tall.map(r => Object.assign({}, r));
      const rec = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(rec, {}, 1, {}, { rep: tall[0], members: tall, key: 'ART-7.7' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      const ops = rec.ops || [];
      // The pieces themselves are frame mockups rasterised onto a canvas, which draws
      // nothing under jsdom, so the artwork's BOTTOM is derived from the two letters:
      // they are 0.45 of a 96in wall apart, which gives the scale, and the lower piece
      // is 0.4 of that wall tall.
      const LY = ops.filter(o => o && o.t === 'text' && /^[AB]$/.test(o.str || '') && o.x > 380).map(o => o.y);
      if (LY.length !== 2) throw new Error('expected two letters, got ' + LY.length);
      const lo = Math.max.apply(null, LY), hi = Math.min.apply(null, LY);
      const sc = (lo - hi) / (0.45 * 96);
      const artBot = lo + 0.4 * 96 * sc;
      const belowTops = ops.filter(o => o && o.t === 'rect' && o.a && o.a[1] > artBot - 60).map(o => o.a[1]);
      if (!belowTops.length) throw new Error('no band below a tall group');
      const bandTop = Math.min.apply(null, belowTops);
      if (bandTop - artBot < 15) throw new Error('a tall group crowds the band: ' + (bandTop - artBot).toFixed(1) + 'pt of clearance');
    });

    __checkAsync('the frames start on the line the spec column starts on', async () => {
      // What the top is anchored TO, not just that it is stable: the two halves of the
      // page begin together. Floored at the region top so it can never ride above it.
      __bandSetup({}, true);
      const rec = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(rec, {}, 1, {}, { rep: SET[0], members: SET, key: 'ART-7.7' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      const top = __artTop(rec.ops);
      const GB = _titleBand(936, 540);
      if (top == null) throw new Error('no artwork drawn');
      if (Math.abs(top - (GB.body + 8)) > 2) throw new Error('the frames do not start on the spec line: ' + top.toFixed(1) + ' vs ' + (GB.body + 8).toFixed(1));
    });

    __checkAsync('EXACT BUG: the frames clear the thumbnails under them', async () => {
      // Reported with the elevation ticked but no wall yet, so the band is all
      // reserved boxes - which is exactly when the art was closest to them.
      __bandSetup({}, false);
      const rec = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(rec, {}, 1, {}, { rep: SET[0], members: SET, key: 'ART-7.7' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      const ops = rec.ops || [];
      const box = __artBox(ops);
      if (!box) throw new Error('no artwork drawn');
      const artBot = box.bot;
      // The TOP of the nearest box below the art, not a caption - a caption sits under
      // its own box, which left this slack enough to pass with a 2pt gap.
      const belowTops = ops.filter(o => o && o.t === 'rect' && o.a && o.a[1] > artBot + 1).map(o => o.a[1]);
      if (!belowTops.length) throw new Error('no reserved box in the band below the artwork');
      const bandTop = Math.min.apply(null, belowTops);
      if (bandTop - artBot < 15) throw new Error('the artwork crowds the band: ' + (bandTop - artBot).toFixed(1) + 'pt of clearance');
    });

    __checkAsync('the artwork never rides above the region it is placed in', async () => {
      // On the Farmboy sets the spec line sits well below the region top, so the floor
      // under it never binds. A set that declares no title lines puts the line ABOVE
      // the region - which is the only place removing the floor shows.
      const _wasGuide = _guidePref().setId;
      try {
        // The set has to be chosen AFTER the fixture: __bandSetup rebuilds
        // editorialContent, which is where the guide pref lives, so setting it first
        // silently rendered on the default set and the check proved nothing.
        __bandSetup({}, true);
        _setDeckGuide({ setId: 'g_margins' });
        const SR = _safeFrameRect(936, 540);
        const regY = SR.T + (SR.B - SR.T) * 0.118;
        const GB = _titleBand(936, 540);
        if (GB.body + 8 >= regY) throw new Error('this set does not exercise the floor: spec line ' + (GB.body + 8).toFixed(1) + ' vs region top ' + regY.toFixed(1));
        const rec = new CanvasPdfRec(936, 540);
        await _drawSpecSetPage(rec, {}, 1, {}, { rep: SET[0], members: SET, key: 'ART-7.7' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
        const top = __artTop(rec.ops || []);
        if (top == null) throw new Error('no artwork drawn');
        if (top < regY - 4) throw new Error('the artwork starts above its own region: ' + top.toFixed(1) + ' against a region top of ' + regY.toFixed(1));
      } finally { _setDeckGuide({ setId: _wasGuide }); }
    });

    // A stub doc that measures the way jsPDF does for this purpose: a width per
    // character. _drawFrameStrip is driven DIRECTLY because the strip needs real
    // frames in the library and its own box, and what is being asserted is one
    // coordinate rather than a whole page.
    const __stripDoc = (perChar) => ({
      ops: [],
      setFontSize() {}, setFont() {}, setTextColor() {}, setFillColor() {}, setDrawColor() {}, setLineWidth() {},
      addImage() {}, rect() {}, line() {}, setLineDashPattern() {},
      getTextWidth(t) { return ('' + t).length * perChar; },
      text(str, x, y) { this.ops.push({ str: str, x: x, y: y }); }
    });

    __check('EXACT BUG: a frame code never prints past the strip right edge', () => {
      // Reported as text falling outside the guide safety area with only FRAME
      // CORNER ticked. The chip is as narrow as MIN_CELL (26pt) while MICH 432-29
      // measures ~33pt at 6.5pt, and the label was drawn left-aligned on the cell
      // with nothing bounding its right end, so the LAST one hung outside the guide
      // the chip itself sat inside.
      const RIGHT = 914;
      const d = __stripDoc(3);
      const frames = [{ code: 'MICH 432-29', color: '#111111' }];
      const left = _drawFrameStrip(d, frames, { right: RIGHT, top: 395, height: 79, maxW: 520, corner: true, profile: false });
      if (left == null) throw new Error('the strip refused to draw at all');
      d.ops.forEach(op => {
        const end = op.x + d.getTextWidth(op.str);
        if (end > RIGHT + 0.01) throw new Error(op.str + ' ends at ' + end.toFixed(1) + ', past the right edge ' + RIGHT);
      });
    });

    __check('a code that already fits is NOT shifted off its own chip', () => {
      // The clamp must be a ceiling, not a re-anchor: a short code still starts on
      // the left edge of the cell it belongs to, or every label slides right and
      // stops naming the chip above it.
      const RIGHT = 914;
      const d = __stripDoc(1);
      const frames = [{ code: 'A1', color: '#111111' }, { code: 'B2', color: '#222222' }];
      const left = _drawFrameStrip(d, frames, { right: RIGHT, top: 395, height: 79, maxW: 520, corner: true, profile: false });
      if (left == null) throw new Error('the strip refused to draw at all');
      if (d.ops.length !== 2) throw new Error('expected two labels, got ' + d.ops.length);
      if (Math.abs(d.ops[0].x - left) > 0.01) throw new Error('the first label moved off its cell: ' + d.ops[0].x + ' vs ' + left);
      if (d.ops[1].x + 2 > RIGHT) throw new Error('the second label was pushed to the edge for no reason');
    });

    __check('a code wider than the band drops the strip rather than overhanging', () => {
      // The floor matters as much as the ceiling: clamping to the right alone sends
      // an over-long label left past the region the band is allowed to use.
      const RIGHT = 914, MAXW = 120;
      const d = __stripDoc(9);
      const left = _drawFrameStrip(d, [{ code: 'MICH 432-29 BLACK', color: '#111111' }], { right: RIGHT, top: 395, height: 79, maxW: MAXW, corner: true, profile: false });
      // A code wider than the band it is allowed is exactly the case the strip already
      // drops itself for, and the code still prints in full as a Frame Code spec row.
      if (left == null) { if (d.ops.length) throw new Error('the strip returned null but still drew'); return; }
      const end = d.ops[0].x + d.getTextWidth(d.ops[0].str);
      if (end > RIGHT + 0.01) throw new Error('an over-long code still ran past the edge: it ends at ' + end.toFixed(1));
      if (d.ops[0].x < left - 0.01) throw new Error('the label started left of the strip edge the legend lays out against');
    });

    __checkAsync('EXACT ASK: right to left the band is elevation, plan, profile+corner', async () => {
      __bandSetup({}, true);
      const rec = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(rec, {}, 1, {}, { rep: SET[0], members: SET, key: 'ART-7.7' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      const ops = rec.ops || [];
      const xe = __capX(ops, 'Elevation'), xp = __capX(ops, 'Floorplan');
      const xs = __capX(ops, 'MICH 432-22');
      if (xe == null) throw new Error('no elevation in the band');
      if (xp == null) throw new Error('no floorplan in the band');
      if (xs == null) throw new Error('no frame strip in the band');
      if (!(xs < xp)) throw new Error('the frame strip is not left of the floorplan: ' + xs + ' vs ' + xp);
      if (!(xp < xe)) throw new Error('the floorplan is not left of the elevation: ' + xp + ' vs ' + xe);
    });

    __checkAsync('unticking one slides the rest RIGHT rather than leaving a hole', async () => {
      __bandSetup({}, true);
      const a1 = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(a1, {}, 1, {}, { rep: SET[0], members: SET, key: 'ART-7.7' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      const planWith = __capX(a1.ops || [], 'Floorplan');
      __bandSetup({ elevation: false }, true);
      const a2 = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(a2, {}, 1, {}, { rep: SET[0], members: SET, key: 'ART-7.7' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      const ops2 = a2.ops || [];
      if (__capX(ops2, 'Elevation') != null) throw new Error('an unticked elevation still drew');
      const planWithout = __capX(ops2, 'Floorplan');
      if (planWithout == null) throw new Error('the floorplan went with the elevation');
      if (!(planWithout > planWith)) throw new Error('the floorplan did not take the column the elevation gave up: ' + planWithout + ' vs ' + planWith);
    });

    __checkAsync('a ticked elevation with no wall RESERVES its box', async () => {
      __bandSetup({}, false);
      const rec = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(rec, {}, 1, {}, { rep: SET[0], members: SET, key: 'ART-7.7' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      const ops = rec.ops || [];
      const xe = __capX(ops, 'Elevation');
      if (xe == null) throw new Error('a ticked elevation with no wall collapsed instead of holding its space');
      const xp = __capX(ops, 'Floorplan');
      if (!(xp < xe)) throw new Error('the floorplan did not stay left of the reserved elevation box');
    });

    __checkAsync('unticking the profile alone narrows the strip', async () => {
      // Both ticks off is gated BEFORE _drawFrameStrip is called, so a break that
      // hardcodes corner:true/profile:true inside the call still passes that way.
      // One off and one on is the case that reaches the strip, and what changes is
      // its WIDTH - so the strip, which is right-anchored, starts further right.
      // Needs a real profile drawing: with profileImg null the cell is the same
      // width either way and the check would prove nothing.
      const withProfile = async (ticks) => {
        __bandSetup(ticks, true);
        _collectProjectFramesCached = async () => [
          { code: 'MICH 432-22', finish: 'Gold', img: null, color: '#c8a02e',
            profileImg: { naturalWidth: 300, naturalHeight: 200, width: 300, height: 200 } }
        ];
        const rec = new CanvasPdfRec(936, 540);
        await _drawSpecSetPage(rec, {}, 1, {}, { rep: SET[0], members: SET, key: 'ART-7.7' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
        return __capX(rec.ops || [], 'MICH 432-22');
      };
      const both = await withProfile({});
      const cornerOnly = await withProfile({ profile: false });
      if (both == null || cornerOnly == null) throw new Error('the strip did not draw in one of the two passes');
      if (!(cornerOnly > both)) throw new Error('unticking the profile did not narrow the strip: ' + cornerOnly + ' vs ' + both);
    });

    __checkAsync('the two frame ticks reach the strip independently', async () => {
      __bandSetup({ profile: false }, true);
      const a1 = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(a1, {}, 1, {}, { rep: SET[0], members: SET, key: 'ART-7.7' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      if (__capX(a1.ops || [], 'MICH 432-22') == null) throw new Error('unticking the profile took the corner with it');
      __bandSetup({ frame: false, profile: false }, true);
      const a2 = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(a2, {}, 1, {}, { rep: SET[0], members: SET, key: 'ART-7.7' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      if (__capX(a2.ops || [], 'MICH 432-22') != null) throw new Error('the strip drew with both of its ticks off');
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
