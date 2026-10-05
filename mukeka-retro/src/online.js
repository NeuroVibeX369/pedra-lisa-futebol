import { Signal } from '../../src/net/signal.js';
import { relayFor } from '../../src/config.js';
import { RetroNetplay } from './netplay.js';

export function setupRetroOnlineTest({ onRole, match, ball, input } = {}) {
  const gate = document.getElementById('retro-online-test');
  if (!gate) {
    return {
      active: false,
      paused: false,
      beforeSimulation() {},
      afterSimulation() {},
      dispose() {},
    };
  }

  const status = document.getElementById('retro-online-status');
  const room = document.getElementById('retro-online-room');
  const inviteEl = document.getElementById('retro-online-invite');
  const codeInput = document.getElementById('retro-online-code');
  const hostBtn = document.getElementById('retro-online-host');
  const joinBtn = document.getElementById('retro-online-join');
  const soloBtn = document.getElementById('retro-online-solo');
  const copyBtn = document.getElementById('retro-online-copy');
  const shareBtn = document.getElementById('retro-online-share');
  const openBtn = document.getElementById('key-online');

  const params = new URLSearchParams(location.search);
  const invitedRoom = String(params.get('room') || '').trim().toUpperCase();
  let panelOpen = params.get('online') === '1' || /^[A-Z2-9]{4}$/.test(invitedRoom);
  if (panelOpen) gate.classList.remove('hidden');
  else gate.classList.add('hidden');

  let signal = null;
  let role = null;
  let peerReady = false;
  let netplay = null;
  let currentCode = '';
  let autoJoinDone = false;

  const say = (text) => { if (status) status.textContent = text; };

  function setOnlineUrl(enabled) {
    const next = new URL(location.href);
    if (enabled) next.searchParams.set('online', '1');
    else {
      next.searchParams.delete('online');
      next.searchParams.delete('room');
      next.searchParams.delete('side');
    }
    history.replaceState(null, '', next);
  }

  function inviteUrl(code) {
    const url = new URL(location.href);
    url.searchParams.set('online', '1');
    url.searchParams.set('room', code);
    url.searchParams.delete('side');
    return url.toString();
  }

  function showInvite(code) {
    currentCode = code || '';
    if (!currentCode) {
      room?.classList.add('hidden');
      if (inviteEl) {
        inviteEl.classList.remove('show');
        inviteEl.textContent = '';
      }
      copyBtn?.classList.add('hidden');
      shareBtn?.classList.add('hidden');
      return;
    }
    if (room) {
      room.textContent = currentCode;
      room.classList.remove('hidden');
    }
    if (inviteEl) {
      inviteEl.textContent = 'Envie este código ou o link de convite para seu amigo.';
      inviteEl.classList.add('show');
    }
    copyBtn?.classList.remove('hidden');
    if (navigator.share) shareBtn?.classList.remove('hidden');
  }

  function closeSignal() {
    if (!signal) return;
    signal.close();
    signal = null;
    netplay = null;
    peerReady = false;
  }

  function openPanel() {
    panelOpen = true;
    gate.classList.remove('hidden');
    gate.classList.remove('connected');
    setOnlineUrl(true);
    say('Crie uma sala ou digite o código enviado pelo seu amigo.');
  }

  function connect() {
    closeSignal();
    panelOpen = true;
    gate.classList.remove('hidden');
    gate.classList.remove('connected');
    setOnlineUrl(true);
    say('Conectando ao servidor...');
    signal = new Signal(relayFor(location));
    netplay = null;
    peerReady = false;

    signal.on('room', (m) => {
      role = m.role;
      const localTeam = role === 'guest' ? 1 : 0;
      if (role === 'host') showInvite(m.code || '');
      else showInvite('');
      onRole?.({ role, localTeam, code: m.code, signal });
      netplay = new RetroNetplay({ signal, role, match, ball, input });
      if (role === 'host') say('Sala criada. Envie o código ou convite e aguarde seu amigo.');
      else say('Entrando na sala...');
    });

    signal.on('peer', () => {
      peerReady = true;
      netplay?.setConnected(true);
      say(role === 'host'
        ? 'Amigo conectado! Você joga com o Pedra Lisa.'
        : 'Conectado! Você joga com o Independência.');
      gate.classList.add('connected');
      setTimeout(() => {
        if (peerReady) {
          panelOpen = false;
          gate.classList.add('hidden');
        }
      }, 1200);
    });

    signal.on('error', (m) => {
      say(m?.msg || 'Não foi possível conectar ao servidor.');
    });

    signal.on('close', () => {
      netplay?.setConnected(false);
      if (peerReady) say('Seu amigo saiu ou a conexão foi interrompida.');
      else say('A conexão com a sala foi encerrada.');
      peerReady = false;
      panelOpen = true;
      gate.classList.remove('connected');
      gate.classList.remove('hidden');
    });

    return signal;
  }

  function joinCode(code) {
    const clean = String(code || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{4}$/.test(clean)) {
      say('Digite o código de 4 caracteres da sala.');
      codeInput?.focus();
      return;
    }
    if (codeInput) codeInput.value = clean;
    const s = connect();
    s.on('open', () => s.join(clean));
  }

  openBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    openPanel();
  });

  hostBtn?.addEventListener('click', () => {
    showInvite('');
    const s = connect();
    s.on('open', () => s.create());
  });

  joinBtn?.addEventListener('click', () => joinCode(codeInput?.value));

  codeInput?.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 4);
  });
  codeInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinCode(codeInput.value);
  });

  copyBtn?.addEventListener('click', async () => {
    if (!currentCode) return;
    const text = inviteUrl(currentCode);
    try {
      await navigator.clipboard.writeText(text);
      say('Convite copiado. Agora envie para seu amigo.');
    } catch {
      if (inviteEl) {
        inviteEl.textContent = text;
        inviteEl.classList.add('show');
      }
      say('Copie o link mostrado e envie para seu amigo.');
    }
  });

  shareBtn?.addEventListener('click', async () => {
    if (!currentCode || !navigator.share) return;
    try {
      await navigator.share({
        title: 'Mukeka Retro · partida online',
        text: `Entre na minha sala do Mukeka Retro: ${currentCode}`,
        url: inviteUrl(currentCode),
      });
    } catch {
      // Cancelar o compartilhamento não é erro de jogo.
    }
  });

  soloBtn?.addEventListener('click', () => {
    closeSignal();
    role = null;
    currentCode = '';
    showInvite('');
    panelOpen = false;
    gate.classList.add('hidden');
    setOnlineUrl(false);
    if (match) match.setHumanTeamIndex?.(0);
  });

  // Um link de convite abre a sala e entra automaticamente, sem pedir para
  // o amigo digitar o código de novo.
  if (!autoJoinDone && /^[A-Z2-9]{4}$/.test(invitedRoom)) {
    autoJoinDone = true;
    if (codeInput) codeInput.value = invitedRoom;
    queueMicrotask(() => joinCode(invitedRoom));
  }

  return {
    get active() { return !!(signal || panelOpen || peerReady); },
    get paused() { return panelOpen && !peerReady; },
    get signal() { return signal; },
    get role() { return role; },
    get peerReady() { return peerReady; },
    beforeSimulation(now) { netplay?.beforeSimulation(now); },
    afterSimulation(now) { netplay?.afterSimulation(now); },
    dispose: closeSignal,
  };
}
