/* Politopia+ — definições de regras: terrenos, recursos, tecnologias, unidades, construções, tribos */
(function (PP) {
  'use strict';

  // ---------------------------------------------------------------- Terrenos
  PP.TERRAIN = {
    ocean:    { name: 'Oceano',      water: true, deep: true, cost: 1, color: '#1d5d9b' },
    water:    { name: 'Águas rasas', water: true, cost: 1, color: '#3b8fd0' },
    plains:   { name: 'Planície',  cost: 1, color: '#9cc85a' },
    forest:   { name: 'Floresta',  cost: 2, color: '#6fa24a', info: 'Defesa x1,5 com Arco e Flecha' },
    hills:    { name: 'Colinas',   cost: 2, color: '#a8b460', vision: 1, info: 'Defesa x1,25 · +1 visão' },
    mountain: { name: 'Montanha',  cost: 3, color: '#8f8a7d', vision: 1, info: 'Requer Escalada · defesa x1,5 · montados não entram' },
    desert:   { name: 'Deserto',   cost: 1, color: '#e2c77c' },
    tundra:   { name: 'Tundra',    cost: 1, color: '#c6d3cf' },
    swamp:    { name: 'Pântano',   cost: 2, color: '#6f8a55', info: 'Defesa x0,8' },
  };
  PP.LAND_TERRAINS = ['plains', 'forest', 'hills', 'mountain', 'desert', 'tundra', 'swamp'];

  // ---------------------------------------------------------------- Recursos
  PP.RESOURCES = {
    fruit:  { name: 'Frutas',          icon: '🍇' },
    crop:   { name: 'Plantação',       icon: '🌾' },
    game:   { name: 'Animais',         icon: '🦌' },
    fish:   { name: 'Peixes',          icon: '🐟' },
    whale:  { name: 'Baleias',         icon: '🐋' },
    ore:    { name: 'Minério de ferro', icon: '🪨', info: 'Com uma Mina, fornece Ferro' },
    horses: { name: 'Cavalos',         icon: '🐴', info: 'Com um Pasto, fornece Cavalos' },
    gems:   { name: 'Gemas',           icon: '💎', info: 'Garimpo gera estrelas por turno' },
    spices: { name: 'Especiarias',     icon: '🌶️', info: 'Plantação gera estrelas por turno' },
  };

  // Recursos estratégicos: quais melhorias os fornecem
  PP.STRATEGIC = {
    iron:   { name: 'Ferro',   icon: '⚒️', imp: 'mine' },
    horses: { name: 'Cavalos', icon: '🐴', imp: 'pasture' },
  };

  // ---------------------------------------------------------------- Tecnologias
  PP.TECH_BASE = { 1: 4, 2: 7, 3: 11, 4: 16 };
  PP.TECHS = [
    { id: 'montaria',     tier: 1, req: [], name: 'Montaria',       icon: '🐎', desc: 'Unidade: Cavaleiro Leve' },
    { id: 'organizacao',  tier: 1, req: [], name: 'Organização',    icon: '📋', desc: 'Construção: Celeiro' },
    { id: 'escalada',     tier: 1, req: [], name: 'Escalada',       icon: '🧗', desc: 'Mover em montanhas e defesa x1,5 nelas' },
    { id: 'pesca',        tier: 1, req: [], name: 'Pesca',          icon: '🎣', desc: 'Pescar peixes' },
    { id: 'caca',         tier: 1, req: [], name: 'Caça',           icon: '🦌', desc: 'Caçar animais · Unidade: Batedor' },

    { id: 'estradas',     tier: 2, req: ['montaria'],    name: 'Estradas',       icon: '🛤️', desc: 'Estradas (movimento x2) · cidades conectadas à capital geram +1★' },
    { id: 'pastoreio',    tier: 2, req: ['montaria'],    name: 'Pastoreio',      icon: '🐴', desc: 'Pasto em Cavalos (recurso estratégico)' },
    { id: 'agricultura',  tier: 2, req: ['organizacao'], name: 'Agricultura',    icon: '🌾', desc: 'Fazenda · Drenar pântano' },
    { id: 'estrategia',   tier: 2, req: ['organizacao'], name: 'Estratégia',     icon: '♟️', desc: 'Unidade: Defensor · Muralhas · Quartel' },
    { id: 'escrita',      tier: 2, req: ['organizacao'], name: 'Escrita',        icon: '📜', desc: 'Biblioteca (+2⚗\uFE0E)' },
    { id: 'mineracao',    tier: 2, req: ['escalada'],    name: 'Mineração',      icon: '⛏️', desc: 'Mina (Ferro) · Garimpo · Unidade: Piqueiro' },
    { id: 'meditacao',    tier: 2, req: ['escalada'],    name: 'Meditação',      icon: '🧘', desc: 'Templo · Maravilha: Oráculo' },
    { id: 'navegacao',    tier: 2, req: ['pesca'],       name: 'Navegação',      icon: '⛵', desc: 'Porto · unidades embarcam como Barcos em águas rasas' },
    { id: 'arco',         tier: 2, req: ['caca'],        name: 'Arco e Flecha',  icon: '🏹', desc: 'Unidade: Arqueiro · defesa x1,5 em florestas' },
    { id: 'silvicultura', tier: 2, req: ['caca'],        name: 'Silvicultura',   icon: '🪓', desc: 'Cabana de lenhador · Derrubar e plantar floresta' },

    { id: 'comercio',     tier: 3, req: ['estradas'],     name: 'Comércio',     icon: '⚖️', desc: 'Mercado · Plantação de especiarias · rotas geram +2★' },
    { id: 'cavalaria',    tier: 3, req: ['pastoreio'],    name: 'Cavalaria',    icon: '🏇', desc: 'Unidade: Cavaleiro (requer Cavalos)' },
    { id: 'construcao',   tier: 3, req: ['agricultura'],  name: 'Construção',   icon: '🏗️', desc: 'Moinho · Queimar floresta · Maravilha: Pirâmides' },
    { id: 'matematica',   tier: 3, req: ['silvicultura'], name: 'Matemática',   icon: '📐', desc: 'Serraria · Unidade: Catapulta' },
    { id: 'forja',        tier: 3, req: ['mineracao'],    name: 'Forja',        icon: '⚒️', desc: 'Forja · Unidade: Espadachim (requer Ferro)' },
    { id: 'filosofia',    tier: 3, req: ['meditacao'],    name: 'Filosofia',    icon: '🏛️', desc: 'Unidade: Missionário · tecnologias -15% · Grande Biblioteca' },
    { id: 'cartografia',  tier: 3, req: ['navegacao'],    name: 'Cartografia',  icon: '🧭', desc: 'Navios · oceano · Caça à baleia · Maravilha: Colosso' },

    { id: 'polvora',      tier: 4, req: ['forja', 'matematica'],    name: 'Pólvora',          icon: '💥', desc: 'Mosqueteiro e Canhão (requerem Ferro)' },
    { id: 'eng_naval',    tier: 4, req: ['cartografia', 'forja'],   name: 'Engenharia Naval', icon: '⚓', desc: 'Couraçados' },
    { id: 'educacao',     tier: 4, req: ['filosofia', 'escrita'],   name: 'Educação',         icon: '🎓', desc: 'Universidade · Maravilha: Olho dos Deuses' },
    { id: 'economia',     tier: 4, req: ['comercio', 'escrita'],    name: 'Economia',         icon: '🏦', desc: 'Banco (+3★)' },
    { id: 'arquitetura',  tier: 4, req: ['construcao', 'matematica'], name: 'Arquitetura',    icon: '🏰', desc: 'Muralhas pela metade do preço · Grande Muralha' },
  ];
  PP.TECH = {};
  PP.TECHS.forEach(t => { PP.TECH[t.id] = t; });

  // ---------------------------------------------------------------- Unidades
  // skills: dash (ataca após mover), escape (move após atacar), persist (ataca de novo após matar),
  // fortify, creep (ignora terreno), stiff (não revida), splash, heal, convert, antimount
  PP.UNITS = {
    warrior:   { name: 'Guerreiro',     icon: '🗡️', cost: 2,  hp: 10, atk: 2,   def: 2, move: 1, range: 1, vision: 1, skills: ['dash', 'fortify'] },
    scout:     { name: 'Batedor',       icon: '🧭', cost: 3,  hp: 8,  atk: 1,   def: 1, move: 3, range: 1, vision: 2, skills: ['dash', 'escape', 'creep'], tech: 'caca' },
    rider:     { name: 'Cavaleiro Leve', icon: '🐎', cost: 3, hp: 10, atk: 2,   def: 1, move: 2, range: 1, vision: 1, skills: ['dash', 'escape', 'fortify'], mounted: true, tech: 'montaria' },
    archer:    { name: 'Arqueiro',      icon: '🏹', cost: 3,  hp: 10, atk: 2,   def: 1, move: 1, range: 2, vision: 1, skills: ['dash', 'fortify'], tech: 'arco' },
    defender:  { name: 'Defensor',      icon: '🛡️', cost: 3,  hp: 15, atk: 1,   def: 3, move: 1, range: 1, vision: 1, skills: ['fortify'], tech: 'estrategia' },
    pikeman:   { name: 'Piqueiro',      icon: '🔱', cost: 4,  hp: 12, atk: 2,   def: 2, move: 1, range: 1, vision: 1, skills: ['fortify', 'antimount'], tech: 'mineracao' },
    swordsman: { name: 'Espadachim',    icon: '⚔️', cost: 5,  hp: 15, atk: 3,   def: 3, move: 1, range: 1, vision: 1, skills: ['dash'], tech: 'forja', needs: 'iron' },
    catapult:  { name: 'Catapulta',     icon: '☄️', cost: 8,  hp: 10, atk: 4,   def: 0, move: 1, range: 3, vision: 1, skills: ['stiff'], tech: 'matematica' },
    knight:    { name: 'Cavaleiro',     icon: '🏇', cost: 8,  hp: 15, atk: 3.5, def: 1, move: 3, range: 1, vision: 1, skills: ['dash', 'persist', 'fortify'], mounted: true, tech: 'cavalaria', needs: 'horses' },
    missionary:{ name: 'Missionário',   icon: '📿', cost: 5,  hp: 10, atk: 0,   def: 1, move: 1, range: 1, vision: 1, skills: ['heal', 'convert', 'stiff'], tech: 'filosofia' },
    musketeer: { name: 'Mosqueteiro',   icon: '💂', cost: 10, hp: 16, atk: 4,   def: 3, move: 1, range: 2, vision: 1, skills: ['dash', 'fortify'], tech: 'polvora', needs: 'iron' },
    cannon:    { name: 'Canhão',        icon: '💥', cost: 12, hp: 10, atk: 5,   def: 1, move: 1, range: 3, vision: 1, skills: ['stiff', 'splash'], tech: 'polvora', needs: 'iron' },
    giant:     { name: 'Gigante',       icon: '🗿', cost: 0,  hp: 40, atk: 5,   def: 4, move: 1, range: 1, vision: 1, skills: ['dash'], special: true },
  };
  PP.TRAINABLE = ['warrior', 'scout', 'rider', 'archer', 'defender', 'pikeman', 'swordsman', 'catapult', 'knight', 'missionary', 'musketeer', 'cannon'];

  // Unidades em água viram embarcações; o nível depende da melhor tecnologia naval do dono.
  PP.NAVAL = [
    null,
    { name: 'Barco',     icon: '⛵', atk: 1, def: 1, move: 2, range: 2, skills: ['dash', 'escape'] },
    { name: 'Navio',     icon: '🚢', atk: 2, def: 2, move: 3, range: 2, skills: ['dash', 'escape'] },
    { name: 'Couraçado', icon: '🛳️', atk: 4, def: 3, move: 3, range: 2, skills: ['dash', 'escape'] },
  ];

  PP.SKILL_NAMES = {
    dash: 'Investida (ataca após mover)', escape: 'Fuga (move após atacar)', persist: 'Persistência (ataca de novo após matar)',
    fortify: 'Fortificar', creep: 'Rastejar (ignora terreno)', stiff: 'Rígido (não revida)', splash: 'Explosão (dano em área)',
    heal: 'Curar aliados', convert: 'Converter inimigos', antimount: 'Anti-montaria (x2 def / x1,5 atq vs montados)',
  };

  PP.PROMOTIONS = {
    forca:     { name: 'Força',     icon: '💪', desc: '+0,5 ataque' },
    escudo:    { name: 'Escudo',    icon: '🛡️', desc: '+0,5 defesa' },
    vigor:     { name: 'Vigor',     icon: '❤️', desc: '+5 vida máxima' },
    agilidade: { name: 'Agilidade', icon: '👟', desc: '+1 movimento' },
  };
  PP.XP_LEVELS = [3, 7]; // XP para Veterano e Elite

  // ---------------------------------------------------------------- Ações em casas (melhorias)
  // res: recurso exigido · terrain: terrenos permitidos · empty: casa sem recurso/melhoria
  // pop: população dada à cidade · gold: estrelas imediatas · imp: melhoria construída
  // unique: uma por cidade · adj/per: bônus por melhoria vizinha · income: ★ por turno
  PP.TILE_ACTIONS = [
    { id: 'harvest',    name: 'Colher frutas',     icon: '🧺', cost: 2, res: 'fruit',  pop: 1, consume: true },
    { id: 'hunt',       name: 'Caçar',             icon: '🏹', cost: 2, tech: 'caca',        res: 'game',   pop: 1, consume: true },
    { id: 'fishing',    name: 'Pescar',            icon: '🎣', cost: 2, tech: 'pesca',       res: 'fish',   pop: 1, consume: true },
    { id: 'whaling',    name: 'Caçar baleia',      icon: '🐋', cost: 2, tech: 'cartografia', res: 'whale',  gold: 10, consume: true },
    { id: 'farm',       name: 'Fazenda',           icon: '🚜', cost: 5, tech: 'agricultura', res: 'crop',   pop: 2, imp: 'farm' },
    { id: 'mine',       name: 'Mina',              icon: '⛏️', cost: 5, tech: 'mineracao',   res: 'ore',    pop: 2, imp: 'mine' },
    { id: 'pasture',    name: 'Pasto',             icon: '🐴', cost: 4, tech: 'pastoreio',   res: 'horses', pop: 1, imp: 'pasture' },
    { id: 'gemmine',    name: 'Garimpo',           icon: '💎', cost: 6, tech: 'mineracao',   res: 'gems',   pop: 1, imp: 'gemmine', income: 2 },
    { id: 'plantation', name: 'Plantação de especiarias', icon: '🌶️', cost: 6, tech: 'comercio', res: 'spices', pop: 1, imp: 'plantation', income: 2 },
    { id: 'lumber',     name: 'Cabana de lenhador', icon: '🛖', cost: 3, tech: 'silvicultura', terrain: ['forest'], empty: true, pop: 1, imp: 'lumber' },
    { id: 'sawmill',    name: 'Serraria',          icon: '🪚', cost: 5, tech: 'matematica',  terrain: ['plains', 'desert', 'tundra', 'hills'], empty: true, unique: true, adj: 'lumber', per: 1, imp: 'sawmill' },
    { id: 'windmill',   name: 'Moinho',            icon: '🌬️', cost: 5, tech: 'construcao',  terrain: ['plains', 'desert', 'tundra', 'hills'], empty: true, unique: true, adj: 'farm', per: 1, imp: 'windmill' },
    { id: 'forge',      name: 'Forja',             icon: '🔥', cost: 5, tech: 'forja',       terrain: ['plains', 'desert', 'tundra', 'hills'], empty: true, unique: true, adj: 'mine', per: 2, imp: 'forge' },
    { id: 'market',     name: 'Mercado',           icon: '🏪', cost: 5, tech: 'comercio',    terrain: ['plains', 'desert', 'tundra', 'hills'], empty: true, unique: true, imp: 'market' },
    { id: 'port',       name: 'Porto',             icon: '⚓', cost: 7, tech: 'navegacao',   terrain: ['water'], empty: true, pop: 1, imp: 'port' },
    { id: 'road',       name: 'Estrada',           icon: '🛤️', cost: 2, tech: 'estradas',    road: true },
    { id: 'clear',      name: 'Derrubar floresta', icon: '🪵', cost: 0, tech: 'silvicultura', terrain: ['forest'], noImp: true, gold: 2, toTerrain: 'plains' },
    { id: 'burn',       name: 'Queimar floresta',  icon: '🔥', cost: 5, tech: 'construcao',  terrain: ['forest'], noImp: true, toTerrain: 'plains', newRes: 'crop' },
    { id: 'plant',      name: 'Plantar floresta',  icon: '🌳', cost: 5, tech: 'silvicultura', terrain: ['plains'], empty: true, toTerrain: 'forest' },
    { id: 'drain',      name: 'Drenar pântano',    icon: '💧', cost: 4, tech: 'agricultura', terrain: ['swamp'], noImp: true, toTerrain: 'plains', newRes: 'crop' },
  ];
  PP.TILE_ACTION = {};
  PP.TILE_ACTIONS.forEach(a => { PP.TILE_ACTION[a.id] = a; });

  PP.IMPROVEMENTS = {
    farm: { name: 'Fazenda', icon: '🚜' }, mine: { name: 'Mina', icon: '⛏️' }, pasture: { name: 'Pasto', icon: '🐴' },
    gemmine: { name: 'Garimpo', icon: '💎' }, plantation: { name: 'Plantação de especiarias', icon: '🌶️' },
    lumber: { name: 'Cabana de lenhador', icon: '🛖' }, sawmill: { name: 'Serraria', icon: '🪚' },
    windmill: { name: 'Moinho', icon: '🌬️' }, forge: { name: 'Forja', icon: '🔥' }, market: { name: 'Mercado', icon: '🏪' },
    port: { name: 'Porto', icon: '⚓' },
  };

  // ---------------------------------------------------------------- Construções de cidade
  PP.BUILDINGS = {
    walls:      { name: 'Muralhas',     icon: '🧱', cost: 5,  tech: 'estrategia', desc: 'Defesa x3 para unidades na cidade' },
    barracks:   { name: 'Quartel',      icon: '🏕️', cost: 6,  tech: 'estrategia', desc: '+2 capacidade de unidades · novas unidades nascem com 1 XP' },
    granary:    { name: 'Celeiro',      icon: '🌽', cost: 6,  tech: 'organizacao', desc: '+2 população', pop: 2 },
    library:    { name: 'Biblioteca',   icon: '📚', cost: 6,  tech: 'escrita', desc: '+2⚗\uFE0E por turno', sci: 2 },
    temple:     { name: 'Templo',       icon: '⛩️', cost: 8,  tech: 'meditacao', desc: '+1 população · +100 pontos · cura extra na cidade', pop: 1 },
    university: { name: 'Universidade', icon: '🎓', cost: 12, tech: 'educacao', desc: '+3⚗\uFE0E por turno (requer Biblioteca)', sci: 3, needs: 'library' },
    bank:       { name: 'Banco',        icon: '🏦', cost: 12, tech: 'economia', desc: '+3★ por turno', gold: 3 },
  };
  PP.BUILDING_ORDER = ['walls', 'barracks', 'granary', 'library', 'temple', 'university', 'bank'];

  // ---------------------------------------------------------------- Maravilhas (únicas no mundo)
  PP.WONDERS = {
    oracle:        { name: 'Oráculo',            icon: '🔮', cost: 14, tech: 'meditacao',   desc: 'Tecnologia grátis imediata e +2⚗\uFE0E por turno' },
    pyramids:      { name: 'Pirâmides',          icon: '🔺', cost: 18, tech: 'construcao',  desc: '+3★ por turno' },
    great_library: { name: 'Grande Biblioteca',  icon: '🏛️', cost: 20, tech: 'filosofia',   desc: '+4⚗\uFE0E por turno' },
    colossus:      { name: 'Colosso',            icon: '🗽', cost: 18, tech: 'cartografia', desc: '+1★ por turno para cada porto seu', coastal: true },
    great_wall:    { name: 'Grande Muralha',     icon: '🏯', cost: 20, tech: 'arquitetura', desc: '+0,5 no bônus de defesa de todas as suas cidades' },
    eye:           { name: 'Olho dos Deuses',    icon: '👁️', cost: 16, tech: 'educacao',    desc: 'Revela o mapa inteiro' },
  };
  PP.WONDER_POP = 3;

  // ---------------------------------------------------------------- Recompensas de nível de cidade
  PP.REWARDS = {
    workshop:  { name: 'Oficina',     icon: '🔨', desc: '+1★ por turno' },
    academy:   { name: 'Academia',    icon: '🔭', desc: '+1⚗\uFE0E por turno' },
    walls:     { name: 'Muralhas',    icon: '🧱', desc: 'Defesa x3 na cidade' },
    scholars:  { name: 'Estudiosos',  icon: '📖', desc: '+6⚗\uFE0E imediatamente' },
    resources: { name: 'Recursos',    icon: '💰', desc: '+5★ imediatamente' },
    explorer:  { name: 'Explorador',  icon: '🗺️', desc: 'Revela uma grande área do mapa' },
    growth:    { name: 'Crescimento', icon: '🌱', desc: '+3 população' },
    borders:   { name: 'Fronteiras',  icon: '🚩', desc: 'Expande o território da cidade' },
    park:      { name: 'Parque',      icon: '🌳', desc: '+1★ por turno e +200 pontos' },
    giant:     { name: 'Gigante',     icon: '🗿', desc: 'Uma super unidade (40 de vida)' },
  };

  // ---------------------------------------------------------------- Dificuldade
  PP.DIFFICULTY = {
    facil:   { name: 'Fácil',   stars: 0, sci: 0, aggr: 0.6,  smart: 0.55 },
    normal:  { name: 'Normal',  stars: 1, sci: 0, aggr: 1.0,  smart: 0.85 },
    dificil: { name: 'Difícil', stars: 2, sci: 1, aggr: 1.2,  smart: 1 },
    insano:  { name: 'Insano',  stars: 4, sci: 2, aggr: 1.4,  smart: 1 },
  };

  PP.MAP_TYPES = {
    pangeia:     { name: 'Pangeia',     land: 0.62 },
    continentes: { name: 'Continentes', land: 0.5 },
    arquipelago: { name: 'Arquipélago', land: 0.38 },
    lagos:       { name: 'Lagos',       land: 0.75 },
  };
  PP.MAP_SIZES = { 14: 'Pequeno (14×14)', 18: 'Médio (18×18)', 22: 'Grande (22×22)', 26: 'Enorme (26×26)' };

  // ---------------------------------------------------------------- Tribos
  PP.TRIBES = {
    aymara: {
      name: 'Aymará', color: '#9e3a2f', dark: '#5a1f19', emblem: '🦙', startTech: 'escalada', extraTech: 'mineracao', startUnit: 'warrior',
      perk: 'Povo das montanhas: Minas e Garimpos dão +1 população extra.',
      biome: { base: 'plains', alt: 'tundra', altFrac: 0.15, mountain: 0.2, hills: 0.2, forest: 0.18, swamp: 0.0 },
      tint: '#8a7d5c', resBias: { ore: 2, gems: 1.6, horses: 1.2 },
      syl: [['Pa', 'Chu', 'Qui', 'Ti', 'Ay', 'U', 'Ko', 'Pu', 'Ma', 'Il', 'Sa', 'Wa'], ['ta', 'ni', 'llo', 'ka', 'ma', 'ra', 'wa', 'qa', 'yu', 'ri'], ['pampa', 'marka', 'wasi', 'quta', 'llacta', 'kancha', '']],
    },
    tupina: {
      name: 'Tupinás', color: '#4f7a3f', dark: '#2a4422', emblem: '🦜', startTech: 'caca', startUnit: 'warrior',
      perk: 'Filhos da mata: florestas custam 1 de movimento e sempre dão defesa.',
      biome: { base: 'plains', alt: 'swamp', altFrac: 0.08, mountain: 0.05, hills: 0.07, forest: 0.48, swamp: 0.08 },
      tint: '#4d6b3a', resBias: { game: 1.8, fruit: 1.4, spices: 1.6 },
      syl: [['Ita', 'Pira', 'Ara', 'Gua', 'Tu', 'Ja', 'Ibi', 'Iga', 'Mo', 'Cu', 'Ta', 'Ybi'], ['pu', 'ra', 'ti', 'cu', 'ju', 'ma', 'po', 'ba', 'na', 'é'], ['tinga', 'rana', 'guaçu', 'mirim', 'poranga', 'tuba', '']],
    },
    vikar: {
      name: 'Vikar', color: '#4a7394', dark: '#263e52', emblem: '🐺', startTech: 'pesca', startUnit: 'warrior',
      perk: 'Navegadores do gelo: embarcações têm +1 de movimento e pescar dá +1 população extra.',
      biome: { base: 'tundra', alt: 'plains', altFrac: 0.25, mountain: 0.12, hills: 0.12, forest: 0.25, swamp: 0.0 },
      tint: '#7c8783', resBias: { fish: 1.8, whale: 2, game: 1.2 },
      syl: [['Skal', 'Hvit', 'Fjor', 'Ul', 'Rag', 'Tor', 'Isa', 'Bjør', 'Kvik', 'Frey', 'Sig', 'Vall'], ['', 'ne', 'ha', 'vi', 'gar', 'ma'], ['heim', 'vik', 'fjord', 'borg', 'havn', 'dal', 'nes']],
    },
    qadir: {
      name: 'Qadir', color: '#b58a36', dark: '#6a4f1c', emblem: '🐪', startTech: 'montaria', startUnit: 'rider',
      perk: 'Mercadores das dunas: a capital gera +2★ e cada cidade conectada por estrada ou porto gera +1★ extra.',
      biome: { base: 'desert', alt: 'plains', altFrac: 0.2, mountain: 0.07, hills: 0.13, forest: 0.05, swamp: 0.0 },
      tint: '#a8905f', resBias: { horses: 1.8, gems: 1.6, crop: 0.8 },
      syl: [['Al', 'Qa', 'Sa', 'Mar', 'Zu', 'Ha', 'Ka', 'Ra', 'Da', 'Ja', 'Ba', 'Na'], ['sh', 'dir', 'ma', 'bar', 'ha', 'ra', 'zi', 'li'], ['kand', 'abad', 'ira', 'un', 'ar', 'at', '']],
    },
    hanlu: {
      name: 'Han-Lu', color: '#6f5391', dark: '#3d2c52', emblem: '🐉', startTech: 'organizacao', startUnit: 'warrior',
      perk: 'Império de jade: tecnologias custam 10% menos.',
      biome: { base: 'plains', alt: 'hills', altFrac: 0.05, mountain: 0.1, hills: 0.1, forest: 0.22, swamp: 0.05 },
      tint: '#6f8350', resBias: { crop: 1.8, fruit: 1.2, spices: 1.2 },
      syl: [['Lu', 'Shan', 'Hai', 'Jin', 'Xi', 'Long', 'Yu', 'Ming', 'Bai', 'Qing', 'Tian', 'Zhou'], ['', '', 'an', 'ling'], ['jing', 'yang', 'men', 'kou', 'shan', 'du', 'ping', 'zhou']],
    },
    zambe: {
      name: 'Zambé', color: '#b2602b', dark: '#653414', emblem: '🦁', startTech: 'caca', startUnit: 'warrior', extraUnit: 'warrior',
      perk: 'Guerreiros da savana: começam com um guerreiro extra; unidades ganham XP em dobro e curam +2.',
      biome: { base: 'plains', alt: 'desert', altFrac: 0.12, mountain: 0.05, hills: 0.15, forest: 0.14, swamp: 0.05 },
      tint: '#8f874f', resBias: { game: 1.4, horses: 1.4, fruit: 1.2 },
      syl: [['Zam', 'Ku', 'Mbe', 'Ta', 'Nya', 'Ki', 'Ma', 'Lu', 'Ba', 'Oyo', 'Ze', 'Dan'], ['la', 'bu', 'ngo', 'si', 'ri', 'ka', 'we'], ['mbe', 'wa', 'la', 'ndi', 'ga', 'ro', '']],
    },
  };
  PP.TRIBE_IDS = Object.keys(PP.TRIBES);
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
