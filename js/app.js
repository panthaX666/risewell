import {
  TASKS, BADGES, defaultState, dayKey, addDays, parseKey, weekday, minutesOf, isScheduled, windowOf,
  formatTime, finishOnboarding, editSchedule, reconcile, streakOf, todayStatus, tapAwake, completeTask,
  nextMilestone, insightsOf,
} from './logic.js';

// ---------- state ----------
const KEY = 'risewell';
let st = load();
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && saved.v === 1) return fromSaved(saved);
  } catch (e) { /* fall through to a fresh state */ }
  return defaultState();
}
// Keep only the fields the app knows, so retired ones (like the old score) drop out.
function fromSaved(saved) {
  const st = defaultState();
  for (const k of Object.keys(st)) if (k in saved) st[k] = saved[k];
  return st;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { toast('Could not save. Check that storage is not full.'); }
}

// Ask the browser not to clear Risewell's data when the phone runs low on space.
function keepData() {
  navigator.storage?.persisted?.().then((kept) => kept || navigator.storage.persist()).catch(() => {});
}

// `?now=2026-09-28T06:40` pins the clock, for testing a morning at any hour.
const pinned = new URLSearchParams(location.search).get('now');
const offset = pinned && !isNaN(Date.parse(pinned)) ? Date.parse(pinned) - Date.now() : 0;
const now = () => new Date(Date.now() + offset);

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ic = (n, c = '') => `<svg class="i ${c}"><use href="#i-${n}"/></svg>`;
const txt = (key, v) => $$(`[data-bind="${key}"]`).forEach((e) => { e.textContent = v; });
const width = (key, pct) => $$(`[data-bind="${key}"]`).forEach((e) => { e.style.width = `${Math.max(0, Math.min(100, pct))}%`; });
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const DL = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const task = () => TASKS.find((t) => t.id === st.task) || TASKS[0];
const splitTime = (min) => { const [hm, ap] = formatTime(min).split(' '); return { hm, ap }; };

function daysLabel() {
  const d = st.days, n = d.reduce((a, b) => a + b, 0);
  if (n === 7) return 'Every day';
  if (n === 0) return 'No days';
  if (n === 5 && d.slice(0, 5).every(Boolean)) return 'Weekdays';
  if (n === 2 && d[5] && d[6]) return 'Weekends';
  return d.map((v, i) => (v ? DN[i].slice(0, 3) : '')).filter(Boolean).join(', ');
}
function nextWakeLabel(from) {
  for (let i = 1; i <= 7; i++) {
    const k = addDays(from, i);
    if (isScheduled(st, k)) return `${i === 1 ? 'Tomorrow' : DN[weekday(k)]} at ${formatTime(st.goal)}`;
  }
  return 'No wake days set';
}

// "Saturday" within the last week, otherwise "September 14".
function dayName(k, today) {
  if (k === today) return 'today';
  return addDays(k, 7) > today ? DN[weekday(k)] : parseKey(k).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}
