import { columnHeader, isMappingColumn } from "./models.js";

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

function minutesToTime(total) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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

function timeRowsFromLegacy(setup) {
  const breaksByAfter = new Map();
  (setup.breaks || []).forEach((item) => {
    if (!item.label && !item.start && !item.end) return;
    const key = Number(item.afterPeriod) || 0;
    if (!breaksByAfter.has(key)) breaksByAfter.set(key, []);
    breaksByAfter.get(key).push(item);
  });

  const rows = [];
  (breaksByAfter.get(0) || []).forEach((item) => {
    rows.push({
      type: "break",
      id: item.id,
      label: item.label || "Break",
      start: item.start || "",
      end: item.end || "",
    });
  });

  for (let period = 1; period <= setup.periodsPerDay; period += 1) {
    const time = setup.periodTimes?.[period - 1] || defaultPeriodTimes(setup.periodsPerDay)[period - 1];
    rows.push({
      type: "period",
      period,
      label: `Period ${period}`,
      start: time.start || "",
      end: time.end || "",
    });
    (breaksByAfter.get(period) || []).forEach((item) => {
      rows.push({
        type: "break",
        id: item.id,
        label: item.label || "Break",
        start: item.start || "",
        end: item.end || "",
      });
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
  const normalized = timeRows.map(normalizeTimeRow);
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
    periodsPerDay,
    periodTimes,
    breaks,
    timeRows: normalized,
  };
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
  timeRows = adjustTimeRowsForPeriodCount(timeRows, periodsPerDay);
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
    if (slot?.staff === staff) {
      return {
        rowId: row.id,
        section: sectionLabel(row),
        slot,
      };
    }
  }
  return null;
}
