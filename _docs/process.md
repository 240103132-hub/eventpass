# Process

- Tasks are GitHub issues, one at a time.
- Labels: `mvp`, `post-mvp`, `user-test-bug`.
- Read the acceptance criteria before starting and before closing.
- Commit regularly.

## Roles
- PM: grooms a task, follows `_docs/team/pm.md`
- Engineer: implements one groomed task, follows `_docs/team/software-engineer.md`
- QA: verifies against acceptance criteria, follows `_docs/team/qa-engineer.md`

## Build phases (in order)
1. Frontend with mock service
2. openapi.yml contract
3. Backend with in-memory store
4. Backend with SQLite via SQLAlchemy
5. Connect frontend to backend

## Lifecycle
1. Pick the next open issue
2. PM grooms it
3. Engineer implements it
4. QA verifies it, comments PASS or FAIL
5. On FAIL, back to step 3 with the QA comment as input
6. On PASS, QA closes the issue (`mvp` and `user-test-bug` issues)

## Bugs found by manual testing
- Create an issue with label `user-test-bug`, sections Goal and Description.
- Ask PM to groom it and QA to add more test cases.

## Rules
- Do not skip grooming.
- The engineer never closes an issue.
- QA does not fix code.
