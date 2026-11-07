#!/usr/bin/env node
// tools/ctx-art.js (20.22): THE CONTEXT LIBRARY IS GENERATED HERE.
//
// Every context drawing (beds, chairs, vanities, glass partitions, doors...) and the
// palette's categories live in this file, and `node tools/ctx-art.js --write` rewrites
// the block between the ctx-library markers in app.js. Restyle here, never in app.js.
//
//   node tools/ctx-art.js --write          regenerate the library in app.js
//   node tools/ctx-art.js --sheet out.html a contact sheet of every drawing
//
// STYLE (the designer's "Hospitality Elevation Context Blocks Library" sheet):
//   2D orthographic elevation, ONE uniform stroke, no hatch, no shading, no tapering.
//   Soft corners, simple shapes, enough detail to read at a glance (a pull, a pillow, a
//   lever) and no more. Units are INCHES, y runs DOWN from the top of the item's box and
//   the floor is the box's bottom edge.
//
// TWO MARKERS do all the occlusion:
//   O (data-o="1")  an OPAQUE shape: filled white in drawing order, so draw back to front
//                   and a front pillow hides the one behind it.
//   open()          a stroke that must stay a line (fill="none"): an open curve would
//                   otherwise be filled across its chord by the block body (20.20).
// Hidden lines (a basin under a closed counter) go through HID(), which emits the dashed
// _H group.
'use strict';
const fs = require('fs');
const path = require('path');

// ── primitives ─────────────────────────────────────────────────────────────
const n = (v) => { const r = Math.round((+v) * 100) / 100; return Object.is(r, -0) ? 0 : r; };
const at = (o) => (o ? ' data-o="1"' : '');
// 20.23: corners are only just softened (the product-elevation reference is near square),
// so every authored radius is scaled by RK in one place.
const RK = 0.55;
const R = (x, y, w, h, r, o) => `<rect${at(o)} x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${r ? ` rx="${n(r * RK)}"` : ''}/>`;
const P = (d, o) => `<path${at(o)} d="${d}"/>`;
const open = (d) => `<path fill="none" d="${d}"/>`;
const C = (cx, cy, r, o) => `<circle${at(o)} cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`;
const L = (...xy) => { let d = ''; for (let i = 0; i < xy.length; i += 2) d += (i ? ' L' : 'M') + n(xy[i]) + ' ' + n(xy[i + 1]); return open(d); };
const HL = (y, x0, x1) => open(`M${n(x0)} ${n(y)} H${n(x1)}`);
const VL = (x, y0, y1) => open(`M${n(x)} ${n(y0)} V${n(y1)}`);
const HID = (s) => '\u0001' + s + '\u0002';
// A soft-cornered box as a path (so it can be opaque and still read as one outline).
const box = (x, y, w, h, r, o) => R(x, y, w, h, r == null ? 0.5 : r, o);

// ── shared parts ───────────────────────────────────────────────────────────
// Short horizontal pull centred at (cx, cy).
const pullH = (cx, cy, len) => R(cx - len / 2, cy - 0.35, len, 0.7, 0.35);
const pullV = (cx, cy, len) => R(cx - 0.35, cy - len / 2, 0.7, len, 0.35);
const foot = (x, F, w, h) => R(x, F - h, w, h, 0.3, true);
// A door lever: rose + handle, with the rose centred at (cx, cy).
const lever = (cx, cy, dir) => C(cx, cy, 0.75) + R(dir < 0 ? cx - 4.2 : cx, cy - 0.35, 4.2, 0.7, 0.35);

// Table lamp standing on y = top, centred on cx. 26in tall at s = 1.
function lamp(cx, top, s) {
    s = s || 1;
    const b = top, sh0 = b - 26 * s, sh1 = b - 16.5 * s;
    return R(cx - 2.6 * s, b - 2.2 * s, 5.2 * s, 2.2 * s, 0.6 * s, true)
        + VL(cx, b - 2.2 * s, sh1)
        + P(`M${n(cx - 4 * s)} ${n(sh0)} H${n(cx + 4 * s)} L${n(cx + 6.6 * s)} ${n(sh1)} H${n(cx - 6.6 * s)} Z`, true);
}
// Vase with three branches, standing on y = top.
function vase(cx, top) {
    return open(`M${n(cx)} ${n(top - 6)} C${n(cx - 0.6)} ${n(top - 11)} ${n(cx - 3)} ${n(top - 13)} ${n(cx - 4.4)} ${n(top - 15)}`)
        + open(`M${n(cx)} ${n(top - 6)} C${n(cx + 0.2)} ${n(top - 11)} ${n(cx + 0.6)} ${n(top - 14)} ${n(cx + 0.4)} ${n(top - 17)}`)
        + open(`M${n(cx)} ${n(top - 6)} C${n(cx + 1)} ${n(top - 10)} ${n(cx + 3.4)} ${n(top - 12)} ${n(cx + 4.8)} ${n(top - 13.6)}`)
        + C(cx - 4.4, top - 15, 0.6) + C(cx + 0.4, top - 17, 0.6) + C(cx + 4.8, top - 13.6, 0.6) + C(cx - 2, top - 12.6, 0.5)
        + P(`M${n(cx - 1)} ${n(top - 6.4)} H${n(cx + 1)} C${n(cx + 1)} ${n(top - 5)} ${n(cx + 3.2)} ${n(top - 4.4)} ${n(cx + 3.2)} ${n(top - 2.4)}`
            + ` C${n(cx + 3.2)} ${n(top - 0.6)} ${n(cx + 1.6)} ${n(top)} ${n(cx)} ${n(top)} C${n(cx - 1.6)} ${n(top)} ${n(cx - 3.2)} ${n(top - 0.6)} ${n(cx - 3.2)} ${n(top - 2.4)}`
            + ` C${n(cx - 3.2)} ${n(top - 4.4)} ${n(cx - 1)} ${n(top - 5)} ${n(cx - 1)} ${n(top - 6.4)} Z`, true);
}
// Two standing picture frames.
function frames(x, top) {
    return R(x, top - 7.5, 6, 7.5, 0.3, true) + R(x + 1, top - 6.5, 4, 5.5, 0)
        + R(x + 4.5, top - 5.5, 4.5, 5.5, 0.3, true) + R(x + 5.4, top - 4.6, 2.7, 3.7, 0);
}
// A potted plant (leaves as closed lens shapes) standing on y = top, about h tall.
function plant(cx, top, h) {
    const p = h * 0.38, lt = top - p;
    let s = P(`M${n(cx - p * 0.45)} ${n(lt)} H${n(cx + p * 0.45)} L${n(cx + p * 0.36)} ${n(top)} H${n(cx - p * 0.36)} Z`, true);
    const leaf = (dx, dy) => P(`M${n(cx)} ${n(lt)} C${n(cx + dx * 0.2)} ${n(lt + dy * 0.55)} ${n(cx + dx * 0.7)} ${n(lt + dy * 0.9)} ${n(cx + dx)} ${n(lt + dy)}`
        + ` C${n(cx + dx * 0.9)} ${n(lt + dy * 0.6)} ${n(cx + dx * 0.4)} ${n(lt + dy * 0.2)} ${n(cx)} ${n(lt)} Z`, true);
    const L1 = h - p;
    s = leaf(-L1 * 0.6, -L1 * 0.7) + leaf(L1 * 0.62, -L1 * 0.66) + leaf(-L1 * 0.1, -L1) + leaf(L1 * 0.3, -L1 * 0.9) + leaf(-L1 * 0.42, -L1 * 0.95) + s;
    return s;
}
// Nightstand: top, two drawers, small feet. Standing on F at x.
function nightstand(x, F, w, h, decor) {
    w = w || 24; h = h || 24;
    const t = F - h;
    let s = foot(x + 1.4, F, 1.6, 1.6) + foot(x + w - 3, F, 1.6, 1.6);
    s += box(x, t, w, h - 1.6, 0.5, true);
    s += HL(t + 1.4, x, x + w);
    const mid = t + 1.4 + (h - 3) / 2;
    s += HL(mid, x + 1, x + w - 1);
    s += pullH(x + w / 2, t + 1.4 + (h - 3) / 4, 4) + pullH(x + w / 2, mid + (h - 3) / 4, 4);
    if (decor === 'lamp') s += lamp(x + w / 2, t);
    if (decor === 'vase') s += vase(x + w * 0.62, t);
    if (decor === 'frames') s += frames(x + w * 0.3, t);
    return s;
}
// Desk task chair, front view, standing on F, centred cx. About 40in tall at s = 1.
function taskChair(cx, F, s) {
    s = s || 1;
    const k = (v) => v * s;
    let o = '';
    o += C(cx - k(10.4), F - k(1.3), k(1.3), true) + C(cx, F - k(1.2), k(1.2), true) + C(cx + k(10.4), F - k(1.3), k(1.3), true);
    o += P(`M${n(cx - k(1.4))} ${n(F - k(7.4))} H${n(cx + k(1.4))} L${n(cx + k(11.6))} ${n(F - k(3.8))} V${n(F - k(2.8))} H${n(cx - k(11.6))} V${n(F - k(3.8))} Z`, true);
    o += R(cx - k(1), F - k(15.5), k(2), k(8.2), 0, true);
    o += R(cx - k(11.6), F - k(19.6), k(23.2), k(4.2), k(2), true);
    o += R(cx - k(8.8), F - k(40), k(17.6), k(19.4), k(3.2), true);
    o += open(`M${n(cx - k(9.6))} ${n(F - k(17.6))} V${n(F - k(25))} H${n(cx - k(12.4))}`) + open(`M${n(cx + k(9.6))} ${n(F - k(17.6))} V${n(F - k(25))} H${n(cx + k(12.4))}`);
    return o;
}
// Chair seen from the SIDE (meeting rooms), facing right when dir = 1.
function taskChairSide(x, F, dir) {
    const X = (v) => x + v * dir;
    let o = '';
    o += C(X(2), F - 1.2, 1.2, true) + C(X(17), F - 1.2, 1.2, true);
    o += open(`M${n(X(2))} ${n(F - 3)} L${n(X(9.5))} ${n(F - 6)} L${n(X(17))} ${n(F - 3)}`);
    o += R(Math.min(X(8.6), X(10.4)), F - 15, 1.8, 9, 0, true);
    o += P(`M${n(X(3))} ${n(F - 18.6)} H${n(X(17))} Q${n(X(18))} ${n(F - 18.6)} ${n(X(18))} ${n(F - 17.4)} V${n(F - 16)} H${n(X(3))} Z`, true);
    o += P(`M${n(X(2.4))} ${n(F - 17)} L${n(X(0.6))} ${n(F - 35)} Q${n(X(0.6))} ${n(F - 36)} ${n(X(1.8))} ${n(F - 36)} H${n(X(3))} Q${n(X(4))} ${n(F - 36)} ${n(X(4))} ${n(F - 35)} L${n(X(4.8))} ${n(F - 18.6)}`, true);
    o += open(`M${n(X(6))} ${n(F - 18.6)} V${n(F - 24)} H${n(X(13))}`);
    return o;
}

// Door (20.23): casing as a double line, the leaf, two hinges on the hinge side, a lever
// on the other at cy. Hinges right by default, as in the reference.
function door(w, h, cy, o) {
    o = o || {};
    let s = R(0, 0, w, h, 0, true) + open(`M1 ${n(h)} V1 H${n(w - 1)} V${n(h)}`) + R(2, 2, w - 4, h - 2, 0);
    const hx = o.hingeLeft ? 2 : w - 2.6;
    s += R(hx, 12, 0.6, 3.6, 0) + R(hx, h - 22, 0.6, 3.6, 0);
    if (cy) s += lever(o.hingeLeft ? w - 6 : 6, cy, o.hingeLeft ? -1 : 1);
    return s;
}
// Classic close-coupled toilet, 18in wide x 30in, centred on cx, floor at F.
function toilet(cx, F) {
    return R(cx - 9, F - 30, 18, 11.4, 0.8, true) + HL(F - 28.6, cx - 9, cx + 9) + C(cx - 6.6, F - 26.4, 0.5) + open(`M${n(cx - 6.1)} ${n(F - 26.4)} H${n(cx - 3.8)}`)
        + R(cx - 8.6, F - 18.4, 17.2, 1.9, 0.9, true)
        + P(`M${n(cx - 8)} ${n(F - 16.5)} H${n(cx + 8)} C${n(cx + 8.4)} ${n(F - 13)} ${n(cx + 6.8)} ${n(F - 10.6)} ${n(cx + 4.8)} ${n(F - 9.8)}`
            + ` L${n(cx + 5.4)} ${n(F)} H${n(cx - 5.4)} L${n(cx - 4.8)} ${n(F - 9.8)} C${n(cx - 6.8)} ${n(F - 10.6)} ${n(cx - 8.4)} ${n(F - 13)} ${n(cx - 8)} ${n(F - 16.5)} Z`, true)
        + open(`M${n(cx - 4.8)} ${n(F - 9.8)} Q${n(cx)} ${n(F - 9.2)} ${n(cx + 4.8)} ${n(F - 9.8)}`);
}
// Widespread faucet standing on a counter at y = top, centred on cx.
function faucet(cx, top) {
    return R(cx - 0.7, top - 7.4, 1.4, 7.4, 0.3, true) + open(`M${n(cx - 0.7)} ${n(top - 6.8)} Q${n(cx - 0.7)} ${n(top - 8.2)} ${n(cx + 0.6)} ${n(top - 8.2)} H${n(cx + 1.6)} V${n(top - 7)}`)
        + R(cx - 6, top - 2.6, 1.2, 2.6, 0, true) + R(cx - 7, top - 3.4, 3.2, 0.9, 0.3, true)
        + R(cx + 4.8, top - 2.6, 1.2, 2.6, 0, true) + R(cx + 3.8, top - 3.4, 3.2, 0.9, 0.3, true);
}
// Vanity on a slim metal frame (20.23): counter, a drawer box framed in double lines with
// recessed tab pulls, legs to the floor, a low stretcher. `n` drawer fronts; `bowls` =
// x centres of concealed basins (dashed: the cabinet is closed).
function vanity(x, w, F, h, nf, bowls) {
    const top = F - h, bt = top + 1.4, bh = Math.min(h * 0.6, 20);
    let s = R(x + 0.6, bt, 1.2, h - 1.4, 0, true) + R(x + w - 1.8, bt, 1.2, h - 1.4, 0, true);
    s += R(x + 1.8, F - 4.6, w - 3.6, 1, 0, true);
    s += R(x + 1.8, bt, w - 3.6, bh, 0, true) + R(x + 2.8, bt + 1, w - 5.6, bh - 2, 0);
    for (let i = 1; i < nf; i++) s += VL(x + 2.8 + (w - 5.6) * i / nf, bt + 1, bt + bh - 1);
    for (let i = 0; i < nf; i++) s += R(x + 2.8 + (w - 5.6) * (i + 0.5) / nf - 1.6, bt + 1, 3.2, 1.2, 0);
    s += R(x, top, w, 1.4, 0, true);
    if (bowls && bowls.length) s += HID(bowls.map(c => open(`M${n(c - 8)} ${n(bt)} V${n(bt + 3)} Q${n(c - 8)} ${n(bt + 6)} ${n(c - 5)} ${n(bt + 6)} H${n(c + 5)} Q${n(c + 8)} ${n(bt + 6)} ${n(c + 8)} ${n(bt + 3)} V${n(bt)}`)).join(''));
    return s;
}

