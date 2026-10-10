// Native browser dialogs are gone (18.11), and two bugs found removing them.
//
// Eleven window.prompt() and six window.confirm() boxes were still in the app:
// browser chrome over FRAME, styled differently on every OS, with their own Escape.
// They are now _askFields / _askText / _askYesNo on the shared dialog shell.
//
// Replacing the level-delete confirm exposed two real bugs:
//  - Ctrl+Z after deleting a level put the pins back at their OLD level numbers on a
//    list that no longer had the level, so pins re-homed onto the wrong plan. Undo
//    snapshots now carry the floor plan levels (snapshotProjectState({plans:true})),
//    and every level mutation pushes history, or an unrelated Ctrl+Z would revert it.
//  - deleting a level renumbered the pins but NOT the wall lines, which are keyed by
//    level the same way, so a line drawn on Level 3 moved onto Level 2's plan.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, strokeRect(){}, clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  window.Element.prototype.scrollIntoView = function () {};
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    window.__done = (async () => {
    const __check = async (label, fn) => { try { await fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const S = window.__appSrc;
    const tick = (ms) => new Promise(r => setTimeout(r, ms || 5));
    renderFloorplanMarkup = function () {};
    _toast = function () { return null; };

    await __check('no native prompt, confirm or alert is left in the app', () => {
      const code = S.split(String.fromCharCode(10)).filter(l => l.trim().indexOf('//') !== 0).join(String.fromCharCode(10));
      ['window.prompt(', 'window.confirm(', 'window.alert('].forEach(k => {
        const n = code.split(k).length - 1;
        if (n) throw new Error(n + ' x ' + k + ' still in the code');
      });
    });

    await __check('_askFields resolves the trimmed values on Save, null on Cancel, and disables Save while empty', async () => {
      let p = _askFields({ title: 'T', fields: [{ key: 'a', label: 'A', value: '  hello ' }, { key: 'b', label: 'B', value: '', required: false, list: ['x', 'y'] }] });
      let ov = document.querySelector('.ask-fields');
      if (!ov || !ov.classList.contains('frame-modal')) throw new Error('not on the shared shell');
      if (ov.querySelectorAll('[data-modal-close]').length !== 1) throw new Error('needs exactly one close control');
      if (!ov.querySelector('datalist') || ov.querySelectorAll('datalist option').length !== 2) throw new Error('the suggestion list is missing');
      ov.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
      let r = await p;
      if (!r || r.a !== 'hello' || r.b !== '') throw new Error('got ' + JSON.stringify(r));
      p = _askText('T', 'L', '');
      ov = document.querySelector('.ask-fields');
      const ok = ov.querySelector('button[type=submit]');
      if (!ok.disabled) throw new Error('Save is enabled with a required field empty');
      ov.querySelector('[data-modal-close]').click();
      if ((await p) !== null) throw new Error('Cancel did not answer null');
      if (document.querySelector('.ask-fields')) throw new Error('the dialog stayed up');
    });

    await __check('Escape answers null and closes it', async () => {
      const p = _askText('T', 'L', 'x');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      const r = await Promise.race([p, tick(300).then(() => 'hung')]);
      if (r !== null) throw new Error('Escape gave ' + r);
    });

    await __check('saving a text style asks ONE dialog for name and group, offering every existing group', async () => {
      const b = S.slice(S.indexOf('async function _dsSaveSelectionAsStyle'), S.indexOf('function _dsDeleteStyle'));
      if (b.indexOf('_askFields') < 0 || b.indexOf('list: groups') < 0) throw new Error('style save is not one dialog with the groups as suggestions');
    });

    // ── plans and undo ──
    const setup = () => {
      floorplanLevels = [{ name: 'Lobby', imageData: 'data:a', imageName: 'a' }, { name: 'Guest A', imageData: 'data:b', imageName: 'b' }, { name: 'Guest B', imageData: 'data:c', imageName: 'c' }];
      dashProjectData = [Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), { id: 'ART.1', planPins: [{ lv: 2, x: 0.3, y: 0.4 }],
        planWalls: [{ lv: 2, wallLine: { x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.1 }, wallPanels: 1 }] })];
      _fpSyncPrimary(dashProjectData[0]); _fpSyncPrimaryWall(dashProjectData[0]);
      undoStack.length = 0; redoStack.length = 0; _isFirstHistoryPush = true; pushHistory();
    };
    const realConfirm = showConfirmModal;
    showConfirmModal = function (t, b, y, n, onYes) { if (onYes) onYes(); };

    await __check('deleting a level moves the wall line down WITH its pin', async () => {
      setup();
      _fpLevel = 0;
      await _fpDeleteLevel();
      const r = dashProjectData[0];
      if (floorplanLevels.map(l => l.name).join() !== 'Guest A,Guest B') throw new Error('levels: ' + floorplanLevels.map(l => l.name).join());
      if (_fpPins(r)[0].lv !== 1) throw new Error('pin not renumbered: ' + _fpPins(r)[0].lv);
      const w = _fpWalls(r);
      if (w.length !== 1 || w[0].lv !== 1) throw new Error('wall line left on level ' + (w[0] && w[0].lv) + ', so it now draws on Guest A instead of Guest B');
    });

    await __check('Ctrl+Z after deleting a level brings the level back and the pin points at the same plan', async () => {
      undo();
      const r = dashProjectData[0];
      if (floorplanLevels.map(l => l.name).join() !== 'Lobby,Guest A,Guest B') throw new Error('the level did not come back: ' + floorplanLevels.map(l => l.name).join());
      const lv = _fpPins(r)[0].lv;
      if (floorplanLevels[lv].name !== 'Guest B') throw new Error('after undo the pin sits on ' + floorplanLevels[lv].name);
      if (floorplanLevels[_fpWalls(r)[0].lv].name !== 'Guest B') throw new Error('after undo the wall line sits on the wrong plan');
    });

    await __check('a plan uploaded and then an unrelated undo: the plan stays', async () => {
      setup();
      _fpLevel = 1;
      const f = new File(['x'], 'guest-a-v2.png', { type: 'image/png' });
      loadSpecPdfFloorplan({ target: { files: [f], value: '' } });
      for (let k = 0; k < 40 && floorplanLevels[1].imageName !== 'guest-a-v2.png'; k++) await tick(10);
      if (floorplanLevels[1].imageName !== 'guest-a-v2.png') throw new Error('upload did not land');
      dashProjectData[0].notes = 'edited'; pushHistory();
      undo();
      if (floorplanLevels[1].imageName !== 'guest-a-v2.png') throw new Error('an unrelated Ctrl+Z threw away the uploaded plan');
      undo();
      if (floorplanLevels[1].imageName !== 'b') throw new Error('undoing the upload itself did not restore the old plan');
    });

    await __check('renaming or adding a level is its own undo step', async () => {
      setup();
      _fpAddLevel();
      if (floorplanLevels.length !== 4) throw new Error('add failed');
      undo();
      if (floorplanLevels.length !== 3) throw new Error('adding a level is not undoable, so the next undo would have removed it silently');
    });

    await __check('autosave and version history still store the plans BESIDE the snapshot, not inside it twice', () => {
      if (snapshotProjectState().floorplanLevels) throw new Error('the plain snapshot carries plans, so autosave and versions write every image twice');
      if (!snapshotProjectState({ plans: true }).floorplanLevels) throw new Error('the undo snapshot does not carry plans');
    });

    showConfirmModal = realConfirm;

    await __check('the page preview and the guide manager are on the shared shell', () => {
      ['_dsShowPreviewModal', '_mbOpenGuideManager'].forEach(fn => {
        const b = S.slice(S.indexOf('function ' + fn), S.indexOf(String.fromCharCode(10) + '}', S.indexOf('function ' + fn)));
        if (b.indexOf('e.target === m') >= 0) throw new Error(fn + ' still closes on any click whose target is the overlay');
        if (b.indexOf('data-modal-close') < 0) throw new Error(fn + ' has no close control for Escape to press');
      });
    });

    await __check('the empty plan slot is an upload button, and the PDF placeholder names no dialog', () => {
      if (S.indexOf('upload one in the Presentation PDF dialog') >= 0) throw new Error('the placeholder still names a dialog that no longer exists');
      if (S.indexOf("hint.textContent = 'Upload floor plan';") < 0 || S.indexOf("pick.onchange = (ev) => { _fpLevel = desc.level; loadSpecPdfFloorplan(ev); };") < 0) throw new Error('the empty slot is not an upload control for its own level');
    });
    })();
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
    await window.__done;
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => {
    console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err));
    if (!r.ok) failures.push(r.label);
  });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
