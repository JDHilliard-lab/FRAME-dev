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

    // Superseded by the thumbnail-sync fix: element-bearing layout/fixed pages
    // no longer go through the canvas-cache pipeline AT ALL — they render
    // synchronously via _dsElementPageThumbHTML (real CSS text layout, same
    // engine as the live-page mirror, covering both page.elements and the
    // separate annotations overlay). _dsThumbDrawable now deliberately
    // EXCLUDES them so they never re-enter that queue. The two checks below
    // are inverted from the original "EXACT BUG" assertions on purpose.
    __check('FOLLOW-UP FIX: a "layout" page with mb-elements is now excluded from the canvas-cache pipeline (rendered directly instead)', () => {
      const desc = { kind: 'layout', page: { elements: [{ type: 'text', text: 'COVER PAGE HEADING' }] } };
      if (_dsThumbDrawable(desc)) throw new Error('layout page with elements re-entered the canvas queue \\u2014 it could get overwritten with a wrap-mismatched render');
    });

    __check('FOLLOW-UP FIX: a "fixed" page with mb-elements (the real Cover/Slogan case) is now excluded from the canvas-cache pipeline', () => {
      const desc = { kind: 'fixed', fixed: 'cover', page: { elements: [{ type: 'text', text: 'CLIENT NAME' }] } };
      if (_dsThumbDrawable(desc)) throw new Error('fixed page with elements re-entered the canvas queue \\u2014 this is literally the Cover page scenario');
    });

    __check('FOLLOW-UP FIX: _dsElementPageThumbHTML renders both elements and the separate annotations overlay', () => {
      editorialContent.annotations = { 'layout:pgAnn': [{ type: 'text', text: 'ANNOTATION TEXT', x: 0.1, y: 0.1, w: 0.5 }] };
      const desc = { kind: 'layout', page: { id: 'pgAnn', elements: [{ type: 'text', text: 'ELEMENT TEXT' }] } };
      const html = _dsElementPageThumbHTML(desc, 168, 97);
      if (html.indexOf('ELEMENT TEXT') === -1) throw new Error('_dsElementPageThumbHTML did not render the page\\'s own element text');
      if (html.indexOf('ANNOTATION TEXT') === -1) throw new Error('_dsElementPageThumbHTML did not render the separate annotations overlay \\u2014 this is the gap that made dropped-in images vanish on deselect');
    });

    __check('FOLLOW-UP FIX: _dsPriorityRerender now correctly no-ops for an mb-element page (it is never cache-backed, so there is nothing to evict/queue)', () => {
      editorialContent.layoutPages = [{ id: 'pgCascade', type: 'custom', title: 'Cascade', elements: [{ type: 'text', text: 'x' }] }];
      const desc = { kind: 'layout', page: editorialContent.layoutPages[0] };
      let queued = false;
      const origPump = _thumbPump;
      _thumbPump = () => { queued = true; };
      _dsPriorityRerender(desc);
      if (queued) throw new Error('_dsPriorityRerender queued an mb-element page into the canvas pipeline \\u2014 it should be rendered directly by _dsRenderRail instead');
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
