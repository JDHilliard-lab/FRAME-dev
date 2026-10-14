// 18.51: LAYOUT GUIDES IS A TAB, AND THE TABS SIT UNDER THE WALL SIZE.
//
// The guides (three open groups, 16 captioned buttons, two wide buttons) lived in the
// sidebar HEADER, above the Art / Context / Glass strip. The header does not scroll, so
// it was ~550px tall and the frame list, the part of the panel you actually work in,
// started near the bottom of a laptop screen. The guides now have their own Guides tab,
// the strip sits directly under the wall size and type, and the Art pane (Add & Arrange
// plus the frame list) gets the height.
// The catalogue layout-name row was inside the guides block but is about the WALL, so
// it moved into the wall section rather than into the tab.
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
  'window.__fx = { tab: switchElevTab, get cur() { return _elevSidebarTab; }, tour: FRAME_TOUR };',
].join(NL));
console.error = quiet;
const fx = window.__fx;
const doc = window.document;

const GUIDE_IDS = ['labelToggle', 'odToggle', 'dimToggle', 'personToggle', 'guideToggle', 'gridToggle', 'frameCenterToggle',
  'wallDimToggle', 'groupBoxToggle', 'edgeGapToggle', 'autoSpacingToggle', 'unitSuffixToggle', 'customLinesToggle',
  'artworkToggle', 'imageCodeToggle', 'spacingEQToggle', 'wireframeToggle', 'allGuidesToggle', 'resetDimPosBtn'];

check('EXACT BUG: the sidebar header no longer holds the layout guides', () => {
  const hdr = doc.querySelector('.elev-sidebar-header');
  if (!hdr) throw new Error('no sidebar header');
  if (hdr.querySelector('#elev-sec-layout')) throw new Error('#elev-sec-layout is back in the header');
  GUIDE_IDS.forEach(id => { if (hdr.querySelector('#' + id)) throw new Error('#' + id + ' is in the header'); });
});

check('every guide control lives in the Guides pane', () => {
  const pane = doc.querySelector('.elev-tabpane[data-elevtabpane="guides"]');
  if (!pane) throw new Error('no guides pane');
  if (!pane.querySelector('#elev-sec-layout')) throw new Error('#elev-sec-layout is not in the guides pane (the tour targets it)');
  GUIDE_IDS.forEach(id => {
    const el = doc.getElementById(id);
    if (!el) throw new Error('#' + id + ' is missing');
    if (!pane.contains(el)) throw new Error('#' + id + ' is outside the guides pane');
  });
  if (pane.querySelectorAll('details.lg-group').length !== 3) throw new Error('the three guide groups did not all move');
});

check('the tab strip follows the header directly, and its order is Art, Guides, Context, Glass', () => {
  const sb = doc.querySelector('.elev-sidebar');
  const kids = Array.prototype.slice.call(sb.children);
  const h = kids.indexOf(doc.querySelector('.elev-sidebar-header'));
  const t = kids.indexOf(doc.querySelector('.elev-tabs'));
  if (h < 0 || t !== h + 1) throw new Error('tab strip is not right under the header');
  const order = Array.prototype.map.call(doc.querySelectorAll('.elev-tabs [data-elevtab]'), b => b.getAttribute('data-elevtab')).join(',');
  if (order !== 'art,guides,context,glass') throw new Error('tab order is ' + order);
});

check('the catalogue layout-name row stayed with the wall, not the guides', () => {
  ['catLayoutRow', 'catLayoutLabel', 'catMasterHint'].forEach(id => {
    const el = doc.getElementById(id);
    if (!el) throw new Error('#' + id + ' is missing');
    if (!el.closest('#elev-sec-wall')) throw new Error('#' + id + ' is not in the wall section');
  });
});

check('switching to Guides shows only the guides pane, and Art brings the frame list back', () => {
  fx.tab('guides');
  if (fx.cur !== 'guides') throw new Error('switchElevTab refused guides (fell back to ' + fx.cur + ')');
  const shown = (k) => Array.prototype.every.call(doc.querySelectorAll('[data-elevtabpane="' + k + '"]'), el => el.style.display === '');
  const hidden = (k) => Array.prototype.every.call(doc.querySelectorAll('[data-elevtabpane="' + k + '"]'), el => el.style.display === 'none');
  if (!shown('guides') || !hidden('art') || !hidden('context') || !hidden('glass')) throw new Error('wrong panes visible on Guides');
  if (!doc.querySelector('[data-elevtab="guides"]').classList.contains('active')) throw new Error('Guides tab not lit');
  fx.tab('art');
  if (!shown('art') || !hidden('guides')) throw new Error('Art did not bring the frame list back');
  if (!doc.querySelector('.elev-frame-list').closest('.elev-sidebar') || doc.querySelector('.elev-frame-list').style.display !== '') throw new Error('frame list hidden on Art');
});

check('the guides pane scrolls inside the sidebar like Context and Glass', () => {
  const i = CSS.indexOf('.elev-tabpane[data-elevtabpane="guides"],');
  const j = CSS.indexOf('overflow-y: auto', i);
  if (i < 0 || j < 0 || j - i > 200) throw new Error('guides pane is not in the scrolling pane rule');
});

check('the tour step for Layout guides opens the Guides tab', () => {
  const st = fx.tour.filter(s => s.target === '#elev-sec-layout')[0];
  if (!st) throw new Error('no tour step targets #elev-sec-layout');
  if (String(st.prep).indexOf("'guides'") < 0) throw new Error('tour step does not open the Guides tab');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS: ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)));
if (failed.length) { console.log(failed.length + ' FAILURE' + (failed.length > 1 ? 'S' : '')); process.exit(1); }
console.log('ALL PASSED (' + results.length + ')');
process.exit(0);