// ── beds ───────────────────────────────────────────────────────────────────
// Pillow (20.23, the designer's product-elevation reference): a near-square cushion whose
// top dips gently between two slightly raised corners. The bottom is hidden by the duvet.
function pillow(x, y, w, h, o) {
    const d = Math.min(h * 0.09, 1), k = Math.min(w * 0.03, 0.6);
    return P(`M${n(x)} ${n(y)} Q${n(x + w / 2)} ${n(y + d * 2)} ${n(x + w)} ${n(y)} Q${n(x + w - k)} ${n(y + h / 2)} ${n(x + w)} ${n(y + h)}`
        + ` H${n(x)} Q${n(x + k)} ${n(y + h / 2)} ${n(x)} ${n(y)} Z`, o);
}
// The bedding of a bed of width W at x0, floor F, duvet top mT. Back to front: legs and
// platform base, pillows (four on a wide bed: two behind at the outsides, two in front),
// then the duvet, which covers the mattress, drapes down both sides and FLARES at the hem
// over the base. The mattress shows as two lines inside the drape.
function bedding(x0, W, F, mT, o) {
    o = o || {};
    let s = '';
    const legH = o.plinth ? 0 : Math.min(3.4, (F - mT) * 0.16), baseH = Math.min(5.4, (F - mT) * 0.26);
    const yBase = F - legH - baseH, yDrape = yBase + baseH * 0.62;
    if (o.plinth) {
        s += R(x0 + 4, F - 2.4, W - 8, 2.4, 0, true);
        s += R(x0 + 0.6, F - 2.4 - baseH * 0.7, W - 1.2, baseH * 0.7, 0.2, true);
    } else {
        const lw = Math.min(4.2, W * 0.07);
        s += R(x0 + 1.6, F - legH, lw, legH, 0, true) + R(x0 + W - 1.6 - lw, F - legH, lw, legH, 0, true);
        s += R(x0 + 0.6, yBase, W - 1.2, baseH, 0.2, true);
    }
    const top = mT + 0.4;
    if (W >= 50) {
        const ow = W * 0.17, iw = W * 0.29, oh = Math.min(10.5, (yBase - mT) * 0.9 + 3), ih = oh - 0.6;
        s += pillow(x0 + W * 0.075, top - oh, ow, oh + 1, true) + pillow(x0 + W * 0.925 - ow, top - oh, ow, oh + 1, true);
        s += pillow(x0 + W / 2 - iw - 0.4, top - ih, iw, ih + 1, true) + pillow(x0 + W / 2 + 0.4, top - ih, iw, ih + 1, true);
    } else {
        const iw = W * 0.38, ih = Math.min(9, (yBase - mT) * 0.9 + 2);
        s += pillow(x0 + W / 2 - iw - 0.4, top - ih, iw, ih + 1, true) + pillow(x0 + W / 2 + 0.4, top - ih, iw, ih + 1, true);
    }
    // Duvet: soft top corners, sides falling and flaring out by ~1in, a rounded hem, the
    // centre lifting to the top of the base between the drapes.
    const L = x0, Rr = x0 + W, fl = Math.min(1.2, W * 0.02);
    s += P(`M${n(L + 1)} ${n(mT + 2)} Q${n(L + 1.2)} ${n(mT)} ${n(L + 3)} ${n(mT)} H${n(Rr - 3)} Q${n(Rr - 1.2)} ${n(mT)} ${n(Rr - 1)} ${n(mT + 2)}`
        + ` C${n(Rr - 0.6)} ${n(yBase - 3)} ${n(Rr + fl * 0.4)} ${n(yDrape - 2)} ${n(Rr + fl)} ${n(yDrape)}`
        + ` Q${n(Rr + fl)} ${n(yDrape + 0.9)} ${n(Rr - 0.4)} ${n(yDrape + 0.4)} C${n(Rr - 1.4)} ${n(yDrape)} ${n(Rr - 1.6)} ${n(yBase + 0.8)} ${n(Rr - 2)} ${n(yBase)}`
        + ` H${n(L + 2)} C${n(L + 1.6)} ${n(yBase + 0.8)} ${n(L + 1.4)} ${n(yDrape)} ${n(L + 0.4)} ${n(yDrape + 0.4)}`
        + ` Q${n(L - fl)} ${n(yDrape + 0.9)} ${n(L - fl)} ${n(yDrape)} C${n(L - fl * 0.4)} ${n(yDrape - 2)} ${n(L + 0.6)} ${n(yBase - 3)} ${n(L + 1)} ${n(mT + 2)} Z`, true);
    const fold = mT + Math.min(1.6, (yBase - mT) * 0.18);
    s += open(`M${n(L + 1.6)} ${n(fold)} Q${n(x0 + W / 2)} ${n(fold + 0.5)} ${n(Rr - 1.6)} ${n(fold)}`);
    const mat = mT + Math.min(3.2, (yBase - mT) * 0.34);
    s += HL(mat, L + 2.4, Rr - 2.4) + VL(L + 2.4, mat, yBase) + VL(Rr - 2.4, mat, yBase);
    return s;
}
// Headboards, drawn FIRST (opaque) so the bedding covers their lower edge.
const HEADS = {
    // A framed panel: thin posts and top rail drawn as double lines (20.23).
    inset: (x, w, top, bot) => R(x, top, w, bot - top, 0.2, true) + open(`M${n(x + 1.2)} ${n(bot)} V${n(top + 1.2)} H${n(x + w - 1.2)} V${n(bot)}`),
    panel: (x, w, top, bot) => R(x, top, w / 2 - 0.3, bot - top, 1.4, true) + R(x + w / 2 + 0.3, top, w / 2 - 0.3, bot - top, 1.4, true),
    channel: (x, w, top, bot) => {
        let s = P(`M${n(x)} ${n(bot)} V${n(top + 6)} Q${n(x)} ${n(top)} ${n(x + 6)} ${n(top)} H${n(x + w - 6)} Q${n(x + w)} ${n(top)} ${n(x + w)} ${n(top + 6)} V${n(bot)} Z`, true);
        for (let i = 1; i < 7; i++) s += VL(x + w * i / 7, top + 2, bot);
        return s;
    },
    wing: (x, w, top, bot) => {
        const wg = w * 0.1, wt = top + (bot - top) * 0.32;
        let s = P(`M${n(x)} ${n(bot)} V${n(wt + 2)} Q${n(x)} ${n(wt)} ${n(x + 2)} ${n(wt)} H${n(x + wg)} V${n(top + 2)} Q${n(x + wg)} ${n(top)} ${n(x + wg + 2)} ${n(top)}`
            + ` H${n(x + w - wg - 2)} Q${n(x + w - wg)} ${n(top)} ${n(x + w - wg)} ${n(top + 2)} V${n(wt)} H${n(x + w - 2)} Q${n(x + w)} ${n(wt)} ${n(x + w)} ${n(wt + 2)} V${n(bot)} Z`, true);
        s += VL(x + wg, wt, bot) + VL(x + w - wg, wt, bot);
        const bh = (bot - top) * 0.42;
        for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) s += C(x + wg + (w - 2 * wg) * (i + 0.5 + (r ? 0.5 : 0)) / (r ? 5 : 4) * (r ? 1 : 1), top + 3 + r * bh / 2.2, 0.35);
        return s;
    },
    low: (x, w, top, bot) => R(x, top, w, bot - top, 0.8, true) + HL(top + (bot - top) * 0.28, x, x + w) + HL(top + (bot - top) * 0.56, x, x + w),
};
// A bed front: headboard style (or none), bedding. Width W at x0, floor F, top `top`.
function bedFront(x0, W, F, top, head, o) {
    o = o || {};
    const mT = o.mT != null ? o.mT : F - 21.5;
    let s = '';
    if (head) s += HEADS[head](x0 + (o.hx || 0), W - 2 * (o.hx || 0), top, F - 6);
    // Reading lights on the headboard, as in the reference: a small bracket and shade.
    if (head && o.sconces) {
        const sy = top + Math.min(5, (mT - top) * 0.2), hx = o.hx || 0;
        [x0 + hx + 2.2, x0 + W - hx - 2.2 - 2.4].forEach(sx => { s += R(sx, sy, 2.4, 1.4, 0, true) + R(sx, sy + 1.4, 2.4, 4.2, 0.2, true) + HL(sy + 3.2, sx, sx + 2.4); });
    }
    s += bedding(x0, W, F, mT, { shams: !!head && head !== 'low', plinth: o.plinth });
    return s;
}
// Side view: headboard on the LEFT, mattress and base, two pillows leaning on the
// board, a folded throw over the foot.
function bedSide(L, H, o) {
    o = o || {};
    const F = H, mT = F - 21.5, hb = o.hbTop != null ? o.hbTop : 0, x0 = 4;
    let s = foot(8, F, 2.6, 1.2) + foot(L - 10, F, 2.6, 1.2);
    s += R(x0, F - 5.4, L - x0 - 0.6, 4.2, 1, true);
    s += P(`M${n(x0)} ${n(F - 3.6)} V${n(mT + 1.6)} Q${n(x0)} ${n(mT)} ${n(x0 + 1.6)} ${n(mT)} H${n(L - 4)} Q${n(L)} ${n(mT)} ${n(L)} ${n(mT + 4)}`
        + ` V${n(F - 6.6)} Q${n(L)} ${n(F - 3.6)} ${n(L - 3)} ${n(F - 3.6)} Z`, true);
    s += HL(mT + 4.2, x0, L - 0.4);
    const lean = (x, w, h, deg) => `<path data-o="1" transform="rotate(${deg} ${n(x + w)} ${n(mT + 0.4)})" d="M${n(x + 2)} ${n(mT + 0.4 - h)} H${n(x + w - 2)} Q${n(x + w)} ${n(mT + 0.4 - h)} ${n(x + w)} ${n(mT + 2.4 - h)} V${n(mT - 1.6)} Q${n(x + w)} ${n(mT + 0.4)} ${n(x + w - 2)} ${n(mT + 0.4)} H${n(x + 2)} Q${n(x)} ${n(mT + 0.4)} ${n(x)} ${n(mT - 1.6)} V${n(mT + 2.4 - h)} Q${n(x)} ${n(mT + 0.4 - h)} ${n(x + 2)} ${n(mT + 0.4 - h)} Z"/>`;
    s += lean(x0 + 1, 7, 15, -14) + lean(x0 + 6.5, 7, 12.5, -18);
    const a = L * 0.6, b = L * 0.78;
    s += P(`M${n(a)} ${n(mT - 0.6)} H${n(b)} Q${n(b + 1)} ${n(mT - 0.6)} ${n(b + 1)} ${n(mT + 1)} V${n(F - 6.4)} Q${n(b + 1)} ${n(F - 5.4)} ${n(b)} ${n(F - 5.4)} H${n(a)} Q${n(a - 1)} ${n(F - 5.4)} ${n(a - 1)} ${n(F - 6.4)} V${n(mT + 1)} Q${n(a - 1)} ${n(mT - 0.6)} ${n(a)} ${n(mT - 0.6)} Z`, true);
    s += VL(a + (b - a) * 0.45, mT - 0.2, F - 5.8) + VL(a + (b - a) * 0.7, mT - 0.2, F - 5.8);
    s += P(`M0 ${n(F)} V${n(hb + 2)} Q0 ${n(hb)} 2 ${n(hb)} Q${n(x0)} ${n(hb)} ${n(x0)} ${n(hb + 2)} V${n(F)} Z`, true);
    return s;
}

// Scale every coordinate of a drawing by k (used to put a bed drawn in inches into the
// 100-wide space the bed styles live in). Only for markup without arcs or rotations.
function scaleSvg(svg, k) {
    return svg.replace(/ (x|y|width|height|rx|cx|cy|r)="([-\d.]+)"/g, (m, a, v) => ` ${a}="${n(parseFloat(v) * k)}"`)
        .replace(/ d="([^"]*)"/g, (m, d) => ' d="' + d.replace(/-?\d*\.?\d+/g, (v) => String(n(parseFloat(v) * k))) + '"')
        .replace(/rotate\(([-\d.]+) ([-\d.]+) ([-\d.]+)\)/g, (m, a, x, y) => `rotate(${a} ${n(x * k)} ${n(y * k)})`);
}
// The five bed styles. Keys and 100-wide aspects are FIXED (a saved bed sizes by them);
// each is drawn on a 60in queen in inches and scaled into that space.
const BED_STYLES = [
    { key: 'b67', name: 'Platform', h: 26.9, head: null, o: { plinth: true } },
    { key: 'b71', name: 'Panel', h: 48.9, head: 'inset', o: { sconces: true } },
    { key: 'b72', name: 'Tall upholstered', h: 62, head: 'channel' },
    { key: 'b74', name: 'Wingback', h: 50.7, head: 'wing' },
    { key: 'b75', name: 'Low profile', h: 41.9, head: 'low' },
];
function bedStyleSvg(st) {
    const W = 60, H = st.h * W / 100;
    const mT = st.head ? H - 15 : H - 11;
    return scaleSvg(bedFront(0, W, H, 0, st.head, Object.assign({ mT: mT, hx: 1 }, st.o || {})), 100 / W);
}
const bedPreset = (W) => bedFront(0, W, 24, 0, null, { mT: 9.4 });

