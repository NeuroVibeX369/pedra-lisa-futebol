import {
  CLUBS,
  LOCAL_CLUBS as LOCAL_TEAMS,
  REGIONAL_CLUBS as REGIONAL_TEAMS,
  FINAL_CLUB as FINAL_BOSS,
  FORMATION_POSITIONS,
  buildClubCareerSquad,
  defaultLineupIds,
} from './clubs.js';

const SAVE_KEY = 'mukeka.masterLiga.v1';
const PENDING_KEY = 'mukeka.masterLiga.pendingMatch.v1';

const TEAM_BY_ID = new Map(CLUBS.map((t) => [t.id, t]));


const POSITIONS = [
  'GOL', 'LE', 'ZAG', 'ZAG', 'LD', 'VOL', 'MC', 'MEI', 'PE', 'ATA', 'PD',
  'GOL', 'ZAG', 'LD', 'VOL', 'MEI', 'ATA', 'PD',
];

const FIRST = [
  'André', 'Caio', 'Davi', 'Edson', 'Fábio', 'Gil', 'Iago', 'João', 'Kleber',
  'Lucas', 'Marcos', 'Neto', 'Paulo', 'Rafael', 'Renan', 'Samuel', 'Tiago',
  'Vitor', 'Wesley', 'Yuri', 'Alan', 'Bruno', 'César', 'Diego', 'Felipe',
];
const LAST = [
  'Alencar', 'Barros', 'Carvalho', 'Dantas', 'Freitas', 'Gomes', 'Lima',
  'Macedo', 'Nogueira', 'Oliveira', 'Pereira', 'Queiroz', 'Rocha', 'Sousa',
  'Teixeira', 'Vieira', 'Moura', 'Batista', 'Farias', 'Monteiro',
];

const PEDRA_LISA = [
  ['OLAVO LOBÃO', 'GOL', 83],
  ['NETO', 'LE', 80],
  ['DJHA', 'ZAG', 82],
  ['BASTIAOZÃO REI', 'ZAG', 84],
  ['BRUNO', 'LD', 81],
  ['MANOEL', 'VOL', 82],
  ['RONILTON', 'MC', 83],
  ['LUCIANO', 'MEI', 90],
  ['HÉLIO', 'PE', 85],
  ['BASTIAOZINHO', 'ATA', 92],
  ['RICARDO', 'PD', 84],
  ['JARDEL', 'GOL', 70],
  ['LORIVAL', 'ZAG', 72],
  ['NATANAEL', 'LD', 70],
  ['THEO LUCCA', 'VOL', 72],
  ['ISAAC', 'MEI', 73],
  ['ARTHUR', 'ATA', 74],
  ['DAVI', 'PD', 72],
]

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seedText) {
  let x = hash(seedText) || 123456789;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return ((x >>> 0) % 1000000) / 1000000;
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function money(v) {
  return Number(v || 0).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  });
}

function playerValue(p) {
  // Estilo Master Liga clássica: valor depende do FORÇA, não de idade.
  // Os jogadores não envelhecem, não perdem FORÇA e não se aposentam.
  return Math.max(3500, Math.round((p.overall ** 2) * 18 / 1000) * 1000);
}

function generatedSquad(team) {
  return buildClubCareerSquad(team);
}

function pedraLisaSquad() {
  return PEDRA_LISA.map(([name, position, overall], i) => ({
    id: `pedra-lisa-${i}`,
    name, position, overall, teamId: 'pedra-lisa',
    goals: 0, mvp: 0, appearances: 0,
  }));
}

function emptyTable(ids) {
  const table = {};
  for (const id of ids) {
    table[id] = { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
  }
  return table;
}

function sortTable(table) {
  return Object.values(table).sort((a, b) =>
    b.pts - a.pts ||
    (b.gf - b.ga) - (a.gf - a.ga) ||
    b.gf - a.gf ||
    teamName(a.id).localeCompare(teamName(b.id), 'pt-BR'));
}

function teamName(id) {
  return TEAM_BY_ID.get(id)?.name || id.toUpperCase();
}

function roundRobin(ids) {
  const teams = [...ids];
  if (teams.length % 2) teams.push(null);
  const n = teams.length;
  const rounds = [];
  let arr = [...teams];

  for (let r = 0; r < n - 1; r++) {
    const games = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (!a || !b) continue;
      const swap = r % 2 === 1;
      games.push({ home: swap ? b : a, away: swap ? a : b });
    }
    rounds.push(games);
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }

  const returnRounds = rounds.map((games) =>
    games.map((g) => ({ home: g.away, away: g.home })));
  return [...rounds, ...returnRounds].map((games, r) =>
    games.map((g, i) => ({
      id: `r${r + 1}-g${i + 1}`,
      round: r + 1,
      ...g,
      played: false,
      homeGoals: null,
      awayGoals: null,
    })));
}

function createMarket() {
  // Mercado fechado e permanente: não nasce uma geração nova a cada temporada.
  // Assim a Master Liga pode durar indefinidamente com o mesmo universo de
  // jogadores, como nos jogos clássicos.
  const random = rng('master-market-fixed');
  return Array.from({ length: 24 }, (_, i) => {
    const overall = 59 + Math.floor(random() * 21);
    const p = {
      id: `market-fixed-${i}`,
      name: `${FIRST[Math.floor(random() * FIRST.length)].toUpperCase()} ${LAST[Math.floor(random() * LAST.length)].toUpperCase()}`,
      position: POSITIONS[1 + Math.floor(random() * (POSITIONS.length - 1))],
      overall,
      teamId: null,
      goals: 0,
      mvp: 0,
      appearances: 0,
    };
    p.price = Math.round(playerValue(p) * (1.05 + random() * .35) / 1000) * 1000;
    return p;
  });
}

function newState() {
  const squads = {};
  squads['pedra-lisa'] = pedraLisaSquad();
  for (const team of [...LOCAL_TEAMS, ...REGIONAL_TEAMS, FINAL_BOSS]) {
    if (!squads[team.id]) squads[team.id] = generatedSquad(team);
  }
  const ids = LOCAL_TEAMS.map((t) => t.id);
  return {
    version: 1,
    clubId: 'pedra-lisa',
    season: 1,
    stage: 'local',
    localRound: 1,
    money: 80000,
    squads,
    lineup: defaultLineupIds(squads['pedra-lisa']),
    market: createMarket(),
    fixtures: roundRobin(ids),
    table: emptyTable(ids),
    groups: null,
    groupFixtures: [],
    groupTables: {},
    groupRound: 1,
    knockout: null,
    stats: {},
    titles: { local: 0, regional: 0, champions: 0 },
    history: [],
    matchHistory: [],
    notice: 'A Master Liga começou. O objetivo inicial é terminar entre os 2 primeiros.',
  };
}

