// 20.77: a page added with + ("New Page") takes the name of the template applied to it, so
// the rail says Keywords. A page with its own name keeps it.
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
      try { openDeckStudio('pages'); } catch (e) {}
      IDML_MASTER_TEMPLATES.push({ name: 'Keywords', type: 'keyword', elements: [{ type: 'text', x: 0.1, y: 0.3, w: 0.8, text: 'KEYWORD / KEYWORD' }] });
      const mi = IDML_MASTER_TEMPLATES.length - 1;
      _dsQuickAddBlankPage(_deckPageKey(_dsPages[0]));
      const pg = editorialContent.layoutPages[editorialContent.layoutPages.length - 1];
      out.push({ id: 'a + page starts as New Page', ok: pg.title === 'New Page', d: pg.title });
      await _dsApplyTemplateToCurrentPage({ source: 'master', mi: mi, name: 'Keywords' });
      out.push({ id: 'applying Keywords names it Keywords', ok: pg.title === 'Keywords', d: pg.title });
      pg.title = 'Our Words'; pg.elements = [];
      await _dsApplyTemplateToCurrentPage({ source: 'master', mi: mi, name: 'Keywords' });
      out.push({ id: 'a page with its own name keeps it', ok: pg.title === 'Our Words', d: pg.title });
      return out;
    })();`);
  const res = await window.__t;
  res.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.id + (r.ok ? '' : ' (' + r.d + ')')));
  const bad = res.filter(r => !r.ok);
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + res.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
