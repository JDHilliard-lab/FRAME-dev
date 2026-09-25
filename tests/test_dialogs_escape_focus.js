// NO DIALOG CLOSED ON ESCAPE, AND A KEYBOARD COULD NOT FIND ITS WAY AROUND ONE.
//
// There were 21 .frame-modal dialogs and none closed on Escape, while the
// comment above the elevation shortcuts claimed Escape "also closes modals".
// The three dialogs built in JS did close on a backdrop click, and all three had
// the classic bug: `click` fires on the common ancestor of the press and the
// release, so selecting text in a field and letting go past the card's edge
// closed the dialog. Focus never moved into a dialog when it opened, never came
// back when it closed, and Tab wandered off into the page behind the scrim.
//
// runScripts: 'dangerously', unlike most files here, because every close
// control in index.html is an inline onclick="..." attribute, and jsdom's
// 'outside-only' mode never runs those. With it, a click on a close control is a
// no-op and every Escape check would pass or fail for the wrong reason.
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
const tick = () => new Promise((r) => setTimeout(r, 5));

const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'dangerously' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;
const quiet = console.error; console.error = () => {};
window.eval(APP + NL + [
    'window.__fx = {',
    '  top: _modalTop, destroy: _confirmDestroy,',
    '  ask: showConfirmModal, info: showInfoModal,',
    '};',
].join(NL));
console.error = quiet;
const fx = window.__fx;
const doc = window.document;

const open = (id) => { const m = doc.getElementById(id); m.style.display = 'flex'; return m; };
const shut = (id) => { const m = doc.getElementById(id); if (m) m.style.display = 'none'; };
const isOpen = (m) => m && m.isConnected && m.style.display !== 'none';
const key = (target, k, extra) => {
    const ev = new window.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, extra || {}));
    (target || doc.body).dispatchEvent(ev);
    return ev;
};
const allShut = () => doc.querySelectorAll('.frame-modal').forEach((m) => { if (m.style.display !== 'none') m.style.display = 'none'; });

// ── Escape ───────────────────────────────────────────────────────────────
check('Escape closes a dialog, through its own close control', async () => {
    allShut();
    const m = open('helpModal');
    await tick();
    key(doc.body, 'Escape');
    await tick();
    if (isOpen(m)) throw new Error('Escape left the Help dialog open, which is the bug');
});

check('it closes ONLY the one on top', async () => {
    allShut();
    const help = open('helpModal');
    fx.info('Heads up', 'An alert over the help box.');
    await tick();
    key(doc.body, 'Escape');
    await tick();
    if (isOpen(doc.getElementById('infoModal'))) throw new Error('the alert on top stayed open');
    if (!isOpen(help)) throw new Error('one Escape closed the dialog underneath as well');
    key(doc.body, 'Escape');
    await tick();
    if (isOpen(help)) throw new Error('the second Escape did not reach the next dialog down');
});

check('Escape on a confirm means Cancel, and runs the cancel path', async () => {
    allShut();
    let yes = 0, no = 0;
    fx.ask('Proceed?', 'Body.', 'Go', 'Cancel', () => yes++, () => no++);
    await tick();
    key(doc.body, 'Escape');
    await tick();
    if (yes) throw new Error('Escape pressed the YES button');
    if (no !== 1) throw new Error('Escape closed the box without running its cancel path');
});

check('a question with no neutral answer ignores Escape', async () => {
    allShut();
    let answered = 0;
    fx.ask('Restore unsaved work?', 'Body.', 'Restore', 'Discard', () => answered++, () => answered++, { mustChoose: true });
    await tick();
    key(doc.body, 'Escape');
    await tick();
    if (answered) throw new Error('Escape answered a mustChoose question, and one of its answers deletes a backup');
    if (!isOpen(doc.getElementById('infoModal'))) throw new Error('the mustChoose box closed anyway');
    shut('infoModal');
});

