// Range sliders: a thin rule with a small grab dot, the same everywhere.
//
// The request, verbatim: "if you want to change the design of the sliders in the
// settings make sure they match all the sliders everywhere else in the frame tool.
// I feel the sliders are a little chunky and take up alot of room. That can be a
// thinner horizontal line with a smaller circle to grab and drag."
//
// The whole point is CONSISTENCY, so this is deliberately checked as a global rule
// on input[type=range] rather than as a class a slider has to opt into — a class
// would be forgotten on the next slider added and the two looks would coexist,
// which is what the request is asking us to avoid.
//
// The one trap: WebKit and Gecko expose different pseudo-elements for the track and
// the thumb, and NEITHER inherits the other's. A rule written once styles one
// engine and silently leaves the other on the chunky native control.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const H = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const results = [];
const check = (label, fn) => { try { fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

// Grab the declarations of a selector's rule.
const ruleFor = (sel) => {
    const i = CSS.indexOf(sel + ' {');
    if (i < 0) return null;
    return CSS.slice(i + sel.length + 2, CSS.indexOf('}', i));
};
const px = (rule, prop) => {
    const m = new RegExp('(?:^|;|\\s)' + prop + '\\s*:\\s*(-?[\\d.]+)px').exec(rule || '');
    return m ? parseFloat(m[1]) : null;
};

check('EXACT REQUEST: sliders are styled globally, so every one in the tool matches', () => {
    if (!ruleFor('input[type=range]')) throw new Error('there is no input[type=range] rule — the sliders are still the browser default');
    // Not gated behind a class, or the next slider added misses it.
    if (/\.[a-z-]+\s+input\[type=range\]\s*\{/.test(CSS) && !ruleFor('input[type=range]')) throw new Error('the styling is scoped to one container');
    // -webkit-appearance:none on the input itself is what allows the track rule to
    // apply at all; without it WebKit keeps drawing the native control.
    const base = ruleFor('input[type=range]');
    if (!/-webkit-appearance\s*:\s*none/.test(base)) throw new Error('no -webkit-appearance:none, so WebKit ignores the track styling entirely: ' + base);
    if (!/appearance\s*:\s*none/.test(base)) throw new Error('no unprefixed appearance:none: ' + base);
});

check('EXACT REQUEST: the track is a thin horizontal line', () => {
    ['input[type=range]::-webkit-slider-runnable-track', 'input[type=range]::-moz-range-track'].forEach(sel => {
        const rule = ruleFor(sel);
        if (!rule) throw new Error(sel + ' has no rule, so that engine keeps the chunky native track');
        const h = px(rule, 'height');
        if (h === null) throw new Error(sel + ' sets no height: ' + rule);
        if (h > 3) throw new Error(sel + ' is ' + h + 'px tall, which is the chunky look being replaced');
        if (h < 1) throw new Error(sel + ' is ' + h + 'px tall, which is invisible');
    });
});

check('EXACT REQUEST: the thumb is a small circle', () => {
    ['input[type=range]::-webkit-slider-thumb', 'input[type=range]::-moz-range-thumb'].forEach(sel => {
        const rule = ruleFor(sel);
        if (!rule) throw new Error(sel + ' has no rule, so that engine keeps the large native thumb');
        const w = px(rule, 'width'), h = px(rule, 'height');
        if (w === null || h === null) throw new Error(sel + ' does not size the thumb: ' + rule);
        if (w !== h) throw new Error(sel + ' is ' + w + 'x' + h + ', not a circle');
        if (w > 13) throw new Error(sel + ' is ' + w + 'px across — a native thumb is ~16px, so this is no smaller');
        if (w < 8) throw new Error(sel + ' is ' + w + 'px across, too small to grab');
        if (!/border-radius\s*:\s*50%/.test(rule)) throw new Error(sel + ' is not round: ' + rule);
    });
});

check('BOTH engines get identical geometry — one look, not two', () => {
    const wk = ruleFor('input[type=range]::-webkit-slider-thumb');
    const mz = ruleFor('input[type=range]::-moz-range-thumb');
    if (px(wk, 'width') !== px(mz, 'width')) throw new Error('thumb is ' + px(wk, 'width') + 'px on WebKit and ' + px(mz, 'width') + 'px on Gecko');
    const wkt = ruleFor('input[type=range]::-webkit-slider-runnable-track');
    const mzt = ruleFor('input[type=range]::-moz-range-track');
    if (px(wkt, 'height') !== px(mzt, 'height')) throw new Error('track is ' + px(wkt, 'height') + 'px on WebKit and ' + px(mzt, 'height') + 'px on Gecko');
});

check('the WebKit thumb is centred on its track rather than sitting below it', () => {
    // WebKit lays the thumb out on the track's own box, so without a negative
    // margin-top a 11px dot on a 2px track hangs off the bottom of the line.
    const rule = ruleFor('input[type=range]::-webkit-slider-thumb');
    const mt = px(rule, 'margin-top');
    if (mt === null) throw new Error('no margin-top on the WebKit thumb: ' + rule);
    const track = px(ruleFor('input[type=range]::-webkit-slider-runnable-track'), 'height');
    const thumb = px(rule, 'height');
    const want = (track - thumb) / 2;
    if (Math.abs(mt - want) > 0.51) throw new Error('margin-top is ' + mt + 'px; centring an ' + thumb + 'px dot on a ' + track + 'px track wants ' + want + 'px');
});

check('the slider takes less vertical room than the native control it replaces', () => {
    // This is the actual complaint — several stacked in the settings panels.
    const h = px(ruleFor('input[type=range]'), 'height');
    if (h === null) throw new Error('the slider sets no height, so it keeps the native box');
    if (h > 18) throw new Error('the slider still reserves ' + h + 'px of height');
    const base = ruleFor('input[type=range]');
    if (!/margin\s*:\s*0/.test(base)) throw new Error('the default 2px side margins are still there, which misaligns it in a flex row: ' + base);
});

check('the thumb is visible against both themes and reacts to hover', () => {
    // Hardcoding a colour would disappear in one of the two themes.
    const rule = ruleFor('input[type=range]::-webkit-slider-thumb');
    if (!/var\(--/.test(rule)) throw new Error('the thumb colour is hardcoded rather than themed: ' + rule);
    const track = ruleFor('input[type=range]::-webkit-slider-runnable-track');
    if (!/var\(--/.test(track)) throw new Error('the track colour is hardcoded: ' + track);
    if (CSS.indexOf('input[type=range]:hover::-webkit-slider-thumb') < 0) throw new Error('no hover state, so a 11px dot gives no feedback that it is grabbable');
    if (CSS.indexOf('input[type=range]:hover::-moz-range-thumb') < 0) throw new Error('the hover state is WebKit-only');
});

check('the focus outline is dropped, or the thin line gains a chunky ring', () => {
    const rule = ruleFor('input[type=range]:focus');
    if (!rule || !/outline\s*:\s*none/.test(rule)) throw new Error('input[type=range]:focus does not clear the outline');
});

check('every slider in the app is a plain input[type=range], so none opts out', () => {
    const sliders = H.match(/<input[^>]*type="range"[^>]*>/g) || [];
    if (sliders.length < 4) throw new Error('only ' + sliders.length + ' sliders found — this check is looking in the wrong place');
    sliders.forEach(s => {
        // An inline height or appearance would override the shared rule for one
        // slider, which is exactly the inconsistency being removed.
        if (/style="[^"]*height:/.test(s)) throw new Error('a slider sets its own height inline: ' + s);
        if (/style="[^"]*appearance:/.test(s)) throw new Error('a slider overrides appearance inline: ' + s);
    });
});

results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); });
const failures = results.filter(r => !r.ok);
console.log('\n--- Summary ---');
if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
else console.log('ALL PASSED (' + results.length + ')');
