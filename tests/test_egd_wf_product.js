// EGD (Environmental Graphic Design = wallcovering) and WF (vinyl window film) as
// real product types. Asked for: "I need to add EGD to the Frame tool, EGD is
// wallcovering. Another product is Vinyl Window Film (WF). For this product I want to
// be able to type in the overall dimensions of the wallcovering or window film size
// and place the image into the wall dimensions, drag and drop similar to the mockup
// frames."
//
// A flat graphic has ONE dimension pair: the overall size IS the graphic. No moulding,
// no mat, no glass, no rabbet, no stretcher bar, and — unlike a wrapped canvas — no
// drop shadow, because it sits flush to the wall rather than standing off it.
//
// Three classes of bug this pins:
//
//  1. THE FIVE-WAY DRIFT. Opening/print size was copy-pasted into five places
//     (updateTableRowCalcs, updateDashVisualsFromDOM, renderDashTable,
//     buildDashCSVString, buildSpecStrings). Teaching four of the five means the
//     table and the spec page print different numbers for the same piece, with
//     nothing on screen to say which is right. They already disagreed before this
//     work: two clamped a negative opening before adding bleed and two didn't. Now
//     there is one _rowOpeningAndPrint and these tests hold it there.
//  2. THE isFrameless PRECEDENT IS BOOBY-TRAPPED. That branch of
//     renderFrameToCanvas ignores opts.artworkImg AND opts.wireframe — it punches a
//     transparent hole and leaves compositing to the caller. Copied verbatim, a
//     wallcovering would be an invisible gap on the wall and wireframe decks would
//     lose their grey placement block.
//  3. ONE PREDICATE, NOT TWO FLAGS. The product enum is branched on at ~20 sites
//     whose local names already disagree (isC/isCanvas/isFloater,
//     isFL/isFrameless/iFL). _isFlatGraphic exists so a third flat product is an
//     array entry, not twenty edits.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  // A 2d context stub rich enough for renderFrameToCanvas, recording what it drew.
  window.__ctxLog = [];
  const mkCtx = () => {
    const log = [];
    const c = {
      _log: log,
      save: () => {}, restore: () => {}, translate: () => {}, clip: () => {},
      beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
      arc: () => {}, arcTo: () => {}, ellipse: () => {}, setLineDash: () => {},
      fill: () => {}, stroke: () => {}, rect: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      measureText: () => ({ width: 8 }),
      fillRect: (x, y, w, h) => log.push({ op: 'fillRect', x, y, w, h, fill: c.fillStyle }),
      strokeRect: (x, y, w, h) => log.push({ op: 'strokeRect', x, y, w, h, stroke: c.strokeStyle }),
      clearRect: (x, y, w, h) => log.push({ op: 'clearRect', x, y, w, h }),
      drawImage: (img, x, y, w, h) => log.push({ op: 'drawImage', x, y, w, h }),
      fillText: (t, x, y) => log.push({ op: 'fillText', t, x, y, font: c.font })
    };
    return c;
  };
  window.HTMLCanvasElement.prototype.getContext = function () {
    if (!this.__ctx) { this.__ctx = mkCtx(); window.__ctxLog.push(this.__ctx); }
    return this.__ctx;
  };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AA';

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const S = window.__appSrc;
    const EGD = 'Wallcovering (EGD)', WF = 'Window Film (WF)';
    const base = (over) => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), over);
    const egd = (over) => base(Object.assign({ product: EGD, extW: 192, extH: 120 }, over || {}));

    const _lastCtx = () => window.__ctxLog[window.__ctxLog.length - 1];
    const _renderFlat = (opts) => {
      window.__ctxLog.length = 0;
      const out = renderFrameToCanvas(_frameDataInInches(egd(), 'in'), null, Object.assign({ dpi: 72, pad: 0 }, opts || {}));
      return { out: out, log: (_lastCtx() || {})._log || [] };
    };

    // ── The predicate ───────────────────────────────────────────────────────
    __check('both products are in the enum and the predicate matches exactly them', () => {
      [EGD, WF].forEach(p => { if (FRAME_PRODUCTS.indexOf(p) < 0) throw new Error(p + ' missing from FRAME_PRODUCTS'); });
      FRAME_PRODUCTS.forEach(p => {
        const want = (p === EGD || p === WF);
        if (_isFlatGraphic(p) !== want) throw new Error('_isFlatGraphic(' + p + ') = ' + _isFlatGraphic(p));
      });
      // Nonsense in, false out — not a crash.
      [undefined, null, '', 'Framed', 'wallcovering (egd)'].forEach(v => {
        if (_isFlatGraphic(v)) throw new Error('_isFlatGraphic matched ' + JSON.stringify(v));
      });
      // The form <select> must offer them, or the type is unreachable in the UI.
      const opts = Array.from(document.querySelectorAll('#m_product option')).map(o => o.value);
      [EGD, WF].forEach(p => { if (opts.indexOf(p) < 0) throw new Error(p + ' missing from the #m_product dropdown'); });
      // And the two lists must agree, or the project table and the form drift.
      FRAME_PRODUCTS.forEach(p => { if (opts.indexOf(p) < 0) throw new Error('FRAME_PRODUCTS has ' + p + ' but the dropdown does not'); });
      if (opts.length !== FRAME_PRODUCTS.length) throw new Error('dropdown has ' + opts.length + ' options vs ' + FRAME_PRODUCTS.length + ' products');
    });

    // ── Geometry: the overall size IS the graphic ────────────────────────────
    __check('EXACT ASK: the typed overall size is the graphic, with no frame or mat subtracted', () => {
      dashUnit = 'in';
      const s = _rowOpeningAndPrint(egd());
      if (s.openW !== 192 || s.openH !== 120) throw new Error('opening should equal the overall size, got ' + s.openW + 'x' + s.openH);
      // Bleed still applies — vinyl is printed and needs trim. This is where a flat
      // graphic parts company with a wrapped canvas, which adds wrap instead.
      if (s.printW !== 192.5 || s.printH !== 120.5) throw new Error('print should be overall + bleed*2, got ' + s.printW + 'x' + s.printH);
    });

    __check('and frame / mat / float-mount values on the row cannot shrink it', () => {
      // A row that was Framed Art a moment ago still carries all of this. If any of
      // it reaches the geometry the graphic silently comes out smaller than ordered.
      const s = _rowOpeningAndPrint(egd({
        fW: 5, fHeight: 3, rabbetDepth: 2,
        m1A: true, m1T: 9, m1B: 9, m1L: 9, m1R: 9, m2A: true, m2: 2,
        useFloatMount: true, sbPaperMargin: 4, sbPaperBorder: 3, floaterInset: 6
      }));
      if (s.openW !== 192 || s.openH !== 120) throw new Error('THE BUG: leftover framing shrank the graphic to ' + s.openW + 'x' + s.openH);
    });

    __check('every existing product still computes exactly what it did before', () => {
      // The five copies became one; these are the pre-refactor numbers.
      const cases = [
        ['Framed Art 24x24 f.75 m3 b.25', base({}), 16.5, 16.5, 17, 17],
        ['mats off', base({ m1A: false }), 22.5, 22.5, 23, 23],
        ['double mat .25', base({ m2A: true, m2: 0.25 }), 16, 16, 16.5, 16.5],
        ['floater inset .75', base({ product: 'Framed Canvas (Floater)' }), 22.5, 22.5, 22.5, 22.5],
        ['frameless wrap 2', base({ product: 'Frameless Canvas (Wrapped)', canvasWrap: 2 }), 24, 24, 28, 28],
        ['float mount 1.5/0.5', base({ useFloatMount: true }), 18.5, 18.5, 19, 19]
      ];
      cases.forEach(([label, r, ow, oh, pw, ph]) => {
        const s = _rowOpeningAndPrint(r);
        if (s.openW !== ow || s.openH !== oh) throw new Error(label + ': opening ' + s.openW + 'x' + s.openH + ' expected ' + ow + 'x' + oh);
        if (s.printW !== pw || s.printH !== ph) throw new Error(label + ': print ' + s.printW + 'x' + s.printH + ' expected ' + pw + 'x' + ph);
      });
    });

    __check('an over-matted piece clamps the opening BEFORE adding bleed', () => {
      // The five copies disagreed here: two added bleed to a raw negative opening,
      // two clamped first. A print file cannot be negative-plus-bleed.
      const s = _rowOpeningAndPrint(base({ extW: 6, extH: 6 }));
      if (s.openW !== 0 || s.openH !== 0) throw new Error('opening should clamp to 0, got ' + s.openW);
      if (s.printW !== 0.5) throw new Error('print should be 0 + bleed*2, got ' + s.printW);
    });

    __check('the five display sites all read the one definition, so they cannot drift', () => {
      const n = (S.match(/_rowOpeningAndPrint\\(/g) || []).length;
      // 1 definition + 5 call sites.
      if (n < 6) throw new Error('only ' + n + ' references — a display site still has its own copy');
      // And none of them kept a private copy of the branch.
      const copies = (S.match(/else if \\(isFL\\) \\{ openW = extW/g) || []).length;
      if (copies > 1) throw new Error('the opening math appears in more than one place again');
    });

    __check('fitODToImage adds no phantom border on a flat graphic', () => {
      const i = S.indexOf('function fitODToImage');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (!/_isFlatGraphic\\(row\\.product\\)/.test(body)) throw new Error('fitODToImage still subtracts a frame and mats a flat graphic does not have');
      // The wrapped canvas had the identical latent bug; it rides the same guard.
      if (body.indexOf("Frameless Canvas (Wrapped)") < 0) throw new Error('the wrapped-canvas case was left behind');
    });

    // ── Spec rows ───────────────────────────────────────────────────────────
    // 16.43: the sheet was narrowed on request to exactly what the catalog carries —
    // Application, Art Type, Overall Dimensions. Application now IS the substrate
    // ("Application: Vinyl Wallcovering"), so the separate Material row is gone, and
    // Mount and Art Dimensions were dropped from the PAGE. Both numbers stay in the CSV
    // (its Art Size and Image Size columns): the 2" bleed is production data, and printing
    // 169.375" on a client sheet invites ordering that much wall.
    __check('the spec block is Application + Art Type + Overall Dimensions, and nothing else', () => {
      dashUnit = 'in'; editorialContent.specDualUnit = '';
      const s = buildSpecStrings(egd({
        material: 'Vinyl Wallcovering', artType: 'Environmental Graphic Design', mount: 'Paste the wall'
      }));
      const labels = s.lines.map(l => l.label);
      if (s.application !== 'Vinyl Wallcovering') throw new Error('Application should carry the substrate, reads ' + s.application);
      if (labels.join('|') !== 'Application|Art Type|Overall Dimensions') {
        throw new Error('sheet reads: ' + labels.join(' | '));
      }
      // Every framed row, plus the three deliberately dropped ones.
      ['Frame Code', 'Frame Size', 'Mat 1', 'Mat 2', 'Matboard', 'Glass', 'Hardware',
       'Backing Board', 'Stretcher Bar', 'Float Reveal', 'Material', 'Mount', 'Art Dimensions'].forEach(l => {
        if (labels.indexOf(l) >= 0) throw new Error('a flat graphic emitted ' + l);
      });
    });

    __check('Art Type is omitted entirely when blank, which is what a WF sheet does', () => {
      // The WF pages in the catalog carry Application + Overall Dimensions only.
      const s = buildSpecStrings(base({ product: WF, extW: 112, extH: 108, artType: '' }));
      const labels = s.lines.map(l => l.label);
      if (labels.indexOf('Art Type') >= 0) throw new Error('a blank Art Type printed an empty row');
      if (labels.join('|') !== 'Application|Overall Dimensions') throw new Error('WF sheet reads: ' + labels.join(' | '));
    });

    __check('Art Dimensions is off the flat sheet but still computed for the CSV', () => {
      const r = egd({ bleed: 2 });
      const s = buildSpecStrings(r);
      if (s.lines.some(l => l.label === 'Art Dimensions')) throw new Error('Art Dimensions printed on the sheet');
      // The number itself must still exist, with the 2" bleed on every edge.
      const sz = _rowOpeningAndPrint(r);
      if (sz.printW !== 196 || sz.printH !== 124) throw new Error('print size with 2" bleed should be 196x124, got ' + sz.printW + 'x' + sz.printH);
    });

    __check('Overall Dimensions prints the typed size, in the catalog dual-unit format', () => {
      dashUnit = 'in'; editorialContent.specDualUnit = 'mm';
      const s = buildSpecStrings(egd());
      const od = s.lines.find(l => l.label === 'Overall Dimensions').value;
      // The Ford catalog writes 192"(4876.8mm) W x 120"(3048mm) H.
      if (od.indexOf('192"(4876.8mm)W') < 0 || od.indexOf('120"(3048mm)H') < 0) throw new Error('dual-unit overall reads: ' + od);
      editorialContent.specDualUnit = '';
    });

    __check('Application falls back to the product default rather than printing blank', () => {
      // A fresh row typed straight into the table has no substrate yet.
      const s = buildSpecStrings(base({ product: WF, extW: 42, extH: 60, material: '' }));
      if (s.application !== 'Vinyl on Glass') throw new Error('WF default reads ' + JSON.stringify(s.application));
      const s2 = buildSpecStrings(egd({ material: '' }));
      if (s2.application !== 'Vinyl Wallcovering') throw new Error('EGD default reads ' + JSON.stringify(s2.application));
      // And a typed value always wins over the default.
      const s3 = buildSpecStrings(egd({ material: 'Dreamscape Wallcovering - Criss Cross' }));
      if (s3.application !== 'Dreamscape Wallcovering - Criss Cross') throw new Error('a typed substrate was overridden');
    });

    __check('the Art Type label is registered everywhere a label has to be registered', () => {
      // SPEC_ROW_GROUPS drives the shared-spec block's row order. An unregistered
      // label lands in the unknown group and prints just above the sizes.
      const gi = SPEC_ROW_GROUPS.findIndex(g => g.indexOf('Art Type') >= 0);
      if (gi < 0) throw new Error('Art Type is not in SPEC_ROW_GROUPS');
      if (gi === _SPEC_ROW_UNKNOWN_GROUP) throw new Error('Art Type fell into the unknown-label group');
      // It rides with Application — on a flat sheet the two are the identity block.
      if (SPEC_ROW_GROUPS[gi].indexOf('Application') < 0) throw new Error('Art Type should group with Application');
      // Group A/B/C pages and their DOM previews filter by a hardcoded allowlist.
      // Two PDF renderers + three DOM mocks = five; miss one and that layout
      // silently drops the row.
      const n = (S.match(/'Matboard', 'Art Type', 'Art Dimensions'/g) || []).length;
      if (n !== 5) throw new Error('expected 5 allowlists carrying Art Type, found ' + n);
      if (/'Matboard', 'Art Dimensions'/.test(S)) throw new Error('an allowlist still omits Art Type');
      // The retired Material row must be gone from the registries too.
      if (SPEC_ROW_GROUPS.some(g => g.indexOf('Material') >= 0)) throw new Error('the retired Material label is still registered');
    });

    // ── The 2" bleed ────────────────────────────────────────────────────────
    __check('EXACT ASK: both flat products carry a 2 inch bleed, seeded on product change', () => {
      if (FLAT_GRAPHIC_BLEED_IN !== 2) throw new Error('FLAT_GRAPHIC_BLEED_IN is ' + FLAT_GRAPHIC_BLEED_IN);
      dashUnit = 'in';
      const saved = dashProjectData, savedIdx = dashSelectedRowIndex;
      [EGD, WF].forEach(p => {
        // A row arriving from Framed Art still carries the 0.25 framed default.
        dashProjectData = [base({ id: 'X1', bleed: 0.25 })];
        dashSelectedRowIndex = 0;
        document.getElementById('m_product').value = p;
        handleDashProductChange(false);
        if (dashProjectData[0].bleed !== 2) throw new Error(p + ' did not get the 2" bleed, has ' + dashProjectData[0].bleed);
      });
      // A value the user actually chose is never overwritten.
      dashProjectData = [base({ id: 'X2', bleed: 3 })];
      dashSelectedRowIndex = 0;
      document.getElementById('m_product').value = EGD;
      handleDashProductChange(false);
      if (dashProjectData[0].bleed !== 3) throw new Error('a deliberate 3" bleed was overwritten with ' + dashProjectData[0].bleed);
      dashProjectData = saved; dashSelectedRowIndex = savedIdx;
    });

    __check('the substrate and art type are seeded from the product, not left blank', () => {
      const saved = dashProjectData, savedIdx = dashSelectedRowIndex;
      dashProjectData = [base({ id: 'X3', material: '', artType: '' })];
      dashSelectedRowIndex = 0;
      document.getElementById('m_product').value = EGD;
      handleDashProductChange(false);
      if (dashProjectData[0].material !== 'Vinyl Wallcovering') throw new Error('substrate seeded as ' + JSON.stringify(dashProjectData[0].material));
      if (dashProjectData[0].artType !== 'Environmental Graphic Design') throw new Error('art type seeded as ' + JSON.stringify(dashProjectData[0].artType));
      // Window film has no Art Type on its sheet, so it seeds blank on purpose.
      dashProjectData = [base({ id: 'X4', material: '', artType: '' })];
      document.getElementById('m_product').value = WF;
      handleDashProductChange(false);
      if (dashProjectData[0].artType !== '') throw new Error('WF should seed a blank art type, got ' + JSON.stringify(dashProjectData[0].artType));
      if (dashProjectData[0].material !== 'Vinyl on Glass') throw new Error('WF substrate seeded as ' + JSON.stringify(dashProjectData[0].material));
      dashProjectData = saved; dashSelectedRowIndex = savedIdx;
    });

    // ── Fit to wall ─────────────────────────────────────────────────────────
    __check('EXACT ASK: a flat graphic fills the wall inside the dim lines, above the baseboard', () => {
      elevUnit = 'in'; dashUnit = 'in';
      const savedRows = dashProjectData;
      dashProjectData = [egd({ id: 'EGD-1', extW: 10, extH: 10 })];
      const elev = { name: 'W1', wallW: 240, wallH: 108, frames: [], personPos: { x: -60 } };
      const fr = { id: 'EGD-1', letter: 'A', product: EGD, w: 10, h: 10, x: 33, y: 7, active: true, dimTo: [] };
      elev.frames.push(fr);
      elevBaseboardIn = 4;
      if (!fitFlatGraphicToWall(elev, fr)) throw new Error('fit returned false');
      // Full wall width at x=0; baseboard to ceiling.
      if (fr.w !== 240) throw new Error('width should be the wall width, got ' + fr.w);
      if (fr.h !== 104) throw new Error('height should be wallH - baseboard = 104, got ' + fr.h);
      if (fr.x !== 0) throw new Error('x should be 0, got ' + fr.x);
      if (fr.y !== 4) throw new Error('y should sit on top of the baseboard, got ' + fr.y);
      // It must NOT extend past the wall.
      if (fr.x + fr.w > 240) throw new Error('the graphic runs past the wall');
      if (fr.y + fr.h > 108) throw new Error('the graphic runs past the ceiling');
      // The dashboard row must move with it, or the spec page and the CSV disagree
      // with the wall and pushUpdatesToElevations shoves the stale size back.
      if (dashProjectData[0].extW !== 240 || dashProjectData[0].extH !== 104) {
        throw new Error('the row did not follow: ' + dashProjectData[0].extW + 'x' + dashProjectData[0].extH);
      }
      dashProjectData = savedRows;
    });

    __check('EXACT ASK: baseboard 0 makes it fill floor to ceiling', () => {
      elevUnit = 'in';
      const elev = { name: 'W1', wallW: 240, wallH: 108, frames: [], personPos: { x: -60 } };
      const fr = { id: 'ZZ', letter: 'A', product: EGD, w: 1, h: 1, x: 5, y: 5, active: true, dimTo: [] };
      elevBaseboardIn = 0;
      fitFlatGraphicToWall(elev, fr);
      if (fr.h !== 108 || fr.y !== 0) throw new Error('with no baseboard it should be 108 tall at y=0, got ' + fr.h + ' @ ' + fr.y);
      elevBaseboardIn = 4;
    });

    __check('fit refuses anything that is not a flat graphic, and survives a junk wall', () => {
      const elev = { name: 'W1', wallW: 240, wallH: 108, frames: [], personPos: { x: -60 } };
      const framed = { id: 'A1', product: 'Framed Art', w: 24, h: 24, x: 10, y: 40, active: true, dimTo: [] };
      if (fitFlatGraphicToWall(elev, framed)) throw new Error('it resized a framed piece');
      if (framed.w !== 24 || framed.x !== 10) throw new Error('a framed piece was modified anyway');
      const fr = { id: 'ZZ', product: EGD, w: 1, h: 1, x: 0, y: 0, active: true, dimTo: [] };
      if (fitFlatGraphicToWall({ wallW: 0, wallH: 0, frames: [] }, fr)) throw new Error('it accepted a zero-size wall');
      if (fitFlatGraphicToWall(null, fr)) throw new Error('it accepted a null elevation');
      // A baseboard taller than the wall is nonsense; treat it as none rather than
      // producing a negative height.
      elevBaseboardIn = 200;
      fitFlatGraphicToWall({ wallW: 240, wallH: 108, frames: [] }, fr);
      if (fr.h !== 108 || fr.y !== 0) throw new Error('an over-tall baseboard should be ignored, got ' + fr.h + ' @ ' + fr.y);
      elevBaseboardIn = 4;
    });

    __check('placement auto-fits, so dropping a wallcovering on a wall just works', () => {
      const i = S.indexOf('function importSelectedFramesBulk');
      const b1 = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (b1.indexOf('fitFlatGraphicToWall(') < 0) throw new Error('Add & Arrange does not auto-fit');
      const j = S.indexOf('function pushFrameToElevation');
      const b2 = S.slice(j, S.indexOf('\\nfunction ', j + 10));
      if (b2.indexOf('fitFlatGraphicToWall(') < 0) throw new Error('Push to Wall does not auto-fit');
      // And there is a button to re-run it when the wall or baseboard changes.
      if (typeof fitFlatGraphicsToWallAction !== 'function') throw new Error('no Fit to wall action');
      const html = window.__indexHtml;
      if (html.indexOf('fitFlatGraphicsToWallAction()') < 0) throw new Error('the Fit to wall button is not wired in index.html');
    });

    // ── The un-designed placeholder ─────────────────────────────────────────
    __check('EXACT ASK: an EGD with no artwork gets a real placeholder, not a faint tint', () => {
      const r = _renderFlat({});   // no artworkImg, no wireframe
      const filled = r.log.filter(o => o.op === 'fillRect' && o.fill === FLAT_PH_FILL);
      if (!filled.length) throw new Error('no placeholder panel drawn');
      // It says what it is and how big it is, so a wireframe deck is readable.
      const texts = r.log.filter(o => o.op === 'fillText').map(o => o.t);
      if (!texts.some(t => /ARTWORK TBD/.test(t))) throw new Error('the panel does not say the artwork is outstanding');
      if (!texts.some(t => /192.*×.*120/.test(t))) throw new Error('the panel does not state the size, got ' + JSON.stringify(texts));
      // The old 5% tint is gone.
      if (r.log.some(o => o.op === 'fillRect' && /0\\.05/.test(String(o.fill)))) throw new Error('the faint tint is back');
    });

    __check('the placeholder reaches the SVG (and therefore the PDF), not just the DOM', () => {
      const i = S.indexOf('function _maybeAddArtworkToSvg');
      const body = S.slice(i, S.indexOf('\\nasync function ', i + 10));
      if (body.indexOf('FLAT_PH_FILL') < 0) throw new Error('the SVG path never draws the placeholder');
      if (body.indexOf('ARTWORK TBD') < 0) throw new Error('the SVG placeholder has no label');
      // _elevAnnOps only understands line/rect/circle/text, so the panel has to be
      // built from those or it vanishes from every PDF with no error.
      const seg = body.slice(body.indexOf('FLAT_PH_FILL'));
      if (/<(path|image|use|polygon)\\b/.test(seg.slice(0, 1400))) throw new Error('the placeholder uses a tag _elevAnnOps cannot parse');
    });

    __check('and all three renderers share ONE placeholder definition', () => {
      ['FLAT_PH_FILL', 'FLAT_PH_EDGE', 'FLAT_PH_INK'].forEach(k => {
        if (S.indexOf('const ' + k) < 0) throw new Error(k + ' is not defined');
      });
      // canvas + elevation DOM + SVG all read the constant rather than a literal.
      const n = (S.match(/FLAT_PH_FILL/g) || []).length;
      if (n < 4) throw new Error('only ' + n + ' references — a renderer hardcoded its own colour');
      if (/#ededed/.test(S.replace(/const FLAT_PH_FILL = '#ededed';/, ''))) throw new Error('a renderer hardcoded the placeholder colour');
    });

    __check('a framed piece is completely unaffected by any of this', () => {
      const s = buildSpecStrings(base({}));
      const labels = s.lines.map(l => l.label);
      ['Application', 'Frame Code', 'Frame Size', 'Mat 1', 'Mount', 'Hardware', 'Glass', 'Backing Board', 'Art Dimensions', 'Overall Dimensions'].forEach(l => {
        if (labels.indexOf(l) < 0) throw new Error('framed art lost its ' + l + ' row');
      });
      if (labels.indexOf('Material') >= 0) throw new Error('Material leaked onto a framed piece');
    });

    // ── Rendering ───────────────────────────────────────────────────────────

    __check('EXACT BUG RISK: a flat graphic draws its artwork instead of punching a hole', () => {
      // The isFrameless branch this is modelled on ignores opts.artworkImg entirely
      // and clearRects the face. Copied as-is, a wallcovering is an invisible gap.
      const img = { naturalWidth: 400, naturalHeight: 250 };
      const r = _renderFlat({ artworkImg: img });
      if (!r.log.some(o => o.op === 'drawImage')) throw new Error('THE BUG: the artwork was never drawn');
      if (r.log.some(o => o.op === 'clearRect')) throw new Error('THE BUG: it punched a transparent hole like the frameless branch');
    });

    __check('and it honours the wireframe look, letter and all', () => {
      const r = _renderFlat({ wireframe: true, wireframeLetter: 'A' });
      const grey = r.log.filter(o => o.op === 'fillRect' && o.fill === ELEV_WF_FILL);
      if (!grey.length) throw new Error('THE BUG: no wireframe grey block — the isFrameless branch ignores opts.wireframe');
      const letter = r.log.find(o => o.op === 'fillText' && o.t === 'A');
      if (!letter) throw new Error('the wireframe letter was not drawn');
      // Canvas shorthand order is style, weight, size, family. Wrong order and the
      // whole declaration is dropped for a 10px sans default.
      if (!/\\d+px/.test(letter.font || '')) throw new Error('the letter font declaration is malformed: ' + letter.font);
      // Wireframe must win over artwork, same as every other product.
      const r2 = _renderFlat({ wireframe: true, artworkImg: { naturalWidth: 10, naturalHeight: 10 } });
      if (r2.log.some(o => o.op === 'drawImage')) throw new Error('artwork drew through the wireframe');
    });

    __check('it has NO drop shadow — it is stuck to the wall, not hanging off it', () => {
      dashOuterShadowsOn = true;
      const r = _renderFlat({ artworkImg: { naturalWidth: 400, naturalHeight: 250 } });
      // The frameless branch paints a black rect behind a shadow to fake depth.
      const shadowRect = r.log.some(o => o.op === 'fillRect' && (o.fill === '#000' || o.fill === '#000000'));
      if (shadowRect) throw new Error('THE BUG: a flat graphic grew the wrapped canvas drop-shadow halo');
      // But it does get a trim line, or its extent is invisible against the wall.
      if (!r.log.some(o => o.op === 'strokeRect')) throw new Error('no trim line — the edge is unreadable on the wall');
    });

    __check('the flat branch runs BEFORE the frameless one, and both survive', () => {
      const i = S.indexOf('function renderFrameToCanvas');
      const body = S.slice(i, i + 6000);
      const flatAt = body.indexOf('if (isFlat) {');
      const flAt = body.indexOf('if (isFrameless) {');
      if (flatAt < 0) throw new Error('no flat-graphic branch in renderFrameToCanvas');
      if (flAt < 0) throw new Error('the frameless branch disappeared');
      if (flatAt > flAt) throw new Error('the flat branch must come first, or geometry below it runs on a flat graphic');
    });

    __check('all four render paths know about flat graphics, not just three', () => {
      // The recurring failure here is right-on-screen, wrong-in-the-PDF. Each of
      // these is a separate renderer and a flat graphic has to reach every one.
      const paths = [
        ['renderFrameToCanvas', 'function renderFrameToCanvas'],
        ['updateDashVisualsFromDOM (dashboard DOM)', 'function updateDashVisualsFromDOM'],
        ['drawElevAll (elevation DOM)', 'function drawElevAll'],
        ['buildFrameSVG (vector SVG/PDF)', 'function buildFrameSVG']
      ];
      paths.forEach(([label, sig]) => {
        const i = S.indexOf(sig);
        if (i < 0) throw new Error('cannot find ' + label);
        const body = S.slice(i, i + 14000);
        if (!/_isFlatGraphic\\(|isFlat/.test(body)) throw new Error(label + ' was never taught about flat graphics');
      });
    });

    __check('the elevation DOM gives it the full face and no recessed-opening cues', () => {
      const i = S.indexOf('function drawElevAll');
      const body = S.slice(i, i + 30000);
      if (!/if \\(isFlat\\) \\{\\s*\\/\\/ Flat graphic: the graphic spans the entire face/.test(body)) throw new Error('the art rect is not the full face');
      // Mats, faux mat and the frame inset must all be suppressed, or a leftover
      // mat value from the row pushes the graphic inward on the wall only.
      ['const m1Active = !isFloater && !isFrameless && !isFlat',
       'const useFauxMat = !isFloater && !isFrameless && !isFlat',
       "let offsetW = (f.fType === 'color' || isFrameless || isFlat)"].forEach(frag => {
        if (body.indexOf(frag) < 0) throw new Error('missing guard: ' + frag);
      });
    });

    // ── Placement on a wall (the drag-and-drop half of the ask) ─────────────
    __check('EXACT ASK: a flat graphic is placed and dragged exactly like a frame mockup', () => {
      // Nothing product-specific was needed here and that is the point: a placed
      // item is an entry in elev.frames with w/h/x/y, and makeElevDraggable is
      // product-agnostic. These pin that the plumbing carries the new fields.
      const i = S.indexOf('function makeElevDraggable');
      const body = S.slice(i, i + 3000);
      if (/product|isFlat/.test(body)) throw new Error('the drag handler grew a product branch — it should not need one');
      // Both frame constructors (Add & Arrange, and Push to Wall) are copy-pasted
      // duplicates; material has to reach both or the two paths disagree.
      const ctors = (S.match(/product: f\\.product \\|\\| '', material: f\\.material \\|\\| ''/g) || []).length;
      if (ctors !== 2) throw new Error('expected material in both frame constructors, found ' + ctors);
      // And the dashboard->elevation resync.
      if (S.indexOf("f.material = d.material || '';") < 0) throw new Error('pushUpdatesToElevations does not resync material');
    });

    // ── Ancillary sites ─────────────────────────────────────────────────────
    __check('a flat graphic never lands in the frame schedule', () => {
      // Note the parens in the signature: _collectProjectFramesCached is a PREFIX of
      // this name and sits above it, so an indexOf without them finds the wrong one.
      const i = S.indexOf('async function _collectProjectFrames()');
      if (i < 0) throw new Error('_collectProjectFrames not found');
      const body = S.slice(i, S.indexOf('\\nasync function ', i + 10));
      if (!/_isFlatGraphic\\(r\\.product\\)\\) continue/.test(body)) throw new Error('a leftover fCode would invent a frame nobody is ordering');
    });

    __check('PNG filenames get their own product codes', () => {
      const fn = buildPngFilename(egd({ id: 'EGD-6' }));
      if (fn.indexOf('EGD') < 0) throw new Error('EGD row exported as: ' + fn);
      const fn2 = buildPngFilename(base({ product: WF, id: 'WF-1', extW: 42, extH: 60 }));
      if (fn2.indexOf('WF') < 0) throw new Error('WF row exported as: ' + fn2);
      // Neither carries a frame code, because neither has a frame.
      if (fn.indexOf('Standard-Black') >= 0) throw new Error('a flat graphic exported with a frame code: ' + fn);
    });

    __check('Material survives a CSV round trip', () => {
      dashUnit = 'in';
      const saved = dashProjectData;
      dashProjectData = [egd({ id: 'EGD-6', material: 'Dreamscape Wallcovering - Criss Cross' })];
      const csv = buildDashCSVString();
      // The column header is NOT line 0 — the CSV opens with a project-metadata
      // preamble (RFI / PROJECT NAME / DATE ...) and the columns start after a blank.
      const lines = csv.split('\\n');
      const head = lines.find(l => l.indexOf('PRODUCT') >= 0 && l.indexOf('LOCATION') >= 0);
      if (!head) throw new Error('could not find the column header row');
      if (head.indexOf('Material') < 0) throw new Error('no Material column in the CSV header');
      // Trailing column, so the InDesign script (which reads by name) is unaffected
      // — inserting one mid-header shifts every position after it. This used to
      // assert Material was LITERALLY last, which 16.52 broke by appending Print
      // Output / Print Panels after it. The requirement was never "last", it was
      // "after every pre-existing column", so it's now pinned as: Material comes
      // after the RAW block, and nothing was inserted ahead of that block.
      const rawEnd = head.indexOf('RAW Stretcher Depth');
      if (rawEnd < 0) throw new Error('the RAW column block is missing');
      if (head.indexOf('Material') < rawEnd) throw new Error('Material was moved ahead of the RAW block: ' + head.slice(-80));
      const row = lines.find(l => l.indexOf('EGD-6') >= 0);
      if (!row) throw new Error('the EGD row never reached the CSV');
      if (row.indexOf('Dreamscape Wallcovering - Criss Cross') < 0) throw new Error('the material value never reached the row');
      // The material lands in the trailing block, followed now by the two 16.52
      // print-output columns. Matched as a substring rather than by counting commas:
      // row cells are quoted and several values legitimately contain commas
      // ('3" AA, B 97 White'), so a naive split over-counts and proves nothing.
      if (row.indexOf('"Dreamscape Wallcovering - Criss Cross","full"') < 0) {
        throw new Error('Material is not followed by the print-output columns: ' + row.slice(-90));
      }
      // A framed row leaves it blank rather than shifting the column.
      dashProjectData = [base({ id: 'ART.900' })];
      const row2 = buildDashCSVString().split('\\n').find(l => l.indexOf('ART.900') >= 0);
      if (!/,""\\s*$/.test(row2)) throw new Error('a framed row did not leave Material empty: ' + row2.slice(-60));
      // A flat graphic's Art Size must equal its Overall size in the CSV too.
      if (row.indexOf('"192","120","192","120","192.5","120.5"') < 0) throw new Error('CSV sizes disagree with the spec block: ' + row.slice(0, 160));
      dashProjectData = saved;
    });

    // ── The one wallcovering layout ─────────────────────────────────────────
    __check('EXACT ASK: a flat-graphic row resolves to its own layout, with nothing to pick', () => {
      // "There really is only one option for the spec." So it is resolved, not chosen:
      // a wallcovering on a framed-art template would draw a frame mockup of a 240"
      // wall and a spec block full of mats it does not have.
      const saved = dashProjectData;
      dashProjectData = [egd({ id: 'EGD-6' }), base({ id: 'ART.001' })];
      editorialContent.specTemplate = 'frameRight';
      editorialContent.specTemplateOverrides = {};
      if (_specTplResolve('EGD-6') !== 'egdDetail') throw new Error('a flat graphic resolved to ' + _specTplResolve('EGD-6'));
      if (_specTplResolve('ART.001') !== 'frameRight') throw new Error('a framed piece was hijacked: ' + _specTplResolve('ART.001'));
      // Even an explicit per-page override cannot put it on a framed layout.
      editorialContent.specTemplateOverrides = { 'EGD-6': 'frameSpecDetail' };
      if (_specTplResolve('EGD-6') !== 'egdDetail') throw new Error('an override overrode the only valid layout');
      editorialContent.specTemplateOverrides = {};
      // 16.49: this used to assert the GROUP template won, on the reasoning that it
      // changes the page count. That reasoning was about count and ignored the
      // consequence — in Group A/B/C mode a wallcovering went through
      // _drawSpecSetPageBody and drew as a set member: a letter, a frame mockup of a
      // 240" wall, and unstyled spec text with no leaders. A correct page count with a
      // broken page on it is not the better trade, so the layout wins and
      // _splitFlatUnits keeps the count right instead.
      editorialContent.specTemplate = 'setRight';
      if (_specTplResolve('EGD-6') !== 'egdDetail') throw new Error('THE BUG: a group template hijacked a wallcovering, got ' + _specTplResolve('EGD-6'));
      // Framed pieces are untouched — they still get the group layout.
      if (_specTplResolve('ART.001') !== 'setRight') throw new Error('the group template stopped applying to framed art');
      editorialContent.specTemplate = 'frameRight';
      dashProjectData = saved;
    });

    __check('EXACT BUG: in Group A/B/C a wallcovering is split onto its own sheet', () => {
      // The grouping happens by art-group before anything knows about products, so a
      // wallcovering could be swept into a set with framed pieces.
      const i = S.indexOf('const _splitFlatUnits = (u) =>');
      if (i < 0) throw new Error('nothing splits flat graphics out of group units');
      const body = S.slice(i, i + 1600);
      if (body.indexOf("_specTpl: 'egdDetail'") < 0) throw new Error('the split sheets do not use the flat layout');
      // Framed leftovers must keep their group page, or a mixed set loses pieces.
      if (body.indexOf('if (rest.length) out.push(specUnit(') < 0) throw new Error('framed members left in the group are dropped');
      // And it must return null when there is nothing flat, so the common path is
      // untouched rather than rebuilt through a second code path. 16.53 moved the
      // filtering itself into the shared _partitionFlatMembers (the PDF export needed
      // the same decision), so the short-circuit is now pinned on BEHAVIOUR rather
      // than on the shape of a line that no longer lives here.
      if (body.indexOf('if (!part) return null;') < 0) throw new Error('it does not short-circuit for an all-framed group');
      if (_partitionFlatMembers([{ id: 'A', product: 'Framed Art' }])) throw new Error('an all-framed group must not split');
      if (!_partitionFlatMembers([{ id: 'E', product: 'Wallcovering (EGD)' }])) throw new Error('a flat member must split');
      // Wired into BOTH page paths — with breakers and without.
      const bp = S.indexOf('const _breakerPages = (u) =>');
      if (S.slice(bp, bp + 2600).indexOf('_splitFlatUnits(u)') < 0) throw new Error('the breaker path does not split');
      const sp = S.indexOf('const specPagesFor = (u) =>');
      if (S.slice(sp, sp + 900).indexOf('_splitFlatUnits(u)') < 0) throw new Error('the non-breaker path does not split');
    });

    __check('and the split produces one flat sheet per graphic, end to end', () => {
      dashUnit = 'in';
      const saved = dashProjectData, savedEl = elevations;
      // One group: two framed pieces and a wallcovering, the mixed case.
      dashProjectData = [
        base({ id: 'ART.500-A' }), base({ id: 'ART.500-B' }),
        egd({ id: 'ART.500-C' })
      ];
      elevations = [{ name: 'W', wallW: 240, wallH: 108, frames: [], personPos: { x: -60 } }];
      editorialContent.specTemplate = 'setRight';
      editorialContent.elevBreakers = false;
      editorialContent.manualGroups = [];
      const pages = _deckPageList().filter(p => p && p.kind === 'spec' && !p._install);
      const flat = pages.filter(p => p._specTpl === 'egdDetail');
      if (flat.length !== 1) throw new Error('expected exactly one flat sheet, got ' + flat.length);
      if (flat[0].row.id !== 'ART.500-C') throw new Error('the flat sheet is for the wrong piece: ' + flat[0].row.id);
      if (flat[0].members.length !== 1) throw new Error('the flat sheet carries other members');
      // The framed pair still gets a group page, and the wallcovering is not on it.
      const grp = pages.filter(p => p._specTpl === 'setRight');
      if (!grp.length) throw new Error('the framed members lost their group page');
      grp.forEach(p => {
        if ((p.members || []).some(m => _isFlatGraphic(m.product))) throw new Error('a wallcovering is still a member of the group page');
      });
      editorialContent.specTemplate = 'frameRight';
      dashProjectData = saved; elevations = savedEl;
    });

    __check('and it is not offered in the picker, since it cannot be chosen or unchosen', () => {
      const T = SPEC_TEMPLATES.egdDetail;
      if (!T) throw new Error('egdDetail is not registered');
      if (!T.flat) throw new Error('egdDetail is not marked flat, so _specTplResolve cannot find it');
      if (!T.help || T.help.length < 40) throw new Error('no help text');
      const i = S.indexOf("k !== 'installGuide' && !SPEC_TEMPLATES[k].flat");
      if (i < 0) throw new Error('the per-piece picker grid still offers the flat layout');
    });

    __check('both render paths draw the flat sheet, and neither falls through to a framed one', () => {
      if (typeof _drawFlatGraphicSpecPage !== 'function') throw new Error('the flat sheet renderer is missing');
      // Deck Studio preview / rail thumbnails.
      const i = S.indexOf('async function renderSpecPageCanvas');
      const b1 = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (b1.indexOf('_drawFlatGraphicSpecPage(') < 0) throw new Error('the canvas preview does not draw the flat sheet');
      // The PDF export. egdDetail carries custom:true (no coordinate map), so its
      // branch MUST come before the generic template branch or it renders as a
      // frameRight fallback complete with a frame mockup.
      const j = S.indexOf('SPEC_TEMPLATES[_specTpl].flat');
      const k = S.indexOf("_specTpl !== 'classic' && SPEC_TEMPLATES[_specTpl] && !SPEC_TEMPLATES[_specTpl].legacy");
      if (j < 0) throw new Error('the PDF export has no flat-sheet branch');
      if (k >= 0 && j > k) throw new Error('the flat branch sits AFTER the generic one, so it never runs');
    });

    __check('the flat sheet reuses the shared elevation capture rather than its own copy', () => {
      const i = S.indexOf('async function _drawFlatGraphicSpecPage');
      const body = S.slice(i, S.indexOf('\\nasync function ', i + 10));
      if (body.indexOf('_igElevCapture(') < 0) throw new Error('it does not use the shared capture helper');
      if (body.indexOf('_captureElevWithGuides(') >= 0) throw new Error('it captures directly, bypassing the cache, the retry and both suppressors');
      // A failed capture must flag the render incomplete, or a blank sheet gets cached
      // and shipped — the exact bug that put a drawing-less breaker in a client PDF.
      if (body.indexOf('_igCaptureDeferred = true') < 0) throw new Error('a failed capture is not flagged incomplete');
      // No artwork slot: the graphic lives inside the elevation.
      if (/renderFrameToCanvas/.test(body)) throw new Error('the flat sheet draws a frame mockup — the graphic belongs in the elevation');
    });

    __check('EXACT BUG: the sheet replays the vector dims, not just the raster', () => {
      // Reported: "I want the wall dims and character dim to be on the spec page, and
      // currently it is not, and the baseboard is missing."
      //
      // _captureElevWithGuides SPLITS its output: 'dataUrl' is picSvg (frames,
      // artwork, the scale figure) and 'vec' is annSvg — the wall dims, the character
      // dim, the AFF callout and the baseboard line — parsed into ops for real vector
      // PDF text. Draw only the image and you get a measured wall with no
      // measurements on it, which is exactly what shipped first.
      const i = S.indexOf('async function _drawFlatGraphicSpecPage');
      const body = S.slice(i, S.indexOf('\\nasync function ', i + 10));
      if (body.indexOf('_drawElevAnnOps(') < 0) throw new Error('THE BUG: the sheet never replays cap.vec, so it has no dimensions and no baseboard');
      // The ops must be placed on the SAME rect as the image or the dims float away
      // from the drawing they measure.
      const img = body.indexOf("doc.addImage(res.cap.dataUrl, 'JPEG', dx, dy, dw, dh)");
      const ann = body.indexOf('_drawElevAnnOps(doc, res.cap.vec, dx, dy, dw, dh)');
      if (img < 0) throw new Error('the capture image placement changed shape');
      if (ann < 0) throw new Error('the annotations are not placed on the image rect');
      if (ann < img) throw new Error('the annotations are drawn under the raster, so the picture covers them');
      // Same contract the install-guide page has had all along.
      const j = S.indexOf('async function _drawInstallGuidePage');
      if (S.slice(j, j + 40000).indexOf('_drawElevAnnOps(doc, cap.vec') < 0) throw new Error('the install-guide reference call is gone');
    });

    __check('EXACT ASK: breakers can be skipped for flat graphics while framed art keeps them', () => {
      // Both go in the same presentation, so it is a product distinction, not a
      // deck-wide switch.
      if (typeof _breakerSkipFlat !== 'function') throw new Error('no _breakerSkipFlat');
      // Absent reads as ON: a project saved before this existed gets the useful
      // default rather than a duplicated drawing.
      delete editorialContent.breakerSkipFlat;
      if (!_breakerSkipFlat()) throw new Error('the default should be to skip flat breakers');
      editorialContent.breakerSkipFlat = false;
      if (_breakerSkipFlat()) throw new Error('it cannot be turned off');
      editorialContent.breakerSkipFlat = true;
      // The page builder must consult it, and only for walls that are ENTIRELY flat.
      const i = S.indexOf('const _breakerPages = (u) =>');
      const body = S.slice(i, i + 2200);
      // 16.53 moved this clause into the shared _breakerSkipUnit, because the PDF
      // export's hand-mirrored page-list builder never had it and printed a breaker
      // the studio didn't show. So the "every member" rule is now pinned as
      // behaviour, where it holds for both builders, rather than as a source string
      // in one of them.
      if (body.indexOf('_breakerSkipUnit(') < 0) throw new Error('the breaker builder ignores the setting');
      const _fl = { id: 'E', product: 'Wallcovering (EGD)' }, _fa = { id: 'A', product: 'Framed Art' };
      if (!_breakerSkipUnit([_fl, _fl])) throw new Error('an all-flat wall should skip its breaker');
      if (_breakerSkipUnit([_fl, _fa])) {
        throw new Error('it must be EVERY member, or a wall with one wallcovering among framed pieces loses its breaker');
      }
      // And the spec page after the breaker is still emitted either way.
      if (body.indexOf('members.forEach(m => out.push(') < 0) throw new Error('skipping the breaker dropped the spec pages with it');
    });

    __check('EXACT ASK: the dashboard placeholder says to drag a graphic in, per product', () => {
      const i = S.indexOf('if (!dashHasArt && _flatDash) {');
      if (i < 0) throw new Error('the dashboard still uses the framed-art placeholder — a bare size in an empty opening');
      const body = S.slice(i, i + 1800);
      if (body.indexOf('Drag ') < 0) throw new Error('it does not say to drag anything in');
      if (body.indexOf('window film') < 0 || body.indexOf('wallcovering') < 0) throw new Error('the wording is not per product');
      if (body.indexOf('FLAT_PH_FILL') < 0) throw new Error('it does not share the placeholder fill, so it looks like a different object to the elevation');
      // The elevation and the PDF sheet must NOT say "drag here" — a client reads
      // those. They keep ARTWORK TBD.
      const j = S.indexOf('function _maybeAddArtworkToSvg');
      const svg = S.slice(j, S.indexOf('\\nasync function ', j + 10));
      if (/Drag /.test(svg)) throw new Error('the exported sheet tells the client to drag something');
      if (svg.indexOf('ARTWORK TBD') < 0) throw new Error('the exported sheet lost its ARTWORK TBD label');
    });

    // ── EGD wall mode ───────────────────────────────────────────────────────
    __check('EXACT ASK: on an EGD wall a flat graphic cannot be dragged out of the wall', () => {
      // Reported: "it is dropping in like a frame mock up and it is hard to place it
      // without going outside the wall dims."
      elevUnit = 'in'; elevBaseboardIn = 4;
      const elev = { name: 'W', wallW: 240, wallH: 108, frames: [], personPos: { x: -60 }, egdWall: true };
      const fr = { id: 'E1', product: EGD, w: 240, h: 104, x: 0, y: 4, active: true, dimTo: [] };
      elev.frames.push(fr);
      // Shove it hard past every edge; it must come back inside.
      fr.x = 900; fr.y = 900; _clampFlatToWall(elev, fr);
      if (fr.x !== 0 || fr.y !== 4) throw new Error('overshoot right/top not clamped: ' + fr.x + ',' + fr.y);
      fr.x = -500; fr.y = -500; _clampFlatToWall(elev, fr);
      if (fr.x !== 0) throw new Error('overshoot left not clamped: ' + fr.x);
      // NOT into the baseboard — that is called out specifically.
      if (fr.y !== 4) throw new Error('THE BUG: it dropped into the baseboard area, y=' + fr.y);
      if (fr.y + fr.h > 108) throw new Error('it runs past the ceiling');
      // A graphic larger than the wall is trimmed to it rather than overhanging.
      const big = { id: 'E2', product: EGD, w: 400, h: 300, x: 0, y: 0, active: true, dimTo: [] };
      _clampFlatToWall(elev, big);
      if (big.w !== 240) throw new Error('an oversize graphic was not trimmed to the wall width, w=' + big.w);
      if (big.h !== 104) throw new Error('an oversize graphic was not trimmed above the baseboard, h=' + big.h);
    });

    __check('and it only pins on an EGD wall — distraction bands stay free elsewhere', () => {
      // WF-3 The Hub is TBD x 14"H and WF-4/WF-5 are privacy bands: none of them fill
      // a wall, so pinning every flat graphic everywhere would break them.
      elevUnit = 'in'; elevBaseboardIn = 4;
      const plain = { name: 'W', wallW: 240, wallH: 108, frames: [], personPos: { x: -60 } };
      const band = { id: 'WF3', product: WF, w: 112, h: 14, x: 500, y: 0, active: true, dimTo: [] };
      if (_clampFlatToWall(plain, band)) throw new Error('it clamped on a wall that is not in EGD mode');
      if (band.x !== 500) throw new Error('a band on a normal wall was moved: ' + band.x);
      // And a framed piece is never clamped, even on an EGD wall.
      const egdw = { name: 'W', wallW: 240, wallH: 108, frames: [], personPos: { x: -60 }, egdWall: true };
      const art = { id: 'A1', product: 'Framed Art', w: 24, h: 24, x: 900, y: 900, active: true, dimTo: [] };
      if (_clampFlatToWall(egdw, art)) throw new Error('it clamped a framed piece');
      if (art.x !== 900) throw new Error('a framed piece was moved by the flat clamp');
    });

    __check('the clamp runs on drag AND on redraw, so a wall resize cannot orphan it', () => {
      const i = S.indexOf('function makeElevDraggable');
      const drag = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (drag.indexOf('_clampFlatToWall(') < 0) throw new Error('dragging is not clamped');
      // AFTER the snap, or a wall-edge snap target can pull it back out.
      const snapAt = drag.indexOf('computeSnapForDrag(');
      const clampAt = drag.indexOf('_clampFlatToWall(');
      if (snapAt >= 0 && clampAt < snapAt) throw new Error('the clamp runs before the snap, so a snap can push it outside');
      const j = S.indexOf('function drawElevAll');
      const draw = S.slice(j, j + 12000);
      if (draw.indexOf('_clampFlatToWall(') < 0) throw new Error('a redraw does not re-clamp, so a wall or baseboard change leaves the graphic outside its wall');
    });

    __check('EXACT ASK: a wallcovering always renders BEHIND framed art', () => {
      // "wallcovering would always be in the background." Z-order follows append
      // order, so relying on array order meant a piece added before the wallcovering
      // ended up underneath it.
      const i = S.indexOf('function drawElevAll');
      const body = S.slice(i, i + 12000);
      if (body.indexOf('const _drawOrder = elevFrames.map(') < 0) throw new Error('the frame loop still draws in raw array order');
      if (!/_isFlatGraphic\\(a\\.f && a\\.f\\.product\\) \\? 0 : 1/.test(body)) throw new Error('flat graphics are not sorted to the front');
      // Indices must survive the sort — makeElevDraggable and every dim lookup address
      // frames by their real index in elevFrames.
      if (body.indexOf('_drawOrder.forEach(({ f, idx })') < 0) throw new Error('the sort dropped the original indices, so drag and dims would address the wrong frame');
      // Not gated on the mode: a wallcovering is a background wherever it is.
      const seg = body.slice(body.indexOf('const _drawOrder'), body.indexOf('_drawOrder.forEach'));
      if (/_isEgdWall/.test(seg)) throw new Error('the layering was gated on EGD wall mode — it should always apply');
    });

    __check('an empty EGD wall shows a drop prompt, and it stays out of the export', () => {
      const i = S.indexOf("_ph.className = 'egd-wall-prompt'");
      if (i < 0) throw new Error('no empty-state prompt on an EGD wall');
      const body = S.slice(i - 900, i + 1600);
      if (body.indexOf('WALLCOVERING') < 0) throw new Error('the prompt does not say what the wall is set to');
      if (body.indexOf('FLAT_PH_FILL') < 0) throw new Error('it does not share the placeholder look');
      // Authoring UI must never reach the PDF.
      if (body.indexOf("setAttribute('data-export-skip'") < 0) throw new Error('the prompt would print on the exported sheet');
      // Only when NOTHING flat is placed — once one is, it carries its own drop panel
      // and a second prompt over it would point at the wrong target.
      if (body.indexOf('!elevFrames.some(f => f && f.active !== false && _isFlatGraphic(f.product))') < 0) {
        throw new Error('the prompt is not gated on the wall being empty');
      }
    });

    __check('the toggle is per-elevation, fits what is already there, and the button shows state', () => {
      if (typeof toggleEgdWall !== 'function') throw new Error('no toggleEgdWall');
      if (typeof _isEgdWall !== 'function') throw new Error('no _isEgdWall');
      // Per ELEVATION, not a deck-wide preference — every other button in that row is
      // deck-wide, which is what makes it easy to put in the wrong list.
      const a = { wallW: 240, wallH: 108, frames: [] }, b = { wallW: 240, wallH: 108, frames: [], egdWall: true };
      if (_isEgdWall(a)) throw new Error('a plain wall reported as EGD');
      if (!_isEgdWall(b)) throw new Error('an EGD wall reported as plain');
      if (_isEgdWall(null)) throw new Error('null blew up or reported true');
      // Turning it on must fit what is already on the wall, or the mode says the
      // graphic fills the wall while showing one that doesn't.
      const t = S.indexOf('function toggleEgdWall');
      const body = S.slice(t, S.indexOf('\\nfunction ', t + 10));
      if (body.indexOf('fitFlatGraphicToWall(') < 0) throw new Error('turning the mode on does not fit existing graphics');
      // And the button reflects the CURRENT wall.
      const sy = S.indexOf('function syncLayoutGuideButtonStates');
      const sb = S.slice(sy, S.indexOf('\\nfunction ', sy + 10));
      if (sb.indexOf('egdWallBtn') < 0) throw new Error('the button never syncs, so it shows the wrong state after a wall switch');
      // CHANGED (16.91): one labelled toggle became TWO buttons, so the wall's mode is the
      // highlighted one and the alternative is named beside it — a toggle could only ever
      // show the state it was in, which is why the mode had to be explained to designers.
      // Both go through setElevWallMode; toggleEgdWall is still the one that does the work.
      if (window.__indexHtml.indexOf("setElevWallMode('egd')") < 0) throw new Error('the EGD button is not wired in index.html');
      if (window.__indexHtml.indexOf("setElevWallMode('art')") < 0) throw new Error('the ART button is not wired in index.html');
      if (sb.indexOf('artWallBtn') < 0) throw new Error('the ART button never syncs, so both can look unselected');
    });

    // ── Drag performance ────────────────────────────────────────────────────
    __check('EXACT BUG: dragging does not re-decode the artwork on every mouse move', () => {
      // Reported: "when I have a wallcovering in an elevation it seems really glitchy
      // when I move frames around, very flashy and not smooth."
      //
      // drawElevAll wipes #frame-layer and runs on EVERY mousemove of a drag. A fresh
      // <img src="data:..."> per pass meant the browser re-decoding every artwork ~60
      // times a second. A 24" print hid it; a full-wall wallcovering did not.
      const i = S.indexOf('function drawElevAll');
      const body = S.slice(i, i + 32000);
      if (body.indexOf('_elevArtImgCache[_aKey]') < 0) throw new Error('THE BUG: the artwork <img> is still rebuilt from its data URL on every redraw');
      if (!/let aimg = _elevArtImgCache\\[_aKey\\]/.test(body)) throw new Error('the cached node is not reused');
      // Geometry must still be rewritten each pass — only the decoded pixels are reused,
      // or the artwork would stop following its frame.
      const at = body.indexOf('_elevArtImgCache[_aKey]');
      const after = body.slice(at, at + 1400);
      if (after.indexOf('aimg.style.cssText') < 0) throw new Error('the reused node never gets its new position, so the artwork would lag its frame');
      // src is only assigned when the node is CREATED. Reassigning it every pass would
      // re-trigger the decode and defeat the whole thing.
      const created = body.slice(body.indexOf('if (!aimg) {'), body.indexOf('aimg.style.cssText'));
      if (created.indexOf('aimg.src = f.artworkUrl') < 0) throw new Error('src is not set on creation');
      const reuse = body.slice(body.indexOf('aimg.style.cssText'));
      if (/aimg\\.src\\s*=/.test(reuse.slice(0, 600))) throw new Error('src is reassigned on reuse, which re-decodes the image');
    });

    __check('the node cache is keyed so it cannot show the wrong image, and it is swept', () => {
      const i = S.indexOf('const _aKey =');
      const line = S.slice(i, i + 220);
      // Letter alone shows the PREVIOUS artwork after an image swap; source alone means
      // two frames sharing one image fight over the node (the second append moves it).
      if (line.indexOf('f.letter') < 0) throw new Error('the key has no letter, so two frames sharing an image would steal the node from each other');
      if (line.indexOf('f.artworkUrl.length') < 0 || line.indexOf('f.artworkUrl.slice(-32)') < 0) {
        throw new Error('the key does not identify the source, so a swapped image would keep showing the old one');
      }
      // And the whole data URL must NOT be in the key — that is megabytes of string
      // concatenation per frame per redraw, which is the problem again by another route.
      if (/\\+ f\\.artworkUrl \\+/.test(line)) throw new Error('the key concatenates the entire data URL');
      // Bounded. Detached multi-megabyte bitmaps piling up is the leak the elevation
      // capture cache already had once.
      if (typeof _sweepElevArtImgCache !== 'function') throw new Error('no sweep — the cache would grow without limit');
      const j = S.indexOf('function _sweepElevArtImgCache');
      const sw = S.slice(j, S.indexOf('\\nfunction ', j + 10));
      if (sw.indexOf('_elevArtImgSeen') < 0) throw new Error('the sweep does not use the seen-set, so it cannot tell stale from live');
      if (sw.indexOf('if (!Object.keys(_elevArtImgSeen).length) return;') < 0) {
        throw new Error('a redraw that drew nothing would be read as "everything is stale" and flush the cache');
      }
      if (S.indexOf('_sweepElevArtImgCache();', S.indexOf('function drawElevAll')) < 0) throw new Error('the sweep never runs');
    });

    // ── The sheet's elevation is bottom-right anchored and as large as it fits ──
    __check('EXACT ASK: a flat page does not offer the framed spec templates', () => {
      // _specTplResolve returns egdDetail for a wallcovering or window film ahead of
      // everything, so every card in that grid is a layout the page cannot take —
      // clicking one looks like it did nothing. A one-card grid would be the same
      // non-choice with more furniture, so the section states what the sheet does.
      const i = S.indexOf("_dsSection(t, 'Spec template', 'spectpl', true)");
      if (i < 0) throw new Error('the spec template section is gone');
      // Widened from 1600 in 16.90: the flat branch gained the Print Output control, which
      // pushed the card append outside the window and read as the gate having moved. The
      // window has to cover both landmarks it compares, not a guess at the distance.
      const body = S.slice(i, i + 4000);
      if (body.indexOf('_isFlatGraphic(desc.row.product)') < 0) throw new Error('the picker does not check for a flat row');
      // The bail must come BEFORE the cards are appended, or they show anyway.
      const gate = body.indexOf('if (_flatPage)');
      const cards = body.indexOf('tplBody.appendChild(cardsWrap)');
      if (gate < 0 || cards < 0 || gate > cards) throw new Error('the framed cards are still appended for a flat page');
      // And the grid itself still excludes flat templates for FRAMED pages, so the
      // two halves of this can't both be dropped and leave a mixed picker.
      if (S.indexOf('!SPEC_TEMPLATES[k].flat') < 0) throw new Error('the framed grid no longer excludes flat templates');
    });

    __check('EXACT ASK: the sheet elevation anchors bottom-right and scales up', () => {
      const i = S.indexOf('async function _drawFlatGraphicSpecPage');
      const body = S.slice(i, S.indexOf('\\nasync function ', i + 10));
      // Bottom-right, not centred.
      // 16.70: the anchor is unchanged, but it is applied to the DRAWING rather than
      // the artboard. The capture carries ELEV_EXPORT_WRAP_PADDING of dead margin on
      // every edge (the vector path skips the pixel crop so the raster and the
      // replayed dim ops stay registered), and that fixed margin eats a bigger share
      // of a short wall than a long one — so bottom-anchoring the IMAGE left a 240"
      // wall floating ~37pt above its caption while a 400" wall sat ~17pt above.
      if (body.indexOf('const dx = SR.R - dw, dy = elevBottom - dh;') < 0) throw new Error('the elevation is not anchored to the bottom-right of the safety frame');
      // The WHOLE artboard is fitted. Two attempts at aligning the DRAWING instead have
      // been reverted, and both failure modes are worth keeping named here:
      //   16.70 shifted the placed image down. The margin is an opaque white JPEG, so
      //         it moved onto the caption — invisible on a white page, a white slab on
      //         a dark page theme.
      //   16.72 cropped ELEV_EXPORT_WRAP_PADDING off all four sides. That value is the
      //         TOP AND LEFT padding only; the export trims right and bottom flush to
      //         the outermost content. Cropping symmetrically cut real drawing off two
      //         edges and rescaled the rest past the safety frame.
      // The fix needs the capture to REPORT its per-edge padding rather than anything
      // here inferring it.
      if (body.indexOf('_cropCaptureMargin') >= 0) throw new Error('the symmetric crop is back; the capture margin is not symmetric');
      if (body.indexOf('_shift') >= 0) throw new Error('the margin shift is back; it puts the capture\\'s white margin over the caption');
      if (body.indexOf('const fit = Math.min(boxW / cw, boxH / ch);') < 0) throw new Error('the placement no longer fits the full artboard');
      // The raster and the vector ops MUST share one rect or the dimensions slide off
      // the drawing — and _drawElevAnnOps swallows its exceptions, so it fails silently.
      const img = body.indexOf("doc.addImage(res.cap.dataUrl, 'JPEG', dx, dy, dw, dh)");
      const ops = body.indexOf('_drawElevAnnOps(doc, res.cap.vec, dx, dy, dw, dh)');
      if (img < 0 || ops < 0) throw new Error('the raster and the annotation ops no longer share the same placed rect');
      if (/dy = elevTop \\+ \\(boxH - dh\\) \\/ 2/.test(body)) throw new Error('it is still vertically centred');
      // Its left edge is tied to the spec column, so widening the column cannot push
      // the drawing under the text.
      // 16.61 added WIDE mode, where the drawing takes the full page width under the
      // spec band instead. The requirement is unchanged for the side-by-side branch,
      // which is now the ternary's else.
      // 16.64: with two spec columns the left edge has to clear the LAST one, so it is
      // derived from _colX rather than a single colW. Same requirement either way -
      // widening the spec area moves the drawing instead of sliding under it.
      // 16.66: TWO layouts. One spec column -> the drawing sits beside it and its left
      // edge is derived from colW. Two columns -> the spec band is short, so the drawing
      // takes the page bottom at full width and clears only the floorplan thumbnail.
      if (body.indexOf('(_colX(_specCols - 1) + colW + _elevGutter)') < 0) throw new Error('the left edge is not derived from the spec column width');
      if (body.indexOf('const elevLeft = _rows ? (M + planSide + _elevGutter)') < 0) throw new Error('row mode does not give the drawing the page bottom');
      // 16.68: MEASURED, not counted. "More than one graphic" was a proxy for the thing
      // that matters — whether the spec band leaves the page bottom free. A single
      // wallcovering has the SHORTEST band of any of these sheets (four rows, no panel
      // schedule) and was the one page still getting the squeezed drawing.
      if (body.indexOf('const _rows = ((SR.B - _elevCapH) - _bandBot2) >= 150;') < 0) throw new Error('row mode is not measured from the spec band');
      if (body.indexOf('const _rows = _specCols > 1;') >= 0) throw new Error('row mode is counting graphics again');
      // The floorplan is a thumbnail in BOTH layouts. Uncapped, a short spec block
      // handed it the entire column — far more page than a location key needs.
      if (body.indexOf('Math.min(colW, _thumb,') < 0) throw new Error('the side-by-side floorplan is uncapped again');
      // ONE layout, locked in. 16.61's wide mode freed a full-width strip by moving the
      // floorplan out of its corner; the corner is where it belongs, so wide mode went
      // and the drawing is maximised WITHIN the right-hand column instead.
      // indexOf, not a regex: inside this template literal the backslash is eaten
      // before the RegExp sees it, so /_wide \?/ became /_wide ?/ — "_wide" with an
      // OPTIONAL space — which matched _wideH and failed against correct code.
      if (body.indexOf('_wide ?') >= 0) throw new Error('a second layout branch is back');
      // The drawing is width-constrained on every real wall, so the gutter is the only
      // lever on its scale — a wide one silently costs scale for nothing.
      if (body.indexOf('const _elevGutter = 12;') < 0) throw new Error('the gutter is not at its tightened value');
      // Past ~6:1 no single view reads (1000x108 is 9.3:1 — 0.86pt/in, a 29" panel is
      // 25pt against a ~40pt label), so the page SAYS so rather than quietly printing
      // 6pt dimensions.
      if (body.indexOf('const _tooWide = _capAsp > 6;') < 0) throw new Error('nothing detects an unreadably wide wall');
      if (body.indexOf('issue this elevation in sections') < 0) throw new Error('an over-wide wall prints no note');
      if (/elevLeft = SR\\.L \\+ \\(SR\\.R - SR\\.L\\) \\* 0\\.36/.test(body)) throw new Error('the left edge is still a hardcoded fraction unrelated to the spec block');
      // Top clears the title band, so a long heading can never overlap the drawing.
      if (body.indexOf('(titleY + 26)') < 0) throw new Error('the top edge is not tied to the title baseline');
      // In row mode it starts under the TALLEST spec column, so no block can overlap it.
      if (body.indexOf('Math.max.apply(null, _colBot.concat([titleY + 40])) + 14') < 0) throw new Error('the row-mode top does not clear the spec band');
      // The floorplan is ALWAYS bottom-left. 16.61 moved it into the top band to free a
      // full-width strip, which read as the plan floating mid-sheet.
      // 16.69: bottom-aligned from its DRAWN height, not its slot. A plan crop wider
      // than it is tall letterboxes, and pinning the slot top left its bottom edge
      // floating above the guide while the elevation's sat on it — the two captions
      // lined up but the two drawings did not.
      if (body.indexOf('const py0 = SR.B - _elevCapH - dh;') < 0) throw new Error('the floorplan is not pinned to the bottom-left corner');
      if (body.indexOf('const py0 = SR.B - planSide - 11;') >= 0) throw new Error('the floorplan is slot-aligned again, so it floats above the elevation baseline');
      if (body.indexOf('const px0 = M;') < 0) throw new Error('the floorplan left edge moved off the margin');
      // Two graphics each with a panel schedule made ONE column tall enough to leave
      // the floorplan under 40pt, at which point it was dropped — the plan vanished
      // exactly when the sheet carried the most information. Side-by-side halves it.
      if (body.indexOf('const _specCols = Math.min(_members.length, 2);') < 0) throw new Error('spec blocks are stacked again');
      // Blocks in a row share a top, or the two headings do not line up and the
      // second column reads as an afterthought rather than a column.
      if (body.indexOf('sy = _rowTop;') < 0) throw new Error('blocks in a row do not share a baseline');
      // The plan measures against ITS OWN column, not the tallest one — a tall second
      // column must not shrink a plan that has room beneath the first.
      if (body.indexOf('(SR.B - (_colBot[0] || sy)) - 26') < 0) throw new Error('the plan is still measured against the tallest column');
      // And each schedule draws in its own block's column.
      if (body.indexOf('_drawFlatPanelSchedule(doc, m, _cx,') < 0) throw new Error('the schedule is pinned to the first column');
      // And the caption still has room on the page.
      if (body.indexOf('const elevBottom = SR.B - _elevCapH;') < 0) throw new Error('no room reserved for the caption, so it would print below the bottom guide');
    });

    __check('EXACT BUG: an EGD wall draws wall dims only, not the hanging set-out', () => {
      // Reported: "when I put on the guide layout for framed artwork I can see it in
      // the wallcovering elevation which I do not need... I really only need wall dims
      // for wallcovering. But when I toggle guide for center and hanging height it
      // applies to all."
      //
      // The CL, hang line, AFF callout and wall-centre target are the SET-OUT for
      // hanging a picture. On a wallcovering — fitted to the wall itself, with nothing
      // hung on it — they print over the graphic. Unticking the deck-wide toggles is
      // not the fix: those are shared, so it would strip them from every framed-art
      // wall in the same deck.
      const i = S.indexOf('function drawElevGuides');
      const body = S.slice(i, i + 6000);
      const guard = body.indexOf('if (_isEgdWall(elevations[currentElevIndex])) {');
      if (guard < 0) throw new Error('THE BUG: drawElevGuides does not special-case an EGD wall');
      // It must return BEFORE any of the set-out guides are built.
      ['center-guide', 'hang-guide', '_elevCenterTarget(', 'floor-hang-dim'].forEach(frag => {
        const at = body.indexOf(frag);
        if (at < 0) throw new Error('the set-out guide ' + frag + ' vanished entirely');
        if (at < guard) throw new Error(frag + ' is built before the EGD guard, so it still draws on a wallcovering');
      });
      // Wall dims survive — the whole point of the sheet — via ONE shared definition,
      // so the EGD path can't drift from the framed one on offset, label or rotation.
      if (body.slice(guard, guard + 400).indexOf('_drawElevWallDims(') < 0) throw new Error('an EGD wall lost its wall dimensions');
      const d = S.indexOf('function _drawElevWallDims');
      if (d < 0) throw new Error('the wall dims were duplicated rather than shared');
      if ((S.match(/_drawElevWallDims\\(/g) || []).length < 3) throw new Error('only one path calls the shared wall dims');
    });

    __check('and per-frame spacing / edge-gap dims still work on an EGD wall', () => {
      // Framed art can legitimately sit over a wallcovering (that is what the layering
      // is for), and those dims only exist where the user asked for them frame by
      // frame — so they are not part of the automatic set-out being suppressed.
      const i = S.indexOf('function drawElevAll');
      const body = S.slice(i, i + 40000);
      ['drawElevTargetedSpacing()', 'drawFloorCeilingDims()'].forEach(call => {
        const at = body.indexOf(call);
        if (at < 0) throw new Error(call + ' is gone');
        // Must not have been wrapped in an EGD guard.
        const before = body.slice(Math.max(0, at - 220), at);
        if (/_isEgdWall\\s*\\([^)]*\\)\\s*\\)\\s*\\{[^}]*$/.test(before)) throw new Error(call + ' was suppressed on EGD walls');
      });
    });

    __check('the help copy tells the truth about the option count', () => {
      const i = S.indexOf('Seven options:');
      if (i < 0) throw new Error('the product help still claims five options');
      const body = S.slice(i, i + 700);
      [EGD, WF].forEach(p => { if (body.indexOf(p) < 0) throw new Error('help does not mention ' + p); });
      // It also used to claim Sourced Object skips frame and mat fields. There is no
      // branch for Sourced Object anywhere, so that was simply false.
      if (/Sourced Object skips frame and mat fields entirely/.test(S)) throw new Error('the help still makes the false Sourced Object claim');
    });
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n'
      + 'window.__indexHtml = ' + JSON.stringify(htmlSrc) + ';\n' + src + '\n' + testBlock);
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
