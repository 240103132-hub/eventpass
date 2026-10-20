from .security import hash_password

VENUES = [
    {"id": 1, "name": "Astana Arena", "city": "Astana"},
    {"id": 2, "name": "Almaty Palace of Republic", "city": "Almaty"},
]

STAFF = [
    {"id": 1, "email": "controller@astana.kz", "password": "password123", "role": "controller", "venue_id": 1},
    {"id": 2, "email": "controller@almaty.kz", "password": "password123", "role": "controller", "venue_id": 2},
]

EVENTS = [
    {
        "id": 1, "title": "Astana Symphony & Rock Concert",
        "description": "A grand live performance merging classical orchestral arrangements with legendary rock anthems.",
        "image_url": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80",
        "venue_id": 1, "hall_id": 1, "starts_at": "2026-11-15T14:00:00Z", "mode": "seats", "status": "published",
        "sector_prices": [{"sector": "VIP", "price": 20000}, {"sector": "Standard", "price": 15000}],
    },
    {
        "id": 2, "title": "Almaty Tech Innovation Summit 2026",
        "description": "Leading conference discussing AI developments, database engineering, and modern web architectures.",
        "image_url": "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80",
        "venue_id": 2, "hall_id": 2, "starts_at": "2026-11-20T05:00:00Z", "mode": "seats", "status": "published",
        "sector_prices": [{"sector": "VIP", "price": 25000}, {"sector": "Standard", "price": 18000}],
    },
    {
        "id": 3, "title": "Central Asian Esports Championship",
        "description": "Top regional teams competing live in Counter-Strike 2 and Dota 2 grand finals.",
        "image_url": "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80",
        "venue_id": 1, "hall_id": None, "starts_at": "2026-12-05T09:00:00Z", "mode": "zones", "status": "published",
        "zones": [
            {"name": "Dance floor", "capacity": 50, "price": 8000},
            {"name": "VIP lounge", "capacity": 10, "price": 20000},
        ],
    },
]


def seed(repo):
    for v in VENUES:
        repo.add_venue(dict(v))
    for e in EVENTS:
        repo.add_event(dict(e))
    for s in STAFF:
        row = {k: v for k, v in s.items() if k != "password"}
        row["password_hash"] = hash_password(s["password"])
        repo.add_staff(row)
