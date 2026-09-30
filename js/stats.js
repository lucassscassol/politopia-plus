/* Politopia+ — estatísticas completas da partida (tela final, conquistas e replay). */
(function (PP) {
  'use strict';

  const STAT_DEFAULTS = {
    kills: 0, losses: 0, captured: 0, built: 0, starsEarned: 0, sciEarned: 0, tradeIncome: 0, unitsTrained: 0,
    citiesFounded: 0, citiesLost: 0, tilesConquered: 0, tilesLost: 0, warsDeclared: 0, warsWon: 0, treaties: 0,
    wondersBuilt: 0, turnsFirst: 0, maxTerritory: 0, pillaged: 0, spyMissions: 0, spiesCaught: 0, ruins: 0,
    forts: 0, specs: 0, integrated: 0, revolts: 0, abilities: 0,
  };

  const pairKey = (a, b) => (a < b ? a + ':' + b : b + ':' + a);

  const St = {
    ensureStats(p) {
      if (!p.stats) p.stats = {};
      for (const k in STAT_DEFAULTS) if (p.stats[k] == null) p.stats[k] = STAT_DEFAULTS[k];
    },

    // Registro de guerras por par de tribos: quem tomou mais cidades de quem
    warRecord(a, b) {
      this.wars = this.wars || {};
      const k = pairKey(a, b);
      if (!this.wars[k]) this.wars[k] = { start: this.turn, gains: {} };
      return this.wars[k];
    },

    closeWar(a, b, loser) {
      if (!this.wars) return;
      const k = pairKey(a, b);
      const w = this.wars[k];
      if (!w) return;
      delete this.wars[k];
      let winner = null;
      if (loser != null) winner = loser === a ? b : a;
      else {
        const ga = w.gains[a] || 0, gb = w.gains[b] || 0;
        if (ga > gb) winner = a; else if (gb > ga) winner = b;
      }
      if (winner != null && this.players[winner]) this.players[winner].stats.warsWon++;
    },

    finalStats() {
      return this.players.map(p => {
        this.ensureStats(p);
        const cities = this.citiesOf(p.id);
        let terr = 0;
        for (const t of this.tiles) if (t.owner === p.id) terr++;
        const s = p.stats;
        return {
          id: p.id, name: p.name, tribe: p.tribe, color: p.color, alive: p.alive, human: p.human,
          score: this.score(p), cities: cities.length, units: this.unitsOf(p.id).length, techs: Object.keys(p.techs).length,
          territory: terr, maxTerritory: s.maxTerritory, tilesConquered: s.tilesConquered, tilesLost: s.tilesLost,
          starsEarned: s.starsEarned, sciEarned: s.sciEarned, tradeIncome: s.tradeIncome,
          unitsTrained: s.unitsTrained, unitsLost: s.losses, kills: s.kills,
          citiesFounded: s.citiesFounded, citiesConquered: s.captured, citiesLost: s.citiesLost,
          warsDeclared: s.warsDeclared, warsWon: s.warsWon, treaties: s.treaties, wonders: s.wondersBuilt,
          turnsFirst: s.turnsFirst, pillaged: s.pillaged, spyMissions: s.spyMissions, ruins: s.ruins,
          winner: this.winner === p.id,
        };
      });
    },
  };

  Object.assign(PP.Game.prototype, St);

  PP.STAT_LABELS = [
    ['score', 'Pontuação'], ['cities', 'Cidades'], ['units', 'Unidades'], ['techs', 'Tecnologias'], ['territory', 'Território (casas)'],
    ['maxTerritory', 'Maior território'], ['tilesConquered', 'Território conquistado'], ['tilesLost', 'Território perdido'],
    ['starsEarned', 'Estrelas geradas'], ['sciEarned', 'Ciência gerada'], ['tradeIncome', 'Renda de comércio'],
    ['unitsTrained', 'Unidades produzidas'], ['unitsLost', 'Unidades perdidas'], ['kills', 'Inimigos derrotados'],
    ['citiesFounded', 'Cidades fundadas'], ['citiesConquered', 'Cidades conquistadas'], ['citiesLost', 'Cidades perdidas'],
    ['warsDeclared', 'Guerras iniciadas'], ['warsWon', 'Guerras vencidas'], ['treaties', 'Tratados assinados'],
    ['wonders', 'Maravilhas'], ['turnsFirst', 'Turnos em 1º lugar'], ['pillaged', 'Saques'], ['spyMissions', 'Missões de espionagem'], ['ruins', 'Ruínas exploradas'],
  ];

  PP.registerSystem('stats', {
    init(g) { g.players.forEach(p => g.ensureStats(p)); g.wars = {}; },
    load(g, sys) { g.players.forEach(p => g.ensureStats(p)); g.wars = sys.wars || {}; },
    save(g, sys) { sys.wars = g.wars || {}; },
    income(g, p, inc) { p.stats.starsEarned += inc.stars; p.stats.sciEarned += inc.sci; },
    trained(g, u) { g.players[u.owner].stats.unitsTrained++; },
    found(g, c, p) { p.stats.citiesFounded++; },
    capture(g, c, old, p) {
      let n = 0;
      for (const t of g.tiles) if (t.cityId === c.id) n++;
      p.stats.tilesConquered += n;
      old.stats.citiesLost++; old.stats.tilesLost += n;
      const w = g.warRecord(p.id, old.id);
      w.gains[p.id] = (w.gains[p.id] || 0) + 1;
    },
    war(g, a, b) { g.players[a].stats.warsDeclared++; g.warRecord(a, b); },
    treaty(g, a, b, type) {
      g.players[a].stats.treaties++; g.players[b].stats.treaties++;
      if (type === 'peace') g.closeWar(a, b);
    },
    wonder(g, p) { p.stats.wondersBuilt++; },
    ruin(g, p) { p.stats.ruins++; },
    eliminated(g, p) {
      for (const q of g.players) if (q.id !== p.id && g.wars && g.wars[pairKey(p.id, q.id)]) g.closeWar(p.id, q.id, p.id);
    },
    newRound(g) {
      let best = null, bs = -1;
      for (const p of g.players) {
        if (!p.alive) continue;
        let terr = 0;
        for (const t of g.tiles) if (t.owner === p.id) terr++;
        if (terr > p.stats.maxTerritory) p.stats.maxTerritory = terr;
        const s = g.score(p);
        if (s > bs) { bs = s; best = p; }
      }
      if (best) best.stats.turnsFirst++;
    },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
