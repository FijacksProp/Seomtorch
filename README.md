# Seomtorch

An offline-first exam preparation companion for JAMB, WAEC, NECO and Post-UTME students.

## Run locally

```powershell
npm install
npm start
```

Open the localhost address printed by the server. A local server is required because browsers restrict `fetch`, IndexedDB origins and service workers for files opened directly from disk.

## Deploy to Vercel

Import the GitHub repository into Vercel and leave the framework preset as **Other**. No build command or output directory is required. The included `vercel.json` configures safe caching for the service worker and question bank, long-lived caching for versioned visual assets, and baseline security headers.

## Architecture

- Vanilla HTML, CSS and JavaScript with no frontend framework
- IndexedDB for profiles, attempts and bookmarks
- Versioned JSON question bank in `data/questions.json`
- Weighted question selection based on unseen, incorrect and recently answered questions
- Installable PWA with offline caching
- Searchable offline Guide replacing the AI tutor
- JSON progress export and import

To scale the bank, add valid question objects to the JSON file or split it into packs and list those packs in a small manifest. Question IDs must remain stable so historical attempts continue to match the correct question.
