# Ağva Gece Teklifleri

Ağva'da son dakika konaklama için ters açık artırma. Alıcı bir ilan açar, Ağva'daki uygun oteller bu ilana teklif verir ve birbirinin fiyatını kırar ("bende 2.000 TL'ye kal", "hayır, bende 1.900 TL'ye kal"). Alıcı beğendiği teklifi kabul eder, iki tarafın iletişim bilgileri karşılıklı açılır.

Pazar her akşam 21:00'de açılır. Amaç, otellerin o gece boş kalacak odalarını maliyetine ya da düşük kârla doldurması; spontane alıcılar için de uygun fiyatlı bir kaçamak.

## Kurallar

**İlan (alıcı)**
- Yalnızca pazar açıkken (varsayılan 21:00 ile 02:00 arası, İstanbul saati) açılabilir. Giriş her zaman o gecedir; gece yarısından sonra açılan ilan da bir önceki günün gecesine aittir.
- Alıcı misafir profilini (evli çift, çift, aile, arkadaş grubu, tek kişi), yetişkin ve çocuk sayısını, kaç gece kalacağını, tahmini varış saatini, istediği otel tiplerini ve olmazsa olmaz olanakları girer. Bütçe üst sınırı ve not isteğe bağlıdır.
- Oda sayısı isteğe bağlıdır (varsayılan 1, en fazla 4). Çift ve tek kişi ilanları tek odalıdır; her odada en az bir yetişkin kalmalıdır.
- Teklif süresi 15, 30, 45 ya da 60 dakikadır ve pazarın kapanışını aşamaz. Kapanışa 5 dakikadan az kala ilan açılmaz.
- Bir alıcının aynı anda tek açık ilanı olur. Alıcı ilanını iptal edebilir.

**Uygunluk (otel)**
- Otel ilanı yalnızca şu koşulların hepsi sağlanırsa görür ve teklif verebilir: alıcının seçtiği otel tiplerinden biri (seçim yoksa hepsi), istenen olanakların tamamı, alıcının profilini kabul etmesi ve istenen sayıda, tüm misafirleri sığdıran bir oda tipi olması (örneğin 2 oda isteyen 4 kişi için en az 2 adet 2 kişilik oda).
- Otel, alıcının kimliğini ve telefonunu görmez. En düşük teklifi, teklif sayısını ve kendi durumunu görür.

**Teklif (ters açık artırma)**
- Fiyat konaklamanın toplam tutarıdır (tüm geceler ve tüm odalar).
- İlk teklif bütçe sınırını aşamaz. Sonraki her teklif mevcut en düşük teklifin en az 50 TL altında olmalıdır.
- En düşük teklif zaten sizdeyse yeniden teklif veremezsiniz. Geçildiyseniz yeni ve daha düşük bir teklifle dönebilirsiniz; eski teklifiniz geçersiz olur.
- Son 2 dakikada gelen teklif süreyi 2 dakika uzatır (son saniye kapışmasını önler), pazar kapanışını aşmamak kaydıyla.

**Öne çıkanlar ve kabul**
- Teklif veren her otel alıcının isteklerini zaten karşıladığı için alıcı, tüm teklifler yerine öne çıkanlardan seçer:
  - En iyi fiyat: en düşük teklif.
  - En çok olanak: en fazla olanağı sunan otelin teklifi.
  - Fiyat/performans: lira başına en çok olanak.
  Aynı teklif birden fazla kategoride öne çıkabilir; diğer teklifler listede görünür ama seçilemez.
- Alıcı teklif süresi içinde ya da süre bittikten sonraki 15 dakika içinde öne çıkanlardan birini kabul eder.
- 15 dakika içinde seçim yapmazsa en iyi fiyat otomatik kabul edilir. Hiç teklif yoksa ilan sona erer.
- Kabulden sonra alıcı otelin telefon ve adresini, otel alıcının adını ve telefonunu görür.
- Fiyatta geçilen otel, başka bir kategoride öne çıkıyorsa bunu panelinde görür (alıcı onu yine seçebilir).

