// Simulação headless: partidas IA x IA para validar regras e IA.
// Uso: node tests/sim.js [partidas] [turnos]
require('./load.js');
const PP = globalThis.PP;

async function play(seed, opts) {
  const tribes = PP.TRIBE_IDS.slice();
  const rng = new PP.RNG(seed);
  rng.shuffle(tribes);
  const n = opts.players;
  const g = new PP.Game().setup({
    seed, size: opts.size, mapType: opts.mapType, difficulty: opts.difficulty || 'normal', victory: 'dominacao',
    victories: opts.victories, scenario: opts.scenario,
    players: tribes.slice(0, n).map(t => ({ tribe: t, human: false })),
  });
  const t0 = Date.now();
  while (!g.over && g.turn <= opts.turns) {
    await PP.AI.takeTurn(g);
    if (g.over) break;
    g.endTurn();
    if (g.turn === 10 && g.current === 0) {
      // teste de ida e volta do salvamento
      const json = JSON.stringify(g.toJSON());
      const g2 = PP.Game.fromJSON(JSON.parse(json));
      const j2 = JSON.stringify(g2.toJSON());
      if (json !== j2) throw new Error('save/load divergente');
    }
    validate(g);
  }
  const ms = Date.now() - t0;
  const rows = g.players.map(p => {
    const cities = g.citiesOf(p.id);
    return `${p.name.padEnd(8)} ${p.alive ? 'vivo ' : 'morto'} cid=${String(cities.length).padStart(2)} lvl=${String(cities.reduce((s, c) => s + c.level, 0)).padStart(3)} un=${String(g.unitsOf(p.id).length).padStart(2)} tec=${String(Object.keys(p.techs).length).padStart(2)} ★=${String(p.stars).padStart(3)} ⚗=${String(p.science).padStart(3)} pts=${g.score(p)} k=${p.stats.kills}`;
  });
  return { g, ms, rows };
}

function validate(g) {
  for (const u of g.units) {
    if (g.uGrid[u.y * g.W + u.x] !== u) throw new Error('grid inconsistente para unidade ' + u.id);
    if (u.hp <= 0) throw new Error('unidade com hp<=0 viva');
    if (!g.players[u.owner].alive) throw new Error('unidade de jogador morto');
  }
  let n = 0;
  for (const x of g.uGrid) if (x) n++;
  if (n !== g.units.length) throw new Error('grid com unidades fantasmas');
  for (const c of g.cities) {
    const t = g.tile(c.x, c.y);
    if (t.city !== c.id || t.owner !== c.owner) throw new Error('cidade inconsistente ' + c.name);
  }
  for (const p of g.players) if (p.stars < 0 || p.science < 0) throw new Error('recurso negativo ' + p.name);
  // sistemas estendidos
  const ids = new Set();
  for (const u of g.units) {
    if (ids.has(u.id)) throw new Error('unidade duplicada ' + u.id);
    ids.add(u.id);
    if (PP.UNITS[u.type].naval && !g.isWater(g.tileAt(u))) throw new Error('navio em terra ' + u.id);
    for (const x of u.cargo || []) {
      if (ids.has(x.id)) throw new Error('carga duplicada ' + x.id);
      ids.add(x.id);
      if (x.owner !== u.owner || x.x !== u.x || x.y !== u.y || x.dead) throw new Error('carga inconsistente ' + x.id);
      if (g.uGrid[x.y * g.W + x.x] === x) throw new Error('carga na grade ' + x.id);
    }
  }
  for (const r of g.routes || []) {
    if (!g.cityMap[r.a] || !g.cityMap[r.b]) throw new Error('rota com cidade inexistente ' + r.id);
    if (!g.players[r.owner].alive) throw new Error('rota de jogador morto ' + r.id);
  }
  for (const t of g.tiles) if (t.fort && (!g.players[t.fort.owner] || !g.players[t.fort.owner].alive)) throw new Error('forte sem dono vivo');
  for (const c of g.cities) if (c.loyalty < 0 || c.loyalty > 100 || c.occupied < 0) throw new Error('lealdade inválida ' + c.name);
  for (const p of g.players) if (!p.human && p.pendingRuin) throw new Error('IA com ruína pendente');
}

(async () => {
  const games = +(process.argv[2] || 4), turns = +(process.argv[3] || 60);
  const types = Object.keys(PP.MAP_TYPES), sizes = [14, 18, 22];
  const winners = {};
  for (let i = 0; i < games; i++) {
    // metade das partidas usa as regras originais (só dominação); a outra metade liga todas as vitórias e cenários
    const all = i % 2 === 1;
    const scen = Object.keys(PP.SCENARIOS);
    const opts = { size: sizes[i % sizes.length], mapType: types[i % types.length], players: 2 + (i % 5), turns,
      victories: all ? { dominacao: true, ciencia: true, economia: true, maravilhas: true, territorio: true, diplomacia: true } : undefined,
      scenario: all ? scen[(i >> 1) % scen.length] : 'normal' };
    if (opts.scenario === 'ultimo_reino') opts.scenario = 'mundo_hostil';
    const seed = 1000 + i * 7919;
    const { g, ms, rows } = await play(seed, opts);
    console.log(`\n# jogo ${i} seed=${seed} ${opts.scenario} ${opts.mapType} ${opts.size}x${opts.size} ${opts.players}j -> turno ${g.turn} ${g.over ? 'FIM (' + g.endReason + ') vencedor=' + g.players[g.winner].name : ''} (${ms}ms)`);
    rows.forEach(r => console.log('  ' + r));
    if (g.over) winners[g.players[g.winner].tribe] = (winners[g.players[g.winner].tribe] || 0) + 1;
  }
  console.log('\nvitórias:', winners);
})().catch(e => { console.error(e); process.exit(1); });
