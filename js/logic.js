// Streak rules. Pure functions over a plain state object, so they run in the
// browser and under `node --test` alike. Dates are local-time keys "YYYY-MM-DD";
// times of day are minutes after midnight.

export const EARLY_MINUTES = 120; // "I'm Awake" opens this long before the goal
export const TASK_MINUTES = 60; // the tiny task must be done this long after the tap
export const POINTS_PER_WAKE = 20;
export const POINTS_PER_LEVEL = 500;
export const MAX_FREEZES = 2;
export const FREEZE_EVERY = 14; // earn a freeze at every 14-day multiple
export const MILESTONES = [7, 14, 30, 60, 100, 200, 365];

export const TASKS = [
  { id: 'water', icon: 'drop', name: 'Drink a glass of water', desc: 'Fill a glass, drink it, and come back.', time: 'About 30 seconds' },
  { id: 'curtains', icon: 'window', name: 'Open the curtains', desc: 'Let daylight hit your face for a moment.', time: 'About 10 seconds' },
  { id: 'pushups', icon: 'dumbbell', name: 'Do 10 push-ups', desc: 'Get your blood moving. Knee push-ups count.', time: 'About 45 seconds' },
  { id: 'stretch', icon: 'stretch', name: 'Stretch for one minute', desc: 'Reach up high, then slowly touch your toes.', time: 'About 60 seconds' },
  { id: 'bed', icon: 'bed', name: 'Make your bed', desc: 'Smooth the sheet and straighten the pillow.', time: 'About 40 seconds' },
  { id: 'outside', icon: 'door', name: 'Step outside', desc: 'Open the door and take five slow breaths.', time: 'About 30 seconds' },
];

export const BADGES = [
  { id: 'd7', name: '7 days', icon: 'sprout' },
  { id: 'early', name: 'Up before 6 AM', icon: 'sunrise' },
  { id: 'saver', name: 'Freeze saver', icon: 'snow' },
  { id: 'd14', name: '14 days', icon: 'medal' },
  { id: 'd30', name: '30 days', icon: 'crown' },
];

export function defaultState() {
  return {
    v: 1,
    onboarded: false,
    goal: 420, // 7:00 AM
    win: 30,
    days: [1, 1, 1, 1, 1, 1, 1], // Monday first
    task: 'water',
    start: null, // first day the streak can count
    lastRec: null, // last day whose outcome is settled
    setupDay: null, // the day setup finished, if the streak starts that day; never costs a freeze or a miss
    lock: null, // { day, goal, win, days }: today's schedule before a mid-window edit
    history: {}, // dayKey -> { status: 'awake'|'done'|'freeze'|'miss', t, goal, task }
    freezes: 1,
    points: 0,
    longest: 0,
    badges: {}, // badgeId -> dayKey earned
    theme: 'system',
    sound: true,
  };
}

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
export const weekday = (k) => (parseKey(k).getDay() + 6) % 7; // Monday = 0
export const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();
// A schedule edit made after today's window opened applies from tomorrow:
// `st.lock` keeps today's schedule as it was before the edit.
const scheduleFor = (st, k) => (k && st.lock && st.lock.day === k ? st.lock : st);
export const isScheduled = (st, k) => !!scheduleFor(st, k).days[weekday(k)];

export function windowOf(st, k) {
  const s = scheduleFor(st, k);
  return { open: Math.max(0, s.goal - EARLY_MINUTES), close: Math.min(1439, s.goal + s.win) };
}

// Change the goal, window or repeat days. If today's window has already opened
// and today is not finished or settled, today keeps its old schedule.
export function editSchedule(st, now, change) {
  const today = dayKey(now);
  const counts = st.onboarded && st.start && st.start <= today && !(st.lastRec >= today);
  const open = minutesOf(now) >= windowOf(st, today).open;
  if (counts && open && st.history[today]?.status !== 'done' && st.lock?.day !== today) {
    st.lock = { day: today, goal: st.goal, win: st.win, days: [...st.days] };
  }
  Object.assign(st, change);
  return st;
}

// Last minute of the day the tiny task still counts for a tap at `rec.t`.
export const taskDeadline = (rec) => Math.min(rec.t + TASK_MINUTES, 1439);

