// 18.38: Deck Studio's page tools and selection actions live in the tool dock.
// They sat in a row above the page thumbnails, where they got lost ("the guides
// button... preview, preflight, trashcan... they currently are above the page
// thumbnails, and I feel like they get lost"). Front / back / delete in the dock act
// on whatever is selected: a page note OR a layout-page box, which each used to have
// their own buttons in two places.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _autosaveToldUser = true;
    const dock = document.getElementById('dsToolDock');
    __check('EXACT ASK: Guides, Preview and Preflight are in the dock, not the row above the thumbnails', () => {
      ['dsMbGuides', 'dsBuildBtn', 'dsPreflightBtn', 'dsMbLayers'].forEach(id => {
        const b = document.getElementById(id);
        if (!b || !dock.contains(b)) throw new Error(id + ' is not in the dock');
        if (!b.classList.contains('ds-dock-btn')) throw new Error(id + ' does not look like a dock button');
      });
    });
    __check('...and so are settings, front, back and delete', () => {
      ['dsSelSettings', 'dsAnnFront', 'dsAnnBack', 'dsAnnDelete'].forEach(id => { if (!dock.contains(document.getElementById(id))) throw new Error(id + ' is not in the dock'); });
      const row = document.getElementById('dsToolbar');
      ['dsMbGuides', 'dsBuildBtn', 'dsPreflightBtn', 'dsAnnDelete'].forEach(id => { if (row.contains(document.getElementById(id)) && !document.getElementById('dsDockTopSlot').contains(dock)) throw new Error(id + ' is still in the row'); });
    });
    __check('there is ONE delete, ONE bring-to-front and ONE send-to-back in the deck toolbars', () => {
      // Deck Studio only: the full-screen layout editor (#moodboardModal) is its own tool.
      const deck = document.getElementById('view-deck');
      ['_mbToFront()', '_mbToBack()', '_mbDelete()'].forEach(fn => { if (deck.querySelector('[onclick="' + fn + '"]')) throw new Error('a second Deck Studio button still calls ' + fn); });
    });
    __check('front / back / delete route to a layout box when one is selected, else to the page note', () => {
      const calls = [];
      _mbToFront = () => calls.push('mbFront'); _mbToBack = () => calls.push('mbBack'); _mbDelete = () => calls.push('mbDel');
      _dsAnnToFront = () => calls.push('annFront'); _dsAnnToBack = () => calls.push('annBack'); _dsDeleteAnnot = () => calls.push('annDel');
      _mbSelected = 2; _mbSel = [];
      _dsSelToFront(); _dsSelToBack(); _dsSelDelete();
      _mbSelected = -1; _mbSel = [];
      _dsSelToFront(); _dsSelToBack(); _dsSelDelete();
      _mbSel = [0, 1];
      _dsSelDelete();
      _mbSel = [];
      if (calls.join(',') !== 'mbFront,mbBack,mbDel,annFront,annBack,annDel,mbDel') throw new Error('routed ' + calls.join(','));
    });
  `;
  try { window.eval('window.__html = ' + JSON.stringify(html) + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
