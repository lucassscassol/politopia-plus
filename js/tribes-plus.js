/* Chamas de Vardren — tribos da loja (2.5): Kemet, Tarkhan e Ériu. Cada uma tem um jeito próprio de jogar, sem ser
   mais forte que as tribos gratuitas (o balanceamento é conferido nas simulações IA × IA). Elas ficam liberadas para
   o jogador quando o produto correspondente (premium) consta como comprado na conta da Play Store (js/store.js);
   a IA pode usar qualquer tribo. As regras são só do motor: valem igual para a IA e para o jogador.
   - Kemet (vale do rio): Fazendas dão +1 população, Celeiros custam metade; maravilhas custam 20% menos e cada
     maravilha rende +1★ por turno.
   - Tarkhan (estepes): unidades montadas custam 1★ a menos e pagam metade da manutenção; cidades que eles sitiam
     perdem 20% de defesa por turno de cerco (em vez de 10%) e cada tropa inimiga derrotada rende 2★.
   - Ériu (colinas e bosques): Catedrais custam metade e cada Templo rende +1⚗; Missionários custam 1★ a menos,
     Pregar dá +30 de lealdade e o Festival custa metade.
   Os números passaram por simulações IA × IA (liderança e fatia dos pontos por tribo): a primeira versão, com duas
   tecnologias iniciais e bônus maiores, deixava as três acima das tribos gratuitas. */
