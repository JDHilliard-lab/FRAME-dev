// A NEW DESIGNER LEARNED FRAME ON A CALL (18.30).
//
// The checklist said what comes next and nothing showed where on screen any of it
// lives. The guided tour walks the real app: it dims everything but one control,
// moves between the views by itself, and has an All steps list.
//
// What these checks hold it to:
//   - every step it can point at is a control that EXISTS (a tour aimed at a
//     renamed id would centre a card over nothing and nobody would notice);
//   - it is READ-ONLY: walking every step leaves the project and the undo stack
//     exactly as they were, and the app's own shortcuts cannot fire under it;
//   - it can always be left (Esc, the x, Finish) and leaves nothing behind;
//   - a step whose control is missing falls back to a centred card, not a throw;
//   - it is reachable from Help, the start screen and the next-step bar.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
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
    '  tour: FRAME_TOUR, chapters: TOUR_CHAPTERS, start: startTour, end: endTour, go: _tourGo, open: _tourIsOpen,',
    '  forView: _tourStepsFor, target: _tourTarget, done: _tourDone, helpEntry: _helpLiveEntry,',
    '  openHelp: openHelpModal, section: renderHelpRefSection, startScreen: openStartScreen, nextStep: _syncNextStep,',
    '  setPeek: function (f) { _autosavePeek = f; },',
    '  get i() { return _tour ? _tour.i : -1; },',
    '  get hist() { return _dsEditGen; },',
    '  sig: function () {',
    // Viewing seeds EMPTY defaults the same way a click does: a page's default theme the
    // first time it is selected, hiddenDims {} the first time a wall draws, and frameRec
    // the first time ANYTHING renders the Frame Recommendations page (the background
    // thumbnail pump included, which is why this only showed under a loaded machine).
    // Those three are left out. Everything an edit would touch is in.
    '    var SEEDED = { pageThemes: 1, frameRec: 1 };',
    '    var ed = {}; for (var k in editorialContent) if (!SEEDED[k]) ed[k] = editorialContent[k];',
    '    var el = elevations.map(function (x) { var o = {}; for (var k in x) if (k !== "hiddenDims") o[k] = x[k]; return o; });',
    '    var o = { rows: JSON.stringify(dashProjectData), walls: JSON.stringify(el), plans: JSON.stringify(floorplanLevels) };',
    '    for (var k2 in ed) o["deck." + k2] = JSON.stringify(ed[k2]);',
    '    return o;',
    '  },',
    '  set dismissed(v) { _nextStepDismissed = v; },',
    '  visitDeck: function () { switchView("deck"); openDeckStudio("pages"); switchView("dashboard"); },',
    '};',
].join(NL));
console.error = quiet;
const fx = window.__fx;
const doc = window.document;

// jsdom lays nothing out, so every rect is zero and _tourTarget (correctly) finds
// nothing visible. Give every element a box so the pointing logic can be exercised.
function fakeLayout(on) {
    const P = window.Element.prototype;
    if (on) {
        P.__gbcr = P.__gbcr || P.getBoundingClientRect;
        P.getBoundingClientRect = function () { return { left: 100, top: 100, right: 300, bottom: 160, width: 200, height: 60, x: 100, y: 100 }; };
    } else if (P.__gbcr) { P.getBoundingClientRect = P.__gbcr; }
}

check('every step has a chapter, a title and a body, with no em dashes', async () => {
    if (fx.tour.length < 15) throw new Error('only ' + fx.tour.length + ' steps');
    fx.tour.forEach((s, k) => {
        if (!fx.chapters[s.ch]) throw new Error('step ' + (k + 1) + ' has no chapter');
        if (!s.title || !s.body) throw new Error('step ' + (k + 1) + ' is missing its words');
        if ((s.title + s.body).indexOf(String.fromCharCode(8212)) >= 0) throw new Error('em dash in step ' + (k + 1));
    });
});

check('chapters run in work order: codes, spec, walls, pin, deck, generate', async () => {
    let last = -1;
    fx.tour.forEach((s, k) => { if (s.ch < last) throw new Error('step ' + (k + 1) + ' goes back a chapter'); last = s.ch; });
    const order = fx.chapters.join('|');
    ['List the codes', 'Spec the pieces', 'Place on walls', 'Pin the plan', 'Build the deck', 'Generate'].reduce((at, c) => {
        const i = order.indexOf(c);
        if (i < at) throw new Error(c + ' is out of order');
        return i;
    }, -1);
});

