import {
  addLabColumn,
  addRows,
  addSubjectColumn,
  addSupportColumn,
  clampColumnWidth,
  columnHeader,
  createProject,
  deleteColumn,
  deleteRow,
  fillTestMappingData,
  isMappingColumn,
  mappingIssues,
  moveRow,
  renameMappingColumn,
} from "./models.js";
import {
  deleteProject,
  ensureActiveProject,
  exportProjectJson,
  importProjectJson,
  listProjects,
  loadProject,
  saveProject,
} from "./storage.js";
import { exportMappingPdf } from "./pdf-export.js";
import { facultySummaryTables } from "./summary.js";
import {
  WEEK_DAYS,
  adjustTimeRowsForPeriodCount,
  assignmentPlaced,
  clearSlot,
  fullMappingIssues,
  getSlot,
  isStaffBusy,
  normalizeSchedule,
  scheduleColumnTemplate,
  scheduleGridColumns,
  sectionAssignments,
  sectionLabel,
  setSlot,
  staffBooking,
  syncSetupFromTimeRows,
  toggleStaffBusy,
} from "./schedule.js";

const app = document.querySelector("#app");
let project = ensureActiveProject();
let view = "mapping";
let scheduleRowId = project.rows[0]?.id || null;
let scheduleDay = "Monday";
let scheduleDragActive = false;
let filesMenuOpen = false;
let scheduleSearch = "";
let scheduleVisibleCount = 7;
let menu = null; // { columnId, x, y }
let selected = null; // { rowId, columnId }
let fillDrag = null;
let rowDrag = null;
let colResize = null; // { columnId, startX, startWidth }
let armedDragRow = null;

const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[char]));

function toast(message, kind = "") {
  const el = document.createElement("div");
  el.className = `map-toast ${kind}`;
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
}

function save() {
  saveProject(project);
}

function closeMenu() {
  menu = null;
}

const ICON = {
  plus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 2.5a.75.75 0 0 1 .75.75v4h4a.75.75 0 0 1 0 1.5h-4v4a.75.75 0 0 1-1.5 0v-4h-4a.75.75 0 0 1 0-1.5h4v-4A.75.75 0 0 1 8 2.5Z"/></svg>',
  close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4.22 4.22a.75.75 0 0 1 1.06 0L8 6.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L9.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L8 9.06l-2.72 2.72a.75.75 0 0 1-1.06-1.06L6.94 8 4.22 5.28a.75.75 0 0 1 0-1.06Z"/></svg>',
  grip: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M5.5 3.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm0 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm0 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm7-9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm0 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm0 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>',
};

function askName(label, defaultValue = "") {
  const value = prompt(label, defaultValue);
  if (value == null) return null;
  const title = value.trim();
  if (!title) {
    toast(`${label} is required.`, "error");
    return null;
  }
  return title;
}

const GRIP_WIDTH = 40;
const ACTION_WIDTH = 40;

function frozenLayout(columns) {
  const idCol = columns.find((column) => column.kind === "sectionId");
  const nameCol = columns.find((column) => column.kind === "sectionName");
  const idWidth = idCol?.width || 92;
  const nameWidth = nameCol?.width || 142;
  return {
    deleteLeft: 0,
    gripLeft: ACTION_WIDTH,
    idLeft: ACTION_WIDTH + GRIP_WIDTH,
    nameLeft: ACTION_WIDTH + GRIP_WIDTH + idWidth,
    idWidth,
    nameWidth,
    idId: idCol?.id,
    nameId: nameCol?.id,
  };
}

function stickyClassForColumn(column) {
  if (column.kind === "sectionId") return "map-sticky-col map-sticky-col--id map-col-fixed";
  if (column.kind === "sectionName") return "map-sticky-col map-sticky-col--name map-sticky-col--edge map-col-fixed";
  return isMappingColumn(column) ? "map-col-mapping" : "map-col-fixed";
}

function stickyLeftForColumn(column, layout) {
  if (column.kind === "sectionId") return layout.idLeft;
  if (column.kind === "sectionName") return layout.nameLeft;
  return null;
}

/** Visual clusters: subject+(subject support) and lab+(lab support), per subjectKey. */
function mappingGroupMeta(columns) {
  const meta = {};
  let currentKey = null;
  let groupIndex = -1;
  let rangeStart = -1;

  const familyOf = (column) => (
    column.kind === "lab" || (column.kind === "support" && column.baseKind === "lab")
      ? "lab"
      : "subject"
  );

  const closeRange = (endIndex) => {
    if (rangeStart < 0 || groupIndex < 0) return;
    for (let i = rangeStart; i <= endIndex; i += 1) {
      const column = columns[i];
      if (!meta[column.id]) continue;
      meta[column.id].isStart = i === rangeStart;
      meta[column.id].isEnd = i === endIndex;
      meta[column.id].span = endIndex - rangeStart + 1;
    }
  };

  columns.forEach((column, index) => {
    if (!isMappingColumn(column)) return;
    const family = familyOf(column);
    const groupKey = `${column.subjectKey}:${family}`;
    if (groupKey !== currentKey) {
      if (currentKey != null) closeRange(index - 1);
      currentKey = groupKey;
      groupIndex += 1;
      rangeStart = index;
    }
    meta[column.id] = {
      groupIndex,
      groupKey,
      family,
      title: column.title,
      role: column.kind,
      isStart: false,
      isEnd: false,
      span: 1,
    };
  });
  if (currentKey != null) closeRange(columns.length - 1);
  return meta;
}

function roleLabel(column) {
  if (column.kind === "subject") return "Subject";
  if (column.kind === "lab") return "Lab";
  if (column.kind === "support") {
    return column.baseKind === "lab" ? "Lab support" : "Support";
  }
  return "";
}

function groupClassNames(column, groups) {
  const info = groups[column.id];
  if (!info) return "";
  const tone = info.groupIndex % 4;
  return [
    "map-group",
    `map-group--${tone}`,
    `map-group-role--${info.role}`,
    info.isStart ? "map-group-start" : "",
    info.isEnd ? "map-group-end" : "",
    !info.isStart && !info.isEnd ? "map-group-mid" : "",
  ].filter(Boolean).join(" ");
}

function mappingSuggestions(columns, rows) {
  const suggestions = new Set();
  columns.filter(isMappingColumn).forEach((column) => {
    rows.forEach((row) => {
      const value = String(row.cells[column.id] || "").trim();
      if (value) suggestions.add(value);
    });
  });
  return suggestions;
}

function refreshMappingSuggestions() {
  const datalist = app.querySelector("#mapping-staff-suggestions");
  if (!datalist) return;
  datalist.innerHTML = [...mappingSuggestions(project.columns, project.rows)]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => `<option value="${esc(value)}"></option>`)
    .join("");
}

