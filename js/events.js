/* Politopia+ — eventos mundiais. São anunciados dois turnos antes, têm duração conhecida e efeitos
   claros, para que os jogadores possam se preparar. A escolha usa o RNG da partida (determinístico). */
(function (PP) {
  'use strict';
  const UN = PP.UNITS;

  PP.EVENTS = {
    drought:   { name: 'Grande Seca',            icon: 'ev_drought',   dur: 4, weight: 3,
      desc: 'Cidades de nível 3+ rendem −1★ (agrícolas −2★) e o crescimento natural para. Desertos consomem suprimentos em dobro (como sempre).' },
    winter:    { name: 'Inverno Severo',          icon: 'ev_winter',    dur: 3, weight: 3,
      desc: 'Tundra e montanhas custam +1 de movimento; tropas fora do abastecimento perdem 1 de vida por turno (nunca morrem por isso). Os Vikar não sentem o frio.' },
    gold:      { name: 'Corrida do Ouro',         icon: 'ev_gold',      dur: 4, weight: 2,
      desc: 'Cada Mina e Garimpo rende +1★ por turno; a Mina abandonada rende +2★.' },
    plague:    { name: 'Praga',                   icon: 'ev_plague',    dur: 3, weight: 2,
      desc: 'Cidades de nível 5+ sem Templo produzem 25% menos. Rotas com outras tribos rendem metade.' },
    migration: { name: 'Migração',                icon: 'ev_migration', dur: 1, weight: 2,
      desc: 'Povos migrantes chegam: a menor cidade de cada tribo ganha +1 população e surgem novas aldeias em terras livres.' },
    discovery: { name: 'Descoberta Científica',   icon: 'ev_discovery', dur: 3, weight: 2,
      desc: 'Tecnologias custam 20% menos para todos e cidades científicas rendem +1⚗.' },
    storm:     { name: 'Tempestades no Mar',      icon: 'ev_storm',     dur: 3, weight: 2,
      desc: 'Oceano custa 2 de movimento e rotas marítimas rendem metade.' },
  };
  PP.EVENT_WARNING = 2;  // turnos de aviso antes de começar
  PP.EVENT_FIRST = 8;    // primeiro evento possível

  const V = {
    ensureEvents() {
      if (!this.events) this.events = { active: [], upcoming: null, next: PP.EVENT_FIRST, last: null, history: [] };
    },
    eventsEnabled() { return this.opts.events !== false; },
    eventActive(id) {
      const ev = this.events;
      if (!ev) return false;
      for (const a of ev.active) if (a.id === id) return true;
      return false;
    },
    eventGap() {
      const hostile = this.opts.scenario === 'mundo_hostil';
      return hostile ? 4 + this.rng.int(4) : 8 + this.rng.int(5);
    },

    // Chamado uma vez por rodada
    tickEvents() {
      this.ensureEvents();
      if (!this.eventsEnabled()) return;
      const ev = this.events;
      // encerra os que acabaram
      for (const a of ev.active.slice()) {
        if (this.turn > a.end) {
          ev.active.splice(ev.active.indexOf(a), 1);
          this.log(`Fim do evento: ${PP.EVENTS[a.id].name}.`, null);
          this.emit('worldEvent', { id: a.id, phase: 'end' });
        }
      }
      // começa o anunciado
      if (ev.upcoming && this.turn >= ev.upcoming.start) {
        const def = PP.EVENTS[ev.upcoming.id];
        const a = { id: ev.upcoming.id, start: this.turn, end: this.turn + def.dur - 1 };
        ev.active.push(a);
        ev.history.push({ id: a.id, turn: this.turn });
        ev.upcoming = null;
        ev.next = a.end + 1 + this.eventGap();
        this.log(`Evento mundial: ${def.name}! ${def.desc}`, null);
        this.emit('worldEvent', { id: a.id, phase: 'start' });
        if (a.id === 'migration') this.applyMigration();
      }
      // anuncia o próximo
      if (!ev.upcoming && this.turn >= ev.next - PP.EVENT_WARNING) {
        const hostile = this.opts.scenario === 'mundo_hostil';
        const pool = Object.keys(PP.EVENTS).filter(id => id !== ev.last && !this.eventActive(id)).map(id => {
          let w = PP.EVENTS[id].weight;
          if (hostile && (id === 'drought' || id === 'winter' || id === 'plague' || id === 'storm')) w *= 2;
          if (id === 'storm' && !this.players.some(p => p.alive && this.navalLevel(p) >= 1)) w = 0;
          return [id, w];
        });
        const id = this.rng.weighted(pool);
        if (id) {
          ev.upcoming = { id, start: Math.max(this.turn + 1, ev.next), announced: this.turn };
          ev.last = id;
          const def = PP.EVENTS[id];
          this.log(`Previsão: ${def.name} começa no turno ${ev.upcoming.start} (${def.dur} turno${def.dur > 1 ? 's' : ''}).`, null);
          this.emit('worldEvent', { id, phase: 'announce', start: ev.upcoming.start });
        }
      }
    },

    applyMigration() {
      for (const p of this.players) {
        if (!p.alive) continue;
        const mine = this.citiesOf(p.id).sort((a, b) => a.level - b.level || a.pop - b.pop);
        if (mine.length) this.addPop(mine[0], 1);
      }
      const W = this.W;
      const far = t => this.cities.every(c => Math.max(Math.abs(c.x - t.x), Math.abs(c.y - t.y)) >= 3) &&
        this.tiles.every(o => !o.village || Math.max(Math.abs(o.x - t.x), Math.abs(o.y - t.y)) >= 3);
      const cands = this.rng.shuffle(this.tiles.filter(t => !this.isWater(t) && t.terrain !== 'mountain' && t.owner === -1 &&
        !t.res && !t.ruin && !t.fort && !t.landmark && !t.wonder && !this.uGrid[t.y * W + t.x]));
      let n = 0;
      const want = 1 + (this.W >= 22 ? 1 : 0);
      for (const t of cands) {
        if (n >= want) break;
        if (!far(t)) continue;
        t.village = true; t.road = false; n++;
      }
      if (n) this.log(`${n} nova${n > 1 ? 's' : ''} aldeia${n > 1 ? 's' : ''} surgiram com a migração.`, null);
    },

    // ------------------------------------------------------------ Efeitos
    eventCityIncome(c, res) {
      if (!this.events || !this.events.active.length) return;
      if (this.eventActive('drought') && c.level >= 3) {
        const cut = c.spec === 'agricola' ? 2 : 1;
        res.stars -= cut; res.notes.push(`Seca −${cut}★`);
      }
      if (this.eventActive('gold')) {
        let n = 0;
        for (const t of this.tiles) {
          if (t.cityId !== c.id || t.owner !== c.owner || t.pillaged) continue;
          if (t.imp === 'mine' || t.imp === 'gemmine') n++;
        }
        if (n) { res.stars += n; res.notes.push(`Corrida do Ouro +${n}★`); }
      }
      if (this.eventActive('plague') && c.level >= 5 && !c.buildings.temple) {
        const a = Math.round(res.stars * 0.25), b = Math.round(res.sci * 0.25);
        res.stars -= a; res.sci -= b; res.notes.push('Praga −25%');
      }
      if (this.eventActive('discovery') && c.spec === 'ciencia') { res.sci += 1; res.notes.push('Descoberta +1⚗'); }
    },

    eventIncome(p, res) {
      if (!this.events || !this.events.active.length) return;
      if (this.eventActive('gold')) {
        let n = 0;
        for (const t of this.tiles) if (t.owner === p.id && t.landmark === 'mina_abandonada') n += 2;
        if (n) { res.stars += n; res.lines.push({ label: 'Corrida do Ouro (mina abandonada)', stars: n, sci: 0 }); }
      }
    },

    eventRouteMult(r) {
      let m = 1;
      if (r.sea && this.eventActive('storm')) m *= 0.5;
      if (r.kind === 'foreign' && this.eventActive('plague')) m *= 0.5;
      return m;
    },

    eventTechMult() { return this.eventActive('discovery') ? 0.8 : 1; },

    // Inverno: atrito para tropas fora do abastecimento (mínimo 1 de vida)
    eventAttrition(p) {
      if (!this.eventActive('winter') || p.tribe === 'vikar' || !this.isSupplied) return;
      for (const u of this.units) {
        if (u.owner !== p.id || UN[u.type].spy || this.isSupplied(u)) continue;
        if (u.hp > 1) { u.hp -= 1; this.emit('attrition', { unit: u }); }
      }
    },
  };

  Object.assign(PP.Game.prototype, V);

  PP.registerSystem('events', {
    init(g) { g.ensureEvents(); },
    load(g, sys) {
      g.events = sys.events ? Object.assign({}, sys.events) : null;
      g.ensureEvents();
      for (const [k, v] of [['active', []], ['upcoming', null], ['next', PP.EVENT_FIRST], ['last', null], ['history', []]]) if (g.events[k] === undefined) g.events[k] = v;
      if (!sys.events) g.events.next = Math.max(PP.EVENT_FIRST, g.turn + 4);
    },
    save(g, sys) { sys.events = g.events; },
    newRound(g) { g.tickEvents(); },
    beforeTurn(g, p) { if (g.turn > 1) g.eventAttrition(p); },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
