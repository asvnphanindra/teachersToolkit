# Teacher's Toolkit

Browser-based utilities for educators. Hosted on Firebase at [teacherstoolkit-nriit.web.app](https://teacherstoolkit-nriit.web.app).

## Tools

| Tool | Path | Description |
|------|------|-------------|
| **Class Timetable** | `/class-timetable-v2/` | Map sections to subjects and staff, then schedule with clash checks |
| **Teaching Lesson Plan Manager** | `/lesson-plan-manager/` | Plan semesters, teaching sessions, and syllabus coverage |
| **Classroom Word Hunt** | `/wordhunt/` | Run engaging word-search activities for your class |
| **Classroom Word Builder** | `/word-builder/` | Project letter tiles and build vocabulary words together |

## Local development

Serve the `public/` folder with any static server:

```bash
npx serve public
```

Open `http://localhost:3000` for the hub and `http://localhost:3000/class-timetable-v2/` for the timetable tool.

## Deploy

Pushes to `main` deploy automatically via GitHub Actions (`.github/workflows/firebase-deploy.yml`).

**One-time setup** (org policy blocks service-account JSON keys, so use a CI token):

1. On your machine, run `firebase login:ci` and complete the browser login.
2. Copy the printed token (do not commit it).
3. GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `FIREBASE_TOKEN`
   - Value: paste the token
4. Push to `main` (or re-run the workflow).

Local deploy (no secret needed if you are already logged in):

```bash
firebase deploy --only hosting --project teacherstoolkit-nriit
```

## Project structure

```text
public/
  index.html              # Toolkit hub
  about.html              # About the creator
  assets/shared/          # Shared CSS, tools manifest, Firebase config
  class-timetable-v2/     # Class Timetable tool
firebase.json
.firebaserc
```

## Class Timetable features

- Map class sections to subjects, labs, and staff
- Configure period timings and faculty availability
- Drag-and-drop section scheduling with clash detection
- Summary views and PDF export
- Local storage plus JSON import/export

Data is stored in the browser only (`localStorage`). Use Export JSON to share timetables between devices.

## License

See [LICENSE](LICENSE).
