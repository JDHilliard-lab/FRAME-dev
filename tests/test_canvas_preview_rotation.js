// The Deck Studio preview must agree with the PDF about rotated dimension labels.
//
// Reported: "in Deck Studio the vertical text is showing as Horizontal in the preview,
// but is fixed once the PDF is generated. I do not want designers thinking it is
// broken." Correct diagnosis matters here: the preview is NOT jsPDF. Deck Studio renders
// pages through CanvasPdfRec, a canvas-2D shim that mimics the jsPDF drawing API, so
// every vector feature has to be implemented TWICE or the two renderers drift.
//
// Two gaps, both invisible to the PDF tests:
//
//  1. CanvasPdfRec.text RECORDED opts.angle but render() never read it, so every
//     vertical label (57" AFF, the wall dims, the group-frame labels) drew horizontal
//     in the preview and only came out upright in the export.
//
//  2. CanvasPdfRec had no `lines` method at all. _drawElevAnnOps needs it for the white
//     chip behind a rotated number (doc.rect is axis-aligned only). The call sits in a
//     try/catch, so the chip vanished SILENTLY — white on white, invisible until a
//     dimension line showed through a number.
//
// The load-bearing assertion is the last one: both renderers must place the rotated
// anchor at the same x. Text WIDTH legitimately differs (jsPDF reads embedded TTF
// metrics, canvas reads CSS fonts) so each measures with the engine that will draw, but
// for a 90-degree label the whole anchor shift runs along y — so x cannot differ.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message }); }
};

// A recording 2D context, so the checks are about the calls that actually paint.
const calls = [];
const mkCtx = () => new Proxy({}, {
  get(t, p) {
    if (p === 'canvas') return {};
    if (p === 'measureText') return (s) => ({ width: ('' + s).length * 6 });
    if (typeof p === 'string' && /^(save|restore|translate|rotate|scale|beginPath|moveTo|lineTo|closePath|fill|stroke|fillRect|rect|arc|arcTo|bezierCurveTo|fillText|strokeText|setLineDash|drawImage)$/.test(p)) {
      return (...a) => { calls.push([p].concat(a.map(v => typeof v === 'number' ? Math.round(v * 1000) / 1000 : (typeof v === 'string' ? v : '~')))); };
    }
    return t[p];
  },
  set(t, p, v) { t[p] = v; return true; }
});

const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => mkCtx();
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document;
global.navigator = window.navigator; global.self = window;
global.HTMLCanvasElement = window.HTMLCanvasElement;
global.DOMParser = window.DOMParser;

const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
window.eval(src);
const app = (n) => window.eval(n);

const CX = 100, CY = 200;
const ANN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="400" viewBox="0 0 500 400">' +
  '<g transform="rotate(-90 100.0 200.0)">' +
  '<rect x="70.0" y="192.0" width="60.0" height="17.0" fill="#ffffff" rx="2"/>' +
  '<text x="100.0" y="204.6" font-family="Helvetica" font-size="13" font-weight="600"' +
  ' fill="rgb(224, 0, 0)" text-anchor="middle">57 AFF</text>' +
  '</g>' +
  '<text x="300.0" y="50.0" font-family="Helvetica" font-size="13" fill="#222"' +
  ' text-anchor="middle">185 WIDE</text>' +
  '</svg>';

const ops = app('_elevAnnOps')(ANN);
const rec = new (app('CanvasPdfRec'))(500, 400);
const drew = app('_drawElevAnnOps')(rec, { w: 500, h: 400, ops }, 0, 0, 500, 400);