function ensureLineup(state) {
  if (!state?.squads?.[state.clubId]) return state;
  const squad = state.squads[state.clubId];
  const valid = new Set(squad.map((p) => p.id));
  const next = [];
  const current = Array.isArray(state.lineup) ? state.lineup : [];

  for (let slot = 0; slot < 11; slot++) {
    const wanted = current[slot];
    if (wanted && valid.has(wanted) && !next.includes(wanted)) {
      next.push(wanted);
      continue;
    }

    const pos = FORMATION_POSITIONS[slot];
    let pick = squad
      .filter((p) => !next.includes(p.id) && p.position === pos)
      .sort((a, b) => (b.overall || 0) - (a.overall || 0))[0];
    if (!pick) {
      pick = squad
        .filter((p) => !next.includes(p.id) && (pos === 'GOL' ? p.position === 'GOL' : p.position !== 'GOL'))
        .sort((a, b) => (b.overall || 0) - (a.overall || 0))[0];
    }
    if (!pick) pick = squad.find((p) => !next.includes(p.id));
    if (pick) next.push(pick.id);
  }

  state.lineup = next;
  return state;
}

function syncPedraLisaBase(state) {
  if (!state?.squads?.['pedra-lisa']) return state;
  const squad = state.squads['pedra-lisa'];
  const market = Array.isArray(state.market) ? state.market : [];
  const base = pedraLisaSquad();

  for (let i = 0; i < base.length; i++) {
    const current = squad.find((p) => p.id === base[i].id);
    const listed = market.find((p) => p.id === base[i].id);
    const target = current || listed;

    if (target) {
      target.name = base[i].name;
      target.position = base[i].position;
      target.overall = base[i].overall;
      target.teamId = current ? 'pedra-lisa' : null;
    } else {
      // Migração de saves antigos que ainda não tinham os 18 atletas-base.
      // Se o jogador foi vendido e está no mercado, não o recriamos no clube.
      squad.push(base[i]);
    }
  }
  return state;
}

function syncOpponentBalance(state) {
  if (!state?.squads) return state;
  for (const team of [...LOCAL_TEAMS, ...REGIONAL_TEAMS, FINAL_BOSS]) {
    if (team.id === 'pedra-lisa') continue;
    const fresh = generatedSquad(team);
    const current = state.squads[team.id] || [];
    state.squads[team.id] = fresh.map((base) => {
      const old = current.find((p) => p.id === base.id);
      if (!old) return base;
      return {
        ...base,
        goals: old.goals || 0,
        mvp: old.mvp || 0,
        appearances: old.appearances || 0,
      };
    });
  }
  return state;
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!state || state.version !== 1) return null;
    syncPedraLisaBase(state);
    syncOpponentBalance(state);
    ensureLineup(state);
    return state;
  } catch {
    return null;
  }
}

function saveState(state) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch {}
}

function userSquad(state) {
  return state.squads[state.clubId] || [];
}

function startingPlayers(state, teamId) {
  const squad = state.squads[teamId] || [];
  if (!squad.length) return [];
  const ids = teamId === state.clubId && Array.isArray(state.lineup) && state.lineup.length
    ? state.lineup
    : defaultLineupIds(squad);
  const starters = ids.map((id) => squad.find((p) => p.id === id)).filter(Boolean);
  if (starters.length >= 11) return starters.slice(0, 11);
  return [...squad].sort((a, b) => (b.overall || 0) - (a.overall || 0)).slice(0, 11);
}

function teamStrength(state, id) {
  const starters = startingPlayers(state, id);
  if (!starters.length) return TEAM_BY_ID.get(id)?.strength || 60;
  return starters.reduce((sum, p) => sum + p.overall, 0) / starters.length;
}

function poissonLike(lambda, random) {
  let goals = 0;
  let remaining = lambda;
  while (remaining > 0) {
    if (random() < Math.min(.74, remaining / 2.4)) goals++;
    remaining -= .72 + random() * .55;
    if (goals >= 6) break;
  }
  return goals;
}

function choosePlayer(state, teamId, random, scorer = false, pool = null) {
  const squad = Array.isArray(pool) && pool.length ? pool : (state.squads[teamId] || []);
  if (!squad.length) return null;
  const weights = squad.map((p) => {
    let pos = 1;
    if (p.position === 'ATA') pos = scorer ? 5.2 : 2.1;
    else if (p.position === 'PE' || p.position === 'PD') pos = scorer ? 3.9 : 1.8;
    else if (p.position === 'MEI') pos = scorer ? 3.2 : 2.4;
    else if (p.position === 'MC') pos = scorer ? 1.8 : 2.1;
    else if (p.position === 'VOL') pos = 1.2;
    else if (p.position === 'GOL') pos = scorer ? .05 : 1.3;
    return pos * (0.55 + p.overall / 100);
  });
  let roll = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < squad.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return squad[i];
  }
  return squad[squad.length - 1];
}

function recordPlayerMatch(state, teamId, goals, won, seed) {
  const random = rng(seed);
  const starters = startingPlayers(state, teamId);
  const events = [];
  for (const p of starters) {
    p.appearances = (p.appearances || 0) + 1;
    p.mvp = (p.mvp || 0) + (won ? .8 : .3) + random() * .7 + p.overall / 250;
  }
  for (let g = 0; g < goals; g++) {
    const scorer = choosePlayer(state, teamId, random, true, starters);
    if (scorer) {
      scorer.goals = (scorer.goals || 0) + 1;
      scorer.mvp = (scorer.mvp || 0) + 2.1;
      events.push({
        careerId: scorer.id || null,
        name: scorer.name || 'GOL',
        minute: 2 + Math.floor(random() * 88),
      });
    }
  }
  events.sort((a, b) => a.minute - b.minute);
  return events;
}

