// Лицо игрока — ТЕКСТУРА, нарисованная кодом из данных состава.
//
// Почему текстурой, а не геометрией. На голове 212 треугольников, а в кадре она
// занимает 7 пикселей с рабочей ТВ-камеры и 56 на повторе крупным планом. Глаза
// и рот такого размера невозможно вылепить рельефом — их РИСОВАЛИ, ровно так же
// делали лица на PS1 и PS2. Геометрия даёт только крупную форму: нос, надбровье,
// подбородок (см. NOSE/BROW в tools/build-player-mesh.py).
//
// РАЗВЁРТКА ГОЛОВЫ (задана там же, build_head). Цилиндрическая:
//   u — угол вокруг головы, 0.5 РОВНО ПО ЦЕНТРУ ЛИЦА, дальше по кругу;
//       грань занимает 1/12 оборота, шов уходит на затылок и закрывается
//       RepeatWrapping — поэтому текстура обязана быть бесшовной по краям,
//       то есть слева и справа у неё ровный тон кожи.
//   v — высота: 0 подбородок, 1 макушка.
// Уши берут точку (1.0, 0.55) — затылок на середине высоты, там чистая кожа.
//
// Внешность — ДАННЫЕ (data/teams/*.json → squad): skin, hair, hairColor, beard.
// Мелкие отличия (расстановка глаз, толщина бровей, ширина рта) выводятся из
// ХЕША ФАМИЛИИ: 22 лица в кадре не должны быть одним лицом, но и заводить на
// каждую бровь поле в JSON незачем.
import * as THREE from 'three';

export const FACE = {
  // РАЗМЕР НЕ КВАДРАТНЫЙ, И ЭТО ЗАМЕР. Развёртка головы цилиндрическая: по u
  // лежит весь оборот (лицо занимает треть), по v — высота головы. На самом
  // близком плане (празднование, 7 м) при 128 текселях по горизонтали на лицо
  // приходится 0.62 текселя на пиксель — то есть каждый тексель растягивается
  // в полтора экранных и при NearestFilter виден квадратом. По вертикали при
  // тех же 128 запас полуторакратный. Значит удваивать надо ТОЛЬКО u:
  // 256×128 стоит 3.8 МБ на 23 лица против 7.7 у полных 256×256, а вторая
  // половина вертикали ушла бы впустую.
  w: 256,
  h: 128,
  // Высоты в долях развёртки (v): 0 — подбородок, 1 — макушка
  // Доли высоты головы. Сверены с HEAD в tools/build-player-mesh.py:
  // подбородок 1.574, глаза 1.682, макушка 1.815.
  vMouth: 0.215,
  vNose: 0.307,
  vEye: 0.445,
  vBrow: 0.502,
  vHair: 0.725,       // линия волос
  vTemple: 0.56,
  // Полуширина лица в долях оборота: ±60° = ±1/6
  uFace: 1 / 6,
  eyeGap: 0.070,      // доля оборота от центра до зрачка (замер: asin(3.2/7.7))
};

// --- мелкая утварь -----------------------------------------------------------
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Детерминированный «кубик» 0..1 по фамилии и номеру канала. */
function roll(seed, k) {
  const h = Math.imul(seed ^ Math.imul(k + 1, 0x9e3779b1), 0x85ebca6b) >>> 0;
  return h / 4294967296;
}

