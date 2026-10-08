// LETTER LEGEND FITS ITS COLUMN; ELEVATION THUMBNAILS AND FLOORPLAN KEY ROWS LINK;
// + ADD WALL SITS UNDER THE LAST WALL (17.96).
//  "Currently on the elevation breaker pages, the spec for the letter legends sometimes
//   crash into each other, is there a way to make sure they do not, when the column width
//   is set to 200pt it seems safe, but maybe ... responsive so titles and dimensions do not
//   crash into each other."
//  "On the spec pages, can the elevation details be clickable links to go back to the
//   floorplan."  "On the floorplan page can the items be clickable links that go to the
//   spec pages."  "Elevation tab area move the add wall below the latest elevation, its
//   getting lost at the bottom."
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

(async () => {
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // Text is measured in proportion to the font size, so a real overlap is a real overlap.
  const pxOf = (f) => { const m = /([0-9.]+)px/.exec(f || ''); return m ? parseFloat(m[1]) : 10; };
  window.HTMLCanvasElement.prototype.getContext = function () {
    const c = { font: '10px sans-serif', scale(){}, fillRect(){}, drawImage(){}, fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){} };
    c.measureText = (s) => ({ width: String(s || '').length * pxOf(c.font) * 0.55 });
    return c;
  };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__res = (async function () {
      const out = [];
      const check = async (label, fn) => { try { await fn(); out.push({ label, ok: true }); } catch (e) { out.push({ label, ok: false, err: e.message }); } };
      _toast = function () { return null; };
      const setup = (legendW, dual) => {
        elevations = [{ id: 'w1', name: 'ART.1', wallW: 185, wallH: 108, frames: [
          { id: 'ART.1A', letter: 'A', x: 10, y: 40, w: 48.5, h: 36.25, active: true, dimTo: [] },
          { id: 'ART.1B', letter: 'B', x: 70, y: 40, w: 24, h: 30, active: true, dimTo: [] } ] }];
        const row = (id, w, h) => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), { id: id, extW: w, extH: h, imageCode: 'FJH.2503366' });
        dashProjectData = [row('ART.1A', 48.5, 36.25), row('ART.1B', 24, 30)];
        dashUnit = 'in'; elevUnit = 'in';
        floorplanLevels = [{ name: 'Level 1', imageData: '' }];
        editorialContent.specDualUnit = dual ? 'mm' : '';
        editorialContent.installGuide = { breakerLegend: true, breakerLegendW: legendW, breakerLegendArt: true };
        editorialContent.pageFooters = {};
        _igNoCapture = false;
        for (const k in _igCapCache) delete _igCapCache[k];
      };
      const render = async () => {
        _captureElevWithGuides = async () => ({ dataUrl: 'data:image/png;base64,AAAA', w: 800, h: 400, vec: [] });
        const brElev = Object.assign({}, elevations[0], { name: 'ART.1', _noPlan: false, _idx: 0, _ovKey: 'elevgrp:ART.1' });
        _curFooter = _resolveFooter('spec:elevgrp:ART.1');
        const rec = new CanvasPdfRec(936, 540);
        await _drawInstallGuidePage(rec, {}, 1, { location: '', code: '', version: '' }, brElev, { PW: 936, PH: 540, M: 40 });
        return rec;
      };
      // Every legend line: label op, its value op, and their measured extents.
      const legendLines = (rec) => {
        const ops = rec.ops.filter(o => o.t === 'text');
        const labels = ['Overall dimensions', 'Art dimensions', 'Image code'];
        const m = new CanvasPdfRec(936, 540);
        const w = (o) => { m._mc.font = o.st.font; return m._mc.measureText(o.str).width; };
        const res = [];
        ops.forEach((o, i) => {
          if (labels.indexOf(o.str) < 0) return;
          const v = ops[i + 1];
          res.push({ label: o, value: v, lw: w(o), vw: w(v) });
        });
        return res;
      };

      await check('EXACT BUG: at the 150pt breaker default, a dual-unit size never prints over its label', async () => {
        setup(150, true);
        const lines = legendLines(await render());
        if (lines.length < 6) throw new Error('only ' + lines.length + ' legend lines drew');
        lines.forEach(L => {
          const sameLine = Math.abs(L.value.y - L.label.y) < 0.5;
          if (sameLine && L.value.x < L.label.x + L.lw + 2) throw new Error(L.label.str + ' overprinted by ' + L.value.str);
        });
        if (!lines.some(L => L.value.y > L.label.y + 1)) throw new Error('nothing stacked, so the narrow case was never exercised');
      });

      await check('a stacked value stays inside the column and is set no smaller than the floor', async () => {
        setup(110, true);
        const rec = await render();
        const lines = legendLines(rec);
        const letA = rec.ops.find(o => o.t === 'text' && o.str === 'A' && o.x < 120);
        const lx = letA.x, colR = lx + 110;
        lines.forEach(L => {
          if (L.value.x < lx + IG_LEG_LETTER_W - 0.01) throw new Error(L.value.str + ' runs into the letter gutter');
          if (L.value.x + L.vw > colR + 0.5) throw new Error(L.value.str + ' runs past the column (' + (L.value.x + L.vw).toFixed(1) + ' > ' + colR + ')');
          const sz = L.value.st.sz;
          if (sz && sz < IG_LEG_VAL_FS_MIN - 0.01) throw new Error('value set at ' + sz + 'pt');
        });
      });

      await check('a wide column keeps label and value on one line, as before', async () => {
        setup(320, false);
        const lines = legendLines(await render());
        lines.forEach(L => { if (Math.abs(L.value.y - L.label.y) > 0.5) throw new Error(L.label.str + ' stacked at 320pt'); });
      });

      await check('stacked blocks never overlap the next letter, and the reserved height matches what drew', async () => {
        setup(130, true);
        const rec = await render();
        const lines = legendLines(rec);
        const letB = rec.ops.find(o => o.t === 'text' && o.str === 'B' && o.x < 60);
        if (!letB) throw new Error('no letter B');
        const lastA = lines.filter(L => L.label.y < letB.y).reduce((m, L) => Math.max(m, L.value.y), 0);
        if (letB.y - lastA < IG_LEG_ROW_H - 0.01) throw new Error('B starts ' + (letB.y - lastA).toFixed(1) + 'pt under A');
        const rows = dashProjectData.slice();
        const rm = new CanvasPdfRec(936, 540);
        const reserved = _igLegendHeight(rm, rows, ['dims', 'art', 'code'], 130);
        const naive = rows.length * (3 * IG_LEG_ROW_H + 5 + IG_LEG_GAP);
        if (!(reserved > naive)) throw new Error('reservation did not grow for stacked lines (' + reserved + ' vs ' + naive + ')');
      });

      await check('source: the reservation and the drawer share one measure', async () => {
        if (SRC.indexOf('_igLegendHeight(doc, activeFrames.map(f => lookupRow(f.id)), _igLegKeys, _igLegendW)') < 0) throw new Error('reservation does not use the shared measure');
        if (SRC.indexOf('cy += _igLegBlockRows(doc, rr, _legLines, tw)') < 0) throw new Error('drawer does not use the shared measure');
      });

      await check('EXACT ASK: every elevation thumbnail on a spec page records a link to the floorplan', async () => {
        const n = SRC.split('links to the floorplan (17.96)').length - 1 + SRC.split('the same as the plan (17.96)').length - 1;
        if (n < 5) throw new Error('only ' + n + ' of 5 elevation thumbnail sites link');
      });

      await check('EXACT ASK: a code in the floorplan key list opens its spec page in Deck Studio', async () => {
        const rec = new CanvasPdfRec(936, 540);
        const entries = [{ key: 'ART.1', num: '01', codes: 'ART.1', location: 'LOBBY', category: 'framed' }, { key: 'ART.2', num: '02', codes: 'ART.2', category: 'framed' }];
        _drawFloorplanKeyPage(rec, {}, 1, {}, entries, null, 'Level 1');
        const rects = _fpListRects[_fpListSig(['ART.1', 'ART.2'])];
        if (!rects || rects.length !== 2) throw new Error('rects ' + JSON.stringify(rects));
        let jumped = null; const real = _dsJumpToSpecFor; _dsJumpToSpecFor = (k) => { jumped = k; };
        const realKE = _fpKeyEntries; _fpKeyEntries = () => entries;
        try {
          const page = document.createElement('div');
          _dsFpListLinks(page, { level: 0 }, 1);
          const links = page.querySelectorAll('.ds-fp-listlink');
          if (links.length !== 2) throw new Error(links.length + ' click targets');
          links[1].click();
        } finally { _dsJumpToSpecFor = real; _fpKeyEntries = realKE; }
        if (jumped !== 'ART.2') throw new Error('jumped to ' + jumped);
      });

      await check('a thumbnail of another plan does not overwrite the rows on screen', async () => {
        const rec = new CanvasPdfRec(936, 540);
        _drawFloorplanKeyPage(rec, {}, 1, {}, [{ key: 'ART.9', num: '09', codes: 'ART.9', category: 'framed' }], null, 'Level 2');
        if (!_fpListRects[_fpListSig(['ART.1', 'ART.2'])]) throw new Error('level 1 rows were dropped');
      });

      await check('EXACT ASK: + Add Wall sits under the last wall, not at the foot of the rail', async () => {
        if (CSS.indexOf('#nav-tabs-container { flex: 0 1 auto;') < 0) throw new Error('the wall list still stretches to fill the rail');
        const rail = document.getElementById('elev-wall-rail');
        const kids = Array.from(rail.children);
        if (kids[0].id !== 'nav-tabs-container' || !kids[1].classList.contains('nav-add-tab')) throw new Error('button is not straight after the list');
      });
      return out;
    })();
  `;
  const quiet = console.error; console.error = () => {};
  window.SRC = src; window.CSS_SRC = css;
  window.eval(src + '\nvar SRC = window.SRC; var CSS = window.CSS_SRC;\n' + testBlock);
  console.error = quiet;
  const results = await window.__res;
  const failed = results.filter(r => !r.ok);
  results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
  console.log('\n--- Summary ---');
  if (failed.length) console.log(failed.length + ' FAILURES');
  else console.log('ALL PASSED (' + results.length + ')');
})();
