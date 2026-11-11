"""Build 'Farmhand Display', a caps display face drawn in the Farmboy logo's language.

Design units are the logo's own SVG units (cap height ~97), y up from the baseline.
The seven logo letters (F A R M B O Y) and the barn mark are lifted from the logo
outlines; everything else is constructed from the same parts: 20-unit stems, 6.4
hairlines, 9.4 x 9.8 wedge serifs, F's beak terminal, and the O's contrast.
"""
import math, re, sys
from pathops import Path, op, PathOp
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.svgLib.path import parse_path

S = 7.2            # design unit -> font unit
BASE = 98.49       # logo baseline (svg y)
H = 96.97          # cap height
T = 20.0           # stem
t = 6.4            # hairline
WX, WY = 9.4, 9.8  # wedge serif
SB = 5.0           # default side bearing (design units)

# ---------------------------------------------------------------- primitives
def poly(pts):
    p = Path(); p.moveTo(*pts[0])
    for q in pts[1:]: p.lineTo(*q)
    p.close(); return p

def rect(x0, y0, x1, y1): return poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])

def ell(cx, cy, rx, ry):
    k = 0.5522847498
    p = Path(); p.moveTo(cx + rx, cy)
    p.cubicTo(cx + rx, cy + k*ry, cx + k*rx, cy + ry, cx, cy + ry)
    p.cubicTo(cx - k*rx, cy + ry, cx - rx, cy + k*ry, cx - rx, cy)
    p.cubicTo(cx - rx, cy - k*ry, cx - k*rx, cy - ry, cx, cy - ry)
    p.cubicTo(cx + k*rx, cy - ry, cx + rx, cy - k*ry, cx + rx, cy)
    p.close(); return p

def U(*ps):
    r = Path()
    for q in ps:
        if q is None: continue
        r = op(r, q, PathOp.UNION)
    return r
def D(a, *bs):
    for b in bs: a = op(a, b, PathOp.DIFFERENCE)
    return a
def X(a, b): return op(a, b, PathOp.INTERSECTION)

BIG = 1000
def above(y): return rect(-BIG, y, BIG, BIG)
def below(y): return rect(-BIG, -BIG, BIG, y)
def rightof(x): return rect(x, -BIG, BIG, BIG)
def leftof(x): return rect(-BIG, -BIG, x, BIG)
def side(p0, p1, left=True):
    """Half-plane to the left (or right) of the directed line p0->p1."""
    dx, dy = p1[0]-p0[0], p1[1]-p0[1]; n = math.hypot(dx, dy); dx, dy = dx/n*BIG, dy/n*BIG
    a = (p0[0]-dx, p0[1]-dy); b = (p1[0]+dx, p1[1]+dy)
    nx, ny = (-dy, dx) if left else (dy, -dx)
    return poly([a, b, (b[0]+nx, b[1]+ny), (a[0]+nx, a[1]+ny)])

def wedges(x, w, y0=0.0, y1=H, tl=True, tr=True, bl=True, br=True):
    ps = []
    if bl: ps.append(poly([(x-WX, y0), (x, y0), (x, y0+WY)]))
    if br: ps.append(poly([(x+w, y0), (x+w+WX, y0), (x+w, y0+WY)]))
    if tl: ps.append(poly([(x-WX, y1), (x, y1-WY), (x, y1)]))
    if tr: ps.append(poly([(x+w, y1), (x+w, y1-WY), (x+w+WX, y1)]))
    return ps

def stem(x, w=T, y0=0.0, y1=H, **kw):
    return U(rect(x, y0, x+w, y1), *wedges(x, w, y0, y1, **kw))

BEAK_X, BEAK_Y, ARM = 12.37, 17.41, 6.35   # from the logo F
def arm_top(x0, xe, y1=H, th=ARM, beak=True):
    if not beak: return rect(x0, y1-th, xe, y1)
    return poly([(x0, y1), (xe, y1), (xe, y1-BEAK_Y), (xe-BEAK_X, y1-th), (x0, y1-th)])
def arm_bot(x0, xe, y0=0.0, th=ARM, beak=True):
    if not beak: return rect(x0, y0, xe, y0+th)
    return poly([(x0, y0), (xe, y0), (xe, y0+BEAK_Y), (xe-BEAK_X, y0+th), (x0, y0+th)])
def mirror_x(p, ax):
    out = Path(); pen = out.getPen()
    p.draw(TransformPen(pen, (-1, 0, 0, 1, 2*ax, 0)))
    return op(out, Path(), PathOp.UNION)
def rot180(p, cx, cy):
    out = Path(); pen = out.getPen()
    p.draw(TransformPen(pen, (-1, 0, 0, -1, 2*cx, 2*cy)))
    return op(out, Path(), PathOp.UNION)
def shift(p, dx, dy=0):
    out = Path(); pen = out.getPen()
    p.draw(TransformPen(pen, (1, 0, 0, 1, dx, dy)))
    return out

def diag(top, bot, w):
    """Stroke between centre points top=(x,y) and bot=(x,y), w measured horizontally."""
    (xt, yt), (xb, yb) = top, bot
    return poly([(xt-w/2, yt), (xt+w/2, yt), (xb+w/2, yb), (xb-w/2, yb)])

def edge_x(p0, p1, y):
    (x0, y0), (x1, y1) = p0, p1
    return x0 + (x1-x0)*(y-y0)/(y1-y0)

def diag_serifs(top, bot, w, y=H, l=True, r=True, wy=10.5, at_top=True):
    """Wedge serifs on the end of a diagonal stroke at height y."""
    (xt, yt), (xb, yb) = top, bot
    L0, L1 = (xt-w/2, yt), (xb-w/2, yb)
    R0, R1 = (xt+w/2, yt), (xb+w/2, yb)
    yi = y - wy if at_top else y + wy
    ps = []
    if l:
        xe = edge_x(L0, L1, y); xi = edge_x(L0, L1, yi)
        ps.append(poly([(xe-WX, y), (xe, y), (xi, yi)]) if at_top else poly([(xe-WX, y), (xi, yi), (xe, y)]))
    if r:
        xe = edge_x(R0, R1, y); xi = edge_x(R0, R1, yi)
        ps.append(poly([(xe, y), (xe+WX, y), (xi, yi)]))
    return ps

