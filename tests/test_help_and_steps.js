// HELP STOPPED AT v1.1, AND NOTHING SAID WHAT ORDER THE WORK GOES IN.
//
// The Help reference had eight sections covering the Frame Dashboard and the
// Elevation view, and nothing on Deck Studio, floorplans, spec pages, breaker
// and install pages, PDF generation, window film, wall context or catalogues.
// Its "What's New" was v1.1 against APP_VERSION 17.8x. Some of what it said had
// stopped being true, and it opened on a Video tab reading "coming soon".
//
// Separately, a designer opening FRAME met three tabs with no sense of which came
// first, and a project part way through said nothing about what was missing
// until Preflight, at the very end.
//
// The Help checks are built to catch it going stale AGAIN: it may only name
// controls that exist, only list shortcuts that are bound, and its What's New
// must mention the version this file ships as. That last one means every release
// updates it, which is the point - nothing forced it before, which is how it
// fell sixteen versions behind.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const NL = String.fromCharCode(10);
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

const results = [];
const check = (label, fn) => results.push({ label, fn });
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 5));

const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'dangerously' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;
const quiet = console.error; console.error = () => {};
window.eval(APP + NL + [
    'window.__fx = {',
    '  help: HELP_REFERENCE_DATA, version: APP_VERSION,',
    '  counts: _projectStepCounts, steps: _projectSteps, live: _helpLiveEntry,',
    '  renderTabs: renderNavTabs, syncBadges: _syncNavBadges, schedule: scheduleAutosave,',
    '  openHelp: openHelpModal, closeHelp: closeHelpModal, setVideo: setHelpVideoUrl, section: renderHelpRefSection,',
    '  startScreen: openStartScreen, nextStep: _syncNextStep, newProject: _startNewProject, logo: _frameLogoSvg,',
    '  setPeek: function (f) { _autosavePeek = f; }, setGoFp: function (f) { _dsGoFloorplanItems = f; },',
    '  get unit() { return dashUnit; }, set dismissed(v) { _nextStepDismissed = v; },',
    '  set elevs(v) { elevations = v; }, set rows(v) { dashProjectData = v; },',
    '  set plan(v) { floorplanImageData = v; }, set levels(v) { floorplanLevels = v; },',
    '};',
].join(NL));
console.error = quiet;
const fx = window.__fx;
const doc = window.document;

const allText = (sec) => (sec.intro || '') + ' ' + sec.entries.map((e) => e.title + ' ' + (e.body || '')).join(' ');
const sectionIds = () => fx.help.map((s) => s.id);
const helpText = () => fx.help.map(allText).join(' ');

// ── Help covers the tool ────────────────────────────────────────────────
check('EXACT BUG: Help covers the parts it never mentioned', async () => {
    const need = ['getting-started', 'dashboard', 'elevation', 'context', 'catalogue', 'floorplan', 'deck', 'export-indesign', 'settings', 'shortcuts', 'tips', 'version'];
    const have = sectionIds();
    const missing = need.filter((id) => have.indexOf(id) < 0);
    if (missing.length) throw new Error('Help has no section for: ' + missing.join(', '));
    const t = helpText();
    ['Deck Studio', 'SHOW ON PAGE', 'Preflight', 'window film', '+ Add option', 'Place numbers / mark up', 'Calibrate'].forEach((w) => {
        if (t.indexOf(w) < 0) throw new Error('Help never mentions ' + w);
    });
});

check('What’s New is about THIS version, not v1.1', async () => {
    const v = fx.help.find((s) => s.id === 'version');
    const wn = v.entries.find((e) => /what.s new/i.test(e.title));
    if (!wn) throw new Error('no What’s New entry');
    if (wn.body.indexOf('<strong>v1.1</strong>') >= 0) throw new Error('What’s New still leads with v1.1');
    if (wn.body.indexOf(fx.version) < 0) {
        throw new Error('What’s New does not mention ' + fx.version + '. Every release adds a line here, or Help falls behind the way it did at v1.1');
    }
});

