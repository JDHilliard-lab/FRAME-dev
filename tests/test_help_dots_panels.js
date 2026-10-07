// PANEL HOW-TOS ARE ? DOTS (17.90): "we cleaned up a lot of the description notes to have
// ? icons you could hover over or click ... I do not want designers having to scroll down
// to find tools". Plain Node: these are questions about the source.
const fs = require('fs');
const path = require('path');
const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const NL = String.fromCharCode(10);
const results = [];
const check = (label, fn) => { try { fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

// Each sentence must still exist (the words are kept) and must sit on a dot, never in a
// paragraph built with textContent.
const MOVED = [
  'Scroll to zoom, drag inside to pan, move it by the grip at top-left.',
  'Double-click the box to edit its text. Drag a corner to resize',
  'Drag mockups anywhere, resize from the corner',
  'Narrower column and smaller text leave the elevation bigger.',
  'Pieces that share a value share a line',
  'Drop or click',
];
MOVED.forEach(t => check('on a dot, not a paragraph: ' + t.slice(0, 40), () => {
  const i = APP.indexOf(t);
  if (i < 0) throw new Error('the sentence is gone entirely (the words are meant to be kept)');
  const before = APP.slice(Math.max(0, i - 260), i);
  if (before.indexOf("textContent = '") >= 0 && before.lastIndexOf("createElement('p')") > before.lastIndexOf('_dsHowToDot') && before.lastIndexOf("createElement('p')") > before.lastIndexOf('_dsHelpDot')) {
    throw new Error('still built as a paragraph');
  }
}));

check('the Group A/B/C intro paragraph is gone', () => {
  if (APP.indexOf("note.textContent = 'Set pieces (A / B / C") >= 0) throw new Error('the paragraph is back');
});

check('one helper for a popup footnote, built on the shared dot', () => {
  const a = APP.indexOf('function _dsHowToDot(');
  if (a < 0) throw new Error('no _dsHowToDot');
  if (APP.slice(a, APP.indexOf(NL + '}', a)).indexOf('_dsHelpDot(') < 0) throw new Error('it does not use the shared dot');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
console.log(NL + '--- Summary ---');
if (failed.length) console.log(failed.length + ' FAILURES');
else console.log('ALL PASSED (' + results.length + ')');
