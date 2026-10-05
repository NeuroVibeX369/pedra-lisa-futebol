const SAVE_KEY = 'mukeka.masterLiga.v1';

const LOCAL_TEAMS = [
  { id: 'pedra-lisa', name: 'PEDRA LISA', short: 'PDL', strength: 66 },
  { id: 'retiro', name: 'RETIRO', short: 'RET', strength: 63 },
  { id: 'jaburu', name: 'JABURU', short: 'JAB', strength: 62 },
  { id: 'varzea-alegre', name: 'VÁRZEA ALEGRE', short: 'VAR', strength: 65 },
  { id: 'nova-olinda', name: 'NOVA OLINDA', short: 'NOL', strength: 64 },
  { id: 'brilhante', name: 'BRILHANTE', short: 'BRI', strength: 61 },
  { id: 'palestina', name: 'PALESTINA', short: 'PAL', strength: 63 },
  { id: 'sertao-independente', name: 'SERTÃO INDEPENDENTE', short: 'SIN', strength: 62 },
];

const REGIONAL_TEAMS = [
  { id: 'crateus-atletico', name: 'CRATEÚS ATLÉTICO', short: 'CRA', strength: 73 },
  { id: 'novo-oriente', name: 'NOVO ORIENTE EC', short: 'NOR', strength: 70 },
  { id: 'sertao-taua', name: 'SERTÃO TAUÁ', short: 'TAU', strength: 72 },
  { id: 'tamboril', name: 'TAMBORIL ESPORTE', short: 'TAM', strength: 68 },
  { id: 'ipaporanga', name: 'IPAPORANGA UNIÃO', short: 'IPA', strength: 67 },
  { id: 'poranga', name: 'PORANGA ATLÉTICO', short: 'POR', strength: 66 },
  { id: 'ararenda', name: 'ARARENDÁ FC', short: 'ARA', strength: 66 },
  { id: 'monsenhor-tabosa', name: 'MONSENHOR TABOSA', short: 'MTA', strength: 69 },
  { id: 'catunda', name: 'CATUNDA REAL', short: 'CAT', strength: 65 },
  { id: 'santa-quiteria', name: 'SANTA QUITÉRIA EC', short: 'SQT', strength: 72 },
  { id: 'boa-viagem', name: 'BOA VIAGEM ATLÉTICO', short: 'BVA', strength: 71 },
  { id: 'madalena', name: 'MADALENA SC', short: 'MAD', strength: 68 },
  { id: 'hidrolandia', name: 'HIDROLÂNDIA NORTE', short: 'HID', strength: 67 },
  { id: 'quiterianopolis', name: 'QUITERIANÓPOLIS FC', short: 'QUI', strength: 69 },
];

const FINAL_BOSS = {
  id: 'fortaleza-ce',
  name: 'FORTALEZA CE',
  short: 'FOR',
  strength: 89,
};

const TEAM_BY_ID = new Map(
  [...LOCAL_TEAMS, ...REGIONAL_TEAMS, FINAL_BOSS].map((t) => [t.id, t]),
);

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
  ['OLAVO LOBÃO', 'GOL', 66, 29],
  ['NETO', 'LE', 61, 28],
  ['DJHA', 'ZAG', 64, 30],
  ['BASTIAOZÃO REI', 'ZAG', 67, 31],
  ['BRUNO', 'LD', 62, 25],
  ['MANOEL', 'VOL', 65, 27],
  ['RONILTON', 'MC', 65, 26],
  ['LUCIANO', 'MEI', 69, 25],
  ['HÉLIO', 'PE', 67, 24],
  ['BASTIAOZINHO', 'ATA', 71, 23],
  ['RICARDO', 'PD', 66, 24],
  ['CÉSAR', 'GOL', 60, 21],
  ['LUCAS PEDRA', 'ZAG', 60, 20],
  ['EDUARDO', 'LD', 59, 22],
  ['RAIMUNDO', 'VOL', 61, 28],
  ['DUDU', 'MEI', 62, 19],
  ['JÚNIOR', 'ATA', 63, 21],
  ['FABINHO', 'PD', 60, 20],
];

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
  // Estilo Master Liga clássica: valor depende do OVR, não de idade.
  // Os jogadores não envelhecem, não perdem OVR e não se aposentam.
  return Math.max(3500, Math.round((p.overall ** 2) * 18 / 1000) * 1000);
}

