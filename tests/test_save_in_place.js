// SAVE ALWAYS WROTE A NEW FILE, SO NOBODY KNEW WHICH ONE WAS CURRENT.
//
// saveMasterProject downloaded a .json named from the project name plus today's
// date. A week on one job left five caesars-palace_2026-09-0*.json in Downloads
// with nothing saying which was the live one, and two designers on one project
// had no story at all.
//
// The fix is that a project opened through a file HANDLE is saved back to that
// same file. The risk the fix introduces is the opposite one and much worse:
// writing this project over a DIFFERENT file. So the checks below spend most of
// their time on the binding rules rather than on the happy path.
//
// The fake File System Access API here actually writes bytes into a fake disk
// and hands them back, because a stub that swallows its arguments cannot notice
// it was asked to write to the wrong place.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = (label, fn) => results.push({ label, fn });
const settle = () => new Promise((r) => setTimeout(r, 20));

// ── a fake File System Access API that really stores ────────────────────
function makeDisk() {
    const d = { files: {}, savePicks: [], openPicks: [], suggested: [], nextSave: null, nextOpen: null, denyPermission: false, failWrite: false };
    function handleFor(name) {
        return {
            name,
            queryPermission: () => Promise.resolve(d.denyPermission ? 'prompt' : 'granted'),
            requestPermission: () => Promise.resolve(d.denyPermission ? 'denied' : 'granted'),
            getFile: () => Promise.resolve({
                name,
                text: () => Promise.resolve(d.files[name] === undefined ? '' : d.files[name]),
            }),
            createWritable: () => {
                if (d.failWrite) return Promise.reject(new Error('disk is full'));
                let buf = '';
                return Promise.resolve({
                    write: (t) => { buf += t; return Promise.resolve(); },
                    close: () => { d.files[name] = buf; return Promise.resolve(); },
                });
            },
        };
    }
    d.handleFor = handleFor;
    d.showSaveFilePicker = (opts) => {
        d.suggested.push((opts && opts.suggestedName) || '');
        const name = d.nextSave;
        if (!name) { const e = new Error('user cancelled'); e.name = 'AbortError'; return Promise.reject(e); }
        d.savePicks.push(name);
        return Promise.resolve(handleFor(name));
    };
    d.showOpenFilePicker = () => {
        const name = d.nextOpen;
        if (!name) { const e = new Error('user cancelled'); e.name = 'AbortError'; return Promise.reject(e); }
        d.openPicks.push(name);
        return Promise.resolve([handleFor(name)]);
    };
    return d;
}

