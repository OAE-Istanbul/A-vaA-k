// Sayfanın ortasından geçen İstanbul Boğazı. Kuzey ucu beyaz sayfada yuvarlak biter,
// güney ucu genişleyip sayfanın altındaki Marmara'ya açılır. Sol kıyı Avrupa, sağ kıyı Asya.
// Kıvrımlar gerçek Boğaz'ın profilinden (Büyükdere genişliği, Rumeli Hisarı'ndaki en dar yer),
// köprüler gerçek sırasıyla. Akıntı gerçekte olduğu gibi kuzeyden güneye, yani aşağı akar.
// Alıcının açık ilanı varsa suda "İlanınız" etiketli kırmızı bir balık yüzer.

const NS = 'http://www.w3.org/2000/svg';
const STEP = 12;
const START = 48;

// [konum (0 kuzey, 1 güney), yatay sapma (px), genişlik çarpanı]
const PROFILE = [
  [0, 0, 1.1],
  [0.07, -8, 1.15],
  [0.16, -4, 1.0],
  [0.28, 14, 1.18],
  [0.4, 24, 0.92],
  [0.5, 6, 0.62],
  [0.6, -18, 0.82],
  [0.7, -10, 0.74],
  [0.82, 10, 0.96],
  [0.92, 14, 1.3],
  [0.97, 4, 2.2],
  [1, 0, 4.5],
];

const BRIDGES = [
  { t: 0.16, name: 'Yavuz Sultan Selim', kind: 'egik' },
  { t: 0.5, name: 'Fatih Sultan Mehmet', kind: 'asma' },
  { t: 0.7, name: '15 Temmuz Şehitler', kind: 'asma' },
];

const FERRIES = [
  { phase: 0.1, speed: 1, lane: -0.35 },
  { phase: 0.55, speed: 0.8, lane: 0.3 },
  { phase: 0.3, speed: -0.7, lane: 0.4 },
  { phase: 0.8, speed: -0.9, lane: -0.3 },
];

const FISH_PATH = 'M-14 0C-8-8 6-8 12 0C6 8-8 8-14 0zM12 0l8-6v12z';

function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

/** Profil noktaları arasında yumuşak geçiş. */
function sample(t) {
  const i = Math.max(0, PROFILE.findIndex(([pt]) => pt >= t) - 1);
  const [t0, o0, w0] = PROFILE[i];
  const [t1, o1, w1] = PROFILE[Math.min(i + 1, PROFILE.length - 1)];
  const k = t1 === t0 ? 0 : (1 - Math.cos(((t - t0) / (t1 - t0)) * Math.PI)) / 2;
  return [o0 + (o1 - o0) * k, w0 + (w1 - w0) * k];
}

const RIPPLES = ['M8 14q7-5 14 0', 'M40 6q6-4 12 0', 'M62 30q8-5 16 0', 'M18 44q6-4 12 0', 'M48 56q7-5 14 0', 'M4 64q5-3 10 0', 'M70 70q5-3 10 0'];