function recordPlayedTeam(state, teamId, won, lineupIds, events, expectedGoals, seed, extraAppearanceIds = []) {
  const random = rng(seed);
  const squad = state.squads[teamId] || [];
  const ids = Array.isArray(lineupIds) && lineupIds.length
    ? lineupIds
    : defaultLineupIds(squad);
  const starters = ids.map((id) => squad.find((p) => p.id === id)).filter(Boolean);

  for (const p of starters) {
    p.appearances = (p.appearances || 0) + 1;
    p.mvp = (p.mvp || 0) + (won ? .8 : .3) + random() * .45 + p.overall / 260;
  }

  const starterSet = new Set(starters.map((p) => p.id));
  for (const id of new Set(extraAppearanceIds || [])) {
    if (!id || starterSet.has(id)) continue;
    const p = squad.find((x) => x.id === id);
    if (!p) continue;
    p.appearances = (p.appearances || 0) + 1;
    p.mvp = (p.mvp || 0) + (won ? .42 : .18) + random() * .25 + p.overall / 340;
  }

  let credited = 0;
  for (const event of events || []) {
    let scorer = event.careerId ? squad.find((p) => p.id === event.careerId) : null;
    if (!scorer && event.name) {
      scorer = squad.find((p) => String(p.name).toUpperCase() === String(event.name).toUpperCase());
    }
    if (!scorer) continue;
    scorer.goals = (scorer.goals || 0) + 1;
    scorer.mvp = (scorer.mvp || 0) + 2.2;
    credited += 1;
  }

  // Proteção para autogol/evento sem identificação: o placar nunca pode
  // divergir da artilharia total da partida por falha de identificação.
  for (let i = credited; i < expectedGoals; i++) {
    const scorer = choosePlayer(state, teamId, random, true, starters);
    if (scorer) {
      scorer.goals = (scorer.goals || 0) + 1;
      scorer.mvp = (scorer.mvp || 0) + 1.8;
    }
  }
}

function recordRealMatch(state, fixture, hg, ag, report) {
  const goals = Array.isArray(report?.goals) ? report.goals : [];
  const homeEvents = goals.filter((g) => Number(g.teamIndex) === 0);
  const awayEvents = goals.filter((g) => Number(g.teamIndex) === 1);

  const homeIds = fixture.home === state.clubId
    ? state.lineup
    : defaultLineupIds(state.squads[fixture.home] || []);
  const awayIds = fixture.away === state.clubId
    ? state.lineup
    : defaultLineupIds(state.squads[fixture.away] || []);

  const substitutions = Array.isArray(report?.substitutions) ? report.substitutions : [];
  const homeSubs = substitutions
    .filter((x) => Number(x.teamIndex) === 0)
    .map((x) => x.inCareerId)
    .filter(Boolean);
  const awaySubs = substitutions
    .filter((x) => Number(x.teamIndex) === 1)
    .map((x) => x.inCareerId)
    .filter(Boolean);

  recordPlayedTeam(state, fixture.home, hg > ag, homeIds, homeEvents, hg,
    `real-${state.season}-${fixture.id}-home`, homeSubs);
  recordPlayedTeam(state, fixture.away, ag > hg, awayIds, awayEvents, ag,
    `real-${state.season}-${fixture.id}-away`, awaySubs);
}

function simulateScore(state, home, away, seed) {
  const random = rng(seed + '-' + Date.now() + '-' + Math.random());
  const hs = teamStrength(state, home);
  const as = teamStrength(state, away);
  const homeLambda = clamp(1.15 + (hs - as) / 16 + .22, .2, 3.7);
  const awayLambda = clamp(1.05 + (as - hs) / 16, .2, 3.5);
  return [poissonLike(homeLambda, random), poissonLike(awayLambda, random)];
}

function updateTable(table, home, away, hg, ag) {
  const h = table[home];
  const a = table[away];
  if (!h || !a) return;
  h.p++; a.p++;
  h.gf += hg; h.ga += ag;
  a.gf += ag; a.ga += hg;
  if (hg > ag) {
    h.w++; a.l++; h.pts += 3;
  } else if (ag > hg) {
    a.w++; h.l++; a.pts += 3;
  } else {
    h.d++; a.d++; h.pts++; a.pts++;
  }
}

function payForUserMatch(state, home, away, hg, ag, stage) {
  if (home !== state.clubId && away !== state.clubId) return;
  const isHome = home === state.clubId;
  const userGoals = isHome ? hg : ag;
  const oppGoals = isHome ? ag : hg;
  let income = isHome ? 7000 : 4500;
  if (stage.startsWith('regional')) income += 3500;
  if (stage.startsWith('knockout')) income += 6000;
  if (stage === 'champions') income += 12000;
  if (userGoals > oppGoals) income += 4500;
  else if (userGoals === oppGoals) income += 1800;
  state.money += income;
  state.notice = `Receita da partida: ${money(income)}.`;
}

function applyFixtureScore(state, fixture, table, stage, hg, ag) {
  if (!fixture || fixture.played) return fixture;
  fixture.played = true;
  fixture.homeGoals = Math.max(0, Number(hg) || 0);
  fixture.awayGoals = Math.max(0, Number(ag) || 0);
  if (table) updateTable(table, fixture.home, fixture.away, fixture.homeGoals, fixture.awayGoals);

  const homeEvents = recordPlayerMatch(
    state, fixture.home, fixture.homeGoals, fixture.homeGoals > fixture.awayGoals,
    `${fixture.id}-home-${state.season}`,
  ).map((g) => ({ ...g, teamIndex: 0 }));
  const awayEvents = recordPlayerMatch(
    state, fixture.away, fixture.awayGoals, fixture.awayGoals > fixture.homeGoals,
    `${fixture.id}-away-${state.season}`,
  ).map((g) => ({ ...g, teamIndex: 1 }));
  fixture.goals = [...homeEvents, ...awayEvents].sort((a, b) => a.minute - b.minute);

  payForUserMatch(state, fixture.home, fixture.away, fixture.homeGoals, fixture.awayGoals, stage);

  if (fixture.home === state.clubId || fixture.away === state.clubId) {
    state.matchHistory = Array.isArray(state.matchHistory) ? state.matchHistory : [];
    state.matchHistory.unshift({
      season: state.season,
      stage,
      home: fixture.home,
      away: fixture.away,
      homeGoals: fixture.homeGoals,
      awayGoals: fixture.awayGoals,
      simulated: true,
      goals: fixture.goals.map((g) => ({ ...g })),
    });
    state.matchHistory = state.matchHistory.slice(0, 40);
  }

  return fixture;
}

