/* Politopia+ — geração procedural de mapas */
(function (PP) {
  'use strict';

  function cheb(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); }

  PP.generateMap = function (game) {
    const W = game.W, H = game.H, N = W * H, rng = game.rng, opts = game.opts;
    const mtype = opts.mapType in PP.MAP_TYPES ? opts.mapType : 'continentes';
    const landRatio = PP.MAP_TYPES[mtype].land;
    const nE = new PP.Noise(rng), nR = new PP.Noise(rng), nM = new PP.Noise(rng), nA = new PP.Noise(rng), nJ = new PP.Noise(rng);
    const ox = rng.int(1000), oy = rng.int(1000);

    // ---- Elevação e máscara de terra
    const elev = new Array(N);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const nx = (x / (W - 1)) * 2 - 1, ny = (y / (H - 1)) * 2 - 1;
        const edge = Math.max(Math.abs(nx), Math.abs(ny));
        const radial = 1 - Math.min(1, Math.hypot(nx, ny) / 1.3);
        let e;
        if (mtype === 'pangeia') e = nE.fbm(ox + x / 5, oy + y / 5, 4) * 0.55 + radial * 0.9;
        else if (mtype === 'arquipelago') e = nE.fbm(ox + x / 2.4, oy + y / 2.4, 3) + (1 - Math.pow(edge, 4)) * 0.25;
        else if (mtype === 'lagos') e = nE.fbm(ox + x / 3.5, oy + y / 3.5, 4) + (1 - Math.pow(edge, 6)) * 0.35;
        else e = nE.fbm(ox + x / 4.2, oy + y / 4.2, 4) + (1 - Math.pow(edge, 3)) * 0.45;
        elev[y * W + x] = e;
      }
    }
    const sorted = elev.slice().sort((a, b) => a - b);
    const thr = sorted[Math.min(N - 1, Math.floor((1 - landRatio) * N))];
    const land = elev.map(e => e >= thr);

    const tiles = new Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      tiles[y * W + x] = { x, y, terrain: land[y * W + x] ? 'plains' : 'ocean', biome: null, res: null, imp: null, impLevel: 0,
        road: false, owner: -1, cityId: 0, city: 0, village: false, ruin: false, wonder: null };
    }
    game.tiles = tiles;
    const T = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? tiles[y * W + x] : null);
    const isLand = t => !PP.TERRAIN[t.terrain].water;

    // ---- Componentes conexos de terra
    const comp = new Int32Array(N).fill(-1);
    const compSize = [];
    for (let i = 0; i < N; i++) {
      if (!land[i] || comp[i] >= 0) continue;
      const id = compSize.length; let size = 0;
      const stack = [i]; comp[i] = id;
      while (stack.length) {
        const k = stack.pop(); size++;
        const kx = k % W, ky = (k / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const t = T(kx + dx, ky + dy);
          if (!t) continue;
          const j = t.y * W + t.x;
          if (land[j] && comp[j] < 0) { comp[j] = id; stack.push(j); }
        }
      }
      compSize.push(size);
    }

    // ---- Capitais (amostragem do ponto mais distante)
    const nP = game.players.length;
    const margin = W >= 18 ? 2 : 1;
    let cands = [];
    for (let i = 0; i < N; i++) {
      const x = i % W, y = (i / W) | 0;
      if (land[i] && x >= margin && y >= margin && x < W - margin && y < H - margin && compSize[comp[i]] >= 8) cands.push(i);
    }
    if (cands.length < nP * 3) {
      cands = [];
      for (let i = 0; i < N; i++) {
        const x = i % W, y = (i / W) | 0;
        if (land[i] && x >= 1 && y >= 1 && x < W - 1 && y < H - 1) cands.push(i);
      }
    }
    if (cands.length < nP) { // mapa degenerado: aceita qualquer casa interna
      cands = [];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) cands.push(y * W + x);
    }
    const caps = [];
    caps.push(rng.pick(cands));
    while (caps.length < nP) {
      let scored = cands.filter(c => caps.indexOf(c) < 0).map(c => {
        const cx = c % W, cy = (c / W) | 0;
        let md = 1e9;
        for (const k of caps) md = Math.min(md, Math.hypot(cx - (k % W), cy - ((k / W) | 0)));
        return [c, md + rng.next() * 1.5];
      });
      scored.sort((a, b) => b[1] - a[1]);
      caps.push(scored[rng.int(Math.min(3, scored.length))][0]);
    }
    const capPos = caps.map(c => ({ x: c % W, y: (c / W) | 0 }));

    // ---- Biomas: Voronoi com borda irregular
    for (const t of tiles) {
      let best = 0, bd = 1e9;
      capPos.forEach((c, i) => {
        const d = Math.hypot(t.x - c.x, t.y - c.y) + nJ.value(t.x / 2.5 + i * 7.3, t.y / 2.5) * 2.2;
        if (d < bd) { bd = d; best = i; }
      });
      t.biome = game.players[best].tribe;
    }

    // ---- Garante espaço de terra ao redor das capitais
    capPos.forEach((c, i) => {
      const tribe = PP.TRIBES[game.players[i].tribe];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const t = T(c.x + dx, c.y + dy);
        if (!t) continue;
        const mustLand = dx === 0 && dy === 0;
        if (!isLand(t) && (mustLand || rng.chance(0.65))) { t.terrain = tribe.biome.base; land[t.y * W + t.x] = true; }
      }
    });

    // ---- Terrenos de terra
    const landIdx = [];
    for (let i = 0; i < N; i++) if (land[i]) landIdx.push(i);
    const rough = PP.rankNormalize(landIdx.map(i => nR.fbm(ox + (i % W) / 2.6, oy + ((i / W) | 0) / 2.6, 3)));
    const moist = PP.rankNormalize(landIdx.map(i => nM.fbm(ox + (i % W) / 3.2, oy + ((i / W) | 0) / 3.2, 3)));
    const alt = PP.rankNormalize(landIdx.map(i => nA.fbm(ox + (i % W) / 3, oy + ((i / W) | 0) / 3, 2)));
    landIdx.forEach((i, k) => {
      const t = tiles[i];
      const b = PP.TRIBES[t.biome].biome;
      const r = rough[k], m = moist[k], a = alt[k];
      if (r > 1 - b.mountain) t.terrain = 'mountain';
      else if (r > 1 - b.mountain - b.hills) t.terrain = 'hills';
      else if (m > 1 - b.forest) t.terrain = 'forest';
      else if (m < b.swamp) t.terrain = 'swamp';
      else t.terrain = a < b.altFrac ? b.alt : b.base;
    });

    // ---- Águas rasas x oceano
    for (const t of tiles) {
      if (isLand(t)) continue;
      let near = 9;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const n = T(t.x + dx, t.y + dy);
        if (n && isLand(n)) near = Math.min(near, cheb(0, 0, dx, dy));
      }
      t.terrain = near <= 1 || (near === 2 && rng.chance(0.35)) ? 'water' : 'ocean';
    }

    // ---- Capitais em planície
    capPos.forEach((c, i) => {
      const t = T(c.x, c.y);
      const base = PP.TRIBES[game.players[i].tribe].biome.base;
      t.terrain = base === 'desert' || base === 'tundra' ? base : 'plains';
    });

    // ---- Aldeias
    const villages = [];
    const landCount = tiles.filter(isLand).length;
    const vTarget = Math.max(nP, Math.round(landCount / 14) - nP + 2);
    const vCands = rng.shuffle(tiles.filter(t => isLand(t) && t.terrain !== 'mountain' && t.x > 0 && t.y > 0 && t.x < W - 1 && t.y < H - 1));
    for (const t of vCands) {
      if (villages.length >= vTarget) break;
      if (capPos.some(c => cheb(c.x, c.y, t.x, t.y) < 3)) continue;
      if (villages.some(v => cheb(v.x, v.y, t.x, t.y) < 3)) continue;
      t.village = true; villages.push(t);
    }

    // ---- Recursos
    const centers = capPos.concat(villages.map(v => ({ x: v.x, y: v.y })));
    const nearDist = t => { let d = 99; for (const c of centers) d = Math.min(d, cheb(c.x, c.y, t.x, t.y)); return d; };
    const TABLE = {
      plains:   [['fruit', 3], ['crop', 3], ['horses', 1.4], ['spices', 0.4]],
      forest:   [['game', 4], ['spices', 0.8], ['fruit', 0.6]],
      hills:    [['ore', 3], ['gems', 1], ['fruit', 1.4]],
      mountain: [['ore', 3], ['gems', 1.4]],
      desert:   [['gems', 1], ['horses', 1.5], ['crop', 1], ['fruit', 1]],
      tundra:   [['game', 1.5], ['horses', 1], ['fruit', 0.6], ['crop', 0.4]],
      swamp:    [['spices', 2], ['fruit', 1.5], ['game', 0.5]],
    };
    for (const t of tiles) {
      if (t.village || capPos.some(c => c.x === t.x && c.y === t.y)) continue;
      const d = nearDist(t);
      const bias = PP.TRIBES[t.biome].resBias || {};
      if (t.terrain === 'water') {
        const p = d <= 1 ? 0.45 : d <= 2 ? 0.3 : 0.08;
        if (rng.chance(p * (bias.fish || 1))) t.res = 'fish';
      } else if (t.terrain === 'ocean') {
        if (rng.chance(0.06 * (bias.whale || 1))) t.res = 'whale';
      } else {
        const p = d <= 1 ? 0.5 : d <= 2 ? 0.38 : 0.1;
        if (rng.chance(p)) t.res = rng.weighted(TABLE[t.terrain].map(e => [e[0], e[1] * (bias[e[0]] || 1)]));
      }
    }

    // ---- Garantias de justiça ao redor de cada capital
    function ring(c, r) {
      const out = [];
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (!dx && !dy) continue;
        const t = T(c.x + dx, c.y + dy);
        if (t && !t.village) out.push(t);
      }
      return out;
    }
    function ensure(c, r, res, terrains, count) {
      const area = ring(c, r);
      let have = area.filter(t => t.res === res).length;
      if (have >= (count || 1)) return;
      let opts2 = area.filter(t => terrains.indexOf(t.terrain) >= 0 && !t.res);
      if (!opts2.length) opts2 = area.filter(t => isLand(t) === (terrains[0] !== 'water') && !t.res);
      if (!opts2.length) opts2 = area.filter(t => isLand(t) === (terrains[0] !== 'water'));
      rng.shuffle(opts2);
      for (const t of opts2) {
        if (have >= (count || 1)) break;
        if (terrains.indexOf(t.terrain) < 0) t.terrain = terrains[0];
        t.res = res; have++;
      }
    }
    const SIGNATURE = { aymara: ['ore', ['hills', 'mountain']], tupina: ['game', ['forest']], vikar: ['fish', ['water']],
      qadir: ['horses', ['plains', 'desert']], hanlu: ['crop', ['plains']], zambe: ['game', ['forest']] };
    capPos.forEach((c, i) => {
      const tribe = game.players[i].tribe;
      ensure(c, 1, 'fruit', ['plains', 'forest', 'desert', 'tundra'], 2);
      const sig = SIGNATURE[tribe];
      if (sig[0] === 'fish' && !ring(c, 1).some(t => t.terrain === 'water')) ensure(c, 1, 'game', ['forest'], 1);
      else ensure(c, 1, sig[0], sig[1], 1);
      ensure(c, 2, 'ore', ['hills', 'mountain'], 1);
      ensure(c, 2, 'horses', ['plains', 'desert', 'tundra'], 1);
      ensure(c, 2, 'crop', ['plains'], 1);
    });
    // Recursos só fazem sentido nos terrenos certos (conversões acima podem ter mudado terreno)
    for (const t of tiles) {
      if (t.res === 'fish' && t.terrain !== 'water') t.res = null;
      if (t.res === 'whale' && t.terrain !== 'ocean') t.res = null;
      if (t.res && t.res !== 'fish' && t.res !== 'whale' && !isLand(t)) t.res = null;
    }

    // ---- Ruínas
    const rTarget = Math.max(2, Math.round(N / 55));
    const rCands = rng.shuffle(tiles.filter(t => !t.village && !t.res && t.terrain !== 'mountain'));
    const ruins = [];
    for (const t of rCands) {
      if (ruins.length >= rTarget) break;
      if (nearDist(t) < 3) continue;
      if (ruins.some(r => cheb(r.x, r.y, t.x, t.y) < 4)) continue;
      t.ruin = true; ruins.push(t);
    }

    return capPos;
  };
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
