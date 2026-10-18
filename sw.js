// FRAME OFFLINE (19.26). The home-screen app downloaded ~4 MB every time it opened, so
// on a site with no signal it did not open at all. This keeps a copy on the device.
//
// One file serves both sites (two sites, one tree): the scope is this folder, so dev
// (/FRAME-dev/) and stable (/FRAME/) get their own caches, named after the scope.
//
//   The PAGE (a navigation) is NETWORK FIRST: every load still gets the newest index.html
//   when there is signal, so a release reaches people as before; offline, the last copy.
//   VERSIONED app files (style.css?v=, templates.js?v=, app.js?v=) are CACHE FIRST: the
//   query is the version, so a cached copy can never be stale. When a page arrives naming
//   a new version, its files are fetched in the background and the old version's copies
//   are dropped (so a cached index.html always has its matching app.js beside it, which
//   is what _checkBuildPairing checks).
//   EVERYTHING ELSE (the frame library, fonts, swatches, the CDN scripts) is STALE WHILE
//   REVALIDATE: answered from the cache at once, refreshed in the background, capped at
//   RUNTIME_MAX entries (oldest dropped first) so a long library browse cannot fill a phone.
// Nothing here touches project data: autosaves and backups live in IndexedDB.
// To remove it from a device, open the app with ?nosw (app.js unregisters it).
const SCOPE = self.registration ? self.registration.scope : 'frame';
const SHELL = 'frame-shell::' + SCOPE;
const RUNTIME = 'frame-run::' + SCOPE;
const RUNTIME_MAX = 1500;
const STATIC = ['./', 'lib-jspdf.min.js', 'lib-jszip.min.js', 'manifest.webmanifest',
    'icon-180.png', 'icon-512.png', 'favicon.png', 'Frame_logo_light.svg', 'Frame_logo_Dark.svg'];
const VERSIONED = ['style.css', 'templates.js', 'app.js'];

// The versioned file URLs a page names, e.g. ['app.js?v=19.26', ...].
function versionedRefs(html) {
    const out = [];
    VERSIONED.forEach(name => {
        const at = html.indexOf(name + '?v=');
        if (at < 0) return;
        let end = at + name.length + 3;
        while (end < html.length && '0123456789.'.indexOf(html[end]) >= 0) end++;
        out.push(html.slice(at, end));
    });
    return out;
}
function isVersioned(url) {
    const u = new URL(url);
    return u.searchParams.has('v') && VERSIONED.some(n => u.pathname.endsWith('/' + n));
}
async function putQuiet(cache, req, res) {
    try { if (res && (res.ok || res.type === 'opaque')) await cache.put(req, res); } catch (e) {}
}
// Fetch a page's versioned files into the shell, then drop every OTHER version of them.
async function adoptVersion(html) {
    const cache = await caches.open(SHELL);
    const refs = versionedRefs(html);
    const want = refs.map(r => new URL(r, SCOPE).href);
    await Promise.all(want.map(async (href) => {
        if (await cache.match(href)) return;
        try { await putQuiet(cache, href, await fetch(href)); } catch (e) {}
    }));
    if (want.length !== VERSIONED.length) return;   // a page that names fewer: prune nothing
    const keys = await cache.keys();
    await Promise.all(keys.map(k => (isVersioned(k.url) && want.indexOf(k.url) < 0) ? cache.delete(k) : null));
}
async function trimRuntime(cache) {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - RUNTIME_MAX; i++) await cache.delete(keys[i]);
}

async function onInstall() {
    const cache = await caches.open(SHELL);
    await Promise.all(STATIC.map(async (p) => {
        try { await putQuiet(cache, new URL(p, SCOPE).href, await fetch(new URL(p, SCOPE).href, { cache: 'no-store' })); } catch (e) {}
    }));
    try {
        const idx = await cache.match(new URL('./', SCOPE).href);
        if (idx) await adoptVersion(await idx.clone().text());
    } catch (e) {}
    if (self.skipWaiting) await self.skipWaiting();
}
async function onActivate() {
    // Caches from an older layout of THIS scope (never another site's).
    const names = await caches.keys();
    await Promise.all(names.map(n => (n.endsWith('::' + SCOPE) && n !== SHELL && n !== RUNTIME) ? caches.delete(n) : null));
    if (self.clients && self.clients.claim) await self.clients.claim();
}
async function onNavigate(req) {
    const cache = await caches.open(SHELL);
    try {
        const res = await fetch(req);
        if (res && res.ok) {
            await putQuiet(cache, new URL('./', SCOPE).href, res.clone());
            res.clone().text().then(adoptVersion).catch(() => {});
        }
        return res;
    } catch (e) {
        return (await cache.match(new URL('./', SCOPE).href)) || (await cache.match(req)) || Response.error();
    }
}
async function onVersioned(req) {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    await putQuiet(cache, req, res.clone());
    return res;
}
async function onRuntime(req) {
    const cache = await caches.open(RUNTIME);
    const shell = await (await caches.open(SHELL)).match(req);
    const hit = shell || await cache.match(req);
    const update = fetch(req).then(async (res) => {
        if (!shell) { await putQuiet(cache, req, res.clone()); await trimRuntime(cache); }
        return res;
    });
    if (hit) { update.catch(() => {}); return hit; }
    return update;
}
function onFetch(event) {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (req.mode === 'navigate') { event.respondWith(onNavigate(req)); return; }
    const sameScope = req.url.indexOf(SCOPE) === 0;
    if (sameScope && isVersioned(req.url)) { event.respondWith(onVersioned(req)); return; }
    // This site's own files, plus the fonts and CDN scripts the page loads.
    const cdn = /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)$/.test(url.hostname);
    if (sameScope || cdn) event.respondWith(onRuntime(req));
}

self.addEventListener('install', (e) => e.waitUntil(onInstall()));
self.addEventListener('activate', (e) => e.waitUntil(onActivate()));
self.addEventListener('fetch', onFetch);
