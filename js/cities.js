/* Chamas de Vardren — cidades: especialização, marcos de progressão, crescimento agrícola,
   ocupação, lealdade e revolta. */
(function (PP) {
  'use strict';
  const UN = PP.UNITS;
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  PP.OCCUPATION_TURNS = 4;

  const C = {
    ensureCity(c, founder) {
      if (c.spec === undefined) c.spec = null;
      if (c.loyalty == null) c.loyalty = 100;
      if (c.occupied == null) c.occupied = 0;
      if (c.founder == null) c.founder = founder != null ? founder : (c.origCapital >= 0 ? c.origCapital : c.owner);
      if (!c.milestones) c.milestones = {};
      if (c.growth == null) c.growth = 0;
      if (c.sabotage == null) c.sabotage = 0;
      if (c.unrest == null) c.unrest = false;
      if (c.metropolis == null) c.metropolis = false;
      if (!c.routes) c.routes = [];
    },

    isCoastal(c) {
      return this.neighbors(c).some(n => this.isWater(n));
    },

    // ------------------------------------------------------------ Especialização
    specCheck(p, c, spec) {
      const r = { ok: false, reason: '', cost: c && c.spec ? PP.SPEC_COST.change : PP.SPEC_COST.first };
      if (!c || c.owner !== p.id) { r.reason = 'Cidade inválida'; return r; }
      if (!PP.SPECS[spec]) { r.reason = 'Especialização desconhecida'; return r; }
      if (c.spec === spec) { r.reason = 'Especialização atual'; r.current = true; return r; }
      if (c.level < PP.SPEC_COST.minLevel) { r.reason = `Requer nível ${PP.SPEC_COST.minLevel}`; return r; }
      if (PP.SPECS[spec].coastal && !this.isCoastal(c)) { r.reason = 'Precisa estar no litoral'; r.locked = true; return r; }
      if (c.occupied > 0) { r.reason = 'Cidade sob ocupação'; return r; }
      if (p.stars < r.cost) { r.reason = 'Faltam estrelas'; return r; }
      r.ok = true;
      return r;
    },

    setSpec(p, c, spec) {
      if (this.over || p.id !== this.current) return false;
      const chk = this.specCheck(p, c, spec);
      if (!chk.ok) return false;
      p.stars -= chk.cost;
      const was = c.spec;
      c.spec = spec; c.specSince = this.turn; c.growth = 0;
      p.stats.specs = (p.stats.specs || 0) + 1;
      this.log(`${c.name} tornou-se uma cidade ${PP.SPECS[spec].name.toLowerCase()}.`, p.id);
      this.invalidate();
      this.emit('spec', { city: c, spec, was });
      this.refreshVision(p.id);
      return true;
    },

    specActive(c, id) { const b = PP.BUILDINGS[id]; return !!c.buildings[id] && (!b.spec || b.spec === c.spec); },

    capacityBonus(c) {
      let b = 0;
      const p = this.players[c.owner];
      if (c.spec === 'militar') b += 2;
      if (c.spec === 'ciencia' && p.tribe !== 'hanlu') b -= 1;
      if (this.specActive(c, 'aqueduct')) b += 1;
      if (c.milestones.m_training) b += 1;
      if (c.milestones.m_legion) b += 2;
      if (c.metropolis) b += 1;
      if (this.cities.some(o => o.owner === c.owner && o.milestones && o.milestones.m_breadbasket)) b += 1;
      if (c.occupied > 0) b -= 1;
      return b;
    },

    unitCost(p, c, type) {
      const d = UN[type];
      let cost = d.cost;
      if (this.resourceDiscount) cost -= this.resourceDiscount(p, type);
      if (!c) return Math.max(1, cost);
      if (d.naval) {
        if (this.specActive(c, 'shipyard')) cost -= 2;
        if (c.milestones.m_drydock) cost -= 1;
      } else if (!d.spy) {
        if (c.spec === 'militar') cost -= 1;
        if (this.specActive(c, 'arsenal')) cost -= 1;
        if (c.spec === 'ciencia') cost += 1;
        if (c.spec === 'porto') cost += 1;
      }
      return Math.max(1, cost);
    },

    recruitXp(c, type) {
      const d = UN[type];
      let xp = 0;
      if (d.spy) return 0;
      if (d.naval) {
        if (this.specActive(c, 'shipyard')) xp++;
        if (c.milestones.m_drydock) xp++;
      } else {
        if (c.spec === 'militar') xp++;
        if (this.specActive(c, 'arsenal')) xp++;
        if (c.milestones.m_training) xp++;
        if (this.wonders.colosseum === c.owner) xp++;
      }
      return xp;
    },

    cityDefenseExtra(c) {
      let b = 0;
      if (c.spec === 'militar') b += 0.5;
      if (c.spec === 'comercio') b -= 0.25;
      if (this.specActive(c, 'citadel') && c.buildings.walls) b += 1;
      if (c.milestones.m_bastion) b += 1;
      if (c.occupied > 0) b -= 0.25;
      return b;
    },

    cityHealBonus(c) {
      return (this.specActive(c, 'citadel') ? 3 : 0) + (c.milestones.m_bastion ? 3 : 0);
    },

    cityVisionBonus(c) {
      return (this.specActive(c, 'observatory') ? 1 : 0) + (this.specActive(c, 'lighthouse') ? 2 : 0) + (c.metropolis ? 1 : 0);
    },

    // ------------------------------------------------------------ Marcos de progressão
    milestoneOptions(c) {
      const opts = ['park', 'giant'];
      const table = c.spec ? PP.MILESTONES[c.spec] : null;
      if (table && table[c.level] && !c.milestones[table[c.level]]) opts.push(table[c.level]);
      if (c.level >= PP.METROPOLIS_LEVEL && !c.metropolis) opts.push('metropolis');
      return opts;
    },

    applyMilestone(c, r) {
      const p = this.players[c.owner];
      if (r === 'metropolis') {
        c.metropolis = true;
        c.radius = Math.max(c.radius, 3);
        this.claimTerritory(c);
        this.log(`${c.name} tornou-se uma Metrópole!`, null);
        return;
      }
      if (!PP.REWARDS[r]) return;
      c.milestones[r] = true;
      if (r === 'm_legion') {
        const spot = !this.uGrid[c.y * this.W + c.x] ? c : this.neighbors(c).find(n => !this.isWater(n) && !this.uGrid[n.y * this.W + n.x] && n.terrain !== 'mountain' && !n.city);
        if (spot) { const u = this.createUnit('swordsman', p.id, spot.x, spot.y, c.id); u.xp = PP.XP_LEVELS[0]; u.pendingPromo = 1; if (!p.human && PP.AI) PP.AI.autoPromote(this, u); }
        else p.stars += 8;
      }
      if (r === 'm_granaries') this.addPop(c, 3);
      if (r === 'm_irrigation') for (const o of this.citiesOf(p.id)) if (o !== c && cheb(o, c) <= 3) this.addPop(o, 1);
      this.invalidate();
    },

    // ------------------------------------------------------------ Crescimento e população
    growthInterval(c) {
      let n = 4;
      if (this.specActive(c, 'silos')) n--;
      if (c.milestones.m_granaries) n--;
      return Math.max(2, n);
    },

    popGain(c, n) {
      return c.occupied > 0 ? Math.max(1, Math.floor(n / 2)) : n;
    },

    // ------------------------------------------------------------ Lealdade e ocupação
    garrisoned(c) {
      const u = this.uGrid[c.y * this.W + c.x];
      return !!(u && u.owner === c.owner);
    },

    loyaltyFactors(c) {
      const f = [];
      const p = this.players[c.owner];
      f.push(['Base', 45]);
      if (this.garrisoned(c)) f.push(['Guarnição na cidade', 15]);
      if (c.buildings.temple) f.push(['Templo', 10]);
      if (c.buildings.guard) f.push(['Guarda da Cidade', 5]);
      if (this.specActive(c, 'citadel')) f.push(['Cidadela', 10]);
      if (this.specActive(c, 'aqueduct')) f.push(['Aqueduto', 10]);
      if (c.spec === 'agricola') f.push(['Cidade agrícola (comida farta)', 5]);
      if (c.connected) f.push(['Conectada à capital', 5]);
      const lux = this.luxuryCount ? this.luxuryCount(p) : 0;
      if (lux) f.push(['Luxos do império', Math.min(10, lux * 5)]);
      if (this.wonders.colosseum === c.owner) f.push(['Coliseu', 5]);
      if (this.cities.some(o => o.owner === c.owner && o.milestones && o.milestones.m_breadbasket)) f.push(['Celeiro do Mundo', 5]);
      const founder = this.players[c.founder];
      if (founder && founder.alive && founder.id !== c.owner) {
        if (this.atWar(c.owner, founder.id)) {
          if (this.units.some(u => u.owner === founder.id && cheb(u, c) <= 3)) f.push([`Tropas de ${founder.name} por perto`, -15]);
          else f.push([`Em guerra com ${founder.name}`, -5]);
        } else f.push([`Paz com ${founder.name}`, 5]);
      }
      if (c.occupied > 0) f.push(['Ocupação militar', -10]);
      return f;
    },

    loyaltyTarget(c) {
      let t = 0;
      for (const f of this.loyaltyFactors(c)) t += f[1];
      return Math.max(0, Math.min(100, t));
    },

    cityYieldMult(c) {
      let m = 1;
      if (c.occupied > 0) m *= 0.5;
      else if (c.unrest) m *= c.loyalty < 25 ? 0.5 : 0.75;
      if (c.sabotage > 0) m *= 0.5;
      return m;
    },

    cityStatus(c) {
      if (c.occupied > 0) return { id: 'occupied', name: `Ocupada (${c.occupied} turnos)`, tag: 'bad' };
      if (c.unrest) return { id: 'unrest', name: c.loyalty < 20 ? 'Rebelião iminente' : 'Resistência', tag: 'bad' };
      if (c.founder !== c.owner) return { id: 'conquered', name: 'Conquistada', tag: '' };
      return null;
    },

    updateLoyalty(p) {
      for (const c of this.citiesOf(p.id)) {
        if (c.sabotage > 0) c.sabotage--;
        if (c.founder === p.id && c.occupied <= 0 && !c.unrest) { c.loyalty = Math.min(100, c.loyalty + 10); continue; }
        const target = this.loyaltyTarget(c);
        c.loyalty = Math.max(0, Math.min(100, c.loyalty + Math.max(-6, Math.min(6, target - c.loyalty))));
        if (c.occupied > 0) {
          c.occupied--;
          if (c.occupied === 0) {
            if (c.loyalty >= 50) this.integrateCity(c);
            else { c.unrest = true; this.log(`${c.name} resiste ao domínio de ${p.name}.`, p.id); this.emit('unrest', { city: c }); }
          }
        } else if (c.unrest) {
          if (c.loyalty >= 60) this.integrateCity(c);
          else if (c.loyalty < 20 && !this.garrisoned(c) && this.rng.chance(0.3)) this.revolt(c);
        }
      }
    },

    integrateCity(c) {
      c.unrest = false; c.occupied = 0;
      c.founder = c.owner;
      c.loyalty = Math.max(c.loyalty, 60);
      const st = this.players[c.owner].stats;
      st.integrated = (st.integrated || 0) + 1;
      this.log(`${c.name} foi integrada ao império de ${this.players[c.owner].name}.`, c.owner);
      this.emit('integrated', { city: c });
    },

    // Revolta: a cidade volta ao fundador se ele existir; senão perde população
    revolt(c) {
      const owner = this.players[c.owner];
      const founder = this.players[c.founder];
      owner.stats.revolts = (owner.stats.revolts || 0) + 1;
      if (founder && founder.alive && founder.id !== c.owner) {
        this.transferCity(c, founder.id);
        c.loyalty = 70; c.occupied = 0; c.unrest = false;
        this.log(`${c.name} se revoltou e voltou para ${founder.name}!`, null);
        this.emit('revolt', { city: c, from: owner.id, to: founder.id });
        this.checkElimination(owner);
        this.checkVictory();
      } else {
        c.pop = 0;
        c.loyalty = 35;
        this.log(`Revolta em ${c.name}: a cidade perdeu sua população.`, owner.id);
        this.emit('revolt', { city: c, from: owner.id, to: owner.id });
      }
    },

    transferCity(c, to) {
      const old = this.players[c.owner], p = this.players[to];
      if (old.capital === c.id) old.capital = null;
      c.capital = false;
      c.owner = to; c.connected = false;
      if (c.origCapital === to) { c.capital = true; p.capital = c.id; }
      for (const t of this.tiles) if (t.cityId === c.id) t.owner = to;
      for (const u of this.units) if (u.home === c.id && u.owner !== to) u.home = null;
      this.invalidate();
      this.refreshVision(to); this.refreshVision(old.id);
    },

    // Crescimento natural das cidades agrícolas e dos Jardins Suspensos
    naturalGrowth(p) {
      if (this.eventActive && this.eventActive('drought')) return;
      for (const c of this.citiesOf(p.id)) {
        if (c.spec === 'agricola' && c.occupied <= 0) {
          c.growth++;
          if (c.growth >= this.growthInterval(c)) { c.growth = 0; this.addPop(c, 1); }
        }
      }
      if (this.wonders.gardens === p.id && this.turn % 6 === 0) for (const c of this.citiesOf(p.id)) this.addPop(c, 1);
    },
  };

  Object.assign(PP.Game.prototype, C);

  PP.registerSystem('cities', {
    init(g) { g.cities.forEach(c => g.ensureCity(c)); },
    load(g) { g.cities.forEach(c => g.ensureCity(c)); },
    beforeTurn(g, p) {
      if (g.turn > 1) { g.updateLoyalty(p); g.naturalGrowth(p); }
    },
    found(g, c, p) { c.founder = p.id; c.loyalty = 100; },
    capture(g, c, old, p) {
      if (c.founder === p.id) { c.occupied = 0; c.unrest = false; c.loyalty = Math.max(c.loyalty, 80); return; }
      c.occupied = PP.OCCUPATION_TURNS;
      c.unrest = false;
      c.loyalty = Math.min(c.loyalty, 30);
      c.growth = 0;
    },
    trained(g, u) {
      const r = g.rank(u);
      if (r > 0) {
        u.xp = Math.min(u.xp, PP.XP_LEVELS[0]);
        u.pendingPromo += 1;
        const p = g.players[u.owner];
        if (!p.human && PP.AI) PP.AI.autoPromote(g, u);
      }
    },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
