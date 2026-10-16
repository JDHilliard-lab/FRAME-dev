// 19.09: frames come from the library. New items start in MICH-132-29, the Frame Style
// colour option, Sync Folder and Upload swatch buttons are gone, and the dashboard shows
// the item's frame as one card that opens the frame browser.
//
// Asked: "remove the color option for the Frame style in the dashboard, and use
// MICH-132-29 as the default frame for new projects, since we now have 1000s of frames
// to pick from. Do you think I should remove the sync folder and upload frame swatch
// options too ... can you optimize the space of the dashboard right panel".
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    window.__run = (async () => {
      _autosaveToldUser = true; scheduleAutosave = () => {}; pushHistory = () => {};
      const SW = 'data:image/jpeg;base64,AAAA';
      // The library entry the app reads its facts from (the bundled manifest, by code).
      dashLocalLibrary.michaelangelo = { 'avant-garde': [
        { code: 'MICH-132-29', width: 0.75, depth: 1, rabbet: 0.8125, color: 'Black', file: 'library/x/MICH-132-29.jpg', corner: 'library/x/corners/MICH-132-29.jpg' },
        { code: 'MICH-435-09', width: 3, color: 'Aged Pine Grey', file: 'library/x/MICH-435-09.jpg' } ] };
      dashUnit = 'in';
      // The NEW row by identity: _fpAddCodes returns the code before the codes settle.
      const mint = () => { const before = new Set(dashProjectData); _fpAddCodes('', 1, { quiet: true }); return dashProjectData.find(x => !before.has(x)); };
      __check('EXACT ASK: a new item starts in MICH-132-29, sized from the catalogue', () => {
        _defaultFrameSwatch = null;
        const r = mint();
        if (r.fCode !== 'MICH-132-29') throw new Error('frame code ' + r.fCode);
        if (+r.fW !== 0.75 || +r.fHeight !== 1 || Math.abs(r.rabbetDepth - 0.8125) > 0.01) throw new Error('sizes ' + [r.fW, r.fHeight, r.rabbetDepth]);
        if (r.fColorName !== 'Black') throw new Error('Color / Texture is ' + r.fColorName);
        if (r.fCode === 'Standard Black') throw new Error('still the flat colour');
      });
      __check('before the swatch loads it is a black stand-in, upgraded in place when it lands', () => {
        _defaultFrameSwatch = null; _defaultFramePending.clear();
        const a = mint();
        const b = mint();
        if (a.fType !== 'color' || a.swatchDataUrl) throw new Error('drew an image with no pixels');
        b.fCode = 'MY-OWN';   // the designer changed this one meanwhile
        _defaultFrameSwatch = SW; _defaultFrameUpgradePending();
        if (a.fType !== 'image' || a.swatchDataUrl !== SW) throw new Error('the untouched row was not upgraded');
        if (b.fType !== 'color' || b.swatchDataUrl) throw new Error('a row the designer changed was overwritten');
      });
      __check('once loaded, a new item gets the real swatch at once; a cm project gets cm', () => {
        _defaultFrameSwatch = SW; dashUnit = 'cm';
        const r = mint();
        dashUnit = 'in';
        if (r.fType !== 'image' || r.swatchDataUrl !== SW) throw new Error('no swatch');
        if (Math.abs(r.fW - 1.905) > 0.01) throw new Error('fW in cm is ' + r.fW);
      });
      __check('a wallcovering or window film gets no frame', () => {
        const row = Object.assign(_cloneData(dashDefaultData), { product: 'Wallcovering (EGD)' });
        _defaultFrameApply(row);
        if (row.fCode === 'MICH-132-29') throw new Error('a flat graphic was framed');
      });
      __check('EXACT ASK: the colour option, Sync Folder and Upload swatch are gone from the dashboard', () => {
        ['fTypeBtnSolid', 'fTypeBtnLibrary', 'libFolderBtn'].forEach(id => { if (document.getElementById(id)) throw new Error('#' + id + ' is still there'); });
        const fc = document.getElementById('fColor');
        if (!fc || fc.type !== 'hidden') throw new Error('#fColor must stay, hidden: the data flow reads it');
        const up = document.getElementById('swatchUpload');
        if (!up || up.style.display !== 'none' || up.closest('label')) throw new Error('the upload input is still a visible control');
        if (window.__appSrc.indexOf('function setFrameStyle') >= 0) throw new Error('the colour toggle code survived');
      });
      __check('the frame card shows the frame and opens the browser', () => {
        const row = dashProjectData.find(x => x.fCode === 'MICH-132-29' && x.fType === 'image');
        _dashFrameCardSync(row);
        const card = document.getElementById('swatchSelectedDisplay');
        if ((card.getAttribute('onclick') || '').indexOf('openFrameBrowser()') < 0) throw new Error('card does not open the browser');
        if (document.getElementById('frameCardCode').textContent !== 'MICH-132-29') throw new Error('code reads ' + document.getElementById('frameCardCode').textContent);
        const sub = document.getElementById('frameCardSub').textContent;
        if (sub.indexOf('Black') < 0 || sub.indexOf('Michelangelo') < 0) throw new Error('facts read ' + sub);
        if (!document.querySelector('#frameCardPic img')) throw new Error('no picture');
        _dashFrameCardSync({ fType: 'color', fColor: '#222', fCode: 'Standard Black' });
        if (document.getElementById('frameCardSub').textContent.indexOf('Solid colour') < 0) throw new Error('a legacy colour frame is not explained');
      });
      __check('Color / Texture follows a picked frame, unless the designer typed it', () => {
        const items = dashLocalLibrary.michaelangelo['avant-garde'];
        const r = { fCode: 'MICH-132-29', fColorName: 'Black', product: 'Framed Art' };
        dashProjectData.push(r);
        applySwatchToRow(dashProjectData.length - 1, 'avant-garde', items[1], SW);
        if (r.fColorName !== 'Aged Pine Grey') throw new Error('did not follow: ' + r.fColorName);
        r.fColorName = 'Grey wash, hand finished';
        applySwatchToRow(dashProjectData.length - 1, 'avant-garde', items[0], SW);
        if (r.fColorName !== 'Grey wash, hand finished') throw new Error('typed wording overwritten: ' + r.fColorName);
      });
      __check('a one-off frame is still possible: Custom swatch in the frame browser', () => {
        openFrameBrowser();
        const b = document.getElementById('fbCustomSwatch');
        if (!b) throw new Error('no Custom swatch in the browser');
        let opened = false; document.getElementById('swatchUpload').click = () => { opened = true; };
        b.click();
        if (!opened) throw new Error('it does not open the upload');
        if (document.getElementById('frameBrowser')) throw new Error('the browser stayed open');
      });
    })();
  `;
  try { window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock); await window.__run; }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
