import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultState, finishOnboarding, reconcile, streakOf, todayStatus, tapAwake,
  completeTask, dayKey, addDays, insightsOf, editSchedule, windowOf, nextStreakBadge, prevStreakBadge, badgeList,
} from '../js/logic.js';

// Monday 2026-09-28 is the first day of every scenario.
const at = (day, h, m = 0, s = 0) => { const d = new Date(2026, 8, 28 + day); d.setHours(h, m, s, 0); return d; };

function started(opts = {}) {
  const st = Object.assign(defaultState(), { goal: 390, win: 30 }, opts); // 6:30 to 7:00
  finishOnboarding(st, at(-1, 12)); // setup the day before, so day 0 is an ordinary day
  return st;
}
function wake(st, day, h = 6, m = 40) {
  reconcile(st, at(day, h, m));
  assert.ok(tapAwake(st, at(day, h, m)), 'tap should be accepted');
  return completeTask(st, at(day, h, m + 1));
}

test('onboarding before the window closes starts today, after starts tomorrow', () => {
  const a = defaultState(); a.goal = 390; finishOnboarding(a, at(0, 6, 50));
  assert.equal(a.start, dayKey(at(0, 0)));
  const b = defaultState(); b.goal = 390; finishOnboarding(b, at(0, 7, 1));
  assert.equal(b.start, dayKey(at(1, 0)));
});

test('window states: early, open, closed', () => {
  const st = started();
  assert.equal(todayStatus(st, at(0, 4, 29)).kind, 'early');
  assert.equal(todayStatus(st, at(0, 4, 30)).kind, 'open');
  assert.equal(todayStatus(st, at(0, 6, 52)).left, 8);
  assert.equal(todayStatus(st, at(0, 7, 1)).kind, 'closed');
  assert.equal(tapAwake(st, at(0, 7, 1)), false);
});

test('tap alone does not count until the task is done', () => {
  const st = started();
  tapAwake(st, at(0, 6, 40));
  assert.equal(streakOf(st, dayKey(at(0, 0))), 0);
  const r = completeTask(st, at(0, 6, 41));
  assert.equal(r.streak, 1);
});

test('consecutive days build the streak and longest', () => {
  const st = started();
  for (let d = 0; d < 5; d++) wake(st, d);
  assert.equal(streakOf(st, dayKey(at(4, 0))), 5);
  assert.equal(st.longest, 5);
});

test('a missed day uses the freeze and keeps the streak', () => {
  const st = started();
  wake(st, 0); wake(st, 1);
  const ev = reconcile(st, at(3, 6, 0)); // day 2 skipped
  assert.deepEqual(ev.map((e) => e.type), ['freeze']);
  assert.equal(st.freezes, 0);
  assert.ok(st.badges.saver);
  const r = wake(st, 3);
  assert.equal(r.streak, 3);
});

test('a miss with no freeze left resets the streak', () => {
  const st = started({ freezes: 0 });
  wake(st, 0); wake(st, 1);
  reconcile(st, at(2, 7, 5));
  assert.equal(st.history[dayKey(at(2, 0))].status, 'miss');
  assert.equal(streakOf(st, dayKey(at(2, 0))), 0);
  assert.equal(wake(st, 3).streak, 1);
  assert.equal(st.longest, 2);
});

test('days off do not break or add to the streak', () => {
  const st = started({ days: [1, 1, 1, 1, 1, 0, 0], freezes: 0 });
  for (let d = 0; d < 5; d++) wake(st, d); // Mon to Fri
  reconcile(st, at(7, 6, 0)); // next Monday morning
  assert.equal(todayStatus(st, at(5, 8)).kind, 'off');
  assert.equal(wake(st, 7).streak, 6);
});

test('tapped but unfinished task becomes a miss after its 3 minutes', () => {
  const st = started({ freezes: 0 });
  wake(st, 0);
  tapAwake(st, at(1, 6, 40));
  reconcile(st, at(1, 6, 43)); // task still due until 6:43:00
  assert.equal(st.history[dayKey(at(1, 0))].status, 'awake');
  reconcile(st, at(1, 6, 43, 1));
  assert.equal(st.history[dayKey(at(1, 0))].status, 'miss');
});

