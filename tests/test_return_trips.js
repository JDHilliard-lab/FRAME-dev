// ONE RETURN POINT, THREE TRIPS.
//
// Editing a wall happens in the Elevations tab; editing a spec happens in the
// Frame Dashboard. Both round trips were missing their second half. The deck
// one had been built (_elevReturnTo), but it could only ever mean "came from the
// deck" - so elevation -> dashboard ("Edit Master") was one-way, and dashboard ->
// elevation did not exist at all.
//
// One slot, because you can only be on one trip at a time. Two slots would mean
// two back buttons that can disagree about where "back" is, which is this file's
// oldest failure mode in miniature.
//
// No regex: patterns written into a test file here lose their backslashes.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTM = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const document = new JSDOM(HTM).window.document;
const NL = String.fromCharCode(10);

const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message }); }
};
const count = (h, n) => h.split(n).length - 1;
const fnBody = (name) => {
  const at = APP.indexOf('function ' + name + '(');
  if (at < 0) return null;
  const next = APP.indexOf(NL + 'function ', at + 1);
  return APP.slice(at, next < 0 ? APP.length : next);
};

check('there is exactly ONE return slot, not one per trip', () => {
  if (count(APP, 'let _viewReturn') !== 1) throw new Error('expected one _viewReturn declaration');
  // The old name must not come back alongside it.
  if (APP.indexOf('let _elevReturnTo') >= 0) throw new Error('_elevReturnTo is back as a second slot');
});

check('all three jumps exist and all three arm the same slot', () => {
  [['_dsJumpToElevation', 'deck -> wall'],
   ['jumpToDashboard', 'wall -> dashboard'],
   ['_dashJumpToWall', 'dashboard -> wall']].forEach(([fn, what]) => {
    const b = fnBody(fn);
    if (!b) throw new Error('missing ' + fn + ' (' + what + ')');
    if (b.indexOf('_viewReturn = {') < 0) throw new Error(fn + ' does not record a return point');
    if (b.indexOf('at:') < 0) throw new Error(fn + ' does not record WHERE the bar belongs');
  });
});

check('the return point is a key or an id, never an index', () => {
  // The deck rebuilds constantly and the dashboard re-sorts, so an index brings
  // you back to whatever has since taken that slot.
  const d = fnBody('_dsJumpToElevation');
  if (d.indexOf('_deckPageKey(desc)') < 0) throw new Error('the deck trip does not store a key');
  if (d.indexOf('_dsIndex') >= 0) throw new Error('the deck trip stores _dsIndex');
  const w = fnBody('_dashJumpToWall');
  if (w.indexOf('rowId: row.id') < 0) throw new Error('the dashboard trip does not store a row id');
  if (w.indexOf('dashSelectedRowIndex,') >= 0) throw new Error('the dashboard trip stores a row INDEX');
});

check('both bars are drawn by ONE renderer', () => {
  if (count(APP, 'function _syncReturnBars') !== 1) throw new Error('expected exactly one _syncReturnBars');
  const b = fnBody('_syncReturnBars');
  if (b.indexOf("fill('elevReturnBar'") < 0) throw new Error('the elevation bar is not drawn here');
  if (b.indexOf("fill('dashReturnBar'") < 0) throw new Error('the dashboard bar is not drawn here');
});

check('NO FUNCTION IS A STUB THAT CALLS ITSELF', () => {
  // This is here because it happened. Renaming the CALL _elevSyncReturnBtn() to
  // _syncReturnBars() also rewrote that alias's own DECLARATION, giving a second
  // "function _syncReturnBars() { _syncReturnBars(); }". Function declarations
  // hoist and the LAST one wins, so the real renderer was shadowed by a stub that
  // recursed until the stack went - and app.js still parsed.
  const bad = [];
  APP.split(NL).forEach((line, i) => {
    const t = line.trim();
    if (t.indexOf('function ') !== 0) return;
    const open = t.indexOf('(');
    const name = t.slice(9, open);
    if (!name || open < 0) return;
    const body = t.slice(t.indexOf('{') + 1, t.lastIndexOf('}'));
    if (body.indexOf(name + '(') >= 0) bad.push('line ' + (i + 1) + ': ' + name);
  });
  if (bad.length) throw new Error('self-calling one-line function(s): ' + bad.join(', '));
});

check('both bars exist in the markup and start hidden', () => {
  ['elevReturnBar', 'dashReturnBar', 'dashWallJump'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) throw new Error('#' + id + ' is missing');
    if ((el.getAttribute('style') || '').indexOf('display:none') < 0) {
      throw new Error('#' + id + ' does not start hidden, so it is parked furniture');
    }
  });
});

check('the wall-jump is offered only when the piece is actually placed', () => {
  const b = fnBody('_syncDashWallJump');
  if (!b) throw new Error('_syncDashWallJump is missing');
  if (b.indexOf('_rowElevIndex') < 0) throw new Error('it does not ask which wall the row is on');
  if (b.indexOf("host.style.display = 'none'") < 0) {
    throw new Error('it never hides itself, so it would offer a wall that does not exist');
  }
  // Same trigger as the linked-walls banner: both answer "where else does this
  // piece exist", so they must not disagree about the selected row.
  const g = fnBody('checkGlobalEditingWarning');
  if (!g || g.indexOf('_syncDashWallJump()') < 0) {
    throw new Error('the jump is not resynced when the selected row changes');
  }
});

check('wandering off by hand ends the trip', () => {
  // Otherwise a back button survives you navigating away and offers, minutes
  // later, to return you somewhere you long since left.
  const sv = APP.slice(APP.indexOf('function switchView'), APP.indexOf('function _elevLoadWall'));
  if (sv.indexOf('_endTripIfWanderedTo(') < 0) throw new Error('switchView never ends a stale trip');
  const h = fnBody('_endTripIfWanderedTo');
  if (!h || h.indexOf('_viewReturn.at !== view') < 0) {
    throw new Error('the rule does not compare against the view the trip landed in');
  }
});

const failed = results.filter(r => !r.ok);
results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
console.log(NL + '--- Summary ---');
if (failed.length) console.log(failed.length + ' FAILURES');
else console.log('ALL PASSED (' + results.length + ')');
