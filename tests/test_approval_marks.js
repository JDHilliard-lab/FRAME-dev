// 20.08: APPROVAL MARKS. Sheraton Pentagon City approved pieces of a set one at a time,
// marked them on the page and left them alone while the rest were reselected; when colour
// stayed contested the page was stamped COLOR SAMPLE APPROVAL REQUIRED until physical
// strikes were approved. FRAME had page approval only. A set page marked PENDING now shows
// which pieces are approved (the pieces' own dashboard status), in the PDF and on screen,
// and the stamp list has the colour-sample stamp.
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
window.jspdf = require(path.join(root, 'lib-jspdf.min.js'));
const quiet = console.error; console.error = () => {}; const qlog = console.log; console.log = () => {};
window.eval(APP + NL + [
  '_autosaveToldUser = true;',
  'window.__fx = {',
  '  set: function (pageStatus, statuses) {',
  '    editorialContent = _editorialDefaults();',
  '    editorialContent.approvalStatus = pageStatus ? { "ART.3": pageStatus } : {};',
  '    const mem = statuses.map((s, i) => ({ id: "ART.3" + "ABCDEFG"[i], status: s }));',
  '    return { kind: "spec", _ovKey: "ART.3", title: "ART.3", row: mem[0], members: mem };',
  '  },',
  '  stamps: function () { return _DS_STAMPS.slice(); },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
const txt = (list) => list.map(s => s.txt + ':' + s.st).join(' | ');

check('EXACT ASK: a set page pending with pieces A and C approved says so, and what is still pending', () => {
  const d = fx.set('pending', ['approved', 'concept', 'production']);
  const s = window._approvalStamps(d);
  if (txt(s) !== 'APPROVED A, C:approved | PENDING B:pending') throw new Error(txt(s));
});

check('a page’s own status still rules: approved is APPROVED, none prints nothing', () => {
  if (txt(window._approvalStamps(fx.set('approved', ['concept', 'concept']))) !== 'APPROVED:approved') throw new Error('approved page');
  if (window._approvalStamps(fx.set('', ['approved', 'approved'])).length) throw new Error('a page with no status got a stamp from the dashboard');
  if (txt(window._approvalStamps(fx.set('pending', ['concept', 'review']))) !== 'PENDING APPROVAL:pending') throw new Error('nothing approved yet');
  if (txt(window._approvalStamps(fx.set('pending', ['approved']))) !== 'PENDING APPROVAL:pending') throw new Error('single piece page');
});

check('a later part of a split set letters its pieces from where the part starts', () => {
  const d = fx.set('pending', ['approved', 'concept']);
  d._letterFrom = 12;
  if (txt(window._approvalStamps(d)) !== 'APPROVED M:approved | PENDING N:pending') throw new Error(txt(window._approvalStamps(d)));
});

check('the PDF prints both stamps (real jsPDF), side by side in the top margin', () => {
  const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: [540, 936] });
  const rects = []; const rr = doc.roundedRect.bind(doc);
  doc.roundedRect = function (x, y, w, h) { rects.push({ x, y, w, h }); return rr.apply(null, arguments); };
  window._drawApprovalStamps(doc, 936, 540, 36, window._approvalStamps(fx.set('pending', ['approved', 'concept'])));
  const raw = doc.output();
  if (raw.indexOf('APPROVED A') < 0 || raw.indexOf('PENDING B') < 0) throw new Error('stamp text missing from the PDF');
  if (rects.length !== 2) throw new Error(rects.length + ' boxes');
  if (!(rects[1].x + rects[1].w < rects[0].x)) throw new Error('the boxes overlap: ' + JSON.stringify(rects));
  if (Math.round(rects[0].x + rects[0].w) !== 936 - 36) throw new Error('first stamp is not on the right margin');
});

check('the export draws what _approvalStamps says, not the page status alone', () => {
  const s = APP.slice(APP.indexOf('// — Approval status: spec pages'), APP.indexOf("const fname = _deckPdfFileName();"));
  if (s.indexOf('_approvalStamps(_descAt[k])') < 0 || s.indexOf('_drawApprovalStamps(') < 0) throw new Error('export not wired');
});

check('the screen shows the same two stamps', () => {
  const page = window.document.createElement('div');
  window._dsAddStamp(page, 936, 540, fx.set('pending', ['approved', 'concept']));
  const t = Array.from(page.querySelectorAll('.ds-approval-stamps > div')).map(e => e.textContent);
  if (t.join(' | ') !== 'APPROVED A | PENDING B') throw new Error(t.join(' | '));
});

check('EXACT ASK: the stamp list has COLOR SAMPLE APPROVAL REQUIRED', () => {
  if (fx.stamps().indexOf('COLOR SAMPLE APPROVAL REQUIRED') < 0) throw new Error(fx.stamps().join(', '));
});

const bad = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
console.log('\n--- Summary ---');
console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad.length ? 1 : 0);
