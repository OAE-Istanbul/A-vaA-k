import { icon, logo } from './icons.js';
import { renderSky, updateSky } from './scenery.js';

const TIME_ZONE = 'Europe/Istanbul';
const LIVE = new Set(['open', 'awaiting_choice']);
// Profil seçilince yetişkin, çocuk ve oda sayısını makul varsayılana çeker.
const GROUP_DEFAULTS = { evli_cift: [2, 0, 1], cift: [2, 0, 1], tek: [1, 0, 1], aile: [2, 1, 1], arkadas: [4, 0, 2] };
// Bu süreden yeni teklifler "az önce" diye işaretlenir.
const FRESH_MS = 60_000;

const $ = (selector, root = document) => root.querySelector(selector);

const storage = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key) ?? 'null');
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Gizli pencere vb.; oturum yalnızca bu sekmede kalır.
    }
  },
};

const state = {
  meta: null,
  market: null,
  skew: 0,
  session: storage.get('session'),
  data: null,
  hotels: [],
  events: null,
  // Sayfa içi onay bekleyen işlem: "accept:<teklif>" ya da "cancel:<ilan>".
  pending: null,
  skyKey: null,
  // Yeni gelen teklifleri ve kırılan fiyatları fark etmek için önceki durum.
  seen: new Map(),
  lowest: new Map(),
  arrivals: new Set(),
  drops: new Map(),
};

// ---- Biçimlendirme ----

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
const money = (n) => new Intl.NumberFormat('tr-TR').format(n);
const tl = (n) => `${money(n)} TL`;
const dateTR = (iso) => iso.split('-').reverse().join('.');
// Türkçede saat noktayla yazılır: 21.30
const timeTR = (ms) =>
  new Intl.DateTimeFormat('tr-TR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(ms).replace(':', '.');
const clockTR = (hhmm) => hhmm.replace(':', '.');
const now = () => Date.now() + state.skew;

function countdown(ms) {
  if (ms <= 0) return '00.00';
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours > 0 ? `${hours} sa ${pad(minutes)} dk` : `${pad(minutes)}:${pad(total % 60)}`;
}

const label = (kind, key) => state.meta.catalog[kind][key] ?? key;

function people({ adults, children, roomCount = 1 }) {
  const guests = children > 0 ? `${adults} yetişkin, ${children} çocuk` : `${adults} yetişkin`;
  return roomCount > 1 ? `${guests}, ${roomCount} oda` : guests;
}

// ["amenities", "value"] -> "“En çok olanak” ve “Fiyat/performans” kategorilerinde"
function bestPhrase(categories) {
  const names = categories.map((c) => `“${label('bestCategories', c)}”`).join(' ve ');
  return `${names} ${categories.length > 1 ? 'kategorilerinde' : 'kategorisinde'}`;
}

// ---- API ----

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.session) headers.Authorization = `Bearer ${state.session.token}`;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.session && path !== '/api/session') {
    setSession(null);
    render();
  }
  if (!res.ok) throw new Error(data.error ?? 'İstek başarısız oldu.');
  return data;
}

function setSession(session) {
  state.session = session;
  state.data = null;
  state.seen.clear();
  state.lowest.clear();
  storage.set('session', session);
  connectEvents();
}

function connectEvents() {
  state.events?.close();
  state.events = null;
  if (!state.session) return;
  state.events = new EventSource(`/api/events?token=${encodeURIComponent(state.session.token)}`);
  state.events.addEventListener('change', () => scheduleRefresh());
}

let refreshTimer = null;
function scheduleRefresh(delay = 150) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, delay);
}

