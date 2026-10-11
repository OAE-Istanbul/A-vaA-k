import { AMENITIES, GUEST_GROUPS, HOTEL_TYPES, REGIONS } from './catalog.js';
import { MarketError } from './errors.js';

function integer(value, label, min, max) {
  const n =
    typeof value === 'number' ? value
    : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value)
    : NaN;
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new MarketError(`${label} ${min} ile ${max} arasında bir tam sayı olmalı.`);
  }
  return n;
}

function oneOf(value, options, label) {
  if (typeof value !== 'string' || !Object.hasOwn(options, value)) {
    throw new MarketError(`Geçersiz ${label}.`);
  }
  return value;
}

function subsetOf(values, options, label) {
  if (values == null) return [];
  if (!Array.isArray(values) || values.some((v) => typeof v !== 'string' || !Object.hasOwn(options, v))) {
    throw new MarketError(`Geçersiz ${label} seçimi.`);
  }
  return [...new Set(values)];
}

export function text(value, label, maxLength, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) throw new MarketError(`${label} boş olamaz.`);
    return '';
  }
  if (typeof value !== 'string') throw new MarketError(`Geçersiz ${label}.`);
  const trimmed = value.trim();
  if (required && trimmed === '') throw new MarketError(`${label} boş olamaz.`);
  if (trimmed.length > maxLength) throw new MarketError(`${label} en fazla ${maxLength} karakter olabilir.`);
  return trimmed;
}

function clockTime(value, label) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new MarketError(`${label} SS:DD biçiminde olmalı.`);
  }
  return value;
}

const COUPLE_RULE = {
  adults: [2, 2],
  children: [0, 0],
  singleRoom: true,
  message: 'Çift seçeneğinde 2 yetişkin olur. Çocukla geliyorsanız "Aile" seçin.',
};

const GROUP_RULES = {
  evli_cift: COUPLE_RULE,
  cift: COUPLE_RULE,
  tek: { adults: [1, 1], children: [0, 0], singleRoom: true, message: 'Tek kişi seçeneğinde 1 yetişkin olur.' },
  aile: { adults: [1, 8], children: [0, 6], minTotal: 2, message: 'Aile en az 2 kişi olmalı.' },
  arkadas: { adults: [2, 8], children: [0, 6], message: 'Arkadaş grubunda en az 2 yetişkin olmalı.' },
};

function checkGroup(group, adults, children, roomCount) {
  const rule = GROUP_RULES[group];
  const inRange = (n, [min, max]) => n >= min && n <= max;
  if (!inRange(adults, rule.adults) || !inRange(children, rule.children) || adults + children < (rule.minTotal ?? 0)) {
    throw new MarketError(rule.message);
  }
  if (rule.singleRoom && roomCount > 1) throw new MarketError('Çift ve tek kişi ilanları tek oda içindir.');
  if (roomCount > adults) throw new MarketError('Her odada en az bir yetişkin kalmalı.');
}

export function validateListingInput(input, config) {
  const group = oneOf(input.group, GUEST_GROUPS, 'misafir profili');
  const adults = integer(input.adults, 'Yetişkin sayısı', 1, 8);
  const children = integer(input.children ?? 0, 'Çocuk sayısı', 0, 6);
  const roomCount = integer(input.roomCount ?? 1, 'Oda sayısı', 1, config.maxRooms);
  checkGroup(group, adults, children, roomCount);

  const noBudget = input.maxBudget == null || input.maxBudget === '';
  return {
    group,
    adults,
    children,
    roomCount,
    nights: integer(input.nights ?? 1, 'Gece sayısı', 1, config.maxNights),
    arrivalTime: clockTime(input.arrivalTime, 'Varış saati'),
    regions: subsetOf(input.regions, REGIONS, 'bölge'),
    hotelTypes: subsetOf(input.hotelTypes, HOTEL_TYPES, 'otel tipi'),
    amenities: subsetOf(input.amenities, AMENITIES, 'olanak'),
    maxBudget: noBudget ? null : integer(input.maxBudget, 'Bütçe üst sınırı', 1, 1_000_000),
    // Süre sabittir; istemcinin gönderdiği değer dikkate alınmaz.
    durationMinutes: config.auctionMinutes,
    note: text(input.note, 'Not', 500),
  };
}

export function validateOfferInput(input) {
  return {
    price: integer(input.price, 'Fiyat', 1, 1_000_000),
    roomName: text(input.roomName, 'Oda', 80, { required: true }),
    note: text(input.note, 'Not', 300),
  };
}

/** Türkiye cep numarasını 05XXXXXXXXX biçimine getirir. */
export function normalizePhone(value) {
  let digits = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  if (digits.length === 12 && digits.startsWith('90')) digits = digits.slice(2);
  if (digits.length === 10) digits = `0${digits}`;
  if (!/^05\d{9}$/.test(digits)) throw new MarketError('Geçerli bir cep telefonu girin (05XX XXX XX XX).');
  return digits;
}
