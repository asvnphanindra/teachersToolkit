import { STORAGE_PREFIX, createProject, normalizeProject } from "./models.js";

const INDEX_KEY = `${STORAGE_PREFIX}index`;

function readIndex() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || "[]"); } catch { return []; }
}

export function listProjects() {
  return readIndex().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function loadProject(id) {
  try {
    return normalizeProject(JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}project:${id}`) || "null"));
  } catch {
    return null;
  }
}

export function saveProject(project) {
  project.meta = { ...(project.meta || {}), updatedAt: new Date().toISOString() };
  localStorage.setItem(`${STORAGE_PREFIX}project:${project.id}`, JSON.stringify(project));
  const next = readIndex().filter((entry) => entry.id !== project.id);
  next.push({ id: project.id, name: project.name, updatedAt: project.meta.updatedAt });
  localStorage.setItem(INDEX_KEY, JSON.stringify(next));
}

export function deleteProject(id) {
  localStorage.removeItem(`${STORAGE_PREFIX}project:${id}`);
  localStorage.setItem(INDEX_KEY, JSON.stringify(readIndex().filter((entry) => entry.id !== id)));
}

export function ensureActiveProject() {
  const existing = listProjects()[0];
  if (existing) {
    const project = loadProject(existing.id);
    if (project) return project;
  }
  const project = createProject();
  saveProject(project);
  return project;
}

export function exportProjectJson(project) {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }));
  anchor.download = `${(project.name || "timetable").replace(/[^\w-]+/g, "_")}.mapping.json`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export function importProjectJson(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("Choose a mapping JSON file."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result || ""));
        const project = normalizeProject(raw);
        if (!project || !Array.isArray(project.columns) || !Array.isArray(project.rows)) {
          reject(new Error("That file is not a valid Class Timetable V2 mapping."));
          return;
        }
        // Treat import as a distinct project copy in this browser.
        project.id = `project-${crypto.randomUUID().slice(0, 8)}`;
        project.name = project.name || file.name.replace(/\.mapping\.json$/i, "").replace(/\.json$/i, "") || "Imported mapping";
        const now = new Date().toISOString();
        project.meta = {
          createdAt: project.meta?.createdAt || now,
          updatedAt: now,
          importedAt: now,
          importedFrom: file.name,
        };
        resolve(project);
      } catch {
        reject(new Error("Could not parse that JSON mapping file."));
      }
    };
    reader.readAsText(file);
  });
}