def ring(cx, cy, rx, ry, side_w=21.0, cap_w=t):
    return D(ell(cx, cy, rx, ry), ell(cx, cy, rx-side_w, ry-cap_w))

# ---------------------------------------------------------------- the logo
LOGO = {
 'O': "M688.66,0c-25.46,0-47.09,18.31-47.09,50.91,0,28.57,17.22,49.09,46.57,49.09,25.58,0,47.22-18.05,47.22-50.78,0-28.96-17.74-49.22-46.7-49.22ZM689.43,93.64c-20.12,0-26.72-21.56-26.72-46.49s5.68-40.78,24.65-40.78c20.13,0,26.72,21.69,26.72,46.62s-5.68,40.65-24.65,40.65Z",
 'F': "M106.93 11.58 106.93 88.69 97.51 98.49 137.67 98.49 128.26 88.71 128.26 53.36 157.34 53.36 157.34 46.93 128.26 46.93 128.26 7.87 155.29 7.87 167.66 18.93 167.66 1.52 97.51 1.54 106.93 11.58Z",
 'R': "M365.11,24.41c0-17.01-14.43-22.89-38.49-22.89h-35.79l9.4,10.05v77.14l-9.4,9.76h37.89l-9.06-9.76v-34.8h7.89l25.9,44.56h22.1l-29.13-48.8c12.6-4.03,18.69-13.16,18.69-25.26ZM339.68,42.99c-4.08,3.12-9.82,4.48-17.12,4.48h-2.91s0-39.66,0-39.66h5.51c13.73,0,21.04,3.07,21.04,18.69,0,8.5-2.44,13.38-6.53,16.49Z",
 'P': "M365.11,24.41c0-17.01-14.43-22.89-38.49-22.89h-35.79l9.4,10.05v77.14l-9.4,9.76h37.89l-9.06-9.76v-34.8H333C340,53.91 343.4,51.2 346.42,49.67c12.6-4.03,18.69-13.16,18.69-25.26ZM339.68,42.99c-4.08,3.12-9.82,4.48-17.12,4.48h-2.91s0-39.66,0-39.66h5.51c13.73,0,21.04,3.07,21.04,18.69,0,8.5-2.44,13.38-6.53,16.49Z",
 'B': "M593.96,47.2c11.96-3.82,19.97-11.59,19.97-22.41,0-15.65-10.94-23.27-39.95-23.27h-34l9.4,10.07v77.13l-9.4,9.78,33.24-.02c29.9,0,45.42-8.8,45.42-27.38,0-12.35-9.16-20.95-24.68-23.88ZM568.97,7.9h4.25c1.28,0,2.5.06,3.67.17,11.27,1.09,17.33,6.81,17.33,18.81,0,13.71-7.38,19.4-18.26,20.1-.72.05-1.47.07-2.22.07h-4.76V7.9ZM575,92.05h-6.03v-38.64h7.3c15.65,0,22.64,7.57,22.64,20.68,0,14.25-7.5,17.96-23.92,17.96Z",
 'A': "M229.67,1.52h-20.48l5.25,13.59-26.2,70.94-.9,2.44-8.41,10h23.11l-7.85-9.33,1.04-2.8,7.22-19.56h32.32l8.41,21.37-8.69,10.33h37.81l-8.49-10.09L229.67,1.52ZM204.83,60.36l13.27-35.93,14.14,35.93h-27.41Z",
 'M': "M518.47 98.49 510.12 88.64 497.45 12.43 505.59 1.65 481.2 1.65 457.36 70.49 432.63 1.65 407.5 1.65 415.04 12.58 404.03 88.64 395.47 98.49 419.11 98.49 410.59 88.64 419.38 28.73 446.07 98.49 453.97 98.49 479.94 25.69 489.68 88.64 482.45 98.49 518.47 98.49Z",
 'Y': "M805.2 1.52 814.81 12.95 813.79 15.04 795.38 52.45 794.85 52.45 775.35 13.02 784.93 1.52 745.97 1.52 755.55 13.09 779.85 58.4 779.85 88.71 770.45 98.47 808.91 98.47 799.49 88.71 799.49 57.66 820.27 15.43 821 13.94 831.45 1.52 805.2 1.52Z",
 'BARN': "M0 33.61 0 98.46 39.01 98.46 39.01 .8 0 33.61Z",
}
def from_svg(d):
    p = Path(); pen = p.getPen()
    tp = TransformPen(pen, (1, 0, 0, -1, 0, BASE))
    parse_path(d, tp)
    return op(p, Path(), PathOp.UNION)

G = {}   # name -> (path, lsb, rsb)
def add(name, path, lsb=SB, rsb=SB): G[name] = (path, lsb, rsb)

for k in 'OFRPBAMY':
    add(k, from_svg(LOGO[k]))
add('barn', from_svg(LOGO['BARN']), 6, 14)

# ---------------------------------------------------------------- letters
x = WX; xr = x + T
MID0, MID1 = 45.13, 51.56          # F's crossbar

add('E', U(stem(x, tr=False, br=False), arm_top(xr, xr+38), rect(xr, MID0, xr+25, MID1), arm_bot(xr, xr+42)))
add('L', U(stem(x, br=False), arm_bot(xr, xr+42)))
add('I', stem(x))
add('H', U(stem(x), stem(xr+46), rect(xr, MID0, xr+46, MID1)))

# T: hairline top with a beak at each end
tw = 80.0; sx = tw/2 - T/2
add('T', U(arm_top(tw/2, tw), mirror_x(arm_top(tw/2, tw), tw/2), stem(sx, tl=False, tr=False)))

