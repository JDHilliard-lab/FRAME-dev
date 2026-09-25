// A PAGE BACKGROUND WAS THE ONE IMAGE IMPORT WITH NO BOUND AT ALL.
//
// Measured on a real project (.claude/references, 14 rows and 4 walls): the
// file is 22.9 MB, and 11.1 MB of that is TWO page backgrounds at 5.51 MB and
// 5.58 MB. All fourteen pieces of artwork together come to 3.9 MB. Every
// sibling import already bounds - 1000 px for dashboard artwork, 1100 from the
// shape popup, 1400 on a drop - and this one wrote FileReader's result
// straight into the project.
//
// THE COST IS THE ENCODING, NOT THE PIXELS, and that is what these checks are
// really about. Both were 1728x1956 RGBA PNGs: 3.4 megapixels, comfortably
// under what a 936x540pt page can use even at print quality with the Zoom
// slider at 3, so a dimension bound would have left them EXACTLY as they were.
// A photograph stored as RGBA PNG runs about twenty times its JPEG size.
//
// So the checks below pin that the fix re-encodes, that it does not throw
// pixels away to do it, and that it keeps PNG wherever transparency is real.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = (label, fn) => results.push({ label, fn });
const settle = () => new Promise((r) => setTimeout(r, 15));

const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
    { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;
const doc = window.document;

// ── fakes: a decoder and a canvas whose answers are observable ──────────
// The real ones do nothing under jsdom, so without these the helper would take
// its error path every time and the checks would pass while proving nothing.
const cfg = {
    w: 1728, h: 1956,          // the real project's backgrounds
    decodeFails: false,
    ctx: true,
    getImageDataThrows: false,
    alpha: null,               // filled per check
    encoded: {},               // type -> length the fake encoder returns
};
const seen = { encodes: [], drawn: [] };

window.Image = function () {
    const self = this;
    this.onload = null; this.onerror = null;
    this.naturalWidth = 0; this.naturalHeight = 0;
    Object.defineProperty(this, 'src', {
        set() {
            setTimeout(() => {
                if (cfg.decodeFails) { if (self.onerror) self.onerror(); return; }
                self.naturalWidth = cfg.w; self.naturalHeight = cfg.h;
                if (self.onload) self.onload();
            }, 0);
        },
    });
};

const realCreate = doc.createElement.bind(doc);
doc.createElement = function (tag) {
    if (String(tag).toLowerCase() !== 'canvas') return realCreate(tag);
    const c = {
        width: 0, height: 0,
        getContext() {
            if (!cfg.ctx) return null;
            return {
                drawImage: (im, x, y, w, h) => { seen.drawn.push({ w, h }); },
                getImageData: () => {
                    if (cfg.getImageDataThrows) throw new Error('tainted canvas');
                    return { data: cfg.alpha };
                },
            };
        },
        toDataURL(type, q) {
            seen.encodes.push({ type, q, w: c.width, h: c.height });
            const len = cfg.encoded[type] || 100;
            return type + ';fake,' + 'x'.repeat(Math.max(1, len));
        },
    };
    return c;
};

// Four pixels' worth of RGBA, all opaque. Small on purpose: the branch is what
// is under test, and one check below builds a bigger one to prove the scan
// really does reach the last pixel.
const opaque = (n) => { const d = []; for (let i = 0; i < n; i++) d.push(10, 20, 30, 255); return d; };
const withHole = (n, at) => { const d = opaque(n); d[at * 4 + 3] = 0; return d; };

window.eval(APP + NL + [
    'window.__fx = {',
    '  bound: _boundImageDataUrl,',
    '  hasAlpha: _imageDataHasAlpha,',
    '  maxEdge: _pageBgMaxEdge,',
    '  maxZoom: PAGE_BG_MAX_ZOOM,',
    '  pageFormat: PAGE_FORMAT,',
    '  printR: _PDF_QUALITY.print.r,',
    '  resize: resizeImageDataUrl,',
    '};',
].join(NL));
const fx = window.__fx;

const run = (src, maxEdge, q) => new Promise((res) => fx.bound(src, maxEdge, q, (url, w, h) => res({ url, w, h })));
const reset = () => { seen.encodes.length = 0; seen.drawn.length = 0; cfg.decodeFails = false; cfg.ctx = true; cfg.getImageDataThrows = false; cfg.w = 1728; cfg.h = 1956; cfg.alpha = opaque(4); cfg.encoded = {}; };

// ── THE BUG ─────────────────────────────────────────────────────────────
check('the real case: a 5.5 MB opaque RGBA PNG comes back as a small JPEG', async () => {
    reset();
    const PNG_IN = 'data:image/png;base64,' + 'A'.repeat(5.51 * 1024 * 1024);
    cfg.encoded['image/jpeg'] = Math.round(0.38 * 1024 * 1024);
    cfg.encoded['image/png'] = Math.round(5.4 * 1024 * 1024);
    const out = await run(PNG_IN, fx.maxEdge(), 0.88);
    if (out.url === PNG_IN) throw new Error('the background was stored exactly as it arrived, which IS the bug');
    if (out.url.indexOf('image/jpeg') < 0) throw new Error('an opaque photograph was not re-encoded as JPEG');
    if (out.url.length > PNG_IN.length * 0.2) throw new Error('the re-encode saved almost nothing: ' + Math.round(out.url.length / 1024) + ' KB from ' + Math.round(PNG_IN.length / 1024) + ' KB');
});

check('and it does NOT throw pixels away to do it', async () => {
    // 1728x1956 is under the ceiling, so the win has to come entirely from the
    // encoding. A "simplification" that turned this back into a resize would
    // save nothing on the file that prompted it.
    reset();
    cfg.encoded['image/jpeg'] = 1000;
    const out = await run('data:image/png;base64,' + 'A'.repeat(500000), fx.maxEdge(), 0.88);
    if (out.w !== 1728 || out.h !== 1956) throw new Error('the image was resized when it did not need to be: ' + out.w + 'x' + out.h);
    if (!seen.drawn.length || seen.drawn[0].w !== 1728) throw new Error('it was drawn at the wrong size');
    if (seen.encodes[0].q !== 0.88) throw new Error('the quality argument did not reach the encoder');
});

// ── transparency ────────────────────────────────────────────────────────
check('an image that really uses transparency stays PNG', async () => {
    reset();
    cfg.alpha = withHole(4, 1);
    cfg.encoded['image/png'] = 1000;
    cfg.encoded['image/jpeg'] = 10;
    const out = await run('data:image/png;base64,' + 'A'.repeat(500000), fx.maxEdge(), 0.88);
    if (out.url.indexOf('image/png') < 0) throw new Error('a transparent background was flattened to JPEG, so the page colour no longer shows through');
    if (seen.encodes.some(e => e.type === 'image/jpeg')) throw new Error('it encoded JPEG as well, which is work for nothing');
});

check('the alpha scan reaches the LAST pixel, so a small cut-out is not missed', async () => {
    // A stride or an early exit would pass every other check here and flatten a
    // logo with one transparent corner.
    reset();
    cfg.alpha = withHole(4096, 4095);
    cfg.encoded['image/png'] = 1000;
    const out = await run('data:image/png;base64,' + 'A'.repeat(500000), fx.maxEdge(), 0.88);
    if (out.url.indexOf('image/png') < 0) throw new Error('transparency in the last pixel was missed');
});

check('a fully opaque alpha channel is not treated as transparency', async () => {
    reset();
    cfg.alpha = opaque(4096);
    if (fx.hasAlpha({ getImageData: () => ({ data: cfg.alpha }) }, 64, 64)) throw new Error('an all-opaque image was read as transparent, so nothing is ever re-encoded');
});

check('and a canvas it cannot read falls back to PNG rather than guessing', async () => {
    reset();
    cfg.getImageDataThrows = true;
    cfg.encoded['image/png'] = 1000;
    const out = await run('data:image/png;base64,' + 'A'.repeat(500000), fx.maxEdge(), 0.88);
    if (out.url.indexOf('image/png') < 0) throw new Error('an unreadable canvas was assumed opaque, which flattens transparency');
});

// ── never make it worse ─────────────────────────────────────────────────
check('a result that would be BIGGER is thrown away and the original kept', async () => {
    reset();
    const SMALL = 'data:image/jpeg;base64,' + 'A'.repeat(2000);
    cfg.encoded['image/jpeg'] = 9000;   // re-encoding an already-small JPEG grows it
    const out = await run(SMALL, fx.maxEdge(), 0.88);
    if (out.url !== SMALL) throw new Error('it stored a LARGER copy than the one it was given');
    if (out.w !== 1728 || out.h !== 1956) throw new Error('the original was kept but reported the wrong dimensions, so the aspect would be wrong');
});

check('an image that fails to decode is passed through untouched', async () => {
    reset();
    cfg.decodeFails = true;
    const SRC = 'data:image/png;base64,' + 'A'.repeat(500);
    const out = await run(SRC, fx.maxEdge(), 0.88);
    if (out.url !== SRC) throw new Error('a decode failure lost the image');
});

check('and a browser with no canvas keeps the original rather than breaking the import', async () => {
    reset();
    cfg.ctx = false;
    const SRC = 'data:image/png;base64,' + 'A'.repeat(500);
    const out = await run(SRC, fx.maxEdge(), 0.88);
    if (out.url !== SRC) throw new Error('no canvas support means no import at all');
});

check('an empty source calls back rather than hanging the import', async () => {
    reset();
    const out = await run('', fx.maxEdge(), 0.88);
    if (out.url !== '') throw new Error('an empty source did not come back as it went in');
});

// ── the backstop ────────────────────────────────────────────────────────
check('a genuinely enormous export IS scaled down to the ceiling', async () => {
    reset();
    cfg.w = 12000; cfg.h = 9000;
    cfg.encoded['image/jpeg'] = 1000;
    const out = await run('data:image/png;base64,' + 'A'.repeat(900000), fx.maxEdge(), 0.88);
    const edge = fx.maxEdge();
    if (out.w !== edge) throw new Error('the long edge was not brought to the ceiling: ' + out.w + ' vs ' + edge);
    if (Math.abs(out.h - Math.round(9000 * (edge / 12000))) > 1) throw new Error('the aspect was not preserved: ' + out.w + 'x' + out.h);
});

check('the ceiling is DERIVED from the page and the export, not typed in', async () => {
    const want = Math.round(fx.pageFormat[0] * fx.printR * fx.maxZoom);
    if (fx.maxEdge() !== want) throw new Error('_pageBgMaxEdge is ' + fx.maxEdge() + ', not the ' + want + ' the page and quality imply');
    const i = APP.indexOf('function _pageBgMaxEdge');
    const body = APP.slice(i, APP.indexOf('function _imageDataHasAlpha'));
    if (body.indexOf('PAGE_FORMAT[0]') < 0 || body.indexOf('_PDF_QUALITY.print.r') < 0) {
        throw new Error('the ceiling no longer derives from the page size and the export quality');
    }
    if (body.indexOf('const ') === 0) throw new Error('it became a const, which reads PAGE_FORMAT in the TDZ');
});

check('PAGE_FORMAT has ONE definition, or the bound is against the wrong page', async () => {
    if (APP.split('PAGE_FORMAT = [').length - 1 !== 1) throw new Error('PAGE_FORMAT is declared more than once');
    const i = APP.indexOf('const PAGE_FORMAT = [');
    const j = APP.indexOf('function exportSpecPagePDF');
    if (j >= 0 && i > j) throw new Error('PAGE_FORMAT is declared inside the exporter again, where the import path cannot reach it');
});

// ── the import path actually uses it ────────────────────────────────────
check('the page background import goes through the bound', async () => {
    // Source-level, because this sits inside the page-theme panel builder and
    // reaching it would mean constructing the whole Deck Studio panel. What is
    // worth pinning is that the raw result is no longer written straight in.
    const i = APP.indexOf('const file = document.createElement(\'input\'); file.type = \'file\'; file.accept = \'image/png,image/jpeg,image/webp\'');
    if (i < 0) throw new Error('could not find the page background file input');
    const body = APP.slice(i, APP.indexOf('const iOn = (mode ===', i));
    if (body.indexOf('_boundImageDataUrl(') < 0) throw new Error('the page background import does not bound its image, which IS the bug');
    if (body.indexOf('th.image = rd.result') >= 0) throw new Error('it still writes the raw file straight into the project');
    if (body.indexOf('_pageBgMaxEdge()') < 0) throw new Error('it bounds against something other than the derived page ceiling');
});

check('frame swatches are deliberately left on the lossless path', async () => {
    // resizeImageDataUrl serves swatches, which are line work on transparency.
    // JPEG there would put ringing on hairlines, so the two helpers stay apart.
    const i = APP.indexOf('function resizeImageDataUrl');
    const body = APP.slice(i, APP.indexOf('// ── THE BOUND ON AN IMPORTED PAGE BACKGROUND'));
    if (i < 0 || body.length < 50) throw new Error('could not read resizeImageDataUrl');
    if (body.indexOf('image/jpeg') >= 0) throw new Error('the swatch path now encodes JPEG, which rings on line work');
    if (body.indexOf("toDataURL('image/png')") < 0) throw new Error('the swatch path no longer keeps PNG');
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
