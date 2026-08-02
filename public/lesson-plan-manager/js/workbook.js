import { calendarSessions, createProject, uid, normal, validateProject } from "./models.js";

const getXlsx = () => {
  if (!window.XLSX) throw new Error("Spreadsheet support did not load. Check your internet connection and try again.");
  return window.XLSX;
};
const rows = (book, sheet) => getXlsx().utils.sheet_to_json(book.Sheets[sheet], { defval: "", raw: false });
const sheetName = (book, name) => book.SheetNames.find((item) => normal(item) === normal(name));
const text = (row, key) => String(row[key] || "").trim();
const find = (items, name) => items.find((item) => normal(item.name) === normal(name));

export async function importWorkbook(file) {
  const XLSX = getXlsx();
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const project = createProject(file.name.replace(/\.[^.]+$/, ""));
  const required = ["Semester", "Sections", "Subjects"];
  required.forEach((name) => { if (!sheetName(book, name)) throw new Error(`Workbook needs a "${name}" sheet.`); });
  const semester = rows(book, sheetName(book, "Semester"))[0] || {};
  project.semester = { name: text(semester, "Semester Name"), startDate: text(semester, "Start Date"), endDate: text(semester, "End Date") };
  if (project.semester.name) project.name = project.semester.name;
  project.sections = rows(book, sheetName(book, "Sections")).filter((row) => text(row, "Name")).map((row) => ({ id: uid("section"), name: text(row, "Name") }));
  project.subjects = rows(book, sheetName(book, "Subjects")).filter((row) => text(row, "Name")).map((row) => ({ id: uid("subject"), name: text(row, "Name") }));
  const links = sheetName(book, "SectionSubjects");
  if (links) rows(book, links).forEach((row, index) => {
    const section = find(project.sections, text(row, "Section")); const subject = find(project.subjects, text(row, "Subject"));
    if (!section || !subject) throw new Error(`SectionSubjects row ${index + 2} needs an existing Section and Subject.`);
    project.sectionSubjects.push({ id: uid("assignment"), sectionId: section.id, subjectId: subject.id });
  });
  const schedule = sheetName(book, "WeeklySchedule");
  if (schedule) rows(book, schedule).forEach((row, index) => {
    const section = find(project.sections, text(row, "Section")); const subject = find(project.subjects, text(row, "Subject"));
    if (!section || !subject || !text(row, "Day")) throw new Error(`WeeklySchedule row ${index + 2} needs Section, Subject, and Day.`);
    project.weeklySchedule.push({ id: uid("slot"), sectionId: section.id, subjectId: subject.id, day: text(row, "Day"), startTime: text(row, "Start Time"), endTime: text(row, "End Time") });
  });
  const manual = sheetName(book, "ManualSessions");
  if (manual) rows(book, manual).forEach((row, index) => {
    const section = find(project.sections, text(row, "Section")); const subject = find(project.subjects, text(row, "Subject"));
    if (!section || !subject || !text(row, "Date")) throw new Error(`ManualSessions row ${index + 2} needs Date, Section, and Subject.`);
    project.manualSessions.push({ id: uid("manual"), date: text(row, "Date"), sectionId: section.id, subjectId: subject.id, startTime: text(row, "Start Time"), endTime: text(row, "End Time"), notes: text(row, "Notes") });
  });
  const holidays = sheetName(book, "Holidays");
  if (holidays) project.holidays = rows(book, holidays).filter((row) => text(row, "Date")).map((row) => ({ id: uid("holiday"), date: text(row, "Date"), name: text(row, "Name") }));
  const substitutions = sheetName(book, "Substitutions");
  if (substitutions) rows(book, substitutions).forEach((row, index) => {
    const replacement = find(project.subjects, text(row, "New Subject"));
    const section = find(project.sections, text(row, "Section"));
    const currentSubject = find(project.subjects, text(row, "Subject"));
    const matches = calendarSessions(project).filter((session) => (text(row, "Session Key") ? session.id === text(row, "Session Key") : session.date === text(row, "Date") && session.sectionId === section?.id && session.subjectId === currentSubject?.id));
    if (matches.length !== 1) throw new Error(`Substitutions row ${index + 2} must identify exactly one session with Session Key or Date, Section, and Subject.`);
    project.substitutions.push({ id: uid("substitution"), sessionKey: matches[0].id, subjectId: replacement?.id || matches[0].subjectId, startTime: text(row, "New Start Time") || matches[0].startTime, endTime: text(row, "New End Time") || matches[0].endTime, cancelled: normal(row.Cancelled) === "true" || normal(row.Cancelled) === "yes", notes: text(row, "Notes") });
  });
  const topics = sheetName(book, "SyllabusTopics");
  if (topics) rows(book, topics).forEach((row, index) => {
    const subject = find(project.subjects, text(row, "Subject"));
    if (!subject) throw new Error(`SyllabusTopics row ${index + 2} has an unknown Subject.`);
    project.syllabusTopics.push({ id: uid("topic"), subjectId: subject.id, unit: text(row, "Unit"), title: text(row, "Topic"), plannedSessions: Number(row["Planned Sessions"]), outcomes: text(row, "Outcomes"), notes: text(row, "Notes") });
  });
  const errors = validateProject(project);
  if (errors.length) throw new Error(errors[0]);
  return project;
}

