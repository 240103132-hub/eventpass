"""SQLAlchemy 2.0 tables. Portable types only (no SQLite-specific SQL), so the same models work on PostgreSQL."""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator):
    """Stores naive UTC, returns timezone-aware UTC (SQLite drops tzinfo)."""
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return None if value is None else value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        return None if value is None else value.replace(tzinfo=timezone.utc)


class Base(DeclarativeBase):
    pass


class VenueRow(Base):
    __tablename__ = "venues"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(200))
    city: Mapped[str] = mapped_column(String(100))


class EventRow(Base):
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text)
    image_url: Mapped[str] = mapped_column(String(500))
    venue_id: Mapped[int] = mapped_column(ForeignKey("venues.id"))
    hall_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    starts_at: Mapped[str] = mapped_column(String(40))
    mode: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20))
    sector_prices: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    zones: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)


class StaffRow(Base):
    __tablename__ = "staff"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    email: Mapped[str] = mapped_column(String(200), unique=True)
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20))
    venue_id: Mapped[Optional[int]] = mapped_column(ForeignKey("venues.id"), nullable=True)


class TokenRow(Base):
    __tablename__ = "tokens"
    token: Mapped[str] = mapped_column(String(100), primary_key=True)
    staff_id: Mapped[int] = mapped_column(ForeignKey("staff.id"))


class HoldRow(Base):
    __tablename__ = "holds"
    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"))
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    total: Mapped[int] = mapped_column(Integer)  # integer KZT
    items: Mapped[list] = mapped_column(JSON)


class SoldRow(Base):
    __tablename__ = "sold_units"
    unit_id: Mapped[str] = mapped_column(String(60), primary_key=True)
    qty: Mapped[int] = mapped_column(Integer, default=0)


class OrderRow(Base):
    __tablename__ = "orders"
    order_code: Mapped[str] = mapped_column(String(30), primary_key=True)
    status: Mapped[str] = mapped_column(String(20))
    customer_name: Mapped[str] = mapped_column(String(200))
    customer_email: Mapped[str] = mapped_column(String(200))
    total: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class TicketRow(Base):
    __tablename__ = "tickets"
    code: Mapped[str] = mapped_column(String(30), primary_key=True)
    order_code: Mapped[str] = mapped_column(ForeignKey("orders.order_code"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"))
    event_title: Mapped[str] = mapped_column(String(300))
    venue_name: Mapped[str] = mapped_column(String(200))
    starts_at: Mapped[str] = mapped_column(String(40))
    unit_id: Mapped[str] = mapped_column(String(60))
    unit_label: Mapped[str] = mapped_column(String(100))
    holder_name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20))
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime, nullable=True)
