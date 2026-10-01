/* Chamas de Vardren — espionagem e contraespionagem. O Espião é furtivo (só é visto por quem está colado nele,
   por torres de vigia, fortalezas, cidades com Guarda ou outros espiões por perto) e realiza missões perto
   de cidades de outras tribos. Cada missão tem um risco de captura que depende das defesas do alvo. */
(function (PP) {
  'use strict';
  const UN = PP.UNITS;
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  PP.SPY_MISSIONS = {
    infiltrate: { name: 'Infiltrar',              icon: 'e_observe',  risk: 0.05, city: true,
      desc: 'Relatório completo da tribo: tesouro, ciência, tecnologias, exército, objetivo e tratados. Revela a região da cidade.' },
    reveal:     { name: 'Roubar mapas',           icon: 'e_observe',  risk: 0.05, city: true,
      desc: 'Revela todo o território conhecido da tribo alvo.' },
    steal_sci:  { name: 'Roubar ciência',         icon: 'e_steal',    risk: 0.15, city: true,
      desc: 'Rouba 25% da ciência guardada do alvo (máx. 12⚗).' },
    steal_tech: { name: 'Descobrir tecnologia',   icon: 'e_steal',    risk: 0.3,  city: true,
      desc: 'Aprende uma tecnologia que o alvo conhece e você não.' },
    sabotage_city: { name: 'Sabotar produção',    icon: 'e_sabotage', risk: 0.2,  city: true,
      desc: 'A cidade produz metade por 3 turnos.' },
    sabotage_road: { name: 'Sabotar estradas',    icon: 'e_sabotage', risk: 0.05, city: false,
      desc: 'Destrói a estrada desta casa e as estradas vizinhas do mesmo dono (até 3), cortando rotas.' },
  };

  const S = {
    isStealthed(u) {
      if (UN[u.type].spy) return true;
      if (this.players[u.owner].tribe === 'tupina' && !UN[u.type].naval) {
        const t = this.tiles[u.y * this.W + u.x];
        if (t.terrain === 'forest') return true;
      }
      return false;
    },

    // pid consegue ver unidades furtivas na casa (x, y)?
    detects(pid, x, y) {
      const owners = this.visionOwners ? this.visionOwners(this.players[pid]) : [pid];
      const own = id => owners.indexOf(id) >= 0;
      for (const u of this.units) {
        if (!own(u.owner)) continue;
        const d = Math.max(Math.abs(u.x - x), Math.abs(u.y - y));
        if (d <= 1 || (UN[u.type].spy && d <= 2)) return true;
      }
      for (const c of this.cities) {
        if (!own(c.owner)) continue;
        const d = Math.max(Math.abs(c.x - x), Math.abs(c.y - y));
        if (d <= 1 || (c.buildings.guard && d <= c.radius + 1)) return true;
      }
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const t = this.tile(x + dx, y + dy);
        if (!t || !t.fort || !own(t.fort.owner)) continue;
        const det = PP.FORTS[t.fort.type].detect || 0;
        if (Math.max(Math.abs(dx), Math.abs(dy)) <= det) return true;
      }
      return false;
    },

    // Cidade estrangeira ao lado do espião (ou onde ele está)
    spyTargetCity(u) {
      let best = null;
      for (const c of this.cities) {
        if (c.owner === u.owner || cheb(c, u) > 1) continue;
        if (this.allied && this.allied(c.owner, u.owner)) continue;
        if (!best || c.level > best.level) best = c;
      }
      return best;
    },

    spyRisk(u, id, target) {
      const m = PP.SPY_MISSIONS[id];
      let risk = 0.2 + m.risk;
      const t = this.tileAt(u);
      if (target && target.buildings) {
        const c = target;
        if (c.buildings.guard) risk += 0.4;
        if (this.garrisoned && this.garrisoned(c)) risk += 0.1;
        if (c.capital) risk += 0.05;
      }
      const victim = target && target.owner != null ? target.owner : t.owner;
      if (victim >= 0) {
        if (this.units.some(o => o.owner === victim && UN[o.type].spy && cheb(o, u) <= 2)) risk += 0.15;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          const n = this.tile(u.x + dx, u.y + dy);
          if (n && n.fort && n.fort.owner === victim && (PP.FORTS[n.fort.type].detect || 0) >= Math.max(Math.abs(dx), Math.abs(dy))) { risk += 0.15; dy = 9; break; }
        }
      }
      risk -= 0.08 * this.rank(u);
      return Math.max(0.05, Math.min(0.9, risk));
    },

    spyMissions(u) {
      if (!u || !UN[u.type].spy) return [];
      const out = [];
      const c = this.spyTargetCity(u);
      const t = this.tileAt(u);
      for (const id in PP.SPY_MISSIONS) {
        const m = PP.SPY_MISSIONS[id];
        const r = { id, def: m, ok: false, reason: '', risk: 0, target: null };
        if (m.city) {
          if (!c) { r.reason = PP.t('Fique ao lado de uma cidade estrangeira'); out.push(r); continue; }
          r.target = c;
          if (id === 'steal_tech' && !this.stealableTechs(this.players[u.owner], this.players[c.owner]).length) { r.reason = PP.t('Nada a aprender com eles'); out.push(r); continue; }
          if (id === 'steal_sci' && this.players[c.owner].science < 2) { r.reason = PP.t('Eles não têm ciência guardada'); out.push(r); continue; }
          if (id === 'sabotage_city' && c.sabotage > 0) { r.reason = PP.t('Já sabotada'); out.push(r); continue; }
        } else {
          if (!t.road || t.owner === u.owner || t.owner < 0 || (this.allied && this.allied(t.owner, u.owner))) { r.reason = PP.t('Precisa estar numa estrada de outra tribo'); out.push(r); continue; }
          r.target = t;
        }
        r.risk = this.spyRisk(u, id, r.target);
        if (!u.canAttack || u.attacked) { r.reason = PP.t('O espião já agiu neste turno'); out.push(r); continue; }
        if (u.owner !== this.current) { r.reason = PP.t('Fora do turno'); out.push(r); continue; }
        r.ok = true;
        out.push(r);
      }
      return out;
    },

    stealableTechs(p, q) {
      return PP.TECHS.filter(tc => q.techs[tc.id] && !p.techs[tc.id] && tc.req.every(r => p.techs[r]));
    },

    spyMission(u, id) {
      const m = this.spyMissions(u).find(x => x.id === id);
      if (!m || !m.ok) return null;
      const p = this.players[u.owner];
      const target = m.target;
      const victimId = m.def.city ? target.owner : target.owner;
      const victim = this.players[victimId];
      u.canAttack = false; u.attacked = true; u.mp = 0; u.moved = true;
      p.stats.spyMissions = (p.stats.spyMissions || 0) + 1;
      const caught = this.rng.chance(m.risk);
      const res = { unit: u, mission: id, caught, victim: victimId, text: '' };
      if (caught) {
        this.remember(victimId, p.id, 'spy_caught');
        victim.stats.spiesCaught = (victim.stats.spiesCaught || 0) + 1;
        this.log(PP.t('{v} capturou um espião de {p}!', { v: victim.name, p: p.name }), [p.id, victimId]);
        res.text = PP.t('O espião foi capturado.');
        this.killUnit(u, null);
        this.emit('spy', res);
        this.refreshVision(p.id);
        return res;
      }
      switch (id) {
        case 'infiltrate': {
          p.intel = p.intel || {};
          p.intel[victimId] = this.intelReport(p.id, victimId);
          this.reveal(p, target.x, target.y, 3);
          res.text = PP.t('Relatório de {v} obtido.', { v: victim.name });
          break;
        }
        case 'reveal': {
          for (let i = 0; i < this.tiles.length; i++) if (victim.explored[i] && this.tiles[i].owner === victimId) p.explored[i] = 1;
          for (let i = 0; i < this.tiles.length; i++) if (victim.explored[i] && this.rng.chance(0.5)) p.explored[i] = 1;
          res.text = PP.t('Mapas de {v} copiados.', { v: victim.name });
          break;
        }
        case 'steal_sci': {
          const amt = Math.min(12, Math.max(1, Math.floor(victim.science * 0.25)));
          victim.science -= amt; p.science += amt;
          res.text = PP.t('+{n}⚗ roubados de {v}.', { n: amt, v: victim.name });
          this.log(PP.t('Espiões roubaram {n}⚗ de {v}.', { n: amt, v: victim.name }), victimId);
          break;
        }
        case 'steal_tech': {
          const opts = this.stealableTechs(p, victim).sort((a, b) => a.tier - b.tier);
          const tc = opts[this.rng.int(Math.min(2, opts.length))];
          p.techs[tc.id] = true;
          this.hook('tech', p, tc.id);
          this.emit('tech', { player: p.id, tech: tc.id });
          res.text = PP.t('Tecnologia descoberta: {t}.', { t: tc.name });
          break;
        }
        case 'sabotage_city': {
          target.sabotage = 3;
          res.text = PP.t('{c} sabotada por 3 turnos.', { c: target.name });
          this.log(PP.t('Sabotadores atacaram a produção de {c}.', { c: target.name }), victimId);
          break;
        }
        case 'sabotage_road': {
          let n = 0;
          const owner = target.owner;
          for (const t of [target].concat(this.neighbors(target))) {
            if (n >= 3) break;
            if (t.road && t.owner === owner) { t.road = false; n++; }
          }
          this.invalidate();
          res.text = PP.t('{n} trecho(s) de estrada destruídos.', { n });
          this.log(PP.t('Sabotadores destruíram estradas de {v}.', { v: victim.name }), victimId);
          break;
        }
      }
      this.gainXp(u, 1);
      this.log(PP.t('{p}: missão "{m}" concluída. {r}', { p: p.name, m: m.def.name, r: res.text }), p.id);
      this.emit('spy', res);
      this.refreshVision(p.id);
      return res;
    },

    // Relatório de inteligência (também usado pela interface de diplomacia)
    intelReport(pid, tid) {
      const q = this.players[tid];
      const units = this.units.filter(u => u.owner === tid);
      const byType = {};
      for (const u of units) byType[u.type] = (byType[u.type] || 0) + 1;
      const rel = {};
      for (const o of this.players) if (o.id !== tid && o.alive && q.met[o.id]) rel[o.id] = this.relState(tid, o.id);
      return {
        turn: this.turn, stars: q.stars, science: q.science, techs: Object.keys(q.techs).length,
        units: units.length, byType, strength: Math.round(this.strength(tid)), cities: this.citiesOf(tid).length,
        strategy: q.ai && q.ai.strategy ? q.ai.strategy : null, target: q.ai && q.ai.target != null ? q.ai.target : null,
        relations: rel, opinionOfYou: this.opinion(tid, pid),
      };
    },
  };

  Object.assign(PP.Game.prototype, S);

  PP.registerSystem('espionage', {
    load(g) { for (const p of g.players) if (!p.intel) p.intel = {}; },
    init(g) { for (const p of g.players) p.intel = {}; },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
