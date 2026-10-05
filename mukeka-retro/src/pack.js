// Pacote visual + seleção dinâmica dos clubes do Mukeka Retro.
// O pack ainda guarda texturas/estádio-base, mas os dois times da partida
// agora podem vir do catálogo único através de ?home=<id>&away=<id>.

import { buildClubTeam, clubById } from './clubs.js';

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
  const home = custom[homeId] || buildClubTeam(homeClub);
  const away = custom[awayId] || buildClubTeam(awayClub);

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