check('a full-screen tool keeps Escape for itself', async () => {
    // Inside the floorplan markup and the layout editor Escape already means
    // "cancel the line I am drawing". Losing the whole tool to that reflex is worse.
    allShut();
    const m = open('fpMarkupModal');
    await tick();
    key(doc.body, 'Escape');
    await tick();
    if (!isOpen(m)) throw new Error('Escape closed a full-screen tool');
    shut('fpMarkupModal');
});

check('a busy dialog is not cancelled by Escape', async () => {
    allShut();
    const m = open('batchZipModal');
    await tick();
    key(doc.body, 'Escape');
    await tick();
    if (!isOpen(m)) throw new Error('Escape closed the Frame Pack build while it could still be running');
    shut('batchZipModal');
});

check('Escape inside a textarea is left alone, so a paragraph is not lost to a reflex', async () => {
    allShut();
    const m = open('helpModal');
    const ta = doc.createElement('textarea');
    m.firstElementChild.appendChild(ta);
    await tick();
    ta.focus();
    key(ta, 'Escape');
    await tick();
    ta.remove();
    if (!isOpen(m)) throw new Error('Escape in a textarea closed its dialog');
    shut('helpModal');
});

check('closing a dialog stops the keypress there', async () => {
    // The elevation deselects everything on Escape, and Deck Studio disarms its
    // tool. With a dialog open, closing it is the whole meaning of the key.
    allShut();
    open('helpModal');
    await tick();
    let reached = 0;
    const spy = () => { reached++; };
    doc.addEventListener('keydown', spy);
    key(doc.body, 'Escape');
    doc.removeEventListener('keydown', spy);
    if (reached) throw new Error('the Escape that closed a dialog carried on to the page behind it');
});

check('with no dialog open, Escape is untouched', async () => {
    allShut();
    const ev = key(doc.body, 'Escape');
    if (ev.defaultPrevented) throw new Error('Escape was swallowed with nothing to close');
});

// ── the backdrop ─────────────────────────────────────────────────────────
const press = (downOn, upOn) => {
    downOn.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    upOn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
};

check('a click on the backdrop closes a dialog with nothing to lose', async () => {
    allShut();
    const m = open('helpModal');
    await tick();
    press(m, m);
    await tick();
    if (isOpen(m)) throw new Error('clicking the Help backdrop did not close it');
});

check('EXACT BUG: a drag that STARTS in the card and ends on the backdrop does not close it', async () => {
    allShut();
    const m = open('helpModal');
    await tick();
    const inner = m.querySelector('h3') || m.firstElementChild;
    // click is dispatched at the common ancestor of the press and the release -
    // the overlay - which is exactly what fooled the old e.target === ov checks.
    press(inner, m);
    await tick();
    if (!isOpen(m)) throw new Error('selecting text and releasing past the card edge closed the dialog');
    shut('helpModal');
});

check('the backdrop does NOT close a dialog holding work', async () => {
    allShut();
    const m = open('bulkEditModal');
    await tick();
    press(m, m);
    await tick();
    if (!isOpen(m)) throw new Error('a stray click outside Bulk Edit threw the edit away');
    shut('bulkEditModal');
});

// ── every dialog is covered ──────────────────────────────────────────────
check('every dialog in index.html has ONE close control, or says why not', async () => {
    const bad = [];
    doc.querySelectorAll('.frame-modal').forEach((m) => {
        if (m.id === 'specPdfModal') return;             // predates the Deck tab; never shown
        if (m.id === 'infoModal') return;                // its buttons are built per call
        if (m.hasAttribute('data-modal-busy')) return;
        const n = m.querySelectorAll('[data-modal-close]').length;
        if (n !== 1) bad.push(m.id + ' has ' + n);
    });
    if (bad.length) throw new Error('dialogs Escape cannot close properly: ' + bad.join(', '));
});

