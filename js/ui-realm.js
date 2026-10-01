/* Chamas de Vardren — interface da organização do reino e dos personagens: seção Administração e Personagens
   na cidade, resumo na lista de cidades, nota do personagem no painel da unidade e avisos. Estende PP.UI. */
(function (PP) {
  'use strict';
  const { esc, crest } = PP.uiHelpers;
  const UN = PP.UNITS;
  const SKILL = { general: 'aura', governor: 'govern', envoy: 'envoy' };

  const kindLabel = k => (k === 'capital' ? PP.t('Capital') : k === 'seat' ? PP.BUILDINGS.regional_seat.name : UN.governor.name);

  Object.assign(PP.UI.prototype, {
    // Etiqueta curta na lista de cidades
    realmCityTag(c) {
      const g = this.game;
      if (!g.realmOn()) return '';
      const info = g.adminInfo(c);
      if (info.remote) return ` <span class="tag bad">${PP.t('Longe da corte')}</span>`;
      if (info.center === 'seat' || info.center === 'governor') return ` <span class="tag gold">${kindLabel(info.center)}</span>`;
      return '';
    },

    // Aviso no painel inferior quando a cidade está longe da corte
    realmCityNote(c) {
      const g = this.game;
      if (!g.realmOn() || !g.adminInfo(c).remote) return '';
      return `<p class="note"><span class="tag bad">${PP.t('Longe da corte')}</span> ${PP.t('Rende {n}% menos. Um Paço Regional, o Governador ou uma estrada até a capital resolvem.', { n: Math.round(g.remoteCut(c) * 100) })}</p>`;
    },

    capacityLine(cap) {
      const g = this.game;
      const parts = cap.parts.map(([l, n]) => `${esc(l)} +${n}`).join(' · ');
      const warn = g.realmOn() && cap.excess > 0 ? ` <span class="tag bad">${PP.t('Desordem −{n}%', { n: Math.round(cap.rate * 100) })}</span>` : '';
      return `<p class="note"><b>${PP.t('Capacidade administrativa: {a}/{b} cidades', { a: cap.cities, b: cap.total })}</b>${warn}<br><small>${parts}</small></p>`;
    },

    // Resumo no topo da lista de cidades
    realmSummary() {
      const g = this.game, p = this.me();
      const cap = g.adminCapacity(p);
      let html = this.capacityLine(cap);
      if (!g.realmOn()) return html;
      if (cap.excess > 0) html += `<p class="note">${PP.t('Cada cidade além da capacidade tira 5% das estrelas e da ciência das cidades (máx. 25%). Construa Tribunais, pesquise Código de Leis e Burocracia ou nomeie um Governador.')}</p>`;
      const remote = g.citiesOf(p.id).filter(c => g.adminInfo(c).remote).length;
      if (remote) html += `<p class="note">${PP.plural(remote, PP.t('{n} cidade longe da corte.', { n: remote }), PP.t('{n} cidades longe da corte.', { n: remote }))}</p>`;
      return html;
    },

    // Seções Administração e Personagens no modal da cidade
    realmCitySection(c) {
      const g = this.game, p = this.me(), my = this.myTurn();
      let html = `<div class="sec-lbl">${PP.t('Administração')}</div>`;
      const center = g.adminCenters(p.id).find(o => o.city === c);
      let status = '';
      if (center) status = PP.t('{x}: centro administrativo (alcance {n}).', { x: kindLabel(center.kind), n: center.radius });
      else if (g.realmOn()) {
        const info = g.adminInfo(c);
        if (info.remote) status = PP.t('Longe da corte: rende {n}% menos. Um Paço Regional, o Governador ou uma estrada até a capital resolvem.', { n: Math.round(g.remoteCut(c) * 100) });
        else if (info.by) {
          status = PP.t('Ao alcance de {c}.', { c: esc(info.by.name) });
          if (info.province && info.province !== c) status += ' ' + PP.t('Província de {c} (+5 de lealdade).', { c: esc(info.province.name) });
        }
      }
      if (status) html += `<p class="note">${status}</p>`;
      html += this.capacityLine(g.adminCapacity(p));
      const cards = PP.CHARACTERS.map(type => {
        const d = UN[type];
        const chk = g.trainCheck(p, c, type);
        if (chk.locked) return '';
        const u = g.characterOf(p.id, type);
        const skill = PP.SKILL_NAMES[SKILL[type]] || '';
        if (u) {
          return `<button type="button" class="card done" data-m="charGoto" data-id="${u.id}">
            <div class="card-row">${crest(p.color, 'u_' + type, 'crest-s')}<span class="cn">${esc(g.characterTitle(u))}</span></div>
            <span class="cc">${PP.t('No reino')}</span><span class="cd">${esc(skill)}</span></button>`;
        }
        return `<button type="button" class="card ${chk.ok && my ? 'go' : ''}" data-m="train" data-city="${c.id}" data-v="${type}">
          <div class="card-row">${crest(p.color, 'u_' + type, 'crest-s')}<span class="cn">${d.name}</span></div>
          <span class="cc star">${chk.cost}★</span><span class="cd">${esc(skill)}</span>
          ${chk.ok ? '' : `<span class="cr">${esc(chk.reason)}</span>`}</button>`;
      }).join('');
      if (cards.trim()) html += `<div class="sec-lbl">${PP.t('Personagens')}</div><div class="grid">${cards}</div>`;
      return html;
    },

    // Nota do personagem no painel da unidade
    characterNote(u) {
      const g = this.game;
      if (!UN[u.type].character) return '';
      let txt = '';
      if (u.type === 'general') {
        let n = 0;
        for (const nb of g.neighbors(u)) { const o = g.unitAt(nb.x, nb.y); if (o && o.owner === u.owner && g.commandedBy(o) === u) n++; }
        txt = n ? PP.t('Comandando {n} tropa(s) vizinha(s): +20% de ataque e +10% de defesa.', { n })
          : PP.t('Fique ao lado das suas tropas para comandá-las (+20% de ataque e +10% de defesa).');
      } else if (u.type === 'governor') {
        const c = g.governedCity(u.owner);
        txt = c ? PP.t('Governando {c}: centro administrativo, +2★ e +10 de lealdade.', { c: esc(c.name) })
          : PP.t('Fique dentro ou ao lado de uma cidade sua para governá-la.');
      } else if (u.type === 'envoy') {
        const q = g.envoyHost(u);
        txt = q ? PP.t('Em missão junto a {q}: +2 de opinião por turno e relatório da tribo.', { q: esc(q.name) })
          : PP.t('Entre no território de uma tribo em paz com você para começar a missão.');
      }
      return `<p class="note"><span class="tag gold">${PP.t('Personagem')}</span> ${txt}</p>`;
    },
  });

  const proto = PP.UI.prototype;

  const prevStatus = proto.unitStatus;
  proto.unitStatus = function (u) { return this.characterNote(u) + prevStatus.call(this, u); };

  const prevEvent = proto.onGameEventExt;
  proto.onGameEventExt = function (type, d) {
    const g = this.game, v = this.viewer;
    if (type === 'realm') {
      if (d.player === v && d.type === 'disorder') {
        if (d.excess > d.before) this.toast(PP.t('Desordem administrativa: {n} cidade(s) além da capacidade.', { n: d.excess }), 'bad');
        else if (d.excess === 0) this.toast(PP.t('O reino voltou à ordem.'), 'good');
      }
      return;
    }
    if (type === 'character') {
      if (d.player === v) {
        if (d.type === 'new') this.toast(PP.t('{u} se juntou ao seu reino.', { u: g.characterTitle(d.unit) }), 'gold');
        else if (d.type === 'lost') this.toast(PP.t('{u} caiu.', { u: g.characterTitle(d.unit) }), 'bad');
      }
      return;
    }
    if (prevEvent) prevEvent.call(this, type, d);
  };

  const prevModal = proto.modalActionExt;
  proto.modalActionExt = function (a, d, btn) {
    if (a === 'charGoto') {
      const g = this.game;
      const u = g && g.units.find(x => x.id === +d.id);
      if (u) { this.closeAllModals(); this.select(g.tileAt(u), 'unit'); this.focusSelection('center'); }
      return;
    }
    if (prevModal) prevModal.call(this, a, d, btn);
  };
})(window.PP = window.PP || {});
