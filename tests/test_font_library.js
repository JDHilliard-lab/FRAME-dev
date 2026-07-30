// Shared type + colour system: one font list (Druk / Sans / Messina + the
// Universal pack) and one set of colour swatch families behind every picker in
// Deck Studio AND the Elevations Settings modal, plus the new studio defaults
// (captions and image codes = Messina 9pt #9c9c9c, elevation dims = Messina).
const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:()=>({width:6}), fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'x';
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};
    scheduleAutosave=()=>{}; pushHistory=()=>{}; _dsRenderRail=()=>{}; _dsRenderCenter=()=>{}; _dsRenderTools=()=>{}; _dsSyncToolbar=()=>{};
    renderMoodboardCanvas = () => {}; drawElevAll = () => {}; _elevGuidesChanged = () => {};

    __check('library carries the brand pack and the six universal faces, brand first', () => {
      const toks = FRAME_FONT_LIBRARY.map(e => e.token);
      ['display','sans','serif','arial','helvetica','segoe','verdana','tahoma','courier'].forEach(t => {
        if (toks.indexOf(t) < 0) throw new Error('missing token: ' + t);
      });
      if (_fontLabel('display') !== 'Druk' || _fontLabel('serif') !== 'Messina' || _fontLabel('sans') !== 'Sans') throw new Error('brand labels wrong');
      if (_fontLabel('segoe') !== 'Segoe UI' || _fontLabel('courier') !== 'Courier New') throw new Error('universal labels wrong');
      const groups = FRAME_FONT_LIBRARY.map(e => e.group);
      // Brand entries must be contiguous and come first, so the picker reads
      // Brand-then-Universal without needing a sort.
      const lastBrand = groups.lastIndexOf('Brand'), firstUni = groups.indexOf('Universal');
      if (lastBrand < 0 || firstUni < 0 || lastBrand > firstUni) throw new Error('groups not ordered: ' + groups.join(','));
      if (groups.slice(0, lastBrand + 1).some(g => g !== 'Brand')) throw new Error('brand block not contiguous');
    });

    __check('_fontToken migrates the raw CSS stacks the Elevations panel used to store', () => {
      // These are the exact option values the old annotFontFamily/imgCodeFontFamily
      // selects wrote into localStorage.
      const legacy = {
        'Arial, Helvetica, sans-serif': 'arial',
        'Helvetica, Arial, sans-serif': 'helvetica',
        "'Segoe UI', Tahoma, sans-serif": 'segoe',
        'Verdana, Geneva, sans-serif': 'verdana',
        'Tahoma, Geneva, sans-serif': 'tahoma',
        "'Courier New', monospace": 'courier'
      };
      Object.keys(legacy).forEach(css => {
        const got = _fontToken(css);
        if (got !== legacy[css]) throw new Error(css + ' -> ' + got + ', wanted ' + legacy[css]);
      });
      // Tokens pass straight through; junk lands on the requested default.
      if (_fontToken('display') !== 'display') throw new Error('token not passed through');
      if (_fontToken('', 'sans') !== 'sans') throw new Error('empty did not use def');
      if (_fontToken('Comic Sans MS, cursive') !== 'serif') throw new Error('unknown did not fall back to Messina');
      // Brand faces named directly (e.g. a hand-edited project) still resolve.
      if (_fontToken("'Druk','Arial Narrow',sans-serif") !== 'display') throw new Error('Druk stack not matched');
      if (_fontToken('"Messina",Georgia,serif') !== 'serif') throw new Error('Messina stack not matched');
    });

    __check('_fontCss resolves every token, including the universal ones', () => {
      if (_fontCss('display').indexOf('Druk') < 0) throw new Error('display lost Druk');
      if (_fontCss('serif').indexOf('Messina') < 0) throw new Error('serif lost Messina');
      if (_fontCss('segoe').indexOf('Segoe UI') < 0) throw new Error('segoe wrong: ' + _fontCss('segoe'));
      if (_fontCss('courier').indexOf('Courier New') < 0) throw new Error('courier wrong: ' + _fontCss('courier'));
      if (_fontCss('verdana').indexOf('Verdana') < 0) throw new Error('verdana wrong');
    });

    __check('the three CSS resolvers all go through the library (universal tokens no longer collapse to Arial)', () => {
      ['segoe','verdana','tahoma','courier','helvetica'].forEach(t => {
        if (_mbFontCss(t) !== _fontCss(t)) throw new Error('_mbFontCss diverges on ' + t);
        if (_richFamCss(t) !== _fontCss(t)) throw new Error('_richFamCss diverges on ' + t);
        if (_dsAnnFam(t) !== _fontCss(t)) throw new Error('_dsAnnFam diverges on ' + t);
      });
      // Historical defaults preserved: rich/annotation text with no font set
      // still draws Arial, deck elements still draw Messina.
      if (_dsAnnFam(undefined) !== _fontCss('sans')) throw new Error('_dsAnnFam default changed');
      if (_richFamCss(undefined) !== _fontCss('sans')) throw new Error('_richFamCss default changed');
      if (_mbFontCss(undefined) !== _fontCss('serif')) throw new Error('_mbFontCss default changed');
    });

    __check('PDF resolution: brand faces embed, universal faces map to jsPDF cores', () => {
      _pdfFontFams = {};   // nothing embedded (fetch is stubbed out)
      if (_font('display') !== 'helvetica') throw new Error('display fallback wrong: ' + _font('display'));
      if (_font('serif') !== 'times') throw new Error('serif fallback wrong: ' + _font('serif'));
      if (_font('courier') !== 'courier') throw new Error('courier core wrong: ' + _font('courier'));
      ['arial','helvetica','segoe','verdana','tahoma','sans'].forEach(t => {
        if (_font(t) !== 'helvetica') throw new Error(t + ' should map to helvetica, got ' + _font(t));
      });
      _pdfFontFams = { Druk: true, Messina: true };
      if (_font('display') !== 'Druk') throw new Error('embedded Druk not used');
      if (_font('serif') !== 'Messina') throw new Error('embedded Messina not used');
      if (_font('courier') !== 'courier') throw new Error('courier hijacked by an embed');
      _pdfFontFams = {};
    });

    __check('_pdfFontStyle: only Druk forces bold (captions and codes draw at natural weight)', () => {
      if (_pdfFontStyle('display') !== 'bold') throw new Error('Druk should be bold');
      ['serif','sans','arial','helvetica','segoe','verdana','tahoma','courier'].forEach(t => {
        if (_pdfFontStyle(t) !== 'normal') throw new Error(t + ' should draw normal, got ' + _pdfFontStyle(t));
      });
    });

    __check('_pdfTitleStyle keeps titles bold in every face except Messina', () => {
      // Titles have no separate weight control, so a Sans title must stay bold
      // the way it always was — only Messina titles are set in regular.
      ['display','sans','arial','helvetica','segoe','verdana','tahoma','courier'].forEach(t => {
        if (_pdfTitleStyle(t) !== 'bold') throw new Error(t + ' title should be bold, got ' + _pdfTitleStyle(t));
      });
      if (_pdfTitleStyle('serif') !== 'normal') throw new Error('Messina title should be regular');
      // And the three title draw sites use the title rule, not the caption one.
      const S = window.__appSrc;
      if (S.indexOf('_pdfFontStyle(ts.font)') >= 0 || S.indexOf('_pdfFontStyle(_ts.font)') >= 0) throw new Error('a title site still uses the caption weight rule');
      if ((S.split('_pdfTitleStyle(').length - 1) < 4) throw new Error('expected the definition plus 3 title sites');
    });

    __check('_fillFontSelect builds Brand + Universal optgroups and selects the token', () => {
      const sel = _fillFontSelect(document.createElement('select'), 'tahoma');
      const groups = Array.from(sel.querySelectorAll('optgroup')).map(g => g.label);
      if (groups.join(',') !== 'Brand,Universal') throw new Error('optgroups: ' + groups.join(','));
      if (sel.querySelectorAll('option').length !== FRAME_FONT_LIBRARY.length) throw new Error('option count mismatch');
      if (sel.value !== 'tahoma') throw new Error('selection wrong: ' + sel.value);
      // A legacy CSS stack selects the migrated token rather than blanking out.
      if (_fillFontSelect(document.createElement('select'), "'Courier New', monospace").value !== 'courier') throw new Error('legacy value did not select');
      // Rebuilding is idempotent — no duplicated options.
      _fillFontSelect(sel, 'display'); _fillFontSelect(sel, 'display');
      if (sel.querySelectorAll('option').length !== FRAME_FONT_LIBRARY.length) throw new Error('rebuild duplicated options');
    });

    __check('Elevations Settings offers the identical font list to Deck Studio', () => {
      _initFontSelects();
      const opts = (id) => Array.from(document.getElementById(id).querySelectorAll('option')).map(o => o.value).join(',');
      const deck = opts('dsMbFont');
      if (!deck) throw new Error('deck picker empty — _initFontSelects did not fill it');
      ['mbFont','dsTextFont','annotFontFamily','imgCodeFontFamily'].forEach(id => {
        if (opts(id) !== deck) throw new Error(id + ' differs from dsMbFont: ' + opts(id));
      });
      // And it is the library, not a stale copy of the old six-font list.
      if (deck !== FRAME_FONT_LIBRARY.map(e => e.token).join(',')) throw new Error('list is not the library: ' + deck);
    });

    __check('studio defaults: captions / image codes are Messina 9pt #9c9c9c on both sides', () => {
      // Elevations tab.
      if (imageCodeStyle.fontToken !== 'serif') throw new Error('elev image code font: ' + imageCodeStyle.fontToken);
      if (imageCodeStyle.size !== 9) throw new Error('elev image code size: ' + imageCodeStyle.size);
      if (imageCodeStyle.color !== '#9c9c9c') throw new Error('elev image code color: ' + imageCodeStyle.color);
      if (imageCodeStyle.font.indexOf('Messina') < 0) throw new Error('elev image code stack not Messina: ' + imageCodeStyle.font);
      // Deck Studio's "Captions / image code" style.
      editorialContent.specCodeStyle = null;
      const cs = _specCodeStyle();
      if (cs.font !== 'serif' || cs.size !== 9 || cs.color !== '#9c9c9c') throw new Error('deck caption style: ' + JSON.stringify(cs));
    });

    __check('studio default: elevation dims are Messina, size and colour left alone', () => {
      localStorage.removeItem('annotationStyle');
      annotationStyle = { color: '#e00000', weight: 2, dash: true, fontSize: 13, font: 'serif', fontFamily: null, fontWeight: 600 };
      loadAnnotationStyle();
      if (annotationStyle.font !== 'serif') throw new Error('dim font: ' + annotationStyle.font);
      if (annotationStyle.fontFamily.indexOf('Messina') < 0) throw new Error('dim stack not Messina: ' + annotationStyle.fontFamily);
      // Size and colour keep their existing defaults — those stay the user's call.
      if (annotationStyle.fontSize !== 13 || annotationStyle.color !== '#e00000') throw new Error('size/colour defaults moved');
      if (document.documentElement.style.getPropertyValue('--dim-font-family').indexOf('Messina') < 0) throw new Error('--dim-font-family not pushed');
    });

    __check('a saved style still on the old Arial default adopts Messina; a real choice is preserved', () => {
      // Never-customised: exactly the pre-library default, no token.
      localStorage.setItem('annotationStyle', JSON.stringify({ color:'#e00000', weight:2, dash:true, fontSize:13, fontFamily:'Arial, Helvetica, sans-serif', fontWeight:600 }));
      annotationStyle = { color: '#e00000', weight: 2, dash: true, fontSize: 13, font: 'serif', fontFamily: null, fontWeight: 600 };
      loadAnnotationStyle();
      if (annotationStyle.font !== 'serif') throw new Error('untouched Arial did not migrate to Messina: ' + annotationStyle.font);
      // Deliberately chosen font (and a custom size) must survive untouched.
      localStorage.setItem('annotationStyle', JSON.stringify({ color:'#123456', weight:3, dash:false, fontSize:18, fontFamily:'Verdana, Geneva, sans-serif', fontWeight:700 }));
      annotationStyle = { color: '#e00000', weight: 2, dash: true, fontSize: 13, font: null, fontFamily: null, fontWeight: 600 };
      loadAnnotationStyle();
      if (annotationStyle.font !== 'verdana') throw new Error('chosen Verdana lost: ' + annotationStyle.font);
      if (annotationStyle.fontSize !== 18 || annotationStyle.color !== '#123456') throw new Error('other saved fields lost');
      localStorage.removeItem('annotationStyle');
    });

    __check('a saved image-code style still on the old defaults adopts Messina 9pt grey', () => {
      localStorage.setItem('frameImageCodeStyle', JSON.stringify({ color:'#222222', size:10, font:'Arial, Helvetica, sans-serif', weight:400 }));
      imageCodeStyle = { color:'#9c9c9c', size:9, fontToken:'serif', font:null, weight:400 };
      loadImageCodeStyle();
      if (imageCodeStyle.color !== '#9c9c9c' || imageCodeStyle.size !== 9 || imageCodeStyle.fontToken !== 'serif') throw new Error('legacy defaults not replaced: ' + JSON.stringify(imageCodeStyle));
      // A real customisation survives.
      localStorage.setItem('frameImageCodeStyle', JSON.stringify({ color:'#333333', size:14, font:'Tahoma, Geneva, sans-serif', weight:600 }));
      imageCodeStyle = { color:'#9c9c9c', size:9, fontToken:null, font:null, weight:400 };
      loadImageCodeStyle();
      if (imageCodeStyle.fontToken !== 'tahoma' || imageCodeStyle.size !== 14 || imageCodeStyle.color !== '#333333') throw new Error('custom style lost: ' + JSON.stringify(imageCodeStyle));
      localStorage.removeItem('frameImageCodeStyle');
      imageCodeStyle = { color:'#9c9c9c', size:9, fontToken:'serif', font:null, weight:400 };
      loadImageCodeStyle();
    });

    __check('Deck Studio colour swatch families reach the Elevations Settings modal', () => {
      seedAnnotationStyleInputs();
      _syncImageCodeStyleControls();
      const all = _frameSwatchList();
      if (all.length < 8) throw new Error('swatch list too small');
      ['annotColorSwatches','imgCodeColorSwatches'].forEach(id => {
        const host = document.getElementById(id);
        if (!host) throw new Error(id + ' missing from the Settings modal');
        const dots = Array.from(host.querySelectorAll('button'));
        if (dots.length !== all.length) throw new Error(id + ' has ' + dots.length + ' dots, wanted ' + all.length);
        if (host.children.length !== FRAME_SWATCH_FAMILIES.length) throw new Error(id + ' is not grouped by family');
      });
    });

    __check('clicking a swatch sets the dimension colour and the image-code colour', () => {
      seedAnnotationStyleInputs();
      const dot = document.getElementById('annotColorSwatches').querySelector('button');
      const hex = FRAME_SWATCH_FAMILIES[0].colors[0];
      dot.onclick();
      if (annotationStyle.color !== hex) throw new Error('dim colour not applied: ' + annotationStyle.color);
      if (document.getElementById('annotColor').value !== hex) throw new Error('colour input not synced');
      _syncImageCodeStyleControls();
      const dot2 = document.getElementById('imgCodeColorSwatches').querySelectorAll('button')[3];
      const hex2 = FRAME_SWATCH_FAMILIES[0].colors[3];
      dot2.onclick();
      if (imageCodeStyle.color !== hex2) throw new Error('image-code colour not applied: ' + imageCodeStyle.color);
      // Restore.
      annotationStyle.color = '#e00000'; imageCodeStyle.color = '#9c9c9c';
    });

    __check('picking a font in Elevations Settings stores the token and resolves the stack', () => {
      seedAnnotationStyleInputs();
      const ff = document.getElementById('annotFontFamily');
      ff.value = 'segoe';
      applyAnnotationStyleFromModal();
      if (annotationStyle.font !== 'segoe') throw new Error('token not stored: ' + annotationStyle.font);
      if (annotationStyle.fontFamily.indexOf('Segoe UI') < 0) throw new Error('stack not resolved: ' + annotationStyle.fontFamily);
      if (document.documentElement.style.getPropertyValue('--dim-font-family').indexOf('Segoe UI') < 0) throw new Error('CSS var not updated');
      const icf = document.getElementById('imgCodeFontFamily');
      _syncImageCodeStyleControls();
      icf.value = 'display';
      applyImageCodeStyleFromModal();
      if (imageCodeStyle.fontToken !== 'display' || imageCodeStyle.font.indexOf('Druk') < 0) throw new Error('image-code font not applied: ' + JSON.stringify(imageCodeStyle));
      // Restore studio defaults.
      annotationStyle.font = 'serif'; _normalizeAnnotationStyle(); applyAnnotationStyleToCSSVars();
      imageCodeStyle.fontToken = 'serif'; _normalizeImageCodeStyle();
    });

    __check('group-dim labels honour a per-dim token, then the deck-wide one, then a legacy stack', () => {
      const S = window.__appSrc;
      if (S.indexOf("const fam = st.font ? _fontCss(st.font, 'serif') : (st.fontFamily || annotationStyle.fontFamily)") < 0) throw new Error('group-dim label does not resolve through the library');
      // The old unconditional Arial tail is gone — the deck-wide style is
      // always resolvable now, so there is nothing left to fall back to.
      if (S.indexOf("annotationStyle.fontFamily || 'Arial, Helvetica, sans-serif'") >= 0) throw new Error('stale Arial fallback still present');
    });

    __check('no picker keeps its own hardcoded font list any more', () => {
      const S = window.__appSrc;
      [ "['display', 'Druk'], ['serif', 'Messina']",
        "['serif', 'Messina'], ['sans', 'Druk']",
        "['serif', 'Messina (serif)'], ['sans', 'Druk (sans)']",
        "['sans', 'Helvetica'], ['serif', 'Messina'], ['display', 'Druk']",
        "'Druk (display)'"
      ].forEach(pat => { if (S.indexOf(pat) >= 0) throw new Error('stale font list still present: ' + pat); });
      if (/Arial, Helvetica, sans-serif<\\/option>/.test(fs_indexHtml)) throw new Error('index.html still hardcodes font options');
    });

    __check('mockup image code: DOM preview reads the same style object as the PDF', () => {
      const S = window.__appSrc;
      // Preview used to hardcode Druk #444 while the PDF printed _specCodeStyle().
      if (S.indexOf("color:#444; pointer-events:none; font-family:' + _dsAnnFam('display')") >= 0) throw new Error('DOM preview still hardcodes Druk #444');
      if (S.indexOf("Same style object and same 10pt cap the PDF applies") < 0) throw new Error('DOM/PDF agreement comment+code missing');
    });

    __check('caption font resolves through the library on both the DOM and the PDF path', () => {
      const S = window.__appSrc;
      if (S.indexOf(\`(a.capFont === 'sans') ? '"Druk"\`) >= 0) throw new Error('DOM caption still hardcodes the two-font map');
      if (S.indexOf("_font(_fontToken(a.capFont, 'serif'))") < 0) throw new Error('PDF caption not library-resolved');
      if (S.indexOf("const fam = _fontCss(a.capFont, 'serif')") < 0) throw new Error('DOM caption not library-resolved');
    });
  `;
  const idx = fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
  try { window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\nvar fs_indexHtml = ' + JSON.stringify(idx) + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
