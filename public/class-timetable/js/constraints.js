import { getById, getSlot } from "./models.js";

export function checkConsecutiveLectures(tt, sectionId, day) {
  const max = tt.constraints.maxConsecutiveLectures ?? 2;
  const secSlots = tt.slots[sectionId]?.[day] || {};
  const periods = tt.timings.periodsPerDay;
  const lunch = new Set(tt.timings.lunchPeriods || []);

  let run = 0;
  let maxRun = 0;
  for (let p = 1; p <= periods; p++) {
    if (lunch.has(p)) {
      run = 0;
      continue;
    }
    const slot = secSlots[String(p)];
    const sub = slot ? getById(tt.subjects, slot.subjectId) : null;
    const isLecture = sub?.isLecture !== false;
    if (slot && isLecture) {
      run++;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 0;
    }
  }
  if (maxRun > max) {
    return {
      violated: true,
      message: `${maxRun} consecutive lecture periods on ${day} (max ${max})`,
      maxRun,
    };
  }
  return { violated: false };
}

export function scanConsecutiveViolations(tt) {
  const violations = [];
  tt.sections.forEach((sec) => {
    tt.timings.workingDays.forEach((day) => {
      const result = checkConsecutiveLectures(tt, sec.id, day);
      if (result.violated) {
        violations.push({ sectionId: sec.id, section: sec.name, day, ...result });
      }
    });
  });
  return violations;
}

export function isFacultyAvailable(faculty, day, period) {
  return (faculty.availability[day] || []).includes(Number(period));
}

export function isFacultyBooked(tt, facultyId, day, period, excludeSectionId) {
  return tt.sections.some((sec) => {
    if (sec.id === excludeSectionId) return false;
    const slot = getSlot(tt, sec.id, day, period);
    return slot?.facultyId === facultyId;
  });
}
