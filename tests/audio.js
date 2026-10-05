/* Chamas de Vardren — testes do som: todos os efeitos sintetizados saem válidos (sem NaN, sem estouro, sem DC, sem
   estalo nas pontas), as notas da música estão afinadas e a música fica na escala. Roda no Node, sem navegador. */
'use strict';
require('../js/util.js');
require('../js/audio.js');
const PP = globalThis.PP;

let ok = 0, fail = 0;
const check = (cond, msg) => { if (cond) ok++; else { fail++; console.log('FALHA:', msg); } };

// ---------------------------------------------------------------- Efeitos
const t0 = Date.now();
for (const [name, def] of Object.entries(PP.SFX)) {
  const sr = def.sr || PP.SFX_RATE;
  for (let v = 0; v < (def.variants || 1); v++) {
    const a = PP.renderSfx(name, v);
    check(a instanceof Float32Array, `${name}#${v}: buffer`);
    check(a.length === Math.ceil(def.dur * sr), `${name}#${v}: duração ${a.length} ≠ ${Math.ceil(def.dur * sr)}`);
    let peak = 0, ss = 0, sum = 0, bad = 0;
    for (const x of a) { if (!Number.isFinite(x)) bad++; const m = Math.abs(x); if (m > peak) peak = m; ss += x * x; sum += x; }
    check(bad === 0, `${name}#${v}: ${bad} amostras inválidas`);
    check(peak <= def.level + 1e-3 && peak >= def.level * 0.8, `${name}#${v}: pico ${peak.toFixed(3)} (esperado até ${def.level})`);
    check(Math.sqrt(ss / a.length) > 0.008, `${name}#${v}: quase silencioso`);
    check(Math.abs(sum / a.length) < 0.005, `${name}#${v}: componente DC`);
    check(Math.abs(a[0]) < 1e-3 && Math.abs(a[a.length - 1]) < 1e-3, `${name}#${v}: estalo nas pontas`);
    check(def.level <= 0.7 && def.wet >= 0 && def.wet <= 0.6, `${name}: nível/reverb fora da faixa`);
  }
}
check(PP.renderSfx('nao_existe') === null, 'efeito desconhecido devolve null');
const a1 = PP.renderSfx('sword', 1), a2 = PP.renderSfx('sword', 1);
check(a1 === a2, 'efeitos ficam em cache');
console.log(`${Object.keys(PP.SFX).length} efeitos sintetizados em ${Date.now() - t0} ms`);

// ---------------------------------------------------------------- Afinação das notas (autocorrelação)
function pitch(a, sr) {
  const from = Math.floor(0.05 * sr), n = Math.floor(0.25 * sr);
  let best = 0, bestLag = 0;
  for (let lag = Math.floor(sr / 1500); lag < Math.floor(sr / 50); lag++) {
    let c = 0;
    for (let i = from; i < from + n; i++) c += a[i] * a[i + lag];
    if (c > best) { best = c; bestLag = lag; }
  }
  // refinamento parabólico
  const c = lag => { let s = 0; for (let i = from; i < from + n; i++) s += a[i] * a[i + lag]; return s; };
  const y0 = c(bestLag - 1), y1 = c(bestLag), y2 = c(bestLag + 1);
  const d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2));
  return sr / (bestLag + d);
}
for (const midi of [45, 50, 57, 62, 69, 74]) {
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const got = pitch(PP.renderPluck(midi), 22050);
  const cents = 1200 * Math.log2(got / f);
  check(Math.abs(cents) < 12, `nota ${midi}: ${got.toFixed(2)} Hz (esperado ${f.toFixed(2)}, ${cents.toFixed(1)} cents)`);
}

// ---------------------------------------------------------------- Teoria da música
const { SCALE, PROGS, midiOf, chordOf } = PP.musicTheory;
const inKey = m => SCALE.indexOf(((m - 50) % 12 + 12) % 12) >= 0;
for (const p of PROGS) for (const d of p) for (const m of chordOf(d)) check(inKey(m), `acorde do grau ${d} fora da escala (${m})`);
for (let d = -3; d < 20; d++) check(inKey(midiOf(d)), `grau ${d} fora da escala`);
check(midiOf(0) === 50 && midiOf(7) === 62 && midiOf(-7) === 38, 'graus e oitavas');

// ---------------------------------------------------------------- No Node não há motor de áudio
check(PP.audio === undefined && typeof PP.AudioEngine === 'function', 'sem window não cria o motor');
const eng = new PP.AudioEngine();
check(eng.supported === false && eng.play('sword') === false, 'motor sem Web Audio não toca nem quebra');
eng.setVolumes(0.5, 0.2); eng.background(true); eng.unlock(); eng.combat();
check(eng.sfxVol === 0.5 && eng.musicVol === 0.2, 'volumes guardados');

console.log(`${ok} verificações ok, ${fail} falhas`);
if (fail) process.exit(1);
