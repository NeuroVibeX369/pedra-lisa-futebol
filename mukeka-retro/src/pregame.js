export function setupPregame({ match } = {}) {
  const gate = document.getElementById('pregame-menu');
  if (!gate) {
    return { get open() { return false; }, close() {}, openMenu() {} };
  }

  const params = new URLSearchParams(location.search);
  // Links de convite e o modo online explícito precisam chegar direto à sala.
  let open = params.get('online') !== '1' && !params.get('room');
  gate.classList.toggle('hidden', !open);

  const friendly = document.getElementById('pg-friendly');
  const online = document.getElementById('pg-online');
  const master = document.getElementById('pg-master');
  const settings = document.getElementById('pg-settings');
  const back = document.getElementById('pg-back');
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

  function openMenu() {
    open = true;
    gate.classList.remove('hidden');
  }

  friendly?.addEventListener('click', () => {
    match?.setHumanTeamIndex?.(0);
    close();
  });

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
