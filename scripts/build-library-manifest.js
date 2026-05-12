// Walk library/<vendor>/<collection>/<code>_<width>[_<faceWidth>].<ext> and write
// a flat manifest the app fetches at startup. Run by the GitHub Action on every
// push, or run locally with `node scripts/build-library-manifest.js`.
//
// Filename conventions (must match the in-app Sync Folder parser):
//
//   Regular profile (2 pieces, last is numeric):
//     <code-with-underscores>_<railWidth>.<ext>
//     Examples:
//       L100ABC_1.25.png      -> { code: "L100ABC", width: 1.25 }
//       Black_Modern_2.png    -> { code: "Black Modern", width: 2 }
//       Walnut.png            -> { code: "Walnut", width: 1.25 } (no width info, defaults)
//
//   Floater (3 pieces, LAST TWO numeric):
//     <code-with-underscores>_<railWidth>_<faceWidth>.<ext>
//     The third numeric is the canvas FACE width (the visible white edge of the
//     wrapped canvas). The app derives the floater inset as faceWidth + 0.25"
//     (studio-standard shadow reveal) when the swatch is selected.
//     Examples:
//       MICH-301-22_1.5_0.5.jpg     -> { code: "MICH-301-22", width: 1.5, faceWidth: 0.5 }
//       MICH-306-30_1.75_0.625.jpg  -> { code: "MICH-306-30", width: 1.75, faceWidth: 0.625 }
//
// Note: floater swatches should also live in a collection folder whose name
// contains "Floater" so the app auto-switches the product type when picked.

const fs = require('fs');
const path = require('path');

const LIBRARY_DIR = path.join(__dirname, '..', 'library');
const OUT_FILE = path.join(__dirname, '..', 'library-manifest.json');
const IMG_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
const DEFAULT_WIDTH = 1.25;

// Parse a swatch filename into { code, width, depth?, rabbet?, faceWidth? }.
//
// Schema (option C — tagged prefixes, additive over the old positional format):
//
//   <code>_<width>[_d<depth>][_r<rabbet>][_f<face>].<ext>
//
// Examples:
//   MICH-41-12_1.25.jpg                          → { code:"MICH-41-12", width:1.25 }
//   MICH-41-12_1.25_d1.625_r0.625.jpg            → +depth:1.625, rabbet:0.625
//   MICH-301-22_1.5_f0.5.jpg                     → +faceWidth:0.5 (floater, tagged)
//   MICH-301-22_1.5_0.5.jpg                      → +faceWidth:0.5 (legacy positional)
//
// Mirrors the in-app parseSwatchFilename in app.js — keep them in sync.
function parseFilename(filename) {
    const ext = path.extname(filename);
    const base = filename.slice(0, -ext.length);
    const parts = base.split('_');
    const isNum = s => s !== '' && !isNaN(parseFloat(s)) && isFinite(s);
    const tagMatch = (s) => {
        const m = /^([drf])([\d.]+)$/.exec(s);
        if (!m) return null;
        const v = parseFloat(m[2]);
        if (isNaN(v)) return null;
        return { tag: m[1], value: v };
    };

    const positional = [];
    const tags = {};
    for (const part of parts) {
        const t = tagMatch(part);
        if (t) {
            if (tags[t.tag] === undefined) tags[t.tag] = t.value;
        } else {
            positional.push(part);
        }
    }

    let width;
    let legacyFace;
    if (positional.length >= 3 && isNum(positional[positional.length - 1]) && isNum(positional[positional.length - 2])) {
        legacyFace = parseFloat(positional[positional.length - 1]);
        width = parseFloat(positional[positional.length - 2]);
        positional.length -= 2;
    } else if (positional.length >= 2 && isNum(positional[positional.length - 1])) {
        width = parseFloat(positional[positional.length - 1]);
        positional.length -= 1;
    }
    const code = positional.length > 0 ? positional.join('_') : base;

    const result = { code, width: width !== undefined ? width : DEFAULT_WIDTH };
    if (tags.d !== undefined) result.depth = tags.d;
    if (tags.r !== undefined) result.rabbet = tags.r;
    if (tags.f !== undefined) result.faceWidth = tags.f;
    else if (legacyFace !== undefined) result.faceWidth = legacyFace;
    return result;
}

function buildManifest() {
    if (!fs.existsSync(LIBRARY_DIR)) {
        console.log(`No library/ directory at ${LIBRARY_DIR} — writing empty manifest.`);
        return [];
    }

    const items = [];
    const vendors = fs.readdirSync(LIBRARY_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory()).map(d => d.name);

    for (const vendor of vendors) {
        const vendorDir = path.join(LIBRARY_DIR, vendor);
        const collections = fs.readdirSync(vendorDir, { withFileTypes: true })
            .filter(d => d.isDirectory()).map(d => d.name);

        for (const collection of collections) {
            const collectionDir = path.join(vendorDir, collection);
            const files = fs.readdirSync(collectionDir, { withFileTypes: true })
                .filter(d => d.isFile()).map(d => d.name);

            for (const filename of files) {
                const ext = path.extname(filename).toLowerCase();
                if (!IMG_EXTS.has(ext)) continue;
                const parsed = parseFilename(filename);
                const item = {
                    vendor,
                    collection,
                    code: parsed.code,
                    width: parsed.width,
                    // Forward slashes in the path so it works as a URL on any platform
                    path: ['library', vendor, collection, filename].join('/'),
                };
                if (parsed.faceWidth !== undefined) item.faceWidth = parsed.faceWidth;
                if (parsed.depth !== undefined) item.depth = parsed.depth;
                if (parsed.rabbet !== undefined) item.rabbet = parsed.rabbet;
                items.push(item);
            }
        }
    }
    return items;
}

const manifest = buildManifest();
fs.writeFileSync(OUT_FILE, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${manifest.length} swatches to library-manifest.json`);
