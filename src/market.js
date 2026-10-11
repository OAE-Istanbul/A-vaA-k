import { isoDate, localParts, marketWindow } from './clock.js';
import { checkEligibility, roomCount, suitableRooms } from './eligibility.js';
import { MarketError } from './errors.js';
import { newId } from './ids.js';
import { text, validateListingInput, validateOfferInput } from './validation.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const LIVE_STATUSES = new Set(['open', 'awaiting_choice']);

export const formatTL = (n) => `${new Intl.NumberFormat('tr-TR').format(n)} TL`;

/**
 * Öne çıkan teklif kategorileri. Her biri teklifleri puanlar; en yüksek puan kazanır.
 * Teklifler fiyata göre sıralı geldiği için eşitlikte ucuz olan seçilir.
 */
const BEST_SCORES = {
  price: (offer) => -offer.price,
  amenities: (offer, hotel) => hotel.amenities.length,
  value: (offer, hotel) => hotel.amenities.length / offer.price,
};

/**
 * Ters açık artırma pazarı.
 *
 * İlan durumları: open (teklif alıyor), awaiting_choice (süre bitti, alıcı öne çıkan
 * tekliflerden birini seçiyor), accepted, cancelled, expired. Alıcı seçim süresinde
 * seçmezse en iyi fiyat otomatik kabul edilir (settle).
 *
 * Oda stoku: bir oda aynı gece iki ilanı kazanamaz. İlk kabul edilen teklif odayı alır;
 * otelin aynı oda tipindeki, artık karşılanamayan diğer teklifleri geri çekilir.
 * Otomatik kabulde önce açılan ilan önce seçer.
 */
export class Marketplace {
  #listeners = new Set();

  constructor({ store, clock, config }) {
    this.store = store;
    this.clock = clock;
    this.config = config;
  }

  get #db() {
    return this.store.data;
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #commit(event) {
    this.store.save();
    for (const listener of this.#listeners) listener(event);
  }

  marketStatus(now = this.clock()) {
    return { now, ...marketWindow(now, this.config) };
  }

