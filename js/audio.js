/* Chamas de Vardren — som. Os efeitos são sintetizados em JavaScript puro na primeira vez que tocam (não há arquivos
   de áudio) e saem pela Web Audio API; a música é composta enquanto toca: bordão, alaúde e tambor em ré menor.
   A síntese (PP.SFX, PP.renderSfx, PP.renderPluck) não usa o navegador e é testada no Node (tests/audio.js).
   Nada aqui toca no estado da partida nem no gerador aleatório do jogo. */
(function (PP) {
  'use strict';
  const SR = 32000;      // taxa dos efeitos sintetizados
  const SR_NOTE = 22050; // taxa das notas da música
  const TAU = Math.PI * 2;

  // ================================================================ Síntese
  function rngOf(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Filtro biquad (fórmulas de R. Bristow-Johnson): lp, hp, bp (pico de 0 dB) e peak
  class Biquad {
    constructor(type, f, q, db, sr) {
      this.type = type; this.sr = sr || SR;
      this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
      this.set(f, q, db);
    }
    set(f, q, db) {
      q = q || 0.707;
      f = Math.min(Math.max(f, 10), this.sr * 0.45);
      const w = TAU * f / this.sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
      let b0, b1, b2, a0, a1, a2;
      if (this.type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
      else if (this.type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
      else if (this.type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
      else { const A = Math.pow(10, (db || 0) / 40); b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
      this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
      return this;
    }
    run(x) {
      const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
      this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
      return y;
    }
  }

  // Sinos de Risset: razões, amplitudes e durações relativas das parciais
  const BELL = [[0.56, 1, 1], [0.563, 0.67, 0.9], [0.92, 1, 0.65], [0.923, 1.8, 0.55], [1.19, 2.67, 0.325], [1.7, 1.67, 0.35],
    [2, 1.46, 0.25], [2.74, 1.33, 0.2], [3, 1.33, 0.15], [3.76, 1, 0.1], [4.07, 1.33, 0.075]];

  // Um efeito em construção: soma camadas (parciais, ruído filtrado, pancadas, cordas, metais, coro) num buffer mono
  class Synth {
    constructor(sec, seed, sr) {
      this.sr = sr || SR;
      this.n = Math.max(1, Math.ceil(sec * this.sr));
      this.out = new Float32Array(this.n);
      this.rnd = rngOf(seed);
    }
    r(a, b) { return a + (b - a) * this.rnd(); }
    span(at, sec) { const i0 = Math.max(0, Math.floor(at * this.sr)); return [i0, Math.max(0, Math.min(this.n - i0, Math.ceil(sec * this.sr)))]; }

    // Senoides amortecidas: [frequência, constante de decaimento (s), amplitude]. Metal, madeira, sinos, gongos.
    modes(at, list, o) {
      o = o || {};
      const g = o.gain == null ? 1 : o.gain, att = Math.max(1, (o.attack || 0.0012) * this.sr), drop = o.drop || 0;
      for (const [f, dec, amp] of list) {
        if (f >= this.sr * 0.46) continue;
        const [i0, len] = this.span(at, dec * 7);
        const k = Math.exp(-1 / (dec * this.sr));
        let e = g * amp, ph = this.rnd() * TAU;
        const w = TAU * f / this.sr;
        for (let i = 0; i < len; i++) {
          ph += drop ? w * (1 - drop * Math.min(1, i / this.sr)) : w;
          this.out[i0 + i] += (i < att ? i / att : 1) * e * Math.sin(ph);
          e *= k;
        }
      }
    }

    bell(at, f, dec, gain) {
      this.modes(at, BELL.map(([r, a, d]) => [f * r / 0.56, d * dec, a * 0.25]), { gain: gain == null ? 1 : gain, attack: 0.002 });
    }

    // Ruído filtrado com envelope: ataque/decaimento, ataque/sustentação/soltura ou "swell" (sopro que cresce e some)
    noise(at, dur, o) {
      const [i0, len] = this.span(at, dur);
      if (!len) return;
      const sr = this.sr, att = Math.max(1, (o.attack || 0.002) * sr), rel = Math.max(1, (o.release || 0.008) * sr);
      const lp = o.lp ? new Biquad('lp', o.lp, o.q || 0.707, 0, sr) : null;
      const hp = o.hp ? new Biquad('hp', o.hp, 0.707, 0, sr) : null;
      const bp = o.bp ? new Biquad('bp', o.bp, o.q || 1, 0, sr) : null;
      const bp2 = o.bp && o.sharp ? new Biquad('bp', o.bp, o.q || 1, 0, sr) : null;
      const g = o.gain == null ? 1 : o.gain, dk = o.decay ? 1 / (o.decay * sr) : 0;
      let br = 0;
      for (let i = 0; i < len; i++) {
        if (i && (i & 15) === 0) {
          const k = i / len;
          if (lp && o.lpTo) lp.set(o.lp * Math.pow(o.lpTo / o.lp, k), o.q || 0.707);
          if (bp && o.bpTo) { const f = o.bp * Math.pow(o.bpTo / o.bp, k); bp.set(f, o.q || 1); if (bp2) bp2.set(f, o.q || 1); }
        }
        let x = this.rnd() * 2 - 1;
        if (o.brown) { br = br * 0.985 + x * 0.015; x = br * 6; }
        if (o.crackle) x = this.rnd() < o.crackle ? (this.rnd() * 2 - 1) * 5 : x * 0.12;
        if (hp) x = hp.run(x);
        if (lp) x = lp.run(x);
        if (bp) x = bp.run(x);
        if (bp2) x = bp2.run(x) * 2;
        let e;
        if (o.swell) e = Math.pow(Math.sin(Math.PI * i / len), o.swell);
        else {
          e = i < att ? i / att : (dk ? Math.exp(-(i - att) * dk) : 1);
          if (len - i < rel) e *= (len - i) / rel;
        }
        this.out[i0 + i] += g * e * x;
      }
    }

    // Pancada grave com queda de afinação (tambor, impacto, corpo caindo)
    thump(at, o) {
      const [i0, len] = this.span(at, o.decay * 8);
      const sr = this.sr, g = o.gain == null ? 1 : o.gain, pd = o.pd || 0.03;
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        ph += TAU * (o.f1 + (o.f0 - o.f1) * Math.exp(-t / pd)) / sr;
        this.out[i0 + i] += g * Math.min(1, i / (0.0008 * sr)) * Math.exp(-t / o.decay) * Math.sin(ph);
      }
    }

    // Tambor de moldura: pele grave + estalo da batida
    drum(at, o) {
      o = o || {};
      const g = o.gain == null ? 1 : o.gain, f = o.f || 1;
      this.thump(at, { f0: 150 * f, f1: 62 * f, pd: 0.035, decay: o.decay || 0.16, gain: g });
      this.thump(at, { f0: 240 * f, f1: 150 * f, pd: 0.02, decay: 0.05, gain: g * 0.35 });
      this.noise(at, 0.09, { lp: 1100, decay: 0.022, gain: g * 0.45 });
    }

    // Senoide com glissando, tremolo opcional (brilhos, gotas, cantos mágicos)
    tone(at, f0, f1, dur, o) {
      o = o || {};
      const [i0, len] = this.span(at, dur);
      const sr = this.sr, g = o.gain == null ? 1 : o.gain, att = Math.max(1, (o.attack || 0.004) * sr), dk = o.decay ? 1 / (o.decay * sr) : 0;
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        ph += TAU * f0 * Math.pow(f1 / f0, k) / sr;
        let e = i < att ? i / att : (dk ? Math.exp(-(i - att) * dk) : 1);
        if (len - i < 0.01 * sr) e *= (len - i) / (0.01 * sr);
        if (o.tremolo) e *= 0.75 + 0.25 * Math.sin(TAU * o.tremolo * i / sr);
        this.out[i0 + i] += g * e * Math.sin(ph);
      }
    }

    // Corda dedilhada (Karplus-Strong com atraso fracionário para afinar certo)
    pluck(at, f, o) {
      o = o || {};
      const t60 = o.t60 || 2;
      const [i0, len] = this.span(at, o.dur || t60 * 1.1);
      if (!len) return;
      const sr = this.sr, D = sr / f - 0.5, P = Math.max(2, Math.round(D));
      const lp = new Biquad('lp', 500 + 7500 * (o.bright == null ? 0.6 : o.bright), 0.6, 0, sr);
      const exc = new Float32Array(P);
      let m = 0;
      for (let i = 0; i < P; i++) { exc[i] = lp.run(this.rnd() * 2 - 1); m += exc[i]; }
      m /= P;
      const loop = Math.pow(10, -3 / (t60 * f)) * 0.5;
      const y = new Float32Array(len);
      const body = o.body === false ? null : new Biquad('peak', 260, 1.2, 4, sr);
      const g = o.gain == null ? 1 : o.gain;
      for (let n = 0; n < len; n++) {
        let v = n < P ? exc[n] - m : 0;
        const t = n - D;
        if (t >= 1) {
          const i = Math.floor(t), fr = t - i;
          v += loop * (y[i] + (y[i + 1] - y[i]) * fr + y[i - 1] + (y[i] - y[i - 1]) * fr);
        }
        y[n] = v;
        const s = body ? body.run(v) : v;
        this.out[i0 + n] += g * (n < 24 ? n / 24 : 1) * s;
      }
    }

    // Metal soprado (trompa, trombeta): soma aditiva de harmônicos; o brilho acompanha a intensidade
    brass(at, f, dur, o) {
      o = o || {};
      const rel = o.release || 0.14;
      const [i0, len] = this.span(at, dur + rel);
      const sr = this.sr, g = o.gain == null ? 1 : o.gain, att = o.attack || 0.05;
      const H = Math.max(1, Math.min(22, Math.floor(sr * 0.42 / f)));
      const scoop = o.scoop == null ? 0.03 : o.scoop, vib = o.vibrato == null ? 0.005 : o.vibrato, br0 = o.bright == null ? 0.65 : o.bright;
      let ph = 0;
      for (let n = 0; n < len; n++) {
        const t = n / sr;
        let e = t < att ? Math.pow(t / att, 1.4) * 1.08 : 0.84 + 0.24 * Math.exp(-(t - att) / 0.09);
        if (t > dur) e *= Math.max(0, 1 - (t - dur) / rel);
        const v = 1 + vib * Math.sin(TAU * 5.1 * t) * Math.min(1, Math.max(0, (t - 0.22) / 0.3));
        ph += TAU * f * (1 - scoop * Math.exp(-t / 0.045)) * v / sr;
        const bright = br0 * Math.min(1, e), fall = (1.15 - bright) * 0.95;
        // sen(k·φ) pela recorrência de Chebyshev
        const c2 = 2 * Math.cos(ph);
        let s1 = Math.sin(ph), s0 = 0, sum = 0, norm = 0;
        for (let k = 1; k <= H; k++) {
          const a = Math.exp(-(k - 1) * fall) / k;
          sum += a * s1; norm += a;
          const s2 = c2 * s1 - s0; s0 = s1; s1 = s2;
        }
        this.out[i0 + n] += g * e * sum / norm;
      }
      if (o.breath) this.noise(at, Math.min(0.12, dur), { bp: f * 3, q: 1.2, decay: 0.04, gain: g * o.breath });
    }

    // Coro "aah": harmônicos pesados por formantes, duas vozes levemente desafinadas por nota
    choir(at, freqs, dur, o) {
      o = o || {};
      const att = o.attack || 0.35, rel = o.release || 0.7;
      const [i0, len] = this.span(at, dur + rel);
      const sr = this.sr, g = (o.gain == null ? 1 : o.gain) / freqs.length;
      const form = x => 0.12 + Math.exp(-Math.pow((x - 700) / 140, 2)) + 0.75 * Math.exp(-Math.pow((x - 1150) / 170, 2)) + 0.25 * Math.exp(-Math.pow((x - 2700) / 260, 2));
      for (const f0 of freqs) {
        for (const det of [-0.0035, 0.0035]) {
          const f = f0 * (1 + det), H = Math.max(1, Math.min(26, Math.floor(3000 / f)));
          const amps = [];
          let norm = 0;
          for (let k = 1; k <= H; k++) { const a = form(k * f) / Math.pow(k, 0.6); amps.push(a); norm += a; }
          const vr = this.r(4.6, 5.6), vp = this.r(0, TAU);
          let ph = this.r(0, TAU);
          for (let n = 0; n < len; n++) {
            const t = n / sr;
            let e = t < att ? t / att : 1;
            if (t > dur) e *= Math.max(0, 1 - (t - dur) / rel);
            ph += TAU * f * (1 + 0.006 * Math.sin(vp + TAU * vr * t)) / sr;
            const c2 = 2 * Math.cos(ph);
            let s1 = Math.sin(ph), s0 = 0, sum = 0;
            for (let k = 0; k < H; k++) { sum += amps[k] * s1; const s2 = c2 * s1 - s0; s0 = s1; s1 = s2; }
            this.out[i0 + n] += g * e * sum / norm * 0.5;
          }
        }
      }
    }

    // Rangido de madeira: pulsos de atrito passando por ressonâncias estreitas
    creak(at, dur, o) {
      o = o || {};
      const [i0, len] = this.span(at, dur);
      const sr = this.sr, f1 = new Biquad('bp', o.f || 650, 5, 0, sr), f2 = new Biquad('bp', (o.f || 650) * 2.3, 6, 0, sr);
      const g = o.gain == null ? 1 : o.gain;
      let next = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        let x = 0;
        if (i >= next) { x = 1 + this.rnd(); next = i + sr / ((o.r0 || 30) + ((o.r1 || 55) - (o.r0 || 30)) * k) * this.r(0.85, 1.15); }
        this.out[i0 + i] += g * Math.pow(Math.sin(Math.PI * k), 0.7) * (f1.run(x) * 3 + f2.run(x) * 2);
      }
    }

    // Normaliza o pico, tira o DC e suaviza as pontas (sem estalos)
    finish(level) {
      const out = this.out, n = this.n, sr = this.sr;
      let prev = 0, y = 0;
      const k = 1 - TAU * 25 / sr;
      for (let i = 0; i < n; i++) { const x = out[i]; y = x - prev + k * y; prev = x; out[i] = y; }
      let peak = 0;
      for (let i = 0; i < n; i++) { const a = Math.abs(out[i]); if (a > peak) peak = a; }
      const g = peak > 1e-9 ? level / peak : 0;
      const fi = Math.min(n, Math.round(0.0015 * sr)), fo = Math.min(n, Math.round(0.012 * sr));
      for (let i = 0; i < n; i++) {
        let e = g;
        if (i < fi) e *= i / fi;
        if (n - i <= fo) e *= (n - i - 1) / fo;
        out[i] *= e;
      }
      return out;
    }
  }

  // ================================================================ Biblioteca de efeitos
  // dur: duração (s) · level: pico depois de normalizado · variants: versões diferentes do mesmo som
  // wet: quanto vai para a reverberação · gap: intervalo mínimo entre repetições (ms)
  const D3 = 146.83, A3 = 220, D4 = 293.66, Fs4 = 369.99, A4 = 440, D5 = 587.33, Fs5 = 739.99, A5 = 880, D6 = 1174.66;
  const SFX = {
    click: { dur: 0.07, level: 0.2, variants: 3, wet: 0.04, gap: 35, make(s) {
      s.modes(0, [[s.r(1150, 1300), 0.012, 1], [s.r(2700, 3000), 0.006, 0.6], [s.r(4100, 4500), 0.004, 0.3]]);
      s.noise(0, 0.012, { hp: 2500, decay: 0.002, gain: 0.5 });
    } },
    open: { dur: 0.34, level: 0.15, variants: 3, wet: 0.08, gap: 120, make(s) {
      s.noise(0, 0.32, { bp: 3200, bpTo: 2100, q: 0.8, swell: 1.4, crackle: 0.05 });
      s.noise(0.02, 0.2, { bp: 1500, q: 0.7, swell: 2, gain: 0.25 });
    } },
    select: { dur: 0.26, level: 0.28, variants: 3, wet: 0.08, gap: 60, make(s) {
      s.thump(0, { f0: 220, f1: 120, pd: 0.02, decay: 0.03, gain: 0.8 });
      s.noise(0, 0.05, { lp: 1200, decay: 0.012, gain: 0.5 });
      s.modes(0.015, [[s.r(3000, 3300), 0.05, 0.5], [s.r(4400, 4800), 0.04, 0.4], [s.r(6100, 6500), 0.03, 0.3]]);
      s.modes(0.055, [[s.r(3300, 3600), 0.04, 0.25], [s.r(5000, 5300), 0.03, 0.2]]);
    } },
    selectCity: { dur: 1.3, level: 0.2, variants: 2, wet: 0.3, gap: 80, make(s) { s.bell(0, s.r(860, 900), 0.55); } },
    error: { dur: 0.3, level: 0.3, variants: 1, wet: 0.05, gap: 150, make(s) {
      s.thump(0, { f0: 180, f1: 95, pd: 0.05, decay: 0.06 });
      s.thump(0.1, { f0: 150, f1: 80, pd: 0.05, decay: 0.07 });
      s.noise(0, 0.12, { lp: 500, decay: 0.03, gain: 0.4 });
    } },
    coin: { dur: 0.5, level: 0.3, variants: 3, wet: 0.12, gap: 80, make(s) {
      for (const t of [0, s.r(0.06, 0.09)]) s.modes(t, [[s.r(4200, 4500), 0.07, 1], [s.r(5600, 6000), 0.05, 0.7], [s.r(7400, 7800), 0.04, 0.5], [s.r(2100, 2300), 0.09, 0.4]]);
    } },
    step: { dur: 0.6, level: 0.3, variants: 3, wet: 0.06, gap: 90, make(s) {
      for (const base of [0, 0.16, 0.32]) {
        const t = base + s.r(0, 0.025);
        s.thump(t, { f0: 110, f1: 60, pd: 0.015, decay: 0.035, gain: 0.7 });
        s.noise(t, 0.08, { bp: s.r(900, 1400), q: 0.9, decay: 0.02, gain: 0.6 });
        if (s.rnd() < 0.6) s.modes(t + 0.012, [[s.r(3800, 4200), 0.02, 0.12], [s.r(5200, 5600), 0.015, 0.08]]);
      }
    } },
    hooves: { dur: 0.75, level: 0.3, variants: 3, wet: 0.06, gap: 90, make(s) {
      for (const base of [0, 0.33]) for (const off of [0, 0.075, 0.155]) {
        const t = base + off + s.r(0, 0.012);
        s.thump(t, { f0: 160, f1: 80, pd: 0.01, decay: 0.025, gain: 0.7 });
        s.noise(t, 0.04, { bp: s.r(700, 1000), q: 1.2, decay: 0.012, gain: 0.8 });
        s.modes(t, [[s.r(480, 560), 0.02, 0.5], [s.r(1100, 1300), 0.012, 0.25]]);
      }
    } },
    oars: { dur: 0.95, level: 0.28, variants: 2, wet: 0.12, gap: 120, make(s) {
      s.noise(0, 0.85, { bp: 500, bpTo: 1500, q: 0.7, swell: 1.2 });
      s.noise(0.1, 0.6, { lp: 400, swell: 1.5, gain: 0.5, brown: true });
      for (let i = 0; i < 5; i++) { const f = s.r(900, 1800); s.tone(s.r(0.15, 0.8), f, f * 1.5, 0.03, { gain: 0.12 }); }
    } },
    creak: { dur: 0.55, level: 0.2, variants: 2, wet: 0.1, gap: 150, make(s) { s.creak(0, 0.5, { f: s.r(600, 720) }); } },
    sword: { dur: 0.95, level: 0.48, variants: 3, wet: 0.16, gap: 50, make(s) {
      s.noise(0, 0.03, { hp: 1800, decay: 0.006, gain: 1.2 });
      s.thump(0, { f0: 300, f1: 140, pd: 0.01, decay: 0.03, gain: 0.5 });
      const b = s.r(0.9, 1.1), list = [];
      for (const [f, d, a] of [[2300, 0.25, 1], [3170, 0.2, 0.8], [4410, 0.15, 0.6], [5960, 0.1, 0.45], [7230, 0.07, 0.3], [1210, 0.12, 0.3]]) {
        list.push([f * b, d, a], [f * b * 1.0045, d, a * 0.6]);
      }
      s.modes(0.002, list, { gain: 0.6 });
    } },
    bow: { dur: 0.5, level: 0.36, variants: 3, wet: 0.1, gap: 50, make(s) {
      s.pluck(0, s.r(95, 115), { t60: 0.18, bright: 0.5, gain: 0.8, body: false });
      s.noise(0.02, 0.32, { bp: 2600, bpTo: 900, q: 1.5, swell: 2, gain: 0.8 });
    } },
    hit: { dur: 0.32, level: 0.34, variants: 3, wet: 0.08, gap: 45, make(s) {
      s.thump(0, { f0: 200, f1: 90, pd: 0.02, decay: 0.05, gain: 0.8 });
      s.noise(0, 0.12, { lp: 2500, decay: 0.025, gain: 0.7 });
      s.modes(0, [[s.r(380, 450), 0.03, 0.4], [s.r(900, 1050), 0.02, 0.3]]);
    } },
    musket: { dur: 1.25, level: 0.52, variants: 2, wet: 0.2, gap: 60, make(s) {
      s.noise(0, 0.05, { hp: 900, decay: 0.008, gain: 1.6 });
      s.noise(0, 0.35, { lp: 1400, lpTo: 300, decay: 0.07, gain: 1.2 });
      s.thump(0, { f0: 120, f1: 50, pd: 0.03, decay: 0.08, gain: 0.8 });
      s.noise(0.06, 1.15, { lp: 900, lpTo: 250, decay: 0.3, gain: 0.25 });
    } },
    cannon: { dur: 2.1, level: 0.66, variants: 2, wet: 0.25, gap: 90, make(s) {
      s.thump(0, { f0: 90, f1: 32, pd: 0.08, decay: 0.35, gain: 1.2 });
      s.noise(0, 0.6, { lp: 1800, lpTo: 200, decay: 0.12, gain: 1.4 });
      s.noise(0, 0.03, { hp: 1200, decay: 0.006, gain: 0.8 });
      s.noise(0.05, 2, { lp: 400, lpTo: 120, decay: 0.5, gain: 0.5, brown: true });
    } },
    catapult: { dur: 0.85, level: 0.4, variants: 2, wet: 0.14, gap: 90, make(s) {
      s.thump(0, { f0: 140, f1: 70, pd: 0.03, decay: 0.08, gain: 1 });
      s.modes(0, [[s.r(210, 240), 0.08, 0.5], [s.r(520, 580), 0.05, 0.3]]);
      s.pluck(0, 70, { t60: 0.3, bright: 0.3, gain: 0.5, body: false });
      s.noise(0.08, 0.65, { bp: 400, bpTo: 1200, q: 0.8, swell: 1.5, gain: 0.6 });
    } },
    crash: { dur: 1.05, level: 0.48, variants: 2, wet: 0.18, gap: 80, make(s) {
      s.thump(0, { f0: 100, f1: 45, pd: 0.04, decay: 0.12 });
      for (let i = 0; i < 14; i++) { const t = Math.pow(s.rnd(), 1.8) * 0.55; s.noise(t, 0.04, { bp: s.r(800, 3000), q: 1.5, decay: 0.01, gain: s.r(0.2, 0.6) * (1 - t) }); }
      s.noise(0, 0.85, { lp: 1200, lpTo: 300, decay: 0.15, gain: 0.6 });
    } },
    death: { dur: 0.7, level: 0.36, variants: 3, wet: 0.1, gap: 60, make(s) {
      s.thump(0, { f0: 120, f1: 55, pd: 0.03, decay: 0.09 });
      s.noise(0, 0.25, { lp: 700, decay: 0.06, gain: 0.6 });
      s.thump(s.r(0.13, 0.17), { f0: 90, f1: 50, pd: 0.03, decay: 0.05, gain: 0.4 });
      s.modes(s.r(0.04, 0.08), [[s.r(2500, 2900), 0.04, 0.3], [s.r(3700, 4100), 0.03, 0.25]]);
      s.modes(s.r(0.12, 0.18), [[s.r(2200, 2600), 0.03, 0.2], [s.r(3300, 3600), 0.02, 0.15]]);
    } },
    found: { dur: 3.4, level: 0.42, variants: 1, wet: 0.4, gap: 300, make(s) {
      s.bell(0, D4, 1.7);
      for (const [t, f] of [[0.05, D3], [0.09, A3], [0.13, D4], [0.17, Fs4]]) s.pluck(t, f, { t60: 2.2, bright: 0.4, gain: 0.18 });
    } },
    capture: { dur: 2.1, level: 0.42, variants: 1, wet: 0.3, gap: 300, make(s) {
      s.brass(0.05, D3, 1.1, { scoop: 0.06, bright: 0.75, gain: 0.8, vibrato: 0.004, breath: 0.15 });
      s.brass(0.05, D3 / 2, 1.1, { scoop: 0.06, bright: 0.6, gain: 0.4, vibrato: 0.003 });
      s.drum(0, { gain: 0.9 });
    } },
    lost: { dur: 2.3, level: 0.38, variants: 1, wet: 0.3, gap: 300, make(s) {
      s.brass(0, 110, 0.7, { bright: 0.55, gain: 0.8 });
      s.brass(0.72, 103.83, 1.1, { bright: 0.45, gain: 0.8, scoop: 0.01 });
      s.drum(0, { f: 0.8, decay: 0.25 });
      s.drum(0.72, { f: 0.75, decay: 0.3 });
    } },
    levelup: { dur: 1.7, level: 0.36, variants: 1, wet: 0.3, gap: 200, make(s) {
      [D5, Fs5, A5, D6].forEach((f, i) => s.pluck(i * 0.08, f, { t60: 1.2, bright: 0.7, gain: 0.6 }));
    } },
    build: { dur: 0.9, level: 0.33, variants: 3, wet: 0.1, gap: 120, make(s) {
      for (const base of [0, 0.2, 0.4]) {
        const t = base + s.r(0, 0.03);
        s.modes(t, [[s.r(1700, 1900), 0.025, 1], [s.r(3100, 3400), 0.015, 0.6], [s.r(650, 720), 0.04, 0.6]]);
        s.noise(t, 0.02, { hp: 1500, decay: 0.004, gain: 0.6 });
        s.thump(t, { f0: 250, f1: 150, pd: 0.01, decay: 0.02, gain: 0.4 });
      }
    } },
    building: { dur: 1.5, level: 0.36, variants: 2, wet: 0.2, gap: 200, make(s) {
      for (const t of [0, 0.18]) s.modes(t, [[s.r(1700, 1900), 0.025, 1], [s.r(3100, 3400), 0.015, 0.6], [s.r(650, 720), 0.04, 0.6]]);
      s.thump(0.42, { f0: 90, f1: 50, pd: 0.03, decay: 0.1 });
      s.noise(0.42, 0.12, { lp: 600, decay: 0.05, gain: 0.5 });
      s.pluck(0.58, A5, { t60: 1, bright: 0.6, gain: 0.35 });
      s.pluck(0.64, D6, { t60: 1, bright: 0.6, gain: 0.3 });
    } },
    wonder: { sr: 22050, dur: 4.2, level: 0.5, variants: 1, wet: 0.45, gap: 500, make(s) {
      s.choir(0, [D3, A3, D4, Fs4], 3, { attack: 0.8, release: 0.9, gain: 0.9 });
      s.bell(0.1, D5, 1, 0.35);
      s.drum(0, { gain: 0.5, decay: 0.3, f: 0.8 });
    } },
    tech: { dur: 2.1, level: 0.36, variants: 1, wet: 0.35, gap: 300, make(s) {
      [D4, 349.23, 392, A4, 523.25, D5, 698.46, A5].forEach((f, i) => s.pluck(i * 0.045, f, { t60: i === 7 ? 1.8 : 1.3, bright: 0.55, gain: 0.5 + i * 0.03 }));
    } },
    recruit: { dur: 0.75, level: 0.36, variants: 2, wet: 0.12, gap: 120, make(s) {
      s.drum(0, { gain: 0.6, f: 1.2, decay: 0.08 });
      s.drum(0.055, { gain: 0.9, f: 1.1, decay: 0.12 });
      s.noise(0.12, 0.34, { bp: 4000, bpTo: 6500, q: 3, swell: 1, gain: 0.3 });
      s.modes(0.45, [[s.r(3000, 3200), 0.12, 0.25], [s.r(4500, 4700), 0.08, 0.2]]);
    } },
    splash: { dur: 0.9, level: 0.34, variants: 2, wet: 0.14, gap: 120, make(s) {
      s.noise(0, 0.5, { lp: 2500, lpTo: 600, decay: 0.12 });
      s.thump(0, { f0: 120, f1: 60, pd: 0.03, decay: 0.05, gain: 0.4 });
      for (let i = 0; i < 6; i++) { const f = s.r(1000, 2400); s.tone(s.r(0.1, 0.6), f, f * 1.6, 0.025, { gain: 0.2 }); }
    } },
    pop: { dur: 0.9, level: 0.2, variants: 1, wet: 0.25, gap: 150, make(s) {
      s.pluck(0, A5, { t60: 0.8, bright: 0.6, gain: 0.6 });
      s.pluck(0.07, D6, { t60: 0.8, bright: 0.6, gain: 0.5 });
    } },
    ruin: { dur: 2.3, level: 0.32, variants: 1, wet: 0.45, gap: 400, make(s) {
      s.noise(0, 0.9, { bp: 5000, q: 2, swell: 3, gain: 0.15 });
      [A5, 1046.5, D6, 1318.5, 1568].forEach((f, i) => s.tone(0.15 + i * 0.09, f, f, 1.5, { attack: 0.3, decay: 0.7, tremolo: 6, gain: 0.25 }));
      s.bell(0.8, A3, 0.8, 0.5);
    } },
    pillage: { dur: 1.45, level: 0.44, variants: 2, wet: 0.16, gap: 200, make(s) {
      s.noise(0, 0.5, { lp: 500, lpTo: 1500, swell: 1.3, gain: 0.9, brown: true });
      s.noise(0.1, 1.25, { crackle: 0.008, hp: 1500, decay: 0.6, gain: 0.8 });
      s.modes(0.05, [[s.r(300, 360), 0.05, 0.6], [s.r(750, 820), 0.03, 0.4]]);
      s.noise(0.05, 0.2, { bp: 1200, q: 0.8, decay: 0.04, gain: 0.7 });
    } },
    heal: { dur: 1.5, level: 0.3, variants: 1, wet: 0.35, gap: 200, make(s) {
      s.tone(0, D5, A5, 1.2, { attack: 0.05, decay: 0.5, gain: 0.35 });
      [D5, Fs5, A5].forEach((f, i) => s.pluck(i * 0.1, f, { t60: 1, bright: 0.5, gain: 0.4 }));
    } },
    convert: { sr: 22050, dur: 1.7, level: 0.3, variants: 1, wet: 0.4, gap: 300, make(s) {
      s.choir(0, [A3, 277.18, 329.63], 0.9, { attack: 0.3, release: 0.6, gain: 0.8 });
      [A5, 1108.73, 1318.5].forEach((f, i) => s.tone(0.2 + i * 0.12, f, f, 0.9, { attack: 0.1, decay: 0.4, tremolo: 7, gain: 0.15 }));
    } },
    promote: { dur: 1.7, level: 0.34, variants: 1, wet: 0.28, gap: 300, make(s) {
      s.brass(0, A3, 0.15, { bright: 0.8, gain: 0.8, breath: 0.1 });
      s.brass(0.18, A3, 0.11, { bright: 0.8, gain: 0.8 });
      s.brass(0.32, 329.63, 0.9, { bright: 0.75, gain: 0.85, vibrato: 0.006 });
      s.brass(0.32, 164.81, 0.9, { bright: 0.6, gain: 0.35 });
    } },
    horn: { dur: 1.5, level: 0.32, variants: 1, wet: 0.3, gap: 300, make(s) {
      s.brass(0, A3, 0.16, { bright: 0.7, gain: 0.8, breath: 0.1 });
      s.brass(0.2, D4, 0.75, { bright: 0.7, gain: 0.85, scoop: 0.05 });
    } },
    clank: { dur: 0.65, level: 0.3, variants: 2, wet: 0.12, gap: 120, make(s) {
      s.modes(0, [[s.r(620, 700), 0.12, 1], [s.r(1450, 1600), 0.09, 0.7], [s.r(2350, 2600), 0.06, 0.5], [s.r(3700, 4000), 0.04, 0.3]]);
      s.thump(0, { f0: 180, f1: 110, pd: 0.02, decay: 0.04, gain: 0.6 });
      s.noise(0, 0.03, { hp: 1000, decay: 0.005, gain: 0.5 });
    } },
    turn: { dur: 2.4, level: 0.24, variants: 1, wet: 0.4, gap: 800, make(s) {
      s.bell(0, A3, 1.1);
      s.tone(0, 110, 110, 1.6, { attack: 0.02, decay: 0.6, gain: 0.15 });
    } },
    endTurn: { dur: 0.9, level: 0.3, variants: 1, wet: 0.2, gap: 400, make(s) {
      s.drum(0, { gain: 0.8 });
      s.drum(0.22, { gain: 1, f: 0.85, decay: 0.2 });
    } },
    war: { dur: 2.7, level: 0.46, variants: 1, wet: 0.3, gap: 600, make(s) {
      [0, 0.42, 0.72, 0.95, 1.15].forEach((t, i) => s.drum(t, { gain: 0.7 + i * 0.07, f: 0.75, decay: 0.25 }));
      s.brass(1.2, 73.42, 1.2, { bright: 0.7, gain: 0.7, scoop: 0.05 });
      s.brass(1.2, D3, 1.2, { bright: 0.6, gain: 0.4, scoop: 0.05 });
    } },
    peace: { sr: 22050, dur: 2.7, level: 0.38, variants: 1, wet: 0.4, gap: 600, make(s) {
      [D3, A3, D4, Fs4, A4].forEach((f, i) => s.pluck(i * 0.03, f, { t60: 2.2, bright: 0.45, gain: 0.45 }));
      s.choir(0.1, [D4, Fs4, A4], 1.6, { attack: 0.5, release: 0.8, gain: 0.35 });
    } },
    seal: { dur: 0.6, level: 0.3, variants: 2, wet: 0.1, gap: 300, make(s) {
      s.noise(0, 0.25, { bp: 3000, bpTo: 2200, q: 0.8, swell: 1.4, crackle: 0.05 });
      s.thump(0.25, { f0: 300, f1: 160, pd: 0.01, decay: 0.03, gain: 0.8 });
      s.noise(0.25, 0.05, { lp: 1500, decay: 0.01, gain: 0.5 });
    } },
    gong: { dur: 4.2, level: 0.42, variants: 1, wet: 0.35, gap: 800, make(s) {
      const f = 110;
      s.modes(0, [[f, 1.4, 1], [f * 1.47, 1.1, 0.8], [f * 2.09, 0.9, 0.7], [f * 2.56, 0.7, 0.6], [f * 3.39, 0.5, 0.5], [f * 4.17, 0.35, 0.4], [f * 5.53, 0.25, 0.3], [f * 6.8, 0.18, 0.25]],
        { attack: 0.004, drop: 0.01 });
      s.thump(0, { f0: 90, f1: 60, pd: 0.02, decay: 0.08, gain: 0.6 });
      s.noise(0.05, 2.5, { bp: 3000, q: 3, decay: 0.8, gain: 0.08 });
    } },
    achievement: { dur: 1.9, level: 0.36, variants: 1, wet: 0.35, gap: 400, make(s) {
      [1760, 1568, 1318.5, D6, 1318.5, 1568, 1760, 2349.3].forEach((f, i) => s.pluck(i * 0.05, f, { t60: 0.9, bright: 0.8, gain: 0.4 }));
      s.bell(0.42, D6, 0.6, 0.4);
    } },
    victory: { sr: 22050, dur: 4.6, level: 0.6, variants: 1, wet: 0.35, gap: 2000, make(s) {
      for (const [t, f, d] of [[0, D4, 0.16], [0.22, D4, 0.1], [0.38, D4, 0.1], [0.55, A4, 0.48], [1.1, Fs4, 0.22], [1.4, A4, 0.22], [1.7, D5, 1.5]]) {
        s.brass(t, f, d, { bright: 0.8, gain: 0.8, vibrato: d > 1 ? 0.006 : 0.003, breath: 0.08 });
        s.brass(t, f / 2, d, { bright: 0.6, gain: 0.4 });
      }
      for (const t of [0, 0.55, 1.1, 1.7]) s.drum(t, { gain: 0.8, decay: 0.2 });
      s.bell(1.7, D5, 1.2, 0.4);
      s.choir(1.7, [D3, A3, D4, Fs4], 2, { attack: 0.4, release: 0.9, gain: 0.6 });
    } },
    defeat: { sr: 22050, dur: 4.7, level: 0.42, variants: 1, wet: 0.4, gap: 2000, make(s) {
      for (const [t, f, d] of [[0, D3, 0.95], [1.05, 130.81, 0.85], [2, 116.54, 0.85], [2.95, 110, 1.3]]) {
        s.brass(t, f, d, { bright: 0.45, gain: 0.8, scoop: 0.01 });
        s.drum(t, { f: 0.7, decay: 0.3, gain: 0.7 });
      }
      s.choir(2.95, [73.42, D3, 174.61, A3], 1.4, { attack: 0.5, release: 0.8, gain: 0.5 });
    } },
    meet: { dur: 2.5, level: 0.2, variants: 1, wet: 0.5, gap: 600, make(s) {
      s.brass(0, A3, 0.45, { bright: 0.45, gain: 0.8, scoop: 0.08 });
      s.brass(0.55, D3, 1.2, { bright: 0.4, gain: 0.8, scoop: 0.04 });
    } },
    spy: { dur: 0.42, level: 0.26, variants: 2, wet: 0.08, gap: 150, make(s) {
      s.noise(0, 0.34, { bp: 1800, bpTo: 3500, q: 0.9, swell: 2 });
    } },
  };

  const cacheKey = (name, v) => name + '#' + v;
  const rendered = new Map();

  // Gera (uma vez) o buffer mono de um efeito; v escolhe a variante
  function renderSfx(name, v) {
    const def = SFX[name];
    if (!def) return null;
    v = (v || 0) % (def.variants || 1);
    const key = cacheKey(name, v);
    if (rendered.has(key)) return rendered.get(key);
    let seed = 7 + v * 7919;
    for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) >>> 0;
    const s = new Synth(def.dur, seed, def.sr);
    def.make(s, v);
    const out = s.finish(def.level);
    rendered.set(key, out);
    return out;
  }

  // Nota de alaúde para a música (cache por nota MIDI)
  const notes = new Map();
  function renderPluck(midi) {
    if (notes.has(midi)) return notes.get(midi);
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const t60 = midi < 52 ? 2.6 : midi < 64 ? 2.1 : 1.6;
    const s = new Synth(t60 * 0.95, 1000 + midi, SR_NOTE);
    s.pluck(0, f, { t60, bright: midi < 55 ? 0.42 : 0.55, dur: t60 * 0.95 });
    const out = s.finish(0.5);
    notes.set(midi, out);
    return out;
  }

  // ================================================================ Música generativa
  // Ré menor (eólio). Cada ciclo de 4 compassos escolhe uma progressão e uma textura (arpejo, esparsa, melodia, pausa).
  const SCALE = [0, 2, 3, 5, 7, 8, 10];
  const PROGS = [[0, 5, 6, 0], [0, 3, 6, 0], [0, 4, 5, 6], [0, 2, 6, 3], [0, 5, 3, 4], [5, 6, 0, 0], [0, 3, 4, 0]];
  const BASE = 50; // ré 3
  const midiOf = deg => BASE + SCALE[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
  const chordOf = deg => [deg, deg + 2, deg + 4].map(midiOf);

  class Music {
    constructor(engine) {
      this.e = engine;
      this.on = false;
      this.bar = 0;
      this.next = 0;
      this.prog = PROGS[0];
      this.texture = 'sparse';
      this.melodyDeg = 7;
      this.drone = null;
      this.lastCombat = -1e9;
      this.timer = null;
    }
    get eighth() { return 60 / 64 / 2; }
    war() { return performance.now() - this.lastCombat < 45000; }
    start() {
      if (this.on || !this.e.ctx) return;
      this.on = true;
      this.next = this.e.ctx.currentTime + 0.3;
      this.bar = 0;
      this.timer = setInterval(() => this.schedule(), 200);
      this.schedule();
    }
    stop() {
      if (!this.on) return;
      this.on = false;
      clearInterval(this.timer); this.timer = null;
      if (this.drone) { this.releaseDrone(this.drone, this.e.ctx.currentTime, 1.5); this.drone = null; }
    }
    schedule() {
      const ctx = this.e.ctx;
      if (!this.on || !ctx || ctx.state !== 'running') return;
      if (this.next < ctx.currentTime) this.next = ctx.currentTime + 0.1;
      while (this.next < ctx.currentTime + 1.6) { this.playBar(this.next); this.next += this.eighth * 8; this.bar++; }
    }
    playBar(t0) {
      const R = Math.random, e8 = this.eighth;
      const cyc = this.bar % 4;
      if (cyc === 0) {
        this.prog = PROGS[Math.floor(R() * PROGS.length)];
        const w = R();
        this.texture = this.bar === 0 ? 'sparse' : w < 0.34 ? 'arp' : w < 0.62 ? 'melody' : w < 0.92 ? 'sparse' : 'rest';
      }
      const deg = this.prog[cyc];
      const chord = chordOf(deg);
      if (!this.drone || this.drone.deg !== deg) this.setDrone(deg, t0);
      const note = (midi, slot, vel) => this.e.note(midi, t0 + slot * e8 + (R() - 0.5) * 0.02, vel * (0.75 + R() * 0.25));
      const tex = this.texture;
      if (tex === 'arp') {
        const seq = [0, 1, 2, 3, 2, 1, 2, 1], tones = [chord[0], chord[1], chord[2], chord[0] + 12];
        seq.forEach((k, s) => { if (R() < 0.85) note(tones[k], s, s % 4 === 0 ? 0.9 : 0.65); });
        if (cyc >= 2 && R() < 0.35) this.melody(t0, chord, 0.55);
      } else if (tex === 'sparse') {
        note(chord[0] + (R() < 0.5 ? 12 : 0), 0, 0.85);
        note(chord[R() < 0.5 ? 1 : 2] + 12, 4, 0.6);
        if (R() < 0.35) note(chord[2], 6, 0.5);
      } else if (tex === 'melody') {
        note(chord[0], 0, 0.7);
        this.melody(t0, chord, 0.8);
      } else if (cyc === 0) note(chord[0], 0, 0.6);
      // tambor: calmo a cada dois compassos; em guerra, pulso mais firme
      if (this.war()) {
        this.e.drum(t0, 0.55); this.e.drum(t0 + 4 * e8, 0.42);
        if (R() < 0.6) this.e.drum(t0 + 7 * e8, 0.22);
      } else if (this.bar % 2 === 0 && tex !== 'rest') this.e.drum(t0, 0.3);
    }
    melody(t0, chord, vel) {
      const R = Math.random, e8 = this.eighth;
      let deg = this.melodyDeg, s = 0;
      while (s < 8) {
        const len = R() < 0.55 ? 1 : R() < 0.75 ? 2 : 3;
        if (R() < 0.8) {
          const m = midiOf(deg) + 12;
          this.e.note(m, t0 + s * e8 + (R() - 0.5) * 0.02, vel * (0.7 + R() * 0.3));
        }
        s += len;
        deg += [-2, -1, -1, 1, 1, 2, 0][Math.floor(R() * 7)];
        deg = Math.max(2, Math.min(12, deg));
      }
      // a última nota da frase cai numa nota do acorde
      const end = chord[Math.floor(R() * 3)] + 12;
      this.e.note(end, t0 + 7 * e8 + (R() - 0.5) * 0.02, vel * 0.8);
      this.melodyDeg = deg;
    }
    setDrone(deg, t) {
      const ctx = this.e.ctx, root = midiOf(deg % 7) - 12;
      const f = 440 * Math.pow(2, (root - 69) / 12);
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(0.14, t + 2.2);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 430; lp.Q.value = 0.9;
      const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
      lfo.frequency.value = 0.06 + Math.random() * 0.03; lfoG.gain.value = 130;
      lfo.connect(lfoG); lfoG.connect(lp.frequency);
      const oscs = [lfo];
      for (const [type, mul, g] of [['sawtooth', 1, 0.5], ['sawtooth', 1.0035, 0.5], ['sine', 0.5, 0.6], ['sawtooth', 1.5, 0.25]]) {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = type; o.frequency.value = f * mul; og.gain.value = g;
        o.connect(og); og.connect(lp);
        oscs.push(o);
      }
      lp.connect(out);
      out.connect(this.e.musicBus);
      out.connect(this.e.musicSend);
      oscs.forEach(o => o.start(t));
      const d = { deg, out, oscs };
      if (this.drone) this.releaseDrone(this.drone, t, 2.6);
      this.drone = d;
    }
    releaseDrone(d, t, sec) {
      try {
        d.out.gain.cancelScheduledValues(t);
        d.out.gain.setValueAtTime(Math.max(0.0001, d.out.gain.value), t);
        d.out.gain.exponentialRampToValueAtTime(0.0001, t + sec);
        d.oscs.forEach(o => o.stop(t + sec + 0.1));
      } catch (e) { /* já parado */ }
    }
  }

  // ================================================================ Motor (Web Audio)
  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.sfxVol = 0.7;
      this.musicVol = 0.45;
      this.unlocked = false;
      this.hidden = false;
      this.voices = 0;
      this.last = {};
      this.buffers = new Map();
      this.music = new Music(this);
      this.musicWanted = false;
      if (typeof window === 'undefined' || !(window.AudioContext || window.webkitAudioContext)) { this.supported = false; return; }
      this.supported = true;
      const unlock = () => this.unlock();
      for (const ev of ['pointerdown', 'touchend', 'keydown', 'mousedown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
      document.addEventListener('visibilitychange', () => this.background(document.hidden));
    }

    init() {
      if (this.ctx || !this.supported) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { this.ctx = new AC(); } catch (e2) { this.supported = false; return; } }
      const ctx = this.ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
      comp.connect(ctx.destination);
      this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(comp);
      this.reverb = ctx.createConvolver(); this.reverb.buffer = this.impulse(2.6);
      const wet = ctx.createGain(); wet.gain.value = 0.5; this.reverb.connect(wet); wet.connect(this.master);
      this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
      this.sfxSend = ctx.createGain(); this.sfxSend.connect(this.reverb);
      this.musicBus = ctx.createGain(); this.musicBus.connect(this.master);
      this.musicSend = ctx.createGain(); this.musicSend.gain.value = 0.55; this.musicSend.connect(this.reverb);
      this.musicDuck = 1;
      this.applyVolumes();
      this.prewarm();
    }

    // Resposta ao impulso de um salão de pedra: ruído estéreo com cauda que escurece
    impulse(sec) {
      const ctx = this.ctx, n = Math.floor(sec * ctx.sampleRate), buf = ctx.createBuffer(2, n, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c), rnd = rngOf(99 + c);
        let lp = 0;
        for (let i = 0; i < n; i++) {
          const t = i / ctx.sampleRate, k = Math.min(0.92, 0.25 + t * 0.4);
          lp = lp * k + (rnd() * 2 - 1) * (1 - k);
          d[i] = lp * Math.exp(-t / 0.55) * (t < 0.012 ? t / 0.012 : 1) * 2.2;
        }
      }
      return buf;
    }

    unlock() {
      if (!this.supported) return;
      if (!this.ctx) this.init();
      if (!this.ctx) return;
      this.unlocked = true;
      if (!this.hidden && this.ctx.state !== 'running') this.ctx.resume().then(() => this.syncMusic()).catch(() => {});
      else this.syncMusic();
    }

    // App em segundo plano (aba escondida, Android pausado): silencia tudo
    background(hidden) {
      this.hidden = !!hidden;
      if (!this.ctx) return;
      if (hidden) this.ctx.suspend().catch(() => {});
      else if (this.unlocked) this.ctx.resume().then(() => this.syncMusic()).catch(() => {});
    }

    setVolumes(sfx, music) {
      this.sfxVol = Math.max(0, Math.min(1, +sfx || 0));
      this.musicVol = Math.max(0, Math.min(1, +music || 0));
      this.applyVolumes();
      this.syncMusic();
    }

    applyVolumes() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.sfxBus.gain.setTargetAtTime(this.sfxVol, t, 0.05);
      this.sfxSend.gain.setTargetAtTime(this.sfxVol, t, 0.05);
      this.musicBus.gain.setTargetAtTime(this.musicVol * 1.3 * this.musicDuck, t, 0.3);
    }

    syncMusic() {
      if (!this.ctx || this.ctx.state !== 'running') return;
      if (this.musicVol > 0 && this.musicWanted) this.music.start();
      else this.music.stop();
    }

    // Abaixa a música durante uma fanfarra
    duck(sec) {
      if (!this.ctx) return;
      this.musicDuck = 0.35; this.applyVolumes();
      clearTimeout(this.duckTimer);
      this.duckTimer = setTimeout(() => { this.musicDuck = 1; this.applyVolumes(); }, sec * 1000);
    }

    bufferOf(name, v) {
      const key = cacheKey(name, v);
      let b = this.buffers.get(key);
      if (!b) {
        const data = renderSfx(name, v);
        b = this.ctx.createBuffer(1, data.length, SFX[name].sr || SR);
        b.getChannelData(0).set(data);
        this.buffers.set(key, b);
        rendered.delete(key); // o AudioBuffer já guarda uma cópia
      }
      return b;
    }

    // Gera os efeitos mais comuns aos poucos, sem travar a tela
    prewarm() {
      const list = ['click', 'select', 'open', 'step', 'sword', 'hit', 'death', 'bow', 'hooves', 'build', 'coin', 'endTurn', 'turn', 'selectCity',
        'recruit', 'oars', 'musket', 'cannon', 'catapult', 'crash', 'levelup', 'tech', 'found', 'capture', 'pop', 'clank', 'creak', 'splash'];
      for (const k of Object.keys(SFX)) if (list.indexOf(k) < 0) list.push(k); // o resto (fanfarras longas) por último
      const idle = window.requestIdleCallback || (f => setTimeout(f, 60));
      const step = () => {
        const name = list.shift();
        if (!name || !this.ctx) return;
        try { this.bufferOf(name, 0); } catch (e) { /* segue */ }
        idle(step);
      };
      idle(step);
    }

    // Toca um efeito. o: { delay (ms), gain, pan (-1..1), rate }
    play(name, o) {
      if (!this.ctx || !this.unlocked || this.hidden || this.sfxVol <= 0 || this.ctx.state !== 'running') return false;
      const def = SFX[name];
      if (!def) return false;
      o = o || {};
      const now = performance.now() + (o.delay || 0);
      if (now - (this.last[name] || -1e9) < (def.gap || 45)) return false;
      if (this.voices >= 16) return false;
      this.last[name] = now;
      const ctx = this.ctx;
      const v = Math.floor(Math.random() * (def.variants || 1));
      const src = ctx.createBufferSource();
      src.buffer = this.bufferOf(name, v);
      src.playbackRate.value = (o.rate || 1) * (1 + (Math.random() * 2 - 1) * (def.pitch == null ? 0.035 : def.pitch));
      const g = ctx.createGain();
      g.gain.value = o.gain == null ? 1 : o.gain;
      src.connect(g);
      let out = g;
      if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); out = p; }
      out.connect(this.sfxBus);
      if (def.wet) { const s = ctx.createGain(); s.gain.value = def.wet; out.connect(s); s.connect(this.sfxSend); }
      this.voices++;
      src.onended = () => { this.voices = Math.max(0, this.voices - 1); try { g.disconnect(); out.disconnect(); } catch (e) { /* já desligado */ } };
      src.start(ctx.currentTime + Math.max(0, (o.delay || 0) / 1000));
      if (def.duck) this.duck(def.duck + (o.delay || 0) / 1000);
      return true;
    }

    // Nota da música (alaúde) no instante t do contexto
    note(midi, t, vel) {
      const ctx = this.ctx;
      if (!ctx) return;
      if (!this.noteBufs) this.noteBufs = new Map();
      let b = this.noteBufs.get(midi);
      if (!b) {
        const data = renderPluck(midi);
        b = ctx.createBuffer(1, data.length, SR_NOTE);
        b.getChannelData(0).set(data);
        this.noteBufs.set(midi, b);
      }
      const src = ctx.createBufferSource();
      src.buffer = b;
      const g = ctx.createGain();
      g.gain.value = vel;
      src.connect(g);
      let out = g;
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = (midi - 60) / 30 + (Math.random() - 0.5) * 0.2; g.connect(p); out = p; }
      out.connect(this.musicBus);
      out.connect(this.musicSend);
      src.onended = () => { try { out.disconnect(); g.disconnect(); } catch (e) { /* já desligado */ } };
      src.start(Math.max(t, ctx.currentTime));
    }

    drum(t, vel) {
      const ctx = this.ctx;
      if (!ctx) return;
      if (!this.drumBuf) {
        const s = new Synth(0.8, 4242);
        s.drum(0, { gain: 1, f: 0.85, decay: 0.2 });
        const data = s.finish(0.6);
        this.drumBuf = ctx.createBuffer(1, data.length, SR);
        this.drumBuf.getChannelData(0).set(data);
      }
      const src = ctx.createBufferSource();
      src.buffer = this.drumBuf;
      src.playbackRate.value = 0.97 + Math.random() * 0.06;
      const g = ctx.createGain();
      g.gain.value = vel;
      src.connect(g); g.connect(this.musicBus); g.connect(this.musicSend);
      src.onended = () => { try { g.disconnect(); } catch (e) { /* já desligado */ } };
      src.start(Math.max(t, ctx.currentTime));
    }

    combat() { this.music.lastCombat = performance.now(); }
  }

  // fanfarras abaixam a música enquanto tocam
  for (const [k, s] of [['victory', 4.6], ['defeat', 4.7], ['wonder', 3.5], ['war', 2.6], ['capture', 1.8], ['lost', 2], ['found', 2.2], ['tech', 1.2], ['peace', 2]]) SFX[k].duck = s;

  PP.SFX = SFX;
  PP.SFX_RATE = SR;
  PP.renderSfx = renderSfx;
  PP.renderPluck = renderPluck;
  PP.Synth = Synth;
  PP.AudioEngine = AudioEngine;
  PP.musicTheory = { SCALE, PROGS, midiOf, chordOf };
  if (typeof window !== 'undefined' && typeof document !== 'undefined') PP.audio = new AudioEngine();
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
