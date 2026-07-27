export const PROJECT_VERSION = 1;

export const ENTITY_TYPES = {
  rooms: { label: "Rooms", idPrefix: "room", fields: ["code", "name", "capacity", "type"] },
  sections: { label: "Sections", idPrefix: "section", fields: ["code", "name", "representatives"] },
  subjects: { label: "Subjects", idPrefix: "subject", fields: ["code", "name", "weeklyPeriods", "type"] },
  faculty: { label: "Faculty", idPrefix: "faculty", fields: ["code", "name", "email", "phone"] },
  mentors: { label: "Mentors", idPrefix: "mentor", fields: ["code", "name", "email", "phone"] },
};

export function uid(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function createProject(name = "Untitled timetable") {
  const now = new Date().toISOString();
  return {
    schemaVersion: PROJECT_VERSION,
    id: uid("project"),
    name,
    meta: { createdAt: now, updatedAt: now },
    school: { name: "", academicYear: "" },
    timings: { workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], periods: [], breaks: [] },
    rooms: [],
    sections: [],
    subjects: [],
    faculty: [],
    mappings: { sectionRoom: {}, sectionSubject: {}, subjectFaculty: {}, sectionFaculty: {}, sectionMentor: {}, subjectMentor: {} },
  };
}

export function normalizeProject(project) {
  if (!project || typeof project !== "object") return project;
  Object.keys(ENTITY_TYPES).forEach((type) => {
    if (!Array.isArray(project[type])) project[type] = [];
  });
  project.mappings = project.mappings && typeof project.mappings === "object" ? project.mappings : {};
  ["sectionRoom", "sectionSubject", "subjectFaculty", "sectionFaculty", "sectionMentor", "subjectMentor"].forEach((key) => {
    if (!project.mappings[key] || typeof project.mappings[key] !== "object") project.mappings[key] = {};
  });
  project.schemaVersion = PROJECT_VERSION;
  return project;
}

export function createEntity(type, values = {}) {
  const config = ENTITY_TYPES[type];
  if (!config) throw new Error(`Unknown entity type: ${type}`);
  return {
    id: values.id || uid(config.idPrefix),
    code: values.code || "",
    name: values.name || "",
    ...Object.fromEntries(config.fields.filter((field) => !["code", "name"].includes(field)).map((field) => [field, values[field] ?? ""])),
  };
}

export function getById(project, type, id) {
  return project[type]?.find((item) => item.id === id) || null;
}

export function labelFor(entity) {
  return entity ? (entity.code ? `${entity.code} — ${entity.name}` : entity.name) : "Unknown";
}

export function validateProject(project) {
  const errors = [];
  if (!project || project.schemaVersion !== PROJECT_VERSION) errors.push("This project file is not a supported Class Timetable V2 project.");
  if (!project?.id || !project?.name) errors.push("The project needs an ID and name.");
  for (const type of Object.keys(ENTITY_TYPES)) {
    const items = project?.[type];
    if (!Array.isArray(items)) {
      errors.push(`${ENTITY_TYPES[type].label} must be a list.`);
      continue;
    }
    const ids = new Set();
    const codes = new Set();
    items.forEach((item, index) => {
      if (!item.id || ids.has(item.id)) errors.push(`${ENTITY_TYPES[type].label}: row ${index + 1} has a missing or duplicate ID.`);
      ids.add(item.id);
      if (!item.name?.trim()) errors.push(`${ENTITY_TYPES[type].label}: row ${index + 1} needs a name.`);
      if (item.code && codes.has(item.code.toLowerCase())) errors.push(`${ENTITY_TYPES[type].label}: ${item.code} is repeated.`);
      if (item.code) codes.add(item.code.toLowerCase());
    });
  }
  const mappings = project?.mappings;
  if (!mappings || typeof mappings !== "object") errors.push("The project is missing its relationship mappings.");
  else ["sectionRoom", "sectionSubject", "subjectFaculty", "sectionFaculty", "sectionMentor", "subjectMentor"].forEach((key) => {
    if (!mappings[key] || typeof mappings[key] !== "object") errors.push(`The project is missing ${key} mappings.`);
  });
  return errors;
}

export function mappingIssues(project) {
  const issues = [];
  const { sectionRoom, sectionSubject, subjectFaculty, sectionFaculty } = project.mappings;
  project.sections.forEach((section) => {
    if (!sectionRoom[section.id]) issues.push(`${labelFor(section)} has no home room.`);
    if (!(sectionSubject[section.id] || []).length) issues.push(`${labelFor(section)} has no subjects.`);
    if (!project.mappings.sectionMentor[section.id]) issues.push(`${labelFor(section)} has no mentor.`);
  });
  project.subjects.forEach((subject) => {
    if (!(subjectFaculty[subject.id] || []).length) issues.push(`${labelFor(subject)} has no eligible faculty.`);
  });
  Object.entries(sectionFaculty).forEach(([sectionId, facultyIds]) => {
    const subjectIds = new Set(sectionSubject[sectionId] || []);
    facultyIds.forEach((facultyId) => {
      const isEligible = [...subjectIds].some((subjectId) => (subjectFaculty[subjectId] || []).includes(facultyId));
      if (!isEligible) issues.push(`${labelFor(getById(project, "faculty", facultyId))} is assigned to a section without an eligible subject.`);
    });
  });
  return issues;
}
