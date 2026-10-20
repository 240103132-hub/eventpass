// Real implementation of the same interface as mockApi.js, talking to the FastAPI backend (docs/openapi.yml).
// Errors are thrown as ApiError { status, code, detail }, exactly like the mock does.

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const TOKEN_KEY = 'eventpass_token';

export class ApiError extends Error {
  constructor(status, code, detail) {
    super(detail);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

const token = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (v) => localStorage.setItem(TOKEN_KEY, v),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function request(method, path, { params, body, auth = false } = {}) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') query.set(k, v);
  });
  const url = `${BASE}${path}${query.toString() ? `?${query}` : ''}`;

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && token.get()) headers.Authorization = `Bearer ${token.get()}`;

  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the server. Is the backend running on port 8000?');
  }
  if (res.status === 204) return undefined;

  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }
  if (!res.ok) {
    throw new ApiError(res.status, data?.code || 'error', data?.detail || `Request failed (${res.status})`);
  }
  return data;
}

export const httpApi = {
  // Catalog
  listVenues: () => request('GET', '/venues'),
  listEvents: (params = {}) => request('GET', '/events', { params }),
  getEvent: (id) => request('GET', `/events/${id}`),
  getUnits: (eventId) => request('GET', `/events/${eventId}/units`),

  // Checkout
  createHold: (eventId, { items }) => request('POST', `/events/${eventId}/holds`, { body: { items } }),
  releaseHold: (holdId) => request('DELETE', `/holds/${holdId}`),
  createOrder: (body) => request('POST', '/orders', { body }),
  getOrder: (orderCode) => request('GET', `/orders/${orderCode}`),
  cancelOrder: (orderCode) => request('POST', `/orders/${orderCode}/cancel`),
  getTicket: (code) => request('GET', `/tickets/${code}`),

  // Auth (the token is kept in localStorage; logout is client-side because the contract has no logout endpoint)
  async login({ email, password }) {
    const data = await request('POST', '/auth/login', { body: { email, password } });
    token.set(data.access_token);
    return data;
  },
  me: () => request('GET', '/auth/me', { auth: true }),
  async logout() { token.clear(); },

  // Scanner
  async verifyTicket({ code, event_id }) {
    try {
      return await request('POST', '/tickets/verify', { body: { code, event_id }, auth: true });
    } catch (e) {
      if (e.status === 401) token.clear();
      throw e;
    }
  },
};