// ── the catalogue ──────────────────────────────────────────────────────────
// Each item: palette metadata (inches) + art(w, h) and optional side {w, h, art}.
// hatch: the wood/glass surface region, in the item's own inches.
const I = (o) => o;
const CATS = [];
const cat = (name, items) => CATS.push({ cat: name, items: items });
const FL = (h) => h;   // readability: "floor at h"

cat('Guestroom', [
    I({ key: 'bed-king', name: 'King bed', w: 76, h: 24, lengthIn: 80, aff: 0, affMode: 'bottom', label: 'King Bed', variants: true,
        art: () => bedPreset(76), hatch: R(0.6, 17.86, 74.8, 3.8),
        side: { w: 80, h: 36, art: () => bedSide(80, 36), hatch: R(0, 0, 4, 36) + R(4, 30.6, 75.4, 4.2) } }),
    I({ key: 'bed-queen', name: 'Queen bed', w: 60, h: 24, lengthIn: 80, aff: 0, affMode: 'bottom', label: 'Queen Bed', variants: true,
        art: () => bedPreset(60), hatch: R(0.6, 17.86, 58.8, 3.8),
        side: { w: 80, h: 36, art: () => bedSide(80, 36), hatch: R(0, 0, 4, 36) + R(4, 30.6, 75.4, 4.2) } }),
    I({ key: 'bed-full', name: 'Double / full', w: 54, h: 24, lengthIn: 75, aff: 0, affMode: 'bottom', label: 'Full Bed', variants: true,
        art: () => bedPreset(54), hatch: R(0.6, 17.86, 52.8, 3.8),
        side: { w: 75, h: 36, art: () => bedSide(75, 36), hatch: R(0, 0, 4, 36) + R(4, 30.6, 70.4, 4.2) } }),
    I({ key: 'bed-twin', name: 'Twin bed', w: 39, h: 24, lengthIn: 75, aff: 0, affMode: 'bottom', label: 'Twin Bed', variants: true,
        art: () => bedPreset(39),
        side: { w: 75, h: 36, art: () => bedSide(75, 36) } }),
    I({ key: 'gr-king-set', name: 'King bed + nightstands', w: 126, h: 54, aff: 0, affMode: 'bottom', label: 'King Bed',
        art: () => nightstand(0, 54, 22, 24, 'frames') + bedFront(24, 78, 54, 0, 'inset', { mT: 29.5, hx: 1, sconces: true }) + nightstand(104, 54, 22, 24, 'vase'),
        side: { w: 84, h: 54, art: () => bedSide(84, 54, { hbTop: 0 }) + nightstand(4, 54, 18, 24) } }),
    I({ key: 'gr-queen-pair', name: 'Double queen beds', w: 172, h: 50, aff: 0, affMode: 'bottom', label: 'Queen Beds',
        art: () => bedFront(0, 64, 50, 8, 'inset', { mT: 25.5, hx: 1 }) + nightstand(74, 50, 24, 24, 'lamp') + bedFront(108, 64, 50, 8, 'inset', { mT: 25.5, hx: 1 }) }),
    I({ key: 'headboard', name: 'Headboard', w: 78, h: 48, aff: 24, affMode: 'bottom', label: 'Headboard',
        art: () => R(0, 0, 78, 48, 0.8, true) + R(3, 3, 72, 42, 0.5) }),
    I({ key: 'nightstand', name: 'Nightstand', w: 24, h: 25, aff: 0, affMode: 'bottom', label: 'Nightstand',
        art: () => nightstand(0, 25, 24, 25), hatch: R(0, 0, 24, 23.4),
        side: { w: 18, h: 25, art: () => foot(1.4, 25, 1.6, 1.6) + foot(15, 25, 1.6, 1.6) + box(0, 0, 18, 23.4, 0.5, true) + HL(1.4, 0, 18) } }),
    I({ key: 'dresser', name: 'Dresser', w: 60, h: 32, aff: 0, affMode: 'bottom', label: 'Dresser',
        art: () => {
            let s = foot(2, 32, 2, 2) + foot(56, 32, 2, 2) + box(0, 0, 60, 30, 0.5, true) + HL(1.4, 0, 60);
            for (let i = 1; i < 3; i++) s += HL(1.4 + i * 28.6 / 3, 1, 59);
            for (let i = 0; i < 3; i++) s += pullH(30, 1.4 + (i + 0.5) * 28.6 / 3, 6);
            return s;
        }, hatch: R(0, 0, 60, 30),
        side: { w: 20, h: 32, art: () => foot(1.4, 32, 2, 2) + foot(16.6, 32, 2, 2) + box(0, 0, 20, 30, 0.5, true) + HL(1.4, 0, 20) } }),
    I({ key: 'gr-desk', name: 'Desk + chair', w: 60, h: 40, aff: 0, affMode: 'bottom', label: 'Desk',
        art: () => {
            let s = R(0, 10, 60, 1.6, 0.4, true) + R(1.2, 11.6, 1.6, 28.4, 0, true) + R(40, 11.6, 18.8, 28.4, 0.3, true);
            for (let i = 1; i < 3; i++) s += HL(11.6 + i * 28.4 / 3, 40, 58.8);
            for (let i = 0; i < 3; i++) s += pullH(49.4, 11.6 + (i + 0.5) * 28.4 / 3, 5);
            return s + taskChair(21, 40, 1);
        } }),
    I({ key: 'desk', name: 'Writing desk', w: 48, h: 30, aff: 0, affMode: 'bottom', label: 'Desk',
        art: () => R(0, 0, 48, 1.6, 0.4, true) + R(1, 1.6, 1.6, 28.4, 0, true) + R(45.4, 1.6, 1.6, 28.4, 0, true) + R(4, 1.6, 40, 4.2, 0.3) + pullH(24, 3.7, 6),
        side: { w: 24, h: 30, art: () => R(0, 0, 24, 1.6, 0.4, true) + R(1, 1.6, 1.6, 28.4, 0, true) + R(21.4, 1.6, 1.6, 28.4, 0, true) } }),
    I({ key: 'gr-media', name: 'TV + console', w: 72, h: 66, aff: 0, affMode: 'bottom', label: 'Media Wall',
        art: () => {
            let s = R(11.75, 0, 48.5, 28, 0.6, true) + R(12.75, 1, 46.5, 25, 0) + HL(26.8, 34, 38);
            s += foot(3, 66, 2, 3) + foot(67, 66, 2, 3) + box(0, 36, 72, 27, 0.5, true) + HL(37.6, 0, 72);
            for (let i = 1; i < 4; i++) s += VL(i * 18, 37.6, 62.2);
            s += pullV(16.8, 49, 8) + pullV(19.2, 49, 8) + pullV(52.8, 49, 8) + pullV(55.2, 49, 8);
            return s;
        } }),
    I({ key: 'console', name: 'Console', w: 60, h: 32, aff: 0, affMode: 'bottom', label: 'Console',
        art: () => R(0, 0, 60, 1.6, 0.4, true) + R(1.5, 1.6, 1.6, 30.4, 0, true) + R(56.9, 1.6, 1.6, 30.4, 0, true) + R(3.1, 1.6, 53.8, 5, 0) + HL(22, 3.1, 56.9) + pullH(30, 4.1, 6) }),
    I({ key: 'tv-55', name: 'TV 55"', w: 48.5, h: 28, aff: 60, affMode: 'center', shape: 'tv', label: 'TV',
        art: () => R(0, 0, 48.5, 28, 0.6, true) + R(1, 1, 46.5, 25, 0) + HL(26.6, 22.5, 26),
        side: { w: 4, h: 28, art: () => R(0, 0, 4, 28, 0.6, true) + R(1.4, 9, 1.2, 10, 0.3) } }),
    I({ key: 'tv-65', name: 'TV 65"', w: 56.7, h: 32.2, aff: 60, affMode: 'center', shape: 'tv', label: 'TV',
        art: () => R(0, 0, 56.7, 32.2, 0.6, true) + R(1, 1, 54.7, 29.2, 0) + HL(30.8, 26.6, 30.1),
        side: { w: 4, h: 32.2, art: () => R(0, 0, 4, 32.2, 0.6, true) + R(1.4, 10.6, 1.2, 11, 0.3) } }),
    I({ key: 'tv-75', name: 'TV 75"', w: 65.4, h: 37.2, aff: 60, affMode: 'center', shape: 'tv', label: 'TV',
        art: () => R(0, 0, 65.4, 37.2, 0.6, true) + R(1, 1, 63.4, 34.2, 0) + HL(35.8, 30.95, 34.45),
        side: { w: 4, h: 37.2, art: () => R(0, 0, 4, 37.2, 0.6, true) + R(1.4, 12.6, 1.2, 12, 0.3) } }),
    I({ key: 'gr-wardrobe-wall', name: 'Wardrobe wall', w: 96, h: 90, aff: 0, affMode: 'bottom', label: 'Wardrobe',
        art: () => {
            let s = box(0, 0, 96, 90, 0.4, true) + HL(1.6, 0, 96) + HL(86, 0, 96);
            for (let i = 1; i < 4; i++) s += VL(i * 24, 1.6, 86);
            s += pullV(21.4, 44, 14) + pullV(26.6, 44, 14) + pullV(69.4, 44, 14) + pullV(74.6, 44, 14);
            return s;
        }, hatch: R(0, 1.6, 96, 84.4) }),
    I({ key: 'wardrobe', name: 'Wardrobe', w: 40, h: 84, aff: 0, affMode: 'bottom', label: 'Wardrobe',
        art: () => box(0, 0, 40, 84, 0.4, true) + HL(1.6, 0, 40) + HL(80.5, 0, 40) + VL(20, 1.6, 80.5) + pullV(18, 42, 10) + pullV(22, 42, 10),
        hatch: R(0, 1.6, 40, 78.9) }),
    I({ key: 'minibar', name: 'Minibar cabinet', w: 30, h: 36, aff: 0, affMode: 'bottom', label: 'Minibar',
        art: () => box(0, 0, 30, 33, 0.4, true) + HL(1.6, 0, 30) + VL(16, 1.6, 33) + HL(17.3, 16, 30) + pullV(14.4, 10, 6) + pullH(23, 9.5, 5) + pullH(23, 25, 5) + R(2, 33, 26, 3, 0, true),
        hatch: R(16, 1.6, 14, 31.4) }),
    I({ key: 'luggage', name: 'Luggage bench', w: 40, h: 20, aff: 0, affMode: 'bottom', label: 'Luggage Bench',
        art: () => R(0, 0, 40, 2, 0.6, true) + R(1.5, 2, 1.6, 18, 0, true) + R(36.9, 2, 1.6, 18, 0, true) + HL(14, 3.1, 36.9) + VL(10, 0, 2) + VL(20, 0, 2) + VL(30, 0, 2),
        side: { w: 20, h: 20, art: () => R(0, 0, 20, 2, 0.6, true) + R(1.5, 2, 1.6, 18, 0, true) + R(16.9, 2, 1.6, 18, 0, true) + HL(14, 3.1, 16.9) } }),
    I({ key: 'bench', name: 'Upholstered bench', w: 48, h: 18, aff: 0, affMode: 'bottom', label: 'Bench',
        art: () => R(0, 0, 48, 5, 1.6, true) + HL(2.4, 1, 47) + R(2, 5, 1.6, 13, 0, true) + R(44.4, 5, 1.6, 13, 0, true) + HL(13.5, 3.6, 44.4) }),
    I({ key: 'sofa', name: 'Sofa', w: 84, h: 32, aff: 0, affMode: 'bottom', label: 'Sofa',
        art: () => {
            let s = foot(4, 32, 2, 3) + foot(78, 32, 2, 3);
            s += P('M5 18 V5.6 Q5 2 8.6 2 H75.4 Q79 2 79 5.6 V18 Z', true);
            s += P('M0 29 V13 Q0 9 4 9 Q8 9 8 13 V29 Z', true) + P('M76 29 V13 Q76 9 80 9 Q84 9 84 13 V29 Z', true);
            s += R(7, 17, 70, 12, 1.6, true) + VL(42, 17, 24.5) + HL(24.5, 7, 77);
            s += VL(42, 3.5, 17);
            return s;
        },
        side: { w: 36, h: 32, art: () => foot(3, 32, 2, 3) + foot(31, 32, 2, 3) + P('M0 29 V6 Q0 0 6 0 H9 Q12 0 12 6 V17 H33 Q36 17 36 20 V29 Z', true) + HL(24.5, 0, 36) + open('M12 17 Q11 22 12 24.5') } }),
    I({ key: 'ottoman', name: 'Ottoman', w: 24, h: 18, aff: 0, affMode: 'bottom', label: 'Ottoman',
        art: () => R(0, 0, 24, 15, 2.4, true) + HL(3.6, 1, 23) + foot(2, 18, 2, 3) + foot(20, 18, 2, 3) }),
    I({ key: 'side-table', name: 'Side table', w: 22, h: 24, aff: 0, affMode: 'bottom', label: 'Side Table',
        art: () => R(0, 0, 22, 1.6, 0.4, true) + R(10.2, 1.6, 1.6, 21, 0, true) + R(5, 22.6, 12, 1.4, 0.4, true) }),
    I({ key: 'table', name: 'Table', w: 48, h: 30, aff: 0, affMode: 'bottom', label: 'Table',
        art: () => R(0, 0, 48, 1.8, 0.4, true) + R(2, 1.8, 1.8, 28.2, 0, true) + R(44.2, 1.8, 1.8, 28.2, 0, true) + HL(5, 3.8, 44.2),
        side: { w: 30, h: 30, art: () => R(0, 0, 30, 1.8, 0.4, true) + R(2, 1.8, 1.8, 28.2, 0, true) + R(26.2, 1.8, 1.8, 28.2, 0, true) + HL(5, 3.8, 26.2) } }),
    I({ key: 'mirror-floor', name: 'Floor mirror', w: 24, h: 68, aff: 0, affMode: 'bottom', label: 'Mirror',
        art: () => P('M0 68 V12 C0 5 5.4 0 12 0 C18.6 0 24 5 24 12 V68 Z', true) + open('M2 68 V12.4 C2 6.6 6.6 2 12 2 C17.4 2 22 6.6 22 12.4 V68') + L(6, 56, 13, 24) + L(10.5, 56, 17.5, 24) }),
    I({ key: 'coat-stand', name: 'Coat stand', w: 20, h: 68, aff: 0, affMode: 'bottom', label: '',
        art: () => L(10, 62, 2, 68) + L(10, 62, 18, 68) + R(9.3, 3, 1.4, 61, 0.5, true) + C(10, 2.2, 1.2, true)
            + open('M9.3 8 C6 8 4 7 3.4 4.6') + open('M10.7 8 C14 8 16 7 16.6 4.6') + open('M9.3 13 C7 13 5.6 12.4 5 10.6') + open('M10.7 13 C13 13 14.4 12.4 15 10.6') }),
]);

