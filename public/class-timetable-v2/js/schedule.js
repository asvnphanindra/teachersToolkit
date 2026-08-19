import { columnHeader, isLoadColumn, isMappingColumn, parsePeriodsPerWeek } from "./models.js";

export const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function defaultPeriodTimes(count = 6) {
  return Array.from({ length: count }, (_, index) => {
    const startMinutes = 9 * 60 + index * 50;
    const endMinutes = startMinutes + 50;
    return {
      start: minutesToTime(startMinutes),
      end: minutesToTime(endMinutes),
    };
  });
}

export const TIMELINE = {
  startMinutes: 9 * 60,
  endMinutes: 17 * 60,
  snap: 5,
  minDuration: 10,
  minBreakDuration: 5,
  periodDuration: 50,
  breakDuration: 15,
  lunchDuration: 45,
};

export const BREAK_NAME_HINTS = ["Morning break", "Lunch break", "Afternoon break"];

export function minutesToTime(total) {
  const hours = Math.floor(Math.max(0, total) / 60);
  const minutes = Math.max(0, total) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function snapMinutes(value) {
  const snapped = Math.round(value / TIMELINE.snap) * TIMELINE.snap;
  return Math.min(TIMELINE.endMinutes, Math.max(TIMELINE.startMinutes, snapped));
}

function clampPeriodCount(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return 6;
  return Math.min(12, Math.max(1, n));
}

function clampBreakAfter(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return 1;
  return Math.min(12, Math.max(0, n));
}

function normalizeBreaks(breaks) {
  const source = Array.isArray(breaks) && breaks.length
    ? breaks
    : [
      { id: "break-morning", label: "Break", afterPeriod: 2, start: "10:40", end: "10:55" },
      { id: "break-lunch", label: "Lunch", afterPeriod: 4, start: "12:35", end: "13:20" },
    ];
  return source.map((item, index) => ({
    id: item.id || `break-${index + 1}`,
    label: String(item.label || "").trim(),
    afterPeriod: clampBreakAfter(item.afterPeriod),
    start: item.start || "",
    end: item.end || "",
  }));
}

function normalizeTimeRow(row, index) {
  if (row.type === "break") {
    return {
      type: "break",
      id: row.id || `break-${index + 1}`,
      label: String(row.label || "Break").trim() || "Break",
      start: row.start || "",
      end: row.end || "",
    };
  }
  const period = Number(row.period) || index + 1;
  return {
    type: "period",
    period,
    label: row.label || `Period ${period}`,
    start: row.start || "",
    end: row.end || "",
  };
}

function slotDurationMinutes(row, fallback) {
  const start = timeToMinutes(row.start);
  const end = timeToMinutes(row.end);
  if (start != null && end != null && end > start) return end - start;
  return fallback;
}

function timeRowsHaveOverlap(timeRows) {
  for (let i = 1; i < timeRows.length; i += 1) {
    const prevEnd = timeToMinutes(timeRows[i - 1].end);
    const start = timeToMinutes(timeRows[i].start);
    if (prevEnd != null && start != null && start < prevEnd) return true;
  }
  return false;
}

function layoutTimeRowsContiguous(timeRows) {
  const rows = timeRows.map(normalizeTimeRow);
  let cursor = timeToMinutes(rows[0]?.start) ?? TIMELINE.startMinutes;
  cursor = Math.max(TIMELINE.startMinutes, cursor);
  return rows.map((row) => {
    const duration = slotDurationMinutes(
      row,
      row.type === "break" ? TIMELINE.breakDuration : TIMELINE.periodDuration,
    );
    const start = cursor;
    const end = Math.min(TIMELINE.endMinutes, start + Math.max(minDurationFor(row), duration));
    cursor = end;
    return { ...row, start: minutesToTime(start), end: minutesToTime(end) };
  });
}

function timeRowsOutsideWindow(timeRows) {
  return timeRows.some((row) => {
    const start = timeToMinutes(row.start);
    const end = timeToMinutes(row.end);
    return (start != null && start < TIMELINE.startMinutes)
      || (end != null && end > TIMELINE.endMinutes);
  });
}

function fitTimeRowsToWindow(timeRows) {
  const rows = timeRows.map(normalizeTimeRow);
  if (!rows.length) return rows;
  const first = timeToMinutes(rows[0].start) ?? TIMELINE.startMinutes;
  const last = timeToMinutes(rows[rows.length - 1].end) ?? first;
  let delta = 0;
  if (first < TIMELINE.startMinutes) delta = TIMELINE.startMinutes - first;
  if (last + delta > TIMELINE.endMinutes) {
    const back = TIMELINE.endMinutes - (last + delta);
    if (first + delta + back >= TIMELINE.startMinutes) delta += back;
    else return layoutTimeRowsContiguous(rows.map((row) => ({
      ...row,
      start: minutesToTime(TIMELINE.startMinutes),
    })));
  }
  if (delta === 0) return rows;
  return rows.map((row) => shiftTimeRow(row, delta));
}

function timeRowsFromLegacy(setup) {
  const breaksByAfter = new Map();
  (setup.breaks || []).forEach((item) => {
    if (!item.label && !item.start && !item.end) return;
    const key = Number(item.afterPeriod) || 0;
    if (!breaksByAfter.has(key)) breaksByAfter.set(key, []);
    breaksByAfter.get(key).push(item);
  });

  const rows = [];
  let cursor = 9 * 60;
  const firstTime = setup.periodTimes?.[0] || defaultPeriodTimes(setup.periodsPerDay)[0];
  const firstStart = timeToMinutes(firstTime?.start);
  if (firstStart != null) cursor = firstStart;

  const appendSlot = (row, fallbackDuration) => {
    const duration = slotDurationMinutes(row, fallbackDuration);
    const start = cursor;
    const end = Math.min(TIMELINE.endMinutes, start + duration);
    rows.push({
      ...row,
      start: minutesToTime(start),
      end: minutesToTime(Math.max(start + TIMELINE.minDuration, end)),
    });
    cursor = Math.max(start + TIMELINE.minDuration, end);
  };

  (breaksByAfter.get(0) || []).forEach((item) => {
    appendSlot({
      type: "break",
      id: item.id,
      label: item.label || "Break",
      start: item.start || "",
      end: item.end || "",
    }, TIMELINE.breakDuration);
  });

  for (let period = 1; period <= setup.periodsPerDay; period += 1) {
    const time = setup.periodTimes?.[period - 1] || defaultPeriodTimes(setup.periodsPerDay)[period - 1];
    appendSlot({
      type: "period",
      period,
      label: `Period ${period}`,
      start: time.start || "",
      end: time.end || "",
    }, TIMELINE.periodDuration);
    (breaksByAfter.get(period) || []).forEach((item) => {
      appendSlot({
        type: "break",
        id: item.id,
        label: item.label || "Break",
        start: item.start || "",
        end: item.end || "",
      }, TIMELINE.breakDuration);
    });
  }
  return rows;
}

export function buildTimeRows(setup) {
  if (Array.isArray(setup.timeRows) && setup.timeRows.length) {
    return setup.timeRows.map(normalizeTimeRow);
  }
  return timeRowsFromLegacy(setup);
}

export function periodCountFromTimeRows(timeRows) {
  return timeRows.filter((row) => row.type === "period").length;
}

export function syncSetupFromTimeRows(timeRows) {
  const normalized = renumberPeriods(timeRows.map(normalizeTimeRow));
  const periodsPerDay = periodCountFromTimeRows(normalized);
  const periodTimes = normalized
    .filter((row) => row.type === "period")
    .map((row) => ({ start: row.start || "", end: row.end || "" }));

  let lastPeriod = 0;
  const breaks = [];
  normalized.forEach((row) => {
    if (row.type === "period") {
      lastPeriod = row.period;
      return;
    }
    breaks.push({
      id: row.id,
      label: row.label || "Break",
      afterPeriod: lastPeriod,
      start: row.start || "",
      end: row.end || "",
    });
  });

  return {
    periodsPerDay: Math.max(1, periodsPerDay),
    periodTimes,
    breaks,
    timeRows: normalized,
  };
}

export function renumberPeriods(timeRows) {
  let periodNum = 0;
  return timeRows.map((row) => {
    if (row.type !== "period") return { ...row };
    periodNum += 1;
    return { ...row, period: periodNum, label: `Period ${periodNum}` };
  });
}

export function nextBreakLabel(timeRows) {
  const used = new Set(
    timeRows.filter((row) => row.type === "break").map((row) => String(row.label || "").trim()),
  );
  return BREAK_NAME_HINTS.find((label) => !used.has(label)) || "Break";
}

export function timeRowDuration(row) {
  const start = timeToMinutes(row?.start);
  const end = timeToMinutes(row?.end);
  if (start == null || end == null) return 0;
  return Math.max(0, end - start);
}

export function timelineMarks() {
  const marks = [];
  for (let minutes = TIMELINE.startMinutes; minutes <= TIMELINE.endMinutes; minutes += 30) {
    marks.push({
      minutes,
      major: minutes % 60 === 0,
      label: minutes % 60 === 0 ? minutesToTime(minutes) : "",
      offset: ((minutes - TIMELINE.startMinutes) / (TIMELINE.endMinutes - TIMELINE.startMinutes)) * 100,
    });
  }
  return marks;
}

function minDurationFor(row) {
  return row?.type === "break" ? TIMELINE.minBreakDuration : TIMELINE.minDuration;
}

function lastSlotEndMinutes(timeRows) {
  let latest = TIMELINE.startMinutes;
  timeRows.forEach((row) => {
    const end = timeToMinutes(row.end) ?? timeToMinutes(row.start);
    if (end != null) latest = Math.max(latest, end);
  });
  return latest;
}

function shiftTimeRow(row, delta) {
  const start = timeToMinutes(row.start);
  const end = timeToMinutes(row.end);
  return {
    ...row,
    start: start == null ? row.start : minutesToTime(start + delta),
    end: end == null ? row.end : minutesToTime(end + delta),
  };
}

function stretchBreakSlot(rows, index, edge, minutes) {
  const row = rows[index];
  const start = timeToMinutes(row.start) ?? TIMELINE.startMinutes;
  const end = timeToMinutes(row.end) ?? start + TIMELINE.minBreakDuration;
  const snapped = snapMinutes(minutes);
  const minDur = minDurationFor(row);

  if (edge === "end") {
    let delta = snapped - end;
    if (end + delta < start + minDur) delta = start + minDur - end;
    const lastEnd = timeToMinutes(rows[rows.length - 1].end) ?? end;
    if (delta > 0 && lastEnd + delta > TIMELINE.endMinutes) {
      delta = TIMELINE.endMinutes - lastEnd;
    }
    if (delta === 0) return rows;
    row.end = minutesToTime(end + delta);
    for (let i = index + 1; i < rows.length; i += 1) {
      rows[i] = shiftTimeRow(rows[i], delta);
    }
    return rows;
  }

  let delta = snapped - start;
  if (start + delta > end - minDur) delta = end - minDur - start;
  const firstStart = timeToMinutes(rows[0].start) ?? start;
  if (delta < 0 && firstStart + delta < TIMELINE.startMinutes) {
    delta = TIMELINE.startMinutes - firstStart;
  }
  if (delta === 0) return rows;
  for (let i = 0; i < index; i += 1) {
    rows[i] = shiftTimeRow(rows[i], delta);
  }
  row.start = minutesToTime(start + delta);
  return rows;
}

export function insertTimeSlot(timeRows, type) {
  const rows = timeRows.map(normalizeTimeRow);
  const breakLabel = type === "break" ? nextBreakLabel(rows) : "";
  const duration = type === "break"
    ? (breakLabel === "Lunch break" ? TIMELINE.lunchDuration : TIMELINE.breakDuration)
    : TIMELINE.periodDuration;
  const start = rows.length ? lastSlotEndMinutes(rows) : TIMELINE.startMinutes;
  const end = start + duration;
  if (end > TIMELINE.endMinutes || end - start < minDurationFor({ type })) {
    throw new Error("No room left on the 09:00–17:00 day. Shorten a slot first.");
  }
  if (type === "break") {
    rows.push({
      type: "break",
      id: `break-${Date.now()}`,
      label: breakLabel,
      start: minutesToTime(start),
      end: minutesToTime(end),
    });
  } else {
    rows.push({
      type: "period",
      period: 0,
      label: "Period",
      start: minutesToTime(start),
      end: minutesToTime(end),
    });
  }
  return renumberPeriods(rows);
}

export function removeTimeSlot(timeRows, index) {
  const rows = timeRows.map(normalizeTimeRow);
  if (!rows[index]) return rows;
  if (rows[index].type === "period" && periodCountFromTimeRows(rows) <= 1) {
    throw new Error("Keep at least one period.");
  }
  rows.splice(index, 1);
  return renumberPeriods(rows);
}

export function resizeTimeSlot(timeRows, index, edge, minutes) {
  const rows = timeRows.map((row) => ({ ...normalizeTimeRow(row) }));
  const row = rows[index];
  if (!row) return rows;
  if (row.type === "break") {
    return renumberPeriods(stretchBreakSlot(rows, index, edge, minutes));
  }
  const snapped = snapMinutes(minutes);
  const start = timeToMinutes(row.start) ?? TIMELINE.startMinutes;
  const end = timeToMinutes(row.end) ?? start + minDurationFor(row);
  const minDur = minDurationFor(row);
  const prevMin = rows[index - 1] ? minDurationFor(rows[index - 1]) : minDur;
  const nextMin = rows[index + 1] ? minDurationFor(rows[index + 1]) : minDur;

  if (edge === "start") {
    const prev = rows[index - 1];
    const prevStart = prev ? timeToMinutes(prev.start) ?? TIMELINE.startMinutes : TIMELINE.startMinutes;
    const maxStart = end - minDur;
    const minStart = prev ? prevStart + prevMin : TIMELINE.startMinutes;
    const nextStart = Math.min(maxStart, Math.max(minStart, snapped));
    row.start = minutesToTime(nextStart);
    if (prev) prev.end = row.start;
  } else {
    const next = rows[index + 1];
    const nextEnd = next ? timeToMinutes(next.end) ?? TIMELINE.endMinutes : TIMELINE.endMinutes;
    const minEnd = start + minDur;
    const maxEnd = next ? nextEnd - nextMin : TIMELINE.endMinutes;
    const nextEndMinutes = Math.min(maxEnd, Math.max(minEnd, snapped));
    row.end = minutesToTime(nextEndMinutes);
    if (next) next.start = row.end;
  }
  return renumberPeriods(rows);
}

export function updateTimeSlotLabel(timeRows, index, label) {
  const rows = timeRows.map((row) => ({ ...normalizeTimeRow(row) }));
  if (rows[index]?.type === "break") {
    rows[index].label = String(label || "").trim() || "Break";
  }
  return rows;
}

export function minutesFromBar(clientX, barRect) {
  const width = barRect.width || 1;
  const ratio = (clientX - barRect.left) / width;
  const span = TIMELINE.endMinutes - TIMELINE.startMinutes;
  return snapMinutes(TIMELINE.startMinutes + ratio * span);
}

export function adjustTimeRowsForPeriodCount(timeRows, targetCount) {
  const count = clampPeriodCount(targetCount);
  let rows = timeRows.map(normalizeTimeRow);
  let currentCount = periodCountFromTimeRows(rows);

  if (currentCount === count) return rows;

  if (currentCount < count) {
    const defaults = defaultPeriodTimes(count);
    for (let period = currentCount + 1; period <= count; period += 1) {
      const time = defaults[period - 1];
      rows.push({
        type: "period",
        period,
        label: `Period ${period}`,
        start: time.start,
        end: time.end,
      });
    }
    return rows;
  }

  const removeFromEnd = currentCount - count;
  let removed = 0;
  while (removed < removeFromEnd) {
    const lastPeriodIndex = rows.map((row, index) => ({ row, index }))
      .filter(({ row }) => row.type === "period")
      .pop()?.index;
    if (lastPeriodIndex == null) break;
    rows.splice(lastPeriodIndex, 1);
    removed += 1;
  }

  let periodNum = 0;
  rows = rows.map((row) => {
    if (row.type !== "period") return row;
    periodNum += 1;
    return { ...row, period: periodNum, label: `Period ${periodNum}` };
  });
  return rows;
}

export function normalizeSchedule(project) {
  const schedule = project.schedule || {};
  const setup = schedule.setup || {};
  const periodsPerDay = clampPeriodCount(setup.periodsPerDay || 6);
  const defaults = defaultPeriodTimes(periodsPerDay);
  const workingDays = Array.isArray(setup.workingDays)
    ? setup.workingDays.filter((day) => WEEK_DAYS.includes(day))
    : [];

  const legacySetup = {
    workingDays: workingDays.length ? workingDays : [...WEEK_DAYS],
    periodsPerDay,
    periodTimes: Array.from({ length: periodsPerDay }, (_, index) => ({
      start: setup.periodTimes?.[index]?.start || defaults[index].start,
      end: setup.periodTimes?.[index]?.end || defaults[index].end,
    })),
    breaks: normalizeBreaks(setup.breaks),
    timeRows: setup.timeRows,
  };

  let timeRows = buildTimeRows(legacySetup);
  if (periodCountFromTimeRows(timeRows) === 0) {
    timeRows = timeRowsFromLegacy({ ...legacySetup, timeRows: null });
  }
  if (timeRowsHaveOverlap(timeRows)) {
    timeRows = layoutTimeRowsContiguous(timeRows);
  }
  if (timeRowsOutsideWindow(timeRows)) {
    timeRows = fitTimeRowsToWindow(timeRows);
  }
  timeRows = renumberPeriods(timeRows);
  const synced = syncSetupFromTimeRows(timeRows);

  project.schedule = {
    setup: {
      workingDays: legacySetup.workingDays,
      periodsPerDay: synced.periodsPerDay,
      periodTimes: synced.periodTimes,
      breaks: synced.breaks,
      timeRows: synced.timeRows,
    },
    facultyBusy: schedule.facultyBusy && typeof schedule.facultyBusy === "object" ? schedule.facultyBusy : {},
    slots: schedule.slots && typeof schedule.slots === "object" ? schedule.slots : {},
  };
  return project.schedule;
}

export function fullMappingIssues(project) {
  const issues = [];
  project.rows.forEach((row, rowIndex) => {
    project.columns.forEach((column) => {
      const value = String(row.cells[column.id] || "").trim();
      if (!value) issues.push(`Row ${rowIndex + 1}: ${columnHeader(column)} is empty.`);
    });
  });
  if (!project.columns.some(isMappingColumn)) {
    issues.push("Add at least one subject or lab column before scheduling.");
  }
  return issues;
}

export function scheduleGridColumns(setup) {
  const timeRows = setup.timeRows?.length ? setup.timeRows : buildTimeRows(setup);
  return timeRows.map((row) => {
    if (row.type === "break") {
      return {
        type: "break",
        id: row.id,
        label: row.label || "Break",
        time: timeRange(row),
      };
    }
    return {
      type: "period",
      period: row.period,
      label: `P${row.period}`,
      time: timeRange(row),
    };
  });
}

export function scheduleColumnTemplate(columns) {
  return columns.map((column) => (column.type === "break" ? "72px" : "minmax(88px, 1fr)")).join(" ");
}

function timeRange(item) {
  if (!item?.start && !item?.end) return "";
  if (!item.end) return item.start;
  if (!item.start) return item.end;
  return `${item.start}-${item.end}`;
}

export function sectionId(row) {
  return String(row?.cells?.["col-section-id"] || "").trim()
    || String(row?.cells?.["col-section-name"] || "").trim()
    || row?.id
    || "—";
}

export function sectionLabel(row) {
  const id = String(row.cells["col-section-id"] || "").trim();
  const name = String(row.cells["col-section-name"] || "").trim();
  return [id, name].filter(Boolean).join(" - ") || row.id;
}

export function assignmentRole(column) {
  if (column.kind === "lab") return "Lab";
  if (column.kind === "support") return column.baseKind === "lab" ? "Lab support" : "Support";
  return "Subject";
}

export function sectionAssignments(project, rowId) {
  const row = project.rows.find((item) => item.id === rowId) || project.rows[0];
  if (!row) return [];
  return project.columns.filter(isMappingColumn).map((column) => ({
    columnId: column.id,
    staff: String(row.cells[column.id] || "").trim(),
    title: column.title || columnHeader(column),
    header: columnHeader(column),
    kind: column.kind,
    role: assignmentRole(column),
  })).filter((assignment) => assignment.staff);
}

/**
 * One entry per staff member for a section, even when they hold several
 * subjects or labs there. The subject is chosen when a period is placed.
 */
export function sectionStaffGroups(project, rowId) {
  const groups = new Map();
  sectionAssignments(project, rowId).forEach((assignment) => {
    if (!groups.has(assignment.staff)) {
      groups.set(assignment.staff, { staff: assignment.staff, assignments: [] });
    }
    groups.get(assignment.staff).assignments.push(assignment);
  });
  return [...groups.values()];
}

export function staffOptionsFor(project, rowId, staff) {
  return sectionStaffGroups(project, rowId)
    .find((group) => group.staff === staff)?.assignments || [];
}

export function assignmentRecord(assignment) {
  return {
    columnId: assignment.columnId,
    staff: assignment.staff,
    title: assignment.title,
    role: assignment.role,
    kind: assignment.kind,
  };
}

export function linkedSupportAssignment(project, rowId, teaching) {
  if (!teaching || teaching.kind === "support") return null;
  const row = project.rows.find((item) => item.id === rowId);
  const teachingColumn = project.columns.find((column) => column.id === teaching.columnId);
  if (!row || !teachingColumn) return null;
  const baseKind = teachingColumn.kind === "lab" ? "lab" : "subject";
  const supportColumn = project.columns.find((column) => (
    column.kind === "support"
    && column.subjectKey === teachingColumn.subjectKey
    && column.baseKind === baseKind
  ));
  if (!supportColumn) return null;
  const staff = String(row.cells[supportColumn.id] || "").trim();
  if (!staff || staff === teaching.staff) return null;
  return assignmentRecord({
    columnId: supportColumn.id,
    staff,
    title: supportColumn.title || teaching.title,
    role: assignmentRole(supportColumn),
    kind: "support",
  });
}

export function slotOccupants(slot) {
  if (!slot?.staff) return [];
  const occupants = [slot];
  if (slot.support?.staff) occupants.push(slot.support);
  return occupants;
}

export function staffOccupiesSlot(slot, staff) {
  return slotOccupants(slot).some((occupant) => occupant.staff === staff);
}

export function getSlot(project, rowId, day, period) {
  return project.schedule?.slots?.[rowId]?.[day]?.[String(period)] || null;
}

export function setSlot(project, rowId, day, period, assignment) {
  normalizeSchedule(project);
  if (!project.schedule.slots[rowId]) project.schedule.slots[rowId] = {};
  if (!project.schedule.slots[rowId][day]) project.schedule.slots[rowId][day] = {};
  if (assignment) project.schedule.slots[rowId][day][String(period)] = assignment;
  else delete project.schedule.slots[rowId][day][String(period)];
}

export function clearSlot(project, rowId, day, period) {
  setSlot(project, rowId, day, period, null);
}

export function assignmentPlaced(project, rowId, day, columnId, period) {
  const slot = getSlot(project, rowId, day, period);
  return slot?.columnId === columnId;
}

function slotMatchesExclude(rowId, day, period, exclude) {
  if (!exclude) return false;
  return exclude.rowId === rowId
    && exclude.day === day
    && String(exclude.period) === String(period);
}

export function countColumnPeriods(project, rowId, columnId, exclude = null) {
  const days = project.schedule?.slots?.[rowId] || {};
  let count = 0;
  Object.entries(days).forEach(([day, periods]) => {
    Object.entries(periods || {}).forEach(([period, slot]) => {
      if (slotMatchesExclude(rowId, day, period, exclude)) return;
      if (slot?.columnId === columnId) count += 1;
    });
  });
  return count;
}

export function columnOnDay(project, rowId, day, columnId, exclude = null) {
  const periods = project.schedule?.slots?.[rowId]?.[day] || {};
  return Object.entries(periods).some(([period, slot]) => {
    if (slotMatchesExclude(rowId, day, period, exclude)) return false;
    return slot?.columnId === columnId;
  });
}

export function columnLoadIssue(project, rowId, day, assignment, exclude = null) {
  if (!assignment || assignment.kind === "support") return null;
  const column = (project.columns || []).find((item) => item.id === assignment.columnId);
  if (!column || !isLoadColumn(column)) return null;
  const row = (project.rows || []).find((item) => item.id === rowId);
  const section = row ? sectionLabel(row) : rowId;
  const title = assignment.title || column.title;
  if (!column.allowSameDayRepeat && columnOnDay(project, rowId, day, column.id, exclude)) {
    return `${title} is already on ${day} for ${section}. Turn on “May repeat on the same day” in Plan the week if that is intended.`;
  }
  const quota = parsePeriodsPerWeek(column.periodsPerWeek);
  if (quota == null) return null;
  const nextCount = countColumnPeriods(project, rowId, column.id, exclude) + 1;
  if (nextCount > quota) {
    return `${title} would be ${nextCount} periods this week; the plan allows ${quota}.`;
  }
  return null;
}

export function isStaffBusy(project, staff, day, period) {
  return (project.schedule?.facultyBusy?.[staff]?.[day] || []).includes(Number(period));
}

export function toggleStaffBusy(project, staff, day, period) {
  normalizeSchedule(project);
  if (!project.schedule.facultyBusy[staff]) project.schedule.facultyBusy[staff] = {};
  const list = project.schedule.facultyBusy[staff][day] || [];
  const n = Number(period);
  project.schedule.facultyBusy[staff][day] = list.includes(n)
    ? list.filter((item) => item !== n)
    : [...list, n].sort((a, b) => a - b);
}

export function staffBooking(project, staff, day, period, excludeRowId = null) {
  const slots = project.schedule?.slots || {};
  for (const row of project.rows) {
    if (row.id === excludeRowId) continue;
    const slot = slots[row.id]?.[day]?.[String(period)];
    if (staffOccupiesSlot(slot, staff)) {
      return {
        rowId: row.id,
        section: sectionLabel(row),
        sectionId: sectionId(row),
        slot,
      };
    }
  }
  return null;
}

export function staffPeriodPlacement(project, staff, day, period) {
  const slots = project.schedule?.slots || {};
  for (const row of project.rows) {
    const slot = slots[row.id]?.[day]?.[String(period)];
    if (!staffOccupiesSlot(slot, staff)) continue;
    return {
      rowId: row.id,
      section: sectionLabel(row),
      sectionId: sectionId(row),
      slot,
    };
  }
  return null;
}

export function scheduleStats(project) {
  const schedule = project.schedule ? normalizeSchedule(project) : null;
  const workingDays = schedule?.setup?.workingDays || [];
  const periodsPerDay = schedule?.setup?.periodsPerDay || 0;
  const totalSlots = project.rows.length * workingDays.length * periodsPerDay;
  let placedPeriods = 0;
  const sectionsTouched = new Set();
  const faculty = new Set();

  project.rows.forEach((row) => {
    workingDays.forEach((day) => {
      for (let period = 1; period <= periodsPerDay; period += 1) {
        const slot = schedule?.slots?.[row.id]?.[day]?.[String(period)];
        if (!slot?.staff) continue;
        placedPeriods += 1;
        sectionsTouched.add(row.id);
        faculty.add(slot.staff);
        if (slot.support?.staff) faculty.add(slot.support.staff);
      }
    });
  });

  return {
    placedPeriods,
    emptySlots: Math.max(0, totalSlots - placedPeriods),
    totalSlots,
    sectionsTouched: sectionsTouched.size,
    sectionCount: project.rows.length,
    facultyCount: faculty.size,
    workingDays: workingDays.length,
    periodsPerDay,
  };
}

/** Invert schedule.slots into staff -> day -> period entries. */
export function facultyTimetables(project) {
  const schedule = project.schedule ? normalizeSchedule(project) : { setup: { workingDays: [] }, slots: {} };
  const byStaff = new Map();

  project.rows.forEach((row) => {
    const section = sectionLabel(row);
    const days = schedule.slots?.[row.id] || {};
    Object.entries(days).forEach(([day, periods]) => {
      Object.entries(periods || {}).forEach(([period, slot]) => {
        slotOccupants(slot).forEach((occupant) => {
          const staff = String(occupant.staff || "").trim();
          if (!staff) return;
          if (!byStaff.has(staff)) byStaff.set(staff, {});
          if (!byStaff.get(staff)[day]) byStaff.get(staff)[day] = {};
          byStaff.get(staff)[day][String(period)] = {
            ...occupant,
            rowId: row.id,
            section,
          };
        });
      });
    });
  });

  return [...byStaff.keys()].sort((a, b) => a.localeCompare(b)).map((staff) => ({
    staff,
    days: byStaff.get(staff),
  }));
}
