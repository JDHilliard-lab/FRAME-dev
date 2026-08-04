// Three reported things, one change.
//
// 1. "In Deck Studio, Project, in the Include pages... I need to take away the
//    edit options for the pages that have it. It no longer is connected to
//    anything, so if you edited nothing would happen." Cover / Art Narrative /
//    Good Art Good People / Thank You each carried a pencil button wired to
//    openFixedPageEditor / openContactsEditor. Those pages are edited in Deck
//    Studio now, so the buttons were a control that produces no result — the
//    project's own rule says remove it, don't leave it non-functional.
//
// 2. "I created a project and used some of the templates to make the pages of
//    the narrative and project understanding pages. Make that the default for
//    when someone new starts a new project." Every new deck opened with five
//    blank fixed pages and no layout page, so the same build-out was done by
//    hand every time. _starterDeck() is that deck, from
//    .claude/references/Concept.json.
//
// 3. "Make a note in my process and timeline settings: I had to [set] Artwork
//    Selection approval stem straight up from pill, and Procurement approval
//    stem on the line before the pill." Those are timelineStemPos entries, and
//    they only mean anything alongside the default timeline string — so they
//    ship together, and this file pins them to the STAGE LABEL, not the index.
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
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const S = window.__appSrc, H = window.__appHtml;
    scheduleAutosave = () => {};

    // ── 1. The dead edit buttons ──
    __check('EXACT BUG: no page in the Include pages list offers an edit button that does nothing', () => {
      const list = document.getElementById('specInc_cover');
      if (!list) throw new Error('#specInc_cover is gone — the include list itself moved');
      const box = list.closest('div');
      const btns = box.querySelectorAll('button');
      if (btns.length) {
        const which = Array.from(btns).map(b => b.getAttribute('onclick') || b.title).join(', ');
        throw new Error('THE BUG: ' + btns.length + ' edit button(s) still in the include list (' + which + ') — clicking one edits a page nobody sees');
      }
    });

    __check('every include row still has its checkbox, so removing the buttons cost no function', () => {
      ['cover', 'timeline', 'understanding', 'narrative', 'strategy', 'moodboard',
       'frameRec', 'floorplanKey', 'spec', 'slogan', 'contacts'].forEach(k => {
        const cb = document.getElementById('specInc_' + k);
        if (!cb) throw new Error('specInc_' + k + ' disappeared with the buttons');
        if (cb.type !== 'checkbox') throw new Error('specInc_' + k + ' is no longer a checkbox');
      });
    });

    __check('nothing in the markup calls openFixedPageEditor any more', () => {
      if (/openFixedPageEditor\\(/.test(H)) throw new Error('index.html still wires openFixedPageEditor somewhere');
      if (/onclick="openContactsEditor\\(\\)"[^>]*>[\\s\\S]{0,80}?Thank You/.test(H)) throw new Error('the Thank You row still opens the contacts editor');
    });

    __check('contacts are still editable from Deck Studio, so the row losing its pencil is not a loss', () => {
      if (S.indexOf("addBtn('Edit contacts'") < 0) throw new Error('the Deck Studio Edit contacts button went with it — now contacts are unreachable');
    });

    // ── 2. The starter deck ──
    __check('EXACT REQUEST: a new project opens with the built-out pages, not five blank ones', () => {
      const d = _editorialDefaults();
      [['coverPage', 3], ['understandingPage', 4], ['narrativePage', 4], ['strategyPage', 5], ['sloganPage', 1]].forEach(([k, n]) => {
        const els = (d[k] || {}).elements;
        if (!Array.isArray(els) || !els.length) throw new Error('THE REQUEST: ' + k + ' is still empty in a new project');
        if (els.length !== n) throw new Error(k + ' has ' + els.length + ' elements, expected ' + n + ' — the Concept.json layout changed shape');
      });
      if (!Array.isArray(d.layoutPages) || d.layoutPages.length !== 1) throw new Error('the moodboard layout page is missing from the default');
    });

    __check('a cold boot IS a new project, so the live editorialContent starts from the same defaults', () => {
      // It used to be a second literal beside _editorialDefaults(); the two drift.
      if (!((editorialContent.coverPage || {}).elements || []).length) throw new Error('the boot-time editorialContent is still the old empty literal, so only LOADED projects get the starter deck');
      if (S.indexOf('let editorialContent = _editorialDefaults();') < 0) throw new Error('editorialContent is seeded from its own literal again');
    });

    __check('the headline distinguishes Project Understanding from the Art Narrative', () => {
      const d = _editorialDefaults();
      const head = (p) => (((d[p] || {}).elements || [])[0] || {}).text;
      if (head('understandingPage') !== 'PROJECT UNDERSTANDING') throw new Error('understanding page headline is ' + JSON.stringify(head('understandingPage')));
      if (head('narrativePage') !== 'SECTION HEADING') throw new Error('narrative page headline is ' + JSON.stringify(head('narrativePage')));
      // Same layout otherwise — they are one helper, so a drift here means it forked.
      const shape = (p) => ((d[p] || {}).elements || []).map(e => e.styleId || e.font).join('|');
      if (shape('understandingPage') !== shape('narrativePage')) throw new Error('the two narrative-style pages no longer share a layout');
    });

    __check('the grey placeholder blocks land on the pages they were drawn for', () => {
      const d = _editorialDefaults();
      const a = d.annotations || {};
      ['fixed:understanding', 'fixed:narrative', 'fixed:strategy'].forEach(k => {
        if (!Array.isArray(a[k]) || !a[k].length) throw new Error('no placeholder art on ' + k);
      });
      if (a['fixed:strategy'].length !== 3) throw new Error('the strategy page wants one block per tier; got ' + a['fixed:strategy'].length);
      // The layout page's annotations are keyed by its ID. A generated id would
      // orphan all twelve blocks with no error — the page would just come up bare.
      const id = d.layoutPages[0].id;
      const key = 'layout:' + id;
      if (!Array.isArray(a[key]) || a[key].length !== 12) throw new Error('the moodboard placeholders are not keyed to the page id (' + id + '), so they render nowhere');
    });

    __check('two new projects do not share one element array', () => {
      // Object.assign copies references. If _starterDeck were a constant, editing
      // project A's cover would rewrite project B's.
      const a = _editorialDefaults(), b = _editorialDefaults();
      if (a.coverPage.elements === b.coverPage.elements) throw new Error('the starter deck hands out the SAME array twice — one project edits another');
      if (a.annotations['fixed:strategy'] === b.annotations['fixed:strategy']) throw new Error('the placeholder annotations are shared between projects');
      a.coverPage.elements[0].text = 'MUTATED';
      if (b.coverPage.elements[0].text === 'MUTATED') throw new Error('editing one project reached into another');
    });

    __check('a loaded project still wins over the starter deck', () => {
      // A deck whose cover was emptied on purpose must stay empty on reload, and
      // must not have starter pages spliced in beside its own.
      const loaded = Object.assign(_editorialDefaults(), { coverPage: { elements: [] }, layoutPages: [] });
      if (loaded.coverPage.elements.length) throw new Error('a deliberately empty cover came back with the starter layout');
      if (loaded.layoutPages.length) throw new Error('a project with no layout pages had one reinstated');
      if (S.indexOf('Object.assign(_editorialDefaults(), data.editorial || {})') < 0) throw new Error('the load path no longer merges the project OVER the defaults');
    });

    __check('_mbMigratePages leaves the starter pages alone', () => {
      editorialContent = _editorialDefaults();
      const before = editorialContent.layoutPages.length;
      const id = editorialContent.layoutPages[0].id;
      _mbMigratePages();
      if (editorialContent.layoutPages.length !== before) throw new Error('the migration seeded a second layout page on top of the starter one');
      if (editorialContent.layoutPages[0].id !== id) throw new Error('the migration reassigned the page id, orphaning its 12 placeholder blocks');
      if (!editorialContent.coverPage.elements.length) throw new Error('the migration reset the starter cover to empty');
    });

    // ── 3. Process & timeline: the stem placements ──
    __check('EXACT REQUEST: Artwork Selection stems straight up from the pill, Procurement stems before it', () => {
      editorialContent = _editorialDefaults();
      const stages = _timelineStages();
      const at = (needle) => stages.findIndex(s => (s.label || '').toLowerCase().indexOf(needle) >= 0);
      const art = at('artwork selection'), proc = at('procurement');
      if (art < 0) throw new Error('the default timeline no longer has an Artwork Selection stage');
      if (proc < 0) throw new Error('the default timeline no longer has a Procurement stage');
      // Pinned by LABEL: timelineStemPos is keyed by index, so reordering the
      // default stages silently moves these onto the wrong ones.
      if (_tlStemPos(art) !== 'pill') throw new Error('Artwork Selection stem is "' + _tlStemPos(art) + '", expected "pill" (straight up from the pill)');
      if (_tlStemPos(proc) !== 'before') throw new Error('Procurement stem is "' + _tlStemPos(proc) + '", expected "before" (on the line, before the pill)');
    });

    __check('the stages those stems belong to actually carry approvals', () => {
      editorialContent = _editorialDefaults();
      const stages = _timelineStages();
      // The stem control only renders when a stage has milestones. A default stem
      // on a stage with none is a setting the user can never see or undo.
      Object.keys(editorialContent.timelineStemPos || {}).forEach(i => {
        const s = stages[i];
        if (!s) throw new Error('timelineStemPos[' + i + '] points past the end of the default timeline');
        if (!(s.milestones || []).length) throw new Error('stage ' + i + ' ("' + s.label + '") has a stem default but no approvals, so the control never appears');
      });
    });

    __check('every default stage survives the string round trip', () => {
      editorialContent = _editorialDefaults();
      const stages = _timelineStages();
      if (stages.length !== 5) throw new Error('expected 5 default stages; got ' + stages.length);
      const labels = stages.map(s => s.label).join(' / ');
      ['Discovery', 'Concept', 'Artwork Selection', 'Procurement', 'Install'].forEach(w => {
        if (labels.indexOf(w) < 0) throw new Error('missing the ' + w + ' stage: ' + labels);
      });
      if ((stages[3].milestones || []).length !== 3) throw new Error('Procurement should carry three approvals; got ' + (stages[3].milestones || []).length);
    });

    __check('the Project tab textarea shows the default timeline instead of a placeholder', () => {
      editorialContent = _editorialDefaults();
      _specPdfPrefill();
      const ta = document.getElementById('specPdfTimeline');
      if (!ta) throw new Error('#specPdfTimeline is gone');
      if (!ta.value || ta.value.indexOf('Procurement') < 0) throw new Error('the timeline field came up empty on a new project: ' + JSON.stringify(ta.value));
    });

    // ── Housekeeping the project pins on every change ──
    __check('APP_VERSION and the stylesheet query string still match', () => {
      const m = /style\\.css\\?v=([0-9.]+)/.exec(H);
      if (!m) throw new Error('style.css is linked unversioned — a cached stylesheet next to a fresh app.js');
      if (m[1] !== APP_VERSION) throw new Error('style.css?v=' + m[1] + ' but APP_VERSION is ' + APP_VERSION);
    });
  `;

  try {
    window.__appSrc = src;
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\nwindow.__appHtml = ' + JSON.stringify(htmlSrc) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
