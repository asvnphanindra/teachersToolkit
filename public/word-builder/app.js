(() => {
  "use strict";

  const CSE = window.TeacherToolkitContentSafety;
  const CSE_POLICY = window.TeacherToolkitContentSafetyPolicy;
  const state = {
    puzzle: null,
    fileName: "",
    statuses: new Map(),
    score: 0,
    view: "scrambled",
    tileOrder: [],
    answerTimer: null,
    previewTimer: null,
    previewInterval: null,
    activeAnswer: "",
    pendingCompletion: false
  };
  const $ = id => document.getElementById(id);
  const els = {
    file: $("file-input"), load: $("load-button"), welcomeLoad: $("welcome-load-button"),
    title: $("puzzle-title"), subtitle: $("puzzle-subtitle"), fileName: $("puzzle-file"),
    welcome: $("welcome-panel"), panel: $("game-panel"), board: $("letter-board"),
    view: $("letter-view"), input: $("guess-input"), check: $("check-button"), feedback: $("feedback"),
    found: $("found-count"), score: $("score"), progress: $("progress-panel"), wordList: $("word-list"),
    restart: $("restart-button"), newPuzzle: $("new-puzzle-button"), classroom: $("classroom-mode-button"),
    showWords: $("show-words-button"), preview: $("word-preview-dialog"), previewList: $("word-preview-list"),
    previewTimer: $("word-preview-timer"), closePreview: $("close-preview-button"),
    complete: $("completion-dialog"), completeSummary: $("completion-summary"),
    completeRestart: $("completion-restart-button"), completeLoad: $("completion-load-button"),
    questionDialog: $("question-dialog"), questionSuccess: $("question-success-message"),
    followUpQuestion: $("follow-up-question"), followUpAnswer: $("follow-up-answer"),
    answerTimer: $("answer-timer"), showAnswer: $("show-answer-button")
  };

  function parseIni(text) {
    const sections = {};
    let section = null;
    text.replace(/^\uFEFF/, "").split(/\r?\n/).forEach((raw, number) => {
      const line = raw.trim();
      if (!line || /^[;#]/.test(line)) return;
      const header = line.match(/^\[([^\]]+)]$/);
      if (header) {
        section = header[1].trim().toLowerCase();
        sections[section] ??= {};
        return;
      }
      const pair = line.match(/^([^=]+)=(.*)$/);
      if (!pair || !section) throw new Error(`Invalid INI syntax on line ${number + 1}.`);
      sections[section][pair[1].trim().toLowerCase()] = pair[2].trim();
    });
    if (!sections.puzzle || !sections.words) throw new Error("The INI file must contain [Puzzle] and [Words] sections.");
    return sections;
  }

  function parseBoolean(value, fallback) {
    if (value === undefined) return fallback;
    if (/^(true|yes|1)$/i.test(value)) return true;
    if (/^(false|no|0)$/i.test(value)) return false;
    throw new Error(`Expected true or false, received "${value}".`);
  }

  function requireSafeText(value, label) {
    const result = CSE.validateText(value, CSE_POLICY);
    if (!result.safe) throw new Error(`${label} contains blocked content: ${result.matches[0].term}.`);
  }

  function requireSafeWord(value, label) {
    const result = CSE.validateWord(value, CSE_POLICY);
    if (!result.safe) throw new Error(`${label} is blocked by the content safety policy: ${result.matches[0].term}.`);
  }

  function buildPuzzle(sections) {
    const config = sections.puzzle;
    const integer = (name, fallback) => {
      const value = config[name] ?? fallback;
      if (!/^\d+$/.test(String(value)) || Number(value) < 1) {
        throw new Error(`Puzzle setting "${name}" must be a positive integer.`);
      }
      return Number(value);
    };
    const fontSize = Number(config.font_size ?? 34);
    if (!Number.isFinite(fontSize) || fontSize < 16 || fontSize > 100) {
      throw new Error('Puzzle setting "font_size" must be a number from 16 to 100.');
    }
    const letterView = (config.letter_view ?? "scrambled").trim().toLowerCase();
    if (!["scrambled", "grid", "grouped"].includes(letterView)) {
      throw new Error('Puzzle setting "letter_view" must be scrambled, grid, or grouped.');
    }
    const wordPreviewSeconds = Number(config.word_preview_seconds ?? 5);
    if (!Number.isInteger(wordPreviewSeconds) || wordPreviewSeconds < 0 || wordPreviewSeconds > 60) {
      throw new Error('Puzzle setting "word_preview_seconds" must be a whole number from 0 to 60.');
    }
    const title = config.title?.trim() || "Word Builder";
    requireSafeText(title, "Puzzle title");

    const seen = new Set();
    const words = [];
    Object.values(sections.words).forEach(value => {
      const display = value.trim().replace(/\s+/g, " ");
      const search = display.replace(/\s+/g, "").toUpperCase();
      if (!search) return;
      if (!/^[A-Z]+$/.test(search)) throw new Error(`"${display}" contains invalid characters. Use letters and optional spaces only.`);
      if (seen.has(search)) throw new Error(`Duplicate word: ${search}.`);
      requireSafeWord(display, `Word "${display}"`);
      seen.add(search);
      words.push({ search, display: display.toUpperCase(), tiles: [...search] });
    });
    if (!words.length) throw new Error("The [Words] section has no usable words.");
    const columns = integer("columns", 8);
    const letterCount = words.reduce((total, word) => total + word.tiles.length, 0);
    const rows = integer("rows", Math.ceil(letterCount / columns));
    if (rows * columns < letterCount) {
      throw new Error(`A ${rows} × ${columns} grid has ${rows * columns} cells, but this puzzle needs ${letterCount} letter tiles.`);
    }

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
      else if (value.trim()) {
        requireSafeText(value.trim(), `${property === "question" ? "Question" : "Answer"} for "${match[1]}"`);
        followUp[property] = value.trim();
      }
      followUps.set(search, followUp);
    });

    return {
      title,
      fontSize,
      letterView,
      rows,
      columns,
      letterCount,
      wordPreviewSeconds,
      askQuestions: parseBoolean(config.ask_questions, true),
      showWordsToFind: parseBoolean(config.show_words_to_find, false),
      words,
      followUps
    };
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
    }
    return copy;
  }

  function tileId(word, index) {
    return `${word.search}-${index}`;
  }

  function tileGrid(puzzle, tiles) {
    const grid = Array.from({ length: puzzle.rows }, () => Array(puzzle.columns).fill(""));
    tiles.forEach((tile, index) => {
      grid[Math.floor(index / puzzle.columns)][index % puzzle.columns] = tile.letter;
    });
    return grid;
  }

  function safeTileOrder(puzzle) {
    const tiles = puzzle.words.flatMap(word => word.tiles.map((letter, index) => ({
      id: tileId(word, index), search: word.search, letter, index
    })));
    for (let attempt = 0; attempt < CSE.generationAttemptLimit(CSE_POLICY); attempt++) {
      const candidate = shuffle(tiles);
      if (!CSE.findUnsafeGridMatches(tileGrid(puzzle, candidate), CSE_POLICY).length) return candidate;
    }
    throw new Error("Unable to arrange the letter tiles safely. Change the words, grid dimensions, or content safety policy.");
  }

  function startGame() {
    state.statuses = new Map(state.puzzle.words.map(word => [word.search, "unfound"]));
    state.score = 0;
    state.view = state.puzzle.letterView;
    state.tileOrder = safeTileOrder(state.puzzle);
    state.pendingCompletion = false;
    clearFollowUp();
    clearWordPreview();
    els.title.textContent = state.puzzle.title;
    els.subtitle.textContent = `${state.puzzle.rows} × ${state.puzzle.columns} letter grid • Build words using the letters on the board.`;
    els.fileName.textContent = state.fileName ? `File: ${state.fileName}` : "";
    els.fileName.hidden = !state.fileName;
    els.view.value = state.view;
    els.showWords.textContent = `Show words (${state.puzzle.wordPreviewSeconds}s)`;
    els.showWords.hidden = state.puzzle.wordPreviewSeconds === 0;
    els.progress.hidden = !state.puzzle.showWordsToFind;
    els.welcome.hidden = true;
    els.panel.hidden = false;
    setFeedback("", "");
    render();
    els.input.focus();
    if (state.puzzle.wordPreviewSeconds) window.setTimeout(showWordPreview, 150);
  }

  function render() {
    els.board.style.setProperty("--letter-size", `${state.puzzle.fontSize}px`);
    els.board.className = `letter-board ${state.view}`;
    els.board.innerHTML = "";
    els.board.style.gridTemplateColumns = "";
    els.board.style.gridTemplateRows = "";

    if (state.view === "grouped") {
      state.puzzle.words.forEach(word => {
        const pack = document.createElement("div");
        pack.className = `letter-pack ${state.statuses.get(word.search)}`;
        pack.setAttribute("aria-label", `Letter pack with ${word.tiles.length} letters`);
        word.tiles.forEach((letter, index) => pack.append(createTile({
          id: tileId(word, index), search: word.search, letter, index
        })));
        els.board.append(pack);
      });
    } else {
      state.tileOrder.forEach(tile => els.board.append(createTile(tile)));
      if (state.view === "grid") {
        els.board.style.gridTemplateColumns = `repeat(${state.puzzle.columns}, minmax(3.2rem, 1fr))`;
        els.board.style.gridTemplateRows = `repeat(${state.puzzle.rows}, minmax(3.2rem, 1fr))`;
        for (let index = state.puzzle.letterCount; index < state.puzzle.rows * state.puzzle.columns; index++) {
          els.board.append(createBlankTile());
        }
      }
    }
    renderWordList();
    updateStats();
  }

  function createTile(tile) {
    const element = document.createElement("span");
    const status = state.statuses.get(tile.search);
    element.className = `letter-tile ${status}`;
    element.textContent = tile.letter;
    element.setAttribute("aria-label", status === "found" ? `${tile.letter}, used` : tile.letter);
    if (status === "found") element.setAttribute("aria-disabled", "true");
    return element;
  }

  function createBlankTile() {
    const element = document.createElement("span");
    element.className = "letter-tile empty";
    element.setAttribute("aria-hidden", "true");
    return element;
  }

  function renderWordList() {
    els.wordList.innerHTML = "";
    state.puzzle.words.forEach(word => {
      const item = document.createElement("li");
      const status = state.statuses.get(word.search);
      if (status === "found") item.className = "student-found";
      item.textContent = status === "found" ? word.display : "Word not yet built";
      els.wordList.append(item);
    });
  }

  function updateStats() {
    const found = [...state.statuses.values()].filter(status => status === "found").length;
    els.found.textContent = `${found} / ${state.puzzle.words.length}`;
    els.score.textContent = state.score;
  }

  function setFeedback(message, type) {
    els.feedback.textContent = message;
    els.feedback.className = `feedback ${type}`;
  }

  function clearFollowUp() {
    window.clearInterval(state.answerTimer);
    state.answerTimer = null;
    state.activeAnswer = "";
    els.followUpAnswer.hidden = true;
    els.followUpAnswer.classList.remove("answer-revealed");
    els.followUpAnswer.textContent = "";
    els.answerTimer.hidden = true;
    els.answerTimer.textContent = "";
    els.showAnswer.disabled = false;
    els.showAnswer.textContent = "Show answer";
  }

  function clearWordPreview() {
    window.clearTimeout(state.previewTimer);
    window.clearInterval(state.previewInterval);
    state.previewTimer = null;
    state.previewInterval = null;
    if (els.preview.open) els.preview.close();
  }

  function showWordPreview() {
    if (!state.puzzle || !state.puzzle.wordPreviewSeconds || els.questionDialog.open) return;
    clearWordPreview();
    els.previewList.innerHTML = "";
    state.puzzle.words.forEach(word => {
      const item = document.createElement("li");
      item.textContent = word.display;
      els.previewList.append(item);
    });
    let remaining = state.puzzle.wordPreviewSeconds;
    const updateTimer = () => {
      els.previewTimer.textContent = `The words disappear in ${remaining} second${remaining === 1 ? "" : "s"}.`;
    };
    updateTimer();
    els.preview.showModal();
    state.previewInterval = window.setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        updateTimer();
        return;
      }
      clearWordPreview();
    }, 1000);
  }

  function startAnswerTimer() {
    let remaining = 10;
    els.showAnswer.disabled = true;
    els.showAnswer.textContent = `Show answer (${remaining}s)`;
    els.answerTimer.hidden = false;
    els.answerTimer.textContent = `Discuss the question — the answer can be revealed in ${remaining} seconds.`;
    state.answerTimer = window.setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        els.showAnswer.textContent = `Show answer (${remaining}s)`;
        els.answerTimer.textContent = `Discuss the question — the answer can be revealed in ${remaining} seconds.`;
        return;
      }
      window.clearInterval(state.answerTimer);
      state.answerTimer = null;
      els.showAnswer.disabled = false;
      els.showAnswer.textContent = "Show answer";
      els.answerTimer.textContent = "You can now reveal the answer.";
    }, 1000);
  }

  function offerFollowUp(word) {
    const followUp = state.puzzle.followUps.get(word.search);
    if (!state.puzzle.askQuestions || !followUp || followUp.enabled === false) return;
    state.activeAnswer = followUp.answer ?? "";
    els.questionSuccess.textContent = `✓ ${word.display} is correct. Discuss this related question.`;
    els.followUpQuestion.textContent = followUp.question || `What can you tell us about ${word.display}?`;
    els.showAnswer.hidden = !state.activeAnswer;
    document.body.classList.add("question-active");
    els.questionDialog.showModal();
    if (state.activeAnswer) startAnswerTimer();
  }

  function showAnswer() {
    if (!state.activeAnswer || els.showAnswer.disabled) return;
    els.followUpAnswer.textContent = `Answer: ${state.activeAnswer}`;
    els.followUpAnswer.hidden = false;
    els.followUpAnswer.classList.add("answer-revealed");
  }

  function checkWord() {
    const search = els.input.value.trim().replace(/\s+/g, "").toUpperCase();
    if (!search) {
      setFeedback("Enter a word first.", "info");
      return;
    }
    const word = state.puzzle.words.find(item => item.search === search);
    els.input.value = "";
    if (!word) {
      setFeedback("That word is not in this puzzle. Look closely and try again.", "incorrect");
      return;
    }
    if (state.statuses.get(search) !== "unfound") {
      setFeedback(`${word.display} was already built.`, "info");
      return;
    }
    state.statuses.set(search, "found");
    state.score += 10;
    render();
    setFeedback(`✓ ${word.display} BUILT! +10 points`, "correct");
    offerFollowUp(word);
    checkCompletion();
  }

  function checkCompletion() {
    if (![...state.statuses.values()].every(status => status === "found")) return;
    const found = [...state.statuses.values()].filter(status => status === "found").length;
    els.completeSummary.textContent = `Students built all ${found} words. Final score: ${state.score}.`;
    if (els.questionDialog.open) {
      state.pendingCompletion = true;
      return;
    }
    window.setTimeout(() => els.complete.showModal(), 450);
  }

  function loadFile() {
    els.file.click();
  }

  function readFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state.puzzle = buildPuzzle(parseIni(reader.result));
        state.fileName = file.name;
        startGame();
      } catch (error) {
        showError(error.message);
      }
    };
    reader.onerror = () => showError("The selected file could not be read.");
    reader.readAsText(file);
    event.target.value = "";
  }

  function showError(message) {
    clearFollowUp();
    clearWordPreview();
    els.welcome.hidden = false;
    els.panel.hidden = true;
    els.title.textContent = "Word Builder";
    els.subtitle.textContent = message;
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
    } catch { /* Fullscreen may be unavailable; classroom styling still applies. */ }
  }

  els.load.addEventListener("click", loadFile);
  els.welcomeLoad.addEventListener("click", loadFile);
  els.file.addEventListener("change", readFile);
  els.check.addEventListener("click", checkWord);
  els.input.addEventListener("keydown", event => {
    if (event.key === "Enter") checkWord();
  });
  els.view.addEventListener("change", () => {
    state.view = els.view.value;
    render();
  });
  els.restart.addEventListener("click", startGame);
  els.newPuzzle.addEventListener("click", loadFile);
  els.showWords.addEventListener("click", showWordPreview);
  els.closePreview.addEventListener("click", clearWordPreview);
  els.preview.addEventListener("close", clearWordPreview);
  els.showAnswer.addEventListener("click", showAnswer);
  els.questionDialog.addEventListener("close", () => {
    document.body.classList.remove("question-active");
    clearFollowUp();
    if (state.pendingCompletion) {
      state.pendingCompletion = false;
      window.setTimeout(() => els.complete.showModal(), 150);
    }
  });
  els.completeRestart.addEventListener("click", startGame);
  els.completeLoad.addEventListener("click", loadFile);
  els.classroom.addEventListener("click", toggleClassroomMode);
  document.addEventListener("keydown", event => {
    if (event.target.matches("input, select, textarea") || !state.puzzle || els.questionDialog.open) return;
    if (event.key.toLowerCase() === "f") toggleClassroomMode();
  });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && document.body.classList.contains("classroom-mode")) {
      document.body.classList.remove("classroom-mode");
      els.classroom.textContent = "Start classroom mode";
    }
  });
})();
