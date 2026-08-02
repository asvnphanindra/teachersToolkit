# Classroom Word Builder

An offline, teacher-led display game. Load an `.ini` file, project its letter tiles, and let students form words aloud while the teacher types each answer.

## Run offline

Open `index.html` in a current desktop browser and choose **Load puzzle**. Select any `.ini` file from the `puzzles/` folder or one you created. The browser will always ask the teacher to select a file; web pages cannot silently read a local folder.

## INI format

```ini
; Lines beginning with ; or # are comments.
[Puzzle]
title=My Topic Word Builder
font_size=36
letter_view=grid
rows=6
columns=8
word_preview_seconds=5
show_words_to_find=false
ask_questions=true

[Words]
word1=ALGORITHM
word2=PRIMARY KEY
word3=DATABASE

[Questions]
ALGORITHM.question=What is an algorithm?
ALGORITHM.answer=An algorithm is a clear sequence of steps used to solve a problem.
ALGORITHM.enabled=true
```

### `[Puzzle]` keys

| Key | Required | Meaning |
|---|---:|---|
| `title` | no | Displayed puzzle title. Defaults to `Word Builder`. |
| `font_size` | no | Tile letter size from 16 to 100 px. Defaults to 34. |
| `letter_view` | no | Initial display: `scrambled`, `grid`, or `grouped`. Defaults to `scrambled`. Teachers can change it during a game. |
| `rows` | no | Number of rows in the `grid` view. Defaults to the smallest number of rows that fits every letter when using 8 columns. |
| `columns` | no | Number of columns in the `grid` view. Defaults to 8. |
| `word_preview_seconds` | no | Shows all target words in a short memorisation panel when the puzzle starts. Use 0 to disable it; defaults to 5 seconds. |
| `show_words_to_find` | no | Shows a progress list. Defaults to `false`, so the target words stay hidden until built. |
| `ask_questions` | no | Enables configured follow-up questions. Defaults to `true`. |

The `[Words]` keys are labels only. Values are the target words. Words may include spaces for display, but matching ignores spaces and case. They must contain English letters only and must be unique after spaces are removed.

`rows × columns` must be large enough for every letter tile. These values change the layout only when `letter_view=grid` (or when the teacher selects **Letter grid** in the app). When the grid has spare cells, they are shown as empty spaces; the scrambled and letter-pack views continue to show letters only.

### Optional `[Questions]`

For any configured word, add:

```ini
WORD.question=Question for the class
WORD.answer=Answer shown after the timer
WORD.enabled=true
```

The word prefix matches without case or spaces. The question or answer can be omitted. A word with an answer starts a 10-second discussion countdown; **Show answer** becomes available when the countdown ends. Set `.enabled=false` to skip one question.

## Content safety

Before showing a puzzle, the app validates its title, words, questions, and answers against the shared policy at `../assets/shared/content-safety/default-policy.js`. A matching source field stops the puzzle from loading; it is never silently changed.

Each randomized letter-tile order is scanned horizontally, vertically, diagonally, and in reverse before it is rendered as a grid. The app reshuffles when a blocked sequence is found. Edit `blockedWords` or the `text` and `grid` rule settings in the policy file to apply your school's vocabulary and scanning rules.

## Game behaviour

The board has one letter tile for every character in every configured word. Repeated letters are intentionally separate tiles. A correct typed word earns 10 points and only that word's tiles become highlighted in grey, crossed out, and unavailable for the rest of the game. An unknown or already-built word does not earn points.

The three display modes preserve the same game progress:

- **Scrambled tiles** mixes all available and used letter tiles.
- **Letter grid** arranges the same tiles in a regular grid.
- **Letter packs** keeps each word's letters in an unlabelled pack, useful for younger learners.

By default, the target words are shown for five seconds immediately after loading, then disappear so learners can use the board. The teacher can choose **Show words** at any time to replay the same preview. Change `word_preview_seconds` to any whole number from 0 to 60 in the INI file.

The classroom button uses full-screen mode when available. Press `F` outside a text field to toggle it. Starting again reshuffles the tile display and resets scores and word progress for the currently loaded INI file.

## Create a puzzle

1. Copy `puzzles/computational-thinking.ini`.
2. Change the `[Puzzle]` values and words under `[Words]`.
3. Add optional word questions under `[Questions]`.
4. Save with the `.ini` extension.
5. Open the app and choose **Load puzzle**.