function append(book, name, data) { getXlsx().utils.book_append_sheet(book, getXlsx().utils.json_to_sheet(data), name); }
function download(book, filename) { getXlsx().writeFile(book, filename, { compression: true }); }
export function downloadTemplate() {
  const XLSX = getXlsx(), book = XLSX.utils.book_new();
  append(book, "Instructions", [{ Step: 1, Instructions: "Fill Semester, Sections, and Subjects. Dates use YYYY-MM-DD." }, { Step: 2, Instructions: "Add optional schedules, holidays, manual sessions, and syllabus topics. Keep names consistent." }, { Step: 3, Instructions: "Import, then use the browser calendar to record completion." }]);
  append(book, "Semester", [{ "Semester Name": "Semester 1 2026", "Start Date": "2026-08-03", "End Date": "2026-11-28" }]);
  append(book, "Sections", [{ Name: "B.Sc. CS - A" }]);
  append(book, "Subjects", [{ Name: "Programming Fundamentals" }]);
  append(book, "SectionSubjects", [{ Section: "B.Sc. CS - A", Subject: "Programming Fundamentals" }]);
  append(book, "WeeklySchedule", [{ Section: "B.Sc. CS - A", Subject: "Programming Fundamentals", Day: "Monday", "Start Time": "09:00", "End Time": "10:00" }]);
  append(book, "ManualSessions", [{ Date: "2026-08-04", Section: "B.Sc. CS - A", Subject: "Programming Fundamentals", "Start Time": "10:00", "End Time": "11:00", Notes: "Lab orientation" }]);
  append(book, "Holidays", [{ Date: "2026-08-15", Name: "Independence Day" }]);
  append(book, "Substitutions", [{ Date: "2026-08-03", Section: "B.Sc. CS - A", Subject: "Programming Fundamentals", "New Subject": "", "New Start Time": "", "New End Time": "", Cancelled: "false", Notes: "Date + section + subject must identify one scheduled session" }]);
  append(book, "SyllabusTopics", [{ Subject: "Programming Fundamentals", Unit: "Unit 1", Topic: "Problem solving and algorithms", "Planned Sessions": 3, Outcomes: "Explain basic problem-solving steps", Notes: "" }]);
  download(book, "teaching-lesson-plan-template.xlsx");
}
export function exportWorkbook(project) {
  const XLSX = getXlsx(), book = XLSX.utils.book_new(), section = (id) => project.sections.find((x) => x.id === id)?.name || "", subject = (id) => project.subjects.find((x) => x.id === id)?.name || "";
  append(book, "Semester", [{ "Semester Name": project.semester.name, "Start Date": project.semester.startDate, "End Date": project.semester.endDate }]);
  append(book, "Sections", project.sections.map((x) => ({ Name: x.name }))); append(book, "Subjects", project.subjects.map((x) => ({ Name: x.name })));
  append(book, "SectionSubjects", project.sectionSubjects.map((x) => ({ Section: section(x.sectionId), Subject: subject(x.subjectId) })));
  append(book, "WeeklySchedule", project.weeklySchedule.map((x) => ({ Section: section(x.sectionId), Subject: subject(x.subjectId), Day: x.day, "Start Time": x.startTime, "End Time": x.endTime })));
  append(book, "ManualSessions", project.manualSessions.map((x) => ({ Date: x.date, Section: section(x.sectionId), Subject: subject(x.subjectId), "Start Time": x.startTime, "End Time": x.endTime, Notes: x.notes })));
  append(book, "Holidays", project.holidays.map((x) => ({ Date: x.date, Name: x.name })));
  const sessionLookup = new Map(calendarSessions(project).map((x) => [x.id, x]));
  append(book, "Substitutions", project.substitutions.map((x) => {
    const session = sessionLookup.get(x.sessionKey) || {};
    return { "Session Key": x.sessionKey, Date: session.date || "", Section: section(session.sectionId), Subject: subject(session.subjectId), "New Subject": subject(x.subjectId), "New Start Time": x.startTime, "New End Time": x.endTime, Cancelled: x.cancelled, Notes: x.notes };
  }));
  append(book, "SyllabusTopics", project.syllabusTopics.map((x) => ({ Subject: subject(x.subjectId), Unit: x.unit, Topic: x.title, "Planned Sessions": x.plannedSessions, Outcomes: x.outcomes, Notes: x.notes })));
  append(book, "Coverage", project.coverage.map((x) => ({ "Session Key": x.sessionKey, "Topic ID": x.topicId, Completed: x.completed, "Completed Date": x.completedDate, Notes: x.notes })));
  download(book, `${(project.name || "lesson-plan").replace(/[^\w-]+/g, "_")}.xlsx`);
}
