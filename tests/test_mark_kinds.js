// 19.48, "creating center lines over art but missing the CL on the line. it would be nice to
// easily add center lines between objects": the Lines tool gets kinds.
//   cl     one click: a full-height CL through a frame's / object's centre, labelled CL
//   clmid  two clicks: a full-height CL halfway between two things
//   level  one click: a full-width line through a top / bottom / centre
// All follow what they were placed on. And an editor-only element (data-export-skip) now
// takes its whole subtree out of the export: a selected line's settings strip printed.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => {
      try { fn(); window.__testResults.push({ label, ok: true }); }
      catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); }
    };
    _autosaveToldUser = true;
    scheduleAutosave = () => {}; pushHistory = () => {};
    const fr = (id, letter, x, y, w, h) => ({ id: id, letter: letter, x: x, y: y, w: w, h: h, active: true, dimTo: [] });
    const setup = () => {
      editorialContent = _editorialDefaults();
      elevUnit = 'in'; dashUnit = 'in';
      dashProjectData = [{ id: 'ART.4' }, { id: 'ART.5' }];
      elevations = [{ id: 'w1', name: 'ART.4 / 5', wallW: 320, wallH: 112,
        frames: [fr('ART.4', 'A', 34, 42, 31, 36), fr('ART.5', 'B', 254, 42, 31, 36)],
        contextBlocks: [{ id: 'cb1', x: 115, y: 0, w: 93, h: 36, label: 'Counter top' }] }];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      document.getElementById('wallW').value = '320'; document.getElementById('wallH').value = '112';   // drawElevAll reads the wall size off these
      selectedMark = null; markToolActive = false; markFirstAnchor = null;
      try { drawElevAll(); } catch (e) {}
      elevScale = 4;   // jsdom lays nothing out; the snap reach is in screen px
      elevResolvedWallW = 320; elevResolvedWallH = 112;
    };
    const clickAt = (x, y) => { eventToElevInches = () => ({ x: x, y: y }); elevScale = 4;
      handleMarkToolClick({ preventDefault() {}, stopPropagation() {}, shiftKey: false }); };
    const only = () => { const ms = getElevMarks(); if (ms.length !== 1) throw new Error(ms.length + ' lines'); return ms[0]; };

    __check('EXACT REQUEST: a centre line is one click on the art, through its centre, labelled CL', () => {
      setup();
      toggleMarkTool(true, 'cl');
      clickAt(49.5 + 1.5, 60);            // a little off ART.4's centre (49.5)
      const m = only();
      if (m.kind !== 'cl' || m.label !== 'CL' || !m.dash) throw new Error(JSON.stringify(m));
      if (m.a.ref !== 'frame' || m.a.letter !== 'A' || m.a.xc !== 'xm') throw new Error('not attached to the frame centre: ' + JSON.stringify(m.a));
      const e = _markEnds(m);
      if (e.pa.x !== 49.5 || e.pa.y !== 0 || e.pb.y !== 112) throw new Error('not full height through the centre: ' + JSON.stringify(e));
      elevFrames[0].x += 10;
      if (_markEnds(m).pa.x !== 59.5) throw new Error('did not follow the frame');
      drawElevAll();
      const lab = document.querySelector('#mark-layer [data-mark-kind="cl"] .mark-label');
      if (!lab || lab.textContent !== 'CL') throw new Error('the CL label is missing on the line');
    });
    __check('EXACT REQUEST: centre between two things is two clicks, halfway, and follows both', () => {
      setup();
      toggleMarkTool(true, 'clmid');
      clickAt(269.5, 50);                 // ART.5 centre
      if (!markFirstAnchor) throw new Error('first click not kept');
      clickAt(161.5, 20);                 // counter centre
      const m = only();
      if (m.kind !== 'clmid' || m.b.ref !== 'context' || m.b.cid !== 'cb1') throw new Error(JSON.stringify(m));
      if (_markEnds(m).pa.x !== (269.5 + 161.5) / 2) throw new Error('not halfway: ' + _markEnds(m).pa.x);
      elevations[0].contextBlocks[0].x += 20;
      if (_markEnds(m).pa.x !== (269.5 + 181.5) / 2) throw new Error('did not follow the counter');
    });
    __check('a level line is one click on a top, full width, following the frame', () => {
      setup();
      toggleMarkTool(true, 'level');
      clickAt(40, 78.5);                  // ART.4 top is 78
      const m = only();
      if (m.kind !== 'level' || m.a.yc !== 'y1') throw new Error(JSON.stringify(m));
      const e = _markEnds(m);
      if (e.pa.y !== 78 || e.pa.x !== 0 || e.pb.x !== 320) throw new Error(JSON.stringify(e));
    });
    __check('far from anything, a centre line stays where it was clicked', () => {
      setup();
      toggleMarkTool(true, 'cl');
      clickAt(100, 60);
      const m = only();
      if (m.a.ref !== 'free' || Math.abs(_markEnds(m).pa.x - 100) > 1e-9) throw new Error(JSON.stringify(m.a));
    });
    __check('the dock button opens the five kinds; picking one arms it and L re-arms it', () => {
      setup();
      openMarkKinds({ stopPropagation() {} });
      const fly = document.getElementById('markKindList');
      if (fly.style.display !== 'block' || fly.querySelectorAll('[data-mark-kind]').length !== 5) throw new Error('flyout not offering five kinds');   // 19.79 added Guide box
      fly.querySelector('[data-mark-kind="clmid"]').onclick({ stopPropagation() {} });
      if (!markToolActive || markKind !== 'clmid' || fly.style.display !== 'none') throw new Error('kind not armed');
      toggleMarkTool(false);
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'l', bubbles: true }));
      if (!markToolActive || markKind !== 'clmid') throw new Error('L did not re-arm the last kind');
    });
    __check('a CL line has no arrow choice; a free line keeps it', () => {
      setup();
      elevations[0].marks = [{ id: 'm1', kind: 'cl', a: { ref: 'frame', letter: 'A', xc: 'xm', yc: 'y0' }, arrow: 'none', dash: true, label: 'CL' },
                             { id: 'm2', a: { ref: 'free', x: 10, y: 10 }, b: { ref: 'free', x: 40, y: 40 }, arrow: 'end', dash: false, label: '' }];
      selectedMark = 'm1'; drawElevAll();
      if (document.querySelector('.mark-pop .mark-pop-arrow')) throw new Error('arrow choice on a CL');
      selectedMark = 'm2'; drawElevAll();
      if (!document.querySelector('.mark-pop .mark-pop-arrow')) throw new Error('a line saved before kinds lost its arrow choice');
    });
    __check('EXACT BUG: nothing inside an editor-only element reaches the export', () => {
      const S = window.__src;
      const a = S.indexOf('const walk = (node) => {', S.indexOf('function exportElevSVG'));
      const body = S.slice(a, S.indexOf('};', a));
      const skip = body.indexOf("getAttribute('data-export-skip')"), emit = body.indexOf('emitEl(child)');
      if (skip < 0 || emit < 0 || skip > emit) throw new Error('the walk still goes inside skipped elements (the settings strip printed)');
    });
  `;

  try {
    window.eval('window.__src = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = window.__testResults || [];
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
