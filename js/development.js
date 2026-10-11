/* Chamas de Vardren — desenvolvimento das cidades e economia do meio para o fim da partida (2.4).
   - Manutenção do exército: cada tropa custa estrelas por turno conforme o preço (de 0,5★ a 2★; Gigantes não custam).
     Cada cidade sustenta 1 tropa de graça (a capital, 2; +1 com Quartel, +1 com Caserna e +2 nas cidades
     militares); tropas terrestres fora do abastecimento custam 50% a mais; o Feudalismo corta a manutenção em 25%;
     frações de estrela são perdoadas. Se o tesouro não cobre a conta, uma tropa deserta por turno.
   - Investir em crescimento: +1 de população por estrelas, uma vez por turno em cada cidade; o custo sobe com o nível.
   - Projetos de cidade (Festival, Mecenato e Exercícios militares): duram 3 turnos, um de cada vez por cidade.
   - Construções de segundo nível (Biblioteca Ampliada, Casa da Moeda, Armazéns, Catedral e Caserna).
   - Vagas de construção: o nível da cidade limita quantas construções ela tem. Muralhas, Chancelaria, Paço Regional,
     Embaixada e as de segundo nível não ocupam vaga; dá para demolir uma construção para liberar a vaga.
   - Avanços do futuro: cada Tecnologia do Futuro dá um bônus à escolha.
   A manutenção e as vagas só valem nas partidas criadas a partir desta versão (as duas podem ser desligadas na
   criação da partida); o resto também chega às partidas antigas. */
