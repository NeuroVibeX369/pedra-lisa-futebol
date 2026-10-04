// All world units are "pixels" at zoom 1. The pitch is portrait, like the
// 16-bit classics; the camera scrolls along with the ball.

export const TICK_RATE = 60;

/** Seconds of real time per tick. The game loop paces itself by this. */
export const FRAME_TIME = 1 / TICK_RATE;

/**
 * One knob for the overall speed of the game. Below 1 everything happens more
 * slowly without anything moving differently: the pitch, the shooting ranges and
 * the timings in ticks all stay exactly where they were, only the clock the
 * physics runs on is turned down. Friction and damping are per tick, so they are
 * raised to the same power to keep passes travelling just as far.
 */
export const PACE = 0.9;

/** Seconds of game time per tick. Everything in the simulation integrates by this. */
export const DT = PACE / TICK_RATE;

export const FIELD_W = 640;
export const FIELD_H = 1000;
export const OUT_MARGIN = 80; // grass outside the lines

export const WORLD_W = FIELD_W + OUT_MARGIN * 2;
export const WORLD_H = FIELD_H + OUT_MARGIN * 2;

export const FIELD = {
  left: OUT_MARGIN,
  top: OUT_MARGIN,
  right: OUT_MARGIN + FIELD_W,
  bottom: OUT_MARGIN + FIELD_H,
  cx: OUT_MARGIN + FIELD_W / 2,
  cy: OUT_MARGIN + FIELD_H / 2,
};

// Pitch markings
export const GOAL_W = 146;
export const GOAL_DEPTH = 34;
export const CROSSBAR_H = 46; // balls higher than this go over the bar
export const PEN_W = 340;
export const PEN_D = 150;
export const SIX_W = 176;
export const SIX_D = 58;
export const PEN_SPOT = 100;
export const CENTER_R = 95;
export const ARC_R = 90;
export const CORNER_R = 14;

// Player
export const PLAYER_R = 7;
export const PLAYER_ACC = 1500;
export const PLAYER_SPEED = 176;
export const PLAYER_SPEED_BALL = 158; // slightly slower with the ball at your feet
export const KEEPER_SPEED = 168;
export const PLAYER_DAMP = 0.80 ** PACE;

// A slide used to cover 55px - four player widths - and cost you 0.8 seconds
// whether it connected or not, which made it a gamble rather than a tackle.
// It now reaches about 90px and you are back on your feet sooner.
export const SLIDE_TICKS = 28;
export const SLIDE_SPEED = 380;
export const SLIDE_DECAY = 0.955;
export const SLIDE_COOLDOWN = 14;
/** How near the ball a sliding boot has to come. */
export const SLIDE_REACH = 11;
export const DOWN_TICKS = 46;

// Ball
export const BALL_R = 4;
export const GRAVITY = 980;
// Per tick, and raised to PACE so slowing the game does not also change how far
// a ball travels. These used to be 0.9855 and 0.9985, which let a full power
// shot roll 88% of the length of the pitch and a lob cross 93% of it in under
// two seconds - the ball behaved as if the grass were ice. Now a full shot
// covers a little over half the pitch and a lob about the same.
export const GROUND_FRICTION = 0.9855 ** PACE;
export const AIR_DRAG = 0.9985 ** PACE;

// Rolling resistance: a flat amount of speed lost per second, on top of the
// proportional friction above. The proportional term alone barely touches a
// slow ball, which is why a gentle pass used to trickle on for six seconds.
// This kills the long tail without changing how a firmly struck ball starts.
export const ROLL_DRAG = 130;
export const BOUNCE_Z = 0.56;
export const BOUNCE_XY = 0.86;
export const SPIN_DECAY = 0.985 ** PACE;

// Ball control
export const CONTROL_R = 15;
export const KEEPER_CONTROL_R = 22;
export const CONTROL_Z = 26;
export const KEEPER_CONTROL_Z = 52;
export const DRIBBLE_DIST = 13;
export const DRIBBLE_LERP = 1 - (1 - 0.30) ** PACE;

