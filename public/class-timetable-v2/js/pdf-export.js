import { columnHeader } from "./models.js";
import { facultySummaryRows, sortFacultySummaryRows, withIncrementalFacultyCounts } from "./summary.js";
import {
  facultyTimetables,
  getSlot,
  normalizeSchedule,
  scheduleGridColumns,
  sectionLabel,
} from "./schedule.js";

const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[char]));

function filenamePart(value = "") {
  return String(value)
    .trim()
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "timetable";
}

function timestampPart(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + "_" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("-");
}

function printColumnHeader(column) {
  if (column.kind !== "support") return esc(columnHeader(column));
  const mappedItem = column.baseKind === "lab"
    ? `${column.title} Lab`
    : column.title;
  return `<span class="mapped-item">${esc(mappedItem)}</span><span class="support-role">Supporting staff</span>`;
}

function printColumnGroups(columns) {
  const groups = new Map();

  columns.forEach((column) => {
    if (!["subject", "lab", "support"].includes(column.kind)) return;
    const family = column.kind === "lab" || (column.kind === "support" && column.baseKind === "lab")
      ? "lab"
      : "subject";
    const key = `${column.subjectKey}:${family}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(column);
  });

  let shade = 0;
  const classes = {};
  groups.forEach((columnsInGroup) => {
    if (!columnsInGroup.some((column) => column.kind === "support")) return;
    columnsInGroup.forEach((column, index) => {
      const edge = index === 0 ? "staff-group-start" : index === columnsInGroup.length - 1 ? "staff-group-end" : "";
      classes[column.id] = `staff-group staff-group--${shade % 2} ${edge}`;
    });
    shade += 1;
  });
  return classes;
}

const PRINT_BASE_CSS = `
  @page { size: landscape; margin: 12mm; }
  :root { color: #0f1c2e; font-family: Arial, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; font-size: 10pt; }
  header { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 2px solid #1e3a5f; }
  h1 { margin: 0 0 4px; color: #1e3a5f; font-size: 20pt; }
  p { margin: 0; color: #4b5f75; }
  .file { text-align: right; font-size: 8.5pt; }
  .file strong { color: #0f1c2e; overflow-wrap: anywhere; }
  table { width: 100%; border-collapse: collapse; table-layout: auto; }
  th, td { border: 1px solid #b9c6d5; padding: 7px 8px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  th { background: #eaf0fa; color: #1e3a5f; font-size: 8.5pt; }
  tbody tr:nth-child(even) { background: #f7f9fc; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  .sheet { page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  .slot strong, .slot span { display: block; }
  .slot span { color: #4b5f75; font-size: 8.5pt; }
  .break-cell { background: #f3f4f6; color: #4b5f75; text-align: center; }
  .empty { color: #94a3b8; }
  .summary-role { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; }
  .summary-role--teaching { background: #eaf3ff; color: #1558a6; }
  .summary-role--support { background: #f1f2f4; color: #4b5f75; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

function openPrintWindow(filename, bodyHtml, extraCss = "") {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Allow pop-ups to export as a PDF.");
  }
  printWindow.opener = null;
  printWindow.document.title = filename;
  printWindow.document.write(`<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${esc(filename)}</title>
        <style>${PRINT_BASE_CSS}${extraCss}</style>
      </head>
      <body>${bodyHtml}</body>
    </html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
  return filename;
}

function exportMeta(project, kind) {
  const now = new Date();
  const filename = `${filenamePart(project.name)}-${kind}-${timestampPart(now)}.pdf`;
  const exportedAt = now.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
  return { filename, exportedAt };
}

function sheetHeader(project, title, subtitle, filename, exportedAt) {
  return `<header>
    <div>
      <h1>${esc(title)}</h1>
      <p>${esc(subtitle)}</p>
    </div>
    <p class="file">Exported: ${esc(exportedAt)}<br>File name: <strong>${esc(filename)}</strong></p>
  </header>`;
}

function timetableGridHtml(columns, workingDays, cellFor) {
  return `<table>
    <thead>
      <tr>
        <th>Day</th>
        ${columns.map((column) => `<th>${esc(column.label)}${column.time ? `<br>${esc(column.time)}` : ""}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${workingDays.map((day) => `
        <tr>
          <th scope="row">${esc(day)}</th>
          ${columns.map((column) => {
            if (column.type === "break") {
              return `<td class="break-cell">${esc(column.label)}</td>`;
            }
            const slot = cellFor(day, column.period);
            if (!slot) return `<td class="empty">—</td>`;
            const line = slot.section ? slot.section : slot.staff;
            const support = slot.support?.staff ? `<span>${esc(slot.support.staff)} · ${esc(slot.support.role || "Support")}</span>` : "";
            return `<td class="slot"><strong>${esc(slot.title || "")}</strong><span>${esc(line || "")}${slot.role ? ` · ${esc(slot.role)}` : ""}</span>${support}</td>`;
          }).join("")}
        </tr>
      `).join("")}
    </tbody>
  </table>`;
}

/**
 * Opens a dedicated print sheet. The browser's Print dialog can save it as a PDF;
 * document.title supplies a useful default filename in supporting browsers.
 */
export function exportMappingPdf(project) {
  const { filename, exportedAt } = exportMeta(project, "mapping");
  const columnGroups = printColumnGroups(project.columns);
  const headers = project.columns.map((column) => `
    <th class="${columnGroups[column.id] || ""}">${printColumnHeader(column)}</th>
  `).join("");
  const rows = project.rows.map((row) => `
    <tr>${project.columns.map((column) => `
      <td class="${columnGroups[column.id] || ""}">${esc(row.cells[column.id] || "—")}</td>
    `).join("")}</tr>
  `).join("");
  const extraCss = `
    th .mapped-item, th .support-role { display: block; }
    th .support-role { margin-top: 2px; color: #4b5f75; font-size: 7.5pt; font-weight: normal; }
    .staff-group--0 { background: #e6e8eb; }
    .staff-group--1 { background: #f1f2f4; }
    th.staff-group { border-top: 2px solid #7a8088; }
    .staff-group-start { border-left: 2px solid #7a8088; }
    .staff-group-end { border-right: 2px solid #7a8088; }
  `;
  const body = `<section>
    ${sheetHeader(
      project,
      project.name || "Class timetable mapping",
      `Class Timetable · Plan · Mapping · ${project.rows.length} section${project.rows.length === 1 ? "" : "s"}`,
      filename,
      exportedAt,
    )}
    <table>
      <thead><tr>${headers}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
  return openPrintWindow(filename, body, extraCss);
}

export function exportSectionTimetablesPdf(project, options = {}) {
  const schedule = normalizeSchedule(project);
  const columns = scheduleGridColumns(schedule.setup);
  const rows = options.rowId
    ? project.rows.filter((row) => row.id === options.rowId)
    : project.rows;
  if (!rows.length) throw new Error("No sections to export.");
  const { filename, exportedAt } = exportMeta(project, "sections");
  const body = rows.map((row) => `
    <section class="sheet">
      ${sheetHeader(
        project,
        sectionLabel(row),
        `Class Timetable · Export · Section timetable · ${project.name || "Untitled"}`,
        filename,
        exportedAt,
      )}
      ${timetableGridHtml(columns, schedule.setup.workingDays, (day, period) => getSlot(project, row.id, day, period))}
    </section>
  `).join("");
  return openPrintWindow(filename, body);
}

export function exportFacultyTimetablesPdf(project, options = {}) {
  const schedule = normalizeSchedule(project);
  const columns = scheduleGridColumns(schedule.setup);
  let tables = facultyTimetables(project);
  if (options.staff) {
    tables = tables.filter((entry) => entry.staff === options.staff);
  }
  if (!tables.length) throw new Error("No faculty assignments to export yet.");
  const { filename, exportedAt } = exportMeta(project, "faculty");
  const body = tables.map((entry) => `
    <section class="sheet">
      ${sheetHeader(
        project,
        entry.staff,
        `Class Timetable · Export · Faculty timetable · ${project.name || "Untitled"}`,
        filename,
        exportedAt,
      )}
      ${timetableGridHtml(columns, schedule.setup.workingDays, (day, period) => entry.days?.[day]?.[String(period)] || null)}
    </section>
  `).join("");
  return openPrintWindow(filename, body);
}

export function exportFacultySummaryPdf(project, rows = null) {
  const list = Array.isArray(rows)
    ? rows
    : withIncrementalFacultyCounts(sortFacultySummaryRows(facultySummaryRows(project), "section", "asc"));
  if (!list.length) throw new Error("Add staff assignments before exporting the faculty summary.");
  const { filename, exportedAt } = exportMeta(project, "faculty-summary");
  const body = `
    <section>
      ${sheetHeader(
        project,
        project.name || "Faculty summary",
        `Class Timetable · Plan · Faculty summary · ${list.length} row${list.length === 1 ? "" : "s"}`,
        filename,
        exportedAt,
      )}
      <table>
        <thead>
          <tr>
            <th>Section</th>
            <th>Subject</th>
            <th>Faculty name</th>
            <th>Type</th>
            <th>Faculty cumulative number</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((row) => `
            <tr>
              <td>${esc(row.section)}</td>
              <td>${esc(row.subject)}</td>
              <td>${esc(row.faculty)}</td>
              <td>${esc(row.type)}</td>
              <td>${esc(String(row.facultyCount))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
  return openPrintWindow(filename, body);
}
