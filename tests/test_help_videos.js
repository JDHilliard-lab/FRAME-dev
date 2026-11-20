// 20.70, HELP VIDEO GUIDES. Short recordings (tools/clips) shown in Help > Video guides and the
// Floor plan guide. Every video Help names must exist with its poster, load only on play, and
// reach the network past the service worker (byte-range requests; Safari will not play a cached
// whole response).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const results = [];
const check = (label, fn) => { try { fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };
const vids = [];
APP.replace(/<video src="([^"]+)" poster="([^"]+)"([^>]*)>/g, (m, src, poster, rest) => { vids.push({ src, poster, rest }); return m; });

check('Help has the video guides, and the floor plan guide opens with the first', () => {
    const srcs = vids.map(v => v.src);
    ['help/clips/00-new-project.webm', 'help/clips/01-floor-plan.webm', 'help/clips/02-client-elevation.webm', 'help/clips/03-spec-a-piece.webm', 'help/clips/04-lay-out-the-wall.webm', 'help/clips/05-elevation-tour.webm', 'help/clips/06-deck-pages.webm', 'help/clips/07-preflight-pdf.webm'].forEach(s => { if (srcs.indexOf(s) < 0) throw new Error('missing ' + s); });
    const i = APP.indexOf("id: 'floorplan-guide'"), j = APP.indexOf("id: 'coding'", i);
    if (APP.slice(i, j).indexOf('help/clips/01-floor-plan.webm') < 0) throw new Error('Start here has no video');
    if (APP.indexOf("id: 'videos'") < 0) throw new Error('no Video guides section');
});
check('every video and poster Help names is in the repo, and not huge', () => {
    vids.forEach(v => [v.src, v.poster].forEach(f => {
        const p = path.join(ROOT, f);
        if (!fs.existsSync(p)) throw new Error('no file ' + f);
        if (fs.statSync(p).size > 20 * 1024 * 1024) throw new Error(f + ' is over 20 MB');
    }));
});
check('videos load only when played and have controls', () => {
    vids.forEach(v => { if (v.rest.indexOf('preload="none"') < 0 || v.rest.indexOf('controls') < 0) throw new Error(v.src + ': ' + v.rest); });
});
check('the service worker lets range and video requests go straight to the network', () => {
    const i = SW.indexOf('function onFetch'), body = SW.slice(i, SW.indexOf('\n}\n', i));
    if (body.indexOf("has('range')") < 0 || body.indexOf('webm') < 0) throw new Error('no video bypass in onFetch');
    if (body.indexOf("has('range')") > body.indexOf('respondWith')) throw new Error('bypass comes after a respondWith');
});
check('the recorder keeps client drawings out: its assets are the fictional Tideline ones only', () => {
    const a = fs.readdirSync(path.join(ROOT, 'tools', 'clips', 'assets'));
    a.forEach(f => { if (!/TIDE/.test(f)) throw new Error('unexpected asset ' + f); });
});
results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
const bad = results.filter(r => !r.ok);
console.log('\n--- Summary ---');
console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad.length ? 1 : 0);

