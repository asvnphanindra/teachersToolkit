import { renderHome } from "./views/home.js";
import { renderSetupTimings, renderSetupSections, renderSetupSubjects } from "./views/setup.js";
import { renderPlanner } from "./views/planner.js";
import { renderConstraints } from "./views/constraints.js";

const app = {
  tt: null,
  el: document.getElementById("app"),

  setTimetable(tt) {
    this.tt = tt;
  },

  navigate(hash) {
    location.hash = hash;
    this.route();
  },

  route() {
    const hash = location.hash || "#/home";
    if (!this.tt && !hash.startsWith("#/home")) {
      this.navigate("#/home");
      return;
    }

    switch (hash) {
      case "#/home":
        renderHome(this);
        break;
      case "#/setup/timings":
        renderSetupTimings(this);
        break;
      case "#/setup/sections":
        renderSetupSections(this);
        break;
      case "#/setup/subjects":
        renderSetupSubjects(this);
        break;
      case "#/planner":
        renderPlanner(this);
        break;
      case "#/constraints":
        renderConstraints(this);
        break;
      default:
        renderHome(this);
    }
  },
};

window.addEventListener("hashchange", () => app.route());
app.route();
