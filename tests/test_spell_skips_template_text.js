// 20.79: Preflight's spelling check skips text still as the template wrote it (the starter
// deck's filler), so a new project shows no "possible misspellings"; a real typo still shows.
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
    window.__t = (() => {
      const out = [];
      const fresh = _dsRunSpellCheck();
      out.push({ id: 'a new project has no spelling rows from the starter filler', ok: fresh.length === 0, d: fresh.map(i => i.text.slice(0, 60)).join(' / ') });
      const pg = editorialContent.understandingPage || {};
      const body = (pg.elements || []).find(e => e.type === 'text' && e.text && e.text.length > 100);
      out.push({ id: 'the Understanding page has its filler body', ok: !!body });
      if (body) body.text = 'Our client wants a calm lobbby with local artists.';
      const after = _dsRunSpellCheck();
      out.push({ id: 'an edited paragraph with a typo is still flagged', ok: after.some(i => (i.words || []).indexOf('lobbby') >= 0), d: after.map(i => i.text.slice(0, 80)).join(' / ') });
      return out;
    })();`);
  const res = window.__t;
  res.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.id + (r.ok ? '' : ' (' + r.d + ')')));
  const bad = res.filter(r => !r.ok);
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + res.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
