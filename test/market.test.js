import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MarketError } from '../src/errors.js';
import { istanbul, listingInput, MINUTE, setup } from './helpers.js';

const rejects = (fn, pattern) => assert.throws(fn, (err) => err instanceof MarketError && pattern.test(err.message));

test('21:00 öncesi ilan açılamaz', () => {
  const { market } = setup({ start: istanbul(2026, 10, 11, 20, 30) });
  rejects(() => market.createListing('u1', listingInput()), /21:00'de açılır/);
});

test('ilan bu gecenin tarihiyle ve ihale süresiyle açılır', () => {
  const start = istanbul(2026, 10, 11, 21, 10);
  const { market } = setup({ start });
  const listing = market.createListing('u1', listingInput({ durationMinutes: 30 }));
  assert.equal(listing.checkIn, '2026-10-11');
  assert.equal(listing.status, 'open');
  assert.equal(listing.biddingEndsAt, start + 30 * MINUTE);
});

test('ihale süresi pazar kapanışını aşamaz', () => {
  const { market } = setup({ start: istanbul(2026, 10, 11, 23, 45) });
  const listing = market.createListing('u1', listingInput({ durationMinutes: 60 }));
  assert.equal(listing.biddingEndsAt, istanbul(2026, 10, 12, 0, 0));
});

test('kapanışa 5 dakikadan az kala ilan açılamaz', () => {
  const { market } = setup({ start: istanbul(2026, 10, 11, 23, 57) });
  rejects(() => market.createListing('u1', listingInput()), /kapanmak üzere/);
});

test('alıcının aynı anda tek açık ilanı olur', () => {
  const { market } = setup();
  market.createListing('u1', listingInput());
  rejects(() => market.createListing('u1', listingInput()), /açık bir ilanınız/);
  assert.doesNotThrow(() => market.createListing('u2', listingInput()));
});

test('profil ve kişi sayısı tutarlı olmalı', () => {
  const { market } = setup();
  rejects(() => market.createListing('u1', listingInput({ group: 'evli_cift', adults: 2, children: 1 })), /Aile/);
  rejects(() => market.createListing('u1', listingInput({ durationMinutes: 20 })), /İhale süresi/);
});

test('ters açık artırma: her teklif en düşüğün en az 50 TL altında olmalı', () => {
  const { market } = setup();
  const { id } = market.createListing('u1', listingInput());

  market.placeOffer('a', id, { price: 2000, roomName: 'Çift oda' });
  rejects(() => market.placeOffer('b', id, { price: 1960, roomName: 'Çift oda' }), /en fazla 1\.950 TL/);
  market.placeOffer('b', id, { price: 1900, roomName: 'Çift oda' });
  rejects(() => market.placeOffer('b', id, { price: 1800, roomName: 'Çift oda' }), /zaten sizde/);
  market.placeOffer('a', id, { price: 1850, roomName: 'Çift oda', note: 'Geç çıkış hediye' });

  const [view] = market.buyerListings('u1');
  assert.deepEqual(view.offers.map((o) => [o.hotel.id, o.price]), [['a', 1850], ['b', 1900]]);
  assert.equal(view.offers[0].note, 'Geç çıkış hediye');
});

test('uygun olmayan otel ilanı görmez ve teklif veremez', () => {
  const { market } = setup();
  const { id } = market.createListing('u1', listingInput({ group: 'evli_cift' }));
  assert.equal(market.hotelFeed('c').live.length, 0);
  rejects(() => market.placeOffer('c', id, { price: 1000, roomName: 'Çift oda' }), /Evli çift/);
});

test('oda kapasitesi ve bütçe sınırı uygulanır', () => {
  const { market } = setup();
  const { id } = market.createListing('u1', listingInput({ group: 'aile', adults: 2, children: 1, maxBudget: 3000 }));
  rejects(() => market.placeOffer('a', id, { price: 2500, roomName: 'Çift oda' }), /oda/);
  rejects(() => market.placeOffer('a', id, { price: 3100, roomName: 'Aile odası' }), /3\.000 TL/);
  assert.doesNotThrow(() => market.placeOffer('a', id, { price: 2900, roomName: 'Aile odası' }));
});

test('otel en düşük fiyatı görür, alıcının kimliğini görmez', () => {
  const { market } = setup();
  const { id } = market.createListing('u1', listingInput());
  market.placeOffer('a', id, { price: 2000, roomName: 'Çift oda' });

  const [forB] = market.hotelFeed('b').live;
  assert.equal(forB.lowestPrice, 2000);
  assert.equal(forB.priceCeiling, 1950);
  assert.equal(forB.offerCount, 1);
  assert.equal(forB.buyer, null);
  assert.equal(JSON.stringify(forB).includes('05550000000'), false);
  assert.equal(market.hotelFeed('a').live[0].iAmLowest, true);
});

test('son dakikada gelen teklif süreyi uzatır', () => {
  const { market, clock } = setup();
  const { id, biddingEndsAt } = market.createListing('u1', listingInput({ durationMinutes: 15 }));
  clock.set(biddingEndsAt - 30_000);
  market.placeOffer('a', id, { price: 2000, roomName: 'Çift oda' });
  const [view] = market.buyerListings('u1');
  assert.equal(view.biddingEndsAt, clock() + 2 * MINUTE);
});

test('süre bitince teklif alınmaz, alıcı kabul süresi içinde seçer', () => {
  const { market, clock } = setup();
  const { id, biddingEndsAt } = market.createListing('u1', listingInput());
  const { lowestPrice } = market.placeOffer('a', id, { price: 2000, roomName: 'Çift oda' });
  assert.equal(lowestPrice, 2000);

  clock.set(biddingEndsAt + MINUTE);
  rejects(() => market.placeOffer('b', id, { price: 1500, roomName: 'Çift oda' }), /süresi doldu/);
  const [waiting] = market.buyerListings('u1');
  assert.equal(waiting.status, 'awaiting_choice');

  const accepted = market.acceptOffer('u1', id, waiting.offers[0].id);
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.acceptedOffer.contact.phone, '0555 000 00 01');

  const { won } = market.hotelFeed('a');
  assert.equal(won.length, 1);
  assert.deepEqual(won[0].buyer, { name: 'Ayşe', phone: '05550000000' });
  assert.deepEqual(won[0].acceptedOffer, { price: 2000, roomName: 'Çift oda' });
  assert.equal(market.hotelFeed('b').won.length, 0);
});

