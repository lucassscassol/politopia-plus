/* Chamas de Vardren — estratégia da IA: análise da situação, objetivos de longo prazo mantidos por vários turnos
   (Dominação, Ciência, Economia, Diplomacia, Territorial e Defesa de emergência), campanhas contra cidades
   importantes, avaliação de propostas diplomáticas e iniciativas diplomáticas. Usado por ai.js. */
(function (PP) {
  'use strict';
  const UN = PP.UNITS;
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  PP.AI_STRATEGIES = {
    dominacao:  { name: 'Dominação',  aggr: 1.3,  desc: 'Expandir pela força: exército grande, guerras contra o vizinho mais fraco.' },
    ciencia:    { name: 'Ciência',    aggr: 0.75, desc: 'Bibliotecas, cidades científicas e o Grande Observatório.' },
    economia:   { name: 'Economia',   aggr: 0.8,  desc: 'Rotas comerciais, mercados e cidades comerciais ou portuárias.' },
    diplomacia: { name: 'Diplomacia', aggr: 0.65, desc: 'Pactos, alianças e boa reputação.' },
    territorial:{ name: 'Territorial', aggr: 1.0, desc: 'Fundar e crescer cidades, ocupar terras livres e fortificar fronteiras.' },
    defesa:     { name: 'Defesa',     aggr: 0.5,  desc: 'Emergência: proteger as cidades, buscar a paz e fortificar.' },
  };
  const MIN_HOLD = 6;

  const S = {};

  // ------------------------------------------------------------ Análise
  S.analyze = function (g, p) {
    const alive = g.players.filter(q => q.alive);
    const myS = g.strength(p.id);
    const cities = g.citiesOf(p.id);
    const met = alive.filter(q => q.id !== p.id && p.met[q.id]);
    const atWar = met.filter(q => g.atWar(p.id, q.id));
    let enemyS = 0, strongest = null;
    for (const q of atWar) { const s = g.strength(q.id); enemyS += s; if (!strongest || s > strongest.s) strongest = { id: q.id, s }; }
    let threat = 0, threatened = 0;
    for (const c of cities) {
      let t = 0;
      for (const e of g.units) {
        if (!g.atWar(p.id, e.owner) || cheb(e, c) > 3 || !p.visible[e.y * g.W + e.x]) continue;
        t += UN[e.type].atk * e.hp / g.maxHp(e) + 0.5;
      }
      threat += t;
      if (t > 3) threatened++;
    }
    const scores = alive.map(q => ({ id: q.id, s: g.score(q) })).sort((a, b) => b.s - a.s);
    const rank = scores.findIndex(x => x.id === p.id);
    const techs = Object.keys(p.techs).length;
    const techRank = alive.filter(q => Object.keys(q.techs).length > techs).length;
    const coastal = cities.filter(c => g.isCoastal(c)).length;
    let free = 0;
    for (const t of g.tiles) if (t.village && p.explored[t.y * g.W + t.x]) free++;
    let opinionSum = 0;
    for (const q of met) opinionSum += g.opinion(q.id, p.id);
    const vt = g.victoryThreat ? g.victoryThreat() : null;
    const recentLoss = (p.stats.citiesLost || 0) - ((p.ai.lastLost != null) ? p.ai.lastLost : (p.stats.citiesLost || 0));
    return {
      myS, enemyS, strongest, threat, threatened, cities: cities.length, capital: cities.find(c => c.capital) || null,
      rank, leader: scores[0], techs, techRank, coastal, freeVillages: free, met: met.length, wars: atWar.length,
      allies: g.alliesOf(p.id).length, avgOpinion: met.length ? opinionSum / met.length : 0,
      landShare: g.landShare ? g.landShare(p.id) : 0, victoryThreat: vt, recentLoss,
      elimination: cities.length > 0 && cities.length <= 2 && (threatened > 0 || (strongest && myS < strongest.s * 0.45)),
      income: g.income(p),
    };
  };

  // ------------------------------------------------------------ Escolha do objetivo
  S.strategyScores = function (g, p, a) {
    const t = p.ai;
    const en = id => (g.victoryEnabled ? g.victoryEnabled(id) : false);
    const s = {};
    const ratio = a.strongest ? a.myS / (a.strongest.s + 1) : 1.5;
    s.dominacao = 1.0 * t.aggr + (ratio > 1.3 ? 0.6 : 0) + (a.wars > 0 && ratio > 1 ? 0.3 : 0) + (a.freeVillages === 0 ? 0.3 : 0) - (a.threatened ? 0.4 : 0);
    s.ciencia = 0.9 * t.sci + (a.techRank === 0 ? 0.3 : 0) + (en('ciencia') ? 0.5 : 0) + (a.techs >= 16 && en('ciencia') ? 0.4 : 0) - a.wars * 0.1;
    s.economia = 0.9 * t.eco + (a.coastal >= 2 ? 0.2 : 0) + (g.resourceAccess(p).spices || g.resourceAccess(p).gems ? 0.2 : 0) + (en('economia') ? 0.5 : 0) + (en('maravilhas') ? 0.2 : 0);
    s.diplomacia = (a.met >= 2 ? 0.7 : 0.1) + a.avgOpinion / 60 + (p.reputation || 0) * 0.1 + (en('diplomacia') ? 0.5 : 0) + (1.2 - t.aggr) * 0.8 - a.wars * 0.15;
    s.territorial = 0.6 + Math.min(1, a.freeVillages * 0.2) + (en('territorio') ? 0.5 : 0) + (g.turn < 20 ? 0.3 : 0);
    // quem está perto de vencer por outro caminho vira alvo de quem pode reagir
    if (a.victoryThreat && a.victoryThreat.pid !== p.id && a.victoryThreat.pct > 0.7) s.dominacao += 0.5;
    if (g.opts.scenario === 'ultimo_reino' && !p.human) s.dominacao += 2;
    if (g.opts.scenario === 'corrida_cientifica') s.ciencia += 1;
    if (g.opts.scenario === 'guerra_total') s.dominacao += 0.6;
    s.defesa = a.elimination ? 5 : (a.threatened >= 2 || a.recentLoss > 0 ? 1.6 : 0) + (a.threat > a.myS * 0.8 ? 0.8 : 0);
    return s;
  };

  S.updateStrategy = function (g, p) {
    const a = S.analyze(g, p);
    const sc = S.strategyScores(g, p, a);
    const ai = p.ai;
    let cur = ai.strategy;
    let best = null;
    for (const k in sc) if (!best || sc[k] > sc[best]) best = k;
    const held = g.turn - (ai.since || 0);
    if (!cur || !sc.hasOwnProperty(cur)) cur = null;
    let next = cur;
    if (!cur) next = best;
    else if (best === 'defesa' && sc.defesa >= 1.6 && cur !== 'defesa') next = 'defesa';
    else if (cur === 'defesa') { if (sc.defesa < 1 && held >= 3) next = best === 'defesa' ? S.secondBest(sc) : best; }
    else if (best !== cur && held >= MIN_HOLD && sc[best] > sc[cur] * 1.25) next = best;
    else if (best !== cur && held >= 14 && sc[best] > sc[cur]) next = best;
    if (next !== ai.strategy) {
      ai.prevStrategy = ai.strategy || null;
      ai.strategy = next;
      ai.since = g.turn;
      g.log(PP.t('{p} mudou de objetivo: {o}.', { p: p.name, o: PP.AI_STRATEGIES[next].name }), p.id);
    }
    ai.lastLost = p.stats.citiesLost || 0;
    S.chooseTarget(g, p, a);
    S.chooseCampaign(g, p, a);
    return a;
  };

  S.secondBest = function (sc) {
    let b = null;
    for (const k in sc) if (k !== 'defesa' && (!b || sc[k] > sc[b])) b = k;
    return b;
  };

  S.aggrMult = function (p) {
    const st = PP.AI_STRATEGIES[p.ai.strategy];
    return st ? st.aggr : 1;
  };

  // Alvo preferencial de guerra: vizinho fraco, mal visto ou perto de vencer
  S.chooseTarget = function (g, p, a) {
    const ai = p.ai;
    let best = null, bs = -1e9;
    const mine = g.citiesOf(p.id);
    for (const q of g.players) {
      if (q.id === p.id || !q.alive || !p.met[q.id] || g.allied(p.id, q.id)) continue;
      if (g.opts.scenario === 'ultimo_reino' && !q.human && !p.human) continue;
      const theirs = g.citiesOf(q.id);
      let d = 99;
      for (const c of mine) for (const o of theirs) d = Math.min(d, cheb(c, o));
      const ratio = a.myS / (g.strength(q.id) + 1);
      let s = ratio * 2 - d * 0.15 - g.opinion(p.id, q.id) / 25;
      if (a.victoryThreat && a.victoryThreat.pid === q.id && a.victoryThreat.pct > 0.6) s += 2;
      if (g.atWar(p.id, q.id)) s += 0.8;
      if (q.id === ai.target) s += 0.5; // persistência
      if (s > bs) { bs = s; best = q.id; }
    }
    ai.target = best;
  };

  // Campanha: cidade inimiga importante (capital ou grande) quando há força para tomá-la
  S.chooseCampaign = function (g, p, a) {
    const ai = p.ai;
    if (ai.campaign) {
      const c = g.cityMap[ai.campaign.city];
      if (!c || c.owner === p.id || !g.atWar(p.id, c.owner) || g.turn - ai.campaign.since > 20 || ai.strategy === 'defesa') ai.campaign = null;
    }
    if (ai.campaign || ai.strategy === 'defesa') return;
    const mine = g.citiesOf(p.id);
    if (!mine.length) return;
    let best = null, bs = 0;
    for (const c of g.cities) {
      if (c.owner === p.id || !g.atWar(p.id, c.owner) || !p.explored[c.y * g.W + c.x]) continue;
      let d = 99;
      for (const m of mine) d = Math.min(d, cheb(m, c));
      if (d > 9) continue;
      const theirS = g.strength(c.owner);
      if (a.myS < theirS * 0.9) continue;
      const v = (c.level * 1.5 + (c.capital ? 6 : 0) + (c.metropolis ? 4 : 0) + (c.spec ? 1 : 0)) / (d + 2);
      if (v > bs) { bs = v; best = c; }
    }
    if (best && bs > 1) ai.campaign = { city: best.id, since: g.turn };
  };

  // ------------------------------------------------------------ Propostas recebidas
  S.value = function (g, ai, items, receiving) {
    let v = (items.stars || 0) * 1 + (items.sci || 0) * (ai.ai.strategy === 'ciencia' ? 1.4 : 1.1);
    const acc = g.resourceAccess(ai);
    for (const r of ['iron', 'horses']) {
      if (!items[r]) continue;
      const lacks = !(acc[r] > 0);
      const wants = r === 'iron' ? (g.has(ai, 'forja') || g.has(ai, 'polvora') || g.has(ai, 'eng_naval')) : g.has(ai, 'cavalaria');
      v += receiving ? (lacks && wants ? 10 : lacks ? 4 : 1) : (acc[r] > 1 ? 3 : 6);
    }
    return v;
  };

  S.evaluateProposal = function (g, ai, from, type, data) {
    const op = g.opinion(ai.id, from.id);
    const strat = ai.ai.strategy;
    const myS = g.strength(ai.id), theirS = g.strength(from.id);
    const r = g.rng.next();
    if (g.opts.scenario === 'ultimo_reino' && from.human && !ai.human && type !== 'trade') return false;
    switch (type) {
      case 'peace': {
        const rel = ai.rel[from.id];
        if (rel && g.turn - rel.since < 3) return false;
        let chance = 0.3 + op * 0.006;
        if (myS < theirS * 0.8) chance += 0.35;
        if (myS > theirS * 1.5) chance -= 0.3;
        chance -= (ai.ai.aggr * S.aggrMult(ai) - 1) * 0.5;
        chance += (from.reputation || 0) * 0.08;
        if (strat === 'defesa') chance += 0.35;
        if (strat === 'diplomacia' || strat === 'economia') chance += 0.15;
        if (strat === 'dominacao' && ai.ai.target === from.id) chance -= 0.25;
        const wars = g.players.filter(q => q.alive && q.id !== ai.id && ai.met[q.id] && g.atWar(ai.id, q.id)).length;
        if (wars > 1) chance += 0.15;
        return r < clamp(chance, 0.03, 0.92);
      }
      case 'nap': {
        if (ai.ai.target === from.id && strat === 'dominacao') return false;
        if ((from.reputation || 0) <= -4) return false;
        let chance = 0.35 + op * 0.01 + (strat === 'defesa' || strat === 'diplomacia' ? 0.3 : 0) + (strat === 'ciencia' || strat === 'economia' ? 0.15 : 0);
        if (myS < theirS) chance += 0.15;
        return r < clamp(chance, 0.02, 0.95);
      }
      case 'alliance': {
        if ((from.reputation || 0) <= -3) return false;
        const need = strat === 'diplomacia' ? 12 : 25;
        if (op < need) return false;
        const shared = g.players.some(q => q.alive && q.id !== ai.id && q.id !== from.id && g.atWar(ai.id, q.id) && g.atWar(from.id, q.id));
        let chance = 0.45 + (shared ? 0.3 : 0) + (theirS > myS * 0.5 ? 0.1 : -0.2) + (strat === 'diplomacia' ? 0.2 : 0);
        return r < clamp(chance, 0.05, 0.95);
      }
      case 'trade': {
        if (!data) return false;
        const gain = S.value(g, ai, data.give, true);   // o que o proponente dá = o que a IA recebe
        const loss = S.value(g, ai, data.get, false);
        const factor = op >= 20 ? 0.9 : op <= -20 ? 1.4 : 1.1;
        return gain >= loss * factor && gain > 0;
      }
      case 'tribute_demand': {
        const amt = (data && data.amount) || 0;
        if (amt > ai.stars) return false;
        if (theirS > myS * 1.4 && amt <= Math.max(5, ai.stars * 0.45)) return r < 0.8;
        if (strat === 'defesa' && theirS > myS && amt <= ai.stars * 0.5) return r < 0.7;
        return false;
      }
      case 'joint_war': {
        const t = data && g.players[data.target];
        if (!t || !t.alive) return false;
        if (g.relState(ai.id, t.id) === 'nap' && strat !== 'dominacao') return false;
        if (op < 12 || g.opinion(ai.id, t.id) > 10) return false;
        const combined = myS + theirS, ts = g.strength(t.id);
        return combined > ts * 1.2 && r < (strat === 'dominacao' ? 0.8 : 0.5);
      }
      case 'call_to_arms': {
        const t = data && g.players[data.target];
        if (!t || !t.alive) return false;
        if (g.relState(ai.id, t.id) === 'nap' && op < 30) return false;
        let chance = 0.55 + op * 0.006 + (strat === 'dominacao' ? 0.2 : 0) + (strat === 'defesa' ? -0.3 : 0);
        if (g.strength(t.id) > myS * 2) chance -= 0.3;
        return r < clamp(chance, 0.05, 0.95);
      }
    }
    return false;
  };

  // ------------------------------------------------------------ Iniciativas diplomáticas
  S.diplomacy = function (g, p, a) {
    const ai = p.ai, strat = ai.strategy;
    const aggr = ai.aggr * S.aggrMult(p) * ((PP.DIFFICULTY[g.opts.difficulty] || PP.DIFFICULTY.normal).aggr);
    const myS = g.strength(p.id);
    const hostileLock = g.opts.scenario === 'ultimo_reino';
    for (const q of g.players) {
      if (q.id === p.id || !q.alive || !p.met[q.id]) continue;
      const rel = p.rel[q.id];
      const theirS = g.strength(q.id);
      const op = g.opinion(p.id, q.id);
      const since = g.turn - rel.since;
      if (hostileLock && !q.human) continue;
      if (rel.state === 'war') {
        const last = p.lastPeaceAsk[q.id] || -99;
        if (since < 4 || g.turn - last < 6) continue;
        let chance = 0.1 + Math.max(0, op) * 0.004;
        if (myS < theirS * 0.8) chance += 0.25;
        if (strat === 'defesa') chance += 0.35;
        if (strat === 'diplomacia' || strat === 'economia' || strat === 'ciencia') chance += 0.1;
        if (strat === 'dominacao' && ai.target === q.id) chance -= 0.1;
        if (aggr > 1.15) chance -= 0.08;
        if (g.rng.next() < chance) g.proposePeace(p.id, q.id);
        continue;
      }
      // em paz, pacto ou aliança
      const wars = g.players.some(o => o.alive && o.id !== p.id && p.met[o.id] && g.atWar(p.id, o.id));
      let warChance = 0;
      if (rel.state === 'peace') {
        if (since >= 10 && myS > theirS * 1.6) warChance = 0.12 * aggr;
        if (!wars && since >= 8 && myS > theirS * 1.05) warChance = Math.max(warChance, 0.06 * aggr + (since - 8) * 0.01);
        if (ai.target === q.id && strat === 'dominacao' && since >= 6 && myS > theirS * 1.2) warChance += 0.12;
        if (a.victoryThreat && a.victoryThreat.pid === q.id && a.victoryThreat.pct > 0.75 && myS > theirS) warChance += 0.2;
        if (op > 25) warChance *= 0.3;
      } else if (rel.state === 'nap') {
        if (strat === 'dominacao' && ai.target === q.id && myS > theirS * 1.8 && op < -10) warChance = 0.06;
      } else if (rel.state === 'alliance') {
        if (strat === 'dominacao' && op < -40 && myS > theirS * 2) warChance = 0.03;
      }
      if (strat === 'defesa' || strat === 'diplomacia') warChance *= 0.2;
      if (rel.truce > g.turn) warChance *= 0.05; // trégua depois de uma paz (js/vassals.js)
      if (warChance > 0 && g.rng.next() < warChance) { g.declareWar(p.id, q.id); continue; }
      // propostas pacíficas
      if (rel.state === 'peace' && since >= 3 && op >= -2 && !(strat === 'dominacao' && ai.target === q.id)) {
        const c = 0.08 + (strat === 'diplomacia' || strat === 'defesa' ? 0.15 : 0) + (strat === 'ciencia' || strat === 'economia' ? 0.06 : 0);
        if (g.rng.next() < c) { g.propose(p.id, q.id, 'nap', { turns: PP.NAP_TURNS }); continue; }
      }
      if ((rel.state === 'peace' || rel.state === 'nap') && op >= (strat === 'diplomacia' ? 15 : 30)) {
        const shared = g.players.some(o => o.alive && o.id !== p.id && o.id !== q.id && g.atWar(p.id, o.id) && g.atWar(q.id, o.id));
        const c = 0.05 + (shared ? 0.12 : 0) + (strat === 'diplomacia' ? 0.12 : 0);
        if (g.canPropose(p.id, q.id, 'alliance').ok && g.rng.next() < c) { g.propose(p.id, q.id, 'alliance'); continue; }
      }
      // comércio de recursos estratégicos
      const acc = g.resourceAccess(p);
      for (const r of ['iron', 'horses']) {
        if (acc[r] > 0) continue;
        const wants = r === 'iron' ? g.has(p, 'forja') || g.has(p, 'polvora') : g.has(p, 'cavalaria');
        if (!wants || !g.ownsStrategic(q, r) || p.stars < 14) continue;
        if (g.rng.next() < 0.2) {
          const offer = Math.min(p.stars - 4, 8 + g.rng.int(5));
          const deal = { give: { stars: offer }, get: { [r]: 1 } };
          if (g.canPropose(p.id, q.id, 'trade', deal).ok) { g.propose(p.id, q.id, 'trade', deal); break; }
        }
      }
      // compra ciência com estrelas sobrando quando a pesquisa está travada
      if (p.stars > 50 && q.science >= 14 && g.rng.next() < 0.25) {
        const cheapest = PP.TECHS.filter(tc => g.techState(p, tc.id) === 'available').reduce((m, tc) => Math.min(m, g.techCost(p, tc.id)), 1e9);
        if (cheapest < 1e9 && p.science < cheapest) {
          const sci = Math.min(q.science, Math.max(6, cheapest - p.science));
          const deal = { give: { stars: Math.min(p.stars, Math.ceil(sci * 1.6)) }, get: { sci } };
          if (g.canPropose(p.id, q.id, 'trade', deal).ok) g.propose(p.id, q.id, 'trade', deal);
        }
      }
      // tributo de quem é muito mais fraco
      if (rel.state === 'peace' && myS > theirS * 2 && op < 10 && (strat === 'dominacao' || aggr > 1.1) && q.stars >= 10 && g.rng.next() < 0.06) {
        const amount = Math.max(5, Math.floor(q.stars * 0.25));
        const res = g.propose(p.id, q.id, 'tribute_demand', { amount });
        if (res === 'rejected') ai.grudge = Object.assign(ai.grudge || {}, { [q.id]: g.turn });
      }
    }
    // guerra conjunta contra um inimigo comum
    if (a.wars > 0 && strat !== 'defesa') {
      const foe = g.players.find(o => o.alive && o.id !== p.id && p.met[o.id] && g.atWar(p.id, o.id));
      if (foe) {
        for (const q of g.players) {
          if (q.id === p.id || q.id === foe.id || !q.alive || !p.met[q.id] || !q.met[foe.id]) continue;
          if (g.atWar(p.id, q.id) || g.atWar(q.id, foe.id) || g.allied(q.id, foe.id)) continue;
          if (g.opinion(p.id, q.id) < 10 || g.rng.next() > 0.08) continue;
          g.propose(p.id, q.id, 'joint_war', { target: foe.id });
          break;
        }
      }
    }
  };

  // ------------------------------------------------------------ Especialização de cidades
  S.chooseSpec = function (g, p, c) {
    const strat = p.ai.strategy;
    const w = { militar: 1, ciencia: 1, comercio: 1, agricola: 1, porto: 0 };
    if (g.isCoastal(c)) {
      let sea = 0;
      for (const t of g.tiles) if (t.cityId === c.id && (t.res === 'fish' || t.res === 'whale' || t.imp === 'port')) sea++;
      w.porto = 0.6 + sea * 0.35;
    }
    let crops = 0, enemyNear = 0;
    for (const t of g.tiles) if (t.cityId === c.id && (t.res === 'crop' || t.imp === 'farm' || t.res === 'fruit')) crops++;
    for (const o of g.cities) if (o.owner !== p.id && g.atWar(p.id, o.owner) && cheb(o, c) <= 5) enemyNear++;
    w.agricola += crops * 0.3;
    w.militar += enemyNear * 0.6;
    if (c.capital) { w.ciencia += 0.8; w.comercio += 0.6; w.militar *= 0.3; }
    const n = g.citiesOf(p.id).length;
    if (n <= 2) { w.ciencia += 0.8; w.comercio += 0.5; w.militar *= 0.5; }
    const boost = { dominacao: 'militar', ciencia: 'ciencia', economia: 'comercio', territorial: 'agricola', diplomacia: 'comercio', defesa: 'militar' }[strat];
    if (boost) w[boost] += 1.2;
    if (strat === 'economia') w.porto *= 1.5;
    if (strat === 'ciencia' && !g.citiesOf(p.id).some(o => o.spec === 'ciencia')) w.ciencia += 1;
    const opts = Object.keys(w).filter(k => w[k] > 0 && g.specCheck(p, c, k).ok);
    if (!opts.length) return null;
    return opts.sort((a, b) => w[b] - w[a])[0];
  };

  // ------------------------------------------------------------ Ruínas
  S.chooseRuin = function (g, p, u, t, options) {
    const ok = id => options.some(o => o.id === id && o.ok);
    const strat = p.ai.strategy;
    const met = g.players.filter(q => q.alive && q.id !== p.id && q.met[p.id]).length;
    if (ok('restore') && (strat === 'territorial' || strat === 'defesa' || strat === 'ciencia') && p.stars >= 10 && t.owner === p.id) return 'restore';
    if (ok('honor') && (strat === 'diplomacia' || met >= 2)) return 'honor';
    if (ok('loot') && (strat === 'dominacao' || strat === 'economia' || met === 0)) return 'loot';
    return 'explore';
  };

  PP.AIStrategy = S;
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
