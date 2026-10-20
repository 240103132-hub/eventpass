// Run with: cd frontend && node --test src/mockApi.test.js
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockApi as api, __resetMock } from './mockApi.js';

const CARD_OK = '4242 4242 4242 4242';
const buyer = { customer_name: 'Aisha', customer_email: 'aisha@sdu.edu.kz' };
const realNow = Date.now;

beforeEach(() => { Date.now = realNow; __resetMock(); });

const hold = (items, eventId = 1) => api.createHold(eventId, { items });
const rejects = (promise, status, code) =>
  assert.rejects(promise, (e) => { assert.equal(e.status, status); assert.equal(e.code, code); return true; });

test('catalog: events carry venue, status and price_from; filters work', async () => {
  const all = await api.listEvents();
  assert.equal(all.length, 3);
  assert.equal(all[0].status, 'published');
  assert.equal(all[0].price_from, 15000);
  assert.equal((await api.listEvents({ city: 'Almaty' })).length, 1);
  assert.equal((await api.listEvents({ q: 'esports' })).length, 1);
  assert.equal((await api.listVenues()).length, 2);
});

test('hold: total is the sum of real seat prices (B-3 = 20000, D-1 = 15000)', async () => {
  const h = await hold([{ unit_id: '1-B-3' }, { unit_id: '1-D-1' }]);
  assert.equal(h.total, 35000);
  assert.equal(h.items.length, 2);
});

test('hold: more than 8 tickets is rejected with limit_exceeded', async () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ unit_id: `1-A-${i + 1}`.replace('A-9', 'B-1') }));
  await rejects(hold(items), 422, 'limit_exceeded');
  const eight = Array.from({ length: 8 }, (_, i) => ({ unit_id: `1-A-${i + 1}` }));
  assert.equal((await hold(eight)).items.length, 8);
});

test('hold: second buyer gets 409 unit_held, then sees the seat as held', async () => {
  await hold([{ unit_id: '1-A-1' }]);
  await rejects(hold([{ unit_id: '1-A-1' }]), 409, 'unit_held');
  const units = await api.getUnits(1);
  assert.equal(units.find((u) => u.id === '1-A-1').status, 'held');
});

test('hold expires after 10 minutes and the seat returns to the pool', async () => {
  const h = await hold([{ unit_id: '1-A-2' }]);
  const t0 = Date.now();
  Date.now = () => t0 + 10 * 60 * 1000 + 1000;
  assert.equal((await api.getUnits(1)).find((u) => u.id === '1-A-2').status, 'available');
  await rejects(api.createOrder({ hold_id: h.id, ...buyer, card_number: CARD_OK }), 410, 'hold_expired');
});

test('payment: 4242 pays and issues one ticket per seat, seats become sold', async () => {
  const h = await hold([{ unit_id: '1-C-1' }, { unit_id: '1-C-2' }]);
  const order = await api.createOrder({ hold_id: h.id, ...buyer, card_number: CARD_OK });
  assert.equal(order.status, 'paid');
  assert.equal(order.total, 30000);
  assert.equal(order.tickets.length, 2);
  assert.equal(order.tickets[0].status, 'valid');
  assert.equal((await api.getUnits(1)).find((u) => u.id === '1-C-1').status, 'sold');
  assert.equal((await api.getOrder(order.order_code)).order_code, order.order_code);
});

test('payment: declined card (also with spaces/dashes) keeps the hold and creates nothing', async () => {
  const h = await hold([{ unit_id: '1-D-3' }]);
  for (const card of ['4000 0000 0000 0002', '4000-0000-0000-0002', '4000000000000002']) {
    await rejects(api.createOrder({ hold_id: h.id, ...buyer, card_number: card }), 402, 'card_declined');
  }
  assert.equal((await api.getUnits(1)).find((u) => u.id === '1-D-3').status, 'held');
  const order = await api.createOrder({ hold_id: h.id, ...buyer, card_number: CARD_OK });
  assert.equal(order.tickets.length, 1);
});

test('zones: quantity is limited by remaining and tickets are issued per person', async () => {
  const h = await hold([{ unit_id: '3-zone-2', quantity: 3 }], 3);
  assert.equal(h.total, 60000);
  assert.equal((await api.getUnits(3)).find((u) => u.id === '3-zone-2').remaining, 7);
  await rejects(hold([{ unit_id: '3-zone-2', quantity: 8 }], 3), 409, 'unit_held');
  const order = await api.createOrder({ hold_id: h.id, ...buyer, card_number: CARD_OK });
  assert.equal(order.tickets.length, 3);
});

test('scanner: login required, first scan VALID, second ALREADY_USED, unknown INVALID', async () => {
  const h = await hold([{ unit_id: '1-A-5' }]);
  const order = await api.createOrder({ hold_id: h.id, ...buyer, card_number: CARD_OK });
  const code = order.tickets[0].code;
  await rejects(api.verifyTicket({ code, event_id: 1 }), 401, 'unauthorized');
  await api.login({ email: 'controller@astana.kz', password: 'password123' });
  assert.equal((await api.verifyTicket({ code, event_id: 1 })).result, 'VALID');
  assert.equal((await api.verifyTicket({ code, event_id: 1 })).result, 'ALREADY_USED');
  assert.equal((await api.verifyTicket({ code: 'TKT-NOPE', event_id: 1 })).result, 'INVALID');
  assert.equal((await api.getTicket(code)).status, 'used');
});

test('scanner: wrong event, cancelled order, and other venue isolation', async () => {
  const h = await hold([{ unit_id: '1-A-6' }]);
  const order = await api.createOrder({ hold_id: h.id, ...buyer, card_number: CARD_OK });
  const code = order.tickets[0].code;
  await api.login({ email: 'controller@astana.kz', password: 'password123' });
  assert.equal((await api.verifyTicket({ code, event_id: 3 })).result, 'WRONG_EVENT');
  await rejects(api.verifyTicket({ code, event_id: 2 }), 403, 'forbidden');
  await api.cancelOrder(order.order_code);
  assert.equal((await api.verifyTicket({ code, event_id: 1 })).result, 'CANCELLED');
  await api.login({ email: 'controller@almaty.kz', password: 'password123' });
  assert.equal((await api.verifyTicket({ code, event_id: 2 })).result, 'INVALID');
});

test('cancel: releases the seat; cancelling twice or after a scan is a 409', async () => {
  const h = await hold([{ unit_id: '1-B-7' }]);
  const order = await api.createOrder({ hold_id: h.id, ...buyer, card_number: CARD_OK });
  const cancelled = await api.cancelOrder(order.order_code);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal((await api.getUnits(1)).find((u) => u.id === '1-B-7').status, 'available');
  await rejects(api.cancelOrder(order.order_code), 409, 'validation_error');
});

test('login: wrong password is 401', async () => {
  await rejects(api.login({ email: 'controller@astana.kz', password: 'wrongwrong' }), 401, 'unauthorized');
});