function render() {
  if (view === "summary") {
    renderSummary();
    return;
  }
  if (view === "timingSetup") {
    renderTimingSetup();
    return;
  }
  if (view === "schedule") {
    renderSchedule();
    return;
  }
  const issues = mappingIssues(project);
  const projects = listProjects();
  const tableWidth = ACTION_WIDTH + GRIP_WIDTH
    + project.columns.reduce((sum, column) => sum + (column.width || 150), 0);
  const rowCount = project.rows.length;
  const colCount = project.columns.length;
  const layout = frozenLayout(project.columns);
  const groups = mappingGroupMeta(project.columns);
  const suggestions = mappingSuggestions(project.columns, project.rows);
  app.innerHTML = `
    <div class="map-page">
      <div class="map-shell">
        <header class="map-header" role="toolbar" aria-label="Mapping tools">
          <div class="map-header-left">
            <p class="map-step"><span class="map-step-dot" aria-hidden="true"></span>Step 1 · Mapping</p>
            <label class="map-project-name">
              <span class="visually-hidden">Project name</span>
              <input id="project-name" value="${esc(project.name)}" maxlength="80" aria-label="Project name" placeholder="Project name">
            </label>
            <p class="map-privacy" title="Data stays in this browser only">
              <span class="map-privacy-dot" aria-hidden="true"></span>
              Autosaved locally
            </p>
          </div>
          <div class="map-header-actions">
            ${issues.length
              ? `<span class="map-status warn" role="status">${issues.length} to fix</span>`
              : `<span class="map-status ok" role="status">Ready</span>`}
          </div>
        </header>

        <div class="map-action-bar" aria-label="Mapping actions">
          <div class="map-action-bar-left">
            <button type="button" class="btn btn--secondary btn--sm" data-action="fill-test" title="Load sample sections, subjects, labs, and staff">Fill test data</button>
            <button type="button" class="btn btn--secondary btn--sm" data-action="summary">Faculty summary</button>
            <div class="map-file-menu-wrap">
              <button type="button" class="btn btn--secondary btn--sm" data-action="toggle-files-menu" aria-haspopup="menu" aria-expanded="${filesMenuOpen ? "true" : "false"}">Files</button>
              ${filesMenuOpen ? `
                <div class="map-file-menu" role="menu" aria-label="Files">
                  <button type="button" role="menuitem" data-action="import">Import JSON</button>
                  <button type="button" role="menuitem" data-action="export">Export JSON</button>
                  <button type="button" role="menuitem" data-action="export-pdf">Export PDF</button>
                </div>
              ` : ""}
            </div>
            <button type="button" class="btn btn--secondary btn--sm" data-action="new-project">New</button>
            <input id="import-mapping-file" class="visually-hidden" type="file" accept="application/json,.json,.mapping.json" tabindex="-1">
          </div>
        </div>

        <section class="map-main" aria-label="Section mapping">
          <div class="map-workspace">
            <div class="map-workspace-meta">
              <p>${rowCount} row${rowCount === 1 ? "" : "s"} · ${colCount} column${colCount === 1 ? "" : "s"}</p>
              <p>Drag column edges to resize · Ctrl/Cmd+D fills from above</p>
            </div>

            <div class="map-table-wrap" tabindex="0" aria-label="Mapping grid">
              <table class="map-table" id="map-table" style="width:${tableWidth}px">
                <colgroup>
                  <col class="map-col-actions" style="width:${ACTION_WIDTH}px">
                  <col class="map-col-grip" style="width:${GRIP_WIDTH}px">
                  ${project.columns.map((column) => `
                    <col data-col-width="${column.id}" style="width:${column.width || 150}px">
                  `).join("")}
                </colgroup>
                <thead>
                  <tr>
                    <th class="map-row-actions-col map-sticky-col" scope="col" style="left:${layout.deleteLeft}px"><span class="visually-hidden">Delete</span></th>
                    <th class="map-grip-col map-sticky-col" scope="col" style="left:${layout.gripLeft}px"><span class="visually-hidden">Reorder</span></th>
                    ${project.columns.map((column) => {
                      const left = stickyLeftForColumn(column, layout);
                      const stickyStyle = left == null ? "" : `left:${left}px;`;
                      const groupInfo = groups[column.id];
                      const groupClasses = groupClassNames(column, groups);
                      return `
                      <th data-col="${column.id}" scope="col" class="${stickyClassForColumn(column)} ${groupClasses}" style="width:${column.width || 140}px;${stickyStyle}" ${groupInfo ? `data-group="${esc(groupInfo.groupKey)}"` : ""}>
                        <div class="map-th">
                          <div class="map-th-main">
                            ${groupInfo ? `<span class="map-group-chip">${esc(groupInfo.title)} · ${esc(roleLabel(column))}</span>` : ""}
                            <span class="map-th-title" ${isMappingColumn(column) ? `contenteditable="true" data-rename="${column.id}" role="textbox" aria-label="Rename ${esc(columnHeader(column))}" title="Click to rename"` : ""}>${esc(columnHeader(column))}</span>
                          </div>
                          <div class="map-th-actions">
                            ${isMappingColumn(column) || column.kind === "sectionName" ? `
                              <button type="button" class="map-icon-btn" data-add-col="${column.id}" title="Add column" aria-label="Add column after ${esc(columnHeader(column))}">${ICON.plus}</button>
                            ` : ""}
                            ${isMappingColumn(column) ? `
                              <button type="button" class="map-icon-btn danger" data-del-col="${column.id}" title="Delete column" aria-label="Delete ${esc(columnHeader(column))}">${ICON.close}</button>
                            ` : ""}
                          </div>
                        </div>
                        <button type="button" class="map-col-resize" data-resize-col="${column.id}" title="Drag to resize" aria-label="Resize ${esc(columnHeader(column))} column"></button>
                      </th>`;
                    }).join("")}
                  </tr>
                </thead>
                <tbody>
                  ${project.rows.map((row, rowIndex) => `
                    <tr data-row="${row.id}" data-row-index="${rowIndex}">
                      <td class="map-row-actions-col map-sticky-col" style="left:${layout.deleteLeft}px">
                        <button type="button" class="map-icon-btn danger" data-del-row="${row.id}" title="Delete row" aria-label="Delete row ${rowIndex + 1}">${ICON.close}</button>
                      </td>
                      <td class="map-grip-col map-sticky-col" style="left:${layout.gripLeft}px">
                        <span class="map-grip" data-row-grip="${row.id}" title="Drag to reorder" tabindex="0" role="button" aria-label="Drag row ${rowIndex + 1} to reorder">${ICON.grip}</span>
                      </td>
                      ${project.columns.map((column) => {
                        const focused = selected?.rowId === row.id && selected?.columnId === column.id;
                        const left = stickyLeftForColumn(column, layout);
                        const sticky = left == null ? "" : `map-sticky-col ${column.kind === "sectionName" ? "map-sticky-col--edge" : column.kind === "sectionId" ? "map-sticky-col--id" : ""}`;
                        const stickyStyle = left == null ? "" : `left:${left}px;`;
                        const groupClasses = groupClassNames(column, groups);
                        return `<td class="map-cell ${sticky} ${groupClasses} ${focused ? "is-selected" : ""}" data-row="${row.id}" data-col="${column.id}" style="${stickyStyle}">
                          <div class="map-cell-inner">
                            <input value="${esc(row.cells[column.id] || "")}" data-cell-row="${row.id}" data-cell-col="${column.id}" ${isMappingColumn(column) ? 'list="mapping-staff-suggestions"' : ""} aria-label="${esc(columnHeader(column))} for row ${rowIndex + 1}" placeholder="—" draggable="false">
                            ${focused ? `<span class="map-fill-handle" data-fill-row="${row.id}" data-fill-col="${column.id}" title="Drag to fill"></span>` : ""}
                          </div>
                        </td>`;
                      }).join("")}
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
            <datalist id="mapping-staff-suggestions">
              ${[...suggestions].sort((a, b) => a.localeCompare(b)).map((value) => `<option value="${esc(value)}"></option>`).join("")}
            </datalist>

            <div class="map-table-footer">
              <button type="button" class="btn btn--secondary btn--sm" data-action="add-rows">+ Add rows</button>
              <button type="button" class="btn btn--primary btn--sm" data-action="start-step-2">Design Timetable</button>
            </div>
          </div>

          ${issues.length ? `
            <div class="map-issues" role="status" aria-live="polite">
              <p class="map-issues-title">Before step 2</p>
              <ul>${issues.map((issue) => `<li>${esc(issue)}</li>`).join("")}</ul>
            </div>
          ` : ""}
        </section>

        <section class="map-saved" aria-label="Saved projects">
          <div class="map-saved-head">
            <h2>Saved projects</h2>
            <span class="map-saved-note">This browser only</span>
          </div>
          <div class="map-saved-list">
            ${projects.length ? projects.map((item) => `
              <div class="map-saved-item ${item.id === project.id ? "active" : ""}">
                <button type="button" data-open="${item.id}" aria-current="${item.id === project.id ? "true" : "false"}">
                  <strong>${esc(item.name)}</strong>
                  <span>${new Date(item.updatedAt).toLocaleString()}</span>
                </button>
                <button type="button" class="map-icon-btn danger" data-delete-saved="${item.id}" title="Delete project" aria-label="Delete ${esc(item.name)}">${ICON.close}</button>
              </div>
            `).join("") : `<p class="map-saved-empty">No other projects yet. Create one with New.</p>`}
          </div>
        </section>

        <footer class="map-footer">
          <p><strong>Class Timetable V2</strong> · Step 1 of 2</p>
          <p>Export for backup across devices</p>
        </footer>
      </div>
    </div>

    ${menu ? renderMenu() : ""}
  `;
  bind();
}

function renderSectionCount(assignments) {
  if (!assignments.length) return "—";
  const sections = assignments.map((section) => `${section.sectionId} · ${section.sectionName}`).join("\n");
  return `<span class="map-summary-count" tabindex="0" title="${esc(sections)}" aria-label="Assigned sections: ${esc(sections)}">${assignments.length}</span>`;
}

function renderSummaryRows(rows, label, groupClass, table, startAt = 0) {
  if (!rows.length) return "";
  const columnCount = table.hasLab ? 4 : 3;
  return `
    <tr class="map-summary-role ${groupClass}">
      <th colspan="${columnCount}" scope="rowgroup">${label}</th>
    </tr>
    ${rows.map((row, index) => `
      <tr>
        <td>${startAt + index + 1}</td>
        <td>${esc(row.staff)}</td>
        <td>${renderSectionCount(table.type === "lab" ? row.labAssignments : row.subjectAssignments)}</td>
        ${table.hasLab ? `<td>${renderSectionCount(row.labAssignments)}</td>` : ""}
      </tr>
    `).join("")}
  `;
}

function renderSummary() {
  const tables = facultySummaryTables(project);
  app.innerHTML = `
    <div class="map-page">
      <div class="map-shell">
        <header class="map-header" role="toolbar" aria-label="Faculty summary tools">
          <div class="map-header-left">
            <p class="map-step"><span class="map-step-dot" aria-hidden="true"></span>Step 1 · Faculty summary</p>
            <h1 class="map-summary-project">${esc(project.name)}</h1>
          </div>
          <div class="map-header-actions">
            <button type="button" class="btn btn--secondary btn--sm" data-action="back-to-mapping">Back to mapping</button>
          </div>
        </header>

        <main class="map-summary" aria-label="Faculty statistics by subject">
          <div class="map-summary-intro">
            <div>
              <h2>Faculty workload by subject</h2>
              <p>Each total is the number of distinct sections assigned to that staff member. Teaching and supporting staff are shown separately.</p>
            </div>
            <span>${project.rows.length} section${project.rows.length === 1 ? "" : "s"}</span>
          </div>
          ${tables.length ? `
            <div class="map-summary-grid">
              ${tables.map((table, tableIndex) => `
                <section class="map-summary-card" aria-labelledby="summary-table-${tableIndex}">
                  <h3 id="summary-table-${tableIndex}">${esc(table.title)}</h3>
                  ${table.staffRows.length || table.supportRows.length ? `
                    <div class="map-summary-table-wrap">
                      <table class="map-summary-table">
                        <thead>
                          <tr>
                            <th scope="col">S. No.</th>
                            <th scope="col">Staff member</th>
                            <th scope="col">Sections</th>
                            ${table.hasLab ? `<th scope="col">Lab sections</th>` : ""}
                          </tr>
                        </thead>
                        <tbody>
                          ${renderSummaryRows(table.staffRows, "Teaching staff", "map-summary-role--teaching", table)}
                          ${renderSummaryRows(table.supportRows, "Supporting staff", "map-summary-role--support", table, table.staffRows.length)}
                        </tbody>
                      </table>
                    </div>
                  ` : `<p class="map-summary-empty">No staff assignments yet.</p>`}
                </section>
              `).join("")}
            </div>
          ` : `<section class="map-summary-empty-state"><h2>No subjects or labs yet</h2><p>Add a subject or lab in the mapping grid to view its faculty statistics.</p><button type="button" class="btn btn--secondary btn--sm" data-action="back-to-mapping">Back to mapping</button></section>`}
        </main>
      </div>
    </div>
  `;
  app.querySelectorAll("[data-action='back-to-mapping']").forEach((button) => {
    button.onclick = () => {
      view = "mapping";
      render();
    };
  });
}

function renderTimingSetup() {
  const schedule = normalizeSchedule(project);
  const setup = schedule.setup;
  const timeRows = setup.timeRows || [];
  const rowHtml = timeRows.map((row, index) => renderTimeSetupRow(row, index)).join("");

  app.innerHTML = `
    <div class="map-page">
      <div class="map-shell">
        <header class="map-header" role="toolbar" aria-label="Schedule setup tools">
          <div class="map-header-left">
            <p class="map-step"><span class="map-step-dot" aria-hidden="true"></span>Step 1.5 · Timings</p>
            <h1 class="map-summary-project">${esc(project.name)}</h1>
          </div>
          <div class="map-header-actions">
            <button type="button" class="btn btn--secondary btn--sm" data-action="back-to-mapping">Back to mapping</button>
            <button type="button" class="btn btn--primary btn--sm" data-action="open-schedule">Open scheduler</button>
          </div>
        </header>

        <main class="schedule-setup" aria-label="Schedule timing setup">
          <section class="schedule-card">
            <div class="schedule-card-head">
              <h2>Working days and periods</h2>
              <p>These settings control the Step 2 timetable grid and faculty availability boxes.</p>
            </div>
            <div class="schedule-days" id="setup-days">
              ${WEEK_DAYS.map((day) => `
                <label class="schedule-day-check">
                  <input type="checkbox" value="${day}" ${setup.workingDays.includes(day) ? "checked" : ""}>
                  <span>${day}</span>
                </label>
              `).join("")}
            </div>
            <label class="schedule-period-count">
              <span>Periods per day</span>
              <input type="number" id="setup-period-count" min="1" max="12" value="${setup.periodsPerDay}">
            </label>
          </section>

          <section class="schedule-card">
            <div class="schedule-card-head">
              <h2>Day schedule</h2>
              <p>Set period and break times in the order they appear in the timetable.</p>
            </div>
            <div class="schedule-table-wrap">
              <table class="schedule-setup-table schedule-time-rows-table" id="setup-time-rows">
                <thead><tr><th>Description</th><th>From</th><th>To</th></tr></thead>
                <tbody>${rowHtml}</tbody>
              </table>
            </div>
            <div class="schedule-time-rows-actions">
              <button type="button" class="btn btn--secondary btn--sm" data-action="add-break">+ Add break</button>
            </div>
          </section>
        </main>

        <footer class="map-footer">
          <p><strong>Class Timetable V2</strong> · Step 2 setup</p>
          <p>Autosaved locally</p>
        </footer>
      </div>
    </div>
  `;
  bindTimingSetup();
}

function renderTimeSetupRow(row, index) {
  if (row.type === "break") {
    return `<tr data-row-index="${index}" data-row-type="break" data-row-id="${esc(row.id)}">
      <td class="schedule-time-desc">
        <input data-time-label value="${esc(row.label)}" placeholder="Break name" aria-label="Break description">
        <button type="button" class="btn btn--secondary btn--sm" data-remove-break="${index}" title="Remove break">Remove</button>
      </td>
      <td><input type="time" data-time-start value="${esc(row.start)}" aria-label="Break start"></td>
      <td><input type="time" data-time-end value="${esc(row.end)}" aria-label="Break end"></td>
    </tr>`;
  }
  return `<tr data-row-index="${index}" data-row-type="period" data-period="${row.period}">
    <td class="schedule-time-desc"><span data-time-label>${esc(row.label || `Period ${row.period}`)}</span></td>
    <td><input type="time" data-time-start value="${esc(row.start)}" aria-label="Period ${row.period} start"></td>
    <td><input type="time" data-time-end value="${esc(row.end)}" aria-label="Period ${row.period} end"></td>
  </tr>`;
}

function readTimeRowsFromDom() {
  const rows = [];
  app.querySelectorAll("#setup-time-rows tbody tr").forEach((tr) => {
    const type = tr.dataset.rowType;
    if (type === "break") {
      rows.push({
        type: "break",
        id: tr.dataset.rowId,
        label: tr.querySelector("[data-time-label]")?.value.trim() || "Break",
        start: tr.querySelector("[data-time-start]")?.value || "",
        end: tr.querySelector("[data-time-end]")?.value || "",
      });
      return;
    }
    rows.push({
      type: "period",
      period: Number(tr.dataset.period),
      label: tr.querySelector("[data-time-label]")?.textContent.trim() || `Period ${tr.dataset.period}`,
      start: tr.querySelector("[data-time-start]")?.value || "",
      end: tr.querySelector("[data-time-end]")?.value || "",
    });
  });
  return rows;
}

function bindTimingSetup() {
  app.querySelector("[data-action='back-to-mapping']").onclick = () => {
    view = "mapping";
    render();
  };
  app.querySelector("[data-action='open-schedule']").onclick = () => {
    saveTimingSetup();
    view = "schedule";
    render();
  };
  app.querySelector("#setup-period-count").onchange = () => {
    saveTimingSetup({ rerender: true });
  };
  app.querySelectorAll("#setup-days input").forEach((input) => {
    input.onchange = () => saveTimingSetup();
  });
  app.querySelectorAll("[data-time-start], [data-time-end], [data-time-label]").forEach((input) => {
    input.onchange = () => saveTimingSetup();
  });
  app.querySelector("[data-action='add-break']")?.addEventListener("click", () => {
    saveTimingSetup();
    const timeRows = readTimeRowsFromDom();
    timeRows.push({
      type: "break",
      id: `break-${Date.now()}`,
      label: "Break",
      start: "",
      end: "",
    });
    applyTimingSetup(timeRows);
    render();
  });
  app.querySelectorAll("[data-remove-break]").forEach((button) => {
    button.onclick = () => {
      const timeRows = readTimeRowsFromDom();
      timeRows.splice(Number(button.dataset.removeBreak), 1);
      applyTimingSetup(timeRows);
      render();
    };
  });
}

function applyTimingSetup(timeRows) {
  const synced = syncSetupFromTimeRows(timeRows);
  const current = normalizeSchedule(project).setup;
  project.schedule.setup = {
    ...current,
    workingDays: [...app.querySelectorAll("#setup-days input:checked")].map((input) => input.value),
    ...synced,
  };
  if (!project.schedule.setup.workingDays.length) project.schedule.setup.workingDays = [...WEEK_DAYS];
  normalizeSchedule(project);
  save();
}

function saveTimingSetup(options = {}) {
  const periods = Math.min(12, Math.max(1, Number(app.querySelector("#setup-period-count")?.value) || 6));
  let timeRows = readTimeRowsFromDom();
  if (!timeRows.length) timeRows = normalizeSchedule(project).setup.timeRows;
  timeRows = adjustTimeRowsForPeriodCount(timeRows, periods);
  applyTimingSetup(timeRows);
  if (options.rerender) render();
}

function renderSchedule() {
  const schedule = normalizeSchedule(project);
  const setup = schedule.setup;
  if (!project.rows.some((row) => row.id === scheduleRowId)) scheduleRowId = project.rows[0]?.id || null;
  if (!setup.workingDays.includes(scheduleDay)) scheduleDay = setup.workingDays[0] || "Monday";
  const selectedRow = project.rows.find((row) => row.id === scheduleRowId);
  const assignments = sectionAssignments(project, scheduleRowId);
  const columns = scheduleGridColumns(setup);
  const colTemplate = scheduleColumnTemplate(columns);
  const query = scheduleSearch.trim().toLowerCase();
  const filtered = query
    ? assignments.filter((assignment) => (
      assignment.staff.toLowerCase().includes(query)
      || assignment.title.toLowerCase().includes(query)
      || assignment.role.toLowerCase().includes(query)
    ))
    : assignments;
  const visible = filtered.slice(0, scheduleVisibleCount);
  const hiddenCount = Math.max(0, filtered.length - scheduleVisibleCount);

  app.innerHTML = `
    <div class="map-page">
      <div class="map-shell">
        <header class="map-header" role="toolbar" aria-label="Schedule tools">
          <div class="map-header-left">
            <p class="map-step"><span class="map-step-dot" aria-hidden="true"></span>Step 2 · Schedule</p>
            <h1 class="map-summary-project">${esc(project.name)}</h1>
          </div>
          <div class="map-header-actions">
            <button type="button" class="btn btn--secondary btn--sm" data-action="edit-timings">Edit timings</button>
            <button type="button" class="btn btn--secondary btn--sm" data-action="back-to-mapping">Back to mapping</button>
          </div>
        </header>

        <main class="schedule-page" aria-label="Timetable scheduler">
          <section class="schedule-controls">
            <label>
              <span>Section</span>
              <select id="schedule-section">
                ${project.rows.map((row) => `<option value="${row.id}" ${row.id === scheduleRowId ? "selected" : ""}>${esc(sectionLabel(row))}</option>`).join("")}
              </select>
            </label>
            <div class="schedule-day-tabs" role="tablist" aria-label="Weekday">
              ${setup.workingDays.map((day) => `<button type="button" class="${day === scheduleDay ? "active" : ""}" data-schedule-day="${day}">${day}</button>`).join("")}
            </div>
            <span class="schedule-period-badge">${setup.periodsPerDay} period${setup.periodsPerDay === 1 ? "" : "s"} per day</span>
          </section>

          <section class="schedule-planner">
            <section class="schedule-availability-panel" aria-label="Faculty availability for ${esc(scheduleDay)}">
              <div class="schedule-card-head">
                <h2>${esc(scheduleDay)} availability</h2>
                <p>Drag green period boxes into the timetable. Click a green box to mark that staff member busy.</p>
              </div>
              <div class="schedule-availability-toolbar">
                <label class="schedule-availability-search">
                  <span class="visually-hidden">Search faculty</span>
                  <input id="schedule-availability-search" type="search" value="${esc(scheduleSearch)}" placeholder="Search staff or subject…" aria-label="Search faculty availability">
                </label>
                <span class="schedule-availability-meta">${filtered.length ? `Showing ${visible.length} of ${filtered.length}` : "No matches"}</span>
              </div>
              ${filtered.length ? `
                <div class="schedule-availability-scroll">
                  <div class="schedule-availability-row schedule-availability-track">
                    <div class="schedule-staff-card-meta schedule-track-spacer" aria-hidden="true"></div>
                    <div class="schedule-period-boxes" style="grid-template-columns:${colTemplate}">
                      ${columns.map((column) => `<span class="schedule-track-label ${column.type === "break" ? "is-break" : ""}">${esc(column.label)}</span>`).join("")}
                    </div>
                  </div>
                  ${visible.map((assignment) => renderAssignmentAvailability(assignment, columns, selectedRow)).join("")}
                </div>
                ${hiddenCount ? `<button type="button" class="btn btn--secondary btn--sm schedule-show-more" data-action="show-more-availability">Show ${Math.min(7, hiddenCount)} more</button>` : ""}
              ` : `<p class="schedule-empty">${assignments.length ? "No faculty match your search." : "No mapped staff for this section."}</p>`}
            </section>

            <section class="schedule-grid-card" aria-label="Timetable grid">
              <div class="schedule-card-head">
                <h2>${esc(selectedRow ? sectionLabel(selectedRow) : "Section timetable")}</h2>
                <p>Selected day is highlighted. Double-click a filled teaching cell to clear it.</p>
              </div>
              <div class="schedule-grid-wrap">
                <table class="schedule-grid">
                  <thead>
                    <tr>
                      <th scope="col">Day</th>
                      ${columns.map((column) => `<th scope="col" class="${column.type === "break" ? "schedule-break-col" : ""}">${esc(column.label)}${column.time ? `<small>${esc(column.time)}</small>` : ""}</th>`).join("")}
                    </tr>
                  </thead>
                  <tbody>
                    ${setup.workingDays.map((day) => renderScheduleDayRow(day, columns, scheduleRowId)).join("")}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        </main>

        <footer class="map-footer">
          <p><strong>Class Timetable V2</strong> · Step 2 of 2</p>
          <p>Autosaved locally</p>
        </footer>
      </div>
    </div>
  `;
  bindSchedule();
}

function renderAssignmentAvailability(assignment, columns, selectedRow) {
  const colTemplate = scheduleColumnTemplate(columns);
  return `
    <div class="schedule-availability-row">
      <div class="schedule-staff-card-meta">
        <strong>${esc(assignment.staff)}</strong>
        <span>${esc(assignment.title)} · ${esc(assignment.role)}</span>
      </div>
      <div class="schedule-period-boxes" style="grid-template-columns:${colTemplate}">
        ${columns.map((column) => renderAvailabilityColumn(assignment, selectedRow, column)).join("")}
      </div>
    </div>
  `;
}

function renderAvailabilityColumn(assignment, selectedRow, column) {
  if (column.type === "break") {
    return `<span class="schedule-period-spacer" aria-hidden="true"></span>`;
  }
  return renderAvailabilityBox(assignment, selectedRow, column.period);
}

function renderAvailabilityBox(assignment, selectedRow, period) {
  const booked = staffBooking(project, assignment.staff, scheduleDay, period, selectedRow?.id);
  const busy = isStaffBusy(project, assignment.staff, scheduleDay, period);
  if (booked) {
    return `<span class="schedule-period-box booked" title="Booked in ${esc(booked.section)}" aria-label="P${period} booked">Booked</span>`;
  }
  if (busy) {
    return `<button type="button" class="schedule-period-box busy" data-toggle-busy="${esc(assignment.staff)}" data-period="${period}" title="Marked busy. Click to make available." aria-label="P${period} busy">Busy</button>`;
  }
  if (selectedRow && assignmentPlaced(project, selectedRow.id, scheduleDay, assignment.columnId, period)) {
    return `<span class="schedule-period-box assigned" aria-label="P${period} assigned">Assigned</span>`;
  }
  return `<button type="button" class="schedule-period-box available" draggable="true"
    data-drag-assignment="1"
    data-column-id="${assignment.columnId}"
    data-staff="${esc(assignment.staff)}"
    data-title="${esc(assignment.title)}"
    data-role="${esc(assignment.role)}"
    data-kind="${esc(assignment.kind)}"
    data-period="${period}"
    data-toggle-busy="${esc(assignment.staff)}"
    title="Drag to schedule, or click to mark busy"
    aria-label="P${period} available">P${period}</button>`;
}

function renderScheduleDayRow(day, columns, rowId) {
  const rowClass = day === scheduleDay ? "selected" : "inactive";
  return `<tr class="${rowClass}">
    <th scope="row">${esc(day)}</th>
    ${columns.map((column) => {
      if (column.type === "break") return `<td class="schedule-break-cell">${esc(column.label)}</td>`;
      const slot = getSlot(project, rowId, day, column.period);
      return `<td class="schedule-drop-cell ${slot ? "filled" : ""}" data-drop-day="${day}" data-drop-period="${column.period}" data-drop-row="${rowId}">
        ${slot ? `<div class="schedule-slot" draggable="true" data-slot-row="${rowId}" data-slot-day="${day}" data-slot-period="${column.period}">
          <strong>${esc(slot.title)}</strong>
          <span>${esc(slot.staff)}</span>
          <em>${esc(slot.role)}</em>
        </div>` : `<span class="schedule-drop-hint">Drop</span>`}
      </td>`;
    }).join("")}
  </tr>`;
}

function bindSchedule() {
  app.querySelector("[data-action='edit-timings']").onclick = () => {
    view = "timingSetup";
    render();
  };
  app.querySelector("[data-action='back-to-mapping']").onclick = () => {
    view = "mapping";
    render();
  };
  app.querySelector("#schedule-section").onchange = (event) => {
    scheduleRowId = event.target.value;
    scheduleVisibleCount = 7;
    render();
  };
  app.querySelectorAll("[data-schedule-day]").forEach((button) => {
    button.onclick = () => {
      scheduleDay = button.dataset.scheduleDay;
      render();
    };
  });
  const searchInput = app.querySelector("#schedule-availability-search");
  if (searchInput) {
    searchInput.oninput = () => {
      scheduleSearch = searchInput.value;
      scheduleVisibleCount = 7;
      render();
      const next = app.querySelector("#schedule-availability-search");
      if (next) {
        next.focus();
        const len = next.value.length;
        next.setSelectionRange(len, len);
      }
    };
  }
  app.querySelector("[data-action='show-more-availability']")?.addEventListener("click", () => {
    scheduleVisibleCount += 7;
    render();
  });
  app.querySelectorAll("[data-toggle-busy]").forEach((button) => {
    button.onclick = () => {
      if (scheduleDragActive) return;
      toggleStaffBusy(project, button.dataset.toggleBusy, scheduleDay, button.dataset.period);
      save();
      render();
    };
  });
  app.querySelectorAll("[data-drag-assignment]").forEach((button) => {
    button.addEventListener("dragstart", (event) => {
      scheduleDragActive = true;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/json", JSON.stringify({
        type: "assignment",
        columnId: button.dataset.columnId,
        staff: button.dataset.staff,
        title: button.dataset.title,
        role: button.dataset.role,
        kind: button.dataset.kind,
        period: Number(button.dataset.period),
      }));
      button.classList.add("is-dragging");
    });
    button.addEventListener("dragend", () => {
      button.classList.remove("is-dragging");
      setTimeout(() => { scheduleDragActive = false; }, 0);
    });
  });
  app.querySelectorAll("[data-slot-row]").forEach((slot) => {
    slot.addEventListener("dragstart", (event) => {
      const current = getSlot(project, slot.dataset.slotRow, slot.dataset.slotDay, slot.dataset.slotPeriod);
      if (!current) return;
      scheduleDragActive = true;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/json", JSON.stringify({
        type: "move",
        fromRowId: slot.dataset.slotRow,
        fromDay: slot.dataset.slotDay,
        fromPeriod: Number(slot.dataset.slotPeriod),
        assignment: current,
      }));
    });
    slot.addEventListener("dragend", () => {
      setTimeout(() => { scheduleDragActive = false; }, 0);
    });
  });
  app.querySelectorAll("[data-drop-row]").forEach((cell) => {
    cell.addEventListener("dragover", (event) => {
      event.preventDefault();
      cell.classList.add("drop-over");
    });
    cell.addEventListener("dragleave", () => cell.classList.remove("drop-over"));
    cell.addEventListener("drop", (event) => {
      event.preventDefault();
      cell.classList.remove("drop-over");
      handleScheduleDrop(cell, event);
    });
    cell.addEventListener("dblclick", () => {
      clearSlot(project, cell.dataset.dropRow, cell.dataset.dropDay, cell.dataset.dropPeriod);
      save();
      render();
    });
  });
}

function handleScheduleDrop(cell, event) {
  let data = null;
  try {
    data = JSON.parse(event.dataTransfer.getData("application/json"));
  } catch {
    return;
  }
  const rowId = cell.dataset.dropRow;
  const day = cell.dataset.dropDay;
  const period = Number(cell.dataset.dropPeriod);
  const assignment = data.type === "move" ? data.assignment : data;
  if (!assignment?.staff) return;
  if (day !== scheduleDay) {
    toast(`Drop on the selected day (${scheduleDay}) or switch to ${day}.`, "error");
    return;
  }
  if (data.type === "assignment" && data.period !== period) {
    toast(`Drop the P${data.period} box into a P${data.period} timetable cell.`, "error");
    return;
  }
  if (data.type === "assignment" && assignmentPlaced(project, rowId, day, data.columnId, period)) {
    return;
  }
  const existing = getSlot(project, rowId, day, period);
  if (existing && data.type === "assignment") {
    toast("This cell is already filled.", "error");
    return;
  }
  if (isStaffBusy(project, assignment.staff, day, period)) {
    toast(`${assignment.staff} is marked busy for ${day} P${period}.`, "error");
    return;
  }
  const booked = staffBooking(project, assignment.staff, day, period, rowId);
  if (booked) {
    toast(`${assignment.staff} is already assigned to ${booked.section} for ${day} P${period}.`, "error");
    return;
  }
  if (data.type === "move") clearSlot(project, data.fromRowId, data.fromDay, data.fromPeriod);
  setSlot(project, rowId, day, period, {
    columnId: assignment.columnId,
    staff: assignment.staff,
    title: assignment.title,
    role: assignment.role,
    kind: assignment.kind,
  });
  save();
  render();
}

function renderMenu() {
  const fromColumn = project.columns.find((item) => item.id === menu?.columnId);
  const canSupport = fromColumn && isMappingColumn(fromColumn);
  return `<div class="map-menu-backdrop" data-close-menu="1"></div>
    <div class="map-menu" style="left:${menu.x}px;top:${menu.y}px" role="menu" aria-label="Add column">
      <button type="button" role="menuitem" data-menu="subject">Add new subject</button>
      <button type="button" role="menuitem" data-menu="lab">Add lab</button>
      ${canSupport ? `<button type="button" role="menuitem" data-menu="support">Add supporting staff for this subject/lab</button>` : ""}
      ${canSupport && fromColumn.kind === "subject" ? `<button type="button" role="menuitem" data-menu="lab-linked">Add lab for this subject</button>` : ""}
    </div>`;
}

function bind() {
  const nameInput = app.querySelector("#project-name");
  if (nameInput) {
    nameInput.onchange = () => {
      project.name = nameInput.value.trim() || "My class timetable";
      save();
      render();
    };
  }

  app.querySelectorAll("[data-action]").forEach((button) => {
    button.onclick = () => runAction(button.dataset.action);
  });

  const importInput = app.querySelector("#import-mapping-file");
  if (importInput) {
    importInput.onchange = async () => {
      const file = importInput.files?.[0];
      importInput.value = "";
      if (!file) return;
      try {
        const imported = await importProjectJson(file);
        project = imported;
        scheduleRowId = project.rows[0]?.id || null;
        selected = null;
        closeMenu();
        save();
        toast(`Imported “${project.name}”.`);
        render();
      } catch (error) {
        toast(error.message || "Import failed.", "error");
      }
    };
  }

  app.querySelectorAll("[data-open]").forEach((button) => {
    button.onclick = () => {
      const next = loadProject(button.dataset.open);
      if (!next) return toast("Could not open that project.", "error");
      project = next;
      scheduleRowId = project.rows[0]?.id || null;
      selected = null;
      closeMenu();
      render();
    };
  });

  app.querySelectorAll("[data-delete-saved]").forEach((button) => {
    button.onclick = () => {
      const id = button.dataset.deleteSaved;
      const entry = listProjects().find((item) => item.id === id);
      if (!confirm(`Delete "${entry?.name || "this project"}" from this browser?`)) return;
      deleteProject(id);
      if (project.id === id) {
        const remaining = listProjects()[0];
        project = remaining ? loadProject(remaining.id) : createProject();
        scheduleRowId = project.rows[0]?.id || null;
        if (!remaining) save();
      }
      toast("Project deleted.");
      render();
    };
  });

  app.querySelectorAll("[data-add-col]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      const column = project.columns.find((item) => item.id === button.dataset.addCol);
      if (!column) return;
      const rect = button.getBoundingClientRect();
      menu = {
        columnId: column.id,
        x: Math.min(rect.left, window.innerWidth - 280),
        y: rect.bottom + 6,
      };
      render();
    };
  });

  app.querySelectorAll("[data-del-col]").forEach((button) => {
    button.onclick = () => {
      const column = project.columns.find((item) => item.id === button.dataset.delCol);
      if (!column) return;
      if (!confirm(`Delete column "${columnHeader(column)}"?`)) return;
      try {
        deleteColumn(project, column.id);
        save();
        render();
      } catch (error) {
        toast(error.message, "error");
      }
    };
  });

  app.querySelectorAll("[data-del-row]").forEach((button) => {
    button.onclick = () => {
      try {
        deleteRow(project, button.dataset.delRow);
        save();
        render();
      } catch (error) {
        toast(error.message, "error");
      }
    };
  });

  app.querySelectorAll("[data-rename]").forEach((el) => {
    el.addEventListener("blur", () => {
      const column = project.columns.find((item) => item.id === el.dataset.rename);
      if (!column || !isMappingColumn(column)) return;
      const ok = renameMappingColumn(project, column.id, el.textContent);
      if (!ok) {
        el.textContent = columnHeader(column);
        return;
      }
      save();
      render();
    });
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        el.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        const column = project.columns.find((item) => item.id === el.dataset.rename);
        if (column) el.textContent = columnHeader(column);
        el.blur();
      }
    });
  });

  app.querySelectorAll("[data-cell-row]").forEach((input) => {
    input.addEventListener("focus", () => {
      selected = { rowId: input.dataset.cellRow, columnId: input.dataset.cellCol };
      // Re-render only selection chrome if needed — avoid full rerender on every focus to keep caret.
      document.querySelectorAll(".map-cell").forEach((cell) => cell.classList.remove("is-selected"));
      document.querySelectorAll(".map-fill-handle").forEach((handle) => handle.remove());
      const td = input.closest(".map-cell");
      if (td) {
        td.classList.add("is-selected");
        const handle = document.createElement("span");
        handle.className = "map-fill-handle";
        handle.dataset.fillRow = selected.rowId;
        handle.dataset.fillCol = selected.columnId;
        handle.title = "Drag to fill";
        input.parentElement.append(handle);
        bindFillHandle(handle);
      }
    });
    input.addEventListener("change", () => {
      const row = project.rows.find((item) => item.id === input.dataset.cellRow);
      if (!row) return;
      row.cells[input.dataset.cellCol] = input.value;
      save();
      refreshMappingSuggestions();
    });
    input.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        fillDownFrom(input.dataset.cellRow, input.dataset.cellCol);
      }
    });
  });

  app.querySelectorAll("[data-close-menu]").forEach((el) => {
    el.onclick = () => { closeMenu(); render(); };
  });

  app.querySelectorAll("[data-menu]").forEach((button) => {
    button.onclick = () => {
      const fromColumn = project.columns.find((item) => item.id === menu?.columnId);
      closeMenu();
      if (!fromColumn) return render();
      try {
        if (button.dataset.menu === "subject") {
          const title = askName("Subject name");
          if (!title) return render();
          addSubjectColumn(project, fromColumn.id, title);
        }
        if (button.dataset.menu === "lab") {
          const title = askName("Lab name", fromColumn.title || "");
          if (!title) return render();
          addLabColumn(project, fromColumn.id, title);
        }
        if (button.dataset.menu === "lab-linked") {
          addLabColumn(project, fromColumn.id, fromColumn.title, { linkTo: fromColumn });
        }
        if (button.dataset.menu === "support") addSupportColumn(project, fromColumn);
        save();
        render();
      } catch (error) {
        toast(error.message, "error");
        render();
      }
    };
  });

  bindRowDrag();
  bindColumnResize();
  document.querySelectorAll(".map-fill-handle").forEach(bindFillHandle);
}

function runAction(name) {
  if (name === "toggle-files-menu") {
    filesMenuOpen = !filesMenuOpen;
    render();
    return;
  }
  if (name !== "import") filesMenuOpen = false;
  if (name === "add-rows") {
    const answer = prompt("How many rows do you want to add?", "1");
    if (answer == null) return;
    try {
      addRows(project, answer);
      save();
      render();
    } catch (error) {
      toast(error.message, "error");
    }
  }
  if (name === "fill-test") {
    if (!confirm("Replace the current mapping with sample test data (12 sections, subjects, labs, and staff)?")) return;
    fillTestMappingData(project);
    delete project.schedule;
    scheduleRowId = project.rows[0]?.id || null;
    selected = null;
    closeMenu();
    save();
    toast("Test mapping loaded.");
    render();
  }
  if (name === "import") {
    filesMenuOpen = false;
    app.querySelector("#import-mapping-file")?.click();
  }
  if (name === "export") exportProjectJson(project);
  if (name === "export-pdf") {
    try {
      const filename = exportMappingPdf(project);
      toast(`Print dialog opened for ${filename}.`);
    } catch (error) {
      toast(error.message || "Could not open the PDF export.", "error");
    }
  }
  if (name === "summary") {
    selected = null;
    closeMenu();
    view = "summary";
    render();
  }
  if (name === "start-step-2") {
    const issues = fullMappingIssues(project);
    if (issues.length) {
      toast("Fill every mapping cell before moving to Step 2.", "error");
      alert(`Fill every mapping cell before moving to Step 2:\n\n${issues.slice(0, 12).join("\n")}${issues.length > 12 ? `\n...and ${issues.length - 12} more.` : ""}`);
      return;
    }
    normalizeSchedule(project);
    scheduleRowId = project.rows[0]?.id || null;
    scheduleDay = project.schedule.setup.workingDays[0] || "Monday";
    selected = null;
    closeMenu();
    save();
    view = "timingSetup";
    render();
  }
  if (name === "new-project") {
    if (!confirm("Start a new blank mapping project? Your current project stays saved in this browser.")) return;
    project = createProject();
    save();
    scheduleRowId = project.rows[0]?.id || null;
    selected = null;
    view = "mapping";
    render();
  }
}

function fillDownFrom(rowId, columnId) {
  const index = project.rows.findIndex((row) => row.id === rowId);
  if (index <= 0) return;
  const value = project.rows[index - 1].cells[columnId] || "";
  project.rows[index].cells[columnId] = value;
  save();
  render();
  const next = app.querySelector(`[data-cell-row="${rowId}"][data-cell-col="${columnId}"]`);
  next?.focus();
}

function bindFillHandle(handle) {
  handle.onmousedown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    fillDrag = {
      rowId: handle.dataset.fillRow,
      columnId: handle.dataset.fillCol,
      value: project.rows.find((row) => row.id === handle.dataset.fillRow)?.cells[handle.dataset.fillCol] || "",
    };
    document.body.classList.add("is-filling");
  };
}

function applyColumnWidth(columnId, width) {
  const px = `${width}px`;
  const col = app.querySelector(`col[data-col-width="${columnId}"]`);
  const th = app.querySelector(`th[data-col="${columnId}"]`);
  const table = app.querySelector("#map-table");
  if (col) col.style.width = px;
  if (th) th.style.width = px;
  if (table) {
    const total = ACTION_WIDTH + GRIP_WIDTH
      + project.columns.reduce((sum, column) => sum + (column.width || 150), 0);
    table.style.width = `${total}px`;
  }
  syncStickyOffsets();
}

function syncStickyOffsets() {
  const layout = frozenLayout(project.columns);
  app.querySelectorAll(".map-row-actions-col.map-sticky-col").forEach((el) => {
    el.style.left = `${layout.deleteLeft}px`;
  });
  app.querySelectorAll(".map-grip-col.map-sticky-col").forEach((el) => {
    el.style.left = `${layout.gripLeft}px`;
  });
  if (layout.idId) {
    app.querySelectorAll(`[data-col="${layout.idId}"]`).forEach((el) => {
      el.style.left = `${layout.idLeft}px`;
    });
  }
  if (layout.nameId) {
    app.querySelectorAll(`[data-col="${layout.nameId}"]`).forEach((el) => {
      el.style.left = `${layout.nameLeft}px`;
    });
  }
}

function bindColumnResize() {
  app.querySelectorAll("[data-resize-col]").forEach((handle) => {
    handle.onmousedown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const column = project.columns.find((item) => item.id === handle.dataset.resizeCol);
      if (!column) return;
      colResize = {
        columnId: column.id,
        startX: event.clientX,
        startWidth: column.width || 140,
      };
      document.body.classList.add("is-resizing-col");
    };
  });
}

function bindRowDrag() {
  app.querySelectorAll("tr[data-row]").forEach((tr) => {
    const grip = tr.querySelector("[data-row-grip]");
    if (!grip) return;

    grip.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const fromIndex = Number(tr.dataset.rowIndex);
      if (Number.isNaN(fromIndex)) return;

      armedDragRow = tr;
      rowDrag = {
        fromIndex,
        overIndex: fromIndex,
        pointerId: event.pointerId,
      };
      tr.classList.add("is-dragging");
      document.body.classList.add("is-row-dragging");
      try { grip.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    });
  });
}

function rowFromPoint(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  return el?.closest?.("tr[data-row]") || null;
}

function updateRowDragOver(clientX, clientY) {
  if (!rowDrag) return;
  const over = rowFromPoint(clientX, clientY);
  app.querySelectorAll("tr[data-row]").forEach((row) => row.classList.remove("drag-over"));
  if (!over) return;
  const overIndex = Number(over.dataset.rowIndex);
  if (Number.isNaN(overIndex) || overIndex === rowDrag.fromIndex) return;
  rowDrag.overIndex = overIndex;
  over.classList.add("drag-over");
}

function finishRowDrag() {
  if (!rowDrag) return;
  const { fromIndex, overIndex } = rowDrag;
  document.body.classList.remove("is-row-dragging");
  app.querySelectorAll("tr[data-row]").forEach((row) => {
    row.classList.remove("is-dragging", "drag-over");
  });
  if (armedDragRow) armedDragRow = null;
  rowDrag = null;
  if (fromIndex === overIndex || overIndex == null) return;
  moveRow(project, fromIndex, overIndex);
  save();
  render();
}

document.addEventListener("pointermove", (event) => {
  if (!rowDrag) return;
  updateRowDragOver(event.clientX, event.clientY);
});

document.addEventListener("pointerup", () => {
  if (rowDrag) finishRowDrag();
});

document.addEventListener("pointercancel", () => {
  if (!rowDrag) return;
  document.body.classList.remove("is-row-dragging");
  app.querySelectorAll("tr[data-row]").forEach((row) => {
    row.classList.remove("is-dragging", "drag-over");
  });
  armedDragRow = null;
  rowDrag = null;
});

document.addEventListener("mousemove", (event) => {
  if (!colResize) return;
  const column = project.columns.find((item) => item.id === colResize.columnId);
  if (!column) return;
  const next = clampColumnWidth(colResize.startWidth + (event.clientX - colResize.startX));
  column.width = next;
  applyColumnWidth(column.id, next);
});

document.addEventListener("mouseup", (event) => {
  if (colResize) {
    document.body.classList.remove("is-resizing-col");
    save();
    colResize = null;
    return;
  }
  if (!fillDrag) return;
  const cell = event.target.closest?.(".map-cell");
  document.body.classList.remove("is-filling");
  if (cell && cell.dataset.col === fillDrag.columnId) {
    const start = project.rows.findIndex((row) => row.id === fillDrag.rowId);
    const end = project.rows.findIndex((row) => row.id === cell.dataset.row);
    if (start >= 0 && end >= 0) {
      const from = Math.min(start, end);
      const to = Math.max(start, end);
      for (let i = from; i <= to; i += 1) {
        project.rows[i].cells[fillDrag.columnId] = fillDrag.value;
      }
      save();
    }
  }
  fillDrag = null;
  render();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menu) {
    closeMenu();
    render();
  }
  if (event.key === "Escape" && filesMenuOpen) {
    filesMenuOpen = false;
    render();
  }
});

document.addEventListener("click", (event) => {
  if (!filesMenuOpen) return;
  if (event.target.closest?.(".map-file-menu-wrap")) return;
  filesMenuOpen = false;
  render();
});

render();
