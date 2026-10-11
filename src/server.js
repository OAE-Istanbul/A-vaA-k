import { readFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { AMENITIES, GUEST_GROUPS, HOTEL_TYPES } from './catalog.js';
import { MarketError } from './errors.js';

const MAX_BODY_BYTES = 64 * 1024;
const KEEPALIVE_MS = 25_000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
};

function route(method, pattern, handler, role = null) {
  const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`);
  return { method, regex, handler, role };
}

function sendJson(res, status, payload) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': MIME_TYPES['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new MarketError('İstek çok büyük.', 413);
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new MarketError('Geçersiz JSON.');
  }
}

const bearerToken = (req) => /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? null;

export function createServer({ market, auth, config, publicDir }) {
  const publicRoot = resolve(publicDir);
  const streams = new Set();

  market.subscribe((event) => {
    const message = `event: change\ndata: ${JSON.stringify(event)}\n\n`;
    for (const res of streams) res.write(message);
  });

  const meta = {
    appName: config.appName,
    catalog: { hotelTypes: HOTEL_TYPES, amenities: AMENITIES, guestGroups: GUEST_GROUPS },
    rules: {
      marketOpens: config.marketOpens,
      marketCloses: config.marketCloses,
      minDecrementTL: config.minDecrementTL,
      auctionDurations: config.auctionDurations,
      acceptGraceMinutes: config.acceptGraceMinutes,
      softCloseMinutes: config.softCloseMinutes,
      maxNights: config.maxNights,
    },
  };

  const routes = [
    route('GET', '/api/meta', () => meta),
    route('GET', '/api/market', () => market.marketStatus()),
    route('GET', '/api/hotels', () => market.hotelDirectory()),
    route('POST', '/api/session', ({ body }) => auth.login(body)),
    route('DELETE', '/api/session', ({ token }) => {
      auth.logout(token);
      return { ok: true };
    }),
    route('GET', '/api/me', ({ user }) => auth.profile(user), 'any'),
    route('GET', '/api/listings/mine', ({ user }) => market.buyerListings(user.id), 'buyer'),
    route('POST', '/api/listings', ({ user, body }) => market.createListing(user.id, body), 'buyer'),
    route('POST', '/api/listings/:id/cancel', ({ user, params }) => market.cancelListing(user.id, params.id), 'buyer'),
    route('POST', '/api/listings/:id/accept', ({ user, params, body }) => market.acceptOffer(user.id, params.id, body.offerId), 'buyer'),
    route('POST', '/api/listings/:id/offers', ({ user, params, body }) => market.placeOffer(user.id, params.id, body), 'hotel'),
    route('GET', '/api/hotel/feed', ({ user }) => market.hotelFeed(user.id), 'hotel'),
  ];

  async function handleApi(req, res, url) {
    let match = null;
    for (const r of routes) {
      const m = r.method === req.method && r.regex.exec(url.pathname);
      if (m) {
        match = { ...r, params: m.groups ?? {} };
        break;
      }
    }
    if (!match) throw new MarketError('Bulunamadı.', 404);

    const token = bearerToken(req);
    const user = auth.resolve(token);
    if (match.role) {
      if (!user) throw new MarketError('Giriş yapmanız gerekiyor.', 401);
      if (match.role !== 'any' && user.role !== match.role) throw new MarketError('Bu işlem için yetkiniz yok.', 403);
    }
    const body = req.method === 'POST' ? await readJson(req) : {};
    sendJson(res, 200, await match.handler({ user, token, body, params: match.params }));
  }

  // EventSource başlık gönderemediği için token sorgu parametresiyle gelir.
  function openStream(req, res, url) {
    if (!auth.resolve(url.searchParams.get('token'))) throw new MarketError('Giriş yapmanız gerekiyor.', 401);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    res.write('retry: 3000\n\n');
    streams.add(res);
    const keepalive = setInterval(() => res.write(': ping\n\n'), KEEPALIVE_MS);
    req.on('close', () => {
      clearInterval(keepalive);
      streams.delete(res);
    });
  }

  async function serveStatic(res, pathname) {
    let relative;
    try {
      relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
    } catch {
      throw new MarketError('Geçersiz adres.');
    }
    const file = resolve(publicRoot, relative);
    if (!file.startsWith(publicRoot + sep)) throw new MarketError('Bulunamadı.', 404);
    let content;
    try {
      content = await readFile(file);
    } catch {
      throw new MarketError('Bulunamadı.', 404);
    }
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': MIME_TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  }

  const server = createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/events') return openStream(req, res, url);
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new MarketError('Bulunamadı.', 404);
      return await serveStatic(res, url.pathname);
    } catch (err) {
      if (res.headersSent) return res.end();
      if (err instanceof MarketError) return sendJson(res, err.status, { error: err.message });
      console.error(err);
      sendJson(res, 500, { error: 'Beklenmeyen bir hata oluştu.' });
    }
  });

  server.on('close', () => {
    for (const res of streams) res.end();
    streams.clear();
  });
  return server;
}
