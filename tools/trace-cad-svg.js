// Trace drawings out of an exploded CAD-export SVG.
//
// The thing that makes these files hard: Illustrator's DWG export writes ONE <path> per
// segment — 101,086 of the 109,088 here are a bare "M x,y l dx,dy". Treating each path as
// a shape (which the first pass did) means a simplifier has nothing to merge and a
// line-weight heuristic is sorting noise. Everything good depends on STITCHING those
// stubs back into connected polylines first.
//
// Pipeline: parse -> flatten curves -> stitch by shared endpoints -> cluster into
// drawings -> simplify (Douglas-Peucker) -> bucket by polyline length -> emit.
const fs = require('fs');
const SRC = process.argv[2] || '.claude/references/01-02-cad-blocks-net-beds-frontal-elevation.svg';
const WANT = (process.argv[3] || '').split(',').filter(Boolean).map(Number);
const svg = fs.readFileSync(SRC, 'utf8');
const vb = (svg.match(/viewBox="([\d.eE+\- ]+)"/) || [])[1].split(/\s+/).map(Number);

function flatten(d) {
    const toks = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:[eE]-?\d+)?/g) || [];
    let x = 0, y = 0, sx = 0, sy = 0, cmd = null, i = 0;
    const runs = []; let cur = null;
    const n = () => parseFloat(toks[i++]);
    const move = (nx, ny) => { cur = [[nx, ny]]; runs.push(cur); x = nx; y = ny; };
    const line = (nx, ny) => { if (!cur) { cur = [[x, y]]; runs.push(cur); } cur.push([nx, ny]); x = nx; y = ny; };
    const cube = (x1, y1, x2, y2, ex, ey) => {
        const x0 = x, y0 = y, N = 10;
        for (let t = 1; t <= N; t++) { const u = t / N, m = 1 - u;
            line(m*m*m*x0 + 3*m*m*u*x1 + 3*m*u*u*x2 + u*u*u*ex,
                 m*m*m*y0 + 3*m*m*u*y1 + 3*m*u*u*y2 + u*u*u*ey); }
    };
    while (i < toks.length) {
        if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
        if (i >= toks.length && !/[Zz]/.test(cmd || '')) break;
        switch (cmd) {
            case 'M': { const a=n(), b=n(); move(a,b); sx=x; sy=y; cmd='L'; break; }
            case 'm': { const a=n(), b=n(); move(x+a,y+b); sx=x; sy=y; cmd='l'; break; }
            case 'L': { const a=n(), b=n(); line(a,b); break; }
            case 'l': { const a=n(), b=n(); line(x+a,y+b); break; }
            case 'H': line(n(), y); break;
            case 'h': line(x+n(), y); break;
            case 'V': line(x, n()); break;
            case 'v': line(x, y+n()); break;
            case 'C': { const a=n(),b=n(),c=n(),e=n(),f=n(),g=n(); cube(a,b,c,e,f,g); break; }
            case 'c': { const a=n(),b=n(),c=n(),e=n(),f=n(),g=n(); cube(x+a,y+b,x+c,y+e,x+f,y+g); break; }
            case 'S': case 'Q': { const c=n(),e=n(),f=n(),g=n(); cube(x,y,c,e,f,g); break; }
            case 's': case 'q': { const c=n(),e=n(),f=n(),g=n(); cube(x,y,x+c,y+e,x+f,y+g); break; }
            case 'A': { n();n();n();n();n(); const f=n(),g=n(); line(f,g); break; }
            case 'a': { n();n();n();n();n(); const f=n(),g=n(); line(x+f,y+g); break; }
            case 'Z': case 'z': line(sx, sy); break;
            default: i++; continue;
        }
    }
    return runs.filter(r => r.length > 1);
}

