// 19.50, "I have sometimes tried to hit the refresh button but hit a - or + button and
// duplicated or removed a page from the deck". The rail's pinned filter bar sat at z 5 and
// each page's side + / - buttons at z 7, so they scrolled OVER the bar and took its clicks
// (in Chrome, 535 of 9858 sampled clicks on the rebuild button landed on a page's -).
// The bar now outranks everything rendered inside the rail.
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
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _autosaveToldUser = true; scheduleAutosave = () => {}; pushHistory = () => {};
    __check('EXACT BUG: the rail bar is above every control inside the rail', () => {
      // A deck with inserted layout pages, so cells carry their side + / - buttons.
      editorialContent.layoutPages = (editorialContent.layoutPages || []).concat([{ id: 'pgA', type: 'moodboard', title: 'Mood A', elements: [] }, { id: 'pgB', type: 'moodboard', title: 'Mood B', elements: [] }]);
      _dsPages = _deckPageList();
      _dsRenderRail();
      const bar = document.getElementById('dsRailBar');
      if (!bar) throw new Error('no rail bar');
      const barZ = parseInt(bar.style.zIndex, 10);
      const rail = bar.parentElement;
      let maxZ = -Infinity, who = '';
      rail.querySelectorAll('*').forEach(el => {
        if (bar.contains(el)) return;
        // A z inside an isolated or transformed wrapper stacks within it, not against the bar
        // (the selected page's mirrored copy carries the centre's own chrome).
        for (let p = el.parentElement; p && p !== rail; p = p.parentElement) {
          const st = p.getAttribute('style') || '';
          if (st.indexOf('isolation:isolate') >= 0 || st.indexOf('isolation: isolate') >= 0 || /transform:\\s*scale/.test(st)) return;
        }
        const z = parseInt(el.style.zIndex, 10);
        if (!isNaN(z) && z > maxZ) { maxZ = z; who = (el.textContent || el.tagName).slice(0, 10); }
      });
      if (maxZ === -Infinity) throw new Error('fixture: no stacked controls rendered in the rail');
      if (!(barZ > maxZ)) throw new Error('bar z ' + barZ + ' is not above a rail control at z ' + maxZ + ' (' + who + ')');
    });
  `;
  try { window.eval(src + '\n' + testBlock); } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const bad = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + all.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
