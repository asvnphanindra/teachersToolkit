export const PROJECT_VERSION = 4;
export const STORAGE_PREFIX = "ttk:class-timetable-v2:";

export const COLUMN_WIDTH = {
  sectionId: 92,
  sectionName: 142,
  subject: 158,
  lab: 158,
  support: 158,
  min: 72,
  max: 420,
};

export function uid(prefix = "id") {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function defaultColumnWidth(kind) {
  return COLUMN_WIDTH[kind] || COLUMN_WIDTH.subject;
}

export function clampColumnWidth(width) {
  const n = Number(width);
  if (!Number.isFinite(n)) return COLUMN_WIDTH.subject;
  return Math.round(Math.min(COLUMN_WIDTH.max, Math.max(COLUMN_WIDTH.min, n)));
}

export function createFixedColumns() {
  return [
    {
      id: "col-section-id",
      kind: "sectionId",
      title: "Section Id",
      subjectKey: null,
      baseKind: null,
      width: COLUMN_WIDTH.sectionId,
    },
    {
      id: "col-section-name",
      kind: "sectionName",
      title: "Section Name",
      subjectKey: null,
      baseKind: null,
      width: COLUMN_WIDTH.sectionName,
    },
  ];
}

export function createDefaultRow() {
  return {
    id: uid("row"),
    cells: {
      "col-section-id": "1",
      "col-section-name": "ECE-1",
    },
  };
}

export function createProject(name = "My class timetable") {
  const now = new Date().toISOString();
  const columns = createFixedColumns();
  const row = createDefaultRow();
  return {
    schemaVersion: PROJECT_VERSION,
    id: uid("project"),
    name,
    meta: { createdAt: now, updatedAt: now },
    columns,
    rows: [row],
  };
}

export function normalizeProject(project) {
  if (!project || typeof project !== "object") return null;
  if (!Array.isArray(project.columns) || !project.columns.length) {
    project.columns = createFixedColumns();
  }
  project.columns.forEach((column) => {
    column.width = clampColumnWidth(column.width ?? defaultColumnWidth(column.kind));
    if (isLoadColumn(column) && column.allowSameDayRepeat == null) {
      column.allowSameDayRepeat = false;
    }
  });
  if (!Array.isArray(project.rows)) project.rows = [createDefaultRow()];
  project.rows.forEach((row) => {
    if (!row.id) row.id = uid("row");
    if (!row.cells || typeof row.cells !== "object") row.cells = {};
    project.columns.forEach((column) => {
      if (row.cells[column.id] == null) row.cells[column.id] = "";
    });
  });
  project.schemaVersion = PROJECT_VERSION;
  return project;
}

export function columnHeader(column) {
  if (column.kind === "sectionId") return "Section Id";
  if (column.kind === "sectionName") return "Section Name";
  if (column.kind === "subject") return `${column.title} (staff)`;
  if (column.kind === "lab") return `${column.title} Lab (staff)`;
  if (column.kind === "support") {
    return column.baseKind === "lab"
      ? `${column.title} Lab (support)`
      : `${column.title} (support)`;
  }
  return column.title || "Column";
}

export function isMappingColumn(column) {
  return ["subject", "lab", "support"].includes(column.kind);
}

export function isLoadColumn(column) {
  return column?.kind === "subject" || column?.kind === "lab";
}

export function parsePeriodsPerWeek(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return Math.min(12, n);
}

export function loadColumnLabel(column) {
  if (!column) return "Subject";
  if (column.kind === "lab") return `${column.title} Lab`;
  return column.title || "Subject";
}

export function unsetLoadColumns(project) {
  return (project.columns || []).filter(
    (column) => isLoadColumn(column) && parsePeriodsPerWeek(column.periodsPerWeek) == null,
  );
}

export function findInsertIndexAfter(columns, columnId) {
  const index = columns.findIndex((column) => column.id === columnId);
  if (index < 0) return columns.length;
  const column = columns[index];
  if (!isMappingColumn(column)) return index + 1;

  const familyOf = (item) => (
    item.kind === "lab" || (item.kind === "support" && item.baseKind === "lab")
      ? "lab"
      : "subject"
  );
  const family = familyOf(column);

  // Keep subject+support and lab+support as tight visual families within a subjectKey.
  let end = index;
  for (let i = index + 1; i < columns.length; i += 1) {
    const next = columns[i];
    if (next.subjectKey !== column.subjectKey) break;
    if (familyOf(next) !== family) break;
    end = i;
  }
  return end + 1;
}

export function addSubjectColumn(project, afterColumnId, subjectTitle) {
  const title = String(subjectTitle || "").trim();
  if (!title) throw new Error("Enter a subject name.");
  const subjectKey = uid("subj");
  const column = {
    id: uid("col"),
    kind: "subject",
    title,
    subjectKey,
    baseKind: "subject",
    width: COLUMN_WIDTH.subject,
    periodsPerWeek: 4,
    allowSameDayRepeat: false,
  };
  const at = findInsertIndexAfter(project.columns, afterColumnId || "col-section-name");
  project.columns.splice(at, 0, column);
  project.rows.forEach((row) => { row.cells[column.id] = ""; });
  return column;
}

export function addLabColumn(project, afterColumnId, labTitle, options = {}) {
  const linkTo = options.linkTo && isMappingColumn(options.linkTo) ? options.linkTo : null;
  const title = String((linkTo ? linkTo.title : labTitle) || "").trim();
  if (!title) throw new Error("Enter a lab name.");
  const subjectKey = linkTo?.subjectKey || uid("subj");
  if (linkTo) {
    const exists = project.columns.some(
      (column) => column.subjectKey === subjectKey && column.kind === "lab",
    );
    if (exists) throw new Error(`A lab column for "${linkTo.title}" already exists.`);
  }
  const column = {
    id: uid("col"),
    kind: "lab",
    title,
    subjectKey,
    baseKind: "lab",
    width: COLUMN_WIDTH.lab,
    periodsPerWeek: 3,
    allowSameDayRepeat: true,
  };
  const at = findInsertIndexAfter(project.columns, afterColumnId || linkTo?.id || "col-section-name");
  project.columns.splice(at, 0, column);
  project.rows.forEach((row) => { row.cells[column.id] = ""; });
  return column;
}

export function parseMappingTitle(column, displayed) {
  let title = String(displayed || "").trim();
  if (column.kind === "subject") {
    title = title.replace(/\s*\(staff\)\s*$/i, "");
  } else if (column.kind === "lab") {
    title = title.replace(/\s*Lab\s*\(staff\)\s*$/i, "").replace(/\s*\(staff\)\s*$/i, "");
  } else if (column.kind === "support") {
    title = column.baseKind === "lab"
      ? title.replace(/\s*Lab\s*\(support\)\s*$/i, "")
      : title.replace(/\s*\(support\)\s*$/i, "");
  }
  return title.trim();
}

export function renameMappingColumn(project, columnId, displayedTitle) {
  const column = project.columns.find((item) => item.id === columnId);
  if (!column || !isMappingColumn(column)) return false;
  const title = parseMappingTitle(column, displayedTitle);
  if (!title) return false;

  if (column.kind === "subject") {
    project.columns.forEach((item) => {
      if (item.subjectKey === column.subjectKey) item.title = title;
    });
    return true;
  }

  if (column.kind === "lab") {
    project.columns.forEach((item) => {
      if (item.subjectKey !== column.subjectKey) return;
      if (item.kind === "lab" || (item.kind === "support" && item.baseKind === "lab")) {
        item.title = title;
      }
    });
    return true;
  }

  // support: rename only this column's title (display uses same title field)
  column.title = title;
  return true;
}

export function addSupportColumn(project, fromColumn) {
  if (!isMappingColumn(fromColumn)) throw new Error("Choose a subject, lab, or support column.");
  const baseKind = fromColumn.kind === "lab" || (fromColumn.kind === "support" && fromColumn.baseKind === "lab")
    ? "lab"
    : "subject";
  const exists = project.columns.some(
    (column) => column.subjectKey === fromColumn.subjectKey && column.kind === "support" && column.baseKind === baseKind,
  );
  if (exists) {
    throw new Error(
      baseKind === "lab"
        ? `Supporting staff for "${fromColumn.title} Lab" already exists.`
        : `Supporting staff for "${fromColumn.title}" already exists.`,
    );
  }
  const column = {
    id: uid("col"),
    kind: "support",
    title: fromColumn.title,
    subjectKey: fromColumn.subjectKey,
    baseKind,
    width: COLUMN_WIDTH.support,
  };
  const anchor = project.columns.find(
    (item) => item.subjectKey === fromColumn.subjectKey && item.kind === baseKind,
  ) || fromColumn;
  const at = findInsertIndexAfter(project.columns, anchor.id);
  project.columns.splice(at, 0, column);
  project.rows.forEach((row) => { row.cells[column.id] = ""; });
  return column;
}

export function deleteColumn(project, columnId) {
  const column = project.columns.find((item) => item.id === columnId);
  if (!column) return;
  if (column.kind === "sectionId" || column.kind === "sectionName") {
    throw new Error("Section Id and Section Name columns cannot be deleted.");
  }
  project.columns = project.columns.filter((item) => item.id !== columnId);
  project.rows.forEach((row) => { delete row.cells[columnId]; });
}

export function addRows(project, count) {
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error("Enter a whole number of rows between 1 and 100.");
  for (let i = 0; i < n; i += 1) {
    const row = { id: uid("row"), cells: {} };
    project.columns.forEach((column) => { row.cells[column.id] = ""; });
    project.rows.push(row);
  }
}

export function deleteRow(project, rowId) {
  if (project.rows.length <= 1) throw new Error("Keep at least one section row.");
  project.rows = project.rows.filter((row) => row.id !== rowId);
}

export function moveRow(project, fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= project.rows.length || toIndex >= project.rows.length) return;
  const [row] = project.rows.splice(fromIndex, 1);
  project.rows.splice(toIndex, 0, row);
}

