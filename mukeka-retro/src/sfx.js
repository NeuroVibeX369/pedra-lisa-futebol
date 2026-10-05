// Звук матча: единая точка для match.js.
//
// Что здесь синтезируется, а что играют записи (правило с 30.07.2026):
//   свисток арбитра и шипение файеров — СИНТЕЗ. Это простые физические
//     звуки (тон с трелью, узкополосный шум), их синтез неотличим от
//     записи, зато он бесплатен, мгновенен и не требует ни одного файла;
//   зал — ЗАПИСИ (src/crowd.js, банк audio/crowd/). Синтезированный гул
//     остался здесь ФОЛБЭКОМ на случай, когда файлы не доехали: игра без
//     трибун звучит как радиоприёмник, и лучше грубый шум, чем тишина.
//
// Политика автоплея (iOS/Chrome): до первого касания или клавиши звуковой
// контекст спит — тогда playWhistle честно возвращает false, а вызывающий
// может повторить свисток позже (интро добирает его в момент розыгрыша).

import { audioLive } from './audioctx.js';
import { CONFIG } from './config.js';
import {
  loadCrowd, crowdReady, setCrowdIntensity as sampleIntensity,
  crowdGoal, crowdGasp as sampleGasp, crowdApplause as sampleApplause,
  crowdJeer as sampleJeer, updateCrowd as sampleUpdate,
} from './crowd.js';

// Банк зала начинает грузиться сразу с игрой: жеста для этого не нужно,
// а к первому свистку гул уже должен быть на месте
loadCrowd();

// ===== Гул трибун: ФОЛБЭК на синтезе =====
// Работает, только пока записи не доехали. Розовый шум под полосовым
// фильтром: голосов в нём нет, но «зал» вместо тишины он держит.

let crowd = null;
let fadedOut = false;

// Розовый шум (спад ~3 дБ/октаву) — ближе к голосу толпы, чем белый
function makeNoiseBuffer(c, seconds = 4) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
  }
  // Сшиваем края кроссфейдом, иначе на стыке петли слышен щелчок
  const fade = Math.floor(c.sampleRate * 0.05);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[i] = d[i] * k + d[len - fade + i] * (1 - k);
  }
  return buf;
}

// Заводится сама при первом же звуке: до жеста пользователя браузер молчит
function ensureCrowd() {
  const c = audioLive();
  if (!c) return null;
  if (crowd) return crowd;

  const src = c.createBufferSource();
  src.buffer = makeNoiseBuffer(c);
  src.loop = true;

  // Тембр: далёкая трибуна — почти без верха
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 760;
  lp.Q.value = 0.6;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 120;

  const gain = c.createGain();
  gain.gain.value = 0.055;   // ровный фон

  // Медленное «дыхание» зала: гул никогда не стоит на месте
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.08;
  const lfoDepth = c.createGain();
  lfoDepth.gain.value = 0.016;
  lfo.connect(lfoDepth);
  lfoDepth.connect(gain.gain);

  src.connect(hp);
  hp.connect(lp);
  lp.connect(gain);
  gain.connect(c.destination);
  src.start();
  lfo.start();

  crowd = { ctx: c, gain, lp, base: 0.055 };
  return crowd;
}

// Записи доехали посреди матча — синтетический гул обязан уйти, иначе
// зал зазвучит дважды: шумом и голосами разом
function retireSynth() {
  if (!crowd || fadedOut) return;
  fadedOut = true;
  const t = crowd.ctx.currentTime;
  crowd.gain.gain.cancelScheduledValues(t);
  crowd.gain.gain.setValueAtTime(crowd.gain.gain.value, t);
  crowd.gain.gain.setTargetAtTime(0.0001, t, 0.8);
}

// ===== Публичное управление залом =====

// Напряжение эпизода 0..1: атака у ворот — зал гудит громче и «ближе»
export function setCrowdIntensity(x) {
  if (crowdReady()) { retireSynth(); sampleIntensity(x); return; }
  const cr = ensureCrowd();
  if (!cr) return;
  const k = Math.max(0, Math.min(1, x));
  const t = cr.ctx.currentTime;
  cr.gain.gain.setTargetAtTime(cr.base * (1 + k * 1.6), t, 0.6);
  cr.lp.frequency.setTargetAtTime(760 + k * 900, t, 0.8);
}

