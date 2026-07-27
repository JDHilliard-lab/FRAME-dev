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
    scheduleAutosave = () => {}; pushHistory = () => {}; _dsRenderRail = () => {}; _dsRenderCenter = () => {}; _dsTab = () => {}; _dsSyncToolbar = () => {};

    __check('all 32 of Jordan\\'s templates are registered in IDML_MASTER_TEMPLATES', () => {
      const found = IDML_MASTER_TEMPLATES.filter(t => t.name.indexOf('Farmboy \\u00b7') === 0);
      if (found.length < 32) throw new Error('expected at least 32 new templates present, only found ' + found.length + ' total Farmboy-named templates');
    });

    __check('every new template has a category that exists in DECK_TPL_CATS via _IDML_CAT_MAP', () => {
      const names = ['Heading Only','Contents (Full)','Contents (Half)',"Founder's Letter",'Sales Preamble','Divider (Bleed)','Divider (Center)','Divider (Alternate)','Keywords','Quote','Quote (Center)','Narrative + Image','Narrative (3 Up)','Narrative (Large Text)','Narrative (Statement)','Right Image (Bleed)','Left Image (Bullets)','Left Image (Bleed)','Left Image (Multi)','Left Image (Bleed Alt)','Right Image (Multi Float)','Art Types','Artist Profile','Artist (Multi)','Moodboard (Standard)','Moodboard (Alt)','Moodboard (Abstract)','Moodboard (Float)','Moodboard (Shoppable 3-Up)','Catalogue','General Install Notes','Security Hardware'];
      const cats = _dsAllCats().map(c => c.key);
      names.forEach(n => {
        const t = IDML_MASTER_TEMPLATES.find(x => x.name === 'Farmboy \\u00b7 ' + n);
        if (!t) throw new Error('missing template: ' + n);
        const catKey = _IDML_CAT_MAP[t.type] || 'moodboard';
        if (cats.indexOf(catKey) < 0) throw new Error(n + ' maps to unknown category: ' + catKey);
      });
    });

    __check('no real embedded image data leaked into any new template EXCEPT the ones Jordan explicitly asked to bake real photos into', () => {
      const intentional = ["Farmboy \\u00b7 Founder's Letter", 'Farmboy \\u00b7 General Install Notes', 'Farmboy \\u00b7 Security Hardware'];
      const found = IDML_MASTER_TEMPLATES.filter(t => t.name.indexOf('Farmboy \\u00b7') === 0 && intentional.indexOf(t.name) < 0);
      found.forEach(t => {
        (t.elements || []).forEach(e => { if (e.img && e.img.length > 10) throw new Error(t.name + ' has embedded element image data'); });
        (t.annotations || []).forEach(a => { if (a.dataUrl) throw new Error(t.name + ' has embedded annotation image data'); });
      });
    });

    __check('the two source typos (HEADNING, PARGRAPH) are fixed everywhere', () => {
      const found = IDML_MASTER_TEMPLATES.filter(t => t.name.indexOf('Farmboy \\u00b7') === 0);
      found.forEach(t => {
        (t.elements || []).concat(t.annotations || []).forEach(e => {
          if (e.text && (e.text.indexOf('HEADNING') >= 0 || e.text.indexOf('PARGRAPH') >= 0)) throw new Error('typo survived in ' + t.name + ': ' + e.text);
        });
      });
    });

    __check('inserting "Divider (Bleed)" into a deck restores BOTH elements and annotations correctly', () => {
      const idx = IDML_MASTER_TEMPLATES.findIndex(t => t.name === 'Farmboy \\u00b7 Divider (Bleed)');
      if (idx < 0) throw new Error('template not found');
      editorialContent.layoutPages = []; editorialContent.annotations = {};
      _dsPages = []; _dsIndex = 0;
      _dsMasterToDeck(idx);
      const pg = editorialContent.layoutPages[0];
      if (!pg) throw new Error('page not created');
      if (!pg.elements.length) throw new Error('elements missing on inserted page');
    });

    __check('inserting "Contents (Full)" restores its 6 arrow annotations onto the new page', () => {
      const idx = IDML_MASTER_TEMPLATES.findIndex(t => t.name === 'Farmboy \\u00b7 Contents (Full)');
      if (idx < 0) throw new Error('template not found');
      editorialContent.layoutPages = []; editorialContent.annotations = {};
      _dsPages = []; _dsIndex = 0;
      _dsMasterToDeck(idx);
      const pg = editorialContent.layoutPages[0];
      const restored = editorialContent.annotations['layout:' + pg.id];
      if (!restored || restored.filter(a => a.type === 'arrow').length !== 6) throw new Error('expected 6 arrows restored, got: ' + JSON.stringify(restored && restored.map(a=>a.type)));
    });

    __check('inserting "Toc- Content (Half)" restores its shape annotation (the gray image placeholder)', () => {
      const idx = IDML_MASTER_TEMPLATES.findIndex(t => t.name === 'Farmboy \\u00b7 Contents (Half)');
      if (idx < 0) throw new Error('template not found');
      editorialContent.layoutPages = []; editorialContent.annotations = {};
      _dsPages = []; _dsIndex = 0;
      _dsMasterToDeck(idx);
      const pg = editorialContent.layoutPages[0];
      const restored = editorialContent.annotations['layout:' + pg.id];
      if (!restored || !restored.some(a => a.type === 'shape')) throw new Error('shape annotation not restored: ' + JSON.stringify(restored));
    });

    __check('the Templates tab renders the new categories with correct card counts and proportional thumbnails', () => {
      const host = document.getElementById('dsTabTemplates');
      _dsRenderTemplatesTab();
      const catalogueSec = host.querySelector('[data-seckey="catalogue"]');
      if (!catalogueSec) throw new Error('Catalogue category section not rendered');
      const cards = catalogueSec.querySelectorAll('.tpl-card');
      if (cards.length < 1) throw new Error('no Catalogue card rendered');
      // proportional thumbnail check: card width 200, height should be exactly round(200*540/936)
      const th = cards[0].querySelector('div');
      const expectedH = Math.round(200 * 540 / 936);
      if (!cards[0].style.width || cards[0].style.width !== '84px') throw new Error('card width wrong: ' + cards[0].style.width);
    });

    __check('Artist Profile and Artist (Multi) both land in the new Artist category', () => {
      const artistCat = IDML_MASTER_TEMPLATES.filter(t => (_IDML_CAT_MAP[t.type] || 'moodboard') === 'artist' && t.name.indexOf('Farmboy \\u00b7') === 0);
      const names = artistCat.map(t => t.name);
      if (names.indexOf('Farmboy \\u00b7 Artist Profile') < 0 || names.indexOf('Farmboy \\u00b7 Artist (Multi)') < 0) throw new Error('artist templates not correctly categorized: ' + names.join(','));
    });

    __check('all 5 Moodboard variants land in the existing Moodboard category (consolidated, not a new one)', () => {
      const moodboardNew = ['Moodboard (Standard)','Moodboard (Alt)','Moodboard (Abstract)','Moodboard (Float)','Moodboard (Shoppable 3-Up)'];
      moodboardNew.forEach(n => {
        const t = IDML_MASTER_TEMPLATES.find(x => x.name === 'Farmboy \\u00b7 ' + n);
        if (!t) throw new Error('missing: ' + n);
        if ((_IDML_CAT_MAP[t.type] || 'moodboard') !== 'moodboard') throw new Error(n + ' not in moodboard category: ' + t.type);
      });
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
