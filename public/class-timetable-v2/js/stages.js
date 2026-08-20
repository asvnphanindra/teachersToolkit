import { STORAGE_PREFIX } from "./models.js";
import { fullMappingIssues, scheduleStats } from "./schedule.js";

export const STAGES = [
  {
    id: "plan",
    number: 1,
    label: "Plan",
    description: "Map sections to subjects, labs, and staff, then set working days and period times.",
  },
  {
    id: "schedule",
    number: 2,
    label: "Schedule",
    description: "Place periods on the grid and keep faculty from being double-booked.",
  },
  {
    id: "export",
    number: 3,
    label: "Export",
    description: "Print section and faculty timetables, or save a JSON backup.",
  },
];

export const VIEW_TO_STAGE = {
  intro: null,
  mapping: "plan",
  summary: "plan",
  timingSetup: "plan",
  projects: "plan",
  schedule: "schedule",
  export: "export",
};

export const INTRO_SEEN_KEY = `${STORAGE_PREFIX}introSeen`;

export function hasSeenIntro() {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function stageForView(view) {
  return VIEW_TO_STAGE[view] || null;
}

export function stageById(id) {
  return STAGES.find((stage) => stage.id === id) || STAGES[0];
}

/**
 * Per-stage lock / current / complete flags, plus schedule placement counts.
 * Plan is always open. Schedule locks until every mapping cell is filled.
 * Export is always reachable.
 */
export function stageState(project, currentView) {
  const issues = fullMappingIssues(project);
  const stats = scheduleStats(project);
  const currentStage = stageForView(currentView);
  const planComplete = issues.length === 0;
  const scheduleComplete = stats.placedPeriods > 0;
  const exportComplete = scheduleComplete;

  const byId = {
    plan: {
      locked: false,
      current: currentStage === "plan",
      complete: planComplete,
    },
    schedule: {
      locked: !planComplete,
      current: currentStage === "schedule",
      complete: scheduleComplete,
    },
    export: {
      locked: false,
      current: currentStage === "export",
      complete: exportComplete,
    },
  };

  return {
    currentStage,
    issues,
    stats,
    stages: STAGES.map((stage) => ({ ...stage, ...byId[stage.id] })),
    byId,
  };
}
