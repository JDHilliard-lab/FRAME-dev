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
    scheduleAutosave=()=>{}; pushHistory=()=>{};
    _dsRenderCenter = () => {};

    __check('arrow tool always arms the full annotation system, even on editable pages', () => {
      editorialContent.layoutPages = [{ id:'pgA', type:'moodboard', title:'A', elements:[] }];
      _dsPages = [{ kind:'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._dsCurrentEditablePage = () => _dsPages[0];
      _dsActiveTab = 'pages'; _dsArmedShape = null;
      _dsAddArrowSmart('arrow');
      if (_dsArmedShape !== 'arrow') throw new Error('not armed: ' + _dsArmedShape);
      if (editorialContent.layoutPages[0].elements.length) throw new Error('mb arrow was created instead');
      _dsArmedShape = null;
      _dsAddArrowSmart('elbowPath');
      if (_dsArmedShape !== 'elbowPath') throw new Error('multipoint not armed');
      _dsArmedShape = null;
    });

    __check('migration: layout arrow/elbow elements become full annotations', () => {
      editorialContent.layoutPages = [{ id:'pgM', type:'moodboard', title:'M', elements:[
        { type:'text', text:'keep', x:0.1,y:0.1,w:0.2, size:0.03 },
        { type:'arrow', x1:0.2, y1:0.3, x2:0.5, y2:0.3, color:'#ff0000', weight:2, tip:'none', z:7 },
        { type:'elbow', pts:[{x:0.1,y:0.5},{x:0.3,y:0.5},{x:0.3,y:0.7}], color:'#00ff00', weight:1.5, z:7 }
      ]}];
      editorialContent.annotations = {};
      _migrateLayoutArrows();
      const els = editorialContent.layoutPages[0].elements;
      if (els.length !== 1 || els[0].type !== 'text') throw new Error('elements wrong after migration: ' + JSON.stringify(els.map(e2=>e2.type)));
      const ann = editorialContent.annotations['layout:pgM'];
      if (!ann || ann.length !== 2) throw new Error('annotations missing: ' + JSON.stringify(ann));
      const ar = ann.find(a2 => a2.type === 'arrow'), el2 = ann.find(a2 => a2.type === 'elbow');
      if (!ar || ar.color !== '#ff0000' || ar.weight !== 2 || ar.tip !== 'none' || ar.x2 !== 0.5) throw new Error('arrow fields lost: ' + JSON.stringify(ar));
      if (!el2 || el2.pts.length !== 3 || el2.pts[2].y !== 0.7 || el2.color !== '#00ff00') throw new Error('elbow fields lost: ' + JSON.stringify(el2));
    });

    __check('migration is idempotent and leaves non-arrow elements alone', () => {
      const before = JSON.stringify(editorialContent.annotations['layout:pgM']);
      _migrateLayoutArrows();
      if (JSON.stringify(editorialContent.annotations['layout:pgM']) !== before) throw new Error('second run changed annotations');
      if (editorialContent.layoutPages[0].elements.length !== 1) throw new Error('elements changed on second run');
    });

    __check('line entry still arms tip none through the annotation path (source guard)', () => {
      const S = window.__appSrc;
      if (S.indexOf("if (kind === 'line') _dsSetArrowDefault('tip', 'none');") < 0) throw new Error('line default missing');
      if (S.indexOf('function _dsAddArrowSmart(kind) { _dsArmShapeDraw(kind); }') < 0) throw new Error('unified routing missing');
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
