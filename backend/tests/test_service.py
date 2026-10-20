"""Service-level tests, run on in-memory and SQLite storage. Run: cd backend && python -m pytest -q"""
import threading
import unittest
from datetime import datetime, timedelta, timezone

from app.errors import ApiError
from app.repository import InMemoryRepository
from app.seed import seed
from app.services import TicketingService

CARD_OK = "4242 4242 4242 4242"
BUYER = {"customer_name": "Aisha", "customer_email": "aisha@sdu.edu.kz"}


class Clock:
    def __init__(self):
        self.now = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)

    def __call__(self):
        return self.now

    def advance(self, **kw):
        self.now += timedelta(**kw)


class ServiceTests:
    """Every test runs against both storages (see the two TestCase classes at the bottom)."""

    def make_repo(self):
        raise NotImplementedError

    def setUp(self):
        self.clock = Clock()
        repo = self.make_repo()
        seed(repo)
        self.svc = TicketingService(repo, clock=self.clock)

    def hold(self, items, event_id=1):
        return self.svc.create_hold(event_id, items)

    def buy(self, h, card=CARD_OK):
        return self.svc.create_order(h["id"], BUYER["customer_name"], BUYER["customer_email"], card)

    def unit(self, event_id, unit_id):
        return next(u for u in self.svc.get_units(event_id) if u["id"] == unit_id)

    def assertApi(self, status, code, fn, *a, **kw):
        with self.assertRaises(ApiError) as cm:
            fn(*a, **kw)
        self.assertEqual((cm.exception.status, cm.exception.code), (status, code))

    def login_staff(self, email="controller@astana.kz"):
        token = self.svc.login(email, "password123")["access_token"]
        return self.svc.staff_from_token(token)

    # ---- catalog
    def test_catalog_filters(self):
        self.assertEqual(len(self.svc.list_events()), 3)
        self.assertEqual(self.svc.list_events()[0]["price_from"], 15000)
        self.assertEqual(len(self.svc.list_events(city="Almaty")), 1)
        self.assertEqual(len(self.svc.list_events(q="esports")), 1)
        self.assertEqual(len(self.svc.list_venues()), 2)
        self.assertEqual(len(self.svc.list_events(limit=1, offset=1)), 1)
        self.assertApi(404, "not_found", self.svc.get_event, 99)

    # ---- holds
    def test_hold_total_uses_real_prices(self):
        h = self.hold([{"unit_id": "1-B-3"}, {"unit_id": "1-D-1"}])
        self.assertEqual(h["total"], 35000)
        self.assertEqual(len(h["items"]), 2)

    def test_hold_limit_of_8(self):
        nine = [{"unit_id": f"1-A-{i}"} for i in range(1, 9)] + [{"unit_id": "1-B-1"}]
        self.assertApi(422, "limit_exceeded", self.hold, nine)
        self.assertEqual(len(self.hold(nine[:8])["items"]), 8)

    def test_second_buyer_gets_unit_held(self):
        self.hold([{"unit_id": "1-A-1"}])
        self.assertApi(409, "unit_held", self.hold, [{"unit_id": "1-A-1"}])
        self.assertEqual(self.unit(1, "1-A-1")["status"], "held")

    def test_hold_validation(self):
        self.assertApi(422, "validation_error", self.hold, [])
        self.assertApi(422, "validation_error", self.hold, [{"unit_id": "1-A-1"}, {"unit_id": "1-A-1"}])
        self.assertApi(404, "not_found", self.hold, [{"unit_id": "1-Z-9"}])

    def test_hold_expires_after_10_minutes(self):
        h = self.hold([{"unit_id": "1-A-2"}])
        self.clock.advance(minutes=10, seconds=1)
        self.assertEqual(self.unit(1, "1-A-2")["status"], "available")
        self.assertApi(410, "hold_expired", self.buy, h)
        self.hold([{"unit_id": "1-A-2"}])  # seat can be taken again

    def test_purge_removes_stale_holds_after_grace_period(self):
        h = self.hold([{"unit_id": "1-A-4"}])
        self.clock.advance(minutes=30)
        self.svc.purge_expired()
        self.assertIsNotNone(self.svc.repo.get_hold(h["id"]))  # inside the 1 hour grace period
        self.assertApi(410, "hold_expired", self.buy, h)
        h2 = self.hold([{"unit_id": "1-A-4"}])
        self.clock.advance(hours=2)
        self.svc.purge_expired()
        self.assertIsNone(self.svc.repo.get_hold(h2["id"]))
        self.assertEqual(self.unit(1, "1-A-4")["status"], "available")

    def test_release_hold(self):
        h = self.hold([{"unit_id": "1-A-3"}])
        self.svc.release_hold(h["id"])
        self.assertEqual(self.unit(1, "1-A-3")["status"], "available")
        self.assertApi(404, "not_found", self.svc.release_hold, h["id"])

    # ---- payment
    def test_payment_issues_tickets_and_marks_sold(self):
        order = self.buy(self.hold([{"unit_id": "1-C-1"}, {"unit_id": "1-C-2"}]))
        self.assertEqual((order["status"], order["total"], len(order["tickets"])), ("paid", 30000, 2))
        self.assertEqual(order["tickets"][0]["status"], "valid")
        self.assertEqual(self.unit(1, "1-C-1")["status"], "sold")
        self.assertEqual(self.svc.get_order(order["order_code"])["order_code"], order["order_code"])
        self.assertApi(409, "unit_sold", self.hold, [{"unit_id": "1-C-1"}])

    def test_declined_card_keeps_hold_and_creates_nothing(self):
        h = self.hold([{"unit_id": "1-D-3"}])
        for card in ("4000 0000 0000 0002", "4000-0000-0000-0002", "4000000000000002"):
            self.assertApi(402, "card_declined", self.buy, h, card)
        self.assertEqual(self.unit(1, "1-D-3")["status"], "held")
        self.assertEqual(len(self.buy(h)["tickets"]), 1)

    def test_checkout_validation(self):
        h = self.hold([{"unit_id": "1-D-4"}])
        self.assertApi(422, "validation_error", self.svc.create_order, h["id"], " ", "a@b.kz", CARD_OK)
        self.assertApi(422, "validation_error", self.svc.create_order, h["id"], "A", "not-an-email", CARD_OK)
        self.assertApi(422, "validation_error", self.svc.create_order, h["id"], "A", "a@b.kz", "12")
        self.assertApi(404, "not_found", self.svc.create_order, "HLD-NOPE", "A", "a@b.kz", CARD_OK)

    def test_zones(self):
        h = self.hold([{"unit_id": "3-zone-2", "quantity": 3}], event_id=3)
        self.assertEqual(h["total"], 60000)
        self.assertEqual(self.unit(3, "3-zone-2")["remaining"], 7)
        self.assertApi(409, "unit_held", self.hold, [{"unit_id": "3-zone-2", "quantity": 8}], 3)
        self.assertEqual(len(self.buy(h)["tickets"]), 3)
        self.assertEqual(self.unit(3, "3-zone-2")["remaining"], 7)

    # ---- scanner
    def test_scanner_valid_used_invalid(self):
        code = self.buy(self.hold([{"unit_id": "1-A-5"}]))["tickets"][0]["code"]
        self.assertApi(401, "unauthorized", self.svc.staff_from_token, None)
        staff = self.login_staff()
        self.assertEqual(self.svc.verify_ticket(staff, code, 1)["result"], "VALID")
        self.assertEqual(self.svc.verify_ticket(staff, code, 1)["result"], "ALREADY_USED")
        self.assertEqual(self.svc.verify_ticket(staff, "TKT-NOPE", 1)["result"], "INVALID")
        self.assertEqual(self.svc.get_ticket(code)["status"], "used")

    def test_scanner_wrong_event_cancelled_and_venue_isolation(self):
        order = self.buy(self.hold([{"unit_id": "1-A-6"}]))
        code = order["tickets"][0]["code"]
        astana = self.login_staff()
        self.assertEqual(self.svc.verify_ticket(astana, code, 3)["result"], "WRONG_EVENT")
        self.assertApi(403, "forbidden", self.svc.verify_ticket, astana, code, 2)
        self.svc.cancel_order(order["order_code"])
        self.assertEqual(self.svc.verify_ticket(astana, code, 1)["result"], "CANCELLED")
        almaty = self.login_staff("controller@almaty.kz")
        self.assertEqual(self.svc.verify_ticket(almaty, code, 2)["result"], "INVALID")

    def test_cancel_releases_seat_and_cannot_repeat(self):
        order = self.buy(self.hold([{"unit_id": "1-B-7"}]))
        self.assertEqual(self.svc.cancel_order(order["order_code"])["status"], "cancelled")
        self.assertEqual(self.unit(1, "1-B-7")["status"], "available")
        self.assertApi(409, "validation_error", self.svc.cancel_order, order["order_code"])

    def test_cancel_after_scan_is_rejected(self):
        order = self.buy(self.hold([{"unit_id": "1-B-8"}]))
        self.svc.verify_ticket(self.login_staff(), order["tickets"][0]["code"], 1)
        self.assertApi(409, "validation_error", self.svc.cancel_order, order["order_code"])

    def test_login_errors_and_logout(self):
        self.assertApi(401, "unauthorized", self.svc.login, "controller@astana.kz", "wrongwrong")
        self.assertApi(401, "unauthorized", self.svc.login, "nobody@x.kz", "password123")
        token = self.svc.login("controller@astana.kz", "password123")["access_token"]
        self.svc.logout(token)
        self.assertApi(401, "unauthorized", self.svc.staff_from_token, token)

    # ---- the race (issue #61)
    def test_race_two_buyers_one_seat(self):
        results, barrier = [], threading.Barrier(20)

        def buyer():
            barrier.wait()
            try:
                self.hold([{"unit_id": "1-A-7"}])
                results.append("ok")
            except ApiError as e:
                results.append(e.code)

        threads = [threading.Thread(target=buyer) for _ in range(20)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(results.count("ok"), 1)
        self.assertEqual(results.count("unit_held"), 19)

    def test_race_zone_never_oversells(self):
        results, barrier = [], threading.Barrier(10)

        def buyer():
            barrier.wait()
            try:
                self.hold([{"unit_id": "3-zone-2", "quantity": 4}], event_id=3)
                results.append(4)
            except ApiError:
                results.append(0)

        threads = [threading.Thread(target=buyer) for _ in range(10)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(sum(results), 8)  # capacity 10 -> only two holds of 4 fit
        self.assertEqual(self.unit(3, "3-zone-2")["remaining"], 2)


class TestMemoryRepo(ServiceTests, unittest.TestCase):
    def make_repo(self):
        return InMemoryRepository()


class TestSqliteRepo(ServiceTests, unittest.TestCase):
    def make_repo(self):
        from app.sql_repository import SqlRepository
        return SqlRepository("sqlite://")  # fresh in-memory SQLite per test

    def test_data_survives_restart(self):
        import os
        import tempfile
        from app.sql_repository import SqlRepository
        path = os.path.join(tempfile.mkdtemp(), "t.sqlite3")
        first = TicketingService(SqlRepository(f"sqlite:///{path}"), clock=self.clock)
        seed(first.repo)
        hold = first.create_hold(1, [{"unit_id": "1-A-1"}])
        order = first.create_order(hold["id"], "Aisha", "aisha@sdu.edu.kz", CARD_OK)
        second = TicketingService(SqlRepository(f"sqlite:///{path}"), clock=self.clock)  # "restart"
        self.assertEqual(second.get_order(order["order_code"])["total"], 20000)
        self.assertEqual(next(u for u in second.get_units(1) if u["id"] == "1-A-1")["status"], "sold")


if __name__ == "__main__":
    unittest.main()
