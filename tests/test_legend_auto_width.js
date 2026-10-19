// 19.37: THE LETTER LEGEND GROWS TO FIT A LONG IMAGE CODE.
//
// Reported on the Ford SLC install guide (ART.40): "FFI.2023_FORD_BRONCO_BADLANDS_04.2"
// did not fit the 200pt legend beside its "Image code" label, so it dropped onto a line
// of its own under the label. The column now widens to its longest line, never below
// the width the designer set and never past the cap that keeps the drawing its share.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // Widths follow the font size, at roughly the width real type sets (7pt-wide at 10pt).
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({ font: '10px sans-serif', measureText(s) { const m = /([\d.]+)px/.exec(this.font); const px = m ? parseFloat(m[1]) : 10; return { width: (s || '').length * px * 0.7 }; } }, { get: (t, k) => (k in t ? (typeof t[k] === 'function' ? t[k].bind(t) : t[k]) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  const quiet = console.error; console.error = () => {};
  window.eval(src + `
    _autosaveToldUser = true;
    window.__render = async (code, legendW) => {
      elevations = [{ id: 'w40', name: 'ART.40 | Reception', wallW: 72, wallH: 108, frames: [{ id: 'ART.40', letter: 'A', x: 21, y: 37, w: 30, h: 40, active: true, dimTo: [] }] }];
      dashProjectData = [Object.assign(_cloneData(dashDefaultData), { id: 'ART.40', extW: 30, extH: 40, imageCode: code })];
      floorplanLevels = [];
      editorialContent.installGuide = Object.assign({ legend: true, legendDims: true, legendCode: true }, legendW ? { legendW: legendW } : {});
      editorialContent.pageFooters = {};
      _igNoCapture = false; for (const k in _igCapCache) delete _igCapCache[k];
      _captureElevWithGuides = async () => ({ dataUrl: 'data:image/jpeg;base64,AAAA', w: 300, h: 800, vec: [] });
      const rec = new CanvasPdfRec(936, 540);
      const texts = []; const o = rec.text;
      rec.text = function (s, x, y) { const str = String(Array.isArray(s) ? s.join(' ') : s); texts.push({ s: str, x: x, y: y, w: this.getTextWidth(str) }); return o.apply(this, arguments); };
      _curFooter = _resolveFooter('spec:elev:0');
      await _drawInstallGuidePage(rec, {}, 1, { location: '', code: '', version: '' }, Object.assign({}, elevations[0], { _idx: 0 }), { PW: 936, PH: 540, M: 40 });
      return { texts, need: _igLegendNeedW(rec, [dashProjectData[0]], ['dims', 'code']) };
    };
  `);
  console.error = quiet;

  const results = [];
  const check = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };
  const LONG = 'FFI.2023_FORD_BRONCO_BADLANDS_04.2';
  const lineOf = (r, code) => {
    const lab = r.texts.find(t => t.s === 'Image code');
    const val = r.texts.find(t => t.s.indexOf(code) >= 0);
    if (!lab || !val) throw new Error('legend line not drawn: ' + JSON.stringify(r.texts.map(t => t.s).slice(0, 30)));
    return { lab, val };
  };

  await check('EXACT BUG: a long image code prints on its label\'s line, not under it', async () => {
    const r = await window.__render(LONG);
    const { lab, val } = lineOf(r, LONG);
    if (Math.abs(lab.y - val.y) > 0.5) throw new Error('code at y ' + val.y.toFixed(1) + ', label at ' + lab.y.toFixed(1) + ' (stacked)');
  });

  await check('the long code is not shrunk to fit either', async () => {
    const r = await window.__render(LONG);
    // The widened column must hold the whole line at full size.
    if (!(r.need > 200)) throw new Error('fixture does not need more than the 200pt default (' + r.need.toFixed(1) + '), so it proves nothing');
  });

  await check('a short code leaves the column at the width set (nothing grows for no reason)', async () => {
    // Values are right-aligned to the column's edge: x + width IS the edge.
    const edge = (v) => v.x + v.w;
    const e1 = edge(lineOf(await window.__render('ARI.010.00012.1'), 'ARI.010.00012.1').val);
    const e2 = edge(lineOf(await window.__render('AB.1'), 'AB.1').val);
    const eL = edge(lineOf(await window.__render(LONG), LONG).val);
    if (Math.abs(e1 - e2) > 0.5) throw new Error('two codes that both fit gave different column widths: ' + e1.toFixed(1) + ' vs ' + e2.toFixed(1));
    if (!(eL > e1 + 10)) throw new Error('the long code did not widen the column (' + eL.toFixed(1) + ' vs ' + e1.toFixed(1) + ')');
  });

  await check('a width the designer set wider than needed is kept', async () => {
    const r = await window.__render(LONG, 330);
    const { lab, val } = lineOf(r, LONG);
    if (Math.abs(lab.y - val.y) > 0.5) throw new Error('stacked at a 330pt column');
  });

  const failed = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ' :: ' + r.err)));
  console.log(failed.length ? (failed.length + ' FAILED') : 'ALL PASSED (' + results.length + ')');
  process.exit(failed.length ? 1 : 0);
})();
