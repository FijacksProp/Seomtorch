#!/usr/bin/env bash
set -o errexit
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

pip install -r requirements.txt
python manage.py collectstatic --noinput
