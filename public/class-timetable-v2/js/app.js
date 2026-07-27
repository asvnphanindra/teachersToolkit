import { ENTITY_TYPES, createEntity, getById, labelFor, mappingIssues } from "./models.js";
import { deleteProject, exportProject, importProject, listProjects, loadProject, newProject, saveProject } from "./storage.js";
import { downloadTemplate, exportWorkbook, importWorkbook } from "./workbook.js";

const app = document.querySelector("#app");
let project = null;
let view = "home";
let selectedType = "rooms";
let mappingType = "sectionRoom";

const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
const downloadInput = (accept, handler) => `<input class="hidden-input" type="file" accept="${accept}" data-upload="${handler}">`;

function toast(message, kind = "") {
  const element = document.createElement("div");
  element.className = `v2-toast ${kind}`;
  element.textContent = message;
  document.body.append(element);
  setTimeout(() => element.remove(), 3200);
}

function save() {
  saveProject(project);
}

function entityCount(type) {
  return project?.[type]?.length || 0;
}

function nav() {
  if (!project) return "";
  const items = [["data", "Data"], ["map", "Map relationships"], ["review", "Review"]];
  return `<nav class="v2-nav">${items.map(([id, label]) => `<button class="${view === id ? "active" : ""}" data-view="${id}">${label}</button>`).join("")}<span class="v2-nav-project">${esc(project.name)}</span></nav>`;
}

function render() {
  app.innerHTML = `${nav()}${view === "home" ? renderHome() : view === "data" ? renderData() : view === "map" ? renderMappings() : renderReview()}`;
  bind();
}

function renderHome() {
  const projects = listProjects();
  return `<section class="v2-shell v2-home">
    <div class="v2-hero">
      <p class="v2-eyebrow">Class Timetable V2</p>
      <h1>Prepare your timetable without technical setup.</h1>
      <p>Start with the Excel workbook your institution already uses, then visually connect rooms, sections, subjects, and faculty.</p>
      <div class="v2-actions">
        <button class="btn btn--primary" data-action="new-project">Create a blank project</button>
        <button class="btn btn--secondary" data-action="template">Download Excel template</button>
        <button class="btn btn--secondary" data-action="upload-workbook">Import Excel or CSV</button>
        <button class="btn btn--secondary" data-action="upload-project">Import project backup</button>
        ${downloadInput(".xlsx,.xls,.csv", "workbook")}
        ${downloadInput(".json", "project")}
      </div>
    </div>
    <div class="v2-card">
      <h2>How it works</h2>
      <ol class="v2-steps"><li>Upload or paste your existing lists.</li><li>Check the clear import preview.</li><li>Drag items to create relationships.</li><li>Review the mapping, then save a backup.</li></ol>
    </div>
    <div class="v2-card">
      <h2>Saved projects</h2>
      ${projects.length ? `<div class="v2-project-list">${projects.map((item) => `<button class="v2-project" data-open="${item.id}"><strong>${esc(item.name)}</strong><span>Last saved ${new Date(item.updatedAt).toLocaleString()}</span></button>`).join("")}</div>` : `<p class="v2-muted">No projects saved in this browser yet.</p>`}
    </div>
  </section>`;
}

function renderData() {
  const config = ENTITY_TYPES[selectedType];
  const items = project[selectedType];
  return `<section class="v2-shell">
    <header class="v2-page-heading"><div><p class="v2-eyebrow">Step 1 of 2</p><h1>Check your master data</h1><p>Add individual records or paste rows copied from a spreadsheet.</p></div>
      <div class="v2-actions"><button class="btn btn--secondary" data-action="upload-workbook">Replace/import workbook</button>${downloadInput(".xlsx,.xls,.csv", "workbook")}<button class="btn btn--secondary" data-action="export-workbook">Export workbook</button></div>
    </header>
    <div class="v2-workspace">
      <aside class="v2-sidebar">${Object.entries(ENTITY_TYPES).map(([type, item]) => `<button class="${type === selectedType ? "active" : ""}" data-type="${type}">${item.label}<span>${entityCount(type)}</span></button>`).join("")}<button class="${selectedType === "timings" ? "active" : ""}" data-type="timings">Timings<span>${project.timings.periods.length}</span></button></aside>
      <div class="v2-main">${selectedType === "timings" ? renderTimings() : renderEntityList(config, items)}</div>
    </div>
  </section>`;
}

