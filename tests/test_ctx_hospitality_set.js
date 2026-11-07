// 20.24: THE HOSPITALITY SET. The designer's own drawings (tools/ctx-hospitality/*.svg)
// are the context library wherever the catalogue has the item, and "See all blocks"
// opens the whole library as a contact sheet at one scale.
// Pinned here:
//   - every catalogue drawing is in the library (by `ref`), front and side;
//   - a REPLACED key keeps its size (saved walls) and its drawing sits inside its box,
//     on its floor, uniformly scaled (circles stay round);
//   - a superseded item is hidden, still resolvable by key, and never in the palette or
//     the sheet;
//   - glass stays see-through (no white body behind a pane) and carries a hatch region;
//   - the sheet draws every shown item at the same px per inch, and a tile arms the block.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dir = path.join(root, 'tools', 'ctx-hospitality');
  const files = fs.readdirSync(dir).filter(f => /\.svg$/.test(f));
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    scheduleAutosave = () => {};
    _autosaveToldUser = true;
    const FILES = window.__files;
    const byRef = {};
    CONTEXT_PRESETS.forEach(p => { if (p.ref) byRef[p.ref] = p; });

    __check('every catalogue drawing is in the library, front and side', () => {
      const miss = [];
      FILES.forEach(f => {
        const m = /^([A-Z]{2}-[0-9]{3})_.*_(front|side)[.]svg$/.exec(f);
        if (!m) return;
        const p = byRef[m[1]];
        if (!p) { miss.push(m[1]); return; }
        if (m[2] === 'front' && !p.svg) miss.push(f);
        if (m[2] === 'side' && !(p.side && p.side.svg)) miss.push(f);
      });
      if (miss.length) throw new Error('missing: ' + miss.join(', '));
      const ids = new Set(FILES.map(f => f.slice(0, 6)));
      if (Object.keys(byRef).length !== ids.size) throw new Error(ids.size + ' catalogue blocks, ' + Object.keys(byRef).length + ' in the library');
    });

    __check('a replaced key keeps its size and its drawing sits inside its box, on the floor', () => {
      const ks = { nightstand: [24, 25], credenza: [72, 30], 'gr-king-set': [126, 54], 'gl-door': [185, 108], whiteboard: [72, 48] };
      Object.keys(ks).forEach(k => {
        const p = CONTEXT_PRESETS.find(q => q.key === k);
        if (p.w !== ks[k][0] || p.h !== ks[k][1]) throw new Error(k + ' changed size');
        if (!p.ref) throw new Error(k + ' is not the catalogue drawing');
        const ys = [], xs = [];
        p.svg.replace(/ (y|y1|y2)="([-0-9.]+)"/g, (m, a, v) => { ys.push(+v); return m; });
        p.svg.replace(/ (x|x1|x2)="([-0-9.]+)"/g, (m, a, v) => { xs.push(+v); return m; });
        if (Math.min.apply(null, xs) < -0.01 || Math.max.apply(null, xs) > p.w + 0.01) throw new Error(k + ' runs outside its box');
        // something reaches the floor (a rect bottom or a line end at h)
        let floor = false;
        p.svg.replace(/<rect[^>]*? y="([-0-9.]+)"[^>]*? height="([-0-9.]+)"/g, (m, y, h) => { if (Math.abs(+y + +h - p.h) < 0.05) floor = true; return m; });
        p.svg.replace(/ (y|y1|y2)="([-0-9.]+)"/g, (m, a, v) => { if (Math.abs(+v - p.h) < 0.05) floor = true; return m; });
        if (!floor) throw new Error(k + ' does not stand on its floor');
      });
    });

    __check('the drawings carry no stroke of their own and solid parts are the opaque marker', () => {
      Object.values(byRef).forEach(p => {
        [p.svg, p.side && p.side.svg].filter(Boolean).forEach(s => {
          // the weight groups (_O/_H) are the app's own; the drawing itself sets none
          if (/ stroke="| stroke-width="[^"]*"[^>]*[/]>/.test(s)) throw new Error(p.key + ' sets its own stroke');
          if (/fill="#/.test(s)) throw new Error(p.key + ' carries a literal fill');
          if (_ctxCatOf(p.key) !== 'Glass' && s.indexOf('data-o="1"') < 0) throw new Error(p.key + ' has no solid parts');
        });
      });
    });

    __check('glass stays see-through and is the hatch region', () => {
      ['gl-fixed', 'gl-door', 'gl-double', 'gl-framed', 'gl-slide', 'hc-dr-005'].forEach(k => {
        const p = CONTEXT_PRESETS.find(q => q.key === k);
        if (!p.hatch || p.hatch.indexOf('<rect') < 0) throw new Error(k + ' has no glass hatch region');
        if (p.svg.indexOf('fill="none"') < 0) throw new Error(k + ' lost its unfilled pane');
      });
    });

    __check('a superseded item is hidden but still resolves for saved walls', () => {
      ['bed-queen', 'door-guest', 'sofa', 'toilet-tank', 'lounge'].forEach(k => {
        const p = _ctxPreset(k);
        if (p.key !== k) throw new Error(k + ' no longer resolves');
        if (!p.hidden) throw new Error(k + ' is still offered');
      });
    });

    __check('the palette never offers a hidden item', () => {
      const box = document.getElementById('contextControls');
      if (!box) throw new Error('no context panel');
      const seen = [];
      CONTEXT_LIBRARY.forEach(c => {
        setContextPaletteCat(c.cat);
        box.querySelectorAll('.ctx-chip').forEach(b => { const m = /armContextShape\\('([^']+)'\\)/.exec(b.getAttribute('onclick')); if (m) seen.push(m[1]); });
      });
      const hid = seen.filter(k => _ctxPreset(k).hidden);
      if (hid.length) throw new Error('offered: ' + hid.join(', '));
      if (seen.indexOf('hc-gr-002') < 0) throw new Error('the new queen bed is not offered');
      if (!box.querySelector('.ctx-sheet-btn')) throw new Error('no See all blocks button under the palette');
    });

    __check('See all blocks opens a contact sheet at one scale, and a tile arms the block', () => {
      const ov = openContextSheet();
      if (!ov || !ov.classList.contains('frame-modal')) throw new Error('not a frame-modal');
      if (ov.querySelectorAll('[data-modal-close]').length !== 1) throw new Error('needs exactly one close control');
      const tiles = [].slice.call(ov.querySelectorAll('.ctx-sheet-tile'));
      const shown = CONTEXT_PRESETS.filter(p => !p.hidden && p.svg);
      const sides = shown.filter(p => _ctxHasSide(p)).length;
      if (tiles.length !== shown.length + sides) throw new Error(tiles.length + ' tiles for ' + (shown.length + sides) + ' drawings');
      if (tiles.some(t => _ctxPreset(t.getAttribute('data-ctx-key').split(':')[0]).hidden)) throw new Error('a hidden item is on the sheet');
      // one scale: width attribute / item width is the same for every tile
      const ratios = tiles.map(t => {
        const k = t.getAttribute('data-ctx-key'), side = /:side$/.test(k), p = _ctxPreset(k.split(':')[0]);
        const w = +t.querySelector('svg').getAttribute('width');
        return w / (side ? p.side.w : p.w);
      });
      if (ratios.some(r => Math.abs(r - CTX_SHEET_PX_IN) > 0.06)) throw new Error('tiles are not at one scale');
      const t = tiles.find(x => x.getAttribute('data-ctx-key') === 'hc-fx-001');
      t.click();
      if (document.getElementById('ctxSheet')) throw new Error('the sheet stayed open');
      if (!contextToolActive || _ctxArmedPreset !== 'hc-fx-001') throw new Error('the block was not armed');
      if (_ctxPaletteCat !== 'Toilets') throw new Error('the palette did not follow to Toilets');
    });
  `;

  try {
    window.eval('window.__files = ' + JSON.stringify(files) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = window.__testResults || [];
  let failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
