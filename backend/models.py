from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from database import Base

class EventDB(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    venue = Column(String)
    date = Column(String)
    price = Column(Float)
    image = Column(String)
    description = Column(String)

class SeatDB(Base):
    __tablename__ = "seats"

    id = Column(String, primary_key=True, index=True) # e.g. "1-A-1"
    event_id = Column(Integer, index=True)
    row = Column(String)
    number = Column(Integer)
    status = Column(String, default="available") # available, held, sold
    held_until = Column(String, nullable=True)
    price = Column(Float)

class TicketDB(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    order_id = Column(Integer)
    seat_id = Column(String)
    event_id = Column(Integer)
    qr_code_hash = Column(String, unique=True, index=True)
    is_used = Column(Boolean, default=False)