function simulateFixture(state, fixture, table, stage) {
  const [hg, ag] = simulateScore(state, fixture.home, fixture.away,
    `${state.season}-${stage}-${fixture.id}`);
  return applyFixtureScore(state, fixture, table, stage, hg, ag);
}

function currentLocalRound(state) {
  return state.fixtures.filter((f) => f.round === state.localRound && !f.played);
}

function seasonAwards(state) {
  const players = Object.values(state.squads).flat();
  const scorer = [...players].sort((a, b) =>
    (b.goals || 0) - (a.goals || 0) || b.overall - a.overall)[0] || null;
  const mvp = [...players].sort((a, b) =>
    (b.mvp || 0) - (a.mvp || 0) || b.overall - a.overall)[0] || null;
  return { scorer, mvp };
}

function resetSeasonStats(state) {
  // O elenco é atemporal: ninguém envelhece, se aposenta ou sofre queda
  // automática de FORÇA entre temporadas. Apenas os números da temporada zeram.
  for (const squad of Object.values(state.squads)) {
    for (const p of squad) {
      p.goals = 0;
      p.mvp = 0;
      p.appearances = 0;
    }
  }
  for (const p of state.market || []) {
    p.goals = 0;
    p.mvp = 0;
    p.appearances = 0;
  }
}

function startNextSeason(state, summary) {
  const awards = seasonAwards(state);
  state.history.unshift({
    season: state.season,
    summary,
    topScorer: awards.scorer ? `${awards.scorer.name} (${awards.scorer.goals})` : '—',
    bestPlayer: awards.mvp ? `${awards.mvp.name} (FORÇA ${awards.mvp.overall})` : '—',
    money: state.money,
  });
  state.history = state.history.slice(0, 12);
  resetSeasonStats(state);
  state.season += 1;
  state.stage = 'local';
  state.localRound = 1;
  const ids = LOCAL_TEAMS.map((t) => t.id);
  state.fixtures = roundRobin(ids);
  state.table = emptyTable(ids);
  state.groups = null;
  state.groupFixtures = [];
  state.groupTables = {};
  state.groupRound = 1;
  state.knockout = null;
  // O mercado continua com os mesmos jogadores disponíveis; não criamos
  // atletas novos automaticamente ao virar a temporada.
  state.notice = `Temporada ${state.season} iniciada. ${summary}`;
}

function startRegional(state, qualifiers) {
  const ids = [...qualifiers, ...REGIONAL_TEAMS.map((t) => t.id)];
  const random = rng(`regional-${state.season}`);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  state.groups = { A: [], B: [], C: [], D: [] };
  const letters = ['A', 'B', 'C', 'D'];
  ids.forEach((id, i) => state.groups[letters[i % 4]].push(id));
  state.groupTables = {};
  state.groupFixtures = [];
  for (const letter of letters) {
    state.groupTables[letter] = emptyTable(state.groups[letter]);
    const fixtures = roundRobin(state.groups[letter]);
    for (const f of fixtures) {
      state.groupFixtures.push({ ...f, id: `${letter}-${f.id}`, group: letter });
    }
  }
  state.groupRound = 1;
  state.stage = 'regional-groups';
  state.money += 25000;
  state.notice = `Classificação conquistada! Bônus regional: ${money(25000)}.`;
}

function endLocal(state) {
  const rank = sortTable(state.table);
  const pos = rank.findIndex((r) => r.id === state.clubId) + 1;
  if (pos === 1) {
    state.titles.local += 1;
    state.money += 50000;
  } else if (pos === 2) {
    state.money += 30000;
  }
  if (pos <= 2) {
    startRegional(state, [rank[0].id, rank[1].id]);
  } else {
    startNextSeason(state, `Pedra Lisa terminou a Liga de Independência em ${pos}º e não avançou ao Regional.`);
  }
}

function simulateLocalRound(state) {
  const games = currentLocalRound(state);
  for (const game of games) simulateFixture(state, game, state.table, 'local');
  state.localRound += 1;
  if (state.localRound > 14) endLocal(state);
}

function currentGroupRound(state) {
  return state.groupFixtures.filter((f) => f.round === state.groupRound && !f.played);
}

function startKnockout(state, qualified) {
  const pairs = [
    [qualified.A[0], qualified.B[1]],
    [qualified.B[0], qualified.A[1]],
    [qualified.C[0], qualified.D[1]],
    [qualified.D[0], qualified.C[1]],
  ];
  state.stage = 'knockout-qf';
  state.knockout = {
    round: 'QUARTAS DE FINAL',
    fixtures: pairs.map(([home, away], i) => ({
      id: `qf-${i + 1}`, home, away, played: false, homeGoals: null, awayGoals: null,
    })),
  };
  state.notice = 'Pedra Lisa avançou para as quartas de final do Regional.';
}

function endGroups(state) {
  const qualified = {};
  for (const letter of ['A', 'B', 'C', 'D']) {
    qualified[letter] = sortTable(state.groupTables[letter]).slice(0, 2).map((x) => x.id);
  }
  const all = Object.values(qualified).flat();
  if (!all.includes(state.clubId)) {
    startNextSeason(state, 'Pedra Lisa foi eliminado na fase de grupos do Regional.');
    return;
  }
  state.money += 25000;
  startKnockout(state, qualified);
}

function simulateGroupRound(state) {
  for (const game of currentGroupRound(state)) {
    simulateFixture(state, game, state.groupTables[game.group], 'regional-groups');
  }
  state.groupRound += 1;
  if (state.groupRound > 6) endGroups(state);
}

function knockoutWinner(state, game, stage) {
  if (!game.played) simulateFixture(state, game, null, stage);
  if (game.homeGoals === game.awayGoals) {
    const hs = teamStrength(state, game.home);
    const as = teamStrength(state, game.away);
    const random = rng(`${state.season}-pens-${game.id}-${Math.random()}`);
    const homeWins = random() < clamp(.5 + (hs - as) / 100, .3, .7);
    game.penalties = homeWins ? '5–4' : '4–5';
    return homeWins ? game.home : game.away;
  }
  return game.homeGoals > game.awayGoals ? game.home : game.away;
}

