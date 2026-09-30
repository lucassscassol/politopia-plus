/* Politopia+ — condições de vitória. Dominação (e Pontos) continuam no motor; aqui entram Científica,
   Econômica, Maravilhas, Territorial, Diplomática e Sobrevivência. Todas coexistem: a partida acaba na
   primeira que for cumprida. Partidas antigas (sem opts.victories) seguem só com as regras originais. */
(function (PP) {
  'use strict';

  PP.VICTORIES = {
    dominacao:     { name: 'Dominação',    icon: 'v_domination', desc: 'Elimine todas as outras tribos.' },
    pontos:        { name: 'Pontos',       icon: 'v_score',      desc: 'Tenha a maior pontuação quando o limite de turnos acabar.' },
    ciencia:       { name: 'Científica',   icon: 'v_science',    desc: 'Com Educação e 20 tecnologias, conclua as 3 etapas do Grande Observatório numa cidade científica.' },
    economia:      { name: 'Econômica',    icon: 'v_economy',    desc: 'Acumule estrelas em rotas comerciais e mantenha ao menos uma rota com outra tribo.' },
    maravilhas:    { name: 'Maravilhas',   icon: 'v_wonders',    desc: 'Possua 5 maravilhas ao mesmo tempo.' },
    territorio:    { name: 'Territorial',  icon: 'v_territory',  desc: 'Controle 45% das terras do mapa por 5 turnos seguidos.' },
    diplomacia:    { name: 'Diplomática',  icon: 'v_diplomacy',  desc: 'Com 3+ tribos vivas: aliança com metade das outras, nenhuma guerra e reputação positiva por 5 turnos seguidos.' },
    sobrevivencia: { name: 'Sobrevivência', icon: 'v_survival',  desc: 'Resista até o turno limite do cenário.' },
  };
  PP.SCIENCE_PROJECT = { name: 'Grande Observatório', stages: [30, 45, 60], tech: 'educacao', minTechs: 20 };
  PP.HOLD_TURNS = 5;
  PP.TERRITORY_SHARE = 0.45;
  PP.WONDERS_TO_WIN = 5;

  const V = {
    victoryEnabled(id) {
      const v = this.opts.victories;
      if (!v) return id === 'dominacao' || (id === 'pontos' && this.opts.victory === 'pontos');
      if (id === 'pontos') return this.opts.victory === 'pontos' || !!v.pontos;
      return !!v[id];
    },

    ensureVictory(p) {
      if (!p.vhold) p.vhold = {};
      if (!p.project) p.project = { stage: 0, last: -1 };
    },

    economicGoal() { return 350 + 50 * Math.max(0, this.players.length - 2); },

    hasForeignRoute(pid) {
      return (this.routes || []).some(r => r.active && r.kind === 'foreign' && (r.owner === pid || r.partner === pid));
    },

    landShare(pid) {
      let land = 0, mine = 0;
      for (const t of this.tiles) {
        if (this.isWater(t)) continue;
        land++;
        if (t.owner === pid) mine++;
      }
      return land ? mine / land : 0;
    },

    wondersOwned(pid) { let n = 0; for (const w in this.wonders) if (this.wonders[w] === pid) n++; return n; },

    diplomaticStanding(pid) {
      const p = this.players[pid];
      const others = this.players.filter(q => q.alive && q.id !== pid);
      const allies = others.filter(q => this.allied(pid, q.id)).length;
      const need = Math.ceil(others.length / 2);
      const wars = others.filter(q => this.atWar(pid, q.id)).length;
      const ok = this.players.filter(q => q.alive).length >= 3 && allies >= need && wars === 0 && (p.reputation || 0) >= 1;
      return { ok, allies, need, wars, rep: p.reputation || 0 };
    },

    // ------------------------------------------------------------ Grande Observatório
    projectCheck(p, c) {
      this.ensureVictory(p);
      const P = PP.SCIENCE_PROJECT;
      const stage = p.project.stage;
      const r = { ok: false, reason: '', cost: P.stages[Math.min(stage, P.stages.length - 1)], stage };
      if (!this.victoryEnabled('ciencia')) { r.reason = 'Vitória científica desativada'; r.hidden = true; return r; }
      if (stage >= P.stages.length) { r.reason = 'Concluído'; return r; }
      if (!c || c.owner !== p.id) { r.reason = 'Cidade inválida'; return r; }
      if (c.spec !== 'ciencia') { r.reason = 'Exige cidade Científica'; return r; }
      if (!this.has(p, P.tech)) { r.reason = 'Requer ' + PP.TECH[P.tech].name; r.locked = true; return r; }
      const n = Object.keys(p.techs).length;
      if (n < P.minTechs) { r.reason = `Requer ${P.minTechs} tecnologias (${n})`; r.locked = true; return r; }
      if (p.project.last === this.turn) { r.reason = 'Uma etapa por turno'; return r; }
      if (p.science < r.cost) { r.reason = 'Falta ciência'; return r; }
      r.ok = true;
      return r;
    },

    advanceProject(p, c) {
      if (this.over || p.id !== this.current) return false;
      const chk = this.projectCheck(p, c);
      if (!chk.ok) return false;
      p.science -= chk.cost;
      p.project.stage++;
      p.project.last = this.turn;
      p.project.city = c.id;
      const P = PP.SCIENCE_PROJECT;
      this.log(`${p.name} concluiu a etapa ${p.project.stage}/${P.stages.length} do ${P.name} em ${c.name}!`, null);
      this.emit('project', { player: p.id, stage: p.project.stage, city: c });
      if (p.project.stage >= P.stages.length) this.finish(p.id, 'ciencia');
      return true;
    },

    // ------------------------------------------------------------ Verificações
    checkInstantVictories() {
      if (this.over || !this.opts.victories) return;
      if (this.victoryEnabled('maravilhas')) {
        for (const p of this.players) if (p.alive && this.wondersOwned(p.id) >= PP.WONDERS_TO_WIN) { this.finish(p.id, 'maravilhas'); return; }
      }
    },

    checkRoundVictories() {
      if (this.over || !this.opts.victories) return;
      for (const p of this.players) {
        if (!p.alive) continue;
        this.ensureVictory(p);
        const h = p.vhold;
        if (this.victoryEnabled('territorio')) {
          const share = this.landShare(p.id);
          if (share >= PP.TERRITORY_SHARE) {
            h.territorio = (h.territorio || 0) + 1;
            if (h.territorio === 1) this.log(`${p.name} controla ${Math.round(share * 100)}% das terras! Vitória territorial em ${PP.HOLD_TURNS} turnos.`, null);
            if (h.territorio >= PP.HOLD_TURNS) { this.finish(p.id, 'territorio'); return; }
          } else h.territorio = 0;
        }
        if (this.victoryEnabled('diplomacia')) {
          if (this.diplomaticStanding(p.id).ok) {
            h.diplomacia = (h.diplomacia || 0) + 1;
            if (h.diplomacia === 1) this.log(`${p.name} lidera uma grande aliança! Vitória diplomática em ${PP.HOLD_TURNS} turnos.`, null);
            if (h.diplomacia >= PP.HOLD_TURNS) { this.finish(p.id, 'diplomacia'); return; }
          } else h.diplomacia = 0;
        }
        if (this.victoryEnabled('economia')) {
          if ((p.stats.tradeIncome || 0) >= this.economicGoal() && this.hasForeignRoute(p.id)) { this.finish(p.id, 'economia'); return; }
        }
      }
      if (this.victoryEnabled('sobrevivencia') && this.opts.surviveTurns && this.turn > this.opts.surviveTurns) {
        const hero = this.players.find(p => p.human && p.alive);
        if (hero) this.finish(hero.id, 'sobrevivencia');
      }
    },

    // Progresso de cada vitória (0 a 1) para a interface e para a IA
    victoryProgress(p) {
      this.ensureVictory(p);
      const out = [];
      const add = (id, pct, text) => out.push(Object.assign({ id, pct: Math.max(0, Math.min(1, pct)), text }, PP.VICTORIES[id]));
      const alive = this.players.filter(q => q.alive);
      add('dominacao', 1 - (alive.length - 1) / Math.max(1, this.players.length - 1), `${alive.length - 1} rival(is) restante(s)`);
      if (this.victoryEnabled('pontos')) {
        const best = alive.slice().sort((a, b) => this.score(b) - this.score(a))[0];
        add('pontos', this.turn / this.opts.turnLimit, `Turno ${this.turn}/${this.opts.turnLimit} · líder: ${best ? best.name : '—'}`);
      }
      if (this.victoryEnabled('ciencia')) {
        const P = PP.SCIENCE_PROJECT, n = Object.keys(p.techs).length;
        const pre = Math.min(1, n / P.minTechs) * (this.has(p, P.tech) ? 1 : 0.8);
        add('ciencia', p.project.stage ? 0.4 + 0.6 * p.project.stage / P.stages.length : pre * 0.4,
          p.project.stage ? `${P.name}: etapa ${p.project.stage}/${P.stages.length}` : `${n}/${P.minTechs} tecnologias${this.has(p, P.tech) ? '' : ' · falta Educação'}`);
      }
      if (this.victoryEnabled('economia')) {
        const goal = this.economicGoal(), cur = p.stats.tradeIncome || 0;
        add('economia', cur / goal, `${cur}/${goal}★ em rotas${this.hasForeignRoute(p.id) ? '' : ' · falta rota com outra tribo'}`);
      }
      if (this.victoryEnabled('maravilhas')) {
        const n = this.wondersOwned(p.id);
        add('maravilhas', n / PP.WONDERS_TO_WIN, `${n}/${PP.WONDERS_TO_WIN} maravilhas`);
      }
      if (this.victoryEnabled('territorio')) {
        const s = this.landShare(p.id);
        add('territorio', (s / PP.TERRITORY_SHARE) * 0.8 + (p.vhold.territorio || 0) / PP.HOLD_TURNS * 0.2,
          `${Math.round(s * 100)}% de ${Math.round(PP.TERRITORY_SHARE * 100)}% das terras` + (p.vhold.territorio ? ` · ${p.vhold.territorio}/${PP.HOLD_TURNS} turnos` : ''));
      }
      if (this.victoryEnabled('diplomacia')) {
        const d = this.diplomaticStanding(p.id);
        add('diplomacia', (Math.min(d.allies, d.need) / Math.max(1, d.need)) * 0.7 + (p.vhold.diplomacia || 0) / PP.HOLD_TURNS * 0.3,
          `${d.allies}/${d.need} alianças · ${d.wars} guerra(s) · reputação ${d.rep}` + (p.vhold.diplomacia ? ` · ${p.vhold.diplomacia}/${PP.HOLD_TURNS} turnos` : ''));
      }
      if (this.victoryEnabled('sobrevivencia') && this.opts.surviveTurns) {
        add('sobrevivencia', this.turn / this.opts.surviveTurns, `Turno ${this.turn}/${this.opts.surviveTurns}`);
      }
      return out;
    },

    // Quem está mais perto de uma vitória que não seja dominação (usado pela IA para frear o líder)
    victoryThreat() {
      let best = null;
      for (const p of this.players) {
        if (!p.alive) continue;
        for (const v of this.victoryProgress(p)) {
          if (v.id === 'dominacao' || v.id === 'pontos' || v.id === 'sobrevivencia') continue;
          if (!best || v.pct > best.pct) best = { pid: p.id, id: v.id, pct: v.pct };
        }
      }
      return best;
    },

    scoreExtras(p) {
      let s = 0;
      if (p.project) s += p.project.stage * 150;
      for (const t of this.tiles) if (t.owner === p.id && t.landmark === 'ruina_imperial') s += 150;
      return s;
    },
  };

  Object.assign(PP.Game.prototype, V);

  PP.victoryLabel = function (reason) {
    if (reason === 'derrota') return 'Derrota';
    const v = PP.VICTORIES[reason];
    return v ? 'Vitória ' + (reason === 'pontos' ? 'por pontos' : v.name === 'Dominação' ? 'por dominação' : v.name.toLowerCase()) : reason;
  };

  PP.registerSystem('victory', {
    configure(g) { if (g.opts.victories && g.opts.victories.pontos) g.opts.victory = 'pontos'; },
    init(g) { g.players.forEach(p => g.ensureVictory(p)); },
    load(g) { g.players.forEach(p => g.ensureVictory(p)); },
    newRound(g) { g.checkRoundVictories(); },
    checkVictory(g) { g.checkInstantVictories(); },
    wonder(g) { g.checkInstantVictories(); },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