# D: stem + a bowl with the O's contrast
def bowl(x0, x1, y0, y1, side_w=21.0, cap_w=t, k=0.62):
    """Right-hand bowl from a straight left side at x0, flat top/bottom tangents."""
    ym = (y0+y1)/2; r = x1 - x0
    def half(xa, xb, ya, yb):
        rr = xb - xa; ymm = (ya+yb)/2; hh = (yb-ya)/2
        p = Path(); p.moveTo(xa - 1, ya); p.lineTo(xa, ya)
        p.cubicTo(xa + rr*k, ya, xb, ymm - hh*k, xb, ymm)
        p.cubicTo(xb, ymm + hh*k, xa + rr*k, yb, xa, yb)
        p.lineTo(xa - 1, yb); p.close(); return p
    xs = x0 + r*0.35
    outer = U(rect(x0, y0, xs, y1), half(xs, x1, y0, y1))
    inner = U(rect(x0 - 5, y0+cap_w, xs, y1-cap_w), half(xs, x1-side_w, y0+cap_w, y1-cap_w))
    return D(outer, inner)
add('D', U(stem(x, tr=False, br=False), bowl(xr - 1, xr + 60, 0, H)))

# K
k_arm_top, k_arm_bot = (78.0, H), (20.0, 14.0)
arm = diag(k_arm_top, k_arm_bot, 7.0)
leg = diag((50.0 - 32*30/58, 90.0), (80.0, 0.0), 22.0)
arm_left_edge = ((k_arm_bot[0]-3.5, k_arm_bot[1]), (k_arm_top[0]-3.5, H))
leg = X(leg, side(arm_left_edge[0], arm_left_edge[1], left=False))
k = U(stem(x), arm, leg, *diag_serifs(k_arm_top, k_arm_bot, 7.0))
k = X(k, rightof(-50)); k = X(k, above(0)); k = X(k, below(H))
k = U(k, *diag_serifs(k_arm_top, k_arm_bot, 7.0))
add('K', k)

# N: hairline stems, heavy diagonal
nx0, nx1, nh = x, x + 70.0, 6.6
ndiag = poly([(nx0, H), (nx0+23, H), (nx1, 0), (nx1-23, 0)])
add('N', U(stem(nx0, nh, tr=False), stem(nx1-nh, nh, bl=False, br=False), ndiag))

# V / W: heavy left stroke, hairline right stroke, wedge serifs on each top
def vee(xl, xr_, apex, aw=8.0, thick=20.0, thin=6.5, serifs=True):
    a0, a1 = apex - aw/2, apex + aw/2
    quad = poly([(xl, H), (xr_, H), (a1, 0), (a0, 0)])
    thick_in = ((xl+thick, H), (a0+thick, 0))
    thin_in = ((xr_-thin, H), (a1-thin, 0))
    counter = X(side(thick_in[0], thick_in[1], left=True), side(thin_in[0], thin_in[1], left=False))
    counter = X(counter, below(H + 50))
    v = D(quad, counter)
    if serifs:
        tc = ((xl + thick/2, H), (a0 + thick/2, 0)); hc = ((xr_ - thin/2, H), (a1 - thin/2, 0))
        v = U(v, *diag_serifs(tc[0], tc[1], thick), *diag_serifs(hc[0], hc[1], thin))
    return v
add('V', vee(WX, WX + 72, WX + 38))
v1 = vee(WX, WX + 64, WX + 33)
v2 = vee(WX + 52, WX + 52 + 64, WX + 52 + 33)
add('W', U(v1, v2))

# X
xa = ((WX + 10, H), (WX + 66, 0)); xb = ((WX + 60, H), (WX + 14, 0))
add('X', U(diag(*xa, 21.0), diag(*xb, 6.6),
           *diag_serifs(xa[0], xa[1], 21.0), *diag_serifs(xb[0], xb[1], 6.6),
           *diag_serifs(xa[0], xa[1], 21.0, y=0, at_top=False), *diag_serifs(xb[0], xb[1], 6.6, y=0, at_top=False)))

# Z
zw = 74.0
ztop = mirror_x(arm_top(0, zw), zw/2)
add('Z', U(ztop, arm_bot(0, zw), poly([(zw-24, H-ARM), (zw, H-ARM), (24, ARM), (0, ARM)]), rect(zw - 24, H-ARM, zw, H), rect(0, 0, 24, ARM)))

# Round letters share one ring (O-like contrast)
RCY, RRY = 48.49, 50.0           # overshoot -1.51 .. 98.49
def c_shape(cx, rx, cut=17.0, top=True, bot=True):
    r = ring(cx, RCY, rx, RRY)
    r = D(r, rightof(cx + cut))
    spur = []
    if top: spur.append(poly([(cx+cut, 76), (cx+cut, 64), (cx+cut-9, 84)]))
    if bot: spur.append(poly([(cx+cut, RCY*2-76), (cx+cut-9, RCY*2-84), (cx+cut, RCY*2-64)]))
    return U(r, *spur)
add('C', c_shape(43.0, 43.0))
# G
gcx, grx = 44.0, 44.0
gr = D(ring(gcx, RCY, grx, RRY), X(rightof(gcx + 17), above(32)))
gr = U(gr, poly([(gcx+17, 76), (gcx+17, 64), (gcx+8, 84)]))
jaw = U(rect(gcx + grx - 21, 14, gcx + grx - 1.2, 46), *wedges(gcx + grx - 21, 19.8, 14, 46, bl=False, br=False))
add('G', U(gr, jaw))
# Q: the logo O plus a tail
o = G['O'][0]
oxmin = min(pt[0] for pt in iter_pts(o)) if False else None
add('Q', None)  # filled below once bounds are known

# U
ux0, ux1 = WX, WX + 74.0
ucy = 38.0
uo = U(rect(ux0, ucy, ux1, H), ell((ux0+ux1)/2, ucy, (ux1-ux0)/2, ucy + 1.5))
ui_l, ui_r = ux0 + T, ux1 - 6.6
ui = U(rect(ui_l, ucy, ui_r, H + 5), ell((ui_l+ui_r)/2, ucy, (ui_r-ui_l)/2, ucy + 1.5 - t))
add('U', U(D(uo, ui), *wedges(ux0, T, y1=H, bl=False, br=False), *wedges(ui_r, 6.6, y1=H, bl=False, br=False)))

