// Basma, gönderme ve kabul anlarının hareketleri. Hepsi geçici öğelerle çalışır
// ve hareketi azalt ayarı açıksa hiç oynamaz.

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const at = (x, y, extra = '') => `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -50%) ${extra}`;

function floating(className, html) {
  const node = document.createElement('div');
  node.className = className;
  node.innerHTML = html;
  document.body.append(node);
  return node;
}

/** Basılan düğmede, parmağın değdiği yerden suya taş düşmüş gibi halka yayılır. */
export function pressRipple(event) {
  const target = event.target.closest('.dugme, .secim-dugme, .sayac-kontrol button, .menu-cikis');
  if (!target || target.disabled || reduced()) return;
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2.2;
  const ring = document.createElement('span');
  ring.className = 'basma-halkasi';
  ring.style.width = `${size}px`;
  ring.style.height = `${size}px`;
  ring.style.left = `${event.clientX - rect.left - size / 2}px`;
  ring.style.top = `${event.clientY - rect.top - size / 2}px`;
  target.append(ring);
  ring.addEventListener('animationend', () => ring.remove());
}

/** İlan dereye bırakılınca kağıt gemi düğmeden kalkar, dereye iner ve akıp gider. */
export function launchBoat(from, boatIcon) {
  if (reduced()) return;
  const boat = floating('kagit-gemi', boatIcon);
  const x = from.left + from.width / 2;
  const y = from.top + from.height / 2;
  const river = window.innerWidth / 2;
  const h = window.innerHeight;
  boat.animate(
    [
      { transform: at(x, y, 'scale(0.3) rotate(-24deg)'), opacity: 0 },
      { transform: at(x, y - 70, 'scale(1.3) rotate(10deg)'), opacity: 1, offset: 0.18 },
      { transform: at(river, Math.min(y, h * 0.55), 'scale(1.05) rotate(-8deg)'), offset: 0.42 },
      { transform: at(river + 18, h * 0.78, 'scale(0.95) rotate(7deg)'), offset: 0.72 },
      { transform: at(river - 6, h + 90, 'scale(0.85) rotate(-5deg)'), opacity: 0.9 },
    ],
    { duration: 2800, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' },
  ).onfinish = () => boat.remove();
}

/** Anlaşma anı: yapraklar düğmeden saçılır, döner ve süzülerek düşer. */
export function leafBurst(from, leafIcon, count = 16) {
  if (reduced()) return;
  const x = from.left + from.width / 2;
  const y = from.top + from.height / 2;
  for (let i = 0; i < count; i++) {
    const leaf = floating(`ucusan-yaprak ton-${i % 3}`, leafIcon);
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const distance = 80 + Math.random() * 110;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 50;
    const spin = Math.random() * 600 - 300;
    leaf.animate(
      [
        { transform: at(x, y, 'scale(0.2) rotate(0deg)'), opacity: 1 },
        { transform: at(x + dx, y + dy, `scale(1.1) rotate(${spin / 2}deg)`), opacity: 1, offset: 0.5 },
        { transform: at(x + dx * 1.25, y + dy + 120, `scale(0.7) rotate(${spin}deg)`), opacity: 0 },
      ],
      { duration: 1300 + Math.random() * 600, easing: 'cubic-bezier(0.2, 0.75, 0.3, 1)' },
    ).onfinish = () => leaf.remove();
  }
}

/** "Sepete ekle" gibi: verilen fiyat düğmeden uçup hedef kutuya girer, kutu zıplar. */
export function flyTo(text, from, target) {
  if (reduced() || !target) return;
  const to = target.getBoundingClientRect();
  const pill = floating('ucan-fiyat', text);
  const sx = from.left + from.width / 2;
  const sy = from.top + from.height / 2;
  const tx = to.left + to.width / 2;
  const ty = to.top + to.height / 2;
  pill.animate(
    [
      { transform: at(sx, sy, 'scale(0.6)'), opacity: 0 },
      { transform: at(sx, sy - 24, 'scale(1.2)'), opacity: 1, offset: 0.18 },
      { transform: at((sx + tx) / 2, Math.min(sy, ty) - 90, 'scale(1)'), offset: 0.55 },
      { transform: at(tx, ty, 'scale(0.6)'), opacity: 0.3 },
    ],
    { duration: 950, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' },
  ).onfinish = () => {
    pill.remove();
    target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }], {
      duration: 520,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    });
  };
}

/** Sayaçta değişen rakam zıplar. */
export function bump(node) {
  if (reduced() || !node) return;
  node.animate(
    [{ transform: 'translateY(-40%) scale(1.3)', opacity: 0.2 }, { transform: 'none', opacity: 1 }],
    { duration: 380, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  );
}

/** Bildirim aşağıdan yaylanarak çıkar. */
export function springIn(node) {
  if (reduced()) return;
  node.animate(
    [{ transform: 'translate(-50%, 140%) scale(0.9)' }, { transform: 'translate(-50%, 0) scale(1)' }],
    { duration: 520, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  );
}