(function (PP) {
  'use strict';
  const UN = PP.UNITS;
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  // ------------------------------------------------------------ Dados
  // tiers: [preço máximo, manutenção] — o que custa mais que o último degrau paga "top"
  PP.UPKEEP = { tiers: [[3, 0.5], [6, 1], [10, 1.5]], top: 2, perCity: 1, capital: 1, barracks: 1, barracks2: 1, militar: 2, unsupplied: 1.5 };
  PP.INVEST = { base: 2, perLevel: 2 };
  PP.SLOTS = { exempt: ['walls', 'chancery', 'regional_seat', 'embassy'], capital: 1, metropolis: 1 };

  PP.CITY_PROJECTS = {
    festival:  { name: 'Festival', icon: 'cp_festival', turns: 3, base: 4, perLevel: 1, loyalty: 15, pop: 1,
      desc: '+15 de lealdade enquanto durar e +1 de população no fim.' },
    patronage: { name: 'Mecenato', icon: 'cp_patronage', turns: 3, base: 0, perLevel: 4,
      desc: 'Sábios e artistas pagos pela coroa: +1⚗︎ por nível da cidade em cada um dos 3 turnos.' },
    drills:    { name: 'Exercícios militares', icon: 'cp_drills', turns: 3, base: 5, perLevel: 1,
      desc: 'Tropas terrestres na cidade e nas casas vizinhas ganham +1 de XP em cada um dos 3 turnos.' },
  };
  PP.CPROJ_ORDER = Object.keys(PP.CITY_PROJECTS);

  PP.FUTURE_PERKS = {
    comercio_global: { name: 'Comércio Global', icon: 'fp_trade', max: 4, desc: '+5% de estrelas por nível.' },
    metodo:          { name: 'Método Científico', icon: 'fp_science', max: 4, desc: '+5% de ciência por nível.' },
    logistica:       { name: 'Logística Moderna', icon: 'fp_logistics', max: 3, desc: 'Manutenção do exército −10% por nível.' },
    urbanismo:       { name: 'Urbanismo', icon: 'fp_urban', max: 3, desc: 'Investir em crescimento custa −15% por nível.' },
    administracao:   { name: 'Administração Moderna', icon: 'fp_admin', max: 3, desc: '+1 de capacidade administrativa por nível.' },
    taticas:         { name: 'Táticas Modernas', icon: 'fp_tactics', max: 2, desc: '+10% de ataque para todas as tropas por nível.' },
  };
  PP.FUTURE_ORDER = Object.keys(PP.FUTURE_PERKS);

  // Construções de segundo nível: exigem a primeira, não ocupam vaga (upgradeOf) e somam aos efeitos dela
  const UPGRADES = {
    library2:  { name: 'Biblioteca Ampliada', cost: 10, tech: 'educacao', needs: 'library', upgradeOf: 'library', addSci: 2,
      desc: '+2⚗︎ por turno, somados aos da Biblioteca · não ocupa vaga' },
    bank2:     { name: 'Casa da Moeda', cost: 16, tech: 'burocracia', needs: 'bank', upgradeOf: 'bank', addStars: 3,
      desc: '+3★ por turno, somados aos do Banco · não ocupa vaga' },
    granary2:  { name: 'Armazéns', cost: 9, tech: 'construcao', needs: 'granary', upgradeOf: 'granary', pop: 2,
      desc: '+2 população · não ocupa vaga' },
    temple2:   { name: 'Catedral', cost: 14, tech: 'filosofia', needs: 'temple', upgradeOf: 'temple', pop: 1,
      desc: '+1 população · +10 de lealdade · +100 pontos · cura +2 na cidade · não ocupa vaga' },
    barracks2: { name: 'Caserna', cost: 10, tech: 'arquitetura', needs: 'barracks', upgradeOf: 'barracks',
      desc: '+2 capacidade de unidades · sustenta mais 1 tropa de graça · não ocupa vaga' },
  };
  for (const id in UPGRADES) {
    if (PP.BUILDINGS[id]) continue;
    PP.BUILDINGS[id] = UPGRADES[id];
    const i = PP.BUILDING_ORDER.indexOf(UPGRADES[id].upgradeOf);
    PP.BUILDING_ORDER.splice(i >= 0 ? i + 1 : PP.BUILDING_ORDER.length, 0, id);
  }

  // Cidade portuária mais forte: até +5★ pelas casas marítimas (antes, até +3★)
  if (PP.SPECS.porto && PP.SPECS.porto.seaMax == null) {
    PP.SPECS.porto.seaMax = 5;
    PP.SPECS.porto.bonus = 'Couraçados · +1★ por porto, peixe ou baleia (máx. 5) · navios +1 movimento · +1 vaga de rota marítima';
  }

  // Feudalismo: os senhores sustentam as tropas
  const feud = PP.GOVERNMENTS && PP.GOVERNMENTS.feudalismo;
  if (feud && feud.fx.upkeep == null) {
    feud.fx.upkeep = -0.25;
    feud.desc += ' · manutenção do exército −25%';
  }

  const D = {
    upkeepOn() { return !!(this.opts && this.opts.upkeep); },
    slotsOn() { return !!(this.opts && this.opts.slots); },

    ensureDev(c) {
      if (c.cproj === undefined) c.cproj = null;
      if (c.invested == null) c.invested = 0;
      if (!c.razed) c.razed = {};
    },
    ensureDevPlayer(p) { if (!p.futurePerks) p.futurePerks = {}; },

    // ------------------------------------------------------------ Manutenção do exército
    unitUpkeep(type) {
      const d = UN[type];
      if (!d || d.special) return 0;
      if (d.upkeep != null) return d.upkeep;
      for (const [max, v] of PP.UPKEEP.tiers) if (d.cost <= max) return v;
      return PP.UPKEEP.top;
    },

    // Tropas do jogador, incluindo as que estão a bordo de transportes
    armyOf(pid) {
      const out = [];
      for (const u of this.units) {
        if (u.owner !== pid) continue;
        out.push(u);
        if (u.cargo && u.cargo.length) for (const x of u.cargo) out.push(x);
      }
      return out;
    },

    freeSupport(p) {
      const parts = [];
      let total = 0;
      const add = (label, n) => { if (n) { parts.push([label, n]); total += n; } };
      const cities = this.citiesOf(p.id);
      let b1 = 0, b2 = 0, mil = 0;
      for (const c of cities) {
        if (c.buildings.barracks) b1++;
        if (c.buildings.barracks2) b2++;
        if (c.spec === 'militar') mil++;
      }
      add(PP.t('Cidades'), cities.length * PP.UPKEEP.perCity);
      if (cities.some(c => c.capital)) add(PP.t('Capital'), PP.UPKEEP.capital);
      add(PP.BUILDINGS.barracks.name, b1 * PP.UPKEEP.barracks);
      add(PP.BUILDINGS.barracks2.name, b2 * PP.UPKEEP.barracks2);
      add(PP.t('Cidades militares'), mil * PP.UPKEEP.militar);
      return { total, parts };
    },

    upkeepMult(p) {
      let m = 1;
      const fx = this.govEffects ? this.govEffects(p) : {};
      if (fx.upkeep) m *= 1 + fx.upkeep;
      const lg = (p.futurePerks && p.futurePerks.logistica) || 0;
      if (lg) m *= 1 - 0.1 * lg;
      return Math.max(0, m);
    },

    // A conta do exército: as tropas mais baratas usam as vagas gratuitas primeiro
    upkeepOf(p) {
      const list = [];
      let unsupplied = 0;
      for (const u of this.units) {
        if (u.owner !== p.id) continue;
        let v = this.unitUpkeep(u.type);
        if (v && !UN[u.type].naval && this.isSupplied && !this.isSupplied(u)) { v *= PP.UPKEEP.unsupplied; unsupplied++; }
        if (v) list.push(v);
        if (u.cargo && u.cargo.length) for (const x of u.cargo) { const w = this.unitUpkeep(x.type); if (w) list.push(w); }
      }
      list.sort((a, b) => a - b);
      const free = this.freeSupport(p);
      let raw = 0;
      for (let i = free.total; i < list.length; i++) raw += list[i];
      const mult = this.upkeepMult(p);
      return {
        total: this.upkeepOn() ? Math.floor(raw * mult + 1e-9) : 0, raw, mult, units: list.length, free: free.total, freeParts: free.parts,
        paid: Math.max(0, list.length - free.total), unsupplied,
      };
    },

    // Quanto uma tropa nova deste tipo somaria à conta (0 enquanto houver vaga gratuita)
    upkeepPreview(p, type) {
      if (!this.upkeepOn()) return 0;
      const v = this.unitUpkeep(type);
      if (!v) return 0;
      const up = this.upkeepOf(p);
      return up.units < up.free ? 0 : Math.round(v * up.mult * 10) / 10;
    },

    // Chamado pelo motor quando a renda do turno deixa o tesouro negativo
    settleDeficit(p, inc) {
      if (p.stars >= 0) return;
      const short = -p.stars;
      p.stars = 0;
      inc.deficit = short;
      p.stats.unpaid = (p.stats.unpaid || 0) + short;
      const u = this.desertionCandidate(p);
      if (u) {
        const name = UN[u.type].name;
        this.disband(u);
        p.stats.deserted = (p.stats.deserted || 0) + 1;
        this.log(PP.t('{p} não pagou o exército: {u} desertou.', { p: p.name, u: name }), p.id);
        this.emit('upkeep', { type: 'desertion', player: p.id, unit: u, short });
      } else this.emit('upkeep', { type: 'short', player: p.id, short });
    },

    // Deserta a tropa mais cara fora das cidades (ou, se todas estiverem em cidades, a mais cara)
    desertionCandidate(p) {
      let best = null, bv = -1;
      for (const u of this.units) {
        if (u.owner !== p.id || UN[u.type].character || (u.cargo && u.cargo.length)) continue;
        const v = this.unitUpkeep(u.type);
        if (!v) continue;
        const s = (this.tileAt(u).city ? 0 : 100) + v * 10 - u.hp / 100;
        if (s > bv) { bv = s; best = u; }
      }
      return best;
    },

    // ------------------------------------------------------------ Investir em crescimento
    investCost(p, c) {
      const ub = (p.futurePerks && p.futurePerks.urbanismo) || 0;
      return Math.max(1, Math.round((PP.INVEST.base + PP.INVEST.perLevel * c.level) * (1 - 0.15 * ub)));
    },

    investCheck(p, c) {
      const r = { ok: false, reason: '', cost: c && p ? this.investCost(p, c) : 0 };
      if (!c || !p || c.owner !== p.id) { r.reason = PP.t('Cidade inválida'); return r; }
      if (c.occupied > 0) { r.reason = PP.t('Cidade sob ocupação'); return r; }
      if (this.isBesieged && this.isBesieged(c)) { r.reason = PP.t('Cidade sitiada'); return r; }
      if (c.invested === this.turn) { r.reason = PP.t('Já recebeu investimento neste turno'); r.done = true; return r; }
      if (p.stars < r.cost) { r.reason = PP.t('Faltam estrelas'); return r; }
      r.ok = true;
      return r;
    },

    invest(p, c) {
      if (this.over || p.id !== this.current) return false;
      const chk = this.investCheck(p, c);
      if (!chk.ok) return false;
      p.stars -= chk.cost;
      c.invested = this.turn;
      p.stats.invested = (p.stats.invested || 0) + chk.cost;
      this.emit('citydev', { type: 'invest', player: p.id, city: c, cost: chk.cost });
      this.addPop(c, 1);
      return true;
    },

    // ------------------------------------------------------------ Projetos de cidade
    cprojCost(c, id) {
      const d = PP.CITY_PROJECTS[id];
      return d.base + d.perLevel * c.level;
    },

    patronageYield(c) { return c.level; },

    cprojCheck(p, c, id) {
      const d = PP.CITY_PROJECTS[id];
      const r = { ok: false, reason: '', cost: c && d ? this.cprojCost(c, id) : 0 };
      if (!d) { r.reason = PP.t('Projeto desconhecido'); return r; }
      if (!c || !p || c.owner !== p.id) { r.reason = PP.t('Cidade inválida'); return r; }
      if (c.cproj) {
        r.busy = true;
        r.current = c.cproj.id === id;
        r.reason = r.current ? PP.t('Em andamento ({n} turnos)', { n: c.cproj.left }) : PP.t('Outro projeto em andamento');
        return r;
      }
      if (c.occupied > 0) { r.reason = PP.t('Cidade sob ocupação'); return r; }
      if (this.isBesieged && this.isBesieged(c)) { r.reason = PP.t('Cidade sitiada'); return r; }
      if (p.stars < r.cost) { r.reason = PP.t('Faltam estrelas'); return r; }
      r.ok = true;
      return r;
    },

    startCityProject(p, c, id) {
      if (this.over || p.id !== this.current) return false;
      const chk = this.cprojCheck(p, c, id);
      if (!chk.ok) return false;
      p.stars -= chk.cost;
      c.cproj = { id, left: PP.CITY_PROJECTS[id].turns, since: this.turn };
      this.invalidate();
      this.log(PP.t('{c} começou o projeto {x}.', { c: c.name, x: PP.CITY_PROJECTS[id].name }), p.id);
      this.emit('citydev', { type: 'project', player: p.id, city: c, project: id });
      return true;
    },

    cancelCityProject(p, c) {
      if (this.over || p.id !== this.current || !c || c.owner !== p.id || !c.cproj) return false;
      const id = c.cproj.id;
      c.cproj = null;
      this.invalidate();
      this.emit('citydev', { type: 'cancel', player: p.id, city: c, project: id });
      return true;
    },

    // Efeitos de cada turno (chamado depois da renda, que já contou o Mecenato)
    advanceCityProjects(p) {
      for (const c of this.citiesOf(p.id)) {
        const pr = c.cproj;
        if (!pr) continue;
        if (pr.id === 'drills') {
          for (const u of this.units) {
            if (u.owner !== p.id || UN[u.type].naval || UN[u.type].spy || this.stat(u).naval || UN[u.type].atk <= 0 || cheb(u, c) > 1) continue;
            this.gainXp(u, 1);
          }
        }
        pr.left--;
        if (pr.left > 0) continue;
        c.cproj = null;
        if (pr.id === 'festival') this.addPop(c, PP.CITY_PROJECTS.festival.pop);
        p.stats.projects = (p.stats.projects || 0) + 1;
        this.log(PP.t('{c} concluiu o projeto {x}.', { c: c.name, x: PP.CITY_PROJECTS[pr.id].name }), p.id);
        this.emit('citydev', { type: 'projectDone', player: p.id, city: c, project: pr.id });
      }
    },

    // ------------------------------------------------------------ Vagas de construção
    usesSlot(id) {
      const b = PP.BUILDINGS[id];
      return !!b && !b.upgradeOf && PP.SLOTS.exempt.indexOf(id) < 0;
    },

    buildSlots(c) {
      return Math.floor((c.level + 3) / 2) + (c.capital ? PP.SLOTS.capital : 0) + (c.metropolis ? PP.SLOTS.metropolis : 0);
    },

    usedSlots(c) {
      let n = 0;
      for (const id in c.buildings) if (c.buildings[id] && this.usesSlot(id)) n++;
      return n;
    },

    freeSlots(c) { return this.slotsOn() ? Math.max(0, this.buildSlots(c) - this.usedSlots(c)) : 99; },

    demolishCheck(p, c, id) {
      const r = { ok: false, reason: '' };
      if (!this.slotsOn()) { r.reason = PP.t('Indisponível'); return r; }
      if (!c || !p || c.owner !== p.id || !c.buildings[id]) { r.reason = PP.t('Inválido'); return r; }
      if (!this.usesSlot(id)) { r.reason = PP.t('Não ocupa vaga'); return r; }
      for (const o in c.buildings) {
        const b = PP.BUILDINGS[o];
        if (c.buildings[o] && b && b.needs === id) { r.reason = PP.t('Demolir {x} antes', { x: b.name }); return r; }
      }
      r.ok = true;
      return r;
    },

    demolish(p, c, id) {
      if (this.over || p.id !== this.current) return false;
      if (!this.demolishCheck(p, c, id).ok) return false;
      delete c.buildings[id];
      c.razed[id] = true;
      p.stats.demolished = (p.stats.demolished || 0) + 1;
      if (this.realmReset) this.realmReset();
      this.invalidate();
      this.log(PP.t('{c} demoliu {x}.', { c: c.name, x: PP.BUILDINGS[id].name }), p.id);
      this.emit('citydev', { type: 'demolish', player: p.id, city: c, building: id });
      this.refreshVision(p.id);
      return true;
    },

    // ------------------------------------------------------------ Avanços do futuro
    futurePerkCheck(p, id) {
      const d = PP.FUTURE_PERKS[id];
      const r = { ok: false, reason: '', level: (p.futurePerks && p.futurePerks[id]) || 0 };
      if (!d) { r.reason = PP.t('Inválido'); return r; }
      if (r.level >= d.max) { r.reason = PP.t('Nível máximo'); r.maxed = true; return r; }
      r.ok = true;
      return r;
    },

    defaultFuturePerk(p) { return PP.FUTURE_ORDER.find(id => this.futurePerkCheck(p, id).ok) || null; },
  };
  Object.assign(PP.Game.prototype, D);

  // ------------------------------------------------------------ Extensões encadeadas das regras existentes
  const proto = PP.Game.prototype;
  const chain = (name, fn) => {
    const prev = proto[name];
    proto[name] = function (...args) { return fn.call(this, prev, ...args); };
  };

  chain('ensureCity', function (prev, c, founder) {
    prev.call(this, c, founder);
    this.ensureDev(c);
  });

  // Renda: avanços do futuro, Mecenato e manutenção do exército (a renda líquida pode ficar negativa)
  chain('income', function (prev, p) {
    const res = prev.call(this, p);
    const fp = p.futurePerks || {};
    if (fp.comercio_global) {
      const a = Math.round(res.stars * 0.05 * fp.comercio_global);
      if (a) { res.stars += a; res.lines.push({ label: PP.FUTURE_PERKS.comercio_global.name, stars: a, sci: 0 }); }
    }
    if (fp.metodo) {
      const a = Math.round(res.sci * 0.05 * fp.metodo);
      if (a) { res.sci += a; res.lines.push({ label: PP.FUTURE_PERKS.metodo.name, stars: 0, sci: a }); }
    }
    let pat = 0;
    for (const c of this.cities) if (c.owner === p.id && c.cproj && c.cproj.id === 'patronage') pat += this.patronageYield(c);
    if (pat) { res.sci += pat; res.lines.push({ label: PP.CITY_PROJECTS.patronage.name, stars: 0, sci: pat }); }
    res.upkeep = 0;
    if (this.upkeepOn()) {
      const up = this.upkeepOf(p);
      if (up.total) {
        res.upkeep = up.total;
        res.stars -= up.total;
        res.lines.push({ label: PP.t('Manutenção do exército'), stars: -up.total, sci: 0 });
      }
    }
    return res;
  });

  // Construções de segundo nível: rendimentos
  chain('eventCityIncome', function (prev, c, res) {
    if (prev) prev.call(this, c, res);
    for (const id in c.buildings) {
      const b = PP.BUILDINGS[id];
      if (!c.buildings[id] || !b || !b.upgradeOf) continue;
      if (b.addStars) res.stars += b.addStars;
      if (b.addSci) res.sci += b.addSci;
    }
  });

  chain('capacityBonus', function (prev, c) {
    return prev.call(this, c) + (c.buildings.barracks2 ? 2 : 0);
  });

  chain('cityHealBonus', function (prev, c) {
    return prev.call(this, c) + (c.buildings.temple2 ? 2 : 0);
  });

  chain('loyaltyFactors', function (prev, c) {
    const f = prev.call(this, c);
    if (c.buildings.temple2) f.push([PP.BUILDINGS.temple2.name, 10]);
    if (c.cproj && c.cproj.id === 'festival') f.push([PP.CITY_PROJECTS.festival.name, PP.CITY_PROJECTS.festival.loyalty]);
    return f;
  });

  chain('scoreExtras', function (prev, p) {
    let s = prev ? prev.call(this, p) : 0;
    for (const c of this.cities) if (c.owner === p.id && c.buildings.temple2) s += 100;
    return s;
  });

  // Vagas: só quando todo o resto permite construir
  chain('buildingCheck', function (prev, p, c, id) {
    const r = prev.call(this, p, c, id);
    if (!this.slotsOn() || !c || r.done || r.locked || r.specLocked || !this.usesSlot(id)) return r;
    if (r.ok || r.reason === PP.t('Faltam estrelas')) {
      const used = this.usedSlots(c), max = this.buildSlots(c);
      if (used >= max) { r.ok = false; r.noSlot = true; r.reason = PP.t('Sem vagas ({a}/{b})', { a: used, b: max }); }
    }
    return r;
  });

  // Reconstruir algo demolido não dá a população de novo
  chain('build', function (prev, p, c, id) {
    const b = PP.BUILDINGS[id];
    if (!b || !b.pop || !c || !c.razed || !c.razed[id]) return prev.call(this, p, c, id);
    const pop = b.pop;
    b.pop = 0;
    try { return prev.call(this, p, c, id); } finally { b.pop = pop; }
  });

  // Tecnologias do Futuro: cada uma vem com um avanço (perk); sem escolha, vale o primeiro disponível
  chain('researchFuture', function (prev, p, perk) {
    if (perk && PP.FUTURE_PERKS[perk] && !this.futurePerkCheck(p, perk).ok) return false;
    const id = perk && PP.FUTURE_PERKS[perk] ? perk : this.defaultFuturePerk(p);
    if (!prev.call(this, p)) return false;
    this.ensureDevPlayer(p);
    if (id) {
      p.futurePerks[id] = (p.futurePerks[id] || 0) + 1;
      if (this.realmReset) this.realmReset();
      this.invalidate();
      this.log(PP.t('{p} conquistou o avanço {x}.', { p: p.name, x: PP.FUTURE_PERKS[id].name }), p.id);
      this.emit('citydev', { type: 'perk', player: p.id, perk: id });
    }
    return true;
  });

  chain('computeCapacity', function (prev, p) {
    const res = prev.call(this, p);
    const n = (p.futurePerks && p.futurePerks.administracao) || 0;
    if (!n) return res;
    res.parts.push([PP.FUTURE_PERKS.administracao.name, n]);
    res.total += n;
    res.excess = Math.max(0, res.cities - res.total);
    res.rate = this.realmOn() ? Math.min(PP.REALM.disorderMax, PP.REALM.disorderStep * res.excess) : 0;
    return res;
  });

  chain('combatMods', function (prev, a, d, sa, sd) {
    const r = prev.call(this, a, d, sa, sd);
    const p = this.players[a.owner];
    const n = (p && p.futurePerks && p.futurePerks.taticas) || 0;
    if (n) { r.atk *= 1 + 0.1 * n; r.notes.push(PP.FUTURE_PERKS.taticas.name + ' +' + n * 10 + '%'); }
    return r;
  });

  chain('finalStats', function (prev) {
    const rows = prev.call(this);
    for (const r of rows) {
      const s = this.players[r.id].stats;
      r.upkeepPaid = s.upkeepPaid || 0;
      r.invested = s.invested || 0;
      r.projects = s.projects || 0;
    }
    return rows;
  });
  PP.STAT_LABELS.push(['upkeepPaid', 'Manutenção paga'], ['invested', 'Investido nas cidades'], ['projects', 'Projetos concluídos']);

  // ------------------------------------------------------------ Conquistas
  const devAch = [
    { id: 'mecenas', name: 'Mecenas', desc: 'Invista 150★ no crescimento das cidades.', max: 150, v: (g, p) => p.stats.invested || 0 },
    { id: 'urbanista', name: 'Urbanista', desc: 'Conclua 5 projetos de cidade.', max: 5, v: (g, p) => p.stats.projects || 0 },
    { id: 'visionario', name: 'Visionário', desc: 'Conquiste 3 avanços do futuro.', max: 3,
      v: (g, p) => Object.values(p.futurePerks || {}).reduce((s, n) => s + n, 0) },
  ];
  for (const a of devAch) if (!PP.ACHIEVEMENT[a.id]) { PP.ACHIEVEMENTS.push(a); PP.ACHIEVEMENT[a.id] = a; }

  // ------------------------------------------------------------ Ganchos
  PP.registerSystem('development', {
    configure(g) {
      if (g.opts.upkeep == null) g.opts.upkeep = true;
      if (g.opts.slots == null) g.opts.slots = true;
    },
    init(g) { g.cities.forEach(c => g.ensureDev(c)); g.players.forEach(p => g.ensureDevPlayer(p)); },
    load(g) { g.cities.forEach(c => g.ensureDev(c)); g.players.forEach(p => g.ensureDevPlayer(p)); },
    income(g, p, inc) {
      if (inc.upkeep) {
        // as estatísticas somam a renda bruta; a manutenção paga fica à parte
        p.stats.starsEarned = (p.stats.starsEarned || 0) + inc.upkeep;
        p.stats.upkeepPaid = (p.stats.upkeepPaid || 0) + inc.upkeep - (inc.deficit || 0);
      }
      g.advanceCityProjects(p);
    },
    capture(g, c) { c.cproj = null; },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