function dayList(keys, today) {
  const names = keys.map((k) => dayName(k, today));
  if (names.length > 3) return `${names.length} days, ${names[0]} to ${names[names.length - 1]}`;
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
function noticeFor(events, today) {
  const frozen = events.filter((e) => e.type === 'freeze').map((e) => e.day);
  const missed = events.filter((e) => e.type === 'miss'), ended = missed.find((e) => e.streak > 0);
  const parts = [];
  if (frozen.length) parts.push(`${frozen.length === 1 ? 'A freeze' : 'Freezes'} covered ${dayList(frozen, today)}.`);
  if (missed.length) parts.push(`You missed ${dayList(missed.map((e) => e.day), today)}.`);
  if (ended) parts.push(`Your ${ended.streak}-day streak ended ${dayName(ended.day, today)}.`);
  return { text: parts.join(' '), miss: missed.length > 0 };
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

// ---------- navigation (mirrors the Android back button) ----------
let stack = [];
let skipPop = false;
function show(id) {
  const sc = document.getElementById(id);
  $$('.screen').forEach((s) => s.classList.toggle('on', s === sc));
  sc.scrollTop = 0;
  const tab = sc.dataset.tab;
  $('#tabbar').classList.toggle('on', !!tab);
  $$('.tab').forEach((t) => t.setAttribute('aria-current', String(t.dataset.tabGo === tab)));
  $$('.sheet').forEach((s) => { s.hidden = true; });
  if (id === 'streak') calMonth = null;
  render();
  paintThemeColor();
}
function go(id) { stack.push(id); history.pushState({ d: stack.length }, ''); show(id); }
function replace(id) { stack[stack.length - 1] = id; show(id); }
function reset(id) {
  const depth = stack.length - 1;
  stack = [id];
  show(id);
  if (depth > 0) { skipPop = true; history.go(-depth); }
}
function back() { if (stack.length > 1) history.back(); }
addEventListener('popstate', () => {
  if (skipPop) { skipPop = false; return; }
  const open = $$('.sheet').find((s) => !s.hidden);
  if (open) { open.hidden = true; return; }
  if (stack.length > 1) { stack.pop(); show(stack[stack.length - 1]); }
});
const current = () => stack[stack.length - 1];

function paintThemeColor() {
  const sun = document.getElementById(current())?.hasAttribute('data-sun');
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  $('meta[name="theme-color"]').setAttribute('content', sun ? '#FFC247' : bg);
}

// ---------- rendering ----------
let calMonth = null; // {y, m} shown on the Streak screen
let lastResult = null; // outcome of the latest completed task, for the celebration

function render() {
  const n = now(), today = dayKey(n), status = todayStatus(st, n), t = task();
  const streak = streakOf(st, today), goal = splitTime(st.goal), w = windowOf(st);

  txt('goal', formatTime(st.goal)); txt('goalH', goal.hm); txt('goalAP', goal.ap);
  txt('close', formatTime(w.close)); txt('dayslabel', daysLabel());
  txt('bedhint', `For 8 hours of sleep, be in bed by ${formatTime(st.goal - 480)}.`);
  txt('taskname', t.name); txt('taskdesc', t.desc); txt('tasktime', t.time);
  $$('[data-task-icon]').forEach((u) => u.setAttribute('href', `#i-${t.icon}`));
  txt('streak', streak);
  txt('dayword', streak === 1 ? 'day' : 'days');
  txt('longest', st.longest); txt('longword', st.longest === 1 ? 'day' : 'days');

  renderHome(n, today, status, streak);
  renderTaskLists();
  renderSchedule();
  renderStreak(n, today, streak);
  renderStats(today);
  renderMe();
  if (status.kind === 'awake') txt('tappedAt', `You tapped at ${formatTime(status.rec.t)}. Finish by ${formatTime(status.due)}.`);
}

function renderHome(n, today, s, streak) {
  const hour = n.getHours();
  txt('greeting', hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
  txt('date', n.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
  const target = nextMilestone(streak), left = target - streak;
  txt('milestone', `${plural(left, 'day')} to your ${target}-day ${target <= 30 ? 'badge' : 'milestone'}`);
  $('#ring').style.strokeDashoffset = (552.9 * (1 - Math.min(1, streak / target))).toFixed(1);

  const card = (tile, cls, title, sub) => `<div class="card"><div class="row"><div class="itile ${cls}">${ic(tile)}</div><div class="grow"><p class="t-h3">${title}</p><p class="t-cap">${sub}</p></div></div></div>`;
  const button = (label, extra = '') => `<button class="btn big" ${extra}>${ic('sun')}${label}</button>`;
  const line = (html) => `<p class="deadline">${ic('clock', 'sm')}<span>${html}</span></p>`;
  let html;
  switch (s.kind) {
    case 'open':
      html = line(s.now < st.goal ? `Tap by ${formatTime(s.close)}` : `Tap by ${formatTime(s.close)} · <b>${plural(s.left, 'min')} left</b>`) + button('I’m Awake', 'id="awakeBtn"');
      break;
    case 'early':
      html = line(`Opens at ${formatTime(s.open)}, 2 hours before your goal`) + button('I’m Awake', 'disabled');
      break;
    case 'awake':
      html = line(`Tapped at ${formatTime(s.rec.t)}. Finish by ${formatTime(s.due)} to count it.`) + `<button class="btn big" data-go="doing">${ic('check')}Finish your tiny task</button>`;
      break;
    case 'done':
      html = card('check', 'good', 'Streak secured', `Up at ${formatTime(s.rec.t)}. See you ${nextWakeLabel(today).replace(/ at .*/, '').toLowerCase()}.`);
      break;
    case 'freeze':
      html = card('snow', 'cold', 'A freeze saved your streak', `You missed today’s window. Next wake: ${nextWakeLabel(today)}.`);
      break;
    case 'miss': case 'closed':
      html = card('x', 'bad', 'Missed today', `Your streak restarts. Next wake: ${nextWakeLabel(today)}.`);
      break;
    case 'off':
      html = card('moon', '', 'Day off', `Sleep in. Your streak is safe. Next wake: ${nextWakeLabel(today)}.`);
      break;
    case 'notyet':
      html = card('sunrise', '', 'Your streak starts tomorrow', `Tap “I’m Awake” by ${formatTime(windowOf(st).close)}.`);
      break;
  }
  $('#cta').innerHTML = html;
  $('#notice').hidden = !st.notice;
  if (st.notice) {
    $('#notice .itile').className = `itile ${st.notice.miss ? 'bad' : 'cold'}`;
    $('#notice use').setAttribute('href', `#i-${st.notice.miss ? 'info' : 'snow'}`);
    txt('notice', st.notice.text);
  }

  // This week, Monday to Sunday
  const monday = addDays(today, -weekday(today));
  let week = '', done = 0, planned = 0;
  for (let i = 0; i < 7; i++) {
    const k = addDays(monday, i), r = st.history[k], sched = isScheduled(st, k);
    const before = st.start && k < st.start;
    let cls = '', inner = '', label = 'not yet';
    if (r?.status === 'done') { cls = 'done'; inner = ic('check', 'sm'); label = 'woke up'; done++; }
    else if (r?.status === 'freeze') { cls = 'freeze'; inner = ic('snow', 'sm'); label = 'freeze used'; }
    else if (r?.status === 'miss') { cls = 'miss'; inner = ic('x', 'sm'); label = 'missed'; }
    else if (!sched || before) { cls = 'off'; label = 'day off'; }
    if (sched && !before) planned++;
    if (k === today) cls += ' today';
    week += `<div class="wd"><span>${DL[i]}</span><span class="dot ${cls}" role="img" aria-label="${DN[i]}, ${label}">${inner}</span></div>`;
  }
  $('#week').innerHTML = week;
  txt('weektag', `${done} of ${planned} days`);
}

function renderTaskLists() {
  $$('[data-tasklist]').forEach((box) => {
    box.innerHTML = TASKS.map((x) => {
      const on = x.id === st.task;
      return `<button class="opt" role="radio" aria-checked="${on}" data-task="${x.id}"><div class="itile">${ic(x.icon)}</div><div class="grow"><p class="t-h3">${x.name}</p><p class="t-cap">${x.time}</p></div><span class="radio">${on ? ic('check', 'sm') : ''}</span></button>`;
    }).join('');
  });
}

function renderSchedule() {
  $$('[data-timepicker]').forEach((box) => {
    if (!box.firstChild) {
      box.innerHTML = `<div class="stepper">
          <button class="iconbtn" data-time="-15" aria-label="15 minutes earlier">${ic('minus')}</button>
          <button class="time" data-pick-time aria-label="Set exact wake time"><span class="t-display num" data-bind="goalH"></span><small data-bind="goalAP"></small></button>
          <button class="iconbtn" data-time="15" aria-label="15 minutes later">${ic('plus')}</button>
        </div>
        <p class="t-cap center" data-bind="bedhint"></p>
        <input class="timeinput" type="time" tabindex="-1" aria-hidden="true">`;
    }
  });
  const g = splitTime(st.goal);
  txt('goalH', g.hm); txt('goalAP', g.ap);
  txt('bedhint', `Tap the time to set exact minutes. For 8 hours of sleep, be in bed by ${formatTime(st.goal - 480)}.`);
  $('#days').innerHTML = DL.map((d, i) => `<button class="dchip" data-day="${i}" aria-pressed="${!!st.days[i]}" aria-label="${DN[i]}">${d}</button>`).join('');
  const lock = st.lock?.day === dayKey(now()) ? st.lock : null;
  $('#lockNote').hidden = !lock;
  if (lock) {
    const s = todayStatus(st, now());
    txt('locknote', s.kind === 'open' ? `Changes apply from tomorrow. Today still counts if you tap by ${formatTime(s.close)}.` : 'Changes apply from tomorrow.');
  }
  $$('#winseg button').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.win === st.win)));
}

function renderStreak(n, today, streak) {
  const target = nextMilestone(streak), prev = [0, 7, 14, 30, 60, 100, 200, 365].filter((x) => x < target).pop() || 0;
  txt('nextbadge', `Next: ${target}-day ${target <= 30 ? 'badge' : 'milestone'}`);
  txt('nextbadgesub', `${plural(target - streak, 'day')} to go`);
  width('nextbar', ((streak - prev) / (target - prev)) * 100);
  txt('freezes', plural(st.freezes, 'streak freeze'));

  if (!calMonth) calMonth = { y: n.getFullYear(), m: n.getMonth() };
  const first = new Date(calMonth.y, calMonth.m, 1), days = new Date(calMonth.y, calMonth.m + 1, 0).getDate();
  txt('month', first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
  let html = DL.map((d) => `<div class="h">${d}</div>`).join('') + '<div></div>'.repeat((first.getDay() + 6) % 7);
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const k = dayKey(new Date(calMonth.y, calMonth.m, d)), r = st.history[k];
    let cls = 'c', label = '';
    if (r?.status === 'done') { cls += ' done'; label = ', woke up'; count++; }
    else if (r?.status === 'freeze') { cls += ' freeze'; label = ', freeze used'; }
    else if (r?.status === 'miss') { cls += ' miss'; label = ', missed'; }
    if (k > today) cls += ' future';
    if (k === today) cls += ' today';
    html += `<div class="${cls}" aria-label="${parseKey(k).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}${label}">${d}</div>`;
  }
  $('#cal').innerHTML = html;
  txt('calcount', plural(count, 'wake-up'));
  const startMonth = st.start ? parseKey(st.start) : n;
  $('#calPrev').disabled = calMonth.y * 12 + calMonth.m <= startMonth.getFullYear() * 12 + startMonth.getMonth();
  $('#calNext').disabled = calMonth.y * 12 + calMonth.m >= n.getFullYear() * 12 + n.getMonth();
}

function renderStats(today) {
  const s = insightsOf(st, today), enough = s.done >= 3;
  $('#statsEmpty').hidden = enough; $('#statsBody').hidden = !enough;
  if (!enough) { txt('statsneed', `Insights appear after 3 wake-ups. ${plural(3 - s.done, 'more')} to go.`); return; }
  txt('avgwake', formatTime(s.avgWake)); txt('hitrate', `${s.hitRate}%`);
  const lates = s.last7.map((d) => d.late).filter((v) => v !== null);
  const max = Math.max(20, Math.ceil(Math.max(0, ...lates) / 10) * 10), px = 88 / max;
  const grid = [0, max / 2, max].map((v, i) => `<div class="grid-l${i ? '' : ' base'}" style="bottom:${v * px}px"><span>${v}</span></div>`).join('');
  const cols = s.last7.map((d) => {
    if (d.late === null) return '<div class="col"><span>–</span></div>';
    const label = d.late < 0 ? `−${-d.late}` : d.late ? `+${d.late}` : '0';
    return `<div class="col"><span class="num">${label}</span><i class="${d.late > 5 ? 'late' : ''}" style="height:${Math.max(4, d.late * px)}px"></i></div>`;
  }).join('');
  const chart = $('#chart');
  chart.innerHTML = `${grid}<div class="cols">${cols}</div>`;
  chart.setAttribute('aria-label', `Minutes after your wake goal, last 7 days: ${s.last7.map((d) => `${DN[weekday(d.day)]} ${d.late === null ? 'no wake-up' : d.late}`).join(', ')}.`);
  $('#xlab').innerHTML = s.last7.map((d) => `<span>${DL[weekday(d.day)]}</span>`).join('');
  $('#weekendTip').hidden = s.weekendGap === null;
  if (s.weekendGap !== null) txt('weekendtxt', `You wake about ${s.weekendGap} minutes later on weekends. A 60-minute window or a later goal might fit better.`);
}

function renderMe() {
  const earned = BADGES.filter((b) => st.badges[b.id]).length;
  txt('badgecount', `${earned} of ${BADGES.length}`);
  $('#badges').innerHTML = BADGES.map((b) => {
    const on = !!st.badges[b.id];
    return `<div class="badge${on ? '' : ' locked'}"><div class="itile">${ic(on ? b.icon : 'lock')}</div><span>${b.name}</span></div>`;
  }).join('');
  $$('#themeseg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeSet === st.theme)));
  $('#soundSw').setAttribute('aria-checked', String(st.sound));
}

function renderCelebration() {
  const r = lastResult;
  if (!r) return;
  const close = windowOf(st).close;
  txt('celmsg', r.t <= r.goal
    ? `Up at ${formatTime(r.t)}, ${r.goal - r.t ? `${plural(r.goal - r.t, 'minute')} before your goal` : 'right on your goal'}.`
    : `Up at ${formatTime(r.t)}, ${plural(Math.max(0, close - r.t), 'minute')} before your window closed.`);
  const rewards = r.earned.map((id) => {
    const b = BADGES.find((x) => x.id === id);
    return { icon: b.icon, title: `New badge: ${b.name}`, sub: 'See all your badges on the Me tab.' };
  });
  if (r.freezeEarned) rewards.push({ icon: 'snow', title: 'You earned a streak freeze', sub: 'It covers one missed day automatically.' });
  if (!rewards.length) {
    const target = nextMilestone(r.streak);
    rewards.push({ icon: 'medal', title: `${plural(target - r.streak, 'day')} to your ${target}-day ${target <= 30 ? 'badge' : 'milestone'}`, sub: 'Wake up tomorrow to keep going.' });
  }
  $('#celextra').innerHTML = rewards.map((x) => `<div class="row"><div class="itile">${ic(x.icon)}</div><div class="grow"><p class="t-h3">${x.title}</p><p class="t-cap">${x.sub}</p></div></div>`).join('');
}

function confetti() {
  const box = $('#confetti'), cols = ['#2B1B3D', '#FFF6EC', '#FF8FA3', '#7CCBEA', '#E4572E'];
  box.innerHTML = '';
  for (let i = 0; i < 24; i++) {
    const e = document.createElement('i');
    e.className = 'conf';
    e.style.cssText = `left:${4 + Math.random() * 92}%;background:${cols[i % cols.length]};animation-delay:${-Math.random() * 2.8}s;animation-duration:${2.2 + Math.random() * 1.6}s`;
    box.appendChild(e);
  }
}

function chime() {
  if (!st.sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + i * 0.12;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 0.55);
    });
  } catch (e) { /* sound is optional */ }
}

