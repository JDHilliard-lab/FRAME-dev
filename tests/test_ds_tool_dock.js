// The Deck Studio tool dock (18.20).
//
// The creation tools were three split buttons in the toolbar row whose carets
// opened grids of captioned tiles. Asked for: a Miro-style toolbar with more
// visuals, able to stand vertically beside the page, with a choice of where it
// goes. What is pinned here:
//   - one dock holds every creation tool, and the old split buttons are gone;
//   - it moves between Left / Right / Top, remembered per machine, never in the
//     project;
//   - a flyout opened from a vertical dock flies out sideways, away from the
//     page edge, and from the top row it drops below as before;
//   - single-key tools (V T L A R O I) fire only on the Pages tab, never while
//     typing or with a modifier held;
//   - the new tools (Divider, Stamps) write real annotations.
// Every check below drives the real functions; indexOf rather than regex, for
// the reason the rest of this folder gives.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ measureText:()=>({width:6}), scale(){}, fillRect(){}, drawImage(){}, fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'x';
  window.fetch = () => Promise.reject(new Error('none'));

  const pre = [];
  const pcheck = (label, fn) => { try { fn(); pre.push({ label, ok: true }); } catch (e) { pre.push({ label, ok: false, err: e.message }); } };
  pcheck('index.html carries one dock with every creation tool, and the old split buttons are gone', () => {
    ['dsToolDock', 'dsDockSelect', 'dsDockText', 'dsDockNotes', 'dsDockLines', 'dsDockShapes', 'dsDockImage', 'dsDockPos',
     'dsDockLeftSlot', 'dsDockRightSlot', 'dsDockTopSlot'].forEach(id => {
      if (html.indexOf('id="' + id + '"') < 0) throw new Error('missing #' + id);
    });
    ['dsArrowMainBtn', 'dsArrowMenuBtn', 'dsShapeMainBtn', 'dsShapeMenuBtn', 'dsTextMenuBtn'].forEach(id => {
      if (html.indexOf('id="' + id + '"') >= 0) throw new Error('#' + id + ' is back beside the dock: two ways to add one thing');
    });
  });
  pcheck('the right slot sits between the page and the panel, the left between the rail and the page', () => {
    const rail = html.indexOf('id="dsRail"'), l = html.indexOf('id="dsDockLeftSlot"'), c = html.indexOf('id="dsCenter"'),
          r = html.indexOf('id="dsDockRightSlot"'), t = html.indexOf('id="dsTools"');
    if (!(rail < l && l < c && c < r && r < t)) throw new Error('slot order is wrong');
  });

  // Written while building this: a new _dsAddStamp silently replaced the spec
  // page's APPROVAL stamp of the same name (the last declaration wins), the file
  // parsed and the whole suite stayed green. One global scope means a name
  // collision is a deletion. So: no top-level function is declared twice.
  pcheck('no top-level function in app.js is declared twice', () => {
    const seen = {}, dup = [];
    src.split('\n').forEach(line => {
      let l = line;
      if (l.indexOf('async ') === 0) l = l.slice(6);
      if (l.indexOf('function ') !== 0) return;
      const name = l.slice(9).split('(')[0].trim();
      if (!name) return;
      if (seen[name]) dup.push(name); else seen[name] = 1;
    });
    if (dup.length) throw new Error('declared more than once (the later one wins): ' + dup.join(', '));
  });

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    scheduleAutosave=()=>{}; pushHistory=()=>{}; _dsRenderRail=()=>{}; _dsSyncToolbar=()=>{}; renderMoodboardCanvas=()=>{};
    const __realRenderCenter = _dsRenderCenter;
    _dsRenderCenter = () => { _dsDockSync(); };
    const dock = () => document.getElementById('dsToolDock');

    __check('the dock goes where it is put, and only that slot shows', () => {
      ['right', 'top', 'left'].forEach(side => {
        _dsSetDockSide(side);
        const want = { left: 'dsDockLeftSlot', right: 'dsDockRightSlot', top: 'dsDockTopSlot' }[side];
        if (dock().parentNode.id !== want) throw new Error(side + ': dock is in #' + dock().parentNode.id);
        if (dock().classList.contains('vert') !== (side !== 'top')) throw new Error(side + ': wrong orientation class');
        ['dsDockLeftSlot', 'dsDockRightSlot', 'dsDockTopSlot'].forEach(id => {
          const shown = document.getElementById(id).style.display !== 'none';
          if (shown !== (id === want)) throw new Error(side + ': #' + id + ' visibility is wrong');
        });
      });
    });

    __check('the side is remembered per machine, and a garbage value falls back to left', () => {
      _dsSetDockSide('right');
      if (localStorage.getItem('dsDockSide') !== 'right') throw new Error('not stored');
      if (_dsDockSide() !== 'right') throw new Error('not read back');
      localStorage.setItem('dsDockSide', 'sideways');
      if (_dsDockSide() !== 'left') throw new Error('an unknown side was honoured: ' + _dsDockSide());
      if (JSON.stringify(editorialContent).indexOf('dsDockSide') >= 0) throw new Error('the dock side leaked into project data');
    });

    __check('a lazy sync puts the dock back where it was left (no boot hook needed)', () => {
      localStorage.setItem('dsDockSide', 'right');
      document.getElementById('dsDockLeftSlot').appendChild(dock());
      _dsDockSync();
      if (dock().parentNode.id !== 'dsDockRightSlot') throw new Error('sync did not move it');
    });

    const rectOf = (id, r) => { document.getElementById(id).getBoundingClientRect = () => Object.assign({ width: 36, height: 36 }, r); };
    const R = { left: 100, right: 136, top: 200, bottom: 236 };

    __check('from a LEFT dock the menu flies out to the right of the button', () => {
      _dsSetDockSide('left'); rectOf('dsDockLines', R);
      _dsOpenArrowShapeMenu();
      const m = document.getElementById('dsArrowShapeMenu');
      if (!m) throw new Error('menu did not open');
      if (parseFloat(m.style.left) < R.right) throw new Error('menu sits over the dock: left ' + m.style.left);
      if (!document.getElementById('dsDockLines').classList.contains('open')) throw new Error('the button that opened it does not read as pressed');
      m.remove();
    });

    __check('from a RIGHT dock it flies out to the left', () => {
      _dsSetDockSide('right'); rectOf('dsDockLines', R);
      _dsOpenArrowShapeMenu();
      const m = document.getElementById('dsArrowShapeMenu');
      if (parseFloat(m.style.left) >= R.left) throw new Error('menu opened over the panel side: left ' + m.style.left);
      m.remove();
    });

    __check('from the TOP row it drops below, as the toolbar menus always did', () => {
      _dsSetDockSide('top'); rectOf('dsDockLines', R);
      _dsOpenArrowShapeMenu();
      const m = document.getElementById('dsArrowShapeMenu');
      if (parseFloat(m.style.top) < R.bottom) throw new Error('menu is not below the button: top ' + m.style.top);
      m.remove();
      _dsSetDockSide('left');
    });

    __check('the lines menu lists every line tool with its shortcut, plus Divider', () => {
      _dsOpenArrowShapeMenu();
      const m = document.getElementById('dsArrowShapeMenu');
      const t = m.textContent;
      ['Line', 'Arrow', 'Elbow arrow', 'Curved arrow', 'Multi-point path', 'Divider'].forEach(w => { if (t.indexOf(w) < 0) throw new Error('missing ' + w); });
      const kbds = Array.from(m.querySelectorAll('.ds-fly-kbd')).map(k => k.textContent);
      if (kbds.indexOf('L') < 0 || kbds.indexOf('A') < 0) throw new Error('shortcuts not shown: ' + kbds.join(','));
      if (m.querySelectorAll('.ds-fly-item svg').length < 7) throw new Error('a row has no icon');
      m.remove();
    });

    // A page that takes annotations.
    _dsActiveTab = 'pages';
    _dsPages = [{ kind: 'spec' }]; _dsIndex = 0;
    _deckPageKey = () => 'spec:T1';
    _dsCurrentEditablePage = () => null;
    _dsSelectAnnot = () => {};
    const anns = () => (editorialContent.annotations = editorialContent.annotations || {})['spec:T1'] || [];

    __check('choosing Line arms the straight tool with NO head, and Arrow puts the head back', () => {
      _dsArmedShape = null;
      _dsPickLineTool('line');
      if (_dsArmedShape !== 'arrow') throw new Error('Line did not arm the straight tool: ' + _dsArmedShape);
      if (_dsArrowDefaults().tip !== 'none') throw new Error('Line left a head on');
      _dsPickLineTool('arrow');
      if (_dsArmedShape !== 'arrow') throw new Error('Arrow toggled the tool OFF instead of arming it');
      if (_dsArrowDefaults().tip !== 'arrow') throw new Error('Arrow did not restore the head');
    });

    __check('Select is lit with nothing armed, and Lines is lit while a line tool is armed', () => {
      _dsArmedShape = 'curve'; _dsDockSync();
      if (!document.getElementById('dsDockLines').classList.contains('active')) throw new Error('Lines not lit while armed');
      if (document.getElementById('dsDockSelect').classList.contains('active')) throw new Error('Select still lit while drawing');
      _dsDockSelect();
      if (_dsArmedShape) throw new Error('Select did not put the tool down');
      if (!document.getElementById('dsDockSelect').classList.contains('active')) throw new Error('Select not lit');
    });

    __check('Divider places a LEVEL, headless rule', () => {
      const n = anns().length;
      _dsAddDivider();
      const a = anns()[n];
      if (!a || a.type !== 'arrow') throw new Error('no line added');
      if (a.y1 !== a.y2) throw new Error('divider is not level');
      if (a.tip !== 'none' || a.startCap !== 'none') throw new Error('divider has a head');
      if (!(a.x2 - a.x1 > 0.5)) throw new Error('divider does not run across the page');
    });

    __check('a stamp is bold red caps at the top right, in the house red', () => {
      _dsOpenTextMenu();
      const m = document.getElementById('dsTextMenu');
      ['STAMPS', 'DRAFT', 'FOR APPROVAL', 'NOT TO SCALE'].forEach(w => { if (m.textContent.indexOf(w) < 0) throw new Error('menu is missing ' + w); });
      const btn = Array.from(m.querySelectorAll('.ds-fly-item')).find(b => b.textContent.indexOf('FOR APPROVAL') >= 0);
      const n = anns().length;
      btn.onclick();
      const a = anns()[n];
      if (!a) throw new Error('clicking the stamp added nothing');
      if (a.text !== 'FOR APPROVAL' || !a.bold || a.color !== '#e00000') throw new Error('wrong stamp: ' + JSON.stringify(a));
      if (FRAME_TEXT_INKS.map(x => x.hex || x).join(',').toLowerCase().indexOf('#e00000') < 0 && JSON.stringify(FRAME_TEXT_INKS).indexOf('e00000') < 0) throw new Error('the stamp red is not the red the ink strip offers');
      if (!(a.x > 0.5 && a.y < 0.2)) throw new Error('stamp is not top right');
      if (document.getElementById('dsTextMenu')) throw new Error('menu stayed open after a pick');
    });

    __check('single-key tools fire on the Pages tab', () => {
      const hits = [];
      _dsAddTextSmart = () => hits.push('t'); _dsAddImageSmart = () => hits.push('i');
      _dsPlaceholderMainClick = () => hits.push('shape:' + _dsLastPlaceholderKind);
      ['t', 'i', 'r', 'o'].forEach(k => { if (!_dsDockKey({ key: k })) throw new Error(k + ' was not handled'); });
      if (hits.join(' ') !== 't i shape:rect shape:ellipse') throw new Error('wrong tools ran: ' + hits.join(' '));
      _dsArmedShape = null;
      _dsDockKey({ key: 'a' });
      if (_dsArmedShape !== 'arrow') throw new Error('A did not arm the arrow');
      _dsDockKey({ key: 'v' });
      if (_dsArmedShape) throw new Error('V did not put it down');
    });

    __check('and never with a modifier, while typing, or off the Pages tab', () => {
      let ran = 0; _dsAddTextSmart = () => ran++;
      if (_dsDockKey({ key: 't', ctrlKey: true }) || _dsDockKey({ key: 't', metaKey: true }) || _dsDockKey({ key: 't', altKey: true })) throw new Error('a modified key fired a tool');
      const inp = document.createElement('input'); document.body.appendChild(inp); inp.focus();
      if (_dsDockKey({ key: 't' })) throw new Error('typing a T in a field fired the text tool');
      inp.remove();
      _dsActiveTab = 'project';
      if (_dsDockKey({ key: 't' })) throw new Error('fired off the Pages tab');
      _dsActiveTab = 'pages';
      if (_dsDockKey({ key: 'Tab' }) || _dsDockKey({ key: 'Enter' })) throw new Error('a named key was read as its first letter');
      if (ran) throw new Error('the text tool ran ' + ran + ' times');
    });

    __check('the shortcut is wired ahead of the Ctrl handlers in the deck key handler', () => {
      const s = _dsAnnotKeydown.toString();
      const k = s.indexOf('_dsDockKey(e)'), t = s.indexOf('if (typing) return');
      if (k < 0) throw new Error('_dsAnnotKeydown never asks the dock');
      if (k < t) throw new Error('the dock key is read before the typing guard');
    });

    __check('_dsRenderCenter syncs the dock, so every arm and disarm lights it', () => {
      if (__realRenderCenter.toString().indexOf('_dsDockSync()') < 0) throw new Error('render does not sync the dock');
    });
  `;
  try { window.eval(src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = pre.concat(window.__testResults || []);
  const failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
  process.exit(0);
})();
