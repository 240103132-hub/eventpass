# EventPass: specification

Source of decisions: `docs/brainstorm.md`.

## Product
Multi-venue ticketing platform for large venues (concert halls, arenas, festivals).
Guests browse a common event catalog, pick seats on a seat map (or buy a zone ticket),
pay with a simulated card, and get a QR ticket. Venue staff scan tickets at the door.

## Users and roles
- Guest: no account. Gives name and email at checkout. Gets a ticket link.
- Organizer (account): manages ONE venue: halls, events, prices, sees sales stats,
  creates controller accounts.
- Controller (account): sees only the scanner for events of their venue.
- Data of one venue is invisible to staff of another venue.

## Core model: sellable unit
Every thing that can be sold is a sellable unit with a price and a status.
- Seat mode: one unit = one seat (hall layout: sectors, rows, seats; generated from a grid).
- Zone mode: one unit = one zone with a capacity (general admission).
Hold, payment, ticket and check-in are implemented once over this model.
Unit status: available -> held -> sold (held returns to available when the hold expires).

## Entities
Venue, StaffUser (role: organizer | controller), Hall, Sector, Event (mode: seats | zones),
SellableUnit, Order (status: pending | paid | cancelled | expired), Ticket
(unique code, is_used, used_at), Hold (expires_at).

## Guest flow
1. Catalog: search, filter by city, venue, date range.
2. Event page: seat map (available / held / sold colors) or zone picker with remaining count.
3. Pick up to 8 tickets. A 10-minute hold starts; countdown is visible.
4. Checkout: name, email, test card. Card 4242 4242 4242 4242 pays; 4000 0000 0000 0002 declines.
5. On success: ticket page with QR, seat/zone info, PDF download. Email is simulated
   (written to a log visible to the organizer).
6. If the hold expires, payment is rejected and units return to the pool.
7. Cancellation/refund simulation releases the units.

## Staff flow
- Login with email and password (hashed, bearer token).
- Organizer: create hall layout, create event, set prices, see stats
  (sold, remaining, revenue, checked-in), manage controllers.
- Controller: scanner page, camera QR or manual code.
  Results: VALID (green), ALREADY USED (red), WRONG EVENT (red), INVALID (red).

## Rules and edge cases
- A unit can never be sold twice, even with two simultaneous buyers.
- Max 8 tickets per order.
- Expired holds are released by a background task and also checked at payment time.
- A ticket code works exactly once.
- Staff can only access data of their own venue.

## MVP vs post-mvp
MVP: everything above.
Post-mvp: guest cabinet, promo codes, waiting list, offline scanner, real email,
real payment provider, multiple languages, Postgres + Docker deploy.

## Technical decisions
- Frontend: React + Vite + Tailwind. All backend calls go through one service module;
  a mock implementation exists and is later replaced by an HTTP implementation.
- Backend: FastAPI + SQLAlchemy. DB url from env var DATABASE_URL, SQLite by default.
  No SQLite-specific features. Alembic migrations later.
- Contract: `openapi.yml` in the repo root.

## Build phases
1. Frontend with mock service
2. openapi.yml
3. Backend in-memory
4. Backend SQLite via ORM
5. Connect frontend to backend

Deviation note: the first backend draft was written directly on SQLAlchemy and before
openapi.yml. The contract is generated from the running backend and reviewed by hand.

## Scope decision (PM grooming)
MVP covers the guest journey and the check-in scanner: catalog, seat/zone selection, 10-minute holds, simulated payment,
tickets with QR, order cancellation, controller login and scanner, SQLite persistence.
Moved to post-mvp: organizer role and dashboard (event editor, sales statistics, controller accounts, email log),
hall layout constructor, PDF ticket download, venue switcher in the header, toast notifications.
Reason: they are not needed for the guest and scanner flow, demo venues, events and controllers are seeded,
and the deadline does not leave time to build and test them properly.
A declined card creates no order record at all (the hold stays); there is no "pending" order.
