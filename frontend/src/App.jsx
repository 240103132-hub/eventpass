import React, { useState, useEffect } from 'react';
import { api } from './api';
import { Calendar, MapPin, Ticket, QrCode, ShieldCheck, Clock, CheckCircle2, ArrowLeft, Camera } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

export default function App() {
  const [view, setView] = useState('catalog'); // 'catalog', 'seats', 'checkout', 'success', 'scanner'
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [seats, setSeats] = useState([]);
  const [selectedSeatIds, setSelectedSeatIds] = useState([]);
  const [holdTimer, setHoldTimer] = useState(null);
  const [lastOrder, setLastOrder] = useState(null);
  const [lastTickets, setLastTickets] = useState([]);
  const [scannerResult, setScannerResult] = useState(null);
  
  // Checkout form
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [cardNumber, setCardNumber] = useState('');

  useEffect(() => {
    api.getEvents().then(setEvents).catch(err => console.error(err));
  }, []);

  // Timer countdown for holds
  useEffect(() => {
    let interval = null;
    if (holdTimer && holdTimer > 0) {
      interval = setInterval(() => {
        setHoldTimer(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else if (holdTimer === 0) {
      alert('Your seat hold has expired!');
      setView('catalog');
    }
    return () => clearInterval(interval);
  }, [holdTimer]);

  const handleSelectEvent = async (event) => {
    setSelectedEvent(event);
    const eventSeats = await api.getSeats(event.id);
    setSeats(eventSeats);
    setSelectedSeatIds([]);
    setView('seats');
  };

  const handleSeatClick = (seat) => {
    if (seat.status !== 'available') return;
    if (selectedSeatIds.includes(seat.id)) {
      setSelectedSeatIds(selectedSeatIds.filter(id => id !== seat.id));
    } else {
      if (selectedSeatIds.length >= 8) {
        alert('You can select a maximum of 8 seats per order.');
        return;
      }
      setSelectedSeatIds([...selectedSeatIds, seat.id]);
    }
  };

  const proceedToCheckout = () => {
    if (selectedSeatIds.length === 0) {
      alert('Please select at least one seat.');
      return;
    }
    setHoldTimer(600); // 10 minutes hold
    setView('checkout');
  };

  const handleCompletePayment = async (e) => {
    e.preventDefault();
    if (!customerName || !customerEmail || !cardNumber) {
      alert('Please fill in all checkout fields.');
      return;
    }

    try {
      const orderData = {
        event_id: selectedEvent.id,
        seat_ids: selectedSeatIds,
        total_amount: selectedSeatIds.length * selectedEvent.price,
        customer_name: customerName,
        customer_email: customerEmail,
      };

      const result = await api.createOrder(orderData);
      setLastOrder(result.order);
      setLastTickets(result.tickets);
      setView('success');
    } catch (err) {
      alert('Payment failed: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setView('catalog')}>
          <div className="bg-indigo-600 p-2 rounded-xl text-white font-bold text-xl">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-wider text-white">EventPass</h1>
            <p className="text-xs text-slate-400">B2B Ticketing & Venue Management (FastAPI + SQLite)</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setView('scanner')}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition shadow-lg shadow-indigo-500/20"
          >
            <Camera className="w-4 h-4" />
            <span>Check-in Scanner</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        
        {/* VIEW 1: CATALOG */}
        {view === 'catalog' && (
          <div>
            <div className="mb-8">
              <h2 className="text-3xl font-extrabold text-white mb-2">Upcoming Events & Concerts</h2>
              <p className="text-slate-400">Select an event to explore available seats and book tickets instantly.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {events.map(ev => (
                <div key={ev.id} className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-xl hover:border-indigo-500 transition flex flex-col">
                  <img src={ev.image} alt={ev.title} className="h-48 w-full object-cover" />
                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white mb-2">{ev.title}</h3>
                      <div className="flex items-center text-slate-400 text-sm mb-1 space-x-2">
                        <MapPin className="w-4 h-4 text-indigo-400" />
                        <span>{ev.venue}</span>
                      </div>
                      <div className="flex items-center text-slate-400 text-sm mb-4 space-x-2">
                        <Calendar className="w-4 h-4 text-indigo-400" />
                        <span>{ev.date}</span>
                      </div>
                      <p className="text-slate-300 text-xs line-clamp-2 mb-4">{ev.description}</p>
                    </div>
                    <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                      <div>
                        <span className="text-xs text-slate-400 block">Price from</span>
                        <span className="text-lg font-black text-indigo-400">{ev.price.toLocaleString()} KZT</span>
                      </div>
                      <button 
                        onClick={() => handleSelectEvent(ev)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
                      >
                        Get Tickets
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 2: SEAT SELECTION */}
        {view === 'seats' && selectedEvent && (
          <div>
            <button 
              onClick={() => setView('catalog')}
              className="flex items-center space-x-2 text-slate-400 hover:text-white mb-6 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Events</span>
            </button>

            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-xl mb-8">
              <h2 className="text-2xl font-bold text-white mb-1">{selectedEvent.title}</h2>
              <p className="text-slate-400 text-sm mb-6">{selectedEvent.venue} • {selectedEvent.date}</p>

              <div className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 text-center text-xs font-bold text-slate-400 tracking-widest uppercase mb-8 shadow-inner">
                Stage / Screen
              </div>

              {/* Seats Grid */}
              <div className="grid grid-cols-4 gap-4 max-w-md mx-auto mb-8">
                {seats.map(seat => {
                  const isSelected = selectedSeatIds.includes(seat.id);
                  let bgClass = 'bg-slate-700 text-slate-300 hover:bg-indigo-600';
                  if (seat.status === 'sold' || seat.status === 'held') {
                    bgClass = 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-50 border border-slate-800';
                  } else if (isSelected) {
                    bgClass = 'bg-indigo-600 text-white font-bold ring-2 ring-indigo-400 shadow-lg shadow-indigo-500/30';
                  }

                  return (
                    <button
                      key={seat.id}
                      disabled={seat.status !== 'available'}
                      onClick={() => handleSeatClick(seat)}
                      className={`py-3 rounded-xl text-sm font-semibold transition flex flex-col items-center justify-center ${bgClass}`}
                    >
                      <span>{seat.id}</span>
                      <span className="text-[10px] opacity-75">{seat.price} ₸</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-between items-center pt-6 border-t border-slate-700">
                <div>
                  <span className="text-sm text-slate-400">Selected seats: </span>
                  <span className="font-bold text-white">{selectedSeatIds.length}</span>
                </div>
                <button
                  disabled={selectedSeatIds.length === 0}
                  onClick={proceedToCheckout}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold transition shadow-lg shadow-emerald-500/20"
                >
                  Proceed to Checkout ({selectedSeatIds.length * selectedEvent.price} ₸)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: CHECKOUT */}
        {view === 'checkout' && selectedEvent && (
          <div className="max-w-xl mx-auto bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">Checkout</h2>
              <div className="flex items-center space-x-2 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-xl text-amber-400 text-xs font-semibold">
                <Clock className="w-4 h-4" />
                <span>Hold expires in {Math.floor(holdTimer / 60)}:{String(holdTimer % 60).padStart(2, '0')}</span>
              </div>
            </div>

            <form onSubmit={handleCompletePayment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Full Name</label>
                <input 
                  type="text" 
                  value={customerName} 
                  onChange={e => setCustomerName(e.target.value)} 
                  placeholder="Aisha Zhumabekkyzy"
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Email Address</label>
                <input 
                  type="email" 
                  value={customerEmail} 
                  onChange={e => setCustomerEmail(e.target.value)} 
                  placeholder="aisha@sdu.edu.kz"
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Simulated Card Number</label>
                <input 
                  type="text" 
                  value={cardNumber} 
                  onChange={e => setCardNumber(e.target.value)} 
                  placeholder="4000 1234 5678 9010"
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 text-sm space-y-2 my-4">
                <div className="flex justify-between text-slate-400">
                  <span>Event:</span>
                  <span className="text-white font-medium">{selectedEvent.title}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Seats:</span>
                  <span className="text-white font-medium">{selectedSeatIds.join(', ')}</span>
                </div>
                <div className="flex justify-between text-slate-400 pt-2 border-t border-slate-800">
                  <span>Total Amount:</span>
                  <span className="text-indigo-400 font-bold">{selectedSeatIds.length * selectedEvent.price} ₸</span>
                </div>
              </div>

              <button 
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-indigo-500/20"
              >
                Complete Payment & Get Tickets
              </button>
            </form>
          </div>
        )}

        {/* VIEW 4: SUCCESS / TICKETS */}
        {view === 'success' && lastOrder && (
          <div className="max-w-2xl mx-auto bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-xl text-center">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-1">Booking Confirmed! (SQLite Backend)</h2>
            <p className="text-slate-400 text-sm mb-6">Order code: <span className="font-mono font-bold text-white">{lastOrder.order_code}</span></p>

            <div className="space-y-6 mb-8">
              {lastTickets.map(ticket => (
                <div key={ticket.id} className="bg-slate-900 border border-slate-700 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="text-left space-y-1">
                    <div className="inline-block bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider mb-2">
                      Seat: {ticket.seat_id.split('-').slice(1).join('-')}
                    </div>
                    <h4 className="text-white font-bold">{selectedEvent.title}</h4>
                    <p className="text-xs text-slate-400">Venue: {selectedEvent.venue}</p>
                    <p className="text-xs text-slate-400">Holder: {lastOrder.customer_name}</p>
                    <p className="text-[10px] font-mono text-slate-500">Hash: {ticket.qr_code_hash}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl shadow">
                    <QRCodeCanvas value={ticket.qr_code_hash} size={110} />
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={() => setView('catalog')}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-8 py-3 rounded-xl transition"
            >
              Back to Catalog
            </button>
          </div>
        )}

        {/* VIEW 5: SCANNER */}
        {view === 'scanner' && (
          <div className="max-w-xl mx-auto bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-xl text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Check-in Scanner</h2>
            <p className="text-slate-400 text-sm mb-6">Validate tickets against the SQLite database.</p>

            <div className="space-y-4">
              <input 
                type="text" 
                id="manual-hash" 
                placeholder="Enter ticket hash (e.g. TKT-...)"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
              />
              <button 
                onClick={async () => {
                  const hash = document.getElementById('manual-hash').value;
                  try {
                    const res = await api.verifyTicket(hash);
                    setScannerResult({ success: true, message: res.message });
                  } catch (err) {
                    setScannerResult({ success: false, message: err.message });
                  }
                }}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition"
              >
                Verify Ticket on Backend
              </button>

              {scannerResult && (
                <div className={`p-4 rounded-xl border text-sm font-semibold ${scannerResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
                  {scannerResult.message}
                </div>
              )}

              <button 
                onClick={() => setView('catalog')}
                className="mt-4 text-slate-400 hover:text-white text-sm"
              >
                Return to Catalog
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
