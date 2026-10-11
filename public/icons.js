// Elle çizilmiş ikonlar. 24x24, yuvarlak uçlu çizgi; renk metinden gelir.
// "f" sınıfı dolu şekil demektir.

const PATHS = {
  // ---- Olanaklar ----
  // İnce belli çay bardağı ve tabağı
  kahvalti:
    '<path d="M8 5c0 3.5 2 4.5 2 7s-1.5 3.5-1.5 5.5Q8.5 19 10 19h4q1.5 0 1.5-1.5c0-2-1.5-3-1.5-5.5s2-3.5 2-7"/><path d="M8.7 8h6.6"/><path d="M5.5 21.2q6.5 1.4 13 0"/><path d="M12 1.8q1 .8 0 1.8"/>',
  jakuzi:
    '<path d="M3.5 12h17v2.5a4.5 4.5 0 0 1-4.5 4.5H8a4.5 4.5 0 0 1-4.5-4.5z"/><path d="M7 19l-1 2M17 19l1 2"/><circle cx="8" cy="8.2" r="1.2"/><circle cx="11.6" cy="5.4" r="1.5"/><circle cx="15.3" cy="8.4" r="1"/>',
  somine:
    '<path d="M4 21V9.5Q4 5 8.5 5h7Q20 5 20 9.5V21"/><path d="M2.5 21h19"/><path d="M12 19c-2.2 0-3-1.6-3-2.9 0-1.8 1.6-2.6 1.9-4.6 1.4.9 1.7 2 1.6 2.9.7-.4 1-1.1 1.1-1.8 1 .8 1.4 2 1.4 3.2 0 1.8-1.3 3.2-3 3.2z"/>',
  havuz:
    '<path d="M8 13.5V4.5Q8 3 6.5 3M15 13.5V4.5Q15 3 13.5 3"/><path d="M8 6.8h7M8 10.2h7"/><path d="M3 16.5q2.25-1.6 4.5 0t4.5 0 4.5 0 4.5 0M3 20q2.25-1.6 4.5 0t4.5 0 4.5 0 4.5 0"/>',
  dere_manzarasi:
    '<path d="M6 20.5V10M9.6 20.5v-7.5"/><ellipse cx="6" cy="7.6" rx="1.1" ry="2.3"/><ellipse cx="9.6" cy="10.6" rx="1" ry="1.9"/><path d="M6 15.5q-2.6-.8-3.5-3.4"/><path d="M12 16q2-1.4 4 0t4 0M13.5 19.6q1.7-1.2 3.4 0t3.4 0"/>',
  deniz_manzarasi:
    '<path d="M2.5 14.5h19"/><path d="M8 14.5a4 4 0 0 1 8 0"/><path d="M12 6.8v1.6M6.6 9.2l1 1M17.4 9.2l-1 1"/><path d="M4 18.3q2-1.3 4 0t4 0 4 0 4 0"/>',
  ozel_bahce:
    '<path d="M12 21V11"/><path d="M12 13.4C12 10 9.2 8 5.6 8.3c0 3.4 2.8 5.3 6.4 5.1z"/><path d="M12 11c0-3.8 2.9-6.3 6.8-6 0 3.9-2.9 6.2-6.8 6z"/><path d="M7 21h10"/>',
  mangal:
    '<path d="M4 11h16l-1.6 5H5.6z"/><path d="M6.6 16 5 21M17.4 16 19 21"/><path d="M5.5 8.6h13"/><path d="M9.5 6.4q-1-1.2 0-2.4t0-2.4M14.5 6.4q-1-1.2 0-2.4t0-2.4"/>',
  otopark: '<rect x="3.5" y="3.5" width="17" height="17" rx="5.5"/><path d="M10 17V7.5h3.1a3 3 0 0 1 0 6H10"/>',
  evcil_hayvan:
    '<path d="M12 20.2c-3 0-5-1.6-5-3.6 0-2.3 2.4-4.4 5-4.4s5 2.1 5 4.4c0 2-2 3.6-5 3.6z"/><ellipse cx="5.6" cy="11" rx="1.6" ry="2.1" transform="rotate(-20 5.6 11)"/><ellipse cx="9.4" cy="6.9" rx="1.6" ry="2.2" transform="rotate(-8 9.4 6.9)"/><ellipse cx="14.6" cy="6.9" rx="1.6" ry="2.2" transform="rotate(8 14.6 6.9)"/><ellipse cx="18.4" cy="11" rx="1.6" ry="2.1" transform="rotate(20 18.4 11)"/>',
  klima: '<path d="M3 9h11a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 13h15a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 17h7"/>',
  wifi:
    '<path d="M4.5 10a10.6 10.6 0 0 1 15 0M7.5 13.2a6.4 6.4 0 0 1 9 0M10.4 16.3a2.3 2.3 0 0 1 3.2 0"/><circle class="f" cx="12" cy="19.4" r="1"/>',

  // ---- Otel tipleri ----
  butik_otel:
    '<path d="M5 21V9L12 4.5 19 9v12"/><circle cx="12" cy="10.2" r="1.8"/><path d="M10 21v-3.5a2 2 0 0 1 4 0V21"/><path d="M3 21h18"/>',
  bungalov: '<path d="M3.5 20 12 4.5 20.5 20"/><path d="M8.5 20v-4a3.5 3.5 0 0 1 7 0v4"/><path d="M2 20h20"/>',
  pansiyon:
    '<path d="M4 11.2 12 5l8 6.2"/><path d="M6 10v10h12V10"/><path d="M9.2 13h5.6v3.4H9.2z"/><path d="M8.8 18.4h6.4"/><path d="M15.6 6.8V4.3h2v4"/>',
  dag_evi:
    '<path d="M3 20v-7l5-4.5 5 4.5v7"/><path d="M7 20v-3h2v3"/><path d="M18 20v-4.6"/><path d="M18 15.4c-2.4 0-3.6-1.6-3.6-3.4 0-1.5 1-2.4 1.8-2.6 0-1.8 1-3 1.8-3s1.8 1.2 1.8 3c.8.2 1.8 1.1 1.8 2.6 0 1.8-1.2 3.4-3.6 3.4z"/><path d="M2 20h20"/>',
  tiny_house:
    '<path d="M6.5 16v-6L12 6l5.5 4v6z"/><path d="M10.6 11.2h2.8v2.6h-2.8z"/><path d="M4.5 16h15"/><circle cx="8.6" cy="18.6" r="1.6"/><circle cx="15.4" cy="18.6" r="1.6"/>',
  otel:
    '<path d="M6 21V5q0-1.5 1.5-1.5h9Q18 3.5 18 5v16"/><path d="M9 7.5h1.6M13.4 7.5H15M9 11h1.6M13.4 11H15M9 14.5h1.6M13.4 14.5H15"/><path d="M11 21v-3h2v3"/><path d="M3.5 21h17"/>',

  // ---- Misafir profilleri ----
  evli_cift: '<circle cx="9.3" cy="13.6" r="4.6"/><circle cx="14.7" cy="13.6" r="4.6"/><path d="M14.7 3.6v2.6M13.4 4.9H16"/>',
  cift: '<circle cx="8.4" cy="8" r="2.3"/><circle cx="15.6" cy="8" r="2.3"/><path d="M4.4 19a4 4 0 0 1 8 0M11.6 19a4 4 0 0 1 8 0"/>',
  aile:
    '<circle cx="7" cy="7.4" r="2.1"/><circle cx="17" cy="7.4" r="2.1"/><circle cx="12" cy="11.6" r="1.6"/><path d="M3.2 19a3.8 3.8 0 0 1 7.6 0M13.2 19a3.8 3.8 0 0 1 7.6 0M9.5 19.6a2.5 2.5 0 0 1 5 0"/>',
  arkadas:
    '<circle cx="6" cy="9" r="1.9"/><circle cx="12" cy="7" r="2.1"/><circle cx="18" cy="9" r="1.9"/><path d="M2.6 19a3.4 3.4 0 0 1 6.8 0M8 18a4 4 0 0 1 8 0M14.6 19a3.4 3.4 0 0 1 6.8 0"/>',
  tek: '<circle cx="12" cy="7.6" r="2.6"/><path d="M6.5 20a5.5 5.5 0 0 1 11 0"/>',

  // ---- Öne çıkan kategoriler ----
  // Aşağı akan dere: fiyat düştü
  price: '<path d="M3 6.5q4.5 0 6.5 4t6.5 4h4.5"/><path d="M17.6 12 21 14.5l-3.4 2.5"/>',
  // Yapraklı dal: en çok olanak
  amenities:
    '<path d="M12 21V5.5"/><path d="M12 16.4c-3.4 0-5.6-1.6-6.2-4.2 3 .1 5.2 1.6 6.2 4.2zM12 12.6c3.4 0 5.6-1.6 6.2-4.2-3 .1-5.2 1.6-6.2 4.2zM12 9c-2.6 0-4.3-1.3-4.8-3.3 2.3 0 4 1.3 4.8 3.3z"/>',
  // Üst üste dengede duran dere taşları: fiyat/performans
  value:
    '<ellipse cx="12" cy="18.6" rx="6.6" ry="2.3"/><ellipse cx="11.4" cy="13.7" rx="4.6" ry="2"/><ellipse cx="12.4" cy="9.4" rx="3.2" ry="1.6"/><ellipse cx="11.8" cy="5.9" rx="1.8" ry="1.1"/>',

  // ---- Kişiler ve oda (dolu figürler) ----
  yetiskin:
    '<path class="f" d="M12 2.4c1.9 0 3.3 1.5 3.3 3.3 0 1.1-.5 2-1.3 2.6 2.6.4 5.4 1.2 6.4 2.4.8 1 .3 2.4-1 2.4-1.2 0-2.5-.3-3.5-.6.5 2.2 2.1 4.6 3.4 6.6.6 1-.1 2.2-1.2 2.2h-3c-.7 0-1.2-.4-1.5-1l-1.6-3.4-1.6 3.4c-.3.6-.8 1-1.5 1H6.9c-1.1 0-1.8-1.2-1.2-2.2 1.3-2 2.9-4.4 3.4-6.6-1 .3-2.3.6-3.5.6-1.3 0-1.8-1.4-1-2.4 1-1.2 3.8-2 6.4-2.4-.8-.6-1.3-1.5-1.3-2.6 0-1.8 1.4-3.3 3.3-3.3z"/>',
  cocuk:
    '<circle class="f" cx="12" cy="7" r="3.6"/><path class="f" d="M12 11.2c3.2 0 5.6 1.6 5.6 3.4 0 1-.8 1.5-1.8 1.3l-.9-.2.9 3.4c.3 1.1-.5 2.1-1.6 2.1h-4.4c-1.1 0-1.9-1-1.6-2.1l.9-3.4-.9.2c-1 .2-1.8-.3-1.8-1.3 0-1.8 2.4-3.4 5.6-3.4z"/>',
  kapi: '<path d="M6.5 21V5.6q0-2.1 2.1-2.1h6.8q2.1 0 2.1 2.1V21"/><path d="M4 21h16"/><circle class="f" cx="14.4" cy="12.6" r="1"/>',

  // ---- Arayüz ----
  gemi: '<path d="M2.5 15.5h19l-3.2 4.2q-.5.8-1.5.8H7.2q-1 0-1.5-.8z"/><path d="M12 3.5v12M12 3.5l6.5 9.6H12M12 6.4 7 13.1h5"/>',
  yaprak: '<path class="f" d="M12 2.5c4.6 3.1 6.2 7.2 4.1 12.3-1 2.6-3 4.6-4.1 6.2-1.1-1.6-3.1-3.6-4.1-6.2C5.8 9.7 7.4 5.6 12 2.5z"/>',
  tik: '<path d="M5 12.6l4.3 4.3L19 7.2"/>',
  saat: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  arti: '<path d="M12 6v12M6 12h12"/>',
  eksi: '<path d="M6 12h12"/>',
  ay: '<path d="M15.5 3.8a8.5 8.5 0 1 0 4.7 13.6 7 7 0 0 1-4.7-13.6z"/>',
  sandal:
    '<path d="M2.5 13.5h19l-2.6 4.3q-.6 1-1.8 1H6.9q-1.2 0-1.8-1z"/><path d="M14.6 4.2 9.4 16.6"/><path d="M14.6 4.2l1.3-2.2"/>',
  fener:
    '<path d="M12 2.5v2"/><path d="M8.5 6.5h7"/><path d="M9.2 6.5q-1.6 4.5 0 9h5.6q1.6-4.5 0-9"/><path d="M8.5 15.5h7"/><path d="M12 13.2c-1 0-1.4-.7-1.4-1.3 0-.9.8-1.3 1-2.2.8.5 1.8 1.2 1.8 2.2 0 .6-.4 1.3-1.4 1.3z"/>',
  dalga: '<path d="M2 12q2.5-3 5 0t5 0 5 0 5 0"/>',
};

export function icon(name, extraClass = '') {
  const paths = PATHS[name];
  if (!paths) return '';
  return `<svg class="ik ${extraClass}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
}

/** Göksu ve Yeşilçay'ın birleşip denize aktığı iki dere: logo. */
export const logo = `
  <svg class="logo" viewBox="0 0 44 26" aria-hidden="true" focusable="false">
    <path class="logo-goksu" d="M2.5 4.5C13 4.5 15 13 25.5 13H41.5"/>
    <path class="logo-yesilcay" d="M2.5 21.5C13 21.5 15 13 25.5 13"/>
  </svg>`;
