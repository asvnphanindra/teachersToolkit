import { saveTimetable } from "../storage.js";
import { DEFAULT_TIMINGS } from "../models.js";
import { normalizeTimings, rebuildPeriodTimes } from "../timings.js";
import { generateNamedList, parseNameList, parseSubjectList, bulkCreateSectionsRooms, bulkCreateFaculty, bulkCreateSubjects } from "../bulk-entry.js";
import { getById, applyAvailabilityTemplate } from "../models.js";
import { makeDraggable, makeDropZone } from "../drag-drop.js";
import { toast, escapeHtml } from "./home.js";

function wizardNav(app, step) {
  return `
    <div class="tt-wizard-steps">
      <span class="tt-wizard-step ${step === 1 ? "active" : ""}">1. Timings</span>
      <span class="tt-wizard-step ${step === 2 ? "active" : ""}">2. Sections & Rooms</span>
      <span class="tt-wizard-step ${step === 3 ? "active" : ""}">3. Subjects & Faculty</span>
    </div>
  `;
}

export function renderSetupTimings(app) {
  const t = normalizeTimings(app.tt.timings);
  app.tt.timings = t;

  const periodRows = Array.from({ length: t.periodsPerDay }, (_, i) => {
    const pt = t.periodTimes[i] || { start: "", end: "" };
    return `<tr>
      <td>Period ${i + 1}</td>
      <td><input type="time" class="period-start" data-i="${i}" value="${pt.start || ""}"></td>
      <td><input type="time" class="period-end" data-i="${i}" value="${pt.end || ""}"></td>
    </tr>`;
  }).join("");

  app.el.innerHTML = `
    <div class="tt-app">
      ${wizardNav(app, 1)}
      <h1 class="tt-page-title">University timings</h1>
      <p class="tt-page-sub">Set period times, breaks, and planning scope.</p>
      <div class="tt-card">
        <div class="tt-form-row">
          <label>Planning scope</label>
          <div class="tt-inline">
            <label style="font-weight:normal"><input type="radio" name="plan-mode" value="week" ${t.planMode !== "single-day" ? "checked" : ""}> Full week</label>
            <label style="font-weight:normal"><input type="radio" name="plan-mode" value="single-day" ${t.planMode === "single-day" ? "checked" : ""}> Single day only</label>
            <select id="single-day" ${t.planMode !== "single-day" ? "disabled" : ""}>
              ${DEFAULT_TIMINGS.workingDays.map((d) => `<option value="${d}" ${t.singleDay === d ? "selected" : ""}>${d}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="tt-form-row" id="week-days-row" style="${t.planMode === "single-day" ? "display:none" : ""}">
          <label>Working days (for faculty availability)</label>
          <div id="days-check">${DEFAULT_TIMINGS.workingDays.map((d) =>
            `<label style="display:inline-flex;margin-right:1rem;font-weight:normal">
              <input type="checkbox" value="${d}" ${t.workingDays.includes(d) ? "checked" : ""}> ${d}
            </label>`).join("")}</div>
        </div>
        <div class="tt-inline">
          <div class="tt-form-row"><label>Periods per day</label><input type="number" id="periods" min="1" max="12" value="${t.periodsPerDay}"></div>
          <div class="tt-form-row"><label>Lunch period # (non-teaching)</label><input type="text" id="lunch" value="${(t.lunchPeriods || []).join(", ")}" placeholder="e.g. 4"></div>
        </div>
        <div class="tt-table-wrap">
          <table class="tt-table">
            <tr><th></th><th>Start</th><th>End</th></tr>
            ${periodRows}
          </table>
        </div>
        <div class="tt-split" style="margin-top:1rem">
          <div class="tt-form-row">
            <label>Morning break</label>
            <div class="tt-inline">
              <input type="time" id="morning-start" value="${t.morningBreak?.start || ""}" placeholder="Start">
              <input type="time" id="morning-end" value="${t.morningBreak?.end || ""}" placeholder="End">
            </div>
          </div>
          <div class="tt-form-row">
            <label>Lunch break</label>
            <div class="tt-inline">
              <input type="time" id="lunch-start" value="${t.lunchBreak?.start || ""}" placeholder="Start">
              <input type="time" id="lunch-end" value="${t.lunchBreak?.end || ""}" placeholder="End">
            </div>
          </div>
        </div>
        <div class="tt-actions">
          <button class="btn btn--primary" id="next">Next &rarr;</button>
        </div>
      </div>
    </div>
  `;

  app.el.querySelectorAll('input[name="plan-mode"]').forEach((r) => {
    r.onchange = () => {
      const single = app.el.querySelector('input[name="plan-mode"]:checked').value === "single-day";
      app.el.querySelector("#single-day").disabled = !single;
      app.el.querySelector("#week-days-row").style.display = single ? "none" : "";
    };
  });

  app.el.querySelector("#periods").onchange = () => {
    const n = Number(app.el.querySelector("#periods").value) || 6;
    app.tt.timings.periodsPerDay = n;
    app.tt.timings.periodTimes = rebuildPeriodTimes(n, app.tt.timings.periodTimes);
    renderSetupTimings(app);
  };

  app.el.querySelector("#next").onclick = () => {
    const periods = Number(app.el.querySelector("#periods").value) || 6;
    const planMode = app.el.querySelector('input[name="plan-mode"]:checked').value;
    const singleDay = app.el.querySelector("#single-day").value;
    const lunch = app.el.querySelector("#lunch").value.split(",").map((s) => Number(s.trim())).filter(Boolean);

    const periodTimes = Array.from({ length: periods }, (_, i) => ({
      start: app.el.querySelector(`.period-start[data-i="${i}"]`)?.value || "",
      end: app.el.querySelector(`.period-end[data-i="${i}"]`)?.value || "",
    }));

    let workingDays = [...app.el.querySelectorAll("#days-check input:checked")].map((c) => c.value);
    if (planMode === "single-day") workingDays = [singleDay];
    if (!workingDays.length) workingDays = planMode === "single-day" ? [singleDay] : DEFAULT_TIMINGS.workingDays;

    app.tt.timings = {
      ...app.tt.timings,
      planMode,
      singleDay,
      periodsPerDay: periods,
      periodTimes,
      periodStarts: periodTimes.map((p) => p.start),
      lunchPeriods: lunch,
      morningBreak: {
        start: app.el.querySelector("#morning-start").value,
        end: app.el.querySelector("#morning-end").value,
      },
      lunchBreak: {
        start: app.el.querySelector("#lunch-start").value,
        end: app.el.querySelector("#lunch-end").value,
      },
      workingDays,
    };
    saveTimetable(app.tt);
    app.navigate("#/setup/sections");
  };
}

export function renderSetupSections(app) {
  function mappingTable() {
    if (!app.tt.sections.length) return "";
    let rows = app.tt.sections.map((sec) => {
      const opts = app.tt.rooms.map((r) =>
        `<option value="${r.id}" ${app.tt.sectionRoomMap[sec.id] === r.id ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("");
      return `<tr><td>${escapeHtml(sec.name)}</td><td><select data-sec="${sec.id}">${opts}</select></td></tr>`;
    }).join("");
    return `<div class="tt-table-wrap" style="margin-top:1rem"><table class="tt-table"><tr><th>Section</th><th>Room</th></tr>${rows}</table></div>`;
  }

  app.el.innerHTML = `
    <div class="tt-app">
      ${wizardNav(app, 2)}
      <h1 class="tt-page-title">Sections &amp; rooms</h1>
      <p class="tt-page-sub">Generate in bulk or paste names (one per line).</p>
      <div class="tt-card">
        <div class="tt-inline">
          <div class="tt-form-row"><label>Count</label><input type="number" id="count" value="22" min="1"></div>
          <button class="btn btn--secondary" id="gen">Generate</button>
          <button class="btn btn--secondary" id="apply-paste">Apply paste</button>
        </div>
        <div class="tt-split">
          <div class="tt-form-row"><label>Sections (one per line)</label><textarea id="sections">${app.tt.sections.map((s) => s.name).join("\n")}</textarea></div>
          <div class="tt-form-row"><label>Rooms (one per line)</label><textarea id="rooms">${app.tt.rooms.map((r) => r.name).join("\n")}</textarea></div>
        </div>
        <div id="map-preview">${mappingTable()}</div>
        <div class="tt-actions">
          <button class="btn btn--secondary" id="back">&larr; Back</button>
          <button class="btn btn--primary" id="next">Next &rarr;</button>
        </div>
      </div>
    </div>
  `;
  app.el.querySelector("#gen").onclick = () => {
    const n = Number(app.el.querySelector("#count").value) || 1;
    app.el.querySelector("#sections").value = generateNamedList(n, "Section").join("\n");
    app.el.querySelector("#rooms").value = generateNamedList(n, "Room").join("\n");
  };
  app.el.querySelector("#apply-paste").onclick = () => {
    const secs = parseNameList(app.el.querySelector("#sections").value);
    const rooms = parseNameList(app.el.querySelector("#rooms").value);
    if (!secs.length || !rooms.length) return toast("Add sections and rooms");
    bulkCreateSectionsRooms(app.tt, secs, rooms);
    saveTimetable(app.tt);
    app.el.querySelector("#map-preview").innerHTML = mappingTable();
    app.el.querySelectorAll("#map-preview select[data-sec]").forEach((sel) => {
      sel.onchange = () => { app.tt.sectionRoomMap[sel.dataset.sec] = sel.value; saveTimetable(app.tt); };
    });
    toast("Lists applied — adjust room mapping below");
  };
  app.el.querySelectorAll("#map-preview select[data-sec]").forEach((sel) => {
    sel.onchange = () => { app.tt.sectionRoomMap[sel.dataset.sec] = sel.value; saveTimetable(app.tt); };
  });
  app.el.querySelector("#back").onclick = () => app.navigate("#/setup/timings");
  app.el.querySelector("#next").onclick = () => {
    const secs = parseNameList(app.el.querySelector("#sections").value);
    const rooms = parseNameList(app.el.querySelector("#rooms").value);
    if (!secs.length || !rooms.length) return toast("Add sections and rooms");
    bulkCreateSectionsRooms(app.tt, secs, rooms);
    app.el.querySelectorAll("#map-preview select[data-sec]").forEach((sel) => {
      app.tt.sectionRoomMap[sel.dataset.sec] = sel.value;
    });
    saveTimetable(app.tt);
    app.navigate("#/setup/subjects");
  };
}

