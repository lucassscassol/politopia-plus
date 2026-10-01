/* Chamas de Vardren — organização dos reinos, Era V e personagens.
   Capacidade administrativa: cada reino governa bem um certo número de cidades (base + tecnologias +
   construções + Governador). Cidades além disso geram desordem: −5% de estrelas e ciência das cidades por
   cidade excedente (máx. −25%). Alcance da corte: cidades longe da capital, de um Paço Regional ou de um
   Governador rendem 20% menos (10% com Tribunal); estrada ou porto até a capital encurta a distância.
   Personagens (General, Governador, Embaixador) têm nome próprio, um de cada por reino.
   Partidas criadas antes desta versão (sem opts.realm) não sofrem desordem nem distância; as tecnologias,
   construções e personagens novos valem para todas. */
(function (PP) {
  'use strict';
  const UN = PP.UNITS;
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  PP.REALM = {
    base: 4,
    techs: { organizacao: 1, escrita: 1, codigo_leis: 1, burocracia: 2 },
    capitalRadius: 7, chanceryRadius: 2, seatRadius: 5, governorRadius: 4, roadReach: 2,
    seatMinDist: 5, seatMinLevel: 3, seatExtraCost: 4,
    disorderStep: 0.05, disorderMax: 0.25, remoteCut: 0.2,
    governorStars: 2, foundryStars: 2, pressSci: 2, generalAtk: 0.2, generalDef: 0.1,
  };
  PP.CHARACTERS = Object.keys(UN).filter(k => UN[k].character);

  // Lembranças diplomáticas da Embaixada e do Embaixador (renovadas a cada turno enquanto valem)
  PP.MEMORY_KINDS.embassy = { label: 'Mantém uma embaixada conosco', v: 1, decay: 10, cap: 10 };
  PP.MEMORY_KINDS.envoy = { label: 'Enviou um embaixador até nós', v: 2, decay: 12, cap: 20 };

  const R = {
    realmOn() { return !!(this.opts && this.opts.realm); },

    // Cache próprio: a capacidade e os centros mudam ao construir, pesquisar e mover o Governador
    realmMemo(key, fn) {
      const m = this._realm || (this._realm = {});
      if (!(key in m)) m[key] = fn();
      return m[key];
    },
    realmReset() { this._realm = null; },

    // ------------------------------------------------------------ Capacidade administrativa
    adminCapacity(p) {
      return this.realmMemo('cap' + p.id, () => this.computeCapacity(p));
    },

    computeCapacity(p) {
      const parts = [[PP.t('Base'), PP.REALM.base]];
      for (const id in PP.REALM.techs) if (this.has(p, id)) parts.push([PP.TECH[id].name, PP.REALM.techs[id]]);
      const count = {};
      for (const c of this.citiesOf(p.id)) {
        for (const id in c.buildings) {
          const b = PP.BUILDINGS[id];
          if (b && b.admin) count[id] = (count[id] || 0) + 1;
        }
      }
      for (const id in count) parts.push([count[id] > 1 ? `${PP.BUILDINGS[id].name} ×${count[id]}` : PP.BUILDINGS[id].name, PP.BUILDINGS[id].admin * count[id]]);
      if (this.characterOf(p.id, 'governor')) parts.push([UN.governor.name, 1]);
      let total = 0;
      for (const x of parts) total += x[1];
      const res = { total, parts, cities: this.citiesOf(p.id).length };
      res.excess = Math.max(0, res.cities - total);
      res.rate = this.realmOn() ? Math.min(PP.REALM.disorderMax, PP.REALM.disorderStep * res.excess) : 0;
      return res;
    },

    adminExcess(p) { return this.adminCapacity(p).excess; },

    // ------------------------------------------------------------ Centros administrativos e alcance
    characterOf(pid, type) {
      for (const u of this.units) if (u.owner === pid && u.type === type && !u.dead) return u;
      if (this.cargoUnits) for (const u of this.cargoUnits()) if (u.owner === pid && u.type === type && !u.dead) return u;
      return null;
    },

    // Cidade governada pelo Governador: a cidade onde ele está ou a cidade sua vizinha a ele
    governedCity(pid) {
      const gov = this.characterOf(pid, 'governor');
      if (!gov || !this.tiles[gov.y * this.W + gov.x]) return null;
      let best = null;
      for (const c of this.citiesOf(pid)) {
        const d = cheb(c, gov);
        if (d <= 1 && (!best || d < cheb(best, gov))) best = c;
      }
      return best;
    },

    adminCenters(pid) {
      return this.realmMemo('ctr' + pid, () => this.computeCenters(pid));
    },

    computeCenters(pid) {
      const p = this.players[pid];
      const out = [];
      const cap = p.capital ? this.cityMap[p.capital] : null;
      if (cap && cap.owner === pid) out.push({ city: cap, kind: 'capital', radius: PP.REALM.capitalRadius + (cap.buildings.chancery ? PP.REALM.chanceryRadius : 0) });
      for (const c of this.citiesOf(pid)) {
        if (c.buildings.regional_seat && c !== cap) out.push({ city: c, kind: 'seat', radius: PP.REALM.seatRadius });
      }
      const gc = this.governedCity(pid);
      if (gc && !out.some(o => o.city === gc)) out.push({ city: gc, kind: 'governor', radius: PP.REALM.governorRadius });
      return out;
    },

    // Situação administrativa de uma cidade: centro, província de um Paço Regional ou longe da corte
    adminInfo(c) {
      const centers = this.adminCenters(c.owner);
      const own = centers.find(o => o.city === c);
      if (own) return { center: own.kind, remote: false, province: own.kind === 'seat' ? c : null, by: c };
      const reach = c.connected ? PP.REALM.roadReach : 0;
      let by = null, province = null, bd = 1e9;
      for (const o of centers) {
        const d = cheb(c, o.city) - reach;
        if (d > o.radius) continue;
        if (d < bd) { bd = d; by = o.city; }
        if (o.kind === 'seat' && (!province || d < cheb(c, province))) province = o.city;
      }
      return { center: null, remote: this.realmOn() && !by && centers.length > 0, province, by };
    },

    remoteCut(c) {
      if (!this.realmOn()) return 0;
      if (!this.adminInfo(c).remote) return 0;
      return c.buildings.tribunal ? PP.REALM.remoteCut / 2 : PP.REALM.remoteCut;
    },

    // ------------------------------------------------------------ Personagens
    characterName(pid) {
      const s = PP.TRIBES[this.players[pid].tribe].syl;
      const used = {};
      for (const u of this.units) if (u.name) used[u.name] = 1;
      for (let k = 0; k < 40; k++) {
        let n = this.rng.pick(s[0]) + this.rng.pick(s[1]);
        n = n.charAt(0).toUpperCase() + n.slice(1);
        if (n.length >= 3 && !used[n]) return n;
      }
      return this.rng.pick(s[0]) + this.nextId;
    },

    characterTitle(u) { return u && u.name ? `${UN[u.type].name} ${u.name}` : UN[u.type].name; },

    // General vizinho (do mesmo dono) dá comando às tropas ao redor
    commandedBy(u) {
      if (!u || UN[u.type].character || UN[u.type].spy) return null;
      for (const n of this.neighbors(u)) {
        const o = this.uGrid[n.y * this.W + n.x];
        if (o && o.owner === u.owner && o.type === 'general') return o;
      }
      return null;
    },

    // Tribo cujo território o Embaixador está visitando (em paz ou trégua com o dono)
    envoyHost(u) {
      const t = this.tiles[u.y * this.W + u.x];
      if (!t || t.owner < 0 || t.owner === u.owner) return null;
      const q = this.players[t.owner];
      if (!q || !q.alive || this.atWar(u.owner, q.id)) return null;
      return q;
    },
  };
  Object.assign(PP.Game.prototype, R);

  // ------------------------------------------------------------ Extensões encadeadas das regras existentes
  const proto = PP.Game.prototype;
  const chain = (name, fn) => {
    const prev = proto[name];
    proto[name] = function (...args) { return fn.call(this, prev, ...args); };
  };

  // Qualquer mudança que mexa em cidades, construções, tecnologias ou na posição das unidades limpa o cache
  for (const name of ['invalidate', 'build', 'research', 'moveUnit', 'createUnit', 'killUnit', 'disband', 'convert', 'unload', 'transferCity']) {
    if (typeof proto[name] !== 'function') continue;
    chain(name, function (prev, ...args) { this._realm = null; const r = prev.apply(this, args); this._realm = null; return r; });
  }

  // Personagens: exigências próprias, um de cada por reino, não ocupam a capacidade da cidade
  chain('trainCheck', function (prev, p, c, type) {
    const d = UN[type];
    if (!d || !d.character) return prev.call(this, p, c, type);
    const r = { ok: false, cost: this.unitCostFor(p, c, type), reason: '', character: true };
    if (!c || c.owner !== p.id) { r.reason = PP.t('Cidade inválida'); return r; }
    if (d.tech && !this.has(p, d.tech)) { r.reason = PP.t('Requer {x}', { x: PP.TECH[d.tech].name }); r.locked = true; return r; }
    if (d.building && !c.buildings[d.building]) { r.reason = PP.t('Requer {x}', { x: PP.BUILDINGS[d.building].name }); return r; }
    if (this.characterOf(p.id, type)) { r.reason = PP.t('Seu reino já tem um {u}', { u: d.name }); r.unique = true; return r; }
    if (this.uGrid[c.y * this.W + c.x]) { r.reason = PP.t('Cidade ocupada'); return r; }
    if (p.stars < r.cost) { r.reason = PP.t('Faltam estrelas'); return r; }
    r.ok = true;
    return r;
  });

  // Personagens não podem ser convertidos por missionários
  chain('convertTargets', function (prev, u) { return prev.call(this, u).filter(d => !UN[d.type].character); });

  chain('capacityBonus', function (prev, c) { return (prev ? prev.call(this, c) : 0) + (c.buildings.war_academy ? 1 : 0); });

  chain('unitCost', function (prev, p, c, type) {
    if (UN[type].character) return UN[type].cost; // personagens têm preço fixo
    let cost = prev ? prev.call(this, p, c, type) : UN[type].cost;
    if (c && c.buildings.foundry && UN[type].needs === 'iron') cost -= 1;
    return Math.max(1, cost);
  });

  chain('recruitXp', function (prev, c, type) {
    let xp = prev ? prev.call(this, c, type) : 0;
    const d = UN[type];
    if (c.buildings.war_academy && !d.naval && !d.spy && !d.character) xp++;
    return xp;
  });

  chain('buildingCost', function (prev, p, id, c) {
    let cost = prev.call(this, p, id, c);
    if (id === 'regional_seat') cost += PP.REALM.seatExtraCost * this.citiesOf(p.id).filter(o => o.buildings.regional_seat).length;
    return cost;
  });

  chain('buildingCheck', function (prev, p, c, id) {
    const r = prev.call(this, p, c, id);
    if (r.done || r.locked || !c || c.owner !== p.id) return r;
    const b = PP.BUILDINGS[id];
    const fail = reason => { r.ok = false; r.reason = reason; return r; };
    if (b.capitalOnly && !c.capital) { r.locked = true; return fail(PP.t('Só na capital')); }
    if (b.unique && this.citiesOf(p.id).some(o => o.buildings[id])) { r.locked = true; return fail(PP.t('Seu reino já tem: {x}', { x: b.name })); }
    if (id === 'regional_seat') {
      if (c.capital) { r.locked = true; return fail(PP.t('A capital já é o centro do reino')); }
      if (c.level < PP.REALM.seatMinLevel) return fail(PP.t('Requer nível {n}', { n: PP.REALM.seatMinLevel }));
      const cap = p.capital ? this.cityMap[p.capital] : null;
      const near = this.citiesOf(p.id).some(o => o !== c && (o === cap || o.buildings.regional_seat) && cheb(o, c) < PP.REALM.seatMinDist);
      if (near) return fail(PP.t('Muito perto de outro centro administrativo'));
    }
    return r;
  });

  // Lealdade: tribunais, imprensa, governo, província e distância da corte
  chain('loyaltyFactors', function (prev, c) {
    const f = prev.call(this, c);
    if (c.buildings.tribunal) f.push([PP.BUILDINGS.tribunal.name, 10]);
    if (c.buildings.press) f.push([PP.BUILDINGS.press.name, 5]);
    if (this.governedCity(c.owner) === c) f.push([UN.governor.name, 10]);
    if (this.realmOn()) {
      const info = this.adminInfo(c);
      if (info.province && info.province !== c) f.push([PP.BUILDINGS.regional_seat.name, 5]);
      if (info.remote) f.push([PP.t('Longe da corte'), -10]);
    }
    return f;
  });

  // Renda da cidade: construções novas, Governador e distância da corte
  chain('eventCityIncome', function (prev, c, res) {
    if (prev) prev.call(this, c, res);
    const p = this.players[c.owner];
    if (c.buildings.foundry) { res.stars += PP.REALM.foundryStars; res.notes.push(PP.t('{b} +{n}★', { b: PP.BUILDINGS.foundry.name, n: PP.REALM.foundryStars })); }
    if (c.buildings.press) { res.sci += PP.REALM.pressSci; res.notes.push(PP.t('{b} +{n}⚗', { b: PP.BUILDINGS.press.name, n: PP.REALM.pressSci })); }
    if (c.buildings.library && this.has(p, 'imprensa')) { res.sci += 1; res.notes.push(PP.t('{b} +{n}⚗', { b: PP.TECH.imprensa.name, n: 1 })); }
    if (this.governedCity(c.owner) === c) { res.stars += PP.REALM.governorStars; res.notes.push(PP.t('{b} +{n}★', { b: UN.governor.name, n: PP.REALM.governorStars })); }
    const cut = this.remoteCut(c);
    if (cut > 0) {
      const s = Math.round(res.stars * cut), k = Math.round(res.sci * cut);
      res.stars -= s; res.sci -= k;
      res.notes.push(PP.t('Longe da corte −{n}%', { n: Math.round(cut * 100) }));
    }
  });

  // Renda do reino: desordem administrativa sobre a produção das cidades
  chain('eventIncome', function (prev, p, res) {
    if (prev) prev.call(this, p, res);
    const cap = this.adminCapacity(p);
    if (cap.rate <= 0) return;
    const cities = res.lines[0] || { stars: 0, sci: 0 };
    const s = Math.round(cities.stars * cap.rate), k = Math.round(cities.sci * cap.rate);
    if (!s && !k) return;
    res.stars -= s; res.sci -= k;
    res.lines.push({ label: PP.t('Desordem administrativa'), stars: -s, sci: -k });
  });

  // Comando do General: ataque +20% e defesa +10% para as tropas vizinhas
  chain('combatMods', function (prev, a, d, sa, sd) {
    const r = prev.call(this, a, d, sa, sd);
    if (!sa.naval && this.commandedBy(a)) {
      r.atk *= 1 + PP.REALM.generalAtk;
      r.notes.push(PP.t('Comando do General') + ' +' + Math.round(PP.REALM.generalAtk * 100) + '%');
    }
    return r;
  });
  chain('defenseMods', function (prev, d, attacker, b, t, st) {
    b = prev.call(this, d, attacker, b, t, st);
    if (!st.naval && this.commandedBy(d)) b *= 1 + PP.REALM.generalDef;
    return b;
  });
  chain('defenseNotes', function (prev, d) {
    const out = prev.call(this, d);
    if (!this.stat(d).naval && this.commandedBy(d)) out.push(PP.t('Comando do General'));
    return out;
  });

  // ------------------------------------------------------------ Conquistas da expansão
  const realmAch = [
    { id: 'corte', name: 'Corte Real', desc: 'Tenha General, Governador e Embaixador ao mesmo tempo.', max: PP.CHARACTERS.length,
      v: (g, p) => PP.CHARACTERS.filter(t => g.characterOf(p.id, t)).length },
    { id: 'organizado', name: 'Reino Organizado', desc: 'Tenha 10 cidades sem desordem administrativa.', max: 10,
      v: (g, p) => (g.realmOn() && g.adminExcess(p) === 0 ? g.citiesOf(p.id).length : 0) },
  ];
  for (const a of realmAch) if (!PP.ACHIEVEMENT[a.id]) { PP.ACHIEVEMENTS.push(a); PP.ACHIEVEMENT[a.id] = a; }

  // ------------------------------------------------------------ Ganchos de turno
  PP.registerSystem('realm', {
    configure(g) { if (g.opts.realm == null) g.opts.realm = true; },
    init(g) { g.players.forEach(p => { p.realmExcess = 0; }); },
    load(g) { g.players.forEach(p => { if (p.realmExcess == null) p.realmExcess = 0; }); },
    beforeTurn(g, p) {
      // Embaixada: as tribos em paz com você lembram dela; Embaixador: missão no território de outra tribo
      const embassy = g.citiesOf(p.id).some(c => c.buildings.embassy);
      if (g.remember) {
        if (embassy) {
          for (const q of g.players) {
            if (q.id === p.id || !q.alive || !p.met[q.id] || g.atWar(p.id, q.id)) continue;
            g.remember(q.id, p.id, 'embassy');
          }
        }
        const env = g.characterOf(p.id, 'envoy');
        const host = env ? g.envoyHost(env) : null;
        if (host) {
          g.remember(host.id, p.id, 'envoy');
          if (g.intelReport) { p.intel = p.intel || {}; p.intel[host.id] = g.intelReport(p.id, host.id); }
        }
      }
      // Avisa quando a desordem administrativa muda
      if (g.realmOn()) {
        const ex = g.adminExcess(p);
        if (ex !== (p.realmExcess || 0)) {
          g.emit('realm', { type: 'disorder', player: p.id, excess: ex, before: p.realmExcess || 0 });
          p.realmExcess = ex;
        }
      }
    },
    trained(g, u) {
      if (!UN[u.type].character) return;
      u.home = null;
      u.name = g.characterName(u.owner);
      const p = g.players[u.owner];
      g.log(PP.t('{p} nomeou {u}.', { p: p.name, u: g.characterTitle(u) }), u.owner);
      g.emit('character', { type: 'new', unit: u, player: u.owner });
    },
    unitKilled(g, u) {
      if (!UN[u.type].character) return;
      g.log(PP.t('{u} de {p} caiu.', { u: g.characterTitle(u), p: g.players[u.owner].name }), null);
      g.emit('character', { type: 'lost', unit: u, player: u.owner });
    },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