check('the dialogs built in JS use the shared shell, not their own overlay', async () => {
    ['versionsModal', 'bulkReplaceModal', 'dsMockPick', 'spacingScopePopup'].forEach((id) => {
        const i = APP.indexOf("ov.id = '" + id + "'") >= 0 ? APP.indexOf("ov.id = '" + id + "'") : APP.indexOf("wrap.id = '" + id + "'");
        if (i < 0) throw new Error('could not find ' + id);
        const body = APP.slice(i, APP.indexOf(NL + '}', i));
        if (body.indexOf("'frame-modal") < 0) throw new Error(id + ' does not use the .frame-modal shell');
        if (body.indexOf('data-modal-close') < 0) throw new Error(id + ' has no close control for Escape');
        if (body.indexOf('z-index:1000') >= 0) throw new Error(id + ' still carries its own z-index');
    });
    if (APP.indexOf('e.target === ov) ov.remove()') >= 0 || APP.indexOf('e.target === wrap) wrap.remove()') >= 0) {
        throw new Error('a hand-rolled backdrop handler survived, with the drag-release bug in it');
    }
});

check('an alert raised from inside Versions now renders ABOVE it', async () => {
    // Versions and Bulk Images sat at z-index 100040 over the alert box at 100010,
    // so "Could not save the version" appeared behind the dialog that raised it.
    const i = APP.indexOf("ov.id = 'versionsModal'");
    const body = APP.slice(i, APP.indexOf(NL + '}', i));
    if (body.indexOf('fm-nested') < 0) throw new Error('Versions is not on the nested layer');
    if (body.indexOf('z-index:100040') >= 0) throw new Error('Versions still out-ranks the alert box');
});

check('every dialog announces itself to assistive tech', async () => {
    await tick();
    const bad = [];
    doc.querySelectorAll('.frame-modal').forEach((m) => {
        if (m.getAttribute('role') !== 'dialog' || m.getAttribute('aria-modal') !== 'true') bad.push(m.id);
    });
    if (bad.length) throw new Error('no dialog role on: ' + bad.join(', '));
});

// ── focus ────────────────────────────────────────────────────────────────
check('focus moves INTO a dialog when it opens, and BACK when it closes', async () => {
    allShut();
    const opener = doc.getElementById('undoBtn');
    opener.disabled = false;
    opener.focus();
    if (doc.activeElement !== opener) throw new Error('setup: could not focus the opener');
    const m = open('helpModal');
    await tick();
    if (!m.contains(doc.activeElement)) throw new Error('focus stayed on the page behind the dialog');
    key(doc.body, 'Escape');
    await tick();
    if (doc.activeElement !== opener) throw new Error('closing the dialog dropped focus instead of returning it to what opened it');
});

check('a destructive confirm starts on CANCEL, so a reflexive Enter does not delete', async () => {
    allShut();
    fx.destroy({ title: 'Delete the wall?', undoable: true, onConfirm: () => {} });
    await tick();
    // By POSITION and role rather than label text: showConfirmModal writes its
    // labels through innerText, which jsdom does not implement, so under test the
    // buttons carry no text at all and a text match cannot tell them apart.
    const btns = doc.querySelectorAll('#infoModalButtons button');
    const a = doc.activeElement;
    if (btns.length !== 2) throw new Error('setup: expected a Delete and a Cancel button');
    if (a === btns[0]) throw new Error('focus started on the DESTRUCTIVE button, so Enter deletes');
    if (a !== btns[1]) throw new Error('focus did not land on Cancel at all');
    if (!a.hasAttribute('data-modal-close')) throw new Error('the focused button is not the cancel control');
    const yes = btns[0];
    if (!yes.classList.contains('btn-danger')) throw new Error('the destructive button is not painted as destructive');
    shut('infoModal');
});

