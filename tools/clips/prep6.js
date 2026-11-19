// The deck clip's start: the triptych specced, pinned and hung evenly (Deck Studio, Pages).
const prep4 = require('./prep4.js');
module.exports = async function prep6(c) {
  await prep4(c);
  const r = await c.s.ev(`(() => {
    elevFrames.forEach(f => f.selected = false);
    document.getElementById('alignGapValue').value = 6; applyAutoSpace(); alignToHangHeight(); centerGroupOnWall();
    try { closeAlignmentDialog(); } catch (e) {}
    switchView('deck'); _dsTab('pages'); _dsPages = _deckPageList(); _dsSelectPage(0);
    return _dsPages.map(d => d.kind + ':' + (d.title || d.type || '')).join(' | ');
  })()`);
  console.log('prep6', r);
};
