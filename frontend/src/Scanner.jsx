import React, { useState, useEffect, useRef } from 'react';
import { api } from './api';
import { ArrowLeft, Camera } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';

const RESULT_STYLE = {
  VALID: 'bg-emerald-600',
  ALREADY_USED: 'bg-amber-600',
  WRONG_EVENT: 'bg-amber-600',
  CANCELLED: 'bg-rose-700',
  INVALID: 'bg-rose-600',
};

export default function Scanner({ onBack }) {
  const [staff, setStaff] = useState(null);
  const [ready, setReady] = useState(false);
  const [login, setLogin] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [camera, setCamera] = useState(false);
  const lastScan = useRef({ code: '', at: 0 });
  const verifyRef = useRef();

  useEffect(() => {
    api.me().then(setStaff).catch(() => setStaff(null)).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!staff) return;
    api.listEvents({ venue_id: staff.venue_id }).then((list) => {
      setEvents(list);
      if (list.length) setEventId(String(list[0].id));
    });
  }, [staff]);

  verifyRef.current = async (value) => {
    if (!value.trim() || !eventId) return;
    try {
      setResult(await api.verifyTicket({ code: value.trim(), event_id: Number(eventId) }));
    } catch (e) {
      if (e.status === 401) setStaff(null);
      setResult({ result: 'INVALID', message: e.detail || 'Check failed' });
    }
  };

  useEffect(() => {
    if (!camera || !staff) return undefined;
    const scanner = new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: 250 }, false);
    scanner.render(
      (text) => {
        const last = lastScan.current;
        if (last.code === text && Date.now() - last.at < 3000) return;
        lastScan.current = { code: text, at: Date.now() };
        verifyRef.current(text);
      },
      () => {}
    );
    return () => { scanner.clear().catch(() => {}); };
  }, [camera, staff]);

  async function doLogin(e) {
    e.preventDefault();
    setLoginError('');
    try {
      await api.login(login);
      setStaff(await api.me());
    } catch (err) {
      setLoginError(err.detail || 'Login failed');
    }
  }

  async function doLogout() {
    await api.logout();
    setStaff(null);
    setResult(null);
    setCamera(false);
  }

  const back = (
    <button onClick={onBack} className="flex items-center space-x-2 text-slate-400 hover:text-white text-sm mb-4">
      <ArrowLeft className="w-4 h-4" /><span>Back to catalog</span>
    </button>
  );

  if (!ready) return <div className="text-slate-400">Loading…</div>;

  if (!staff) {
    return (
      <div className="max-w-md mx-auto">
        {back}
        <form onSubmit={doLogin} className="bg-slate-800 border border-slate-700 rounded-2xl p-8 space-y-4">
          <h2 className="text-2xl font-bold text-white">Staff login</h2>
          {loginError && <div role="alert" className="bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm font-semibold rounded-xl px-4 py-3">{loginError}</div>}
          <input type="email" required placeholder="controller@astana.kz" value={login.email}
            onChange={(e) => setLogin({ ...login, email: e.target.value })}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500" />
          <input type="password" required placeholder="Password" value={login.password}
            onChange={(e) => setLogin({ ...login, password: e.target.value })}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500" />
          <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition">Log in</button>
          <p className="text-xs text-slate-500">Demo: controller@astana.kz or controller@almaty.kz, password password123</p>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      {back}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">Check-in scanner</h2>
          <button onClick={doLogout} className="text-xs text-slate-400 hover:text-white">Log out ({staff.email})</button>
        </div>

        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Event being checked in</label>
        <select value={eventId} onChange={(e) => { setEventId(e.target.value); setResult(null); }}
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white">
          {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
        </select>

        <button onClick={() => setCamera((c) => !c)}
          className="flex items-center space-x-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">
          <Camera className="w-4 h-4" /><span>{camera ? 'Hide camera' : 'Scan with camera'}</span>
        </button>
        {camera && <div id="qr-reader" className="bg-white rounded-xl overflow-hidden" />}

        <form onSubmit={(e) => { e.preventDefault(); verifyRef.current(code); setCode(''); }} className="flex space-x-2">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Type ticket code, e.g. TKT-AB12CD34"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500" />
          <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 rounded-xl">Check</button>
        </form>

        {result && (
          <div role="status" className={`${RESULT_STYLE[result.result]} rounded-2xl p-8 text-center text-white`}>
            <div className="text-4xl font-black tracking-wide">{result.result.replace('_', ' ')}</div>
            <div className="mt-2 text-lg">{result.message}</div>
            {result.ticket && (
              <div className="mt-4 text-sm opacity-90">
                {result.ticket.holder_name} · {result.ticket.unit_label} · {result.ticket.event_title}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
