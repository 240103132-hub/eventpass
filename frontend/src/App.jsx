import React, { useState, useEffect } from 'react';
import { api } from './api';
import { Calendar, MapPin, Ticket, QrCode, Clock, CheckCircle2, ArrowLeft, Camera, Search } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import Scanner from './Scanner';

const MAX_TICKETS = 8;
const money = (n) => `${Number(n).toLocaleString('ru-RU')} ₸`;
const when = (iso) =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Almaty' });

const inputCls =
  'w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500';
const labelCls = 'block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1';
const alertCls = 'bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm font-semibold rounded-xl px-4 py-3';

export default function App() {
  const [view, setView] = useState('catalog'); // catalog | event | checkout | success | scanner
  const [venues, setVenues] = useState([]);
  const [events, setEvents] = useState([]);
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [event, setEvent] = useState(null);
  const [units, setUnits] = useState([]);
  const [picked, setPicked] = useState({}); // unit id -> quantity
  const [notice, setNotice] = useState('');

  const [hold, setHold] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [form, setForm] = useState({ name: '', email: '', card: '' });
  const [payError, setPayError] = useState('');
  const [paying, setPaying] = useState(false);
  const [order, setOrder] = useState(null);

  useEffect(() => { api.listVenues().then(setVenues).catch(() => {}); }, []);
  const cities = [...new Set(venues.map((v) => v.city))];

  useEffect(() => {
    let off = false;
    setLoading(true);
    api.listEvents({ q: q || undefined, city: city || undefined })
      .then((d) => { if (!off) { setEvents(d); setLoadError(''); } })
      .catch((e) => { if (!off) setLoadError(e.detail || 'Could not load events'); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [q, city, view]);

  // seat map polling every 5 seconds
  useEffect(() => {
    if (view !== 'event' || !event) return undefined;
    let off = false;
    const tick = () => api.getUnits(event.id).then((u) => { if (!off) setUnits(u); }).catch(() => {});
    tick();
    const id = setInterval(tick, 5000);
    return () => { off = true; clearInterval(id); };
  }, [view, event]);

  // drop picks that someone else took meanwhile
  useEffect(() => {
    setPicked((p) => {
      const next = {};
      Object.entries(p).forEach(([id, qty]) => {
        const u = units.find((x) => x.id === id);
        if (!u) return;
        if (u.kind === 'seat' ? u.status === 'available' : u.remaining >= qty) next[id] = qty;
      });
      return Object.keys(next).length === Object.keys(p).length ? p : next;
    });
  }, [units]);

  // checkout countdown
  useEffect(() => {
    if (view !== 'checkout') return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [view]);
  const left = hold ? Math.max(0, Math.floor((new Date(hold.expires_at).getTime() - now) / 1000)) : 0;
  const expired = Boolean(hold) && left === 0;

  const totalQty = Object.values(picked).reduce((s, n) => s + n, 0);
  const totalPrice = Object.entries(picked).reduce((s, [id, n]) => s + (units.find((u) => u.id === id)?.price || 0) * n, 0);

  function openEvent(ev) {
    setEvent(ev); setUnits([]); setPicked({}); setNotice(''); setView('event');
  }

  function toggleSeat(u) {
    if (u.status !== 'available') return;
    setNotice('');
    setPicked((p) => {
      if (p[u.id]) { const { [u.id]: _drop, ...rest } = p; return rest; }
      if (totalQty >= MAX_TICKETS) { setNotice(`You can buy at most ${MAX_TICKETS} tickets at once.`); return p; }
      return { ...p, [u.id]: 1 };
    });
  }

  function changeZone(u, delta) {
    setNotice('');
    setPicked((p) => {
      const current = p[u.id] || 0;
      const next = current + delta;
      if (next < 0) return p;
      if (delta > 0 && totalQty >= MAX_TICKETS) { setNotice(`You can buy at most ${MAX_TICKETS} tickets at once.`); return p; }
      if (next > u.remaining) return p;
      const { [u.id]: _drop, ...rest } = p;
      return next === 0 ? rest : { ...rest, [u.id]: next };
    });
  }

  async function startCheckout() {
    setNotice('');
    try {
      const h = await api.createHold(event.id, {
        items: Object.entries(picked).map(([unit_id, quantity]) => ({ unit_id, quantity })),
      });
      setHold(h); setNow(Date.now()); setPayError(''); setView('checkout');
    } catch (e) {
      if (e.status === 409) {
        setNotice('Some of your places were just taken by someone else. Please choose again.');
        setPicked({});
        setUnits(await api.getUnits(event.id));
      } else {
        setNotice(e.detail || 'Could not hold the places.');
      }
    }
  }

  async function backToEvent() {
    if (hold) api.releaseHold(hold.id).catch(() => {});
    setHold(null); setPicked({}); setView('event');
    api.getUnits(event.id).then(setUnits);
  }

  async function pay(e) {
    e.preventDefault();
    setPaying(true); setPayError('');
    try {
      const o = await api.createOrder({
        hold_id: hold.id, customer_name: form.name, customer_email: form.email, card_number: form.card,
      });
      setOrder(o); setHold(null); setPicked({}); setView('success');
    } catch (err) {
      if (err.code === 'hold_expired') {
        setPayError('Your hold has expired and the places were released. Please choose them again.');
        setHold((h) => ({ ...h, expires_at: new Date(0).toISOString() }));
      } else {
        setPayError(err.detail || 'Payment failed');
      }
    } finally {
      setPaying(false);
    }
  }

  async function cancelOrder() {
    try { setOrder(await api.cancelOrder(order.order_code)); } catch (err) { setPayError(err.detail); }
  }

  const seatRows = [...new Set(units.filter((u) => u.kind === 'seat').map((u) => u.row))];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setView('catalog')}>
          <div className="bg-indigo-600 p-2 rounded-xl text-white"><Ticket className="w-6 h-6" /></div>
          <div>
            <h1 className="text-xl font-black tracking-wider text-white">EventPass</h1>
            <p className="text-xs text-slate-400">Tickets for every venue</p>
          </div>
        </div>
        <button onClick={() => setView('scanner')}
          className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition">
          <Camera className="w-4 h-4" /><span>Check-in Scanner</span>
        </button>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        {view === 'catalog' && (
          <div>
            <h2 className="text-3xl font-black text-white mb-6">Upcoming events</h2>
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-4 top-4" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title" className={`${inputCls} pl-10`} />
              </div>
              <select value={city} onChange={(e) => setCity(e.target.value)} className={`${inputCls} sm:w-56`}>
                <option value="">All cities</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {loading && <p className="text-slate-400">Loading events…</p>}
            {loadError && <div role="alert" className={alertCls}>{loadError}</div>}
            {!loading && !loadError && events.length === 0 && <p className="text-slate-400">No events found.</p>}
            <div className="grid md:grid-cols-3 gap-6">
              {events.map((ev) => (
                <div key={ev.id} className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden flex flex-col">
                  <img src={ev.image_url} alt="" className="h-40 w-full object-cover" />
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="font-bold text-white text-lg">{ev.title}</h3>
                    <div className="text-sm text-slate-400 mt-2 space-y-1">
                      <div className="flex items-center space-x-2"><Calendar className="w-4 h-4" /><span>{when(ev.starts_at)}</span></div>
                      <div className="flex items-center space-x-2"><MapPin className="w-4 h-4" /><span>{ev.venue_name}, {ev.city}</span></div>
                    </div>
                    <div className="mt-auto pt-4 flex justify-between items-center">
                      <span className="text-indigo-400 font-black">from {money(ev.price_from)}</span>
                      <button onClick={() => openEvent(ev)} disabled={ev.remaining === 0}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-4 py-2 rounded-xl text-sm font-semibold">
                        {ev.remaining === 0 ? 'Sold out' : 'Get tickets'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'event' && event && (
          <div>
            <button onClick={() => setView('catalog')} className="flex items-center space-x-2 text-slate-400 hover:text-white text-sm mb-4">
              <ArrowLeft className="w-4 h-4" /><span>Back to events</span>
            </button>
            <h2 className="text-3xl font-black text-white">{event.title}</h2>
            <p className="text-slate-400 mt-1">{when(event.starts_at)} · {event.venue_name}, {event.city}</p>
            <p className="text-slate-300 mt-3 mb-6">{event.description}</p>

            {event.mode === 'seats' ? (
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
                <div className="bg-slate-700 text-slate-300 text-center text-xs font-bold tracking-widest py-2 rounded-lg mb-6">STAGE</div>
                <div className="space-y-2">
                  {seatRows.map((row) => (
                    <div key={row} className="flex items-center justify-center space-x-2">
                      <span className="w-5 text-slate-500 text-sm font-bold">{row}</span>
                      {units.filter((u) => u.kind === 'seat' && u.row === row).map((u) => {
                        const isPicked = Boolean(picked[u.id]);
                        const cls = isPicked ? 'bg-indigo-600 text-white'
                          : u.status === 'available' ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                          : u.status === 'held' ? 'bg-amber-500/30 text-amber-300 cursor-not-allowed'
                          : 'bg-slate-900 text-slate-600 cursor-not-allowed';
                        return (
                          <button key={u.id} onClick={() => toggleSeat(u)} disabled={u.status !== 'available'}
                            title={`${u.label} · ${money(u.price)} · ${u.status}`}
                            className={`w-11 h-11 rounded-lg text-xs font-bold ${cls}`}>{u.number}</button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-4 justify-center mt-6 text-xs text-slate-400">
                  <span>■ available</span><span className="text-indigo-400">■ yours</span>
                  <span className="text-amber-300">■ held by someone</span><span className="text-slate-600">■ sold</span>
                  <span>VIP rows A–B · Standard rows C–D</span>
                </div>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {units.map((u) => (
                  <div key={u.id} className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-white text-lg">{u.label}</h3>
                        <p className="text-sm text-slate-400">{u.remaining} of {u.capacity} left</p>
                      </div>
                      <span className="text-indigo-400 font-black">{money(u.price)}</span>
                    </div>
                    <div className="flex items-center space-x-4 mt-4">
                      <button onClick={() => changeZone(u, -1)} className="w-10 h-10 rounded-xl bg-slate-700 hover:bg-slate-600 text-xl font-bold">−</button>
                      <span className="w-8 text-center text-xl font-bold">{picked[u.id] || 0}</span>
                      <button onClick={() => changeZone(u, 1)} disabled={u.remaining === 0} className="w-10 h-10 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-xl font-bold">+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {notice && <div role="alert" className={`${alertCls} mt-4`}>{notice}</div>}
            <div className="mt-6 flex justify-between items-center bg-slate-800 border border-slate-700 rounded-2xl p-4">
              <span className="text-slate-300">{totalQty} of {MAX_TICKETS} tickets · <b className="text-white">{money(totalPrice)}</b></span>
              <button onClick={startCheckout} disabled={totalQty === 0}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold px-6 py-3 rounded-xl">
                Proceed to checkout
              </button>
            </div>
          </div>
        )}

        {view === 'checkout' && hold && (
          <div className="max-w-xl mx-auto bg-slate-800 border border-slate-700 rounded-2xl p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">Checkout</h2>
              <div className={`flex items-center space-x-2 px-3 py-1 rounded-xl text-xs font-semibold border ${expired ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
                <Clock className="w-4 h-4" />
                <span>{expired ? 'Hold expired' : `Hold expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</span>
              </div>
            </div>

            <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 text-sm space-y-2 mb-4">
              <div className="flex justify-between text-slate-400"><span>Event</span><span className="text-white font-medium">{event.title}</span></div>
              {hold.items.map((it) => (
                <div key={it.unit_id} className="flex justify-between text-slate-400">
                  <span>{it.label}{it.quantity > 1 ? ` × ${it.quantity}` : ''}</span><span className="text-white">{money(it.price * it.quantity)}</span>
                </div>
              ))}
              <div className="flex justify-between text-slate-400 pt-2 border-t border-slate-800">
                <span>Total</span><span className="text-indigo-400 font-bold">{money(hold.total)}</span>
              </div>
            </div>

            {payError && <div role="alert" className={`${alertCls} mb-4`}>{payError}</div>}

            {expired ? (
              <button onClick={backToEvent} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl">Choose places again</button>
            ) : (
              <form onSubmit={pay} className="space-y-4">
                <div><label className={labelCls}>Full name</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Aisha Zhumabekkyzy" className={inputCls} /></div>
                <div><label className={labelCls}>Email</label>
                  <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="aisha@sdu.edu.kz" className={inputCls} /></div>
                <div><label className={labelCls}>Simulated card number</label>
                  <input required value={form.card} onChange={(e) => { setForm({ ...form, card: e.target.value }); setPayError(''); }} placeholder="4242 4242 4242 4242" className={inputCls} />
                  <p className="text-xs text-slate-500 mt-1">4242 4242 4242 4242 pays · 4000 0000 0000 0002 is declined</p></div>
                <button type="submit" disabled={paying} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl">
                  {paying ? 'Processing…' : `Pay ${money(hold.total)}`}
                </button>
                <button type="button" onClick={backToEvent} className="w-full text-slate-400 hover:text-white text-sm">Release places and go back</button>
              </form>
            )}
          </div>
        )}

        {view === 'success' && order && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-6">
              <CheckCircle2 className={`w-14 h-14 mx-auto ${order.status === 'cancelled' ? 'text-rose-400' : 'text-emerald-400'}`} />
              <h2 className="text-3xl font-black text-white mt-2">{order.status === 'cancelled' ? 'Order cancelled' : 'Booking Confirmed'}</h2>
              <p className="text-slate-400 mt-1">Order {order.order_code} · {money(order.total)} · confirmation sent to {order.customer_email}</p>
            </div>
            {payError && <div role="alert" className={`${alertCls} mb-4`}>{payError}</div>}
            <div className="space-y-4">
              {order.tickets.map((t) => (
                <div key={t.code} className={`bg-slate-800 border border-slate-700 rounded-2xl p-5 flex items-center space-x-5 ${t.status === 'cancelled' ? 'opacity-50' : ''}`}>
                  <div className="bg-white p-2 rounded-xl"><QRCodeCanvas value={t.code} size={110} /></div>
                  <div className="flex-1">
                    <div className="text-white font-bold">{t.event_title}</div>
                    <div className="text-sm text-slate-400">{when(t.starts_at)} · {t.venue_name}</div>
                    <div className="text-sm text-slate-300 mt-1">{t.unit_label} · {t.holder_name}</div>
                    <div className="flex items-center space-x-2 text-xs text-indigo-300 mt-2"><QrCode className="w-4 h-4" /><span>{t.code}</span><span className="text-slate-500">({t.status})</span></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={() => setView('catalog')} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-3 rounded-xl">Back to events</button>
              {order.status === 'paid' && (
                <button onClick={cancelOrder} className="text-rose-400 hover:text-rose-300 text-sm">Cancel this order</button>
              )}
            </div>
          </div>
        )}

        {view === 'scanner' && <Scanner onBack={() => setView('catalog')} />}
      </main>
    </div>
  );
}
