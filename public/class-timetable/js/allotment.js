import { getById, getSlot } from "./models.js";

export function getSubjectAllotment(tt, subjectId, sectionId = null) {
  const subject = getById(tt.subjects, subjectId);
  if (!subject) return null;
  let assigned = 0;
  const sections = sectionId
    ? tt.sections.filter((s) => s.id === sectionId)
    : tt.sections;

  sections.forEach((sec) => {
    const secSlots = tt.slots[sec.id] || {};
    Object.values(secSlots).forEach((daySlots) => {
      Object.values(daySlots).forEach((slot) => {
        if (slot.subjectId === subjectId) assigned++;
      });
    });
  });

  const target = subject.weeklyPeriods || 0;
  return { subject, assigned, target, remaining: target ? target - assigned : null };
}

export function getAllAllotments(tt) {
  return tt.subjects.map((sub) => getSubjectAllotment(tt, sub.id));
}

export function getFacultySchedule(tt, facultyId) {
  const schedule = [];
  tt.sections.forEach((sec) => {
    const secSlots = tt.slots[sec.id] || {};
    Object.entries(secSlots).forEach(([day, periods]) => {
      Object.entries(periods).forEach(([period, slot]) => {
        if (slot.facultyId === facultyId) {
          schedule.push({
            day,
            period: Number(period),
            section: sec.name,
            sectionId: sec.id,
            subjectId: slot.subjectId,
          });
        }
      });
    });
  });
  return schedule;
}

export function getRoomSchedule(tt, roomId) {
  const schedule = [];
  tt.sections.forEach((sec) => {
    if (tt.sectionRoomMap[sec.id] !== roomId) return;
    const secSlots = tt.slots[sec.id] || {};
    Object.entries(secSlots).forEach(([day, periods]) => {
      Object.entries(periods).forEach(([period, slot]) => {
        schedule.push({ day, period: Number(period), section: sec.name, ...slot });
      });
    });
  });
  return schedule;
}
