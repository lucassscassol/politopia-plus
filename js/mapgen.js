/* Politopia+ — geração procedural de mapas.
   Ordem de geração (cada etapa nunca sobrescreve o que as anteriores garantiram):
     0. mundo (elevação, terra, biomas e terrenos)
     1. capitais            2. área inicial          3. recursos essenciais
     4. recursos exclusivos 5. recursos secundários  6. aldeias
     7. ruínas              8. pontos estratégicos   9. decorativos (desenhados pelo renderizador)
   Depois da geração, validateMap confere justiça e jogabilidade; se falhar, o mapa é descartado
   e gerado de novo a partir de uma semente derivada (determinística). */
(function (PP) {
  'use strict';

  function cheb(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); }
  const MAX_TRIES = 12;

  // Âncoras de capitais para os tipos de mapa dos cenários
  function anchorsFor(mtype, W, H, nP) {
    if (mtype === 'dois_continentes') {
      const left = [], right = [];
      for (let i = 0; i < nP; i++) (i % 2 === 0 ? left : right).push(i);
      const out = new Array(nP);
      [[left, 0.25], [right, 0.75]].forEach(([ids, fx]) => {
        ids.forEach((id, j) => { out[id] = { x: W * fx, y: H * (j + 1) / (ids.length + 1) }; });
      });
      return out;
    }
    if (mtype === 'ilhas') {
      const out = [];
      const off = 0.4;
      for (let i = 0; i < nP; i++) {
        const a = off + i * Math.PI * 2 / nP;
        out.push({ x: W / 2 + Math.cos(a) * W * 0.32, y: H / 2 + Math.sin(a) * H * 0.32 });
      }
      return out;
    }
    return null;
  }

  function generateOnce(game) {
    const W = game.W, H = game.H, N = W * H, rng = game.rng, opts = game.opts;
    const mtype = opts.mapType in PP.MAP_TYPES ? opts.mapType : 'continentes';
    const landRatio = PP.MAP_TYPES[mtype].land;
    const nP = game.players.length;
    const anchors = anchorsFor(mtype, W, H, nP);
    const nE = new PP.Noise(rng), nR = new PP.Noise(rng), nM = new PP.Noise(rng), nA = new PP.Noise(rng), nJ = new PP.Noise(rng);
    const ox = rng.int(1000), oy = rng.int(1000);

    // ================================================================ 0. Mundo
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
        else if (mtype === 'dois_continentes') {
          const l = 1 - Math.hypot((x - W * 0.25) / (W * 0.24), (y - H / 2) / (H * 0.46));
          const r = 1 - Math.hypot((x - W * 0.75) / (W * 0.24), (y - H / 2) / (H * 0.46));
          e = nE.fbm(ox + x / 4, oy + y / 4, 4) * 0.45 + Math.max(l, r) * 0.9;
          if (Math.abs(x - (W - 1) / 2) < 1.3) e -= 2;
        } else if (mtype === 'ilhas') {
          let best = -9;
          for (const a of anchors) best = Math.max(best, 1.2 - Math.hypot(x - a.x, y - a.y) / Math.max(3.2, W * 0.16));
          e = nE.fbm(ox + x / 2.2, oy + y / 2.2, 3) * 0.35 + best + (1 - Math.pow(edge, 4)) * 0.1;
        } else e = nE.fbm(ox + x / 4.2, oy + y / 4.2, 4) + (1 - Math.pow(edge, 3)) * 0.45;
        elev[y * W + x] = e;
      }
    }
    const sorted = elev.slice().sort((a, b) => a - b);
    const thr = sorted[Math.min(N - 1, Math.floor((1 - landRatio) * N))];
    const land = elev.map(e => e >= thr);

    const tiles = new Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      tiles[y * W + x] = { x, y, terrain: land[y * W + x] ? 'plains' : 'ocean', biome: null, res: null, imp: null, impLevel: 0,
        road: false, owner: -1, cityId: 0, city: 0, village: false, ruin: false, wonder: null,
        fort: null, landmark: null, pillaged: false, ruinType: null, shrine: -1 };
    }
    game.tiles = tiles;
    const T = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? tiles[y * W + x] : null);
    const isLand = t => !PP.TERRAIN[t.terrain].water;
    const locked = new Uint8Array(N); // recursos e casas garantidos pelas etapas 1–4

    function components(isL) {
      const comp = new Int32Array(N).fill(-1);
      const size = [];
      for (let i = 0; i < N; i++) {
        if (!isL(i) || comp[i] >= 0) continue;
        const id = size.length; let s = 0;
        const stack = [i]; comp[i] = id;
        while (stack.length) {
          const k = stack.pop(); s++;
          const kx = k % W, ky = (k / W) | 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const t = T(kx + dx, ky + dy);
            if (!t) continue;
            const j = t.y * W + t.x;
            if (isL(j) && comp[j] < 0) { comp[j] = id; stack.push(j); }
          }
        }
        size.push(s);
      }
      return { comp, size };
    }
    const cc = components(i => land[i]);

    // ================================================================ 1. Capitais
    const margin = W >= 18 ? 2 : 1;
    let cands = [];
    for (let i = 0; i < N; i++) {
      const x = i % W, y = (i / W) | 0;
      if (land[i] && x >= margin && y >= margin && x < W - margin && y < H - margin && cc.size[cc.comp[i]] >= 8) cands.push(i);
    }
    if (cands.length < nP * 3) {
      cands = [];
      for (let i = 0; i < N; i++) {
        const x = i % W, y = (i / W) | 0;
        if (land[i] && x >= 1 && y >= 1 && x < W - 1 && y < H - 1) cands.push(i);
      }
    }
    if (cands.length < nP) {
      cands = [];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) cands.push(y * W + x);
    }
    const caps = [];
    if (anchors) {
      for (let i = 0; i < nP; i++) {
        const a = anchors[i];
        let best = -1, bd = 1e9;
        for (const c of cands) {
          if (caps.indexOf(c) >= 0) continue;
          const cx = c % W, cy = (c / W) | 0;
          if (caps.some(k => cheb(cx, cy, k % W, (k / W) | 0) < 3)) continue;
          const d = Math.hypot(cx - a.x, cy - a.y) + rng.next() * 0.5;
          if (d < bd) { bd = d; best = c; }
        }
        if (best < 0) {
          const ax = Math.max(1, Math.min(W - 2, Math.round(a.x))), ay = Math.max(1, Math.min(H - 2, Math.round(a.y)));
          best = ay * W + ax;
        }
        caps.push(best);
      }
    } else {
      caps.push(rng.pick(cands));
      while (caps.length < nP) {
        const scored = cands.filter(c => caps.indexOf(c) < 0).map(c => {
          const cx = c % W, cy = (c / W) | 0;
          let md = 1e9;
          for (const k of caps) md = Math.min(md, Math.hypot(cx - (k % W), cy - ((k / W) | 0)));
          return [c, md + rng.next() * 1.5];
        });
        scored.sort((a, b) => b[1] - a[1]);
        caps.push(scored[rng.int(Math.min(3, scored.length))][0]);
      }
    }
    const capPos = caps.map(c => ({ x: c % W, y: (c / W) | 0 }));
    const isCap = t => capPos.some(c => c.x === t.x && c.y === t.y);
    capPos.forEach(c => { locked[c.y * W + c.x] = 1; });

    // Biomas: Voronoi com borda irregular
    for (const t of tiles) {
      let best = 0, bd = 1e9;
      capPos.forEach((c, i) => {
        const d = Math.hypot(t.x - c.x, t.y - c.y) + nJ.value(t.x / 2.5 + i * 7.3, t.y / 2.5) * 2.2;
        if (d < bd) { bd = d; best = i; }
      });
      t.biome = game.players[best].tribe;
    }

    // ================================================================ 2. Área inicial
    capPos.forEach((c, i) => {
      const tribe = PP.TRIBES[game.players[i].tribe];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const t = T(c.x + dx, c.y + dy);
        if (!t) continue;
        const mustLand = dx === 0 && dy === 0;
        if (!isLand(t) && (mustLand || rng.chance(0.65))) { t.terrain = tribe.biome.base; land[t.y * W + t.x] = true; }
      }
    });

    // Terrenos de terra
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

    // Águas rasas x oceano
    for (const t of tiles) {
      if (isLand(t)) continue;
      let near = 9;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const n = T(t.x + dx, t.y + dy);
        if (n && isLand(n)) near = Math.min(near, cheb(0, 0, dx, dy));
      }
      t.terrain = near <= 1 || (near === 2 && rng.chance(0.35)) ? 'water' : 'ocean';
    }

    // Capital em terreno plano; no máximo 2 montanhas e nenhum pântano colado nela
    capPos.forEach((c, i) => {
      const t = T(c.x, c.y);
      const base = PP.TRIBES[game.players[i].tribe].biome.base;
      t.terrain = base === 'desert' || base === 'tundra' ? base : 'plains';
      let mountains = 0;
      for (const n of ring(c, 1)) {
        if (n.terrain === 'mountain' && ++mountains > 2) n.terrain = 'hills';
        if (n.terrain === 'swamp') n.terrain = base === 'desert' || base === 'tundra' ? base : 'plains';
      }
    });

    function ring(c, r, keepVillages) {
      const out = [];
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (!dx && !dy) continue;
        const t = T(c.x + dx, c.y + dy);
        if (t && (keepVillages || !t.village)) out.push(t);
      }
      return out;
    }

    // ================================================================ 3. Recursos essenciais (travados)
    function ensure(c, r, res, terrains, count) {
      const area = ring(c, r).filter(t => !isCap(t));
      let have = area.filter(t => t.res === res).length;
      area.forEach(t => { if (t.res === res) locked[t.y * W + t.x] = 1; });
      if (have >= (count || 1)) return;
      const wantWater = terrains[0] === 'water' || terrains[0] === 'ocean';
      let pool = area.filter(t => terrains.indexOf(t.terrain) >= 0 && !t.res && !locked[t.y * W + t.x]);
      if (!pool.length) pool = area.filter(t => isLand(t) === !wantWater && !t.res && !locked[t.y * W + t.x]);
      if (!pool.length) pool = area.filter(t => isLand(t) === !wantWater && !locked[t.y * W + t.x]);
      rng.shuffle(pool);
      for (const t of pool) {
        if (have >= (count || 1)) break;
        if (terrains.indexOf(t.terrain) < 0) t.terrain = terrains[0];
        t.res = res; have++;
        locked[t.y * W + t.x] = 1;
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

    // ================================================================ 4. Recursos exclusivos (um luxo típico perto de cada capital)
    const EXCLUSIVE = { aymara: ['gems', ['hills', 'mountain']], tupina: ['spices', ['forest', 'swamp']], vikar: ['whale', ['ocean']],
      qadir: ['gems', ['desert', 'hills']], hanlu: ['spices', ['plains', 'forest']], zambe: ['horses', ['plains', 'desert']] };
    capPos.forEach((c, i) => {
      const ex = EXCLUSIVE[game.players[i].tribe];
      for (let r = 2; r <= 4; r++) {
        const area = ring(c, r).filter(t => cheb(t.x, t.y, c.x, c.y) >= 2 && ex[1].indexOf(t.terrain) >= 0 && !locked[t.y * W + t.x]);
        if (area.some(t => t.res === ex[0])) { area.filter(t => t.res === ex[0]).forEach(t => { locked[t.y * W + t.x] = 1; }); break; }
        const pool = area.filter(t => !t.res);
        if (pool.length) { const t = rng.pick(pool); t.res = ex[0]; locked[t.y * W + t.x] = 1; break; }
      }
    });

    // ================================================================ 5. Recursos secundários
    const TABLE = {
      plains:   [['fruit', 3], ['crop', 3], ['horses', 1.4], ['spices', 0.4]],
      forest:   [['game', 4], ['spices', 0.8], ['fruit', 0.6]],
      hills:    [['ore', 3], ['gems', 1], ['fruit', 1.4]],
      mountain: [['ore', 3], ['gems', 1.4]],
      desert:   [['gems', 1], ['horses', 1.5], ['crop', 1], ['fruit', 1]],
      tundra:   [['game', 1.5], ['horses', 1], ['fruit', 0.6], ['crop', 0.4]],
      swamp:    [['spices', 2], ['fruit', 1.5], ['game', 0.5]],
    };
    const capDist = t => { let d = 99; for (const c of capPos) d = Math.min(d, cheb(c.x, c.y, t.x, t.y)); return d; };
    for (const t of tiles) {
      if (t.res || locked[t.y * W + t.x]) continue;
      const d = capDist(t);
      const bias = PP.TRIBES[t.biome].resBias || {};
      if (t.terrain === 'water') {
        const p = d <= 1 ? 0.45 : d <= 2 ? 0.3 : 0.12;
        if (rng.chance(p * (bias.fish || 1))) t.res = 'fish';
      } else if (t.terrain === 'ocean') {
        if (rng.chance(0.06 * (bias.whale || 1))) t.res = 'whale';
      } else {
        const p = d <= 2 ? 0.3 : 0.17;
        if (rng.chance(p)) t.res = rng.weighted(TABLE[t.terrain].map(e => [e[0], e[1] * (bias[e[0]] || 1)]));
      }
    }

    // ================================================================ 6. Aldeias (nunca em recurso garantido)
    const villages = [];
    const landCount = tiles.filter(isLand).length;
    const vTarget = Math.max(nP, Math.round(landCount / 14) - nP + 2);
    const expandMax = mtype === 'ilhas' || mtype === 'arquipelago' ? 6 : 5;
    const vCands = rng.shuffle(tiles.filter(t => isLand(t) && t.terrain !== 'mountain' && !locked[t.y * W + t.x] &&
      t.x > 0 && t.y > 0 && t.x < W - 1 && t.y < H - 1));
    // primeiro, uma aldeia de expansão para cada capital (distância 3 a 5)
    capPos.forEach(c => {
      const near = vCands.filter(t => { const d = cheb(c.x, c.y, t.x, t.y); return d >= 3 && d <= expandMax && !t.village && capDist(t) >= 3; });
      let t = near.find(v => villages.every(o => cheb(o.x, o.y, v.x, v.y) >= 3));
      if (!t && (mtype === 'ilhas' || mtype === 'arquipelago')) {
        // ilhas pequenas: ergue uma ilhota com aldeia a 3–4 casas da capital
        const spots = rng.shuffle(tiles.filter(n => { const d = cheb(c.x, c.y, n.x, n.y); return d >= 3 && d <= 4 && capDist(n) >= 3 && !locked[n.y * W + n.x] && n.x > 0 && n.y > 0 && n.x < W - 1 && n.y < H - 1; }));
        t = spots.find(v => villages.every(o => cheb(o.x, o.y, v.x, v.y) >= 3));
        if (t) {
          t.terrain = PP.TRIBES[t.biome].biome.base === 'tundra' ? 'tundra' : 'plains';
          for (const n of ring(t, 1, true)) if (n.terrain === 'ocean') { n.terrain = 'water'; if (n.res === 'whale') n.res = null; }
        }
      }
      if (t) { t.village = true; t.res = null; villages.push(t); }
    });
    for (const t of vCands) {
      if (villages.length >= vTarget) break;
      if (t.village || capDist(t) < 3) continue;
      if (villages.some(v => cheb(v.x, v.y, t.x, t.y) < 3)) continue;
      t.village = true; t.res = null; villages.push(t);
    }
    // cada aldeia tem pelo menos dois recursos colados (sem mexer nos travados)
    for (const v of villages) {
      const area = ring(v, 1).filter(t => !locked[t.y * W + t.x] && !isCap(t));
      let have = area.filter(t => t.res).length;
      for (const t of rng.shuffle(area.filter(t => !t.res))) {
        if (have >= 2) break;
        if (t.terrain === 'water') t.res = 'fish';
        else if (t.terrain === 'ocean') continue;
        else t.res = rng.weighted(TABLE[t.terrain].map(e => [e[0], e[1]]));
        have++;
      }
    }

    // Recursos só fazem sentido nos terrenos certos
    for (const t of tiles) {
      if (t.res === 'fish' && t.terrain !== 'water') t.res = null;
      if (t.res === 'whale' && t.terrain !== 'ocean') t.res = null;
      if (t.res && t.res !== 'fish' && t.res !== 'whale' && !isLand(t)) t.res = null;
    }

    const centers = capPos.concat(villages.map(v => ({ x: v.x, y: v.y })));
    const nearDist = t => { let d = 99; for (const c of centers) d = Math.min(d, cheb(c.x, c.y, t.x, t.y)); return d; };

    // ================================================================ 7. Ruínas (com tipo)
    const rTarget = Math.max(2, Math.round(N / 55));
    const rCands = rng.shuffle(tiles.filter(t => isLand(t) && !t.village && !t.res && t.terrain !== 'mountain' && !locked[t.y * W + t.x]));
    const ruins = [];
    const RT = [['fortaleza', 2], ['templo', 2], ['biblioteca', 2], ['acampamento', 2], ['tumulo', 1]];
    for (const t of rCands) {
      if (ruins.length >= rTarget) break;
      if (nearDist(t) < 3) continue;
      if (ruins.some(r => cheb(r.x, r.y, t.x, t.y) < 4)) continue;
      t.ruin = true; t.ruinType = rng.weighted(RT); ruins.push(t);
    }

    // ================================================================ 8. Pontos estratégicos
    placeLandmarks(game, { T, W, H, N, rng, capPos, locked, isLand, components });

    // 9. Decorativos: vegetação, rochas e texturas são derivados da posição pelo renderizador.
    return capPos;
  }

  function placeLandmarks(game, ctx) {
    const { T, W, rng, capPos, locked, isLand, components } = ctx;
    const tiles = game.tiles;
    const big = W >= 22 ? 1 : 0;
    const placed = [];
    const free = t => !t.res && !t.village && !t.ruin && !t.landmark && !locked[t.y * W + t.x];
    const farCap = (t, d) => capPos.every(c => cheb(c.x, c.y, t.x, t.y) >= d);
    const spaced = t => placed.every(o => cheb(o.x, o.y, t.x, t.y) >= 3);
    const OPP = [[[-1, 0], [1, 0]], [[0, -1], [0, 1]], [[-1, -1], [1, 1]], [[1, -1], [-1, 1]]];
    const put = (list, id, limit) => {
      let n = 0;
      for (const t of rng.shuffle(list)) {
        if (n >= limit) break;
        if (!free(t) || !spaced(t)) continue;
        t.landmark = id; placed.push(t); n++;
      }
    };
    const at = (t, d) => T(t.x + d[0], t.y + d[1]);
    // Passo de montanha: casa transitável espremida entre montanhas
    const passes = tiles.filter(t => isLand(t) && t.terrain !== 'mountain' && farCap(t, 2) && OPP.some(([a, b], k) => {
      const A = at(t, a), B = at(t, b);
      if (!A || !B || A.terrain !== 'mountain' || B.terrain !== 'mountain') return false;
      const [c, d] = OPP[k < 2 ? 1 - k : 5 - k];
      const C = at(t, c), D = at(t, d);
      return C && D && C.terrain !== 'mountain' && D.terrain !== 'mountain' && isLand(C) && isLand(D);
    }));
    put(passes, 'passo', 1 + big * 2);
    // Ponte antiga (vau) ligando massas de terra diferentes, e estreitos navegáveis
    const cc = components(i => isLand(tiles[i]));
    const bridges = [], straits = [];
    for (const t of tiles) {
      if (t.terrain !== 'water' || !farCap(t, 2)) continue;
      for (let k = 0; k < OPP.length; k++) {
        const [a, b] = OPP[k];
        const A = at(t, a), B = at(t, b);
        if (!A || !B || !isLand(A) || !isLand(B) || A.terrain === 'mountain' || B.terrain === 'mountain') continue;
        const ca = cc.comp[A.y * W + A.x], cb = cc.comp[B.y * W + B.x];
        if (ca !== cb) { bridges.push(t); break; }
        const [c, d] = OPP[k < 2 ? 1 - k : 5 - k];
        const C = at(t, c), D = at(t, d);
        if (C && D && !isLand(C) && !isLand(D)) { straits.push(t); break; }
      }
    }
    put(bridges, 'vau', game.opts.mapType === 'ilhas' ? 1 : 1 + big);
    put(straits.filter(t => t.landmark == null), 'estreito', 1 + big);
    // Porto natural: baía abrigada
    const bays = tiles.filter(t => t.terrain === 'water' && farCap(t, 1) && tiles.length &&
      game.neighbors(t).filter(n => isLand(n)).length >= 5);
    put(bays, 'porto_natural', 2);
    // Mina abandonada: colinas ou montanhas longe das capitais
    put(tiles.filter(t => (t.terrain === 'hills' || t.terrain === 'mountain') && farCap(t, 3)), 'mina_abandonada', 1 + big);
    // Ruína imperial: terra firme perto do centro do mapa
    const cx = (W - 1) / 2, cy = (game.H - 1) / 2;
    const imperial = tiles.filter(t => isLand(t) && t.terrain !== 'mountain' && t.terrain !== 'swamp' && farCap(t, 4))
      .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)).slice(0, 12);
    put(imperial, 'ruina_imperial', 1 + big);
  }

  // Confere se o mapa é justo e jogável. Retorna { ok, issues, score, values }.
  PP.validateMap = function (game, capPos) {
    const W = game.W, H = game.H, tiles = game.tiles;
    const T = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? tiles[y * W + x] : null);
    const isLand = t => !PP.TERRAIN[t.terrain].water || t.landmark === 'vau';
    const issues = [];
    const island = game.opts.mapType === 'ilhas' || game.opts.mapType === 'arquipelago';
    const minCap = Math.max(3, Math.floor(W / 4.5));
    for (let i = 0; i < capPos.length; i++) for (let j = i + 1; j < capPos.length; j++) {
      if (cheb(capPos[i].x, capPos[i].y, capPos[j].x, capPos[j].y) < minCap) issues.push(`capitais ${i} e ${j} muito próximas`);
    }
    const values = capPos.map((c, i) => {
      const t = T(c.x, c.y);
      if (!t || !isLand(t) || t.terrain === 'mountain') issues.push(`capital ${i} em casa inválida`);
      let walk = 0, r1 = { fruit: 0 }, r2 = { ore: 0, horses: 0, crop: 0 }, res = 0, vill = 0, land3 = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        if (!dx && !dy) continue;
        const n = T(c.x + dx, c.y + dy);
        if (!n) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (d === 1 && isLand(n) && n.terrain !== 'mountain') walk++;
        if (d === 1 && n.res === 'fruit') r1.fruit++;
        if (d <= 2 && n.res in r2) r2[n.res]++;
        if (d <= 2 && n.res) res++;
        if (isLand(n) && n.terrain !== 'mountain') land3++;
      }
      for (const v of tiles) if (v.village && cheb(v.x, v.y, c.x, c.y) <= (island ? 6 : 5)) vill++;
      if (walk < 4) issues.push(`capital ${i} cercada (${walk} casas livres)`);
      if (r1.fruit < 2) issues.push(`capital ${i} sem frutas suficientes`);
      for (const k in r2) if (!r2[k]) issues.push(`capital ${i} sem ${k}`);
      if (!vill) issues.push(`capital ${i} sem aldeia para expandir`);
      return res * 2 + vill * 5 + land3 * 0.3;
    });
    // alcance por terra da primeira aldeia (exceto mapas de ilhas)
    if (!island) {
      capPos.forEach((c, i) => {
        const seen = new Uint8Array(W * H), q = [c.y * W + c.x];
        seen[q[0]] = 1;
        let found = false, head = 0;
        while (head < q.length && !found) {
          const k = q[head++], t = tiles[k];
          if (t.village) { found = true; break; }
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const n = T(t.x + dx, t.y + dy);
            if (!n || !isLand(n)) continue;
            const j = n.y * W + n.x;
            if (seen[j] || Math.max(Math.abs(n.x - c.x), Math.abs(n.y - c.y)) > 7) continue;
            seen[j] = 1; q.push(j);
          }
        }
        if (!found) issues.push(`capital ${i} não alcança aldeias por terra`);
      });
    }
    const mx = Math.max.apply(null, values), mn = Math.min.apply(null, values);
    const ratio = mx > 0 ? mn / mx : 1;
    if (ratio < 0.6) issues.push(`desequilíbrio de recursos (${ratio.toFixed(2)})`);
    return { ok: issues.length === 0, issues, score: ratio * 100 - issues.length * 20, values, ratio };
  };

  PP.generateMap = function (game) {
    const base = game.opts.seed >>> 0;
    let best = null;
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      const seed = attempt === 0 ? base : (base + attempt * 7919) >>> 0;
      game.rng = new PP.RNG(seed || 1);
      const caps = generateOnce(game);
      const report = PP.validateMap(game, caps);
      if (report.ok) { game.mapInfo = { attempts: attempt + 1, ok: true, issues: [] }; return caps; }
      if (!best || report.score > best.report.score) best = { caps, tiles: game.tiles, report, rng: game.rng.s, attempt };
    }
    game.tiles = best.tiles;
    game.rng.s = best.rng;
    game.mapInfo = { attempts: MAX_TRIES, ok: false, issues: best.report.issues };
    return best.caps;
  };
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
