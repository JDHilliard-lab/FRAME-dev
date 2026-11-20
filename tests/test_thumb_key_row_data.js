// 20.77: a spec page's preview is keyed by its piece's data. The key held the page, template
// and ticks only, so a piece changed outside the dashboard (the scripting API) kept its old
// render: a black default frame and no art, shown again after a page move.
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
      const a = { id: 'ART.1A', fCode: 'MICH-132-29', artW: 16.5, artH: 16.5, product: 'Framed Art' };
      const b = { id: 'ART.1B', fCode: 'MICH-132-29', artW: 16.5, artH: 16.5, product: 'Framed Art' };
      dashProjectData = [a, b];
      const desc = { kind: 'spec', type: 'spec', title: 'ART.1A', row: a, members: [a, b], _ovKey: 'ART.1A' };
      const k1 = _dsThumbCacheKey(desc);
      a.fCode = 'FA-BW26031';
      const k2 = _dsThumbCacheKey(desc);
      out.push({ id: 'a new frame on the piece changes its page key', ok: k1 !== k2 });
      a.imageData = 'data:image/jpeg;base64,' + 'A'.repeat(5000);
      const k3 = _dsThumbCacheKey(desc);
      out.push({ id: 'adding the artwork changes its page key', ok: k3 !== k2 });
      out.push({ id: 'the key stays short with image data on the row', ok: k3.length < 300, n: k3.length });
      out.push({ id: 'the same data gives the same key (cache still hits)', ok: _dsThumbCacheKey(desc) === k3 });
      b.fCode = 'FA-BW26031';
      out.push({ id: 'a set member changing changes the set page key', ok: _dsThumbCacheKey(desc) !== k3 });
      const fr = { kind: 'card', type: 'frameRec' };
      const f1 = _dsThumbCacheKey(fr); b.fCode = 'MICH-132-29';
      out.push({ id: 'Frame Recommendations key follows the project frames', ok: _dsThumbCacheKey(fr) !== f1 });
      return out;
    })();`);
  const res = window.__t;
  res.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.id + (r.ok ? '' : ' (n=' + r.n + ')')));
  const bad = res.filter(r => !r.ok);
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + res.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
