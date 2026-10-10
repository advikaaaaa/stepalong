(function () {
  "use strict";

  const LM = { NOSE:0, LSH:11, RSH:12, LEL:13, REL:14, LWR:15, RWR:16,
    LHIP:23, RHIP:24, LKNEE:25, RKNEE:26, LANK:27, RANK:28, LHEEL:29, RHEEL:30, LFOOT:31, RFOOT:32 };
  function dist(a,b){ if(!a||!b) return 0; return Math.hypot(a.x-b.x, a.y-b.y); }
  function mid(a,b){ return {x:(a.x+b.x)/2, y:(a.y+b.y)/2}; }
  function clamp01(v){ return Math.max(0, Math.min(1, v)); }
  function torsoLen(lm){ return dist(mid(lm[LM.LSH],lm[LM.RSH]), mid(lm[LM.LHIP],lm[LM.RHIP])) || 0.0001; }
  function shoulderWidth(lm){ return dist(lm[LM.LSH], lm[LM.RSH]) || 0.0001; }

  const STORE_KEY = 'stepalong_sessions_v2';
  const DIFF_KEY = 'stepalong_difficulty_v2';
  function loadSessions(){ try { const r = localStorage.getItem(STORE_KEY); return r ? JSON.parse(r) : []; } catch(e){ return []; } }
  function saveSession(rec){ try { const l = loadSessions(); l.unshift(rec); localStorage.setItem(STORE_KEY, JSON.stringify(l.slice(0,50))); } catch(e){} }
  function loadDifficulty(){ try { const r = localStorage.getItem(DIFF_KEY); return r ? JSON.parse(r) : {}; } catch(e){ return {}; } }
  function saveDifficulty(m){ try { localStorage.setItem(DIFF_KEY, JSON.stringify(m)); } catch(e){} }
  function bestScoreFor(routineId){
    const s = loadSessions().filter(x => x.routineId === routineId);
    if (!s.length) return null;
    return Math.max(...s.map(x => x.avgScore));
  }

  let largeText=false, highContrast=false, voiceOn=false;
  function speak(text){
    if (!voiceOn) return;
    try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate=1.0; window.speechSynthesis.speak(u); } catch(e){}
  }
  document.getElementById('btnLargeText').addEventListener('click', function(){
    largeText = !largeText; document.body.classList.toggle('large-text', largeText); this.classList.toggle('on', largeText);
  });
  document.getElementById('btnHighContrast').addEventListener('click', function(){
    highContrast = !highContrast; document.documentElement.setAttribute('data-contrast', highContrast ? 'high':'normal'); this.classList.toggle('on', highContrast);
  });
  document.getElementById('btnVoice').addEventListener('click', function(){
    voiceOn = !voiceOn; this.classList.toggle('on', voiceOn); if (voiceOn) speak('Voice feedback on');
  });

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
  const beatPulse = document.getElementById('beatPulse');
  let metronomeId = null;
  function startMetronome(bpm){
    stopMetronome();
    metronomeId = setInterval(() => { beep(); beatPulse.classList.add('flash'); setTimeout(() => beatPulse.classList.remove('flash'), 90); }, 60000/bpm);
  }
  function stopMetronome(){ if (metronomeId) { clearInterval(metronomeId); metronomeId = null; } beatPulse.classList.remove('flash'); }

  // Recalibrated, smoothed, generic routines.
  const ROUTINES = [
    {
      id:'sway', category:'legs', tag:'Balance', label:'Standing Sway',
      shortDesc:'Shift your weight smoothly from side to side.',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 21v-4M12 7l-7 1 2 5a3 3 0 0 0 6 0zM12 7l7 1-2 5a3 3 0 0 1-6 0"/></svg>',
      hint:'Stand with feet apart. Slowly shift your weight onto one foot, then the other.',
      research:'Balance and fall-prevention training is a core part of physical therapy for older adults and people with neurological conditions — postural instability in particular is a well-documented symptom in Parkinson\'s disease research.',
      tiers:[ {amplitude:0.09}, {amplitude:0.13}, {amplitude:0.17} ], beatBpm:null,
      mode:'abs', defaultBaseline:0,  // signed hip-vs-ankle offset (in shoulder widths); either direction counts
      rawMetric:(lm) => { const sw=shoulderWidth(lm); const hipC=mid(lm[LM.LHIP],lm[LM.RHIP]); const ankC=mid(lm[LM.LANK],lm[LM.RANK]); return (hipC.x-ankC.x)/sw; }
    },
    {
      id:'heeltoe', category:'legs', tag:'Balance', label:'Heel-Toe Rocker',
      shortDesc:'Rock rhythmically between heels and toes.',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="8" cy="7" rx="2.6" ry="3.6"/><ellipse cx="16" cy="15" rx="2.6" ry="3.6"/><path d="M8 12.5v3M16 20.5v2"/></svg>',
      hint:'Hold something sturdy if needed. Rock onto your toes, then your heels, on the beat.',
      research:'Moving to a steady beat draws on rhythmic auditory stimulation (RAS) — a technique studied in multiple clinical trials (e.g. the RESCUE trial, published in J Neurol Neurosurg Psychiatry) showing improved gait and balance in Parkinson\'s patients when movement is paired with an external timing cue.',
      tiers:[ {amplitude:0.06, bpm:50}, {amplitude:0.09, bpm:60}, {amplitude:0.12, bpm:70} ], beatBpm:true,
      mode:'abs', defaultBaseline:0,  // signed toe-vs-heel height (in torso lengths); heels-up or toes-up both count
      rawMetric:(lm) => { const t=torsoLen(lm); const heelC=mid(lm[LM.LHEEL],lm[LM.RHEEL]); const toeC=mid(lm[LM.LFOOT],lm[LM.RFOOT]); return (toeC.y-heelC.y)/t; }
    },
    {
      id:'crossbody', category:'arms', tag:'Coordination', label:'Cross-Body Horizon',
      shortDesc:'Reach one hand across your body to the far side.',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><path d="M12 9v6M6 11l6-2 6 2M8 21l4-6 4 6"/></svg>',
      hint:'Reach your right hand across your chest to your left side, then back. Repeat left.',
      research:'Movements that cross the body\'s midline require the left and right sides of the brain to coordinate — a principle used broadly in motor-coordination and bilateral-integration training.',
      tiers:[ {amplitude:0.35}, {amplitude:0.5}, {amplitude:0.65} ], beatBpm:null,
      mode:'up', defaultBaseline:-0.1,  // wrist travel toward the opposite shoulder (in shoulder widths); ~0 at rest, ~1 at the far shoulder
      // Raw (unmirrored) frame: the person's right side is at small x, so a right-hand cross INCREASES x.
      rawMetric:(lm) => { const sw=shoulderWidth(lm); const rightCross=(lm[LM.RWR].x-lm[LM.RSH].x)/sw; const leftCross=(lm[LM.LSH].x-lm[LM.LWR].x)/sw; return Math.max(rightCross, leftCross); }
    },
    {
      id:'march', category:'legs', tag:'Gait', label:'Exaggerated March',
      shortDesc:'March in place, lifting your knees high.',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="1.8"/><path d="M12 7v4l-4 3M12 11l3 5M8 14l-2 6M15 16l2 5"/></svg>',
      hint:'Lift your right knee high, stomp down, then your left. Add an arm swing if you can.',
      research:'High-stepping, rhythmically cued marching is used in Parkinson\'s gait research to counteract shuffling and reduce freezing episodes, giving each step an external timing cue the brain can latch onto.',
      tiers:[ {amplitude:0.35, bpm:50}, {amplitude:0.55, bpm:60}, {amplitude:0.75, bpm:72} ], beatBpm:true,
      mode:'up', defaultBaseline:-0.9,  // knee height above its standing position (in torso lengths); ~0.9 = thigh parallel to floor
      rawMetric:(lm) => { const t=torsoLen(lm); const l=(lm[LM.LHIP].y-lm[LM.LKNEE].y)/t; const r=(lm[LM.RHIP].y-lm[LM.RKNEE].y)/t; return Math.max(l, r); }
    }
  ];

  const difficultyMap = loadDifficulty();
  function tierFor(id){ return difficultyMap[id] || 0; }

  const HOLD_GOOD = 70, HOLD_REQUIRED_MS = 550, REARM_BELOW = 35;
  const ROUND_MS = 25000;  // length of one active round (the countdown is 4 ticks x 700 ms, see beginRound)

  // Must match the pose.js version pinned in index.html; the model files are fetched from the same release.
  const POSE_VERSION = '0.5.1675469404';

  // ---------- screens & nav ----------
  const screens = { intro: byId('screen-intro'), routines: byId('screen-routines'), practice: byId('screen-practice'), progress: byId('screen-progress'), setup: byId('screen-setup') };
  function byId(id){ return document.getElementById(id); }
  const bottomnav = byId('bottomnav');
  function showScreen(name){
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    bottomnav.classList.toggle('show', name === 'routines' || name === 'progress');
    byId('navRoutines').classList.toggle('active', name === 'routines');
    byId('navProgress').classList.toggle('active', name === 'progress');
    if (name === 'routines') renderRoutineList();
    if (name === 'progress') renderProgress();
    if (name !== 'practice') endEverything();
  }
  byId('introStart').addEventListener('click', () => showScreen('routines'));
  byId('closeToRoutines').addEventListener('click', () => showScreen('routines'));
  byId('navRoutines').addEventListener('click', () => showScreen('routines'));
  byId('navProgress').addEventListener('click', () => showScreen('progress'));

  let activeCategory = 'all';
  document.getElementById('chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeCategory = chip.dataset.cat;
    renderRoutineList();
  });

  function renderRoutineList(){
    const container = byId('routineList'); container.innerHTML = '';
    ROUTINES.filter(r => activeCategory === 'all' || r.category === activeCategory).forEach(r => {
      const best = bestScoreFor(r.id);
      const card = document.createElement('button');
      card.className = 'routine-card';
      card.innerHTML = '<div class="icon">'+r.icon+'</div><div class="body"><div class="tag">'+r.tag+'</div><h3>'+r.label+'</h3><p>'+r.shortDesc+'</p>'+
        (best !== null ? '<div class="best">Best avg: '+best+'</div>' : '')+'</div><div class="chev">›</div>';
      card.addEventListener('click', () => startRoutine(r.id));
      container.appendChild(card);
    });
  }

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
    const trendCard = byId('trendCard'), svg = byId('trendSvg');
    const recent = sessions.slice(0, 10).slice().reverse();
    if (recent.length < 2) { trendCard.style.display = 'none'; return; }
    trendCard.style.display = 'block';
    const w = 280, h = 56, pad = 6;
    const stepX = (w - pad*2) / (recent.length - 1);
    const pts = recent.map((s,i) => {
      const x = pad + i*stepX;
      const y = h - pad - (clamp01(s.avgScore/100) * (h - pad*2));
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    const lineColor = getComputedStyle(document.documentElement).getPropertyValue('--moss').trim() || '#47614F';
    svg.innerHTML = '<polyline points="'+pts.join(' ')+'" fill="none" stroke="'+lineColor+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      pts.map(p => { const [x,y]=p.split(','); return '<circle cx="'+x+'" cy="'+y+'" r="2.6" fill="'+lineColor+'"/>'; }).join('');
  }

  function renderProgress(){
    const list = loadSessions(); const container = byId('progressList'); const empty = byId('progressEmpty');
    const statsRow = byId('statsRow');
    container.innerHTML = '';
    if (!list.length) {
      empty.style.display = 'block'; statsRow.innerHTML = ''; byId('trendCard').style.display = 'none';
      byId('resetProgressBtn').style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    byId('resetProgressBtn').style.display = 'block';
    const totalReps = list.reduce((a,s) => a + (s.reps||0), 0);
    const streak = computeStreak(list);
    statsRow.innerHTML =
      '<div class="stat-card"><div class="sv">'+list.length+'</div><div class="sl">Rounds</div></div>'+
      '<div class="stat-card"><div class="sv">'+totalReps+'</div><div class="sl">Total Reps</div></div>'+
      '<div class="stat-card"><div class="sv">'+streak+'</div><div class="sl">Day Streak</div></div>';
    renderTrendChart(list);
    list.slice(0,20).forEach(s => {
      const routine = ROUTINES.find(r => r.id === s.routineId);
      const d = new Date(s.date);
      const row = document.createElement('div'); row.className = 'progress-row';
      row.innerHTML = '<div><div class="rname">'+(routine?routine.label:s.routineId)+'</div>'+
        '<div class="rdate">'+d.toLocaleDateString()+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+'</div></div>'+
        '<div class="rscore">'+s.avgScore+'<span class="rreps">'+s.reps+' reps · best '+(s.bestScore||s.avgScore)+'</span></div>';
      container.appendChild(row);
    });
  }

  // ---------- practice state ----------
  let activeRoutine=null, routineState=null, roundPhase='idle', lastPersonAt=0, calibSamples=[];
  let repCount=0, scoreSamples=[], repScores=[], readyTimer=null, roundStartAt=0, roundTickId=null;

  function startRoutine(routineId){
    activeRoutine = ROUTINES.find(r => r.id === routineId);
    routineState = { smoothed:0, _init:false, armed:true, holdMs:0, _lastT:null };
    repCount = 0; scoreSamples = []; repScores = []; roundPhase = 'idle';
    byId('practiceTitle').textContent = activeRoutine.label;
    byId('practiceCategory').textContent = activeRoutine.tag;
    byId('practiceHint').textContent = activeRoutine.hint;
    byId('researchNote').textContent = activeRoutine.research || '';
    byId('repCount').textContent = '0';
    updateTierLabel();
    updateGauge(null); updateHoldBar(0);
    byId('feedbackLine').textContent = '';
    byId('stageEmpty').style.display = 'flex';
    byId('beginBtnWrap').style.display = 'none';
    byId('readyOverlay').classList.remove('show');
    byId('completeOverlay').classList.remove('show');
    byId('timerPill').style.display = 'none';
    byId('startBtn').disabled = false; byId('startBtn').textContent = 'Start Camera';
    byId('statusPill').textContent = 'Camera not started';
    byId('cameraError').style.display = 'none';
    lastPersonAt = performance.now();
    if (hasSeenSetup()) { showScreen('practice'); }
    else { showScreen('setup'); }
  }

  const SETUP_KEY = 'stepalong_setup_seen_v1';
  function hasSeenSetup(){ try { return localStorage.getItem(SETUP_KEY) === '1'; } catch(e){ return false; } }
  function markSetupSeen(){ try { localStorage.setItem(SETUP_KEY, '1'); } catch(e){} }
  byId('setupContinue').addEventListener('click', () => { markSetupSeen(); showScreen(activeRoutine ? 'practice' : 'routines'); });
  byId('closeSetup').addEventListener('click', () => showScreen(activeRoutine && hasSeenSetup() ? 'practice' : 'routines'));
  byId('setupTipsLink').addEventListener('click', () => showScreen('setup'));
  function updateTierLabel(){ byId('tierLabel').textContent = 'Tier ' + (tierFor(activeRoutine.id)+1); }

  const videoEl = byId('video'), canvasEl = byId('canvas'), ctx = canvasEl.getContext('2d');
  const startBtn = byId('startBtn'), stageEmpty = byId('stageEmpty'), statusPill = byId('statusPill');
  const scoreNum = byId('scoreNum'), gaugeArc = byId('gaugeArc'), feedbackLine = byId('feedbackLine');
  const holdBarFill = byId('holdBarFill'), timerPill = byId('timerPill');

  function updateGauge(score){
    scoreNum.textContent = score === null ? '–' : score;
    const c = 207; const offset = score === null ? c : c - (c*score)/100;
    gaugeArc.style.strokeDashoffset = offset;
    gaugeArc.style.stroke = score === null ? 'var(--line)' : score >= 75 ? 'var(--moss)' : score >= 40 ? 'var(--ochre)' : 'var(--bad)';
  }
  function updateHoldBar(pct){ holdBarFill.style.width = Math.round(clamp01(pct)*100) + '%'; }

  let lastSpokenAt = 0;
  function maybeSpeak(text){ const now = Date.now(); if (now - lastSpokenAt > 4000) { speak(text); lastSpokenAt = now; } }

  function beginRound(){
    byId('beginBtnWrap').style.display = 'none';
    calibSamples = [];
    roundPhase = 'ready';
    let n = 3;
    byId('readyNum').textContent = String(n);
    byId('readyOverlay').classList.add('show');
    readyTimer = setInterval(() => {
      n -= 1;
      if (n > 0) { byId('readyNum').textContent = String(n); }
      else if (n === 0) { byId('readyOverlay').innerHTML = '<div class="go">Go!</div>'; }
      else {
        clearInterval(readyTimer); readyTimer = null;
        byId('readyOverlay').classList.remove('show');
        byId('readyOverlay').innerHTML = '<div class="big-num" id="readyNum">3</div><div style="font-size:13px;color:#D9D5C8;">Stand still — calibrating</div>';
        startActiveRound();
      }
    }, 700);
  }

  function median(a){ const t=[...a].sort((x,y)=>x-y); const m=Math.floor(t.length/2); return t.length%2 ? t[m] : (t[m-1]+t[m])/2; }

  function startActiveRound(){
    roundPhase = 'active';
    repCount = 0; scoreSamples = []; repScores = [];
    // Neutral stance measured during the countdown; all movement is scored relative to it.
    const baseline = calibSamples.length >= 8 ? median(calibSamples) : activeRoutine.defaultBaseline;
    routineState = { smoothed:0, _init:false, armed:true, holdMs:0, _lastT:null, baseline };
    byId('repCount').textContent = '0';
    roundStartAt = Date.now();
    timerPill.style.display = 'block';
    timerPill.textContent = formatTime(ROUND_MS);

    const tier = activeRoutine.tiers[tierFor(activeRoutine.id)];
    if (activeRoutine.beatBpm && tier.bpm) startMetronome(tier.bpm);

    roundTickId = setInterval(() => {
      const remaining = ROUND_MS - (Date.now() - roundStartAt);
      if (remaining <= 0) { timerPill.textContent = '0:00'; endRound(); }
      else { timerPill.textContent = formatTime(remaining); }
    }, 250);
  }
  function formatTime(ms){ const s = Math.max(0, Math.ceil(ms/1000)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }

  function computeSessionAvg(){
    if (repScores.length) return Math.round(repScores.reduce((a,b)=>a+b,0)/repScores.length);
    if (scoreSamples.length) {
      const sorted = [...scoreSamples].sort((a,b)=>b-a);
      const topN = Math.max(1, Math.floor(sorted.length*0.25));
      return Math.round(sorted.slice(0,topN).reduce((a,b)=>a+b,0)/topN);
    }
    return 0;
  }

  function endRound(){
    roundPhase = 'complete';
    if (roundTickId) { clearInterval(roundTickId); roundTickId = null; }
    stopMetronome();
    timerPill.style.display = 'none';
    updateHoldBar(0);  // don't leave a half-filled hold bar under the results overlay
    const avg = computeSessionAvg();
    const best = scoreSamples.length ? Math.max(...scoreSamples) : 0;
    saveSession({ routineId: activeRoutine.id, date: Date.now(), avgScore: avg, bestScore: best, reps: repCount, tier: tierFor(activeRoutine.id) });
    if (avg > 82 && repCount >= 3 && tierFor(activeRoutine.id) < 2) {
      difficultyMap[activeRoutine.id] = tierFor(activeRoutine.id) + 1;
      saveDifficulty(difficultyMap); updateTierLabel();
    }
    byId('statAvg').textContent = avg; byId('statReps').textContent = repCount;
    byId('completeOverlay').classList.add('show');
    speak('Round complete. Average score ' + avg);
  }

  byId('anotherRoundBtn').addEventListener('click', () => { byId('completeOverlay').classList.remove('show'); beginRound(); });
  byId('doneRoundBtn').addEventListener('click', () => showScreen('routines'));

  function onResults(results){
    canvasEl.width = videoEl.videoWidth; canvasEl.height = videoEl.videoHeight;
    ctx.save(); ctx.clearRect(0,0,canvasEl.width, canvasEl.height);

    if (results.poseLandmarks && activeRoutine) {
      lastPersonAt = performance.now();
      window.drawConnectors(ctx, results.poseLandmarks, window.POSE_CONNECTIONS, {color:'rgba(143,183,154,0.9)', lineWidth:3});
      window.drawLandmarks(ctx, results.poseLandmarks, {color:'#E3A855', fillColor:'#E3A855', radius:3, lineWidth:1});

      if (roundPhase === 'idle') {
        byId('beginBtnWrap').style.display = 'block';
        statusPill.textContent = 'Person detected — ready when you are';
        ctx.restore(); return;
      }
      if (roundPhase === 'ready') { calibSamples.push(activeRoutine.rawMetric(results.poseLandmarks)); ctx.restore(); return; }
      if (roundPhase !== 'active') { ctx.restore(); return; }

      const tier = activeRoutine.tiers[tierFor(activeRoutine.id)];
      const raw = activeRoutine.rawMetric(results.poseLandmarks);
      const st = routineState;
      const dev = activeRoutine.mode === 'abs' ? Math.abs(raw - st.baseline) : Math.max(0, raw - st.baseline);
      st.smoothed = st._init ? st.smoothed*0.72 + dev*0.28 : dev;
      st._init = true;
      const score = Math.round(clamp01(st.smoothed / tier.amplitude) * 100);
      updateGauge(score);
      scoreSamples.push(score);
      statusPill.textContent = 'Tracking';

      const now = performance.now();
      const dt = st._lastT ? Math.min(now - st._lastT, 100) : 0; st._lastT = now;
      if (score >= HOLD_GOOD) {
        if (st.armed) {
          st.holdMs += dt;
          updateHoldBar(st.holdMs / HOLD_REQUIRED_MS);
          if (st.holdMs >= HOLD_REQUIRED_MS) {
            repCount += 1; byId('repCount').textContent = String(repCount);
            repScores.push(score);
            st.holdMs = 0; st.armed = false; updateHoldBar(0);
            feedbackLine.textContent = 'Nice — that one counted.';
            maybeSpeak('Nice, that counted');
          }
        }
      } else {
        st.holdMs = 0; updateHoldBar(0);
        if (score <= REARM_BELOW) st.armed = true;
        feedbackLine.textContent = score < 30 ? 'Adjust your position to match the target.' : '';
      }
    } else {
      updateGauge(null);
      updateHoldBar(0);
      if (routineState) { routineState.holdMs = 0; routineState._lastT = null; }
      if (performance.now() - lastPersonAt > 5000) {
        statusPill.textContent = "We can't see you — step back so your whole body is in frame and check the lighting.";
        if (roundPhase === 'active') feedbackLine.textContent = 'Having trouble seeing you. Try more light or stepping back.';
      } else {
        statusPill.textContent = 'No person detected — step into frame';
      }
    }
    ctx.restore();
  }

  function withTimeout(p, ms, msg){ return Promise.race([p, new Promise((_,rej)=>setTimeout(()=>rej(new Error(msg)), ms))]); }

  let cameraStarted=false, mediaStream=null, rafId=null, poseInstance=null;
  // One frame at a time: send the current video frame to MediaPipe, then schedule the next.
  // try/catch so a single failed frame doesn't silently stop tracking for the rest of the session.
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
    stopMetronome();
    cameraStarted = false; roundPhase = 'idle';
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
    statusPill.textContent = 'Requesting camera permission…';
    byId('cameraError').style.display = 'none';
    try {
      if (typeof window.Pose !== 'function') { const e = new Error('pose-load'); e.name = 'PoseLoadError'; throw e; }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { const e = new Error('no-camera-api'); e.name = 'NoCameraApi'; throw e; }
      mediaStream = await withTimeout(navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}, audio:false}), 8000, 'No response from the camera permission prompt.');
      videoEl.srcObject = mediaStream;
      await withTimeout(videoEl.play(), 5000, 'Video failed to start playing.');
      poseInstance = new window.Pose({ locateFile:(f)=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose@${POSE_VERSION}/${f}` });
      poseInstance.setOptions({ modelComplexity:1, smoothLandmarks:true, minDetectionConfidence:0.5, minTrackingConfidence:0.5 });
      poseInstance.onResults(onResults);
      cameraStarted = true;
      stageEmpty.style.display = 'none';
      statusPill.textContent = 'Camera on — looking for a person';
      frameLoop(poseInstance);
    } catch (err) {
      if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
      startBtn.disabled = false; startBtn.textContent = 'Try Again';
      const msg = friendlyCameraError(err);
      const box = byId('cameraError'); box.textContent = msg; box.style.display = 'block';
      statusPill.textContent = 'Camera not started';
    }
  });

  let resetArmed = false, resetTimer = null;
  byId('resetProgressBtn').addEventListener('click', function () {
    const btn = this;
    if (!resetArmed) {
      resetArmed = true; btn.textContent = 'Tap again to erase all progress';
      resetTimer = setTimeout(() => { resetArmed = false; btn.textContent = 'Reset progress'; }, 4000);
      return;
    }
    clearTimeout(resetTimer); resetArmed = false; btn.textContent = 'Reset progress';
    try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(DIFF_KEY); } catch (e) {}
    Object.keys(difficultyMap).forEach(k => delete difficultyMap[k]);
    renderProgress();
  });

  byId('beginBtn').addEventListener('click', beginRound);
  window.addEventListener('beforeunload', endEverything);
})();