İlan durumları: `open` (teklif alıyor), `awaiting_choice` (alıcı seçiyor), `accepted`, `cancelled`, `expired`.

## Çalıştırma

Node.js 22 veya üstü yeterli, harici paket yok.

```bash
npm start       # http://localhost:3000, veriler data/db.json dosyasına yazılır
npm run demo    # saat bugün 21:05'ten başlar, veriler yalnızca bellekte tutulur
npm test        # birim ve API testleri
npm install && npm run preview   # sunucusuz tek dosyalık önizleme: dist/preview/agva-onizleme.html
```

Gündüz denemek için `npm run demo` kullanın. Demo modunda saat 21:05'ten başlayıp gerçek zamanla ilerler, böylece pazar açık görünür.

Önizleme, pazar kodunun aynısını tarayıcıda çalıştırır: rakip oteller bot olarak fiyat kırar, üstteki çubuktan alıcı ya da otel gözüyle bakılır ve saat ileri alınarak süre sonu ile otomatik kabul görülür. `--standalone` ile doğrudan tarayıcıda açılabilen tam bir HTML dosyası üretilir.

Örnek otellerin hepsinin PIN'i `1234`. Oteller kurgusaldır, gerçek işletmelerle ilgisi yoktur. Canlı teklif akışını görmek için alıcıyı bir tarayıcıda, otelleri başka sekmelerde ya da gizli pencerede açın.

## Tasarım

Görsel dil Ağva'nın kendisinden geliyor: Göksu ile Yeşilçay'ın birleştiği iki dere (logo), dere taşı biçiminde yuvarlak kutular, Pembe Kayalar'dan alınan pembe ve gece fenerinin sıcak sarısı.

- Üstteki gökyüzü pazarın durumunu gösterir: açıkken gece, ay 21.00'den 02.00'ye gökte ilerler ve derede yakamoz bırakır; kapalıyken gündüz. Orman sırtı kodla üretilir, yuvarlak taçlı kayın ve meşe biçimindedir.
- Teklif süresini dereyi geçen bir sandal gösterir. Yeni teklif gelince kart dereden süzülür, fiyatın etrafında halkalar yayılır, en iyi fiyat eski değerden yenisine akarak iner. Hareketi azalt ayarı açık olanlarda animasyon yoktur.
- Yazı tipleri: başlık ve fiyatlarda Young Serif, metinde Ysabeau Infant. İkisi de projede barındırılır (`public/fonts`, SIL Open Font License) ve Türkçe karakterlerin tamamını içerir.
- İkonlar hazır bir kütüphaneden değil, `public/icons.js` içinde elle çizildi (kahvaltı için ince belli çay bardağı gibi).
- Açık tema "Yeşilçay sabahı", koyu tema "Göksu gecesi"; cihazın ayarına göre seçilir.

## Ayarlar

| Ortam değişkeni | Varsayılan | Açıklama |
| --- | --- | --- |
| `PORT` | 3000 | Sunucu portu |
| `ACILIS_SAATI` | 21:00 | Pazarın açılış saati (İstanbul) |
| `KAPANIS_SAATI` | 02:00 | Kapanış saati; açılıştan küçükse ertesi gün demektir |
| `MIN_DUSUS_TL` | 50 | Yeni teklifin en düşük tekliften en az ne kadar düşük olacağı |
| `UZATMA_DK` | 2 | Son dakika teklifinde süre uzatması |
| `KABUL_SURESI_DK` | 15 | Süre bitince alıcının seçim süresi; sonra en iyi fiyat otomatik kabul edilir |
| `MAKS_GECE` | 3 | Bir ilanda en fazla gece sayısı |
| `MAKS_ODA` | 4 | Bir ilanda en fazla oda sayısı |
| `VERI_DOSYASI` | data/db.json | Kayıt dosyası; boş bırakılırsa yalnızca bellek |
| `DEMO_SAAT` | yok | Saati bugün bu saatten başlatır (örn. 21:30) |
| `UYGULAMA_ADI` | Ağva | Arayüzde görünen ad |

