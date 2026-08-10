#!/usr/bin/env bash
set -o errexit

# Render's free tier does not support pre-deploy commands. These operations are
# idempotent, so they can safely run before each application start.
python manage.py migrate --noinput
python manage.py import_questions
python manage.py create_initial_superuser

exec gunicorn config.wsgi:application --bind "0.0.0.0:${PORT:-8000}" --workers 2 --timeout 120
