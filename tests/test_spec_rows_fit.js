// 18.94: A LONG SPEC LIST STOPS ABOVE THE FRAME STRIP ON EVERY PER-PIECE PAGE.
// Reported: float-mounted paper prints ~15 spec rows (Matboard, Paper Type, Paper Size,
// White Border...) and the last ones ran into the frame corner and profile. The rows only
// tightened on a page with a subheading shift; an ordinary page kept 13pt whatever its
// length. _specRowFit is now the one rule, for the PDF and the instant preview.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const NL = String.fromCharCode(10);

function inApp() {
  window.__run = (async () => {
    const out = [];
    const ok = async (label, fn) => { try { await fn(); out.push({ label, ok: true }); } catch (e) { out.push({ label, ok: false, err: e.message }); } };
    const corner = { naturalWidth: 150, naturalHeight: 400, width: 150, height: 400 };
    _rowFrameImages = async () => ({ cornerImg: corner, profileImg: corner, sizeText: '1"', vendor: 'X' });
    editorialContent.specSlots = { frame: true, profile: true, plan: true, elevation: true };
    const r = Object.assign({}, dashProjectData[0], {
      id: 'ART.1B-C', location: 'LOBBY', product: 'Framed Art', fType: 'image', fCode: 'MICH 241-10',
      extW: 17, extH: 15, fW: 1.25, fHeight: 2.125, rabbetDepth: 1.875,
      useFloatMount: true, sbPaperColorName: 'White', sbPaperMargin: 1.5, sbPaperBorder: 0.5, sbPaperEdge: 'Deckled Edge',
      m1A: false, glass: '2mm Standard', mount: 'Float Mount', hardware: '3-Point Security', backing: 'Foamcore'
    });
    dashProjectData = [r]; elevations = [];
    const nRows = buildSpecStrings(r).lines.length;
    const rec = new CanvasPdfRec(936, 540);
    await _drawSpecPageTemplate(rec, {}, 1, {}, r, 'frameSpecDetail', { PW: 936, PH: 540 });
    const texts = (rec.ops || []).filter(o => o && o.t === 'text');
    await ok('the fixture is a long list (' + nRows + ' rows)', () => { if (nRows < 13) throw new Error('only ' + nRows + ' rows'); });
    await ok('EXACT BUG: the last spec row ends above the frame strip', () => {
      const lastLab = buildSpecStrings(r).lines[nRows - 1].label;
      const last = texts.filter(t => t.str === lastLab).pop();
      if (!last) throw new Error('last row "' + lastLab + '" not drawn');
      const frameCap = texts.find(t => t.str === 'Frame');
      if (!frameCap) throw new Error('no Frame strip on the page');
      const imgs = (rec.ops || []).filter(o => o && (o.t === 'img' || o.t === 'image' || o.t === 'addImage'));
      // the strip's images sit above its caption; the caption is the reliable mark here
      const stripTop = frameCap.y - 8 - (540 * 0.16 * 0.8);
      if (!(last.y < stripTop)) throw new Error('last row at y ' + last.y.toFixed(1) + ' reaches the strip (top ~' + stripTop.toFixed(1) + ')');
    });
    await ok('a list with room keeps the house 8.5 / 13', () => {
      const f = _specRowFit(8, 150, 400);
      if (f.lead !== 13 || f.size !== 8.5) throw new Error(JSON.stringify(f));
      const g = _specRowFit(15, 150, 260);
      if (!(g.lead < 13 && g.lead >= 9 && g.size <= 8.5 && g.size >= 7)) throw new Error(JSON.stringify(g));
    });
    return out;
  })();
}
const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? (s) => ({ width: String(s || '').length * 4 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : (k in t ? t[k] : () => ({ addColorStop() {}, setTransform() {} }))), set: (t, k, v) => { t[k] = v; return true; } });
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
window.Path2D = function () { this.rect = this.moveTo = this.lineTo = this.closePath = this.arc = this.addPath = function () {}; };
global.window = window; global.document = window.document; global.navigator = window.navigator;
const q = console.error, w = console.warn; console.error = () => {}; console.warn = () => {};
const results = [];
try { window.eval(APP + NL + '_autosaveToldUser = true;' + NL + '(' + inApp.toString() + ')();'); }
catch (e) { results.push({ label: 'eval', ok: false, err: e.message }); }
console.error = q; console.warn = w;
Promise.resolve(window.__run).then(out => (out || []).forEach(r => results.push(r))).catch(e => results.push({ label: 'run', ok: false, err: e.message })).then(() => {
  let fail = 0;
  results.forEach(r => { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ': ' + r.err)); if (!r.ok) fail++; });
  console.log(NL + '--- Summary ---');
  console.log(fail ? fail + ' FAILED of ' + results.length : 'ALL PASSED (' + results.length + ')');
  setTimeout(() => process.exit(fail ? 1 : 0), 50);
});