## API

Kimlik doğrulama `Authorization: Bearer <token>` başlığıyla yapılır.

| Yöntem | Yol | Rol | Açıklama |
| --- | --- | --- | --- |
| GET | `/api/meta` | | Katalog (otel tipleri, olanaklar, profiller) ve kurallar |
| GET | `/api/market` | | Pazar açık mı, açılış/kapanış zamanı |
| GET | `/api/hotels` | | Otel giriş listesi |
| POST | `/api/session` | | Giriş: `{role:"buyer", name, phone}` ya da `{role:"hotel", hotelId, pin}` |
| DELETE | `/api/session` | | Çıkış |
| POST | `/api/listings` | alıcı | İlan aç |
| GET | `/api/listings/mine` | alıcı | İlanlarım ve gelen teklifler |
| POST | `/api/listings/:id/accept` | alıcı | `{offerId}` öne çıkan teklifi kabul et |
| POST | `/api/listings/:id/cancel` | alıcı | İlanı iptal et |
| GET | `/api/hotel/feed` | otel | Uygun açık ilanlar ve kazanılanlar |
| POST | `/api/listings/:id/offers` | otel | `{price, roomName, note}` teklif ver |
| GET | `/api/events?token=` | herkes | Canlı güncelleme akışı (Server-Sent Events) |

## Proje yapısı

```
src/
  clock.js        İstanbul saati ve pazar penceresi hesabı
  catalog.js      Otel tipleri, olanaklar, misafir profilleri
  eligibility.js  Otelin ilana uygunluğu (tip, olanak, profil, oda sayısı ve kapasite)
  validation.js   Girdi doğrulama
  market.js       İlan, teklif, öne çıkanlar, kabul ve görünümler (iş kurallarının tamamı)
  api.js          Yönlendirme ve yetki; sunucu ve önizleme ortak kullanır
  auth.js         Demo oturum yönetimi
  pin.js          Otel PIN'i için scrypt
  server.js       HTTP sunucu, canlı akış, statik dosyalar
  sample-hotels.js, seed.js  Örnek oteller
public/           Arayüz (tek sayfa, framework yok)
preview/          Tarayıcıda çalışan arka uç, rakip otel botları ve önizleme çubuğu
scripts/          Önizleme derlemesi
test/             node:test ile testler
```

## Netleştirilmesi gereken noktalar

1. Pazar 02:00'de kapanıyor. Daha geç ya da daha erken mi olmalı?
2. Üçüncü öne çıkan kategori şimdilik "Fiyat/performans" (lira başına olanak sayısı). Yerine ya da yanına puan, denize yakınlık gibi başka bir "en iyi" eklenebilir; otellerden bu veri toplanmalı.
3. Çok odalı ilanlarda tüm odalar aynı tipten. Karışık oda (bir aile odası + bir çift odası) istenirse eklenebilir.
4. Otelin o gece kaç boş odası olduğu takip edilmiyor; aynı oda iki ilanı kazanabilir.
5. Evli çift seçen alıcıdan girişte belge istenip istenmeyeceği otelin politikası; uygulamada sadece profil eşleşmesi var.
6. Ödeme ve komisyon modeli yok; kabulden sonra taraflar doğrudan iletişime geçiyor.

## Canlıya çıkmadan önce

- Alıcı için SMS doğrulaması, oteller için gerçek hesap ve şifre yönetimi
- Otel paneli: profil, oda ve olanak düzenleme, o geceki boş oda sayısı, otel kaydı ve onayı
- JSON dosyası yerine veritabanı (PostgreSQL)
- Bildirimler: yeni ilan düştüğünde otellere, yeni teklif geldiğinde alıcıya SMS ya da push
- Ödeme ya da kapora, iptal ve gelmeme (no-show) kuralları
