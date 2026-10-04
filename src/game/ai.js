import {
  AI_LEVELS, DT, FIELD, FIELD_H, GOAL_W, PEN_D, PEN_W,
} from '../constants.js';
import { clamp, dist, dist2, norm, randRange } from '../util.js';
import { speedForDistance } from '../constants.js';
import { advanceOf, ownGoalY, posFor, targetGoalY } from './state.js';
import { holdTheLine } from './offside.js';
import { RETREAT } from './formations.js';

// The AI runs INSIDE the simulation and only reads state + state.rng. That keeps
// everything deterministic, which is what makes the lockstep netcode work.

/**
 * Difficulty settings for one team. A human team's AI team-mates always play at
 * full strength: making them worse would make the game harder for the human, not
 * easier. Only a CPU team is held back.
 */
function skillOf(state, teamIdx) {
  const team = state.teams[teamIdx];
  return team.human ? AI_LEVELS.hard : team.ai;
}

// Tried and rejected: keeping every non-chasing defender at least 58px from the
// ball. They all ended up standing at exactly that distance, in a ring around
// the carrier, which crowded him more than before and dropped scoring to 0.2
// goals a match. Spacing the lines apart does the same job without the ring.

function predictBall(state, t = 0.18) {
  const b = state.ball;
  return { x: b.x + b.vx * t, y: b.y + b.vy * t };
}

