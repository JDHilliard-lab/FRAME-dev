// 18.34: the legacy 'classic' and 'frameRight' per-piece layout names are renamed to
// frameSpecDetail on load, and the classic drawer is gone.
//
// 'classic' had no SPEC_TEMPLATES entry and printed through its own drawer, so on a
// classic page the four SHOW ON PAGE ticks were on screen and did NOTHING, and
// switching Group A/B/C back to Per piece could bring classic back from the mode
// memory. Renaming must happen AFTER the ticks are seeded from what the old layout
// drew (elevation only), or a classic deck grows a frame strip and a floorplan.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const S = window.__appSrc;
    const legacyDeck = (extra) => {
      editorialContent = Object.assign(_editorialDefaults(), {
        specTemplate: 'classic',
        specTemplateOverrides: { 'ART.1': 'frameRight', 'ART.2': 'classic', 'ART.3': 'artSpecDetail' },
        specTplMemory: { perPiece: 'classic', group: 'setLegend' }
      }, extra || {});
      delete editorialContent.specSlots; delete editorialContent.specSlotOverrides;
      Object.keys(extra || {}).forEach(k => { editorialContent[k] = extra[k]; });
      _mbMigratePages();
    };

    __check('EXACT BUG: a classic deck opens on the one per-piece layout', () => {
      legacyDeck();
      if (editorialContent.specTemplate !== 'frameSpecDetail') throw new Error('deck is on ' + editorialContent.specTemplate);
    });
    __check('...with the ticks classic actually drew: elevation on, everything else off', () => {
      legacyDeck();
      const s = editorialContent.specSlots;
      if (!s.elevation || s.frame || s.profile || s.plan) throw new Error('seeded ' + JSON.stringify(s) + ' - renamed before seeding?');
    });
    __check('per-page overrides are renamed, and each keeps the ticks its old layout drew', () => {
      legacyDeck();
      const ov = editorialContent.specTemplateOverrides;
      if (ov['ART.1'] !== 'frameSpecDetail' || ov['ART.2'] !== 'frameSpecDetail') throw new Error(JSON.stringify(ov));
      if (ov['ART.3'] !== 'artSpecDetail') throw new Error('a current layout was renamed too');
      const so = editorialContent.specSlotOverrides;
      if (!so['ART.2'] || so['ART.2'].frame !== false || so['ART.2'].plan !== false) throw new Error('ART.2 lost its classic seed: ' + JSON.stringify(so));
    });
    __check('the mode memory cannot bring classic back when you switch to Per piece', () => {
      legacyDeck();
      if (editorialContent.specTplMemory.perPiece !== 'frameSpecDetail') throw new Error('memory still says ' + editorialContent.specTplMemory.perPiece);
      if (editorialContent.specTplMemory.group !== 'setLegend') throw new Error('the group memory was touched');
    });
    __check('a deck that already has ticks keeps them (the seed never overwrites a choice)', () => {
      legacyDeck({ specSlots: { frame: true, profile: true, plan: true, elevation: false } });
      const s = editorialContent.specSlots;
      if (!s.frame || !s.plan || s.elevation) throw new Error('the designer ticks were reseeded: ' + JSON.stringify(s));
      if (editorialContent.specTemplate !== 'frameSpecDetail') throw new Error('not renamed');
    });
    __check('a classic value restored later (undo, autosave) is renamed on the next page list', () => {
      legacyDeck();
      editorialContent.specTemplate = 'classic';
      _deckPageList();
      if (editorialContent.specTemplate !== 'frameSpecDetail') throw new Error('still ' + editorialContent.specTemplate);
    });
    __check('the classic drawer and its dispatch branch are gone', () => {
      if (S.indexOf('function _drawClassicSpecPage') >= 0) throw new Error('the classic drawer is back');
      const d = S.indexOf('async function _drawDeckSpecPage');
      const body = S.slice(d, S.indexOf('async function _drawDeckPage(', d));
      if (body.indexOf("'classic'") >= 0) throw new Error('the dispatch still branches on classic');
    });
  `;
  try { window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
