/* Chamas de Vardren — IA da organização dos reinos, da Era V e dos personagens (estende js/ai.js por AI.ext).
   Valoriza tecnologias e construções conforme a desordem e as cidades longe da corte, recruta General,
   Governador e Embaixador quando fazem sentido e decide para onde cada personagem vai. */
(function (PP) {
  'use strict';
  const UN = PP.UNITS, AI = PP.AI;
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  const remoteCities = ctx => (ctx.g.realmOn() ? ctx.cities.filter(c => ctx.g.adminInfo(c).remote) : []);
  const military = u => { const d = UN[u.type]; return d.atk > 0 && !d.character && !d.spy && !d.naval; };

  // ------------------------------------------------------------ Tecnologias
  const STRAT = {
    dominacao: { arte_guerra: 1.4, siderurgia: 1.3 },
    ciencia: { imprensa: 1.5, codigo_leis: 1.1 },
    economia: { burocracia: 1.2, imprensa: 1.1 },
    diplomacia: { diplomacia_real: 1.7, codigo_leis: 1.2 },
    territorial: { burocracia: 1.5, codigo_leis: 1.4 },
    defesa: { siderurgia: 1.2, codigo_leis: 1.1 },
  };

  AI.ext.techValue = function (ctx, t) {
    const g = ctx.g, p = ctx.p;
    const cap = g.adminCapacity(p);
    const remote = remoteCities(ctx).length;
    const n = ctx.cities.length, a = ctx.aggr, sci = p.ai.sci;
    let v;
    switch (t.id) {
      case 'codigo_leis': v = 2.5 + cap.excess * 2 + remote * 0.8 + n * 0.15; break;
      case 'burocracia': v = 3 + cap.excess * 1.6 + remote * 1.4 + n * 0.2; break;
      case 'diplomacia_real': {
        const peace = g.players.filter(q => q.alive && q.id !== p.id && p.met[q.id] && !g.atWar(p.id, q.id)).length;
        v = 2.5 + peace * 0.4 + (ctx.strategy === 'diplomacia' ? 2.5 : 0);
        break;
      }
      case 'arte_guerra': v = 3 + a * 3 + (g.hasStrategic(p, 'horses') ? 1 : 0); break;
      case 'siderurgia': v = 2.5 + a * 2.5 * (g.hasStrategic(p, 'iron') ? 1.2 : 0.5); break;
      case 'imprensa': v = 2.5 + sci * 2 + cap.excess * 0.6; break;
      default: return null;
    }
    const m = STRAT[ctx.strategy];
    return v * ((m && m[t.id]) || 1);
  };

  // Em desordem, as tecnologias que dão capacidade administrativa (e o caminho até elas) ficam mais urgentes
  AI.ext.techMult = function (ctx, t) {
    const g = ctx.g;
    if (!g.realmOn()) return 1;
    const ex = g.adminExcess(ctx.p);
    if (ex <= 0) return 1;
    if (PP.REALM.techs[t.id] || t.id === 'educacao' || t.id === 'economia') return Math.min(3, 1 + ex * 0.25);
    return 1;
  };

  // ------------------------------------------------------------ Construções
  AI.ext.buildingValue = function (ctx, c, id) {
    const g = ctx.g, p = ctx.p;
    const cap = g.adminCapacity(p);
    const on = g.realmOn();
    const info = on ? g.adminInfo(c) : { remote: false };
    switch (id) {
      case 'tribunal':
        return (cap.excess > 0 ? 2.6 + cap.excess * 0.7 : 0.15) + (info.remote ? 1.2 : 0) + (c.unrest || c.occupied ? 1.2 : 0);
      case 'chancery':
        return c.capital ? 1.5 + cap.excess * 1.2 + remoteCities(ctx).length * 0.4 : 0;
      case 'regional_seat': {
        if (!on) return cap.excess > 0 ? 1.2 + cap.excess * 0.5 : 0.2;
        let cover = 0;
        for (const o of ctx.cities) {
          if (o !== c && g.adminInfo(o).remote && cheb(o, c) - (o.connected ? PP.REALM.roadReach : 0) <= PP.REALM.seatRadius) cover++;
        }
        return (info.remote ? 1.5 : 0) + cover * 1.4 + cap.excess * 0.4;
      }
      case 'embassy': return ctx.strategy === 'diplomacia' ? 2.2 : 0.9;
      case 'war_academy': return ctx.cities.some(o => o.buildings.war_academy) ? (c.spec === 'militar' ? 0.5 : 0.1) : 1.8 * ctx.aggr;
      case 'foundry': return 2.4;
      case 'press': return 2 * p.ai.sci + cap.excess * 0.5;
    }
    return 0;
  };

  // ------------------------------------------------------------ Recrutamento de personagens
  AI.ext.spendOptions = function (ctx, out) {
    const g = ctx.g, p = ctx.p;
    const recruit = (type, score, pick) => {
      if (!g.has(p, UN[type].tech) || g.characterOf(p.id, type)) return;
      const cands = ctx.cities.filter(c => { const chk = g.trainCheck(p, c, type); return chk.ok || chk.reason === PP.t('Faltam estrelas'); });
      if (!cands.length) return;
      const c = pick(cands);
      if (c) out.push({ score, cost: g.unitCostFor(p, c, type), exec: () => !!g.train(p, c, type) });
    };
    const wars = ctx.analysis && ctx.analysis.wars;
    if ((wars || ctx.anyThreat) && ctx.army >= 5) {
      recruit('general', 0.85 * ctx.aggr, cs => cs.sort((a, b) => (ctx.threats[b.id] || 0) - (ctx.threats[a.id] || 0))[0]);
    }
    const remote = remoteCities(ctx);
    const cap = g.adminCapacity(p);
    if (remote.length || cap.excess > 0) {
      const target = AI.governorTarget(ctx);
      recruit('governor', 0.7 + remote.length * 0.15 + cap.excess * 0.1, cs => (target ? cs.sort((a, b) => cheb(a, target) - cheb(b, target))[0] : cs[0]));
    }
    const hosts = g.players.filter(q => q.alive && q.id !== p.id && p.met[q.id] && !g.atWar(p.id, q.id));
    if (hosts.length) recruit('envoy', ctx.strategy === 'diplomacia' ? 0.8 : 0.35, cs => cs[0]);
  };

  // Cidade que mais ganha com o Governador: a longe da corte com mais vizinhas também longe; senão a maior
  // cidade fora da capital (+2★ e +10 de lealdade)
  AI.governorTarget = function (ctx) {
    const g = ctx.g;
    const remote = remoteCities(ctx);
    if (remote.length) {
      let best = null, bs = -1;
      for (const c of remote) {
        const s = remote.filter(o => cheb(o, c) - (o.connected ? PP.REALM.roadReach : 0) <= PP.REALM.governorRadius).length + c.level * 0.1;
        if (s > bs) { bs = s; best = c; }
      }
      return best;
    }
    const list = ctx.cities.filter(c => !c.capital).sort((a, b) => (b.unrest || b.occupied ? 10 : 0) + b.level - ((a.unrest || a.occupied ? 10 : 0) + a.level));
    return list[0] || g.cityMap[ctx.p.capital] || null;
  };

  // Tribo a visitar com o Embaixador: em paz conosco, preferindo quem tem opinião mais baixa (há o que ganhar)
  AI.envoyHost = function (ctx) {
    const g = ctx.g, p = ctx.p;
    const hosts = g.players.filter(q => q.alive && q.id !== p.id && p.met[q.id] && !g.atWar(p.id, q.id));
    if (!hosts.length) return null;
    const opn = q => (g.opinion ? g.opinion(q.id, p.id) : 0);
    return hosts.sort((a, b) => opn(a) - opn(b))[0];
  };

  // Casa do território do anfitrião mais perto da capital dele (as cidades em paz não podem ser ocupadas)
  function hostTile(ctx, u, q) {
    const g = ctx.g, p = ctx.p;
    const cap = g.cityMap[q.capital] || g.citiesOf(q.id)[0];
    if (!cap) return null;
    let best = null, bd = 1e9;
    for (const t of g.tiles) {
      if (t.owner !== q.id || t.city || g.isWater(t) || !p.explored[t.y * ctx.W + t.x]) continue;
      if (t.terrain === 'mountain' && !g.has(p, 'escalada')) continue;
      const occ = g.uGrid[t.y * ctx.W + t.x];
      if (occ && occ !== u) continue;
      const d = cheb(t, cap) + cheb(t, u) * 0.15;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  // ------------------------------------------------------------ Comportamento dos personagens
  AI.ext.actCharacter = async function (ctx, u, pause) {
    const g = ctx.g, p = ctx.p, W = ctx.W;
    const st = g.stat(u);
    const hurt = u.hp / st.maxHp < 0.5;
    const retreat = async () => {
      const home = ctx.nearestSafeCity(u);
      if (home && u.mp > 0 && cheb(home, u) > 0 && ctx.stepToward(u, { idx: home.y * W + home.x, kind: 'retreat' })) { await pause('move', u); return true; }
      if (g.canRecover(u)) { g.recover(u); return true; }
      return false;
    };
    const rest = () => { if (u.dead) return; if (g.canRecover(u) && u.hp < st.maxHp) g.recover(u); else if (g.canFortify(u)) g.fortify(u); };

    if (u.type === 'general') {
      if (hurt) { await retreat(); return; }
      // posição com mais tropas vizinhas e pouco perigo, sem ficar colado no inimigo
      const score = k => {
        const t = g.tiles[k];
        if (g.isWater(t)) return -99;
        let friends = 0, foes = 0;
        for (const n of g.neighbors(t)) {
          const o = g.uGrid[n.y * W + n.x];
          if (!o || o === u) continue;
          if (o.owner === p.id && military(o)) friends++;
          else if (g.atWar(p.id, o.owner)) foes++;
        }
        return friends * 2 - foes * 3 - ctx.danger[k] * 0.35;
      };
      const reach = g.reachable(u);
      const here = u.y * W + u.x;
      let best = here, bs = score(here);
      for (const [k] of reach) { const s = score(k); if (s > bs + 0.5) { bs = s; best = k; } }
      if (best !== here && bs >= 2) {
        g.moveUnit(u, best % W, (best / W) | 0, reach); await pause('move', u);
      } else if (bs < 2 && u.mp > 0) {
        // longe do exército: segue a tropa mais próxima do inimigo (ou a cidade mais ameaçada)
        let goal = null, gd = 1e9;
        for (const o of g.unitsOf(p.id)) {
          if (!military(o)) continue;
          const d = ctx.enemies.length ? Math.min(...ctx.enemies.map(e => cheb(e, o))) : cheb(o, u);
          if (d < gd) { gd = d; goal = o; }
        }
        if (!goal) {
          const c = ctx.cities.slice().sort((a, b) => (ctx.threats[b.id] || 0) - (ctx.threats[a.id] || 0))[0];
          goal = c || null;
        }
        if (goal && cheb(goal, u) > 1 && ctx.stepToward(u, { idx: goal.y * W + goal.x, kind: 'rally' })) await pause('move', u);
      }
      rest();
      return;
    }

    if (u.type === 'governor') {
      if (hurt || ctx.danger[u.y * W + u.x] > 3) { await retreat(); return; }
      const target = AI.governorTarget(ctx);
      if (!target || cheb(target, u) <= 1) { rest(); return; }
      if (u.mp > 0 && ctx.stepToward(u, { idx: target.y * W + target.x, kind: 'garrison' })) await pause('move', u);
      rest();
      return;
    }

    if (u.type === 'envoy') {
      const t = g.tileAt(u);
      if (t.owner >= 0 && t.owner !== p.id && g.atWar(p.id, t.owner)) { await retreat(); return; }
      if (hurt) { await retreat(); return; }
      if (g.envoyHost(u)) { rest(); return; } // em missão: fica
      const q = AI.envoyHost(ctx);
      const goal = q ? hostTile(ctx, u, q) : null;
      if (goal && u.mp > 0 && ctx.stepToward(u, { idx: goal.y * W + goal.x, kind: 'envoy' })) await pause('move', u);
      rest();
    }
  };
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
