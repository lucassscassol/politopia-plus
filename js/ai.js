/* Politopia+ — inteligência artificial das tribos rivais */
(function (PP) {
  'use strict';
  const UN = PP.UNITS;
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const AI = {};

  // ------------------------------------------------------------ Decisões pontuais (chamadas pelo motor)
  AI.chooseReward = function (g, p, c, options) {
    const threat = AI.cityThreat(g, p, c);
    const W = {
      workshop: 1.3, academy: 0.9 * p.ai.sci, walls: threat > 0 ? 4 : 0.4, scholars: 1, resources: 1.2,
      explorer: g.turn < 12 ? 1.2 : 0.2, growth: 1.4, borders: 1, park: 1 / p.ai.aggr, giant: 1.4 * p.ai.aggr,
      metropolis: 3.5,
    };
    for (const o of options) if (/^m_/.test(o)) W[o] = 3;
    return g.rng.weighted(options.map(o => [o, W[o] || 1]));
  };

  AI.autoPromote = function (g, u) {
    let guard = 0;
    while (u.pendingPromo > 0 && guard++ < 5) {
      const d = UN[u.type];
      let opts;
      if (d.def > d.atk) opts = [['escudo', 3], ['vigor', 2]];
      else if (d.mounted || u.type === 'scout') opts = [['forca', 2], ['agilidade', 2], ['vigor', 1]];
      else if (d.range > 1) opts = [['forca', 3], ['vigor', 1]];
      else opts = [['forca', 2], ['vigor', 2], ['escudo', 1]];
      g.promote(u, g.rng.weighted(opts));
    }
  };

  AI.evaluatePeace = function (g, ai, other) {
    const rel = ai.rel[other.id];
    const since = rel ? rel.since : 0;
    if (g.turn - since < 3) return false;
    const myS = g.strength(ai.id), theirS = g.strength(other.id);
    let chance = 0.35;
    if (myS < theirS * 0.8) chance += 0.35;
    if (myS > theirS * 1.5) chance -= 0.3;
    chance -= (ai.ai.aggr - 1) * 0.6;
    chance += other.reputation * 0.15;
    const wars = g.players.filter(q => q.alive && q.id !== ai.id && ai.met[q.id] && g.atWar(ai.id, q.id)).length;
    if (wars > 1) chance += 0.15;
    return g.rng.next() < PP.clamp(chance, 0.05, 0.9);
  };

  // Propostas diplomáticas e ruínas: decididas pelo módulo de estratégia (ai-strategy.js)
  AI.evaluateProposal = function (g, ai, from, type, data) {
    if (PP.AIStrategy) return PP.AIStrategy.evaluateProposal(g, ai, from, type, data);
    return type === 'peace' ? AI.evaluatePeace(g, ai, from) : false;
  };

  AI.chooseRuin = function (g, p, u, t, options) {
    return PP.AIStrategy ? PP.AIStrategy.chooseRuin(g, p, u, t, options) : 'explore';
  };

  AI.cityThreat = function (g, p, c) {
    let t = 0;
    for (const e of g.units) {
      if (!g.atWar(p.id, e.owner) || !p.visible[e.y * g.W + e.x]) continue;
      if (cheb(e, c) <= 3) t += UN[e.type].atk * e.hp / g.maxHp(e) + 0.5;
    }
    return t;
  };

  // ------------------------------------------------------------ Turno completo
  AI.takeTurn = async function (g, hooks) {
    const p = g.currentPlayer;
    const pause = (hooks && hooks.pause) || (() => null);
    const analysis = PP.AIStrategy ? PP.AIStrategy.updateStrategy(g, p) : null;
    const ctx = new Ctx(g, p, analysis);
    ctx.diplomacy();
    ctx.project();
    ctx.research();
    ctx.specialize();
    await ctx.unitPhase(pause);
    if (g.over) return;
    ctx.refresh();
    ctx.spend();
    ctx.project();
    ctx.research();
  };

  class Ctx {
    constructor(g, p, analysis) {
      this.g = g; this.p = p; this.W = g.W;
      this.analysis = analysis || null;
      this.strategy = p.ai.strategy || null;
      this.diff = PP.DIFFICULTY[g.opts.difficulty] || PP.DIFFICULTY.normal;
      this.aggr = p.ai.aggr * this.diff.aggr * (PP.AIStrategy ? PP.AIStrategy.aggrMult(p) : 1);
      this.smart = this.diff.smart;
      this.revCache = new Map();
      this.claims = new Map();
      this.refresh();
    }

    refresh() {
      const g = this.g, p = this.p, W = this.W;
      this.cities = g.citiesOf(p.id);
      this.enemies = g.units.filter(u => g.atWar(p.id, u.owner) && p.visible[u.y * W + u.x]);
      this.danger = new Float32Array(W * g.H);
      for (const e of this.enemies) {
        const st = g.stat(e), r = st.move + st.range;
        const w = st.atk * e.hp / st.maxHp;
        for (let y = Math.max(0, e.y - r); y <= Math.min(g.H - 1, e.y + r); y++)
          for (let x = Math.max(0, e.x - r); x <= Math.min(W - 1, e.x + r); x++) this.danger[y * W + x] += w;
      }
      this.threats = {};
      let anyThreat = false;
      for (const c of this.cities) { const t = AI.cityThreat(g, p, c); this.threats[c.id] = t; if (t > 0) anyThreat = true; }
      this.anyThreat = anyThreat;
      this.army = g.unitsOf(p.id).filter(u => UN[u.type].atk > 0).length;
      // Contagens do território
      const res = {}, ter = {}, imp = {};
      for (const t of g.tiles) {
        if (t.owner !== p.id) continue;
        if (t.res) res[t.res] = (res[t.res] || 0) + 1;
        ter[t.terrain] = (ter[t.terrain] || 0) + 1;
        if (t.imp) imp[t.imp] = (imp[t.imp] || 0) + 1;
      }
      const z = new Proxy({}, { get: (o, k) => 0 });
      this.terr = { res: Object.assign(Object.create(z), res), ter: Object.assign(Object.create(z), ter), imp: Object.assign(Object.create(z), imp) };
      this.needsBoats = this.computeNeedsBoats();
    }

    // Há alvos conhecidos que não dá para alcançar por terra?
    computeNeedsBoats() {
      const g = this.g, p = this.p;
      if (g.turn < 4 || !this.cities.length) return false;
      const cap = this.cities[0];
      const seen = new Uint8Array(this.W * g.H);
      const q = [cap.y * this.W + cap.x]; seen[q[0]] = 1;
      let reachableTargets = 0, frontier = 0;
      while (q.length) {
        const i = q.pop(), t = g.tiles[i];
        if ((t.village || (t.city && g.atWar(p.id, g.cityMap[t.city].owner))) && t.owner !== p.id) reachableTargets++;
        for (const n of g.neighbors(t)) {
          const j = n.y * this.W + n.x;
          if (seen[j] || g.isWater(n)) continue;
          if (!p.explored[j]) { frontier++; continue; }
          seen[j] = 1; q.push(j);
        }
      }
      return reachableTargets === 0 && frontier === 0;
    }

    // ---------------------------------------------------------- Diplomacia
    diplomacy() {
      const g = this.g, p = this.p;
      if (PP.AIStrategy && this.analysis) { PP.AIStrategy.diplomacy(g, p, this.analysis); return; }
      const myS = g.strength(p.id);
      for (const q of g.players) {
        if (q.id === p.id || !q.alive || !p.met[q.id]) continue;
        const rel = p.rel[q.id];
        const theirS = g.strength(q.id);
        const last = p.lastPeaceAsk[q.id] || -99;
        if (rel.state === 'war') {
          if (g.turn - rel.since < 4 || g.turn - last < 6) continue;
          let chance = 0.12;
          if (myS < theirS * 0.8) chance += 0.25;
          if (this.aggr > 1.15) chance -= 0.08;
          if (g.rng.next() < chance) g.proposePeace(p.id, q.id);
        } else {
          const peaceFor = g.turn - rel.since;
          const wars = g.players.some(o => o.alive && o.id !== p.id && p.met[o.id] && g.atWar(p.id, o.id));
          let chance = 0;
          if (peaceFor >= 10 && myS > theirS * 1.6) chance = 0.12 * this.aggr;
          if (!wars && peaceFor >= 8 && myS > theirS * 1.05) chance = Math.max(chance, 0.06 * this.aggr + (peaceFor - 8) * 0.01);
          if (chance > 0 && g.rng.next() < chance) g.declareWar(p.id, q.id);
        }
      }
    }

    // ---------------------------------------------------------- Pesquisa
    research() {
      const g = this.g, p = this.p;
      if (this.savingForProject()) return;
      for (let guard = 0; guard < 6; guard++) {
        const avail = PP.TECHS.filter(t => g.techState(p, t.id) === 'available');
        if (!avail.length) {
          if (g.allTechs(p) && p.science >= g.futureCost(p)) { g.researchFuture(p); continue; }
          return;
        }
        let best = null, bv = -1;
        for (const t of avail) {
          const v = this.techValue(t) * this.techStrategyMult(t) / g.techCost(p, t.id) * (0.8 + g.rng.next() * 0.4);
          if (v > bv) { bv = v; best = t; }
        }
        if (!best || p.science < g.techCost(p, best.id)) return;
        g.research(p, best.id);
      }
    }

    // Guarda ciência para o Grande Observatório quando a vitória científica está ao alcance
    savingForProject() {
      const g = this.g, p = this.p;
      if (!g.projectCheck || !g.victoryEnabled('ciencia')) return false;
      const sciCity = this.cities.find(c => c.spec === 'ciencia');
      if (!sciCity) return false;
      const chk = g.projectCheck(p, sciCity);
      if (chk.ok) return true;
      const ready = !chk.locked && chk.reason === 'Falta ciência';
      return ready && (this.strategy === 'ciencia' || g.allTechs(p) || p.project.stage > 0);
    }

    project() {
      const g = this.g, p = this.p;
      if (!g.projectCheck) return;
      for (const c of this.cities) {
        if (g.projectCheck(p, c).ok) { g.advanceProject(p, c); return; }
      }
    }

    // Escolhe especializações quando a cidade atinge o nível mínimo
    specialize() {
      const g = this.g, p = this.p;
      if (!PP.AIStrategy || !g.specCheck) return;
      for (const c of this.cities) {
        if (c.spec || c.level < PP.SPEC_COST.minLevel || p.stars < PP.SPEC_COST.first + 3) continue;
        const spec = PP.AIStrategy.chooseSpec(g, p, c);
        if (spec) g.setSpec(p, c, spec);
      }
    }

    techStrategyMult(t) {
      const m = {
        dominacao: { estrategia: 1.3, forja: 1.3, cavalaria: 1.3, polvora: 1.4, matematica: 1.2, arco: 1.2 },
        ciencia: { escrita: 1.6, filosofia: 1.5, educacao: 1.8, meditacao: 1.2, espionagem: 1.1 },
        economia: { estradas: 1.4, comercio: 1.6, economia: 1.5, navegacao: 1.3, cartografia: 1.2 },
        diplomacia: { escrita: 1.3, filosofia: 1.3, comercio: 1.2, espionagem: 1.2 },
        territorial: { estradas: 1.3, agricultura: 1.3, construcao: 1.2, arquitetura: 1.3, estrategia: 1.1 },
        defesa: { estrategia: 1.8, arquitetura: 1.4, mineracao: 1.2, arco: 1.3 },
      }[this.strategy];
      return (m && m[t.id]) || 1;
    }

    techValue(t) {
      const { res, ter, imp } = this.terr;
      const a = this.aggr, sci = this.p.ai.sci, n = this.cities.length;
      switch (t.id) {
        case 'montaria': return 4 + a * 2;
        case 'organizacao': return 4 + res.crop;
        case 'escalada': return 2 + ter.mountain * 0.8 + res.ore * 0.6;
        case 'pesca': return 1.5 + res.fish * 2.5;
        case 'caca': return 1.5 + res.game * 2.5;
        case 'estradas': return 2 + n * 0.6;
        case 'pastoreio': return 1.5 + res.horses * 2;
        case 'agricultura': return 1.5 + res.crop * 2.5 + ter.swamp * 0.5;
        case 'estrategia': return 3 + a * 2 + (this.anyThreat ? 4 : 0);
        case 'escrita': return 3.5 * sci;
        case 'mineracao': return 1.5 + res.ore * 3 + res.gems * 2;
        case 'meditacao': return 2.5;
        case 'navegacao': return 1 + ter.water * 0.35 + (this.needsBoats ? 12 : 0);
        case 'arco': return 3.5 + a * 2 + ter.forest * 0.2;
        case 'silvicultura': return 1.5 + ter.forest * 1.2;
        case 'comercio': return 3 + res.spices * 1.5 + n * 0.5;
        case 'cavalaria': return 2 + a * 3 * (this.g.hasStrategic(this.p, 'horses') ? 1.3 : 0.4);
        case 'construcao': return 2.5 + imp.farm * 1.3;
        case 'matematica': return 2.5 + imp.lumber * 1.1 + a * 2;
        case 'forja': return 2.5 + imp.mine * 1.5 + a * 2.5 * (this.g.hasStrategic(this.p, 'iron') ? 1.2 : 0.5);
        case 'filosofia': return 3 + sci * 2.5;
        case 'cartografia': return 1 + ter.water * 0.25 + res.whale + (this.needsBoats ? 6 : 0);
        case 'polvora': return 5 + a * 3;
        case 'eng_naval': return 1 + ter.water * 0.15 + (this.needsBoats ? 4 : 0);
        case 'educacao': return 3 + sci * 2.5;
        case 'economia': return 5;
        case 'arquitetura': return 3.5;
        case 'espionagem': return 1.5 + (this.analysis && this.analysis.wars ? 1.5 : 0) + (this.strategy === 'ciencia' ? 1 : 0);
      }
      return 2;
    }

    // ---------------------------------------------------------- Unidades
    async unitPhase(pause) {
      const g = this.g, p = this.p;
      const order = u => {
        if (g.canCapture(u)) return 0;
        const d = UN[u.type];
        if (d.spy) return 4;
        if (d.range > 1) return 1;
        if (d.skills.indexOf('convert') >= 0) return 3;
        return 2;
      };
      const list = g.unitsOf(p.id).sort((a, b) => order(a) - order(b));
      for (const u of list) {
        if (g.over) return;
        if (u.dead || u.owner !== p.id) continue;
        try { await this.act(u, pause); } catch (e) { console.error('IA:', e); }
      }
    }

    attackThreshold() { return -0.4 + (1 - this.aggr) * 1.5; }

    unitValue(u) { return u.type === 'giant' ? 16 : UN[u.type].cost + 2; }

    // Avalia um ataque (opcionalmente como se a unidade estivesse em pos)
    attackScore(u, d, pos) {
      const g = this.g;
      const ox = u.x, oy = u.y;
      if (pos) { u.x = pos.x; u.y = pos.y; }
      let r;
      try { r = g.previewAttack(u, d); } finally { u.x = ox; u.y = oy; }
      const vd = this.unitValue(d), vu = this.unitValue(u);
      let s = (r.dmg / g.maxHp(d)) * vd + (r.kill ? vd * 0.7 + 2 : 0) - (r.ret / g.maxHp(u)) * vu * 0.8 - (r.retKill ? vu + 2 : 0);
      const dt = g.tileAt(d);
      if (dt.city) {
        // Foco de cerco: quanto mais aliados perto do defensor, mais vale desgastá-lo
        let support = 0;
        for (const o of g.units) if (o.owner === this.p.id && o !== u && cheb(o, d) <= 2) support++;
        s += 1.5 + Math.min(4, support * 0.8);
      }
      for (const c of this.cities) if (cheb(c, d) <= 1) { s += 2; break; }
      return s;
    }

    bestAttack(u) {
      const g = this.g;
      const targets = g.attackTargets(u);
      if (!targets.length) return null;
      const scored = targets.map(t => ({ target: t, score: this.attackScore(u, t) })).sort((a, b) => b.score - a.score);
      if (scored.length > 1 && g.rng.next() > this.smart) return scored[1];
      return scored[0];
    }

    bestMoveAttack(u, reach) {
      const g = this.g, p = this.p;
      const st = g.stat(u);
      if (!u.canAttack || st.atk <= 0 || !this.enemies.length) return null;
      let best = null;
      for (const [k] of reach) {
        const pos = { x: k % this.W, y: (k / this.W) | 0 };
        const tt = g.tiles[k];
        if (g.isWater(tt) !== g.isWater(g.tileAt(u))) continue; // não planeja ataque após (des)embarcar
        for (const e of this.enemies) {
          if (e.dead || cheb(pos, e) > st.range || !g.atWar(p.id, e.owner)) continue;
          let s = this.attackScore(u, e, pos);
          s -= Math.max(0, this.danger[k] - u.hp * 0.4) * 0.25 * (1.6 - this.aggr);
          if (tt.city && g.cityMap[tt.city].owner === p.id) s += 0.5;
          if (!best || s > best.score) best = { score: s, tile: pos, target: e };
        }
      }
      return best;
    }

    inOwnCity(u) { const t = this.g.tileAt(u); return !!(t.city && this.g.cityMap[t.city].owner === this.p.id); }

    async act(u, pause) {
      const g = this.g;
      if (u.pendingPromo) AI.autoPromote(g, u);
      const thr = this.attackThreshold();
      if (UN[u.type].spy) { await this.actSpy(u, pause); return; }

      // 1) Capturar
      if (g.canCapture(u)) { g.capture(u); await pause('capture', u); return; }

      const st = g.stat(u);

      // 1b) Habilidades que preparam o ataque (tiro preciso, bombardeio, carga, bordada, bênção, reconhecimento)
      this.preAbilities(u);
      if (u.dead || g.over) return;

      // 2) Missionário: converter / curar
      if (st.skills.convert) {
        const tg = g.convertTargets(u).sort((a, b) => this.unitValue(b) - this.unitValue(a))[0];
        if (tg) { g.convert(u, tg); await pause('convert', u); return; }
      }
      if (st.skills.heal && g.canHealOthers(u)) { g.healOthers(u); await pause('heal', u); return; }

      // 3) Atacar de onde está
      let a = this.bestAttack(u);
      if (a && a.score > thr) {
        g.attack(u, a.target); await pause('attack', u);
        let guard = 0;
        while (!u.dead && u.canAttack && guard++ < 4) {
          a = this.bestAttack(u);
          if (!a || a.score <= thr) break;
          g.attack(u, a.target); await pause('attack', u);
        }
        if (u.dead || g.over) return;
        if (u.mp > 0) { const goal = this.chooseGoal(u); if (goal && this.stepToward(u, goal)) await pause('move', u); }
        return;
      }

      // 3b) Saquear a infraestrutura inimiga onde está
      if (g.pillageCheck) {
        const pc = g.pillageCheck(u);
        if (pc.ok && (pc.what !== 'road' || this.aggr > 1.1)) { g.pillage(u); await pause('pillage', u); return; }
      }

      // 4) Muito ferido (ou sem suprimentos há muito tempo): recuar e curar
      const hpFrac = u.hp / st.maxHp;
      const starving = g.supplyLevel && g.supplyLevel(u) >= 2 && hpFrac < 0.8;
      if ((hpFrac < 0.45 || starving) && !this.inOwnCity(u)) {
        const home = this.nearestSafeCity(u);
        if (home && u.mp > 0 && this.stepToward(u, { idx: home.y * this.W + home.x, kind: 'retreat' })) { await pause('move', u); return; }
        if (g.canRecover(u)) { g.recover(u); return; }
      }
      if (hpFrac < 0.75 && this.inOwnCity(u) && g.canRecover(u)) { g.recover(u); return; }

      // 5) Mover e atacar
      if (u.mp > 0 && st.skills.dash && u.canAttack) {
        const reach = g.reachable(u);
        const plan = this.bestMoveAttack(u, reach);
        if (plan && plan.score > thr + 0.8) {
          g.moveUnit(u, plan.tile.x, plan.tile.y, reach); await pause('move', u);
          if (!u.dead && !plan.target.dead && g.canAttackUnit(u, plan.target)) { g.attack(u, plan.target); await pause('attack', u); }
          return;
        }
      }

      // 6) Movimento estratégico
      if (u.mp > 0) {
        const goal = this.chooseGoal(u);
        if (goal && this.stepToward(u, goal)) await pause('move', u);
        if (u.dead || g.over) return;
        // chegou numa aldeia/cidade: fica parado para capturar no próximo turno
      }

      // 7) Atacar depois de mover
      if (u.canAttack && !u.dead) {
        const a2 = this.bestAttack(u);
        if (a2 && a2.score > thr) { g.attack(u, a2.target); await pause('attack', u); return; }
      }

      // 8) Ocioso
      if (!u.moved && !u.attacked) {
        const t = g.tileAt(u);
        const garrison = t.city && (this.threats[t.city] > 0 || (this.claims.get(u.y * this.W + u.x) || 0) > 0);
        if (this.inOwnCity(u) && !garrison && u.mp > 0 && this.leaveCity(u)) { await pause('move', u); return; }
        if (this.defensiveAbility(u)) return;
        if (g.canRecover(u)) g.recover(u);
        else if (this.inOwnCity(u) && g.canFortify(u)) g.fortify(u);
      }
    }

    unknownNear(u, r) {
      let n = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = u.x + dx, y = u.y + dy;
        if (this.g.inb(x, y) && !this.p.explored[y * this.W + x]) n++;
      }
      return n;
    }

    preAbilities(u) {
      const g = this.g;
      if (!g.abilitiesOf) return;
      const list = g.abilitiesOf(u);
      if (!list.length) return;
      const st = g.stat(u);
      for (const id of list) {
        if (u.dead || !g.abilityCheck(u, id).ok) continue;
        if (id === 'recon') {
          if (this.unknownNear(u, 4) >= 5) g.useAbility(u, id);
        } else if (id === 'aim') {
          if (g.attackTargets(u).length || this.enemies.some(e => cheb(e, u) === st.range + 1)) g.useAbility(u, id);
        } else if (id === 'bombard') {
          if (this.enemies.some(e => cheb(e, u) <= st.range + 1 && this.enemies.some(o => o !== e && cheb(o, e) === 1))) g.useAbility(u, id);
        } else if (id === 'charge') {
          if (!g.attackTargets(u).length && this.aggr >= 0.8 && u.hp > st.maxHp * 0.6 &&
            this.enemies.some(e => cheb(e, u) > st.move && cheb(e, u) <= st.move + 3)) g.useAbility(u, id);
        } else if (id === 'broadside') {
          if (g.broadsideTargets(u).length >= 2) g.useAbility(u, id);
        } else if (id === 'bless') {
          const friends = g.neighbors(u).filter(n => { const o = g.uGrid[n.y * this.W + n.x]; return o && o.owner === u.owner; }).length;
          if (friends >= 2 && this.enemies.some(e => cheb(e, u) <= 3)) g.useAbility(u, id);
        }
      }
    }

    // Provocar / Formação Cerrada quando a unidade vai ficar parada perto do inimigo
    defensiveAbility(u) {
      const g = this.g;
      if (!g.abilitiesOf) return false;
      const near = this.enemies.filter(e => cheb(e, u) <= 2).length;
      if (!near) return false;
      const friends = g.neighbors(u).filter(n => { const o = g.uGrid[n.y * this.W + n.x]; return o && o.owner === u.owner; }).length;
      for (const id of g.abilitiesOf(u)) {
        if (!g.abilityCheck(u, id).ok) continue;
        if (id === 'taunt' && near >= 2 && friends >= 1 && u.hp >= g.maxHp(u) * 0.6) { g.useAbility(u, id); return true; }
        if (id === 'phalanx' && friends >= 2) { g.useAbility(u, id); return true; }
      }
      return false;
    }

    // Espiões: missão se estiver ao lado de uma cidade estrangeira; senão, aproxima-se de uma
    async actSpy(u, pause) {
      const g = this.g, p = this.p;
      const ms = g.spyMissions(u).filter(m => m.ok);
      if (ms.length) {
        const victim = ms[0].target.owner;
        const war = g.atWar(p.id, victim);
        let pref = war ? ['sabotage_city', 'steal_tech', 'steal_sci', 'infiltrate', 'reveal'] : ['steal_tech', 'infiltrate', 'steal_sci', 'reveal'];
        if (this.strategy === 'ciencia') pref = ['steal_tech', 'steal_sci', 'infiltrate', 'sabotage_city', 'reveal'];
        for (const id of pref) {
          const m = ms.find(x => x.id === id);
          if (m && m.risk <= 0.55) { g.spyMission(u, id); await pause('spy', u); return; }
        }
      }
      if (u.mp <= 0) return;
      let target = null, bd = 1e9;
      for (const c of g.cities) {
        if (c.owner === p.id || g.allied(p.id, c.owner) || !p.explored[c.y * this.W + c.x] || !p.met[c.owner]) continue;
        const d = cheb(c, u) - (g.atWar(p.id, c.owner) ? 3 : 0) - (c.owner === p.ai.target ? 2 : 0);
        if (d < bd) { bd = d; target = c; }
      }
      if (!target) { const goal = this.chooseGoal(u); if (goal && goal.kind === 'explore' && this.stepToward(u, goal)) await pause('move', u); return; }
      const reach = g.reachable(u);
      let best = null, bs = cheb(u, target) === 1 ? 0 : 1e9;
      for (const [k] of reach) {
        const t = g.tiles[k];
        if (t.city) continue;
        const d = cheb(t, target);
        const s = (d === 1 ? 0 : d * 3) + this.danger[k] * 0.5;
        if (s < bs) { bs = s; best = k; }
      }
      if (best != null) { g.moveUnit(u, best % this.W, (best / this.W) | 0, reach); await pause('move', u); }
    }

    // Sai da cidade para uma casa vizinha segura (libera o espaço para treinar)
    leaveCity(u) {
      const g = this.g;
      const reach = g.reachable(u);
      let best = null, bs = 1e9;
      for (const [k] of reach) {
        const t = g.tiles[k];
        if (t.city || g.isWater(t) || cheb(t, u) > 1) continue;
        const s = this.danger[k] * 2 + (t.owner === this.p.id ? 0 : 2) - (t.terrain === 'forest' || t.terrain === 'hills' ? 0.5 : 0);
        if (s < bs) { bs = s; best = k; }
      }
      if (best == null) return false;
      return g.moveUnit(u, best % this.W, (best / this.W) | 0, reach);
    }

    nearestSafeCity(u) {
      let best = null, bd = 1e9;
      for (const c of this.cities) {
        const occ = this.g.unitAt(c.x, c.y);
        if (occ && occ !== u) continue;
        const d = cheb(c, u) + this.danger[c.y * this.W + c.x] * 0.3;
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    }

    // ---------------------------------------------------------- Navegação multi-turno
    stepOk(u, from, to) {
      const g = this.g, p = this.p;
      if (UN[u.type].naval) return g.isWater(to) && (to.terrain !== 'ocean' || g.navalLevel(p) >= 2);
      const tw = g.isWater(to) && to.landmark !== 'vau', fw = g.isWater(from) && from.landmark !== 'vau';
      if (tw) {
        const nl = g.navalLevel(p);
        if (!fw) return ((to.imp === 'port' && to.owner === p.id) || (p.tribe === 'vikar' && to.terrain === 'water')) && nl >= 1;
        return nl >= 1 && (to.terrain !== 'ocean' || nl >= 2);
      }
      if (to.terrain === 'mountain' && (!p.techs.escalada || UN[u.type].mounted)) return false;
      if (to.city) { const c = g.cityMap[to.city]; if (c.owner !== p.id && !g.atWar(p.id, c.owner)) return false; }
      return true;
    }

    forwardDist(u) {
      const g = this.g, p = this.p, W = this.W;
      const dist = new Int16Array(W * g.H).fill(-1);
      const start = u.y * W + u.x;
      dist[start] = 0;
      const q = [start];
      for (let h = 0; h < q.length; h++) {
        const i = q[h], t = g.tiles[i];
        for (const n of g.neighbors(t)) {
          const j = n.y * W + n.x;
          if (dist[j] >= 0 || !p.explored[j] || !this.stepOk(u, t, n)) continue;
          dist[j] = dist[i] + 1; q.push(j);
        }
      }
      return dist;
    }

    reverseDist(u, goalIdx) {
      const key = goalIdx * 2 + (UN[u.type].mounted ? 1 : 0);
      if (this.revCache.has(key)) return this.revCache.get(key);
      const g = this.g, p = this.p, W = this.W;
      const dist = new Int16Array(W * g.H).fill(-1);
      dist[goalIdx] = 0;
      const q = [goalIdx];
      for (let h = 0; h < q.length; h++) {
        const i = q[h], t = g.tiles[i];
        for (const n of g.neighbors(t)) {
          const j = n.y * W + n.x;
          if (dist[j] >= 0 || !p.explored[j] || !this.stepOk(u, n, t)) continue;
          dist[j] = dist[i] + 1; q.push(j);
        }
      }
      this.revCache.set(key, dist);
      return dist;
    }

    stepToward(u, goal) {
      const g = this.g;
      const reach = g.reachable(u);
      if (!reach.size) return false;
      const rev = this.reverseDist(u, goal.idx);
      const cur = u.y * this.W + u.x;
      const curD = rev[cur] < 0 ? 9999 : rev[cur];
      let best = null, bs = 1e9;
      for (const [k] of reach) {
        const d = rev[k];
        if (d < 0) continue;
        const t = g.tiles[k];
        let s = d * 10 + this.danger[k] * (goal.kind === 'retreat' ? 3 : 0.6 * (1.5 - this.aggr));
        if (t.terrain === 'forest' || t.terrain === 'hills' || t.terrain === 'mountain') s -= 1;
        if (t.city && g.cityMap[t.city].owner === this.p.id && goal.kind !== 'defend' && k !== goal.idx) s += 3; // não entupir cidades
        if (s < bs) { bs = s; best = k; }
      }
      if (best == null || rev[best] >= curD) return false;
      return g.moveUnit(u, best % this.W, (best / this.W) | 0, reach);
    }

    claim(idx, max) {
      const n = this.claims.get(idx) || 0;
      if (n >= max) return false;
      this.claims.set(idx, n + 1);
      return true;
    }

    chooseGoal(u) {
      const g = this.g, p = this.p, W = this.W;
      const dist = this.forwardDist(u);
      const d0 = UN[u.type];
      const isScout = u.type === 'scout';
      const defensive = d0.def > d0.atk || u.type === 'catapult' || u.type === 'cannon';
      const cands = [];
      const push = (idx, value, kind, max) => {
        const d = dist[idx];
        if (d < 0 || value <= 0) return;
        cands.push({ idx, kind, max, score: value / (d + 1.5), d });
      };
      const myS = g.strength(p.id) + 1;
      const ratio = {};
      for (const q of g.players) ratio[q.id] = PP.clamp(myS / (g.strength(q.id) + 1), 0.3, 2.2);
      for (let i = 0; i < g.tiles.length; i++) {
        if (!p.explored[i]) continue;
        const t = g.tiles[i];
        if (t.village) push(i, (isScout ? 8 : 10) * (this.strategy === 'territorial' ? 1.3 : 1), 'village', 1);
        else if (t.ruin) push(i, 7, 'ruin', 1);
        else if (t.city) {
          const c = g.cityMap[t.city];
          if (c.owner !== p.id && g.atWar(p.id, c.owner) && p.met[c.owner] && !isScout) {
            const occ = g.uGrid[i];
            let v = (6 + c.level) * this.aggr * ratio[c.owner] * (occ ? 0.6 : 1.2) * (defensive ? 0.5 : 1);
            if (p.ai.campaign && p.ai.campaign.city === c.id) v *= 2.2;
            if (this.strategy === 'defesa') v *= 0.3;
            push(i, v, 'city', 8);
          }
        } else if (!isScout && !defensive && d0.range === 1 && t.owner >= 0 && t.owner !== p.id && g.atWar(p.id, t.owner)) {
          if (t.fort && t.fort.owner !== p.id) push(i, 2.5 * this.aggr, 'pillage', 1);
          else if (t.imp && !t.pillaged) push(i, 1.4 * this.aggr, 'pillage', 1);
        }
      }
      // defender cidades ameaçadas e guarnecer cidades ocupadas ou em resistência
      for (const c of this.cities) {
        const th = this.threats[c.id];
        const dm = this.strategy === 'defesa' ? 1.5 : 1;
        if (th > 0) push(c.y * W + c.x, (6 + th * 2 * (defensive ? 1.5 : 1)) * dm, 'defend', 2);
        else if ((c.occupied > 0 || c.unrest) && !g.unitAt(c.x, c.y)) push(c.y * W + c.x, 5, 'garrison', 1);
        else if (defensive && !g.unitAt(c.x, c.y) && this.enemies.length) push(c.y * W + c.x, 3, 'garrison', 1);
      }
      // caçar inimigos visíveis
      if (!isScout) for (const e of this.enemies) push(e.y * W + e.x, 3 * this.aggr * (defensive ? 0.5 : 1), 'hunt', 2);
      // explorar a fronteira do desconhecido
      const exploreV = (g.turn < 15 ? 4 : 1.5) * (isScout ? 2.5 : 1) * (defensive ? 0.3 : 1);
      for (let i = 0; i < g.tiles.length; i++) {
        if (!p.explored[i] || dist[i] < 0) continue;
        const t = g.tiles[i];
        let unknown = 0;
        for (const n of g.neighbors(t, 1)) if (!p.explored[n.y * W + n.x]) unknown++;
        if (unknown >= 2) push(i, exploreV * (0.6 + unknown / 8), 'explore', 1);
      }
      cands.sort((a, b) => b.score - a.score);
      for (const c of cands) {
        if (c.d === 0 && (c.kind === 'village' || c.kind === 'defend' || c.kind === 'garrison')) {
          if (this.claim(c.idx, c.max)) return null; // já está onde precisa
          continue;
        }
        if (c.kind === 'explore') {
          // espalha exploradores: reserva uma vizinhança
          if (this.claims.get(c.idx)) continue;
          const cx = c.idx % W, cy = (c.idx / W) | 0;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const x = cx + dx, y = cy + dy;
            if (g.inb(x, y)) this.claims.set(y * W + x, 99);
          }
          return c;
        }
        if (this.claim(c.idx, c.max)) return c;
      }
      // Sem objetivo livre: reúne-se rumo à cidade inimiga conhecida mais próxima
      if (!isScout) {
        let best = null, bd = 1e9;
        for (const c of g.cities) {
          const i = c.y * W + c.x;
          if (c.owner === p.id || !g.atWar(p.id, c.owner) || !p.met[c.owner] || !p.explored[i] || dist[i] < 0) continue;
          if (dist[i] < bd) { bd = dist[i]; best = i; }
        }
        if (best != null) return { idx: best, kind: 'rally', max: 99 };
      }
      return null;
    }

    // ---------------------------------------------------------- Gastos
    spend() {
      const g = this.g, p = this.p;
      for (let guard = 0; guard < 60; guard++) {
        if (g.over) return;
        const opts = this.spendOptions();
        if (!opts.length) return;
        opts.sort((a, b) => b.score - a.score);
        const best = opts[0];
        let pick = best;
        if (best.cost > p.stars) {
          const aff = opts.find(o => o.cost <= p.stars);
          if (!aff || aff.score < best.score * 0.6) return;
          pick = aff;
        }
        if (!pick.exec()) return;
        this.refresh();
      }
    }

    popValue(c, pop) {
      if (!c) return 0;
      let v = pop;
      if (c.pop + pop >= c.level + 1) v += 0.4;
      if (c.capital) v += 0.15;
      return v;
    }

    spendOptions() {
      const g = this.g, p = this.p;
      const out = [];
      const eco = p.ai.eco;
      // Ações em casas
      for (const t of g.tiles) {
        if (t.owner !== p.id || t.city) continue;
        const city = g.cityMap[t.cityId];
        if (t.pillaged) {
          const chk = g.tileActionCheck(p, t, 'repair');
          if (chk.visible && (chk.ok || chk.reason === 'Faltam estrelas')) out.push({ score: 1.6 / (chk.cost + 1) * eco, cost: chk.cost, exec: () => g.doTileAction(p, t, 'repair') });
          continue;
        }
        for (const a of PP.TILE_ACTIONS) {
          if (a.road || a.fort || a.repair || a.id === 'clear' || a.id === 'plant') continue;
          const chk = g.tileActionCheck(p, t, a.id);
          if (!chk.visible || chk.locked || (!chk.ok && chk.reason !== 'Faltam estrelas')) continue;
          let v = 0;
          if (a.pop) {
            let pop = a.pop;
            if (a.adj) pop = g.countAdj(t, a.adj, p.id) * a.per;
            if ((a.imp === 'mine' || a.imp === 'gemmine') && p.tribe === 'aymara') pop++;
            if (a.id === 'fishing' && p.tribe === 'vikar') pop++;
            v = this.popValue(city, pop);
          }
          if (a.income) v += a.income * 1.3;
          if (a.id === 'market') v = g.neighbors(t).reduce((s, n) => s + (n.owner === p.id && ['sawmill', 'windmill', 'forge'].indexOf(n.imp) >= 0 ? n.impLevel : 0), 0) * 1.2;
          if (a.gold) v += a.gold * 0.45;
          if (a.id === 'port') v += this.needsBoats && !g.tiles.some(o => o.cityId === t.cityId && o.imp === 'port') ? 5 : 0.3;
          if (a.id === 'burn' || a.id === 'drain') v = 0.8;
          if (a.imp === 'mine' && !g.hasStrategic(p, 'iron')) v += 1;
          if (a.imp === 'pasture' && !g.hasStrategic(p, 'horses')) v += 0.8;
          if (a.imp && PP.LUXURIES && Object.keys(PP.LUXURIES).some(k => PP.LUXURIES[k].imp === a.imp) && !(g.resourceAccess(p)[t.res] > 0)) v += 0.8;
          if (v <= 0) continue;
          const cost = a.cost;
          out.push({ score: v / (cost + 1) * eco, cost, exec: () => g.doTileAction(p, t, a.id) });
        }
      }
      // Estradas até a capital
      const road = this.roadStep();
      if (road) out.push({ score: (this.strategy === 'economia' ? 0.28 : 0.18) * eco, cost: 2, exec: () => g.doTileAction(p, road, 'road') });
      // Rotas comerciais
      if (g.routeSlots) {
        for (const c of this.cities) {
          if (g.routesOf(c).length >= g.routeSlots(c)) continue;
          const best = g.routeCandidates(p, c).find(x => x.yield && (x.check.ok || x.check.reason === 'Faltam estrelas') &&
            (x.city.owner === p.id || g.opinion(p.id, x.city.owner) > -15));
          if (!best) continue;
          const val = best.yield.stars + best.yield.sci * 0.8 + (best.check.kind === 'foreign' ? 0.6 : 0);
          const m = this.strategy === 'economia' ? 1.6 : this.strategy === 'diplomacia' ? 1.2 : 1;
          out.push({ score: val * 0.9 * m / (best.check.cost + 1), cost: best.check.cost, exec: () => !!g.createRoute(p, c, best.city) });
        }
      }
      // Fortificações: passos de montanha e casas-chave perto de cidades ameaçadas
      if (g.fortActionCheck && (g.has(p, 'estrategia') || g.has(p, 'estradas'))) {
        const cand = [];
        for (const t of g.tiles) {
          if (t.owner !== p.id || t.city || t.fort) continue;
          let v = 0;
          if (t.landmark === 'passo') v += 1.6;
          const near = this.cities.find(c => cheb(c, t) === 2 && (this.threats[c.id] || 0) > 0);
          if (near) v += 0.8 + Math.min(1.5, this.threats[near.id] * 0.15);
          if (t.terrain === 'hills') v += 0.3;
          if (this.strategy === 'defesa' || this.strategy === 'territorial') v *= 1.4;
          if (v > 0.9) cand.push([t, v]);
        }
        cand.sort((a, b) => b[1] - a[1]);
        for (const [t, v] of cand.slice(0, 2)) {
          for (const id of ['fort', 'tower', 'outpost']) {
            const chk = g.tileActionCheck(p, t, id);
            if (!chk.visible || chk.locked || (!chk.ok && chk.reason !== 'Faltam estrelas')) continue;
            out.push({ score: v / (chk.cost + 1), cost: chk.cost, exec: () => g.doTileAction(p, t, id) });
            break;
          }
        }
      }
      // Construções
      for (const c of this.cities) {
        const th = this.threats[c.id] || 0;
        for (const id of PP.BUILDING_ORDER) {
          const chk = g.buildingCheck(p, c, id);
          if (chk.done || chk.locked || chk.specLocked || (!chk.ok && chk.reason !== 'Faltam estrelas')) continue;
          let v = 0;
          const strat = this.strategy;
          switch (id) {
            case 'walls': v = th > 0 && c.level >= 2 ? 3 + th * 0.5 : (c.capital && g.turn > 20 ? 0.8 : 0); if (strat === 'defesa') v *= 2; break;
            case 'barracks': v = this.aggr > 1 && this.cities.length >= 3 ? 1.2 : 0.3; break;
            case 'granary': v = this.popValue(c, 2); break;
            case 'library': v = 2.2 * p.ai.sci; break;
            case 'temple': v = this.popValue(c, 1) + 0.4 + (c.unrest || c.occupied ? 1.5 : 0); break;
            case 'university': v = 3.2 * p.ai.sci; break;
            case 'bank': v = 3.6; break;
            case 'guard': v = (this.analysis && this.analysis.wars ? 0.6 : 0.2) + (c.capital ? 0.4 : 0) + (c.unrest ? 0.6 : 0); break;
            case 'arsenal': v = 1.4 * this.aggr; break;
            case 'citadel': v = th > 0 ? 3 : 0.8; if (strat === 'defesa') v *= 1.5; break;
            case 'observatory': v = 2.0 * p.ai.sci; break;
            case 'academy_hall': v = 2.8 * p.ai.sci; break;
            case 'guild': v = 2.4; break;
            case 'exchange': v = 3.2; break;
            case 'silos': v = 1.2; break;
            case 'aqueduct': v = this.popValue(c, 2) + 0.5; break;
            case 'shipyard': v = this.needsBoats ? 1.5 : 0.6; break;
            case 'lighthouse': v = 0.8; break;
            case 'customs': v = 2.5; break;
          }
          if (strat === 'ciencia' && ['library', 'university', 'observatory', 'academy_hall'].indexOf(id) >= 0) v *= 1.4;
          if (strat === 'economia' && ['bank', 'guild', 'exchange', 'customs'].indexOf(id) >= 0) v *= 1.4;
          if (v > 0) out.push({ score: v / (chk.cost + 1), cost: chk.cost, exec: () => g.build(p, c, id) });
        }
      }
      // Maravilhas
      if (!this.anyThreat) {
        const wm = g.victoryEnabled && g.victoryEnabled('maravilhas') ? 1.4 : 1;
        for (const wid in PP.WONDERS) {
          if (g.wonders[wid] != null || !g.has(p, PP.WONDERS[wid].tech)) continue;
          const spot = g.tiles.find(t => t.owner === p.id && g.wonderCheck(p, t, wid).visible);
          if (!spot) continue;
          const cost = g.wonderCostFor(p, wid);
          out.push({ score: 4.5 * wm * (this.strategy === 'economia' ? 1.2 : 1) / (cost + 1), cost, exec: () => g.buildWonder(p, spot, wid) });
        }
      }
      // Unidades
      const target = 1 + this.cities.length * 1.1 * this.aggr + g.turn / 7;
      const deficit = target - this.army;
      let base = deficit > 0 ? 0.36 + 0.07 * Math.min(6, deficit) : 0.06;
      if (this.anyThreat) base += 0.5;
      if (g.turn <= 3 && this.army < 2) base += 0.25;
      if (this.strategy === 'dominacao') base *= 1.15;
      if (this.strategy === 'defesa' && this.anyThreat) base += 0.3;
      for (const c of this.cities) {
        if (g.cityUnits(c).length >= g.capacity(c)) continue;
        const occupied = !!g.unitAt(c.x, c.y);
        const type = this.chooseUnitType(c, occupied);
        if (!type) continue;
        const th = this.threats[c.id] || 0;
        out.push({ score: base + (th > 0 ? 0.3 : 0), cost: g.unitCostFor(p, c, type), exec: () => !!g.train(p, c, type) });
      }
      // Espiões (poucos, quando há guerras ou foco em ciência)
      if (g.has(p, 'espionagem')) {
        const spies = g.unitsOf(p.id).filter(u => UN[u.type].spy).length;
        const want = (this.analysis && this.analysis.wars) || this.strategy === 'ciencia' ? Math.min(2, 1 + Math.floor(this.cities.length / 4)) : 0;
        if (spies < want) {
          const c = this.cities.find(x => !g.unitAt(x.x, x.y) && g.trainCheck(p, x, 'spy').reason !== 'Capacidade máxima');
          if (c) out.push({ score: 0.3, cost: g.unitCostFor(p, c, 'spy'), exec: () => !!g.train(p, c, 'spy') });
        }
      }
      return out;
    }

    chooseUnitType(c, navalOnly) {
      const g = this.g, p = this.p;
      const th = this.threats[c.id] || 0;
      const mountedEnemies = this.enemies.some(e => UN[e.type].mounted);
      const enemyShips = this.enemies.some(e => UN[e.type].naval);
      const mine = g.unitsOf(p.id);
      const scouts = mine.filter(u => u.type === 'scout').length;
      const ships = mine.filter(u => UN[u.type].naval).length;
      const navalWant = (this.needsBoats ? 1.5 : 0) + (enemyShips ? 1.5 : 0) + (this.strategy === 'economia' ? 0.3 : 0);
      const W = {
        warrior: 1, scout: g.turn < 18 && scouts < 1 ? 2.5 : 0, rider: 2 * this.aggr, archer: 1.8 + (th ? 1 : 0),
        defender: th ? 4 : 1, pikeman: mountedEnemies ? 3 : 1, swordsman: 3 * this.aggr, catapult: 1.3 * this.aggr,
        knight: 3.5 * this.aggr, missionary: 0.5, musketeer: 4, cannon: 1.5 * this.aggr,
        spy: 0, transport: 0,
        scout_ship: navalWant > 0 && ships < 1 ? 1.2 : 0, frigate: navalWant * (ships < 4 ? 1 : 0.3), ironclad: navalWant * 1.3,
      };
      if (this.strategy === 'defesa') { W.defender *= 1.8; W.archer *= 1.4; W.pikeman *= 1.3; }
      const opts = [];
      for (const t of PP.TRAINABLE) {
        if (navalOnly && !UN[t].naval) continue;
        if (!W[t] && W[t] !== undefined) continue;
        const chk = g.trainCheck(p, c, t);
        if (!chk.ok && chk.reason !== 'Faltam estrelas') continue;
        const d = UN[t];
        const power = d.atk + d.def + d.hp / 5 + d.move * 0.5;
        opts.push([t, (W[t] || 1) * Math.pow(power, 1.6) / Math.pow(d.cost, 0.6)]);
      }
      if (!opts.length) return null;
      return g.rng.weighted(opts);
    }

    // Próxima casa de estrada rumo a uma cidade desconectada
    roadStep() {
      const g = this.g, p = this.p, W = this.W;
      if (!g.has(p, 'estradas')) return null;
      const cap = p.capital ? g.cityMap[p.capital] : null;
      if (!cap || cap.owner !== p.id) return null;
      const target = this.cities.filter(c => !c.capital && !c.connected).sort((a, b) => cheb(a, cap) - cheb(b, cap))[0];
      if (!target || cheb(target, cap) > 7) return null;
      // BFS por terra própria/neutra da cidade até a capital
      const prev = new Int32Array(W * g.H).fill(-2);
      const s = target.y * W + target.x, goal = cap.y * W + cap.x;
      prev[s] = -1;
      const q = [s];
      for (let h = 0; h < q.length; h++) {
        const i = q[h];
        if (i === goal) break;
        for (const n of g.neighbors(g.tiles[i])) {
          const j = n.y * W + n.x;
          if (prev[j] !== -2 || g.isWater(n) || n.terrain === 'mountain') continue;
          if (!(n.owner === p.id || n.owner === -1) && !n.city) continue;
          prev[j] = i; q.push(j);
        }
      }
      if (prev[goal] === -2) return null;
      for (let i = prev[goal]; i >= 0 && i !== s; i = prev[i]) {
        const t = g.tiles[i];
        if (!t.road && !t.city) {
          const chk = g.tileActionCheck(p, t, 'road');
          return chk.visible && !chk.locked ? t : null;
        }
      }
      return null;
    }
  }

  PP.AI = AI;
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
