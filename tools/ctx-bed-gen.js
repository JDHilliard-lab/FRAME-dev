// tools/ctx-bed-gen.js (20.21): generates the bed context art (BED_STYLE_VARIANTS and the plain beds'
// front + side svg) from ONE pillow/duvet/base design. Run: node tools/ctx-bed-gen.js -> writes
// tools/ctx-beds.json (paste the strings into app.js). Coordinates are inches (plain beds) or 100-wide
// units (styles); data-o="1" = opaque, drawn back to front.
// Bed generator: one pillow / duvet / base design for every size and style.
// Painter's order: later shapes marked data-o="1" are opaque and hide what is behind.
const r = (v) => +v.toFixed(2);
const P = (d, opaque) => '<path' + (opaque ? ' data-o="1"' : '') + ' d="' + d + '"/>';
const rrect = (x0, y0, x1, y1, k) => `M${r(x0 + k)} ${r(y0)} H${r(x1 - k)} Q${r(x1)} ${r(y0)} ${r(x1)} ${r(y0 + k)} V${r(y1 - k)} Q${r(x1)} ${r(y1)} ${r(x1 - k)} ${r(y1)} H${r(x0 + k)} Q${r(x0)} ${r(y1)} ${r(x0)} ${r(y1 - k)} V${r(y0 + k)} Q${r(x0)} ${r(y0)} ${r(x0 + k)} ${r(y0)} Z`;
// A pillow: square-ish with the four corners pulled out into soft ears, edges eased in.
const pillow = (x0, y0, x1, y1, k) => {
    // Corners pulled out into ears, every edge eased in: the flat, puffy sham shape.
    const w = x1 - x0, h = y1 - y0, kt = Math.min(h * 0.16, w * 0.06) * k, ks = Math.min(w * 0.035, h * 0.12) * k;
    return `M${r(x0)} ${r(y0)} C${r(x0 + w * 0.3)} ${r(y0 + kt)} ${r(x1 - w * 0.3)} ${r(y0 + kt)} ${r(x1)} ${r(y0)}`
        + ` C${r(x1 - ks)} ${r(y0 + h * 0.3)} ${r(x1 - ks)} ${r(y1 - h * 0.3)} ${r(x1)} ${r(y1)}`
        + ` C${r(x1 - w * 0.3)} ${r(y1 - kt)} ${r(x0 + w * 0.3)} ${r(y1 - kt)} ${r(x0)} ${r(y1)}`
        + ` C${r(x0 + ks)} ${r(y1 - h * 0.3)} ${r(x0 + ks)} ${r(y0 + h * 0.3)} ${r(x0)} ${r(y0)} Z`;
};
// The bedding in front view, on a width W: shams, pillows, lumbar, duvet, base, feet.
// pT pillow top, dT duvet top, dB duvet side hem, hc duvet centre hem, bT base top.
function bedding(W, H, o) {
    const f = (u) => u * W / 100;            // layout is authored on 100 wide
    const { pT, dT, dB, hc, bT } = o;
    const footH = o.footH == null ? 1.8 : o.footH;
    let s = '';
    if (o.plinth) {
        s += P(rrect(f(0), bT, f(100), bT + o.plinth[0], 0.6), true);
        s += P(rrect(f(6), bT + o.plinth[0], f(94), H, 0.4), true);
    } else {
        s += P(rrect(f(5), H - footH - 0.3, f(9), H, 0.5), true) + P(rrect(f(91), H - footH - 0.3, f(95), H, 0.5), true);
        s += P(rrect(f(1.5), bT, f(98.5), H - footH, 2.4), true);
    }
    // Pillow bottoms stay BEHIND the duvet: never below its lifted centre hem.
    const shamB = Math.min(dT + 5, hc - 1.5), k = 1;
    [[7, 48.5], [51.5, 93]].forEach(([a, b]) => {
        s += P(pillow(f(a), pT, f(b), shamB, k), true);
        const fi = Math.min(2.6, (dT - pT) * 0.17);
        s += P(pillow(f(a) + fi * 1.2, pT + fi, f(b) - fi * 1.2, shamB, 0.8));   // flange seam
    });
    const sT = pT + (dT - pT) * 0.42;
    [[11, 48], [52, 89]].forEach(([a, b]) => { s += P(pillow(f(a), sT, f(b), Math.min(shamB + 2, hc - 1.5), k * 1.1), true); });
    const lT = pT + (dT - pT) * 0.68;
    s += P(pillow(f(36), lT, f(64), Math.min(shamB + 2, hc - 1.5), k * 0.9), true);
    // Duvet: a soft top edge, drapes down both sides, a hem that lifts in the middle.
    const d = `M${r(f(0.6))} ${r(dT + 3.2)} C${r(f(0.6))} ${r(dT + 0.8)} ${r(f(2.8))} ${r(dT)} ${r(f(7))} ${r(dT)}`
        + ` H${r(f(93))} C${r(f(97.2))} ${r(dT)} ${r(f(99.4))} ${r(dT + 0.8)} ${r(f(99.4))} ${r(dT + 3.2)}`
        + ` L${r(f(99.8))} ${r(dB - 1)} C${r(f(99.9))} ${r(dB + 0.6)} ${r(f(98.6))} ${r(dB + 0.9)} ${r(f(96.6))} ${r(dB + 0.2)}`
        + ` C${r(f(88))} ${r(hc + 0.6)} ${r(f(72))} ${r(hc)} ${r(f(50))} ${r(hc)}`
        + ` C${r(f(28))} ${r(hc)} ${r(f(12))} ${r(hc + 0.6)} ${r(f(3.4))} ${r(dB + 0.2)}`
        + ` C${r(f(1.4))} ${r(dB + 0.9)} ${r(f(0.1))} ${r(dB + 0.6)} ${r(f(0.2))} ${r(dB - 1)} Z`;
    s += P(d, true);
    // The top plane's front edge, and the two corner folds.
    s += P(`M${r(f(3.2))} ${r(dT + 2.6)} C${r(f(30))} ${r(dT + 1.6)} ${r(f(70))} ${r(dT + 1.6)} ${r(f(96.8))} ${r(dT + 2.6)}`);
    s += P(`M${r(f(5.2))} ${r(dT + 3.2)} C${r(f(3.6))} ${r(dT + 6)} ${r(f(3.6))} ${r(dB - 4)} ${r(f(4.6))} ${r(dB - 0.6)}`);
    s += P(`M${r(f(94.8))} ${r(dT + 3.2)} C${r(f(96.4))} ${r(dT + 6)} ${r(f(96.4))} ${r(dB - 4)} ${r(f(95.4))} ${r(dB - 0.6)}`);
    return s;
}
const G = (s) => '_O + \'' + s + '\' + _G';

