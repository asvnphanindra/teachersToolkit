import { saveTimetable } from "../storage.js";

export function renderConstraints(app) {
  const c = app.tt.constraints;
  app.el.innerHTML = `
    <div class="tt-app">
      <h1 class="tt-page-title">Constraints</h1>
      <div class="tt-card">
        <div class="tt-form-row">
          <label><input type="checkbox" id="prevent-overlaps" ${c.preventOverlaps !== false ? "checked" : ""}> Prevent faculty &amp; room overlaps (alert on clash)</label>
        </div>
        <div class="tt-form-row">
          <label>Max consecutive lecture periods per section per day</label>
          <input type="number" id="max-consec" min="1" max="8" value="${c.maxConsecutiveLectures ?? 2}">
          <p class="tt-page-sub">Alert when a section exceeds this many back-to-back lecture periods.</p>
        </div>
        <div class="tt-actions">
          <button class="btn btn--secondary" id="back">&larr; Planner</button>
          <button class="btn btn--primary" id="save">Save</button>
        </div>
      </div>
    </div>
  `;
  app.el.querySelector("#back").onclick = () => app.navigate("#/planner");
  app.el.querySelector("#save").onclick = () => {
    app.tt.constraints = {
      preventOverlaps: app.el.querySelector("#prevent-overlaps").checked,
      maxConsecutiveLectures: Number(app.el.querySelector("#max-consec").value) || 2,
    };
    saveTimetable(app.tt);
    app.navigate("#/planner");
  };
}
