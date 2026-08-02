(function (root) {
  "use strict";

  // Keep vocabulary and rules here so applications never hard-code policy decisions.
  root.TeacherToolkitContentSafetyPolicy = Object.freeze({
    blockedWords: [
      "ABUSE", "ASSAULT", "BOMB", "DRUG", "GUN", "KILL", "MURDER",
      "PORN", "RAPE", "SEX", "SUICIDE", "VIOLENCE"
    ],
    text: {
      enabled: true,
      matchWholeWords: true
    },
    grid: {
      enabled: true,
      directions: ["horizontal", "vertical", "diagonal"],
      checkReverse: true,
      minimumLength: 3,
      maxRepairAttempts: 40,
      maxGenerationAttempts: 80
    }
  });
})(window);
