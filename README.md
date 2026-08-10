# Seomtorch

An offline-first Post-UTME preparation companion focused on English Language and General Paper, with Mathematics retained as an additional practice area.

## Run locally

```powershell
npm install
npm start
```

Open the localhost address printed by the server. A local server is required because browsers restrict `fetch`, IndexedDB origins and service workers for files opened directly from disk.

## Architecture

- Vercel hosts the installable student PWA.
- Render hosts the Django API and professional monitoring centre.
- PostgreSQL is the source of truth for accounts, attempts, XP, streaks, sessions and bookmarks.
- IndexedDB keeps the student experience usable offline and queues pending attempts.

## Deploy the student app to Vercel

Import the GitHub repository into Vercel and leave the framework preset as **Other**. No build command or output directory is required. The included `vercel.json` configures safe caching for the service worker and question bank, long-lived caching for versioned visual assets, and baseline security headers.

The frontend expects the Render service at `https://seomtorch.onrender.com`. If Render assigns another address, update `config.js` and bump the service-worker cache version in `sw.js`.

## Deploy the backend to Render

Create a PostgreSQL database and a Python Web Service manually in Render. Set the service root directory to `backend`, the build command to `bash build.sh`, and the start command to `bash start.sh`. The startup script performs the idempotent migrations, question import and initial administrator setup required on Render's free tier. See `backend/README.md` for the environment variables and exact settings.

Render's Free PostgreSQL database expires after 30 days and has no backups. Use it to validate the platform, then move to a persistent paid database before storing records you cannot afford to lose.

## Architecture

- Vanilla HTML, CSS and JavaScript with no frontend framework
- Django/PostgreSQL persistence with IndexedDB offline caching
- Email registration and sign-in with six-character student IDs
- Professional staff-only monitoring dashboard
- Versioned JSON question bank in `data/questions.json`
- Reproducible source importer in `scripts/build-question-bank.mjs`
- Weighted question selection based on unseen, incorrect and recently answered questions
- Timed 10, 20, 50 and 100-question practice sessions
- Installable PWA with offline caching
- Full student Profile with synchronized account stats and embedded searchable Guide
- JSON progress export and import

To scale the bank, add valid question objects to the JSON file or split it into packs and list those packs in a small manifest. Question IDs must remain stable so historical attempts continue to match the correct question.

The supplied 2019 text files can be rebuilt with `npm run questions:build`. The importer normalizes embedded answer choices, assigns topics, generates concise explanations, removes exact duplicates, and writes a validation summary to `data/import-report.json`.