function advanceKnockout(state) {
  const ko = state.knockout;
  const winners = ko.fixtures.map((g) => knockoutWinner(state, g, state.stage));
  if (!winners.includes(state.clubId)) {
    startNextSeason(state, `Pedra Lisa foi eliminado no Regional (${ko.round}).`);
    return;
  }

  if (state.stage === 'knockout-qf') {
    state.stage = 'knockout-sf';
    state.knockout = {
      round: 'SEMIFINAL',
      fixtures: [
        { id: 'sf-1', home: winners[0], away: winners[1], played: false },
        { id: 'sf-2', home: winners[2], away: winners[3], played: false },
      ],
    };
    state.money += 30000;
    state.notice = 'Classificado para a semifinal do Regional.';
    return;
  }

  if (state.stage === 'knockout-sf') {
    state.stage = 'knockout-final';
    state.knockout = {
      round: 'FINAL REGIONAL',
      fixtures: [{ id: 'regional-final', home: winners[0], away: winners[1], played: false }],
    };
    state.money += 45000;
    state.notice = 'Pedra Lisa está na grande final do Regional.';
    return;
  }

  if (state.stage === 'knockout-final') {
    state.titles.regional += 1;
    state.money += 120000;
    state.stage = 'champions';
    state.knockout = {
      round: 'DESAFIO DOS CAMPEÕES',
      fixtures: [{
        id: 'champions-final',
        home: state.clubId,
        away: FINAL_BOSS.id,
        played: false,
      }],
    };
    state.notice = 'CAMPEÃO REGIONAL! Agora vem o desafio contra o Fortaleza CE.';
  }
}

function simulateChampions(state) {
  const game = state.knockout.fixtures[0];
  const winner = knockoutWinner(state, game, 'champions');
  if (winner === state.clubId) {
    state.titles.champions += 1;
    state.money += 220000;
    startNextSeason(state, 'Pedra Lisa venceu o Fortaleza CE e conquistou a Copa dos Campeões!');
  } else {
    state.money += 70000;
    startNextSeason(state, 'Pedra Lisa foi campeão regional, mas perdeu o Desafio dos Campeões para o Fortaleza CE.');
  }
}

function fixtureResult(fixture) {
  if (!fixture) return null;
  return {
    id: fixture.id,
    home: fixture.home,
    away: fixture.away,
    homeName: teamName(fixture.home),
    awayName: teamName(fixture.away),
    homeGoals: fixture.homeGoals,
    awayGoals: fixture.awayGoals,
    penalties: fixture.penalties || null,
    goals: Array.isArray(fixture.goals) ? fixture.goals.map((g) => ({ ...g })) : [],
  };
}

function simulateNext(state) {
  const stageLabel = currentStageLabel(state);
  const focus = nextUserFixture(state);
  let games = [];
  if (state.stage === 'local') games = [...currentLocalRound(state)];
  else if (state.stage === 'regional-groups') games = [...currentGroupRound(state)];
  else if (state.knockout) games = state.knockout.fixtures.filter((f) => !f.played);

  if (state.stage === 'local') simulateLocalRound(state);
  else if (state.stage === 'regional-groups') simulateGroupRound(state);
  else if (state.stage.startsWith('knockout-')) advanceKnockout(state);
  else if (state.stage === 'champions') simulateChampions(state);

  saveState(state);
  return {
    stageLabel,
    focus: fixtureResult(focus),
    results: games.map(fixtureResult).filter(Boolean),
  };
}

function currentStageLabel(state) {
  if (state.stage === 'local') return `Liga de Independência · Rodada ${Math.min(state.localRound, 14)}/14`;
  if (state.stage === 'regional-groups') return `Regional · Grupos · Rodada ${Math.min(state.groupRound, 6)}/6`;
  if (state.stage.startsWith('knockout-')) return `Regional · ${state.knockout?.round || 'Mata-mata'}`;
  if (state.stage === 'champions') return 'Desafio dos Campeões · Fortaleza CE';
  return state.stage;
}

function nextUserFixture(state) {
  let list = [];
  if (state.stage === 'local') list = currentLocalRound(state);
  else if (state.stage === 'regional-groups') list = currentGroupRound(state);
  else if (state.knockout) list = state.knockout.fixtures.filter((f) => !f.played);
  return list.find((f) => f.home === state.clubId || f.away === state.clubId) || null;
}

function pendingMatch() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePendingMatch(state, fixture) {
  const pending = {
    version: 1,
    season: state.season,
    stage: state.stage,
    fixtureId: fixture.id,
    group: fixture.group || null,
    home: fixture.home,
    away: fixture.away,
  };
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(pending)); } catch {}
  return pending;
}

function clearPendingMatch() {
  try { localStorage.removeItem(PENDING_KEY); } catch {}
}

function findPendingFixture(state, pending) {
  if (!pending || pending.season !== state.season || pending.stage !== state.stage) return null;
  let pool = [];
  if (state.stage === 'local') pool = state.fixtures;
  else if (state.stage === 'regional-groups') pool = state.groupFixtures;
  else if (state.knockout) pool = state.knockout.fixtures;
  return pool.find((f) => f.id === pending.fixtureId &&
    f.home === pending.home && f.away === pending.away) || null;
}