(async () => {
  await rec.render(1);
  const paint = calls.filter(c => c[0] !== 'setLineDash' && c[0] !== 'fillRect' && c[0] !== 'scale');
  const find = (name) => paint.filter(c => c[0] === name);
  const rotText = ops.filter(o => o.t === 'text' && o.rot)[0];
  const flatText = ops.filter(o => o.t === 'text' && !o.rot)[0];
  const rectOp = ops.filter(o => o.t === 'rect')[0];

  check('the preview replay ran and recorded a chip path plus both labels', () => {
    if (!drew) throw new Error('_drawElevAnnOps returned false against CanvasPdfRec');
    const types = rec.ops.map(o => o.t);
    if (types.indexOf('poly') < 0) throw new Error('no poly op recorded — CanvasPdfRec.lines is missing again, so the rotated chip is silently dropped. Recorded: ' + types.join(','));
    if (types.filter(t => t === 'text').length !== 2) throw new Error('expected two text ops, got ' + types.join(','));
  });

  check('EXACT BUG: a rotated label is drawn through a canvas rotate(), not flat', () => {
    const rot = find('rotate');
    if (!rot.length) throw new Error('the exact reported bug: no canvas rotate() was issued, so the vertical label paints horizontal in the Deck Studio preview while the PDF gets it right');
    // jsPDF angle is anticlockwise; canvas rotate() is clockwise in y-down space.
    const want = -(rotText.rot) * Math.PI / 180;
    if (Math.abs(rot[0][1] - want) > 0.001) throw new Error('rotation is ' + rot[0][1] + ' rad, expected ' + want.toFixed(3) + ' — wrong sign means the text reads top-to-bottom (upside down) versus the PDF');
    if (find('save').length < 1 || find('restore').length < 1) throw new Error('the rotation is not wrapped in save/restore, so it leaks onto everything drawn after it');
  });

  check('the rotated label is drawn at the origin of its rotated frame, and only the rotated one is transformed', () => {
    const ft = find('fillText');
    if (ft.length !== 2) throw new Error('expected two fillText calls, got ' + ft.length);
    const rotDraw = ft.filter(c => ('' + c[1]).indexOf('57') >= 0)[0];
    const flatDraw = ft.filter(c => ('' + c[1]).indexOf('185') >= 0)[0];
    if (!rotDraw || !flatDraw) throw new Error('could not identify both labels: ' + JSON.stringify(ft));
    if (rotDraw[2] !== 0 || rotDraw[3] !== 0) throw new Error('rotated label drawn at ' + rotDraw[2] + ',' + rotDraw[3] + ' instead of the rotated origin — the translate and the draw position would double up');
    // The flat label must NOT be wrapped in a transform.
    if (find('rotate').length !== 1) throw new Error('an unrotated label was also transformed — ' + find('rotate').length + ' rotate() calls for one rotated label');
    const iRot = paint.findIndex(c => c[0] === 'rotate');
    const iRestore = paint.findIndex((c, i) => c[0] === 'restore' && i > iRot);
    const iFlat = paint.indexOf(flatDraw);
    if (iFlat > iRot && iFlat < iRestore) throw new Error('the horizontal label was drawn inside the rotated frame');
  });

  check('the chip reaches the canvas as the same closed filled quad the PDF draws', () => {
    const mv = find('moveTo')[0], lt = find('lineTo');
    if (!mv) throw new Error('no moveTo — the chip path was never started');
    if (lt.length < 3) throw new Error('expected 3 lineTo segments for a quad, got ' + lt.length);
    const got = [[mv[1], mv[2]]].concat(lt.slice(0, 3).map(c => [c[1], c[2]]));
    rectOp.pts.forEach((p, i) => {
      if (Math.abs(got[i][0] - p.x) > 0.5 || Math.abs(got[i][1] - p.y) > 0.5) {
        throw new Error('preview chip corner ' + i + ' at ' + got[i] + ' but the op (and so the PDF) says ' + p.x + ',' + p.y);
      }
    });
    if (!find('closePath').length) throw new Error('the chip path is not closed');
    if (!find('fill').length) throw new Error('the chip is not filled, so it will not mask the dimension line behind the number');
    // A fill-only style must not also stroke a black outline around the white chip.
    if (find('stroke').length) throw new Error('the fill-only chip was also stroked — a black box would appear around every rotated number');
  });

  check('EXACT BUG: preview and PDF place the rotated anchor at the same x (the sideways float cannot come back in one renderer only)', () => {
    const tr = find('translate')[0];
    if (!tr) throw new Error('no translate recorded for the rotated label');
    if (Math.abs(tr[1] - rotText.x) > 0.5) {
      throw new Error('the preview shifted the rotated label to x=' + tr[1] + ' but its anchor is ' + rotText.x + '. For a 90-degree label the whole anchor shift runs along y, so any x difference is the sideways float — and it would disagree with the PDF.');
    }
    // Along its own axis it must be centred, using THIS renderer's measurement.
    rec.setFont('helvetica', 'bold'); rec.setFontSize(rotText.fs);
    const w = rec.getTextWidth(rotText.s);
    if (!(w > 0)) throw new Error('CanvasPdfRec could not measure the label');
    if (Math.abs(tr[2] - (rotText.y + w / 2)) > 0.5) {
      throw new Error('rotated label not centred along its axis: translate y=' + tr[2] + ', expected ' + (rotText.y + w / 2));
    }
  });

  check('horizontal labels are still centred in the preview', () => {
    const flatDraw = find('fillText').filter(c => ('' + c[1]).indexOf('185') >= 0)[0];
    rec.setFont('helvetica', 'normal'); rec.setFontSize(flatText.fs);
    const w = rec.getTextWidth(flatText.s);
    if (Math.abs(flatDraw[2] - (flatText.x - w / 2)) > 0.5) throw new Error('flat label at x=' + flatDraw[2] + ', expected ' + (flatText.x - w / 2));
    if (Math.abs(flatDraw[3] - flatText.y) > 0.5) throw new Error('flat label at y=' + flatDraw[3] + ', expected ' + flatText.y);
  });

  check('CanvasPdfRec implements every drawing call _drawElevAnnOps makes', () => {
    const proto = app('CanvasPdfRec').prototype;
    ['text', 'line', 'rect', 'circle', 'lines', 'setDrawColor', 'setFillColor', 'setTextColor',
     'setLineWidth', 'setLineDashPattern', 'setFont', 'setFontSize', 'getTextWidth'].forEach(m => {
      if (typeof proto[m] !== 'function') throw new Error('CanvasPdfRec is missing ' + m + '() — the vector replay calls it inside a try/catch, so that drawing would vanish from the preview with no error');
    });
  });

  check('the canvas renderer reads opts.angle rather than merely recording it', () => {
    const i = src.indexOf('CanvasPdfRec.prototype.render');
    const body = src.slice(i, src.indexOf('let _dsBuilt', i));
    if (!body) throw new Error('could not slice CanvasPdfRec.render');
    // Match the CODE, not a substring a nearby comment could satisfy.
    if (!/parseFloat\(op\.opts\.angle\)/.test(body)) throw new Error('render() no longer reads opts.angle — rotated text is flat in the preview again');
    if (body.indexOf('x.rotate(') < 0) throw new Error('render() never rotates the context');
    if (body.indexOf("op.t === 'poly'") < 0) throw new Error('render() has no poly case, so recorded doc.lines paths draw nothing');
  });

  let failures = 0;
  results.forEach(r => {
    console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err));
    if (!r.ok) failures++;
  });
  console.log('\n--- Summary ---');
  if (failures) { console.log(failures + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + results.length + ')');
})();