export function mountBosphorus(container, sea) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const svg = el('svg', { class: 'bogaz', 'aria-hidden': 'true', focusable: 'false' });
  const defs = el('defs');
  const pattern = el('pattern', { id: 'su-dokusu', width: '84', height: '84', patternUnits: 'userSpaceOnUse' });
  pattern.append(el('rect', { width: '84', height: '84', class: 'su-zemin' }));
  for (const d of RIPPLES) pattern.append(el('path', { d, class: 'su-cizgi' }));
  for (const [cx, cy] of [[30, 24], [74, 46], [12, 78]]) pattern.append(el('circle', { cx, cy, r: '1.2', class: 'su-parilti' }));
  defs.append(pattern);

  const bank = el('path', { class: 'bogaz-kiyi' });
  const water = el('path', { fill: 'url(#su-dokusu)' });
  const decor = el('g');
  const ferries = FERRIES.map((f) => {
    const g = el('g', { class: 'vapur-suzen' });
    g.append(
      el('path', { class: 'vapur-govde', d: 'M-11 1h22l-3 5h-16z' }),
      el('path', { class: 'vapur-kat', d: 'M-8 1v-4h15v4z' }),
      el('path', { class: 'vapur-baca', d: 'M2 -3v-4h3v4z' }),
    );
    return { ...f, g };
  });
  const fish = el('g', { class: 'bizim-balik' });
  const fishBody = el('g', { class: 'bizim-balik-govde' });
  fishBody.append(el('path', { d: FISH_PATH }), el('circle', { class: 'balik-goz', cx: 6, cy: -1.5, r: 1.6 }));
  const tag = el('g', { class: 'balik-etiket', transform: 'translate(0 -26)' });
  tag.append(el('rect', { x: -32, y: -11, width: 64, height: 20, rx: 10 }), el('text', { x: 0, y: 3.5, 'text-anchor': 'middle' }, 'İlanınız'));
  fish.append(fishBody, tag);
  fish.style.display = 'none';
  svg.append(defs, bank, water, decor, ...ferries.map((f) => f.g), fish);
  container.prepend(svg);

  let width = 0;
  let end = 0;
  let base = 70;
  let scale = 1;
  const at = (t) => {
    const [offset, factor] = sample(Math.min(1, Math.max(0, t)));
    return [width / 2 + offset * scale, (base / 2) * factor];
  };
  const yOf = (t) => START + t * (end - START);
  const tOf = (y) => (y - START) / (end - START);

  const layout = () => {
    width = container.clientWidth;
    // Boğaz denizin (sayfanın altı) üst kenarına kadar iner, orada Marmara'ya karışır.
    end = sea ? sea.offsetTop + 40 : container.clientHeight;
    const narrow = width < 860;
    base = narrow ? 52 : 74;
    scale = narrow ? 0.6 : 1;
    svg.setAttribute('viewBox', `0 0 ${width} ${end}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', end);

    const left = [];
    const right = [];
    for (let y = START; y <= end; y += STEP) {
      const [cx, hw] = at(tOf(y));
      left.push(`${(cx - hw).toFixed(1)} ${y}`);
      right.push(`${(cx + hw).toFixed(1)} ${y}`);
    }
    // Kuzey ucu beyaz sayfada yuvarlak kapanır.
    const [topX, topHw] = at(0);
    const cap = `Q${topX.toFixed(1)} ${(START - topHw * 1.1).toFixed(1)} ${(topX - topHw).toFixed(1)} ${START}`;
    const d = `M${left.join(' L')} L${right.reverse().join(' L')} ${cap} Z`;
    bank.setAttribute('d', d);
    water.setAttribute('d', d);

    decor.replaceChildren();
    for (const bridge of BRIDGES) decor.append(drawBridge(bridge, at, yOf, narrow));
    decor.append(drawMaidensTower(at, yOf));
  };
  new ResizeObserver(layout).observe(container);
  layout();

  const placeFerries = (flow) => {
    const span = end - START;
    for (const f of ferries) {
      const travel = span + 60;
      const raw = (f.phase * travel + flow * f.speed) % travel;
      const y = START + (raw < 0 ? raw + travel : raw) - 30;
      const [cx, hw] = at(tOf(y));
      f.g.setAttribute('transform', `translate(${(cx + hw * f.lane).toFixed(1)} ${y.toFixed(1)}) scale(${f.speed > 0 ? 1 : -1} 1)`);
    }
  };

  // Bizim balık ekranın ortasına yakın kalır; sayfa kayarken de görünür.
  const placeFish = (time) => {
    if (fish.style.display === 'none') return;
    const top = container.getBoundingClientRect().top;
    const y = Math.min(end - 60, Math.max(START + 50, window.innerHeight * 0.58 - top));
    const [cx, hw] = at(tOf(y));
    const sway = Math.sin(time / 1400);
    const x = cx + sway * hw * 0.45;
    const bob = Math.sin(time / 300) * 2;
    fish.setAttribute('transform', `translate(${x.toFixed(1)} ${(y + bob).toFixed(1)})`);
    fishBody.setAttribute('transform', `scale(${Math.cos(time / 1400) >= 0 ? 1 : -1} 1) rotate(${(Math.sin(time / 180) * 6).toFixed(1)})`);
  };

  if (reduce) {
    placeFerries(0);
  } else {
    const frame = (t) => {
      const flow = t * 0.035 + window.scrollY * 0.6;
      pattern.setAttribute('patternTransform', `translate(0 ${(flow % 84).toFixed(1)})`);
      placeFerries(flow);
      placeFish(t);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  return {
    setOwnFish(visible) {
      fish.style.display = visible ? '' : 'none';
      placeFish(performance.now());
    },
  };
}

function drawBridge({ t, name, kind }, at, yOf, narrow) {
  const y = yOf(t);
  const [cx, hw] = at(t);
  const left = cx - hw - 26;
  const right = cx + hw + 26;
  const towerL = cx - hw - 6;
  const towerR = cx + hw + 6;
  const top = y - 38;
  const g = el('g', { class: 'kopru' });
  g.append(el('path', { class: 'kopru-tabliye', d: `M${left} ${y}H${right}` }));
  if (kind === 'egik') {
    // Eğik askılı: kulelerden tabliyeye yelpaze gibi açılan halatlar.
    const stays = [];
    for (const tower of [towerL, towerR]) {
      for (let i = 1; i <= 4; i++) {
        stays.push(`M${tower} ${top + 4}L${tower - i * 7} ${y}M${tower} ${top + 4}L${tower + i * 7} ${y}`);
      }
    }
    g.append(el('path', { class: 'kopru-halat ince', d: stays.join('') }));
  } else {
    const mid = (towerL + towerR) / 2;
    g.append(
      el('path', { class: 'kopru-halat', d: `M${left} ${y - 4}Q${(left + towerL) / 2} ${top + 14} ${towerL} ${top}Q${mid} ${y + 6} ${towerR} ${top}Q${(towerR + right) / 2} ${top + 14} ${right} ${y - 4}` }),
    );
    const hangers = [];
    for (let i = 1; i < 6; i++) {
      const x = towerL + ((towerR - towerL) * i) / 6;
      const k = (x - mid) / ((towerR - towerL) / 2);
      const cableY = y - 2 - (y + 6 - top) * k * k * 0.85;
      hangers.push(`M${x.toFixed(1)} ${cableY.toFixed(1)}V${y}`);
    }
    g.append(el('path', { class: 'kopru-halat ince', d: hangers.join('') }));
  }
  g.append(el('path', { class: 'kopru-kule', d: `M${towerL} ${y + 6}V${top}M${towerR} ${y + 6}V${top}` }));
  if (!narrow) g.append(el('text', { x: cx, y: y + 22, class: 'kopru-ad', 'text-anchor': 'middle' }, name));
  return g;
}

/** Kız Kulesi: Üsküdar açıklarında, Asya kıyısına yakın küçük adacıkta. */
function drawMaidensTower(at, yOf) {
  const y = yOf(0.9);
  const [cx, hw] = at(0.9);
  const x = cx + hw * 0.45;
  const g = el('g', { class: 'kiz-kulesi', transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` });
  g.append(
    el('ellipse', { class: 'kiz-kulesi-kaya', cx: 0, cy: 6, rx: 13, ry: 4 }),
    el('path', { class: 'kiz-kulesi-yapi', d: 'M-8 5V-4h16v9zM-4 -4v-10h8v10zM-4 -14l4-7 4 7z' }),
    el('path', { class: 'kiz-kulesi-bayrak', d: 'M0 -21v-6l4 1.6L0 -24' }),
  );
  return g;
}
