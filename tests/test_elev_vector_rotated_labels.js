// Rotated dimension labels in the VECTOR annotation replay.
//
// Reported: "any text that has 90 degree angle gets flipped to horizontal and just
// floats near where it should be, the white box that is supposed to go behind the text
// is floating too far away from the text" — the 57" AFF label, the wall dimension, and
// the group-frame labels. Two independent defects, both confirmed by probing jsPDF and
// the real content stream rather than by reasoning:
//
//  1. THE CHIP. A rotated label is emitted as `<g transform="rotate(-90 cx cy)">` with
//     the white chip <rect> and the <text> inside it. The parser mapped only the rect's
//     ORIGIN through the matrix and kept width/height, so a 60x17 chip stayed 60x17
//     (horizontal!) at a rotated corner instead of becoming a 17x60 upright box over
//     its number. That is the horizontal white box floating away from its text.
//     doc.rect can only draw axis-aligned, so a rotated rect has to become a quad.
//
//  2. THE ANCHOR. jsPDF DOES honour options.angle (verified: it writes a proper
//     [0 1 -1 0] Tm matrix, and align does not suppress it) — but it applies
//     options.align in UNROTATED page space. With align:'center' it always subtracts
//     half the text width from X, even when the text advances along Y. So a vertical
//     label rendered rotated but displaced sideways by half its length: "floats near
//     where it should be". Fixed by doing the anchor shift by hand along the text's own
//     advance direction, which is exact at any angle. For unrotated text the arithmetic
//     is identical to jsPDF's own (200 - 58.32/2 = 170.84 both ways), so the horizontal
//     labels cannot regress.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message }); }
};

const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document;
global.navigator = window.navigator; global.self = window;
global.HTMLCanvasElement = window.HTMLCanvasElement;
global.DOMParser = window.DOMParser;

const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
window.eval(src);
const app = (name) => window.eval(name);

// Real jsPDF, so the assertions are about bytes that actually reach the file.
const jsPDF = require(path.join(root, 'lib-jspdf.min.js')).jsPDF;

// Exactly the shape exportElevSVG emits for a rotated label with a white chip
// (the 57" AFF / wall-dim / group-frame case), plus a horizontal one as control.
const CHIP_W = 60, CHIP_H = 17, CX = 100, CY = 200;
const ANN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="400" viewBox="0 0 500 400">' +
  '<g transform="rotate(-90 100.0 200.0)">' +
  '<rect x="70.0" y="192.0" width="60.0" height="17.0" fill="#ffffff" rx="2"/>' +
  '<text x="100.0" y="204.6" font-family="Helvetica, Arial, sans-serif" font-size="13"' +
  ' font-weight="600" fill="rgb(224, 0, 0)" text-anchor="middle">57 AFF</text>' +
  '</g>' +
  '<text x="300.0" y="50.0" font-family="Helvetica, Arial, sans-serif" font-size="13"' +
  ' font-weight="600" fill="#222222" text-anchor="middle">185 WIDE</text>' +
  '</svg>';

const ops = app('_elevAnnOps')(ANN);
const rectOp = ops.filter(o => o.t === 'rect')[0];
const rotText = ops.filter(o => o.t === 'text' && o.rot)[0];
const flatText = ops.filter(o => o.t === 'text' && !o.rot)[0];

// Replay at k=1 (artboard units == pt) onto a 600pt page placed at 0,0 so every
// number below can be checked by hand.
const PAGE = 600;
const doc = new jsPDF({ unit: 'pt', format: [PAGE, PAGE] });
const drew = app('_drawElevAnnOps')(doc, { w: 500, h: 400, ops }, 0, 0, 500, 400);
const uri = doc.output('datauristring');
const raw = Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64').toString('latin1');
const stream = raw.slice(raw.indexOf('stream'), raw.indexOf('endstream')).replace(/\r/g, '\n');
// PDF space is y-up; the drawing code works y-down.
const up = (v) => PAGE - v;

check('the replay actually ran and produced ops for both a rotated and a flat label', () => {
  if (!drew) throw new Error('_drawElevAnnOps returned false');
  if (!rectOp) throw new Error('the white chip did not parse into a rect op');
  if (!rotText) throw new Error('the rotated label did not parse (rot was 0) — it would print horizontal');
  if (!flatText) throw new Error('the horizontal control label did not parse');
  if (rotText.s.indexOf('57') < 0) throw new Error('rotated op carries the wrong text: ' + rotText.s);
});