// Kicking.
//
// Power is expressed as the distance the ball should travel, not as a speed.
// A rolling ball loses a fixed fraction of its speed per tick, so distance is
// speed * DT / (1 - friction): change the friction and every kick in the game
// silently changes length. That is exactly what happened when the ball was made
// heavier - passes fell short of their target, attacks died in midfield and the
// scoreline went to nil. Ask for a distance and the friction can be tuned for
// feel without touching the balance.
export const CHARGE_MAX = 30; // ticks (0.5s) to reach full power
export const KICK_MIN_DIST = 367; // a tap
export const KICK_MAX_DIST = 896; // a full blooded shot
export const LOB_CHARGE = 9; // from this charge on, the ball leaves the ground
export const LOB_MAX = 320;

// Power and height come off the same button, so the hardest shot was also the
// highest one - and from the edge of the area a full charge simply sailed over.
// Measured through the real button path, aiming at a corner: holding for 0.42s
// scored 48% of the time and holding the full 0.50s scored 5%, with 43% of those
// going out for a goal kick. Holding the button all the way was punished, and
// the only warning was a small bar turning red.
//
// A shot on goal now climbs no higher than a three quarter charge already did,
// which leaves the curve reading 0, 11, 5, 16, 32, 38, 48, 43 percent from a tap
// to a full charge: the collapse at the end is gone and the peak is untouched.
// Capping harder does not pay - at 160 the ball stays down but beats the keeper
// less often, and the peak drops to 38%. Lofted balls are left alone: this only
// applies when you are close enough to be shooting and aiming between the posts.
export const SHOT_LIFT_MAX = 240;
export const SHOT_FLAT_RANGE = 300; // beyond this you are hitting it long, not shooting
export const KICK_COOLDOWN = 16;

// What the commentator considers worth mentioning. A ball slower than this was
// passed back, not saved; a run shorter than this is just carrying it forward.
export const SAVE_SPEED = 380;
export const RUN_ADVANCE = 0.3; // three tenths of the pitch, with the ball

/** Launch speed for a ball that should come to rest after `dist` pixels. */
export function speedForDistance(dist) {
  return (dist * (1 - GROUND_FRICTION)) / DT;
}

// Aftertouch: bending the ball after you have kicked it
export const AFTERTOUCH_TICKS = 70;
export const AT_SIDE = 700; // sideways acceleration -> curve
export const AT_LIFT = 340; // forward/backward -> lift or dip

// Match
export const GOAL_CELEBRATION_TICKS = 150;
export const KICKOFF_TICKS = 50;
export const RESTART_TICKS = 36;
export const HALFTIME_TICKS = 150;

// A restart is protected until the taker touches it; this is only the backstop
// that stops an untaken restart lasting forever.
export const PROTECT_TICKS = 260;

// How long your own choice of player stands before the automatic switch takes
// over again. Long enough to run somewhere with him, short enough that you are
// never stuck with the wrong man.
export const MANUAL_HOLD_TICKS = 100;

// A keeper's hold is topped up every tick he actually has the ball, so this is
// just how long the opposition keeps its distance after he lets go of it. Keep
// it short: an early version protected him for four seconds after every routine
// catch, which locked strikers out of every rebound and cost about nine out of
// ten goals in the match.
export const KEEPER_HOLD_TICKS = 40;

// ...and the six second rule, roughly: hang on to it longer than this and the
// opposition is allowed to close in again. Without it a keeper could stand on
// the ball untouchable for the whole match.
export const KEEPER_HOLD_MAX = 330;