// Взрыв трибун: гол (strength 1), опасный момент (0.4–0.6).
// Резкая атака и долгий спад — так и ревёт стадион.
export function crowdCheer(strength = 1) {
  if (crowdReady()) {
    retireSynth();
    if (strength >= 0.8) crowdGoal();
    else sampleGasp(strength / 0.8);
    return;
  }
  const cr = ensureCrowd();
  if (!cr) return;
  const s = Math.max(0.2, Math.min(1, strength));
  const t = cr.ctx.currentTime;
  const peak = cr.base * (1 + s * 7);
  cr.gain.gain.cancelScheduledValues(t);
  cr.gain.gain.setValueAtTime(cr.gain.gain.value, t);
  cr.gain.gain.linearRampToValueAtTime(peak, t + 0.18 + (1 - s) * 0.4);
  cr.gain.gain.setTargetAtTime(cr.base, t + 0.5 + s * 1.5, 1.2 + s * 2.5);
  cr.lp.frequency.cancelScheduledValues(t);
  cr.lp.frequency.setValueAtTime(cr.lp.frequency.value, t);
  cr.lp.frequency.linearRampToValueAtTime(760 + s * 2400, t + 0.2); // рёв ярче гула
  cr.lp.frequency.setTargetAtTime(760, t + 1.2, 2.2);
}

// Опасный момент: сейв вратаря, штанга, мяч мимо в сантиметрах.
// Без записей зал просто коротко подаёт голос — «ах» синтезом не сделать.
export function crowdGasp(strength = 1) {
  if (crowdReady()) { retireSynth(); return sampleGasp(strength); }
  crowdCheer(0.45 * strength);
  return false;
}

// Аплодисменты: выход команд, красивая комбинация, финальный свисток.
export function crowdApplause(strength = 1) {
  if (crowdReady()) { retireSynth(); return sampleApplause(strength); }
  return false;
}

// Свист трибун: грубый подкат, снос сзади.
export function crowdJeer(strength = 1) {
  if (crowdReady()) { retireSynth(); return sampleJeer(strength); }
  return false;
}

// Волны фанатского сектора — по РЕАЛЬНОМУ времени, как трибуна, дым и
// сам телевизор: темп игры к пению виража отношения не имеет
export function updateCrowd(dt) {
  if (crowdReady()) sampleUpdate(dt);
}

// ===== Файеры =====

// Шипение файеров на трибуне: пиротехника горит с характерным «пшшш».
// Синтез тот же, что был у толпы, — розовый шум, но полоса высокая и узкая:
// шипение живёт в 2–5 кГц, ниже начинается гул зала и мешает ему.
// Звук ДАЛЁКИЙ (сектор в сотне метров), поэтому громкость скромная, а
// нарастание медленное: пачка файеров разгорается пару секунд.
export function flareHiss(count = 1, seconds = 12) {
  const c = audioLive();
  if (!c) return false;
  const n = Math.max(1, Math.min(10, count));
  const t0 = c.currentTime + 0.05;

  const src = c.createBufferSource();
  src.buffer = makeNoiseBuffer(c, 3);
  src.loop = true;

  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3100;
  bp.Q.value = 0.9;
  // Розовый шум завален по верхам — поднимаем «песок», иначе выйдет шорох
  const tilt = c.createBiquadFilter();
  tilt.type = 'highshelf';
  tilt.frequency.value = 2600;
  tilt.gain.value = 9;

  const out = c.createGain();
  const peak = 0.012 * Math.sqrt(n);   // вдвое больше факелов ≠ вдвое громче
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.linearRampToValueAtTime(peak, t0 + 1.6);
  out.gain.setValueAtTime(peak, t0 + seconds * 0.6);
  out.gain.setTargetAtTime(0.0001, t0 + seconds * 0.6, seconds * 0.25);

  src.connect(tilt);
  tilt.connect(bp);
  bp.connect(out);
  out.connect(fieldBus()); // через полосу телевизора, как весь звук поля
  src.start(t0);
  src.stop(t0 + seconds + 2);
  return true;
}

// ===== Тракт ПОЛЯ =====
//
// Свои моно-узлы с той же полосой 95…6800 Гц, что у зала (CONFIG.audio.tv),
// но МИМО mix.master зала: ползунок «Звук трибун» глушит трибуны, а не
// судью с мячом — то же правило, по которому свисток не подчинялся залу.
// Раньше свисток и файеры шли прямо в destination — чисто, широкополосно и
// стерео, то есть единственные «полевые» звуки звучали современнее зала.

let field = null;
function fieldBus() {
  const c = audioLive();
  if (!c) return null;
  if (field) return field.bus;
  const T = CONFIG.audio.tv;
  const bus = c.createGain();
  if (T.mono) {
    bus.channelCount = 1;
    bus.channelCountMode = 'explicit';
    bus.channelInterpretation = 'speakers';
  }
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = T.hp;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = T.lp;
  lp.Q.value = 0.7;
  bus.connect(hp);
  hp.connect(lp);
  lp.connect(c.destination);
  field = { bus };
  return bus;
}

