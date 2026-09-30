/* Politopia+ — renderizador isométrico em Canvas 2D
   Direção visual: fantasia medieval sombria. Paleta terrosa e acinzentada, texturas procedurais,
   luz vinda da esquerda, heráldica nas unidades e cidades, névoa de fumaça e cinzas no ar. */
(function (PP) {
  'use strict';
  const TER = PP.TERRAIN;
  const TW = 96, TH = 48, LH = 10;
  const RS = 2; // resolução dos sprites em cache (pixels por unidade de mundo)
  const BONE = '#ece3cf', INK = '#15120f', GOLD = '#c9a45c', BLOOD = '#c4513f', MOSS = '#8fae6a';
  const FONT_D = 'Cinzel, "Trajan Pro", Georgia, serif';
  const FONT_B = '"Alegreya Sans", "Segoe UI", system-ui, sans-serif';

  // ------------------------------------------------------------ Cores
  const colorCache = new Map();
  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    const f = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return '#' + f(r) + f(g) + f(b);
  }
  function shade(hex, k) {
    const key = hex + '*' + k;
    let v = colorCache.get(key);
    if (!v) { const c = hexToRgb(hex); v = rgbToHex(c[0] * k, c[1] * k, c[2] * k); colorCache.set(key, v); }
    return v;
  }
  function mix(a, b, t) {
    const key = a + '|' + b + '|' + t;
    let v = colorCache.get(key);
    if (!v) { const x = hexToRgb(a), y = hexToRgb(b); v = rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); colorCache.set(key, v); }
    return v;
  }
  function rgba(hex, a) { const c = hexToRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
  function hash(x, y, s) {
    let h = (x * 374761393 + y * 668265263 + (s || 0) * 982451653) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const roman = n => { const t = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, r] of t) while (n >= v) { s += r; n -= v; } return s; };
  PP.color = { shade, mix, rgba };
  PP.roman = roman;

  // ------------------------------------------------------------ Ícones vetoriais (game-icons.net)
  const pathCache = new Map();
  function iconPath(key) {
    let p = pathCache.get(key);
    if (!p && PP.ICONS && PP.ICONS[key]) { p = new Path2D(PP.ICONS[key]); pathCache.set(key, p); }
    return p || null;
  }
  // Desenha o ícone centrado em (x, y) com tamanho s (unidades de mundo)
  function drawIcon(ctx, key, x, y, s, fill, shadow) {
    const p = iconPath(key);
    if (!p) return;
    ctx.save();
    ctx.translate(x - s / 2, y - s / 2);
    ctx.scale(s / 512, s / 512);
    if (shadow) {
      ctx.save(); ctx.translate(0, 26); ctx.fillStyle = shadow; ctx.fill(p); ctx.restore();
    }
    ctx.fillStyle = fill;
    ctx.fill(p);
    ctx.restore();
  }
  PP.iconPath = iconPath;
  PP.drawIcon = drawIcon;

  // ------------------------------------------------------------ Sprites em cache
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w); c.height = Math.ceil(h);
    return c;
  }
  function makeSprite(w, h, ax, ay, draw) {
    const c = makeCanvas(w * RS, h * RS);
    const x = c.getContext('2d');
    x.scale(RS, RS); x.translate(ax, ay);
    draw(x);
    return { c, w, h, ax, ay };
  }
  function blit(ctx, s, x, y) { ctx.drawImage(s.c, x - s.ax, y - s.ay, s.w, s.h); }

  function diamond(ctx, cx, cy, s) {
    s = s || 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy - TH / 2 * s);
    ctx.lineTo(cx + TW / 2 * s, cy);
    ctx.lineTo(cx, cy + TH / 2 * s);
    ctx.lineTo(cx - TW / 2 * s, cy);
    ctx.closePath();
  }

  function shieldPath(ctx, w, h) {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2, -h / 2);
    ctx.lineTo(w / 2, -h * 0.06);
    ctx.quadraticCurveTo(w / 2, h * 0.3, 0, h / 2);
    ctx.quadraticCurveTo(-w / 2, h * 0.3, -w / 2, -h * 0.06);
    ctx.closePath();
  }

  // Paletas do terreno (antes da tonalidade do bioma)
  const GROUND = {
    ocean: '#1a2a30', water: '#28414a', plains: '#6c6c45', forest: '#434d32', hills: '#76704f',
    mountain: '#5f5b55', desert: '#9a8662', tundra: '#6f7670', swamp: '#495039',
  };
  const TREES = { aymara: 'pine', tupina: 'broad', vikar: 'snow', qadir: 'dry', hanlu: 'mixed', zambe: 'acacia' };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.game = null;
      this.viewer = 0;
      this.cam = { x: 0, y: 0, z: 0.6 };
      this.camAnim = null;
      this.dirty = true;
      this.anims = []; this.floats = []; this.ghosts = []; this.pops = [];
      this.hl = { selected: null, reach: null, attack: null, convert: null, hover: null };
      this.speed = 1;
      this.sprites = new Map();
      this.patterns = null;
      this.unsub = null;
      this.resize();
      const loop = (t) => {
        this.time = t;
        try { this.frame(t); } catch (e) { console.error(e); this.anims = []; }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      // Redesenha quando as fontes terminarem de carregar (rótulos das cidades)
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { this.dirty = true; });
    }

    setGame(g, viewer) {
      if (this.unsub) this.unsub();
      this.game = g;
      this.viewer = viewer == null ? 0 : viewer;
      this.anims = []; this.floats = []; this.ghosts = []; this.pops = [];
      this.clearHighlights();
      this.unsub = g ? g.on((type, d) => this.onEvent(type, d)) : null;
      this.dirty = true;
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      this.dpr = dpr;
      this.w = this.canvas.clientWidth || window.innerWidth;
      this.h = this.canvas.clientHeight || window.innerHeight;
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.vignette = null;
      this.dirty = true;
    }

    // ---------------------------------------------------------- Geometria
    worldOf(x, y) { return { x: (x - y) * TW / 2, y: (x + y) * TH / 2 }; }
    topY(t) { return TER[t.terrain].water ? 4 : -LH; }
    toScreen(wx, wy) { return { x: (wx - this.cam.x) * this.cam.z + this.w / 2, y: (wy - this.cam.y) * this.cam.z + this.h / 2 }; }
    toWorld(sx, sy) { return { x: (sx - this.w / 2) / this.cam.z + this.cam.x, y: (sy - this.h / 2) / this.cam.z + this.cam.y }; }
    tileScreen(x, y) { const w = this.worldOf(x, y); const t = this.game.tile(x, y); return this.toScreen(w.x, w.y + (t ? this.topY(t) : 0)); }

    screenToTile(sx, sy) {
      const g = this.game;
      if (!g) return null;
      const w = this.toWorld(sx, sy);
      const wy = w.y + LH / 2;
      const fx = (w.x / (TW / 2) + wy / (TH / 2)) / 2, fy = (wy / (TH / 2) - w.x / (TW / 2)) / 2;
      const bx = Math.round(fx), by = Math.round(fy);
      const cands = [];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const t = g.tile(bx + dx, by + dy);
        if (t) cands.push(t);
      }
      cands.sort((a, b) => (b.x + b.y) - (a.x + a.y));
      for (const t of cands) {
        const c = this.worldOf(t.x, t.y);
        const ty = c.y + this.topY(t);
        if (Math.abs(w.x - c.x) / (TW / 2) + Math.abs(w.y - ty) / (TH / 2) <= 1) return t;
      }
      return null;
    }

    // Toque sobre o escudo de uma unidade tem prioridade (o escudo sobe acima da própria casa)
    unitAtScreen(sx, sy) {
      const g = this.game;
      if (!g) return null;
      const w = this.toWorld(sx, sy);
      let best = null;
      for (const u of g.units) {
        if (u.owner !== this.viewer && !this.visibleTo(u.x, u.y)) continue;
        const p = this.tilePosW(u);
        if (Math.abs(w.x - p.x) <= 19 && w.y >= p.y - 46 && w.y <= p.y + 4) {
          if (!best || u.x + u.y > best.x + best.y) best = u;
        }
      }
      return best;
    }

    centerOn(x, y, animate) {
      const w = this.worldOf(x, y);
      if (animate && this.speed > 0) this.camAnim = { fx: this.cam.x, fy: this.cam.y, tx: w.x, ty: w.y - LH, t0: performance.now(), dur: 350 / Math.max(1, this.speed) };
      else { this.cam.x = w.x; this.cam.y = w.y - LH; }
      this.dirty = true;
    }

    fitZoom() {
      const tilesAcross = this.w < 600 ? 5.2 : this.w < 1100 ? 8 : 11;
      this.cam.z = PP.clamp(this.w / (tilesAcross * TW), 0.3, 1.6);
      this.dirty = true;
    }

    zoomAt(f, sx, sy) {
      const before = this.toWorld(sx, sy);
      this.cam.z = PP.clamp(this.cam.z * f, 0.22, 2.2);
      const after = this.toWorld(sx, sy);
      this.cam.x += before.x - after.x; this.cam.y += before.y - after.y;
      this.clampCam();
      this.dirty = true;
    }

    pan(dx, dy) {
      this.cam.x -= dx / this.cam.z; this.cam.y -= dy / this.cam.z;
      this.camAnim = null;
      this.clampCam();
      this.dirty = true;
    }

    clampCam() {
      if (!this.game) return;
      const W = this.game.W, H = this.game.H;
      this.cam.x = PP.clamp(this.cam.x, -H * TW / 2, W * TW / 2);
      this.cam.y = PP.clamp(this.cam.y, -TH, (W + H) * TH / 2);
    }

    clearHighlights() { this.hl = { selected: null, reach: null, attack: null, convert: null, hover: this.hl ? this.hl.hover : null }; this.dirty = true; }

    visibleTo(x, y) {
      if (this.viewer < 0 && this.viewer !== -9) return true;
      const p = this.game.players[this.viewer];
      return !!(p && p.visible[y * this.game.W + x]);
    }
    exploredBy(i) {
      if (this.viewer < 0 && this.viewer !== -9) return true;
      const p = this.game.players[this.viewer];
      return !!(p && p.explored[i]);
    }

    // ---------------------------------------------------------- Animações
    dur(ms) { return this.speed <= 0 ? 0 : ms / this.speed; }
    busy() { return this.anims.length > 0 || !!this.camAnim; }
    waitIdle() {
      return new Promise(res => {
        const check = () => { if (!this.busy()) res(); else setTimeout(check, 30); };
        check();
      });
    }

    onEvent(type, d) {
      const now = performance.now();
      this.dirty = true;
      switch (type) {
        case 'move': {
          const pts = [d.from].concat(d.path);
          if (!pts.some(p => this.visibleTo(p.x, p.y)) && d.unit.owner !== this.viewer) return;
          const step = this.dur(d.unit.owner === this.viewer ? 120 : 160);
          if (step > 0) this.anims.push({ kind: 'move', unit: d.unit, pts, t0: now, dur: step * (pts.length - 1) });
          if (this.followAI && d.unit.owner !== this.viewer) this.ensureVisible(d.path[d.path.length - 1]);
          break;
        }
        case 'attack': {
          const vis = this.visibleTo(d.from.x, d.from.y) || this.visibleTo(d.to.x, d.to.y);
          if (!vis) return;
          if (this.followAI && d.attacker.owner !== this.viewer) this.ensureVisible(d.to);
          const dur = this.dur(280);
          if (dur > 0) this.anims.push({ kind: 'lunge', unit: d.attacker, from: d.from, to: d.to, t0: now, dur, advanced: d.advanced });
          if (d.dmg) this.float(d.to.x, d.to.y, '−' + d.dmg, BLOOD, now + dur * 0.5);
          if (d.ret) this.float(d.from.x, d.from.y, '−' + d.ret, '#d09a3a', now + dur * 0.8);
          if (d.killed) this.ghost(d.defender, now + dur * 0.5);
          if (d.attackerKilled) this.ghost(d.attacker, now + dur);
          for (const s of d.splash) { this.float(s.x, s.y, '−' + s.dmg, BLOOD, now + dur * 0.6); if (s.unit.dead) this.ghost(s.unit, now + dur * 0.6); }
          this.ring(d.to.x, d.to.y, BLOOD, now + dur * 0.5);
          break;
        }
        case 'death':
          if (d.disband && this.visibleTo(d.unit.x, d.unit.y)) this.ghost(d.unit, now);
          break;
        case 'train':
          this.pops.push({ kind: 'spawn', unit: d.unit, t0: now, dur: this.dur(320) || 1 });
          break;
        case 'capture':
          if (this.visibleTo(d.city.x, d.city.y)) { this.ring(d.city.x, d.city.y, GOLD, now); this.float(d.city.x, d.city.y, d.from >= 0 ? 'Conquistada' : 'Cidade fundada', '#e6c886', now, 1.1); }
          break;
        case 'levelup':
          if (this.visibleTo(d.city.x, d.city.y)) this.float(d.city.x, d.city.y, 'Nível ' + roman(d.city.level), '#e6c886', now + 150, 1.1);
          break;
        case 'pop':
          if (d.city.owner === this.viewer) this.float(d.city.x, d.city.y, '+' + d.amount + ' pop.', '#b9d69a', now, 0.9);
          break;
        case 'build':
          if (this.visibleTo(d.tile.x, d.tile.y)) this.ring(d.tile.x, d.tile.y, '#b9d69a', now);
          break;
        case 'wonder':
          if (this.visibleTo(d.tile.x, d.tile.y)) { this.ring(d.tile.x, d.tile.y, GOLD, now); this.float(d.tile.x, d.tile.y, PP.WONDERS[d.wonder].name, '#e6c886', now, 1.05); }
          break;
        case 'heal':
          for (const h of d.units) if (h.amount > 0 && this.visibleTo(h.unit.x, h.unit.y)) this.float(h.unit.x, h.unit.y, '+' + h.amount, MOSS, now);
          break;
        case 'convert':
          if (this.visibleTo(d.target.x, d.target.y)) { this.float(d.target.x, d.target.y, 'Convertido', '#c9a6e0', now); this.ring(d.target.x, d.target.y, '#9f7fc0', now); }
          break;
        case 'promote':
          if (this.visibleTo(d.unit.x, d.unit.y)) this.float(d.unit.x, d.unit.y, PP.PROMOTIONS[d.promo].name, '#e6c886', now);
          break;
        case 'ruin':
          if (this.visibleTo(d.tile.x, d.tile.y)) this.ring(d.tile.x, d.tile.y, GOLD, now);
          break;
      }
    }

    ensureVisible(p) {
      if (!p) return;
      const s = this.tileScreen(p.x, p.y);
      const m = 80;
      if (s.x < m || s.y < m + 40 || s.x > this.w - m || s.y > this.h - m - 120) this.centerOn(p.x, p.y, true);
    }

    float(x, y, text, color, t0, scale) { this.floats.push({ x, y, text, color, t0, dur: 1200, scale: scale || 1 }); }
    ring(x, y, color, t0) { this.pops.push({ kind: 'ring', x, y, color, t0, dur: 650 }); }
    ghost(u, t0) { this.ghosts.push({ u: Object.assign({}, u), t0, dur: 500 }); }

    unitWorldPos(u, now) {
      for (const a of this.anims) {
        if (a.unit !== u) continue;
        const k = PP.clamp((now - a.t0) / a.dur, 0, 1);
        if (a.kind === 'move') {
          const seg = k * (a.pts.length - 1);
          const i = Math.min(a.pts.length - 2, Math.floor(seg));
          const f = seg - i;
          const p0 = this.tilePosW(a.pts[i]), p1 = this.tilePosW(a.pts[i + 1]);
          const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
          return { x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e - Math.sin(f * Math.PI) * 4 };
        }
        if (a.kind === 'lunge') {
          const p0 = this.tilePosW(a.from), p1 = this.tilePosW(a.to);
          const e = a.advanced ? (k < 0.5 ? k * 0.6 : 0.3 + (k - 0.5) * 1.4) : Math.sin(k * Math.PI) * 0.35;
          return { x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e };
        }
      }
      return this.tilePosW(u);
    }
    tilePosW(p) { const w = this.worldOf(p.x, p.y); const t = this.game.tile(p.x, p.y); return { x: w.x, y: w.y + this.topY(t) }; }

    // ---------------------------------------------------------- Laço
    frame() {
      const now = performance.now();
      if (this.camAnim) {
        const a = this.camAnim, k = PP.clamp((now - a.t0) / a.dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
        this.cam.x = a.fx + (a.tx - a.fx) * e; this.cam.y = a.fy + (a.ty - a.fy) * e;
        if (k >= 1) this.camAnim = null;
        this.dirty = true;
      }
      this.anims = this.anims.filter(a => now - a.t0 < a.dur);
      this.floats = this.floats.filter(f => now - f.t0 < f.dur);
      this.ghosts = this.ghosts.filter(f => now - f.t0 < f.dur);
      this.pops = this.pops.filter(f => now - f.t0 < f.dur);
      const animating = this.anims.length || this.floats.length || this.ghosts.length || this.pops.length || this.hl.selected;
      if (!this.dirty && !animating) return;
      this.dirty = false;
      this.draw(now);
    }

    draw(now) {
      const ctx = this.ctx, g = this.game;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = '#0d0c0b';
      ctx.fillRect(0, 0, this.w, this.h);
      if (!g) { this.drawVignette(ctx); return; }
      if (!this.patterns) this.buildPatterns();
      const z = this.cam.z;
      ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z, this.dpr * (this.w / 2 - this.cam.x * z), this.dpr * (this.h / 2 - this.cam.y * z));
      const w0 = this.toWorld(-TW * z, -TH * 3 * z), w1 = this.toWorld(this.w + TW * z, this.h + TH * 3 * z);
      const W = g.W, H = g.H;
      const detail = z > 0.32;
      const list = [];
      for (let s = 0; s <= W + H - 2; s++) {
        const cy = s * TH / 2;
        if (cy < w0.y - TH * 2 || cy > w1.y + TH * 2) continue;
        for (let x = Math.max(0, s - H + 1); x <= Math.min(W - 1, s); x++) {
          const y = s - x;
          const cx = (x - y) * TW / 2;
          if (cx < w0.x - TW || cx > w1.x + TW) continue;
          list.push(g.tiles[y * W + x]);
        }
      }
      for (const t of list) this.drawTile(ctx, t, detail);
      this.drawHighlights(ctx, now);
      const units = [];
      for (const u of g.units) {
        if (u.owner !== this.viewer && !this.visibleTo(u.x, u.y) && !this.anims.some(a => a.unit === u)) continue;
        units.push(u);
      }
      units.sort((a, b) => (a.x + a.y) - (b.x + b.y));
      for (const u of units) this.drawUnit(ctx, u, now);
      for (const gh of this.ghosts) {
        if (now < gh.t0) { this.drawUnit(ctx, gh.u, now, 1, true); continue; }
        this.drawUnit(ctx, gh.u, now, 1 - PP.clamp((now - gh.t0) / gh.dur, 0, 1), true);
      }
      this.drawAttackMarks(ctx, now);
      if (z > 0.26) for (const t of list) if (t.city && this.exploredBy(t.y * W + t.x)) this.drawCityLabel(ctx, g.cityMap[t.city]);
      for (const p of this.pops) {
        if (p.kind !== 'ring' || now < p.t0) continue;
        const k = (now - p.t0) / p.dur, c = this.tilePosW(p);
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.strokeStyle = p.color; ctx.lineWidth = 3 * (1 - k) + 1;
        diamond(ctx, c.x, c.y, 0.55 + k * 0.55);
        ctx.stroke();
        ctx.restore();
      }
      for (const f of this.floats) {
        if (now < f.t0) continue;
        const k = (now - f.t0) / f.dur, c = this.tilePosW(f);
        ctx.save();
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        ctx.font = `700 ${Math.round(17 * f.scale)}px ${FONT_D}`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,8,6,0.85)'; ctx.lineJoin = 'round';
        const y = c.y - 44 - k * 30;
        ctx.strokeText(f.text, c.x, y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, c.x, y);
        ctx.restore();
      }
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawVignette(ctx);
    }

    drawVignette(ctx) {
      if (!this.vignette) {
        const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.hypot(this.w, this.h) * 0.62);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.55)');
        this.vignette = g;
      }
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // ---------------------------------------------------------- Texturas procedurais
    buildPatterns() {
      const rng = new PP.RNG(9173);
      const make = (paint) => {
        const S = 128;
        const c = makeCanvas(S, S);
        const x = c.getContext('2d');
        paint(x, S, rng);
        const p = this.ctx.createPattern(c, 'repeat');
        if (p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().scale(0.5));
        return p;
      };
      const specks = (x, S, r, n, cols, rmin, rmax) => {
        for (let i = 0; i < n; i++) {
          x.fillStyle = cols[r.int(cols.length)];
          x.beginPath(); x.arc(r.next() * S, r.next() * S, rmin + r.next() * (rmax - rmin), 0, Math.PI * 2); x.fill();
        }
      };
      const strokes = (x, S, r, n, cols, len, wid) => {
        x.lineCap = 'round';
        for (let i = 0; i < n; i++) {
          const px = r.next() * S, py = r.next() * S, a = -Math.PI / 2 + (r.next() - 0.5) * 0.9;
          x.strokeStyle = cols[r.int(cols.length)]; x.lineWidth = wid;
          x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke();
        }
      };
      this.patterns = {
        plains: make((x, S, r) => { specks(x, S, r, 160, ['rgba(0,0,0,0.10)', 'rgba(255,240,200,0.06)'], 0.6, 1.8); strokes(x, S, r, 90, ['rgba(20,26,8,0.22)', 'rgba(200,190,120,0.10)'], 5, 1.2); }),
        forest: make((x, S, r) => { specks(x, S, r, 240, ['rgba(0,0,0,0.16)', 'rgba(90,70,40,0.14)', 'rgba(160,160,90,0.05)'], 0.8, 2.4); }),
        hills: make((x, S, r) => { specks(x, S, r, 120, ['rgba(0,0,0,0.12)', 'rgba(255,240,210,0.07)'], 0.8, 2.6); strokes(x, S, r, 40, ['rgba(20,20,8,0.18)'], 4, 1.1); }),
        mountain: make((x, S, r) => {
          specks(x, S, r, 200, ['rgba(0,0,0,0.16)', 'rgba(255,255,255,0.06)'], 0.6, 2);
          x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 1;
          for (let i = 0; i < 14; i++) { let px = r.next() * S, py = r.next() * S; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (r.next() - 0.5) * 14; py += r.next() * 8; x.lineTo(px, py); } x.stroke(); }
        }),
        desert: make((x, S, r) => {
          x.strokeStyle = 'rgba(90,60,20,0.16)'; x.lineWidth = 1.4;
          for (let i = 0; i < 12; i++) { const y0 = r.next() * S, ph = r.next() * 6; x.beginPath(); for (let k = 0; k <= S; k += 4) x.lineTo(k, y0 + Math.sin(k / 9 + ph) * 3); x.stroke(); }
          specks(x, S, r, 120, ['rgba(60,40,10,0.14)', 'rgba(255,245,220,0.10)'], 0.5, 1.4);
        }),
        tundra: make((x, S, r) => { specks(x, S, r, 110, ['rgba(235,238,235,0.13)', 'rgba(30,38,38,0.16)'], 0.6, 2.2); }),
        swamp: make((x, S, r) => { specks(x, S, r, 90, ['rgba(10,20,10,0.22)', 'rgba(60,80,40,0.18)'], 1.5, 4); strokes(x, S, r, 50, ['rgba(20,30,10,0.3)'], 6, 1); }),
        water: make((x, S, r) => { x.strokeStyle = 'rgba(210,225,220,0.07)'; x.lineWidth = 1.2; for (let i = 0; i < 26; i++) { const px = r.next() * S, py = r.next() * S; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + 5, py - 2, px + 10, py); x.stroke(); } }),
        ocean: make((x, S, r) => { x.strokeStyle = 'rgba(180,200,200,0.05)'; x.lineWidth = 1.2; for (let i = 0; i < 20; i++) { const px = r.next() * S, py = r.next() * S; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + 6, py - 2, px + 12, py); x.stroke(); } specks(x, S, r, 40, ['rgba(0,0,0,0.10)'], 2, 6); }),
        fog: make((x, S, r) => { specks(x, S, r, 70, ['rgba(60,54,48,0.10)', 'rgba(0,0,0,0.18)'], 4, 12); }),
      };
      // luz sobre o topo das casas (esquerda-cima clara, direita-baixo escura)
      this.topLight = makeSprite(TW, TH, TW / 2, TH / 2, x => {
        const gr = x.createLinearGradient(-TW / 3, -TH / 2, TW / 3, TH / 2);
        gr.addColorStop(0, 'rgba(255,236,200,0.10)');
        gr.addColorStop(0.55, 'rgba(0,0,0,0)');
        gr.addColorStop(1, 'rgba(0,0,0,0.16)');
        diamond(x, 0, 0); x.fillStyle = gr; x.fill();
      });
      this.cloud = makeSprite(80, 44, 40, 22, x => {
        const gr = x.createRadialGradient(0, 0, 2, 0, 0, 38);
        gr.addColorStop(0, 'rgba(58,52,46,0.55)');
        gr.addColorStop(1, 'rgba(58,52,46,0)');
        x.fillStyle = gr; x.scale(1, 0.55); x.beginPath(); x.arc(0, 0, 38, 0, Math.PI * 2); x.fill();
      });
    }

    // ---------------------------------------------------------- Terreno
    landColor(t) {
      const tr = PP.TRIBES[t.biome];
      const base = GROUND[t.terrain];
      const amt = t.terrain === 'mountain' ? 0.08 : t.terrain === 'desert' || t.terrain === 'tundra' ? 0.12 : 0.22;
      const c = tr ? mix(base, tr.tint, amt) : base;
      return shade(c, 0.94 + Math.floor(hash(t.x, t.y, 1) * 3) * 0.04);
    }

    drawTile(ctx, t, detail) {
      const g = this.game;
      const i = t.y * g.W + t.x;
      const c = this.worldOf(t.x, t.y);
      if (!this.exploredBy(i)) {
        diamond(ctx, c.x, c.y + 4);
        ctx.fillStyle = '#131110'; ctx.fill();
        ctx.fillStyle = this.patterns.fog; ctx.fill();
        if (detail && hash(t.x, t.y, 9) < 0.55) blit(ctx, this.cloud, c.x + (hash(t.x, t.y, 4) - 0.5) * 30, c.y + (hash(t.x, t.y, 5) - 0.5) * 10);
        return;
      }
      const water = TER[t.terrain].water;
      const top = c.y + this.topY(t);
      if (water) {
        diamond(ctx, c.x, top);
        ctx.fillStyle = GROUND[t.terrain]; ctx.fill();
        ctx.fillStyle = this.patterns[t.terrain]; ctx.fill();
        if (detail) this.drawShore(ctx, t, c.x, top);
      } else {
        const col = this.landColor(t);
        ctx.fillStyle = shade(col, 0.62);
        ctx.beginPath(); ctx.moveTo(c.x - TW / 2, top); ctx.lineTo(c.x, top + TH / 2); ctx.lineTo(c.x, top + TH / 2 + LH); ctx.lineTo(c.x - TW / 2, top + LH); ctx.closePath(); ctx.fill();
        ctx.fillStyle = shade(col, 0.42);
        ctx.beginPath(); ctx.moveTo(c.x + TW / 2, top); ctx.lineTo(c.x, top + TH / 2); ctx.lineTo(c.x, top + TH / 2 + LH); ctx.lineTo(c.x + TW / 2, top + LH); ctx.closePath(); ctx.fill();
        diamond(ctx, c.x, top);
        ctx.fillStyle = col; ctx.fill();
        ctx.fillStyle = this.patterns[t.terrain]; ctx.fill();
        blit(ctx, this.topLight, c.x, top);
        if (detail) { diamond(ctx, c.x, top); ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1; ctx.stroke(); }
      }
      if (t.owner >= 0) this.drawTerritory(ctx, t, c.x, top);
      if (t.road) this.drawRoad(ctx, t, c.x, top);
      if (detail) this.drawFeature(ctx, t, c.x, top);
      else if (t.city || t.village) this.drawSettlement(ctx, t, c.x, top);
      if (t.res && !t.city && detail) {
        const s = this.resSprite(t.res);
        blit(ctx, s, c.x + (t.terrain === 'mountain' ? 16 : 0), top - (t.terrain === 'forest' ? 2 : 0));
      }
      if (!this.visibleTo(t.x, t.y)) {
        diamond(ctx, c.x, top);
        ctx.fillStyle = 'rgba(12,10,9,0.5)'; ctx.fill();
      }
    }

    drawShore(ctx, t, cx, top) {
      const g = this.game;
      const edges = [[0, -1, [0, -1], [1, 0]], [1, 0, [1, 0], [0, 1]], [0, 1, [0, 1], [-1, 0]], [-1, 0, [-1, 0], [0, -1]]];
      ctx.lineCap = 'round';
      for (const e of edges) {
        const n = g.tile(t.x + e[0], t.y + e[1]);
        if (!n || TER[n.terrain].water) continue;
        const a = e[2], b = e[3];
        ctx.strokeStyle = 'rgba(210,205,190,0.22)'; ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(cx + a[0] * TW / 2 * 0.84, top + a[1] * TH / 2 * 0.84);
        ctx.lineTo(cx + b[0] * TW / 2 * 0.84, top + b[1] * TH / 2 * 0.84);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx + a[0] * TW / 2, top + a[1] * TH / 2);
        ctx.lineTo(cx + b[0] * TW / 2, top + b[1] * TH / 2);
        ctx.stroke();
      }
    }

    drawTerritory(ctx, t, cx, top) {
      const g = this.game;
      const col = g.players[t.owner].color;
      diamond(ctx, cx, top);
      ctx.fillStyle = rgba(col, 0.11);
      ctx.fill();
      const edges = [[0, -1, [0, -1], [1, 0]], [1, 0, [1, 0], [0, 1]], [0, 1, [0, 1], [-1, 0]], [-1, 0, [-1, 0], [0, -1]]];
      ctx.lineCap = 'round';
      for (const e of edges) {
        const n = g.tile(t.x + e[0], t.y + e[1]);
        if (n && n.owner === t.owner) continue;
        const a = e[2], b = e[3], k = 0.88;
        const x1 = cx + a[0] * TW / 2 * k, y1 = top + a[1] * TH / 2 * k, x2 = cx + b[0] * TW / 2 * k, y2 = top + b[1] * TH / 2 * k;
        ctx.strokeStyle = 'rgba(8,6,5,0.6)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }

    drawRoad(ctx, t, cx, top) {
      const g = this.game;
      const c = this.worldOf(t.x, t.y);
      const segs = [];
      for (const d of PP.DIRS) {
        const n = g.tile(t.x + d[0], t.y + d[1]);
        if (!n || !(n.road || n.city)) continue;
        const w = this.worldOf(n.x, n.y);
        segs.push([(w.x - c.x) / 2, (w.y - c.y) / 2]);
      }
      ctx.lineCap = 'round';
      for (const [col, wid] of [['#3b3024', 7], ['#8a7757', 4.5]]) {
        ctx.strokeStyle = col; ctx.lineWidth = wid;
        if (!segs.length) { ctx.beginPath(); ctx.moveTo(cx - 6, top); ctx.lineTo(cx + 6, top); ctx.stroke(); }
        for (const s of segs) { ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx + s[0], top + s[1]); ctx.stroke(); }
      }
    }

    // ---------------------------------------------------------- Vegetação e relevo (sprites)
    featureSprite(t) {
      const variant = Math.floor(hash(t.x, t.y, 3) * 3);
      const style = TREES[t.biome] || 'pine';
      const key = 'f|' + t.terrain + '|' + variant + '|' + (t.terrain === 'forest' || t.terrain === 'mountain' ? style : '');
      let s = this.sprites.get(key);
      if (s) return s;
      const r = new PP.RNG(1 + variant * 977 + t.terrain.length * 31);
      s = makeSprite(TW + 8, 110, TW / 2 + 4, 90, x => this.paintFeature(x, t.terrain, style, variant, r));
      this.sprites.set(key, s);
      return s;
    }

    paintFeature(x, terrain, style, variant, r) {
      const tree = (px, py, sc) => {
        const st = style === 'mixed' ? (r.next() < 0.5 ? 'pine' : 'broad') : style;
        x.fillStyle = 'rgba(0,0,0,0.28)';
        x.beginPath(); x.ellipse(px + 3 * sc, py + 1, 8 * sc, 3 * sc, 0, 0, Math.PI * 2); x.fill();
        if (st === 'pine' || st === 'snow') {
          x.fillStyle = '#3a2c1f'; x.fillRect(px - 1.2 * sc, py - 4 * sc, 2.4 * sc, 5 * sc);
          for (let k = 0; k < 3; k++) {
            const y0 = py - 3 * sc - k * 7 * sc, w = (10 - k * 2.6) * sc;
            x.fillStyle = '#1f2a1d';
            x.beginPath(); x.moveTo(px, y0 - 11 * sc); x.lineTo(px + w, y0); x.lineTo(px - w, y0); x.closePath(); x.fill();
            x.fillStyle = '#34452d';
            x.beginPath(); x.moveTo(px, y0 - 11 * sc); x.lineTo(px - w, y0); x.lineTo(px - w * 0.2, y0 - 1.5 * sc); x.closePath(); x.fill();
            if (st === 'snow') { x.fillStyle = 'rgba(225,228,224,0.75)'; x.beginPath(); x.moveTo(px, y0 - 11 * sc); x.lineTo(px - w * 0.45, y0 - 5 * sc); x.lineTo(px + w * 0.2, y0 - 6 * sc); x.closePath(); x.fill(); }
          }
        } else if (st === 'broad') {
          x.fillStyle = '#3a2c1f'; x.fillRect(px - 1.4 * sc, py - 8 * sc, 2.8 * sc, 9 * sc);
          const blobs = [[0, -16, 9], [-6, -12, 7], [6, -12, 7], [0, -9, 7]];
          for (const b of blobs) { x.fillStyle = '#233220'; x.beginPath(); x.arc(px + b[0] * sc, py + b[1] * sc, b[2] * sc, 0, Math.PI * 2); x.fill(); }
          x.fillStyle = '#3a4d30';
          x.beginPath(); x.arc(px - 3 * sc, py - 17 * sc, 5 * sc, 0, Math.PI * 2); x.fill();
        } else if (st === 'acacia') {
          x.strokeStyle = '#3a2c1f'; x.lineWidth = 1.6 * sc;
          x.beginPath(); x.moveTo(px, py); x.lineTo(px, py - 9 * sc); x.lineTo(px - 5 * sc, py - 15 * sc); x.moveTo(px, py - 9 * sc); x.lineTo(px + 6 * sc, py - 15 * sc); x.stroke();
          x.fillStyle = '#2e3a22';
          x.beginPath(); x.ellipse(px, py - 17 * sc, 13 * sc, 4 * sc, 0, 0, Math.PI * 2); x.fill();
          x.fillStyle = '#48562f';
          x.beginPath(); x.ellipse(px - 3 * sc, py - 18.5 * sc, 8 * sc, 2.2 * sc, 0, 0, Math.PI * 2); x.fill();
        } else { // dry: arbusto seco
          x.strokeStyle = '#4a3b27'; x.lineWidth = 1.3 * sc;
          for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.35; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * 11 * sc, py + Math.sin(a) * 11 * sc); x.stroke(); }
          x.fillStyle = '#56603a'; x.beginPath(); x.ellipse(px, py - 9 * sc, 7 * sc, 4 * sc, 0, 0, Math.PI * 2); x.fill();
        }
      };
      switch (terrain) {
        case 'forest': {
          const spots = [[-20, -2], [4, -9], [18, 3], [-6, 8], [-2, -1], [12, -3]];
          const n = style === 'dry' ? 3 : style === 'acacia' ? 3 : 5 + (variant === 2 ? 1 : 0);
          const pts = spots.slice(0, n).map(p => [p[0] + (r.next() - 0.5) * 6, p[1] + (r.next() - 0.5) * 4]).sort((a, b) => a[1] - b[1]);
          for (const p of pts) tree(p[0], p[1], 0.85 + r.next() * 0.3);
          break;
        }
        case 'mountain': {
          const peaks = variant === 0 ? [[-6, 44, 26]] : variant === 1 ? [[-10, 40, 22], [14, 28, 18]] : [[4, 46, 24], [-18, 26, 15]];
          peaks.sort((a, b) => a[1] - b[1]);
          x.fillStyle = 'rgba(0,0,0,0.3)';
          x.beginPath(); x.ellipse(4, 6, 34, 9, 0, 0, Math.PI * 2); x.fill();
          for (const [px, h, w] of peaks) {
            const tipX = px + (r.next() - 0.5) * 6;
            x.fillStyle = '#7d786f';
            x.beginPath(); x.moveTo(px - w, 6); x.lineTo(tipX - 4, -h * 0.55); x.lineTo(tipX, -h); x.lineTo(tipX + 2, 8); x.closePath(); x.fill();
            x.fillStyle = '#48443f';
            x.beginPath(); x.moveTo(tipX, -h); x.lineTo(tipX + w * 0.45, -h * 0.4); x.lineTo(px + w, 6); x.lineTo(tipX + 2, 8); x.closePath(); x.fill();
            x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 1;
            x.beginPath(); x.moveTo(tipX - 3, -h * 0.7); x.lineTo(tipX - 8, -h * 0.35); x.lineTo(tipX - 5, -h * 0.1); x.stroke();
            if (h > 30 || style === 'snow' || style === 'pine') {
              x.fillStyle = '#d6d2c8';
              x.beginPath(); x.moveTo(tipX, -h); x.lineTo(tipX - 7, -h * 0.72); x.lineTo(tipX - 2, -h * 0.76); x.lineTo(tipX + 3, -h * 0.68); x.lineTo(tipX + 6, -h * 0.8); x.closePath(); x.fill();
            }
          }
          x.fillStyle = '#5a554e';
          for (let k = 0; k < 4; k++) { x.beginPath(); x.ellipse(-22 + k * 13 + r.next() * 5, 8 + r.next() * 4, 3, 1.8, 0, 0, Math.PI * 2); x.fill(); }
          break;
        }
        case 'hills': {
          const col = '#76704f';
          const mound = (px, py, w, h, c) => {
            const gr = x.createLinearGradient(px - w, py - h, px + w, py);
            gr.addColorStop(0, shade(c, 1.12)); gr.addColorStop(1, shade(c, 0.72));
            x.fillStyle = gr;
            x.beginPath(); x.moveTo(px - w, py); x.quadraticCurveTo(px - w * 0.4, py - h * 1.3, px + w * 0.2, py - h); x.quadraticCurveTo(px + w * 0.8, py - h * 0.6, px + w, py); x.closePath(); x.fill();
          };
          mound(-10, 2, 20, 14, col);
          mound(12, 8, 16, 10, shade(col, 0.95));
          x.fillStyle = '#5b5646';
          x.beginPath(); x.ellipse(-2 + variant * 5, 10, 3, 1.8, 0, 0, Math.PI * 2); x.fill();
          break;
        }
        case 'desert': {
          x.strokeStyle = 'rgba(70,50,20,0.35)'; x.lineWidth = 1.5;
          x.beginPath(); x.moveTo(-26, 4); x.quadraticCurveTo(-10, -6, 6, 3); x.stroke();
          x.strokeStyle = 'rgba(255,240,210,0.22)';
          x.beginPath(); x.moveTo(-24, 2); x.quadraticCurveTo(-10, -8, 4, 1); x.stroke();
          if (variant === 1) { x.strokeStyle = '#4a3b27'; x.lineWidth = 1.2; for (let k = 0; k < 4; k++) { const a = -Math.PI / 2 + (k - 1.5) * 0.4; x.beginPath(); x.moveTo(14, 4); x.lineTo(14 + Math.cos(a) * 9, 4 + Math.sin(a) * 9); x.stroke(); } }
          if (variant === 2) { x.fillStyle = '#6d6553'; x.beginPath(); x.ellipse(16, 2, 6, 3.5, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#8d8571'; x.beginPath(); x.ellipse(15, 1, 4, 2, 0, 0, Math.PI * 2); x.fill(); }
          break;
        }
        case 'tundra': {
          x.fillStyle = 'rgba(220,224,220,0.36)';
          x.beginPath(); x.ellipse(-12 + variant * 8, 3, 11, 3.5, 0, 0, Math.PI * 2); x.fill();
          x.fillStyle = '#5f6663'; x.beginPath(); x.ellipse(14, 0, 5, 3, 0, 0, Math.PI * 2); x.fill();
          x.fillStyle = '#7d8581'; x.beginPath(); x.ellipse(13, -1, 3, 1.6, 0, 0, Math.PI * 2); x.fill();
          break;
        }
        case 'swamp': {
          x.fillStyle = 'rgba(18,30,28,0.8)';
          x.beginPath(); x.ellipse(-8, 3, 14, 5, 0, 0, Math.PI * 2); x.fill();
          x.beginPath(); x.ellipse(15, -3, 8, 3, 0, 0, Math.PI * 2); x.fill();
          x.fillStyle = 'rgba(170,180,160,0.12)';
          x.beginPath(); x.ellipse(-11, 2, 6, 1.4, 0, 0, Math.PI * 2); x.fill();
          x.strokeStyle = '#3d4526'; x.lineWidth = 1.2;
          for (let k = 0; k < 5; k++) { x.beginPath(); x.moveTo(2 + k * 2.5, 9); x.lineTo(k * 3 - 1, -6 - r.next() * 4); x.stroke(); }
          if (variant === 2) { x.strokeStyle = '#2a2219'; x.lineWidth = 2; x.beginPath(); x.moveTo(-20, 6); x.lineTo(-19, -14); x.lineTo(-24, -20); x.moveTo(-19, -10); x.lineTo(-13, -16); x.stroke(); }
          break;
        }
        case 'plains': {
          if (variant === 0) return;
          x.strokeStyle = 'rgba(28,32,12,0.4)'; x.lineWidth = 1.1;
          const bx = variant === 1 ? -14 : 10;
          for (let k = 0; k < 5; k++) { x.beginPath(); x.moveTo(bx + k * 2, 5); x.lineTo(bx + k * 2.6 - 3, -3 - r.next() * 3); x.stroke(); }
          if (variant === 2) { x.fillStyle = '#5b5a4a'; x.beginPath(); x.ellipse(-14, 4, 4, 2.4, 0, 0, Math.PI * 2); x.fill(); }
          break;
        }
      }
    }

    // Recursos: silhueta clara com sombra, sobre uma pequena marca no chão
    resSprite(res) {
      const key = 'r|' + res;
      let s = this.sprites.get(key);
      if (s) return s;
      s = makeSprite(40, 40, 20, 26, x => {
        x.fillStyle = 'rgba(10,8,6,0.35)';
        x.beginPath(); x.ellipse(0, 4, 13, 4.5, 0, 0, Math.PI * 2); x.fill();
        const col = { fruit: '#b9a2c4', crop: '#e0c783', game: '#d9c3a0', fish: '#c9d6d6', whale: '#b7c3c6', ore: '#c79a74', horses: '#dcc9ad', gems: '#a8d4d0', spices: '#d48a6a' }[res] || BONE;
        drawIcon(x, 'r_' + res, 0, -8, 24, col, 'rgba(10,8,6,0.7)');
      });
      this.sprites.set(key, s);
      return s;
    }

    drawFeature(ctx, t, cx, top) {
      if (t.city || t.village) { this.drawSettlement(ctx, t, cx, top); return; }
      if (t.wonder) { this.drawWonder(ctx, t, cx, top); return; }
      const hasFeat = t.terrain !== 'plains' || hash(t.x, t.y, 3) >= 1 / 3;
      if (t.imp) {
        if (t.terrain === 'mountain' || (t.terrain === 'forest' && t.imp !== 'lumber')) blit(ctx, this.featureSprite(t), cx, top);
        this.drawImprovement(ctx, t, cx, top);
      } else if (hasFeat && !(t.res && t.terrain === 'plains')) {
        blit(ctx, this.featureSprite(t), cx, top);
      }
      if (t.ruin) this.drawRuin(ctx, cx, top);
    }

    // ---------------------------------------------------------- Construções
    drawHouse(ctx, x, y, s, o) {
      o = o || {};
      const w = 10 * s, d = 5 * s, hgt = (o.tall ? 17 : 9) * s;
      const wall = o.wall || '#8e8676', roof = o.roof || '#3b3733';
      ctx.fillStyle = shade(wall, 0.95);
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x, y + d); ctx.lineTo(x, y + d - hgt); ctx.lineTo(x - w, y - hgt); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(wall, 0.62);
      ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x, y + d); ctx.lineTo(x, y + d - hgt); ctx.lineTo(x + w, y - hgt); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(20,14,8,0.8)';
      ctx.fillRect(x - w * 0.55, y - hgt * 0.55, 2.2 * s, 3.2 * s);
      if (o.flat) {
        ctx.fillStyle = shade(wall, 1.05);
        ctx.beginPath(); ctx.moveTo(x - w, y - hgt); ctx.lineTo(x, y - hgt + d); ctx.lineTo(x + w, y - hgt); ctx.lineTo(x, y - hgt - d); ctx.closePath(); ctx.fill();
        ctx.fillStyle = shade(wall, 0.8);
        for (let k = -2; k <= 2; k += 2) ctx.fillRect(x + k * w * 0.4 - 1.2 * s, y - hgt - d * 0.4 - 3 * s + Math.abs(k) * 0.9 * s, 2.4 * s, 3 * s);
        return;
      }
      const ry = y - hgt;
      ctx.fillStyle = roof;
      ctx.beginPath(); ctx.moveTo(x - w - 1.5 * s, ry); ctx.lineTo(x, ry + d + 1 * s); ctx.lineTo(x, ry - 8 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(roof, 0.7);
      ctx.beginPath(); ctx.moveTo(x + w + 1.5 * s, ry); ctx.lineTo(x, ry + d + 1 * s); ctx.lineTo(x, ry - 8 * s); ctx.closePath(); ctx.fill();
    }

    banner(ctx, x, y, h, color) {
      ctx.strokeStyle = '#2a241d'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + 11, y - h); ctx.lineTo(x + 11, y - h + 10); ctx.lineTo(x + 5.5, y - h + 7); ctx.lineTo(x, y - h + 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 6, y - h, 5, 10);
      ctx.fillStyle = GOLD; ctx.fillRect(x, y - h, 11, 1.2);
    }

    citySprite(c) {
      const g = this.game;
      const tribe = g.players[c.owner].tribe;
      const L = Math.min(c.level, 8);
      const key = `c|${tribe}|${L}|${c.capital ? 1 : 0}|${c.buildings.walls ? 1 : 0}`;
      let s = this.sprites.get(key);
      if (s) return s;
      const tr = PP.TRIBES[tribe];
      s = makeSprite(TW + 10, 120, TW / 2 + 5, 90, x => {
        if (c.buildings.walls) {
          x.strokeStyle = '#3e3a34'; x.lineWidth = 6;
          diamond(x, 0, 2, 0.84); x.stroke();
          x.strokeStyle = '#7a7368'; x.lineWidth = 3;
          diamond(x, 0, -1, 0.84); x.stroke();
          x.fillStyle = '#8f887c';
          for (let k = 0; k < 16; k++) {
            const a = k / 16;
            const px = a < 0.25 ? a * 4 : a < 0.5 ? 1 - (a - 0.25) * 4 : a < 0.75 ? -(a - 0.5) * 4 : -1 + (a - 0.75) * 4;
            const py = a < 0.25 ? -1 + a * 4 : a < 0.5 ? (a - 0.25) * 4 : a < 0.75 ? 1 - (a - 0.5) * 4 : -(a - 0.75) * 4;
            x.fillRect(px * TW / 2 * 0.84 - 1.5, py * TH / 2 * 0.84 - 5, 3, 3.5);
          }
        }
        const spots = [[-15, 4], [15, 4], [-7, 12], [9, -9], [-12, -7], [20, -3], [1, 14]];
        const n = Math.min(spots.length, Math.floor((L + 1) / 1.4));
        const houses = spots.slice(0, n).concat(c.capital ? [] : [[0, -1, 1.15]]).sort((a, b) => a[1] - b[1]);
        const roofs = ['#3b3733', '#4a3a2c', '#3a3f45'];
        for (const h of houses) this.drawHouse(x, h[0], h[1], h[2] || 0.85, { roof: roofs[Math.abs(h[0]) % 3] });
        if (c.capital) {
          this.drawHouse(x, 0, 0, 1.15, { tall: true, flat: true, wall: '#9a9282' });
          this.drawHouse(x, 0, -21, 0.75, { tall: true, flat: true, wall: '#a39b8b' });
          this.banner(x, 1, -44, 16, tr.color);
        } else {
          this.banner(x, 12, -8, 18, tr.color);
        }
      });
      this.sprites.set(key, s);
      return s;
    }

    drawSettlement(ctx, t, cx, top) {
      if (t.village) {
        let s = this.sprites.get('village');
        if (!s) {
          s = makeSprite(TW, 100, TW / 2, 80, x => {
            const thatch = { wall: '#5f503d', roof: '#7a6440' };
            this.drawHouse(x, -12, -2, 0.95, thatch);
            this.drawHouse(x, 11, 5, 0.85, thatch);
            this.drawHouse(x, -2, 10, 0.7, thatch);
            x.fillStyle = 'rgba(150,140,125,0.25)';
            for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(-10 + k * 3, -22 - k * 7, 3 + k * 1.3, 0, Math.PI * 2); x.fill(); }
          });
          this.sprites.set('village', s);
        }
        blit(ctx, s, cx, top);
        return;
      }
      blit(ctx, this.citySprite(this.game.cityMap[t.city]), cx, top);
    }

    drawRuin(ctx, cx, top) {
      let s = this.sprites.get('ruin');
      if (!s) {
        s = makeSprite(60, 60, 30, 44, x => {
          x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.ellipse(0, 4, 20, 6, 0, 0, Math.PI * 2); x.fill();
          const col = (px, h) => { x.fillStyle = '#8a8479'; x.fillRect(px - 3, -h, 6, h + 2); x.fillStyle = '#5f5a51'; x.fillRect(px + 1, -h, 2, h + 2); x.fillStyle = '#a19b8f'; x.fillRect(px - 4, -h - 2, 8, 2.5); };
          col(-10, 20); col(9, 12);
          x.fillStyle = '#6f6a60';
          x.beginPath(); x.ellipse(-1, 4, 7, 2.5, 0.2, 0, Math.PI * 2); x.fill();
          x.fillRect(2, -1, 9, 3);
          x.fillStyle = '#e6c886'; x.font = `700 11px ${FONT_D}`; x.textAlign = 'center';
          x.fillText('?', 0, -6);
        });
        this.sprites.set('ruin', s);
      }
      blit(ctx, s, cx, top);
    }

    drawWonder(ctx, t, cx, top) {
      const key = 'w|' + t.wonder;
      let s = this.sprites.get(key);
      if (!s) {
        s = makeSprite(80, 100, 40, 76, x => {
          x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(0, 6, 26, 9, 0, 0, Math.PI * 2); x.fill();
          x.fillStyle = '#6d675c'; x.beginPath(); x.ellipse(0, 4, 24, 9, 0, 0, Math.PI); x.fill();
          x.fillStyle = '#9d9585'; x.beginPath(); x.ellipse(0, 0, 24, 9, 0, 0, Math.PI * 2); x.fill();
          drawIcon(x, 'w_' + t.wonder, 0, -24, 46, '#d9cfb8', 'rgba(10,8,6,0.75)');
        });
        this.sprites.set(key, s);
      }
      blit(ctx, s, cx, top);
    }

    drawImprovement(ctx, t, cx, top) {
      const imp = t.imp;
      if (imp === 'farm' || imp === 'plantation') {
        ctx.save();
        diamond(ctx, cx, top, 0.8); ctx.clip();
        ctx.fillStyle = imp === 'farm' ? 'rgba(120,96,50,0.55)' : 'rgba(40,60,30,0.5)'; ctx.fill();
        ctx.strokeStyle = imp === 'farm' ? '#b39a5a' : '#3f5a2c'; ctx.lineWidth = 3;
        for (let k = -5; k <= 5; k++) { ctx.beginPath(); ctx.moveTo(cx + k * 9 - 30, top - 20); ctx.lineTo(cx + k * 9 + 30, top + 20); ctx.stroke(); }
        if (imp === 'plantation') { ctx.fillStyle = '#9e3b26'; for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.arc(cx + k * 8, top + (k % 2) * 4, 1.8, 0, Math.PI * 2); ctx.fill(); } }
        ctx.restore();
        if (imp === 'farm') {
          ctx.fillStyle = '#8e7640'; ctx.beginPath(); ctx.ellipse(cx + 14, top - 2, 6, 5, 0, Math.PI, 0); ctx.fill();
          ctx.fillStyle = '#6e5a30'; ctx.fillRect(cx + 8, top - 2, 12, 2);
        }
        return;
      }
      if (imp === 'port') {
        ctx.fillStyle = '#3d2e20';
        ctx.beginPath(); ctx.moveTo(cx - 22, top + 1); ctx.lineTo(cx, top + 12); ctx.lineTo(cx + 22, top + 1); ctx.lineTo(cx, top - 10); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#6b5236';
        ctx.beginPath(); ctx.moveTo(cx - 22, top - 1); ctx.lineTo(cx, top + 10); ctx.lineTo(cx + 22, top - 1); ctx.lineTo(cx, top - 12); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(30,20,12,0.6)'; ctx.lineWidth = 1;
        for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(cx + k * 6 - 9, top - 5 + k * 3); ctx.lineTo(cx + k * 6 + 9, top + 4 + k * 3); ctx.stroke(); }
        ctx.fillStyle = '#2a2119';
        for (const [dx, dy] of [[-20, 0], [20, 0], [0, 11]]) ctx.fillRect(cx + dx - 1.5, top + dy - 9, 3, 10);
        drawIcon(ctx, 'i_port', cx, top - 12, 18, BONE, 'rgba(10,8,6,0.7)');
        return;
      }
      if (imp === 'pasture') {
        ctx.strokeStyle = '#4a3a28'; ctx.lineWidth = 2;
        diamond(ctx, cx, top, 0.62); ctx.stroke();
        ctx.strokeStyle = '#7a6446'; ctx.lineWidth = 1;
        diamond(ctx, cx, top - 3, 0.62); ctx.stroke();
        drawIcon(ctx, 'r_horses', cx, top - 8, 22, '#cdb99a', 'rgba(10,8,6,0.7)');
        return;
      }
      if (imp === 'mine' || imp === 'gemmine') {
        ctx.fillStyle = '#1b1612';
        ctx.beginPath(); ctx.moveTo(cx - 16, top + 6); ctx.lineTo(cx - 16, top - 4); ctx.quadraticCurveTo(cx - 8, top - 14, cx, top - 4); ctx.lineTo(cx, top + 6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#6b5236'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(cx - 17, top + 6); ctx.lineTo(cx - 17, top - 6); ctx.lineTo(cx + 1, top - 6); ctx.lineTo(cx + 1, top + 6); ctx.stroke();
        drawIcon(ctx, imp === 'mine' ? 'i_mine' : 'r_gems', cx + 12, top - 2, 16, imp === 'mine' ? '#b8a58a' : '#a8d4d0', 'rgba(10,8,6,0.7)');
        return;
      }
      if (imp === 'windmill') {
        this.drawHouse(ctx, cx, top + 2, 0.85, { tall: true, wall: '#8e8676', roof: '#4a3a2c' });
        ctx.strokeStyle = '#d6cdb8'; ctx.lineWidth = 2.2;
        for (let k = 0; k < 4; k++) {
          const an = 0.35 + k * Math.PI / 2;
          ctx.beginPath(); ctx.moveTo(cx, top - 16); ctx.lineTo(cx + Math.cos(an) * 15, top - 16 + Math.sin(an) * 15); ctx.stroke();
        }
        return;
      }
      if (imp === 'lumber') {
        ctx.fillStyle = '#5a4430';
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(cx + 12, top + 4 - k * 3.5, 9 - k * 2, 2, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#b39a74';
        ctx.beginPath(); ctx.arc(cx + 21, top + 4, 1.8, 0, Math.PI * 2); ctx.fill();
        this.drawHouse(ctx, cx - 8, top + 2, 0.75, { wall: '#5f4a34', roof: '#3a2e22' });
        return;
      }
      const look = {
        sawmill: [{ wall: '#6f5a42', roof: '#3a2e22' }, 'i_sawmill'],
        forge: [{ wall: '#6d675c', roof: '#2a2724' }, 'i_forge'],
        market: [{ wall: '#8e8676', roof: '#6e2f25' }, 'i_market'],
      }[imp] || [{}, null];
      this.drawHouse(ctx, cx - 4, top + 2, 1, look[0]);
      if (imp === 'forge') {
        ctx.fillStyle = '#3a3632'; ctx.fillRect(cx + 1, top - 24, 4, 12);
        ctx.fillStyle = 'rgba(230,120,40,0.75)'; ctx.beginPath(); ctx.arc(cx - 9, top - 3, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      if (imp === 'market') {
        ctx.fillStyle = '#b39a5a';
        ctx.beginPath(); ctx.moveTo(cx + 8, top + 2); ctx.lineTo(cx + 24, top + 2); ctx.lineTo(cx + 20, top - 6); ctx.lineTo(cx + 12, top - 6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#6e2f25'; ctx.fillRect(cx + 13, top - 6, 3, 8); ctx.fillRect(cx + 19, top - 6, 3, 8);
      }
      if (look[1]) drawIcon(ctx, look[1], cx + 14, top - 16, 15, BONE, 'rgba(10,8,6,0.75)');
      if (t.impLevel > 0 && (imp === 'sawmill' || imp === 'forge' || imp === 'market')) {
        ctx.font = `700 11px ${FONT_B}`; ctx.textAlign = 'center';
        ctx.fillStyle = BONE; ctx.strokeStyle = 'rgba(10,8,6,0.8)'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
        const txt = imp === 'market' ? '+' + this.game.marketValue(t) + '★' : '+' + t.impLevel;
        ctx.strokeText(txt, cx - 14, top + 15); ctx.fillText(txt, cx - 14, top + 15);
      }
    }

    // ---------------------------------------------------------- Destaques
    drawHighlights(ctx, now) {
      const g = this.game, hl = this.hl;
      if (hl.reach) {
        for (const k of hl.reach) {
          const t = g.tiles[k], p = this.tilePosW(t);
          ctx.fillStyle = 'rgba(236,227,207,0.13)';
          diamond(ctx, p.x, p.y, 0.84); ctx.fill();
          ctx.strokeStyle = 'rgba(236,227,207,0.55)'; ctx.lineWidth = 1.3;
          ctx.stroke();
          ctx.fillStyle = BONE;
          diamond(ctx, p.x, p.y, 0.13); ctx.fill();
        }
      }
      if (hl.hover) {
        const p = this.tilePosW(hl.hover);
        ctx.strokeStyle = 'rgba(236,227,207,0.4)'; ctx.lineWidth = 1.5;
        diamond(ctx, p.x, p.y, 0.96); ctx.stroke();
      }
      if (hl.selected) {
        const p = this.tilePosW(hl.selected);
        const pulse = 0.7 + Math.sin(now / 240) * 0.3;
        ctx.strokeStyle = rgba(GOLD, pulse); ctx.lineWidth = 3;
        diamond(ctx, p.x, p.y, 0.98); ctx.stroke();
        ctx.strokeStyle = 'rgba(10,8,6,0.6)'; ctx.lineWidth = 1;
        diamond(ctx, p.x, p.y, 0.9); ctx.stroke();
      }
    }

    drawAttackMarks(ctx, now) {
      const hl = this.hl;
      const mark = (list, color, icon) => {
        if (!list) return;
        for (const u of list) {
          if (u.dead) continue;
          const p = this.tilePosW(u);
          const r = 25 + Math.sin(now / 200) * 1.5;
          ctx.strokeStyle = 'rgba(10,8,6,0.6)'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.ellipse(p.x, p.y - 20, r, r * 1.02, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = color; ctx.lineWidth = 2.4;
          ctx.stroke();
          drawIcon(ctx, icon, p.x + r * 0.72, p.y - 20 - r * 0.72, 14, color, 'rgba(10,8,6,0.8)');
        }
      };
      mark(hl.attack, '#d45a45', 'ui_war');
      mark(hl.convert, '#b38bd6', 'u_missionary');
    }

    // ---------------------------------------------------------- Unidades: escudos heráldicos
    tokenSprite(iconKey, tribe, dim) {
      const key = `u|${iconKey}|${tribe}|${dim ? 1 : 0}`;
      let s = this.sprites.get(key);
      if (s) return s;
      const tr = PP.TRIBES[tribe];
      const base = dim ? mix(tr.color, '#4a4640', 0.6) : tr.color;
      s = makeSprite(48, 56, 24, 28, x => {
        const W = 34, H = 40;
        shieldPath(x, W + 5, H + 5);
        x.fillStyle = INK; x.fill();
        shieldPath(x, W, H);
        const gr = x.createLinearGradient(0, -H / 2, 0, H / 2);
        gr.addColorStop(0, shade(base, 1.25)); gr.addColorStop(0.55, base); gr.addColorStop(1, shade(base, 0.62));
        x.fillStyle = gr; x.fill();
        x.save(); shieldPath(x, W, H); x.clip();
        x.fillStyle = 'rgba(255,240,210,0.10)'; x.fillRect(-W / 2, -H / 2, W / 2, H);
        x.restore();
        x.save(); x.scale(0.86, 0.88); shieldPath(x, W, H); x.restore();
        x.strokeStyle = dim ? 'rgba(160,150,130,0.5)' : 'rgba(214,180,106,0.85)'; x.lineWidth = 1; x.stroke();
        drawIcon(x, iconKey, 0, -2, 24, dim ? '#bdb5a5' : BONE, 'rgba(10,8,6,0.55)');
      });
      this.sprites.set(key, s);
      return s;
    }

    drawUnit(ctx, u, now, alpha, ghost) {
      const g = this.game;
      const pos = ghost ? this.tilePosW(u) : this.unitWorldPos(u, now);
      const tile = g.tile(u.x, u.y);
      const naval = tile && TER[tile.terrain].water;
      const p = g.players[u.owner];
      let scale = 1;
      for (const s of this.pops) if (s.kind === 'spawn' && s.unit === u) scale = PP.clamp((now - s.t0) / s.dur, 0.2, 1);
      const used = !ghost && u.owner === this.viewer && g.current === this.viewer && u.mp <= 0 && !u.canAttack;
      const iconKey = naval ? ['n_boat', 'n_boat', 'n_ship', 'n_battleship'][Math.max(1, g.navalLevel(p))] : 'u_' + u.type;
      ctx.save();
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      const x = pos.x, y = pos.y - 22;
      ctx.fillStyle = 'rgba(8,6,5,0.45)';
      ctx.beginPath(); ctx.ellipse(x + 2, pos.y + 1, 15 * scale, 5.5 * scale, 0, 0, Math.PI * 2); ctx.fill();
      if (naval) {
        ctx.fillStyle = '#3a2b1e';
        ctx.beginPath(); ctx.moveTo(x - 22, pos.y - 6); ctx.lineTo(x + 22, pos.y - 6); ctx.lineTo(x + 15, pos.y + 3); ctx.lineTo(x - 15, pos.y + 3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = shade(p.color, 0.8); ctx.fillRect(x - 20, pos.y - 6, 40, 2);
      }
      const spr = this.tokenSprite(iconKey, p.tribe, used);
      if (scale !== 1) {
        ctx.drawImage(spr.c, x - spr.ax * scale, y - spr.ay * scale, spr.w * scale, spr.h * scale);
      } else blit(ctx, spr, x, y);
      if (u.fortified) {
        ctx.strokeStyle = 'rgba(200,190,170,0.85)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x - 20, y - 20); ctx.lineTo(x - 20, y + 2); ctx.moveTo(x + 20, y - 20); ctx.lineTo(x + 20, y + 2); ctx.stroke();
        for (const sx of [-20, 20]) { ctx.fillStyle = '#c8bea8'; ctx.fillRect(x + sx - 2.5, y - 23, 5, 3); }
      }
      // vida
      const maxHp = g.maxHp(u);
      const frac = PP.clamp(u.hp / maxHp, 0, 1);
      const hpCol = frac > 0.66 ? MOSS : frac > 0.33 ? '#d09a3a' : '#d45a45';
      const label = String(Math.max(0, u.hp));
      ctx.font = `700 11px ${FONT_B}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const bw = Math.max(20, ctx.measureText(label).width + 10);
      const by = y + 20;
      ctx.fillStyle = 'rgba(14,11,9,0.92)';
      this.roundRect(ctx, x - bw / 2, by, bw, 12, 2); ctx.fill();
      ctx.strokeStyle = 'rgba(201,164,92,0.45)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = hpCol;
      ctx.fillRect(x - bw / 2 + 2, by + 9.5, (bw - 4) * frac, 1.5);
      ctx.fillStyle = BONE;
      ctx.fillText(label, x, by + 5.2);
      // patente: divisas douradas
      const rank = g.rank(u);
      if (rank > 0) {
        ctx.lineJoin = 'round';
        for (const [col, wid] of [[INK, 4], ['#e0bd6e', 2]]) {
          ctx.strokeStyle = col; ctx.lineWidth = wid;
          for (let k = 0; k < rank; k++) {
            const cy = y - 25 - k * 4.5;
            ctx.beginPath(); ctx.moveTo(x - 7, cy + 3); ctx.lineTo(x, cy - 1); ctx.lineTo(x + 7, cy + 3); ctx.stroke();
          }
        }
      }
      if (u.pendingPromo && u.owner === this.viewer) {
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + 17, y - 17, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(x + 17, y - 17, 5.5, 0, Math.PI * 2); ctx.fill();
        drawIcon(ctx, 'ui_promote', x + 17, y - 17, 8, INK);
      }
      ctx.restore();
    }

    roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    }

    drawCityLabel(ctx, c) {
      const g = this.game;
      const p = g.players[c.owner];
      const tr = PP.TRIBES[p.tribe];
      const pos = this.tilePosW(c);
      const x = pos.x, y = pos.y + 34;
      ctx.save();
      ctx.font = `700 11.5px ${FONT_D}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const name = c.name;
      const w = ctx.measureText(name).width + 38;
      ctx.fillStyle = 'rgba(16,13,11,0.9)';
      ctx.fillRect(x - w / 2, y - 9, w, 18);
      ctx.strokeStyle = 'rgba(201,164,92,0.55)'; ctx.lineWidth = 1;
      ctx.strokeRect(x - w / 2 + 0.5, y - 8.5, w - 1, 17);
      ctx.save();
      ctx.translate(x - w / 2 + 11, y);
      shieldPath(ctx, 17, 21); ctx.fillStyle = INK; ctx.fill();
      shieldPath(ctx, 14, 18); ctx.fillStyle = tr.color; ctx.fill();
      ctx.fillStyle = BONE; ctx.font = `700 8.5px ${FONT_D}`;
      ctx.fillText(roman(c.level), 0, -1);
      ctx.restore();
      if (c.capital) drawIcon(ctx, 'ui_capital', x + w / 2 - 1, y - 11, 12, GOLD, 'rgba(10,8,6,0.8)');
      ctx.fillStyle = BONE;
      ctx.font = `700 11.5px ${FONT_D}`;
      ctx.fillText(name, x + 9, y + 0.5);
      const need = c.level + 1;
      const step = Math.min(8, 64 / need);
      const bx = x - (step * (need - 1)) / 2;
      for (let k = 0; k < need; k++) {
        const px = bx + k * step, py = y + 14;
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.moveTo(px, py - 3.6); ctx.lineTo(px + 3.6, py); ctx.lineTo(px, py + 3.6); ctx.lineTo(px - 3.6, py); ctx.closePath(); ctx.fill();
        ctx.fillStyle = k < c.pop ? '#86b3ac' : '#3a342d';
        ctx.beginPath(); ctx.moveTo(px, py - 2.4); ctx.lineTo(px + 2.4, py); ctx.lineTo(px, py + 2.4); ctx.lineTo(px - 2.4, py); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------ Cinzas no ar (camada decorativa)
  class AshFX {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.parts = [];
      this.on = false;
      this.last = 0;
      window.addEventListener('resize', () => this.resize());
      this.resize();
      const loop = t => {
        if (this.on && t - this.last > 33) { this.last = t; this.step(); }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    resize() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = window.innerWidth; this.h = window.innerHeight;
      this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
      const n = Math.round(Math.min(70, (this.w * this.h) / 16000));
      this.parts = [];
      for (let i = 0; i < n; i++) this.parts.push(this.spawn(true));
    }
    spawn(anywhere) {
      const ember = Math.random() < 0.14;
      return {
        x: Math.random() * this.w, y: anywhere ? Math.random() * this.h : -10,
        vx: 0.15 + Math.random() * 0.35, vy: ember ? -(0.12 + Math.random() * 0.25) : 0.2 + Math.random() * 0.45,
        r: ember ? 0.9 + Math.random() * 1.1 : 0.7 + Math.random() * 1.6,
        a: ember ? 0.5 + Math.random() * 0.4 : 0.12 + Math.random() * 0.3,
        ember, ph: Math.random() * 6.28,
      };
    }
    setOn(v) { this.on = v; if (!v) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }
    step() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      for (let i = 0; i < this.parts.length; i++) {
        const p = this.parts[i];
        p.ph += 0.03;
        p.x += p.vx + Math.sin(p.ph) * 0.25;
        p.y += p.vy;
        if (p.x > this.w + 10 || p.y > this.h + 10 || p.y < -20) {
          const n = this.spawn(false);
          if (n.ember) n.y = this.h + 5;
          if (Math.random() < 0.5) { n.x = -8; n.y = Math.random() * this.h; }
          this.parts[i] = n;
          continue;
        }
        if (p.ember) {
          ctx.fillStyle = `rgba(230,130,50,${p.a * (0.6 + Math.sin(p.ph * 3) * 0.4)})`;
          ctx.shadowColor = 'rgba(255,140,60,0.8)'; ctx.shadowBlur = 6;
        } else {
          ctx.fillStyle = `rgba(190,182,170,${p.a})`;
          ctx.shadowBlur = 0;
        }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
  }

  PP.Renderer = Renderer;
  PP.AshFX = AshFX;
  PP.TILE = { TW, TH, LH };
  PP.shieldPath = shieldPath;
})(window.PP = window.PP || {});