cat('Bathroom', [
    I({ key: 'ba-vanity-mirror', name: 'Vanity + mirror', w: 60, h: 84, aff: 0, affMode: 'bottom', label: 'Vanity',
        art: () => R(13, 2, 34, 34, 0.4, true) + R(14.4, 3.4, 31.2, 31.2, 0)
            + R(4, 12, 4, 9, 1, true) + VL(6, 21, 24) + R(52, 12, 4, 9, 1, true) + VL(54, 21, 24)
            + faucet(30, 50) + vanity(0, 60, 84, 34, 2, [30]),
        hatch: R(14.4, 3.4, 31.2, 31.2) }),
    I({ key: 'vanity-60', name: 'Vanity 60"', w: 60, h: 34, aff: 0, affMode: 'bottom', label: 'Vanity',
        art: () => vanity(0, 60, 34, 34, 2, [30]) }),
    I({ key: 'ba-vanity-single', name: 'Single vanity', w: 36, h: 34, aff: 0, affMode: 'bottom', label: 'Vanity',
        art: () => vanity(0, 36, 34, 34, 2, [18]),
        side: { w: 22, h: 34, art: () => vanity(0, 22, 34, 34, 1) } }),
    I({ key: 'ba-vanity-double', name: 'Double vanity', w: 72, h: 34, aff: 0, affMode: 'bottom', label: 'Vanity',
        art: () => vanity(0, 72, 34, 34, 4, [18, 54]) }),
    I({ key: 'vanity-ada', name: 'ADA vanity', w: 48, h: 34, aff: 0, affMode: 'bottom', label: 'ADA Vanity',
        // Open knee space: the bowl is VISIBLE (so not dashed), drawn as a bowl with a drain.
        art: () => R(0, 0, 48, 2, 0.4, true) + R(0.5, 2, 1.8, 32, 0, true) + R(45.7, 2, 1.8, 32, 0, true)
            + open('M14 2 v2 a10 6 0 0 0 20 0 v-2') + open('M20 9.6 a4 2.4 0 0 0 8 0') + C(24, 8.8, 0.7)
            + open('M24 10 V14 Q24 16 26 16 H30'),
        side: { w: 22, h: 34, art: () => R(0, 0, 22, 2, 0.4, true) + R(0.5, 2, 1.8, 32, 0, true) + open('M4 2 V5 Q4 9 8.6 9 H11 Q14 9 14 5 V2') } }),
    I({ key: 'shower', name: 'Shower', w: 36, h: 80, aff: 0, affMode: 'bottom', label: 'Shower',
        art: () => R(0, 0, 36, 80, 0.4, true) + R(1.6, 1.6, 32.8, 74.4, 0) + R(0, 76, 36, 4, 0, true) + VL(19, 1.6, 76) + pullV(16.6, 40, 10)
            + open('M28 6 V4 H24') + R(21.6, 6, 6.8, 1.2, 0.6) }),
    I({ key: 'ba-shower-glass', name: 'Glass shower', w: 60, h: 84, aff: 0, affMode: 'bottom', label: 'Shower',
        art: () => {
            let s = R(0, 0, 60, 84, 0.3, true) + R(0, 80, 60, 4, 0.3, true) + VL(30, 0, 80) + VL(31.2, 0, 80);
            s += open('M18 32 V8 Q18 5.6 15.6 5.6 H12') + R(7, 5.6, 7, 1.4, 0.7) + open('M18 46 V60') + R(16.6, 60, 2.8, 5, 1.2);
            s += C(18, 46, 2) + C(18, 46, 0.6);
            s += pullV(34.6, 42, 16);
            return s;
        }, hatch: R(0, 0, 60, 80) }),
    I({ key: 'ba-shower-niche', name: 'Shower niche + fixtures', w: 36, h: 84, aff: 0, affMode: 'bottom', label: 'Shower',
        art: () => {
            let s = R(0, 0, 36, 84, 0.3) + HL(80, 0, 36);
            s += R(22, 26, 10, 14, 0.5) + HL(33, 22, 32) + R(24, 29.4, 2.2, 3.6, 0.5) + R(27.4, 28.6, 2.4, 4.4, 0.5);
            s += open('M12 18 V8 Q12 5.6 9.6 5.6 H8') + R(3.6, 5.6, 6.8, 1.4, 0.7) + C(12, 36, 2.2) + C(12, 36, 0.6) + open('M12 38.2 V50') + R(10.6, 50, 2.8, 5, 1.2);
            return s;
        } }),
    I({ key: 'ba-tub-free', name: 'Freestanding tub', w: 72, h: 28, aff: 0, affMode: 'bottom', label: 'Tub',
        art: () => P('M0 10 H72 C71 18 66 27 60 28 H12 C6 27 1 18 0 10 Z', true) + HL(12, 1, 71)
            + open('M36 10 V4 Q36 0.8 39.2 0.8 Q42 0.8 42 3.6 V4.4') + R(33.6, 8.8, 4.8, 1.2, 0.3) + VL(33.2, 7, 10) + VL(38.8, 7, 10),
        side: { w: 32, h: 28, art: () => P('M0 10 H32 C31.4 18 28.6 27 25 28 H7 C3.4 27 0.6 18 0 10 Z', true) + HL(12, 0.6, 31.4) } }),
    I({ key: 'tub', name: 'Built-in tub', w: 60, h: 20, aff: 0, affMode: 'bottom', label: 'Tub',
        art: () => R(0, 0, 60, 20, 0.4, true) + HL(2.4, 0, 60) + R(1.6, 17.6, 56.8, 2.4, 0) + pullV(52, 10, 6) }),
    I({ key: 'mirror-lit', name: 'Lighted mirror', w: 30, h: 40, aff: 40, affMode: 'bottom', label: 'Mirror',
        art: () => R(0, 0, 30, 40, 4, true) + R(2, 2, 26, 36, 2.6) + L(7, 31, 14, 10) + L(11, 31, 18, 10), hatch: R(2, 2, 26, 36) }),
    I({ key: 'grab-36', name: 'Grab bar 36"', w: 36, h: 1.5, aff: 34, affMode: 'bottom', shape: 'shelf', label: 'Grab Bar',
        art: () => R(0, 0, 3, 1.5, 0.6, true) + R(33, 0, 3, 1.5, 0.6, true) + R(3, 0.25, 30, 1, 0.5, true) }),
    I({ key: 'grab-42', name: 'Grab bar 42"', w: 42, h: 1.5, aff: 34, affMode: 'bottom', shape: 'shelf', label: 'Grab Bar',
        art: () => R(0, 0, 3, 1.5, 0.6, true) + R(39, 0, 3, 1.5, 0.6, true) + R(3, 0.25, 36, 1, 0.5, true) }),
    I({ key: 'towel-bar', name: 'Towel bar', w: 24, h: 4, aff: 48, affMode: 'bottom', label: '',
        art: () => R(0, 0, 2.4, 4, 1, true) + R(21.6, 0, 2.4, 4, 1, true) + R(2.4, 1.4, 19.2, 1.2, 0.6, true) }),
    I({ key: 'ba-towel-hooks', name: 'Towel bar + hooks', w: 36, h: 6, aff: 48, affMode: 'bottom', label: '',
        art: () => R(0, 1, 2.4, 4, 1, true) + R(21.6, 1, 2.4, 4, 1, true) + R(2.4, 2.4, 19.2, 1.2, 0.6, true)
            + C(29, 1.4, 1, true) + open('M29 2.4 V4.4 Q29 5.6 30.2 5') + C(34, 1.4, 1, true) + open('M34 2.4 V4.4 Q34 5.6 35.2 5') }),
    I({ key: 'towel-ring', name: 'Towel ring', w: 7, h: 9, aff: 48, affMode: 'bottom', label: '',
        art: () => R(2.4, 0, 2.2, 1.6, 0.5, true) + VL(3.5, 1.6, 2.3) + C(3.5, 5.6, 3.2) }),
    I({ key: 'robe-hook', name: 'Robe hook', w: 2, h: 3, aff: 66, affMode: 'center', label: '',
        art: () => C(1, 0.7, 0.6, true) + open('M1 1.3 V2 Q1 2.9 1.9 2.5') }),
    I({ key: 'ba-accessories', name: 'Shelf + toiletries', w: 24, h: 12, aff: 48, affMode: 'bottom', label: '',
        art: () => R(2, 4, 3, 7, 0.8, true) + R(2.8, 2.4, 1.4, 1.6, 0.3, true) + R(6.4, 5.6, 3.2, 5.4, 0.8, true) + R(7.4, 3.6, 1.2, 2, 0.3, true)
            + P('M12 7 H17 L16.4 11 H12.6 Z', true) + R(18.6, 8.4, 4, 2.6, 1.2, true) + R(0, 11, 24, 1, 0.3, true) }),
    I({ key: 'towel-disp', name: 'Paper towel dispenser', w: 11, h: 15, aff: 40, affMode: 'bottom', label: '',
        art: () => R(0, 0, 11, 15, 1.2, true) + HL(12.6, 2.4, 8.6) + R(4, 5, 3, 3, 0.5) }),
    I({ key: 'hand-dryer', name: 'Hand dryer', w: 10, h: 12, aff: 40, affMode: 'bottom', label: '',
        art: () => R(0, 0, 10, 10, 1.6, true) + P('M3.5 10 H6.5 L6 12 H4 Z', true) + HL(6.4, 4.4, 5.6) }),
    I({ key: 'soap', name: 'Soap dispenser', w: 4, h: 7, aff: 42, affMode: 'bottom', label: '',
        art: () => R(0, 0, 4, 7, 0.8, true) + R(1, 1.6, 2, 2.6, 0.3) + HL(5.2, 0.8, 3.2) }),
    I({ key: 'tp-holder', name: 'Toilet paper (double)', w: 12, h: 5, aff: 22, affMode: 'center', label: '',
        art: () => C(2.5, 2.5, 2.4, true) + C(9.5, 2.5, 2.4, true) + C(2.5, 2.5, 0.7) + C(9.5, 2.5, 0.7) + HL(2.5, 4.9, 7.1) }),
]);

