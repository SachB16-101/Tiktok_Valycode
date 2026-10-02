/**
 * Scoring.
 *
 * Two decisions here carry the whole design.
 *
 * 1. Adherence, not streaks. A streak makes one bad Saturday feel like
 *    failure, and the standard response to a broken streak is to quit. The
 *    metric the source material actually argues for is "how many weeks in a
 *    row did you hit three sessions", which survives a night out. So the
 *    headline number is a rolling percentage and the app never shows a
 *    consecutive-day counter.
 *
 * 2. Experimental habits score zero. They are counted, charted and reviewed,
 *    but they cannot move the number. Otherwise a week of thumbpulling and no
 *    sleep reads as a good week, which is exactly the failure this app exists
 *    to prevent.
 */

import { BY_ID, TIERS, meetsTarget } from "./habits.js";
import { dayLog, dayOffset, todayKey } from "./store.js";

/** Was this habit satisfied on this day, whatever kind of input it takes. */
export function isMet(habit, entry, bodyweightKg) {
  if (entry === undefined) return false;
  if (habit.input) return meetsTarget(habit, Number(entry), bodyweightKg);
  return entry === true;
}

/** Habits due on a given day, respecting cadence and what the user turned on. */
export function dueOn(state, key = todayKey()) {
  const active = state.active ?? [];
  const date = new Date(key + "T12:00:00");
  return active
    .map((id) => BY_ID[id])
    .filter(Boolean)
    .filter((h) => {
      if (h.cadence === "daily") return true;
      // Weekly and monthly habits surface on a fixed day so they cannot be
      // silently missed, and so they do not drag the daily score every day.
      if (h.cadence === "weekly") return date.getDay() === 0;
      if (h.cadence === "monthly") return date.getDate() === 1;
      return false;
    });
}

export function dayScore(state, key = todayKey()) {
  const log = state.log[key] ?? {};
  const bw = state.profile.bodyweightKg;
  let earned = 0;
  let possible = 0;
  const tally = { foundation: [0, 0], compounding: [0, 0], experimental: [0, 0] };

  for (const habit of dueOn(state, key)) {
    const met = isMet(habit, log[habit.id], bw);
    const t = tally[habit.tier];
    t[1] += 1;
    if (met) t[0] += 1;

    const weight = TIERS[habit.tier].weight;
    if (weight === 0) continue;
    possible += weight;
    if (met) earned += weight;
  }

  return {
    earned,
    possible,
    pct: possible === 0 ? null : Math.round((earned / possible) * 100),
    tally,
  };
}

/** Rolling adherence across a window ending today. Days before you started are ignored. */
export function adherence(state, days = 7, endKey = todayKey()) {
  let earned = 0;
  let possible = 0;
  for (let i = 0; i < days; i += 1) {
    const key = dayOffset(endKey, -i);
    if (key < state.profile.startedAt) break;
    const s = dayScore(state, key);
    earned += s.earned;
    possible += s.possible;
  }
  return possible === 0 ? null : Math.round((earned / possible) * 100);
}

/** Per-habit adherence over a window. Drives the library and experiment views. */
export function habitAdherence(state, habitId, days = 28, endKey = todayKey()) {
  const habit = BY_ID[habitId];
  if (!habit) return null;
  const bw = state.profile.bodyweightKg;
  let hit = 0;
  let seen = 0;
  for (let i = 0; i < days; i += 1) {
    const key = dayOffset(endKey, -i);
    if (key < state.profile.startedAt) break;
    seen += 1;
    if (isMet(habit, (state.log[key] ?? {})[habitId], bw)) hit += 1;
  }
  return seen === 0 ? null : { hit, seen, pct: Math.round((hit / seen) * 100) };
}

/**
 * Sessions per week, the metric the source material puts above all the daily
 * ones. Counts any training habit that was logged.
 */
const TRAINING = ["lift", "sport", "mace", "dand-bethak", "rings", "zone2"];

export function weeklySessions(state, weeksBack = 4, endKey = todayKey()) {
  const weeks = [];
  for (let w = 0; w < weeksBack; w += 1) {
    let count = 0;
    for (let d = 0; d < 7; d += 1) {
      const key = dayOffset(endKey, -(w * 7 + d));
      const log = state.log[key] ?? {};
      if (TRAINING.some((id) => log[id])) count += 1;
    }
    weeks.push(count);
  }
  return weeks; // index 0 is the current week
}

/** Consecutive weeks hitting the three-session bar, counting back from now. */
export function weeksAtThree(state, endKey = todayKey()) {
  const weeks = weeklySessions(state, 26, endKey);
  let n = 0;
  // The current week is still in progress, so it can only add, never break.
  for (let i = weeks[0] >= 3 ? 0 : 1; i < weeks.length; i += 1) {
    if (weeks[i] >= 3) n += 1;
    else break;
  }
  return n;
}

/* --------------------------------------------------------------- history */

export function history(state, days = 28, endKey = todayKey()) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayOffset(endKey, -i);
    const s = dayScore(state, key);
    out.push({ key, pct: s.pct, logged: Object.keys(state.log[key] ?? {}).length > 0 });
  }
  return out;
}

/* ----------------------------------------------------------- experiments */

/**
 * How faithfully an experiment was actually run. Without this number a
 * finished trial says nothing, because "it did not work" and "I did it nine
 * times" are different results.
 */
export function experimentAdherence(state, exp) {
  const habit = BY_ID[exp.habitId];
  if (!habit) return null;
  const bw = state.profile.bodyweightKg;
  const end = exp.endDate < todayKey() ? exp.endDate : todayKey();
  let hit = 0;
  let seen = 0;
  let key = exp.startDate;
  while (key <= end) {
    seen += 1;
    if (isMet(habit, (state.log[key] ?? {})[exp.habitId], bw)) hit += 1;
    key = dayOffset(key, 1);
  }
  return { hit, seen, pct: seen === 0 ? 0 : Math.round((hit / seen) * 100) };
}

/* ---------------------------------------------------------- what is due */

const CADENCE_DAYS = { weekly: 7, monthly: 30, quarterly: 91, yearly: 365 };

export function measureOverdue(state, measureId, cadence = "monthly") {
  const last = [...state.measures].reverse().find((m) => m[measureId] != null);
  if (!last) return { overdue: true, days: null };
  const days = Math.round((new Date() - new Date(last.date + "T12:00:00")) / 86400000);
  return { overdue: days >= CADENCE_DAYS[cadence], days, last };
}
