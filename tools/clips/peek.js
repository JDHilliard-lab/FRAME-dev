// peek.js <video.webm> <out.png> <seconds...>: frames from a finished video, drawn by Chrome
const fs = require('fs'), path = require('path');
const { open, STATE } = require('./rec.js');
(async () => {
  const [vid, out, ...ts] = process.argv.slice(2);
  const c = await open(1280, 800);
  const t = await c.s.cdp('Target.createTarget', { url: STATE.app + '/__file?p=' + encodeURIComponent(path.join(__dirname, 'encoder.html')) });
  await new Promise(r => setTimeout(r, 1000));
  const rec = require('./rec.js');
  const fsx = require('os');
  const list = await (await fetch('http://127.0.0.1:' + (await (async () => { const p = fs.readdirSync(fsx.tmpdir()).filter(d => d.startsWith('frame-chrome-')).map(d => path.join(fsx.tmpdir(), d)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]; return parseInt(fs.readFileSync(path.join(p, 'DevToolsActivePort'), 'utf8').split('\n')[0], 10); })()) + '/json')).json();
  const tg = list.find(x => x.id === t.result.targetId);
  const ws = new WebSocket(tg.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const w = {}; ws.onmessage = m => { const d = JSON.parse(m.data); if (w[d.id]) { w[d.id](d); delete w[d.id]; } };
  const ev = e => new Promise(r => { const i = ++id; w[i] = d => r(d.result && d.result.result && d.result.result.value); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: e, awaitPromise: true, returnByValue: true } })); });
  const url = STATE.app + '/__file?p=' + encodeURIComponent(path.resolve(vid));
  const urls = await ev(`(async () => { const v = document.createElement('video'); v.muted = true; v.src = ${JSON.stringify(url)}; await new Promise(r => v.onloadeddata = r);
    const out = []; for (const s of ${JSON.stringify(ts.map(Number))}) { v.currentTime = s; await new Promise(r => v.onseeked = r); const c = document.createElement('canvas'); c.width = v.videoWidth / 2; c.height = v.videoHeight / 2; c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); out.push(c.toDataURL('image/jpeg', .8)); }
    return out; })()`);
  urls.forEach((u, i) => fs.writeFileSync(out.replace(/\.(png|jpg)$/, '') + '_' + i + '.jpg', Buffer.from(u.split(',')[1], 'base64')));
  await c.s.cdp('Target.closeTarget', { targetId: t.result.targetId });
  console.log('ok', urls.length); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
