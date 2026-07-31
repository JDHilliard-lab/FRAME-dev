// Scale Figure shade: a swatch strip with a live preview, not a dropdown.
//
// The request, verbatim: "For the figure shader, can we have a little image of the
// scale figure in the settings, and use the swatches black - white with the other
// grey options not colors. basically turn what we have in the dropdown menu into
// the same look of the other swatches in the label dimension style and image code
// style."
//
// What that forces:
//   • The SAME renderer as those two strips (_frameSwatchesInto), or the dots end
//     up a different size/shape and it reads as a different control.
//   • Greys only. The figure is a silhouette on a technical drawing; a coloured one
//     would read as an annotation.
//   • A live preview of the real character art under the real filter, so the panel
//     cannot show something the wall doesn't.
//   • The dropdown goes away rather than staying alongside — two controls for one
//     value is how they disagree.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
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
    const S = window.__appSrc, H = window.__htmlSrc;
    const __host = () => document.getElementById('personShadeSwatches');
    const __dots = () => Array.from(__host().querySelectorAll('button'));
    const __prev = () => document.getElementById('personShadePreview');
    // _frameSwatchesInto writes hex into one cssText string, and jsdom (like every
    // browser) normalises that to rgb() on the way back out. Comparing against the
    // hex would silently never match and every colour assertion below would pass
    // against nothing, so go through rgb.
    const __css = (el) => el.getAttribute('style') || '';
    const __rgbOf = (hex) => { const m = /^#(..)(..)(..)$/.exec(hex); return 'rgb(' + parseInt(m[1],16) + ', ' + parseInt(m[2],16) + ', ' + parseInt(m[3],16) + ')'; };
    const __dotShade = (el) => {
      const m = /rgba?\\(\\s*([\\d.]+)[\\s,]+([\\d.]+)[\\s,]+([\\d.]+)/.exec(el.style.backgroundColor || '');
      return m ? (+m[1] + +m[2] + +m[3]) / 3 / 255 : null;
    };
    const __ringed = () => __dots().filter(b => (b.style.borderColor || '') === __rgbOf('#6a6aff'));

    const __seed = () => {
      elevations = [{ name: 'Wall A', wallW: 185, wallH: 108, personPos: { x: -60 }, personShade: 0, frames: [] }];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      elevPersonShade = 0;
      _applyPersonShade();
    };

    // ── The control ──
    __check('EXACT REQUEST: the dropdown is gone, replaced by a swatch strip', () => {
      if (/id="personShade"/.test(H)) throw new Error('the <select id="personShade"> is still in index.html');
      if (/<option value="0.68">/.test(H)) throw new Error('the dropdown options are still there');
      __seed();
      if (!__host()) throw new Error('no #personShadeSwatches host in the Settings panel');
      if (!__dots().length) throw new Error('the swatch strip built no dots');
      // Nothing may still look the select up, or it is a silent no-op on every call.
      if (/getElementById\\('personShade'\\)/.test(S)) throw new Error('app.js still reads the removed select');
    });

    __check('EXACT REQUEST: it uses the SAME renderer as the dimension and image-code strips', () => {
      // A second dot-drawing function is how the three end up looking different.
      const i = S.indexOf('function _applyPersonShade');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (body.indexOf('_frameSwatchesInto') < 0) throw new Error('_applyPersonShade builds its own dots instead of using the shared renderer');
      // And it reaches it through the documented opts hook, not a copy of the family list.
      if (body.indexOf('FRAME_GREY_RAMP') < 0) throw new Error('the palette is not the named grey ramp');
    });

    __check('the dots are visually identical to the other strips — same renderer, same options', () => {
      __seed();
      _frameSwatchesInto(document.getElementById('annotColorSwatches'), '#000000', () => {});
      const ref = document.querySelector('#annotColorSwatches button');
      const mine = __dots()[0];
      if (!ref) throw new Error('the reference dimension-colour strip did not build');
      const size = (b) => (__css(b).match(/(width|height|border-radius):[^;]*/g) || []).join('|');
      if (!size(ref)) throw new Error('could not read the reference dot geometry, so this check proves nothing');
      if (size(ref) !== size(mine)) throw new Error('shade dot is ' + size(mine) + ' against ' + size(ref) + ' on the dimension strip');
    });

    __check('EXACT REQUEST: greys only — no colours reach the figure', () => {
      const hexes = [];
      FRAME_GREY_RAMP.forEach(f => f.colors.forEach(h => hexes.push(h)));
      if (hexes.length < 4) throw new Error('only ' + hexes.length + ' shades offered');
      hexes.forEach(h => {
        const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
        if (!m) throw new Error(h + ' is not a plain hex');
        if (m[1] !== m[2] || m[2] !== m[3]) throw new Error(h + ' is not a grey, so the figure could be tinted');
      });
      // Runs from black upward, and stops short of white: a white figure is invisible.
      if (hexes[0].toLowerCase() !== '#000000') throw new Error('the ramp does not start at black, it starts at ' + hexes[0]);
      if (hexes.some(h => h.toLowerCase() === '#ffffff')) throw new Error('pure white is offered, which hides the figure entirely');
      // Monotonic, so the strip reads left-to-right as light-to-lighter.
      for (let i = 1; i < hexes.length; i++) {
        if (!(_hexToShade(hexes[i]) > _hexToShade(hexes[i - 1]))) throw new Error('the ramp is not in order at ' + hexes[i]);
      }
    });

    // ── Picking a shade ──
    __check('clicking a dot sets the shade and paints the figure on the wall', () => {
      __seed();
      const dot = __dots()[3];
      const want = __dotShade(dot);
      if (want === null) throw new Error('could not read the dot colour, so this check proves nothing');
      dot.onclick();
      if (Math.abs(elevPersonShade - want) > 0.02) throw new Error('clicked a dot for shade ' + want + ' and got ' + elevPersonShade);
      const person = document.getElementById('person');
      if (!person) throw new Error('no #person image on the wall');
      if (person.style.filter.indexOf('invert(') < 0) throw new Error('the wall figure was not repainted: ' + person.style.filter);
      // Black is the one shade drawn with no filter at all.
      __dots()[0].onclick();
      if (elevPersonShade !== 0) throw new Error('the black dot gave shade ' + elevPersonShade);
      if (person.style.filter !== 'none') throw new Error('black should need no filter, got ' + person.style.filter);
    });

    __check('the shade still writes to EVERY elevation, not just the open one', () => {
      // Layout-guide styling is a global choice — this was fixed once already and
      // the swatch strip must not have reintroduced a per-wall write.
      elevations = [{ personShade: 0 }, { personShade: 0 }, { personShade: 0 }];
      currentElevIndex = 0;
      setPersonShade(0.5);
      if (!elevations.every(e => e.personShade === 0.5)) throw new Error('only some elevations took the shade: ' + JSON.stringify(elevations));
      __seed();
    });

    __check('the selected dot is ringed, including for an old dropdown value like 0.68', () => {
      __seed();
      elevPersonShade = __dotShade(__dots()[2]); _applyPersonShade();
      if (__ringed().length !== 1) throw new Error(__ringed().length + ' dots ringed at an exact ramp value');
      // A project saved by the dropdown build carries 0.3 / 0.68 / 0.82, none of
      // which is on the ramp. The ring has to land on the nearest dot rather than
      // nowhere, or the panel looks like nothing is selected.
      [0.3, 0.68, 0.82].forEach(v => {
        elevPersonShade = v; _applyPersonShade();
        if (__ringed().length !== 1) throw new Error('a stored shade of ' + v + ' ringed ' + __ringed().length + ' dots');
      });
      __seed();
    });

    __check('shade and hex convert both ways without drifting', () => {
      FRAME_GREY_RAMP.forEach(f => f.colors.forEach(h => {
        const back = _shadeToHex(_hexToShade(h));
        if (back.toLowerCase() !== h.toLowerCase()) throw new Error(h + ' round-tripped to ' + back);
      }));
    });

    // ── The preview ──
    __check('EXACT REQUEST: a little scale figure sits in the panel', () => {
      __seed();
      const p = __prev();
      if (!p) throw new Error('no #personShadePreview in the Settings panel');
      if (p.tagName !== 'IMG') throw new Error('the preview is a ' + p.tagName + ', not an image');
      if (p.getAttribute('src') !== 'Character_Lady_walk.svg') throw new Error('the preview is not the real character art: ' + p.getAttribute('src'));
    });

    __check('the preview cannot disagree with the wall — ONE filter expression', () => {
      __seed();
      [0, 0.3, 0.6].forEach(v => {
        elevPersonShade = v; _applyPersonShade();
        const wall = document.getElementById('person').style.filter;
        if (__prev().style.filter !== wall) throw new Error('at shade ' + v + ' the preview is "' + __prev().style.filter + '" and the wall is "' + wall + '"');
        if (__prev().style.filter !== _personShadeFilter(v)) throw new Error('neither matches the shared helper at shade ' + v);
      });
      __seed();
    });

    __check('the panel refreshes when Settings opens, not only after a click', () => {
      // The strip lives in a modal that may never have been opened, so a project
      // loaded with a grey figure has to show its dot the first time you look.
      const i = S.indexOf('function openPrecisionModal');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (body.indexOf('_applyPersonShade()') < 0) throw new Error('opening Settings does not rebuild the shade strip');
      // And it is seeded on boot too, so the wall figure is painted before any
      // modal has ever existed.
      if (S.indexOf('_applyPersonShade();   // figure shade') < 0) throw new Error('the shade is not applied during boot');
    });

    __check('_applyPersonShade survives being called with no panel in the DOM', () => {
      // It runs on project load and on every view switch, long before Settings
      // has been opened, and on pages where the modal markup is absent.
      const host = __host(), prev = __prev();
      const hp = host.parentNode, pp = prev.parentNode;
      hp.removeChild(host); pp.removeChild(prev);
      try { elevPersonShade = 0.4; _applyPersonShade(); }
      catch (e) { throw new Error('threw with the panel absent: ' + e.message); }
      finally { hp.appendChild(host); pp.appendChild(prev); }
      __seed();
    });

    // ── The shared renderer stayed shared ──
    __check('the palette hook did not change the default for the existing strips', () => {
      const host = document.createElement('div');
      _frameSwatchesInto(host, '#000000', () => {});
      const rows = host.querySelectorAll('div').length;
      if (rows !== FRAME_SWATCH_FAMILIES.length) throw new Error('the default palette now renders ' + rows + ' rows for ' + FRAME_SWATCH_FAMILIES.length + ' families');
      const accent = Array.from(host.querySelectorAll('button')).some(b => (b.style.backgroundColor || '') === __rgbOf('#e00000'));
      if (!accent) throw new Error('the Accents row is missing from the default palette');
    });
  `;

  try {
    window.eval(
      'window.__appSrc = ' + JSON.stringify(src) + ';\n' +
      'window.__htmlSrc = ' + JSON.stringify(htmlSrc) + ';\n' +
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
