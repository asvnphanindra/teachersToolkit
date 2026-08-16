import { columnHeader } from "./models.js";

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

/**
 * Opens a dedicated print sheet. The browser's Print dialog can save it as a PDF;
 * document.title supplies a useful default filename in supporting browsers.
 */
export function exportMappingPdf(project) {
  const now = new Date();
  const filename = `${filenamePart(project.name)}-mapping-${timestampPart(now)}.pdf`;
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    throw new Error("Allow pop-ups to export the mapping as a PDF.");
  }
  printWindow.opener = null;

  const columnGroups = printColumnGroups(project.columns);
  const headers = project.columns.map((column) => `
    <th class="${columnGroups[column.id] || ""}">${printColumnHeader(column)}</th>
  `).join("");
  const rows = project.rows.map((row) => `
    <tr>${project.columns.map((column) => `
      <td class="${columnGroups[column.id] || ""}">${esc(row.cells[column.id] || "—")}</td>
    `).join("")}</tr>
  `).join("");
  const exportedAt = now.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });

  printWindow.document.title = filename;
  printWindow.document.write(`<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${esc(filename)}</title>
        <style>
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
          th .mapped-item, th .support-role { display: block; }
          th .support-role { margin-top: 2px; color: #4b5f75; font-size: 7.5pt; font-weight: normal; }
          .staff-group--0 { background: #e6e8eb; }
          .staff-group--1 { background: #f1f2f4; }
          th.staff-group { border-top: 2px solid #7a8088; }
          .staff-group-start { border-left: 2px solid #7a8088; }
          .staff-group-end { border-right: 2px solid #7a8088; }
          tbody tr:nth-child(even) { background: #f7f9fc; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <header>
          <div>
            <h1>${esc(project.name || "Class timetable mapping")}</h1>
            <p>Class Timetable V2 · Step 1: Mapping · ${project.rows.length} section${project.rows.length === 1 ? "" : "s"}</p>
          </div>
          <p class="file">Exported: ${esc(exportedAt)}<br>File name: <strong>${esc(filename)}</strong></p>
        </header>
        <table>
          <thead><tr>${headers}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>`);
  printWindow.document.close();
  printWindow.focus();
  // Give the standalone document a moment to finish layout before printing.
  setTimeout(() => printWindow.print(), 300);
  return filename;
}
