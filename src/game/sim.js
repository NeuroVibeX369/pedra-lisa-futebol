import {
  AT_LIFT, AT_SIDE, AIR_DRAG, BALL_R, BOUNCE_XY, BOUNCE_Z, BTN, CHARGE_MAX,
  CONTROL_R, CONTROL_Z, CROSSBAR_H, DOWN_TICKS, DRIBBLE_DIST, DRIBBLE_LERP, DT,
  FIELD, GOAL_CELEBRATION_TICKS, GOAL_DEPTH, GOAL_W, GRAVITY, GROUND_FRICTION,
  HALFTIME_TICKS, KEEPER_CONTROL_R, KEEPER_CONTROL_Z, KEEPER_SPEED, MANUAL_HOLD_TICKS,
  PEN_D, PEN_W,
  KEEPER_HOLD_MAX, KEEPER_HOLD_TICKS, PLAYER_ACC, PLAYER_DAMP, PLAYER_R, PLAYER_SPEED,
  PLAYER_SPEED_BALL, PROTECT_TICKS, ROLL_DRAG,
  RESTART_TICKS,
  RUN_ADVANCE, SAVE_SPEED, SHOT_FLAT_RANGE, SHOT_LIFT_MAX,
  SIX_D, SLIDE_COOLDOWN, SLIDE_DECAY, SLIDE_REACH, SLIDE_SPEED, SLIDE_TICKS, SPIN_DECAY,
  WORLD_H, WORLD_W, SUB_TARGET_BITS,
} from '../constants.js';
import { clamp, dist, dist2, len, norm } from '../util.js';
import { maskToDir } from '../input.js';
import { aiMove, aiWantsSlide } from './ai.js';
import { chargeToShot, kickBall } from './kick.js';
import { advanceOf, ownGoalY, setupKickoff, targetGoalY } from './state.js';
import { clearOffside } from './offside.js';
import { aimedAtGoal, assistedAim } from './aim.js';
import { lineupFrom, PRESETS as FORMATION_PRESETS } from './formations.js';

/**
 * The only place where the match changes.
 * Pure: same state + same inputs -> same result, on every machine.
 *
 * @param {object} state    match state (mutated in place)
 * @param {number[]} inputs one bitmask per team slot, e.g. [0b10011, 0]
 */
export function step(state, inputs) {
  // Cleared before anything else, including the early return below. Leaving the
  // list standing at full time meant the final whistle sat in it forever and the
  // game loop played it again on every frame - a whistle that never stopped.
  state.events.length = 0;
  if (state.phase === 'fulltime') return state;

  state.tick++;
  advancePhase(state);

  const frozen = state.phase !== 'play';

  updateProtection(state);
  updateDelivery(state);
  updateOwnership(state);
  trackPossessionTick(state);
  if (updatePlayers(state, inputs, frozen)) return state;
  separatePlayers(state);
  if (resolveTackles(state)) return state;
  updateBall(state, inputs);

  if (!frozen) {
    const goal = checkGoal(state);
    if (goal) {
      settleAdvantage(state, true);
    } else {
      if (updateAdvantage(state)) return state;
      checkOutOfPlay(state);
    }
    updateClock(state);
  }
  return state;
}

function emptyPlayerStats() {
  return {
    goals:0, assists:0, shots:0, shotsOnTarget:0,
    passes:0, passesCompleted:0, tackles:0, saves:0,
    fouls:0, yellow:0, red:0,
  };
}

function trackPossessionTick(state) {
  if (!state.config.premiumStats || state.phase !== 'play') return;
  const teamIdx = state.ball.owner?.team ?? state.possessionTeam;
  if (teamIdx === 0 || teamIdx === 1) state.matchStats.teams[teamIdx].possessionTicks++;
}

function recordKickStats(state, teamIdx, playerIdx, kind) {
  if (!state.config.premiumStats || !kind) return;
  const teamStats = state.matchStats.teams[teamIdx];
  const p = state.teams[teamIdx].players[playerIdx];
  const passKinds = ['pass','through','cross'];
  const shotKinds = ['shot','placed-shot','low-shot','power-shot','chip-shot','volley','header'];

  if (passKinds.includes(kind)) {
    teamStats.passes++;
    p.matchStats.passes++;
    state.matchStats.pendingPass = { team: teamIdx, idx: playerIdx, kind };
    state.matchStats.lastShot = null;
  } else if (shotKinds.includes(kind)) {
    teamStats.shots++;
    p.matchStats.shots++;
    state.matchStats.lastShot = { team: teamIdx, idx: playerIdx, onTarget: false, kind };
    state.matchStats.pendingPass = null;
  } else if (kind !== 'throw-in') {
    state.matchStats.pendingPass = null;
  }
}

function settlePendingPassOnControl(state, teamIdx, playerIdx) {
  if (!state.config.premiumStats) return;
  const pass = state.matchStats.pendingPass;
  if (pass) {
    if (pass.team === teamIdx && pass.idx !== playerIdx) {
      state.matchStats.teams[teamIdx].passesCompleted++;
      const passer = state.teams[teamIdx].players[pass.idx];
      if (passer) passer.matchStats.passesCompleted++;
      state.matchStats.assistCandidate[teamIdx] = {
        passer: pass.idx,
        receiver: playerIdx,
      };
    } else if (pass.team !== teamIdx) {
      state.matchStats.assistCandidate[pass.team] = null;
    }
    state.matchStats.pendingPass = null;
  }

  const shot = state.matchStats.lastShot;
  if (shot && shot.team !== teamIdx) state.matchStats.lastShot = null;
}

function markShotOnTarget(state, attackingTeam = null) {
  if (!state.config.premiumStats) return;
  const shot = state.matchStats.lastShot;
  if (!shot || shot.onTarget) return;
  if (attackingTeam !== null && shot.team !== attackingTeam) return;
  shot.onTarget = true;
  state.matchStats.teams[shot.team].shotsOnTarget++;
  const p = state.teams[shot.team].players[shot.idx];
  if (p) p.matchStats.shotsOnTarget++;
}

function recordSaveStat(state, teamIdx, playerIdx) {
  if (!state.config.premiumStats) return;
  const attackingTeam = 1 - teamIdx;
  markShotOnTarget(state, attackingTeam);
  state.matchStats.teams[teamIdx].saves++;
  const p = state.teams[teamIdx].players[playerIdx];
  if (p) p.matchStats.saves++;
  state.matchStats.assistCandidate[attackingTeam] = null;
  state.matchStats.pendingPass = null;
  state.matchStats.lastShot = null;
}

function recordTackleStat(state, teamIdx, playerIdx) {
  if (!state.config.premiumStats) return;
  const p = state.teams[teamIdx].players[playerIdx];
  if (p) p.matchStats.tackles++;
}

function recordFoulStat(state, teamIdx, playerIdx) {
  if (!state.config.premiumStats) return;
  state.matchStats.teams[teamIdx].fouls++;
  const p = state.teams[teamIdx].players[playerIdx];
  if (p) p.matchStats.fouls++;
}

function recordCardStat(state, teamIdx, playerIdx, color) {
  if (!state.config.premiumStats) return;
  const t = state.matchStats.teams[teamIdx];
  const p = state.teams[teamIdx].players[playerIdx];
  if (color === 'red') {
    t.red++;
    if (p) p.matchStats.red++;
  } else {
    t.yellow++;
    if (p) p.matchStats.yellow++;
  }
}

// --------------------------------------------------------------------------
// Match phases
// --------------------------------------------------------------------------

function advancePhase(state) {
  if (state.phaseTimer > 0) {
    state.phaseTimer--;
    if (state.phaseTimer > 0) return;
  } else {
    return;
  }

  switch (state.phase) {
    case 'kickoff':
    case 'restart':
      state.phase = 'play';
      state.message = '';
      if (state.config.premiumSetPieces && state.setPiece) {
        const sp = state.setPiece;
        const taker = state.teams[sp.team]?.players?.[sp.taker];
        if (taker) {
          state.ball.owner = { team: sp.team, idx: sp.taker };
          state.ball.x = sp.x;
          state.ball.y = sp.y;
          state.ball.z = 0;
          state.ball.vx = 0;
          state.ball.vy = 0;
          state.ball.vz = 0;
          taker.holdTicks = 0;
          state.teams[sp.team].controlled = sp.taker;
          protectFor(state, sp.team, 'untilPlayed', PROTECT_TICKS * 2);
        }
      }
      state.events.push({ type: 'whistle', kind: 'start' });
      state.events.push({
        type: 'kickoff',
        reason: state.kickoffReason || 'start',
        score: [state.score[0], state.score[1]],
      });
      break;
    case 'goal':
      flushPendingSubstitutions(state);
      setupKickoff(state, 1 - state.lastGoalTeam, 'goal');
      break;
    case 'halftime':
      flushPendingSubstitutions(state);
      state.half = 2;
      state.halfTick = 0;
      for (const team of state.teams) {
        team.attackDir *= -1;
        if (state.config.premiumManagement) {
          for (const p of team.players) p.stamina = Math.min(1000, p.stamina + 95);
        }
      }
      setupKickoff(state, 1 - state.firstKickoffTeam, 'half');
      break;
    default:
      break;
  }
}

function updateClock(state) {
  state.halfTick++;
  if (state.halfTick < state.config.halfTicks) return;

  if (state.half === 1) {
    state.phase = 'halftime';
    state.phaseTimer = HALFTIME_TICKS;
    state.message = 'HALF TIME';
    state.events.push({ type: 'whistle', kind: 'half' });
  } else {
    state.phase = 'fulltime';
    state.phaseTimer = 0;
    state.message = 'FULL TIME';
    state.events.push({ type: 'whistle', kind: 'end' });
    state.events.push({ type: 'fulltime', score: [state.score[0], state.score[1]] });
  }
}

// --------------------------------------------------------------------------
// Ball possession
// --------------------------------------------------------------------------

/** Is this player inside his own penalty area? */
function inOwnBox(state, teamIdx, p) {
  const team = state.teams[teamIdx];
  const gy = team.attackDir < 0 ? FIELD.bottom : FIELD.top;
  return Math.abs(p.y - gy) < PEN_D && Math.abs(p.x - FIELD.cx) < PEN_W / 2;
}

function canControl(state, team, p) {
  const b = state.ball;
  if (p.sentOff || p.down > 0 || p.slide > 0 || p.cooldown > 0) return false;
  // A restart that has not been taken, or a keeper with the ball: hands off.
  if (b.protectedFor !== null && b.protectedFor !== team.index) return false;
  const isKeeper = p.role === 'gk';
  const deliveryThreat = isKeeper && state.delivery
    && state.delivery.team !== team.index
    && (state.delivery.kind === 'CORNER' || state.delivery.kind === 'FREE KICK');
  const gkReflex = state.config.premiumRatings && isKeeper ? (p.rating?.gk?.reflexo ?? 75) : 75;
  const gkDefesa = state.config.premiumRatings && isKeeper ? (p.rating?.gk?.defesa ?? 75) : 75;
  const gkReach = state.config.premiumRatings && isKeeper
    ? clamp(1 + (gkReflex - 75) * 0.003, 0.96, 1.04)
    : 1;
  const gkHeight = state.config.premiumRatings && isKeeper
    ? clamp(1 + (gkDefesa - 75) * 0.003, 0.96, 1.04)
    : 1;
  const r = isKeeper
    ? KEEPER_CONTROL_R * (deliveryThreat ? 1.22 : 1) * gkReach
    : CONTROL_R;
  const zMax = isKeeper
    ? KEEPER_CONTROL_Z * (deliveryThreat ? 1.16 : 1) * gkHeight
    : CONTROL_Z;
  if (b.z > zMax) return false;
  return dist2(b.x, b.y, p.x, p.y) < r * r;
}