check('the claims that had stopped being true are gone', async () => {
    const t = helpText();
    if (/tab at the top is a separate elevation/i.test(t)) throw new Error('Help still says walls are tabs at the top; they are a rail in the Elevation view');
    if (/Shift-click (others|to select)/i.test(t)) throw new Error('Help still says Shift-click multi-selects; it is Ctrl+click (Shift is fine drag)');
    const sort = fx.help.find((s) => s.id === 'elevation').entries.find((e) => /Sort/.test(e.title));
    if (!sort || sort.body.indexOf('Re-letters') < 0) throw new Error('Sort A-Z is still described as only reordering the list; it re-letters the frames');
    const tip = fx.help.find((s) => s.id === 'tips').entries.find((e) => /Sourced Object/.test(e.title));
    if (!tip || tip.body.indexOf('hides frame') >= 0 || tip.body.indexOf('Framed Art') < 0) throw new Error('the Sourced Object tip still contradicts what the product actually does');
});

check('every control Help names by its label exists in the app', async () => {
    // Help drifted by describing controls in words the UI does not use. These are
    // the ones the new text names outright; each must appear in index.html or
    // app.js exactly as the button, tab or heading spells it.
    const ui = HTML + APP;
    const named = ['Add &amp; Arrange', 'Push to Wall', 'Send', 'Place numbers / mark up', 'Change plan', '+ Level',
        '+ Add option', 'Options map', 'All-options page', 'ART WALL', 'EGD WALL', 'WF WALL', '+ Add Wall', 'Generate PDF',
        'Run Preflight', 'Bulk Edit', 'Apply to Selected', '+ Add client elevation', 'Calibrate', 'Un-stretch',
        'Fill wall', 'Floorplan order', 'Include pages', 'SHOW ON PAGE', 'Frame corner', 'Moulding profile',
        'Unplaced', 'InDesign Script', 'Final Spec', 'Art Development', 'Install Guide', 'Catalogue', 'Wireframe',
        'Concept', 'Draft', 'Standard', 'Print', 'Copy details', 'Versions', 'Bulk Images', 'Save Project', 'Load Project'];
    const missing = named.filter((n) => ui.indexOf(n) < 0 && ui.indexOf(n.replace('&amp;', '&')) < 0);
    if (missing.length) throw new Error('Help names controls the UI does not have: ' + missing.join(', '));
    const t = helpText();
    const unused = named.filter((n) => t.indexOf(n) < 0);
    if (unused.length) throw new Error('this list and the Help text disagree about: ' + unused.join(', '));
});

check('every shortcut Help lists is actually bound', async () => {
    const binds = [
        ['Ctrl+Shift+S', 'saveProjectWithIndicator(e.shiftKey)'],
        ['Ctrl+Y', "key === 'y'"],
        ['Ctrl+Shift+Z', "key === 'z' && e.shiftKey"],
        ['Ctrl+G', "'g'"],
        ['Ctrl+D', "'d'"],
    ];
    const t = helpText();
    binds.forEach(([k, code]) => {
        if (t.indexOf(k) < 0) throw new Error('Help does not list ' + k);
        if (APP.indexOf(code) < 0) throw new Error(k + ' is listed in Help but no handler binds it');
    });
});

check('the new copy has no em dashes', async () => {
    const t = helpText();
    if (t.indexOf('—') >= 0) throw new Error('an em dash is back in the Help copy');
});

// ── Help opens somewhere useful ─────────────────────────────────────────
check('Help opens on Reference, and a Video tab with no video is hidden', async () => {
    fx.setVideo('');
    fx.openHelp();
    await tick();
    const vt = doc.getElementById('helpTabVideo');
    if (vt.style.display !== 'none') throw new Error('the Video tab still shows with nothing to play');
    if (doc.getElementById('helpReferencePanel').style.display === 'none') throw new Error('Help opened on the empty Video panel');
    fx.closeHelp();
});

check('and the Video tab comes back once there is a video', async () => {
    fx.setVideo('https://example.com/tour.mp4');
    fx.openHelp();
    await tick();
    const vt = doc.getElementById('helpTabVideo');
    fx.closeHelp();
    fx.setVideo('');
    if (vt.style.display === 'none') throw new Error('a real video left the tab hidden');
});

// ── the order of operations ─────────────────────────────────────────────
const setup = (o) => {
    fx.rows = o.rows;
    fx.elevs = o.elevs || [];
    fx.plan = o.plan || '';
    fx.levels = o.levels || [];
};
const row = (id, extra) => Object.assign({ id: id, extW: 20, extH: 20 }, extra || {});
const frame = (id, active) => ({ id: id, letter: 'A', x: 0, y: 0, w: 20, h: 20, active: active !== false });
const tabs = () => Array.from(doc.querySelectorAll('#nav-tabs-fixed .nav-tab'));
const badge = (view) => {
    const t = doc.querySelector('#nav-tabs-fixed .nav-tab[data-view="' + view + '"]');
    const b = t && t.querySelector('.nav-badge');
    return (b && b.style.display !== 'none') ? b.textContent : '';
};