check('EXACT BUG 1: a rotated chip is a quad from all four mapped corners, not an axis-aligned box at a rotated origin', () => {
  if (!rectOp.pts) throw new Error('the exact reported bug: the chip inside a rotate() group carries no corner path, so it draws axis-aligned — a horizontal white box floating away from its vertical number');
  if (rectOp.pts.length !== 4) throw new Error('expected 4 corners, got ' + rectOp.pts.length);
  const xs = rectOp.pts.map(p => p.x), ys = rectOp.pts.map(p => p.y);
  const bw = Math.max.apply(null, xs) - Math.min.apply(null, xs);
  const bh = Math.max.apply(null, ys) - Math.min.apply(null, ys);
  // A 90-degree rotation must SWAP the chip's extents.
  if (Math.abs(bw - CHIP_H) > 0.5) throw new Error('rotated chip is ' + bw + 'pt wide; a 90-degree turn should make it ' + CHIP_H + 'pt (its original height)');
  if (Math.abs(bh - CHIP_W) > 0.5) throw new Error('rotated chip is ' + bh + 'pt tall; a 90-degree turn should make it ' + CHIP_W + 'pt (its original width)');
  // And it must still be centred where the label is.
  const mx = (Math.max.apply(null, xs) + Math.min.apply(null, xs)) / 2;
  const my = (Math.max.apply(null, ys) + Math.min.apply(null, ys)) / 2;
  if (Math.abs(mx - CX) > 1 || Math.abs(my - CY) > 1) throw new Error('rotated chip centre drifted to ' + mx + ',' + my + ' (label sits at ' + CX + ',' + CY + ')');
});

check('the rotated chip reaches the PDF as a filled closed path, not a doc.rect', () => {
  // doc.lines writes "m", three "l" segments, "h" (close) then the paint operator.
  const quad = /([\d.]+) ([\d.]+) m\n([\d.]+) ([\d.]+) l\n([\d.]+) ([\d.]+) l\n([\d.]+) ([\d.]+) l\nh\n(f|B|S)/.exec(stream);
  if (!quad) throw new Error('no closed 4-corner path in the content stream — the chip is still being drawn as an axis-aligned rect. Stream: ' + stream.slice(0, 400));
  const got = [[+quad[1], up(+quad[2])], [+quad[3], up(+quad[4])], [+quad[5], up(+quad[6])], [+quad[7], up(+quad[8])]];
  rectOp.pts.forEach((p, i) => {
    if (Math.abs(got[i][0] - p.x) > 0.5 || Math.abs(got[i][1] - p.y) > 0.5) {
      throw new Error('chip corner ' + i + ' reached the PDF at ' + got[i] + ' but the op says ' + p.x + ',' + p.y);
    }
  });
  if (quad[9] === 'S') throw new Error('the chip is stroked but not filled — it will not mask the dimension line behind the number');
});