function registerPossession(state, newTeam, x, y) {
  const oldTeam = state.possessionTeam;

  if (!state.config.premiumAI) {
    state.possessionTeam = newTeam;
    return;
  }

  if (oldTeam === newTeam) return;

  if (oldTeam >= 0 && oldTeam !== newTeam && state.phase === 'play' && !state.setPiece) {
    const winner = state.teams[newTeam];
    const loser = state.teams[oldTeam];
    const gainAdvance = advanceOf(winner, y);

    // A recovery in our own/middle third creates a longer counter window.
    winner.counterTicks = gainAdvance < 0.62 ? 168 : gainAdvance < 0.78 ? 132 : 96;
    winner.pressTicks = 0;
    loser.pressTicks = 126;
    loser.counterTicks = 0;

    winner.turnoverX = loser.turnoverX = x;
    winner.turnoverY = loser.turnoverY = y;

    state.events.push({
      type: 'transition',
      winner: newTeam,
      loser: oldTeam,
      x,
      y,
      counterTicks: winner.counterTicks,
      pressTicks: loser.pressTicks,
    });
  }

  state.possessionTeam = newTeam;
}

function updateOwnership(state) {
  const b = state.ball;

  if (b.owner) {
    if (state.config.premiumSetPieces && state.setPiece
        && b.owner.team === state.setPiece.team && b.owner.idx === state.setPiece.taker) {
      b.x = state.setPiece.x;
      b.y = state.setPiece.y;
      b.z = 0;
      b.vx = 0;
      b.vy = 0;
      b.vz = 0;
      b.spin = 0;
      return;
    }
    const p = state.teams[b.owner.team].players[b.owner.idx];
    const r = p.role === 'gk' ? KEEPER_CONTROL_R : CONTROL_R;
    if (p.down > 0 || p.slide > 0 || p.cooldown > 0 || dist2(b.x, b.y, p.x, p.y) > (r * 2) ** 2) {
      b.owner = null;
      p.holdTicks = 0;
      p.charging = false;
      p.shielding = false;
      p.charge = 0;
      p.shotStyle = 'normal';
    } else {
      p.holdTicks++;
      // Topped up for as long as he really has it, but not past the six second
      // rule, and only inside his own box. Carry the ball out of the area and
      // you are just another player with the ball - otherwise a keeper could
      // stroll the length of the pitch untouchable.
      if (p.role === 'gk') {
        if (p.holdTicks < KEEPER_HOLD_MAX && inOwnBox(state, b.owner.team, p)) {
          protectFor(state, b.owner.team, 'untilPlayed', KEEPER_HOLD_TICKS);
        } else if (b.protectMode === 'untilPlayed') {
          clearProtection(state);
        }
      }
      return;
    }
  }

  let best = null;
  let bestD = Infinity;
  for (let t = 0; t < 2; t++) {
    const team = state.teams[t];
    for (let i = 0; i < team.players.length; i++) {
      const p = team.players[i];
      if (!canControl(state, team, p)) continue;
      const d = dist2(b.x, b.y, p.x, p.y);
      if (d < bestD) {
        bestD = d;
        best = { team: t, idx: i };
      }
    }
  }
  if (best) {
    const struck = len(b.vx, b.vy);
    const stopped = state.teams[best.team].players[best.idx];
    const deliveryClaim = stopped.role === 'gk' && state.delivery
      && state.delivery.team !== best.team
      && (state.delivery.kind === 'CORNER' || state.delivery.kind === 'FREE KICK')
      && b.z > 4;
    // A save, not a pick-up: the keeper, a ball that was travelling, an opponent
    // who hit it, and close enough to his goal for it to have mattered.
    const isSave = stopped.role === 'gk' && struck > SAVE_SPEED
      && b.lastTouch && b.lastTouch.team !== best.team
      && Math.abs(b.y - ownGoalY(state.teams[best.team])) < PEN_D;

    if (isSave) {
      recordSaveStat(state, best.team, best.idx);
      const side = Math.sign(b.x - stopped.x) || 1;
      const high = b.z > KEEPER_CONTROL_Z * 0.52;
      // Very hard or high shots are punched/parried instead of magically glued
      // to the keeper. This is fully deterministic, so online lockstep remains valid.
      const handling = state.config.premiumRatings ? (stopped.rating?.gk?.defesa ?? 75) : 75;
      const catchThreshold = state.config.premiumRatings
        ? 1.55 + (handling - 75) * 0.006
        : 1.55;
      const parry = struck > SAVE_SPEED * catchThreshold || high;
      state.events.push({
        type: 'save',
        kind: parry ? 'parry' : 'catch',
        team: best.team,
        idx: best.idx,
        side,
        high,
        speed: struck,
      });

      if (parry) {
        const awayY = Math.sign(FIELD.cy - ownGoalY(state.teams[best.team])) || 1;
        const rebound = Math.max(SAVE_SPEED * 0.55, struck * 0.46);
        b.owner = null;
        b.lastTouch = { team: best.team, idx: best.idx };
        b.kicker = null;
        b.vx = side * rebound * 0.38;
        b.vy = awayY * rebound * 0.78;
        b.vz = Math.max(70, Math.abs(b.vz) * 0.35 + (high ? 85 : 45));
        b.spin *= -0.35;
        stopped.holdTicks = 0;
        clearOffside(state);
        return;
      }
    }

    if (deliveryClaim && !isSave) {
      state.events.push({
        type: 'save',
        kind: 'claim',
        team: best.team,
        idx: best.idx,
        side: Math.sign(b.x - stopped.x) || 0,
        high: b.z > KEEPER_CONTROL_Z * 0.58,
        speed: struck,
      });
    }

    if (state.config.premiumBallControl && stopped.role !== 'gk') {
      const baseTouchTicks = struck > 55 ? clamp(Math.round(struck / 48) + 2, 3, 9) : 0;
      const dri = ratingValue(state, stopped, 'dri', 72);
      const touchScale = state.config.premiumRatings
        ? clamp(1 - (dri - 72) * 0.010, 0.82, 1.12)
        : 1;
      const touchTicks = baseTouchTicks ? clamp(Math.round(baseTouchTicks * touchScale), 2, 10) : 0;
      stopped.firstTouchTicks = touchTicks;
      stopped.firstTouchSpeed = struck;
      if (touchTicks > 0) {
        const incoming = norm(b.vx, b.vy);
        const carry = Math.min(42, struck * 0.075);
        stopped.vx = stopped.vx * 0.82 + incoming.x * carry;
        stopped.vy = stopped.vy * 0.82 + incoming.y * carry;
        state.events.push({
          type: 'first-touch',
          team: best.team,
          idx: best.idx,
          speed: struck,
          high: b.z > CONTROL_Z * 0.55,
        });
      }
    }

    settlePendingPassOnControl(state, best.team, best.idx);
    registerPossession(state, best.team, b.x, b.y);
    b.owner = best;
    b.lastTouch = { team: best.team, idx: best.idx };
    if (state.delivery) state.delivery = null;
    b.kicker = null;
    const p = state.teams[best.team].players[best.idx];
    p.holdTicks = 0;
    // Where this run started, and whether it has already been remarked upon.
    p.runFrom = advanceOf(state.teams[best.team], p.y);
    p.ran = false;

    if (p.offside) {
      whistleOffside(state, best.team, p);
      return;
    }
    // Anyone touching the ball ends the previous pass, flags and all.
    clearOffside(state);

    // A restart is over the moment the taker has the ball: that is the touch
    // that puts it back in play.
    if (b.protectedFor === best.team && b.protectMode === 'untilTouch') {
      clearProtection(state);
    }

    // A keeper who has gathered the ball in his own box gets to clear it in peace.
    if (p.role === 'gk' && inOwnBox(state, best.team, p)) {
      protectFor(state, best.team, 'untilPlayed', KEEPER_HOLD_TICKS);
    }
  }
}

function protectFor(state, teamIdx, mode, ticks) {
  const b = state.ball;
  b.protectedFor = teamIdx;
  b.protectMode = mode;
  b.protectTicks = ticks;
}

function updateProtection(state) {
  const b = state.ball;
  if (b.protectedFor === null) return;
  b.protectTicks--;
  if (b.protectTicks <= 0) clearProtection(state);
}

export function clearProtection(state) {
  state.ball.protectedFor = null;
  state.ball.protectTicks = 0;
}

function updateDelivery(state) {
  if (!state.delivery) return;
  state.delivery.ticks--;
  if (state.delivery.ticks <= 0) state.delivery = null;
}

// --------------------------------------------------------------------------
// Players
// --------------------------------------------------------------------------

function ratingValue(state, p, key, fallback = 72) {
  if (!state.config.premiumRatings) return fallback;
  return p.rating?.[key] ?? fallback;
}

function speedRatingFactor(state, p) {
  if (!state.config.premiumRatings) return 1;
  const value = p.role === 'gk' ? (p.rating?.gk?.saida ?? 74) : (p.rating?.vel ?? 72);
  return clamp(1 + (value - 72) * 0.0032, 0.94, 1.05);
}

function kickRatingFactor(state, p, kind) {
  if (!state.config.premiumRatings) return 1;
  const passing = ['pass', 'through', 'cross', 'throw-in'].includes(kind);
  const value = passing ? (p.rating?.pas ?? 72) : (p.rating?.fin ?? 72);
  return clamp(1 + (value - 72) * (passing ? 0.0020 : 0.0026), 0.95, 1.05);
}

function staminaRatingFactor(state, p) {
  if (!state.config.premiumRatings) return 1;
  const fis = p.rating?.fis ?? 72;
  return clamp(1 - (fis - 72) * 0.0040, 0.92, 1.08);
}

const NO_INTENT = { x: 0, y: 0, kick: null, slide: false, press: false, shield: false, skill: null };

/**
 * Three phases per tick. The split is not cosmetic: handling team 0 completely
 * before team 1 gets to think means team 1 reacts to fresh positions and team 0
 * to stale ones. That measurably won team 1 more goals. Now all 22 players
 * decide their intent from the exact same snapshot.
 */
function setPieceTargets(state, sp) {
  const team = state.teams[sp.team];
  const candidates = [];
  for (let i = 1; i < team.players.length; i++) {
    const p = team.players[i];
    if (i === sp.taker || p.sentOff || p.down > 0) continue;
    candidates.push(i);
  }
  if (!candidates.length) return [];

  if (sp.kind === 'CORNER') {
    const preferred = [9, 8, 10, 7, 6, 5, 2, 3, 1, 4];
    return preferred.filter(i => candidates.includes(i));
  }
  if (sp.kind === 'THROW-IN') {
    return candidates.sort((a, b) =>
      dist2(sp.x, sp.y, team.players[a].x, team.players[a].y)
      - dist2(sp.x, sp.y, team.players[b].x, team.players[b].y));
  }
  if (sp.kind === 'GOAL KICK') {
    const preferred = [2, 3, 1, 4, 6, 5, 7, 8, 10, 9];
    return preferred.filter(i => candidates.includes(i));
  }
  if (sp.kind === 'FREE KICK' || sp.kind === 'OFFSIDE') {
    return candidates.sort((a, b) => {
      const aa = advanceOf(team, team.players[a].y);
      const ab = advanceOf(team, team.players[b].y);
      return ab - aa;
    });
  }
  return candidates;
}

function ensureSetPieceTarget(state, sp) {
  const targets = setPieceTargets(state, sp);
  if (!targets.length) {
    sp.targetIdx = -1;
    return -1;
  }
  if (!targets.includes(sp.targetIdx)) sp.targetIdx = targets[0];
  return sp.targetIdx;
}

function cycleSetPieceTarget(state, sp) {
  const targets = setPieceTargets(state, sp);
  if (!targets.length) {
    sp.targetIdx = -1;
    return;
  }
  const at = targets.indexOf(sp.targetIdx);
  sp.targetIdx = targets[(at + 1 + targets.length) % targets.length];
  state.events.push({ type: 'set-piece-target', team: sp.team, idx: sp.targetIdx, kind: sp.kind });
}

