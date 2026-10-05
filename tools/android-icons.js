/* Gera os ícones do app Android (android/res/mipmap-*) a partir de assets/icon.svg.
   Uso: node tools/android-icons.js  (precisa do Playwright com Chromium). Os PNGs gerados ficam no repositório,
   então o build do APK (tools/build-apk.sh) não depende deste script. */
'use strict';
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const RES = path.join(ROOT, 'android', 'res');
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const svg = fs.readFileSync(path.join(ROOT, 'assets', 'icon.svg'), 'utf8');
// conteúdo do brasão sem o fundo arredondado (vira a camada da frente do ícone adaptativo)
const inner = svg.replace(/^[\s\S]*?<rect[^>]*\/>/, '').replace(/<\/svg>\s*$/, '');
if (inner === svg || !/crossed|<path/.test(inner)) throw new Error('assets/icon.svg fora do formato esperado');

// Ícone clássico (48dp): o próprio assets/icon.svg
const legacy = svg;
// Ícone adaptativo (108dp): o brasão cabe na zona segura de 66dp no centro; fundo vem de @color/ic_launcher_bg
const fg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><g transform="translate(54 54) scale(0.5) translate(-64 -67)">${inner}</g></svg>`;

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await browser.newPage();
  const render = async (markup, size, file) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${markup.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };
  for (const [d, k] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, 'mipmap-' + d);
    fs.mkdirSync(dir, { recursive: true });
    await render(legacy, Math.round(48 * k), path.join(dir, 'ic_launcher.png'));
    await render(fg, Math.round(108 * k), path.join(dir, 'ic_launcher_fg.png'));
  }
  await browser.close();
  console.log('Ícones gerados em', RES);
})().catch(e => { console.error(e); process.exit(1); });