# J
jx = 34.0
jcy = 30.0
jo = ell(jx - 4, jcy, (jx + T) - (jx - 4) + 0.0, jcy + 1.5)
jbowl = D(ring(jx + T/2 - 22, jcy, 22 + T/2, jcy + 1.5, side_w=T, cap_w=t), above(jcy))
jbowl = D(jbowl, leftof(jx + T/2 - 22 - (22 + T/2) + 2))
jball = ell(jx + T/2 - 22 - (22+T/2) + 10.5, jcy - 6, 10.0, 10.0)
add('J', U(stem(jx, y0=jcy, bl=False, br=False), jbowl, jball))

# S: two rings, opposite quarters, terminals with beaks
scx = 38.0
top_r = ring(scx, 72.0, 33.0, 26.5, side_w=19.0)
bot_r = ring(scx, 24.97, 35.0, 26.5, side_w=19.0)
top_keep = U(leftof(scx), above(72.0))
top_part = D(X(top_r, top_keep), X(rightof(scx + 15), above(72.0)))
bot_keep = U(rightof(scx), below(24.97))
bot_part = D(X(bot_r, bot_keep), X(leftof(scx - 15), below(24.97)))
spine = poly([(scx - 30, 66), (scx - 14, 58), (scx + 32, 36), (scx + 14, 40)])
spine = X(spine, U(ell(scx, 72.0, 33, 26.5), ell(scx, 24.97, 35, 26.5)))
sp_t = poly([(scx+15, 80), (scx+15, 70), (scx+7, 89)])
sp_b = poly([(scx-15, 17), (scx-7, 8), (scx-15, 27)])
add('S', U(top_part, bot_part, spine, sp_t, sp_b))

# ---------------------------------------------------------------- figures
NW = 66.0
def fig_ring(cx, cy, rx, ry, side_w=18.0): return ring(cx, cy, rx, ry, side_w=side_w)
add('zero', fig_ring(NW/2, RCY, NW/2, RRY, 18.0))
one = U(stem(NW/2 - T/2, tl=False, tr=False), poly([(NW/2 - T/2, H), (NW/2 - T/2 + 2, H), (NW/2 - T/2 - 16, H - 24), (NW/2 - T/2 - 22, H - 24)]))
add('one', one)
# seven
seven = U(mirror_x(arm_top(0, NW), NW/2), poly([(NW - 22, H - ARM), (NW, H - ARM), (NW, H), (34, 0), (14, 0)]))
seven = X(seven, below(H))
add('seven', U(seven, rect(NW - 22, H - ARM, NW, H)))
# four
fx = NW - 22.0
four = U(stem(fx, T, tl=False, tr=False), rect(0, 22, NW + 2, 28.4),
         poly([(fx + 2, H), (fx + T, H), (fx + T, H - 4), (6.5, 28.4), (0, 28.4)]))
add('four', four)
# eight
ecx = NW/2
add('eight', U(fig_ring(ecx, 72.5, 28.0, 25.97, 16.0), fig_ring(ecx, 25.0, 32.0, 26.5, 18.0)))
# three
tcx = NW/2 - 2
t_top = ring(tcx, 72.5, 28.0, 25.97, side_w=16.0)
t_top = D(t_top, X(leftof(tcx - 14), above(72.5)), X(leftof(tcx - 2), below(72.5)))
t_bot = ring(tcx, 25.0, 32.0, 26.5, side_w=18.0)
t_bot = D(t_bot, X(leftof(tcx - 16), below(25.0)), X(leftof(tcx - 2), above(25.0)))
add('three', U(t_top, t_bot,
               poly([(tcx-14, 82), (tcx-14, 70), (tcx-6, 90)]),
               poly([(tcx-16, 17), (tcx-8, 7), (tcx-16, 29)])))
# six (and nine = six turned)
scx6 = NW/2
big = D(ring(scx6, RCY, NW/2, RRY, side_w=18.0), below(30), X(rightof(scx6 + 14), above(30)))
small = fig_ring(scx6, 30.0, NW/2, 31.5, 18.0)
six = U(big, small, poly([(scx6+14, 78), (scx6+14, 66), (scx6+6, 86)]))
add('six', six)
add('nine', rot180(six, NW/2, H/2))
# two
tw2 = NW
two_top = ring(tw2/2, 70.5, 30.0, 28.0, side_w=18.0)
two_top = D(two_top, below(54), X(leftof(tw2/2 - 14), above(70.5)))
two = U(two_top, poly([(tw2/2 + 12, 60), (tw2/2 + 30, 64), (22, ARM), (0, ARM), (0, 0)]),
        arm_bot(0, tw2 + 2), poly([(tw2/2-14, 80), (tw2/2-14, 68), (tw2/2-6, 88)]))
two = X(two, rightof(0))
add('two', U(two, rect(0, 0, 8, ARM)))
# five
f5 = NW/2
five_b = ring(f5, 32.0, NW/2, 33.5, side_w=18.0)
five_b = D(five_b, X(leftof(f5 - 16), below(32)), X(leftof(f5 - 4), above(32)))
add('five', U(five_b, rect(f5 - 22, 54, f5 - 15, H), rect(f5 - 22, H - ARM, NW - 2, H),
              poly([(NW - 2, H), (NW - 2, H - 14), (NW - 12, H - ARM)]),
              poly([(f5 - 22, 54), (f5 - 4, 64), (f5 - 4, 58), (f5 - 15, 50)]),
              poly([(f5-16, 15), (f5-8, 5), (f5-16, 27)])))

# ---------------------------------------------------------------- curve fitting (Schneider)
def _v(a, b): return (b[0]-a[0], b[1]-a[1])
def _add(a, b): return (a[0]+b[0], a[1]+b[1])
def _mul(a, s): return (a[0]*s, a[1]*s)
def _dot(a, b): return a[0]*b[0] + a[1]*b[1]
def _norm(a):
    m = math.hypot(*a) or 1e-12; return (a[0]/m, a[1]/m)
