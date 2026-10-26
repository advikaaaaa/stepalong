// Navigation + data tests: wizard, tabs, detail pages, Settings, Home/Progress with history, resets.
// Usage: npm test   (or: node tests/nav-smoke.js)
const { JSDOM } = require('jsdom');
const html = require('./load-app')();
let bad = 0; const check = (name, cond, extra) => { if(!cond) bad++; console.log((cond?'ok   ':'FAIL ')+name+(extra?'   '+extra:'')); };
function make(seed) {
  const errors = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost:8001/', pretendToBeVisual: true,
    beforeParse(w){ w.addEventListener('error', e => errors.push(e.message)); w.HTMLCanvasElement.prototype.getContext = () => ({save(){},restore(){},clearRect(){}});
      if (seed) Object.keys(seed).forEach(k => w.localStorage.setItem(k, seed[k])); } });
  const w = dom.window, d = w.document;
  return { w, d, errors, $: id => d.getElementById(id), active: () => [...d.querySelectorAll('.screen.active')].map(s => s.id).join(), click: id => d.getElementById(id).dispatchEvent(new w.MouseEvent('click', {bubbles:true})),
    set: (id, v) => { const el = d.getElementById(id); el.value = v; el.dispatchEvent(new w.Event('change', {bubbles:true})); } };
}
const sess = (id, avg, reps, tier, hoursAgo, tip) => ({ routineId:id, date:Date.now()-hoursAgo*3600e3, avgScore:avg, bestScore:avg+10, reps, tier, parts:[50,50,85], sides:[80,60], tip });

