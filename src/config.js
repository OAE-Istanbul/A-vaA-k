const env = process.env;

export const defaultConfig = Object.freeze({
  appName: env.UYGULAMA_ADI ?? 'Ağva',
  port: Number(env.PORT ?? 3000),
  // Pazar penceresi, İstanbul saatiyle. Kapanış açılıştan küçük ya da eşitse gece yarısını aşar.
  marketOpens: env.ACILIS_SAATI ?? '21:00',
  marketCloses: env.KAPANIS_SAATI ?? '00:00',
  // Yeni teklif, mevcut en düşük tekliften en az bu kadar düşük olmalı.
  minDecrementTL: Number(env.MIN_DUSUS_TL ?? 50),
  auctionDurations: [15, 30, 45, 60],
  // Pazarın kapanmasına bundan az kaldıysa yeni ilan açılmaz.
  minAuctionMinutes: 5,
  // Son dakikalarda gelen teklif süreyi bu kadar uzatır (son saniye kapışmasını önler).
  softCloseMinutes: Number(env.UZATMA_DK ?? 2),
  // Teklif süresi bittikten sonra alıcının seçim yapabileceği süre.
  acceptGraceMinutes: Number(env.KABUL_SURESI_DK ?? 15),
  maxNights: Number(env.MAKS_GECE ?? 3),
  dataFile: env.VERI_DOSYASI ?? 'data/db.json',
  demoTime: env.DEMO_SAAT ?? null,
});
