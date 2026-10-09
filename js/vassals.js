/* Chamas de Vardren — vassalos, termos de paz, placar da guerra e trégua (inspirados em Age of History).
   Placar da guerra: cada par de tribos em guerra acumula pontos (tropas derrotadas, cidades tomadas, saques).
   Quem está ganhando pode exigir termos para assinar a paz: reparações (estrelas por turno), a cessão de uma
   cidade ou a vassalagem. Toda paz abre uma trégua de 10 turnos; rompê-la custa como romper um pacto.
   Vassalos ficam aliados ao suserano (visão compartilhada), pagam tributo sobre a renda, entram nas guerras dele,
   não declaram guerra nem fazem alianças por conta própria e não negociam a paz de uma guerra do suserano.
   O suserano pode libertar o vassalo ou, depois de 10 turnos e com boa relação, propor a anexação (as cidades e
   tropas passam para ele). O vassalo pode declarar independência a qualquer momento: vira guerra.
   Uma tribo cujos rivais vivos são todos vassalos dela há 5 turnos vence por dominação. */
(function (PP) {
  'use strict';
  const UN = PP.UNITS;
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const pairKey = (a, b) => (a < b ? a + ':' + b : b + ':' + a);

  PP.VASSAL = { tribute: 0.15, annexTurns: 10, annexOpinion: 10, annexCost: 8, reparationsTurns: 8, dominationTurns: 5 };
  PP.TRUCE_TURNS = 10;
  // pontos do placar da guerra
  PP.WAR_POINTS = { kill: 1, character: 3, city: 4, capital: 8, pillage: 1 };

  PP.PEACE_TERMS = {
    reparations: { name: 'Reparações de guerra', icon: 'ui_tax', desc: 'Eles pagam estrelas a você a cada turno, por 8 turnos.' },
    city:        { name: 'Cessão de cidade', icon: 'ui_city', desc: 'Eles entregam uma cidade (nunca a capital nem a última).' },
    vassal:      { name: 'Vassalagem', icon: 'd_vassal', desc: 'Eles se tornam seus vassalos: pagam tributo e entram nas suas guerras.' },
  };

  PP.PROPOSAL_TYPES.peace_terms = 'Paz com termos';
  PP.PROPOSAL_TYPES.vassal_offer = 'Oferta de proteção';
  PP.PROPOSAL_TYPES.annex = 'Anexação';

  PP.MEMORY_KINDS.vassalized = { label: 'Impôs-nos a vassalagem', v: -12, decay: 40 };
  PP.MEMORY_KINDS.humiliated = { label: 'Impôs-nos uma paz humilhante', v: -10, decay: 40 };
  PP.MEMORY_KINDS.overlord = { label: 'Suserano que nos protege', v: 1, decay: 12, cap: 15 };
  PP.MEMORY_KINDS.freed = { label: 'Libertou-nos da vassalagem', v: 25, decay: 60 };
  PP.MEMORY_KINDS.rebelled = { label: 'Rebelou-se contra nós', v: -25, decay: 60 };

  const V = {
    ensureVassal(p) {
      if (p.overlord === undefined) p.overlord = null;
      if (p.vassalSince == null) p.vassalSince = -1;
      if (!p.reparations) p.reparations = [];
    },

    // ------------------------------------------------------------ Consultas
    overlordOf(pid) {
      const p = this.players[pid];
      if (!p || p.overlord == null) return null;
      const o = this.players[p.overlord];
      return o && o.alive ? o.id : null;
    },
    isVassal(pid) { return this.overlordOf(pid) != null; },
    vassalsOf(pid) { return this.players.filter(q => q.alive && q.overlord === pid).map(q => q.id); },
    vassalPair(a, b) { return this.overlordOf(a) === b || this.overlordOf(b) === a; },
    tributeRate(oid) {
      const fx = this.govEffects ? this.govEffects(this.players[oid]) : {};
      return fx.vassalTribute || PP.VASSAL.tribute;
    },
    vassalTurns(pid) { const p = this.players[pid]; return this.isVassal(pid) ? this.turn - p.vassalSince : 0; },
    annexCost(vid) { return PP.VASSAL.annexCost * this.citiesOf(vid).length; },
    truceUntil(a, b) {
      const r = this.players[a] && this.players[a].rel[b];
      return r && r.state === 'peace' && r.truce > this.turn ? r.truce : 0;
    },

    // ------------------------------------------------------------ Placar da guerra
    warScore(a, b) {
      const w = this.wars && this.wars[pairKey(a, b)];
      if (!w || !w.pts) return 0;
      return (w.pts[a] || 0) - (w.pts[b] || 0);
    },

    addWarPoints(a, b, n) {
      if (a == null || b == null || a === b || a < 0 || b < 0 || !n || !this.players[a] || !this.players[b] || !this.atWar(a, b)) return;
      const w = this.warRecord(a, b);
      if (!w.pts) w.pts = {};
      w.pts[a] = (w.pts[a] || 0) + n;
    },

    // ------------------------------------------------------------ Termos de paz
    // Opções que "from" pode exigir de "to"; o valor das reparações acompanha o placar
    peaceTermOptions(from, to) {
      const s = this.warScore(from, to);
      const p = this.players[from];
      const out = [{ term: 'reparations', amount: Math.max(1, Math.min(6, Math.round(s / 5))), turns: PP.VASSAL.reparationsTurns }];
      const theirs = this.citiesOf(to);
      for (const c of theirs) {
        if (c.capital || theirs.length < 2 || !p.explored[c.y * this.W + c.x]) continue;
        out.push({ term: 'city', city: c.id });
      }
      out.push({ term: 'vassal' });
      return out;
    },

    // Chance de a IA aceitar (sem sorteio): 'likely' ou 'unlikely'. Usado pela IA e pela interface.
    termsOutlook(from, to, data) {
      const T = this.players[to];
      const s = this.warScore(from, to);
      const ratio = this.strength(to) / (this.strength(from) + 1);
      const soft = T.ai && T.ai.strategy === 'defesa' ? 0.75 : 1;
      let ok = false;
      if (data.term === 'reparations') ok = s >= (6 + data.amount * 2) * soft || (s >= 3 && ratio < 0.6);
      else if (data.term === 'city') {
        const c = this.cityMap[data.city];
        if (c) ok = s >= (10 + c.level * 3 + (c.metropolis ? 8 : 0)) * soft || (ratio < 0.4 && s >= 6);
      } else if (data.term === 'vassal') {
        const n = this.citiesOf(to).length;
        ok = (s >= 25 * soft && ratio < 0.6) || (ratio < 0.3 && n <= 3) || (T.capital == null && ratio < 0.7 && s >= 10);
      }
      return { ok, score: s, ratio };
    },

    applyPeaceTerms(w, l, data) {
      const Wp = this.players[w], L = this.players[l];
      const term = data.term;
      if (term === 'city') {
        const c = this.cityMap[data.city];
        if (c && c.owner === l && !c.capital) this.cedeCity(c, w);
      }
      if (this.closeWar) this.closeWar(w, l, l); // o vencedor leva a guerra nas estatísticas
      this.makePeace(w, l);
      if (term === 'reparations') {
        L.reparations.push({ to: w, amount: data.amount, left: PP.VASSAL.reparationsTurns });
        this.log(PP.t('{l} pagará {n}★ por turno a {w} durante {t} turnos.', { l: L.name, w: Wp.name, n: data.amount, t: PP.VASSAL.reparationsTurns }), null);
      }
      if (term === 'vassal') this.makeVassal(l, w, 'war');
      else this.remember(l, w, 'humiliated');
      this.hook('terms', w, l, data);
      this.emit('terms', { winner: w, loser: l, term, amount: data.amount, city: data.city });
    },

    // Tira da cidade a tropa do dono antigo (vai para a casa livre mais próxima; sem lugar, é dispensada)
    evictUnits(c, newOwner) {
      const W = this.W;
      const u = this.uGrid[c.y * W + c.x];
      if (!u || u.owner === newOwner) return;
      const p = this.players[u.owner];
      let best = null, bd = 1e9;
      for (let r = 1; r <= 4 && !best; r++) {
        for (const t of this.neighbors(c, r)) {
          if (this.uGrid[t.y * W + t.x] || t.city || t.village) continue;
          if (UN[u.type].naval ? !this.isWater(t) : this.isWater(t)) continue;
          if (t.terrain === 'mountain' && (!this.has(p, 'escalada') || UN[u.type].mounted)) continue;
          const d = cheb(t, c) + (t.owner === u.owner ? 0 : 0.5);
          if (d < bd) { bd = d; best = t; }
        }
      }
      if (best) {
        this.uGrid[c.y * W + c.x] = null;
        u.x = best.x; u.y = best.y; u.fortified = false;
        this.uGrid[best.y * W + best.x] = u;
      } else {
        const i = this.units.indexOf(u);
        if (i >= 0) this.units.splice(i, 1);
        this.uGrid[c.y * W + c.x] = null;
        u.dead = true;
        this.emit('death', { unit: u, disband: true });
      }
    },

    cedeCity(c, to) {
      const old = this.players[c.owner], p = this.players[to];
      this.evictUnits(c, to);
      this.transferCity(c, to);
      this.hook('capture', c, old, p, 'cession');
      c.occupied = Math.min(c.occupied || 0, 2);
      c.loyalty = Math.max(c.loyalty, 45);
      c.unrest = false;
      p.stats.ceded = (p.stats.ceded || 0) + 1;
      this.log(PP.t('{o} cedeu {c} a {p}.', { o: old.name, c: c.name, p: p.name }), null);
      this.emit('cession', { city: c, from: old.id, to });
      this.refreshVision(to); this.refreshVision(old.id);
      this.checkElimination(old);
      this.checkVictory();
    },

    // ------------------------------------------------------------ Vassalagem
    makeVassal(vid, oid, how) {
      const Vp = this.players[vid], O = this.players[oid];
      // quem vira vassalo perde os próprios vassalos e as alianças com outras tribos
      for (const q of this.players) if (q.alive && q.overlord === vid) this.freeVassal(q.id, 'chain');
      for (const a of this.alliesOf(vid)) if (a !== oid) this.setRel(vid, a, 'peace', { truce: this.turn + PP.TRUCE_TURNS });
      Vp.overlord = oid;
      Vp.vassalSince = this.turn;
      this.setRel(vid, oid, 'alliance');
      if (how === 'war') this.remember(vid, oid, 'vassalized');
      O.stats.vassalsMade = (O.stats.vassalsMade || 0) + 1;
      this.log(PP.t('{v} tornou-se vassalo de {o}.', { v: Vp.name, o: O.name }), null);
      this.hook('vassal', vid, oid, how);
      this.emit('vassal', { type: 'new', vassal: vid, overlord: oid, how });
      this.refreshVision(vid); this.refreshVision(oid);
      this.checkVictory();
    },

    // how: 'release' (o suserano liberta), 'chain' (o suserano virou vassalo de outro), 'fall' (o suserano caiu)
    freeVassal(vid, how) {
      const Vp = this.players[vid];
      const oid = Vp.overlord;
      if (oid == null) return false;
      Vp.overlord = null;
      Vp.vassalSince = -1;
      const O = this.players[oid];
      if (O && O.alive) {
        this.setRel(vid, oid, 'peace', { truce: this.turn + PP.TRUCE_TURNS });
        if (how === 'release') this.remember(vid, oid, 'freed');
      }
      this.log(PP.t('{v} não é mais vassalo de {o}.', { v: Vp.name, o: O ? O.name : '?' }), null);
      this.emit('vassal', { type: 'released', vassal: vid, overlord: oid, how });
      this.refreshVision(vid);
      if (O && O.alive) this.refreshVision(oid);
      return true;
    },

    releaseVassal(oid, vid) {
      if (this.over || this.current !== oid || this.overlordOf(vid) !== oid) return false;
      return this.freeVassal(vid, 'release');
    },

    // O vassalo rompe com o suserano: guerra, sem custo de reputação (é uma guerra de independência)
    declareIndependence(vid) {
      if (this.over || this.current !== vid) return false;
      const oid = this.overlordOf(vid);
      if (oid == null) return false;
      const Vp = this.players[vid], O = this.players[oid];
      Vp.overlord = null;
      Vp.vassalSince = -1;
      this.setRel(vid, oid, 'war');
      this.remember(oid, vid, 'rebelled');
      Vp.stats.independence = (Vp.stats.independence || 0) + 1;
      this.log(PP.t('{v} declarou independência de {o}!', { v: Vp.name, o: O.name }), null);
      this.hook('war', vid, oid, 'independence');
      this.emit('diplomacy', { type: 'war', a: vid, b: oid, kind: 'independence' });
      this.emit('vassal', { type: 'independence', vassal: vid, overlord: oid });
      for (const ally of this.alliesOf(oid)) {
        if (ally === vid || this.atWar(ally, vid)) continue;
        this.propose(oid, ally, 'call_to_arms', { target: vid });
      }
      this.refreshVision(vid); this.refreshVision(oid);
      return true;
    },

    // Anexação pacífica: cidades, tropas, fortificações, maravilhas e o tesouro do vassalo passam ao suserano
    annexVassal(oid, vid) {
      const O = this.players[oid], Vp = this.players[vid];
      if (this.overlordOf(vid) !== oid) return false;
      O.stars = Math.max(0, O.stars - this.annexCost(vid));
      for (const c of this.citiesOf(vid)) {
        this.transferCity(c, oid);
        this.hook('capture', c, Vp, O, 'annex');
        c.founder = oid; c.occupied = 0; c.unrest = false;
        c.loyalty = Math.max(c.loyalty, 70);
      }
      const move = u => {
        if (UN[u.type].character && this.characterOf(oid, u.type)) return false; // um personagem de cada por reino
        u.owner = oid;
        return true;
      };
      for (const u of this.units.slice()) {
        if (u.owner !== vid) continue;
        if (!move(u)) {
          this.units.splice(this.units.indexOf(u), 1);
          if (this.uGrid[u.y * this.W + u.x] === u) this.uGrid[u.y * this.W + u.x] = null;
          u.dead = true;
          continue;
        }
        for (const x of u.cargo || []) x.owner = oid;
      }
      for (const t of this.tiles) if (t.fort && t.fort.owner === vid) t.fort.owner = oid;
      for (const w in this.wonders) if (this.wonders[w] === vid) this.wonders[w] = oid;
      O.stars += Vp.stars; O.science += Vp.science;
      Vp.stars = 0; Vp.science = 0;
      Vp.overlord = null;
      O.stats.annexed = (O.stats.annexed || 0) + 1;
      this.invalidate();
      if (this.realmReset) this.realmReset();
      this.log(PP.t('{o} anexou {v}!', { o: O.name, v: Vp.name }), null);
      if (this.mark) this.mark(PP.t('{o} anexou {v}', { o: O.name, v: Vp.name }), 'capture');
      this.emit('vassal', { type: 'annexed', vassal: vid, overlord: oid });
      this.checkElimination(Vp);
      this.refreshVision(oid);
      this.checkVictory();
      return true;
    },
  };
  Object.assign(PP.Game.prototype, V);

  // ------------------------------------------------------------ Extensões encadeadas da diplomacia
  const proto = PP.Game.prototype;
  const chain = (name, fn) => {
    const prev = proto[name];
    proto[name] = function (...args) { return fn.call(this, prev, ...args); };
  };

  chain('canPropose', function (prev, from, to, type, data) {
    const a = this.players[from], b = this.players[to];
    const bad = (reason, v) => ({ ok: false, reason: PP.t(reason, v) });
    if (type === 'peace_terms' || type === 'vassal_offer' || type === 'annex') {
      if (!a || !b || !a.alive || !b.alive || from === to) return bad('Inválido');
      if (!a.met[to]) return bad('Ainda não se conhecem');
      const st = this.relState(from, to);
      if (type === 'annex') {
        if (this.overlordOf(to) !== from) return bad('Eles não são seus vassalos');
        const wait = b.vassalSince + PP.VASSAL.annexTurns - this.turn;
        if (wait > 0) return bad('Anexação possível em {n} turnos', { n: wait });
        const cost = this.annexCost(to);
        if (a.stars < cost) return bad('Faltam estrelas ({n}★)', { n: cost });
        return { ok: true, cost };
      }
      if (this.isVassal(from)) return bad('Vassalos não negociam isso');
      if (this.isVassal(to)) return bad('{x} é vassalo de {y}', { x: b.name, y: this.players[b.overlord].name });
      if (type === 'peace_terms') {
        if (st !== 'war') return bad('Não estão em guerra');
        if (this.opts.diploLockUntil && this.turn < this.opts.diploLockUntil) return bad('Guerra total até o turno {n}', { n: this.opts.diploLockUntil });
        if (!data || !PP.PEACE_TERMS[data.term]) return bad('Termos inválidos');
        if (data.term === 'reparations' && !(data.amount >= 1 && data.amount <= 8)) return bad('Valor inválido');
        if (data.term === 'city') {
          const c = this.cityMap[data.city];
          if (!c || c.owner !== to) return bad('A cidade não é deles');
          if (c.capital) return bad('A capital não pode ser cedida');
          if (this.citiesOf(to).length < 2) return bad('Eles só têm essa cidade');
        }
        return { ok: true };
      }
      // vassal_offer: proteção em tempos de paz
      if (st === 'war') return bad('Faça a paz primeiro');
      if (this.vassalsOf(to).length) return bad('Eles têm vassalos próprios');
      return { ok: true };
    }
    const r = prev.call(this, from, to, type, data);
    if (!r.ok) return r;
    // vassalos: sem alianças, guerras conjuntas ou tributos por conta própria; a paz das guerras do suserano é dele
    if (this.isVassal(from)) {
      if (type === 'alliance' || type === 'joint_war' || type === 'tribute_demand') return bad('Vassalos não podem fazer isso sem o suserano');
      if (type === 'peace' && this.atWar(this.overlordOf(from), to)) return bad('A paz depende do seu suserano');
    }
    if (this.isVassal(to)) {
      const o = this.players[this.overlordOf(to)];
      if (type === 'alliance' || type === 'joint_war' || type === 'tribute_demand') return bad('{x} é vassalo de {y}', { x: b.name, y: o.name });
      if (type === 'peace' && o.id !== from && this.atWar(o.id, from)) return bad('Negocie a paz com {y}, o suserano deles', { y: o.name });
    }
    return r;
  });

  chain('executeProposal', function (prev, acceptor, proposer, type, data) {
    if (type === 'peace_terms') { this.applyPeaceTerms(proposer, acceptor, data); return; }
    if (type === 'vassal_offer') { this.makeVassal(acceptor, proposer, 'offer'); return; }
    if (type === 'annex') { this.annexVassal(proposer, acceptor); return; }
    prev.call(this, acceptor, proposer, type, data);
  });

  // Toda paz abre uma trégua
  chain('makePeace', function (prev, a, b) {
    prev.call(this, a, b);
    const until = this.turn + PP.TRUCE_TURNS;
    if (this.players[a].rel[b]) this.players[a].rel[b].truce = until;
    if (this.players[b].rel[a]) this.players[b].rel[a].truce = until;
  });

  // Suserano e vassalo não guerreiam (há a independência); vassalos não declaram guerra; romper a trégua conta
  // como romper um pacto
  chain('declareWar', function (prev, a, b) {
    if (a === b || !this.players[a] || !this.players[b]) return false;
    if (this.vassalPair(a, b) || this.isVassal(a)) return false;
    const r = this.players[a].rel[b];
    if (r && r.state === 'peace' && r.truce > this.turn) {
      r.state = 'nap';
      const r2 = this.players[b].rel[a];
      if (r2) r2.state = 'nap';
    }
    return prev.call(this, a, b);
  });

  chain('leaveAlliance', function (prev, a, b) {
    if (this.vassalPair(a, b)) return false;
    return prev.call(this, a, b);
  });

  // Dominação: vence quem tem todos os rivais vivos como vassalos há pelo menos 5 turnos
  chain('checkVictory', function (prev) {
    prev.call(this);
    if (this.over) return;
    const alive = this.players.filter(p => p.alive);
    if (alive.length < 2) return;
    for (const p of alive) {
      if (this.isVassal(p.id)) continue;
      const rivals = alive.filter(q => q.id !== p.id);
      if (!rivals.every(q => this.overlordOf(q.id) === p.id)) continue;
      if (rivals.every(q => this.turn - q.vassalSince >= PP.VASSAL.dominationTurns)) { this.finish(p.id, 'dominacao'); return; }
      const left = Math.max(...rivals.map(q => q.vassalSince + PP.VASSAL.dominationTurns - this.turn));
      if (p.vassalDomWarn !== this.turn && left === PP.VASSAL.dominationTurns) {
        p.vassalDomWarn = this.turn;
        this.log(PP.t('Todas as tribos rivais são vassalas de {p}! Vitória por dominação em {n} turnos.', { p: p.name, n: left }), null);
      }
      return;
    }
  });

  chain('victoryProgress', function (prev, p) {
    const out = prev.call(this, p);
    const d = out.find(v => v.id === 'dominacao');
    const others = this.players.filter(q => q.alive && q.id !== p.id);
    const vas = others.filter(q => this.overlordOf(q.id) === p.id).length;
    if (d && vas) {
      const rivals = others.length - vas;
      d.pct = Math.max(0, Math.min(1, 1 - rivals / Math.max(1, this.players.length - 1)));
      d.text = PP.t('{n} rival(is) restante(s)', { n: rivals }) + ' · ' + PP.t('{n} vassalo(s)', { n: vas });
    }
    return out;
  });

  // Vassalos não vencem pela diplomacia
  chain('diplomaticStanding', function (prev, pid) {
    const r = prev.call(this, pid);
    if (this.isVassal(pid)) r.ok = false;
    return r;
  });

  chain('scoreExtras', function (prev, p) {
    return (prev ? prev.call(this, p) : 0) + 100 * this.vassalsOf(p.id).length;
  });

  // ------------------------------------------------------------ Conquistas
  const vAch = [
    { id: 'suserano', name: 'Suserano', desc: 'Tenha 2 vassalos ao mesmo tempo.', max: 2, v: (g, p) => g.vassalsOf(p.id).length },
    { id: 'anexacao', name: 'Anexação Pacífica', desc: 'Anexe um vassalo.', max: 1, v: (g, p) => p.stats.annexed || 0 },
  ];
  for (const a of vAch) if (!PP.ACHIEVEMENT[a.id]) { PP.ACHIEVEMENTS.push(a); PP.ACHIEVEMENT[a.id] = a; }

  // ------------------------------------------------------------ Ganchos
  PP.registerSystem('vassals', {
    init(g) { g.players.forEach(p => g.ensureVassal(p)); },
    load(g) { g.players.forEach(p => g.ensureVassal(p)); },
    // reparações e tributo dos vassalos, pagos no começo do turno de quem paga
    income(g, p, inc) {
      if (p.reparations.length) {
        for (const r of p.reparations) {
          const q = g.players[r.to];
          if (!q || !q.alive || g.atWar(p.id, r.to)) { r.left = 0; continue; }
          const pay = Math.min(p.stars, r.amount);
          p.stars -= pay; q.stars += pay;
          r.paid = (r.paid || 0) + pay;
          r.left--;
        }
        p.reparations = p.reparations.filter(r => r.left > 0);
      }
      const oid = g.overlordOf(p.id);
      if (oid != null) {
        const amt = Math.min(p.stars, Math.floor(Math.max(0, inc.stars) * g.tributeRate(oid)));
        if (amt > 0) {
          const O = g.players[oid];
          p.stars -= amt; O.stars += amt;
          p.stats.tributePaid = (p.stats.tributePaid || 0) + amt;
          O.stats.tributeReceived = (O.stats.tributeReceived || 0) + amt;
        }
        g.remember(p.id, oid, 'overlord');
      }
    },
    // os vassalos entram nas guerras do suserano (dos dois lados)
    war(g, a, b) {
      for (const [x, y] of [[a, b], [b, a]]) {
        for (const v of g.vassalsOf(x)) {
          if (v === y || g.atWar(v, y) || g.overlordOf(y) === v) continue;
          g.setRel(v, y, 'war');
          g.log(PP.t('{v} entra na guerra contra {y} ao lado de {x}, seu suserano.', { v: g.players[v].name, y: g.players[y].name, x: g.players[x].name }), null);
          g.refreshVision(v);
        }
      }
    },
    // a paz do suserano vale para os vassalos
    treaty(g, a, b, type) {
      if (type !== 'peace') return;
      for (const [x, y] of [[a, b], [b, a]]) {
        for (const v of g.vassalsOf(x)) {
          if (v === y || !g.atWar(v, y) || !g.players[v].met[y]) continue;
          g.setRel(v, y, 'peace', { truce: g.turn + PP.TRUCE_TURNS });
          g.log(PP.t('A paz de {x} vale para {v}: paz com {y}.', { x: g.players[x].name, v: g.players[v].name, y: g.players[y].name }), null);
        }
      }
    },
    // placar da guerra
    unitKilled(g, u, killer) {
      if (!killer) return;
      g.addWarPoints(killer.owner, u.owner, UN[u.type].character ? PP.WAR_POINTS.character : PP.WAR_POINTS.kill);
    },
    capture(g, c, old, p, how) {
      if (how || !old) return;
      g.addWarPoints(p.id, old.id, c.origCapital === old.id ? PP.WAR_POINTS.capital : PP.WAR_POINTS.city);
    },
    pillaged(g, u, t, what, victim) { if (victim >= 0) g.addWarPoints(u.owner, victim, PP.WAR_POINTS.pillage); },
    eliminated(g, p) {
      p.overlord = null;
      for (const q of g.players) if (q.alive && q.overlord === p.id) g.freeVassal(q.id, 'fall');
      for (const q of g.players) if (q.reparations) q.reparations = q.reparations.filter(r => r.to !== p.id);
    },
    vassal(g, vid, oid) { if (g.mark) g.mark(PP.t('{v} tornou-se vassalo de {o}', { v: g.players[vid].name, o: g.players[oid].name }), 'treaty'); },
    // a dominação por vassalagem depende de tempo: confere a cada rodada
    newRound(g) { if (g.players.some(p => p.alive && g.isVassal(p.id))) g.checkVictory(); },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
