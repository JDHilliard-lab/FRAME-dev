// The three Deck Studio gear popups: arrow, shape/image, text.
//
// They are the place this file drifts fastest — CLAUDE.md already warns that there
// are three of them and each hand-rolls its own rows, so a fix applied to one is a
// third of a fix. This pins what they now share.
//
// (1) TABS IN THE TEXT POPUP. It had grown past the bottom of the screen, and a
//     feature you have to scroll to find is one most people never find. The named
//     styles grid is most of the height and is visited deliberately, so it gets a
//     tab rather than sitting under everything else. Which tab is open is MODULE
//     state because refresh() rebuilds the whole popup on every change.
//
// (2) EVERY BUTTON HAS A HOVER HELPER. Asked for explicitly.
//
// (3) LISTS ARE ICONS ON THE STYLE ROW. 'None', '• Bullets' and '1. Numbers' set no
//     width, and .action-btn is width:100%, so the list control alone was three
//     full-width rows.
//
// (4) STROKE WEIGHT IS TYPED, NOT JUST NUDGED. It showed an em dash whenever no
//     stroke colour was set, so the one thing needed to reuse a weight on the next
//     page — what the weight IS — was the one thing it would not say.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  const results = [];
  const check = (label, fn) => {
    try { fn(); results.push({ label, ok: true }); }
    catch (e) { results.push({ label, ok: false, err: e.message }); }
  };

  // Slice between landmarks, and fail loudly when the closing one is not after the
  // opening one — a bare indexOf(end, start) returns -1 and slice(start, -1) then
  // reads the rest of a 2MB file, which is how a source check silently stops testing
  // anything.
  const bodyOf = (a0, b0) => {
    const a = src.indexOf(a0);
    if (a < 0) throw new Error('start landmark missing: ' + a0);
    const b = src.indexOf(b0, a + a0.length);
    if (b < 0) throw new Error(b0 + ' does not follow ' + a0 + ' — this check would read the rest of the file');
    return src.slice(a, b);
  };

  check('each stepper hook names buttons in ONE popup only', () => {
    // These were added with a blanket first-occurrence replace and 'strokeW' landed
    // on the ARROW popup, whose weight stepper is byte-identical to the shape
    // popup's. Same trap as the rename that ate _elevReturnToDeck.
    const arrow = bodyOf('function _dsOpenArrowGearPopup', 'function _dsArrowGearPopupOutside');
    const shape = bodyOf('function _dsOpenGearPopup', 'function _dsResolveCaptionText');
    const count = (h, n) => h.split("dataset.step = '" + n + "'").length - 1;
    if (count(arrow, 'arrowW') !== 2) throw new Error('arrow popup does not own both arrowW hooks');
    if (count(arrow, 'strokeW') !== 0) throw new Error('a shape hook is inside the arrow popup');
    if (count(shape, 'strokeW') !== 2) throw new Error('shape popup does not own both strokeW hooks');
    if (count(shape, 'radius') !== 2) throw new Error('shape popup lost its radius hooks');
  });

  check('the text popup is tabbed, and the tab is module state', () => {
    if (src.indexOf("let _dsTextGearTab = 'text';") < 0) throw new Error('no module-level tab');
    const body = bodyOf('function _dsOpenTextGearPopup', 'function _dsTextGearPopupOutside');
    ['_paneText', '_paneColour', '_paneStyles'].forEach(p => {
      if (body.indexOf(p) < 0) throw new Error('missing pane ' + p);
    });
    if (body.indexOf('_tplTabClass(_dsTextGearTab === o[0])') < 0) throw new Error('tab state is not the shared .active class');
    // A local would snap back to the first tab on every click, since refresh()
    // rebuilds the popup.
    if (body.indexOf('let _dsTextGearTab') >= 0) throw new Error('the tab is a local, so it resets on every change');
  });

  check('the list control no longer builds full-width stacked buttons', () => {
    const body = bodyOf('function _dsOpenTextGearPopup', 'function _dsTextGearPopupOutside');
    if (body.indexOf("'\\u2022 Bullets'") >= 0 || body.indexOf("'1. Numbers'") >= 0) {
      throw new Error('the old word-labelled list buttons are back');
    }
    if (body.indexOf('_dsListIconSVG(') < 0) throw new Error('no list icons');
    if (src.indexOf('function _dsListIconSVG') < 0) throw new Error('the icon builder is gone');
  });

  check('stroke weight has a ladder of shared weights', () => {
    if (src.indexOf('const DECK_STROKE_PT') < 0) throw new Error('no weight ladder');
    const body = bodyOf('function _dsOpenGearPopup', 'function _dsResolveCaptionText');
    if (body.indexOf('DECK_STROKE_PT.map(') < 0) throw new Error('the ladder is not offered in the popup');
  });

  check('no styling control is duplicated on the toolbar any more', () => {
    // The popup and the toolbar carried the same fill, stroke, weight, font, colour,
    // align, caption, fit and shadow controls. The rule now: the POPUP styles the
    // object, the TOOLBAR acts on its relationship to the page and other objects.
    ['dsMbFont', 'dsMbWeight', 'dsMbColor', 'dsMbOutline', 'dsMbAlign', 'dsMbFit', 'dsMbShadow',
     'dsShapeStrokeColor', 'dsShapeFillToggle', 'dsShapeAspectLock', 'dsClearImgBtn',
     'dsCapToggle', 'dsCapAlign', 'dsAnnFillImg', 'dsAnnFit', 'dsAnnShadow',
     'dsArrowTip', 'dsArrowStartCap'].forEach(id => {
      if (htmlSrc.indexOf('id="' + id + '"') >= 0) throw new Error(id + ' is back on the toolbar, duplicating the popup');
    });
  });

  check('arrangement controls STAY on the toolbar', () => {
    // Front/back and align-and-distribute act on several objects, or on this one
    // against its neighbours. A panel titled for one object is the wrong home, and
    // delete has to be reachable without opening anything.
    ['dsAnnFront', 'dsAnnBack', 'dsAnnDelete', 'dsMbArrange'].forEach(id => {
      if (htmlSrc.indexOf('id="' + id + '"') < 0) throw new Error(id + ' was removed; it has no home in the popup');
    });
  });

  check('one fixed Settings button opens the popup for whatever is selected', () => {
    if (htmlSrc.indexOf('id="dsSelSettings"') < 0) throw new Error('no fixed settings button');
    if (src.indexOf('function _dsOpenSelSettings') < 0) throw new Error('no shared opener');
    const body = bodyOf('function _dsOpenSelSettings', 'function _dsCurrentAnnot');
    ['_dsOpenArrowGearPopup', '_dsOpenGearPopup', '_dsOpenTextGearPopup'].forEach(fn => {
      if (body.indexOf(fn) < 0) throw new Error('the opener cannot reach ' + fn);
    });
    // Anchored on the button, not the pointer: a popup that opens where you happened
    // to click lands somewhere different every time.
    if (body.indexOf("getElementById('dsSelSettings')") < 0) throw new Error('not anchored on the button');
  });

  check('fit-frame-to-content has ONE implementation', () => {
    // The toolbar fit menu had it as an inline calculation and _dsShapeFitToImage
    // repeated the same arithmetic; the second was added a version after the first.
    if (src.indexOf('(a.w * 936 / asp) / 540') >= 0) throw new Error('the inline copy of the fit arithmetic is back');
    if (src.indexOf("op === 'frame') { _dsShapeFitToImage(") < 0) throw new Error('the fit op no longer delegates');
  });

  // ── Behaviour ───────────────────────────────────────────────────────────
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const grad = { addColorStop() {} };
  window.HTMLCanvasElement.prototype.getContext = function () {
    return new Proxy({}, { get: (t, k) => {
      if (k === 'measureText') return (s) => ({ width: (s || '').length * 6 });
      if (k === 'canvas') return { width: 936, height: 540 };
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => grad;
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (typeof k === 'symbol') return undefined;
      return () => {};
    } });
  };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => {
      try { fn(); window.__testResults.push({ label, ok: true }); }
      catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); }
    };
    const __untitled = (pop) => Array.prototype.slice.call(pop.querySelectorAll('button'))
        .filter(b => !((b.title || '').trim()))
        .map(b => (b.textContent || '[icon]').slice(0, 16));

    const __textPop = (tab) => {
      editorialContent.layoutPages = [{ id: 'pgT', type: 'moodboard', title: 'T', elements: [] }];
      editorialContent.annotations = { 'layout:pgT': [{ type: 'text', text: 'hi', x: 0.1, y: 0.1, w: 0.3, size: 0.03, color: '#222222' }] };
      if (tab) _dsTextGearTab = tab;
      _dsOpenTextGearPopup({ kind: 'ann', key: 'layout:pgT', i: 0 }, 100, 100);
      return document.getElementById('dsTextGearPopup');
    };
    const __shapePop = () => {
      editorialContent.annotations = { 'layout:pgS': [{ type: 'shape', shape: 'rect', fill: '#d8d8de', stroke: '#c0392b', strokeW: 1.5, dataUrl: 'data:x', aspect: 2, w: 0.25, h: 0.2 }] };
      _dsOpenGearPopup('layout:pgS', 0, 10, 10);
      return document.getElementById('dsGearPopup');
    };
    const __arrowPop = () => {
      editorialContent.annotations = { 'layout:pgA': [{ type: 'arrow', x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.4, color: '#9aa0a6' }] };
      _dsOpenArrowGearPopup('layout:pgA', 0, 10, 10);
      return document.getElementById('dsArrowGearPopup');
    };

    __check('the text popup opens on three tabs, exactly one lit', () => {
      const pop = __textPop('text');
      if (!pop) throw new Error('popup did not open');
      const tabs = Array.prototype.slice.call(pop.querySelectorAll('.frame-tabs .frame-tab'));
      if (tabs.length !== 3) throw new Error('expected 3 tabs, found ' + tabs.length);
      const names = tabs.map(t => t.textContent).join(',');
      if (names !== 'Text,Colour,Styles') throw new Error('tabs are ' + names);
      const lit = tabs.filter(t => t.classList.contains('active'));
      if (lit.length !== 1) throw new Error(lit.length + ' tabs lit');
      if (lit[0].textContent !== 'Text') throw new Error('wrong tab lit: ' + lit[0].textContent);
    });

    __check('switching tab shows a DIFFERENT pane, and survives the rebuild', () => {
      let pop = __textPop('text');
      const shown = (p) => Array.prototype.slice.call(p.children).filter(c => c.tagName === 'DIV' && c.style.display !== 'none').length;
      const a = shown(pop);
      pop = __textPop('styles');
      const lit = Array.prototype.slice.call(pop.querySelectorAll('.frame-tab')).filter(t => t.classList.contains('active'));
      if (lit[0].textContent !== 'Styles') throw new Error('tab did not survive the rebuild');
      if (!(shown(pop) >= 1 && a >= 1)) throw new Error('no pane visible');
      // The styles pane is the tall one; it must carry the named styles.
      if ((pop.textContent || '').indexOf('Text styles') < 0) throw new Error('styles pane is empty');
    });

    __check('the Text tab does NOT carry the tall styles grid', () => {
      // That is the whole point of the split: the grid is ~40 buttons.
      const pop = __textPop('text');
      const styleBtns = pop.querySelectorAll('[data-style-id]');
      const visible = Array.prototype.slice.call(styleBtns).filter(b => {
        let e = b; while (e && e !== pop) { if (e.style && e.style.display === 'none') return false; e = e.parentElement; }
        return true;
      });
      if (visible.length) throw new Error(visible.length + ' style buttons still on the Text tab');
    });

    __check('EVERY button in all three popups has a hover helper', () => {
      [['text', __textPop('text')], ['colour', __textPop('colour')], ['styles', __textPop('styles')],
       ['shape', __shapePop()], ['arrow', __arrowPop()]].forEach(pair => {
        if (!pair[1]) throw new Error(pair[0] + ' popup did not open');
        const bad = __untitled(pair[1]);
        if (bad.length) throw new Error(pair[0] + ' popup has untitled buttons: ' + bad.join(' | '));
      });
    });

    __check('list markers are icon buttons on the style row, not three stacked rows', () => {
      const pop = __textPop('text');
      const icons = Array.prototype.slice.call(pop.querySelectorAll('button'))
          .filter(b => ['No list', 'Bulleted list', 'Numbered list'].indexOf(b.title || '') >= 0);
      if (icons.length !== 3) throw new Error('expected 3 list buttons, found ' + icons.length);
      icons.forEach(b => {
        // Drawn, not spelled out. Asserting an empty textContent would be wrong: the
        // numbered icon draws 1/2/3 as SVG <text>, so it reads as '123'.
        if (!b.querySelector('svg')) throw new Error('a list button is not an icon: ' + b.textContent);
        if ((b.textContent || '').indexOf('Bullet') >= 0 || (b.textContent || '').indexOf('None') >= 0) throw new Error('a word label survives: ' + b.textContent);
        if (b.style.width !== '26px') throw new Error('a list button has no explicit width, so action-btn width:100% will stack it');
      });
    });

    __check('stroke weight is a typed field that always shows the number', () => {
      // Even with NO stroke colour set: the old control showed an em dash there, which
      // is the case where you most need to know what you are about to match.
      editorialContent.annotations = { 'layout:pgW': [{ type: 'shape', shape: 'rect', fill: '#d8d8de', w: 0.25, h: 0.2 }] };
      _dsOpenGearPopup('layout:pgW', 0, 10, 10);
      const pop = document.getElementById('dsGearPopup');
      const nums = Array.prototype.slice.call(pop.querySelectorAll('input[type="number"]'));
      const wIn = nums.filter(n => (n.title || '').indexOf('Stroke weight') >= 0)[0];
      if (!wIn) throw new Error('no typed stroke-weight field');
      if (!(parseFloat(wIn.value) > 0)) throw new Error('weight field shows ' + JSON.stringify(wIn.value) + ' rather than a number');
    });

    __check('typing a weight stores it, so the next shape can be matched exactly', () => {
      editorialContent.annotations = { 'layout:pgW2': [{ type: 'shape', shape: 'rect', fill: '#d8d8de', stroke: '#c0392b', strokeW: 1.5, w: 0.25, h: 0.2 }] };
      _dsOpenGearPopup('layout:pgW2', 0, 10, 10);
      const pop = document.getElementById('dsGearPopup');
      const wIn = Array.prototype.slice.call(pop.querySelectorAll('input[type="number"]'))
          .filter(n => (n.title || '').indexOf('Stroke weight') >= 0)[0];
      wIn.value = '2.75'; wIn.onchange();
      const a = editorialContent.annotations['layout:pgW2'][0];
      if (a.strokeW !== 2.75) throw new Error('typed weight not stored, got ' + a.strokeW);
    });

    __check('the weight ladder sets a weight in one click', () => {
      editorialContent.annotations = { 'layout:pgW3': [{ type: 'shape', shape: 'rect', fill: '#d8d8de', stroke: '#c0392b', strokeW: 1.5, w: 0.25, h: 0.2 }] };
      _dsOpenGearPopup('layout:pgW3', 0, 10, 10);
      const pop = document.getElementById('dsGearPopup');
      const rung = Array.prototype.slice.call(pop.querySelectorAll('.frame-tab'))
          .filter(b => (b.title || '').indexOf('pt stroke') >= 0);
      if (rung.length !== DECK_STROKE_PT.length) throw new Error('ladder shows ' + rung.length + ' of ' + DECK_STROKE_PT.length + ' weights');
      const three = rung.filter(b => b.textContent === '3')[0];
      if (!three) throw new Error('no 3pt rung');
      three.onclick();
      if (editorialContent.annotations['layout:pgW3'][0].strokeW !== 3) throw new Error('ladder did not set the weight');
    });
  `;

  try { window.eval(src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }

  (window.__testResults || []).forEach(r => results.push(r));
  const failed = results.filter(r => !r.ok);
  results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' -> ' + r.err); });
  console.log('\n--- Summary ---');
  if (failed.length) { console.log(failed.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
