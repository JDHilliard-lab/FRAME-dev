// "Some of the automated pages - Process & Timeline, Frame Recommendations,
//  floorplan, spec pages, thank you - all the titles look different in the
//  preview, which I think will confuse many designers. I need them to look like
//  the templates I built, where the titles are aligned to the grid guides."
//
// They were: nine renderers, nine different title geometries, none of them on
// the cyan title-alignment guides (`hlines` on the Farmboy guide sets) that the
// layout templates are drawn against. The spec templates were the sharpest
// version of it - they ALREADY said title.y .15 / spec.y .2, which is exactly
// the 0.145 / 0.205 the guides sit at, and the affine remap in
// _drawSpecPageTemplate then dragged the title up onto the top margin.
//
// These checks pin the band itself, its fallbacks, and every renderer landing
// on it.
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
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  // ── Source-level checks run in NODE: they are questions about the FILE, and
  //    inside window.eval there is no fs, no path and no src. Slice between
  //    landmarks, never a character distance.
  const nodeResults = [];
  const check = (label, fn) => {
    try { fn(); nodeResults.push({ label, ok: true }); }
    catch (e) { nodeResults.push({ label, ok: false, err: e.message }); }
  };
  const fnBody = (name) => {
    let i = src.indexOf('\nfunction ' + name + '(');
    if (i < 0) i = src.indexOf('\nasync function ' + name + '(');
    if (i < 0) throw new Error('no such function: ' + name);
    let j = src.length;
    ['\nfunction ', '\nasync function ', '\nconst ', '\nlet '].forEach(c => {
      const k = src.indexOf(c, i + 1); if (k >= 0 && k < j) j = k;
    });
    if (j - i < 40) throw new Error('empty slice for ' + name);
    return src.slice(i, j);
  };
  // Our own comments quote the very offsets we removed, which is exactly what
  // these checks search for. Strip comment lines first.
  const codeOnly = (s) => s.split('\n').filter(l => l.trim().indexOf('//') !== 0).join('\n');

  check('no automated renderer still invents its own title offset', () => {
    const OLD = [
      ['_drawFloorplanKeyPage', 'M, M + 14'],
      ['_drawFrameRecPage', 'M, M + 14'],
      ['_drawTimelinePageDots', 'M, M + 14'],
      ['_drawProsePage', 'M, M + 14'],
      ['_drawStrategyPage', 'M, M + 14'],
      ['_drawTOCPage', 'M, M + 24'],
      ['_drawArtIndexPage', 'M, M + 24'],
      ['_drawThankYouPage', 'M, M + 18'],
      ['_drawPlaceholderPage', 'M + 24, M + 44']
    ];
    OLD.forEach((p) => {
      if (codeOnly(fnBody(p[0])).indexOf(p[1]) >= 0) throw new Error(p[0] + ' still draws its title at ' + p[1]);
    });
  });

  check('every automated renderer goes through the one title drawer', () => {
    ['_drawFloorplanKeyPage', '_drawFrameRecPage', '_drawTimelinePagePills', '_drawTimelinePageDots',
     '_drawProsePage', '_drawStrategyPage', '_drawTOCPage', '_drawArtIndexPage', '_drawThankYouPage',
     '_drawPlaceholderPage', '_drawFlatGraphicSpecPage', '_drawSpecSetPageBody',
     '_drawInstallGuidePage', '_drawClassicSpecPage'].forEach(fn => {
      if (codeOnly(fnBody(fn)).indexOf('_drawPageTitle(') < 0) throw new Error(fn + ' does not call _drawPageTitle');
    });
  });

  check('the template remap anchors its vertical map on the title line', () => {
    const b = codeOnly(fnBody('_drawSpecPageTemplate'));
    if (b.indexOf('ky = (1 - SF.t - SF.b) / (D.B - D.T);') >= 0) throw new Error('the vertical map still starts at the top margin, which is what pulled the title off its guide');
    if (b.indexOf('_TB.head / PH') < 0) throw new Error('the map never reaches for the title line');
    if (b.indexOf('oxf = SF.l - D.L * kx;') < 0) throw new Error('the HORIZONTAL map was changed too; only the vertical one was wrong');
  });

  check('no page floors the title size against the Type defaults dial', () => {
    // Math.max(ts.size, 22) on the install sheet and Math.max(_ts.size, 20) on the
    // classic one meant turning the deck title DOWN moved every page except those
    // two, which is the same class of bug as nine different title offsets.
    ['_drawInstallGuidePage', '_drawClassicSpecPage', '_drawFlatGraphicSpecPage'].forEach(fn => {
      const b = codeOnly(fnBody(fn));
      if (b.indexOf('Math.max(ts.size') >= 0 || b.indexOf('Math.max(_ts.size') >= 0) throw new Error(fn + ' still floors the title size');
    });
  });

  check('the floorplan rect is not handed a margin by anyone', () => {
    // It is shared by the page renderer and the studio's interactive overlay so
    // that a pin lands where it prints. Taking the margin as an ARGUMENT put that
    // contract in two hands, and the moment the renderer started passing the guide
    // margin the overlay was still passing a literal 40 - every pin placed against
    // one rect and drawn on another.
    ['_fpPlanRect(936, 540, 40)', '_fpPlanFit(936, 540, 40,', '_fpPlanRect(PW, PH, M)', '_fpPlanFit(PW, PH, M,'].forEach(bad => {
      if (src.indexOf(bad) >= 0) throw new Error('a call site still passes a margin: ' + bad);
    });
    if (codeOnly(fnBody('_fpPlanRect')).indexOf('_titleBand(PW, PH).x') < 0) throw new Error('the plan rect does not resolve its own margin');
  });

  check('the subheading asks the font library for its face, never a literal', () => {
    // Both lines have to come off ONE token, or Druk-everywhere is true on the
    // pages that happen to have been written that way and nowhere else.
    const b = codeOnly(fnBody('_drawPageTitle'));
    if (b.indexOf("_font('sans')") >= 0 || b.indexOf("'helvetica'") >= 0) throw new Error('the drawer still writes a face in');
    if (b.indexOf('_font(ss.font)') < 0) throw new Error('the subheading does not resolve its face through the style resolver');
    if (codeOnly(fnBody('_subtitleStyle')).indexOf('PAGE_SUBTITLE_FONT') < 0) throw new Error('the deck subheading no longer defaults to the one token');
    if (src.indexOf("const PAGE_SUBTITLE_FONT = 'display';") < 0) throw new Error('the subheading token is not display');
    if (src.indexOf('const TITLE_SIZE_DEFAULT = 32;') < 0) throw new Error('the heading default is not 32pt');
    if (src.indexOf('const PAGE_SUBTITLE_SIZE = 22;') < 0) throw new Error('the subheading is not 22pt');
    // Declared ABOVE the boot line, or _editorialDefaults() reads them in the TDZ
    // and the whole file dies on load.
    if (src.indexOf('const TITLE_SIZE_DEFAULT = 32;') > src.indexOf('let editorialContent = _editorialDefaults();')) throw new Error('the title size is declared after the boot line that reads it');
  });

  check('switching guide sets drops the built pages', () => {
    const b = codeOnly(fnBody('_setDeckGuide'));
    if (b.indexOf('_dsClearBuiltAll') < 0) throw new Error('a guide-set switch re-typesets the deck but nothing drops the stale previews');
    if (b.indexOf('g.setId !== wasSet') < 0) throw new Error('the rebuild is not gated on the SET changing, so ticking Show guides rebuilds the whole deck');
  });

  const testBlock = [
    'window.__testResults = [];',
    'const __check = (label, fn) => {',
    '  try { fn(); window.__testResults.push({ label, ok: true }); }',
    '  catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); }',
    '};',
    'window.__asyncChecks = [];',
    'let __chain = Promise.resolve();',
    'const __checkAsync = (label, fn) => {',
    '  __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true }))',
    '    .catch(e => ({ label, ok: false, err: e.message })));',
    '  window.__asyncChecks.push(__chain);',
    '};',
    '',
    'scheduleAutosave = () => {}; pushHistory = () => {};',
    '_dsRenderRail = () => {}; _dsRenderCenter = () => {}; _dsRenderTools = () => {};',
    '_dsClearBuiltAll = () => {}; _dsRefresh = () => {};',
    '',
    'const PW = 936, PH = 540;',
    'const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.01 : tol);',
    'const reset = () => {',
    '  editorialContent = _editorialDefaults();',
    '  editorialContent.guidePref = { setId: "g_idml12", show: false, snap: true };',
    '  dashProjectData = [];',
    '  elevations = [];',
    '  floorplanLevels = [{ name: "Level 1", imageData: "" }];',
    '};',
    '// A page heading: a text op set at or above the title size.',
    'const headings = (rec) => (rec.ops || []).filter(o => o && o.t === "text" && o.st && o.st.sz >= 16);',
    'const textLike = (rec, s) => (rec.ops || []).filter(o => o && o.t === "text")',
    '  .find(o => ("" + (Array.isArray(o.str) ? o.str.join(" ") : o.str)).indexOf(s) >= 0);',
    '',
    '__check("EXACT ASK: the heading sits on the first title guide and the subheading on the second", () => {',
    '  reset();',
    '  const set = _guideSetById("g_idml12");',
    '  if (!set || !set.hlines || set.hlines.length < 2) throw new Error("the Farmboy 12-column set lost its title guides");',
    '  const B = _titleBand(PW, PH);',
    '  if (!B.fromGuides) throw new Error("the band did not come from the guide set");',
    '  if (!near(B.head, set.hlines[0] * PH)) throw new Error("heading at " + B.head + ", first guide is at " + (set.hlines[0] * PH));',
    '  if (!near(B.sub, set.hlines[1] * PH)) throw new Error("subheading at " + B.sub + ", second guide is at " + (set.hlines[1] * PH));',
    '  if (!near(B.x, set.margin.l * PW)) throw new Error("the heading is not on the left margin guide: " + B.x);',
    '});',
    '',
    '__check("EXACT ASK: headings are Druk 32pt and subheadings Druk 22pt", () => {',
    '  reset();',
    '  const ts = _titleStyle();',
    '  if (ts.size !== 32) throw new Error("heading size is " + ts.size);',
    '  if (ts.font !== "display") throw new Error("heading face is " + ts.font + ", display IS Druk");',
    '  if (PAGE_SUBTITLE_SIZE !== 22) throw new Error("subheading size is " + PAGE_SUBTITLE_SIZE);',
    '  if (PAGE_SUBTITLE_FONT !== "display") throw new Error("subheading face is " + PAGE_SUBTITLE_FONT);',
    '  // and that is what actually reaches the page, in the PDF font name, not just the token',
    '  const rec = new CanvasPdfRec(PW, PH);',
    '  _drawPageTitle(rec, PW, PH, "A HEADING", "A SUBHEADING");',
    '  const h = textLike(rec, "A HEADING"), s2 = textLike(rec, "A SUBHEADING");',
    '  if (!h || h.st.sz !== 32) throw new Error("heading drawn at " + (h && h.st.sz));',
    '  if (!s2 || s2.st.sz !== 22) throw new Error("subheading drawn at " + (s2 && s2.st.sz));',
    '  const family = (css) => ("" + css).split("px ")[1] || "";',
    '  if (family(h.st.font) !== family(s2.st.font)) throw new Error("heading and subheading are set in different faces: " + h.st.font + " / " + s2.st.font);',
    '  if (_fontCss("display").indexOf("Druk") < 0) throw new Error("the display token is no longer Druk: " + _fontCss("display"));',
    '});',
    '',
    '__check("a deck saved at the old 22pt is migrated ONCE", () => {',
    '  // titleStyle is written into every project by _editorialDefaults(), so changing',
    '  // the default alone reaches new decks and nothing else.',
    '  reset();',
    '  editorialContent.titleStyle = { font: "display", size: 22, color: "#141414" };',
    '  delete editorialContent.typeDefaultsV;',
    '  _mbMigratePages();',
    '  if (_titleStyle().size !== 32) throw new Error("an existing deck kept the old 22pt: " + _titleStyle().size);',
    '  // and a deliberate 22 STICKS, rather than being bumped on every load',
    '  editorialContent.titleStyle.size = 22;',
    '  _mbMigratePages();',
    '  if (_titleStyle().size !== 22) throw new Error("a hand-set 22pt was overwritten again: " + _titleStyle().size);',
    '});',
    '',
    '__check("a long subheading shrinks rather than running past the right guide", () => {',
    '  // A level name is user text with no length limit, and at 22pt it can overrun.',
    '  reset();',
    '  const B = _titleBand(PW, PH);',
    '  const rec = new CanvasPdfRec(PW, PH);',
    '  const LONG = "PROPOSED FLOOR PLAN \u2014 GUESTROOM TYPE B CORNER KING SUITE, NORTH TOWER, LEVELS 4 THROUGH 11";',
    '  // jsdom measures every glyph at 6px whatever the size, so a 96-character line',
    '  // "fits" 892pt and the shrink never runs. Measure like a real face.',
    '  rec.getTextWidth = function (t) { return ("" + t).length * this._sz * 0.5; };',
    '  _drawPageTitle(rec, PW, PH, "FLOORPLAN", LONG);',
    '  const s2 = textLike(rec, "PROPOSED FLOOR PLAN");',
    '  if (!s2) throw new Error("the subheading vanished");',
    '  if (s2.st.sz >= PAGE_SUBTITLE_SIZE) throw new Error("it never shrank: " + s2.st.sz);',
    '  rec.setFontSize(s2.st.sz);',
    '  if (s2.x + rec.getTextWidth(LONG) > B.right + 1) throw new Error("it still runs past the right guide");',
    '  // and a subheading that DOES fit is left at full size',
    '  const rec2 = new CanvasPdfRec(PW, PH);',
    '  rec2.getTextWidth = function (t) { return ("" + t).length * this._sz * 0.5; };',
    '  _drawPageTitle(rec2, PW, PH, "FLOORPLAN", "LEVEL 1");',
    '  const ok = textLike(rec2, "LEVEL 1");',
    '  if (!ok || ok.st.sz !== PAGE_SUBTITLE_SIZE) throw new Error("a short subheading was shrunk anyway: " + (ok && ok.st.sz));',
    '});',
    '',
    '__check("content under a subheading clears its descenders", () => {',
    '  // Content under a subheading starts from its BASELINE, so the gap has to pay',
    '  // for the descenders AND for the cap height of the row that sits there. At',
    '  // 10pt the old flat 8pt gap covered both and nobody noticed; at 22pt the',
    '  // flat-graphic sheet’s first spec row landed inside the descenders.',
    '  reset();',
    '  // The tightest row in the deck: the flat sheet draws its spec column straight',
    '  // onto B.body + _subtitleClear() at about 8.5pt.',
    '  const TIGHTEST_ROW_PT = 8.5;',
    '  const need = PAGE_SUBTITLE_SIZE * 0.22 + TIGHTEST_ROW_PT * 0.72;',
    '  if (_subtitleClear() < need) throw new Error("a " + PAGE_SUBTITLE_SIZE + "pt subheading needs " + need.toFixed(1) + "pt of clearance, the gap is " + _subtitleClear());',
    '  // and it is DERIVED, so changing the subheading size moves it',
    '  // and it FOLLOWS the size in force, not the default it was built from',
    '  editorialContent.subtitleStyle = { size: 40 };',
    '  const big = _subtitleClear();',
    '  delete editorialContent.subtitleStyle;',
    '  if (big <= _subtitleClear()) throw new Error("a 40pt subheading got the same gap as a 22pt one: " + big);',
    '  // Live, on a page that prints one.',
    '  const B = _titleBand(PW, PH);',
    '  const rec = new CanvasPdfRec(PW, PH);',
    '  _drawFrameRecPage(rec, {}, 1, {}, { header: "", frames: [] });',
    '  const note = (rec.ops || []).filter(o => o && o.t === "text").find(o => ("" + o.str).indexOf("No frames specified") >= 0);',
    '  if (!note) throw new Error("the empty note is gone");',
    '  const subDescender = B.sub + PAGE_SUBTITLE_SIZE * 0.22;',
    '  const noteCapTop = note.y - note.st.sz * 0.72;',
    '  if (noteCapTop <= subDescender) throw new Error("the first row overlaps the subheading: cap top " + noteCapTop.toFixed(1) + " vs descender " + subDescender.toFixed(1));',
    '});',
    '',
    '__check("EXACT ASK: the heading and subheading are click targets on the preview", () => {',
    '  reset();',
    '  const desc = { kind: "card", type: "frameRec", title: "Frame Recommendations" };',
    '  const key = _deckPageKey(desc);',
    '  // The drawer records what it drew, so render the page first.',
    '  _curPageKey = key;',
    '  _drawPageTitle(new CanvasPdfRec(PW, PH), PW, PH, "FRAME RECOMMENDATIONS", "Frames specified");',
    '  const page = document.createElement("div"); document.body.appendChild(page);',
    '  _dsTitleHandles(page, desc, 936, 540);',
    '  const hs = page.querySelectorAll("[data-title-handle]");',
    '  if (hs.length !== 2) throw new Error("expected a heading and a subheading handle, got " + hs.length);',
    '  const B = _titleBand(PW, PH);',
    '  const h = Array.prototype.find.call(hs, (n) => n.dataset.titleHandle === "title");',
    '  const top = parseFloat(h.style.top), ht = parseFloat(h.style.height);',
    '  if (!(top < B.head && top + ht > B.head)) throw new Error("the handle does not cover its own baseline: " + top + "+" + ht + " vs " + B.head);',
    '  if (Math.abs(parseFloat(h.style.left) - B.x) > 0.5) throw new Error("the handle is not on the left guide: " + h.style.left);',
    '  page.remove();',
    '});',
    '',
    '__check("a page that prints no heading gets no handle", () => {',
    '  // Recorded, never predicted: a fixed page renders as an element page when it',
    '  // has elements and as prose when it does not, so the answer is about content.',
    '  reset();',
    '  const desc = { kind: "fixed", fixed: "slogan", title: "Good Art Good People" };',
    '  const page = document.createElement("div"); document.body.appendChild(page);',
    '  _dsTitleHandles(page, desc, 936, 540);',
    '  if (page.querySelectorAll("[data-title-handle]").length) throw new Error("a page that draws no title still offered one");',
    '  page.remove();',
    '});',
    '',
    '__check("whole deck is the default scope, and it moves every page", () => {',
    '  reset();',
    '  if (_dsTitleTypeScope !== "deck") throw new Error("the popup does not default to the house style: " + _dsTitleTypeScope);',
    '  _setPageTypeStyle("card:frameRec", "title", "size", 44, "deck");',
    '  if (_titleStyle().size !== 44) throw new Error("a deck change did not reach the deck value");',
    '  if (_titleStyleFor("card:contacts").size !== 44) throw new Error("a deck change did not reach another page");',
    '  if (_pageTypeHasOv("card:frameRec")) throw new Error("a deck change wrote a per-page exception");',
    '});',
    '',
    '__check("just this page changes ONE page and leaves the rest on the deck", () => {',
    '  reset();',
    '  _setPageTypeStyle("card:frameRec", "title", "size", 18, "page");',
    '  if (_titleStyleFor("card:frameRec").size !== 18) throw new Error("the override did not take");',
    '  if (_titleStyleFor("card:contacts").size !== 32) throw new Error("the override leaked onto another page");',
    '  if (_titleStyle().size !== 32) throw new Error("the override rewrote the deck value");',
    '  // only the field set is stored, so the page still follows the deck typeface',
    '  _setPageTypeStyle(null, "title", "font", "serif", "deck");',
    '  if (_titleStyleFor("card:frameRec").font !== "serif") throw new Error("an overridden SIZE also froze the typeface");',
    '  if (_titleStyleFor("card:frameRec").size !== 18) throw new Error("the deck change overwrote the page size");',
    '});',
    '',
    '__check("the override is reversible and leaves nothing behind", () => {',
    '  reset();',
    '  _setPageTypeStyle("card:frameRec", "sub", "size", 14, "page");',
    '  if (!_pageTypeHasOv("card:frameRec")) throw new Error("nothing was recorded");',
    '  _clearPageTypeStyle("card:frameRec", "sub");',
    '  if (_pageTypeHasOv("card:frameRec")) throw new Error("the exception survived the reset");',
    '  if (_subtitleStyleFor("card:frameRec").size !== PAGE_SUBTITLE_SIZE) throw new Error("it did not go back to the deck value");',
    '  // and the empty shells are pruned, not left in every autosave and undo snapshot',
    '  if (editorialContent.pageTitleStyle) throw new Error("an empty override map was left behind");',
    '});',
    '',
    '__check("the deck value is what Type defaults shows, never one page’s exception", () => {',
    '  reset();',
    '  _setPageTypeStyle("card:frameRec", "title", "size", 12, "page");',
    '  _curPageKey = "card:frameRec";',
    '  try {',
    '    if (_titleStyle().size !== 32) throw new Error("the Type defaults reader folded in the current page: " + _titleStyle().size);',
    '    if (_titleStyleFor().size !== 12) throw new Error("the renderer did NOT pick up the current page: " + _titleStyleFor().size);',
    '  } finally { _curPageKey = null; }',
    '});',
    '',
    '__check("an overridden page actually renders at its own size", () => {',
    '  reset();',
    '  _setPageTypeStyle("card:frameRec", "title", "size", 15, "page");',
    '  _curPageKey = "card:frameRec";',
    '  try {',
    '    const rec = new CanvasPdfRec(PW, PH);',
    '    _drawFrameRecPage(rec, {}, 1, {}, { header: "", frames: [] });',
    '    const h = (rec.ops || []).filter(o => o && o.t === "text").find(o => ("" + o.str).indexOf("FRAME RECOMM") >= 0);',
    '    if (!h) throw new Error("the heading was never drawn");',
    '    if (h.st.sz !== 15) throw new Error("the page override never reached the renderer: " + h.st.sz);',
    '  } finally { _curPageKey = null; }',
    '});',
    '',
    '__check("EXACT ASK: the popup opens left-aligned UNDER the line, never over it", () => {',
    '  reset();',
    '  const rect = { left: 140, right: 700, top: 300, bottom: 326 };',
    '  const pop = _dsOpenTitleTypePopup(rect, "card:frameRec", "title");',
    '  if (!pop) throw new Error("no popup");',
    '  const L = parseFloat(pop.style.left), T = parseFloat(pop.style.top);',
    '  if (Math.abs(L - rect.left) > 0.5) throw new Error("not left-aligned with the line: " + L + " vs " + rect.left);',
    '  if (T < rect.bottom) throw new Error("the popup covers the text it is editing: top " + T + " vs the line ending at " + rect.bottom);',
    '  _dsCloseTitleTypePopup();',
    '});',
    '',
    '__check("EXACT ASK: every font colour offers the presentation greys", () => {',
    '  reset();',
    '  // White to black, and six of them ARE the studio defaults, so the dot under',
    '  // a designer’s current colour is normally already lit.',
    '  const inks = FRAME_TEXT_INKS[0].colors;',
    '  if (inks[0] !== "#ffffff") throw new Error("the strip does not start at white: " + inks[0]);',
    '  if (inks[inks.length - 1] !== "#000000") throw new Error("the strip does not end at black");',
    '  [_titleStyle().color, _subtitleStyle().color, _specCodeStyle().color, _paragraphStyle().color].forEach(c => {',
    '    if (inks.indexOf(c) < 0) throw new Error("a studio default is not on the strip: " + c);',
    '  });',
    '  // greys only — a hue is a decision for the picker, not something to hit by accident',
    '  inks.forEach(h => { const m = h.replace("#", ""); if (!(m.slice(0,2) === m.slice(2,4) && m.slice(2,4) === m.slice(4,6))) throw new Error("not a grey: " + h); });',
    '});',
    '',
    '__check("the quick picks hang off the colour dot and keep the system picker", () => {',
    '  reset();',
    '  const host = document.createElement("div"); document.body.appendChild(host);',
    '  _dsTypeDefaultsInto(host);',
    '  const cols = host.querySelectorAll("input[type=color]");',
    '  if (!cols.length) throw new Error("no colour inputs");',
    '  Array.prototype.forEach.call(cols, (c, i2) => { if (!c.dataset.inkQuick) throw new Error("font colour " + i2 + " has no quick picks"); });',
    '  // It is still a real <input type=color>, so every existing handler and test',
    '  // that addresses it by value keeps working.',
    '  cols[0].value = "#4a4a4a"; cols[0].oninput();',
    '  if (_titleStyle().color !== "#4a4a4a") throw new Error("the input stopped writing its value");',
    '  cols[0].onmousedown({ preventDefault() {} });',
    '  const pop = document.getElementById("dsInkPopover");',
    '  if (!pop) throw new Error("clicking the dot opened nothing");',
    '  const dots = pop.querySelectorAll("button");',
    '  // Every family, not just the ramp: the strip carries a second row now (the',
    '  // note red), so counting row zero alone would stop noticing a dropped family.',
    '  let want = 1; FRAME_TEXT_INKS.forEach(f => { want += f.colors.length; });',
    '  if (dots.length !== want) throw new Error("expected every ink plus Custom (" + want + "), got " + dots.length);',
    '  if ((dots[dots.length - 1].textContent || "").indexOf("Custom") < 0) throw new Error("the system picker is not reachable from the popover");',
    '  dots[0].onclick();',
    '  if (_titleStyle().color !== "#ffffff") throw new Error("picking a grey did not apply it: " + _titleStyle().color);',
    '  if (document.getElementById("dsInkPopover")) throw new Error("the popover stayed open after a pick");',
    '  host.remove();',
    '});',
    '',
    '__check("a colour close to the strip but not on it lights the nearest dot", () => {',
    '  reset();',
    '  // #1a1a1a sits beside #141414. Lighting nothing reads as “no colour set”,',
    '  // which is the trap _personShadeNearestHex was added for on the scale figure.',
    '  const host = document.createElement("div"); document.body.appendChild(host);',
    '  _frameSwatchesInto(host, "#1a1a1a", () => {}, { families: FRAME_TEXT_INKS, nearest: true });',
    '  const near = host.querySelectorAll("[data-nearest]");',
    '  if (near.length !== 1) throw new Error("expected exactly one nearest dot, got " + near.length);',
    '  if ((near[0].title || "").indexOf("#141414") < 0) throw new Error("it lit the wrong dot: " + near[0].title);',
    '  // and an EXACT match is still an exact match, not a near one',
    '  const host2 = document.createElement("div"); document.body.appendChild(host2);',
    '  _frameSwatchesInto(host2, "#141414", () => {}, { families: FRAME_TEXT_INKS, nearest: true });',
    '  if (host2.querySelectorAll("[data-nearest]").length) throw new Error("an exact match was reported as nearest");',
    '  host.remove(); host2.remove();',
    '});',
    '',
    '__check("clicking a handle opens the popup on THAT handle, measured before the rebuild", () => {',
    '  // The rect has to be taken before _dsRenderCenter(), which replaces the element',
    '  // it came from. Measuring after leaves a detached node reading zeros, and the',
    '  // popup falls back to a fixed corner — which looks fine until the page scrolls.',
    '  reset();',
    '  const desc = { kind: "card", type: "frameRec", title: "Frame Recommendations" };',
    '  const key = _deckPageKey(desc);',
    '  _curPageKey = key;',
    '  _drawPageTitle(new CanvasPdfRec(PW, PH), PW, PH, "FRAME RECOMMENDATIONS", "Frames specified");',
    '  _curPageKey = null;',
    '  const page = document.createElement("div"); document.body.appendChild(page);',
    '  _dsTitleHandles(page, desc, 936, 540);',
    '  const box = page.querySelectorAll("[data-title-handle]")[0];',
    '  // jsdom reports zeros for every element, so give this one a real box and see',
    '  // whether the popup used it.',
    '  box.getBoundingClientRect = () => ({ left: 311, right: 900, top: 402, bottom: 431 });',
    '  box.onmousedown({ preventDefault() {}, stopPropagation() {} });',
    '  const pop = document.getElementById("dsTitleTypePopup");',
    '  if (!pop) throw new Error("clicking the handle opened nothing");',
    '  if (Math.abs(parseFloat(pop.style.left) - 311) > 0.5) throw new Error("the popup did not use the handle’s own box: left " + pop.style.left);',
    '  if (parseFloat(pop.style.top) < 431) throw new Error("the popup covers the line it was opened from: top " + pop.style.top);',
    '  _dsCloseTitleTypePopup(); page.remove();',
    '});',
    '',
    '__check("the ink popover opens left-aligned under its colour dot too", () => {',
    '  reset();',
    '  const dot = document.createElement("input"); dot.type = "color"; dot.value = "#141414";',
    '  document.body.appendChild(dot);',
    '  dot.getBoundingClientRect = () => ({ left: 96, right: 116, top: 210, bottom: 230 });',
    '  const pop = _dsOpenInkPopover(dot, "#141414", () => {});',
    '  if (!pop) throw new Error("no popover");',
    '  if (Math.abs(parseFloat(pop.style.left) - 96) > 0.5) throw new Error("not left-aligned with its dot: " + pop.style.left);',
    '  if (parseFloat(pop.style.top) < 230) throw new Error("the popover covers the control it belongs to: " + pop.style.top);',
    '  _dsCloseInkPopover(); dot.remove();',
    '});',
    '',
    '__check("a guide set with no ruler lines falls back to its OWN safety frame", () => {',
    '  reset();',
    '  editorialContent.guidePref.setId = "g_margins";',
    '  const B = _titleBand(PW, PH);',
    '  if (B.fromGuides) throw new Error("claimed title guides on a set that declares none");',
    '  const SR = _safeFrameRect(PW, PH);',
    '  if (!near(B.head, SR.T + 14)) throw new Error("fallback heading at " + B.head + ", expected " + (SR.T + 14));',
    '  if (!near(B.sub, SR.T + 30)) throw new Error("fallback subheading at " + B.sub);',
    '  if (!near(B.x, SR.L)) throw new Error("fallback x is not the safety frame: " + B.x);',
    '});',
    '',
    '__check("a rule-of-thirds line is not a title line", () => {',
    '  reset();',
    '  editorialContent.guidePref.setId = "g_thirds";',
    '  const B = _titleBand(PW, PH);',
    '  if (B.fromGuides) throw new Error("a third-of-the-way-down guide was honoured: the heading would print at " + B.head);',
    '  if (!near(B.head, 40 + 14)) throw new Error("expected the historical 40pt fallback, got " + B.head);',
    '});',
    '',
    '__check("a ruler guide below the top third is ignored", () => {',
    '  reset();',
    '  const sets = _guideSets();',
    '  sets.push({ id: "g_test_low", name: "low", builtin: false, margin: { t: 0.05, b: 0.10, l: 0.0234, r: 0.0234 }, cols: 0, gutter: 0, rows: 0, rowGutter: 0, vlines: [], hlines: [0.5, 0.75] });',
    '  editorialContent.guidePref.setId = "g_test_low";',
    '  const B = _titleBand(PW, PH);',
    '  if (B.fromGuides) throw new Error("honoured a guide at mid-page: the heading would print at " + B.head);',
    '  sets[sets.length - 1].hlines = [0.16, 0.6];',
    '  const B2 = _titleBand(PW, PH);',
    '  if (!near(B2.head, 0.16 * PH)) throw new Error("the high guide was ignored: " + B2.head);',
    '  if (!near(B2.sub, B2.head + 16)) throw new Error("a mid-page guide was used as the subheading line: " + B2.sub);',
    '});',
    '',
    '__check("the heading is the deck title style, so one dial moves every page", () => {',
    '  reset();',
    '  const rec = new CanvasPdfRec(PW, PH);',
    '  editorialContent.titleStyle = { font: "display", size: 31, color: "#141414" };',
    '  _drawPageTitle(rec, PW, PH, "A HEADING", "a subheading");',
    '  const h = textLike(rec, "A HEADING");',
    '  if (!h) throw new Error("nothing drawn");',
    '  if (h.st.sz !== 31) throw new Error("the heading ignored the title style size: " + h.st.sz);',
    '  const B = _titleBand(PW, PH);',
    '  if (!near(h.y, B.head)) throw new Error("heading at " + h.y + ", band says " + B.head);',
    '  const s2 = textLike(rec, "a subheading");',
    '  if (!s2) throw new Error("no subheading drawn");',
    '  if (!near(s2.y, B.sub)) throw new Error("subheading at " + s2.y + ", band says " + B.sub);',
    '  if (s2.st.sz === 31) throw new Error("the subheading was set at the heading size");',
    '});',
    '',
    '__check("a page that resolves its own ink can pass an rgb triple", () => {',
    '  reset();',
    '  const rec = new CanvasPdfRec(PW, PH);',
    '  _drawPageTitle(rec, PW, PH, "LIGHT", "SECOND", { subAsTitle: true, color: [255, 255, 255] });',
    '  const h = textLike(rec, "LIGHT");',
    '  if (!h) throw new Error("nothing drawn");',
    '  const s2 = textLike(rec, "SECOND");',
    '  if (!s2) throw new Error("no second line");',
    '  if (s2.st.sz !== h.st.sz) throw new Error("subAsTitle did not set the second line in the title face and size");',
    '  if (!near(s2.y, _titleBand(PW, PH).sub)) throw new Error("the second line is off the guide: " + s2.y);',
    '});',
    '',
    '__checkAsync("EXACT BUG: the named pages all put their heading on one baseline", async () => {',
    '  reset();',
    '  const B = _titleBand(PW, PH);',
    '  const seen = [];',
    '  const grab = (rec, label) => {',
    '    const hs = headings(rec);',
    '    if (!hs.length) throw new Error(label + ": no heading drawn at all");',
    '    seen.push([label, hs[0].y, hs[0].x]);',
    '  };',
    '  let rec;',
    '  rec = new CanvasPdfRec(PW, PH);',
    '  _drawFloorplanKeyPage(rec, {}, 1, {}, [], null, "Level 1"); grab(rec, "floorplan");',
    '  rec = new CanvasPdfRec(PW, PH);',
    '  _drawFrameRecPage(rec, {}, 1, {}, { header: "", frames: [] }); grab(rec, "frame recommendations");',
    '  rec = new CanvasPdfRec(PW, PH);',
    '  _drawTimelinePage(rec, {}, 1, {}, DEFAULT_TIMELINE); grab(rec, "process and timeline");',
    '  rec = new CanvasPdfRec(PW, PH);',
    '  _drawThankYouPage(rec, {}, 1, {}, "A Name | A Role | a@b.com | 123"); grab(rec, "thank you");',
    '  rec = new CanvasPdfRec(PW, PH);',
    '  _drawProsePage(rec, {}, 1, {}, "ART NARRATIVE", "Some copy.", ""); grab(rec, "prose");',
    '  rec = new CanvasPdfRec(PW, PH);',
    '  _drawStrategyPage(rec, {}, 1, {}, { primary: "a", secondary: "b", tertiary: "c" }); grab(rec, "strategy");',
    '  rec = new CanvasPdfRec(PW, PH);',
    '  _drawTOCPage(rec, {}, 1, {}, [{ label: "Cover", page: "1" }]); grab(rec, "contents");',
    '  rec = new CanvasPdfRec(PW, PH);',
    '  _drawArtIndexPage(rec, {}, 1, {}, []); grab(rec, "artwork index");',
    '  seen.forEach((p) => {',
    '    if (!near(p[1], B.head, 0.5)) throw new Error(p[0] + " heading at y=" + p[1] + ", the title guide is at " + B.head);',
    '    if (!near(p[2], B.x, 0.5)) throw new Error(p[0] + " heading at x=" + p[2] + ", the left guide is at " + B.x);',
    '  });',
    '  if (seen.length !== 8) throw new Error("only " + seen.length + " pages were exercised");',
    '});',
    '',
    '__checkAsync("a spec page title lands on the guide, not on the top margin", async () => {',
    '  reset();',
    '  dashProjectData = [{ id: "ART.001", imageCode: "IMG-1", level: 0, location: "Lobby", extW: 24, extH: 24, product: "Framed Art" }];',
    '  const B = _titleBand(PW, PH);',
    '  const SR = _safeFrameRect(PW, PH);',
    '  const tpls = ["frameRight", "artSpecDetail", "frameSpecDetail"];',
    '  for (const tpl of tpls) {',
    '    const rec = new CanvasPdfRec(PW, PH);',
    '    await _drawSpecPageTemplate(rec, {}, 1, {}, dashProjectData[0], tpl, { PW: PW, PH: PH, M: 40 });',
    '    const h = (rec.ops || []).filter(o => o && o.t === "text").find(o => ("" + o.str).indexOf("ART.001") >= 0);',
    '    if (!h) throw new Error(tpl + ": the title was never drawn");',
    '    if (!near(h.y, B.head, 0.5)) throw new Error(tpl + ": title at y=" + h.y + ", the title guide is at " + B.head + " (the old remap put it near " + (SR.T + _titleStyle().size * 0.72) + ")");',
    '  }',
    '});',
    '',
    '__checkAsync("a group page title lands on the guide too", async () => {',
    '  reset();',
    '  dashProjectData = [',
    '    { id: "ART-2.1-A", imageCode: "I-A", level: 0, location: "Lobby", extW: 24, extH: 24 },',
    '    { id: "ART-2.1-B", imageCode: "I-B", level: 0, location: "Lobby", extW: 24, extH: 24 }',
    '  ];',
    '  const B = _titleBand(PW, PH);',
    '  const unit = { rep: dashProjectData[0], members: dashProjectData, key: "ART-2.1" };',
    '  const rec = new CanvasPdfRec(PW, PH);',
    '  await _drawSpecSetPage(rec, {}, 1, {}, unit, "setRight", { PW: PW, PH: PH, M: 40 });',
    '  const h = (rec.ops || []).filter(o => o && o.t === "text").find(o => ("" + o.str) === "ART-2.1");',
    '  if (!h) throw new Error("the group code was never drawn as a title");',
    '  if (!near(h.y, B.head, 0.5)) throw new Error("group title at y=" + h.y + ", the guide is at " + B.head);',
    '});',
    '',
    '__check("changing the guide set moves every heading with it", () => {',
    '  reset();',
    '  const before = _titleBand(PW, PH).head;',
    '  const sets = _guideSets();',
    '  sets.push({ id: "g_test_hi", name: "hi", builtin: false, margin: { t: 0.05, b: 0.10, l: 0.04, r: 0.04 }, cols: 0, gutter: 0, rows: 0, rowGutter: 0, vlines: [], hlines: [0.20, 0.28] });',
    '  editorialContent.guidePref.setId = "g_test_hi";',
    '  const after = _titleBand(PW, PH);',
    '  if (near(after.head, before)) throw new Error("the heading did not follow the new set");',
    '  if (!near(after.head, 0.20 * PH)) throw new Error("heading at " + after.head + ", expected " + (0.20 * PH));',
    '  const rec = new CanvasPdfRec(PW, PH);',
    '  _drawFloorplanKeyPage(rec, {}, 1, {}, [], null, "Level 1");',
    '  const h = (rec.ops || []).filter(o => o && o.t === "text").find(o => ("" + o.str) === "FLOORPLAN");',
    '  if (!h || !near(h.y, after.head, 0.5)) throw new Error("the floorplan page did not follow: " + (h && h.y));',
    '});',
    '',
    '__check("the content under a heading clears the band", () => {',
    '  reset();',
    '  const B = _titleBand(PW, PH);',
    '  const rec = new CanvasPdfRec(PW, PH);',
    '  _drawFloorplanKeyPage(rec, {}, 1, {}, [], null, "Level 1");',
    '  const empty = (rec.ops || []).filter(o => o && o.t === "text").find(o => ("" + o.str).indexOf("No items yet") >= 0);',
    '  if (!empty) throw new Error("the empty-list note is gone");',
    '  if (empty.y <= B.sub) throw new Error("the callout list starts at " + empty.y + ", on or above the subheading at " + B.sub);',
    '});'
  ].join('\n');

  try {
    window.__appSrc = src;
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const results = window.__testResults || [];
  const asyncResults = await Promise.all(window.__asyncChecks || []);
  const all = nodeResults.concat(results, asyncResults);
  const failures = [];
  all.forEach(r => {
    console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err));
    if (!r.ok) failures.push(r.label);
  });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
