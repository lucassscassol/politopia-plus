/* Chamas de Vardren — definições de regras: terrenos, recursos, tecnologias, unidades, construções, tribos */
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
    whale:  { name: 'Baleias',         icon: '🐋', info: 'Caçar dá +10★ na hora; a Estação baleeira dá +1★ por turno e conta como luxo' },
    ore:    { name: 'Minério de ferro', icon: '🪨', info: 'Com uma Mina, fornece Ferro; cada fonte extra barateia em 1★ as unidades que usam ferro (máx. 2)' },
    horses: { name: 'Cavalos',         icon: '🐴', info: 'Com um Pasto, fornece Cavalos; +1 de raio de abastecimento e fontes extras barateiam montados' },
    gems:   { name: 'Gemas',           icon: '💎', info: 'Garimpo: +2★ por turno, luxo e maravilhas −10% por garimpo (máx. 30%)' },
    spices: { name: 'Especiarias',     icon: '🌶️', info: 'Plantação: +2★ por turno, luxo e +1★ nas rotas com outras tribos' },
  };

  // Recursos estratégicos: quais melhorias os fornecem
  PP.STRATEGIC = {
    iron:   { name: 'Ferro',   icon: '⚒️', imp: 'mine' },
    horses: { name: 'Cavalos', icon: '🐴', imp: 'pasture' },
  };
  // Luxos: cada tipo diferente no império dá lealdade nas cidades
  PP.LUXURIES = {
    gems:   { name: 'Gemas',       imp: 'gemmine' },
    spices: { name: 'Especiarias', imp: 'plantation' },
    whale:  { name: 'Baleias',     imp: 'whalestation' },
  };

  // Rotas comerciais: custo de abertura, distância mínima entre cidades e tamanho máximo do caminho
  PP.ROUTES = { cost: { domestic: 3, foreign: 4 }, minDist: 3, maxLen: 18 };

  // ---------------------------------------------------------------- Tecnologias
  PP.TECH_BASE = { 1: 4, 2: 7, 3: 11, 4: 16 };
  PP.TECHS = [
    { id: 'montaria',     tier: 1, req: [], name: 'Montaria',       icon: '🐎', desc: 'Unidade: Cavaleiro Leve' },
    { id: 'organizacao',  tier: 1, req: [], name: 'Organização',    icon: '📋', desc: 'Construção: Celeiro' },
    { id: 'escalada',     tier: 1, req: [], name: 'Escalada',       icon: '🧗', desc: 'Mover em montanhas e defesa x1,5 nelas' },
    { id: 'pesca',        tier: 1, req: [], name: 'Pesca',          icon: '🎣', desc: 'Pescar peixes' },
    { id: 'caca',         tier: 1, req: [], name: 'Caça',           icon: '🦌', desc: 'Caçar animais · Unidade: Batedor' },

    { id: 'estradas',     tier: 2, req: ['montaria'],    name: 'Estradas',       icon: '🛤️', desc: 'Estradas (movimento x2) · cidades conectadas à capital geram +1★ · rotas comerciais internas' },
    { id: 'pastoreio',    tier: 2, req: ['montaria'],    name: 'Pastoreio',      icon: '🐴', desc: 'Pasto em Cavalos (recurso estratégico)' },
    { id: 'agricultura',  tier: 2, req: ['organizacao'], name: 'Agricultura',    icon: '🌾', desc: 'Fazenda · Drenar pântano' },
    { id: 'estrategia',   tier: 2, req: ['organizacao'], name: 'Estratégia',     icon: '♟️', desc: 'Unidade: Defensor · Muralhas · Quartel · Torre de vigia · Forte' },
    { id: 'escrita',      tier: 2, req: ['organizacao'], name: 'Escrita',        icon: '📜', desc: 'Biblioteca (+2⚗\uFE0E)' },
    { id: 'mineracao',    tier: 2, req: ['escalada'],    name: 'Mineração',      icon: '⛏️', desc: 'Mina (Ferro) · Garimpo · Unidade: Piqueiro' },
    { id: 'meditacao',    tier: 2, req: ['escalada'],    name: 'Meditação',      icon: '🧘', desc: 'Templo · Maravilha: Oráculo' },
    { id: 'navegacao',    tier: 2, req: ['pesca'],       name: 'Navegação',      icon: '⛵', desc: 'Porto · Escuna · Transporte · tropas embarcam em águas rasas' },
    { id: 'arco',         tier: 2, req: ['caca'],        name: 'Arco e Flecha',  icon: '🏹', desc: 'Unidade: Arqueiro · defesa x1,5 em florestas' },
    { id: 'silvicultura', tier: 2, req: ['caca'],        name: 'Silvicultura',   icon: '🪓', desc: 'Cabana de lenhador · Derrubar e plantar floresta' },

    { id: 'comercio',     tier: 3, req: ['estradas'],     name: 'Comércio',     icon: '⚖️', desc: 'Mercado · Plantação de especiarias · cidades conectadas +2★ · rotas com outras tribos' },
    { id: 'cavalaria',    tier: 3, req: ['pastoreio'],    name: 'Cavalaria',    icon: '🏇', desc: 'Unidade: Cavaleiro (requer Cavalos)' },
    { id: 'construcao',   tier: 3, req: ['agricultura'],  name: 'Construção',   icon: '🏗️', desc: 'Moinho · Queimar floresta · Maravilha: Pirâmides' },
    { id: 'matematica',   tier: 3, req: ['silvicultura'], name: 'Matemática',   icon: '📐', desc: 'Serraria · Unidade: Catapulta' },
    { id: 'forja',        tier: 3, req: ['mineracao'],    name: 'Forja',        icon: '⚒️', desc: 'Forja · Unidade: Espadachim (requer Ferro)' },
    { id: 'filosofia',    tier: 3, req: ['meditacao'],    name: 'Filosofia',    icon: '🏛️', desc: 'Unidade: Missionário · tecnologias -15% · Grande Biblioteca' },
    { id: 'cartografia',  tier: 3, req: ['navegacao'],    name: 'Cartografia',  icon: '🧭', desc: 'Fragata · oceano · Caça à baleia · Maravilha: Colosso' },
    { id: 'espionagem',   tier: 3, req: ['escrita', 'estrategia'], name: 'Espionagem', icon: '🗡️', desc: 'Unidade: Espião · Guarda da Cidade' },

    { id: 'polvora',      tier: 4, req: ['forja', 'matematica'],    name: 'Pólvora',          icon: '💥', desc: 'Mosqueteiro e Canhão (requerem Ferro)' },
    { id: 'eng_naval',    tier: 4, req: ['cartografia', 'forja'],   name: 'Engenharia Naval', icon: '⚓', desc: 'Couraçado (cidades portuárias, requer Ferro)' },
    { id: 'educacao',     tier: 4, req: ['filosofia', 'escrita'],   name: 'Educação',         icon: '🎓', desc: 'Universidade · Maravilha: Olho dos Deuses' },
    { id: 'economia',     tier: 4, req: ['comercio', 'escrita'],    name: 'Economia',         icon: '🏦', desc: 'Banco (+3★)' },
    { id: 'arquitetura',  tier: 4, req: ['construcao', 'matematica'], name: 'Arquitetura',    icon: '🏰', desc: 'Muralhas pela metade do preço · Fortaleza · Grande Muralha' },
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
    // Navios de verdade: nascem no porto da cidade e só andam na água
    scout_ship:{ name: 'Escuna',        icon: '⛵', cost: 4,  hp: 8,  atk: 1,   def: 1, move: 4, range: 1, vision: 3, skills: ['dash', 'escape'], tech: 'navegacao', naval: true },
    transport: { name: 'Transporte',    icon: '🚣', cost: 5,  hp: 12, atk: 0,   def: 2, move: 3, range: 1, vision: 2, skills: ['stiff', 'cargo'], tech: 'navegacao', naval: true, cargo: 2 },
    frigate:   { name: 'Fragata',       icon: '🚢', cost: 9,  hp: 14, atk: 3,   def: 2, move: 3, range: 2, vision: 2, skills: ['dash', 'antinaval'], tech: 'cartografia', naval: true },
    ironclad:  { name: 'Couraçado',     icon: '🛳️', cost: 14, hp: 22, atk: 4.5, def: 4, move: 3, range: 2, vision: 2, skills: ['dash', 'antinaval'], tech: 'eng_naval', naval: true, needs: 'iron', portSpec: true },
    spy:       { name: 'Espião',        icon: '🗡️', cost: 6,  hp: 6,  atk: 0,   def: 1, move: 2, range: 1, vision: 2, skills: ['stealth', 'escape', 'creep', 'stiff'], tech: 'espionagem', spy: true },
  };
  PP.TRAINABLE = ['warrior', 'scout', 'rider', 'archer', 'defender', 'pikeman', 'swordsman', 'catapult', 'knight', 'missionary', 'musketeer', 'cannon',
    'spy', 'scout_ship', 'transport', 'frigate', 'ironclad'];

  // Unidades em água viram embarcações; o nível depende da melhor tecnologia naval do dono.
  PP.NAVAL = [
    null,
    { name: 'Balsa',         icon: '⛵', atk: 1, def: 1, move: 2, range: 2, skills: ['dash', 'escape'] },
    { name: 'Nau',           icon: '🚢', atk: 2, def: 2, move: 3, range: 2, skills: ['dash', 'escape'] },
    { name: 'Nau de guerra', icon: '🛳️', atk: 3, def: 3, move: 3, range: 2, skills: ['dash', 'escape'] },
  ];

  PP.SKILL_NAMES = {
    dash: 'Investida (ataca após mover)', escape: 'Fuga (move após atacar)', persist: 'Persistência (ataca de novo após matar)',
    fortify: 'Fortificar', creep: 'Rastejar (ignora terreno)', stiff: 'Rígido (não revida)', splash: 'Explosão (dano em área)',
    heal: 'Curar aliados', convert: 'Converter inimigos', antimount: 'Anti-montaria (x2 def / x1,5 atq vs montados)',
    antinaval: 'Caça-navios (+50% de ataque contra alvos na água)', stealth: 'Furtivo (invisível a quem não estiver ao lado)',
    cargo: 'Carga (transporta tropas terrestres)',
  };

  // Habilidades ativas: o jogador decide quando usar; cada uma tem recarga em turnos
  PP.ABILITIES = {
    aim:       { name: 'Tiro Preciso', icon: 'ab_aim', units: ['archer', 'musketeer'], cd: 3, before: true,
      desc: 'Antes de mover: +1 de alcance e +50% de dano no próximo tiro. A unidade não se move mais neste turno.' },
    charge:    { name: 'Carga', icon: 'ab_charge', units: ['rider', 'knight'], cd: 4, before: true,
      desc: '+2 de movimento neste turno e +40% de dano no próximo ataque.' },
    taunt:     { name: 'Provocar', icon: 'ab_taunt', units: ['defender', 'giant'], cd: 3,
      desc: 'Até o seu próximo turno: +25% de defesa e inimigos vizinhos só podem atacar esta unidade. Encerra o turno.' },
    phalanx:   { name: 'Formação Cerrada', icon: 'ab_phalanx', units: ['pikeman', 'swordsman'], cd: 3,
      desc: 'Até o seu próximo turno: aliados vizinhos ganham +20% de defesa. Encerra o turno.' },
    bombard:   { name: 'Bombardeio', icon: 'ab_bombard', units: ['catapult', 'cannon'], cd: 3, before: true,
      desc: 'Antes de mover: +1 de alcance e o próximo tiro atinge as casas vizinhas com 50% do dano. Não se move depois.' },
    bless:     { name: 'Bênção', icon: 'ab_bless', units: ['missionary'], cd: 3,
      desc: 'Aliados vizinhos curam 3 e ganham +20% de ataque e defesa até o seu próximo turno.' },
    recon:     { name: 'Reconhecimento', icon: 'ab_recon', units: ['scout', 'scout_ship'], cd: 3,
      desc: 'Revela uma área de raio 4 ao redor da unidade.' },
    broadside: { name: 'Bordada', icon: 'ab_broadside', units: ['frigate', 'ironclad'], cd: 3,
      desc: 'Dispara em todos os inimigos vizinhos com 60% do dano, sem revide.' },
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
    { id: 'whalestation', name: 'Estação baleeira', icon: '🐋', cost: 6, tech: 'cartografia', res: 'whale', pop: 1, imp: 'whalestation', income: 1 },
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
    { id: 'terrace',    name: 'Terraços',          icon: '🌾', cost: 5, tech: 'agricultura', terrain: ['hills'], empty: true, pop: 1, imp: 'terrace', tribe: 'aymara' },
    { id: 'tower',      name: 'Torre de vigia',    icon: '🗼', cost: 4, tech: 'estrategia',  fort: 'tower' },
    { id: 'outpost',    name: 'Posto avançado',    icon: '⛺', cost: 5, tech: 'estradas',    fort: 'outpost' },
    { id: 'fort',       name: 'Forte',             icon: '🏰', cost: 8, tech: 'estrategia',  fort: 'fort' },
    { id: 'fortress',   name: 'Fortaleza',         icon: '🏯', cost: 10, tech: 'arquitetura', fort: 'fortress', upgradeOf: 'fort' },
    { id: 'repair',     name: 'Reparar',           icon: '🔧', cost: 2, repair: true },
  ];
  PP.TILE_ACTION = {};
  PP.TILE_ACTIONS.forEach(a => { PP.TILE_ACTION[a.id] = a; });

  PP.IMPROVEMENTS = {
    farm: { name: 'Fazenda', icon: '🚜' }, mine: { name: 'Mina', icon: '⛏️' }, pasture: { name: 'Pasto', icon: '🐴' },
    gemmine: { name: 'Garimpo', icon: '💎' }, plantation: { name: 'Plantação de especiarias', icon: '🌶️' },
    lumber: { name: 'Cabana de lenhador', icon: '🛖' }, sawmill: { name: 'Serraria', icon: '🪚' },
    windmill: { name: 'Moinho', icon: '🌬️' }, forge: { name: 'Forja', icon: '🔥' }, market: { name: 'Mercado', icon: '🏪' },
    port: { name: 'Porto', icon: '⚓' }, terrace: { name: 'Terraços', icon: '🌾' },
    whalestation: { name: 'Estação baleeira', icon: '🐋' },
  };

  // Fortificações: estruturas de casa com dono (tile.fort = { type, owner })
  PP.FORTS = {
    tower:    { name: 'Torre de vigia', icon: 'f_tower',    vision: 3, detect: 3, def: 1.25, supply: 0, desc: 'Visão de raio 3 e detecção de espiões num raio de 3' },
    outpost:  { name: 'Posto avançado', icon: 'f_outpost',  vision: 1, def: 1.25, supply: 2, heal: true, desc: 'Abastece tropas num raio de 2 e cura como território próprio' },
    fort:     { name: 'Forte',          icon: 'f_fort',     vision: 2, def: 2,    supply: 2, heal: true, desc: 'Defesa ×2 e abastecimento num raio de 2' },
    fortress: { name: 'Fortaleza',      icon: 'f_fortress', vision: 2, def: 2.5,  supply: 3, heal: true, detect: 2, desc: 'Defesa ×2,5, abastecimento num raio de 3 e detecção de espiões' },
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
    guard:      { name: 'Guarda da Cidade', icon: '💂', cost: 5, tech: 'espionagem', desc: '+40% de chance de capturar espiões · +5 de lealdade' },
    // Exclusivas de especialização (só funcionam enquanto a cidade mantém a especialização)
    arsenal:      { spec: 'militar',  name: 'Arsenal',          cost: 8,  tech: 'forja',       desc: 'Recrutas custam −1★ a mais e nascem com +1 XP' },
    citadel:      { spec: 'militar',  name: 'Cidadela',         cost: 10, tech: 'estrategia',  needs: 'walls', desc: 'Defesa ×4 na cidade · cura +3 · +10 de lealdade' },
    observatory:  { spec: 'ciencia',  name: 'Observatório',     cost: 8,  tech: 'escrita',     sci: 2, desc: '+2⚗\uFE0E por turno · +1 de visão da cidade' },
    academy_hall: { spec: 'ciencia',  name: 'Academia Real',    cost: 12, tech: 'filosofia',   sci: 3, desc: '+3⚗\uFE0E por turno · tecnologias 5% mais baratas' },
    guild:        { spec: 'comercio', name: 'Guilda Mercante',  cost: 8,  tech: 'estradas',    gold: 2, desc: '+2★ por turno · +1 vaga de rota' },
    exchange:     { spec: 'comercio', name: 'Bolsa Comercial',  cost: 12, tech: 'comercio',    gold: 3, desc: '+3★ por turno · rotas desta cidade +1★' },
    silos:        { spec: 'agricola', name: 'Silos',            cost: 6,  tech: 'agricultura', desc: 'Crescimento natural a cada 3 turnos (em vez de 4)' },
    aqueduct:     { spec: 'agricola', name: 'Aqueduto',         cost: 10, tech: 'construcao',  pop: 2, desc: '+2 população · +1 capacidade · +10 de lealdade' },
    shipyard:     { spec: 'porto',    name: 'Estaleiro',        cost: 7,  tech: 'navegacao',   desc: 'Navios custam −2★ e nascem com +1 XP' },
    lighthouse:   { spec: 'porto',    name: 'Farol',            cost: 6,  tech: 'cartografia', desc: '+2 de visão da cidade · rotas marítimas +1★' },
    customs:      { spec: 'porto',    name: 'Alfândega',        cost: 10, tech: 'comercio',    desc: '+1★ por porto, peixe ou baleia no território (máx. 4) · +1 vaga de rota' },
  };
  PP.BUILDING_ORDER = ['walls', 'barracks', 'granary', 'library', 'temple', 'university', 'bank', 'guard',
    'arsenal', 'citadel', 'observatory', 'academy_hall', 'guild', 'exchange', 'silos', 'aqueduct', 'shipyard', 'lighthouse', 'customs'];

  // ---------------------------------------------------------------- Especialização de cidades
  // Cada especialização tem bônus claros e um custo claro: uma cidade não pode ser boa em tudo.
  PP.SPECS = {
    militar:  { name: 'Militar',    icon: 'sp_militar',  bonus: '+2 capacidade · recrutas −1★ e +1 XP · defesa +0,5', cost: 'ciência da cidade pela metade' },
    ciencia:  { name: 'Científica', icon: 'sp_ciencia',  bonus: '+25% de ciência (mín. +2) · bibliotecas e universidades +1⚗\uFE0E', cost: '−30% de estrelas · −1 capacidade · recrutas +1★' },
    comercio: { name: 'Comercial',  icon: 'sp_comercio', bonus: '+30% de estrelas · +1 vaga de rota · rotas desta cidade +1★', cost: '−1⚗\uFE0E · defesa −0,25' },
    agricola: { name: 'Agrícola',   icon: 'sp_agricola', bonus: '+1 população a cada 4 turnos · Celeiro pela metade · +5 de lealdade', cost: '−1★ · −1⚗\uFE0E' },
    porto:    { name: 'Portuária',  icon: 'sp_porto',    bonus: 'Couraçados · +1★ por porto, peixe ou baleia (máx. 3) · navios +1 movimento · +1 vaga de rota marítima', cost: 'tropas terrestres +1★', coastal: true },
  };
  PP.SPEC_COST = { first: 5, change: 12, minLevel: 2 };

  // Marcos de progressão: níveis 6, 8 e 10 dão uma decisão própria da especialização; nível 12 permite a Metrópole
  PP.MILESTONES = {
    militar:  { 6: 'm_training', 8: 'm_bastion', 10: 'm_legion' },
    ciencia:  { 6: 'm_observatory', 8: 'm_university', 10: 'm_invisible' },
    comercio: { 6: 'm_market', 8: 'm_bourse', 10: 'm_freeport' },
    agricola: { 6: 'm_granaries', 8: 'm_irrigation', 10: 'm_breadbasket' },
    porto:    { 6: 'm_drydock', 8: 'm_admiralty', 10: 'm_searoutes' },
  };
  PP.METROPOLIS_LEVEL = 12;

  // ---------------------------------------------------------------- Marcos estratégicos do mapa
  PP.LANDMARKS = {
    passo:           { name: 'Passo de montanha', icon: 'lm_passo',           desc: 'Defesa ×1,5 para quem ocupa · fortes aqui custam metade' },
    estreito:        { name: 'Estreito',          icon: 'lm_estreito',        desc: 'Pedágio: +2★ por turno a quem controla · navios aqui defendem ×1,25' },
    vau:             { name: 'Ponte antiga',      icon: 'lm_vau',             desc: 'Ponte de pedra sobre a água rasa: tropas terrestres atravessam a pé (custo 2)' },
    porto_natural:   { name: 'Porto natural',     icon: 'lm_porto_natural',   desc: 'Porto aqui é grátis e dá +1 população extra' },
    mina_abandonada: { name: 'Mina abandonada',   icon: 'lm_mina_abandonada', desc: 'Fornece Ferro a quem controla e +1★ por turno' },
    ruina_imperial:  { name: 'Ruína imperial',    icon: 'lm_ruina_imperial',  desc: '+2⚗\uFE0E por turno e +150 pontos a quem controla' },
  };

  // ---------------------------------------------------------------- Ruínas com escolhas
  PP.RUIN_TYPES = {
    fortaleza:   { name: 'Fortaleza abandonada', text: 'Muralhas rachadas guardam o que restou de uma guarnição.', loot: 16, rep: -6, restore: { cost: 6, fort: 'fort', label: 'Restaurar como Forte' } },
    templo:      { name: 'Templo esquecido', text: 'Um santuário coberto de cinzas, ainda visitado por peregrinos.', loot: 14, rep: -10, restore: { cost: 5, shrine: true, label: 'Restaurar o santuário (+1⚗\uFE0E por turno)' } },
    biblioteca:  { name: 'Biblioteca soterrada', text: 'Pergaminhos antigos sob camadas de terra e cinza.', loot: 12, rep: -4, restore: { cost: 5, archive: 10, label: 'Catalogar o acervo (+10⚗\uFE0E e santuário)' } },
    acampamento: { name: 'Acampamento em ruínas', text: 'Paliçadas caídas numa posição que ainda domina a região.', loot: 10, rep: -3, restore: { cost: 4, fort: 'outpost', label: 'Reerguer como Posto avançado' } },
    tumulo:      { name: 'Túmulo real', text: 'O túmulo de um rei esquecido, cheio de oferendas.', loot: 24, rep: -12, honor: true },
  };

  // ---------------------------------------------------------------- Maravilhas (únicas no mundo)
  PP.WONDERS = {
    oracle:        { name: 'Oráculo',            icon: '🔮', cost: 14, tech: 'meditacao',   desc: 'Tecnologia grátis imediata e +2⚗\uFE0E por turno' },
    pyramids:      { name: 'Pirâmides',          icon: '🔺', cost: 18, tech: 'construcao',  desc: '+3★ por turno' },
    great_library: { name: 'Grande Biblioteca',  icon: '🏛️', cost: 20, tech: 'filosofia',   desc: '+4⚗\uFE0E por turno' },
    colossus:      { name: 'Colosso',            icon: '🗽', cost: 18, tech: 'cartografia', desc: '+1★ por turno para cada porto seu (máx. 10)', coastal: true },
    great_wall:    { name: 'Grande Muralha',     icon: '🏯', cost: 20, tech: 'arquitetura', desc: '+0,5 no bônus de defesa de todas as suas cidades' },
    eye:           { name: 'Olho dos Deuses',    icon: '👁️', cost: 16, tech: 'educacao',    desc: 'Revela o mapa inteiro' },
    gardens:       { name: 'Jardins Suspensos',  icon: '🌻', cost: 16, tech: 'agricultura', desc: '+1 população em todas as suas cidades a cada 6 turnos' },
    colosseum:     { name: 'Coliseu',            icon: '🏟️', cost: 16, tech: 'estrategia',  desc: 'Recrutas de todo o império +1 XP · +5 de lealdade nas cidades' },
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
    metropolis:   { name: 'Metrópole',          desc: '+2★ · +2⚗\uFE0E · +1 capacidade · fronteiras de raio 3' },
    m_training:   { name: 'Centro Militar',     desc: '+1 capacidade · recrutas desta cidade +1 XP' },
    m_bastion:    { name: 'Bastião',            desc: 'Defesa da cidade +1 · cura +3 na cidade' },
    m_legion:     { name: 'Legião',             desc: '+2 capacidade · um Espadachim veterano grátis' },
    m_observatory:{ name: 'Observatório Real',  desc: '+2⚗\uFE0E por turno' },
    m_university: { name: 'Universidade Maior', desc: '+4⚗\uFE0E por turno' },
    m_invisible:  { name: 'Colégio Invisível',  desc: '+10% de ciência em todo o império' },
    m_market:     { name: 'Grande Mercado',     desc: '+2★ por turno' },
    m_bourse:     { name: 'Bolsa de Valores',   desc: '+3★ por turno · +1 vaga de rota' },
    m_freeport:   { name: 'Capital Mercantil',  desc: '+10% de estrelas em todo o império' },
    m_granaries:  { name: 'Celeiros Reais',     desc: '+3 população agora · crescimento natural 1 turno mais rápido' },
    m_irrigation: { name: 'Irrigação',          desc: '+1 população em cada cidade sua a até 3 casas' },
    m_breadbasket:{ name: 'Celeiro do Mundo',   desc: '+5 de lealdade e +1 capacidade em todas as suas cidades' },
    m_drydock:    { name: 'Doca Seca',          desc: 'Navios desta cidade custam −1★ e nascem com +1 XP' },
    m_admiralty:  { name: 'Almirantado',        desc: 'Todos os seus navios +1 de defesa' },
    m_searoutes:  { name: 'Rota das Especiarias', desc: 'Rotas marítimas do império +1★' },
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
    // usados pelos cenários
    dois_continentes: { name: 'Dois Continentes', land: 0.5, hidden: true },
    ilhas:            { name: 'Ilhas',            land: 0.34, hidden: true },
  };
  PP.MAP_SIZES = { 14: 'Pequeno (14×14)', 18: 'Médio (18×18)', 22: 'Grande (22×22)', 26: 'Enorme (26×26)' };

  // ---------------------------------------------------------------- Tribos
  PP.TRIBES = {
    aymara: {
      name: 'Aymará', color: '#9e3a2f', dark: '#5a1f19', emblem: '🦙', startTech: 'escalada', extraTech: 'mineracao', startUnit: 'warrior',
      perk: 'Povo das montanhas: Minas e Garimpos dão +1 população extra.',
      unique: 'Caminhos de pedra: suas tropas cruzam montanhas com custo 1 e ganham +1 de visão nelas; constroem Terraços em colinas vazias (+1 população).',
      biome: { base: 'plains', alt: 'tundra', altFrac: 0.15, mountain: 0.2, hills: 0.2, forest: 0.18, swamp: 0.0 },
      tint: '#8a7d5c', resBias: { ore: 2, gems: 1.6, horses: 1.2 },
      syl: [['Pa', 'Chu', 'Qui', 'Ti', 'Ay', 'U', 'Ko', 'Pu', 'Ma', 'Il', 'Sa', 'Wa'], ['ta', 'ni', 'llo', 'ka', 'ma', 'ra', 'wa', 'qa', 'yu', 'ri'], ['pampa', 'marka', 'wasi', 'quta', 'llacta', 'kancha', '']],
    },
    tupina: {
      name: 'Tupinás', color: '#4f7a3f', dark: '#2a4422', emblem: '🦜', startTech: 'caca', startUnit: 'warrior',
      perk: 'Filhos da mata: florestas custam 1 de movimento e sempre dão defesa.',
      unique: 'Guerra na mata: suas tropas em floresta só são vistas por inimigos vizinhos e emboscam com +40% (em vez de +20%).',
      biome: { base: 'plains', alt: 'swamp', altFrac: 0.08, mountain: 0.05, hills: 0.07, forest: 0.48, swamp: 0.08 },
      tint: '#4d6b3a', resBias: { game: 1.8, fruit: 1.4, spices: 1.6 },
      syl: [['Ita', 'Pira', 'Ara', 'Gua', 'Tu', 'Ja', 'Ibi', 'Iga', 'Mo', 'Cu', 'Ta', 'Ybi'], ['pu', 'ra', 'ti', 'cu', 'ju', 'ma', 'po', 'ba', 'na', 'é'], ['tinga', 'rana', 'guaçu', 'mirim', 'poranga', 'tuba', '']],
    },
    vikar: {
      name: 'Vikar', color: '#4a7394', dark: '#263e52', emblem: '🐺', startTech: 'pesca', startUnit: 'warrior',
      perk: 'Navegadores do gelo: embarcações têm +1 de movimento e pescar dá +1 população extra.',
      unique: 'Saqueadores do mar: embarcam de qualquer costa, sem porto, e o saque de casas litorâneas rende o dobro.',
      biome: { base: 'tundra', alt: 'plains', altFrac: 0.25, mountain: 0.12, hills: 0.12, forest: 0.25, swamp: 0.0 },
      tint: '#7c8783', resBias: { fish: 1.8, whale: 2, game: 1.2 },
      syl: [['Skal', 'Hvit', 'Fjor', 'Ul', 'Rag', 'Tor', 'Isa', 'Bjør', 'Kvik', 'Frey', 'Sig', 'Vall'], ['', 'ne', 'ha', 'vi', 'gar', 'ma'], ['heim', 'vik', 'fjord', 'borg', 'havn', 'dal', 'nes']],
    },
    qadir: {
      name: 'Qadir', color: '#b58a36', dark: '#6a4f1c', emblem: '🐪', startTech: 'montaria', startUnit: 'rider',
      perk: 'Mercadores das dunas: a capital gera +2★ e cada cidade conectada por estrada ou porto gera +1★ extra.',
      unique: 'Caravanas: +1 vaga de rota na capital e o comércio com os Qadir melhora a relação em dobro.',
      biome: { base: 'desert', alt: 'plains', altFrac: 0.2, mountain: 0.07, hills: 0.13, forest: 0.05, swamp: 0.0 },
      tint: '#a8905f', resBias: { horses: 1.8, gems: 1.6, crop: 0.8 },
      syl: [['Al', 'Qa', 'Sa', 'Mar', 'Zu', 'Ha', 'Ka', 'Ra', 'Da', 'Ja', 'Ba', 'Na'], ['sh', 'dir', 'ma', 'bar', 'ha', 'ra', 'zi', 'li'], ['kand', 'abad', 'ira', 'un', 'ar', 'at', '']],
    },
    hanlu: {
      name: 'Han-Lu', color: '#6f5391', dark: '#3d2c52', emblem: '🐉', startTech: 'organizacao', startUnit: 'warrior',
      perk: 'Império de jade: tecnologias custam 15% menos.',
      unique: 'Difusão do saber: tecnologias já conhecidas por tribos que você encontrou custam mais 20% menos; cidades científicas não perdem capacidade.',
      biome: { base: 'plains', alt: 'hills', altFrac: 0.05, mountain: 0.1, hills: 0.1, forest: 0.22, swamp: 0.05 },
      tint: '#6f8350', resBias: { crop: 1.8, fruit: 1.2, spices: 1.2 },
      syl: [['Lu', 'Shan', 'Hai', 'Jin', 'Xi', 'Long', 'Yu', 'Ming', 'Bai', 'Qing', 'Tian', 'Zhou'], ['', '', 'an', 'ling'], ['jing', 'yang', 'men', 'kou', 'shan', 'du', 'ping', 'zhou']],
    },
    zambe: {
      name: 'Zambé', color: '#b2602b', dark: '#653414', emblem: '🦁', startTech: 'caca', startUnit: 'warrior', extraUnit: 'warrior',
      perk: 'Guerreiros da savana: começam com um guerreiro extra; unidades ganham XP em dobro e curam +2.',
      unique: 'Sede de batalha: ao abater, a unidade recupera 3 de vida; veteranos inspiram aliados vizinhos (+10% de ataque).',
      biome: { base: 'plains', alt: 'desert', altFrac: 0.12, mountain: 0.05, hills: 0.15, forest: 0.14, swamp: 0.05 },
      tint: '#8f874f', resBias: { game: 1.4, horses: 1.4, fruit: 1.2 },
      syl: [['Zam', 'Ku', 'Mbe', 'Ta', 'Nya', 'Ki', 'Ma', 'Lu', 'Ba', 'Oyo', 'Ze', 'Dan'], ['la', 'bu', 'ngo', 'si', 'ri', 'ka', 'we'], ['mbe', 'wa', 'la', 'ndi', 'ga', 'ro', '']],
    },
  };
  PP.TRIBE_IDS = Object.keys(PP.TRIBES);
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