async function refresh() {
  try {
    const market = await api('/api/market');
    state.market = market;
    state.skew = market.now - Date.now();
    if (state.session) {
      state.data = await api(state.session.role === 'buyer' ? '/api/listings/mine' : '/api/hotel/feed');
      noticeChanges();
    } else if (state.hotels.length === 0) {
      state.hotels = await api('/api/hotels');
    }
    render();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/** Yeni gelen teklifleri (alıcı) ve kırılan fiyatları (otel) bulur, ekran okuyucuya duyurur. */
function noticeChanges() {
  const isBuyer = state.session.role === 'buyer';
  const listings = isBuyer ? state.data : state.data.live;
  const messages = [];
  for (const l of listings) {
    const ids = isBuyer ? l.offers.map((o) => o.id) : [l.id];
    const key = isBuyer ? l.id : 'feed';
    const seen = state.seen.get(key);
    if (seen) {
      for (const offer of isBuyer ? l.offers : []) {
        if (!seen.has(offer.id)) {
          state.arrivals.add(offer.id);
          messages.push(`Yeni teklif: ${offer.hotel.name}, ${tl(offer.price)}`);
        }
      }
      if (!isBuyer && !seen.has(l.id)) state.arrivals.add(l.id);
    }
    state.seen.set(key, isBuyer ? new Set(ids) : new Set([...(seen ?? []), l.id]));

    const low = isBuyer ? (l.offers[0]?.price ?? null) : l.lowestPrice;
    const previous = state.lowest.get(l.id);
    if (previous != null && low != null && low < previous) {
      state.drops.set(l.id, previous);
      if (!isBuyer && !l.iAmLowest) messages.push(`Fiyat kırıldı: en düşük teklif artık ${tl(low)}`);
    }
    state.lowest.set(l.id, low);
  }
  if (messages.length > 0) $('#duyuru').textContent = messages.join('. ');
}

// ---- Bildirim ----

let toastTimer = null;
function toast(message, kind = 'info') {
  const el = $('#toast');
  el.innerHTML = `${icon(kind === 'error' ? 'dalga' : 'fener')}<span>${esc(message)}</span>`;
  el.className = `toast ${kind}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 4500);
}

// ---- Yeniden çizimde form içeriğini koru ----

function captureForms() {
  const forms = {};
  for (const form of document.querySelectorAll('form[data-key]')) {
    forms[form.dataset.key] = [...form.elements]
      .filter((el) => el.name)
      .map((el) => ({ name: el.name, value: el.value, checked: el.checked }));
  }
  const active = document.activeElement;
  const focus = active?.form?.dataset.key && active.name
    ? { form: active.form.dataset.key, name: active.name, value: active.value, start: active.selectionStart, end: active.selectionEnd }
    : null;
  return { forms, focus };
}

function restoreForms({ forms, focus }) {
  const find = (key, name, value) => {
    const form = document.querySelector(`form[data-key="${CSS.escape(key)}"]`);
    if (!form) return [];
    return [...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)].filter(
      (el) => value === undefined || !['checkbox', 'radio'].includes(el.type) || el.value === value,
    );
  };
  for (const [key, fields] of Object.entries(forms)) {
    for (const field of fields) {
      for (const el of find(key, field.name, field.value)) {
        if (el.type === 'checkbox' || el.type === 'radio') el.checked = field.checked;
        else el.value = field.value;
      }
    }
  }
  syncSteppers(document);
  if (focus) {
    const [el] = find(focus.form, focus.name, focus.value);
    if (el) {
      el.focus();
      try {
        el.setSelectionRange(focus.start, focus.end);
      } catch {
        // number/select alanları seçim aralığını desteklemez.
      }
    }
  }
}

// ---- Çizim ----

function render() {
  if (!state.meta || !state.market) return;
  const snapshot = captureForms();
  $('#session-box').innerHTML = state.session
    ? `<span class="oturum-ad">${esc(state.session.name)}</span><button class="bag" data-action="logout">Çıkış</button>`
    : '';
  renderSkyBand();
  $('#view').innerHTML = !state.session
    ? landingView()
    : !state.data
      ? '<p class="yukleniyor">Yükleniyor…</p>'
      : state.session.role === 'buyer'
        ? buyerView(state.data)
        : hotelView(state.data);
  restoreForms(snapshot);
  animateDrops();
  state.arrivals.clear();
  state.drops.clear();
  tick();
}

function renderSkyBand() {
  const m = state.market;
  const { marketOpens, marketCloses } = state.meta.rules;
  const nightLabel = m.open ? `${dateTR(m.nightDate)} gecesi` : 'Gündüz kapalı';
  // Sahne yalnızca açık/kapalı değişince yeniden çizilir; ateş böcekleri her yenilemede baştan başlamasın.
  const key = `${m.open}-${m.opensAt}`;
  if (state.skyKey === key) return;
  state.skyKey = key;
  $('#gokyuzu').innerHTML = renderSky(m, {
    opens: clockTR(marketOpens),
    closes: clockTR(marketCloses),
    nightLabel,
    untilLabel: m.open
      ? `${clockTR(marketCloses)}'ye kadar teklif · kapanışa <strong data-until="${m.closesAt}"></strong>`
      : `Açılışa <strong data-until="${m.opensAt}"></strong>`,
  });
}

function tick() {
  const t = now();
  let expired = false;
  for (const el of document.querySelectorAll('[data-until]')) {
    const left = Number(el.dataset.until) - t;
    el.textContent = countdown(left);
    if (left <= 0 && !el.dataset.done) {
      el.dataset.done = '1';
      expired = true;
    }
  }
  // Dereyi geçen sandal: ilan açılışından teklif bitişine.
  for (const el of document.querySelectorAll('[data-crossing-from]')) {
    const from = Number(el.dataset.crossingFrom);
    const to = Number(el.dataset.crossingTo);
    el.style.setProperty('--p', Math.min(1, Math.max(0, (t - from) / (to - from))).toFixed(4));
  }
  updateSky(document, t);
  if (expired) scheduleRefresh(1000);
}

