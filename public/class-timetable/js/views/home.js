import { createEmptyTimetable } from "../models.js";
import { listTimetables, loadTimetable, saveTimetable, deleteTimetable, duplicateTimetable, exportJson, importJson } from "../storage.js";

export function renderHome(app) {
  const timetables = listTimetables();
  app.el.innerHTML = `
    <div class="tt-app">
      <h1 class="tt-page-title">Class Timetable</h1>
      <p class="tt-page-sub">Create or open a timetable to start planning.</p>
      <div class="tt-card">
        <h3>Create new</h3>
        <div class="tt-inline">
          <div class="tt-form-row">
            <label for="new-name">Timetable name</label>
            <input id="new-name" type="text" placeholder="e.g. 2026 Odd Semester">
          </div>
          <button class="btn btn--primary" id="btn-create">Create</button>
        </div>
      </div>
      <div class="tt-card">
        <div class="tt-toolbar">
          <h3 style="margin:0;flex:1">Your timetables</h3>
          <label class="btn btn--secondary btn--sm" style="cursor:pointer">
            Import JSON <input type="file" id="import-file" accept=".json" hidden>
          </label>
        </div>
        <ul class="tt-list" id="tt-list">
          ${timetables.length ? "" : '<li class="tt-list-item"><span>No timetables yet</span></li>'}
        </ul>
      </div>
    </div>
  `;

  const listEl = app.el.querySelector("#tt-list");
  timetables.forEach((meta) => {
    const li = document.createElement("li");
    li.className = "tt-list-item";
    li.innerHTML = `
      <div>
        <strong>${escapeHtml(meta.name)}</strong>
        <div class="tt-list-item-meta">Updated ${new Date(meta.updatedAt).toLocaleString()}</div>
      </div>
      <div class="tt-actions" style="margin:0">
        <button class="btn btn--primary btn--sm" data-open="${meta.id}">Open</button>
        <button class="btn btn--secondary btn--sm" data-dup="${meta.id}">Duplicate</button>
        <button class="btn btn--danger btn--sm" data-del="${meta.id}">Delete</button>
      </div>
    `;
    listEl.appendChild(li);
  });

  app.el.querySelector("#btn-create").onclick = () => {
    const name = app.el.querySelector("#new-name").value.trim();
    if (!name) return toast("Enter a name");
    const tt = createEmptyTimetable(name);
    saveTimetable(tt);
    app.setTimetable(tt);
    app.navigate("#/setup/timings");
  };

  listEl.onclick = (e) => {
    const open = e.target.dataset.open;
    const dup = e.target.dataset.dup;
    const del = e.target.dataset.del;
    if (open) {
      const tt = loadTimetable(open);
      if (tt) { app.setTimetable(tt); app.navigate("#/planner"); }
    }
    if (dup) {
      const tt = loadTimetable(dup);
      if (tt) { duplicateTimetable(tt); renderHome(app); toast("Duplicated"); }
    }
    if (del && confirm("Delete this timetable?")) {
      deleteTimetable(del);
      renderHome(app);
    }
  };

  app.el.querySelector("#import-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const tt = await importJson(file);
      toast("Imported");
      app.setTimetable(tt);
      app.navigate("#/planner");
    } catch {
      toast("Invalid JSON file");
    }
  };
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "tt-toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

export { toast, escapeHtml };