function generatedSquad(team) {
  const random = rng(team.id);
  return POSITIONS.map((position, i) => {
    const first = FIRST[Math.floor(random() * FIRST.length)];
    const last = LAST[Math.floor(random() * LAST.length)];
    let overall = Math.round(team.strength + (random() - 0.5) * 9);
    if (position === 'ATA' || position === 'MEI') overall += random() > .72 ? 2 : 0;
    overall = clamp(overall, 54, team.id === FINAL_BOSS.id ? 94 : 84);
    if (team.id === FINAL_BOSS.id) overall = clamp(overall + 2, 83, 94);
    return {
      id: `${team.id}-${i}`,
      name: `${first.toUpperCase()} ${last.toUpperCase()}`,
      position,
      overall,
      teamId: team.id,
      goals: 0,
      mvp: 0,
      appearances: 0,
    };
  });
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
    notice: 'A Master Liga começou. O objetivo inicial é terminar entre os 2 primeiros.',
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    return state && state.version === 1 ? state : null;
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

function teamStrength(state, id) {
  const squad = state.squads[id];
  if (!squad?.length) return TEAM_BY_ID.get(id)?.strength || 60;
  const starters = [...squad].sort((a, b) => b.overall - a.overall).slice(0, 11);
  return starters.reduce((sum, p) => sum + p.overall, 0) / Math.max(1, starters.length);
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

function choosePlayer(state, teamId, random, scorer = false) {
  const squad = state.squads[teamId] || [];
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
  const squad = state.squads[teamId] || [];
  const starters = [...squad].sort((a, b) => b.overall - a.overall).slice(0, 11);
  for (const p of starters) {
    p.appearances = (p.appearances || 0) + 1;
    p.mvp = (p.mvp || 0) + (won ? .8 : .3) + random() * .7 + p.overall / 250;
  }
  for (let g = 0; g < goals; g++) {
    const scorer = choosePlayer(state, teamId, random, true);
    if (scorer) {
      scorer.goals = (scorer.goals || 0) + 1;
      scorer.mvp = (scorer.mvp || 0) + 2.1;
    }
  }
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

function simulateFixture(state, fixture, table, stage) {
  const [hg, ag] = simulateScore(state, fixture.home, fixture.away,
    `${state.season}-${stage}-${fixture.id}`);
  fixture.played = true;
  fixture.homeGoals = hg;
  fixture.awayGoals = ag;
  if (table) updateTable(table, fixture.home, fixture.away, hg, ag);
  recordPlayerMatch(state, fixture.home, hg, hg > ag,
    `${fixture.id}-home-${state.season}`);
  recordPlayerMatch(state, fixture.away, ag, ag > hg,
    `${fixture.id}-away-${state.season}`);
  payForUserMatch(state, fixture.home, fixture.away, hg, ag, stage);
  return fixture;
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
  // automática de OVR entre temporadas. Apenas os números da temporada zeram.
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
    bestPlayer: awards.mvp ? `${awards.mvp.name} (OVR ${awards.mvp.overall})` : '—',
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
  simulateFixture(state, game, null, stage);
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

function simulateNext(state) {
  if (state.stage === 'local') simulateLocalRound(state);
  else if (state.stage === 'regional-groups') simulateGroupRound(state);
  else if (state.stage.startsWith('knockout-')) advanceKnockout(state);
  else if (state.stage === 'champions') simulateChampions(state);
  saveState(state);
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
        <div><b>${str}</b><small>OVR DO TIME</small></div>
        <div><b>${pos || '—'}º</b><small>LIGA LOCAL</small></div>
        <div><b>${state.season}</b><small>TEMPORADA</small></div>
      </div>
      <div class="ml-card">
        <h3>PRÓXIMO COMPROMISSO</h3>
        <p>${fixture ? `${teamName(fixture.home)} × ${teamName(fixture.away)}` : 'Aguardando definição da próxima fase.'}</p>
        <small>${currentStageLabel(state)}</small>
        <button id="ml-next" class="ml-main" type="button">SIMULAR PRÓXIMA RODADA</button>
        <p class="ml-note">Nesta primeira base da Master Liga, o motor de temporada já funciona por simulação. O próximo passo é ligar “JOGAR PARTIDA” ao campo 3D.</p>
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
    return `<div class="ml-row ml-head"><span>JOGADOR</span><span>POS</span><span>OVR</span><span>VALOR</span></div>` +
      renderRows(squad, (p) => [
        p.name,
        p.position,
        `<b>${p.overall}</b>`,
        `${money(playerValue(p))} <button class="ml-sell" data-id="${p.id}" type="button">VENDER</button>`,
      ]);
  }

  function renderMarket() {
    return `<div class="ml-row ml-head"><span>JOGADOR</span><span>POS</span><span>OVR</span><span>PREÇO</span></div>` +
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
      <div class="ml-row ml-head"><span>JOGADOR</span><span>TIME</span><span>OVR</span><span>GOLS</span></div>
      ${renderRows(scorers, (p) => [p.name, teamName(p.teamId || state.clubId), p.overall, `<b>${p.goals || 0}</b>`])}
      <h3 style="margin-top:20px">MELHOR JOGADOR DA TEMPORADA</h3>
      <div class="ml-row ml-head"><span>JOGADOR</span><span>TIME</span><span>OVR</span><span>PONTOS</span></div>
      ${renderRows(mvps, (p) => [p.name, teamName(p.teamId || state.clubId), p.overall, `<b>${(p.mvp || 0).toFixed(1)}</b>`])}
    `;
  }

  function renderHistory() {
    if (!state.history.length) return '<div class="ml-card">A primeira temporada ainda está em andamento.</div>';
    return state.history.map((h) => `
      <div class="ml-card">
        <h3>TEMPORADA ${h.season}</h3>
        <p>${h.summary}</p>
        <small>Artilheiro: ${h.topScorer} · Melhor jogador: ${h.bestPlayer} · Caixa final: ${money(h.money)}</small>
      </div>`).join('');
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

    const tabs = {
      overview: 'VISÃO GERAL',
      table: 'COMPETIÇÃO',
      squad: 'ELENCO',
      market: 'MERCADO',
      scorers: 'RANKINGS',
      history: 'HISTÓRICO',
    };
    const nav = `<div class="ml-tabs">${Object.entries(tabs).map(([id, label]) =>
      `<button class="${tab === id ? 'active' : ''}" data-tab="${id}" type="button">${label}</button>`).join('')}</div>`;

    let content = '';
    if (tab === 'overview') content = renderOverview();
    else if (tab === 'table') content = renderTable();
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

    document.getElementById('ml-next')?.addEventListener('click', () => {
      simulateNext(state);
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
  };
}
