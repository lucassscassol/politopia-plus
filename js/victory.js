/* Chamas de Vardren — condições de vitória. Dominação (e Pontos) continuam no motor; aqui entram Científica,
   Econômica, Maravilhas, Territorial, Diplomática e Sobrevivência. Todas coexistem: a partida acaba na
   primeira que for cumprida. Partidas antigas (sem opts.victories) seguem só com as regras originais. */
(function (PP) {
  'use strict';

  PP.VICTORIES = {
    dominacao:     { name: 'Dominação',    icon: 'v_domination', desc: 'Elimine todas as outras tribos (ou mantenha todas como suas vassalas por 5 turnos).' },
    pontos:        { name: 'Pontos',       icon: 'v_score',      desc: 'Tenha a maior pontuação quando o limite de turnos acabar.' },
    ciencia:       { name: 'Científica',   icon: 'v_science',    desc: 'Com a árvore de tecnologias completa, conclua as 3 etapas do Grande Observatório numa cidade científica de nível 5 ou mais.' },
    economia:      { name: 'Econômica',    icon: 'v_economy',    desc: 'Acumule estrelas em rotas comerciais e mantenha ao menos uma rota com outra tribo.' },
    maravilhas:    { name: 'Maravilhas',   icon: 'v_wonders',    desc: 'Possua 6 das 8 maravilhas por 8 turnos seguidos (quem conquista a cidade leva a maravilha).' },
    territorio:    { name: 'Territorial',  icon: 'v_territory',  desc: 'Controle a maior parte das terras do mapa por 8 turnos seguidos (63% com 2 tribos, até 45% com 5 ou mais).' },
    diplomacia:    { name: 'Diplomática',  icon: 'v_diplomacy',  desc: 'Com 3+ tribos vivas: aliança com metade das outras, nenhuma guerra e reputação positiva por 5 turnos seguidos.' },
    sobrevivencia: { name: 'Sobrevivência', icon: 'v_survival',  desc: 'Resista até o turno limite do cenário.' },
  };
  PP.SCIENCE_PROJECT = { name: 'Grande Observatório', stages: [150, 250, 350], tech: 'educacao', minTechs: PP.TECHS.length, gap: 3, minLevel: 5 };
  PP.WONDER_HOLD = 8;
  PP.HOLD_TURNS = 5;
  PP.TERRITORY_HOLD = 8;
  PP.WONDERS_TO_WIN = 6;

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

    economicGoal() { return 1000 + 150 * Math.max(0, this.players.length - 2); },
    territoryGoal() { return Math.max(0.45, 0.75 - 0.06 * this.players.length); },

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
    // Custo das etapas cresce com o tamanho do mapa (mapas maiores = impérios maiores e partidas mais longas).
    // O expoente 1,5 acompanha a ciência dos impérios grandes nos mapas Colossal e Titânico; até 18×18 não muda nada.
    projectCost(stage) {
      const P = PP.SCIENCE_PROJECT;
      return Math.round(P.stages[Math.min(stage, P.stages.length - 1)] * Math.pow(Math.max(1, this.W / 18), 1.5) / 10) * 10;
    },

    projectCheck(p, c) {
      this.ensureVictory(p);
      const P = PP.SCIENCE_PROJECT;
      const stage = p.project.stage;
      const r = { ok: false, reason: '', cost: this.projectCost(stage), stage };
      if (!this.victoryEnabled('ciencia')) { r.reason = PP.t('Vitória científica desativada'); r.hidden = true; return r; }
      if (stage >= P.stages.length) { r.reason = PP.t('Concluído'); return r; }
      if (!c || c.owner !== p.id) { r.reason = PP.t('Cidade inválida'); return r; }
      if (c.spec !== 'ciencia') { r.reason = PP.t('Exige cidade {x}', { x: PP.SPECS.ciencia.name }); return r; }
      if (c.level < P.minLevel) { r.reason = PP.t('Exige cidade de nível {n}', { n: P.minLevel }); return r; }
      if (!this.has(p, P.tech)) { r.reason = PP.t('Requer {x}', { x: PP.TECH[P.tech].name }); r.locked = true; return r; }
      const n = Object.keys(p.techs).length;
      if (n < P.minTechs) { r.reason = PP.t('Requer a árvore completa ({n}/{m})', { n, m: P.minTechs }); r.locked = true; return r; }
      if (p.project.last >= 0 && this.turn - p.project.last < P.gap) { r.reason = PP.t('Próxima etapa no turno {n}', { n: p.project.last + P.gap }); return r; }
      if (p.science < r.cost) { r.reason = PP.t('Falta ciência'); return r; }
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
      this.log(PP.t('{p} concluiu a etapa {s}/{n} do {x} em {c}!', { p: p.name, s: p.project.stage, n: P.stages.length, x: P.name, c: c.name }), null);
      this.emit('project', { player: p.id, stage: p.project.stage, city: c });
      if (p.project.stage >= P.stages.length) this.finish(p.id, 'ciencia');
      return true;
    },

    // ------------------------------------------------------------ Verificações
    checkInstantVictories() { /* todas as vitórias alternativas pedem tempo de manutenção ou etapas: veja checkRoundVictories */ },

    checkRoundVictories() {
      if (this.over || !this.opts.victories) return;
      for (const p of this.players) {
        if (!p.alive) continue;
        this.ensureVictory(p);
        const h = p.vhold;
        if (this.victoryEnabled('territorio')) {
          const share = this.landShare(p.id);
          if (share >= this.territoryGoal()) {
            h.territorio = (h.territorio || 0) + 1;
            if (h.territorio === 1) this.log(PP.t('{p} controla {n}% das terras! Vitória territorial em {m} turnos.', { p: p.name, n: Math.round(share * 100), m: PP.TERRITORY_HOLD }), null);
            if (h.territorio >= PP.TERRITORY_HOLD) { this.finish(p.id, 'territorio'); return; }
          } else h.territorio = 0;
        }
        if (this.victoryEnabled('maravilhas')) {
          if (this.wondersOwned(p.id) >= PP.WONDERS_TO_WIN) {
            h.maravilhas = (h.maravilhas || 0) + 1;
            if (h.maravilhas === 1) this.log(PP.t('{p} reúne {n} maravilhas! Vitória em {m} turnos se ninguém tomar as cidades delas.', { p: p.name, n: PP.WONDERS_TO_WIN, m: PP.WONDER_HOLD }), null);
            if (h.maravilhas >= PP.WONDER_HOLD) { this.finish(p.id, 'maravilhas'); return; }
          } else h.maravilhas = 0;
        }
        if (this.victoryEnabled('diplomacia')) {
          if (this.diplomaticStanding(p.id).ok) {
            h.diplomacia = (h.diplomacia || 0) + 1;
            if (h.diplomacia === 1) this.log(PP.t('{p} lidera uma grande aliança! Vitória diplomática em {m} turnos.', { p: p.name, m: PP.HOLD_TURNS }), null);
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
      add('dominacao', 1 - (alive.length - 1) / Math.max(1, this.players.length - 1), PP.t('{n} rival(is) restante(s)', { n: alive.length - 1 }));
      if (this.victoryEnabled('pontos')) {
        const best = alive.slice().sort((a, b) => this.score(b) - this.score(a))[0];
        add('pontos', this.turn / this.opts.turnLimit, PP.t('Turno {n}/{m} · líder: {p}', { n: this.turn, m: this.opts.turnLimit, p: best ? best.name : '—' }));
      }
      if (this.victoryEnabled('ciencia')) {
        const P = PP.SCIENCE_PROJECT, n = Object.keys(p.techs).length;
        const pre = Math.min(1, n / P.minTechs);
        add('ciencia', p.project.stage ? 0.4 + 0.6 * p.project.stage / P.stages.length : pre * 0.4,
          p.project.stage ? PP.t('{x}: etapa {s}/{n}', { x: P.name, s: p.project.stage, n: P.stages.length }) : PP.t('{n}/{m} tecnologias', { n: Math.min(n, P.minTechs), m: P.minTechs }));
      }
      if (this.victoryEnabled('economia')) {
        const goal = this.economicGoal(), cur = p.stats.tradeIncome || 0;
        add('economia', cur / goal, PP.t('{n}/{m}★ em rotas', { n: cur, m: goal }) + (this.hasForeignRoute(p.id) ? '' : ' · ' + PP.t('falta rota com outra tribo')));
      }
      if (this.victoryEnabled('maravilhas')) {
        const n = this.wondersOwned(p.id);
        add('maravilhas', Math.min(1, n / PP.WONDERS_TO_WIN) * 0.8 + (p.vhold.maravilhas || 0) / PP.WONDER_HOLD * 0.2,
          PP.t('{n}/{m} maravilhas', { n, m: PP.WONDERS_TO_WIN }) + (p.vhold.maravilhas ? ' · ' + PP.t('{n}/{m} turnos', { n: p.vhold.maravilhas, m: PP.WONDER_HOLD }) : ''));
      }
      if (this.victoryEnabled('territorio')) {
        const s = this.landShare(p.id), goal = this.territoryGoal();
        add('territorio', Math.min(1, s / goal) * 0.8 + (p.vhold.territorio || 0) / PP.TERRITORY_HOLD * 0.2,
          PP.t('{n}% de {m}% das terras', { n: Math.round(s * 100), m: Math.round(goal * 100) }) + (p.vhold.territorio ? ' · ' + PP.t('{n}/{m} turnos', { n: p.vhold.territorio, m: PP.TERRITORY_HOLD }) : ''));
      }
      if (this.victoryEnabled('diplomacia')) {
        const d = this.diplomaticStanding(p.id);
        add('diplomacia', (Math.min(d.allies, d.need) / Math.max(1, d.need)) * 0.7 + (p.vhold.diplomacia || 0) / PP.HOLD_TURNS * 0.3,
          PP.t('{a}/{b} alianças · {w} guerra(s) · reputação {r}', { a: d.allies, b: d.need, w: d.wars, r: d.rep }) + (p.vhold.diplomacia ? ' · ' + PP.t('{n}/{m} turnos', { n: p.vhold.diplomacia, m: PP.HOLD_TURNS }) : ''));
      }
      if (this.victoryEnabled('sobrevivencia') && this.opts.surviveTurns) {
        add('sobrevivencia', this.turn / this.opts.surviveTurns, PP.t('Turno {n}/{m}', { n: this.turn, m: this.opts.surviveTurns }));
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
    const L = { derrota: 'Derrota', dominacao: 'Vitória por dominação', pontos: 'Vitória por pontos', ciencia: 'Vitória científica', economia: 'Vitória econômica',
      maravilhas: 'Vitória por maravilhas', territorio: 'Vitória territorial', diplomacia: 'Vitória diplomática', sobrevivencia: 'Vitória por sobrevivência' };
    return L[reason] ? PP.t(L[reason]) : reason;
  };

  PP.registerSystem('victory', {
    configure(g) { if (g.opts.victories && g.opts.victories.pontos) g.opts.victory = 'pontos'; },
    init(g) { g.players.forEach(p => g.ensureVictory(p)); },
    load(g) { g.players.forEach(p => g.ensureVictory(p)); },
    newRound(g) { g.checkRoundVictories(); },
    // quem conquista uma cidade leva as maravilhas do território dela
    capture(g, c, old, p) {
      for (const t of g.tiles) if (t.cityId === c.id && t.wonder && g.wonders[t.wonder] === old.id) g.wonders[t.wonder] = p.id;
    },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
