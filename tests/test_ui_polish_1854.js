// 18.54: SMALL THINGS THAT READ WRONG.
//  - The EQ guide tile's icon IS the letters EQ, and its caption said EQ again.
//  - Group / Edge gap / Lines fade when the wall has nothing to show, with no word on
//    why; faded read as broken. The tooltip now says how to make one (_lgAvail).
//  - The header said Load Project while the start screen says Open project.
//  - The project-code placeholder was another client's real job code.
//  - The first placement colour was red-orange, and the first row is selected on open,
//    so a new project's first piece looked like an error row.
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
const quiet = console.error; console.error = () => {}; const qlog = console.log; console.log = () => {};
window.eval(APP + NL + [
  '_autosaveToldUser = true;',
  'window.__fx = { palette: PLACEMENT_COLORS };',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
const doc = window.document;

check('EXACT BUG: the EQ tile caption is not just the icon again', () => {
  const b = doc.getElementById('spacingEQToggle');
  const cap = b && b.querySelector('.lg-cap');
  if (!cap) throw new Error('no caption');
  if (cap.textContent.trim() === 'EQ') throw new Error('caption repeats the icon');
});

check('EXACT BUG: a faded guide tile says why and how, and un-fading restores the plain tooltip', () => {
  const b = doc.getElementById('groupBoxToggle');
  window._lgAvail(b, false, 'do the thing.');
  // Boot has usually faded it already, so the plain tooltip is the stored base.
  const base = b.dataset.baseTitle;
  if (!base || base.indexOf('Nothing on this wall') >= 0) throw new Error('stored base tooltip is wrong: ' + base);
  if (b.style.opacity !== '0.4') throw new Error('not faded');
  if (b.getAttribute('aria-disabled') !== 'true') throw new Error('not aria-disabled');
  if (b.title.indexOf('Nothing on this wall yet: do the thing.') < 0) throw new Error('tooltip does not explain: ' + b.title);
  window._lgAvail(b, false, 'do the thing.');
  if (b.title.split('Nothing on this wall yet').length !== 2) throw new Error('the explanation stacked on a second sync');
  window._lgAvail(b, true, 'do the thing.');
  if (b.title !== base) throw new Error('tooltip not restored');
  if (b.hasAttribute('aria-disabled') || b.style.opacity !== '1') throw new Error('still marked unavailable');
});

check('all three conditional tiles go through _lgAvail with a how-to', () => {
  const s = APP.indexOf('function syncLayoutGuideButtonStates()');
  const e = APP.indexOf('// Image-code caption toggle', s);
  const body = APP.slice(s, e);
  ['_lgAvail(gbBtn', '_lgAvail(egBtn', '_lgAvail(clBtn'].forEach(k => { if (body.indexOf(k) < 0) throw new Error(k + ' missing'); });
  if (body.indexOf("style.opacity = exists ? '1' : '0.4'") >= 0) throw new Error('a tile still fades silently');
});

check('EXACT BUG: the header open button says Open Project, like the start screen', () => {
  const b = doc.querySelector('button[onclick="openMasterProject()"]');
  if (!b) throw new Error('no open button');
  if (b.textContent.trim() !== 'Open Project') throw new Error('header says ' + b.textContent.trim());
  if (HTML.indexOf('>Load Project<') >= 0) throw new Error('Load Project is back');
});

check('EXACT BUG: no real client code or city as a placeholder', () => {
  const c = doc.getElementById('specPdfCode'), l = doc.getElementById('specPdfLocation');
  if (/CAESARS/i.test(c.placeholder)) throw new Error('project code placeholder is a real job: ' + c.placeholder);
  if (/Las Vegas/i.test(l.placeholder)) throw new Error('location placeholder is a real city: ' + l.placeholder);
});

check('EXACT BUG: the first placement colour is not red', () => {
  const hex = fx.palette[0];
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0;
  if (mx !== mn) {
    if (mx === r) h = (60 * ((g - b) / (mx - mn)) + 360) % 360;
    else if (mx === g) h = 60 * ((b - r) / (mx - mn)) + 120;
    else h = 60 * ((r - g) / (mx - mn)) + 240;
  }
  if (h < 30 || h > 330) throw new Error('first placement colour ' + hex + ' has a red hue (' + Math.round(h) + ' deg)');
  if (new Set(fx.palette).size !== fx.palette.length) throw new Error('palette has a duplicate');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS: ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)));
if (failed.length) { console.log(failed.length + ' FAILURE' + (failed.length > 1 ? 'S' : '')); process.exit(1); }
console.log('ALL PASSED (' + results.length + ')');
process.exit(0);