function renderEntityList(config, items) {
  const fields = config.fields;
  return `<div class="v2-card">
    <div class="v2-list-heading"><div><h2>${config.label}</h2><p class="v2-muted">${items.length} record${items.length === 1 ? "" : "s"}. Changes save automatically in this browser.</p></div><button class="btn btn--primary" data-action="add-entity">Add ${config.label.slice(0, -1)}</button></div>
    <details class="v2-paste"><summary>Paste more ${config.label.toLowerCase()}</summary><p>Paste rows copied from Excel. Use a header row such as <strong>Code, Name${fields.includes("email") ? ", Email, Phone" : ""}</strong>.</p><textarea id="paste-box" placeholder="Code\tName&#10;R101\tRoom 101"></textarea><button class="btn btn--secondary btn--sm" data-action="paste-entities">Preview and add rows</button></details>
    ${items.length ? `<div class="v2-table-wrap"><table class="v2-table"><thead><tr>${fields.map((field) => `<th>${esc(displayField(field))}</th>`).join("")}<th></th></tr></thead><tbody>${items.map((item) => `<tr>${fields.map((field) => `<td><input value="${esc(item[field])}" data-edit="${item.id}" data-field="${field}" aria-label="${esc(displayField(field))} for ${esc(item.name)}"></td>`).join("")}<td><button class="v2-icon-button" data-delete="${item.id}" aria-label="Delete ${esc(item.name)}">&times;</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="v2-empty">No ${config.label.toLowerCase()} yet. Add one or paste a list.</div>`}
  </div>`;
}

function renderTimings() {
  const periods = project.timings.periods;
  return `<div class="v2-card"><div class="v2-list-heading"><div><h2>Timings</h2><p class="v2-muted">Optional for this mapping stage. You can complete period planning later.</p></div><button class="btn btn--primary" data-action="add-period">Add period</button></div>
    <div class="v2-table-wrap"><table class="v2-table"><thead><tr><th>Day</th><th>Period number</th><th>Start</th><th>End</th><th></th></tr></thead><tbody>${periods.map((period, index) => `<tr><td><input value="${esc(period.day)}" data-time="${index}" data-field="day"></td><td><input type="number" value="${esc(period.number)}" data-time="${index}" data-field="number"></td><td><input type="time" value="${esc(period.start)}" data-time="${index}" data-field="start"></td><td><input type="time" value="${esc(period.end)}" data-time="${index}" data-field="end"></td><td><button class="v2-icon-button" data-delete-period="${index}">&times;</button></td></tr>`).join("")}</tbody></table></div>
  </div>`;
}

const mappingDefs = {
  sectionRoom: { label: "Section to room", source: "sections", target: "rooms", multiple: false, hint: "Give each section a primary home room." },
  sectionMentor: { label: "Section to mentor", source: "sections", target: "mentors", multiple: false, hint: "Give each section one mentor from the dedicated Mentors list." },
  sectionSubject: { label: "Section to subjects", source: "sections", target: "subjects", multiple: true, hint: "Add every subject taught to each section." },
  subjectFaculty: { label: "Subject to faculty", source: "subjects", target: "faculty", multiple: true, hint: "Add faculty who are eligible to teach each subject." },
  subjectMentor: { label: "Subject to supporting mentors", source: "subjects", target: "mentors", multiple: true, hint: "Optionally add mentors who support faculty for this subject." },
  sectionFaculty: { label: "Section to faculty", source: "sections", target: "faculty", multiple: true, hint: "Add faculty assigned to the section." },
};

function renderMappings() {
  const def = mappingDefs[mappingType];
  return `<section class="v2-shell"><header class="v2-page-heading"><div><p class="v2-eyebrow">Step 2 of 2</p><h1>Map your timetable information</h1><p>Drag items to a row, or use the Add button. All mappings save automatically.</p></div><button class="btn btn--secondary" data-view="review">Review mappings</button></header>
    <div class="v2-map-tabs">${Object.entries(mappingDefs).map(([id, item], index) => `<button class="${id === mappingType ? "active" : ""}" data-mapping="${id}"><span>${index + 1}</span>${item.label}</button>`).join("")}</div>
    <div class="v2-card"><p class="v2-map-hint">${def.hint}</p><div class="v2-palette"><strong>Drag from here:</strong>${project[def.target].map((item) => `<button class="v2-chip" draggable="true" data-drag-target="${item.id}">${esc(labelFor(item))}</button>`).join("") || `<span class="v2-muted">Add ${def.target} first.</span>`}</div>
    <div class="v2-map-list">${project[def.source].map((source) => mappingRow(def, source)).join("") || `<div class="v2-empty">Add ${def.source} first.</div>`}</div></div></section>`;
}

function mappingRow(def, source) {
  const mapping = project.mappings[mappingType];
  const targetIds = def.multiple ? mapping[source.id] || [] : mapping[source.id] ? [mapping[source.id]] : [];
  const targets = targetIds.map((id) => getById(project, def.target, id)).filter(Boolean);
  return `<article class="v2-map-row"><div><strong>${esc(labelFor(source))}</strong><small>${targets.length} mapped</small></div><div class="v2-dropzone" data-drop-source="${source.id}">${targets.map((target) => `<span class="v2-chip mapped">${esc(labelFor(target))}<button data-remove-map="${source.id}" data-target-id="${target.id}" aria-label="Remove ${esc(labelFor(target))}">&times;</button></span>`).join("") || `<span class="v2-muted">Drop here</span>`}</div><button class="btn btn--secondary btn--sm" data-add-map="${source.id}">Add</button></article>`;
}

function renderReview() {
  const issues = mappingIssues(project);
  const counts = Object.entries(mappingDefs).map(([id, def]) => {
    const data = project.mappings[id];
    const mapped = Object.values(data).reduce((total, value) => total + (Array.isArray(value) ? value.length : value ? 1 : 0), 0);
    return `<li><strong>${def.label}:</strong> ${mapped} relationship${mapped === 1 ? "" : "s"}</li>`;
  }).join("");
  return `<section class="v2-shell"><header class="v2-page-heading"><div><p class="v2-eyebrow">Ready check</p><h1>Review your setup</h1><p>Resolve important gaps before moving to period-by-period scheduling.</p></div><div class="v2-actions"><button class="btn btn--secondary" data-action="export-json">Export project JSON</button><button class="btn btn--secondary" data-action="export-workbook">Export workbook</button></div></header>
    <div class="v2-review-grid"><div class="v2-card"><h2>Relationship summary</h2><ul class="v2-summary">${counts}</ul></div><div class="v2-card"><h2>${issues.length ? "Items to complete" : "Setup complete"}</h2>${issues.length ? `<ul class="v2-issues">${issues.map((issue) => `<li>${esc(issue)}</li>`).join("")}</ul>` : `<p class="v2-success">Your core rooms, sections, subjects, and faculty mappings are complete.</p>`}</div></div>
    <div class="v2-card"><h2>Next step</h2><p>${issues.length ? "Finish the gaps above, then return here." : "Your project is ready for the future section-wise period planner. Keep an exported JSON backup of this setup."}</p><div class="v2-actions"><button class="btn btn--secondary" data-view="map">Return to mappings</button><button class="btn btn--danger" data-action="delete-project">Delete this project</button></div></div>
  </section>`;
}

function displayField(field) {
  return ({ code: "Code / ID", mentorId: "Mentor ID", weeklyPeriods: "Weekly periods" }[field] || field.replace(/([A-Z])/g, " $1")).replace(/^./, (letter) => letter.toUpperCase());
}

function addEntity() {
  project[selectedType].push(createEntity(selectedType, { name: `New ${ENTITY_TYPES[selectedType].label.slice(0, -1)}` }));
  save(); render();
}

function addPastedEntities() {
  const text = document.querySelector("#paste-box").value.trim();
  if (!text) return toast("Paste some rows first.", "error");
  const rows = text.split(/\r?\n/).map((line) => line.split(/\t|,/).map((cell) => cell.trim()));
  const headers = rows.shift().map((header) => header.toLowerCase());
  const codeIndex = headers.findIndex((header) => ["code", "id", `${selectedType.slice(0, -1)} id`].includes(header));
  const nameIndex = headers.findIndex((header) => header.includes("name"));
  if (nameIndex < 0) return toast("Include a Name column in the pasted header.", "error");
  rows.filter((row) => row.some(Boolean)).forEach((row) => project[selectedType].push(createEntity(selectedType, { code: codeIndex >= 0 ? row[codeIndex] : "", name: row[nameIndex] })));
  save(); toast(`${rows.length} row(s) added.`); render();
}

function addMapping(sourceId, targetId) {
  const def = mappingDefs[mappingType];
  const map = project.mappings[mappingType];
  if (def.multiple) {
    const current = map[sourceId] || [];
    if (!current.includes(targetId)) map[sourceId] = [...current, targetId];
  } else map[sourceId] = targetId;
  save(); render();
}

function deleteEntity(type, id) {
  project[type] = project[type].filter((item) => item.id !== id);
  const mappings = project.mappings;
  if (type === "sections") {
    delete mappings.sectionRoom[id];
    delete mappings.sectionMentor[id];
    delete mappings.sectionSubject[id];
    delete mappings.sectionFaculty[id];
  }
  if (type === "rooms") Object.entries(mappings.sectionRoom).forEach(([sectionId, roomId]) => { if (roomId === id) delete mappings.sectionRoom[sectionId]; });
  if (type === "mentors") {
    Object.entries(mappings.sectionMentor).forEach(([sectionId, mentorId]) => { if (mentorId === id) delete mappings.sectionMentor[sectionId]; });
    Object.keys(mappings.subjectMentor).forEach((subjectId) => { mappings.subjectMentor[subjectId] = mappings.subjectMentor[subjectId].filter((mentorId) => mentorId !== id); });
  }
  if (type === "subjects") {
    delete mappings.subjectFaculty[id];
    delete mappings.subjectMentor[id];
    Object.keys(mappings.sectionSubject).forEach((sectionId) => { mappings.sectionSubject[sectionId] = mappings.sectionSubject[sectionId].filter((subjectId) => subjectId !== id); });
  }
  if (type === "faculty") {
    Object.keys(mappings.subjectFaculty).forEach((subjectId) => { mappings.subjectFaculty[subjectId] = mappings.subjectFaculty[subjectId].filter((facultyId) => facultyId !== id); });
    Object.keys(mappings.sectionFaculty).forEach((sectionId) => { mappings.sectionFaculty[sectionId] = mappings.sectionFaculty[sectionId].filter((facultyId) => facultyId !== id); });
  }
  save(); render();
}

function bind() {
  app.querySelectorAll("[data-view]").forEach((button) => button.onclick = () => { view = button.dataset.view; render(); });
  app.querySelectorAll("[data-open]").forEach((button) => button.onclick = () => { project = loadProject(button.dataset.open); view = "data"; render(); });
  app.querySelectorAll("[data-type]").forEach((button) => button.onclick = () => { selectedType = button.dataset.type; render(); });
  app.querySelectorAll("[data-mapping]").forEach((button) => button.onclick = () => { mappingType = button.dataset.mapping; render(); });
  app.querySelectorAll("[data-action]").forEach((button) => button.onclick = () => action(button.dataset.action, button));
  app.querySelectorAll("[data-edit]").forEach((input) => input.onchange = () => { const item = getById(project, selectedType, input.dataset.edit); item[input.dataset.field] = input.value; save(); });
  app.querySelectorAll("[data-time]").forEach((input) => input.onchange = () => { project.timings.periods[Number(input.dataset.time)][input.dataset.field] = input.value; save(); });
  app.querySelectorAll("[data-delete]").forEach((button) => button.onclick = () => deleteEntity(selectedType, button.dataset.delete));
  app.querySelectorAll("[data-delete-period]").forEach((button) => button.onclick = () => { project.timings.periods.splice(Number(button.dataset.deletePeriod), 1); save(); render(); });
  app.querySelectorAll("[data-drag-target]").forEach((item) => item.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/plain", item.dataset.dragTarget)));
  app.querySelectorAll("[data-drop-source]").forEach((zone) => {
    zone.addEventListener("dragover", (event) => { event.preventDefault(); zone.classList.add("over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("over"));
    zone.addEventListener("drop", (event) => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); if (id) addMapping(zone.dataset.dropSource, id); });
  });
  app.querySelectorAll("[data-add-map]").forEach((button) => button.onclick = () => chooseTarget(button.dataset.addMap));
  app.querySelectorAll("[data-remove-map]").forEach((button) => button.onclick = () => removeMapping(button.dataset.removeMap, button.dataset.targetId));
  app.querySelectorAll("[data-upload]").forEach((input) => input.onchange = () => handleUpload(input));
}

function action(name) {
  if (name === "new-project") { project = newProject("Untitled timetable"); view = "data"; render(); }
  if (name === "template") downloadTemplate();
  if (name === "upload-workbook") document.querySelector('[data-upload="workbook"]').click();
  if (name === "upload-project") document.querySelector('[data-upload="project"]').click();
  if (name === "export-workbook") exportWorkbook(project);
  if (name === "export-json") exportProject(project);
  if (name === "add-entity") addEntity();
  if (name === "paste-entities") addPastedEntities();
  if (name === "add-period") { project.timings.periods.push({ day: "Monday", number: project.timings.periods.length + 1, start: "", end: "" }); save(); render(); }
  if (name === "delete-project" && confirm(`Delete ${project.name}? This cannot be undone.`)) { deleteProject(project.id); project = null; view = "home"; render(); }
}

async function handleUpload(input) {
  const file = input.files[0];
  if (!file) return;
  try {
    const candidate = input.dataset.upload === "workbook" ? await importWorkbook(file) : await importProject(file);
    const summary = `${candidate.rooms.length} rooms, ${candidate.sections.length} sections, ${candidate.subjects.length} subjects, ${candidate.faculty.length} faculty records, and ${candidate.mentors.length} mentors.`;
    if (!confirm(`We found ${summary}\n\nImport these records?`)) return;
    project = candidate;
    save(); view = "data"; toast("Import complete. Check the records before mapping."); render();
  } catch (error) { toast(error.message || "Could not import this file.", "error"); }
  input.value = "";
}

function chooseTarget(sourceId) {
  const def = mappingDefs[mappingType];
  const options = project[def.target].map((item, index) => `${index + 1}. ${labelFor(item)}`).join("\n");
  const answer = prompt(`Choose a ${def.target.slice(0, -1)} by number:\n${options}`);
  const target = project[def.target][Number(answer) - 1];
  if (target) addMapping(sourceId, target.id);
}

function removeMapping(sourceId, targetId) {
  const def = mappingDefs[mappingType];
  if (def.multiple) project.mappings[mappingType][sourceId] = (project.mappings[mappingType][sourceId] || []).filter((id) => id !== targetId);
  else delete project.mappings[mappingType][sourceId];
  save(); render();
}

render();
