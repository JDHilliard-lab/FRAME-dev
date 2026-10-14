// 18.68: a selected page drawn as a picture (Timeline, Frame Recommendations, Contacts,
// floorplans, spec pages, plan details, options sheets) lost its rail thumbnail.
// The selected cell is a live clone of the centre (_dsSyncActiveThumbnailMirror), taken
// when the page is selected. The centre shows a placeholder first and swaps the real
// canvas in when renderDeckPageCanvas resolves; nothing asked for a new clone after the
// swap, so the cell sat on the placeholder (blank for cards) until another page was
// picked. Every async swap in the centre must re-request the mirror.
// Checked in real headless Chrome over CDP: before the fix all five canvas pages in the
// starter deck mirrored with no canvas; after it, all five carry the rendered page.
const fs = require('fs');
const path = require('path');
const S = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

const results = [];
const check = (label, fn) => { try { fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

const start = S.indexOf('\nfunction _dsRenderCenter(');
const fpStart = S.indexOf('\nfunction _dsRenderCenterFloorplan(');
const fpEnd = S.indexOf('\nfunction ', fpStart + 10);

check('landmarks found', () => {
    if (start < 0) throw new Error('_dsRenderCenter not found');
    if (fpStart < 0 || fpEnd < 0) throw new Error('_dsRenderCenterFloorplan not found');
    if (fpStart < start) throw new Error('_dsRenderCenterFloorplan expected after _dsRenderCenter');
});

// Every renderDeckPageCanvas(...).then(...) in the centre that swaps a canvas in must ask
// for a new mirror inside the same callback (between the swap and the callback's catch).
const swapsIn = (body, label) => {
    let n = 0, i = 0;
    while ((i = body.indexOf('renderDeckPageCanvas(', i)) >= 0) {
        const thenAt = body.indexOf('.then(', i);
        const end = body.indexOf('}).catch(', thenAt);
        if (thenAt < 0 || end < 0) throw new Error(label + ': a renderDeckPageCanvas call has no .then/.catch to read');
        const cb = body.slice(thenAt, end);
        if (cb.indexOf('.appendChild(cv') >= 0) {
            n++;
            const swap = cb.indexOf('.appendChild(cv');
            if (cb.indexOf('_dsRequestThumbnailSync()', swap) < 0) {
                throw new Error(label + ': the canvas swap at offset ' + (start + i) + ' never re-requests the rail mirror');
            }
        }
        i = end;
    }
    return n;
};

check('every async canvas swap in _dsRenderCenter re-requests the rail mirror', () => {
    const n = swapsIn(S.slice(start, fpStart), '_dsRenderCenter');
    if (n < 2) throw new Error('expected the card/plan-detail and spec swaps, found ' + n);
});
check('the floorplan centre swap re-requests the rail mirror', () => {
    const n = swapsIn(S.slice(fpStart, fpEnd), '_dsRenderCenterFloorplan');
    if (n < 1) throw new Error('expected the floorplan base swap, found ' + n);
});
check('the mirror still copies canvas pixels (cloneNode drops them)', () => {
    const a = S.indexOf('\nfunction _dsSyncActiveThumbnailMirror(');
    const b = S.indexOf('\nfunction renderMoodboardCanvas(', a);
    if (a < 0 || b < 0) throw new Error('mirror landmarks not found');
    if (S.slice(a, b).indexOf('_dsCopyCanvasPixels(source, clone)') < 0) throw new Error('pixel copy gone');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ': ' + r.err)));
if (failed.length) { console.log(failed.length + ' failed'); process.exit(1); }
console.log('ALL PASSED (' + results.length + ')');