function cycleSetPieceTaker(state, sp) {
  if (sp.kind === 'KICKOFF' || sp.kind === 'GOAL KICK') return;
  const team = state.teams[sp.team];
  const eligible = [];
  for (let i = 1; i < team.players.length; i++) {
    const p = team.players[i];
    if (!p.sentOff && p.down === 0) eligible.push(i);
  }
  if (eligible.length < 2) return;

  const at = eligible.indexOf(sp.taker);
  const next = eligible[(at + 1 + eligible.length) % eligible.length];
  if (next === sp.taker) return;

  const old = team.players[sp.taker];
  const neo = team.players[next];
  const ox = old.x, oy = old.y;
  old.x = neo.x; old.y = neo.y; old.vx = 0; old.vy = 0;
  neo.x = ox; neo.y = oy; neo.vx = 0; neo.vy = 0;
  sp.taker = next;
  team.controlled = next;
  if (state.ball.owner?.team === sp.team) state.ball.owner = { team: sp.team, idx: next };
  ensureSetPieceTarget(state, sp);
  state.events.push({ type: 'set-piece-taker', team: sp.team, idx: next, kind: sp.kind });
}

function setPieceTargetDir(state, sp, fallbackPlayer) {
  const team = state.teams[sp.team];
  const idx = ensureSetPieceTarget(state, sp);
  const target = idx >= 0 ? team.players[idx] : null;
  if (target) {
    const lead = sp.kind === 'CORNER' ? 0.14 : 0.08;
    return norm(
      target.x + target.vx * lead - fallbackPlayer.x,
      target.y + target.vy * lead - fallbackPlayer.y
    );
  }
  return norm(fallbackPlayer.dirX, fallbackPlayer.dirY);
}

function updatePremiumSetPieceControls(state, inputs) {
  const sp = state.config.premiumSetPieces ? state.setPiece : null;
  if (!sp) return;

  const attacking = state.teams[sp.team];
  if (attacking.human) {
    const mask = inputs[sp.team] | 0;
    const prev = attacking.prevMask | 0;
    const throughPressed = (mask & BTN.THROUGH) !== 0 && (prev & BTN.THROUGH) === 0;
    const switchPressed = (mask & BTN.SWITCH) !== 0 && (prev & BTN.SWITCH) === 0;
    const dir = maskToDir(mask);

    if (throughPressed && ['THROW-IN','CORNER','FREE KICK','OFFSIDE','GOAL KICK'].includes(sp.kind)) {
      cycleSetPieceTarget(state, sp);
    }
    if (switchPressed) cycleSetPieceTaker(state, sp);

    if (sp.kind === 'PENALTY' || sp.kind === 'FREE KICK') {
      sp.aimX = clamp((sp.aimX || 0) + dir.x * 1.15, -GOAL_W * 0.38, GOAL_W * 0.38);
      sp.aimLift = clamp((sp.aimLift || 0) - dir.y * 1.05, 0, sp.kind === 'PENALTY' ? 42 : 95);
    }
  }

  if (sp.kind === 'PENALTY') {
    const defendingTeam = 1 - sp.team;
    const defending = state.teams[defendingTeam];
    if (defending.human) {
      const dir = maskToDir(inputs[defendingTeam] | 0);
      if (Math.abs(dir.x) > 0.25) sp.keeperDive = dir.x < 0 ? -1 : 1;
      else if (Math.abs(dir.y) > 0.5) sp.keeperDive = 0;
    }
  }
}

function mentalityName(v) {
  return v < 0 ? 'DEFENSIVO' : v > 0 ? 'OFENSIVO' : 'EQUILIBRADO';
}

function setMentality(state, teamIdx, value, source = 'manual') {
  const team = state.teams[teamIdx];
  const next = clamp(value, -1, 1);
  if (team.mentality === next) return;
  team.mentality = next;
  state.events.push({
    type: 'tactic',
    team: teamIdx,
    mentality: next,
    label: mentalityName(next),
    source,
  });
}

function substitutionCandidate(team, preferredIdx = -1) {
  const usable = [];
  for (let i = 1; i < team.players.length; i++) {
    const p = team.players[i];
    if (p.sentOff || p.substitute) continue;
    usable.push(i);
  }
  if (!usable.length) return -1;
  if (usable.includes(preferredIdx)) return preferredIdx;
  usable.sort((a, b) => team.players[a].stamina - team.players[b].stamina || a - b);
  return usable[0];
}

function queueSubstitution(state, teamIdx, preferredIdx = -1, source = 'manual') {
  const team = state.teams[teamIdx];
  if (!state.config.premiumManagement || team.subsUsed >= 3 || team.pendingSubIdx >= 0) return false;
  const idx = substitutionCandidate(team, preferredIdx);
  if (idx < 0) return false;
  team.pendingSubIdx = idx;
  const p = team.players[idx];
  state.events.push({
    type: 'sub-pending',
    team: teamIdx,
    idx,
    outName: p.displayName,
    source,
  });
  return true;
}

function applyPendingSubstitution(state, teamIdx) {
  const team = state.teams[teamIdx];
  const idx = team.pendingSubIdx;
  if (!state.config.premiumManagement || idx < 1 || team.subsUsed >= 3) {
    team.pendingSubIdx = -1;
    return false;
  }
  const p = team.players[idx];
  if (!p || p.sentOff || p.substitute) {
    team.pendingSubIdx = -1;
    return false;
  }

  const outName = p.displayName;
  if (state.config.premiumStats) {
    team.subArchive.push({
      displayName: p.displayName,
      shirtNumber: p.shirtNumber,
      position: p.position,
      overall: p.overall,
      matchStats: { ...p.matchStats },
    });
  }
  const inNumber = team.nextBenchNumber++;
  const inName = 'Reserva ' + inNumber;

  p.displayName = inName;
  p.shirtNumber = inNumber;
  if (state.config.premiumRatings) {
    const delta = ((inNumber + teamIdx * 3) % 5) - 2;
    const targetOverall = clamp((p.overall || 72) - 2 + delta, 66, 78);
    const currentOverall = Math.max(1, p.overall || 72);
    const scale = targetOverall / currentOverall;
    for (const key of ['vel','fin','pas','dri','def','fis']) {
      if (typeof p.rating?.[key] === 'number') p.rating[key] = clamp(Math.round(p.rating[key] * scale), 55, 84);
    }
    p.overall = targetOverall;
  }
  p.stamina = 1000;
  if (state.config.premiumStats) p.matchStats = emptyPlayerStats();
  p.substitute = true;
  p.yellowCards = 0;
  p.down = 0;
  p.cooldown = 0;
  p.slide = 0;
  p.charging = false;
  p.charge = 0;
  p.firstTouchTicks = 0;
  p.skillTicks = 0;
  p.skillCooldown = 0;
  p.shielding = false;
  team.subsUsed++;
  team.pendingSubIdx = -1;

  state.events.push({
    type: 'substitution',
    team: teamIdx,
    idx,
    outName,
    inName,
    inNumber,
    used: team.subsUsed,
  });
  return true;
}

function flushPendingSubstitutions(state) {
  for (let t = 0; t < 2; t++) applyPendingSubstitution(state, t);
}

function updateCpuManagement(state) {
  if (!state.config.premiumManagement || state.phase !== 'play') return;
  if (state.tick % 60 !== 0) return;

  const frac = state.halfTick / Math.max(1, state.config.halfTicks);
  for (let t = 0; t < 2; t++) {
    const team = state.teams[t];
    if (team.human) continue;

    const diff = state.score[t] - state.score[1 - t];
    let desired = 0;
    if (state.half === 2 && frac > 0.66) {
      if (diff < 0) desired = 1;
      else if (diff > 0) desired = -1;
    } else if (diff <= -2) desired = 1;
    setMentality(state, t, desired, 'cpu');

    if (team.subsUsed < 3 && team.pendingSubIdx < 0
        && state.half === 2 && frac > 0.18
        && state.halfTick - team.lastAutoSubHalfTick > 1200) {
      const idx = substitutionCandidate(team);
      if (idx >= 0) {
        const threshold = frac > 0.72 ? 760 : frac > 0.45 ? 680 : 590;
        if (team.players[idx].stamina < threshold) {
          team.lastAutoSubHalfTick = state.halfTick;
          queueSubstitution(state, t, idx, 'cpu');
        }
      }
    }
  }
}

function cycleFormation(state, teamIdx, delta) {
  const team = state.teams[teamIdx];
  const keys = FORMATION_PRESETS.map(p => p.key);
  let at = keys.indexOf(team.formationKey);
  if (at < 0) at = 0;
  const nextKey = keys[(at + delta + keys.length) % keys.length];
  team.formationKey = nextKey;
  team.formation = lineupFrom(nextKey);
  for (let i = 0; i < team.players.length; i++) {
    team.players[i].role = team.formation[i].role;
  }
  state.events.push({
    type: 'formation',
    team: teamIdx,
    key: nextKey,
    label: FORMATION_PRESETS.find(p => p.key === nextKey)?.label || nextKey,
  });
}

function updatePremiumManagementControls(state, inputs) {
  if (!state.config.premiumManagement) return;
  updateCpuManagement(state);

  for (let t = 0; t < 2; t++) {
    const team = state.teams[t];
    if (!team.human) continue;
    const mask = inputs[t] | 0;
    const prev = team.prevMask | 0;
    const down = (mask & BTN.TACTIC_DOWN) !== 0 && (prev & BTN.TACTIC_DOWN) === 0;
    const up = (mask & BTN.TACTIC_UP) !== 0 && (prev & BTN.TACTIC_UP) === 0;
    const sub = (mask & BTN.SUB) !== 0 && (prev & BTN.SUB) === 0;
    const exactDef = (mask & BTN.MENTALITY_DEF) !== 0 && (prev & BTN.MENTALITY_DEF) === 0;
    const exactBal = (mask & BTN.MENTALITY_BAL) !== 0 && (prev & BTN.MENTALITY_BAL) === 0;
    const exactAtt = (mask & BTN.MENTALITY_ATT) !== 0 && (prev & BTN.MENTALITY_ATT) === 0;
    const formPrev = (mask & BTN.FORMATION_PREV) !== 0 && (prev & BTN.FORMATION_PREV) === 0;
    const formNext = (mask & BTN.FORMATION_NEXT) !== 0 && (prev & BTN.FORMATION_NEXT) === 0;

    if (exactDef) setMentality(state, t, -1);
    else if (exactBal) setMentality(state, t, 0);
    else if (exactAtt) setMentality(state, t, 1);
    else {
      if (down) setMentality(state, t, team.mentality - 1);
      if (up) setMentality(state, t, team.mentality + 1);
    }

    if (formPrev) cycleFormation(state, t, -1);
    if (formNext) cycleFormation(state, t, 1);

    let targetedSub = -1;
    for (let i = 1; i < SUB_TARGET_BITS.length; i++) {
      const bit = SUB_TARGET_BITS[i];
      if ((mask & bit) !== 0 && (prev & bit) === 0) {
        targetedSub = i;
        break;
      }
    }
    if (targetedSub >= 0) queueSubstitution(state, t, targetedSub, 'screen');
    else if (sub) queueSubstitution(state, t, team.controlled, 'manual');
  }
}