cat('Toilets', [
    I({ key: 'toilet-tank', name: 'Floor-mounted toilet', w: 20, h: 30, aff: 0, affMode: 'bottom', label: 'Toilet',
        art: () => toilet(10, 30),
        side: { w: 28, h: 30, art: () => R(0, 0, 8, 11.4, 0.8, true) + P('M0 11.6 H24 Q26 11.6 26 13.6 C26 18.4 22 21.6 17 22.6 L16 30 H6 L5.4 21.6 C2 20.6 0 17.6 0 13.6 Z', true) + HL(13.6, 0, 26) } }),
    I({ key: 'toilet-ada', name: 'ADA toilet', w: 15, h: 18, aff: 0, affMode: 'bottom', label: 'ADA Toilet',
        art: () => R(0.5, 0, 14, 2, 0.9, true) + P('M1.4 2 H13.6 C13.4 7.6 11 10.6 10.4 13 L11.6 18 H3.4 L4.6 13 C4 10.6 1.6 7.6 1.4 2 Z', true),
        side: { w: 28, h: 18, art: () => P('M0 0 H23 Q26 0 26 2 C26 7 22 10 17 11 L16 18 H6 L5.4 10 C2 9 0 6 0 2 Z', true) + HL(2, 0, 26) } }),
    I({ key: 'toilet-wall', name: 'Wall-hung toilet', w: 15, h: 11, aff: 8, affMode: 'bottom', label: 'Toilet',
        art: () => R(0, 0, 15, 2.2, 0.9, true) + P('M0.6 2.2 H14.4 C14.2 6 12 9.4 10 11 H5 C3 9.4 0.8 6 0.6 2.2 Z', true),
        side: { w: 22, h: 11, art: () => P('M0 0 H19.6 Q22 0 22 2.2 C22 6.4 17 10.4 9 11 H0 Z', true) + HL(2.2, 0, 22) } }),
    I({ key: 'flush-plate', name: 'Flush plate', w: 9, h: 6, aff: 40, affMode: 'bottom', label: '',
        art: () => R(0, 0, 9, 6, 0.8, true) + R(1, 1, 3.3, 4, 0.6) + R(4.7, 1, 3.3, 4, 0.6) }),
    I({ key: 'urinal', name: 'Urinal', w: 18, h: 26, aff: 13, affMode: 'bottom', label: 'Urinal',
        art: () => P('M3 0 H15 Q18 0 18 3 V16 C18 21.4 15.4 26 9 26 C2.6 26 0 21.4 0 16 V3 Q0 0 3 0 Z', true)
            + P('M3.4 8 Q9 6 14.6 8 V16.6 C14.6 20.4 12.4 22.6 9 22.6 C5.6 22.6 3.4 20.4 3.4 16.6 Z') + R(7.6, 2.4, 2.8, 1.8, 0.5),
        side: { w: 14, h: 26, art: () => P('M0 0 H6 Q14 2 14 14 C14 22 10 26 4 26 H0 Z', true) + open('M0 8 Q7 9 9 16 Q8.4 21 4 22.6 H0') } }),
    I({ key: 'fx-ada-toilet', name: 'Accessible toilet + grab bar', w: 60, h: 36, aff: 0, affMode: 'bottom', label: 'Toilet',
        // Toilet 18in off the side wall (left edge), rear bar 36in long at 33-36in AFF.
        art: () => R(8, 1.2, 36, 1.5, 0.75, true) + R(6, 0, 3, 3.6, 0.8, true) + R(43, 0, 3, 3.6, 0.8, true)
            + toilet(18, 36) + C(37, 14, 2.4, true) + C(37, 14, 0.7) }),
    I({ key: 'lav-wall', name: 'Wall lav', w: 20, h: 22, aff: 12, affMode: 'bottom', label: 'Lavatory',
        art: () => R(0, 6, 20, 2, 0.6, true) + P('M1 8 H19 C18.6 12.6 15 15 10 15 C5 15 1.4 12.6 1 8 Z', true) + open('M8.6 6 V3 Q8.6 1 10.6 1 H12.6 V2') + open('M10 15 V19 Q10 21 12 21 H14') }),
    I({ key: 'lav-pedestal', name: 'Pedestal sink', w: 22, h: 38, aff: 0, affMode: 'bottom', label: 'Sink',
        art: () => open('M10 4 V1.8 Q10 0.4 11.6 0.4 H13.6 V1.4') + R(9, 3.4, 3, 0.6, 0.2)
            + P('M0.8 4 H21.2 Q22 4 22 4.8 V6 C22 10.6 18 13 11 13 C4 13 0 10.6 0 6 V4.8 Q0 4 0.8 4 Z', true)
            + P('M8 13 C8.6 20 8.2 30 6.6 38 H15.4 C13.8 30 13.4 20 14 13', true) + HL(6, 0, 22) }),
    I({ key: 'fx-lav-basin', name: 'Vessel basin', w: 24, h: 10, aff: 34, affMode: 'bottom', label: 'Basin',
        art: () => P('M2 4 H22 C21.4 7.6 18 10 12 10 C6 10 2.6 7.6 2 4 Z', true) + open('M5 2.8 V1.4 Q5 0 6.4 0 H9 V0.8') + R(4, 2.8, 2, 1.2, 0.3) }),
    I({ key: 'stall', name: 'Toilet stall', w: 36, h: 70, aff: 0, affMode: 'bottom', label: 'Stall',
        art: () => R(0, 0, 36, 1.5, 0.3, true) + R(0, 1.5, 4, 68.5, 0.3, true) + R(32, 1.5, 4, 68.5, 0.3, true) + R(4.5, 1.5, 27, 56.5, 0.5, true)
            + HL(66, 0, 4) + HL(66, 32, 36) + R(28, 28, 2.5, 3, 0.4) + R(28.4, 24, 1.7, 2, 0.3) }),
    I({ key: 'fountain', name: 'Drinking fountain', w: 19, h: 18, aff: 27, affMode: 'bottom', label: 'Fountain',
        art: () => P('M1 0 H18 Q19 0 19 1 V7 C19 12.4 15 18 9.5 18 C4 18 0 12.4 0 7 V1 Q0 0 1 0 Z', true) + HL(2.4, 0, 19) + HL(10.4, 6, 13) + open('M8.8 2.4 V1.2 H10.2 V2.4') }),
]);

cat('Office', [
    I({ key: 'of-workstation', name: 'Workstation + task chair', w: 72, h: 42, aff: 0, affMode: 'bottom', label: 'Workstation',
        art: () => {
            let s = R(25, 0, 22, 13, 0.6, true) + R(26, 1, 20, 10.4, 0) + R(35, 13, 2, 2.4, 0, true) + R(31.4, 15.4, 9.2, 0.8, 0.3, true);
            s += plant(62, 16.2, 12);
            s += R(4, 13.2, 6, 3, 0.6, true);
            s += R(0, 16.2, 72, 1.6, 0.4, true) + R(1.2, 17.8, 1.6, 24.2, 0, true) + R(52, 17.8, 18.8, 24.2, 0.3, true);
            for (let i = 1; i < 3; i++) s += HL(17.8 + i * 24.2 / 3, 52, 70.8);
            for (let i = 0; i < 3; i++) s += pullH(61.4, 17.8 + (i + 0.5) * 24.2 / 3, 5);
            return s + taskChair(36, 42, 0.92);
        } }),
    I({ key: 'workstation', name: 'Workstation + screen', w: 60, h: 48, aff: 0, affMode: 'bottom', label: 'Workstation',
        art: () => R(0, 0, 60, 18, 0.8, true) + R(1.6, 1.6, 56.8, 16.4, 0.3) + R(20, 4, 20, 11.6, 0.5, true) + R(29, 15.6, 2, 2.4, 0, true)
            + R(0, 18, 60, 1.6, 0.4, true) + R(1, 19.6, 1.8, 28.4, 0, true) + R(57.2, 19.6, 1.8, 28.4, 0, true) + R(2.8, 19.6, 54.4, 11, 0) }),
    I({ key: 'off-desk', name: 'Office desk', w: 60, h: 30, aff: 0, affMode: 'bottom', label: 'Desk',
        art: () => {
            let s = R(0, 0, 60, 1.6, 0.4, true) + R(1, 1.6, 1.8, 28.4, 0, true) + R(41, 1.6, 18, 28.4, 0.3, true) + R(2.8, 1.6, 38.2, 12, 0);
            for (let i = 1; i < 3; i++) s += HL(1.6 + i * 28.4 / 3, 41, 59);
            for (let i = 0; i < 3; i++) s += pullH(50, 1.6 + (i + 0.5) * 28.4 / 3, 5);
            return s;
        },
        side: { w: 30, h: 30, art: () => R(0, 0, 30, 1.6, 0.4, true) + R(1, 1.6, 28, 28.4, 0.3, true) } }),
    I({ key: 'of-desk-storage', name: 'Desk + storage', w: 72, h: 30, aff: 0, affMode: 'bottom', label: 'Desk',
        art: () => {
            let s = R(0, 0, 72, 1.6, 0.4, true) + R(1, 1.6, 17, 28.4, 0.3, true) + R(54, 1.6, 17, 28.4, 0.3, true) + R(18, 1.6, 36, 10, 0);
            for (let i = 1; i < 3; i++) s += HL(1.6 + i * 28.4 / 3, 1, 18);
            for (let i = 0; i < 3; i++) s += pullH(9.5, 1.6 + (i + 0.5) * 28.4 / 3, 5);
            s += HL(15.8, 54, 71) + R(57, 4.4, 2.4, 9, 0.3) + R(60, 5.4, 2.4, 8, 0.3) + R(63, 4, 2.4, 9.4, 0.3) + pullH(62.5, 22.9, 5);
            return s;
        } }),
    I({ key: 'credenza', name: 'Credenza', w: 72, h: 30, aff: 0, affMode: 'bottom', label: 'Credenza',
        art: () => {
            let s = foot(3, 30, 2, 4) + foot(67, 30, 2, 4) + box(0, 0, 72, 26, 0.5, true) + HL(1.6, 0, 72);
            for (let i = 1; i < 4; i++) s += VL(i * 18, 1.6, 26);
            for (let i = 0; i < 4; i++) s += pullH(i * 18 + 9, 5, 5);
            return s;
        }, hatch: R(0, 1.6, 72, 24.4),
        side: { w: 20, h: 30, art: () => foot(2, 30, 2, 4) + foot(16, 30, 2, 4) + box(0, 0, 20, 26, 0.5, true) + HL(1.6, 0, 20) } }),
    I({ key: 'of-meeting', name: 'Meeting table + chairs', w: 120, h: 36, aff: 0, affMode: 'bottom', label: 'Meeting Table',
        art: () => {
            let s = R(36, 0, 18, 10, 2.4, true) + R(66, 0, 18, 10, 2.4, true);
            s += R(18, 7, 84, 1.8, 0.6, true) + R(33, 8.8, 2, 27.2, 0, true) + R(85, 8.8, 2, 27.2, 0, true) + R(27, 34.6, 14, 1.4, 0.4, true) + R(79, 34.6, 14, 1.4, 0.4, true);
            s += taskChairSide(0, 36, 1) + taskChairSide(120, 36, -1);
            return s;
        } }),
    I({ key: 'conf-table', name: 'Conference table', w: 96, h: 30, aff: 0, affMode: 'bottom', label: 'Table',
        art: () => R(0, 0, 96, 2, 0.6, true) + P('M18 2 H30 L32 30 H16 Z M66 2 H78 L80 30 H64 Z', true) + HID(R(36, 2.4, 24, 3.6, 0)) }),
    I({ key: 'monitor', name: 'Monitor', w: 24, h: 17, aff: 29.5, affMode: 'bottom', label: '',
        art: () => R(0, 0, 24, 14.2, 0.6, true) + R(0.9, 0.9, 22.2, 11.8, 0) + R(11, 14.2, 2, 2.1, 0, true) + R(7, 16.3, 10, 0.7, 0.3, true) }),
    I({ key: 'whiteboard', name: 'Whiteboard', w: 72, h: 48, aff: 36, affMode: 'bottom', label: 'Whiteboard',
        art: () => R(0, 0, 72, 45, 0.6, true) + R(1, 1, 70, 43, 0) + P('M4 45 H68 V46.5 Q68 48 66.5 48 H5.5 Q4 48 4 46.5 Z', true) + HL(45.9, 10, 15) + HL(45.9, 17, 22) }),
    I({ key: 'file-lateral', name: 'Lateral file', w: 36, h: 28, aff: 0, affMode: 'bottom', label: 'File',
        art: () => box(0, 0, 36, 28, 0.5, true) + HL(14, 1, 35) + pullH(18, 5, 9) + pullH(18, 19, 9) }),
    I({ key: 'of-file-3', name: 'Lateral file, 3 drawer', w: 36, h: 40, aff: 0, affMode: 'bottom', label: 'File',
        art: () => box(0, 0, 36, 40, 0.5, true) + HL(13.3, 1, 35) + HL(26.6, 1, 35) + pullH(18, 4.6, 9) + pullH(18, 17.9, 9) + pullH(18, 31.2, 9) }),
    I({ key: 'cab-storage', name: 'Storage cabinet', w: 36, h: 72, aff: 0, affMode: 'bottom', label: 'Cabinet',
        art: () => box(0, 0, 36, 72, 0.5, true) + HL(1.6, 0, 36) + HL(69, 0, 36) + VL(18, 1.6, 69) + pullV(15.6, 35, 6) + pullV(20.4, 35, 6),
        hatch: R(0, 1.6, 36, 67.4) }),
    I({ key: 'bookcase', name: 'Bookcase', w: 36, h: 72, aff: 0, affMode: 'bottom', label: 'Bookcase',
        art: () => {
            let s = box(0, 0, 36, 72, 0.5, true) + R(1.6, 1.6, 32.8, 66.4, 0) + HL(18, 1.6, 34.4) + HL(35.5, 1.6, 34.4) + HL(53, 1.6, 34.4);
            s += R(3.6, 9, 1.8, 9, 0.2) + R(5.4, 8, 1.8, 10, 0.2) + R(7.2, 9.6, 1.8, 8.4, 0.2) + R(24, 15.4, 9, 2.6, 0.3) + R(25, 13, 7, 2.4, 0.3);
            s += R(3.6, 26, 1.8, 9.5, 0.2) + R(5.4, 25, 1.8, 10.5, 0.2) + R(7.2, 26.6, 1.8, 8.9, 0.2) + vase(28.6, 35.5).replace(/<path fill="none"[^>]*>|<circle[^>]*>/g, '');
            s += R(3.6, 46, 10, 7, 0.4) + R(22, 43.6, 1.8, 9.4, 0.2) + R(23.8, 44.6, 1.8, 8.4, 0.2) + R(25.6, 43, 1.8, 10, 0.2);
            s += R(3.6, 59.6, 12.4, 8.4, 1) + R(20, 59.6, 12.4, 8.4, 1);
            return s;
        } }),
    I({ key: 'reception', name: 'Reception desk', w: 120, h: 42, aff: 0, affMode: 'bottom', label: 'Reception Desk',
        art: () => R(0, 0, 120, 2, 0.6, true) + box(1, 2, 118, 38, 0.5, true) + HL(10, 1, 119) + R(2, 40, 116, 2, 0, true) }),
    I({ key: 'kitchenette', name: 'Kitchenette', w: 96, h: 90, aff: 0, affMode: 'bottom', label: 'Kitchenette',
        art: () => {
            let s = box(0, 0, 96, 36, 0.4, true);
            for (let i = 1; i < 4; i++) s += VL(i * 24, 0, 36);
            s += pullV(21.6, 31, 4) + pullV(26.4, 31, 4) + pullV(69.6, 31, 4) + pullV(74.4, 31, 4);
            s += open('M35.4 54 V48 Q35.4 45 38.4 45 Q41 45 41 48 V49.2') + R(34, 53.2, 3.4, 0.8, 0.2);
            s += R(0, 54, 96, 1.6, 0.4, true) + box(0.6, 55.6, 94.8, 30.4, 0.3, true) + R(2, 86, 92, 4, 0, true);
            s += VL(24, 55.6, 86) + VL(36, 55.6, 86) + VL(48, 55.6, 86) + VL(72, 55.6, 86) + VL(84, 55.6, 86) + HL(65.6, 0.6, 24) + HL(75.6, 0.6, 24);
            s += pullH(12, 60.6, 5) + pullH(12, 70.6, 5) + pullH(12, 80.6, 5) + pullV(33.6, 61, 5) + pullV(38.4, 61, 5) + pullH(60, 58.4, 14) + pullV(81.6, 61, 5) + pullV(86.4, 61, 5);
            s += HID(open('M27 55.6 V61 Q27 63 29 63 H43 Q45 63 45 61 V55.6'));
            return s;
        } }),
    I({ key: 'fridge', name: 'Refrigerator', w: 36, h: 70, aff: 0, affMode: 'bottom', label: 'Fridge',
        art: () => R(0, 0, 36, 68, 1, true) + R(1.5, 68, 33, 2, 0.3, true) + VL(18, 0, 42) + HL(42, 0, 36) + pullV(16.2, 21, 24) + pullV(19.8, 21, 24) + pullH(18, 45.6, 16) + R(5, 14, 7, 10, 0.6) }),
]);

