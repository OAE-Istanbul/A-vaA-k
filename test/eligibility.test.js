import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkEligibility, suitableRooms } from '../src/eligibility.js';
import { hotel, listingInput } from './helpers.js';

const listing = (overrides) => listingInput(overrides);

test('tüm koşulları sağlayan otel uygun', () => {
  assert.deepEqual(checkEligibility(hotel(), listing({ hotelTypes: ['bungalov'], amenities: ['jakuzi'] })), {
    eligible: true,
    reasons: [],
  });
});

test('tip tercihi boşsa her tip uygun', () => {
  assert.equal(checkEligibility(hotel({ type: 'pansiyon' }), listing()).eligible, true);
});

test('istenen tipte değilse uygun değil', () => {
  const result = checkEligibility(hotel({ type: 'otel' }), listing({ hotelTypes: ['bungalov', 'dag_evi'] }));
  assert.equal(result.eligible, false);
  assert.match(result.reasons[0], /Bungalov, Dağ evi/);
});

test('istenen olanak eksikse uygun değil', () => {
  const result = checkEligibility(hotel(), listing({ amenities: ['jakuzi', 'havuz'] }));
  assert.equal(result.eligible, false);
  assert.match(result.reasons[0], /Havuz/);
});

test('otel misafir profilini kabul etmiyorsa uygun değil', () => {
  const result = checkEligibility(hotel({ acceptedGroups: ['evli_cift'] }), listing({ group: 'cift' }));
  assert.equal(result.eligible, false);
  assert.match(result.reasons[0], /Çift/);
});

test('yeterli kapasitede oda yoksa uygun değil', () => {
  const family = listing({ group: 'aile', adults: 2, children: 3 });
  assert.equal(checkEligibility(hotel(), family).eligible, false);
  assert.deepEqual(suitableRooms(hotel(), listing({ group: 'aile', adults: 2, children: 1 })).map((r) => r.name), ['Aile odası']);
});

test('alıcı bölge seçtiyse yalnızca o bölgedeki oteller uygun', () => {
  const kadikoy = hotel({ region: 'kadikoy' });
  assert.equal(checkEligibility(kadikoy, listing({ regions: ['kadikoy', 'uskudar'] })).eligible, true);
  const result = checkEligibility(kadikoy, listing({ regions: ['beyoglu'] }));
  assert.equal(result.eligible, false);
  assert.match(result.reasons[0], /Beyoğlu ve Galata/);
  assert.equal(checkEligibility(kadikoy, listing({ regions: [] })).eligible, true);
});
