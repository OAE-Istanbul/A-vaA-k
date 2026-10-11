export const HOTEL_TYPES = Object.freeze({
  butik_otel: 'Butik otel',
  bungalov: 'Bungalov',
  pansiyon: 'Pansiyon',
  dag_evi: 'Dağ evi',
  tiny_house: 'Tiny house',
  otel: 'Otel',
});

export const AMENITIES = Object.freeze({
  kahvalti: 'Kahvaltı dahil',
  jakuzi: 'Jakuzi',
  somine: 'Şömine',
  havuz: 'Havuz',
  dere_manzarasi: 'Dere manzarası',
  bogaz_manzarasi: 'Boğaz manzarası',
  deniz_manzarasi: 'Deniz manzarası',
  ozel_bahce: 'Özel bahçe',
  mangal: 'Mangal',
  otopark: 'Otopark',
  evcil_hayvan: 'Evcil hayvan kabul',
  klima: 'Klima',
  wifi: 'Wi-Fi',
});

export const GUEST_GROUPS = Object.freeze({
  evli_cift: 'Evli çift',
  cift: 'Çift',
  aile: 'Aile',
  arkadas: 'Arkadaş grubu',
  tek: 'Tek kişi',
});

// Süre sonunda alıcıya sunulan "en iyiler". Alıcı bunlardan birini seçer.
export const BEST_CATEGORIES = Object.freeze({
  price: 'En iyi fiyat',
  amenities: 'En çok olanak',
});

// İstanbul'un bölgeleri. Alıcı bir ya da birkaç bölge seçer; seçmezse tüm İstanbul.
export const REGIONS = Object.freeze({
  fatih: 'Sultanahmet ve Fatih',
  beyoglu: 'Beyoğlu ve Galata',
  besiktas: 'Beşiktaş ve Ortaköy',
  sisli: 'Şişli ve Nişantaşı',
  sariyer: 'Sarıyer',
  kadikoy: 'Kadıköy ve Moda',
  uskudar: 'Üsküdar',
  beykoz: 'Beykoz',
  adalar: 'Adalar',
  sile: 'Şile ve Ağva',
});

export const REGION_SIDES = Object.freeze({
  avrupa: { label: 'Avrupa Yakası', regions: ['fatih', 'beyoglu', 'besiktas', 'sisli', 'sariyer'] },
  asya: { label: 'Anadolu Yakası', regions: ['kadikoy', 'uskudar', 'beykoz', 'sile'] },
  adalar: { label: 'Adalar', regions: ['adalar'] },
});
