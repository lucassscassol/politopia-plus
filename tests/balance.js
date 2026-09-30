// Simulações de balanceamento: partidas IA × IA com todas as vitórias ligadas.
// Uso: node tests/balance.js [partidas] [turnos]
const PP = require('./load.js');

const ALL = { dominacao: true, ciencia: true, economia: true, maravilhas: true, territorio: true, diplomacia: true };

async function one(i, turns) {
  const types = ['continentes', 'pangeia', 'arquipelago', 'lagos'];
  const sizes = [14, 18, 22, 26];
  const diffs = ['facil', 'normal', 'dificil', 'insano'];
  const scen = ['normal', 'normal', 'normal', 'dois_continentes', 'ilhas', 'mundo_hostil', 'guerra_total', 'era_ferro', 'corrida_cientifica'];
  const seed = 5000 + i * 104729;
  const rng = new PP.RNG(seed);
  const tribes = rng.shuffle(PP.TRIBE_IDS.slice());
  const n = 2 + (i % 5);
  const opts = {
    seed, size: sizes[i % sizes.length], mapType: types[(i >> 1) % types.length], difficulty: diffs[i % diffs.length],
    victories: Object.assign({}, ALL), scenario: scen[i % scen.length],
    players: tribes.slice(0, n).map(t => ({ tribe: t, human: false })),
  };
  const g = new PP.Game().setup(opts);
  const t0 = Date.now();
  let turnsPlayed = 0, worst = 0;
  while (!g.over && g.turn <= turns) {
    const a = Date.now();
    await PP.AI.takeTurn(g);
    worst = Math.max(worst, Date.now() - a);
    if (g.over) break;
    g.endTurn();
    turnsPlayed++;
  }
  const strat = {};
  for (const p of g.players) if (p.ai.strategy) strat[p.ai.strategy] = (strat[p.ai.strategy] || 0) + 1;
  return {
    i, opts: `${opts.scenario}/${opts.mapType}/${opts.size}/${n}j/${opts.difficulty}`, over: g.over, reason: g.endReason, turn: g.turn,
    winner: g.winner != null && g.winner >= 0 ? g.players[g.winner].tribe : null,
    ms: Date.now() - t0, perTurn: Math.round((Date.now() - t0) / Math.max(1, turnsPlayed)), worst, strat,
    routes: (g.routes || []).length, forts: g.tiles.filter(t => t.fort).length,
    events: g.events ? g.events.history.length : 0,
    wars: g.players.reduce((s, p) => s + p.stats.warsDeclared, 0), treaties: g.players.reduce((s, p) => s + p.stats.treaties, 0),
    spies: g.players.reduce((s, p) => s + (p.stats.spyMissions || 0), 0), abilities: g.players.reduce((s, p) => s + (p.stats.abilities || 0), 0),
    pillage: g.players.reduce((s, p) => s + (p.stats.pillaged || 0), 0),
  };
}

(async () => {
  const games = +(process.argv[2] || 12), turns = +(process.argv[3] || 90);
  const reasons = {}, winners = {};
  let sumTurn = 0, ended = 0;
  for (let i = 0; i < games; i++) {
    const r = await one(i, turns);
    console.log(`#${r.i} ${r.opts} -> ${r.over ? r.reason + ' T' + r.turn + ' ' + r.winner : 'sem fim T' + r.turn} | ${r.ms}ms (${r.perTurn}ms/turno, pior ${r.worst}ms) | objetivos ${JSON.stringify(r.strat)} | rotas ${r.routes} fortes ${r.forts} eventos ${r.events} guerras ${r.wars} tratados ${r.treaties} espionagem ${r.spies} habilidades ${r.abilities} saques ${r.pillage}`);
    if (r.over) { reasons[r.reason] = (reasons[r.reason] || 0) + 1; winners[r.winner] = (winners[r.winner] || 0) + 1; sumTurn += r.turn; ended++; }
  }
  console.log('\ncondições de vitória:', JSON.stringify(reasons));
  console.log('tribos vencedoras:', JSON.stringify(winners));
  console.log('turno médio de fim:', ended ? Math.round(sumTurn / ended) : '-');
})().catch(e => { console.error(e); process.exit(1); });