function parseHex(hex) {
  const n = Number.parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Смешать два цвета в sRGB-байтах. Работаем именно в байтах: canvas живёт
 *  в sRGB, и попытка считать здесь «по-линейному» даёт грязь. */
function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function css(c, alpha = 1) {
  return alpha >= 1
    ? `rgb(${c[0]},${c[1]},${c[2]})`
    : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

// Кромка волос СПЕРЕДИ по стрижкам — мировая высота, сверена с STYLES в
// src/hair.js. Рисованная линия обязана идти ровно под геометрической: у
// `thin` они расходились на 27 мм, и под шапкой оставалась полоса
// нарисованных волос на голом лбу.
const HAIR_EDGE = { thin: 1.755, short: 1.748, afro: 1.738, long: 1.744 };
const HEAD_Z0 = 1.574;
const HEAD_Z1 = 1.815;

function hairEdgeV(style) {
  const z = HAIR_EDGE[style] || HAIR_EDGE.short;
  return (z - HEAD_Z0) / (HEAD_Z1 - HEAD_Z0);
}

/** Щетина из хеша фамилии, когда поля нет. В составах `beard` не задан НИ У
 *  ОДНОГО из 44 игроков, а в эфире 98-го небритых было полстадиона. Раздаём
 *  тем же способом, что форму черепа: данные всегда перекрывают. */
function beardOf(seed) {
  const r = roll(seed, 41);
  if (r < 0.72) return 'none';
  if (r < 0.93) return 'stubble';
  return 'goatee';
}

// --- рисование ---------------------------------------------------------------
const cache = new Map();

/**
 * Текстура лица под внешность игрока.
 * @param look — объект из squad: { name, skin, hair, hairColor, beard }
 */
export function faceTexture(look = {}) {
  const key = [look.name || '', look.skin || '', look.hair || '', look.hairColor || '',
    look.beard || ''].join('|');
  if (cache.has(key)) return cache.get(key);

  const CW = FACE.w;
  const CH = FACE.h;
  const c = document.createElement('canvas');
  c.width = CW;
  c.height = CH;
  const g = c.getContext('2d');

  const skin = parseHex(look.skin || '#c49b7c');
  const hairCol = parseHex(look.hairColor || '#241812');
  const seed = hash(look.name || 'без имени');

  // Тени и света лица строим ОТ ТОНА КОЖИ, а не фиксированными серыми: на
  // смуглом лице серая тень читается грязью, а затемнение своего же тона — нет.
  const dark = mix(skin, [0, 0, 0], 0.30);
  const deep = mix(skin, [0, 0, 0], 0.52);
  const lite = mix(skin, [255, 245, 230], 0.16);
  const glow = mix(skin, [255, 246, 232], 0.34);

  // Холст в координатах развёртки: X = u·CW, Y = (1 − v)·CH.
  // Текстура грузится с flipY = false, поэтому макушка рисуется СВЕРХУ.
  const X = (u) => u * CW;
  const Y = (v) => (1 - v) * CH;
  const WU = (du) => du * CW;      // длина вдоль оборота
  const HV = (dv) => dv * CH;      // длина вдоль высоты головы

  /** Мягкое пятно радиальным градиентом. Единственный примитив лепки.
   *
   *  ЧЕРТЫ РИСУЮТСЯ ПЯТНАМИ, А НЕ ЛИНИЯМИ, и это замер, а не вкус. Прежние
   *  fillRect давали глазу 4×2 текселя с ЖЁСТКИМ краем: на плане празднования
   *  это 3×1.6 пикселя чёрной палочки, на эфирном — грязь после мипов. У
   *  референса ни одной чёткой линии на лице нет вовсе, всё держится на
   *  полутоновых пятнах, и они переживают любое уменьшение. */
  function blob(cx, cy, rx, ry, col, alpha, rot = 0, core = 0.35) {
    const r = Math.max(rx, ry);
    const rg = g.createRadialGradient(cx, cy, r * core, cx, cy, r);
    rg.addColorStop(0, css(col, alpha));
    rg.addColorStop(1, css(col, 0));
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.scale(rx / r, ry / r);
    g.translate(-cx, -cy);
    g.fillStyle = rg;
    g.beginPath();
    g.arc(cx, cy, r, 0, 6.2832);
    g.fill();
    g.restore();
  }

  g.fillStyle = css(skin);
  g.fillRect(0, 0, CW, CH);

  // 1. КРУПНАЯ ЛЕПКА. Именно она читается на общем плане, когда глаз и рта уже
  //    не различить, — и именно её в прежней версии почти не было: замер дал
  //    размах p05…p95 всего 21 уровень из 255 (8 % шкалы) при четверти шкалы
  //    у референса. Амплитуды подняты вдвое, цель — размах около 48.
  const gradSide = g.createLinearGradient(0, 0, CW, 0);
  gradSide.addColorStop(0.00, css(dark, 0.85));
  gradSide.addColorStop(0.17, css(dark, 0.55));
  gradSide.addColorStop(0.33, css(skin, 0.0));
  gradSide.addColorStop(0.50, css(lite, 0.40));
  gradSide.addColorStop(0.67, css(skin, 0.0));
  gradSide.addColorStop(0.83, css(dark, 0.55));
  gradSide.addColorStop(1.00, css(dark, 0.85));
  g.fillStyle = gradSide;
  g.fillRect(0, 0, CW, CH);

  const gradV = g.createLinearGradient(0, Y(0), 0, Y(1));
  gradV.addColorStop(0.00, css(dark, 0.70));
  gradV.addColorStop(0.18, css(skin, 0.0));
  gradV.addColorStop(0.62, css(lite, 0.35));
  gradV.addColorStop(1.00, css(dark, 0.30));
  g.fillStyle = gradV;
  g.fillRect(0, 0, CW, CH);

  const uc = 0.5;                                  // центр лица
  const gap = FACE.eyeGap + (roll(seed, 1) - 0.5) * 0.010;
  const eyeW = WU(0.030 + roll(seed, 2) * 0.007);
  const eyeH = HV(0.030);
  const browT = HV(0.026 + roll(seed, 3) * 0.014);

  // 2. Света: лоб, скулы, спинка носа. Без них лепка идёт только вниз, и лицо
  //    выходит закопчённым — на тёмной коже это особенно заметно.
  blob(X(uc), Y(0.62), WU(0.075), HV(0.13), glow, 0.30);              // лоб
  blob(X(uc), Y(FACE.vEye - 0.03), WU(0.016), HV(0.10), glow, 0.34);  // спинка носа
  for (const s of [-1, 1]) {
    blob(X(uc + s * 0.085), Y(FACE.vNose + 0.075), WU(0.040), HV(0.070),
         glow, 0.26, s * 0.3);                                        // скула
  }

  // 3. Скулы и щёки: тень ПОД скуловой дугой, вытянутая к челюсти.
  for (const s of [-1, 1]) {
    blob(X(uc + s * 0.108), Y(FACE.vNose - 0.03), WU(0.052), HV(0.115),
         deep, 0.28, s * 0.22);
    // Угол челюсти — короткая тень у самого края лица.
    blob(X(uc + s * 0.140), Y(FACE.vMouth - 0.02), WU(0.035), HV(0.075),
         deep, 0.18);
  }
  // Тень под скулой не должна доходить до подбородка: он и так тёмный снизу.
  blob(X(uc), Y(0.06), WU(0.070), HV(0.06), deep, 0.22);

  // 4. Глазницы — тень ЗАМЕТНО шире самих глаз. Без неё глаза читаются
  //    наклейками, а с ней лицо получает объём даже на восьми пикселях.
  for (const s of [-1, 1]) {
    blob(X(uc + s * gap), Y(FACE.vEye + 0.012), eyeW * 1.7, eyeH * 2.1,
         deep, 0.45);
  }

  // 5. Глаза. Тёмное пятно плюс светлое веко снизу: белок целиком делает лицо
  //    мультяшным и пучеглазым, а зрачок обязан остаться самым тёмным местом.
  for (const s of [-1, 1]) {
    const ex = X(uc + s * gap);
    blob(ex, Y(FACE.vEye), eyeW * 0.62, eyeH * 0.60,
         mix(skin, [16, 11, 8], 0.92), 0.95, 0, 0.55);
    blob(ex, Y(FACE.vEye - 0.022), eyeW * 0.66, eyeH * 0.34, lite, 0.42);
  }

  // 6. Брови. На общем плане именно они держат выражение: глаза схлопываются в
  //    точку, а бровь остаётся пятном. Пятно, а не штрих: жёсткий
  //    параллелограмм читался наличником.
  const browCol = mix(hairCol, skin, 0.15);
  for (const s of [-1, 1]) {
    const bx = X(uc + s * gap);
    blob(bx + s * WU(0.004), Y(FACE.vBrow), eyeW * 0.95, browT * 0.62,
         browCol, 0.85, -s * 0.20, 0.45);
    blob(bx - s * WU(0.022), Y(FACE.vBrow - 0.008), eyeW * 0.5, browT * 0.45,
         browCol, 0.60, 0, 0.4);
  }

  // 7. Нос. Гребень даёт ГЕОМЕТРИЯ (окно NOSE в сборщике, полуширина 24°),
  //    текстура добавляет только тень крыла и ноздрю. Тень стоит на u
  //    0.525…0.545, то есть 9°…16° от центра: на прежних 3.6°…9° она легла бы
  //    ровно на гребень нового носа и работала бы наоборот.
  for (const s of [-1, 1]) {
    blob(X(uc + s * 0.036), Y(FACE.vNose + 0.045), WU(0.014), HV(0.085),
         deep, 0.30);
    blob(X(uc + s * 0.026), Y(FACE.vNose - 0.004), WU(0.013), HV(0.020),
         deep, 0.55);                                   // ноздря
  }
  blob(X(uc), Y(FACE.vNose + 0.012), WU(0.020), HV(0.028), glow, 0.30);  // кончик

  // 8. Рот: тёмная щель между губами, светлая нижняя губа, тень под ней.
  const mw = WU(0.052 + roll(seed, 4) * 0.014);
  blob(X(uc), Y(FACE.vMouth), mw, HV(0.016),
       mix(skin, [52, 20, 20], 0.62), 0.80, 0, 0.5);
  blob(X(uc), Y(FACE.vMouth - 0.022), mw * 0.85, HV(0.020), lite, 0.30);
  blob(X(uc), Y(FACE.vMouth - 0.048), mw * 0.8, HV(0.022), deep, 0.28);

  // 9. Ухо. Развёртка у него та же цилиндрическая, что у черепа (см.
  //    build_ears), значит правое ухо садится на u = 0.25, левое на 0.75.
  //    Рисуем крупно: ободок светлее, раковина темнее — мелочь там всё равно
  //    сожмётся, цилиндрическая проекция сильно сжимает тексели на ободе.
  const vEar = (1.669 - 1.574) / 0.241;
  for (const u of [0.25, 0.75]) {
    blob(X(u), Y(vEar), WU(0.030), HV(0.115), deep, 0.34);
    blob(X(u), Y(vEar), WU(0.016), HV(0.060), deep, 0.42);
    blob(X(u), Y(vEar + 0.055), WU(0.026), HV(0.030), lite, 0.30);
  }

  // 10. Линия волос и виски. Голову закрывает отдельная «шапка» (attachHair),
  //     но БЕЗ подложки под ней между шапкой и лицом остаётся полоса голой
  //     кожи. Лысым (hair: none) подложка не нужна — это тоже примета.
  //
  //     КРОМКА БЕРЁТСЯ У СТИЛЯ, А НЕ КОНСТАНТОЙ. Геометрическая кромка гуляет
  //     1.738…1.776 по стрижкам, а рисованная стояла на 1.7487 для всех: у
  //     `thin` расхождение 27 мм, и под шапкой оставалась полоса нарисованных
  //     волос на голом лбу.
  const style = look.hair || 'short';
  if (style !== 'none') {
    const vHair = hairEdgeV(style);
    const yMid = Y(vHair);
    g.fillStyle = css(hairCol, 0.94);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(CW, 0);
    g.lineTo(CW, Y(vHair - 0.10));
    for (let i = CW; i >= 0; i -= 4) {
      const d = Math.abs(i / CW - uc);                 // 0 в центре лица
      // Дуга, а не треугольник: линейный подъём читается «Λ» на лбу.
      const t = Math.min(1, Math.max(0, (0.20 - d) / 0.20));
      const dip = 0.5 * (1 - Math.cos(Math.PI * t));
      g.lineTo(i, yMid - dip * HV(0.055));
    }
    g.closePath();
    g.fill();
    // Растушёвка нижнего края: жёсткая граница читается надетым париком.
    const soft = g.createLinearGradient(0, yMid - HV(0.055), 0, yMid + HV(0.045));
    soft.addColorStop(0, css(hairCol, 0.55));
    soft.addColorStop(1, css(hairCol, 0.0));
    g.fillStyle = soft;
    g.fillRect(0, yMid - HV(0.055), CW, HV(0.10));
    // бакенбарды по бокам лица
    for (const s of [-1, 1]) {
      blob(X(uc + s * 0.140), Y(FACE.vBrow - 0.03), WU(0.014), HV(0.075),
           hairCol, 0.50);
    }
  }

  // 11. Щетина. В эфире 98-го небритых было полстадиона, и это самый дешёвый
  //     способ развести лица. Рисуется ШУМОМ по маске челюсти: прежние два
  //     fillRect во всю ширину лица с жёсткими краями читались нарисованной
  //     бородой из мультфильма.
  const beard = look.beard || beardOf(seed);
  if (beard !== 'none') {
    const bc = mix(hairCol, skin, 0.30);
    const goatee = beard === 'goatee';
    const full = beard === 'full';
    const half = goatee ? 0.050 : 0.150;
    const vTop = goatee ? FACE.vNose - 0.01 : FACE.vMouth + 0.11;
    // Щетина — МАССА, а не россыпь точек: мелкие плотные пятнышки читаются
    // сыпью на крупном плане, а после мипов всё равно сливаются в ровный тон.
    // Поэтому пятен немного, они крупные и очень прозрачные.
    const n = goatee ? 40 : 90;
    for (let i = 0; i < n; i += 1) {
      const r1 = roll(seed, 100 + i * 2);
      const r2 = roll(seed, 101 + i * 2);
      const du = (r1 * 2 - 1) * half;
      // Овал челюсти: чем дальше от центра, тем ниже кончается щетина.
      const edge = 1 - (du / half) ** 2;
      const v = vTop * (0.10 + 0.90 * r2) * (0.45 + 0.55 * edge);
      if (v > vTop) continue;
      blob(X(uc + du), Y(v), WU(0.016), HV(0.026), bc,
           (full ? 0.26 : 0.13) * (0.4 + 0.6 * edge), 0, 0.1);
    }
    if (full) {
      blob(X(uc), Y(FACE.vMouth + 0.055), WU(0.055), HV(0.030), bc, 0.40);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  // flipY = false, как и у атласа формы. Экспортёр glTF переворачивает V
  // (в glTF ось V смотрит вниз), поэтому макушка, лежащая в Blender на v = 1,
  // приезжает в браузер как v = 0 — то есть как ПЕРВАЯ строка картинки.
  // С включённым flipY лицо встаёт вверх ногами: линия волос оказывается
  // под подбородком, и это ровно то, что было видно на стенде.
  tex.flipY = false;
  // Шов развёртки уходит за затылок и закрывается повтором по горизонтали.
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  // МИПМАПЫ ОБЯЗАТЕЛЬНЫ, в отличие от формы. С рабочей ТВ-камеры голова
  // занимает ~7 пикселей: без мипов 128 текселей лица падают в эти 7, и глаза
  // с бровями превращаются в мерцающую кашу при каждом шаге игрока. Крупный
  // план при этом остаётся пиксельным — за это отвечает magFilter.
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 1;
  cache.set(key, tex);
  return tex;
}
