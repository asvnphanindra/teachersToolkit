import { STORAGE_PREFIX } from "./models.js";

const INDEX_KEY = `${STORAGE_PREFIX}index`;

export function listTimetables() {
  const index = JSON.parse(localStorage.getItem(INDEX_KEY) || "[]");
  return index.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function updateIndex(tt) {
  let index = JSON.parse(localStorage.getItem(INDEX_KEY) || "[]");
  const entry = { id: tt.id, name: tt.name, updatedAt: tt.meta.updatedAt };
  const i = index.findIndex((x) => x.id === tt.id);
  if (i >= 0) index[i] = entry;
  else index.push(entry);
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export function loadTimetable(id) {
  const raw = localStorage.getItem(`${STORAGE_PREFIX}timetable:${id}`);
  return raw ? JSON.parse(raw) : null;
}

export function saveTimetable(tt) {
  tt.meta.updatedAt = new Date().toISOString();
  localStorage.setItem(`${STORAGE_PREFIX}timetable:${tt.id}`, JSON.stringify(tt));
  updateIndex(tt);
}

export function deleteTimetable(id) {
  localStorage.removeItem(`${STORAGE_PREFIX}timetable:${id}`);
  let index = JSON.parse(localStorage.getItem(INDEX_KEY) || "[]");
  index = index.filter((x) => x.id !== id);
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export function duplicateTimetable(tt) {
  const copy = structuredClone(tt);
  copy.id = `tt-${crypto.randomUUID().slice(0, 8)}`;
  copy.name = `${tt.name} (copy)`;
  const now = new Date().toISOString();
  copy.meta = { createdAt: now, updatedAt: now, version: 1 };
  saveTimetable(copy);
  return copy;
}

export function exportJson(tt) {
  const blob = new Blob([JSON.stringify(tt, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${tt.name.replace(/[^\w\-]+/g, "_")}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function importJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const tt = JSON.parse(reader.result);
        if (!tt.id || !tt.name) throw new Error("Invalid timetable file");
        tt.id = `tt-${crypto.randomUUID().slice(0, 8)}`;
        tt.meta = { ...tt.meta, updatedAt: new Date().toISOString() };
        saveTimetable(tt);
        resolve(tt);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