cat('Glass', [
    I({ key: 'gl-door', name: 'Glass partition + door', w: 185, h: 108, aff: 0, affMode: 'bottom', label: 'Glass Partition',
        art: () => {
            let s = R(0, 0, 185, 108, 0.3, true) + R(1.6, 1.6, 181.8, 104.8, 0);
            for (let i = 1; i < 4; i++) s += VL(1.6 + i * 35, 1.6, 106.4);
            s += R(141.6, 1.6, 4, 104.8, 0) + R(147.6, 3.6, 33.8, 102.8, 0.2) + R(149.6, 5.6, 29.8, 98.8, 0) + lever(176.6, 72, -1);
            return s;
        }, hatch: R(1.6, 1.6, 140, 104.8) + R(149.6, 5.6, 29.8, 98.8) }),
    I({ key: 'gl-double', name: 'Double glass doors + sidelights', w: 185, h: 108, aff: 0, affMode: 'bottom', label: 'Glass Doors',
        art: () => {
            let s = R(0, 0, 185, 108, 0.3, true) + R(1.6, 1.6, 181.8, 104.8, 0) + VL(54, 1.6, 106.4) + VL(131, 1.6, 106.4) + HL(22, 1.6, 183.4);
            s += R(56, 24, 36.5, 82.4, 0) + R(92.5, 24, 36.5, 82.4, 0) + pullV(88.5, 64, 26) + pullV(96.5, 64, 26);
            return s;
        }, hatch: R(1.6, 1.6, 181.8, 104.8) }),
    I({ key: 'gl-fixed', name: 'Full-height fixed glass', w: 120, h: 108, aff: 0, affMode: 'bottom', label: 'Glass',
        art: () => R(0, 0, 120, 108, 0.3, true) + R(1.6, 1.6, 116.8, 104.8, 0) + VL(40, 1.6, 106.4) + VL(80, 1.6, 106.4),
        hatch: R(1.6, 1.6, 116.8, 104.8) }),
    I({ key: 'gl-framed', name: 'Framed glass partition', w: 144, h: 108, aff: 0, affMode: 'bottom', label: 'Glass',
        art: () => R(0, 0, 144, 108, 0.3, true) + R(1.6, 1.6, 140.8, 104.8, 0) + R(1.6, 22, 140.8, 2, 0) + R(47.2, 1.6, 2, 104.8, 0) + R(94.8, 1.6, 2, 104.8, 0) + R(1.6, 102.4, 140.8, 4, 0),
        hatch: R(1.6, 1.6, 140.8, 104.8) }),
    I({ key: 'gl-frameless', name: 'Frameless glass partition', w: 144, h: 108, aff: 0, affMode: 'bottom', label: 'Glass',
        art: () => R(0, 0, 144, 2, 0.3, true) + R(0, 106, 144, 2, 0.3, true) + VL(0.3, 2, 106) + VL(143.7, 2, 106) + VL(47.6, 2, 106) + VL(48.4, 2, 106) + VL(95.6, 2, 106) + VL(96.4, 2, 106),
        hatch: R(0, 2, 144, 104) }),
    I({ key: 'gl-slide', name: 'Glass sliding door', w: 96, h: 108, aff: 0, affMode: 'bottom', label: 'Sliding Door',
        art: () => R(0, 0, 96, 3, 0.4, true) + C(10, 4.6, 1.2) + C(38, 4.6, 1.2) + C(56, 4.6, 1.2) + C(84, 4.6, 1.2)
            + R(2, 5.8, 46, 101, 0.3, true) + R(4, 7.8, 42, 97, 0) + R(46, 5.8, 48, 101, 0.3, true) + R(48, 7.8, 44, 97, 0) + pullV(51, 64, 22) + HL(107.2, 0, 96),
        hatch: R(2, 5.8, 92, 101) }),
    I({ key: 'window', name: 'Window', w: 48, h: 48, aff: 36, affMode: 'bottom', label: 'Window',
        art: () => R(0, 0, 48, 48, 0.3, true) + R(2, 2, 44, 44, 0) + VL(24, 2, 46) + R(-1, 46, 50, 2, 0.3, true), hatch: R(2, 2, 44, 44) }),
    I({ key: 'window-full', name: 'Full-height window', w: 72, h: 96, aff: 4, affMode: 'bottom', label: 'Window',
        art: () => R(0, 0, 72, 96, 0.3, true) + R(2, 2, 68, 92, 0) + VL(36, 2, 94) + HL(72, 2, 70), hatch: R(2, 2, 68, 92) }),
]);

cat('Doors', [
    I({ key: 'door-guest', name: 'Guestroom entry', w: 36, h: 84, aff: 0, affMode: 'bottom', label: 'Guestroom Door',
        // Lever at 36in AFF (cy 48 on an 84in leaf).
        art: () => door(36, 84, 48) + R(4.4, 52.6, 4.4, 2.2, 0.5),
        hatch: '<rect x="2" y="2" width="32" height="82"/>' }),
    I({ key: 'door-ada-bath', name: 'ADA bathroom', w: 36, h: 80, aff: 0, affMode: 'bottom', label: 'ADA Bathroom Door',
        // Lever at 34in AFF (cy 46 on an 80in leaf).
        art: () => door(36, 80, 46),
        hatch: '<rect x="2" y="2" width="32" height="78"/>' }),
    I({ key: 'dr-accessible', name: 'Accessible door', w: 36, h: 84, aff: 0, affMode: 'bottom', label: 'Door',
        art: () => door(36, 84, 50) + R(3.6, 74, 28.8, 8.6, 0) + R(14, 14, 8, 20, 0),
        hatch: '<rect x="2" y="2" width="32" height="82"/>' }),
    I({ key: 'dr-double', name: 'Double doors', w: 72, h: 84, aff: 0, affMode: 'bottom', label: 'Doors',
        art: () => R(0, 0, 72, 84, 0, true) + open('M1 84 V1 H71 V84') + R(2, 2, 34, 82, 0) + R(36, 2, 34, 82, 0)
            + R(2, 12, 0.6, 3.6, 0) + R(2, 62, 0.6, 3.6, 0) + R(69.4, 12, 0.6, 3.6, 0) + R(69.4, 62, 0.6, 3.6, 0)
            + R(15, 47.4, 18, 1.2, 0.6) + R(39, 47.4, 18, 1.2, 0.6),
        hatch: R(2, 2, 68, 82) }),
    I({ key: 'door-closet', name: 'Closet double', w: 72, h: 80, aff: 0, affMode: 'bottom', label: 'Closet Doors',
        art: () => R(0, 0, 72, 80, 0, true) + open('M1 80 V1 H71 V80') + R(2, 2, 34, 78, 0) + R(36, 2, 34, 78, 0) + pullV(33.4, 44, 8) + pullV(38.6, 44, 8),
        hatch: R(2, 2, 68, 78) }),
    I({ key: 'dr-pocket', name: 'Pocket door', w: 36, h: 84, aff: 0, affMode: 'bottom', label: 'Pocket Door',
        art: () => R(0, 0, 36, 84, 0, true) + open('M1 84 V1 H35 V84') + R(2, 2, 32, 82, 0) + R(31, 40, 1.6, 6, 0.4) + R(4.4, 44, 2.6, 4, 0.6) + HID(HL(3.4, 0, 36)) }),
    I({ key: 'dr-barn', name: 'Sliding barn door', w: 40, h: 87, aff: 0, affMode: 'bottom', label: 'Barn Door',
        art: () => R(0, 0, 40, 1.6, 0.6, true) + C(8, 3.4, 1.6, true) + C(32, 3.4, 1.6, true) + VL(8, 3.4, 6) + VL(32, 3.4, 6)
            + R(1, 6, 38, 80, 0.4, true) + R(3.6, 8.6, 32.8, 74.8, 0) + L(3.6, 83.4, 36.4, 8.6) + pullV(6.2, 46, 12) + HL(86.6, 14, 26) }),
    I({ key: 'dr-glass', name: 'Glass door', w: 36, h: 84, aff: 0, affMode: 'bottom', label: 'Glass Door',
        art: () => door(36, 84, 0) + R(5, 5, 26, 72, 0) + pullV(8, 46, 22),
        hatch: R(5, 5, 26, 72) }),
    I({ key: 'door-slide', name: 'Sliding patio door', w: 60, h: 80, aff: 0, affMode: 'bottom', label: 'Sliding Door',
        art: () => R(0, 0, 60, 80, 0.3, true) + R(2, 2, 28, 76, 0) + R(30, 2, 28, 76, 0) + R(4, 4, 24, 72, 0) + R(32, 4, 24, 72, 0) + pullV(26.4, 42, 8) + pullV(33.6, 42, 8) }),
    I({ key: 'elevator', name: 'Elevator', w: 42, h: 84, aff: 0, affMode: 'bottom', label: 'Elevator',
        art: () => R(0, 0, 42, 84, 0.3, true) + R(2, 2, 38, 82, 0.2) + VL(21, 2, 84) }),
    I({ key: 'niche', name: 'Niche', w: 36, h: 48, aff: 30, affMode: 'bottom', label: 'Niche',
        art: () => R(0, 0, 36, 48, 0.3) + R(2, 2, 32, 44, 0.2) + HL(46, 0, 36) }),
]);

cat('Chairs', [
    I({ key: 'task-chair', name: 'Task chair', w: 26, h: 40, aff: 0, affMode: 'bottom', label: 'Chair',
        art: () => taskChair(13, 40, 1) }),
    I({ key: 'chair', name: 'Side chair', w: 22, h: 34, aff: 0, affMode: 'bottom', label: 'Side Chair',
        art: () => L(3, 20, 2, 34) + L(19, 20, 20, 34) + R(1, 17, 20, 3.6, 1.6, true) + P('M3.4 17 V4 Q3.4 0.6 7 0.6 H15 Q18.6 0.6 18.6 4 V17 Z', true),
        side: { w: 24, h: 34, art: () => L(3, 20, 1.6, 34) + L(20, 20, 21.4, 34) + R(1, 17, 21, 3.6, 1.6, true) + P('M19 17 L21 1.6 Q21.2 0.4 22.4 0.6 Q23.4 1 23.2 2.2 L21.8 17 Z', true) } }),
    I({ key: 'ch-dining', name: 'Dining chair', w: 20, h: 34, aff: 0, affMode: 'bottom', label: 'Chair',
        art: () => L(3, 20, 2.4, 34) + L(17, 20, 17.6, 34) + R(0.6, 17.4, 18.8, 3.2, 1.4, true) + P('M2.6 17.4 C2.6 10 2.8 3.4 5 1.6 Q6.4 0.6 10 0.6 Q13.6 0.6 15 1.6 C17.2 3.4 17.4 10 17.4 17.4 Z', true),
        side: { w: 22, h: 34, art: () => L(3, 20, 1.8, 34) + L(19, 20, 20.2, 34) + R(0.6, 17.4, 20.8, 3.2, 1.4, true) + P('M17.6 17.4 C18.4 11 19.4 5 20.4 1.6 Q20.8 0.4 21.6 0.8 Q22.2 1.2 22 2.4 L20.8 17.4 Z', true) } }),
    I({ key: 'lounge', name: 'Lounge chair', w: 32, h: 30, aff: 0, affMode: 'bottom', label: 'Lounge Chair',
        // An open frame armchair: double-line side frames with arm pads, a back cushion,
        // a seat cushion on a rail (the reference's chair).
        art: () => P('M3 17.5 V1.2 Q3 0 4.4 0 Q16 -0.5 27.6 0 Q29 0 29 1.2 V17.5 Z', true) + P('M2.4 22.4 V18.4 Q2.4 17 3.8 17 Q16 16.6 28.2 17 Q29.6 17 29.6 18.4 V22.4 Z', true) + R(2.4, 22.4, 27.2, 1.6, 0, true) + HL(25.6, 2.4, 29.6)
            + R(0, 12, 2.4, 18, 0, true) + open('M0.8 30 V13.4 H1.6 V30') + R(-0.4, 11.2, 3.2, 1.6, 0.2, true)
            + R(29.6, 12, 2.4, 18, 0, true) + open('M30.4 30 V13.4 H31.2 V30') + R(29.2, 11.2, 3.2, 1.6, 0.2, true),
        side: { w: 34, h: 30, art: () => R(25, 0, 7, 22, 1.6, true) + R(2, 17, 26, 5.4, 1, true) + R(0, 11.2, 34, 1.6, 0.2, true) + R(1, 12.8, 2.4, 17.2, 0, true) + R(30.6, 12.8, 2.4, 17.2, 0, true) + HL(25.6, 3.4, 30.6) } }),
    I({ key: 'armchair', name: 'Club chair', w: 34, h: 32, aff: 0, affMode: 'bottom', label: 'Chair',
        art: () => foot(4, 32, 1.6, 3) + foot(28.4, 32, 1.6, 3) + P('M6 17 V3 Q6 0 9 0 H25 Q28 0 28 3 V17 Z', true)
            + R(0, 11, 7, 18, 3.4, true) + R(27, 11, 7, 18, 3.4, true) + R(6, 17, 22, 12, 1.6, true) + HL(22.4, 6, 28) }),
    I({ key: 'desk-chair', name: 'Desk chair', w: 20, h: 33, aff: 0, affMode: 'bottom', label: 'Chair',
        art: () => L(2.6, 19, 2, 33) + L(17.4, 19, 18, 33) + HL(27, 2.4, 17.6) + R(0.6, 15.5, 18.8, 3.5, 1.4, true) + P('M3 15.5 V3 Q3 0 6 0 H14 Q17 0 17 3 V15.5 Z', true) + R(5, 2, 10, 11, 1.4) }),
    I({ key: 'ch-bar', name: 'Bar stool', w: 18, h: 43, aff: 0, affMode: 'bottom', label: 'Stool',
        art: () => L(3, 17, 2, 43) + L(15, 17, 16, 43) + HL(31, 2.4, 15.6) + R(0, 13, 18, 4, 1.6, true) + P('M2 13 V3 Q2 0 5 0 H13 Q16 0 16 3 V13 Z', true) + R(4, 2.4, 10, 8, 1.2),
        side: { w: 18, h: 43, art: () => L(3, 17, 2, 43) + L(15, 17, 16, 43) + HL(31, 2.4, 15.6) + R(0, 13, 18, 4, 1.6, true) + P('M14 13 L15 1.6 Q15.2 0.4 16.4 0.6 Q17.4 1 17.2 2.2 L16.6 13 Z', true) } }),
    I({ key: 'ch-banquette', name: 'Banquette', w: 72, h: 36, aff: 0, affMode: 'bottom', label: 'Banquette',
        art: () => {
            let s = R(0, 0, 72, 18.6, 1.6, true);
            for (let i = 1; i < 6; i++) s += VL(i * 12, 1.6, 18.6);
            s += R(0, 18, 72, 4.6, 1.6, true) + box(0.6, 22.6, 70.8, 13.4, 0.3, true) + HL(32, 0.6, 71.4);
            return s;
        },
        side: { w: 24, h: 36, art: () => P('M0 36 V2 Q0 0 2 0 H4 Q6 0 6 2 V18 H22 Q24 18 24 20 V22.6 H0 Z', true) + box(0.6, 22.6, 22.8, 13.4, 0.3, true) } }),
]);

