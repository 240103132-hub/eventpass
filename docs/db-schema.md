# Database schema

Source of truth: `backend/app/db_models.py` (SQLAlchemy 2.0, portable types, SQLite today, any SQL database later).
Money is an integer number of KZT. Timestamps are stored as UTC.

```mermaid
erDiagram
    VENUES ||--o{ EVENTS : hosts
    VENUES ||--o{ STAFF : employs
    STAFF ||--o{ TOKENS : "logs in with"
    EVENTS ||--o{ HOLDS : "is held in"
    EVENTS ||--o{ TICKETS : admits
    ORDERS ||--|{ TICKETS : contains

    VENUES { int id PK
             string name
             string city }
    EVENTS { int id PK
             string title
             int venue_id FK
             int hall_id
             string starts_at
             string mode "seats or zones"
             string status
             json sector_prices
             json zones }
    STAFF { int id PK
            string email UK
            string password_hash "PBKDF2-SHA256, salted"
            string role
            int venue_id FK }
    TOKENS { string token PK
             int staff_id FK }
    HOLDS { string id PK
            int event_id FK
            datetime expires_at "now + 10 min"
            int total
            json items "unit_id, label, quantity, price" }
    SOLD_UNITS { string unit_id PK
                 int qty "seat 0 or 1, zone 0..capacity" }
    ORDERS { string order_code PK
             string status "paid or cancelled"
             string customer_name
             string customer_email
             int total
             datetime created_at }
    TICKETS { string code PK
              string order_code FK
              int position
              int event_id FK
              string unit_id
              string unit_label
              string holder_name
              string status "valid, used, cancelled"
              bool is_used
              datetime used_at }
```

## Design notes

- **Units.** Seats and zones are "sellable units" generated from the event (`1-A-1`, `3-zone-2`), so there is no
  separate seat table. `SOLD_UNITS` counts what is sold; active `HOLDS` count what is temporarily taken.
  Availability = capacity - sold - held (held ignores holds whose `expires_at` has passed).
- **No double selling.** Hold creation checks and takes units inside one transaction guarded by a lock
  (SQLite has a single writer). On PostgreSQL the lock becomes `SELECT ... FOR UPDATE`.
- **Decline path.** A declined card creates no order and no ticket; the hold keeps running.
- **Venue isolation.** Staff belong to one venue; the scanner rejects events of other venues (403) and treats
  tickets of other venues as INVALID.
