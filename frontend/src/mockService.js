// Initial Mock Data for EventPass MVP

const STORAGE_KEYS = {
  EVENTS: 'eventpass_events',
  SEATS: 'eventpass_seats',
  ORDERS: 'eventpass_orders',
  TICKETS: 'eventpass_tickets',
};

const defaultEvents = [
  {
    id: 1,
    title: 'Astana Symphony & Rock Concert',
    venue: 'Astana Arena',
    date: '2026-11-15 19:00',
    price: 15000,
    image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
    description: 'A grand live performance merging classical orchestral arrangements with legendary rock anthems.'
  },
  {
    id: 2,
    title: 'Almaty Tech Innovation Summit 2026',
    venue: 'Almaty Palace of Republic',
    date: '2026-11-20 10:00',
    price: 25000,
    image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80',
    description: 'Leading conference discussing AI developments, database engineering, and modern web architectures.'
  },
  {
    id: 3,
    title: 'Central Asian Esports Championship',
    venue: 'Barys Arena',
    date: '2026-12-05 14:00',
    price: 8000,
    image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80',
    description: 'Top regional teams competing live in Counter-Strike 2 and Dota 2 grand finals.'
  }
];

const generateSeatsForEvent = (eventId) => {
  const seats = [];
  const rows = ['A', 'B', 'C', 'D'];
  rows.forEach((row, rowIndex) => {
    for (let i = 1; i <= 8; i++) {
      seats.push({
        id: `${eventId}-${row}-${i}`,
        event_id: eventId,
        row: row,
        number: i,
        status: 'available', // available, held, sold
        held_until: null,
        price: rowIndex < 2 ? 20000 : 15000
      });
    }
  });
  return seats;
};

export const mockService = {
  getEvents() {
    const stored = localStorage.getItem(STORAGE_KEYS.EVENTS);
    if (!stored) {
      localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(defaultEvents));
      return defaultEvents;
    }
    return JSON.parse(stored);
  },

  getEventById(id) {
    const events = this.getEvents();
    return events.find(e => e.id === Number(id)) || null;
  },

  getSeats(eventId) {
    const key = `${STORAGE_KEYS.SEATS}_${eventId}`;
    const stored = localStorage.getItem(key);
    if (!stored) {
      const seats = generateSeatsForEvent(eventId);
      localStorage.setItem(key, JSON.stringify(seats));
      return seats;
    }
    return JSON.parse(stored);
  },

  holdSeats(eventId, seatIds) {
    const key = `${STORAGE_KEYS.SEATS}_${eventId}`;
    const seats = this.getSeats(eventId);
    const holdUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes hold

    const updated = seats.map(seat => {
      if (seatIds.includes(seat.id) && seat.status === 'available') {
        return { ...seat, status: 'held', held_until: holdUntil };
      }
      return seat;
    });

    localStorage.setItem(key, JSON.stringify(updated));
    return { success: true, held_until: holdUntil };
  },

  createOrder(orderData) {
    const orders = JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS) || '[]');
    const newOrder = {
      id: Date.now(),
      order_code: `ORD-${Math.floor(100000 + Math.random() * 900000)}`,
      ...orderData,
      status: 'paid',
      created_at: new Date().toISOString()
    };

    orders.push(newOrder);
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));

    // Mark seats as sold
    const key = `${STORAGE_KEYS.SEATS}_${orderData.event_id}`;
    const seats = this.getSeats(orderData.event_id);
    const updatedSeats = seats.map(s => {
      if (orderData.seat_ids.includes(s.id)) {
        return { ...s, status: 'sold', held_until: null };
      }
      return s;
    });
    localStorage.setItem(key, JSON.stringify(updatedSeats));

    // Generate tickets
    const tickets = JSON.parse(localStorage.getItem(STORAGE_KEYS.TICKETS) || '[]');
    const newTickets = orderData.seat_ids.map(seatId => ({
      id: Date.now() + Math.random(),
      order_id: newOrder.id,
      seat_id: seatId,
      event_id: orderData.event_id,
      qr_code_hash: `TKT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      is_used: false
    }));

    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify([...tickets, ...newTickets]));

    return { order: newOrder, tickets: newTickets };
  },

  getTicketByHash(hash) {
    const tickets = JSON.parse(localStorage.getItem(STORAGE_KEYS.TICKETS) || '[]');
    return tickets.find(t => t.qr_code_hash === hash) || null;
  },

  markTicketUsed(hash) {
    const tickets = JSON.parse(localStorage.getItem(STORAGE_KEYS.TICKETS) || '[]');
    let found = false;
    const updated = tickets.map(t => {
      if (t.qr_code_hash === hash) {
        found = true;
        return { ...t, is_used: true };
      }
      return t;
    });
    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(updated));
    return found;
  }
};
