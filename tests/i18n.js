// Testes dos idiomas: cobertura dos dicionários (inglês e espanhol), camada de dados das regras e garantia de que
// o idioma não muda a jogabilidade. Uso: node tests/i18n.js
const PP = require('./load.js');
const { collect: collectKeys } = require('./i18n-keys.js');
const { collect: collectData } = require('./i18n-data.js');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.log('  ✗ ' + msg); }
}
async function test(name, fn) {
  try { await fn(); console.log('✓ ' + name); } catch (e) { failed++; console.log('✗ ' + name + '\n   ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n   ')); }
}

const LANGS = Object.keys(PP.LANGS).filter(l => l !== 'pt');
const vars = s => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
const tags = s => (String(s).match(/<\/?\w+/g) || []).sort().join(',');

(async () => {
  PP.applyLanguage('pt');
  const keys = collectKeys();
  const data = collectData(PP);

  await test('todas as chaves de texto do código e do index.html têm tradução', () => {
    ok(keys.size > 700, 'poucas chaves encontradas: ' + keys.size);
    for (const l of LANGS) {
      const d = PP.I18N[l];
      ok(!!d, 'dicionário ausente: ' + l);
      const missing = [...keys.keys()].filter(k => !d[k] || !String(d[k]).trim());
      ok(!missing.length, `${l}: ${missing.length} sem tradução: ${missing.slice(0, 8).map(k => JSON.stringify(k) + ' (' + keys.get(k) + ')').join(', ')}`);
    }
  });

  await test('dicionários sem chaves obsoletas', () => {
    for (const l of LANGS) {
      const stale = Object.keys(PP.I18N[l]).filter(k => !keys.has(k));
      ok(!stale.length, `${l}: ${stale.length} chaves que o código não usa mais: ${stale.slice(0, 8).map(k => JSON.stringify(k)).join(', ')}`);
    }
  });

  await test('traduções mantêm as variáveis {x} e as tags HTML', () => {
    for (const l of LANGS) {
      for (const k of keys.keys()) {
        const tr = PP.I18N[l][k];
        if (tr == null) continue;
        ok(vars(k) === vars(tr), `${l}: variáveis diferentes em ${JSON.stringify(k)} → ${JSON.stringify(tr)}`);
        ok(tags(k) === tags(tr), `${l}: tags diferentes em ${JSON.stringify(k)} → ${JSON.stringify(tr)}`);
      }
      for (const p in data) {
        const tr = PP.I18N_DATA[l][p];
        if (tr != null) ok(vars(data[p]) === vars(tr), `${l}: variáveis diferentes em ${p}`);
      }
    }
  });

  await test('textos das regras (unidades, tecnologias, construções...) cobertos em todos os idiomas', () => {
    const paths = Object.keys(data);
    ok(paths.length > 450, 'poucos textos de dados: ' + paths.length);
    for (const l of LANGS) {
      const d = PP.I18N_DATA[l] || {};
      const missing = paths.filter(p => !d[p] || !String(d[p]).trim());
      ok(!missing.length, `${l}: ${missing.length} textos de regras sem tradução: ${missing.slice(0, 8).join(', ')}`);
      const unknown = Object.keys(d).filter(p => !(p in data));
      ok(!unknown.length, `${l}: caminhos que não existem mais: ${unknown.slice(0, 8).join(', ')}`);
    }
  });

  await test('trocar de idioma aplica e desfaz a camada de dados', () => {
    PP.applyLanguage('en');
    ok(PP.lang === 'en', 'idioma não mudou');
    ok(PP.UNITS.warrior.name === 'Warrior', 'nome da unidade em inglês: ' + PP.UNITS.warrior.name);
    ok(PP.TECH.montaria.name === PP.I18N_DATA.en['TECH.montaria.name'], 'tecnologia em inglês');
    ok(PP.ACHIEVEMENTS[0].name === PP.I18N_DATA.en['ACHIEVEMENT.fundador.name'], 'conquista (lista e mapa compartilham o objeto)');
    ok(PP.NAVAL[1].name === 'Raft', 'embarcação em inglês');
    ok(PP.t('Turno {n}', { n: 3 }) === 'Turn 3', 'PP.t com variável: ' + PP.t('Turno {n}', { n: 3 }));
    ok(PP.num(1.5) === '1.5', 'número em inglês: ' + PP.num(1.5));
    PP.applyLanguage('es');
    ok(PP.UNITS.warrior.name === 'Guerrero', 'nome da unidade em espanhol: ' + PP.UNITS.warrior.name);
    ok(PP.num(1.5) === '1,5', 'número em espanhol');
    PP.applyLanguage('pt');
    ok(PP.UNITS.warrior.name === 'Guerreiro', 'voltou ao português: ' + PP.UNITS.warrior.name);
    ok(PP.TERRAIN.forest.info === data['TERRAIN.forest.info'], 'informação do terreno restaurada');
    ok(PP.t('Turno {n}', { n: 3 }) === 'Turno 3', 'PP.t em português');
    ok(PP.t('texto sem tradução') === 'texto sem tradução', 'texto sem tradução cai no original');
    PP.applyLanguage('xx');
    ok(PP.lang === 'pt', 'idioma desconhecido vira português');
  });

  // Partida IA x IA com a mesma semente: o resultado tem de ser idêntico em qualquer idioma
  async function run(lang, seed, turns) {
    PP.applyLanguage(lang);
    const tribes = PP.TRIBE_IDS.slice(0, 4);
    const g = new PP.Game().setup({ seed, size: 16, mapType: 'continentes', difficulty: 'dificil', victory: 'dominacao',
      players: tribes.map(t => ({ tribe: t, human: false })) });
    const texts = [];
    while (!g.over && g.turn <= turns) {
      await PP.AI.takeTurn(g);
      if (g.over) break;
      for (const p of g.players) {
        if (!p.alive) continue;
        const inc = g.income(p);
        texts.push(...(inc.notes || []), ...(inc.lines || []).map(x => x.label));
        if (g.victoryProgress) texts.push(...g.victoryProgress(p).map(v => v.text));
        for (const c of g.citiesOf(p.id)) {
          if (g.loyaltyFactors) texts.push(...g.loyaltyFactors(c).map(f => f[0]));
          const st = g.cityStatus && g.cityStatus(c);
          if (st) texts.push(st.name);
          for (const type of PP.TRAINABLE) { const chk = g.trainCheck(p, c, type); if (chk.reason) texts.push(chk.reason); }
        }
      }
      g.endTurn();
    }
    texts.push(...g.logs.map(l => l.text));
    const sig = JSON.stringify({
      turn: g.turn, over: g.over, winner: g.winner,
      players: g.players.map(p => ({ alive: p.alive, stars: p.stars, sci: p.science, techs: Object.keys(p.techs).sort(), rep: p.reputation, score: g.score(p) })),
      units: g.units.map(u => [u.type, u.owner, u.x, u.y, u.hp]),
      cities: g.cities.map(c => [c.owner, c.x, c.y, c.level, c.pop, c.spec || '']),
      logs: g.logs.length,
    });
    const names = new Set();
    for (const p of g.players) names.add(p.name);
    for (const c of g.cities) names.add(c.name);
    for (const t of PP.TRIBE_IDS) { names.add(PP.TRIBES[t].name); (PP.TRIBES[t].cities || []).forEach(n => names.add(n)); }
    PP.applyLanguage('pt');
    return { sig, texts, names };
  }

  const strip = (s, names) => { let o = ' ' + s + ' '; for (const n of [...names].sort((a, b) => b.length - a.length)) o = o.split(n).join(' '); return o; };
  const PT_WORDS = /\b(não|uma|foi|com|para|cidade|cidades|turnos?|guerra|tribo|estrelas|ciência|aliança|população|recusou|declarou|conquistou|fundou)\b|[ãõç]/i;
  const PT_ONLY = /\b(não|uma|foi|cidade|cidades|tribo|estrelas|ciência|aliança|população|recusou|declarou|conquistou|fundou)\b|[ãõç]/i;

  await test('o idioma não altera a jogabilidade (mesma semente, mesmo resultado)', async () => {
    const pt = await run('pt', 777, 30);
    for (const l of LANGS) {
      const r = await run(l, 777, 30);
      ok(r.sig === pt.sig, `partida em ${l} divergiu da partida em português`);
    }
  });

  await test('partida em inglês e em espanhol não deixa textos em português no motor', async () => {
    for (const l of LANGS) {
      const r = await run(l, 31337, 45);
      // em espanhol várias palavras coincidem com o português (con, para, turnos, guerra); lá só contam as exclusivas do português
      const re = l === 'es' ? PT_ONLY : PT_WORDS;
      const real = [...new Set(r.texts.filter(Boolean).map(String))].filter(t => re.test(strip(t, r.names)));
      ok(r.texts.length > 200, `${l}: poucos textos coletados (${r.texts.length})`);
      ok(!real.length, `${l}: textos em português: ${real.slice(0, 6).map(t => JSON.stringify(t)).join(' | ')}`);
    }
  });

  console.log(`\n${passed} verificações ok, ${failed} falhas`);
  process.exit(failed ? 1 : 0);
})();
