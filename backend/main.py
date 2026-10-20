from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import models
from database import engine, SessionLocal
import random
import string

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="EventPass B2B Ticketing API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Seed initial data if empty
@app.on_event("startup")
def startup_event():
    db = SessionLocal()
    if db.query(models.EventDB).count() == 0:
        default_events = [
            models.EventDB(
                id=1,
                title="Astana Symphony & Rock Concert",
                venue="Astana Arena",
                date="2026-11-15 19:00",
                price=15000,
                image="https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80",
                description="A grand live performance merging classical orchestral arrangements with legendary rock anthems."
            ),
            models.EventDB(
                id=2,
                title="Almaty Tech Innovation Summit 2026",
                venue="Almaty Palace of Republic",
                date="2026-11-20 10:00",
                price=25000,
                image="https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80",
                description="Leading conference discussing AI developments, database engineering, and modern web architectures."
            ),
            models.EventDB(
                id=3,
                title="Central Asian Esports Championship",
                venue="Barys Arena",
                date="2026-12-05 14:00",
                price=8000,
                image="https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80",
                description="Top regional teams competing live in Counter-Strike 2 and Dota 2 grand finals."
            )
        ]
        db.add_all(default_events)
        db.commit()

        # Seed seats for events
        for ev in default_events:
            rows = ['A', 'B', 'C', 'D']
            for row in rows:
                for i in range(1, 9):
                    seat = models.SeatDB(
                        id=f"{ev.id}-{row}-{i}",
                        event_id=ev.id,
                        row=row,
                        number=i,
                        status="available",
                        price=20000 if row in ['A', 'B'] else 15000
                    )
                    db.add(seat)
        db.commit()
    db.close()

@app.get("/api/events")
def get_events(db: Session = Depends(get_db)):
    return db.query(models.EventDB).all()

@app.get("/api/events/{event_id}/seats")
def get_seats(event_id: int, db: Session = Depends(get_db)):
    seats = db.query(models.SeatDB).filter(models.SeatDB.event_id == event_id).all()
    return seats

@app.post("/api/orders")
def create_order(order_data: dict, db: Session = Depends(get_db)):
    event_id = order_data.get("event_id")
    seat_ids = order_data.get("seat_ids", [])
    customer_name = order_data.get("customer_name")

    # Mark seats as sold
    seats = db.query(models.SeatDB).filter(models.SeatDB.id.in_(seat_ids)).all()
    for seat in seats:
        seat.status = "sold"

    order_id = random.randint(10000, 99999)
    tickets = []
    for seat_id in seat_ids:
        hash_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        ticket = models.TicketDB(
            order_id=order_id,
            seat_id=seat_id,
            event_id=event_id,
            qr_code_hash=f"TKT-{hash_code}",
            is_used=False
        )
        db.add(ticket)
        tickets.append(ticket)

    db.commit()
    
    return {
        "order": {"id": order_id, "order_code": f"ORD-{order_id}", "customer_name": customer_name},
        "tickets": [{"id": t.id, "seat_id": t.seat_id, "qr_code_hash": t.qr_code_hash} for t in tickets]
    }

@app.post("/api/tickets/verify/{hash_code}")
def verify_ticket(hash_code: str, db: Session = Depends(get_db)):
    ticket = db.query(models.TicketDB).filter(models.TicketDB.qr_code_hash == hash_code).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Invalid Ticket Hash")
    if ticket.is_used:
        raise HTTPException(status_code=400, detail="Ticket ALREADY USED")
    
    ticket.is_used = True
    db.commit()
    return {"success": True, "message": "Ticket Verified Successfully!"}