check('the view tabs are numbered in the order the work goes', async () => {
    fx.renderTabs();
    const t = tabs();
    const order = t.map((x) => (x.querySelector('.nav-step') || {}).textContent + ' ' + x.getAttribute('data-view'));
    if (order.join(',') !== '1 dashboard,2 elevation,3 deck') throw new Error('tabs are not numbered 1-2-3 in working order: ' + order.join(', '));
});

check('the Elevation badge counts pieces not on a wall yet', async () => {
    setup({ rows: [row('ART-1'), row('ART-2'), row('ART-3')],
        elevs: [{ id: 'w1', name: 'Lobby', frames: [frame('ART-1')] }] });
    fx.renderTabs();
    if (badge('elevation') !== '2') throw new Error('expected 2 unplaced, the badge says ' + JSON.stringify(badge('elevation')));
    const tip = doc.querySelector('.nav-tab[data-view="elevation"]').title;
    if (tip.indexOf('2 pieces are not on a wall yet') < 0) throw new Error('the tooltip does not explain the badge: ' + tip);
    if (tip.indexOf('Step 2') < 0) throw new Error('the tooltip does not say which step this is');
});

check('a frame switched OFF does not count as placed', async () => {
    setup({ rows: [row('ART-1')], elevs: [{ id: 'w1', name: 'Lobby', frames: [frame('ART-1', false)] }] });
    fx.renderTabs();
    if (badge('elevation') !== '1') throw new Error('an inactive frame was counted as the piece being on a wall');
});

check('every piece placed means no badge at all', async () => {
    setup({ rows: [row('ART-1')], elevs: [{ id: 'w1', name: 'Lobby', frames: [frame('ART-1')] }] });
    fx.renderTabs();
    if (badge('elevation') !== '') throw new Error('a finished step still shows a badge');
});

check('the Deck badge waits for a floorplan, then counts unpinned pieces', async () => {
    setup({ rows: [row('ART-1'), row('ART-2', { planPins: [{ lv: 0, x: 0.5, y: 0.5 }] })],
        elevs: [{ id: 'w1', name: 'Lobby', frames: [frame('ART-1'), frame('ART-2')] }] });
    fx.renderTabs();
    if (badge('deck') !== '') throw new Error('with no plan there is nothing to pin, yet the Deck tab shows a count');
    // The counts themselves, not only the badge: the Help checklist reads them too,
    // and the badge's own plan check would hide a count that should not exist.
    if (fx.counts().unpinned !== 0) throw new Error('with no plan the counts still report pieces as unpinned');
    fx.levels = [{ name: 'Level 1', imageData: 'data:image/png;base64,AAAA' }];
    fx.renderTabs();
    if (badge('deck') !== '1') throw new Error('expected 1 unpinned piece, the badge says ' + JSON.stringify(badge('deck')));
});

check('a piece counts by the same rule as a spec page', async () => {
    // A catalogue mockup's slots are a drawing, not work to do. _deckSpecRows is
    // the one answer to which rows are pieces, so the badges must use it.
    const i = APP.indexOf('function _projectStepCounts');
    const body = APP.slice(i, APP.indexOf(NL + '}', i));
    if (body.indexOf('_deckSpecRows()') < 0) throw new Error('the step counts decide what a piece is on their own');
    if (body.indexOf('_fpPins(') < 0) throw new Error('the step counts read pins some other way than _fpPins');
});

check('the badges follow an edit, and update IN PLACE', async () => {
    setup({ rows: [row('ART-1'), row('ART-2')], elevs: [{ id: 'w1', name: 'Lobby', frames: [frame('ART-1')] }] });
    fx.renderTabs();
    const before = doc.querySelector('.nav-tab[data-view="elevation"]');
    if (badge('elevation') !== '1') throw new Error('setup: expected 1 unplaced');
    fx.elevs = [{ id: 'w1', name: 'Lobby', frames: [frame('ART-1'), frame('ART-2')] }];
    fx.schedule();
    await tick(500);
    const after = doc.querySelector('.nav-tab[data-view="elevation"]');
    if (badge('elevation') !== '') throw new Error('the badge did not follow the edit');
    if (after !== before) throw new Error('the tabs were re-rendered, which drops keyboard focus off a tab mid-Tab');
});

