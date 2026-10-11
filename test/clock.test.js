import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localToEpoch, marketWindow, parseClock } from '../src/clock.js';
import { istanbul } from './helpers.js';

const rules = { marketOpens: '21:00', marketCloses: '00:00' };

test('localToEpoch İstanbul saatini UTC+3 olarak çevirir', () => {
  assert.equal(localToEpoch({ year: 2026, month: 10, day: 11 }, parseClock('21:00')), Date.UTC(2026, 9, 11, 18, 0));
});

test('21:00 öncesi pazar kapalı ve aynı gün 21:00 açılır', () => {
  const w = marketWindow(istanbul(2026, 10, 11, 20, 59), rules);
  assert.equal(w.open, false);
  assert.equal(w.opensAt, istanbul(2026, 10, 11, 21, 0));
});

test('21:00 ile gece yarısı arası pazar açık', () => {
  for (const [h, m] of [[21, 0], [22, 30], [23, 59]]) {
    const w = marketWindow(istanbul(2026, 10, 11, h, m), rules);
    assert.equal(w.open, true, `${h}:${m}`);
    assert.equal(w.nightDate, '2026-10-11');
    assert.equal(w.closesAt, istanbul(2026, 10, 12, 0, 0));
  }
});

test('gece yarısında pazar kapanır, sonraki açılış aynı gün 21:00', () => {
  const w = marketWindow(istanbul(2026, 10, 12, 0, 0), rules);
  assert.equal(w.open, false);
  assert.equal(w.opensAt, istanbul(2026, 10, 12, 21, 0));
});

test('kapanış gece yarısını aşarsa gece tarihi önceki gün olur', () => {
  const late = { marketOpens: '21:00', marketCloses: '02:00' };
  const w = marketWindow(istanbul(2026, 10, 12, 1, 30), late);
  assert.equal(w.open, true);
  assert.equal(w.nightDate, '2026-10-11');
  assert.equal(w.closesAt, istanbul(2026, 10, 12, 2, 0));
});

test('ay ve yıl sonunda tarih doğru ilerler', () => {
  const w = marketWindow(istanbul(2026, 12, 31, 23, 0), rules);
  assert.equal(w.nightDate, '2026-12-31');
  assert.equal(w.closesAt, istanbul(2027, 1, 1, 0, 0));
});
