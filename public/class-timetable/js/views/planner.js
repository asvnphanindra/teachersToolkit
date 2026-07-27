import { saveTimetable, exportJson } from "../storage.js";
import { getById, getRoomForSection, getSlot, setSlot } from "../models.js";
import { checkAssignment, formatClashMessage, scanAllClashes } from "../clash-detector.js";
import { checkConsecutiveLectures, isFacultyAvailable, isFacultyBooked } from "../constraints.js";
import { getAllAllotments, getFacultySchedule, getRoomSchedule } from "../allotment.js";
import { getPlanningDays, periodHeader, isNonTeachingPeriod, normalizeTimings } from "../timings.js";
import { makeDraggable, makeDropZone } from "../drag-drop.js";
import { toast, escapeHtml } from "./home.js";
import { exportPdf } from "../export/pdf.js";

export function renderPlanner(app) {
  app.tt.timings = normalizeTimings(app.tt.timings);
  let viewMode = "section";
  let sectionId = app.tt.sections[0]?.id;
  let facultyViewId = app.tt.faculty[0]?.id;
  let roomViewId = app.tt.rooms[0]?.id;
  let selectedSubjectId = app.tt.subjects[0]?.id;
  let alertMsg = "";

  function assignSlot(secId, day, period, subjectId, facultyId) {
    alertMsg = "";
    if (!subjectId || !facultyId) {
      setSlot(app.tt, secId, day, period, null);
      saveTimetable(app.tt);
      return;
    }
    const issues = checkAssignment(app.tt, secId, day, period, facultyId);
    if (issues.length) alertMsg = formatClashMessage(issues[0]);
    setSlot(app.tt, secId, day, period, { subjectId, facultyId });
    const cons = checkConsecutiveLectures(app.tt, secId, day);
    if (cons.violated) alertMsg = (alertMsg ? alertMsg + " · " : "") + cons.message;
    saveTimetable(app.tt);
  }

  function render() {
    const clashes = scanAllClashes(app.tt);
    const clashSet = new Set(clashes.map((c) => `${c.sectionId}-${c.day}-${c.period}`));
    const planDays = getPlanningDays(app.tt.timings);
    const scopeLabel = app.tt.timings.planMode === "single-day"
      ? `Single day: ${app.tt.timings.singleDay}`
      : `Week (${planDays.length} days)`;

    app.el.innerHTML = `
      <div class="tt-app">
        <div class="tt-toolbar">
          <button class="btn btn--secondary btn--sm" id="home-btn">&larr; All timetables</button>
          <strong style="flex:1">${escapeHtml(app.tt.name)}</strong>
          <span class="tt-scope-badge">${escapeHtml(scopeLabel)}</span>
          <button class="btn btn--secondary btn--sm" id="setup-btn">Setup</button>
          <button class="btn btn--secondary btn--sm" id="constraints-btn">Constraints</button>
          <button class="btn btn--secondary btn--sm" id="export-json">Export JSON</button>
          <button class="btn btn--secondary btn--sm" id="export-pdf">Export PDF</button>
          <button class="btn btn--primary btn--sm" id="save-btn">Save</button>
        </div>
        ${alertMsg ? `<div class="tt-alert tt-alert--warn">${escapeHtml(alertMsg)}</div>` : ""}
        ${clashes.length ? `<div class="tt-alert tt-alert--error">${clashes.length} clash(es) detected</div>` : ""}
        <div class="tt-tabs">
          ${["section", "faculty", "room", "subject"].map((v) =>
            `<button class="tt-tab ${viewMode === v ? "active" : ""}" data-view="${v}">${v.charAt(0).toUpperCase() + v.slice(1)}</button>`).join("")}
        </div>
        ${viewMode === "section" ? `
        <div class="tt-card dd-palette-card">
          <p class="dd-label">Drag onto grid to assign · drag filled cells to move · double-click to clear</p>
          <div class="dd-chips" id="assign-palette"></div>
        </div>` : ""}
        <div class="tt-toolbar">
          <label>Subject context</label>
          <select id="sub-ctx">${app.tt.subjects.map((s) =>
            `<option value="${s.id}" ${s.id === selectedSubjectId ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}</select>
        </div>
        <div class="tt-planner-layout">
          <div id="panel-top">${renderTopPanel(app, selectedSubjectId, sectionId, planDays)}</div>
          <div id="panel-main">${renderMainPanel(app, viewMode, sectionId, facultyViewId, roomViewId, clashSet, planDays)}</div>
        </div>
      </div>
    `;

    bindEvents(clashSet, planDays);
    if (viewMode === "section") bindAssignmentPalette(planDays);
  }

  function renderTopPanel(app, subId, secId, planDays) {
    const sub = getById(app.tt.subjects, subId);
    if (!sub) return `<div class="tt-card"><p>Add subjects in setup.</p></div>`;
    const facIds = app.tt.subjectFacultyMap[sub.id] || [];
    const facList = facIds.map((id) => getById(app.tt.faculty, id)).filter(Boolean);
    let html = `<div class="tt-card"><h3>${escapeHtml(sub.name)}</h3>`;
    facList.forEach((fac) => {
      html += `<p><strong>${escapeHtml(fac.name)}</strong></p>${renderMiniAvail(app, fac, secId, planDays)}`;
    });
    html += `<h3 style="margin-top:1rem">Allotment</h3><ul class="tt-list">`;
    getAllAllotments(app.tt).forEach((a) => {
      const status = a.target ? `${a.assigned}/${a.target}` : `${a.assigned} assigned`;
      html += `<li class="tt-list-item" style="padding:0.5rem"><span>${escapeHtml(a.subject.name)}</span><span>${status}</span></li>`;
    });
    return html + `</ul></div>`;
  }

  function renderMiniAvail(app, fac, secId, planDays) {
    const { periodsPerDay, lunchPeriods } = app.tt.timings;
    const lunch = new Set(lunchPeriods || []);
    let html = `<div class="tt-avail-grid" style="grid-template-columns: repeat(${periodsPerDay}, 22px);margin-bottom:0.75rem">`;
    planDays.forEach((day) => {
      for (let p = 1; p <= periodsPerDay; p++) {
        if (lunch.has(p)) html += `<span class="tt-avail-cell lunch" style="width:22px;height:22px"></span>`;
        else {
          const avail = isFacultyAvailable(fac, day, p);
          const booked = isFacultyBooked(app.tt, fac.id, day, p, secId);
          html += `<span class="tt-avail-cell ${avail ? "on" : "off"} ${booked ? "booked" : ""}" style="width:22px;height:22px" title="${day} P${p}"></span>`;
        }
      }
    });
    return html + `</div>`;
  }

  function renderMainPanel(app, mode, secId, facId, roomId, clashSet, planDays) {
    if (mode === "subject") {
      let html = `<div class="tt-card"><h3>Subject-wise allotment</h3><table class="tt-table"><tr><th>Subject</th><th>Target</th><th>Assigned</th><th>Remaining</th></tr>`;
      getAllAllotments(app.tt).forEach((a) => {
        html += `<tr><td>${escapeHtml(a.subject.name)}</td><td>${a.target || "—"}</td><td>${a.assigned}</td><td>${a.remaining ?? "—"}</td></tr>`;
      });
      return html + `</table></div>`;
    }
    if (mode === "faculty") {
      const items = getFacultySchedule(app.tt, facId).map((s) => ({
        ...s,
        label: `${s.section} / ${getById(app.tt.subjects, s.subjectId)?.name || ""}`,
      }));
      return `<div class="tt-card">${facSelect(facId)}${renderScheduleGrid(app, items, null, planDays)}</div>`;
    }
    if (mode === "room") {
      const room = getById(app.tt.rooms, roomId);
      const items = getRoomSchedule(app.tt, roomId).map((s) => ({
        ...s,
        label: `${s.section} / ${getById(app.tt.subjects, s.subjectId)?.name || ""}`,
      }));
      return `<div class="tt-card">${roomSelect(roomId)}${renderScheduleGrid(app, items, room?.name, planDays)}</div>`;
    }
    return `<div class="tt-card">${sectionSelect(secId)}${renderSectionGrid(app, secId, clashSet, planDays)}</div>`;
  }

  function sectionSelect(val) {
    return `<div class="tt-form-row"><label>Section</label><select id="sec-view">${app.tt.sections.map((s) =>
      `<option value="${s.id}" ${s.id === val ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}</select></div>`;
  }
  function facSelect(val) {
    return `<div class="tt-form-row"><label>Faculty</label><select id="fac-view">${app.tt.faculty.map((f) =>
      `<option value="${f.id}" ${f.id === val ? "selected" : ""}>${escapeHtml(f.name)}</option>`).join("")}</select></div>`;
  }
  function roomSelect(val) {
    return `<div class="tt-form-row"><label>Room</label><select id="room-view">${app.tt.rooms.map((r) =>
      `<option value="${r.id}" ${r.id === val ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("")}</select></div>`;
  }

  function renderSectionGrid(app, secId, clashSet, planDays) {
    const { periodsPerDay } = app.tt.timings;
    const room = getRoomForSection(app.tt, secId);
    let html = `<p class="tt-page-sub">Room: ${room ? escapeHtml(room.name) : "—"} · drop assignments on cells</p><div class="tt-table-wrap"><table class="tt-table"><tr><th>Day</th>`;
    for (let p = 1; p <= periodsPerDay; p++) {
      html += `<th>${periodHeader(app.tt.timings, p)}</th>`;
    }
    html += `</tr>`;
    planDays.forEach((day) => {
      html += `<tr><td class="day-label">${day}</td>`;
      for (let p = 1; p <= periodsPerDay; p++) {
        if (isNonTeachingPeriod(app.tt.timings, p)) {
          html += `<td class="tt-grid-cell break-cell" title="Break">Break</td>`;
          continue;
        }
        const slot = getSlot(app.tt, secId, day, p);
        const sub = slot ? getById(app.tt.subjects, slot.subjectId) : null;
        const fac = slot ? getById(app.tt.faculty, slot.facultyId) : null;
        const key = `${secId}-${day}-${p}`;
        const clash = clashSet.has(key);
        html += `<td class="tt-grid-cell ${slot ? "filled" : ""} ${clash ? "clash" : ""}"
          data-sec="${secId}" data-day="${day}" data-p="${p}"
          data-sub="${slot?.subjectId || ""}" data-fac="${slot?.facultyId || ""}">
          ${sub ? `<div class="cell-sub">${escapeHtml(sub.name)}</div><div class="cell-fac">${escapeHtml(fac?.name || "")}</div>` : `<span class="dd-hint">+</span>`}
        </td>`;
      }
      html += `</tr>`;
    });
    return html + `</table></div>`;
  }

  function renderScheduleGrid(app, items, title, planDays) {
    const { periodsPerDay } = app.tt.timings;
    const map = {};
    items.forEach((it) => {
      map[`${it.day}-${it.period}`] = it.section || it.label || getById(app.tt.subjects, it.subjectId)?.name || "—";
    });
    let html = title ? `<p class="tt-page-sub">${escapeHtml(title)}</p>` : "";
    html += `<table class="tt-table"><tr><th>Day</th>`;
    for (let p = 1; p <= periodsPerDay; p++) html += `<th>${periodHeader(app.tt.timings, p)}</th>`;
    html += `</tr>`;
    planDays.forEach((day) => {
      html += `<tr><td class="day-label">${day}</td>`;
      for (let p = 1; p <= periodsPerDay; p++) {
        html += `<td>${isNonTeachingPeriod(app.tt.timings, p) ? "—" : escapeHtml(map[`${day}-${p}`] || "")}</td>`;
      }
      html += `</tr>`;
    });
    return html + `</table>`;
  }

  function bindAssignmentPalette(planDays) {
    const palette = app.el.querySelector("#assign-palette");
    if (!palette) return;
    palette.innerHTML = "";
    app.tt.subjects.forEach((sub) => {
      (app.tt.subjectFacultyMap[sub.id] || []).forEach((facId) => {
        const fac = getById(app.tt.faculty, facId);
        if (!fac) return;
        const chip = document.createElement("div");
        chip.className = "dd-chip";
        chip.innerHTML = `<strong>${escapeHtml(sub.name)}</strong> · ${escapeHtml(fac.name)}`;
        makeDraggable(chip, () => ({
          type: "assignment",
          subjectId: sub.id,
          facultyId: fac.id,
        }));
        palette.appendChild(chip);
      });
    });
  }

  function bindEvents(clashSet, planDays) {
    app.el.querySelector("#home-btn").onclick = () => app.navigate("#/home");
    app.el.querySelector("#setup-btn").onclick = () => app.navigate("#/setup/timings");
    app.el.querySelector("#constraints-btn").onclick = () => app.navigate("#/constraints");
    app.el.querySelector("#save-btn").onclick = () => { saveTimetable(app.tt); toast("Saved"); };
    app.el.querySelector("#export-json").onclick = () => exportJson(app.tt);
    app.el.querySelector("#export-pdf").onclick = () => exportPdf(app.tt, sectionId);

    app.el.querySelectorAll("[data-view]").forEach((btn) => {
      btn.onclick = () => { viewMode = btn.dataset.view; alertMsg = ""; render(); };
    });

    const subCtx = app.el.querySelector("#sub-ctx");
    if (subCtx) subCtx.onchange = () => { selectedSubjectId = subCtx.value; render(); };

    const ss = app.el.querySelector("#sec-view");
    if (ss) ss.onchange = () => { sectionId = ss.value; render(); };
    const fs = app.el.querySelector("#fac-view");
    if (fs) fs.onchange = () => { facultyViewId = fs.value; render(); };
    const rs = app.el.querySelector("#room-view");
    if (rs) rs.onchange = () => { roomViewId = rs.value; render(); };

    app.el.querySelectorAll(".tt-grid-cell[data-sec]").forEach((cell) => {
      makeDropZone(cell, (data) => {
        const sec = cell.dataset.sec;
        const day = cell.dataset.day;
        const period = Number(cell.dataset.p);

        if (data.type === "assignment") {
          assignSlot(sec, day, period, data.subjectId, data.facultyId);
          render();
          return;
        }
        if (data.type === "move") {
          setSlot(app.tt, data.fromSec, data.fromDay, data.fromPeriod, null);
          assignSlot(sec, day, period, data.subjectId, data.facultyId);
          render();
        }
      });

      if (cell.classList.contains("filled")) {
        makeDraggable(cell, () => ({
          type: "move",
          subjectId: cell.dataset.sub,
          facultyId: cell.dataset.fac,
          fromSec: cell.dataset.sec,
          fromDay: cell.dataset.day,
          fromPeriod: Number(cell.dataset.p),
        }));
      }

      cell.addEventListener("dblclick", () => {
        setSlot(app.tt, cell.dataset.sec, cell.dataset.day, Number(cell.dataset.p), null);
        saveTimetable(app.tt);
        render();
      });
    });
  }

  if (!app.tt.sections.length) {
    app.el.innerHTML = `<div class="tt-app"><div class="tt-card"><p>Complete setup first.</p><button class="btn btn--primary" id="go-setup">Go to setup</button></div></div>`;
    app.el.querySelector("#go-setup").onclick = () => app.navigate("#/setup/timings");
    return;
  }

  render();
}
