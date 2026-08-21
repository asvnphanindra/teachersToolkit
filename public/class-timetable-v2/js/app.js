import {
  addLabColumn,
  addRows,
  addSubjectColumn,
  addSupportColumn,
  clampColumnWidth,
  columnHeader,
  columnDisplayTitle,
  createProject,
  deleteColumn,
  deleteRow,
  fillTestMappingData,
  isLoadColumn,
  isMappingColumn,
  loadColumnLabel,
  mappingIssues,
  moveRow,
  parsePeriodsPerWeek,
  renameMappingColumn,
  unsetLoadColumns,
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
import {
  exportFacultySummaryPdf,
  exportFacultyTimetablesPdf,
  exportMappingPdf,
  exportSectionTimetablesPdf,
} from "./pdf-export.js";
import {
  facultySummaryRows,
  filterFacultySummaryRows,
  sortFacultySummaryRows,
  summarySearchSuggestions,
} from "./summary.js";
import {
  WEEK_DAYS,
  TIMELINE,
  assignmentRecord,
  clearSlot,
  columnLoadIssue,
  countColumnPeriods,
  facultyTimetables,
  fullMappingIssues,
  getSlot,
  insertTimeSlot,
  isStaffBusy,
  linkedSupportAssignment,
  minutesFromBar,
  normalizeSchedule,
  removeTimeSlot,
  resizeTimeSlot,
  scheduleColumnTemplate,
  scheduleGridColumns,
  sectionLabel,
  sectionStaffGroups,
  setSlot,
  staffBooking,
  staffOptionsFor,
  staffPeriodPlacement,
  syncSetupFromTimeRows,
  timeRowDuration,
  timelineMarks,
  timeToMinutes,
  toggleStaffBusy,
  updateTimeSlotLabel,
  weekLoadSummary,
} from "./schedule.js";
import {
  STAGES,
  markIntroSeen,
  stageById,
  stageState,
} from "./stages.js";

const app = document.querySelector("#app");
let project = ensureActiveProject();
let view = "start";
let scheduleRowId = project.rows[0]?.id || null;
let scheduleDay = "Monday";
let scheduleViewMode = "all"; // one | some | all
let schedulePickedDays = [];
let scheduleDragActive = false;
let scheduleSearch = "";
let scheduleVisibleCount = 7;
let exportSectionId = "all";
let exportStaffName = "all";
let subjectChoice = null; // { rowId, day, period, staff, options }
let timelineDrag = null; // { index, edge }
let menu = null; // { columnId, x, y, mode?: "actions" | "add", submenu?: "add" | null }
let selected = null; // { rowId, columnId }
let fillDrag = null;
let rowDrag = null;
let colResize = null; // { columnId, startX, startWidth }
let armedDragRow = null;
let renameColumnId = null;
let summaryUi = {
  draftQuery: "",
  appliedQuery: "",
  typeFilter: "all",
  sortKey: "section",
  sortDir: "asc",
  suggestOpen: false,
  suggestIndex: -1,
};

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
  chevron: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4 4a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 1 1-1.06-1.06L9.69 8 6.22 4.53a.75.75 0 0 1 0-1.06Z"/></svg>',
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

let appMenu = null; // file | view | help

function statusChip() {
  const issues = mappingIssues(project);
  return issues.length
    ? `<span class="map-status warn" role="status">${issues.length} to fix</span>`
    : `<span class="map-status ok" role="status">Ready to schedule</span>`;
}

function renderStageNav(currentView) {
  const state = stageState(project, currentView);
  const infoIcon = `<svg class="map-stage-info-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="5" r="1" fill="currentColor"/><path d="M8 7.25v4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  return `<nav class="map-stage-nav map-stage-nav--chevron" aria-label="Timetable stages">
    <div class="map-stage-track">
      ${state.stages.map((stage) => `
        <div class="map-stage-segment ${stage.current ? "is-current" : ""} ${stage.complete ? "is-complete" : ""} ${stage.locked ? "is-locked" : ""}">
          <button type="button"
            class="map-stage-step"
            data-goto-stage="${stage.id}"
            ${stage.locked ? 'aria-disabled="true"' : ""}
            ${stage.current ? 'aria-current="step"' : ""}>
            <span class="map-stage-num">${stage.complete && !stage.current ? "✓" : stage.number}</span>
            <strong class="map-stage-label">${esc(stage.label)}</strong>
          </button>
          <span class="map-stage-info" tabindex="0" role="button" aria-label="About ${esc(stage.label)}" data-tip="${esc(stage.description)}">${infoIcon}</span>
        </div>
      `).join("")}
    </div>
  </nav>`;
}

function renderMenuBar(currentView) {
  const showEditWeek = currentView === "schedule";
  const showBackMapping = ["summary", "timingSetup", "schedule", "projects"].includes(currentView);
  return `
    <div class="map-menu-bar" role="menubar" aria-label="Application menu">
      <div class="map-menu-wrap ${appMenu === "file" ? "is-open" : ""}">
        <button type="button" class="map-menu-trigger" data-app-menu="file" aria-haspopup="true" aria-expanded="${appMenu === "file" ? "true" : "false"}">File</button>
        <div class="map-menu-panel" role="menu">
          <button type="button" role="menuitem" data-action="new-project">New project</button>
          <button type="button" role="menuitem" data-action="open-projects">Open saved projects…</button>
          <button type="button" role="menuitem" data-action="import">Import JSON</button>
          <button type="button" role="menuitem" data-action="export">Export JSON</button>
        </div>
      </div>
      <div class="map-menu-wrap ${appMenu === "view" ? "is-open" : ""}">
        <button type="button" class="map-menu-trigger" data-app-menu="view" aria-haspopup="true" aria-expanded="${appMenu === "view" ? "true" : "false"}">View</button>
        <div class="map-menu-panel" role="menu">
          <button type="button" role="menuitem" data-action="summary">Faculty summary</button>
          ${showEditWeek ? `<button type="button" role="menuitem" data-action="edit-timings">Edit week plan</button>` : ""}
          ${showBackMapping ? `<button type="button" role="menuitem" data-action="back-to-mapping">Back to mapping</button>` : ""}
        </div>
      </div>
      <div class="map-menu-wrap ${appMenu === "help" ? "is-open" : ""}">
        <button type="button" class="map-menu-trigger" data-app-menu="help" aria-haspopup="true" aria-expanded="${appMenu === "help" ? "true" : "false"}">Help</button>
        <div class="map-menu-panel" role="menu">
          <button type="button" role="menuitem" data-action="show-intro">How it works</button>
          <button type="button" role="menuitem" data-action="fill-test">Fill test data</button>
        </div>
      </div>
      ${statusChip()}
      <span class="map-chrome-autosave" title="Data stays in this browser only"><span class="map-privacy-dot" aria-hidden="true"></span>Autosaved locally</span>
    </div>
    <input type="file" id="import-mapping-file" accept="application/json,.json,.mapping.json" hidden>`;
}

function renderAppChrome(currentView) {
  return `<header class="map-app-chrome">
    <div class="map-chrome-top">
      <a href="../index.html" class="map-chrome-back">← Teacher's Toolkit</a>
    </div>
    <div class="map-chrome-main">
      <label class="map-doc-title-wrap">
        <span class="map-doc-title-hint">Click to rename</span>
        <input class="map-doc-title" id="project-name" value="${esc(project.name)}" maxlength="80" aria-label="Project name" placeholder="Untitled timetable">
      </label>
      ${renderStageNav(currentView)}
    </div>
    ${renderMenuBar(currentView)}
  </header>`;
}

function nextStepForView(currentView) {
  if (currentView === "mapping") return { label: "Plan the week", action: "start-step-2" };
  if (currentView === "timingSetup") return { label: "Open scheduler", action: "open-schedule" };
  if (currentView === "schedule") return { label: "Export", action: "goto-export" };
  return null;
}

function prevStepForView(currentView) {
  if (currentView === "summary") return { label: "Section mapping", action: "back-to-mapping" };
  if (currentView === "timingSetup") return { label: "Section mapping", action: "back-to-mapping" };
  if (currentView === "schedule") return { label: "Edit week plan", action: "edit-timings" };
  if (currentView === "export") return { label: "Schedule", action: "back-to-schedule" };
  return null;
}

function renderFab(currentView) {
  const step = nextStepForView(currentView);
  if (!step) return "";
  return `<div class="map-fab-zone">
    <button type="button" class="map-fab" data-action="${step.action}" aria-label="${esc(step.label)}">
      <span class="map-fab-label">${esc(step.label)}</span>
      <span class="map-fab-arrow" aria-hidden="true">→</span>
    </button>
  </div>`;
}

function renderBackFab(currentView) {
  const step = prevStepForView(currentView);
  if (!step) return "";
  return `<div class="map-fab-zone map-fab-zone--back">
    <button type="button" class="map-fab map-fab--back" data-action="${step.action}" aria-label="${esc(step.label)}">
      <span class="map-fab-arrow" aria-hidden="true">←</span>
      <span class="map-fab-label">${esc(step.label)}</span>
    </button>
  </div>`;
}

function renderSavedProjectsList() {
  const projects = listProjects();
  return projects.length ? projects.map((item) => `
    <div class="map-saved-item ${item.id === project.id ? "active" : ""}">
      <button type="button" data-open="${item.id}" aria-current="${item.id === project.id ? "true" : "false"}">
        <strong>${esc(item.name)}</strong>
        <span>${new Date(item.updatedAt).toLocaleString()}</span>
      </button>
      <button type="button" class="map-icon-btn danger" data-delete-saved="${item.id}" title="Delete project" aria-label="Delete ${esc(item.name)}">${ICON.close}</button>
    </div>
  `).join("") : `<p class="map-saved-empty">No saved projects yet. Create one from File → New project.</p>`;
}

function closeAppMenu() {
  appMenu = null;
  document.querySelector(".map-app-menu-backdrop")?.remove();
}

function bindSavedProjects() {
  app.querySelectorAll("[data-open]").forEach((button) => {
    button.onclick = () => {
      const next = loadProject(button.dataset.open);
      if (!next) return toast("Could not open that project.", "error");
      project = next;
      scheduleRowId = project.rows[0]?.id || null;
      selected = null;
      closeMenu();
      closeAppMenu();
      view = "mapping";
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
}

function bindAppChrome() {
  app.querySelectorAll("[data-goto-stage]").forEach((button) => {
    button.onclick = () => goToStage(button.dataset.gotoStage);
  });
  const nameInput = app.querySelector("#project-name");
  if (nameInput) {
    nameInput.onchange = () => {
      project.name = nameInput.value.trim() || "My class timetable";
      save();
    };
    nameInput.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        nameInput.blur();
      }
    };
  }
  bindStageInfoTips();
  app.querySelectorAll("[data-app-menu]").forEach((trigger) => {
    trigger.onclick = (event) => {
      event.stopPropagation();
      const id = trigger.dataset.appMenu;
      appMenu = appMenu === id ? null : id;
      render();
    };
  });
  app.querySelectorAll(".map-menu-panel [data-action]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      runAction(button.dataset.action);
    };
  });
  if (appMenu) {
    const backdrop = document.createElement("div");
    backdrop.className = "map-app-menu-backdrop";
    backdrop.dataset.closeAppMenu = "1";
    backdrop.onclick = () => {
      closeAppMenu();
      render();
    };
    document.body.append(backdrop);
  }
}

function ensureStageTipEl() {
  let tip = document.getElementById("map-stage-tip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "map-stage-tip";
    tip.className = "map-stage-tip";
    tip.hidden = true;
    tip.setAttribute("role", "tooltip");
    document.body.append(tip);
  }
  return tip;
}

function hideStageTip() {
  const tip = document.getElementById("map-stage-tip");
  if (tip) tip.hidden = true;
}

function showStageTip(anchor) {
  const text = anchor.getAttribute("data-tip");
  if (!text) return;
  const tip = ensureStageTipEl();
  tip.textContent = text;
  tip.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
  let top = rect.top - tipRect.height - 8;
  if (top < 8) top = rect.bottom + 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function bindStageInfoTips() {
  app.querySelectorAll(".map-stage-info").forEach((el) => {
    el.onmouseenter = () => showStageTip(el);
    el.onmouseleave = hideStageTip;
    el.onfocus = () => showStageTip(el);
    el.onblur = hideStageTip;
  });
}

function openScheduleFromSetup() {
  saveTimingSetup();
  saveSubjectLoad();
  const missing = unsetLoadColumns(project);
  if (missing.length) {
    toast(`Set periods per week for: ${missing.map(loadColumnLabel).join(", ")}.`, "error");
    return;
  }
  const summary = weekLoadSummary(project);
  if (summary.over) {
    toast(`Subject load is ${summary.planned} periods; the week only has ${summary.capacity} (${summary.days} days × ${summary.periods} periods).`, "error");
    return;
  }
  view = "schedule";
  render();
}

function renderFooter(currentView) {
  const stage = stageById(stageState(project, currentView).currentStage);
  return `<footer class="map-footer">
    <p><strong>Class Timetable</strong> · ${esc(stage.label)}</p>
    <p>Autosaved locally</p>
  </footer>`;
}

function goToStage(stageId) {
  closeAppMenu();
  const state = stageState(project, view);
  const target = state.byId[stageId];
  if (!target) return;
  if (target.locked) {
    toast("Fill every mapping cell before scheduling.", "error");
    view = "mapping";
    render();
    return;
  }
  selected = null;
  closeMenu();
  if (stageId === "plan") {
    view = "mapping";
  } else if (stageId === "schedule") {
    normalizeSchedule(project);
    scheduleRowId = project.rows[0]?.id || null;
    scheduleDay = project.schedule.setup.workingDays[0] || "Monday";
    save();
    view = "schedule";
  } else {
    view = "export";
  }
  render();
}

function bindChrome() {
  bindAppChrome();
  bindImportInput();
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
  hideStageTip();
  if (view === "start") {
    renderStart();
    return;
  }
  if (view === "intro") {
    renderIntro();
    return;
  }
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
  if (view === "export") {
    renderExport();
    return;
  }
  if (view === "projects") {
    renderProjects();
    return;
  }
  const issues = mappingIssues(project);
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
        ${renderAppChrome("mapping")}

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
                      const displayTitle = columnDisplayTitle(column);
                      const canMenu = isMappingColumn(column) || column.kind === "sectionName";
                      const canRename = isMappingColumn(column);
                      const canDelete = isMappingColumn(column);
                      const editing = renameColumnId === column.id;
                      return `
                      <th data-col="${column.id}" scope="col" class="${stickyClassForColumn(column)} ${groupClasses}" style="width:${column.width || 140}px;${stickyStyle}" ${groupInfo ? `data-group="${esc(groupInfo.groupKey)}"` : ""}>
                        <div class="map-th">
                          <span class="map-th-title ${editing ? "is-editing" : ""}" ${canRename ? `contenteditable="${editing ? "true" : "false"}" data-rename="${column.id}" role="textbox" aria-label="Rename ${esc(columnHeader(column))}"` : ""}>${esc(displayTitle)}</span>
                          ${canMenu ? `
                            <button type="button" class="map-th-menu-trigger" data-col-menu="${column.id}" aria-haspopup="menu" aria-label="Column actions for ${esc(displayTitle)}" title="Column actions">${ICON.chevron}</button>
                          ` : ""}
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
                        const sticky = left == null ? "" : `map-sticky-col ${column.kind === "sectionName" ? "map-sticky-col--name map-sticky-col--edge" : column.kind === "sectionId" ? "map-sticky-col--id" : ""}`;
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
            </div>
          </div>

          ${issues.length ? `
            <div class="map-issues" role="status" aria-live="polite">
              <p class="map-issues-title">Before scheduling</p>
              <ul>${issues.map((issue) => `<li>${esc(issue)}</li>`).join("")}</ul>
            </div>
          ` : ""}
        </section>

        ${renderFooter("mapping")}
      </div>
    </div>

    ${renderBackFab("mapping")}
    ${renderFab("mapping")}
    ${menu ? renderMenu() : ""}
  `;
  bind();
}

function visibleSummaryRows() {
  const all = facultySummaryRows(project);
  return sortFacultySummaryRows(
    filterFacultySummaryRows(all, {
      query: summaryUi.appliedQuery,
      typeFilter: summaryUi.typeFilter,
    }),
    summaryUi.sortKey,
    summaryUi.sortDir,
  );
}

function summaryTypeScopedRows() {
  return filterFacultySummaryRows(facultySummaryRows(project), {
    query: "",
    typeFilter: summaryUi.typeFilter,
  });
}

function summarySuggestionsList() {
  if (!summaryUi.suggestOpen) return [];
  return summarySearchSuggestions(summaryTypeScopedRows(), summaryUi.draftQuery);
}

function renderSummarySuggestList(suggestions) {
  if (!suggestions.length) return "";
  return `
    <ul class="map-summary-suggest" id="summary-suggest" role="listbox">
      ${suggestions.map((item, index) => `
        <li role="presentation">
          <button type="button" role="option" class="map-summary-suggest-item ${index === summaryUi.suggestIndex ? "is-active" : ""}" data-summary-suggest="${esc(item.value)}" aria-selected="${index === summaryUi.suggestIndex ? "true" : "false"}">
            <span>${esc(item.value)}</span>
            <span class="map-summary-suggest-kind">${esc(item.kind)}</span>
          </button>
        </li>
      `).join("")}
    </ul>
  `;
}

function syncSummarySuggestDom() {
  const wrap = app.querySelector(".map-summary-search");
  const search = app.querySelector("#summary-search");
  if (!wrap || !search) return;
  wrap.querySelector("#summary-suggest")?.remove();
  const suggestions = summarySuggestionsList();
  search.setAttribute("aria-expanded", suggestions.length ? "true" : "false");
  if (!suggestions.length) return;
  wrap.insertAdjacentHTML("beforeend", renderSummarySuggestList(suggestions));
  wrap.querySelectorAll("[data-summary-suggest]").forEach((button) => {
    button.onmousedown = (event) => event.preventDefault();
    button.onclick = () => applySummarySuggestion(button.dataset.summarySuggest);
  });
}

function applySummarySuggestion(value) {
  summaryUi = {
    ...summaryUi,
    draftQuery: value,
    appliedQuery: value,
    suggestOpen: false,
    suggestIndex: -1,
  };
  renderSummary();
  app.querySelector("#summary-search")?.focus();
}

function summarySortIndicator(key) {
  if (summaryUi.sortKey !== key) return "";
  return summaryUi.sortDir === "asc" ? " ↑" : " ↓";
}

function renderSummary() {
  const allRows = facultySummaryRows(project);
  const rows = visibleSummaryRows();
  const suggestions = summarySuggestionsList();
  const columns = [
    { key: "section", label: "Section" },
    { key: "subject", label: "Subject" },
    { key: "faculty", label: "Faculty name" },
    { key: "type", label: "Type" },
    { key: "facultyCount", label: "Faculty cumulative number" },
  ];

  app.innerHTML = `
    <div class="map-page">
      <div class="map-shell">
        ${renderAppChrome("summary")}

        <main class="map-summary" aria-label="Faculty summary">
          <div class="map-summary-intro">
            <div>
              <h2>Faculty summary</h2>
              <p>One row per section–subject staff assignment. Cumulative number is how many assignments that faculty has in total.</p>
            </div>
            <span>${allRows.length} assignment${allRows.length === 1 ? "" : "s"}</span>
          </div>

          ${allRows.length ? `
            <div class="map-summary-toolbar">
              <div class="map-summary-search">
                <label for="summary-search">
                  <span class="visually-hidden">Search faculty, subject, or section</span>
                </label>
                <input type="search" id="summary-search" value="${esc(summaryUi.draftQuery)}" placeholder="Search faculty, subject, or section" autocomplete="off" aria-autocomplete="list" aria-controls="summary-suggest" aria-expanded="${suggestions.length ? "true" : "false"}">
                ${renderSummarySuggestList(suggestions)}
              </div>
              <label class="map-summary-filter">
                <span class="visually-hidden">Filter by type</span>
                <select id="summary-type-filter" aria-label="Filter by type">
                  <option value="all" ${summaryUi.typeFilter === "all" ? "selected" : ""}>All types</option>
                  <option value="main" ${summaryUi.typeFilter === "main" ? "selected" : ""}>Main faculty</option>
                  <option value="support" ${summaryUi.typeFilter === "support" ? "selected" : ""}>Supporting</option>
                </select>
              </label>
              <button type="button" class="btn btn--secondary btn--sm" data-action="export-summary-pdf">Print</button>
            </div>

            <section class="map-summary-card map-summary-card--flat">
              ${rows.length ? `
                <div class="map-summary-table-wrap">
                  <table class="map-summary-table map-summary-table--flat">
                    <thead>
                      <tr>
                        ${columns.map((column) => `
                          <th scope="col">
                            <button type="button" class="map-summary-sort ${summaryUi.sortKey === column.key ? "is-active" : ""}" data-summary-sort="${column.key}" aria-label="Sort by ${esc(column.label)}">
                              ${esc(column.label)}${summarySortIndicator(column.key)}
                            </button>
                          </th>
                        `).join("")}
                      </tr>
                    </thead>
                    <tbody>
                      ${rows.map((row) => `
                        <tr>
                          <td><span class="map-summary-cell">${esc(row.section)}</span></td>
                          <td><span class="map-summary-cell">${esc(row.subject)}</span></td>
                          <td><span class="map-summary-cell">${esc(row.faculty)}</span></td>
                          <td><span class="map-summary-cell"><span class="map-summary-type map-summary-type--${row.typeKey}">${esc(row.type)}</span></span></td>
                          <td><span class="map-summary-cell map-summary-count-cell">${row.facultyCount}</span></td>
                        </tr>
                      `).join("")}
                    </tbody>
                  </table>
                </div>
              ` : `<p class="map-summary-empty">No rows match this search or filter.</p>`}
            </section>
          ` : `<section class="map-summary-empty-state"><h2>No staff assignments yet</h2><p>Add subjects or labs and fill staff names in the mapping grid to build this summary.</p><button type="button" class="btn btn--secondary btn--sm" data-action="back-to-mapping">Back to mapping</button></section>`}
        </main>
        ${renderFooter("summary")}
      </div>
    </div>

    ${renderBackFab("summary")}
  `;
  bindChrome();
  app.querySelectorAll("[data-action]").forEach((button) => {
    button.onclick = () => runAction(button.dataset.action);
  });

  const search = app.querySelector("#summary-search");
  if (search) {
    search.addEventListener("input", () => {
      const value = search.value;
      const cleared = !value.trim();
      const hadFilter = Boolean(summaryUi.appliedQuery);
      summaryUi = {
        ...summaryUi,
        draftQuery: value,
        appliedQuery: cleared ? "" : summaryUi.appliedQuery,
        suggestOpen: !cleared,
        suggestIndex: -1,
      };
      if (cleared) {
        if (hadFilter) {
          renderSummary();
          app.querySelector("#summary-search")?.focus();
        } else {
          syncSummarySuggestDom();
        }
        return;
      }
      syncSummarySuggestDom();
    });

    search.addEventListener("keydown", (event) => {
      const list = summarySuggestionsList();
      if (event.key === "ArrowDown" && list.length) {
        event.preventDefault();
        summaryUi = {
          ...summaryUi,
          suggestOpen: true,
          suggestIndex: Math.min(list.length - 1, summaryUi.suggestIndex + 1),
        };
        syncSummarySuggestDom();
        return;
      }
      if (event.key === "ArrowUp" && list.length) {
        event.preventDefault();
        summaryUi = {
          ...summaryUi,
          suggestOpen: true,
          suggestIndex: Math.max(0, summaryUi.suggestIndex <= 0 ? 0 : summaryUi.suggestIndex - 1),
        };
        syncSummarySuggestDom();
        return;
      }
      if (event.key === "Enter") {
        if (summaryUi.suggestOpen && summaryUi.suggestIndex >= 0 && list[summaryUi.suggestIndex]) {
          event.preventDefault();
          applySummarySuggestion(list[summaryUi.suggestIndex].value);
        } else {
          // Do not apply free-typed text — only chosen suggestions filter the table
          event.preventDefault();
        }
        return;
      }
      if (event.key === "Escape") {
        summaryUi = { ...summaryUi, suggestOpen: false, suggestIndex: -1 };
        syncSummarySuggestDom();
      }
    });

    search.addEventListener("blur", () => {
      setTimeout(() => {
        if (!summaryUi.suggestOpen) return;
        summaryUi = { ...summaryUi, suggestOpen: false, suggestIndex: -1 };
        syncSummarySuggestDom();
      }, 150);
    });
  }

  app.querySelectorAll("[data-summary-suggest]").forEach((button) => {
    button.onmousedown = (event) => event.preventDefault();
    button.onclick = () => applySummarySuggestion(button.dataset.summarySuggest);
  });

  const typeFilter = app.querySelector("#summary-type-filter");
  if (typeFilter) {
    typeFilter.onchange = () => {
      summaryUi = {
        ...summaryUi,
        typeFilter: typeFilter.value,
        suggestOpen: false,
        suggestIndex: -1,
      };
      renderSummary();
    };
  }

  app.querySelectorAll("[data-summary-sort]").forEach((button) => {
    button.onclick = () => {
      const key = button.dataset.summarySort;
      if (summaryUi.sortKey === key) {
        summaryUi = {
          ...summaryUi,
          sortDir: summaryUi.sortDir === "asc" ? "desc" : "asc",
        };
      } else {
        summaryUi = { ...summaryUi, sortKey: key, sortDir: "asc" };
      }
      renderSummary();
    };
  });
}

function timelineLegendItem(row) {
  const label = row.label || (row.type === "break" ? "Break" : `Period ${row.period}`);
  const mins = timeRowDuration(row);
  return `<li class="${row.type === "break" ? "is-break" : "is-period"}"><strong>${esc(label)}</strong> ${esc(row.start || "—")}–${esc(row.end || "—")}${mins ? ` · ${mins} min` : ""}</li>`;
}

function renderTimingSetup() {
  const schedule = normalizeSchedule(project);
  const setup = schedule.setup;
  const timeRows = setup.timeRows || [];
  const span = TIMELINE.endMinutes - TIMELINE.startMinutes;
  const marks = timelineMarks();

  app.innerHTML = `
    <div class="map-page">
      <div class="map-shell">
        ${renderAppChrome("timingSetup")}

        <main class="schedule-setup" aria-label="Schedule timing setup">
          <section class="schedule-card">
            <div class="schedule-card-head">
              <h2>Working days</h2>
              <p>These days appear in the timetable grid.</p>
            </div>
            <div class="schedule-days" id="setup-days">
              ${WEEK_DAYS.map((day) => `
                <label class="schedule-day-check">
                  <input type="checkbox" value="${day}" ${setup.workingDays.includes(day) ? "checked" : ""}>
                  <span>${day}</span>
                </label>
              `).join("")}
            </div>
          </section>

          <section class="schedule-card">
            <div class="schedule-card-head">
              <h2>Day timeline</h2>
              <p>A working day from 09:00 to 17:00. Drag either edge of a break to make it longer or shorter — the rest of the day slides with it.</p>
            </div>
            <div class="schedule-timeline" id="setup-timeline">
              <div class="schedule-timeline-scale" aria-hidden="true">
                ${marks.filter((mark) => mark.major).map((mark, index, list) => `
                  <span class="schedule-timeline-hour-label ${index === 0 ? "is-first" : ""} ${index === list.length - 1 ? "is-last" : ""}" style="left:${mark.offset}%">${esc(mark.label)}</span>
                `).join("")}
              </div>
              <div class="schedule-timeline-bar" role="list" aria-label="Period and break slots">
                <div class="schedule-timeline-grid" aria-hidden="true">
                  ${marks.map((mark) => `<span class="schedule-timeline-tick ${mark.major ? "is-hour" : "is-half"}" style="left:${mark.offset}%"></span>`).join("")}
                </div>
                ${timeRows.map((row, index) => renderTimelineSegment(row, index, span)).join("")}
              </div>
            </div>
            <ul class="schedule-timeline-legend">
              ${timeRows.map((row) => timelineLegendItem(row)).join("")}
            </ul>
            <div class="schedule-time-rows-actions">
              <button type="button" class="btn btn--secondary btn--sm" data-action="add-period">+ Period</button>
              <button type="button" class="btn btn--secondary btn--sm" data-action="add-break">+ Break</button>
            </div>
          </section>

          ${renderSubjectLoadCard()}
        </main>

        ${renderFooter("timingSetup")}
      </div>
    </div>
    ${renderBackFab("timingSetup")}
    ${renderFab("timingSetup")}
  `;
  bindTimingSetup();
}

function weekLoadFooterCopy(summary) {
  const main = `${summary.planned} / ${summary.capacity} periods this week`;
  if (summary.over) return `${main} · ${summary.overBy} over capacity`;
  if (summary.empty === 0) return `${main} · no empty slots`;
  return `${main} · ${summary.empty} empty`;
}

function refreshLoadSummary() {
  const foot = app.querySelector("[data-load-summary]");
  if (!foot) return;
  const summary = weekLoadSummary(project);
  const text = foot.querySelector("[data-load-summary-text]");
  if (text) text.textContent = weekLoadFooterCopy(summary);
  foot.classList.toggle("is-over", summary.over);
}

function renderSubjectLoadCard() {
  const columns = (project.columns || []).filter(isLoadColumn);
  if (!columns.length) return "";
  const summary = weekLoadSummary(project);
  return `
          <section class="schedule-card">
            <div class="schedule-card-head">
              <h2>Subject load</h2>
              <p>These numbers apply to every section. Empty slots are leftover periods in a section week before you open the scheduler.</p>
            </div>
            <div class="schedule-load-list">
              ${columns.map((column) => {
                const quota = parsePeriodsPerWeek(column.periodsPerWeek);
                const countLabel = column.kind === "lab" ? "Hours per week" : "Periods per week";
                return `
                <div class="schedule-load-row" data-load-column="${column.id}">
                  <span class="schedule-load-name">${esc(loadColumnLabel(column))}</span>
                  <label class="schedule-load-periods">
                    <span>${countLabel}</span>
                    <input type="number" min="1" max="12" step="1" inputmode="numeric"
                      data-periods-week="1"
                      value="${quota == null ? "" : quota}"
                      aria-label="${esc(`${countLabel} for ${loadColumnLabel(column)}`)}">
                  </label>
                  <label class="schedule-load-repeat">
                    <input type="checkbox" data-allow-repeat="1" ${column.allowSameDayRepeat ? "checked" : ""}>
                    <span>May repeat on the same day</span>
                  </label>
                </div>`;
              }).join("")}
              <div class="schedule-load-foot ${summary.over ? "is-over" : ""}" data-load-summary>
                <p class="schedule-load-foot-main" data-load-summary-text>${esc(weekLoadFooterCopy(summary))}</p>
                <p class="schedule-load-foot-note">Capacity is working days × periods per day, for each section.</p>
              </div>
            </div>
          </section>
  `;
}

function renderTimelineSegment(row, index, span) {
  const start = timeToMinutes(row.start) ?? TIMELINE.startMinutes;
  const end = timeToMinutes(row.end) ?? start + TIMELINE.minDuration;
  const left = ((start - TIMELINE.startMinutes) / span) * 100;
  const width = (Math.max(5, end - start) / span) * 100;
  const kind = row.type === "break" ? "Break" : "Period";
  const label = row.type === "break"
    ? row.label || "Break"
    : `Period ${row.period}`;
  const mins = timeRowDuration(row);
  const range = `${row.start || "—"}–${row.end || "—"}`;
  return `
    <div class="schedule-timeline-slot ${row.type === "break" ? "is-break" : "is-period"}"
      role="listitem"
      data-slot-index="${index}"
      title="${esc(`${kind}: ${label} ${range}${mins ? ` · ${mins} min` : ""}`)}"
      style="left:${left}%;width:${width}%">
      <button type="button" class="schedule-timeline-handle" data-resize-slot="${index}" data-resize-edge="start" aria-label="Adjust start of ${esc(label)}"></button>
      <div class="schedule-timeline-slot-body">
        ${row.type === "break"
          ? `<input class="schedule-timeline-label-input" data-slot-label="${index}" value="${esc(row.label || "Break")}" aria-label="Break name">`
          : `<span class="schedule-timeline-label">${esc(`P${row.period}`)}</span>`}
      </div>
      <button type="button" class="map-icon-btn danger schedule-timeline-remove" data-remove-slot="${index}" title="Remove ${esc(label)}" aria-label="Remove ${esc(label)}">${ICON.close}</button>
      <button type="button" class="schedule-timeline-handle" data-resize-slot="${index}" data-resize-edge="end" aria-label="Adjust end of ${esc(label)}"></button>
    </div>
  `;
}

function bindTimingSetup() {
  bindChrome();
  app.querySelectorAll("[data-action]").forEach((button) => {
    button.onclick = () => runAction(button.dataset.action);
  });
  app.querySelectorAll("#setup-days input").forEach((input) => {
    input.onchange = () => {
      saveTimingSetup();
      refreshLoadSummary();
    };
  });
  app.querySelectorAll("[data-load-column] [data-periods-week]").forEach((input) => {
    input.oninput = () => {
      saveSubjectLoad({ persist: false });
      refreshLoadSummary();
    };
    input.onchange = () => {
      saveSubjectLoad();
      refreshLoadSummary();
    };
  });
  app.querySelectorAll("[data-load-column] [data-allow-repeat]").forEach((input) => {
    input.onchange = () => saveSubjectLoad();
  });
  app.querySelector("[data-action='add-period']")?.addEventListener("click", () => {
    try {
      applyTimingSetup(insertTimeSlot(currentTimeRows(), "period"));
      render();
    } catch (error) {
      toast(error.message, "error");
    }
  });
  app.querySelector("[data-action='add-break']")?.addEventListener("click", () => {
    try {
      applyTimingSetup(insertTimeSlot(currentTimeRows(), "break"));
      render();
    } catch (error) {
      toast(error.message, "error");
    }
  });
  app.querySelectorAll("[data-remove-slot]").forEach((button) => {
    button.onclick = () => {
      try {
        applyTimingSetup(removeTimeSlot(currentTimeRows(), Number(button.dataset.removeSlot)));
        render();
      } catch (error) {
        toast(error.message, "error");
      }
    };
  });
  app.querySelectorAll("[data-slot-label]").forEach((input) => {
    input.onchange = () => {
      applyTimingSetup(updateTimeSlotLabel(currentTimeRows(), Number(input.dataset.slotLabel), input.value));
      render();
    };
  });
  app.querySelectorAll("[data-resize-slot]").forEach((handle) => {
    handle.onpointerdown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      timelineDrag = {
        index: Number(handle.dataset.resizeSlot),
        edge: handle.dataset.resizeEdge,
      };
      document.body.classList.add("is-resizing-timeline");
      handle.closest(".schedule-timeline-slot")?.classList.add("is-resizing");
      try { handle.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    };
  });
}

function currentTimeRows() {
  return normalizeSchedule(project).setup.timeRows || [];
}

function applyTimingSetup(timeRows, { persist = true } = {}) {
  const synced = syncSetupFromTimeRows(timeRows);
  const current = normalizeSchedule(project).setup;
  const workingDays = [...app.querySelectorAll("#setup-days input:checked")].map((input) => input.value);
  project.schedule.setup = {
    ...current,
    workingDays: workingDays.length ? workingDays : current.workingDays,
    ...synced,
  };
  if (!project.schedule.setup.workingDays.length) project.schedule.setup.workingDays = [...WEEK_DAYS];
  normalizeSchedule(project);
  if (persist) save();
}

function saveTimingSetup() {
  applyTimingSetup(currentTimeRows());
}

function saveSubjectLoad({ persist = true } = {}) {
  app.querySelectorAll("[data-load-column]").forEach((row) => {
    const column = project.columns.find((item) => item.id === row.dataset.loadColumn);
    if (!column || !isLoadColumn(column)) return;
    const parsed = parsePeriodsPerWeek(row.querySelector("[data-periods-week]")?.value);
    if (parsed == null) delete column.periodsPerWeek;
    else column.periodsPerWeek = parsed;
    column.allowSameDayRepeat = Boolean(row.querySelector("[data-allow-repeat]")?.checked);
  });
  if (persist) save();
}

function applyTimelineDrag(clientX) {
  if (!timelineDrag) return;
  const bar = app.querySelector(".schedule-timeline-bar");
  if (!bar) return;
  const next = resizeTimeSlot(
    currentTimeRows(),
    timelineDrag.index,
    timelineDrag.edge,
    minutesFromBar(clientX, bar.getBoundingClientRect()),
  );
  applyTimingSetup(next, { persist: false });
  const setup = project.schedule.setup;
  const span = TIMELINE.endMinutes - TIMELINE.startMinutes;
  app.querySelectorAll(".schedule-timeline-slot").forEach((el) => {
    const index = Number(el.dataset.slotIndex);
    const row = setup.timeRows[index];
    if (!row) return;
    const start = timeToMinutes(row.start) ?? TIMELINE.startMinutes;
    const end = timeToMinutes(row.end) ?? start + TIMELINE.minDuration;
    el.style.left = `${((start - TIMELINE.startMinutes) / span) * 100}%`;
    el.style.width = `${(Math.max(5, end - start) / span) * 100}%`;
    const kind = row.type === "break" ? "Break" : "Period";
    const label = row.type === "break" ? (row.label || "Break") : `Period ${row.period}`;
    const mins = timeRowDuration(row);
    el.title = `${kind}: ${label} ${row.start || "—"}–${row.end || "—"}${mins ? ` · ${mins} min` : ""}`;
    const minsEl = el.querySelector(".schedule-timeline-mins");
    if (minsEl) minsEl.textContent = `${mins}m`;
  });
  const legend = app.querySelector(".schedule-timeline-legend");
  if (legend) {
    legend.innerHTML = setup.timeRows.map((row) => timelineLegendItem(row)).join("");
  }
}

function syncScheduleView(workingDays) {
  const days = workingDays.filter((day) => WEEK_DAYS.includes(day));
  if (!days.includes(scheduleDay)) scheduleDay = days[0] || "Monday";
  schedulePickedDays = schedulePickedDays.filter((day) => days.includes(day));
  if (!schedulePickedDays.length) schedulePickedDays = scheduleDay ? [scheduleDay] : [...days];
  if (scheduleViewMode === "some" && !schedulePickedDays.includes(scheduleDay)) {
    scheduleDay = schedulePickedDays[0] || days[0] || "Monday";
  }
}

function visibleGridDays(workingDays) {
  if (scheduleViewMode === "one") {
    return workingDays.filter((day) => day === scheduleDay);
  }
  if (scheduleViewMode === "some") {
    const picked = workingDays.filter((day) => schedulePickedDays.includes(day));
    return picked.length ? picked : workingDays.filter((day) => day === scheduleDay);
  }
  return workingDays;
}

function setScheduleViewMode(mode, workingDays) {
  if (mode === "some") {
    schedulePickedDays = scheduleViewMode === "all"
      ? [...workingDays]
      : (schedulePickedDays.length ? schedulePickedDays : [scheduleDay]);
    if (!schedulePickedDays.includes(scheduleDay)) schedulePickedDays = [...schedulePickedDays, scheduleDay];
  }
  scheduleViewMode = mode;
}

function renderSchedule() {
  const schedule = normalizeSchedule(project);
  const setup = schedule.setup;
  if (!project.rows.some((row) => row.id === scheduleRowId)) scheduleRowId = project.rows[0]?.id || null;
  syncScheduleView(setup.workingDays);
  const gridDays = visibleGridDays(setup.workingDays);
  const selectedRow = project.rows.find((row) => row.id === scheduleRowId);
  const staffGroups = sectionStaffGroups(project, scheduleRowId);
  const columns = scheduleGridColumns(setup);
  const colTemplate = scheduleColumnTemplate(columns);
  const query = scheduleSearch.trim().toLowerCase();
  const filtered = query
    ? staffGroups.filter((group) => (
      group.staff.toLowerCase().includes(query)
      || group.assignments.some((assignment) => (
        assignment.title.toLowerCase().includes(query)
        || assignment.role.toLowerCase().includes(query)
      ))
    ))
    : staffGroups;
  const visible = filtered.slice(0, scheduleVisibleCount);
  const hiddenCount = Math.max(0, filtered.length - scheduleVisibleCount);
  const viewModes = [
    { id: "one", label: "One day" },
    { id: "some", label: "Specific days" },
    { id: "all", label: "All days" },
  ];

  app.innerHTML = `
    <div class="map-page">
      <div class="map-shell">
        ${renderAppChrome("schedule")}

        <main class="schedule-page" aria-label="Timetable scheduler">
          <section class="schedule-controls">
            <label>
              <span>Section</span>
              <select id="schedule-section">
                ${project.rows.map((row) => `<option value="${row.id}" ${row.id === scheduleRowId ? "selected" : ""}>${esc(sectionLabel(row))}</option>`).join("")}
              </select>
            </label>
            <div class="schedule-view-toggle" role="radiogroup" aria-label="Days to show in the timetable">
              ${viewModes.map((mode) => `
                <button type="button" role="radio" aria-checked="${scheduleViewMode === mode.id ? "true" : "false"}"
                  class="${scheduleViewMode === mode.id ? "active" : ""}" data-view-mode="${mode.id}">${mode.label}</button>
              `).join("")}
            </div>
            <div class="schedule-day-tabs" role="${scheduleViewMode === "some" ? "group" : "tablist"}" aria-label="${scheduleViewMode === "some" ? "Days to include" : "Weekday"}">
              ${setup.workingDays.map((day) => {
                const picked = scheduleViewMode !== "some" || schedulePickedDays.includes(day);
                const focused = day === scheduleDay;
                const canHide = scheduleViewMode === "some" && schedulePickedDays.length > 1 && picked;
                const pressed = scheduleViewMode === "some" ? ` aria-pressed="${picked}"` : ` aria-selected="${focused}"`;
                return `<button type="button"
                  class="${focused ? "active" : ""} ${scheduleViewMode === "some" && picked ? "picked" : ""} ${scheduleViewMode === "some" && !picked ? "is-off" : ""}"
                  data-schedule-day="${day}"${pressed}>${esc(day)}${canHide ? `<span class="schedule-day-unpick" data-unpick-day="${day}" title="Hide ${esc(day)}" aria-label="Hide ${esc(day)}">${ICON.close}</span>` : ""}</button>`;
              }).join("")}
            </div>
            <span class="schedule-period-badge">${setup.periodsPerDay} period${setup.periodsPerDay === 1 ? "" : "s"} per day</span>
          </section>

          <section class="schedule-planner">
            <section class="schedule-availability-panel" aria-label="Faculty availability for ${esc(scheduleDay)}">
              <div class="schedule-card-head">
                <h2>${esc(scheduleDay)} availability</h2>
                <p>Subject is listed first, with the faculty name underneath. Drag a green period box onto ${esc(scheduleDay)} in the grid, or click it to mark that period busy.</p>
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
                  ${visible.map((group) => renderStaffAvailability(group, columns, selectedRow)).join("")}
                </div>
                ${hiddenCount ? `<button type="button" class="btn btn--secondary btn--sm schedule-show-more" data-action="show-more-availability">Show ${Math.min(7, hiddenCount)} more</button>` : ""}
              ` : `<p class="schedule-empty">${staffGroups.length ? "No faculty match your search." : "No mapped staff for this section."}</p>`}
            </section>

            <section class="schedule-grid-card" aria-label="Timetable grid">
              <div class="schedule-card-head">
                <h2>${esc(selectedRow ? sectionLabel(selectedRow) : "Section timetable")}</h2>
                <p>${gridDays.length === 1 ? "Click the × on a filled cell, or click this section’s chip in the availability row, to release that period." : `Showing ${gridDays.length} days. Drag onto the highlighted ${esc(scheduleDay)} row. Click the × on a filled cell, or this section’s availability chip, to release a period.`}</p>
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
                    ${gridDays.map((day) => renderScheduleDayRow(day, columns, scheduleRowId)).join("")}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        </main>

        ${renderFooter("schedule")}
      </div>
    </div>

    ${renderBackFab("schedule")}
    ${renderFab("schedule")}
    ${subjectChoice ? renderSubjectChoice() : ""}
  `;
  bindSchedule();
}

function renderStaffAvailability(group, columns, selectedRow) {
  const colTemplate = scheduleColumnTemplate(columns);
  const multi = group.assignments.length > 1;
  return `
    <div class="schedule-availability-row">
      <div class="schedule-staff-card-meta">
        <div class="schedule-staff-subjects">
          ${group.assignments.map((assignment) => {
            const loadColumn = project.columns.find((item) => item.id === assignment.columnId);
            const quota = parsePeriodsPerWeek(loadColumn?.periodsPerWeek);
            const used = loadColumn && selectedRow
              ? countColumnPeriods(project, selectedRow.id, loadColumn.id)
              : null;
            const loadCue = quota != null && used != null
              ? `<span class="schedule-staff-load">${used} / ${quota}</span>`
              : "";
            return `
            <span class="schedule-staff-subject"><b>${esc(assignment.title)}</b><em>${esc(assignment.role)}</em>${loadCue}</span>`;
          }).join("")}
        </div>
        <span class="schedule-staff-name">${esc(group.staff)}</span>
        ${multi ? `<span class="schedule-staff-multi">${group.assignments.length} subjects · choose on drop</span>` : ""}
      </div>
      <div class="schedule-period-boxes" style="grid-template-columns:${colTemplate}">
        ${columns.map((column) => renderAvailabilityColumn(group, selectedRow, column)).join("")}
      </div>
    </div>
  `;
}

function renderAvailabilityColumn(group, selectedRow, column) {
  if (column.type === "break") {
    return `<span class="schedule-period-spacer" aria-hidden="true"></span>`;
  }
  return renderAvailabilityBox(group, selectedRow, column.period);
}

function renderAvailabilityBox(group, selectedRow, period) {
  const placement = staffPeriodPlacement(project, group.staff, scheduleDay, period);
  const busy = isStaffBusy(project, group.staff, scheduleDay, period);
  if (placement) {
    const chip = esc(placement.section || placement.sectionId);
    const title = `${placement.section} · ${placement.slot.title || ""} · ${placement.slot.role || ""}`.trim();
    const isCurrent = selectedRow && placement.rowId === selectedRow.id;
    if (isCurrent) {
      return `<button type="button" class="schedule-period-box assigned" data-release-period="${period}"
        title="In ${chip}. Click to release." aria-label="P${period} in ${chip}. Click to release.">${chip}</button>`;
    }
    return `<span class="schedule-period-box booked" title="${esc(title)}" aria-label="P${period} in ${chip}">${chip}</span>`;
  }
  if (busy) {
    return `<button type="button" class="schedule-period-box busy" data-toggle-busy="${esc(group.staff)}" data-period="${period}" title="Marked busy. Click to make available." aria-label="P${period} busy">Busy</button>`;
  }
  return `<button type="button" class="schedule-period-box available" draggable="true"
    data-drag-assignment="1"
    data-staff="${esc(group.staff)}"
    data-period="${period}"
    data-toggle-busy="${esc(group.staff)}"
    title="Drag to schedule, or click to mark busy"
    aria-label="P${period} available">P${period}</button>`;
}

function renderSubjectChoice() {
  const { staff, period, day, options } = subjectChoice;
  return `<div class="schedule-choice-backdrop" data-cancel-choice="1"></div>
    <div class="schedule-choice" role="dialog" aria-modal="true" aria-labelledby="subject-choice-title">
      <h2 id="subject-choice-title">Which subject for ${esc(staff)}?</h2>
      <p>${esc(day)} · P${period}. This faculty member holds ${options.length} subjects in this section.</p>
      <div class="schedule-choice-options">
        ${options.map((option, index) => `
          <button type="button" data-choose-subject="${index}">
            <strong>${esc(option.title)}</strong>
            <span>${esc(option.role)}</span>
          </button>
        `).join("")}
      </div>
      <div class="schedule-choice-actions">
        <button type="button" class="btn btn--secondary btn--sm" data-cancel-choice="1">Cancel</button>
      </div>
    </div>`;
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
          <button type="button" class="map-icon-btn danger schedule-slot-clear" data-clear-slot="1" title="Release this period" aria-label="Release this period">${ICON.close}</button>
          <strong>${esc(slot.title)}</strong>
          <span>${esc(slot.staff)}</span>
          <em>${esc(slot.role)}</em>
          ${slot.support?.staff ? `<div class="schedule-slot-support">
            <span>${esc(slot.support.staff)} · ${esc(slot.support.role)}</span>
            <button type="button" class="map-icon-btn danger" data-remove-support="1" title="Remove supporting staff" aria-label="Remove supporting staff">${ICON.close}</button>
          </div>` : ""}
        </div>` : `<span class="schedule-drop-hint">Drop</span>`}
      </td>`;
    }).join("")}
  </tr>`;
}

function bindSchedule() {
  bindChrome();
  app.querySelectorAll("[data-action]").forEach((button) => {
    button.onclick = () => runAction(button.dataset.action);
  });
  app.querySelector("#schedule-section").onchange = (event) => {
    scheduleRowId = event.target.value;
    scheduleVisibleCount = 7;
    render();
  };
  app.querySelectorAll("[data-view-mode]").forEach((button) => {
    button.onclick = () => {
      const workingDays = normalizeSchedule(project).setup.workingDays;
      setScheduleViewMode(button.dataset.viewMode, workingDays);
      render();
    };
  });
  app.querySelectorAll("[data-unpick-day]").forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const day = button.dataset.unpickDay;
      if (schedulePickedDays.length <= 1) return;
      schedulePickedDays = schedulePickedDays.filter((item) => item !== day);
      if (scheduleDay === day) scheduleDay = schedulePickedDays[0];
      render();
    };
  });
  app.querySelectorAll("[data-schedule-day]").forEach((button) => {
    button.onclick = (event) => {
      if (event.target.closest("[data-unpick-day]")) return;
      const day = button.dataset.scheduleDay;
      if (scheduleViewMode === "some" && !schedulePickedDays.includes(day)) {
        schedulePickedDays = [...schedulePickedDays, day];
      }
      scheduleDay = day;
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
  app.querySelectorAll("[data-release-period]").forEach((button) => {
    button.onclick = () => {
      if (!scheduleRowId) return;
      clearSlot(project, scheduleRowId, scheduleDay, button.dataset.releasePeriod);
      save();
      render();
    };
  });
  app.querySelectorAll("[data-drag-assignment]").forEach((button) => {
    button.addEventListener("dragstart", (event) => {
      scheduleDragActive = true;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/json", JSON.stringify({
        type: "staff",
        staff: button.dataset.staff,
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
      if (event.target.closest("button")) {
        event.preventDefault();
        return;
      }
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
    cell.addEventListener("dblclick", (event) => {
      if (event.target.closest("button")) return;
      clearSlot(project, cell.dataset.dropRow, cell.dataset.dropDay, cell.dataset.dropPeriod);
      save();
      render();
    });
  });
  app.querySelectorAll("[data-clear-slot]").forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const cell = button.closest("[data-drop-row]");
      if (!cell) return;
      clearSlot(project, cell.dataset.dropRow, cell.dataset.dropDay, cell.dataset.dropPeriod);
      save();
      render();
    };
  });
  app.querySelectorAll("[data-remove-support]").forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const cell = button.closest("[data-drop-row]");
      if (!cell) return;
      const slot = getSlot(project, cell.dataset.dropRow, cell.dataset.dropDay, cell.dataset.dropPeriod);
      if (!slot) return;
      setSlot(project, cell.dataset.dropRow, cell.dataset.dropDay, cell.dataset.dropPeriod, {
        ...slot,
        support: null,
      });
      save();
      render();
    };
  });
  app.querySelectorAll("[data-cancel-choice]").forEach((element) => {
    element.onclick = () => {
      subjectChoice = null;
      render();
    };
  });
  app.querySelectorAll("[data-choose-subject]").forEach((button) => {
    button.onclick = () => {
      const option = subjectChoice?.options[Number(button.dataset.chooseSubject)];
      if (!option) return;
      if (!placeAssignment(subjectChoice.rowId, subjectChoice.day, subjectChoice.period, option)) return;
      subjectChoice = null;
      save();
      render();
    };
  });
}

function placeAssignment(rowId, day, period, assignment, options = {}) {
  const issue = columnLoadIssue(project, rowId, day, assignment, options.exclude || null);
  if (issue) {
    toast(issue, "error");
    return false;
  }
  const payload = assignmentRecord(assignment);
  if (options.attachSupport === false) {
    payload.support = assignment.support?.staff ? assignmentRecord(assignment.support) : null;
  } else if (assignment.kind !== "support") {
    const support = linkedSupportAssignment(project, rowId, assignment);
    if (support) {
      if (isStaffBusy(project, support.staff, day, period)) {
        toast(`${support.staff} is marked busy, so supporting staff was not added.`, "error");
      } else {
        const booked = staffBooking(project, support.staff, day, period, rowId);
        if (booked) {
          toast(`${support.staff} is already in ${booked.section}, so supporting staff was not added.`, "error");
        } else {
          payload.support = support;
        }
      }
    }
  }
  setSlot(project, rowId, day, period, payload);
  return true;
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
  const staff = data.type === "move" ? data.assignment?.staff : data.staff;
  if (!staff) return;
  if (day !== scheduleDay) {
    toast(`Drop on the selected day (${scheduleDay}) or switch to ${day}.`, "error");
    return;
  }
  if (data.type === "staff" && data.period !== period) {
    toast(`Drop the P${data.period} box into a P${data.period} timetable cell.`, "error");
    return;
  }
  const existing = getSlot(project, rowId, day, period);
  if (existing && data.type === "staff") {
    toast("This cell is already filled.", "error");
    return;
  }
  if (isStaffBusy(project, staff, day, period)) {
    toast(`${staff} is marked busy for ${day} P${period}.`, "error");
    return;
  }
  const booked = staffBooking(project, staff, day, period, rowId);
  if (booked) {
    toast(`${staff} is already assigned to ${booked.section} for ${day} P${period}.`, "error");
    return;
  }
  if (data.type === "move") {
    const placed = placeAssignment(rowId, day, period, data.assignment, {
      attachSupport: false,
      exclude: {
        rowId: data.fromRowId,
        day: data.fromDay,
        period: data.fromPeriod,
      },
    });
    if (!placed) return;
    if (!(data.fromRowId === rowId && data.fromDay === day && Number(data.fromPeriod) === Number(period))) {
      clearSlot(project, data.fromRowId, data.fromDay, data.fromPeriod);
    }
    save();
    render();
    return;
  }

  const options = staffOptionsFor(project, rowId, staff);
  if (!options.length) {
    toast(`${staff} is not mapped to this section.`, "error");
    return;
  }
  if (options.length === 1) {
    if (!placeAssignment(rowId, day, period, options[0])) return;
    save();
    render();
    return;
  }
  subjectChoice = { rowId, day, period, staff, options };
  render();
}

function dismissIntro() {
  markIntroSeen();
  view = "mapping";
  render();
}

function renderStart() {
  app.innerHTML = `
    <div class="map-page">
      <div class="map-shell">
        <section class="map-intro map-start" aria-labelledby="start-heading">
          <p class="map-intro-eyebrow">Class Timetable</p>
          <h1 id="start-heading">Plan your week</h1>
          <p class="map-intro-lead">Create a new timetable or open one saved in this browser.</p>
          <div class="map-intro-actions">
            <button type="button" class="btn btn--primary" data-action="create-new-timetable">Create new timetable</button>
            <button type="button" class="btn btn--secondary" data-action="open-projects">Open saved timetable</button>
          </div>
        </section>
      </div>
    </div>
  `;
  app.querySelectorAll("[data-action]").forEach((button) => {
    button.onclick = () => runAction(button.dataset.action);
  });
}

function renderIntro() {
  app.innerHTML = `
    <div class="map-page">
      <div class="map-shell">
        <section class="map-intro" aria-labelledby="intro-heading">
          <p class="map-intro-eyebrow">Class Timetable</p>
          <h1 id="intro-heading">Three stages to a finished timetable</h1>
          <p class="map-intro-lead">Plan who teaches what, schedule the week, then export printable copies. Work stays in this browser until you export.</p>
          <div class="map-intro-grid">
            ${STAGES.map((stage) => `
              <article class="map-intro-card">
                <span class="map-intro-num">${stage.number}</span>
                <h2>${esc(stage.label)}</h2>
                <p>${esc(stage.description)}</p>
              </article>
            `).join("")}
          </div>
          <div class="map-intro-actions">
            <button type="button" class="btn btn--primary" data-action="start-planning">Start planning</button>
          </div>
        </section>
      </div>
    </div>
  `;
  app.querySelectorAll("[data-action]").forEach((button) => {
    button.onclick = () => runAction(button.dataset.action);
  });
}

function renderProjects() {
  app.innerHTML = `
    <div class="map-page">
      <div class="map-shell">
        ${renderAppChrome("projects")}
        <main class="map-projects-page" aria-label="Saved projects">
          <div class="map-projects-head">
            <h2>Saved projects</h2>
            <p class="map-projects-note">Projects are stored in this browser only.</p>
          </div>
          <div class="map-saved-list">
            ${renderSavedProjectsList()}
          </div>
          <button type="button" class="btn btn--secondary btn--sm" data-action="back-to-mapping">Back to timetable</button>
        </main>
        ${renderFooter("projects")}
      </div>
    </div>
  `;
  bindChrome();
  bindSavedProjects();
  app.querySelectorAll("[data-action]").forEach((button) => {
    button.onclick = () => runAction(button.dataset.action);
  });
}

function exportDisabled(ok, reason) {
  return ok ? "" : `disabled title="${esc(reason)}"`;
}

function renderExport() {
  const state = stageState(project, "export");
  const stats = state.stats;
  const faculty = facultyTimetables(project);
  const mappingReady = project.rows.length > 0;
  const summaryReady = facultySummaryRows(project).length > 0;
  const hasSlots = stats.placedPeriods > 0;
  const selectedFaculty = faculty.find((entry) => entry.staff === exportStaffName);
  if (exportStaffName !== "all" && !selectedFaculty) exportStaffName = "all";
  if (exportSectionId !== "all" && !project.rows.some((row) => row.id === exportSectionId)) {
    exportSectionId = "all";
  }

  app.innerHTML = `
    <div class="map-page">
      <div class="map-shell">
        ${renderAppChrome("export")}

        <main class="map-export" aria-label="Export timetables">
          <section class="schedule-card map-export-stats">
            <div class="schedule-card-head">
              <h2>Ready to share</h2>
              <p>${stats.placedPeriods} of ${stats.totalSlots || 0} periods placed · ${stats.sectionCount} section${stats.sectionCount === 1 ? "" : "s"} · ${stats.facultyCount} faculty on the grid</p>
            </div>
          </section>

          <div class="map-export-grid">
            <article class="schedule-card">
              <div class="schedule-card-head">
                <h2>Section timetables</h2>
                <p>One printable page per class section, including breaks.</p>
              </div>
              <label class="map-export-scope">
                <span>Scope</span>
                <select id="export-section">
                  <option value="all" ${exportSectionId === "all" ? "selected" : ""}>All sections</option>
                  ${project.rows.map((row) => `<option value="${row.id}" ${exportSectionId === row.id ? "selected" : ""}>${esc(sectionLabel(row))}</option>`).join("")}
                </select>
              </label>
              <button type="button" class="btn btn--primary btn--sm" data-action="export-sections" ${exportDisabled(hasSlots, "Place at least one period on the schedule first.")}>Print section timetables</button>
            </article>

            <article class="schedule-card">
              <div class="schedule-card-head">
                <h2>Faculty timetables</h2>
                <p>One printable page per staff member with their assigned periods.</p>
              </div>
              <label class="map-export-scope">
                <span>Scope</span>
                <select id="export-staff">
                  <option value="all" ${exportStaffName === "all" ? "selected" : ""}>All faculty</option>
                  ${faculty.map((entry) => `<option value="${esc(entry.staff)}" ${exportStaffName === entry.staff ? "selected" : ""}>${esc(entry.staff)}</option>`).join("")}
                </select>
              </label>
              <button type="button" class="btn btn--primary btn--sm" data-action="export-faculty" ${exportDisabled(hasSlots, "Place at least one period on the schedule first.")}>Print faculty timetables</button>
            </article>

            <article class="schedule-card">
              <div class="schedule-card-head">
                <h2>Mapping table</h2>
                <p>The Plan-stage grid of sections, subjects, labs, and staff.</p>
              </div>
              <button type="button" class="btn btn--secondary btn--sm" data-action="export-pdf" ${exportDisabled(mappingReady, "Add at least one section first.")}>Print mapping table</button>
            </article>

            <article class="schedule-card">
              <div class="schedule-card-head">
                <h2>Faculty summary</h2>
                <p>Flat assignment list with search, filters, and sortable columns.</p>
              </div>
              <button type="button" class="btn btn--secondary btn--sm" data-action="export-summary-pdf" ${exportDisabled(summaryReady, "Add staff assignments first.")}>Print faculty summary</button>
            </article>

            <article class="schedule-card">
              <div class="schedule-card-head">
                <h2>Project backup</h2>
                <p>JSON stays in this browser until you export. Import a file to restore a copy.</p>
              </div>
              <div class="map-export-file-actions">
                <button type="button" class="btn btn--secondary btn--sm" data-action="export">Export JSON</button>
                <button type="button" class="btn btn--secondary btn--sm" data-action="import">Import JSON</button>
              </div>
            </article>
          </div>
        </main>

        ${renderFooter("export")}
      </div>
    </div>

    ${renderBackFab("export")}
  `;
  bindExport();
}

function bindImportInput() {
  const importInput = app.querySelector("#import-mapping-file");
  if (!importInput) return;
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
      closeAppMenu();
      save();
      toast(`Imported “${project.name}”.`);
      render();
    } catch (error) {
      toast(error.message || "Import failed.", "error");
    }
  };
}

function bindExport() {
  bindChrome();
  app.querySelectorAll("[data-action]").forEach((button) => {
    button.onclick = () => runAction(button.dataset.action);
  });
  const sectionSelect = app.querySelector("#export-section");
  if (sectionSelect) {
    sectionSelect.onchange = () => {
      exportSectionId = sectionSelect.value;
    };
  }
  const staffSelect = app.querySelector("#export-staff");
  if (staffSelect) {
    staffSelect.onchange = () => {
      exportStaffName = staffSelect.value;
    };
  }
}

function renderMenu() {
  const fromColumn = project.columns.find((item) => item.id === menu?.columnId);
  if (!fromColumn) return "";
  const mode = menu.mode || "add";
  const canSupport = isMappingColumn(fromColumn);
  const canRename = isMappingColumn(fromColumn);
  const canDelete = isMappingColumn(fromColumn);
  const canAdd = isMappingColumn(fromColumn) || fromColumn.kind === "sectionName";
  const addOptions = `
    <button type="button" role="menuitem" data-menu="subject">Add new subject</button>
    <button type="button" role="menuitem" data-menu="lab">Add lab</button>
    ${canSupport ? `<button type="button" role="menuitem" data-menu="support">Add supporting staff for this subject/lab</button>` : ""}
    ${canSupport && fromColumn.kind === "subject" ? `<button type="button" role="menuitem" data-menu="lab-linked">Add lab for this subject</button>` : ""}
  `;

  if (mode === "actions") {
    const addOpen = menu.submenu === "add";
    const flipSubmenu = addOpen && menu.x > window.innerWidth - 520;
    return `<div class="map-menu-backdrop" data-close-menu="1"></div>
      <div class="map-menu" style="left:${menu.x}px;top:${menu.y}px" role="menu" aria-label="Column actions">
        ${canRename ? `<button type="button" role="menuitem" data-col-action="rename">Rename column</button>` : ""}
        ${canAdd ? `
          <div class="map-menu-item-wrap ${addOpen ? "is-open" : ""} ${flipSubmenu ? "is-flip" : ""}">
            <button type="button" role="menuitem" class="map-menu-item-has-sub" data-col-action="add" aria-haspopup="menu" aria-expanded="${addOpen ? "true" : "false"}">
              <span>Add column</span>
              <span class="map-menu-item-chevron" aria-hidden="true">${ICON.chevron}</span>
            </button>
            ${addOpen ? `<div class="map-menu-submenu" role="menu" aria-label="Add column">${addOptions}</div>` : ""}
          </div>
        ` : ""}
        ${canDelete ? `<button type="button" role="menuitem" class="is-danger" data-col-action="delete">Delete column</button>` : ""}
      </div>`;
  }

  return `<div class="map-menu-backdrop" data-close-menu="1"></div>
    <div class="map-menu" style="left:${menu.x}px;top:${menu.y}px" role="menu" aria-label="Add column">
      ${addOptions}
    </div>`;
}

function bind() {
  bindChrome();

  app.querySelectorAll("[data-action]").forEach((button) => {
    button.onclick = () => runAction(button.dataset.action);
  });

  app.querySelectorAll("[data-col-menu]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      const column = project.columns.find((item) => item.id === button.dataset.colMenu);
      if (!column) return;
      const rect = button.getBoundingClientRect();
      menu = {
        columnId: column.id,
        mode: "actions",
        submenu: null,
        x: Math.min(rect.right - 200, window.innerWidth - 220),
        y: rect.bottom + 6,
      };
      render();
    };
  });

  app.querySelectorAll("[data-col-action]").forEach((button) => {
    button.onclick = () => {
      const fromColumn = project.columns.find((item) => item.id === menu?.columnId);
      const action = button.dataset.colAction;
      if (!fromColumn) {
        closeMenu();
        render();
        return;
      }
      if (action === "rename") {
        renameColumnId = fromColumn.id;
        closeMenu();
        render();
        return;
      }
      if (action === "add") {
        menu = {
          ...menu,
          mode: "actions",
          submenu: menu.submenu === "add" ? null : "add",
        };
        render();
        return;
      }
      if (action === "delete") {
        closeMenu();
        if (!confirm(`Delete column "${columnHeader(fromColumn)}"?`)) {
          render();
          return;
        }
        try {
          deleteColumn(project, fromColumn.id);
          save();
          render();
        } catch (error) {
          toast(error.message, "error");
          render();
        }
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
      renameColumnId = null;
      if (!ok) {
        el.textContent = columnDisplayTitle(column);
        render();
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
        renameColumnId = null;
        if (column) el.textContent = columnDisplayTitle(column);
        el.blur();
      }
    });
  });

  if (renameColumnId) {
    const renameEl = app.querySelector(`[data-rename="${renameColumnId}"]`);
    if (renameEl) {
      renameEl.focus();
      const range = document.createRange();
      range.selectNodeContents(renameEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

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
  closeAppMenu();
  document.querySelector(".map-app-menu-backdrop")?.remove();
  if (name === "show-intro") {
    view = "intro";
    render();
    return;
  }
  if (name === "start-planning") {
    dismissIntro();
    return;
  }
  if (name === "create-new-timetable") {
    markIntroSeen();
    project = createProject();
    save();
    scheduleRowId = project.rows[0]?.id || null;
    selected = null;
    closeMenu();
    view = "mapping";
    render();
    return;
  }
  if (name === "open-projects") {
    selected = null;
    closeMenu();
    view = "projects";
    render();
    return;
  }
  if (name === "back-to-mapping") {
    view = "mapping";
    render();
    return;
  }
  if (name === "edit-timings") {
    view = "timingSetup";
    render();
    return;
  }
  if (name === "open-schedule") {
    openScheduleFromSetup();
    return;
  }
  if (name === "goto-export") {
    goToStage("export");
    return;
  }
  if (name === "back-to-schedule") {
    goToStage("schedule");
    return;
  }
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
  if (name === "export-sections") {
    try {
      const filename = exportSectionTimetablesPdf(project, {
        rowId: exportSectionId === "all" ? null : exportSectionId,
      });
      toast(`Print dialog opened for ${filename}.`);
    } catch (error) {
      toast(error.message || "Could not export section timetables.", "error");
    }
  }
  if (name === "export-faculty") {
    try {
      const filename = exportFacultyTimetablesPdf(project, {
        staff: exportStaffName === "all" ? null : exportStaffName,
      });
      toast(`Print dialog opened for ${filename}.`);
    } catch (error) {
      toast(error.message || "Could not export faculty timetables.", "error");
    }
  }
  if (name === "export-summary-pdf") {
    try {
      const rows = view === "summary" ? visibleSummaryRows() : facultySummaryRows(project);
      const filename = exportFacultySummaryPdf(project, rows);
      toast(`Print dialog opened for ${filename}.`);
    } catch (error) {
      toast(error.message || "Could not export the faculty summary.", "error");
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
      toast("Fill every mapping cell before scheduling.", "error");
      alert(`Fill every mapping cell before scheduling:\n\n${issues.slice(0, 12).join("\n")}${issues.length > 12 ? `\n...and ${issues.length - 12} more.` : ""}`);
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
  if (timelineDrag) {
    applyTimelineDrag(event.clientX);
    return;
  }
  if (!rowDrag) return;
  updateRowDragOver(event.clientX, event.clientY);
});

document.addEventListener("pointerup", () => {
  if (timelineDrag) {
    document.body.classList.remove("is-resizing-timeline");
    timelineDrag = null;
    save();
    render();
    return;
  }
  if (rowDrag) finishRowDrag();
});

document.addEventListener("pointercancel", () => {
  if (timelineDrag) {
    document.body.classList.remove("is-resizing-timeline");
    timelineDrag = null;
    save();
  }
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
  if (event.key === "Escape" && subjectChoice) {
    subjectChoice = null;
    render();
  }
});

render();
