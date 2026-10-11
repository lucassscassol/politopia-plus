/* Chamas de Vardren — guerra e ordem (2.4): cerco, rebeldes, coalizão contra o líder e a pregação dos Missionários.
   - Cerco: uma cidade com 2 ou mais tropas inimigas ao lado, e mais inimigos do que defensores em volta, fica sitiada.
     Enquanto durar, produz metade, não recebe investimento nem projetos novos e a defesa cai 10% por turno de cerco
     (até −40%); a partir do 2º turno a guarnição perde 2 de vida por turno (nunca abaixo de 1) e, a partir do 3º, a
     cidade perde população.
   - Rebeldes: cidades conquistadas em resistência fazem surgir guerrilheiros da tribo fundadora quando ela está viva e
     em guerra com o dono; sem fundador para lutar, os rebeldes fogem para o campo e erguem um acampamento.
     Acampamentos também surgem em terras sem dono com o tempo. Cada um saqueia uma melhoria ou fere uma tropa vizinha a
     cada 3 turnos, cresce até a força 3 e tira lealdade e estrelas das cidades a até 2 casas. Uma tropa que entra no
     acampamento o destrói: sofre dano conforme a força (nunca morre por isso) e recolhe o saque.
   - Coalizão: quando uma tribo passa a ter 60% mais pontos que a segunda (do turno 30 em diante, com 3 tribos ou
     mais), as outras passam a desconfiar dela e a IA se une contra ela, até a vantagem cair abaixo de 30%.
   - Pregar (Missionário): +20 de lealdade numa cidade sua; −15 numa cidade inimiga vizinha; melhora a opinião de
     quem está em paz com você.
   O cerco e os rebeldes só valem nas partidas criadas a partir desta versão (os rebeldes podem ser desligados). */
