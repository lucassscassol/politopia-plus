/* Chamas de Vardren — utilidades: RNG com semente, ruído, helpers */
(function (PP) {
  'use strict';

  // Gerador pseudoaleatório determinístico (mulberry32). O estado cabe em um inteiro,
  // o que facilita salvar/carregar partidas.
  class RNG {
    constructor(seed) { this.s = (seed >>> 0) || 1; }
    next() {
      let a = (this.s = (this.s + 0x6d2b79f5) | 0);
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    int(n) { return Math.floor(this.next() * n); }
    range(a, b) { return a + this.next() * (b - a); }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[this.int(arr.length)]; }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.int(i + 1);
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      return arr;
    }
    weighted(entries) { // [[valor, peso], ...]
      let total = 0;
      for (const e of entries) total += Math.max(0, e[1]);
      if (total <= 0) return entries.length ? entries[0][0] : null;
      let r = this.next() * total;
      for (const e of entries) { r -= Math.max(0, e[1]); if (r <= 0) return e[0]; }
      return entries[entries.length - 1][0];
    }
  }

  // Ruído de valor 2D com interpolação suave + fBm
  class Noise {
    constructor(rng) {
      this.perm = new Uint8Array(512);
      this.vals = new Float32Array(256);
      const p = [];
      for (let i = 0; i < 256; i++) { p.push(i); this.vals[i] = rng.next(); }
      rng.shuffle(p);
      for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    }
    lattice(x, y) { return this.vals[this.perm[(x & 255) + this.perm[y & 255]]]; }
    value(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = this.lattice(xi, yi), b = this.lattice(xi + 1, yi);
      const c = this.lattice(xi, yi + 1), d = this.lattice(xi + 1, yi + 1);
      return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
    }
    fbm(x, y, oct) {
      let sum = 0, amp = 1, freq = 1, norm = 0;
      for (let i = 0; i < (oct || 4); i++) {
        sum += this.value(x * freq, y * freq) * amp;
        norm += amp; amp *= 0.5; freq *= 2;
      }
      return sum / norm;
    }
  }

  // Normaliza um array para distribuição uniforme [0,1] por ranking
  function rankNormalize(arr) {
    const idx = arr.map((v, i) => i).sort((a, b) => arr[a] - arr[b]);
    const out = new Array(arr.length);
    const n = Math.max(1, arr.length - 1);
    idx.forEach((k, r) => { out[k] = r / n; });
    return out;
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  PP.RNG = RNG;
  PP.Noise = Noise;
  PP.rankNormalize = rankNormalize;
  PP.clamp = clamp;
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
