// 18.55: THE NEXT-STEP BAR SITS BOTTOM-CENTRE, AND TOASTS STACK ABOVE IT.
//
// Bottom-left, the bar covered controls every view keeps there: the Deck Studio page
// rail, the dashboard rows, + Add Wall in Elevations. The bottom-centre is open in all
// three. Toasts already lived there, so while the bar is up the toast host is lifted.
const fs = require('fs');
const path = require('path');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message }); }
};

const rule = (sel) => {
  const i = CSS.indexOf(sel + ' {');
  if (i < 0) throw new Error(sel + ' rule not found');
  return CSS.slice(i, CSS.indexOf('}', i));
};

check('EXACT BUG: the bar is no longer pinned to the left edge', () => {
  const r = rule('.next-step');
  if (r.indexOf('left: 14px') >= 0) throw new Error('.next-step is back at left: 14px');
  if (r.indexOf('left: 50%') < 0 || r.indexOf('translateX(-50%)') < 0) throw new Error('.next-step is not centred');
  if (r.indexOf('position: fixed') < 0) throw new Error('.next-step is not fixed');
});

check('toasts lift above the bar while it is showing', () => {
  const r = rule('body:has(> #nextStep) .frame-toast-host');
  const m = /bottom:\s*(\d+)px/.exec(r);
  if (!m) throw new Error('no bottom offset on the lifted toast host');
  const host = rule('.frame-toast-host');
  const h = /bottom:\s*(\d+)px/.exec(host);
  if (!h || parseInt(m[1], 10) <= parseInt(h[1], 10) + 30) throw new Error('lifted toasts would still overlap the bar');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS: ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)));
if (failed.length) { console.log(failed.length + ' FAILURE' + (failed.length > 1 ? 'S' : '')); process.exit(1); }
console.log('ALL PASSED (' + results.length + ')');