def _bq(ctrl, s):
    p0, p1, p2, p3 = ctrl; u = 1 - s
    return (u**3*p0[0]+3*u*u*s*p1[0]+3*u*s*s*p2[0]+s**3*p3[0], u**3*p0[1]+3*u*u*s*p1[1]+3*u*s*s*p2[1]+s**3*p3[1])
def _bq1(ctrl, s):
    p0, p1, p2, p3 = ctrl; u = 1 - s
    return (3*u*u*(p1[0]-p0[0])+6*u*s*(p2[0]-p1[0])+3*s*s*(p3[0]-p2[0]), 3*u*u*(p1[1]-p0[1])+6*u*s*(p2[1]-p1[1])+3*s*s*(p3[1]-p2[1]))
def _bq2(ctrl, s):
    p0, p1, p2, p3 = ctrl; u = 1 - s
    return (6*u*(p2[0]-2*p1[0]+p0[0])+6*s*(p3[0]-2*p2[0]+p1[0]), 6*u*(p2[1]-2*p1[1]+p0[1])+6*s*(p3[1]-2*p2[1]+p1[1]))
def _gen(pts, us, t1, t2):
    p0, p3 = pts[0], pts[-1]
    C = [[0, 0], [0, 0]]; Xv = [0, 0]
    for p, u in zip(pts, us):
        a1 = _mul(t1, 3*(1-u)**2*u); a2 = _mul(t2, 3*(1-u)*u*u)
        C[0][0] += _dot(a1, a1); C[0][1] += _dot(a1, a2); C[1][1] += _dot(a2, a2)
        tmp = _v(_bq((p0, p0, p3, p3), u), p)
        Xv[0] += _dot(a1, tmp); Xv[1] += _dot(a2, tmp)
    C[1][0] = C[0][1]
    det = C[0][0]*C[1][1] - C[0][1]*C[1][0]
    seg = math.hypot(*_v(p0, p3))
    if abs(det) > 1e-12:
        al = (Xv[0]*C[1][1] - Xv[1]*C[0][1]) / det; ar = (C[0][0]*Xv[1] - C[1][0]*Xv[0]) / det
    else: al = ar = seg / 3
    if al < 1e-6*seg or ar < 1e-6*seg: al = ar = seg / 3
    return (p0, _add(p0, _mul(t1, al)), _add(p3, _mul(t2, ar)), p3)
def _maxerr(pts, ctrl, us):
    md, mi = 0, len(pts)//2
    for i, (p, u) in enumerate(zip(pts, us)):
        d = math.hypot(*_v(_bq(ctrl, u), p))**2
        if d > md: md, mi = d, i
    return md, mi
def _reparam(pts, ctrl, us):
    out = []
    for p, u in zip(pts, us):
        d = _v(p, _bq(ctrl, u)); d1 = _bq1(ctrl, u); d2 = _bq2(ctrl, u)
        num = _dot(d, d1); den = _dot(d1, d1) + _dot(d, d2)
        out.append(u - num/den if abs(den) > 1e-12 else u)
    return out
def _chord(pts):
    us = [0.0]
    for i in range(1, len(pts)): us.append(us[-1] + math.hypot(*_v(pts[i-1], pts[i])))
    return [u/us[-1] for u in us]
def _fit(pts, t1, t2, err, out):
    if len(pts) == 2:
        d = math.hypot(*_v(pts[0], pts[1]))/3
        out.append((pts[0], _add(pts[0], _mul(t1, d)), _add(pts[1], _mul(t2, d)), pts[1])); return
    us = _chord(pts); ctrl = _gen(pts, us, t1, t2); e, si = _maxerr(pts, ctrl, us)
    if e < err: out.append(ctrl); return
    if e < err*16:
        for _ in range(20):
            us = _reparam(pts, ctrl, us); ctrl = _gen(pts, us, t1, t2); e, si = _maxerr(pts, ctrl, us)
            if e < err: out.append(ctrl); return
    si = max(1, min(len(pts)-2, si))
    tc = _norm(_v(pts[si+1], pts[si-1]))
    _fit(pts[:si+1], t1, tc, err, out); _fit(pts[si:], _mul(tc, -1), t2, err, out)
def fit_path(pts, err=0.02):
    pts = [p for i, p in enumerate(pts) if i == 0 or math.hypot(*_v(pts[i-1], p)) > 1e-6]
    out = []
    _fit(pts, _norm(_v(pts[0], pts[1])), _norm(_v(pts[-1], pts[-2])), err, out)
    return out
def curve_poly(chains):
    """chains: list of point lists; each fitted to cubics, joined by straight lines, closed."""
    p = Path(); first = True
    for ch in chains:
        segs = fit_path(ch)
        if first: p.moveTo(*segs[0][0]); first = False
        else: p.lineTo(*segs[0][0])
        for _, c1, c2, e in segs: p.cubicTo(*c1, *c2, *e)
    p.close(); return p

# ---------------------------------------------------------------- pointed pen
# A centreline stroked hairline on horizontals and full stem on verticals: the
# same contrast as the logo O. Used for the curved letters and figures.
THIN, THICK = 6.4, 21.0
def _bez(p0, p1, p2, p3, s):
    u = 1 - s
    pt = (u**3*p0[0] + 3*u*u*s*p1[0] + 3*u*s*s*p2[0] + s**3*p3[0],
          u**3*p0[1] + 3*u*u*s*p1[1] + 3*u*s*s*p2[1] + s**3*p3[1])
    d = (3*u*u*(p1[0]-p0[0]) + 6*u*s*(p2[0]-p1[0]) + 3*s*s*(p3[0]-p2[0]),
         3*u*u*(p1[1]-p0[1]) + 6*u*s*(p2[1]-p1[1]) + 3*s*s*(p3[1]-p2[1]))
    return pt, d
