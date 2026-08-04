// Elevation dimension text as REAL VECTOR PDF, not pixels.
//
// The breaker/install pages rasterized the whole elevation and placed it as a JPEG, so
// the dimension numbers carried compression ringing and read soft next to the spec
// pages, whose text jsPDF draws. Two dead ends first: more resolution (already ~600
// DPI, no visible change) and a lossless PNG capture, which CORRUPTED every page —
// jsPDF garbled a 5826x3528 RGBA canvas PNG into grey/rainbow channel fringing.
//
// exportElevSVG already sorts its output into three z-groups, so the split was already
// there: rasterize `frames-and-character` (photographs belong as a raster) and replay
// `lines-and-boxes` + `numbers-and-labels` as doc.line/rect/text.
//
// Parsing our OWN generated SVG is safe because this module wrote it — the vocabulary
// is fixed. Anything unrecognised is skipped, and if nothing parses the capture falls
// back to the old whole-raster path, so the worst case is the previous behaviour.
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
  global.navigator = window.navigator; global.DOMParser = window.DOMParser;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};
    const S = window.__appSrc;

    // A slice of exactly what exportElevSVG emits for an annotation layer: the wall
    // rect, a dashed extension line, a 45-degree tick, a chip + number, a rotated
    // number, and a passthrough target symbol under translate+scale.
    const ANN = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600" viewBox="0 0 1000 600">' +
      '<rect x="50" y="40" width="700" height="420" fill="none" stroke="rgb(51, 51, 51)" stroke-width="1"/>' +
      '<line x1="100" y1="500" x2="400" y2="500" stroke="rgb(224, 0, 0)" stroke-width="1" stroke-dasharray="3,2"/>' +
      '<line x1="96" y1="504" x2="104" y2="496" stroke="rgb(224, 0, 0)" stroke-width="2"/>' +
      '<g><rect x="230" y="486" width="44" height="16" fill="#ffffff" rx="2"/>' +
      '<text x="252" y="497" font-family="Messina, serif" font-size="12" font-weight="600" fill="rgb(224, 0, 0)" text-anchor="middle">102 mm</text></g>' +
      '<g transform="rotate(-90 60 250)"><text x="60" y="250" font-size="12" fill="rgb(224, 0, 0)" text-anchor="middle">57 AFF</text></g>' +
      '<g transform="translate(400 250) scale(2 2)"><circle cx="7" cy="7" r="7" fill="none" stroke="#333" stroke-width="1"/></g>' +
      '</svg>';
    // A jsPDF stand-in that records everything.
    const __doc = () => {
      const c = [];
      return { c,
        setDrawColor: function () { this._d = Array.prototype.slice.call(arguments).join(','); },
        setFillColor: function () { this._f = Array.prototype.slice.call(arguments).join(','); },
        setTextColor: function () { this._t = Array.prototype.slice.call(arguments).join(','); },
        setLineWidth: function (v) { this._w = v; }, setLineDashPattern: function (a) { this._dash = a; },
        setFont: function (f, s) { this._fam = f; this._sty = s; }, setFontSize: function (v) { this._fs = v; },
        line: function (a, b, d, e) { c.push({ t: 'line', a: a, b: b, x2: d, y2: e, col: this._d, w: this._w, dash: this._dash }); },
        rect: function (a, b, d, e, m) { c.push({ t: 'rect', a: a, b: b, w: d, h: e, m: m, col: this._d, fill: this._f }); },
        circle: function (a, b, r, m) { c.push({ t: 'circle', a: a, b: b, r: r, col: this._d }); },
        text: function (s, x, y, o) { c.push({ t: 'text', s: s, x: x, y: y, o: o || {}, col: this._t, fam: this._fam, sty: this._sty, fs: this._fs }); }
      };
    };

    // ── The parse ──
    __check('EXACT REQUEST: the lines and numbers come back as drawing ops, not pixels', () => {
      const ops = _elevAnnOps(ANN);
      if (!ops.length) throw new Error('nothing parsed — the capture would fall back to a whole raster');
      const kinds = {}; ops.forEach(o => { kinds[o.t] = (kinds[o.t] || 0) + 1; });
      if (!kinds.text) throw new Error('no text ops: ' + JSON.stringify(kinds));
      if (!kinds.line) throw new Error('no line ops: ' + JSON.stringify(kinds));
      if (!kinds.rect) throw new Error('no rect ops: ' + JSON.stringify(kinds));
      if (!kinds.circle) throw new Error('no circle op — the centre target would vanish: ' + JSON.stringify(kinds));
      const t = ops.filter(o => o.t === 'text').map(o => o.s);
      if (t.indexOf('102 mm') < 0) throw new Error('the dimension number is missing: ' + JSON.stringify(t));
    });

    __check('coordinates survive a translate+scale group', () => {
      // The target symbol: translate(400 250) scale(2 2) around cx=7 cy=7 r=7.
      const c = _elevAnnOps(ANN).find(o => o.t === 'circle');
      if (Math.abs(c.x - 414) > 0.5 || Math.abs(c.y - 264) > 0.5) throw new Error('centre came out at ' + c.x.toFixed(1) + ',' + c.y.toFixed(1) + ', expected 414,264');
      if (Math.abs(c.r - 14) > 0.5) throw new Error('radius did not scale: ' + c.r.toFixed(1));
    });

    __check('rotated text keeps its angle, and in the direction jsPDF expects', () => {
      // SVG rotate() is clockwise; jsPDF's text angle is anticlockwise. A vertical
      // dimension is rotate(-90) in the SVG, so it must reach jsPDF as +90 or it
      // prints upside down.
      const r = _elevAnnOps(ANN).find(o => o.t === 'text' && o.s.indexOf('AFF') >= 0);
      if (!r) throw new Error('the rotated AFF label did not parse');
      if (r.rot !== 90) throw new Error('angle came out ' + r.rot + ', expected 90');
      const flat = _elevAnnOps(ANN).find(o => o.t === 'text' && o.s === '102 mm');
      if (flat.rot) throw new Error('an unrotated number picked up an angle: ' + flat.rot);
    });

    __check('dash patterns, weights and anchors are carried through', () => {
      const ops = _elevAnnOps(ANN);
      const dashed = ops.find(o => o.t === 'line' && o.dash);
      if (!dashed) throw new Error('the dashed extension line lost its dash');
      const tick = ops.filter(o => o.t === 'line').find(o => o.w > 1.5);
      if (!tick) throw new Error('the heavier tick lost its weight — the hierarchy is gone');
      if (ops.find(o => o.t === 'text' && o.s === '102 mm').anchor !== 'middle') throw new Error('a centred number lost its anchor and would print off to one side');
    });

    // ── Colour, which nearly shipped broken ──
    __check('EXACT RISK: rgb() colours survive — _annHexToRgb alone turns them grey', () => {
      // emitEl copies COMPUTED styles, which are 'rgb(r, g, b)'; only the handful this
      // module writes itself are hex. _annHexToRgb parseInts the string, so an rgb()
      // value became NaN and fell back to dark grey — every dimension would have
      // silently lost the user's colour.
      const red = _cssColorToRgb('rgb(224, 0, 0)');
      if (red.r !== 224 || red.g !== 0 || red.b !== 0) throw new Error('rgb() parsed as ' + JSON.stringify(red));
      const hex = _cssColorToRgb('#e00000');
      if (hex.r !== 224 || hex.g !== 0 || hex.b !== 0) throw new Error('hex parsed as ' + JSON.stringify(hex));
      if (_cssColorToRgb('#333').r !== 51) throw new Error('short hex broke');
      if (_cssColorToRgb('rgba(20,20,20,0.9)').r !== 20) throw new Error('rgba broke');
      // And it reaches the PDF.
      const d = __doc();
      _drawElevAnnOps(d, { w: 1000, h: 600, ops: _elevAnnOps(ANN) }, 0, 0, 1000, 600);
      const num = d.c.find(x => x.t === 'text' && x.s === '102 mm');
      if (num.col !== '224,0,0') throw new Error('the number printed in ' + num.col + ' instead of the dimension colour');
    });

    __check('EXACT RISK: the sans stack does not map to the serif face', () => {
      // 'sans-serif' contains the substring 'serif', so a bare contains-check sent the
      // whole grotesque stack to Messina.
      if (_elevAnnFontRole("'Helvetica Neue',Helvetica,Arial,sans-serif") !== 'sans') throw new Error('the sans stack mapped to ' + _elevAnnFontRole("'Helvetica Neue',Helvetica,Arial,sans-serif"));
      if (_elevAnnFontRole("'Messina','Times New Roman',Times,Georgia,serif") !== 'serif') throw new Error('the Messina stack did not map to serif');
      if (_elevAnnFontRole("'Druk','Oswald','Arial Narrow',Arial,sans-serif") !== 'display') throw new Error('the Druk stack did not map to display');
      if (_elevAnnFontRole('') !== 'sans') throw new Error('an empty family should fall back to sans');
    });

    // ── The replay ──
    __check('ops map into the placed rectangle, scaled and offset', () => {
      const ops = _elevAnnOps(ANN);
      const d = __doc();
      // Half scale, offset to (100, 50).
      if (!_drawElevAnnOps(d, { w: 1000, h: 600, ops: ops }, 100, 50, 500, 300)) throw new Error('replay reported failure');
      const num = d.c.find(x => x.t === 'text' && x.s === '102 mm');
      // artboard (252, 497) at k=0.5 offset (100,50) -> (226, 298.5)
      if (Math.abs(num.x - 226) > 0.01 || Math.abs(num.y - 298.5) > 0.01) throw new Error('the number landed at ' + num.x + ',' + num.y + ', expected 226,298.5');
      // Nothing may fall outside the rect it was given.
      d.c.forEach(c2 => {
        const px = (c2.a !== undefined ? c2.a : c2.x), py = (c2.b !== undefined ? c2.b : c2.y);
        if (px < 99 || px > 601 || py < 49 || py > 351) throw new Error('an op landed outside the placed rect at ' + px.toFixed(0) + ',' + py.toFixed(0));
      });
    });

    __check('text is drawn AFTER the lines, so a number is never under its own line', () => {
      const d = __doc();
      _drawElevAnnOps(d, { w: 1000, h: 600, ops: _elevAnnOps(ANN) }, 0, 0, 1000, 600);
      const firstText = d.c.findIndex(x => x.t === 'text');
      const lastNonText = d.c.reduce((acc, x, i) => (x.t !== 'text' ? i : acc), -1);
      if (firstText < 0) throw new Error('no text drawn');
      if (!(firstText > lastNonText)) throw new Error('text is interleaved with the linework');
    });

    __check('it fails SAFE: nothing parseable means the old whole-raster path', () => {
      [null, undefined, '', '<not xml', '<svg></svg>', '{}'].forEach(bad => {
        let ops;
        try { ops = _elevAnnOps(bad); } catch (e) { throw new Error(JSON.stringify(bad) + ' threw: ' + e.message); }
        if (!Array.isArray(ops)) throw new Error(JSON.stringify(bad) + ' returned ' + typeof ops);
        if (ops.length) throw new Error(JSON.stringify(bad) + ' invented ' + ops.length + ' ops');
      });
      const d = __doc();
      if (_drawElevAnnOps(d, null, 0, 0, 10, 10)) throw new Error('a null vec reported success');
      if (_drawElevAnnOps(d, { w: 0, h: 0, ops: [{ t: 'line' }] }, 0, 0, 10, 10)) throw new Error('a zero artboard reported success');
      if (d.c.length) throw new Error('drew something from nothing');
    });

    __check('a runaway parse is bounded', () => {
      if (typeof _ELEV_ANN_MAX_OPS === 'undefined' || !(_ELEV_ANN_MAX_OPS > 100)) throw new Error('the op cap is gone or absurdly low');
    });

    // ── The wiring ──
    __check('EXACT REQUEST: the capture rasterizes the PICTURE group only when ops exist', () => {
      const i = S.indexOf('async function _captureElevWithGuides');
      const body = S.slice(i, S.indexOf('async function _drawInstallGuidePage', i));
      if (body.indexOf('_elevAnnOps(res.annSvg)') < 0) throw new Error('the capture never parses the annotation groups');
      if (body.indexOf('_vecOK ? res.picSvg') < 0) throw new Error('the capture still rasterizes the whole drawing, so the text stays pixels');
      if (body.indexOf('vec: _vecOK ?') < 0) throw new Error('the capture does not hand the ops to the page');
      // The pixel crop must be skipped, or the raster slides out from under the ops.
      if (body.indexOf('if (_vecOK) throw 0;') < 0) throw new Error('the content crop still runs on the vector path — the two halves would not line up');
    });

    __check('exportElevSVG hands back the three groups on the same artboard', () => {
      const i = S.indexOf('async function exportElevSVG');
      const body = S.slice(i, i + 60000);
      if (body.indexOf('picSvg:') < 0 || body.indexOf('annSvg:') < 0) throw new Error('the groups are not returned separately');
      if (body.indexOf('artW: svgW') < 0 || body.indexOf('artH: svgH') < 0) throw new Error('the artboard size is not returned, so the ops cannot be scaled');
      // Both must be built from the SAME head, or the halves end up in different
      // coordinate spaces and the ops drift off the picture.
      const shared = body.split('picSvg: head').length - 1 + (body.split('annSvg: head').length - 1);
      if (shared !== 2) throw new Error('the two sub-SVGs do not share one artboard header (' + shared + ' of 2 use it)');
      // 16.29 moved the header into _elevSvgHead so the download and the PDF path
      // can't drift, and so it can declare a real-world size in points. The viewBox
      // requirement follows it there.
      if (body.indexOf('_elevSvgHead(svgW, svgH)') < 0) throw new Error('the shared header is not built by _elevSvgHead');
      const h = S.indexOf('function _elevSvgHead');
      const hb = S.slice(h, S.indexOf('\\n}', h));
      // (Written without the template marker so this file's own template literal
      // doesn't try to interpolate it.)
      if (hb.indexOf('viewBox="0 0 ' + '$' + '{svgW') < 0) throw new Error('the shared header has no viewBox, so the halves would not scale together');
      // The viewBox stays in USER UNITS while width/height state points. Put a unit
      // on the viewBox and every coordinate in both halves silently rescales.
      if (/viewBox="0 0 [^"]*ELEV_PT_TO_PX/.test(hb)) throw new Error('the viewBox was converted to points; the geometry would no longer match the ops');
    });

    __check('both elevation layouts replay the ops over their image', () => {
      const i = S.indexOf('async function _drawInstallGuidePage');
      const body = S.slice(i, i + 40000);
      const n = (body.match(/_drawElevAnnOps\\(doc, cap\\.vec/g) || []).length;
      if (n < 2) throw new Error('only ' + n + ' layout(s) replay the annotations; the other prints a picture with no dimensions');
      // And after the image, never before, or the raster covers them.
      const img = body.indexOf("doc.addImage(cap.dataUrl, 'JPEG'");
      const rep = body.indexOf('_drawElevAnnOps(doc, cap.vec');
      if (!(rep > img)) throw new Error('the replay runs before the image is placed');
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
