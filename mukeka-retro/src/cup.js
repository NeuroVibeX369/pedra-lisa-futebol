import { LOCAL_CLUBS, clubById } from './clubs.js';

const SAVE_KEY = 'mukeka.copa.v1';
const PENDING_KEY = 'mukeka.copa.pending.v1';

const byId = (id) => clubById(id);
const nameOf = (id) => byId(id)?.name || String(id || '').toUpperCase();
const strengthOf = (id) => Number(byId(id)?.strength) || 80;

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function save(state) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch {}
  return state;
}

function clearPending() {
  try { localStorage.removeItem(PENDING_KEY); } catch {}
}

function pending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function shuffled(ids) {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function roundName(count) {
  if (count === 4) return 'QUARTAS DE FINAL';
  if (count === 2) return 'SEMIFINAL';
  return 'GRANDE FINAL';
}

function makeFixtures(ids, round = 1) {
  const out = [];
  for (let i = 0; i < ids.length; i += 2) {
    out.push({
      id: `copa-r${round}-j${i / 2 + 1}`,
      home: ids[i],
      away: ids[i + 1],
      played: false,
      homeGoals: null,
      awayGoals: null,
      penalties: null,
      penaltyWinner: null,
    });
  }
  return out;
}

function newCup(userClub) {
  const ids = shuffled(LOCAL_CLUBS.map((c) => c.id));
  if (!ids.includes(userClub)) ids[0] = userClub;
  return {
    version: 1,
    userClub,
    round: 1,
    fixtures: makeFixtures(ids, 1),
    history: [],
    status: 'active',
    champion: null,
    notice: 'A Copa Mukeka começou. Três vitórias separam seu time do título.',
  };
}

function scoreOne(strength) {
  const base = 0.55 + (strength - 78) * 0.035;
  let g = 0;
  for (let i = 0; i < 5; i++) {
    if (Math.random() < Math.min(.55, base / 5)) g++;
  }
  if (Math.random() < Math.max(0.05, (strength - 82) * .015)) g++;
  return g;
}

function simulateGame(game) {
  if (!game || game.played) return game;
  const hs = strengthOf(game.home);
  const as = strengthOf(game.away);
  const hg = scoreOne(hs + 1.5);
  const ag = scoreOne(as);
  game.played = true;
  game.homeGoals = hg;
  game.awayGoals = ag;
  if (hg === ag) {
    const homeChance = Math.max(.32, Math.min(.68, .5 + (hs - as) / 80));
    const homeWins = Math.random() < homeChance;
    const low = 3 + Math.floor(Math.random() * 2);
    game.penalties = homeWins ? `${low + 1}–${low}` : `${low}–${low + 1}`;
    game.penaltyWinner = homeWins ? game.home : game.away;
  }
  return game;
}

function winner(game) {
  if (!game?.played) return null;
  if (game.homeGoals === game.awayGoals) return game.penaltyWinner;
  return game.homeGoals > game.awayGoals ? game.home : game.away;
}

function userFixture(state) {
  return state?.fixtures?.find((g) =>
    !g.played && (g.home === state.userClub || g.away === state.userClub)) || null;
}

function advanceIfReady(state) {
  if (!state || state.status !== 'active') return state;
  if (!state.fixtures.every((g) => g.played)) return state;

  const winners = state.fixtures.map(winner).filter(Boolean);
  const userAlive = winners.includes(state.userClub);
  state.history.unshift({
    round: roundName(state.fixtures.length),
    fixtures: state.fixtures.map((g) => ({ ...g })),
  });

  if (!userAlive) {
    state.status = 'eliminated';
    state.notice = `${nameOf(state.userClub)} foi eliminado da Copa Mukeka.`;
    return save(state);
  }

  if (winners.length === 1) {
    state.status = 'champion';
    state.champion = winners[0];
    state.notice = `${nameOf(winners[0])} É CAMPEÃO DA COPA MUKEKA!`;
    return save(state);
  }

  state.round += 1;
  state.fixtures = makeFixtures(winners, state.round);
  state.notice = winners.length === 4
    ? 'Classificado para a semifinal.'
    : 'Classificado para a grande final.';
  return save(state);
}

function simulateRound(state, includeUser = true) {
  for (const game of state.fixtures) {
    if (!game.played && (includeUser || (game.home !== state.userClub && game.away !== state.userClub))) {
      simulateGame(game);
    }
  }
  return advanceIfReady(save(state));
}

function savePending(state, fixture) {
  const p = {
    version: 1,
    round: state.round,
    fixtureId: fixture.id,
    home: fixture.home,
    away: fixture.away,
    userClub: state.userClub,
  };
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch {}
  return p;
}

function formatGame(g) {
  const score = g.played
    ? `${g.homeGoals} × ${g.awayGoals}${g.penalties ? ` <small>(pên. ${g.penalties})</small>` : ''}`
    : '×';
  return `
    <div class="cup-game ${g.played ? 'played' : ''}">
      <span>${nameOf(g.home)}</span>
      <b>${score}</b>
      <span>${nameOf(g.away)}</span>
    </div>`;
}

export function setupMukekaCup() {
  let state = load();
  let overlay = null;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'mukeka-cup';
    overlay.className = 'hidden';
    document.body.appendChild(overlay);
    for (const ev of ['pointerdown','pointerup','touchstart','touchend','keydown','keyup']) {
      overlay.addEventListener(ev, (e) => e.stopPropagation());
    }
    return overlay;
  }

  function close() {
    ensureOverlay().classList.add('hidden');
    document.dispatchEvent(new CustomEvent('mukeka:cup-close'));
  }

  function renderNewCup() {
    const el = ensureOverlay();
    const options = LOCAL_CLUBS.map((c) =>
      `<option value="${c.id}">${c.name} · FORÇA ${c.strength}</option>`).join('');
    el.innerHTML = `
      <div class="cup-shell">
        <div class="cup-top"><div><h2>COPA MUKEKA</h2><small>MATA-MATA · 8 CLUBES · JOGO ÚNICO</small></div><button id="cup-close">×</button></div>
        <div class="cup-body">
          <div class="cup-hero">
            <h3>ESCOLHA SEU CLUBE</h3>
            <p>Quartas de final, semifinal e grande final. Empate no mata-mata é decidido nos pênaltis.</p>
            <select id="cup-team">${options}</select>
            <button id="cup-start" class="cup-main">INICIAR COPA</button>
          </div>
        </div>
      </div>`;
    el.querySelector('#cup-close')?.addEventListener('click', close);
    el.querySelector('#cup-start')?.addEventListener('click', () => {
      state = newCup(el.querySelector('#cup-team')?.value || 'pedra-lisa');
      save(state);
      render();
    });
  }

  function render() {
    if (!state || !state.userClub) {
      renderNewCup();
      return;
    }
    const el = ensureOverlay();
    const fixture = userFixture(state);
    const finished = state.status !== 'active';
    const title = finished
      ? (state.status === 'champion' ? 'CAMPEÃO' : 'FIM DA CAMPANHA')
      : roundName(state.fixtures.length);

    el.innerHTML = `
      <div class="cup-shell">
        <div class="cup-top">
          <div><h2>COPA MUKEKA</h2><small>${nameOf(state.userClub)} · ${title}</small></div>
          <button id="cup-close">×</button>
        </div>
        <div class="cup-body">
          <div class="cup-notice">${state.notice || ''}</div>
          <div class="cup-round">
            <h3>${title}</h3>
            ${(state.fixtures || []).map(formatGame).join('')}
          </div>
          ${!finished && fixture ? `
            <div class="cup-next">
              <small>PRÓXIMO JOGO</small>
              <strong>${nameOf(fixture.home)} × ${nameOf(fixture.away)}</strong>
              <div>
                <button id="cup-play" class="cup-main">JOGAR PARTIDA</button>
                <button id="cup-sim">SIMULAR PARTIDA</button>
              </div>
            </div>` : ''}
          ${finished ? `
            <div class="cup-finish">
              <strong>${state.status === 'champion' ? '🏆 ' + nameOf(state.champion) : nameOf(state.userClub)}</strong>
              <button id="cup-new" class="cup-main">NOVA COPA</button>
            </div>` : ''}
          <button id="cup-reset" class="cup-danger">ABANDONAR COPA</button>
        </div>
      </div>`;

    el.querySelector('#cup-close')?.addEventListener('click', close);
    el.querySelector('#cup-play')?.addEventListener('click', () => {
      const game = userFixture(state);
      if (!game) return;
      savePending(state, game);
      const next = new URL(location.href);
      for (const key of ['online','room','masterHub','cupHub']) next.searchParams.delete(key);
      next.searchParams.set('mode', 'cup');
      next.searchParams.set('home', game.home);
      next.searchParams.set('away', game.away);
      next.searchParams.set('side', game.home === state.userClub ? 'home' : 'away');
      next.searchParams.set('start', '1');
      next.searchParams.set('cupRound', String(state.round));
      location.href = next.toString();
    });
    el.querySelector('#cup-sim')?.addEventListener('click', () => {
      state = simulateRound(state, true);
      render();
    });
    el.querySelector('#cup-new')?.addEventListener('click', () => {
      state = null;
      try { localStorage.removeItem(SAVE_KEY); } catch {}
      clearPending();
      renderNewCup();
    });
    el.querySelector('#cup-reset')?.addEventListener('click', () => {
      state = null;
      try { localStorage.removeItem(SAVE_KEY); } catch {}
      clearPending();
      renderNewCup();
    });
  }

  function openHub() {
    ensureOverlay().classList.remove('hidden');
    state = load();
    render();
  }

  function completePlayedMatch(score, report = null) {
    state = load();
    const p = pending();
    if (!state || !p || p.round !== state.round) {
      clearPending();
      return null;
    }
    const game = state.fixtures.find((g) => g.id === p.fixtureId && !g.played);
    if (!game) {
      clearPending();
      return null;
    }

    const hg = Math.max(0, Number(score?.[0]) || 0);
    const ag = Math.max(0, Number(score?.[1]) || 0);
    game.played = true;
    game.homeGoals = hg;
    game.awayGoals = ag;
    if (hg === ag) {
      const pens = report?.penalties;
      if (pens) {
        game.penalties = `${Number(pens.home) || 0}–${Number(pens.away) || 0}`;
        game.penaltyWinner = Number(pens.winnerTeamIndex) === 1 ? game.away : game.home;
      } else {
        const homeWins = Math.random() < .5;
        game.penalties = homeWins ? '5–4' : '4–5';
        game.penaltyWinner = homeWins ? game.home : game.away;
      }
    }

    simulateRound(state, false);
    state = advanceIfReady(state);
    clearPending();
    save(state);
    return { ...game };
  }

  document.addEventListener('mukeka:cup-open', openHub);

  return {
    get open() { return !!overlay && !overlay.classList.contains('hidden'); },
    openHub,
    close,
    completePlayedMatch,
  };
}
