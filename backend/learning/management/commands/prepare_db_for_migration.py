from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = "Terminate stale/idle-in-transaction connections and prepare database for schema migrations."

    def handle(self, *args, **options):
        if connection.vendor != "postgresql":
            self.stdout.write("Non-PostgreSQL database detected; skipping pre-migration cleanup.")
            return

        try:
            with connection.cursor() as cursor:
                # Terminate any abandoned connections in 'idle in transaction' state owned by this database user
                # that would block ACCESS EXCLUSIVE table locks during migrations.
                cursor.execute("""
                    SELECT pg_terminate_backend(pid), pid, state, query
                    FROM pg_stat_activity
                    WHERE pid <> pg_backend_pid()
                      AND datname = current_database()
                      AND usename = CURRENT_USER
                      AND state IN ('idle in transaction', 'idle in transaction (aborted)');
                """)
                terminated = cursor.fetchall()
                if terminated:
                    self.stdout.write(self.style.WARNING(f"Terminated {len(terminated)} stale idle-in-transaction connection(s)."))
                else:
                    self.stdout.write("No blocking idle connections found.")
        except Exception as exc:
            self.stdout.write(self.style.WARNING(f"Pre-migration cleanup notice: {exc}"))
