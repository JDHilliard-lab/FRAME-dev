// 18.84: THE FRAME BROWSER, PROJECT FRAMES AND GROUPINGS (openFrameBrowser).
//
// The dashboard picked a frame from a flat dropdown per collection. With Michelangelo
// Avant-Garde imported (hundreds of mouldings in one collection) that list is unusable,
// and designers asked for two ways to organise: the handful of frames a project uses,
// and named groupings they reuse. Pinned here:
//   - the Frame box opens the browser, not the old flat list;
//   - catalogue facts (colour, family, profile, corner photo) reach the library entries,
//     and search / filters read them;
//   - Project frames = frames on an item (DERIVED) + a shortlist (stored, undoable,
//     never seeded by a read);
//   - My groupings live in localStorage, Team groupings come from library/groupings.json,
//     Share with team writes the team-file shape, and a shared one is marked;
//   - picking goes through loadDashFromCustomLibrary, the one apply path;
//   - the import itself: every new Avant-Garde swatch has its corner and profile.
//
// The in-app checks run INSIDE the same eval as app.js (its lets are not window
// properties). They are written as a plain function and appended by .toString(), so
// no backslash has to survive a template literal.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message }); }
};

// ---- static: markup, styles, the imported library ---------------------------------
check('the dashboard Frame box opens the frame browser', () => {
  const m = /id="swatchSelectedDisplay"[^>]*>/.exec(HTML);
  if (!m) throw new Error('#swatchSelectedDisplay missing');
  if (m[0].indexOf('openFrameBrowser()') < 0) throw new Error('Frame box does not open the browser: ' + m[0].slice(0, 160));
  if (m[0].indexOf('toggleDashSwatchDropdown') >= 0) throw new Error('Frame box still opens the flat dropdown');
});
check('vendor / collection selects stay in the page (the apply path reads them)', () => {
  ['libVendor', 'libCollection', 'swatchDropdownList'].forEach(id => {
    if (HTML.indexOf('id="' + id + '"') < 0) throw new Error('#' + id + ' removed');
  });
});
check('the browser has its styles', () => {
  ['.fb-card', '.fb-grid', '.fb-frame', '.fb-star.on', '.fb-src.active'].forEach(sel => {
    if (CSS.indexOf(sel) < 0) throw new Error(sel + ' has no rule');
  });
});

const MAN = JSON.parse(fs.readFileSync(path.join(root, 'library-manifest.json'), 'utf8'));
check('the manifest carries catalogue facts and the corner photo', () => {
  const e = MAN.find(x => x.code === 'MICH-145-23');
  if (!e) throw new Error('MICH-145-23 not in the manifest');
  if (e.family !== 'Silver' || e.color !== 'Pattern Silver' || e.profile !== 'Small Flat') throw new Error('facts wrong: ' + JSON.stringify(e));
  if (e.corner !== 'library/michaelangelo/avant-garde/corners/MICH-145-23.jpg') throw new Error('corner path wrong: ' + e.corner);
  if (e.depth !== 0.5625 || e.rabbet !== 0.3125 || e.width !== 1.25) throw new Error('dimensions wrong: ' + JSON.stringify(e));
});
check('every catalogue-imported swatch has a corner photo and a profile on disk', () => {
  const dir = path.join(root, 'library', 'michaelangelo', 'avant-garde');
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'catalogue.json'), 'utf8'));
  const missing = [];
  MAN.filter(x => x.collection === 'avant-garde' && meta[x.code]).forEach(x => {
    if (!x.corner || !fs.existsSync(path.join(root, x.corner))) missing.push(x.code + ' corner');
    if (!x.profileImg || !fs.existsSync(path.join(root, x.profileImg))) missing.push(x.code + ' profile');
    if (!fs.existsSync(path.join(root, x.path))) missing.push(x.code + ' swatch');
  });
  if (missing.length) throw new Error(missing.length + ' missing, e.g. ' + missing.slice(0, 5).join(', '));
});
check('library/groupings.json is a valid (possibly empty) team list', () => {
  const j = JSON.parse(fs.readFileSync(path.join(root, 'library', 'groupings.json'), 'utf8'));
  if (!Array.isArray(j.groupings)) throw new Error('groupings is not a list');
  j.groupings.forEach(g => {
    if (!g.id || !g.name || !Array.isArray(g.codes)) throw new Error('bad grouping: ' + JSON.stringify(g));
  });
});

// ---- live: the real app in jsdom -------------------------------------------------
const SAMPLE = MAN.filter(x => x.collection === 'avant-garde');
const TEAM = { groupings: [{ id: 'gteam1', name: 'Team blacks', note: 'house blacks', codes: ['MICH-41-29', 'MICH-NOPE-1'] }] };