export function renderSetupSubjects(app) {
  let selectedFacId = app.tt.faculty[0]?.id || null;

  function render() {
    const fac = selectedFacId ? getById(app.tt.faculty, selectedFacId) : null;
    app.el.innerHTML = `
      <div class="tt-app">
        ${wizardNav(app, 3)}
        <h1 class="tt-page-title">Subjects &amp; faculty</h1>
        <div class="tt-card">
          <h3>Subjects</h3>
          <div class="tt-inline">
            <div class="tt-form-row"><label>Count</label><input type="number" id="sub-count" value="10" min="1"></div>
            <button class="btn btn--secondary btn--sm" id="gen-sub">Generate</button>
          </div>
          <div class="tt-form-row">
            <label>One per line — optional: Name, weeklyPeriods</label>
            <textarea id="subjects">${app.tt.subjects.map((s) => s.weeklyPeriods ? `${s.name}, ${s.weeklyPeriods}` : s.name).join("\n")}</textarea>
          </div>
        </div>
        <div class="tt-card">
          <h3>Faculty</h3>
          <div class="tt-inline">
            <div class="tt-form-row"><label>Count</label><input type="number" id="fac-count" value="40" min="1"></div>
            <button class="btn btn--secondary btn--sm" id="gen-fac">Generate</button>
            <div class="tt-form-row"><label>Template</label>
              <select id="fac-template">
                <option value="full">Full time</option>
                <option value="weekdays">Mon–Fri</option>
                <option value="mornings">Mornings</option>
                <option value="afternoons">Afternoons</option>
              </select>
            </div>
          </div>
          <div class="tt-form-row"><label>Names (one per line)</label><textarea id="faculty">${app.tt.faculty.map((f) => f.name).join("\n")}</textarea></div>
          ${app.tt.faculty.length ? `
          <div class="tt-faculty-layout">
            <div class="tt-faculty-list" id="fac-list"></div>
            <div id="fac-avail">
              ${fac ? `<div class="tt-fac-controls">
                <div class="tt-form-row"><label>Apply template</label>
                  <select id="apply-template">
                    <option value="full">Full time</option>
                    <option value="weekdays">Mon–Fri</option>
                    <option value="mornings">Mornings</option>
                    <option value="afternoons">Afternoons</option>
                  </select>
                </div>
                <button type="button" class="btn btn--secondary btn--sm" id="apply-tmpl-btn">Apply</button>
                <div class="tt-form-row"><label>Copy from</label>
                  <select id="copy-from">${app.tt.faculty.filter((f) => f.id !== fac.id).map((f) =>
                    `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("") || '<option value="">—</option>'}</select>
                </div>
                <button type="button" class="btn btn--secondary btn--sm" id="copy-avail-btn">Copy</button>
              </div>` : ""}
              ${fac ? renderAvailGrid(app, fac) : ""}
            </div>
          </div>` : ""}
        </div>
        <div class="tt-card">
          <h3>Subject ↔ Faculty mapping</h3>
          <p class="tt-page-sub">Use the checkbox matrix or drag faculty onto subjects below. Click <strong>Load lists</strong> after editing text areas.</p>
          <button type="button" class="btn btn--secondary btn--sm" id="load-lists">Load lists</button>
          <div class="tt-form-row" style="margin-top:0.75rem">
            <label>Filter faculty in matrix</label>
            <input type="search" id="matrix-search" placeholder="Search faculty name…">
          </div>
          <div class="tt-matrix-wrap" id="matrix-wrap"></div>
          <div class="dd-layout" style="margin-top:1.25rem">
            <div class="dd-pool">
              <p class="dd-label">Faculty pool (drag)</p>
              <div class="dd-chips" id="fac-pool"></div>
            </div>
            <div class="dd-targets" id="sub-targets"></div>
          </div>
        </div>
        <div class="tt-actions">
          <button class="btn btn--secondary" id="back">&larr; Back</button>
          <button class="btn btn--primary" id="finish">Finish setup &rarr;</button>
        </div>
      </div>
    `;

    app.el.querySelector("#gen-sub").onclick = () => {
      const n = Number(app.el.querySelector("#sub-count").value) || 1;
      app.el.querySelector("#subjects").value = generateNamedList(n, "Subject").join("\n");
    };
    app.el.querySelector("#gen-fac").onclick = () => {
      const n = Number(app.el.querySelector("#fac-count").value) || 1;
      app.el.querySelector("#faculty").value = generateNamedList(n, "Faculty").join("\n");
    };
    app.el.querySelector("#back").onclick = () => app.navigate("#/setup/sections");
    app.el.querySelector("#load-lists")?.addEventListener("click", () => {
      syncSubjectsFacultyFromForm(app);
      toast("Lists loaded");
      render();
    });

    app.el.querySelector("#finish").onclick = () => {
      syncSubjectsFacultyFromForm(app);
      if (!app.tt.subjects.length || !app.tt.faculty.length) return toast("Add subjects and faculty");
      saveTimetable(app.tt);
      app.navigate("#/planner");
    };

    if (app.tt.faculty.length) {
      const list = app.el.querySelector("#fac-list");
      app.tt.faculty.forEach((f) => {
        const b = document.createElement("button");
        b.textContent = f.name;
        b.className = f.id === selectedFacId ? "active" : "";
        b.onclick = () => { selectedFacId = f.id; render(); };
        list.appendChild(b);
      });
      bindAvailGrid(app, fac, render);
      app.el.querySelector("#apply-tmpl-btn")?.addEventListener("click", () => {
        const tmpl = app.el.querySelector("#apply-template").value;
        applyAvailabilityTemplate(fac, tmpl, app.tt.timings);
        saveTimetable(app.tt);
        render();
      });
      app.el.querySelector("#copy-avail-btn")?.addEventListener("click", () => {
        const fromId = app.el.querySelector("#copy-from").value;
        const from = getById(app.tt.faculty, fromId);
        if (from) {
          fac.availability = structuredClone(from.availability);
          saveTimetable(app.tt);
          render();
        }
      });
    }
    bindMatrix(app, render);
    bindDragDropMapping(app, render);
  }

  render();
}

function syncSubjectsFacultyFromForm(app) {
  bulkCreateSubjects(app.tt, parseSubjectList(app.el.querySelector("#subjects")?.value || ""));
  const tmpl = app.el.querySelector("#fac-template")?.value || "full";
  bulkCreateFaculty(app.tt, parseNameList(app.el.querySelector("#faculty")?.value || ""), tmpl);
}

function bindDragDropMapping(app, rerender) {
  const pool = app.el.querySelector("#fac-pool");
  const targets = app.el.querySelector("#sub-targets");
  if (!pool || !targets) return;

  pool.innerHTML = "";
  app.tt.faculty.forEach((f) => {
    const chip = document.createElement("div");
    chip.className = "dd-chip";
    chip.textContent = f.name;
    makeDraggable(chip, () => ({ type: "faculty", facultyId: f.id }));
    pool.appendChild(chip);
  });

  targets.innerHTML = "";
  app.tt.subjects.forEach((sub) => {
    const row = document.createElement("div");
    row.className = "dd-subject-row";
    const mapped = (app.tt.subjectFacultyMap[sub.id] || [])
      .map((id) => getById(app.tt.faculty, id))
      .filter(Boolean);

    row.innerHTML = `<div class="dd-subject-name">${escapeHtml(sub.name)}</div>`;
    const zone = document.createElement("div");
    zone.className = "dd-dropzone";
    zone.dataset.subId = sub.id;

    mapped.forEach((f) => {
      zone.appendChild(makeMappedChip(app, sub.id, f, rerender));
    });

    if (!mapped.length) zone.innerHTML = '<span class="dd-hint">Drop faculty here</span>';

    makeDropZone(zone, (data) => {
      if (data.type !== "faculty") return;
      if (!app.tt.subjectFacultyMap[sub.id]) app.tt.subjectFacultyMap[sub.id] = [];
      const arr = app.tt.subjectFacultyMap[sub.id];
      if (!arr.includes(data.facultyId)) arr.push(data.facultyId);
      saveTimetable(app.tt);
      rerender();
    }, "faculty");

    row.appendChild(zone);
    targets.appendChild(row);
  });
}

function makeMappedChip(app, subId, faculty, rerender) {
  const chip = document.createElement("span");
  chip.className = "dd-chip dd-chip--mapped";
  chip.textContent = faculty.name;
  const x = document.createElement("button");
  x.type = "button";
  x.className = "dd-remove";
  x.textContent = "×";
  x.onclick = (e) => {
    e.stopPropagation();
    app.tt.subjectFacultyMap[subId] = (app.tt.subjectFacultyMap[subId] || []).filter((id) => id !== faculty.id);
    saveTimetable(app.tt);
    rerender();
  };
  chip.appendChild(x);
  return chip;
}

function renderAvailGrid(app, fac) {
  const { workingDays, periodsPerDay, lunchPeriods } = normalizeTimings(app.tt.timings);
  const lunch = new Set(lunchPeriods || []);
  let html = `<p><strong>${escapeHtml(fac.name)}</strong> — click cells; click day/period labels to toggle rows/columns</p>`;
  html += `<div class="tt-avail-grid" style="grid-template-columns: 36px repeat(${periodsPerDay}, 28px)">`;
  html += `<span></span>`;
  for (let p = 1; p <= periodsPerDay; p++) {
    html += `<span class="tt-avail-header" data-col-p="${p}">P${p}</span>`;
  }
  workingDays.forEach((day) => {
    html += `<span class="tt-avail-day" data-row-day="${day}">${day.slice(0, 3)}</span>`;
    for (let p = 1; p <= periodsPerDay; p++) {
      if (lunch.has(p)) html += `<span class="tt-avail-cell lunch"></span>`;
      else {
        const on = (fac.availability[day] || []).includes(p);
        html += `<span class="tt-avail-cell ${on ? "on" : "off"}" data-day="${day}" data-p="${p}"></span>`;
      }
    }
  });
  return html + `</div>`;
}

function bindAvailGrid(app, fac, rerender) {
  if (!fac) return;
  app.el.querySelectorAll(".tt-avail-cell[data-day]").forEach((cell) => {
    cell.onclick = () => toggleAvail(fac, cell.dataset.day, Number(cell.dataset.p), cell);
  });
  app.el.querySelectorAll("[data-row-day]").forEach((el) => {
    el.onclick = () => {
      const day = el.dataset.rowDay;
      const { periodsPerDay, lunchPeriods } = app.tt.timings;
      const lunch = new Set(lunchPeriods || []);
      const teachable = Array.from({ length: periodsPerDay }, (_, i) => i + 1).filter((p) => !lunch.has(p));
      const allOn = teachable.every((p) => (fac.availability[day] || []).includes(p));
      fac.availability[day] = allOn ? [] : [...teachable];
      saveTimetable(app.tt);
      rerender();
    };
  });
  app.el.querySelectorAll("[data-col-p]").forEach((el) => {
    el.onclick = () => {
      const p = Number(el.dataset.colP);
      const { workingDays, lunchPeriods } = app.tt.timings;
      if ((lunchPeriods || []).includes(p)) return;
      const allOn = workingDays.every((day) => (fac.availability[day] || []).includes(p));
      workingDays.forEach((day) => {
        let arr = fac.availability[day] || [];
        if (allOn) arr = arr.filter((x) => x !== p);
        else if (!arr.includes(p)) arr = [...arr, p].sort((a, b) => a - b);
        fac.availability[day] = arr;
      });
      saveTimetable(app.tt);
      rerender();
    };
  });
}

function toggleAvail(fac, day, p, cell) {
  let arr = fac.availability[day] || [];
  if (arr.includes(p)) arr = arr.filter((x) => x !== p);
  else arr = [...arr, p].sort((a, b) => a - b);
  fac.availability[day] = arr;
  cell.classList.toggle("on", arr.includes(p));
  cell.classList.toggle("off", !arr.includes(p));
  saveTimetable(app.tt);
}

function bindMatrix(app, rerender) {
  const wrap = app.el.querySelector("#matrix-wrap");
  const searchEl = app.el.querySelector("#matrix-search");
  if (!wrap) return;

  function draw() {
    const q = (searchEl?.value || "").toLowerCase();
    const faculty = app.tt.faculty.filter((f) => f.name.toLowerCase().includes(q));
    if (!app.tt.subjects.length || !faculty.length) {
      wrap.innerHTML = "<p class='tt-page-sub' style='padding:1rem'>Load subjects and faculty to see matrix.</p>";
      return;
    }
    let html = "<table class='tt-matrix'><tr><th>Subject</th>";
    faculty.forEach((f) => { html += `<th title="${escapeHtml(f.name)}">${escapeHtml(f.name.slice(0, 12))}${f.name.length > 12 ? "…" : ""}</th>`; });
    html += "</tr>";
    app.tt.subjects.forEach((sub) => {
      html += `<tr><td>${escapeHtml(sub.name)}</td>`;
      faculty.forEach((f) => {
        const checked = (app.tt.subjectFacultyMap[sub.id] || []).includes(f.id);
        html += `<td><input type="checkbox" data-sub="${sub.id}" data-fac="${f.id}" ${checked ? "checked" : ""}></td>`;
      });
      html += "</tr>";
    });
    wrap.innerHTML = html + "</table>";
    wrap.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.onchange = () => {
        const subId = cb.dataset.sub;
        const facId = cb.dataset.fac;
        if (!app.tt.subjectFacultyMap[subId]) app.tt.subjectFacultyMap[subId] = [];
        const arr = app.tt.subjectFacultyMap[subId];
        if (cb.checked && !arr.includes(facId)) arr.push(facId);
        if (!cb.checked) app.tt.subjectFacultyMap[subId] = arr.filter((id) => id !== facId);
        saveTimetable(app.tt);
        rerender();
      };
    });
  }

  searchEl?.addEventListener("input", draw);
  draw();
}
