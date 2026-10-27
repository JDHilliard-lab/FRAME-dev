// 19.84: "in Deck Studio even on the zoomed in timeline wall details pages some of the
// dashed lines are not rendering." Two causes, both page-only: (1) a page draws the wall far
// smaller than the zoomed screen, so a spacer's leader printed 3 to 6pt long and a 3pt dash
// showed one dash or a dash and a gap; (2) the no-white-boxes knockout was cut at export
// with EVERY guide's numbers, so a guide hidden on the page (Wall dimensions) left holes in
// the leaders with nothing in them.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    _autosaveToldUser = true; scheduleAutosave = () => {}; pushHistory = () => {};
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const recDoc = () => {
      const calls = [];
      const d = { calls, _dash: [] };
      ['setDrawColor', 'setFillColor', 'setTextColor', 'setLineWidth', 'setFont', 'setFontSize', 'rect', 'circle', 'lines', 'text'].forEach(n => { d[n] = function () { calls.push([n].concat([].slice.call(arguments))); }; });
      d.setLineDashPattern = function (a) { d._dash = a; };
      d.line = function (x1, y1, x2, y2) { calls.push(['line', x1, y1, x2, y2, d._dash.slice()]); };
      d.getTextWidth = () => 10;
      return d;
    };
    const fitOk = (p, len) => {
      const n = Math.round((len + p[1]) / (p[0] + p[1]));
      return Math.abs(n * p[0] + (n - 1) * p[1] - len) < 1e-6 ? n : 0;
    };

    __check('EXACT ASK: a short dashed leader shows at least three dashes and ends on a dash', () => {
      const p = _dashFitLen([3, 2], 5);
      if (p.length !== 2) throw new Error('went solid: ' + JSON.stringify(p));
      const n = fitOk(p, 5);
      if (n < 3) throw new Error('does not start and end on a dash, or under three: ' + JSON.stringify(p));
      if (Math.abs(p[1] / p[0] - 2 / 3) > 1e-6) throw new Error('lost the dash:gap ratio');
    });
    __check('a long leader keeps the drafting dash (never longer) and still ends on a dash', () => {
      const p = _dashFitLen([3, 2], 137);
      if (!(p[0] <= 3 + 1e-9 && p[0] > 2.8)) throw new Error('dash ' + p[0]);
      if (!fitOk(p, 137)) throw new Error('does not end on a dash');
    });
    __check('a line too short for three dashes draws solid, not a speck', () => {
      if (_dashFitLen([3, 2], 0.6).length) throw new Error('kept a dash on a 0.6pt line');
    });
    __check('the page renderer fits each dashed line to its own printed length', () => {
      const doc = recDoc();
      const vec = { w: 100, h: 100, ops: [
        { t: 'line', x1: 0, y1: 10, x2: 5, y2: 10, c: '#e00000', w: 2, dash: '6.000,4.000' },
        { t: 'line', x1: 0, y1: 20, x2: 90, y2: 20, c: '#e00000', w: 2, dash: null }
      ] };
      _drawElevAnnOps(doc, vec, 0, 0, 100, 100);
      const ln = doc.calls.filter(c => c[0] === 'line');
      if (fitOk(ln[0][5], 5) < 3) throw new Error('short leader dash ' + JSON.stringify(ln[0][5]));
      if (ln[1][5].length) throw new Error('a solid line was dashed');
    });

    const svg = (inner) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">' + inner + '</svg>';
    const LEADER = '<g data-gl="custom-lines-layer"><line x1="0" y1="50" x2="200" y2="50" stroke="#e00000" stroke-width="2"/></g>';
    const KNOCK = '<g data-gl="arch-dim-layer"><rect data-knock="1" x="90" y="45" width="20" height="10" fill="none"/><text x="100" y="52" font-size="9" fill="#e00000">12"</text></g>';
    __check('a visible number still cuts the line under it (no white boxes)', () => {
      const ops = _elevAnnOps(svg(LEADER + KNOCK));
      if (!ops.some(o => o.t === 'knock' && o.gl === 'arch-dim-layer')) throw new Error('knock box not parsed with its guide');
      const doc = recDoc();
      _drawElevAnnOps(doc, { w: 200, h: 100, ops }, 0, 0, 200, 100);
      const ln = doc.calls.filter(c => c[0] === 'line');
      if (ln.length !== 2) throw new Error(ln.length + ' pieces');
      if (Math.abs(ln[0][3] - 90) > 0.01 || Math.abs(ln[1][1] - 110) > 0.01) throw new Error('cut in the wrong place');
      if (doc.calls.some(c => c[0] === 'rect')) throw new Error('the knock box was drawn');
    });
    window.__knockTest = (async () => {
      const out = [];
      try {
        const ops = _elevAnnOps(svg(LEADER + KNOCK));
        const cap = { allGuides: true, dataUrl: 'data:image/jpeg;base64,x', w: 200, h: 100, vec: { w: 200, h: 100, ops }, boxes: { wall: [0, 0, 200, 100] }, pad: { left: 0, safe: 0 } };
        const keepVis = _elevGuideVis;
        _elevGuideVis = () => ({ 'arch-dim-layer': true, 'custom-lines-layer': true });
        let view;
        try { view = await _capView(cap, ['arch-dim-layer']); } finally { _elevGuideVis = keepVis; }
        const doc = recDoc();
        _drawElevAnnOps(doc, view.vec, 0, 0, 200, 100);
        const ln = doc.calls.filter(c => c[0] === 'line');
        if (ln.length !== 1 || Math.abs(ln[0][3] - 200) > 0.01) throw new Error('the leader has a hole: ' + ln.length + ' pieces');
        out.push({ label: 'EXACT ASK: a number from a guide hidden on the page leaves no hole in the leader', ok: true });
      } catch (e) { out.push({ label: 'EXACT ASK: a number from a guide hidden on the page leaves no hole in the leader', ok: false, err: e.message }); }
      return out;
    })();
    __check('a page capture keeps its lines whole and carries the number boxes; a download is still cut', () => {
      const S = window.__SRC;
      const fn = S.slice(S.indexOf('async function exportElevSVG('), S.indexOf('// Context blocks join the back layer LAST', S.indexOf('async function exportElevSVG(')));
      if (fn.indexOf('const _capKnock = _knock && !!(opts && opts.forCapture)') < 0) throw new Error('capture flag gone');
      if (fn.indexOf('if (_capKnock) frontLayer.push(') < 0) throw new Error('no knock markers in the capture');
      if (fn.indexOf('if (_knock && !_capKnock && _knockBoxes.length)') < 0) throw new Error('capture still cut at export');
    });
  `;
  window.__SRC = src;
  try { window.eval(src + '\n' + testBlock); } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const extra = await window.__knockTest;
  const all = (window.__testResults || []).concat(extra || []);
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