check('every id a step points at exists in index.html or is built by app.js', async () => {
    const ids = [];
    fx.tour.forEach((s) => [].concat(s.target || []).forEach((t) => {
        if (typeof t !== 'string') return;
        t.split(' ').forEach((part) => { if (part.charAt(0) === '#') ids.push(part.slice(1)); });
    }));
    const missing = ids.filter((id) => HTML.indexOf('id="' + id + '"') < 0 && APP.indexOf(".id = '" + id + "'") < 0 && APP.indexOf("id = '" + id + "'") < 0);
    if (missing.length) throw new Error('tour points at ids nothing creates: ' + missing.join(', '));
    ['helpBtn', 'saveProjectBtn', 'dsGenerateBtn'].forEach((id) => { if (!doc.getElementById(id)) throw new Error('#' + id + ' missing'); });
});

check('every class a step points at is used somewhere', async () => {
    const cls = [];
    fx.tour.forEach((s) => [].concat(s.target || []).forEach((t) => {
        if (typeof t !== 'string') return;
        t.split(' ').forEach((part) => { if (part.charAt(0) === '.') cls.push(part.slice(1)); });
    }));
    const missing = cls.filter((c) => HTML.indexOf(c) < 0 && APP.indexOf("'" + c) < 0 && APP.indexOf(' ' + c) < 0);
    if (missing.length) throw new Error('tour points at classes nothing uses: ' + missing.join(', '));
});

check('EXACT JOB: the tour dims the screen and shows a step card with progress', async () => {
    fakeLayout(true);
    try {
        fx.start();
        const r = doc.getElementById('frameTour');
        if (!r) throw new Error('no tour layer');
        if (!r.querySelector('.tour-spot') || !r.querySelector('.tour-block')) throw new Error('no dimming / blocker');
        if (r.querySelector('.tour-count').textContent !== '1 of ' + fx.tour.length) throw new Error('count reads ' + r.querySelector('.tour-count').textContent);
        if (r.querySelector('.tour-title').textContent !== fx.tour[0].title) throw new Error('first title wrong');
        if (!r.querySelector('.tour-back').disabled) throw new Error('Back is live on step 1');
        r.querySelector('.tour-next').click();
        if (fx.i !== 1) throw new Error('Next did not advance');
        const sp = r.querySelector('.tour-spot');
        if (sp.classList.contains('tour-none')) throw new Error('step 2 has a target and the spotlight did not find it');
        if (sp.style.width === '0px' || !sp.style.width) throw new Error('spotlight not sized round the control');
    } finally { fx.end(true); fakeLayout(false); }
});

check('All steps lists every step by chapter and jumps to one', async () => {
    fakeLayout(true);
    try {
        fx.start();
        const r = doc.getElementById('frameTour');
        r.querySelector('.tour-steps-btn').click();
        const list = r.querySelector('.tour-list');
        if (list.hidden) throw new Error('list did not open');
        const steps = list.querySelectorAll('.tour-list-step');
        if (steps.length !== fx.tour.length) throw new Error(steps.length + ' rows for ' + fx.tour.length + ' steps');
        if (list.querySelectorAll('.tour-list-ch').length !== new Set(fx.tour.map((s) => s.ch)).size) throw new Error('chapter headers wrong');
        steps[5].click();
        if (fx.i !== 5) throw new Error('jump landed on ' + fx.i);
        if (!list.querySelectorAll('.tour-list-step')[5].classList.contains('active')) throw new Error('current step not lit');
    } finally { fx.end(true); fakeLayout(false); }
});

check('READ-ONLY: walking every step changes no project data and pushes no undo', async () => {
    // Deck Studio seeds its own defaults (guide sets, footers, themes) the FIRST time
    // it opens, whoever opens it. That is the Deck tab, not the tour, so the baseline
    // is taken after an ordinary visit to the Deck, the way a designer would arrive.
    fx.visitDeck();
    await tick(20);
    const before = fx.sig();
    const h0 = fx.hist;
    fx.start();
    try {
        for (let k = 0; k < fx.tour.length; k++) { fx.go(k); await tick(1); }
    } finally { fx.end(true); }
    await tick(150);
    const after = fx.sig();
    const moved = Object.keys(Object.assign({}, before, after)).filter((k) => before[k] !== after[k]);
    if (moved.length) throw new Error('the tour changed the project: ' + moved.map((k) => k + ' ' + String(before[k]).slice(0, 120) + ' -> ' + String(after[k]).slice(0, 120)).join(' | '));
    if (fx.hist !== h0) throw new Error('the tour pushed ' + (fx.hist - h0) + ' undo entries');
});

check('a step whose control is missing centres the card instead of throwing', async () => {
    // jsdom has no layout, so NOTHING is visible: the honest worst case.
    fx.start();
    try {
        for (let k = 0; k < fx.tour.length; k++) fx.go(k);
        const sp = doc.querySelector('#frameTour .tour-spot');
        if (!sp.classList.contains('tour-none')) throw new Error('no fallback when nothing is visible');
    } finally { fx.end(true); }
});