// ── STITCH ───────────────────────────────────────────────────────────────
// Join runs whose ends coincide. Two rules matter more than anything else here, and
// getting either wrong is what made the first pass read as "janky":
//
//   (1) JOIN WITHIN A TOLERANCE, not on an exact quantised match. A grid key alone
//       splits any pair of endpoints that happen to straddle a cell boundary, however
//       close they actually are — so the outline of a headboard broke into pieces at
//       arbitrary points and each piece was then weighted separately. Endpoints are
//       bucketed into cells for lookup but matched by real DISTANCE across the 3x3
//       neighbourhood, so the cell size is only an index and never a decision.
//
//   (2) CONTINUE BY DIRECTION THROUGH A JUNCTION, rather than stopping at one. The
//       old rule was "exactly one unused candidate or stop", which severs every chain
//       wherever a detail line meets the outline it sits on — an exploded CAD block is
//       nothing but such meetings. Worse, where the tolerance collapsed a near-junction
//       to a single candidate it took a RIGHT-ANGLE branch as the continuation, which
//       is where the hairpin spikes came from: the chain ran out along a line, turned
//       back on itself and carried on, and no simplifier will remove a doubling-back
//       because the deviation from the straight line is large. Picking the candidate
//       that best CONTINUES the current heading traces the outline through its
//       junctions and cannot double back.
//
// The direction test CHOOSES BETWEEN candidates; it does not veto a lone one. A square
// corner is a 90deg turn with exactly one way on, and an angle limit that treats it as
// a junction severs every rectangle in the drawing — a plinth, a drawer face and a
// mattress edge each came apart into four separately-weighted pieces. The only turn
// refused outright is a REVERSAL, which is never drawing and always a stitching fault.
const EPS = 0.02;               // join tolerance, source units
const MAX_REVERSE = 160;        // degrees: past this a "continuation" doubles back
function stitch(runs) {
    const cell = (v) => Math.round(v / EPS);
    const ck = (p) => cell(p[0]) + ',' + cell(p[1]);
    const ends = new Map();                       // cell key -> [{i, s}]
    const add = (k, e) => { if (!ends.has(k)) ends.set(k, []); ends.get(k).push(e); };
    runs.forEach((r, i) => {
        add(ck(r[0]), { i, s: true });
        add(ck(r[r.length - 1]), { i, s: false });
    });
    // Every endpoint entry in the 3x3 cell neighbourhood, so a match is decided by
    // distance and never by which side of a cell edge a point landed on.
    const near = (p) => {
        const cx = cell(p[0]), cy = cell(p[1]);
        const out = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const l = ends.get((cx + dx) + ',' + (cy + dy));
            if (l) for (const e of l) out.push(e);
        }
        return out;
    };
    const used = new Array(runs.length).fill(false);
    const dist2 = (a, b) => (a[0]-b[0])*(a[0]-b[0]) + (a[1]-b[1])*(a[1]-b[1]);
    const TOL2 = EPS * EPS;
    const COS_MIN = Math.cos(MAX_REVERSE * Math.PI / 180);
    // Heading of the last real segment: the tail may repeat its neighbour after a join,
    // so walk back until the points actually differ or there is nothing left to read.
    const heading = (pts) => {
        const t = pts[pts.length - 1];
        for (let i = pts.length - 2; i >= 0; i--) {
            const dx = t[0] - pts[i][0], dy = t[1] - pts[i][1];
            const L = Math.hypot(dx, dy);
            if (L > 1e-9) return [dx / L, dy / L];
        }
        return null;
    };
    const out = [];
    const grow = (startIdx) => {
        used[startIdx] = true;
        let pts = runs[startIdx].slice();
        for (let dir = 0; dir < 2; dir++) {
            if (dir === 1) pts.reverse();
            for (;;) {
                const tail = pts[pts.length - 1];
                const hd = heading(pts);
                let best = null, bestCos = COS_MIN;
                for (const e of near(tail)) {
                    if (used[e.i]) continue;
                    const seg = runs[e.i];
                    const at = e.s ? seg[0] : seg[seg.length - 1];
                    if (dist2(at, tail) > TOL2) continue;
                    // Direction the candidate would leave the joint in.
                    const oriented = e.s ? seg : seg.slice().reverse();
                    let dv = null;
                    for (let k = 1; k < oriented.length; k++) {
                        const dx = oriented[k][0] - at[0], dy = oriented[k][1] - at[1];
                        const L = Math.hypot(dx, dy);
                        if (L > 1e-9) { dv = [dx / L, dy / L]; break; }
                    }
                    if (!dv) continue;
                    const cos = hd ? (hd[0]*dv[0] + hd[1]*dv[1]) : 1;
                    if (cos > bestCos) { bestCos = cos; best = { i: e.i, oriented }; }
                }
                if (!best) break;                 // no candidate continues this line
                used[best.i] = true;
                const seg = best.oriented;
                for (let k = 1; k < seg.length; k++) pts.push(seg[k]);
            }
        }
        out.push(pts);
    };
    // Start at real endpoints so open outlines trace whole rather than from the middle.
    runs.forEach((r, i) => {
        if (used[i]) return;
        if (near(r[0]).length === 1 || near(r[r.length-1]).length === 1) grow(i);
    });
    runs.forEach((r, i) => { if (!used[i]) grow(i); });
    return out;
}

