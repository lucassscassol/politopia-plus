/* Gera as imagens da ficha da Play Store em store/graphics a partir do próprio jogo:
   ícone 512×512, gráfico de destaque 1024×500 e capturas de celular 1080×1922 (pt-BR, en e es).
   Uso: node tools/store-graphics.js  (precisa do Playwright com Chromium e de bash/python3 para tools/stage-www.sh).
   O jogo roda com as fontes locais (como no app) e com uma ponte da loja simulada, para as telas mostrarem a
   versão da Play. As imagens geradas ficam no repositório. */
/* global PP */ // usado dentro de page.evaluate (roda no navegador)
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'store', 'graphics');
const WWW = path.join(ROOT, 'build', 'store-www');
const LANGS = (process.env.LANGS || 'pt,en,es').split(',');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };

function serve(dir) {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
      const f = path.join(dir, p === '/' ? 'index.html' : p);
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

// ponte da loja simulada: preços e nada comprado
const NATIVE = () => {
  window.VardrenNative = {
    info: () => JSON.stringify({ billing: true, ads: true, store: 'play' }),
    init: () => setTimeout(() => {
      PP.store.fromNative(JSON.stringify({ ev: 'owned', list: [] }));
      PP.store.fromNative(JSON.stringify({ ev: 'consent', canAds: true, privacyRequired: false }));
    }, 20),
    buy: () => {}, restore: () => {}, showInterstitial: () => false, showRewarded: () => false, privacyOptions: () => {}, setAdsRemoved: () => {},
  };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  execFileSync('bash', [path.join(ROOT, 'tools', 'stage-www.sh'), WWW], { stdio: 'inherit' });
  const srv = await serve(WWW);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

  // ---------------------------------------------------------------- Ícone 512×512 (quadrado cheio: a Play arredonda)
  const svg = fs.readFileSync(path.join(ROOT, 'assets', 'icon.svg'), 'utf8');
  const inner = svg.replace(/^[\s\S]*?<rect[^>]*\/>/, '').replace(/<\/svg>\s*$/, '');
  {
    const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
    await page.setContent(`<html><body style="margin:0;background:#0d0c0b"><svg width="512" height="512" viewBox="0 0 128 128"><rect width="128" height="128" fill="#0d0c0b"/><g transform="translate(64 66) scale(0.82) translate(-64 -67)">${inner}</g></svg></body></html>`);
    await page.screenshot({ path: path.join(OUT, 'icon-512.png'), clip: { x: 0, y: 0, width: 512, height: 512 } });
    await page.close();
  }

  // ---------------------------------------------------------------- Gráfico de destaque 1024×500 (JPEG, sem transparência)
  const TAG = { pt: 'Estratégia por turnos · 9 tribos · offline', en: 'Turn-based strategy · 9 tribes · offline', es: 'Estrategia por turnos · 9 tribus · sin conexión' };
  for (const lang of LANGS) {
    const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
    await page.goto(base + '/index.html');
    await page.waitForTimeout(400);
    const crests = await page.evaluate(() => ['kemet', 'tarkhan', 'eriu', 'vikar', 'qadir', 'aymara'].map(t => PP.crest(PP.TRIBES[t].color, 'tr_' + t, 'crest-m')).join(''));
    await page.setContent(`<html><head><link rel="stylesheet" href="${base}/fonts/fonts.css"><link rel="stylesheet" href="${base}/css/style.css"></head>
      <body style="margin:0;width:1024px;height:500px;overflow:hidden;background:radial-gradient(ellipse at 30% 40%, #3a2416 0%, #17110c 55%, #0b0908 100%)">
      <div style="position:absolute;inset:0;background:repeating-linear-gradient(135deg, rgba(227,196,127,.035) 0 2px, transparent 2px 22px)"></div>
      <div style="position:absolute;left:70px;top:70px;width:300px;height:360px"><svg width="300" height="360" viewBox="22 12 84 110">${inner}</svg></div>
      <div style="position:absolute;left:410px;top:120px;right:40px;color:#ece3cf">
        <div style="font-family:Cinzel,serif;font-weight:700;font-size:30px;letter-spacing:.18em;color:#c9a45c">CHAMAS DE</div>
        <div style="font-family:Cinzel,serif;font-weight:700;font-size:92px;line-height:1;letter-spacing:.06em;color:#e3c47f;text-shadow:0 3px 0 #5a1f19">VARDREN</div>
        <div style="font-family:'Alegreya Sans',sans-serif;font-size:27px;margin-top:18px;color:#d8ccb6">${TAG[lang] || TAG.en}</div>
        <div style="display:flex;gap:10px;margin-top:26px;transform:scale(1.35);transform-origin:left top">${crests}</div>
      </div></body></html>`);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, `feature-${lang}.jpg`), type: 'jpeg', quality: 92 });
    await page.close();
  }

  // ---------------------------------------------------------------- Capturas de celular (1080 × 1922)
  for (const lang of LANGS) {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 712 }, deviceScaleFactor: 2.7, isMobile: true, hasTouch: true });
    await ctx.addInitScript(NATIVE);
    const page = await ctx.newPage();
    await page.goto(base + '/index.html');
    await page.waitForTimeout(500);
    await page.evaluate(l => { PP.ui.setLang(l); PP.ui.settings.sfxLevel = 0; PP.ui.settings.musicLevel = 0; PP.ui.applySettings(); }, lang);
    const shot = async (n) => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, `phone-${lang}-${n}.jpg`), type: 'jpeg', quality: 88 }); };
    await page.waitForTimeout(2500);
    await shot(1); // menu com a demonstração ao fundo
    await page.evaluate(() => { PP.ui.showSetup(); const s = PP.ui.setupState; s.slots = [{ tribe: 'qadir', human: true }, { tribe: 'kemet', human: false }, { tribe: 'tarkhan', human: false }, { tribe: 'eriu', human: false }]; PP.ui.renderSetup(); });
    await shot(2); // criação da partida com as tribos da loja
    // partida já andada: a IA joga 34 rodadas por todos
    await page.evaluate(async () => {
      const g = new PP.Game().setup({ seed: 77001, size: 18, mapType: 'continentes', difficulty: 'normal',
        players: ['qadir', 'kemet', 'vikar', 'tarkhan'].map(t => ({ tribe: t, human: false })) });
      for (let i = 0; i < 34 * 4 && !g.over; i++) { await PP.AI.takeTurn(g); if (!g.over) g.endTurn(); }
      g.players[0].human = true;
      PP.ui.attach(g, false);
    });
    await page.waitForTimeout(4500); // espera os avisos do turno sumirem
    await page.evaluate(() => { PP.ui.closeAllModals(); const ui = PP.ui, cs = ui.game.citiesOf(ui.viewer); ui.r.cam.z = 0.72; if (cs.length) ui.r.centerOn(cs.reduce((a, c) => a + c.x, 0) / cs.length, cs.reduce((a, c) => a + c.y, 0) / cs.length); ui.r.dirty = true; });
    await shot(3); // mapa
    await page.evaluate(() => { const ui = PP.ui, c = ui.game.cityMap[ui.me().capital] || ui.game.citiesOf(ui.viewer)[0]; if (c) ui.openCity(c); });
    await shot(4); // cidade
    await page.evaluate(() => { PP.ui.closeAllModals(); PP.ui.openTech(); });
    await shot(5); // tecnologias
    await page.evaluate(() => { PP.ui.closeAllModals(); PP.ui.openDiplomacy(); });
    await shot(6); // diplomacia
    await page.evaluate(() => { PP.ui.closeAllModals(); PP.ui.openStore(); });
    await shot(7); // loja
    await ctx.close();
  }

  await browser.close();
  srv.close();
  console.log('Imagens da Play Store em', path.relative(ROOT, OUT));
})().catch(e => { console.error(e); process.exit(1); });
