// Catálogo único de clubes do Mukeka Retro.
// O mesmo ID será usado por Amistoso, Online e Master Liga.
// Nomes/cores/força ficam centralizados para não existir "um Retiro" diferente
// em cada modo de jogo.

export const LOCAL_CLUBS = Object.freeze([
  { id: 'pedra-lisa', name: 'PEDRA LISA', short: 'PDL', strength: 66, primary: '#178a3c', shorts: '#ffffff', gk: '#f2d43c', style: 'brazil98' },
  { id: 'retiro', name: 'RETIRO', short: 'RET', strength: 63, primary: '#7a2323', shorts: '#ffffff', gk: '#f1c94a', style: 'neutral' },
  { id: 'jaburu', name: 'JABURU', short: 'JAB', strength: 62, primary: '#e1bd2f', shorts: '#151515', gk: '#3175b8', style: 'neutral' },
  { id: 'varzea-alegre', name: 'VÁRZEA ALEGRE', short: 'VAR', strength: 65, primary: '#2468a0', shorts: '#ffffff', gk: '#e79032', style: 'france98' },
  { id: 'nova-olinda', name: 'NOVA OLINDA', short: 'NOL', strength: 64, primary: '#733d89', shorts: '#ffffff', gk: '#54a66e', style: 'neutral' },
  { id: 'brilhante', name: 'BRILHANTE', short: 'BRI', strength: 61, primary: '#dc6c29', shorts: '#161616', gk: '#2e70a4', style: 'brazil98' },
  { id: 'palestina', name: 'PALESTINA', short: 'PAL', strength: 63, primary: '#176653', shorts: '#ffffff', gk: '#d59c34', style: 'neutral' },
  { id: 'independencia', name: 'INDEPENDÊNCIA', short: 'IND', strength: 64, primary: '#f5f5f5', shorts: '#111111', gk: '#3ad07a', style: 'france98' },
]);

export const REGIONAL_CLUBS = Object.freeze([
  { id: 'crateus-atletico', name: 'CRATEÚS ATLÉTICO', short: 'CRA', strength: 73, primary: '#243f85', shorts: '#ffffff', gk: '#e6a334', style: 'france98' },
  { id: 'novo-oriente', name: 'NOVO ORIENTE EC', short: 'NOR', strength: 70, primary: '#af2d2d', shorts: '#ffffff', gk: '#2d7c64', style: 'neutral' },
  { id: 'sertao-taua', name: 'SERTÃO TAUÁ', short: 'TAU', strength: 72, primary: '#8a3a25', shorts: '#f0d8b4', gk: '#315d8a', style: 'brazil98' },
  { id: 'tamboril', name: 'TAMBORIL ESPORTE', short: 'TAM', strength: 68, primary: '#234d35', shorts: '#ffffff', gk: '#d6a735', style: 'neutral' },
  { id: 'ipaporanga', name: 'IPAPORANGA UNIÃO', short: 'IPA', strength: 67, primary: '#742c69', shorts: '#ffffff', gk: '#4f9267', style: 'neutral' },
  { id: 'poranga', name: 'PORANGA ATLÉTICO', short: 'POR', strength: 66, primary: '#2f6f8e', shorts: '#ffffff', gk: '#d17f35', style: 'france98' },
  { id: 'ararenda', name: 'ARARENDÁ FC', short: 'ARA', strength: 66, primary: '#b5442b', shorts: '#1b1b1b', gk: '#3b7a51', style: 'brazil98' },
  { id: 'monsenhor-tabosa', name: 'MONSENHOR TABOSA', short: 'MTA', strength: 69, primary: '#d5b631', shorts: '#252525', gk: '#315e91', style: 'neutral' },
  { id: 'catunda', name: 'CATUNDA REAL', short: 'CAT', strength: 65, primary: '#4e4e8c', shorts: '#ffffff', gk: '#ce7831', style: 'neutral' },
  { id: 'santa-quiteria', name: 'SANTA QUITÉRIA EC', short: 'SQT', strength: 72, primary: '#287145', shorts: '#ffffff', gk: '#d59b39', style: 'brazil98' },
  { id: 'boa-viagem', name: 'BOA VIAGEM ATLÉTICO', short: 'BVA', strength: 71, primary: '#8f2834', shorts: '#ffffff', gk: '#2f7392', style: 'france98' },
  { id: 'madalena', name: 'MADALENA SC', short: 'MAD', strength: 68, primary: '#2b6285', shorts: '#f1d35c', gk: '#7b3c6d', style: 'neutral' },
  { id: 'hidrolandia', name: 'HIDROLÂNDIA NORTE', short: 'HID', strength: 67, primary: '#395e2e', shorts: '#ffffff', gk: '#c65f38', style: 'neutral' },
  { id: 'quiterianopolis', name: 'QUITERIANÓPOLIS FC', short: 'QUI', strength: 69, primary: '#694186', shorts: '#ffffff', gk: '#3b855a', style: 'brazil98' },
]);

export const FINAL_CLUB = Object.freeze({
  id: 'fortaleza-ce',
  name: 'FORTALEZA CE',
  short: 'FOR',
  strength: 89,
  primary: '#244b99',
  shorts: '#ffffff',
  gk: '#e2bd35',
  style: 'france98',
});

export const CLUBS = Object.freeze([...LOCAL_CLUBS, ...REGIONAL_CLUBS, FINAL_CLUB]);

const BY_ID = new Map(CLUBS.map((club) => [club.id, club]));
export const clubById = (id) => BY_ID.get(String(id || '').trim()) || null;
export const validClubId = (id) => !!clubById(id);

