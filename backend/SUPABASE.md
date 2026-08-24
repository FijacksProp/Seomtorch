# Supabase database setup and Render migration

Seomtorch uses Supabase only as hosted PostgreSQL. Django still manages registration, sign-in, password hashing, API tokens, sessions, XP, streaks, attempts, bookmarks, questions, and administrator access. Do not enable or integrate Supabase Auth for this deployment.

## 1. Create the Supabase project

1. Sign in at `https://supabase.com/dashboard` and create a project.
2. Choose a region reasonably close to the Render Web Service.
3. Generate and securely save the database password. It is separate from the Supabase account password.
4. Wait for the project database to finish provisioning.
5. In the project dashboard, select **Connect**.
6. Copy the **Session pooler** connection string on port `5432`. Do not select Transaction pooler on port `6543`.

The connection string has this general form:

```text
postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

Keep it private. If the password contains URL-reserved characters such as `@`, `:`, `/`, `#`, `%`, or `?`, percent-encode the password before placing it in the URL. Do not put this value in Git, `.env.example`, screenshots, support messages, or browser-side JavaScript.

## 2. Choose new installation or data migration

### New installation with no Render data to retain

Skip to section 5. The Render start script will run Django migrations, load the question bank, and create the configured initial administrator.

### Existing installation with student data

Continue below. Do not change Render's `DATABASE_URL` until the old database has been exported and restored into Supabase. Pointing Django at Supabase before copying the data creates an empty installation and makes the existing accounts appear missing.

## 3. Collect the two database connections

You need:

- The **External Database URL** or PSQL command from the existing Render PostgreSQL database. The internal Render URL works only inside Render's private network.
- The Supabase **Session pooler** URL from section 1.

Treat both as secrets. The commands below use placeholders so credentials do not end up in the repository.

## 4. Copy the Render PostgreSQL data into Supabase

The official Supabase Render migration guide offers a Google Colab migration notebook and a PostgreSQL command-line route. For this relatively small Django database, either is suitable.

### Option A: official Supabase migration notebook

1. Open `https://supabase.com/docs/guides/platform/migrating-to-supabase/render`.
2. Open the linked migration notebook.
3. Copy the Render PSQL command from the Render database **Info** page.
4. Supply the Supabase Session pooler host and database password when the notebook requests them.
5. Run the notebook cells in their documented order and wait for the migration to complete.
6. Do not share or save a public copy of the notebook containing credentials.

### Option B: PostgreSQL command-line tools

Install a PostgreSQL client version equal to or newer than the Render server version. In a private terminal, set the old and new URLs as environment variables, then create a custom-format dump and restore it:

```bash
pg_dump "$OLD_DATABASE_URL" --format=custom --no-owner --no-privileges --file=seomtorch-render.dump
pg_restore --dbname="$SUPABASE_DATABASE_URL" --no-owner --no-privileges --exit-on-error seomtorch-render.dump
```

Run this against a new Supabase project whose `public` schema does not already contain the Seomtorch Django tables. If a previous failed attempt created those tables, recreate the Supabase project or remove only the Seomtorch-owned tables after confirming the targets. Never drop Supabase-managed schemas.

For the cleanest cutover, ask students not to use the app while the final dump is taken. Attempts created after the dump but before the connection switch will remain only in Render.

## 5. Connect the Render Web Service to Supabase

Open **Render Dashboard → Seomtorch Web Service → Environment** and set:

```text
DATABASE_URL=<Supabase Session pooler URL on port 5432>
DATABASE_CONN_MAX_AGE=60
DATABASE_SSL_REQUIRE=True
```

Keep the existing values for:

```text
DJANGO_ALLOWED_HOSTS
DJANGO_DEBUG
DJANGO_SECRET_KEY
CORS_ALLOWED_ORIGINS
CSRF_TRUSTED_ORIGINS
DJANGO_SUPERUSER_EMAIL
DJANGO_SUPERUSER_USERNAME
DJANGO_SUPERUSER_PASSWORD
SECURE_HSTS_SECONDS
SECURE_SSL_REDIRECT
```

Save the variables and trigger a manual deployment. Render executes `backend/start.sh`, which runs:

1. `python manage.py migrate --noinput`
2. `python manage.py import_questions`
3. `python manage.py create_initial_superuser`
4. Gunicorn startup

These setup commands are idempotent and will not intentionally erase migrated users or progress.

## 6. Verify the cutover

Perform all of these checks before considering the migration complete:

1. Open `https://seomtorch.onrender.com/api/health/` and confirm it returns `{"status":"ok","database":"ok"}`.
2. Sign in with an existing student account.
3. Confirm the student's XP, streak, attempt history, and saved questions are present.
4. Submit one new practice answer, refresh on another browser, and confirm it synchronizes.
5. Open `https://seomtorch.onrender.com/monitor/login/` and confirm the administrator can sign in.
6. Check an individual student's subject and topic progress in the monitor.
7. In Supabase **Table Editor**, confirm new rows appear in the Django-owned tables after activity.

No Vercel environment variable needs to change if the Django URL remains `https://seomtorch.onrender.com`. The browser continues talking to Django; it never connects directly to Supabase.

## 7. Rollback and cleanup

Keep the Render PostgreSQL database and the local dump until the Supabase-backed app has been verified. If the cutover fails, restore Render's former `DATABASE_URL` on the Web Service and redeploy.

After successful verification:

1. Store one encrypted copy of the final migration dump in a secure location.
2. Remove plaintext database URLs from terminal history, temporary notes, and migration notebooks.
3. Delete the old Render database only when no rollback is needed and before its expiry or billing deadline.
4. Periodically export Supabase backups appropriate to the project's recovery requirements.

## Troubleshooting

### `could not translate host name` or connection timeout

Confirm that the URL is the **Session pooler** host and uses port `5432`. Supabase's direct connection is IPv6 by default; the Session pooler is the safer choice for an IPv4-hosted persistent service.

### `password authentication failed`

Reset the Supabase database password if necessary and ensure reserved password characters are percent-encoded in `DATABASE_URL`.

### `SSL connection is required`

Set `DATABASE_SSL_REQUIRE=True` on Render and redeploy.

### Existing users disappeared

The app is probably connected to a fresh database that was not restored. Restore the former Render `DATABASE_URL` immediately, redeploy, and repeat the data migration before attempting another cutover.

### Migrations report existing tables

Do not repeatedly restore over a partially initialized database. Use a clean Supabase project for the import, or carefully remove only the Seomtorch-owned tables after taking a backup and confirming their names.
