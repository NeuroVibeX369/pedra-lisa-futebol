import { CLUBS, LOCAL_CLUBS, REGIONAL_CLUBS, FINAL_CLUB } from './clubs.js';

export function setupPregame({ match } = {}) {
  const gate = document.getElementById('pregame-menu');
  if (!gate) {
    return { get open() { return false; }, close() {}, openMenu() {} };
  }

  const params = new URLSearchParams(location.search);
  // Link online e partida já escolhida entram direto no fluxo correspondente.
  let open = params.get('online') !== '1' && !params.get('room') && params.get('start') !== '1';
  gate.classList.toggle('hidden', !open);

  const friendly = document.getElementById('pg-friendly');
  const online = document.getElementById('pg-online');
  const master = document.getElementById('pg-master');
  const settings = document.getElementById('pg-settings');
  const back = document.getElementById('pg-back');
  const grid = gate.querySelector('.pg-grid');
  const title = gate.querySelector('.pg-title');
  const footer = gate.querySelector('.pg-footer');
  const settingsPanel = document.getElementById('settings');
  const settingsClose = document.getElementById('settings-close');

  // Nada clicado no lobby deve virar passe/chute no campo atrás dele.
  for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'keydown', 'keyup']) {
    gate.addEventListener(type, (e) => e.stopPropagation());
  }

  function close() {
    open = false;
    gate.classList.add('hidden');
  }

  function hideFriendlySetup() {
    gate.querySelector('.pg-friendly-setup')?.remove();
    if (grid) grid.style.display = '';
    if (title) title.textContent = 'ESCOLHA COMO JOGAR';
    if (footer) footer.style.display = '';
  }

  function openMenu() {
    hideFriendlySetup();
    open = true;
    gate.classList.remove('hidden');
  }

  function clubOptions(selectedId) {
    const groups = [
      ['LIGA DE INDEPENDÊNCIA', LOCAL_CLUBS],
      ['REGIONAL', REGIONAL_CLUBS],
      ['DESAFIO DOS CAMPEÕES', [FINAL_CLUB]],
    ];
    return groups.map(([label, clubs]) =>
      `<optgroup label="${label}">` +
      clubs.map((club) =>
        `<option value="${club.id}" ${club.id === selectedId ? 'selected' : ''}>${club.name} · OVR ${club.strength}</option>`
      ).join('') +
      '</optgroup>'
    ).join('');
  }

  function showFriendlySetup() {
    hideFriendlySetup();
    if (grid) grid.style.display = 'none';
    if (footer) footer.style.display = 'none';
    if (title) title.textContent = 'AMISTOSO · ESCOLHA OS TIMES';

    const box = document.createElement('div');
    box.className = 'pg-friendly-setup';
    box.innerHTML = `
      <div class="pg-versus">
        <label>
          <span>SEU TIME</span>
          <select id="pg-home-team">${clubOptions(params.get('home') || 'pedra-lisa')}</select>
        </label>
        <b>×</b>
        <label>
          <span>ADVERSÁRIO</span>
          <select id="pg-away-team">${clubOptions(params.get('away') || 'independencia')}</select>
        </label>
      </div>
      <div id="pg-match-preview" class="pg-match-preview"></div>
      <div class="pg-setup-actions">
        <button id="pg-friendly-back" type="button">← VOLTAR</button>
        <button id="pg-friendly-play" class="primary" type="button">JOGAR PARTIDA</button>
      </div>
      <div class="pg-setup-note">Todos os ${CLUBS.length} clubes usam o mesmo catálogo da Master Liga.</div>
    `;
    footer?.before(box);

    const home = box.querySelector('#pg-home-team');
    const away = box.querySelector('#pg-away-team');
    const preview = box.querySelector('#pg-match-preview');

    const sync = (changed) => {
      if (home.value === away.value) {
        const fallback = CLUBS.find((c) => c.id !== home.value);
        if (changed === home && fallback) away.value = fallback.id;
        else if (fallback) home.value = fallback.id;
      }
      const h = CLUBS.find((c) => c.id === home.value);
      const a = CLUBS.find((c) => c.id === away.value);
      if (preview && h && a) {
        preview.innerHTML =
          `<span style="border-color:${h.primary}"><b>${h.short}</b> OVR ${h.strength}</span>` +
          '<strong>×</strong>' +
          `<span style="border-color:${a.primary}"><b>${a.short}</b> OVR ${a.strength}</span>`;
      }
    };
    home.addEventListener('change', () => sync(home));
    away.addEventListener('change', () => sync(away));
    sync();

    box.querySelector('#pg-friendly-back')?.addEventListener('click', openMenu);
    box.querySelector('#pg-friendly-play')?.addEventListener('click', () => {
      const next = new URL(location.href);
      next.searchParams.delete('online');
      next.searchParams.delete('room');
      next.searchParams.set('mode', 'friendly');
      next.searchParams.set('home', home.value);
      next.searchParams.set('away', away.value);
      next.searchParams.set('side', 'home');
      next.searchParams.set('start', '1');
      location.href = next.toString();
    });
  }

  friendly?.addEventListener('click', showFriendlySetup);

  online?.addEventListener('click', () => {
    close();
    document.getElementById('key-online')?.click();
  });

  master?.addEventListener('click', () => {
    close();
    document.dispatchEvent(new CustomEvent('mukeka:master-open'));
  });

  document.addEventListener('mukeka:master-close', () => openMenu());

  settings?.addEventListener('click', () => {
    document.body.classList.add('pregame-settings');
    settingsPanel?.classList.add('show');
  });

  settingsClose?.addEventListener('click', () => {
    document.body.classList.remove('pregame-settings');
  });

  // Mantém a proteção contra saída acidental também no menu principal.
  let backArmed = false;
  let backTimer = null;
  back?.addEventListener('click', () => {
    if (!backArmed) {
      backArmed = true;
      back.textContent = 'TOQUE NOVAMENTE PARA SAIR';
      clearTimeout(backTimer);
      backTimer = setTimeout(() => {
        backArmed = false;
        back.innerHTML = '<strong>VOLTAR AO MUKEKA GAMES</strong><small>Retorna ao catálogo principal com confirmação.</small>';
      }, 2600);
      return;
    }
    location.href = '/';
  });

  return {
    get open() { return open; },
    close,
    openMenu,
  };
}
