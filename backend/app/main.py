"""HTTP layer. Thin on purpose: parse, call the service, serialize. Rules live in services.py."""
import os
from typing import Optional

from fastapi import Depends, FastAPI, Header, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import schemas as s
from .errors import ApiError
from .repository import InMemoryRepository
from .seed import ensure_seed
from .services import TicketingService


def build_service() -> TicketingService:
    """DATABASE_URL selects the storage: a SQLAlchemy URL (default: local SQLite file) or "memory"."""
    url = os.environ.get("DATABASE_URL", "sqlite:///eventpass.sqlite3")
    if url == "memory":
        repo = InMemoryRepository()
    else:
        from .sql_repository import SqlRepository
        repo = SqlRepository(url)
    ensure_seed(repo)
    return TicketingService(repo)


def create_app(service: Optional[TicketingService] = None) -> FastAPI:
    app = FastAPI(title="EventPass API", version="0.2.0")
    app.state.service = service or build_service()

    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ---------- errors: every error is {"code": ..., "detail": ...} ----------
    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError):
        return JSONResponse(status_code=exc.status, content={"code": exc.code, "detail": exc.detail})

    @app.exception_handler(RequestValidationError)
    async def bad_request(_: Request, exc: RequestValidationError):
        first = exc.errors()[0]
        field = ".".join(str(p) for p in first["loc"] if p != "body")
        return JSONResponse(status_code=422, content={"code": "validation_error", "detail": f"{field}: {first['msg']}"})

    @app.exception_handler(Exception)
    async def unexpected(_: Request, exc: Exception):
        return JSONResponse(status_code=500, content={"code": "internal_error", "detail": "Something went wrong"})

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException):
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "error")
        return JSONResponse(status_code=exc.status_code, content={"code": code, "detail": str(exc.detail)})

    # ---------- dependencies ----------
    def svc(request: Request) -> TicketingService:
        return request.app.state.service

    def bearer(authorization: Optional[str] = Header(default=None)) -> Optional[str]:
        if authorization and authorization.lower().startswith("bearer "):
            return authorization[7:].strip()
        return None

    def current_staff(service: TicketingService = Depends(svc), token: Optional[str] = Depends(bearer)):
        return service.staff_from_token(token)

    # ---------- catalog ----------
    @app.get("/api/venues", response_model=list[s.VenueOut])
    def list_venues(service: TicketingService = Depends(svc)):
        return service.list_venues()

    @app.get("/api/events", response_model=list[s.EventOut])
    def list_events(
        q: Optional[str] = None, city: Optional[str] = None, venue_id: Optional[int] = None,
        date_from: Optional[str] = None, date_to: Optional[str] = None,
        limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
        service: TicketingService = Depends(svc),
    ):
        return service.list_events(q, city, venue_id, date_from, date_to, limit, offset)

    @app.get("/api/events/{event_id}", response_model=s.EventOut)
    def get_event(event_id: int, service: TicketingService = Depends(svc)):
        return service.get_event(event_id)

    @app.get("/api/events/{event_id}/units", response_model=list[s.UnitOut])
    def get_units(event_id: int, service: TicketingService = Depends(svc)):
        return service.get_units(event_id)

    # ---------- holds and orders ----------
    @app.post("/api/events/{event_id}/holds", response_model=s.HoldOut, status_code=201)
    def create_hold(event_id: int, body: s.HoldIn, service: TicketingService = Depends(svc)):
        return service.create_hold(event_id, [i.model_dump() for i in body.items])

    @app.delete("/api/holds/{hold_id}", status_code=204)
    def release_hold(hold_id: str, service: TicketingService = Depends(svc)):
        service.release_hold(hold_id)
        return Response(status_code=204)

    @app.post("/api/orders", response_model=s.OrderOut, status_code=201)
    def create_order(body: s.OrderIn, service: TicketingService = Depends(svc)):
        return service.create_order(body.hold_id, body.customer_name, body.customer_email, body.card_number)

    @app.get("/api/orders/{order_code}", response_model=s.OrderOut)
    def get_order(order_code: str, service: TicketingService = Depends(svc)):
        return service.get_order(order_code)

    @app.post("/api/orders/{order_code}/cancel", response_model=s.OrderOut)
    def cancel_order(order_code: str, service: TicketingService = Depends(svc)):
        return service.cancel_order(order_code)

    @app.get("/api/tickets/{code}", response_model=s.TicketOut)
    def get_ticket(code: str, service: TicketingService = Depends(svc)):
        return service.get_ticket(code)

    # ---------- staff ----------
    @app.post("/api/auth/login", response_model=s.TokenOut)
    def login(body: s.LoginIn, service: TicketingService = Depends(svc)):
        return service.login(body.email, body.password)

    @app.get("/api/auth/me", response_model=s.StaffOut)
    def me(staff=Depends(current_staff)):
        return staff

    @app.post("/api/auth/logout", status_code=204)
    def logout(service: TicketingService = Depends(svc), token: Optional[str] = Depends(bearer)):
        if token:
            service.logout(token)
        return Response(status_code=204)

    @app.post("/api/tickets/verify", response_model=s.ScanOut, response_model_exclude_none=True)
    def verify(body: s.ScanIn, service: TicketingService = Depends(svc), staff=Depends(current_staff)):
        return service.verify_ticket(staff, body.code, body.event_id)

    return app


app = create_app()
