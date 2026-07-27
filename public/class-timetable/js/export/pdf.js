import { getById, getSlot } from "../models.js";
import { getPlanningDays, periodHeader } from "../timings.js";

export function exportPdf(tt, sectionId) {
  const sec = getById(tt.sections, sectionId);
  if (!sec) return;

  const planDays = getPlanningDays(tt.timings);
  const { periodsPerDay } = tt.timings;
  let rows = "";
  planDays.forEach((day) => {
    rows += `<tr><td><b>${day}</b></td>`;
    for (let p = 1; p <= periodsPerDay; p++) {
      const slot = getSlot(tt, sectionId, day, p);
      const sub = slot ? getById(tt.subjects, slot.subjectId) : null;
      const fac = slot ? getById(tt.faculty, slot.facultyId) : null;
      rows += `<td>${sub ? `${sub.name}<br><small>${fac?.name || ""}</small>` : ""}</td>`;
    }
    rows += `</tr>`;
  });

  const headerCells = Array.from({ length: periodsPerDay }, (_, i) =>
    `<th>${periodHeader(tt.timings, i + 1).replace("<br>", " ")}</th>`).join("");

  const html = `
    <!DOCTYPE html><html><head><title>${tt.name}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; }
      h1 { font-size: 18px; } table { border-collapse: collapse; width: 100%; margin-top: 12px; }
      td, th { border: 1px solid #ccc; padding: 6px; font-size: 11px; text-align: center; }
      th { background: #f0f0f0; }
    </style></head><body>
    <h1>${tt.name} — ${sec.name}</h1>
    <table><tr><th>Day</th>${headerCells}</tr>${rows}</table>
    </body></html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}