// ── DESPIKE ──────────────────────────────────────────────────────────────
// A hairpin is a stitching artifact, never drawing: the polyline runs out along a line
// and comes straight back down it. Douglas-Peucker cannot touch one, because a spike
// deviates from the chord by a lot — which is exactly what it is looking to keep. Drop
// the apex when the turn all but reverses AND the spur is short; repeat until stable,
// since removing one apex can expose the next.
const SPIKE_COS = Math.cos(150 * Math.PI / 180);   // turn sharper than 150deg
function despike(pts, maxSpur) {
    let cur = pts;
    for (let pass = 0; pass < 4; pass++) {
        const out = [cur[0]];
        let cut = 0;
        for (let i = 1; i < cur.length - 1; i++) {
            const a = out[out.length - 1], b = cur[i], c = cur[i + 1];
            const v1 = [b[0]-a[0], b[1]-a[1]], v2 = [c[0]-b[0], c[1]-b[1]];
            const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]);
            if (l1 < 1e-9) { cut++; continue; }                 // duplicate point
            if (l2 > 1e-9) {
                const cos = (v1[0]*v2[0] + v1[1]*v2[1]) / (l1 * l2);
                if (cos < SPIKE_COS && Math.min(l1, l2) < maxSpur) { cut++; continue; }
            }
            out.push(b);
        }
        out.push(cur[cur.length - 1]);
        cur = out;
        if (!cut) break;
    }
    return cur;
}

// ── SIMPLIFY (Douglas-Peucker) ───────────────────────────────────────────
// Now that a run is a real polyline this does actual work: an arc exploded into 40 stubs
// collapses to the handful of points that carry its shape.
function rdp(pts, tol) {
    if (pts.length < 3) return pts;
    let maxD = -1, idx = 0;
    const [ax, ay] = pts[0], [bx, by] = pts[pts.length-1];
    const dx = bx-ax, dy = by-ay, len = Math.hypot(dx,dy) || 1;
    for (let i = 1; i < pts.length-1; i++) {
        const d = Math.abs((pts[i][0]-ax)*dy - (pts[i][1]-ay)*dx) / len;
        if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= tol) return [pts[0], pts[pts.length-1]];
    return rdp(pts.slice(0, idx+1), tol).slice(0, -1).concat(rdp(pts.slice(idx), tol));
}

const ds = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map(m => m[1]);
const rawRuns = [];
ds.forEach(d => flatten(d).forEach(r => rawRuns.push(r)));
const chains = stitch(rawRuns);
console.log('paths ' + ds.length + '  ->  raw runs ' + rawRuns.length + '  ->  stitched polylines ' + chains.length);

// ── CLUSTER ──────────────────────────────────────────────────────────────
const CELL = 2.2;
const cols = Math.ceil(vb[2]/CELL), rows = Math.ceil(vb[3]/CELL);
const bb = chains.map(r => { let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    r.forEach(([px,py])=>{ if(px<x0)x0=px; if(py<y0)y0=py; if(px>x1)x1=px; if(py>y1)y1=py; });
    return [x0,y0,x1,y1]; });
const grid = new Int32Array(cols*rows).fill(-1);
bb.forEach(b => { for (let cy=Math.floor(b[1]/CELL); cy<=Math.floor(b[3]/CELL); cy++)
    for (let cx=Math.floor(b[0]/CELL); cx<=Math.floor(b[2]/CELL); cx++)
      if(cx>=0&&cy>=0&&cx<cols&&cy<rows) grid[cy*cols+cx]=0; });
const lab = new Int32Array(cols*rows).fill(-1); let L=0;
for (let c=0;c<grid.length;c++){ if(grid[c]!==0||lab[c]!==-1) continue; L++; const st=[c]; lab[c]=L;
  while(st.length){ const k=st.pop(), kx=k%cols, ky=(k/cols)|0;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ const nx=kx+dx, ny=ky+dy;
      if(nx<0||ny<0||nx>=cols||ny>=rows) continue; const nk=ny*cols+nx;
      if(grid[nk]===0&&lab[nk]===-1){ lab[nk]=L; st.push(nk); } } } }
const groups = new Map();
bb.forEach((b,idx)=>{ const cx=Math.min(cols-1,Math.max(0,Math.floor(((b[0]+b[2])/2)/CELL)));
  const cy=Math.min(rows-1,Math.max(0,Math.floor(((b[1]+b[3])/2)/CELL)));
  const k=lab[cy*cols+cx]; if(k<0) return;
  if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(idx); });
