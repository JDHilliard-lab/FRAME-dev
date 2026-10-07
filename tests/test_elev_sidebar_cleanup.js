// ELEVATIONS SIDEBAR CLEANUP (17.84). Four reports from the same panel:
//
//  - "if I hit the WF wall button I could not delete it and same with EGD wall":
//    the wall-mode pair behaved as a radio, so a lit EGD did nothing when clicked and
//    WF (derived from the glass) had no way off at all. A lit type now turns OFF when
//    clicked again, ART is what is left, and ART is lit only for a plain wall.
//  - PNG / SVG / ALL PNG / ALL SVG were four buttons on the zoom row; they are one
//    EXPORT menu.
//  - sixteen bare icons in three unlabelled rows: now three foldable groups with a
//    caption under every icon.
//  - "The Art, context, glass buttons are not staying within the border of the other
//    buttons": the tab strip ran edge to edge while everything above stopped 20px in.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
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
window.eval(APP + NL + [
  '_autosaveToldUser = true;',
  'window.__fx = {',
  '  get elevs() { return elevations; }, set elevs(v) { elevations = v; },',
  '  setIdx: function (i) { currentElevIndex = i; },',
  '  mode: setElevWallMode, wf: toggleWfWall, sync: function () { initElevControls(); syncLayoutGuideButtonStates(); },',
  '  undo: undo, push: pushHistory,',
  '  resetHistory: function () { undoStack.length = 0; redoStack.length = 0; _isFirstHistoryPush = true; },',
  '  helpInit: _helpDotInit, guidesInit: _elevGuideGroupsInit,',
  '};',
].join(NL));
console.error = quiet;
const fx = window.__fx;
const doc = window.document;

// Answer every confirm with Yes, and record the question.
let asked = null;
window.showConfirmModal = function (title, body, yes, no, onYes) { asked = { title, body }; if (onYes) onYes(); };

const plain = () => ({ id: 'w1', name: 'Lobby', wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [] });
const setup = (e) => { fx.elevs = [e]; fx.setIdx(0); fx.resetHistory(); fx.push(); fx.sync(); asked = null; };
const lit = (id) => doc.getElementById(id).classList.contains('active');

check('EXACT BUG: a lit EGD wall turns OFF when clicked again', () => {
  setup(plain());
  fx.mode('egd');
  if (!fx.elevs[0].egdWall) throw new Error('EGD did not turn on');
  if (!lit('egdWallBtn') || lit('artWallBtn')) throw new Error('EGD on but the buttons do not say so');
  fx.mode('egd');
  if (fx.elevs[0].egdWall) throw new Error('clicking a lit EGD left it on');
  if (!lit('artWallBtn') || lit('egdWallBtn')) throw new Error('ART did not come back as the lit default');
});

check('ART turns EGD off too', () => {
  setup(Object.assign(plain(), { egdWall: true }));
  fx.mode('art');
  if (fx.elevs[0].egdWall) throw new Error('ART did not turn EGD off');
});

check('EXACT BUG: a WF wall can be turned off, and it asks first because it removes the glass', () => {
  setup(plain());
  fx.wf();
  if (!fx.elevs[0].glazing || !fx.elevs[0].glazing.length) throw new Error('WF did not add glass');
  if (!lit('wfWallBtn')) throw new Error('WF button not lit with glass on the wall');
  if (lit('artWallBtn')) throw new Error('ART still lit on a WF wall, so the row claims two types at once');
  fx.wf();
  if (!asked) throw new Error('removing the glass did not ask');
  if (asked.body.indexOf('undo') < 0) throw new Error('the question does not say it can be undone');
  if (fx.elevs[0].glazing.length) throw new Error('WF stayed on after confirming');
  if (lit('wfWallBtn') || !lit('artWallBtn')) throw new Error('buttons did not return to a plain ART wall');
});

check('turning WF off is undoable', () => {
  setup(plain());
  fx.wf();
  fx.wf();
  fx.undo();
  if (!fx.elevs[0].glazing || !fx.elevs[0].glazing.length) throw new Error('undo did not bring the panels back');
});

check('ART on a glazed wall offers to remove the glass, and leaves it if declined', () => {
  setup(plain());
  fx.wf();
  const save = window.showConfirmModal;
  window.showConfirmModal = function (t, b) { asked = { title: t, body: b }; };   // Cancel
  fx.mode('art');
  window.showConfirmModal = save;
  if (!asked) throw new Error('ART on a glazed wall did not ask');
  if (!fx.elevs[0].glazing.length) throw new Error('declining still removed the glass');
});

