const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(require('path').join(__dirname,'..','index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};
    scheduleAutosave = () => {}; pushHistory = () => {};
    _dsRenderRail = () => {}; _dsRenderCenter = () => {}; _dsRenderTools = () => {}; _dsSyncToolbar = () => {};
    renderMoodboardCanvas = () => {};

    __check('layout page titles never reach the drawer (source guard)', () => {
      const src2 = window.__appSrc;
      if (src2.indexOf("_drawMoodboardPage(rec, logos, 1, meta, tiles, '', desc.page.type") < 0) throw new Error('preview still passes title');
      if ((src2.match(/_drawMoodboardPage\\(doc, logos, pageNum, meta, tiles, '', page.type, 'layout:' \\+ page.id\\);/g) || []).length !== 2) throw new Error('export still passes title');
    });

    __check('duplicate clone anchors directly after the source', () => {
      editorialContent.layoutPages = [{ id: 'pgAAA', type: 'moodboard', title: 'AA- Heading Only', place: 'afterSpec', elements: [{ type: 'text', text: 'X', x: 0.1, y: 0.1, w: 0.3 }] }];
      const desc = { kind: 'layout', page: editorialContent.layoutPages[0] };
      dashProjectData = []; elevations = []; floorplanLevels = [];
      _dsPages = [desc]; _dsIndex = 0;
      _dsDuplicateLayoutPage(desc);
      const clone = editorialContent.layoutPages[1];
      if (!clone) throw new Error('no clone');
      if (clone.afterKey !== 'layout:pgAAA') throw new Error('clone not anchored after source: ' + clone.afterKey);
      if (clone.place !== 'afterSpec') throw new Error('placement not inherited');
    });

    __check('_dsMoveLayoutPage re-anchors earlier and later', () => {
      // Build a fake deck list of three pages and move the middle one.
      const p1 = { id: 'pg1', type: 'moodboard', title: 'One', elements: [] };
      const p2 = { id: 'pg2', type: 'moodboard', title: 'Two', elements: [] };
      const p3 = { id: 'pg3', type: 'moodboard', title: 'Three', elements: [] };
      const d1 = { kind: 'layout', page: p1 }, d2 = { kind: 'layout', page: p2 }, d3 = { kind: 'layout', page: p3 };
      window._deckPageList = () => [d1, d2, d3];
      _dsMoveLayoutPage(d2, -1);
      if (p2.afterKey !== '__start__') throw new Error('move earlier to start failed: ' + p2.afterKey);
      _dsMoveLayoutPage(d2, 1);
      if (p2.afterKey !== 'layout:pg3') throw new Error('move later failed: ' + p2.afterKey);
    });

    __check('paste keeps exact position on a different page, nudges on the same page', () => {
      editorialContent.annotations = { 'spec:A': [{ type: 'text', text: 'H', x: 0.25, y: 0.3, w: 0.2 }], 'spec:B': [] };
      _dsPages = [{ kind: 'spec', type: 'spec', title: 'A', row: { id: 'A' } }, { kind: 'spec', type: 'spec', title: 'B', row: { id: 'B' } }];
      _dsIndex = 0; _dsSelKey = 'spec:A'; _dsSelIdx = 0;
      window._dsCurrentAnnot = () => editorialContent.annotations['spec:A'][0];
      if (!_dsCopySelection()) throw new Error('copy failed');
      window._dsCurrentAnnot = () => null;
      _dsIndex = 1; _dsSelKey = null; _dsSelIdx = -1;
      if (!_dsPasteClipboard()) throw new Error('paste failed');
      const pasted = editorialContent.annotations['spec:B'][0];
      if (Math.abs(pasted.x - 0.25) > 1e-9 || Math.abs(pasted.y - 0.3) > 1e-9) throw new Error('cross-page paste moved: ' + pasted.x + ',' + pasted.y);
      _dsIndex = 0;
      if (!_dsPasteClipboard()) throw new Error('same-page paste failed');
      const p2 = editorialContent.annotations['spec:A'][1];
      if (Math.abs(p2.x - 0.27) > 1e-9) throw new Error('same-page paste did not nudge: ' + p2.x);
    });

    __check('Delete key removes selected layout elements', () => {
      editorialContent.layoutPages = [{ id: 'pgD', type: 'moodboard', title: 'D', elements: [{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }] }];
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      _mbActiveCanvasId = 'dsLayoutCanvas'; _mbSelected = 1; _mbSel = [0, 2];
      _dsSelKey = null; _dsSelIdx = -1;
      _dsAnnotKeydown({ key: 'Delete', preventDefault(){}, ctrlKey: false, metaKey: false });
      const els = editorialContent.layoutPages[0].elements;
      if (els.length !== 1 || els[0].type !== 'image') throw new Error('wrong elements remain: ' + JSON.stringify(els));
      if (_mbSelected !== -1 || _mbSel.length) throw new Error('selection not cleared');
    });

    __check('Ctrl+] brings selected element above everything (text over image)', () => {
      editorialContent.layoutPages = [{ id: 'pgZ', type: 'moodboard', title: 'Z', elements: [{ type: 'text', z: 0 }, { type: 'image', z: 5 }] }];
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      _mbActiveCanvasId = 'dsLayoutCanvas'; _mbSelected = 0; _mbSel = [];
      _dsAnnotKeydown({ key: ']', ctrlKey: true, metaKey: false, preventDefault(){} });
      const els = editorialContent.layoutPages[0].elements;
      if (!(els[0].z > els[1].z)) throw new Error('text not brought above image: ' + els[0].z + ' vs ' + els[1].z);
    });

    __check('line entry exists in the arrow shape menu and sets tip none (source guard)', () => {
      const src2 = window.__appSrc;
      if (src2.indexOf("['line', 'Line (no head)'") < 0) throw new Error('line entry missing');
      if (src2.indexOf("if (kind === 'line') _dsSetArrowDefault('tip', 'none');") < 0) throw new Error('line tip default missing');
      if (src2.indexOf("else if (kind === 'arrow') _dsSetArrowDefault('tip', 'arrow');") < 0) throw new Error('arrow restore missing');
    });

    __check('footer follows the safety frame width (PDF)', () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: false };
      editorialContent.pageFooters = {}; editorialContent.footer = {};
      _curFooter = _resolveFooter('layout:pgF');
      const rec = new CanvasPdfRec(936, 540);
      _drawPdfFooter(rec, {}, 3, { location: 'LOBBY', code: 'C', version: '1' });
      const SL = 0.0234 * 936;
      const pn = rec.ops.find(o => o.t === 'text' && o.str === '3');
      if (!pn) throw new Error('page number op missing');
      if (Math.abs(pn.x - SL) > 0.6) throw new Error('page number not on safety left: ' + pn.x + ' vs ' + SL);
    });

    __check('caps toggle present in popup and _textExtraCss uppercases (regression)', () => {
      const src2 = window.__appSrc;
      if (src2.indexOf("a.caps = (a.caps === 'upper') ? 'none' : 'upper';") < 0) throw new Error('AA toggle missing');
      const css = _textExtraCss({ caps: 'upper' });
      if (css.indexOf('uppercase') < 0) throw new Error('caps css missing');
    });

    __check('stepper is now a typeable number input (source guard)', () => {
      const src2 = window.__appSrc;
      if (src2.indexOf("v.type = 'number'") < 0) throw new Error('numeric input missing from stepper');
    });

    __check('_dsWirePageDeselect clears annotation selection on empty click', () => {
      const page = document.createElement('div'); document.body.appendChild(page);
      const child = document.createElement('div'); page.appendChild(child);
      _dsSelKey = 'spec:A'; _dsSelIdx = 0; _mbSelAnn = [];
      let rendered = 0; window._dsRenderCenter = () => { rendered++; };
      window._dsCloseTextGearPopup = () => {};
      _dsWirePageDeselect(page);
      child.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
      if (_dsSelKey !== null || _dsSelIdx !== -1) throw new Error('selection not cleared');
      if (!rendered) throw new Error('center not re-rendered');
    });
  `;
  try { window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
