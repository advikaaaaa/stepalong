// End-to-end smoke test: plays a full practice round per routine using synthetic body poses
// (no real camera/model needed) and checks that reps count, scores are sane, and rest != reps.
// Usage: npm test   (or: node tests/e2e-smoke.js)
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const ROUND_MS = 6000; // shortened round for testing (the app uses 25000)
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
if (!appJs.includes('ROUND_MS = 25000')) throw new Error('ROUND_MS constant not found in app.js; update the test');
// jsdom doesn't fetch external files here, so inline app.js into the page. The MediaPipe CDN scripts are
// skipped too; the fake Pose below stands in for them.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace('<script src="app.js"></script>', () => '<script>' + appJs.replace('ROUND_MS = 25000', 'ROUND_MS = ' + ROUND_MS) + '</script>');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function basePose() {
  return {
    11:{x:0.60,y:0.30}, 12:{x:0.40,y:0.30}, 23:{x:0.57,y:0.50}, 24:{x:0.43,y:0.50},
    25:{x:0.57,y:0.68}, 26:{x:0.43,y:0.68}, 27:{x:0.57,y:0.88}, 28:{x:0.43,y:0.88},
    15:{x:0.62,y:0.52}, 16:{x:0.38,y:0.52}, 13:{x:0.63,y:0.42}, 14:{x:0.37,y:0.42},
    29:{x:0.57,y:0.90}, 30:{x:0.43,y:0.90}, 31:{x:0.57,y:0.90}, 32:{x:0.43,y:0.90}, 0:{x:0.5,y:0.2}
  };
}
const withPose = over => Object.assign(basePose(), over);
const scenarios = [
  { label: 'Standing Sway',      active: withPose({23:{x:0.60,y:0.50}, 24:{x:0.46,y:0.50}}) },
  { label: 'Heel-Toe Rocker',    active: withPose({29:{x:0.57,y:0.86}, 30:{x:0.43,y:0.86}}) },
  { label: 'Cross-Body Horizon', active: withPose({16:{x:0.58,y:0.35}}) },
  { label: 'Exaggerated March',  active: withPose({25:{x:0.57,y:0.55}}) },
];

async function run(label, activePose, doMove) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost:8001/', pretendToBeVisual: true,
    beforeParse(w) {
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
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  w.__pose = basePose();
  d.getElementById('introStart').click();
  [...d.querySelectorAll('.routine-card')].find(c => c.textContent.includes(label)).click();
  if (d.getElementById('screen-setup').classList.contains('active')) $('setupContinue').click();
  $('startBtn').click(); await sleep(300);
  $('beginBtn').click();                       // person visible at rest -> countdown + baseline calibration
  await sleep(3200);                          // countdown (~2.8s) finishes, round goes active
  const t0 = Date.now();
  while (Date.now() - t0 < ROUND_MS - 400) {  // move in 900ms-on / 700ms-off cycles (or stay at rest)
    w.__pose = doMove && ((Date.now() - t0) % 1600 < 900) ? activePose : basePose();
    await sleep(40);
  }
  await sleep(900);
  const reps = parseInt($('statReps').textContent, 10);
  const overlay = $('completeOverlay').classList.contains('show');
  const saved = JSON.parse(w.localStorage.getItem('stepalong_sessions_v2') || '[]')[0];
  return { reps, overlay, avg: saved && saved.avgScore, errs: w.__errs.length };
}

(async () => {
  let fail = 0;
  for (const s of scenarios) {
    const moving = await run(s.label, s.active, true);
    const resting = await run(s.label, s.active, false);
    const ok = moving.overlay && moving.reps >= 3 &&   // ~3-4 move cycles fit in a round
       moving.avg >= 70 && resting.reps === 0 && !moving.errs && !resting.errs;
    if (!ok) fail++;
    console.log((ok ? 'PASS ' : 'FAIL ') + s.label.padEnd(20),
      `moving: reps=${moving.reps} avg=${moving.avg} | resting: reps=${resting.reps}`);
  }
  console.log(fail ? `\n${fail} scenario(s) FAILED` : '\nAll scenarios passed');
  process.exit(fail ? 1 : 0);
})();
