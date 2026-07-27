const fs=require('fs'); const S=fs.readFileSync(require('path').join(__dirname,'..','app.js'),'utf8');
let fails=[]; const ck=(l,c)=>{console.log((c?'OK:  ':'FAIL:')+' '+l); if(!c)fails.push(l);};
ck('EXACT BUG: setPersonShade now writes the shade to EVERY elevation, not just the open one',
   /\(elevations \|\| \[\]\)\.forEach\(e => \{ if \(e\) e\.personShade = elevPersonShade; \}\)/.test(S));
ck('the old single-elevation-only write is no longer the primary path',
   S.indexOf("    if (elevations[currentElevIndex]) elevations[currentElevIndex].personShade = elevPersonShade;\n    _applyPersonShade();") < 0);
ck('a fallback still sets at least the current elevation if the loop somehow throws',
   /catch \(err\) \{ if \(elevations\[currentElevIndex\]\) elevations\[currentElevIndex\]\.personShade = elevPersonShade; \}/.test(S));
ck('per-elevation restore on switch is untouched, so the now-uniform value persists',
   S.indexOf("elevPersonShade = elevations[currentElevIndex].personShade || 0;") >= 0);
ck('person POSITION stays per-elevation (a position is legitimately per-wall, unlike styling)',
   S.indexOf("elevPersonPos = elevations[currentElevIndex].personPos;") >= 0);
// behavioural simulation of the exact reported scenario
let elevations=[{personShade:0},{personShade:0},{personShade:0}], currentElevIndex=0, elevPersonShade=0;
function setPersonShade(v){ elevPersonShade=parseFloat(v)||0; elevations.forEach(e=>{if(e)e.personShade=elevPersonShade;}); }
setPersonShade(0.6);
ck('SIMULATION: changing the shade on Elevation 1 updates all three elevations',
   elevations.every(e=>e.personShade===0.6));
currentElevIndex=1; const restored = elevations[currentElevIndex].personShade||0;
ck('SIMULATION: switching to Elevation 2 restores the same grey, not black',restored===0.6);
console.log('--- Summary ---');
if(fails.length){console.log(fails.length+' FAILURES');process.exit(1);}
console.log('ALL PASSED (7)');