test('freeze earned at 14 days, capped at 2', () => {
  const st = started({ freezes: 1 });
  let r;
  for (let d = 0; d < 14; d++) r = wake(st, d);
  assert.equal(r.streak, 14);
  assert.equal(r.freezeEarned, true);
  assert.equal(st.freezes, 2);
  assert.ok(st.badges.d7 && st.badges.d14);
});

test('reconcile is idempotent', () => {
  const st = started({ freezes: 0 });
  reconcile(st, at(3, 12));
  const snap = JSON.stringify(st);
  reconcile(st, at(3, 12));
  assert.equal(JSON.stringify(st), snap);
});

test('insights report average wake, hit rate and weekend gap', () => {
  const st = started();
  for (let d = 0; d < 7; d++) wake(st, d, d >= 5 ? 6 : 6, d >= 5 ? 55 : 31);
  const i = insightsOf(st, dayKey(at(6, 0)));
  assert.equal(i.done, 7);
  assert.equal(i.hitRate, 100);
  assert.equal(i.weekendGap, 24);
  assert.equal(i.last7.length, 7);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('a goal edit after the window opens applies from tomorrow', () => {
  const st = Object.assign(defaultState(), { goal: 540 }); // 9:00 AM
  finishOnboarding(st, at(-1, 12));
  assert.deepEqual(reconcile(st, at(0, 8)), []);
  editSchedule(st, at(0, 8), { goal: 420 }); // 7:00 AM, window already closed
  assert.deepEqual(reconcile(st, at(0, 8)), []);
  assert.equal(todayStatus(st, at(0, 8)).kind, 'open');
  assert.equal(st.lock.goal, 540);
  editSchedule(st, at(0, 8, 5), { days: [0, 1, 1, 1, 1, 1, 1] }); // Monday off
  assert.equal(st.lock.goal, 540, 'first snapshot is kept');
  assert.equal(todayStatus(st, at(0, 8, 5)).kind, 'open');
  tapAwake(st, at(0, 8, 10)); completeTask(st, at(0, 8, 11));
  reconcile(st, at(1, 6));
  assert.equal(st.lock, null);
  assert.equal(windowOf(st, dayKey(at(1, 0))).close, 450);
});

test('a goal edit before the window opens applies today', () => {
  const st = Object.assign(defaultState(), { goal: 540 });
  finishOnboarding(st, at(-1, 12));
  editSchedule(st, at(0, 6), { goal: 480 });
  assert.equal(st.lock, null);
  assert.equal(todayStatus(st, at(0, 8, 31)).kind, 'closed');
});

test('a tap under a locked schedule records the locked goal', () => {
  const st = Object.assign(defaultState(), { goal: 540 });
  finishOnboarding(st, at(-1, 12));
  editSchedule(st, at(0, 8), { goal: 420 });
  tapAwake(st, at(0, 8, 10));
  assert.equal(st.history[dayKey(at(0, 0))].goal, 540);
});

test('the tiny task counts within 3 minutes of the tap, to the second', () => {
  const st = started({ goal: 420 }); // window closes 7:30
  tapAwake(st, at(0, 7, 0, 50));
  assert.equal(todayStatus(st, at(0, 7, 2)).due, 7 * 3600 + 3 * 60 + 50);
  assert.equal(completeTask(st, at(0, 7, 3, 50)).streak, 1);
});

test('the tiny task no longer counts after 3 minutes', () => {
  const st = started({ goal: 420 });
  tapAwake(st, at(0, 7, 0, 50));
  assert.equal(completeTask(st, at(0, 7, 3, 51)), null);
  assert.equal(todayStatus(st, at(0, 7, 3, 51)).kind, 'closed');
});

test('an unfinished task is settled once its 3 minutes pass', () => {
  const st = started({ goal: 420 });
  tapAwake(st, at(0, 7, 0));
  assert.deepEqual(reconcile(st, at(0, 7, 3)), []);
  const ev = reconcile(st, at(0, 7, 3, 1));
  assert.deepEqual(ev, [{ type: 'freeze', day: dayKey(at(0, 0)) }]);
  const early = started({ goal: 540 }); // tapped at 7:30, window open until 9:30
  tapAwake(early, at(0, 7, 30));
  assert.equal(reconcile(early, at(0, 7, 33, 1)).length, 1);
});

test('a tap saved before seconds were recorded gets 3 minutes from its minute', () => {
  const st = started({ goal: 420 });
  st.history[dayKey(at(0, 0))] = { status: 'awake', t: 420, goal: 420 };
  assert.equal(todayStatus(st, at(0, 7, 3)).kind, 'awake');
  assert.equal(todayStatus(st, at(0, 7, 3, 1)).kind, 'closed');
});

test('an untapped setup day costs no freeze and no miss', () => {
  const st = Object.assign(defaultState(), { goal: 540 }); // 9:00, window closes 9:30
  finishOnboarding(st, at(0, 6));
  assert.equal(st.setupDay, dayKey(at(0, 0)));
  assert.equal(todayStatus(st, at(0, 9, 31)).kind, 'notyet');
  tapAwake(st, at(1, 9)); completeTask(st, at(1, 9, 1));
  const ev = reconcile(st, at(1, 10));
  assert.deepEqual(ev.filter((e) => e.day === dayKey(at(0, 0))), []);
  assert.equal(st.history[dayKey(at(0, 0))], undefined);
  assert.equal(st.freezes, 1);
  assert.equal(streakOf(st, dayKey(at(1, 0))), 1);
});

test('a lapsed task on setup day costs nothing either', () => {
  const st = Object.assign(defaultState(), { goal: 540 });
  finishOnboarding(st, at(0, 6));
  tapAwake(st, at(0, 8));
  assert.deepEqual(reconcile(st, at(0, 8, 4)), []);
  assert.equal(todayStatus(st, at(0, 8, 4)).kind, 'notyet');
  assert.deepEqual(reconcile(st, at(0, 9, 1)), []);
  assert.equal(todayStatus(st, at(0, 9, 1)).kind, 'notyet');
  assert.equal(st.freezes, 1);
});

test('finishing on setup day counts as normal', () => {
  const st = Object.assign(defaultState(), { goal: 540 });
  finishOnboarding(st, at(0, 6));
  tapAwake(st, at(0, 8, 50));
  assert.equal(completeTask(st, at(0, 8, 51)).streak, 1);
  assert.deepEqual(reconcile(st, at(1, 10)).filter((e) => e.day === dayKey(at(0, 0))), []);
  assert.equal(streakOf(st, dayKey(at(0, 0))), 1);
});

test('a miss reports the length of the streak it ended', () => {
  const st = started({ freezes: 1 });
  for (let d = 0; d < 5; d++) wake(st, d); // Mon to Fri
  const ev = reconcile(st, at(7, 9)); // the following Monday
  assert.deepEqual(ev.map((e) => [e.type, e.streak]), [['freeze', undefined], ['miss', 5], ['miss', 0]]);
});

test('a swapped task counts for that day only', () => {
  const st = started();
  st.todayTask = { day: dayKey(at(0, 0)), id: 'pushups' };
  wake(st, 0);
  assert.equal(st.history[dayKey(at(0, 0))].task, 'pushups');
  assert.equal(st.task, 'water');
  wake(st, 1);
  assert.equal(st.history[dayKey(at(1, 0))].task, 'water');
});

test('streak badges follow 7, 10, 14, 30, 50, 75, 100, then every 100', () => {
  assert.deepEqual([0, 7, 9, 10, 14, 29, 30, 50, 75, 99, 100, 150, 200].map(nextStreakBadge),
    [7, 10, 10, 14, 30, 30, 50, 75, 100, 100, 200, 200, 300]);
  assert.deepEqual([0, 6, 7, 13, 99, 100, 250].map(prevStreakBadge), [0, 0, 7, 10, 75, 100, 200]);
  const st = started();
  let r;
  for (let d = 0; d < 10; d++) r = wake(st, d);
  assert.deepEqual(r.earned, ['d10']);
  assert.ok(st.badges.d7 && !st.badges.d14);
  assert.deepEqual(badgeList(st).map((b) => [b.id, !!b.earned]),
    [['d7', true], ['d10', true], ['d14', false], ['early', false], ['saver', false]]);
});

test('a long streak earns every badge it passed', () => {
  const st = started();
  for (let d = 0; d < 199; d++) wake(st, d);
  const r = wake(st, 199);
  assert.deepEqual(r.earned, ['d200']);
  assert.deepEqual(Object.keys(st.badges).filter((id) => id.startsWith('d')).sort(),
    ['d10', 'd100', 'd14', 'd200', 'd30', 'd50', 'd7', 'd75']);
});
