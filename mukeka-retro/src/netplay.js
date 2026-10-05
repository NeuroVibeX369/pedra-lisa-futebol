// Multiplayer do Mukeka Retro: anfitrião autoritativo.
//
// O anfitrião simula a partida completa. O convidado envia seu estado de
// controle e continua simulando localmente para resposta imediata; snapshots
// frequentes do anfitrião corrigem bola, jogadores, placar e relógio.
//
// Isto evita depender de lockstep determinístico: o jogo original usa
// Math.random() em vários pontos da IA e da física de decisão.

class RemoteAction {
  constructor() {
    this.held = false;
    this.t = 0;
    this._edge = null;
    this._edgeMod = false;
    this.modWas = false;
  }

  setState(held, charge = 0) {
    this.held = !!held;
    this.t = Number.isFinite(charge) ? charge : 0;
  }

  push(edge, mod = false) {
    if (edge === null || edge === undefined) return;
    this._edge = Number(edge);
    this._edgeMod = !!mod;
  }

  consume() {
    const v = this._edge;
    this._edge = null;
    this.modWas = !!this._edgeMod;
    this._edgeMod = false;
    return v;
  }

  consumePeek() {
    return this._edge;
  }

  cancel() {
    this.held = false;
    this.t = 0;
    this._edge = null;
    this._edgeMod = false;
  }

  get charge01() {
    return this.t;
  }
}

export class RemoteInput {
  constructor() {
    this.move = { x: 0, z: 0 };
    this.pass = new RemoteAction();
    this.through = new RemoteAction();
    this.shot = new RemoteAction();
    this.sprint = false;
    this.feintHeld = false;
    this.shotAim = null;
    this._comboHeld = false;
    this._switchQueued = false;
    this._feintQueued = false;
    this._crossEvent = null;
    this._crossPressEdge = false;
    this._swipeEvent = null;
    this._lastSeq = -1;
  }

  applyPacket(p) {
    if (!p || !Number.isFinite(p.seq) || p.seq <= this._lastSeq) return;
    this._lastSeq = p.seq;

    this.move.x = clamp(Number(p.mx) || 0, -1, 1);
    this.move.z = clamp(Number(p.mz) || 0, -1, 1);
    this.sprint = !!p.sprint;
    this.feintHeld = !!p.feintHeld;
    this._comboHeld = !!p.comboHeld;
    this.shotAim = p.shotAim && Number.isFinite(p.shotAim.x) && Number.isFinite(p.shotAim.z)
      ? { x: p.shotAim.x, z: p.shotAim.z } : null;

    this.pass.setState(p.passHeld, p.passCharge);
    this.through.setState(p.throughHeld, p.throughCharge);
    this.shot.setState(p.shotHeld, p.shotCharge);

    this.pass.push(p.passEdge, p.passEdgeMod);
    this.through.push(p.throughEdge, p.throughEdgeMod);
    this.shot.push(p.shotEdge, p.shotEdgeMod);

    if (p.switchEdge) this._switchQueued = true;
    if (p.feintEdge) this._feintQueued = true;
    if (p.crossPress) this._crossPressEdge = true;
    if (p.crossEvent) this._crossEvent = {
      charge: Number(p.crossEvent.charge) || 0.15,
      taps: Math.max(1, Math.min(3, Number(p.crossEvent.taps) || 1)),
    };
    if (p.swipe) this._swipeEvent = cloneSwipe(p.swipe);
  }

  get comboHeld() {
    return this._comboHeld;
  }

  consumeSwitch() {
    const v = this._switchQueued;
    this._switchQueued = false;
    return v;
  }

  consumeFeint() {
    const v = this._feintQueued;
    this._feintQueued = false;
    return v;
  }

  consumeCross() {
    const v = this._crossEvent;
    this._crossEvent = null;
    return v;
  }

  consumeCrossPress() {
    const v = this._crossPressEdge;
    this._crossPressEdge = false;
    return v;
  }

  cancelCross() {
    this._crossEvent = null;
    this._crossPressEdge = false;
  }

  consumeSwipe() {
    const v = this._swipeEvent;
    this._swipeEvent = null;
    return v;
  }

