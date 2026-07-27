# Teacher's Toolkit

Browser-based utilities for educators. Hosted on Firebase at [teacherstoolkit-nriit.web.app](https://teacherstoolkit-nriit.web.app).

## Tools

| Tool | Path | Description |
|------|------|-------------|
| **Class Timetable** | `/class-timetable/` | Plan section timetables with instant room & faculty clash detection |

## Local development

Serve the `public/` folder with any static server:

```bash
npx serve public
```

Open `http://localhost:3000` for the hub and `http://localhost:3000/class-timetable/` for the timetable tool.

## Deploy

Pushes to `main` deploy automatically via GitHub Actions (`.github/workflows/firebase-deploy.yml`).

**One-time setup:** Add `FIREBASE_SERVICE_ACCOUNT` secret to the GitHub repo (Firebase Console → Project settings → Service accounts → Generate new private key).

## Project structure

```text
public/
  index.html              # Toolkit hub
  about.html              # About the creator
  assets/shared/          # Shared CSS, tools manifest, Firebase config
  class-timetable/        # Class Timetable subproject (Phase 1)
firebase.json
.firebaserc
```

## Class Timetable — Phase 1 features

- Create/open/delete/duplicate timetables (localStorage + JSON import/export)
- Setup wizard: university timings, sections/rooms, subjects/faculty with bulk entry
- Manual grid assignment with drag-and-drop
- Real-time faculty & room clash alerts
- Consecutive lecture constraint warnings
- Views: section, faculty, room, subject-wise allotment
- Export PDF (print dialog)

Data is stored in the browser only (`localStorage`). Use Export JSON to share timetables between devices.

## License

See [LICENSE](LICENSE).
