// End-to-end tests for StepAlong scoring. Plays full rounds with synthetic body poses (no camera/model needed).
// Usage: npm test   (or: node tests/e2e-smoke.js)
const { JSDOM } = require('jsdom');
const app = require('./load-app')();
if (!app.includes('ROUND_MS = 25000')) throw new Error('ROUND_MS constant not found in app.js; update the test');
const html = app.replace('ROUND_MS = 25000', 'ROUND_MS = 4200'); // short rounds for testing
const sleep = ms => new Promise(r => setTimeout(r, ms));

function base() {
  return {
    11:{x:0.60,y:0.30}, 12:{x:0.40,y:0.30}, 23:{x:0.57,y:0.50}, 24:{x:0.43,y:0.50},
    25:{x:0.57,y:0.68}, 26:{x:0.43,y:0.68}, 27:{x:0.57,y:0.88}, 28:{x:0.43,y:0.88},
    15:{x:0.62,y:0.52}, 16:{x:0.38,y:0.52}, 13:{x:0.63,y:0.42}, 14:{x:0.37,y:0.42},
    29:{x:0.57,y:0.90}, 30:{x:0.43,y:0.90}, 31:{x:0.57,y:0.90}, 32:{x:0.43,y:0.90}, 0:{x:0.5,y:0.2}
  };
}
const P = o => Object.assign(base(), o);
// Per routine: pose for side 0 (A), side 1 (B), a "tiny" version of A, and the start cue we expect at rest.
const WEAK = {
  'Standing Sway':      P({23:{x:0.535,y:0.50},24:{x:0.395,y:0.50}}),
  'Heel-Toe Rocker':    P({31:{x:0.57,y:0.8884},32:{x:0.43,y:0.8884}}),
  'Cross-Body Horizon': P({15:{x:0.5327,y:0.35}}),
  'Exaggerated March':  P({26:{x:0.43,y:0.5927}}),
};
const ROUTINES = {
  'Standing Sway':      { A:P({23:{x:0.62,y:0.50},24:{x:0.48,y:0.50}}), B:P({23:{x:0.52,y:0.50},24:{x:0.38,y:0.50}}), tiny:P({23:{x:0.582,y:0.50},24:{x:0.442,y:0.50}}), cue:'Shift your weight' },
  'Heel-Toe Rocker':    { A:P({29:{x:0.57,y:0.87},30:{x:0.43,y:0.87}}), B:P({31:{x:0.57,y:0.88},32:{x:0.43,y:0.88}}), tiny:P({29:{x:0.57,y:0.895},30:{x:0.43,y:0.895}}), cue:'Rise up' },
  'Cross-Body Horizon': { A:P({16:{x:0.50,y:0.35}}), B:P({15:{x:0.50,y:0.35}}), tiny:P({16:{x:0.42,y:0.40}}), cue:'Reach one hand' },
  'Exaggerated March':  { A:P({25:{x:0.57,y:0.55}}), B:P({26:{x:0.43,y:0.55}}), tiny:P({25:{x:0.57,y:0.64}}), cue:'Lift one knee' },
};