// CPU difficulty. HARD is the original behaviour and is deliberately left at the
// neutral values (no delay, no error, multiplier 1), so picking it reproduces the
// game exactly as it played before difficulties existed.
//
// These only ever apply to a CPU team. Your own AI team-mates always play at full
// strength - weakening them would make the game harder for you, not easier.
//
// Tuned by playing each level against HARD. The yardstick is territory - the
// share of playing time the ball spends in the opponent's half - because goals
// are far too rare to measure with: HARD ~49%, NORMAL ~38%, EASY ~30%.
// tools/simtest.js keeps an eye on it.
//
// slideChance was halved when slides themselves were made to reach further and
// connect more often: the same frequency then meant being robbed constantly.
// Halved a second time after measuring where an attacking run actually dies: of
// sixty runs from the halfway line straight at goal, fifty-eight ended in a slide
// and none in the back four. The wall was never the problem. See TEAMMATE_SLIDE
// in game/ai.js - only the opponent was slowed down, not your own side.
//
// reactTicks is by far the strongest lever: a team that chases where the ball was
// three ticks ago barely wins possession back. Everything else is comparatively
// mild on its own, but shapes how the level feels to play against - a slower
// opponent you can outrun, sloppier passes you can intercept, fewer slide
// tackles taking the ball off your feet.
export const AI_LEVELS = {
  easy: {
    key: 'easy',
    label: 'EASY',
    reactTicks: 7,
    aimError: 40,
    passError: 20,
    settleTicks: 18,
    shootRange: 220,
    pressure: 42,
    speed: 0.93,
    slideChance: 0.1,
  },
  normal: {
    key: 'normal',
    label: 'NORMAL',
    reactTicks: 4,
    aimError: 15,
    passError: 5,
    settleTicks: 15,
    shootRange: 250,
    pressure: 50,
    speed: 0.98,
    slideChance: 0.22,
  },
  hard: {
    key: 'hard',
    label: 'HARD',
    reactTicks: 0,
    aimError: 0,
    passError: 0,
    settleTicks: 14,
    shootRange: 265,
    pressure: 52,
    speed: 1,
    slideChance: 0.35,
  },
};

export const BTN = {
  UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8,
  FIRE: 16, SWITCH: 32,
  // Extra face-button actions used by Pedra Lisa PS2 Web. The classic 2D game
  // keeps using FIRE/SWITCH, so its controls and deterministic replays remain
  // compatible.
  PASS: 64, SHOOT: 128, CROSS: 256, THROUGH: 512,
  // Premium-only team-management actions. Classic 2D never emits these bits.
  TACTIC_DOWN: 1024, TACTIC_UP: 2048, SUB: 4096,
  MENTALITY_DEF: 8192, MENTALITY_BAL: 16384, MENTALITY_ATT: 32768,
  FORMATION_PREV: 65536, FORMATION_NEXT: 131072,
};

export const SUB_TARGET_BITS = Array.from({ length: 11 }, (_, i) => 1 << (18 + i));

export const TEAM_PRESETS = [
  { name: 'PEDRA LISA', shirt: '#178a3c', shorts: '#ffffff', trim: '#178a3c', skin: '#e8b98a', hair: '#3a2415' },
  { name: 'INDEPENDÊNCIA', shirt: '#f5f5f5', shorts: '#111111', trim: '#111111', skin: '#8d5524', hair: '#221109' },
];

export const KEEPER_KIT = [
  { shirt: '#f2d43c', shorts: '#3a3a3a', trim: '#222222', skin: '#e8b98a', hair: '#3a2415' },
  { shirt: '#3ad07a', shorts: '#3a3a3a', trim: '#222222', skin: '#8d5524', hair: '#221109' },
];

// The skin in a kit above is only the fallback. A squad is eleven different
// people: giving every player in a team the same tone made the blue side look
// uniformly light and the red side uniformly dark, which is not what a team
// looks like. Hair travels with the skin, since the pairing is what reads as a
// person rather than a recoloured copy.
//
// The darkest tone is not as dark as it could be, on purpose: the face is three
// pixels tall from above and sits directly under the hair, so at the bottom of
// the range the head turned into one dark blob and the player stopped having a
// face at all. Every pair here keeps the hair clearly darker than the skin.
export const SKIN_TONES = [
  { skin: '#f2d0ab', hair: '#8a5a2b' },
  { skin: '#e8b98a', hair: '#3a2415' },
  { skin: '#c68642', hair: '#2a1a10' },
  { skin: '#a3663a', hair: '#1d1109' },
  { skin: '#8d5524', hair: '#221109' },
  { skin: '#6f4420', hair: '#1a0e06' },
];

/**
 * The kit one player wears, tone and all.
 *
 * The tone is picked by a stride through the palette rather than at random: the
 * simulation must not be touched for something this cosmetic, and a player has
 * to keep the same face from one frame to the next. Five and six share no
 * factors, so eleven players walk the whole palette instead of landing on three
 * of it, and the teams start at different points so the two sides are not the
 * same eleven faces twice.
 *
 * `id` is the sprite cache key: players sharing a kit and a tone share sprites,
 * so this costs a dozen little canvases, not twenty-two sets of them.
 */