check('Help opens with a live checklist of THIS project', async () => {
    setup({ rows: [row('ART-1'), row('ART-2'), row('ART-3')],
        elevs: [{ id: 'w1', name: 'Lobby', frames: [frame('ART-1')] }] });
    const html = fx.live('steps');
    // 17.87: a project starts by listing its codes, on the floorplan or the dashboard.
    ['1. List the item codes', '2. Place them on walls', '3. Pin them on the floorplan', '4. Build the deck', '5. Generate the PDF']
        .forEach((s) => { if (html.indexOf(s) < 0) throw new Error('the checklist is missing: ' + s); });
    if (html.indexOf('2 of 3 not on a wall yet') < 0) throw new Error('the checklist does not reflect the project');
    if (html.indexOf('No floorplan yet') < 0) throw new Error('the plan step does not say it can be skipped');
    const start = fx.help.find((s) => s.id === 'getting-started');
    if (!start.entries[0].live) throw new Error('the checklist is not the first thing in Start here');
});

check('its Go buttons take you to the step', async () => {
    setup({ rows: [row('ART-1')], elevs: [{ id: 'w1', name: 'Lobby', frames: [] }] });
    fx.openHelp();
    fx.section('getting-started');
    const go = doc.querySelector('[data-help-go="walls"]');
    if (!go) throw new Error('no Go button for the walls step');
    let went = null;
    const real = window.switchView;
    window.switchView = (v) => { went = v; };
    try { go.click(); } finally { window.switchView = real; }
    if (went !== 'elevation') throw new Error('Go on step 2 did not open the Elevation view, got ' + went);
    if (doc.getElementById('helpModal').style.display !== 'none') throw new Error('Help stayed open over the view it sent you to');
});

// ── the start screen (18.10) ────────────────────────────────────────────
// CHANGED IN 18.10, deliberately: the first-run toast ("New to FRAME?") and the
// "Where do you want to start?" chooser are gone. Every boot opens on the start
// screen, and the next step lives in a bar beside the work, not in a toast.
check('both boot branches open through _bootStart, which keeps a harness on the restore question', async () => {
    if (APP.split('setTimeout(_bootStart, 200);').length - 1 !== 2) throw new Error('not wired into both boot branches');
    if (APP.indexOf('_armStepsFirstRunTip') >= 0 || APP.indexOf('_stepsFirstRunTip') >= 0) throw new Error('the old first-run toast is still armed');
    const b = APP.slice(APP.indexOf('function _bootStart()'), APP.indexOf('function _confirmDiscardUnsaved'));
    if (b.indexOf('jsdom') < 0 || b.indexOf('checkAutosaveOnLoad') < 0 || b.indexOf('openStartScreen') < 0) throw new Error('_bootStart does not split browser and harness');
});

check('the start screen offers New and Open, and Continue only when there is unsaved work', async () => {
    fx.setPeek(async () => null);
    let ov = await fx.startScreen();
    let titles = Array.from(ov.querySelectorAll('.ss-card strong')).map((s) => s.textContent);
    if (titles.join() !== 'New project,Open project') throw new Error('with no backup: ' + titles.join());
    if (ov.querySelector('[data-modal-close]')) throw new Error('it has a close control, so Escape would dismiss it with no project chosen');
    fx.setPeek(async () => ({ projName: 'Lobby deck', timeStr: '5 minutes ago', stamp: {}, legacy: null }));
    ov = await fx.startScreen();
    if (doc.querySelectorAll('#startScreen').length !== 1) throw new Error('opening it twice stacked two');
    titles = Array.from(ov.querySelectorAll('.ss-card strong')).map((s) => s.textContent);
    if (titles[0] !== 'Continue') throw new Error('unsaved work is not offered first: ' + titles.join());
    if (ov.querySelector('.ss-continue .ss-txt').textContent.indexOf('Lobby deck') < 0) throw new Error('Continue does not name the work');
    if (!ov.querySelector('.ss-note')) throw new Error('nothing says New or Open will replace the unsaved work');
});

