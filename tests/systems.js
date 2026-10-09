// Testes dos sistemas do jogo (sem interface). Uso: node tests/systems.js
const PP = require('./load.js');
const fs = require('fs');
const path = require('path');
const UN = PP.UNITS;

let passed = 0, failed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; failures.push(msg); console.log('  ✗ ' + msg); }
}
const ONLY = process.env.ONLY;
async function test(name, fn) {
  if (ONLY && name.indexOf(ONLY) < 0) return;
  try { await fn(); console.log('✓ ' + name); } catch (e) { failed++; failures.push(name + ': ' + e.message); console.log('✗ ' + name + '\n   ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n   ')); }
}

// Partida "em branco": planície vazia, sem recursos, cidades e unidades nas posições pedidas
function blank(opts) {
  opts = Object.assign({ size: 14, players: 3, humans: [] }, opts);
  const tribes = opts.tribes || PP.TRIBE_IDS.slice(0, opts.players);
  const g = new PP.Game().setup({
    seed: opts.seed || 4242, size: opts.size, mapType: 'continentes', victories: opts.victories, scenario: opts.scenario,
    players: tribes.map((t, i) => ({ tribe: t, human: opts.humans.indexOf(i) >= 0 })),
  });
  for (const t of g.tiles) {
    Object.assign(t, { terrain: 'plains', res: null, imp: null, impLevel: 0, road: false, owner: -1, cityId: 0, city: 0, village: false, ruin: false,
      wonder: null, fort: null, landmark: null, pillaged: false, ruinType: null, shrine: -1 });
  }
  g.units = []; g.cities = []; g.routes = []; g.wonders = {};
  for (const p of g.players) { p.capital = null; p.met = {}; p.stars = 100; p.science = 100; p.proposals = []; p.pendingRewards = []; }
  g.rebuildIndex();
  return g;
}
function city(g, owner, x, y, capital) {
  const c = g.createCity(owner, x, y, !!capital);
  return c;
}
function unit(g, type, owner, x, y) {
  const u = g.createUnit(type, owner, x, y, null, true);
  return u;
}
function place(g, u, x, y) { g.uGrid[u.y * g.W + u.x] = null; u.x = x; u.y = y; g.uGrid[y * g.W + x] = u; g.realmReset && g.realmReset(); }
function meetAll(g) { for (const a of g.players) for (const b of g.players) if (a !== b) { a.met[b.id] = true; } }
function refresh(g) { g.invalidate(); g.players.forEach(p => g.updateVision(p)); }