test('kabul süresi geçen ilan sona erer', () => {
  const { market, clock } = setup();
  const { id, biddingEndsAt } = market.createListing('u1', listingInput());
  market.placeOffer('a', id, { price: 2000, roomName: 'Çift oda' });
  clock.set(biddingEndsAt + 16 * MINUTE);
  const [view] = market.buyerListings('u1');
  assert.equal(view.status, 'expired');
  rejects(() => market.acceptOffer('u1', id, view.offers[0].id), /kabul edilemez/);
});

test('teklifsiz ilan süre bitince sona erer ve yenisi açılabilir', () => {
  const { market, clock } = setup();
  const { biddingEndsAt } = market.createListing('u1', listingInput());
  clock.set(biddingEndsAt);
  assert.equal(market.buyerListings('u1')[0].status, 'expired');
  assert.doesNotThrow(() => market.createListing('u1', listingInput()));
});

test('alıcı ilanını iptal edebilir, başkasının ilanına dokunamaz', () => {
  const { market } = setup();
  const { id } = market.createListing('u1', listingInput());
  rejects(() => market.cancelListing('u2', id), /bulunamadı/);
  assert.equal(market.cancelListing('u1', id).status, 'cancelled');
  rejects(() => market.placeOffer('a', id, { price: 1000, roomName: 'Çift oda' }), /süresi doldu/);
});