function nearestOpponent(state, teamIdx, x, y) {
  const opp = state.teams[1 - teamIdx];
  let best = null;
  let bestD = Infinity;
  for (const p of opp.players) {
    if (p.sentOff || p.down > 0) continue;
    const d = dist2(x, y, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return { player: best, d: Math.sqrt(bestD) };
}

function premiumAI(state) {
  return state.config?.premiumAI === true;
}

function ballSide(state) {
  const dx = state.ball.x - FIELD.cx;
  if (Math.abs(dx) < 42) return 0;
  return dx < 0 ? -1 : 1;
}

function secondMarkerIndex(state, teamIdx, chaser) {
  const team = state.teams[teamIdx];
  const b = state.ball;
  const gy = ownGoalY(team);
  let best = -1;
  let bestScore = Infinity;
  for (let i = 1; i < team.players.length; i++) {
    if (i === chaser) continue;
    const p = team.players[i];
    if (p.sentOff || p.down > 0 || p.role === 'fw') continue;
    // Prefer defenders/midfielders already goal-side and close enough to provide
    // a second layer rather than sending another player straight at the ball.
    const goalSide = Math.abs(p.y - gy) <= Math.abs(b.y - gy) + 70 ? 0 : 90;
    const rolePenalty = p.role === 'dm' ? 0 : (p.role === 'df' ? 6 : 18);
    const controlledPenalty = team.human && i === team.controlled ? 70 : 0;
    const score = dist(p.x, p.y, b.x, b.y) + goalSide + rolePenalty + controlledPenalty;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function laneClear(state, teamIdx, from, to, width = 22) {
  const opp = state.teams[1 - teamIdx];
  for (let s = 0.22; s <= 0.88; s += 0.16) {
    const px = from.x + (to.x - from.x) * s;
    const py = from.y + (to.y - from.y) * s;
    for (const o of opp.players) {
      if (o.sentOff || o.down > 0) continue;
      if (dist2(px, py, o.x, o.y) < width * width) return false;
    }
  }
  return true;
}

function premiumSupportRunSpot(state, teamIdx, p) {
  const team = state.teams[teamIdx];
  const owner = state.ball.owner && state.ball.owner.team === teamIdx
    ? team.players[state.ball.owner.idx]
    : null;
  if (!owner) return null;

  const current = advanceOf(team, p.y);
  const ownerAdv = advanceOf(team, owner.y);
  let yFrac = Math.max(current + 0.13, ownerAdv + 0.07);
  if (p.role === 'fw') yFrac = Math.max(yFrac, current + 0.17);

  const denom = FIELD.right - FIELD.cx;
  let xRel = clamp((p.x - FIELD.cx) / denom, -0.82, 0.82);
  const sep = Math.sign(p.x - owner.x) || -ballSide(state) || 1;
  xRel = clamp(xRel + sep * 0.11, -0.78, 0.78);
  yFrac = holdTheLine(state, teamIdx, clamp(yFrac, 0.18, 0.92));
  return posFor(team, xRel, yFrac);
}

function oneTwoReturnTarget(state, teamIdx, owner) {
  if (!premiumAI(state)) return null;
  const team = state.teams[teamIdx];
  const idx = team.oneTwoPasser;
  if (team.oneTwoTicks <= 0 || idx < 1 || idx === owner.idx) return null;
  const runner = team.players[idx];
  if (!runner || runner.down > 0 || runner.supportRunTicks <= 0) return null;

  const d = dist(owner.x, owner.y, runner.x, runner.y);
  if (d < 48 || d > 285) return null;
  const forward = (advanceOf(team, runner.y) - advanceOf(team, owner.y)) * FIELD_H;
  if (forward < -35) return null;

  const tx = runner.x + runner.vx * 0.18;
  const ty = runner.y + runner.vy * 0.18;
  if (!laneClear(state, teamIdx, owner, { x: tx, y: ty }, 20)) return null;
  return { player: runner, x: tx, y: ty, d };
}

function findCrossTarget(state, teamIdx, from) {
  const team = state.teams[teamIdx];
  let best = null;
  let bestScore = -Infinity;
  for (let i = 1; i < team.players.length; i++) {
    const m = team.players[i];
    if (m.idx === from.idx || m.sentOff || m.down > 0) continue;
    const adv = advanceOf(team, m.y);
    if (adv < 0.68) continue;
    const central = 1 - Math.min(1, Math.abs(m.x - FIELD.cx) / (FIELD_W * 0.38));
    const forward = (adv - advanceOf(team, from.y)) * FIELD_H;
    const marker = nearestOpponent(state, teamIdx, m.x, m.y).d;
    const roleBonus = m.role === 'fw' ? 72 : (m.role === 'am' ? 36 : 10);
    const score = central * 95 + Math.max(0, forward) * 0.28 + marker * 0.55 + roleBonus;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

function counterPressIndices(state, teamIdx) {
  const team = state.teams[teamIdx];
  const carrier = state.ball.owner && state.ball.owner.team !== teamIdx
    ? state.teams[state.ball.owner.team].players[state.ball.owner.idx]
    : state.ball;
  const candidates = [];

  for (let i = 1; i < team.players.length; i++) {
    const p = team.players[i];
    if (p.sentOff || p.down > 0) continue;
    const rolePenalty = p.role === 'df' ? 62 : p.role === 'dm' ? 8 : 0;
    const centralDefenderPenalty = p.role === 'df' && Math.abs(team.formation[i].x) < 0.4 ? 38 : 0;
    const score = dist(p.x, p.y, carrier.x, carrier.y) + rolePenalty + centralDefenderPenalty;
    candidates.push({ i, score });
  }

  candidates.sort((a, b) => a.score - b.score || a.i - b.i);
  const count = team.mentality > 0 ? 4 : team.mentality < 0 ? 2 : 3;
  return candidates.slice(0, count).map(v => v.i);
}

function counterPressSpot(state, teamIdx, i, rank) {
  const team = state.teams[teamIdx];
  const carrier = state.ball.owner && state.ball.owner.team !== teamIdx
    ? state.teams[state.ball.owner.team].players[state.ball.owner.idx]
    : state.ball;
  const gy = ownGoalY(team);
  const towardGoal = norm(FIELD.cx - carrier.x, gy - carrier.y);
  const sideX = -towardGoal.y;
  const sideY = towardGoal.x;

  if (rank === 0) {
    return { x: carrier.x, y: carrier.y };
  }

  // The second and third pressers close the nearest exits instead of piling
  // directly onto the carrier.
  const side = rank === 1 ? -1 : 1;
  const gap = rank === 1 ? 34 : 46;
  return {
    x: clamp(carrier.x + towardGoal.x * gap + sideX * side * 26, FIELD.left + 18, FIELD.right - 18),
    y: clamp(carrier.y + towardGoal.y * gap + sideY * side * 26, FIELD.top + 18, FIELD.bottom - 18),
  };
}

function defensiveLineAdvance(state, teamIdx) {
  const team = state.teams[teamIdx];
  const carrier = state.ball.owner && state.ball.owner.team !== teamIdx
    ? state.teams[state.ball.owner.team].players[state.ball.owner.idx]
    : state.ball;
  const ballAdv = advanceOf(team, carrier.y);

  // When the ball is far from our goal, squeeze up together. When it threatens
  // the box, retreat goal-side as one line rather than every defender choosing
  // a different depth.
  let line = 0.13 + ballAdv * 0.40;
  line = clamp(line, 0.07, 0.45);
  line = Math.min(line, Math.max(0.06, ballAdv - 0.045));

  // Immediately after losing it, do not spring the whole back four forward.
  if (team.pressTicks > 0) line = Math.min(line, 0.34);
  line += (team.mentality || 0) * 0.045;
  return clamp(line, 0.06, 0.49);
}

function transitionCounterSpot(state, teamIdx, i, home) {
  const team = state.teams[teamIdx];
  const p = team.players[i];
  const f = team.formation[i];
  const owner = state.ball.owner && state.ball.owner.team === teamIdx
    ? team.players[state.ball.owner.idx]
    : null;
  if (!owner) return home;

  const ownerAdv = advanceOf(team, owner.y);
  const currentAdv = advanceOf(team, p.y);
  let xRel = f.x;
  let yFrac = currentAdv;

  if (p.role === 'fw') {
    const wide = Math.abs(f.x) > 0.34;
    yFrac = Math.max(currentAdv + (wide ? 0.18 : 0.22), ownerAdv + (wide ? 0.14 : 0.18));
    if (wide) {
      // Wide forwards sprint through separate channels so the carrier gets two
      // obvious vertical options rather than three runners on the same lane.
      xRel = Math.sign(f.x) * (ownerAdv > 0.60 ? 0.58 : 0.76);
    } else {
      const carrierSide = Math.sign(owner.x - FIELD.cx) || 1;
      xRel = -carrierSide * 0.10;
    }
  } else if (p.role === 'am' || p.role === 'mf') {
    yFrac = Math.max(currentAdv, ownerAdv + (p.role === 'am' ? 0.08 : 0.02));
    xRel = clamp(f.x * 0.72 - Math.sign(owner.x - FIELD.cx) * 0.08, -0.62, 0.62);
  } else if (p.role === 'dm') {
    // One midfielder trails the counter as protection and a recycling option.
    yFrac = Math.max(currentAdv, ownerAdv - 0.10);
    xRel = clamp(f.x * 0.45, -0.35, 0.35);
  } else if (p.role === 'df') {
    // Full-backs do not both join a fresh counter; the rest-defense stays intact.
    const wide = Math.abs(f.x) > 0.45;
    const sameSide = Math.sign(f.x) === Math.sign(owner.x - FIELD.cx);
    if (wide && sameSide && ownerAdv < 0.52) {
      yFrac = Math.max(currentAdv, ownerAdv - 0.08);
      xRel = Math.sign(f.x) * 0.66;
    } else {
      yFrac = Math.min(currentAdv, Math.max(0.24, ownerAdv - 0.24));
      xRel = f.x * 0.62;
    }
  }

  yFrac = holdTheLine(state, teamIdx, clamp(yFrac, 0.12, 0.94));
  return posFor(team, clamp(xRel, -0.90, 0.90), yFrac);
}

function counterPassTarget(state, teamIdx, from) {
  const team = state.teams[teamIdx];
  let best = null;
  let bestScore = -Infinity;

  for (let i = 1; i < team.players.length; i++) {
    const m = team.players[i];
    if (m.idx === from.idx || m.sentOff || m.down > 0) continue;
    const forward = (advanceOf(team, m.y) - advanceOf(team, from.y)) * FIELD_H;
    if (forward < 42) continue;
    const d = dist(from.x, from.y, m.x, m.y);
    if (d < 50 || d > 330) continue;
    const lead = { x: m.x + m.vx * 0.20, y: m.y + m.vy * 0.20 };
    if (!laneClear(state, teamIdx, from, lead, 19)) continue;
    const space = nearestOpponent(state, teamIdx, lead.x, lead.y).d;
    const roleBonus = m.role === 'fw' ? 72 : m.role === 'am' ? 35 : 8;
    const score = forward * 1.45 + space * 0.65 + roleBonus - d * 0.16;
    if (score > bestScore) {
      bestScore = score;
      best = { player: m, x: lead.x, y: lead.y, d, forward };
    }
  }
  return best;
}

function premiumAttackingSpot(state, teamIdx, i, home) {
  const team = state.teams[teamIdx];
  const p = team.players[i];
  const f = team.formation[i];
  const b = state.ball;
  const owner = b.owner && b.owner.team === teamIdx ? team.players[b.owner.idx] : null;
  if (!owner) return home;

  if (team.counterTicks > 0 && owner.idx !== i) {
    return transitionCounterSpot(state, teamIdx, i, home);
  }

  const ownerAdv = advanceOf(team, owner.y);
  const side = ballSide(state);
  let xRel = f.x;
  let yFrac = advanceOf(team, home.y);

  const wideCrossZone = ownerAdv > 0.58 && Math.abs(owner.x - FIELD.cx) > FIELD_W * 0.26;
  if (wideCrossZone && owner.idx !== i) {
    const ownerSide = Math.sign(owner.x - FIELD.cx) || side || 1;
    if (p.role === 'fw') {
      const fSide = Math.sign(f.x);
      if (Math.abs(f.x) < 0.22) {
        xRel = ownerSide * 0.12;
        yFrac = Math.max(yFrac, 0.86);
      } else if (fSide !== ownerSide) {
        xRel = -ownerSide * 0.30;
        yFrac = Math.max(yFrac, 0.84);
      } else {
        xRel = ownerSide * 0.22;
        yFrac = Math.max(yFrac, 0.80);
      }
      yFrac = holdTheLine(state, teamIdx, clamp(yFrac, 0.18, 0.93));
      return posFor(team, xRel, yFrac);
    }
    if ((p.role === 'mf' || p.role === 'am') && Math.abs(f.x) < 0.18) {
      xRel = -ownerSide * 0.08;
      yFrac = Math.max(yFrac, 0.74);
      yFrac = holdTheLine(state, teamIdx, clamp(yFrac, 0.18, 0.90));
      return posFor(team, xRel, yFrac);
    }
  }

  if (p.role === 'fw') {
    // Centre-forward attacks the gap beyond the carrier; wide forwards stretch
    // the back line and bend their runs slightly inside near the final third.
    const wide = Math.abs(f.x) > 0.35;
    yFrac = Math.max(yFrac, ownerAdv + (wide ? 0.10 : 0.16));
    if (wide) {
      const sameSide = Math.sign(f.x) === side || side === 0;
      xRel = sameSide ? Math.sign(f.x) * 0.74 : Math.sign(f.x) * 0.48;
      if (ownerAdv > 0.68) xRel *= 0.72;
    } else {
      xRel = clamp((owner.x - FIELD.cx) / (FIELD.right - FIELD.cx) * 0.18, -0.18, 0.18);
    }
  } else if (p.role === 'am' || p.role === 'mf') {
    // Midfielders form passing triangles instead of all running onto the same
    // horizontal line as the ball carrier.
    const lane = f.x === 0 ? -side * 0.18 : f.x;
    xRel = clamp(lane + (side ? -side * 0.06 : 0), -0.72, 0.72);
    yFrac = Math.max(yFrac, ownerAdv - (p.role === 'am' ? 0.01 : 0.08));
    yFrac = Math.min(yFrac, ownerAdv + (p.role === 'am' ? 0.10 : 0.04));
  } else if (p.role === 'dm') {
    // Holding midfielder stays behind the ball as the reset option.
    xRel = clamp(f.x * 0.6 - side * 0.10, -0.45, 0.45);
    yFrac = Math.min(yFrac, Math.max(0.28, ownerAdv - 0.13));
  } else if (p.role === 'df' && Math.abs(f.x) > 0.45) {
    // Only the full-back on the ball side overlaps. The opposite full-back
    // tucks in to leave a back three protecting counters.
    const sameSide = side === 0 || Math.sign(f.x) === side;
    if (sameSide && ownerAdv > 0.34) {
      xRel = Math.sign(f.x) * 0.80;
      yFrac = Math.max(yFrac, Math.min(ownerAdv + 0.03, 0.70));
    } else {
      xRel = Math.sign(f.x) * 0.48;
      yFrac = Math.min(yFrac, 0.34);
    }
  } else if (p.role === 'df') {
    // Centre-backs stay connected behind the attack.
    xRel = f.x * 0.78;
    yFrac = Math.min(yFrac, Math.max(0.22, ownerAdv - 0.28));
  }

  const mentality = team.mentality || 0;
  const rolePush = p.role === 'fw' ? 0.055 : (p.role === 'am' || p.role === 'mf') ? 0.038 : p.role === 'dm' ? 0.018 : 0.012;
  yFrac += mentality * rolePush;
  if (mentality < 0 && p.role === 'df') xRel *= 0.88;
  yFrac = holdTheLine(state, teamIdx, clamp(yFrac, 0.14, 0.93));
  return posFor(team, clamp(xRel, -0.92, 0.92), yFrac);
}

function premiumDefendingSpot(state, teamIdx, i, home, chaser, secondMarker) {
  const team = state.teams[teamIdx];
  const p = team.players[i];
  const b = state.ball;
  const gy = ownGoalY(team);
  const side = ballSide(state);
  let tx = home.x;
  let ty = home.y;

  if (i === secondMarker) {
    // Second marker closes to a shadowing distance: close enough to double-team,
    // far enough not to stack on top of the first presser.
    const carrier = b.owner && b.owner.team !== teamIdx
      ? state.teams[b.owner.team].players[b.owner.idx]
      : b;
    const toGoal = norm(FIELD.cx - carrier.x, gy - carrier.y);
    const danger = advanceOf(team, carrier.y) < 0.36;
    const gap = danger ? 34 : 44;
    tx = carrier.x + toGoal.x * gap;
    ty = carrier.y + toGoal.y * gap;
  } else if (p.role === 'df') {
    // Back four share one depth: this is what makes stepping up, dropping and
    // catching runners offside look like a line rather than four independent bots.
    const f = team.formation[i];
    const central = Math.abs(f.x) < 0.4;
    const lineAdv = defensiveLineAdvance(state, teamIdx);
    const linePos = posFor(team, f.x, lineAdv);
    ty = linePos.y;

    const ballRel = (b.x - FIELD.cx) / (FIELD.right - FIELD.cx);
    const ballSideSign = Math.sign(ballRel);
    let xRel = f.x * (central ? 0.72 : 0.78);
    if (!central && ballSideSign && Math.sign(f.x) !== ballSideSign) {
      // Weak-side full-back becomes a third centre-back.
      xRel = Math.sign(f.x) * 0.42;
    } else {
      xRel += clamp(ballRel * (central ? 0.10 : 0.17), -0.16, 0.16);
    }
    tx = posFor(team, clamp(xRel, -0.82, 0.82), lineAdv).x;
    if (central) tx = clamp(tx, FIELD.cx - 112, FIELD.cx + 112);
  } else if (p.role === 'dm' || p.role === 'mf') {
    // Screen the central lane and shift toward the ball side while preserving
    // staggered midfield depth.
    tx += (b.x - tx) * (p.role === 'dm' ? 0.28 : 0.20);
    if (side && Math.sign(team.formation[i].x || side) !== side) {
      tx += side * 24;
    }
    ty += (gy - ty) * (p.role === 'dm' ? 0.04 : 0.02);
  } else if (p.role === 'fw') {
    // Forwards stay available for the counter instead of all collapsing deep.
    tx += (b.x - tx) * 0.08;
  }

  const mentality = team.mentality || 0;
  if (p.role !== 'gk') {
    const currentAdv = advanceOf(team, ty);
    const adjusted = clamp(currentAdv + mentality * (p.role === 'df' ? 0.025 : 0.04), 0.06, 0.90);
    ty = posFor(team, 0, adjusted).y;
  }

  return {
    x: clamp(tx, FIELD.left + 18, FIELD.right - 18),
    y: clamp(ty, FIELD.top + 18, FIELD.bottom - 18),
  };
}

/** Which outfield player of this team chases the ball? */
export function chaserIndex(state, teamIdx) {
  const team = state.teams[teamIdx];
  const spot = predictBall(state, 0.18 - skillOf(state, teamIdx).reactTicks * DT);
  let best = -1;
  let bestD = Infinity;
  for (let i = 1; i < team.players.length; i++) {
    const p = team.players[i];
    if (p.sentOff || p.down > 0) continue;
    const d = dist2(spot.x, spot.y, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best < 0 ? 1 : best;
}

/** Formation position, shifted along with the ball. */
function homeSpot(state, teamIdx, i) {
  const team = state.teams[teamIdx];
  const f = team.formation[i];
  const b = state.ball;
  const adv = advanceOf(team, b.y);
  // The line moves with the ball, but retreats less eagerly than it advances,
  // and never drops onto its own goal line. Symmetric shifting with a floor of
  // 0.04 put the back four inside their own six yard box whenever they were
  // pinned back, which is exactly as useless as it sounds.
  //
  // Do not push the floor much higher: 0.15 keeps matches at under two goals,
  // 0.24 lets attackers run straight through for eight a match, and 0.28 for
  // nineteen. A high line only works with defenders who know how to hold it.
  // How far each line tracks back when the other side has the ball. Defenders
  // drop all the way, midfielders less, forwards barely: a whole team retreating
  // into its own box left an attacker no room to pass into and nothing to run
  // at. Coming forward is unaffected - everyone joins in with that.
  const retreat = RETREAT[f.role] ?? 1;
  const shift = (adv - 0.5) * (adv < 0.5 ? 0.32 * retreat : 0.55);
  let yFrac = clamp(f.y + shift, 0.15, 0.95);
  // Stay onside while we have the ball, otherwise the forwards camp behind the
  // defence and the game becomes one long whistle.
  if (b.owner && b.owner.team === teamIdx) yFrac = holdTheLine(state, teamIdx, yFrac);
  const xRel = clamp(f.x * 0.85 + ((b.x - FIELD.cx) / (FIELD.right - FIELD.cx)) * 0.28, -1, 1);
  return posFor(team, xRel, yFrac);
}

function keeperMove(state, teamIdx) {
  const team = state.teams[teamIdx];
  const k = team.players[0];
  const b = state.ball;
  const gy = ownGoalY(team);
  const inBox = Math.abs(b.y - gy) < PEN_D && Math.abs(b.x - FIELD.cx) < PEN_W / 2;
  const setPieceDelivery = state.delivery
    && state.delivery.team !== teamIdx
    && (state.delivery.kind === 'CORNER' || state.delivery.kind === 'FREE KICK');
  const deliveryZone = setPieceDelivery
    && Math.abs(b.y - gy) < PEN_D + 72
    && Math.abs(b.x - FIELD.cx) < PEN_W * 0.72;

  // The keeper plays the same at every difficulty. Holding him back measurably
  // made his team stronger rather than weaker, so he is no place for a handicap.
  let tx;
  let ty;
  if (deliveryZone && b.z > 5) {
    // Read the flight of corners/free kicks and attack the expected meeting point.
    const lead = 0.16;
    const px = clamp(b.x + b.vx * lead, FIELD.cx - PEN_W * 0.43, FIELD.cx + PEN_W * 0.43);
    const py = clamp(b.y + b.vy * lead, gy - 4, gy + team.attackDir * (PEN_D * 0.72));
    const canClaim = dist(k.x, k.y, px, py) < 126;
    if (canClaim) {
      tx = px;
      ty = py;
    } else {
      tx = FIELD.cx + clamp(px - FIELD.cx, -GOAL_W / 2 - 18, GOAL_W / 2 + 18) * 0.76;
      ty = gy + team.attackDir * 18;
    }
  } else if (inBox && dist(k.x, k.y, b.x, b.y) < 90) {
    // Come out for the ball.
    tx = b.x;
    ty = b.y;
  } else {
    // Stay on the line, tracking the ball but hugging the middle.
    tx = FIELD.cx + clamp(b.x - FIELD.cx, -GOAL_W / 2 - 14, GOAL_W / 2 + 14) * 0.85;
    const depth = inBox ? 26 : 14;
    ty = gy + team.attackDir * depth;
  }
  const d = norm(tx - k.x, ty - k.y);
  return d.l < 3 ? { x: 0, y: 0 } : { x: d.x, y: d.y };
}

/** Best team-mate to pass to, or null. */
function findPassTarget(state, teamIdx, from) {
  const team = state.teams[teamIdx];
  const opp = state.teams[1 - teamIdx];
  let best = null;
  let bestScore = -Infinity;

  for (let i = 1; i < team.players.length; i++) {
    const m = team.players[i];
    if (m.idx === from.idx || m.sentOff || m.down > 0) continue;
    const d = dist(from.x, from.y, m.x, m.y);
    if (d < 55 || d > 340) continue;

    const forward = (advanceOf(team, m.y) - advanceOf(team, from.y)) * FIELD_H;
    if (forward < -60) continue; // do not play it far backwards
    const marker = nearestOpponent(state, teamIdx, m.x, m.y).d;

    // Is the passing lane clear?
    let blocked = false;
    for (let s = 0.25; s <= 0.85; s += 0.2) {
      const px = from.x + (m.x - from.x) * s;
      const py = from.y + (m.y - from.y) * s;
      for (const o of opp.players) {
        if (o.down > 0) continue;
        if (dist2(px, py, o.x, o.y) < 22 * 22) {
          blocked = true;
          break;
        }
      }
      if (blocked) break;
    }
    if (blocked) continue;

    let score = forward * 1.1 + marker * 1.6 - d * 0.25;
    if (premiumAI(state)) {
      const runningForward = team.attackDir * m.vy;
      const separation = nearestOpponent(state, teamIdx, m.x + m.vx * 0.16, m.y + m.vy * 0.16).d;
      score += clamp(runningForward, -120, 180) * 0.18;
      score += separation * 0.42;
      if (m.role === 'fw' && forward > 20) score += 34;
      if (team.counterTicks > 0) {
        score += Math.max(0, forward) * 0.62;
        if (m.role === 'fw') score += 42;
      }
      if ((team.mentality || 0) > 0) score += Math.max(0, forward) * 0.24;
      if ((team.mentality || 0) < 0 && forward < -10) score += 34;
    }
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/**
 * Decision for the CPU player who has the ball.
 * Returns a running direction plus an optional kick. The kick is NOT executed
 * here: sim.js carries out every kick only after all 22 players have decided
 * their intent from the same snapshot.
 */
function ownerAction(state, teamIdx, i) {
  const team = state.teams[teamIdx];
  const p = team.players[i];
  const skill = skillOf(state, teamIdx);
  const goalY = targetGoalY(team);
  const goalX = FIELD.cx;
  const dGoal = dist(p.x, p.y, goalX, goalY);
  const pressureInfo = nearestOpponent(state, teamIdx, p.x, p.y);
  const pressure = pressureInfo.d;

  const sp = state.config?.premiumSetPieces && state.setPiece
    && state.setPiece.team === teamIdx && state.setPiece.taker === i
    ? state.setPiece : null;

  if (sp?.kind === 'KICKOFF') {
    const mate = team.players[sp.mate ?? 7] || findPassTarget(state, teamIdx, p);
    if (mate) {
      const d = norm(mate.x - p.x, mate.y - p.y);
      return { x: 0, y: 0, kick: { dx: d.x, dy: d.y, power: speedForDistance(420), lift: 0, kind: 'pass' } };
    }
  }

  if (sp?.kind === 'THROW-IN') {
    const mate = findPassTarget(state, teamIdx, p) || team.players[7];
    const tx = mate ? mate.x + mate.vx * 0.10 : FIELD.cx;
    const ty = mate ? mate.y + mate.vy * 0.10 : p.y + team.attackDir * 90;
    const d = norm(tx - p.x, ty - p.y);
    const dd = mate ? dist(p.x, p.y, mate.x, mate.y) : 120;
    return {
      x: 0, y: 0,
      kick: { dx: d.x, dy: d.y, power: speedForDistance(clamp(dd * 2.2, 420, 690)), lift: dd > 150 ? 155 : 105, kind: 'throw-in' },
    };
  }

  if (sp?.kind === 'CORNER') {
    const mate = findCrossTarget(state, teamIdx, p) || team.players[9];
    const d = norm(mate.x - p.x, mate.y - p.y);
    return { x: 0, y: 0, kick: { dx: d.x, dy: d.y, power: speedForDistance(760), lift: 235, kind: 'cross' } };
  }

  if (sp?.kind === 'PENALTY') {
    const side = ((state.seed + state.tick + teamIdx) & 1) ? 1 : -1;
    const aimX = FIELD.cx + side * (GOAL_W * 0.27);
    const d = norm(aimX - p.x, goalY - p.y);
    return { x: 0, y: 0, kick: { dx: d.x, dy: d.y, power: speedForDistance(845), lift: 12, kind: 'shot' } };
  }

  if (sp?.kind === 'FREE KICK' || sp?.kind === 'OFFSIDE') {
    if (dGoal < 335 && sp.kind === 'FREE KICK') {
      const side = p.x < FIELD.cx ? 1 : -1;
      const aimX = FIELD.cx + side * (GOAL_W * 0.22);
      const d = norm(aimX - p.x, goalY - p.y);
      return { x: 0, y: 0, kick: { dx: d.x, dy: d.y, power: speedForDistance(820), lift: 145, kind: 'shot' } };
    }
    const mate = findPassTarget(state, teamIdx, p) || team.players[6];
    const d = norm(mate.x - p.x, mate.y - p.y);
    const dd = dist(p.x, p.y, mate.x, mate.y);
    return { x: 0, y: 0, kick: { dx: d.x, dy: d.y, power: speedForDistance(clamp(dd * 2.25, 420, 760)), lift: dd > 210 ? 145 : 0, kind: 'pass' } };
  }

  if (sp?.kind === 'GOAL KICK') {
    const candidates = [team.players[2], team.players[3], team.players[1], team.players[4]].filter(Boolean);
    let mate = candidates[0];
    let best = -Infinity;
    for (const m of candidates) {
      const space = nearestOpponent(state, teamIdx, m.x, m.y).d;
      if (space > best) { best = space; mate = m; }
    }
    const d = norm(mate.x - p.x, mate.y - p.y);
    return { x: 0, y: 0, kick: { dx: d.x, dy: d.y, power: speedForDistance(650), lift: 95, kind: 'pass' } };
  }

  // Keeper: hold on to it briefly, then hoof it upfield.
  if (p.role === 'gk') {
    if (p.holdTicks > 34) {
      const mate = findPassTarget(state, teamIdx, p);
      const tx = mate ? mate.x : FIELD.cx + randRange(state, -180, 180);
      const ty = mate ? mate.y : p.y + team.attackDir * FIELD_H * 0.4;
      const d = norm(tx - p.x, ty - p.y);
      return { x: 0, y: 0, kick: { dx: d.x, dy: d.y, power: speedForDistance(804), lift: 300, kind: 'clearance' } };
    }
    const away = norm(0, team.attackDir);
    return { x: away.x * 0.4, y: away.y };
  }

  // Settle the ball and dribble first: without this brake the AI knocks the ball
  // straight back out again and the game turns into midfield ping-pong.
  const settled = p.holdTicks >= skill.settleTicks;

  if (premiumAI(state) && team.counterTicks > 0 && p.holdTicks >= 3 && p.holdTicks <= 20) {
    const target = counterPassTarget(state, teamIdx, p);
    if (target && (pressure < skill.pressure * 1.45 || target.forward > 95)) {
      const d = norm(target.x - p.x, target.y - p.y);
      return {
        x: d.x,
        y: d.y,
        kick: {
          dx: d.x,
          dy: d.y,
          power: speedForDistance(clamp(target.d * 2.30, 430, 830)),
          lift: target.d > 230 ? 70 : 0,
          kind: target.d > 185 ? 'through' : 'pass',
        },
      };
    }
  }

  // Shooting (allowed sooner than passing: a first-time shot is fine).
  const mentality = team.mentality || 0;
  const shootRange = skill.shootRange * (mentality > 0 ? 1.10 : mentality < 0 ? 0.92 : 1);
  if (p.holdTicks >= 5 && dGoal < shootRange && Math.abs(p.x - goalX) < 210) {
    let aimX = goalX + randRange(state, -GOAL_W / 2 + 12, GOAL_W / 2 - 12);
    // The draw below is skipped entirely when there is no error to add, so HARD
    // consumes exactly the same random numbers as it always did.
    if (skill.aimError) aimX += randRange(state, -skill.aimError, skill.aimError);
    const d = norm(aimX - p.x, goalY - p.y);
    const lift = dGoal > 170 ? randRange(state, 0, 90) : 0;
    return { x: d.x, y: d.y, kick: { dx: d.x, dy: d.y, power: speedForDistance(873), lift, kind: 'shot' } };
  }

  if (premiumAI(state) && settled) {
    // Winger/full-back in the final third: cross when team-mates have attacked
    // the area. This gives the box runs above an actual payoff.
    const adv = advanceOf(team, p.y);
    const wide = Math.abs(p.x - FIELD.cx) > FIELD_W * 0.27;
    if (adv > 0.62 && wide) {
      const target = findCrossTarget(state, teamIdx, p);
      if (target) {
        const leadX = target.x + target.vx * 0.12;
        const leadY = target.y + target.vy * 0.12;
        const d = norm(leadX - p.x, leadY - p.y);
        const dd = dist(p.x, p.y, target.x, target.y);
        return {
          x: d.x,
          y: d.y,
          kick: {
            dx: d.x,
            dy: d.y,
            power: speedForDistance(clamp(dd * 2.35, 540, 900)),
            lift: 220,
            kind: 'cross',
          },
        };
      }
    }

    // Give-and-go: if the previous passer has continued his run and a lane has
    // opened, return it before the defence can reset.
    const oneTwo = oneTwoReturnTarget(state, teamIdx, p);
    if (oneTwo && (pressure < skill.pressure * 1.35 || advanceOf(team, oneTwo.player.y) > advanceOf(team, p.y) + 0.06)) {
      const d = norm(oneTwo.x - p.x, oneTwo.y - p.y);
      const power = speedForDistance(clamp(oneTwo.d * 2.25, 390, 810));
      return {
        x: d.x,
        y: d.y,
        kick: { dx: d.x, dy: d.y, power, lift: 0, kind: 'pass', oneTwoReturn: true },
      };
    }
  }

  if (state.config?.premiumBallControl && settled && pressureInfo.player
      && pressure > 15 && pressure < 36
      && p.skillCooldown === 0 && p.firstTouchTicks === 0
      && ((state.tick + i * 17 + teamIdx * 11) % 4) === 0) {
    const defender = pressureInfo.player;
    const toward = norm(defender.x - p.x, defender.y - p.y);
    const forward = team.attackDir;
    const left = norm(-toward.y, toward.x + forward * 0.52);
    const right = norm(toward.y, -toward.x + forward * 0.52);
    const scoreSide = (d) => {
      const tx = clamp(p.x + d.x * 46, FIELD.left + 18, FIELD.right - 18);
      const ty = clamp(p.y + d.y * 46, FIELD.top + 18, FIELD.bottom - 18);
      const space = nearestOpponent(state, teamIdx, tx, ty).d;
      const progress = (advanceOf(team, ty) - advanceOf(team, p.y)) * FIELD_H;
      return space + progress * 0.38;
    };
    const d = scoreSide(left) >= scoreSide(right) ? left : right;
    return { x: d.x, y: d.y, skill: { dx: d.x, dy: d.y } };
  }

  // Under pressure: pass.
  if (settled && pressure < skill.pressure) {
    const mate = findPassTarget(state, teamIdx, p);
    if (mate) {
      let aimX = mate.x;
      let aimY = mate.y;
      if (premiumAI(state)) {
        const lead = mate.role === 'fw' ? 0.22 : 0.14;
        aimX += mate.vx * lead;
        aimY += mate.vy * lead;
      }
      if (skill.passError) {
        aimX += randRange(state, -skill.passError, skill.passError);
        aimY += randRange(state, -skill.passError, skill.passError);
      }
      const d = norm(aimX - p.x, aimY - p.y);
      const dd = dist(p.x, p.y, mate.x, mate.y);
      // Deliberately overhit: a pass played to the exact distance arrives dead.
      const power = speedForDistance(clamp(dd * 2.4, 390, 830));
      return { x: d.x, y: d.y, kick: { dx: d.x, dy: d.y, power, lift: dd > 220 ? 180 : 0, kind: 'pass' } };
    }
  }

  if (state.config?.premiumBallControl && settled && pressureInfo.player && pressure < 24) {
    const away = norm(p.x - pressureInfo.player.x, p.y - pressureInfo.player.y + team.attackDir * 18);
    return { x: away.x * 0.58, y: away.y * 0.58, shield: true };
  }

  // Otherwise: dribble towards goal, going wide if the middle is crowded.
  let tx = goalX;
  let ty = goalY;
  if (dGoal > 300) {
    tx = goalX + clamp(p.x - goalX, -240, 240) * 0.85;
  }
  const opp = nearestOpponent(state, teamIdx, p.x, p.y);
  if (opp.player && opp.d < 70) {
    // Sidestep.
    const away = norm(p.x - opp.player.x, p.y - opp.player.y);
    tx += away.x * 120;
    ty += away.y * 40;
  }
  tx = clamp(tx, FIELD.left + 24, FIELD.right - 24);
  const d = norm(tx - p.x, ty - p.y);
  return { x: d.x, y: d.y };
}

/**
 * Works out the running direction for one AI player, and may return a kick
 * (when this player has the ball and the team is CPU-controlled).
 */
export function aiMove(state, teamIdx, i, opts = {}) {
  const team = state.teams[teamIdx];
  const p = team.players[i];
  const b = state.ball;

  if (p.sentOff || p.down > 0 || p.slide > 0) return { x: 0, y: 0 };

  const owner = b.owner;
  const weHaveBall = owner && owner.team === teamIdx;
  const iHaveBall = weHaveBall && owner.idx === i;

  if (iHaveBall) {
    if (opts.allowKicks) return ownerAction(state, teamIdx, i);
    // Human team: this player is being controlled by the human, so do nothing.
    return { x: 0, y: 0 };
  }

  // During a console-style restart everybody except the taker holds the staged
  // shape until the ball is actually played. This keeps walls, penalty lines,
  // corner runs and goal-kick outlets from dissolving before the kick.
  if (state.config?.premiumSetPieces && state.setPiece) {
    return { x: 0, y: 0 };
  }

  if (p.role === 'gk') return keeperMove(state, teamIdx);

  if (premiumAI(state) && weHaveBall && p.supportRunTicks > 0) {
    const spot = premiumSupportRunSpot(state, teamIdx, p);
    if (spot) {
      const d = norm(spot.x - p.x, spot.y - p.y);
      if (d.l > 5) return { x: d.x, y: d.y };
    }
  }

  // Hands off a restart or a keeper holding the ball: drop back into shape
  // rather than stand around pressing something you are not allowed to take.
  const barred = b.protectedFor !== null && b.protectedFor !== teamIdx;

  // Immediately after losing the ball, the nearest three counter-press while
  // the rest protect the centre. After the short window, normal defending resumes.
  const pressingNow = premiumAI(state) && !weHaveBall && !barred && team.pressTicks > 0;
  if (pressingNow) {
    const pressers = counterPressIndices(state, teamIdx);
    const rank = pressers.indexOf(i);
    if (rank >= 0) {
      const spot = counterPressSpot(state, teamIdx, i, rank);
      const d = norm(spot.x - p.x, spot.y - p.y);
      return { x: d.x, y: d.y };
    }
  }

  // Without the ball: the nearest player chases, the rest hold their shape.
  if (!pressingNow && !weHaveBall && !barred && i === chaserIndex(state, teamIdx)) {
    const lead = clamp(dist(p.x, p.y, b.x, b.y) / 400, 0.05, 0.35);
    const spot = predictBall(state, lead - skillOf(state, teamIdx).reactTicks * DT);
    const d = norm(spot.x - p.x, spot.y - p.y);
    return { x: d.x, y: d.y };
  }

  const home = homeSpot(state, teamIdx, i);
  let tx = home.x;
  let ty = home.y;

  if (premiumAI(state)) {
    if (weHaveBall) {
      const tactical = premiumAttackingSpot(state, teamIdx, i, home);
      tx = tactical.x;
      ty = tactical.y;
    } else {
      const chaser = chaserIndex(state, teamIdx);
      const secondMarker = team.pressTicks > 0 ? -1 : secondMarkerIndex(state, teamIdx, chaser);
      const tactical = premiumDefendingSpot(state, teamIdx, i, home, chaser, secondMarker);
      tx = tactical.x;
      ty = tactical.y;
      if (barred) {
        const gy = ownGoalY(team);
        ty += (gy - ty) * 0.08;
      }
    }
  } else if (weHaveBall) {
    // Classic behaviour used by FC Mukeka 2D.
    ty += team.attackDir * 26;
  } else {
    const gy = ownGoalY(team);
    tx += (b.x - tx) * 0.18;
    ty += (gy - ty) * (barred ? 0.12 : 0.06);
  }

  const d = norm(tx - p.x, ty - p.y);
  if (d.l < 6) return { x: 0, y: 0 };
  const gain = clamp(d.l / 40, 0.35, 1);
  return { x: d.x * gain, y: d.y * gain };
}

/**
 * How often your own AI team-mates dive in. They are deliberately left at the
 * frequency every side used before the opponent's was cut: a team-mate who wins
 * the ball back is help, and slowing him down would make the game harder for
 * you, not easier.
 */
const TEAMMATE_SLIDE = 0.7;

/** May this AI player go in for a slide tackle? Only near the ball carrier. */
export function aiWantsSlide(state, teamIdx, i) {
  const b = state.ball;
  if (!b.owner || b.owner.team === teamIdx) return false;
  const team = state.teams[teamIdx];
  const p = team.players[i];
  if (p.sentOff || p.cooldown > 0 || p.slide > 0 || p.down > 0 || p.role === 'gk') return false;
  const carrier = state.teams[b.owner.team].players[b.owner.idx];
  const d = dist(p.x, p.y, carrier.x, carrier.y);
  // A slide has to be timed rather than thrown out hopefully from range. At 34
  // a defender could commit from so far back that running at him was pointless:
  // he had a free swing at your ankles before you were ever past him.
  if (d > 28 || d < 12) return false;
  // More aggressive in our own half.
  const own = advanceOf(team, p.y) < 0.4;
  const chance = team.human ? TEAMMATE_SLIDE : skillOf(state, teamIdx).slideChance;
  return randRange(state, 0, 1) < (own ? 0.05 : 0.02) * chance;
}