const picks = [...groups.entries()].map(([k, idxs]) => {
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity, pts=0;
    idxs.forEach(i=>{ const b=bb[i]; if(b[0]<x0)x0=b[0]; if(b[1]<y0)y0=b[1]; if(b[2]>x1)x1=b[2]; if(b[3]>y1)y1=b[3]; pts+=chains[i].length; });
    return { idxs, x0, y0, w:x1-x0, h:y1-y0, pts };
}).filter(g => g.pts > 40 && g.w > 3).sort((a,b)=>(a.y0-b.y0)||(a.x0-b.x0));
console.log('drawings: ' + picks.length);

const plen = (r) => { let L=0; for(let i=1;i<r.length;i++) L+=Math.hypot(r[i][0]-r[i-1][0], r[i][1]-r[i-1][1]); return L; };
// Anything shorter than this, once the drawing is normalised to 100 wide, is trace dust
// — a leftover stub from the export that no longer joins anything. Two thirds of the
// fine layer on some of these was dust at the old 0.25 floor, and at hairline weight it
// reads as fuzz around the drawing rather than as detail. Real detail survives because
// the stitcher now runs it into the outline it belongs to instead of stranding it.
const MIN_RUN = 0.9;
const MAX_SPUR = 6;
function build(g, tol) {
    const k = 100 / g.w;
    const polys = g.idxs.map(i => despike(rdp(chains[i], tol / k), MAX_SPUR / k)
                                    .map(([x,y]) => [ (x-g.x0)*k, (y-g.y0)*k ]))
                        .filter(r => r.length > 1 && plen(r) > MIN_RUN);
    const lens = polys.map(plen).sort((a,b)=>b-a);
    const hi = lens[Math.floor(lens.length*0.08)] ?? 0;
    const mid = lens[Math.floor(lens.length*0.4)] ?? 0;
    const B = { O:[], D:[], F:[] };
    polys.forEach(r => { const L=plen(r); (L>=hi?B.O:L>=mid?B.D:B.F).push(r); });
    const toD = rs => rs.map(r => 'M' + r.map(([x,y])=>x.toFixed(1)+' '+y.toFixed(1)).join('L')).join('');
    return { h:+(g.h*k).toFixed(1), O:toD(B.O), D:toD(B.D), F:toD(B.F),
             polys: polys.length, pts: polys.reduce((a,r)=>a+r.length,0) };
}

const list = WANT.length ? WANT.map(n => ({ n, g: picks[n-1] })).filter(o=>o.g)
                         : picks.map((g,i)=>({ n:i+1, g }));
const built = list.map(o => Object.assign({ n:o.n }, build(o.g, 0.12)));
console.log('\n  #   polylines   points   bytes');
built.forEach(b => console.log('  ' + String(b.n).padStart(3) + String(b.polys).padStart(11)
    + String(b.pts).padStart(9) + String((b.O+b.D+b.F).length).padStart(8)));
fs.writeFileSync('_traced.json', JSON.stringify(built));

fs.writeFileSync('.claude/references/bed-picks-preview.html',
 '<!doctype html><meta charset="utf-8"><title>Traced beds</title>'
+'<style>body{background:#fff;font:12px system-ui,sans-serif;margin:20px;color:#222}'
+'.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}'
+'figure{margin:0;border:1px solid #ddd;border-radius:6px;padding:12px}'
+'svg{width:100%;height:200px;display:block}figcaption{margin-top:8px;text-align:center;color:#555}</style>'
+'<h2>Traced beds &mdash; stitched into polylines</h2>'
+'<p style="color:#666;max-width:72ch">Segments are now joined end-to-end before simplifying, '
+'so line weights follow whole outlines instead of individual stubs.</p><div class=g>'
+ built.map(b => '<figure><svg viewBox="0 0 100 '+b.h+'" preserveAspectRatio="xMidYMid meet">'
   +'<path d="'+b.F+'" fill="none" stroke="#4a4a4a" stroke-width="0.45" vector-effect="non-scaling-stroke"/>'
   +'<path d="'+b.D+'" fill="none" stroke="#4a4a4a" stroke-width="0.6" vector-effect="non-scaling-stroke"/>'
   +'<path d="'+b.O+'" fill="none" stroke="#4a4a4a" stroke-width="0.9" vector-effect="non-scaling-stroke"/>'
   +'</svg><figcaption><b>#'+b.n+'</b> &middot; '+b.polys+' polylines &middot; '+b.pts+' pts</figcaption></figure>').join('')
+'</div>');
console.log('\npreview -> .claude/references/bed-picks-preview.html');
