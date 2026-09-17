// The Deck Studio right panel: what the Page tab keeps, and what moved.
//
// The panel had grown to where a designer had to scroll to learn what was
// available, and several controls were duplicates of things the thumbnail rail or
// another tab already did. The rule applied here: the Page tab keeps what is
// genuinely about THIS page and nothing the rail or another tab already offers.
//
// Moved out: the inline page-template grid (the Templates TAB), Save as template
// (Templates tab), duplicate / move / delete / remove-from-deck (the rail), the
// client-logo uploader and Apply-to-whole-deck (the Project tab, both deck-wide).
// Kept: the placement row, the page theme, the per-page footer ink and hide toggles.
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
  // Comments describing what was REMOVED contain the very labels these checks look
  // for, so a bare search matches the explanation instead of the code. Strip line
  // comments before scanning for a control that should be gone.
  const codeOnly = (t) => t.split('\n').map(l => {
    const i = l.indexOf('//');
    // Only strip a comment that does not follow a quote on the same line, so a URL
    // or a label containing "//" inside a string is left alone.
    return (i >= 0 && l.slice(0, i).indexOf("'") < 0) ? l.slice(0, i) : l;
  }).join('\n');
  const bodyOf = (a0, b0) => {
    const a = src.indexOf(a0);
    if (a < 0) throw new Error('start landmark missing: ' + a0);
    const b = src.indexOf(b0, a + a0.length);
    if (b < 0) throw new Error(b0 + ' does not follow ' + a0 + ' — this check would read the rest of the file');
    return src.slice(a, b);
  };

  check('the Page tab no longer builds a second template grid', () => {
    if (src.indexOf('_deferredTplGrid') >= 0) throw new Error('the inline grid is back, duplicating the Templates tab');
    // Careful: _dsTplSelected is a DIFFERENT, still-live variable (the Templates tab
    // preview selection), so a bare substring search matches it and reports a false
    // positive.
    const all = src.split('_dsTplSel').length - 1;
    const other = src.split('_dsTplSelected').length - 1;
    if (all - other > 0) throw new Error('_dsTplSel survives with nothing to select');
    // The tab it duplicated must still be there.
    if (src.indexOf('function _dsRenderToolsTemplatesTab') < 0) throw new Error('the Templates tab renderer is gone');
  });

  check('page actions the rail already offers are off the Page tab', () => {
    const body = codeOnly(bodyOf('function _dsRenderTools()', 'function _dsSave()'));
    ['Duplicate this page', 'Move page earlier', 'Move page later', 'Delete this page', 'Remove this page from deck']
      .forEach(label => {
        if (body.indexOf(label) >= 0) throw new Error('"' + label + '" is back on the Page tab');
      });
  });

  check('Save as template moved to the Templates tab, and still works there', () => {
    if (src.indexOf('function _dsSaveCurrentPageBtnInto') < 0) throw new Error('no save-page button builder');
    if (src.indexOf('_dsSaveCurrentPageBtnInto(header)') < 0) throw new Error('nothing renders it into the Templates tab');
    const body = codeOnly(bodyOf('function _dsRenderTools()', 'function _dsSave()'));
    if (body.indexOf('Save this page as template') >= 0) throw new Error('it is still on the Page tab too');
    if (src.indexOf('function _dsSaveCurrentAsTemplate') < 0) throw new Error('the save itself is gone');
  });

  check('deck-wide footer controls are off the per-page panel', () => {
    const body = codeOnly(bodyOf('function _dsPageChromeControls', 'function _dsSection'));
    if (body.indexOf('Apply footer to whole deck') >= 0) throw new Error('a deck-wide button is back in the per-page panel');
    if (body.indexOf('Upload client logo') >= 0) throw new Error('the client-logo uploader is back in the per-page panel');
    // And what IS per page has to stay, or the panel loses its reason to exist.
    ['hideCopyright', 'hideLogo', 'hideFooter', 'leftTheme'].forEach(k => {
      if (body.indexOf(k) < 0) throw new Error('per-page footer control ' + k + ' went with them');
    });
  });

  check('the copyright line has ONE definition, not one per renderer', () => {
    // It was a literal in the PDF drawer and again in the Deck Studio overlay, so the
    // two could disagree on the one line of a page that makes a legal claim.
    const n = src.split('Farmboy Fine Arts Inc. | All rights reserved').length - 1;
    if (n !== 1) throw new Error(n + ' copies of the copyright string; expected only the default constant');
    if (src.indexOf('function _footerCopyrightText') < 0) throw new Error('no shared copyright builder');
  });

  check('page theme is built ONCE, not once per branch', () => {
    // It was seven separate _dsThemeControlInto calls, one in each kind branch, and the
    // footer block was built after all of them.
    if (src.indexOf("_dsSection(t, 'Page theme'") >= 0) throw new Error('a per-branch theme section is back');
    if (src.indexOf('function _dsPageAppearanceInto') < 0) throw new Error('no merged appearance section');
    // Counted as an indented CALL: the function declaration contains the same substring,
    // so a bare search reports one more than there are call sites.
    const n = src.split('    _dsPageAppearanceInto(t, desc);').length - 1;
    if (n !== 1) throw new Error('expected exactly 1 call site, found ' + n);
  });

  check('EXACT BUG: appearance renders AHEAD of the branches that return early', () => {
    // The spec branch returns before the old footer call, so a spec page got a theme and
    // never got a footer. A dark background image on a spec page had no way to turn the
    // logo white.
    const body = bodyOf('function _dsRenderTools()', 'function _dsSave()');
    const call = body.indexOf('_dsPageAppearanceInto(t, desc)');
    const specBranch = body.indexOf("if (desc.kind === 'spec')");
    if (call < 0) throw new Error('appearance is not built in the page panel');
    if (specBranch >= 0 && call > specBranch) throw new Error('it renders after the spec branch, which returns early');
  });

  check('approval status is no longer in two places', () => {
    // The same three states sit in the header beside Save and Generate PDF.
    const body = codeOnly(bodyOf('function _dsRenderTools()', 'function _dsSave()'));
    if (body.indexOf('apprWrap') >= 0) throw new Error('the right-panel approval block is back');
    if (src.indexOf('function _dsSyncApprovedBtn') < 0) throw new Error('the header control it defers to is gone');
  });

  check('the background colour picker is not destroyed while you drag in it', () => {
    // oninput fires continuously during a drag and called a refresh that REBUILDS the
    // panel, taking the open picker with it. Dragging repaints the page only.
    // UPDATED 17.31: every picker in this block goes through one dot() helper now
    // (background colour, gradient stop, tint), so the contract is asserted once on it.
    const body = bodyOf('function _dsThemeControlInto', 'function _dsPageAppearanceInto');
    // Asserted as a CONTRACT rather than an exact line: oninput gained an onLive hook so
    // the panel updates as you drag, which is what removed the need to press Enter.
    const inLine = body.slice(body.indexOf('i2.oninput'), body.indexOf('i2.onchange'));
    if (inLine.indexOf('paintOnly()') < 0) throw new Error('no live paint while dragging');
    if (inLine.indexOf('onLive') < 0) throw new Error('the panel does not update while the picker is open');
    if (inLine.indexOf('refresh()') >= 0) throw new Error('a picker rebuilds the panel and closes itself again');
    const chLine = body.slice(body.indexOf('i2.onchange'));
    if (chLine.slice(0, 120).indexOf('refresh()') < 0) throw new Error('the panel never catches up after the picker closes');
  });

  check('every custom colour picker is the shared dot, not a hand-styled square', () => {
    // There were TEN <input type="color"> and every one was a rounded SQUARE, which is
    // the one shape nothing else uses: the swatch grids and selection rings are dots. An
    // inline border-radius beats the global rule, so none may carry shape styling.
    const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
    if (css.indexOf('input[type="color"] {') < 0) throw new Error('no global colour-picker rule');
    if (css.indexOf('border-radius: 50%') < 0) throw new Error('the picker is not a circle');
    if (css.indexOf('conic-gradient') < 0) throw new Error('no colour-wheel ring');
    // Written TWICE: WebKit and Gecko expose different inner pseudo-elements and
    // neither inherits the other's, the same trap the slider rule documents.
    if (css.indexOf('::-webkit-color-swatch') < 0) throw new Error('WebKit swatch left square');
    if (css.indexOf('::-moz-color-swatch') < 0) throw new Error('Gecko swatch left square');
    // And no call site may force a square back.
    const lines = src.split(String.fromCharCode(10));
    const bad = [];
    lines.forEach((l, i) => {
      if (l.indexOf("type = 'color'") < 0) return;
      const m = /([A-Za-z_$][w$]*).type = 'color'/.exec(l);
      if (!m) return;
      const v = m[1];
      for (let j = i; j < Math.min(i + 6, lines.length); j++) {
        if (lines[j].indexOf(v + '.style.cssText') >= 0 && lines[j].indexOf('border-radius') >= 0) bad.push(i + 1);
      }
    });
    if (bad.length) throw new Error('colour inputs still forcing a square at line(s) ' + bad.join(', '));
  });

  check('the page theme block uses the shared segmented row and short labels', () => {
    // Every control in this cluster shows selection the SAME way: a ring at full
    // strength, the others faded. .frame-tab paints a solid fill, which put two
    // selected-looks in one row and swallowed the icons it was highlighting.
    const body = bodyOf('function _dsThemeControlInto', 'function _dsPageAppearanceInto');
    if (body.indexOf("modes.className = 'frame-tabs'") >= 0) throw new Error('the mode buttons went back to the filled tab look');
    if (body.indexOf('_tplTabClass(') >= 0) throw new Error('a control in this cluster still uses the filled .active state');
    if (body.indexOf("border-color:var(--ui-active); color:var(--ui-active); opacity:1;") < 0) throw new Error('no ring-and-fade selection');
    // Only the VISIBLE label is short. The tooltip is free to spell it out, which is
    // the whole point of moving the words there.
    if (body.indexOf("cLab.textContent = 'Background colour'") >= 0) throw new Error('the long visible label is back');
  });

  check('EXACT BUG: dragging a stop does not rebuild the panel mid-gesture', () => {
    // This is what stopped the circles moving. refresh() at the end of mousedown replaced
    // the handle AND the track before the first mousemove, so the position maths measured
    // a detached element, read a zero width and snapped every stop to 0. The comment two
    // lines above it already warned against exactly that.
    // Anchored on a line unique to THIS handler: 'h.onmousedown' appears in other
    // draggables and the slice ran across half the file.
    const i0 = src.indexOf('_dsGradSel = i;');
    if (i0 < 0) throw new Error('the stop handler is gone');
    const body = src.slice(i0, src.indexOf('handles.push(h);', i0));
    // COUNTED across the whole handler, not just its prologue: the original bug sat
    // AFTER the listeners were attached, so a check that stopped at 'const mv' walked
    // straight past it. Exactly one refresh is allowed, and it is the one in mouseup.
    const n = body.split('refresh()').length - 1;
    if (n !== 1) throw new Error(n + ' refresh() calls in the drag handler; only mouseup may rebuild');
    if (body.indexOf('paintSel()') < 0) throw new Error('selection is not painted in place, so it needs a rebuild to show');
    // Only mouseup may rebuild.
    const up = body.slice(body.indexOf('const up = ()'));
    if (up.indexOf('refresh()') < 0) throw new Error('the drag never commits');
  });

  check('the tint alpha rides in the colour stops, not on globalAlpha', () => {
    // Scaling a gradient by a second opacity means a stop set to 0 never actually reaches
    // zero, so the fade-out the far stop exists for cannot happen.
    const i0 = src.indexOf('const _ts = _themeTintStops(stored);');
    if (i0 < 0) throw new Error('the canvas tint is gone');
    // Comments stripped: the note explaining WHY alpha is not on globalAlpha contains
    // the word, so a raw search matches the explanation instead of the code.
    const body = codeOnly(src.slice(i0, src.indexOf('doc.addImage(cnv.toDataURL', i0)));
    if (body.indexOf('globalAlpha') >= 0) throw new Error('the tint is still scaled by globalAlpha');
    if (body.indexOf('_themeRgba(_ts[0].c, _ts[0].a)') < 0) throw new Error('the near stop does not carry its own alpha');
    if (body.indexOf('_themeRgba(_ts[1].c, _ts[1].a)') < 0) throw new Error('the far stop does not carry its own alpha');
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
    scheduleAutosave = () => {};
    _dsRenderCenter = () => {};
    _dsRenderTools = () => {};
    _dsRenderRail = () => {};

    __check('the rendered theme block shows the short labels', () => {
      const t = document.createElement('div'); document.body.appendChild(t);
      const desc = { kind: 'spec', type: 'spec', title: 'ART.001', row: { id: 'ART.001' }, _ovKey: 'ART.001' };
      _dsPageAppearanceInto(t, desc);
      const txt = t.textContent || '';
      // Theme, colour and image share ONE row now, so the colour is a labelled dot
      // rather than a word: its neighbours name the row and its tooltip names it.
      // UPDATED 17.33: the colour, gradient and image controls are ICONS on one row with
      // Light / Dark. They are identified by tooltip, which is asserted below, not by a
      // word that would not fit beside them.
      if (txt.indexOf('Background colour') >= 0) throw new Error('a long label is back on screen');
      const tips = Array.prototype.slice.call(t.querySelectorAll('button')).map(b => b.title || '').join(' | ');
      if (tips.indexOf('image') < 0) throw new Error('nothing in the row offers a background image');
      const row = t.querySelector('[data-row="themeline"]');
      if (!row) throw new Error('no Text / Background row');
      // Text and Background are two groups on ONE row, separated by a gap rather than a
      // rule, so the colour dot and the image button share the row with Light / Dark.
      // By NAME, not by a style substring: jsdom serialises cssText with spaces, so
      // [style*='gap:14px'] never matches what the browser actually stored.
      const bar = row;
      if (!bar || !bar.querySelector('input[type="color"]')) throw new Error('the colour dot is not on the same row as Light / Dark');
      const rowTips = Array.prototype.slice.call(bar.querySelectorAll('button')).map(b => b.title || '').join(' | ');
      if (rowTips.indexOf('image') < 0) throw new Error('the image control is not on the same row as Light / Dark');
      // And the picker beside it carries no inline shape, so the global dot rule wins.
      const ci = t.querySelector('input[type="color"]');
      if (!ci) throw new Error('no colour picker in the theme block');
      if ((ci.getAttribute('style') || '').indexOf('border-radius') >= 0) throw new Error('it is forcing its own shape again');
    });

    __check('the gradient angle means the same thing to CSS and to canvas', () => {
      // This is the whole risk in the feature: the DOM preview draws a CSS gradient and
      // the PDF rasterises a canvas one. Computed separately they drift, and the preview
      // starts lying about the export. Both come from _themeGradPoints / _themeGradCss.
      // CSS measures 0deg as pointing UP, increasing clockwise.
      const cases = [[0, 50, 100, 50, 0], [90, 0, 50, 100, 50], [180, 50, 0, 50, 100], [270, 100, 50, 0, 50]];
      cases.forEach(c => {
        const p = _themeGradPoints(c[0], 100, 100);
        const got = [Math.round(p.x0), Math.round(p.y0), Math.round(p.x1), Math.round(p.y1)].join(",");
        const want = c.slice(1).join(",");
        if (got !== want) throw new Error(c[0] + 'deg gave ' + got + ', expected ' + want);
      });
      // And the CSS string carries the same number, not a converted one.
      // UPDATED 17.32: stops carry explicit POSITIONS now, since a gradient can have
      // more than two and where each colour sits is most of what shapes it. The angle
      // claim is unchanged.
      const st = { bg: '#ff0000', bg2: '#0000ff', bgAngle: 90 };
      if (_themeGradCss(st) !== 'linear-gradient(90deg, #ff0000 0%, #0000ff 100%)') throw new Error('css: ' + _themeGradCss(st));
      // And the ramp preview can be forced to 90deg without touching the stored angle.
      if (_themeGradCss(st, 90).indexOf('90deg') < 0) throw new Error('override ignored');
      if (_themeGradAngle(st) !== 90) throw new Error('the override leaked into the stored angle');
    });

    __check('a gradient needs two stops, and the angle has a sane default', () => {
      if (_themeHasGrad({ bg: '#ff0000' })) throw new Error('one stop counted as a gradient');
      if (!_themeHasGrad({ bg: '#ff0000', bg2: '#0000ff' })) throw new Error('two stops did not');
      if (_themeGradCss({ bg: '#ff0000' })) throw new Error('built a gradient from one stop');
      if (_themeGradAngle({}) !== THEME_GRAD_DEFAULT_ANGLE) throw new Error('no default angle');
      if (_themeGradAngle({ bgAngle: -90 }) !== 270) throw new Error('negative angle not normalised: ' + _themeGradAngle({ bgAngle: -90 }));
      if (_themeGradAngle({ bgAngle: 'x' }) !== THEME_GRAD_DEFAULT_ANGLE) throw new Error('junk angle not defaulted');
    });

    __check('a gradient is a LIST of stops, sorted, clamped, and at least two', () => {
      const st = { bgStops: [{ c: '#0000ff', p: 1.4 }, { c: '#ff0000', p: -0.2 }, { c: '#00ff00', p: 0.5 }] };
      const got = _themeStops(st);
      if (got.map(x => x.p).join(',') !== '0,0.5,1') throw new Error('not sorted/clamped: ' + got.map(x => x.p).join(','));
      if (got[0].c !== '#ff0000') throw new Error('sorting lost the pairing of colour and position');
      if (_themeStops({ bgStops: [{ c: '#ff0000', p: 0 }] })) throw new Error('one stop counted as a gradient');
    });

    __check('the two-stop version it shipped as still opens, and is kept in sync', () => {
      // bg/bg2 is the shape this shipped with a version ago. It migrates on READ, and the
      // ends are written back, so an older build opening the file still finds a sensible
      // gradient and the flat-fill fallback still has a colour to use.
      const legacy = _themeStops({ bg: '#111111', bg2: '#222222' });
      if (!legacy || legacy.length !== 2) throw new Error('legacy pair did not migrate');
      if (legacy[0].p !== 0 || legacy[1].p !== 1) throw new Error('migrated stops are not at the ends');
      const st = {};
      _themeSetStops(st, [{ c: '#aaaaaa', p: 0.2 }, { c: '#111111', p: 0 }, { c: '#ffffff', p: 1 }]);
      if (st.bg !== '#111111') throw new Error('bg not synced to the first stop: ' + st.bg);
      if (st.bg2 !== '#ffffff') throw new Error('bg2 not synced to the last stop: ' + st.bg2);
      _themeSetStops(st, [{ c: '#111111', p: 0 }]);
      if (st.bgStops) throw new Error('a one-stop gradient was stored');
    });

    __check('a stop added mid-ramp takes the colour already there', () => {
      // That is what makes clicking the bar safe: adding a stop changes nothing until you
      // move or recolour it.
      const stops = [{ c: '#000000', p: 0 }, { c: '#ffffff', p: 1 }];
      if (_themeColorAt(stops, 0.5) !== '#808080') throw new Error('midpoint: ' + _themeColorAt(stops, 0.5));
      if (_themeColorAt(stops, -1) !== '#000000' || _themeColorAt(stops, 2) !== '#ffffff') throw new Error('not clamped outside the ramp');
    });

    __check('the gradient bar draws one handle per stop and guards the last two', () => {
      const mkDot = (v, f) => { const i = document.createElement('input'); i.type = 'color'; i.value = v || f || '#000000'; return i; };
      const host = document.createElement('div'); document.body.appendChild(host);
      const th = { bg: '#ff0000', bgStops: [{ c: '#ff0000', p: 0 }, { c: '#00ff00', p: 0.4 }, { c: '#0000ff', p: 1 }] };
      _dsGradBarInto(host, th, () => {}, () => {}, mkDot);
      const handles = Array.prototype.slice.call(host.querySelectorAll('div')).filter(d => (d.title || '').indexOf('%') > 0);
      if (handles.length !== 3) throw new Error('expected 3 handles, found ' + handles.length);
      // UPDATED 17.34: removing a stop is an x ON the stop, shown only while it is
      // selected, so deleting a colour means pointing at that colour. A button named
      // 'Remove stop' named no stop.
      const badges = host.querySelectorAll('[data-clearx]');
      if (badges.length !== 3) throw new Error('expected an x per stop, found ' + badges.length);
      const shown = Array.prototype.slice.call(badges).filter(x => x.style.display !== 'none');
      if (shown.length !== 1) throw new Error('expected exactly one visible x, found ' + shown.length);
      // At two stops there is no x at all: a one-stop gradient is a flat colour wearing
      // a ramp, and the gradient toggle is how you actually turn it off.
      const host2 = document.createElement('div'); document.body.appendChild(host2);
      _dsGradBarInto(host2, { bg: '#ff0000', bgStops: [{ c: '#ff0000', p: 0 }, { c: '#0000ff', p: 1 }] }, () => {}, () => {}, mkDot);
      if (host2.querySelectorAll('[data-clearx]').length) throw new Error('a stop can be deleted down to one');
    });

    __check('the ramp preview is drawn at 90deg whatever the page angle is', () => {
      // The bar shows the colour ORDER, not the direction: tilting it would slope the
      // ramp under handles that still slide left to right.
      const mkDot = () => { const i = document.createElement('input'); i.type = 'color'; return i; };
      const host = document.createElement('div'); document.body.appendChild(host);
      const th = { bg: '#ff0000', bg2: '#0000ff', bgAngle: 217 };
      _dsGradBarInto(host, th, () => {}, () => {}, mkDot);
      // The track sits INSIDE a taller row wrapper now, which is what gives the round
      // handles somewhere to sit without being clipped.
      // By NAME: the track sits inside a taller wrapper, and 'div > div' matches that
      // wrapper first because it is itself a child of the host div.
      const track = host.querySelector('[data-grad="track"]');
      if (!track) throw new Error('no gradient track');
      if ((track.getAttribute('style') || '').indexOf('90deg') < 0) throw new Error('the ramp preview followed the page angle');
      if (_themeGradAngle(th) !== 217) throw new Error('the stored angle was changed');
    });

    __check('the panel names its two halves and clears colour from the dot', () => {
      const t = document.createElement('div'); document.body.appendChild(t);
      _pageThemes()['tk'] = { mode: 'light', bg: '#ff0000' };
      _dsThemeControlInto(t, 'tk', null);
      const txt = t.textContent || '';
      if (txt.indexOf('Text') < 0) throw new Error('the Text half is unnamed');
      if (txt.indexOf('Background') < 0) throw new Error('the Background half is unnamed');
      if (t.querySelectorAll('[data-help]').length < 2) throw new Error('the two halves do not explain themselves');
      // The clear rides the DOT, so picking a colour no longer pushes the rows below it
      // down by adding a button.
      const x = t.querySelectorAll('[data-clearx]');
      if (x.length !== 1) throw new Error('expected one clear badge, found ' + x.length);
      if (!x[0].parentElement.querySelector('input[type="color"]')) throw new Error('the clear is not on the dot');
      delete _pageThemes()['tk'];
    });

    __check('a background image HIDES the gradient controls but keeps the stops', () => {
      // A picture covers the whole page, so the ramp under it is invisible and editing it
      // would be guesswork. Nothing may delete the stops: taking the image off has to
      // bring back exactly the gradient that was built.
      const stops = [{ c: '#ff0000', p: 0 }, { c: '#0000ff', p: 1 }];
      _pageThemes()['gi'] = { mode: 'light', bg: '#ff0000', bgStops: stops.slice(), image: 'data:x' };
      const t = document.createElement('div'); document.body.appendChild(t);
      _dsThemeControlInto(t, 'gi', null);
      if (t.querySelector('[data-grad="track"]')) throw new Error('the ramp is shown under an image');
      const tips = Array.prototype.slice.call(t.querySelectorAll('button')).map(b => b.title || '').join(' | ');
      // Matching EITHER tooltip the gradient icon can carry: with stops already set it
      // reads 'Gradient is on', not 'Fade the background', so checking one misses it.
      if (tips.indexOf('Fade the background') >= 0 || tips.indexOf('Gradient is on') >= 0) {
        throw new Error('the gradient toggle is offered under an image');
      }
      // The data survived.
      const kept = _themeStops(_pageThemes()['gi']);
      if (!kept || kept.length !== 2) throw new Error('the stops were dropped when the image went on');
      // And removing the image brings the ramp straight back.
      _pageThemes()['gi'].image = null;
      const t2 = document.createElement('div'); document.body.appendChild(t2);
      _dsThemeControlInto(t2, 'gi', null);
      if (!t2.querySelector('[data-grad="track"]')) throw new Error('the gradient did not come back');
      delete _pageThemes()['gi'];
    });

    __check('a template carries the page background, and never its decoded image', () => {
      // A gradient or a tinted image is a design decision and exactly the kind that gets
      // reused. _bakedImg is a live Image the renderer caches on the record; serialising
      // it yields {}, which then reads as a baked image that is present and empty.
      _pageThemes()['tsave'] = {
        mode: 'dark', bg: '#101010', bgStops: [{ c: '#101010', p: 0 }, { c: '#404040', p: 1 }],
        bgAngle: 45, tint: '#ff0000', tintA: 0.4, _bakedImg: { fake: 'live Image object' }
      };
      const saved = _themeForSave('tsave');
      if (!saved) throw new Error('nothing saved');
      if ('_bakedImg' in saved) throw new Error('the decoded image went into the template');
      if (saved.bgAngle !== 45) throw new Error('angle lost');
      if (!saved.bgStops || saved.bgStops.length !== 2) throw new Error('stops lost');
      if (saved.tintA !== 0.4) throw new Error('tint lost');
      // Restoring puts it on another page without sharing the object.
      _themeApplySaved('tload', saved);
      const back = _pageThemes()['tload'];
      if (!back || back.bgAngle !== 45) throw new Error('restore lost the angle');
      if (back.bgStops === saved.bgStops) throw new Error('the template and the page share one stops array');
      back.bgStops[0].c = '#ffffff';
      if (saved.bgStops[0].c !== '#101010') throw new Error('editing the page rewrote the template');
      delete _pageThemes()['tsave']; delete _pageThemes()['tload'];
    });

    __check('applying a template with no background leaves the page alone', () => {
      // Absent means the template predates the idea, not that the page should be blanked.
      _pageThemes()['keep'] = { mode: 'dark', bg: '#123456' };
      _themeApplySaved('keep', null);
      if ((_pageThemes()['keep'] || {}).bg !== '#123456') throw new Error('an older template wiped the page background');
      delete _pageThemes()['keep'];
    });

    __check('exactly ONE clear x, and it sits on the outermost layer', () => {
      // Precedence is image over gradient over colour: the x is always on the thing you
      // would remove to reveal the next one down. Three x's would be three ways to undo
      // something and none of them would say which.
      const titleOfX = (setup) => {
        _pageThemes()['xk'] = setup;
        const t = document.createElement('div'); document.body.appendChild(t);
        _dsThemeControlInto(t, 'xk', null);
        // Only the Background group's badges; the gradient ramp has its own per-stop x.
        const row = t.querySelector('[data-row="themeline"]');
        const xs = row ? row.querySelectorAll('[data-clearx]') : [];
        delete _pageThemes()['xk'];
        if (xs.length > 1) throw new Error('found ' + xs.length + ' clear badges at once');
        return xs.length ? (xs[0].title || '') : '';
      };
      if (titleOfX({ mode: 'light' }) !== '') throw new Error('an x appeared with nothing to clear');
      if (titleOfX({ mode: 'light', bg: '#ff0000' }).indexOf('theme default') < 0) throw new Error('colour x missing or mislabelled');
      const g = titleOfX({ mode: 'light', bg: '#ff0000', bgStops: [{ c: '#ff0000', p: 0 }, { c: '#0000ff', p: 1 }] });
      if (g.indexOf('Delete this gradient') < 0) throw new Error('the x did not move to the gradient: ' + g);
      const i = titleOfX({ mode: 'light', bg: '#ff0000', bgStops: [{ c: '#ff0000', p: 0 }, { c: '#0000ff', p: 1 }], image: 'data:x' });
      if (i.indexOf('Delete this image') < 0) throw new Error('the x did not move to the image: ' + i);
    });

    __check('the selected background icon is a ring, never a filled block', () => {
      // .active paints a solid --ui-active background, and these buttons ARE their icons:
      // a filled block swallowed the gradient chip it was meant to be highlighting.
      _pageThemes()['ik2'] = { mode: 'light', bg: '#ff0000', bgStops: [{ c: '#ff0000', p: 0 }, { c: '#0000ff', p: 1 }] };
      const t = document.createElement('div'); document.body.appendChild(t);
      _dsThemeControlInto(t, 'ik2', null);
      const row = t.querySelector('[data-row="themeline"]');
      const icons = Array.prototype.slice.call(row.querySelectorAll('button')).filter(b => b.querySelector('svg'));
      if (icons.length < 2) throw new Error('expected the gradient and image icons, found ' + icons.length);
      icons.forEach(b => {
        if (b.classList.contains('active')) throw new Error('an icon uses .active, which fills it and hides the glyph');
      });
      // The one that is on is at full strength; the others are faded.
      // Read as PROPERTIES: jsdom normalises a cssText string (opacity:1 comes back as
      // '1', padding:0 9px as '0px 9px'), so a substring search on the raw attribute
      // misses what the browser actually stored.
      const lit = icons.filter(b => b.style.opacity === '1');
      const dim = icons.filter(b => b.style.opacity === '0.5');
      if (lit.length !== 1) throw new Error(lit.length + ' icons at full strength; expected the gradient only');
      if (!dim.length) throw new Error('nothing is faded, so there is no contrast to read');
      delete _pageThemes()['ik2'];
    });

    __check('the gradient handles stay inside the panel at 0% and 100%', () => {
      // A handle is centred on its position, so at the ends half of it hung outside the
      // section border. The rail is inset by half a handle either side.
      const host = document.createElement('div'); document.body.appendChild(host);
      const mkDot = (v, f) => { const i = document.createElement('input'); i.type = 'color'; i.value = v || f || '#000000'; return i; };
      _dsGradBarInto(host, { bg: '#ff0000', bgStops: [{ c: '#ff0000', p: 0 }, { c: '#0000ff', p: 1 }] }, () => {}, () => {}, mkDot);
      const wrap = host.querySelector('div');
      const pad = wrap.style.padding || '';
      if (pad.indexOf('9px') < 0) throw new Error('the rail has no inset, so end handles overflow the panel: ' + JSON.stringify(pad));
      const track = host.querySelector('[data-grad="track"]');
      if (track.parentElement === wrap) throw new Error('the track is not inside the inset rail');
    });

    __check('every control in the Text / Background cluster selects the same way', () => {
      _pageThemes()['ck'] = { mode: 'dark', bg: '#ff0000' };
      const t = document.createElement('div'); document.body.appendChild(t);
      _dsThemeControlInto(t, 'ck', null);
      const row = t.querySelector('[data-row="themeline"]');
      const btns = Array.prototype.slice.call(row.querySelectorAll('button')).filter(b => !b.getAttribute('data-clearx'));
      if (btns.length < 4) throw new Error('expected Light, Dark and the background icons, found ' + btns.length);
      btns.forEach(b => {
        if (b.classList.contains('active')) throw new Error('a control fills itself instead of ringing: ' + (b.textContent || 'icon'));
      });
      const lit = btns.filter(b => b.style.opacity === '1');
      const dim = btns.filter(b => b.style.opacity === '0.5');
      if (!lit.length) throw new Error('nothing is shown as selected');
      if (!dim.length) throw new Error('nothing is faded, so there is no contrast to read');
      // Dark is the mode here, so exactly one of the two words is lit.
      const words = btns.filter(b => (b.textContent || '').trim());
      const litWords = words.filter(b => b.style.opacity === '1');
      if (litWords.length !== 1 || litWords[0].textContent !== 'Dark') throw new Error('the wrong theme reads as selected');
      delete _pageThemes()['ck'];
    });

    __check('the stop colour sits beside the angle, not pushed to the far edge', () => {
      // The two things you reach for while shaping a gradient are its colour and its
      // direction. A flex spacer put half the panel between them.
      const host = document.createElement('div'); document.body.appendChild(host);
      const mk = (v, f) => { const i = document.createElement('input'); i.type = 'color'; i.value = v || f || '#000000'; return i; };
      _dsGradBarInto(host, { bg: '#ff0000', bgStops: [{ c: '#ff0000', p: 0 }, { c: '#0000ff', p: 1 }], bgAngle: 180 }, () => {}, () => {}, mk);
      const row = Array.prototype.slice.call(host.querySelectorAll('div')).filter(d => d.querySelector('input[type="number"]'))[0];
      if (!row) throw new Error('no angle row');
      const kids = Array.prototype.slice.call(row.children);
      const iSw = kids.findIndex(c => c.querySelector && c.querySelector('input[type="color"]'));
      const iAng = kids.findIndex(c => c.tagName === 'INPUT');
      if (iSw < 0) throw new Error('no stop swatch in the row');
      if (!(iSw < iAng)) throw new Error('the swatch is not before the angle: swatch ' + iSw + ', angle ' + iAng);
      // And it is not shoved to the edge by a spacer.
      if ((row.children[iSw].style.marginLeft || '') === 'auto') throw new Error('the swatch is still pushed to the far edge');
    });

    __check('the gradient row is an angle only, with no second position box', () => {
      // The handle you just dragged IS the position, so a box restating it was a second
      // way to say the same thing, and the one that made the % read as the angle.
      const host = document.createElement('div'); document.body.appendChild(host);
      const mkDot = (v, f) => { const i = document.createElement('input'); i.type = 'color'; i.value = v || f || '#000000'; return i; };
      _dsGradBarInto(host, { bg: '#ff0000', bgStops: [{ c: '#ff0000', p: 0 }, { c: '#0000ff', p: 1 }], bgAngle: 180 }, () => {}, () => {}, mkDot);
      const nums = host.querySelectorAll('input[type="number"]');
      if (nums.length !== 1) throw new Error('expected only the angle, found ' + nums.length + ' number fields');
      if (nums[0].value !== '180') throw new Error('the one field is not the angle: ' + nums[0].value);
      const txt = host.textContent || '';
      if (txt.indexOf('STOP') >= 0 || txt.indexOf('Stop') >= 0) throw new Error('the stop field is back');
      if (txt.indexOf('COLOUR') >= 0 || txt.indexOf('Colour') >= 0) throw new Error('the colour label is back beside the swatch');
      if (txt.indexOf('ANGLE') >= 0 || txt.indexOf('Angle') >= 0) throw new Error('the angle is still spelled out rather than drawn');
      if (!host.querySelector('svg')) throw new Error('no angle glyph');
    });

    __check('the angle scrubs with the wheel, live, without rebuilding the panel', () => {
      const th = { bg: '#ff0000', bgStops: [{ c: '#ff0000', p: 0 }, { c: '#0000ff', p: 1 }], bgAngle: 180 };
      const host = document.createElement('div'); document.body.appendChild(host);
      let paints = 0, rebuilds = 0;
      const mkDot = (v, f) => { const i = document.createElement('input'); i.type = 'color'; i.value = v || f || '#000000'; return i; };
      _dsGradBarInto(host, th, () => { rebuilds++; }, () => { paints++; }, mkDot);
      const ang = host.querySelector('input[type="number"]');
      const fire = (dy, shift) => {
        const e = new window.WheelEvent('wheel', { deltaY: dy, shiftKey: !!shift, cancelable: true, bubbles: true });
        ang.dispatchEvent(e);
        return e.defaultPrevented;
      };
      // preventDefault, or the panel scrolls out from under the gesture — the same
      // requirement the underlay's wheel zoom has.
      if (!fire(-100)) throw new Error('the wheel is not captured, so the panel scrolls instead');
      if (th.bgAngle !== 181) throw new Error('one tick up gave ' + th.bgAngle + ', expected 181');
      fire(100); fire(100);
      if (th.bgAngle !== 179) throw new Error('two ticks down gave ' + th.bgAngle);
      fire(-100, true);
      if (th.bgAngle !== 194) throw new Error('shift should sweep by 15, gave ' + th.bgAngle);
      // Live: every tick repaints the page, and the box shows the value as it moves.
      if (paints < 4) throw new Error('only ' + paints + ' repaints for 4 ticks; the preview is not live');
      if (ang.value !== '194') throw new Error('the box does not follow the wheel: ' + ang.value);
      // And NONE of them rebuilt the panel, which would take the focus and the element
      // mid-scroll. One rebuild lands later, debounced, so a sweep is one undo entry.
      if (rebuilds !== 0) throw new Error(rebuilds + ' rebuilds during a wheel sweep');
    });

    __check('the angle wraps rather than running off either end', () => {
      const th = { bg: '#ff0000', bgStops: [{ c: '#ff0000', p: 0 }, { c: '#0000ff', p: 1 }], bgAngle: 0 };
      const host = document.createElement('div'); document.body.appendChild(host);
      const mkDot = (v, f) => { const i = document.createElement('input'); i.type = 'color'; i.value = v || f || '#000000'; return i; };
      _dsGradBarInto(host, th, () => {}, () => {}, mkDot);
      const ang = host.querySelector('input[type="number"]');
      const fire = (dy) => ang.dispatchEvent(new window.WheelEvent('wheel', { deltaY: dy, cancelable: true, bubbles: true }));
      fire(100);   // one below zero
      if (th.bgAngle !== 359) throw new Error('0 minus 1 gave ' + th.bgAngle + ', expected 359');
      fire(-100);
      if (th.bgAngle !== 0) throw new Error('359 plus 1 gave ' + th.bgAngle + ', expected 0');
    });

    __check('a tint is two stops, each with its own alpha', () => {
      // A flat wash is the same colour and alpha at both ends, so there is one shape and
      // no separate flat path. 'Solid colour faded out' is the second alpha at 0.
      const flat = _themeTintStops({ image: 'data:x', tint: '#ff0000', tintA: 0.4 });
      if (!flat || flat.length !== 2) throw new Error('a flat tint is not two stops');
      if (flat[0].c !== flat[1].c || flat[0].a !== flat[1].a) throw new Error('a flat tint is not even');
      const fade = _themeTintStops({ image: 'data:x', tint: '#ff0000', tintA: 0.6, tint2: '#ff0000', tintA2: 0 });
      if (fade[1].a !== 0) throw new Error('the far end does not reach fully transparent');
      if (fade[0].a !== 0.6) throw new Error('the near end lost its opacity');
      // A tint needs an image to sit on.
      if (_themeTintStops({ tint: '#ff0000', tintA: 0.5 })) throw new Error('tinted a page with no image');
    });

    __check('the tint gradient reaches the page as real rgba, both renderers', () => {
      const st = { image: 'data:x', tint: '#ff0000', tintA: 0.5, tint2: '#0000ff', tintA2: 0, tintAngle: 90 };
      const css = _themeTintCss(st);
      if (css.indexOf('90deg') < 0) throw new Error('the tint angle is not in the css: ' + css);
      if (css.indexOf('rgba(255,0,0,0.5)') < 0) throw new Error('near stop wrong: ' + css);
      if (css.indexOf('rgba(0,0,255,0)') < 0) throw new Error('far stop is not transparent: ' + css);
      // The tint has its OWN angle, independent of the background gradient's.
      if (_themeTintAngle(st) !== 90) throw new Error('tint angle wrong');
      if (_themeGradAngle(st) !== THEME_GRAD_DEFAULT_ANGLE) throw new Error('the tint angle leaked onto the background gradient');
    });

    __check('the gap below the theme block is the same whatever it contains', () => {
      // It used to be the footer's own top margin, so it varied with which rows happened
      // to be showing: a plain colour page sat almost against the footer while a gradient
      // page, which has an extra row, looked right.
      const gapFor = (setup) => {
        _pageThemes()['sp'] = setup;
        const t = document.createElement('div'); document.body.appendChild(t);
        _dsPageAppearanceInto(t, { kind: 'layout', type: 'moodboard', title: 'M', page: { id: 'sp', elements: [] } });
        delete _pageThemes()['sp'];
        // By NAME: walking up to the first ancestor with ANY bottom margin finds some
        // outer element and reports the same value for every case, which passes whether
        // or not the theme block actually owns a gap.
        const e = t.querySelector('[data-themegap]');
        return e ? (e.style.marginBottom || '') : null;
      };
      const plain = gapFor({ mode: 'light' });
      const grad = gapFor({ mode: 'light', bg: '#ff0000', bgStops: [{ c: '#ff0000', p: 0 }, { c: '#0000ff', p: 1 }] });
      const img = gapFor({ mode: 'light', image: 'data:x' });
      if (!plain) throw new Error('no gap below a plain theme block');
      if (parseFloat(plain) < 20) throw new Error('the gap is only ' + plain + ', which is what made a plain page sit against the footer');
      if (plain !== grad || plain !== img) throw new Error('the gap varies: plain ' + plain + ', gradient ' + grad + ', image ' + img);
    });

    __check('switching layers keeps every layer\u2019s settings', () => {
      // Trying a background image used to cost you the gradient you had built. Each layer
      // holds its own settings for the page and bgMode says which one shows; only the x
      // throws anything away.
      const th = { mode: 'light', bg: '#ff0000', bgStops: [{ c: '#ff0000', p: 0 }, { c: '#0000ff', p: 1 }], image: 'data:x', imageZoom: 2 };
      _pageThemes()['sw'] = th;
      const render = () => { const t = document.createElement('div'); document.body.appendChild(t); _dsThemeControlInto(t, 'sw', null); return t; };
      // Start on the image, switch to the gradient, switch back.
      th.bgMode = 'image';
      if (_themeBgMode(th) !== 'image') throw new Error('image did not show');
      th.bgMode = 'gradient';
      if (!_themeStops(th)) throw new Error('the gradient was lost when the image was showing');
      if (!th.image) throw new Error('the image was lost when the gradient was selected');
      if (th.imageZoom !== 2) throw new Error('the image crop was lost');
      th.bgMode = 'colour';
      if (!_themeStops(th) || !th.image) throw new Error('selecting the flat colour dropped the other layers');
      render();
      delete _pageThemes()['sw'];
    });

    __check('the x deletes only its own layer and falls back to the next', () => {
      const t = document.createElement('div'); document.body.appendChild(t);
      const th = { mode: 'light', bgMode: 'image', bg: '#ff0000', bgStops: [{ c: '#ff0000', p: 0 }, { c: '#0000ff', p: 1 }], image: 'data:x' };
      _pageThemes()['xd'] = th;
      _dsThemeControlInto(t, 'xd', null);
      const row = t.querySelector('[data-row="themeline"]');
      const x = row.querySelector('[data-clearx]');
      if (!x) throw new Error('no x on the showing layer');
      x.onclick({ preventDefault() {}, stopPropagation() {} });
      if (th.image) throw new Error('the image survived its own x');
      if (!_themeStops(th)) throw new Error('deleting the image took the gradient with it');
      if (_themeBgMode(th) !== 'gradient') throw new Error('it did not fall back to the gradient, got ' + _themeBgMode(th));
      delete _pageThemes()['xd'];
    });

    __check('the gradient x deletes the gradient and nothing else', () => {
      const t = document.createElement('div'); document.body.appendChild(t);
      const th = { mode: 'light', bgMode: 'gradient', bg: '#ff0000',
        bgStops: [{ c: '#ff0000', p: 0 }, { c: '#0000ff', p: 1 }], image: 'data:x', imageZoom: 2 };
      _pageThemes()['xg'] = th;
      _dsThemeControlInto(t, 'xg', null);
      const row = t.querySelector('[data-row="themeline"]');
      const x = row.querySelector('[data-clearx]');
      if (!x) throw new Error('no x on the showing layer');
      if ((x.title || '').indexOf('gradient') < 0) throw new Error('the x is not on the gradient: ' + x.title);
      x.onclick({ preventDefault() {}, stopPropagation() {} });
      if (_themeStops(th)) throw new Error('the gradient survived its own x');
      if (!th.image) throw new Error('deleting the gradient took the image with it');
      if (th.imageZoom !== 2) throw new Error('deleting the gradient reset the image crop');
      if (th.bg !== '#ff0000') throw new Error('deleting the gradient took the flat colour with it');
      if (_themeBgMode(th) !== 'colour') throw new Error('it did not fall back to the colour, got ' + _themeBgMode(th));
      delete _pageThemes()['xg'];
    });

    __check('a project saved before modes existed opens showing the same layer', () => {
      // bgMode is derived when unset: whatever the outermost layer with data was, that is
      // what was being shown before.
      if (_themeBgMode({ bg: '#ff0000' }) !== 'colour') throw new Error('flat colour');
      if (_themeBgMode({ bg: '#f00', bgStops: [{ c: '#f00', p: 0 }, { c: '#00f', p: 1 }] }) !== 'gradient') throw new Error('gradient');
      if (_themeBgMode({ bg: '#f00', image: 'data:x' }) !== 'image') throw new Error('image');
      if (_themeBgMode({}) !== null) throw new Error('an empty theme claims a layer');
      // A stored mode naming a layer with no data falls through rather than showing blank.
      if (_themeBgMode({ bgMode: 'image', bg: '#ff0000' }) !== 'colour') throw new Error('image mode with no image was honoured');
      if (_themeBgMode({ bgMode: 'gradient', bg: '#ff0000' }) !== 'colour') throw new Error('gradient mode with no stops was honoured');
      if (_themeBgMode({ bgMode: 'colour' }) !== null) throw new Error('colour mode with no colour was honoured');
      // And a mode that DOES have its data wins over the outer layers.
      if (_themeBgMode({ bgMode: 'colour', bg: '#f00', image: 'data:x' }) !== 'colour') throw new Error('an explicit mode lost to the derived one');
    });

    __check('every slider in this panel scrubs with the wheel, live', () => {
      // A slider here is a live control, and reaching for the wheel over one is the same
      // instinct as over the angle box. Without preventDefault the panel scrolls instead.
      _pageThemes()['ws'] = { mode: 'light', bgMode: 'image', image: 'data:x', tint: '#ff0000', tintA: 0.5, imageZoom: 1 };
      const t = document.createElement('div'); document.body.appendChild(t);
      _dsThemeControlInto(t, 'ws', null);
      const th = _pageThemes()['ws'];
      const ranges = Array.prototype.slice.call(t.querySelectorAll('input[type="range"]'));
      if (ranges.length < 4) throw new Error('expected the tint opacity plus three crop sliders, found ' + ranges.length);
      const fire = (el, dy) => {
        const e = new window.WheelEvent('wheel', { deltaY: dy, cancelable: true, bubbles: true });
        el.dispatchEvent(e);
        return e.defaultPrevented;
      };
      if (!fire(ranges[0], -100)) throw new Error('the tint opacity does not capture the wheel');
      if (th.tintA <= 0.5) throw new Error('the tint opacity did not move: ' + th.tintA);
      const zoom = ranges[ranges.length - 3];
      if (!fire(zoom, -100)) throw new Error('the crop sliders do not capture the wheel');
      if (!(th.imageZoom > 1)) throw new Error('zoom did not move: ' + th.imageZoom);
      // Clamped at the ends rather than running past them.
      for (let i = 0; i < 40; i++) fire(ranges[0], -100);
      if (th.tintA > 1) throw new Error('opacity ran past 100%: ' + th.tintA);
      delete _pageThemes()['ws'];
    });

    __check('the image crop is three rows, not six', () => {
      const t = document.createElement('div'); document.body.appendChild(t);
      _pageThemes()['ik'] = { mode: 'dark', image: 'data:x' };
      _dsThemeControlInto(t, 'ik', null);
      const ranges = t.querySelectorAll('input[type="range"]');
      if (ranges.length !== 3) throw new Error('expected 3 crop sliders, found ' + ranges.length);
      // Each label shares its slider's row rather than sitting above it.
      Array.prototype.forEach.call(ranges, (r) => {
        if (!r.parentElement || r.parentElement.children.length !== 2) throw new Error('a crop slider does not share a row with its label');
      });
      if ((t.textContent || '').indexOf('Clear background image') >= 0) throw new Error('the full-width clear button is back');
      delete _pageThemes()['ik'];
    });

    __check('a tint only applies over an image, and clamps', () => {
      // It is a wash over a picture; with no picture there is nothing to wash.
      if (_themeTint({ tint: '#ff0000', tintA: 0.5 })) throw new Error('tinted a page with no image');
      if (_themeTint({ image: 'data:x' })) throw new Error('tinted without a colour');
      if (_themeTint({ image: 'data:x', tint: '#ff0000', tintA: 0 })) throw new Error('a zero tint is no tint, not a transparent one');
      const t = _themeTint({ image: 'data:x', tint: '#ff0000', tintA: 5 });
      if (!t || t.a !== 1) throw new Error('opacity not clamped: ' + (t && t.a));
    });

    __check('the DOM layers match the canvas order: gradient under, tint over', () => {
      // _applyPageTheme fills the gradient, then draws the image with the tint baked on.
      // CSS lists layers TOPMOST FIRST, so the tint must come first and the gradient last,
      // or the preview shows a different stack from the PDF.
      // IMAGE showing: tint on top of the picture, and the gradient is not drawn at all
      // because it is not the layer that is showing.
      _pageThemes()['kk'] = { mode: 'light', bgMode: 'image', bg: '#ff0000', bg2: '#0000ff', image: 'data:x', tint: '#00ff00', tintA: 0.4 };
      let css = (_dsPageThemeCss('kk') || {}).css || '';
      const iTint = css.indexOf('rgba(0,255,0');
      const iImg = css.indexOf('url(data:x)');
      if (iTint < 0) throw new Error('no tint layer');
      if (iImg < 0) throw new Error('no image layer');
      if (!(iTint < iImg)) throw new Error('the tint is under the image: tint ' + iTint + ', image ' + iImg);
      if (css.indexOf('#ff0000 0%') >= 0) throw new Error('the gradient is drawn while the image is the showing layer');
      // GRADIENT showing: the ramp is there and the picture is not.
      _pageThemes()['kk'].bgMode = 'gradient';
      css = (_dsPageThemeCss('kk') || {}).css || '';
      if (css.indexOf('#ff0000 0%') < 0) throw new Error('the gradient is not drawn when it is the showing layer');
      if (css.indexOf('url(data:x)') >= 0) throw new Error('the image is drawn while the gradient is showing');
      delete _pageThemes()['kk'];
    });

    __check('a gradient-only page still gets a background', () => {
      // The early return used to bail unless mode, bg or image was set, so a page whose
      // only setting was a second stop or a tint rendered plain.
      _pageThemes()['g2'] = { bg: '#ff0000', bg2: '#0000ff' };
      if (!_dsPageThemeCss('g2')) throw new Error('a gradient page returned no css');
      delete _pageThemes()['g2'];
    });

    __check('the copyright line defaults to the studio wording', () => {
      delete editorialContent.footerCopyright;
      const t = _footerCopyrightText(2031);
      if (t.indexOf('Farmboy Fine Arts Inc.') < 0) throw new Error('default lost the studio name: ' + t);
      if (t.indexOf('2031') < 0) throw new Error('default did not take the year: ' + t);
    });

    __check('a client can have their own wording, with {year} still live', () => {
      editorialContent.footerCopyright = '\\u00A9 {year} Acme Hotels. All rights reserved.';
      const t = _footerCopyrightText(2031);
      if (t !== '\\u00A9 2031 Acme Hotels. All rights reserved.') throw new Error('custom line wrong: ' + t);
      if (t.indexOf('Farmboy') >= 0) throw new Error('the studio name survived a replacement line');
      // Blank goes back to the default rather than printing nothing: an empty footer is
      // the hide toggle's job, not an empty string's.
      editorialContent.footerCopyright = '   ';
      if (_footerCopyrightText(2031).indexOf('Farmboy') < 0) throw new Error('blank did not fall back to the default');
      delete editorialContent.footerCopyright;
    });

    __check('a custom studio logo replaces the wordmark, and removing it restores it', () => {
      delete editorialContent.footerBrandLogo;
      if (_footerBrandLogo() !== null) throw new Error('a brand logo appeared from nowhere');
      editorialContent.footerBrandLogo = { dataUrl: 'data:image/png;base64,AAAA', aspect: 4 };
      const b = _footerBrandLogo();
      if (!b || b.aspect !== 4) throw new Error('custom logo not returned');
      // An entry with no image is not a logo — it would blank the footer silently.
      editorialContent.footerBrandLogo = { aspect: 4 };
      if (_footerBrandLogo() !== null) throw new Error('an imageless entry counted as a logo');
      editorialContent.footerBrandLogo = null;
      if (_footerBrandLogo() !== null) throw new Error('removing it did not restore the wordmark');
    });

    __check('the Project-tab block carries both logos, the wording and apply-to-deck', () => {
      const host = document.createElement('div'); document.body.appendChild(host);
      _dsPages = [{ kind: 'layout', type: 'moodboard', title: 'M', page: { id: 'p1', elements: [] } }];
      _dsIndex = 0;
      _dsDeckFooterInto(host);
      const txt = host.textContent || '';
      ['Studio logo', 'Client logo', 'Copyright line', 'Apply footer to whole deck'].forEach(w => {
        if (txt.indexOf(w) < 0) throw new Error('missing ' + w);
      });
      const inputs = host.querySelectorAll('input[type="text"]');
      if (!inputs.length) throw new Error('no copyright field');
      // PREFILLED with the line that will actually print, not hidden behind a
      // placeholder: editing it is normally 'keep the symbol, change the name'.
      if ((inputs[0].value || '').indexOf('Farmboy') < 0) throw new Error('field is not prefilled with the line that prints');
      if ((inputs[0].value || '').indexOf('©') < 0) throw new Error('the copyright symbol is not there to keep');
    });

    __check('retyping the studio line clears the override rather than freezing the year', () => {
      // A stored copy is frozen to the year it was typed; the default re-derives {year}
      // every time it prints. So matching the default exactly must store nothing.
      const host = document.createElement('div'); document.body.appendChild(host);
      _dsPages = [{ kind: 'layout', type: 'moodboard', title: 'M', page: { id: 'p1', elements: [] } }];
      _dsIndex = 0;
      editorialContent.footerCopyright = '© {year} Acme';
      _dsDeckFooterInto(host);
      const inp = host.querySelectorAll('input[type="text"]')[0];
      const yr = new Date().getFullYear();
      inp.value = FOOTER_COPYRIGHT_DEFAULT.split('{year}').join(yr);
      inp.onchange();
      if (editorialContent.footerCopyright !== '') throw new Error('the studio line was stored as a custom override: ' + editorialContent.footerCopyright);
      if (_footerCopyrightText(2099).indexOf('2099') < 0) throw new Error('the year stopped rolling over');
      delete editorialContent.footerCopyright;
    });

    __check('a reset appears only when a custom line is actually stored', () => {
      const build = () => { const h = document.createElement('div'); document.body.appendChild(h); _dsDeckFooterInto(h); return h; };
      _dsPages = [{ kind: 'layout', type: 'moodboard', title: 'M', page: { id: 'p1', elements: [] } }];
      _dsIndex = 0;
      delete editorialContent.footerCopyright;
      if ((build().textContent || '').indexOf('Reset to studio line') >= 0) throw new Error('reset offered with nothing to reset');
      editorialContent.footerCopyright = '© {year} Acme';
      if ((build().textContent || '').indexOf('Reset to studio line') < 0) throw new Error('no way back from a custom line');
      delete editorialContent.footerCopyright;
    });

    __check('the page NAME is the heading, not a second field below it', () => {
      const t = document.createElement('div'); document.body.appendChild(t);
      _dsPages = [{ kind: 'layout', type: 'moodboard', title: 'My Moodboard', page: { id: 'p1', type: 'moodboard', title: 'My Moodboard', elements: [] } }];
      _dsIndex = 0;
      _dsPageChromeControls(t, _dsPages[0]);
      if ((t.textContent || '').indexOf('Page name') >= 0) throw new Error('the duplicate Page name field is back');
    });

    __check('type defaults are one row per style', () => {
      const host = document.createElement('div'); document.body.appendChild(host);
      _dsTypeDefaultsInto(host);
      const sels = host.querySelectorAll('select');
      if (sels.length !== 5) throw new Error('expected 5 font pickers, found ' + sels.length);
      // Each style is ONE flex row holding its own label, so five styles are five rows
      // rather than ten. That is what took this column out of a scroll.
      const rows = Array.prototype.slice.call(host.children).filter(c => c.style && c.style.display === 'flex');
      if (rows.length !== 5) throw new Error('expected 5 rows, found ' + rows.length);
      rows.forEach(r => {
        if (!r.querySelector('select')) throw new Error('a type row has no font picker');
        if (!(r.textContent || '').trim()) throw new Error('a type row lost its label');
      });
    });

    __check('the Project column carries no standing paragraph of help text', () => {
      // Three blocks each ended in a 2-3 line note that said the same thing every time
      // you looked at it. In a 240px column that was most of the remaining scroll, so
      // the wording moved onto the section heading, where the pointer already is.
      const host = document.createElement('div'); document.body.appendChild(host);
      _dsPages = [{ kind: 'layout', type: 'moodboard', title: 'M', page: { id: 'p1', elements: [] } }];
      _dsIndex = 0;
      [[_dsTypeDefaultsInto, 'TYPE DEFAULTS'], [_dsDeckFooterInto, 'FOOTER & BRANDING']].forEach(pair => {
        const h = document.createElement('div'); document.body.appendChild(h);
        pair[0](h);
        if (h.querySelectorAll('p').length) throw new Error(pair[1] + ' still ends in a paragraph');
        const lab = Array.prototype.slice.call(h.querySelectorAll('div'))
            .filter(d => (d.textContent || '').trim() === pair[1])[0];
        if (!lab) throw new Error('no ' + pair[1] + ' heading');
        if (!(lab.title || '').trim()) throw new Error(pair[1] + ' lost its explanation entirely');
        if ((lab.style.cursor || '') !== 'help') throw new Error(pair[1] + ' gives no sign it carries a tooltip');
      });
    });

    __check('the preview-quality note is on the heading and the buttons', () => {
      const bar = document.createElement('div'); bar.id = 'dsPresetBar'; document.body.appendChild(bar);
      _dsRenderPresetBar();
      if (bar.querySelectorAll('p').length > 1) throw new Error('more than the presentation-type blurb survives as a paragraph');
      const txt = bar.textContent || '';
      if (txt.indexOf('always full quality') >= 0) throw new Error('the quality note is still taking up space');
      const withTip = Array.prototype.slice.call(bar.querySelectorAll('div, button'))
          .filter(e => (e.title || '').indexOf('always full quality') >= 0);
      if (withTip.length < 4) throw new Error('only ' + withTip.length + ' elements explain the setting; expected the heading plus three buttons');
    });

    __check('the presentation-type blurb STAYS, because it changes with the type', () => {
      // It is the one note here that is not the same sentence every time: it describes
      // whichever type is selected, so it earns its space.
      const bar = document.createElement('div'); bar.id = 'dsPresetBar'; document.body.appendChild(bar);
      _dsRenderPresetBar = _dsRenderPresetBar;
      editorialContent.presentationType = 'install';
      _dsRenderPresetBar();
      const a1 = (document.getElementById('dsPresetBar').textContent || '');
      editorialContent.presentationType = 'concept';
      _dsRenderPresetBar();
      const a2 = (document.getElementById('dsPresetBar').textContent || '');
      if (a1 === a2) throw new Error('the blurb does not change with the type, so it is standing help text too');
      delete editorialContent.presentationType;
    });

    __check('typing a copyright line stores it', () => {
      const host = document.createElement('div'); document.body.appendChild(host);
      _dsPages = [{ kind: 'layout', type: 'moodboard', title: 'M', page: { id: 'p1', elements: [] } }];
      _dsIndex = 0;
      delete editorialContent.footerCopyright;
      _dsDeckFooterInto(host);
      const inp = host.querySelectorAll('input[type="text"]')[0];
      inp.value = '\\u00A9 {year} Acme';
      inp.onchange();
      if (editorialContent.footerCopyright !== '\\u00A9 {year} Acme') throw new Error('not stored: ' + editorialContent.footerCopyright);
      delete editorialContent.footerCopyright;
    });

    __check('the per-page panel keeps the ink zones and the hide toggles', () => {
      const t = document.createElement('div'); document.body.appendChild(t);
      _dsPages = [{ kind: 'layout', type: 'moodboard', title: 'M', page: { id: 'p1', elements: [] } }];
      _dsIndex = 0;
      _dsPageChromeControls(t, _dsPages[0]);
      const txt = t.textContent || '';
      ['Logo & copyright', 'Code & location', 'Hide copyright line', 'Hide entire footer'].forEach(w => {
        if (txt.indexOf(w) < 0) throw new Error('per-page footer lost ' + w);
      });
      if (txt.indexOf('Apply footer to whole deck') >= 0) throw new Error('a deck-wide button is still here');
      if (txt.indexOf('Upload client logo') >= 0) throw new Error('the client-logo uploader is still here');
    });

    __check('the hide-logo label follows whichever logo the deck is using', () => {
      const build = () => { const t = document.createElement('div'); document.body.appendChild(t); _dsPageChromeControls(t, _dsPages[0]); return t.textContent || ''; };
      delete editorialContent.footerBrandLogo;
      if (build().indexOf('Hide Farmboy logo') < 0) throw new Error('default label is not the wordmark');
      editorialContent.footerBrandLogo = { dataUrl: 'data:image/png;base64,AAAA', aspect: 4 };
      const t2 = build();
      if (t2.indexOf('Hide Farmboy logo') >= 0) throw new Error('still says Farmboy after the mark was replaced');
      if (t2.indexOf('Hide logo') < 0) throw new Error('no hide-logo toggle at all');
      delete editorialContent.footerBrandLogo;
    });

    __check('the placement control is ONE row', () => {
      const t = document.createElement('div'); document.body.appendChild(t);
      _dsPages = [{ kind: 'layout', type: 'moodboard', title: 'M', page: { id: 'p1', elements: [] } }];
      _dsIndex = 0;
      editorialContent.layoutPages = [{ id: 'p1', type: 'moodboard', title: 'M', elements: [] }];
      _dsPlaceRelativeInto(t, _dsPages[0]);
      const rows = Array.prototype.slice.call(t.querySelectorAll('div')).filter(d => (d.style.display === 'flex'));
      if (!rows.length) throw new Error('no placement row rendered');
      const r = rows[0];
      // Label, select, number and the Move button all on the one line.
      if (!r.querySelector('select')) throw new Error('no before/after select in the row');
      if (!r.querySelector('input[type="number"]')) throw new Error('no page number in the row');
      if (!r.querySelector('button')) throw new Error('no Move button in the row');
      if ((r.textContent || '').indexOf('Place') < 0) throw new Error('the label did not move inline');
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
