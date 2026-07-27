# Classroom Word Hunt

A dependency-free, offline classroom display game. The teacher operates the controls; students see the projected grid and answer verbally.

## Run offline

Open `index.html` in a current desktop browser, then choose **Load puzzle** and select an `.ini` file. No web server, account, network connection, or installation is required.

Browsers intentionally do not let a web page list or silently read files from a local `puzzles` folder. That is why this application uses the teacher-initiated file picker. The included files in `puzzles/` can be selected from it.

## INI format

```ini
; Lines beginning with ; or # are comments.
[Puzzle]
title=My Topic Word Hunt
rows=12
columns=12
font_size=28
directions=horizontal,vertical,diagonal
allow_reverse=true
allow_overlap=true
hints=true
show_words_to_find=true
ask_questions=true

[Words]
word1=ALGORITHM
word2=PRIMARY KEY
word3=DATABASE
word4=ENGINEERING

[Questions]
ENGINEERING.question=How does engineering use science and mathematics to solve real-world problems?
ENGINEERING.answer=Engineering uses scientific and mathematical knowledge to design and build solutions to real-world problems.
ENGINEERING.enabled=true
```

### `[Puzzle]` keys

| Key | Required | Meaning |
|---|---:|---|
| `title` | no | Displayed puzzle heading. Defaults to `Word Hunt`. |
| `rows`, `columns` | yes | Positive integer grid dimensions. |
| `font_size` | no | Letter size from 8 to 72 px. Defaults to 24. |
| `directions` | yes | Comma-separated `horizontal`, `vertical`, and/or `diagonal`. |
| `allow_reverse` | no | `true` or `false`; defaults to `true`. |
| `allow_overlap` | no | `true` permits only matching letters to share a cell; defaults to `true`. |
| `hints` | no | `true` or `false`; defaults to `true`. |
| `show_words_to_find` | no | Shows the Words to find progress panel when `true`; defaults to `true`. Set it to `false` to keep the target list hidden from students. |
| `ask_questions` | no | Enables every configured follow-up question when `true`; defaults to `true`. Set it to `false` to disable them for this game. |

The `[Words]` keys can have any names. Their values are the words. Leading/trailing whitespace is ignored; internal spaces are supported for display and ignored when matching. Words must contain English letters only and must be unique after spaces are removed.

### Optional `[Questions]` section

Add a `WORD.question=...` and/or `WORD.answer=...` entry for any word in `[Words]`. The word part is matched without regard to case or spaces. `WORD.enabled=true` is optional and defaults to `true`; set it to `false` to skip the question for one word. After students find an enabled word, the custom question is displayed in the centre of the screen over a blurred grid. The teacher can choose **Show answer** and then **Continue word hunt**.

Both fields are optional. A question without an answer simply starts a discussion. An answer without a question uses a neutral discussion prompt. Every question key must correspond to a word in `[Words]`.

## How it works

### Placement and validation

The app validates the INI first, then sorts words by length (longest first). It repeatedly builds an empty grid, randomly trying every legal start coordinate and enabled direction for each word. A candidate is legal only when it stays in bounds and, if overlap is enabled, shares cells only with an identical letter. If an attempt blocks a later word, the complete grid is regenerated. After 80 complete attempts, the app reports a clear placement error rather than showing a broken puzzle.

This approach makes 8×8 suitable for short word lists, 10×10–12×12 appropriate for typical 6–10 word lessons, and 14×14–15×15 a good choice for technical terms. For 20×20 projector grids, use at least 28–32 px letters and a sufficiently large screen; readability should take priority over packing words.

Each intended word is retained in memory as:

```text
start row, start column, end row, end column, row step, column step, length
```

Coordinates are zero-based internally and shown as one-based values in hints. This means answer checking always reveals the deliberately placed occurrence, even if filler letters accidentally form the same word elsewhere.

### Game behaviour

Answers are normalized to uppercase with spaces removed. A new correct answer gets 10 points and a persistent, projector-visible highlight. Repeated or teacher-revealed words receive no score. Hints choose an unfound word and reveal its first letter, direction, or start coordinate; Reveal Answer marks a selected word as teacher-revealed. **Play again: same grid** keeps coordinates and filler letters; **new grid** regenerates them from the same INI data.

The loaded INI filename is displayed below the puzzle heading as a small teacher reference.

Keyboard shortcuts outside text fields: `H` hint, `R` reveal, `N` new grid, `F` classroom/full-screen mode. `Enter` checks the answer while the answer field is focused.

## Structure and future games

```text
wordhunt/
  index.html        application shell and teacher controls
  style.css         responsive classroom presentation
  app.js            INI reader, Word Hunt engine, state, scoring, display
  puzzles/          editable fixed puzzle sets
```

`app.js` keeps puzzle parsing, grid generation, game state, answer checking, and rendering in separate functions. Future game engines can use the same file-loading/parser entry point, score state pattern, and display shell while supplying their own `startGame`, rendering, and answer-checking functions.

## Create a puzzle

1. Copy one of the files in `puzzles/`.
2. Change the title, dimensions, and optional settings.
3. Add words under `[Words]`, one `name=value` line per word.
4. Save with the `.ini` extension.
5. Open the app and select it with **Load puzzle**.

If placement fails, first increase rows/columns, enable overlap, enable more directions, or shorten/remove a word.
