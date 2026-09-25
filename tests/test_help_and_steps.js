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
    '  firstRun: _stepsFirstRunTip,',
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
    ['Deck Studio', 'SHOW ON PAGE', 'Preflight', 'window film', 'CATALOGUE MOCKUP', 'Place numbers / mark up', 'Calibrate'].forEach((w) => {
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
        'CATALOGUE MOCKUP', '+ LAYOUT', '+ SET', 'ART WALL', 'EGD WALL', 'WF WALL', '+ Add Wall', 'Generate PDF',
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
    ['1. Spec the pieces', '2. Place them on walls', '3. Pin them on the floorplan', '4. Build the deck', '5. Generate the PDF']
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

check('boot does NOT put the tip on a timer, it waits for the first click', async () => {
    // A 12-second toast scheduled at boot kept every headless test process alive
    // ~14 seconds after it finished, and the suite ran for half an hour.
    const i = APP.indexOf("if (document.readyState === 'loading') {" + NL + "    document.addEventListener('DOMContentLoaded', () => {" + NL + "        updateDirtyIndicator();");
    const boot = APP.slice(i, APP.indexOf('END SAVE / AUTOSAVE', i));
    if (i < 0) throw new Error('could not find the boot branches');
    if (boot.indexOf('_stepsFirstRunTip()') >= 0) throw new Error('boot shows the tip on a timer again');
    if (boot.split('_armStepsFirstRunTip()').length - 1 !== 2) throw new Error('the tip is not armed on both boot branches');
    try { window.localStorage.removeItem('frameStepsTipSeen'); } catch (e) {}
    doc.querySelectorAll('.frame-toast').forEach((t) => t.remove());
    window.eval('_armStepsFirstRunTip()');
    await tick(1700);
    if (doc.querySelectorAll('.frame-toast').length) throw new Error('the tip appeared with nobody having clicked');
    doc.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    await tick(1700);
    const n = Array.from(doc.querySelectorAll('.frame-toast')).filter((t) => t.textContent.indexOf('New to FRAME') >= 0).length;
    if (n !== 1) throw new Error('the first click did not bring the tip up');
    doc.querySelectorAll('.frame-toast').forEach((t) => t.remove());
});

check('the first-run tip shows ONCE per machine', async () => {
    // The page's own boot already ran this, as a first boot should, and its tip
    // may still be on its timer. Let it land before measuring, or it arrives
    // mid-check and reads as a second tip.
    await tick(1700);
    try { window.localStorage.removeItem('frameStepsTipSeen'); } catch (e) {}
    doc.querySelectorAll('.frame-toast').forEach((t) => t.remove());
    fx.firstRun();
    await tick(1700);
    const first = Array.from(doc.querySelectorAll('.frame-toast')).filter((t) => t.textContent.indexOf('New to FRAME') >= 0).length;
    if (first !== 1) throw new Error('the first-run tip did not appear');
    doc.querySelectorAll('.frame-toast').forEach((t) => t.remove());
    fx.firstRun();
    await tick(1700);
    const again = Array.from(doc.querySelectorAll('.frame-toast')).filter((t) => t.textContent.indexOf('New to FRAME') >= 0).length;
    if (again) throw new Error('the tip came back on the second boot');
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
