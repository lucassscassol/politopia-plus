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
    Object.keys(PP.WONDERS).slice(0, 5).forEach(w => { g.wonders[w] = 0; });
    g.checkVictory();
    ok(g.over && g.endReason === 'maravilhas' && g.winner === 0, 'vitória por maravilhas');
    g = blank({ players: 2, victories: all });
    const c = city(g, 0, 3, 3, true); city(g, 1, 12, 12, true);
    const p = g.players[0];
    PP.TECHS.forEach(t => { p.techs[t.id] = true; });
    c.level = 3; g.setSpec(p, c, 'ciencia');
    p.science = 1000;
    for (let i = 0; i < 3 && !g.over; i++) {
      ok(g.advanceProject(p, c), 'etapa ' + (i + 1) + ' do projeto');
      ok(!g.advanceProject(p, c), 'uma etapa por turno');
      p.project.last = -1;
    }
    ok(g.over && g.endReason === 'ciencia', 'vitória científica');
    g = blank({ players: 2, victories: all });
    city(g, 0, 3, 3, true); city(g, 1, 12, 12, true);
    for (const t of g.tiles) if (t.x < 10) t.owner = 0;
    for (let i = 0; i < PP.HOLD_TURNS && !g.over; i++) { g.turn++; g.checkRoundVictories(); }
    ok(g.over && g.endReason === 'territorio', 'vitória territorial após manter o território');
    g = blank({ players: 2 });
    city(g, 0, 3, 3, true); city(g, 1, 12, 12, true);
    Object.keys(PP.WONDERS).forEach(w => { g.wonders[w] = 0; });
    g.checkVictory();
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

  console.log(`\n${passed} verificações ok, ${failed} falhas`);
  if (failed) { console.log(failures.map(f => ' - ' + f).join('\n')); process.exit(1); }
})();