function updatePlayers(state, inputs, frozen) {
  updatePremiumSetPieceControls(state, inputs);
  updatePremiumManagementControls(state, inputs);

  // Phase 0: timers that feed into the decisions below.
  for (const team of state.teams) {
    if (state.config.premiumAI && team.oneTwoTicks > 0) {
      team.oneTwoTicks--;
      if (team.oneTwoTicks === 0) team.oneTwoPasser = -1;
    }
    if (state.config.premiumAI && team.counterTicks > 0) team.counterTicks--;
    if (state.config.premiumAI && team.pressTicks > 0) team.pressTicks--;
    for (const p of team.players) {
      if (p.cooldown > 0) p.cooldown--;
      if (state.config.premiumAI && p.supportRunTicks > 0) p.supportRunTicks--;
      if (state.config.premiumBallControl) {
        if (p.firstTouchTicks > 0) p.firstTouchTicks--;
        if (p.skillTicks > 0) p.skillTicks--;
        if (p.skillCooldown > 0) p.skillCooldown--;
        const owns = state.ball.owner
          && state.ball.owner.team === team.index
          && state.ball.owner.idx === p.idx;
        if (!owns) p.shielding = false;
      }
    }
  }
  for (let t = 0; t < 2; t++) {
    const team = state.teams[t];
    if (!team.human) continue;
    const mask = inputs[t] | 0;
    const asked = (mask & BTN.SWITCH) !== 0 && (team.prevMask & BTN.SWITCH) === 0;
    if (state.config.premiumSetPieces && state.setPiece) {
      if (state.setPiece.team === t) team.controlled = state.setPiece.taker;
      continue;
    }
    updateControlledPlayer(state, t, asked);
  }

  // Phase 1: decide intents (reads the shared snapshot).
  const intents = [[], []];
  for (let t = 0; t < 2; t++) {
    const team = state.teams[t];
    const mask = team.human ? (inputs[t] | 0) : 0;
    for (let i = 0; i < team.players.length; i++) {
      const p = team.players[i];
      const waitingSetPiece = state.config.premiumSetPieces && state.setPiece;
      const isSetPieceTaker = waitingSetPiece && state.setPiece.team === t && state.setPiece.taker === i;
      if (frozen || p.sentOff || p.down > 0 || (waitingSetPiece && !isSetPieceTaker)) {
        intents[t][i] = NO_INTENT;
        continue;
      }
      if (team.human && i === team.controlled) {
        intents[t][i] = humanIntent(state, t, i, mask);
      } else {
        const mv = aiMove(state, t, i, { allowKicks: !team.human });
        intents[t][i] = {
          x: mv.x,
          y: mv.y,
          kick: mv.kick || null,
          slide: !team.human && aiWantsSlide(state, t, i),
          shield: !!mv.shield,
          skill: mv.skill || null,
        };
      }
    }
  }

  // Phase 2: carry out actions (at most one player owns the ball, so at most one kick).
  for (let t = 0; t < 2; t++) {
    const team = state.teams[t];
    for (let i = 0; i < team.players.length; i++) {
      const it = intents[t][i];
      const p = team.players[i];
      const ownsNow = state.ball.owner && state.ball.owner.team === t && state.ball.owner.idx === i;
      if (state.config.premiumBallControl) {
        p.shielding = !!it.shield && ownsNow && p.skillTicks <= 0;
        if (it.skill) startSkillDribble(state, t, i, it.skill);
      }
      if (it.kick) {
        const takingSetPiece = state.config.premiumSetPieces
          && state.setPiece?.team === t && state.setPiece?.taker === i;
        const setPieceKind = takingSetPiece ? state.setPiece.kind : null;
        if (takingSetPiece && setPieceKind === 'PENALTY') {
          const sp = state.setPiece;
          const defendingTeam = 1 - t;
          const keeper = state.teams[defendingTeam].players[0];
          let dive = sp.keeperDive || 0;
          if (!state.teams[defendingTeam].human) {
            const shotSide = Math.abs(it.kick.dx) < 0.08 ? 0 : (it.kick.dx < 0 ? -1 : 1);
            const roll = Math.abs((state.seed ^ (state.tick * 1103515245) ^ (defendingTeam * 7919))) % 100;
            if (roll < 30) {
              // Sometimes the keeper reads the body shape correctly.
              dive = shotSide;
            } else {
              // Otherwise he commits before the strike, including an occasional centre stay.
              const pick = Math.abs((state.seed + state.tick * 31 + defendingTeam * 17)) % 5;
              dive = pick < 2 ? -1 : pick < 4 ? 1 : 0;
            }
          }
          keeper.x = clamp(FIELD.cx + dive * GOAL_W * 0.27, FIELD.cx - GOAL_W * 0.42, FIELD.cx + GOAL_W * 0.42);
          keeper.vx = dive * KEEPER_SPEED * 0.65;
          keeper.vy = 0;
          state.events.push({ type: 'penalty-dive', team: defendingTeam, idx: 0, side: dive });
        }
        const ratingFactor = kickRatingFactor(state, p, it.kick.kind);
        const ratedPower = it.kick.power * ratingFactor;
        const ratedLift = state.config.premiumRatings
          && ['shot','placed-shot','low-shot','power-shot','chip-shot','volley','header'].includes(it.kick.kind)
          ? it.kick.lift * clamp(1 - ((p.rating?.fin ?? 72) - 72) * 0.0018, 0.96, 1.04)
          : it.kick.lift;
        kickBall(state, t, i, it.kick.dx, it.kick.dy, ratedPower, ratedLift);
        recordKickStats(state, t, i, it.kick.kind);
        if (typeof it.kick.spin === 'number') state.ball.spin = it.kick.spin;
        if (takingSetPiece) {
          state.events.push({ type: 'set-piece-taken', kind: setPieceKind, team: t, idx: i });
          if (setPieceKind === 'CORNER' || setPieceKind === 'FREE KICK') {
            state.delivery = { kind: setPieceKind, team: t, ticks: 150 };
          } else {
            state.delivery = null;
          }
          state.setPiece = null;
        }
        if (state.config.premiumAI && (it.kick.kind === 'pass' || it.kick.kind === 'through')) {
          if (it.kick.oneTwoReturn) {
            team.oneTwoPasser = -1;
            team.oneTwoTicks = 0;
          } else {
            const passer = team.players[i];
            passer.supportRunTicks = it.kick.kind === 'through' ? 126 : 102;
            team.oneTwoPasser = i;
            team.oneTwoTicks = 132;
            state.events.push({ type: 'support-run', team: t, idx: i, kind: it.kick.kind });
          }
        }
        if (it.kick.kind) state.events.push({ type: 'action', kind: it.kick.kind, team: t, idx: i });
      }
      if (it.press && tryStandingPressure(state, t, i)) return true;
      if (it.slide) startSlide(state, team.players[i]);
    }
  }

  // Phase 3: move.
  for (let t = 0; t < 2; t++) {
    const team = state.teams[t];
    for (let i = 0; i < team.players.length; i++) {
      const p = team.players[i];
      if (p.sentOff) {
        p.vx = 0;
        p.vy = 0;
        continue;
      }
      if (p.down > 0) {
        p.down--;
        p.vx *= 0.86;
        p.vy *= 0.86;
        integratePlayer(p);
        continue;
      }
      if (frozen) {
        p.charging = false;
        p.charge = 0;
      }
      movePlayer(state, t, p, intents[t][i]);
    }
    if (team.human) team.prevMask = inputs[t] | 0;
  }
  return false;
}

/** Auto-switch: you always control the player on the ball, otherwise the nearest one. */
function updateControlledPlayer(state, t, forced = false) {
  const team = state.teams[t];
  const b = state.ball;

  if (b.owner && b.owner.team === t) {
    team.controlled = b.owner.idx;
    team.manualHold = 0;
    return;
  }

  // Everyone who could take over, nearest the ball first. The keeper stays on
  // the computer for the save itself - you take over once he has the ball,
  // which is handled above. Being dropped into goal as a shot comes in is
  // nobody's idea of a good time.
  const order = [];
  for (let i = 1; i < team.players.length; i++) {
    if (!team.players[i].sentOff && team.players[i].down === 0) order.push(i);
  }
  if (!order.length) return;
  order.sort((a, c) => dist2(b.x, b.y, team.players[a].x, team.players[a].y)
    - dist2(b.x, b.y, team.players[c].x, team.players[c].y));

  if (forced) {
    // Step to the next man out rather than to the nearest: the automatic pick
    // has you on the nearest almost all the time already, so a button that
    // chooses him again does nothing. Press it repeatedly to work outwards.
    const at = order.indexOf(team.controlled);
    team.controlled = order[(at + 1) % order.length];
    team.manualHold = MANUAL_HOLD_TICKS;
    return;
  }

  // Your own choice stands for a moment before the game starts helping again.
  if (team.manualHold > 0) {
    team.manualHold--;
    return;
  }

  const cur = team.players[team.controlled];
  if (cur && cur.down === 0 && (cur.slide > 0 || cur.charging)) return;

  const best = order[0];
  // Hysteresis: do not switch over a negligible difference (stops the flip-flopping).
  if (best !== team.controlled && cur && cur.down === 0) {
    const curD = dist2(b.x, b.y, cur.x, cur.y);
    const bestD = dist2(b.x, b.y, team.players[best].x, team.players[best].y);
    if (curD - bestD < 18 * 18) return;
  }
  team.controlled = best;
}

