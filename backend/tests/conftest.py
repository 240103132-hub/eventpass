import os

# app.main builds `app` at import time; keep tests away from the real database file.
os.environ.setdefault("DATABASE_URL", "memory")
