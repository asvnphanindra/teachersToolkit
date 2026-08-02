(function (root) {
  "use strict";

  const DIRECTION_GROUPS = {
    horizontal: [[0, 1]],
    vertical: [[1, 0]],
    diagonal: [[1, 1], [1, -1]]
  };
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  function normalize(value) {
    return String(value ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  }

  function policyFor(policy) {
    const source = policy ?? root.TeacherToolkitContentSafetyPolicy ?? {};
    return {
      blockedWords: (source.blockedWords ?? [])
        .map(value => ({ term: String(value).trim(), normalized: normalize(value) }))
        .filter(entry => entry.normalized),
      text: { enabled: true, matchWholeWords: true, ...(source.text ?? {}) },
      grid: {
        enabled: true,
        directions: ["horizontal", "vertical", "diagonal"],
        checkReverse: true,
        minimumLength: 3,
        maxRepairAttempts: 40,
        maxGenerationAttempts: 80,
        ...(source.grid ?? {})
      }
    };
  }

  function textMatches(value, policy) {
    const config = policyFor(policy);
    if (!config.text.enabled) return [];
    const normalized = normalize(value);
    const tokens = String(value ?? "").toUpperCase().match(/[A-Z]+/g) ?? [];
    return config.blockedWords
      .filter(entry => {
        if (/\s/.test(entry.term)) return normalized.includes(entry.normalized);
        return config.text.matchWholeWords ? tokens.includes(entry.normalized) : normalized.includes(entry.normalized);
      })
      .map(entry => ({ term: entry.term }));
  }

  function validateText(value, policy) {
    const matches = textMatches(value, policy);
    return { safe: matches.length === 0, matches };
  }

  function validateWord(value, policy) {
    const normalized = normalize(value);
    const matches = policyFor(policy).blockedWords
      .filter(entry => normalized === entry.normalized)
      .map(entry => ({ term: entry.term }));
    return { safe: matches.length === 0, matches };
  }

  function directionsFor(config) {
    const directions = config.grid.directions.flatMap(name => DIRECTION_GROUPS[name] ?? []);
    return config.grid.checkReverse
      ? directions.concat(directions.map(([row, column]) => [-row, -column]))
      : directions;
  }

  function matchAt(grid, term, row, column, rowStep, columnStep) {
    const endRow = row + rowStep * (term.length - 1);
    const endColumn = column + columnStep * (term.length - 1);
    if (endRow < 0 || endRow >= grid.length || endColumn < 0 || endColumn >= grid[0].length) return null;
    for (let index = 0; index < term.length; index++) {
      if (normalize(grid[row + rowStep * index][column + columnStep * index]) !== term[index]) return null;
    }
    return {
      term,
      row,
      column,
      rowStep,
      columnStep,
      cells: Array.from({ length: term.length }, (_, index) => ({
        row: row + rowStep * index,
        column: column + columnStep * index
      }))
    };
  }

  function findUnsafeGridMatches(grid, policy) {
    const config = policyFor(policy);
    if (!config.grid.enabled || !Array.isArray(grid) || !grid.length || !grid[0].length) return [];
    const terms = config.blockedWords
      .map(entry => entry.normalized)
      .filter(term => term.length >= config.grid.minimumLength);
    const matches = [];
    for (const [rowStep, columnStep] of directionsFor(config)) {
      for (let row = 0; row < grid.length; row++) {
        for (let column = 0; column < grid[0].length; column++) {
          for (const term of terms) {
            const match = matchAt(grid, term, row, column, rowStep, columnStep);
            if (match) matches.push(match);
          }
        }
      }
    }
    return matches;
  }

  function repairGrid(grid, options = {}) {
    const config = policyFor(options.policy);
    const isMutable = options.isMutable ?? (() => true);
    for (let attempt = 0; attempt < config.grid.maxRepairAttempts; attempt++) {
      const match = findUnsafeGridMatches(grid, options.policy)[0];
      if (!match) return { safe: true, repairs: attempt, matches: [] };
      const candidates = match.cells.filter(cell => isMutable(cell.row, cell.column));
      if (!candidates.length) return { safe: false, repairs: attempt, matches: [match] };
      const cell = candidates[Math.floor(Math.random() * candidates.length)];
      const current = normalize(grid[cell.row][cell.column]);
      const replacements = ALPHABET.replace(current, "");
      grid[cell.row][cell.column] = replacements[Math.floor(Math.random() * replacements.length)];
    }
    return { safe: false, repairs: config.grid.maxRepairAttempts, matches: findUnsafeGridMatches(grid, options.policy) };
  }

  root.TeacherToolkitContentSafety = Object.freeze({
    normalize,
    validateText,
    validateWord,
    findUnsafeGridMatches,
    repairGrid,
    generationAttemptLimit(policy) {
      return policyFor(policy).grid.maxGenerationAttempts;
    }
  });
})(window);
