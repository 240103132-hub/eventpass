"""SQLAlchemy repository: same methods as InMemoryRepository, so services.py does not change.

Atomicity: transaction() takes a process-wide lock and one DB transaction, so check-and-take of a seat
cannot interleave between threads. SQLite allows one writer at a time anyway; on PostgreSQL replace the
lock with SELECT ... FOR UPDATE on the unit rows (documented in docs/spec.md).
"""
import threading
from contextlib import contextmanager

from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from .db_models import (Base, EventRow, HoldRow, OrderRow, SoldRow, StaffRow, TicketRow, TokenRow, VenueRow)

EVENT_FIELDS = ("id", "title", "description", "image_url", "venue_id", "hall_id", "starts_at", "mode",
                "status", "sector_prices", "zones")
STAFF_FIELDS = ("id", "email", "password_hash", "role", "venue_id")
ORDER_FIELDS = ("order_code", "status", "customer_name", "customer_email", "total", "created_at")
TICKET_FIELDS = ("code", "order_code", "event_id", "event_title", "venue_name", "starts_at", "unit_id",
                 "unit_label", "holder_name", "status", "is_used", "used_at")


def _dict(row, fields):
    return {f: getattr(row, f) for f in fields}


class SqlRepository:
    def __init__(self, url="sqlite:///eventpass.sqlite3"):
        options = {}
        if url.startswith("sqlite"):
            options["connect_args"] = {"check_same_thread": False}
            if ":memory:" in url or url in ("sqlite://", "sqlite:///"):
                options["poolclass"] = StaticPool  # one shared connection for an in-memory database
        self.engine = create_engine(url, **options)
        if self.engine.dialect.name == "sqlite":
            @event.listens_for(self.engine, "connect")
            def _pragmas(dbapi_conn, _):
                cur = dbapi_conn.cursor()
                cur.execute("PRAGMA foreign_keys=ON")
                cur.close()
        Base.metadata.create_all(self.engine)  # startup initialization check (issue #27)
        self._lock = threading.RLock()
        self._local = threading.local()

    # ---------- sessions ----------
    @contextmanager
    def transaction(self):
        with self._lock:
            if getattr(self._local, "session", None) is not None:  # nested call: join the outer one
                yield
                return
            session = Session(self.engine)
            self._local.session = session
            try:
                yield
                session.commit()
            except BaseException:
                session.rollback()
                raise
            finally:
                self._local.session = None
                session.close()

    @contextmanager
    def _session(self):
        with self._lock:
            current = getattr(self._local, "session", None)
            if current is not None:
                yield current
                return
            with Session(self.engine) as session:
                yield session
                session.commit()

    # ---------- reference data ----------
    def add_venue(self, v):
        with self._session() as s:
            s.merge(VenueRow(id=v["id"], name=v["name"], city=v["city"]))

    def list_venues(self):
        with self._session() as s:
            return [{"id": r.id, "name": r.name, "city": r.city}
                    for r in s.scalars(select(VenueRow).order_by(VenueRow.id))]

    def get_venue(self, venue_id):
        with self._session() as s:
            r = s.get(VenueRow, venue_id)
            return {"id": r.id, "name": r.name, "city": r.city} if r else None

    def add_event(self, e):
        with self._session() as s:
            s.merge(EventRow(**{k: e.get(k) for k in EVENT_FIELDS}))

    def list_events(self):
        with self._session() as s:
            return [_dict(r, EVENT_FIELDS) for r in s.scalars(select(EventRow).order_by(EventRow.id))]

    def get_event(self, event_id):
        with self._session() as s:
            r = s.get(EventRow, event_id)
            return _dict(r, EVENT_FIELDS) if r else None

    # ---------- staff ----------
    def add_staff(self, st):
        with self._session() as s:
            s.merge(StaffRow(**{k: st.get(k) for k in STAFF_FIELDS}))

    def find_staff_by_email(self, email):
        with self._session() as s:
            r = s.scalars(select(StaffRow).where(StaffRow.email == email)).first()
            return _dict(r, STAFF_FIELDS) if r else None

    def get_staff(self, staff_id):
        with self._session() as s:
            r = s.get(StaffRow, staff_id)
            return _dict(r, STAFF_FIELDS) if r else None

    def save_token(self, token, staff_id):
        with self._session() as s:
            s.merge(TokenRow(token=token, staff_id=staff_id))

    def staff_id_by_token(self, token):
        with self._session() as s:
            r = s.get(TokenRow, token)
            return r.staff_id if r else None

    def delete_token(self, token):
        with self._session() as s:
            r = s.get(TokenRow, token)
            if r:
                s.delete(r)

    # ---------- holds ----------
    def save_hold(self, h):
        with self._session() as s:
            s.merge(HoldRow(id=h["id"], event_id=h["event_id"], expires_at=h["expires_at"],
                            total=h["total"], items=[dict(i) for i in h["items"]]))

    @staticmethod
    def _hold(r):
        return {"id": r.id, "event_id": r.event_id, "expires_at": r.expires_at, "total": r.total,
                "items": [dict(i) for i in r.items]}

    def get_hold(self, hold_id):
        with self._session() as s:
            r = s.get(HoldRow, hold_id)
            return self._hold(r) if r else None

    def delete_hold(self, hold_id):
        with self._session() as s:
            r = s.get(HoldRow, hold_id)
            if r:
                s.delete(r)

    def all_holds(self):
        with self._session() as s:
            return [self._hold(r) for r in s.scalars(select(HoldRow))]

    # ---------- sold counters ----------
    def get_sold(self, unit_id):
        with self._session() as s:
            r = s.get(SoldRow, unit_id)
            return r.qty if r else 0

    def add_sold(self, unit_id, delta):
        with self._session() as s:
            r = s.get(SoldRow, unit_id)
            if r is None:
                r = SoldRow(unit_id=unit_id, qty=0)
                s.add(r)
            r.qty = max(0, (r.qty or 0) + delta)

    # ---------- orders and tickets ----------
    def save_order(self, o):
        with self._session() as s:
            s.merge(OrderRow(**{k: o[k] for k in ORDER_FIELDS}))

    def get_order(self, code):
        with self._session() as s:
            r = s.get(OrderRow, code)
            if not r:
                return None
            out = _dict(r, ORDER_FIELDS)
            out["ticket_codes"] = list(s.scalars(
                select(TicketRow.code).where(TicketRow.order_code == code).order_by(TicketRow.position)))
            return out

    def save_ticket(self, t):
        with self._session() as s:
            row = s.get(TicketRow, t["code"])
            if row is None:
                position = s.scalar(select(func.count()).select_from(TicketRow)
                                    .where(TicketRow.order_code == t["order_code"])) or 0
                row = TicketRow(code=t["code"], position=position)
                s.add(row)
            for f in TICKET_FIELDS:
                setattr(row, f, t[f])

    def get_ticket(self, code):
        with self._session() as s:
            r = s.get(TicketRow, code)
            return _dict(r, TICKET_FIELDS) if r else None
