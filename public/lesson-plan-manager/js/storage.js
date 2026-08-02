import { createProject, normalizeProject, validateProject } from "./models.js";

const PREFIX = "ttk:lesson-plan-manager:";
const INDEX = `${PREFIX}index`;
const readIndex = () => { try { return JSON.parse(localStorage.getItem(INDEX) || "[]"); } catch { return []; } };

export function listProjects() {
  return readIndex().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}
export function loadProject(id) {
  try { return normalizeProject(JSON.parse(localStorage.getItem(`${PREFIX}project:${id}`) || "null")); } catch { return null; }
}
export function saveProject(project) {
  project.meta = { ...project.meta, updatedAt: new Date().toISOString() };
  localStorage.setItem(`${PREFIX}project:${project.id}`, JSON.stringify(project));
  localStorage.setItem(INDEX, JSON.stringify([...readIndex().filter((entry) => entry.id !== project.id), { id: project.id, name: project.name, updatedAt: project.meta.updatedAt }]));
}
export function newProject(name) {
  const project = createProject(name); saveProject(project); return project;
}
export function deleteProject(id) {
  localStorage.removeItem(`${PREFIX}project:${id}`);
  localStorage.setItem(INDEX, JSON.stringify(readIndex().filter((entry) => entry.id !== id)));
}
function download(text, filename, type) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type })); link.download = filename; link.click(); URL.revokeObjectURL(link.href);
}
const safeName = (name) => (name || "lesson-plan").replace(/[^\w-]+/g, "_");
export function exportProject(project) {
  download(JSON.stringify(project, null, 2), `${safeName(project.name)}.lesson-plan.json`, "application/json");
}
export async function importProject(file) {
  const project = normalizeProject(JSON.parse(await file.text()));
  const errors = validateProject(project);
  if (errors.length) throw new Error(errors[0]);
  const blank = createProject();
  project.id = blank.id;
  project.meta = { ...project.meta, importedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  return project;
}