cat('Decor', [
    I({ key: 'sconce', name: 'Wall sconce', w: 5, h: 10, aff: 60, affMode: 'center', label: '',
        art: () => R(1.7, 0, 1.6, 3, 0.4, true) + P('M1.55 3 H3.45 L4.6 10 H0.4 Z', true),
        side: { w: 7, h: 10, art: () => R(0, 0, 1.2, 10, 0.3, true) + HL(4, 1.2, 2.8) + P('M2.4 3 H4.2 L7 10 H1.2 Z', true) } }),
    I({ key: 'lamp-table', name: 'Table lamp', w: 14, h: 26, aff: 25, affMode: 'bottom', label: '', art: () => lamp(7, 26, 1) }),
    I({ key: 'lamp-floor', name: 'Floor lamp', w: 16, h: 60, aff: 0, affMode: 'bottom', label: '',
        art: () => R(3.5, 58.4, 9, 1.6, 0.6, true) + VL(8, 12, 58.4) + P('M3 0 H13 L16 12 H0 Z', true) }),
    I({ key: 'pendant', name: 'Pendant', w: 14, h: 30, aff: 66, affMode: 'bottom', label: '',
        art: () => VL(7, 0, 17) + R(6.2, 16.6, 1.6, 1.6, 0.3, true) + P('M0 30 C0 22.6 3 18 7 18 C11 18 14 22.6 14 30 Z', true) }),
    I({ key: 'picture-light', name: 'Picture light', w: 24, h: 7.4, aff: 82, affMode: 'bottom', label: '',
        art: () => R(10, 0, 4, 2.4, 0.5, true) + VL(12, 2.4, 4.6) + R(0, 4.6, 24, 2.8, 1.4, true) }),
    I({ key: 'mirror', name: 'Mirror', w: 36, h: 48, aff: 36, affMode: 'bottom', label: 'Mirror',
        art: () => R(0, 0, 36, 48, 0.6, true) + R(1.6, 1.6, 32.8, 44.8, 0.2) + L(5, 42, 14, 14) + L(10, 42, 19, 14), hatch: R(1.6, 1.6, 32.8, 44.8) }),
    I({ key: 'mirror-rd', name: 'Round mirror', w: 36, h: 36, aff: null, affMode: 'center', shape: 'ellipse', label: 'Mirror',
        art: () => C(18, 18, 17.6, true) + C(18, 18, 16) + L(9, 26, 17, 9) + L(14, 28, 22, 11) }),
    I({ key: 'clock', name: 'Wall clock', w: 12, h: 12, aff: 84, affMode: 'center', shape: 'ellipse', label: '',
        art: () => C(6, 6, 5.8, true) + C(6, 6, 5) + open('M6 6 V2.6 M6 6 L8.4 7.4') }),
    I({ key: 'planter', name: 'Planter', w: 24, h: 54, aff: 0, affMode: 'bottom', label: 'Plant',
        art: () => plant(12, 54, 54) }),
    I({ key: 'thermostat', name: 'Thermostat', w: 5, h: 5, aff: 54, affMode: 'center', label: '',
        art: () => R(0, 0, 5, 5, 0.8, true) + R(1.1, 1.1, 2.8, 1.5, 0.2) + HL(3.7, 1.6, 2.2) + HL(3.7, 2.8, 3.4) }),
    I({ key: 'outlet', name: 'Outlet', w: 3, h: 5, aff: 15, affMode: 'center', label: '',
        art: () => R(0, 0, 3, 5, 0.4, true) + R(0.9, 0.9, 1.2, 1.2, 0.4) + R(0.9, 2.9, 1.2, 1.2, 0.4) }),
]);

const KC = (o) => Object.assign({ avoid: true }, o);
cat('Keep clear', [
    KC({ key: 'kc-switch', name: 'Light switch', w: 3, h: 5, aff: 48, affMode: 'center', label: 'Switch',
        art: () => R(0, 0, 3, 5, 0.4, true) + R(1.05, 1.4, 0.9, 2.2, 0.2) }),
    KC({ key: 'kc-thermostat', name: 'Thermostat', w: 5, h: 5, aff: 48, affMode: 'center', label: 'Thermostat',
        art: () => R(0, 0, 5, 5, 0.8, true) + R(1.1, 1.1, 2.8, 1.5, 0.2) + HL(3.7, 1.6, 2.2) + HL(3.7, 2.8, 3.4) }),
    KC({ key: 'kc-outlet', name: 'Outlet', w: 3, h: 5, aff: 18, affMode: 'center', label: 'Outlet',
        art: () => R(0, 0, 3, 5, 0.4, true) + R(0.9, 0.9, 1.2, 1.2, 0.4) + R(0.9, 2.9, 1.2, 1.2, 0.4) }),
    KC({ key: 'kc-alarm', name: 'Fire alarm strobe', w: 6, h: 6, aff: 80, affMode: 'bottom', label: 'Strobe',
        art: () => R(0, 0, 6, 6, 0.6, true) + R(1.5, 3.4, 3, 1.7, 0.4) + HL(1.3, 1.5, 4.5) + HL(2.2, 1.5, 4.5) }),
    KC({ key: 'kc-reader', name: 'Card reader', w: 4, h: 6, aff: 42, affMode: 'center', label: 'Reader',
        art: () => R(0, 0, 4, 6, 0.5, true) + R(1, 2.4, 2, 2.6, 0.3) + C(2, 1.2, 0.35) }),
    KC({ key: 'kc-sign', name: 'Room sign', w: 8, h: 8, aff: 60, affMode: 'center', label: 'Sign',
        art: () => R(0, 0, 8, 8, 0.4, true) + HL(3, 2, 6) + HL(4.6, 2.6, 5.4) + C(3, 6.2, 0.2) + C(4, 6.2, 0.2) + C(5, 6.2, 0.2) }),
    KC({ key: 'kc-zone', name: 'Keep-clear zone', w: 24, h: 24, aff: null, affMode: 'center', freeform: true, label: 'Keep clear' }),
    KC({ key: 'kc-pull', name: 'Fire alarm pull', w: 4, h: 5.5, aff: 48, affMode: 'center', label: 'Pull',
        art: () => R(0, 0, 4, 5.5, 0.4, true) + R(1, 2.6, 2, 1.1, 0.3) + HL(1.1, 1.2, 2.8) }),
    KC({ key: 'kc-extinguisher', name: 'Extinguisher cabinet', w: 12, h: 27, aff: 21, affMode: 'bottom', label: 'FEC',
        art: () => R(0, 0, 12, 27, 0.4, true) + R(1, 1, 10, 25, 0)
            + P('M3.6 23 V9 Q3.6 6 6 6 Q8.4 6 8.4 9 V23 Q8.4 24 7.4 24 H4.6 Q3.6 24 3.6 23 Z') + open('M5.4 6 V4.6 H6.6 V6 M4.8 4.6 H8.2') + open('M8.4 9 C10.2 10.6 10.2 18 8.4 20') }),
    KC({ key: 'kc-exit', name: 'Exit sign', w: 13, h: 8.5, aff: 86, affMode: 'bottom', label: '',
        art: () => R(0, 0, 13, 8.5, 0.5, true) + open('M4.6 2.6 V5.9 M4.6 2.6 H6 M4.6 4.25 H5.7 M4.6 5.9 H6') + open('M6.6 2.6 L8.2 5.9 M8.2 2.6 L6.6 5.9 M8.9 2.6 V5.9 M9.6 2.6 H11.2 M10.4 2.6 V5.9') + open('M3.4 3 L2 4.25 L3.4 5.5') }),
    KC({ key: 'kc-grille', name: 'Return grille', w: 24, h: 12, aff: 84, affMode: 'bottom', label: '',
        art: () => { let s = R(0, 0, 24, 12, 0.3, true) + R(1.2, 1.2, 21.6, 9.6, 0); for (let y = 2.4; y < 10.6; y += 1.2) s += HL(y, 1.2, 22.8); return s; } }),
    KC({ key: 'kc-access', name: 'Access panel', w: 12, h: 12, aff: null, affMode: 'center', label: '',
        art: () => R(0, 0, 12, 12, 0.2, true) + R(0.8, 0.8, 10.4, 10.4, 0) + C(9.6, 6, 0.45) }),
]);

cat('Basic', [
    I({ key: 'rect', name: 'Box', w: 36, h: 36, aff: null, affMode: 'center', freeform: true, label: '' }),
    I({ key: 'circle', name: 'Circle', w: 24, h: 24, aff: null, affMode: 'center', freeform: true, shape: 'ellipse', label: '' }),
    I({ key: 'shelf', name: 'Shelf', w: 48, h: 1.5, aff: 48, affMode: 'bottom', shape: 'shelf', label: 'Shelf' }),
    I({ key: 'shelf-long', name: 'Long shelf', w: 96, h: 1.5, aff: 48, affMode: 'bottom', shape: 'shelf', label: 'Shelf' }),
    I({ key: 'wainscot', name: 'Wainscot', w: 120, h: 36, aff: 0, affMode: 'bottom', label: 'Wainscot' }),
    I({ key: 'handrail', name: 'Handrail', w: 120, h: 2, aff: 34, affMode: 'bottom', shape: 'shelf', label: 'Handrail' }),
    I({ key: 'wood', name: 'Wood panel', w: 48, h: 96, aff: 0, affMode: 'bottom', fill: 'wood', label: '' }),
    I({ key: 'glass', name: 'Glass panel', w: 48, h: 96, aff: 0, affMode: 'bottom', fill: 'glass', label: '' }),
]);

