/* Chamas de Vardren — lista os textos das regras (dados) que cada idioma precisa traduzir, como caminhos planos
   a partir de PP (ex.: 'UNITS.warrior.name'). Usado pelo teste de cobertura dos idiomas (tests/i18n.js). */
'use strict';

// Objetos de dados com textos visíveis ao jogador
const ROOTS = ['TERRAIN', 'RESOURCES', 'STRATEGIC', 'LUXURIES', 'TECH', 'UNITS', 'SKILL_NAMES', 'ABILITIES', 'PROMOTIONS',
  'TILE_ACTION', 'IMPROVEMENTS', 'FORTS', 'BUILDINGS', 'SPECS', 'MILESTONES', 'LANDMARKS', 'RUIN_TYPES', 'WONDERS', 'REWARDS',
  'DIFFICULTY', 'MAP_TYPES', 'MAP_SIZES', 'TRIBES', 'MEMORY_KINDS', 'RELATIONS', 'PROPOSAL_TYPES', 'SPY_MISSIONS', 'EVENTS',
  'AI_STRATEGIES', 'SCENARIOS', 'VICTORIES', 'SCIENCE_PROJECT', 'ACHIEVEMENT', 'NAVAL'];
// Campos que são texto (os demais são identificadores, ícones, cores...)
const TEXT_FIELDS = ['name', 'desc', 'info', 'perk', 'unique', 'text', 'label', 'bonus', 'cost', 'short', 'title'];
// Nomes próprios que não se traduzem
const KEEP = [/^TRIBES\.\w+\.name$/];

function collect(PP) {
  const out = {};
  const visit = (obj, path, depth) => {
    if (obj == null || depth > 3) return;
    if (typeof obj === 'string') {
      const last = path.split('.').pop();
      const isText = TEXT_FIELDS.includes(last) || ['SKILL_NAMES', 'MAP_SIZES', 'PROPOSAL_TYPES'].includes(path.split('.')[0]) && path.split('.').length === 2;
      if (isText && /[A-Za-zÀ-ú]/.test(obj) && !KEEP.some(re => re.test(path))) out[path] = obj;
      return;
    }
    if (typeof obj !== 'object' || (Array.isArray(obj) && depth > 0)) return; // só a lista NAVAL é percorrida por índice
    for (const k of Object.keys(obj)) visit(obj[k], path + '.' + k, depth + 1);
  };
  for (const r of ROOTS) if (PP[r]) visit(PP[r], r, 0);
  return out;
}

module.exports = { collect, ROOTS };
if (require.main === module) {
  const PP = require('./load.js');
  const d = collect(PP);
  if (process.argv[2] === '--json') console.log(JSON.stringify(d, null, 1));
  else console.log(Object.keys(d).length + ' textos de dados');
}
