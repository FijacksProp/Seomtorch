# Seomtorch Django service

The Django service provides email-based authentication, PostgreSQL persistence, question management, learning analytics, and the staff-only monitoring centre.

## Local development

From `backend/`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py import_questions
.\.venv\Scripts\python.exe manage.py createsuperuser
.\.venv\Scripts\python.exe manage.py runserver
```

The API runs at `http://127.0.0.1:8000/api/`. The professional monitoring centre is at `http://127.0.0.1:8000/monitor/`; raw content management is at `http://127.0.0.1:8000/internal-admin/`.

## Render deployment

The repository-level `render.yaml` creates the Django web service and PostgreSQL database. In the Render Blueprint configuration, set these secret/manual variables:

```text
CORS_ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app
CSRF_TRUSTED_ORIGINS=https://your-vercel-domain.vercel.app
DJANGO_SUPERUSER_EMAIL=<initial administrator email>
DJANGO_SUPERUSER_USERNAME=<initial administrator username>
DJANGO_SUPERUSER_PASSWORD=<initial administrator password>
```

Do not add the password to Git, `render.yaml`, or `.env.example`. The build invokes `create_initial_superuser`, which creates the account once and leaves an existing account intact on later deployments.

Render's Free PostgreSQL instance expires 30 days after creation and does not include backups. It is suitable for initial testing only; upgrade the database before relying on it for durable student records.

If Render assigns a URL other than `https://seomtorch-api.onrender.com`, update `config.js` in the Vercel frontend.

## Data and security

- Student passwords use Django's password hashing and validation.
- API clients authenticate with revocable Django REST Framework tokens.
- Student accounts cannot enter `/monitor/` or `/internal-admin/`.
- Correctness, XP, and streaks are calculated by Django rather than trusted from the browser.
- Client UUIDs make offline attempt retries idempotent.
- The six-character `public_id` is unique and indexed for administrator search.
- Source question files remain ignored; the normalized bank is imported from `data/questions.json`.

## Checks

```powershell
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py test
```
