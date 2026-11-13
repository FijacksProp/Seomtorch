#!/usr/bin/env bash
set -o errexit
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

# Render's free tier does not support pre-deploy commands. These operations are
# idempotent, so they can safely run before each application start.
python manage.py prepare_db_for_migration || true
python manage.py migrate --noinput
python manage.py create_initial_superuser

# University sessions use catalog topic IDs and server-scored questions. Commit
# this small, batched bank before serving requests, independently of the much
# larger aspirant import below. Unchanged university content is skipped.
python manage.py import_questions --university-only --if-current
if ! python manage.py build_university_access_manifest; then
    echo "Warning: university access manifest build failed; requests will use the development fallback scan."
fi

# Importing the full question bank against a remote database can take several
# minutes. Run it in the background so Render can detect Gunicorn's port while
# the idempotent import completes. An unchanged manifest release is skipped.
if [[ "${IMPORT_QUESTIONS_ON_START:-False}" =~ ^([Tt][Rr][Uu][Ee]|1|[Yy][Ee][Ss]|[Oo][Nn])$ ]]; then
    python manage.py import_questions &
else
    python manage.py import_questions --if-current &
fi

exec gunicorn config.wsgi:application --bind "0.0.0.0:${PORT:-10000}" --workers 2 --timeout 120
