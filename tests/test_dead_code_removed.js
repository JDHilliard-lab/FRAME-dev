// 18.31: code with no caller left, removed rather than kept "in case".
//
// - The spec-template CARD machinery: _dsTplSwatchKey, _dsQueueTplSwatch,
//   _dsPaintTplSwatch, _dsTplSwatchPump, _dsPrewarmTplSwatches, _dsRepwarmTplSwatches,
//   _dsTplCardName, _dsTemplateSwatchHTML and its _dsSwatch* helpers. Both card grids
//   were replaced by SHOW ON PAGE ticks, so this rendered and cached pictures nobody
//   painted. The DEMO data (_specTplDemoDesc, SPEC_TPL_DEMO_*) and the renderer's
//   swatch mode are NOT dead: the Type defaults panel renders its Spec demo with them.
// - The template renumber modal (openRenumberModal, updateRenumberPreview,
//   applyRenumber, renumberElevation, #renumberModal). Codes are run from the
//   floorplan Items list since 17.95, and this minted a second numbering scheme.
// - openFixedPageEditor, whose pencil buttons went in 16.37. #moodboardModal is the
//   layout editor itself and stays.
// - generateNextItemCode, which 18.28 left with no callers.
//
// Plain Node: these are questions about the source.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let fails = 0, n = 0;
const check = (label, fn) => {
  n++;
  try { fn(); console.log('OK:   ' + label); }
  catch (e) { fails++; console.log('FAIL: ' + label + ' -> ' + e.message); }
};

const GONE = ['_dsTplSwatchKey', '_dsQueueTplSwatch', '_dsPaintTplSwatch', '_dsTplSwatchPump',
  '_dsPrewarmTplSwatches', '_dsRepwarmTplSwatches', '_dsTplSwatchCache', '_dsTplPrewarmDone',
  '_dsTplCardName', '_dsTemplateSwatchHTML', '_dsSwatchBox', '_dsSwatchCaption',
  '_dsSwatchImageSlot', '_dsSwatchLoremLines', '_dsSwatchPerson',
  'openRenumberModal', 'updateRenumberPreview', 'applyRenumber', 'renumberElevation',
  'openFixedPageEditor', 'generateNextItemCode'];

check('none of the removed names is declared or mentioned in app.js', () => {
  const left = GONE.filter(nm => APP.indexOf(nm) >= 0);
  if (left.length) throw new Error('still present: ' + left.join(', '));
});

check('index.html no longer carries the renumber modal or calls any removed function', () => {
  ['renumberModal', 'renumberTemplate', 'renumberPreview', 'applyRenumber', 'updateRenumberPreview', 'openRenumberModal', 'openFixedPageEditor']
    .forEach(nm => { if (HTML.indexOf(nm) >= 0) throw new Error(nm + ' is still in index.html'); });
});

check('what the removed block was hosting is still here: the shared brand-font gate', () => {
  if (APP.indexOf('function _dsBrandFontsReady()') < 0) throw new Error('_dsBrandFontsReady went with the cards');
  if (APP.split('_dsBrandFontsReady(').length - 1 < 3) throw new Error('the font gate lost its callers');
});

check('the demo the Type defaults panel renders survives', () => {
  if (APP.indexOf('function _specTplDemoDesc(') < 0) throw new Error('_specTplDemoDesc is gone');
  if (APP.indexOf("demo: () => _specTplDemoDesc(") < 0) throw new Error('the Type defaults Spec demo no longer uses it');
});

check('the layout editor modal stays: it is not the fixed-page editor', () => {
  if (HTML.indexOf('id="moodboardModal"') < 0) throw new Error('#moodboardModal was removed with openFixedPageEditor');
});

console.log('\n--- Summary ---');
if (fails) { console.log(fails + ' FAILURES'); process.exit(1); }
console.log('ALL PASSED (' + n + ')');