// ---------- share image (1080 x 1350) ----------
let shareBlob = null;
function drawCard() {
  const W = 1080, H = 1350, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d'), ink = '#2B1B3D', n = now(), today = dayKey(n), streak = streakOf(st, today);
  const g = x.createLinearGradient(0, 0, W * 0.35, H);
  g.addColorStop(0, '#FFC247'); g.addColorStop(0.55, '#FF8A4C'); g.addColorStop(1, '#FF7A85');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,233,160,.45)'; x.beginPath(); x.arc(W / 2, 560, 390, 0, 7); x.fill();
  x.fillStyle = '#FFF6EC'; x.beginPath(); x.arc(W / 2, 560, 310, 0, 7); x.fill();
  x.fillStyle = '#E4572E'; x.beginPath(); x.moveTo(0, 1110); x.bezierCurveTo(260, 990, 520, 1000, 760, 1070); x.bezierCurveTo(900, 1110, 1000, 1080, W, 1030); x.lineTo(W, H); x.lineTo(0, H); x.fill();
  x.fillStyle = '#B93A5A'; x.beginPath(); x.moveTo(0, 1220); x.bezierCurveTo(300, 1140, 600, 1160, 820, 1210); x.bezierCurveTo(950, 1240, 1020, 1220, W, 1200); x.lineTo(W, H); x.lineTo(0, H); x.fill();
  x.save(); x.translate(W / 2 - 52, 300); x.scale(104 / 24, 104 / 24);
  const flame = new Path2D('M12 2.5c.8 3.4 5.5 5.6 5.5 11a5.5 5.5 0 0 1-11 0c0-2.7 1.3-4.3 2.7-5.3.2 2 1.1 3.1 2 3.6C11.6 9.3 10.9 5.6 12 2.5z');
  x.fillStyle = '#FF6B35'; x.fill(flame); x.lineWidth = 1.2; x.strokeStyle = '#C2410C'; x.stroke(flame); x.restore();
  x.textAlign = 'center'; x.fillStyle = ink;
  x.font = '900 250px Nunito, sans-serif'; x.fillText(String(streak), W / 2, 690);
  x.font = '900 64px Nunito, sans-serif'; x.fillText('day streak', W / 2, 775);
  if ('letterSpacing' in x) x.letterSpacing = '8px';
  x.font = '900 40px Nunito, sans-serif'; x.fillText('RISEWELL', W / 2, 130);
  if ('letterSpacing' in x) x.letterSpacing = '0px';
  const monday = addDays(today, -weekday(today)), step = 112, x0 = W / 2 - 3 * step, y = 940;
  for (let i = 0; i < 7; i++) {
    const r = st.history[addDays(monday, i)], cx = x0 + i * step, done = r?.status === 'done', frz = r?.status === 'freeze';
    x.beginPath(); x.arc(cx, y, 38, 0, 7);
    x.fillStyle = done ? ink : frz ? '#7CCBEA' : 'rgba(255,246,236,.55)'; x.fill();
    if (done) {
      x.strokeStyle = '#FFC247'; x.lineWidth = 8; x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath(); x.moveTo(cx - 15, y + 1); x.lineTo(cx - 4, y + 12); x.lineTo(cx + 16, y - 11); x.stroke();
    }
  }
  const rec = st.history[today];
  x.fillStyle = '#FFF6EC'; x.font = '800 40px Nunito, sans-serif';
  x.fillText(n.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + (rec?.status === 'done' ? ` · Up at ${formatTime(rec.t)}` : ''), W / 2, 1295);
  return c;
}
function openShare() {
  $('#shareSheet').hidden = false;
  history.pushState({ d: stack.length, sheet: 1 }, '');
  const make = () => drawCard().toBlob((b) => {
    shareBlob = b;
    const img = $('#shareImg');
    if (img.src) URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(b);
  }, 'image/png');
  document.fonts.load('900 100px Nunito').then(make, make);
}
const shareName = () => `risewell-${streakOf(st, dayKey(now()))}-day-streak.png`;
async function doShare() {
  if (!shareBlob) return;
  const file = new File([shareBlob], shareName(), { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch (e) { if (e.name !== 'AbortError') toast('Sharing failed. Try Save image instead.'); }
  } else toast('Sharing isn’t supported on this device. Use Save image instead.');
}
function doSave() {
  if (!shareBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(shareBlob); a.download = shareName();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Image saved to your Downloads.');
}
function closeSheets() {
  const open = $$('.sheet').some((s) => !s.hidden);
  if (open) history.back();
}

// ---------- theme ----------
function applyTheme() {
  if (st.theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = st.theme;
  paintThemeColor();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintThemeColor);

// ---------- events ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('button');
  if (!el) {
    if (e.target.classList.contains('sheet')) closeSheets();
    return;
  }
  if (el.disabled) return;
  const d = el.dataset;
  if (d.time) { editSchedule(st, now(), { goal: (st.goal + Number(d.time) + 1440) % 1440 }); save(); return render(); }
  if ('pickTime' in d) {
    const input = el.closest('[data-timepicker]').querySelector('input');
    const pad = (v) => String(v).padStart(2, '0');
    input.value = `${pad(Math.floor(st.goal / 60))}:${pad(st.goal % 60)}`;
    try { input.showPicker(); } catch (x) { input.focus(); input.click(); }
    return;
  }
  if (d.task) { st.task = d.task; save(); return render(); }
  if (d.day !== undefined) {
    const days = [...st.days]; days[+d.day] = days[+d.day] ? 0 : 1;
    editSchedule(st, now(), { days }); save(); return render();
  }
  if (d.win) { editSchedule(st, now(), { win: +d.win }); save(); return render(); }
  if (d.themeSet) { st.theme = d.themeSet; save(); applyTheme(); return render(); }
  if ('close' in d) return closeSheets();
  switch (el.id) {
    case 'finishSetup': finishOnboarding(st, now()); save(); keepData(); return reset('home');
    case 'awakeBtn': if (tapAwake(st, now())) { save(); go('doing'); } else render(); return;
    case 'doneTask': {
      const r = completeTask(st, now());
      if (!r) { reset('home'); return toast('Your 60 minutes ran out.'); }
      save(); lastResult = r;
      replace('celebrate'); renderCelebration(); confetti(); chime();
      return;
    }
    case 'swapTask': { const i = TASKS.findIndex((x) => x.id === st.task); st.task = TASKS[(i + 1) % TASKS.length].id; save(); return render(); }
    case 'shareBtn': return openShare();
    case 'doShare': return doShare();
    case 'doSave': return doSave();
    case 'noticeClose': st.notice = null; save(); return render();
    case 'soundSw': st.sound = !st.sound; save(); return render();
    case 'resetBtn': $('#resetSheet').hidden = false; history.pushState({ d: stack.length, sheet: 1 }, ''); return;
    case 'confirmReset': st = defaultState(); save(); applyTheme(); $('#resetSheet').hidden = true; skipPop = true; history.back(); return reset('welcome');
    case 'calPrev': calMonth.m--; if (calMonth.m < 0) { calMonth.m = 11; calMonth.y--; } return render();
    case 'calNext': calMonth.m++; if (calMonth.m > 11) { calMonth.m = 0; calMonth.y++; } return render();
  }
  if (d.go) return go(d.go);
  if (d.tabGo) return reset(d.tabGo);
  if (d.reset) return reset(d.reset);
  if ('back' in d) return back();
});

document.addEventListener('change', (e) => {
  if (!e.target.matches('.timeinput') || !e.target.value) return;
  const [h, m] = e.target.value.split(':').map(Number);
  editSchedule(st, now(), { goal: h * 60 + m }); save(); render();
});

// Re-check the clock every 30 seconds and whenever the app comes back to the front.
function tick() {
  const n = now(), events = reconcile(st, n);
  if (events.length) {
    const add = noticeFor(events, dayKey(n)), old = st.notice;
    st.notice = old ? { text: `${old.text} ${add.text}`, miss: old.miss || add.miss } : add;
    save();
  }
  if (['home', 'streak'].includes(current())) render();
}
setInterval(tick, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

// ---------- start ----------
applyTheme();
history.replaceState({ d: 1 }, '');
stack = [st.onboarded ? 'home' : 'welcome'];
show(stack[0]);
tick();
if (st.onboarded) keepData();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
