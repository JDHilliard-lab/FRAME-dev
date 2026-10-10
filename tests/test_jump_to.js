// Jump to (Ctrl+K). A real deck runs to ~60 codes, a dozen walls and 80+ pages,
// and getting from one to another meant scrolling the rail or the Items list.
// These checks drive the real shortcut, the real filter and the real navigation.
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
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const __row = (id, extra) => Object.assign({}, dashDefaultData || {}, { id: id, product: 'Framed Art', extW: 24, extH: 30, artworkName: 'Art ' + id }, extra || {});
    dashProjectData = [__row('ART.1A'), __row('ART.1B'), __row('ART.2'), __row('EGD.1', { product: 'Wallcovering' })];
    elevations = [
      { id: 'wLobby', name: 'LOBBY', wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [{ id: 'ART.1A', w: 24, h: 30, x: 10, y: 50, active: true }] },
      { id: 'wBar', name: 'BAR', wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [{ id: 'ART.2', w: 24, h: 30, x: 10, y: 50, active: true }] }
    ];
    try { renderDashTable(); } catch (e) {}
    const __key = (k, opts) => document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, opts || {})));

    __check('Ctrl+K opens Jump to on the shared dialog shell, focused on the search field', () => {
      __key('k', { ctrlKey: true });
      const m = document.getElementById('jumpModal');
      if (!m) throw new Error('Ctrl+K opened nothing');
      if (!m.classList.contains('frame-modal')) throw new Error('not on the .frame-modal shell, so Escape and the backdrop do not close it');
      if (m.querySelectorAll('[data-modal-close]').length !== 1) throw new Error('needs exactly one close control');
      if (document.activeElement !== document.getElementById('jumpInput')) throw new Error('focus is not in the search field, so typing goes nowhere');
    });

    __check('Cmd+K toggles it closed again', () => {
      __key('k', { metaKey: true });
      if (document.getElementById('jumpModal')) throw new Error('a second press did not close it');
    });

    __check('punctuation is ignored: "art1b" finds ART.1B first', () => {
      const r = _jumpFilter('art1b', _jumpEntries());
      if (!r.length || r[0].title !== 'ART.1B') throw new Error('first result was ' + (r[0] && r[0].title));
    });

    __check('a wall is found by name', () => {
      const r = _jumpFilter('bar', _jumpEntries());
      if (!r.some(e => e.group === 'Walls' && e.title === 'BAR')) throw new Error('BAR wall not offered');
    });

    __check('a page number puts that page first', () => {
      const all = _jumpEntries();
      const pages = all.filter(e => e.group === 'Pages');
      if (pages.length < 3) throw new Error('only ' + pages.length + ' pages listed');
      const r = _jumpFilter('3', all);
      if (!r.length || r[0].num !== '3') throw new Error('first result for "3" was ' + (r[0] && r[0].title));
    });

    __check('a piece offers Piece, Wall and Page, and Wall only when it is on one', () => {
      const all = _jumpEntries();
      const a = all.find(e => e.title === 'ART.1A'), b = all.find(e => e.title === 'ART.1B');
      const kinds = (e) => e.go.map(g => g.kind).join(',');
      if (kinds(a).indexOf('wall') < 0) throw new Error('ART.1A is on LOBBY but has no Wall chip: ' + kinds(a));
      if (kinds(b).indexOf('wall') >= 0) throw new Error('ART.1B is on no wall but offers one');
      if (kinds(a).indexOf('page') < 0) throw new Error('ART.1A has a spec page but no Page chip: ' + kinds(a));
    });

    __check('Enter picks the destination for the view you are in', () => {
      const a = _jumpEntries().find(e => e.title === 'ART.1A');
      currentView = 'dashboard'; if (_jumpDefault(a).kind !== 'piece') throw new Error('from the dashboard it should open the piece');
      currentView = 'elevation'; if (_jumpDefault(a).kind !== 'wall') throw new Error('from the elevation it should open the wall');
      currentView = 'deck'; if (_jumpDefault(a).kind !== 'page') throw new Error('from the deck it should open the page');
      currentView = 'dashboard';
    });

    __check('typing and Enter selects the piece on the dashboard', () => {
      switchView('elevation', 1);
      currentView = 'dashboard';
      openJump();
      const inp = document.getElementById('jumpInput');
      inp.value = 'art 2'; inp.dispatchEvent(new Event('input'));
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      if (document.getElementById('jumpModal')) throw new Error('the dialog stayed open after Enter');
      if (currentView !== 'dashboard') throw new Error('landed in ' + currentView);
      if (dashProjectData[dashSelectedRowIndex].id !== 'ART.2') throw new Error('selected ' + (dashProjectData[dashSelectedRowIndex] || {}).id);
    });

    __check('a wall is reached by its id, so a reorder after opening cannot misdirect it', () => {
      const e = _jumpEntries().find(x => x.group === 'Walls' && x.title === 'BAR');
      elevations.reverse();
      _jumpGo(e.go[0]);
      if (currentView !== 'elevation') throw new Error('landed in ' + currentView);
      if (elevations[currentElevIndex].name !== 'BAR') throw new Error('opened ' + elevations[currentElevIndex].name);
      elevations.reverse();
    });

    __check('arrow keys move the highlight and wrap', () => {
      currentView = 'dashboard';
      openJump();
      const inp = document.getElementById('jumpInput');
      const n = _jumpList.length;
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
      if (_jumpSel !== n - 1) throw new Error('Up from the top did not wrap to the bottom');
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      if (_jumpSel !== 0) throw new Error('Down from the bottom did not wrap');
      if (!document.querySelector('#jumpList .jump-row.active')) throw new Error('no row is painted as highlighted');
    });

    __check('Escape closes it through the shared dialog handler', () => {
      const inp = document.getElementById('jumpInput');
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      if (document.getElementById('jumpModal')) throw new Error('Escape left Jump to open');
    });
  `;

  try {
    window.eval(src + '\n' + testBlock);
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
