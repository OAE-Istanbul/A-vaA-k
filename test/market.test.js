import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MarketError } from '../src/errors.js';
import { hotel, istanbul, listingInput, MINUTE, setup } from './helpers.js';

const rejects = (fn, pattern) => assert.throws(fn, (err) => err instanceof MarketError && pattern.test(err.message));

test('18:00 öncesi ilan açılamaz', () => {
  const { market } = setup({ start: istanbul(2026, 10, 11, 17, 30) });
  rejects(() => market.createListing('u1', listingInput()), /18\.00'de açılır/);
});

test('ilan bu gecenin tarihiyle ve sabit 30 dakikalık teklif süresiyle açılır', () => {
  const start = istanbul(2026, 10, 11, 21, 10);
  const { market } = setup({ start });
  const listing = market.createListing('u1', listingInput());
  assert.equal(listing.checkIn, '2026-10-11');
  assert.equal(listing.status, 'open');
  assert.equal(listing.biddingEndsAt, start + 30 * MINUTE);
  // İstemci başka süre gönderse de 30 dakika uygulanır.
  const other = setup({ start }).market.createListing('u1', listingInput({ durationMinutes: 60 }));
  assert.equal(other.biddingEndsAt, start + 30 * MINUTE);
});

test('pazar gece yarısından sonra da açık, ilan o gecenin tarihini alır', () => {
  const { market } = setup({ start: istanbul(2026, 10, 12, 0, 40) });
  const listing = market.createListing('u1', listingInput());
  assert.equal(listing.checkIn, '2026-10-11');
});

test('ihale süresi pazar kapanışını (02:00) aşamaz', () => {
  const { market } = setup({ start: istanbul(2026, 10, 12, 1, 45) });
  const listing = market.createListing('u1', listingInput());
  assert.equal(listing.biddingEndsAt, istanbul(2026, 10, 12, 2, 0));
});

test('kapanışa 5 dakikadan az kala ilan açılamaz', () => {
  const { market } = setup({ start: istanbul(2026, 10, 12, 1, 57) });
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
  rejects(() => market.createListing('u1', listingInput({ roomCount: 2 })), /tek oda/);
  rejects(() => market.createListing('u1', listingInput({ group: 'aile', adults: 1, children: 2, roomCount: 2 })), /yetişkin/);
});

test('çok odalı ilan: oda tipinin adedi ve toplam kapasitesi yetmeli', () => {
  const { market } = setup();
  // 6 arkadaş, 3 oda: 3 adet 2 kişilik oda yeter, tek aile odası yetmez.
  const { id } = market.createListing('u1', listingInput({ group: 'arkadas', adults: 6, roomCount: 3 }));
  const [view] = market.hotelFeed('c').live;
  assert.equal(view.roomCount, 3);
  assert.deepEqual(view.rooms, ['Çift oda']);
  rejects(() => market.placeOffer('c', id, { price: 5000, roomName: 'Aile odası' }), /oda tipi/);
  assert.doesNotThrow(() => market.placeOffer('c', id, { price: 5000, roomName: 'Çift oda' }));

  // 4 oda istenirse 3 adet çift odası yetmez.
  const other = market.createListing('u2', listingInput({ group: 'arkadas', adults: 4, roomCount: 4 }));
  assert.equal(market.hotelFeed('c').live.some((l) => l.id === other.id), false);
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
  const { id, biddingEndsAt } = market.createListing('u1', listingInput());
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

test('alıcı seçim süresinde seçmezse en iyi fiyat otomatik kabul edilir', () => {
  const { market, clock } = setup();
  const events = [];
  market.subscribe((e) => events.push(e.type));
  const { id, biddingEndsAt } = market.createListing('u1', listingInput());
  market.placeOffer('a', id, { price: 2000, roomName: 'Çift oda' });
  market.placeOffer('b', id, { price: 1900, roomName: 'Çift oda' });

  clock.set(biddingEndsAt + 16 * MINUTE);
  assert.deepEqual(market.settle(), [id]);
  assert.equal(events.at(-1), 'auto_accepted');

  const [view] = market.buyerListings('u1');
  assert.equal(view.status, 'accepted');
  assert.equal(view.autoAccepted, true);
  assert.equal(view.acceptedOffer.hotel.id, 'b');
  assert.equal(market.hotelFeed('b').won[0].autoAccepted, true);
  rejects(() => market.acceptOffer('u1', id, view.offers[1].id), /kabul edilemez/);
});

test('öne çıkanlar: en iyi fiyat ve en çok olanak; alıcı yalnızca bunlardan seçer', () => {
  const base = { acceptedGroups: ['evli_cift'] };
  const { market } = setup({
    hotels: [
      hotel({ ...base, id: 'x', name: 'X', amenities: ['kahvalti', 'jakuzi', 'somine', 'havuz', 'wifi', 'otopark'] }),
      hotel({ ...base, id: 'y', name: 'Y', amenities: ['kahvalti', 'wifi'] }),
      hotel({ ...base, id: 'z', name: 'Z', amenities: ['kahvalti', 'wifi', 'klima'] }),
    ],
  });
  const { id } = market.createListing('u1', listingInput());
  market.placeOffer('x', id, { price: 3000, roomName: 'Çift oda' });
  market.placeOffer('y', id, { price: 2900, roomName: 'Çift oda' });
  market.placeOffer('z', id, { price: 2800, roomName: 'Çift oda' });

  const [view] = market.buyerListings('u1');
  const best = Object.fromEntries(view.offers.map((o) => [o.hotel.id, o.best]));
  assert.deepEqual(best, { z: ['price'], y: [], x: ['amenities'] });
  assert.deepEqual(market.hotelFeed('x').live[0].myBest, ['amenities']);

  const offerOf = (hotelId) => view.offers.find((o) => o.hotel.id === hotelId).id;
  rejects(() => market.acceptOffer('u1', id, offerOf('y')), /öne çıkan/);
  assert.equal(market.acceptOffer('u1', id, offerOf('x')).acceptedOffer.hotel.id, 'x');
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

// ---- Oda stoku ----

const singleRoomHotels = () => [
  hotel({ id: 'tiny', name: 'Tek Oda', rooms: [{ name: 'Tiny', capacity: 2, count: 1 }] }),
  hotel({ id: 'genis', name: 'Geniş Otel', rooms: [{ name: 'Çift oda', capacity: 2, count: 5 }] }),
];

test('seçim süresi 5 dakika', () => {
  const { market } = setup();
  const listing = market.createListing('u1', listingInput());
  assert.equal(listing.acceptUntil, listing.biddingEndsAt + 5 * MINUTE);
});

test('aynı oda iki ilanı kazanamaz: ilk kabul eden odayı alır, diğer teklif geri çekilir', () => {
  const { market, clock } = setup({ hotels: singleRoomHotels() });
  const a = market.createListing('u1', listingInput());
  clock.advance(1);
  const b = market.createListing('u2', listingInput());
  market.placeOffer('tiny', a.id, { price: 2000, roomName: 'Tiny' });
  market.placeOffer('tiny', b.id, { price: 2100, roomName: 'Tiny' });
  market.placeOffer('genis', a.id, { price: 1900, roomName: 'Çift oda' });

  // Sonra açılan ilanın sahibi önce davranırsa oda onun olur.
  const [viewB] = market.buyerListings('u2');
  market.acceptOffer('u2', b.id, viewB.offers[0].id);

  const [viewA] = market.buyerListings('u1');
  assert.deepEqual(viewA.offers.map((o) => o.hotel.id), ['genis']);
  assert.deepEqual(viewA.withdrawn, [{ hotelName: 'Tek Oda', price: 2000 }]);
  assert.equal(market.hotelFeed('tiny').live.length, 0);
  assert.deepEqual(market.hotelFeed('tiny').hotel.roomsTonight, [{ name: 'Tiny', capacity: 2, count: 1, free: 0 }]);
});

test('boş odası kalmayan otel yeni ilana teklif veremez', () => {
  const { market, clock } = setup({ hotels: singleRoomHotels() });
  const a = market.createListing('u1', listingInput());
  market.placeOffer('tiny', a.id, { price: 2000, roomName: 'Tiny' });
  market.acceptOffer('u1', a.id, market.buyerListings('u1')[0].offers[0].id);

  clock.advance(1);
  const b = market.createListing('u2', listingInput());
  rejects(() => market.placeOffer('tiny', b.id, { price: 1500, roomName: 'Tiny' }), /boş odanız kalmadı/);
});

test('otomatik kabulde önce açılan ilan odayı alır', () => {
  const { market, clock } = setup({ hotels: singleRoomHotels() });
  const a = market.createListing('u1', listingInput());
  clock.advance(1);
  const b = market.createListing('u2', listingInput());
  for (const listing of [a, b]) {
    market.placeOffer('genis', listing.id, { price: 1600, roomName: 'Çift oda' });
    market.placeOffer('tiny', listing.id, { price: 1500, roomName: 'Tiny' });
  }

  // İkisinde de en ucuz teklif tek odalı oteldeki aynı oda; önce açılan a alır.
  clock.set(b.biddingEndsAt + 6 * MINUTE);
  assert.deepEqual(market.settle(), [a.id, b.id]);
  assert.equal(market.buyerListings('u1')[0].acceptedOffer.hotel.id, 'tiny');
  assert.equal(market.buyerListings('u2')[0].acceptedOffer.hotel.id, 'genis');
});

test('çok gecelik konaklama ertesi geceyi de doldurur, tek gecelik doldurmaz', () => {
  const { market, clock } = setup({ hotels: singleRoomHotels() });
  const a = market.createListing('u1', listingInput({ nights: 2 }));
  market.placeOffer('tiny', a.id, { price: 3000, roomName: 'Tiny' });
  market.acceptOffer('u1', a.id, market.buyerListings('u1')[0].offers[0].id);

  clock.set(istanbul(2026, 10, 12, 21, 10));
  market.createListing('u2', listingInput());
  assert.equal(market.hotelFeed('tiny').live.length, 0);

  clock.set(istanbul(2026, 10, 13, 21, 10));
  market.createListing('u1', listingInput());
  assert.equal(market.hotelFeed('tiny').live.length, 1);
});

test('bölge seçimi doğrulanır ve otel akışına yansır', () => {
  const { market } = setup({
    hotels: [hotel({ id: 'avrupa', region: 'beyoglu' }), hotel({ id: 'asya', region: 'kadikoy' })],
  });
  rejects(() => market.createListing('u1', listingInput({ regions: ['mars'] })), /bölge/);
  const listing = market.createListing('u1', listingInput({ regions: ['kadikoy'] }));
  assert.deepEqual(listing.regions, ['kadikoy']);
  assert.equal(market.hotelFeed('asya').live.length, 1);
  assert.equal(market.hotelFeed('avrupa').live.length, 0);
});

test('kaçamak en fazla 2 gece', () => {
  const { market } = setup();
  rejects(() => market.createListing('u1', listingInput({ nights: 3 })), /Gece sayısı/);
  assert.equal(market.createListing('u1', listingInput({ nights: 2 })).nights, 2);
});
