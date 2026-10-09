/* Chamas de Vardren — IA do governo, dos impostos, dos empréstimos, dos termos de paz e dos vassalos. Estende js/ai.js
   (AI.takeTurn) e js/ai-strategy.js (diplomacy e evaluateProposal) envolvendo as funções que já existiam. */
(function (PP) {
  'use strict';
  const AI = PP.AI, S = PP.AIStrategy;
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const C = {};

  // ------------------------------------------------------------ Forma de governo
  C.govScores = function (g, p) {
    const strat = p.ai.strategy || 'territorial';
    const cities = g.citiesOf(p.id), n = cities.length;
    const conquered = cities.filter(c => c.founder !== p.id).length;
    const unrest = cities.filter(c => c.unrest || c.occupied > 0).length;
    const temples = cities.filter(c => c.buildings.temple).length;
    let routes = 0;
    for (const r of g.routes || []) if (r.active && r.owner === p.id) routes++;
    const wars = g.activeWars(p.id).length;
    const vassals = g.vassalsOf(p.id).length;
    // pressão administrativa sem contar a capacidade que o governo atual dá
    const cap = g.adminCapacity(p);
    const curCap = (g.govEffects(p).cap || 0);
    const pressure = Math.max(0, n - (cap.total - curCap));
    const sciW = p.ai.sci * (strat === 'ciencia' ? 1.6 : 1);
    const sc = { tribal: 0 };
    sc.monarquia = 0.6 + Math.min(2, pressure) * 0.7 + conquered * 0.15 + (n >= 3 ? 0.4 : 0) - 0.4 * sciW;
    sc.teocracia = 0.2 + unrest * 0.5 + conquered * 0.2 + temples * 0.2 - 0.9 * sciW + (strat === 'diplomacia' ? 0.2 : 0);
    sc.feudalismo = (strat === 'defesa' ? 1.2 : strat === 'territorial' ? 0.7 : strat === 'dominacao' ? 0.5 : 0.1) + Math.min(3, wars) * 0.3 + vassals * 0.5 - 0.5;
    sc.republica = (strat === 'ciencia' ? 1.1 : strat === 'economia' ? 0.9 : strat === 'diplomacia' ? 0.8 : 0.1) + Math.min(5, routes) * 0.2 - wars * 1.1;
    sc.imperio = 2.5 + vassals * 0.3 + Math.min(2, pressure) * 0.6;
    for (const id of Object.keys(sc)) if (id !== p.gov && !g.govCheck(p, id).ok) delete sc[id];
    return sc;
  };

  C.chooseGov = function (g, p) {
    if (g.inAnarchy(p)) return;
    const sc = C.govScores(g, p);
    const cur = sc[p.gov] != null ? sc[p.gov] : 0;
    let best = p.gov, bs = cur;
    for (const id in sc) if (sc[id] > bs) { bs = sc[id]; best = id; }
    if (best === p.gov || bs < cur + 0.8) return;
    // anarquia no meio de um cerco é desastre: só o Império é proclamado mesmo sob ameaça
    const threatened = g.citiesOf(p.id).some(c => AI.cityThreat(g, p, c) > 2);
    if (threatened && best !== 'imperio') return;
    if (g.rng.next() < 0.5) g.adoptGov(p, best);
  };

  // ------------------------------------------------------------ Impostos (revistos a cada 3 turnos)
  C.chooseTax = function (g, p) {
    if (g.turn - (p.ai.taxT == null ? -9 : p.ai.taxT) < 3) return;
    p.ai.taxT = g.turn;
    const cities = g.citiesOf(p.id);
    const lowLoyal = cities.filter(c => c.founder !== p.id && (c.loyalty < 45 || c.unrest || c.occupied > 0)).length;
    const curCap = PP.TAXES[p.tax].cap || 0;
    const spare = g.realmOn() ? (g.adminCapacity(p).total - curCap) - cities.length : 3;
    const strat = p.ai.strategy;
    const wars = g.activeWars(p.id).length;
    const allTechs = g.allTechs(p);
    // o imposto é o orçamento: mais estrelas custam ciência; quem já pesquisou tudo cobra caro
    let t = 'normais';
    if (lowLoyal >= 2 || (lowLoyal >= 1 && cities.length <= 4)) t = 'baixos';
    else if (allTechs && strat !== 'ciencia') t = 'altos';
    else if (strat === 'ciencia') t = p.stars >= 20 ? 'baixos' : 'normais';
    else if (strat === 'territorial') t = p.stars >= 25 ? 'baixos' : 'normais';
    else if (strat === 'dominacao' && wars) t = spare >= 1 && p.stars < 15 ? 'extorsivos' : 'altos';
    else if (strat === 'economia' || strat === 'dominacao' || (strat === 'defesa' && wars)) t = 'altos';
    if (t !== p.tax) g.setTax(p, t);
  };

  // ------------------------------------------------------------ Empréstimos: na emergência; quita quando sobra
  C.manageLoan = function (g, p) {
    if (p.loan) { if (p.stars > p.loan.left + 25) g.repayLoan(p); return; }
    if (!g.has(p, PP.LOAN_RULES.tech)) return;
    // o turno começa com a renda já no caixa: "pouco dinheiro" é menos que uma vez e meia a renda
    const inc = g.income(p).stars;
    if (p.stars >= Math.max(10, inc * 1.5)) return;
    let threat = 0;
    for (const c of g.citiesOf(p.id)) threat += AI.cityThreat(g, p, c);
    if (threat < 4) return;
    const chk = g.loanCheck(p, 'small');
    if (!chk.ok) return;
    // a parcela do pequeno fica perto de 60% da renda: aceitável numa emergência
    if (chk.terms.per <= Math.max(2, inc * 0.65)) g.takeLoan(p, 'small');
  };

  C.govern = function (g, p) {
    if (g.over || !p || p.human || !p.alive) return;
    C.chooseGov(g, p);
    C.chooseTax(g, p);
    C.manageLoan(g, p);
  };

  // ------------------------------------------------------------ Termos de paz e vassalos
  // Melhor termo que o perdedor provavelmente aceita
  C.bestTerm = function (g, p, q) {
    const mine = g.citiesOf(p.id);
    let best = null, bv = 0;
    for (const o of g.peaceTermOptions(p.id, q.id)) {
      if (!g.termsOutlook(p.id, q.id, o).ok) continue;
      let v = 0;
      if (o.term === 'reparations') v = o.amount * 2.2;
      else if (o.term === 'city') {
        const c = g.cityMap[o.city];
        let d = 99;
        for (const m of mine) d = Math.min(d, cheb(m, c));
        v = 6 + c.level * 2.5 - d * 0.4;
      } else if (o.term === 'vassal') v = 12 + g.citiesOf(q.id).length * 2.5;
      if (v > bv) { bv = v; best = o; }
    }
    return best;
  };

  C.diplomacy = function (g, p) {
    if (p.human || g.over || g.opts.scenario === 'ultimo_reino') return;
    const strat = p.ai.strategy;
    // vassalo: independência quando ficar forte ou muito ressentido
    const oid = g.overlordOf(p.id);
    if (oid != null) {
      const myS = g.strength(p.id), oS = g.strength(oid), op = g.opinion(p.id, oid);
      if (g.vassalTurns(p.id) >= 5 && (myS > oS * 0.9 || (op < -20 && myS > oS * 0.6)) && g.rng.next() < 0.2) g.declareIndependence(p.id);
      return;
    }
    // suserano: anexar quando a relação permitir
    for (const v of g.vassalsOf(p.id)) {
      if (g.canPropose(p.id, v, 'annex').ok && g.rng.next() < 0.35) g.propose(p.id, v, 'annex');
    }
    // vencendo uma guerra: exigir termos
    for (const q of g.players) {
      if (q.id === p.id || !q.alive || !p.met[q.id] || !g.atWar(p.id, q.id) || g.isVassal(q.id)) continue;
      const rel = p.rel[q.id];
      if (rel.since > 0 && g.turn - rel.since < 4) continue;
      if (g.warScore(p.id, q.id) < 8) continue;
      const asked = (p.lastAsk[q.id] || {}).peace_terms;
      if (asked != null && g.turn - asked < 3) continue;
      const term = C.bestTerm(g, p, q);
      if (!term) continue;
      // ganhando com folga, o conquistador segue a guerra (a não ser para fazer um vassalo)
      const peaceful = strat === 'diplomacia' || strat === 'economia' || strat === 'ciencia';
      if (term.term !== 'vassal' && !peaceful && g.strength(q.id) < g.strength(p.id) * 0.55) continue;
      let chance = 0.3;
      if (strat === 'dominacao' && p.ai.target === q.id && term.term !== 'vassal') chance = 0.08;
      if (peaceful) chance += 0.15;
      if (g.rng.next() < chance && g.canPropose(p.id, q.id, 'peace_terms', term).ok) g.propose(p.id, q.id, 'peace_terms', term);
    }
    // proteção a tribos fracas e amigas
    if (strat === 'diplomacia' || strat === 'dominacao' || strat === 'territorial') {
      const myS = g.strength(p.id);
      for (const q of g.players) {
        if (q.id === p.id || !q.alive || !p.met[q.id] || g.atWar(p.id, q.id) || g.isVassal(q.id) || g.vassalsOf(q.id).length) continue;
        if (g.strength(q.id) > myS * 0.35 || g.opinion(q.id, p.id) < 20) continue;
        if (g.rng.next() < 0.05 && g.canPropose(p.id, q.id, 'vassal_offer').ok) { g.propose(p.id, q.id, 'vassal_offer'); break; }
      }
    }
  };

  C.acceptProtection = function (g, ai, from) {
    const myS = g.strength(ai.id);
    const ratio = myS / (g.strength(from.id) + 1);
    const pressed = ai.ai.strategy === 'defesa' || g.activeWars(ai.id).some(q => q !== from.id && g.strength(q) > myS * 1.2);
    return ratio < 0.35 && g.opinion(ai.id, from.id) >= 20 && pressed && g.rng.next() < 0.6;
  };

  C.acceptAnnex = function (g, ai, from) {
    const ratio = g.strength(ai.id) / (g.strength(from.id) + 1);
    return g.opinion(ai.id, from.id) >= PP.VASSAL.annexOpinion && ratio < 0.6 && g.rng.next() < 0.6;
  };

  // ------------------------------------------------------------ Ligações com a IA existente
  const prevTurn = AI.takeTurn;
  AI.takeTurn = async function (g, hooks) {
    const p = g.currentPlayer;
    try { C.govern(g, p); } catch (e) { console.error('IA (governo):', e); }
    return prevTurn.call(this, g, hooks);
  };

  const prevDiplomacy = S.diplomacy;
  S.diplomacy = function (g, p, a) {
    prevDiplomacy.call(this, g, p, a);
    try { C.diplomacy(g, p, a); } catch (e) { console.error('IA (vassalos):', e); }
  };

  const prevEval = S.evaluateProposal;
  S.evaluateProposal = function (g, ai, from, type, data) {
    if (type === 'peace_terms' || type === 'vassal_offer' || type === 'annex') {
      if (g.opts.scenario === 'ultimo_reino' && from.human && !ai.human) return false;
      if (type === 'peace_terms') return g.termsOutlook(from.id, ai.id, data).ok && g.rng.next() < (data.term === 'city' ? 0.75 : 0.85);
      if (type === 'vassal_offer') return C.acceptProtection(g, ai, from);
      return C.acceptAnnex(g, ai, from);
    }
    // o suserano quase sempre atende o chamado do vassalo atacado
    if (type === 'call_to_arms' && g.overlordOf(from.id) === ai.id) return g.rng.next() < 0.85;
    // romper uma trégua custa o mesmo que romper um pacto: a IA pesa os convites de guerra do mesmo jeito
    if ((type === 'joint_war' || type === 'call_to_arms') && data && g.truceUntil(ai.id, data.target) > g.turn) {
      if (type === 'joint_war' && ai.ai.strategy !== 'dominacao') return false;
      if (type === 'call_to_arms' && g.opinion(ai.id, from.id) < 30) return false;
    }
    return prevEval.call(this, g, ai, from, type, data);
  };

  PP.AICrown = C;
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