check('Escape does not dismiss the start screen', async () => {
    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await tick(10);
    if (!doc.getElementById('startScreen')) throw new Error('Escape closed it with no project chosen');
});

check('New project takes a name, client and units, then lands on the floorplan Items list', async () => {
    let went = false;
    fx.setGoFp(() => { went = true; });
    const ov = doc.getElementById('startScreen');
    Array.from(ov.querySelectorAll('.ss-card')).find((c) => c.textContent.indexOf('New project') >= 0).click();
    const form = ov.querySelector('.ss-form');
    if (!form) throw new Error('no form');
    form.elements.name.value = 'Marriott Downtown';
    form.elements.client.value = 'Marriott';
    Array.from(form.querySelectorAll('.ss-units .frame-tab')).find((b) => b.textContent === 'CM').click();
    form.dispatchEvent(new window.Event('submit', { cancelable: true }));
    if (doc.getElementById('startScreen')) throw new Error('the start screen stayed up');
    if (doc.getElementById('g_projName').value !== 'Marriott Downtown') throw new Error('name not set');
    if (doc.getElementById('g_client').value !== 'Marriott') throw new Error('client not set');
    if (fx.unit !== 'cm') throw new Error('units not set: ' + fx.unit);
    if (!went) throw new Error('did not land on the floorplan Items list');
    fx.newProject({ unit: 'in' });
});

check('the logo is six parts, the mark first, and the motion respects reduced motion', async () => {
    const holder = doc.createElement('div'); holder.innerHTML = fx.logo('x');
    const parts = holder.querySelectorAll('path');
    if (parts.length !== 6) throw new Error(parts.length + ' parts');
    if (!parts[0].classList.contains('fl-mark') || holder.querySelectorAll('.fl-l').length !== 5) throw new Error('mark and letters are not tagged for the animation');
    if (CSS.indexOf('@keyframes flLetter') < 0 || CSS.indexOf('prefers-reduced-motion: reduce') < 0) throw new Error('the animation or its reduced-motion override is missing');
});

check('the next-step bar names the one next thing and folds away when the project is underway', async () => {
    fx.dismissed = false;
    fx.rows = [{ id: 'ART.1' }]; fx.elevs = [{ id: 'w', name: 'W', frames: [] }]; fx.plan = ''; fx.levels = [];
    fx.nextStep();
    let bar = doc.getElementById('nextStep');
    if (!bar || bar.querySelector('.ns-n').textContent !== 'Step 1') throw new Error('a fresh project is not on step 1');
    fx.rows = [{ id: 'ART.1' }, { id: 'ART.2' }];
    fx.nextStep();
    bar = doc.getElementById('nextStep');
    if (bar.querySelector('.ns-n').textContent !== 'Step 2' || bar.textContent.indexOf('2 pieces are not on a wall') < 0) throw new Error('step 2 not reported: ' + bar.textContent);
    fx.elevs = [{ id: 'w', name: 'W', frames: [{ id: 'ART.1', active: true }, { id: 'ART.2', active: true }] }];
    fx.nextStep();
    if (doc.getElementById('nextStep')) throw new Error('the bar stayed after every piece was placed and there is no plan to pin on');
    fx.elevs = [{ id: 'w', name: 'W', frames: [] }];
    fx.nextStep();
    doc.getElementById('nextStep').querySelector('.ns-x').click();
    fx.nextStep();
    if (doc.getElementById('nextStep')) throw new Error('dismissing did not hold');
    fx.dismissed = false;
});

// ── run ─────────────────────────────────────────────────────────────────
function waitLoaded() {
    return new Promise((r) => { if (doc.readyState !== 'loading') return r(); doc.addEventListener('DOMContentLoaded', () => r()); });
}
(async () => {
    await waitLoaded();
    await tick(20);
    console.error = () => {};
    let pass = 0;
    const failed = [];
    for (const r of results) {
        try { await r.fn(); console.log('OK:   ' + r.label); pass++; }
        catch (e) { console.log('FAIL: ' + r.label + ' -> ' + e.message); failed.push(r.label); }
    }
    console.error = quiet;
    console.log('');
    console.log('--- Summary ---');
    if (failed.length) { console.log('FAILED (' + failed.length + ' of ' + results.length + ')'); process.exitCode = 1; }
    else console.log('ALL PASSED (' + pass + ')');
    window.close();
})();
