import { getById, getRoomForSection, getSlot } from "./models.js";

export function findFacultyClashes(tt, facultyId, day, period, excludeSectionId) {
  const clashes = [];
  tt.sections.forEach((sec) => {
    if (sec.id === excludeSectionId) return;
    const slot = getSlot(tt, sec.id, day, period);
    if (slot?.facultyId === facultyId) {
      clashes.push({ type: "faculty", section: sec.name, day, period });
    }
  });
  return clashes;
}

export function findRoomClashes(tt, sectionId, day, period) {
  const room = getRoomForSection(tt, sectionId);
  if (!room) return [];
  const clashes = [];
  tt.sections.forEach((sec) => {
    if (sec.id === sectionId) return;
    const otherRoom = getRoomForSection(tt, sec.id);
    if (otherRoom?.id !== room.id) return;
    const slot = getSlot(tt, sec.id, day, period);
    if (slot) {
      clashes.push({ type: "room", section: sec.name, room: room.name, day, period });
    }
  });
  return clashes;
}

export function checkAssignment(tt, sectionId, day, period, facultyId) {
  const issues = [];
  if (tt.constraints.preventOverlaps !== false) {
    issues.push(...findFacultyClashes(tt, facultyId, day, period, sectionId));
    issues.push(...findRoomClashes(tt, sectionId, day, period));
  }
  return issues;
}

export function formatClashMessage(issue) {
  if (issue.type === "faculty") {
    return `Faculty already assigned to ${issue.section} on ${issue.day} P${issue.period}`;
  }
  return `Room ${issue.room} already used by ${issue.section} on ${issue.day} P${issue.period}`;
}

export function scanAllClashes(tt) {
  const all = [];
  tt.sections.forEach((sec) => {
    const secSlots = tt.slots[sec.id] || {};
    Object.entries(secSlots).forEach(([day, periods]) => {
      Object.entries(periods).forEach(([period, slot]) => {
        if (!slot?.facultyId) return;
        const issues = checkAssignment(tt, sec.id, day, Number(period), slot.facultyId);
        issues.forEach((issue) => {
          all.push({ sectionId: sec.id, section: sec.name, day, period: Number(period), ...issue });
        });
      });
    });
  });
  return all;
}