const disk = makeDisk();
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
    { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
window.showSaveFilePicker = (o) => disk.showSaveFilePicker(o);
window.showOpenFilePicker = (o) => disk.showOpenFilePicker(o);
// The download fallback, watched rather than stubbed away: several checks below
// turn on whether the work still leaves the tab when writing in place fails.
const downloads = [];
window.URL.createObjectURL = () => 'blob:fake';
window.HTMLAnchorElement.prototype.click = function () { if (this.download) downloads.push(this.download); };
global.window = window; global.document = window.document; global.navigator = window.navigator;

const TAIL = [
    'window.__fx = {',
    '  save: saveMasterProject, saveAs: saveMasterProjectAs, open: openMasterProject,',
    '  load: loadMasterProject, readText: _readProjectText, payload: _projectPayload,',
    '  setFile: _setProjectFile,',
    '  get handle() { return _projectFileHandle; },',
    '  get fileName() { return _projectFileName; },',
    '  get dirty() { return _isDirty; },',
    '  markDirty: markDirty, markClean: markClean,',
    '  stub: function (o) {',
    '    if (o.showConfirmModal) showConfirmModal = o.showConfirmModal;',
    '    if (o.showInfoModal) showInfoModal = o.showInfoModal;',
    '    if (o.toast) _toast = o.toast;',
    '    if (o.readText) _readProjectText = o.readText;',
    '  },',
    '};',
].join(NL);
window.eval(APP + NL + TAIL);
const fx = window.__fx;
const doc = window.document;

const infos = [];
const toasts = [];
let confirmAnswer = true;
fx.stub({
    showInfoModal: (t, b) => infos.push({ title: t || '', body: b || '' }),
    showConfirmModal: (t, b, y, n, onYes, onNo) => { if (confirmAnswer) onYes && onYes(); else onNo && onNo(); },
    toast: (t, b) => { toasts.push({ title: t || '', body: b || '' }); return null; },
});
// The install path is exercised for real in its own check below. Everywhere
// else it is replaced so these checks are about the BINDING and not about the
// forty functions installing a project touches.
let installOk = true;
const installed = [];
fx.stub({ readText: (text) => { installed.push(text); return installOk; } });

const saveBtn = (() => { let b = null; doc.querySelectorAll('.app-top-nav button').forEach(x => { if (x.textContent.trim() === 'Save Project') b = x; }); return b; })();
const reset = () => { infos.length = 0; toasts.length = 0; downloads.length = 0; installed.length = 0; disk.savePicks.length = 0; disk.openPicks.length = 0; disk.suggested.length = 0; disk.denyPermission = false; disk.failWrite = false; confirmAnswer = true; installOk = true; fx.setFile(null, ''); fx.markClean(); };

// ── THE BUG ─────────────────────────────────────────────────────────────
check('the first save asks where, and the SECOND writes the same file again', async () => {
    reset();
    disk.nextSave = 'caesars.json';
    doc.getElementById('g_projName').value = 'Caesars Palace';
    await fx.save();
    if (disk.savePicks.length !== 1) throw new Error('the first save did not ask where to put the file');
    if (!disk.files['caesars.json']) throw new Error('nothing was written');
    const first = disk.files['caesars.json'];

    // Now change something and save again. THIS is the bug: it used to produce a
    // second file and leave the designer to work out which one was current.
    doc.getElementById('g_desc').value = 'second pass';
    fx.markDirty();
    await fx.save();
    if (disk.savePicks.length !== 1) throw new Error('the second save asked again instead of writing back to the bound file');
    if (Object.keys(disk.files).length !== 1) throw new Error('saving twice produced ' + Object.keys(disk.files).length + ' files');
    if (disk.files['caesars.json'] === first) throw new Error('the second save did not actually update the file');
    if (JSON.parse(disk.files['caesars.json']).globalMeta.desc !== 'second pass') throw new Error('the file does not carry the edit');
    if (downloads.length) throw new Error('it downloaded a copy as well, which is the pile of files this replaces');
});

check('what was written is a real project file', async () => {
    const data = JSON.parse(disk.files['caesars.json']);
    if (data.type !== 'master-studio-v6') throw new Error('the written file is not a FRAME project');
    if (!data.globalMeta || !data.elevations || !data.dashProjectData) throw new Error('the written file is missing whole sections');
    if (!data.annotationStyle) throw new Error('the drafting standard did not travel with the file');
});

check('opening through a handle binds it, so Save goes straight back', async () => {
    reset();
    disk.files['guestrooms.json'] = JSON.stringify({ type: 'master-studio-v6' });
    disk.nextOpen = 'guestrooms.json';
    fx.open();
    await settle();
    if (disk.openPicks.length !== 1) throw new Error('the picker was never opened');
    if (installed.length !== 1) throw new Error('the file was read but never installed');
    if (fx.fileName !== 'guestrooms.json') throw new Error('the opened file was not bound, it is ' + JSON.stringify(fx.fileName));
    disk.nextSave = null;   // any picker call from here is a failure
    fx.markDirty();
    await fx.save();
    if (disk.savePicks.length) throw new Error('Save asked where to go instead of writing back to the opened file');
    if (JSON.parse(disk.files['guestrooms.json']).type !== 'master-studio-v6') throw new Error('the opened file was not written back');
});

// ── the binding rules, which are the dangerous half ─────────────────────
check('the <input type=file> path leaves the project UNBOUND', async () => {
    // This is the one that would overwrite the wrong job. A File from an input
    // cannot be written back to, so if the binding survived, Save would write
    // the project just loaded over whatever file was bound before it.
    reset();
    disk.files['bound.json'] = 'x';
    fx.setFile(disk.handleFor('bound.json'), 'bound.json');
    const dropped = new window.File([JSON.stringify({ type: 'master-studio-v6' })], 'dropped.json', { type: 'application/json' });
    fx.load({ target: { files: [dropped], value: '' } });
    // A FileReader finishes when it finishes. A flat 20ms was enough alone and not with
    // the suite running eight files in parallel, so wait for the install, up to 2s.
    for (let i = 0; i < 100 && installed.length < 1; i++) await settle();
    if (installed.length < 1) throw new Error('the input path never installed anything');
    if (fx.handle) throw new Error('loading from an <input> left the old file bound, so Save would overwrite it');
    if (fx.fileName !== 'dropped.json') throw new Error('the loaded name is not shown, it is ' + JSON.stringify(fx.fileName));
    disk.nextSave = 'newplace.json';
    await fx.save();
    if (disk.savePicks.length !== 1) throw new Error('Save did not ask where to go after an unbound load');
    if (disk.files['bound.json'] !== 'x') throw new Error('THE BAD ONE: the previously bound file was overwritten');
});

check('a file that fails to parse does not bind, and does not disturb the project', async () => {
    reset();
    installOk = false;
    disk.files['broken.json'] = 'not json';
    disk.nextOpen = 'broken.json';
    fx.open();
    await settle();
    if (fx.handle) throw new Error('a file that would not open was bound anyway');
    if (fx.fileName) throw new Error('a file that would not open is being shown as the current one');
});

check('Save As forces the picker and moves the binding to the new file', async () => {
    reset();
    disk.nextSave = 'v1.json';
    await fx.save();
    doc.getElementById('g_desc').value = 'copy';
    fx.markDirty();
    disk.nextSave = 'v2.json';
    await fx.saveAs();
    if (disk.savePicks.length !== 2) throw new Error('Save As did not raise the picker');
    if (fx.fileName !== 'v2.json') throw new Error('Save As did not switch to the new file');
    if (!disk.files['v1.json'] || !disk.files['v2.json']) throw new Error('Save As did not leave both files on disk');
    disk.nextSave = null;
    fx.markDirty();
    await fx.save();
    if (disk.savePicks.length !== 2) throw new Error('Save after a Save As asked again');
    if (JSON.parse(disk.files['v2.json']).globalMeta.desc !== 'copy') throw new Error('Save went to the old file, not the one Save As chose');
});

// ── cancelling and failing ──────────────────────────────────────────────
check('cancelling the picker does NOT mark the project saved', async () => {
    // A cancelled save that clears the unsaved dot is a lie the designer acts on.
    reset();
    fx.markDirty();
    disk.nextSave = null;
    const ok = await fx.save();
    if (ok !== false) throw new Error('a cancelled save reported success');
    if (!fx.dirty) throw new Error('THE BAD ONE: cancelling the picker cleared the unsaved marker');
    if (infos.length) throw new Error('cancelling raised an error box, which trains people to ignore real ones');
    if (downloads.length) throw new Error('cancelling downloaded a copy anyway');
});

check('a write that fails says so AND still gets the work out of the tab', async () => {
    reset();
    disk.nextSave = 'full.json';
    disk.failWrite = true;
    fx.markDirty();
    await fx.save();
    if (!infos.length) throw new Error('a failed write was silent');
    if ((infos[0].title + infos[0].body).toLowerCase().indexOf('download') < 0) throw new Error('the notice does not say what happened instead');
    if (downloads.length !== 1) throw new Error('the work was left trapped in the tab after a failed write');
});

check('a lapsed permission falls back to the picker rather than failing quietly', async () => {
    reset();
    disk.nextSave = 'perm.json';
    await fx.save();
    if (disk.savePicks.length !== 1) throw new Error('setup: the first save should have asked once');
    disk.denyPermission = true;      // the handle is still held, the grant is not
    disk.nextSave = 'perm2.json';
    fx.markDirty();
    await fx.save();
    if (disk.savePicks.length !== 2) throw new Error('a denied permission did not re-raise the picker');
    if (!disk.files['perm2.json']) throw new Error('the save never landed anywhere');
});

// ── the browsers without the API ────────────────────────────────────────
check('with no File System Access API, Save downloads exactly as it used to', async () => {
    reset();
    const savedS = window.showSaveFilePicker, savedO = window.showOpenFilePicker;
    delete window.showSaveFilePicker; delete window.showOpenFilePicker;
    try {
        doc.getElementById('g_projName').value = 'Bellagio Tower';
        fx.markDirty();
        await fx.save();
        if (downloads.length !== 1) throw new Error('Firefox and Safari no longer get a download');
        if (downloads[0].indexOf('Bellagio_Tower') < 0) throw new Error('the download lost the project-name filename: ' + downloads[0]);
        if (downloads[0].slice(-5) !== '.json') throw new Error('the download is not a .json');
        if (fx.handle) throw new Error('a download was treated as a bound file, so the next Save would think it could write back');
        if (fx.dirty) throw new Error('a successful download did not clear the unsaved marker');
    } finally { window.showSaveFilePicker = savedS; window.showOpenFilePicker = savedO; }
});

check('and Load falls back to the hidden file input', async () => {
    reset();
    const savedS = window.showSaveFilePicker, savedO = window.showOpenFilePicker;
    delete window.showSaveFilePicker; delete window.showOpenFilePicker;
    let clicked = 0;
    const inp = doc.getElementById('masterLoad');
    if (!inp) throw new Error('the hidden file input is gone, so there is no fallback at all');
    const realClick = inp.click;
    inp.click = () => { clicked++; };
    try {
        fx.open();
        await settle();
        if (clicked !== 1) throw new Error('Load did not fall back to the file input');
        if (disk.openPicks.length) throw new Error('it reached for an API that is not there');
    } finally { inp.click = realClick; window.showSaveFilePicker = savedS; window.showOpenFilePicker = savedO; }
});

// ── losing work by opening over it ──────────────────────────────────────
check('opening over unsaved changes asks first', async () => {
    // beforeunload covered closing the tab and covered nothing here, so opening a
    // second project over an hour of edits used to be silent.
    reset();
    fx.markDirty();
    confirmAnswer = false;
    disk.files['other.json'] = JSON.stringify({ type: 'master-studio-v6' });
    disk.nextOpen = 'other.json';
    fx.open();
    await settle();
    if (disk.openPicks.length) throw new Error('THE BAD ONE: it opened over unsaved work without asking');
    confirmAnswer = true;
    fx.open();
    await settle();
    if (disk.openPicks.length !== 1) throw new Error('agreeing to discard did not then open the file');
});

check('a clean project opens with no question asked', async () => {
    reset();
    let asked = 0;
    fx.stub({ showConfirmModal: (t, b, y, n, onYes) => { asked++; onYes && onYes(); } });
    disk.files['clean.json'] = JSON.stringify({ type: 'master-studio-v6' });
    disk.nextOpen = 'clean.json';
    fx.open();
    await settle();
    if (asked) throw new Error('it asked about discarding changes on a project with none');
    fx.stub({ showConfirmModal: (t, b, y, n, onYes, onNo) => { if (confirmAnswer) onYes && onYes(); else onNo && onNo(); } });
});

// ── which file am I in ──────────────────────────────────────────────────
check('the bound file is named in the tab title and on the Save button', async () => {
    reset();
    disk.nextSave = 'venetian.json';
    await fx.save();
    if (doc.title.indexOf('venetian.json') < 0) throw new Error('the tab title does not say which file this is: ' + doc.title);
    if (!saveBtn) throw new Error('could not find the Save Project button');
    if ((saveBtn.title || '').indexOf('venetian.json') < 0) throw new Error('the Save button does not say where it will write');
    if ((saveBtn.title || '').indexOf('Ctrl+Shift+S') < 0) throw new Error('Save As is not discoverable anywhere the eye already is');
    if (!toasts.length || toasts[0].body.indexOf('venetian.json') < 0) throw new Error('a save in place gave no feedback at all, unlike a download');
});

check('with nothing bound, the title falls back rather than reading blank', async () => {
    reset();
    if (doc.title.indexOf('FRAME') < 0) throw new Error('the tab title lost its name: ' + doc.title);
    if (doc.title.indexOf('.json') >= 0) throw new Error('the title still names a file after the binding was cleared');
});

// ── one definition of what a project file is ────────────────────────────
check('every save path goes through one payload builder', async () => {
    const i = APP.indexOf('async function saveMasterProject');
    if (i < 0) throw new Error('missing saveMasterProject');
    const body = APP.slice(i, APP.indexOf('function saveMasterProjectAs'));
    if (body.indexOf('_projectPayload()') < 0) throw new Error('the writer does not use the shared payload builder');
    if (body.indexOf("type: 'master-studio-v6'") >= 0) throw new Error('the writer builds its own payload again, which is how a field reaches one save path and not the others');
    if (APP.split("return { type: 'master-studio-v6'").length - 1 !== 1) throw new Error('there is more than one definition of the project payload');
});

check('and both load paths go through one reader', async () => {
    const i = APP.indexOf('function loadMasterProject');
    const body = APP.slice(i, APP.length);
    if (body.indexOf('_readProjectText(') < 0) throw new Error('the input path no longer shares the reader');
    const j = APP.indexOf('function openMasterProject');
    const obody = APP.slice(j, APP.indexOf('function _readProjectText'));
    if (obody.indexOf('_readProjectText(') < 0) throw new Error('the handle path no longer shares the reader');
});

// ── run ─────────────────────────────────────────────────────────────────
(async () => {
    let pass = 0;
    const failed = [];
    for (const r of results) {
        try { await r.fn(); console.log('OK:   ' + r.label); pass++; }
        catch (e) { console.log('FAIL: ' + r.label + ' -> ' + e.message); failed.push(r.label); }
    }
    console.log('');
    console.log('--- Summary ---');
    if (failed.length) { console.log('FAILED (' + failed.length + ' of ' + results.length + ')'); process.exitCode = 1; }
    else console.log('ALL PASSED (' + pass + ')');
})();
