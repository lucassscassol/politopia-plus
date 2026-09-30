/* Politopia+ — renderizador isométrico em Canvas 2D */
(function (PP) {
  'use strict';
  const TER = PP.TERRAIN;
  const TW = 96, TH = 48, LH = 12;

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
  PP.color = { shade, mix, rgba };

  // ------------------------------------------------------------ Sprites de emoji (cache)
  const emojiCache = new Map();
  function emojiSprite(ch, px) {
    const size = Math.max(8, Math.round(px / 4) * 4);
    const key = ch + '|' + size;
    let c = emojiCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    const pad = Math.ceil(size * 0.25);
    c.width = c.height = size + pad * 2;
    const x = c.getContext('2d');
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    x.fillText(ch, c.width / 2, c.height / 2 + size * 0.06);
    c._size = size; c._pad = pad;
    emojiCache.set(key, c);
    return c;
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.game = null;
      this.viewer = 0;          // jogador cujo ponto de vista é mostrado (-1 = tudo visível)
      this.cam = { x: 0, y: 0, z: 0.6 };
      this.camAnim = null;
      this.dirty = true;
      this.anims = [];          // movimentos/ataques (bloqueiam a IA)
      this.floats = [];         // textos flutuantes
      this.ghosts = [];         // unidades morrendo
      this.pops = [];           // efeitos de anel
      this.hl = { selected: null, reach: null, attack: null, convert: null, hover: null };
      this.speed = 1;
      this.time = 0;
      this.unsub = null;
      this.showGrid = false;
      this.resize();
      const loop = (t) => {
        this.time = t;
        try { this.frame(t); } catch (e) { console.error(e); this.anims = []; }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
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
      this.dirty = true;
    }

    // ---------------------------------------------------------- Geometria
    worldOf(x, y) { return { x: (x - y) * TW / 2, y: (x + y) * TH / 2 }; }
    topY(t) { return TER[t.terrain].water ? 3 : -LH; }
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
      const minX = -H * TW / 2, maxX = W * TW / 2, maxY = (W + H) * TH / 2;
      this.cam.x = PP.clamp(this.cam.x, minX, maxX);
      this.cam.y = PP.clamp(this.cam.y, -TH, maxY);
    }

    clearHighlights() { this.hl = { selected: null, reach: null, attack: null, convert: null, hover: this.hl ? this.hl.hover : null }; this.dirty = true; }

    // ---------------------------------------------------------- Visibilidade para o espectador
    visibleTo(x, y) {
      if (this.viewer < 0) return true;
      const p = this.game.players[this.viewer];
      return !!(p && p.visible[y * this.game.W + x]);
    }
    exploredBy(i) {
      if (this.viewer < 0) return true;
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
      const g = this.game;
      const now = performance.now();
      this.dirty = true;
      switch (type) {
        case 'move': {
          const pts = [d.from].concat(d.path);
          if (!pts.some(p => this.visibleTo(p.x, p.y)) && d.unit.owner !== this.viewer) return;
          const step = this.dur(d.unit.owner === this.viewer ? 110 : 150);
          if (step > 0) this.anims.push({ kind: 'move', unit: d.unit, pts, t0: now, dur: step * (pts.length - 1) });
          if (this.followAI && d.unit.owner !== this.viewer) this.ensureVisible(d.path[d.path.length - 1]);
          break;
        }
        case 'attack': {
          const vis = this.visibleTo(d.from.x, d.from.y) || this.visibleTo(d.to.x, d.to.y);
          if (!vis) return;
          if (this.followAI && d.attacker.owner !== this.viewer) this.ensureVisible(d.to);
          const dur = this.dur(260);
          if (dur > 0) this.anims.push({ kind: 'lunge', unit: d.attacker, from: d.from, to: d.to, t0: now, dur, advanced: d.advanced });
          if (d.dmg) this.float(d.to.x, d.to.y, '-' + d.dmg, '#ff5a4f', now + dur * 0.5);
          if (d.ret) this.float(d.from.x, d.from.y, '-' + d.ret, '#ffb14f', now + dur * 0.8);
          if (d.killed) this.ghost(d.defender, now + dur * 0.5);
          if (d.attackerKilled) this.ghost(d.attacker, now + dur);
          for (const s of d.splash) { this.float(s.x, s.y, '-' + s.dmg, '#ff5a4f', now + dur * 0.6); if (s.unit.dead) this.ghost(s.unit, now + dur * 0.6); }
          this.ring(d.to.x, d.to.y, '#ff6a3d', now + dur * 0.5);
          break;
        }
        case 'death':
          if (d.disband && this.visibleTo(d.unit.x, d.unit.y)) this.ghost(d.unit, now);
          break;
        case 'train':
          this.pops.push({ kind: 'spawn', unit: d.unit, t0: now, dur: this.dur(300) || 1 });
          break;
        case 'capture':
          if (this.visibleTo(d.city.x, d.city.y)) { this.ring(d.city.x, d.city.y, '#ffd84a', now); this.float(d.city.x, d.city.y, d.from >= 0 ? 'Conquistada!' : 'Nova cidade!', '#ffe27a', now, 1.2); }
          break;
        case 'levelup':
          if (this.visibleTo(d.city.x, d.city.y)) this.float(d.city.x, d.city.y, 'Nível ' + d.city.level + '!', '#9ef0ff', now + 150, 1.1);
          break;
        case 'pop':
          if (d.city.owner === this.viewer) this.float(d.city.x, d.city.y, '+' + d.amount + ' 👤', '#c7ffb0', now, 0.9);
          break;
        case 'build':
          if (this.visibleTo(d.tile.x, d.tile.y)) this.ring(d.tile.x, d.tile.y, '#9dff8a', now);
          break;
        case 'wonder':
          if (this.visibleTo(d.tile.x, d.tile.y)) { this.ring(d.tile.x, d.tile.y, '#fff08a', now); this.float(d.tile.x, d.tile.y, PP.WONDERS[d.wonder].name, '#fff08a', now, 1.1); }
          break;
        case 'heal':
          for (const h of d.units) if (h.amount > 0 && this.visibleTo(h.unit.x, h.unit.y)) this.float(h.unit.x, h.unit.y, '+' + h.amount, '#7dff8a', now);
          break;
        case 'convert':
          if (this.visibleTo(d.target.x, d.target.y)) { this.float(d.target.x, d.target.y, 'Convertido!', '#e6b3ff', now); this.ring(d.target.x, d.target.y, '#d38bff', now); }
          break;
        case 'promote':
          if (this.visibleTo(d.unit.x, d.unit.y)) this.float(d.unit.x, d.unit.y, PP.PROMOTIONS[d.promo].icon + ' ' + PP.PROMOTIONS[d.promo].name, '#ffe27a', now);
          break;
        case 'ruin':
          if (this.visibleTo(d.tile.x, d.tile.y)) this.ring(d.tile.x, d.tile.y, '#ffe27a', now);
          break;
      }
    }

    ensureVisible(p) {
      if (!p) return;
      const s = this.tileScreen(p.x, p.y);
      const m = 80;
      if (s.x < m || s.y < m + 40 || s.x > this.w - m || s.y > this.h - m - 120) this.centerOn(p.x, p.y, true);
    }

    float(x, y, text, color, t0, scale) { this.floats.push({ x, y, text, color, t0, dur: 1100, scale: scale || 1 }); }
    ring(x, y, color, t0) { this.pops.push({ kind: 'ring', x, y, color, t0, dur: 600 }); }
    ghost(u, t0) { this.ghosts.push({ u: Object.assign({}, u), t0, dur: 450 }); }

    // Posição (mundo) atual de uma unidade, considerando animações
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
          return { x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e - Math.sin(f * Math.PI) * 6 };
        }
        if (a.kind === 'lunge') {
          const p0 = this.tilePosW(a.from), p1 = this.tilePosW(a.to);
          if (a.advanced) {
            const e = k < 0.5 ? k * 0.6 : 0.3 + (k - 0.5) * 1.4;
            return { x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e };
          }
          const e = Math.sin(k * Math.PI) * 0.35;
          return { x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e };
        }
      }
      return this.tilePosW(u);
    }
    tilePosW(p) { const w = this.worldOf(p.x, p.y); const t = this.game.tile(p.x, p.y); return { x: w.x, y: w.y + this.topY(t) }; }

    // ---------------------------------------------------------- Laço
    frame(t) {
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
      if (!this.dirty && !animating && !this.alwaysAnimate) return;
      this.dirty = false;
      this.draw(now);
    }

    draw(now) {
      const ctx = this.ctx, g = this.game;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const bg = ctx.createLinearGradient(0, 0, 0, this.h);
      bg.addColorStop(0, '#0b1a2e'); bg.addColorStop(1, '#10263f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, this.w, this.h);
      if (!g) return;
      const z = this.cam.z;
      ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z, this.dpr * (this.w / 2 - this.cam.x * z), this.dpr * (this.h / 2 - this.cam.y * z));
      // Recorte das casas visíveis
      const w0 = this.toWorld(-TW * z, -TH * 3 * z), w1 = this.toWorld(this.w + TW * z, this.h + TH * 3 * z);
      const W = g.W, H = g.H;
      const detail = z > 0.34;
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
      // 1) terreno
      for (const t of list) this.drawTile(ctx, t, detail, now);
      // 2) destaques
      this.drawHighlights(ctx, now);
      // 3) unidades
      const units = [];
      for (const u of g.units) {
        if (u.owner !== this.viewer && !this.visibleTo(u.x, u.y) && !this.anims.some(a => a.unit === u)) continue;
        units.push(u);
      }
      units.sort((a, b) => (a.x + a.y) - (b.x + b.y));
      for (const u of units) this.drawUnit(ctx, u, now);
      for (const gh of this.ghosts) {
        const k = PP.clamp((now - gh.t0) / gh.dur, 0, 1);
        if (now < gh.t0) { this.drawUnit(ctx, gh.u, now, 1, true); continue; }
        this.drawUnit(ctx, gh.u, now, 1 - k, true);
      }
      this.drawAttackMarks(ctx, now);
      // 4) rótulos de cidades
      for (const t of list) if (t.city && this.exploredBy(t.y * W + t.x)) this.drawCityLabel(ctx, g.cityMap[t.city]);
      // 5) efeitos
      for (const p of this.pops) {
        if (p.kind !== 'ring' || now < p.t0) continue;
        const k = (now - p.t0) / p.dur, c = this.tilePosW(p);
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = p.color; ctx.lineWidth = 4 * (1 - k) + 1;
        this.diamondPath(ctx, c.x, c.y, 0.5 + k * 0.6);
        ctx.stroke();
        ctx.restore();
      }
      for (const f of this.floats) {
        if (now < f.t0) continue;
        const k = (now - f.t0) / f.dur, c = this.tilePosW(f);
        ctx.save();
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        ctx.font = `bold ${Math.round(20 * f.scale)}px Signika, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        const y = c.y - 36 - k * 34;
        ctx.strokeText(f.text, c.x, y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, c.x, y);
        ctx.restore();
      }
    }

    diamondPath(ctx, cx, cy, s) {
      s = s || 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy - TH / 2 * s);
      ctx.lineTo(cx + TW / 2 * s, cy);
      ctx.lineTo(cx, cy + TH / 2 * s);
      ctx.lineTo(cx - TW / 2 * s, cy);
      ctx.closePath();
    }

    // ---------------------------------------------------------- Terreno
    landColor(t) {
      const base = TER[t.terrain].color;
      const tr = PP.TRIBES[t.biome];
      const amt = t.terrain === 'mountain' ? 0.12 : t.terrain === 'desert' || t.terrain === 'tundra' ? 0.18 : 0.38;
      const v = hash(t.x, t.y, 1);
      const c = tr ? mix(base, tr.tint, amt) : base;
      return shade(c, 0.95 + Math.floor(v * 3) * 0.04);
    }

    drawTile(ctx, t, detail, now) {
      const g = this.game;
      const i = t.y * g.W + t.x;
      const c = this.worldOf(t.x, t.y);
      const explored = this.exploredBy(i);
      if (!explored) {
        this.diamondPath(ctx, c.x, c.y + 3);
        ctx.fillStyle = (t.x + t.y) % 2 ? '#132338' : '#15273d';
        ctx.fill();
        if (detail && hash(t.x, t.y, 9) < 0.35) {
          ctx.fillStyle = 'rgba(160,190,230,0.06)';
          ctx.beginPath(); ctx.ellipse(c.x, c.y, TW * 0.3, TH * 0.22, 0, 0, Math.PI * 2); ctx.fill();
        }
        return;
      }
      const water = TER[t.terrain].water;
      const top = c.y + this.topY(t);
      if (water) {
        this.diamondPath(ctx, c.x, top);
        ctx.fillStyle = t.terrain === 'ocean' ? '#245f98' : '#3c8fcf';
        ctx.fill();
        if (detail) {
          const h1 = hash(t.x, t.y, 2);
          ctx.strokeStyle = t.terrain === 'ocean' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.18)';
          ctx.lineWidth = 1.5;
          const wob = Math.sin(now / 900 + h1 * 6) * 3;
          ctx.beginPath();
          ctx.moveTo(c.x - 14 + h1 * 10 + wob, top - 4 + h1 * 6);
          ctx.quadraticCurveTo(c.x - 6 + h1 * 10 + wob, top - 8 + h1 * 6, c.x + 2 + h1 * 10 + wob, top - 4 + h1 * 6);
          ctx.stroke();
          if (t.terrain === 'water') this.drawShore(ctx, t, top);
        }
      } else {
        const col = this.landColor(t);
        // faces laterais
        ctx.fillStyle = shade(col, 0.72);
        ctx.beginPath(); ctx.moveTo(c.x - TW / 2, top); ctx.lineTo(c.x, top + TH / 2); ctx.lineTo(c.x, top + TH / 2 + LH); ctx.lineTo(c.x - TW / 2, top + LH); ctx.closePath(); ctx.fill();
        ctx.fillStyle = shade(col, 0.58);
        ctx.beginPath(); ctx.moveTo(c.x + TW / 2, top); ctx.lineTo(c.x, top + TH / 2); ctx.lineTo(c.x, top + TH / 2 + LH); ctx.lineTo(c.x + TW / 2, top + LH); ctx.closePath(); ctx.fill();
        this.diamondPath(ctx, c.x, top);
        ctx.fillStyle = col;
        ctx.fill();
        if (detail) { ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 1; ctx.stroke(); }
      }
      // território
      if (t.owner >= 0) this.drawTerritory(ctx, t, c.x, top);
      if (t.road) this.drawRoad(ctx, t, c.x, top);
      if (detail) this.drawFeature(ctx, t, c.x, top, now);
      else if (t.city || t.village) this.drawSettlement(ctx, t, c.x, top);
      if (t.res && !t.city) {
        const s = emojiSprite(PP.RESOURCES[t.res].icon, 26);
        const k = 26 / s._size;
        ctx.drawImage(s, c.x - s.width * k / 2 + (t.terrain === 'mountain' ? 14 : 0), top - s.height * k / 2 - (t.terrain === 'forest' ? 4 : 2), s.width * k, s.height * k);
      }
      // névoa (explorado mas fora de visão)
      if (!this.visibleTo(t.x, t.y)) {
        this.diamondPath(ctx, c.x, top);
        ctx.fillStyle = 'rgba(8,14,28,0.38)';
        ctx.fill();
      }
    }

    drawShore(ctx, t, top) {
      const g = this.game;
      const c = this.worldOf(t.x, t.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      const edges = [[0, -1, [0, -1], [1, 0]], [1, 0, [1, 0], [0, 1]], [0, 1, [0, 1], [-1, 0]], [-1, 0, [-1, 0], [0, -1]]];
      for (const e of edges) {
        const n = g.tile(t.x + e[0], t.y + e[1]);
        if (!n || TER[n.terrain].water) continue;
        const a = e[2], b = e[3];
        ctx.beginPath();
        ctx.moveTo(c.x + a[0] * TW / 2 * 0.86, top + a[1] * TH / 2 * 0.86);
        ctx.lineTo(c.x + b[0] * TW / 2 * 0.86, top + b[1] * TH / 2 * 0.86);
        ctx.stroke();
      }
    }

    drawTerritory(ctx, t, cx, top) {
      const g = this.game;
      const col = g.players[t.owner].color;
      this.diamondPath(ctx, cx, top);
      ctx.fillStyle = rgba(col, 0.16);
      ctx.fill();
      // bordas: vértices topo(0,-1) dir(1,0) base(0,1) esq(-1,0)
      const edges = [[0, -1, [0, -1], [1, 0]], [1, 0, [1, 0], [0, 1]], [0, 1, [0, 1], [-1, 0]], [-1, 0, [-1, 0], [0, -1]]];
      ctx.strokeStyle = col;
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      for (const e of edges) {
        const n = g.tile(t.x + e[0], t.y + e[1]);
        if (n && n.owner === t.owner) continue;
        const a = e[2], b = e[3], k = 0.9;
        ctx.beginPath();
        ctx.moveTo(cx + a[0] * TW / 2 * k, top + a[1] * TH / 2 * k);
        ctx.lineTo(cx + b[0] * TW / 2 * k, top + b[1] * TH / 2 * k);
        ctx.stroke();
      }
    }

    drawRoad(ctx, t, cx, top) {
      const g = this.game;
      ctx.strokeStyle = '#b58a55';
      ctx.lineWidth = 5; ctx.lineCap = 'round';
      let any = false;
      for (const d of PP.DIRS) {
        const n = g.tile(t.x + d[0], t.y + d[1]);
        if (!n || !(n.road || n.city)) continue;
        any = true;
        const w = this.worldOf(n.x, n.y), c = this.worldOf(t.x, t.y);
        ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx + (w.x - c.x) / 2, top + (w.y - c.y) / 2); ctx.stroke();
      }
      if (!any) { ctx.fillStyle = '#b58a55'; ctx.beginPath(); ctx.ellipse(cx, top, 6, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    }

    drawTree(ctx, x, y, s, dark, light) {
      ctx.fillStyle = '#6b4a2b';
      ctx.fillRect(x - 1.5 * s, y - 2 * s, 3 * s, 5 * s);
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.moveTo(x, y - 20 * s); ctx.lineTo(x + 9 * s, y - 2 * s); ctx.lineTo(x - 9 * s, y - 2 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = light;
      ctx.beginPath(); ctx.moveTo(x, y - 20 * s); ctx.lineTo(x - 9 * s, y - 2 * s); ctx.lineTo(x - 1 * s, y - 4 * s); ctx.closePath(); ctx.fill();
    }

    drawFeature(ctx, t, cx, top, now) {
      const h = hash(t.x, t.y, 3);
      const tr = PP.TRIBES[t.biome];
      if (t.city || t.village) { this.drawSettlement(ctx, t, cx, top); return; }
      if (t.ruin) this.drawRuin(ctx, cx, top);
      if (t.wonder) { this.drawWonder(ctx, t, cx, top); return; }
      if (t.imp) { this.drawImprovement(ctx, t, cx, top); if (t.terrain !== 'mountain' && t.terrain !== 'forest') return; }
      switch (t.terrain) {
        case 'forest': {
          if (t.imp) break;
          const dark = t.biome === 'vikar' ? '#2f6b4f' : t.biome === 'qadir' ? '#6b8a3a' : '#2f7a36';
          const light = shade(dark, 1.35);
          const pts = [[-18, -2], [6, -8], [16, 4], [-4, 8]];
          const n = 3 + (h > 0.5 ? 1 : 0);
          for (let k = 0; k < n; k++) this.drawTree(ctx, cx + pts[k][0] + h * 4, top + pts[k][1], 0.9 + ((h * (k + 3)) % 0.3), dark, light);
          break;
        }
        case 'mountain': {
          const base = mix('#8b8577', tr ? tr.tint : '#8b8577', 0.1);
          ctx.fillStyle = shade(base, 1.1);
          ctx.beginPath(); ctx.moveTo(cx - 30, top + 6); ctx.lineTo(cx - 4 + h * 6, top - 38); ctx.lineTo(cx + 4 + h * 6, top + 10); ctx.closePath(); ctx.fill();
          ctx.fillStyle = shade(base, 0.8);
          ctx.beginPath(); ctx.moveTo(cx + 4 + h * 6, top + 10); ctx.lineTo(cx - 4 + h * 6, top - 38); ctx.lineTo(cx + 30, top + 4); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#f4f6f8';
          ctx.beginPath(); ctx.moveTo(cx - 4 + h * 6, top - 38); ctx.lineTo(cx - 11 + h * 6, top - 25); ctx.lineTo(cx - 4 + h * 6, top - 28); ctx.lineTo(cx + 3 + h * 6, top - 24); ctx.closePath(); ctx.fill();
          ctx.fillStyle = shade(base, 0.95);
          ctx.beginPath(); ctx.moveTo(cx + 8, top + 8); ctx.lineTo(cx + 20, top - 14); ctx.lineTo(cx + 32, top + 4); ctx.closePath(); ctx.fill();
          break;
        }
        case 'hills': {
          const col = this.landColor(t);
          ctx.fillStyle = shade(col, 0.85);
          ctx.beginPath(); ctx.ellipse(cx - 12, top + 2, 16, 10, 0, Math.PI, 0); ctx.fill();
          ctx.fillStyle = shade(col, 0.92);
          ctx.beginPath(); ctx.ellipse(cx + 10, top + 6, 14, 9, 0, Math.PI, 0); ctx.fill();
          break;
        }
        case 'desert': {
          ctx.strokeStyle = 'rgba(160,110,40,0.35)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(cx - 20, top + 2); ctx.quadraticCurveTo(cx - 8, top - 6, cx + 4, top + 2); ctx.stroke();
          if (h > 0.6 && !t.res) {
            ctx.fillStyle = '#5c8f3b';
            ctx.fillRect(cx + 12, top - 16, 4, 16); ctx.fillRect(cx + 8, top - 10, 4, 3); ctx.fillRect(cx + 7, top - 13, 3, 6);
          }
          break;
        }
        case 'tundra': {
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.beginPath(); ctx.ellipse(cx - 10 + h * 12, top + 2, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
          if (h > 0.5 && !t.res) { ctx.fillStyle = '#8a9296'; ctx.beginPath(); ctx.ellipse(cx + 12, top - 2, 5, 3, 0, 0, Math.PI * 2); ctx.fill(); }
          break;
        }
        case 'swamp': {
          ctx.fillStyle = 'rgba(40,90,90,0.7)';
          ctx.beginPath(); ctx.ellipse(cx - 8, top + 2, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(cx + 14, top - 4, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#4d6b2e'; ctx.lineWidth = 1.5;
          for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(cx + 2 + k * 3, top + 8); ctx.lineTo(cx + k * 4, top - 6); ctx.stroke(); }
          break;
        }
        case 'plains': {
          if (h > 0.55 && !t.res) {
            ctx.strokeStyle = 'rgba(40,90,20,0.35)'; ctx.lineWidth = 1.5;
            for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(cx - 12 + k * 3 + h * 10, top + 4); ctx.lineTo(cx - 14 + k * 4 + h * 10, top - 3); ctx.stroke(); }
          }
          break;
        }
      }
    }

    drawHouse(ctx, x, y, s, wall, roof, tall) {
      const w = 10 * s, d = 5 * s, hgt = (tall ? 16 : 9) * s;
      // paredes
      ctx.fillStyle = shade(wall, 0.85);
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x, y + d); ctx.lineTo(x, y + d - hgt); ctx.lineTo(x - w, y - hgt); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(wall, 0.7);
      ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x, y + d); ctx.lineTo(x, y + d - hgt); ctx.lineTo(x + w, y - hgt); ctx.closePath(); ctx.fill();
      // telhado
      const ry = y - hgt;
      ctx.fillStyle = roof;
      ctx.beginPath(); ctx.moveTo(x - w - 1.5 * s, ry); ctx.lineTo(x, ry + d + 1 * s); ctx.lineTo(x, ry - 8 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(roof, 0.75);
      ctx.beginPath(); ctx.moveTo(x + w + 1.5 * s, ry); ctx.lineTo(x, ry + d + 1 * s); ctx.lineTo(x, ry - 8 * s); ctx.closePath(); ctx.fill();
    }

    drawSettlement(ctx, t, cx, top) {
      const g = this.game;
      if (t.village) {
        this.drawHouse(ctx, cx - 10, top - 2, 1, '#d8c7a4', '#9c6b3f');
        this.drawHouse(ctx, cx + 10, top + 4, 0.9, '#d8c7a4', '#8c5e35');
        ctx.strokeStyle = '#5a4630'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx + 2, top - 6); ctx.lineTo(cx + 2, top - 30); ctx.stroke();
        ctx.fillStyle = '#f2f2f2';
        ctx.beginPath(); ctx.moveTo(cx + 2, top - 30); ctx.lineTo(cx + 14, top - 26); ctx.lineTo(cx + 2, top - 22); ctx.closePath(); ctx.fill();
        return;
      }
      const c = g.cityMap[t.city];
      const tr = PP.TRIBES[g.players[c.owner].tribe];
      const roof = tr.color, wall = '#efe6d2';
      if (c.buildings.walls) {
        ctx.strokeStyle = '#8d8a82'; ctx.lineWidth = 5;
        this.diamondPath(ctx, cx, top, 0.82); ctx.stroke();
        ctx.strokeStyle = '#b9b5ab'; ctx.lineWidth = 2;
        this.diamondPath(ctx, cx, top - 3, 0.82); ctx.stroke();
      }
      const spots = [[0, -2], [-16, 4], [16, 4], [-8, 12], [10, -10], [-12, -8], [20, -4]];
      const n = Math.min(spots.length, 1 + Math.floor((c.level + 1) / 1.5));
      const order = [4, 5, 0, 6, 1, 2, 3].filter(k => k < n);
      for (const k of order) {
        const sp = spots[k];
        this.drawHouse(ctx, cx + sp[0], top + sp[1], k === 0 ? 1.2 : 0.9, wall, roof, k === 0 && c.capital);
      }
      if (c.capital) {
        ctx.strokeStyle = '#3d3326'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx, top - 28); ctx.lineTo(cx, top - 44); ctx.stroke();
        ctx.fillStyle = roof;
        ctx.beginPath(); ctx.moveTo(cx, top - 44); ctx.lineTo(cx + 12, top - 40); ctx.lineTo(cx, top - 36); ctx.closePath(); ctx.fill();
      }
    }

    drawRuin(ctx, cx, top) {
      ctx.fillStyle = '#a7a39a';
      ctx.fillRect(cx - 14, top - 16, 6, 18);
      ctx.fillRect(cx + 6, top - 10, 6, 13);
      ctx.fillStyle = '#c9c5bb';
      ctx.fillRect(cx - 16, top - 19, 10, 4);
      ctx.fillStyle = '#8f8b82';
      ctx.beginPath(); ctx.ellipse(cx - 2, top + 5, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,230,120,0.9)';
      ctx.font = 'bold 13px Signika, system-ui'; ctx.textAlign = 'center';
      ctx.fillText('?', cx - 1, top - 2);
    }

    drawWonder(ctx, t, cx, top) {
      const w = PP.WONDERS[t.wonder];
      ctx.fillStyle = '#d9d2bf';
      ctx.beginPath(); ctx.ellipse(cx, top + 2, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#bfb6a0';
      ctx.beginPath(); ctx.ellipse(cx, top + 4, 22, 10, 0, 0, Math.PI); ctx.fill();
      const s = emojiSprite(w.icon, 38);
      const k = 38 / s._size;
      ctx.drawImage(s, cx - s.width * k / 2, top - 22 - s.height * k / 2, s.width * k, s.height * k);
    }

    drawImprovement(ctx, t, cx, top) {
      const imp = t.imp;
      if (imp === 'farm' || imp === 'plantation') {
        ctx.save();
        this.diamondPath(ctx, cx, top, 0.78); ctx.clip();
        ctx.strokeStyle = imp === 'farm' ? '#e4c24e' : '#9fc24a'; ctx.lineWidth = 4;
        for (let k = -4; k <= 4; k++) { ctx.beginPath(); ctx.moveTo(cx + k * 10 - 30, top - 20); ctx.lineTo(cx + k * 10 + 30, top + 20); ctx.stroke(); }
        ctx.restore();
        if (imp === 'plantation') this.badge(ctx, cx, top - 6, '🌶️', 18);
        return;
      }
      if (imp === 'port') {
        ctx.fillStyle = '#8a6239';
        ctx.beginPath(); ctx.moveTo(cx - 20, top); ctx.lineTo(cx, top + 10); ctx.lineTo(cx + 20, top); ctx.lineTo(cx, top - 10); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#5e4125'; ctx.lineWidth = 1.5;
        for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(cx + k * 6 - 8, top - 4 + k * 3); ctx.lineTo(cx + k * 6 + 8, top + 4 + k * 3); ctx.stroke(); }
        this.badge(ctx, cx, top - 12, '⚓', 18);
        return;
      }
      if (imp === 'pasture') {
        ctx.strokeStyle = '#8a6239'; ctx.lineWidth = 2;
        this.diamondPath(ctx, cx, top, 0.6); ctx.stroke();
        this.badge(ctx, cx, top - 6, '🐴', 22);
        return;
      }
      if (imp === 'mine' || imp === 'gemmine') {
        ctx.fillStyle = '#3b3129';
        ctx.beginPath(); ctx.ellipse(cx - 8, top + 2, 8, 6, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#7a5a36'; ctx.fillRect(cx - 17, top - 1, 18, 3);
        this.badge(ctx, cx + 10, top - 10, imp === 'mine' ? '⛏️' : '💎', 18);
        return;
      }
      if (imp === 'windmill') {
        this.drawHouse(ctx, cx, top + 2, 0.9, '#efe6d2', '#8a6239', true);
        const hx = cx, hy = top - 16;
        ctx.strokeStyle = '#f7f1e1'; ctx.lineWidth = 3;
        for (let k = 0; k < 4; k++) { const an = 0.4 + k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(an) * 14, hy + Math.sin(an) * 14); ctx.stroke(); }
        return;
      }
      const look = {
        lumber: ['#b98c5a', '#6e4a2a', '🪓'], sawmill: ['#d9c6a5', '#7b5a3a', '🪚'], forge: ['#b8b0a4', '#3d3935', '🔥'],
        market: ['#f3e7c9', '#c0392b', '💰'],
      }[imp] || ['#ddd', '#888', '❓'];
      this.drawHouse(ctx, cx, top + 2, imp === 'lumber' ? 0.8 : 1, look[0], look[1]);
      this.badge(ctx, cx + 12, top - 16, look[2], 16);
      if (t.impLevel > 0 && (imp === 'sawmill' || imp === 'forge' || imp === 'market')) {
        ctx.font = 'bold 11px Signika, system-ui'; ctx.textAlign = 'center';
        ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
        const txt = imp === 'market' ? '+' + this.game.marketValue(t) + '★' : '+' + t.impLevel;
        ctx.strokeText(txt, cx - 12, top + 14); ctx.fillText(txt, cx - 12, top + 14);
      }
    }

    badge(ctx, x, y, ch, px) {
      const s = emojiSprite(ch, px);
      const k = px / s._size;
      ctx.drawImage(s, x - s.width * k / 2, y - s.height * k / 2, s.width * k, s.height * k);
    }

    // ---------------------------------------------------------- Destaques
    drawHighlights(ctx, now) {
      const g = this.game, hl = this.hl;
      if (hl.reach) {
        for (const k of hl.reach) {
          const t = g.tiles[k], p = this.tilePosW(t);
          ctx.fillStyle = 'rgba(255,255,255,0.26)';
          this.diamondPath(ctx, p.x, p.y, 0.84); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.ellipse(p.x, p.y, 8, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (hl.hover) {
        const p = this.tilePosW(hl.hover);
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
        this.diamondPath(ctx, p.x, p.y, 0.96); ctx.stroke();
      }
      if (hl.selected) {
        const p = this.tilePosW(hl.selected);
        const pulse = 0.75 + Math.sin(now / 220) * 0.25;
        ctx.strokeStyle = `rgba(255,255,255,${pulse})`; ctx.lineWidth = 3.5;
        this.diamondPath(ctx, p.x, p.y, 0.98); ctx.stroke();
      }
    }

    drawAttackMarks(ctx, now) {
      const g = this.game, hl = this.hl;
      const mark = (list, color) => {
        if (!list) return;
        for (const u of list) {
          if (u.dead) continue;
          const p = this.tilePosW(u);
          const r = 22 + Math.sin(now / 180) * 2;
          ctx.strokeStyle = color; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(p.x, p.y - 12, r, r * 0.95, 0, 0, Math.PI * 2); ctx.stroke();
        }
      };
      mark(hl.attack, 'rgba(255,70,60,0.95)');
      mark(hl.convert, 'rgba(210,130,255,0.95)');
    }

    // ---------------------------------------------------------- Unidades
    drawUnit(ctx, u, now, alpha, ghost) {
      const g = this.game;
      const pos = ghost ? this.tilePosW(u) : this.unitWorldPos(u, now);
      const tile = g.tile(u.x, u.y);
      const naval = tile && TER[tile.terrain].water;
      const p = g.players[u.owner];
      const tr = PP.TRIBES[p.tribe];
      let scale = 1;
      for (const s of this.pops) if (s.kind === 'spawn' && s.unit === u) scale = PP.clamp((now - s.t0) / s.dur, 0.2, 1);
      const used = !ghost && u.owner === this.viewer && g.current === this.viewer && u.mp <= 0 && !u.canAttack;
      ctx.save();
      ctx.globalAlpha = (alpha == null ? 1 : alpha) * (used ? 0.62 : 1);
      const x = pos.x, y = pos.y - 12;
      const r = 17 * scale;
      // sombra
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(x, pos.y + 2, r * 1.05, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      if (naval) {
        ctx.fillStyle = '#7a5230';
        ctx.beginPath(); ctx.moveTo(x - 24, y + 8); ctx.lineTo(x + 24, y + 8); ctx.lineTo(x + 16, y + 18); ctx.lineTo(x - 16, y + 18); ctx.closePath(); ctx.fill();
        ctx.fillStyle = tr.color; ctx.fillRect(x - 20, y + 8, 40, 3);
      }
      // ficha
      ctx.fillStyle = tr.color;
      ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = used ? '#c9ccd2' : '#f7f4ec';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (u.fortified) { ctx.strokeStyle = '#5b6b8a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r + 6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      const icon = naval ? PP.NAVAL[Math.max(1, g.navalLevel(p))].icon : PP.UNITS[u.type].icon;
      const s = emojiSprite(icon, 22);
      const k = (22 * scale) / s._size;
      ctx.drawImage(s, x - s.width * k / 2, y - s.height * k / 2, s.width * k, s.height * k);
      // vida
      const maxHp = g.maxHp(u);
      const frac = PP.clamp(u.hp / maxHp, 0, 1);
      const hpCol = frac > 0.66 ? '#3bd16f' : frac > 0.33 ? '#f2c230' : '#f0523c';
      ctx.font = 'bold 12px Signika, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = String(Math.max(0, u.hp));
      const bw = Math.max(18, ctx.measureText(label).width + 8);
      ctx.fillStyle = 'rgba(20,24,32,0.85)';
      this.roundRect(ctx, x - bw / 2, y + r - 2, bw, 13, 6); ctx.fill();
      ctx.fillStyle = hpCol;
      ctx.fillText(label, x, y + r + 4.5);
      // patente
      const rank = g.rank(u);
      if (rank > 0) {
        ctx.fillStyle = '#ffd84a'; ctx.font = 'bold 12px Signika, system-ui';
        ctx.fillText(rank === 2 ? '★★' : '★', x, y - r - 6);
      }
      if (u.pendingPromo && u.owner === this.viewer) {
        ctx.fillStyle = '#ffd84a';
        ctx.beginPath(); ctx.arc(x + r, y - r + 2, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a2a00'; ctx.font = 'bold 10px Signika, system-ui'; ctx.fillText('↑', x + r, y - r + 2.5);
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
      const pos = this.tilePosW(c);
      const x = pos.x, y = pos.y + 36;
      ctx.save();
      ctx.font = 'bold 13px Signika, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const name = (c.capital ? '♛ ' : '') + c.name;
      const w = ctx.measureText(name).width + 34;
      ctx.fillStyle = PP.TRIBES[p.tribe].dark;
      this.roundRect(ctx, x - w / 2, y - 9, w, 18, 9); ctx.fill();
      ctx.fillStyle = PP.TRIBES[p.tribe].color;
      this.roundRect(ctx, x - w / 2, y - 9, 22, 18, 9); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(String(c.level), x - w / 2 + 11, y + 0.5);
      ctx.fillText(name, x + 11, y + 0.5);
      // população
      const need = c.level + 1;
      const segW = Math.min(9, 60 / need);
      const bx = x - (segW * need) / 2;
      for (let k = 0; k < need; k++) {
        ctx.fillStyle = k < c.pop ? '#7fe3ff' : 'rgba(10,14,22,0.75)';
        this.roundRect(ctx, bx + k * segW + 0.5, y + 11, segW - 1, 5, 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  PP.Renderer = Renderer;
  PP.TILE = { TW, TH, LH };
})(window.PP = window.PP || {});
