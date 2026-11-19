// 20.76: opening Deck Studio's Project tab redraws its page preview, so an edit made on the
// Pages tab (a retyped cover heading) shows there; it stood still until Refresh preview.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  window.eval(src + `
    _autosaveToldUser = true; scheduleAutosave = () => {};
    window.__t = (async () => {
      const out = [];
      let n = 0; const real = _dsRenderCoverPreview; _dsRenderCoverPreview = async () => { n++; };
      try { openDeckStudio('pages'); } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
      n = 0;
      try { _dsTab('project'); } catch (e) { out.push({ id: 'tab threw ' + e.message, ok: false }); }
      out.push({ id: 'opening the Project tab redraws its preview', ok: n >= 1, n: n });
      _dsRenderCoverPreview = real;
      return out;
    })();`);
  const res = await window.__t;
  res.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.id + (r.ok ? '' : ' (n=' + r.n + ')')));
  const bad = res.filter(r => !r.ok);
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + res.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
