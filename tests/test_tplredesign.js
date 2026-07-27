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

    // ── Data fixes ──
    __check('Cover Page template now matches Jordan\\'s real, larger sizes', () => {
      const t = IDML_MASTER_TEMPLATES.find(x => x.name === 'Farmboy \\u00b7 Cover Page');
      const heading = t.elements.find(e => e.text === 'COVER PAGE HEADING');
      if (Math.abs(heading.size - 0.1699153933038768) > 0.0001) throw new Error('heading size not updated: ' + heading.size);
      const client = t.elements.find(e => e.text === 'CLIENT NAME');
      if (Math.abs(client.size - 0.05197412030471526) > 0.0001) throw new Error('client name size not updated: ' + client.size);
    });

    __check('Slogan (GOOD ART GOOD PEOPLE) template now matches Jordan\\'s real larger size and single combined element', () => {
      const t = IDML_MASTER_TEMPLATES.find(x => x.name === 'Farmboy \\u00b7 GOOD ART. GOOD PEOPLE.');
      if (t.elements.length !== 1) throw new Error('expected a single combined text element, got ' + t.elements.length);
      if (Math.abs(t.elements[0].size - 0.27993599999999996) > 0.0001) throw new Error('size not updated: ' + t.elements[0].size);
      if (t.elements[0].text.indexOf('GOOD ART') < 0 || t.elements[0].text.indexOf('GOOD PEOPLE') < 0) throw new Error('text wrong: ' + t.elements[0].text);
    });

    __check('the 7 old generic starter templates are gone', () => {
      const removed = ['Farmboy \\u00b7 Tagline','Farmboy \\u00b7 Divider (Standard)','Farmboy \\u00b7 Narrative \\u2014 Image','Farmboy \\u00b7 Narrative (Keywords)','Farmboy \\u00b7 Moodboard (Captions)','Farmboy \\u00b7 Thank You','Farmboy \\u00b7 Artwork Spec (Detail)'];
      removed.forEach(n => { if (IDML_MASTER_TEMPLATES.some(t => t.name === n)) throw new Error('old template still present: ' + n); });
      if (IDML_MASTER_TEMPLATES.length !== 34) throw new Error('expected exactly 34 templates, got ' + IDML_MASTER_TEMPLATES.length);
    });

    __check('Founder\\'s Letter template now has its real baked-in photo and signature', () => {
      const t = IDML_MASTER_TEMPLATES.find(x => x.name === "Farmboy \\u00b7 Founder's Letter");
      const shapes = (t.annotations || []).filter(a => a.type === 'shape' && a.dataUrl);
      if (shapes.length !== 2) throw new Error('expected 2 baked-in images, got ' + shapes.length);
    });

    __check('General Install Notes and Security Hardware templates have their real baked-in photos', () => {
      const gi = IDML_MASTER_TEMPLATES.find(x => x.name === 'Farmboy \\u00b7 General Install Notes');
      const sh = IDML_MASTER_TEMPLATES.find(x => x.name === 'Farmboy \\u00b7 Security Hardware');
      if (!(gi.annotations || []).some(a => a.dataUrl)) throw new Error('install notes image not baked in');
      if (!(sh.annotations || []).some(a => a.dataUrl)) throw new Error('security hardware image not baked in');
    });

    __check('Moodboard templates still carry their full placeholder counts (nothing lost)', () => {
      const std = IDML_MASTER_TEMPLATES.find(x => x.name === 'Farmboy \\u00b7 Moodboard (Standard)');
      const abs = IDML_MASTER_TEMPLATES.find(x => x.name === 'Farmboy \\u00b7 Moodboard (Abstract)');
      if ((std.annotations||[]).length !== 12) throw new Error('Moodboard Standard placeholder count wrong: ' + (std.annotations||[]).length);
      if ((abs.annotations||[]).length !== 9) throw new Error('Moodboard Abstract placeholder count wrong: ' + (abs.annotations||[]).length);
    });

    // ── Templates tab redesign ──
    __check('Templates tab renders a two-column master/detail layout', () => {
      const host = document.getElementById('dsTabTemplates');
      _dsTplSelected = null;
      _dsRenderTemplatesTab();
      const cols = host.querySelectorAll('#dsTplPreviewCol');
      if (cols.length !== 1) throw new Error('preview column not found');
    });

    __check('clicking a compact thumbnail selects it and shows the big preview with Add to deck immediately visible', () => {
      const host = document.getElementById('dsTabTemplates');
      _dsTplSelected = null;
      _dsRenderTemplatesTab();
      const firstCard = host.querySelector('.tpl-card');
      if (!firstCard) throw new Error('no compact thumbnail rendered');
      firstCard.onclick();
      const previewCol = document.getElementById('dsTplPreviewCol');
      const addBtn = Array.from(previewCol.querySelectorAll('button')).find(b => b.textContent === 'Add to deck');
      if (!addBtn) throw new Error('Add to deck button not present in the preview pane after selecting a thumbnail');
    });

    __check('selecting a compact thumbnail highlights it (border colour changes)', () => {
      const host = document.getElementById('dsTabTemplates');
      _dsTplSelected = null;
      _dsRenderTemplatesTab();
      const cards = Array.from(host.querySelectorAll('.tpl-card'));
      if (cards.length < 2) throw new Error('need at least 2 cards to test selection change');
      cards[1].onclick();
      if (cards[1].style.borderColor !== '#6a6aff' && cards[1].style.borderColor !== 'rgb(106, 106, 255)') throw new Error('selected card not highlighted: ' + cards[1].style.borderColor);
    });

    __check('selecting a USER template shows Rename/Update/Duplicate/Delete in the preview pane', () => {
      editorialContent.templates = [{ name: 'My Custom', type: 'moodboard', elements: [{ type: 'text', text: 'Hi', x:0.1,y:0.1,w:0.3 }], annotations: [] }];
      _dsTplSelected = null;
      _dsRenderTemplatesTab();
      const host = document.getElementById('dsTabTemplates');
      const userCard = Array.from(host.querySelectorAll('.tpl-card')).find(c => c.dataset.tname === 'my custom');
      if (!userCard) throw new Error('user template card not found');
      userCard.onclick();
      const previewCol = document.getElementById('dsTplPreviewCol');
      const labels = Array.from(previewCol.querySelectorAll('button')).map(b => b.textContent);
      ['Rename','Update from page','Duplicate','Delete'].forEach(l => { if (labels.indexOf(l) < 0) throw new Error('missing action: ' + l + ' | have: ' + labels.join(',')); });
    });

    __check('a Farmboy (master) template preview does NOT show Rename/Delete (not user-editable in place)', () => {
      _dsTplSelected = 'm:0';
      _dsRenderTemplatesTab();
      const previewCol = document.getElementById('dsTplPreviewCol');
      const labels = Array.from(previewCol.querySelectorAll('button')).map(b => b.textContent);
      if (labels.indexOf('Rename') >= 0 || labels.indexOf('Delete') >= 0) throw new Error('master template incorrectly showed edit actions: ' + labels.join(','));
    });

    __check('search filter still works against the new compact thumbnail cards', () => {
      _dsTplSelected = null;
      _dsRenderTemplatesTab();
      _dsTplApplyFilter('catalogue');
      const host = document.getElementById('dsTabTemplates');
      const visible = Array.from(host.querySelectorAll('.tpl-card')).filter(c => c.style.display !== 'none');
      if (!visible.length) throw new Error('filter hid everything');
      if (!visible.every(c => (c.dataset.tname||'').indexOf('catalogue') >= 0)) throw new Error('filter let non-matching cards through');
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
