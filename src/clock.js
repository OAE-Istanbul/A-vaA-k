export const TIME_ZONE = 'Europe/Istanbul';

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const pad = (n) => String(n).padStart(2, '0');

/** Epoch ms -> İstanbul yerel tarih/saat parçaları. */
export function localParts(ms) {
  const parts = {};
  for (const { type, value } of partsFormat.formatToParts(new Date(ms))) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return parts;
}

/** İstanbul yerel tarihi ({year, month, day}) + gün içindeki dakika -> epoch ms. */
export function localToEpoch(date, minuteOfDay) {
  const guess = Date.UTC(date.year, date.month - 1, date.day, 0, minuteOfDay);
  const p = localParts(guess);
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess;
  return guess - offset;
}

export function addDays(date, days) {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export const isoDate = (date) => `${date.year}-${pad(date.month)}-${pad(date.day)}`;

export function parseClock(hhmm) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm ?? '');
  if (!match) throw new Error(`Geçersiz saat: ${hhmm}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Pazarın şu anki durumu. Açıkken nightDate, konaklamanın başladığı gecenin tarihidir;
 * pencere gece yarısını aşarsa 00:30'da açılan ilan bir önceki günün gecesine aittir.
 */
export function marketWindow(now, { marketOpens, marketCloses }) {
  const openMinute = parseClock(marketOpens);
  const closeMinute = parseClock(marketCloses);
  const today = localParts(now);

  const windowStarting = (date) => ({
    nightDate: isoDate(date),
    opensAt: localToEpoch(date, openMinute),
    closesAt: localToEpoch(closeMinute > openMinute ? date : addDays(date, 1), closeMinute),
  });

  const tonight = windowStarting(today);
  for (const w of [windowStarting(addDays(today, -1)), tonight]) {
    if (now >= w.opensAt && now < w.closesAt) return { open: true, ...w };
  }
  const next = now < tonight.opensAt ? tonight : windowStarting(addDays(today, 1));
  return { open: false, nightDate: null, opensAt: next.opensAt, closesAt: next.closesAt };
}

/** DEMO_SAAT verilirse saat, bugün o saatten başlayıp gerçek zamanla ilerler. */
export function systemClock(demoTime) {
  if (!demoTime) return () => Date.now();
  const offset = localToEpoch(localParts(Date.now()), parseClock(demoTime)) - Date.now();
  return () => Date.now() + offset;
}
