# Universal MySchool question importer

The extractor accepts any authorized MySchool classroom listing URL and derives
the subject and filters directly from that link. Mathematics, English,
Chemistry, Government, Physics, Biology and other classroom subjects all use the
same importer—there is no subject-specific scraping code to change.

It writes reviewable intermediate JSON rather than modifying Seomtorch's live
question bank. The generated quality report should be reviewed before a later
conversion/import step.

The importer identifies itself, sends requests sequentially, waits at least 1.25
seconds between requests, retries transient failures with exponential backoff,
and checkpoints after every page and question.

## Paste one subject link

Put the link in quotes so PowerShell does not interpret `&` in links containing
multiple filters:

```powershell
npm install
npm run questions:myschool -- "https://myschool.ng/classroom/chemistry?exam_type=jamb"
```

## Paste several subject links

Repeat `--url` as many times as required:

```powershell
npm run questions:myschool -- `
  --url "https://myschool.ng/classroom/mathematics?exam_type=jamb" `
  --url "https://myschool.ng/classroom/english-language?exam_type=jamb" `
  --url "https://myschool.ng/classroom/chemistry?exam_type=jamb" `
  --url "https://myschool.ng/classroom/government?exam_type=jamb"
```

## Keep links in a text file

For a large set, create a plain text file containing one link per line. Blank
lines and lines beginning with `#` are ignored:

```text
https://myschool.ng/classroom/mathematics?exam_type=jamb
https://myschool.ng/classroom/english-language?exam_type=jamb
https://myschool.ng/classroom/chemistry?exam_type=jamb
https://myschool.ng/classroom/government?exam_type=jamb
```

Then run:

```powershell
npm run questions:myschool -- --links-file myschool-links.txt
```

If no links are supplied, the backward-compatible default collects JAMB Physics
and Biology.

## Test a small sample first

Any pasted set can be limited without changing its saved schema:

```powershell
npm run questions:myschool -- `
  "https://myschool.ng/classroom/chemistry?exam_type=jamb" `
  --max-pages 1 `
  --max-questions 5
```

Generated working files are ignored by Git and stored under
`data/imports/myschool/`. Their names are derived from the subject and filter:

- `chemistry-jamb.checkpoint.json`: resumable state
- `chemistry-jamb.raw.json`: structured intermediate questions
- `government-jamb.raw.json`: a separate Government collection
- `import-report.json`: completeness, failures, explanations, images and duplicates

## Resume and control a collection

A full collection can take hours. Stop safely with `Ctrl+C`, then run the same
command again to continue from the checkpoint.

```powershell
# Slow requests further
npm run questions:myschool -- "PASTE_URL_HERE" --delay-ms 2000

# Re-fetch records when the source has changed
npm run questions:myschool -- "PASTE_URL_HERE" --refresh

# Re-check only questions that refer to a missing diagram and download media
npm run questions:myschool -- "PASTE_URL_HERE" --details-only --refresh-media --download-images

# Store the working JSON elsewhere
npm run questions:myschool -- "PASTE_URL_HERE" --output-dir C:\question-imports\myschool
```

Run `npm run questions:myschool -- --help` for every option.

## Intermediate schema

Each question preserves its source identity, exam filter, answer, explanation and
diagram references:

```json
{
  "id": "myschool-chemistry-1234",
  "source": "myschool",
  "source_id": "1234",
  "source_url": "https://myschool.ng/classroom/chemistry/1234?exam_type=jamb&page=1",
  "subject": "chemistry",
  "exam_type": "jamb",
  "year": 2019,
  "question": "Question text",
  "question_image_urls": [],
  "options": [
    { "label": "A", "text": "First option", "image_urls": [] }
  ],
  "correct_option": "A",
  "correct_index": 0,
  "explanation": null,
  "explanation_image_urls": [],
  "quality_flags": ["missing_explanation"],
  "scraped_at": "2026-08-26T00:00:00.000Z"
}
```

A missing explanation is recorded as a quality flag rather than an extraction
failure because many source records contain only an answer key. Diagram URLs are
retained and flagged so image-dependent questions are never mistaken for
complete text-only questions.

## Recover and store diagrams locally

Question pages can place diagrams beside the question heading rather than inside
it. The importer classifies `/storage/classroom/` files as question/option media
and `/storage/classroom_answers/` files as solution media. Member avatars,
discussion images, emojis and placeholders are excluded.

After a full collection has a checkpoint, recover only visually incomplete
records without repeating the listing-page crawl:

```powershell
npm run questions:myschool -- `
  "https://myschool.ng/classroom/physics?exam_type=jamb" `
  --details-only `
  --refresh-media `
  --download-images
```

Downloaded files use stable source IDs under
`assets/questions/myschool/<subject>/`. Raw records retain both the original URL
and the local path for provenance and deployment.

## Prepare a reviewable question bank

The preparation step removes exact duplicates, converts explanation placeholders
to `null`, recomputes media flags and produces a guarded explanation queue:

```powershell
npm run questions:myschool:prepare -- `
  --input data/imports/myschool/physics-jamb.raw.json
```

This creates:

- `physics-jamb.prepared.json`: deduplicated, quality-labelled records;
- `physics-jamb.explanations.todo.json`: questions requiring editorial work.

For the Physics release, the resumable local editorial generator can produce
concise explanations and independently challenge answer keys without sending
the bank to an external API:

```powershell
npm run questions:physics:explain -- `
  --input data/imports/myschool/physics-jamb.prepared.json `
  --output data/imports/myschool/physics-jamb.editorial.json
```

The checkpoint records completed explanations, excluded ambiguous questions and
every proposed answer change. A changed answer is applied only when a separate
skeptical verification pass reaches the same answer with high confidence.
Interrupted runs resume from the last completed batch.

Generated explanations are not trusted automatically. To merge explanations,
provide a keyed JSON file in which every entry contains `explanation`,
`reviewed_by` and `reviewed_at`, then rerun with `--explanations PATH`. The
preparer rejects short or unattributed entries and records their editorial
provenance in the prepared question.

The generator checkpoint can be supplied directly:

```powershell
npm run questions:myschool:prepare -- `
  --input data/imports/myschool/physics-jamb.raw.json `
  --explanations data/imports/myschool/physics-jamb.editorial.json
```

## Publish an approved pack

Convert the prepared file into the compact schema used by the web app and
Django importer:

```powershell
npm run questions:myschool:pack -- `
  --input data/imports/myschool/physics-jamb.prepared.json `
  --output data/questions-physics.json
```

The pack builder excludes questions flagged `missing_visual_media`, retains
local question and worked-solution images, and marks explanations as reviewed or
pending. Add the resulting pack to `data/manifest.json` and increase the
manifest version for each production release.

On Render, `backend/start.sh` imports a new manifest version once and records it
in `QuestionBankRelease`. Subsequent cold starts skip the unchanged bank, while
an existing non-empty database still receives newly released subjects.