/** Fiyat kırılınca rakam eski değerden yenisine akarak iner. */
function animateDrops() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const [listingId, from] of state.drops) {
    const el = document.querySelector(`[data-lowest-for="${CSS.escape(listingId)}"]`);
    if (!el) continue;
    const to = Number(el.dataset.value);
    const start = performance.now();
    const step = (ts) => {
      const k = Math.min(1, (ts - start) / 900);
      const eased = 1 - (1 - k) ** 3;
      el.textContent = tl(Math.round(from + (to - from) * eased));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

// ---- Ortak parçalar ----

const chip = (name, value, text, { type = 'checkbox', checked = false, iconName = value, cls = '' } = {}) => `
  <label class="secim ${cls}">
    <input type="${type}" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}>
    <span>${icon(iconName)}<b>${esc(text)}</b></span>
  </label>`;

function stepper(name, text, value, min, max) {
  return `
    <div class="sayac">
      <span class="sayac-ad">${text}</span>
      <div class="sayac-kontrol">
        <button type="button" data-adim="-1" aria-label="${text} azalt">−</button>
        <output>${value}</output>
        <button type="button" data-adim="1" aria-label="${text} artır">+</button>
      </div>
      <input type="hidden" name="${name}" value="${value}" data-min="${min}" data-max="${max}">
    </div>`;
}

function syncSteppers(root) {
  for (const box of root.querySelectorAll('.sayac')) {
    const input = box.querySelector('input');
    box.querySelector('output').textContent = input.value;
    const value = Number(input.value);
    box.querySelector('[data-adim="-1"]').disabled = value <= Number(input.dataset.min);
    box.querySelector('[data-adim="1"]').disabled = value >= Number(input.dataset.max);
  }
}

function requestList(listing, { compact = false } = {}) {
  const types = listing.hotelTypes.length
    ? listing.hotelTypes.map((t) => `<li>${icon(t)}${esc(label('hotelTypes', t))}</li>`)
    : [`<li class="soluk">Her tür konaklama</li>`];
  const amenities = listing.amenities.map((a) => `<li class="istenen">${icon(a)}${esc(label('amenities', a))}</li>`);
  return `<ul class="istekler ${compact ? 'kucuk' : ''}">${[...types, ...amenities].join('')}</ul>`;
}

function crossing(from, to, caption) {
  return `
    <div class="gecis" data-crossing-from="${from}" data-crossing-to="${to}">
      <div class="gecis-dere" aria-hidden="true">
        <svg viewBox="0 0 300 20" preserveAspectRatio="none"><path d="M0 10 Q12.5 3 25 10 T50 10 T75 10 T100 10 T125 10 T150 10 T175 10 T200 10 T225 10 T250 10 T275 10 T300 10"/></svg>
        <span class="sandal">${icon('sandal')}</span>
      </div>
      <p class="gecis-yazi">${caption}</p>
    </div>`;
}

function statusPill(status) {
  const map = {
    open: ['Teklif alıyor', 'canli'],
    awaiting_choice: ['Seçiminizi bekliyor', 'bekliyor'],
    accepted: ['Anlaşıldı', 'tamam'],
    cancelled: ['İptal edildi', 'soluk'],
    expired: ['Sona erdi', 'soluk'],
  };
  const [text, cls] = map[status] ?? [status, ''];
  return `<span class="durum ${cls}">${text}</span>`;
}

function confirmBlock(question, confirmAction, data, confirmText) {
  const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `
    <div class="onay">
      <p>${question}</p>
      <div class="onay-dugmeler">
        <button class="dugme ana" data-action="${confirmAction}" ${attrs}>${confirmText}</button>
        <button class="dugme" data-action="dismiss">Vazgeç</button>
      </div>
    </div>`;
}

// ---- Giriş ----

function landingView() {
  const rules = state.meta.rules;
  const hotelOptions = state.hotels
    .map((h) => `<option value="${esc(h.id)}">${esc(h.name)}</option>`)
    .join('');
  return `
    <section class="giris">
      <div class="giris-baslik">
        <p class="ust-baslik">Şile · Ağva</p>
        <h1>Bu gece Ağva'da kalın, fiyatı oteller kırsın.</h1>
        <p class="giris-ozet">Göksu ile Yeşilçay'ın denize kavuştuğu yerde bu gece boş kalacak odalar var.
        Ne istediğinizi yazın; size uyan oteller birbirinin fiyatını kırarak teklif versin.</p>
      </div>
      <ol class="dere-adimlar">
          <li><b>İlanınızı bırakın.</b> Kaç kişisiniz, ne zaman varırsınız, neler olmazsa olmaz?</li>
          <li><b>Oteller fiyat kırsın.</b> İlanınızı yalnızca size uyan oteller görür. Her yeni teklif en az ${tl(rules.minDecrementTL)} daha ucuz olmak zorunda.</li>
          <li><b>En iyisini seçin.</b> En iyi fiyat, en çok olanak ve fiyat/performans öne çıkar. ${rules.acceptGraceMinutes} dakikada seçmezseniz en iyi fiyat sizin.</li>
      </ol>
      <div class="giris-kapilar">
        <form class="tas tas-1 kapi" data-key="buyer-login">
          <h2>${icon('sandal')}Kalacak yer arıyorum</h2>
          <label class="alan">Adınız <input name="name" required maxlength="60" autocomplete="given-name"></label>
          <label class="alan">Cep telefonunuz <input name="phone" required inputmode="tel" placeholder="05XX XXX XX XX" autocomplete="tel"></label>
          <button class="dugme ana">Devam edin</button>
        </form>
        <form class="tas tas-2 kapi otel-kapisi" data-key="hotel-login">
          <h2>${icon('pansiyon')}Otelim var</h2>
          <label class="alan">Otel <select name="hotelId" required>${hotelOptions}</select></label>
          <label class="alan">PIN <input name="pin" type="password" inputmode="numeric" required autocomplete="current-password"></label>
          <button class="dugme">Otel paneline girin</button>
        </form>
      </div>
    </section>`;
}

// ---- Alıcı ----

function buyerView(listings) {
  // Açık ilan ya da bu gece kabul edilmiş anlaşma en üstte durur.
  const featured =
    listings.find((l) => LIVE.has(l.status)) ??
    listings.find((l) => l.status === 'accepted' && l.checkIn === state.market.nightDate);
  const history = listings.filter((l) => l !== featured);
  const main = featured
    ? buyerListing(featured)
    : state.market.open
      ? newListingForm()
      : `<div class="tas tas-2 bos">Pazar şu an kapalı. Her akşam ${clockTR(state.meta.rules.marketOpens)}'de ilan bırakabilirsiniz.</div>`;
  return `
    ${main}
    ${history.length ? `<section class="gecmis"><h2>Geçmiş ilanlarınız</h2>${history.map(historyRow).join('')}</section>` : ''}`;
}

function newListingForm() {
  const { catalog, rules } = state.meta;
  const groups = Object.entries(catalog.guestGroups)
    .map(([k, v]) => chip('group', k, v, { type: 'radio', checked: k === 'evli_cift', cls: 'buyuk' }))
    .join('');
  const types = Object.entries(catalog.hotelTypes).map(([k, v]) => chip('hotelTypes', k, v, { cls: 'buyuk' })).join('');
  const amenities = Object.entries(catalog.amenities).map(([k, v]) => chip('amenities', k, v)).join('');
  const durations = rules.auctionDurations
    .map((d) => `<label class="secim yalin"><input type="radio" name="durationMinutes" value="${d}"${d === 30 ? ' checked' : ''}><span><b>${d} dk</b></span></label>`)
    .join('');
  return `
    <form class="ilan-formu" data-key="new-listing">
      <header class="form-bas">
        <p class="ust-baslik">Yeni ilan</p>
        <h1>Bu gece için ilan bırakın</h1>
        <p>Yazdıklarınızı yalnızca size uyan oteller görür ve birbirinin fiyatını kırarak teklif verir.</p>
      </header>

      <fieldset class="tas tas-1">
        <legend>Kimlerle geliyorsunuz?</legend>
        <div class="secimler">${groups}</div>
        <div class="sayaclar">
          ${stepper('adults', 'Yetişkin', 2, 1, 8)}
          ${stepper('children', 'Çocuk', 0, 0, 6)}
          ${stepper('roomCount', 'Oda', 1, 1, rules.maxRooms)}
        </div>
      </fieldset>

      <fieldset class="tas tas-2">
        <legend>Ne zaman?</legend>
        <div class="sayaclar">
          ${stepper('nights', 'Gece', 1, 1, rules.maxNights)}
          <label class="alan saat-alani">Tahmini varış <input type="time" name="arrivalTime" value="22:30" required></label>
        </div>
      </fieldset>

      <fieldset class="tas tas-3">
        <legend>Nasıl bir yer? <span>Boş bırakırsanız hepsi</span></legend>
        <div class="secimler">${types}</div>
      </fieldset>

      <fieldset class="tas tas-1">
        <legend>Olmazsa olmazlar <span>Yalnızca bunları sunan oteller teklif verebilir</span></legend>
        <div class="secimler">${amenities}</div>
      </fieldset>

      <fieldset class="tas tas-2">
        <legend>Bütçe ve süre</legend>
        <div class="butce-sure">
          <label class="alan">En fazla ödeyeceğiniz toplam <span class="tl-alan"><input type="number" name="maxBudget" min="1" inputmode="numeric" placeholder="İsteğe bağlı"><i>TL</i></span></label>
          <div class="alan"><span>Oteller ne kadar süre teklif versin?</span><div class="secimler">${durations}</div></div>
        </div>
        <label class="alan">Otellere notunuz <textarea name="note" maxlength="500" rows="2" placeholder="Örneğin yıl dönümü, geç varış, bebek yatağı"></textarea></label>
      </fieldset>

      <button class="dugme ana iri">İlanı bırakın</button>
    </form>`;
}

function buyerListing(l) {
  const live = LIVE.has(l.status);
  const grace = state.meta.rules.acceptGraceMinutes;
  const timer =
    l.status === 'open'
      ? crossing(l.createdAt, l.biddingEndsAt, `Teklifler <strong data-until="${l.biddingEndsAt}"></strong> sonra kapanıyor. Sonra ${grace} dakika içinde öne çıkanlardan birini seçin; seçmezseniz en iyi fiyat sizin olur.`)
      : l.status === 'awaiting_choice'
        ? `<p class="secim-suresi">${icon('fener')}<span>Teklifler kapandı. <strong data-until="${l.acceptUntil}"></strong> içinde seçmezseniz en iyi fiyat otomatik kabul edilir.</span></p>`
        : '';

  const cancelKey = `cancel:${l.id}`;
  const cancel = !live
    ? ''
    : state.pending === cancelKey
      ? confirmBlock('İlanınız iptal edilsin mi? Gelen teklifler geçersiz olur.', 'confirm-cancel', { listing: l.id }, 'Evet, iptal edin')
      : `<button class="bag tehlike" data-action="ask" data-key="${esc(cancelKey)}">İlanı iptal edin</button>`;

  const best = l.offers[0];
  return `
    <div class="ilan-duzen">
      <aside class="ilan-ozet tas tas-3">
        <div class="ozet-bas">
          <p class="ust-baslik">Sizin ilanınız</p>
          ${statusPill(l.status)}
        </div>
        <h1>${dateTR(l.checkIn)} gecesi</h1>
        <p class="kimler">${icon(l.group)}<span>${esc(label('guestGroups', l.group))} · ${people(l)}</span></p>
        <p class="soluk">${l.nights} gece · varış ${clockTR(l.arrivalTime)}${l.maxBudget ? ` · en fazla ${tl(l.maxBudget)}` : ''}</p>
        ${requestList(l)}
        ${l.note ? `<p class="alici-notu">“${esc(l.note)}”</p>` : ''}
        ${best && live ? `<p class="en-iyi">Şu an en iyi fiyat <span data-lowest-for="${esc(l.id)}" data-value="${best.price}">${tl(best.price)}</span></p>` : ''}
        ${timer}
        ${cancel}
      </aside>
      <section class="teklifler">${offersSection(l, live)}</section>
    </div>`;
}

function offersSection(l, live) {
  if (l.status === 'accepted') return acceptedBlock(l);
  if (l.offers.length === 0) {
    return `
      <div class="bekleme">
        <div class="halkalar" aria-hidden="true"><i></i><i></i><i></i></div>
        <h2>${live ? 'Teklifler bekleniyor' : 'Teklif gelmedi'}</h2>
        <p>${live ? 'İsteklerinize uyan oteller ilanınızı şu an görüyor. İlk teklif geldiğinde burada belirecek.' : 'Bu ilana teklif verilmedi.'}</p>
      </div>`;
  }
  const bests = l.offers.filter((o) => o.best.length > 0);
  const others = l.offers.filter((o) => o.best.length === 0);
  return `
    <header class="teklif-bas">
      <h2>Öne çıkanlar</h2>
      <p>${l.offers.length} teklif geldi. Aşağıdakilerden birini seçebilirsiniz.</p>
    </header>
    <ol class="teklif-listesi">${bests.map((o, i) => offerCard(l, o, live, i)).join('')}</ol>
    ${others.length ? `
      <h3 class="diger-bas">Diğer teklifler</h3>
      <ul class="diger-teklifler">${others.map((o) => `
        <li class="${state.arrivals.has(o.id) ? 'geldi' : ''}">
          ${icon(o.hotel.type)}<span>${esc(o.hotel.name)}</span><b>${tl(o.price)}</b>
        </li>`).join('')}
      </ul>` : ''}`;
}

function offerCard(listing, offer, canAccept, index) {
  const key = `accept:${offer.id}`;
  const confirming = canAccept && state.pending === key;
  const fresh = now() - offer.createdAt < FRESH_MS;
  const amenities = offer.hotel.amenities
    .map((a) => `<li class="${listing.amenities.includes(a) ? 'istenen' : ''}">${icon(a)}${esc(label('amenities', a))}</li>`)
    .join('');
  return `
    <li class="teklif tas tas-${(index % 3) + 1} ${state.arrivals.has(offer.id) ? 'geldi' : ''}">
      <div class="teklif-ust">
        <div class="damgalar">${offer.best.map((c) => `<span class="damga">${icon(c)}${esc(label('bestCategories', c))}</span>`).join('')}</div>
        ${fresh ? `<span class="taze">${icon('fener')}az önce</span>` : ''}
      </div>
      <div class="teklif-govde">
        <div class="teklif-bilgi">
          <h3>${esc(offer.hotel.name)}</h3>
          <p class="tip">${icon(offer.hotel.type)}${esc(label('hotelTypes', offer.hotel.type))} · ${esc(offer.roomName)}${listing.roomCount > 1 ? ` × ${listing.roomCount}` : ''}</p>
          ${offer.note ? `<p class="otel-notu">${icon('fener')}<span>${esc(offer.note)}</span></p>` : ''}
          <ul class="olanaklar">${amenities}</ul>
        </div>
        <div class="teklif-fiyat">
          <span class="fiyat">${tl(offer.price)}</span>
          <span class="fiyat-alt">${listing.nights} gece${listing.roomCount > 1 ? `, ${listing.roomCount} oda` : ''} toplam</span>
          ${canAccept && !confirming ? `<button class="dugme ana" data-action="ask" data-key="${esc(key)}">Bunu seçin</button>` : ''}
        </div>
      </div>
      ${confirming ? confirmBlock(`<b>${esc(offer.hotel.name)}</b>, ${tl(offer.price)}. Kabul edilsin mi? İlan kapanır, adınız ve telefonunuz otelle paylaşılır.`, 'confirm-accept', { listing: listing.id, offer: offer.id }, 'Evet, kabul ediyorum') : ''}
    </li>`;
}

function acceptedBlock(l) {
  const a = l.acceptedOffer;
  return `
    <div class="anlasma tas tas-1">
      <p class="ust-baslik">${l.autoAccepted ? 'Süre dolduğu için en iyi fiyat seçildi' : 'Anlaştınız'}</p>
      <h2>${esc(a.hotel.name)}</h2>
      <p class="tip">${icon(a.hotel.type)}${esc(label('hotelTypes', a.hotel.type))} · ${esc(a.roomName)}${l.roomCount > 1 ? ` × ${l.roomCount}` : ''}</p>
      <p class="fiyat">${tl(a.price)}</p>
      <dl class="iletisim">
        <div><dt>Telefon</dt><dd><a href="tel:${esc(a.contact.phone.replace(/\s/g, ''))}">${esc(a.contact.phone)}</a></dd></div>
        <div><dt>Adres</dt><dd>${esc(a.contact.address)}</dd></div>
      </dl>
      <p class="soluk">Otel de adınızı ve telefonunuzu gördü, ${clockTR(l.arrivalTime)} civarında sizi bekliyor.</p>
    </div>`;
}

function historyRow(l) {
  const outcome = l.acceptedOffer ? `${esc(l.acceptedOffer.hotel.name)} · ${tl(l.acceptedOffer.price)}` : `${l.offers.length} teklif`;
  return `
    <div class="gecmis-satir">
      <span>${dateTR(l.checkIn)}</span>
      <span>${esc(label('guestGroups', l.group))} · ${people(l)}</span>
      <span>${outcome}</span>
      ${statusPill(l.status)}
    </div>`;
}

// ---- Otel ----

function hotelView({ hotel, live, won }) {
  const rooms = hotel.rooms.map((r) => `${esc(r.name)} (${r.capacity} kişilik${r.count ? `, ${r.count} adet` : ''})`).join(' · ');
  const groups = hotel.acceptedGroups.map((g) => label('guestGroups', g)).join(', ');
  const closedNotice = state.market.open
    ? ''
    : `<div class="tas tas-2 bos">Pazar kapalı. İlanlar her akşam ${clockTR(state.meta.rules.marketOpens)}'de düşmeye başlar.</div>`;
  return `
    <section class="otel-serit">
      <div class="otel-kimlik">
        ${icon(hotel.type, 'iri')}
        <div>
          <p class="ust-baslik">${esc(label('hotelTypes', hotel.type))}</p>
          <h1>${esc(hotel.name)}</h1>
        </div>
      </div>
      <ul class="olanaklar">${hotel.amenities.map((a) => `<li>${icon(a)}${esc(label('amenities', a))}</li>`).join('')}</ul>
      <p class="soluk">Kabul ettiğiniz misafirler: ${esc(groups)}<br>Odalar: ${rooms}</p>
    </section>
    <section class="otel-ilanlar">
      <header class="teklif-bas">
        <h2>Size uygun ilanlar</h2>
        <p>${live.length ? `${live.length} ilan, isteklerine uyduğunuz için size gösteriliyor.` : ''}</p>
      </header>
      ${closedNotice}
      ${live.length ? live.map(hotelListingCard).join('') : state.market.open ? `
        <div class="bekleme">
          <div class="halkalar" aria-hidden="true"><i></i><i></i><i></i></div>
          <h2>Şu an size uygun ilan yok</h2>
          <p>Yeni ilan düştüğünde bu sayfa kendiliğinden güncellenir.</p>
        </div>` : ''}
    </section>
    ${won.length ? `<section class="kazanilanlar"><h2>Kazandığınız ilanlar</h2>${won.map(wonCard).join('')}</section>` : ''}`;
}

function hotelListingCard(l, index) {
  const stillBest = l.myBest.filter((c) => c !== 'price');
  const myStatus = l.iAmLowest
    ? `<p class="not iyi">${icon('price')}<span>En düşük teklif sizde: <b>${tl(l.myOffer.price)}</b>${stillBest.length ? `. Ayrıca ${esc(bestPhrase(stillBest))} öne çıkıyorsunuz.` : ''}</span></p>`
    : l.myOffer
      ? `<p class="not uyari">${icon('dalga')}<span>Teklifiniz (${tl(l.myOffer.price)}) fiyatta geçildi.${stillBest.length ? ` Yine de ${esc(bestPhrase(stillBest))} öne çıkıyorsunuz, alıcı sizi seçebilir.` : ''}</span></p>`
      : '';
  const kirildi = state.drops.has(l.id) && !l.iAmLowest;
  return `
    <article class="ilan-kart tas tas-${(index % 3) + 1} ${state.arrivals.has(l.id) ? 'geldi' : ''} ${kirildi ? 'kirildi' : ''}">
      <div class="ilan-kart-sol">
        <p class="kimler">${icon(l.group)}<span>${esc(label('guestGroups', l.group))}</span></p>
        <h3>${people(l)}</h3>
        <p class="soluk">${dateTR(l.checkIn)} gecesi · ${l.nights} gece · varış ${clockTR(l.arrivalTime)}</p>
        ${requestList(l, { compact: true })}
        ${l.note ? `<p class="alici-notu">“${esc(l.note)}”</p>` : ''}
      </div>
      <div class="ilan-kart-sag">
        ${l.status === 'open'
          ? crossing(l.createdAt, l.biddingEndsAt, `Teklif için <strong data-until="${l.biddingEndsAt}"></strong>`)
          : `<p class="secim-suresi">${icon('fener')}<span>Teklifler kapandı, alıcı seçim yapıyor.</span></p>`}
        <dl class="ozet-sayilar">
          <div><dt>En düşük</dt><dd>${l.lowestPrice != null ? `<span data-lowest-for="${esc(l.id)}" data-value="${l.lowestPrice}">${tl(l.lowestPrice)}</span>` : 'Henüz yok'}</dd></div>
          <div><dt>Teklif</dt><dd>${l.offerCount}</dd></div>
          <div><dt>Bütçe</dt><dd>${l.maxBudget ? tl(l.maxBudget) : 'Serbest'}</dd></div>
        </dl>
        ${myStatus}
        ${l.status === 'open' && !l.iAmLowest ? offerForm(l) : ''}
      </div>
    </article>`;
}

function offerForm(l) {
  const rooms = l.rooms.map((r) => `<option>${esc(r)}</option>`).join('');
  const ceiling = l.priceCeiling;
  const step = state.meta.rules.minDecrementTL;
  // Tavandan başlayan üç hızlı fiyat önerisi.
  const quick = ceiling ? [ceiling, ceiling - step * 2, ceiling - step * 5].filter((p) => p > 0) : [];
  return `
    <form class="teklif-formu" data-key="offer-${esc(l.id)}" data-listing="${esc(l.id)}">
      <label class="alan">Oda tipi${l.roomCount > 1 ? ` (${l.roomCount} adet)` : ''} <select name="roomName">${rooms}</select></label>
      <label class="alan">Toplam fiyat, ${l.nights} gece${l.roomCount > 1 ? `, ${l.roomCount} oda` : ''}
        <span class="tl-alan"><input type="number" name="price" min="1"${ceiling ? ` max="${ceiling}"` : ''} required inputmode="numeric"
          placeholder="${ceiling ? `En fazla ${money(ceiling)}` : 'Fiyatınız'}"><i>TL</i></span>
      </label>
      ${quick.length ? `<div class="hizli"><span>Hızlı fiyat</span>${quick.map((p) => `<button type="button" class="secim-dugme" data-fill="${p}">${money(p)}</button>`).join('')}</div>` : ''}
      <label class="alan genis">Alıcıya notunuz <input name="note" maxlength="300" placeholder="Örneğin geç çıkış, hoş geldin ikramı"></label>
      <button class="dugme ana genis">${l.lowestPrice != null ? 'Fiyatı kırın' : 'İlk teklifi verin'}</button>
    </form>`;
}

function wonCard(l) {
  return `
    <article class="anlasma tas tas-2">
      <p class="ust-baslik">${l.autoAccepted ? 'En iyi fiyat olarak otomatik kazandınız' : 'Alıcı sizi seçti'}</p>
      <h3>${esc(l.buyer.name)} · ${people(l)}</h3>
      <p class="soluk">${dateTR(l.checkIn)} gecesi · ${l.nights} gece · varış ${clockTR(l.arrivalTime)}</p>
      <p class="fiyat">${tl(l.acceptedOffer.price)} <span>${esc(l.acceptedOffer.roomName)}${l.roomCount > 1 ? ` × ${l.roomCount}` : ''}</span></p>
      <dl class="iletisim"><div><dt>Telefon</dt><dd><a href="tel:${esc(l.buyer.phone)}">${esc(l.buyer.phone)}</a></dd></div></dl>
    </article>`;
}

// ---- Etkileşim ----

async function withBusy(button, fn) {
  if (button) button.disabled = true;
  try {
    await fn();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

const submitHandlers = {
  'buyer-login': async (form, fd) => {
    const session = await api('/api/session', { method: 'POST', body: { role: 'buyer', name: fd.get('name'), phone: fd.get('phone') } });
    setSession(session);
  },
  'hotel-login': async (form, fd) => {
    const session = await api('/api/session', { method: 'POST', body: { role: 'hotel', hotelId: fd.get('hotelId'), pin: fd.get('pin') } });
    setSession(session);
  },
  'new-listing': async (form, fd) => {
    await api('/api/listings', {
      method: 'POST',
      body: {
        group: fd.get('group'),
        adults: Number(fd.get('adults')),
        children: Number(fd.get('children')),
        roomCount: Number(fd.get('roomCount')),
        nights: Number(fd.get('nights')),
        arrivalTime: fd.get('arrivalTime'),
        hotelTypes: fd.getAll('hotelTypes'),
        amenities: fd.getAll('amenities'),
        maxBudget: fd.get('maxBudget') ? Number(fd.get('maxBudget')) : null,
        durationMinutes: Number(fd.get('durationMinutes')),
        note: fd.get('note'),
      },
    });
    toast('İlanınız yayında. Uygun oteller teklif vermeye başlayabilir.', 'success');
  },
  offer: async (form, fd) => {
    const price = Number(fd.get('price'));
    await api(`/api/listings/${encodeURIComponent(form.dataset.listing)}/offers`, {
      method: 'POST',
      body: { price, roomName: fd.get('roomName'), note: fd.get('note') },
    });
    toast(`${tl(price)} teklifiniz alıcıya ulaştı.`, 'success');
  },
};

// false dönen işlemler sunucuya gitmez, yalnızca ekranı yeniden çizer.
const clickHandlers = {
  logout: async () => {
    await api('/api/session', { method: 'DELETE' }).catch(() => {});
    setSession(null);
  },
  ask: async (button) => {
    state.pending = button.dataset.key;
    render();
    return false;
  },
  dismiss: async () => {
    state.pending = null;
    render();
    return false;
  },
  'confirm-accept': async (button) => {
    const { listing, offer } = button.dataset;
    await api(`/api/listings/${encodeURIComponent(listing)}/accept`, { method: 'POST', body: { offerId: offer } });
    state.pending = null;
    toast('Anlaştınız. İyi tatiller!', 'success');
  },
  'confirm-cancel': async (button) => {
    await api(`/api/listings/${encodeURIComponent(button.dataset.listing)}/cancel`, { method: 'POST' });
    state.pending = null;
    toast('İlanınız iptal edildi.', 'success');
  },
};

function bindEvents() {
  document.addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-key]');
    if (!form) return;
    event.preventDefault();
    const handler = submitHandlers[form.dataset.key.startsWith('offer-') ? 'offer' : form.dataset.key];
    withBusy(form.querySelector('button:not([type="button"])'), async () => {
      await handler(form, new FormData(form));
      form.reset();
      await refresh();
    });
  });

  document.addEventListener('click', (event) => {
    const stepButton = event.target.closest('[data-adim]');
    if (stepButton) {
      const input = stepButton.closest('.sayac').querySelector('input');
      const next = Number(input.value) + Number(stepButton.dataset.adim);
      input.value = Math.min(Number(input.dataset.max), Math.max(Number(input.dataset.min), next));
      syncSteppers(stepButton.closest('form'));
      return;
    }
    const fill = event.target.closest('[data-fill]');
    if (fill) {
      fill.closest('form').elements.price.value = fill.dataset.fill;
      return;
    }
    const button = event.target.closest('[data-action]');
    if (!button) return;
    withBusy(button, async () => {
      if ((await clickHandlers[button.dataset.action](button)) !== false) await refresh();
    });
  });

  document.addEventListener('change', (event) => {
    if (event.target.name !== 'group') return;
    const defaults = GROUP_DEFAULTS[event.target.value];
    const form = event.target.form;
    if (!defaults || !form) return;
    [form.elements.adults.value, form.elements.children.value, form.elements.roomCount.value] = defaults;
    syncSteppers(form);
  });
}

// Önizleme sayfası alıcı ve oteller arasında geçiş yapmak için kullanır.
window.addEventListener('agva:session', (event) => {
  setSession(event.detail);
  state.pending = null;
  $('#toast').hidden = true;
  if (state.meta) refresh();
});

async function init() {
  $('#marka').innerHTML = `${logo}<span class="marka-ad">Ağva</span><span class="marka-alt">gece pazarı</span>`;
  try {
    state.meta = await api('/api/meta');
  } catch (err) {
    $('#view').innerHTML = `<p class="bos">${esc(err.message)}</p>`;
    return;
  }
  bindEvents();
  connectEvents();
  await refresh();
  setInterval(tick, 1000);
  setInterval(() => scheduleRefresh(0), 30_000);
}

init();
