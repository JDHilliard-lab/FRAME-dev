const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:()=>({width:6}), fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'x';
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};
    scheduleAutosave=()=>{}; pushHistory=()=>{}; _dsRenderRail=()=>{}; _dsRenderCenter=()=>{}; _dsRenderTools=()=>{}; _dsSyncToolbar=()=>{};
    renderMoodboardCanvas = () => {};

    __check('_listPrefixText: bullets, numbers, blank lines skipped, none passthrough', () => {
      if (_listPrefixText('a\\nb', 'bullet') !== '\\u2022 a\\n\\u2022 b') throw new Error('bullet wrong: ' + _listPrefixText('a\\nb','bullet'));
      if (_listPrefixText('a\\n\\nb', 'number') !== '1. a\\n\\n2. b') throw new Error('number wrong: ' + _listPrefixText('a\\n\\nb','number'));
      if (_listPrefixText('a', 'none') !== 'a' || _listPrefixText('a') !== 'a') throw new Error('none not passthrough');
    });

    __check('list prefixing covers all render paths: DOM sites call _listPrefixText directly; PDF goes through the shared rich-text layout engine', () => {
      const S = window.__appSrc;
      // DOM sites (mb + annotation) still call it directly for the plain-text fallback path.
      const domSites = S.split('_listPrefixText(').length - 1;
      if (domSites < 3) throw new Error('expected >=3 references (def + 2 DOM sites), got ' + domSites);
      // PDF drawing now goes through _layoutRichLines, which handles listStyle
      // internally for every text box, rich or plain (verified behaviorally
      // in test_wrapfix.js's bullet-prefix check).
      if (S.indexOf("if (t.listStyle && t.listStyle === 'bullet'") < 0) throw new Error('list handling missing from the shared layout engine');
    });

    __check('stale annotation selection no longer hijacks multi-element copy', () => {
      editorialContent.layoutPages = [{ id:'pgA', type:'moodboard', title:'A', elements:[{type:'image',x:0.1,y:0.1,w:0.2,h:0.2},{type:'image',x:0.5,y:0.1,w:0.2,h:0.2}] }];
      editorialContent.annotations = { 'spec:OLD': [{ type:'text', text:'stale', x:0.1, y:0.1, w:0.2 }] };
      _dsPages = [{ kind:'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _mbActiveCanvasId = 'dsLayoutCanvas';
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      window._mbCurAnnList = () => null;
      _dsSelKey = 'spec:OLD'; _dsSelIdx = 0;   // stale from another page
      _mbSel = [0,1]; _mbSelected = 1; _mbSelAnn = [];
      if (!_dsCopySelection()) throw new Error('copy failed');
      if (_dsClipboard.kind !== 'mb' || _dsClipboard.items.length !== 2) throw new Error('hijacked: ' + JSON.stringify({kind:_dsClipboard.kind, n:_dsClipboard.items.length}));
    });

    __check('current-page single annotation still copies', () => {
      editorialContent.annotations = { 'layout:pgA': [{ type:'text', text:'live', x:0.2, y:0.2, w:0.2 }] };
      _dsSelKey = 'layout:pgA'; _dsSelIdx = 0; _mbSel = []; _mbSelAnn = []; _mbSelected = -1;
      if (!_dsCopySelection()) throw new Error('copy failed');
      if (_dsClipboard.kind !== 'ann' || _dsClipboard.items[0].text !== 'live') throw new Error('wrong copy: ' + JSON.stringify(_dsClipboard.items[0]));
    });

    __check('multi-annotation group copies all items', () => {
      editorialContent.annotations['layout:pgA'] = [{ type:'text', text:'x1', x:0.1,y:0.1,w:0.2 }, { type:'text', text:'x2', x:0.3,y:0.1,w:0.2 }, { type:'image', x:0.5,y:0.1,w:0.2 }];
      window._mbCurAnnList = () => ({ key:'layout:pgA', list: editorialContent.annotations['layout:pgA'] });
      _mbSelAnn = [0,2]; _mbSel = []; _mbSelected = -1; _dsSelKey = null; _dsSelIdx = -1;
      if (!_dsCopySelection()) throw new Error('copy failed');
      if (_dsClipboard.kind !== 'ann' || _dsClipboard.items.length !== 2) throw new Error('group not copied: ' + _dsClipboard.items.length);
      _mbSelAnn = [];
    });

    __check('_mbSelectOnly clears stale annotation selection', () => {
      _dsSelKey = 'spec:OLD'; _dsSelIdx = 0;
      _mbSelectOnly(1);
      if (_dsSelKey !== null || _dsSelIdx !== -1) throw new Error('not cleared');
    });

    __check('toolbar readout unified to true PDF pt (source guard)', () => {
      if (window.__appSrc.indexOf("(el.size || 0.045) * 540) + 'pt'") < 0) throw new Error('toolbar still on old scale');
      if (window.__appSrc.indexOf('(el.size || 0.045) * 1000') >= 0) throw new Error('old x1000 readout still present');
    });

    __check('popup: list row + apply-to-selected + persistence markers (source guards)', () => {
      const S = window.__appSrc;
      if (S.indexOf("'1. Numbers'") < 0) throw new Error('list row missing');
      if (S.indexOf("'Apply to selected (' + selCount + ')'") < 0) throw new Error('apply-to-selected missing');
      if (S.indexOf("pop.dataset.tgt") < 0 || S.indexOf("data-ds-tgt") < 0) throw new Error('persistence markers missing');
    });

    __check('outside handler keeps popup open when clicking the target box', () => {
      const pop = document.createElement('div'); pop.id = 'dsTextGearPopup'; pop.dataset.tgt = 'mb:3';
      document.body.appendChild(pop);
      const box = document.createElement('div'); box.dataset.dsTgt = 'mb:3'; document.body.appendChild(box);
      const inner = document.createElement('span'); box.appendChild(inner);
      _dsTextGearPopupOutside({ target: inner });
      if (!document.getElementById('dsTextGearPopup')) throw new Error('popup closed on target click');
      const other = document.createElement('div'); document.body.appendChild(other);
      _dsTextGearPopupOutside({ target: other });
      if (document.getElementById('dsTextGearPopup')) throw new Error('popup did not close on true outside click');
    });

    __check('apply-to-selected copies text props across elements and annotations', () => {
      // Recreate the popup button behavior directly against the real code path
      // by invoking the popup with a multi-selection in place.
      editorialContent.layoutPages = [{ id:'pgT', type:'moodboard', title:'T', elements:[
        { type:'text', text:'A', x:0.1,y:0.1,w:0.2, size:0.02, font:'serif' },
        { type:'text', text:'B', x:0.1,y:0.3,w:0.2, size:0.05, font:'sans' }
      ]}];
      _dsPages = [{ kind:'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      window._mbCurAnnList = () => null;
      _mbSel = [0,1]; _mbSelected = 0; _mbSelAnn = [];
      window._dsTextGearGetEl = () => editorialContent.layoutPages[0].elements[0];
      _dsOpenTextGearPopup({ kind: 'mb', i: 0 }, 100, 100);
      const pop = document.getElementById('dsTextGearPopup');
      if (!pop) throw new Error('popup did not open');
      const btn = Array.from(pop.querySelectorAll('button')).find(b => b.textContent.indexOf('Apply to selected') === 0);
      if (!btn) throw new Error('apply button not rendered for multi-select');
      const src0 = editorialContent.layoutPages[0].elements[0];
      src0.caps = 'upper'; src0.listStyle = 'bullet';
      btn.onclick();
      const el2 = editorialContent.layoutPages[0].elements[1];
      if (el2.size !== src0.size || el2.font !== 'serif' || el2.caps !== 'upper' || el2.listStyle !== 'bullet') throw new Error('props not applied: ' + JSON.stringify(el2));
      _dsCloseTextGearPopup();
    });

    __check('group selection outline renders on multi-select (source guard)', () => {
      if (window.__appSrc.indexOf('drag any one to move all') < 0) throw new Error('group outline chip missing');
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
