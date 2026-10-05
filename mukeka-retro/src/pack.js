// Pacote visual + seleção dinâmica dos clubes do Mukeka Retro.
// O pack ainda guarda texturas/estádio-base, mas os dois times da partida
// agora podem vir do catálogo único através de ?home=<id>&away=<id>.

import { buildClubTeam, buildCareerTeam, clubById, defaultLineupIds } from './clubs.js';

const REGISTRY = './data/packs.json';

const FALLBACK = Object.freeze({
  id: 'fallback',
  title: 'MUKЕKA RETRO',
  venue: 'PARTIDA MUKEKA',
  textures: { boards: null, ball: null, channelLogo: null },
  teams: null,
  matchClubIds: ['pedra-lisa', 'independencia'],
});

const fetchJSON = (url) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
});

function withClubMeta(team, club) {
  if (!team || !club) return team;
  return {
    ...team,
    id: club.id,
    name: club.name,
    short: club.short,
    strength: club.strength,
    colors: {
      primary: club.primary,
      shorts: club.shorts,
      gk: club.gk,
      ...(team.colors || {}),
    },
  };
}

function readMasterState() {
  try {
    const raw = localStorage.getItem('mukeka.masterLiga.v1');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function mergeKnownAppearance(team, source) {
  if (!team?.squad || !source?.squad) return team;
  const byName = new Map(source.squad.map((p) => [String(p.name || '').toUpperCase(), p]));
  team.squad = team.squad.map((p) => {
    const known = byName.get(String(p.name || '').toUpperCase());
    if (!known) return p;
    const visual = {};
    for (const key of ['height','build','skin','hair','hairColor','beard','gloves','glovesCuff','head']) {
      if (known[key] != null) visual[key] = known[key];
    }
    return { ...p, ...visual };
  });
  return team;
}

function masterTeam(club, state, knownAppearance = null) {
  const squad = state?.squads?.[club?.id];
  if (!club || !Array.isArray(squad) || !squad.length) return null;
  const ids = club.id === state.clubId
    ? (Array.isArray(state.lineup) && state.lineup.length ? state.lineup : defaultLineupIds(squad))
    : defaultLineupIds(squad);
  return mergeKnownAppearance(buildCareerTeam(club, squad, ids), knownAppearance);
}

async function loadPack() {
  const registry = await fetchJSON(REGISTRY);
  const params = new URLSearchParams(location.search);

  const asked = params.get('pack');
  const id = asked && registry.packs?.includes(asked) ? asked : registry.active;

  const base = `./data/packs/${id}/`;
  const pack = await fetchJSON(`${base}pack.json`);
  const [pedraLisa, independencia] = await Promise.all([
    fetchJSON(base + pack.teams.home),
    fetchJSON(base + pack.teams.away),
  ]);

  const defaultHome = 'pedra-lisa';
  const defaultAway = 'independencia';
  const homeId = clubById(params.get('home'))?.id || defaultHome;
  let awayId = clubById(params.get('away'))?.id || defaultAway;

  // Sem uniforme reserva para todos ainda: amistoso não deve nascer com
  // o mesmo clube dos dois lados. Se a URL vier assim, usa Independência
  // (ou Pedra Lisa quando o mandante já é Independência).
  if (awayId === homeId) awayId = homeId === defaultAway ? defaultHome : defaultAway;

  const custom = {
    'pedra-lisa': withClubMeta(pedraLisa, clubById('pedra-lisa')),
    'independencia': withClubMeta(independencia, clubById('independencia')),
  };

  const homeClub = clubById(homeId);
  const awayClub = clubById(awayId);

  const masterState = params.get('mode') === 'master' ? readMasterState() : null;
  const homeKnown = homeId === 'pedra-lisa' ? pedraLisa : homeId === 'independencia' ? independencia : null;
  const awayKnown = awayId === 'pedra-lisa' ? pedraLisa : awayId === 'independencia' ? independencia : null;

  // Em partida de Master Liga, o campo 3D usa exatamente os jogadores do
  // save: escalação, compras, vendas e OVR. Fora da carreira mantém o catálogo
  // normal de Amistoso/Online.
  const home = masterTeam(homeClub, masterState, homeKnown) ||
    custom[homeId] || buildClubTeam(homeClub);
  const away = masterTeam(awayClub, masterState, awayKnown) ||
    custom[awayId] || buildClubTeam(awayClub);

  return {
    id,
    title: pack.title || FALLBACK.title,
    venue: homeId === 'pedra-lisa'
      ? (pack.venue || 'ESTÁDIO PEDRA LISA')
      : `ESTÁDIO MUNICIPAL · ${homeClub?.name || 'MUKEKA'}`,
    textures: { boards: null, ball: null, channelLogo: null, ...(pack.textures || {}) },
    teams: [home, away],
    matchClubIds: [homeId, awayId],
  };
}

export const PACK = await loadPack().catch((e) => {
  console.error('Não foi possível carregar o pacote do Mukeka Retro:', e);
  return FALLBACK;
});
