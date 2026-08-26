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
