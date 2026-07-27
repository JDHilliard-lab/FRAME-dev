const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};

    __check('EXACT BUG: a "layout" page with mb-elements (e.g. Cover-style title text) now IS considered drawable', () => {
      const desc = { kind: 'layout', page: { elements: [{ type: 'text', text: 'COVER PAGE HEADING' }] } };
      if (!_dsThumbDrawable(desc)) throw new Error('layout page with elements was excluded from ever getting a real thumbnail \\u2014 the exact reported gap');
    });

    __check('EXACT BUG: a "fixed" page with mb-elements (the real Cover/Slogan case) now IS considered drawable', () => {
      const desc = { kind: 'fixed', fixed: 'cover', page: { elements: [{ type: 'text', text: 'CLIENT NAME' }] } };
      if (!_dsThumbDrawable(desc)) throw new Error('fixed page with elements was excluded \\u2014 this is literally the Cover page scenario reported');
    });

    __check('CASCADE FIX: _dsPriorityRerender (the debounced high-fidelity refresh from a previous fix) now actually proceeds for these pages instead of silently no-op-ing', () => {
      editorialContent.layoutPages = [{ id: 'pgCascade', type: 'custom', title: 'Cascade', elements: [{ type: 'text', text: 'x' }] }];
      const desc = { kind: 'layout', page: editorialContent.layoutPages[0] };
      let queued = false;
      const origPump = _thumbPump;
      _thumbPump = () => { queued = true; };
      _dsPriorityRerender(desc);
      if (!queued) throw new Error('_dsPriorityRerender still silently no-ops for an mb-element page \\u2014 the cascading half of this bug');
      _thumbPump = origPump;
    });

    __check('REGRESSION: spec/floorplan/card pages are still drawable exactly as before', () => {
      if (!_dsThumbDrawable({ kind: 'spec' })) throw new Error('spec pages regressed');
      if (!_dsThumbDrawable({ kind: 'floorplan' })) throw new Error('floorplan pages regressed');
      if (!_dsThumbDrawable({ kind: 'card' })) throw new Error('card pages regressed');
      if (!_dsThumbDrawable({ kind: 'planDetail' })) throw new Error('planDetail pages regressed');
    });

    __check('REGRESSION: an unrecognized page kind is still correctly excluded', () => {
      if (_dsThumbDrawable({ kind: 'somethingElseEntirely' })) throw new Error('unknown kind incorrectly considered drawable');
    });

    __check('a layout page with NO elements at all (truly blank) is also correctly drawable now (was already true before, confirming no regression there)', () => {
      const desc = { kind: 'layout', page: { elements: [] } };
      if (!_dsThumbDrawable(desc)) throw new Error('blank layout page regressed');
    });
  `;
  try { window.eval(src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
