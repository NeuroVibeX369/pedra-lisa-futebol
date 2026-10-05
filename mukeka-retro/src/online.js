import { Signal } from '../../src/net/signal.js';
import { relayFor } from '../../src/config.js';

export function setupRetroOnlineTest({ onRole } = {}) {
  const gate = document.getElementById('retro-online-test');
  if (!gate) return { active: false, dispose() {} };

  const params = new URLSearchParams(location.search);
  if (params.get('online') !== '1') {
    gate.classList.add('hidden');
    return { active: false, dispose() {} };
  }

  gate.classList.remove('hidden');

  const status = document.getElementById('retro-online-status');
  const room = document.getElementById('retro-online-room');
  const codeInput = document.getElementById('retro-online-code');
  const hostBtn = document.getElementById('retro-online-host');
  const joinBtn = document.getElementById('retro-online-join');
  const soloBtn = document.getElementById('retro-online-solo');

  let signal = null;
  let role = null;
  let peerReady = false;

  const say = (text) => { if (status) status.textContent = text; };

  function closeSignal() {
    if (!signal) return;
    signal.close();
    signal = null;
  }

  function connect() {
    closeSignal();
    say('Conectando ao servidor...');
    signal = new Signal(relayFor(location));

    signal.on('room', (m) => {
      role = m.role;
      const localTeam = role === 'guest' ? 1 : 0;
      if (room) {
        room.textContent = m.code || '';
        room.classList.toggle('hidden', !m.code);
      }
      onRole?.({ role, localTeam, code: m.code, signal });
      if (role === 'host') say('Sala criada. Aguardando o segundo jogador...');
      else say('Entrando na sala...');
    });

    signal.on('peer', () => {
      peerReady = true;
      say('Conexão entre os dois jogadores estabelecida. A sincronização da partida está em desenvolvimento.');
      gate.classList.add('connected');
    });

    signal.on('error', (m) => {
      say(m?.msg || 'Não foi possível conectar ao servidor.');
    });

    signal.on('close', () => {
      if (peerReady) say('O outro jogador saiu ou a conexão foi encerrada.');
    });

    return signal;
  }

  hostBtn?.addEventListener('click', () => {
    const s = connect();
    s.on('open', () => s.create());
  });

  joinBtn?.addEventListener('click', () => {
    const code = String(codeInput?.value || '').trim().toUpperCase();
    if (code.length !== 4) {
      say('Digite o código de 4 caracteres da sala.');
      codeInput?.focus();
      return;
    }
    const s = connect();
    s.on('open', () => s.join(code));
  });

  codeInput?.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 4);
  });

  soloBtn?.addEventListener('click', () => {
    closeSignal();
    const next = new URL(location.href);
    next.searchParams.delete('online');
    next.searchParams.delete('side');
    location.href = next.toString();
  });

  return {
    active: true,
    get signal() { return signal; },
    get role() { return role; },
    get peerReady() { return peerReady; },
    dispose: closeSignal,
  };
}
