/* Chamas de Vardren — cenários. Cada cenário ajusta as opções antes de gerar o mapa (configure) e as condições
   iniciais depois de criar as tribos (init). A "Partida normal" não muda nada. */
(function (PP) {
  'use strict';

  const grant = (p, list) => { for (const t of list) p.techs[t] = true; };

  PP.SCENARIOS = {
    normal: {
      name: 'Partida normal', icon: 'ui_objectives',
      desc: 'As regras de sempre, com as opções que você escolher.',
    },
    dois_continentes: {
      name: 'Guerra dos Dois Continentes', icon: 'lm_estreito', minPlayers: 2,
      desc: 'Dois continentes separados por um canal, com as tribos divididas entre eles. Todos começam com Pesca: a guerra se decide no mar.',
      configure(o) { o.mapType = 'dois_continentes'; },
      init(g) { for (const p of g.players) grant(p, ['pesca']); },
    },
    ilhas: {
      name: 'Ilhas', icon: 'lm_porto_natural', minPlayers: 2,
      desc: 'Cada tribo começa em sua própria ilha, com Pesca e Navegação. Portos, Transportes e Fragatas são indispensáveis.',
      configure(o) { o.mapType = 'ilhas'; },
      init(g) { for (const p of g.players) grant(p, ['pesca', 'navegacao']); },
    },
    mundo_hostil: {
      name: 'Mundo Hostil', icon: 'ev_winter', minPlayers: 2,
      desc: 'Eventos mundiais a cada 4–7 turnos, com mais secas, invernos, pragas e tempestades. Mais ruínas espalhadas pelo mapa.',
      configure(o) { o.events = true; },
      init(g) {
        const extra = Math.round(g.W * g.H / 90);
        const cands = g.rng.shuffle(g.tiles.filter(t => !g.isWater(t) && !t.res && !t.village && !t.city && !t.ruin && !t.landmark && t.terrain !== 'mountain' && t.owner === -1));
        const types = Object.keys(PP.RUIN_TYPES);
        let n = 0;
        for (const t of cands) {
          if (n >= extra) break;
          if (g.tiles.some(o => (o.ruin || o.village || o.city) && Math.max(Math.abs(o.x - t.x), Math.abs(o.y - t.y)) < 3)) continue;
          t.ruin = true; t.ruinType = g.rng.pick(types); n++;
        }
        g.ensureEvents();
        g.events.next = 6;
      },
    },
    guerra_total: {
      name: 'Guerra Total', icon: 'v_domination', minPlayers: 2,
      desc: 'Ninguém pode assinar a paz antes do turno 20. Todos começam com Estratégia e +5★. As IAs são mais agressivas.',
      configure(o) { o.diploLockUntil = 20; },
      init(g) {
        for (const p of g.players) {
          grant(p, ['organizacao', 'estrategia']);
          p.stars += 5;
          if (!p.human) p.ai.aggr += 0.3;
        }
      },
    },
    era_ferro: {
      name: 'Era do Ferro', icon: 'u_swordsman', minPlayers: 2,
      desc: 'Todos começam com Escalada, Mineração e Forja, e +10★. O minério perto da capital decide quem arma os primeiros Espadachins.',
      init(g) {
        for (const p of g.players) { grant(p, ['escalada', 'mineracao', 'forja']); p.stars += 10; }
      },
    },
    corrida_cientifica: {
      name: 'Corrida Científica', icon: 'v_science', minPlayers: 2,
      desc: 'Só valem a vitória Científica (Grande Observatório) e a dominação. Todos começam com +10⚗ e Escrita.',
      configure(o) { o.victories = { dominacao: true, ciencia: true }; o.victory = 'dominacao'; },
      init(g) { for (const p of g.players) { grant(p, ['organizacao', 'escrita']); p.science += 10; } },
    },
    ultimo_reino: {
      name: 'O Último Reino', icon: 'v_survival', minPlayers: 3, needsHuman: true,
      desc: 'Você contra todas as outras tribos, aliadas entre si. Resista até o turno 40 (vitória por sobrevivência) ou vença por dominação. Sua capital começa com Muralhas, dois guerreiros extras e você recebe +10★.',
      configure(o) {
        o.victories = Object.assign({}, o.victories || {}, { dominacao: true, sobrevivencia: true });
        o.surviveTurns = 40;
        o.diploLockUntil = 9999;
      },
      init(g) {
        const hero = g.players.find(p => p.human);
        const foes = g.players.filter(p => p !== hero);
        for (const a of foes) for (const b of foes) {
          if (a.id >= b.id) continue;
          a.met[b.id] = true; b.met[a.id] = true;
          g.setRel(a.id, b.id, 'alliance');
        }
        if (hero) {
          hero.stars += 10;
          const cap = g.cityMap[hero.capital];
          if (cap) {
            cap.buildings.walls = true;
            // dois guerreiros extras para segurar o primeiro ataque
            const spots = g.neighbors(cap).filter(n => !g.isWater(n) && n.terrain !== 'mountain' && !g.uGrid[n.y * g.W + n.x] && !n.village && !n.city);
            for (const s of spots.slice(0, 2)) g.createUnit('warrior', hero.id, s.x, s.y, null);
          }
          for (const f of foes) { f.met[hero.id] = true; hero.met[f.id] = true; }
        }
      },
    },
  };

  PP.scenarioCheck = function (id, players) {
    const s = PP.SCENARIOS[id];
    if (!s) return { ok: false, reason: PP.t('Cenário desconhecido') };
    if (s.minPlayers && players.length < s.minPlayers) return { ok: false, reason: PP.t('Requer {n} tribos', { n: s.minPlayers }) };
    if (s.needsHuman && players.filter(p => p.human).length !== 1) return { ok: false, reason: PP.t('Requer exatamente 1 jogador humano') };
    return { ok: true };
  };

  PP.registerSystem('scenarios', {
    configure(g) {
      const s = PP.SCENARIOS[g.opts.scenario];
      if (!s) { g.opts.scenario = 'normal'; return; }
      if (!PP.scenarioCheck(g.opts.scenario, g.opts.players).ok) { g.opts.scenario = 'normal'; return; }
      if (s.configure) s.configure(g.opts);
    },
    init(g) {
      const s = PP.SCENARIOS[g.opts.scenario];
      if (s && s.init) s.init(g);
    },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
