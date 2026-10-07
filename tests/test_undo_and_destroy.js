// UNDO WAS INVISIBLE, AND THE DELETE QUESTIONS WERE NOT TELLING THE TRUTH.
//
// updateUndoButtons() enabled and disabled #undoBtn and #redoBtn, and neither
// element existed - so undo was Ctrl+Z only, with nothing on screen saying it
// was there, and it said nothing when used, though the change it takes back is
// often on a view you are not looking at.
//
// Deleting a wall asked "This cannot be undone" when it could be. And five
// deletes - a text style, a template, a template category, a floorplan
// category, a timeline stage - wrote the project WITHOUT pushing history, so
// they really could not be undone, while their question said nothing either
// way. Sixteen confirm() calls and twelve alert() calls arrived as browser
// chrome in wording that varied call by call.
//
// runScripts: 'dangerously' so the inline onclick on the real Undo button runs.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = (label, fn) => results.push({ label, fn });
const tick = () => new Promise((r) => setTimeout(r, 5));

const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
    { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'dangerously' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;
const quiet = console.error; console.error = () => {};
window.eval(APP + NL + [
    // jsdom has no IndexedDB, so the first autosave fails and raises its once-per-session
    // warning ~500ms in, landing on whichever check is running and blocking undo there.
    // This file is not about autosave, so mark it already said.
    '_autosaveToldUser = true;',
    'window.__fx = {',
    '  push: pushHistory, undo: undo, redo: redo,',
    '  get undoN() { return undoStack.length; }, get redoN() { return redoStack.length; },',
    '  get elevs() { return elevations; }, set elevs(v) { elevations = v; },',
    '  get rows() { return dashProjectData; }, set rows(v) { dashProjectData = v; },',
    '  get ed() { return editorialContent; },',
    '  resetHistory: function () { undoStack.length = 0; redoStack.length = 0; _isFirstHistoryPush = true; },',
    '  delWall: deleteElevation, delStyle: _dsDeleteStyle, delTpl: _dsDeleteUserTemplate, delCat: _dsDeleteCategory,',
    '  artCats: _artCats, artCatsEnsure: _artCatsEnsure,',
    '  quietRenders: function () {',
    '    _dsRenderStylesTab = function () {}; _dsRenderTemplatesTab = function () {};',
    '  },',
    '};',
].join(NL));
console.error = quiet;
const fx = window.__fx;
const doc = window.document;

// The real dialog is used throughout; this records what it was ASKED and then
// presses a button. Its labels go through innerText, which jsdom does not
// implement, so reading the question off the DOM would read nothing.
let asked = null;
let answer = 'yes';
const realConfirm = window.showConfirmModal;
window.showConfirmModal = function (title, body, yes, no, onYes, onNo, opts) {
    asked = { title: title || '', body: body || '', yes: yes || '', no: no || '', opts: opts || {} };
    realConfirm.apply(this, arguments);
    const btns = doc.querySelectorAll('#infoModalButtons button');
    if (answer === 'yes' && btns[0]) btns[0].click();
    if (answer === 'no' && btns[1]) btns[1].click();
};
const toastText = () => Array.from(doc.querySelectorAll('.frame-toast')).map((t) => t.textContent).join(' || ');
const clearToasts = () => doc.querySelectorAll('.frame-toast').forEach((t) => t.remove());

const wall = (id, name, x) => ({ id, name, wallW: 185, wallH: 108, personPos: { x: -60 },
    frames: [{ id: 'ART-1', letter: 'A', x: x, y: 40, w: 30, h: 24, active: true }] });
const setup = () => {
    fx.elevs = [wall('w_lobby', 'Lobby', 10), wall('w_suite', 'Suite', 50)];
    fx.rows = [{ id: 'ART-1', extW: 30, extH: 24 }, { id: 'ART-2', extW: 20, extH: 20 }];
    fx.resetHistory();
    fx.push();                     // the baseline
    clearToasts();
};

// ── undo is on screen ───────────────────────────────────────────────────
check('EXACT BUG: the Undo and Redo buttons the code manages actually exist', async () => {
    const u = doc.getElementById('undoBtn'), r = doc.getElementById('redoBtn');
    if (!u || !r) throw new Error('updateUndoButtons is still managing buttons that are not on the page');
    if (!u.getAttribute('aria-label') || !r.getAttribute('aria-label')) throw new Error('icon-only buttons with no name');
    if ((u.title || '').indexOf('Ctrl+Z') < 0) throw new Error('the Undo button does not say its shortcut');
});

check('they follow the history: off with nothing to undo, on once there is', async () => {
    setup();
    const u = doc.getElementById('undoBtn'), r = doc.getElementById('redoBtn');
    if (!u.disabled) throw new Error('Undo is enabled with nothing to undo');
    fx.elevs[0].frames[0].x = 20; fx.push();
    if (u.disabled) throw new Error('Undo stayed disabled after an edit');
    if (!r.disabled) throw new Error('Redo is enabled with nothing to redo');
    u.click();
    await tick();
    if (fx.elevs[0].frames[0].x !== 10) throw new Error('the Undo BUTTON did not undo');
    if (r.disabled) throw new Error('Redo stayed disabled after an undo');
});

// ── undo says where ─────────────────────────────────────────────────────
check('undo names the WALL it changed, since that wall may not be on screen', async () => {
    setup();
    fx.elevs[1].frames[0].x = 90; fx.push();
    clearToasts();
    fx.undo();
    await tick();
    const t = toastText();
    if (t.indexOf('Undone') < 0) throw new Error('undo said nothing at all');
    if (t.indexOf('Suite') < 0) throw new Error('undo did not say which wall changed: ' + t);
    if (t.indexOf('Lobby') >= 0) throw new Error('undo named a wall that did not change: ' + t);
});

check('and names the PIECE when a spec changed', async () => {
    setup();
    fx.rows[1].extW = 44; fx.push();
    clearToasts();
    fx.undo();
    await tick();
    if (toastText().indexOf('ART-2') < 0) throw new Error('undo did not name the piece: ' + toastText());
});

check('redo says where too', async () => {
    setup();
    fx.elevs[0].frames[0].x = 33; fx.push();
    fx.undo();
    clearToasts();
    fx.redo();
    await tick();
    const t = toastText();
    if (t.indexOf('Redone') < 0 || t.indexOf('Lobby') < 0) throw new Error('redo did not say where: ' + t);
});

check('an undo with nothing to undo says so, instead of doing nothing silently', async () => {
    setup();
    clearToasts();
    fx.undo();
    await tick();
    if (toastText().indexOf('Nothing to undo') < 0) throw new Error('a dead Ctrl+Z gave no feedback');
});

check('ten presses are one conversation, not ten stacked notices', async () => {
    setup();
    for (let i = 0; i < 5; i++) { fx.elevs[0].frames[0].x = 11 + i; fx.push(); }
    clearToasts();
    for (let i = 0; i < 5; i++) fx.undo();
    await tick();
    const n = doc.querySelectorAll('.frame-toast').length;
    if (n !== 1) throw new Error(n + ' undo notices stacked up');
});

check('Ctrl+Z does not change the project BEHIND an open dialog', async () => {
    setup();
    fx.elevs[0].frames[0].x = 77; fx.push();
    const m = doc.getElementById('bulkEditModal');
    m.style.display = 'flex';
    await tick();
    clearToasts();
    fx.undo();
    m.style.display = 'none';
    await tick();
    if (fx.elevs[0].frames[0].x !== 77) throw new Error('undo reverted the project behind a dialog, with nothing on screen showing it');
    if (toastText().indexOf('Close the dialog') < 0) throw new Error('undo was refused without saying why');
});

check('but it DOES work inside a full-screen tool, where the editing happens', async () => {
    setup();
    fx.elevs[0].frames[0].x = 66; fx.push();
    const m = doc.getElementById('moodboardModal');
    m.style.display = 'flex';
    await tick();
    fx.undo();
    m.style.display = 'none';
    await tick();
    if (fx.elevs[0].frames[0].x !== 10) throw new Error('undo was blocked inside the layout editor');
});

// ── the wall delete told the wrong story ────────────────────────────────
check('EXACT BUG: deleting a wall says it CAN be undone - and it can', async () => {
    setup();
    answer = 'yes'; asked = null;
    fx.delWall(0, { stopPropagation() {} });
    await tick();
    if (!asked) throw new Error('deleting a wall did not ask');
    if (asked.body.indexOf('cannot be undone') >= 0) throw new Error('the question still says a wall delete cannot be undone');
    if (asked.body.indexOf('Ctrl+Z') < 0) throw new Error('the question does not say the delete can be undone');
    if (asked.title.indexOf('Lobby') < 0) throw new Error('the question does not name the wall: ' + asked.title);
    if (!asked.opts.danger) throw new Error('the delete button is not marked destructive');
    if (fx.elevs.some((e) => e.name === 'Lobby')) throw new Error('confirming did not delete the wall');
    fx.undo();
    await tick();
    const back = fx.elevs.find((e) => e.name === 'Lobby');
    if (!back) throw new Error('THE BAD ONE: the dialog promised undo and undo did not bring the wall back');
    if (back.id !== 'w_lobby') throw new Error('the wall came back as a different wall');
});

check('cancelling a wall delete leaves it alone', async () => {
    setup();
    answer = 'no';
    fx.delWall(0, { stopPropagation() {} });
    await tick();
    answer = 'yes';
    if (!fx.elevs.some((e) => e.name === 'Lobby')) throw new Error('Cancel deleted the wall anyway');
});

check('the wall is found by ID when the answer arrives, not by its old slot', async () => {
    // The question is asynchronous now. If anything reorders the walls while it is
    // up, deleting "slot 0" would delete whichever wall moved into it.
    setup();
    answer = 'later';
    fx.delWall(0, { stopPropagation() {} });
    const yes = doc.querySelectorAll('#infoModalButtons button')[0];
    fx.elevs = [fx.elevs[1], fx.elevs[0]];      // Suite now sits in slot 0
    yes.click();
    await tick();
    answer = 'yes';
    if (!fx.elevs.some((e) => e.name === 'Suite')) throw new Error('THE BAD ONE: it deleted the wall that slid into the slot');
    if (fx.elevs.some((e) => e.name === 'Lobby')) throw new Error('the wall that was asked about survived');
});

// ── the deletes that could not be undone at all ─────────────────────────
check('a deleted TEXT STYLE comes back with undo', async () => {
    fx.quietRenders();
    setup();
    fx.ed.textStyles = [{ id: 'sty_hotel', name: 'Hotel Heading', font: 'display', size: 0.05 }];
    fx.push();
    fx.delStyle('sty_hotel');
    await tick();
    if ((fx.ed.textStyles || []).some((x) => x.id === 'sty_hotel')) throw new Error('setup: the style was not deleted');
    fx.undo();
    await tick();
    if (!(fx.ed.textStyles || []).some((x) => x.id === 'sty_hotel')) throw new Error('THE BAD ONE: a style delete still cannot be undone');
    if (asked.body.indexOf('Ctrl+Z') < 0) throw new Error('the style delete does not say it can be undone');
});

check('a deleted TEMPLATE comes back with undo, and its follow-up runs AFTER the delete', async () => {
    fx.quietRenders();
    setup();
    fx.ed.templates = [{ name: 'Hotel Cover', type: 'moodboard', elements: [] }];
    fx.push();
    let afterSaw = -1;
    fx.delTpl(0, () => { afterSaw = fx.ed.templates.length; });
    await tick();
    if (fx.ed.templates.length !== 0) throw new Error('setup: the template was not deleted');
    if (afterSaw !== 0) throw new Error('the follow-up ran before the delete had happened');
    fx.undo();
    await tick();
    if (!fx.ed.templates.some((t) => t.name === 'Hotel Cover')) throw new Error('THE BAD ONE: a template delete still cannot be undone');
    if (asked.title.indexOf('Hotel Cover') < 0) throw new Error('the question does not name the template');
});

check('a cancelled template delete does not run the follow-up', async () => {
    fx.quietRenders();
    setup();
    fx.ed.templates = [{ name: 'Keep Me', type: 'moodboard', elements: [] }];
    fx.push();
    answer = 'no';
    let ran = false;
    fx.delTpl(0, () => { ran = true; });
    await tick();
    answer = 'yes';
    if (ran) throw new Error('cancelling still exited the template edit session');
    if (fx.ed.templates.length !== 1) throw new Error('cancelling deleted the template');
});

check('a deleted TEMPLATE CATEGORY comes back with undo, templates and all', async () => {
    fx.quietRenders();
    setup();
    fx.ed.templateCategories = [{ key: 'hotel', label: 'Hotel' }];
    fx.ed.templates = [{ name: 'Lobby Board', type: 'hotel', elements: [] }];
    fx.push();
    fx.delCat('hotel');
    await tick();
    if (fx.ed.templates[0].type !== 'moodboard') throw new Error('setup: the category delete did not move its templates');
    fx.undo();
    await tick();
    if (!(fx.ed.templateCategories || []).some((c) => c.key === 'hotel')) throw new Error('THE BAD ONE: a category delete still cannot be undone');
    if (fx.ed.templates[0].type !== 'hotel') throw new Error('undo brought the category back but left its templates in Moodboard');
});

check('the floorplan category delete matches by KEY, because the list it loops is not the list it edits', async () => {
    // Until a project customises its categories, _artCats() hands back the BUILT-IN
    // constant and _artCatsEnsure() writes a COPY. An object from the one is not in
    // the other, so matching by object - the obvious rewrite - would delete nothing.
    fx.ed.artCategories = [];
    const shown = fx.artCats()[0];
    const edited = fx.artCatsEnsure();
    if (edited.indexOf(shown) >= 0) throw new Error('setup: the two lists are the same array, so this check proves nothing');
    const i = APP.indexOf("title: 'Delete the \\u201C' + cc.label");
    const j = APP.indexOf('findIndex(x => x && x.key === cc.key)');
    if (i < 0) throw new Error('could not find the floorplan category delete');
    if (j < 0 || j < i) throw new Error('the category delete no longer matches by key');
    const body = APP.slice(i, APP.indexOf('});', j));
    if (body.indexOf('pushHistory()') < 0) throw new Error('a floorplan category delete still cannot be undone');
});

check('a timeline stage delete pushes history, at the delete and not on every keystroke', async () => {
    const i = APP.indexOf("title: 'Delete the \\u201C' + (s.label || 'Stage '");
    if (i < 0) throw new Error('could not find the stage delete');
    const body = APP.slice(i, APP.indexOf('});', APP.indexOf('_tlWriteStages(st2, order);', i)) + 3);
    if (body.indexOf('pushHistory()') < 0) throw new Error('a stage delete still cannot be undone');
    const w = APP.indexOf('function _tlWriteStages');
    if (APP.slice(w, APP.indexOf(NL + '}', w)).indexOf('pushHistory') >= 0) {
        throw new Error('history moved inside _tlWriteStages, which runs on every keystroke of a stage label');
    }
});

// ── the rules every question follows ────────────────────────────────────
check('no native confirm() or alert() is left', async () => {
    const shapes = ["confirm('", 'confirm("', 'confirm(`', "alert('", 'alert("', 'alert(`'];
    const hits = [];
    shapes.forEach((sh) => {
        let i = -1;
        while ((i = APP.indexOf(sh, i + 1)) >= 0) {
            const before = APP[i - 1] || '';
            if (/[A-Za-z_.$]/.test(before)) continue;          // showConfirm(...), obj.alert(...)
            hits.push(APP.slice(i, i + 50));
        }
    });
    if (hits.length) throw new Error('native dialogs remain: ' + hits.join(' | '));
});

check('every destroy question states whether undo will bring it back', async () => {
    // The sentence it picks is a promise, so there is no default and every caller
    // has to decide.
    let i = -1, n = 0;
    const missing = [];
    while ((i = APP.indexOf('_confirmDestroy({', i + 1)) >= 0) {
        n++;
        const call = APP.slice(i, APP.indexOf('onConfirm', i));
        if (call.indexOf('undoable:') < 0) missing.push(APP.slice(i, i + 80));
    }
    if (n < 10) throw new Error('only ' + n + ' destroy questions found; the conversion is incomplete');
    if (missing.length) throw new Error('these do not say whether undo works: ' + missing.join(' | '));
});

check('the version delete - outside the project - says it CANNOT be undone', async () => {
    const i = APP.indexOf("title: 'Delete this version?'");
    if (i < 0) throw new Error('could not find the version delete');
    const call = APP.slice(i, APP.indexOf('onConfirm', i));
    if (call.indexOf('undoable: false') < 0) throw new Error('the version delete promises an undo it cannot give');
});

check('a plan detail has ONE delete, not three that disagree', async () => {
    if (APP.split('function _deletePlanDetail').length - 1 !== 1) throw new Error('missing _deletePlanDetail');
    if (APP.split('_deletePlanDetail(').length - 1 < 4) throw new Error('not every plan-detail delete goes through the one function');
    if (APP.indexOf("'Delete this breaker'") >= 0) throw new Error('a plan detail is still called a breaker, which is a different page');
});

check('alerts were sorted by the house rule: nudges on a toast, failures in a box', async () => {
    const nudge = ['That is the last row', 'Nothing selected', 'Pushed to wall', 'No wall chosen'];
    nudge.forEach((t) => { if (APP.indexOf("_toast('" + t + "'") < 0) throw new Error('"' + t + '" is not a toast'); });
    const box = ['Image export failed', 'Could not load that swatch', 'Not a preset file'];
    box.forEach((t) => { if (APP.indexOf("showInfoModal('" + t + "'") < 0) throw new Error('"' + t + '" is not a modal'); });
});

// ── run ─────────────────────────────────────────────────────────────────
function waitLoaded() {
    return new Promise((r) => { if (doc.readyState !== 'loading') return r(); doc.addEventListener('DOMContentLoaded', () => r()); });
}
(async () => {
    await waitLoaded();
    await tick();
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
