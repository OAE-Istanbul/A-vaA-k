// Ağva gökyüzü: pazar açıkken gece, ay 21.00'den kapanışa kadar gökte ilerler ve
// derede yakamoz bırakır; kapalıyken gündüz, güneş açılışa doğru batar.
// Orman sırtı her seferinde aynı tohumdan üretilir (yuvarlak taçlı kayın ve meşe).

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

// Sağ ve sol kıyıda birkaç kamış.
const REEDS = [
  [34, 0], [48, 14], [61, 6], [1140, 10], [1156, 0], [1171, 16],
]
  .map(([x, lean]) => `<path d="M${x} ${H} Q${x + lean * 0.3} ${H - 30} ${x + lean * 0.6} ${H - 52}"/><ellipse cx="${x + lean * 0.6}" cy="${H - 58}" rx="2.6" ry="7"/>`)
  .join('');

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
    <path class="sirt-uzak" d="${ridgePath(3, { base: 158, hill: 14, bump: [40, 90], height: [6, 18] })}"/>
    <path class="sirt-yakin" d="${ridgePath(11, { base: 182, hill: 9, bump: [26, 60], height: [10, 26] })}"/>
    <rect class="dere" y="${H - 26}" width="${W}" height="26"/>
    <path class="dere-isik" d="M0 ${H - 25} H${W}"/>
    <g class="kamislar">${REEDS}</g>
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
        <span class="gok-saat bas">${market.open ? opens : closes}</span>
        <span class="gok-saat son">${market.open ? closes : opens}</span>
      </div>
      ${market.open ? `<div class="ates-bocekleri" aria-hidden="true">${FIREFLIES}</div>` : ''}
      <div class="gok-yazi">
        <p class="gok-ust-baslik">${nightLabel}</p>
        <p class="gok-baslik">${market.open ? 'Pazar açık' : `Pazar ${opens}'de açılıyor`}</p>
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
