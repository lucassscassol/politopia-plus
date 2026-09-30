/* Politopia+ — névoa de guerra com estados: não explorado, explorado, visível e inteligência recente.
   Cada jogador guarda quando viu cada casa pela última vez e onde viu tropas inimigas; essas
   "aparições" continuam no mapa (como fantasmas) por alguns turnos depois de sumirem da vista. */
(function (PP) {
  'use strict';

  PP.INTEL_TURNS = 5;
  PP.FOG = { UNEXPLORED: 0, EXPLORED: 1, VISIBLE: 2, RECENT: 3 };

  const I = {
    ensureIntel(p) {
      const n = this.W * this.H;
      if (!p.lastSeen || p.lastSeen.length !== n) p.lastSeen = new Int16Array(n);
      if (!p.sightings) p.sightings = {};
    },

    updateIntel(p) {
      this.ensureIntel(p);
      if (this.loadingIntel) return; // ao carregar, a visão é recalculada mas a memória salva é mantida
      const vis = p.visible, ls = p.lastSeen, sg = p.sightings, W = this.W, turn = this.turn;
      for (let i = 0; i < vis.length; i++) {
        if (!vis[i]) continue;
        ls[i] = turn;
        if (sg[i]) delete sg[i];
      }
      for (const u of this.units) {
        if (u.owner === p.id || (this.allied && this.allied(u.owner, p.id))) continue;
        const i = u.y * W + u.x;
        if (vis[i] && this.unitVisibleTo(u, p.id)) sg[i] = { t: u.type, o: u.owner, h: u.hp, turn };
      }
      for (const k in sg) if (turn - sg[k].turn > PP.INTEL_TURNS) delete sg[k];
    },

    fogState(p, i) {
      if (!p.explored[i]) return PP.FOG.UNEXPLORED;
      if (p.visible[i]) return PP.FOG.VISIBLE;
      if (p.lastSeen && p.lastSeen[i] && this.turn - p.lastSeen[i] <= PP.INTEL_TURNS) return PP.FOG.RECENT;
      return PP.FOG.EXPLORED;
    },

    // Aparições de tropas fora da vista (para o renderizador e a IA)
    ghostsFor(p) {
      const out = [];
      if (!p.sightings) return out;
      for (const k in p.sightings) {
        const i = +k;
        if (p.visible[i]) continue;
        const s = p.sightings[k];
        out.push({ x: i % this.W, y: (i / this.W) | 0, type: s.t, owner: s.o, hp: s.h, age: this.turn - s.turn });
      }
      return out;
    },
  };

  Object.assign(PP.Game.prototype, I);

  PP.registerSystem('intel', {
    init(g) { g.players.forEach(p => g.ensureIntel(p)); },
    load(g, sys) {
      g.loadingIntel = true;
      g.players.forEach((p, k) => {
        g.ensureIntel(p);
        const arr = sys.lastSeen && sys.lastSeen[k];
        if (arr) for (let i = 0; i < arr.length && i < p.lastSeen.length; i++) p.lastSeen[i] = arr[i];
      });
    },
    save(g, sys) { sys.lastSeen = g.players.map(p => (p.lastSeen ? Array.from(p.lastSeen) : [])); },
    ready(g) { g.loadingIntel = false; },
    vision(g, p) { g.updateIntel(p); },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