(function (PP) {
  'use strict';
  const UN = PP.UNITS;

  const NEW = {
    kemet: {
      name: 'Kemet', color: '#2f8f8a', dark: '#174a47', emblem: '🐊', startTech: 'organizacao', startUnit: 'warrior',
      signature: ['crop', ['plains']], exclusive: ['spices', ['plains', 'swamp']],
      premium: 'tribe_kemet', trees: 'dry',
      perk: 'Filhos do rio: Fazendas dão +1 população extra e Celeiros custam metade.',
      unique: 'Construtores eternos: maravilhas custam 20% menos e cada maravilha sua rende +1★ por turno.',
      biome: { base: 'plains', alt: 'desert', altFrac: 0.35, mountain: 0.04, hills: 0.06, forest: 0.04, swamp: 0.06 },
      tint: '#a89a62', resBias: { crop: 2, fish: 1.4, fruit: 1.2 },
      syl: [['Men', 'Tje', 'Nekh', 'Sau', 'Abi', 'Iun', 'Wase', 'Khem', 'Per', 'Djed', 'Hut', 'Ka'], ['', 'ne', 'ka', 'ra', 'bu', 'se'], ['nefer', 'het', 'mose', 'ankh', 'du', 'is', '']],
    },
    tarkhan: {
      name: 'Tarkhan', color: '#7a2a45', dark: '#421624', emblem: '🦅', startTech: 'montaria', startUnit: 'rider',
      signature: ['horses', ['plains', 'tundra']], exclusive: ['gems', ['hills', 'desert']],
      premium: 'tribe_tarkhan', trees: 'mixed',
      perk: 'Nascidos na sela: unidades montadas custam 1★ a menos e pagam metade da manutenção.',
      unique: 'Cerco das estepes: as cidades que eles sitiam perdem 20% de defesa por turno de cerco (em vez de 10%) e cada tropa inimiga derrotada rende 2★.',
      biome: { base: 'plains', alt: 'tundra', altFrac: 0.12, mountain: 0.06, hills: 0.14, forest: 0.06, swamp: 0.0 },
      tint: '#9a8f6a', resBias: { horses: 2.2, game: 1.3 },
      syl: [['Kara', 'Ak', 'Ulan', 'Bor', 'Tem', 'Kök', 'Sar', 'Altan', 'Ordu', 'Bat', 'Yes', 'Tol'], ['', 'u', 'ir', 'al', 'ba', 'gan'], ['balyk', 'kent', 'tepe', 'khot', 'su', 'or', '']],
    },
    eriu: {
      name: 'Ériu', color: '#b5577a', dark: '#5e2b3f', emblem: '🦌', startTech: 'meditacao', startUnit: 'warrior',
      signature: ['game', ['forest']], exclusive: ['ore', ['hills', 'mountain']],
      premium: 'tribe_eriu', trees: 'broad',
      perk: 'Círculos de pedra: Catedrais custam metade e cada Templo rende +1⚗︎.',
      unique: 'Druidas: Missionários custam 1★ a menos, Pregar dá +30 de lealdade (em vez de +20) e o Festival custa metade.',
      biome: { base: 'plains', alt: 'hills', altFrac: 0.2, mountain: 0.08, hills: 0.18, forest: 0.3, swamp: 0.05 },
      tint: '#5f7a52', resBias: { fruit: 1.4, game: 1.3, ore: 1.2 },
      syl: [['Dún', 'Cill', 'Ard', 'Bal', 'Gal', 'Inis', 'Loch', 'Tír', 'Mag', 'Ráth', 'Ben', 'Glen'], ['', 'na', 'mor', 'an', 'ach', 'ly'], ['more', 'dara', 'gal', 'lin', 'ross', 'beag', '']],
    },
  };
  for (const id in NEW) {
    if (PP.TRIBES[id]) continue;
    PP.TRIBES[id] = NEW[id];
    PP.TRIBE_IDS.push(id);
  }
  PP.PREMIUM_TRIBES = Object.keys(NEW);
  PP.isPremiumTribe = id => !!(PP.TRIBES[id] && PP.TRIBES[id].premium);

  PP.TRIBE_RULES = { kemetFarmPop: 1, kemetWonder: 0.8, kemetWonderStars: 1, tarkhanMounted: 1, tarkhanSiege: 0.2, tarkhanLoot: 2, eriuMissionary: 1, eriuPreach: 30, eriuTempleSci: 1 };

  // ------------------------------------------------------------ Extensões encadeadas
  const proto = PP.Game.prototype;
  const chain = (name, fn) => {
    const prev = proto[name];
    proto[name] = function (...args) { return fn.call(this, prev, ...args); };
  };
  const tribeOf = (g, pid) => (g.players[pid] ? g.players[pid].tribe : null);

  // Kemet: Fazendas com +1 população
  chain('doTileAction', function (prev, p, t, id) {
    const city = t && t.cityId ? this.cityMap[t.cityId] : null;
    const ok = prev.call(this, p, t, id);
    if (ok && id === 'farm' && p.tribe === 'kemet' && city && city.owner === p.id && PP.TRIBE_RULES.kemetFarmPop > 0) this.addPop(city, this.popGain ? this.popGain(city, PP.TRIBE_RULES.kemetFarmPop) : PP.TRIBE_RULES.kemetFarmPop);
    return ok;
  });

  // Kemet: Celeiros pela metade (sem dobrar o desconto da cidade agrícola); Ériu: Catedrais pela metade
  chain('buildingCost', function (prev, p, id, c) {
    let cost = prev.call(this, p, id, c);
    if (p && p.tribe === 'kemet' && (id === 'granary' || id === 'granary2') && !(id === 'granary' && c && c.spec === 'agricola')) cost = Math.ceil(cost / 2);
    if (p && p.tribe === 'eriu' && id === 'temple2') cost = Math.ceil(cost / 2);
    return cost;
  });

  // Kemet: maravilhas 20% mais baratas
  chain('wonderCost', function (prev, p, wid) {
    const cost = prev.call(this, p, wid);
    return p && p.tribe === 'kemet' ? Math.max(1, Math.round(cost * PP.TRIBE_RULES.kemetWonder)) : cost;
  });

  // Kemet: +1★ por maravilha
  chain('income', function (prev, p) {
    const res = prev.call(this, p);
    if (p.tribe === 'kemet') {
      let n = 0;
      for (const w in this.wonders) if (this.wonders[w] === p.id) n++;
      if (n && PP.TRIBE_RULES.kemetWonderStars) {
        const a = n * PP.TRIBE_RULES.kemetWonderStars;
        res.stars += a;
        res.lines.push({ label: PP.t('Construtores eternos'), stars: a, sci: 0 });
      }
    }
    return res;
  });

  // Tarkhan: montados 1★ mais baratos; Ériu: Missionários 1★ mais baratos
  chain('unitCost', function (prev, p, c, type) {
    let cost = prev.call(this, p, c, type);
    if (p && p.tribe === 'tarkhan' && UN[type] && UN[type].mounted) cost -= PP.TRIBE_RULES.tarkhanMounted;
    if (p && p.tribe === 'eriu' && type === 'missionary') cost -= PP.TRIBE_RULES.eriuMissionary;
    return Math.max(1, cost);
  });

  // Tarkhan: montados pagam metade da manutenção
  chain('unitUpkeepFor', function (prev, p, type) {
    const v = prev.call(this, p, type);
    return p && p.tribe === 'tarkhan' && UN[type] && UN[type].mounted ? v / 2 : v;
  });

  // Tarkhan: cerco mais rápido
  chain('siegeRate', function (prev, c) {
    const r = prev.call(this, c);
    return this.besiegers(c).some(pid => tribeOf(this, pid) === 'tarkhan') ? Math.max(r, PP.TRIBE_RULES.tarkhanSiege) : r;
  });

  // Ériu: +1⚗ por Templo
  chain('eventCityIncome', function (prev, c, res) {
    if (prev) prev.call(this, c, res);
    if (c.buildings.temple && tribeOf(this, c.owner) === 'eriu') res.sci += PP.TRIBE_RULES.eriuTempleSci;
  });

  // Ériu: Pregar mais forte e Festival pela metade
  chain('preachGain', function (prev, u) {
    return tribeOf(this, u.owner) === 'eriu' ? PP.TRIBE_RULES.eriuPreach : prev.call(this, u);
  });

  chain('cprojCost', function (prev, c, id) {
    const cost = prev.call(this, c, id);
    return id === 'festival' && tribeOf(this, c.owner) === 'eriu' ? Math.ceil(cost / 2) : cost;
  });

  PP.registerSystem('tribes-plus', {
    // Tarkhan: saque de cada tropa inimiga derrotada
    unitKilled(g, u, killer) {
      if (!killer || killer.owner === u.owner) return;
      const k = g.players[killer.owner];
      if (!k || k.tribe !== 'tarkhan') return;
      k.stars += PP.TRIBE_RULES.tarkhanLoot;
      k.stats.loot = (k.stats.loot || 0) + PP.TRIBE_RULES.tarkhanLoot;
    },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
