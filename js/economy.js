/* Politopia+ — economia: renda das cidades, conexões com a capital, recursos (estratégicos e luxos),
   rotas comerciais, saque e reparo de infraestrutura, fortificações e logística (abastecimento).
   A renda e as conexões vieram do motor original e foram estendidas aqui. */
(function (PP) {
  'use strict';
  const UN = PP.UNITS, DIRS = PP.DIRS;
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  const E = {
    // ============================================================ Conexões (do motor original)
    updateConnections(p) {
      const mine = this.citiesOf(p.id);
      const cap = p.capital ? this.cityMap[p.capital] : null;
      if (!cap || cap.owner !== p.id) { mine.forEach(c => { c.connected = false; }); return; }
      const W = this.W, seen = new Uint8Array(W * this.H);
      const start = cap.y * W + cap.x;
      seen[start] = 1;
      const q = [start];
      while (q.length) {
        const i = q.pop(), t = this.tiles[i];
        const tWater = this.isWater(t);
        const tPort = t.imp === 'port' && !t.pillaged;
        for (const d of DIRS) {
          const x = t.x + d[0], y = t.y + d[1];
          if (!this.inb(x, y)) continue;
          const j = y * W + x;
          if (seen[j]) continue;
          const n = this.tiles[j];
          const nWater = this.isWater(n);
          let ok = false;
          if (n.imp === 'port') ok = !n.pillaged;
          else if (!nWater && (n.road || n.city)) ok = !tWater || tPort;
          else if (nWater) ok = tWater;
          if (ok) { seen[j] = 1; q.push(j); }
        }
      }
      for (const c of mine) {
        if (c === cap) continue;
        const conn = !!seen[c.y * W + c.x];
        if (conn && !c.connected) {
          c.connected = true;
          this.addPop(c, 1); this.addPop(cap, 1);
          this.log(`${c.name} foi conectada à capital!`, p.id);
          this.emit('connected', { city: c });
        }
        c.connected = conn;
      }
    },

    // ============================================================ Renda
    tileIncome(t) {
      if (t.pillaged) return 0;
      if (t.imp === 'gemmine' || t.imp === 'plantation') return 2;
      if (t.imp === 'whalestation') return 1;
      if (t.imp === 'market') return this.marketValue(t);
      return 0;
    },

    // Casas marítimas úteis de uma cidade (portos, peixes e baleias) — usadas pela especialização portuária
    seaTiles(c) {
      let n = 0;
      for (const t of this.tiles) {
        if (t.cityId !== c.id || t.owner !== c.owner) continue;
        if ((t.imp === 'port' || t.imp === 'whalestation') && !t.pillaged) n++;
        else if (t.res === 'fish' || t.res === 'whale') n++;
      }
      return n;
    },

    cityIncome(c, tileIncome) {
      const p = this.players[c.owner];
      const notes = [];
      // --- base original
      let stars = c.level + (c.capital ? 1 : 0) + c.workshop + c.parks + (c.buildings.bank ? 3 : 0);
      if (p.tribe === 'qadir') stars += c.capital ? 2 : c.connected ? 1 : 0;
      if (c.connected && !c.capital) stars += this.has(p, 'comercio') ? 2 : 1;
      if (tileIncome == null) {
        tileIncome = 0;
        for (const t of this.tiles) if (t.cityId === c.id && t.owner === c.owner) tileIncome += this.tileIncome(t);
      }
      stars += tileIncome;
      let sci = 1 + Math.floor(c.level / 2) + (c.capital ? 1 : 0) + c.academy +
        (c.buildings.library ? 2 : 0) + (c.buildings.university ? 3 : 0);
      // --- construções exclusivas de especialização (só valem com a especialização ativa; somam depois do %)
      let specStars = 0, specSci = 0;
      for (const id in c.buildings) {
        const b = PP.BUILDINGS[id];
        if (!b || !b.spec || !this.specActive(c, id)) continue;
        if (b.gold) specStars += b.gold;
        if (b.sci) specSci += b.sci;
      }
      // --- marcos e metrópole
      const m = c.milestones || {};
      if (m.m_observatory) sci += 2;
      if (m.m_university) sci += 4;
      if (m.m_market) stars += 2;
      if (m.m_bourse) stars += 3;
      if (c.metropolis) { stars += 2; sci += 2; notes.push('Metrópole +2★ +2⚗'); }
      // --- especialização
      switch (c.spec) {
        case 'comercio': {
          const add = Math.round(stars * 0.3);
          stars += add; sci -= 1;
          notes.push(`Comercial +${add}★ −1⚗`);
          break;
        }
        case 'ciencia': {
          sci += (c.buildings.library ? 1 : 0) + (c.buildings.university ? 1 : 0);
          const add = Math.max(2, Math.round(sci * 0.25));
          const cut = Math.round(stars * 0.3);
          sci += add; stars -= cut;
          notes.push(`Científica +${add}⚗ −${cut}★`);
          break;
        }
        case 'militar': {
          const cut = Math.ceil(sci / 2);
          sci -= cut;
          notes.push(`Militar −${cut}⚗`);
          break;
        }
        case 'agricola': stars -= 1; sci -= 1; notes.push('Agrícola −1★ −1⚗'); break;
        case 'porto': {
          const sea = this.seaTiles(c);
          const add = Math.min(3, sea);
          if (add) { stars += add; notes.push(`Portuária +${add}★`); }
          if (this.specActive(c, 'customs')) { const a2 = Math.min(4, sea); stars += a2; if (a2) notes.push(`Alfândega +${a2}★`); }
          break;
        }
      }
      stars += specStars; sci += specSci;
      const res = { stars, sci, notes };
      if (this.eventCityIncome) this.eventCityIncome(c, res);
      // --- ocupação, resistência e sabotagem
      const mult = this.cityYieldMult ? this.cityYieldMult(c) : 1;
      if (mult < 1) {
        res.stars = Math.floor(res.stars * mult);
        res.sci = Math.floor(res.sci * mult);
        notes.push(`Produção ×${String(mult).replace('.', ',')}`);
      }
      res.stars = Math.max(0, res.stars);
      res.sci = Math.max(0, res.sci);
      return res;
    },

    income(p) {
      const byCity = {};
      let ports = 0;
      let lmStars = 0, lmSci = 0;
      for (const t of this.tiles) {
        if (t.shrine != null && t.shrine >= 0 && t.shrine === p.id && (t.owner === -1 || t.owner === p.id)) lmSci += 1;
        if (t.owner !== p.id) continue;
        if (t.imp === 'port' && !t.pillaged) ports++;
        const v = this.tileIncome(t);
        if (v) byCity[t.cityId] = (byCity[t.cityId] || 0) + v;
        if (t.landmark === 'estreito') lmStars += 2;
        else if (t.landmark === 'mina_abandonada') lmStars += 1;
        else if (t.landmark === 'ruina_imperial') lmSci += 2;
      }
      let stars = 0, sci = 0;
      const lines = [];
      for (const c of this.cities) {
        if (c.owner !== p.id) continue;
        const ci = this.cityIncome(c, byCity[c.id] || 0);
        stars += ci.stars; sci += ci.sci;
      }
      lines.push({ label: 'Cidades', stars, sci });
      let ws = 0, wc = 0;
      if (this.wonders.pyramids === p.id) ws += 3;
      if (this.wonders.colossus === p.id) ws += Math.min(10, ports);
      if (this.wonders.great_library === p.id) wc += 4;
      if (this.wonders.oracle === p.id) wc += 2;
      if (ws || wc) lines.push({ label: 'Maravilhas', stars: ws, sci: wc });
      stars += ws; sci += wc;
      if (lmStars || lmSci) lines.push({ label: 'Pontos estratégicos e santuários', stars: lmStars, sci: lmSci });
      stars += lmStars; sci += lmSci;
      const tr = this.routeIncome(p);
      if (tr.stars || tr.sci) lines.push({ label: 'Rotas comerciais', stars: tr.stars, sci: tr.sci });
      stars += tr.stars; sci += tr.sci;
      // bônus percentuais do império (marcos de nível 10)
      const mine = this.citiesOf(p.id);
      if (mine.some(c => c.milestones && c.milestones.m_freeport)) { const a = Math.round(stars * 0.1); stars += a; if (a) lines.push({ label: 'Capital Mercantil', stars: a, sci: 0 }); }
      if (mine.some(c => c.milestones && c.milestones.m_invisible)) { const a = Math.round(sci * 0.1); sci += a; if (a) lines.push({ label: 'Colégio Invisível', stars: 0, sci: a }); }
      const res = { stars, sci, trade: tr.stars, lines };
      if (this.eventIncome) this.eventIncome(p, res);
      if (!p.human) {
        const d = PP.DIFFICULTY[this.opts.difficulty] || PP.DIFFICULTY.normal;
        res.stars += d.stars; res.sci += d.sci;
        if (d.stars || d.sci) res.lines.push({ label: 'Dificuldade', stars: d.stars, sci: d.sci });
      }
      res.stars = Math.max(0, Math.round(res.stars));
      res.sci = Math.max(0, Math.round(res.sci));
      return res;
    },

    // ============================================================ Recursos
    // Contagem de fontes por recurso; own = só as próprias (as importadas não podem ser revendidas)
    resourceAccess(p) {
      const key = 'res' + p.id;
      if (this.cache[key]) return this.cache[key];
      const own = { iron: 0, horses: 0, gems: 0, spices: 0, whale: 0 };
      for (const t of this.tiles) {
        if (t.owner !== p.id) continue;
        if (t.landmark === 'mina_abandonada') own.iron++;
        if (!t.imp || t.pillaged) continue;
        if (t.imp === 'mine') own.iron++;
        else if (t.imp === 'pasture') own.horses++;
        else if (t.imp === 'gemmine') own.gems++;
        else if (t.imp === 'plantation') own.spices++;
        else if (t.imp === 'whalestation') own.whale++;
      }
      const acc = Object.assign({}, own, { own, imported: { iron: 0, horses: 0 } });
      if (this.importsActive) {
        for (const im of this.importsActive(p)) { acc[im.res] = (acc[im.res] || 0) + 1; acc.imported[im.res]++; }
      }
      this.cache[key] = acc;
      return acc;
    },

    luxuryCount(p) {
      const acc = this.resourceAccess(p);
      let n = 0;
      for (const k in PP.LUXURIES) if (acc[k] > 0) n++;
      return n;
    },

    // Fontes extras de ferro/cavalos barateiam as unidades que dependem deles
    resourceDiscount(p, type) {
      const d = UN[type];
      if (!d) return 0;
      const acc = this.resourceAccess(p);
      if (d.needs) return Math.max(0, Math.min(2, (acc[d.needs] || 0) - 1));
      if (d.mounted) return Math.max(0, Math.min(1, (acc.horses || 0) - 1));
      return 0;
    },

    // Gemas barateiam (−10% por garimpo, máx. 30%); cada maravilha que a tribo já tem encarece a próxima em 10★
    wonderCost(p, wid) {
      const base = PP.WONDERS[wid].cost;
      const gems = Math.min(3, this.resourceAccess(p).gems || 0);
      let owned = 0;
      for (const w in this.wonders) if (this.wonders[w] === p.id) owned++;
      return Math.max(1, Math.round(base * (1 - 0.1 * gems)) + owned * 10);
    },

    // ============================================================ Rotas comerciais
    ensureRoutes() { if (!this.routes) this.routes = []; },

    routeSlots(c) {
      const p = this.players[c.owner];
      if (!this.has(p, 'estradas') && !this.has(p, 'navegacao')) return 0;
      let n = 1;
      if (c.spec === 'comercio') n++;
      if (this.specActive(c, 'guild')) n++;
      if (this.specActive(c, 'customs')) n++;
      if (c.milestones && c.milestones.m_bourse) n++;
      if (p.tribe === 'qadir' && c.capital) n++;
      return n;
    },

    routesOf(c) {
      this.ensureRoutes();
      return this.routes.filter(r => r.a === c.id || (r.b === c.id && r.kind === 'domestic'));
    },

    // Casas bloqueadas para o comércio de um jogador: unidades inimigas (em guerra) param as caravanas
    tradeBlockGrid(pid) {
      const key = 'tb' + pid;
      if (this.cache[key]) return this.cache[key];
      const g = new Uint8Array(this.W * this.H);
      for (const u of this.units) {
        if (UN[u.type].spy || !this.atWar(pid, u.owner)) continue;
        g[u.y * this.W + u.x] = 1;
      }
      this.cache[key] = g;
      return g;
    },

    // Busca em largura pela rede de estradas, cidades, portos e mares a partir de uma cidade
    tradeSearch(pid, from, maxLen) {
      const W = this.W, N = W * this.H, p = this.players[pid];
      const nl = this.navalLevel(p);
      const dist = new Int16Array(N).fill(-1);
      const prev = new Int32Array(N).fill(-1);
      const block = this.tradeBlockGrid(pid);
      const start = from.y * W + from.x;
      dist[start] = 0;
      const q = [start];
      let head = 0;
      while (head < q.length) {
        const i = q[head++];
        if (dist[i] >= maxLen) continue;
        const t = this.tiles[i];
        const tW = this.isWater(t);
        const tPort = t.imp === 'port' && !t.pillaged;
        for (const d of DIRS) {
          const x = t.x + d[0], y = t.y + d[1];
          if (!this.inb(x, y)) continue;
          const j = y * W + x;
          if (dist[j] >= 0 || block[j]) continue;
          const n = this.tiles[j];
          const nW = this.isWater(n);
          let ok = false;
          if (n.imp === 'port') ok = !n.pillaged && nl >= 1;
          else if (!nW && (n.road || n.city)) ok = !tW || tPort;
          else if (nW) ok = tW && nl >= 1 && (n.terrain !== 'ocean' || nl >= 2);
          if (!ok) continue;
          if (n.owner >= 0 && n.owner !== pid && this.atWar(pid, n.owner)) continue;
          dist[j] = dist[i] + 1; prev[j] = i;
          q.push(j);
        }
      }
      return { dist, prev };
    },

    tracePath(search, to) {
      const path = [];
      for (let i = to.y * this.W + to.x; i >= 0; i = search.prev[i]) path.unshift(i);
      return path;
    },

    routeKindFor(pid, c) { return c.owner === pid ? 'domestic' : 'foreign'; },

    routeCheck(p, from, to, search) {
      const r = { ok: false, reason: '', cost: 0 };
      this.ensureRoutes();
      if (!from || !to || from.owner !== p.id || from === to) { r.reason = 'Inválido'; return r; }
      const kind = this.routeKindFor(p.id, to);
      r.kind = kind;
      r.cost = PP.ROUTES.cost[kind];
      if (kind === 'foreign') {
        const q = this.players[to.owner];
        if (!p.met[q.id]) { r.reason = 'Tribo desconhecida'; return r; }
        if (this.atWar(p.id, q.id)) { r.reason = 'Em guerra'; return r; }
        if (!this.has(p, 'comercio')) { r.reason = 'Requer Comércio'; r.locked = true; return r; }
      }
      if (!p.explored[to.y * this.W + to.x]) { r.reason = 'Cidade não explorada'; return r; }
      if (cheb(from, to) < PP.ROUTES.minDist) { r.reason = 'Muito perto'; return r; }
      if (this.routes.some(x => (x.a === from.id && x.b === to.id) || (x.a === to.id && x.b === from.id))) { r.reason = 'Rota já existe'; return r; }
      if (this.routesOf(from).length >= this.routeSlots(from)) { r.reason = 'Sem vagas de rota nesta cidade'; return r; }
      if (kind === 'domestic' && this.routesOf(to).length >= this.routeSlots(to)) { r.reason = `Sem vagas em ${to.name}`; return r; }
      search = search || this.tradeSearch(p.id, from, PP.ROUTES.maxLen);
      const d = search.dist[to.y * this.W + to.x];
      if (d < 0) { r.reason = 'Sem caminho por estrada ou mar'; return r; }
      r.len = d;
      r.path = this.tracePath(search, to);
      r.sea = r.path.some(i => this.isWater(this.tiles[i]));
      if (p.stars < r.cost) { r.reason = 'Faltam estrelas'; return r; }
      r.ok = true;
      return r;
    },

    // Destinos possíveis a partir de uma cidade (uma única busca)
    routeCandidates(p, from) {
      const search = this.tradeSearch(p.id, from, PP.ROUTES.maxLen);
      const out = [];
      for (const c of this.cities) {
        if (c === from) continue;
        if (c.owner !== p.id && !p.met[c.owner]) continue;
        const chk = this.routeCheck(p, from, c, search);
        if (chk.ok || chk.len != null || chk.reason === 'Faltam estrelas') {
          const preview = chk.len != null ? this.routeYield({ a: from.id, b: c.id, owner: p.id, kind: chk.kind, len: chk.len, sea: chk.sea, active: true }) : null;
          out.push({ city: c, check: chk, yield: preview });
        }
      }
      return out.sort((x, y) => (y.check.ok - x.check.ok) || ((y.yield ? y.yield.stars : 0) - (x.yield ? x.yield.stars : 0)));
    },

    createRoute(p, from, to) {
      if (this.over || p.id !== this.current) return null;
      const chk = this.routeCheck(p, from, to);
      if (!chk.ok) return null;
      p.stars -= chk.cost;
      const r = { id: this.nextId++, a: from.id, b: to.id, owner: p.id, partner: to.owner, kind: chk.kind, len: chk.len,
        sea: chk.sea, path: chk.path, active: true, threat: false, since: this.turn, age: 0, rep: false };
      this.routes.push(r);
      if (r.kind === 'foreign') {
        this.remember(to.owner, p.id, 'trade'); this.remember(p.id, to.owner, 'trade');
        this.log(`${p.name} abriu uma rota comercial entre ${from.name} e ${to.name} (${this.players[to.owner].name}).`, [p.id, to.owner]);
      } else this.log(`Rota comercial aberta entre ${from.name} e ${to.name}.`, p.id);
      this.hook('route', r);
      this.emit('route', { route: r, player: p.id });
      return r;
    },

    cancelRoute(r, reason) {
      this.ensureRoutes();
      const i = this.routes.indexOf(r);
      if (i < 0) return false;
      this.routes.splice(i, 1);
      const A = this.cityMap[r.a], B = this.cityMap[r.b];
      if (reason && A && B) this.log(`A rota entre ${A.name} e ${B.name} foi encerrada: ${reason}.`, [r.owner, r.partner]);
      this.emit('route', { route: r, cancelled: true, reason });
      return true;
    },

    // Revalida as rotas do jogador no início do turno dele
    validateRoutes(p) {
      this.ensureRoutes();
      const zoc = this.zocGrid(p.id);
      for (const r of this.routes.slice()) {
        if (r.owner !== p.id) continue;
        const A = this.cityMap[r.a], B = this.cityMap[r.b];
        if (!A || !B || A.owner !== p.id) { this.cancelRoute(r, 'a cidade de origem mudou de dono'); continue; }
        if (r.kind === 'domestic' && B.owner !== p.id) { this.cancelRoute(r, `${B.name} mudou de dono`); continue; }
        if (r.kind === 'foreign' && (B.owner === p.id || B.owner !== r.partner)) { this.cancelRoute(r, `${B.name} mudou de dono`); continue; }
        if (r.kind === 'foreign' && this.atWar(p.id, B.owner)) { this.cancelRoute(r, 'guerra'); continue; }
        const search = this.tradeSearch(p.id, A, PP.ROUTES.maxLen);
        const d = search.dist[B.y * this.W + B.x];
        const was = r.active;
        if (d < 0) {
          r.active = false; r.threat = false;
          if (was) {
            this.log(`A rota entre ${A.name} e ${B.name} foi interrompida (estrada cortada ou bloqueio).`, p.id);
            this.emit('routeBlocked', { route: r });
          }
          continue;
        }
        r.active = true;
        r.len = d;
        r.path = this.tracePath(search, B);
        r.sea = r.path.some(i => this.isWater(this.tiles[i]));
        // ameaça: inimigos colados no caminho reduzem o lucro, a menos que uma fortificação própria proteja o trecho
        r.threat = false;
        for (let k = 1; k < r.path.length - 1; k++) {
          const i = r.path[k];
          if (!zoc[i]) continue;
          const t = this.tiles[i];
          if (!this.protectedTile(p.id, t)) { r.threat = true; break; }
        }
        if (!was) { this.log(`A rota entre ${A.name} e ${B.name} foi restabelecida.`, p.id); this.emit('routeRestored', { route: r }); }
        r.age++;
        if (r.kind === 'foreign') {
          this.remember(B.owner, p.id, 'route'); this.remember(p.id, B.owner, 'route');
          if (r.age >= 12 && !r.rep) {
            r.rep = true;
            p.reputation = Math.min(3, (p.reputation || 0) + 1);
            const q = this.players[B.owner];
            q.reputation = Math.min(3, (q.reputation || 0) + 1);
          }
          if (r.age % 8 === 0) this.addPop(A, 1);
        } else if (r.age % 6 === 0) {
          this.addPop(A.level <= B.level ? A : B, 1);
        }
      }
    },

    protectedTile(pid, t) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const n = this.tile(t.x + dx, t.y + dy);
        if (n && n.fort && (n.fort.owner === pid || (this.allied && this.allied(n.fort.owner, pid)))) return true;
        if (n && n.city && this.cityMap[n.city].owner === pid && Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return true;
      }
      return false;
    },

    routeYield(r) {
      const out = { stars: 0, sci: 0, partnerStars: 0, partnerSci: 0 };
      if (!r.active) return out;
      const A = this.cityMap[r.a], B = this.cityMap[r.b];
      if (!A || !B) return out;
      const p = this.players[r.owner];
      const bonus = Math.floor((r.len || 0) / 5);
      if (r.kind === 'foreign') {
        out.stars = Math.min(4, 2 + bonus);
        out.sci = 1;
        out.partnerStars = 1; out.partnerSci = 1;
        if (this.resourceAccess(p).spices > 0) out.stars++;
      } else {
        out.stars = Math.min(3, 1 + bonus);
      }
      if (A.spec === 'comercio') out.stars++;
      if (this.specActive(A, 'exchange')) out.stars++;
      if (r.kind === 'domestic') {
        if (B.spec === 'comercio') out.stars++;
        if (this.specActive(B, 'exchange')) out.stars++;
      }
      if (A.spec === 'ciencia' || (r.kind === 'domestic' && B.spec === 'ciencia')) out.sci++;
      if (r.sea) {
        if (this.specActive(A, 'lighthouse') || (r.kind === 'domestic' && this.specActive(B, 'lighthouse'))) out.stars++;
        if (this.citiesOf(p.id).some(c => c.milestones && c.milestones.m_searoutes)) out.stars++;
      }
      if (this.eventRouteMult) {
        const m = this.eventRouteMult(r);
        out.stars = Math.round(out.stars * m);
      }
      if (r.threat) { out.stars = Math.ceil(out.stars / 2); out.sci = Math.floor(out.sci / 2); out.partnerStars = 0; }
      const mult = this.cityYieldMult ? this.cityYieldMult(A) : 1;
      if (mult < 1) { out.stars = Math.floor(out.stars * mult); out.sci = Math.floor(out.sci * mult); }
      return out;
    },

    routeIncome(p) {
      this.ensureRoutes();
      let stars = 0, sci = 0;
      for (const r of this.routes) {
        if (!r.active) continue;
        if (r.owner === p.id) { const y = this.routeYield(r); stars += y.stars; sci += y.sci; }
        else if (r.kind === 'foreign' && r.partner === p.id) { const y = this.routeYield(r); stars += y.partnerStars; sci += y.partnerSci; }
      }
      return { stars, sci };
    },

    // ============================================================ Saque e reparo
    pillageCheck(u) {
      const r = { ok: false, visible: false, reason: '', what: null };
      if (!u || u.dead) return r;
      const d = UN[u.type];
      if (d.spy || this.stat(u).atk <= 0) return r;
      const t = this.tileAt(u);
      if (t.city || t.village) return r;
      const hostile = o => o >= 0 && o !== u.owner && this.atWar(u.owner, o);
      if (t.fort && hostile(t.fort.owner)) r.what = 'fort';
      else if (t.imp && !t.pillaged && hostile(t.owner)) r.what = 'imp';
      else if (t.road && (hostile(t.owner) || t.owner === -1)) r.what = 'road';
      if (!r.what) return r;
      r.visible = true;
      if (!u.canAttack || u.attacked) { r.reason = 'A unidade já agiu neste turno'; return r; }
      r.ok = true;
      return r;
    },

    pillage(u) {
      if (this.over || u.owner !== this.current) return false;
      const chk = this.pillageCheck(u);
      if (!chk.ok) return false;
      const t = this.tileAt(u), p = this.players[u.owner];
      let loot = chk.what === 'fort' ? 4 : chk.what === 'imp' ? 3 : 1;
      if (p.tribe === 'vikar' && this.neighbors(t).some(n => this.isWater(n))) loot *= 2;
      let victim = t.owner;
      let what = '';
      if (chk.what === 'fort') { victim = t.fort.owner; what = PP.FORTS[t.fort.type].name; t.fort = null; }
      else if (chk.what === 'imp') { what = (PP.IMPROVEMENTS[t.imp] || { name: 'melhoria' }).name; t.pillaged = true; }
      else { what = 'estrada'; t.road = false; }
      p.stars += loot;
      p.stats.pillaged = (p.stats.pillaged || 0) + 1;
      u.canAttack = false; u.attacked = true; u.mp = 0; u.moved = true; u.fortified = false;
      this.invalidate();
      const vName = victim >= 0 ? this.players[victim].name : null;
      this.log(`${p.name} saqueou ${what}${vName ? ' de ' + vName : ''} (+${loot}★).`, victim >= 0 ? [p.id, victim] : p.id);
      this.hook('pillaged', u, t, chk.what, victim);
      this.emit('pillage', { unit: u, tile: t, what: chk.what, loot, victim });
      return true;
    },

    // ============================================================ Fortificações (ações de casa)
    fortCount(pid) { let n = 0; for (const t of this.tiles) if (t.fort && t.fort.owner === pid) n++; return n; },
    fortLimit(pid) { return 2 + this.citiesOf(pid).length; },

    fortActionCheck(p, t, a, r) {
      const occ = this.uGrid[t.y * this.W + t.x];
      if (a.repair) {
        if (!t.pillaged || t.owner !== p.id) return r;
        r.visible = true;
        if (occ && occ.owner !== p.id) { r.reason = 'Casa ocupada pelo inimigo'; return r; }
        if (p.stars < r.cost) { r.reason = 'Faltam estrelas'; return r; }
        r.ok = true;
        return r;
      }
      if (this.isWater(t) || t.wonder || t.imp) return r;
      if (t.terrain === 'mountain' && a.fort !== 'tower') return r;
      const inOwn = t.owner === p.id;
      const inNeutral = t.owner === -1 && occ && occ.owner === p.id;
      if (!inOwn && !inNeutral) return r;
      if (a.upgradeOf) { if (!t.fort || t.fort.type !== a.upgradeOf || t.fort.owner !== p.id) return r; }
      else if (t.fort) return r;
      r.visible = true;
      if (t.landmark === 'passo' && a.fort !== 'tower') r.cost = Math.ceil(a.cost / 2);
      if (a.tech && !this.has(p, a.tech)) { r.reason = 'Requer ' + PP.TECH[a.tech].name; r.locked = true; return r; }
      if (!a.upgradeOf) {
        if (this.neighbors(t).some(n => n.fort)) { r.reason = 'Muito perto de outra fortificação'; return r; }
        const lim = this.fortLimit(p.id);
        if (this.fortCount(p.id) >= lim) { r.reason = `Limite de fortificações (${lim})`; return r; }
      }
      if (occ && occ.owner !== p.id) { r.reason = 'Casa ocupada pelo inimigo'; return r; }
      if (p.stars < r.cost) { r.reason = 'Faltam estrelas'; return r; }
      r.ok = true;
      return r;
    },

    doFortAction(p, t, a, chk) {
      p.stars -= chk.cost;
      if (a.repair) {
        t.pillaged = false;
        this.log(`${p.name} reparou ${(PP.IMPROVEMENTS[t.imp] || { name: 'a melhoria' }).name}.`, p.id);
      } else {
        t.fort = { type: a.fort, owner: p.id, since: this.turn };
        if (!a.upgradeOf) p.stats.forts = (p.stats.forts || 0) + 1;
        this.log(`${p.name} ergueu ${PP.FORTS[a.fort].name}.`, p.id);
      }
      p.stats.built++;
      this.invalidate();
      this.emit('build', { player: p.id, tile: t, action: a.id });
      this.refreshVision(p.id);
      return true;
    },

    // ============================================================ Logística
    // Casas abastecidas: perto de cidades, território próprio ou aliado, estradas, portos e fortificações
    supplyGrid(pid) {
      const key = 'sup' + pid;
      if (this.cache[key]) return this.cache[key];
      const W = this.W, H = this.H, g = new Uint8Array(W * H);
      const p = this.players[pid];
      const owners = this.visionOwners ? this.visionOwners(p) : [pid];
      const own = id => owners.indexOf(id) >= 0;
      const mark = (cx, cy, r) => {
        for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++)
          for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) g[y * W + x] = 1;
      };
      const cityR = 2 + (this.resourceAccess(p).horses > 0 ? 1 : 0);
      for (const c of this.cities) if (own(c.owner)) mark(c.x, c.y, cityR);
      for (let i = 0; i < this.tiles.length; i++) {
        const t = this.tiles[i];
        if (own(t.owner)) g[i] = 1;
        if (t.fort && own(t.fort.owner)) { const s = PP.FORTS[t.fort.type].supply; if (s) mark(t.x, t.y, s); }
        if (t.road && !(t.owner >= 0 && !own(t.owner) && this.atWar(pid, t.owner))) mark(t.x, t.y, 1);
        if (t.imp === 'port' && !t.pillaged && own(t.owner)) mark(t.x, t.y, 3);
      }
      this.cache[key] = g;
      return g;
    },

    isSupplied(u) {
      if (UN[u.type].spy) return true;
      return !!this.supplyGrid(u.owner)[u.y * this.W + u.x];
    },

    // 0 = abastecida; 1 = sem suprimentos (−20%); 2 = sem suprimentos há muito tempo (−35%)
    supplyLevel(u) {
      if (!u || this.isSupplied(u)) return 0;
      const o = u.oos || 0;
      return o >= 4 ? 2 : o >= 2 ? 1 : 0;
    },
    supplyMult(u) { return [1, 0.8, 0.65][this.supplyLevel(u)]; },

    updateSupply(p) {
      const grid = this.supplyGrid(p.id);
      for (const u of this.units) {
        if (u.owner !== p.id || UN[u.type].spy) continue;
        const i = u.y * this.W + u.x;
        if (grid[i]) { u.oos = 0; continue; }
        const t = this.tiles[i];
        u.oos = (u.oos || 0) + (t.terrain === 'desert' ? 2 : 1);
        if (u.oos === 2 || (u.oos === 3 && t.terrain === 'desert')) this.emit('supply', { unit: u, level: this.supplyLevel(u) });
      }
    },
  };

  Object.assign(PP.Game.prototype, E);

  PP.registerSystem('economy', {
    init(g) { g.ensureRoutes(); },
    load(g, sys) {
      // preserva a ordem das chaves (o save precisa ser idêntico ao recarregar)
      g.routes = (sys.routes || []).map(r => {
        const o = Object.assign({}, r);
        for (const [k, v] of [['threat', false], ['age', 0], ['rep', false], ['sea', false], ['path', []]]) if (o[k] == null) o[k] = v;
        return o;
      });
    },
    save(g, sys) { sys.routes = g.routes || []; },
    beforeTurn(g, p) {
      if (g.turn > 1) g.validateRoutes(p);
      g.updateSupply(p);
    },
    income(g, p, inc) {
      p.stats.tradeIncome = (p.stats.tradeIncome || 0) + (inc.trade || 0);
    },
    // Fortificações no território de uma cidade conquistada mudam de dono junto com ela
    capture(g, c, old, p) {
      for (const t of g.tiles) if (t.cityId === c.id && t.fort && t.fort.owner === old.id) t.fort.owner = p.id;
      for (const r of (g.routes || []).slice()) {
        if (r.a === c.id || r.b === c.id) {
          const keep = r.kind === 'foreign' && r.b === c.id && !g.atWar(r.owner, p.id) && r.owner !== p.id;
          if (keep) r.partner = p.id;
          else g.cancelRoute(r, `${c.name} foi conquistada`);
        }
      }
    },
    // Tropas que entram numa fortificação inimiga a tomam
    moved(g, u) {
      const t = g.tileAt(u);
      if (!t.fort || t.fort.owner === u.owner || !g.atWar(u.owner, t.fort.owner) || UN[u.type].spy || UN[u.type].naval) return;
      const old = t.fort.owner;
      t.fort.owner = u.owner;
      g.invalidate();
      g.log(`${g.players[u.owner].name} tomou ${PP.FORTS[t.fort.type].name} de ${g.players[old].name}.`, [u.owner, old]);
      g.emit('fortTaken', { tile: t, from: old, to: u.owner });
    },
    war(g, a, b) {
      for (const r of (g.routes || []).slice()) {
        if (r.kind === 'foreign' && ((r.owner === a && r.partner === b) || (r.owner === b && r.partner === a))) g.cancelRoute(r, 'guerra');
      }
    },
    eliminated(g, p) {
      for (const r of (g.routes || []).slice()) if (r.owner === p.id || r.partner === p.id) g.cancelRoute(r);
      for (const t of g.tiles) if (t.fort && t.fort.owner === p.id) t.fort = null;
    },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