// ── emit ───────────────────────────────────────────────────────────────────
// ── THE HOSPITALITY SET (20.24) ──────────────────────────────────────────────
// The designer's own drawings (tools/ctx-hospitality/*.svg, millimetres, floor at the
// bottom edge, fill="#fff" = solid, fill="none" = glass) replace ours wherever the
// catalogue has the item. Two ways in:
//   REPLACE an existing key: the drawing is scaled UNIFORMLY into the key's own size and
//     sat on its floor, centred. Only where the proportions agree within a few percent,
//     because saved walls hold that key's box and must not change shape.
//   NEW key `hc-<id>` at the catalogue's true size, and the old item it supersedes is
//     kept (saved walls still draw it) but `hidden` from the palette and the sheet.
// Coordinates are rewritten numerically, never by a transform, so the one stroke weight
// the app sets is not scaled with the drawing.
const HC_DIR = path.join(__dirname, 'ctx-hospitality');
const HC_CAT = { GR: 'Guestroom', BA: 'Bathroom', OF: 'Office', GL: 'Glass', DR: 'Doors', CH: 'Chairs', FX: 'Toilets' };
// id: [replace key] or [null, name, label, aff, hides]
const HC_MAP = {
    'GR-001': ['gr-king-set'],
    'GR-002': [null, 'Queen bed', 'Queen Bed', 0, ['bed-queen']],
    'GR-003': [null, 'Twin bed', 'Twin Bed', 0, ['bed-twin']],
    'GR-004': [null, 'Double queen beds', 'Queen Beds', 0, ['gr-queen-pair']],
    'GR-005': [null, 'Headboard', 'Headboard', 0, ['headboard']],
    'GR-006': ['nightstand'],
    'GR-007': [null, 'Desk + chair', 'Desk', 0, ['gr-desk']],
    'GR-008': ['gr-media'],
    'GR-009': ['gr-wardrobe-wall'],
    'GR-010': [null, 'Luggage bench', 'Luggage Bench', 0, ['luggage']],
    'GR-011': [null, 'Lounge chair', 'Lounge Chair', 0, []],
    'GR-012': [null, 'Sofa / sleeper sofa', 'Sofa', 0, ['sofa']],
    'BA-001': ['ba-vanity-mirror'],
    'BA-002': [null, 'Single basin vanity', 'Vanity', 0, ['ba-vanity-single']],
    'BA-003': [null, 'Double basin vanity', 'Vanity', 0, ['ba-vanity-double']],
    'BA-004': ['ba-shower-glass'],
    'BA-005': [null, 'Shower niche + fixtures', 'Shower', 34, ['ba-shower-niche']],
    'BA-006': ['ba-tub-free'],
    'BA-007': ['tub'],
    'BA-008': [null, 'Towel bar + hooks', '', 48, ['ba-towel-hooks']],
    'BA-009': [null, 'Bathroom accessories', '', 48, ['ba-accessories']],
    'OF-001': ['of-workstation'],
    'OF-002': ['of-desk-storage'],
    'OF-003': ['credenza'],
    'OF-004': [null, 'Meeting table + chairs', 'Meeting Table', 0, ['of-meeting']],
    'OF-005': ['whiteboard'],
    'OF-006': [null, 'File cabinet', 'File', 0, ['of-file-3']],
    'OF-007': ['bookcase'],
    'OF-008': [null, 'Reception desk', 'Reception Desk', 0, ['reception']],
    'GL-001': ['gl-fixed'], 'GL-002': ['gl-door'], 'GL-003': ['gl-double'],
    'GL-004': ['gl-frameless'], 'GL-005': ['gl-framed'], 'GL-006': ['gl-slide'],
    'DR-001': [null, 'Single hinged door', 'Door', 0, ['door-guest']],
    'DR-002': ['dr-double'],
    'DR-003': [null, 'Pocket door', 'Pocket Door', 0, ['dr-pocket']],
    'DR-004': [null, 'Sliding barn door', 'Barn Door', 0, ['dr-barn']],
    'DR-005': [null, 'Glass door', 'Glass Door', 0, ['dr-glass']],
    'DR-006': [null, 'Accessible door', 'Door', 0, ['dr-accessible']],
    'CH-001': ['task-chair'],
    'CH-002': [null, 'Dining chair', 'Chair', 0, ['ch-dining']],
    'CH-003': [null, 'Lounge chair', 'Lounge Chair', 0, ['lounge']],
    'CH-004': [null, 'Bar stool', 'Stool', 0, ['ch-bar']],
    'CH-005': [null, 'Armchair', 'Chair', 0, ['armchair']],
    'CH-006': ['ch-banquette'],
    'FX-001': [null, 'Floor-mounted toilet', 'Toilet', 0, ['toilet-tank']],
    'FX-002': [null, 'Wall-hung toilet', 'Toilet', 3, ['toilet-wall']],
    'FX-003': [null, 'Urinal', 'Urinal', 13, ['urinal']],
    'FX-004': [null, 'Accessible toilet + grab bars', 'Toilet', 0, ['fx-ada-toilet']],
    'FX-005': [null, 'Lavatory basin', 'Basin', 26, ['fx-lav-basin']],
};
const HC_TOL = 0.08;   // a replaced key's drawing may sit in a box this much off its proportions
function hcRead() {
    const out = {};
    fs.readdirSync(HC_DIR).filter(f => /\.svg$/.test(f)).sort().forEach(f => {
        const m = /^([A-Z]{2}-\d{3})_.*_(front|side)\.svg$/.exec(f);
        if (!m) return;
        const t = fs.readFileSync(path.join(HC_DIR, f), 'utf8');
        const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(t);
        const body = t.slice(t.indexOf('>', t.indexOf('<g ')) + 1, t.lastIndexOf('</g>'));
        (out[m[1]] = out[m[1]] || {})[m[2]] = { w: +vb[1], h: +vb[2], body: body, file: f };
    });
    return out;
}
// Rewrite one drawing into a box W x H (inches): uniform scale, centred, on the floor.
function hcFit(d, W, H) {
    const k = Math.min(W / d.w, H / d.h), dx = (W - d.w * k) / 2, dy = H - d.h * k;
    const X = (v) => n(+v * k + dx), Y = (v) => n(+v * k + dy), S = (v) => n(+v * k);
    const ATTR = { x: X, cx: X, x1: X, x2: X, y: Y, cy: Y, y1: Y, y2: Y, width: S, height: S, rx: S, ry: S, r: S };
    let hatch = '';
    const svg = d.body.replace(/<(rect|path|polygon|circle|line|ellipse|polyline)\b([^>]*?)\/?>/g, (all, tag, attrs) => {
        let a = attrs.replace(/ stroke[\w-]*="[^"]*"/g, '');
        a = a.replace(/ (x|y|cx|cy|x1|y1|x2|y2|width|height|rx|ry|r)="([-\d.]+)"/g, (m, nm, v) => ' ' + nm + '="' + ATTR[nm](v) + '"');
        a = a.replace(/ d="([^"]*)"/, (m, p) => {
            if (/[a-z]|[HVSTA]/.test(p.replace(/e-?\d/g, ''))) throw new Error(d.file + ': path uses a command the converter does not scale');
            let i = 0;
            return ' d="' + p.replace(/-?\d*\.?\d+/g, v => (i++ % 2 ? Y(v) : X(v))) + '"';
        });
        a = a.replace(/ points="([^"]*)"/, (m, p) => { let i = 0; return ' points="' + p.replace(/-?\d*\.?\d+/g, v => (i++ % 2 ? Y(v) : X(v))) + '"'; });
        a = a.replace(/ fill="#fff(fff)?"/i, ' data-o="1"');
        if (/ fill="(?!none)/.test(a)) throw new Error(d.file + ': unexpected fill ' + a);
        const el = '<' + tag + a + '/>';
        if (tag === 'rect' && / fill="none"/.test(a)) hatch += el.replace(/ fill="none"/, '');
        return el;
    }).replace(/\s*\n\s*/g, '');
    return { svg: '<g stroke-linecap="round" stroke-linejoin="round">' + svg + '</g>', hatch: hatch };
}
const hcIn = (mm) => Math.round(mm / 25.4 * 10) / 10;
(function hcOverlay() {
    const src = hcRead();
    const byKey = {};
    CATS.forEach(c => c.items.forEach(it => { byKey[it.key] = it; }));
    const lead = {};   // group -> catalogue items, in catalogue order, ahead of the rest
    Object.keys(HC_MAP).forEach(id => {
        const s = src[id];
        if (!s || !s.front) throw new Error('no drawing for ' + id);
        const [rk, name, label, aff, hides] = HC_MAP[id];
        const group = HC_CAT[id.slice(0, 2)];
        let it;
        if (rk) {
            it = byKey[rk];
            if (!it) throw new Error(id + ': no key ' + rk);
            const off = Math.abs((it.w / it.h) / (s.front.w / s.front.h) - 1);
            if (off > HC_TOL) throw new Error(id + ' does not fit ' + rk + ' (' + Math.round(off * 100) + '% off): give it a new key');
            const f = hcFit(s.front, it.w, it.h);
            it.art = () => f.svg;
            if (it.hatch || group === 'Glass') { if (f.hatch) it.hatch = f.hatch; else delete it.hatch; } else delete it.hatch;
            if (s.side) {
                const sw = it.side ? it.side.w : hcIn(s.side.w), sh = it.side ? it.side.h : hcIn(s.side.h);
                const fs2 = hcFit(s.side, sw, sh);
                it.side = { w: sw, h: sh, art: () => fs2.svg };
            }
            CATS.forEach(c => { const i = c.items.indexOf(it); if (i >= 0) c.items.splice(i, 1); });
        } else {
            const W = hcIn(s.front.w), H = hcIn(s.front.h);
            const f = hcFit(s.front, W, H);
            it = { key: 'hc-' + id.toLowerCase(), name: name, w: W, h: H, aff: aff, affMode: 'bottom', label: label, art: () => f.svg };
            if (f.hatch && (group === 'Glass' || /glass/i.test(name))) it.hatch = f.hatch;
            if (s.side) {
                const sw = hcIn(s.side.w), sh = hcIn(s.side.h), fs2 = hcFit(s.side, sw, sh);
                it.side = { w: sw, h: sh, art: () => fs2.svg };
            }
            hides.forEach(k => { if (!byKey[k]) throw new Error(id + ' hides unknown ' + k); byKey[k].hidden = true; });
        }
        it.ref = id;
        (lead[group] = lead[group] || []).push(it);
    });
    CATS.forEach(c => {
        // Hidden items go to the END of their group (still found by key, never shown).
        const shown = c.items.filter(it => !it.hidden), gone = c.items.filter(it => it.hidden);
        c.items = (lead[c.cat] || []).concat(shown, gone);
    });
})();

const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
// Art -> the app's source form: object-line group, with HID() spans as hidden groups.
function src(svg) {
    if (svg.indexOf("'") >= 0 || svg.indexOf('\\') >= 0) throw new Error('art carries a quote or backslash: ' + svg.slice(0, 80));
    const parts = [];
    let rest = svg;
    while (rest.length) {
        const a = rest.indexOf('\u0001');
        if (a < 0) { parts.push(['_O', rest]); break; }
        if (a > 0) parts.push(['_O', rest.slice(0, a)]);
        const b = rest.indexOf('\u0002', a);
        parts.push(['_H', rest.slice(a + 1, b)]);
        rest = rest.slice(b + 1);
    }
    return parts.filter(p => p[1]).map(p => p[0] + ' + ' + q(p[1]) + ' + _G').join('\n              + ');
}
function itemSrc(it) {
    const f = [];
    f.push('key: ' + q(it.key), 'name: ' + q(it.name), 'w: ' + it.w, 'h: ' + it.h);
    if (it.lengthIn) f.push('lengthIn: ' + it.lengthIn);
    f.push('aff: ' + (it.aff === null || it.aff === undefined ? 'null' : it.aff), 'affMode: ' + q(it.affMode || 'bottom'));
    if (it.freeform) f.push('freeform: true');
    if (it.avoid) f.push('avoid: true');
    if (it.hidden) f.push('hidden: true');
    if (it.ref) f.push('ref: ' + q(it.ref));
    f.push('shape: ' + q(it.shape || 'rect'), 'fill: ' + q(it.fill || 'plain'), 'label: ' + q(it.label || ''));
    let s = '        { ' + f.join(', ');
    if (it.variants) s += ',\n          variants: BED_STYLE_VARIANTS';
    if (it.art) s += ',\n          svg: ' + src(it.art(it.w, it.h));
    if (it.hatch) s += ',\n          hatch: ' + q(it.hatch);
    if (it.side) {
        s += ',\n          side: { w: ' + it.side.w + ', h: ' + it.side.h + ',\n            svg: ' + src(it.side.art(it.side.w, it.side.h));
        if (it.side.hatch) s += ',\n            hatch: ' + q(it.side.hatch);
        s += ' }';
    }
    return s + ' },';
}
const BEGIN = '// <ctx-library generated by tools/ctx-art.js: edit THERE, then node tools/ctx-art.js --write>';
const END = '// </ctx-library>';
function build() {
    const keys = new Set();
    CATS.forEach(c => c.items.forEach(it => { if (keys.has(it.key)) throw new Error('duplicate key ' + it.key); keys.add(it.key); }));
    let out = BEGIN + '\n';
    out += '// Bed styles: keys and 100-wide aspects are FIXED (a saved bed sizes by them).\n';
    out += 'const BED_STYLE_VARIANTS = [\n' + BED_STYLES.map(st => `    { key: ${q(st.key)}, name: ${q(st.name)}, w: 100, h: ${st.h},\n      svg: ${src(bedStyleSvg(st))} },`).join('\n') + '\n];\n';
    out += 'const CONTEXT_LIBRARY = [\n';
    CATS.forEach(c => {
        out += '    { cat: ' + q(c.cat) + ', items: [\n' + c.items.map(itemSrc).join('\n') + '\n    ] },\n';
    });
    out += '];\n' + END;
    return out;
}
function write(appPath) {
    let s = fs.readFileSync(appPath, 'utf8');
    let a = s.indexOf(BEGIN), b;
    if (a >= 0) {
        b = s.indexOf(END, a);
        if (b < 0) throw new Error('library start marker without an end marker');
        b += END.length;
    } else {
        // First run: the hand-written block from the bed styles to the end of the library.
        a = s.indexOf('// ── BED STYLE VARIANTS');
        const lib = s.indexOf('const CONTEXT_LIBRARY = [', a);
        b = s.indexOf('\n];', lib);
        if (a < 0 || lib < 0 || b < 0) throw new Error('cannot find the hand-written library');
        b += 3;
        const old = s.slice(a, b);
        if (/\nfunction |\nasync function /.test(old)) throw new Error('the old library block holds a function: refusing');
        if (old.indexOf('const CONTEXT_PRESETS') >= 0) throw new Error('the old library block runs past the library');
    }
    s = s.slice(0, a) + build() + s.slice(b);
    fs.writeFileSync(appPath, s);
}
function sheet(file) {
    // Rendered with the app's own conventions: one weight, opaque = white fill.
    const LW = 0.8;
    const draw = (w, h, svg, sc) => `<svg width="${n(w * sc)}" height="${n(h * sc)}" viewBox="0 0 ${w} ${h}" style="overflow:visible"><g fill="none" stroke="#111" stroke-width="${LW / sc}">`
        + svg.replace(/[\u0001\u0002]/g, '').replace(/ data-o="1"/g, ' fill="#fff"') + '</g></svg>';
    let h = '<!doctype html><html><head><meta charset="utf-8"><style>body{font:11px Helvetica,Arial,sans-serif;margin:16px;background:#fff;color:#333}h3{margin:18px 0 6px;font-size:13px}.row{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-end}.c{text-align:center}</style></head><body>';
    const SC = 3.2;
    h += '<h3>Bed styles (on a queen)</h3><div class="row">' + BED_STYLES.map(st => `<div class="c">${draw(100, st.h, bedStyleSvg(st), SC * 0.6)}<br>${st.name}</div>`).join('') + '</div>';
    CATS.forEach(c => {
        h += '<h3>' + c.cat + '</h3><div class="row">';
        c.items.forEach(it => {
            if (!it.art || it.hidden) return;
            h += `<div class="c">${draw(it.w, it.h, it.art(it.w, it.h), SC)}<br>${it.name}</div>`;
            if (it.side) h += `<div class="c">${draw(it.side.w, it.side.h, it.side.art(it.side.w, it.side.h), SC)}<br>${it.name} (side)</div>`;
        });
        h += '</div>';
    });
    fs.writeFileSync(file, h + '</body></html>');
}
module.exports = { CATS, BED_STYLES, build, bedStyleSvg };
if (require.main === module) {
    const arg = process.argv.slice(2);
    if (arg[0] === '--write') { write(path.join(__dirname, '..', 'app.js')); console.log('library written'); }
    else if (arg[0] === '--sheet') { sheet(arg[1] || 'ctx-sheet.html'); console.log('sheet written'); }
    else { console.log(build().length + ' chars; use --write or --sheet <file>'); }
}
