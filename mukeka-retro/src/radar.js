// Радар (мини-карта) — центральный инструмент PES: без него не видно
// открываний за кадром, и пас на ход играется вслепую. 2D-canvas поверх
// стекла кинескопа, 23 точки за кадр — по цене это ноль.
//
// Стиль — служебная графика, как полоска силы, а не эфирная плашка: без
// скоса (skew исказил бы ГЕОМЕТРИЮ поля — круг стал бы параллелограммом,
// а радар обязан честно показывать расстояния), тёмная полупрозрачная
// подложка в цветах слаба телеграфики.
//
// Ориентация повторяет ТВ-камеру: камера стоит на +Z и смотрит на поле,
// значит +X мира — вправо по экрану, а БЛИЖНЯЯ к камере бровка (+Z) — низ
// радара. Игрок видит на радаре то же, что в кадре, без поворота в голове.

import { CONFIG } from './config.js';

export class Radar {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.enabled = true;
    this.blink = 0; // фаза мигания управляемого игрока
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (!on) this.canvas.classList.remove('show');
  }

  draw(match, dt = 1 / 60) {
    const c = this.canvas;
    // В заставке, повторе, праздновании и на финальном свистке радара нет —
    // там своя графика, как у плашки игрока
    const hidden = !this.enabled || !match ||
      match.state === 'intro' || match.state === 'replay' ||
      match.state === 'celebration' || match.state === 'fulltime';
    if (hidden) {
      c.classList.remove('show');
      return;
    }
    c.classList.add('show');
    this.blink += dt;

    // Буфер под фактический CSS-размер (ретина ×2), пересоздаётся при resize
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    const pw = Math.round(w * 2), ph = Math.round(h * 2);
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }

    const ctx = this.ctx;
    const F = CONFIG.field;
    const pad = Math.round(pw * 0.02);
    const fx = (x) => pad + ((x + F.length / 2) / F.length) * (pw - pad * 2);
    const fz = (z) => pad + ((z + F.width / 2) / F.width) * (ph - pad * 2);

    ctx.clearRect(0, 0, pw, ph);

    // Подложка и разметка: тёмный газон, рамка, средняя линия, круг
    ctx.fillStyle = 'rgba(8, 26, 14, 0.62)';
    ctx.fillRect(0, 0, pw, ph);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(pad, pad, pw - pad * 2, ph - pad * 2);
    ctx.beginPath();
    ctx.moveTo(pw / 2, pad);
    ctx.lineTo(pw / 2, ph - pad);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pw / 2, ph / 2, (9.15 / F.length) * (pw - pad * 2), 0, Math.PI * 2);
    ctx.stroke();
    // Штрафные площади (16.5 м от лицевой, 40.32 м шириной)
    const boxW = (16.5 / F.length) * (pw - pad * 2);
    const boxH = (40.32 / F.width) * (ph - pad * 2);
    ctx.strokeRect(pad, ph / 2 - boxH / 2, boxW, boxH);
    ctx.strokeRect(pw - pad - boxW, ph / 2 - boxH / 2, boxW, boxH);

    // Игроки: квадратики цветов формы — как метки на табло
    const dot = Math.max(3, Math.round(pw * 0.014));
    for (let ti = 0; ti < match.teams.length; ti++) {
      const team = match.teams[ti];
      ctx.fillStyle = match._teamColors ? match._teamColors[ti] : '#ccc';
      for (const p of team.players) {
        const gp = p.group.position;
        ctx.fillRect(fx(gp.x) - dot / 2, fz(gp.z) - dot / 2, dot, dot);
      }
    }

    // Управляемый — мигающая белая обводка, тем же ритмом, что звезда-маркер
    const ctrl = match.controlled;
    if (ctrl && Math.sin(this.blink * 7) > -0.4) {
      const gp = ctrl.group.position;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(fx(gp.x) - dot, fz(gp.z) - dot, dot * 2, dot * 2);
    }

    // Мяч — белая точка поверх всех
    const bp = match.ball.mesh.position;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(fx(bp.x), fz(bp.z), dot * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
}
