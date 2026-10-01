/* Chamas de Vardren — conquistas. Cada conquista mede o progresso de um jogador humano; as desbloqueadas ficam
   gravadas na partida (g.achievements) e a interface também guarda um histórico no aparelho. */
(function (PP) {
  'use strict';
  const UN = PP.UNITS;
  const count = (arr, fn) => { let n = 0; for (const x of arr) if (fn(x)) n++; return n; };

  PP.ACHIEVEMENTS = [
    { id: 'fundador',    name: 'Fundador',             desc: 'Funde uma cidade.', max: 1, v: (g, p) => p.stats.citiesFounded },
    { id: 'imperio',     name: 'Império',              desc: 'Tenha 8 cidades ao mesmo tempo.', max: 8, v: (g, p) => g.citiesOf(p.id).length },
    { id: 'conquistador', name: 'Conquistador',        desc: 'Conquiste 3 cidades.', max: 3, v: (g, p) => p.stats.captured },
    { id: 'metropole',   name: 'Metrópole',            desc: 'Transforme uma cidade em Metrópole.', max: 1, v: (g, p) => count(g.citiesOf(p.id), c => c.metropolis) },
    { id: 'especialista', name: 'Especialista',        desc: 'Especialize 4 cidades.', max: 4, v: (g, p) => count(g.citiesOf(p.id), c => c.spec) },
    { id: 'estudioso',   name: 'Estudioso',            desc: 'Pesquise 15 tecnologias.', max: 15, v: (g, p) => Object.keys(p.techs).length },
    { id: 'sabio',       name: 'Sábio',                desc: 'Pesquise a árvore inteira.', max: PP.TECHS.length, v: (g, p) => Object.keys(p.techs).length },
    { id: 'construtor',  name: 'Construtor de Maravilhas', desc: 'Construa uma maravilha.', max: 1, v: (g, p) => p.stats.wondersBuilt },
    { id: 'colecionador', name: 'Colecionador',        desc: 'Possua 3 maravilhas.', max: 3, v: (g, p) => g.wondersOwned ? g.wondersOwned(p.id) : 0 },
    { id: 'mercador',    name: 'Mercador',             desc: 'Mantenha 3 rotas comerciais ativas.', max: 3, v: (g, p) => count(g.routes || [], r => r.active && r.owner === p.id) },
    { id: 'magnata',     name: 'Magnata',              desc: 'Acumule 100★ em rotas comerciais.', max: 100, v: (g, p) => p.stats.tradeIncome },
    { id: 'diplomata',   name: 'Diplomata',            desc: 'Tenha 2 alianças ao mesmo tempo.', max: 2, v: (g, p) => (g.alliesOf ? g.alliesOf(p.id).length : 0) },
    { id: 'pacificador', name: 'Pacificador',          desc: 'Assine 3 tratados.', max: 3, v: (g, p) => p.stats.treaties },
    { id: 'general',     name: 'General',              desc: 'Derrote 30 unidades inimigas.', max: 30, v: (g, p) => p.stats.kills },
    { id: 'elite',       name: 'Tropa de Elite',       desc: 'Tenha uma unidade de Elite.', max: 1, v: (g, p) => count(g.units, u => u.owner === p.id && g.rank(u) >= 2) },
    { id: 'almirante',   name: 'Almirante',            desc: 'Tenha 3 navios de guerra (Escuna, Fragata ou Couraçado).', max: 3, v: (g, p) => count(g.units, u => u.owner === p.id && UN[u.type].naval && !UN[u.type].cargo) },
    { id: 'sombra',      name: 'Sombra',               desc: 'Complete 5 missões de espionagem.', max: 5, v: (g, p) => p.stats.spyMissions },
    { id: 'arqueologo',  name: 'Arqueólogo',           desc: 'Explore 5 ruínas.', max: 5, v: (g, p) => p.stats.ruins },
    { id: 'muralha',     name: 'Senhor das Fronteiras', desc: 'Erga 3 fortificações.', max: 3, v: (g, p) => p.stats.forts },
    { id: 'tatico',      name: 'Tático',               desc: 'Use habilidades ativas 10 vezes.', max: 10, v: (g, p) => p.stats.abilities },
    { id: 'integrador',  name: 'Integrador',           desc: 'Integre uma cidade conquistada.', max: 1, v: (g, p) => p.stats.integrated },
    { id: 'vitoria',     name: 'Vitorioso',            desc: 'Vença uma partida.', max: 1, v: (g, p) => (g.over && g.winner === p.id && g.endReason !== 'derrota' ? 1 : 0) },
    { id: 'alternativa', name: 'Outros Caminhos',      desc: 'Vença sem ser por dominação nem pontos.', max: 1,
      v: (g, p) => (g.over && g.winner === p.id && ['dominacao', 'pontos', 'derrota'].indexOf(g.endReason) < 0 ? 1 : 0) },
  ];
  PP.ACHIEVEMENT = {};
  PP.ACHIEVEMENTS.forEach(a => { PP.ACHIEVEMENT[a.id] = a; });

  const A = {
    achievementProgress(p) {
      const got = (this.achievements && this.achievements[p.id]) || {};
      return PP.ACHIEVEMENTS.map(a => {
        let cur = 0;
        try { cur = a.v(this, p) || 0; } catch (e) { cur = 0; }
        return { id: a.id, name: a.name, desc: a.desc, max: a.max, cur: Math.min(a.max, cur), unlocked: got[a.id] != null, turn: got[a.id] };
      });
    },

    checkAchievements() {
      this.achievements = this.achievements || {};
      for (const p of this.players) {
        if (!p.human) continue;
        const got = this.achievements[p.id] || (this.achievements[p.id] = {});
        for (const a of PP.ACHIEVEMENTS) {
          if (got[a.id] != null) continue;
          let cur = 0;
          try { cur = a.v(this, p) || 0; } catch (e) { cur = 0; }
          if (cur >= a.max) {
            got[a.id] = this.turn;
            this.emit('achievement', { player: p.id, id: a.id, name: a.name, tribe: p.tribe });
          }
        }
      }
    },
  };

  Object.assign(PP.Game.prototype, A);

  PP.registerSystem('achievements', {
    init(g) { g.achievements = {}; },
    load(g, sys) { g.achievements = sys.achievements || {}; },
    save(g, sys) { sys.achievements = g.achievements || {}; },
    endTurn(g, p) { if (p.human) g.checkAchievements(); },
    gameover(g) { g.checkAchievements(); },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
