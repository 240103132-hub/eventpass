// Mock implementation of docs/openapi.yml (phase 1, issue #2).
// Every method returns a Promise and resolves with the same JSON shape as the real API.
// Errors are thrown as ApiError { status, code, detail }, like the real HTTP errors.
// State lives in localStorage, so a second browser tab sees holds and sales of the first one.

const HOLD_MS = 10 * 60 * 1000;
const MAX_TICKETS = 8;
const STATE_KEY = 'eventpass_mock_v2';
const TOKEN_KEY = 'eventpass_mock_token';

export class ApiError extends Error {
  constructor(status, code, detail) {
    super(detail);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

// ---------- storage (falls back to memory so the service also runs in node tests) ----------
const memory = {};
const store = {
  get(k) {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(k);
    return Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : null;
  },
  set(k, v) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(k, v);
    else memory[k] = v;
  },
  del(k) {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(k);
    else delete memory[k];
  },
};

// ---------- seed data ----------
const VENUES = [
  { id: 1, name: 'Astana Arena', city: 'Astana' },
  { id: 2, name: 'Almaty Palace of Republic', city: 'Almaty' },
];

const STAFF = [
  { id: 1, email: 'controller@astana.kz', password: 'password123', role: 'controller', venue_id: 1 },
  { id: 2, email: 'controller@almaty.kz', password: 'password123', role: 'controller', venue_id: 2 },
];

const EVENTS = [
  {
    id: 1,
    title: 'Astana Symphony & Rock Concert',
    description: 'A grand live performance merging classical orchestral arrangements with legendary rock anthems.',
    image_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
    venue_id: 1, hall_id: 1, starts_at: '2026-11-15T14:00:00Z', mode: 'seats', status: 'published',
    sector_prices: [{ sector: 'VIP', price: 20000 }, { sector: 'Standard', price: 15000 }],
  },
  {
    id: 2,
    title: 'Almaty Tech Innovation Summit 2026',
    description: 'Leading conference discussing AI developments, database engineering, and modern web architectures.',
    image_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80',
    venue_id: 2, hall_id: 2, starts_at: '2026-11-20T05:00:00Z', mode: 'seats', status: 'published',
    sector_prices: [{ sector: 'VIP', price: 25000 }, { sector: 'Standard', price: 18000 }],
  },
  {
    id: 3,
    title: 'Central Asian Esports Championship',
    description: 'Top regional teams competing live in Counter-Strike 2 and Dota 2 grand finals.',
    image_url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80',
    venue_id: 1, hall_id: null, starts_at: '2026-12-05T09:00:00Z', mode: 'zones', status: 'published',
    zones: [
      { name: 'Dance floor', capacity: 50, price: 8000 },
      { name: 'VIP lounge', capacity: 10, price: 20000 },
    ],
  },
];

// ---------- helpers ----------
const now = () => Date.now();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rand = (n) => Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
const venueOf = (id) => VENUES.find((v) => v.id === id);
const emptyState = () => ({ holds: {}, orders: {}, tickets: {}, sold: {} });

function load() {
  const raw = store.get(STATE_KEY);
  return raw ? JSON.parse(raw) : emptyState();
}
function save(state) {
  store.set(STATE_KEY, JSON.stringify(state));
}

const wait = (value) => Promise.resolve(value);
function fail(status, code, detail) {
  return Promise.reject(new ApiError(status, code, detail));
}

function buildUnits(event) {
  if (event.mode === 'zones') {
    return event.zones.map((z, i) => ({
      id: `${event.id}-zone-${i + 1}`, kind: 'zone', label: z.name, sector: null, row: null, number: null,
      price: z.price, capacity: z.capacity,
    }));
  }
  const units = [];
  const rows = ['A', 'B', 'C', 'D'];
  rows.forEach((row, ri) => {
    const sector = ri < 2 ? 'VIP' : 'Standard';
    const price = event.sector_prices.find((s) => s.sector === sector).price;
    for (let n = 1; n <= 8; n += 1) {
      units.push({
        id: `${event.id}-${row}-${n}`, kind: 'seat', label: `${row}-${n}`, sector, row, number: n, price,
      });
    }
  });
  return units;
}

function heldQty(state) {
  const map = {};
  Object.values(state.holds).forEach((h) => {
    if (new Date(h.expires_at).getTime() > now()) {
      h.items.forEach((it) => { map[it.unit_id] = (map[it.unit_id] || 0) + it.quantity; });
    }
  });
  return map;
}

function unitsWithStatus(event, state) {
  const held = heldQty(state);
  return buildUnits(event).map((u) => {
    const sold = state.sold[u.id] || 0;
    const h = held[u.id] || 0;
    if (u.kind === 'seat') return { ...u, status: sold ? 'sold' : h ? 'held' : 'available' };
    const remaining = Math.max(0, u.capacity - sold - h);
    const status = remaining > 0 ? 'available' : sold >= u.capacity ? 'sold' : 'held';
    return { ...u, remaining, status };
  });
}

function toEvent(event, state) {
  const venue = venueOf(event.venue_id);
  const units = unitsWithStatus(event, state);
  const remaining = units.reduce((sum, u) => sum + (u.kind === 'seat' ? (u.status === 'available' ? 1 : 0) : u.remaining), 0);
  return {
    id: event.id, title: event.title, description: event.description, image_url: event.image_url,
    venue_id: venue.id, venue_name: venue.name, city: venue.city, hall_id: event.hall_id,
    starts_at: event.starts_at, mode: event.mode, status: event.status,
    price_from: Math.min(...units.map((u) => u.price)), remaining,
  };
}

function toTicket(t) {
  return {
    code: t.code, event_id: t.event_id, event_title: t.event_title, venue_name: t.venue_name,
    starts_at: t.starts_at, unit_label: t.unit_label, holder_name: t.holder_name,
    status: t.status, is_used: t.is_used, used_at: t.used_at,
  };
}

function toOrder(order, state) {
  return {
    order_code: order.order_code, status: order.status, customer_name: order.customer_name,
    customer_email: order.customer_email, total: order.total, created_at: order.created_at,
    tickets: order.ticket_codes.map((c) => toTicket(state.tickets[c])),
  };
}

function currentStaff() {
  const token = store.get(TOKEN_KEY);
  if (!token) return null;
  const id = Number(token.replace('mock-', ''));
  return STAFF.find((s) => s.id === id) || null;
}
const publicStaff = (s) => ({ id: s.id, email: s.email, role: s.role, venue_id: s.venue_id });

// ---------- the API ----------
export const mockApi = {
  // Catalog
  listVenues() {
    return wait(VENUES.map((v) => ({ ...v })));
  },

  listEvents({ q, city, venue_id, date_from, date_to, limit = 50, offset = 0 } = {}) {
    const state = load();
    let list = EVENTS.filter((e) => e.status === 'published').map((e) => toEvent(e, state));
    if (q) list = list.filter((e) => e.title.toLowerCase().includes(q.toLowerCase()));
    if (city) list = list.filter((e) => e.city === city);
    if (venue_id) list = list.filter((e) => e.venue_id === Number(venue_id));
    if (date_from) list = list.filter((e) => e.starts_at.slice(0, 10) >= date_from);
    if (date_to) list = list.filter((e) => e.starts_at.slice(0, 10) <= date_to);
    return wait(list.slice(offset, offset + limit));
  },

  getEvent(id) {
    const event = EVENTS.find((e) => e.id === Number(id));
    if (!event) return fail(404, 'not_found', 'Event not found');
    return wait(toEvent(event, load()));
  },

  getUnits(eventId) {
    const event = EVENTS.find((e) => e.id === Number(eventId));
    if (!event) return fail(404, 'not_found', 'Event not found');
    return wait(unitsWithStatus(event, load()));
  },

  // Checkout
  createHold(eventId, { items } = {}) {
    const event = EVENTS.find((e) => e.id === Number(eventId));
    if (!event) return fail(404, 'not_found', 'Event not found');
    if (!Array.isArray(items) || items.length === 0) return fail(422, 'validation_error', 'Choose at least one place');

    const lines = items.map((it) => ({ unit_id: it.unit_id, quantity: it.quantity ?? 1 }));
    if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity < 1)) {
      return fail(422, 'validation_error', 'Quantity must be a positive integer');
    }
    const total = lines.reduce((s, l) => s + l.quantity, 0);
    if (total > MAX_TICKETS) return fail(422, 'limit_exceeded', `You can buy at most ${MAX_TICKETS} tickets at once`);
    if (new Set(lines.map((l) => l.unit_id)).size !== lines.length) {
      return fail(422, 'validation_error', 'The same place is listed twice');
    }

