import { Speech } from '../../src/speech.js';
import * as baseCommentary from '../../src/commentary.js';
import { scoreWords } from '../../src/commentary.js';
import { audioCtx, audioLive, onAudioUnlock } from './audioctx.js';

const EXTRA_WORDS = {
  do: ['D', 'UW'],
  da: ['D', 'AH'],
  pedralisa: ['P','EH','D','R','AH','L','IY','Z','AH'],
  independencia: baseCommentary.WORDS.independencia,
};

const VOCAB = {
  WORDS: { ...baseCommentary.WORDS, ...EXTRA_WORDS },
  LINES: {
    ...baseCommentary.LINES,
    corner: ['escanteio para pedra lisa', 'escanteio para independencia'],
    throwin: ['lateral para pedra lisa', 'lateral para independencia'],
    goalkick: ['tiro de meta para pedra lisa', 'tiro de meta para independencia'],
  },
};

function makeNoise(ctx, seconds = 3.2) {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function teamWords(match, team) {
  const idx = match?.teams?.indexOf(team);
  return idx === 1 ? 'independencia' : 'pedra lisa';
}

function restartWords(match) {
  const r = match?.restart;
  if (!r || !r.team) return '';
  const side = teamWords(match, r.team);
  if (r.type === 'corner') return `escanteio para ${side}`;
  if (r.type === 'throwin') return `lateral para ${side}`;
  if (r.type === 'goalkick') return `tiro de meta para ${side}`;
  return '';
}

function savesTotal(match) {
  const s = match?.stats;
  if (!s) return 0;
  const save = Array.isArray(s.save) ? s.save.reduce((a, b) => a + (Number(b) || 0), 0) : 0;
  const parry = Array.isArray(s.parry) ? s.parry.reduce((a, b) => a + (Number(b) || 0), 0) : 0;
  return save + parry;
}

export class RetroCommentator {
  constructor() {
    this.enabled = localStorage.getItem('f98.commentary') !== '0';
    this.engine = null;
    this.speech = null;
    this.prevState = null;
    this.prevScore = null;
    this.prevRestart = null;
    this.prevSaves = 0;
    this.lastLineAt = -99;

    onAudioUnlock(() => this.ensureAudio());
  }

  ensureAudio() {
    if (this.speech) return this.speech;
    const ctx = audioLive() || audioCtx();
    if (!ctx || ctx.state !== 'running') return null;
    const master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
    this.engine = { ctx, master, longNoise: makeNoise(ctx) };
    this.speech = new Speech(this.engine, VOCAB);
    this.speech.level = 1.05;
    return this.speech;
  }

  setEnabled(on) {
    this.enabled = !!on;
    localStorage.setItem('f98.commentary', this.enabled ? '1' : '0');
    if (this.enabled) this.ensureAudio();
  }

  canTalk(gap = 4.5) {
    const ctx = audioLive();
    if (!this.enabled || !ctx) return false;
    if (ctx.currentTime - this.lastLineAt < gap) return false;
    this.lastLineAt = ctx.currentTime;
    return true;
  }

  sayEvent(event, gap = 4.5) {
    if (!this.canTalk(gap)) return;
    this.ensureAudio()?.say(event);
  }

  sayLine(line, gap = 4.5, at = 0) {
    if (!line || !this.canTalk(gap)) return;
    this.ensureAudio()?.line(line, at);
  }

  update(match) {
    if (!match) return;

    const state = match.state;
    const score = Array.isArray(match.score) ? [match.score[0] || 0, match.score[1] || 0] : [0, 0];

    if (!this.prevScore) {
      this.prevScore = [...score];
      this.prevState = state;
      this.prevSaves = savesTotal(match);
      return;
    }

    const goal = score[0] !== this.prevScore[0] || score[1] !== this.prevScore[1];
    if (goal) {
      const speech = this.ensureAudio();
      const ctx = audioLive();
      if (this.enabled && speech && ctx) {
        this.lastLineAt = ctx.currentTime;
        speech.say('goal');
        const words = scoreWords(score);
        if (words) speech.line(words, ctx.currentTime + 1.65);
      }
      this.prevScore = [...score];
    }

    if (this.prevState === 'intro' && state !== 'intro') {
      this.sayEvent('start', 0.5);
    }

    if (state === 'fulltime' && this.prevState !== 'fulltime') {
      this.sayEvent('fulltime', 1.2);
    }

    if (state === 'restart' && match.restart && match.restart !== this.prevRestart) {
      const line = restartWords(match);
      if (line) this.sayLine(line, 3.2);
      this.prevRestart = match.restart;
    } else if (state !== 'restart') {
      this.prevRestart = null;
    }

    const saves = savesTotal(match);
    if (saves > this.prevSaves) {
      this.sayEvent('save', 3.5);
    }
    this.prevSaves = saves;
    this.prevState = state;
  }
}
