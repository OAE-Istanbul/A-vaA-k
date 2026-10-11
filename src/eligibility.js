import { AMENITIES, GUEST_GROUPS, HOTEL_TYPES } from './catalog.js';

export const guestCount = (listing) => listing.adults + listing.children;

// Eski kayıtlarda oda sayısı ve oda adedi yoksa 1 kabul edilir.
export const roomCount = (listing) => listing.roomCount ?? 1;

/** Alıcının istediği sayıda odası olan ve tüm misafirleri sığdıran oda tipleri. */
export const suitableRooms = (hotel, listing) =>
  hotel.rooms.filter(
    (room) => (room.count ?? 1) >= roomCount(listing) && room.capacity * roomCount(listing) >= guestCount(listing),
  );

/**
 * Bir otel ilana teklif verebilir mi? Alıcının otel tipi ve olanak tercihleri,
 * otelin kabul ettiği misafir profilleri, oda sayısı ve kapasitesi birlikte sağlanmalı.
 */
export function checkEligibility(hotel, listing) {
  const reasons = [];
  if (listing.hotelTypes.length > 0 && !listing.hotelTypes.includes(hotel.type)) {
    reasons.push(`Alıcı ${listing.hotelTypes.map((t) => HOTEL_TYPES[t]).join(', ')} arıyor.`);
  }
  const missing = listing.amenities.filter((a) => !hotel.amenities.includes(a));
  if (missing.length > 0) {
    reasons.push(`Eksik olanak: ${missing.map((a) => AMENITIES[a]).join(', ')}.`);
  }
  if (!hotel.acceptedGroups.includes(listing.group)) {
    reasons.push(`${GUEST_GROUPS[listing.group]} profilini kabul etmiyorsunuz.`);
  }
  if (suitableRooms(hotel, listing).length === 0) {
    const rooms = roomCount(listing);
    reasons.push(
      rooms > 1
        ? `${guestCount(listing)} kişiyi ${rooms} odada ağırlayacak oda tipiniz yok.`
        : `${guestCount(listing)} kişilik odanız yok.`,
    );
  }
  return { eligible: reasons.length === 0, reasons };
}
