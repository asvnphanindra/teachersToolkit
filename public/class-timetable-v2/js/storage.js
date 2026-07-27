import { PROJECT_VERSION, createProject, normalizeProject, validateProject } from "./models.js";

const PREFIX = "ttk:class-timetable-v2:";
const INDEX_KEY = `${PREFIX}index`;

function index() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || "[]"); } catch { return []; }
}

export function listProjects() {
  return index().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function loadProject(id) {
  try { return normalizeProject(JSON.parse(localStorage.getItem(`${PREFIX}project:${id}`) || "null")); } catch { return null; }
}

export function saveProject(project) {
  project.meta = { ...project.meta, updatedAt: new Date().toISOString() };
  localStorage.setItem(`${PREFIX}project:${project.id}`, JSON.stringify(project));
  const next = index().filter((entry) => entry.id !== project.id);
  next.push({ id: project.id, name: project.name, updatedAt: project.meta.updatedAt });
  localStorage.setItem(INDEX_KEY, JSON.stringify(next));
}

export function deleteProject(id) {
  localStorage.removeItem(`${PREFIX}project:${id}`);
  localStorage.setItem(INDEX_KEY, JSON.stringify(index().filter((entry) => entry.id !== id)));
}

export function newProject(name) {
  const project = createProject(name);
  saveProject(project);
  return project;
}

function download(text, filename, type) {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([text], { type }));
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export function exportProject(project) {
  download(JSON.stringify(project, null, 2), `${safeName(project.name)}.timetable.json`, "application/json");
}

export async function importProject(file) {
  const project = normalizeProject(JSON.parse(await file.text()));
  const errors = validateProject(project);
  if (errors.length) throw new Error(errors[0]);
  project.id = createProject().id;
  project.meta = { ...project.meta, importedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  if (!project.schemaVersion) project.schemaVersion = PROJECT_VERSION;
  return project;
}

export function safeName(name) {
  return (name || "timetable").replace(/[^\w-]+/g, "_");
}
