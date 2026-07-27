const { JSDOM } = require('jsdom');
const fs = require('fs');

(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(require('path').join(__dirname,'..','index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){} });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => {
      try { fn(); window.__testResults.push({ label, ok: true }); }
      catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); }
    };

    // ── Fixtures: a per-piece spec deck with one piece ──
    dashProjectData = [{ id: 'ART.001', location: 'Wall A' }];
    elevations = [{ name: 'WALL A', wallW: 240, wallH: 96, frames: [{ id: 'ART.001', letter: 'A', x: 0.4, y: 0.4, w: 0.1, h: 0.1, active: true, dimTo: [] }] }];
    floorplanLevels = [{ name: 'Level 1', imageData: '' }];
    editorialContent = editorialContent || {};
    editorialContent.specTemplateOverrides = { 'ART.002': 'artSpecDetail' };   // a per-page override that must survive everything
    _dsPages = [{ kind: 'spec', type: 'spec', title: 'ART.001', row: { id: 'ART.001' }, members: [{ id: 'ART.001' }], _ovKey: 'ART.001' }];
    _dsIndex = 0;
    // Neutralize heavy side effects — we only care about the state machine.
    _dsRefresh = () => {};
    _dsClearBuiltAll = () => {};
    _dsBuildAllThumbs = () => {};
    _dsQueueTplSwatch = () => {};
    _dsPriorityRerender = () => {};
    _dsRenderCenter = () => {};
    scheduleAutosave = () => {};
    pushHistory = () => {};
    showInfoModal = () => {};
    if (!document.getElementById('dsTools')) {
      const t = document.createElement('div'); t.id = 'dsTools'; document.body.appendChild(t);
    }

    const clickMode = (label) => {
      _dsRenderTools();   // rebuild panel so the buttons reflect current state
      const t = document.getElementById('dsTools');
      const btn = Array.from(t.querySelectorAll('button')).find(b => b.textContent === label);
      if (!btn) throw new Error('mode button not found: ' + label);
      if (!btn.onclick) return;   // already-active mode buttons have no handler
      btn.onclick();
    };

    __check('Per piece template survives a round trip through Install guide', () => {
      editorialContent.specTemplate = 'frameSpecDetail';
      editorialContent.specTplMemory = {};
      clickMode('Install guide');
      if (editorialContent.specTemplate !== 'installGuide') throw new Error('did not enter install guide: ' + editorialContent.specTemplate);
      clickMode('Per piece');
      if (editorialContent.specTemplate !== 'frameSpecDetail') throw new Error('per-piece template was reset to: ' + editorialContent.specTemplate);
    });

    __check('Group A/B/C sub-choice (setScale) survives a round trip through Install guide', () => {
      editorialContent.specTemplate = 'setScale';
      editorialContent.specTplMemory = {};
      clickMode('Install guide');
      clickMode('Group A/B/C');
      if (editorialContent.specTemplate !== 'setScale') throw new Error('group template was reset to: ' + editorialContent.specTemplate);
    });

    __check('All three modes remembered across a full tour', () => {
      editorialContent.specTemplate = 'frameSpecDetail';
      editorialContent.specTplMemory = {};
      clickMode('Group A/B/C');       // first entry: default setRight
      if (editorialContent.specTemplate !== 'setRight') throw new Error('first group entry not default: ' + editorialContent.specTemplate);
      editorialContent.specTemplate = 'setRow';   // user picks a different group layout via the cards
      clickMode('Install guide');
      clickMode('Per piece');
      if (editorialContent.specTemplate !== 'frameSpecDetail') throw new Error('per piece lost after tour: ' + editorialContent.specTemplate);
      clickMode('Group A/B/C');
      if (editorialContent.specTemplate !== 'setRow') throw new Error('group choice lost after tour: ' + editorialContent.specTemplate);
    });

    __check('legacy classic choice is remembered too', () => {
      editorialContent.specTemplate = 'classic';
      editorialContent.specTplMemory = { perPiece: 'frameSpecDetail' };   // stale older memory
      clickMode('Install guide');    // leaving classic must overwrite the stale memory
      clickMode('Per piece');
      if (editorialContent.specTemplate !== 'classic') throw new Error('classic was not restored (stale memory won): ' + editorialContent.specTemplate);
    });

    __check('first-time entry into a mode uses its default', () => {
      editorialContent.specTemplate = 'classic';
      editorialContent.specTplMemory = {};
      clickMode('Group A/B/C');
      if (editorialContent.specTemplate !== 'setRight') throw new Error('group default wrong: ' + editorialContent.specTemplate);
    });

    __check('per-page overrides are never touched by mode switching', () => {
      editorialContent.specTemplate = 'frameSpecDetail';
      editorialContent.specTplMemory = {};
      clickMode('Install guide');
      clickMode('Group A/B/C');
      clickMode('Per piece');
      const ov = (editorialContent.specTemplateOverrides || {})['ART.002'];
      if (ov !== 'artSpecDetail') throw new Error('per-page override lost: ' + ov);
    });

    __check('corrupt/unknown remembered template falls back to the mode default', () => {
      editorialContent.specTemplate = 'installGuide';
      editorialContent.specTplMemory = { perPiece: 'nonsenseKey' };
      clickMode('Per piece');
      if (editorialContent.specTemplate !== 'classic') throw new Error('bad memory not rejected: ' + editorialContent.specTemplate);
    });
  `;

  try {
    window.eval(src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => {
    console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err));
    if (!r.ok) failures.push(r.label);
  });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