function completePlayedMatch(state, score, report = null) {
  const pending = pendingMatch();
  const fixture = findPendingFixture(state, pending);
  if (!fixture || fixture.played || !Array.isArray(score) || score.length < 2) {
    clearPendingMatch();
    return null;
  }

  const hg = Math.max(0, Number(score[0]) || 0);
  const ag = Math.max(0, Number(score[1]) || 0);
  let table = null;
  if (state.stage === 'local') table = state.table;
  else if (state.stage === 'regional-groups') table = state.groupTables[fixture.group];

  // Resultado real: tabela e finanças usam o mesmo caminho da simulação,
  // mas os gols/participações vêm dos jogadores que realmente estiveram em campo.
  fixture.played = true;
  fixture.homeGoals = hg;
  fixture.awayGoals = ag;
  if (table) updateTable(table, fixture.home, fixture.away, hg, ag);
  recordRealMatch(state, fixture, hg, ag, report);
  payForUserMatch(state, fixture.home, fixture.away, hg, ag, state.stage);

  const goals = Array.isArray(report?.goals) ? report.goals : [];
  state.matchHistory = Array.isArray(state.matchHistory) ? state.matchHistory : [];
  state.matchHistory.unshift({
    season: state.season,
    stage: state.stage,
    home: fixture.home,
    away: fixture.away,
    homeGoals: hg,
    awayGoals: ag,
    goals: goals.map((g) => ({
      teamIndex: Number(g.teamIndex) || 0,
      careerId: g.careerId || null,
      name: g.name || 'GOL',
      minute: Number(g.minute) || null,
    })),
  });
  state.matchHistory = state.matchHistory.slice(0, 40);

  // Depois do jogo real, os demais confrontos da mesma rodada continuam
  // sendo simulados pelo motor da carreira. O confronto do usuário já está
  // marcado como jogado, então não é sobrescrito.
  if (state.stage === 'local') simulateLocalRound(state);
  else if (state.stage === 'regional-groups') simulateGroupRound(state);
  else if (state.stage.startsWith('knockout-')) advanceKnockout(state);
  else if (state.stage === 'champions') simulateChampions(state);

  clearPendingMatch();
  saveState(state);
  return {
    home: pending.home,
    away: pending.away,
    homeName: teamName(pending.home),
    awayName: teamName(pending.away),
    homeGoals: hg,
    awayGoals: ag,
    goals,
  };
}

function topPlayers(state, key) {
  return Object.values(state.squads).flat().sort((a, b) =>
    (b[key] || 0) - (a[key] || 0) || b.overall - a.overall).slice(0, 10);
}

function renderRows(items, cells) {
  return items.map((item, i) =>
    `<div class="ml-row">${cells(item, i).map((x) => `<span>${x}</span>`).join('')}</div>`).join('');
}