  hotelDirectory() {
    return Object.values(this.#db.hotels)
      .map(({ id, name, type, region }) => ({ id, name, type, region }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }

  // ---- Durum ----

  activeOffers(listingId) {
    return Object.values(this.#db.offers)
      .filter((o) => o.listingId === listingId && o.active)
      .sort((a, b) => a.price - b.price || a.createdAt - b.createdAt);
  }

  /** Teklif kimliği -> kazandığı kategoriler. Aynı teklif birden fazla kategoride öne çıkabilir. */
  bestOffers(listingId) {
    const offers = this.activeOffers(listingId);
    const bests = new Map();
    for (const [category, score] of Object.entries(BEST_SCORES)) {
      let best = null;
      let bestScore = -Infinity;
      for (const offer of offers) {
        const s = score(offer, this.#db.hotels[offer.hotelId]);
        if (s > bestScore) {
          best = offer;
          bestScore = s;
        }
      }
      if (best) bests.set(best.id, [...(bests.get(best.id) ?? []), category]);
    }
    return bests;
  }

  acceptUntil(listing) {
    return listing.biddingEndsAt + this.config.acceptGraceMinutes * MINUTE;
  }

  statusOf(listing, now = this.clock()) {
    if (listing.status === 'accepted' || listing.status === 'cancelled') return listing.status;
    if (now < listing.biddingEndsAt) return 'open';
    if (now < this.acceptUntil(listing) && this.activeOffers(listing.id).length > 0) return 'awaiting_choice';
    return 'expired';
  }

  /**
   * Seçim süresi dolan ilanlarda en iyi fiyatı otomatik kabul eder. Periyodik olarak da çağrılır.
   * Önce açılan ilan önce işlenir; böylece aynı odaya iki ilan talipse ilk ilan odayı alır.
   */
  settle(now = this.clock()) {
    const settled = [];
    const due = Object.values(this.#db.listings)
      .filter((l) => l.status === 'active' && now >= this.acceptUntil(l))
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const listing of due) {
      const [cheapest] = this.activeOffers(listing.id);
      if (!cheapest) continue;
      this.#accept(listing, cheapest, this.acceptUntil(listing), { auto: true });
      settled.push(listing.id);
    }
    if (settled.length > 0) this.#commit({ type: 'auto_accepted', listingIds: settled });
    return settled;
  }

  // ---- Oda stoku ----

  /** İlanın kapladığı geceler: [ilk gece, son geceden sonraki gün) gün numarası olarak. */
  #nights(listing) {
    const [y, m, d] = listing.checkIn.split('-').map(Number);
    const start = Date.UTC(y, m - 1, d) / DAY;
    return [start, start + listing.nights];
  }

  /** Bu otelin bu oda tipinden, ilanın gecelerinde başka anlaşmalara verilmiş oda sayısı. */
  #roomsTaken(hotelId, roomName, listing) {
    const [start, end] = this.#nights(listing);
    let taken = 0;
    for (const other of Object.values(this.#db.listings)) {
      if (other.status !== 'accepted' || other.id === listing.id) continue;
      const offer = this.#db.offers[other.acceptedOfferId];
      if (offer.hotelId !== hotelId || offer.roomName !== roomName) continue;
      const [s, e] = this.#nights(other);
      if (s < end && start < e) taken += roomCount(other);
    }
    return taken;
  }

  /** İlana uyan ve o gecelerde hâlâ yeterince boş olan oda tipleri. */
  availableRooms(hotel, listing) {
    return suitableRooms(hotel, listing).filter(
      (room) => (room.count ?? 1) - this.#roomsTaken(hotel.id, room.name, listing) >= roomCount(listing),
    );
  }

  /** Otel panelindeki "bu gece boş odalarınız" özeti. */
  #roomsTonight(hotel, nightDate) {
    const night = { id: null, checkIn: nightDate, nights: 1 };
    return hotel.rooms.map((room) => ({
      name: room.name,
      capacity: room.capacity,
      count: room.count ?? 1,
      free: Math.max(0, (room.count ?? 1) - this.#roomsTaken(hotel.id, room.name, night)),
    }));
  }

  #accept(listing, offer, at, { auto = false } = {}) {
    listing.status = 'accepted';
    listing.acceptedOfferId = offer.id;
    listing.autoAccepted = auto;
    listing.closedAt = at;
    this.#withdrawConflicts(offer, at);
  }

  /** Oda dolunca otelin aynı oda tipindeki, artık karşılanamayan teklifleri geri çekilir. */
  #withdrawConflicts(accepted, at) {
    const hotel = this.#db.hotels[accepted.hotelId];
    for (const offer of Object.values(this.#db.offers)) {
      if (!offer.active || offer.id === accepted.id || offer.hotelId !== hotel.id || offer.roomName !== accepted.roomName) continue;
      const listing = this.#db.listings[offer.listingId];
      if (listing.status !== 'active') continue;
      if (this.availableRooms(hotel, listing).some((room) => room.name === offer.roomName)) continue;
      offer.active = false;
      offer.withdrawnReason = 'room_taken';
      offer.withdrawnAt = at;
    }
  }

  // ---- Alıcı işlemleri ----

  createListing(buyerId, input = {}) {
    const now = this.clock();
    this.settle(now);
    const market = marketWindow(now, this.config);
    if (!market.open) {
      throw new MarketError(`Sistem her akşam ${this.config.marketOpens.replace(':', '.')}'de açılır.`, 403);
    }
    if (market.closesAt - now < this.config.minAuctionMinutes * MINUTE) {
      throw new MarketError('Bu gece için sistem kapanmak üzere, yeni ilan açılamıyor.', 403);
    }
    if (this.#listingsOf(buyerId).some((l) => LIVE_STATUSES.has(this.statusOf(l, now)))) {
      throw new MarketError('Zaten açık bir ilanınız var.', 409);
    }

    const fields = validateListingInput(input, this.config);
    const listing = {
      id: newId(),
      buyerId,
      createdAt: now,
      checkIn: market.nightDate,
      ...fields,
      biddingEndsAt: Math.min(now + fields.durationMinutes * MINUTE, market.closesAt),
      marketClosesAt: market.closesAt,
      status: 'active',
      acceptedOfferId: null,
      autoAccepted: false,
      closedAt: null,
    };
    this.#db.listings[listing.id] = listing;
    this.#commit({ type: 'listing_created', listingId: listing.id });
    return this.#buyerView(listing, now);
  }

  cancelListing(buyerId, listingId) {
    const now = this.clock();
    this.settle(now);
    const listing = this.#ownListing(buyerId, listingId);
    if (!LIVE_STATUSES.has(this.statusOf(listing, now))) {
      throw new MarketError('Bu ilan artık iptal edilemez.', 409);
    }
    listing.status = 'cancelled';
    listing.closedAt = now;
    this.#commit({ type: 'listing_cancelled', listingId });
    return this.#buyerView(listing, now);
  }

  acceptOffer(buyerId, listingId, offerId) {
    const now = this.clock();
    this.settle(now);
    const listing = this.#ownListing(buyerId, listingId);
    if (!LIVE_STATUSES.has(this.statusOf(listing, now))) {
      throw new MarketError('Bu ilanda artık teklif kabul edilemez.', 409);
    }
    const offer = this.#db.offers[offerId];
    if (!offer || offer.listingId !== listing.id || !offer.active) {
      throw new MarketError('Teklif bulunamadı.', 404);
    }
    if (!this.bestOffers(listing.id).has(offer.id)) {
      throw new MarketError('Yalnızca öne çıkan tekliflerden birini seçebilirsiniz.', 409);
    }
    const hotel = this.#db.hotels[offer.hotelId];
    if (!this.availableRooms(hotel, listing).some((room) => room.name === offer.roomName)) {
      offer.active = false;
      offer.withdrawnReason = 'room_taken';
      offer.withdrawnAt = now;
      this.#commit({ type: 'offer_withdrawn', listingId });
      throw new MarketError('Bu oda az önce başka bir misafire gitti. Öne çıkanlar yenilendi.', 409);
    }
    this.#accept(listing, offer, now);
    this.#commit({ type: 'offer_accepted', listingId });
    return this.#buyerView(listing, now);
  }

  buyerListings(buyerId) {
    const now = this.clock();
    this.settle(now);
    return this.#listingsOf(buyerId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map((l) => this.#buyerView(l, now));
  }

  /** Alt bilgideki iletişim formu. */
  saveContact(input = {}) {
    const message = {
      id: newId(),
      name: text(input.name, 'Ad', 60, { required: true }),
      reply: text(input.reply, 'E-posta ya da telefon', 80, { required: true }),
      message: text(input.message, 'Mesaj', 1000, { required: true }),
      createdAt: this.clock(),
    };
    this.#db.messages ??= {};
    this.#db.messages[message.id] = message;
    this.store.save();
    return { ok: true };
  }

  // ---- Otel işlemleri ----

  placeOffer(hotelId, listingId, input = {}) {
    const now = this.clock();
    this.settle(now);
    const hotel = this.#hotel(hotelId);
    const listing = this.#listing(listingId);
    if (this.statusOf(listing, now) !== 'open') {
      throw new MarketError('Bu ilanda teklif süresi doldu.', 409);
    }
    const { eligible, reasons } = checkEligibility(hotel, listing);
    if (!eligible) {
      throw new MarketError(`Bu ilana teklif veremezsiniz. ${reasons.join(' ')}`, 403);
    }

    const { price, roomName, note } = validateOfferInput(input);
    if (!suitableRooms(hotel, listing).some((room) => room.name === roomName)) {
      throw new MarketError('Seçilen oda tipi bu ilan için uygun değil.');
    }
    if (!this.availableRooms(hotel, listing).some((room) => room.name === roomName)) {
      throw new MarketError('Bu oda tipinden o gece için boş odanız kalmadı.', 409);
    }
    if (listing.maxBudget != null && price > listing.maxBudget) {
      throw new MarketError(`Alıcının bütçe üst sınırı ${formatTL(listing.maxBudget)}.`);
    }

    const offers = this.activeOffers(listing.id);
    const lowest = offers[0];
    if (lowest) {
      if (lowest.hotelId === hotelId) {
        throw new MarketError('En düşük teklif zaten sizde.', 409);
      }
      const ceiling = lowest.price - this.config.minDecrementTL;
      if (price > ceiling) {
        throw new MarketError(
          `Teklifiniz en fazla ${formatTL(ceiling)} olabilir (en düşük teklifin en az ${formatTL(this.config.minDecrementTL)} altı).`,
          409,
        );
      }
    }

    for (const previous of offers) {
      if (previous.hotelId === hotelId) previous.active = false;
    }
    const offer = { id: newId(), listingId, hotelId, price, roomName, note, createdAt: now, active: true };
    this.#db.offers[offer.id] = offer;

    const softClose = this.config.softCloseMinutes * MINUTE;
    if (listing.biddingEndsAt - now < softClose) {
      listing.biddingEndsAt = Math.min(now + softClose, listing.marketClosesAt);
    }

    this.#commit({ type: 'offer_placed', listingId });
    return this.#hotelView(listing, hotel, now);
  }

  hotelFeed(hotelId) {
    const now = this.clock();
    this.settle(now);
    const hotel = this.#hotel(hotelId);
    const listings = Object.values(this.#db.listings);

    // Boş odası kalmayan otel ilanı görmez; teklif veremeyeceği ilanla meşgul olmasın.
    const live = listings
      .filter(
        (l) =>
          LIVE_STATUSES.has(this.statusOf(l, now)) &&
          checkEligibility(hotel, l).eligible &&
          this.availableRooms(hotel, l).length > 0,
      )
      .sort((a, b) => a.biddingEndsAt - b.biddingEndsAt)
      .map((l) => this.#hotelView(l, hotel, now));

    const won = listings
      .filter((l) => l.status === 'accepted' && this.#db.offers[l.acceptedOfferId]?.hotelId === hotelId)
      .sort((a, b) => b.closedAt - a.closedAt)
      .slice(0, 20)
      .map((l) => this.#hotelView(l, hotel, now));

    const night = marketWindow(now, this.config).nightDate ?? isoDate(localParts(now));
    return { hotel: { ...privateHotel(hotel), roomsTonight: this.#roomsTonight(hotel, night) }, live, won };
  }

  // ---- Görünümler ----

  #buyerView(listing, now) {
    const bests = this.bestOffers(listing.id);
    const offerView = (offer) => ({
      id: offer.id,
      price: offer.price,
      roomName: offer.roomName,
      note: offer.note,
      createdAt: offer.createdAt,
      best: bests.get(offer.id) ?? [],
      hotel: publicHotel(this.#db.hotels[offer.hotelId]),
    });

    const accepted = listing.acceptedOfferId ? this.#db.offers[listing.acceptedOfferId] : null;
    return {
      ...publicListing(listing),
      status: this.statusOf(listing, now),
      acceptUntil: this.acceptUntil(listing),
      autoAccepted: Boolean(listing.autoAccepted),
      offers: this.activeOffers(listing.id).map(offerView),
      // Oda başka misafire gittiği için geri çekilen teklifler (otel adıyla).
      withdrawn: Object.values(this.#db.offers)
        .filter((o) => o.listingId === listing.id && o.withdrawnReason === 'room_taken')
        .map((o) => ({ hotelName: this.#db.hotels[o.hotelId].name, price: o.price })),
      acceptedOffer: accepted && {
        ...offerView(accepted),
        contact: hotelContact(this.#db.hotels[accepted.hotelId]),
      },
    };
  }

  #hotelView(listing, hotel, now) {
    const offers = this.activeOffers(listing.id);
    const lowest = offers[0] ?? null;
    const mine = offers.find((o) => o.hotelId === hotel.id) ?? null;
    const accepted = listing.acceptedOfferId ? this.#db.offers[listing.acceptedOfferId] : null;
    const won = accepted?.hotelId === hotel.id;
    const buyer = this.#db.buyers[listing.buyerId];

    return {
      ...publicListing(listing),
      status: this.statusOf(listing, now),
      acceptUntil: this.acceptUntil(listing),
      offerCount: offers.length,
      lowestPrice: lowest?.price ?? null,
      myOffer: mine && { price: mine.price, roomName: mine.roomName, note: mine.note },
      myBest: mine ? (this.bestOffers(listing.id).get(mine.id) ?? []) : [],
      iAmLowest: Boolean(lowest && lowest.hotelId === hotel.id),
      priceCeiling: lowest ? lowest.price - this.config.minDecrementTL : listing.maxBudget,
      rooms: this.availableRooms(hotel, listing).map((r) => r.name),
      won,
      autoAccepted: won && Boolean(listing.autoAccepted),
      acceptedOffer: won ? { price: accepted.price, roomName: accepted.roomName } : null,
      buyer: won ? { name: buyer.name, phone: buyer.phone } : null,
    };
  }

  // ---- Yardımcılar ----

  #listingsOf(buyerId) {
    return Object.values(this.#db.listings).filter((l) => l.buyerId === buyerId);
  }

  #listing(listingId) {
    const listing = this.#db.listings[listingId];
    if (!listing) throw new MarketError('İlan bulunamadı.', 404);
    return listing;
  }

  #ownListing(buyerId, listingId) {
    const listing = this.#listing(listingId);
    if (listing.buyerId !== buyerId) throw new MarketError('İlan bulunamadı.', 404);
    return listing;
  }

  #hotel(hotelId) {
    const hotel = this.#db.hotels[hotelId];
    if (!hotel) throw new MarketError('Otel bulunamadı.', 404);
    return hotel;
  }
}

// Alıcının kimliği ilanda yer almaz; oteller yalnızca kazandıklarında iletişim bilgisini görür.
const publicListing = (l) => ({
  id: l.id,
  createdAt: l.createdAt,
  checkIn: l.checkIn,
  nights: l.nights,
  arrivalTime: l.arrivalTime,
  group: l.group,
  adults: l.adults,
  children: l.children,
  roomCount: roomCount(l),
  regions: l.regions ?? [],
  hotelTypes: l.hotelTypes,
  amenities: l.amenities,
  maxBudget: l.maxBudget,
  note: l.note,
  biddingEndsAt: l.biddingEndsAt,
});

const publicHotel = (h) => ({
  id: h.id,
  name: h.name,
  type: h.type,
  region: h.region,
  amenities: h.amenities,
  description: h.description,
});

const privateHotel = (h) => ({
  ...publicHotel(h),
  acceptedGroups: h.acceptedGroups,
  rooms: h.rooms,
});

const hotelContact = (h) => ({ phone: h.phone, address: h.address });