    const state = load();
    const units = unitsWithStatus(event, state);
    const resultItems = [];
    for (const line of lines) {
      const unit = units.find((u) => u.id === line.unit_id);
      if (!unit) return fail(404, 'not_found', `Unknown place ${line.unit_id}`);
      if (unit.kind === 'seat') {
        if (line.quantity !== 1) return fail(422, 'validation_error', 'A seat can only be taken once');
        if (unit.status !== 'available') {
          return fail(409, unit.status === 'sold' ? 'unit_sold' : 'unit_held', `Seat ${unit.label} is no longer available`);
        }
      } else if (line.quantity > unit.remaining) {
        const heldNow = (heldQty(state)[unit.id] || 0) > 0;
        return fail(409, heldNow ? 'unit_held' : 'unit_sold', `Only ${unit.remaining} left in ${unit.label}`);
      }
      resultItems.push({ unit_id: unit.id, label: unit.label, quantity: line.quantity, price: unit.price });
    }

    // forget holds that expired more than an hour ago
    Object.entries(state.holds).forEach(([id, h]) => {
      if (new Date(h.expires_at).getTime() < now() - 3600 * 1000) delete state.holds[id];
    });

    const hold = {
      id: `HLD-${rand(8)}`, event_id: event.id,
      expires_at: new Date(now() + HOLD_MS).toISOString(),
      items: resultItems,
      total: resultItems.reduce((s, i) => s + i.price * i.quantity, 0),
    };
    state.holds[hold.id] = hold;
    save(state);
    return wait(hold);
  },

  releaseHold(holdId) {
    const state = load();
    if (!state.holds[holdId]) return fail(404, 'not_found', 'Hold not found');
    delete state.holds[holdId];
    save(state);
    return wait(undefined);
  },

  createOrder({ hold_id, customer_name, customer_email, card_number } = {}) {
    if (!customer_name || !customer_name.trim()) return fail(422, 'validation_error', 'Name is required');
    if (!customer_email || !/^\S+@\S+\.\S+$/.test(customer_email)) return fail(422, 'validation_error', 'A valid email is required');
    const card = String(card_number || '').replace(/[\s-]/g, '');
    if (!/^\d{12,19}$/.test(card)) return fail(422, 'validation_error', 'Enter a valid card number');

    const state = load();
    const hold = state.holds[hold_id];
    if (!hold) return fail(404, 'not_found', 'Hold not found');
    if (new Date(hold.expires_at).getTime() <= now()) {
      delete state.holds[hold_id];
      save(state);
      return fail(410, 'hold_expired', 'Your hold has expired. The places were released.');
    }
    if (card === '4000000000000002') {
      // declined: the hold stays, no order, no ticket
      return fail(402, 'card_declined', 'Card declined. Please try another card.');
    }

    const event = EVENTS.find((e) => e.id === hold.event_id);
    const venue = venueOf(event.venue_id);
    const order = {
      order_code: `ORD-${Math.floor(100000 + Math.random() * 900000)}`, status: 'paid',
      customer_name: customer_name.trim(), customer_email: customer_email.trim(),
      total: hold.total, created_at: new Date(now()).toISOString(), ticket_codes: [],
    };
    hold.items.forEach((item) => {
      for (let i = 0; i < item.quantity; i += 1) {
        const code = `TKT-${rand(8)}`;
        state.tickets[code] = {
          code, event_id: event.id, event_title: event.title, venue_name: venue.name, starts_at: event.starts_at,
          unit_id: item.unit_id, unit_label: item.label, holder_name: order.customer_name,
          status: 'valid', is_used: false, used_at: null, order_code: order.order_code,
        };
        order.ticket_codes.push(code);
      }
      state.sold[item.unit_id] = (state.sold[item.unit_id] || 0) + item.quantity;
    });
    state.orders[order.order_code] = order;
    delete state.holds[hold_id];
    save(state);
    return wait(toOrder(order, state));
  },

  getOrder(orderCode) {
    const state = load();
    const order = state.orders[orderCode];
    if (!order) return fail(404, 'not_found', 'Order not found');
    return wait(toOrder(order, state));
  },

  cancelOrder(orderCode) {
    const state = load();
    const order = state.orders[orderCode];
    if (!order) return fail(404, 'not_found', 'Order not found');
    if (order.status === 'cancelled') return fail(409, 'validation_error', 'Order is already cancelled');
    if (order.ticket_codes.some((c) => state.tickets[c].is_used)) {
      return fail(409, 'validation_error', 'Some tickets of this order were already used');
    }
    order.ticket_codes.forEach((c) => {
      const t = state.tickets[c];
      t.status = 'cancelled';
      state.sold[t.unit_id] = Math.max(0, (state.sold[t.unit_id] || 0) - 1);
    });
    order.status = 'cancelled';
    save(state);
    return wait(toOrder(order, state));
  },

  getTicket(code) {
    const t = load().tickets[code];
    if (!t) return fail(404, 'not_found', 'Ticket not found');
    return wait(toTicket(t));
  },

  // Auth
  login({ email, password } = {}) {
    const staff = STAFF.find((s) => s.email === email && s.password === password);
    if (!staff) return fail(401, 'unauthorized', 'Wrong email or password');
    const token = `mock-${staff.id}`;
    store.set(TOKEN_KEY, token);
    return wait({ access_token: token, token_type: 'bearer', role: staff.role, venue_id: staff.venue_id });
  },

  me() {
    const staff = currentStaff();
    if (!staff) return fail(401, 'unauthorized', 'Please log in');
    return wait(publicStaff(staff));
  },

  logout() {
    store.del(TOKEN_KEY);
    return wait(undefined);
  },

  // Scanner
  verifyTicket({ code, event_id } = {}) {
    const staff = currentStaff();
    if (!staff) return fail(401, 'unauthorized', 'Please log in');
    const event = EVENTS.find((e) => e.id === Number(event_id));
    if (!event || event.venue_id !== staff.venue_id) return fail(403, 'forbidden', 'This event belongs to another venue');

    const state = load();
    const t = state.tickets[String(code || '').trim()];
    const ev = t && EVENTS.find((e) => e.id === t.event_id);
    if (!t || ev.venue_id !== staff.venue_id) return wait({ result: 'INVALID', message: 'Unknown ticket' });
    if (t.event_id !== event.id) return wait({ result: 'WRONG_EVENT', message: `This ticket is for "${t.event_title}"`, ticket: toTicket(t) });
    if (t.status === 'cancelled') return wait({ result: 'CANCELLED', message: 'This ticket was cancelled', ticket: toTicket(t) });
    if (t.is_used) return wait({ result: 'ALREADY_USED', message: 'This ticket was already used', ticket: toTicket(t) });

    t.is_used = true;
    t.status = 'used';
    t.used_at = new Date(now()).toISOString();
    save(state);
    return wait({ result: 'VALID', message: 'Welcome in', ticket: toTicket(t) });
  },
};

// test helper: wipe all mock state
export function __resetMock() {
  store.del(STATE_KEY);
  store.del(TOKEN_KEY);
}