// ===== Звуки мяча =====
//
// Самый частый звук футбольной трансляции — глухой стук мяча, снятый
// направленными микрофонами у поля. До 25.08.2026 игра была по мячу НЕМОЙ:
// ни удара, ни штанги, ни сетки. Всё синтез, все числа — CONFIG.audio.field.
// Антиспам per-звук: ведение толкает мяч по несколько раз в секунду, и без
// кулдауна дриблинг звучал бы пулемётом.

const lastAt = {};            // имя звука → currentTime последнего запуска
function throttled(c, name, cd) {
  const t = c.currentTime;
  if (lastAt[name] !== undefined && t - lastAt[name] < cd) return true;
  lastAt[name] = t;
  return false;
}

// Короткий шумовой всплеск через фильтр — общая деталь ударов и шлепков.
// Буфер шума ОДИН на все звуки: удар — самый частый звук матча, и свежий
// буфер на каждое касание был бы мусором в куче по несколько раз в секунду.
let burstBuffer = null;
function noiseBurst(c, dest, when, dur, freq, gain, type = 'lowpass') {
  if (!burstBuffer) burstBuffer = makeNoiseBuffer(c, 0.5);
  const src = c.createBufferSource();
  src.buffer = burstBuffer;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(when, Math.random() * 0.3);  // случайное окно — всплески не близнецы
  src.stop(when + dur + 0.05);
}

// Удар/пас/касание: тело «тука» — синус с падением высоты, сверху шумовой
// щелчок кожи. k — сила 0..1 (скорость мяча после касания / kickRef).
export function ballKick(k) {
  const c = audioLive();
  const A = CONFIG.audio.field;
  if (!c) return false;
  const v = Math.max(0, Math.min(1, k));
  const vol = A.kick * (0.18 + 0.82 * v * v); // тихое касание заметно тише удара
  if (vol < A.kickMin) return false;
  if (throttled(c, 'kick', A.kickCd)) return false;
  const bus = fieldBus();
  const t0 = c.currentTime + 0.005;
  const jitter = 0.92 + Math.random() * 0.16;  // два удара подряд не близнецы

  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime((105 + 40 * v) * jitter, t0);
  osc.frequency.exponentialRampToValueAtTime(52, t0 + 0.09);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11 + 0.05 * v);
  osc.connect(g);
  g.connect(bus);
  osc.start(t0);
  osc.stop(t0 + 0.2);

  noiseBurst(c, bus, t0, 0.03 + 0.02 * v, 900 + 700 * v, vol * 0.5);
  return true;
}