export function mappingIssues(project) {
  const issues = [];
  project.rows.forEach((row, index) => {
    const sectionId = String(row.cells["col-section-id"] || "").trim();
    const sectionName = String(row.cells["col-section-name"] || "").trim();
    if (!sectionId) issues.push(`Row ${index + 1}: Section Id is empty.`);
    if (!sectionName) issues.push(`Row ${index + 1}: Section Name is empty.`);
  });
  const mappingCols = project.columns.filter(isMappingColumn);
  if (!mappingCols.length) issues.push("Add at least one subject or lab column before scheduling.");
  return issues;
}

/** Replace mapping with a fixed demo dataset for Step 1 → Step 2 testing. */
export function fillTestMappingData(project) {
  const sections = [
    ["1", "CSE-1"], ["2", "CSE-2"], ["3", "CSE-3"], ["4", "CSE-4"],
    ["5", "IT-1"], ["6", "IT-2"], ["7", "IT-3"], ["8", "IT-4"],
    ["9", "CSM-1"], ["10", "CSM-2"], ["11", "CSM-3"], ["12", "CSM-4"],
  ];

  // Each faculty teaches 2–4 sections of a subject; linked labs reuse the same faculty.
  const subjectDefs = [
    {
      title: "CM",
      faculty: ["Dr. Ananya Rao", "Dr. Meera Kapoor", "Prof. Sunil Bhat"],
    },
    {
      title: "PC",
      faculty: ["Prof. Vikram Shah", "Dr. Anita Desai", "Mr. Karan Malhotra"],
    },
    {
      title: "WD",
      faculty: ["Ms. Neha Patel", "Mr. Dev Krishnan", "Ms. Rhea Sen"],
    },
    {
      title: "CTLR",
      faculty: ["Dr. Arjun Nair", "Ms. Pooja Verma", "Prof. Nitin Kale"],
    },
    {
      title: "PP",
      faculty: ["Mr. Rohan Das", "Dr. Ishita Ghosh", "Ms. Tanya Paul"],
    },
    {
      title: "GenAI",
      faculty: ["Dr. Sneha Iyer", "Mr. Harsh Vardhan", "Dr. Leela Krishnan"],
    },
  ];

  const labDefs = [
    {
      title: "WD",
      linkSubject: "WD",
      supportFaculty: ["Mr. Imran Khan", "Ms. Asha Reddy", "Mr. Vivek Rao"],
    },
    {
      title: "PP",
      linkSubject: "PP",
      supportFaculty: ["Ms. Fatima Begum", "Mr. Nikhil Jain", "Ms. Divya Shah"],
    },
    {
      title: "GenAI",
      linkSubject: "GenAI",
      supportFaculty: ["Mr. Aditya Joshi", "Ms. Ritu Anand", "Mr. Samir Qureshi"],
    },
    {
      title: "DT",
      linkSubject: null,
      faculty: ["Ms. Lakshmi Narayan", "Mr. Pranav Kulkarni", "Dr. Geeta Nair"],
      supportFaculty: ["Mr. Karthik Bose", "Ms. Shreya Menon", "Mr. Omar Siddiqui"],
    },
  ];

  const assignByLoad = (facultyPool, sectionCount = sections.length, salt = 0) => {
    // Split sections into chunks of 2–4 so each faculty covers a valid load.
    const parts = [];
    let remaining = sectionCount;
    while (remaining > 0) {
      let size = Math.min(4, remaining);
      if (remaining > 4 && remaining - size < 2) size = remaining - 2;
      if (size < 2 && remaining >= 2) size = 2;
      parts.push(size);
      remaining -= size;
    }
    const assignment = [];
    parts.forEach((size, index) => {
      const faculty = facultyPool[(index + salt) % facultyPool.length];
      for (let i = 0; i < size; i += 1) assignment.push(faculty);
    });
    return assignment;
  };

  const columns = createFixedColumns();
  const subjectByTitle = {};

  subjectDefs.forEach((def, salt) => {
    const subjectKey = uid("subj");
    const column = {
      id: uid("col"),
      kind: "subject",
      title: def.title,
      subjectKey,
      baseKind: "subject",
      width: COLUMN_WIDTH.subject,
      periodsPerWeek: 4,
      allowSameDayRepeat: false,
    };
    subjectByTitle[def.title] = {
      column,
      staffBySection: assignByLoad(def.faculty, sections.length, salt),
    };
    columns.push(column);
  });

  labDefs.forEach((def, salt) => {
    const linked = def.linkSubject ? subjectByTitle[def.linkSubject] : null;
    const subjectKey = linked?.column.subjectKey || uid("subj");
    const lab = {
      id: uid("col"),
      kind: "lab",
      title: def.title,
      subjectKey,
      baseKind: "lab",
      width: COLUMN_WIDTH.lab,
      periodsPerWeek: 3,
      allowSameDayRepeat: true,
    };
    const support = {
      id: uid("col"),
      kind: "support",
      title: def.title,
      subjectKey,
      baseKind: "lab",
      width: COLUMN_WIDTH.support,
    };

    if (linked) {
      const subjectIndex = columns.findIndex((item) => item.id === linked.column.id);
      let insertAt = subjectIndex + 1;
      while (
        insertAt < columns.length
        && columns[insertAt].subjectKey === subjectKey
        && !(columns[insertAt].kind === "lab"
          || (columns[insertAt].kind === "support" && columns[insertAt].baseKind === "lab"))
      ) {
        insertAt += 1;
      }
      columns.splice(insertAt, 0, lab, support);
    } else {
      columns.push(lab, support);
    }

    def._labId = lab.id;
    def._supportId = support.id;
    // Linked labs reuse the subject faculty for each section.
    def._labStaffBySection = linked
      ? linked.staffBySection
      : assignByLoad(def.faculty, sections.length, salt + 1);
    def._supportBySection = assignByLoad(def.supportFaculty, sections.length, salt + 2);
  });

  const rows = sections.map(([sectionId, sectionName], sectionIndex) => {
    const cells = {
      "col-section-id": sectionId,
      "col-section-name": sectionName,
    };
    subjectDefs.forEach((def) => {
      const entry = subjectByTitle[def.title];
      cells[entry.column.id] = entry.staffBySection[sectionIndex];
    });
    labDefs.forEach((def) => {
      cells[def._labId] = def._labStaffBySection[sectionIndex];
      cells[def._supportId] = def._supportBySection[sectionIndex];
    });
    return { id: uid("row"), cells };
  });

  project.name = project.name || "Test class timetable";
  project.columns = columns;
  project.rows = rows;
  project.schemaVersion = PROJECT_VERSION;
  return project;
}
