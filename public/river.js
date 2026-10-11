// Sayfanın ortasından kıvrılarak geçen Göksu. Su dokusu sürekli akar; sayfa aşağı
// kaydırıldıkça akış hızlanır, üstünde yapraklar sürüklenir. Hareketi azalt açıksa durur.

const NS = 'http://www.w3.org/2000/svg';
const STEP = 14;
// Dere gökyüzündeki suyun altından başlasın diye biraz yukarıdan çizilir.
const TOP = 28;
const LEAVES = 5;

const centerX = (y, w) => w / 2 + Math.sin(y / 230 + 0.6) * 20 + Math.sin(y / 97) * 6;
const halfWidth = (y, base) => base / 2 + Math.sin(y / 310 + 1.3) * 6;

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function riverPath(width, height, base) {
  const left = [];
  const right = [];
  for (let y = -STEP; y <= height + STEP; y += STEP) {
    const cx = centerX(y, width);
    const hw = halfWidth(y, base);
    left.push(`${(cx - hw).toFixed(1)} ${y}`);
    right.push(`${(cx + hw).toFixed(1)} ${y}`);
  }
  return `M${left.join(' L')} L${right.reverse().join(' L')} Z`;
}

// Akış dokusu: kıvrık ışık çizgileri ve küçük parıltılar.
const RIPPLES = [
  'M8 14q7-5 14 0', 'M40 6q6-4 12 0', 'M62 30q8-5 16 0', 'M18 44q6-4 12 0',
  'M48 56q7-5 14 0', 'M4 64q5-3 10 0', 'M70 70q5-3 10 0',
];

export function mountRiver(container) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const svg = el('svg', { class: 'nehir', 'aria-hidden': 'true', focusable: 'false' });
  const defs = el('defs');
  const pattern = el('pattern', { id: 'su-dokusu', width: '84', height: '84', patternUnits: 'userSpaceOnUse' });
  pattern.append(el('rect', { width: '84', height: '84', class: 'su-zemin' }));
  for (const d of RIPPLES) pattern.append(el('path', { d, class: 'su-cizgi' }));
  for (const [cx, cy] of [[30, 24], [74, 46], [12, 78]]) pattern.append(el('circle', { cx, cy, r: '1.2', class: 'su-parilti' }));
  const shade = el('linearGradient', { id: 'su-golge', x1: '0', x2: '1', y1: '0', y2: '0' });
  shade.append(el('stop', { offset: '0', class: 'su-kenar' }), el('stop', { offset: '0.5', class: 'su-orta' }), el('stop', { offset: '1', class: 'su-kenar' }));
  defs.append(pattern, shade);

  const bank = el('path', { class: 'nehir-kiyi' });
  const water = el('path', { class: 'su', fill: 'url(#su-dokusu)' });
  const depth = el('path', { class: 'derinlik', fill: 'url(#su-golge)' });
  const leaves = Array.from({ length: LEAVES }, (_, i) => {
    const g = el('g', { class: 'yaprak-suzen' });
    g.append(el('path', { d: 'M0 -7c4 2.6 5.3 6 3.5 10.4-.9 2.2-2.6 3.9-3.5 5.2-.9-1.3-2.6-3-3.5-5.2C-5.3-1 -4-4.4 0-7z' }));
    g.dataset.phase = String(i / LEAVES);
    g.dataset.speed = String(0.9 + (i % 3) * 0.25);
    return g;
  });
  svg.append(defs, bank, water, depth, ...leaves);
  container.prepend(svg);

  let width = 0;
  let height = 0;
  let base = 90;
  const layout = () => {
    // clientHeight yalnızca akıştaki içeriği ölçer; derenin kendi yüksekliği sayılmaz.
    width = container.clientWidth;
    height = container.clientHeight + TOP;
    base = width < 860 ? 60 : 84;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.style.top = `${-TOP}px`;
    const d = riverPath(width, height, base);
    bank.setAttribute('d', d);
    water.setAttribute('d', d);
    depth.setAttribute('d', d);
  };
  new ResizeObserver(layout).observe(container);
  layout();

  if (reduce) return;
  const frame = (t) => {
    // Sabit akış + kaydırmayla gelen ek akış.
    const flow = t * 0.035 + window.scrollY * 0.6;
    pattern.setAttribute('patternTransform', `translate(0 ${(flow % 84).toFixed(1)})`);
    for (const leaf of leaves) {
      const travel = height + 40;
      const y = ((Number(leaf.dataset.phase) * travel + flow * Number(leaf.dataset.speed)) % travel) - 20;
      const x = centerX(y, width) + Math.sin(y / 60 + Number(leaf.dataset.phase) * 9) * halfWidth(y, base) * 0.45;
      leaf.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((y / 3) % 360).toFixed(0)})`);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
