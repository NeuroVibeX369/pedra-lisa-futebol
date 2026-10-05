// Menu START/pausa do Mukeka Retro.
// Pausa o relógio pelo getter open; as ações de câmera/configuração são
// encaminhadas ao painel central, sem voltar a mostrar o antigo painel lateral.

export function setupPauseMenu({ match, pack } = {}) {
  const gate = document.getElementById('pause-menu');
  const startBtn = document.getElementById('pause-start');
  if (!gate || !startBtn) return { get open() { return false; }, update() {} };

  const resume = document.getElementById('pause-resume');
  const camera = document.getElementById('pause-camera');
  const formation = document.getElementById('pause-formation');
  const settings = document.getElementById('pause-settings');
  const fullscreen = document.getElementById('pause-fullscreen');
  const exitBtn = document.getElementById('pause-exit');
  const formationView = document.getElementById('pause-formation-view');

  let open = false;
  let padStartPrev = false;
  let exitArmed = false;
  let exitTimer = null;

  for (const type of ['pointerdown','pointerup','touchstart','touchend','keydown','keyup']) {
    gate.addEventListener(type, (e) => e.stopPropagation());
  }
  startBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

  function resetExit() {
    exitArmed = false;
    clearTimeout(exitTimer);
    if (exitBtn) exitBtn.textContent = 'SAIR DA PARTIDA';
  }

  function close() {
    open = false;
    gate.classList.add('hidden');
    formationView?.classList.remove('show');
    resetExit();
  }

  function show() {
    if (!match || match.state === 'fulltime') return;
    open = true;
    gate.classList.remove('hidden');
    resetExit();
  }

  function toggle() {
    if (open) close();
    else show();
  }

  function openSettings(section = null) {
    close();
    document.dispatchEvent(new CustomEvent('mukeka:settings-open', {
      detail: { section },
    }));
  }

  function showFormation() {
    if (!formationView) return;
    if (formationView.classList.contains('show')) {
      formationView.classList.remove('show');
      return;
    }
    const idx = match?.humanTeamIndex === 1 ? 1 : 0;
    const team = pack?.teams?.[idx];
    const squad = team?.squad || [];
    formationView.innerHTML =
      '<b>FORMAÇÃO ATUAL · 4-4-2</b><br>' +
      (squad.length
        ? squad.map((p) => `${p.number || '—'} · ${p.name || 'JOGADOR'} · FORÇA ${p.overall || '—'}`).join('<br>')
        : 'Escalação indisponível.') +
      '<br><br>Na Master Liga, trocas de titulares são feitas na tela ESCALAÇÃO antes da partida.';
    formationView.classList.add('show');
  }

  function leaveMatch() {
    if (!exitArmed) {
      exitArmed = true;
      exitBtn.textContent = 'CONFIRMAR SAÍDA';
      exitTimer = setTimeout(resetExit, 2600);
      return;
    }

    const next = new URL(location.href);
    const master = next.searchParams.get('mode') === 'master';
    for (const key of ['start','mode','home','away','side','masterMatch','online','room']) {
      next.searchParams.delete(key);
    }
    if (master) next.searchParams.set('masterHub', '1');
    location.href = next.toString();
  }

  startBtn.addEventListener('click', toggle);
  resume?.addEventListener('click', close);
  camera?.addEventListener('click', () => openSettings('CÂMERA'));
  settings?.addEventListener('click', () => openSettings(null));
  formation?.addEventListener('click', showFormation);
  fullscreen?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('mukeka:fullscreen-toggle'));
  });
  exitBtn?.addEventListener('click', leaveMatch);

  // P no teclado funciona como START sem disputar a tecla Esc com o navegador
  // em tela cheia.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyP' || e.repeat) return;
    if (document.getElementById('pregame-menu')?.classList.contains('hidden') === false) return;
    e.preventDefault();
    e.stopPropagation();
    toggle();
  }, true);

  function update() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((g) => g && g.connected);
    const now = !!pad?.buttons?.[9]?.pressed; // START / Options / Menu
    if (now && !padStartPrev) toggle();
    padStartPrev = now;
  }

  return {
    get open() { return open; },
    show,
    close,
    toggle,
    update,
  };
}