export function setupMasterLeague() {
  const gate = document.getElementById('master-league');
  if (!gate) return { get open() { return false; } };

  let open = false;
  let state = loadState();
  let tab = 'overview';
  let simulationResult = null;

  const body = document.getElementById('ml-body');
  const title = document.getElementById('ml-title');
  const meta = document.getElementById('ml-meta');
  const closeBtn = document.getElementById('ml-close');

  const persist = () => state && saveState(state);

  function renderOverview() {
    const fixture = nextUserFixture(state);
    const rank = state.stage === 'local' ? sortTable(state.table) : null;
    const pos = rank ? rank.findIndex((r) => r.id === state.clubId) + 1 : null;
    const str = Math.round(teamStrength(state, state.clubId));
    return `
      <div class="ml-kpis">
        <div><b>${money(state.money)}</b><small>CAIXA</small></div>
        <div><b>${str}</b><small>FORÇA DO TIME</small></div>
        <div><b>${pos || '—'}º</b><small>CLASSIFICAÇÃO</small></div>
        <div><b>${state.season}</b><small>TEMPORADA</small></div>
      </div>
      <div class="ml-card">
        <h3>PRÓXIMO COMPROMISSO</h3>
        <p class="ml-next-match">${fixture ? `${teamName(fixture.home)} × ${teamName(fixture.away)}` : 'Próximo adversário em definição.'}</p>
        <small>${currentStageLabel(state)}</small>
        ${fixture ? '<button id="ml-play" class="ml-main" type="button">JOGAR PARTIDA</button>' : ''}
        <button id="ml-next" class="ml-main" type="button">${fixture ? 'SIMULAR PARTIDA' : 'AVANÇAR'}</button>
        <p class="ml-note">Jogue a partida ou simule para ver o placar, autores dos gols e os demais resultados da rodada.</p>
      </div>
      <div class="ml-card">
        <h3>OBJETIVO DA TEMPORADA</h3>
        <p>Terminar entre os <b>2 primeiros</b> da Liga de Independência para disputar o Regional.</p>
        <p>Campeão Regional → enfrenta o <b>Fortaleza CE</b> no Desafio dos Campeões.</p>
      </div>
      <div class="ml-card">
        <h3>TÍTULOS</h3>
        <div class="ml-titles">
          <span>LIGA LOCAL <b>${state.titles.local}</b></span>
          <span>REGIONAL <b>${state.titles.regional}</b></span>
          <span>CAMPEÕES <b>${state.titles.champions}</b></span>
        </div>
      </div>
      <div class="ml-card ml-notice">${state.notice || ''}</div>
    `;
  }

  function renderTable() {
    let sections = '';
    if (state.stage === 'regional-groups' && state.groups) {
      for (const letter of ['A', 'B', 'C', 'D']) {
        sections += `<h3>GRUPO ${letter}</h3>${tableHTML(sortTable(state.groupTables[letter]))}`;
      }
      return sections;
    }
    if (state.stage.startsWith('knockout-') || state.stage === 'champions') {
      const games = state.knockout?.fixtures || [];
      return `<h3>${state.knockout?.round || 'MATA-MATA'}</h3>` +
        renderRows(games, (g) => [
          teamName(g.home),
          g.played ? `${g.homeGoals} × ${g.awayGoals}${g.penalties ? ` (pên. ${g.penalties})` : ''}` : '×',
          teamName(g.away),
        ]);
    }
    return tableHTML(sortTable(state.table));
  }

  function tableHTML(rank) {
    return `<div class="ml-row ml-head"><span># TIME</span><span>J</span><span>SG</span><span>PTS</span></div>` +
      renderRows(rank, (r, i) => [
        `${i + 1}. ${teamName(r.id)}`,
        r.p,
        r.gf - r.ga,
        `<b>${r.pts}</b>`,
      ]);
  }

  function renderSquad() {
    const squad = [...userSquad(state)].sort((a, b) => b.overall - a.overall);
    return `<div class="ml-row ml-head"><span>JOGADOR</span><span>POS</span><span>FORÇA</span><span>VALOR</span></div>` +
      renderRows(squad, (p) => [
        p.name,
        p.position,
        `<b>${p.overall}</b>`,
        `${money(playerValue(p))} <button class="ml-sell" data-id="${p.id}" type="button">VENDER</button>`,
      ]);
  }

  function renderLineup() {
    ensureLineup(state);
    const squad = userSquad(state);
    const starters = new Set(state.lineup || []);
    const optionsFor = (slot) => {
      const selected = state.lineup[slot];
      const ordered = [...squad].sort((a, b) => {
        const pa = a.position === FORMATION_POSITIONS[slot] ? 0 : 1;
        const pb = b.position === FORMATION_POSITIONS[slot] ? 0 : 1;
        return pa - pb || (b.overall || 0) - (a.overall || 0);
      });
      return ordered.map((p) =>
        `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${p.name} · ${p.position} · FORÇA ${p.overall}</option>`
      ).join('');
    };

    const rows = FORMATION_POSITIONS.map((pos, slot) => {
      const p = squad.find((x) => x.id === state.lineup[slot]);
      const out = p && p.position !== pos;
      return `
        <div class="ml-lineup-row">
          <span><b>${slot + 1}</b> ${pos}</span>
          <select class="ml-lineup-select" data-slot="${slot}">${optionsFor(slot)}</select>
          <span class="${out ? 'ml-outpos' : ''}">${out ? 'FORA DA POSIÇÃO' : 'TITULAR'}</span>
        </div>`;
    }).join('');

    const bench = squad
      .filter((p) => !starters.has(p.id))
      .sort((a, b) => (b.overall || 0) - (a.overall || 0))
      .map((p) => `<span>${p.name} · ${p.position} · <b>${p.overall}</b></span>`).join('');

    return `
      <div class="ml-card">
        <h3>ESCALAÇÃO TITULAR</h3>
        <p class="ml-note">Os 11 escolhidos aqui começam a próxima partida.</p>
        <div class="ml-lineup-grid">${rows}</div>
        <button id="ml-auto-lineup" class="ml-main" type="button">ESCALAÇÃO AUTOMÁTICA</button>
      </div>
      <div class="ml-card">
        <h3>BANCO / RESTANTE DO ELENCO</h3>
        <div class="ml-bench">${bench || '<span>Sem reservas disponíveis.</span>'}</div>
      </div>
    `;
  }

  function renderMarket() {
    return `<div class="ml-row ml-head"><span>JOGADOR</span><span>POS</span><span>FORÇA</span><span>PREÇO</span></div>` +
      renderRows(state.market, (p) => [
        p.name,
        p.position,
        `<b>${p.overall}</b>`,
        `${money(p.price)} <button class="ml-buy" data-id="${p.id}" type="button">COMPRAR</button>`,
      ]);
  }

  function renderScorers() {
    const scorers = topPlayers(state, 'goals');
    const mvps = topPlayers(state, 'mvp');
    return `
      <h3>ARTILHARIA</h3>
      <div class="ml-row ml-head"><span>JOGADOR</span><span>TIME</span><span>FORÇA</span><span>GOLS</span></div>
      ${renderRows(scorers, (p) => [p.name, teamName(p.teamId || state.clubId), p.overall, `<b>${p.goals || 0}</b>`])}
      <h3 style="margin-top:20px">MELHOR JOGADOR DA TEMPORADA</h3>
      <div class="ml-row ml-head"><span>JOGADOR</span><span>TIME</span><span>FORÇA</span><span>PONTOS</span></div>
      ${renderRows(mvps, (p) => [p.name, teamName(p.teamId || state.clubId), p.overall, `<b>${(p.mvp || 0).toFixed(1)}</b>`])}
    `;
  }

  function renderHistory() {
    const seasons = state.history?.length
      ? state.history.map((h) => `
        <div class="ml-card">
          <h3>TEMPORADA ${h.season}</h3>
          <p>${h.summary}</p>
          <small>Artilheiro: ${h.topScorer} · Melhor jogador: ${h.bestPlayer} · Caixa final: ${money(h.money)}</small>
        </div>`).join('')
      : '<div class="ml-card">A primeira temporada ainda está em andamento.</div>';

    const matches = (state.matchHistory || []).slice(0, 10).map((m) => {
      const scorerText = (m.goals || []).map((g) =>
        `${g.name}${g.minute ? ` ${g.minute}'` : ''}`).join(' · ');
      return `
        <div class="ml-card">
          <h3>${teamName(m.home)} ${m.homeGoals} × ${m.awayGoals} ${teamName(m.away)}</h3>
          <small>Temporada ${m.season} · ${scorerText || 'Sem gols'}</small>
        </div>`;
    }).join('');

    return `<h3>PARTIDAS JOGADAS</h3>${matches || '<div class="ml-card">Nenhuma partida disputada ainda.</div>'}
      <h3 style="margin-top:18px">TEMPORADAS</h3>${seasons}`;
  }

  function renderSimulationResult(result) {
    const focus = result?.focus;
    if (!focus) {
      return `
        <div class="ml-result-screen">
          <h3>RODADA CONCLUÍDA</h3>
          <p>Os resultados foram registrados.</p>
          <button id="ml-result-continue" class="ml-main" type="button">CONTINUAR</button>
        </div>`;
    }

    const goalLine = (focus.goals || []).map((g) =>
      `<div class="ml-goal-event"><span>${g.minute || '—'}'</span><b>${g.name || 'GOL'}</b><small>${Number(g.teamIndex) === 0 ? focus.homeName : focus.awayName}</small></div>`
    ).join('');

    const other = (result.results || []).map((g) =>
      `<div class="ml-result-row"><span>${g.homeName}</span><b>${g.homeGoals} × ${g.awayGoals}${g.penalties ? ` <small>(pên. ${g.penalties})</small>` : ''}</b><span>${g.awayName}</span></div>`
    ).join('');

    return `
      <div class="ml-result-screen">
        <small class="ml-result-stage">${result.stageLabel || ''}</small>
        <h3>RESULTADO</h3>
        <div class="ml-result-clubs">
          <span>${focus.homeName}</span>
          <strong>${focus.homeGoals} × ${focus.awayGoals}</strong>
          <span>${focus.awayName}</span>
        </div>
        ${focus.penalties ? `<div class="ml-result-pens">PÊNALTIS · ${focus.penalties}</div>` : ''}
        <div class="ml-goal-list">
          <h4>GOLS</h4>
          ${goalLine || '<div class="ml-no-goals">SEM GOLS</div>'}
        </div>
        <div class="ml-round-results">
          <h4>RESULTADOS DA RODADA</h4>
          ${other || '<div class="ml-no-goals">Rodada concluída.</div>'}
        </div>
        <button id="ml-result-continue" class="ml-main" type="button">CONTINUAR</button>
      </div>`;
  }

  function render() {
    if (!state) {
      title.textContent = 'MASTER LIGA';
      meta.textContent = 'Crie uma carreira para o Pedra Lisa.';
      body.innerHTML = `
        <div class="ml-empty">
          <h2>COMEÇAR UMA NOVA HISTÓRIA</h2>
          <p>8 times na Liga de Independência, Regional em grupos + mata-mata e Desafio dos Campeões.</p>
          <button id="ml-new" class="ml-main" type="button">NOVA MASTER LIGA</button>
        </div>`;
      document.getElementById('ml-new')?.addEventListener('click', () => {
        state = newState();
        persist();
        render();
      });
      return;
    }

    title.textContent = 'MASTER LIGA · PEDRA LISA';
    meta.textContent = `${currentStageLabel(state)} · ${money(state.money)}`;

    if (simulationResult) {
      body.innerHTML = renderSimulationResult(simulationResult);
      document.getElementById('ml-result-continue')?.addEventListener('click', () => {
        simulationResult = null;
        tab = 'overview';
        render();
      });
      return;
    }

    const tabs = {
      overview: 'VISÃO GERAL',
      table: 'COMPETIÇÃO',
      lineup: 'ESCALAÇÃO',
      squad: 'ELENCO',
      market: 'MERCADO',
      scorers: 'DESTAQUES',
      history: 'HISTÓRICO',
    };
    const nav = `<div class="ml-tabs">${Object.entries(tabs).map(([id, label]) =>
      `<button class="${tab === id ? 'active' : ''}" data-tab="${id}" type="button">${label}</button>`).join('')}</div>`;

    let content = '';
    if (tab === 'overview') content = renderOverview();
    else if (tab === 'table') content = renderTable();
    else if (tab === 'lineup') content = renderLineup();
    else if (tab === 'squad') content = renderSquad();
    else if (tab === 'market') content = renderMarket();
    else if (tab === 'scorers') content = renderScorers();
    else content = renderHistory();

    body.innerHTML = nav + `<div class="ml-content">${content}</div>`;

    body.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        tab = btn.dataset.tab;
        render();
      });
    });

    body.querySelectorAll('.ml-lineup-select').forEach((select) => {
      select.addEventListener('change', () => {
        const slot = Number(select.dataset.slot);
        const incoming = select.value;
        const previous = state.lineup[slot];
        const otherSlot = state.lineup.findIndex((id, i) => id === incoming && i !== slot);
        if (otherSlot >= 0) state.lineup[otherSlot] = previous;
        state.lineup[slot] = incoming;
        ensureLineup(state);
        persist();
        render();
      });
    });

    document.getElementById('ml-auto-lineup')?.addEventListener('click', () => {
      state.lineup = defaultLineupIds(userSquad(state));
      persist();
      render();
    });

    document.getElementById('ml-play')?.addEventListener('click', () => {
      const fixture = nextUserFixture(state);
      if (!fixture) return;
      savePendingMatch(state, fixture);
      persist();

      const next = new URL(location.href);
      next.searchParams.delete('online');
      next.searchParams.delete('room');
      next.searchParams.set('mode', 'master');
      next.searchParams.set('home', fixture.home);
      next.searchParams.set('away', fixture.away);
      next.searchParams.set('side', fixture.home === state.clubId ? 'home' : 'away');
      next.searchParams.set('start', '1');
      next.searchParams.set('masterMatch', fixture.id);
      location.href = next.toString();
    });

    document.getElementById('ml-next')?.addEventListener('click', () => {
      clearPendingMatch();
      simulationResult = simulateNext(state);
      render();
    });

    body.querySelectorAll('.ml-buy').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = state.market.find((x) => x.id === btn.dataset.id);
        if (!p) return;
        if (state.money < p.price) {
          state.notice = 'Caixa insuficiente para esta contratação.';
          tab = 'overview';
          render();
          return;
        }
        if (userSquad(state).length >= 25) {
          state.notice = 'Elenco cheio. Venda um jogador antes de contratar.';
          tab = 'overview';
          render();
          return;
        }
        state.money -= p.price;
        p.teamId = state.clubId;
        userSquad(state).push(p);
        state.market = state.market.filter((x) => x.id !== p.id);
        state.notice = `${p.name} contratado por ${money(p.price)}.`;
        ensureLineup(state);
        persist();
        render();
      });
    });

    body.querySelectorAll('.ml-sell').forEach((btn) => {
      btn.addEventListener('click', () => {
        const squad = userSquad(state);
        if (squad.length <= 14) {
          state.notice = 'Você precisa manter pelo menos 14 jogadores no elenco.';
          tab = 'overview';
          render();
          return;
        }
        const idx = squad.findIndex((p) => p.id === btn.dataset.id);
        if (idx < 0) return;
        const [p] = squad.splice(idx, 1);
        const value = Math.round(playerValue(p) * .68 / 1000) * 1000;
        state.money += value;
        p.teamId = null;
        p.price = Math.max(value, Math.round(playerValue(p) * .9 / 1000) * 1000);
        p.goals = 0;
        p.mvp = 0;
        p.appearances = 0;
        state.market.push(p);
        state.notice = `${p.name} vendido por ${money(value)}. Ele volta ao mercado e continua no universo da Master Liga.`;
        ensureLineup(state);
        persist();
        render();
      });
    });
  }

  function openHub() {
    open = true;
    gate.classList.remove('hidden');
    render();
  }

  function closeHub() {
    open = false;
    gate.classList.add('hidden');
    document.dispatchEvent(new CustomEvent('mukeka:master-close'));
  }

  closeBtn?.addEventListener('click', closeHub);
  document.addEventListener('mukeka:master-open', openHub);

  return {
    get open() { return open; },
    openHub,
    closeHub,
    get state() { return state; },
    completePlayedMatch(score, report = null) {
      if (!state) return null;
      const result = completePlayedMatch(state, score, report);
      if (result) {
        state = loadState() || state;
        tab = 'overview';
      }
      return result;
    },
  };
}