// Отскок от газона: глуше и мягче удара, высота почти не падает
export function ballBounce(vy) {
  const c = audioLive();
  const A = CONFIG.audio.field;
  if (!c || Math.abs(vy) < A.bounceMinVy) return false;
  if (throttled(c, 'bounce', A.bounceCd)) return false;
  const bus = fieldBus();
  const k = Math.min(1, Math.abs(vy) / 14);
  const t0 = c.currentTime + 0.005;

  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(84, t0);
  osc.frequency.exponentialRampToValueAtTime(55, t0 + 0.06);
  const g = c.createGain();
  g.gain.setValueAtTime(A.bounce * (0.25 + 0.75 * k), t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
  osc.connect(g);
  g.connect(bus);
  osc.start(t0);
  osc.stop(t0 + 0.15);

  noiseBurst(c, bus, t0, 0.035, 420, A.bounce * 0.4 * k);
  return true;
}

// Каркас ворот: алюминиевый «дон-н» — пара негармоничных резонансов с
// долгим спадом. Штанга — событие матча, звучит смело и узнаваемо.
export function ballPost(k = 1) {
  const c = audioLive();
  const A = CONFIG.audio.field;
  if (!c) return false;
  if (throttled(c, 'post', A.postCd)) return false;
  const bus = fieldBus();
  const v = Math.max(0.3, Math.min(1, k));
  const t0 = c.currentTime + 0.005;
  // Резонансы трубы: основной + негармоничный партиал (металл, не колокол)
  for (const [freq, share, decay] of [[1180, 1.0, 0.55], [2320, 0.45, 0.32], [720, 0.35, 0.4]]) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * (0.99 + Math.random() * 0.02);
    const g = c.createGain();
    g.gain.setValueAtTime(A.post * v * share * 0.5, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    osc.connect(g);
    g.connect(bus);
    osc.start(t0);
    osc.stop(t0 + decay + 0.1);
  }
  noiseBurst(c, bus, t0, 0.02, 2500, A.post * v * 0.35, 'bandpass');
  return true;
}

// Сетка: короткий шорох капрона — полосовой шум без тона
export function ballNet(impact) {
  const c = audioLive();
  const A = CONFIG.audio.field;
  if (!c || impact < A.netMinImpact) return false;
  if (throttled(c, 'net', A.netCd)) return false;
  const k = Math.min(1, impact / 25);
  const t0 = c.currentTime + 0.005;
  noiseBurst(c, fieldBus(), t0, 0.12 + 0.08 * k, 1400, A.net * (0.35 + 0.65 * k), 'bandpass');
  return true;
}

// Рекламный щит: пластиковый «бум» — низкий тон плюс глухой шум
export function ballBoard(v) {
  const c = audioLive();
  const A = CONFIG.audio.field;
  if (!c || Math.abs(v) < A.boardMinV) return false;
  if (throttled(c, 'board', 0.2)) return false;
  const bus = fieldBus();
  const k = Math.min(1, Math.abs(v) / 18);
  const t0 = c.currentTime + 0.005;
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(150, t0);
  osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.07);
  const g = c.createGain();
  g.gain.setValueAtTime(A.board * (0.3 + 0.7 * k), t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
  osc.connect(g);
  g.connect(bus);
  osc.start(t0);
  osc.stop(t0 + 0.18);
  noiseBurst(c, bus, t0, 0.05, 500, A.board * 0.5 * k);
  return true;
}

// Перчатки вратаря: шлепок ловли — шум пошире и мягкий тон
export function gloveCatch() {
  const c = audioLive();
  const A = CONFIG.audio.field;
  if (!c) return false;
  if (throttled(c, 'glove', 0.25)) return false;
  const bus = fieldBus();
  const t0 = c.currentTime + 0.005;
  noiseBurst(c, bus, t0, 0.06, 800, A.glove * 0.8);
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(190, t0);
  osc.frequency.exponentialRampToValueAtTime(120, t0 + 0.05);
  const g = c.createGain();
  g.gain.setValueAtTime(A.glove * 0.4, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
  osc.connect(g);
  g.connect(bus);
  osc.start(t0);
  osc.stop(t0 + 0.12);
  return true;
}

// ===== Свисток =====

// Свисток длиной duration сек. Возвращает true, если реально зазвучал.
export function playWhistle(duration = 0.8) {
  // Спрашиваем ГОТОВЫЙ контекст, а не будим его сами. Свой resume делал
  // свисток единственным звуком, который обходил и политику автоплея, и
  // отказ игрока от звука: «БЕЗ ЗВУКА» глушит контекст целиком, а свисток
  // тут же будил его и свистел один в тишине. Звука нет — честно false,
  // вызывающий повторит (интро добирает свисток в момент розыгрыша).
  const c = audioLive();
  if (!c) return false;
  const t0 = c.currentTime + 0.02;
  const t1 = t0 + duration;

  // Тон: пара генераторов с расстройкой ~100 Гц — биения дают «металл»
  const osc1 = c.createOscillator();
  osc1.type = 'square';
  osc1.frequency.setValueAtTime(2320, t0);
  osc1.frequency.linearRampToValueAtTime(2250, t1); // дыхание садится — тон плывёт вниз
  const osc2 = c.createOscillator();
  osc2.type = 'square';
  osc2.frequency.value = 2418;

  // Трель «горошины»: громкость дрожит ~36 Гц
  const am = c.createGain();
  am.gain.value = 0.55;
  const trill = c.createOscillator();
  trill.type = 'sine';
  trill.frequency.value = 36;
  const trillDepth = c.createGain();
  trillDepth.gain.value = 0.45;
  trill.connect(trillDepth);
  trillDepth.connect(am.gain);

  // Полосовой фильтр вычищает квадратные гармоники до свистка
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2330;
  bp.Q.value = 4.5;

  // Огибающая: резкая атака, ровное тело, быстрый спад
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
  out.gain.setValueAtTime(0.3, Math.max(t0 + 0.02, t1 - 0.1));
  out.gain.exponentialRampToValueAtTime(0.0001, t1);

  osc1.connect(am);
  osc2.connect(am);
  am.connect(bp);
  bp.connect(out);
  out.connect(fieldBus()); // моно и полоса 95…6800 — свисток из динамика ТВ
  osc1.start(t0);
  osc2.start(t0);
  trill.start(t0);
  osc1.stop(t1 + 0.05);
  osc2.stop(t1 + 0.05);
  trill.stop(t1 + 0.05);
  return true;
}
