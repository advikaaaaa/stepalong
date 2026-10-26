(function () {
  "use strict";

  // ---------- landmark indices & math helpers ----------
  const LM = { NOSE:0, LSH:11, RSH:12, LEL:13, REL:14, LWR:15, RWR:16,
    LHIP:23, RHIP:24, LKNEE:25, RKNEE:26, LANK:27, RANK:28, LHEEL:29, RHEEL:30, LFOOT:31, RFOOT:32 };
  function byId(id){ return document.getElementById(id); }
  function dist(a,b){ if(!a||!b) return 0; return Math.hypot(a.x-b.x, a.y-b.y); }
  function mid(a,b){ return {x:(a.x+b.x)/2, y:(a.y+b.y)/2}; }
  function clamp01(v){ return Math.max(0, Math.min(1, v)); }
  function mean(a){ return a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0; }
  function median(a){ const t=[...a].sort((x,y)=>x-y); const m=Math.floor(t.length/2); return t.length%2 ? t[m] : (t[m-1]+t[m])/2; }
  function torsoLen(lm){ return dist(mid(lm[LM.LSH],lm[LM.RSH]), mid(lm[LM.LHIP],lm[LM.RHIP])) || 0.0001; }
  function shoulderWidth(lm){ return dist(lm[LM.LSH], lm[LM.RSH]) || 0.0001; }
  const DEBUG = /[?&]debug/.test(location.search);   // add ?debug to the URL to see raw numbers while tuning

  // ---------- storage ----------
  const STORE_KEY = 'stepalong_sessions_v3', DIFF_KEY = 'stepalong_difficulty_v3';
  const SETUP_KEY = 'stepalong_setup_seen_v1', CUSTOM_KEY = 'stepalong_custom_v1';
  function lsGet(k, fallback){ try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fallback; } catch(e){ return fallback; } }
  function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
  function loadSessions(){ return lsGet(STORE_KEY, []); }
  function saveSession(rec){ const l = loadSessions(); l.unshift(rec); lsSet(STORE_KEY, l.slice(0,50)); }
  const difficultyMap = lsGet(DIFF_KEY, {});
  function saveDifficulty(){ lsSet(DIFF_KEY, difficultyMap); }
  function tierFor(id){ return difficultyMap[id] || 0; }
  function bestScoreFor(id){
    const s = loadSessions().filter(x => x.routineId === id);
    return s.length ? Math.max(...s.map(x => x.avgScore)) : null;
  }

  // ---------- profile (set by the wizard, edited in Settings) ----------
  const PROFILE_KEY = 'stepalong_profile_v1';
  const GOALS = {
    balance: { label:'Balance and steadiness',          first:'sway' },
    walking: { label:'Walking and leg strength',        first:'march' },
    arms:    { label:'Arm and upper-body coordination', first:'crossbody' },
    all:     { label:'A bit of everything',             first:'sway' },
    move:    { label:'Just get moving',                 first:'march' }
  };
  const STEADY = {
    very:   { label:'Very steady',                                     tier:1, careful:false },
    mostly: { label:'Mostly steady, with an occasional wobble',        tier:0, careful:false },
    little: { label:'A little unsteady, I like something to hold',     tier:0, careful:true },
    gentle: { label:'I would rather start slow and gentle',            tier:0, careful:true }
  };
  const DEFAULT_PROFILE = { name:'', goal:'all', steady:'mostly', days:3, rounds:1, text:'standard', contrast:'standard', voice:'off', beats:'on', scheme:'garden', mode:'auto', onboarded:false };
  let profile = Object.assign({}, DEFAULT_PROFILE, lsGet(PROFILE_KEY, {}));
  function saveProfile(){ lsSet(PROFILE_KEY, profile); }

  // ---------- accessibility / sound (stored in the profile, applied everywhere) ----------
  let largeText=false, highContrast=false, voiceOn=false, beatsOn=true;
  function setSwitch(id, on){ const el = byId(id); el.classList.toggle('on', on); el.setAttribute('aria-checked', on ? 'true' : 'false'); }
  // Colour schemes: the actual colours live in styles.css (one block per scheme, light and dark).
  // Here we only need each scheme's name and two preview colours for the swatch buttons.
  const SCHEMES = {
    garden:  { label:'Garden',  bg:'#EAE6DC', accent:'#47614F' },
    ember:   { label:'Ember',   bg:'#1C1A18', accent:'#FF8A3D' },   // orange and black
    sky:     { label:'Sky',     bg:'#EAF4FC', accent:'#1D66A8' },
    blossom: { label:'Blossom', bg:'#FCEFF4', accent:'#9C3468' }
  };
  const MODES = ['auto', 'light', 'dark'];   // auto = follow the device's light/dark setting
  function renderSchemePickers(){
    ['wizScheme', 'setScheme'].forEach(id => {
      const box = byId(id); box.innerHTML = '';
      Object.keys(SCHEMES).forEach(key => {
        const s = SCHEMES[key], b = document.createElement('button'), dot = document.createElement('i'), name = document.createElement('span');
        b.type = 'button'; b.dataset.scheme = key; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', key === profile.scheme ? 'true' : 'false');
        b.classList.toggle('active', key === profile.scheme);
        dot.style.background = 'linear-gradient(135deg, ' + s.bg + ' 50%, ' + s.accent + ' 50%)'; dot.setAttribute('aria-hidden', 'true');
        name.textContent = s.label; b.appendChild(dot); b.appendChild(name); box.appendChild(b);
      });
    });
    document.querySelectorAll('#wizMode button, #setMode button').forEach(b => {
      const on = b.dataset.mode === profile.mode; b.classList.toggle('active', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  function applyProfile(){
    if (!SCHEMES[profile.scheme]) profile.scheme = 'garden';   // older profiles have no scheme saved
    if (MODES.indexOf(profile.mode) === -1) profile.mode = 'auto';
    document.documentElement.setAttribute('data-scheme', profile.scheme); document.documentElement.setAttribute('data-mode', profile.mode);
    renderSchemePickers();
    largeText = profile.text === 'large'; document.documentElement.classList.toggle('large-text', largeText);
    highContrast = profile.contrast === 'high'; document.documentElement.setAttribute('data-contrast', highContrast ? 'high' : 'normal');
    voiceOn = profile.voice === 'on'; beatsOn = profile.beats !== 'off';
    setSwitch('btnLargeText', largeText); setSwitch('btnHighContrast', highContrast); setSwitch('btnVoice', voiceOn); setSwitch('btnBeats', beatsOn);
  }
  function speak(text){
    if (!voiceOn) return;
    try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate=1.0; window.speechSynthesis.speak(u); } catch(e){}
  }
  byId('btnLargeText').addEventListener('click', () => { profile.text = profile.text === 'large' ? 'standard' : 'large'; saveProfile(); applyProfile(); });
  byId('btnHighContrast').addEventListener('click', () => { profile.contrast = profile.contrast === 'high' ? 'standard' : 'high'; saveProfile(); applyProfile(); });
  byId('btnVoice').addEventListener('click', () => { profile.voice = profile.voice === 'on' ? 'off' : 'on'; saveProfile(); applyProfile(); if (voiceOn) speak('Voice coaching on'); });
  byId('btnBeats').addEventListener('click', () => { profile.beats = profile.beats === 'off' ? 'on' : 'off'; saveProfile(); applyProfile(); });
  // The same pickers appear in the wizard and in Settings; a choice applies (and saves) right away in both.
  ['wizScheme', 'setScheme'].forEach(id => byId(id).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; profile.scheme = b.dataset.scheme; saveProfile(); applyProfile();
  }));
  ['wizMode', 'setMode'].forEach(id => byId(id).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; profile.mode = b.dataset.mode; saveProfile(); applyProfile();
  }));
  let lastSpokenAt = 0;
  function maybeSpeak(text, gapMs){ const now = Date.now(); if (now - lastSpokenAt > gapMs) { speak(text); lastSpokenAt = now; } }

  // ---------- metronome ----------
  let audioCtx = null;
  function beep(){
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
      osc.frequency.value = 880; gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(); osc.stop(audioCtx.currentTime + 0.12);
    } catch(e) {}
  }
  const beatPulse = byId('beatPulse');
  let metronomeId = null;
  function startMetronome(bpm){
    stopMetronome(); if (!beatsOn) return;
    metronomeId = setInterval(() => { beep(); beatPulse.classList.add('flash'); setTimeout(() => beatPulse.classList.remove('flash'), 90); }, 60000/bpm);
  }
  function stopMetronome(){ if (metronomeId) { clearInterval(metronomeId); metronomeId = null; } beatPulse.classList.remove('flash'); }

  // =====================================================================
  //  SCORING (read this part to explain the app)
  //  Every routine has TWO "sides" (left/right knee, heels-up/toes-up, ...).
  //  Per side:   deviation = how far the body moved from the person's own resting position
  //              ratio     = smoothed deviation / the tier's target size
  //              live      = 100 * (ratio / 1.2) ^ 1.5   -> reaching the target ~ 70, 100 needs 20% beyond it
  //  A rep counts when a side holds live >= 70 for the tier's hold time, and it must be the
  //  OPPOSITE side from the previous rep. The round score blends reps, range and consistency.
  // =====================================================================
  const LIVE_FULL = 1.2, LIVE_EXP = 1.5, HOLD_GOOD = 70, REARM_BELOW = 35;
  const ROUND_MS = 25000;  // length of one active round (the countdown is 4 ticks x 700 ms, see beginRound)

  // Must match the pose.js version pinned in index.html; the model files are fetched from the same release.
  const POSE_VERSION = '0.5.1675469404';
  function liveScore(ratio){ return Math.round(100 * Math.pow(clamp01(ratio / LIVE_FULL), LIVE_EXP)); }

  // ---------- icons: one set, 24px grid, 1.75 stroke, round caps (index.html uses the same paths) ----------
  const ICON_PATHS = {
      "sway": "<circle cx=\"12\" cy=\"4.25\" r=\"2\"/><path d=\"M12 7v7\"/><path d=\"M12 9.5 9 12.5\"/><path d=\"m12 9.5 3 3\"/><path d=\"m12 14-2 7\"/><path d=\"m12 14 2 7\"/><path d=\"M5 12 2.5 14.5 5 17\"/><path d=\"m19 12 2.5 2.5L19 17\"/>",
      "heeltoe": "<circle cx=\"9.5\" cy=\"4.25\" r=\"2\"/><path d=\"M9.5 7v7\"/><path d=\"M9.5 9.5 7 12.5\"/><path d=\"m9.5 9.5 2.5 3\"/><path d=\"m9.5 14-1.25 7\"/><path d=\"m9.5 14 1.25 7\"/><path d=\"M18.5 12v9\"/><path d=\"m16.5 14 2-2 2 2\"/><path d=\"m16.5 19 2 2 2-2\"/>",
      "crossbody": "<circle cx=\"12\" cy=\"4.25\" r=\"2\"/><path d=\"M12 7v7\"/><path d=\"M12 9.5 9.5 13\"/><path d=\"m12 9.5 2.5 3.5\"/><path d=\"m12 14-2 7\"/><path d=\"m12 14 2 7\"/><path d=\"M18 10.5c-2.5-3.5-9.5-3.5-12 0\"/><path d=\"m6 10.5-.2-2.8\"/><path d=\"m6 10.5 2.8-.3\"/>",
      "march": "<circle cx=\"12\" cy=\"4.25\" r=\"2\"/><path d=\"M12 7v7\"/><path d=\"M12 9.5 9 12.5\"/><path d=\"m12 9.5 2.75-2\"/><path d=\"m12 14-.5 7\"/><path d=\"M12 14h4.5l-.5 4.5\"/>",
      "free": "<circle cx=\"12\" cy=\"4.25\" r=\"2\"/><path d=\"M12 7v7\"/><path d=\"M12 9.5 7.5 6\"/><path d=\"m12 9.5 4.5-3.5\"/><path d=\"m12 14-3.5 7\"/><path d=\"m12 14 3.5 7\"/><path d=\"M19.5 13.5v3\"/><path d=\"M18 15h3\"/>",
      "check": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m8.5 12.5 2.5 2.5 4.5-5\"/>",
      "lock": "<rect x=\"5\" y=\"11\" width=\"14\" height=\"9.5\" rx=\"2\"/><path d=\"M8 11V8a4 4 0 0 1 8 0v3\"/>",
      "chevron": "<path d=\"m9 6 6 6-6 6\"/>"
  };
  function icon(name, size){ return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON_PATHS[name] + '</svg>'; }

  const TIER_NAMES = ['Gentle','Steady','Strong'];
  const ROUTINES = [
    {
      id:'sway', category:'legs', tag:'Balance', label:'Standing Sway',
      shortDesc:'Shift your weight smoothly from side to side.',
      hint:'Stand with feet apart. Shift your weight fully over one foot, hold it, then shift to the other.',
      research:'Balance and fall-prevention training is a core part of physical therapy for older adults and people with neurological conditions — postural instability in particular is a well-documented symptom in Parkinson\'s disease research.',
      trains:'Standing balance and shifting your weight from foot to foot.',
      sideNames:['leftward shift','rightward shift'], sideCues:['Shift more weight over your left foot.','Shift more weight over your right foot.'],
      beat:false, sideLabels:['Shift left','Shift right'], defaultBase:[0,0],
      cues:{ start:'Shift your weight onto one foot.', further:'A little further — move more weight over that foot.', target:'Shift your weight fully over one foot, hold it, then switch.' },
      switchCues:['Now shift to your right.','Now shift to your left.'],
      tiers:[ {amp:[0.18,0.18], hold:600, reps:6}, {amp:[0.26,0.26], hold:750, reps:8}, {amp:[0.34,0.34], hold:900, reps:10} ],
      // hip centre vs ankle centre, in shoulder widths (raw frame: the person's left is at larger x)
      sides:(lm) => { const v=(mid(lm[LM.LHIP],lm[LM.RHIP]).x - mid(lm[LM.LANK],lm[LM.RANK]).x)/shoulderWidth(lm); return [v, -v]; }
    },
    {
      id:'heeltoe', category:'legs', tag:'Balance', label:'Heel-Toe Rocker',
      shortDesc:'Rock rhythmically between heels and toes.',
      hint:'Hold something sturdy if needed. Rise onto your toes, then rock back and lift your toes, on the beat.',
      research:'Moving to a steady beat draws on rhythmic auditory stimulation (RAS) — a technique studied in multiple clinical trials (e.g. the RESCUE trial, published in J Neurol Neurosurg Psychiatry) showing improved gait and balance in Parkinson\'s patients when movement is paired with an external timing cue.',
      trains:'Ankle control and rhythmic balance, rocking in time with a beat.',
      sideNames:['heel raise','toe raise'], sideCues:['Lift your heels higher onto your toes.','Rock back and lift your toes higher.'],
      beat:true, sideLabels:['Heels up','Toes up'], defaultBase:[0,0],
      cues:{ start:'Rise up onto your toes.', further:'Rock a little further.', target:'Rise onto your toes, then rock back and lift your toes.' },
      switchCues:['Now rock back and lift your toes.','Now rise up onto your toes.'],
      tiers:[ {amp:[0.10,0.06], hold:400, reps:8, bpm:50}, {amp:[0.14,0.08], hold:500, reps:12, bpm:60}, {amp:[0.18,0.10], hold:600, reps:16, bpm:70} ],
      // toe height minus heel height, in torso lengths: positive = heels lifted, negative = toes lifted
      sides:(lm) => { const d=(mid(lm[LM.LFOOT],lm[LM.RFOOT]).y - mid(lm[LM.LHEEL],lm[LM.RHEEL]).y)/torsoLen(lm); return [d, -d]; }
    },
    {
      id:'crossbody', category:'arms', tag:'Coordination', label:'Cross-Body Horizon',
      shortDesc:'Reach one hand across your body to the far side.',
      hint:'Reach your right hand across your chest toward your left shoulder, then your left hand toward your right.',
      research:'Movements that cross the body\'s midline require the left and right sides of the brain to coordinate — a principle used broadly in motor-coordination and bilateral-integration training.',
      trains:'Left-right coordination by reaching across the middle of your body.',
      sideNames:['right hand','left hand'], sideCues:['Reach your right hand further across your chest.','Reach your left hand further across your chest.'],
      beat:false, sideLabels:['Right hand','Left hand'], defaultBase:[-0.1,-0.1],
      cues:{ start:'Reach one hand across your chest.', further:'A little further — reach past the middle of your chest.', target:'Reach each hand across your chest toward the opposite shoulder.' },
      switchCues:['Now reach your left hand across.','Now reach your right hand across.'],
      tiers:[ {amp:[0.45,0.45], hold:400, reps:6}, {amp:[0.65,0.65], hold:500, reps:8}, {amp:[0.85,0.85], hold:600, reps:10} ],
      // wrist travel toward the opposite shoulder in shoulder widths (raw frame: the person's right side is at small x)
      sides:(lm) => { const sw=shoulderWidth(lm); return [ (lm[LM.RWR].x-lm[LM.RSH].x)/sw, (lm[LM.LSH].x-lm[LM.LWR].x)/sw ]; }
    },
    {
      id:'march', category:'legs', tag:'Gait', label:'Exaggerated March',
      shortDesc:'March in place, lifting your knees high.',
      hint:'Lift your left knee high, stomp down, then your right. Keep alternating on the beat.',
      research:'High-stepping, rhythmically cued marching is used in Parkinson\'s gait research to counteract shuffling and reduce freezing episodes, giving each step an external timing cue the brain can latch onto.',
      trains:'Leg lift, stepping and walking rhythm, with a beat to move to.',
      sideNames:['left knee','right knee'], sideCues:['Lift your left knee higher.','Lift your right knee higher.'],
      beat:true, sideLabels:['Left knee','Right knee'], defaultBase:[-0.9,-0.9],
      cues:{ start:'Lift one knee up high.', further:'Higher — bring that knee toward your hip.', target:'Lift each knee high toward hip height, alternating legs.' },
      switchCues:['Now lift your right knee.','Now lift your left knee.'],
      tiers:[ {amp:[0.45,0.45], hold:150, reps:10, bpm:50}, {amp:[0.65,0.65], hold:200, reps:14, bpm:60}, {amp:[0.85,0.85], hold:250, reps:18, bpm:72} ],
      // knee height above its standing position, in torso lengths (~0.9 = thigh parallel to floor)
      sides:(lm) => { const t=torsoLen(lm); return [ (lm[LM.LHIP].y-lm[LM.LKNEE].y)/t, (lm[LM.RHIP].y-lm[LM.RKNEE].y)/t ]; }
    }
  ];

  // ---------- round score: reps (40%) + range (35%) + consistency (25%) ----------
  function computeRound(reps, peaks, targetReps, bestLive){
    const repsPart = clamp01(reps / targetReps);
    const depthVals = peaks.map(p => clamp01((p - 0.9) / 0.3));        // reaching the target = 0.5, 20% past it = 1
    const depthPart = mean(depthVals);
    let consPart = 0;
    if (peaks.length >= 3) { const m = mean(peaks); const sd = Math.sqrt(mean(peaks.map(p => (p-m)*(p-m)))); consPart = clamp01(1 - (sd / m) / 0.25); }
    let score = Math.round(100 * (0.40*repsPart + 0.35*depthPart + 0.25*consPart));
    if (reps === 0) score = Math.round(0.25 * bestLive);               // moved, but nothing counted: small credit only
    return { score, repsPart, depthPart, consPart };
  }
  function pctl(arr, p){ if (!arr.length) return 0; const t = [...arr].sort((a,b) => a-b); return t[Math.min(t.length-1, Math.floor(p*(t.length-1)))]; }
  // sideInfo = { names:[...], cues:[...], scores:[...] }; returns the sentence about the weaker side, or '' if the two sides are balanced.
  function sideAdvice(sideInfo, reps){
    if (!sideInfo || sideInfo.scores.length < 2 || reps < 2) return '';
    const sc = sideInfo.scores; let weak = 0, strong = 0;
    sc.forEach((v,i) => { if (v < sc[weak]) weak = i; if (v > sc[strong]) strong = i; });
    if (sc[strong] < 40 || sc[weak] >= 0.75 * sc[strong]) return '';
    return 'Your ' + sideInfo.names[weak] + ' was weaker (' + sc[weak] + ' vs ' + sc[strong] + '). ' + sideInfo.cues[weak];
  }
  function focusMessage(res, reps, target, cues, sideInfo){
    if (reps === 0) return 'No reps counted. ' + cues.target + ' Hold each one for a moment.';
    const sideText = sideAdvice(sideInfo, reps); if (sideText) return sideText;
    const parts = [ ['reps', res.repsPart], ['range', res.depthPart], ['cons', res.consPart] ].sort((a,b) => a[1]-b[1]);
    if (parts[0][1] >= 0.8) return 'Strong, even round. Move up a tier to keep improving.';
    if (parts[0][0] === 'reps') return 'Do more reps: aim for ' + target + ' in the round. Reset quickly between them.';
    if (parts[0][0] === 'range') return 'Go bigger on every rep. ' + (cues.further || '');
    return 'Make every rep the same size. Slow down and keep them even.';
  }

  // ---------- free-movement engine ----------
  const INTENSITY = { low:{mult:0.6, label:'Low'}, medium:{mult:1, label:'Medium'}, high:{mult:1.5, label:'High'} };
  const PACE = { slow:{reps:8, label:'Slow'}, medium:{reps:14, label:'Medium'}, fast:{reps:20, label:'Fast'} };
  const PARTS = { arms:'Arms', legs:'Legs', torso:'Torso' };
  const PRESETS = {
    jacks:   { name:'Jumping jacks', parts:['arms','legs'], intensity:'high',   pace:'fast' },
    raises:  { name:'Arm raises',    parts:['arms'],        intensity:'medium', pace:'medium' },
    knees:   { name:'High knees',    parts:['legs'],        intensity:'high',   pace:'fast' },
    squats:  { name:'Squats',        parts:['legs'],        intensity:'medium', pace:'slow' },
    bends:   { name:'Side bends',    parts:['torso'],       intensity:'low',    pace:'slow' }
  };
  // Each body part has candidate "signals" (one number per frame, in body-size units). The engine tracks all of them
  // and uses whichever one actually repeats (a jumping jack moves the arm-raise signal; a side step moves the feet signal).
  const FREE_SIGNALS = {
    arms: [
      { name:'arm raises',        med:0.9, fn:(lm) => ((lm[11].y+lm[12].y)/2 - (lm[15].y+lm[16].y)/2) / torsoLen(lm) },
      { name:'arm spread',        med:0.8, fn:(lm) => Math.abs(lm[15].x - lm[16].x) / shoulderWidth(lm) },
      { name:'alternating arms',  med:1.6, fn:(lm) => ((lm[11].y-lm[15].y) - (lm[12].y-lm[16].y)) / torsoLen(lm) }
    ],
    legs: [
      { name:'feet apart',        med:0.8, fn:(lm) => Math.abs(lm[27].x - lm[28].x) / shoulderWidth(lm) },
      { name:'alternating knees', med:1.0, fn:(lm) => ((lm[23].y-lm[25].y) - (lm[24].y-lm[26].y)) / torsoLen(lm) },
      { name:'squat depth',       med:0.35, fn:(lm) => ((lm[27].y+lm[28].y)/2 - (lm[23].y+lm[24].y)/2) / torsoLen(lm) }
    ],
    torso: [
      { name:'side lean',         med:0.35, fn:(lm) => ((lm[11].x+lm[12].x)/2 - (lm[23].x+lm[24].x)/2) / torsoLen(lm) },
      { name:'twist',             med:0.2,  fn:(lm) => shoulderWidth(lm) / torsoLen(lm) }
    ]
  };
  // Zig-zag cycle detector: counts a cycle each time the signal rises by at least 80% of the target size and turns back.
  function makeZig(target){
    return {
      target, delta: 0.25*target, minCount: 0.8*target, init:false, dir:0, lo:0, hi:0, ext:0, valley:0, peakVal:0, s:0, cur:0, cycles:0, peaks:[],
      update(raw){
        this.s = this.init ? this.s*0.6 + raw*0.4 : raw; const v = this.s;
        if (!this.init) { this.init = true; this.lo = this.hi = v; return; }
        if (this.dir === 0) {
          this.lo = Math.min(this.lo, v); this.hi = Math.max(this.hi, v);
          if (v - this.lo >= this.delta) { this.dir = 1; this.valley = this.lo; this.ext = v; }
          else if (this.hi - v >= this.delta) { this.dir = -1; this.peakVal = this.hi; this.ext = v; }
        } else if (this.dir === 1) {
          if (v > this.ext) this.ext = v;
          else if (this.ext - v >= this.delta) {
            const swing = this.ext - this.valley;
            if (swing >= this.minCount) { this.cycles++; this.peaks.push(swing / this.target); }
            this.peakVal = this.ext; this.dir = -1; this.ext = v;
          }
        } else {
          if (v < this.ext) this.ext = v;
          else if (v - this.ext >= this.delta) { this.valley = this.ext; this.dir = 1; this.ext = v; }
        }
        this.cur = this.dir === 1 ? Math.max(0, v - this.valley) : this.dir === -1 ? Math.max(0, this.peakVal - v) : 0;
      }
    };
  }
  function makeFreeState(cfg){
    const mult = INTENSITY[cfg.intensity].mult, dets = {};
    cfg.parts.forEach(g => { dets[g] = FREE_SIGNALS[g].map(sig => ({ sig, z: makeZig(sig.med * mult) })); });
    return { dets, lastT:null };
  }
  function pickBest(dets){
    let best = dets[0];
    dets.forEach(d => { if (d.z.cycles > best.z.cycles || (d.z.cycles === best.z.cycles && d.z.cur/d.z.target > best.z.cur/best.z.target)) best = d; });
    return best;
  }
  function freeSummary(cfg){
    const reps = PACE[cfg.pace].reps;
    return 'Tracking ' + cfg.parts.map(p => PARTS[p].toLowerCase()).join(' + ') + ' · ' + INTENSITY[cfg.intensity].label + ' intensity · ' + PACE[cfg.pace].label + ' pace. Aim for about ' + reps + ' full-size reps in ' + (ROUND_MS/1000) + ' s.';
  }
  function buildCustomRoutine(cfg){
    return { id:'custom', engine:'free', category:'custom', tag:'Custom', label: cfg.name || 'Free Movement', cfg,
      shortDesc:'Build your own: pick body parts and intensity.',
      hint:'Do your movement. Only the body parts you picked are scored (' + cfg.parts.map(p => PARTS[p].toLowerCase()).join(', ') + '). Every one of them has to move.',
      research:'Free Movement does not compare you to a fixed routine. It measures how far the body parts you picked move on each repeat, counts full-size repeats, and scores your reps, range and consistency.',
      cues:{ start:'Start your movement.', further:'Bigger — go further.', target:'Make each repeat bigger and keep going.' } };
  }

  // ---------- screens & navigation ----------
  const screens = {};
  ['intro','wizard','home','routines','detail','progress','settings','setup','custom','practice'].forEach(n => { screens[n] = byId('screen-' + n); });
  const NAV = { home:'navHome', routines:'navRoutines', progress:'navProgress', settings:'navSettings' };
  const bottomnav = byId('bottomnav');
  function resetScroll(){ try { if (!/jsdom/i.test(navigator.userAgent)) window.scrollTo(0, 0); } catch(e){} }
  function showScreen(name){
    Object.values(screens).forEach(sc => sc.classList.remove('active'));
    screens[name].classList.add('active');
    bottomnav.classList.toggle('show', !!NAV[name]);
    Object.keys(NAV).forEach(k => byId(NAV[k]).classList.toggle('active', k === name));
    if (name === 'home') renderHome();
    if (name === 'routines') renderRoutineList();
    if (name === 'progress') renderProgress();
    if (name === 'settings') renderSettings();
    if (name === 'custom') renderCustomForm();
    if (name !== 'practice') endEverything();
    resetScroll();
  }
  byId('introStart').addEventListener('click', () => openWizard('intro'));
  Object.keys(NAV).forEach(k => byId(NAV[k]).addEventListener('click', () => showScreen(k)));
  byId('closeToRoutines').addEventListener('click', () => showScreen('routines'));

  let activeCategory = 'all';
  byId('chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active'); activeCategory = chip.dataset.cat; renderRoutineList();
  });

  function loadCustomCfg(){ const c = lsGet(CUSTOM_KEY, null); return (c && Array.isArray(c.parts) && c.parts.length) ? c : { name:'', parts:['arms'], intensity:'medium', pace:'medium' }; }
  let customCfg = loadCustomCfg();

  function makeRow(iconName, tag, title, desc, best, onClick){
    const card = document.createElement('button'); card.className = 'routine-card';
    card.innerHTML = '<div class="idx">'+icon(iconName, 26)+'</div><div class="body"><div class="label">'+tag+'</div><h3>'+title+'</h3><p>'+desc+'</p>'+
      (best !== null ? '<span class="best">Best '+best+'</span>' : '')+'</div><div class="arrow">'+icon('chevron', 20)+'</div>';
    card.addEventListener('click', onClick); return card;
  }
  function renderRoutineList(){
    const container = byId('routineList'); container.innerHTML = '';
    ROUTINES.filter(r => activeCategory === 'all' || r.category === activeCategory).forEach(r => {
      container.appendChild(makeRow(r.id, r.tag, r.label, r.shortDesc, bestScoreFor(r.id), () => showDetail(r.id)));
    });
    if (activeCategory === 'all' || activeCategory === 'custom') {
      container.appendChild(makeRow('free', 'Custom', 'Free Movement', 'Do any movement you like. Pick the body parts and intensity, and it scores you.', bestScoreFor('custom'), () => showScreen('custom')));
    }
    renderNextUp(byId('nextUpRoutines'));
  }

  // ---------- routine detail page ----------
  let detailId = null;
  function showDetail(id){ detailId = id; renderDetail(); showScreen('detail'); }
  function renderDetail(){
    const r = ROUTINES.find(x => x.id === detailId); if (!r) return;
    const sessions = loadSessions().filter(x => x.routineId === r.id), best = bestScoreFor(r.id), t = tierFor(r.id);
    const rows = r.tiers.map((tier, i) =>
      '<tr class="'+(i === t ? 'cur' : '')+'"><td><b>Tier '+(i+1)+'</b><span>'+TIER_NAMES[i]+(i === t ? ' · your level' : '')+'</span></td><td>'+tier.reps+' reps</td><td>'+(tier.hold >= 300 ? (tier.hold/1000).toFixed(1)+' s hold' : 'quick pause')+'</td><td>'+(tier.bpm ? tier.bpm+' bpm' : '—')+'</td></tr>').join('');
    byId('detailBody').innerHTML =
      '<div class="label">'+r.tag+'</div><h2></h2><p class="sub" style="margin-top:.5rem;"></p>'+
      '<div class="stats-row"><div class="stat-card"><div class="sv">'+(best === null ? '–' : best)+'</div><div class="sl">Best score</div></div><div class="stat-card"><div class="sv">'+sessions.length+'</div><div class="sl">Rounds</div></div><div class="stat-card"><div class="sv">'+(t+1)+'</div><div class="sl">Your tier</div></div></div>'+
      '<span class="label section-title">What it trains</span><p class="body-text trains"></p>'+
      '<span class="label section-title">How to do it</span><p class="body-text howto"></p>'+
      '<span class="label section-title">The three tiers</span><table class="tier-table"><tbody>'+rows+'</tbody></table>'+
      '<p class="fine" style="margin-top:.6rem;">Each tier needs bigger movements, more reps, and a longer hold. Reps alternate sides.</p>'+
      '<span class="label section-title">Research behind this routine</span><p class="body-text research"></p>';
    byId('detailBody').querySelector('h2').textContent = r.label;
    byId('detailBody').querySelector('.sub').textContent = r.shortDesc;
    byId('detailBody').querySelector('.trains').textContent = r.trains;
    byId('detailBody').querySelector('.howto').textContent = r.hint;
    byId('detailBody').querySelector('.research').textContent = r.research;
    byId('detailStart').textContent = 'Start ' + r.label + ' →';
  }
  byId('closeDetail').addEventListener('click', () => showScreen('routines'));
  byId('detailStart').addEventListener('click', () => startRoutine(detailId));

  // ---------- "Next up" goal card ----------
  function goalRoutine(){ const g = GOALS[profile.goal]; return ROUTINES.find(r => r.id === (g ? g.first : 'sway')) || ROUTINES[0]; }
  function computeNextGoal(){
    const sessions = loadSessions(), gr = goalRoutine();
    if (!sessions.length) return { title:'Start your first round', detail: gr.label + ' is a good place to begin. ' + gr.shortDesc, routineId:gr.id, cta:'Start ' + gr.label };
    const order = [gr].concat(ROUTINES.filter(r => r !== gr));
    const untried = order.find(r => !sessions.some(x => x.routineId === r.id));
    if (untried) return { title:'Try ' + untried.label, detail:'You haven\'t done this one yet. ' + untried.shortDesc, routineId:untried.id, cta:'Go to ' + untried.label };
    let best = null;
    ROUTINES.forEach(r => {
      const t = tierFor(r.id); if (t >= 2) return;
      const last = sessions.find(x => x.routineId === r.id); const target = r.tiers[t].reps;
      const closeness = Math.min(last.avgScore / 70, last.reps / target);
      if (!best || closeness > best.closeness) best = { r, t, last, target, closeness };
    });
    if (best) return { title:'Reach Tier ' + (best.t+2) + ' in ' + best.r.label, detail:'Score 70+ with at least ' + best.target + ' reps in one round. Last round: ' + best.last.avgScore + ' with ' + best.last.reps + ' reps.', routineId:best.r.id, cta:'Go to ' + best.r.label };
    let weakest = ROUTINES[0], wb = Infinity;
    ROUTINES.forEach(r => { const b2 = bestScoreFor(r.id); if (b2 !== null && b2 < wb) { wb = b2; weakest = r; } });
    return { title:'Beat your best in ' + weakest.label, detail:'Your best round score is ' + wb + '. Aim for ' + Math.min(100, wb + 5) + '.', routineId:weakest.id, cta:'Go to ' + weakest.label };
  }
  function renderNextUp(el){
    const g = computeNextGoal();
    el.innerHTML = '<div class="nextup"><div class="label">Next up</div><h3></h3><p></p><button class="primary" data-go="'+g.routineId+'"></button></div>';
    el.querySelector('h3').textContent = g.title; el.querySelector('p').textContent = g.detail; el.querySelector('button').textContent = g.cta + ' →';
    el.querySelector('button').addEventListener('click', () => startRoutine(g.routineId));
  }
  function emptyArt(){ const hero = byId('screen-intro').querySelector('.hero-art'); return hero ? '<div class="empty-art">' + hero.outerHTML + '</div>' : ''; }

  function computeStreak(sessions){
    if (!sessions.length) return 0;
    const dayMs = 24*60*60*1000;
    const daySet = new Set(sessions.map(s => { const d = new Date(s.date); d.setHours(0,0,0,0); return d.getTime(); }));
    let cursor = new Date(); cursor.setHours(0,0,0,0);
    if (!daySet.has(cursor.getTime())) cursor = new Date(cursor.getTime() - dayMs);
    let streak = 0;
    while (daySet.has(cursor.getTime())) { streak++; cursor = new Date(cursor.getTime() - dayMs); }
    return streak;
  }
  function renderTrendChart(sessions){
    const card = byId('trendCard'), svg = byId('trendSvg');
    const recent = sessions.slice(0, 10).slice().reverse();
    if (recent.length < 2) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    const css = getComputedStyle(document.documentElement), col = n => css.getPropertyValue(n).trim();
    const ink = col('--ink') || '#221F1B', line = col('--line') || '#D8D2C3', accent = col('--accent') || '#47614F', bg = col('--bg') || '#EAE6DC';
    const W = 320, H = 214, L = 40, R = 14, T = 16, B = 46, pw = W-L-R, ph = H-T-B;
    const px = i => L + i * pw / (recent.length - 1), py = v => T + ph - clamp01(v/100) * ph;
    let g = '';
    [0,25,50,75,100].forEach(v => { g += '<line x1="'+L+'" y1="'+py(v)+'" x2="'+(W-R)+'" y2="'+py(v)+'" stroke="'+line+'" stroke-width="1"/><text x="'+(L-6)+'" y="'+(py(v)+3)+'" text-anchor="end">'+v+'</text>'; });
    g += '<line x1="'+L+'" y1="'+py(70)+'" x2="'+(W-R)+'" y2="'+py(70)+'" stroke="'+ink+'" stroke-width="1.2" stroke-dasharray="4 3"/><text x="'+(W-R)+'" y="'+(py(70)-4)+'" text-anchor="end" style="fill:'+ink+';font-weight:700">70 to level up</text>';
    g += '<line x1="'+L+'" y1="'+(T+ph)+'" x2="'+(W-R)+'" y2="'+(T+ph)+'" stroke="'+ink+'" stroke-width="2"/><line x1="'+L+'" y1="'+T+'" x2="'+L+'" y2="'+(T+ph)+'" stroke="'+ink+'" stroke-width="2"/>';
    recent.forEach((s,i) => { g += '<text x="'+px(i)+'" y="'+(T+ph+14)+'" text-anchor="middle">'+(i+1)+'</text>'; });
    g += '<text x="'+(L+pw/2)+'" y="'+(H-8)+'" text-anchor="middle" style="font-weight:700">Round (oldest to newest)</text>';
    g += '<text transform="translate(10 '+(T+ph/2)+') rotate(-90)" text-anchor="middle" style="font-weight:700">Round score</text>';
    g += '<polyline points="'+recent.map((s,i) => px(i).toFixed(1)+','+py(s.avgScore).toFixed(1)).join(' ')+'" fill="none" stroke="'+accent+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
    recent.forEach((s,i) => {
      g += '<circle cx="'+px(i).toFixed(1)+'" cy="'+py(s.avgScore).toFixed(1)+'" r="4.5" fill="'+accent+'" stroke="'+ink+'" stroke-width="1.5"/>';
      if (recent.length <= 6 || i === recent.length - 1) g += '<text x="'+px(i).toFixed(1)+'" y="'+(py(s.avgScore)-9).toFixed(1)+'" text-anchor="middle" style="fill:'+ink+';font-weight:700;font-size:10px">'+s.avgScore+'</text>';
    });
    svg.innerHTML = g;
  }
  // ---------- weekly goal ----------
  function weekInfo(sessions){
    const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dow = (now.getDay() + 6) % 7, monday = new Date(today.getTime() - dow * 86400000);
    const days = [0,0,0,0,0,0,0]; let roundsToday = 0;
    sessions.forEach(x => {
      const d = new Date(x.date), dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const idx = Math.round((dd.getTime() - monday.getTime()) / 86400000);
      if (idx >= 0 && idx < 7) days[idx]++;
      if (dd.getTime() === today.getTime()) roundsToday++;
    });
    return { days, dow, daysDone: days.filter(v => v > 0).length, roundsToday };
  }

  // ---------- Home ----------
  const MOTTO = 'Move a little. Notice the difference.';
  function renderHome(){
    const sessions = loadSessions(), hr = new Date().getHours();
    byId('homeGreeting').textContent = (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + (profile.name ? ', ' + profile.name : '') + '.';
    byId('homeMotto').textContent = MOTTO;
    const wb = byId('welcomeBack'); wb.style.display = 'none';
    if (sessions.length) { const gone = Math.floor((Date.now() - sessions[0].date) / 86400000); if (gone >= 2) { wb.textContent = 'Welcome back. It has been ' + gone + ' days, so ease in with something gentle today.'; wb.style.display = 'block'; } }
    renderNextUp(byId('nextUpHome'));
    const wk = weekInfo(sessions), goal = parseInt(profile.days, 10) || 3, rg = parseInt(profile.rounds, 10) || 1, names = ['M','T','W','T','F','S','S'];
    byId('weekCard').innerHTML = '<div class="label">This week</div><h3 class="wk-h"></h3><div class="week"></div><div class="goalbar"><div class="goalfill"></div></div><p class="fine wk-note"></p>';
    byId('weekCard').querySelector('.wk-h').textContent = wk.daysDone >= goal ? 'Goal reached: ' + wk.daysDone + ' practice days' : wk.daysDone + ' of ' + goal + ' practice days';
    byId('weekCard').querySelector('.week').innerHTML = names.map((n,i) => '<div class="day'+(i === wk.dow ? ' today' : '')+'">'+n+'<div class="dot'+(wk.days[i] > 0 ? ' on' : '')+'"></div></div>').join('');
    byId('weekCard').querySelector('.goalfill').style.width = Math.round(clamp01(wk.daysDone / goal) * 100) + '%';
    byId('weekCard').querySelector('.wk-note').textContent = 'Today: ' + wk.roundsToday + ' of ' + rg + ' round' + (rg === 1 ? '' : 's') + '. You can change your goal in Settings.';
    const best = sessions.length ? Math.max.apply(null, sessions.map(x => x.avgScore)) : '–';
    byId('homeStats').innerHTML =
      '<div class="stat-card"><div class="sv">'+computeStreak(sessions)+'</div><div class="sl">Day streak</div></div>'+
      '<div class="stat-card"><div class="sv">'+sessions.length+'</div><div class="sl">Rounds</div></div>'+
      '<div class="stat-card"><div class="sv">'+best+'</div><div class="sl">Best score</div></div>';
    const lr = byId('lastRoundCard');
    if (!sessions.length) { lr.innerHTML = emptyArt() + '<p class="sub" style="text-align:center;">Your first round will show up here, with a tip for next time.</p>'; return; }
    const x = sessions[0], rt = ROUTINES.find(r => r.id === x.routineId);
    lr.innerHTML = '<div class="label">Last round</div><h3 class="lr-h"></h3><p class="lr-meta"></p><p class="lr-tip"></p>';
    lr.querySelector('.lr-h').textContent = (x.label || (rt ? rt.label : x.routineId)) + ': ' + x.avgScore;
    lr.querySelector('.lr-meta').textContent = x.reps + ' reps' + (typeof x.tier === 'number' ? ' · Tier ' + (x.tier+1) : '') + ' · ' + new Date(x.date).toLocaleDateString();
    lr.querySelector('.lr-tip').textContent = x.tip ? 'Tip for next time: ' + x.tip : 'Tip for next time: keep your reps big and even.';
  }

  // ---------- Progress ----------
  const BADGES = [
    { name:'First round',      desc:'Finish any round.',               test:c => c.sessions.length >= 1 },
    { name:'3-day streak',     desc:'Practice 3 days in a row.',       test:c => c.streak >= 3 },
    { name:'Strong round',     desc:'Score 70 or more in a round.',    test:c => c.sessions.some(x => x.avgScore >= 70) },
    { name:'Level up',         desc:'Play a round on Tier 2 or 3.',    test:c => c.sessions.some(x => typeof x.tier === 'number' && x.tier >= 1) },
    { name:'Tried them all',   desc:'Do all four routines.',           test:c => ROUTINES.every(r => c.sessions.some(x => x.routineId === r.id)) },
    { name:'10 rounds',        desc:'Finish ten rounds.',              test:c => c.sessions.length >= 10 },
    { name:'Even and steady',  desc:'80+ consistency in a round.',     test:c => c.sessions.some(x => x.parts && x.parts[2] >= 80) },
    { name:'Free spirit',      desc:'Try Free Movement.',              test:c => c.sessions.some(x => x.routineId === 'custom') }
  ];
  function renderProgress(){
    const list = loadSessions(), container = byId('progressList'), empty = byId('progressEmpty'), statsRow = byId('statsRow');
    container.innerHTML = ''; renderNextUp(byId('nextUpProgress'));
    const hasData = list.length > 0;
    ['trendCard','bestSection','badgeSection','recentSection'].forEach(id => { byId(id).style.display = hasData ? 'block' : 'none'; });
    empty.style.display = hasData ? 'none' : 'block';
    if (!hasData) { statsRow.innerHTML = ''; empty.innerHTML = emptyArt() + '<p class="sub" style="text-align:center;">No rounds yet. Finish a routine to see your progress here.</p>'; renderBadges(list); byId('badgeSection').style.display = 'block'; return; }
    const totalReps = list.reduce((a,x) => a + (x.reps||0), 0);
    statsRow.innerHTML =
      '<div class="stat-card"><div class="sv">'+list.length+'</div><div class="sl">Rounds</div></div>'+
      '<div class="stat-card"><div class="sv">'+totalReps+'</div><div class="sl">Total Reps</div></div>'+
      '<div class="stat-card"><div class="sv">'+computeStreak(list)+'</div><div class="sl">Day Streak</div></div>';
    renderTrendChart(list);
    const bl = byId('bestList'); bl.innerHTML = '';
    ROUTINES.concat([{ id:'custom', label:'Free Movement' }]).forEach(r => {
      const mine = list.filter(x => x.routineId === r.id), b2 = mine.length ? Math.max.apply(null, mine.map(x => x.avgScore)) : null;
      const row = document.createElement('div'); row.className = 'progress-row';
      row.innerHTML = '<div><div class="rname"></div><div class="rdate"></div></div><div class="rscore"></div>';
      row.querySelector('.rname').textContent = r.label;
      row.querySelector('.rdate').textContent = mine.length ? mine.length + ' round' + (mine.length === 1 ? '' : 's') + (r.tiers ? ' · Tier ' + (tierFor(r.id)+1) : '') : 'Not tried yet';
      row.querySelector('.rscore').textContent = b2 === null ? '–' : b2; bl.appendChild(row);
    });
    renderBadges(list);
    list.slice(0,20).forEach(x => {
      const routine = ROUTINES.find(r => r.id === x.routineId); const d = new Date(x.date);
      const row = document.createElement('div'); row.className = 'progress-row';
      const tierTxt = (typeof x.tier === 'number') ? ' · Tier ' + (x.tier+1) : '';
      row.innerHTML = '<div><div class="rname"></div><div class="rdate">'+d.toLocaleDateString()+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+'</div></div>'+
        '<div class="rscore">'+x.avgScore+'<span class="rreps">'+x.reps+' reps'+tierTxt+'</span></div>';
      row.querySelector('.rname').textContent = x.label || (routine ? routine.label : x.routineId);
      container.appendChild(row);
    });
  }
  function renderBadges(list){
    const ctxB = { sessions:list, streak:computeStreak(list) }, grid = byId('badgeGrid'); grid.innerHTML = '';
    BADGES.forEach(bd => {
      const ok = bd.test(ctxB), el = document.createElement('div'); el.className = 'badge ' + (ok ? 'earned' : 'locked');
      el.innerHTML = '<b>'+icon(ok ? 'check' : 'lock', 16)+'<i></i></b><span></span>'; el.querySelector('b i').textContent = bd.name; el.querySelector('span').textContent = bd.desc; grid.appendChild(el);
    });
  }

  // ---------- Settings ----------
  function buildSummary(){
    const list = loadSessions(), lines = [];
    lines.push('StepAlong progress summary' + (profile.name ? ' for ' + profile.name : ''));
    lines.push('Generated ' + new Date().toLocaleDateString());
    lines.push(''); lines.push('Rounds: ' + list.length + ' | Total reps: ' + list.reduce((a,x) => a + (x.reps||0), 0) + ' | Day streak: ' + computeStreak(list));
    lines.push(''); lines.push('Best round score by routine:');
    ROUTINES.concat([{ id:'custom', label:'Free Movement' }]).forEach(r => { const b2 = bestScoreFor(r.id); lines.push('- ' + r.label + ': ' + (b2 === null ? 'not tried yet' : b2) + (r.tiers ? ' (Tier ' + (tierFor(r.id)+1) + ')' : '')); });
    lines.push(''); lines.push('Recent rounds (newest first):');
    list.slice(0, 15).forEach(x => { const rt = ROUTINES.find(r => r.id === x.routineId); lines.push('- ' + new Date(x.date).toLocaleDateString() + ': ' + (x.label || (rt ? rt.label : x.routineId)) + ', score ' + x.avgScore + ', ' + x.reps + ' reps' + (typeof x.tier === 'number' ? ', Tier ' + (x.tier+1) : '')); });
    if (!list.length) lines.push('- none yet');
    lines.push(''); lines.push('Scores come from a camera-based practice app and are self-tracked. They are not a medical assessment.');
    return lines.join('\n');
  }
  function renderSettings(){
    byId('setName').value = profile.name || ''; byId('setDays').value = String(profile.days); byId('setRounds').value = String(profile.rounds);
    byId('summaryText').value = buildSummary(); byId('summaryStatus').textContent = '';
  }
  byId('setName').addEventListener('input', (e) => { profile.name = e.target.value.slice(0, 24); saveProfile(); byId('summaryText').value = buildSummary(); });
  byId('setDays').addEventListener('change', (e) => { profile.days = parseInt(e.target.value, 10); saveProfile(); });
  byId('setRounds').addEventListener('change', (e) => { profile.rounds = parseInt(e.target.value, 10); saveProfile(); });
  byId('btnRerunWizard').addEventListener('click', () => openWizard('settings'));
  byId('copySummaryBtn').addEventListener('click', async () => {
    const text = buildSummary(); byId('summaryText').value = text;
    try { await navigator.clipboard.writeText(text); byId('summaryStatus').textContent = 'Copied to your clipboard.'; }
    catch (e) { const ta = byId('summaryText'); ta.focus(); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e2) {} byId('summaryStatus').textContent = ok ? 'Copied to your clipboard.' : 'Select the text above and copy it.'; }
  });
  byId('downloadSummaryBtn').addEventListener('click', () => {
    try { const blob = new Blob([buildSummary()], { type:'text/plain' }), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'stepalong-progress-summary.txt'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 500); byId('summaryStatus').textContent = 'Summary downloaded.'; }
    catch (e) { byId('summaryStatus').textContent = 'Download is not available here. Use Copy instead.'; }
  });
  function twoTap(btnId, label, armedLabel, action){
    let armed = false, timer = null; const btn = byId(btnId);
    btn.addEventListener('click', () => {
      if (!armed) { armed = true; btn.textContent = armedLabel; timer = setTimeout(() => { armed = false; btn.textContent = label; }, 4000); return; }
      clearTimeout(timer); armed = false; btn.textContent = label; action();
    });
  }
  twoTap('resetProgressBtn', 'Reset progress', 'Tap again to erase all progress', () => {
    try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(DIFF_KEY); } catch (e) {}
    Object.keys(difficultyMap).forEach(k => delete difficultyMap[k]); renderSettings(); byId('summaryStatus').textContent = 'Progress erased.';
  });
  twoTap('resetAllBtn', 'Start over (replay first-time setup)', 'Tap again to erase everything', () => {
    [STORE_KEY, DIFF_KEY, PROFILE_KEY, SETUP_KEY, CUSTOM_KEY].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
    Object.keys(difficultyMap).forEach(k => delete difficultyMap[k]); profile = Object.assign({}, DEFAULT_PROFILE); customCfg = loadCustomCfg(); applyProfile(); showScreen('intro');
  });

  // ---------- first-time wizard ----------
  let wizStep = 1, wizFrom = 'intro';
  function fillSelect(id, entries, current){ const el = byId(id); el.innerHTML = ''; entries.forEach(e => { const o = document.createElement('option'); o.value = e[0]; o.textContent = e[1]; el.appendChild(o); }); el.value = String(current); }
  function openWizard(from){
    wizFrom = from; wizStep = 1;
    fillSelect('wizGoal', Object.keys(GOALS).map(k => [k, GOALS[k].label]), profile.goal);
    fillSelect('wizSteady', Object.keys(STEADY).map(k => [k, STEADY[k].label]), profile.steady);
    byId('wizName').value = profile.name || '';
    byId('wizDays').value = String(profile.days); byId('wizRounds').value = String(profile.rounds);
    byId('wizText').value = profile.text; byId('wizContrast').value = profile.contrast; byId('wizVoice').value = profile.voice; byId('wizBeats').value = profile.beats;
    renderWizard(); showScreen('wizard');
  }
  function renderWizard(){
    document.querySelectorAll('.wiz-step').forEach(el => el.classList.toggle('active', parseInt(el.dataset.step, 10) === wizStep));
    [...byId('wizDots').children].forEach((d,i) => d.classList.toggle('on', i < wizStep));
    byId('wizStepLabel').textContent = 'Step ' + wizStep + ' of 3';
    byId('wizNext').textContent = wizStep === 3 ? 'Finish' : 'Next';
    const careful = STEADY[byId('wizSteady').value] && STEADY[byId('wizSteady').value].careful;
    byId('wizCareful').style.display = careful ? 'block' : 'none';
  }
  byId('wizSteady').addEventListener('change', renderWizard);
  byId('wizBack').addEventListener('click', () => { if (wizStep > 1) { wizStep--; renderWizard(); } else showScreen(wizFrom === 'settings' ? 'settings' : 'intro'); });
  byId('wizNext').addEventListener('click', () => {
    if (wizStep < 3) { wizStep++; renderWizard(); return; }
    profile.name = byId('wizName').value.trim().slice(0, 24); profile.goal = byId('wizGoal').value; profile.steady = byId('wizSteady').value;
    profile.days = parseInt(byId('wizDays').value, 10); profile.rounds = parseInt(byId('wizRounds').value, 10);
    profile.text = byId('wizText').value; profile.contrast = byId('wizContrast').value; profile.voice = byId('wizVoice').value; profile.beats = byId('wizBeats').value;
    profile.onboarded = true; saveProfile(); applyProfile();
    const played = loadSessions();   // starting level only applies to routines she has not played yet
    ROUTINES.forEach(r => { if (!played.some(x => x.routineId === r.id)) difficultyMap[r.id] = STEADY[profile.steady].tier; });
    saveDifficulty(); showScreen('home');
  });

  // ---------- free-movement builder ----------
  function renderCustomForm(){
    const cfg = customCfg;
    byId('customName').value = cfg.name || '';
    document.querySelectorAll('#partsRow .opt').forEach(b => b.classList.toggle('on', cfg.parts.indexOf(b.dataset.part) !== -1));
    document.querySelectorAll('#intensitySeg button').forEach(b => b.classList.toggle('active', b.dataset.v === cfg.intensity));
    document.querySelectorAll('#paceSeg button').forEach(b => b.classList.toggle('active', b.dataset.v === cfg.pace));
    byId('customSummary').textContent = cfg.parts.length ? freeSummary(cfg) : 'Pick at least one body part to track.';
    byId('customError').style.display = 'none';
  }
  byId('presetRow').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; customCfg = JSON.parse(JSON.stringify(PRESETS[b.dataset.preset])); renderCustomForm(); });
  byId('partsRow').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; const p = b.dataset.part, i = customCfg.parts.indexOf(p);
    if (i === -1) customCfg.parts.push(p); else customCfg.parts.splice(i, 1);
    customCfg.parts.sort((a,c) => ['arms','legs','torso'].indexOf(a) - ['arms','legs','torso'].indexOf(c)); renderCustomForm();
  });
  byId('intensitySeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; customCfg.intensity = b.dataset.v; renderCustomForm(); });
  byId('paceSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; customCfg.pace = b.dataset.v; renderCustomForm(); });
  byId('customName').addEventListener('input', (e) => { customCfg.name = e.target.value.slice(0, 24); });
  byId('closeCustom').addEventListener('click', () => showScreen('routines'));
  byId('customStart').addEventListener('click', () => {
    if (!customCfg.parts.length) { const er = byId('customError'); er.textContent = 'Pick at least one body part to track.'; er.style.display = 'block'; return; }
    lsSet(CUSTOM_KEY, customCfg); startRoutine('custom');
  });

  // ---------- practice state ----------
  let activeRoutine=null, routineState=null, roundPhase='idle', lastPersonAt=0, calibSides=[];
  let repCount=0, repPeaks=[], bestLive=0, roundTier=0, readyTimer=null, roundStartAt=0, roundTickId=null, lastCueAt=0;
  const feedbackLine = byId('feedbackLine');

  function startRoutine(routineId){
    activeRoutine = routineId === 'custom' ? buildCustomRoutine(customCfg) : ROUTINES.find(r => r.id === routineId);
    routineState = null; repCount = 0; repPeaks = []; bestLive = 0; roundPhase = 'idle';
    byId('practiceTitle').textContent = activeRoutine.label;
    byId('practiceCategory').textContent = activeRoutine.tag;
    byId('practiceHint').textContent = activeRoutine.hint;
    byId('researchNote').textContent = activeRoutine.research || '';
    byId('repCount').textContent = '0';
    renderTierPicker(); updateTierLabel(); updateGauge(null); updateHoldBar(0);
    feedbackLine.textContent = '';
    byId('stageEmpty').style.display = 'flex';
    byId('beginBtnWrap').style.display = 'none';
    byId('readyOverlay').classList.remove('show');
    byId('completeOverlay').classList.remove('show');
    byId('timerPill').style.display = 'none';
    byId('startBtn').disabled = false; byId('startBtn').textContent = 'Start camera';
    byId('statusPill').textContent = 'Camera not started';
    byId('cameraError').style.display = 'none';
    lastPersonAt = performance.now();
    showScreen(hasSeenSetup() ? 'practice' : 'setup');
  }
  function hasSeenSetup(){ return lsGet(SETUP_KEY, 0) === 1; }
  byId('setupContinue').addEventListener('click', () => { lsSet(SETUP_KEY, 1); showScreen(activeRoutine ? 'practice' : 'routines'); });
  byId('closeSetup').addEventListener('click', () => showScreen(activeRoutine && hasSeenSetup() ? 'practice' : 'routines'));
  byId('setupTipsLink').addEventListener('click', () => showScreen('setup'));

  function isFree(){ return activeRoutine && activeRoutine.engine === 'free'; }
  function updateTierLabel(){
    byId('tierLabel').textContent = isFree() ? INTENSITY[activeRoutine.cfg.intensity].label + ' intensity' : 'Tier ' + (tierFor(activeRoutine.id)+1);
  }
  function renderTierPicker(){
    const picker = byId('tierPicker');
    if (isFree()) { picker.style.display = 'none'; byId('tierInfo').textContent = freeSummary(activeRoutine.cfg); return; }
    picker.style.display = 'flex';
    const t = tierFor(activeRoutine.id), tier = activeRoutine.tiers[t];
    [...picker.children].forEach((b,i) => b.classList.toggle('active', i === t));
    byId('tierInfo').textContent = 'Tier ' + (t+1) + ': aim for ' + tier.reps + ' reps in ' + (ROUND_MS/1000) + ' s, alternating sides, ' + (tier.hold >= 300 ? 'holding each for ' + (tier.hold/1000).toFixed(1) + ' s.' : 'with a quick pause at the top of each.');
  }
  byId('tierPicker').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || isFree() || roundPhase === 'ready' || roundPhase === 'active') return;
    difficultyMap[activeRoutine.id] = parseInt(b.dataset.tier, 10); saveDifficulty(); renderTierPicker(); updateTierLabel();
  });

  const videoEl = byId('video'), canvasEl = byId('canvas'), ctx = canvasEl.getContext('2d');
  const startBtn = byId('startBtn'), stageEmpty = byId('stageEmpty'), statusPill = byId('statusPill');
  const scoreNum = byId('scoreNum'), scoreFill = byId('scoreFill'), holdBarFill = byId('holdBarFill'), timerPill = byId('timerPill');

  function updateGauge(score){
    scoreNum.textContent = score === null ? '–' : score;
    scoreFill.style.width = (score === null ? 0 : score) + '%';
    scoreFill.style.background = score === null ? 'transparent' : score >= 70 ? 'var(--good)' : score >= 40 ? 'var(--mid)' : 'var(--low)';
  }
  function updateHoldBar(f){ holdBarFill.style.width = Math.round(clamp01(f)*100) + '%'; }
  function applyCue(text, kind, now, force){
    if (text === feedbackLine.textContent) return;
    if (!force && now - lastCueAt < 1200) return;
    feedbackLine.textContent = text; lastCueAt = now;
    if (kind === 'counted') maybeSpeak('Nice, that counted', 3000); else if (kind === 'guide') maybeSpeak(text, 8000);
  }

  // ---------- round flow ----------
  const CALIB_TEXT = 'Stand still — calibrating';
  function beginRound(){
    byId('beginBtnWrap').style.display = 'none';
    calibSides = []; roundPhase = 'ready';
    const calib = isFree() ? 'Get ready' : CALIB_TEXT;
    let n = 3;
    byId('readyOverlay').innerHTML = '<div class="big-num" id="readyNum">3</div><div class="calib">'+calib+'</div>';
    byId('readyOverlay').classList.add('show');
    readyTimer = setInterval(() => {
      n -= 1;
      if (n > 0) { byId('readyNum').textContent = String(n); }
      else if (n === 0) { byId('readyOverlay').innerHTML = '<div class="go">Go!</div>'; }
      else { clearInterval(readyTimer); readyTimer = null; byId('readyOverlay').classList.remove('show'); startActiveRound(); }
    }, 700);
  }
  function startActiveRound(){
    roundPhase = 'active'; roundTier = isFree() ? 0 : tierFor(activeRoutine.id);
    repCount = 0; repPeaks = []; bestLive = 0; lastCueAt = 0; feedbackLine.textContent = '';
    if (isFree()) routineState = makeFreeState(activeRoutine.cfg);
    else {
      // Neutral stance measured during the countdown; all movement is scored relative to it.
      const base = activeRoutine.defaultBase.map((d,i) => calibSides.length >= 8 ? median(calibSides.map(s => s[i])) : d);
      routineState = { sm:[0,0], init:false, armed:[true,true], holdMs:[0,0], peak:[0,0], lastSide:-1, base, lastT:null, flashUntil:0, flashText:'', flashKind:'', series:[[],[]] };
    }
    byId('repCount').textContent = '0'; updateTierLabel();
    roundStartAt = Date.now(); timerPill.style.display = 'block'; timerPill.textContent = formatTime(ROUND_MS);
    if (!isFree()) { const tier = activeRoutine.tiers[roundTier]; if (activeRoutine.beat && tier.bpm) startMetronome(tier.bpm); }
    roundTickId = setInterval(() => {
      const remaining = ROUND_MS - (Date.now() - roundStartAt);
      if (remaining <= 0) { timerPill.textContent = '0:00'; endRound(); } else { timerPill.textContent = formatTime(remaining); }
    }, 250);
  }
  function formatTime(ms){ const s = Math.max(0, Math.ceil(ms/1000)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }

  function sideBreakdown(){
    // left-vs-right (or part-by-part for Free Movement): a 0-100 score per side from its biggest typical movement
    const st = routineState;
    if (isFree()) {
      const groups = activeRoutine.cfg.parts;
      return { title:'By body part', names:groups.map(g => PARTS[g].toLowerCase()), labels:groups.map(g => PARTS[g]), cues:groups.map(g => 'Put more effort into your ' + PARTS[g].toLowerCase() + '.'),
               scores:groups.map(g => { const b = pickBest(st.dets[g]); return b.z.peaks.length ? liveScore(mean(b.z.peaks)) : 0; }) };
    }
    return { title:'Left vs right', names:activeRoutine.sideNames, labels:activeRoutine.sideLabels, cues:activeRoutine.sideCues,
             scores:[liveScore(pctl(st.series[0], 0.95)), liveScore(pctl(st.series[1], 0.95))] };
  }
  function endRound(){
    roundPhase = 'complete';
    if (roundTickId) { clearInterval(roundTickId); roundTickId = null; }
    stopMetronome(); timerPill.style.display = 'none';
    updateHoldBar(0);  // don't leave a half-filled hold bar under the results overlay
    const free = isFree();
    const target = free ? PACE[activeRoutine.cfg.pace].reps : activeRoutine.tiers[roundTier].reps;
    const res = computeRound(repCount, repPeaks, target, bestLive);
    const sides = sideBreakdown();
    let coach = focusMessage(res, repCount, target, activeRoutine.cues, sides);
    const rec = { routineId: activeRoutine.id, date: Date.now(), avgScore: res.score, bestScore: bestLive, reps: repCount, tier: free ? null : roundTier,
      parts:[Math.round(res.repsPart*100), Math.round(res.depthPart*100), Math.round(res.consPart*100)], sides: sides.scores, tip: coach };
    if (free) rec.label = activeRoutine.label;
    saveSession(rec);
    if (!free && res.score >= 70 && repCount >= target && roundTier < 2) {
      difficultyMap[activeRoutine.id] = roundTier + 1; saveDifficulty(); updateTierLabel(); renderTierPicker();
      coach = 'Tier up! You are now on Tier ' + (roundTier+2) + '. ' + coach;
    }
    byId('statAvg').textContent = res.score; byId('statReps').textContent = repCount;
    [['Reps', res.repsPart, repCount + '/' + target], ['Range', res.depthPart, Math.round(res.depthPart*100)], ['Cons', res.consPart, Math.round(res.consPart*100)]].forEach(r => {
      byId('bd'+r[0]+'Fill').style.width = Math.round(r[1]*100) + '%'; byId('bd'+r[0]+'Val').textContent = r[2];
    });
    byId('sideTitle').textContent = sides.title;
    const weakIdx = sides.scores.length > 1 ? sides.scores.indexOf(Math.min.apply(null, sides.scores)) : -1, imbalance = sideAdvice(sides, repCount) !== '';
    byId('sideBars').innerHTML = sides.labels.map((l,i) => '<div class="bd-row"><span>'+l+'</span><div class="bd-track"><div class="bd-fill'+(imbalance && i === weakIdx ? ' weak' : '')+'" style="width:'+sides.scores[i]+'%"></div></div><b>'+sides.scores[i]+'</b></div>').join('');
    byId('coachLine').textContent = coach;
    byId('completeOverlay').classList.add('show');
    speak('Round complete. Score ' + res.score + '. ' + coach);
  }
  byId('anotherRoundBtn').addEventListener('click', () => { byId('completeOverlay').classList.remove('show'); beginRound(); });
  byId('doneRoundBtn').addEventListener('click', () => showScreen('routines'));

  // ---------- per-frame processing ----------
  function onResults(results){
    if (!modelReady) { modelReady = true; hideLoading(); }
    canvasEl.width = videoEl.videoWidth; canvasEl.height = videoEl.videoHeight;
    ctx.save(); ctx.clearRect(0,0,canvasEl.width, canvasEl.height);
    if (results.poseLandmarks && activeRoutine) {
      const lm = results.poseLandmarks; lastPersonAt = performance.now();
      window.drawConnectors(ctx, lm, window.POSE_CONNECTIONS, {color:'rgba(143,183,154,0.95)', lineWidth:3});
      window.drawLandmarks(ctx, lm, {color:'#3A2A12', fillColor:'#E3A855', radius:4, lineWidth:1});
      if (roundPhase === 'idle') { byId('beginBtnWrap').style.display = 'block'; statusPill.textContent = 'Person detected. Ready when you are.'; ctx.restore(); return; }
      if (roundPhase === 'ready') { if (!isFree()) calibSides.push(activeRoutine.sides(lm)); ctx.restore(); return; }
      if (roundPhase !== 'active') { ctx.restore(); return; }

      const st = routineState, now = performance.now();
      const dt = st.lastT ? Math.min(now - st.lastT, 100) : 0; st.lastT = now;
      let live = 0, holdFrac = 0, cue = '', kind = 'guide', force = false, dbg = '';

      if (isFree()) {
        const groups = activeRoutine.cfg.parts;
        groups.forEach(g => st.dets[g].forEach(d => d.z.update(d.sig.fn(lm))));
        const best = groups.map(g => pickBest(st.dets[g]));
        const ratios = best.map(b => b.z.cur / b.z.target);
        live = liveScore(Math.min.apply(null, ratios));
        const repsNow = Math.min.apply(null, best.map(b => b.z.cycles));
        let counted = false;
        while (repCount < repsNow) { const idx = repCount; repCount++; repPeaks.push(mean(best.map(b => (b.z.peaks[idx] !== undefined ? b.z.peaks[idx] : (b.z.peaks[b.z.peaks.length-1] || 0))))); counted = true; }
        if (counted) { byId('repCount').textContent = String(repCount); st.flashUntil = now + 1400; st.flashText = 'Nice — that one counted.'; st.flashKind = 'counted'; }
        let weak = 0, strong = 0; ratios.forEach((r,i) => { if (r < ratios[weak]) weak = i; if (r > ratios[strong]) strong = i; });
        if (counted || now < st.flashUntil) { cue = st.flashText; kind = st.flashKind; force = counted; }
        else if (groups.length > 1 && ratios[strong] > 0.6 && ratios[weak] < 0.5 * ratios[strong]) { cue = 'Bring your ' + PARTS[groups[weak]].toLowerCase() + ' up to match.'; }
        else if (live >= HOLD_GOOD) { cue = 'Good — keep that size.'; kind = 'hold'; }
        else if (live < 30) { cue = activeRoutine.cues.start; }
        else { cue = activeRoutine.cues.further; }
        if (DEBUG) dbg = best.map((b,i) => groups[i] + ':' + b.sig.name + ' ' + b.z.cur.toFixed(2) + '/' + b.z.target.toFixed(2) + ' c=' + b.z.cycles).join(' | ');
      } else {
        const tier = activeRoutine.tiers[roundTier], sv = activeRoutine.sides(lm);
        const scores = [0,0], ratios = [0,0], devs = [0,0];
        for (let i = 0; i < 2; i++) {
          devs[i] = Math.max(0, sv[i] - st.base[i]);
          st.sm[i] = st.init ? st.sm[i]*0.72 + devs[i]*0.28 : devs[i];
          ratios[i] = st.sm[i] / tier.amp[i]; scores[i] = liveScore(ratios[i]); st.series[i].push(ratios[i]);
        }
        st.init = true; live = Math.max(scores[0], scores[1]);
        let counted = false, repeated = false;
        for (let i = 0; i < 2; i++) {
          st.peak[i] = Math.max(st.peak[i], ratios[i]);
          if (scores[i] >= HOLD_GOOD) {
            if (st.armed[i]) {
              st.holdMs[i] += dt; holdFrac = Math.max(holdFrac, st.holdMs[i] / tier.hold);
              if (st.holdMs[i] >= tier.hold) {
                st.armed[i] = false; st.holdMs[i] = 0;
                if (st.lastSide !== i) { repCount++; repPeaks.push(st.peak[i]); st.lastSide = i; counted = true; } else { repeated = true; }
              }
            }
          } else {
            st.holdMs[i] = 0;
            if (scores[i] <= REARM_BELOW) { st.armed[i] = true; st.peak[i] = 0; }
          }
        }
        if (counted) { byId('repCount').textContent = String(repCount); st.flashUntil = now + 1400; st.flashText = 'Nice — that one counted.'; st.flashKind = 'counted'; }
        else if (repeated) { st.flashUntil = now + 2200; st.flashText = 'Same side again — ' + activeRoutine.switchCues[st.lastSide].toLowerCase(); st.flashKind = 'guide'; }
        if (counted || repeated || now < st.flashUntil) { cue = st.flashText; kind = st.flashKind; force = counted; }
        else if (live >= HOLD_GOOD) { cue = 'Good — hold it.'; kind = 'hold'; }
        else if ((!st.armed[0] && scores[0] > REARM_BELOW) || (!st.armed[1] && scores[1] > REARM_BELOW)) { cue = 'Return to your starting position first.'; }
        else if (live < 30) { cue = st.lastSide === -1 ? activeRoutine.cues.start : activeRoutine.switchCues[st.lastSide]; }
        else { cue = activeRoutine.cues.further; }
        if (DEBUG) dbg = activeRoutine.sideLabels.map((l,i) => l + ' ' + devs[i].toFixed(2) + '/' + tier.amp[i] + ' =' + scores[i]).join(' | ') + ' base=' + st.base.map(b => b.toFixed(2)).join(',');
      }
      bestLive = Math.max(bestLive, live); updateGauge(live); updateHoldBar(holdFrac);
      applyCue(cue, kind, now, force);
      statusPill.textContent = DEBUG ? dbg : 'Tracking';
    } else {
      updateGauge(null); updateHoldBar(0);
      if (routineState) { routineState.lastT = null; if (routineState.holdMs) routineState.holdMs = [0,0]; }
      if (performance.now() - lastPersonAt > 5000) {
        statusPill.textContent = "We can't see you — step back so your whole body is in frame and check the lighting.";
        if (roundPhase === 'active') feedbackLine.textContent = 'Having trouble seeing you. Try more light or stepping back.';
      } else { statusPill.textContent = 'No person detected — step into frame'; }
    }
    ctx.restore();
  }

  // ---------- camera ----------
  function withTimeout(p, ms, msg){ return Promise.race([p, new Promise((_,rej) => setTimeout(() => rej(new Error(msg)), ms))]); }
  let cameraStarted=false, mediaStream=null, rafId=null, poseInstance=null, modelReady=false, loadTimer=null;
  function hideLoading(){ if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; } byId('loadingOverlay').classList.remove('show'); }
  // One frame at a time: send the current video frame to MediaPipe, then schedule the next.
  // try/catch so a single failed frame doesn't silently stop tracking for the rest of the session,
  // and stop scheduling once the camera has been stopped.
  async function frameLoop(pose){
    try { if (videoEl.readyState >= 2) { await pose.send({image: videoEl}); } }
    catch (e) { console.warn('Pose frame failed:', e); }
    if (cameraStarted) rafId = requestAnimationFrame(() => frameLoop(pose));
  }
  function endEverything(){
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (roundTickId) { clearInterval(roundTickId); roundTickId = null; }
    if (readyTimer) { clearInterval(readyTimer); readyTimer = null; }
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    stopMetronome(); cameraStarted = false; roundPhase = 'idle'; hideLoading();
  }
  function friendlyCameraError(err){
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return "Camera access is blocked. Click the camera icon in your browser's address bar, choose Allow, then tap Try Again. (Also check your computer's camera privacy settings.)";
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return "No camera was found. Connect or enable a camera, then tap Try Again.";
    if (name === 'NotReadableError') return "Your camera is being used by another app or tab. Close it, then tap Try Again.";
    if (name === 'PoseLoadError') return "Couldn't load the pose-tracking model. Check your internet connection, reload the page, and try again.";
    if (name === 'NoCameraApi') return "This browser can't access the camera here. Use the latest Chrome, Edge, or Safari, and open the app over https or localhost.";
    const m = err && err.message ? err.message : '';
    if (m.indexOf('permission prompt') !== -1) return "The camera permission prompt didn't respond. Reload the page and try again. If you're viewing this inside another app's preview, open it in its own browser tab.";
    return m || 'Camera access failed. Reload the page and try again.';
  }
  startBtn.addEventListener('click', async () => {
    if (cameraStarted) return;
    startBtn.textContent = 'Starting…'; startBtn.disabled = true;
    statusPill.textContent = 'Requesting camera permission…'; byId('cameraError').style.display = 'none';
    try {
      if (typeof window.Pose !== 'function') { const e = new Error('pose-load'); e.name = 'PoseLoadError'; throw e; }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { const e = new Error('no-camera-api'); e.name = 'NoCameraApi'; throw e; }
      mediaStream = await withTimeout(navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}, audio:false}), 8000, 'No response from the camera permission prompt.');
      videoEl.srcObject = mediaStream;
      await withTimeout(videoEl.play(), 5000, 'Video failed to start playing.');
      poseInstance = new window.Pose({ locateFile:(f) => 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@' + POSE_VERSION + '/' + f });
      poseInstance.setOptions({ modelComplexity:1, smoothLandmarks:true, minDetectionConfidence:0.5, minTrackingConfidence:0.5 });
      poseInstance.onResults(onResults);
      cameraStarted = true; modelReady = false; stageEmpty.style.display = 'none'; statusPill.textContent = 'Loading pose model…';
      byId('loadingText').textContent = 'Loading pose model…'; byId('loadingOverlay').classList.add('show');
      loadTimer = setTimeout(() => { byId('loadingText').textContent = 'Still loading. The first time can take a few seconds.'; }, 8000);
      frameLoop(poseInstance);
    } catch (err) {
      if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
      startBtn.disabled = false; startBtn.textContent = 'Try again';
      const box = byId('cameraError'); box.textContent = friendlyCameraError(err); box.style.display = 'block';
      statusPill.textContent = 'Camera not started'; hideLoading();
    }
  });

  byId('beginBtn').addEventListener('click', beginRound);
  window.addEventListener('beforeunload', endEverything);

  applyProfile();
  if (profile.onboarded) showScreen('home');   // first visit: welcome (intro) -> wizard -> Home. Return visits: straight to Home.
})();
