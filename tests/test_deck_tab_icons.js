// 19.49: Deck Studio's Project / Pages / Templates tabs and the right panel's Page /
// Templates / Layers tabs are icons (the phone's glyphs), each keeping its name as title +
// aria-label. And the right panel's pinned header sits flush under the tabs: the panel's
// top padding scrolled with its content, so a band of scrolled content showed between the
// tabs and the pinned "Presentation layout" header.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
const results = [];
const check = (label, fn) => { try { fn(); results.push([label, true]); } catch (e) { results.push([label, false, e.message]); } };
const btn = (id) => { const i = html.indexOf('id="' + id + '"'); if (i < 0) throw new Error(id + ' missing'); const a = html.lastIndexOf('<button', i); return html.slice(a, html.indexOf('</button>', i) + 9); };

[['dsTabBtnProject', 'Project'], ['dsTabBtnPages', 'Pages'], ['dsTabBtnTemplates', 'Templates'],
 ['dsToolsBtnPage', 'Page'], ['dsToolsBtnTemplates', 'Templates'], ['dsToolsBtnLayers', 'Layers']].forEach(([id, name]) => {
  check(id + ' is an icon that still says ' + name, () => {
    const b = btn(id);
    if (b.indexOf('<svg') < 0) throw new Error('no icon');
    if (b.indexOf('frame-tab-icon') < 0 || b.indexOf('frame-tab') < 0) throw new Error('not an icon tab');
    if (b.indexOf('aria-label="' + name + '"') < 0) throw new Error('no aria-label');
    if (b.indexOf('title="' + name + ':') < 0) throw new Error('no tooltip naming it');
    const text = b.replace(/<svg[\s\S]*?<\/svg>/, '').replace(/<[^>]+>/g, '').trim();
    if (text) throw new Error('still carries the word: ' + text);
  });
});
check('the icon tabs are styled', () => {
  if (css.indexOf('.frame-tab.frame-tab-icon {') < 0 || css.indexOf('.frame-tab-icon svg {') < 0) throw new Error('missing rules');
});
check('EXACT BUG: the panel body has no top padding to scroll through; a spacer keeps the gap', () => {
  const i = html.indexOf('id="dsToolsPageBody"');
  const tag = html.slice(i, html.indexOf('>', i));
  if (tag.indexOf('padding:0 16px 16px') < 0) throw new Error('the top padding is back: ' + tag);
  if (css.indexOf('#dsToolsPageBody::before {') < 0) throw new Error('no spacer');
});
let bad = 0;
results.forEach(([l, ok, e]) => { console.log((ok ? 'OK:   ' : 'FAIL: ') + l + (ok ? '' : ' -> ' + e)); if (!ok) bad++; });
console.log('\n--- Summary ---');
console.log(bad ? bad + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad ? 1 : 0);
