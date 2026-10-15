// 18.83: COPY AND PASTE BETWEEN TWO FRAME TABS.
//
// Ctrl+C in Deck Studio filled this tab's _dsClipboard only, so two projects open side
// by side could not share a layout. A copy is now posted on the 'frame-tabs'
// BroadcastChannel and becomes the other tabs' clipboard; pasting there lands it at the
// same place on the page. (Checked for real in Chrome with two FRAME frames; jsdom has
// no BroadcastChannel, so the channel is stubbed here.)
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'templates.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const noop = () => ctx2d;
  const ctx2d = new Proxy({}, { get: (t, k) => {
    if (k === 'measureText') return () => ({ width: 0 });
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, (w | 0) * (h | 0) * 4)), width: w, height: h });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: () => {} });
    if (k === 'canvas') return undefined;
    return k in t ? t[k] : noop;
  }, set: (t, k, v) => { t[k] = v; return true; } });
  window.HTMLCanvasElement.prototype.getContext = () => ctx2d;
  const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  // A real tiny JPEG when one is asked for: jsdom would hand back PNG bytes labelled
  // JPEG, which jsPDF then stores raw, and the end-to-end check would be testing jsdom.
  const JPG1 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  window.HTMLCanvasElement.prototype.toDataURL = (t) => (/jpe?g/.test(t || '') ? JPG1 : PNG1);
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator; global.self = window;
  window.jspdf = { jsPDF: require(path.join(root, 'lib-jspdf.min.js')).jsPDF };

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    window.__run = (async () => {
      scheduleAutosave = () => {}; pushHistory = () => {}; _autosaveToldUser = true;
      const sent = [];
      _tabChannel = () => ({ postMessage: (m) => sent.push(JSON.parse(JSON.stringify(m))) });
      editorialContent.layoutPages = [{ id: 'pgA', type: 'custom', title: 'P', elements: [{ type: 'text', text: 'FROM A', x: 0.1, y: 0.3, w: 0.5, size: 0.05 }], afterKey: 'fixed:cover' }];
      _dsPages = _deckPageList(); _dsIndex = _dsPages.findIndex(d => _deckPageKey(d) === 'layout:pgA');
      _mbActiveCanvasId = 'dsLayoutCanvas'; _mbEditTarget = null;
      _mbPageIndex = 0; _mbSel = [0]; _mbSelected = 0; _mbSelAnn = [];
      const ok = _dsCopySelection();
      __check('a copy is sent to the other tabs', () => {
        if (!ok) throw new Error('nothing copied');
        const m = sent.find(x => x.t === 'clip');
        if (!m) throw new Error('no clip message posted');
        if (m.from !== _autosaveSession) throw new Error('not marked with this tab');
        if (!m.clip || !m.clip.items || m.clip.items[0].text !== 'FROM A') throw new Error('the copy is not in the message');
      });
      // The other tab: a different project, a different page.
      const msg = sent.find(x => x.t === 'clip');
      _dsClipboard = null;
      _tabOnMessage(Object.assign({}, msg, { from: 'other-tab' }));
      editorialContent.layoutPages = [{ id: 'pgB', type: 'custom', title: 'Q', elements: [], afterKey: 'fixed:cover' }];
      _dsPages = _deckPageList(); _dsIndex = _dsPages.findIndex(d => _deckPageKey(d) === 'layout:pgB'); _mbPageIndex = 0;
      const pasted = _dsPasteClipboard();
      __check('EXACT BUG: a copy from another tab pastes here, at the same place', () => {
        if (!pasted) throw new Error('paste refused');
        const el = editorialContent.layoutPages[0].elements[0];
        if (!el || el.text !== 'FROM A') throw new Error('nothing pasted');
        if (Math.abs(el.x - 0.1) > 1e-9 || Math.abs(el.y - 0.3) > 1e-9) throw new Error('moved: ' + el.x + ',' + el.y);
      });
      __check('a tab ignores its own copy coming back', () => {
        _dsClipboard = { kind: 'mb', items: [{ type: 'text', text: 'MINE' }], srcKey: 'layout:pgB' };
        _tabOnMessage(Object.assign({}, msg, { from: _autosaveSession }));
        if (_dsClipboard.items[0].text !== 'MINE') throw new Error('its own echo replaced the clipboard');
      });
      __check('no channel (an old browser) still copies within the tab', () => {
        _tabChannel = () => null;
        _mbSel = [0]; _mbSelected = 0;
        if (!_dsCopySelection()) throw new Error('copy failed without a channel');
      });
    })();
  `;

  try {
    window.eval(src + '\n' + testBlock);
    await window.__run;
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
