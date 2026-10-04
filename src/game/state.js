import {
  AI_LEVELS, CENTER_R, FIELD, FIELD_H, FIELD_W, TEAM_PRESETS, PLAYER_ROSTERS, PLAYER_RATINGS, overallFor,
  KICKOFF_TICKS, PROTECT_TICKS, TICK_RATE,
} from '../constants.js';
import { lineupFrom } from './formations.js';
import { clamp } from '../util.js';

// The entire match state lives in one plain object: no DOM, no closures, no
// Math.random. That makes it serialisable (network) and copyable (rollback).

export function createMatch(options = {}) {
  const opts = {
    seed: 12345,
    halfSeconds: 120, // real seconds per half (displayed as 45 match minutes)
    humans: [true, false], // [is team 0 human?, is team 1 human?]
    difficulty: 'hard', // only affects CPU teams; a string, or one key per team
    offside: true, // the offside rule, whistle and all
    premiumAI: false, // richer off-ball tactics; opt-in so FC Mukeka 2D stays unchanged
    premiumSetPieces: false, // console-style restarts/fouls; opt-in for Premium only
    premiumBallControl: false, // first touch, shielding and skill touches; Premium only
    premiumManagement: false, // tactics, fatigue and substitutions; Premium only
    premiumRatings: false, // OVR + attributes affect Premium gameplay only
    premiumStats: false, // match stats, player ratings and match summary; Premium only
    // One line-up per team: a preset key, eleven spots from the editor, or null
    // for the default. Both machines in an online match are handed the same two.
    formations: [null, null],
    ...options,
  };

  const state = {
    tick: 0,
    rng: opts.seed | 0,
    seed: opts.seed | 0,
    config: {
      halfTicks: Math.round(opts.halfSeconds * TICK_RATE),
      offside: opts.offside !== false,
      premiumAI: opts.premiumAI === true,
      premiumSetPieces: opts.premiumSetPieces === true,
      premiumBallControl: opts.premiumBallControl === true,
      premiumManagement: opts.premiumManagement === true,
      premiumRatings: opts.premiumRatings === true,
      premiumStats: opts.premiumStats === true,
    },
    phase: 'kickoff', // kickoff | play | goal | restart | halftime | fulltime
    phaseTimer: KICKOFF_TICKS,
    half: 1,
    halfTick: 0,
    score: [0, 0],
    message: '',
    matchStats: {
      teams: [newTeamMatchStats(), newTeamMatchStats()],
      pendingPass: null,
      lastShot: null,
      assistCandidate: [null, null],
    },
    // What happened this tick: the renderer and the sound react to these, the
    // simulation itself never reads them back. Cleared at the top of every step.
    events: [],
    kickoffTeam: 0,
    firstKickoffTeam: 0,
    restartTeam: 0,
    lastGoalTeam: -1,
    setPiece: null,
    advantage: null,
    delivery: null,
    // Last team with controlled possession. Premium uses this to detect real
    // turnovers without treating every pass (owner=null in flight) as a loss.
    possessionTeam: -1,
    ball: newBall(),
    teams: [
      makeTeam(0, opts.humans[0], -1, levelFor(opts.difficulty, 0), opts.formations[0]),
      makeTeam(1, opts.humans[1], +1, levelFor(opts.difficulty, 1), opts.formations[1]),
    ],
  };

  setupKickoff(state, 0);
  return state;
}

function newTeamMatchStats() {
  return {
    possessionTicks: 0,
    shots: 0,
    shotsOnTarget: 0,
    passes: 0,
    passesCompleted: 0,
    fouls: 0,
    corners: 0,
    offsides: 0,
    saves: 0,
    yellow: 0,
    red: 0,
  };
}

function newPlayerMatchStats() {
  return {
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    passes: 0,
    passesCompleted: 0,
    tackles: 0,
    saves: 0,
    fouls: 0,
    yellow: 0,
    red: 0,
  };
}

function newBall() {
  return {
    x: FIELD.cx,
    y: FIELD.cy,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    spin: 0,
    owner: null, // {team, idx}
    lastTouch: null, // {team, idx}
    kicker: null, // {team, idx, ticks} -> who is allowed to apply aftertouch
    // While set, only this team may touch the ball, and opponents drop off
    // instead of pressing. Two flavours:
    //   'untilTouch'  - a restart: over the moment the taker has the ball
    //   'untilPlayed' - a keeper holding on: over when he clears it
    protectedFor: null,
    protectMode: 'untilTouch',
    protectTicks: 0,
  };
}

/**
 * `difficulty` is one key for both teams, or one entry per team. An entry may
 * also be a settings object, which is what the tuning tests use.
 */
