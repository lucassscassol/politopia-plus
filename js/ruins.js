/* Politopia+ — ruínas com escolhas. Cada ruína tem um tipo (fortaleza, templo, biblioteca, acampamento,
   túmulo) e oferece decisões: Explorar (a recompensa aleatória original), Saquear (estrelas na hora, mas as
   outras tribos não gostam), Restaurar (paga para transformar em algo útil) ou Honrar (túmulos).
   Ruínas antigas sem tipo (saves anteriores) continuam dando a recompensa original. */
(function (PP) {
  'use strict';

  const R = {
    ruinOptions(p, t) {
      const def = PP.RUIN_TYPES[t.ruinType];
      if (!def) return [];
      const out = [{ id: 'explore', name: 'Explorar', desc: 'Vasculhar com cuidado: uma recompensa aleatória (tesouro, pergaminhos, tecnologia, veterano, mapa ou sobreviventes).', ok: true }];
      const met = this.players.filter(q => q.alive && q.id !== p.id && p.met[q.id]).length;
      out.push({ id: 'loot', name: 'Saquear', desc: `+${def.loot}★ agora.` + (met ? ' As tribos que você conhece vão se lembrar disso.' : ''), ok: true });
      if (def.restore) {
        const r = def.restore;
        const can = !this.isWater(t) && !t.fort && !(r.fort && this.neighbors(t).some(n => n.fort));
        out.push({ id: 'restore', name: r.label, desc: `Custa ${r.cost}★.` + (r.fort ? ` A casa vira ${PP.FORTS[r.fort].name} seu.` : '') +
          (r.shrine || r.archive ? ' O santuário dá +1⚗ por turno.' : '') + (r.archive ? ` Ganha +${r.archive}⚗ agora.` : ''),
          ok: can && p.stars >= r.cost, reason: !can ? 'Não é possível aqui' : p.stars < r.cost ? 'Faltam estrelas' : '' });
      }
      if (def.honor) out.push({ id: 'honor', name: 'Honrar o túmulo', desc: 'A unidade ganha 2 XP e as outras tribos respeitam o gesto.', ok: true });
      return out;
    },

    // Chamado quando uma unidade entra na ruína. Retorna true se o sistema cuidou dela.
    ruinChoice(u, t) {
      if (!t.ruinType || !PP.RUIN_TYPES[t.ruinType]) return false;
      const p = this.players[u.owner];
      if (p.human) {
        p.pendingRuin = { x: t.x, y: t.y, unitId: u.id, type: t.ruinType };
        this.emit('ruinChoice', { player: p.id, tile: t, unit: u, type: t.ruinType });
        return true;
      }
      const choice = PP.AI && PP.AI.chooseRuin ? PP.AI.chooseRuin(this, p, u, t, this.ruinOptions(p, t)) : 'explore';
      this.applyRuin(p, t, u, choice);
      return true;
    },

    resolveRuin(p, choice) {
      const pr = p.pendingRuin;
      if (!pr) return false;
      const t = this.tile(pr.x, pr.y);
      if (!t || !t.ruin) { p.pendingRuin = null; return false; }
      const opt = this.ruinOptions(p, t).find(o => o.id === choice);
      if (!opt || !opt.ok) return false;
      p.pendingRuin = null;
      const u = this.units.find(x => x.id === pr.unitId) || null;
      this.applyRuin(p, t, u, choice);
      return true;
    },

    applyRuin(p, t, u, choice) {
      const def = PP.RUIN_TYPES[t.ruinType];
      if (!def || choice === 'explore' || !choice) {
        t.ruinType = null;
        this.ruinExplore(p, t, u);
        return;
      }
      const others = this.players.filter(q => q.alive && q.id !== p.id && q.met[p.id]);
      let text = '';
      if (choice === 'loot') {
        p.stars += def.loot;
        for (const q of others) this.remember(q.id, p.id, 'plunder', def.rep);
        text = `saqueou ${def.name} (+${def.loot}★)`;
      } else if (choice === 'restore') {
        const r = def.restore;
        p.stars -= r.cost;
        if (r.fort) t.fort = { type: r.fort, owner: p.id, since: this.turn };
        if (r.shrine || r.archive) t.shrine = p.id;
        if (r.archive) p.science += r.archive;
        text = `restaurou ${def.name}`;
      } else if (choice === 'honor') {
        if (u && !u.dead) this.gainXp(u, 2);
        for (const q of others) this.remember(q.id, p.id, 'honored');
        text = `honrou ${def.name}`;
      }
      t.ruin = false;
      t.ruinType = null;
      this.invalidate();
      this.log(`${p.name} ${text}.`, p.id);
      this.hook('ruin', p, t, choice);
      this.emit('ruin', { player: p.id, tile: t, reward: choice, text });
      this.refreshVision(p.id);
    },
  };

  Object.assign(PP.Game.prototype, R);

  PP.registerSystem('ruins', {
    // Um humano que encerra o turno sem escolher explora a ruína (comportamento original)
    endTurn(g, p) {
      if (p.pendingRuin) {
        const pr = p.pendingRuin;
        p.pendingRuin = null;
        const t = g.tile(pr.x, pr.y);
        if (t && t.ruin) g.applyRuin(p, t, g.units.find(x => x.id === pr.unitId) || null, 'explore');
      }
    },
  });
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
