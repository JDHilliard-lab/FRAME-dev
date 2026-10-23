// 19.62, "Is it possible to mix presentation layouts, some items can be group ABC and some can
// be Per-piece in the same presentation. This might be done with large salon hangs, say of
// 8-12 images might look too crowded on the spec page and it might be better to have an
// elevation breaker page to see that salon hang ... then per-piece spec just for that large
// group." Each set may choose one page or a page per piece, and its own breaker.
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
    const row = (id) => Object.assign({}, dashDefaultData, { id: id, product: 'Framed Art', extW: 20, extH: 24, level: 0 });
    const fr = (id, letter, x) => ({ id: id, letter: letter, x: x, y: 40, w: 20, h: 24, active: true, dimTo: [] });
    const setup = (tpl) => {
      editorialContent = _editorialDefaults();
      editorialContent.specTemplate = tpl;
      dashUnit = 'in'; elevUnit = 'in';
      dashProjectData = [row('ART.1'), row('ART.2'), row('ART.3A'), row('ART.3B'), row('ART.3C')];
      elevations = [{ id: 'w1', name: 'ART.1 / 2', wallW: 300, wallH: 108, frames: [fr('ART.1', 'A', 20), fr('ART.2', 'A', 200)] },
                    { id: 'w3', name: 'ART.3', wallW: 160, wallH: 108, frames: [fr('ART.3A', 'A', 20), fr('ART.3B', 'B', 60), fr('ART.3C', 'C', 100)] }];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      pushes = 0;
    };
    const specs = () => _deckPageList().filter(d => d.kind === 'spec');
    const sig = () => specs().map(d => (d._install ? 'BR:' : '') + d.title + (d._install ? '' : '[' + _deckSpecTpl(d) + ']')).join(' ');

    __check('a deck with nothing per set is exactly as before', () => {
      setup('setLegend');
      if (sig() !== 'ART.1[setLegend] ART.2[setLegend] ART.3[setLegend]') throw new Error(sig());
      setup('frameSpecDetail');
      if (sig() !== 'ART.1[frameSpecDetail] ART.2[frameSpecDetail] ART.3A[frameSpecDetail] ART.3B[frameSpecDetail] ART.3C[frameSpecDetail]') throw new Error(sig());
    });
    __check('EXACT REQUEST: in a Group A/B/C deck, the big set gets a breaker and a page per piece; the rest stay grouped', () => {
      setup('setLegend');
      setSpecUnitPages('ART.3', 'perPiece');
      setSpecUnitBreaker('ART.3', true);
      if (pushes !== 2) throw new Error('not one undo entry per change: ' + pushes);
      const s = sig();
      if (s !== 'ART.1[setLegend] ART.2[setLegend] BR:ART.3ABC ART.3A[frameSpecDetail] ART.3B[frameSpecDetail] ART.3C[frameSpecDetail]') throw new Error(s);
      if (JSON.stringify(editorialContent.unitPages) !== '{"spec:ART.3":"perPiece"}' || JSON.stringify(editorialContent.unitBreakers) !== '{"spec:ART.3":true}') throw new Error('stored: ' + JSON.stringify([editorialContent.unitPages, editorialContent.unitBreakers]));
      const p = specs().find(d => d.title === 'ART.3A');
      if (_dsThumbCacheKey(p).indexOf('frameSpecDetail') < 0) throw new Error('its thumbnail is keyed to the group layout: ' + _dsThumbCacheKey(p));
      if (_specUnitKeyOf(p) !== 'ART.3') throw new Error('page does not know its set');
    });
    __check('the other way: one set grouped in a Per piece deck', () => {
      setup('frameSpecDetail');
      setSpecUnitPages('ART.3', 'group');
      const s = sig();
      if (s !== 'ART.1[frameSpecDetail] ART.2[frameSpecDetail] ART.3[setLegend]') throw new Error(s);
    });
    __check('choosing the deck\\'s own value again clears the exception', () => {
      setup('setLegend');
      setSpecUnitPages('ART.3', 'perPiece'); setSpecUnitPages('ART.3', 'group');
      setSpecUnitBreaker('ART.3', true); setSpecUnitBreaker('ART.3', false);
      if ('unitPages' in editorialContent || 'unitBreakers' in editorialContent) throw new Error('left behind: ' + JSON.stringify([editorialContent.unitPages, editorialContent.unitBreakers]));
    });
    __check('a set can turn the deck-wide breaker off, and the wall it shares goes to the set that keeps it', () => {
      setup('setLegend');
      editorialContent.elevBreakers = true;
      const before = sig();
      if (before.indexOf('BR:ART.1 / ART.2') < 0) throw new Error('fixture: no shared breaker: ' + before);
      setSpecUnitBreaker('ART.1', false);
      const s = sig();
      if (s.indexOf('BR:ART.1') >= 0) throw new Error('ART.1 still named on a breaker: ' + s);
      if (s.indexOf('BR:ART.2 ART.2') < 0) throw new Error('ART.2 lost the wall\\'s breaker: ' + s);
    });
    __check('renumbering a set carries its settings', () => {
      setup('setLegend');
      setSpecUnitPages('ART.3', 'perPiece');
      _renamePageKeys('ART.3', 'ART.4');
      if (!editorialContent.unitPages['spec:ART.4'] || editorialContent.unitPages['spec:ART.3']) throw new Error(JSON.stringify(editorialContent.unitPages));
    });
    __check('a piece page inside a Group deck renders as a per-piece page', async () => {
      setup('setLegend');
      setSpecUnitPages('ART.3', 'perPiece');
      const p = specs().find(d => d.title === 'ART.3B');
      let per = 0, grp = 0;
      const rP = _drawSpecPageTemplate, rG = _drawSpecSetPage;
      _drawSpecPageTemplate = async function () { per++; }; _drawSpecSetPage = async function () { grp++; };
      try { await _drawDeckSpecPage(new CanvasPdfRec(936, 540), p, { logos: {}, meta: {}, pageNum: 1, PW: 936, PH: 540, M: 40 }); }
      finally { _drawSpecPageTemplate = rP; _drawSpecSetPage = rG; }
      if (per !== 1 || grp !== 0) throw new Error('drawn as ' + (grp ? 'a group page' : 'nothing'));
    });
    __check('the panel offers it: One page / Page per piece, and the breaker', () => {
      setup('setLegend');
      const host = document.createElement('div');
      _dsUnitPagesInto(host, specs().find(d => d.title === 'ART.3'));
      const txt = host.textContent;
      if (txt.indexOf('This set: ART.3') < 0 || txt.indexOf('One page') < 0 || txt.indexOf('Page per piece') < 0) throw new Error(txt);
      if (!host.querySelector('#dsUnitBreaker')) throw new Error('no breaker tick');
      const one = document.createElement('div');
      _dsUnitPagesInto(one, specs().find(d => d.title === 'ART.1'));
      if (one.textContent.indexOf('Page per piece') >= 0) throw new Error('a single piece was offered a page per piece');
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