// Visual player data only. These values do not change physics, speed,
// collisions, kicking, AI, or deterministic online simulation.
// skinTone indexes SKIN_TONES. height/build are render-only multipliers.
export const PLAYER_ROSTERS = [
  [
    { name: 'Olavo Lobão',      number: 1,  position: 'GOL', skinTone: 1, hair: '#2a1a10', height: 1.06, build: 1.03 },
    { name: 'Neto Bode',        number: 6,  position: 'LE',  skinTone: 2, hair: '#241811', height: 0.90, build: 0.96 },
    { name: 'Djha',             number: 2,  position: 'ZAG', skinTone: 1, hair: '#2a1a10', height: 0.96, build: 1.05 },
    { name: 'Bastiaozão Rei',   number: 4,  position: 'ZAG', skinTone: 0, hair: null, bald: true, height: 1.06, build: 1.08 },
    { name: 'Bruno',            number: 2,  position: 'LD',  skinTone: 3, hair: '#1d1109', height: 0.93, build: 0.98 },
    { name: 'Manoel',           number: 6,  position: 'VOL', skinTone: 1, hair: '#5a3924', height: 0.93, build: 0.97 },
    { name: 'Ronilton',         number: 8,  position: 'MEI', skinTone: 1, hair: '#2b1d16', height: 0.96, build: 0.98 },
    { name: 'Luciano',          number: 10, position: 'MEI', skinTone: 1, hair: '#2a1a10', height: 1.00, build: 0.98 },
    { name: 'Helio',            number: 11, position: 'PE',  skinTone: 1, hair: '#201712', height: 0.96, build: 0.97 },
    { name: 'Bastiaozinho',     number: 9,  position: 'ATA', skinTone: 1, hair: '#2a1a10', height: 1.06, build: 1.04 },
    { name: 'Ricardo',          number: 7,  position: 'PD',  skinTone: 2, hair: '#241811', height: 0.96, build: 0.96 },
  ],
  [
    { name: 'Junior Paredão',   number: 1,  position: 'GOL', skinTone: 0, hair: '#1d1109', height: 1.07, build: 1.05 },
    { name: 'Neto',             number: 6,  position: 'LE',  skinTone: 2, hair: '#2a1a10', height: 0.97, build: 0.96 },
    { name: 'Aberlado',         number: 3,  position: 'ZAG', skinTone: 0, hair: '#3a2415', height: 1.05, build: 1.05 },
    { name: 'Zé Neto',          number: 4,  position: 'ZAG', skinTone: 0, hair: '#8a5a2b', height: 1.05, build: 1.05 },
    { name: 'Edimar',           number: 2,  position: 'LD',  skinTone: 5, hair: '#1a0e06', height: 0.97, build: 0.96 },
    { name: 'Maninho',          number: 5,  position: 'VOL', skinTone: 4, hair: '#221109', height: 1.00, build: 1.00 },
    { name: 'Auristênio',       number: 8,  position: 'VOL', skinTone: 3, hair: '#1d1109', height: 1.00, build: 0.99 },
    { name: 'Chico Baião',      number: 10, position: 'MEI', skinTone: 2, hair: '#2a1a10', height: 0.98, build: 0.97 },
    { name: 'Alex',             number: 7,  position: 'MEI', skinTone: 1, hair: '#3a2415', height: 0.98, build: 0.97 },
    { name: 'Valdeke Mattos',   number: 9,  position: 'ATA', skinTone: 0, hair: '#8a5a2b', height: 1.05, build: 1.04 },
    { name: 'Clodoaldo',        number: 11, position: 'SA',  skinTone: 5, hair: '#1a0e06', height: 1.00, build: 0.99 },
  ],
];

