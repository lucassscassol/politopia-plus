/* Chamas de Vardren — IA do desenvolvimento das cidades e da guerra de 2.4: orçamento do exército (recruta dentro da
   manutenção e dispensa tropas velhas quando a conta passa do limite), vagas de construção (só as melhores para cada
   cidade, trocando construções inúteis), investimento em crescimento, projetos de cidade, avanços do futuro,
   acampamentos rebeldes, Missionários que pregam e a coalizão contra o líder.
   Estende js/ai.js pelos pontos AI.ext (spendOptions, buildingValue e goals) e envolve AI.takeTurn,
   PP.AIStrategy (diplomacy, evaluateProposal e chooseTarget) e PP.AICrown.govScores. */
(function (PP) {
  'use strict';
  const AI = PP.AI, S = PP.AIStrategy, UN = PP.UNITS;
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const D = {};

  // ------------------------------------------------------------ Orçamento do exército
  // Fração da renda bruta que a IA aceita gastar com manutenção
  D.upkeepBudget = function (g, p, threatened) {
    const inc = g.income(p);
    const gross = inc.stars + (inc.upkeep || 0);
    const strat = p.ai.strategy;
    let share = strat === 'dominacao' ? 0.5 : strat === 'defesa' ? 0.4 : 0.32;
    if (g.activeWars && g.activeWars(p.id).length) share += 0.15;
    if (threatened) share += 0.15;
    return { budget: Math.max(3, gross * share), upkeep: inc.upkeep || 0, net: inc.stars, gross };
  };

  // Valor de uma tropa para decidir quem dispensar (as mais fracas e gastas saem primeiro)
  D.unitWorth = function (g, u) {
    const d = UN[u.type];
    return (d.atk + d.def + d.hp / 5 + d.range * 0.5) * (u.hp / g.maxHp(u)) + u.xp * 0.4 + u.promos.length;
  };

  // Dispensa tropas velhas e longe do inimigo quando a manutenção passa muito do orçamento (ou a renda fica negativa)
  D.trimArmy = function (g, p) {
    if (!g.upkeepOn()) return 0;
    const inc = g.income(p);
    const b = D.upkeepBudget(g, p, false);
    const negative = inc.stars < 0;
    if (!negative && !(b.upkeep >= 4 && b.upkeep > b.budget * 1.5)) return 0;
    const cities = g.citiesOf(p.id);
    const army = g.units.filter(u => u.owner === p.id && !UN[u.type].character && g.unitUpkeepFor(p, u.type) > 0);
    const minArmy = 1 + cities.length;
    const enemies = g.units.filter(e => g.atWar(p.id, e.owner) && p.visible[e.y * g.W + e.x]);
    const cands = army.filter(u => {
      if (u.cargo && u.cargo.length) return false;
      if (enemies.some(e => cheb(e, u) <= 3)) return false;
      const t = g.tileAt(u);
      return !(t.city && g.cityMap[t.city].owner === p.id);
    }).sort((a, b) => D.unitWorth(g, a) - D.unitWorth(g, b));
    let n = negative ? 3 : 1, left = army.length, done = 0;
    for (const u of cands) {
      if (n <= 0 || left <= minArmy) break;
      if (g.disband(u)) { n--; left--; done++; }
    }
    return done;
  };

  // ------------------------------------------------------------ Gastos: reavaliação das opções do ai.js
  // Valor atual de uma construção já feita (para decidir o que demolir quando faltam vagas)
  D.builtValue = function (ctx, c, id) {
    const g = ctx.g, p = ctx.p, b = PP.BUILDINGS[id];
    if (!b) return 0;
    if (b.spec && b.spec !== c.spec) return 0; // inativa: a cidade mudou de especialização
    const sci = p.ai.sci;
    switch (id) {
      case 'granary': return c.buildings.granary2 ? 9 : 0.2;
      case 'barracks': return g.upkeepOn() ? 1.2 : 0.5;
      case 'library': return 2.2 * sci;
      case 'university': return 3.2 * sci;
      case 'bank': return 3.6;
      case 'temple': return 0.9 + (c.founder !== c.owner ? 0.8 : 0);
      case 'guard': return 0.4;
      case 'tribunal': return 1.4 + (g.realmOn() ? g.adminExcess(p) * 0.5 : 0);
      case 'war_academy': return 1.0;
      case 'foundry': return 2.4;
      case 'press': return 1.8 * sci;
      case 'arsenal': return 1.2;
      case 'citadel': return 1.2;
      case 'observatory': return 2 * sci;
      case 'academy_hall': return 2.8 * sci;
      case 'guild': return 2.4;
      case 'exchange': return 3.2;
      case 'silos': return 1.0;
      case 'aqueduct': return 1.1;
      case 'shipyard': return 0.6;
      case 'lighthouse': return 0.6;
      case 'customs': return 2.5;
    }
    return 1;
  };

  // Valor de uma construção ainda não feita (para as trocas): as de população valem pelo crescimento imediato
  D.candidateValue = function (ctx, c, id) {
    if (c.razed && c.razed[id] && PP.BUILDINGS[id].pop) return D.builtValue(ctx, c, id); // sem a população de novo
    if (id === 'granary') return ctx.popValue(c, 2);
    if (id === 'temple') return ctx.popValue(c, 1) + 0.4 + (c.unrest || c.occupied ? 1.5 : 0);
    if (id === 'aqueduct') return ctx.popValue(c, 2) + 0.5;
    const v = D.builtValue(ctx, c, id);
    const strat = ctx.strategy;
    if (strat === 'ciencia' && ['library', 'university', 'observatory', 'academy_hall', 'press'].indexOf(id) >= 0) return v * 1.4;
    if (strat === 'economia' && ['bank', 'guild', 'exchange', 'customs'].indexOf(id) >= 0) return v * 1.4;
    return v;
  };

  // Vagas: só as construções mais valiosas para cada cidade; sem vaga, troca uma construção inútil por uma muito melhor
  D.filterBySlots = function (ctx, out) {
    const g = ctx.g, p = ctx.p;
    const byCity = new Map();
    for (const o of out) {
      if (o.kind !== 'building' || !g.usesSlot(o.id)) continue;
      if (!byCity.has(o.city)) byCity.set(o.city, []);
      byCity.get(o.city).push(o);
    }
    for (const [c, list] of byCity) {
      const free = g.freeSlots(c);
      list.sort((a, b) => b.v - a.v);
      list.forEach((o, i) => {
        if (i >= free) o.score = 0;
        else if (free - i <= 1 && o.v < 1.6) o.score = 0; // a última vaga fica para algo que valha a pena
        else if (o.v < 0.9) o.score = 0;
      });
    }
    for (const c of ctx.cities) {
      if (g.freeSlots(c) > 0) continue;
      let best = null, bv = 0;
      for (const id of PP.BUILDING_ORDER) {
        if (c.buildings[id] || !g.usesSlot(id)) continue;
        const chk = g.buildingCheck(p, c, id);
        if (!chk.noSlot) continue;
        const v = D.candidateValue(ctx, c, id);
        if (v > bv) { bv = v; best = { id, cost: chk.cost }; }
      }
      if (!best) continue;
      let worst = null, wv = 1e9;
      for (const id in c.buildings) {
        if (!c.buildings[id] || !g.demolishCheck(p, c, id).ok) continue;
        const v = D.builtValue(ctx, c, id);
        if (v < wv) { wv = v; worst = id; }
      }
      if (!worst || bv < wv + 1.2) continue;
      const pick = best, old = worst;
      out.push({ score: (bv - wv) / (pick.cost + 1), cost: pick.cost, kind: 'swap', city: c,
        exec: () => p.stars >= pick.cost && g.demolish(p, c, old) && g.build(p, c, pick.id) });
    }
  };

  D.growthOptions = function (ctx, out) {
    const g = ctx.g, p = ctx.p;
    const eco = p.ai.eco;
    for (const c of ctx.cities) {
      const chk = g.investCheck(p, c);
      if (!chk.ok && chk.reason !== PP.t('Faltam estrelas')) continue;
      let v = ctx.popValue(c, 1);
      if (c.pop + 1 >= c.level + 1 && [5, 7, 9, 11].indexOf(c.level) >= 0) v += 0.5; // marcos e Metrópole
      out.push({ score: v / (chk.cost + 1) * eco * 0.9, cost: chk.cost, kind: 'invest', city: c, exec: () => g.invest(p, c) });
    }
  };

  D.projectOptions = function (ctx, out) {
    const g = ctx.g, p = ctx.p;
    const wars = g.activeWars ? g.activeWars(p.id).length : 0;
    const sciW = p.ai.sci * (ctx.strategy === 'ciencia' ? 1.5 : 1) * (g.allTechs(p) ? 0.6 : 1);
    for (const c of ctx.cities) {
      if (c.cproj) continue;
      for (const id of PP.CPROJ_ORDER) {
        const chk = g.cprojCheck(p, c, id);
        if (!chk.ok && chk.reason !== PP.t('Faltam estrelas')) continue;
        let v = 0;
        if (id === 'festival') v = c.founder !== c.owner && (c.unrest || c.loyalty < 60) ? 2.4 : ctx.popValue(c, 1) * 0.7;
        else if (id === 'patronage') v = 0.25 * c.level * sciW;
        else if (id === 'drills') {
          if (!wars && !ctx.anyThreat) continue;
          let n = 0;
          for (const u of g.units) if (u.owner === p.id && !UN[u.type].naval && UN[u.type].atk > 0 && cheb(u, c) <= 1) n++;
          v = n * 0.35 * ctx.aggr;
        }
        if (v > 0) out.push({ score: v / (chk.cost + 1), cost: chk.cost, kind: 'cproj', city: c, exec: () => g.startCityProject(p, c, id) });
      }
    }
  };

  D.spendOptions = function (ctx, out) {
    const g = ctx.g, p = ctx.p;
    if (g.upkeepOn()) {
      const b = D.upkeepBudget(g, p, ctx.anyThreat);
      const up = g.upkeepOf(p);
      for (const o of out) {
        if (o.kind === 'unit') {
          const add = up.units < up.free ? 0 : g.unitUpkeepFor(p, o.type) * up.mult;
          if (b.upkeep + add > b.budget) o.score *= o.threat > 0 ? 0.5 : 0.08;
          if (add && b.net - add < 0 && !(o.threat > 0)) o.score = 0; // nunca recruta para ficar no vermelho
        } else if (o.kind === 'building' && (o.id === 'barracks' || o.id === 'barracks2')) {
          o.v += 0.8;
          o.score = o.v / (o.cost + 1);
        }
      }
    }
    // reconstruir algo demolido não dá população de novo: vale só pelo efeito que continua
    for (const o of out) {
      if (o.kind !== 'building' || !o.city.razed || !o.city.razed[o.id] || !PP.BUILDINGS[o.id].pop) continue;
      o.v = D.builtValue(ctx, o.city, o.id);
      o.score = o.v / (o.cost + 1);
    }
    if (g.slotsOn()) D.filterBySlots(ctx, out);
    D.growthOptions(ctx, out);
    D.projectOptions(ctx, out);
    // Missionário para cidades conquistadas que resistem
    if (g.has(p, PP.UNITS.missionary.tech)) {
      const shaky = ctx.cities.filter(c => c.founder !== c.owner && (c.unrest || c.loyalty < 50));
      const have = g.units.some(u => u.owner === p.id && u.type === 'missionary');
      if (shaky.length && !have) {
        const c = ctx.cities.find(x => !g.unitAt(x.x, x.y) && cheb(x, shaky[0]) <= 6 && (g.trainCheck(p, x, 'missionary').ok || g.trainCheck(p, x, 'missionary').reason === PP.t('Faltam estrelas')));
        if (c) out.push({ score: 0.55, cost: g.unitCostFor(p, c, 'missionary'), kind: 'unit', type: 'missionary', city: c, exec: () => !!g.train(p, c, 'missionary') });
      }
    }
    for (let i = out.length - 1; i >= 0; i--) if (!(out[i].score > 0)) out.splice(i, 1);
  };

  const prevSpend = AI.ext.spendOptions;
  AI.ext.spendOptions = function (ctx, out) {
    if (prevSpend) prevSpend(ctx, out);
    try { D.spendOptions(ctx, out); } catch (e) { console.error('IA (desenvolvimento):', e); }
  };

  // Construções de segundo nível
  const prevBV = AI.ext.buildingValue;
  AI.ext.buildingValue = function (ctx, c, id, chk) {
    const p = ctx.p;
    switch (id) {
      case 'library2': return 2 * p.ai.sci * (ctx.strategy === 'ciencia' ? 1.4 : 1);
      case 'bank2': return 3.2 * (ctx.strategy === 'economia' ? 1.4 : 1);
      case 'granary2': return ctx.popValue(c, 2);
      case 'temple2': return ctx.popValue(c, 1) + 0.6 + (c.unrest || c.occupied ? 1.5 : 0);
      case 'barracks2': return ctx.aggr > 1 ? 1.4 : 0.6;
    }
    return prevBV ? prevBV(ctx, c, id, chk) : 0;
  };

  // ------------------------------------------------------------ Objetivos das unidades
  const prevGoals = AI.ext.goals;
  AI.ext.goals = function (ctx, u, push) {
    if (prevGoals) prevGoals(ctx, u, push);
    const g = ctx.g, p = ctx.p, d = UN[u.type];
    // acampamentos rebeldes: tropas de combate com vida para aguentar o dano
    if (g.camps && g.camps.length && !d.naval && !d.spy && !d.character && u.type !== 'scout' && g.stat(u).atk > 0) {
      for (const k of g.camps) {
        if (!p.explored[k.y * ctx.W + k.x] || u.hp <= g.campDamage(k) + 2) continue;
        const near = ctx.cities.some(c => cheb(c, k) <= 3);
        push(k.y * ctx.W + k.x, 4 + k.str * 2 + (near ? 4 : 0), 'camp', 1);
      }
    }
    // Missionários vão para as cidades conquistadas que ainda resistem
    if (u.type === 'missionary') {
      for (const c of ctx.cities) if (c.founder !== c.owner && (c.unrest || c.loyalty < 70)) push(c.y * ctx.W + c.x, 9, 'preach', 1);
    }
  };

  // Pregar quando ajuda: em cidade própria que precisa, em cidade inimiga conquistada (pode se revoltar) ou em paz
  D.preach = function (g, p) {
    for (const u of g.units.slice()) {
      if (u.owner !== p.id || u.type !== 'missionary' || u.dead) continue;
      const chk = g.abilityCheck(u, 'preach');
      if (!chk.ok) continue;
      const c = chk.target;
      let useful;
      if (c.owner === p.id) useful = c.founder !== c.owner || c.unrest || c.loyalty < 100;
      else if (g.atWar(p.id, c.owner)) useful = c.founder !== c.owner;
      else useful = g.opinion(c.owner, p.id) < 40;
      if (useful) g.useAbility(u, 'preach');
    }
  };

  // ------------------------------------------------------------ Avanços do futuro: conforme o objetivo
  const PERKS_BY = {
    dominacao: ['taticas', 'logistica', 'comercio_global', 'administracao', 'urbanismo', 'metodo'],
    defesa: ['logistica', 'taticas', 'comercio_global', 'administracao', 'urbanismo', 'metodo'],
    ciencia: ['metodo', 'comercio_global', 'urbanismo', 'administracao', 'logistica', 'taticas'],
    economia: ['comercio_global', 'urbanismo', 'logistica', 'administracao', 'metodo', 'taticas'],
    territorial: ['urbanismo', 'administracao', 'comercio_global', 'logistica', 'metodo', 'taticas'],
    diplomacia: ['comercio_global', 'administracao', 'urbanismo', 'metodo', 'logistica', 'taticas'],
  };
  D.choosePerk = function (g, p) {
    const order = PERKS_BY[p.ai.strategy] || PP.FUTURE_ORDER;
    return order.find(id => g.futurePerkCheck(p, id).ok) || null;
  };
  const proto = PP.Game.prototype;
  const prevDefPerk = proto.defaultFuturePerk;
  proto.defaultFuturePerk = function (p) {
    if (p && !p.human && p.ai) { const pick = D.choosePerk(this, p); if (pick) return pick; }
    return prevDefPerk.call(this, p);
  };

  // ------------------------------------------------------------ Governo: o Feudalismo alivia a manutenção
  if (PP.AICrown && PP.AICrown.govScores) {
    const prevGS = PP.AICrown.govScores;
    PP.AICrown.govScores = function (g, p) {
      const sc = prevGS.call(this, g, p);
      if (sc.feudalismo != null && g.upkeepOn()) {
        const up = g.upkeepOf(p).total;
        if (up >= 6) sc.feudalismo += Math.min(0.9, up / 25);
      }
      return sc;
    };
  }

  // ------------------------------------------------------------ Coalizão contra o líder
  D.coalition = function (g, p) {
    const t = g.coalition;
    if (t == null || p.human || g.over || !g.inCoalition(p.id) || g.isVassal(p.id)) return;
    const rel = g.relState(p.id, t);
    const fighting = g.activeWars(p.id).indexOf(t) >= 0;
    for (const q of g.players) {
      if (q.id === p.id || q.id === t || !q.alive || !p.met[q.id] || !g.inCoalition(q.id)) continue;
      // membros em guerra (mesmo a guerra inicial de todos contra todos) fazem as pazes para se unir
      if (g.atWar(p.id, q.id) && g.activeWars(p.id).indexOf(q.id) < 0 && g.rng.next() < 0.15) { g.proposePeace(p.id, q.id); continue; }
      // quem já luta contra o líder chama os outros
      if (fighting && !g.atWar(q.id, t) && g.rng.next() < 0.25 && g.canPropose(p.id, q.id, 'joint_war', { target: t }).ok) g.propose(p.id, q.id, 'joint_war', { target: t });
    }
    // em paz com o líder: entra na guerra quando outro membro já luta contra ele
    if (rel === 'peace' && !(g.truceUntil(p.id, t) > g.turn)) {
      const others = g.players.some(q => q.id !== p.id && q.alive && g.inCoalition(q.id) && g.activeWars(q.id).indexOf(t) >= 0);
      if (others && g.strength(p.id) > g.strength(t) * 0.35 && g.rng.next() < 0.06 * p.ai.aggr) g.declareWar(p.id, t);
    }
  };

  const prevDiplomacy = S.diplomacy;
  S.diplomacy = function (g, p, a) {
    prevDiplomacy.call(this, g, p, a);
    try { D.coalition(g, p); } catch (e) { console.error('IA (coalizão):', e); }
  };

  const prevEval = S.evaluateProposal;
  S.evaluateProposal = function (g, ai, from, type, data) {
    if (type === 'joint_war' && data && data.target === g.coalition && g.inCoalition(ai.id) && g.inCoalition(from.id)) {
      const st = g.relState(ai.id, data.target);
      if (st === 'peace' && !(g.truceUntil(ai.id, data.target) > g.turn)) {
        const sum = g.strength(ai.id) + g.strength(from.id);
        return sum > g.strength(data.target) * 0.8 && g.rng.next() < 0.6;
      }
    }
    return prevEval.call(this, g, ai, from, type, data);
  };

  // O líder vira o alvo preferencial dos membros que têm força para isso
  const prevTarget = S.chooseTarget;
  S.chooseTarget = function (g, p, a) {
    prevTarget.call(this, g, p, a);
    const t = g.coalition;
    if (t == null || !g.inCoalition(p.id)) return;
    if (g.atWar(p.id, t) || a.myS > g.strength(t) * 0.5) p.ai.target = t;
  };

  // ------------------------------------------------------------ Turno
  const prevTurn = AI.takeTurn;
  AI.takeTurn = async function (g, hooks) {
    const p = g.currentPlayer;
    if (p && !p.human && p.alive && !g.over) {
      try { D.trimArmy(g, p); D.preach(g, p); } catch (e) { console.error('IA (desenvolvimento):', e); }
    }
    return prevTurn.call(this, g, hooks);
  };

  PP.AIDevelopment = D;
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