function humanIntent(state, t, i, mask) {
  const team = state.teams[t];
  const p = team.players[i];
  const b = state.ball;
  const dir = maskToDir(mask);
  const intent = { x: dir.x, y: dir.y, kick: null, slide: false, press: false, shield: false, skill: null };
  const prev = team.prevMask | 0;

  // Legacy FIRE stays intact for Classic 2D and keyboard play. PS2 Web adds
  // four independent face-button actions on top of it.
  const shoot = (mask & (BTN.FIRE | BTN.SHOOT)) !== 0;
  const prevShoot = (prev & (BTN.FIRE | BTN.SHOOT)) !== 0;
  const passHeld = (mask & BTN.PASS) !== 0;
  const passPressed = passHeld && (prev & BTN.PASS) === 0;
  const crossPressed = (mask & BTN.CROSS) !== 0 && (prev & BTN.CROSS) === 0;
  const throughPressed = (mask & BTN.THROUGH) !== 0 && (prev & BTN.THROUGH) === 0;
  const switchHeld = (mask & BTN.SWITCH) !== 0;
  const switchPressed = switchHeld && (prev & BTN.SWITCH) === 0;
  const owns = b.owner && b.owner.team === t && b.owner.idx === i;
  const aimX = dir.x || p.dirX;
  const aimY = dir.y || p.dirY;

  const sp = state.config.premiumSetPieces && state.setPiece
    && state.setPiece.team === t && state.setPiece.taker === i
    ? state.setPiece : null;

  if (owns && sp) {
    // A set-piece taker is planted at the mark. Directional input adjusts aim
    // (or the goalkeeper on a penalty) instead of walking away from the ball.
    intent.x = 0;
    intent.y = 0;

    if (sp.kind === 'THROW-IN') {
      if (passPressed || crossPressed || (shoot && !prevShoot)) {
        p.charging = false;
        p.charge = 0;
        const d = setPieceTargetDir(state, sp, p);
        const longThrow = crossPressed || shoot;
        const shot = chargeToShot(longThrow ? 13 : 6);
        intent.kick = {
          dx: d.x,
          dy: d.y,
          power: shot.power * (longThrow ? 1.08 : 0.90),
          lift: longThrow ? 165 : 105,
          kind: 'throw-in',
        };
      }
    } else if (sp.kind === 'CORNER') {
      const d = setPieceTargetDir(state, sp, p);
      if (passPressed) {
        const shot = chargeToShot(4);
        intent.kick = { dx: d.x, dy: d.y, power: shot.power, lift: 0, kind: 'pass' };
      } else if (crossPressed) {
        const shot = chargeToShot(19);
        intent.kick = { dx: d.x, dy: d.y, power: shot.power, lift: 235, kind: 'cross' };
      } else if (shoot && !prevShoot) {
        p.charging = true;
        p.charge = 0;
      }
    } else if (sp.kind === 'KICKOFF') {
      if (passPressed || crossPressed || (shoot && !prevShoot)) {
        const mate = team.players[sp.mate ?? sp.targetIdx ?? 7];
        const d = mate ? norm(mate.x - p.x, mate.y - p.y) : norm(0, team.attackDir);
        const shot = chargeToShot(3);
        intent.kick = { dx: d.x, dy: d.y, power: shot.power, lift: 0, kind: 'pass' };
      }
    } else if (sp.kind === 'GOAL KICK') {
      const d = setPieceTargetDir(state, sp, p);
      if (passPressed) {
        intent.kick = { dx: d.x, dy: d.y, power: chargeToShot(8).power, lift: 45, kind: 'pass' };
      } else if (crossPressed) {
        intent.kick = { dx: d.x, dy: d.y, power: chargeToShot(20).power, lift: 220, kind: 'cross' };
      } else if (shoot && !prevShoot) {
        p.charging = true;
        p.charge = 0;
      }
    } else if (sp.kind === 'FREE KICK' || sp.kind === 'OFFSIDE') {
      if (passPressed) {
        const d = setPieceTargetDir(state, sp, p);
        intent.kick = { dx: d.x, dy: d.y, power: chargeToShot(5).power, lift: 0, kind: 'pass' };
      } else if (crossPressed) {
        const d = setPieceTargetDir(state, sp, p);
        intent.kick = { dx: d.x, dy: d.y, power: chargeToShot(17).power, lift: 175, kind: 'cross' };
      } else if (shoot && !prevShoot) {
        p.charging = true;
        p.charge = 0;
      }
    } else if (sp.kind === 'PENALTY') {
      if (shoot && !prevShoot) {
        p.charging = true;
        p.charge = 0;
      }
    }
  } else if (owns) {
    if (state.config.premiumBallControl) {
      const moving = len(dir.x, dir.y) > 0.2;
      const facePressed = passPressed || throughPressed || crossPressed || (shoot && !prevShoot);
      if (switchPressed && moving && !facePressed && p.skillCooldown === 0 && p.firstTouchTicks === 0) {
        intent.skill = { dx: dir.x, dy: dir.y };
      } else if (switchHeld && !facePressed) {
        intent.shield = true;
        intent.x *= 0.58;
        intent.y *= 0.58;
      }
    }

    // Face buttons behave like a console football game:
    // × short grounded pass; △ stronger ball into space; ○ lofted cross;
    // □/legacy FIRE is the chargeable shot.
    if (switchHeld && throughPressed && state.config.premiumBallControl) {
      p.charging = false;
      p.charge = 0;
      p.shotStyle = 'normal';
      const aimed = assistedAim(state, t, i, aimX, aimY);
      const shot = chargeToShot(14);
      intent.kick = {
        dx: aimed.x,
        dy: aimed.y,
        power: shot.power * 0.86,
        lift: 265,
        kind: 'chip-shot',
      };
    } else if (passPressed) {
      p.charging = false;
      p.charge = 0;
      p.shotStyle = 'normal';
      const shot = chargeToShot(2);
      const aimed = assistedAim(state, t, i, aimX, aimY);
      intent.kick = { dx: aimed.x, dy: aimed.y, power: shot.power, lift: 0, kind: 'pass' };
    } else if (throughPressed) {
      p.charging = false;
      p.charge = 0;
      const shot = chargeToShot(8);
      // Through balls deliberately use less teammate magnetism: point into the
      // space you want to attack.
      intent.kick = { dx: aimX, dy: aimY, power: shot.power, lift: 0, kind: 'through' };
    } else if (crossPressed) {
      p.charging = false;
      p.charge = 0;
      const shot = chargeToShot(18);
      const aimed = assistedAim(state, t, i, aimX, aimY);
      intent.kick = { dx: aimed.x, dy: aimed.y, power: shot.power, lift: Math.max(shot.lift, 145), kind: 'cross' };
    } else if (shoot && !prevShoot) {
      p.charging = true;
      p.charge = 0;
      p.shotStyle = state.config.premiumBallControl && switchHeld ? 'placed' : 'normal';
    }
  } else {
    // Contextual first-time finishes. Medium-height balls become volleys;
    // higher balls become headers, all on the same □ button.
    const aerialRange = (PLAYER_R + 15) ** 2;
    const nearAerial = shoot && !prevShoot
      && b.z > CONTROL_Z && b.z < CROSSBAR_H * 1.48
      && dist2(b.x, b.y, p.x, p.y) < aerialRange;
    const volleyBall = nearAerial && b.z < CONTROL_Z * 1.42;
    const headerBall = nearAerial && !volleyBall;
    if (nearAerial) {
      const aimed = assistedAim(state, t, i, aimX, aimY);
      const shot = chargeToShot(volleyBall ? 19 : 15);
      intent.kick = {
        dx: aimed.x,
        dy: aimed.y,
        power: volleyBall ? shot.power * 1.05 : shot.power,
        lift: volleyBall ? 80 : 35,
        kind: volleyBall ? 'volley' : 'header',
      };
    }

    // × without the ball is pressure / standing challenge. If no direction is
    // being held, the player closes the ball automatically, like classic console
    // football. At contact range the deterministic pressure routine can poke it
    // free or win it cleanly.
    if (passHeld && !nearAerial) {
      intent.press = true;
      if (Math.abs(dir.x) < 0.01 && Math.abs(dir.y) < 0.01) {
        const d = norm(b.x - p.x, b.y - p.y);
        intent.x = d.l ? d.x : 0;
        intent.y = d.l ? d.y : 0;
      }
    }

    // ○ without the ball is the sliding tackle. Legacy FIRE keeps Classic 2D
    // unchanged.
    const legacyFirePressed = (mask & BTN.FIRE) !== 0 && (prev & BTN.FIRE) === 0;
    if ((crossPressed || legacyFirePressed) && p.cooldown === 0 && p.slide === 0) {
      intent.slide = true;
    }
  }

  if (p.charging) {
    if (!owns) {
      p.charging = false;
      p.charge = 0;
    } else {
      p.charge++;
      if (!shoot || p.charge >= CHARGE_MAX) {
        const shot = chargeToShot(p.charge);

        if (sp?.kind === 'PENALTY' || sp?.kind === 'FREE KICK') {
          const goalY = targetGoalY(team);
          const tx = FIELD.cx + (sp.aimX || 0);
          const d = norm(tx - p.x, goalY - p.y);
          const extraLift = sp.aimLift || 0;
          const lift = sp.kind === 'PENALTY'
            ? clamp(shot.lift * 0.34 + extraLift, 0, 72)
            : clamp(shot.lift * 0.72 + extraLift, 18, 190);
          intent.kick = { dx: d.x, dy: d.y, power: shot.power, lift, kind: 'shot' };
        } else if (sp?.kind === 'CORNER') {
          const d = setPieceTargetDir(state, sp, p);
          intent.kick = { dx: d.x, dy: d.y, power: shot.power, lift: 205, kind: 'cross' };
        } else if (sp?.kind === 'GOAL KICK') {
          const d = setPieceTargetDir(state, sp, p);
          intent.kick = { dx: d.x, dy: d.y, power: shot.power, lift: 245, kind: 'cross' };
        } else {
          const aimed = assistedAim(state, t, i, aimX, aimY);
          const atGoal = shootingAtGoal(state, t, p, aimed);
          let kind = 'shot';
          let power = shot.power;
          let lift = atGoal ? Math.min(shot.lift, SHOT_LIFT_MAX) : shot.lift;
          let spin = 0;

          if (state.config.premiumBallControl && p.shotStyle === 'placed' && atGoal) {
            kind = 'placed-shot';
            power *= 0.88;
            lift = Math.min(lift, 118);
            spin = clamp(aimed.x, -1, 1) * 1.08;
          } else if (state.config.premiumBallControl && atGoal && p.charge <= 7) {
            kind = 'low-shot';
            power *= 0.94;
            lift = Math.min(lift, 34);
          } else if (state.config.premiumBallControl && atGoal && p.charge >= 23) {
            kind = 'power-shot';
            power *= 1.06;
            lift = Math.min(lift, 160);
          }

          intent.kick = {
            dx: aimed.x,
            dy: aimed.y,
            power,
            lift,
            spin,
            kind,
          };
          p.shotStyle = 'normal';
        }
      }
    }
  }

  return intent;
}

/**
 * Close enough to be shooting, and pointing between the posts? Then the kick is
 * kept down. The range check matters: the same aim from your own half is a long
 * ball forward, and flattening that would take away every clearance upfield.
 */
function shootingAtGoal(state, t, p, aim) {
  const goalY = targetGoalY(state.teams[t]);
  if (dist(p.x, p.y, FIELD.cx, goalY) > SHOT_FLAT_RANGE) return false;
  return aimedAtGoal(state, t, p, aim);
}

function startSkillDribble(state, teamIdx, playerIdx, skill) {
  if (!state.config.premiumBallControl) return;
  const b = state.ball;
  const p = state.teams[teamIdx].players[playerIdx];
  if (!b.owner || b.owner.team !== teamIdx || b.owner.idx !== playerIdx) return;
  if (p.skillCooldown > 0 || p.firstTouchTicks > 0) return;

  const d = norm(skill.dx, skill.dy);
  if (d.l < 0.2) return;

  const dri = ratingValue(state, p, 'dri', 72);
  p.skillTicks = state.config.premiumRatings ? clamp(Math.round(12 - (dri - 72) * 0.05), 10, 13) : 11;
  p.skillCooldown = state.config.premiumRatings ? clamp(Math.round(34 - (dri - 72) * 0.16), 29, 38) : 34;
  p.skillDirX = d.x;
  p.skillDirY = d.y;
  p.dirX = d.x;
  p.dirY = d.y;
  p.shielding = false;
  const skillBurst = state.config.premiumRatings
    ? 48 * clamp(1 + (dri - 72) * 0.0035, 0.94, 1.06)
    : 48;
  p.vx += d.x * skillBurst;
  p.vy += d.y * skillBurst;

  b.x = p.x + d.x * (DRIBBLE_DIST + 7);
  b.y = p.y + d.y * (DRIBBLE_DIST + 7);
  state.events.push({ type: 'dribble', kind: 'skill-touch', team: teamIdx, idx: playerIdx });
}

