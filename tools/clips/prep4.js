// The wall clip's start: the triptych specced (24 x 30, walnut, three artworks) but hung
// unevenly, so spacing and hang height have something to fix. Made without the camera.
const fs = require('fs'), path = require('path');
const prep2 = require('./prep2.js');
module.exports = async function prep4(c) {
  await prep2(c);
  const art = ['TIDE-0001', 'TIDE-0002', 'TIDE-0003'].map(n => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, 'assets', n + '.jpg')).toString('base64'));
  const r = await c.s.ev(`(async () => {
    const ids = ['ART.1A', 'ART.1B', 'ART.1C'], art = ${JSON.stringify(art)};
    for (let i = 0; i < 3; i++) {
      FRAME_API.setItem(ids[i], { widthIn: 24, heightIn: 30 });
      const rec = _fbByCode()[_fbNorm('FA-BW26031')];
      if (rec) { const url = await _libEntryToDataUrl(rec.item.file); applySwatchToRow(dashProjectData.findIndex(x => x.id === ids[i]), rec.collection, rec.item, url); }
      await FRAME_API.setArtwork(ids[i], art[i], 'TIDE-000' + (i + 1) + '.jpg');
    }
    const e = elevations[currentElevIndex];
    [[18, 38], [57, 49], [103, 43]].forEach((p, i) => { const f = e.frames.find(x => x.id === ids[i]); f.x = p[0]; f.y = p[1]; f.selected = false; });
    switchView('elevation'); try { drawElevAll(); } catch (er) {} try { renderElevation(); } catch (er) {}
    return e.frames.map(f => f.id + ' ' + f.w + 'x' + f.h + ' @' + f.x + ',' + f.y + ' ' + f.fCode + ' ' + f.imageCode);
  })()`);
  console.log('prep4', JSON.stringify(r));
};
