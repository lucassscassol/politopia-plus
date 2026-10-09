/* Chamas de Vardren — formas de governo e tesouro (inspirados em Age of History).
   Cada tribo tem uma forma de governo, liberada por tecnologia: Chefia Tribal (a inicial), Monarquia, Teocracia,
   Feudalismo, República e Império (este só para quem já é grande: muitas cidades e uma capital estrangeira ou dois
   vassalos). Trocar de governo custa uma transição de anarquia (metade das estrelas e da ciência das cidades) e só
   pode ser feito de tempos em tempos. Os impostos têm quatro níveis: mais estrelas custam lealdade, um pouco de
   ciência (o orçamento da pesquisa) e, nos extorsivos, capacidade administrativa; impostos baixos fazem as cidades
   crescerem. Empréstimos adiantam estrelas
   com juros; quem deixa de pagar três parcelas seguidas dá calote. Partidas antigas começam com Chefia Tribal e
   impostos normais, que não mudam nada. */
(function (PP) {
  'use strict';
  const UN = PP.UNITS;

  // fx: efeitos de cada governo (stars/sci em fração da produção das cidades)
  PP.GOVERNMENTS = {
    tribal:     { name: 'Chefia Tribal', icon: 'gv_tribal', tech: null,
      desc: 'O governo inicial: sem bônus nem custos.', fx: {} },
    monarquia:  { name: 'Monarquia', icon: 'gv_monarquia', tech: 'organizacao',
      desc: '+1 de capacidade administrativa · +5 de lealdade · +2★ na capital · −10% de ciência',
      fx: { cap: 1, loyalty: 5, capitalStars: 2, sci: -0.1 } },
    teocracia:  { name: 'Teocracia', icon: 'gv_teocracia', tech: 'meditacao',
      desc: '+10 de lealdade · cada Templo rende +1★ · Missionários custam 2★ a menos · −15% de ciência',
      fx: { loyalty: 10, templeStars: 1, missionaryDiscount: 2, sci: -0.15 } },
    feudalismo: { name: 'Feudalismo', icon: 'gv_feudalismo', tech: 'estrategia',
      desc: 'Muralhas e fortificações pela metade do preço · tropas fortificadas +15% de defesa · vassalos pagam 25% de tributo · −10% de estrelas',
      fx: { stars: -0.1, fortHalf: true, fortifiedDef: 0.15, vassalTribute: 0.25 } },
    republica:  { name: 'República', icon: 'gv_republica', tech: 'comercio',
      desc: '+10% de ciência · +1★ por rota comercial ativa · cansaço de guerra: −20% de estrelas e −5 de lealdade enquanto houver guerra ativa',
      fx: { sci: 0.1, routeStars: 1, warWeariness: 0.2, warLoyalty: -5 } },
    imperio:    { name: 'Império', icon: 'gv_imperio', tech: 'burocracia',
      desc: '+2 de capacidade administrativa · +10% de estrelas · cidades conquistadas ficam ocupadas só 2 turnos · vassalos pagam 20% de tributo',
      info: 'Exige muitas cidades e uma capital estrangeira ou dois vassalos.',
      fx: { cap: 2, stars: 0.1, occupation: 2, vassalTribute: 0.2 } },
  };
  PP.GOV_ORDER = Object.keys(PP.GOVERNMENTS);
  // anarquia: turnos de transição (o Império é proclamado em 1); cooldown: turnos entre trocas
  PP.GOV_RULES = { anarchy: 2, empireAnarchy: 1, cooldown: 10, anarchyCut: 0.5, anarchyLoyalty: -10, empireCitiesSmall: 6, empireCitiesBig: 8 };

  PP.TAXES = {
    baixos:     { name: 'Baixos', label: 'Impostos baixos', stars: -0.2, sci: 0.1, loyalty: 10, growth: 6,
      desc: '−20% de estrelas e +10% de ciência das cidades · +10 de lealdade · as cidades ganham 1 de população a cada 6 turnos' },
    normais:    { name: 'Normais', label: 'Impostos normais', desc: 'Sem efeitos.' },
    altos:      { name: 'Altos', label: 'Impostos altos', stars: 0.2, sci: -0.25, loyalty: -10,
      desc: '+20% de estrelas e −25% de ciência das cidades · −10 de lealdade' },
    extorsivos: { name: 'Extorsivos', label: 'Impostos extorsivos', stars: 0.4, sci: -0.5, loyalty: -20, cap: -1,
      desc: '+40% de estrelas e −50% de ciência das cidades · −20 de lealdade · −1 de capacidade administrativa' },
  };
  PP.TAX_ORDER = ['baixos', 'normais', 'altos', 'extorsivos'];

  PP.LOANS = {
    small: { name: 'Empréstimo pequeno', mult: 3, min: 10, max: 60, interest: 0.2, turns: 6 },
    large: { name: 'Empréstimo grande', mult: 6, min: 20, max: 120, interest: 0.35, turns: 10 },
  };
  PP.LOAN_RULES = { tech: 'comercio', bankCut: 0.1, missLimit: 3, missPenalty: 0.1, lockout: 20 };

  const G = {
    ensureGov(p) {
      if (!p.gov || !PP.GOVERNMENTS[p.gov]) p.gov = 'tribal';
      if (p.govSince == null) p.govSince = -99;
      if (p.anarchyUntil == null) p.anarchyUntil = 0;
      if (!p.tax || !PP.TAXES[p.tax]) p.tax = 'normais';
      if (p.taxGrowth == null) p.taxGrowth = 0;
      if (p.loan === undefined) p.loan = null;
      if (p.noLoanUntil == null) p.noLoanUntil = 0;
    },

    // ------------------------------------------------------------ Governo
    inAnarchy(p) { return !!p && this.turn <= (p.anarchyUntil || 0); },

    // Efeitos em vigor (nenhum durante a anarquia)
    govEffects(p) {
      if (!p || this.inAnarchy(p)) return {};
      return (PP.GOVERNMENTS[p.gov] || PP.GOVERNMENTS.tribal).fx;
    },

    taxEffects(p) { return (p && PP.TAXES[p.tax]) || PP.TAXES.normais; },

    // Requisitos do Império: cidades (6 nos mapas até 18×18, 8 nos maiores) e uma capital estrangeira ou dois vassalos
    empireStatus(p) {
      const need = this.W <= 18 ? PP.GOV_RULES.empireCitiesSmall : PP.GOV_RULES.empireCitiesBig;
      const cities = this.citiesOf(p.id);
      const capitals = cities.filter(c => c.origCapital >= 0 && c.origCapital !== p.id).length;
      const vassals = this.vassalsOf ? this.vassalsOf(p.id).length : 0;
      const ok = cities.length >= need && (capitals >= 1 || vassals >= 2);
      let reason = '';
      if (cities.length < need) reason = PP.t('Exige {n} cidades ({m} agora)', { n: need, m: cities.length });
      else if (!ok) reason = PP.t('Exige uma capital estrangeira ou 2 vassalos');
      return { ok, need, cities: cities.length, capitals, vassals, reason };
    },

    govCheck(p, id) {
      const def = PP.GOVERNMENTS[id];
      const r = { ok: false, reason: '', anarchy: id === 'imperio' ? PP.GOV_RULES.empireAnarchy : PP.GOV_RULES.anarchy };
      if (!def) { r.reason = PP.t('Governo desconhecido'); return r; }
      if (p.gov === id) { r.reason = this.inAnarchy(p) ? PP.t('Em transição') : PP.t('Governo atual'); r.current = true; return r; }
      if (def.tech && !this.has(p, def.tech)) { r.reason = PP.t('Requer {x}', { x: PP.TECH[def.tech].name }); r.locked = true; return r; }
      if (id === 'imperio') { const e = this.empireStatus(p); if (!e.ok) { r.reason = e.reason; return r; } }
      if (this.inAnarchy(p)) { r.reason = PP.t('Espere o fim da anarquia'); return r; }
      const wait = (p.govSince == null ? -99 : p.govSince) + PP.GOV_RULES.cooldown - this.turn;
      if (wait > 0) { r.reason = PP.t('Nova troca em {n} turnos', { n: wait }); return r; }
      r.ok = true;
      return r;
    },

    adoptGov(p, id) {
      if (this.over || p.id !== this.current) return false;
      const chk = this.govCheck(p, id);
      if (!chk.ok) return false;
      const was = p.gov;
      p.gov = id;
      p.govSince = this.turn;
      p.anarchyUntil = this.turn + chk.anarchy;
      p.stats.govChanges = (p.stats.govChanges || 0) + 1;
      if (this.realmReset) this.realmReset();
      this.invalidate();
      if (id === 'imperio') this.log(PP.t('{p} proclamou o Império!', { p: p.name }), null);
      else this.log(PP.t('{p} adotou a forma de governo {g}. Anarquia por {n} turnos.', { p: p.name, g: PP.GOVERNMENTS[id].name, n: chk.anarchy }), p.id);
      this.hook('government', p, id, was);
      this.emit('gov', { type: 'change', player: p.id, gov: id, was, anarchy: chk.anarchy });
      return true;
    },

    // Guerras "ativas": declaradas durante a partida ou com combate nos últimos 8 turnos (a guerra inicial de
    // todos contra todos não conta enquanto ninguém luta)
    activeWars(pid) {
      const p = this.players[pid];
      const out = [];
      for (const q of this.players) {
        if (q.id === pid || !q.alive || !p.met[q.id] || !this.atWar(pid, q.id)) continue;
        const r = p.rel[q.id];
        const last = p.lastCombat ? p.lastCombat[q.id] : null;
        if ((r && r.since > 0) || (last != null && this.turn - last <= 8)) out.push(q.id);
      }
      return out;
    },

    // ------------------------------------------------------------ Impostos
    setTax(p, id) {
      if (this.over || p.id !== this.current || !PP.TAXES[id] || p.tax === id) return false;
      p.tax = id;
      if (!PP.TAXES[id].growth) p.taxGrowth = 0;
      if (this.realmReset) this.realmReset();
      this.invalidate();
      this.emit('gov', { type: 'tax', player: p.id, tax: id });
      return true;
    },

    // ------------------------------------------------------------ Empréstimos
    loanTerms(p, kind) {
      const L = PP.LOANS[kind];
      const inc = this.income(p).stars;
      const amount = Math.max(L.min, Math.min(L.max, Math.round(inc * L.mult / 5) * 5));
      const bank = this.citiesOf(p.id).some(c => c.buildings.bank);
      const rate = Math.max(0.05, L.interest - (bank ? PP.LOAN_RULES.bankCut : 0));
      const total = Math.round(amount * (1 + rate));
      return { kind, amount, rate, total, turns: L.turns, per: Math.ceil(total / L.turns), bank };
    },

    loanCheck(p, kind) {
      const r = { ok: false, reason: '' };
      if (!PP.LOANS[kind]) { r.reason = PP.t('Inválido'); return r; }
      if (!this.has(p, PP.LOAN_RULES.tech)) { r.reason = PP.t('Requer {x}', { x: PP.TECH[PP.LOAN_RULES.tech].name }); r.locked = true; return r; }
      r.terms = this.loanTerms(p, kind);
      if (p.loan) { r.reason = PP.t('Quite o empréstimo atual primeiro'); return r; }
      if (this.turn < (p.noLoanUntil || 0)) { r.reason = PP.t('Crédito suspenso até o turno {n}', { n: p.noLoanUntil }); return r; }
      r.ok = true;
      return r;
    },

    takeLoan(p, kind) {
      if (this.over || p.id !== this.current) return false;
      const chk = this.loanCheck(p, kind);
      if (!chk.ok) return false;
      const t = chk.terms;
      p.stars += t.amount;
      p.loan = { kind, amount: t.amount, left: t.total, per: t.per, since: this.turn, missed: 0 };
      p.stats.loans = (p.stats.loans || 0) + 1;
      this.log(PP.t('{p} tomou um empréstimo de {n}★ (devolve {m}★ em {t} turnos).', { p: p.name, n: t.amount, m: t.total, t: t.turns }), p.id);
      this.emit('loan', { type: 'take', player: p.id, amount: t.amount });
      return true;
    },

    repayLoan(p) {
      if (this.over || p.id !== this.current || !p.loan || p.stars < p.loan.left) return false;
      p.stars -= p.loan.left;
      p.loan = null;
      p.stats.loansRepaid = (p.stats.loansRepaid || 0) + 1;
      this.log(PP.t('{p} quitou o empréstimo.', { p: p.name }), p.id);
      this.emit('loan', { type: 'repaid', player: p.id });
      return true;
    },

    // Parcela cobrada no começo do turno, depois da renda
    payLoanInstallment(p) {
      const L = p.loan;
      if (!L || L.since >= this.turn) return;
      const due = Math.min(L.per, L.left);
      const paid = Math.min(p.stars, due);
      p.stars -= paid;
      L.left -= paid;
      if (paid < due) {
        L.missed++;
        L.left += Math.ceil((due - paid) * PP.LOAN_RULES.missPenalty);
        this.log(PP.t('{p} não conseguiu pagar a parcela do empréstimo ({n}/{m}).', { p: p.name, n: L.missed, m: PP.LOAN_RULES.missLimit }), p.id);
        this.emit('loan', { type: 'missed', player: p.id, missed: L.missed });
        if (L.missed >= PP.LOAN_RULES.missLimit) { this.bankrupt(p); return; }
      } else L.missed = 0;
      if (L.left <= 0) {
        p.loan = null;
        p.stats.loansRepaid = (p.stats.loansRepaid || 0) + 1;
        this.log(PP.t('{p} terminou de pagar o empréstimo.', { p: p.name }), p.id);
        this.emit('loan', { type: 'repaid', player: p.id });
      }
    },

    // Calote: a dívida some, mas a reputação cai, o governo entra em crise e o crédito fica suspenso
    bankrupt(p) {
      p.loan = null;
      p.noLoanUntil = this.turn + PP.LOAN_RULES.lockout;
      p.reputation = Math.max(-10, (p.reputation || 0) - 2);
      p.anarchyUntil = Math.max(p.anarchyUntil || 0, this.turn + PP.GOV_RULES.anarchy);
      if (this.realmReset) this.realmReset();
      this.log(PP.t('{p} deu calote! O governo entra em crise (anarquia por {n} turnos).', { p: p.name, n: PP.GOV_RULES.anarchy }), null);
      this.emit('loan', { type: 'bankrupt', player: p.id });
    },
  };
  Object.assign(PP.Game.prototype, G);

  // ------------------------------------------------------------ Extensões encadeadas das regras existentes
  const proto = PP.Game.prototype;
  const chain = (name, fn) => {
    const prev = proto[name];
    proto[name] = function (...args) { return fn.call(this, prev, ...args); };
  };

  // Capacidade administrativa: governo e impostos
  chain('computeCapacity', function (prev, p) {
    const res = prev.call(this, p);
    const add = (label, n) => { if (n) { res.parts.push([label, n]); res.total += n; } };
    const fx = this.govEffects(p);
    if (fx.cap) add(PP.GOVERNMENTS[p.gov].name, fx.cap);
    const tx = this.taxEffects(p);
    if (tx.cap) add(tx.label, tx.cap);
    res.total = Math.max(1, res.total);
    res.excess = Math.max(0, res.cities - res.total);
    res.rate = this.realmOn() ? Math.min(PP.REALM.disorderMax, PP.REALM.disorderStep * res.excess) : 0;
    return res;
  });

  // Lealdade: governo, impostos, anarquia e cansaço de guerra
  chain('loyaltyFactors', function (prev, c) {
    const f = prev.call(this, c);
    const p = this.players[c.owner];
    const fx = this.govEffects(p);
    if (fx.loyalty) f.push([PP.GOVERNMENTS[p.gov].name, fx.loyalty]);
    const tx = this.taxEffects(p);
    if (tx.loyalty) f.push([tx.label, tx.loyalty]);
    if (this.inAnarchy(p)) f.push([PP.t('Anarquia'), PP.GOV_RULES.anarchyLoyalty]);
    if (fx.warLoyalty && this.activeWars(p.id).length) f.push([PP.t('Cansaço de guerra'), fx.warLoyalty]);
    return f;
  });

  // Renda de cada cidade: corte da Monarquia e templos da Teocracia
  chain('eventCityIncome', function (prev, c, res) {
    if (prev) prev.call(this, c, res);
    const fx = this.govEffects(this.players[c.owner]);
    if (fx.capitalStars && c.capital) { res.stars += fx.capitalStars; res.notes.push(PP.t('{b} +{n}★', { b: PP.GOVERNMENTS.monarquia.name, n: fx.capitalStars })); }
    if (fx.templeStars && c.buildings.temple) { res.stars += fx.templeStars; res.notes.push(PP.t('{b} +{n}★', { b: PP.BUILDINGS.temple.name, n: fx.templeStars })); }
  });

  // Renda do reino: percentuais do governo e dos impostos sobre a produção das cidades, anarquia e rotas da República
  chain('eventIncome', function (prev, p, res) {
    if (prev) prev.call(this, p, res);
    const base = res.lines[0] || { stars: 0, sci: 0 };
    // arredonda para longe do zero dos dois lados: um corte de 6,5 vira 7, assim como um bônus de 6,5
    const rnd = v => (v < 0 ? -Math.round(-v) : Math.round(v));
    const line = (label, ds, dk) => {
      ds = rnd(ds); dk = rnd(dk);
      if (!ds && !dk) return;
      res.stars += ds; res.sci += dk;
      res.lines.push({ label, stars: ds, sci: dk });
    };
    if (this.inAnarchy(p)) line(PP.t('Anarquia'), -base.stars * PP.GOV_RULES.anarchyCut, -base.sci * PP.GOV_RULES.anarchyCut);
    else {
      const fx = this.govEffects(p);
      if (fx.stars || fx.sci) line(PP.GOVERNMENTS[p.gov].name, base.stars * (fx.stars || 0), base.sci * (fx.sci || 0));
      if (fx.routeStars) {
        let n = 0;
        for (const r of this.routes || []) if (r.active && r.owner === p.id) n++;
        line(PP.t('Rotas da República'), n * fx.routeStars, 0);
      }
      if (fx.warWeariness && this.activeWars(p.id).length) line(PP.t('Cansaço de guerra'), -base.stars * fx.warWeariness, 0);
    }
    const tx = this.taxEffects(p);
    if (tx.stars || tx.sci) line(tx.label, base.stars * (tx.stars || 0), base.sci * (tx.sci || 0));
  });

  // Teocracia: missionários mais baratos
  chain('unitCost', function (prev, p, c, type) {
    let cost = prev ? prev.call(this, p, c, type) : UN[type].cost;
    const fx = this.govEffects(p);
    if (fx.missionaryDiscount && type === 'missionary') cost -= fx.missionaryDiscount;
    return Math.max(1, cost);
  });

  // Feudalismo: muralhas e fortificações pela metade
  chain('buildingCost', function (prev, p, id, c) {
    let cost = prev.call(this, p, id, c);
    if (id === 'walls' && this.govEffects(p).fortHalf) cost = Math.ceil(cost / 2);
    return cost;
  });

  chain('tileActionCheck', function (prev, p, t, id) {
    const r = prev.call(this, p, t, id);
    const a = PP.TILE_ACTION[id];
    if (!r.visible || !a || !a.fort || !this.govEffects(p).fortHalf) return r;
    r.cost = Math.ceil(r.cost / 2);
    if (!r.ok && r.reason === PP.t('Faltam estrelas') && p.stars >= r.cost) { r.ok = true; r.reason = ''; }
    return r;
  });

  // Feudalismo: tropas fortificadas resistem mais
  chain('defenseMods', function (prev, d, attacker, b, t, st) {
    b = prev.call(this, d, attacker, b, t, st);
    const fx = this.govEffects(this.players[d.owner]);
    if (fx.fortifiedDef && d.fortified) b *= 1 + fx.fortifiedDef;
    return b;
  });
  chain('defenseNotes', function (prev, d) {
    const out = prev.call(this, d);
    if (d.fortified && this.govEffects(this.players[d.owner]).fortifiedDef) out.push(PP.GOVERNMENTS.feudalismo.name);
    return out;
  });

  // ------------------------------------------------------------ Conquistas
  const govAch = [
    { id: 'coroacao', name: 'Coroação', desc: 'Proclame o Império.', max: 1, v: (g, p) => (p.gov === 'imperio' ? 1 : 0) },
    { id: 'reformador', name: 'Reformador', desc: 'Troque de forma de governo 3 vezes.', max: 3, v: (g, p) => p.stats.govChanges || 0 },
  ];
  for (const a of govAch) if (!PP.ACHIEVEMENT[a.id]) { PP.ACHIEVEMENTS.push(a); PP.ACHIEVEMENT[a.id] = a; }

  // ------------------------------------------------------------ Ganchos de turno
  PP.registerSystem('government', {
    init(g) { g.players.forEach(p => g.ensureGov(p)); },
    load(g) { g.players.forEach(p => g.ensureGov(p)); },
    beforeTurn(g, p) {
      if (g.turn > 1 && p.anarchyUntil === g.turn - 1) {
        if (g.realmReset) g.realmReset();
        g.log(PP.t('{p}: fim da anarquia, {g} em vigor.', { p: p.name, g: PP.GOVERNMENTS[p.gov].name }), p.id);
        g.emit('gov', { type: 'stable', player: p.id, gov: p.gov });
      }
      // impostos baixos: as cidades crescem (1 de população a cada 6 turnos com o imposto em vigor)
      const tx = g.taxEffects(p);
      if (tx.growth && g.turn > 1) {
        p.taxGrowth = (p.taxGrowth || 0) + 1;
        if (p.taxGrowth >= tx.growth) {
          p.taxGrowth = 0;
          for (const c of g.citiesOf(p.id)) if (!(c.occupied > 0)) g.addPop(c, 1);
        }
      }
    },
    income(g, p) { g.payLoanInstallment(p); },
    // Império: cidades conquistadas ficam ocupadas menos tempo
    capture(g, c, old, p) {
      const fx = g.govEffects(p);
      if (fx.occupation && c.occupied > fx.occupation) c.occupied = fx.occupation;
    },
    // guarda o último combate entre cada par de tribos (guerra ativa / cansaço de guerra)
    attacked(g, a, ev, dOwner) {
      if (dOwner == null || dOwner === a.owner || !g.players[dOwner]) return;
      const A = g.players[a.owner], B = g.players[dOwner];
      (A.lastCombat || (A.lastCombat = {}))[dOwner] = g.turn;
      (B.lastCombat || (B.lastCombat = {}))[a.owner] = g.turn;
    },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
