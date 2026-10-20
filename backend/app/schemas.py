from typing import Optional

from pydantic import BaseModel


class VenueOut(BaseModel):
    id: int
    name: str
    city: str


class EventOut(BaseModel):
    id: int
    title: str
    description: str
    image_url: str
    venue_id: int
    venue_name: str
    city: str
    hall_id: Optional[int] = None
    starts_at: str
    mode: str
    status: str
    price_from: int
    remaining: int


class UnitOut(BaseModel):
    id: str
    kind: str
    label: str
    sector: Optional[str] = None
    row: Optional[str] = None
    number: Optional[int] = None
    price: int
    status: str
    capacity: Optional[int] = None
    remaining: Optional[int] = None


class HoldItemIn(BaseModel):
    unit_id: str
    quantity: int = 1


class HoldIn(BaseModel):
    items: list[HoldItemIn]


class HoldItemOut(BaseModel):
    unit_id: str
    label: str
    quantity: int
    price: int


class HoldOut(BaseModel):
    id: str
    event_id: int
    expires_at: str
    items: list[HoldItemOut]
    total: int


class OrderIn(BaseModel):
    hold_id: str
    customer_name: str
    customer_email: str
    card_number: str


class TicketOut(BaseModel):
    code: str
    event_id: int
    event_title: str
    venue_name: str
    starts_at: str
    unit_label: str
    holder_name: str
    status: str
    is_used: bool
    used_at: Optional[str] = None


class OrderOut(BaseModel):
    order_code: str
    status: str
    customer_name: str
    customer_email: str
    total: int
    created_at: str
    tickets: list[TicketOut]


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str
    role: str
    venue_id: Optional[int] = None


class StaffOut(BaseModel):
    id: int
    email: str
    role: str
    venue_id: Optional[int] = None


class ScanIn(BaseModel):
    code: str
    event_id: int


class ScanOut(BaseModel):
    result: str
    message: str
    ticket: Optional[TicketOut] = None


class ErrorOut(BaseModel):
    code: str
    detail: str
