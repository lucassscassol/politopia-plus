/* Politopia+ — replay simplificado: um quadro por rodada (dono de cada casa, cidades e unidades) e uma
   linha do tempo com os grandes acontecimentos. Os quadros são compactados em texto para caber no save. */
(function (PP) {
  'use strict';
  const TYPES = Object.keys(PP.UNITS);
  const MAX_FRAMES = 400;

  // Dono de cada casa em RLE: "dono*repetições," (dono -1 vira "x")
  function encodeOwners(tiles) {
    const out = [];
    let cur = null, n = 0;
    for (const t of tiles) {
      const o = t.owner;
      if (o === cur) { n++; continue; }
      if (cur !== null) out.push((cur < 0 ? 'x' : cur.toString(36)) + (n > 1 ? '*' + n.toString(36) : ''));
      cur = o; n = 1;
    }
    if (cur !== null) out.push((cur < 0 ? 'x' : cur.toString(36)) + (n > 1 ? '*' + n.toString(36) : ''));
    return out.join(',');
  }
  function decodeOwners(s, N) {
    const arr = new Int8Array(N).fill(-1);
    let i = 0;
    for (const part of s.split(',')) {
      if (!part) continue;
      const [o, c] = part.split('*');
      const v = o === 'x' ? -1 : parseInt(o, 36);
      const n = c ? parseInt(c, 36) : 1;
      for (let k = 0; k < n && i < N; k++) arr[i++] = v;
    }
    return arr;
  }

  const R = {
    ensureReplay() { if (!this.replay) this.replay = { frames: [], marks: [] }; },

    recordFrame() {
      this.ensureReplay();
      const W = this.W;
      const cities = this.cities.map(c => [c.x + c.y * W, c.owner, c.level, c.capital ? 1 : 0].map(v => v.toString(36)).join('.')).join(',');
      const units = this.units.map(u => [u.x + u.y * W, u.owner, Math.max(0, TYPES.indexOf(u.type))].map(v => v.toString(36)).join('.')).join(',');
      const f = { t: this.turn, o: encodeOwners(this.tiles), c: cities, u: units, s: this.players.map(p => (p.alive ? this.score(p) : 0)) };
      const fr = this.replay.frames;
      if (fr.length && fr[fr.length - 1].t === this.turn) fr[fr.length - 1] = f; else fr.push(f);
      if (fr.length > MAX_FRAMES) fr.shift();
    },

    mark(text, kind) {
      this.ensureReplay();
      this.replay.marks.push({ t: this.turn, k: kind || '', x: text });
      if (this.replay.marks.length > 600) this.replay.marks.shift();
    },

    // Decodifica um quadro para desenhar
    replayFrame(i) {
      this.ensureReplay();
      const f = this.replay.frames[i];
      if (!f) return null;
      const W = this.W, N = W * this.H;
      const parse = s => (s ? s.split(',').map(e => e.split('.').map(v => parseInt(v, 36))) : []);
      return {
        turn: f.t, owners: decodeOwners(f.o, N), scores: f.s,
        cities: parse(f.c).map(a => ({ x: a[0] % W, y: (a[0] / W) | 0, owner: a[1], level: a[2], capital: !!a[3] })),
        units: parse(f.u).map(a => ({ x: a[0] % W, y: (a[0] / W) | 0, owner: a[1], type: TYPES[a[2]] })),
        marks: this.replay.marks.filter(m => m.t === f.t),
      };
    },
  };

  Object.assign(PP.Game.prototype, R);
  PP.replayCodec = { encodeOwners, decodeOwners };

  PP.registerSystem('replay', {
    ready(g) { g.ensureReplay(); if (!g.replay.frames.length) g.recordFrame(); },
    load(g, sys) { g.replay = sys.replay || { frames: [], marks: [] }; },
    save(g, sys) { sys.replay = g.replay; },
    newRound(g) { g.recordFrame(); },
    gameover(g, winner, reason) {
      g.recordFrame();
      g.mark(winner >= 0 ? `${g.players[winner].name}: ${PP.victoryLabel ? PP.victoryLabel(reason) : reason}` : 'Fim de jogo', 'end');
    },
    capture(g, c, old, p) { g.mark(`${p.name} conquistou ${c.name} de ${old.name}`, 'capture'); },
    found(g, c, p) { g.mark(`${p.name} fundou ${c.name}`, 'found'); },
    war(g, a, b) { g.mark(`${g.players[a].name} declarou guerra a ${g.players[b].name}`, 'war'); },
    treaty(g, a, b, type) { g.mark(`${g.players[a].name} e ${g.players[b].name}: ${PP.RELATIONS[type] ? PP.RELATIONS[type].name : type}`, 'treaty'); },
    wonder(g, p, wid) { g.mark(`${p.name} construiu ${PP.WONDERS[wid].name}`, 'wonder'); },
    eliminated(g, p) { g.mark(`${p.name} foi eliminado`, 'eliminated'); },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
