import { fileURLToPath } from 'node:url';
import { Auth } from './auth.js';
import { systemClock } from './clock.js';
import { defaultConfig } from './config.js';
import { Marketplace } from './market.js';
import { verifyPin } from './pin.js';
import { DEMO_PIN, seedHotels } from './seed.js';
import { createServer } from './server.js';
import { Store } from './store.js';

// --demo: saat bugün 18:05'ten başlar, veriler yalnızca bellekte tutulur.
const demo = process.argv.includes('--demo');
const config = demo
  ? { ...defaultConfig, demoTime: defaultConfig.demoTime ?? '18:05', dataFile: null }
  : defaultConfig;

const store = new Store(config.dataFile);
seedHotels(store);

const market = new Marketplace({ store, clock: systemClock(config.demoTime), config });
const auth = new Auth(store, { verifyPin });
// Seçim süresi dolan ilanlarda otomatik kabul, kimse sayfayı yenilemese de işlesin.
setInterval(() => market.settle(), 15_000).unref();
const publicDir = fileURLToPath(new URL('../public', import.meta.url));
const server = createServer({ market, auth, config, publicDir });

server.listen(config.port, () => {
  const status = market.marketStatus();
  const time = (ms) => new Date(ms).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  console.log(`${config.appName} çalışıyor: http://localhost:${config.port}`);
  console.log(status.open ? `Sistem açık, kapanış ${time(status.closesAt)}` : `Sistem kapalı, açılış ${time(status.opensAt)}`);
  if (config.demoTime) console.log(`Demo saati etkin (${config.demoTime}'ten başladı). Otel PIN'leri: ${DEMO_PIN}`);
});
