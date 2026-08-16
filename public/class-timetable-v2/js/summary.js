import { isMappingColumn } from "./models.js";

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
