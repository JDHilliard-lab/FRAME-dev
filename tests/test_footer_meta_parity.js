// The spec-page PREVIEW prints the same footer as the PDF (18.15). Its renderer built
// the footer from the piece's own code and location ("LOBBY | ART.3A"), while the PDF
// export hands every page the deck's document code from the Project tab. So the preview
// showed a footer that never printed, and a group page titled ART.3 said ART.3A.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // A canvas context that answers ANY call: the per-piece page reaches far more of the 2D
  // API than the group page, and a hand-listed stub fails on the first method it forgot.
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => {
    if (k in t) return t[k];
    // NOT thenable: answering 'then' makes every await on a context hang forever.
    if (k === 'then' || typeof k === 'symbol') return undefined;
    if (k === 'measureText') return (str) => ({ width: String(str || '').length * 6 });
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
    return () => {};
  } });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.Path2D = function () { return new Proxy({}, { get: (t, k) => (k === 'then' || typeof k === 'symbol') ? undefined : () => {} }); };
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    window.__done = (async () => {
    const __check = async (label, fn) => { try { await fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _toast = function () { return null; };
    const seen = [];
    const realFooter = _drawPdfFooter;
    _drawPdfFooter = function (doc, logos, n, meta) { seen.push(meta); return realFooter.apply(this, arguments); };
    const row = (id) => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), { id: id, location: 'LOBBY', extW: 24, extH: 24 });
    dashProjectData = [row('ART.3A'), row('ART.3B')];
    document.getElementById('specPdfCode').value = 'HH-LOBBY-ART';
    document.getElementById('specPdfLocation').value = 'GROUND FLOOR';

    await __check('a per-piece spec page preview prints the deck document code, as the PDF does', async () => {
      seen.length = 0;
      const d = _deckPageList().find(x => x.kind === 'spec');
      await renderDeckPageCanvas(d, null, { scale: 0.5 });
      const m = seen[seen.length - 1];
      if (!m) throw new Error('no footer drawn');
      if (m.code !== 'HH-LOBBY-ART' || m.location !== 'GROUND FLOOR') throw new Error('preview footer meta ' + JSON.stringify(m));
    });

    await __check('there is one footer meta for previews, and it is the PDF one', () => {
      const S = window.__appSrc;
      if (S.indexOf("code: r.id || '', version: ''") >= 0) throw new Error('a preview still builds its footer from the piece id');
      if (S.split('const meta = _deckFooterMeta();').length - 1 < 2) throw new Error('not both preview renderers use _deckFooterMeta');
    });

    _drawPdfFooter = realFooter;
    })();
  `;

  try {
    window.__appSrc = src;
    window.eval(src + '\n' + testBlock);
    await window.__done;
  } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = window.__testResults || [];
  const failures = results.filter(r => !r.ok);
  results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' -> ' + r.err); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
