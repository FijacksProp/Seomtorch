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

## Production deployment: Render + Supabase

The Python Web Service runs on Render and the production PostgreSQL database runs on Supabase. Django remains responsible for accounts and authentication; Supabase Auth is not used.

Create a Web Service from the GitHub repository with these settings:

```text
Language: Python 3
Root Directory: backend
Build Command: bash build.sh
Start Command: bash start.sh
Health Check Path: /api/health/
```

Set these environment variables on the Web Service:

```text
CORS_ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app
CSRF_TRUSTED_ORIGINS=https://your-vercel-domain.vercel.app
DATABASE_URL=<the Supabase Session pooler connection string, port 5432>
DATABASE_CONN_MAX_AGE=60
DATABASE_SSL_REQUIRE=True
DJANGO_ALLOWED_HOSTS=<your-service-name>.onrender.com
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=<a long random secret>
DJANGO_SUPERUSER_EMAIL=<initial administrator email>
DJANGO_SUPERUSER_USERNAME=<initial administrator username>
DJANGO_SUPERUSER_PASSWORD=<initial administrator password>
DJANGO_SUPERUSER_RESET_PASSWORD=False
SECURE_HSTS_SECONDS=31536000
SECURE_SSL_REDIRECT=True
```

Do not add the database password or secret key to Git. Use Supabase's Session pooler rather than its transaction pooler: this is a persistent Django service, and the Session pooler is available over IPv4. `start.sh` runs migrations, imports or updates the question bank, and creates the initial administrator before starting Gunicorn. All three setup commands are idempotent, so later deploys do not duplicate data or overwrite the administrator password.

If the existing administrator password is lost, set a new `DJANGO_SUPERUSER_PASSWORD`, temporarily set `DJANGO_SUPERUSER_RESET_PASSWORD=True`, and deploy once. After confirming access, immediately change `DJANGO_SUPERUSER_RESET_PASSWORD` back to `False` so future deploys cannot reset the account unexpectedly.

For a new empty Supabase database, deploying with these variables creates the Django tables automatically. To retain existing Render users and progress, migrate the old database before changing `DATABASE_URL`. Follow [SUPABASE.md](SUPABASE.md) for the complete migration and cutover procedure.

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
