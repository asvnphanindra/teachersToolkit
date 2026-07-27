(() => {
  "use strict";

  const DIRECTION_GROUPS = {
    horizontal: [[0, 1]],
    vertical: [[1, 0]],
    diagonal: [[1, 1], [1, -1]]
  };
  const WORD_COLOURS = ["#087f5b", "#1f5f9f", "#7b3fa3", "#c04b22", "#0b7285", "#9c36b5"];
  const state = { puzzle: null, fileName: "", grid: [], placements: new Map(), statuses: new Map(), score: 0, activeAnswer: "", pendingCompletion: false };
  const $ = id => document.getElementById(id);
  const els = {
    file: $("file-input"), load: $("load-button"), welcomeLoad: $("welcome-load-button"),
    title: $("puzzle-title"), subtitle: $("puzzle-subtitle"), fileName: $("puzzle-file"), welcome: $("welcome-panel"),
    panel: $("game-panel"), grid: $("word-grid"), wordList: $("word-list"),
    input: $("guess-input"), check: $("check-button"), feedback: $("feedback"),
    questionDialog: $("question-dialog"), followUpQuestion: $("follow-up-question"),
    questionSuccess: $("question-success-message"), showAnswer: $("show-answer-button"), followUpAnswer: $("follow-up-answer"),
    found: $("found-count"), score: $("score"), hint: $("hint-button"), reveal: $("reveal-button"),
    same: $("same-grid-button"), fresh: $("new-grid-button"), classroom: $("classroom-mode-button"),
    revealDialog: $("reveal-dialog"), revealSelect: $("reveal-select"), confirmReveal: $("confirm-reveal-button"),
    complete: $("completion-dialog"), completeSummary: $("completion-summary"),
    completeSame: $("completion-same-button"), completeNew: $("completion-new-button"), completeLoad: $("completion-load-button")
  };

  function parseIni(text) {
    const sections = {};
    let section = null;
    text.replace(/^\uFEFF/, "").split(/\r?\n/).forEach((raw, number) => {
      const line = raw.trim();
      if (!line || /^[;#]/.test(line)) return;
      const header = line.match(/^\[([^\]]+)]$/);
      if (header) { section = header[1].trim().toLowerCase(); sections[section] ??= {}; return; }
      const pair = line.match(/^([^=]+)=(.*)$/);
      if (!pair || !section) throw new Error(`Invalid INI syntax on line ${number + 1}.`);
      sections[section][pair[1].trim().toLowerCase()] = pair[2].trim();
    });
    if (!sections.puzzle || !sections.words) throw new Error("The INI file must contain [Puzzle] and [Words] sections.");
    return sections;
  }

  function buildPuzzle(sections) {
    const config = sections.puzzle;
    const integer = (name, fallback) => {
      const value = config[name] ?? fallback;
      if (!/^\d+$/.test(String(value)) || Number(value) < 1) throw new Error(`Puzzle setting "${name}" must be a positive integer.`);
      return Number(value);
    };
    const rows = integer("rows"), columns = integer("columns");
    const fontSize = Number(config.font_size ?? 24);
    if (!Number.isFinite(fontSize) || fontSize < 8 || fontSize > 72) throw new Error('Puzzle setting "font_size" must be a number from 8 to 72.');
    const names = (config.directions ?? "").toLowerCase().split(",").map(x => x.trim()).filter(Boolean);
    if (!names.length) throw new Error('Puzzle setting "directions" must select horizontal, vertical, and/or diagonal.');
    const unknown = names.filter(name => !DIRECTION_GROUPS[name]);
    if (unknown.length) throw new Error(`Unsupported direction: ${unknown.join(", ")}.`);
    const words = [];
    const seen = new Set();
    Object.values(sections.words).forEach(value => {
      const display = value.trim().replace(/\s+/g, " ");
      const search = display.replace(/\s+/g, "").toUpperCase();
      if (!search) return;
      if (!/^[A-Z]+$/.test(search)) throw new Error(`"${display}" contains invalid characters. Use letters and optional spaces only.`);
      if (seen.has(search)) throw new Error(`Duplicate word: ${search}.`);
      if (search.length > Math.max(rows, columns)) throw new Error(`"${search}" is too long for a ${rows} × ${columns} grid.`);
      seen.add(search); words.push({ search, display: display.toUpperCase() });
    });
    if (!words.length) throw new Error("The [Words] section has no usable words.");
    const followUps = new Map();
    Object.entries(sections.questions ?? {}).forEach(([key, value]) => {
      const match = key.match(/^(.*)\.(question|answer|enabled)$/i);
      if (!match) throw new Error(`Question key "${key}" must end in ".question", ".answer", or ".enabled".`);
      const search = match[1].replace(/\s+/g, "").toUpperCase();
      if (!/^[A-Z]+$/.test(search)) throw new Error(`Question key "${key}" must name a word using letters and optional spaces.`);
      if (!seen.has(search)) throw new Error(`Question supplied for "${match[1]}", but that word is not in [Words].`);
      const followUp = followUps.get(search) ?? {};
      const property = match[2].toLowerCase();
      if (property === "enabled") followUp.enabled = parseBoolean(value.trim(), true);
      else if (value.trim()) followUp[property] = value.trim();
      followUps.set(search, followUp);
    });
    return {
      title: config.title?.trim() || "Word Hunt",
      rows, columns, fontSize, directions: names,
      allowReverse: parseBoolean(config.allow_reverse, true),
      allowOverlap: parseBoolean(config.allow_overlap, true),
      hints: parseBoolean(config.hints, true),
      showWordsToFind: parseBoolean(config.show_words_to_find, true),
      askQuestions: parseBoolean(config.ask_questions, true),
      words, followUps
    };
  }

  function parseBoolean(value, fallback) {
    if (value === undefined) return fallback;
    if (/^(true|yes|1)$/i.test(value)) return true;
    if (/^(false|no|0)$/i.test(value)) return false;
    throw new Error(`Expected true or false, received "${value}".`);
  }

  const shuffle = array => {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    return copy;
  };

  function makeDirections(puzzle) {
    let directions = puzzle.directions.flatMap(group => DIRECTION_GROUPS[group]);
    if (puzzle.allowReverse) directions = directions.concat(directions.map(([dr, dc]) => [-dr, -dc]));
    return directions;
  }

  function generateGrid(puzzle) {
    const directions = makeDirections(puzzle);
    // Rebuild from scratch to avoid a locally valid placement blocking a later word.
    for (let restart = 0; restart < 80; restart++) {
      const grid = Array.from({ length: puzzle.rows }, () => Array(puzzle.columns).fill(""));
      const placements = new Map();
      let failed = false;
      for (const word of shuffle([...puzzle.words].sort((a, b) => b.search.length - a.search.length))) {
        const candidates = [];
        for (const [dr, dc] of directions) for (let row = 0; row < puzzle.rows; row++) for (let col = 0; col < puzzle.columns; col++) {
          const endRow = row + dr * (word.search.length - 1), endCol = col + dc * (word.search.length - 1);
          if (endRow < 0 || endRow >= puzzle.rows || endCol < 0 || endCol >= puzzle.columns) continue;
          let valid = true;
          for (let i = 0; i < word.search.length; i++) {
            const current = grid[row + dr * i][col + dc * i];
            if (current && (!puzzle.allowOverlap || current !== word.search[i])) { valid = false; break; }
          }
          if (valid) candidates.push({ row, col, dr, dc, endRow, endCol });
        }
        if (!candidates.length) { failed = true; break; }
        const position = candidates[Math.floor(Math.random() * candidates.length)];
        [...word.search].forEach((letter, i) => { grid[position.row + position.dr * i][position.col + position.dc * i] = letter; });
        placements.set(word.search, { ...position, length: word.search.length });
      }
      if (!failed) {
        grid.forEach(row => row.forEach((letter, index) => { if (!letter) row[index] = String.fromCharCode(65 + Math.floor(Math.random() * 26)); }));
        return { grid, placements };
      }
    }
    throw new Error(`Unable to place all ${puzzle.words.length} words in a ${puzzle.rows} × ${puzzle.columns} grid. Try a larger grid, more directions, or allowing overlap.`);
  }

  function startGame(reuseGrid = false) {
    try {
      if (!reuseGrid) {
        const result = generateGrid(state.puzzle);
        state.grid = result.grid; state.placements = result.placements;
      }
      state.statuses = new Map(state.puzzle.words.map(word => [word.search, "unfound"]));
      state.score = 0;
      state.pendingCompletion = false;
      clearFollowUp();
      els.title.textContent = state.puzzle.title;
      els.subtitle.textContent = `${state.puzzle.rows} × ${state.puzzle.columns} • Find the hidden words!`;
      els.fileName.textContent = state.fileName ? `File: ${state.fileName}` : "";
      els.fileName.hidden = !state.fileName;
      els.welcome.hidden = true; els.panel.hidden = false;
      els.hint.hidden = !state.puzzle.hints;
      els.wordList.closest(".progress-panel").hidden = !state.puzzle.showWordsToFind;
      setFeedback("", "");
      render();
      els.input.focus();
    } catch (error) { showError(error.message); }
  }

  function render() {
    els.grid.style.setProperty("--letter-size", `${state.puzzle.fontSize}px`);
    sizeGrid();
    els.grid.style.gridTemplateColumns = `repeat(${state.puzzle.columns}, var(--cell-size))`;
    els.grid.innerHTML = "";
    state.grid.forEach((row, r) => row.forEach((letter, c) => {
      const cell = document.createElement("span");
      cell.className = "cell"; cell.textContent = letter; cell.dataset.row = r; cell.dataset.col = c;
      els.grid.append(cell);
    }));
    state.puzzle.words.forEach((word, index) => {
      const status = state.statuses.get(word.search);
      if (status !== "unfound") highlightWord(word.search, status, index);
    });
    renderWordList(); updateStats();
  }

  function sizeGrid() {
    if (!state.puzzle || !els.grid.parentElement) return;
    const availableWidth = Math.max(320, els.grid.parentElement.clientWidth - 16);
    const readableMinimum = Math.max(40, state.puzzle.fontSize + 16);
    const fittingSize = Math.floor((availableWidth - (state.puzzle.columns - 1) * 4) / state.puzzle.columns);
    // Preserve legibility; grids that cannot fit at a readable size scroll horizontally.
    const cellSize = Math.max(readableMinimum, Math.min(70, fittingSize));
    document.documentElement.style.setProperty("--cell-size", `${cellSize}px`);
  }

  function highlightWord(search, status, index = state.puzzle.words.findIndex(word => word.search === search)) {
    const placement = state.placements.get(search);
    for (let i = 0; i < placement.length; i++) {
      const cell = els.grid.querySelector(`[data-row="${placement.row + placement.dr * i}"][data-col="${placement.col + placement.dc * i}"]`);
      if (!cell) continue;
      cell.classList.add(status === "found" ? "found" : "revealed");
      if (status === "found") cell.style.setProperty("--word-color", WORD_COLOURS[index % WORD_COLOURS.length]);
    }
  }

  function renderWordList() {
    els.wordList.innerHTML = "";
    state.puzzle.words.forEach(word => {
      const item = document.createElement("li");
      const status = state.statuses.get(word.search);
      if (status === "found") item.className = "student-found";
      if (status === "revealed") item.className = "teacher-revealed";
      item.textContent = word.display; els.wordList.append(item);
    });
  }
  function updateStats() {
    const completed = [...state.statuses.values()].filter(status => status !== "unfound").length;
    els.found.textContent = `${completed} / ${state.puzzle.words.length}`;
    els.score.textContent = state.score;
  }
  function setFeedback(message, type) { els.feedback.textContent = message; els.feedback.className = `feedback ${type}`; }
  function clearFollowUp() {
    state.activeAnswer = "";
    els.followUpAnswer.classList.remove("answer-revealed");
    els.followUpAnswer.hidden = true;
    els.followUpAnswer.setAttribute("aria-hidden", "true");
    els.followUpAnswer.textContent = "";
  }
  function offerFollowUp(word) {
    const followUp = state.puzzle.followUps.get(word.search);
    if (!state.puzzle.askQuestions || !followUp || followUp.enabled === false) { clearFollowUp(); return; }
    state.activeAnswer = followUp.answer ?? "";
    els.questionSuccess.textContent = `✓ Your Word Hunt identification of ${word.display} is correct. Answer a question related to this word.`;
    els.followUpQuestion.textContent = followUp.question || `Class discussion: What can you tell us about ${word.display}?`;
    els.followUpAnswer.hidden = true;
    els.followUpAnswer.classList.remove("answer-revealed");
    els.followUpAnswer.setAttribute("aria-hidden", "true");
    els.followUpAnswer.textContent = "";
    els.showAnswer.hidden = !state.activeAnswer;
    document.body.classList.add("question-active");
    els.questionDialog.showModal();
  }
  function showAnswer() {
    if (!state.activeAnswer) return;
    els.followUpAnswer.textContent = `Answer: ${state.activeAnswer}`;
    els.followUpAnswer.hidden = false;
    els.followUpAnswer.setAttribute("aria-hidden", "false");
    els.followUpAnswer.classList.add("answer-revealed");
  }

  function checkWord() {
    const search = els.input.value.trim().replace(/\s+/g, "").toUpperCase();
    if (!search) { setFeedback("Enter a word first.", "info"); return; }
    const word = state.puzzle.words.find(item => item.search === search);
    els.input.value = "";
    if (!word) { setFeedback("Not found — try another word.", "incorrect"); return; }
    const status = state.statuses.get(search);
    if (status !== "unfound") { setFeedback(`${word.display} was already ${status === "found" ? "found" : "revealed"}.`, "info"); return; }
    state.statuses.set(search, "found"); state.score += 10;
    highlightWord(search, "found"); renderWordList(); updateStats();
    setFeedback(`✓ ${word.display} FOUND! +10 points`, "correct");
    offerFollowUp(word);
    checkCompletion();
  }

  function showHint() {
    const candidates = state.puzzle.words.filter(word => state.statuses.get(word.search) === "unfound");
    if (!candidates.length) return;
    const word = candidates[Math.floor(Math.random() * candidates.length)];
    const placement = state.placements.get(word.search);
    const direction = placement.dr === 0 ? "horizontal" : placement.dc === 0 ? "vertical" : "diagonal";
    const hints = [`A word starts with “${word.search[0]}”.`, `A word is ${direction}.`, `A word begins at Row ${placement.row + 1}, Column ${placement.col + 1}.`];
    setFeedback(`Hint: ${hints[Math.floor(Math.random() * hints.length)]}`, "info");
  }

  function openReveal() {
    const candidates = state.puzzle.words.filter(word => state.statuses.get(word.search) === "unfound");
    if (!candidates.length) return;
    els.revealSelect.innerHTML = candidates.map(word => `<option value="${word.search}">${word.display}</option>`).join("");
    els.revealDialog.showModal();
  }
  function revealSelected() {
    const search = els.revealSelect.value;
    if (!search || state.statuses.get(search) !== "unfound") return;
    state.statuses.set(search, "revealed"); highlightWord(search, "revealed"); renderWordList(); updateStats();
    setFeedback(`${search} revealed — no points awarded.`, "info"); checkCompletion();
  }
  function checkCompletion() {
    if ([...state.statuses.values()].every(status => status !== "unfound")) {
      const found = [...state.statuses.values()].filter(status => status === "found").length;
      els.completeSummary.textContent = `Students found ${found} of ${state.puzzle.words.length} words. Final score: ${state.score}.`;
      if (els.questionDialog.open) { state.pendingCompletion = true; return; }
      window.setTimeout(() => els.complete.showModal(), 450);
    }
  }

  function loadFile() { els.file.click(); }
  function readFile(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state.puzzle = buildPuzzle(parseIni(reader.result));
        state.fileName = file.name;
        startGame(false);
      }
      catch (error) { showError(error.message); }
    };
    reader.onerror = () => showError("The selected file could not be read.");
    reader.readAsText(file); event.target.value = "";
  }
  function showError(message) {
    els.welcome.hidden = false; els.panel.hidden = true; els.title.textContent = "Word Hunt"; els.subtitle.textContent = message;
    els.fileName.hidden = true;
    els.welcome.querySelector("p").textContent = `Puzzle error: ${message}`;
  }
  async function toggleClassroomMode() {
    document.body.classList.toggle("classroom-mode");
    const active = document.body.classList.contains("classroom-mode");
    els.classroom.textContent = active ? "Exit classroom mode" : "Start classroom mode";
    try {
      if (active && !document.fullscreenElement) await document.documentElement.requestFullscreen();
      else if (!active && document.fullscreenElement) await document.exitFullscreen();
    } catch { /* CSS classroom mode still works when fullscreen is unavailable. */ }
  }

  els.load.addEventListener("click", loadFile); els.welcomeLoad.addEventListener("click", loadFile); els.file.addEventListener("change", readFile);
  els.check.addEventListener("click", checkWord); els.input.addEventListener("keydown", event => { if (event.key === "Enter") checkWord(); });
  els.showAnswer.addEventListener("click", showAnswer);
  els.questionDialog.addEventListener("close", () => {
    document.body.classList.remove("question-active");
    clearFollowUp();
    if (state.pendingCompletion) {
      state.pendingCompletion = false;
      window.setTimeout(() => els.complete.showModal(), 150);
    }
  });
  els.hint.addEventListener("click", showHint); els.reveal.addEventListener("click", openReveal);
  els.confirmReveal.addEventListener("click", revealSelected);
  els.same.addEventListener("click", () => startGame(true)); els.fresh.addEventListener("click", () => startGame(false));
  els.classroom.addEventListener("click", toggleClassroomMode);
  els.completeSame.addEventListener("click", () => startGame(true)); els.completeNew.addEventListener("click", () => startGame(false)); els.completeLoad.addEventListener("click", loadFile);
  document.addEventListener("keydown", event => {
    if (event.target.matches("input, select, textarea") || !state.puzzle || els.questionDialog.open) return;
    if (event.key.toLowerCase() === "h") showHint();
    if (event.key.toLowerCase() === "r") openReveal();
    if (event.key.toLowerCase() === "n") startGame(false);
    if (event.key.toLowerCase() === "f") toggleClassroomMode();
  });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && document.body.classList.contains("classroom-mode")) {
      document.body.classList.remove("classroom-mode"); els.classroom.textContent = "Start classroom mode";
    }
  });
  window.addEventListener("resize", () => {
    if (state.puzzle && !els.panel.hidden) sizeGrid();
  });
})();
