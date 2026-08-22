import { columnDisplayTitle, isMappingColumn } from "./models.js";

function staffAssignments(rows, columns) {
  const assignments = new Map();
  columns.forEach((column) => {
    rows.forEach((row) => {
      const staff = String(row.cells[column.id] || "").trim();
      if (!staff) return;
      if (!assignments.has(staff)) assignments.set(staff, new Map());
      assignments.get(staff).set(row.id, {
        sectionId: String(row.cells["col-section-id"] || "—").trim() || "—",
        sectionName: String(row.cells["col-section-name"] || "—").trim() || "—",
      });
    });
  });
  return assignments;
}

function orderedRows(subjectAssignments, labAssignments) {
  return [...new Set([...subjectAssignments.keys(), ...labAssignments.keys()])]
    .sort((a, b) => a.localeCompare(b))
    .map((staff) => ({
      staff,
      subjectAssignments: [...(subjectAssignments.get(staff)?.values() || [])],
      labAssignments: [...(labAssignments.get(staff)?.values() || [])],
    }));
}

/** Builds one table per subject or standalone lab, split by staff role. */
export function facultySummaryTables(project) {
  const grouped = new Map();
  project.columns.filter(isMappingColumn).forEach((column) => {
    if (!grouped.has(column.subjectKey)) grouped.set(column.subjectKey, []);
    grouped.get(column.subjectKey).push(column);
  });

  return [...grouped.values()].flatMap((columns) => {
    const subject = columns.find((column) => column.kind === "subject");
    const lab = columns.find((column) => column.kind === "lab");
    const subjectColumns = columns.filter((column) => column.kind === "subject");
    const subjectSupportColumns = columns.filter((column) => (
      column.kind === "support" && column.baseKind === "subject"
    ));
    const labColumns = columns.filter((column) => column.kind === "lab");
    const labSupportColumns = columns.filter((column) => (
      column.kind === "support" && column.baseKind === "lab"
    ));

    if (subject) {
      return [{
        title: subject.title,
        type: "subject",
        hasLab: Boolean(lab),
        staffRows: orderedRows(
          staffAssignments(project.rows, subjectColumns),
          staffAssignments(project.rows, labColumns),
        ),
        supportRows: orderedRows(
          staffAssignments(project.rows, subjectSupportColumns),
          staffAssignments(project.rows, labSupportColumns),
        ),
      }];
    }

    if (lab) {
      return [{
        title: `${lab.title} Lab`,
        type: "lab",
        hasLab: false,
        staffRows: orderedRows(new Map(), staffAssignments(project.rows, labColumns)),
        supportRows: orderedRows(new Map(), staffAssignments(project.rows, labSupportColumns)),
      }];
    }

    return [];
  });
}

function facultyKey(name) {
  return String(name || "").trim().toLowerCase();
}

/**
 * Flat faculty summary rows: one per non-empty mapping cell assignment.
 * facultyCount starts as total assignments for that faculty (used for sort/filter).
 */
export function facultySummaryRows(project) {
  const mappingColumns = (project.columns || []).filter(isMappingColumn);
  const rows = [];

  (project.rows || []).forEach((row) => {
    const sectionId = String(row.cells["col-section-id"] || "").trim() || "—";
    const sectionName = String(row.cells["col-section-name"] || "").trim() || "—";
    const section = sectionId === "—" && sectionName === "—"
      ? "—"
      : sectionId === "—"
        ? sectionName
        : sectionName === "—"
          ? sectionId
          : `${sectionId} · ${sectionName}`;

    mappingColumns.forEach((column) => {
      const faculty = String(row.cells[column.id] || "").trim();
      if (!faculty) return;
      const isSupport = column.kind === "support";
      rows.push({
        section,
        sectionId,
        sectionName,
        subject: columnDisplayTitle(column),
        faculty,
        type: isSupport ? "Supporting" : "Main faculty",
        typeKey: isSupport ? "support" : "main",
        facultyKey: facultyKey(faculty),
      });
    });
  });

  const counts = new Map();
  rows.forEach((row) => {
    counts.set(row.facultyKey, (counts.get(row.facultyKey) || 0) + 1);
  });

  return rows.map((row) => ({
    ...row,
    facultyCount: counts.get(row.facultyKey) || 0,
  }));
}

/** Running 1..n per faculty in the given row order (display / print). */
export function withIncrementalFacultyCounts(rows) {
  const seen = new Map();
  return rows.map((row) => {
    const key = row.facultyKey || String(row.faculty || "").trim().toLowerCase();
    const next = (seen.get(key) || 0) + 1;
    seen.set(key, next);
    return { ...row, facultyCount: next };
  });
}

export function sortFacultySummaryRows(rows, sortKey = "section", sortDir = "asc") {
  const dir = sortDir === "desc" ? -1 : 1;
  const compareText = (left, right) => String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });

  return [...rows].sort((a, b) => {
    if (sortKey === "facultyCount") {
      return (a.facultyCount - b.facultyCount) * dir;
    }
    if (sortKey === "section") {
      const byId = compareText(a.sectionId, b.sectionId);
      if (byId) return byId * dir;
      const byName = compareText(a.sectionName, b.sectionName);
      if (byName) return byName * dir;
      return compareText(a.section, b.section) * dir;
    }
    if (sortKey === "type") return compareText(a.type, b.type) * dir;
    if (sortKey === "subject") return compareText(a.subject, b.subject) * dir;
    if (sortKey === "faculty") return compareText(a.faculty, b.faculty) * dir;
    return compareText(a.section, b.section) * dir;
  });
}

export function cellFilterValue(row, key) {
  if (key === "facultyCount") return String(row.facultyCount ?? "");
  return String(row?.[key] ?? "");
}

/** AND across columns. `null`/missing filter means all values allowed. */
export function applyColumnFilters(rows, columnFilters = {}) {
  return rows.filter((row) => Object.entries(columnFilters).every(([key, allowed]) => {
    if (!(allowed instanceof Set)) return true;
    return allowed.has(cellFilterValue(row, key));
  }));
}

/** Rows for building a column’s value list (Excel-like: other columns filtered). */
export function rowsForColumnFilterList(rows, columnFilters, columnKey) {
  const others = { ...columnFilters, [columnKey]: null };
  return applyColumnFilters(rows, others);
}

export function columnFilterValues(rows, key) {
  const seen = new Set();
  const values = [];
  rows.forEach((row) => {
    const value = cellFilterValue(row, key);
    if (seen.has(value)) return;
    seen.add(value);
    values.push(value);
  });
  return values.sort((a, b) => a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: "base",
  }));
}

export function isColumnFilterActive(columnFilters, key, allValuesForColumn) {
  const allowed = columnFilters?.[key];
  if (!(allowed instanceof Set)) return false;
  return allowed.size < (allValuesForColumn?.length || 0);
}