check('Tab stays inside the open dialog', async () => {
    allShut();
    // Help, because it holds several controls. The first version of this check used
    // the Shortcuts box, which has ONE button - so first and last were the same
    // element, and it passed with the trap deleted.
    const m = open('helpModal');
    await tick();
    const f = Array.from(m.querySelectorAll('button')).filter((x) => x.style.display !== 'none');
    if (f.length < 2) throw new Error('setup: a trap check needs a dialog with at least two controls');
    f[f.length - 1].focus();
    key(doc.activeElement, 'Tab');
    if (!m.contains(doc.activeElement)) throw new Error('Tab walked out of the dialog into the page behind it');
    if (doc.activeElement !== f[0]) throw new Error('Tab from the last control did not wrap to the first');
    f[0].focus();
    key(doc.activeElement, 'Tab', { shiftKey: true });
    if (doc.activeElement !== f[f.length - 1]) throw new Error('Shift+Tab from the first control did not wrap to the last');
    shut('helpModal');
});

// ── keyboard reach ───────────────────────────────────────────────────────
check('the view tabs are reachable by keyboard and pressed by Enter', async () => {
    allShut();
    window.renderNavTabs();
    const tabs = doc.querySelectorAll('#nav-tabs-fixed .nav-tab');
    if (tabs.length < 3) throw new Error('setup: expected the three view tabs');
    tabs.forEach((t) => {
        if (t.getAttribute('tabindex') !== '0') throw new Error('a view tab is not in the Tab order: ' + t.textContent.trim());
        if (t.getAttribute('role') !== 'tab') throw new Error('a view tab does not say it is a tab');
    });
    let went = null;
    const real = window.switchView;
    window.switchView = (v) => { went = v; };
    try {
        const deck = Array.from(tabs).find((t) => t.textContent.indexOf('Deck') >= 0);
        deck.focus();
        key(deck, 'Enter');
    } finally { window.switchView = real; }
    if (went !== 'deck') throw new Error('Enter on the Deck tab did not switch view, got ' + went);
});

check('a wall can be deleted without a mouse', async () => {
    const i = APP.indexOf('<span class="tab-close"');
    if (i < 0) throw new Error('could not find the wall delete control');
    const tag = APP.slice(i, APP.indexOf('>', i));
    if (tag.indexOf('tabindex="0"') < 0) throw new Error('the wall delete is not in the Tab order');
    if (tag.indexOf('data-kbd-click') < 0) throw new Error('Enter does not press the wall delete');
    if (tag.indexOf('aria-label=') < 0) throw new Error('the wall delete is an unlabelled x to a screen reader');
});

check('Space on a pressed div does not also scroll the page', async () => {
    allShut();
    window.renderNavTabs();
    const t = doc.querySelector('#nav-tabs-fixed .nav-tab');
    const real = window.switchView;
    window.switchView = () => {};
    let ev;
    try { ev = key(t, ' '); } finally { window.switchView = real; }
    if (!ev.defaultPrevented) throw new Error('Space pressed the tab and scrolled the page as well');
});

check('keyboard focus is visible on buttons, checkboxes and sliders', async () => {
    const need = ['button:focus-visible', 'input[type="checkbox"]:focus-visible',
        'input[type=range]:focus-visible::-webkit-slider-thumb', 'input[type=range]:focus-visible::-moz-range-thumb'];
    need.forEach((sel) => { if (CSS.indexOf(sel) < 0) throw new Error('no focus style for ' + sel); });
    const i = CSS.indexOf('button:focus-visible');
    const rule = CSS.slice(i, CSS.indexOf('}', i));
    if (rule.indexOf('outline: 2px solid') < 0) throw new Error('the focus rule does not draw a ring');
});

check('the shortcut comment no longer promises something that did not happen', async () => {
    if (APP.indexOf('(also closes modals') >= 0) throw new Error('the stale "also closes modals" comment is back');
});

// ── run ─────────────────────────────────────────────────────────────────
function waitLoaded() {
    return new Promise((r) => {
        if (doc.readyState !== 'loading') return r();
        doc.addEventListener('DOMContentLoaded', () => r());
    });
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
