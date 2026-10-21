// 19.55, floor plan wall lines: "it was not clear where you actually draw the line... a tip
// to say hold shift... in the magnifying glass we need to see the size of the line as a
// square so designers know where it will land... the ability to move the line after drawing
// it, and maybe the arrow keys could help be precise in placement."
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  const testBlock = `
    window.__testResults = []; window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __check = (label, fn) => { __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true })).catch(e => ({ label, ok: false, err: e.message }))); window.__asyncChecks.push(__chain); };
    _autosaveToldUser = true; scheduleAutosave = () => {};
    let __pushes = 0; pushHistory = () => { __pushes++; };
    _dsRefresh = () => {}; _dsRenderRail = () => {}; _dsRenderCenter = () => {}; _dsRenderTools = () => {};
    // A 500 x 400 plan image at the origin; events carry client coordinates.
    const img = document.createElement('img'); img.id = 'dsFpPlanImg'; img.src = 'data:image/png;base64,AAAA';
    img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 400, right: 500, bottom: 400 });
    document.body.appendChild(img);
    const ev = (x, y, shift) => ({ clientX: x, clientY: y, shiftKey: !!shift, button: 0, preventDefault() {}, stopPropagation() {} });
    const setup = () => {
      dashProjectData = [{ id: 'ART.2', category: 'framed', level: 0 }];
      _fpSetWall(dashProjectData[0], 0, { wallLine: { x1: 0.2, y1: 0.5, x2: 0.4, y2: 0.5 }, wallPanels: 1 });
      _dsPages = [{ kind: 'floorplan', level: 0 }]; _dsIndex = 0; currentView = 'deck';
      _fpArmedId = null; _fpLineArmId = null; _fpLineStart = null; _fpSelLine = null; __pushes = 0;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const wrap = document.createElement('div');        // DETACHED, as the plan builds it
      wrap.appendChild(svg);
      _fpLinePaintCtx = { svg: svg, wrap: wrap, level: 0, S: 1 };
      return { svg, wrap };
    };
    const seg = () => _fpStoredSegs(dashProjectData[0], 0)[0];

    __check('EXACT BUG: the lines draw into the overlay before it is on the page', () => {
      const { svg } = setup();
      _fpWallLinesPaint();
      if (!svg.querySelector('[data-fp-line="ART.2"]')) throw new Error('no line drawn into the detached overlay (the plan showed none)');
      if (!svg.querySelector('[data-fp-hit="ART.2"]')) throw new Error('no click target');
    });
    __check('with a tool armed the lines are not clickable', () => {
      const { svg } = setup(); _fpLineArmId = 'ART.2';
      _fpWallLinesPaint();
      if (svg.querySelector('[data-fp-hit]')) throw new Error('click targets while drawing');
    });
    __check('EXACT ASK: click a line to select it, drag it to move it (one undo)', () => {
      const { svg, wrap } = setup(); _fpWallLinesPaint();
      _fpLineDragStart(ev(150, 200), 'ART.2', 0, null);
      if (!_fpSelLine || _fpSelLine.key !== 'ART.2') throw new Error('not selected');
      if (wrap.querySelectorAll('.fp-line-end').length !== 2) throw new Error('no end handles');
      document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 175, clientY: 240 }));
      document.dispatchEvent(new window.MouseEvent('mouseup', { clientX: 175, clientY: 240 }));
      const s = seg();
      if (Math.abs(s.x1 - 0.25) > 1e-9 || Math.abs(s.y1 - 0.6) > 1e-9 || Math.abs(s.x2 - 0.45) > 1e-9) throw new Error('did not move by the drag: ' + JSON.stringify(s));
      if (__pushes !== 1) throw new Error(__pushes + ' undo entries for one drag');
    });
    __check('Shift keeps a dragged line on its axis', () => {
      setup(); _fpWallLinesPaint();
      _fpLineDragStart(ev(150, 200), 'ART.2', 0, null);
      document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 200, clientY: 210, shiftKey: true }));
      document.dispatchEvent(new window.MouseEvent('mouseup', { clientX: 200, clientY: 210, shiftKey: true }));
      if (seg().y1 !== 0.5) throw new Error('drifted off its axis: ' + JSON.stringify(seg()));
    });
    __check('dragging an end moves that end only, Shift keeps it level', () => {
      setup(); _fpWallLinesPaint();
      _fpLineDragStart(ev(200, 200), 'ART.2', 0, { seg: 0, end: 2 });
      document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 260, clientY: 230, shiftKey: true }));
      document.dispatchEvent(new window.MouseEvent('mouseup', { clientX: 260, clientY: 230, shiftKey: true }));
      const s = seg();
      if (s.x1 !== 0.2 || s.y1 !== 0.5) throw new Error('the other end moved');
      if (Math.abs(s.x2 - 0.52) > 1e-9 || s.y2 !== 0.5) throw new Error('end not moved / not level: ' + JSON.stringify(s));
    });
    __check('EXACT ASK: arrow keys nudge a selected line 1px (Shift 10px), one undo per burst', async () => {
      setup(); _fpWallLinesPaint(); _fpSelLine = { key: 'ART.2', lv: 0 };
      const key = (k, sh) => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, shiftKey: !!sh, bubbles: true }));
      key('ArrowRight'); key('ArrowRight'); key('ArrowDown', true);
      const s = seg();
      if (Math.abs(s.x1 - (0.2 + 2 / 500)) > 1e-9 || Math.abs(s.y1 - (0.5 + 10 / 400)) > 1e-9) throw new Error('nudge wrong: ' + JSON.stringify(s));
      await new Promise(r => setTimeout(r, FP_LINE_NUDGE_MS + 60));
      if (__pushes !== 1) throw new Error(__pushes + ' undo entries for one burst of arrows');
    });
    __check('Delete removes the selected line; Esc lets go', () => {
      setup(); _fpSelLine = { key: 'ART.2', lv: 0 };
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (_fpSelLine) throw new Error('Esc did not let go');
      _fpSelLine = { key: 'ART.2', lv: 0 };
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      if (_fpStoredSegs(dashProjectData[0], 0).length) throw new Error('line still there');
    });
    __check('EXACT ASK: the loupe shows the line as thick as it prints, where it will land, with a Shift tip', () => {
      setup(); _fpLineArmId = 'ART.2';
      _fpLoupeShow(ev(100, 100));
      const r = document.querySelector('#dsFpLoupeMark rect');
      const w = _fpLineDrawW(1) * FP_LOUPE_ZOOM;
      if (!r || Math.abs(parseFloat(r.getAttribute('width')) - w) > 1e-6) throw new Error('no square the size of the line');
      const tip = document.getElementById('dsFpTip');
      if (!tip || tip.style.display === 'none' || tip.textContent.indexOf('Hold Shift') < 0) throw new Error('no tip: ' + (tip && tip.textContent));
      _fpLineStart = { x: 0.1, y: 0.25 };
      _fpLoupeShow(ev(150, 110, true));
      if (!document.querySelector('#dsFpLoupeMark line')) throw new Error('the line being drawn is not in the loupe');
      const r2 = document.querySelector('#dsFpLoupeMark rect');
      // Shift: the end square sits on the start's level, above the cursor (centre is y 74)
      if (Math.abs(parseFloat(r2.getAttribute('y')) + w / 2 - (FP_LOUPE_SIZE / 2 + (0.25 - 110 / 400) * 400 * FP_LOUPE_ZOOM)) > 1e-6) throw new Error('square not on the locked end');
      _fpLoupeHide();
      if (tip.style.display !== 'none') throw new Error('tip stays up');
      _fpLineArmId = null; _fpLineStart = null;
    });
  `;
  try { window.eval(src + '\n' + testBlock); } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = await Promise.all(window.__asyncChecks || []);
  const bad = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + all.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
