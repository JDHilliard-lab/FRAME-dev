// 19.26: FRAME OPENS WITH NO SIGNAL. sw.js keeps a copy on the device: the page network
// first, versioned app files cache first (and an old version's copies dropped when a new
// page arrives), everything else stale-while-revalidate with a cap. These checks run the
// real sw.js against a fake Cache Storage and a fake network.
// No regex: patterns written into a test file here lose their backslashes.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const SW = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const NL = String.fromCharCode(10);
const results = [];
const check = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

function makeWorld(scope, files) {
  const stores = new Map();
  const keyOf = (r) => (typeof r === 'string' ? r : r.url);
  const cacheFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      match: async (r) => { const v = m.get(keyOf(r)); return v ? v.clone() : undefined; },
      put: async (r, res) => { m.delete(keyOf(r)); m.set(keyOf(r), res); },
      delete: async (r) => m.delete(keyOf(r)),
      keys: async () => Array.from(m.keys()).map(u => ({ url: u }))
    };
  };
  const world = { online: true, files: files, fetched: [] };
  const caches = {
    open: async (n) => cacheFor(n),
    keys: async () => Array.from(stores.keys()),
    delete: async (n) => stores.delete(n)
  };
  const fetchFn = async (r) => {
    const u = keyOf(r);
    world.fetched.push(u);
    if (!world.online) throw new TypeError('offline');
    const body = world.files[u];
    if (body == null) return new Response('nope', { status: 404 });
    return new Response(body, { status: 200 });
  };
  const handlers = {};
  const self = {
    registration: { scope },
    addEventListener: (t, fn) => { handlers[t] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} }
  };
  const ctx = vm.createContext({ self, caches, fetch: fetchFn, Response, Request, URL, Promise, console });
  vm.runInContext(SW, ctx);
  world.stores = stores; world.handlers = handlers; world.caches = caches;
  world.install = () => new Promise((ok, no) => handlers.install({ waitUntil: (p) => p.then(ok, no) }));
  world.activate = () => new Promise((ok, no) => handlers.activate({ waitUntil: (p) => p.then(ok, no) }));
  world.get = (url, mode) => new Promise((ok) => {
    let responded = false;
    handlers.fetch({ request: { url, method: 'GET', mode: mode || 'no-cors' }, respondWith: (p) => { responded = true; p.then(ok, () => ok(null)); } });
    if (!responded) ok('passthrough');
  });
  return world;
}
const S = 'https://x.github.io/FRAME-dev/';
const page = (v) => '<link href="style.css?v=' + v + '"><script src="templates.js?v=' + v + '"></script><script src="app.js?v=' + v + '"></script>';
const filesFor = (v) => {
  const f = {};
  f[S] = page(v);
  ['style.css', 'templates.js', 'app.js'].forEach(n => { f[S + n + '?v=' + v] = n + ' ' + v; });
  ['lib-jspdf.min.js', 'lib-jszip.min.js', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png', 'favicon.png', 'Frame_logo_light.svg', 'Frame_logo_Dark.svg']
    .forEach(n => { f[S + n] = n; });
  f[S + 'library/manifest.json'] = '{"v":1}';
  return f;
};
const text = async (r) => (r && r !== 'passthrough' ? await r.text() : String(r));

(async () => {
  await check('install keeps the page, its own versioned app files and the vendored libraries', async () => {
    const w = makeWorld(S, filesFor('19.26'));
    await w.install(); await w.activate();
    const shell = w.stores.get('frame-shell::' + S);
    ['', 'app.js?v=19.26', 'templates.js?v=19.26', 'style.css?v=19.26', 'lib-jspdf.min.js'].forEach(p => {
      if (!shell.has(S + p)) throw new Error('not kept: ' + (p || 'the page'));
    });
  });

  await check('EXACT ASK: with no signal the page and the app still load from the device', async () => {
    const w = makeWorld(S, filesFor('19.26'));
    await w.install(); await w.activate();
    w.online = false;
    const html = await text(await w.get(S, 'navigate'));
    if (html.indexOf('app.js?v=19.26') < 0) throw new Error('offline page: ' + html);
    if ((await text(await w.get(S + 'app.js?v=19.26'))) !== 'app.js 19.26') throw new Error('offline app.js missing');
  });

  await check('with signal the page is always fetched fresh (a release still arrives)', async () => {
    const w = makeWorld(S, filesFor('19.26'));
    await w.install(); await w.activate();
    w.files = filesFor('19.27');
    const html = await text(await w.get(S, 'navigate'));
    if (html.indexOf('app.js?v=19.27') < 0) throw new Error('served a cached page while online');
  });

  await check('a new version brings its files and drops the old version (page and app stay a pair)', async () => {
    const w = makeWorld(S, filesFor('19.26'));
    await w.install(); await w.activate();
    w.files = filesFor('19.27');
    await w.get(S, 'navigate');
    await new Promise(r => setTimeout(r, 30));   // the background adopt
    const shell = w.stores.get('frame-shell::' + S);
    if (!shell.has(S + 'app.js?v=19.27')) throw new Error('new app.js not fetched ahead of going offline');
    if (shell.has(S + 'app.js?v=19.26') || shell.has(S + 'style.css?v=19.26')) throw new Error('old version left behind');
    w.online = false;
    const html = await text(await w.get(S, 'navigate'));
    if (html.indexOf('19.27') < 0) throw new Error('offline page is not the newest one seen');
  });

  await check('everything else answers from the device at once and refreshes behind', async () => {
    const w = makeWorld(S, filesFor('19.26'));
    await w.install(); await w.activate();
    const u = S + 'library/manifest.json';
    await w.get(u); await new Promise(r => setTimeout(r, 10));
    w.files[u] = '{"v":2}';
    const first = await text(await w.get(u));
    if (first !== '{"v":1}') throw new Error('not answered from the cache: ' + first);
    await new Promise(r => setTimeout(r, 10));
    const second = await text(await w.get(u));
    if (second !== '{"v":2}') throw new Error('never refreshed: ' + second);
  });

  await check('the browsing cache is capped (a long library browse cannot fill a phone)', async () => {
    const m = SW.indexOf('const RUNTIME_MAX = ');
    const max = parseInt(SW.slice(m + 20, m + 30), 10);
    if (!(max > 100 && max <= 3000)) throw new Error('RUNTIME_MAX is ' + max);
    const w = makeWorld(S, filesFor('19.26'));
    await w.install(); await w.activate();
    for (let i = 0; i < max + 25; i++) { w.files[S + 'library/c' + i + '.png'] = 'x'; await w.get(S + 'library/c' + i + '.png'); }
    await new Promise(r => setTimeout(r, 30));
    const run = w.stores.get('frame-run::' + S);
    if (run.size > max) throw new Error(run.size + ' entries kept, cap ' + max);
    if (run.has(S + 'library/c0.png')) throw new Error('the cap dropped the newest instead of the oldest');
  });

  // 19.59, "sometimes the switch is instant and sometimes it is delayed from 30-60 seconds":
  // a new library file waited for the cache to be stored AND trimmed (keys() over ~1500
  // entries, deletes one at a time) before the page got it, and a frame-browser scroll
  // starts hundreds of those at once.
  await check('EXACT BUG: a new library file is answered at once, not after the cache is stored and trimmed', async () => {
    const w = makeWorld(S, filesFor('19.26'));
    await w.install(); await w.activate();
    const orig = w.caches.open;
    w.caches.open = async (n) => {
      const c = await orig(n);
      const k = c.keys, p = c.put;
      c.keys = async () => { await new Promise(r => setTimeout(r, 400)); return k(); };
      c.put = async (a, b) => { await new Promise(r => setTimeout(r, 400)); return p(a, b); };
      return c;
    };
    const u = S + 'library/michelangelo/a/swatch.png';
    w.files[u] = 'SWATCH';
    const t0 = Date.now();
    const body = await text(await w.get(u));
    const ms = Date.now() - t0;
    if (body !== 'SWATCH') throw new Error('wrong body: ' + body);
    if (ms > 150) throw new Error('the page waited ' + ms + 'ms for the cache');
    await new Promise(r => setTimeout(r, 1000));
    if (!w.stores.get('frame-run::' + S).has(u)) throw new Error('the copy was never stored');
  });

  await check('dev and stable never share a cache (one origin, two folders)', async () => {
    const dev = makeWorld(S, filesFor('19.26'));
    const stab = makeWorld('https://x.github.io/FRAME/', {});
    dev.caches = stab.caches;   // same origin = one Cache Storage
    await dev.install();
    const stores = Array.from(dev.stores.keys());
    if (!stores.every(n => n.indexOf('::' + S) > 0)) throw new Error('cache named without its scope: ' + stores.join(', '));
  });

  await check('posts, other sites and the browser extension schemes are left alone', async () => {
    const w = makeWorld(S, filesFor('19.26'));
    let r = 'none';
    w.handlers.fetch({ request: { url: S + 'x', method: 'POST', mode: 'cors' }, respondWith: () => { r = 'took'; } });
    if (r !== 'none') throw new Error('a POST was answered');
    if ((await w.get('https://example.com/a.js')) !== 'passthrough') throw new Error('another site was cached');
  });

  await check('app.js registers it only where it can run, and ?nosw removes it', async () => {
    const at = APP.indexOf('function _swRegister()');
    const body = APP.slice(at, APP.indexOf(NL + '_swRegister();', at));
    if (at < 0 || body.length < 50) throw new Error('no _swRegister');
    if (body.indexOf("location.protocol !== 'https:'") < 0) throw new Error('not limited to https / localhost');
    if (body.indexOf('unregister()') < 0) throw new Error('no ?nosw way out');
    if (APP.indexOf(NL + '_swRegister();') < 0) throw new Error('never called');
  });

  let fail = 0;
  results.forEach(r => { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ': ' + r.err)); if (!r.ok) fail++; });
  console.log(NL + '--- Summary ---');
  console.log(fail ? fail + ' FAILED of ' + results.length : 'ALL PASSED (' + results.length + ')');
  setTimeout(() => process.exit(fail ? 1 : 0), 50);
})();
