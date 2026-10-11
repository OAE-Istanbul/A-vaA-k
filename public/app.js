const TIME_ZONE = 'Europe/Istanbul';
const LIVE = new Set(['open', 'awaiting_choice']);
// Profil seçilince yetişkin, çocuk ve oda sayısını makul varsayılana çeker.
const GROUP_DEFAULTS = { evli_cift: [2, 0, 1], cift: [2, 0, 1], tek: [1, 0, 1], aile: [2, 1, 1], arkadas: [4, 0, 2] };

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
};

// ---- Biçimlendirme ----

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
const tl = (n) => `${new Intl.NumberFormat('tr-TR').format(n)} TL`;
const dateTR = (iso) => iso.split('-').reverse().join('.');
const timeTR = (ms) => new Intl.DateTimeFormat('tr-TR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(ms);
const now = () => Date.now() + state.skew;

function countdown(ms) {
  if (ms <= 0) return '00:00';
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
    } else if (state.hotels.length === 0) {
      state.hotels = await api('/api/hotels');
    }
    render();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---- Bildirim ----

let toastTimer = null;
function toast(message, kind = 'info') {
  const el = $('#toast');
  el.textContent = message;
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
  $('#app-name').textContent = state.meta.appName;
  $('#session-box').innerHTML = state.session
    ? `<span>${esc(state.session.name)}</span><button class="link" data-action="logout">Çıkış</button>`
    : '';
  renderBanner();
  $('#view').innerHTML = !state.session
    ? landingView()
    : !state.data
      ? '<p class="muted loading">Yükleniyor…</p>'
      : state.session.role === 'buyer'
        ? buyerView(state.data)
        : hotelView(state.data);
  restoreForms(snapshot);
  tick();
}

function renderBanner() {
  const m = state.market;
  const banner = $('#market-banner');
  banner.className = `banner ${m.open ? 'open' : 'closed'}`;
  banner.innerHTML = m.open
    ? `Pazar açık · ${dateTR(m.nightDate)} gecesi · kapanışa <strong data-until="${m.closesAt}"></strong>`
    : `Pazar kapalı · her akşam ${esc(state.meta.rules.marketOpens)}'de açılır · açılışa <strong data-until="${m.opensAt}"></strong>`;
}

function tick() {
  let expired = false;
  for (const el of document.querySelectorAll('[data-until]')) {
    const left = Number(el.dataset.until) - now();
    el.textContent = countdown(left);
    if (left <= 0 && !el.dataset.done) {
      el.dataset.done = '1';
      expired = true;
    }
  }
  if (expired) scheduleRefresh(1000);
}

const chip = (name, value, text, { type = 'checkbox', checked = false } = {}) =>
  `<label class="chip"><input type="${type}" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}><span>${esc(text)}</span></label>`;

const tag = (text, cls = '') => `<span class="tag ${cls}">${esc(text)}</span>`;

function landingView() {
  const rules = state.meta.rules;
  const hotelOptions = state.hotels
    .map((h) => `<option value="${esc(h.id)}">${esc(h.name)} (${esc(label('hotelTypes', h.type))})</option>`)
    .join('');
  return `
    <section class="hero">
      <h1>Bu gece Ağva'da kalın, fiyatı oteller kırsın.</h1>
      <p>İlanınızı açın, isteklerinize uyan Ağva otelleri birbirinin fiyatını kırarak size teklif versin.
      Pazar her akşam ${esc(rules.marketOpens)}'de açılır; boş kalacak odalar en iyi fiyatla sizin olur.</p>
    </section>
    <div class="grid two">
      <form class="card" data-key="buyer-login">
        <h2>Konaklama arıyorum</h2>
        <label>Adınız <input name="name" required maxlength="60" autocomplete="given-name"></label>
        <label>Cep telefonu <input name="phone" required inputmode="tel" placeholder="05XX XXX XX XX" autocomplete="tel"></label>
        <button class="primary">Devam et</button>
      </form>
      <form class="card" data-key="hotel-login">
        <h2>Otelim var</h2>
        <label>Otel <select name="hotelId" required>${hotelOptions}</select></label>
        <label>PIN <input name="pin" type="password" inputmode="numeric" required autocomplete="current-password"></label>
        <button>Otel paneline gir</button>
      </form>
    </div>
    <section class="card">
      <h2>Nasıl çalışır?</h2>
      <ol class="steps">
        <li><strong>İlanı açın.</strong> Kaç kişi geleceğinizi, profilinizi (evli çift, aile, arkadaş grubu…), varış saatinizi, istediğiniz otel tipini ve olmazsa olmaz olanakları yazın.</li>
        <li><strong>Oteller yarışsın.</strong> Yalnızca isteklerinize uyan oteller ilanınızı görür. Her yeni teklif en düşük fiyatın en az ${tl(rules.minDecrementTL)} altında olmak zorunda.</li>
        <li><strong>En iyilerden seçin.</strong> Süre bitince en iyi fiyat, en çok olanak ve fiyat/performans teklifleri öne çıkar. Birini seçin; ${rules.acceptGraceMinutes} dakika içinde seçmezseniz en iyi fiyat otomatik kabul edilir ve otelin iletişim bilgileri açılır.</li>
      </ol>
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
    ? buyerListingCard(featured)
    : state.market.open
      ? newListingForm()
      : `<div class="card empty">Pazar şu an kapalı. Her akşam ${esc(state.meta.rules.marketOpens)}'de ilan açabilirsiniz.</div>`;
  return `
    <section>${main}</section>
    ${history.length ? `<section><h2>Geçmiş ilanlarınız</h2>${history.map(buyerListingCard).join('')}</section>` : ''}`;
}

function newListingForm() {
  const { catalog, rules } = state.meta;
  const groups = Object.entries(catalog.guestGroups)
    .map(([k, v]) => chip('group', k, v, { type: 'radio', checked: k === 'evli_cift' }))
    .join('');
  const types = Object.entries(catalog.hotelTypes).map(([k, v]) => chip('hotelTypes', k, v)).join('');
  const amenities = Object.entries(catalog.amenities).map(([k, v]) => chip('amenities', k, v)).join('');
  const nights = Array.from({ length: rules.maxNights }, (_, i) => `<option value="${i + 1}">${i + 1} gece</option>`).join('');
  const rooms = Array.from({ length: rules.maxRooms }, (_, i) => `<option value="${i + 1}">${i + 1} oda</option>`).join('');
  const durations = rules.auctionDurations
    .map((d) => `<option value="${d}"${d === 30 ? ' selected' : ''}>${d} dakika</option>`)
    .join('');
  return `
    <form class="card" data-key="new-listing">
      <h2>Bu gece için ilan açın</h2>
      <p class="muted">${dateTR(state.market.nightDate)} gecesi giriş. Oteller teklif süresi boyunca birbirinin fiyatını kırar.</p>
      <fieldset><legend>Kimlerle geliyorsunuz?</legend><div class="chips">${groups}</div></fieldset>
      <div class="row">
        <label>Yetişkin <input type="number" name="adults" min="1" max="8" value="2" required></label>
        <label>Çocuk <input type="number" name="children" min="0" max="6" value="0" required></label>
        <label>Oda <select name="roomCount">${rooms}</select></label>
        <label>Kalış <select name="nights">${nights}</select></label>
        <label>Tahmini varış <input type="time" name="arrivalTime" value="22:30" required></label>
      </div>
      <fieldset><legend>Otel tipi <span class="small">(boş bırakırsanız hepsi)</span></legend><div class="chips">${types}</div></fieldset>
      <fieldset><legend>Olmazsa olmaz olanaklar</legend><div class="chips">${amenities}</div></fieldset>
      <div class="row">
        <label>Bütçe üst sınırı, toplam TL (isteğe bağlı) <input type="number" name="maxBudget" min="1" inputmode="numeric"></label>
        <label>Teklif süresi <select name="durationMinutes">${durations}</select></label>
      </div>
      <label>Not (isteğe bağlı) <textarea name="note" maxlength="500" rows="2" placeholder="Örn. yıl dönümü, geç varış, bebek yatağı"></textarea></label>
      <button class="primary">İlanı aç</button>
    </form>`;
}

function statusTag(status) {
  const map = {
    open: ['Teklif alıyor', 'good'],
    awaiting_choice: ['Seçiminizi bekliyor', 'warn'],
    accepted: ['Kabul edildi', 'good'],
    cancelled: ['İptal edildi', ''],
    expired: ['Sona erdi', ''],
  };
  const [text, cls] = map[status] ?? [status, ''];
  return tag(text, cls);
}

function requestTags(listing) {
  const types = listing.hotelTypes.length
    ? listing.hotelTypes.map((t) => tag(label('hotelTypes', t)))
    : [tag('Tüm otel tipleri')];
  const amenities = listing.amenities.map((a) => tag(label('amenities', a), 'hit'));
  const budget = listing.maxBudget ? [tag(`En fazla ${tl(listing.maxBudget)}`)] : [];
  return `<div class="tags">${[...types, ...amenities, ...budget].join('')}</div>`;
}

function confirmBlock(question, confirmAction, data, confirmText) {
  const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `
    <div class="confirm">
      <span>${question}</span>
      <div class="confirm-actions">
        <button class="primary" data-action="${confirmAction}" ${attrs}>${confirmText}</button>
        <button data-action="dismiss">Vazgeç</button>
      </div>
    </div>`;
}

function buyerListingCard(l) {
  const live = LIVE.has(l.status);
  const grace = state.meta.rules.acceptGraceMinutes;
  const countdownLine =
    l.status === 'open'
      ? `<p class="countdown">Teklifler <strong data-until="${l.biddingEndsAt}"></strong> sonra kapanıyor. Ardından ${grace} dakika içinde öne çıkanlardan birini seçin; seçmezseniz en iyi fiyat otomatik kabul edilir.</p>`
      : l.status === 'awaiting_choice'
        ? `<p class="countdown">Teklif süresi bitti. Öne çıkanlardan birini seçin. <strong data-until="${l.acceptUntil}"></strong> içinde seçmezseniz en iyi fiyat otomatik kabul edilir.</p>`
        : '';

  const bests = l.offers.filter((o) => o.best.length > 0);
  const others = l.offers.filter((o) => o.best.length === 0);
  const offers =
    l.offers.length === 0
      ? `<p class="empty">${live ? 'Henüz teklif yok. İsteklerinize uyan oteller ilanınızı görüyor.' : 'Teklif gelmedi.'}</p>`
      : `<h3>Öne çıkanlar</h3>
         <ol class="offers">${bests.map((o) => buyerOffer(l, o, live)).join('')}</ol>
         ${others.length ? `<h3 class="sub">Diğer teklifler (${others.length})</h3><ol class="offers">${others.map((o) => buyerOffer(l, o, false)).join('')}</ol>` : ''}`;

  const a = l.acceptedOffer;
  const accepted = a
    ? `<div class="notice good">
        <strong>${l.autoAccepted ? `Seçim süresi dolduğu için en iyi fiyat otomatik kabul edildi: ${esc(a.hotel.name)}, ${tl(a.price)}` : `${esc(a.hotel.name)} teklifini kabul ettiniz: ${tl(a.price)}`}</strong>
        <p>${esc(a.roomName)}${l.roomCount > 1 ? ` × ${l.roomCount}` : ''} · Telefon: <a href="tel:${esc(a.contact.phone.replace(/\s/g, ''))}">${esc(a.contact.phone)}</a> · ${esc(a.contact.address)}</p>
        <p class="small">Otel de adınızı ve telefonunuzu gördü, varışınızı bekliyor.</p>
      </div>`
    : '';

  const cancelKey = `cancel:${l.id}`;
  const cancel = !live
    ? ''
    : state.pending === cancelKey
      ? confirmBlock('İlanınız iptal edilsin mi? Gelen teklifler geçersiz olur.', 'confirm-cancel', { listing: l.id }, 'Evet, iptal et')
      : `<div class="actions"><button class="danger" data-action="ask" data-key="${esc(cancelKey)}">İlanı iptal et</button></div>`;

  return `
    <article class="card">
      <header class="listing-head">
        <div>
          <h2>${dateTR(l.checkIn)} gecesi · ${l.nights} gece</h2>
          <p class="muted">${esc(label('guestGroups', l.group))} · ${people(l)} · varış ${esc(l.arrivalTime)}</p>
        </div>
        ${statusTag(l.status)}
      </header>
      ${requestTags(l)}
      ${countdownLine}
      ${accepted}
      ${l.status === 'accepted' ? '' : offers}
      ${cancel}
    </article>`;
}

function buyerOffer(listing, offer, canAccept) {
  const amenities = offer.hotel.amenities
    .map((a) => tag(label('amenities', a), listing.amenities.includes(a) ? 'hit' : ''))
    .join('');
  const key = `accept:${offer.id}`;
  const confirming = canAccept && state.pending === key;
  return `
    <li class="offer ${offer.best.length ? 'best' : ''}">
      <div class="offer-main">
        <div class="offer-title">
          <strong>${esc(offer.hotel.name)}</strong>
          <span class="muted small">${esc(label('hotelTypes', offer.hotel.type))}</span>
          ${offer.best.map((c) => tag(label('bestCategories', c), 'good')).join('')}
        </div>
        <p class="muted small">${esc(offer.roomName)}${listing.roomCount > 1 ? ` × ${listing.roomCount}` : ''}${offer.hotel.description ? ` · ${esc(offer.hotel.description)}` : ''}</p>
        ${offer.note ? `<p class="small">“${esc(offer.note)}”</p>` : ''}
        <div class="tags">${amenities}</div>
      </div>
      <div class="offer-side">
        <span class="price">${tl(offer.price)}</span>
        ${canAccept && !confirming ? `<button class="primary" data-action="ask" data-key="${esc(key)}">Bunu seç</button>` : ''}
      </div>
      ${confirming ? confirmBlock(`${esc(offer.hotel.name)} teklifi ${tl(offer.price)} ile kabul edilsin mi? İlan kapanır, iletişim bilgileriniz otelle paylaşılır.`, 'confirm-accept', { listing: listing.id, offer: offer.id }, 'Evet, kabul et') : ''}
    </li>`;
}

// ---- Otel ----

function hotelView({ hotel, live, won }) {
  const rooms = hotel.rooms.map((r) => `${esc(r.name)} (${r.capacity} kişi)`).join(', ');
  const groups = hotel.acceptedGroups.map((g) => label('guestGroups', g)).join(', ');
  const closedNotice = state.market.open
    ? ''
    : `<div class="notice plain">Pazar kapalı. İlanlar her akşam ${esc(state.meta.rules.marketOpens)}'de düşmeye başlar.</div>`;
  return `
    <section class="card">
      <h2>${esc(hotel.name)}</h2>
      <p class="muted">${esc(label('hotelTypes', hotel.type))} · Kabul edilen misafirler: ${esc(groups)}</p>
      <div class="tags">${hotel.amenities.map((a) => tag(label('amenities', a))).join('')}</div>
      <p class="muted small">Odalar: ${rooms}</p>
    </section>
    <section>
      <h2>Size uygun açık ilanlar (${live.length})</h2>
      ${closedNotice}
      ${live.length ? live.map(hotelListingCard).join('') : '<div class="card empty">Şu an size uygun açık ilan yok. Yeni ilan düştüğünde bu sayfa kendiliğinden güncellenir.</div>'}
    </section>
    ${won.length ? `<section><h2>Kazandığınız ilanlar</h2>${won.map(wonCard).join('')}</section>` : ''}`;
}

function hotelListingCard(l) {
  const stillBest = l.myBest.filter((c) => c !== 'price');
  const myStatus = l.iAmLowest
    ? `<div class="notice good">En düşük teklif sizde: <strong>${tl(l.myOffer.price)}</strong>${stillBest.length ? ` · Ayrıca ${esc(bestPhrase(stillBest))} öne çıkıyorsunuz.` : ''}</div>`
    : l.myOffer
      ? `<div class="notice warn">Teklifiniz (${tl(l.myOffer.price)}) fiyatta geçildi.${stillBest.length ? ` Yine de ${esc(bestPhrase(stillBest))} öne çıkıyorsunuz, alıcı sizi seçebilir.` : ''}${l.status === 'open' ? ` Yeni teklifiniz en fazla ${tl(l.priceCeiling)} olabilir.` : ''}</div>`
      : '';
  const timer =
    l.status === 'open'
      ? `<span class="timer" title="Teklif süresi"><span data-until="${l.biddingEndsAt}"></span></span>`
      : tag('Alıcı seçim yapıyor', 'warn');

  return `
    <article class="card">
      <header class="listing-head">
        <div>
          <h3>${esc(label('guestGroups', l.group))} · ${people(l)}</h3>
          <p class="muted small">${dateTR(l.checkIn)} gecesi · ${l.nights} gece · varış ${esc(l.arrivalTime)}</p>
        </div>
        ${timer}
      </header>
      ${requestTags(l)}
      ${l.note ? `<p class="buyer-note">“${esc(l.note)}”</p>` : ''}
      <div class="stats">
        <div><span class="muted">En düşük</span><strong>${l.lowestPrice != null ? tl(l.lowestPrice) : 'Teklif yok'}</strong></div>
        <div><span class="muted">Teklif sayısı</span><strong>${l.offerCount}</strong></div>
        <div><span class="muted">Bütçe</span><strong>${l.maxBudget ? tl(l.maxBudget) : 'Belirtilmedi'}</strong></div>
      </div>
      ${myStatus}
      ${l.status === 'open' && !l.iAmLowest ? offerForm(l) : ''}
    </article>`;
}

function offerForm(l) {
  const rooms = l.rooms.map((r) => `<option>${esc(r)}</option>`).join('');
  const ceiling = l.priceCeiling;
  return `
    <form class="offer-form" data-key="offer-${esc(l.id)}" data-listing="${esc(l.id)}">
      <label>Oda tipi${l.roomCount > 1 ? ` (${l.roomCount} adet)` : ''} <select name="roomName">${rooms}</select></label>
      <label>Toplam fiyat, ${l.nights} gece${l.roomCount > 1 ? `, ${l.roomCount} oda` : ''} (TL)
        <input type="number" name="price" min="1"${ceiling ? ` max="${ceiling}"` : ''} required inputmode="numeric"
          placeholder="${ceiling ? `En fazla ${ceiling}` : 'Fiyatınız'}">
      </label>
      <label class="grow">Not (isteğe bağlı) <input name="note" maxlength="300" placeholder="Örn. geç çıkış, hoş geldin ikramı"></label>
      <button class="primary">${l.lowestPrice != null ? 'Fiyatı kır' : 'İlk teklifi ver'}</button>
    </form>`;
}

function wonCard(l) {
  return `
    <article class="card">
      <header class="listing-head">
        <div>
          <h3>${dateTR(l.checkIn)} gecesi · ${people(l)}</h3>
          <p class="muted small">${esc(label('guestGroups', l.group))} · ${l.nights} gece · varış ${esc(l.arrivalTime)}</p>
        </div>
        ${tag('Kazandınız', 'good')}
      </header>
      <div class="notice good">
        <strong>${esc(l.acceptedOffer.roomName)}${l.roomCount > 1 ? ` × ${l.roomCount}` : ''} · ${tl(l.acceptedOffer.price)}</strong>
        <p>Misafir: ${esc(l.buyer.name)} · <a href="tel:${esc(l.buyer.phone)}">${esc(l.buyer.phone)}</a></p>
        ${l.autoAccepted ? '<p class="small">Alıcı seçim yapmadı, en iyi fiyat olarak otomatik kazandınız.</p>' : ''}
      </div>
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
    toast('İlanınız açıldı. Uygun oteller teklif vermeye başlayabilir.', 'success');
  },
  offer: async (form, fd) => {
    const price = Number(fd.get('price'));
    await api(`/api/listings/${encodeURIComponent(form.dataset.listing)}/offers`, {
      method: 'POST',
      body: { price, roomName: fd.get('roomName'), note: fd.get('note') },
    });
    toast(`${tl(price)} teklifiniz gönderildi.`, 'success');
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
    toast('Teklifi kabul ettiniz. İyi tatiller!', 'success');
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
    withBusy(form.querySelector('button'), async () => {
      await handler(form, new FormData(form));
      form.reset();
      await refresh();
    });
  });

  document.addEventListener('click', (event) => {
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
    if (defaults && form) [form.adults.value, form.children.value, form.roomCount.value] = defaults;
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
  try {
    state.meta = await api('/api/meta');
  } catch (err) {
    $('#view').innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    return;
  }
  document.title = `${state.meta.appName} Gece Teklifleri`;
  bindEvents();
  connectEvents();
  await refresh();
  setInterval(tick, 1000);
  setInterval(() => scheduleRefresh(0), 30_000);
}

init();
