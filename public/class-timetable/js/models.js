export const BASE_PATH = new URL(".", window.location.href).pathname;

export const STORAGE_PREFIX = "ttk:class-timetable:";

export const DEFAULT_TIMINGS = {
  planMode: "week",
  singleDay: "Monday",
  workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  periodsPerDay: 6,
  periodStarts: ["09:00", "09:50", "10:40", "11:30", "12:20", "13:10"],
  periodTimes: [
    { start: "09:00", end: "09:50" },
    { start: "09:50", end: "10:40" },
    { start: "10:40", end: "11:30" },
    { start: "11:30", end: "12:20" },
    { start: "12:20", end: "13:10" },
    { start: "13:10", end: "14:00" },
  ],
  morningBreak: { start: "11:00", end: "11:15" },
  lunchBreak: { start: "13:00", end: "13:45" },
  lunchPeriods: [4],
};

export const AVAILABILITY_TEMPLATES = {
  full: { label: "Full time (all days, all periods)" },
  weekdays: { label: "Mon–Fri only" },
  mornings: { label: "Mornings (periods 1–3)" },
  afternoons: { label: "Afternoons (periods 4–6)" },
};

export function uid(prefix = "id") {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function createEmptyTimetable(name) {
  const now = new Date().toISOString();
  return {
    id: uid("tt"),
    name: name.trim(),
    meta: { createdAt: now, updatedAt: now, version: 1 },
    timings: structuredClone(DEFAULT_TIMINGS),
    sections: [],
    rooms: [],
    sectionRoomMap: {},
    subjects: [],
    faculty: [],
    subjectFacultyMap: {},
    slots: {},
    constraints: { preventOverlaps: true, maxConsecutiveLectures: 2 },
  };
}

export function createSection(name) {
  return { id: uid("sec"), name: name.trim() };
}

export function createRoom(name) {
  return { id: uid("room"), name: name.trim() };
}

export function createSubject(name, weeklyPeriods = 0) {
  return { id: uid("sub"), name: name.trim(), weeklyPeriods: Number(weeklyPeriods) || 0, isLecture: true };
}

export function createFaculty(name) {
  return { id: uid("fac"), name: name.trim(), availability: fullAvailability() };
}

export function fullAvailability(timings = DEFAULT_TIMINGS) {
  const availability = {};
  timings.workingDays.forEach((day) => {
    availability[day] = Array.from({ length: timings.periodsPerDay }, (_, i) => i + 1);
  });
  return availability;
}

export function applyAvailabilityTemplate(faculty, template, timings) {
  const avail = {};
  const days = timings.workingDays;
  const n = timings.periodsPerDay;
  days.forEach((day) => {
    if (template === "weekdays" && day === "Saturday") {
      avail[day] = [];
      return;
    }
    if (template === "mornings") {
      avail[day] = [1, 2, 3].filter((p) => p <= n);
      return;
    }
    if (template === "afternoons") {
      avail[day] = [4, 5, 6].filter((p) => p <= n);
      return;
    }
    avail[day] = Array.from({ length: n }, (_, i) => i + 1);
  });
  faculty.availability = avail;
  return faculty;
}

export function getById(list, id) {
  return list.find((x) => x.id === id);
}

export function getRoomForSection(tt, sectionId) {
  const roomId = tt.sectionRoomMap[sectionId];
  return roomId ? getById(tt.rooms, roomId) : null;
}

export function ensureSectionSlots(tt, sectionId) {
  if (!tt.slots[sectionId]) tt.slots[sectionId] = {};
  return tt.slots[sectionId];
}

export function getSlot(tt, sectionId, day, period) {
  return tt.slots[sectionId]?.[day]?.[String(period)] ?? null;
}

export function setSlot(tt, sectionId, day, period, value) {
  const sec = ensureSectionSlots(tt, sectionId);
  if (!sec[day]) sec[day] = {};
  if (value) sec[day][String(period)] = value;
  else delete sec[day][String(period)];
}

export function validateSetupComplete(tt) {
  return (
    tt.sections.length > 0 &&
    tt.rooms.length > 0 &&
    tt.subjects.length > 0 &&
    tt.faculty.length > 0
  );
}