function makeDom() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost:8001/', pretendToBeVisual: true,
    beforeParse(w) {
      w.localStorage.setItem('stepalong_profile_v1', JSON.stringify({ onboarded:true, name:'', goal:'all', steady:'mostly', days:3, rounds:1, text:'standard', contrast:'standard', voice:'off', beats:'on' }));
      const errs = (w.__errs = []); w.addEventListener('error', e => errs.push(e.message));
      w.HTMLCanvasElement.prototype.getContext = () => ({ save(){}, restore(){}, clearRect(){} });
      w.drawConnectors = () => {}; w.drawLandmarks = () => {}; w.POSE_CONNECTIONS = [];
      Object.defineProperty(w.HTMLMediaElement.prototype, 'readyState', { get(){ return 4; } });
      Object.defineProperty(w.HTMLVideoElement.prototype, 'videoWidth', { get(){ return 640; } });
      Object.defineProperty(w.HTMLVideoElement.prototype, 'videoHeight', { get(){ return 480; } });
      w.HTMLMediaElement.prototype.play = () => Promise.resolve();
      Object.defineProperty(w.navigator, 'mediaDevices', { value: { getUserMedia: async () => ({ getTracks: () => [{ stop(){} }] }) } });
      w.Pose = class { setOptions(){} onResults(cb){ w.__cb = cb; } async send(){ if (w.__pose) w.__cb({ poseLandmarks: w.__pose }); } };
    } });
  const w = dom.window; w.__pose = base();
  return { w, d: w.document, $: id => w.document.getElementById(id) };
}
async function playRound(env, poseAt) {            // poseAt(t_ms) -> pose for that moment of the round
  const { w, $ } = env;
  $('startBtn').click(); await sleep(300);
  $('beginBtn').click(); await sleep(3200);         // countdown + calibration at rest
  const t0 = Date.now();
  while (Date.now() - t0 < 4000) { w.__pose = poseAt(Date.now() - t0); await sleep(40); }
  await sleep(900);
  const saved = JSON.parse(w.localStorage.getItem('stepalong_sessions_v3') || '[]')[0] || {};
  return { reps: parseInt($('statReps').textContent, 10), score: parseInt($('statAvg').textContent, 10), overlay: $('completeOverlay').classList.contains('show'),
           coach: $('coachLine').textContent, cue: $('feedbackLine').textContent, saved, sideRows: $('sideBars').children.length, errs: w.__errs.length };
}
function openRoutine(env, label, tier) {
  env.$('navRoutines').click();
  [...env.d.querySelectorAll('.routine-card')].find(c => c.textContent.includes(label)).click();
  env.$('detailStart').click();
  if (env.d.getElementById('screen-setup').classList.contains('active')) env.$('setupContinue').click();
  if (tier !== undefined) env.d.querySelector('#tierPicker button[data-tier="' + tier + '"]').click();
}
const alt = (A, B) => t => { const c = t % 2800; return c < 900 ? A : (c >= 1400 && c < 2300) ? B : base(); };   // A, rest, B, rest ...
const sameOnly = A => t => (t % 1400) < 900 ? A : base();                                               // only ever side A

let failures = 0;
function check(name, cond, extra) { if (!cond) failures++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '   ' + extra : '')); }

