// 19.61, "Frame recommendations, I need to be able change the titles...since sometimes they
// are recommendations and sometimes they will be specified frames." The heading and its
// subheading were literals in _drawFrameRecPage.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const mkCtx = () => new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (str) => ({ width: String(str || '').length * 5 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  window.HTMLCanvasElement.prototype.getContext = function () { return this.__ctx || (this.__ctx = mkCtx()); };
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __check = (label, fn) => {
      __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true }))
        .catch(e => ({ label, ok: false, err: e.message })));
      window.__asyncChecks.push(__chain);
    };
    _autosaveToldUser = true;
    let pushes = 0;
    scheduleAutosave = () => {}; pushHistory = () => { pushes++; };
    const S = window.__src;
    const drawn = () => { let got = null; const real = _drawPageTitle; _drawPageTitle = function (doc, PW, PH, title, sub) { got = { title: title, sub: sub }; return real.apply(this, arguments); }; try { _drawFrameRecPage(new CanvasPdfRec(936, 540), {}, 7, {}, []); } finally { _drawPageTitle = real; } return got; };
    const listTitle = () => { editorialContent.specInclude = Object.assign({}, editorialContent.specInclude || {}, { frameRec: true }); const d = _deckPageList().find(p => p.kind === 'card' && p.type === 'frameRec'); return d && d.title; };

    __check('the default page is unchanged: FRAME RECOMMENDATIONS over its usual line', () => {
      editorialContent = _editorialDefaults();
      const g = drawn();
      if (g.title !== 'FRAME RECOMMENDATIONS' || g.sub !== 'Frames specified across the project') throw new Error(JSON.stringify(g));
      if (editorialContent.frameRec && 'title' in editorialContent.frameRec) throw new Error('a default title was stored');
    });
    __check('EXACT REQUEST: the heading can say Specified Frames, on the page, the page list and its thumbnail', () => {
      editorialContent = _editorialDefaults();
      const d0 = { kind: 'card', type: 'frameRec', title: _frameRecTitle() };
      const k0 = _dsThumbCacheKey(d0);
      pushes = 0;
      setFrameRecText('title', 'Specified Frames');
      if (pushes !== 1) throw new Error('not one undo entry: ' + pushes);
      if (drawn().title !== 'SPECIFIED FRAMES') throw new Error('page still says ' + drawn().title);
      const lt = listTitle();
      if (lt !== 'Specified Frames') throw new Error('page list title: ' + lt);
      if (_dsThumbCacheKey({ kind: 'card', type: 'frameRec', title: lt }) === k0) throw new Error('the thumbnail would keep the old heading');
      setFrameRecText('title', '  ');
      if (drawn().title !== 'FRAME RECOMMENDATIONS' || 'title' in editorialContent.frameRec) throw new Error('clearing it did not go back to the default');
    });
    __check('the subheading can be changed, or left blank to print none', () => {
      editorialContent = _editorialDefaults();
      setFrameRecText('sub', 'Final selections for fabrication');
      if (drawn().sub !== 'Final selections for fabrication') throw new Error(drawn().sub);
      setFrameRecText('sub', '');
      if (drawn().sub !== '') throw new Error('a blank subheading printed: ' + drawn().sub);
      setFrameRecText('sub', FRAME_REC_SUB_DEFAULT);
      if ('sub' in editorialContent.frameRec) throw new Error('the default subheading was stored');
    });
    __check('the panel offers the heading, its quick picks and the subheading', () => {
      const a = S.indexOf("else if (desc.type === 'frameRec') {"), body = S.slice(a, S.indexOf("else if (desc.type === 'timeline') {", a));
      ['frameRecTitleInput', 'frameRecSubInput', 'FRAME_REC_TITLE_PICKS', "setFrameRecText('title'"].forEach(w => { if (body.indexOf(w) < 0) throw new Error('panel lacks ' + w); });
      if (FRAME_REC_TITLE_PICKS.indexOf('Specified Frames') < 0) throw new Error('no Specified Frames pick');
      if (body.indexOf('oninput') >= 0) throw new Error('a field commits per keystroke');
    });
  `;

  try {
    window.eval('window.__src = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = await Promise.all(window.__asyncChecks || []);
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
