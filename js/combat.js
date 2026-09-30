/* Politopia+ — combate tático: flanqueamento, ataque pelas costas, formação, terreno elevado,
   emboscada, linha de visão, ataques de oportunidade, fortificações, abastecimento e habilidades ativas.
   A fórmula de dano original (estilo Polytopia) continua a mesma; aqui só entram multiplicadores. */
(function (PP) {
  'use strict';
  const UN = PP.UNITS;
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const pct = v => (v >= 0 ? '+' : '−') + Math.round(Math.abs(v) * 100) + '%';

  const K = {
    // ------------------------------------------------------------ Atributos
    statMods(u, s, t, p) {
      const base = UN[u.type];
      const b = u.buff;
      if (b) {
        if (b.aim || b.bombard) s.range += 1;
        if (b.recon) s.vision += 3;
      }
      if (!s.naval && t.terrain === 'mountain' && p.tribe === 'aymara') s.vision += 1;
      if (base.naval && u.home) {
        const c = this.cityMap[u.home];
        if (c && c.owner === u.owner && c.spec === 'porto') s.move += 1;
      }
      if (s.naval && this.cities.some(c => c.owner === u.owner && c.milestones && c.milestones.m_admiralty)) s.def += 1;
    },

    allyOf(a, b) { return a === b || (this.allied && this.allied(a, b)); },

    // Unidades amigas (do dono ou aliados) vizinhas a uma casa, sem contar as excluídas
    friendsAround(x, y, owner, exclude) {
      let n = 0;
      for (const nb of this.neighbors({ x, y })) {
        const o = this.uGrid[nb.y * this.W + nb.x];
        if (!o || o === exclude || UN[o.type].spy || !this.allyOf(owner, o.owner)) continue;
        if (this.stat(o).atk <= 0 && UN[o.type].def <= 1) continue;
        n++;
      }
      return n;
    },

    // ------------------------------------------------------------ Modificadores do atacante
    combatMods(a, d, sa, sd) {
      const r = { atk: 1, def: 1, dmg: 1, noRet: false, notes: [] };
      const add = (v, label) => { r.atk *= 1 + v; r.notes.push(label + ' ' + pct(v)); };
      const ta = this.tiles[a.y * this.W + a.x], td = this.tiles[d.y * this.W + d.x];
      const dist = cheb(a, d);
      const pa = this.players[a.owner];
      if (dist === 1 && !sa.naval) {
        // flanqueamento: aliados colados no defensor
        const n = this.friendsAround(d.x, d.y, a.owner, a);
        if (n > 0) add(Math.min(0.2, 0.1 * n), 'Flanco');
        // pelas costas: há um aliado exatamente do lado oposto do defensor
        const ox = d.x + (d.x - a.x), oy = d.y + (d.y - a.y);
        const o = this.unitAt(ox, oy);
        if (o && o !== a && !UN[o.type].spy && this.allyOf(a.owner, o.owner)) add(0.2, 'Pelas costas');
      }
      if (dist > 1 && !sa.naval) {
        const high = t => t.terrain === 'hills' || t.terrain === 'mountain';
        if (high(ta) && !high(td)) add(0.25, 'Terreno elevado');
      }
      if (!sa.naval && ta.terrain === 'forest' && !a.moved && td.terrain !== 'forest') add(pa.tribe === 'tupina' ? 0.4 : 0.2, 'Emboscada');
      if (!sa.naval && ta.terrain === 'swamp') add(-0.2, 'Atolado no pântano');
      if (sa.skills.antinaval && sd.naval) add(0.5, 'Caça-navios');
      const b = a.buff || {};
      if (b.charge) add(0.4, 'Carga');
      if (b.bless) add(0.2, 'Bênção');
      if (b.amphib) add(-0.25, 'Desembarque');
      if (b.aim) { r.dmg *= 1.5; r.notes.push('Tiro preciso +50% dano'); }
      if (pa.tribe === 'zambe') {
        const vet = this.neighbors(a).some(nb => {
          const o = this.uGrid[nb.y * this.W + nb.x];
          return o && o !== a && o.owner === a.owner && this.rank(o) >= 1;
        });
        if (vet) add(0.1, 'Inspiração');
      }
      if (this.supplyMult) {
        const m = this.supplyMult(a);
        if (m < 1) add(m - 1, 'Sem suprimentos');
      }
      if (this.eventCombatMods) this.eventCombatMods(a, d, r, add);
      return r;
    },

    // ------------------------------------------------------------ Modificadores do defensor
    defenseMods(d, attacker, b, t, st) {
      if (t.fort && !st.naval && this.allyOf(d.owner, t.fort.owner)) {
        const fb = PP.FORTS[t.fort.type].def * (d.fortified ? 1.25 : 1);
        if (fb > b) b = fb;
      }
      if (!st.naval && t.landmark === 'passo') b *= 1.5;
      if (st.naval && t.landmark === 'estreito') b *= 1.25;
      if (!t.city) {
        const n = this.friendsAround(d.x, d.y, d.owner, d);
        if (n > 0) b *= 1 + Math.min(0.2, 0.1 * n);
      }
      const bf = d.buff || {};
      if (bf.taunt) b *= 1.25;
      if (bf.bless) b *= 1.2;
      const phal = this.neighbors(d).some(nb => {
        const o = this.uGrid[nb.y * this.W + nb.x];
        return o && o !== d && o.owner === d.owner && o.buff && o.buff.phalanx;
      });
      if (phal) b *= 1.2;
      if (this.supplyMult) b *= this.supplyMult(d);
      return b;
    },

    // Lista legível dos bônus de defesa (para a interface)
    defenseNotes(d) {
      const t = this.tiles[d.y * this.W + d.x], st = this.stat(d), out = [];
      if (t.fort && !st.naval && this.allyOf(d.owner, t.fort.owner)) out.push(PP.FORTS[t.fort.type].name);
      if (!st.naval && t.landmark === 'passo') out.push('Passo de montanha');
      if (!t.city && this.friendsAround(d.x, d.y, d.owner, d) > 0) out.push('Formação');
      if (d.buff && d.buff.taunt) out.push('Provocação');
      if (d.buff && d.buff.bless) out.push('Bênção');
      if (this.supplyLevel && this.supplyLevel(d) > 0) out.push('Sem suprimentos');
      return out;
    },

    // ------------------------------------------------------------ Linha de visão
    // Montanhas bloqueiam tiros (a não ser de quem está numa montanha); florestas bloqueiam tiros de quem
    // não está em terreno alto. Catapultas e canhões atiram por cima (fogo indireto).
    hasLOS(a, d) {
      const dx = d.x - a.x, dy = d.y - a.y, n = Math.max(Math.abs(dx), Math.abs(dy));
      if (n <= 1) return true;
      const at = this.tiles[a.y * this.W + a.x];
      const high = at.terrain === 'mountain' ? 2 : at.terrain === 'hills' ? 1 : 0;
      const blocks = t => (t.terrain === 'mountain' && high < 2) || (t.terrain === 'forest' && high < 1);
      for (let k = 1; k < n; k++) {
        const fx = a.x + dx * k / n, fy = a.y + dy * k / n;
        const xs = fx === Math.floor(fx) ? [fx] : [Math.floor(fx), Math.ceil(fx)];
        const ys = fy === Math.floor(fy) ? [fy] : [Math.floor(fy), Math.ceil(fy)];
        let clear = false;
        for (const x of xs) for (const y of ys) { const t = this.tile(x, y); if (t && !blocks(t)) clear = true; }
        if (!clear) return false;
      }
      return true;
    },

    attackAllowed(a, d, st) {
      const dist = cheb(a, d);
      if (dist > 1 && UN[a.type].range < 3 && !st.naval && !this.hasLOS(a, d)) return false;
      // Provocação: quem está colado num provocador só pode atacá-lo
      if (dist === 1 || st.range >= 1) {
        for (const nb of this.neighbors(a)) {
          const o = this.uGrid[nb.y * this.W + nb.x];
          if (o && o !== d && o.buff && o.buff.taunt && this.atWar(a.owner, o.owner)) return false;
        }
      }
      return true;
    },

    // ------------------------------------------------------------ Ataques de oportunidade
    // Sair do lado de um inimigo corpo a corpo expõe a unidade a um golpe de 35% (uma vez por turno por inimigo).
    opportunityThreats(u) {
      const st = this.stat(u);
      if (st.skills.escape || st.skills.creep || UN[u.type].spy) return [];
      const out = [];
      for (const nb of this.neighbors(u)) {
        const e = this.uGrid[nb.y * this.W + nb.x];
        if (!e || !this.atWar(u.owner, e.owner) || UN[e.type].spy) continue;
        const se = this.stat(e);
        if (se.range !== 1 || se.atk <= 0 || se.naval !== st.naval) continue;
        if (!this.unitVisibleTo(u, e.owner)) continue;
        out.push(e);
      }
      return out;
    },

    opportunityAttacks(u, threats) {
      for (const e of threats) {
        if (u.dead) return;
        if (e.dead || cheb(e, u) <= 1 || e.opp === this.turn) continue;
        const r = this.previewAttack(e, u);
        const dmg = Math.max(1, Math.round(r.dmg * 0.35));
        e.opp = this.turn;
        u.hp -= dmg;
        const ev = { attacker: e, defender: u, dmg, ret: 0, killed: false, attackerKilled: false, splash: [], from: { x: e.x, y: e.y }, to: { x: u.x, y: u.y }, notes: ['Ataque de oportunidade'], opportunity: true };
        if (u.hp <= 0) { ev.killed = true; this.killUnit(u, e); this.gainXp(e, 1); }
        this.emit('attack', ev);
      }
    },

    // ------------------------------------------------------------ Habilidades ativas
    abilitiesOf(u) {
      const out = [];
      for (const id in PP.ABILITIES) if (PP.ABILITIES[id].units.indexOf(u.type) >= 0) out.push(id);
      return out;
    },

    abilityCheck(u, id) {
      const a = PP.ABILITIES[id];
      const r = { ok: false, reason: '', ready: 0 };
      if (!a || a.units.indexOf(u.type) < 0) { r.reason = 'Indisponível'; return r; }
      if (u.owner !== this.current || this.over) { r.reason = 'Fora do turno'; return r; }
      const ready = (u.cd && u.cd[id]) || 0;
      if (ready > this.turn) { r.reason = `Recarga: ${ready - this.turn} turno(s)`; r.ready = ready - this.turn; return r; }
      if (a.before && (u.moved || u.attacked)) { r.reason = 'Use antes de mover ou atacar'; return r; }
      switch (id) {
        case 'aim': case 'bombard':
          if (!u.canAttack) { r.reason = 'Sem ataque neste turno'; return r; }
          break;
        case 'charge':
          if (!u.canAttack) { r.reason = 'Sem ataque neste turno'; return r; }
          if (this.stat(u).naval) { r.reason = 'Não funciona embarcado'; return r; }
          break;
        case 'taunt': case 'phalanx':
          if (u.attacked) { r.reason = 'Já atacou'; return r; }
          if (this.stat(u).naval) { r.reason = 'Não funciona embarcado'; return r; }
          break;
        case 'bless':
          if (!u.canAttack) { r.reason = 'Já agiu'; return r; }
          if (!this.neighbors(u).some(n => { const o = this.uGrid[n.y * this.W + n.x]; return o && o.owner === u.owner; })) { r.reason = 'Nenhum aliado vizinho'; return r; }
          break;
        case 'broadside':
          if (!u.canAttack) { r.reason = 'Já atacou'; return r; }
          if (!this.broadsideTargets(u).length) { r.reason = 'Nenhum inimigo vizinho'; return r; }
          break;
      }
      r.ok = true;
      return r;
    },

    broadsideTargets(u) {
      const out = [];
      for (const nb of this.neighbors(u)) {
        const e = this.uGrid[nb.y * this.W + nb.x];
        if (e && this.atWar(u.owner, e.owner) && this.unitVisibleTo(e, u.owner)) out.push(e);
      }
      return out;
    },

    useAbility(u, id) {
      const chk = this.abilityCheck(u, id);
      if (!chk.ok) return false;
      const def = PP.ABILITIES[id];
      u.cd = u.cd || {};
      u.cd[id] = this.turn + def.cd;
      u.buff = u.buff || {};
      const ev = { unit: u, ability: id, healed: [], hits: [] };
      switch (id) {
        case 'aim': u.buff.aim = true; u.mp = 0; u.moved = true; break;
        case 'bombard': u.buff.bombard = true; u.mp = 0; u.moved = true; break;
        case 'charge': u.buff.charge = true; u.mp += 2; break;
        case 'taunt': u.buff.taunt = true; u.mp = 0; u.canAttack = false; u.moved = true; u.fortified = false; break;
        case 'phalanx': u.buff.phalanx = true; u.mp = 0; u.canAttack = false; u.moved = true; break;
        case 'bless':
          for (const nb of this.neighbors(u)) {
            const o = this.uGrid[nb.y * this.W + nb.x];
            if (!o || o.owner !== u.owner) continue;
            const before = o.hp;
            o.hp = Math.min(this.maxHp(o), o.hp + 3);
            o.buff = Object.assign({}, o.buff || {}, { bless: true });
            ev.healed.push({ unit: o, amount: o.hp - before });
          }
          u.canAttack = false; u.attacked = true; u.mp = 0;
          break;
        case 'recon':
          u.buff.recon = true;
          this.reveal(this.players[u.owner], u.x, u.y, 4);
          break;
        case 'broadside':
          for (const e of this.broadsideTargets(u)) {
            const r = this.previewAttack(u, e);
            const dmg = Math.max(1, Math.round(r.dmg * 0.6));
            e.hp -= dmg;
            ev.hits.push({ unit: e, dmg, x: e.x, y: e.y });
            if (e.hp <= 0) { this.killUnit(e, u); this.gainXp(u, 1); }
          }
          u.canAttack = false; u.attacked = true;
          if (!this.stat(u).skills.escape) u.mp = 0;
          break;
      }
      const ps = this.players[u.owner].stats;
      ps.abilities = (ps.abilities || 0) + 1;
      this.log(`${this.players[u.owner].name}: ${this.stat(u).name} usou ${def.name}.`, u.owner);
      this.emit('ability', ev);
      this.refreshVision(u.owner);
      return true;
    },
  };

  Object.assign(PP.Game.prototype, K);

  PP.registerSystem('combat', {
    // Efeitos temporários duram até o próximo turno do dono
    beforeTurn(g, p) {
      for (const u of g.units) if (u.owner === p.id && u.buff) u.buff = null;
    },
    attacked(g, a, ev) {
      if (a.buff) { delete a.buff.aim; delete a.buff.charge; delete a.buff.bombard; }
      if (ev.killed && !a.dead && g.players[a.owner].tribe === 'zambe') a.hp = Math.min(g.maxHp(a), a.hp + 3);
    },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