(async () => {
  const labels = Object.keys(ROUTINES);
  const results = await Promise.all(labels.map(async label => {
    const R = ROUTINES[label];
    const run = async (poseFn, tier) => { const env = makeDom(); openRoutine(env, label, tier); return playRound(env, poseFn); };
    const [good, rest, tiny, same, tier3, lop] = await Promise.all([ run(alt(R.A, R.B)), run(() => base()), run(alt(R.tiny, R.tiny)), run(sameOnly(R.A)), run(alt(R.A, R.B), 2), run(alt(R.A, WEAK[label])) ]);
    return { label, good, rest, tiny, same, tier3, lop };
  }));
  for (const r of results) {
    const { label, good, rest, tiny, same, tier3, lop } = r, R = ROUTINES[label];
    console.log('\n' + label);
    check('  alternating full-size reps count',   good.overlay && good.reps >= 2 && good.errs === 0, 'reps=' + good.reps + ' score=' + good.score);
    check('  a 100 is NOT handed out',             good.score >= 40 && good.score < 100, 'score=' + good.score);
    check('  standing still scores ~0',            rest.reps === 0 && rest.score <= 5, 'reps=' + rest.reps + ' score=' + rest.score);
    check('  tiny movements do not count',         tiny.reps === 0 && tiny.score <= 10, 'reps=' + tiny.reps + ' score=' + tiny.score);
    check('  same side repeated counts only once', same.reps === 1, 'reps=' + same.reps);
    check('  Tier 3 is harder than Tier 1',        tier3.reps < good.reps && tier3.score < good.score, 'T1=' + good.score + '/' + good.reps + ' T3=' + tier3.score + '/' + tier3.reps);
    check('  live cue at rest tells you what to do', rest.cue.includes(R.cue), '"' + rest.cue + '"');
    check('  results explain what to fix',         rest.coach.includes('No reps counted') && good.coach.length > 20, '"' + good.coach.slice(0, 60) + '"');
    check('  session saved with breakdown + tip',  Array.isArray(good.saved.parts) && good.saved.parts.length === 3 && typeof good.saved.tip === 'string' && good.saved.tip.length > 10);
    check('  left-vs-right bars shown (2 sides)',   good.sideRows === 2 && Array.isArray(good.saved.sides) && good.saved.sides.length === 2, 'sides=' + JSON.stringify(good.saved.sides));
    check('  balanced round: no imbalance warning', !good.coach.includes('was weaker'), '"' + good.coach.slice(0, 70) + '"');
    check('  lopsided round: weaker side is called out', lop.reps >= 2 && lop.coach.includes('was weaker') && lop.saved.sides[1] < lop.saved.sides[0] * 0.75, 'reps=' + lop.reps + ' sides=' + JSON.stringify(lop.saved.sides) + ' "' + lop.coach.slice(0, 80) + '"');
  }

  // ---- Free Movement ----
  console.log('\nFree Movement');
  async function freeRun(preset, poseFn) {
    const env = makeDom(); const { d } = env;
    env.$('navRoutines').click();
    [...d.querySelectorAll('.routine-card')].find(c => c.textContent.includes('Free Movement')).click();
    d.querySelector('#presetRow [data-preset="' + preset + '"]').click();
    env.$('customStart').click();
    if (d.getElementById('screen-setup').classList.contains('active')) env.$('setupContinue').click();
    return playRound(env, poseFn);
  }
  const jacks = t => { const up = (t % 1200) < 600; return P({ 15:{x:0.70,y:up?0.12:0.52}, 16:{x:0.30,y:up?0.12:0.52}, 27:{x:up?0.70:0.57,y:0.88}, 28:{x:up?0.30:0.43,y:0.88} }); };
  const legsOnly = t => { const up = (t % 1200) < 600; return P({ 27:{x:up?0.70:0.57,y:0.88}, 28:{x:up?0.30:0.43,y:0.88} }); };
  const raises = t => { const up = (t % 1200) < 600; return P({ 15:{x:0.70,y:up?0.12:0.52}, 16:{x:0.30,y:up?0.12:0.52} }); };
  const tinyArms = t => { const up = (t % 1200) < 600; return P({ 15:{x:0.70,y:up?0.46:0.52}, 16:{x:0.30,y:up?0.46:0.52} }); };
  const [fj, fl, fa, ft, fr] = await Promise.all([ freeRun('jacks', jacks), freeRun('jacks', legsOnly), freeRun('raises', raises), freeRun('raises', tinyArms), freeRun('jacks', () => base()) ]);
  check('  jumping jacks (arms + legs) count',          fj.overlay && fj.reps >= 2 && fj.errs === 0, 'reps=' + fj.reps + ' score=' + fj.score);
  check('  jumping jacks with only legs moving: 0 reps', fl.reps === 0, 'reps=' + fl.reps + ' score=' + fl.score);
  check('  arm raises count',                           fa.reps >= 2, 'reps=' + fa.reps + ' score=' + fa.score);
  check('  tiny arm movement does not count',           ft.reps === 0, 'reps=' + ft.reps);
  check('  standing still scores ~0',                   fr.reps === 0 && fr.score <= 5, 'score=' + fr.score);
  check('  free score is not a free 100',               fj.score < 100 && fa.score < 100);
  check('  saved with its name',                        fj.saved.label === 'Jumping jacks', 'label=' + fj.saved.label);

  console.log(failures ? '\n' + failures + ' check(s) FAILED' : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
