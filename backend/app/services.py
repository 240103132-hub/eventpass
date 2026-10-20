"""Business rules of EventPass. No web framework imports here, so it is testable on its own.

Mirrors frontend/src/mockApi.js, which mirrors docs/openapi.yml.
"""
import re
import secrets
from datetime import datetime, timedelta, timezone

from .errors import ApiError
from .security import verify_password

HOLD_TTL = timedelta(minutes=10)
MAX_TICKETS = 8
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_EMAIL = re.compile(r"^\S+@\S+\.\S+$")
DECLINED_CARD = "4000000000000002"


def _rand(n):
    return "".join(secrets.choice(_ALPHABET) for _ in range(n))


def _utcnow():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class TicketingService:
    def __init__(self, repo, clock=_utcnow):
        self.repo = repo
        self.clock = clock

    # ---------- catalog ----------
    def list_venues(self):
        return [dict(v) for v in self.repo.list_venues()]

    def list_events(self, q=None, city=None, venue_id=None, date_from=None, date_to=None, limit=50, offset=0):
        with self.repo.transaction():
            items = [self._event_out(e) for e in self.repo.list_events() if e["status"] == "published"]
        if q:
            items = [e for e in items if q.lower() in e["title"].lower()]
        if city:
            items = [e for e in items if e["city"] == city]
        if venue_id:
            items = [e for e in items if e["venue_id"] == int(venue_id)]
        if date_from:
            items = [e for e in items if e["starts_at"][:10] >= date_from]
        if date_to:
            items = [e for e in items if e["starts_at"][:10] <= date_to]
        return items[offset:offset + limit]

    def get_event(self, event_id):
        with self.repo.transaction():
            return self._event_out(self._event_or_404(event_id))

    def get_units(self, event_id):
        with self.repo.transaction():
            return self._units_with_status(self._event_or_404(event_id))

    # ---------- holds ----------
    def create_hold(self, event_id, items):
        event = self._event_or_404(event_id)
        if not items:
            raise ApiError(422, "validation_error", "Choose at least one place")
        lines = [{"unit_id": it["unit_id"], "quantity": it.get("quantity", 1)} for it in items]
        if any((not isinstance(l["quantity"], int)) or l["quantity"] < 1 for l in lines):
            raise ApiError(422, "validation_error", "Quantity must be a positive integer")
        if sum(l["quantity"] for l in lines) > MAX_TICKETS:
            raise ApiError(422, "limit_exceeded", f"You can buy at most {MAX_TICKETS} tickets at once")
        if len({l["unit_id"] for l in lines}) != len(lines):
            raise ApiError(422, "validation_error", "The same place is listed twice")

        with self.repo.transaction():  # the whole check-and-take is atomic: no double booking
            self._purge_expired()
            units = {u["id"]: u for u in self._units_with_status(event)}
            held_now = self._held_qty()
            result = []
            for line in lines:
                unit = units.get(line["unit_id"])
                if unit is None:
                    raise ApiError(404, "not_found", f"Unknown place {line['unit_id']}")
                if unit["kind"] == "seat":
                    if line["quantity"] != 1:
                        raise ApiError(422, "validation_error", "A seat can only be taken once")
                    if unit["status"] != "available":
                        code = "unit_sold" if unit["status"] == "sold" else "unit_held"
                        raise ApiError(409, code, f"Seat {unit['label']} is no longer available")
                elif line["quantity"] > unit["remaining"]:
                    code = "unit_held" if held_now.get(unit["id"], 0) > 0 else "unit_sold"
                    raise ApiError(409, code, f"Only {unit['remaining']} left in {unit['label']}")
                result.append({"unit_id": unit["id"], "label": unit["label"],
                               "quantity": line["quantity"], "price": unit["price"]})
            hold = {
                "id": f"HLD-{_rand(8)}", "event_id": event["id"],
                "expires_at": self.clock() + HOLD_TTL, "items": result,
                "total": sum(i["price"] * i["quantity"] for i in result),
            }
            self.repo.save_hold(hold)
            return self._hold_out(hold)

    def release_hold(self, hold_id):
        with self.repo.transaction():
            if not self.repo.get_hold(hold_id):
                raise ApiError(404, "not_found", "Hold not found")
            self.repo.delete_hold(hold_id)

    # ---------- orders ----------
    def create_order(self, hold_id, customer_name, customer_email, card_number):
        if not customer_name or not customer_name.strip():
            raise ApiError(422, "validation_error", "Name is required")
        if not customer_email or not _EMAIL.match(customer_email):
            raise ApiError(422, "validation_error", "A valid email is required")
        card = re.sub(r"[\s-]", "", str(card_number or ""))
        if not re.fullmatch(r"\d{12,19}", card):
            raise ApiError(422, "validation_error", "Enter a valid card number")

        with self.repo.transaction():
            hold = self.repo.get_hold(hold_id)
            if not hold:
                raise ApiError(404, "not_found", "Hold not found")
            if hold["expires_at"] <= self.clock():  # issue #60: expiry checked at payment time
                self.repo.delete_hold(hold_id)
                raise ApiError(410, "hold_expired", "Your hold has expired. The places were released.")
            if card == DECLINED_CARD:  # issue #63: hold stays, no order, no ticket
                raise ApiError(402, "card_declined", "Card declined. Please try another card.")

            event = self.repo.get_event(hold["event_id"])
            venue = self.repo.get_venue(event["venue_id"])
            code = f"ORD-{secrets.randbelow(900000) + 100000}"
            while self.repo.get_order(code):
                code = f"ORD-{secrets.randbelow(900000) + 100000}"
            order = {"order_code": code, "status": "paid", "customer_name": customer_name.strip(),
                     "customer_email": customer_email.strip(), "total": hold["total"],
                     "created_at": self.clock(), "ticket_codes": []}
            tickets = []
            for item in hold["items"]:
                for _ in range(item["quantity"]):
                    ticket = {
                        "code": f"TKT-{_rand(8)}", "event_id": event["id"], "event_title": event["title"],
                        "venue_name": venue["name"], "starts_at": event["starts_at"],
                        "unit_id": item["unit_id"], "unit_label": item["label"],
                        "holder_name": order["customer_name"], "status": "valid",
                        "is_used": False, "used_at": None, "order_code": code,
                    }
                    tickets.append(ticket)
                    order["ticket_codes"].append(ticket["code"])
            self.repo.save_order(order)  # order first: tickets reference it (foreign key)
            for ticket in tickets:
                self.repo.save_ticket(ticket)
            for item in hold["items"]:
                self.repo.add_sold(item["unit_id"], item["quantity"])
            self.repo.delete_hold(hold_id)
            return self._order_out(order)

    def get_order(self, order_code):
        with self.repo.transaction():
            return self._order_out(self._order_or_404(order_code))

    def cancel_order(self, order_code):
        with self.repo.transaction():
            order = self._order_or_404(order_code)
            if order["status"] == "cancelled":
                raise ApiError(409, "validation_error", "Order is already cancelled")
            tickets = [self.repo.get_ticket(c) for c in order["ticket_codes"]]
            if any(t["is_used"] for t in tickets):
                raise ApiError(409, "validation_error", "Some tickets of this order were already used")
            for t in tickets:
                t["status"] = "cancelled"
                self.repo.save_ticket(t)
                self.repo.add_sold(t["unit_id"], -1)
            order["status"] = "cancelled"
            self.repo.save_order(order)
            return self._order_out(order)

    def get_ticket(self, code):
        with self.repo.transaction():
            t = self.repo.get_ticket(code)
            if not t:
                raise ApiError(404, "not_found", "Ticket not found")
            return self._ticket_out(t)

    # ---------- staff and scanner ----------
    def login(self, email, password):
        staff = self.repo.find_staff_by_email(email)
        if not staff or not verify_password(password, staff["password_hash"]):
            raise ApiError(401, "unauthorized", "Wrong email or password")
        token = secrets.token_urlsafe(32)
        self.repo.save_token(token, staff["id"])
        return {"access_token": token, "token_type": "bearer", "role": staff["role"], "venue_id": staff["venue_id"]}

    def staff_from_token(self, token):
        staff_id = self.repo.staff_id_by_token(token) if token else None
        staff = self.repo.get_staff(staff_id) if staff_id else None
        if not staff:
            raise ApiError(401, "unauthorized", "Please log in")
        return {k: staff[k] for k in ("id", "email", "role", "venue_id")}

    def logout(self, token):
        self.repo.delete_token(token)

    def verify_ticket(self, staff, code, event_id):
        event = self.repo.get_event(int(event_id))
        if not event or event["venue_id"] != staff["venue_id"]:
            raise ApiError(403, "forbidden", "This event belongs to another venue")
        with self.repo.transaction():  # scan-and-mark is atomic: one valid scan per ticket
            t = self.repo.get_ticket(str(code or "").strip())
            ticket_event = t and self.repo.get_event(t["event_id"])
            if not t or ticket_event["venue_id"] != staff["venue_id"]:
                return {"result": "INVALID", "message": "Unknown ticket"}
            out = self._ticket_out(t)
            if t["event_id"] != event["id"]:
                return {"result": "WRONG_EVENT", "message": f'This ticket is for "{t["event_title"]}"', "ticket": out}
            if t["status"] == "cancelled":
                return {"result": "CANCELLED", "message": "This ticket was cancelled", "ticket": out}
            if t["is_used"]:
                return {"result": "ALREADY_USED", "message": "This ticket was already used", "ticket": out}
            t["is_used"], t["status"], t["used_at"] = True, "used", self.clock()
            self.repo.save_ticket(t)
            return {"result": "VALID", "message": "Welcome in", "ticket": self._ticket_out(t)}

    # ---------- internals ----------
    def _event_or_404(self, event_id):
        event = self.repo.get_event(int(event_id))
        if not event:
            raise ApiError(404, "not_found", "Event not found")
        return event

    def _order_or_404(self, code):
        order = self.repo.get_order(code)
        if not order:
            raise ApiError(404, "not_found", "Order not found")
        return order

    def _purge_expired(self):
        cutoff = self.clock() - timedelta(hours=1)
        for h in self.repo.all_holds():
            if h["expires_at"] < cutoff:
                self.repo.delete_hold(h["id"])

    def _held_qty(self):
        now, held = self.clock(), {}
        for h in self.repo.all_holds():
            if h["expires_at"] > now:
                for it in h["items"]:
                    held[it["unit_id"]] = held.get(it["unit_id"], 0) + it["quantity"]
        return held

    @staticmethod
    def _build_units(event):
        if event["mode"] == "zones":
            return [{"id": f"{event['id']}-zone-{i + 1}", "kind": "zone", "label": z["name"], "sector": None,
                     "row": None, "number": None, "price": z["price"], "capacity": z["capacity"]}
                    for i, z in enumerate(event["zones"])]
        prices = {s["sector"]: s["price"] for s in event["sector_prices"]}
        units = []
        for ri, row in enumerate("ABCD"):
            sector = "VIP" if ri < 2 else "Standard"
            for n in range(1, 9):
                units.append({"id": f"{event['id']}-{row}-{n}", "kind": "seat", "label": f"{row}-{n}",
                              "sector": sector, "row": row, "number": n, "price": prices[sector]})
        return units

    def _units_with_status(self, event):
        held, out = self._held_qty(), []
        for u in self._build_units(event):
            sold, h = self.repo.get_sold(u["id"]), held.get(u["id"], 0)
            if u["kind"] == "seat":
                out.append({**u, "status": "sold" if sold else "held" if h else "available"})
            else:
                remaining = max(0, u["capacity"] - sold - h)
                status = "available" if remaining > 0 else "sold" if sold >= u["capacity"] else "held"
                out.append({**u, "remaining": remaining, "status": status})
        return out

    def _event_out(self, event):
        venue = self.repo.get_venue(event["venue_id"])
        units = self._units_with_status(event)
        remaining = sum((1 if u["status"] == "available" else 0) if u["kind"] == "seat" else u["remaining"]
                        for u in units)
        return {"id": event["id"], "title": event["title"], "description": event["description"],
                "image_url": event["image_url"], "venue_id": venue["id"], "venue_name": venue["name"],
                "city": venue["city"], "hall_id": event["hall_id"], "starts_at": event["starts_at"],
                "mode": event["mode"], "status": event["status"],
                "price_from": min(u["price"] for u in units), "remaining": remaining}

    @staticmethod
    def _hold_out(hold):
        return {"id": hold["id"], "event_id": hold["event_id"], "expires_at": iso(hold["expires_at"]),
                "items": [dict(i) for i in hold["items"]], "total": hold["total"]}

    @staticmethod
    def _ticket_out(t):
        return {"code": t["code"], "event_id": t["event_id"], "event_title": t["event_title"],
                "venue_name": t["venue_name"], "starts_at": t["starts_at"], "unit_label": t["unit_label"],
                "holder_name": t["holder_name"], "status": t["status"], "is_used": t["is_used"],
                "used_at": iso(t["used_at"]) if t["used_at"] else None}

    def _order_out(self, order):
        return {"order_code": order["order_code"], "status": order["status"],
                "customer_name": order["customer_name"], "customer_email": order["customer_email"],
                "total": order["total"], "created_at": iso(order["created_at"]),
                "tickets": [self._ticket_out(self.repo.get_ticket(c)) for c in order["ticket_codes"]]}
