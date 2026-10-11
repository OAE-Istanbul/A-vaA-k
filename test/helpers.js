import { defaultConfig } from '../src/config.js';
import { Marketplace } from '../src/market.js';
import { Store } from '../src/store.js';

export const MINUTE = 60_000;

/** İstanbul saati (UTC+3, 2016'dan beri yaz saati yok) -> epoch ms. */
export const istanbul = (y, m, d, h, min = 0) => Date.UTC(y, m - 1, d, h - 3, min);

export const testConfig = { ...defaultConfig, dataFile: null, demoTime: null };

export function fakeClock(start) {
  let now = start;
  const clock = () => now;
  clock.set = (ms) => {
    now = ms;
  };
  clock.advance = (minutes) => {
    now += minutes * MINUTE;
  };
  return clock;
}

export const hotel = (overrides = {}) => ({
  id: 'h1',
  name: 'Test Otel',
  type: 'bungalov',
  region: 'sile',
  description: '',
  amenities: ['kahvalti', 'jakuzi', 'somine'],
  acceptedGroups: ['evli_cift', 'aile'],
  rooms: [{ name: 'Çift oda', capacity: 2, count: 3 }, { name: 'Aile odası', capacity: 4, count: 1 }],
  phone: '0555 000 00 01',
  address: 'Ağva',
  pinHash: 'x:y',
  ...overrides,
});

export const listingInput = (overrides = {}) => ({
  group: 'evli_cift',
  adults: 2,
  children: 0,
  roomCount: 1,
  nights: 1,
  arrivalTime: '22:30',
  regions: [],
  hotelTypes: [],
  amenities: [],
  maxBudget: null,
  durationMinutes: 30,
  note: '',
  ...overrides,
});

export function setup({ start = istanbul(2026, 10, 11, 21, 10), hotels, config = {} } = {}) {
  const store = new Store();
  const clock = fakeClock(start);
  const hotelList = hotels ?? [
    hotel({ id: 'a', name: 'A Bungalov' }),
    hotel({ id: 'b', name: 'B Butik', type: 'butik_otel' }),
    hotel({ id: 'c', name: 'C Pansiyon', type: 'pansiyon', amenities: ['kahvalti'], acceptedGroups: ['cift', 'arkadas'] }),
  ];
  for (const h of hotelList) store.data.hotels[h.id] = h;
  store.data.buyers.u1 = { id: 'u1', name: 'Ayşe', phone: '05550000000' };
  store.data.buyers.u2 = { id: 'u2', name: 'Mehmet', phone: '05551111111' };
  const market = new Marketplace({ store, clock, config: { ...testConfig, ...config } });
  return { store, clock, market };
}
