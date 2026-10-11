/* Chamas de Vardren — interface de 2.4: crescimento, projetos e vagas na tela da cidade, manutenção na unidade e no
   tesouro, avanços do futuro na tela de tecnologias, cerco e acampamentos rebeldes no mapa e nos painéis, e os avisos
   dos sistemas novos. Estende PP.UI e PP.Renderer. */
(function (PP) {
  'use strict';
  const { esc, SCI, ico } = PP.uiHelpers;
  const $ = s => document.querySelector(s);
  const proto = PP.UI.prototype;
  const UN = PP.UNITS;
  const num = n => PP.num ? PP.num(n) : String(n);
  const signed = n => (n < 0 ? '−' + -n : '+' + n);

  Object.assign(proto, {
    // ============================================================ Cidade
    devCitySection(c) {
      const g = this.game, p = this.me(), my = this.myTurn();
      let html = '';
      // cerco e rebeldes por perto
      const notes = [];
      if (g.siegeOn() && g.isBesieged(c)) {
        if (c.siege > 0) notes.push(`<span class="tag bad">${PP.t('Sitiada há {n} turnos', { n: c.siege })}</span> ${PP.t('Produção pela metade e defesa −{d}%. Ataque as tropas em volta para quebrar o cerco.', { d: Math.round(g.siegeCut(c) * 100) })}`);
        else notes.push(`<span class="tag bad">${PP.t('Cercada')}</span> ${PP.t('Se os inimigos continuarem em volta, o cerco começa no seu próximo turno.')}`);
      }
      const camps = g.camps ? g.campsNear(c, PP.REBELS.near) : 0;
      if (camps) notes.push(`<span class="tag bad">${PP.t('Rebeldes na região')}</span> ${PP.t('Acampamentos a até 2 casas tiram estrelas e lealdade. Entre neles com uma tropa para destruí-los.')}`);
      if (notes.length) html += `<p class="note">${notes.join('<br>')}</p>`;
      // investir em crescimento
      const inv = g.investCheck(p, c);
      const invWhy = !inv.ok && inv.reason !== PP.t('Faltam estrelas') ? ` · <span class="cr">${esc(inv.reason)}</span>` : '';
      html += `<div class="sec-lbl">${PP.t('Crescimento')}</div>
        <div class="list"><div class="row"><span class="row-ico">${ico('ui_invest')}</span><div class="rt"><div class="rn">${PP.t('Investir em crescimento')}</div>
        <div class="rs">${PP.t('+1 de população agora, uma vez por turno. O custo sobe com o nível da cidade.')}${invWhy}</div></div>
        ${my ? `<div class="ra"><button type="button" class="chip-btn" data-m="invest" data-city="${c.id}" ${inv.ok ? '' : 'disabled'}>${PP.t('Investir · {n}★', { n: inv.cost })}</button></div>` : ''}</div></div>`;
      // projetos
      if (c.cproj) {
        const d = PP.CITY_PROJECTS[c.cproj.id];
        html += `<div class="sec-lbl">${PP.t('Projeto da cidade')}</div>
          <div class="list"><div class="row"><span class="row-ico">${ico(d.icon)}</span><div class="rt"><div class="rn">${d.name} <span class="tag gold">${PP.plural(c.cproj.left, PP.t('{n} turno', { n: c.cproj.left }), PP.t('{n} turnos', { n: c.cproj.left }))}</span></div>
          <div class="rs">${esc(d.desc)}${c.cproj.id === 'patronage' ? ' · ' + PP.t('+{n}{sci} por turno', { n: g.patronageYield(c), sci: SCI }) : ''}</div></div>
          ${my ? `<div class="ra"><button type="button" class="chip-btn danger" data-m="cprojCancel" data-city="${c.id}">${PP.t('Cancelar')}</button></div>` : ''}</div></div>`;
      } else {
        const cards = PP.CPROJ_ORDER.map(id => {
          const d = PP.CITY_PROJECTS[id];
          const chk = g.cprojCheck(p, c, id);
          const extra = id === 'patronage' ? ' ' + PP.t('Aqui: +{n}{sci} por turno.', { n: g.patronageYield(c), sci: SCI }) : '';
          return `<button type="button" class="card ${chk.ok && my ? '' : 'locked'}" data-m="cproj" data-city="${c.id}" data-v="${id}">
            <div class="card-row">${ico(d.icon, 'ci')}<span class="cn">${d.name}</span></div>
            <span class="cc star">${chk.cost}★</span><span class="cd">${esc(d.desc)}${extra}</span>
            ${chk.ok ? '' : `<span class="cr">${esc(chk.reason)}</span>`}</button>`;
        }).join('');
        html += `<div class="sec-lbl">${PP.t('Projetos da cidade')} · ${PP.t('um de cada vez, 3 turnos')}</div><div class="grid">${cards}</div>`;
      }
      return html;
    },

    buildingsLabelExtra(c) {
      const g = this.game;
      if (!g.slotsOn()) return '';
      return ` · ${PP.t('vagas {a}/{b}', { a: g.usedSlots(c), b: g.buildSlots(c) })} · ${PP.t('toque numa construção pronta para demolir')}`;
    },

    unitCardExtra(type) {
      const g = this.game;
      if (!g.upkeepOn()) return '';
      const v = g.unitUpkeep(type) * g.upkeepMult(this.me());
      return v ? `<span class="cd">${PP.t('Manutenção: {n}★ por turno', { n: num(Math.round(v * 10) / 10) })}</span>` : '';
    },

    // Nota no painel da casa da cidade (sua ou inimiga): cerco
    cityExtraNote(c, mine) {
      const g = this.game;
      if (!g.siegeOn() || !g.isBesieged(c)) return '';
      if (c.siege > 0) return `<p class="note"><span class="tag bad">${PP.t('Sitiada há {n} turnos', { n: c.siege })}</span> ${PP.t('Defesa −{d}% · produção pela metade', { d: Math.round(g.siegeCut(c) * 100) })}</p>`;
      return `<p class="note"><span class="tag ${mine ? 'bad' : 'gold'}">${PP.t('Cercada')}</span> ${mine ? PP.t('Se os inimigos continuarem em volta, o cerco começa no seu próximo turno.') : PP.t('O cerco começa no próximo turno deles se as suas tropas continuarem em volta.')}</p>`;
    },

    // Painel de uma casa com acampamento rebelde
    tileExtra(t) {
      const g = this.game;
      const k = g.campAt ? g.campAt(t.x, t.y) : null;
      if (!k || t.city || t.village) return null;
      return {
        icon: 'ui_camp', title: PP.t('Acampamento rebelde (força {n})', { n: k.str }),
        info: PP.t('<b>Acampamento rebelde:</b> a cada 3 turnos saqueia uma melhoria ou fere uma tropa vizinha e fica mais forte com o tempo (força máxima 3). Tira estrelas e lealdade das cidades a até 2 casas. Leve uma tropa até aqui para destruí-lo: ela sofre {d} de dano (nunca morre por isso) e você recolhe {n}★.', { d: g.campDamage(k), n: g.campLoot(k) }),
      };
    },

    // ============================================================ Tesouro: a conta do exército
    armyRow(p, inc) {
      const g = this.game;
      if (!g.upkeepOn()) return '';
      const up = g.upkeepOf(p);
      const parts = up.freeParts.map(([l, n]) => `${esc(l)} ${n}`).join(' · ');
      let html = `<div class="row tight"><span class="row-ico">${ico('ui_upkeep')}</span><div class="rt"><div class="rn">${PP.t('Exército: {n} tropas · {f} sustentadas de graça', { n: up.units, f: Math.min(up.units, up.free) })}</div>
        <div class="rs">${PP.t('Vagas gratuitas: {x}', { x: parts || '0' })}${up.unsupplied ? ' · ' + PP.t('{n} fora do abastecimento (+50%)', { n: up.unsupplied }) : ''}${up.mult !== 1 ? ' · ' + PP.t('custo ×{x}', { x: num(Math.round(up.mult * 100) / 100) }) : ''}</div></div>
        <div class="ra nums"><span class="star">${signed(-up.total)}★</span></div></div>`;
      if (inc.stars < 0) html += `<p class="note"><span class="tag bad">${PP.t('Renda negativa')}</span> ${PP.t('O tesouro paga a diferença; quando acabar, uma tropa deserta por turno. Dissolva tropas velhas ou aumente a renda.')}</p>`;
      return html;
    },

    // ============================================================ Tecnologias: avanços do futuro
    futureSection(p) {
      const g = this.game, my = this.myTurn();
      const cost = g.futureCost(p);
      const cards = PP.FUTURE_ORDER.map(id => {
        const d = PP.FUTURE_PERKS[id];
        const chk = g.futurePerkCheck(p, id);
        const can = chk.ok && p.science >= cost && my;
        return `<button type="button" class="card ${can ? 'go sci-go' : ''} ${chk.maxed ? 'done' : ''}" data-m="tech" data-v="future" data-perk="${id}">
          <div class="card-row">${ico(d.icon, 'ci')}<span class="cn">${d.name}</span></div>
          <span class="cc ${chk.maxed ? '' : 'sci'}">${chk.maxed ? PP.t('Nível máximo') : cost + SCI} <span class="tag">${chk.level}/${d.max}</span></span><span class="cd">${esc(d.desc)}</span></button>`;
      }).join('');
      return `<div class="era"><h3>${PP.t('Além')} · ${PP.t('Tecnologia do Futuro {n}', { n: (p.future || 0) + 1 })}</h3>
        <p class="note">${PP.t('Cada Tecnologia do Futuro vale +120 pontos e traz um avanço à escolha. O custo sobe a cada uma.')}</p><div class="grid">${cards}</div></div>`;
    },
  });

  // ------------------------------------------------------------ Tela da cidade: nova seção depois das existentes
  const prevSections = proto.citySections;
  proto.citySections = function (c) {
    const html = prevSections.call(this, c);
    return c.owner === this.viewer ? html + this.devCitySection(c) : html;
  };

  // ------------------------------------------------------------ Ações
  const prevModalAction = proto.modalAction;
  proto.modalAction = function (a, d, btn) {
    const g = this.game;
    // tocar numa construção pronta (com vagas ligadas) oferece demolir
    if (a === 'build' && g && g.slotsOn() && this.myTurn()) {
      const c = g.cityMap[+d.city], p = this.me();
      if (c && c.buildings[d.v]) {
        const chk = g.demolishCheck(p, c, d.v);
        if (!chk.ok) { this.toast(chk.reason === PP.t('Não ocupa vaga') ? PP.t('{x} não ocupa vaga.', { x: PP.BUILDINGS[d.v].name }) : chk.reason, 'bad'); return; }
        const b = PP.BUILDINGS[d.v];
        this.ask(PP.t('Demolir {x}?', { x: b.name }), `<p>${PP.t('Libera uma vaga de construção em {c}. Não há reembolso e o efeito da construção some (reconstruir não dá a população de novo).', { c: esc(c.name) })}</p>`,
          PP.t('Demolir'), PP.t('Cancelar')).then(ok => {
          if (ok && g.demolish(p, c, d.v)) { this.afterAction(); this.openCity(c, true); }
        });
        return;
      }
    }
    return prevModalAction.call(this, a, d, btn);
  };

  const prevModal = proto.modalActionExt;
  proto.modalActionExt = function (a, d, btn) {
    const g = this.game;
    if (!g || ['invest', 'cproj', 'cprojCancel'].indexOf(a) < 0) {
      if (prevModal) prevModal.call(this, a, d, btn);
      return;
    }
    if (!this.myTurn()) { this.toast(PP.t('Espere a sua vez.'), 'bad'); return; }
    const p = this.me(), c = g.cityMap[+d.city];
    if (!c) return;
    if (a === 'invest') {
      const chk = g.investCheck(p, c);
      if (!chk.ok) { this.toast(chk.reason, 'bad'); return; }
      g.invest(p, c);
    } else if (a === 'cproj') {
      const chk = g.cprojCheck(p, c, d.v);
      if (!chk.ok) { this.toast(chk.reason, 'bad'); return; }
      g.startCityProject(p, c, d.v);
    } else if (a === 'cprojCancel') {
      this.ask(PP.t('Cancelar o projeto?'), `<p>${PP.t('As estrelas gastas não voltam.')}</p>`, PP.t('Cancelar o projeto'), PP.t('Continuar')).then(ok => {
        if (ok && g.cancelCityProject(p, c)) { this.afterAction(); this.openCity(c, true); }
      });
      return;
    }
    this.afterAction();
    if (this.modals.some(m => m.kind === 'city')) this.openCity(c, true);
  };

  // ------------------------------------------------------------ HUD: renda negativa em vermelho
  const prevHud = proto.renderHud;
  proto.renderHud = function (...args) {
    const r = prevHud.apply(this, args);
    const g = this.game, el = $('#tb-stars-inc');
    if (g && el) {
      const inc = g.income(this.me());
      el.textContent = signed(inc.stars);
      el.classList.toggle('neg', inc.stars < 0);
    }
    return r;
  };

  // ------------------------------------------------------------ Avisos
  const prevEvent = proto.onGameEventExt;
  proto.onGameEventExt = function (type, d) {
    const g = this.game, v = this.viewer;
    const me = g.players[v];
    const seen = (x, y) => me && me.explored[y * g.W + x];
    switch (type) {
      case 'upkeep':
        if (d.player !== v) return;
        if (d.type === 'desertion') this.toast(PP.t('Sem estrelas para o soldo: {u} desertou.', { u: UN[d.unit.type].name }), 'bad');
        else this.toast(PP.t('O tesouro não cobriu a manutenção do exército.'), 'bad');
        this.renderHud();
        return;
      case 'citydev':
        if (d.player !== v) return;
        if (d.type === 'perk') this.toast(PP.t('Avanço conquistado: {x}.', { x: PP.FUTURE_PERKS[d.perk].name }), 'gold');
        else if (d.type === 'projectDone') this.toast(PP.t('{c} concluiu o projeto {x}.', { c: d.city.name, x: PP.CITY_PROJECTS[d.project].name }), 'good');
        else if (d.type === 'invest') this.toast(PP.t('{c}: +1 de população.', { c: d.city.name }), 'good');
        this.renderHud();
        return;
      case 'siege':
        if (d.player === v) this.toast(d.type === 'start' ? PP.t('{c} está sitiada!', { c: d.city.name }) : PP.t('O cerco de {c} acabou.', { c: d.city.name }), d.type === 'start' ? 'bad' : 'good');
        else if (d.type === 'start' && d.by && d.by.indexOf(v) >= 0) this.toast(PP.t('Você sitiou {c}.', { c: d.city.name }), 'gold');
        return;
      case 'camp':
        if (d.type === 'cleared' && d.player === v) this.toast(PP.t('Acampamento destruído: +{n}★.', { n: d.loot }), 'gold');
        else if (d.type === 'spawn' && seen(d.camp.x, d.camp.y) && g.cities.some(c => c.owner === v && Math.max(Math.abs(c.x - d.camp.x), Math.abs(c.y - d.camp.y)) <= 3)) this.toast(PP.t('Rebeldes ergueram um acampamento perto das suas cidades.'), 'bad');
        else if (d.type === 'raid' && d.victim === v) this.toast(PP.t('Rebeldes saquearam uma melhoria sua.'), 'bad');
        else if (d.type === 'hit' && d.unit.owner === v) this.toast(PP.t('Rebeldes atacaram uma tropa sua.'), 'bad');
        if (this.r) this.r.dirty = true;
        return;
      case 'rebels':
        if (d.player === v) this.toast(PP.t('Guerrilheiros pegaram em armas perto de {c}!', { c: d.city.name }), 'bad');
        else if (d.founder === v) this.toast(PP.t('Guerrilheiros se levantaram por você perto de {c}!', { c: d.city.name }), 'gold');
        return;
      case 'coalition': {
        const t = g.players[d.target];
        if (!t) return;
        if (d.type === 'formed') {
          if (d.target === v) this.toast(PP.t('As outras tribos formaram uma coalizão contra você!'), 'bad');
          else if (me && me.met[d.target]) this.toast(PP.t('Coalizão contra {x}: as tribos se unem contra o líder.', { x: t.name }), 'gold');
        } else if (d.target === v) this.toast(PP.t('A coalizão contra você se desfez.'), 'good');
        return;
      }
    }
    if (prevEvent) prevEvent.call(this, type, d);
  };

  // ============================================================ Mapa: acampamentos e cerco
  const R = PP.Renderer && PP.Renderer.prototype;
  if (R) {
    const prevFeature = R.drawFeature;
    R.drawFeature = function (ctx, t, cx, top) {
      prevFeature.call(this, ctx, t, cx, top);
      const g = this.game;
      if (!g.camps || !g.camps.length || t.city || t.village) return;
      const k = g.campAt(t.x, t.y);
      if (!k) return;
      ctx.save();
      ctx.fillStyle = 'rgba(10,8,6,0.55)';
      ctx.beginPath(); ctx.ellipse(cx, top + 2, 20, 7, 0, 0, Math.PI * 2); ctx.fill();
      PP.drawIcon(ctx, 'ui_camp', cx, top - 12, 30, '#e58a4e', 'rgba(10,8,6,0.85)');
      for (let i = 0; i < k.str; i++) {
        ctx.fillStyle = '#e07a62';
        ctx.beginPath(); ctx.arc(cx - (k.str - 1) * 4 + i * 8, top + 9, 2.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    };

    const prevLabel = R.drawCityLabel;
    R.drawCityLabel = function (ctx, c) {
      prevLabel.call(this, ctx, c);
      const g = this.game;
      if (!g.siegeOn || !g.siegeOn() || !(c.siege > 0) || !g.isBesieged(c)) return;
      const pos = this.tilePosW(c);
      const x = pos.x, y = pos.y + 34 - 22;
      ctx.save();
      ctx.fillStyle = '#15120f'; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d45a45'; ctx.lineWidth = 1.4; ctx.stroke();
      PP.drawIcon(ctx, 'ui_siege', x, y, 13, '#e07a62');
      ctx.restore();
    };
  }
})(window.PP = window.PP || {});
