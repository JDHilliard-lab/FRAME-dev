// 19.73: an edit on the Frame Dashboard form keeps every field the form does not own.
//
// Found while rebuilding Ford Admin Rouge: syncDashAndCalculate REBUILDS the row from the
// form on every keystroke, keeping only the fields it lists. The plan's wall line
// (planWalls / wallLine / wallPanels) and the pins on other plans (planPins) were not on
// the list, so the first edit to a piece erased its wall line from the floor plan. On the
// Ford file all 31 pieces lost theirs on a single edit each.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _autosaveToldUser = true; scheduleAutosave = () => {}; pushHistory = () => {};
    const seed = () => {
      const r = _cloneData(dashDefaultData);
      Object.assign(r, { id: 'ART.2A', location: 'TIMELINE WALL', level: 0, planX: 0.84, planY: 0.548,
        planPins: [{ lv: 0, x: 0.84, y: 0.548 }, { lv: 1, x: 0.2, y: 0.3 }],
        planWalls: [{ lv: 0, wallLine: { x1: 0.8581, y1: 0.3984, x2: 0.8581, y2: 0.6408 }, wallPanels: 1 }],
        wallLine: { x1: 0.8581, y1: 0.3984, x2: 0.8581, y2: 0.6408 }, wallPanels: 1, someFutureField: { a: 1 } });
      dashProjectData = [r]; dashSelectedRowIndex = 0; loadDashDataIntoControls(r);
    };
    __check('EXACT BUG: editing a piece on the dashboard keeps its floor plan wall line', () => {
      seed();
      document.getElementById('m_location').value = 'TIMELINE WALL | FRAMED ART';
      syncDashAndCalculate();
      const a = dashProjectData[0];
      if (!a.wallLine || a.wallLine.x1 !== 0.8581) throw new Error('wallLine lost');
      if (!Array.isArray(a.planWalls) || !a.planWalls.length) throw new Error('planWalls lost');
      if (a.wallPanels !== 1) throw new Error('wallPanels lost');
    });
    __check('and its pin on a second plan', () => {
      seed(); syncDashAndCalculate();
      const a = dashProjectData[0];
      if (!Array.isArray(a.planPins) || a.planPins.length !== 2) throw new Error('planPins ' + JSON.stringify(a.planPins));
    });
    __check('and any field added later, without a list to remember', () => {
      seed(); syncDashAndCalculate();
      if (!dashProjectData[0].someFutureField) throw new Error('an unlisted field was dropped');
    });
    __check('what the form owns still comes from the form', () => {
      seed();
      document.getElementById('m_location').value = 'NEW PLACE';
      syncDashAndCalculate();
      if (dashProjectData[0].location !== 'NEW PLACE') throw new Error('location ' + dashProjectData[0].location);
    });
  `;
  try { window.eval(src + '\n' + testBlock); } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
