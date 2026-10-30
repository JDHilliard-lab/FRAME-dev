// 18.52: THE FRAME DASHBOARD TOOLBAR IS THREE BUTTONS AND THREE MENUS.
//
// It was thirteen equal-weight buttons in two rows, so + Add Item (the one you use
// most) looked like Export Database. Now: + Add Item (primary), Duplicate, Delete, an
// Edit menu (Move To, Bulk Edit, Duplicate as Series, Item codes) on the left, and
// Import (Import CSV, Bulk Images) and Export (Export Database, Batch PNGs, InDesign
// Script) on the right. Nothing was removed: every old action must still be one menu
// away, and each menu item must call the function its button used to call.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message + (process.env.DBG ? e.stack : '') }); }
};

const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;
const quiet = console.error; console.error = () => {};
window.eval(APP + NL + '_autosaveToldUser = true;');
console.error = quiet;
const doc = window.document;

// The toolbar row: the pane header that holds + Add Item.
const addBtn = doc.querySelector('button[onclick="addDashRow()"]');
const bar = addBtn && addBtn.closest('.pane-header');

check('EXACT BUG: the toolbar is six controls, not thirteen', () => {
  if (!bar) throw new Error('toolbar not found');
  const btns = bar.querySelectorAll('button');
  if (btns.length !== 6) throw new Error(btns.length + ' buttons in the toolbar, want 6');
});

check('+ Add Item is the primary button (not btn-secondary)', () => {
  if (addBtn.classList.contains('btn-secondary')) throw new Error('+ Add Item is styled like every other button');
  if (!addBtn.classList.contains('action-btn')) throw new Error('+ Add Item lost .action-btn');
});

check('the three menu buttons exist and say they open a menu', () => {
  ['dashEditMenuBtn', 'dashImportMenuBtn', 'dashExportMenuBtn'].forEach(id => {
    const b = doc.getElementById(id);
    if (!b) throw new Error('#' + id + ' missing');
    if (!bar.contains(b)) throw new Error('#' + id + ' is not in the toolbar');
    if (b.getAttribute('aria-haspopup') !== 'menu') throw new Error('#' + id + ' has no aria-haspopup');
  });
});

check('the CSV file input is still in the page (Import CSV clicks it)', () => {
  const f = doc.getElementById('csvImport');
  if (!f || f.type !== 'file') throw new Error('#csvImport missing');
  if ((f.getAttribute('onchange') || '').indexOf('importDashCSV') < 0) throw new Error('#csvImport no longer imports');
});

// Each menu item must call the function its old button called. Stub them, click.
const EXPECT = {
  edit: [['Move To', 'openMoveToModal'], ['Bulk Edit', 'openBulkEditModal'], ['Duplicate as Series', 'openDuplicateSeriesModal'], ['Item codes', '_jumpToCodes'], ['Links', 'openLinksPanel'], ['Frame & mat samples', 'openProduction']],   // 19.74 added Links; 19.87 samples
  // 19.26: New items from photos joins Import (a new action goes in a menu, not a button).
  import: [['Import CSV', null], ['Bulk Images', 'openBulkReplaceModal'], ['New items from photos', 'dashNewFromPhotos']],
  export: [['Export Database', 'exportDashCSV'], ['Batch PNGs', 'batchDownloadAllFrames'], ['InDesign Script', 'downloadInDesignScript'], ['Production pack', 'openProduction'], ['Prices & budget', 'openProduction']],   // 19.89 production pack; 19.91 prices
};
const BTN = { edit: 'dashEditMenuBtn', import: 'dashImportMenuBtn', export: 'dashExportMenuBtn' };

Object.keys(EXPECT).forEach(which => {
  check('the ' + which + ' menu lists its items and each calls the old function', () => {
    EXPECT[which].forEach((pair, i) => {
      const [label, fnName] = pair;
      let called = false;
      let restore = null;
      if (fnName) {
        const orig = window[fnName];
        if (typeof orig !== 'function') throw new Error(fnName + ' is not a global function');
        window[fnName] = () => { called = true; };
        restore = () => { window[fnName] = orig; };
      } else {
        // Import CSV: clicks the hidden file input.
        const f = doc.getElementById('csvImport');
        f.click = () => { called = true; };
        restore = () => { delete f.click; };
      }
      try {
        const old = doc.querySelector('.frame-menu'); if (old && old._close) old._close();
        window.openDashMenu(doc.getElementById(BTN[which]), which);
        const items = doc.querySelectorAll('.frame-menu button');
        if (items.length !== EXPECT[which].length) throw new Error(which + ' menu has ' + items.length + ' items, want ' + EXPECT[which].length);
        const it = items[i];
        if (it.textContent.indexOf(label) < 0) throw new Error('item ' + i + ' is "' + it.textContent + '", want ' + label);
        it.click();
        if (!called) throw new Error(label + ' did not call ' + (fnName || 'the CSV file input'));
        if (doc.querySelector('.frame-menu')) throw new Error('menu stayed open after ' + label);
      } finally { restore(); }
    });
  });
});

check('every action the old toolbar had is still reachable (button or menu)', () => {
  const S = APP.slice(APP.indexOf('function openDashMenu('), APP.indexOf('// How frames are drawn in THIS SVG export'));
  const H = bar.innerHTML;
  ['addDashRow()', 'duplicateDashRow()', 'deleteDashRow()', 'openMoveToModal()', '_jumpToCodes()', 'openBulkEditModal()',
    'openDuplicateSeriesModal()', 'csvImport', 'exportDashCSV()', 'openBulkReplaceModal()', 'batchDownloadAllFrames()',
    'downloadInDesignScript()'].forEach(k => {
    if (H.indexOf(k) < 0 && S.indexOf(k) < 0) throw new Error(k + ' is no longer reachable from the toolbar');
  });
});

check('an unknown menu name opens nothing', () => {
  const old = doc.querySelector('.frame-menu'); if (old && old._close) old._close();
  const r = window.openDashMenu(addBtn, 'nope');
  if (r !== null || doc.querySelector('.frame-menu')) throw new Error('opened a menu for an unknown name');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS: ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)));
if (failed.length) { console.log(failed.length + ' FAILURE' + (failed.length > 1 ? 'S' : '')); process.exit(1); }
console.log('ALL PASSED (' + results.length + ')');
process.exit(0);
