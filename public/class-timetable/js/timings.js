import { DEFAULT_TIMINGS } from "./models.js";

/** Ensure timings object has all fields (migrate older saves). */
export function normalizeTimings(timings) {
  const t = { ...DEFAULT_TIMINGS, ...timings };
  const n = t.periodsPerDay || 6;
  if (!t.periodTimes || t.periodTimes.length !== n) {
    t.periodTimes = Array.from({ length: n }, (_, i) => ({
      start: t.periodStarts?.[i] || defaultPeriodStart(i),
      end: t.periodStarts?.[i + 1] || addMinutes(t.periodStarts?.[i] || defaultPeriodStart(i), 50),
    }));
  }
  if (!t.morningBreak) t.morningBreak = { start: "", end: "" };
  if (!t.lunchBreak) t.lunchBreak = { start: "", end: "" };
  if (!t.planMode) t.planMode = "week";
  if (!t.singleDay) t.singleDay = t.workingDays?.[0] || "Monday";
  if (!t.lunchPeriods) t.lunchPeriods = [];
  return t;
}

function defaultPeriodStart(i) {
  const base = 9 * 60;
  const m = base + i * 50;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function addMinutes(hhmm, mins) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Days shown in the planner grid */
export function getPlanningDays(timings) {
  const t = normalizeTimings(timings);
  if (t.planMode === "single-day" && t.singleDay) return [t.singleDay];
  return t.workingDays || [];
}

export function periodHeader(timings, p) {
  const t = normalizeTimings(timings);
  const pt = t.periodTimes[p - 1];
  if (pt?.start && pt?.end) return `P${p}<br><small>${pt.start}–${pt.end}</small>`;
  if (pt?.start) return `P${p}<br><small>${pt.start}</small>`;
  return `P${p}`;
}

export function isNonTeachingPeriod(timings, period) {
  const t = normalizeTimings(timings);
  return (t.lunchPeriods || []).includes(Number(period));
}

export function rebuildPeriodTimes(count, existing = []) {
  return Array.from({ length: count }, (_, i) => ({
    start: existing[i]?.start || defaultPeriodStart(i),
    end: existing[i]?.end || addMinutes(existing[i]?.start || defaultPeriodStart(i), 50),
  }));
}