(async () => {
  // ================= FIRST VISIT =================
  console.log('FIRST VISIT: welcome -> wizard -> Home');
  const A = make();
  check('opens on the welcome screen, no tab bar', A.active()==='screen-intro' && !A.$('bottomnav').classList.contains('show'));
  A.click('introStart'); check('Get started opens the wizard (step 1 of 3)', A.active()==='screen-wizard' && A.$('wizStepLabel').textContent==='Step 1 of 3');
  check('goal dropdown has 5 options', A.$('wizGoal').options.length===5);
  check('steadiness dropdown has 4 options', A.$('wizSteady').options.length===4);
  A.set('wizGoal','arms'); A.$('wizName').value='Sam'; A.click('wizNext');
  check('step 2: steadiness', A.$('wizStepLabel').textContent==='Step 2 of 3' && A.d.querySelector('.wiz-step.active').dataset.step==='2');
  check('careful note hidden for "mostly steady"', A.$('wizCareful').style.display==='none');
  A.set('wizSteady','little'); check('careful note shown for "a little unsteady"', A.$('wizCareful').style.display==='block');
  A.click('wizBack'); check('Back returns to step 1', A.$('wizStepLabel').textContent==='Step 1 of 3');
  A.click('wizNext'); A.click('wizNext'); check('step 3: routine setup', A.$('wizStepLabel').textContent==='Step 3 of 3' && A.$('wizNext').textContent==='Finish');
  check('step 3 has 6 dropdowns', ['wizDays','wizRounds','wizText','wizContrast','wizVoice','wizBeats'].every(id => A.$(id).tagName==='SELECT'));
  check('wizard offers 4 colour schemes, Garden + device mode by default', A.$('wizScheme').querySelectorAll('button').length===4 && A.d.documentElement.getAttribute('data-scheme')==='garden' && A.d.documentElement.getAttribute('data-mode')==='auto');
  A.$('wizScheme').querySelector('[data-scheme="sky"]').click(); A.$('wizMode').querySelector('[data-mode="dark"]').click();
  check('picking Sky + Dark in the wizard applies right away', A.d.documentElement.getAttribute('data-scheme')==='sky' && A.d.documentElement.getAttribute('data-mode')==='dark' && A.$('wizScheme').querySelector('[data-scheme="sky"]').getAttribute('aria-checked')==='true');
  A.set('wizDays','4'); A.set('wizRounds','2'); A.set('wizText','large'); A.set('wizContrast','high'); A.set('wizVoice','on'); A.set('wizBeats','off');
  A.click('wizNext');
  check('Finish lands on Home with the tab bar', A.active()==='screen-home' && A.$('bottomnav').classList.contains('show'));
  check('greeting uses the name', /Sam/.test(A.$('homeGreeting').textContent), A.$('homeGreeting').textContent);
  check('motto shown', A.$('homeMotto').textContent.length>10);
  check('wizard answers applied (large text, contrast)', A.d.documentElement.classList.contains('large-text') && A.d.documentElement.getAttribute('data-contrast')==='high');
  const prof = JSON.parse(A.w.localStorage.getItem('stepalong_profile_v1'));
  check('profile saved', prof.onboarded && prof.goal==='arms' && prof.steady==='little' && prof.days===4 && prof.rounds===2 && prof.beats==='off' && prof.name==='Sam');
  check('"Up next" follows the goal (arms -> Cross-Body)', /Start Cross-Body Horizon/.test(A.$('nextUpHome').textContent));
  check('weekly goal tracker: 0 of 4 days, 7 dots', /0 of 4 practice days/.test(A.$('weekCard').textContent) && A.$('weekCard').querySelectorAll('.dot').length===7);
  check('today round counter uses the wizard answer', /Today: 0 of 2 rounds/.test(A.$('weekCard').textContent));
  check('home shows 3 stats + empty-state art', A.$('homeStats').querySelectorAll('.stat-card').length===3 && A.$('lastRoundCard').querySelector('svg.hero-art'));

  // ================= RETURN VISIT =================
  console.log('\nRETURN VISIT');
  const seed = {}; for (let i=0;i<A.w.localStorage.length;i++){ const k=A.w.localStorage.key(i); seed[k]=A.w.localStorage.getItem(k); }
  const B = make(seed);
  check('returning user goes straight to Home', B.active()==='screen-home' && B.$('bottomnav').classList.contains('show'));
  check('saved settings applied on load', B.d.documentElement.classList.contains('large-text'));
  const tiers = JSON.parse(B.w.localStorage.getItem('stepalong_difficulty_v3')||'{}');
  check('"a little unsteady" starts every routine at Tier 1', Object.keys(tiers).length===4 && Object.values(tiers).every(v=>v===0));

  // ================= ROUTINES + DETAIL =================
  console.log('\nROUTINES + DETAIL PAGES');
  B.click('navRoutines'); check('Routines tab', B.active()==='screen-routines' && B.d.querySelectorAll('.routine-card').length===5);
  check('next up card at the bottom of Routines', /Next up/i.test(B.$('nextUpRoutines').textContent));
  B.d.querySelectorAll('.routine-card')[3].click();
  check('tapping a routine opens its detail page', B.active()==='screen-detail' && /Exaggerated March/.test(B.$('detailBody').textContent));
  check('detail shows what it trains, tiers, research', /Leg lift/.test(B.$('detailBody').textContent) && B.$('detailBody').querySelectorAll('.tier-table tr').length===3 && /Parkinson/.test(B.$('detailBody').textContent));
  check('detail start button names the routine', /Start Exaggerated March/.test(B.$('detailStart').textContent));
  B.click('detailStart'); check('Start -> first-time setup tips', B.active()==='screen-setup'); B.click('setupContinue');
  check('then the practice screen', B.active()==='screen-practice' && B.$('practiceTitle').textContent==='Exaggerated March');
  B.click('startBtn');
  await new Promise(r => setTimeout(r, 250));
  check('model-load failure shows a friendly error', B.$('cameraError').style.display==='block');
  B.click('closeToRoutines');
  [...B.d.querySelectorAll('.routine-card')].find(c=>c.textContent.includes('Free Movement')).click(); check('Free Movement opens the builder', B.active()==='screen-custom');
  B.click('closeCustom');

  // ================= SETTINGS =================
  console.log('\nSETTINGS');
  B.click('navSettings'); check('Settings tab', B.active()==='screen-settings');
  check('name + goal fields prefilled', B.$('setName').value==='Sam' && B.$('setDays').value==='4' && B.$('setRounds').value==='2');
  check('switches mirror the saved profile', B.$('btnLargeText').classList.contains('on') && B.$('btnHighContrast').classList.contains('on') && B.$('btnVoice').classList.contains('on') && !B.$('btnBeats').classList.contains('on'));
  B.click('btnLargeText'); check('turning large text off updates the whole app', !B.d.documentElement.classList.contains('large-text') && JSON.parse(B.w.localStorage.getItem('stepalong_profile_v1')).text==='standard');
  check('Settings colour pickers mirror the saved profile', B.$('setScheme').querySelector('.active').dataset.scheme==='sky' && B.$('setMode').querySelector('.active').dataset.mode==='dark');
  B.$('setScheme').querySelector('[data-scheme="blossom"]').click(); B.$('setMode').querySelector('[data-mode="auto"]').click();
  const p2 = JSON.parse(B.w.localStorage.getItem('stepalong_profile_v1'));
  check('changing colours in Settings saves and applies', p2.scheme==='blossom' && p2.mode==='auto' && B.d.documentElement.getAttribute('data-scheme')==='blossom' && B.$('wizScheme').querySelector('.active').dataset.scheme==='blossom');
  B.click('btnBeats'); check('beat sounds can be turned on', B.$('btnBeats').classList.contains('on'));
  B.$('setName').value='Sam R'; B.$('setName').dispatchEvent(new B.w.Event('input')); B.set('setDays','5');
  check('name + weekly goal edits are saved', JSON.parse(B.w.localStorage.getItem('stepalong_profile_v1')).name==='Sam R' && JSON.parse(B.w.localStorage.getItem('stepalong_profile_v1')).days===5);
  check('share summary is generated (no video, mentions disclaimer)', /StepAlong progress summary for Sam R/.test(B.$('summaryText').value) && /not a medical assessment/.test(B.$('summaryText').value));
  B.click('btnRerunWizard'); check('"Run the setup again" reopens the wizard prefilled', B.active()==='screen-wizard' && B.$('wizGoal').value==='arms' && B.$('wizName').value==='Sam R');
  B.click('wizBack'); check('Back from step 1 returns to Settings', B.active()==='screen-settings');

  // ================= DATA: Home / Progress with history =================
  console.log('\nHOME + PROGRESS WITH HISTORY');
  const sessions = [ sess('march',64,7,0,2,'Your right knee was weaker (45 vs 80). Lift your right knee higher.'), sess('sway',72,8,1,26,'Strong, even round.'), sess('crossbody',55,5,0,50,'Go bigger on every rep.'), sess('heeltoe',48,6,0,74,'Do more reps.'), sess('march',40,4,0,98,'Do more reps.') ];
  B.w.localStorage.setItem('stepalong_sessions_v3', JSON.stringify(sessions));
  B.click('navHome');
  check('Home: last round tip is shown', /Last round/.test(B.$('lastRoundCard').textContent) && /right knee was weaker/.test(B.$('lastRoundCard').textContent));
  check('Home: streak and rounds', /5/.test(B.$('homeStats').textContent) && B.$('homeStats').querySelectorAll('.stat-card').length===3);
  check('Home: weekly dots reflect practice', B.$('weekCard').querySelectorAll('.dot.on').length>=1);
  check('Home: Up next suggests a tier goal', /Reach Tier 2 in/.test(B.$('nextUpHome').textContent));
  B.$('nextUpHome').querySelector('button').click(); check('Up next button goes to that routine', B.active()==='screen-practice');
  B.click('closeToRoutines'); B.click('navProgress');
  check('Progress: 5 recent rounds', B.d.querySelectorAll('#progressList .progress-row').length===5);
  check('Progress: best by routine (5 rows incl. Free Movement)', B.d.querySelectorAll('#bestList .progress-row').length===5 && /Not tried yet/.test(B.$('bestList').textContent));
  const svg = B.$('trendSvg').innerHTML;
  check('Progress: chart has axis, ticks and 70 line', ['>0<','>25<','>50<','>75<','>100<','Round score','70 to level up'].every(t => svg.includes(t)));
  const earned = B.d.querySelectorAll('#badgeGrid .badge.earned').length, total = B.d.querySelectorAll('#badgeGrid .badge').length;
  check('Progress: badges (some earned, some locked)', total===8 && earned>=3 && earned<8, earned+'/'+total+' earned');
  check('Progress: next up card at the bottom', /Next up/i.test(B.$('nextUpProgress').textContent));
  B.click('navSettings'); B.click('resetProgressBtn'); check('reset needs a second tap', B.$('resetProgressBtn').textContent.includes('Tap again'));
  B.click('resetProgressBtn'); check('reset clears progress', JSON.parse(B.w.localStorage.getItem('stepalong_sessions_v3')||'[]').length===0);
  B.click('navProgress'); check('empty Progress shows the skeleton art', B.$('progressEmpty').querySelector('svg.hero-art') && B.$('badgeGrid').querySelectorAll('.badge.locked').length===8);
  B.click('navSettings'); B.click('resetAllBtn'); B.click('resetAllBtn');
  check('"Start over" returns to the welcome screen', B.active()==='screen-intro' && !B.$('bottomnav').classList.contains('show') && !B.w.localStorage.getItem('stepalong_profile_v1'));

  // welcome back (3 days away)
  const C = make({ stepalong_profile_v1: JSON.stringify({ onboarded:true, name:'', goal:'all', steady:'mostly', days:3, rounds:1, text:'standard', contrast:'standard', voice:'off', beats:'on' }), stepalong_sessions_v3: JSON.stringify([ sess('sway',60,6,0,24*4,'tip') ]) });
  check('welcome-back message after days away', C.$('welcomeBack').style.display==='block' && /4 days/.test(C.$('welcomeBack').textContent));
  check('no name -> plain greeting', /^Good (morning|afternoon|evening)\.$/.test(C.$('homeGreeting').textContent));
  const errs = A.errors.concat(B.errors, C.errors); check('no uncaught errors in any session', errs.length===0, JSON.stringify(errs));
  console.log(bad ? `\n${bad} check(s) FAILED` : '\nAll checks passed'); process.exit(bad?1:0);
})();
