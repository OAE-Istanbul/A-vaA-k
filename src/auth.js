import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { MarketError } from './errors.js';
import { newId, newToken } from './ids.js';
import { normalizePhone, text } from './validation.js';

export function hashPin(pin) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(String(pin), salt, 32).toString('hex')}`;
}

export function verifyPin(pin, stored) {
  const [salt, hash] = stored.split(':');
  const actual = scryptSync(String(pin), Buffer.from(salt, 'hex'), 32);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

/**
 * Demo amaçlı oturum yönetimi. Alıcı ad + telefonla girer (SMS doğrulaması yok),
 * otel PIN ile girer. Canlıya çıkmadan önce gerçek kimlik doğrulama gerekir.
 */
export class Auth {
  constructor(store) {
    this.store = store;
  }

  get #db() {
    return this.store.data;
  }

  login(input = {}) {
    if (input.role === 'buyer') return this.#loginBuyer(input);
    if (input.role === 'hotel') return this.#loginHotel(input);
    throw new MarketError('Geçersiz giriş türü.');
  }

  #loginBuyer(input) {
    const name = text(input.name, 'Ad', 60, { required: true });
    const phone = normalizePhone(input.phone);
    let buyer = Object.values(this.#db.buyers).find((b) => b.phone === phone);
    if (!buyer) {
      buyer = { id: newId(), name, phone };
      this.#db.buyers[buyer.id] = buyer;
    }
    buyer.name = name;
    return this.#startSession('buyer', buyer.id);
  }

  #loginHotel(input) {
    const hotel = typeof input.hotelId === 'string' ? this.#db.hotels[input.hotelId] : undefined;
    if (!hotel || !verifyPin(input.pin ?? '', hotel.pinHash)) {
      throw new MarketError('Otel ya da PIN hatalı.', 401);
    }
    return this.#startSession('hotel', hotel.id);
  }

  #startSession(role, id) {
    const token = newToken();
    this.#db.sessions[token] = { role, id, createdAt: Date.now() };
    this.store.save();
    return { token, ...this.profile({ role, id }) };
  }

  resolve(token) {
    const session = token ? this.#db.sessions[token] : undefined;
    return session ? { role: session.role, id: session.id } : null;
  }

  logout(token) {
    if (token && this.#db.sessions[token]) {
      delete this.#db.sessions[token];
      this.store.save();
    }
  }

  profile({ role, id }) {
    if (role === 'buyer') {
      const { name, phone } = this.#db.buyers[id];
      return { role, id, name, phone };
    }
    const { name, type } = this.#db.hotels[id];
    return { role, id, name, type };
  }
}
