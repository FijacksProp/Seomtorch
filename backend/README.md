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

Create the PostgreSQL database and Python Web Service manually in Render. Do not use a Blueprint: free services do not support Render pre-deploy commands.

Create a free PostgreSQL database first. Then create a Web Service from the GitHub repository with these settings:

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
DATABASE_URL=<the Render PostgreSQL internal database URL>
DJANGO_ALLOWED_HOSTS=<your-service-name>.onrender.com
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=<a long random secret>
DJANGO_SUPERUSER_EMAIL=<initial administrator email>
DJANGO_SUPERUSER_USERNAME=<initial administrator username>
DJANGO_SUPERUSER_PASSWORD=<initial administrator password>
SECURE_HSTS_SECONDS=31536000
SECURE_SSL_REDIRECT=True
```

Do not add the password or secret key to Git. `start.sh` runs migrations, imports or updates the question bank, and creates the initial administrator before starting Gunicorn. All three setup commands are idempotent, so later deploys do not duplicate data or overwrite the administrator password.

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