def pen(segs, thin=THIN, thick=THICK, n=48, p=2.0, closed=False):
    """segs: list of (p0, c1, c2, p3) cubics, joined end to start."""
    L, R = [], []
    for si, (a, b, c, d) in enumerate(segs):
        for i in range(n + 1):
            if si and i == 0: continue
            pt, dv = _bez(a, b, c, d, i / n)
            m = math.hypot(*dv) or 1e-9; tx, ty = dv[0]/m, dv[1]/m
            w = thin + (thick - thin) * abs(ty) ** p
            nx, ny = -ty, tx
            L.append((pt[0] + nx*w/2, pt[1] + ny*w/2)); R.append((pt[0] - nx*w/2, pt[1] - ny*w/2))
    if closed:
        a, b = curve_poly([L]), curve_poly([R])
        return D(a, b) if abs(_area(L)) > abs(_area(R)) else D(b, a)
    return curve_poly([L, R[::-1]])
def _area(pts):
    return sum(pts[i][0]*pts[(i+1)%len(pts)][1] - pts[(i+1)%len(pts)][0]*pts[i][1] for i in range(len(pts))) / 2
def oval(cx, cy, rx, ry):
    """Closed centreline as four cubics."""
    k = 0.5522847498
    return [((cx, cy+ry), (cx-k*rx, cy+ry), (cx-rx, cy+k*ry), (cx-rx, cy)),
            ((cx-rx, cy), (cx-rx, cy-k*ry), (cx-k*rx, cy-ry), (cx, cy-ry)),
            ((cx, cy-ry), (cx+k*rx, cy-ry), (cx+rx, cy-k*ry), (cx+rx, cy)),
            ((cx+rx, cy), (cx+rx, cy+k*ry), (cx+k*rx, cy+ry), (cx, cy+ry))]
def ball(x, y, r=9.5): return ell(x, y, r, r)
TOPC, BOTC = H + 1.52 - THIN/2, -1.51 + THIN/2     # centreline of overshooting hairlines

def beak_top(xe, ytop, drop=16.0, back=11.0, th=THIN):
    """F's beak hung off a hairline that ends at x=xe: vertical outer edge, diagonal back."""
    return poly([(xe - back - 2, ytop), (xe, ytop), (xe, ytop - drop), (xe - back, ytop - th)])
def beak_bot(xe, ybot, rise=16.0, back=11.0, th=THIN):
    return poly([(xe - back - 2, ybot), (xe, ybot), (xe, ybot + rise), (xe - back, ybot + th)])

def pen_beak(segs, end, top=True, length=17.0, back=11.0, thin=THIN, thick=THICK, p=2.0):
    """F's beak on a pen terminal: vertical outer edge dropping (top) or rising (bottom) from
    the terminal's outer corner, diagonal back into the stroke. Every vertex but the tip sits
    on or inside the stroke, so the union is clean."""
    a, b, c, d = segs[0] if end == 'start' else segs[-1]
    s0, ds = (0.0, 1/400) if end == 'start' else (1.0, -1/400)
    E, dv = _bez(a, b, c, d, s0)
    m = math.hypot(*dv); tx, ty = dv[0]/m, dv[1]/m
    w = thin + (thick - thin) * abs(ty) ** p
    o1 = (E[0] - ty*w/2, E[1] + tx*w/2); o2 = (E[0] + ty*w/2, E[1] - tx*w/2)
    corner = max(o1, o2, key=lambda q: q[1]) if top else min(o1, o2, key=lambda q: q[1])
    tip = (corner[0], corner[1] - length) if top else (corner[0], corner[1] + length)
    s, dist, prev = s0, 0.0, E
    while dist < back and 0 <= s + ds <= 1:
        s += ds; q, _ = _bez(a, b, c, d, s); dist += math.hypot(q[0]-prev[0], q[1]-prev[1]); prev = q
    return poly([corner, tip, prev])

# C: hairline arms ending in beaks, full stem on the left
def c_segs(w, cx):
    xl = THICK/2
    top = [((w - 3, TOPC - 5), (w - 13, TOPC), (cx + 12, TOPC), (cx, TOPC)),
           ((cx, TOPC), (cx - 0.5523*(cx - xl), TOPC), (xl, RCY + 0.5523*(TOPC - RCY)), (xl, RCY))]
    bot = [((xl, RCY), (xl, RCY - 0.5523*(RCY - BOTC)), (cx - 0.5523*(cx - xl), BOTC), (cx, BOTC)),
           ((cx, BOTC), (cx + 12, BOTC), (w - 13, BOTC), (w - 3, BOTC + 5))]
    return top, bot
cw = 72.0; ccx = cw * 0.53
ct, cb = c_segs(cw, ccx)
add('C', U(pen(ct + cb, n=60), pen_beak(ct, 'start', top=True), pen_beak(cb, 'end', top=False)))

# G: the C's top, a lower bowl that turns up into a jaw with wedge serifs
gw = 76.0; gcx = gw * 0.53
gt, _ = c_segs(gw, gcx)
gb = [((THICK/2, RCY), (THICK/2, RCY - 0.5523*(RCY - BOTC)), (gcx - 0.5523*(gcx - THICK/2), BOTC), (gcx, BOTC)),
      ((gcx, BOTC), (gcx + 16, BOTC), (gw - THICK/2, 3), (gw - THICK/2, 30))]
gx0 = gw - THICK
jaw = U(rect(gx0, 24, gw, 46), *wedges(gx0, THICK, 26, 46, bl=False, br=False))
add('G', U(pen(gt + gb, n=60), pen_beak(gt, 'start', top=True), jaw))

# C and G: the logo O's construction (outer ellipse minus an inner ellipse pushed right,
# so the left side carries the stem and the right goes to a hairline), cut open, F beaks.
CRY_O, CRY_I = 50.0, 50.0 - THIN
def ring_c(rx, dx=6.5):
    cx = rx; rxi = rx - THICK/2 - dx + 0.5 + THICK/2 - 8 + 0.0
    rxi = (2*rx - THICK - 8) / 2; icx = cx - rx + THICK + rxi
    outer, inner = ell(cx, RCY, rx, CRY_O), ell(icx, RCY, rxi, CRY_I)
    yo = lambda x: RCY + CRY_O*math.sqrt(max(0, 1 - ((x-cx)/rx)**2))
    yi = lambda x: RCY + CRY_I*math.sqrt(max(0, 1 - ((x-icx)/rxi)**2))
    return cx, outer, inner, yo, yi
