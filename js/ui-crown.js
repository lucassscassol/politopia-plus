/* Chamas de Vardren — interface do governo, do tesouro e dos vassalos: a tela Reino (forma de governo, impostos,
   tesouro, empréstimos e vassalos), os termos de paz e as ações de vassalagem na Diplomacia, os textos das
   propostas novas e os avisos. Estende PP.UI. */
(function (PP) {
  'use strict';
  const { esc, SCI, tribeIcon, crest, ico } = PP.uiHelpers;
  const $ = s => document.querySelector(s);
  const proto = PP.UI.prototype;
  const signed = n => (n > 0 ? '+' : '') + n;
  const cityCount = n => PP.plural(n, PP.t('{n} cidade', { n }), PP.t('{n} cidades', { n }));

  Object.assign(proto, {
    // ============================================================ Tela Reino
    openRealm(refresh) {
      if (!this.game) return;
      const g = this.game, p = this.me(), my = this.myTurn();
      const anarchy = g.inAnarchy(p);
      const gov = PP.GOVERNMENTS[p.gov];
      const inc = g.income(p);
      // --- forma de governo
      let status = '';
      if (anarchy) status = `<span class="tag bad">${PP.t('Anarquia até o turno {n}', { n: p.anarchyUntil })}</span> ${PP.t('Metade das estrelas e da ciência das cidades, sem os efeitos do governo.')}`;
      else {
        const wait = p.govSince + PP.GOV_RULES.cooldown - g.turn;
        status = wait > 0 ? PP.t('Próxima troca de governo possível no turno {n}.', { n: p.govSince + PP.GOV_RULES.cooldown }) : PP.t('Trocar de governo causa {n} turnos de anarquia (1 para proclamar o Império).', { n: PP.GOV_RULES.anarchy });
      }
      const govCards = PP.GOV_ORDER.map(id => {
        const d = PP.GOVERNMENTS[id];
        const chk = g.govCheck(p, id);
        const cur = p.gov === id;
        const cls = cur ? 'go' : chk.ok && my ? '' : 'locked';
        return `<button type="button" class="card ${cls}" data-m="gov" data-v="${id}">
          <div class="card-row">${ico(d.icon, 'ci')}<span class="cn">${d.name}</span>${cur ? ` <span class="tag ${anarchy ? 'bad' : 'gold'}">${anarchy ? PP.t('Em transição') : PP.t('Atual')}</span>` : ''}</div>
          <span class="cd">${esc(d.desc)}</span>${d.info && !cur ? `<span class="cd">${esc(d.info)}</span>` : ''}
          ${!cur && !chk.ok ? `<span class="cr">${esc(chk.reason)}</span>` : ''}</button>`;
      }).join('');
      // --- impostos
      const taxBtns = PP.TAX_ORDER.map(id => `<button type="button" class="${p.tax === id ? 'on' : ''}" data-m="tax" data-v="${id}">${PP.TAXES[id].name}</button>`).join('');
      // --- tesouro: renda e saídas
      const lineRow = l => `<div class="row tight"><div class="rt"><div class="rn">${esc(l.label)}</div></div><div class="ra nums"><span class="star">${signed(l.stars)}★</span> <span class="sci">${signed(l.sci)}${SCI}</span></div></div>`;
      const out = [];
      if (p.loan) out.push({ label: PP.t('Parcela do empréstimo'), stars: -Math.min(p.loan.per, p.loan.left), sci: 0 });
      const oid = g.overlordOf(p.id);
      if (oid != null) out.push({ label: PP.t('Tributo a {x}', { x: g.players[oid].name }), stars: -Math.floor(Math.max(0, inc.stars) * g.tributeRate(oid)), sci: 0 });
      for (const r of p.reparations || []) out.push({ label: PP.t('Reparações a {x} ({n} turnos)', { x: g.players[r.to].name, n: r.left }), stars: -r.amount, sci: 0 });
      for (const q of g.players) {
        if (!q.alive || q.id === p.id) continue;
        for (const r of q.reparations || []) if (r.to === p.id) out.push({ label: PP.t('Reparações de {x} ({n} turnos)', { x: q.name, n: r.left }), stars: r.amount, sci: 0 });
      }
      for (const vid of g.vassalsOf(p.id)) {
        const V = g.players[vid];
        out.push({ label: PP.t('Tributo de {x} (estimado)', { x: V.name }), stars: Math.floor(Math.max(0, g.income(V).stars) * g.tributeRate(p.id)), sci: 0 });
      }
      const income = inc.lines.map(lineRow).join('') + `<div class="row tight total"><div class="rt"><div class="rn">${PP.t('Renda por turno')}</div></div><div class="ra nums"><span class="star">${signed(inc.stars)}★</span> <span class="sci">${signed(inc.sci)}${SCI}</span></div></div>`;
      // --- empréstimos
      let loans;
      if (p.loan) {
        const L = p.loan;
        loans = `<div class="row"><div class="rt"><div class="rn">${PP.LOANS[L.kind].name} ${L.missed ? `<span class="tag bad">${PP.t('{n} parcela(s) atrasada(s)', { n: L.missed })}</span>` : ''}</div>
          <div class="rs">${PP.t('Faltam {l}★ · parcela de {p}★ por turno · tomado no turno {t}', { l: L.left, p: L.per, t: L.since })}</div></div>
          ${my ? `<div class="ra"><button type="button" class="chip-btn" data-m="repay" ${p.stars >= L.left ? '' : 'disabled'}>${PP.t('Quitar · {n}★', { n: L.left })}</button></div>` : ''}</div>`;
      } else {
        loans = Object.keys(PP.LOANS).map(k => {
          const chk = g.loanCheck(p, k);
          const t = chk.terms;
          const cls = chk.ok && my ? '' : 'locked';
          return `<button type="button" class="card ${cls}" data-m="loan" data-v="${k}">
            <div class="card-row">${ico('ui_loan', 'ci')}<span class="cn">${PP.LOANS[k].name}</span></div>
            ${t ? `<span class="cc star">+${t.amount}★</span><span class="cd">${PP.t('Devolve {m}★ em {t} parcelas de {p}★ (juros de {r}%)', { m: t.total, t: t.turns, p: t.per, r: Math.round(t.rate * 100) })}${t.bank ? ' · ' + PP.t('juros menores pelo Banco') : ''}</span>` : ''}
            ${chk.ok ? '' : `<span class="cr">${esc(chk.reason)}</span>`}</button>`;
        }).join('');
        loans = `<div class="grid">${loans}</div>`;
      }
      // --- vassalos
      let vassals = '';
      if (oid != null) {
        const O = g.players[oid];
        vassals = `<div class="row">${crest(O.color, tribeIcon(O.tribe), 'crest-m')}<div class="rt"><div class="rn">${PP.t('Seu suserano: {x}', { x: esc(O.name) })}</div>
          <div class="rs">${PP.t('Vassalo desde o turno {n} · tributo de {r}% das estrelas · você entra nas guerras deles e não pode declarar guerra nem fazer alianças', { n: p.vassalSince, r: Math.round(g.tributeRate(oid) * 100) })}</div></div>
          ${my ? `<div class="ra"><button type="button" class="chip-btn danger" data-m="independence" data-p="${oid}">${ico('d_independence')} ${PP.t('Declarar independência')}</button></div>` : ''}</div>`;
      }
      for (const vid of g.vassalsOf(p.id)) {
        const V = g.players[vid];
        const chk = g.canPropose(p.id, vid, 'annex');
        const op = g.opinion(vid, p.id);
        vassals += `<div class="row">${crest(V.color, tribeIcon(V.tribe), 'crest-m')}<div class="rt"><div class="rn">${esc(V.name)} <span class="tag gold">${PP.t('Seu vassalo')}</span></div>
          <div class="rs">${PP.t('Desde o turno {n} · {c} · opinião {o}', { n: V.vassalSince, c: cityCount(g.citiesOf(vid).length), o: signed(op) })}${chk.ok ? '' : ' · ' + esc(chk.reason)}</div></div>
          ${my ? `<div class="ra"><button type="button" class="chip-btn" data-m="annexOpen" data-p="${vid}" ${chk.ok ? '' : 'disabled'}>${ico('d_annex')} ${PP.t('Anexar · {n}★', { n: g.annexCost(vid) })}</button><button type="button" class="chip-btn" data-m="release" data-p="${vid}">${ico('d_release')} ${PP.t('Libertar')}</button></div>` : ''}</div>`;
      }
      if (!vassals) vassals = `<p class="note">${PP.t('Nenhum vassalo. Vencendo uma guerra, exija a vassalagem nos termos de paz (Diplomacia), ou ofereça proteção a uma tribo bem mais fraca que goste de você.')}</p>`;

      const empire = p.gov === 'imperio' ? ` · <span class="tag gold">${PP.t('Império')}</span>` : '';
      const html = `<div class="modal-h">${crest(p.color, tribeIcon(p.tribe), 'crest-l')}<div class="mh-t"><h2>${PP.t('Reino de {x}', { x: esc(p.name) })}</h2>
        <div class="sub">${PP.t('{g} · impostos {t}', { g: gov.name, t: PP.TAXES[p.tax].name.toLowerCase() })}${empire} · ★ ${p.stars} · ${SCI} ${p.science}</div></div>${this.closeX()}</div>
        <div class="modal-b">
          <div class="sec-lbl">${PP.t('Forma de governo')}</div>
          <p class="note">${status}</p>
          <div class="grid">${govCards}</div>
          <div class="sec-lbl">${PP.t('Impostos')}</div>
          <div class="seg">${taxBtns}</div>
          <p class="note">${esc(PP.TAXES[p.tax].desc)}</p>
          <div class="sec-lbl">${PP.t('Tesouro')}</div>
          <div class="list">${income}${out.map(lineRow).join('')}</div>
          <div class="sec-lbl">${PP.t('Empréstimos')}</div>
          ${loans}
          <div class="sec-lbl">${PP.t('Vassalos')}</div>
          <div class="list">${vassals}</div>
          ${this.capacityLine ? this.capacityLine(g.adminCapacity(p)) : ''}
        </div>`;
      if (refresh) this.replaceModal('realm', html); else this.openModal('realm', html);
    },

    // ============================================================ Termos de paz
    openTerms(pid, refresh) {
      const g = this.game, me = this.me(), o = g.players[pid];
      const s = g.warScore(me.id, pid);
      const outlook = data => {
        if (o.human) return `<span class="tag">${PP.t('Decisão de {x}', { x: esc(o.name) })}</span>`;
        return g.termsOutlook(me.id, pid, data).ok ? `<span class="tag good">${PP.t('Provável')}</span>` : `<span class="tag bad">${PP.t('Improvável')}</span>`;
      };
      const rows = g.peaceTermOptions(me.id, pid).map(t => {
        const chk = g.canPropose(me.id, pid, 'peace_terms', t);
        let name = '', desc = '';
        if (t.term === 'reparations') { name = PP.PEACE_TERMS.reparations.name; desc = PP.t('Eles pagam {a}★ por turno durante {t} turnos ({n}★ no total).', { a: t.amount, t: t.turns, n: t.amount * t.turns }); }
        else if (t.term === 'city') { const c = g.cityMap[t.city]; name = PP.t('Cessão de {c}', { c: esc(c.name) }); desc = PP.t('Cidade de nível {n}{m}. A cidade fica ocupada por 2 turnos.', { n: PP.roman(c.level), m: c.metropolis ? ' · ' + PP.t('Metrópole') : '' }); }
        else { name = PP.PEACE_TERMS.vassal.name; desc = PP.PEACE_TERMS.vassal.desc; }
        const icon = PP.PEACE_TERMS[t.term].icon;
        return `<div class="row">${ico(icon, 'ci big-ico')}<div class="rt"><div class="rn">${name} ${outlook(t)}</div><div class="rs">${desc}${chk.ok ? '' : ` · <span class="cr">${esc(chk.reason)}</span>`}</div></div>
          <div class="ra"><button type="button" class="chip-btn" data-m="termsSend" data-p="${pid}" data-term="${t.term}" data-amount="${t.amount || ''}" data-city="${t.city || ''}" ${chk.ok ? '' : 'disabled'}>${PP.t('Exigir')}</button></div></div>`;
      }).join('');
      const html = `<div class="modal-h">${crest(o.color, tribeIcon(o.tribe), 'crest-l')}<div class="mh-t"><h2>${PP.t('Termos de paz com {x}', { x: esc(o.name) })}</h2>
        <div class="sub">${PP.t('Placar da guerra: {n}', { n: signed(s) })} · ${PP.t('tropas derrotadas, cidades tomadas e saques')}</div></div>${this.closeX()}</div>
        <div class="modal-b"><p class="note">${PP.t('Quanto melhor o placar, mais eles aceitam ceder. Se aceitarem, a paz é assinada na hora e abre uma trégua de {n} turnos.', { n: PP.TRUCE_TURNS })}</p>
        <div class="list">${rows}</div>${this.opinionLine(me.id, pid)}</div>`;
      if (refresh) this.replaceModal('terms', html); else this.openModal('terms', html, { narrow: true });
    },

    // ============================================================ Extensões da Diplomacia
    diploTagsExt(o) {
      const g = this.game, me = this.viewer;
      if (g.overlordOf(o.id) === me) return ` <span class="tag gold">${PP.t('Seu vassalo')}</span>`;
      if (g.overlordOf(me) === o.id) return ` <span class="tag bad">${PP.t('Seu suserano')}</span>`;
      if (g.isVassal(o.id)) return ` <span class="tag">${PP.t('Vassalo de {x}', { x: esc(g.players[g.overlordOf(o.id)].name) })}</span>`;
      return '';
    },

    diploInfoExt(o) {
      const g = this.game, me = this.viewer;
      const parts = [PP.t('governo: {x}', { x: PP.GOVERNMENTS[o.gov].name })];
      const truce = g.truceUntil(me, o.id);
      if (truce) parts.push(PP.t('trégua até o turno {n}', { n: truce }));
      if (g.atWar(me, o.id)) { const s = g.warScore(me, o.id); if (s) parts.push(PP.t('placar da guerra {n}', { n: signed(s) })); }
      return ' · ' + parts.join(' · ');
    },

    diploActionsExt(o, st) {
      const g = this.game, me = this.me();
      const btn = (m, label, icon, cls) => `<button type="button" class="chip-btn ${cls || ''}" data-m="${m}" data-p="${o.id}">${ico(icon)} ${label}</button>`;
      if (g.overlordOf(o.id) === me.id) return btn('annexOpen', PP.t('Anexar'), 'd_annex') + btn('release', PP.t('Libertar'), 'd_release');
      if (g.overlordOf(me.id) === o.id) return btn('independence', PP.t('Declarar independência'), 'd_independence', 'danger');
      if (g.isVassal(me.id) || g.isVassal(o.id)) return '';
      if (st === 'war') return btn('terms', PP.t('Exigir termos'), 'd_terms');
      if (!g.vassalsOf(o.id).length && g.strength(o.id) < g.strength(me.id) * 0.5) return btn('protect', PP.t('Oferecer proteção'), 'd_vassal');
      return '';
    },

    diploNoteExt() {
      return `<p class="note">${PP.t('Vencendo uma guerra, exija <b>termos de paz</b>: reparações, uma cidade ou a vassalagem. Toda paz abre uma <b>trégua</b> de {n} turnos.', { n: PP.TRUCE_TURNS })}</p>`;
    },
  });

  // ------------------------------------------------------------ Propostas novas
  const prevInfo = proto.proposalInfo;
  proto.proposalInfo = function (pr) {
    const type = pr.type || 'peace';
    if (type === 'joint_war' || type === 'call_to_arms') {
      // aceitar entra em guerra: avisa se isso rompe uma trégua
      const info = prevInfo.call(this, pr);
      const t = pr.data && pr.data.target;
      if (t != null && this.game.truceUntil(this.viewer, t) > this.game.turn) info.body += ' ' + PP.t('Atenção: isso rompe a trégua com eles (−2 de reputação).');
      return info;
    }
    if (type !== 'peace_terms' && type !== 'vassal_offer' && type !== 'annex') return prevInfo.call(this, pr);
    const g = this.game;
    const from = g.players[pr.from];
    const n = esc(from.name), x = from.name;
    const d = pr.data || {};
    const vassalText = PP.t('Vassalos pagam {r}% das estrelas por turno, entram nas guerras do suserano e não declaram guerra nem fazem alianças sozinhos; dá para declarar independência depois (vira guerra).', { r: Math.round(g.tributeRate(pr.from) * 100) });
    if (type === 'peace_terms') {
      let body;
      if (d.term === 'reparations') body = PP.t('<b>{n}</b> oferece a paz se você pagar <b>{a}★ por turno durante {t} turnos</b>.', { n, a: d.amount, t: PP.VASSAL.reparationsTurns });
      else if (d.term === 'city') { const c = g.cityMap[d.city]; body = PP.t('<b>{n}</b> oferece a paz se você entregar <b>{c}</b>.', { n, c: esc(c ? c.name : '?') }); }
      else body = PP.t('<b>{n}</b> oferece a paz se você se tornar vassalo deles.', { n }) + ' ' + vassalText;
      body += ' ' + PP.t('Placar da guerra para eles: {s}. Recusar mantém a guerra.', { s: signed(g.warScore(pr.from, this.viewer)) });
      return { title: PP.t('Termos de paz'), short: PP.t('termos de paz'), yes: PP.t('Aceitar os termos'), no: PP.t('Continuar a guerra'),
        okText: PP.t('Paz assinada com {x}.', { x }), noText: PP.t('A guerra com {x} continua.', { x }), body };
    }
    if (type === 'vassal_offer') {
      return { title: PP.t('Oferta de proteção'), short: PP.t('proteção'), yes: PP.t('Aceitar a vassalagem'), no: PP.t('Recusar'),
        okText: PP.t('Você agora é vassalo de {x}.', { x }), noText: PP.t('Você recusou a proteção de {x}.', { x }),
        body: PP.t('<b>{n}</b> oferece proteção se você se tornar vassalo deles.', { n }) + ' ' + vassalText };
    }
    return { title: PP.t('Anexação'), short: PP.t('anexação'), yes: PP.t('Aceitar a anexação'), no: PP.t('Recusar'),
      okText: PP.t('Seu reino foi anexado por {x}.', { x }), noText: PP.t('Você recusou a anexação.'),
      body: PP.t('<b>{n}</b>, seu suserano, propõe anexar o seu reino: todas as suas cidades e tropas passam para eles e sua tribo deixa de existir (você perde a partida).', { n }) };
  };

  // ------------------------------------------------------------ Avisos
  const prevEvent = proto.onGameEventExt;
  proto.onGameEventExt = function (type, d) {
    const g = this.game, v = this.viewer;
    const me = g.players[v];
    const name = id => (g.players[id] ? g.players[id].name : '?');
    switch (type) {
      case 'gov':
        if (d.player === v) {
          if (d.type === 'change') this.toast(d.gov === 'imperio' ? PP.t('Você proclamou o Império!') : PP.t('{g} adotada: anarquia por {n} turnos.', { g: PP.GOVERNMENTS[d.gov].name, n: d.anarchy }), d.gov === 'imperio' ? 'gold' : '');
          else if (d.type === 'stable') this.toast(PP.t('Fim da anarquia: {g} em vigor.', { g: PP.GOVERNMENTS[d.gov].name }), 'good');
          this.renderHud();
        } else if (d.type === 'change' && d.gov === 'imperio' && me && me.met[d.player]) this.toast(PP.t('{p} proclamou o Império!', { p: name(d.player) }), 'gold');
        return;
      case 'loan':
        if (d.player !== v) return;
        if (d.type === 'take') this.toast(PP.t('Empréstimo recebido: +{n}★.', { n: d.amount }), 'gold');
        else if (d.type === 'repaid') this.toast(PP.t('Empréstimo quitado.'), 'good');
        else if (d.type === 'missed') this.toast(PP.t('Parcela do empréstimo atrasada ({n}/{m})!', { n: d.missed, m: PP.LOAN_RULES.missLimit }), 'bad');
        else if (d.type === 'bankrupt') this.toast(PP.t('Calote! A reputação caiu e o governo entrou em anarquia.'), 'bad');
        this.renderHud();
        return;
      case 'vassal':
        if (d.type === 'new') {
          if (d.overlord === v) this.toast(PP.t('{x} agora é seu vassalo.', { x: name(d.vassal) }), 'gold');
          else if (d.vassal === v) this.toast(PP.t('Você agora é vassalo de {x}.', { x: name(d.overlord) }), 'bad');
          else if (me && me.met[d.vassal]) this.toast(PP.t('{x} tornou-se vassalo de {y}.', { x: name(d.vassal), y: name(d.overlord) }), '');
        } else if (d.type === 'annexed') {
          if (d.overlord === v) this.toast(PP.t('Você anexou {x}!', { x: name(d.vassal) }), 'gold');
          else if (me && me.met[d.overlord]) this.toast(PP.t('{y} anexou {x}.', { x: name(d.vassal), y: name(d.overlord) }), '');
        } else if (d.type === 'released') {
          if (d.vassal === v) this.toast(PP.t('Você não é mais vassalo de {x}.', { x: name(d.overlord) }), 'good');
          else if (d.overlord === v && d.how !== 'release') this.toast(PP.t('{x} não é mais seu vassalo.', { x: name(d.vassal) }), 'bad');
        } else if (d.type === 'independence' && d.overlord !== v && d.vassal !== v && me && me.met[d.vassal]) {
          this.toast(PP.t('{x} declarou independência de {y}!', { x: name(d.vassal), y: name(d.overlord) }), '');
        }
        if (this.modals.some(m => m.kind === 'realm')) this.openRealm(true);
        return;
      case 'terms': {
        const what = d.term === 'reparations' ? PP.t('reparações de {n}★ por turno', { n: d.amount }) : d.term === 'city' ? PP.t('a cessão de {c}', { c: g.cityMap[d.city] ? g.cityMap[d.city].name : '?' }) : PP.t('vassalagem');
        if (d.winner === v) this.toast(PP.t('{x} aceitou os termos: {w}.', { x: name(d.loser), w: what }), 'gold');
        else if (d.loser === v) this.toast(PP.t('Paz com {x}: {w}.', { x: name(d.winner), w: what }), 'bad');
        return;
      }
      case 'cession':
        if (d.to === v) this.toast(PP.t('{c} agora é sua.', { c: d.city.name }), 'good');
        else if (d.from === v) this.toast(PP.t('Você cedeu {c}.', { c: d.city.name }), 'bad');
        return;
    }
    if (prevEvent) prevEvent.call(this, type, d);
  };

  // ------------------------------------------------------------ Ações
  const prevModal = proto.modalActionExt;
  proto.modalActionExt = function (a, d, btn) {
    const g = this.game;
    if (!g || ['gov', 'tax', 'loan', 'repay', 'annexOpen', 'release', 'independence', 'terms', 'termsSend', 'protect'].indexOf(a) < 0) {
      if (prevModal) prevModal.call(this, a, d, btn);
      return;
    }
    const me = this.me();
    if (!this.myTurn()) { this.toast(PP.t('Espere a sua vez.'), 'bad'); return; }
    const refresh = () => {
      this.afterAction();
      if (this.modals.some(m => m.kind === 'realm')) this.openRealm(true);
      if (this.modals.some(m => m.kind === 'diplo')) this.openDiplomacy(true);
    };
    switch (a) {
      case 'gov': {
        const chk = g.govCheck(me, d.v);
        if (chk.current) break;
        if (!chk.ok) { this.toast(chk.reason, 'bad'); break; }
        const def = PP.GOVERNMENTS[d.v];
        this.ask(d.v === 'imperio' ? PP.t('Proclamar o Império?') : PP.t('Adotar {g}?', { g: def.name }),
          `<p>${esc(def.desc)}</p><p>${PP.t('A transição causa <b>{n} turno(s) de anarquia</b>: metade das estrelas e da ciência das cidades, sem efeitos de governo e −10 de lealdade. A próxima troca só poderá ser feita {m} turnos depois.', { n: chk.anarchy, m: PP.GOV_RULES.cooldown })}</p>`,
          d.v === 'imperio' ? PP.t('Proclamar') : PP.t('Adotar'), PP.t('Cancelar')).then(ok => { if (ok && g.adoptGov(me, d.v)) refresh(); });
        break;
      }
      case 'tax':
        if (g.setTax(me, d.v)) refresh();
        break;
      case 'loan': {
        const chk = g.loanCheck(me, d.v);
        if (!chk.ok) { this.toast(chk.reason, 'bad'); break; }
        const t = chk.terms;
        this.ask(PP.t('Pedir {x}?', { x: PP.LOANS[d.v].name.toLowerCase() }), `<p>${PP.t('Você recebe <b>{a}★</b> agora e devolve <b>{m}★</b> em {t} parcelas de {p}★, cobradas no começo dos próximos turnos. Atrasar 3 parcelas seguidas é calote: −2 de reputação, anarquia e crédito suspenso.', { a: t.amount, m: t.total, t: t.turns, p: t.per })}</p>`,
          PP.t('Pedir'), PP.t('Cancelar')).then(ok => { if (ok && g.takeLoan(me, d.v)) refresh(); });
        break;
      }
      case 'repay':
        if (g.repayLoan(me)) refresh(); else this.toast(PP.t('Faltam estrelas'), 'bad');
        break;
      case 'annexOpen': {
        const vid = +d.p, V = g.players[vid];
        const chk = g.canPropose(me.id, vid, 'annex');
        if (!chk.ok) { this.toast(chk.reason, 'bad'); break; }
        this.ask(PP.t('Propor a anexação de {x}?', { x: esc(V.name) }), `<p>${PP.t('Se aceitarem, você paga {n}★ e recebe todas as cidades, tropas, fortificações, maravilhas e o tesouro deles; a tribo deixa de existir. Eles decidem conforme a opinião sobre você ({o}).', { n: g.annexCost(vid), o: signed(g.opinion(vid, me.id)) })}</p>`,
          PP.t('Propor'), PP.t('Cancelar')).then(ok => { if (!ok) return; this.proposeResult(g.propose(me.id, vid, 'annex'), V); refresh(); });
        break;
      }
      case 'release': {
        const vid = +d.p, V = g.players[vid];
        this.ask(PP.t('Libertar {x}?', { x: esc(V.name) }), `<p>${PP.t('{x} deixa de ser seu vassalo e de pagar tributo. Vocês ficam em paz, com trégua de {n} turnos, e eles vão se lembrar com gratidão.', { x: esc(V.name), n: PP.TRUCE_TURNS })}</p>`,
          PP.t('Libertar'), PP.t('Cancelar')).then(ok => { if (ok && g.releaseVassal(me.id, vid)) refresh(); });
        break;
      }
      case 'independence': {
        const O = g.players[g.overlordOf(me.id)];
        if (!O) break;
        this.ask(PP.t('Declarar independência?'), `<p>${PP.t('Você deixa de ser vassalo de {x} e entra em guerra contra eles (sem perder reputação). Os aliados e os outros vassalos deles também lutarão contra você.', { x: esc(O.name) })}</p>`,
          PP.t('Declarar independência'), PP.t('Continuar vassalo')).then(ok => { if (ok && g.declareIndependence(me.id)) refresh(); });
        break;
      }
      case 'terms': this.openTerms(+d.p); break;
      case 'termsSend': {
        const o = g.players[+d.p];
        const data = { term: d.term };
        if (d.term === 'reparations') data.amount = +d.amount;
        if (d.term === 'city') data.city = +d.city;
        const res = g.propose(me.id, o.id, 'peace_terms', data);
        if (res === 'invalid') this.toast(g.canPropose(me.id, o.id, 'peace_terms', data).reason || PP.t('Proposta inválida agora.'), 'bad');
        else this.proposeResult(res, o);
        this.closeModal('terms');
        refresh();
        break;
      }
      case 'protect': {
        const o = g.players[+d.p];
        this.ask(PP.t('Oferecer proteção a {x}?', { x: esc(o.name) }), `<p>${PP.t('Se aceitarem, viram seus vassalos: pagam tributo, entram nas suas guerras e você deve defendê-los. Tribos bem mais fracas, que gostam de você e se sentem ameaçadas, tendem a aceitar.')}</p>`,
          PP.t('Oferecer'), PP.t('Cancelar')).then(ok => { if (!ok) return; this.proposeResult(g.propose(me.id, o.id, 'vassal_offer'), o); refresh(); });
        break;
      }
    }
  };

  // ------------------------------------------------------------ HUD: botão Reino, atalho R e o governo no brasão
  const prevBind = proto.bindHud;
  proto.bindHud = function (...args) {
    const r = prevBind.apply(this, args);
    const b = document.getElementById('btn-realm');
    if (b) b.onclick = () => this.openRealm();
    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (!this.game || this.modals.length || !$('#menu').hidden) return;
      if (e.key.toLowerCase() === 'r') this.openRealm();
    });
    return r;
  };

  const prevHud = proto.renderHud;
  proto.renderHud = function (...args) {
    const r = prevHud.apply(this, args);
    const g = this.game, chip = $('#tb-tribe');
    if (g && chip) {
      const p = this.me();
      const anarchy = g.inAnarchy(p);
      chip.classList.toggle('anarchy', anarchy);
      chip.title = anarchy ? PP.t('Anarquia até o turno {n}', { n: p.anarchyUntil }) : PP.t('Governo: {x}', { x: PP.GOVERNMENTS[p.gov].name });
      if (p.gov === 'imperio' && !anarchy) chip.insertAdjacentHTML('beforeend', `<span class="gov-mark" aria-hidden="true">${ico('gv_imperio')}</span>`);
    }
    return r;
  };
})(window.PP = window.PP || {});
