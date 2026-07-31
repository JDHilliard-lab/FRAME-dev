// Two elevation guide labels that collided with the outer wall dimensions.
//
// 1. 'HANG HEIGHT' sat OUTSIDE the wall on the left, vertically centred on the
//    dashed hang line. The wall-HEIGHT dimension sits outside the wall on the
//    left too (6in out), so the two overlapped — reliably in mm/cm, where the
//    number is widest. The word is gone; the callout reads '57" AFF' (or 60",
//    whatever the hang height is) instead — it says what the word said, and it
//    sits on the dimension line itself where there was already room.
//
// 2. 'WALL CENTER' sat ABOVE the wall, centred on the dashed centre line, which
//    is exactly where the wall-WIDTH dimension number lands. Longer wall or
//    metric units, same overlap. It reads 'CL' now, inside the wall's top edge
//    and beside the line rather than centred on it.
//
// jsdom does no layout, so these check the two things that actually caused the
// overlap — which band each label is anchored to, and how long it can get — on a
// really rendered elevation, across all three units.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};
    const S = window.__appSrc, CSS = window.__cssSrc;

    const __seed = (unit, w, h) => {
      elevUnit = unit;
      const k = unitFactor('in', unit);
      elevations = [{ name: 'Wall A', frames: [], wallW: w * k, wallH: h * k, personPos: { x: -60 } }];
      currentElevIndex = 0; currentView = 'elevation';
      elevFrames = elevations[0].frames;
      elevZoomFactor = 1;
      document.getElementById('wallW').value = String(w * k);
      document.getElementById('wallH').value = String(h * k);
      const ws = document.querySelector('#view-elevation .workspace');
      Object.defineProperty(ws, 'clientWidth', { get: () => 1100, configurable: true });
      Object.defineProperty(ws, 'clientHeight', { get: () => 800, configurable: true });
      drawElevAll();
    };

    // ── The HANG HEIGHT word ──
    __check('EXACT BUG: there is no HANG HEIGHT word left to collide with the wall-height dimension', () => {
      __seed('in', 185, 108);
      if (document.querySelector('.hang-label')) throw new Error('THE BUG: the HANG HEIGHT label is still rendered outside the wall, where the wall-height dim lives');
      if (/\.hang-label\s*\{/.test(CSS)) throw new Error('the .hang-label CSS rule is still in style.css');
    });

    __check('the dashed hang line itself is untouched', () => {
      __seed('in', 185, 108);
      if (!document.querySelector('.hang-guide')) throw new Error('the hang line went with the label; only the WORD was supposed to go');
      if (!document.querySelector('.floor-hang-dim')) throw new Error('the floor-to-hang dimension disappeared');
    });

    __check('EXACT REQUEST: the hang callout reads the measurement plus AFF', () => {
      __seed('in', 185, 108);
      const num = document.querySelector('.hang-dim-num');
      if (!num) throw new Error('no hang callout');
      const t = (num.textContent || '').trim();
      if (t.indexOf('AFF') < 0) throw new Error('expected AFF in the callout, got "' + t + '"');
      // 57in is the studio default hang height (getHangHeight's fallback).
      if (t !== '57\\" AFF') throw new Error('wanted \\'57\\" AFF\\', got "' + t + '"');
    });

    __check('the AFF callout tracks the hang height rather than hardcoding either value', () => {
      // The studio hangs at 60 as well as 57, so the number comes from the hang
      // height getHangHeight reads — not from a literal. That value is now held in
      // INCHES (elevHangIn) with the Settings input as its display, so this drives
      // the stored value; the input-to-model wiring is pinned separately in
      // test_elev_hang_baseboard_units.js.
      __seed('in', 185, 108);
      if (!document.getElementById('hangHeight')) throw new Error('#hangHeight input not found');
      const save = elevHangIn;
      elevHangIn = 60;
      drawElevAll();
      const t = (document.querySelector('.hang-dim-num').textContent || '').trim();
      elevHangIn = save;
      drawElevAll();
      if (t !== '60\\" AFF') throw new Error('a 60in hang height gave "' + t + '"');
    });

    __check('EXACT RISK: AFF keeps its unit mark even with the interior-suffix toggle off', () => {
      // That toggle de-clutters dozens of repeated spacing numbers and leans on
      // the corner legend. AFF is a single absolute instruction an installer
      // works to, so '57 AFF' would invite the mistake the callout prevents.
      __seed('in', 185, 108);
      const save = showUnitSuffix;
      showUnitSuffix = false;
      drawElevAll();
      const t = (document.querySelector('.hang-dim-num').textContent || '').trim();
      showUnitSuffix = save;
      drawElevAll();
      if (t !== '57\\" AFF') throw new Error('lost the unit mark with suffixes off: "' + t + '"');
    });

    __check('AFF survives the unit switch that used to cause the collision', () => {
      ['in', 'cm', 'mm'].forEach(u => {
        __seed(u, 185, 108);
        const t = (document.querySelector('.hang-dim-num').textContent || '').trim();
        if (t.indexOf('AFF') < 0) throw new Error('no AFF in ' + u + ': "' + t + '"');
      });
      elevUnit = 'in';
    });

    __check('the drag handle for the removed word went with it', () => {
      if (typeof attachHangLabelDrag !== 'undefined') throw new Error('attachHangLabelDrag survives, wired to a label that no longer renders');
      // And the html2canvas workaround that existed only for its writing-mode.
      if (S.indexOf(\"querySelectorAll('.hang-label')\") >= 0) throw new Error('the PNG-export onclone fixup for .hang-label is still there');
    });

    // ── The wall-centre label ──
    __check('EXACT REQUEST: the wall centre reads CL', () => {
      __seed('in', 185, 108);
      const lbl = document.querySelector('.center-label');
      if (!lbl) throw new Error('no centre label');
      const t = (lbl.textContent || '').trim();
      if (t !== 'CL') throw new Error('wanted CL, got "' + t + '"');
    });

    __check('EXACT BUG: CL sits INSIDE the wall top, not above it where the wall-width number is', () => {
      // 'bottom: 100%' was what put it above the wall. Inside means a positive
      // top offset from the guide's own top edge.
      const i = CSS.indexOf('.center-label {');
      if (i < 0) throw new Error('.center-label rule not found');
      const rule = CSS.slice(i, CSS.indexOf('}', i));
      if (/bottom:\\s*100%/.test(rule)) throw new Error('THE BUG: CL is still anchored above the wall, on top of the wall-width dimension');
      if (!/top:\\s*\\d/.test(rule)) throw new Error('expected a top offset placing CL inside the wall: ' + rule);
    });

    __check('EXACT BUG: CL sits BESIDE the centre line, not centred on it', () => {
      const i = CSS.indexOf('.center-label {');
      const rule = CSS.slice(i, CSS.indexOf('}', i));
      // translate(-50%) centred the box on the line; a margin offsets it clear
      // of the line whatever the text width.
      if (/translate\\(-50%/.test(rule)) throw new Error('CL is still centred on the dashed line: ' + rule);
      if (!/margin-left:\\s*\\d/.test(rule)) throw new Error('expected a margin-left putting CL beside the line: ' + rule);
    });

    __check('CL is short enough that a long wall cannot push it into the wall-width number', () => {
      // The old label was 11 characters and grew no matter the wall; the failure
      // mode was the wall-width number widening under it. CL is 2 characters and
      // no longer shares that band at all, so assert the band separation holds
      // for a very long wall in mm — the worst case reported.
      __seed('mm', 480, 108);
      const lbl = document.querySelector('.center-label');
      const t = (lbl.textContent || '').trim();
      if (t.length > 4) throw new Error('the centre label grew back: "' + t + '"');
      const guide = lbl.parentElement;
      if (!guide || guide.className.indexOf('center-guide') < 0) throw new Error('CL is no longer a child of the centre line, so it would stop tracking it');
      elevUnit = 'in';
    });

    __check('both labels still read from the shared dimension style, not hardcoded type', () => {
      const i = CSS.indexOf('.center-label {');
      const rule = CSS.slice(i, CSS.indexOf('}', i));
      ['--dim-color', '--dim-font-family', '--dim-font-size'].forEach(v => {
        if (rule.indexOf(v) < 0) throw new Error('.center-label stopped using ' + v + ', so the Settings panel would not reach it');
      });
      const j = S.indexOf('function _elevAffLabel');
      if (j < 0) throw new Error('_elevAffLabel not found');
      const body = S.slice(j, S.indexOf('}', j));
      // elevFmt + unitSuffix, deliberately NOT elevFmtU: the unit mark stays on
      // even when the interior-suffix toggle is off (see the check above).
      if (body.indexOf('elevFmt(') < 0) throw new Error('the AFF label should format through elevFmt so it honours the project unit and its precision');
      if (body.indexOf('unitSuffix()') < 0) throw new Error('the AFF label should append the unit suffix itself rather than hardcoding an inch mark');
    });
  `;

  try {
    window.eval(
      'window.__appSrc = ' + JSON.stringify(src) + ';\n' +
      'window.__cssSrc = ' + JSON.stringify(cssSrc) + ';\n' +
      src + '\n' + testBlock
    );
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const all = window.__testResults || [];
  let failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
