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
        if (ents.indexOf('Artwork ART.1 \\u2013 ART.3B') < 0) throw new Error('spec run not collapsed: ' + ents);
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
        if (titles !== 'Introduction | The Art of the Lobby') throw new Error(titles);
        if (texts('entry').join(' | ').indexOf('Divider') >= 0) throw new Error('the divider listed itself');
      });

      // Overrides: leave one out, rename another.
      const m0 = _tocModel(pages);
      const art = m0.sections[1].entries.find(e => /^Artwork/.test(e.label));
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
        if (texts('entry').some(t => /^Artwork .*ART\\.3/.test(t))) throw new Error('spec pages of the wall listed separately: ' + ents);
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

      __check('a deck too long for the page shrinks the type and nothing runs past the bottom', () => {
        const many = { sections: [] };
        for (let i = 0; i < 9; i++) many.sections.push({ title: 'Section ' + i, entries: Array.from({ length: 6 }, (x, j) => ({ label: 'A fairly long page title number ' + j, num: j + 1 })) });
        const r = _tocLayout(tocPg.toc, many);
        if (!(r.scale < 1)) throw new Error('type did not shrink');
        r.els.filter(e => e.type === 'text' && e._toc !== 'more').forEach(e => {
          const bottom = e.y + e.text.split('\\n').length * e.size * TOC_LEADING;
          if (bottom > tocPg.toc.bottom + 1e-6) throw new Error(e.text + ' runs to ' + bottom);
        });
        const way = { sections: [] };
        for (let i = 0; i < 30; i++) way.sections.push({ title: 'S' + i, entries: Array.from({ length: 8 }, (x, j) => ({ label: 'Page ' + j, num: j })) });
        const r2 = _tocLayout(tocPg.toc, way);
        if (!r2.dropped || r2.els.filter(e => e._toc === 'more').length !== 1) throw new Error('overflow not reported: dropped ' + r2.dropped);
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