check('app shortcuts cannot fire under the tour; Esc ends it and leaves nothing', async () => {
    fakeLayout(true);
    let leaked = 0;
    const spy = () => { leaked++; };
    doc.addEventListener('keydown', spy);
    try {
        fx.start();
        ['z', 'Delete', 'v', 't'].forEach((k) => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, ctrlKey: k === 'z', bubbles: true })));
        doc.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
        if (leaked) throw new Error(leaked + ' key presses reached the app');
        doc.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        if (fx.i !== 1) throw new Error('ArrowRight did not advance');
        doc.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (fx.open() || doc.getElementById('frameTour')) throw new Error('Esc left the tour up');
        doc.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
        if (leaked !== 1) throw new Error('keys still swallowed after the tour ended');
        if (!fx.done()) throw new Error('ending the tour did not remember it');
    } finally { doc.removeEventListener('keydown', spy); fx.end(true); fakeLayout(false); }
});

check('Finish on the last step ends it; the x ends it', async () => {
    fx.start({ at: fx.tour.length - 1 });
    const n = doc.querySelector('#frameTour .tour-next');
    if (n.textContent !== 'Finish') throw new Error('last step button reads ' + n.textContent);
    n.click();
    if (doc.getElementById('frameTour')) throw new Error('Finish did not end it');
    fx.start();
    doc.querySelector('#frameTour .tour-x').click();
    if (doc.getElementById('frameTour')) throw new Error('x did not end it');
});

check('Tour this screen = the same steps, filtered to the view', async () => {
    ['dashboard', 'elevation', 'deck'].forEach((v) => {
        const s = fx.forView(v);
        if (s.length < 3) throw new Error(v + ' has only ' + s.length + ' steps');
        s.forEach((x) => { if (fx.tour.indexOf(x) < 0) throw new Error('a screen tour invented its own step'); });
    });
    fx.start({ steps: fx.forView('dashboard') });
    if (doc.querySelector('#frameTour .tour-count').textContent !== '1 of ' + fx.forView('dashboard').length) throw new Error('screen tour count wrong');
    fx.end(true);
});

check('reachable from Help > Start here, with a button that starts it', async () => {
    fx.openHelp();
    fx.section('getting-started');
    const b = doc.querySelector('#helpRefContent [data-tour-start="all"]');
    if (!b) throw new Error('no Take the tour button in Start here');
    b.click();
    if (!fx.open()) throw new Error('the button did not start the tour');
    if (doc.getElementById('helpModal').style.display === 'flex') throw new Error('Help left open under the tour');
    fx.end(true);
});

check('reachable from the start screen, and the start screen comes back after', async () => {
    fx.setPeek(async () => null);
    await fx.startScreen();
    const l = doc.querySelector('#startScreen .ss-tour');
    if (!l) throw new Error('no tour link on the start screen');
    l.click();
    if (doc.getElementById('startScreen')) throw new Error('start screen still up over the tour');
    if (!fx.open()) throw new Error('tour did not start');
    fx.end();
    await tick(20);
    if (!doc.getElementById('startScreen')) throw new Error('ending the tour did not bring the start screen back');
    doc.getElementById('startScreen').remove();
});

check('the next-step bar offers the tour until it has been taken, and hides under it', async () => {
    try { window.localStorage.removeItem('frameTourDone'); } catch (e) {}
    fx.dismissed = false;
    fx.nextStep();
    const bar = doc.getElementById('nextStep');
    if (!bar) throw new Error('no next-step bar on a fresh project');
    const t = bar.querySelector('.ns-tour');
    if (!t) throw new Error('no Tour button before the tour was taken');
    t.click();
    fx.nextStep();
    if (doc.getElementById('nextStep')) throw new Error('next-step bar shown over the tour');
    fx.end();
    fx.nextStep();
    const bar2 = doc.getElementById('nextStep');
    if (bar2 && bar2.querySelector('.ns-tour')) throw new Error('still offering the tour after it was taken');
});

check('the tour layer sits under an alert and over everything else', async () => {
    if (CSS.indexOf('--z-tour: 100006') < 0) throw new Error('--z-tour not declared at 100006');
    if (CSS.indexOf('z-index: var(--z-tour)') < 0) throw new Error('.frame-tour does not use --z-tour');
    // 100004 progress < 100006 tour < 100010 alert
});

function waitLoaded() {
    return new Promise((r) => { if (doc.readyState !== 'loading') return r(); doc.addEventListener('DOMContentLoaded', () => r()); });
}
(async () => {
    await waitLoaded();
    await tick(250);   // let the boot-time autosave check run first
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
