# EventPass backend (phase 3: in-memory)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m pytest -q                      # service + HTTP tests
uvicorn app.main:app --reload --port 8000   # API docs: http://localhost:8000/docs
```

Layers: `main.py` (HTTP) -> `services.py` (rules) -> `repository.py` (storage).
Phase 4 replaces `InMemoryRepository` with a SQLAlchemy repository; services and tests stay.
