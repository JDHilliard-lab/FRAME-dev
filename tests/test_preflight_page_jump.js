// 20.79: Preflight's Page button opens the page on the Pages tab. With no tab named, Deck
// Studio opened on Project, so the page asked for was nowhere on screen.
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
      try { openDeckStudio('project'); } catch (e) {}
      await new Promise(r => setTimeout(r, 100));
      const pages = _deckPageList();
      const target = Math.min(2, pages.length - 1);
      _dsPreflightGo(target);
      const pagesBtn = document.getElementById('dsTabBtnPages'), projBtn = document.getElementById('dsTabBtnProject');
      out.push({ id: 'the Pages tab is the one showing', ok: !!(pagesBtn && pagesBtn.classList.contains('active')) && !(projBtn && projBtn.classList.contains('active')), d: (pagesBtn && pagesBtn.className) + ' / ' + (projBtn && projBtn.className) });
      out.push({ id: 'the page asked for is selected', ok: _dsIndex === target, d: _dsIndex });
      return out;
    })();`);
  const res = await window.__t;
  res.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.id + (r.ok ? '' : ' (' + r.d + ')')));
  const bad = res.filter(r => !r.ok);
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + res.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