function inApp() {
  window.__fbRun = (async () => {
    const out = [];
    const ok = (label, fn) => { try { const r = fn(); out.push({ label, ok: true, r }); } catch (e) { out.push({ label, ok: false, err: e.message }); } };
    const tick = () => new Promise(r => setTimeout(r, 0));
    const MANIFEST = window.__MANIFEST, TEAMFILE = window.__TEAM;
    window.fetch = (url) => {
      const u = String(url);
      const body = u.indexOf('library-manifest.json') >= 0 ? MANIFEST : u.indexOf('groupings.json') >= 0 ? TEAMFILE : null;
      if (!body) return Promise.reject(new Error('no network'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(JSON.stringify(body))) });
    };
    try { localStorage.removeItem(FB_MINE_KEY); } catch (e) {}
    await loadBundledLibrary();
    _fbTeam = null;

    const lib = dashLocalLibrary.michaelangelo && dashLocalLibrary.michaelangelo['avant-garde'];
    ok('library entries carry colour, family, profile and the corner photo', () => {
      if (!lib) throw new Error('avant-garde not loaded');
      const e = lib.find(x => x.code === 'MICH-41-29');
      if (!e) throw new Error('MICH-41-29 not loaded');
      if (!e.family || !e.color || !e.profile) throw new Error('facts dropped: ' + JSON.stringify(e));
      if (!e.corner || e.corner.indexOf('corners/') < 0) throw new Error('corner dropped');
    });

    ok('reading the shortlist does not seed the field', () => {
      _fbShortlist(); _fbOnShortlist('MICH-41-29');
      if ('frameShortlist' in editorialContent) throw new Error('a read wrote editorialContent.frameShortlist');
    });

    // A row using a library frame shows under In use, derived from the row.
    dashProjectData[0].fType = 'image'; dashProjectData[0].fCode = 'MICH-41-29';
    openFrameBrowser();
    await tick(); await tick();
    const modal = document.getElementById('frameBrowser');
    ok('the browser opens on the shared modal shell with one close control', () => {
      if (!modal) throw new Error('#frameBrowser not opened');
      if (!modal.classList.contains('frame-modal')) throw new Error('not a .frame-modal');
      if (modal.querySelectorAll('[data-modal-close]').length !== 1) throw new Error('want exactly one [data-modal-close]');
    });
    const cardsIn = () => Array.from(document.querySelectorAll('#fbGrid .fb-frame')).map(el => el.getAttribute('data-fb-code'));
    ok('Project frames lists the frame on the row as In use', () => {
      if (_fbState.src !== 'project') throw new Error('opened on ' + _fbState.src);
      if (cardsIn().indexOf('MICH-41-29') < 0) throw new Error('row frame not listed: ' + cardsIn().join(','));
      const card = document.querySelector('.fb-frame[data-fb-code="MICH-41-29"]');
      if (!card.querySelector('.fb-used')) throw new Error('no In use badge');
    });
    ok('In use is derived: change the row and it follows', () => {
      dashProjectData[0].fCode = 'MICH-41-33'; _fbRender();
      if (cardsIn().indexOf('MICH-41-29') >= 0) throw new Error('stale In use after the row changed');
      if (cardsIn().indexOf('MICH-41-33') < 0) throw new Error('new frame not listed');
      dashProjectData[0].fCode = 'MICH-41-29'; _fbRender();
    });

    // Star a library frame: it lands on the shortlist, as one undo entry.
    _fbState.src = 'all'; _fbRender();
    const before = undoStack.length;
    const star = document.querySelector('.fb-frame[data-fb-code="MICH-41-33"] .fb-star');
    ok('starring shortlists the frame on the project, undoably', () => {
      if (!star) throw new Error('MICH-41-33 card has no star');
      star.click();
      const s = editorialContent.frameShortlist || [];
      if (s.indexOf('MICH-41-33') < 0) throw new Error('not shortlisted: ' + JSON.stringify(s));
      if (undoStack.length !== before + 1) throw new Error('want one history entry, got ' + (undoStack.length - before));
      _fbState.src = 'project'; _fbRender();
      if (cardsIn().indexOf('MICH-41-33') < 0) throw new Error('shortlisted frame not under Project frames');
    });
    ok('unstarring removes it and drops the empty field', () => {
      _fbSetShortlist(['MICH-41-33'], false);
      if ('frameShortlist' in editorialContent) throw new Error('empty shortlist left behind');
    });

    _fbState.src = 'all';
    ok('search reads the catalogue colour', () => {
      _fbState.q = 'satin gold'; _fbRender();
      const c = cardsIn();
      if (!c.length) throw new Error('nothing found');
      c.forEach(code => { const e = lib.find(x => x.code === code); if (!/satin gold/i.test(e.color || '')) throw new Error(code + ' is ' + e.color); });
      _fbState.q = '';
    });
    ok('colour family and width filters narrow the grid', () => {
      _fbState.family = 'Black'; _fbRender();
      const c = cardsIn();
      if (!c.length) throw new Error('no blacks');
      c.forEach(code => { const e = lib.find(x => x.code === code); if (e.family !== 'Black') throw new Error(code + ' is ' + e.family); });
      _fbState.width = 'lt1'; _fbRender();
      cardsIn().forEach(code => { const e = lib.find(x => x.code === code); if (!(e.width < 1)) throw new Error(code + ' is ' + e.width + ' wide'); });
      _fbState.family = ''; _fbState.width = ''; _fbRender();
    });

    // Groupings.
    await _fbLoadTeam(); _fbRender();
    ok('team groupings come from library/groupings.json', () => {
      if (!document.querySelector('[data-fb-src="team:gteam1"]')) throw new Error('team grouping not in the sidebar');
      _fbState.src = 'team:gteam1'; _fbRender();
      if (cardsIn().join(',') !== 'MICH-41-29,MICH-NOPE-1') throw new Error('team cards: ' + cardsIn().join(','));
      if (!document.querySelector('.fb-frame[data-fb-code="MICH-NOPE-1"]').classList.contains('missing')) throw new Error('a code not in the library should show as missing, not vanish');
    });
    const realAsk = _askFields;
    _askFields = () => Promise.resolve({ name: 'Lobby golds', note: 'warm' });
    const g = await _fbNewGrouping(['MICH-41-10']);
    _askFields = realAsk;
    ok('a new grouping is saved on this computer and opened', () => {
      if (!g) throw new Error('not created');
      const stored = JSON.parse(localStorage.getItem(FB_MINE_KEY) || '[]');
      if (stored.length !== 1 || stored[0].name !== 'Lobby golds' || stored[0].codes[0] !== 'MICH-41-10') throw new Error('stored: ' + JSON.stringify(stored));
      if (_fbState.src !== 'mine:' + g.id) throw new Error('not opened');
    });
    ok('the card menu adds a frame to a grouping', () => {
      _fbToggleInGrouping(g.id, 'MICH-41-12', true);
      if (_fbMine()[0].codes.join(',') !== 'MICH-41-10,MICH-41-12') throw new Error(_fbMine()[0].codes.join(','));
    });
    ok('Share with team writes the team-file shape', () => {
      const j = JSON.parse(_fbGroupingFileText(_fbMine()[0]));
      if (j.type !== 'frame-grouping' || j.id !== g.id || j.name !== 'Lobby golds' || j.codes.length !== 2) throw new Error(JSON.stringify(j));
    });
    ok('Add all to project shortlists the grouping', () => {
      _fbSetShortlist(_fbMine()[0].codes, true);
      const s = editorialContent.frameShortlist || [];
      if (s.indexOf('MICH-41-10') < 0 || s.indexOf('MICH-41-12') < 0) throw new Error(JSON.stringify(s));
    });
    ok('a grouping the team list also holds is marked shared', () => {
      _fbTeam = _fbTeam.concat([{ id: g.id, name: 'Lobby golds', codes: ['MICH-41-10'] }]); _fbRender();
      const b = document.querySelector('[data-fb-src="mine:' + g.id + '"]');
      if (!b || !b.classList.contains('shared')) throw new Error('not marked shared');
    });

    // Picking goes through the one apply path.
    const realLoad = loadDashFromCustomLibrary; let got = null;
    loadDashFromCustomLibrary = (idx) => { got = idx; };
    _fbState = { src: 'all', q: '', family: '', width: '', profile: '' }; _fbRender();
    const pickCard = document.querySelector('.fb-frame[data-fb-code="MICH-41-12"]');
    if (pickCard) pickCard.click();
    loadDashFromCustomLibrary = realLoad;
    ok('clicking a card applies it through loadDashFromCustomLibrary and closes', () => {
      const want = lib.findIndex(x => x.code === 'MICH-41-12');
      if (got !== want) throw new Error('applied index ' + got + ', want ' + want);
      if (document.getElementById('libVendor').value !== 'michaelangelo') throw new Error('vendor select not set');
      if (document.getElementById('libCollection').value !== 'avant-garde') throw new Error('collection select not set');
      if (document.getElementById('frameBrowser')) throw new Error('browser still open');
    });
    return out;
  })();
}

const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
window.__MANIFEST = SAMPLE; window.__TEAM = TEAM;
global.window = window; global.document = window.document; global.navigator = window.navigator;
const quiet = console.error, warn = console.warn; console.error = () => {}; console.warn = () => {};
window.eval(APP + NL + '_autosaveToldUser = true;' + NL + '(' + inApp.toString() + ')();');
console.error = quiet; console.warn = warn;

window.__fbRun.then(out => {
  out.forEach(r => results.push(r));
}).catch(e => results.push({ label: 'in-app run', ok: false, err: e.message })).then(() => {
  let fail = 0;
  results.forEach(r => { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ': ' + r.err)); if (!r.ok) fail++; });
  console.log(NL + '--- Summary ---');
  console.log(fail ? fail + ' FAILED of ' + results.length : 'ALL PASSED (' + results.length + ')');
  process.exit(fail ? 1 : 0);
});