def c_beaks(xe, yo, yi, top=True, bottom=True, drop=13.0, back=11.0):
    ps = []
    yt, yb = yo(xe), yi(xe - back)
    yb = (yb + yo(xe - back)) / 2           # midway in the stroke: always inside it
    if top: ps.append(poly([(xe, yt), (xe, yi(xe) - drop), (xe - back, yb)]))
    if bottom: ps.append(poly([(xe, 2*RCY - yt), (xe - back, 2*RCY - yb), (xe, 2*RCY - yi(xe) + drop)]))
    return ps
crx = 45.0
ccx, co, ci, cyo, cyi = ring_c(crx)
cxe = ccx + 23.0
add('C', U(D(co, ci, rightof(cxe)), *c_beaks(cxe, cyo, cyi, drop=12.0, back=12.0)))

grx = 46.0
gcx, go, gi, gyo, gyi = ring_c(grx)
gxe = gcx + 23.0
jx1 = gcx + grx - 4.0; jx0 = jx1 - THICK
jy = RCY - CRY_O*math.sqrt(1 - ((jx1 - gcx)/grx)**2)        # where the bowl meets the upright
gring = D(go, gi, X(rightof(gxe), above(46)), X(rightof(jx1), above(jy - 0.01)))
jaw = U(X(rect(jx0, -5, jx1, 46), U(go, above(jy))), *wedges(jx0, THICK, 20, 46, bl=False, br=False))
add('G', U(gring, jaw, *c_beaks(gxe, gyo, gyi, bottom=False, drop=12.0, back=12.0)))

# S: pen with a heavy diagonal spine, beaks top right and bottom left
sw = 64.0
s_segs = [((sw - 3, TOPC - 5), (sw - 14, TOPC), (sw/2 + 10, TOPC), (sw/2, TOPC)),
          ((sw/2, TOPC), (sw/2 - 12.5, TOPC), (10, 88), (10.5, 74)),
          ((10.5, 74), (11.5, 52), (sw - 11.5, 60), (sw - 9.5, 24)),
          ((sw - 9.5, 24), (sw - 9.5, 10), (sw/2 + 12.5, BOTC), (sw/2, BOTC)),
          ((sw/2, BOTC), (sw/2 - 12, BOTC), (14, BOTC), (3, BOTC + 5))]
S_P = 1.6
add('S', U(pen(s_segs, thick=20.0, n=60, p=S_P),
           pen_beak(s_segs, 'start', top=True, thick=20.0, p=S_P),
           pen_beak(s_segs, 'end', top=False, thick=20.0, p=S_P)))

# J: stem, then the hook drawn by the pen, ball terminal
jx = 26.0
j_hook = pen([((jx + T/2, 34), (jx + T/2, 12), (jx, BOTC), (jx - 10, BOTC)),
              ((jx - 10, BOTC), (jx - 20, BOTC), (jx - 24, 6), (jx - 24, 12))], thick=T, n=40)
add('J', U(stem(jx, y0=30, bl=False, br=False), j_hook, ball(jx - 21.5, 13.5, 9.0)))

# Figures --------------------------------------------------------------
NW = 64.0
add('zero', pen(oval(NW/2, RCY, NW/2 - 9.5, (TOPC - BOTC)/2), thick=19.0, closed=True))
sl = NW/2 - T/2
add('one', U(stem(sl, tl=False, tr=False), poly([(sl + 1, H), (sl + 1, H - 12), (sl - 20, H - 28), (sl - 22, H - 24)])))
# two
two_c = pen([((12, 78), (12, 90), (22, TOPC), (34, TOPC)),
             ((34, TOPC), (50, TOPC), (NW - 9, 86), (NW - 9, 70)),
             ((NW - 9, 70), (NW - 9, 50), (24, 30), (3, ARM - 1))], thick=19.0, n=40, p=1.6)
add('two', U(two_c, ball(13, 77, 9.0), arm_bot(0, NW, beak=True), rect(0, 0, 10, ARM)))
# three
th_top = pen([((11, 80), (12, 90), (22, TOPC), (32, TOPC)),
              ((32, TOPC), (46, TOPC), (NW - 12, 86), (NW - 12, 74)),
              ((NW - 12, 74), (NW - 12, 60), (40, 52), (24, 52))], thick=17.0, n=40)
th_bot = pen([((24, 52), (44, 52), (NW - 8, 44), (NW - 8, 26)),
              ((NW - 8, 26), (NW - 8, 10), (46, BOTC), (32, BOTC)),
              ((32, BOTC), (18, BOTC), (9, 6), (9, 16))], thick=19.0, n=40)
add('three', U(th_top, th_bot, ball(12, 79, 8.5), ball(11, 17, 9.0)))
# five
fv = pen([((16, 56), (24, 62), (32, 63), (36, 63)),
          ((36, 63), (52, 63), (NW - 8, 50), (NW - 8, 31)),
          ((NW - 8, 31), (NW - 8, 12), (48, BOTC), (32, BOTC)),
          ((32, BOTC), (18, BOTC), (9, 6), (9, 16))], thick=19.0, n=40)
f_flag = U(rect(13, H - ARM, NW - 6, H), poly([(NW - 6, H), (NW - 3, H), (NW - 3, H - 16), (NW - 12, H - ARM)]))
add('five', U(fv, rect(13, 54, 20, H), f_flag, ball(11, 17, 9.0)))
# six / nine
six_c = pen([((NW - 12, 86), (NW - 14, 93), (NW/2 + 10, TOPC), (NW/2 + 2, TOPC)),
             ((NW/2 + 2, TOPC), (14, TOPC), (9.5, 70), (9.5, 40)),
             ((9.5, 40), (9.5, 24), (14, 12), (22, 6))], thick=19.0, n=40)
