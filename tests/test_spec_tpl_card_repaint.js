// Reported: "when I first open the frametool I see the Group A/B/C thumbnails using
// the grey placeholders we just fixed, but they disappear if I toggle between Per
// piece and Group A/B/C... they do not totally disappear but they lose their
// multi-frame look and default to looking all the same."
//
// Two faults, and the second is why the first was invisible until now.
//
// 1. The cards call _dsQueueTplSwatch while their thumb div is still DETACHED — the
//    grid is appended to the panel several lines later. A cache HIT paints
//    synchronously, and _dsPaintTplSwatch bailed on `!el.isConnected`, so it painted
//    into nothing and the card kept its instant diagram. A cache MISS goes down the
//    async pump, by which time the div is attached, so it worked. Hence "works when I
//    first open the tool" (cold cache) "and not after toggling" (warm cache).
//    It was latent before 16.38 because the cache key carried the row id, so most
//    rebuilds missed; keying on template + unit made every rebuild a hit.
// 2. The instant diagram had ONE branch for all four group arrangements, differing
//    only in a caption — literally "all the same". Each arrangement blocks itself out
//    now, so even the momentary flash (or a render that fails) says which is which.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const S = window.__appSrc;
    const FAKE = 'data:image/jpeg;base64,AAAA';

    const __seed = (tpl) => {
      dashUnit = 'in'; elevUnit = 'in';
      dashProjectData = ['ART.001-A', 'ART.001-B'].map((id, i) => {
        const r = _cloneData(dashDefaultData);
        r.id = id; r.location = 'LOBBY'; r.level = '1'; r.imageCode = 'IMG.' + i;
        return r;
      });
      elevations = [];
      editorialContent.specTemplate = tpl;
      editorialContent.specTemplateOverrides = {};
      editorialContent.specTplMemory = {};
      editorialContent.hiddenFixed = {};
      _dsPages = _deckPageList();
      _dsIndex = _dsPages.findIndex(d => d && d.kind === 'spec');
      if (_dsIndex < 0) throw new Error('seed produced no spec page');
      _dsRenderTools();
    };
    // Every template card's thumb, in panel order.
    const __thumbs = () => Array.from(document.querySelectorAll('#dsToolsPageBody div'))
      .filter(d => /aspect-ratio/.test(d.getAttribute('style') || ''));
    const __painted = () => __thumbs().filter(t => t.querySelector('img')).length;
    const __modeBtn = (label) => Array.from(document.querySelectorAll('#dsToolsPageBody button'))
      .find(b => (b.textContent || '').trim() === label);

    // ── The unit-level fault ────────────────────────────────────────────────
    __check('EXACT BUG: a cached swatch paints into a card that is not in the DOM yet', () => {
      // Exactly the order the card builder uses: build the div, queue it, attach later.
      const ck = _dsTplSwatchKey('setRow');
      _dsTplSwatchCache[ck] = FAKE;
      const thumb = document.createElement('div');
      if (thumb.isConnected) throw new Error('the test element is already attached, so this proves nothing');
      _dsQueueTplSwatch('setRow', thumb);
      const img = thumb.querySelector('img');
      if (!img) throw new Error('THE BUG: the cached demo was dropped because the card was still detached');
      if (img.getAttribute('src') !== FAKE) throw new Error('painted the wrong image');
      // Attaching afterwards must not lose it.
      document.body.appendChild(thumb);
      if (!thumb.querySelector('img')) throw new Error('the paint did not survive being attached');
      thumb.remove();
      delete _dsTplSwatchCache[ck];
    });

    __check('and the guard that caused it is gone for good', () => {
      const i = S.indexOf('function _dsPaintTplSwatch');
      const body = S.slice(i, S.indexOf('\\n}', i));
      if (/isConnected/.test(body)) throw new Error('_dsPaintTplSwatch gates on isConnected again');
      if (body.indexOf('if (!el) return;') < 0) throw new Error('the null check went missing with it');
    });

    // ── The reported sequence ───────────────────────────────────────────────
    __check('EXACT BUG: toggling Per piece <-> Group A/B/C keeps the demos on the cards', () => {
      // First open: cold cache, so nothing is painted yet — the async pump has not
      // run. Warm every card the way a completed render would.
      __seed('setRight');
      const first = __thumbs();
      if (first.length !== 4) throw new Error('expected four Group A/B/C cards, got ' + first.length);
      ['setRight', 'setRow', 'setScale', 'setLegend'].forEach(k => { _dsTplSwatchCache[_dsTplSwatchKey(k)] = FAKE; });
      // Now do what the user did: Per piece, then back to Group A/B/C.
      const per = __modeBtn('Per piece');
      if (!per) throw new Error('no Per piece button');
      per.onclick();
      const back = __modeBtn('Group A/B/C');
      if (!back) throw new Error('no Group A/B/C button after switching away');
      back.onclick();
      const n = __painted(), total = __thumbs().length;
      if (total !== 4) throw new Error('expected four cards after toggling back, got ' + total);
      if (n !== 4) throw new Error('THE BUG: only ' + n + ' of 4 cards kept its demo after the toggle');
    });

    __check('the per-piece cards survive the same toggle', () => {
      __seed('classic');
      const keys = Object.keys(SPEC_TEMPLATES).filter(k => !SPEC_TEMPLATES[k].group && k !== 'installGuide');
      keys.forEach(k => { _dsTplSwatchCache[_dsTplSwatchKey(k)] = FAKE; });
      const grp = __modeBtn('Group A/B/C'); if (!grp) throw new Error('no Group A/B/C button');
      grp.onclick();
      const per = __modeBtn('Per piece'); if (!per) throw new Error('no Per piece button');
      per.onclick();
      const total = __thumbs().length, n = __painted();
      if (!total) throw new Error('no per-piece cards rendered');
      if (n !== total) throw new Error('THE BUG: only ' + n + ' of ' + total + ' per-piece cards kept its demo');
    });

    __check('re-rendering the panel on the spot does not blank them either', () => {
      __seed('setRight');
      ['setRight', 'setRow', 'setScale', 'setLegend'].forEach(k => { _dsTplSwatchCache[_dsTplSwatchKey(k)] = FAKE; });
      for (let i = 0; i < 3; i++) {
        _dsRenderTools();
        if (__painted() !== 4) throw new Error('pass ' + i + ': only ' + __painted() + ' of 4 painted');
      }
    });

    // ── The four group diagrams must differ from each other ─────────────────
    __check('EXACT BUG: the four group arrangements no longer draw the same diagram', () => {
      const keys = ['setRight', 'setRow', 'setScale', 'setLegend'];
      // Compare the GEOMETRY only: the caption already carried the label, which is
      // exactly how four identical diagrams passed for four different ones.
      const shapes = keys.map(k => {
        const h = _dsTemplateSwatchHTML(k, 150, 87);
        return (h.match(/left:[\\d.]+%; top:[\\d.]+%; width:[\\d.]+%; height:[\\d.]+%/g) || []).sort().join('|');
      });
      keys.forEach((k, i) => { if (!shapes[i]) throw new Error(k + ' draws no boxes at all'); });
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          if (shapes[i] === shapes[j]) throw new Error('THE BUG: ' + keys[i] + ' and ' + keys[j] + ' block out identically');
        }
      }
    });

    __check('each group diagram shows more than one frame, and the as-hung ones are staggered', () => {
      // Frame placeholders only. The thin lorem-line divs carry the same four
      // properties, so they have to be filtered out by height or every count is
      // meaningless — a lorem line is ~2% tall and a frame box is 13%+.
      const frames = (k) => (_dsTemplateSwatchHTML(k, 150, 87)
        .match(/left:[\\d.]+%; top:[\\d.]+%; width:[\\d.]+%; height:[\\d.]+%/g) || [])
        .map(s => s.match(/left:([\\d.]+)%; top:([\\d.]+)%; width:([\\d.]+)%; height:([\\d.]+)%/))
        .filter(Boolean)
        .map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }))
        .filter(r => r.h > 8);
      ['setRight', 'setRow', 'setScale', 'setLegend'].forEach(k => {
        const f = frames(k);
        if (f.length < 3) throw new Error(k + ' shows only ' + f.length + ' frame boxes — it has to read as multi-frame');
      });
      // The whole point of the as-hung cards: pieces at different heights, which a
      // row of equal columns cannot produce.
      ['setScale', 'setLegend'].forEach(k => {
        const ys = new Set(frames(k).map(p => Math.round(p.y)));
        if (ys.size < 3) throw new Error(k + ' draws its frames on ' + ys.size + ' height(s) — it will read as Side by side');
      });
      if (frames('setScale').length < SPEC_TPL_DEMO_SALON.length) throw new Error('the as-hung diagram drops salon pieces');
      // Side by side is equal columns: one shared top edge, one shared width.
      const row = frames('setRow');
      if (new Set(row.map(p => Math.round(p.y))).size !== 1) throw new Error('Side by side should align its columns on one edge');
      if (new Set(row.map(p => Math.round(p.w))).size !== 1) throw new Error('Side by side columns should be equal width');
      // Stacked is rows: one shared left edge, distinct tops.
      const stack = frames('setRight');
      if (new Set(stack.map(p => Math.round(p.x))).size !== 1) throw new Error('Stacked should put every piece in one column');
      if (new Set(stack.map(p => Math.round(p.y))).size !== stack.length) throw new Error('Stacked should put each piece on its own row');
    });

    __check('the as-hung diagram is driven by the same salon table the render uses', () => {
      const i = S.indexOf('function _dsTemplateSwatchHTML');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (body.indexOf('SPEC_TPL_DEMO_SALON') < 0) throw new Error('the diagram hardcodes its own arrangement, so it can drift from the render');
      // A card is 16:9, so a uniform fraction scale would squash a square frame.
      if (body.indexOf('936 / 540') < 0) throw new Error('the diagram does not correct for the card aspect, so square frames come out wide');
    });
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const all = window.__testResults || [];
  let failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
