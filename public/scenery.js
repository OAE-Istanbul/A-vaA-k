// İstanbul gökyüzü: sistem açıkken gece, ay açılıştan kapanışa kadar gökte ilerler ve
// Boğaz'da yakamoz bırakır; kapalıyken gündüz, güneş açılışa doğru batar.
// Önde şehir silüeti (camiler, minareler, Galata Kulesi), arkada Anadolu yakasının tepeleri.

const DAY_MS = 24 * 60 * 60 * 1000;
const W = 1200;
const H = 220;

function random(seed) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ridgePath(seed, { base, hill, bump: [bumpMin, bumpMax], height: [hMin, hMax] }) {
  const r = random(seed);
  const y = (x) => base - hill * Math.sin(x / 260 + seed) - hill * 0.5 * Math.sin(x / 97 + seed * 2);
  const f = (n) => n.toFixed(1);
  let x = -40;
  let d = `M-40 ${H} L-40 ${f(y(-40))}`;
  while (x < W + 40) {
    const w = bumpMin + r() * (bumpMax - bumpMin);
    const h = hMin + r() * (hMax - hMin);
    const mid = x + w / 2;
    const next = x + w;
    d += ` Q${f(x + w * 0.12)} ${f(y(x) - h)} ${f(mid)} ${f(y(mid) - h)}`;
    d += ` Q${f(x + w * 0.88)} ${f(y(next) - h)} ${f(next)} ${f(y(next))}`;
    x = next;
  }
  return `${d} L${f(x)} ${H} Z`;
}

function stars() {
  const r = random(7);
  return Array.from({ length: 46 }, () => {
    const cx = (r() * W).toFixed(0);
    const cy = (r() * 120).toFixed(0);
    const rad = (0.5 + r() * 1.1).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${rad}"/>`;
  }).join('');
}

/** Şehir silüeti: iki cami, Galata Kulesi ve aralarda bina blokları. */
function skyline() {
  const r = random(21);
  const base = H - 26;
  const parts = [];
  const f = (n) => n.toFixed(1);
  const rect = (x, top, w, bottom = base) => parts.push(`M${f(x)} ${f(top)}h${f(w)}V${f(bottom)}h${f(-w)}z`);
  const dome = (cx, y, rad) => parts.push(`M${f(cx - rad)} ${f(y)}A${f(rad)} ${f(rad)} 0 0 1 ${f(cx + rad)} ${f(y)}z`);
  const cone = (cx, y, w, h) => parts.push(`M${f(cx - w / 2)} ${f(y)}L${f(cx)} ${f(y - h)}L${f(cx + w / 2)} ${f(y)}z`);
  const minaret = (cx, h) => {
    const top = base - h;
    rect(cx - 3.5, top, 7);
    rect(cx - 5.5, top + h * 0.28, 11, top + h * 0.28 + 3);
    cone(cx, top, 7, 22);
  };
  const mosque = (cx, s) => {
    rect(cx - 86 * s, base - 34 * s, 172 * s);
    rect(cx - 50 * s, base - 50 * s, 100 * s, base - 34 * s);
    dome(cx - 50 * s, base - 34 * s, 30 * s);
    dome(cx + 50 * s, base - 34 * s, 30 * s);
    dome(cx, base - 50 * s, 46 * s);
    rect(cx - 1, base - 50 * s - 46 * s - 10, 2, base - 50 * s - 40 * s);
    for (const [dx, h] of [[-100, 122], [100, 122], [-78, 104], [78, 104]]) minaret(cx + dx * s, h * s);
  };
  const galata = (cx) => {
    rect(cx - 15, base - 104, 30);
    rect(cx - 19, base - 116, 38, base - 104);
    cone(cx, base - 116, 40, 38);
  };
  const landmarks = [
    { from: 170, to: 430, draw: () => mosque(300, 1) },
    { from: 735, to: 785, draw: () => galata(760) },
    { from: 950, to: 1090, draw: () => mosque(1020, 0.6) },
  ];
  let x = -10;
  while (x < W + 10) {
    const w = 18 + r() * 30;
    if (!landmarks.some((l) => x + w > l.from && x < l.to)) rect(x, base - (12 + r() * 34), w - 2);
    x += w;
  }
  for (const l of landmarks) l.draw();
  return parts.join('');
}

const SCENE = `
  <svg class="gok-sahne" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="gok-renk" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="gok-ust"/>
        <stop offset="1" class="gok-alt"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#gok-renk)"/>
    <g class="yildizlar">${stars()}</g>
    <path class="sirt-uzak" d="${ridgePath(3, { base: 168, hill: 10, bump: [60, 120], height: [4, 12] })}"/>
    <path class="sehir" d="${skyline()}"/>
    <rect class="dere" y="${H - 26}" width="${W}" height="26"/>
    <path class="dere-isik" d="M0 ${H - 25} H${W}"/>
  </svg>`;

const FIREFLIES = Array.from({ length: 7 }, (_, i) => `<span class="ates-bocegi b${i}"></span>`).join('');

/**
 * Sahnenin HTML'i. Metin ve saatler HTML olarak üstte durur;
 * ay/güneş ve yakamoz updateSky ile her saniye yerini bulur.
 */
export function renderSky(market, { opens, closes, nightLabel, untilLabel }) {
  const from = market.open ? market.opensAt : market.closesAt - DAY_MS;
  const to = market.open ? market.closesAt : market.opensAt;
  return `
    <div class="gokyuzu ${market.open ? 'acik' : 'kapali'}" data-from="${from}" data-to="${to}">
      ${SCENE}
      <div class="gok-yol" aria-hidden="true">
        <span class="gok-disk"></span>
        <span class="yakamoz"><i></i><i></i><i></i></span>
      </div>
      ${market.open ? `<div class="ates-bocekleri" aria-hidden="true">${FIREFLIES}</div><span class="kayan-yildiz" aria-hidden="true"></span>` : ''}
      <span class="marti m1" aria-hidden="true"></span><span class="marti m2" aria-hidden="true"></span>
      <div class="gok-yazi">
        <p class="gok-ust-baslik">${nightLabel}</p>
        <p class="gok-baslik">${market.open ? 'Sistem açık' : `Sistem ${opens}'de açılıyor`}</p>
        <p class="gok-alt-satir">${untilLabel}</p>
      </div>
    </div>`;
}

/** Ay ya da güneşin gökteki yeri: soldan sağa bir yay. */
export function updateSky(root, now) {
  const sky = root.querySelector('.gokyuzu');
  if (!sky) return;
  const from = Number(sky.dataset.from);
  const to = Number(sky.dataset.to);
  const p = Math.min(1, Math.max(0, (now - from) / (to - from)));
  sky.style.setProperty('--x', p.toFixed(4));
  sky.style.setProperty('--y', Math.sin(Math.PI * p).toFixed(4));
}
