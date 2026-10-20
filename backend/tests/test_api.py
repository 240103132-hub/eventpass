"""HTTP-level tests. Needs: pip install -r requirements.txt   Run: cd backend && python -m pytest -q"""
import pytest
from fastapi.testclient import TestClient

from app.main import create_app

CARD_OK = "4242 4242 4242 4242"


@pytest.fixture()
def client():
    return TestClient(create_app())


def buy(client, unit_id="1-A-1", event_id=1):
    hold = client.post(f"/api/events/{event_id}/holds", json={"items": [{"unit_id": unit_id}]})
    assert hold.status_code == 201
    order = client.post("/api/orders", json={
        "hold_id": hold.json()["id"], "customer_name": "Aisha",
        "customer_email": "aisha@sdu.edu.kz", "card_number": CARD_OK})
    assert order.status_code == 201
    return order.json()


def auth(client, email="controller@astana.kz"):
    token = client.post("/api/auth/login", json={"email": email, "password": "password123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_catalog(client):
    events = client.get("/api/events").json()
    assert len(events) == 3 and events[0]["price_from"] == 15000
    assert len(client.get("/api/events", params={"city": "Almaty"}).json()) == 1
    assert len(client.get("/api/venues").json()) == 2
    assert len(client.get("/api/events/1/units").json()) == 32


def test_error_shape_is_code_and_detail(client):
    r = client.get("/api/events/999")
    assert r.status_code == 404 and r.json()["code"] == "not_found"
    r = client.post("/api/orders", json={"hold_id": "x"})
    assert r.status_code == 422 and r.json()["code"] == "validation_error"


def test_hold_conflict_and_limit(client):
    assert client.post("/api/events/1/holds", json={"items": [{"unit_id": "1-A-1"}]}).status_code == 201
    r = client.post("/api/events/1/holds", json={"items": [{"unit_id": "1-A-1"}]})
    assert (r.status_code, r.json()["code"]) == (409, "unit_held")
    nine = [{"unit_id": f"1-B-{i}"} for i in range(1, 9)] + [{"unit_id": "1-C-1"}]
    r = client.post("/api/events/1/holds", json={"items": nine})
    assert (r.status_code, r.json()["code"]) == (422, "limit_exceeded")


def test_declined_card_then_success(client):
    hold = client.post("/api/events/1/holds", json={"items": [{"unit_id": "1-D-1"}]}).json()
    body = {"hold_id": hold["id"], "customer_name": "A", "customer_email": "a@b.kz", "card_number": "4000 0000 0000 0002"}
    r = client.post("/api/orders", json=body)
    assert (r.status_code, r.json()["code"]) == (402, "card_declined")
    body["card_number"] = CARD_OK
    assert client.post("/api/orders", json=body).status_code == 201


def test_order_lifecycle_and_release(client):
    order = buy(client)
    assert client.get(f"/api/orders/{order['order_code']}").json()["status"] == "paid"
    assert client.post(f"/api/orders/{order['order_code']}/cancel").json()["status"] == "cancelled"
    hold = client.post("/api/events/1/holds", json={"items": [{"unit_id": "1-A-2"}]}).json()
    assert client.delete(f"/api/holds/{hold['id']}").status_code == 204
    assert client.delete(f"/api/holds/{hold['id']}").status_code == 404


def test_scanner_requires_login_and_checks_results(client):
    code = buy(client)["tickets"][0]["code"]
    assert client.post("/api/tickets/verify", json={"code": code, "event_id": 1}).status_code == 401
    h = auth(client)
    assert client.get("/api/auth/me", headers=h).json()["venue_id"] == 1
    assert client.post("/api/tickets/verify", json={"code": code, "event_id": 1}, headers=h).json()["result"] == "VALID"
    assert client.post("/api/tickets/verify", json={"code": code, "event_id": 1}, headers=h).json()["result"] == "ALREADY_USED"
    assert client.post("/api/tickets/verify", json={"code": "TKT-NOPE", "event_id": 1}, headers=h).json() == {
        "result": "INVALID", "message": "Unknown ticket"}
    assert client.post("/api/tickets/verify", json={"code": code, "event_id": 2}, headers=h).status_code == 403


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"email": "controller@astana.kz", "password": "wrongwrong"})
    assert (r.status_code, r.json()["code"]) == (401, "unauthorized")