const FIRST = [
  'André', 'Caio', 'Davi', 'Edson', 'Fábio', 'Gil', 'Iago', 'João', 'Kleber',
  'Lucas', 'Marcos', 'Neto', 'Paulo', 'Rafael', 'Renan', 'Samuel', 'Tiago',
  'Vitor', 'Wesley', 'Yuri', 'Alan', 'Bruno', 'César', 'Diego', 'Felipe',
  'Ariel', 'Breno', 'Danilo', 'Elias', 'Heitor', 'Leandro', 'Mateus', 'Ramon',
];
const LAST = [
  'Alencar', 'Barros', 'Carvalho', 'Dantas', 'Freitas', 'Gomes', 'Lima',
  'Macedo', 'Nogueira', 'Oliveira', 'Pereira', 'Queiroz', 'Rocha', 'Sousa',
  'Teixeira', 'Vieira', 'Moura', 'Batista', 'Farias', 'Monteiro', 'Araújo',
  'Ribeiro', 'Nascimento', 'Cardoso', 'Brito',
];
const NUMBERS = [1, 6, 3, 4, 2, 5, 8, 10, 11, 9, 7, 12, 13, 14, 15, 16, 17, 18];
const POSITIONS = ['GOL', 'LE', 'ZAG', 'ZAG', 'LD', 'VOL', 'MC', 'MEI', 'PE', 'ATA', 'PD',
  'GOL', 'ZAG', 'LD', 'VOL', 'MEI', 'ATA', 'PD'];
const ROLES = [null, 'fullback', 'stopper', 'cover', 'wingback', 'destroyer',
  'box2box', 'playmaker10', 'insideFwd', 'poacher', 'winger',
  null, 'cover', 'fullback', 'regista', 'playmaker10', 'target', 'insideFwd'];
const SKINS = ['#c49b7c', '#b98a63', '#9a6f4a', '#7d5837', '#6a4a33', '#57402f'];
const HAIRS = ['short', 'short', 'thin', 'afro', 'none', 'short'];

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

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const attr01 = (overall, random, bias = 0) =>
  clamp(0.28 + (overall - 50) / 70 + bias + (random() - .5) * .12, .25, .96);

export function buildClubCareerSquad(clubOrId) {
  const club = typeof clubOrId === 'string' ? clubById(clubOrId) : clubOrId;
  if (!club) return [];
  const random = rng('squad-' + club.id);

  return POSITIONS.map((position, i) => {
    const first = FIRST[Math.floor(random() * FIRST.length)];
    const last = LAST[Math.floor(random() * LAST.length)];
    let overall = Math.round(club.strength + (random() - .5) * 8);
    if (i === 9 || i === 7) overall += random() > .68 ? 2 : 0;
    if (club.id === FINAL_CLUB.id) overall = clamp(overall + 2, 83, 94);
    else overall = clamp(overall, 54, 84);

    const skill = attr01(overall, random);
    const player = {
      id: club.id + '-' + i,
      name: (first + ' ' + last).toUpperCase(),
      number: NUMBERS[i],
      position,
      overall,
      height: Math.round((i === 0 || position === 'ZAG' || position === 'ATA'
        ? 178 : 169) + random() * 10),
      build: Number((0.94 + random() * .15).toFixed(2)),
      skin: SKINS[Math.floor(random() * SKINS.length)],
      hair: HAIRS[Math.floor(random() * HAIRS.length)],
      hairColor: '#20150f',
      teamId: club.id,
      goals: 0,
      mvp: 0,
      appearances: 0,
    };

    if (ROLES[i]) player.role = ROLES[i];

    // OVR passa a produzir diferença real na IA, e não só aparecer no menu.
    if (position !== 'GOL') {
      player.touch = clamp(skill + (position === 'MEI' ? .07 : 0), .25, .98);
      player.vision = clamp(skill + (position === 'MEI' || position === 'MC' ? .08 : -.02), .25, .98);
      player.composure = clamp(skill + (position === 'ZAG' || position === 'VOL' ? .05 : 0), .25, .98);
      player.work = clamp(skill + (position === 'VOL' || position === 'MC' ? .06 : 0), .25, .98);
      player.risk = clamp(.42 + (overall - 60) / 90 + (random() - .5) * .08, .25, .82);
      player.shoot = clamp(.72 + (overall - 60) / 65 +
        (position === 'ATA' || position === 'PE' || position === 'PD' ? .12 : -.04), .65, 1.38);
      player.crossBias = clamp(.8 + (position === 'LE' || position === 'LD' || position === 'PE' || position === 'PD' ? .28 : 0), .7, 1.25);
    } else {
      const g = clamp(0.38 + (overall - 55) / 55, .35, .96);
      player.gk = {
        reflexes: clamp(g + (random() - .5) * .05, .35, .98),
        handling: clamp(g + (random() - .5) * .05, .35, .98),
        positioning: clamp(g + (random() - .5) * .05, .35, .98),
        vision: clamp(g + (random() - .5) * .05, .35, .98),
      };
    }
    return player;
  });
}

export function buildClubTeam(clubOrId) {
  const club = typeof clubOrId === 'string' ? clubById(clubOrId) : clubOrId;
  if (!club) return null;
  return {
    id: club.id,
    name: club.name,
    short: club.short,
    strength: club.strength,
    colors: {
      primary: club.primary,
      shorts: club.shorts,
      gk: club.gk,
    },
    kits: { home: null, goalkeeper: null },
    squad: buildClubCareerSquad(club).slice(0, 11).map((p) => {
      const {
        id, position, teamId, goals, mvp, appearances,
        ...matchPlayer
      } = p;
      return matchPlayer;
    }),
    style: club.style || 'neutral',
    _comentario_mukeka: 'Equipe gerada do catálogo único Mukeka Retro.',
  };
}