function tryStandingPressure(state, teamIdx, playerIdx) {
  const b = state.ball;
  const p = state.teams[teamIdx].players[playerIdx];
  if (p.cooldown > 0 || p.slide > 0 || b.z > CONTROL_Z) return false;
  if (dist2(b.x, b.y, p.x, p.y) > (PLAYER_R * 2.25) ** 2) return false;

  if (b.owner && b.owner.team !== teamIdx) {
    const oldTeam = b.owner.team;
    const old = state.teams[oldTeam].players[b.owner.idx];

    if (state.config.premiumSetPieces) {
      const vm = norm(old.vx, old.vy);
      const rel = norm(p.x - old.x, p.y - old.y);
      const fromBehind = vm.l > 22 && (vm.x * rel.x + vm.y * rel.y) < -0.48;
      const relativeSpeed = len(p.vx - old.vx, p.vy - old.vy);

      if (fromBehind && relativeSpeed > PLAYER_SPEED * 0.42) {
        const penalty = inOwnBox(state, teamIdx, old);
        const reckless = relativeSpeed > PLAYER_SPEED * 0.82;
        const foul = {
          type: reckless ? 'CHARGE' : 'PUSH',
          label: reckless ? 'CARGA TEMERÁRIA' : 'EMPURRÃO POR TRÁS',
          card: reckless ? 'yellow' : null,
          directRed: false,
          offenderTeam: teamIdx,
          offenderIdx: playerIdx,
        };

        old.down = Math.max(old.down, Math.floor(DOWN_TICKS * 0.28));
        old.vx *= 0.52;
        old.vy *= 0.52;
        p.cooldown = Math.max(p.cooldown, 8);

        recordFoulStat(state, teamIdx, playerIdx);
        const advantage = !penalty && canPlayAdvantage(state, oldTeam, old, false);
        state.events.push({
          type: 'foul',
          team: oldTeam,
          kind: penalty ? 'PENALTY' : 'FREE KICK',
          foulType: foul.type,
          label: foul.label,
          advantage,
          x: old.x,
          y: old.y,
        });

        if (advantage) {
          b.owner = null;
          b.x = old.x + old.dirX * (PLAYER_R + BALL_R + 2);
          b.y = old.y + old.dirY * (PLAYER_R + BALL_R + 2);
          b.vx = old.vx * 0.82;
          b.vy = old.vy * 0.82;
          b.vz = 0;
          beginAdvantage(state, oldTeam, old.x, old.y, foul);
          return false;
        }

        applyDiscipline(state, foul);
        awardFoul(state, oldTeam, old.x, old.y, penalty, foul);
        return true;
      }
    }

    if (state.config.premiumBallControl && old.shielding) {
      const rel = norm(p.x - old.x, p.y - old.y);
      const front = old.dirX * rel.x + old.dirY * rel.y;
      const shieldLimit = state.config.premiumRatings
        ? clamp(0.55 + ((old.rating?.fis ?? 72) - (p.rating?.def ?? 72)) * 0.005, 0.42, 0.68)
        : 0.55;
      if (front < shieldLimit) {
        p.cooldown = Math.max(p.cooldown, 6);
        old.vx *= 0.96;
        old.vy *= 0.96;
        state.events.push({ type: 'shield', team: oldTeam, idx: old.idx });
        return false;
      }
    }

    // Clean shoulder-to-shoulder pressure still wins the ball at contact range.
    old.holdTicks = 0;
    old.charging = false;
    old.charge = 0;
    registerPossession(state, teamIdx, b.x, b.y);
    b.owner = { team: teamIdx, idx: playerIdx };
    b.lastTouch = { team: teamIdx, idx: playerIdx };
    b.kicker = null;
    p.holdTicks = 0;
    recordTackleStat(state, teamIdx, playerIdx);
    state.events.push({ type: 'tackle', kind: 'standing', team: teamIdx, idx: playerIdx });
  }
  return false;
}

function startSlide(state, p) {
  const b = state.ball;
  state.events.push({ type: 'slide' });
  p.slide = SLIDE_TICKS;
  p.charging = false;
  p.charge = 0;
  const d = norm(p.dirX, p.dirY);
  p.vx = (d.l ? d.x : 0) * SLIDE_SPEED;
  p.vy = (d.l ? d.y : 1) * SLIDE_SPEED;
  if (b.owner) {
    const op = state.teams[b.owner.team].players[b.owner.idx];
    if (op === p) b.owner = null;
  }
}

function movePlayer(state, t, p, mv) {
  const b = state.ball;
  const owns = b.owner && b.owner.team === t && b.owner.idx === p.idx;

  if (p.slide > 0) {
    p.slide--;
    p.vx *= SLIDE_DECAY;
    p.vy *= SLIDE_DECAY;
    if (p.slide === 0) p.cooldown = SLIDE_COOLDOWN;
  } else {
    // A CPU team runs at a fraction of full speed on the easier settings. Human
    // teams (including your AI team-mates) always run at full speed.
    const handicap = state.teams[t].human ? 1 : state.teams[t].ai.speed;
    let speed = (p.role === 'gk'
      ? KEEPER_SPEED
      : owns ? PLAYER_SPEED_BALL : PLAYER_SPEED) * handicap;
    let accel = PLAYER_ACC;

    if (state.config.premiumRatings) {
      const ratedSpeed = speedRatingFactor(state, p);
      speed *= ratedSpeed;
      accel *= clamp(0.96 + ratedSpeed * 0.04, 0.96, 1.04);
    }

    if (state.config.premiumManagement && p.role !== 'gk') {
      const staminaRatio = clamp(p.stamina / 600, 0, 1);
      speed *= 0.84 + staminaRatio * 0.16;
      accel *= 0.78 + staminaRatio * 0.22;
    }

    if (state.config.premiumBallControl && owns && p.role !== 'gk') {
      if (p.firstTouchTicks > 0) {
        speed *= 0.78;
        accel *= 0.82;
      }
      if (p.shielding) {
        speed *= 0.60;
        accel *= 0.74;
      }
      if (p.skillTicks > 0) {
        speed *= 1.16;
        accel *= 1.58;
      }
    }

    const l = len(mv.x, mv.y);
    if (l > 0.02) {
      p.dirX = mv.x / l;
      p.dirY = mv.y / l;
      const tvx = mv.x * speed;
      const tvy = mv.y * speed;
      p.vx += clamp(tvx - p.vx, -accel * DT, accel * DT);
      p.vy += clamp(tvy - p.vy, -accel * DT, accel * DT);
    } else {
      p.vx *= PLAYER_DAMP;
      p.vy *= PLAYER_DAMP;
    }
  }
  integratePlayer(p);

  if (state.config.premiumManagement && !p.sentOff) {
    const team = state.teams[t];
    const paceBase = p.role === 'gk' ? KEEPER_SPEED : PLAYER_SPEED;
    const effort = clamp(len(p.vx, p.vy) / Math.max(1, paceBase), 0, 1.35);
    const tacticDrain = team.mentality > 0 ? 1.16 : team.mentality < 0 ? 0.90 : 1;
    const pressDrain = team.pressTicks > 0 ? 1.20 : 1;
    let drain = effort * 0.030 * tacticDrain * pressDrain * staminaRatingFactor(state, p);
    if (p.skillTicks > 0) drain += 0.018;
    if (p.slide > 0) drain += 0.020;
    const recovery = effort < 0.22 && !owns ? 0.012 : 0;
    p.stamina = clamp(p.stamina - drain + recovery, 0, 1000);
  }

  // Carrying it a good way up the pitch is worth a word - once per run, and only
  // for ground actually gained towards their goal, or dribbling in circles would
  // earn you a commentary line.
  if (owns && !p.ran && p.role !== 'gk') {
    const here = advanceOf(state.teams[t], p.y);
    // A run has to start somewhere. Normally that is the moment he takes the
    // ball; if he has it without that ever happening - a restart, a scenario in
    // a test - it starts here rather than silently never counting.
    if (p.runFrom === null || p.runFrom === undefined) p.runFrom = here;
    const gained = here - p.runFrom;
    if (gained > RUN_ADVANCE) {
      p.ran = true;
      state.events.push({ type: 'run', team: t, idx: p.idx });
    }
  }
}

function integratePlayer(p) {
  p.x = clamp(p.x + p.vx * DT, 8, WORLD_W - 8);
  p.y = clamp(p.y + p.vy * DT, 8, WORLD_H - 8);
}