function levelFor(difficulty, teamIdx) {
  const entry = Array.isArray(difficulty) ? difficulty[teamIdx] : difficulty;
  const level = typeof entry === 'object' && entry !== null ? entry : AI_LEVELS[entry];
  // Copied, so the settings travel with a clone and cannot change mid-match.
  return { ...AI_LEVELS.hard, ...(level || AI_LEVELS.hard) };
}

/** Who starts on the ball: whoever is furthest forward. */
function mostAdvanced(formation) {
  let best = 1;
  for (let i = 1; i < formation.length; i++) {
    if (formation[i].y > formation[best].y) best = i;
  }
  return best;
}

function makeTeam(index, human, attackDir, ai, lineup) {
  const preset = TEAM_PRESETS[index];
  const formation = lineupFrom(lineup);
  return {
    index,
    ai,
    name: preset.name,
    human: !!human,
    // This team's line-up. The other side may be playing something else.
    formation,
    formationKey: typeof lineup === 'string' ? lineup : 'custom',
    attackDir, // -1 = attacks towards the top (y decreasing), +1 = towards the bottom
    controlled: mostAdvanced(formation),
    prevMask: 0,
    // Ticks left in which the automatic switch keeps its hands off, because you
    // asked for a particular player yourself.
    manualHold: 0,
    // Short-lived memory for give-and-go runs in FC Mukeka Premium.
    // It exists on every match state but is inert unless config.premiumAI=true.
    oneTwoPasser: -1,
    oneTwoTicks: 0,
    // Premium transition memory. These stay zero in FC Mukeka 2D.
    counterTicks: 0,
    pressTicks: 0,
    turnoverX: FIELD.cx,
    turnoverY: FIELD.cy,
    mentality: 0, // -1 defensive, 0 balanced, +1 attacking
    subsUsed: 0,
    nextBenchNumber: 12,
    lastAutoSubHalfTick: -99999,
    pendingSubIdx: -1,
    subArchive: [],
    players: formation.map((f, i) => {
      const identity = PLAYER_ROSTERS[index]?.[i] || { name: 'Jogador', number: i + 1, position: 'MEI' };
      const rating = PLAYER_RATINGS[index]?.[i] || { vel:72, fin:72, pas:72, dri:72, def:72, fis:72 };
      const ovr = overallFor(identity.position, rating);
      return {
      idx: i,
      role: f.role,
      position: identity.position,
      displayName: identity.name,
      shirtNumber: identity.number,
      rating: { ...rating, gk: rating.gk ? { ...rating.gk } : undefined },
      overall: ovr,
      matchStats: newPlayerMatchStats(),
      x: FIELD.cx,
      y: FIELD.cy,
      vx: 0,
      vy: 0,
      dirX: 0,
      dirY: attackDir,
      charge: 0,
      charging: false,
      shotStyle: 'normal',
      slide: 0,
      down: 0,
      cooldown: 0,
      holdTicks: 0,
      supportRunTicks: 0,
      firstTouchTicks: 0,
      firstTouchSpeed: 0,
      shielding: false,
      skillTicks: 0,
      skillCooldown: 0,
      skillDirX: 0,
      skillDirY: attackDir,
      stamina: 1000,
      substitute: false,
      yellowCards: 0,
      sentOff: false,
      // Where the current run with the ball began, and whether it has already
      // been remarked upon.
      runFrom: null,
      ran: false,
      offside: false, // flagged when the ball was last played forward past him // how long this player has held the ball (for the keeper's clearance)
      };
    }),
  };
}

/** A position on the pitch for one team, in relative coordinates. */
export function posFor(team, xRel, yFrac) {
  const x = FIELD.cx + clamp(xRel, -1, 1) * (FIELD_W / 2 - 18);
  const y = team.attackDir < 0
    ? FIELD.bottom - yFrac * FIELD_H
    : FIELD.top + yFrac * FIELD_H;
  return { x, y };
}

/** How far a point is towards the opponent's goal (0 = own goal, 1 = their goal). */
export function advanceOf(team, y) {
  const a = team.attackDir < 0
    ? (FIELD.bottom - y) / FIELD_H
    : (y - FIELD.top) / FIELD_H;
  return clamp(a, 0, 1);
}

export function ownGoalY(team) {
  return team.attackDir < 0 ? FIELD.bottom : FIELD.top;
}

export function targetGoalY(team) {
  return team.attackDir < 0 ? FIELD.top : FIELD.bottom;
}

