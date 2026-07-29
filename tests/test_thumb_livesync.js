const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __checkAsync = (label, fn) => { const p2 = __chain.then(fn).then(() => ({ label, ok: true })).catch(e => ({ label, ok: false, err: e.message })); __chain = p2.then(() => {}); window.__asyncChecks.push(p2); };
    editorialContent = editorialContent || {};
    performAutosave = () => {};   // no-op the real localStorage write for these tests

    let __rerenderCalls = [];
    window.__realPriorityRerender = _dsPriorityRerender;
    _dsPriorityRerender = (desc) => { __rerenderCalls.push(desc); };

    __checkAsync('scheduleAutosave triggers a debounced thumbnail rerender for the current page while Deck Studio is open', async () => {
      const modal = document.getElementById('view-deck'); modal.classList.add('active');
      editorialContent.layoutPages = [{ id: 'pgA', type: 'moodboard', title: 'A', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      __rerenderCalls = [];
      scheduleAutosave();
      if (__rerenderCalls.length !== 0) throw new Error('rerender fired immediately instead of being debounced');
      await new Promise(r => setTimeout(r, 550));
      if (__rerenderCalls.length !== 1) throw new Error('expected exactly 1 debounced rerender, got ' + __rerenderCalls.length);
      if (__rerenderCalls[0] !== _dsPages[0]) throw new Error('rerender called with the wrong page descriptor');
      modal.classList.remove('active');
    });

    __checkAsync('RAPID successive edits (fast typing) collapse into a single thumbnail refresh, not one per keystroke', async () => {
      const modal = document.getElementById('view-deck'); modal.classList.add('active');
      editorialContent.layoutPages = [{ id: 'pgB', type: 'moodboard', title: 'B', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      __rerenderCalls = [];
      for (let i = 0; i < 10; i++) { scheduleAutosave(); await new Promise(r => setTimeout(r, 30)); }
      await new Promise(r => setTimeout(r, 550));
      if (__rerenderCalls.length !== 1) throw new Error('expected debouncing to collapse 10 rapid calls into 1 rerender, got ' + __rerenderCalls.length);
      modal.classList.remove('active');
    });

    __checkAsync('EFFICIENCY: no thumbnail rerender is triggered when Deck Studio is closed', async () => {
      const modal = document.getElementById('view-deck'); modal.classList.remove('active');
      editorialContent.layoutPages = [{ id: 'pgC', type: 'moodboard', title: 'C', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      __rerenderCalls = [];
      scheduleAutosave();
      await new Promise(r => setTimeout(r, 550));
      if (__rerenderCalls.length !== 0) throw new Error('rerender fired even though Deck Studio is closed \\u2014 wasted work');
      modal.classList.remove('active');
    });

    __checkAsync('CORRECTNESS: switching pages before the debounce fires still refreshes the ORIGINALLY-edited page, not the newly-selected one', async () => {
      const modal = document.getElementById('view-deck'); modal.classList.add('active');
      editorialContent.layoutPages = [
        { id: 'pgD1', type: 'moodboard', title: 'D1', elements: [] },
        { id: 'pgD2', type: 'moodboard', title: 'D2', elements: [] }
      ];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }, { kind: 'layout', page: editorialContent.layoutPages[1] }];
      _dsIndex = 0;
      __rerenderCalls = [];
      scheduleAutosave();          // editing page D1
      _dsIndex = 1;                // user quickly switches to D2 before the debounce fires
      await new Promise(r => setTimeout(r, 550));
      if (__rerenderCalls.length !== 1) throw new Error('expected exactly 1 rerender, got ' + __rerenderCalls.length);
      if (__rerenderCalls[0] !== _dsPages[0]) throw new Error('refreshed the wrong page \\u2014 should be the one being edited (D1) at schedule time, not whatever is selected when the timer fires');
      modal.classList.remove('active');
    });
  `;
  try { window.eval(src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = window.__testResults || [];
  const asyncResults = await Promise.all(window.__asyncChecks || []);
  const all = results.concat(asyncResults);
  let failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