/** Players cannot walk through each other. */
function separatePlayers(state) {
  const all = [];
  for (const team of state.teams) for (const p of team.players) if (!p.sentOff) all.push(p);

  const minD = PLAYER_R * 2;
  for (let a = 0; a < all.length; a++) {
    for (let c = a + 1; c < all.length; c++) {
      const p = all[a];
      const q = all[c];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (minD - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      p.x -= nx * push;
      p.y -= ny * push;
      q.x += nx * push;
      q.y += ny * push;
    }
  }
}

/** Slide tackles: poke the ball away and bring opponents down. */
function defendersGoalSide(state, defendingTeam, victim) {
  const team = state.teams[defendingTeam];
  const gy = ownGoalY(team);
  const victimGoalDist = Math.abs(victim.y - gy);
  let n = 0;
  for (let i = 1; i < team.players.length; i++) {
    const p = team.players[i];
    if (p.sentOff || p.down > 0) continue;
    if (Math.abs(p.y - gy) < victimGoalDist + 12
        && Math.abs(p.x - FIELD.cx) < PEN_W * 0.72) n++;
  }
  return n;
}

function classifyFoul(state, defendingTeam, tackler, victim) {
  const attackingTeam = 1 - defendingTeam;
  const b = state.ball;
  const speed = len(tackler.vx, tackler.vy);
  const vm = norm(victim.vx, victim.vy);
  const rel = norm(tackler.x - victim.x, tackler.y - victim.y);
  const fromBehind = vm.l > 18 && (vm.x * rel.x + vm.y * rel.y) < -0.28;
  const late = dist2(b.x, b.y, victim.x, victim.y) > 29 * 29;
  const advanced = advanceOf(state.teams[attackingTeam], victim.y);
  const central = Math.abs(victim.x - FIELD.cx) < PEN_W * 0.58;
  const dogso = advanced > 0.72 && central
    && defendersGoalSide(state, defendingTeam, victim) <= 1
    && fromBehind;

  if (dogso) {
    return { type: 'DOGSO', label: 'ÚLTIMO HOMEM', card: 'red', directRed: true, fromBehind, late, speed };
  }
  if (fromBehind && speed > SLIDE_SPEED * 0.58) {
    return { type: 'RECKLESS', label: 'CARRINHO POR TRÁS', card: 'yellow', directRed: false, fromBehind, late, speed };
  }
  if (late || speed > SLIDE_SPEED * 0.76) {
    return { type: 'LATE', label: 'CARRINHO ATRASADO', card: 'yellow', directRed: false, fromBehind, late, speed };
  }
  return { type: 'TRIP', label: 'FALTA', card: null, directRed: false, fromBehind, late, speed };
}

function canPlayAdvantage(state, attackingTeam, victim, penalty) {
  if (penalty) return false;
  const team = state.teams[attackingTeam];
  let nearest = Infinity;
  for (const p of team.players) {
    if (p.idx === victim.idx || p.sentOff || p.down > 0) continue;
    nearest = Math.min(nearest, dist(p.x, p.y, state.ball.x, state.ball.y));
  }
  const movingForward = team.attackDir * state.ball.vy > 42;
  const usefulZone = advanceOf(team, victim.y) > 0.34;
  return nearest < 92 || (movingForward && usefulZone);
}

function sendOffPlayer(state, teamIdx, idx) {
  const p = state.teams[teamIdx]?.players?.[idx];
  if (!p || p.sentOff) return;
  p.sentOff = true;
  p.x = 8;
  p.y = FIELD.cy;
  p.vx = 0;
  p.vy = 0;
  p.slide = 0;
  p.charging = false;
  p.charge = 0;
}

function applyDiscipline(state, foul) {
  if (!foul || !foul.card) return;
  const p = state.teams[foul.offenderTeam]?.players?.[foul.offenderIdx];
  if (!p || p.sentOff) return;

  if (foul.card === 'red' || foul.directRed) {
    sendOffPlayer(state, foul.offenderTeam, foul.offenderIdx);
    recordCardStat(state, foul.offenderTeam, foul.offenderIdx, 'red');
    state.events.push({
      type: 'card',
      color: 'red',
      team: foul.offenderTeam,
      idx: foul.offenderIdx,
      direct: true,
      reason: foul.label,
    });
    return;
  }

  p.yellowCards = (p.yellowCards || 0) + 1;
  const secondYellow = p.yellowCards >= 2;
  if (secondYellow) sendOffPlayer(state, foul.offenderTeam, foul.offenderIdx);
  recordCardStat(state, foul.offenderTeam, foul.offenderIdx, secondYellow ? 'red' : 'yellow');
  state.events.push({
    type: 'card',
    color: secondYellow ? 'red' : 'yellow',
    team: foul.offenderTeam,
    idx: foul.offenderIdx,
    secondYellow,
    reason: foul.label,
  });
}

function beginAdvantage(state, attackingTeam, x, y, foul) {
  const team = state.teams[attackingTeam];
  state.advantage = {
    team: attackingTeam,
    x,
    y,
    startAdvance: advanceOf(team, y),
    ticksLeft: 132,
    graceTicks: 12,
    possessionTicks: 0,
    offenderTeam: foul.offenderTeam,
    offenderIdx: foul.offenderIdx,
    foulType: foul.type,
    foulLabel: foul.label,
    card: foul.card,
    directRed: foul.directRed,
  };
  state.events.push({
    type: 'advantage',
    team: attackingTeam,
    foulType: foul.type,
    label: foul.label,
  });
}

function settleAdvantage(state, successful) {
  const adv = state.advantage;
  if (!adv) return;
  state.advantage = null;

  applyDiscipline(state, adv);
  state.events.push({
    type: 'advantage-end',
    team: adv.team,
    successful: !!successful,
    foulType: adv.foulType,
  });

  if (!successful) {
    awardFoul(state, adv.team, adv.x, adv.y, false, adv);
  }
}

function updateAdvantage(state) {
  const adv = state.advantage;
  if (!adv) return false;

  adv.ticksLeft--;
  if (adv.graceTicks > 0) adv.graceTicks--;

  const b = state.ball;
  if (b.owner) {
    if (b.owner.team === adv.team) {
      adv.possessionTicks++;
      const owner = state.teams[adv.team].players[b.owner.idx];
      const gained = advanceOf(state.teams[adv.team], owner.y) - adv.startAdvance;
      if (adv.possessionTicks >= 18 || gained > 0.075) {
        settleAdvantage(state, true);
        return false;
      }
    } else if (adv.graceTicks <= 0) {
      settleAdvantage(state, false);
      return true;
    }
  } else {
    adv.possessionTicks = Math.max(0, adv.possessionTicks - 1);
  }

  const out = b.x < FIELD.left - BALL_R || b.x > FIELD.right + BALL_R
    || b.y < FIELD.top - BALL_R || b.y > FIELD.bottom + BALL_R;
  if (out && adv.possessionTicks < 10) {
    settleAdvantage(state, false);
    return true;
  }

  if (adv.ticksLeft <= 0) {
    if (adv.possessionTicks >= 8) settleAdvantage(state, true);
    else {
      settleAdvantage(state, false);
      return true;
    }
  }
  return false;
}

function resolveTackles(state) {
  const b = state.ball;
  for (let t = 0; t < 2; t++) {
    for (const p of state.teams[t].players) {
      if (p.sentOff || p.slide <= 0) continue;

      const ownerBefore = b.owner ? { team: b.owner.team, idx: b.owner.idx } : null;
      let wonBall = false;

      const mayTouch = b.protectedFor === null || b.protectedFor === t;
      const ratedReach = state.config.premiumRatings
        ? SLIDE_REACH + clamp(((p.rating?.def ?? 72) - 72) * 0.08, -1.4, 1.4)
        : SLIDE_REACH;
      if (mayTouch && b.z < 20 && dist2(b.x, b.y, p.x, p.y) < (PLAYER_R + BALL_R + ratedReach) ** 2) {
        if (!b.owner || b.owner.team !== t) {
          const d = norm(p.vx, p.vy);
          const dx = d.l ? d.x : p.dirX;
          const dy = d.l ? d.y : p.dirY;
          b.vx = dx * 230;
          b.vy = dy * 230;
          b.vz = 40;
          b.owner = null;
          b.lastTouch = { team: t, idx: p.idx };
          b.kicker = null;
          p.cooldown = Math.max(p.cooldown, 10);
          wonBall = true;
          if (ownerBefore && ownerBefore.team !== t) recordTackleStat(state, t, p.idx);
        }
      }

      const opp = state.teams[1 - t];
      for (const o of opp.players) {
        if (o.sentOff || o.down > 0) continue;
        if (dist2(o.x, o.y, p.x, p.y) >= (PLAYER_R * 2 + 3) ** 2) continue;

        if (state.config.premiumSetPieces && !wonBall) {
          const victimHadBall = ownerBefore && ownerBefore.team === opp.index && ownerBefore.idx === o.idx;
          const nearBall = dist2(b.x, b.y, o.x, o.y) < 42 * 42;
          const offBall = !victimHadBall && !nearBall;
          const penalty = inOwnBox(state, t, o);
          const foul = offBall
            ? { type: 'OFFBALL', label: 'ENTRADA SEM BOLA', card: 'yellow', directRed: false }
            : classifyFoul(state, t, p, o);
          foul.offenderTeam = t;
          foul.offenderIdx = p.idx;

          p.slide = 0;
          p.cooldown = Math.max(p.cooldown, SLIDE_COOLDOWN);
          o.down = Math.max(o.down, Math.floor(DOWN_TICKS * (penalty ? 0.72 : offBall ? 0.52 : 0.42)));
          o.vx = p.vx * 0.28;
          o.vy = p.vy * 0.28;

          recordFoulStat(state, t, p.idx);
          const advantage = !penalty && canPlayAdvantage(state, opp.index, o, false);
          state.events.push({
            type: 'foul',
            team: opp.index,
            kind: penalty ? 'PENALTY' : 'FREE KICK',
            foulType: foul.type,
            label: foul.label,
            advantage,
            x: o.x,
            y: o.y,
          });

          if (advantage) {
            if (b.owner && b.owner.team === opp.index && b.owner.idx === o.idx) {
              b.owner = null;
              b.x = o.x + o.dirX * (PLAYER_R + BALL_R + 2);
              b.y = o.y + o.dirY * (PLAYER_R + BALL_R + 2);
              b.vx = o.vx * 0.75;
              b.vy = o.vy * 0.75;
              b.vz = 0;
            }
            beginAdvantage(state, opp.index, o.x, o.y, foul);
            return false;
          }

          applyDiscipline(state, foul);
          awardFoul(state, opp.index, o.x, o.y, penalty, foul);
          return true;
        }

        o.down = DOWN_TICKS;
        o.vx = p.vx * 0.5;
        o.vy = p.vy * 0.5;
        if (b.owner && b.owner.team === opp.index && b.owner.idx === o.idx) b.owner = null;
      }
    }
  }
  return false;
}

function awardFoul(state, attackingTeam, x, y, penalty, foul = null) {
  const kind = penalty ? 'PENALTY' : 'FREE KICK';
  if (penalty) {
    const team = state.teams[attackingTeam];
    const goalY = targetGoalY(team);
    const spotY = goalY - team.attackDir * 92;
    setRestart(state, FIELD.cx, spotY, attackingTeam, 'PENALTY', 9);
  } else {
    setRestart(
      state,
      clamp(x, FIELD.left + 26, FIELD.right - 26),
      clamp(y, FIELD.top + 34, FIELD.bottom - 34),
      attackingTeam,
      'FREE KICK'
    );
  }
  if (state.setPiece && foul) {
    state.setPiece.foulType = foul.foulType || foul.type || null;
    state.setPiece.foulLabel = foul.foulLabel || foul.label || null;
  }
  state.events.push({
    type: 'foul-awarded',
    team: attackingTeam,
    kind,
    foulType: foul?.foulType || foul?.type || null,
    label: foul?.foulLabel || foul?.label || null,
    x,
    y,
  });
}

// --------------------------------------------------------------------------
// Ball
// --------------------------------------------------------------------------

function updateBall(state, inputs) {
  const b = state.ball;

  if (state.phase === 'goal') {
    b.vx *= 0.88;
    b.vy *= 0.88;
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.z = Math.max(0, b.z + b.vz * DT);
    b.vz -= GRAVITY * DT;
    if (b.z <= 0) {
      b.z = 0;
      b.vz = 0;
    }
    return;
  }

  if (b.owner) {
    const p = state.teams[b.owner.team].players[b.owner.idx];
    let carryDist = DRIBBLE_DIST;
    let carryLerp = DRIBBLE_LERP;
    let carryX = p.dirX;
    let carryY = p.dirY;

    if (state.config.premiumBallControl && p.role !== 'gk') {
      if (p.firstTouchTicks > 0) {
        carryDist += Math.min(8, 2 + p.firstTouchSpeed * 0.014);
        carryLerp = Math.max(0.22, DRIBBLE_LERP * 0.72);
      }
      if (p.shielding) {
        carryDist *= 0.54;
        carryLerp = Math.min(0.88, DRIBBLE_LERP + 0.18);
      }
      if (p.skillTicks > 0) {
        carryDist += 7;
        carryLerp = Math.min(0.90, DRIBBLE_LERP + 0.20);
        carryX = p.skillDirX;
        carryY = p.skillDirY;
      }
    }

    const tx = p.x + carryX * carryDist;
    const ty = p.y + carryY * carryDist;
    b.x += (tx - b.x) * carryLerp;
    b.y += (ty - b.y) * carryLerp;
    b.vx = p.vx;
    b.vy = p.vy;
    b.z = 0;
    b.vz = 0;
    b.spin = 0;
    return;
  }

  applyAftertouch(state, inputs);

  const airborne = b.z > 0.5;
  const damp = airborne ? AIR_DRAG : GROUND_FRICTION;
  b.vx *= damp;
  b.vy *= damp;

  // Rolling resistance on the ground: a flat amount off the speed, which is
  // what stops a slow ball rather than letting it trickle across the pitch.
  if (!airborne) {
    const speed = len(b.vx, b.vy);
    if (speed > 0) {
      const slowed = Math.max(0, speed - ROLL_DRAG * DT);
      b.vx *= slowed / speed;
      b.vy *= slowed / speed;
    }
  }

  // Spin: slowly rotates the velocity vector, which is what bends the ball.
  if (Math.abs(b.spin) > 1e-4) {
    const c = Math.cos(b.spin * DT);
    const s = Math.sin(b.spin * DT);
    const vx = b.vx * c - b.vy * s;
    const vy = b.vx * s + b.vy * c;
    b.vx = vx;
    b.vy = vy;
    b.spin *= SPIN_DECAY;
  }

  b.x += b.vx * DT;
  b.y += b.vy * DT;
  b.z += b.vz * DT;
  b.vz -= GRAVITY * DT;

  if (b.z <= 0) {
    b.z = 0;
    if (b.vz < -40) {
      b.vz = -b.vz * BOUNCE_Z;
      b.vx *= BOUNCE_XY;
      b.vy *= BOUNCE_XY;
    } else {
      b.vz = 0;
    }
  }

  if (Math.abs(b.vx) < 2) b.vx = 0;
  if (Math.abs(b.vy) < 2) b.vy = 0;
}

/**
 * Aftertouch: after a kick, whoever took it can still steer the ball.
 * Sideways relative to the ball = curve, along the ball = lift or dip.
 */
function applyAftertouch(state, inputs) {
  const b = state.ball;
  if (!b.kicker) return;
  if (b.kicker.ticks <= 0) {
    b.kicker = null;
    return;
  }
  b.kicker.ticks--;

  const team = state.teams[b.kicker.team];
  if (!team.human) return;

  const dir = maskToDir(inputs[b.kicker.team] | 0);
  if (!dir.x && !dir.y) return;

  const bd = norm(b.vx, b.vy);
  if (bd.l < 20) return;

  const cross = bd.x * dir.y - bd.y * dir.x; // sideways component
  const dot = bd.x * dir.x + bd.y * dir.y; // component along the ball

  b.vx += -bd.y * cross * AT_SIDE * DT;
  b.vy += bd.x * cross * AT_SIDE * DT;
  b.spin += cross * 1.4 * DT;

  if (b.z > 0.5) {
    b.vz += dot * AT_LIFT * DT;
  } else if (dot > 0) {
    b.vz += dot * AT_LIFT * 0.35 * DT;
  }
}

// --------------------------------------------------------------------------
// Rules of the game
// --------------------------------------------------------------------------

function checkGoal(state) {
  const b = state.ball;
  if (Math.abs(b.x - FIELD.cx) > GOAL_W / 2 || b.z > CROSSBAR_H) return false;

  let scoringTeam = -1;
  if (b.y < FIELD.top - 2) {
    scoringTeam = state.teams[0].attackDir < 0 ? 0 : 1;
    b.y = Math.max(b.y, FIELD.top - GOAL_DEPTH + 8);
  } else if (b.y > FIELD.bottom + 2) {
    scoringTeam = state.teams[0].attackDir > 0 ? 0 : 1;
    b.y = Math.min(b.y, FIELD.bottom + GOAL_DEPTH - 8);
  }
  if (scoringTeam < 0) return false;

  if (state.config.premiumStats) {
    const scorerIdx = state.matchStats.lastShot?.team === scoringTeam
      ? state.matchStats.lastShot.idx
      : (b.lastTouch?.team === scoringTeam ? b.lastTouch.idx : -1);
    markShotOnTarget(state, scoringTeam);
    if (scorerIdx >= 0) {
      const scorer = state.teams[scoringTeam].players[scorerIdx];
      if (scorer) scorer.matchStats.goals++;
      const assist = state.matchStats.assistCandidate[scoringTeam];
      if (assist && assist.receiver === scorerIdx && assist.passer !== scorerIdx) {
        const passer = state.teams[scoringTeam].players[assist.passer];
        if (passer) passer.matchStats.assists++;
      }
    }
    state.matchStats.pendingPass = null;
    state.matchStats.lastShot = null;
    state.matchStats.assistCandidate[scoringTeam] = null;
    state.matchStats.assistCandidate[1 - scoringTeam] = null;
  }

  state.score[scoringTeam]++;
  state.lastGoalTeam = scoringTeam;
  state.phase = 'goal';
  state.phaseTimer = GOAL_CELEBRATION_TICKS;
  state.message = 'GOAL!';
  state.events.push({
    type: 'goal',
    team: scoringTeam,
    x: b.x,
    y: b.y,
    z: b.z,
    speed: len(b.vx, b.vy),
  });
  b.owner = null;
  b.kicker = null;
  b.vx *= 0.3;
  b.vy *= 0.3;
  return true;
}

/** Free kick to the other side, taken where the offside player got involved. */
function whistleOffside(state, teamIdx, player) {
  if (state.config.premiumStats) state.matchStats.teams[teamIdx].offsides++;
  const x = clamp(player.x, FIELD.left + 20, FIELD.right - 20);
  const y = clamp(player.y, FIELD.top + 20, FIELD.bottom - 20);
  clearOffside(state);
  setRestart(state, x, y, 1 - teamIdx, 'OFFSIDE');
}

function checkOutOfPlay(state) {
  const b = state.ball;
  const lastTeam = b.lastTouch ? b.lastTouch.team : state.kickoffTeam;

  // Touchline -> throw-in
  if (b.x < FIELD.left - BALL_R || b.x > FIELD.right + BALL_R) {
    const x = b.x < FIELD.cx ? FIELD.left + 4 : FIELD.right - 4;
    const y = clamp(b.y, FIELD.top + 24, FIELD.bottom - 24);
    setRestart(state, x, y, 1 - lastTeam, 'THROW-IN');
    return;
  }

  if (b.y >= FIELD.top - BALL_R && b.y <= FIELD.bottom + BALL_R) return;

  // Goal line -> corner or goal kick
  const topEnd = b.y < FIELD.cy;
  const goalY = topEnd ? FIELD.top : FIELD.bottom;
  const defender = state.teams[0].attackDir < 0
    ? (topEnd ? 1 : 0) // team 0 attacks the top, so team 1 defends the top
    : (topEnd ? 0 : 1);

  if (lastTeam === defender) {
    // Corner for the attacking side
    if (state.config.premiumStats) state.matchStats.teams[1 - defender].corners++;
    const x = b.x < FIELD.cx ? FIELD.left + 8 : FIELD.right - 8;
    const y = topEnd ? FIELD.top + 8 : FIELD.bottom - 8;
    setRestart(state, x, y, 1 - defender, 'CORNER');
  } else {
    // Goal kick for the defending side
    const x = FIELD.cx + (b.x < FIELD.cx ? -58 : 58);
    const y = topEnd ? FIELD.top + SIX_D : FIELD.bottom - SIX_D;
    setRestart(state, x, y, defender, 'GOAL KICK', 0); // the keeper takes it
  }
}

function arrangePremiumSetPiece(state, sp) {
  const team = state.teams[sp.team];
  const opp = state.teams[1 - sp.team];
  const goalY = targetGoalY(team);
  const ownY = ownGoalY(team);
  const inside = (d) => goalY - team.attackDir * d;
  const outsideOwn = (d) => ownY + team.attackDir * d;
  const setP = (p, x, y) => {
    if (!p || p.sentOff) return;
    p.x = clamp(x, FIELD.left + 14, FIELD.right - 14);
    p.y = clamp(y, FIELD.top + 14, FIELD.bottom - 14);
    p.vx = 0;
    p.vy = 0;
  };

  if (sp.kind === 'CORNER') {
    const nearPost = Math.sign(sp.x - FIELD.cx) || 1;
    setP(opp.players[0], FIELD.cx + nearPost * 24, inside(15));
    setP(team.players[9], FIELD.cx, inside(58));
    setP(team.players[8], FIELD.cx - 62, inside(72));
    setP(team.players[10], FIELD.cx + 62, inside(70));
    setP(team.players[7], FIELD.cx, inside(112));
    setP(team.players[6], FIELD.cx - 92, inside(122));
    setP(opp.players[2], FIELD.cx - 32, inside(52));
    setP(opp.players[3], FIELD.cx + 32, inside(52));
    setP(opp.players[1], FIELD.cx - 78, inside(68));
    setP(opp.players[4], FIELD.cx + 78, inside(68));
    setP(opp.players[5], FIELD.cx, inside(92));
  } else if (sp.kind === 'THROW-IN') {
    const sx = sp.x < FIELD.cx ? 1 : -1;
    setP(team.players[7], sp.x + sx * 58, sp.y - team.attackDir * 46);
    setP(team.players[8], sp.x + sx * 84, sp.y + team.attackDir * 58);
    setP(team.players[9], sp.x + sx * 118, sp.y + team.attackDir * 18);
  } else if (sp.kind === 'FREE KICK' || sp.kind === 'OFFSIDE') {
    const ballSide = Math.sign(sp.x - FIELD.cx) || 1;
    setP(opp.players[0], FIELD.cx - ballSide * 18, inside(14));
    const toGoal = norm(FIELD.cx - sp.x, goalY - sp.y);
    const wallX = sp.x + toGoal.x * 66;
    const wallY = sp.y + toGoal.y * 66;
    const sideX = -toGoal.y;
    const sideY = toGoal.x;
    [1,2,3,4].forEach((idx,n)=>{
      const off=(n-1.5)*22;
      setP(opp.players[idx], wallX + sideX*off, wallY + sideY*off);
    });
    setP(team.players[9], FIELD.cx, inside(62));
    setP(team.players[8], FIELD.cx - 78, inside(76));
    setP(team.players[10], FIELD.cx + 78, inside(76));
  } else if (sp.kind === 'PENALTY') {
    const defending = opp;
    setP(defending.players[0], FIELD.cx, goalY - team.attackDir * 14);
    for (let i=1;i<11;i++) {
      const lane=((i%5)-2)*48;
      setP(defending.players[i], FIELD.cx + lane, inside(190 + (i%2)*20));
    }
    for (let i=1;i<11;i++) {
      if (i===sp.taker) continue;
      const lane=((i%5)-2)*44;
      setP(team.players[i], FIELD.cx + lane, inside(205 + (i%2)*18));
    }
  } else if (sp.kind === 'GOAL KICK') {
    setP(team.players[1], FIELD.cx - 150, outsideOwn(116));
    setP(team.players[4], FIELD.cx + 150, outsideOwn(116));
    setP(team.players[2], FIELD.cx - 62, outsideOwn(88));
    setP(team.players[3], FIELD.cx + 62, outsideOwn(88));
    setP(team.players[6], FIELD.cx, outsideOwn(178));
  }

  // Keep the designated taker on the correct side of the stationary ball.
  const taker = team.players[sp.taker];
  if (taker) {
    const back = norm(FIELD.cx - sp.x, ownY - sp.y);
    const d = sp.kind === 'THROW-IN' ? 16 : 13;
    taker.x = sp.x + back.x * d;
    taker.y = sp.y + back.y * d;
    taker.vx = 0;
    taker.vy = 0;
    taker.dirX = -back.x;
    taker.dirY = -back.y;
  }
}

function setRestart(state, x, y, teamIdx, message, forcedTaker = null) {
  if (state.config.premiumStats) {
    state.matchStats.pendingPass = null;
    state.matchStats.lastShot = null;
  }
  if (state.config.premiumManagement) flushPendingSubstitutions(state);
  state.delivery = null;
  state.possessionTeam = teamIdx;
  if (state.config.premiumAI) {
    for (const team of state.teams) {
      team.counterTicks = 0;
      team.pressTicks = 0;
      team.turnoverX = x;
      team.turnoverY = y;
    }
  }
  const b = state.ball;
  b.x = x;
  b.y = y;
  b.z = 0;
  b.vx = 0;
  b.vy = 0;
  b.vz = 0;
  b.spin = 0;
  b.owner = null;
  b.kicker = null;

  clearOffside(state);
  protectFor(state, teamIdx, 'untilTouch', PROTECT_TICKS);

  state.phase = 'restart';
  if (!state.config.premiumSetPieces) state.setPiece = null;
  state.phaseTimer = RESTART_TICKS;
  state.restartTeam = teamIdx;
  state.message = message;
  state.events.push({ type: 'whistle', kind: 'restart' });
  // Which restart, and whose. The message on screen carries the same
  // information, but reading text back is no way to build an interface.
  state.events.push({ type: 'restart', kind: message, team: teamIdx });

  // Nearest outfield player takes it - unless the restart names someone, which
  // a goal kick does: that is the keeper's to take.
  const team = state.teams[teamIdx];
  let takerIdx = forcedTaker === null ? 1 : forcedTaker;
  if (team.players[takerIdx]?.sentOff) forcedTaker = null;
  let bestD = Infinity;
  for (let i = 1; forcedTaker === null && i < team.players.length; i++) {
    const p = team.players[i];
    if (p.sentOff || p.down > 0) continue;
    const d = dist2(x, y, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      takerIdx = i;
    }
  }
  const taker = team.players[takerIdx];
  const gy = team.attackDir < 0 ? FIELD.bottom : FIELD.top;
  const back = norm(FIELD.cx - x, gy - y);
  taker.x = x + back.x * 12;
  taker.y = y + back.y * 12;
  taker.vx = 0;
  taker.vy = 0;
  taker.dirX = -back.x;
  taker.dirY = -back.y;
  taker.cooldown = 0;
  taker.slide = 0;
  taker.down = 0;
  team.controlled = takerIdx;

  if (state.config.premiumSetPieces) {
    state.setPiece = {
      kind: message,
      team: teamIdx,
      taker: takerIdx,
      x,
      y,
      targetIdx: -1,
      aimX: 0,
      aimLift: 0,
      keeperDive: 0,
    };
    arrangePremiumSetPiece(state, state.setPiece);
    ensureSetPieceTarget(state, state.setPiece);
    protectFor(state, teamIdx, 'untilPlayed', PROTECT_TICKS * 2);
  }

  // Push opponents back to a fair distance.
  const opp = state.teams[1 - teamIdx];
  for (const o of opp.players) {
    const d = dist(o.x, o.y, x, y);
    if (d < 46 && d > 0.01) {
      const n = norm(o.x - x, o.y - y);
      o.x = x + n.x * 46;
      o.y = y + n.y * 46;
      o.vx = 0;
      o.vy = 0;
    }
  }
}
