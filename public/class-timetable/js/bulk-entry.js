import { createFaculty, createRoom, createSection, createSubject, applyAvailabilityTemplate } from "./models.js";

export function generateNamedList(count, prefix) {
  return Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`);
}

export function parseNameList(text) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

export function parseSubjectList(text) {
  return parseNameList(text).map((line) => {
    const [name, periods] = line.split(",").map((s) => s.trim());
    return { name, weeklyPeriods: Number(periods) || 0 };
  });
}

export function bulkCreateSectionsRooms(tt, sectionNames, roomNames) {
  tt.sections = sectionNames.map((n) => createSection(n));
  tt.rooms = roomNames.map((n) => createRoom(n));
  tt.sectionRoomMap = {};
  const len = Math.min(tt.sections.length, tt.rooms.length);
  for (let i = 0; i < len; i++) {
    tt.sectionRoomMap[tt.sections[i].id] = tt.rooms[i].id;
  }
}

export function bulkCreateFaculty(tt, names, template = "full") {
  tt.faculty = names.map((n) => {
    const f = createFaculty(n);
    applyAvailabilityTemplate(f, template, tt.timings);
    return f;
  });
}

export function bulkCreateSubjects(tt, items) {
  tt.subjects = items.map(({ name, weeklyPeriods }) => createSubject(name, weeklyPeriods));
}
