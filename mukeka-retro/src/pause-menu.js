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

  function renderFormation(message = '') {
    if (!formationView) return;
    const idx = match?.humanTeamIndex === 1 ? 1 : 0;
    const info = match?.getSubstitutionState?.(idx);
    const fallback = pack?.teams?.[idx]?.squad || [];
    const active = info?.active || fallback.map((p, slot) => ({
      slot,
      name: p.name || 'JOGADOR',
      number: p.number || '—',
      position: p.position || '',
      overall: p.overall || null,
    }));
    const bench = info?.bench || [];
    const remaining = info?.remaining ?? 0;
    const qs = new URLSearchParams(location.search);
    const online = qs.get('mode') === 'online' || qs.get('online') === '1';

    const starters = active.map((p) =>
      `<div class="pause-lineup-player"><span>${p.number || '—'}</span><b>${p.name}</b><small>${p.position || ''}${p.overall ? ` · FORÇA ${p.overall}` : ''}</small></div>`
    ).join('');

    let substitutions = '';
    if (!online && bench.length) {
      const outOptions = active.map((p) =>
        `<option value="${p.slot}">${p.number || '—'} · ${p.name}${p.overall ? ` · ${p.overall}` : ''}</option>`
      ).join('');
      const inOptions = bench.map((p) =>
        `<option value="${p.benchIndex}">${p.number || '—'} · ${p.name}${p.position ? ` · ${p.position}` : ''}${p.overall ? ` · ${p.overall}` : ''}</option>`
      ).join('');

      substitutions = `
        <div class="pause-sub-box">
          <div class="pause-sub-title">SUBSTITUIÇÕES <span>${remaining}/${info?.max || 3}</span></div>
          ${remaining > 0 ? `
            <label>SAI<select id="pause-sub-out">${outOptions}</select></label>
            <label>ENTRA<select id="pause-sub-in">${inOptions}</select></label>
            <button id="pause-sub-confirm" type="button">CONFIRMAR TROCA</button>
          ` : '<div class="pause-sub-status">As três substituições já foram usadas.</div>'}
          ${message ? `<div class="pause-sub-status">${message}</div>` : ''}
        </div>`;
    }

    formationView.innerHTML = `
      <b>ESCALAÇÃO · 4-4-2</b>
      <div class="pause-lineup-list">${starters || '<span>Escalação indisponível.</span>'}</div>
      ${substitutions}
    `;
    formationView.classList.add('show');

    formationView.querySelector('#pause-sub-confirm')?.addEventListener('click', () => {
      const out = Number(formationView.querySelector('#pause-sub-out')?.value);
      const inn = Number(formationView.querySelector('#pause-sub-in')?.value);
      const result = match?.substitutePlayer?.(idx, out, inn);
      if (!result?.ok) {
        renderFormation(result?.reason || 'Não foi possível fazer a substituição.');
        return;
      }
      renderFormation(`${result.event.outName} SAI · ${result.event.inName} ENTRA · ${result.event.minute}'`);
    });
  }

  function showFormation() {
    if (!formationView) return;
    if (formationView.classList.contains('show')) {
      formationView.classList.remove('show');
      return;
    }
    renderFormation();
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
    for (const key of ['start','mode','home','away','side','masterMatch','masterStage','online','room']) {
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
