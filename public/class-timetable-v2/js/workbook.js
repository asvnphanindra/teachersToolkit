import { createEntity, createProject } from "./models.js";

const HEADER_ALIASES = {
  code: ["code", "id", "room id", "section id", "subject id", "faculty id"],
  name: ["name", "room name", "section name", "subject name", "faculty name", "mentor name"],
  capacity: ["capacity"],
  type: ["type", "room type", "subject type"],
  mentorId: ["mentor", "mentor id", "faculty mentor id"],
  representatives: ["representatives", "class representatives", "representative"],
  weeklyPeriods: ["weekly periods", "periods per week", "weekly period target"],
  email: ["email", "e-mail"],
  phone: ["phone", "phone number", "contact"],
};

const SHEETS = { Rooms: "rooms", Sections: "sections", Subjects: "subjects", Faculty: "faculty", Mentors: "mentors" };

function xlsx() {
  if (!window.XLSX) throw new Error("The spreadsheet helper did not load. Check your internet connection and try again.");
  return window.XLSX;
}

function normal(value) {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function fieldForHeader(header) {
  const value = normal(header);
  return Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(value))?.[0] || null;
}

function rowsForSheet(sheet) {
  return xlsx().utils.sheet_to_json(sheet, { defval: "", raw: false });
}

function importEntityRows(type, rows) {
  const mapped = rows.map((row) => {
    const values = {};
    Object.entries(row).forEach(([header, value]) => {
      const field = fieldForHeader(header);
      if (field) values[field] = String(value).trim();
    });
    return values;
  }).filter((row) => row.name || row.code);
  const invalid = mapped.find((row) => !row.name);
  if (invalid) throw new Error(`${type[0].toUpperCase()}${type.slice(1)} rows need a Name column and value.`);
  return mapped.map((row) => createEntity(type, row));
}

function importTimings(rows) {
  const periods = [];
  const breaks = [];
  rows.forEach((row) => {
    const type = normal(row.Type || row.type || "period");
    const day = String(row.Day || row.day || "").trim();
    const number = Number(row["Period Number"] || row.period || row.number);
    const start = String(row.Start || row.start || "").trim();
    const end = String(row.End || row.end || "").trim();
    if (!start || !end) return;
    if (type.includes("break") || type.includes("lunch")) breaks.push({ label: row.Label || row.label || type, start, end });
    else periods.push({ day, number: Number.isFinite(number) ? number : periods.length + 1, start, end });
  });
  return { periods, breaks };
}

export async function importWorkbook(file) {
  const XLSX = xlsx();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const project = createProject(file.name.replace(/\.[^.]+$/, ""));
  const normalizedNames = new Map(workbook.SheetNames.map((name) => [normal(name), name]));
  const schoolName = normalizedNames.get("school");
  if (schoolName) {
    const row = rowsForSheet(workbook.Sheets[schoolName])[0] || {};
    project.school = { name: row["Institution Name"] || row.Name || "", academicYear: row["Academic Year"] || "" };
    if (project.school.name) project.name = project.school.name;
  }
  const timingName = normalizedNames.get("timings");
  if (timingName) project.timings = { ...project.timings, ...importTimings(rowsForSheet(workbook.Sheets[timingName])) };
  for (const [sheetName, type] of Object.entries(SHEETS)) {
    const actualName = normalizedNames.get(normal(sheetName));
    if (actualName) project[type] = importEntityRows(type, rowsForSheet(workbook.Sheets[actualName]));
  }
  const importedCount = Object.values(SHEETS).reduce((count, type) => count + project[type].length, 0);
  if (!importedCount) throw new Error("No Rooms, Sections, Subjects, or Faculty sheets were found. Download the template to see the expected layout.");
  return project;
}

function sheet(rows) {
  return xlsx().utils.json_to_sheet(rows);
}

function downloadWorkbook(workbook, filename) {
  xlsx().writeFile(workbook, filename, { compression: true });
}

function safeName(name) {
  return (name || "timetable").replace(/[^\w-]+/g, "_");
}

export function downloadTemplate() {
  const XLSX = xlsx();
  const workbook = XLSX.utils.book_new();
  const sheets = {
    Instructions: [
      { Step: "1", What_to_do: "Fill the rows in the relevant sheets. Keep the header row unchanged." },
      { Step: "2", What_to_do: "Codes are optional but recommended when names are similar." },
      { Step: "3", What_to_do: "Upload the workbook in Class Timetable V2 and check the preview." },
    ],
    School: [{ "Institution Name": "Example College", "Academic Year": "2026–27" }],
    Timings: [{ Type: "Period", Day: "Monday", "Period Number": 1, Start: "09:00", End: "09:50", Label: "" }, { Type: "Lunch break", Day: "", "Period Number": "", Start: "12:30", End: "13:15", Label: "Lunch" }],
    Rooms: [{ "Room ID": "R101", "Room Name": "Room 101", Capacity: 60, Type: "Classroom" }],
    Faculty: [{ "Faculty ID": "F001", "Faculty Name": "Asha Rao", Email: "asha@example.edu", Phone: "5550101" }],
    Mentors: [{ "Mentor ID": "M001", "Mentor Name": "Priya Nair", Email: "priya@example.edu", Phone: "5550102" }],
    Subjects: [{ "Subject ID": "MATH101", "Subject Name": "Calculus", "Weekly Periods": 4, Type: "Lecture" }],
    Sections: [{ "Section ID": "CSE-A", "Section Name": "CSE A", Representatives: "Student 1, Student 2" }],
  };
  Object.entries(sheets).forEach(([name, rows]) => XLSX.utils.book_append_sheet(workbook, sheet(rows), name));
  downloadWorkbook(workbook, "class-timetable-template.xlsx");
}

export function exportWorkbook(project) {
  const XLSX = xlsx();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet([{ "Institution Name": project.school.name, "Academic Year": project.school.academicYear }]), "School");
  XLSX.utils.book_append_sheet(workbook, sheet([
    ...project.timings.periods.map((item) => ({ Type: "Period", Day: item.day, "Period Number": item.number, Start: item.start, End: item.end, Label: "" })),
    ...project.timings.breaks.map((item) => ({ Type: item.label, Day: "", "Period Number": "", Start: item.start, End: item.end, Label: item.label })),
  ]), "Timings");
  XLSX.utils.book_append_sheet(workbook, sheet(project.rooms.map((item) => ({ "Room ID": item.code, "Room Name": item.name, Capacity: item.capacity, Type: item.type }))), "Rooms");
  XLSX.utils.book_append_sheet(workbook, sheet(project.faculty.map((item) => ({ "Faculty ID": item.code, "Faculty Name": item.name, Email: item.email, Phone: item.phone }))), "Faculty");
  XLSX.utils.book_append_sheet(workbook, sheet(project.mentors.map((item) => ({ "Mentor ID": item.code, "Mentor Name": item.name, Email: item.email, Phone: item.phone }))), "Mentors");
  XLSX.utils.book_append_sheet(workbook, sheet(project.subjects.map((item) => ({ "Subject ID": item.code, "Subject Name": item.name, "Weekly Periods": item.weeklyPeriods, Type: item.type }))), "Subjects");
  XLSX.utils.book_append_sheet(workbook, sheet(project.sections.map((item) => ({ "Section ID": item.code, "Section Name": item.name, Representatives: item.representatives }))), "Sections");
  downloadWorkbook(workbook, `${safeName(project.name)}.xlsx`);
}
