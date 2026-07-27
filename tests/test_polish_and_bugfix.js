const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ measureText:()=>({width:6}), scale(){}, fillRect(){}, drawImage(){}, fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'x';
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};
    scheduleAutosave = () => {}; pushHistory = () => {}; _dsRenderRail = () => {}; _dsRenderTools = () => {}; _dsSyncToolbar = () => {}; _dsSyncApprovedBtn = () => {}; renderMoodboardCanvas = () => {};

    __check('EXACT BUG: deleting the first of a 3-page anchor chain no longer orphans the other two to the end of the deck', () => {
      // Reproduces Jordan's exact scenario: three pages added via the quick +
      // button, each anchored after the previous one, then the first is deleted.
      editorialContent.layoutPages = [
        { id: 'p1', type: 'custom', title: 'New Page', elements: [], afterKey: '__start__' },
        { id: 'p2', type: 'custom', title: 'New Page', elements: [], afterKey: 'layout:p1' },
        { id: 'p3', type: 'custom', title: 'New Page', elements: [], afterKey: 'layout:p2' }
      ];
      editorialContent.contacts = 'x'; // ensure a Thank You page exists so it can act as the trap
      editorialContent.annotations = {};
      _dsIndex = 0;
      _dsDeleteLayoutPage({ kind: 'layout', page: editorialContent.layoutPages[0] });
      // p2 must now inherit p1's old anchor ('__start__'), NOT be orphaned.
      const p2 = editorialContent.layoutPages.find(p => p.id === 'p2');
      const p3 = editorialContent.layoutPages.find(p => p.id === 'p3');
      if (p2.afterKey !== '__start__') throw new Error('p2 did not inherit the deleted page\\'s anchor: ' + p2.afterKey);
      if (p3.afterKey !== 'layout:p2') throw new Error('p3\\'s anchor should be untouched (p2 still exists): ' + p3.afterKey);
    });

    __check('EXACT BUG, end to end: the resolved page list keeps p2 and p3 in their correct relative position, not pushed after Thank You', () => {
      editorialContent.layoutPages = [
        { id: 'q1', type: 'custom', title: 'Q1', elements: [], afterKey: '__start__' },
        { id: 'q2', type: 'custom', title: 'Q2', elements: [], afterKey: 'layout:q1' },
        { id: 'q3', type: 'custom', title: 'Q3', elements: [], afterKey: 'layout:q2' }
      ];
      editorialContent.annotations = {};
      editorialContent.contacts = 'Thank you note';
      _dsDeleteLayoutPage({ kind: 'layout', page: editorialContent.layoutPages[0] });
      const list = _deckPageList();
      const idxQ2 = list.findIndex(d => d.kind === 'layout' && d.page && d.page.id === 'q2');
      const idxQ3 = list.findIndex(d => d.kind === 'layout' && d.page && d.page.id === 'q3');
      const idxThankYou = list.findIndex(d => d.kind === 'card' && d.type === 'contacts');
      if (idxQ2 < 0 || idxQ3 < 0) throw new Error('pages vanished entirely');
      if (idxThankYou >= 0 && idxQ2 > idxThankYou) throw new Error('q2 ended up after Thank You \\u2014 the exact reported bug: q2 at ' + idxQ2 + ', Thank You at ' + idxThankYou);
      if (idxThankYou >= 0 && idxQ3 > idxThankYou) throw new Error('q3 ended up after Thank You \\u2014 the exact reported bug: q3 at ' + idxQ3 + ', Thank You at ' + idxThankYou);
      if (idxQ3 !== idxQ2 + 1) throw new Error('q3 no longer immediately follows q2: q2=' + idxQ2 + ' q3=' + idxQ3);
    });

    __check('deleting a MIDDLE page of a chain still correctly relinks the tail', () => {
      editorialContent.layoutPages = [
        { id: 'r1', type: 'custom', title: 'R1', elements: [], afterKey: '__start__' },
        { id: 'r2', type: 'custom', title: 'R2', elements: [], afterKey: 'layout:r1' },
        { id: 'r3', type: 'custom', title: 'R3', elements: [], afterKey: 'layout:r2' }
      ];
      editorialContent.annotations = {};
      _dsDeleteLayoutPage({ kind: 'layout', page: editorialContent.layoutPages[1] });   // delete r2
      const r3 = editorialContent.layoutPages.find(p => p.id === 'r3');
      if (r3.afterKey !== 'layout:r1') throw new Error('r3 did not inherit r2\\'s anchor after r2 was deleted: ' + r3.afterKey);
    });

    __check('annotations for the deleted page are still cleaned up correctly alongside the relinking', () => {
      editorialContent.layoutPages = [
        { id: 's1', type: 'custom', title: 'S1', elements: [], afterKey: '__start__' },
        { id: 's2', type: 'custom', title: 'S2', elements: [], afterKey: 'layout:s1' }
      ];
      editorialContent.annotations = { 'layout:s1': [{ type: 'arrow', x1:0,y1:0,x2:1,y2:1 }] };
      _dsDeleteLayoutPage({ kind: 'layout', page: editorialContent.layoutPages[0] });
      if (editorialContent.annotations['layout:s1']) throw new Error('deleted page annotations not cleaned up');
    });

    __check('the dormant _dsDeleteInserted path has the same relinking fix', () => {
      editorialContent.layoutPages = [
        { id: 't1', type: 'custom', title: 'T1', elements: [], afterKey: '__start__' },
        { id: 't2', type: 'custom', title: 'T2', elements: [], afterKey: 'layout:t1' }
      ];
      editorialContent.annotations = {};
      _dsDeleteInserted(editorialContent.layoutPages[0]);
      const t2 = editorialContent.layoutPages.find(p => p.id === 't2');
      if (t2.afterKey !== '__start__') throw new Error('_dsDeleteInserted did not relink: ' + t2.afterKey);
    });

    __check('CSS FIX: the center preview banner and page mock are wrapped as a single flex-column child of dsCenter (no more side-by-side squish)', () => {
      editorialContent.layoutPages = [{ id: 'pgCenter', type: 'moodboard', title: 'Center test', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._dsCurrentEditablePage = () => ({ page: editorialContent.layoutPages[0], type: 'moodboard' });
      _dsPreviewTemplateInCenter({ selKey: 'blank', name: 'Blank page', els: [], source: 'blank' });
      const center = document.getElementById('dsCenter');
      if (center.children.length !== 1) throw new Error('dsCenter has ' + center.children.length + ' direct children instead of exactly 1 \\u2014 the squish bug');
      const outer = center.children[0];
      if (outer.style.flexDirection !== 'column') throw new Error('outer wrapper is not flex-column: ' + outer.style.flexDirection);
    });

    __check('LOCKED HEADER: the Templates sub-panel splits into a fixed header and a separately-scrolling list', () => {
      _dsToolsTab('templates');
      const host = document.getElementById('dsToolsTemplatesBody');
      const kids = Array.from(host.children);
      if (kids.length !== 2) throw new Error('expected exactly 2 direct children (header, list), got ' + kids.length);
      const header = kids[0], list = kids[1];
      if (header.style.flexShrink !== '0') throw new Error('header is not flex-shrink:0, it would scroll away: ' + header.style.flexShrink);
      if (list.style.overflowY !== 'auto') throw new Error('list is not independently scrollable: ' + list.style.overflowY);
      // the persistent controls must live in the header, not the list
      if (!header.textContent.includes('Templates')) throw new Error('title missing from header');
      const headerBtns = Array.from(header.querySelectorAll('button')).map(b => b.textContent);
      if (headerBtns.indexOf('+ Save current page') < 0 || headerBtns.indexOf('+ Category') < 0) throw new Error('persistent buttons not in the locked header: ' + headerBtns.join(','));
      // the actual template thumbnails must live in the scrollable list, not the header
      if (header.querySelector('.tpl-card')) throw new Error('a template thumbnail leaked into the locked header');
      if (!list.querySelector('.tpl-card')) throw new Error('no template thumbnails found in the scrollable list');
    });
  `;
  try { window.eval(src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
