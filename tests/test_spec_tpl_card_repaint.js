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
    // Both picker grids are gone: the per-piece one and the group one, each replaced
    // by SHOW ON PAGE ticks. The toggle is still driven, because a panel that came
    // back EMPTY would look exactly like the repaint bug this file was written for.
    __check('EXACT BUG: toggling Per piece <-> Group A/B/C leaves both panels usable', () => {
      __seed('setLegend');
      const txtNow = () => (document.getElementById('dsToolsPageBody') || {}).textContent || '';
      if (txtNow().indexOf('SHOW ON PAGE') < 0) throw new Error('the group panel has no ticks');
      if (__thumbs().length) throw new Error('template cards are back on the group panel');
      const per = __modeBtn('Per piece'); if (!per) throw new Error('no Per piece button');
      per.onclick();
      if (txtNow().indexOf('SHOW ON PAGE') < 0) throw new Error('the per-piece panel came back empty');
      const back = __modeBtn('Group A/B/C'); if (!back) throw new Error('no Group A/B/C button');
      back.onclick();
      if (txtNow().indexOf('SHOW ON PAGE') < 0) throw new Error('the group panel came back empty');
      if (__thumbs().length) throw new Error('template cards came back after the toggle');
    });

    // The per-piece side of this toggle no longer HAS cards: the SHOW ON PAGE ticks
    // are the control there, so the demos that could blank are the group ones alone
    // (covered by the check above). What this pins now is that the per-piece panel
    // comes back as TICKS and not as a grid - the toggle is still driven, because a
    // panel that returned empty on the way back would look identical to the bug.
    __check('the per-piece panel comes back as ticks, with no cards to switch between', () => {
      __seed('frameSpecDetail');
      const grp = __modeBtn('Group A/B/C'); if (!grp) throw new Error('no Group A/B/C button');
      grp.onclick();
      const per = __modeBtn('Per piece'); if (!per) throw new Error('no Per piece button');
      per.onclick();
      if (__thumbs().length) throw new Error(__thumbs().length + ' template cards are back on the per-piece panel');
      if (((document.getElementById('dsToolsPageBody') || {}).textContent || '').indexOf('Click to switch') >= 0) throw new Error('the Click to switch prompt is back');
      const txt = (document.getElementById('dsToolsPageBody') || {}).textContent || '';
      if (txt.indexOf('SHOW ON PAGE') < 0) throw new Error('the per-piece panel came back empty: no ticks and no cards');
      ['FRAME CORNER', 'MOULDING PROFILE', 'FLOORPLAN', 'ELEVATION'].forEach(n => {
        if (txt.toUpperCase().indexOf(n) < 0) throw new Error('the ' + n + ' tick did not come back');
      });
    });

    // There is ONE per-piece layout now, so the old per-piece templates resolve onto
    // it and every one of them draws the ticks. The page that CANNOT is the freeform
    // one, and it gets a sentence rather than an empty section - an empty panel reads
    // as broken, which is exactly what removing the layout buttons risked.
    __check('every per-piece layout shows the ticks, and a free layout says why it cannot', () => {
      ['classic', 'frameRight', 'frameSpecDetail'].forEach(k => {
        __seed(k);
        const txt = (document.getElementById('dsToolsPageBody') || {}).textContent || '';
        if (txt.indexOf('SHOW ON PAGE') < 0) throw new Error(k + ' has no ticks, so its panel has no control at all');
        if (txt.indexOf('OTHER LAYOUTS') >= 0) throw new Error(k + ' still offers other layouts');
        if (document.querySelectorAll('#dsToolsPageBody button[data-tpl]').length) throw new Error(k + ' still has layout switch buttons');
      });
      __seed('custom');
      const ct = (document.getElementById('dsToolsPageBody') || {}).textContent || '';
      if (ct.indexOf('SHOW ON PAGE') >= 0) throw new Error('a free layout is offered ticks that would do nothing');
      if (ct.indexOf('free layout') < 0) throw new Error('a free layout gets an empty section with no explanation');
    });

    __check('the group panel writes into the GROUP map, not the per-piece one', () => {
      // They default differently - a group page's wall thumbnail was off - so a panel
      // wired to the wrong map silently moves the other page kind instead.
      __seed('setLegend');
      editorialContent.specSlots = { frame: true, profile: true, plan: true, elevation: true };
      editorialContent.specGroupSlots = { frame: true, profile: true, plan: true, elevation: true };
      editorialContent.specSlotOverrides = {}; editorialContent.specGroupSlotOverrides = {};
      _dsRenderTools();
      const cb = document.querySelector('#dsToolsPageBody input[type=checkbox][data-slot=plan]');
      if (!cb) throw new Error('the group panel has no Floorplan tick');
      cb.checked = false; cb.onchange();
      if (_specGroupSlots(null).plan !== false) throw new Error('the group tick did not take');
      if (_specSlots(null).plan !== true) throw new Error('the group panel wrote into the per-piece map');
    });

    __check('re-rendering the group panel on the spot does not blank it either', () => {
      __seed('setLegend');
      for (let i = 0; i < 3; i++) {
        _dsRenderTools();
        const txt = (document.getElementById('dsToolsPageBody') || {}).textContent || '';
        if (txt.indexOf('SHOW ON PAGE') < 0) throw new Error('pass ' + i + ': the group ticks vanished');
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