(function (PP) {
  'use strict';
  const UN = PP.UNITS;
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  PP.SIEGE = { min: 2, defCut: 0.1, defCutMax: 0.4, starve: 2, starveFrom: 2, popFrom: 3, yield: 0.5 };
  PP.REBELS = { start: 12, every: 6, raidEvery: 3, growEvery: 6, maxStr: 3, near: 2, loyalty: -10, stars: 1, starsMax: 2,
    partisan: 0.3, partisanWait: 4, flee: 0.2 };
  PP.COALITION = { turn: 30, ratio: 1.6, keep: 1.3, minPlayers: 3 };

  PP.MEMORY_KINDS.coalition = { label: 'Ameaça o equilíbrio entre as tribos', v: -6, decay: 10, cap: -24 };
  PP.MEMORY_KINDS.preached = { label: 'Missionários pregaram entre nós', v: 6, decay: 30, cap: 18 };

  PP.ABILITIES.preach = { name: 'Pregar', icon: 'ab_preach', units: ['missionary'], cd: 3,
    desc: 'Numa cidade sua (ou ao lado dela): +20 de lealdade. Ao lado de uma cidade inimiga: −15 de lealdade. Ao lado de quem está em paz com você: melhora a opinião deles. Encerra o turno.' };

  const W = {
    siegeOn() { return !!(this.opts && this.opts.siege); },
    rebelsOn() { return !!(this.opts && this.opts.rebels); },

    ensureWar(c) {
      if (c.siege == null) c.siege = 0;
      if (c.partisan == null) c.partisan = 0;
    },

    // ------------------------------------------------------------ Cerco
    siegeForces(c) {
      let enemies = 0, friends = 0;
      for (const n of this.neighbors(c)) {
        const u = this.uGrid[n.y * this.W + n.x];
        if (!u || UN[u.type].spy) continue;
        const st = this.stat(u);
        if (u.owner === c.owner || (this.allied && this.allied(u.owner, c.owner))) { if (st.atk > 0 || st.def > 1) friends++; }
        else if (this.atWar(c.owner, u.owner) && st.atk > 0) enemies++;
      }
      return { enemies, friends };
    },

    isBesieged(c) {
      if (!c || !this.siegeOn()) return false;
      const f = this.siegeForces(c);
      return f.enemies >= PP.SIEGE.min && f.enemies > f.friends;
    },

    siegeCut(c) {
      if (!c || !(c.siege > 0) || !this.isBesieged(c)) return 0;
      return Math.min(PP.SIEGE.defCutMax, PP.SIEGE.defCut * c.siege);
    },

    besiegers(c) {
      const out = [];
      for (const n of this.neighbors(c)) {
        const u = this.uGrid[n.y * this.W + n.x];
        if (u && u.owner !== c.owner && this.atWar(c.owner, u.owner) && out.indexOf(u.owner) < 0) out.push(u.owner);
      }
      return out;
    },

    // No começo do turno do dono: conta os turnos de cerco e aplica a fome
    updateSieges(p) {
      if (!this.siegeOn()) return;
      for (const c of this.citiesOf(p.id)) {
        if (this.isBesieged(c)) {
          c.siege = (c.siege || 0) + 1;
          const by = this.besiegers(c);
          if (c.siege === 1) {
            this.log(PP.t('{c} está sitiada!', { c: c.name }), [p.id].concat(by));
            this.emit('siege', { type: 'start', city: c, player: p.id, by });
          }
          if (c.siege >= PP.SIEGE.starveFrom) {
            const g = this.uGrid[c.y * this.W + c.x];
            if (g && g.owner === p.id && g.hp > 1) g.hp = Math.max(1, g.hp - PP.SIEGE.starve);
          }
          if (c.siege >= PP.SIEGE.popFrom && c.pop > 0) c.pop--;
          for (const q of by) { const s = this.players[q].stats; s.sieges = Math.max(s.sieges || 0, c.siege); }
        } else if (c.siege) {
          c.siege = 0;
          this.log(PP.t('O cerco de {c} acabou.', { c: c.name }), p.id);
          this.emit('siege', { type: 'lifted', city: c, player: p.id });
        }
      }
    },

    // ------------------------------------------------------------ Rebeldes
    ensureCamps() { if (!this.camps) this.camps = []; },

    campAt(x, y) {
      this.ensureCamps();
      for (const k of this.camps) if (k.x === x && k.y === y) return k;
      return null;
    },

    campsNear(c, r) {
      this.ensureCamps();
      let n = 0;
      for (const k of this.camps) if (cheb(k, c) <= r) n++;
      return n;
    },

    campSpotOk(t) {
      if (!t || this.isWater(t) || t.terrain === 'mountain' || t.city || t.village || t.ruin || t.wonder || t.fort || t.imp || t.res || t.landmark) return false;
      if (this.uGrid[t.y * this.W + t.x] || this.campAt(t.x, t.y)) return false;
      return true;
    },

    spawnCamp(t, str, why) {
      this.ensureCamps();
      const k = { id: this.nextId++, x: t.x, y: t.y, str: str || 1, since: this.turn, last: this.turn };
      this.camps.push(k);
      const near = [];
      for (const c of this.cities) if (cheb(c, k) <= 3 && near.indexOf(c.owner) < 0) near.push(c.owner);
      if (near.length) this.log(why === 'flee' ? PP.t('Rebeldes fugiram para o campo e ergueram um acampamento.') : PP.t('Um acampamento rebelde surgiu nas terras vizinhas.'), near);
      this.emit('camp', { type: 'spawn', camp: k, why });
      return k;
    },

    removeCamp(k) {
      const i = this.camps.indexOf(k);
      if (i >= 0) this.camps.splice(i, 1);
    },

    campDamage(k) { return 2 + 2 * k.str; },
    campLoot(k) { return 4 + 3 * k.str; },

    // Uma tropa terrestre que entra no acampamento o destrói
    clearCamp(u, k) {
      const p = this.players[u.owner];
      const dmg = this.campDamage(k), loot = this.campLoot(k);
      u.hp = Math.max(1, u.hp - dmg);
      p.stars += loot;
      p.stats.campsCleared = (p.stats.campsCleared || 0) + 1;
      this.removeCamp(k);
      this.gainXp(u, 1);
      this.log(PP.t('{p} destruiu um acampamento rebelde (+{n}★).', { p: p.name, n: loot }), p.id);
      this.emit('camp', { type: 'cleared', camp: k, unit: u, player: p.id, loot, dmg });
    },

    // Cresce e ataca a cada poucos turnos (uma vez por rodada)
    campsAct() {
      this.ensureCamps();
      const R = PP.REBELS;
      // um acampamento some se a casa virar cidade, aldeia ou água
      for (const k of this.camps.slice()) {
        const t = this.tile(k.x, k.y);
        if (!t || this.isWater(t) || t.city || t.village) this.removeCamp(k);
      }
      for (const k of this.camps.slice()) {
        const age = this.turn - k.since;
        if (age > 0 && age % R.growEvery === 0 && k.str < R.maxStr) k.str++;
        if (this.turn - k.last < R.raidEvery) continue;
        k.last = this.turn;
        const nb = this.rng.shuffle(this.neighbors(k).slice());
        const imp = nb.find(t => t.imp && !t.pillaged && t.owner >= 0 && !t.city);
        if (imp) {
          imp.pillaged = true;
          this.invalidate();
          this.log(PP.t('Rebeldes saquearam {x} de {p}.', { x: PP.IMPROVEMENTS[imp.imp] ? PP.IMPROVEMENTS[imp.imp].name : PP.t('melhoria'), p: this.players[imp.owner].name }), imp.owner);
          this.emit('camp', { type: 'raid', camp: k, tile: imp, victim: imp.owner });
          continue;
        }
        const t = nb.find(o => { const u = this.uGrid[o.y * this.W + o.x]; return u && !UN[u.type].spy && u.hp > 1; });
        if (t) {
          const u = this.uGrid[t.y * this.W + t.x];
          const dmg = 2 * k.str;
          u.hp = Math.max(1, u.hp - dmg);
          this.log(PP.t('Rebeldes atacaram {u} de {p} (−{n} de vida).', { u: UN[u.type].name, p: this.players[u.owner].name, n: dmg }), u.owner);
          this.emit('camp', { type: 'hit', camp: k, unit: u, dmg });
        }
      }
    },

    // Acampamentos novos em terras sem dono, longe das cidades
    campsSpawn() {
      const R = PP.REBELS;
      if (this.turn < R.start || (this.turn - R.start) % R.every !== 0) return;
      this.ensureCamps();
      const alive = this.players.filter(p => p.alive).length;
      if (this.camps.length >= alive + 1) return;
      const cands = this.rng.shuffle(this.tiles.filter(t => t.owner === -1 && this.campSpotOk(t)));
      for (const t of cands) {
        if (this.cities.some(c => cheb(c, t) < 3) || this.camps.some(k => cheb(k, t) < 4)) continue;
        if (this.tiles.some(o => o.village && cheb(o, t) < 2)) continue;
        this.spawnCamp(t, 1, 'wild');
        return;
      }
    },

    // Guerrilheiros: tropas da tribo fundadora surgem ao lado da cidade em resistência
    partisanType(f) {
      if (this.has(f, 'forja')) return 'swordsman';
      if (this.has(f, 'arco')) return 'archer';
      return 'warrior';
    },

    unrestRebels(p) {
      const R = PP.REBELS;
      for (const c of this.citiesOf(p.id)) {
        if (!c.unrest || c.occupied > 0) continue;
        if (this.turn - (c.partisan || 0) < R.partisanWait) continue;
        const f = this.players[c.founder];
        if (f && f.alive && f.id !== p.id && this.atWar(p.id, f.id)) {
          if (!this.rng.chance(R.partisan)) continue;
          const spot = this.neighbors(c).find(t => !this.isWater(t) && t.terrain !== 'mountain' && !t.city && !t.village && !this.uGrid[t.y * this.W + t.x] && !this.campAt(t.x, t.y));
          if (!spot) continue;
          const type = this.partisanType(f);
          const u = this.createUnit(type, f.id, spot.x, spot.y, null);
          c.partisan = this.turn;
          f.stats.partisans = (f.stats.partisans || 0) + 1;
          this.log(PP.t('Guerrilheiros de {f} pegaram em armas perto de {c}!', { f: f.name, c: c.name }), [p.id, f.id]);
          this.emit('rebels', { type: 'partisans', city: c, unit: u, player: p.id, founder: f.id });
          this.refreshVision(f.id);
        } else {
          if (this.campsNear(c, R.near) || !this.rng.chance(R.flee)) continue;
          const spots = this.tiles.filter(t => cheb(t, c) === 2 && this.campSpotOk(t));
          if (!spots.length) continue;
          c.partisan = this.turn;
          this.spawnCamp(this.rng.pick(spots), 1, 'flee');
        }
      }
    },

    // ------------------------------------------------------------ Coalizão contra o líder
    updateCoalition() {
      const C = PP.COALITION;
      const alive = this.players.filter(p => p.alive);
      const dissolve = why => {
        const t = this.players[this.coalition];
        this.coalition = null;
        if (t) this.log(PP.t('A coalizão contra {x} se desfez.', { x: t.name }), null);
        this.emit('coalition', { type: 'dissolved', target: t ? t.id : null, why });
      };
      if (alive.length < C.minPlayers || this.turn < C.turn) { if (this.coalition != null) dissolve('few'); return; }
      const ranked = alive.map(p => [p, this.score(p)]).sort((a, b) => b[1] - a[1]);
      if (this.coalition != null) {
        const T = this.players[this.coalition];
        const others = ranked.filter(r => r[0].id !== this.coalition);
        if (!T.alive || !others.length || this.score(T) < others[0][1] * C.keep) dissolve('balance');
      } else if (ranked[0][1] >= ranked[1][1] * C.ratio) {
        this.coalition = ranked[0][0].id;
        this.log(PP.t('{x} ficou forte demais: as outras tribos se unem contra ela.', { x: ranked[0][0].name }), null);
        this.emit('coalition', { type: 'formed', target: this.coalition });
      }
      if (this.coalition == null) return;
      for (const q of alive) {
        if (!this.inCoalition(q.id)) continue;
        this.remember(q.id, this.coalition, 'coalition');
      }
    },

    // Faz parte da coalizão: quem conhece o líder e não é aliado nem vassalo dele
    inCoalition(pid) {
      const t = this.coalition;
      if (t == null || pid === t) return false;
      const q = this.players[pid];
      if (!q || !q.alive || !q.met[t]) return false;
      if (this.allied && this.allied(pid, t)) return false;
      if (this.overlordOf && (this.overlordOf(pid) === t || this.overlordOf(t) === pid)) return false;
      return true;
    },

    // ------------------------------------------------------------ Pregar
    // Prefere uma cidade sua que precise de lealdade; depois a de outra tribo; por fim qualquer cidade sua
    preachTarget(u) {
      let need = null, own = null, other = null;
      for (const c of this.cities) {
        if (cheb(c, u) > 1) continue;
        if (c.owner === u.owner) {
          if (c.founder !== c.owner || c.unrest || c.occupied > 0 || c.loyalty < 100) { if (!need || c.loyalty < need.loyalty) need = c; }
          else own = c;
        } else if (!other) other = c;
      }
      return need || other || own;
    },
  };
  Object.assign(PP.Game.prototype, W);

  // ------------------------------------------------------------ Extensões encadeadas
  const proto = PP.Game.prototype;
  const chain = (name, fn) => {
    const prev = proto[name];
    proto[name] = function (...args) { return fn.call(this, prev, ...args); };
  };

  chain('ensureCity', function (prev, c, founder) {
    prev.call(this, c, founder);
    this.ensureWar(c);
  });

  chain('cityYieldMult', function (prev, c) {
    let m = prev.call(this, c);
    if (c.siege > 0 && this.isBesieged(c)) m *= PP.SIEGE.yield;
    return m;
  });

  chain('defenseMods', function (prev, d, attacker, b, t, st) {
    b = prev.call(this, d, attacker, b, t, st);
    if (t.city) {
      const c = this.cityMap[t.city];
      if (c && c.owner === d.owner) { const cut = this.siegeCut(c); if (cut) b *= 1 - cut; }
    }
    return b;
  });

  chain('defenseNotes', function (prev, d) {
    const out = prev.call(this, d);
    const t = this.tiles[d.y * this.W + d.x];
    if (t.city) {
      const c = this.cityMap[t.city];
      const cut = c && c.owner === d.owner ? this.siegeCut(c) : 0;
      if (cut) out.push(PP.t('Cerco −{n}%', { n: Math.round(cut * 100) }));
    }
    return out;
  });

  // Acampamentos: −lealdade e −estrelas nas cidades a até 2 casas
  chain('loyaltyFactors', function (prev, c) {
    const f = prev.call(this, c);
    if (this.camps && this.camps.length && this.campsNear(c, PP.REBELS.near)) f.push([PP.t('Rebeldes na região'), PP.REBELS.loyalty]);
    return f;
  });

  chain('eventCityIncome', function (prev, c, res) {
    if (prev) prev.call(this, c, res);
    if (!this.camps || !this.camps.length) return;
    const n = Math.min(PP.REBELS.starsMax, this.campsNear(c, PP.REBELS.near) * PP.REBELS.stars);
    if (n) { res.stars -= n; res.notes.push(PP.t('Rebeldes na região −{n}★', { n })); }
  });

  // Pregar: verificação e efeito próprios; as outras habilidades seguem como antes
  chain('abilityCheck', function (prev, u, id) {
    const r = prev.call(this, u, id);
    if (id !== 'preach' || !r.ok) return r;
    const fail = reason => { r.ok = false; r.reason = reason; return r; };
    if (!u.canAttack || u.attacked) return fail(PP.t('Já agiu'));
    const c = this.preachTarget(u);
    if (!c) return fail(PP.t('Nenhuma cidade ao lado'));
    if (c.owner === u.owner && c.founder === c.owner && !c.unrest && !(c.occupied > 0) && c.loyalty >= 100) return fail(PP.t('A cidade já é leal'));
    if (c.owner !== u.owner && !this.players[u.owner].met[c.owner]) return fail(PP.t('Ainda não se conhecem'));
    r.target = c;
    return r;
  });

  chain('useAbility', function (prev, u, id) {
    if (id !== 'preach') return prev.call(this, u, id);
    const chk = this.abilityCheck(u, id);
    if (!chk.ok) return false;
    const c = chk.target;
    const p = this.players[u.owner];
    u.cd = u.cd || {};
    u.cd[id] = this.turn + PP.ABILITIES.preach.cd;
    let effect;
    if (c.owner === u.owner) {
      c.loyalty = Math.min(100, c.loyalty + 20);
      effect = 'loyalty';
    } else if (this.atWar(u.owner, c.owner)) {
      c.loyalty = Math.max(0, c.loyalty - 15);
      effect = 'dissent';
    } else {
      this.remember(c.owner, u.owner, 'preached');
      effect = 'opinion';
    }
    u.canAttack = false; u.attacked = true; u.mp = 0; u.moved = true;
    p.stats.abilities = (p.stats.abilities || 0) + 1;
    p.stats.preached = (p.stats.preached || 0) + 1;
    this.log(PP.t('{p}: um Missionário pregou em {c}.', { p: p.name, c: c.name }), c.owner === u.owner ? u.owner : [u.owner, c.owner]);
    this.emit('ability', { unit: u, ability: id, healed: [], hits: [], city: c, effect });
    return true;
  });

  // ------------------------------------------------------------ Conquistas
  const warAch = [
    { id: 'sitiador', name: 'Sitiador', desc: 'Mantenha uma cidade inimiga sitiada por 3 turnos.', max: 3, v: (g, p) => p.stats.sieges || 0 },
    { id: 'cacador', name: 'Caçador de Rebeldes', desc: 'Destrua 3 acampamentos rebeldes.', max: 3, v: (g, p) => p.stats.campsCleared || 0 },
  ];
  for (const a of warAch) if (!PP.ACHIEVEMENT[a.id]) { PP.ACHIEVEMENTS.push(a); PP.ACHIEVEMENT[a.id] = a; }

  // ------------------------------------------------------------ Ganchos
  PP.registerSystem('warfare', {
    configure(g) {
      if (g.opts.siege == null) g.opts.siege = true;
      if (g.opts.rebels == null) g.opts.rebels = true;
    },
    init(g) { g.cities.forEach(c => g.ensureWar(c)); g.camps = []; g.coalition = null; },
    load(g, sys) {
      g.cities.forEach(c => g.ensureWar(c));
      g.camps = (sys.camps || []).map(k => Object.assign({}, k));
      g.coalition = sys.coalition != null ? sys.coalition : null;
    },
    save(g, sys) {
      if (g.camps && g.camps.length) sys.camps = g.camps;
      if (g.coalition != null) sys.coalition = g.coalition;
    },
    beforeTurn(g, p) {
      if (g.turn <= 1) return;
      g.updateSieges(p);
      if (g.rebelsOn()) g.unrestRebels(p);
    },
    newRound(g) {
      if (g.rebelsOn()) { g.campsAct(); g.campsSpawn(); }
      g.updateCoalition();
    },
    // Tropa terrestre que termina o movimento num acampamento o destrói
    moved(g, u) {
      if (!g.camps || !g.camps.length || u.dead) return;
      const k = g.campAt(u.x, u.y);
      if (!k) return;
      const st = g.stat(u);
      if (st.naval || UN[u.type].spy || st.atk <= 0) return;
      g.clearCamp(u, k);
    },
    capture(g, c) { c.siege = 0; },
    eliminated(g, p) { if (g.coalition === p.id) { g.coalition = null; g.emit('coalition', { type: 'dissolved', target: p.id, why: 'eliminated' }); } },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
