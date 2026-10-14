// 18.53: A PREVIEW FOOTER PRINTS THE PAGE NUMBER THE PDF WILL.
//
// The canvas previews (Deck Studio centre, rail, Project tab) passed pageNum: 1 for
// every page, so the cover and page 9 both said 1. The DOM footer used _dsIndex + 1,
// which on the Project tab is whatever page was last selected on the Pages tab (the
// cover preview said 7). Both now ask _deckPageNumFor(desc), which counts like
// _buildSpecPagePDF: deck order, with Frame Recommendations spanning its planned pages.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); }
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
  'window.__fx = {',
  '  pages: function () { _dsPages = _deckPageList(); return _dsPages; },',
  '  setIdx: function (i) { _dsIndex = i; },',
  '  setFrames: function (v) { _projFramesCache = v; },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
const doc = window.document;

(async () => {
  const pages = fx.pages();

  await check('the deck has enough pages to tell numbers apart', () => {
    if (pages.length < 5) throw new Error('only ' + pages.length + ' pages');
  });

  await check('each page numbers as its place in the deck (no Frame Recommendations span yet)', () => {
    fx.setFrames(null);
    pages.forEach((d, i) => {
      const n = window._deckPageNumFor(d);
      if (n !== i + 1) throw new Error('page ' + (i + 1) + ' (' + window._deckPageKey(d) + ') numbers as ' + n);
    });
  });

  await check('Frame Recommendations spanning three pages pushes every later page by two', () => {
    const fr = pages.findIndex(d => d.kind === 'card' && d.type === 'frameRec');
    if (fr < 0) throw new Error('starter deck has no Frame Recommendations page');
    if (fr === pages.length - 1) throw new Error('Frame Recommendations is the last page; nothing after it to check');
    const real = window._frameRecPlanPages;
    window._frameRecPlanPages = () => [1, 2, 3];
    fx.setFrames([]);
    try {
      if (window._deckPageNumFor(pages[fr]) !== fr + 1) throw new Error('the Frame Recommendations page itself moved');
      const after = pages[fr + 1];
      const n = window._deckPageNumFor(after);
      if (n !== fr + 4) throw new Error('page after it numbers ' + n + ', want ' + (fr + 4));
    } finally { window._frameRecPlanPages = real; fx.setFrames(null); }
  });

  await check('EXACT BUG: the canvas preview passes the real number, not 1', async () => {
    const target = pages.findIndex((d, i) => i >= 3 && d.kind !== 'spec');
    if (target < 0) throw new Error('no non-spec page past the third');
    let got = null;
    const real = window._drawDeckPage;
    window._drawDeckPage = async (doc_, desc, env) => { got = env.pageNum; return false; };
    try { await window.renderDeckPageCanvas(pages[target]); }
    finally { window._drawDeckPage = real; }
    if (got !== target + 1) throw new Error('preview drew page ' + (target + 1) + ' with footer number ' + got);
  });

  await check('EXACT BUG: the DOM footer ignores which page the Pages tab last had selected', () => {
    fx.setIdx(6);   // the Project tab cover preview read 7
    const holder = doc.createElement('div'); doc.body.appendChild(holder);
    window._dsAddFooter(holder, 936, 540, pages[0]);
    const spans = holder.querySelectorAll('span');
    const nums = Array.prototype.filter.call(spans, s => /^[0-9]+$/.test((s.textContent || '').trim()));
    if (!nums.length) throw new Error('no page number in the DOM footer');
    if (nums[0].textContent.trim() !== '1') throw new Error('cover footer says ' + nums[0].textContent);
  });

  await check('a page that is not in the deck (template demo) says 1', () => {
    if (window._deckPageNumFor({ kind: 'spec', title: 'nope', _tplSwatch: true }) !== 1) throw new Error('swatch not 1');
    if (window._deckPageNumFor({ kind: 'layout', page: { id: 'not-a-page' } }) !== 1) throw new Error('unknown page not 1');
    if (window._deckPageNumFor(null) !== 1) throw new Error('null not 1');
  });

  await check('no preview renderer hard-codes pageNum: 1 any more', () => {
    const a = APP.indexOf('async function renderSpecPageCanvas(');
    const b = APP.indexOf('function _dsThumbCacheKey(', a);
    if (a < 0 || b < 0) throw new Error('renderer landmarks missing');
    if (APP.slice(a, b).indexOf('pageNum: 1,') >= 0) throw new Error('a renderer still passes pageNum: 1');
  });

  const failed = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'PASS: ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)));
  if (failed.length) { console.log(failed.length + ' FAILURE' + (failed.length > 1 ? 'S' : '')); process.exit(1); }
  console.log('ALL PASSED (' + results.length + ')');
  process.exit(0);
})();
