/* Chamas de Vardren — diplomacia: estados de relação, tratados, alianças, comércio, tributo,
   guerra conjunta e memória diplomática. Estende as funções de paz/guerra do jogo original. */
(function (PP) {
  'use strict';

  // Tipos de lembrança: valor base e em quantos turnos o efeito some (decaimento linear)
  PP.MEMORY_KINDS = {
    declared_war:  { label: 'Declarou guerra contra nós', v: -20, decay: 40 },
    broke_treaty:  { label: 'Rompeu um tratado conosco', v: -30, decay: 80 },
    betrayed_ally: { label: 'Traiu nossa aliança', v: -45, decay: 120 },
    left_alliance: { label: 'Abandonou nossa aliança', v: -10, decay: 30 },
    helped:        { label: 'Lutou contra nossos inimigos', v: 3, decay: 30, cap: 15 },
    joint_war:     { label: 'Entrou na guerra ao nosso lado', v: 15, decay: 40 },
    trade:         { label: 'Comerciou conosco', v: 5, decay: 30, cap: 20 },
    route:         { label: 'Rota comercial ativa', v: 1, decay: 10, cap: 10 },
    captured_city: { label: 'Tomou uma cidade nossa', v: -10, decay: 50 },
    treaty_kept:   { label: 'Cumpriu um tratado', v: 10, decay: 50 },
    peace:         { label: 'Fez as pazes', v: 5, decay: 25 },
    alliance:      { label: 'Aliança firmada', v: 10, decay: 60 },
    tribute:       { label: 'Pagou tributo', v: 8, decay: 30, cap: 25 },
    extortion:     { label: 'Exigiu tributo de nós', v: -8, decay: 30 },
    refused:       { label: 'Recusou nosso pedido', v: -4, decay: 15, cap: -12 },
    killed_units:  { label: 'Matou nossas tropas', v: -2, decay: 25, cap: -25 },
    spy_caught:    { label: 'Espião pego em nosso território', v: -15, decay: 40 },
    traitor_seen:  { label: 'Traiu outra tribo', v: -8, decay: 50, cap: -24 },
    plunder:       { label: 'Saqueou ruínas sagradas', v: -6, decay: 30, cap: -18 },
    honored:       { label: 'Honrou um túmulo antigo', v: 4, decay: 30, cap: 12 },
  };

  PP.RELATIONS = {
    war:      { name: 'Guerra',          tag: 'bad' },
    peace:    { name: 'Paz',             tag: 'good' },
    nap:      { name: 'Não agressão',    tag: 'good' },
    alliance: { name: 'Aliança',         tag: 'gold' },
  };

  PP.PROPOSAL_TYPES = {
    peace:          'Tratado de paz',
    nap:            'Pacto de não agressão',
    alliance:       'Aliança',
    trade:          'Acordo comercial',
    tribute_demand: 'Exigência de tributo',
    joint_war:      'Guerra conjunta',
    call_to_arms:   'Chamado às armas',
  };

  PP.NAP_TURNS = 10;
  PP.LEASE_TURNS = 10;

  const D = {
    // ------------------------------------------------------------ Estado das relações
    ensureDiplo(p) {
      if (!p.memory) p.memory = {};
      if (!p.imports) p.imports = [];
      if (!p.lastAsk) p.lastAsk = {};
      if (!p.tribute) p.tribute = {};
      if (!p.proposals) p.proposals = [];
      if (p.reputation == null) p.reputation = 0;
      for (const k in p.rel) {
        const r = p.rel[k];
        if (!r.state) r.state = 'war';
        if (r.since == null) r.since = 0;
      }
    },

    relState(a, b) {
      if (a === b) return 'self';
      const r = this.players[a] && this.players[a].rel[b];
      return r ? r.state : 'war';
    },
    allied(a, b) { return a !== b && a >= 0 && b >= 0 && this.relState(a, b) === 'alliance'; },
    alliesOf(pid) {
      const out = [];
      for (const q of this.players) if (q.id !== pid && q.alive && this.allied(pid, q.id)) out.push(q.id);
      return out;
    },
    visionOwners(p) { return [p.id].concat(this.alliesOf(p.id)); },
    enemiesOf(pid) {
      return this.players.filter(q => q.id !== pid && q.alive && this.players[pid].met[q.id] && this.atWar(pid, q.id)).map(q => q.id);
    },

    setRel(a, b, state, extra) {
      const base = Object.assign({ state, since: this.turn }, extra || {});
      this.players[a].rel[b] = Object.assign({}, base);
      this.players[b].rel[a] = Object.assign({}, base);
      this.invalidate();
    },

    // ------------------------------------------------------------ Memória
    remember(obsId, subjId, kind, value, note) {
      if (obsId === subjId || obsId == null || subjId == null || obsId < 0 || subjId < 0) return;
      const obs = this.players[obsId];
      if (!obs || !obs.alive) return;
      const def = PP.MEMORY_KINDS[kind];
      let v = value != null ? value : def.v;
      // Qadir: o comércio melhora as relações em dobro
      if ((kind === 'trade' || kind === 'route') && (this.players[subjId].tribe === 'qadir' || obs.tribe === 'qadir')) v *= 2;
      const list = obs.memory[subjId] || (obs.memory[subjId] = []);
      const last = list[list.length - 1];
      if (last && last.k === kind && last.t === this.turn) last.v += v;
      else list.push({ k: kind, v, t: this.turn, n: note || undefined });
      if (list.length > 40) list.splice(0, list.length - 40);
    },

    memoryValue(e) {
      const def = PP.MEMORY_KINDS[e.k] || { decay: 30 };
      const age = this.turn - e.t;
      return e.v * Math.max(0, 1 - age / def.decay);
    },

    memorySummary(obsId, subjId) {
      const list = (this.players[obsId].memory || {})[subjId] || [];
      const agg = {};
      for (const e of list) {
        const val = this.memoryValue(e);
        if (Math.abs(val) < 0.5) continue;
        agg[e.k] = (agg[e.k] || 0) + val;
      }
      const out = [];
      for (const k in agg) {
        const def = PP.MEMORY_KINDS[k];
        let v = agg[k];
        if (def && def.cap != null) v = def.cap < 0 ? Math.max(def.cap, v) : Math.min(def.cap, v);
        out.push({ kind: k, label: def ? def.label : k, value: Math.round(v) });
      }
      return out.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    },

    opinion(obsId, subjId) {
      if (obsId === subjId) return 100;
      let s = 0;
      for (const m of this.memorySummary(obsId, subjId)) s += m.value;
      const subj = this.players[subjId];
      s += (subj.reputation || 0) * 4;
      const st = this.relState(obsId, subjId);
      if (st === 'alliance') s += 15;
      else if (st === 'nap') s += 5;
      else if (st === 'war') s -= 10;
      // inimigo em comum aproxima
      for (const q of this.players) {
        if (q.id === obsId || q.id === subjId || !q.alive) continue;
        if (this.atWar(obsId, q.id) && this.atWar(subjId, q.id) && this.players[obsId].met[q.id] && subj.met[q.id]) { s += 8; break; }
      }
      return Math.max(-100, Math.min(100, Math.round(s)));
    },

    opinionLabel(v) {
      if (v <= -40) return { name: 'Hostil', tag: 'bad' };
      if (v <= -12) return { name: 'Desconfiada', tag: 'bad' };
      if (v < 12) return { name: 'Neutra', tag: '' };
      if (v < 35) return { name: 'Cordial', tag: 'good' };
      return { name: 'Amigável', tag: 'good' };
    },

    // ------------------------------------------------------------ Propostas
    canPropose(from, to, type, data) {
      const a = this.players[from], b = this.players[to];
      const bad = reason => ({ ok: false, reason });
      if (!a || !b || !a.alive || !b.alive || from === to) return bad('Inválido');
      if (!a.met[to]) return bad('Ainda não se conhecem');
      const st = this.relState(from, to);
      const locked = this.opts.diploLockUntil && this.turn < this.opts.diploLockUntil;
      switch (type) {
        case 'peace':
          if (st !== 'war') return bad('Não estão em guerra');
          if (locked) return bad(`Guerra total até o turno ${this.opts.diploLockUntil}`);
          return { ok: true };
        case 'nap':
          if (st === 'war') return bad('Faça a paz primeiro');
          if (st === 'nap' || st === 'alliance') return bad('Já existe um tratado');
          return { ok: true };
        case 'alliance': {
          if (st === 'war') return bad('Faça a paz primeiro');
          if (st === 'alliance') return bad('Já são aliados');
          for (const ally of this.alliesOf(from)) if (this.atWar(to, ally)) return bad('Está em guerra com um aliado seu');
          for (const ally of this.alliesOf(to)) if (this.atWar(from, ally)) return bad('Você está em guerra com um aliado dele');
          return { ok: true };
        }
        case 'trade': {
          if (st === 'war') return bad('Não há comércio em guerra');
          const chk = this.tradeValid(from, to, data);
          return chk;
        }
        case 'tribute_demand':
          if (!data || !(data.amount > 0)) return bad('Valor inválido');
          if (b.stars < data.amount) return bad('Eles não têm estrelas suficientes');
          return { ok: true };
        case 'joint_war': {
          const t = data && this.players[data.target];
          if (!t || !t.alive || data.target === from || data.target === to) return bad('Alvo inválido');
          if (!a.met[data.target] || !b.met[data.target]) return bad('Os dois precisam conhecer o alvo');
          if (st === 'war') return bad('Vocês estão em guerra');
          if (this.atWar(to, data.target)) return bad('Eles já estão em guerra com o alvo');
          if (this.allied(to, data.target)) return bad('O alvo é aliado deles');
          return { ok: true };
        }
        case 'call_to_arms':
          return { ok: true };
      }
      return bad('Tipo desconhecido');
    },

    // Envia uma proposta: humanos recebem na fila; a IA decide na hora
    propose(from, to, type, data) {
      const chk = this.canPropose(from, to, type, data);
      if (!chk.ok) return 'invalid';
      const a = this.players[from], b = this.players[to];
      a.lastAsk[to] = a.lastAsk[to] || {};
      if (type !== 'call_to_arms' && a.lastAsk[to][type] === this.turn) return 'wait';
      a.lastAsk[to][type] = this.turn;
      if (type === 'peace') a.lastPeaceAsk[to] = this.turn;
      if (b.human) {
        if (!b.proposals.some(pr => pr.from === from && (pr.type || 'peace') === type)) {
          b.proposals.push({ id: this.nextId++, type, from, turn: this.turn, data: data || null });
        }
        this.emit('proposal', { from, to, type });
        return 'pending';
      }
      const ok = PP.AI && PP.AI.evaluateProposal ? PP.AI.evaluateProposal(this, b, a, type, data) : false;
      if (ok) { this.executeProposal(to, from, type, data); return 'accepted'; }
      this.rejectProposal(to, from, type, data);
      return 'rejected';
    },

    // Compatibilidade: a proposta de paz original continua existindo
    proposePeace(from, to) {
      const a = this.players[from];
      if (a && a.lastPeaceAsk[to] === this.turn) return 'wait';
      return this.propose(from, to, 'peace');
    },

    executeProposal(acceptor, proposer, type, data) {
      switch (type) {
        case 'peace': this.makePeace(proposer, acceptor); break;
        case 'nap': this.signNAP(proposer, acceptor, (data && data.turns) || PP.NAP_TURNS); break;
        case 'alliance': this.formAlliance(proposer, acceptor); break;
        case 'trade': this.executeTrade(proposer, acceptor, data); break;
        case 'tribute_demand': this.payTribute(acceptor, proposer, data.amount, true); break;
        case 'joint_war': this.joinWar(acceptor, data.target, proposer); this.joinWar(proposer, data.target, acceptor); break;
        case 'call_to_arms': this.joinWar(acceptor, data.target, proposer); break;
      }
    },

    rejectProposal(acceptor, proposer, type, data) {
      const a = this.players[acceptor], b = this.players[proposer];
      this.log(`${a.name} recusou ${(PP.PROPOSAL_TYPES[type] || 'a proposta').toLowerCase()} de ${b.name}.`, [acceptor, proposer]);
      if (type === 'alliance' || type === 'call_to_arms' || type === 'joint_war') this.remember(proposer, acceptor, 'refused');
      if (type === 'tribute_demand') {
        this.remember(proposer, acceptor, 'refused');
        this.emit('diplomacy', { type: 'tribute_refused', a: acceptor, b: proposer });
      }
      this.emit('diplomacy', { type: 'rejected', a: acceptor, b: proposer, what: type });
    },

    // p responde uma proposta da fila. key = id da proposta ou índice do jogador proponente (compatível)
    respondProposal(p, key, accept) {
      let i = p.proposals.findIndex(pr => pr.id != null && pr.id === key);
      if (i < 0) i = p.proposals.findIndex(pr => pr.from === key);
      if (i < 0) return false;
      const pr = p.proposals.splice(i, 1)[0];
      const type = pr.type || 'peace';
      const still = this.canPropose(pr.from, p.id, type, pr.data);
      if (accept && still.ok) this.executeProposal(p.id, pr.from, type, pr.data);
      else this.rejectProposal(p.id, pr.from, type, pr.data);
      return true;
    },

    expireProposals(p) {
      p.proposals = p.proposals.filter(pr => {
        const type = pr.type || 'peace';
        if (!this.players[pr.from] || !this.players[pr.from].alive) return false;
        if (this.turn - pr.turn > 1) return false;
        return this.canPropose(pr.from, p.id, type, pr.data).ok;
      });
    },

    // ------------------------------------------------------------ Tratados
    makePeace(a, b) {
      this.setRel(a, b, 'peace');
      this.remember(a, b, 'peace'); this.remember(b, a, 'peace');
      this.log(`${this.players[a].name} e ${this.players[b].name} assinaram a paz.`, null);
      this.hook('treaty', a, b, 'peace');
      this.emit('diplomacy', { type: 'peace', a, b });
    },

    signNAP(a, b, turns) {
      this.setRel(a, b, 'nap', { until: this.turn + turns });
      this.log(`${this.players[a].name} e ${this.players[b].name} firmaram um pacto de não agressão por ${turns} turnos.`, null);
      this.hook('treaty', a, b, 'nap');
      this.emit('diplomacy', { type: 'nap', a, b });
    },

    formAlliance(a, b) {
      this.setRel(a, b, 'alliance');
      this.remember(a, b, 'alliance'); this.remember(b, a, 'alliance');
      this.log(`${this.players[a].name} e ${this.players[b].name} formaram uma aliança!`, null);
      this.hook('treaty', a, b, 'alliance');
      this.emit('diplomacy', { type: 'alliance', a, b });
      this.refreshVision(a); this.refreshVision(b);
    },

    leaveAlliance(a, b) {
      if (!this.allied(a, b)) return false;
      this.setRel(a, b, 'peace');
      this.remember(b, a, 'left_alliance');
      this.log(`${this.players[a].name} encerrou a aliança com ${this.players[b].name}.`, null);
      this.emit('diplomacy', { type: 'left', a, b });
      this.refreshVision(a); this.refreshVision(b);
      return true;
    },

    // Declara guerra. Romper pacto ou aliança custa reputação com o mundo inteiro.
    declareWar(a, b) {
      if (a === b || !this.atPeace(a, b)) return false;
      const st = this.relState(a, b);
      const A = this.players[a], B = this.players[b];
      let kind = 'declared_war', rep = 1;
      if (st === 'nap') { kind = 'broke_treaty'; rep = 2; }
      if (st === 'alliance') { kind = 'betrayed_ally'; rep = 3; }
      this.setRel(a, b, 'war');
      A.reputation = Math.max(-10, (A.reputation || 0) - rep);
      this.remember(b, a, kind);
      if (kind !== 'declared_war') {
        for (const q of this.players) if (q.alive && q.id !== a && q.id !== b && q.met[a]) this.remember(q.id, a, 'traitor_seen');
      }
      const verb = kind === 'betrayed_ally' ? 'traiu a aliança e declarou guerra a' : kind === 'broke_treaty' ? 'rompeu o pacto e declarou guerra a' : 'declarou guerra a';
      this.log(`${A.name} ${verb} ${B.name}!`, null);
      this.hook('war', a, b, kind);
      this.emit('diplomacy', { type: 'war', a, b, kind });
      // aliados da vítima recebem um chamado às armas
      for (const ally of this.alliesOf(b)) {
        if (ally === a || this.atWar(ally, a)) continue;
        this.propose(b, ally, 'call_to_arms', { target: a });
      }
      this.refreshVision(a); this.refreshVision(b);
      return true;
    },

    // helper entra na guerra contra target a pedido de ally
    joinWar(helper, target, ally) {
      if (helper === target || this.atWar(helper, target)) { if (ally != null) this.remember(ally, helper, 'joint_war'); return; }
      if (this.allied(helper, target)) return;
      this.declareWar(helper, target);
      if (ally != null) this.remember(ally, helper, 'joint_war');
    },

    // ------------------------------------------------------------ Comércio entre tribos
    // deal = { give: {stars, sci, iron, horses}, get: {...} } do ponto de vista do proponente
    tradeValid(from, to, deal) {
      if (!deal || !deal.give || !deal.get) return { ok: false, reason: 'Acordo vazio' };
      const a = this.players[from], b = this.players[to];
      const side = (p, items) => {
        if ((items.stars || 0) > p.stars) return 'estrelas insuficientes';
        if ((items.sci || 0) > p.science) return 'ciência insuficiente';
        for (const r of ['iron', 'horses']) if (items[r] && !this.ownsStrategic(p, r)) return `não possui ${PP.STRATEGIC[r].name} próprio`;
        return null;
      };
      const e1 = side(a, deal.give), e2 = side(b, deal.get);
      if (e1) return { ok: false, reason: 'Você: ' + e1 };
      if (e2) return { ok: false, reason: 'Eles: ' + e2 };
      const empty = o => !(o.stars > 0 || o.sci > 0 || o.iron || o.horses);
      if (empty(deal.give) && empty(deal.get)) return { ok: false, reason: 'Acordo vazio' };
      return { ok: true };
    },

    ownsStrategic(p, key) {
      const acc = this.resourceAccess ? this.resourceAccess(p) : null;
      return acc ? (acc.own[key] || 0) > 0 : this.hasStrategic(p, key);
    },

    executeTrade(from, to, deal) {
      const a = this.players[from], b = this.players[to];
      const move = (src, dst, items) => {
        const st = Math.min(src.stars, items.stars || 0), sc = Math.min(src.science, items.sci || 0);
        src.stars -= st; dst.stars += st; src.science -= sc; dst.science += sc;
        for (const r of ['iron', 'horses']) if (items[r]) dst.imports.push({ res: r, from: src.id, until: this.turn + PP.LEASE_TURNS });
      };
      move(a, b, deal.give);
      move(b, a, deal.get);
      this.remember(from, to, 'trade'); this.remember(to, from, 'trade');
      this.invalidate();
      this.log(`${a.name} e ${b.name} fecharam um acordo comercial.`, [from, to]);
      this.hook('tradeDeal', from, to, deal);
      this.emit('diplomacy', { type: 'trade', a: from, b: to });
    },

    // ------------------------------------------------------------ Tributo
    payTribute(from, to, amount, demanded) {
      const a = this.players[from], b = this.players[to];
      amount = Math.max(0, Math.min(a.stars, Math.floor(amount)));
      if (!amount) return false;
      a.stars -= amount; b.stars += amount;
      this.remember(to, from, 'tribute', Math.min(20, Math.round(amount * 0.8)));
      if (demanded) this.remember(from, to, 'extortion');
      b.tribute = b.tribute || {};
      b.tribute[from] = this.turn;
      this.log(`${a.name} pagou ${amount}★ de tributo a ${b.name}.`, [from, to]);
      this.hook('tribute', from, to, amount);
      this.emit('diplomacy', { type: 'tribute', a: from, b: to, amount });
      return true;
    },

    // Custo de tecnologia reduzido por aliados (compartilhamento) e difusão Han-Lu
    techCostMult(p, id) {
      let m = 1;
      if (this.alliesOf(p.id).some(a => this.players[a].techs[id])) m *= 0.8;
      if (p.tribe === 'hanlu' && this.players.some(q => q.id !== p.id && q.alive && p.met[q.id] && q.techs[id])) m *= 0.8;
      if (this.cities.some(c => c.owner === p.id && c.spec === 'ciencia' && c.buildings.academy_hall)) m *= 0.95;
      if (this.eventTechMult) m *= this.eventTechMult();
      return m;
    },

    // Acesso a recursos estratégicos alugados em acordos
    importsActive(p) {
      return (p.imports || []).filter(im => im.until >= this.turn && this.players[im.from] && this.players[im.from].alive && !this.atWar(p.id, im.from));
    },
  };

  Object.assign(PP.Game.prototype, D);

  PP.registerSystem('diplomacy', {
    init(g) { g.players.forEach(p => g.ensureDiplo(p)); },
    load(g) { g.players.forEach(p => g.ensureDiplo(p)); },
    beforeTurn(g, p) { g.expireProposals(p); },
    newRound(g) {
      for (const p of g.players) {
        if (!p.alive) continue;
        p.imports = p.imports.filter(im => im.until >= g.turn);
        for (const q of g.players) {
          if (q.id <= p.id || !q.alive) continue;
          const r = p.rel[q.id];
          if (!r) continue;
          if (r.state === 'nap' && r.until != null && g.turn >= r.until) {
            g.setRel(p.id, q.id, 'peace');
            g.remember(p.id, q.id, 'treaty_kept'); g.remember(q.id, p.id, 'treaty_kept');
            p.reputation = Math.min(3, (p.reputation || 0) + 1);
            q.reputation = Math.min(3, (q.reputation || 0) + 1);
            g.log(`O pacto de não agressão entre ${p.name} e ${q.name} terminou e foi cumprido.`, null);
            g.emit('diplomacy', { type: 'nap_end', a: p.id, b: q.id });
          } else if (r.state === 'alliance' && (g.turn - r.since) > 0 && (g.turn - r.since) % 10 === 0) {
            g.remember(p.id, q.id, 'treaty_kept', 5); g.remember(q.id, p.id, 'treaty_kept', 5);
          }
        }
      }
    },
    capture(g, city, old, p) { if (old) g.remember(old.id, p.id, 'captured_city'); },
    unitKilled(g, u, killer) {
      if (!killer) return;
      g.remember(u.owner, killer.owner, 'killed_units');
      for (const q of g.players) {
        if (!q.alive || q.id === killer.owner || q.id === u.owner) continue;
        if (g.atWar(q.id, u.owner) && !g.atWar(q.id, killer.owner) && q.met[killer.owner]) g.remember(q.id, killer.owner, 'helped');
      }
    },
    eliminated(g, p) {
      for (const q of g.players) q.proposals = (q.proposals || []).filter(pr => pr.from !== p.id);
    },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
