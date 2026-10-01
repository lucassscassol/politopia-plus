/* Chamas de Vardren — coleta as chaves de tradução usadas no código (textos em português passados a PP.t, direta ou
   indiretamente) e os textos fixos do index.html. Usado pelo teste de cobertura dos idiomas (tests/i18n.js). */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const unesc = s => s.replace(/\\(['"\\`])/g, '$1').replace(/\\n/g, '\n');
const STR = "'((?:[^'\\\\]|\\\\.)*)'";

function collect() {
  const keys = new Map(); // chave -> primeiro arquivo onde aparece
  const put = (k, f) => { if (k && !keys.has(k)) keys.set(k, f); };
  const files = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'i18n.js');
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    const pats = [
      new RegExp('PP\\.t\\(' + STR, 'g'),
      // rótulos de combate: add(valor, 'Rótulo')
      new RegExp("\\badd\\([^,()]+(?:\\([^()]*\\))?[^,()]*, " + STR + '\\)', 'g'),
      // motivos de recusa da diplomacia: bad('Motivo', ...)
      new RegExp('\\bbad\\(' + STR, 'g'),
      // seções da ajuda: h('...'), p('...'), li('...')
      new RegExp('\\$\\{(?:h|p|li)\\(' + STR, 'g'),
    ];
    for (const re of pats) { let m; while ((m = re.exec(src))) put(unesc(m[1]), f); }
    // mensagens montadas em variável antes de passar por PP.t (ex.: declarações de guerra)
    let m;
    const msgRe = /const msg = ([^;]+);\s*\n\s*this\.log\(PP\.t\(msg/g;
    while ((m = msgRe.exec(src))) {
      const r2 = new RegExp(STR, 'g');
      let q;
      while ((q = r2.exec(m[1]))) if (!/^[a-z_]+$/.test(q[1])) put(unesc(q[1]), f); // ignora os identificadores comparados
    }
    // tabela de rótulos de vitória
    const vl = /PP\.victoryLabel = function[\s\S]*?const L = \{([\s\S]*?)\};/.exec(src);
    if (vl) { const r2 = new RegExp(': ' + STR, 'g'); let q; while ((q = r2.exec(vl[1]))) put(unesc(q[1]), f); }
    // rótulos das estatísticas finais
    const sl = /PP\.STAT_LABELS = \[([\s\S]*?)\];/.exec(src);
    if (sl) { const r2 = new RegExp("\\['\\w+', " + STR + '\\]', 'g'); let q; while ((q = r2.exec(sl[1]))) put(unesc(q[1]), f); }
  }
  // textos fixos do index.html
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  let m;
  const re1 = /<(\w+)[^>]*\sdata-i18n(?=[\s>])[^>]*>([\s\S]*?)<\/\1>/g;
  while ((m = re1.exec(html))) put(m[2].trim(), 'index.html');
  const re2 = /<\w+([^>]*)\sdata-i18n-attr="([^"]+)"/g;
  while ((m = re2.exec(html))) {
    for (const a of m[2].split(',')) {
      const am = new RegExp('\\s' + a + '="([^"]*)"').exec(m[0]);
      if (am) put(am[1], 'index.html');
    }
  }
  const desc = /<meta name="description" content="([^"]*)"/.exec(html);
  if (desc) put(desc[1], 'index.html');
  return keys;
}

module.exports = { collect };
if (require.main === module) {
  const k = collect();
  if (process.argv[2] === '--json') console.log(JSON.stringify([...k.keys()], null, 1));
  else console.log(k.size + ' chaves');
}
