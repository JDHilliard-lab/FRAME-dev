// 20.71: typing a footer field on Deck Studio's Project tab redraws that tab's page preview (it
// stood still until Refresh preview), including the tab's own Project Name field.
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
      await new Promise(r => setTimeout(r, 900));   // the late attach
      let n = 0; _dsRenderCoverPreview = async () => { n++; }; _dsIsOpen = () => true; _dsRenderCenter = () => {}; _dsRenderRail = () => {};
      const out = [];
      for (const id of ['specPdfProjName', 'specPdfCode', 'specPdfLocation', 'specPdfVersion']) {
        _dsActiveTab = 'project'; n = 0;
        const el = document.getElementById(id); el.value = 'X'; el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 300));
        out.push({ id: id, ok: n === 1, n: n });
      }
      _dsActiveTab = 'pages'; n = 0;
      document.getElementById('specPdfCode').dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      out.push({ id: 'pages tab leaves the Project preview alone', ok: n === 0, n: n });
      return out;
    })();`);
  const res = await window.__t;
  res.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.id + ' redraws the Project preview once' + (r.ok ? '' : ' (n=' + r.n + ')')));
  const bad = res.filter(r => !r.ok);
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + res.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
