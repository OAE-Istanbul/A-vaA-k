import { hashPin } from './pin.js';
import { SAMPLE_HOTELS } from './sample-hotels.js';

export const DEMO_PIN = '1234';

/** Hiç otel yoksa örnek otelleri ekler (hepsinin PIN'i DEMO_PIN). */
export function seedHotels(store) {
  if (Object.keys(store.data.hotels).length > 0) return;
  for (const hotel of SAMPLE_HOTELS) {
    store.data.hotels[hotel.id] = { ...hotel, pinHash: hashPin(DEMO_PIN) };
  }
  store.save();
}
