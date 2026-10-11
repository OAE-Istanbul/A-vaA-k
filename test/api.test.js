import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Auth } from '../src/auth.js';
import { verifyPin } from '../src/pin.js';
import { DEMO_PIN, seedHotels } from '../src/seed.js';
import { createServer } from '../src/server.js';
import { istanbul, setup, testConfig } from './helpers.js';

let server;
let base;
let clock;

before(async () => {
  const ctx = setup({ hotels: [] });
  seedHotels(ctx.store);
  clock = ctx.clock;
  const publicDir = fileURLToPath(new URL('../public', import.meta.url));
  server = createServer({ market: ctx.market, auth: new Auth(ctx.store, { verifyPin }), config: testConfig, publicDir });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

test('alıcıdan otele uçtan uca akış', async () => {
  const buyer = await call('/api/session', { method: 'POST', body: { role: 'buyer', name: 'Ayşe', phone: '0555 123 45 67' } });
  assert.equal(buyer.status, 200);
  assert.equal(buyer.data.phone, '05551234567');

  const listing = await call('/api/listings', {
    method: 'POST',
    token: buyer.data.token,
    body: { group: 'evli_cift', adults: 2, children: 0, nights: 1, arrivalTime: '23:00', amenities: ['jakuzi'], durationMinutes: 30 },
  });
  assert.equal(listing.status, 200, listing.data.error);

  const wrongPin = await call('/api/session', { method: 'POST', body: { role: 'hotel', hotelId: 'yesilvadi', pin: '0000' } });
  assert.equal(wrongPin.status, 401);

  const hotel = await call('/api/session', { method: 'POST', body: { role: 'hotel', hotelId: 'yesilvadi', pin: DEMO_PIN } });
  const feed = await call('/api/hotel/feed', { token: hotel.data.token });
  assert.equal(feed.data.live.length, 1);

  const forbidden = await call('/api/listings', { method: 'POST', token: hotel.data.token, body: {} });
  assert.equal(forbidden.status, 403);

  const offer = await call(`/api/listings/${listing.data.id}/offers`, {
    method: 'POST',
    token: hotel.data.token,
    body: { price: 2000, roomName: 'Jakuzili bungalov' },
  });
  assert.equal(offer.status, 200, offer.data.error);

  // Kayalar butik otelde jakuzi yok, ilanı görmemeli.
  const other = await call('/api/session', { method: 'POST', body: { role: 'hotel', hotelId: 'kayalar', pin: DEMO_PIN } });
  assert.equal((await call('/api/hotel/feed', { token: other.data.token })).data.live.length, 0);

  const mine = await call('/api/listings/mine', { token: buyer.data.token });
  const accept = await call(`/api/listings/${listing.data.id}/accept`, {
    method: 'POST',
    token: buyer.data.token,
    body: { offerId: mine.data[0].offers[0].id },
  });
  assert.equal(accept.data.status, 'accepted');
  assert.equal(accept.data.acceptedOffer.hotel.name, 'Yeşilvadi Bungalov');
});

test('pazar kapalıyken ilan açılamaz', async () => {
  clock.set(istanbul(2026, 10, 12, 12, 0));
  const buyer = await call('/api/session', { method: 'POST', body: { role: 'buyer', name: 'Can', phone: '05559998877' } });
  const res = await call('/api/listings', { method: 'POST', token: buyer.data.token, body: {} });
  assert.equal(res.status, 403);
  assert.equal((await call('/api/market')).data.open, false);
});

test('statik dosyalar sunulur, dizin dışına çıkılamaz', async () => {
  const index = await fetch(`${base}/`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /text\/html/);
  const traversal = await fetch(`${base}/%2e%2e/package.json`);
  assert.equal(traversal.status, 404);
});

test('girişsiz istekler reddedilir', async () => {
  assert.equal((await call('/api/listings/mine')).status, 401);
  assert.equal((await call('/api/hotel/feed', { token: 'yok' })).status, 401);
});
