// Tarayıcıda çalışan arka uç. Sunucudaki pazar kodunun aynısını kullanır;
// fetch('/api/...') ve EventSource çağrılarını yakalar, rakip otelleri bot olarak oynatır.
import { createApi } from '../src/api.js';
import { Auth } from '../src/auth.js';
import { localParts, localToEpoch, parseClock } from '../src/clock.js';
import { defaultConfig } from '../src/config.js';
import { checkEligibility, suitableRooms } from '../src/eligibility.js';
import { MarketError } from '../src/errors.js';
import { Marketplace } from '../src/market.js';
import { SAMPLE_HOTELS } from '../src/sample-hotels.js';

const MINUTE = 60_000;
const START_TIME = '21:05';
const DEMO_PIN = '1234';

// Gecelik başlangıç fiyatları (botların ilk teklifi için kaba tahmin).
const NIGHTLY_TL = { bungalov: 3200, butik_otel: 3600, pansiyon: 2200, dag_evi: 4800, tiny_house: 3000, otel: 2900 };
const BOT_NOTES = ['Geç çıkış hediye', 'Hoş geldin ikramı bizden', 'Şömine yakılmış olacak', 'Erken kahvaltı hazırlarız'];

export const BUYERS = {
  ayse: { name: 'Ayşe', phone: '05550000001' },
  mert: { name: 'Mert', phone: '05550000002' },
};

const config = { ...defaultConfig, dataFile: null };
const store = { data: null, save() {} };
const clockState = { offset: 0 };
const clock = () => Date.now() + clockState.offset;
const market = new Marketplace({ store, clock, config });
const auth = new Auth(store, { verifyPin: (pin, stored) => String(pin) === stored });
const api = createApi({ market, auth, config });

const bots = { enabled: true, floors: new Map(), viewerHotelId: null };

// ---- Senaryo ----

function resetData() {
  store.data = { buyers: {}, hotels: {}, listings: {}, offers: {}, sessions: {} };
  for (const hotel of SAMPLE_HOTELS) store.data.hotels[hotel.id] = { ...hotel, pinHash: DEMO_PIN };
  clockState.offset = localToEpoch(localParts(Date.now()), parseClock(START_TIME)) - Date.now();
  bots.floors.clear();
}

function buyerId(key) {
  return auth.login({ role: 'buyer', ...BUYERS[key] }).id;
}

function seedScenario() {
  resetData();
  // Ayşe: evli çift, jakuzi şart. Yeşilvadi, Orman İçi ve Sakin Tiny House teklif verebilir.
  const ayse = market.createListing(buyerId('ayse'), {
    group: 'evli_cift', adults: 2, children: 0, roomCount: 1, nights: 1, arrivalTime: '22:30',
    hotelTypes: [], amenities: ['jakuzi'], maxBudget: 4000, durationMinutes: 15,
    note: 'Yıl dönümümüz, geç varabiliriz.',
  });
  market.placeOffer('orman-ici', ayse.id, { price: 3600, roomName: 'Tüm ev', note: 'Ev tamamen size ait' });
  market.placeOffer('yesilvadi', ayse.id, { price: 3400, roomName: 'Jakuzili bungalov', note: 'Geç çıkış hediye' });
  market.placeOffer('sakin-tiny', ayse.id, { price: 3250, roomName: 'Tiny house', note: '' });

  // Mert: 4 arkadaş, 2 oda, otopark şart. Kayalar ve Çamlık teklif verebilir.
  market.createListing(buyerId('mert'), {
    group: 'arkadas', adults: 4, children: 0, roomCount: 2, nights: 1, arrivalTime: '23:15',
    hotelTypes: [], amenities: ['otopark'], maxBudget: null, durationMinutes: 30, note: '',
  });
}

// ---- Botlar ----

const roundDown = (n, step) => Math.floor(n / step) * step;

function startPrice(hotel, listing) {
  const base = NIGHTLY_TL[hotel.type] * listing.nights * (listing.roomCount ?? 1) * (0.95 + Math.random() * 0.15);
  return roundDown(listing.maxBudget ? Math.min(base, listing.maxBudget) : base, 50);
}