// ── Five styles, 100 wide, heights unchanged ──
const STYLES = {
    b67: { name: 'Platform', h: 26.9, head: '', o: { pT: 0.8, dT: 10.6, dB: 20.8, hc: 17.6, bT: 17.6, plinth: [4.2] } },
    b71: { name: 'Panel', h: 48.9,
        head: P(rrect(2, 0, 49.7, 36, 2.6), true) + P(rrect(50.3, 0, 98, 36, 2.6), true),
        o: { pT: 9, dT: 24, dB: 43.4, hc: 37.6, bT: 34 } },
    b72: { name: 'Tall upholstered', h: 62,
        head: P('M3 40 V7 Q3 0 10 0 H90 Q97 0 97 7 V40 Z', true)
            + P('M15 3 V40 M27 3 V40 M39 3 V40 M50 3 V40 M61 3 V40 M73 3 V40 M85 3 V40'),
        o: { pT: 22, dT: 37, dB: 56.4, hc: 50.6, bT: 47 } },
    b74: { name: 'Wingback', h: 50.7,
        head: P('M2 36 V16 Q2 12 6 12 H12 V4 Q12 0 16 0 H84 Q88 0 88 4 V12 H94 Q98 12 98 16 V36 Z', true)
            + P('M12 12 V36 M88 12 V36')
            + ['22 7', '36 7', '50 7', '64 7', '78 7', '29 13', '43 13', '57 13', '71 13', '22 19', '36 19', '50 19', '64 19', '78 19']
                .map(c => { const [x, y] = c.split(' '); return `<circle cx="${x}" cy="${y}" r="0.55"/>`; }).join(''),
        o: { pT: 15, dT: 28.5, dB: 45.6, hc: 40, bT: 37 } },
    b75: { name: 'Low profile', h: 41.9,
        head: P(rrect(5, 0, 95, 28, 1.6), true) + P('M5 7 H95 M5 13.4 H95'),
        o: { pT: 10, dT: 23.5, dB: 36.6, hc: 32, bT: 29.4 } },
};
const variants = Object.keys(STYLES).map(k => {
    const st = STYLES[k];
    return { key: k, name: st.name, w: 100, h: st.h, svg: st.head + bedding(100, st.h, st.o) };
});
// ── Plain bed, front (no headboard: that is the Headboard millwork item) ──
const front = (W) => bedding(W, 24, { pT: 0.6, dT: 8.4, dB: 19, hc: 15.8, bT: 14 });
// ── Side: headboard left, pillows leaning on it, a throw over the foot ──
function side(W) {
    let s = '';
    s += P(rrect(8, 33.8, 11.5, 36, 0.5), true) + P(rrect(W - 11.5, 33.8, W - 8, 36, 0.5), true);
    s += P(`M4.6 34 V20 Q4.6 16.8 7.8 16.8 H${r(W - 3.2)} Q${r(W)} 16.8 ${r(W)} 20 V30.8 Q${r(W)} 34 ${r(W - 3.2)} 34 Z`, true);
    s += P(`M4.6 26.2 H${r(W - 0.2)}`);
    s += P('M0 36 V2.4 Q0 0 2.4 0 H3 Q5.4 0 5.4 2.4 V36 Z', true);
    // Pillows LEANING on the headboard, seen end-on: puffy rounded slabs, tipped back.
    const lean = (x0, y0, x1, y1, deg) => '<path data-o="1" transform="rotate(' + deg + ' ' + x1 + ' ' + y1 + ')" d="'
        + pillow(x0, y0, x1, y1, 1.6) + '"/>';
    s += lean(8.6, 2.2, 15.2, 16.8, -13);
    s += lean(13.6, 5.6, 20.2, 16.8, -17);
    const a = W * 0.56, b = W * 0.76;
    s += P(`M${r(a)} 16.4 C${r(a + 5)} 15.4 ${r(b - 5)} 15.4 ${r(b)} 16.4 C${r(b + 0.8)} 21 ${r(b + 1)} 26 ${r(b + 0.6)} 30.4`
        + ` C${r(b - 5)} 31.2 ${r(a + 5)} 31.2 ${r(a + 0.6)} 30.4 C${r(a + 0.2)} 26 ${r(a)} 21 ${r(a)} 16.4 Z`, true);
    s += P(`M${r(a + (b - a) * 0.36)} 16.2 C${r(a + (b - a) * 0.4)} 21 ${r(a + (b - a) * 0.42)} 26 ${r(a + (b - a) * 0.38)} 30.9`);
    s += P(`M${r(a + (b - a) * 0.7)} 16 C${r(a + (b - a) * 0.76)} 20 ${r(a + (b - a) * 0.78)} 25 ${r(a + (b - a) * 0.74)} 30.9`);
    let fr = '';
    for (let x = a + 1.2; x < b; x += 1.1) fr += `M${r(x)} 30.9 V32.2 `;
    s += P(fr.trim());
    return s;
}
module.exports = { variants, front, side, P, rrect };
if (require.main === module) {
    const out = { variants: variants.map(v => `    { key: '${v.key}', name: '${v.name}', w: 100, h: ${v.h},\n      svg: ${G(v.svg)} },`).join('\n') };
    [60, 76, 54].forEach(W => { out['front' + W] = G(front(W)); });
    [80, 75].forEach(W => { out['side' + W] = G(side(W)); });
    require('fs').writeFileSync(__dirname + '/ctx-beds.json', JSON.stringify(out, null, 1));
    console.log(Object.keys(out).join(' '));
}
