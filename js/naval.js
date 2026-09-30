/* Politopia+ — naval: portos das cidades, navios de verdade (Escuna, Transporte, Fragata, Couraçado),
   embarque em transportes e desembarque anfíbio. O embarque antigo (tropas viram barcos ao entrar
   na água pelo porto) continua funcionando como antes. */
(function (PP) {
  'use strict';
  const UN = PP.UNITS;

  const N = {
    // Porto útil (não saqueado) no território da cidade
    hasHarbor(c) {
      for (const t of this.tiles) if (t.cityId === c.id && t.owner === c.owner && t.imp === 'port' && !t.pillaged) return true;
      return false;
    },

    // Casa de água livre onde um navio recém-construído aparece (prefere o próprio porto)
    harborTile(c) {
      let best = null, bs = -1;
      for (const t of this.tiles) {
        if (t.cityId !== c.id || t.owner !== c.owner || !this.isWater(t)) continue;
        if (this.uGrid[t.y * this.W + t.x]) continue;
        const d = Math.max(Math.abs(t.x - c.x), Math.abs(t.y - c.y));
        let s = 0;
        if (t.imp === 'port' && !t.pillaged) s += 10;
        if (d <= 1) s += 3;
        if (t.terrain === 'water') s += 1;
        if (s > bs) { bs = s; best = t; }
      }
      return best;
    },

    cargoUnits() {
      const out = [];
      for (const u of this.units) if (u.cargo && u.cargo.length) for (const x of u.cargo) out.push(x);
      return out;
    },

    cargoCap(t) { return (UN[t.type] && UN[t.type].cargo) || 0; },

    canBoard(u, tr) {
      if (!tr || tr === u || tr.owner !== u.owner) return false;
      if (!this.cargoCap(tr) || UN[u.type].naval || this.cargoCap(u)) return false;
      if (!tr.cargo) tr.cargo = [];
      return tr.cargo.length < this.cargoCap(tr);
    },

    board(u, tr, path) {
      if (!this.canBoard(u, tr)) return false;
      const from = { x: u.x, y: u.y };
      const i = this.units.indexOf(u);
      if (i < 0) return false;
      this.units.splice(i, 1);
      if (this.uGrid[u.y * this.W + u.x] === u) this.uGrid[u.y * this.W + u.x] = null;
      u.x = tr.x; u.y = tr.y;
      u.mp = 0; u.moved = true; u.canAttack = false; u.fortified = false;
      u.boarded = this.turn;
      tr.cargo.push(u);
      this.emit('move', { unit: u, from, path: path || [{ x: tr.x, y: tr.y }], board: true });
      this.emit('board', { unit: u, transport: tr });
      this.refreshVision(u.owner);
      return true;
    },

    // Casas onde uma tropa transportada pode desembarcar
    unloadTargets(tr, x) {
      const out = [];
      if (!tr || !tr.cargo || !x || x.boarded === this.turn) return out;
      const p = this.players[tr.owner];
      for (const n of this.neighbors(tr)) {
        if (this.isWater(n) && n.landmark !== 'vau') continue;
        if (this.uGrid[n.y * this.W + n.x]) continue;
        if (n.terrain === 'mountain' && (!this.has(p, 'escalada') || UN[x.type].mounted)) continue;
        if (n.city) {
          const c = this.cityMap[n.city];
          if (c.owner !== tr.owner && !this.atWar(tr.owner, c.owner)) continue;
        }
        out.push(n);
      }
      return out;
    },

    // Desembarque: a tropa chega sem movimento; se atacar neste turno, sofre −25% (ataque anfíbio)
    unload(tr, unitId, x, y) {
      if (this.over || !tr || tr.owner !== this.current || !tr.cargo) return false;
      const k = tr.cargo.findIndex(c => c.id === unitId);
      if (k < 0) return false;
      const u = tr.cargo[k];
      const spot = this.unloadTargets(tr, u).find(n => n.x === x && n.y === y);
      if (!spot) return false;
      tr.cargo.splice(k, 1);
      const from = { x: tr.x, y: tr.y };
      u.x = x; u.y = y;
      this.units.push(u);
      this.uGrid[y * this.W + x] = u;
      u.mp = 0; u.moved = true; u.canAttack = true; u.attacked = false;
      u.buff = Object.assign({}, u.buff || {}, { amphib: this.turn });
      this.emit('move', { unit: u, from, path: [{ x, y }] });
      this.emit('unload', { unit: u, transport: tr });
      if (spot.ruin) this.exploreRuin(u, spot);
      this.hook('moved', u, from);
      this.refreshVision(u.owner);
      return true;
    },

    // Quando o transporte afunda, a carga vai junto
    dropCargo(tr, killer) {
      const lost = tr.cargo || [];
      tr.cargo = [];
      for (const u of lost) {
        u.dead = true;
        this.players[u.owner].stats.losses++;
        if (killer) this.players[killer.owner].stats.kills++;
        this.hook('unitKilled', u, killer);
        this.emit('death', { unit: u, killer, cargo: true });
      }
      if (lost.length) this.log(`${lost.length} tropa(s) afundaram com o transporte de ${this.players[tr.owner].name}.`, [tr.owner].concat(killer ? [killer.owner] : []));
    },
  };

  Object.assign(PP.Game.prototype, N);

  PP.registerSystem('naval', {
    load(g) {
      for (const u of g.units) {
        if (UN[u.type] && UN[u.type].cargo && !u.cargo) u.cargo = [];
      }
    },
    trained(g, u) { if (UN[u.type].cargo) u.cargo = []; },
    unitKilled(g, u, killer) { if (u.cargo && u.cargo.length) g.dropCargo(u, killer); },
    // Tropas a bordo andam junto com o transporte
    moved(g, u) {
      if (u.cargo) for (const x of u.cargo) { x.x = u.x; x.y = u.y; }
    },
    eliminated(g, p) { for (const u of g.units) if (u.cargo) u.cargo = u.cargo.filter(x => x.owner !== p.id); },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
