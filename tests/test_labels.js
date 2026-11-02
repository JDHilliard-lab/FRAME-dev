// 20.06: WALL LABELS. Choctaw's labels read Title, Artist (tribal affiliation), Size, Year,
// and 17 titles were added during the install because the deck said N/A. Title and artist
// were hidden fields with nowhere to fill them in. Production > Labels is that place, with
// a 4" x 2" label sheet (Avery 5163, ten to a Letter page) and a CSV. These checks drive the
// real tab and build the real PDF with the vendored jsPDF.
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
  '  setup: function (rows) {',
  '    editorialContent = _editorialDefaults(); dashUnit = "in";',
  '    dashProjectData = rows.map(r => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), r));',
  '  },',
  '  row: function (id) { return dashProjectData.find(r => r.id === id); },',
  '  undoLen: function () { return undoStack.length; },',
  '  stage: function (t) { editorialContent.presentationType = t; },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
const ROW = { id: 'L2-A01', imageCode: 'FSU.HF.00012.jpg', product: 'Framed Art', extW: 30, extH: 36, fW: 1, m1A: 0, m1T: 0, m1B: 0, m1L: 0, m1R: 0, m2A: 0 };

check('EXACT ASK: a label reads Title, Artist (affiliation), medium and year, size', () => {
  fx.setup([Object.assign({}, ROW, { artworkTitle: 'Morning Gathering', artist: 'Heather Foraker', artistAffil: 'Choctaw', artMedium: 'Archival pigment print', artYear: '2025' })]);
  const L = window._labelLines(fx.row('L2-A01'));
  if (L.title !== 'Morning Gathering') throw new Error(L.title);
  if (L.artist !== 'Heather Foraker (Choctaw)') throw new Error(L.artist);
  if (L.detail !== 'Archival pigment print, 2025') throw new Error(L.detail);
  if (!/^\d+(\.\d+)? × \d+(\.\d+)? in$/.test(L.size)) throw new Error('size ' + L.size);
});

check('empty parts are left out, never printed as blanks or "()"', () => {
  fx.setup([Object.assign({}, ROW, { artworkTitle: 'Dusk', artist: 'Ann Lee' })]);
  const L = window._labelLines(fx.row('L2-A01'));
  if (L.artist !== 'Ann Lee' || L.detail !== '') throw new Error(JSON.stringify(L));
});

check('EXACT ASK: titles are filled in on the Labels tab, one undo step per field', () => {
  fx.setup([ROW]);
  window.openProduction('labels');
  const inp = window.document.querySelector('#labelTable [data-label-row="L2-A01"] [data-label-field="artworkTitle"]');
  if (!inp) throw new Error('no title field on the Labels tab');
  const u0 = fx.undoLen();
  inp.value = 'Morning Gathering'; inp.dispatchEvent(new window.Event('change'));
  if (fx.row('L2-A01').artworkTitle !== 'Morning Gathering') throw new Error('not saved to the piece');
  if (fx.undoLen() !== u0 + 1) throw new Error((fx.undoLen() - u0) + ' undo steps');
  const m = window.document.getElementById('productionModal'); if (m) m.remove();
});

check('objects get no label by default; a tick overrides either way and the default stores nothing', () => {
  fx.setup([ROW, Object.assign({}, ROW, { id: 'OBJ.1', product: 'Sourced Object' })]);
  if (window._labelOn(fx.row('OBJ.1'))) throw new Error('an object gets a label by default');
  if (!window._labelOn(fx.row('L2-A01'))) throw new Error('a print gets no label by default');
  window.setRowLabel('L2-A01', { labelOn: false });
  if (window._labelOn(fx.row('L2-A01')) || fx.row('L2-A01').labelOff !== '1') throw new Error('untick did not stick');
  window.setRowLabel('L2-A01', { labelOn: true });
  if ('labelOff' in fx.row('L2-A01')) throw new Error('back to the default still stores ' + fx.row('L2-A01').labelOff);
  window.setRowLabel('OBJ.1', { labelOn: true });
  if (!window._labelOn(fx.row('OBJ.1'))) throw new Error('an object cannot be given a label');
});

check('the CSV carries code, title, artist, size and the image code without its extension', () => {
  fx.setup([Object.assign({}, ROW, { artworkTitle: 'Dusk, Late', artist: 'Ann Lee' })]);
  const csv = window._labelCsv([fx.row('L2-A01')]);
  const lines = csv.split('\n');
  if (lines[0] !== 'Code,Title,Artist,Affiliation,Medium,Year,Size,Image Code,Location') throw new Error(lines[0]);
  if (lines[1].indexOf('L2-A01,"Dusk, Late",Ann Lee') !== 0) throw new Error(lines[1]);
  if (lines[1].indexOf('FSU.HF.00012') < 0 || lines[1].indexOf('.jpg') >= 0) throw new Error('image code: ' + lines[1]);
});

check('the label sheet is ten 4" x 2" labels a Letter page, with each piece’s title on it', () => {
  const rows = [];
  for (let i = 1; i <= 12; i++) rows.push(Object.assign({}, ROW, { id: 'ART.' + i, artworkTitle: 'Piece ' + i, artist: 'Ann Lee' }));
  fx.setup(rows);
  const doc = window._labelSheetPdf(window._labelRows());
  if (doc.getNumberOfPages() !== 2) throw new Error(doc.getNumberOfPages() + ' pages for 12 labels');
  const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
  if (Math.round(w) !== 612 || Math.round(h) !== 792) throw new Error('not Letter portrait: ' + w + ' x ' + h);
  const raw = doc.output();
  if (raw.indexOf('Piece 12') < 0 || raw.indexOf('Piece 1)') < 0) throw new Error('titles missing from the PDF');
});

check('a missing title or artist in an IFS points at the Labels tab', () => {
  fx.setup([Object.assign({}, ROW, { imageCode: 'FAO.010.00001', artworkTitle: '', artist: '', fCode: 'X', glass: 'Acrylic' })]);
  fx.stage('final');
  const it = window._ifsAuditPreflight(window._deckPageList()).find(x => /no title/.test(x.text));
  if (!it) throw new Error('no warning');
  if (!it.prod || it.prod.tab !== 'labels') throw new Error('does not open Labels: ' + JSON.stringify(it.prod));
});

const bad = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
console.log('\n--- Summary ---');
console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad.length ? 1 : 0);
