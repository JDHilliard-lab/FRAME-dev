// 18.50: Deck Studio had its own "Save" button beside Generate PDF. It never saved the
// file: it pushed an undo entry, kicked the autosave and flashed "Saved ✓". Next to
// the header's real Save Project that read as "your work is on disk" when it was not.
// The button and _dsSave are gone; Save Project (header, every view) is the one save.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const A = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const H = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message }); }
};

check('no Deck Studio Save button in index.html', () => {
  if (H.indexOf('dsSaveBtn') >= 0) throw new Error('#dsSaveBtn is back');
  if (H.indexOf('_dsSave()') >= 0) throw new Error('something still calls _dsSave()');
});

check('the Deck Studio header has no button labelled Save', () => {
  const s = H.indexOf('Deck Studio</h3>');
  const e = H.indexOf('dsGenerateBtn', s);
  if (s < 0 || e < 0) throw new Error('Deck Studio header landmarks not found');
  const head = H.slice(s, e);
  if (head.indexOf('>Save<') >= 0) throw new Error('a Save button is in the Deck Studio header');
});

check('_dsSave is not defined in app.js', () => {
  if (A.indexOf('function _dsSave()') >= 0) throw new Error('_dsSave() is defined again');
  if (A.indexOf("getElementById('dsSaveBtn')") >= 0) throw new Error('app.js still reads #dsSaveBtn');
});

check('the header Save Project is the real save and shows in every view', () => {
  const i = H.indexOf('id="saveProjectBtn"');
  if (i < 0) throw new Error('#saveProjectBtn missing');
  const tag = H.slice(i, H.indexOf('>', i));
  if (tag.indexOf('saveMasterProject()') < 0) throw new Error('Save Project does not call saveMasterProject');
  if (tag.indexOf('data-views') >= 0) throw new Error('Save Project is scoped to some views; Deck Studio would have no save');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS: ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)));
if (failed.length) { console.log(failed.length + ' FAILURE' + (failed.length > 1 ? 'S' : '')); process.exit(1); }
console.log('ALL PASSED (' + results.length + ')');
