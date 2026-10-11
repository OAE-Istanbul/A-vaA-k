const timeFormat = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
const clock = (ms) => timeFormat.format(ms).replace(':', '.');

/** Önizlemenin üstündeki kontrol çubuğu: kimin gözünden bakıldığı, saat ve botlar. */
export function mountPanel(preview) {
  const panel = document.createElement('div');
  panel.className = 'preview-panel';
  const hotelOptions = preview.hotels.map((h) => `<option value="${h.id}">Otel: ${h.name}</option>`).join('');
  panel.innerHTML = `
    <div class="preview-inner">
      <span class="preview-label">Önizleme</span>
      <label class="preview-field">Görünüm
        <select id="preview-view">
          <option value="ayse">Alıcı: Ayşe (evli çift, Boğaz)</option>
          <option value="mert">Alıcı: Mert (4 arkadaş, Kadıköy)</option>
          ${hotelOptions}
        </select>
      </label>
      <span class="preview-clock">Saat <strong id="preview-time"></strong></span>
      <button type="button" id="preview-advance">Saati 5 dk ileri al</button>
      <label class="preview-check"><input type="checkbox" id="preview-bots" checked> Rakip oteller teklif versin</label>
      <button type="button" id="preview-reset">Baştan başla</button>
    </div>
    <p class="preview-hint">Ekranlar gerçek uygulamanın aynısı. Rakip oteller kendiliğinden teklif verir; saati ileri alarak süre sonunu görebilirsiniz. Veriler yalnızca bu sekmede tutulur, otel PIN'i 1234.</p>`;
  document.body.prepend(panel);

  const view = panel.querySelector('#preview-view');
  const switchTo = (value) => {
    window.dispatchEvent(new CustomEvent('agva:session', { detail: preview.sessionFor(value) }));
  };
  const showTime = () => {
    panel.querySelector('#preview-time').textContent = clock(preview.now());
  };

  view.addEventListener('change', () => switchTo(view.value));
  panel.querySelector('#preview-advance').addEventListener('click', () => {
    preview.advance(5);
    showTime();
  });
  panel.querySelector('#preview-bots').addEventListener('change', (event) => preview.setBots(event.target.checked));
  panel.querySelector('#preview-reset').addEventListener('click', () => {
    preview.reset();
    view.value = 'ayse';
    switchTo('ayse');
    showTime();
  });

  showTime();
  setInterval(showTime, 1000);
  switchTo(view.value);
}
