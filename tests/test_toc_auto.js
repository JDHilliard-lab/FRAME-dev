// 18.71: THE CONTENTS PAGE FILLS ITSELF.
//
// The Farmboy Contents templates were text boxes typed by hand ("Section Title",
// "#<tab>Page Title"), so every deck edit meant retyping the contents. Worse, a
// contents page added from the template printed something else entirely: the export
// treated ANY 'toc' layout page as the old flat dotted-leader list (_drawTOCPage) and
// never drew the template the studio showed. Now the template is read once into a
// style and grid, its slots come off the page, and the outline is written from
// _deckPageList on every rebuild. This runs the REAL export with the REAL jsPDF and
// the REAL Farmboy template.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'templates.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const noop = () => ctx2d;
  const ctx2d = new Proxy({}, { get: (t, k) => {
    if (k === 'measureText') return () => ({ width: 0 });
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, (w | 0) * (h | 0) * 4)), width: w, height: h });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: () => {} });
    if (k === 'canvas') return undefined;
    return k in t ? t[k] : noop;
  }, set: (t, k, v) => { t[k] = v; return true; } });
  window.HTMLCanvasElement.prototype.getContext = () => ctx2d;
  const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  window.HTMLCanvasElement.prototype.toDataURL = () => PNG1;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator; global.self = window;
  window.jspdf = { jsPDF: require(path.join(root, 'lib-jspdf.min.js')).jsPDF };

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const S = window.__appSrc;
    window.__run = (async () => {
      scheduleAutosave = () => {}; pushHistory = () => {}; _autosaveToldUser = true;
      _pdfShowOverlay = () => {}; _pdfHideOverlay = () => {}; _pdfProgress = () => {};
      _registerPdfFonts = async () => {}; _loadEditorBrandFonts = async () => {};
      _getPdfLogos = async () => ({});
      _captureElevWithGuides = async () => null;
      let shown = null; showSpecPdfPreview = (doc) => { shown = doc; };

      const row = (id, extra) => Object.assign(_cloneData(dashDefaultData), { id: id, location: 'Lobby', extW: 24, extH: 30 }, extra || {});
      dashUnit = 'in'; elevUnit = 'in';
      dashProjectData = [row('ART.1'), row('ART.2'), row('ART.3A'), row('ART.3B')];
      const fr = (id, x) => ({ id: id, letter: id.slice(-1), x: x, y: 50, w: 24, h: 30, active: true });
      elevations = [{ id: 'e1', name: 'Lobby North', w: 200, h: 108, frames: [fr('ART.3A', 20), fr('ART.3B', 80)] }];
      floorplanLevels = [{ name: 'Level 1', imageData: null }];
      editorialContent.specTemplate = 'frameSpecDetail';
      editorialContent.elevBreakers = false;
      ['cover', 'understanding', 'narrative', 'strategy', 'floorplanKey', 'spec', 'slogan', 'contacts'].forEach(k => {
        const el = document.getElementById('specInc_' + k); if (el) el.checked = true;
      });
      ['timeline', 'frameRec'].forEach(k => { const el = document.getElementById('specInc_' + k); if (el) el.checked = false; });
      window._exportScope = { mode: 'all' };

      // Contents (Full) exactly as Add to deck puts it on a page: elements on the page,
      // the rules in the page's annotations.
      const mt = IDML_MASTER_TEMPLATES.find(t => t.type === 'toc' && /Full/.test(t.name));
      const tocPg = { id: 'pgtoc', type: 'toc', title: 'Contents (Full)', elements: _cloneData(mt.elements), afterKey: 'fixed:cover' };
      editorialContent.layoutPages = [tocPg];
      editorialContent.annotations = { 'layout:pgtoc': _cloneData(mt.annotations) };
      editorialContent.tocOverrides = {};
      const ruleCount0 = mt.annotations.filter(a => a.type === 'arrow' && a.tip === 'none').length;

      let pages = _deckPageList();
      const keys = pages.map(_deckPageKey);
      const gen = () => tocPg.elements.filter(e => e._toc);
      const texts = (role) => gen().filter(e => e._toc === role).map(e => e.text.split('\\n').join(' '));

      __check('the template slots come off the page; the CONTENTS heading stays', () => {
        if (tocPg.elements.some(e => !e._toc && /Section Title|Page Title/.test(e.text || ''))) throw new Error('template placeholder text still on the page');
        if (!tocPg.elements.some(e => !e._toc && e.text === 'CONTENTS')) throw new Error('the heading was removed');
        const rules = (editorialContent.annotations['layout:pgtoc'] || []).filter(a => a.type === 'arrow' && a.tip === 'none').length;
        if (ruleCount0 < 6 || rules !== 0) throw new Error('template rules left: ' + rules + ' of ' + ruleCount0);
        if (!tocPg.toc || tocPg.toc.cols.length !== 2) throw new Error('Contents (Full) should read as two columns, got ' + JSON.stringify(tocPg.toc && tocPg.toc.cols));
      });
      __check('the generated lines keep the template look (its font, size and colour) and are locked', () => {
        const t = gen().find(e => e._toc === 'title'), en = gen().find(e => e._toc === 'entry');
        const st = mt.elements.find(e => /Section Title/.test(e.text || '')), se = mt.elements.find(e => /Page Title/.test(e.text || ''));
        if (!t || !en) throw new Error('no generated title/entry');
        if (t.size !== st.size || t.color !== st.color || t.font !== st.font) throw new Error('section title style drifted: ' + JSON.stringify(t));
        if (en.size !== se.size || en.color !== se.color) throw new Error('entry style drifted: ' + JSON.stringify(en));
        if (gen().some(e => !e.locked)) throw new Error('a generated element is not locked');
        if (!gen().some(e => e._toc === 'rule')) throw new Error('no section rules');
      });
      __check('no dividers: Introduction, the level, Closing; spec pages collapse to one Artwork line', () => {
        const titles = texts('title').join(' | ');
        if (titles !== 'Introduction | Level 1 | Closing') throw new Error(titles);
        const ents = texts('entry').join(' | ');
        // 18.75: a run is named by where it hangs.
        if (ents.indexOf('Lobby: ART.1 \\u2013 ART.3B') < 0) throw new Error('spec run not collapsed: ' + ents);
        if (ents.indexOf('Project Understanding') < 0 || ents.indexOf('Floor Plan') < 0) throw new Error(ents);
        if (/Cover|Good Art|Contents/.test(ents)) throw new Error('cover, slogan or the contents page itself listed: ' + ents);
      });
      __check('every number is the page that entry starts on in the deck', () => {
        const m = _tocModel(pages);
        m.sections.forEach(s => s.entries.forEach(e => { const n = keys.indexOf(e.keys[0]) + 1; if (e.num !== n) throw new Error(e.label + ' says ' + e.num + ', page is ' + n); }));
        const nums = texts('num');
        const iU = keys.indexOf('fixed:understanding') + 1;
        if (nums.indexOf(String(iU)) < 0) throw new Error('Project Understanding page ' + iU + ' not printed: ' + nums.join(','));
      });
      __check('a rebuild with nothing changed writes nothing', () => {
        const before = JSON.stringify(tocPg.elements);
        _deckPageList();
        if (JSON.stringify(tocPg.elements) !== before) throw new Error('elements rewritten with nothing changed');
      });

      // A divider starts a section titled by its heading.
      const divider = IDML_MASTER_TEMPLATES.find(t => t.type === 'breaker' && /Center/.test(t.name));
      const divEls = _cloneData(divider.elements);
      divEls.forEach(e => { if (e.text === 'DIVIDER PAGE HEADING') e.text = 'THE ART OF THE LOBBY'; });
      editorialContent.layoutPages.push({ id: 'pgdiv', type: 'breaker', title: 'Divider (Center)', elements: divEls, afterKey: 'fixed:strategy' });
      pages = _deckPageList();
      __check('a divider page starts a section titled by its heading, in Title Case', () => {
        const titles = texts('title').join(' | ');
        // 18.78: Thank You closes the deck instead of joining the last divider's section.
        if (titles !== 'Introduction | The Art of the Lobby | Closing') throw new Error(titles);
        if (texts('entry').join(' | ').indexOf('Divider') >= 0) throw new Error('the divider listed itself');
      });

      // Overrides: leave one out, rename another.
      const m0 = _tocModel(pages);
      const art = m0.sections[1].entries.find(e => e._run);
      setTocOverride(['fixed:narrative'], 'hide', true);
      setTocOverride(art.keys, 'label', 'Selected Artwork');
      pages = _deckPageList();
      __check('an entry can be left out and comes back in the Left out list', () => {
        if (texts('entry').some(t => t === 'Art Narrative')) throw new Error('hidden entry still printed');
        const m = _tocModel(pages);
        if (!m.leftOut.some(e => e.keys[0] === 'fixed:narrative')) throw new Error('hidden entry not offered back');
      });
      __check('an entry can be renamed; clearing the name goes back to the automatic one', () => {
        if (texts('entry').indexOf('Selected Artwork') < 0) throw new Error(texts('entry').join(' | '));
        setTocOverride(art.keys, 'label', '');
        _deckPageList();
        if (texts('entry').indexOf('Selected Artwork') >= 0) throw new Error('rename not cleared');
        if (Object.keys(editorialContent.tocOverrides).some(k => !Object.keys(editorialContent.tocOverrides[k]).length)) throw new Error('empty override left behind');
      });
      setTocOverride(['fixed:narrative'], 'hide', false);

      // Breakers on: a wall page is one line and stands for the spec pages after it.
      editorialContent.elevBreakers = true;
      pages = _deckPageList();
      __check('a wall breaker is one entry that absorbs its spec pages', () => {
        const ents = texts('entry').join(' | ');
        if (ents.indexOf('Lobby North') < 0) throw new Error('wall not listed by name: ' + ents);
        if (texts('entry').some(t => /^Lobby: .*ART\\.3/.test(t))) throw new Error('spec pages of the wall listed separately: ' + ents);
      });
      editorialContent.elevBreakers = false;

      // A template being EDITED is a template, not a contents page.
      const tpl = { id: 'tpleditX', type: 'toc', elements: _cloneData(mt.elements), afterKey: '__start__' };
      editorialContent.layoutPages.push(tpl);
      _deckPageList();
      __check('a contents template open for editing keeps its slots', () => {
        if (tpl.toc || tpl.elements.some(e => e._toc)) throw new Error('the template editor page was converted');
        if (!tpl.elements.some(e => /Section Title/.test(e.text || ''))) throw new Error('template slots removed');
      });
      editorialContent.layoutPages.pop();

      // 18.76: a long contents runs onto more pages at full size; nothing is dropped.
      __check('a contents too long for one page runs onto more pages at full size, nothing dropped', () => {
        const many = { sections: [] };
        for (let i = 0; i < 9; i++) many.sections.push({ title: 'Section ' + i, entries: Array.from({ length: 6 }, (x, j) => ({ label: 'A fairly long page title number ' + j, num: j + 1, keys: ['k' + i + j] })) });
        const r = _tocLayout(tocPg.toc, many);
        if (r.parts.length < 2) throw new Error('no second page: ' + r.parts.length);
        const all = r.parts.reduce((a, x) => a.concat(x), []);
        if (all.filter(e => e._toc === 'entry').length !== 54) throw new Error('lines dropped: ' + all.filter(e => e._toc === 'entry').length);
        if (all.some(e => e.type === 'text' && e.size !== (e._toc === 'title' ? tocPg.toc.title.size : tocPg.toc.entry.size))) throw new Error('type was resized');
        all.filter(e => e.type === 'text').forEach(e => { const bt = e.y + e.text.split('\\n').length * e.size * TOC_LEADING; if (bt > tocPg.toc.bottom + 1e-6) throw new Error(e.text + ' runs to ' + bt); });
      });
      __check('a section taller than a column breaks between lines and carries its title on', () => {
        const big = { sections: [{ title: 'Level 1', entries: Array.from({ length: 60 }, (x, j) => ({ label: 'Wall ' + j, num: j + 1, keys: ['w' + j] })) }] };
        const r = _tocLayout(tocPg.toc, big);
        const titles = r.parts.reduce((a, x) => a.concat(x), []).filter(e => e._toc === 'title').map(e => e.text);
        if (titles[0] !== 'Level 1' || !titles.slice(1).length || titles.slice(1).some(t => t.split('\\n').join(' ') !== 'Level 1 (continued)')) throw new Error(titles.join(' | '));
      });
      // Integration: a real deck that overflows gets a real second Contents page.
      const many = []; for (let i = 1; i <= 70; i++) many.push(row('ART.' + i, { location: 'Room ' + i }));
      const rows0 = dashProjectData; dashProjectData = many;
      _dsPages = _deckPageList();
      const keysNow = _dsPages.map(_deckPageKey);
      __check('a long deck adds a real continued Contents page right after the first', () => {
        const parts = _tocPartsOf('pgtoc');
        if (!parts.length) throw new Error('no continuation page');
        if (keysNow[keysNow.indexOf('layout:pgtoc') + 1] !== 'layout:' + parts[0].id) throw new Error('not next to the first page: ' + keysNow.slice(0, 6).join(', '));
        if (_dsPageMovable(_dsPages[keysNow.indexOf('layout:' + parts[0].id)])) throw new Error('the continued page can be moved away');
        if (!parts[0].elements.some(e => !e._toc && e.text === 'CONTENTS')) throw new Error('continued page lost the heading');
        const m = _tocModel(_dsPages);
        m.sections.forEach(sec => sec.entries.forEach(e => { const n = keysNow.indexOf(e.keys[0]) + 1; if (e.num !== n) throw new Error(e.label + ' says ' + e.num + ', page is ' + n); }));
        const lines = [tocPg].concat(parts).reduce((a, p) => a.concat(p.elements.filter(e => e._toc === 'entry')), []);
        if (lines.length !== m.sections.reduce((a, x) => a + x.entries.length, 0)) throw new Error('lines missing across pages');
      });
      dashProjectData = rows0;
      _dsPages = _deckPageList();
      __check('it goes away when the contents fits on one page again', () => {
        if (_tocPartsOf('pgtoc').length) throw new Error('continued page left behind');
        if (_dsPages.some(d => d.page && d.page._tocPartOf)) throw new Error('still in the page list');
      });
      // 18.72: the template APPLIED to a Custom page (what a designer actually did)
      // left the page Custom, so nothing filled it in.
      const custom = { id: 'pgcustom', type: 'custom', title: 'New Page', elements: _cloneData(mt.elements), afterKey: 'fixed:narrative' };
      editorialContent.layoutPages.push(custom);
      editorialContent.annotations['layout:pgcustom'] = _cloneData(mt.annotations);
      _deckPageList();
      __check('EXACT BUG: a Custom page carrying the Contents template fills itself in', () => {
        if (custom.type !== 'toc') throw new Error('page left as ' + custom.type);
        if (custom.elements.some(e => !e._toc && /Section Title|Page Title/.test(e.text || ''))) throw new Error('placeholders left on the page');
        if (!custom.elements.some(e => e._toc === 'entry')) throw new Error('no outline written');
      });
      editorialContent.layoutPages.pop();
      const blank = { id: 'pgblank', type: 'custom', title: 'Blank', elements: [], afterKey: 'fixed:narrative' };
      editorialContent.layoutPages.push(blank);
      _dsPages = _deckPageList(); _dsIndex = _dsPages.findIndex(d => _deckPageKey(d) === 'layout:pgblank');
      await _dsApplyTemplateToCurrentPage({ source: 'master', mi: IDML_MASTER_TEMPLATES.indexOf(mt), name: 'Contents (Full)' });
      _deckPageList();
      __check('applying the Contents template to a page makes it a contents page', () => {
        if (blank.type !== 'toc') throw new Error('type ' + blank.type);
        if (!blank.elements.some(e => e._toc === 'entry')) throw new Error('not filled in');
      });
      const div = IDML_MASTER_TEMPLATES.find(t => t.type === 'breaker');
      _askYesNo = async () => true;
      blank.elements = []; delete editorialContent.annotations['layout:pgblank'];
      _dsPages = _deckPageList(); _dsIndex = _dsPages.findIndex(d => _deckPageKey(d) === 'layout:pgblank');
      await _dsApplyTemplateToCurrentPage({ source: 'master', mi: IDML_MASTER_TEMPLATES.indexOf(div), name: 'Divider' });
      __check('applying another template to a contents page makes it that page again', () => {
        if (blank.type !== 'breaker') throw new Error('type ' + blank.type);
        if (blank.toc) throw new Error('old contents grid kept');
        if (blank.elements.some(e => e._toc)) throw new Error('outline left on the divider');
      });
      editorialContent.layoutPages.pop();

      // 18.73: a blank page added to the deck printed as "Page" in the contents.
      const b1 = { id: 'pgb1', type: 'custom', title: 'New Page', elements: [], afterKey: 'fixed:narrative' };
      const h1 = { id: 'pgh1', type: 'moodboard', title: 'Mood', elements: [{ type: 'text', text: 'MATERIALS AND MOOD', x: .05, y: .1, w: .5, size: .06 }], afterKey: 'pgb1' };
      h1.afterKey = 'layout:pgb1';
      editorialContent.layoutPages.push(b1, h1);
      _dsPages = _deckPageList();
      __check('EXACT BUG: a blank page stays out of the contents until it is ticked in', () => {
        if (texts('entry').some(t => t === 'Page')) throw new Error('blank page listed: ' + texts('entry').join(' | '));
        if (texts('entry').indexOf('Materials and Mood') < 0) throw new Error('a page with a heading should still be listed');
        setTocOverride(['layout:pgb1'], 'hide', false);
        _dsPages = _deckPageList();
        if (!texts('entry').some(t => t === 'Custom' || t === 'Page')) throw new Error('ticked-in blank page not listed: ' + texts('entry').join(' | '));
        if (!(editorialContent.tocOverrides['layout:pgb1'] || {}).show) throw new Error('should be stored as show, the page starts out');
        setTocOverride(['layout:pgb1'], 'hide', true);
        if (editorialContent.tocOverrides['layout:pgb1']) throw new Error('back to default should leave no record');
      });
      __check('any layout page can start a section, and stop being one', () => {
        setTocOverride(['layout:pgh1'], 'section', true);
        _dsPages = _deckPageList();
        if (texts('title').indexOf('Materials and Mood') < 0) throw new Error('not a section: ' + texts('title').join(' | '));
        setTocOverride(['layout:pgdiv'], 'section', false);
        _dsPages = _deckPageList();
        if (texts('title').indexOf('The Art of the Lobby') >= 0) throw new Error('divider still a section');
        if (texts('entry').indexOf('The Art of the Lobby') < 0) throw new Error('a divider that is not a section lists as a page');
        setTocOverride(['layout:pgdiv'], 'section', true); setTocOverride(['layout:pgh1'], 'section', false);
        if (editorialContent.tocOverrides['layout:pgdiv'] || editorialContent.tocOverrides['layout:pgh1']) throw new Error('defaults left records');
      });
      __check('every page panel offers the tick while there is a contents page', () => {
        _dsPages = _deckPageList();
        const host = document.createElement('div');
        _tocPageInto(host, _dsPages.find(d => _deckPageKey(d) === 'layout:pgb1'));
        const labels = Array.from(host.querySelectorAll('label')).map(l => l.textContent);
        if (labels.join('|') !== 'In contents|Starts a section') throw new Error(labels.join('|'));
        if (host.querySelector('input').checked) throw new Error('blank page shows as in');
        const h2 = document.createElement('div');
        _tocPageInto(h2, _dsPages.find(d => _deckPageKey(d) === 'fixed:understanding'));
        if (h2.querySelectorAll('input').length !== 1 || !h2.querySelector('input').checked) throw new Error('fixed page tick wrong');
        const h3 = document.createElement('div');
        _tocPageInto(h3, _dsPages.find(d => _deckPageKey(d) === 'layout:pgtoc'));
        if (h3.children.length) throw new Error('the contents page offers to list itself');
        const live = S.slice(S.indexOf('function _dsRenderTools()'), S.indexOf('_dsPageAppearanceInto(t, desc);', S.indexOf('function _dsRenderTools()')));
        if (live.indexOf('_tocPageInto(t, desc)') < 0) throw new Error('not wired into the page panel');
      });
      editorialContent.layoutPages = editorialContent.layoutPages.filter(p => p !== b1 && p !== h1);
      __check('a wall named with its own code prints the name once', () => {
        const nm0 = elevations[0].name; elevations[0].name = 'ART.3 LOBBY';
        const lab = _tocAutoLabel({ kind: 'spec', _install: true, title: 'ART.3', _elevIdx: 0 });
        elevations[0].name = nm0;
        if (lab !== 'ART.3 LOBBY') throw new Error(lab);
      });

      // 18.75: runs split where the location changes.
      dashProjectData[1].location = 'Corridor';
      _dsPages = _deckPageList();
      __check('a run of spec pages splits where the location changes and is named by it', () => {
        const ents = texts('entry');
        ['Lobby: ART.1', 'Corridor: ART.2', 'Lobby: ART.3A \\u2013 ART.3B'].forEach(w => { if (ents.indexOf(w) < 0) throw new Error('missing ' + w + ' in ' + ents.join(' | ')); });
      });
      dashProjectData[1].location = 'Lobby';
      __check('pieces with no location keep the Artwork wording', () => {
        if (_tocRunLabel('', 'ART.1', 'ART.4') !== 'Artwork ART.1 \\u2013 ART.4') throw new Error(_tocRunLabel('', 'ART.1', 'ART.4'));
      });
      // 18.75: template filler is flagged.
      const phDiv = { id: 'pgph', type: 'breaker', elements: _cloneData(divider.elements), afterKey: 'fixed:understanding' };
      const phMood = { id: 'pgph2', type: 'moodboard', elements: [{ type: 'text', text: 'SECTION HEADING', x: .05, y: .1, w: .5, size: .06 }], afterKey: 'layout:pgph' };
      const okMood = { id: 'pgok', type: 'moodboard', elements: [{ type: 'text', text: 'INSPIRATION', x: .05, y: .1, w: .5, size: .06 }], afterKey: 'layout:pgph2' };
      editorialContent.layoutPages.push(phDiv, phMood, okMood);
      _dsPages = _deckPageList();
      __check('a divider or page still reading as template filler is flagged; a real heading is not', () => {
        const m = _tocModel(_dsPages);
        const sec = m.sections.find(x => x.divKey === 'layout:pgph');
        if (!sec || !sec.ph) throw new Error('placeholder divider not flagged: ' + JSON.stringify(sec && sec.title));
        const all = m.sections.reduce((a, x) => a.concat(x.entries), []);
        const e1 = all.find(e => e.keys[0] === 'layout:pgph2'), e2 = all.find(e => e.keys[0] === 'layout:pgok');
        if (!e1 || !e1.ph) throw new Error('SECTION HEADING page not flagged');
        if (!e2 || e2.ph) throw new Error('INSPIRATION flagged as a placeholder');
        setTocOverride(['layout:pgph2'], 'label', 'Material Palette');
        const e3 = _tocModel(_deckPageList()).sections.reduce((a, x) => a.concat(x.entries), []).find(e => e.keys[0] === 'layout:pgph2');
        if (e3.ph) throw new Error('a typed name is still flagged');
        setTocOverride(['layout:pgph2'], 'label', '');
      });
      __check('Preflight lists the placeholders with a jump to each page', () => {
        _dsPages = _deckPageList();
        const iss = _dsRunPreflight().filter(x => x.text.indexOf('Contents') === 0);
        if (iss.length !== 2) throw new Error(iss.length + ': ' + iss.map(x => x.text).join(' / '));
        const ks = iss.map(x => _deckPageKey(_dsPages[x.idx])).sort().join(',');
        if (ks !== 'layout:pgph,layout:pgph2') throw new Error(ks);
      });
      __check('the contents panel marks them', () => {
        const host = document.createElement('div'); _dsPages = _deckPageList(); _tocPanelInto(host);
        if (host.querySelectorAll('.toc-ph').length !== 2) throw new Error(host.querySelectorAll('.toc-ph').length + ' marked');
      });
      editorialContent.layoutPages = editorialContent.layoutPages.filter(p => p !== phDiv && p !== phMood && p !== okMood);
      // 18.75: the rail numbers pages as printed.
      __check('the rail numbers pages the way the PDF does when a card spans two pages', () => {
        _dsPages = _deckPageList();
        const iFr = 3;
        const o = _deckPageSpan;
        _deckPageSpan = (d) => (_dsPages.indexOf(d) === iFr ? 2 : 1);
        _dsPnCache = { pages: null, sig: null, starts: [] };
        try {
          if (_dsPrintedLabel(iFr) !== (iFr + 1) + '\\u2013' + (iFr + 2)) throw new Error('span label ' + _dsPrintedLabel(iFr));
          if (_dsPrintedLabel(iFr + 1) !== String(iFr + 3)) throw new Error('after the span: ' + _dsPrintedLabel(iFr + 1));
          if (_dsIndexForPrinted(iFr + 2) !== iFr || _dsIndexForPrinted(iFr + 3) !== iFr + 1) throw new Error('printed number to position wrong');
        } finally { _deckPageSpan = o; _dsPnCache = { pages: null, sig: null, starts: [] }; }
        const R = S.slice(S.indexOf('function _dsRenderRail'), S.indexOf('\\nfunction ', S.indexOf('function _dsRenderRail') + 10));
        if (R.indexOf("txt.textContent = (i + 1)") >= 0 || R.indexOf('_dsPrintedLabel(i)') < 0) throw new Error('rail label still counts positions');
      });

      // 18.77: section links, contents type, rename at the source.
      _dsPages = _deckPageList();
      __check('a section title links to its divider; a made-up section to its first line', () => {
        const ts = gen().filter(e => e._toc === 'title');
        const div = ts.find(e => e.text.split('\\n').join(' ') === 'The Art of the Lobby');
        const intro = ts.find(e => e.text === 'Introduction');
        const keys = _dsPages.map(_deckPageKey);
        if (!div || div._tocKey !== 'layout:pgdiv' || div._tocPage !== keys.indexOf('layout:pgdiv') + 1) throw new Error('divider link ' + JSON.stringify(div && [div._tocKey, div._tocPage]));
        const first = _tocModel(_dsPages).sections[0].entries[0];
        if (!intro || intro._tocKey !== first.keys[0] || intro._tocPage !== first.num) throw new Error('Introduction link ' + JSON.stringify(intro && [intro._tocKey, intro._tocPage]));
      });
      __check('the contents type is set on the page, reaches every line, and resets to the template', () => {
        const t0 = _cloneData(tocPg.toc.title);
        _tocSetType(tocPg, 'title', 'size', 20);
        _tocSetType(tocPg, 'entry', 'color', '#e00000');
        _dsPages = _deckPageList();
        if (gen().filter(e => e._toc === 'title').some(e => Math.abs(e.size * 540 - 20) > 0.01)) throw new Error('title size not applied');
        if (gen().filter(e => e._toc === 'entry' || e._toc === 'num').some(e => e.color !== '#e00000')) throw new Error('line colour not applied');
        const host = document.createElement('div'); _tocPanelInto(host, _dsPages.find(d => _deckPageKey(d) === 'layout:pgtoc'));
        if (!host.querySelector('.toc-type-reset')) throw new Error('no reset offered after a change');
        _tocResetType(tocPg);
        _dsPages = _deckPageList();
        if (JSON.stringify(tocPg.toc.title) !== JSON.stringify(t0) || tocPg.toc.base) throw new Error('reset did not restore the template type');
      });
      __check('a renamed line can rename the page itself, and then needs no override', () => {
        setTocOverride(['layout:pgdiv'], 'label', 'Lobby Collection');
        _dsPages = _deckPageList();
        const host = document.createElement('div'); _tocPanelInto(host, _dsPages.find(d => _deckPageKey(d) === 'layout:pgtoc'));
        if (!host.querySelector('.toc-src')) throw new Error('no Page button beside the renamed section');
        if (!_tocRenameSource('layout:pgdiv')) throw new Error('rename refused');
        const pg = editorialContent.layoutPages.find(p => p.id === 'pgdiv');
        if (!pg.elements.some(e => e.text === 'LOBBY COLLECTION')) throw new Error('heading not rewritten (caps kept): ' + pg.elements.map(e => e.text).join(' / '));
        if ((editorialContent.tocOverrides['layout:pgdiv'] || {}).label) throw new Error('override left behind');
        _dsPages = _deckPageList();
        if (texts('title').indexOf('Lobby Collection') < 0) throw new Error('contents does not read the new heading: ' + texts('title').join(' | '));
        pg.elements.forEach(e => { if (e.text === 'LOBBY COLLECTION') e.text = 'THE ART OF THE LOBBY'; });
        _dsPages = _deckPageList();
      });
      __check('a fixed page cannot be renamed at the source (its heading is not a layout box)', () => {
        if (_tocCanRenameSource('fixed:understanding')) throw new Error('offered on a fixed page');
      });

      // 18.78: automatic title width, auto ink, style toggles, rules, numbers, spacing.
      __check('EXACT BUG: a long section title widens its column instead of stacking', () => {
        const m = { sections: [{ title: 'Environmental Graphic Design', entries: [{ label: 'Lobby: EGD.1 \\u2013 EGD.4', num: 26, keys: ['a'] }] }] };
        const cfg = _cloneData(tocPg.toc); cfg.title.size = 18 / 540;
        const t = _tocLayout(cfg, m).els.find(e => e._toc === 'title');
        if (t.text.indexOf('\\n') >= 0) throw new Error('still stacks: ' + JSON.stringify(t.text));
        const en = _tocLayout(cfg, m).els.find(e => e._toc === 'entry');
        if (en.x < t.x + _tocTextW(t.text, 18) / 936) throw new Error('lines overlap the title');
        if (en.text.indexOf('\\n') >= 0) throw new Error('the lines were squeezed into wrapping');
      });
      __check('a title too long even then still wraps, and the lines keep their room', () => {
        const m = { sections: [{ title: 'An Extraordinarily Long Section Title That Cannot Possibly Fit On One Line', entries: [{ label: 'A page with quite a long name here', num: 3, keys: ['a'] }] }] };
        const L = _tocLayout(tocPg.toc, m).els;
        if (L.find(e => e._toc === 'title').text.indexOf('\\n') < 0) throw new Error('did not wrap');
        if (L.find(e => e._toc === 'entry').text.indexOf('\\n') >= 0) throw new Error('lines lost their width to the title');
      });
      __check('a dark background sets the contents white with light rules; a chosen colour wins', () => {
        editorialContent.pageThemes = editorialContent.pageThemes || {};
        editorialContent.pageThemes['layout:pgtoc'] = { bgStops: [{ c: '#002a5c', p: 0 }, { c: '#3d6fa8', p: 1 }] };
        _dsPages = _deckPageList();
        if (gen().filter(e => e.type === 'text').some(e => e.color !== '#ffffff')) throw new Error('not white on a dark gradient');
        if (gen().filter(e => e._toc === 'rule').some(e => e.color !== '#e4e7ec')) throw new Error('rules not light');
        _tocSetType(tocPg, 'entry', 'color', '#ffd400');
        _dsPages = _deckPageList();
        if (gen().filter(e => e._toc === 'entry').some(e => e.color !== '#ffd400')) throw new Error('chosen colour overridden');
        if (gen().filter(e => e._toc === 'title').some(e => e.color !== '#ffffff')) throw new Error('titles lost auto ink');
        _tocResetType(tocPg); delete editorialContent.pageThemes['layout:pgtoc'];
        _dsPages = _deckPageList();
        if (gen().find(e => e._toc === 'entry').color === '#ffffff') throw new Error('stayed white on a light page');
      });
      __check('bold, italic and caps reach the printed lines', () => {
        _tocSetType(tocPg, 'title', 'bold', true); _tocSetType(tocPg, 'title', 'caps', true); _tocSetType(tocPg, 'entry', 'italic', true);
        _dsPages = _deckPageList();
        const t = gen().find(e => e._toc === 'title'), en = gen().find(e => e._toc === 'entry');
        if (!t.bold || t.weight !== 700) throw new Error('title not bold');
        if (t.text !== t.text.toUpperCase()) throw new Error('title not caps: ' + t.text);
        if (!en.italic || en.bold) throw new Error('lines style wrong');
        _tocResetType(tocPg); _dsPages = _deckPageList();
        if (gen().find(e => e._toc === 'title').bold) throw new Error('reset kept bold');
      });
      __check('rules can be switched off; numbers can take their own colour', () => {
        _tocSetOpt(tocPg, 'ruleOff', true); _tocSetOpt(tocPg, 'numColor', '#888888');
        _dsPages = _deckPageList();
        if (gen().some(e => e._toc === 'rule')) throw new Error('rules still drawn');
        if (gen().filter(e => e._toc === 'num').some(e => e.color !== '#888888')) throw new Error('number colour not applied');
        if (gen().filter(e => e._toc === 'entry').some(e => e.color === '#888888')) throw new Error('lines took the number colour');
        _tocResetType(tocPg); _dsPages = _deckPageList();
        if (!gen().some(e => e._toc === 'rule')) throw new Error('reset did not bring rules back');
      });
      __check('Even spacing stacks sections at one gap instead of the template rows', () => {
        const m = { sections: [{ title: 'A', entries: [{ label: 'x', num: 1, keys: ['a'] }] }, { title: 'B', entries: [{ label: 'y', num: 2, keys: ['b'] }] }] };
        const cfg = _cloneData(tocPg.toc);
        const yGrid = _tocLayout(cfg, m).els.filter(e => e._toc === 'title')[1].y;
        cfg.even = true;
        const yEven = _tocLayout(cfg, m).els.filter(e => e._toc === 'title')[1].y;
        if (Math.abs(yGrid - (cfg.top + cfg.pitch)) > 1e-6) throw new Error('grid row not used: ' + yGrid);
        if (!(yEven < yGrid)) throw new Error('even did not tighten: ' + yEven + ' vs ' + yGrid);
      });
      __check('the panel offers the new controls', () => {
        _dsPages = _deckPageList();
        const host = document.createElement('div'); _tocPanelInto(host, _dsPages.find(d => _deckPageKey(d) === 'layout:pgtoc'));
        const labels = Array.from(host.querySelectorAll('.toc-opt-row')).map(r => r.firstChild.textContent).join('|');
        if (labels !== 'Titles|Lines|Rules|Spacing') throw new Error(labels);
        const btns = Array.from(host.querySelectorAll('.toc-opt-row button')).map(b => b.textContent).join(',');
        if (btns.indexOf('B,I,AA') !== 0) throw new Error(btns);
      });

      // THE EXPORT prints the generated page, not the old flat list.
      pages = _deckPageList();
      const tocNum = pages.map(_deckPageKey).indexOf('layout:pgtoc') + 1;
      let err = null;
      try { await _buildSpecPagePDF({ all: true, include: _dsInclude(), meta: {}, preview: true }); } catch (e) { err = e; }
      __check('the export ran with a contents page in it', () => {
        if (err) throw new Error('threw: ' + (err.stack || err.message || err));
        if (!shown) throw new Error('no document');
      });
      __check('EXACT BUG: the PDF contents page is the template layout with the real outline', () => {
        const ops = shown.internal.pages[tocNum].join('\\n');
        // The rich-text engine sets one word per text op.
        const has = (w) => ops.indexOf('(' + w + ') Tj') >= 0;
        ['Lobby', 'Introduction', 'Understanding', String(pages.map(_deckPageKey).indexOf('fixed:understanding') + 1)].forEach(w => { if (!has(w)) throw new Error('"' + w + '" not printed on page ' + tocNum); });
        if (has('Section') || has('Title') || ops.indexOf('(#)') >= 0) throw new Error('template placeholder printed');
      });
      __check('every contents line links to its page in the PDF', () => {
        const ann = (shown.internal.getPageInfo(tocNum).pageContext.annotations || []).filter(a => a.type === 'link' && a.options && a.options.pageNumber);
        const want = gen().filter(e => e._toc === 'entry');
        // 18.77: section titles link too.
        const titles = gen().filter(e => e._toc === 'title');
        if (!want.length || ann.length !== want.length * 2 + titles.length) throw new Error(ann.length + ' links for ' + want.length + ' lines (number + label each) and ' + titles.length + ' titles');
        const iU = pages.map(_deckPageKey).indexOf('fixed:understanding') + 1;
        if (!ann.some(a => a.options.pageNumber === iU)) throw new Error('no link to Project Understanding on page ' + iU);
        if (ann.some(a => a.options.pageNumber < 1 || a.options.pageNumber > shown.getNumberOfPages())) throw new Error('a link points past the document');
      });
      __check('clicking a contents line in Deck Studio opens that page', () => {
        _dsPages = _deckPageList(); _dsIndex = 0;
        const e = gen().find(x => x._toc === 'entry' && x._tocKey === 'fixed:understanding');
        if (!e) throw new Error('line carries no target');
        _tocGoTo(e._tocKey);
        if (_deckPageKey(_dsPages[_dsIndex]) !== 'fixed:understanding') throw new Error('landed on ' + _deckPageKey(_dsPages[_dsIndex]));
        const a = S.indexOf('function renderMoodboardCanvas()');
        const body = S.slice(a, S.indexOf('_mbPinChrome(canvas);', a));
        if (body.indexOf('_tocGoTo(t._tocKey)') < 0) throw new Error('editor lines are not wired to _tocGoTo');
      });
    })();
    __check('one contents path: the old flat drawer and its list are gone', () => {
      ['function _drawTOCPage', 'function _deckTocList', 'function _tocLabelFor'].forEach(n => { if (S.indexOf(n) >= 0) throw new Error(n + ' is back'); });
      const a = S.indexOf('async function _buildSpecPagePDF');
      const body = S.slice(a, S.indexOf('\\nasync function exportDashNativePNG', a));
      if (body.indexOf("desc.page.type === 'toc'") >= 0) throw new Error('the export reserves contents pages for a post-pass again');
      if (body.indexOf('_tocSyncAll(pages, _span)') < 0) throw new Error('the export does not resync with the real Frame Recommendations span');
    });
    __check('generated lines take no pointer in the editor', () => {
      const a = S.indexOf('function renderMoodboardCanvas()');
      const body = S.slice(a, S.indexOf('_mbPinChrome(canvas);', a));
      if (body.split('if (t._toc)').length - 1 < 2) throw new Error('text boxes and rules must both opt out');
    });
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
    await window.__run;
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
