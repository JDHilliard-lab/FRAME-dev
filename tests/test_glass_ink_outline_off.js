// 20.26: two things on the elevation, from one screenshot.
//  1. "can we make it so the glass drawings in elevation are black lines instead of red
//     lines. The red lines should only be the dimension lines." The glass run outline
//     and its mullions are drawn in _elevGlassInk(), never the dimension colour; the
//     panel dims and letter tags stay in the dimension colour.
//  2. "the red outline on art seems to be on by default and I need to turn it on and off
//     for it to go off." #outline-layer had no hidden default in style.css, so on a fresh
//     wall it showed while its button (and the page renderer, which reads the inline
//     display) said off. It joins the other guide layers' display:none rule.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('</head>', '<style>' + css + '</style></head>');
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
    elevUnit = 'in'; dashUnit = 'in';
    elevations = [{ name: 'Glass', wallW: 185, wallH: 108, frames: [], personPos: { x: -60 },
      glazing: [{ x: 45, y: 4, h: 82, panels: [33.3125, 33.3125, 33.375] }] }];
    currentElevIndex = 0; elevFrames = elevations[0].frames;
    elevZoomFactor = 1;
    const ws = document.querySelector('#view-elevation .workspace');
    if (ws) { Object.defineProperty(ws, 'clientWidth', { get: () => 1100, configurable: true });
              Object.defineProperty(ws, 'clientHeight', { get: () => 800, configurable: true }); }
    annotationStyle.color = '#e00000';
    applyAnnotationStyleToCSSVars();
    drawElevAll();

    const rgb = (hex) => { const v = _annHexToRgb(hex); return 'rgb(' + v.r + ', ' + v.g + ', ' + v.b + ')'; };

    __check('the glass outline and mullions are drawn in black, not the dimension colour', () => {
      const run = document.querySelector('#glazing-layer .glazing-run');
      if (!run) throw new Error('no glass drawn');
      const st = run.getAttribute('style');
      if (st.indexOf('--dim-color') >= 0) throw new Error('the glass outline still reads the dimension colour');
      // jsdom drops a border shorthand holding var(), so read the declaration itself.
      if (st.indexOf('solid ' + _elevGlassInk()) < 0) throw new Error('outline is not drawn in the glass ink: ' + st);
      const mull = document.querySelectorAll('#glazing-layer .glazing-mullion');
      if (mull.length !== 2) throw new Error('expected 2 mullions, got ' + mull.length);
      mull.forEach(m => {
        if (m.getAttribute('style').indexOf('--dim-color') >= 0) throw new Error('a mullion still reads the dimension colour');
        if (window.getComputedStyle(m).backgroundColor !== rgb(_elevGlassInk())) throw new Error('mullion colour is ' + window.getComputedStyle(m).backgroundColor);
      });
      if (_elevGlassInk() === annotationStyle.color) throw new Error('glass ink equals the dimension colour');
    });

    __check('the panel letter tags stay in the dimension colour (they are annotations)', () => {
      const tag = document.querySelector('#glazing-layer .glazing-tag');
      if (!tag) throw new Error('no panel tag');
      if (tag.getAttribute('style').indexOf('--dim-color') < 0) throw new Error('the tag left the dimension colour');
    });

    __check('the Outlines layer is hidden on a fresh wall, matching its button', () => {
      elevFrames.push({ letter: 'A', x: 80, y: 40, w: 24, h: 24, active: true });
      drawElevAll();
      const ol = document.getElementById('outline-layer');
      if (!ol.querySelector('.piece-outline')) throw new Error('no outline drawn to hide');
      if (window.getComputedStyle(ol).display !== 'none') throw new Error('outline layer shows by default: ' + window.getComputedStyle(ol).display);
      if (document.getElementById('outlineToggle').classList.contains('active')) throw new Error('button lit by default');
      if (_elevGuideVis()['outline-layer']) throw new Error('page renderer thinks outlines are on');
      // One press turns it on; a second turns it off.
      toggleElevLayer('outline-layer', document.getElementById('outlineToggle'));
      if (window.getComputedStyle(ol).display !== 'block') throw new Error('one press did not show it');
      toggleElevLayer('outline-layer', document.getElementById('outlineToggle'));
      if (window.getComputedStyle(ol).display !== 'none') throw new Error('second press did not hide it');
    });
  `;

  try {
    window.eval(src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
