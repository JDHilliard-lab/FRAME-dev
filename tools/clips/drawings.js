// Two fictional client drawings for the help clips (nothing from a real project).
const fs = require('fs'), path = require('path');
const T = (x, y, s, txt, o) => `<text x="${x}" y="${y}" font-family="Helvetica,Arial" font-size="${s}" ${o || ''}>${txt}</text>`;
function plan() {
  const W = 2000, H = 1300; let g = '';
  const wall = (x1, y1, x2, y2, w) => g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#111" stroke-width="${w || 10}" stroke-linecap="square"/>`;
  // grid
  ['A', 'B', 'C', 'D', 'E'].forEach((l, i) => { const x = 220 + i * 360; g += `<line x1="${x}" y1="90" x2="${x}" y2="1150" stroke="#999" stroke-width="1.5" stroke-dasharray="24 8 4 8"/><circle cx="${x}" cy="62" r="24" fill="#fff" stroke="#333" stroke-width="2"/>` + T(x - 7, 70, 22, l); });
  ['1', '2', '3', '4'].forEach((l, i) => { const y = 180 + i * 310; g += `<line x1="120" y1="${y}" x2="1820" y2="${y}" stroke="#999" stroke-width="1.5" stroke-dasharray="24 8 4 8"/><circle cx="92" cy="${y}" r="24" fill="#fff" stroke="#333" stroke-width="2"/>` + T(85, y + 8, 22, l); });
  // shell
  wall(220, 180, 1660, 180, 14); wall(220, 180, 220, 1110, 14); wall(1660, 180, 1660, 1110, 14); wall(220, 1110, 1660, 1110, 14);
  // rooms
  wall(220, 490, 760, 490); wall(760, 180, 760, 420); wall(760, 560, 760, 800); wall(220, 800, 760, 800);
  wall(1120, 180, 1120, 380); wall(1120, 520, 1120, 1110); wall(1120, 800, 1660, 800);
  wall(1300, 180, 1300, 330); wall(1300, 330, 1480, 330); wall(1480, 180, 1480, 330);
  // doors
  const door = (x, y, r, a) => g += `<path d="M${x} ${y} l${r * Math.cos(a)} ${r * Math.sin(a)}" stroke="#111" stroke-width="3"/><path d="M${x + r * Math.cos(a)} ${y + r * Math.sin(a)} A ${r} ${r} 0 0 1 ${x + r * Math.cos(a + Math.PI / 2)} ${y + r * Math.sin(a + Math.PI / 2)}" fill="none" stroke="#555" stroke-width="1.5"/>`;
  door(760, 420, 120, Math.PI / 2); door(1120, 380, 130, 0); door(840, 1110, 140, -Math.PI / 2); door(1000, 1110, 140, -Math.PI);
  // furniture
  g += `<rect x="860" y="250" width="200" height="60" fill="none" stroke="#666" stroke-width="2"/>` + T(905, 290, 18, 'DESK', 'fill="#666"');
  [[380, 600], [560, 600], [1300, 560], [1480, 560]].forEach(([x, y]) => g += `<rect x="${x}" y="${y}" width="110" height="110" rx="14" fill="none" stroke="#777" stroke-width="2"/>`);
  g += `<rect x="1250" y="880" width="320" height="120" rx="60" fill="none" stroke="#777" stroke-width="2"/>`;
  g += `<rect x="1320" y="200" width="140" height="110" fill="none" stroke="#777" stroke-width="2"/><line x1="1320" y1="200" x2="1460" y2="310" stroke="#777"/><line x1="1460" y1="200" x2="1320" y2="310" stroke="#777"/>`;
  // room tags
  const tag = (x, y, n, num) => g += `<rect x="${x - 95}" y="${y - 30}" width="190" height="62" fill="#fff" stroke="#333" stroke-width="1.5"/>` + T(x - 85, y - 4, 20, n, 'font-weight="700"') + T(x - 85, y + 22, 16, num);
  tag(490, 330, 'LOUNGE', '1C010'); tag(940, 650, 'LOBBY', '1C001'); tag(490, 940, 'BUSINESS CTR', '1C012'); tag(1390, 460, 'RESTAURANT', '1C020'); tag(1390, 1050, 'BAR', '1C024'); tag(1390, 262, 'ELEV', '1E01');
  // title
  g += `<rect x="1700" y="1150" width="280" height="130" fill="#fff" stroke="#111" stroke-width="2"/>` + T(1712, 1182, 17, 'TIDELINE HOTEL', 'font-weight="700"') + T(1712, 1208, 15, 'LEVEL 01 FLOOR PLAN') + T(1712, 1234, 13, 'SCALE 1/8" = 1\'-0"') + T(1712, 1266, 30, 'A-101', 'font-weight="700"');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${g}</svg>`;
}
function elevSheet() {
  const W = 2400, H = 1600, F = 40; // 40 px per foot (1/2" = 1'-0" at print)
  let g = '';
  const elev = (ox, oy, wFt, hFt, title, num, extra) => {
    const w = wFt * F, h = hFt * F;
    g += `<rect x="${ox}" y="${oy - h}" width="${w}" height="${h}" fill="none" stroke="#111" stroke-width="3"/>`;
    g += `<line x1="${ox - 40}" y1="${oy}" x2="${ox + w + 40}" y2="${oy}" stroke="#111" stroke-width="6"/>`;
    g += `<line x1="${ox}" y1="${oy - 6}" x2="${ox + w}" y2="${oy - 6}" stroke="#444" stroke-width="2"/>`;
    // dims
    const dy = oy + 60;
    g += `<line x1="${ox}" y1="${dy}" x2="${ox + w}" y2="${dy}" stroke="#111" stroke-width="1.5"/>`;
    [ox, ox + w].forEach(x => g += `<line x1="${x}" y1="${oy + 12}" x2="${x}" y2="${dy + 14}" stroke="#111" stroke-width="1.2"/><line x1="${x - 9}" y1="${dy + 9}" x2="${x + 9}" y2="${dy - 9}" stroke="#111" stroke-width="2.5"/>`);
    g += T(ox + w / 2 - 34, dy - 10, 24, `${wFt}'-0"`);
    const dx = ox - 70;
    g += `<line x1="${dx}" y1="${oy}" x2="${dx}" y2="${oy - h}" stroke="#111" stroke-width="1.5"/>`;
    [oy, oy - h].forEach(y => g += `<line x1="${dx - 14}" y1="${y}" x2="${ox - 12}" y2="${y}" stroke="#111" stroke-width="1.2"/><line x1="${dx - 9}" y1="${y + 9}" x2="${dx + 9}" y2="${y - 9}" stroke="#111" stroke-width="2.5"/>`);
    g += `<text x="${dx - 12}" y="${oy - h / 2 + 30}" font-family="Helvetica,Arial" font-size="24" transform="rotate(-90 ${dx - 12} ${oy - h / 2 + 30})">${hFt}'-0"</text>`;
    g += extra(ox, oy, F);
    g += `<circle cx="${ox + 30}" cy="${oy + 140}" r="30" fill="#fff" stroke="#111" stroke-width="2.5"/>` + T(ox + 21, oy + 150, 26, num, 'font-weight="700"');
    g += T(ox + 78, oy + 140, 26, title, 'font-weight="700"') + T(ox + 78, oy + 168, 18, 'SCALE: 1/2" = 1\'-0"');
  };
  elev(220, 760, 16, 10, 'LOBBY NORTH WALL', '1', (ox, oy, F) =>
    `<rect x="${ox + 13.5 * F}" y="${oy - 7 * F}" width="${2.5 * F - 3}" height="${7 * F}" fill="#fff" stroke="#111" stroke-width="2.5"/><line x1="${ox + 13.5 * F}" y1="${oy - 7 * F}" x2="${ox + 16 * F - 3}" y2="${oy - 3.5 * F}" stroke="#777" stroke-dasharray="10 6"/>` +
    `<rect x="${ox + 2 * F}" y="${oy - 2.6 * F}" width="${8 * F}" height="${2.6 * F}" fill="#f4f4f4" stroke="#333" stroke-width="2"/>` + T(ox + 5.2 * F, oy - 1.1 * F, 18, 'CREDENZA', 'fill="#555"') +
    `<line x1="${ox}" y1="${oy - 9.2 * F}" x2="${ox + 13.5 * F}" y2="${oy - 9.2 * F}" stroke="#999" stroke-width="1.5" stroke-dasharray="14 6"/>` + T(ox + 4 * F, oy - 9.35 * F, 15, 'SOFFIT ABOVE', 'fill="#777"'));
  elev(1180, 760, 12, 10, 'LOBBY EAST WALL', '2', (ox, oy, F) =>
    `<rect x="${ox + 1 * F}" y="${oy - 8 * F}" width="${4 * F}" height="${8 * F}" fill="#fff" stroke="#111" stroke-width="2.5"/><rect x="${ox + 7 * F}" y="${oy - 8.5 * F}" width="${4 * F}" height="${5 * F}" fill="#eef3f6" stroke="#111" stroke-width="2.5"/>` + T(ox + 7.4 * F, oy - 5.8 * F, 16, 'WINDOW', 'fill="#555"'));
  elev(220, 1380, 20, 10, 'BAR WALL', '3', (ox, oy, F) =>
    `<rect x="${ox}" y="${oy - 3.5 * F}" width="${20 * F}" height="${3.5 * F}" fill="#f4f4f4" stroke="#333" stroke-width="2"/>` + T(ox + 9 * F, oy - 1.5 * F, 18, 'BAR DIE', 'fill="#555"') +
    [0, 1, 2, 3].map(i => `<rect x="${ox + (1.5 + i * 4.5) * F}" y="${oy - 8.6 * F}" width="${3 * F}" height="${1.4 * F}" fill="none" stroke="#666" stroke-width="2"/>`).join(''));
  // title block
  g += `<rect x="2050" y="40" width="320" height="1520" fill="none" stroke="#111" stroke-width="3"/>` + T(2070, 90, 22, 'TIDELINE HOTEL', 'font-weight="700"') + T(2070, 120, 17, 'INTERIOR ELEVATIONS') + T(2070, 150, 15, 'LEVEL 01 PUBLIC AREAS') + T(2070, 1490, 52, 'A-401', 'font-weight="700"') + T(2070, 1530, 14, 'FOR COORDINATION ONLY');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${g}</svg>`;
}
const dir = path.join(__dirname, 'assets'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'PLAN.TIDE.L1_A-101.svg'), plan());
fs.writeFileSync(path.join(dir, 'ELEV.TIDE.L1_A-401.svg'), elevSheet());
// render to PNG with the driver's Chrome
const { open, STATE } = require('./rec.js');
(async () => {
  const c = await open(1280, 800);
  for (const [n, w, h] of [['PLAN.TIDE.L1_A-101', 2000, 1300], ['ELEV.TIDE.L1_A-401', 2400, 1600]]) {
    const svg = fs.readFileSync(path.join(dir, n + '.svg'), 'utf8');
    const url = await c.s.ev(`(async () => { const i = new Image(); i.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))}; await i.decode(); const cv = document.createElement('canvas'); cv.width = ${w}; cv.height = ${h}; cv.getContext('2d').drawImage(i, 0, 0); return cv.toDataURL('image/png'); })()`);
    fs.writeFileSync(path.join(dir, n + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log('ok'); process.exit(0);
})();
