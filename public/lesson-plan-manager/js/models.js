export const PROJECT_VERSION = 1;
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const uid = (prefix) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
export const normal = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
export const byId = (items, id) => items.find((item) => item.id === id);

export function createProject(name = "Untitled lesson plan") {
  const now = new Date().toISOString();
  return {
    schemaVersion: PROJECT_VERSION, id: uid("lesson-plan"), name, meta: { createdAt: now, updatedAt: now },
    semester: { name: "", startDate: "", endDate: "" },
    sections: [], subjects: [], sectionSubjects: [],
    weeklySchedule: [], manualSessions: [], holidays: [], substitutions: [],
    syllabusTopics: [], coverage: [],
  };
}

export function normalizeProject(project) {
  if (!project || typeof project !== "object") return project;
  ["sections", "subjects", "sectionSubjects", "weeklySchedule", "manualSessions", "holidays", "substitutions", "syllabusTopics", "coverage"].forEach((key) => {
    if (!Array.isArray(project[key])) project[key] = [];
  });
  project.semester = { name: "", startDate: "", endDate: "", ...(project.semester || {}) };
  project.meta = project.meta || {};
  project.schemaVersion = PROJECT_VERSION;
  return project;
}

export function validateProject(project) {
  const errors = [];
  if (!project?.name?.trim()) errors.push("Project name is required.");
  if (project.semester.startDate && project.semester.endDate && project.semester.startDate > project.semester.endDate) errors.push("Semester end date must be after the start date.");
  ["sections", "subjects"].forEach((key) => {
    const names = new Set();
    project[key].forEach((item, index) => {
      if (!item.id || !item.name?.trim()) errors.push(`${key}: row ${index + 1} needs a name.`);
      const keyName = normal(item.name);
      if (keyName && names.has(keyName)) errors.push(`Duplicate ${key} name "${item.name}".`);
      names.add(keyName);
    });
  });
  project.syllabusTopics.forEach((topic, index) => {
    if (!topic.subjectId || !topic.title?.trim() || !(Number(topic.plannedSessions) > 0)) errors.push(`Syllabus topic row ${index + 1} needs a subject, topic, and planned sessions greater than 0.`);
  });
  return errors;
}

export function datesBetween(startDate, endDate) {
  if (!startDate || !endDate || startDate > endDate) return [];
  const result = [];
  for (let cursor = new Date(`${startDate}T00:00:00`); cursor <= new Date(`${endDate}T00:00:00`); cursor.setDate(cursor.getDate() + 1)) {
    result.push(cursor.toISOString().slice(0, 10));
  }
  return result;
}

function dayName(date) {
  return DAYS[(new Date(`${date}T00:00:00`).getDay() + 6) % 7];
}

export function calendarSessions(project) {
  const holidays = new Set(project.holidays.map((item) => item.date));
  const manual = project.manualSessions.map((item) => ({ ...item, source: "manual", status: item.cancelled ? "cancelled" : "planned" }));
  const recurring = datesBetween(project.semester.startDate, project.semester.endDate).flatMap((date) =>
    project.weeklySchedule.filter((slot) => slot.day === dayName(date)).map((slot) => ({
      id: `weekly:${slot.id}:${date}`, date, sectionId: slot.sectionId, subjectId: slot.subjectId,
      startTime: slot.startTime, endTime: slot.endTime, notes: "", source: "weekly", status: holidays.has(date) ? "holiday" : "planned",
    })));
  const sessions = [...recurring, ...manual].map((session) => holidays.has(session.date) && session.source !== "manual"
    ? { ...session, status: "holiday" } : session);
  const substitutions = new Map(project.substitutions.map((item) => [item.sessionKey, item]));
  return sessions.map((session) => {
    const change = substitutions.get(session.id);
    return change ? { ...session, ...change, id: session.id, status: change.cancelled ? "cancelled" : "substituted" } : session;
  }).sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || "").localeCompare(b.startTime || ""));
}

export function coverageFor(project, session) {
  return project.coverage.find((item) => item.sessionKey === session.id);
}

export function coverageSummary(project, sectionId, subjectId) {
  const topics = project.syllabusTopics.filter((topic) => topic.subjectId === subjectId);
  return topics.map((topic) => {
    const completed = project.coverage.filter((item) => item.topicId === topic.id && item.completed).length;
    return { topic, completed, remaining: Math.max(0, Number(topic.plannedSessions) - completed) };
  });
}
