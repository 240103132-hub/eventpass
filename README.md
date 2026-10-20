# EventPass

Ticket platform for venues in Kazakhstan: seat map and zone tickets, 10-minute holds so nobody is sold the same
place twice, simulated card payment, tickets with QR codes and a staff check-in scanner.

**Stack:** React + Vite + Tailwind (frontend), FastAPI + SQLAlchemy + SQLite (backend), OpenAPI contract in `docs/openapi.yml`.

## Run it

Backend (port 8000):

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000        # API docs: http://localhost:8000/docs
```

Frontend (port 5173):

```bash
cd frontend
npm install
npm run dev                                       # http://localhost:5173
VITE_USE_MOCK=true npm run dev                    # offline demo without the backend (localStorage mock)
```

Tests:

```bash
cd backend && python -m pytest -q                 # services on memory and SQLite + HTTP tests
cd frontend && node --test src/mockApi.test.js    # mock service
```

## Demo data

| What | Value |
|------|-------|
| Pays successfully | card `4242 4242 4242 4242` |
| Declined card | `4000 0000 0000 0002` (hold stays, no ticket) |
| Scanner, Astana Arena | `controller@astana.kz` / `password123` |
| Scanner, Almaty Palace | `controller@almaty.kz` / `password123` |

Rules: at most 8 tickets per order, a hold lasts 10 minutes, scanner results are VALID, ALREADY_USED, WRONG_EVENT, CANCELLED, INVALID.

## How this project was built

Spec-driven, AI-native process with GitHub Issues (`mvp`, `post-mvp`, `user-test-bug`):
`docs/spec.md`, `docs/brainstorm.md`, `docs/design-system.md`, `docs/testing-guidelines.md`, `docs/process.md`,
role files (`pm.md`, `software-engineer.md`, `qa-engineer.md`), `AGENTS.md`. Order of work: frontend with a mock service,
`openapi.yml` contract, in-memory backend, SQLite backend, frontend connected to the backend, manual testing.
Database diagram: `docs/db-schema.md`.

## Layout

```
backend/app/main.py            HTTP layer (FastAPI, error handlers, CORS, background cleanup)
backend/app/services.py        business rules (holds, orders, scanner)
backend/app/repository.py      in-memory storage
backend/app/sql_repository.py  SQLAlchemy storage (same methods)
frontend/src/api.js            the only place that chooses mock or real API
frontend/src/mockApi.js        mock implementing docs/openapi.yml
frontend/src/httpApi.js        real HTTP client
```
