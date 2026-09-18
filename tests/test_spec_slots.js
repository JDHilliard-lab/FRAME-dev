// "Instead of having the Spec template on the right. Lets turn it into a check box
//  system, this will work well if I'm at a stage where I might be missing frames,
//  elevations, plan views, and even if I'm missing them and I check off the boxes it
//  will show a blank space... If I do not have plan view ticked off I want the
//  Elevation to be far left and if I click on plan view it pushes it to the right."
//  ... "frame, frame profile, floorplan, elevation each get there own tick, since some
//  of them might be missing, maybe have an option to apply to all specs or just this
//  page."
//
// Four ticks, not two template cards. The bundle was the wrong unit: a deck part way
// through is missing these one at a time.
//
// The two rules that make it work, and they pull in opposite directions on purpose:
//   TICKED but empty   -> RESERVE the space (a grey box with its caption). The page
//                         being laid out has to stop moving while it gets filled in.
//   UNTICKED           -> REMOVE it, and everything after PACKS LEFT.
//
// And the base geometry is still the two existing detail templates, chosen by whether
// any frame thumbnail is on - so a deck that never touches a tick renders exactly as
// it did, which is the thing a silent re-typeset would have cost.
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
  const codeOnly = (s) => s.split('\n').filter(l => l.trim().indexOf('//') !== 0).join('\n');

  check('the preview and the PDF read the SAME ticks', () => {
    // _deckMockHTML draws a picture of the printed sheet. A tick that reaches one
    // renderer and not the other is a preview lying about the export - the worst
    // kind of bug here, because the preview is how a deck gets checked.
    const mock = codeOnly(fnBody('_deckMockHTML'));
    if (mock.indexOf('_specTplEffective(') < 0) throw new Error('the HTML mock still draws the raw template, so it ignores the ticks');
    const pdf = codeOnly(fnBody('_drawSpecPageTemplate'));
    if (pdf.indexOf('_specTplEffective(') < 0) throw new Error('the page renderer ignores the ticks');
  });

  check('a template card is NOT filtered by the deck ticks', () => {
    // A card shows the standard demo of what that layout IS. Filtering it by the
    // deck's current ticks would make the card advertise the page you already have.
    const b = codeOnly(fnBody('_drawSpecPageTemplate'));
    const at = b.indexOf('_specTplEffective(');
    const line = b.slice(b.lastIndexOf('\n', b.indexOf('const tpl =')), at + 40);
    if (line.indexOf('ctx.swatch') < 0) throw new Error('swatch mode goes through the tick filter, so the cards restyle themselves');
  });

  check('the cache key carries the GROUP ticks as well as the per-piece ones', () => {
    // A group page keeps its own tick map, and it was missing from this key - so the
    // only way to make a group tick show up was to wipe the WHOLE cache, which is what
    // rebuilt all 86 pages of a deck on every click. Reported as a lot of flickering
    // when turning check boxes off and on.
    const b = codeOnly(fnBody('_dsThumbCacheKey'));
    if (b.indexOf('_specGroupSlots(') < 0) throw new Error('the cache key does not carry the group ticks');
  });

  check('a tick does NOT wipe every cached thumbnail', () => {
    // With the ticks in the key, the pages a tick can change miss on their own. Wiping
    // the lot sends every cover, floorplan, breaker and untouched spec page back to a
    // placeholder for no reason.
    const b = codeOnly(fnBody('_dsSpecSlotsInto'));
    if (b.indexOf('_dsThumbCache = {}') >= 0) throw new Error('the ticks panel still clears the whole thumbnail cache');
  });

  check('the thumbnail cache key moves when a tick does', () => {
    // Keyed only on the template, a thumbnail keeps showing a floorplan that has
    // been switched off - the same trap the template key itself was added for.
    const b = codeOnly(fnBody('_dsThumbCacheKey'));
    if (b.indexOf('_specSlots(') < 0) throw new Error('the cache key does not carry the ticks');
  });

  const testBlock = [
    'window.__testResults = [];',
    'const __check = (label, fn) => {',
    '  try { fn(); window.__testResults.push({ label, ok: true }); }',
    '  catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); }',
    '};',
    '',
    'editorialContent = _editorialDefaults();',
    'const setTicks = (o) => { editorialContent.specSlots = Object.assign({ frame: true, profile: true, plan: true, elevation: true }, o || {}); editorialContent.specSlotOverrides = {}; };',
    '',
    '__check("EXACT ASK: untick the floorplan and the elevation takes the far-left column", () => {',
    '  setTicks({});',
    '  const both = _specTplEffective("frameSpecDetail", "");',
    '  const leftCol = both.plan.x;',
    '  if (!(both.elevation.x > leftCol)) throw new Error("with both on, the elevation should sit right of the plan");',
    '  setTicks({ plan: false });',
    '  const noPlan = _specTplEffective("frameSpecDetail", "");',
    '  if (noPlan.plan) throw new Error("an unticked floorplan is still in the layout");',
    '  if (noPlan.elevation.x !== leftCol) throw new Error("the elevation did not pack left: " + noPlan.elevation.x + " vs " + leftCol);',
    '});',
    '',
    '__check("ticking the floorplan pushes the elevation back to the right", () => {',
    '  setTicks({ plan: false });',
    '  const a = _specTplEffective("frameSpecDetail", "").elevation.x;',
    '  setTicks({ plan: true });',
    '  const b = _specTplEffective("frameSpecDetail", "");',
    '  if (!(b.elevation.x > a)) throw new Error("the elevation did not move right when the plan came back");',
    '  if (b.plan.x !== a) throw new Error("the plan did not take the column the elevation gave up");',
    '});',
    '',
    '__check("each of the four is its own tick, and unticking one leaves the others", () => {',
    '  setTicks({ frame: false });',
    '  const t = _specTplEffective("frameSpecDetail", "");',
    '  if (!t.frameDetail) throw new Error("unticking the corner removed the whole strip, taking the profile with it");',
    '  if (t.frameDetail.corner !== false) throw new Error("the corner is still drawn");',
    '  if (t.frameDetail.profile !== true) throw new Error("the profile went with the corner");',
    '  setTicks({ profile: false });',
    '  const u = _specTplEffective("frameSpecDetail", "");',
    '  if (u.frameDetail.corner !== true || u.frameDetail.profile !== false) throw new Error("the two frame ticks are not independent");',
    '  if (!u.plan || !u.elevation) throw new Error("a frame tick took a thumbnail with it");',
    '});',
    '',
    '__check("with NO frame thumbnails the page is the plan+elevation layout, unchanged", () => {',
    '  // The ticks pick the BASE layout rather than inventing geometry: those two',
    '  // templates already are exactly this pair, so a deck that never touches a tick',
    '  // renders byte for byte as it did.',
    '  setTicks({ frame: false, profile: false });',
    '  const t = _specTplEffective("frameSpecDetail", "");',
    '  if (t.frameDetail) throw new Error("the strip survives with neither thumbnail ticked");',
    '  const art = SPEC_TEMPLATES.artSpecDetail;',
    '  if (t.plan.y !== art.plan.y || t.plan.h !== art.plan.h) throw new Error("the geometry is not artSpecDetail: " + t.plan.y + "/" + t.plan.h);',
    '  setTicks({});',
    '  const f = _specTplEffective("frameSpecDetail", "");',
    '  const fr = SPEC_TEMPLATES.frameSpecDetail;',
    '  if (f.plan.y !== fr.plan.y || f.plan.h !== fr.plan.h) throw new Error("the all-on geometry is not frameSpecDetail");',
    '});',
    '',
    '__check("the ticks never touch a FREEFORM page, or a group or flat sheet", () => {',
    '  // custom is a page somebody placed by hand: resolving it onto this geometry',
    '  // would throw that work away. Group and flat sheets are different renderers.',
    '  setTicks({ plan: false, elevation: false, frame: false, profile: false });',
    '  ["custom", "egdDetail", "setScale", "setRight"].forEach(k => {',
    '    if (!SPEC_TEMPLATES[k]) return;',
    '    if (_specTplEffective(k, "") !== SPEC_TEMPLATES[k]) throw new Error(k + " is being filtered by ticks it has no parts for");',
    '  });',
    '  // And every PER-PIECE layout is driven by them, so no page is left with no control.',
    '  ["frameSpecDetail", "artSpecDetail", "frameRight", "classic"].forEach(k => {',
    '    if (!_specTplSlotAware(k)) throw new Error(k + " takes no ticks, so its panel has nothing in it");',
    '  });',
    '  setTicks({});',
    '});',
    '',
    '// ---- Group A/B/C: the same four ticks, its own stored map ----',
    '__check("EXACT ASK: a group page has the same four ticks, on their own map", () => {',
    '  // Same names and same rules, but NOT the same stored value: a per-piece page has',
    '  // always drawn its elevation while a group page`s wall thumbnail was off, so one',
    '  // shared map would have grown an elevation onto every group page in every deck.',
    '  SPEC_SLOT_KEYS.forEach(k => {',
    '    if (typeof _specGroupSlots(null)[k] !== "boolean") throw new Error("the group map has no " + k + " tick");',
    '  });',
    '  editorialContent.specSlots = { frame: true, profile: true, plan: true, elevation: true };',
    '  editorialContent.specGroupSlots = { frame: true, profile: true, plan: true, elevation: true };',
    '  editorialContent.specSlotOverrides = {}; editorialContent.specGroupSlotOverrides = {};',
    '  _setSpecGroupSlot("", "plan", false, "deck");',
    '  if (_specGroupSlots(null).plan !== false) throw new Error("the group tick did not take");',
    '  if (_specSlots(null).plan !== true) throw new Error("a group tick moved the per-piece map");',
    '  _setSpecSlot("", "elevation", false, "deck");',
    '  if (_specGroupSlots(null).elevation !== true) throw new Error("a per-piece tick moved the group map");',
    '});',
    '',
    '__check("one resolver answers for either page kind", () => {',
    '  // A renderer asks what this page shows without knowing which map holds it.',
    '  editorialContent.specSlots = { frame: true, profile: true, plan: true, elevation: true };',
    '  editorialContent.specGroupSlots = { frame: false, profile: false, plan: false, elevation: false };',
    '  editorialContent.specSlotOverrides = {}; editorialContent.specGroupSlotOverrides = {};',
    '  if (_specSlotsFor("frameSpecDetail", "").plan !== true) throw new Error("a per-piece page read the group map");',
    '  if (_specSlotsFor("setLegend", "").plan !== false) throw new Error("a group page read the per-piece map");',
    '});',
    '',
    '__check("a group deck is seeded from what its pages ALREADY drew", () => {',
    '  // The wall thumbnail was scaleOpts.elevThumb, off by default, and no group page',
    '  // has ever had a floorplan. Defaulting either on would have changed every deck.',
    '  editorialContent = { specTemplate: "setLegend", scaleOpts: { codes: "frames", elevThumb: false } };',
    '  _mbMigratePages();',
    '  const g = editorialContent.specGroupSlots;',
    '  if (g.elevation !== false) throw new Error("a deck with the wall thumbnail OFF was given one");',
    '  if (g.plan !== false) throw new Error("a group page was given a floorplan it never had");',
    '  if (g.frame !== true || g.profile !== true) throw new Error("the frame strip it did draw was switched off");',
    '  editorialContent = { specTemplate: "setLegend", scaleOpts: { codes: "frames", elevThumb: true } };',
    '  _mbMigratePages();',
    '  if (editorialContent.specGroupSlots.elevation !== true) throw new Error("a deck with the wall thumbnail ON lost it");',
    '  editorialContent = _editorialDefaults();',
    '});',
    '',
    '__check("EXACT ASK: the group band reads elevation, plan, profile, corner right to left", () => {',
    '  // Each thumbnail anchors to the box its RIGHT-hand neighbour actually drew, so',
    '  // unticking one slides the rest right rather than leaving a hole.',
    '  const S = window.__appSrc;',
    '  const b0 = S.indexOf("Bottom band: image-code legend");',
    '  const band = S.slice(b0, S.indexOf("IMAGE CODES", b0));',
    '  const iElev = band.indexOf("_wantElev");',
    '  const iPlan = band.indexOf("if (_wantPlan)");',
    '  const iStrip = band.indexOf("if (_wantStrip)");',
    '  if (iElev < 0 || iPlan < 0 || iStrip < 0) throw new Error("the band does not draw all three groups");',
    '  if (!(iElev < iPlan && iPlan < iStrip)) throw new Error("the band is not drawn right to left");',
    '  // and each one hands its rect to the next',
    '  if (band.split("_thumbBox = {").length - 1 < 3) throw new Error("a band thumbnail does not record its rect for the one on its left");',
    '});',
    '',
    '__check("a NEW project opens on the layout the ticks drive", () => {',
    '  // With the layout buttons gone this is not cosmetic: a default the ticks do not',
    '  // drive would open every new project on a panel with no control in it, and that',
    '  // would be the normal case rather than an edge one.',
    '  const fresh = _editorialDefaults();',
    '  if (!_specTplSlotAware(fresh.specTemplate)) throw new Error("a new project defaults to " + fresh.specTemplate + ", which takes no ticks");',
    '  // Slot-aware is NOT enough, and asking only that let a real regression through:',
    '  // frameRight is slot-aware too, and it SEEDS the floorplan and the frame strip',
    '  // OFF - so defaulting to it would open every new deck missing two of its four',
    '  // parts. A new project starts with the whole layout.',
    '  editorialContent = { specTemplate: fresh.specTemplate };',
    '  _mbMigratePages();',
    '  SPEC_SLOT_KEYS.forEach(k => {',
    '    if (editorialContent.specSlots[k] !== true) throw new Error("a new project opens with " + k + " switched off");',
    '  });',
    '  // And an unreadable stored value falls back to one too, rather than to a layout',
    '  // whose panel would be empty.',
    '  editorialContent = { specTemplate: 42 };',
    '  _mbMigratePages();',
    '  if (!_specTplSlotAware(editorialContent.specTemplate)) throw new Error("a bad stored value falls back to " + editorialContent.specTemplate);',
    '  editorialContent = _editorialDefaults();',
    '});',
    '',
    '__check("every seeded layout keeps the parts it actually drew", () => {',
    '  // One table, and each row is a claim about what that layout put on the page.',
    '  // frameRight and classic both drew an elevation and nothing else beside it.',
    '  ["frameRight", "classic"].forEach(k => {',
    '    editorialContent = { specTemplate: k };',
    '    _mbMigratePages();',
    '    const sl = editorialContent.specSlots;',
    '    if (sl.elevation !== true) throw new Error(k + " lost the elevation it drew");',
    '    if (sl.plan !== false) throw new Error(k + " was given a floorplan it never drew");',
    '    if (sl.frame !== false || sl.profile !== false) throw new Error(k + " was given a frame strip it never drew");',
    '  });',
    '  editorialContent = _editorialDefaults();',
    '});',
    '',
    '__check("EXACT ASK: deck-wide by default, with a per-page exception", () => {',
    '  setTicks({});',
    '  _setSpecSlot("ART.002", "plan", false, "page");',
    '  if (_specSlots("ART.002").plan !== false) throw new Error("the page exception did not take");',
    '  if (_specSlots("ART.001").plan !== true) throw new Error("a page exception leaked onto every other page");',
    '  if (_specSlots(null).plan !== true) throw new Error("a page exception changed the deck default");',
    '});',
    '',
    '__check("EXACT ASK: applying to all specs clears the page exceptions for THAT tick", () => {',
    '  // Otherwise a page that had pinned this one slot goes on ignoring the house',
    '  // setting with nothing on screen to say why, and "apply to all" visibly does not.',
    '  setTicks({});',
    '  _setSpecSlot("ART.002", "plan", false, "page");',
    '  _setSpecSlot("ART.002", "frame", false, "page");',
    '  _setSpecSlot("", "plan", false, "deck");',
    '  if (_specSlots(null).plan !== false) throw new Error("the deck default did not take");',
    '  const ov = _specSlotOv("ART.002") || {};',
    '  if (Object.prototype.hasOwnProperty.call(ov, "plan")) throw new Error("the page still pins the slot the deck just set");',
    '  if (ov.frame !== false) throw new Error("applying one tick to the deck wiped an unrelated page exception");',
    '});',
    '',
    '__check("clearing a page prunes its shell, so an empty map is not carried in every save", () => {',
    '  setTicks({});',
    '  _setSpecSlot("ART.003", "elevation", false, "page");',
    '  _clearSpecSlots("ART.003");',
    '  if (_specSlotOv("ART.003")) throw new Error("the exception survived");',
    '  if (editorialContent.specSlotOverrides && Object.keys(editorialContent.specSlotOverrides).length) throw new Error("an empty shell is left behind");',
    '});',
    '',
    '__check("a deck laid out WITHOUT frame thumbnails is seeded that way, not given them", () => {',
    '  // Defaulting an artSpecDetail deck to all-on would put a corner sample and a',
    '  // profile on every page of a project already sent to a client.',
    '  editorialContent = { specTemplate: "artSpecDetail", specTemplateOverrides: { "ART.009": "frameSpecDetail" } };',
    '  _mbMigratePages();',
    '  const ec = editorialContent;',
    '  if (ec.specSlots.frame !== false || ec.specSlots.profile !== false) throw new Error("an artSpecDetail deck was given frame thumbnails it never had");',
    '  if (ec.specSlots.plan !== true || ec.specSlots.elevation !== true) throw new Error("it lost the thumbnails it did have");',
    '  // frameSpecDetail IS the all-on default, so it seeds nothing rather than writing',
    '  // a row that says what the default already says. A layout that drew FEWER parts',
    '  // does get a row - that is the whole point of the table.',
    '  editorialContent = { specTemplate: "frameSpecDetail", specTemplateOverrides: { "ART.009": "frameRight" } };',
    '  _mbMigratePages();',
    '  const ov9 = editorialContent.specSlotOverrides["ART.009"];',
    '  if (!ov9) throw new Error("a per-PAGE override onto a narrower layout was not seeded");',
    '  if (ov9.plan !== false || ov9.frame !== false) throw new Error("the page was seeded with parts frameRight never drew");',
    '  // A deck that already carries ticks keeps them, including any deliberately',
    '  // turned back on - so this seeding can only ever happen once.',
    '  editorialContent = { specTemplate: "artSpecDetail", specSlots: { frame: true, profile: true, plan: true, elevation: true } };',
    '  _mbMigratePages();',
    '  if (editorialContent.specSlots.frame !== true) throw new Error("a stored tick was overwritten by the seeding");',
    '  editorialContent = _editorialDefaults();',
    '});',
    '__check("EXACT BUG: a group tick moves only the pages it can change", () => {',
    '  editorialContent = _editorialDefaults();',
    '  editorialContent.specTemplate = "setLegend";',
    '  const grp = { kind: "spec", title: "ART-1", row: { id: "ART-1" }, _ovKey: "ART-1" };',
    '  const cover = { kind: "fixed", fixed: "cover" };',
    '  const g0 = _dsThumbCacheKey(grp), c0 = _dsThumbCacheKey(cover);',
    '  _setSpecGroupSlot(null, "plan", !_specGroupSlots(null).plan, "deck");',
    '  const g1 = _dsThumbCacheKey(grp), c1 = _dsThumbCacheKey(cover);',
    '  if (g0 === g1) throw new Error("the group page kept its key, so its thumbnail goes stale");',
    '  if (c0 !== c1) throw new Error("the cover changed key off a spec tick, so it rebuilds for nothing");',
    '  editorialContent = _editorialDefaults();',
    '});',
    '__check("EXACT BUG: ticking a box leaves every other page its thumbnail", () => {',
    '  editorialContent = _editorialDefaults();',
    '  editorialContent.specTemplate = "setLegend";',
    '  const desc = { kind: "spec", title: "ART-1", row: { id: "ART-1" }, _ovKey: "ART-1" };',
    '  const other = { kind: "fixed", fixed: "cover" };',
    '  _dsThumbCache = {};',
    '  _dsThumbCache[_dsThumbCacheKey(other)] = "painted";',
    '  const host = document.createElement("div");',
    '  _dsSpecSlotsInto(host, desc, "ART-1", true);',
    '  const cb = host.querySelector("input[data-slot=plan]");',
    '  if (!cb) throw new Error("no plan checkbox in the group panel");',
    '  cb.checked = !cb.checked; cb.onchange();',
    '  if (_dsThumbCache[_dsThumbCacheKey(other)] !== "painted") throw new Error("an unrelated page lost its thumbnail to a spec tick");',
    '  editorialContent = _editorialDefaults(); _dsThumbCache = {};',
    '});'

  ].join('\n');

  try {
    window.__appSrc = src;
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const all = nodeResults.concat(window.__testResults || []);
  const failures = [];
  all.forEach(r => {
    console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err));
    if (!r.ok) failures.push(r.label);
  });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
