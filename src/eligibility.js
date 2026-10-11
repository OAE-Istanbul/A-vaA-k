import { AMENITIES, GUEST_GROUPS, HOTEL_TYPES } from './catalog.js';

export const guestCount = (listing) => listing.adults + listing.children;

export const suitableRooms = (hotel, listing) =>
  hotel.rooms.filter((room) => room.capacity >= guestCount(listing));

/**
 * Bir otel ilana teklif verebilir mi? Alıcının otel tipi ve olanak tercihleri,
 * otelin kabul ettiği misafir profilleri ve oda kapasitesi birlikte sağlanmalı.
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
    reasons.push(`${guestCount(listing)} kişilik odanız yok.`);
  }
  return { eligible: reasons.length === 0, reasons };
}
