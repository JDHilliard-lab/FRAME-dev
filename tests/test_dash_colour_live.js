// 19.57, "The color picker seem to be very laggy in frame tool": the mat, backer and paper
// colour inputs called syncDashAndCalculate() on every input event, and a colour picker fires
// one per frame while dragging. Each rebuilt the whole item table (and forced its layout on
// the next preview measure): ~120ms a step on the 50-row Ford project. Live ticks now redraw
// the preview only; the table, walls and warnings follow once when the colour settles.
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
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __check = (label, fn) => {
      __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true }))
        .catch(e => ({ label, ok: false, err: e.message })));
      window.__asyncChecks.push(__chain);
    };
    _autosaveToldUser = true;
    scheduleAutosave = () => {}; pushHistory = () => {};
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    let tables = 0, pushes = [];
    const realTable = renderDashTable, realPush = pushUpdatesToElevations;
    renderDashTable = function () { tables++; return realTable.apply(this, arguments); };
    pushUpdatesToElevations = function (i) { pushes.push(dashProjectData[i] && dashProjectData[i].id); };
    const setup = () => {
      dashProjectData = [Object.assign({}, dashDefaultData, { id: 'ART.1' }), Object.assign({}, dashDefaultData, { id: 'ART.2' })];
      dashSelectedRowIndex = 0;
      loadDashDataIntoControls(dashProjectData[0]);
      tables = 0; pushes = [];
    };
    // runScripts 'outside-only' never runs inline handlers: run the picker's own attribute text
    const fire = (id, ev) => eval(document.getElementById(id).getAttribute('on' + ev));
    const tick = (id, hex) => { document.getElementById(id).value = hex; fire(id, 'input'); };

    __check('EXACT BUG: dragging a mat colour does not rebuild the item table on every step', async () => {
      setup();
      for (let i = 0; i < 20; i++) tick('m1_colorHex', '#' + (0x808080 + i * 0x010101).toString(16));
      if (tables !== 0) throw new Error('the table was rebuilt ' + tables + ' times during the drag');
      if (dashProjectData[0].m1ColorHex !== '#939393') throw new Error('the row did not take the colour live: ' + dashProjectData[0].m1ColorHex);
      await wait(DASH_LIVE_MS + 60);
      if (tables !== 1) throw new Error('expected one rebuild after the drag, got ' + tables);
      if (pushes.join() !== 'ART.1') throw new Error('walls not updated once for ART.1: ' + pushes.join());
    });
    __check('closing the picker (change) settles at once, and the pending pass is dropped', async () => {
      setup();
      tick('m1_colorHex', '#112233');
      fire('m1_colorHex', 'change');
      if (tables !== 1) throw new Error('change did not do the full sync');
      await wait(DASH_LIVE_MS + 60);
      if (tables !== 1) throw new Error('the live pass ran again after change');
    });
    __check('picking another row mid-settle still sends the first row to its walls', async () => {
      setup();
      tick('sbPaperColorHex', '#ddeeff');
      dashSelectedRowIndex = 1; loadDashDataIntoControls(dashProjectData[1]);
      syncDashAndCalculate();
      await wait(DASH_LIVE_MS + 60);
      if (pushes.indexOf('ART.1') < 0) throw new Error('ART.1 never reached its walls: ' + pushes.join());
      if (dashProjectData[0].sbPaperColorHex !== '#ddeeff') throw new Error('ART.1 lost its colour');
    });
    __check('all four colour pickers are wired live, and settle on change', () => {
      ['m1_colorHex', 'm2_colorHex', 'sbBackerColorHex', 'sbPaperColorHex'].forEach(id => {
        const el = document.getElementById(id);
        if ((el.getAttribute('oninput') || '').indexOf('live:true') < 0) throw new Error(id + ' still does a full sync per step');
        if ((el.getAttribute('onchange') || '').indexOf('syncDashAndCalculate()') < 0) throw new Error(id + ' has no settle on change');
      });
    });
  `;

  try {
    window.eval(src + '\n' + testBlock);
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