(async () => {
  // ---------------------------------------------------------------- Diplomacia
  await test('diplomacia: tratados, traição, memória e reputação', () => {
    const g = blank({ players: 3 });
    city(g, 0, 2, 2, true); city(g, 1, 11, 2, true); city(g, 2, 6, 11, true);
    meetAll(g); refresh(g);
    g.makePeace(0, 1);
    ok(g.relState(0, 1) === 'peace', 'paz assinada');
    g.signNAP(0, 1, 10);
    ok(g.relState(0, 1) === 'nap' && g.players[0].rel[1].until === g.turn + 10, 'pacto com prazo');
    ok(!g.atWar(0, 1), 'pacto não é guerra');
    g.declareWar(0, 1);
    ok(g.relState(0, 1) === 'war', 'guerra declarada');
    ok(g.players[0].reputation === -2, 'romper pacto custa 2 de reputação (' + g.players[0].reputation + ')');
    ok(g.memorySummary(1, 0).some(m => m.kind === 'broke_treaty'), 'vítima lembra da quebra do tratado');
    ok(g.memorySummary(2, 0).some(m => m.kind === 'traitor_seen'), 'terceiros lembram da traição');
    const op = g.opinion(1, 0);
    ok(op < 0 && op >= -100, 'opinião negativa e limitada (' + op + ')');
    g.turn += 200;
    ok(g.memoryValue(g.players[1].memory[0][0]) === 0, 'memória decai com o tempo');
  });

  await test('diplomacia: aliança, visão compartilhada, chamado às armas, comércio e tributo', () => {
    const g = blank({ players: 3, humans: [1] });
    city(g, 0, 2, 2, true); city(g, 1, 11, 2, true); city(g, 2, 6, 11, true);
    meetAll(g);
    g.makePeace(0, 1); g.makePeace(0, 2); g.makePeace(1, 2);
    g.formAlliance(0, 1);
    refresh(g);
    ok(g.allied(0, 1), 'aliança formada');
    ok(g.players[0].visible[11 + 2 * g.W] === 1, 'aliado enxerga a capital do outro');
    g.declareWar(2, 0);
    ok(g.players[1].proposals.some(pr => pr.type === 'call_to_arms'), 'aliado humano recebe chamado às armas');
    const pr = g.players[1].proposals.find(x => x.type === 'call_to_arms');
    g.respondProposal(g.players[1], pr.id, true);
    ok(g.atWar(1, 2), 'aliado entrou na guerra');
    ok(g.memorySummary(0, 1).some(m => m.kind === 'joint_war'), 'memória de ajuda militar');
    // comércio de ferro
    const t = g.tile(11, 3); t.res = null; t.imp = 'mine'; g.invalidate();
    ok(g.ownsStrategic(g.players[1], 'iron'), 'jogador 1 tem ferro próprio');
    const deal = { give: { stars: 10 }, get: { iron: 1 } };
    ok(g.canPropose(0, 1, 'trade', deal).ok, 'troca válida');
    const res = g.propose(0, 1, 'trade', deal);
    ok(res === 'pending', 'proposta para humano fica pendente');
    g.respondProposal(g.players[1], g.players[1].proposals.find(x => x.type === 'trade').id, true);
    g.invalidate();
    ok(g.hasStrategic(g.players[0], 'iron'), 'ferro importado dá acesso');
    ok(!g.ownsStrategic(g.players[0], 'iron'), 'ferro importado não pode ser revendido');
    const s0 = g.players[0].stars, s1 = g.players[1].stars;
    g.payTribute(0, 1, 7);
    ok(g.players[0].stars === s0 - 7 && g.players[1].stars === s1 + 7, 'tributo transfere estrelas');
    g.leaveAlliance(0, 1);
    ok(!g.allied(0, 1) && g.relState(0, 1) === 'peace', 'saída da aliança volta à paz');
  });

  await test('diplomacia: IA avalia propostas e pacto expira cumprido', () => {
    const g = blank({ players: 2 });
    city(g, 0, 2, 2, true); city(g, 1, 11, 11, true);
    meetAll(g);
    g.makePeace(0, 1);
    g.players[1].ai.strategy = 'diplomacia';
    let accepted = 0;
    for (let i = 0; i < 30; i++) {
      g.players[0].lastAsk = {};
      const r = g.propose(0, 1, 'nap', { turns: 3 });
      if (r === 'accepted') { accepted++; break; }
    }
    ok(accepted === 1, 'IA diplomática aceita pacto de não agressão');
    const until = g.players[0].rel[1].until;
    while (g.turn < until) { g.endTurn(); if (g.over) break; }
    ok(g.relState(0, 1) === 'peace', 'pacto expirou e virou paz');
    ok(g.memorySummary(1, 0).some(m => m.kind === 'treaty_kept'), 'tratado cumprido fica na memória');
  });

  // ---------------------------------------------------------------- Cidades
  await test('cidades: especialização, custos e capacidade', () => {
    const g = blank({ players: 2 });
    const c = city(g, 0, 3, 3, true); city(g, 1, 11, 11, true);
    const p = g.players[0];
    c.level = 1;
    ok(!g.specCheck(p, c, 'militar').ok, 'nível 1 não pode especializar');
    c.level = 3;
    const cap = g.capacity(c);
    ok(g.setSpec(p, c, 'militar'), 'especializou como militar');
    ok(g.capacity(c) === cap + 2, 'militar +2 capacidade');
    ok(g.unitCostFor(p, c, 'warrior') === 1, 'recruta 1★ mais barato');
    const s = p.stars;
    ok(g.setSpec(p, c, 'ciencia') && p.stars === s - PP.SPEC_COST.change, 'trocar custa ' + PP.SPEC_COST.change);
    ok(!g.specCheck(p, c, 'porto').ok, 'cidade sem costa não pode ser portuária');
    const inc = g.cityIncome(c);
    ok(inc.notes.some(n => /Científica/.test(n)), 'renda mostra o bônus científico');
    c.buildings.observatory = true;
    ok(g.cityIncome(c).sci > inc.sci, 'observatório ativo soma ciência');
    g.setSpec(p, c, 'militar');
    ok(g.buildingCheck(p, c, 'observatory').done && !g.specActive(c, 'observatory'), 'observatório fica inativo fora da especialização');
  });

  await test('cidades: ocupação, integração e revolta', () => {
    const g = blank({ players: 2 });
    city(g, 0, 2, 2, true); const c1 = city(g, 1, 11, 11, true); const c2 = city(g, 1, 6, 6, false);
    meetAll(g);
    const u = unit(g, 'warrior', 0, 6, 6);
    u.moved = false; u.attacked = false;
    ok(g.capture(u), 'capturou cidade');
    ok(c2.owner === 0 && c2.occupied === PP.OCCUPATION_TURNS, 'cidade ocupada');
    ok(g.cityYieldMult(c2) === 0.5, 'produção pela metade durante a ocupação');
    const target = g.loyaltyTarget(c2);
    ok(target >= 0 && target <= 100, 'lealdade alvo válida');
    for (let i = 0; i < PP.OCCUPATION_TURNS; i++) g.updateLoyalty(g.players[0]);
    ok(c2.occupied === 0 && (c2.unrest || c2.founder === 0), 'ocupação termina em integração ou resistência');
    c2.unrest = true; c2.loyalty = 5; c2.founder = 1;
    g.units = g.units.filter(x => x !== u); g.rebuildIndex();
    let revolted = false;
    for (let i = 0; i < 40 && !revolted; i++) { g.updateLoyalty(g.players[0]); revolted = c2.owner === 1; if (!revolted) c2.loyalty = 5; }
    ok(revolted, 'cidade sem guarnição e com lealdade baixa acaba se revoltando');
    ok(c1.owner === 1, 'outras cidades intactas');
  });

  // ---------------------------------------------------------------- Economia
  await test('rotas: criação, bloqueio, saque e restauração', () => {
    const g = blank({ players: 2 });
    const a = city(g, 0, 2, 4, true), b = city(g, 0, 9, 4, false);
    city(g, 1, 11, 12, true);
    const p = g.players[0];
    p.techs.estradas = true; p.techs.comercio = true;
    for (let x = 3; x <= 8; x++) g.tile(x, 4).road = true;
    meetAll(g); refresh(g);
    const chk = g.routeCheck(p, a, b);
    ok(chk.ok && chk.kind === 'domestic', 'rota interna possível (' + chk.reason + ')');
    const r = g.createRoute(p, a, b);
    ok(r && r.active && r.path.length === 8, 'rota criada com caminho');
    const y = g.routeYield(r);
    ok(y.stars >= 2, 'rota rende estrelas (' + y.stars + ')');
    ok(g.income(p).lines.some(l => /Rotas/.test(l.label)), 'renda inclui rotas');
    const e = unit(g, 'warrior', 1, 6, 4);
    g.invalidate();
    g.validateRoutes(p);
    ok(!r.active, 'unidade inimiga na estrada bloqueia a rota');
    e.canAttack = true; e.attacked = false; e.owner = 1;
    const pc = g.pillageCheck(e);
    ok(pc.ok && pc.what === 'road', 'inimigo pode saquear a estrada');
    g.current = 1;
    ok(g.pillage(e) && !g.tile(6, 4).road, 'estrada destruída pelo saque');
    g.units = g.units.filter(x => x !== e); g.rebuildIndex();
    g.validateRoutes(p);
    ok(!r.active, 'sem estrada a rota continua interrompida');
    g.tile(6, 4).road = true; g.invalidate();
    g.validateRoutes(p);
    ok(r.active, 'estrada reconstruída restabelece a rota');
  });

  await test('recursos: acesso, importação, luxos, desconto e reparo', () => {
    const g = blank({ players: 2 });
    const c = city(g, 0, 4, 4, true); city(g, 1, 11, 11, true);
    const p = g.players[0];
    g.tile(5, 4).imp = 'mine'; g.tile(3, 4).imp = 'mine'; g.tile(4, 5).imp = 'gemmine'; g.tile(4, 3).imp = 'plantation';
    g.invalidate();
    const acc = g.resourceAccess(p);
    ok(acc.iron === 2 && acc.gems === 1 && acc.spices === 1, 'contagem de recursos');
    ok(g.luxuryCount(p) === 2, 'dois luxos diferentes');
    p.techs.forja = true;
    ok(g.unitCostFor(p, c, 'swordsman') === UN.swordsman.cost - 1, 'segunda fonte de ferro barateia o Espadachim');
    ok(g.wonderCostFor(p, 'pyramids') < PP.WONDERS.pyramids.cost, 'gemas barateiam maravilhas');
    g.tile(5, 4).pillaged = true; g.invalidate();
    ok(g.resourceAccess(p).iron === 1, 'mina saqueada não fornece ferro');
    const chk = g.tileActionCheck(p, g.tile(5, 4), 'repair');
    ok(chk.visible && chk.ok, 'reparo disponível');
    g.doTileAction(p, g.tile(5, 4), 'repair');
    ok(!g.tile(5, 4).pillaged && g.resourceAccess(p).iron === 2, 'reparo devolve a mina');
  });

  await test('logística: abastecimento e penalidade', () => {
    const g = blank({ players: 2, size: 18 });
    city(g, 0, 2, 2, true); city(g, 1, 15, 15, true);
    const u = unit(g, 'warrior', 0, 9, 9);
    const p = g.players[0];
    g.invalidate();
    ok(!g.isSupplied(u), 'longe de tudo: sem abastecimento');
    g.updateSupply(p); ok(g.supplyLevel(u) === 0, 'primeiro turno sem penalidade (tolerância)');
    g.updateSupply(p); ok(g.supplyLevel(u) === 1, 'segundo turno: sem suprimentos');
    g.updateSupply(p); g.updateSupply(p);
    ok(g.supplyLevel(u) === 2 && g.supplyMult(u) < 0.7, 'quarto turno: penalidade maior');
    g.tile(9, 10).fort = { type: 'outpost', owner: 0 }; g.invalidate();
    ok(g.isSupplied(u) && g.supplyLevel(u) === 0, 'posto avançado abastece na hora');
  });

  // ---------------------------------------------------------------- Fortificações e combate
  await test('fortificações: construir, defender e tomar', () => {
    const g = blank({ players: 2 });
    city(g, 0, 3, 3, true); city(g, 1, 11, 11, true);
    const p = g.players[0];
    p.techs.organizacao = true; p.techs.estrategia = true;
    const t = g.tile(4, 4);
    const chk = g.tileActionCheck(p, t, 'fort');
    ok(chk.ok, 'forte disponível no território (' + chk.reason + ')');
    ok(g.doTileAction(p, t, 'fort') && t.fort && t.fort.owner === 0, 'forte construído');
    ok(!g.tileActionCheck(p, g.tile(5, 4), 'tower').ok, 'fortificações vizinhas não são permitidas');
    const d = unit(g, 'warrior', 0, 4, 4);
    ok(g.defenseBonus(d, null) >= 2, 'forte dá defesa ×2');
    g.units = g.units.filter(x => x !== d); g.rebuildIndex();
    const e = unit(g, 'warrior', 1, 5, 5);
    g.current = 1; e.mp = 2; g.players[1].explored.fill(1);
    g.moveUnit(e, 4, 4);
    ok(t.fort.owner === 1, 'inimigo tomou o forte ao entrar');
  });

  await test('combate: flanco, linha de visão, terreno elevado e ataque de oportunidade', () => {
    const g = blank({ players: 2 });
    city(g, 0, 1, 1, true); city(g, 1, 12, 12, true);
    const a = unit(g, 'warrior', 0, 5, 5), ally = unit(g, 'warrior', 0, 7, 7), d = unit(g, 'warrior', 1, 6, 6);
    refresh(g);
    const pv = g.previewAttack(a, d);
    ok(pv.notes.some(n => /Flanco/.test(n)), 'flanco aparece na prévia');
    ok(pv.notes.some(n => /costas/.test(n)), 'ataque pelas costas com aliado do lado oposto');
    // linha de visão
    const g2 = blank({ players: 2 });
    city(g2, 0, 1, 1, true); city(g2, 1, 12, 12, true);
    g2.players[0].techs.arco = true;
    const ar = unit(g2, 'archer', 0, 4, 4), tg = unit(g2, 'warrior', 1, 6, 4);
    g2.tile(5, 4).terrain = 'mountain'; g2.tile(5, 3).terrain = 'mountain'; g2.tile(5, 5).terrain = 'mountain';
    g2.players[1].explored.fill(1); g2.players[0].explored.fill(1); refresh(g2);
    g2.players[0].visible[6 + 4 * g2.W] = 1;
    ok(!g2.canAttackUnit(ar, tg), 'montanha bloqueia o tiro');
    g2.tile(5, 4).terrain = 'plains';
    ok(g2.canAttackUnit(ar, tg), 'sem a montanha o tiro passa');
    g2.tile(4, 4).terrain = 'hills';
    ok(g2.previewAttack(ar, tg).notes.some(n => /elevado/.test(n)), 'terreno elevado bonifica tiro');
    // oportunidade
    const g3 = blank({ players: 2 });
    city(g3, 0, 1, 1, true); city(g3, 1, 12, 12, true);
    const m = unit(g3, 'warrior', 0, 5, 5); unit(g3, 'warrior', 1, 6, 5);
    g3.players[0].explored.fill(1); refresh(g3);
    m.mp = 1; m.hp = 10;
    g3.moveUnit(m, 4, 5);
    ok(m.hp < 10, 'sair do lado de um inimigo sofre ataque de oportunidade (' + m.hp + ')');
  });

  await test('habilidades ativas', () => {
    const g = blank({ players: 2 });
    city(g, 0, 1, 1, true); city(g, 1, 12, 12, true);
    g.players[0].techs.arco = true;
    const ar = unit(g, 'archer', 0, 5, 5);
    ok(g.abilityCheck(ar, 'aim').ok, 'tiro preciso disponível');
    g.useAbility(ar, 'aim');
    ok(g.stat(ar).range === 3 && ar.mp === 0, 'tiro preciso: alcance +1 e sem movimento');
    ok(!g.abilityCheck(ar, 'aim').ok, 'recarga ativa');
    const mi = unit(g, 'missionary', 0, 8, 8), w = unit(g, 'warrior', 0, 8, 9), w2 = unit(g, 'warrior', 0, 9, 8);
    w.hp = 4; w2.hp = 5;
    g.useAbility(mi, 'bless');
    ok(w.hp === 7 && w.buff && w.buff.bless, 'bênção cura e fortalece');
    const df = unit(g, 'defender', 0, 3, 8);
    g.useAbility(df, 'taunt');
    ok(df.buff.taunt && g.defenseBonus(df, null) > 1.2, 'provocar aumenta a defesa');
    g.current = 1; g.endTurn();
    ok(!ar.buff, 'efeitos acabam no próximo turno do dono');
  });

  // ---------------------------------------------------------------- Naval
  await test('naval: porto, transporte, embarque, desembarque e naufrágio', () => {
    const g = blank({ players: 2 });
    for (const t of g.tiles) if (t.x >= 6) t.terrain = 'water';
    const c = city(g, 0, 5, 5, true); city(g, 1, 1, 12, true);
    const p = g.players[0];
    p.techs.pesca = true; p.techs.navegacao = true;
    const port = g.tile(6, 5); port.imp = 'port';
    g.invalidate();
    ok(g.hasHarbor(c), 'cidade tem porto');
    const tr = g.train(p, c, 'transport');
    ok(tr && g.isWater(g.tileAt(tr)), 'transporte nasce na água');
    const w = unit(g, 'warrior', 0, 5, 6);
    p.explored.fill(1); refresh(g);
    const reach = g.reachable(w);
    const k = tr.y * g.W + tr.x;
    ok(reach.has(k) && reach.get(k).board, 'guerreiro pode embarcar no transporte');
    g.moveUnit(w, tr.x, tr.y);
    ok(tr.cargo.length === 1 && g.units.indexOf(w) < 0, 'guerreiro a bordo');
    ok(g.cityUnits(c).length >= 1, 'carga conta na capacidade');
    tr.mp = 3;
    g.moveUnit(tr, 7, 7);
    ok(w.x === 7 && w.y === 7, 'carga acompanha o transporte');
    ok(g.unloadTargets(tr, w).length === 0 || w.boarded === g.turn, 'não desembarca no mesmo turno do embarque');
    w.boarded = g.turn - 1;
    g.tile(8, 8).terrain = 'plains';
    ok(g.unload(tr, w.id, 8, 8) && g.unitAt(8, 8) === w, 'desembarque na praia');
    ok(g.previewAttack(w, unit(g, 'warrior', 1, 9, 8)).notes.some(n => /Desembarque/.test(n)), 'ataque anfíbio penalizado');
    const w2 = unit(g, 'warrior', 0, 6, 4);
    g.board(w2, tr, null);
    const e = unit(g, 'archer', 1, 7, 9);
    tr.hp = 1;
    g.killUnit(tr, e);
    ok(w2.dead && g.cargoUnits().length === 0, 'carga afunda com o transporte');
  });

  // ---------------------------------------------------------------- Espionagem e névoa
  await test('espionagem: furtividade, detecção e missões', () => {
    const g = blank({ players: 2 });
    city(g, 0, 1, 1, true); const c1 = city(g, 1, 10, 10, true);
    meetAll(g);
    g.players[0].techs.espionagem = true;
    const s = unit(g, 'spy', 0, 7, 10);
    g.players[1].explored.fill(1); refresh(g);
    ok(g.isStealthed(s), 'espião é furtivo');
    ok(!g.unitVisibleTo(s, 1), 'longe: invisível ao inimigo');
    s.x = 9; s.y = 10; g.rebuildIndex(); refresh(g);
    ok(g.unitVisibleTo(s, 1), 'colado na cidade: detectado');
    const ms = g.spyMissions(s);
    ok(ms.find(m => m.id === 'infiltrate').ok, 'missão de infiltração disponível');
    const res = g.spyMission(s, 'infiltrate');
    ok(res && (res.caught || g.players[0].intel[1]), 'missão executada (capturado ou com relatório)');
    c1.buildings.guard = true;
    const s2 = unit(g, 'spy', 0, 9, 11);
    const risk = g.spyMissions(s2).find(m => m.id === 'steal_sci').risk;
    ok(risk >= 0.7, 'Guarda da Cidade aumenta o risco (' + risk.toFixed(2) + ')');
  });

  await test('névoa com inteligência recente', () => {
    const g = blank({ players: 2 });
    city(g, 0, 1, 1, true); city(g, 1, 12, 12, true);
    const e = unit(g, 'warrior', 1, 3, 3);
    refresh(g);
    const p = g.players[0];
    ok(g.fogState(p, 3 + 3 * g.W) === PP.FOG.VISIBLE, 'casa visível');
    ok(p.sightings[3 + 3 * g.W], 'avistamento registrado');
    g.uGrid[3 + 3 * g.W] = null; e.x = 12; e.y = 11; g.rebuildIndex();
    g.cities[0].radius = 0; p.visible.fill(0); g.tiles.forEach(t => { if (t.owner === 0) t.owner = -1; });
    g.turn += 1;
    g.updateVision(p);
    const i = 3 + 3 * g.W;
    ok(g.fogState(p, i) === PP.FOG.RECENT, 'casa vista há pouco = inteligência recente');
    ok(g.ghostsFor(p).some(x => x.x === 3 && x.y === 3), 'fantasma da unidade vista');
    g.turn += 10; g.updateVision(p);
    ok(g.fogState(p, i) === PP.FOG.EXPLORED && !g.ghostsFor(p).length, 'informação antiga some');
  });

  // ---------------------------------------------------------------- Ruínas e eventos
  await test('ruínas com escolhas (humano e IA)', () => {
    const g = blank({ players: 2, humans: [0] });
    city(g, 0, 1, 1, true); city(g, 1, 12, 12, true);
    meetAll(g);
    const t = g.tile(4, 4); t.ruin = true; t.ruinType = 'tumulo';
    const u = unit(g, 'warrior', 0, 3, 3);
    g.players[0].explored.fill(1);
    g.moveUnit(u, 4, 4);
    ok(g.players[0].pendingRuin && t.ruin, 'humano recebe a escolha');
    ok(g.ruinOptions(g.players[0], t).some(o => o.id === 'honor'), 'túmulo pode ser honrado');
    const s = g.players[0].stars;
    ok(g.resolveRuin(g.players[0], 'loot') && g.players[0].stars === s + PP.RUIN_TYPES.tumulo.loot, 'saque rende estrelas');
    ok(!t.ruin && g.memorySummary(1, 0).some(m => m.kind === 'plunder'), 'saque fica na memória dos outros');
    const t2 = g.tile(10, 10); t2.ruin = true; t2.ruinType = 'fortaleza';
    const v = unit(g, 'warrior', 1, 10, 11);
    g.current = 1; g.players[1].explored.fill(1);
    g.moveUnit(v, 10, 10);
    ok(!t2.ruin, 'IA resolve a ruína na hora');
    const t3 = g.tile(6, 6); t3.ruin = true; t3.ruinType = null;
    const w = unit(g, 'warrior', 1, 6, 7);
    g.moveUnit(w, 6, 6);
    ok(!t3.ruin, 'ruína antiga (sem tipo) usa a recompensa original');
  });

  await test('eventos mundiais: anúncio, duração e efeitos', () => {
    const g = blank({ players: 2 });
    const c = city(g, 0, 3, 3, true); city(g, 1, 12, 12, true);
    c.level = 5;
    const before = g.cityIncome(c).stars;
    g.events = { active: [], upcoming: null, next: g.turn + 2, last: null, history: [] };
    g.tickEvents();
    ok(!!g.events.upcoming, 'evento anunciado antes de começar');
    g.events.upcoming.id = 'drought'; g.events.upcoming.start = g.turn + 1;
    g.turn++; g.tickEvents();
    ok(g.eventActive('drought'), 'seca ativa');
    ok(g.cityIncome(c).stars === before - 1, 'seca reduz a renda');
    g.turn += PP.EVENTS.drought.dur; g.tickEvents();
    ok(!g.eventActive('drought'), 'evento termina no prazo');
    g.events.active.push({ id: 'discovery', start: g.turn, end: g.turn + 2 });
    const tc = g.techCost(g.players[0], 'escrita');
    g.events.active = [];
    ok(g.techCost(g.players[0], 'escrita') > tc, 'descoberta científica barateia tecnologias');
  });

  // ---------------------------------------------------------------- Vitórias
  await test('vitórias: maravilhas, científica, territorial e desativadas', () => {
    const all = { dominacao: true, ciencia: true, economia: true, maravilhas: true, territorio: true, diplomacia: true };
    let g = blank({ players: 3, victories: all });
    city(g, 0, 1, 1, true); city(g, 1, 12, 12, true); city(g, 2, 1, 12, true);
    Object.keys(PP.WONDERS).slice(0, PP.WONDERS_TO_WIN).forEach(w => { g.wonders[w] = 0; });
    g.checkVictory();
    ok(!g.over, 'maravilhas precisam ser mantidas por alguns turnos');
    for (let i = 0; i < PP.WONDER_HOLD && !g.over; i++) { g.turn++; g.checkRoundVictories(); }
    ok(g.over && g.endReason === 'maravilhas' && g.winner === 0, 'vitória por maravilhas');
    g = blank({ players: 2, victories: all });
    const c = city(g, 0, 3, 3, true); city(g, 1, 12, 12, true);
    const p = g.players[0];
    PP.TECHS.forEach(t => { p.techs[t.id] = true; });
    c.level = 5; g.setSpec(p, c, 'ciencia');
    p.science = 1000;
    for (let i = 0; i < 3 && !g.over; i++) {
      ok(g.advanceProject(p, c), 'etapa ' + (i + 1) + ' do projeto');
      ok(!g.advanceProject(p, c), 'etapas espaçadas');
      p.project.last = -1;
    }
    ok(g.over && g.endReason === 'ciencia', 'vitória científica');
    g = blank({ players: 2, victories: all });
    city(g, 0, 3, 3, true); city(g, 1, 12, 12, true);
    for (const t of g.tiles) if (t.x < 11) t.owner = 0;
    ok(g.landShare(0) >= g.territoryGoal(), 'território acima da meta');
    for (let i = 0; i < PP.TERRITORY_HOLD - 1 && !g.over; i++) { g.turn++; g.checkRoundVictories(); }
    ok(!g.over, 'ainda mantendo o território');
    g.turn++; g.checkRoundVictories();
    ok(g.over && g.endReason === 'territorio', 'vitória territorial após manter o território');
    g = blank({ players: 2 });
    city(g, 0, 3, 3, true); city(g, 1, 12, 12, true);
    Object.keys(PP.WONDERS).forEach(w => { g.wonders[w] = 0; });
    for (let i = 0; i < 10; i++) { g.turn++; g.checkRoundVictories(); g.checkVictory(); }
    ok(!g.over, 'partida sem vitórias extras (compatível) não termina por maravilhas');
    ok(g.victoryProgress(g.players[0]).length >= 1, 'progresso de vitória disponível');
  });

  // ---------------------------------------------------------------- Salvar e carregar
  await test('salvar/carregar: ida e volta idêntica com todos os sistemas', async () => {
    const tribes = PP.TRIBE_IDS.slice(0, 4);
    const g = new PP.Game().setup({ seed: 99, size: 18, mapType: 'continentes', victories: { dominacao: true, ciencia: true, economia: true, maravilhas: true, territorio: true, diplomacia: true },
      players: tribes.map(t => ({ tribe: t, human: false })) });
    while (g.turn < 25 && !g.over) { await PP.AI.takeTurn(g); if (!g.over) g.endTurn(); }
    const j1 = JSON.stringify(g.toJSON());
    const g2 = PP.Game.fromJSON(JSON.parse(j1));
    const j2 = JSON.stringify(g2.toJSON());
    if (j1 !== j2) { let i = 0; while (i < j1.length && j1[i] === j2[i]) i++; console.log('    diferença em', i, j1.slice(Math.max(0, i - 200), i + 80), '\n    ≠', j2.slice(Math.max(0, i - 200), i + 80)); }
    ok(j1 === j2, 'save idêntico após recarregar');
    ok(g2.routes.length === g.routes.length && g2.events && g2.replay.frames.length === g.replay.frames.length, 'rotas, eventos e replay preservados');
    // continua jogando as duas cópias e compara (determinismo)
    for (let i = 0; i < 8 && !g.over; i++) { await PP.AI.takeTurn(g); if (!g.over) g.endTurn(); await PP.AI.takeTurn(g2); if (!g2.over) g2.endTurn(); }
    ok(JSON.stringify(g.toJSON()) === JSON.stringify(g2.toJSON()), 'jogo recarregado continua idêntico (determinístico)');
  });

  await test('salvar/carregar: saves antigos (v1) continuam funcionando', async () => {
    for (const f of ['v1-solo.json', 'v1-hotseat.json']) {
      const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8')).game;
      const before = { turn: d.turn, cities: d.cities.length, units: d.units.length, techs: d.players.map(p => Object.keys(p.techs).length) };
      const g = PP.Game.fromJSON(d);
      ok(g.saveVersion === 1, f + ': versão antiga reconhecida');
      ok(g.turn === before.turn && g.cities.length === before.cities && g.units.length === before.units, f + ': progresso mantido');
      ok(g.players.every((p, i) => Object.keys(p.techs).length === before.techs[i]), f + ': tecnologias mantidas');
      ok(g.players.every(p => p.memory && p.stats.starsEarned != null && p.lastSeen), f + ': sistemas novos inicializados');
      ok(!g.opts.victories && g.victoryEnabled('dominacao') && !g.victoryEnabled('ciencia'), f + ': regras de vitória originais');
      ok(g.cities.every(c => c.loyalty === 100 && c.spec === null), f + ': cidades com valores padrão');
      for (let i = 0; i < 3 * g.players.length && !g.over; i++) { await PP.AI.takeTurn(g); if (!g.over) g.endTurn(); }
      ok(g.turn > before.turn, f + ': partida continua');
      const j = JSON.stringify(g.toJSON());
      ok(JSON.parse(j).v === PP.SAVE_VERSION, f + ': salva no formato novo');
    }
  });

  // ---------------------------------------------------------------- Cenários, replay e conquistas
  await test('cenários: todos iniciam e rodam', async () => {
    for (const id in PP.SCENARIOS) {
      const humans = PP.SCENARIOS[id].needsHuman ? [0] : [];
      const tribes = PP.TRIBE_IDS.slice(0, 4);
      const g = new PP.Game().setup({ seed: 321, size: 18, mapType: 'continentes', scenario: id,
        players: tribes.map((t, i) => ({ tribe: t, human: humans.indexOf(i) >= 0 })) });
      ok(g.opts.scenario === id, id + ': cenário aplicado');
      for (let i = 0; i < 8 * 4 && !g.over; i++) { await PP.AI.takeTurn(g); if (!g.over) g.endTurn(); }
      ok(g.turn >= 5 || (id === 'ultimo_reino' && g.over), id + ': partida avançou');
      if (id === 'ultimo_reino') ok(g.allied(1, 2) && g.allied(2, 3), id + ': rivais aliados entre si');
      if (id === 'guerra_total') ok(g.canPropose(0, 1, 'peace').ok === false || !g.players[0].met[1], id + ': paz bloqueada');
      if (id === 'ilhas') ok(g.players.every(p => p.techs.navegacao), id + ': todos com Navegação');
      if (id === 'corrida_cientifica') ok(g.victoryEnabled('ciencia') && !g.victoryEnabled('maravilhas'), id + ': só vitória científica');
    }
  });

  await test('replay, estatísticas e conquistas', async () => {
    const g = new PP.Game().setup({ seed: 5, size: 14, mapType: 'pangeia', players: [{ tribe: 'zambe', human: true }, { tribe: 'vikar', human: false }] });
    for (let i = 0; i < 20 && !g.over; i++) { await PP.AI.takeTurn(g); if (!g.over) g.endTurn(); }
    ok(g.replay.frames.length >= 5, 'quadros do replay gravados');
    const f = g.replayFrame(g.replay.frames.length - 1);
    ok(f && f.owners.length === g.W * g.H && f.cities.length > 0, 'quadro decodificado');
    let own = 0; for (const t of g.tiles) if (t.owner === 0) own++;
    let fo = 0; for (const o of f.owners) if (o === 0) fo++;
    ok(own === fo, 'quadro mais recente bate com o mapa');
    const st = g.finalStats();
    ok(st.length === 2 && st[0].starsEarned > 0 && st[0].unitsTrained >= 0, 'estatísticas finais');
    const ach = g.achievementProgress(g.players[0]);
    ok(ach.length === PP.ACHIEVEMENTS.length && ach.every(a => a.cur <= a.max), 'progresso das conquistas');
  });

  await test('mapas: validação e justiça', () => {
    let bad = 0, total = 0;
    for (const mt of Object.keys(PP.MAP_TYPES)) for (const size of [14, 18, 22, 26]) for (let np = 2; np <= 6; np += 2) {
      if (size === 14 && np > 4) continue;
      total++;
      const g = new PP.Game().setup({ seed: 7 + size + np, size, mapType: mt, players: PP.TRIBE_IDS.slice(0, np).map(t => ({ tribe: t, human: false })) });
      if (!g.mapInfo.ok) bad++;
      const caps = g.cities.filter(c => c.capital);
      ok(caps.length === np, mt + ' ' + size + ': todas as capitais');
    }
    ok(bad <= Math.ceil(total * 0.05), `mapas aprovados na validação (${total - bad}/${total})`);
  });

  // ---------------------------------------------------------------- Organização do reino, Era V e personagens
  await test('reino: capacidade administrativa e desordem', () => {
    const g = blank({ size: 20, players: 2 });
    const p = g.players[0];
    p.techs = {};
    ok(g.realmOn(), 'partidas novas têm a organização do reino');
    city(g, 0, 2, 2, true);
    for (let i = 1; i < 8; i++) city(g, 0, 2 + (i % 4) * 3, 2 + Math.floor(i / 4) * 3);
    city(g, 1, 17, 17, true);
    g.realmReset();
    let cap = g.adminCapacity(p);
    ok(cap.total === PP.REALM.base && cap.cities === 8 && cap.excess === 4, `capacidade base ${cap.total}, 8 cidades, excesso ${cap.excess}`);
    ok(Math.abs(cap.rate - 0.2) < 1e-9, 'desordem de 5% por cidade excedente');
    let inc = g.income(p);
    const line = inc.lines.find(l => l.label === PP.t('Desordem administrativa'));
    ok(line && line.stars < 0, 'linha de desordem na renda');
    const before = inc.stars;
    p.techs.organizacao = true; p.techs.escrita = true; p.techs.codigo_leis = true;
    g.build(p, g.citiesOf(0)[1], 'tribunal');
    cap = g.adminCapacity(p);
    ok(cap.total === PP.REALM.base + 3 + 1 && cap.excess === 0, 'tecnologias e Tribunal aumentam a capacidade (' + cap.total + ')');
    inc = g.income(p);
    ok(!inc.lines.some(l => l.label === PP.t('Desordem administrativa')) && inc.stars > before, 'sem desordem a renda volta');
    for (let i = 0; i < 6; i++) city(g, 0, 2 + i * 3, 14);
    g.realmReset();
    ok(g.adminCapacity(p).rate === PP.REALM.disorderMax, 'desordem limitada a 25%');
    g.opts.realm = false; g.realmReset();
    ok(g.adminCapacity(p).rate === 0, 'sem a opção, não há desordem');
  });

  await test('reino: alcance da corte, Paço Regional, Governador e Tribunal', () => {
    const g = blank({ size: 26, players: 2 });
    const p = g.players[0];
    p.stars = 500;
    const cap = city(g, 0, 2, 2, true);
    const far = city(g, 0, 12, 12);
    const mid = city(g, 0, 9, 9);
    city(g, 1, 24, 24, true);
    g.realmReset();
    ok(!g.adminInfo(cap).remote && g.adminInfo(cap).center === 'capital', 'a capital é o centro do reino');
    ok(g.adminInfo(far).remote, 'cidade a 10 casas está longe da corte');
    ok(g.remoteCut(far) === PP.REALM.remoteCut, 'longe da corte rende 20% menos');
    const ci = g.cityIncome(far);
    ok(ci.notes.some(n => n.indexOf(PP.t('Longe da corte −{n}%', { n: 20 })) >= 0), 'nota de distância na renda da cidade');
    ok(g.loyaltyFactors(far).some(f => f[0] === PP.t('Longe da corte') && f[1] < 0), 'distância pesa na lealdade');
    ok(!g.adminInfo(mid).remote, 'cidade a 7 casas está ao alcance');
    far.connected = true; g.realmReset();
    ok(g.adminInfo(far).remote, 'estrada encurta 2 casas (10 → 8, ainda fora)');
    far.connected = false;
    p.techs.codigo_leis = true;
    g.build(p, far, 'tribunal');
    ok(Math.abs(g.remoteCut(far) - PP.REALM.remoteCut / 2) < 1e-9, 'Tribunal corta a penalidade pela metade');
    p.techs.burocracia = true;
    ok(g.buildingCheck(p, mid, 'chancery').reason === PP.t('Só na capital'), 'Chancelaria só na capital');
    ok(g.buildingCheck(p, cap, 'regional_seat').reason === PP.t('A capital já é o centro do reino'), 'Paço Regional fora da capital');
    mid.level = 3;
    ok(g.buildingCheck(p, mid, 'regional_seat').ok, 'Paço Regional numa cidade de nível 3 longe da capital');
    const costBefore = g.buildingCost(p, 'regional_seat', mid);
    g.build(p, mid, 'regional_seat');
    ok(!g.adminInfo(far).remote && g.adminInfo(far).province === mid, 'o Paço Regional cobre a cidade distante');
    ok(g.loyaltyFactors(far).some(f => f[0] === PP.BUILDINGS.regional_seat.name), 'província dá lealdade');
    ok(g.buildingCost(p, 'regional_seat', far) === costBefore + PP.REALM.seatExtraCost, 'cada paço encarece o próximo');
    ok(g.buildingCheck(p, far, 'regional_seat').reason === PP.t('Muito perto de outro centro administrativo') || far.level < 3, 'paços não podem ficar colados');
    g.build(p, cap, 'chancery');
    ok(g.adminCenters(0).find(o => o.kind === 'capital').radius === PP.REALM.capitalRadius + PP.REALM.chanceryRadius, 'Chancelaria amplia o alcance da capital');
    // Governador: torna a cidade em que está um centro administrativo
    const far2 = city(g, 0, 22, 4);
    g.realmReset();
    ok(g.adminInfo(far2).remote, 'outra cidade longe da corte');
    const u = g.unitAt(far2.x, far2.y); if (u) g.disband(u);
    const gov = g.train(p, far2, 'governor');
    ok(gov && gov.home === null && gov.name, 'Governador nomeado, sem ocupar vaga da cidade');
    ok(g.governedCity(0) === far2 && g.adminInfo(far2).center === 'governor', 'a cidade do Governador vira centro');
    ok(g.cityIncome(far2).notes.some(n => n.indexOf(PP.UNITS.governor.name) >= 0), 'Governador rende estrelas na cidade');
    ok(g.adminCapacity(p).parts.some(x => x[0] === PP.UNITS.governor.name), 'Governador soma capacidade');
    place(g, gov, far2.x - 1, far2.y);
    ok(g.governedCity(0) === far2, 'ao lado da cidade continua governando');
    place(g, gov, far2.x - 3, far2.y);
    ok(g.governedCity(0) === null && g.adminInfo(far2).remote, 'longe da cidade deixa de governar');
  });

  await test('reino: personagens únicos, com nome, fora da capacidade e não convertíveis', () => {
    const g = blank({ players: 2 });
    const p = g.players[0];
    p.stars = 200;
    const c = city(g, 0, 3, 3, true);
    city(g, 1, 11, 11, true);
    p.techs.arte_guerra = true; p.techs.diplomacia_real = true;
    ok(g.trainCheck(p, c, 'general').reason === PP.t('Requer {x}', { x: PP.BUILDINGS.war_academy.name }), 'General exige a Academia Militar');
    g.build(p, c, 'war_academy');
    const cap = g.capacity(c);
    const gen = g.train(p, c, 'general');
    ok(gen && gen.name && gen.name.length >= 3, 'General recebe nome próprio (' + (gen && gen.name) + ')');
    ok(g.cityUnits(c).length === 0 && g.capacity(c) === cap, 'personagem não ocupa vaga');
    place(g, gen, 4, 3);
    ok(g.trainCheck(p, c, 'general').reason === PP.t('Seu reino já tem um {u}', { u: PP.UNITS.general.name }), 'um General por reino');
    const env = g.train(p, c, 'envoy');
    ok(env && env.name && env.name !== gen.name, 'Embaixador com outro nome');
    ok(g.logs.some(l => l.text === PP.t('{p} nomeou {u}.', { p: p.name, u: g.characterTitle(gen) })), 'crônica registra a nomeação');
    const m = unit(g, 'missionary', 1, 5, 3);
    g.players[1].techs.filosofia = true;
    ok(!g.convertTargets(m).some(d => d === gen), 'personagens não podem ser convertidos');
    g.killUnit(gen, null);
    ok(g.logs.some(l => l.text === PP.t('{u} de {p} caiu.', { u: g.characterTitle(gen), p: p.name })), 'morte do personagem na crônica');
    ok(!g.characterOf(0, 'general') && g.trainCheck(p, c, 'general').reason !== PP.t('Seu reino já tem um {u}', { u: PP.UNITS.general.name }), 'pode nomear outro depois');
  });

  await test('reino: comando do General', () => {
    const g = blank({ players: 2 });
    city(g, 0, 1, 1, true); city(g, 1, 12, 12, true);
    const a = unit(g, 'warrior', 0, 5, 5), d = unit(g, 'warrior', 1, 6, 5);
    const base = g.previewAttack(a, d);
    const gen = unit(g, 'general', 0, 4, 5);
    g.realmReset();
    const boosted = g.previewAttack(a, d);
    ok(boosted.dmg > base.dmg, `ataque com o General ao lado (${base.dmg} → ${boosted.dmg})`);
    ok((boosted.notes || []).some(n => n.indexOf(PP.t('Comando do General')) >= 0), 'nota do comando no ataque');
    const back = g.previewAttack(d, a);
    g.killUnit(gen, null);
    const back2 = g.previewAttack(d, a);
    ok(back.dmg < back2.dmg, `defesa com o General ao lado (${back2.dmg} → ${back.dmg})`);
  });

  await test('reino: Embaixada e Embaixador melhoram a opinião', () => {
    const g = blank({ players: 3 });
    const p = g.players[0];
    p.stars = 100;
    const c = city(g, 0, 2, 2, true); city(g, 1, 11, 2, true); city(g, 2, 6, 11, true);
    meetAll(g);
    g.makePeace(0, 1);
    p.techs.diplomacia_real = true;
    g.build(p, c, 'embassy');
    ok(g.buildingCheck(p, c, 'embassy').done, 'Embaixada construída');
    const c2 = city(g, 0, 4, 5);
    ok(g.buildingCheck(p, c2, 'embassy').locked, 'uma Embaixada por reino');
    const op0 = g.opinion(1, 0);
    g.hook('beforeTurn', p);
    ok(g.memorySummary(1, 0).some(m => m.kind === 'embassy'), 'tribo em paz lembra da Embaixada');
    ok(!g.memorySummary(2, 0).some(m => m.kind === 'embassy'), 'tribo em guerra não');
    const env = unit(g, 'envoy', 0, 10, 3);
    g.tile(10, 3).owner = 1;
    g.hook('beforeTurn', p);
    ok(g.envoyHost(env) === g.players[1], 'Embaixador em missão no território da tribo');
    ok(g.memorySummary(1, 0).some(m => m.kind === 'envoy'), 'missão do Embaixador lembrada');
    ok(g.opinion(1, 0) > op0, 'opinião sobe');
    ok(p.intel && p.intel[1] && p.intel[1].turn === g.turn, 'relatório da tribo visitada');
    g.declareWar(0, 1);
    ok(!g.envoyHost(env), 'em guerra a missão acaba');
  });

  await test('reino: Era V, novas unidades e construções', () => {
    const g = blank({ players: 2 });
    const p = g.players[0];
    p.stars = 300;
    const c = city(g, 0, 3, 3, true); city(g, 1, 11, 11, true);
    const era5 = PP.TECHS.filter(t => t.tier === 5);
    ok(era5.length === 5 && era5.every(t => t.req.every(r => PP.TECH[r] && PP.TECH[r].tier >= 3)), 'Era V com 5 tecnologias e pré-requisitos válidos');
    ok(g.techCost(p, 'burocracia') > g.techCost(p, 'economia'), 'Era V custa mais que a Era IV');
    p.techs.arte_guerra = true; p.techs.siderurgia = true; p.techs.imprensa = true; p.techs.escrita = true;
    ok(g.trainCheck(p, c, 'dragoon').reason === PP.t('Requer {x}', { x: PP.STRATEGIC.horses.name }), 'Dragão exige Cavalos');
    ok(g.trainCheck(p, c, 'mortar').reason === PP.t('Requer {x}', { x: PP.STRATEGIC.iron.name }), 'Morteiro exige Ferro');
    ok(PP.ABILITIES.bombard.units.indexOf('mortar') >= 0 && PP.ABILITIES.aim.units.indexOf('dragoon') >= 0, 'habilidades das unidades novas');
    const musk = g.unitCostFor(p, c, 'musketeer');
    g.build(p, c, 'foundry');
    ok(g.unitCostFor(p, c, 'musketeer') === musk - 1, 'Fundição barateia unidades de ferro');
    const cap = g.capacity(c);
    g.build(p, c, 'war_academy');
    ok(g.capacity(c) === cap + 1 && g.recruitXp(c, 'warrior') >= 1, 'Academia Militar: capacidade e XP');
    const sci = g.cityIncome(c).sci;
    g.build(p, c, 'library'); p.techs.escrita = true;
    const sci2 = g.cityIncome(c).sci;
    g.build(p, c, 'press');
    const sci3 = g.cityIncome(c).sci;
    ok(sci2 >= sci + 3 && sci3 === sci2 + PP.REALM.pressSci, `Imprensa: biblioteca +1 e Casa da Imprensa +2 (${sci} → ${sci2} → ${sci3})`);
    ok(g.loyaltyFactors(c).some(f => f[0] === PP.BUILDINGS.press.name), 'Casa da Imprensa dá lealdade');
    const sc = g.score(p);
    ok(sc > 0 && PP.ACHIEVEMENT.corte && PP.ACHIEVEMENT.organizado, 'conquistas novas registradas');
  });

  await test('reino: partidas antigas e salvar/carregar', async () => {
    const g = new PP.Game().setup({ seed: 77, size: 18, players: PP.TRIBE_IDS.slice(0, 3).map(t => ({ tribe: t })) });
    for (let i = 0; i < 9; i++) { await PP.AI.takeTurn(g); g.endTurn(); }
    const p = g.players[0];
    p.techs.burocracia = true;
    const c = g.citiesOf(0)[0];
    const u = g.unitAt(c.x, c.y); if (u) g.disband(u);
    g.current = 0; p.stars += 50;
    const gov = g.train(p, c, 'governor');
    const json = JSON.parse(JSON.stringify(g.toJSON()));
    const g2 = PP.Game.fromJSON(json);
    ok(g2.realmOn(), 'opção do reino salva');
    const gov2 = g2.units.find(x => x.id === gov.id);
    ok(gov2 && gov2.name === gov.name && gov2.home === null, 'personagem e nome salvos');
    ok(JSON.stringify(g2.toJSON()) === JSON.stringify(json), 'ida e volta idêntica');
    delete json.opts.realm;
    const old = PP.Game.fromJSON(json);
    ok(!old.realmOn() && old.adminCapacity(old.players[0]).rate === 0, 'partida antiga: sem desordem');
    ok(old.citiesOf(0).every(c2 => !old.adminInfo(c2).remote), 'partida antiga: sem distância da corte');
  });

  await test('mapas: tamanhos Colossal e Titânico', async () => {
    for (const size of [32, 40]) {
      const g = new PP.Game().setup({ seed: 900 + size, size, mapType: 'continentes', players: PP.TRIBE_IDS.map(t => ({ tribe: t })) });
      ok(g.W === size && g.cities.filter(c => c.capital).length === 6, size + ': seis capitais');
      ok(g.tiles.filter(t => t.village).length >= size, size + ': aldeias suficientes (' + g.tiles.filter(t => t.village).length + ')');
      for (let i = 0; i < 12; i++) { await PP.AI.takeTurn(g); g.endTurn(); }
      ok(!g.over && g.turn >= 3, size + ': a IA joga');
    }
  });

  // ---------------------------------------------------------------- Coroa: governo, tesouro, vassalos e termos de paz
  await test('governo: tecnologias, anarquia, efeitos e espera', () => {
    const g = blank({ players: 3 });
    meetAll(g);
    const c0 = city(g, 0, 3, 3, true), c0b = city(g, 0, 7, 3);
    city(g, 1, 11, 3, true); const c2 = city(g, 2, 3, 11, true);
    c0.level = 12;
    refresh(g);
    const p = g.players[0];
    g.current = 0;
    ok(g.govCheck(p, 'monarquia').locked, 'Monarquia exige Organização');
    p.techs.organizacao = true;
    ok(g.govCheck(p, 'monarquia').ok, 'Monarquia liberada');
    g.realmReset();
    const capBase = g.adminCapacity(p).total, ciBase = g.cityIncome(c0).stars;
    ok(g.adoptGov(p, 'monarquia') && p.gov === 'monarquia' && g.inAnarchy(p), 'adota com anarquia');
    const an = g.income(p);
    const cut = an.lines.find(l => l.label === PP.t('Anarquia'));
    ok(cut && cut.stars === -Math.round(an.lines[0].stars * 0.5) && cut.sci === -Math.round(an.lines[0].sci * 0.5), 'anarquia corta metade da produção das cidades');
    ok(g.loyaltyFactors(c0).some(f => f[0] === PP.t('Anarquia')), 'anarquia pesa na lealdade');
    ok(!g.govCheck(p, 'tribal').ok, 'não troca durante a anarquia');
    g.turn = p.anarchyUntil + 1; g.invalidate();
    ok(!g.inAnarchy(p) && g.adminCapacity(p).total === capBase + 1, 'Monarquia: +1 de capacidade');
    ok(g.cityIncome(c0).stars === ciBase + 2, 'Monarquia: +2★ na capital');
    const mon = g.income(p).lines.find(l => l.label === PP.GOVERNMENTS.monarquia.name);
    ok(mon && mon.sci < 0, 'Monarquia: −10% de ciência');
    const wait = g.govCheck(p, 'tribal');
    ok(!wait.ok && !wait.locked, 'espera entre trocas: ' + wait.reason);
    // Teocracia
    p.techs.meditacao = true;
    g.turn = p.govSince + PP.GOV_RULES.cooldown;
    ok(g.adoptGov(p, 'teocracia'), 'Teocracia adotada');
    g.turn = p.anarchyUntil + 1; g.invalidate();
    const t0 = g.cityIncome(c0b).stars;
    c0b.buildings.temple = true;
    ok(g.cityIncome(c0b).stars === t0 + 1, 'Teocracia: Templo rende +1★');
    ok(g.unitCostFor(p, c0, 'missionary') === Math.max(1, PP.UNITS.missionary.cost - 2), 'Teocracia: Missionário mais barato');
    ok(g.loyaltyFactors(c0).some(f => f[0] === PP.GOVERNMENTS.teocracia.name && f[1] === 10), 'Teocracia: +10 de lealdade');
    // Feudalismo
    p.techs.estrategia = true;
    g.turn = p.govSince + PP.GOV_RULES.cooldown;
    ok(g.adoptGov(p, 'feudalismo'), 'Feudalismo adotado');
    g.turn = p.anarchyUntil + 1; g.invalidate();
    ok(g.buildingCost(p, 'walls', c0) === Math.ceil(PP.BUILDINGS.walls.cost / 2), 'Feudalismo: Muralhas pela metade');
    const ft = g.tile(c0.x + 1, c0.y + 1);
    ok(g.tileActionCheck(p, ft, 'fort').cost === Math.ceil(PP.TILE_ACTION.fort.cost / 2), 'Feudalismo: Forte pela metade');
    const d = unit(g, 'warrior', 0, ft.x, ft.y);
    d.fortified = true;
    const bF = g.defenseBonus(d);
    p.anarchyUntil = g.turn;
    const bA = g.defenseBonus(d);
    p.anarchyUntil = 0;
    ok(Math.abs(bF / bA - 1.15) < 1e-9, 'Feudalismo: fortificados +15% de defesa');
    // República
    p.techs.comercio = true;
    g.turn = p.govSince + PP.GOV_RULES.cooldown;
    ok(g.adoptGov(p, 'republica'), 'República adotada');
    g.turn = p.anarchyUntil + 1; g.invalidate();
    g.routes.push({ id: g.nextId++, a: c0.id, b: c0b.id, owner: 0, partner: 0, kind: 'domestic', len: 4, sea: false, path: [], active: true, threat: false, since: g.turn, age: 0, rep: false });
    const rr = g.income(p).lines.find(l => l.label === PP.t('Rotas da República'));
    ok(rr && rr.stars === 1, 'República: +1★ por rota');
    ok(!g.income(p).lines.some(l => l.label === PP.t('Cansaço de guerra')), 'sem guerra ativa, sem cansaço');
    g.setRel(0, 1, 'peace'); g.declareWar(0, 1);
    ok(g.activeWars(0).indexOf(1) >= 0 && g.income(p).lines.some(l => l.label === PP.t('Cansaço de guerra') && l.stars < 0), 'República: cansaço de guerra');
    // Império
    p.techs.burocracia = true;
    g.turn = p.govSince + PP.GOV_RULES.cooldown;
    ok(!g.govCheck(p, 'imperio').ok, 'Império exige cidades');
    for (const [x, y] of [[3, 7], [7, 7], [10, 10], [12, 7]]) city(g, 0, x, y);
    ok(!g.govCheck(p, 'imperio').ok, 'Império exige capital estrangeira ou vassalos');
    g.transferCity(g.cityMap[g.players[1].capital], 0);
    const chk = g.govCheck(p, 'imperio');
    ok(chk.ok && chk.anarchy === 1, 'Império liberado com anarquia de 1 turno');
    ok(g.adoptGov(p, 'imperio') && p.anarchyUntil === g.turn + 1, 'Império proclamado');
    g.turn = p.anarchyUntil + 1; g.invalidate();
    g.transferCity(c2, 0);
    g.hook('capture', c2, g.players[2], p);
    ok(c2.occupied === 2, 'Império: ocupação de 2 turnos');
    ok(g.achievementProgress(p).find(a => a.id === 'coroacao').cur === 1 && g.achievementProgress(p).find(a => a.id === 'reformador').cur === PP.ACHIEVEMENTS.find(a => a.id === 'reformador').max, 'conquistas Coroação e Reformador');
  });

  await test('impostos: orçamento, lealdade, capacidade e crescimento', () => {
    const g = blank({ players: 2 });
    const c = city(g, 0, 3, 3, true), c2 = city(g, 0, 8, 3);
    c.level = 10;
    const p = g.players[0];
    g.current = 0;
    const base = g.income(p).lines[0];
    g.realmReset();
    const cap0 = g.adminCapacity(p).total;
    ok(g.setTax(p, 'altos') && !g.setTax(p, 'altos'), 'muda o imposto (e não repete)');
    const hi = g.income(p).lines.find(l => l.label === PP.TAXES.altos.label);
    ok(hi && hi.stars === Math.round(base.stars * 0.2) && hi.sci === Math.round(-base.sci * 0.25), 'altos: +20% de estrelas, −25% de ciência');
    ok(g.loyaltyFactors(c).some(f => f[0] === PP.TAXES.altos.label && f[1] === -10), 'altos: −10 de lealdade');
    g.setTax(p, 'extorsivos');
    ok(g.adminCapacity(p).total === cap0 - 1, 'extorsivos: −1 de capacidade');
    g.setTax(p, 'baixos');
    const low = g.income(p).lines.find(l => l.label === PP.TAXES.baixos.label);
    ok(low && low.stars < 0 && low.sci > 0, 'baixos: menos estrelas, mais ciência');
    let pops = 0;
    g.on((type, d) => { if (type === 'pop') pops += d.amount; });
    const gov = PP.SYSTEMS.find(s => s.name === 'government');
    for (let i = 0; i < 6; i++) { g.turn++; gov.beforeTurn(g, p); }
    ok(pops === 2, 'baixos: +1 de população por cidade a cada 6 turnos (' + pops + ')');
    g.setTax(p, 'normais');
    ok(p.taxGrowth === 0 && g.income(p).lines.every(l => !/Impostos/.test(l.label)), 'normais: sem efeitos');
  });

  await test('empréstimos: juros, parcelas, quitação, banco e calote', () => {
    const g = blank({ players: 2 });
    const c = city(g, 0, 3, 3, true);
    c.level = 8;
    const p = g.players[0];
    g.current = 0; p.stars = 0;
    ok(g.loanCheck(p, 'small').locked, 'empréstimo exige Comércio');
    p.techs.comercio = true;
    const chk = g.loanCheck(p, 'large');
    ok(chk.ok && chk.terms.amount >= PP.LOANS.large.min && chk.terms.total > chk.terms.amount, 'termos do empréstimo grande');
    ok(g.takeLoan(p, 'large') && p.stars === chk.terms.amount, 'recebe as estrelas');
    ok(!g.loanCheck(p, 'small').ok, 'um empréstimo por vez');
    g.payLoanInstallment(p);
    ok(p.loan.left === chk.terms.total, 'sem parcela no turno em que tomou');
    g.turn++; g.payLoanInstallment(p);
    ok(p.loan.left === chk.terms.total - chk.terms.per && p.stars === chk.terms.amount - chk.terms.per, 'parcela cobrada no turno seguinte');
    ok(!g.repayLoan(p) && p.loan, 'sem estrelas para quitar');
    p.stars += 100;
    ok(g.repayLoan(p) && p.loan === null && p.stats.loansRepaid === 1, 'quitação antecipada');
    const r0 = g.loanTerms(p, 'small').rate;
    c.buildings.bank = true;
    ok(g.loanTerms(p, 'small').rate < r0, 'Banco baixa os juros');
    ok(g.takeLoan(p, 'small'), 'novo empréstimo');
    p.stars = 0;
    const rep = p.reputation;
    for (let i = 0; i < 3; i++) { g.turn++; g.payLoanInstallment(p); }
    ok(p.loan === null && p.reputation === rep - 2 && g.inAnarchy(p) && !g.loanCheck(p, 'small').ok, 'calote: −2 de reputação, anarquia e crédito suspenso');
  });

  await test('guerra: placar, termos de paz, cessão, reparações e trégua', () => {
    const g = blank({ players: 3 });
    meetAll(g);
    const a = city(g, 0, 2, 2, true), b = city(g, 1, 11, 2, true), b2 = city(g, 1, 11, 8), b3 = city(g, 1, 6, 11);
    city(g, 2, 2, 12, true);
    refresh(g);
    g.players[0].explored.fill(1);
    g.current = 0;
    for (let i = 0; i < 3; i++) {
      const u = unit(g, 'swordsman', 0, 6, 6), e = unit(g, 'warrior', 1, 7, 6);
      e.hp = 1; refresh(g);
      g.attack(u, e);
      g.killUnit(u);
    }
    ok(g.warScore(0, 1) === 3 && g.warScore(1, 0) === -3, 'placar conta tropas derrotadas');
    const cap = unit(g, 'warrior', 0, b3.x, b3.y);
    ok(g.capture(cap) && b3.owner === 0, 'cidade tomada');
    ok(g.warScore(0, 1) === 3 + PP.WAR_POINTS.city, 'placar conta cidades tomadas');
    const opts = g.peaceTermOptions(0, 1);
    ok(opts.some(o => o.term === 'city' && o.city === b2.id) && !opts.some(o => o.term === 'city' && o.city === b.id), 'a capital não entra nas opções');
    ok(!g.canPropose(0, 1, 'peace_terms', { term: 'city', city: b.id }).ok, 'a capital não pode ser cedida');
    ok(!g.termsOutlook(0, 1, { term: 'vassal' }).ok, 'placar baixo: vassalagem improvável');
    const guard = unit(g, 'warrior', 1, b2.x, b2.y);
    g.applyPeaceTerms(0, 1, { term: 'city', city: b2.id });
    ok(b2.owner === 0 && b2.occupied === 2 && guard.owner === 1 && !guard.dead && !(guard.x === b2.x && guard.y === b2.y), 'cidade cedida e a tropa retirada');
    ok(g.relState(0, 1) === 'peace' && g.truceUntil(0, 1) === g.turn + PP.TRUCE_TURNS && g.warScore(0, 1) === 0, 'paz com trégua e placar zerado');
    ok(g.players[0].stats.warsWon >= 1, 'a guerra conta como vencida');
    const rep = g.players[0].reputation;
    ok(g.declareWar(0, 1) && g.players[0].reputation === rep - 2, 'romper a trégua custa 2 de reputação');
    g.applyPeaceTerms(0, 1, { term: 'reparations', amount: 3 });
    const p1 = g.players[1], s0 = g.players[0].stars;
    p1.stars = 100;
    for (let i = 0; i < 10; i++) g.hook('income', p1, { stars: 0, sci: 0 });
    ok(g.players[0].stars === s0 + 24 && !p1.reparations.length, 'reparações pagas por 8 turnos');
    // a IA trata a trégua como um pacto ao avaliar convites de guerra
    p1.ai.strategy = 'territorial';
    let joined = 0;
    for (let i = 0; i < 20; i++) {
      if (PP.AIStrategy.evaluateProposal(g, p1, g.players[2], 'joint_war', { target: 0 })) joined++;
      if (PP.AIStrategy.evaluateProposal(g, p1, g.players[2], 'call_to_arms', { target: 0 })) joined++;
    }
    ok(g.truceUntil(1, 0) > g.turn && joined === 0, 'IA em trégua recusa guerra conjunta e chamado às armas contra o outro lado');
    // a última cidade nunca é cedida
    const p2 = g.players[2], only = g.citiesOf(2)[0];
    only.capital = false; p2.capital = null;
    ok(!g.canPropose(0, 2, 'peace_terms', { term: 'city', city: only.id }).ok, 'a última cidade não pode ser cedida');
    ok(!g.peaceTermOptions(0, 2).some(o => o.term === 'city'), 'nem aparece nas opções');
  });

  await test('vassalos: tributo, guerras do suserano, restrições, independência, anexação e libertação', () => {
    const g = blank({ players: 4 });
    meetAll(g);
    const cs = [city(g, 0, 2, 2, true), city(g, 1, 11, 2, true), city(g, 2, 2, 11, true), city(g, 3, 11, 11, true)];
    refresh(g);
    g.makePeace(0, 2);
    g.applyPeaceTerms(0, 1, { term: 'vassal' });
    ok(g.overlordOf(1) === 0 && g.relState(0, 1) === 'alliance' && g.vassalsOf(0).join() === '1', 'vassalo criado e aliado');
    ok(g.memorySummary(1, 0).some(m => m.kind === 'vassalized'), 'o vassalo lembra da imposição');
    ok(!g.declareWar(1, 3) && !g.declareWar(0, 1) && !g.leaveAlliance(0, 1), 'vassalo não declara guerra; suserano não ataca nem abandona o vassalo');
    g.setRel(1, 3, 'peace');
    ok(!g.canPropose(1, 3, 'alliance').ok && !g.canPropose(3, 1, 'alliance').ok, 'vassalos não fazem alianças');
    g.players[0].rel[2].truce = 0; g.players[2].rel[0].truce = 0;
    g.setRel(1, 2, 'peace');
    ok(g.declareWar(0, 2) && g.atWar(1, 2), 'o vassalo entra na guerra do suserano');
    ok(!g.canPropose(1, 2, 'peace').ok && !g.canPropose(2, 1, 'peace').ok, 'a paz dessa guerra é com o suserano');
    g.makePeace(0, 2);
    ok(!g.atWar(1, 2) && g.truceUntil(1, 2) > g.turn, 'a paz do suserano vale para o vassalo');
    const p0 = g.players[0], p1 = g.players[1];
    let a0 = p0.stars, a1 = p1.stars;
    g.hook('income', p1, { stars: 20, sci: 0 });
    ok(a1 - p1.stars === 3 && p0.stars - a0 === 3, 'tributo de 15%');
    p0.gov = 'feudalismo'; p0.anarchyUntil = 0;
    a0 = p0.stars; a1 = p1.stars;
    g.hook('income', p1, { stars: 20, sci: 0 });
    ok(a1 - p1.stars === 5 && p0.stars - a0 === 5, 'tributo de 25% no Feudalismo');
    p0.gov = 'tribal';
    // atacado, o vassalo chama o suserano às armas
    g.setRel(3, 1, 'peace');
    g.declareWar(3, 1);
    ok(g.atWar(3, 1), 'terceiro ataca o vassalo');
    // independência
    g.current = 1;
    const rep = p1.reputation;
    ok(g.declareIndependence(1) && g.overlordOf(1) == null && g.atWar(0, 1) && p1.reputation === rep, 'independência vira guerra, sem custo de reputação');
    ok(g.memorySummary(0, 1).some(m => m.kind === 'rebelled'), 'o suserano lembra da rebelião');
    // anexação
    g.applyPeaceTerms(0, 1, { term: 'vassal' });
    ok(!g.canPropose(0, 1, 'annex').ok, 'anexação só depois de 10 turnos');
    g.turn += PP.VASSAL.annexTurns;
    p0.stars = 100; p1.stars = 7; p1.science = 5;
    const u1 = unit(g, 'warrior', 1, cs[1].x + 1, cs[1].y);
    ok(g.canPropose(0, 1, 'annex').ok, 'anexação disponível');
    ok(g.annexVassal(0, 1), 'anexa');
    ok(!p1.alive && cs[1].owner === 0 && cs[1].founder === 0 && cs[1].occupied === 0 && u1.owner === 0, 'cidades e tropas passam ao suserano');
    ok(p0.stars === 100 - PP.VASSAL.annexCost + 7 && p0.stats.annexed === 1, 'custo pago e tesouro incorporado');
    // libertação
    g.makeVassal(3, 0, 'offer');
    g.current = 0;
    ok(g.releaseVassal(0, 3) && g.overlordOf(3) == null && g.relState(0, 3) === 'peace' && g.truceUntil(0, 3) > g.turn, 'libertação: paz com trégua');
    ok(g.memorySummary(3, 0).some(m => m.kind === 'freed'), 'o libertado lembra com gratidão');
  });

  await test('vassalos: dominação depois de 5 turnos e progresso', () => {
    const g = blank({ players: 3 });
    meetAll(g);
    city(g, 0, 2, 2, true); city(g, 1, 11, 2, true); city(g, 2, 2, 11, true);
    g.makeVassal(1, 0, 'offer');
    g.makeVassal(2, 0, 'offer');
    ok(!g.over, 'não vence na hora');
    ok(g.victoryProgress(g.players[0]).find(v => v.id === 'dominacao').pct === 1, 'progresso de dominação conta os vassalos');
    g.turn += PP.VASSAL.dominationTurns;
    PP.SYSTEMS.find(s => s.name === 'vassals').newRound(g);
    ok(g.over && g.winner === 0 && g.endReason === 'dominacao', 'vence por dominação depois de 5 turnos');
    const g2 = blank({ players: 3 });
    meetAll(g2);
    city(g2, 0, 2, 2, true); city(g2, 1, 11, 2, true); city(g2, 2, 2, 11, true);
    g2.makeVassal(1, 0, 'offer');
    ok(!g2.canPropose(1, 2, 'vassal_offer').ok && !g2.canPropose(2, 1, 'vassal_offer').ok, 'vassalo não oferece nem recebe proteção');
    g2.makeVassal(0, 2, 'war');
    ok(g2.overlordOf(0) === 2 && g2.overlordOf(1) == null && !g2.vassalsOf(0).length, 'quem vira vassalo liberta os próprios vassalos');
    ok(g2.relState(0, 1) === 'peace' && g2.truceUntil(0, 1) > g2.turn && !g2.over, 'os libertados ficam em paz com trégua');
  });

  await test('coroa: salvar e carregar, saves antigos e a IA usa as mecânicas', async () => {
    const g = blank({ players: 3 });
    meetAll(g);
    city(g, 0, 2, 2, true); city(g, 1, 11, 2, true); city(g, 2, 2, 11, true);
    const p = g.players[0];
    g.current = 0;
    p.techs.organizacao = true; p.techs.comercio = true;
    g.adoptGov(p, 'monarquia'); g.setTax(p, 'altos'); g.takeLoan(p, 'small');
    g.applyPeaceTerms(0, 1, { term: 'vassal' });
    g.applyPeaceTerms(0, 2, { term: 'reparations', amount: 2 });
    const json = JSON.parse(JSON.stringify(g.toJSON()));
    const g2 = PP.Game.fromJSON(json);
    const q = g2.players[0];
    ok(q.gov === 'monarquia' && q.tax === 'altos' && q.loan && q.loan.left === p.loan.left && g2.inAnarchy(q), 'governo, imposto e empréstimo salvos');
    ok(g2.overlordOf(1) === 0 && g2.players[2].reparations.length === 1 && g2.truceUntil(0, 2) === g.truceUntil(0, 2), 'vassalo, reparações e trégua salvos');
    ok(JSON.stringify(g2.toJSON()) === JSON.stringify(json), 'ida e volta idêntica');
    for (const f of ['v1-solo.json', 'v1-hotseat.json']) {
      const old = PP.Game.fromJSON(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8')).game);
      ok(old.players.every(x => x.gov === 'tribal' && x.tax === 'normais' && x.loan === null && x.overlord === null && x.reparations.length === 0), f + ': valores padrão da Coroa');
      ok(old.players.every(x => !old.income(x).lines.some(l => l.label === PP.t('Anarquia'))), f + ': renda sem efeitos novos');
    }
    // a IA troca de governo e de impostos numa partida curta
    const ga = new PP.Game().setup({ seed: 2024, size: 18, mapType: 'continentes', players: ['vikar', 'qadir', 'zambe', 'hanlu'].map(t => ({ tribe: t })) });
    for (let i = 0; i < 45 * 4 && !ga.over; i++) { await PP.AI.takeTurn(ga); if (!ga.over) ga.endTurn(); }
    ok(ga.players.some(x => x.stats.govChanges > 0), 'a IA troca de governo');
    ok(ga.players.some(x => x.tax !== 'normais' || x.ai.taxT != null), 'a IA cuida dos impostos');
    // a IA aceita termos conforme o placar
    const gb = blank({ players: 2 });
    meetAll(gb);
    city(gb, 0, 2, 2, true); city(gb, 1, 11, 2, true); city(gb, 1, 11, 8);
    gb.players[1].ai.strategy = 'territorial';
    let yes = 0;
    for (let i = 0; i < 40; i++) if (PP.AI.evaluateProposal(gb, gb.players[1], gb.players[0], 'peace_terms', { term: 'reparations', amount: 2 })) yes++;
    ok(yes === 0, 'sem placar, a IA recusa reparações');
    const w = gb.warRecord(0, 1); w.pts = { 0: 30, 1: 0 };
    yes = 0;
    for (let i = 0; i < 40; i++) if (PP.AI.evaluateProposal(gb, gb.players[1], gb.players[0], 'peace_terms', { term: 'reparations', amount: 2 })) yes++;
    ok(yes > 20, 'com placar alto, a IA costuma aceitar (' + yes + '/40)');
    // a IA pede empréstimo na emergência e quita quando sobra
    const gl = blank({ players: 2 });
    meetAll(gl);
    const lc = city(gl, 1, 8, 8, true); city(gl, 0, 2, 2, true);
    lc.level = 6;
    for (const [x, y] of [[10, 8], [10, 9], [9, 10]]) unit(gl, 'swordsman', 0, x, y);
    refresh(gl);
    const L = gl.players[1];
    L.techs.comercio = true; L.stars = 2; gl.current = 1;
    PP.AICrown.manageLoan(gl, L);
    ok(L.loan && L.stars > 2, 'IA ameaçada e sem estrelas pede empréstimo');
    L.stars = L.loan.left + 30;
    PP.AICrown.manageLoan(gl, L);
    ok(!L.loan, 'IA quita o empréstimo quando sobra');
  });

  console.log(`\n${passed} verificações ok, ${failed} falhas`);
  if (failed) { console.log(failures.map(f => ' - ' + f).join('\n')); process.exit(1); }
})();
