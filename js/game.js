/* Politopia+ — motor de regras. Não depende do DOM (pode rodar no Node para testes). */
(function (PP) {
  'use strict';
  const TER = PP.TERRAIN, UN = PP.UNITS;
  const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

  function cheb(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
  function skillSet(list) { const s = {}; for (const k of list) s[k] = true; return s; }
  for (const k in UN) UN[k]._sk = skillSet(UN[k].skills);
  PP.NAVAL.forEach(n => { if (n) n._sk = skillSet(n.skills); });

  class Game {
    constructor() { this.listeners = []; }

    on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(f => f !== fn); }; }
    emit(type, data) {
      for (const fn of this.listeners.slice()) {
        try { fn(type, data || {}); } catch (e) { console.error(e); }
      }
    }

    // ============================================================ Criação
    setup(opts) {
      this.opts = Object.assign({ size: 18, mapType: 'continentes', difficulty: 'normal', victory: 'dominacao', turnLimit: 40 }, opts);
      if (!this.opts.seed) this.opts.seed = (Math.random() * 2147483647) | 0;
      this.W = this.H = this.opts.size;
      this.rng = new PP.RNG(this.opts.seed);
      this.turn = 1; this.current = 0; this.nextId = 1;
      this.units = []; this.cities = []; this.players = [];
      this.wonders = {}; this.over = false; this.winner = null; this.endReason = null;
      this.logs = []; this.history = []; this.usedNames = {};
      this.opts.players.forEach((po, i) => this.players.push(this.newPlayer(i, po)));
      const caps = PP.generateMap(this);
      this.rebuildIndex();
      this.players.forEach((p, i) => {
        const tr = PP.TRIBES[p.tribe];
        const c = this.createCity(p.id, caps[i].x, caps[i].y, true);
        p.techs[tr.startTech] = true;
        if (tr.extraTech) p.techs[tr.extraTech] = true;
        this.createUnit(tr.startUnit || 'warrior', p.id, c.x, c.y, c.id);
        if (tr.extraUnit) {
          const spot = this.neighbors(c).find(n => !this.isWater(n) && n.terrain !== 'mountain' && !n.village && !this.uGrid[n.y * this.W + n.x]);
          if (spot) this.createUnit(tr.extraUnit, p.id, spot.x, spot.y, c.id);
        }
      });
      this.players.forEach(p => this.updateVision(p));
      this.recordHistory();
      this.beginTurn();
      return this;
    }

    newPlayer(i, po) {
      const tr = PP.TRIBES[po.tribe];
      const rel = {};
      this.opts.players.forEach((q, j) => { if (j !== i) rel[j] = { state: 'war', since: 0 }; });
      return {
        id: i, tribe: po.tribe, name: po.name || tr.name, color: tr.color, human: !!po.human,
        stars: 5, science: 4, techs: {}, alive: true,
        explored: new Uint8Array(this.W * this.H), visible: new Uint8Array(this.W * this.H),
        rel, met: {}, reputation: 0, proposals: [], pendingRewards: [], lastPeaceAsk: {},
        stats: { kills: 0, losses: 0, captured: 0, built: 0 }, capital: null,
        ai: { aggr: 0.75 + this.rng.next() * 0.5, sci: 0.7 + this.rng.next() * 0.6, eco: 0.8 + this.rng.next() * 0.4 },
      };
    }

    rebuildIndex() {
      this.uGrid = new Array(this.W * this.H).fill(null);
      this.cityMap = {};
      for (const c of this.cities) { this.cityMap[c.id] = c; this.usedNames[c.name] = 1; }
      for (const u of this.units) this.uGrid[u.y * this.W + u.x] = u;
    }

    // ============================================================ Consultas básicas
    inb(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
    tile(x, y) { return this.inb(x, y) ? this.tiles[y * this.W + x] : null; }
    tileAt(o) { return this.tiles[o.y * this.W + o.x]; }
    idx(x, y) { return y * this.W + x; }
    unitAt(x, y) { return this.inb(x, y) ? this.uGrid[y * this.W + x] : null; }
    cityAt(x, y) { const t = this.tile(x, y); return t && t.city ? this.cityMap[t.city] : null; }
    dist(a, b) { return cheb(a, b); }
    neighbors(t, r) {
      r = r || 1;
      const out = [];
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (!dx && !dy) continue;
        const n = this.tile(t.x + dx, t.y + dy);
        if (n) out.push(n);
      }
      return out;
    }
    isWater(t) { return !!TER[t.terrain].water; }
    has(p, tech) { return !!p.techs[tech]; }
    citiesOf(pid) { return this.cities.filter(c => c.owner === pid); }
    unitsOf(pid) { return this.units.filter(u => u.owner === pid); }
    navalLevel(p) { return this.has(p, 'eng_naval') ? 3 : this.has(p, 'cartografia') ? 2 : this.has(p, 'navegacao') ? 1 : 0; }
    get currentPlayer() { return this.players[this.current]; }

    atWar(a, b) {
      if (a === b || a < 0 || b < 0 || a == null || b == null) return false;
      const r = this.players[a].rel[b];
      return !r || r.state === 'war';
    }
    atPeace(a, b) { return a !== b && a >= 0 && b >= 0 && !this.atWar(a, b); }

    log(text, to) {
      this.logs.push({ turn: this.turn, text, to: to == null ? null : [].concat(to) });
      if (this.logs.length > 250) this.logs.shift();
      this.emit('log', { text, to });
    }

    // ============================================================ Cidades e unidades
    cityName(owner) {
      const s = PP.TRIBES[this.players[owner].tribe].syl;
      for (let k = 0; k < 60; k++) {
        let n = this.rng.pick(s[0]) + this.rng.pick(s[1]) + this.rng.pick(s[2]);
        n = n.charAt(0).toUpperCase() + n.slice(1);
        if (n.length >= 3 && !this.usedNames[n]) { this.usedNames[n] = 1; return n; }
      }
      return 'Vila ' + this.nextId;
    }

    createCity(owner, x, y, capital) {
      const t = this.tile(x, y);
      const c = {
        id: this.nextId++, name: this.cityName(owner), owner, x, y, level: 1, pop: 0, capital: !!capital,
        origCapital: capital ? owner : -1, buildings: {}, workshop: 0, academy: 0, parks: 0, radius: 1,
        connected: false, founded: this.turn,
      };
      this.cities.push(c);
      this.cityMap[c.id] = c;
      t.city = c.id; t.village = false; t.res = null; t.imp = null; t.ruin = false;
      t.owner = owner; t.cityId = c.id;
      this.claimTerritory(c);
      if (capital) this.players[owner].capital = c.id;
      return c;
    }

    claimTerritory(c) {
      for (let dy = -c.radius; dy <= c.radius; dy++) for (let dx = -c.radius; dx <= c.radius; dx++) {
        const t = this.tile(c.x + dx, c.y + dy);
        if (t && t.owner === -1) { t.owner = c.owner; t.cityId = c.id; }
      }
    }

    createUnit(type, owner, x, y, home, ready) {
      const u = {
        id: this.nextId++, type, owner, x, y, hp: UN[type].hp, mp: 0, canAttack: false, moved: true, attacked: false,
        xp: 0, promos: [], pendingPromo: 0, fortified: false, home: home || null,
      };
      if (ready) { u.mp = this.stat(u).move; u.canAttack = true; u.moved = false; }
      this.units.push(u);
      this.uGrid[y * this.W + x] = u;
      return u;
    }

    maxHp(u) { let n = 0; for (const p of u.promos) if (p === 'vigor') n++; return UN[u.type].hp + 5 * n; }
    rank(u) { return u.xp >= PP.XP_LEVELS[1] ? 2 : u.xp >= PP.XP_LEVELS[0] ? 1 : 0; }

    stat(u) {
      const base = UN[u.type];
      const p = this.players[u.owner];
      const t = this.tiles[u.y * this.W + u.x];
      let s;
      if (TER[t.terrain].water) {
        const N = PP.NAVAL[Math.max(1, this.navalLevel(p))];
        s = { name: N.name, icon: N.icon, atk: N.atk, def: N.def, move: N.move + (p.tribe === 'vikar' ? 1 : 0), range: N.range,
          vision: 2, skills: N._sk, naval: true, mounted: false };
      } else {
        s = { name: base.name, icon: base.icon, atk: base.atk, def: base.def, move: base.move, range: base.range,
          vision: base.vision + (TER[t.terrain].vision || 0), skills: base._sk, naval: false, mounted: !!base.mounted };
      }
      for (const pr of u.promos) {
        if (pr === 'forca') s.atk += 0.5;
        else if (pr === 'escudo') s.def += 0.5;
        else if (pr === 'agilidade') s.move += 1;
      }
      s.maxHp = this.maxHp(u);
      return s;
    }

    cityUnits(c) { return this.units.filter(u => u.home === c.id); }
    capacity(c) { return c.level + 1 + (c.buildings.barracks ? 2 : 0); }

    // ============================================================ Visão e contato
    updateVision(p) {
      if (!p.alive) { p.visible.fill(0); return; }
      const W = this.W, H = this.H, vis = p.visible;
      vis.fill(0);
      const mark = (cx, cy, r) => {
        for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++)
          for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) vis[y * W + x] = 1;
      };
      for (const u of this.units) if (u.owner === p.id) mark(u.x, u.y, this.stat(u).vision);
      for (const c of this.cities) if (c.owner === p.id) mark(c.x, c.y, c.radius + 1);
      for (let i = 0; i < this.tiles.length; i++) {
        if (this.tiles[i].owner === p.id) vis[i] = 1;
        if (vis[i]) p.explored[i] = 1;
      }
      this.checkMeet(p);
    }

    checkMeet(p) {
      const vis = p.visible;
      for (let i = 0; i < vis.length; i++) {
        if (!vis[i]) continue;
        const t = this.tiles[i], u = this.uGrid[i];
        let q = -1;
        if (u && u.owner !== p.id) q = u.owner;
        else if (t.owner >= 0 && t.owner !== p.id) q = t.owner;
        if (q >= 0 && !p.met[q] && this.players[q].alive) this.meet(p, this.players[q]);
      }
    }

    meet(a, b) {
      a.met[b.id] = true; b.met[a.id] = true;
      this.log(`${a.name} encontrou ${b.name}.`, [a.id, b.id]);
      this.emit('meet', { a: a.id, b: b.id });
    }

    reveal(p, cx, cy, r) {
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++)
        if (this.inb(x, y)) p.explored[y * this.W + x] = 1;
    }

    // ============================================================ Movimento
    enterCost(u, st, p, from, to) {
      const tw = TER[to.terrain].water, fw = TER[from.terrain].water;
      if (tw) {
        if (!fw) {
          if (to.imp === 'port' && to.owner === u.owner && this.navalLevel(p) >= 1) return { cost: 1, stop: true };
          return null;
        }
        const nl = this.navalLevel(p);
        if (nl < 1 || (to.terrain === 'ocean' && nl < 2)) return null;
        return { cost: 1, stop: false };
      }
      if (to.terrain === 'mountain' && (!this.has(p, 'escalada') || UN[u.type].mounted)) return null;
      if (to.city) {
        const c = this.cityMap[to.city];
        if (c.owner !== u.owner && !this.atWar(u.owner, c.owner)) return null;
      }
      if (fw) return { cost: 1, stop: true };
      let cost = TER[to.terrain].cost;
      if (st.skills.creep) cost = 1;
      else if (to.terrain === 'forest' && p.tribe === 'tupina') cost = 1;
      if ((from.road || from.city) && (to.road || to.city) && (from.road || to.road)) cost = 0.5;
      return { cost, stop: false };
    }

    zocGrid(owner) {
      const z = new Uint8Array(this.W * this.H);
      for (const e of this.units) {
        if (!this.atWar(owner, e.owner)) continue;
        for (const d of DIRS) {
          const x = e.x + d[0], y = e.y + d[1];
          if (this.inb(x, y)) z[y * this.W + x] = 1;
        }
      }
      return z;
    }

    // Casas alcançáveis neste turno: Map(índice -> {spent, prev, stop})
    reachable(u) {
      const res = new Map();
      res.all = new Map();
      if (u.mp <= 0) return res;
      const W = this.W, p = this.players[u.owner], st = this.stat(u);
      const zoc = this.zocGrid(u.owner);
      const start = u.y * W + u.x;
      const best = res.all;
      best.set(start, { spent: 0, prev: -1, stop: false, done: false, occ: false });
      const open = [start];
      while (open.length) {
        let bi = 0;
        for (let i = 1; i < open.length; i++) if (best.get(open[i]).spent < best.get(open[bi]).spent) bi = i;
        const cur = open[bi];
        open[bi] = open[open.length - 1]; open.pop();
        const node = best.get(cur);
        if (node.done) continue;
        node.done = true;
        if (node.stop || node.spent >= u.mp - 1e-9) continue;
        const ct = this.tiles[cur];
        for (const d of DIRS) {
          const nx = ct.x + d[0], ny = ct.y + d[1];
          if (!this.inb(nx, ny)) continue;
          const ni = ny * W + nx;
          if (!p.explored[ni]) continue;
          const occ = this.uGrid[ni];
          if (occ && occ.owner !== u.owner) continue;
          const nt = this.tiles[ni];
          const info = this.enterCost(u, st, p, ct, nt);
          if (!info) continue;
          const spent = node.spent + info.cost;
          const stop = info.stop || zoc[ni] === 1;
          const ex = best.get(ni);
          if (ex && ex.done) continue;
          if (!ex || spent < ex.spent - 1e-9 || (Math.abs(spent - ex.spent) < 1e-9 && ex.stop && !stop)) {
            best.set(ni, { spent, prev: cur, stop, done: false, occ: !!occ });
            open.push(ni);
          }
        }
      }
      for (const [k, v] of best) if (k !== start && !v.occ) res.set(k, v);
      return res;
    }

    moveUnit(u, x, y, reach) {
      if (this.over) return false;
      reach = reach || this.reachable(u);
      const k = y * this.W + x;
      const node = reach.get(k);
      if (!node) return false;
      const path = [];
      for (let c = k; c !== u.y * this.W + u.x && c >= 0; c = reach.all.get(c).prev) path.unshift({ x: c % this.W, y: (c / this.W) | 0 });
      const before = this.stat(u);
      const from = { x: u.x, y: u.y };
      this.uGrid[u.y * this.W + u.x] = null;
      u.x = x; u.y = y;
      this.uGrid[k] = u;
      u.mp = node.stop ? 0 : Math.max(0, u.mp - node.spent);
      u.moved = true; u.fortified = false;
      if (!before.skills.dash) u.canAttack = false;
      this.emit('move', { unit: u, from, path });
      const t = this.tiles[k];
      if (t.ruin) this.exploreRuin(u, t);
      this.updateVision(this.players[u.owner]);
      return true;
    }

    // ============================================================ Ruínas
    exploreRuin(u, t) {
      t.ruin = false;
      const p = this.players[u.owner];
      let r = this.rng.weighted([['stars', 3], ['science', 3], ['tech', 2], ['unit', 2], ['map', 2], ['pop', 2]]);
      let text = '';
      if (r === 'tech') {
        const opts = PP.TECHS.filter(tc => !p.techs[tc.id] && tc.tier <= 3 && tc.req.every(q => p.techs[q]));
        if (opts.length) { const tc = this.rng.pick(opts); p.techs[tc.id] = true; text = `descobriu a tecnologia ${tc.name}!`; this.emit('tech', { player: p.id, tech: tc.id }); }
        else r = 'stars';
      }
      if (r === 'unit') {
        const spot = this.neighbors(t).concat([t]).find(n => !this.isWater(n) && !this.uGrid[n.y * this.W + n.x] && n.terrain !== 'mountain');
        if (spot && spot !== t) {
          const nu = this.createUnit('swordsman', p.id, spot.x, spot.y, null);
          nu.xp = PP.XP_LEVELS[0]; nu.pendingPromo = 1;
          if (!p.human && PP.AI) PP.AI.autoPromote(this, nu);
          text = 'encontrou um Espadachim veterano!';
        } else r = 'stars';
      }
      if (r === 'pop') {
        let best = null, bd = 1e9;
        for (const c of this.citiesOf(p.id)) { const d = cheb(c, t); if (d < bd) { bd = d; best = c; } }
        if (best) { text = `encontrou sobreviventes: +3 população em ${best.name}!`; this.addPop(best, 3); }
        else r = 'stars';
      }
      if (r === 'map') { this.reveal(p, t.x, t.y, 5); text = 'encontrou um mapa antigo!'; }
      if (r === 'science') { p.science += 8; text = 'encontrou pergaminhos: +8⚗!'; }
      if (r === 'stars') { p.stars += 10; text = 'encontrou um tesouro: +10★!'; }
      this.log(`${p.name} explorou ruínas e ${text}`, p.id);
      this.emit('ruin', { player: p.id, tile: t, reward: r, text });
    }

    // ============================================================ Combate
    defenseBonus(d, attacker) {
      const t = this.tiles[d.y * this.W + d.x];
      const p = this.players[d.owner];
      const st = this.stat(d);
      let b = 1;
      if (t.city && this.cityMap[t.city].owner === d.owner) {
        b = this.cityMap[t.city].buildings.walls ? 3 : 1.5;
        if (this.wonders.great_wall === d.owner) b += 0.5;
      } else if (!st.naval) {
        if (t.terrain === 'forest' && (this.has(p, 'arco') || p.tribe === 'tupina')) b = 1.5;
        else if (t.terrain === 'mountain' && this.has(p, 'escalada')) b = 1.5;
        else if (t.terrain === 'hills') b = 1.25;
        else if (t.terrain === 'swamp') b = 0.8;
      }
      if (d.fortified) b *= 1.25;
      if (attacker && st.skills.antimount && this.stat(attacker).mounted) b *= 2;
      return b;
    }

    previewAttack(a, d) {
      const sa = this.stat(a), sd = this.stat(d);
      let atk = sa.atk;
      if (sa.skills.antimount && sd.mounted) atk *= 1.5;
      const aF = atk * a.hp / sa.maxHp;
      const dF = sd.def * d.hp / sd.maxHp * this.defenseBonus(d, a);
      const tot = aF + dF;
      const dmg = tot > 0 ? Math.round(aF / tot * atk * 4.5) : 0;
      const ret = tot > 0 ? Math.round(dF / tot * sd.def * 4.5) : 0;
      const kill = dmg >= d.hp;
      const retaliates = !kill && !sd.skills.stiff && sd.def > 0 && cheb(a, d) <= sd.range;
      return { dmg, ret: retaliates ? ret : 0, kill, retaliates, retKill: retaliates && ret >= a.hp };
    }

    canAttackUnit(a, d) {
      if (!a.canAttack || !d || a.owner === d.owner) return false;
      const st = this.stat(a);
      if (st.atk <= 0) return false;
      if (!this.atWar(a.owner, d.owner)) return false;
      if (cheb(a, d) > st.range) return false;
      return !!this.players[a.owner].visible[d.y * this.W + d.x];
    }

    attackTargets(a) {
      if (!a.canAttack) return [];
      const st = this.stat(a);
      if (st.atk <= 0) return [];
      const out = [];
      for (const d of this.units) if (cheb(a, d) <= st.range && this.canAttackUnit(a, d)) out.push(d);
      return out;
    }

    attack(a, d) {
      if (this.over || !this.canAttackUnit(a, d)) return null;
      const r = this.previewAttack(a, d);
      const sa = this.stat(a);
      const dPos = { x: d.x, y: d.y };
      d.hp -= r.dmg;
      a.canAttack = false; a.attacked = true; a.fortified = false;
      if (!sa.skills.escape) a.mp = 0;
      const ev = { attacker: a, defender: d, dmg: r.dmg, ret: 0, killed: false, attackerKilled: false, splash: [], from: { x: a.x, y: a.y }, to: dPos };
      if (d.hp <= 0) {
        ev.killed = true;
        this.killUnit(d, a);
        this.gainXp(a, 1);
        if (sa.skills.persist) a.canAttack = true;
        // Unidades corpo a corpo avançam para a casa do derrotado
        if (sa.range === 1 && !sa.skills.stiff) {
          const tt = this.tiles[dPos.y * this.W + dPos.x];
          const ft = this.tiles[a.y * this.W + a.x];
          if (this.isWater(tt) === this.isWater(ft) && this.enterCost(a, sa, this.players[a.owner], ft, tt)) {
            this.uGrid[a.y * this.W + a.x] = null;
            a.x = dPos.x; a.y = dPos.y;
            this.uGrid[a.y * this.W + a.x] = a;
            ev.advanced = true;
            if (tt.ruin) this.exploreRuin(a, tt);
          }
        }
      } else if (r.retaliates) {
        a.hp -= r.ret; ev.ret = r.ret;
        if (a.hp <= 0) { ev.attackerKilled = true; this.killUnit(a, d); this.gainXp(d, 1); }
      }
      if (sa.skills.splash) {
        const splash = Math.floor(r.dmg / 2);
        for (const n of this.neighbors(dPos)) {
          const e = this.uGrid[n.y * this.W + n.x];
          if (e && e !== a && this.atWar(a.owner, e.owner) && splash > 0) {
            e.hp -= splash;
            ev.splash.push({ unit: e, dmg: splash, x: e.x, y: e.y });
            if (e.hp <= 0) { this.killUnit(e, a); this.gainXp(a, 1); }
          }
        }
      }
      this.emit('attack', ev);
      this.updateVision(this.players[a.owner]);
      if (this.players[d.owner]) this.updateVision(this.players[d.owner]);
      return ev;
    }

    killUnit(u, killer) {
      const i = this.units.indexOf(u);
      if (i < 0) return;
      this.units.splice(i, 1);
      if (this.uGrid[u.y * this.W + u.x] === u) this.uGrid[u.y * this.W + u.x] = null;
      u.dead = true;
      this.players[u.owner].stats.losses++;
      if (killer) this.players[killer.owner].stats.kills++;
      this.emit('death', { unit: u, killer });
    }

    gainXp(u, n) {
      if (u.dead) return;
      const p = this.players[u.owner];
      if (p.tribe === 'zambe') n *= 2;
      const before = this.rank(u);
      u.xp += n;
      const after = this.rank(u);
      if (after > before) {
        u.pendingPromo += after - before;
        this.emit('veteran', { unit: u });
        if (!p.human && PP.AI) PP.AI.autoPromote(this, u);
      }
    }

    promote(u, pr) {
      if (!u.pendingPromo || !PP.PROMOTIONS[pr]) return false;
      u.promos.push(pr);
      u.pendingPromo--;
      u.hp = this.maxHp(u);
      this.emit('promote', { unit: u, promo: pr });
      return true;
    }

    // ============================================================ Outras ações de unidade
    canCapture(u) {
      if (u.moved || u.attacked) return false;
      const t = this.tileAt(u);
      if (t.village) return true;
      if (t.city) { const c = this.cityMap[t.city]; return c.owner !== u.owner && this.atWar(u.owner, c.owner); }
      return false;
    }

    capture(u) {
      if (this.over || !this.canCapture(u)) return false;
      const t = this.tileAt(u), p = this.players[u.owner];
      let c, old = null;
      if (t.village) {
        c = this.createCity(u.owner, t.x, t.y, false);
        this.log(`${p.name} fundou ${c.name}.`, p.id);
      } else {
        c = this.cityMap[t.city];
        old = this.players[c.owner];
        if (old.capital === c.id) old.capital = null;
        c.capital = false;
        c.owner = u.owner; c.connected = false;
        if (c.origCapital === p.id) { c.capital = true; p.capital = c.id; }
        for (const tt of this.tiles) if (tt.cityId === c.id) tt.owner = u.owner;
        for (const x of this.units) if (x.home === c.id && x.owner !== u.owner) x.home = null;
        p.stats.captured++;
        this.log(`${p.name} conquistou ${c.name} de ${old.name}!`, null);
      }
      u.mp = 0; u.canAttack = false; u.moved = true;
      this.emit('capture', { unit: u, city: c, from: old ? old.id : -1 });
      this.updateVision(p);
      if (old) { this.updateVision(old); this.checkElimination(old); }
      this.checkVictory();
      return true;
    }

    canRecover(u) { return !u.moved && !u.attacked && u.hp < this.maxHp(u); }
    recover(u) {
      if (!this.canRecover(u)) return false;
      const t = this.tileAt(u), p = this.players[u.owner];
      let amt = 2;
      if (t.owner === u.owner) amt = 4;
      if (t.city && this.cityMap[t.city].owner === u.owner) amt = 6 + (this.cityMap[t.city].buildings.temple ? 3 : 0);
      if (p.tribe === 'zambe') amt += 2;
      const before = u.hp;
      u.hp = Math.min(this.maxHp(u), u.hp + amt);
      u.mp = 0; u.canAttack = false; u.moved = true;
      this.emit('heal', { units: [{ unit: u, amount: u.hp - before }] });
      return true;
    }

    canFortify(u) { return !!this.stat(u).skills.fortify && !u.fortified && !u.moved && !u.attacked; }
    fortify(u) {
      if (!this.canFortify(u)) return false;
      u.fortified = true; u.mp = 0; u.canAttack = false; u.moved = true;
      this.emit('fortify', { unit: u });
      return true;
    }

    canHealOthers(u) {
      if (!this.stat(u).skills.heal || !u.canAttack) return false;
      return this.neighbors(u).some(n => { const o = this.uGrid[n.y * this.W + n.x]; return o && o.owner === u.owner && o.hp < this.maxHp(o); });
    }
    healOthers(u) {
      if (!this.canHealOthers(u)) return false;
      const list = [];
      for (const n of this.neighbors(u)) {
        const o = this.uGrid[n.y * this.W + n.x];
        if (o && o.owner === u.owner && o.hp < this.maxHp(o)) {
          const b = o.hp; o.hp = Math.min(this.maxHp(o), o.hp + 4); list.push({ unit: o, amount: o.hp - b });
        }
      }
      u.canAttack = false; u.attacked = true; u.mp = 0;
      this.emit('heal', { units: list, healer: u });
      return true;
    }

    convertTargets(u) {
      if (!this.stat(u).skills.convert || !u.canAttack) return [];
      return this.units.filter(d => cheb(u, d) === 1 && d.owner !== u.owner && this.atWar(u.owner, d.owner) &&
        this.players[u.owner].visible[d.y * this.W + d.x]);
    }
    convert(u, d) {
      if (this.convertTargets(u).indexOf(d) < 0) return false;
      const old = this.players[d.owner];
      d.owner = u.owner; d.home = null; d.mp = 0; d.canAttack = false; d.moved = true; d.fortified = false;
      u.canAttack = false; u.attacked = true; u.mp = 0;
      this.gainXp(u, 1);
      this.emit('convert', { unit: u, target: d, from: old.id });
      this.updateVision(this.players[u.owner]);
      this.updateVision(old);
      return true;
    }

    disband(u) {
      if (u.owner !== this.current) return false;
      const i = this.units.indexOf(u);
      if (i < 0) return false;
      this.units.splice(i, 1);
      this.uGrid[u.y * this.W + u.x] = null;
      u.dead = true;
      this.emit('death', { unit: u, disband: true });
      this.updateVision(this.players[u.owner]);
      return true;
    }

    // ============================================================ Treinar unidades
    hasStrategic(p, key) {
      const imp = PP.STRATEGIC[key].imp;
      for (const t of this.tiles) if (t.owner === p.id && t.imp === imp) return true;
      return false;
    }

    trainCheck(p, c, type) {
      const d = UN[type];
      const r = { ok: false, cost: d.cost, reason: '' };
      if (!c || c.owner !== p.id) { r.reason = 'Cidade inválida'; return r; }
      if (d.tech && !this.has(p, d.tech)) { r.reason = 'Requer ' + PP.TECH[d.tech].name; r.locked = true; return r; }
      if (d.needs && !this.hasStrategic(p, d.needs)) { r.reason = 'Requer ' + PP.STRATEGIC[d.needs].name; return r; }
      if (this.uGrid[c.y * this.W + c.x]) { r.reason = 'Cidade ocupada'; return r; }
      if (this.cityUnits(c).length >= this.capacity(c)) { r.reason = 'Capacidade máxima'; return r; }
      if (p.stars < d.cost) { r.reason = 'Faltam estrelas'; return r; }
      r.ok = true;
      return r;
    }

    train(p, c, type) {
      if (this.over || p.id !== this.current || !this.trainCheck(p, c, type).ok) return null;
      p.stars -= UN[type].cost;
      const u = this.createUnit(type, p.id, c.x, c.y, c.id);
      if (c.buildings.barracks) u.xp = 1;
      this.emit('train', { unit: u, city: c });
      this.updateVision(p);
      return u;
    }

    // ============================================================ Melhorias de terreno
    tileEmpty(t) { return !t.res && !t.imp && !t.city && !t.village && !t.wonder && !t.ruin; }

    countAdj(t, imp, owner) {
      let n = 0;
      for (const nb of this.neighbors(t)) if (nb.imp === imp && (owner == null || nb.owner === owner)) n++;
      return n;
    }

    marketValue(t) {
      let v = 0;
      for (const nb of this.neighbors(t)) if (nb.owner === t.owner && (nb.imp === 'sawmill' || nb.imp === 'windmill' || nb.imp === 'forge')) v += nb.impLevel;
      return Math.min(8, v);
    }

    // Verifica uma ação; visible=false significa que nem deve aparecer para esta casa
    tileActionCheck(p, t, id) {
      const a = PP.TILE_ACTION[id];
      const r = { ok: false, visible: false, reason: '', cost: a.cost };
      if (!p.explored[t.y * this.W + t.x] || t.city || t.village) return r;
      if (a.road) {
        if (this.isWater(t) || t.road || t.terrain === 'mountain' || !(t.owner === p.id || t.owner === -1)) return r;
      } else if (t.owner !== p.id) return r;
      if (a.res && t.res !== a.res) return r;
      if (a.terrain && a.terrain.indexOf(t.terrain) < 0) return r;
      if (a.empty && !this.tileEmpty(t)) return r;
      if (a.noImp && (t.imp || t.wonder)) return r;
      if (a.adj && this.countAdj(t, a.adj, p.id) === 0) return r;
      if (id === 'market' && !this.neighbors(t).some(n => n.owner === p.id && (n.imp === 'sawmill' || n.imp === 'windmill' || n.imp === 'forge'))) return r;
      if (a.unique && this.tiles.some(o => o.cityId === t.cityId && o.imp === a.imp)) return r;
      r.visible = true;
      const occ = this.uGrid[t.y * this.W + t.x];
      if (a.tech && !this.has(p, a.tech)) { r.reason = 'Requer ' + PP.TECH[a.tech].name; r.locked = true; return r; }
      if (occ && occ.owner !== p.id) { r.reason = 'Casa ocupada pelo inimigo'; return r; }
      if (p.stars < a.cost) { r.reason = 'Faltam estrelas'; return r; }
      r.ok = true;
      return r;
    }

    tileActions(p, t) {
      const out = [];
      for (const a of PP.TILE_ACTIONS) {
        const r = this.tileActionCheck(p, t, a.id);
        if (r.visible) out.push(Object.assign({ id: a.id, def: a }, r));
      }
      return out;
    }

    doTileAction(p, t, id) {
      if (this.over || p.id !== this.current) return false;
      const chk = this.tileActionCheck(p, t, id);
      if (!chk.ok) return false;
      const a = PP.TILE_ACTION[id];
      p.stars -= a.cost;
      const city = t.cityId ? this.cityMap[t.cityId] : null;
      if (a.consume) t.res = null;
      if (a.gold) p.stars += a.gold;
      if (a.toTerrain) {
        const keep = t.res && a.toTerrain === 'plains' && (t.res === 'fruit' || t.res === 'crop' || t.res === 'horses');
        t.terrain = a.toTerrain;
        t.res = a.newRes || (keep ? t.res : null);
      }
      if (a.road) t.road = true;
      let pop = a.pop || 0;
      if (id === 'fishing' && p.tribe === 'vikar') pop += 1;
      if (a.imp) {
        t.imp = a.imp; t.res = null; t.impLevel = 0;
        if ((a.imp === 'mine' || a.imp === 'gemmine') && p.tribe === 'aymara') pop += 1;
        if (a.adj) { pop = this.countAdj(t, a.adj, p.id) * a.per; t.impLevel = pop; }
      }
      if (city && city.owner === p.id && pop) this.addPop(city, pop);
      const feed = { lumber: ['sawmill', 1], farm: ['windmill', 1], mine: ['forge', 2] }[a.imp];
      if (feed) {
        for (const nb of this.neighbors(t)) {
          if (nb.imp === feed[0] && nb.owner === p.id) {
            nb.impLevel += feed[1];
            const nc = this.cityMap[nb.cityId];
            if (nc && nc.owner === p.id) this.addPop(nc, feed[1]);
          }
        }
      }
      p.stats.built++;
      this.emit('build', { player: p.id, tile: t, action: id });
      this.updateVision(p);
      return true;
    }

    // ============================================================ Maravilhas
    wonderCheck(p, t, wid) {
      const w = PP.WONDERS[wid];
      const r = { ok: false, visible: false, reason: '', cost: w.cost };
      if (t.owner !== p.id || this.isWater(t) || !this.tileEmpty(t) || this.wonders[wid] != null) return r;
      if (!this.has(p, w.tech)) return r;
      if (w.coastal && !this.neighbors(t).some(n => this.isWater(n))) return r;
      r.visible = true;
      const occ = this.uGrid[t.y * this.W + t.x];
      if (occ && occ.owner !== p.id) { r.reason = 'Casa ocupada pelo inimigo'; return r; }
      if (p.stars < w.cost) { r.reason = 'Faltam estrelas'; return r; }
      r.ok = true;
      return r;
    }

    wonderActions(p, t) {
      const out = [];
      for (const wid in PP.WONDERS) {
        const r = this.wonderCheck(p, t, wid);
        if (r.visible) out.push(Object.assign({ id: wid, def: PP.WONDERS[wid] }, r));
      }
      return out;
    }

    buildWonder(p, t, wid) {
      if (this.over || p.id !== this.current || !this.wonderCheck(p, t, wid).ok) return false;
      const w = PP.WONDERS[wid];
      p.stars -= w.cost;
      t.wonder = wid;
      this.wonders[wid] = p.id;
      const city = this.cityMap[t.cityId];
      if (city) this.addPop(city, PP.WONDER_POP);
      if (wid === 'oracle') {
        const opts = PP.TECHS.filter(tc => !p.techs[tc.id] && tc.req.every(q => p.techs[q])).sort((a, b) => a.tier - b.tier);
        if (opts.length) { p.techs[opts[0].id] = true; this.emit('tech', { player: p.id, tech: opts[0].id }); }
      }
      if (wid === 'eye') p.explored.fill(1);
      this.log(`${p.name} construiu a maravilha ${w.name}!`, null);
      this.emit('wonder', { player: p.id, tile: t, wonder: wid });
      this.updateVision(p);
      return true;
    }

    // ============================================================ Construções de cidade
    buildingCost(p, id) {
      const b = PP.BUILDINGS[id];
      return id === 'walls' && this.has(p, 'arquitetura') ? Math.ceil(b.cost / 2) : b.cost;
    }

    buildingCheck(p, c, id) {
      const b = PP.BUILDINGS[id];
      const r = { ok: false, cost: this.buildingCost(p, id), reason: '' };
      if (!c || c.owner !== p.id) { r.reason = 'Cidade inválida'; return r; }
      if (c.buildings[id]) { r.reason = 'Construído'; r.done = true; return r; }
      if (b.tech && !this.has(p, b.tech)) { r.reason = 'Requer ' + PP.TECH[b.tech].name; r.locked = true; return r; }
      if (b.needs && !c.buildings[b.needs]) { r.reason = 'Requer ' + PP.BUILDINGS[b.needs].name; return r; }
      if (p.stars < r.cost) { r.reason = 'Faltam estrelas'; return r; }
      r.ok = true;
      return r;
    }

    build(p, c, id) {
      if (this.over || p.id !== this.current) return false;
      const chk = this.buildingCheck(p, c, id);
      if (!chk.ok) return false;
      p.stars -= chk.cost;
      c.buildings[id] = true;
      const b = PP.BUILDINGS[id];
      if (b.pop) this.addPop(c, b.pop);
      this.emit('building', { player: p.id, city: c, building: id });
      return true;
    }

    // ============================================================ População e níveis
    addPop(c, n) {
      if (!c || n <= 0) return;
      c.pop += n;
      this.emit('pop', { city: c, amount: n });
      while (c.pop >= c.level + 1) {
        c.pop -= c.level + 1;
        c.level++;
        this.onLevelUp(c);
      }
    }

    rewardOptions(c) {
      const L = c.level;
      if (L === 2) return ['workshop', 'academy'];
      if (L === 3) return [c.buildings.walls ? 'scholars' : 'walls', 'resources', 'explorer'];
      if (L === 4) return ['growth', c.radius < 2 ? 'borders' : 'scholars'];
      return ['park', 'giant'];
    }

    onLevelUp(c) {
      const p = this.players[c.owner];
      const options = this.rewardOptions(c);
      this.emit('levelup', { city: c });
      if (p.human) p.pendingRewards.push({ cityId: c.id, level: c.level, options });
      else {
        const r = PP.AI ? PP.AI.chooseReward(this, p, c, options) : options[0];
        this.applyReward(c, r);
      }
    }

    chooseReward(p, reward) {
      const pr = p.pendingRewards[0];
      if (!pr || pr.options.indexOf(reward) < 0) return false;
      p.pendingRewards.shift();
      const c = this.cityMap[pr.cityId];
      if (c && c.owner === p.id) this.applyReward(c, reward);
      return true;
    }

    applyReward(c, r) {
      const p = this.players[c.owner];
      switch (r) {
        case 'workshop': c.workshop++; break;
        case 'academy': c.academy++; break;
        case 'walls': c.buildings.walls = true; break;
        case 'scholars': p.science += 6; break;
        case 'resources': p.stars += 5; break;
        case 'explorer': {
          this.reveal(p, c.x, c.y, 3);
          for (let k = 0; k < 4; k++) {
            const a = this.rng.next() * Math.PI * 2;
            for (let s = 2; s <= 8; s++) this.reveal(p, Math.round(c.x + Math.cos(a) * s), Math.round(c.y + Math.sin(a) * s), 1);
          }
          break;
        }
        case 'growth': this.addPop(c, 3); break;
        case 'borders': c.radius = 2; this.claimTerritory(c); break;
        case 'park': c.parks++; break;
        case 'giant': {
          let spot = null;
          if (!this.uGrid[c.y * this.W + c.x]) spot = c;
          else spot = this.neighbors(c).find(n => !this.isWater(n) && !this.uGrid[n.y * this.W + n.x] && n.terrain !== 'mountain' && !(n.city && this.cityMap[n.city].owner !== c.owner));
          if (spot) this.createUnit('giant', p.id, spot.x, spot.y, null);
          else p.stars += 10;
          break;
        }
      }
      this.emit('reward', { city: c, reward: r });
      this.updateVision(p);
    }

    // ============================================================ Tecnologia
    techCost(p, id) {
      const t = PP.TECH[id];
      let c = PP.TECH_BASE[t.tier] + t.tier * 1.5 * Math.max(1, this.citiesOf(p.id).length);
      if (p.tribe === 'hanlu') c *= 0.9;
      if (this.has(p, 'filosofia')) c *= 0.85;
      return Math.max(1, Math.round(c));
    }
    allTechs(p) { return PP.TECHS.every(t => p.techs[t.id]); }
    futureCost(p) { return 30 + 12 * (p.future || 0) + 3 * this.citiesOf(p.id).length; }
    researchFuture(p) {
      if (this.over || p.id !== this.current || !this.allTechs(p)) return false;
      const cost = this.futureCost(p);
      if (p.science < cost) return false;
      p.science -= cost;
      p.future = (p.future || 0) + 1;
      this.emit('tech', { player: p.id, tech: 'future' });
      return true;
    }
    techState(p, id) {
      if (p.techs[id]) return 'done';
      return PP.TECH[id].req.every(q => p.techs[q]) ? 'available' : 'locked';
    }
    research(p, id) {
      if (this.over || p.id !== this.current || this.techState(p, id) !== 'available') return false;
      const cost = this.techCost(p, id);
      if (p.science < cost) return false;
      p.science -= cost;
      p.techs[id] = true;
      this.emit('tech', { player: p.id, tech: id });
      return true;
    }

    // ============================================================ Economia
    updateConnections(p) {
      const mine = this.citiesOf(p.id);
      const cap = p.capital ? this.cityMap[p.capital] : null;
      if (!cap || cap.owner !== p.id) { mine.forEach(c => { c.connected = false; }); return; }
      const W = this.W, seen = new Uint8Array(W * this.H);
      const start = cap.y * W + cap.x;
      seen[start] = 1;
      const q = [start];
      while (q.length) {
        const i = q.pop(), t = this.tiles[i];
        const tWater = this.isWater(t);
        for (const d of DIRS) {
          const x = t.x + d[0], y = t.y + d[1];
          if (!this.inb(x, y)) continue;
          const j = y * W + x;
          if (seen[j]) continue;
          const n = this.tiles[j];
          const nWater = this.isWater(n);
          let ok = false;
          if (n.imp === 'port') ok = true;
          else if (!nWater && (n.road || n.city)) ok = !tWater || t.imp === 'port';
          else if (nWater) ok = tWater;
          if (ok) { seen[j] = 1; q.push(j); }
        }
      }
      for (const c of mine) {
        if (c === cap) continue;
        const conn = !!seen[c.y * W + c.x];
        if (conn && !c.connected) {
          c.connected = true;
          this.addPop(c, 1); this.addPop(cap, 1);
          this.log(`${c.name} foi conectada à capital!`, p.id);
          this.emit('connected', { city: c });
        }
        c.connected = conn;
      }
    }

    cityIncome(c, tileIncome) {
      const p = this.players[c.owner];
      let stars = c.level + (c.capital ? 1 : 0) + c.workshop + c.parks + (c.buildings.bank ? 3 : 0);
      if (p.tribe === 'qadir') stars += c.capital ? 2 : c.connected ? 1 : 0;
      if (c.connected && !c.capital) stars += this.has(p, 'comercio') ? 2 : 1;
      if (tileIncome == null) {
        tileIncome = 0;
        for (const t of this.tiles) if (t.cityId === c.id && t.owner === c.owner) tileIncome += this.tileIncome(t);
      }
      stars += tileIncome;
      const sci = 1 + Math.floor(c.level / 2) + (c.capital ? 1 : 0) + c.academy +
        (c.buildings.library ? 2 : 0) + (c.buildings.university ? 3 : 0);
      return { stars, sci };
    }

    tileIncome(t) {
      if (t.imp === 'gemmine' || t.imp === 'plantation') return 2;
      if (t.imp === 'market') return this.marketValue(t);
      return 0;
    }

    income(p) {
      const byCity = {};
      let ports = 0;
      for (const t of this.tiles) {
        if (t.owner !== p.id) continue;
        if (t.imp === 'port') ports++;
        const v = this.tileIncome(t);
        if (v) byCity[t.cityId] = (byCity[t.cityId] || 0) + v;
      }
      let stars = 0, sci = 0;
      for (const c of this.cities) {
        if (c.owner !== p.id) continue;
        const ci = this.cityIncome(c, byCity[c.id] || 0);
        stars += ci.stars; sci += ci.sci;
      }
      if (this.wonders.pyramids === p.id) stars += 3;
      if (this.wonders.colossus === p.id) stars += ports;
      if (this.wonders.great_library === p.id) sci += 4;
      if (this.wonders.oracle === p.id) sci += 2;
      if (!p.human) {
        const d = PP.DIFFICULTY[this.opts.difficulty] || PP.DIFFICULTY.normal;
        stars += d.stars; sci += d.sci;
      }
      return { stars, sci };
    }

    score(p) {
      let s = 0;
      for (const c of this.cities) {
        if (c.owner !== p.id) continue;
        s += 100 + c.level * 50 + c.parks * 200 + (c.buildings.temple ? 100 : 0) + Object.keys(c.buildings).length * 20;
      }
      let terr = 0, expl = 0;
      for (let i = 0; i < this.tiles.length; i++) { if (this.tiles[i].owner === p.id) terr++; if (p.explored[i]) expl++; }
      s += terr * 5 + expl;
      for (const id in p.techs) s += PP.TECH[id].tier * 30;
      s += (p.future || 0) * 120;
      for (const u of this.units) if (u.owner === p.id) s += (UN[u.type].cost || 10) * 4;
      for (const w in this.wonders) if (this.wonders[w] === p.id) s += 500;
      return Math.round(s);
    }

    strength(pid) {
      let s = 0;
      for (const u of this.units) {
        if (u.owner !== pid) continue;
        const d = UN[u.type];
        s += (d.atk + d.def) * (u.hp / this.maxHp(u)) + d.cost * 0.3;
      }
      return s + this.citiesOf(pid).length * 2;
    }

    // ============================================================ Diplomacia
    proposePeace(from, to) {
      const a = this.players[from], b = this.players[to];
      if (!a || !b || !a.alive || !b.alive || !a.met[to] || !this.atWar(from, to)) return 'invalid';
      if (a.lastPeaceAsk[to] === this.turn) return 'wait';
      a.lastPeaceAsk[to] = this.turn;
      if (b.human) {
        if (!b.proposals.some(pr => pr.from === from)) b.proposals.push({ from, turn: this.turn });
        this.emit('proposal', { from, to });
        return 'pending';
      }
      const ok = PP.AI ? PP.AI.evaluatePeace(this, b, a) : false;
      if (ok) { this.makePeace(from, to); return 'accepted'; }
      this.log(`${b.name} recusou a proposta de paz de ${a.name}.`, [from, to]);
      return 'rejected';
    }

    respondProposal(p, from, accept) {
      const i = p.proposals.findIndex(pr => pr.from === from);
      if (i < 0) return false;
      p.proposals.splice(i, 1);
      if (accept && this.atWar(p.id, from)) this.makePeace(p.id, from);
      else this.log(`${p.name} recusou a paz com ${this.players[from].name}.`, [p.id, from]);
      return true;
    }

    makePeace(a, b) {
      this.players[a].rel[b] = { state: 'peace', since: this.turn };
      this.players[b].rel[a] = { state: 'peace', since: this.turn };
      this.log(`${this.players[a].name} e ${this.players[b].name} assinaram a paz.`, null);
      this.emit('diplomacy', { type: 'peace', a, b });
    }

    declareWar(a, b) {
      if (!this.atPeace(a, b)) return false;
      this.players[a].rel[b] = { state: 'war', since: this.turn };
      this.players[b].rel[a] = { state: 'war', since: this.turn };
      this.players[a].reputation -= 1;
      this.log(`${this.players[a].name} declarou guerra a ${this.players[b].name}!`, null);
      this.emit('diplomacy', { type: 'war', a, b });
      return true;
    }

    // ============================================================ Turnos
    beginTurn() {
      const p = this.players[this.current];
      p.proposals = p.proposals.filter(pr => this.turn - pr.turn <= 1 && this.atWar(pr.from, p.id) && this.players[pr.from].alive);
      this.updateConnections(p);
      if (this.turn > 1) {
        const inc = this.income(p);
        p.stars += inc.stars; p.science += inc.sci;
      }
      for (const u of this.units) {
        if (u.owner !== p.id) continue;
        u.mp = this.stat(u).move; u.canAttack = true; u.moved = false; u.attacked = false;
      }
      this.updateVision(p);
      this.emit('turnStart', { player: p.id, turn: this.turn });
    }

    endTurn() {
      if (this.over) return;
      const p = this.players[this.current];
      while (p.pendingRewards.length) this.chooseReward(p, p.pendingRewards[0].options[0]);
      this.emit('turnEnd', { player: p.id });
      let n = this.current, guard = 0;
      do {
        n = (n + 1) % this.players.length;
        if (n === 0) { this.turn++; this.recordHistory(); }
      } while (!this.players[n].alive && ++guard < 64);
      this.current = n;
      if (this.opts.victory === 'pontos' && this.turn > this.opts.turnLimit) {
        const best = this.players.filter(q => q.alive).sort((a, b) => this.score(b) - this.score(a))[0];
        this.finish(best.id, 'pontos');
        return;
      }
      this.beginTurn();
    }

    recordHistory() {
      this.history.push({ turn: this.turn, scores: this.players.map(p => (p.alive ? this.score(p) : 0)) });
      if (this.history.length > 300) this.history.shift();
    }

    checkElimination(p) {
      if (!p.alive || this.citiesOf(p.id).length > 0) return;
      p.alive = false;
      for (const u of this.units.slice()) if (u.owner === p.id) { this.units.splice(this.units.indexOf(u), 1); this.uGrid[u.y * this.W + u.x] = null; u.dead = true; }
      p.visible.fill(0);
      this.log(`${p.name} foi eliminado!`, null);
      this.emit('eliminated', { player: p.id });
    }

    checkVictory() {
      if (this.over) return;
      const alive = this.players.filter(p => p.alive);
      const humans = this.players.filter(p => p.human);
      if (alive.length <= 1) { this.finish(alive.length ? alive[0].id : -1, 'dominacao'); return; }
      if (humans.length && !humans.some(p => p.alive)) {
        const best = alive.sort((a, b) => this.score(b) - this.score(a))[0];
        this.finish(best.id, 'derrota');
      }
    }

    finish(winner, reason) {
      if (this.over) return;
      this.over = true; this.winner = winner; this.endReason = reason;
      this.recordHistory();
      this.emit('gameover', { winner, reason });
    }

    // ============================================================ Salvar / carregar
    toJSON() {
      const bits = a => { let s = ''; for (let i = 0; i < a.length; i++) s += a[i] ? '1' : '0'; return s; };
      return {
        v: 1, opts: this.opts, W: this.W, H: this.H, rng: this.rng.s, turn: this.turn, current: this.current,
        nextId: this.nextId, wonders: this.wonders, over: this.over, winner: this.winner, endReason: this.endReason,
        logs: this.logs.slice(-120), history: this.history,
        tiles: this.tiles.map(t => [t.terrain, t.biome, t.res || 0, t.imp || 0, t.impLevel, t.road ? 1 : 0, t.owner, t.cityId, t.city, t.village ? 1 : 0, t.ruin ? 1 : 0, t.wonder || 0]),
        units: this.units, cities: this.cities,
        players: this.players.map(p => Object.assign({}, p, { explored: bits(p.explored), visible: undefined })),
      };
    }

    static fromJSON(d) {
      const g = new Game();
      g.opts = d.opts; g.W = d.W; g.H = d.H; g.rng = new PP.RNG(1); g.rng.s = d.rng;
      g.turn = d.turn; g.current = d.current; g.nextId = d.nextId; g.wonders = d.wonders || {};
      g.over = d.over; g.winner = d.winner; g.endReason = d.endReason; g.logs = d.logs || []; g.history = d.history || [];
      g.usedNames = {};
      g.tiles = d.tiles.map((a, i) => ({
        x: i % d.W, y: (i / d.W) | 0, terrain: a[0], biome: a[1], res: a[2] || null, imp: a[3] || null, impLevel: a[4],
        road: !!a[5], owner: a[6], cityId: a[7], city: a[8], village: !!a[9], ruin: !!a[10], wonder: a[11] || null,
      }));
      g.units = d.units; g.cities = d.cities;
      g.players = d.players.map(p => {
        const q = Object.assign({}, p);
        q.explored = new Uint8Array(d.W * d.H);
        for (let i = 0; i < p.explored.length; i++) q.explored[i] = p.explored.charCodeAt(i) === 49 ? 1 : 0;
        q.visible = new Uint8Array(d.W * d.H);
        return q;
      });
      g.rebuildIndex();
      g.players.forEach(p => g.updateVision(p));
      return g;
    }
  }

  PP.Game = Game;
  PP.cheb = cheb;
  PP.DIRS = DIRS;
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