check('a lit EGD/WF says how to turn it off, in its tooltip and with an x', () => {
  setup(Object.assign(plain(), { egdWall: true }));
  const b = doc.getElementById('egdWallBtn');
  if (b.title.indexOf('turn it off') < 0) throw new Error('lit EGD tooltip does not say it can be turned off');
  if (!b.querySelector('.wm-off')) throw new Error('no x mark on the EGD button');
  if (CSS.indexOf('.wall-mode-btn.active .wm-off { display: inline; }') < 0) throw new Error('the x is never shown when lit');
});

check('EXPORT is one menu with the four choices, each wired to the real exporter', () => {
  ['onclick="exportElevPNG()"', 'onclick="exportElevSVG()"', "bulkExportElevations('png')\"", "bulkExportElevations('svg')\""].forEach(k => {
    if (HTML.indexOf(k) >= 0) throw new Error('a separate export button survived: ' + k);
  });
  const btn = doc.getElementById('elevExportBtn');
  if (!btn) throw new Error('no export button');
  const called = [];
  window.exportElevPNG = () => called.push('png');
  window.exportElevSVG = () => called.push('svg');
  window.bulkExportElevations = (f) => called.push('all-' + f);
  for (let i = 0; i < 4; i++) {
    window.openElevExportMenu(btn);
    const items = doc.querySelectorAll('.frame-menu button');
    if (items.length !== 4) throw new Error('menu has ' + items.length + ' items, want 4');
    items[i].click();
    if (doc.querySelector('.frame-menu')) throw new Error('menu stayed open after a choice');
  }
  if (called.join(',') !== 'png,svg,all-png,all-svg') throw new Error('menu items call: ' + called.join(','));
});

check('layout guides are three foldable groups and every one of the 16 buttons has a caption', () => {
  const groups = doc.querySelectorAll('#elev-sec-layout details.lg-group');
  if (groups.length !== 3) throw new Error(groups.length + ' groups');
  const ids = ['labelToggle', 'odToggle', 'dimToggle', 'personToggle', 'guideToggle', 'gridToggle', 'frameCenterToggle',
    'wallDimToggle', 'groupBoxToggle', 'edgeGapToggle', 'autoSpacingToggle', 'unitSuffixToggle', 'customLinesToggle',
    'artworkToggle', 'imageCodeToggle', 'spacingEQToggle'];
  ids.forEach(id => {
    const b = doc.getElementById(id);
    if (!b) throw new Error(id + ' is missing');
    if (!b.closest('details.lg-group')) throw new Error(id + ' is outside the groups');
    const c = b.querySelector('.lg-cap');
    if (!c || !c.textContent.trim()) throw new Error(id + ' has no caption');
    if (!b.title) throw new Error(id + ' lost its tooltip');
  });
  if (CSS.indexOf('.lg-captioned .layout-guide-btn {') < 0) throw new Error('captioned buttons never get a font size back (base is font-size:0)');
});

check('a folded guide group stays folded on the next load', () => {
  const d = doc.querySelector('details.lg-group[data-lg="labels"]');
  fx.guidesInit();
  d.open = false;
  d.dispatchEvent(new window.Event('toggle'));
  const st = JSON.parse(window.localStorage.getItem('frame_elev_guide_groups') || '{}');
  if (st.labels !== false) throw new Error('fold state was not saved');
});

check('EXACT BUG: the Art/Context/Glass strip is inset to the same 20px column as the panel', () => {
  if (CSS.indexOf('.elev-tabs { margin: 8px 20px 6px; }') < 0) throw new Error('tab strip is not inset');
  if (CSS.indexOf('.elev-sidebar-header { padding: 12px 20px;') < 0) throw new Error('the header column it aligns to moved');
});

check('the ? dot opens a popup on click and closes on a second click', () => {
  fx.helpInit();
  const d = doc.querySelector('.help-dot[data-help]');
  if (!d) throw new Error('no static help dot');
  d.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const pop = doc.querySelector('.help-pop');
  if (!pop || pop.textContent.indexOf('ART wall') < 0) throw new Error('popup did not open with the text');
  d.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  if (doc.querySelector('.help-pop')) throw new Error('second click did not close it');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
console.log(NL + '--- Summary ---');
if (failed.length) console.log(failed.length + ' FAILURES');
else console.log('ALL PASSED (' + results.length + ')');
