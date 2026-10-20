"""Storage layer. The service talks only to these methods.

Phase 3: everything lives in memory. Phase 4 (issue: SQLite): write SqlRepository with the
same methods on top of SQLAlchemy and pass it to TicketingService instead.
"""
import threading
from contextlib import contextmanager


class InMemoryRepository:
    def __init__(self):
        self._lock = threading.RLock()
        self._venues, self._events, self._staff = {}, {}, {}
        self._tokens, self._holds, self._orders, self._tickets, self._sold = {}, {}, {}, {}, {}

    @contextmanager
    def transaction(self):
        """Serializes every read-modify-write. SQL version: a DB transaction."""
        with self._lock:
            yield

    # reference data
    def add_venue(self, v): self._venues[v["id"]] = v
    def list_venues(self): return list(self._venues.values())
    def get_venue(self, venue_id): return self._venues.get(venue_id)
    def add_event(self, e): self._events[e["id"]] = e
    def list_events(self): return list(self._events.values())
    def get_event(self, event_id): return self._events.get(event_id)

    # staff and sessions
    def add_staff(self, s): self._staff[s["id"]] = s
    def find_staff_by_email(self, email):
        return next((s for s in self._staff.values() if s["email"] == email), None)
    def get_staff(self, staff_id): return self._staff.get(staff_id)
    def save_token(self, token, staff_id): self._tokens[token] = staff_id
    def staff_id_by_token(self, token): return self._tokens.get(token)
    def delete_token(self, token): self._tokens.pop(token, None)

    # holds
    def save_hold(self, hold): self._holds[hold["id"]] = hold
    def get_hold(self, hold_id): return self._holds.get(hold_id)
    def delete_hold(self, hold_id): self._holds.pop(hold_id, None)
    def all_holds(self): return list(self._holds.values())

    # sold counters per unit (seat: 0/1, zone: 0..capacity)
    def get_sold(self, unit_id): return self._sold.get(unit_id, 0)
    def add_sold(self, unit_id, delta):
        self._sold[unit_id] = max(0, self._sold.get(unit_id, 0) + delta)

    # orders and tickets
    def save_order(self, order): self._orders[order["order_code"]] = order
    def get_order(self, code): return self._orders.get(code)
    def save_ticket(self, ticket): self._tickets[ticket["code"]] = ticket
    def get_ticket(self, code): return self._tickets.get(code)
