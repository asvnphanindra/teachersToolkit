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
  isMappingColumn,
  mappingIssues,
  moveRow,
  renameMappingColumn,
} from "./models.js";
import {
  deleteProject,
  ensureActiveProject,
  exportProjectJson,
  listProjects,
  loadProject,
  saveProject,
} from "./storage.js";

const app = document.querySelector("#app");
let project = ensureActiveProject();
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

function render() {
  const issues = mappingIssues(project);
  const projects = listProjects();
  const tableWidth = ACTION_WIDTH + GRIP_WIDTH
    + project.columns.reduce((sum, column) => sum + (column.width || 150), 0);
  const rowCount = project.rows.length;
  const colCount = project.columns.length;
  const layout = frozenLayout(project.columns);
  const groups = mappingGroupMeta(project.columns);
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
            <button type="button" class="btn btn--secondary btn--sm" data-action="add-rows">+ Rows</button>
            <button type="button" class="btn btn--secondary btn--sm" data-action="export">Export</button>
            <button type="button" class="btn btn--secondary btn--sm" data-action="new-project">New</button>
          </div>
        </header>

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
                            <input value="${esc(row.cells[column.id] || "")}" data-cell-row="${row.id}" data-cell-col="${column.id}" aria-label="${esc(columnHeader(column))} for row ${rowIndex + 1}" placeholder="—" draggable="false">
                            ${focused ? `<span class="map-fill-handle" data-fill-row="${row.id}" data-fill-col="${column.id}" title="Drag to fill"></span>` : ""}
                          </div>
                        </td>`;
                      }).join("")}
                    </tr>
                  `).join("")}
                </tbody>
              </table>
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

  app.querySelectorAll("[data-open]").forEach((button) => {
    button.onclick = () => {
      const next = loadProject(button.dataset.open);
      if (!next) return toast("Could not open that project.", "error");
      project = next;
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
  if (name === "export") exportProjectJson(project);
  if (name === "new-project") {
    if (!confirm("Start a new blank mapping project? Your current project stays saved in this browser.")) return;
    project = createProject();
    save();
    selected = null;
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
});

render();