// FC Mukeka Premium player ratings. These first values are deliberately
// provisional/balanced: they create different football profiles without claiming
// to measure the real-life ability of the people represented by the roster.
// VEL speed, FIN finishing, PAS passing, DRI ball control, DEF defending, FIS physical.
// Goalkeepers additionally use DEFESA, REFLEXO, POSICIONAMENTO, SAÍDA and PÉS.
export const PLAYER_RATINGS = [
  [
    { vel:62, fin:22, pas:70, dri:64, def:77, fis:76, gk:{ defesa:78, reflexo:77, pos:76, saida:74, pes:70 } },
    { vel:80, fin:58, pas:73, dri:76, def:72, fis:69 },
    { vel:71, fin:48, pas:70, dri:65, def:77, fis:78 },
    { vel:68, fin:54, pas:69, dri:64, def:79, fis:82 },
    { vel:78, fin:60, pas:72, dri:74, def:73, fis:70 },
    { vel:70, fin:62, pas:76, dri:72, def:77, fis:76 },
    { vel:74, fin:72, pas:79, dri:78, def:64, fis:71 },
    { vel:72, fin:74, pas:80, dri:79, def:62, fis:72 },
    { vel:82, fin:75, pas:73, dri:80, def:49, fis:69 },
    { vel:76, fin:81, pas:68, dri:74, def:48, fis:80 },
    { vel:83, fin:74, pas:72, dri:81, def:48, fis:68 },
  ],
  [
    { vel:61, fin:21, pas:69, dri:63, def:77, fis:77, gk:{ defesa:77, reflexo:78, pos:75, saida:75, pes:69 } },
    { vel:79, fin:62, pas:72, dri:75, def:73, fis:70 },
    { vel:69, fin:50, pas:68, dri:64, def:78, fis:80 },
    { vel:67, fin:52, pas:70, dri:63, def:79, fis:81 },
    { vel:81, fin:59, pas:70, dri:75, def:72, fis:69 },
    { vel:70, fin:63, pas:75, dri:71, def:77, fis:78 },
    { vel:72, fin:64, pas:76, dri:73, def:76, fis:75 },
    { vel:73, fin:73, pas:79, dri:78, def:63, fis:70 },
    { vel:75, fin:72, pas:78, dri:77, def:62, fis:71 },
    { vel:75, fin:80, pas:67, dri:73, def:47, fis:81 },
    { vel:79, fin:76, pas:75, dri:78, def:50, fis:72 },
  ],
];

export function overallFor(position, r) {
  if (!r) return 70;
  if (position === 'GOL' && r.gk) {
    const g = r.gk;
    return Math.round(
      g.defesa * .24 + g.reflexo * .25 + g.pos * .21 + g.saida * .16 + g.pes * .14
    );
  }

  const weights = {
    ZAG: { vel:.13, fin:.03, pas:.10, dri:.06, def:.40, fis:.28 },
    LE:  { vel:.24, fin:.07, pas:.17, dri:.13, def:.24, fis:.15 },
    LD:  { vel:.24, fin:.07, pas:.17, dri:.13, def:.24, fis:.15 },
    VOL: { vel:.12, fin:.07, pas:.24, dri:.13, def:.25, fis:.19 },
    MEI: { vel:.12, fin:.16, pas:.30, dri:.24, def:.07, fis:.11 },
    PE:  { vel:.28, fin:.20, pas:.15, dri:.27, def:.03, fis:.07 },
    PD:  { vel:.28, fin:.20, pas:.15, dri:.27, def:.03, fis:.07 },
    ATA: { vel:.22, fin:.35, pas:.08, dri:.16, def:.03, fis:.16 },
    SA:  { vel:.20, fin:.28, pas:.16, dri:.22, def:.04, fis:.10 },
  };
  const w = weights[position] || { vel:.16, fin:.16, pas:.18, dri:.18, def:.16, fis:.16 };
  return Math.round(
    r.vel*w.vel + r.fin*w.fin + r.pas*w.pas +
    r.dri*w.dri + r.def*w.def + r.fis*w.fis
  );
}

export function kitFor(teamIdx, playerIdx) {
  const base = playerIdx === 0 ? KEEPER_KIT[teamIdx] : TEAM_PRESETS[teamIdx];
  const player = PLAYER_ROSTERS[teamIdx]?.[playerIdx];
  const autoToneIdx = (playerIdx * 5 + teamIdx * 3) % SKIN_TONES.length;
  const toneIdx = Number.isInteger(player?.skinTone)
    ? Math.max(0, Math.min(SKIN_TONES.length - 1, player.skinTone))
    : autoToneIdx;
  const tone = SKIN_TONES[toneIdx];
  return {
    ...base,
    skin: tone.skin,
    hair: player?.bald ? tone.skin : (player?.hair || tone.hair),
    id: `${teamIdx}-${playerIdx}${playerIdx === 0 ? '-gk' : ''}-${toneIdx}-${player?.bald ? 'bald' : (player?.hair || tone.hair)}`,
  };
}

// Line-ups live in game/formations.js: they are a choice now, not a constant.