  get strikeCommitted() {
    return this.pass.held || this.pass.consumePeek() !== null ||
      this.through.held || this.through.consumePeek() !== null ||
      this.shot.held || this.shot.consumePeek() !== null ||
      this._crossEvent !== null;
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function q(v, scale = 100) {
  const n = Number(v) || 0;
  return Math.round(n * scale) / scale;
}

function cloneSwipe(s) {
  if (!s || !s.dir) return null;
  return {
    kind: s.kind === 'cross' ? 'cross' : 'shot',
    dir: {
      x: clamp(Number(s.dir.x) || 0, -1, 1),
      z: clamp(Number(s.dir.z) || 0, -1, 1),
    },
    power: clamp(Number(s.power) || 0.2, 0.2, 1.3),
    speed: Math.max(0, Number(s.speed) || 0),
    curl: clamp(Number(s.curl) || 0, -1, 1),
  };
}

function actionCharge(action) {
  if (!action) return 0;
  const t = Number(action.charge01);
  return Number.isFinite(t) ? t : 0;
}

function edgeValue(action) {
  if (!action || typeof action.consumePeek !== 'function') return null;
  const v = action.consumePeek();
  return v === null || v === undefined ? null : Number(v);
}

function captureInput(input, seq) {
  return {
    t: 'retro-input',
    seq,
    mx: input.move?.x || 0,
    mz: input.move?.z || 0,
    sprint: !!input.sprint,
    feintHeld: !!input.feintHeld,
    comboHeld: !!input.comboHeld,
    shotAim: input.shotAim ? { x: input.shotAim.x, z: input.shotAim.z } : null,

    passHeld: !!input.pass?.held,
    passCharge: actionCharge(input.pass),
    passEdge: edgeValue(input.pass),
    passEdgeMod: !!input.pass?._edgeMod,

    throughHeld: !!input.through?.held,
    throughCharge: actionCharge(input.through),
    throughEdge: edgeValue(input.through),
    throughEdgeMod: !!input.through?._edgeMod,

    shotHeld: !!input.shot?.held,
    shotCharge: actionCharge(input.shot),
    shotEdge: edgeValue(input.shot),
    shotEdgeMod: !!input.shot?._edgeMod,

    switchEdge: !!input._switchQueued,
    feintEdge: !!input._feintQueued,
    crossPress: !!input._crossPressEdge,
    crossEvent: input._crossEvent ? {
      charge: input._crossEvent.charge,
      taps: input._crossEvent.taps,
    } : null,
    swipe: input._swipeEvent ? cloneSwipe(input._swipeEvent) : null,
  };
}

function hasEdge(p) {
  return p.passEdge !== null || p.throughEdge !== null || p.shotEdge !== null ||
    p.switchEdge || p.feintEdge || p.crossPress || !!p.crossEvent || !!p.swipe;
}

function playerIndex(team, player) {
  if (!team || !player) return -1;
  return team.players.indexOf(player);
}

function makeSnapshot(match, ball, seq) {
  const possession = match.possession ? match.teams.indexOf(match.possession) : -1;
  const toucherTeam = match.toucher?.team ? match.teams.indexOf(match.toucher.team) : -1;
  const toucherPlayer = toucherTeam >= 0
    ? match.teams[toucherTeam].players.indexOf(match.toucher) : -1;

  return {
    t: 'retro-state',
    seq,
    state: match.state,
    clock: q(match.clock, 10),
    half: match.half || 1,
    halftimeDone: !!match.halftimeDone,
    score: [...match.score],
    kickoffTeam: match.kickoffTeam,
    possession,
    toucher: [toucherTeam, toucherPlayer],
    controlled: [
      playerIndex(match.teams[0], match.humanTeamIndex === 0 ? match.controlled : match.remoteControlled),
      playerIndex(match.teams[1], match.humanTeamIndex === 1 ? match.controlled : match.remoteControlled),
    ],
    restart: match.restart ? {
      type: match.restart.type,
      team: match.teams.indexOf(match.restart.team),
      x: q(match.restart.x),
      z: q(match.restart.z),
      phase: match.restart.phase || 'dead',
      t0: q(match.restart.t || 0, 20),
      indirect: !!match.restart.indirect,
      label: match.restart.label || null,
      taker: playerIndex(match.restart.team, match.restart.taker),
    } : null,
    ball: {
      p: [q(ball.mesh.position.x), q(ball.mesh.position.y), q(ball.mesh.position.z)],
      v: [q(ball.vel.x), q(ball.vel.y), q(ball.vel.z)],
      spin: q(ball.spin, 100),
    },
    teams: match.teams.map((team) => team.players.map((p) => ({
      p: [q(p.group.position.x), q(p.group.position.y), q(p.group.position.z)],
      v: [q(p.vel?.x || 0), q(p.vel?.y || 0), q(p.vel?.z || 0)],
      r: q(p.rot, 100),
      down: q(p.downT || 0, 20),
      tackle: q(p.tackleT || 0, 20),
      out: !!p.dismissed,
    }))),
  };
}

function applySnapshot(match, ball, s) {
  if (!s || !match || !ball || !Array.isArray(s.teams)) return;

  if (Array.isArray(s.score) && s.score.length === 2) {
    match.score[0] = Number(s.score[0]) || 0;
    match.score[1] = Number(s.score[1]) || 0;
  }
  if (Number.isFinite(s.clock)) match.clock = s.clock;
  if (typeof s.state === 'string') match.state = s.state;
  if (s.half === 1 || s.half === 2) match.half = s.half;
  match.halftimeDone = !!s.halftimeDone;
  if (s.kickoffTeam === 0 || s.kickoffTeam === 1) match.kickoffTeam = s.kickoffTeam;

  if (s.restart && (s.restart.team === 0 || s.restart.team === 1)) {
    const team = match.teams[s.restart.team];
    const taker = team?.players?.[s.restart.taker] || team?.fieldPlayers?.[0] || team?.keeper;
    match.restart = {
      type: s.restart.type,
      team,
      x: Number(s.restart.x) || 0,
      z: Number(s.restart.z) || 0,
      taker,
      phase: s.restart.phase || 'dead',
      t: Number(s.restart.t0) || 0,
      indirect: !!s.restart.indirect,
      label: s.restart.label || null,
    };
  } else if (s.state !== 'restart') {
    match.restart = null;
  }
  if (s.possession === 0 || s.possession === 1) match.possession = match.teams[s.possession];

  if (s.ball?.p && s.ball?.v) {
    ball.mesh.position.set(s.ball.p[0], s.ball.p[1], s.ball.p[2]);
    ball.vel.set(s.ball.v[0], s.ball.v[1], s.ball.v[2]);
    if ('spin' in s.ball) ball.spin = s.ball.spin;
  }

  for (let ti = 0; ti < 2; ti++) {
    const srcTeam = s.teams[ti];
    const dstTeam = match.teams[ti];
    if (!Array.isArray(srcTeam) || !dstTeam) continue;
    for (let pi = 0; pi < dstTeam.players.length && pi < srcTeam.length; pi++) {
      const sp = srcTeam[pi];
      const p = dstTeam.players[pi];
      if (!sp?.p) continue;
      const pos = p.group.position;
      const dx = sp.p[0] - pos.x;
      const dy = sp.p[1] - pos.y;
      const dz = sp.p[2] - pos.z;
      const far = dx * dx + dy * dy + dz * dz > 16;
      const k = far ? 1 : 0.58;
      pos.x += dx * k;
      pos.y += dy * k;
      pos.z += dz * k;
      if (p.vel && sp.v) p.vel.set(sp.v[0], sp.v[1], sp.v[2]);
      if (Number.isFinite(sp.r)) p.rot = sp.r;
      p.dismissed = !!sp.out;
      p.group.visible = !p.dismissed;
      if (p.shadow) p.shadow.visible = !p.dismissed;
    }
  }

  // No convidado, o jogador local é o Independência (time 1).
  const idx = Array.isArray(s.controlled) ? s.controlled[1] : -1;
  if (match.humanTeamIndex === 1 && Number.isInteger(idx) && idx >= 0) {
    const p = match.teams[1].players[idx];
    if (p) {
      match.controlled = p;
      if (match.controlledMarker) {
        match.controlledMarker.position.x = p.group.position.x;
        match.controlledMarker.position.z = p.group.position.z;
      }
    }
  }
}

export class RetroNetplay {
  constructor({ signal, role, match, ball, input }) {
    this.signal = signal;
    this.role = role;
    this.match = match;
    this.ball = ball;
    this.input = input;
    this.connected = false;
    this.remoteInput = role === 'host' ? new RemoteInput() : null;
    this.inputSeq = 0;
    this.stateSeq = 0;
    this.lastInputAt = 0;
    this.lastStateAt = 0;
    this.latestSnapshot = null;
    this.lastAppliedSnapshot = -1;
    this.lastSnapshotAt = performance.now();
    this.remoteMobile = false;
    this.lowPowerGuest = role === 'guest' && !!globalThis.matchMedia?.('(pointer: coarse)')?.matches;
    this.simAccum = 0;
    this._staleShown = false;

    signal.on('retro-input', (m) => {
      if (this.role !== 'host' || !this.remoteInput) return;
      this.remoteInput.applyPacket(m);
    });

    signal.on('retro-state', (m) => {
      if (this.role !== 'guest') return;
      if (!Number.isFinite(m?.seq)) return;
      this.lastSnapshotAt = performance.now();
      if (!this.latestSnapshot || m.seq > this.latestSnapshot.seq) this.latestSnapshot = m;
    });

    signal.on('retro-profile', (m) => {
      if (this.role !== 'host') return;
      this.remoteMobile = !!m?.mobile;
    });
  }

  setConnected(value) {
    this.connected = !!value;
    this.simAccum = 0;
    if (this.role === 'host' && this.match && this.remoteInput) {
      if (this.connected) this.match.setRemoteController?.(1, this.remoteInput);
      else this.match.setRemoteController?.(-1, null);
    }
    if (this.connected && this.role === 'guest') {
      this.signal.send({
        t: 'retro-profile',
        mobile: !!globalThis.matchMedia?.('(pointer: coarse)')?.matches,
        mem: Number(globalThis.navigator?.deviceMemory) || 0,
      });
    }
  }

  simulationDt(dt) {
    if (!this.connected || this.role !== 'guest' || !this.lowPowerGuest || dt <= 0) return dt;
    this.simAccum += dt;
    if (this.simAccum < 1 / 30) return null;
    const out = Math.min(this.simAccum, 1 / 20);
    this.simAccum = 0;
    return out;
  }

  beforeSimulation(now = performance.now()) {
    if (!this.connected || this.role !== 'guest' || !this.signal || !this.input) return;
    const packet = captureInput(this.input, ++this.inputSeq);
    const edge = hasEdge(packet);
    const interval = this.lowPowerGuest ? 40 : 33;
    if (!edge && now - this.lastInputAt < interval) return;
    this.lastInputAt = now;
    if (edge) this.signal.send(packet);
    else this.signal.sendRealtime?.(packet, 24 * 1024);
  }

  afterSimulation(now = performance.now()) {
    if (!this.connected) return;
    if (this.role === 'host') {
      const interval = this.remoteMobile ? 90 : 60;
      if (!this.match || !this.ball || now - this.lastStateAt < interval) return;
      this.lastStateAt = now;
      this.signal.sendRealtime?.(makeSnapshot(this.match, this.ball, ++this.stateSeq), 64 * 1024);
      return;
    }

    if (this.role === 'guest') {
      const stale = now - this.lastSnapshotAt > 2200;
      if (stale && !this._staleShown) {
        this._staleShown = true;
        const hint = this.match?.hud?.hint;
        if (hint) {
          hint.classList.remove('dim');
          hint.textContent = 'CONEXÃO INSTÁVEL — TENTANDO SINCRONIZAR';
        }
      } else if (!stale && this._staleShown) {
        this._staleShown = false;
        const hint = this.match?.hud?.hint;
        if (hint) hint.classList.add('dim');
      }

      if (this.latestSnapshot && this.latestSnapshot.seq > this.lastAppliedSnapshot) {
        applySnapshot(this.match, this.ball, this.latestSnapshot);
        this.lastAppliedSnapshot = this.latestSnapshot.seq;
      }
    }
  }
}
