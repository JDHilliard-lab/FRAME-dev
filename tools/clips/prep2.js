// The state clip 1 ends in, made without the camera: plan, pin, wall line, triptych.
const fs = require('fs'), path = require('path');
module.exports = async function prep2(c) {
  const plan = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'assets', 'PLAN.TIDE.L1_A-101.png')).toString('base64');
  await c.s.ev(`(async () => { _startNewProject({ name: 'The Tideline Hotel', client: 'Tideline Hospitality', unit: 'in' });
    _dsFpSetCategory('ART.1', 'framed'); dashProjectData.forEach(r => { r.location = 'LOBBY'; });
    _nextStepDismissed = true; try { _syncNextStep(); } catch (e) {}
    _fpMigrate(); floorplanLevels[0].imageData = ${JSON.stringify(plan)}; floorplanLevels[0].imageName = 'PLAN.TIDE.L1_A-101.png';
    const r = dashProjectData.find(x => x.id === 'ART.1'); _fpSetPin(r, 0, 0.47, 0.171);
    _fpApplyFrameSet('ART.1', 3, '');
    await new Promise(r => setTimeout(r, 1500));
    switchView('elevation');
    const i = elevations.findIndex(e => (e.frames || []).some(f => /^ART\\.1/.test(f.id))); if (i >= 0 && typeof switchElevation === 'function') switchElevation(i);
    return elevations.map(e => e.name + ':' + (e.frames || []).map(f => f.id).join('/'));
  })()`).then(v => console.log('prep', JSON.stringify(v)));
};