export function formatTime(min) {
  min = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(min / 60), m = min % 60;
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

// ---------- lifecycle ----------

// The streak starts today if today's window has not closed yet, otherwise tomorrow.
// Setup day can only add to the streak: missing it costs nothing.
export function finishOnboarding(st, now) {
  const today = dayKey(now);
  st.onboarded = true;
  st.start = minutesOf(now) <= windowOf(st).close ? today : addDays(today, 1);
  st.setupDay = st.start === today ? today : null;
  st.lastRec = addDays(st.start, -1);
  return st;
}

// Settle every day whose window has closed: a scheduled day without a finished
// task uses a freeze if one is left, otherwise it is a miss. Returns events.
export function reconcile(st, now) {
  const events = [];
  if (!st.onboarded || !st.start) return events;
  const today = dayKey(now), m = minutesOf(now);
  let k = st.lastRec && st.lastRec >= st.start ? addDays(st.lastRec, 1) : st.start;
  while (k <= today) {
    const rec = st.history[k];
    if (k === today) {
      // Today stays open until the window closes, or after a tap, until the task deadline.
      const pending = rec?.status === 'awake' ? m <= taskDeadline(rec) : m <= windowOf(st, k).close;
      if (pending) break;
    }
    if (isScheduled(st, k) && k !== st.setupDay) {
      if (!rec || rec.status === 'awake') {
        if (st.freezes > 0) {
          st.freezes--;
          st.history[k] = { status: 'freeze' };
          if (!st.badges.saver) st.badges.saver = today;
          events.push({ type: 'freeze', day: k });
        } else {
          st.history[k] = { status: 'miss' };
          events.push({ type: 'miss', day: k });
        }
      }
    }
    st.lastRec = k;
    k = addDays(k, 1);
  }
  if (st.lock && st.lock.day <= st.lastRec) st.lock = null;
  return events;
}

// Consecutive finished days back from today. Freezes and days off keep the run
// going without adding to it; a miss ends it.
export function streakOf(st, today) {
  if (!st.start) return 0;
  let s = 0;
  for (let k = today; k >= st.start; k = addDays(k, -1)) {
    const r = st.history[k];
    if (!r) continue;
    if (r.status === 'done') s++;
    else if (r.status === 'miss') break;
  }
  return s;
}

export function todayStatus(st, now) {
  const k = dayKey(now), m = minutesOf(now), w = windowOf(st, k), r = st.history[k];
  const base = { day: k, now: m, ...w };
  const lapsed = k === st.setupDay ? 'notyet' : 'closed';
  if (r && r.status !== 'awake') return { ...base, kind: r.status, rec: r };
  if (r) {
    const due = taskDeadline(r);
    return { ...base, kind: m <= due ? 'awake' : lapsed, rec: r, due };
  }
  if (st.start && k < st.start) return { ...base, kind: 'notyet' };
  if (!isScheduled(st, k)) return { ...base, kind: 'off' };
  if (m < w.open) return { ...base, kind: 'early' };
  if (m <= w.close) return { ...base, kind: 'open', left: w.close - m };
  return { ...base, kind: lapsed };
}

export function tapAwake(st, now) {
  const s = todayStatus(st, now);
  if (s.kind !== 'open') return false;
  st.history[s.day] = { status: 'awake', t: s.now, goal: scheduleFor(st, s.day).goal };
  return true;
}

export function completeTask(st, now) {
  const k = dayKey(now), r = st.history[k];
  if (!r || r.status !== 'awake' || minutesOf(now) > taskDeadline(r)) return null;
  st.history[k] = { status: 'done', t: r.t, goal: r.goal, task: st.task };
  st.points += POINTS_PER_WAKE;
  const streak = streakOf(st, k);
  st.longest = Math.max(st.longest, streak);
  let freezeEarned = false;
  if (streak % FREEZE_EVERY === 0 && st.freezes < MAX_FREEZES) {
    st.freezes++;
    freezeEarned = true;
  }
  const earned = [];
  const award = (id) => { if (!st.badges[id]) { st.badges[id] = k; earned.push(id); } };
  if (streak >= 7) award('d7');
  if (streak >= 14) award('d14');
  if (streak >= 30) award('d30');
  if (r.t < 360) award('early');
  return { streak, t: r.t, goal: r.goal, gained: POINTS_PER_WAKE, freezeEarned, earned };
}

export function nextMilestone(streak) {
  return MILESTONES.find((x) => x > streak) ?? streak + 100;
}

export function levelOf(points) {
  return { level: Math.floor(points / POINTS_PER_LEVEL) + 1, into: points % POINTS_PER_LEVEL, toNext: POINTS_PER_LEVEL - (points % POINTS_PER_LEVEL) };
}

// Numbers for the Insights screen, over the last 30 days.
export function insightsOf(st, today) {
  let done = 0, judged = 0, sum = 0;
  const wk = [], we = [];
  for (let i = 0; i < 30; i++) {
    const k = addDays(today, -i), r = st.history[k];
    if (!r || r.status === 'awake') continue;
    judged++;
    if (r.status !== 'done') continue;
    done++;
    sum += r.t;
    (weekday(k) >= 5 ? we : wk).push(r.t - r.goal);
  }
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const k = addDays(today, -i), r = st.history[k];
    last7.push({ day: k, late: r && r.status === 'done' ? r.t - r.goal : null });
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  let weekendGap = null;
  if (wk.length >= 2 && we.length >= 2) {
    const gap = Math.round(avg(we) - avg(wk));
    if (gap >= 10) weekendGap = gap;
  }
  return {
    done,
    avgWake: done ? Math.round(sum / done) : null,
    hitRate: judged ? Math.round((done / judged) * 100) : null,
    last7,
    weekendGap,
  };
}