function shuffle(items) {
  return items
    .map((item) => [Math.random(), item])
    .sort((a, b) => a[0] - b[0])
    .map(([, item]) => item);
}

/** Her açık ilanda, en düşük teklifi olmayan bir bot otel taban fiyatına inene kadar fiyat kırar. */
function botTick() {
  if (!bots.enabled) return;
  for (const listing of Object.values(store.data.listings)) {
    if (market.statusOf(listing) !== 'open') continue;
    const [lowest] = market.activeOffers(listing.id);
    const rivals = Object.values(store.data.hotels).filter(
      (h) => h.id !== bots.viewerHotelId && h.id !== lowest?.hotelId && checkEligibility(h, listing).eligible,
    );
    for (const hotel of shuffle(rivals)) {
      const key = `${hotel.id}:${listing.id}`;
      const opening = startPrice(hotel, listing);
      if (!bots.floors.has(key)) bots.floors.set(key, roundDown(opening * (0.62 + Math.random() * 0.15), 10));
      const price = lowest ? roundDown(lowest.price - 50 - Math.random() * 150, 10) : opening;
      if (price < bots.floors.get(key)) continue;
      const note = Math.random() < 0.35 ? BOT_NOTES[Math.floor(Math.random() * BOT_NOTES.length)] : '';
      try {
        market.placeOffer(hotel.id, listing.id, { price, roomName: suitableRooms(hotel, listing)[0].name, note });
      } catch {
        continue;
      }
      break;
    }
  }
}

function scheduleBots() {
  setTimeout(() => {
    botTick();
    market.settle();
    scheduleBots();
  }, 2500 + Math.random() * 2500);
}

// ---- fetch ve EventSource yakalama ----

const streams = new Set();
market.subscribe(() => poke());

/** Açık sayfaya "veri değişti" sinyali gönderir. */
function poke() {
  setTimeout(() => {
    for (const stream of streams) stream.emit();
  }, 0);
}

class PreviewEventSource {
  #handlers = new Set();

  constructor() {
    streams.add(this);
  }

  addEventListener(type, handler) {
    if (type === 'change') this.#handlers.add(handler);
  }

  emit() {
    for (const handler of this.#handlers) handler({ data: '{}' });
  }

  close() {
    streams.delete(this);
  }
}

const json = (status, payload) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

const realFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!url.startsWith('/api/')) return realFetch(input, init);
  await new Promise((resolve) => setTimeout(resolve, 30));
  try {
    const token = /^Bearer (.+)$/.exec(init.headers?.Authorization ?? '')?.[1] ?? null;
    const body = init.body ? JSON.parse(init.body) : {};
    return json(200, api.handle({ method: init.method ?? 'GET', path: url.split('?')[0], token, body }));
  } catch (err) {
    if (err instanceof MarketError) return json(err.status, { error: err.message });
    console.error(err);
    return json(500, { error: 'Beklenmeyen bir hata oluştu.' });
  }
};
globalThis.EventSource = PreviewEventSource;

// Önceki ziyaretten kalan oturum bu bellekte yok; temiz başla.
try {
  localStorage.removeItem('session');
} catch {
  // Depolama kapalı olabilir; uygulama yine çalışır.
}

seedScenario();
scheduleBots();

// ---- Önizleme paneli için kontroller ----

export const preview = {
  hotels: SAMPLE_HOTELS.map(({ id, name }) => ({ id, name })),
  now: clock,

  sessionFor(view) {
    if (view in BUYERS) {
      bots.viewerHotelId = null;
      return auth.login({ role: 'buyer', ...BUYERS[view] });
    }
    bots.viewerHotelId = view;
    return auth.login({ role: 'hotel', hotelId: view, pin: DEMO_PIN });
  },

  advance(minutes) {
    clockState.offset += minutes * MINUTE;
    market.settle();
    poke();
  },

  setBots(enabled) {
    bots.enabled = enabled;
  },

  reset() {
    seedScenario();
    poke();
  },
};