export function setupKickoff(state, kickoffTeam, reason = 'start') {
  state.kickoffTeam = kickoffTeam;
  // Why we are on the centre spot: the commentator says different things at the
  // start of a match, after a goal and after half time.
  state.kickoffReason = reason;
  state.phase = 'kickoff';
  state.phaseTimer = KICKOFF_TICKS;
  state.message = '';

  const b = state.ball;
  b.x = FIELD.cx;
  b.y = FIELD.cy;
  b.z = 0;
  b.vx = 0;
  b.vy = 0;
  b.vz = 0;
  b.spin = 0;
  b.owner = null;
  b.kicker = null;
  // Nobody may nick the ball off the side kicking off until they have played it.
  b.protectedFor = kickoffTeam;
  b.protectMode = 'untilTouch';
  b.protectTicks = PROTECT_TICKS;

  for (const team of state.teams) {
    for (let i = 0; i < team.players.length; i++) {
      const f = team.formation[i];
      // At kickoff everyone stands in their own half: y is squeezed into [0, 0.47].
      const yFrac = i === 0 ? f.y : Math.min(f.y * 0.62, 0.46);
      const p = posFor(team, f.x, yFrac);
      const pl = team.players[i];
      pl.x = p.x;
      pl.y = p.y;
      pl.vx = 0;
      pl.vy = 0;
      if (pl.sentOff) {
        pl.x = 8;
        pl.y = FIELD.cy;
        continue;
      }
      pl.dirX = 0;
      pl.dirY = team.attackDir;
      pl.charge = 0;
      pl.charging = false;
      pl.shotStyle = 'normal';
      pl.slide = 0;
      pl.down = 0;
      pl.cooldown = 0;
      pl.holdTicks = 0;
      pl.supportRunTicks = 0;
      pl.firstTouchTicks = 0;
      pl.firstTouchSpeed = 0;
      pl.shielding = false;
      pl.skillTicks = 0;
      pl.skillCooldown = 0;
      pl.skillDirX = 0;
      pl.skillDirY = team.attackDir;
      pl.offside = false;
    }
    team.controlled = 9;
    team.prevMask = 0;
    team.manualHold = 0;
    team.oneTwoPasser = -1;
    team.oneTwoTicks = 0;
    team.counterTicks = 0;
    team.pressTicks = 0;
    team.turnoverX = FIELD.cx;
    team.turnoverY = FIELD.cy;
  }

  state.possessionTeam = kickoffTeam;

  // The striker of the kickoff team stands next to the ball, on his own side of
  // the halfway line - he used to be placed in the opponent's half.
  const taker = state.teams[kickoffTeam].players[9];
  taker.x = FIELD.cx - 12;
  taker.y = FIELD.cy - state.teams[kickoffTeam].attackDir * 14;
  taker.dirX = 0;
  taker.dirY = state.teams[kickoffTeam].attackDir;
  state.teams[kickoffTeam].controlled = 9;

  if (state.config.premiumSetPieces) {
    const mate = state.teams[kickoffTeam].players[7];
    mate.x = FIELD.cx + 26;
    mate.y = FIELD.cy - state.teams[kickoffTeam].attackDir * 20;
    mate.vx = 0;
    mate.vy = 0;
    mate.dirX = -1;
    mate.dirY = state.teams[kickoffTeam].attackDir;
    state.setPiece = {
      kind: 'KICKOFF',
      team: kickoffTeam,
      taker: 9,
      x: FIELD.cx,
      y: FIELD.cy,
      mate: 7,
      targetIdx: 7,
      aimX: 0,
      aimLift: 0,
      keeperDive: 0,
    };
  } else {
    state.setPiece = null;
  }

  // Everyone except the taker keeps out of the centre circle, and by the same
  // measure ends up on his own half: the boundary is always on his own side.
  for (const team of state.teams) {
    for (const p of team.players) {
      if (p === taker) continue;
      const dx = p.x - FIELD.cx;
      const gap = Math.sqrt(Math.max(0, (CENTER_R + 8) ** 2 - dx * dx));
      const limit = FIELD.cy - team.attackDir * gap;
      p.y = team.attackDir < 0 ? Math.max(p.y, limit) : Math.min(p.y, limit);
    }
  }
}

/** Deep copy - the basis for rollback netcode and for replay/debugging. */
export function cloneState(state) {
  return structuredClone(state);
}

