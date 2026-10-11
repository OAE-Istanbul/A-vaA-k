import { AMENITIES, BEST_CATEGORIES, GUEST_GROUPS, HOTEL_TYPES, REGION_SIDES, REGIONS } from './catalog.js';
import { MarketError } from './errors.js';

function route(method, pattern, handler, role = null) {
  const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`);
  return { method, regex, handler, role };
}

/**
 * Taşıma katmanından bağımsız API. HTTP sunucusu (server.js) ve tarayıcıdaki
 * önizleme aynı yönlendirme ve yetki kurallarını kullanır.
 */
export function createApi({ market, auth, config }) {
  const meta = {
    appName: config.appName,
    catalog: {
      hotelTypes: HOTEL_TYPES,
      amenities: AMENITIES,
      guestGroups: GUEST_GROUPS,
      bestCategories: BEST_CATEGORIES,
      regions: REGIONS,
      regionSides: REGION_SIDES,
    },
    rules: {
      marketOpens: config.marketOpens,
      marketCloses: config.marketCloses,
      minDecrementTL: config.minDecrementTL,
      auctionDurations: config.auctionDurations,
      acceptGraceMinutes: config.acceptGraceMinutes,
      softCloseMinutes: config.softCloseMinutes,
      maxNights: config.maxNights,
      maxRooms: config.maxRooms,
    },
  };

  const routes = [
    route('GET', '/api/meta', () => meta),
    route('GET', '/api/market', () => market.marketStatus()),
    route('GET', '/api/hotels', () => market.hotelDirectory()),
    route('POST', '/api/session', ({ body }) => auth.login(body)),
    route('DELETE', '/api/session', ({ token }) => {
      auth.logout(token);
      return { ok: true };
    }),
    route('GET', '/api/me', ({ user }) => auth.profile(user), 'any'),
    route('GET', '/api/listings/mine', ({ user }) => market.buyerListings(user.id), 'buyer'),
    route('POST', '/api/listings', ({ user, body }) => market.createListing(user.id, body), 'buyer'),
    route('POST', '/api/listings/:id/cancel', ({ user, params }) => market.cancelListing(user.id, params.id), 'buyer'),
    route('POST', '/api/listings/:id/accept', ({ user, params, body }) => market.acceptOffer(user.id, params.id, body.offerId), 'buyer'),
    route('POST', '/api/listings/:id/offers', ({ user, params, body }) => market.placeOffer(user.id, params.id, body), 'hotel'),
    route('POST', '/api/contact', ({ body }) => market.saveContact(body)),
    route('GET', '/api/hotel/feed', ({ user }) => market.hotelFeed(user.id), 'hotel'),
  ];

  return {
    /** İsteği çalıştırır; sonucu döner ya da MarketError fırlatır. */
    handle({ method, path, token = null, body = {} }) {
      for (const r of routes) {
        const match = r.method === method && r.regex.exec(path);
        if (!match) continue;
        const user = auth.resolve(token);
        if (r.role) {
          if (!user) throw new MarketError('Giriş yapmanız gerekiyor.', 401);
          if (r.role !== 'any' && user.role !== r.role) throw new MarketError('Bu işlem için yetkiniz yok.', 403);
        }
        return r.handler({ user, token, body, params: match.groups ?? {} });
      }
      throw new MarketError('Bulunamadı.', 404);
    },
  };
}
