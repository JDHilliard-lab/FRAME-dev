const fs = require('fs');
const S = fs.readFileSync(require('path').join(__dirname,'..','app.js'),'utf8');
let fails = [];
const ck = (label, cond) => { console.log((cond?'OK:  ':'FAIL:')+' '+label); if(!cond) fails.push(label); };

ck('EXACT BUG: breaker capture no longer unconditionally strips spacing/hangHeight/wallDims',
   S.indexOf("(isBreakerCap && !_bkGuides) ? { spacing: false, hangHeight: false, wallDims: false } : undefined") >= 0);
ck('the old unconditional strip is gone',
   S.indexOf("isBreakerCap ? { spacing: false, hangHeight: false, wallDims: false } : undefined") < 0);
ck('the Show-layout-guides breaker option (_breakerMeasure) is what governs it',
   /_bkGuides = isBreakerCap && \(typeof _breakerMeasure === 'function' \? _breakerMeasure\(\) : false\)/.test(S));
ck('guarded so a missing _breakerMeasure cannot throw',
   S.indexOf("typeof _breakerMeasure === 'function'") >= 0);
ck('cache key varies with the guides flag, so toggling it forces a fresh capture instead of reusing the stripped one',
   S.indexOf("('breaker' + (_bkGuides ? 'G' : ''))") >= 0);
ck('install-guide captures still mirror the editor exactly (unchanged path)',
   S.indexOf("isBreakerCap ? ('breaker' + (_bkGuides ? 'G' : '')) : 'ig'") >= 0);
ck('clean breaker (option OFF) still strips the three guides',
   S.indexOf("!_bkGuides) ? { spacing: false") >= 0);
console.log('--- Summary ---');
if (fails.length) { console.log(fails.length+' FAILURES'); process.exit(1); }
console.log('ALL PASSED (7)');