/** Cheap checksum to detect desync between two machines. */
export function hashState(state) {
  let h = 2166136261;
  const mix = (v) => {
    h ^= Math.round(v * 16) | 0;
    h = Math.imul(h, 16777619);
  };
  mix(state.tick);
  mix(state.score[0]);
  mix(state.score[1]);
  mix(state.ball.x);
  mix(state.ball.y);
  mix(state.ball.z);
  mix(state.ball.vx);
  mix(state.ball.vy);
  const spCodes = { KICKOFF: 1, 'THROW-IN': 2, CORNER: 3, 'GOAL KICK': 4, 'FREE KICK': 5, PENALTY: 6, OFFSIDE: 7 };
  mix(state.setPiece ? (spCodes[state.setPiece.kind] || 9) : 0);
  mix(state.setPiece?.team ?? -1);
  mix(state.setPiece?.taker ?? -1);
  mix(state.setPiece?.targetIdx ?? -1);
  mix(state.setPiece?.aimX ?? 0);
  mix(state.setPiece?.aimLift ?? 0);
  mix(state.setPiece?.keeperDive ?? 0);
  mix(state.advantage?.team ?? -1);
  mix(state.advantage?.ticksLeft ?? 0);
  mix(state.advantage?.possessionTicks ?? 0);
  mix(state.advantage?.offenderTeam ?? -1);
  mix(state.advantage?.offenderIdx ?? -1);
  mix(state.advantage?.card === 'red' ? 2 : state.advantage?.card === 'yellow' ? 1 : 0);
  mix(state.advantage?.directRed ? 1 : 0);
  mix(state.advantage?.foulType === 'DOGSO' ? 5
    : state.advantage?.foulType === 'RECKLESS' ? 4
    : state.advantage?.foulType === 'LATE' ? 3
    : state.advantage?.foulType === 'OFFBALL' ? 2
    : state.advantage?.foulType === 'PUSH' || state.advantage?.foulType === 'CHARGE' ? 1 : 0);
  mix(state.delivery?.team ?? -1);
  mix(state.delivery?.ticks ?? 0);
  mix(state.delivery?.kind === 'CORNER' ? 1 : state.delivery?.kind === 'FREE KICK' ? 2 : 0);
  mix(state.possessionTeam);
  for (const s of state.matchStats.teams) {
    mix(s.possessionTicks); mix(s.shots); mix(s.shotsOnTarget);
    mix(s.passes); mix(s.passesCompleted); mix(s.fouls);
    mix(s.corners); mix(s.offsides); mix(s.saves); mix(s.yellow); mix(s.red);
  }
  mix(state.matchStats.pendingPass?.team ?? -1);
  mix(state.matchStats.pendingPass?.idx ?? -1);
  mix(state.matchStats.lastShot?.team ?? -1);
  mix(state.matchStats.lastShot?.idx ?? -1);
  mix(state.matchStats.lastShot?.onTarget ? 1 : 0);
  mix(state.matchStats.assistCandidate?.[0]?.passer ?? -1);
  mix(state.matchStats.assistCandidate?.[0]?.receiver ?? -1);
  mix(state.matchStats.assistCandidate?.[1]?.passer ?? -1);
  mix(state.matchStats.assistCandidate?.[1]?.receiver ?? -1);
  for (const team of state.teams) {
    mix(team.oneTwoPasser);
    mix(team.oneTwoTicks);
    mix(team.counterTicks);
    mix(team.pressTicks);
    mix(team.turnoverX);
    mix(team.turnoverY);
    mix(team.mentality);
    mix(team.subsUsed);
    mix(team.nextBenchNumber);
    mix(team.lastAutoSubHalfTick);
    mix(team.pendingSubIdx);
    const formationCodes = { '433': 1, '442diamond': 2, '442': 3, '352': 4, '532': 5, custom: 9 };
    mix(formationCodes[team.formationKey] || 9);
    for (const spot of team.formation) {
      mix(spot.x);
      mix(spot.y);
    }
    for (const p of team.players) {
      mix(p.supportRunTicks);
      mix(p.shotStyle === 'placed' ? 1 : 0);
      mix(p.firstTouchTicks);
      mix(p.firstTouchSpeed);
      mix(p.shielding ? 1 : 0);
      mix(p.skillTicks);
      mix(p.skillCooldown);
      mix(p.skillDirX);
      mix(p.skillDirY);
      mix(p.stamina);
      mix(p.overall || 0);
      mix(p.matchStats?.goals || 0);
      mix(p.matchStats?.assists || 0);
      mix(p.matchStats?.shots || 0);
      mix(p.matchStats?.shotsOnTarget || 0);
      mix(p.matchStats?.passes || 0);
      mix(p.matchStats?.passesCompleted || 0);
      mix(p.matchStats?.tackles || 0);
      mix(p.matchStats?.saves || 0);
      mix(p.matchStats?.fouls || 0);
      mix(p.matchStats?.yellow || 0);
      mix(p.matchStats?.red || 0);
      mix(p.rating?.vel || 0);
      mix(p.rating?.fin || 0);
      mix(p.rating?.pas || 0);
      mix(p.rating?.dri || 0);
      mix(p.rating?.def || 0);
      mix(p.rating?.fis || 0);
      mix(p.rating?.gk?.defesa || 0);
      mix(p.rating?.gk?.reflexo || 0);
      mix(p.rating?.gk?.pos || 0);
      mix(p.rating?.gk?.saida || 0);
      mix(p.rating?.gk?.pes || 0);
      mix(p.substitute ? 1 : 0);
      mix(p.shirtNumber || 0);
      mix(p.yellowCards);
      mix(p.sentOff ? 1 : 0);
      mix(p.x);
      mix(p.y);
      mix(p.vx);
      mix(p.vy);
    }
  }
  return h >>> 0;
}