six_b = pen(oval(NW/2 + 1, 30, NW/2 - 10.5, 30 - BOTC), thick=19.0, closed=True)
six = U(six_c, six_b, ball(NW - 11, 84, 8.5))
add('six', six)
add('nine', rot180(six, NW/2, H/2))

# ---------------------------------------------------------------- punctuation
DOT = 10.5
add('period', ell(DOT, DOT - 1, DOT, DOT))
add('comma', U(ell(DOT, DOT - 1, DOT, DOT), poly([(DOT*2 - 1, DOT - 1), (DOT*2 - 0.5, 4), (6, -22), (2, -22), (DOT, 0)])))
add('colon', U(ell(DOT, DOT - 1, DOT, DOT), ell(DOT, 52, DOT, DOT)))
add('hyphen', rect(0, 41, 34, 49))
add('endash', rect(0, 43, 60, 49))
add('quotesingle', shift(U(ell(DOT, DOT - 1, DOT, DOT), poly([(DOT*2 - 1, DOT - 1), (DOT*2 - 0.5, 4), (6, -22), (2, -22), (DOT, 0)])), 0, H - 20))
add('exclam', U(poly([(0, H), (21, H), (13, 30), (8, 30)]), ell(DOT, DOT - 1, DOT, DOT)))
add('slash', diag((50, H + 4), (6, -8), 7.0))
add('ampersand', None)
add('space', Path(), 0, 34)

# Q needs the O's real centre
def bounds(p):
    r = RecordingPen(); p.draw(r)
    xs, ys = [], []
    for _, args in r.value:
        for a in args: xs.append(a[0]); ys.append(a[1])
    return (min(xs), min(ys), max(xs), max(ys)) if xs else (0, 0, 0, 0)
ob = bounds(G['O'][0]); ocx = (ob[0] + ob[2]) / 2
tail = poly([(ocx - 6, 4), (ocx + 10, -1.5), (ocx + 52, -22), (ocx + 56, -28), (ocx + 8, -14), (ocx - 10, -4)])
add('Q', U(G['O'][0], tail))
del G['ampersand']

# ---------------------------------------------------------------- build
CMAP = {}
for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ':
    CMAP[ord(c)] = c; CMAP[ord(c.lower())] = c
for i, n in enumerate(['zero','one','two','three','four','five','six','seven','eight','nine']):
    CMAP[ord('0') + i] = n
CMAP.update({0x20: 'space', 0x2E: 'period', 0x2C: 'comma', 0x3A: 'colon', 0x2D: 'hyphen', 0x2013: 'endash',
             0x27: 'quotesingle', 0x2019: 'quotesingle', 0x21: 'exclam', 0x2F: 'slash',
             0x7C: 'barn', 0xE000: 'barn'})

order = ['.notdef'] + sorted(G.keys())
fb = FontBuilder(1000, isTTF=False)
fb.setupGlyphOrder(order)
fb.setupCharacterMap(CMAP)
charstrings, metrics = {}, {}

def to_cs(path, lsb, rsb):
    path = op(path, Path(), PathOp.UNION)   # remove overlaps, normalise winding
    x0, y0, x1, y1 = bounds(path)
    dx = lsb - x0
    adv = round(((x1 - x0) + lsb + rsb) * S)
    pen = T2CharStringPen(adv, None)
    rp = RecordingPen()
    path.draw(TransformPen(rp, (S, 0, 0, S, dx * S, 0)))
    from fontTools.pens.roundingPen import RoundingPen
    rp.replay(RoundingPen(pen))
    return pen.getCharString(), adv, round(lsb * S)

ROUNDS = {'C','G','O','Q','S','zero','three','six','eight','nine','two','five'}
for name in order[1:]:
    p, lsb, rsb = G[name]
    if name not in ('space', 'barn', 'period', 'comma', 'colon', 'quotesingle', 'exclam', 'hyphen', 'endash', 'slash'):
        lsb = rsb = 6.0 if name in ROUNDS else 8.0
    if name == 'space':
        pen = T2CharStringPen(round(rsb * S), None); charstrings[name] = pen.getCharString(); metrics[name] = (round(rsb*S), 0); continue
    cs, adv, l = to_cs(p, lsb, rsb)
    charstrings[name] = cs; metrics[name] = (adv, l)
nd = T2CharStringPen(500, None)
nd.moveTo((50, 0)); nd.lineTo((450, 0)); nd.lineTo((450, 700)); nd.lineTo((50, 700)); nd.closePath()
nd.moveTo((100, 50)); nd.lineTo((100, 650)); nd.lineTo((400, 650)); nd.lineTo((400, 50)); nd.closePath()
charstrings['.notdef'] = nd.getCharString(); metrics['.notdef'] = (500, 50)

FAMILY, STYLE = 'Farmhand Display', 'Regular'
PS = 'FarmhandDisplay-Regular'
fb.setupCFF(PS, {'FullName': f'{FAMILY} {STYLE}', 'FamilyName': FAMILY, 'Weight': STYLE}, charstrings, {})
fb.setupHorizontalMetrics(metrics)
fb.setupHorizontalHeader(ascent=820, descent=-230)
fb.setupNameTable({'familyName': FAMILY, 'styleName': STYLE, 'uniqueFontIdentifier': f'{PS};1.000',
                   'fullName': f'{FAMILY} {STYLE}', 'psName': PS, 'version': 'Version 1.000',
                   'copyright': 'Drawn after the Farmboy Fine Arts logo, for internal use.'})
fb.setupOS2(sTypoAscender=760, sTypoDescender=-240, sTypoLineGap=0, usWinAscent=820, usWinDescent=230,
            sCapHeight=round(H * S), sxHeight=round(H * S), achVendID='FBFA', fsType=0)
fb.setupPost()
out = sys.argv[1] if len(sys.argv) > 1 else 'FarmhandDisplay-Regular.otf'
fb.save(out)
print('saved', out, len(order), 'glyphs')
