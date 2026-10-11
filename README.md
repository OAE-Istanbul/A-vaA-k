# Ağva Gece Teklifleri

Ağva'da son dakika konaklama için ters açık artırma. Alıcı bir ilan açar, Ağva'daki uygun oteller bu ilana teklif verir ve birbirinin fiyatını kırar ("bende 2.000 TL'ye kal", "hayır, bende 1.900 TL'ye kal"). Alıcı beğendiği teklifi kabul eder, iki tarafın iletişim bilgileri karşılıklı açılır.

Pazar her akşam 21:00'de açılır. Amaç, otellerin o gece boş kalacak odalarını maliyetine ya da düşük kârla doldurması; spontane alıcılar için de uygun fiyatlı bir kaçamak.

## Kurallar

**İlan (alıcı)**
- Yalnızca pazar açıkken (varsayılan 21:00 ile 00:00 arası, İstanbul saati) açılabilir. Giriş tarihi o gecedir.
- Alıcı misafir profilini (evli çift, çift, aile, arkadaş grubu, tek kişi), yetişkin ve çocuk sayısını, kaç gece kalacağını, tahmini varış saatini, istediği otel tiplerini ve olmazsa olmaz olanakları girer. Bütçe üst sınırı ve not isteğe bağlıdır.
- Teklif süresi 15, 30, 45 ya da 60 dakikadır ve pazarın kapanışını aşamaz. Kapanışa 5 dakikadan az kala ilan açılmaz.
- Bir alıcının aynı anda tek açık ilanı olur. Alıcı ilanını iptal edebilir.

**Uygunluk (otel)**
- Otel ilanı yalnızca şu koşulların hepsi sağlanırsa görür ve teklif verebilir: alıcının seçtiği otel tiplerinden biri (seçim yoksa hepsi), istenen olanakların tamamı, alıcının profilini kabul etmesi ve misafir sayısına yetecek bir odası olması.
- Otel, alıcının kimliğini ve telefonunu görmez. En düşük teklifi, teklif sayısını ve kendi durumunu görür.

**Teklif (ters açık artırma)**
- Fiyat konaklamanın toplam tutarıdır (tüm geceler).
- İlk teklif bütçe sınırını aşamaz. Sonraki her teklif mevcut en düşük teklifin en az 50 TL altında olmalıdır.
- En düşük teklif zaten sizdeyse yeniden teklif veremezsiniz. Geçildiyseniz yeni ve daha düşük bir teklifle dönebilirsiniz; eski teklifiniz geçersiz olur.
- Son 2 dakikada gelen teklif süreyi 2 dakika uzatır (son saniye kapışmasını önler), pazar kapanışını aşmamak kaydıyla.

**Kabul**
- Alıcı teklif süresi içinde ya da süre bittikten sonraki 15 dakika içinde herhangi bir teklifi kabul edebilir (en ucuzu olmak zorunda değil).
- Kabulden sonra alıcı otelin telefon ve adresini, otel alıcının adını ve telefonunu görür.
- 15 dakika içinde seçim yapılmazsa ilan sona erer.

İlan durumları: `open` (teklif alıyor), `awaiting_choice` (alıcı seçiyor), `accepted`, `cancelled`, `expired`.

## Çalıştırma

Node.js 22 veya üstü yeterli, harici paket yok.

```bash
npm start       # http://localhost:3000, veriler data/db.json dosyasına yazılır
npm run demo    # saat bugün 21:05'ten başlar, veriler yalnızca bellekte tutulur
npm test        # birim ve API testleri
```

Gündüz denemek için `npm run demo` kullanın. Demo modunda saat 21:05'ten başlayıp gerçek zamanla ilerler, böylece pazar açık görünür.

Örnek otellerin hepsinin PIN'i `1234`. Oteller kurgusaldır, gerçek işletmelerle ilgisi yoktur. Canlı teklif akışını görmek için alıcıyı bir tarayıcıda, otelleri başka sekmelerde ya da gizli pencerede açın.

## Ayarlar

| Ortam değişkeni | Varsayılan | Açıklama |
| --- | --- | --- |
| `PORT` | 3000 | Sunucu portu |
| `ACILIS_SAATI` | 21:00 | Pazarın açılış saati (İstanbul) |
| `KAPANIS_SAATI` | 00:00 | Kapanış saati; açılıştan küçükse ertesi gün demektir (örn. 02:00) |
| `MIN_DUSUS_TL` | 50 | Yeni teklifin en düşük tekliften en az ne kadar düşük olacağı |
| `UZATMA_DK` | 2 | Son dakika teklifinde süre uzatması |
| `KABUL_SURESI_DK` | 15 | Süre bitince alıcının seçim süresi |
| `MAKS_GECE` | 3 | Bir ilanda en fazla gece sayısı |
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
| POST | `/api/listings/:id/accept` | alıcı | `{offerId}` teklifini kabul et |
| POST | `/api/listings/:id/cancel` | alıcı | İlanı iptal et |
| GET | `/api/hotel/feed` | otel | Uygun açık ilanlar ve kazanılanlar |
| POST | `/api/listings/:id/offers` | otel | `{price, roomName, note}` teklif ver |
| GET | `/api/events?token=` | herkes | Canlı güncelleme akışı (Server-Sent Events) |

## Proje yapısı

```
src/
  clock.js        İstanbul saati ve pazar penceresi hesabı
  catalog.js      Otel tipleri, olanaklar, misafir profilleri
  eligibility.js  Otelin ilana uygunluğu
  validation.js   Girdi doğrulama
  market.js       İlan, teklif, kabul ve görünümler (iş kurallarının tamamı)
  auth.js         Demo oturum yönetimi
  server.js       HTTP sunucu, API, canlı akış, statik dosyalar
  seed.js         Örnek oteller
public/           Arayüz (tek sayfa, framework yok)
test/             node:test ile testler
```

## Netleştirilmesi gereken noktalar

Aşağıdakiler bu sürümde varsayım olarak uygulandı, hepsi ayarlardan ya da tek bir yerden değiştirilebilir:

1. Pazar 21:00'de açılıp gece yarısı kapanıyor. Gece yarısından sonra da ilan açılsın mı?
2. Giriş her zaman o gece. Alıcı ertesi gün ya da hafta sonu için de ilan açabilsin mi?
3. Her ilan tek oda için. Kalabalık arkadaş grupları için birden fazla oda istenebilsin mi?
4. Alıcı en ucuz teklifi seçmek zorunda değil. Süre bitince en düşük teklif otomatik mi kazanmalı?
5. Teklifler arasındaki en az fark 50 TL. Sabit tutar mı, yüzde mi olmalı?
6. Evli çift seçen alıcıdan girişte belge istenip istenmeyeceği otelin politikası; uygulamada sadece profil eşleşmesi var.
7. Ödeme ve komisyon modeli yok; kabulden sonra taraflar doğrudan iletişime geçiyor.

## Canlıya çıkmadan önce

- Alıcı için SMS doğrulaması, oteller için gerçek hesap ve şifre yönetimi
- Otel paneli: profil, oda ve olanak düzenleme, otel kaydı ve onayı
- JSON dosyası yerine veritabanı (PostgreSQL)
- Bildirimler: yeni ilan düştüğünde otellere, yeni teklif geldiğinde alıcıya SMS ya da push
- Ödeme ya da kapora, iptal ve gelmeme (no-show) kuralları
