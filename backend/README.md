# EventPass backend

FastAPI + SQLAlchemy 2 (SQLite by default, any SQLAlchemy URL works).

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m pytest -q                                   # same service tests on memory and SQLite, plus HTTP tests
uvicorn app.main:app --reload --port 8000              # API docs: http://localhost:8000/docs
```

- `DATABASE_URL` (see `.env.example`): default `sqlite:///eventpass.sqlite3`, `memory` for no persistence.
- Tables are created and demo data seeded on first start. Delete `eventpass.sqlite3` to reset.
- Layers: `main.py` (HTTP) -> `services.py` (rules) -> `repository.py` / `sql_repository.py` (storage).
- Demo staff: controller@astana.kz and controller@almaty.kz, password `password123`.
