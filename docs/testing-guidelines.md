# Testing guidelines

## Backend
- Tool: pytest with FastAPI TestClient. Each test uses a fresh database
  (in-memory SQLite via DATABASE_URL).
- Required scenarios:
  - Two buyers hold the same seat: exactly one succeeds.
  - Hold expiry releases units; payment after expiry is rejected.
  - Order with more than 8 tickets is rejected.
  - Declined test card keeps units held until expiry and creates no ticket.
  - Ticket verify: first scan valid, second scan rejected, wrong event rejected.
  - Staff of venue A cannot read or change data of venue B.
  - Controller cannot create events or change prices.
- Every endpoint: one success test, one validation/error test.

## Frontend
- Unit tests for the service layer (mock and HTTP implementations share one contract).
- Manual checks in the browser for seat selection, countdown and scanner.

## Manual test script (end to end)
1. Open catalog, find an event, pick 2 seats.
2. Open the same event in a second browser: the seats show as held.
3. Pay with 4242..., open the ticket page, download PDF.
4. Log in as controller, scan the ticket: green. Scan again: red.
5. Wait for a hold to expire: seats return to available.

## Bugs
Bugs found by manual testing become issues with label `user-test-bug`,
sections Goal and Description. PM grooms it, QA adds test cases here or in tests.
