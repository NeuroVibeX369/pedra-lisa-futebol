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
    if (p.down > 0) continue;
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

function coverIndex(state, teamIdx, chaser) {
  const team = state.teams[teamIdx];
  const b = state.ball;
  const gy = ownGoalY(team);
  let best = -1;
  let bestScore = Infinity;
  for (let i = 1; i < team.players.length; i++) {
    if (i === chaser) continue;
    const p = team.players[i];
    if (p.down > 0 || p.role === 'fw') continue;
    // Prefer defenders/midfielders already goal-side and close enough to provide
    // a second layer rather than sending another player straight at the ball.
    const goalSide = Math.abs(p.y - gy) <= Math.abs(b.y - gy) + 70 ? 0 : 90;
    const rolePenalty = p.role === 'df' ? 0 : (p.role === 'dm' ? 12 : 28);
    const score = dist(p.x, p.y, b.x, b.y) + goalSide + rolePenalty;
    if (score < bestScore) {
      bestScore = score;
      best = i;
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

  const ownerAdv = advanceOf(team, owner.y);
  const side = ballSide(state);
  let xRel = f.x;
  let yFrac = advanceOf(team, home.y);

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

  yFrac = holdTheLine(state, teamIdx, clamp(yFrac, 0.14, 0.93));
  return posFor(team, clamp(xRel, -0.92, 0.92), yFrac);
}

function premiumDefendingSpot(state, teamIdx, i, home, chaser, cover) {
  const team = state.teams[teamIdx];
  const p = team.players[i];
  const b = state.ball;
  const gy = ownGoalY(team);
  const side = ballSide(state);
  let tx = home.x;
  let ty = home.y;

  if (i === cover) {
    // Second defender blocks the route to goal instead of duplicating the press.
    const toGoal = norm(FIELD.cx - b.x, gy - b.y);
    tx = b.x + toGoal.x * 58;
    ty = b.y + toGoal.y * 58;
  } else if (p.role === 'df') {
    // Back four slide as a unit, with centre-backs narrower than full-backs.
    const f = team.formation[i];
    const central = Math.abs(f.x) < 0.4;
    tx += (b.x - FIELD.cx) * (central ? 0.14 : 0.22);
    if (central) tx = clamp(tx, FIELD.cx - 118, FIELD.cx + 118);
    // Don't let the whole line collapse onto the keeper.
    const minAdvance = 0.16;
    const curAdv = advanceOf(team, ty);
    if (curAdv < minAdvance) ty = posFor(team, f.x, minAdvance).y;
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
    if (p.down > 0) continue;
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

  // The keeper plays the same at every difficulty. Holding him back measurably
  // made his team stronger rather than weaker, so he is no place for a handicap.
  let tx;
  let ty;
  if (inBox && dist(k.x, k.y, b.x, b.y) < 90) {
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
    if (m.idx === from.idx || m.down > 0) continue;
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
  const pressure = nearestOpponent(state, teamIdx, p.x, p.y).d;

  // Keeper: hold on to it briefly, then hoof it upfield.
  if (p.role === 'gk') {
    if (p.holdTicks > 34) {
      const mate = findPassTarget(state, teamIdx, p);
      const tx = mate ? mate.x : FIELD.cx + randRange(state, -180, 180);
      const ty = mate ? mate.y : p.y + team.attackDir * FIELD_H * 0.4;
      const d = norm(tx - p.x, ty - p.y);
      return { x: 0, y: 0, kick: { dx: d.x, dy: d.y, power: speedForDistance(804), lift: 300 } };
    }
    const away = norm(0, team.attackDir);
    return { x: away.x * 0.4, y: away.y };
  }

  // Settle the ball and dribble first: without this brake the AI knocks the ball
  // straight back out again and the game turns into midfield ping-pong.
  const settled = p.holdTicks >= skill.settleTicks;

  // Shooting (allowed sooner than passing: a first-time shot is fine).
  if (p.holdTicks >= 5 && dGoal < skill.shootRange && Math.abs(p.x - goalX) < 210) {
    let aimX = goalX + randRange(state, -GOAL_W / 2 + 12, GOAL_W / 2 - 12);
    // The draw below is skipped entirely when there is no error to add, so HARD
    // consumes exactly the same random numbers as it always did.
    if (skill.aimError) aimX += randRange(state, -skill.aimError, skill.aimError);
    const d = norm(aimX - p.x, goalY - p.y);
    const lift = dGoal > 170 ? randRange(state, 0, 90) : 0;
    return { x: d.x, y: d.y, kick: { dx: d.x, dy: d.y, power: speedForDistance(873), lift } };
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
      return { x: d.x, y: d.y, kick: { dx: d.x, dy: d.y, power, lift: dd > 220 ? 180 : 0 } };
    }
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

  if (p.down > 0 || p.slide > 0) return { x: 0, y: 0 };

  const owner = b.owner;
  const weHaveBall = owner && owner.team === teamIdx;
  const iHaveBall = weHaveBall && owner.idx === i;

  if (iHaveBall) {
    if (opts.allowKicks) return ownerAction(state, teamIdx, i);
    // Human team: this player is being controlled by the human, so do nothing.
    return { x: 0, y: 0 };
  }

  if (p.role === 'gk') return keeperMove(state, teamIdx);

  // Hands off a restart or a keeper holding the ball: drop back into shape
  // rather than stand around pressing something you are not allowed to take.
  const barred = b.protectedFor !== null && b.protectedFor !== teamIdx;

  // Without the ball: the nearest player chases, the rest hold their shape.
  if (!weHaveBall && !barred && i === chaserIndex(state, teamIdx)) {
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
      const cover = coverIndex(state, teamIdx, chaser);
      const tactical = premiumDefendingSpot(state, teamIdx, i, home, chaser, cover);
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
  if (p.cooldown > 0 || p.slide > 0 || p.down > 0 || p.role === 'gk') return false;
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