check('EXACT BUG 2: a rotated label is NOT displaced sideways by half its width', () => {
  const tm = /([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([\d.]+) ([\d.]+) Tm/.exec(stream);
  if (!tm) throw new Error('no text matrix in the stream — the rotated label lost its rotation and printed horizontal (jsPDF writes Td, not Tm, for unrotated text)');
  const a = +tm[1], b = +tm[2], c = +tm[3], d = +tm[4];
  // rotate(-90) in SVG == +90 anticlockwise for jsPDF == matrix [0 1 -1 0].
  if (Math.abs(a) > 0.01 || Math.abs(b - 1) > 0.01 || Math.abs(c + 1) > 0.01 || Math.abs(d) > 0.01) {
    throw new Error('the exact reported bug: text matrix is [' + [a, b, c, d] + '], not a 90-degree rotation [0 1 -1 0] — the label printed flat');
  }
  const tx = +tm[5], ty = up(+tm[6]);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(rotText.fs);
  const tw = doc.getTextWidth(rotText.s);
  if (!(tw > 5)) throw new Error('could not measure the label');
  // The anchor may only move ALONG the text's advance direction, which for a
  // 90-degree label is straight up the page. Any X shift is the reported float.
  if (Math.abs(tx - rotText.x) > 0.5) {
    throw new Error('the exact reported bug: rotated label shifted ' + (rotText.x - tx).toFixed(1) + 'pt sideways (half its width is ' + (tw / 2).toFixed(1) + 'pt), so it floats away from its chip');
  }
  // Centred on the anchor: baseline starts half a width below, runs upward.
  if (Math.abs(ty - (rotText.y + tw / 2)) > 0.5) {
    throw new Error('rotated label is not centred along its own axis: baseline at ' + ty.toFixed(1) + ', expected ' + (rotText.y + tw / 2).toFixed(1));
  }
  // Sanity: the text must land inside the chip we just checked.
  const ys = rectOp.pts.map(p => p.y);
  if (ty > Math.max.apply(null, ys) + 1 || ty - tw < Math.min.apply(null, ys) - 1) {
    throw new Error('the rotated number does not sit inside its own chip');
  }
});

check('horizontal labels still centre exactly as jsPDF align did (no regression from hand-rolled anchoring)', () => {
  const td = /([\d.]+) ([\d.]+) Td/.exec(stream);
  if (!td) throw new Error('the flat control label never reached the stream');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(flatText.fs);
  const tw = doc.getTextWidth(flatText.s);
  const wantX = flatText.x - tw / 2;
  if (Math.abs(+td[1] - wantX) > 0.5) throw new Error('centred label placed at x=' + td[1] + ', expected ' + wantX.toFixed(2));
  if (Math.abs(up(+td[2]) - flatText.y) > 0.5) throw new Error('centred label placed at y=' + up(+td[2]) + ', expected ' + flatText.y);
});

check('anchor handling covers end/start too, and start text is never shifted', () => {
  const mk = (anchor) => '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="400" viewBox="0 0 500 400">' +
    '<text x="200.0" y="100.0" font-family="Helvetica" font-size="13" fill="#222" text-anchor="' + anchor + '">ABCDEF</text></svg>';
  const pos = {};
  ['start', 'middle', 'end'].forEach(anchor => {
    const o = app('_elevAnnOps')(mk(anchor));
    const d2 = new jsPDF({ unit: 'pt', format: [PAGE, PAGE] });
    app('_drawElevAnnOps')(d2, { w: 500, h: 400, ops: o }, 0, 0, 500, 400);
    const u2 = d2.output('datauristring');
    const s2 = Buffer.from(u2.slice(u2.indexOf(',') + 1), 'base64').toString('latin1').replace(/\r/g, '\n');
    const m = /([\d.]+) ([\d.]+) Td/.exec(s2.slice(s2.indexOf('stream'), s2.indexOf('endstream')));
    if (!m) throw new Error(anchor + ': no text placed');
    pos[anchor] = +m[1];
  });
  if (Math.abs(pos.start - 200) > 0.5) throw new Error('text-anchor="start" was shifted to ' + pos.start + '; it must stay at its x');
  if (!(pos.end < pos.middle && pos.middle < pos.start)) throw new Error('anchors are not ordered end < middle < start: ' + JSON.stringify(pos));
  // middle must be exactly halfway between start and end.
  if (Math.abs(pos.middle - (pos.start + pos.end) / 2) > 0.5) throw new Error('middle anchor is not half of end: ' + JSON.stringify(pos));
});

check('the replay never passes options.align to doc.text (align and angle disagree about which space they work in)', () => {
  const i = src.indexOf('function _drawElevAnnOps');
  if (i < 0) throw new Error('_drawElevAnnOps not found');
  const body = src.slice(i, src.indexOf('\nconst _ELEV_CAP_QUALITY', i));
  if (!body) throw new Error('could not slice _drawElevAnnOps');
  if (/opt\.align/.test(body) || /align\s*:/.test(body)) {
    throw new Error('doc.text is being given an align option again — jsPDF applies it in unrotated page space, which slides every rotated label sideways by half its width');
  }
  if (body.indexOf('getTextWidth') < 0) throw new Error('the anchor shift is no longer measured, so centred labels cannot be placed');
  if (body.indexOf('opt.angle') < 0) throw new Error('rotation is no longer passed to doc.text');
});

check('a rotated chip cannot silently fall back to doc.rect (the axis-aligned path is guarded by pts)', () => {
  const i = src.indexOf('function _elevAnnOps');
  const body = src.slice(i, src.indexOf('function _cssColorToRgb', i));
  if (body.indexOf('_matAngle(cm) ? pts : null') < 0) {
    throw new Error('rect ops no longer carry a corner path only when rotated — either every rect became a slow quad, or rotated chips are axis-aligned again');
  }
});

let failures = 0;
results.forEach(r => {
  console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err));
  if (!r.ok) failures++;
});
console.log('\n--- Summary ---');
if (failures) { console.log(failures + ' FAILURES'); process.exit(1); }
console.log('ALL PASSED (' + results.length + ')');
