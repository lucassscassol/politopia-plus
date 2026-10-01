// Carrega o motor do jogo no Node, na mesma ordem do index.html (sem os módulos de interface).
const fs = require('fs');
const path = require('path');

const ENGINE = [
  'util', 'i18n', 'data', 'mapgen', 'game',
  'diplomacy', 'cities', 'economy', 'combat', 'naval', 'espionage', 'intel', 'events', 'ruins',
  'victory', 'stats', 'achievements', 'replay', 'scenarios', 'ai-strategy', 'ai', 'lang/en', 'lang/es',
];

for (const m of ENGINE) {
  const f = path.join(__dirname, '..', 'js', m + '.js');
  if (fs.existsSync(f)) require(f);
}

module.exports = globalThis.PP;
module.exports.ENGINE_MODULES = ENGINE;
