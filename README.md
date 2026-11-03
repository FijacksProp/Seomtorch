# Seomtorch

An offline-first examination preparation companion for English Language, General Paper, Mathematics and Physics.

## Run locally

```powershell
npm install
npm start
```

Open the localhost address printed by the server. A local server is required because browsers restrict `fetch`, IndexedDB origins and service workers for files opened directly from disk.

## Architecture

- Vercel hosts the installable student PWA.
- Render hosts the Django API and professional monitoring centre.
- Supabase PostgreSQL is the source of truth for accounts, attempts, XP, streaks, sessions, challenges, badges and bookmarks.
- IndexedDB keeps the student experience usable offline and queues pending attempts.

## Deploy the student app to Vercel

Import the GitHub repository into Vercel and leave the framework preset as **Other**. No build command or output directory is required. The included `vercel.json` configures safe caching for the student app in production and temporary caching for offline development.

The frontend expects the Render service at `https://seomtorch.onrender.com`. If Render assigns another address, update `config.js` and bump the service-worker cache version in `sw.js`.

## Deploy the backend to Render

Create a Python Web Service manually in Render and connect it to Supabase PostgreSQL. Leave the service Root Directory blank, set Build Command to `bash backend/build.sh`, and Start Command to `bash backend/start.sh`. The backend must be able to read the shared `data/` and `assets/` directories at the repository root.

## Architecture

- Vanilla HTML, CSS and JavaScript with no frontend framework
- Django/PostgreSQL persistence with IndexedDB offline caching
- Email registration and sign-in with six-character student IDs
- Professional staff-only monitoring dashboard
- Versioned JSON question bank in `data/questions.json`
- Reproducible source importer in `scripts/build-question-bank.mjs`
- Weighted question selection based on unseen, incorrect and recently answered questions
- Freely configured 10–100-question sessions with a student-selected timer
- Balanced all-subject practice grouped into clear subject sections
- Installable PWA with offline caching
- Full student Profile with synchronized account stats and embedded searchable Guide
- Synchronized Saved for review library with offline retries and timed review sessions
- Exam-style numbered navigation, answer locking, start/finish confirmations and PWA installation
- Private scheduled friend challenges with invitations, frozen shared papers, server-controlled timers and supportive group results
- Filterable challenge desk, draft-preserving setup, and mobile-friendly private results
- Mutual-buddy text chat with immediate sending feedback, active-conversation sync and Seen receipts
- Extensible server-awarded achievements with progress tracking and animated badge unlocks
- Branded, reduced-motion-aware application pre-loader
- JSON progress export and import

To scale the bank, add valid question objects to the JSON file or split it into packs and list those packs in a small manifest. Question IDs must remain stable so historical attempts continue to resolve correctly.

## Chat delivery and receipts

Open, focused conversations sync about once per second (plus network/server response time); inbox summaries refresh separately about every 12 seconds. Hidden tabs pause requests and reconnect when visible. Retries back off on failures, and messages retain stable client IDs so retrying does not create duplicates. There is no new messaging service, WebSocket server or environment variable to configure.

“Sending…” is local feedback, “Sent” means the API saved the message, and “Seen” means the recipient's client acknowledged that message after it was visible in their focused conversation. Fetching history or receiving a message in a hidden tab does not mark it seen. Read acknowledgements are restricted to the recipient and their mutual buddy; blocking stops both messages and receipts. This is private account messaging, not end-to-end encryption.

Render's free-tier cold starts and slow networks can still delay initial connection. Deploy the backend and frontend together for the new read-acknowledgement endpoint; no database migration is needed for this update. Run frontend checks with `npm run check` and `npm run community:test`, and the focused backend suite with `python manage.py test accounts.test_social` from the backend directory.

The supplied 2019 text files can be rebuilt with `npm run questions:build`. The importer normalizes embedded answer choices, assigns topics, generates concise explanations, removes exact duplicate question texts and stores all derived metadata in the compiled JSON bank.
