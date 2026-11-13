// FARMHAND (20.43). The tool's logo changed from FRAME to FARMHAND, and the designer
// supplied only a DARK drawing. Both the start screen and the header now draw that one
// drawing inline in currentColor, so a theme switch recolours it; there is no white
// copy to keep in step. The start screen also shows a quote that fades in ABOVE the logo.
//
// Checks: the header holds the inline logo (not the old FRAME <img> pair) with no
// fixed fill anywhere; its colour comes from a theme token; the quote is in the start
// screen, before the logo, with its own fade and a reduced-motion override.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const NL = String.fromCharCode(10);

let failed = 0;
let passed = 0;
const ok = (label) => { passed++; console.log('  ok   ' + label); };
const bad = (label, why) => { failed++; console.log('  FAIL ' + label + ': ' + why); };

(async () => {
    const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'dangerously' });
    const { window } = dom;
    window.HTMLCanvasElement.prototype.getContext = () => ({});
    window.fetch = () => Promise.reject(new Error('no network in test'));
    console.warn = () => {};
    const quiet = console.error; console.error = () => {};
    window.eval(APP + NL + 'try { _autosaveToldUser = true; } catch (e) {}' + NL
        + 'window.__start = () => openStartScreen();');
    console.error = quiet;
    const doc = window.document;

    // 1. Header: the inline logo, nine parts, no old image files, no fixed fill.
    const nav = doc.getElementById('navLogo');
    const svg = nav && nav.querySelector('svg');
    if (!svg) bad('header logo', 'no inline svg in #navLogo');
    else {
        const parts = svg.querySelectorAll('path');
        if (parts.length !== 9) bad('header logo', parts.length + ' parts, expected 9 (mark + FARMHAND)');
        else if ([...svg.querySelectorAll('*')].some(el => el.hasAttribute('fill') || /fill\s*:/.test(el.getAttribute('style') || '')))
            bad('header logo', 'a part carries its own fill, so it would not follow the theme');
        else ok('header draws the Farmhand logo inline, nine parts, no fixed fill');
    }
    if (doc.querySelector('.nav-brand img')) bad('header images', 'an <img> logo is still in the header');
    else ok('the FRAME logo images are gone from the header');

    // 2. Colour comes from a theme token, the shape from currentColor.
    if (CSS.indexOf('.nav-logo { display: flex; align-items: center; color: var(--text-strong); }') < 0)
        bad('header colour', '.nav-logo does not take --text-strong');
    else if (CSS.indexOf('.nav-logo-svg {') < 0 || CSS.split('.nav-logo-svg {')[1].split('}')[0].indexOf('fill: currentColor') < 0)
        bad('header colour', '.nav-logo-svg is not filled with currentColor');
    else ok('the header logo is coloured by the theme');

    // 3. The start screen: quote first, then the logo.
    try { await window.__start(); } catch (e) { bad('start screen', 'openStartScreen threw: ' + e.message); }
    const wrap = doc.querySelector('#startScreen .ss-wrap');
    const q = wrap && wrap.querySelector('.ss-quote');
    const logo = wrap && wrap.querySelector('.ss-logo');
    if (!q || !logo) bad('quote', 'start screen is missing the quote or the logo');
    else {
        const txt = q.textContent;
        if (txt.indexOf('Many hands make light work') < 0 || txt.indexOf('Thomas Gordon Towers') < 0) bad('quote', 'wrong words: ' + txt);
        else if (!(q.compareDocumentPosition(logo) & window.Node.DOCUMENT_POSITION_FOLLOWING)) bad('quote', 'the quote is not above the logo');
        else if (txt.indexOf('—') >= 0) bad('quote', 'an em dash crept into the attribution');
        else ok('the quote sits above the logo with its attribution');
        // 20.44: the attribution is a separate line, in normal case, after an en dash, set right.
        const cap = q.querySelector('figcaption');
        const capRule = (CSS.split('.ss-quote figcaption {')[1] || '').split('}')[0];
        if (!cap || cap.textContent !== '\u2013 Thomas Gordon Towers') bad('attribution', 'expected an en dash then the name, found: ' + (cap && cap.textContent));
        else if (capRule.indexOf('text-transform: uppercase') >= 0 || capRule.indexOf('text-align: right') < 0) bad('attribution', 'not in normal case, set right');
        else ok('the attribution is a dash and the name, in normal case, set right');
        // The quote is set larger than the logo: its size is display-sized, never a small UI rung.
        const qb = (CSS.split('.ss-quote blockquote {')[1] || '').split('}')[0];
        if (qb.indexOf('font-size: min(46px, 6.6vw)') < 0 || qb.indexOf('white-space: nowrap') < 0) bad('quote size', 'the quote is no longer display-sized on one line');
        else ok('the quote is display-sized on one line');
        if (logo.querySelectorAll('path').length !== 9 || logo.getAttribute('aria-label') !== 'Farmhand') bad('start logo', 'the start screen logo is not the Farmhand drawing');
        else ok('the start screen draws the Farmhand logo');
    }

    // 4. The quote fades in, and holds still for reduced motion.
    const qRule = CSS.split('.ss-quote {')[1] || '';
    if (qRule.split('}')[0].indexOf('animation: ssQuote') < 0 || CSS.indexOf('@keyframes ssQuote') < 0) bad('quote fade', 'no fade-in animation on .ss-quote');
    else {
        const rm = CSS.split('prefers-reduced-motion: reduce')[1] || '';
        if (rm.split('}')[0].indexOf('.ss-quote') < 0) bad('quote fade', 'reduced motion does not stop the quote animation');
        else ok('the quote fades in, and appears at once for reduced motion');
    }

    // 5. 20.45: the tour link stands out: a button with a play mark that pulses, then rests.
    const tour = doc.querySelector('#startScreen .ss-tour');
    const tr = (CSS.split('.ss-tour {')[1] || '').split('}')[0];
    if (!tour || !tour.querySelector('svg') || tour.textContent.indexOf('New to Farmhand?') < 0) bad('tour button', 'no play mark or wrong words: ' + (tour && tour.textContent));
    else if (tr.indexOf('animation: ssTourPulse') < 0 || / 3;/.test(tr) === false) bad('tour button', 'the pulse is missing or does not stop after a few rings');
    else if ((CSS.split('@media (prefers-reduced-motion: reduce) { .ss-tour')[1] || '').indexOf('animation: none') < 0) bad('tour button', 'reduced motion does not stop the pulse');
    else ok('the tour button carries a play mark and pulses three times, still for reduced motion');

    // 6. 20.45: the name people read is Farmhand: tab, home-screen app, manifest.
    const MAN = fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8');
    if (HTML.indexOf('<title>Farmhand</title>') < 0) bad('rename', 'the browser tab title is not Farmhand');
    else if (HTML.indexOf('apple-mobile-web-app-title" content="Farmhand"') < 0) bad('rename', 'the home-screen app is not named Farmhand');
    else if (JSON.parse(MAN).name !== 'Farmhand' || JSON.parse(MAN).short_name !== 'Farmhand') bad('rename', 'the manifest still names the old app');
    else ok('the tab, the home-screen app and the manifest say Farmhand');
    // Any quoted UI string that still says FRAME as the product name. Allowed: URLs and repo
    // names, the picture-frame terms (FRAME SET, FRAME SAMPLES), the studio's FRAME file code in the
    // Coding cheat sheet (FRAME.FRAME CODE.SUBJECT), and the old What's New history.
    const wn0 = APP.indexOf("title: `What's new`"), wn1 = APP.indexOf("title: 'Reporting issues'");
    const appNow = APP.slice(0, wn0) + APP.slice(wn1);
    const left = appNow.split(String.fromCharCode(10)).filter(l => {
        const s = l.trim();
        if (s.indexOf('//') === 0 || s.indexOf('*') === 0 || s.indexOf('/*') === 0) return false;
        const code = l.split(' // ')[0];
        return /(^|[^\w\/\-.])FRAME(?![\w\-\/]| SET| SAMPLES|<\/strong>\.FRAME CODE)/.test(code);
    });
    if (left.length) bad('rename', left.length + ' UI string(s) still say FRAME, e.g. ' + left[0].trim().slice(0, 120));
    else ok('no UI string still calls the app FRAME');

    console.log(failed ? 'FAILED ' + failed : 'ALL PASSED (' + passed + ')');
    process.exit(failed ? 1 : 0);
})();
