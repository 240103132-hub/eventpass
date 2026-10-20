# EventPass: instructions for coding agents

Ticketing platform for large venues: seat map or zones, 10-minute seat holds,
simulated payment, QR tickets, check-in scanner, multi-venue, two roles.

## Commands
- Frontend: `cd frontend && npm install && npm run dev` (http://localhost:5173)
- Backend: `cd backend && source venv/bin/activate && uvicorn main:app --reload --port 8000`
- Backend tests: `cd backend && pytest`

## Rules
- Do not add a dependency without asking.
- Use SQLAlchemy only. No SQLite-specific SQL. DB url comes from env var DATABASE_URL.
- Frontend talks to the backend only through `frontend/src/` service modules.
- Commit often. Never write `Closes #N` in a commit message: only QA closes issues.
- Never commit `venv/`, `node_modules/`, `.env`, `*.db`.

## Documents
- `_docs/process.md`: how work is organized (read first)
- `_docs/task-template.md`: template for groomed issues
- `_docs/team/`: pm.md, software-engineer.md, qa-engineer.md
- `docs/spec.md`: what we build
- `docs/brainstorm.md`: how decisions were made
- Before writing tests read `docs/testing-guidelines.md`
- Before touching the UI read `docs/design-system.md`

## Git hygiene
- Before every commit run `git status` and add files by name. Never use `git add .`.
- One commit = one purpose. Do not commit unrelated changes together.
