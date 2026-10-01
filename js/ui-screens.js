/* Chamas de Vardren — telas e seções da interface para os sistemas estendidos: objetivos e vitórias, eventos,
   especialização, lealdade e rotas das cidades, propostas diplomáticas, comércio, tributo, guerra conjunta,
   espionagem, ruínas, conquistas, replay e estatísticas finais. Estende PP.UI (ui.js). */
(function (PP) {
  'use strict';
  const H = PP.uiHelpers;
  const { esc, SCI, tribeIcon, crest, ico, store, load } = H;
  const UN = PP.UNITS;
  const $ = (s, r) => (r || document).querySelector(s);
  const ACH_KEY = 'chamas-vardren:achievements';

  const bar = (pct, cls) => `<span class="bar ${cls || ''}"><i style="width:${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%"></i></span>`;

  Object.assign(PP.UI.prototype, {
    // ============================================================ Criação de partida
    setupExtras(s) {
      const scen = Object.entries(PP.SCENARIOS).map(([id, sc]) => `<button type="button" class="card ${s.scenario === id ? 'go' : ''}" data-s="scenario" data-v="${id}">
        <div class="card-row">${ico(sc.icon, 'ci')}<span class="cn">${sc.name}</span></div><span class="cd">${esc(sc.desc)}</span></button>`).join('');
      const forced = PP.SCENARIOS[s.scenario] && PP.SCENARIOS[s.scenario].configure && /victories/.test(String(PP.SCENARIOS[s.scenario].configure));
      const vic = ['ciencia', 'economia', 'maravilhas', 'territorio', 'diplomacia'].map(k => `<button type="button" class="${s.victories[k] ? 'on' : ''}" data-s="vic" data-k="${k}" title="${esc(PP.VICTORIES[k].desc)}">${PP.VICTORIES[k].name}</button>`).join('');
      return `<div class="field"><span class="lbl">Cenário</span><div class="grid">${scen}</div></div>
        <div class="row2">
          <div class="field"><span class="lbl">Outras vitórias${forced ? ' · o cenário define as vitórias' : ''}</span><div class="seg">${vic}</div></div>
          <div class="field"><span class="lbl">Eventos mundiais</span><div class="seg"><button type="button" class="${s.events ? 'on' : ''}" data-s="events">${s.events ? 'Ativados' : 'Desativados'}</button></div></div>
        </div>`;
    },

    // ============================================================ Eventos mundiais
    renderEventChip() {
      const g = this.game, chip = $('#tb-event');
      if (!chip) return;
      const ev = g && g.events;
      if (!ev || (!ev.active.length && !ev.upcoming)) { chip.hidden = true; return; }
      const a = ev.active[0];
      if (a) {
        const def = PP.EVENTS[a.id];
        const left = a.end - g.turn + 1;
        chip.className = 'res res-event';
        chip.innerHTML = `${ico(def.icon)}<span>${def.name} · ${left}t</span>`;
        chip.title = def.desc;
      } else {
        const def = PP.EVENTS[ev.upcoming.id];
        chip.className = 'res res-event soon';
        chip.innerHTML = `${ico(def.icon)}<span>${def.name} em ${Math.max(0, ev.upcoming.start - g.turn)}t</span>`;
        chip.title = 'Previsão: ' + def.desc;
      }
      chip.hidden = false;
    },

    announceEvents() {
      const g = this.game, ev = g.events;
      if (!ev) return;
      for (const a of ev.active) if (a.start === g.turn) this.toast(`${PP.EVENTS[a.id].name}: ${PP.EVENTS[a.id].desc}`, 'gold');
      if (ev.upcoming && ev.upcoming.announced >= g.turn - 1) this.toast(`Previsão: ${PP.EVENTS[ev.upcoming.id].name} no turno ${ev.upcoming.start}.`, '');
    },

    // ============================================================ Propostas e relações
    proposalInfo(pr) {
      const g = this.game;
      const from = g.players[pr.from];
      const n = esc(from.name);
      const type = pr.type || 'peace';
      const d = pr.data || {};
      const items = o => {
        const out = [];
        if (o.stars) out.push(`${o.stars}★`);
        if (o.sci) out.push(`${o.sci}${SCI}`);
        if (o.iron) out.push(`Ferro por ${PP.LEASE_TURNS} turnos`);
        if (o.horses) out.push(`Cavalos por ${PP.LEASE_TURNS} turnos`);
        return out.join(' + ') || 'nada';
      };
      switch (type) {
        case 'peace': return { title: 'Proposta de paz', short: 'paz', yes: 'Aceitar a paz', no: 'Recusar', okText: `Paz assinada com ${from.name}.`, noText: `Você recusou a paz com ${from.name}.`,
          body: `<b>${n}</b> propõe um tratado de paz. Em paz, nenhum dos dois pode atacar o outro nem entrar nas cidades do outro. Quebrar um tratado mancha sua reputação.` };
        case 'nap': return { title: 'Pacto de não agressão', short: 'pacto', yes: 'Assinar o pacto', no: 'Recusar', okText: `Pacto firmado com ${from.name}.`, noText: `Você recusou o pacto de ${from.name}.`,
          body: `<b>${n}</b> propõe um pacto de não agressão por ${(d.turns || PP.NAP_TURNS)} turnos. Cumprir o pacto melhora a reputação dos dois; rompê-lo custa 2 de reputação com todas as tribos.` };
        case 'alliance': return { title: 'Proposta de aliança', short: 'aliança', yes: 'Formar aliança', no: 'Recusar', okText: `Aliança formada com ${from.name}!`, noText: `Você recusou a aliança com ${from.name}.`,
          body: `<b>${n}</b> quer uma aliança: visão compartilhada, tecnologias 20% mais baratas quando o aliado já as conhece e ajuda mútua na guerra (chamado às armas). Trair uma aliança custa 3 de reputação.` };
        case 'trade': return { title: 'Acordo comercial', short: 'comércio', yes: 'Aceitar o acordo', no: 'Recusar', okText: `Acordo fechado com ${from.name}.`, noText: `Você recusou o acordo de ${from.name}.`,
          body: `<b>${n}</b> oferece <b>${items(d.give || {})}</b> em troca de <b>${items(d.get || {})}</b>.` };
        case 'tribute_demand': return { title: 'Exigência de tributo', short: 'tributo', yes: `Pagar ${d.amount}★`, no: 'Recusar', okText: `Você pagou ${d.amount}★ a ${from.name}.`, noText: `Você recusou o tributo exigido por ${from.name}.`,
          body: `<b>${n}</b> exige <b>${d.amount}★</b> de tributo. Pagar evita atrito agora; recusar pode levar à guerra.` };
        case 'joint_war': { const t = g.players[d.target]; return { title: 'Guerra conjunta', short: 'guerra conjunta', yes: `Declarar guerra a ${t.name}`, no: 'Recusar', okText: `Você entrou na guerra contra ${t.name}.`, noText: 'Você recusou a guerra conjunta.',
          body: `<b>${n}</b> propõe que vocês dois declarem guerra a <b>${esc(t.name)}</b> juntos.${g.relState(this.viewer, d.target) === 'nap' ? ' Atenção: isso rompe o seu pacto com eles.' : ''}` }; }
        case 'call_to_arms': { const t = g.players[d.target]; return { title: 'Chamado às armas', short: 'chamado às armas', yes: `Guerra contra ${t.name}`, no: 'Ficar de fora', okText: `Você honrou a aliança contra ${t.name}.`, noText: 'Você ficou de fora da guerra.',
          body: `Seu aliado <b>${n}</b> foi atacado por <b>${esc(t.name)}</b> e pede ajuda. Honrar o chamado melhora muito a relação; recusar decepciona o aliado.${g.relState(this.viewer, d.target) === 'nap' ? ' Atenção: isso rompe o seu pacto com eles.' : ''}` }; }
      }
      return { title: 'Proposta', short: type, yes: 'Aceitar', no: 'Recusar', okText: 'Aceito.', noText: 'Recusado.', body: `<b>${n}</b> faz uma proposta.` };
    },

    opinionLine(pid, other) {
      const g = this.game;
      const theirs = g.opinion(other, pid), tl = g.opinionLabel(theirs);
      return `<p class="note">Opinião deles sobre você: <span class="tag ${tl.tag}">${tl.name} (${theirs > 0 ? '+' : ''}${theirs})</span> · Reputação deles: ${g.players[other].reputation || 0}</p>`;
    },

    relTag(owner) {
      const g = this.game;
      const st = g.relState(this.viewer, owner);
      if (st === 'self') return '';
      const R = PP.RELATIONS[st] || PP.RELATIONS.war;
      return `<span class="tag ${R.tag}">${st === 'war' ? 'Em guerra' : R.name}</span>`;
    },

    // ============================================================ Unidades
    unitStatus(u) {
      const g = this.game;
      const bits = [];
      if (g.isStealthed && g.isStealthed(u)) bits.push('<span class="tag gold">Furtiva</span>');
      if (u.owner === this.viewer && g.supplyLevel) {
        const lv = g.supplyLevel(u);
        if (lv > 0) bits.push(`<span class="tag bad">Sem suprimentos ${lv === 2 ? '−35%' : '−20%'}</span>`);
        else if (!g.isSupplied(u)) bits.push('<span class="tag">Fora do abastecimento (penalidade no próximo turno)</span>');
      }
      if (u.buff) {
        for (const k in u.buff) {
          if (!u.buff[k]) continue;
          const name = PP.ABILITIES[k] ? PP.ABILITIES[k].name : k === 'amphib' ? 'Desembarque (−25% de ataque)' : null;
          if (name) bits.push(`<span class="tag gold">${name}</span>`);
        }
      }
      const dn = g.defenseNotes ? g.defenseNotes(u) : [];
      if (dn.length) bits.push(`<span class="tag">Defesa: ${esc(dn.join(', '))}</span>`);
      if (u.cd) {
        const waits = Object.keys(u.cd).filter(k => u.cd[k] > g.turn && PP.ABILITIES[k]).map(k => `${PP.ABILITIES[k].name} em ${u.cd[k] - g.turn}t`);
        if (waits.length && u.owner === this.viewer) bits.push(`<span class="tag">${waits.join(' · ')}</span>`);
      }
      return bits.length ? `<p class="note">${bits.join(' ')}</p>` : '';
    },

    unitExtraSections(u) {
      const g = this.game;
      let html = '';
      if (u.cargo) {
        const cap = UN[u.type].cargo || 0;
        const rows = u.cargo.map(x => {
          const tg = g.unloadTargets(u, x);
          return this.act('unloadSel', 'u_' + x.type, 'Desembarcar ' + UN[x.type].name, `${x.hp}♥`, { off: !tg.length, reason: tg.length ? '' : x.boarded === g.turn ? 'Embarcou agora' : 'Sem praia livre', data: { id: x.id } });
        });
        html += `<div class="sec-lbl">A bordo (${u.cargo.length}/${cap})</div>${rows.length ? `<div class="acts">${rows.join('')}</div>` : '<p class="note">Vazio. Leve uma tropa terrestre até o transporte para embarcar.</p>'}`;
      }
      if (UN[u.type].spy) {
        const ms = g.spyMissions(u);
        const acts = ms.map(m => this.act('spy', m.def.icon, m.def.name, m.ok || m.risk ? Math.round(m.risk * 100) + '% risco' : null,
          { off: !m.ok, reason: m.ok ? '' : m.reason, data: { id: m.id }, title: m.def.desc }));
        html += `<div class="sec-lbl">Missões</div><div class="acts">${acts.join('')}</div>`;
      }
      return html;
    },

    // ============================================================ Cidades
    citySections(c) {
      const g = this.game, p = this.me(), my = this.myTurn();
      let html = '';
      // Especialização
      const specs = Object.entries(PP.SPECS).map(([id, sp]) => {
        const chk = g.specCheck(p, c, id);
        if (chk.locked && sp.coastal) return '';
        return `<button type="button" class="card ${chk.current ? 'go' : chk.ok && my ? '' : 'locked'}" data-m="spec" data-city="${c.id}" data-v="${id}">
          <div class="card-row">${ico(sp.icon, 'ci')}<span class="cn">${sp.name}</span></div>
          <span class="cc star">${chk.current ? 'Atual' : chk.cost + '★'}</span>
          <span class="cd"><b>Bônus:</b> ${esc(sp.bonus)}</span><span class="cd"><b>Custo:</b> ${esc(sp.cost)}</span>
          ${!chk.ok && !chk.current ? `<span class="cr">${esc(chk.reason)}</span>` : ''}</button>`;
      }).join('');
      html += `<div class="sec-lbl">Especialização${c.spec ? '' : ' · uma cidade não pode ser boa em tudo'}</div><div class="grid">${specs}</div>`;
      // Lealdade
      const st = g.cityStatus(c);
      const target = g.loyaltyTarget(c);
      const facs = g.loyaltyFactors(c).map(f => `${esc(f[0])} ${f[1] > 0 ? '+' : ''}${f[1]}`).join(' · ');
      const founder = g.players[c.founder];
      html += `<div class="sec-lbl">Lealdade</div>
        <p class="note">${bar(c.loyalty / 100, c.loyalty < 30 ? 'bad' : '')} ${c.loyalty}/100 ${st ? `<span class="tag ${st.tag}">${st.name}</span>` : ''}
        ${c.founder !== c.owner && founder ? ` · fundada por ${esc(founder.name)} · tende a ${target}` : ''}</p>
        ${c.founder !== c.owner || c.unrest || c.occupied ? `<p class="note">${facs}</p>` : ''}`;
      // Rotas
      const slots = g.routeSlots(c);
      if (slots) {
        const mine = g.routesOf(c);
        const rows = mine.map(r => {
          const other = g.cityMap[r.a === c.id ? r.b : r.a];
          const y = g.routeYield(r);
          const state = !r.active ? '<span class="tag bad">Interrompida</span>' : r.threat ? '<span class="tag bad">Ameaçada</span>' : '<span class="tag good">Ativa</span>';
          return `<div class="row"><div class="rt"><div class="rn">${esc(other ? other.name : '?')} ${state} ${r.kind === 'foreign' ? `<span class="tag gold">${esc(g.players[r.partner].name)}</span>` : ''}${r.sea ? ' <span class="tag">Marítima</span>' : ''}</div>
            <div class="rs">+${y.stars}★${y.sci ? ` · +${y.sci}${SCI}` : ''} · ${r.len} casas · há ${g.turn - r.since} turnos</div></div>
            ${my ? `<div class="ra"><button type="button" class="chip-btn danger" data-m="cancelRoute" data-id="${r.id}" data-city="${c.id}">Encerrar</button></div>` : ''}</div>`;
        }).join('');
        let cands = '';
        if (my && mine.length < slots) {
          const list = g.routeCandidates(p, c).slice(0, 6);
          cands = list.map(x => {
            const chk = x.check;
            const y = x.yield;
            return `<div class="row"><div class="rt"><div class="rn">${esc(x.city.name)} ${x.city.owner !== p.id ? `<span class="tag gold">${esc(g.players[x.city.owner].name)}</span>` : ''}</div>
              <div class="rs">${y ? `+${y.stars}★${y.sci ? ` · +${y.sci}${SCI}` : ''}${y.partnerStars ? ` (eles +${y.partnerStars}★)` : ''} · ${chk.len} casas${chk.sea ? ' · marítima' : ''}` : ''}${!chk.ok ? ` · <span class="cr">${esc(chk.reason)}</span>` : ''}</div></div>
              <div class="ra"><button type="button" class="chip-btn" data-m="route" data-city="${c.id}" data-to="${x.city.id}" ${chk.ok ? '' : 'disabled'}>Abrir · ${chk.cost}★</button></div></div>`;
          }).join('') || '<p class="note">Nenhum destino alcançável. Ligue cidades por estradas ou portos (distância mínima de 3 casas).</p>';
        }
        html += `<div class="sec-lbl">Rotas comerciais (${mine.length}/${slots})</div><div class="list">${rows}${cands}</div>`;
      }
      // Grande Observatório
      if (g.victoryEnabled('ciencia') && c.spec === 'ciencia') {
        const chk = g.projectCheck(p, c);
        const P = PP.SCIENCE_PROJECT;
        html += `<div class="sec-lbl">${P.name} · vitória científica</div>
          <div class="row"><div class="rt"><div class="rn">Etapa ${Math.min(p.project.stage + 1, P.stages.length)} de ${P.stages.length}</div>
          <div class="rs">${bar(p.project.stage / P.stages.length)} ${p.project.stage >= P.stages.length ? 'Concluído' : `${chk.cost}${SCI}`}${!chk.ok ? ` · ${esc(chk.reason)}` : ''}</div></div>
          ${my ? `<div class="ra"><button type="button" class="chip-btn" data-m="project" data-city="${c.id}" ${chk.ok ? '' : 'disabled'}>Construir etapa</button></div>` : ''}</div>`;
      }
      return html;
    },

    // ============================================================ Ruínas
    openRuinChoice() {
      const g = this.game, p = this.me();
      const pr = p.pendingRuin;
      if (!pr || this.modals.some(m => m.kind === 'ruin')) return;
      const t = g.tile(pr.x, pr.y);
      const def = PP.RUIN_TYPES[pr.type];
      if (!t || !def) return;
      const cards = g.ruinOptions(p, t).map(o => `<button type="button" class="card big ${o.ok ? 'go' : 'locked'}" data-m="ruin" data-v="${o.id}">
        ${ico({ explore: 'ui_ruins', loot: 'a_pillage', restore: 'a_repair', honor: 'd_treaty' }[o.id], 'ci')}<span class="cn">${esc(o.name)}</span><span class="cd">${esc(o.desc)}</span>${o.ok ? '' : `<span class="cr">${esc(o.reason || '')}</span>`}</button>`).join('');
      this.openModal('ruin', `<div class="modal-h"><div><h2>${esc(def.name)}</h2><div class="sub">${esc(def.text)}</div></div></div>
        <div class="modal-b"><div class="grid">${cards}</div></div>`, { narrow: true, lock: true });
    },

    // ============================================================ Espionagem
    openIntel(pid) {
      const g = this.game, me = this.me();
      const r = me.intel && me.intel[pid];
      const o = g.players[pid];
      if (!r || !o) return;
      const types = Object.entries(r.byType).map(([t, n]) => `${n}× ${UN[t].name}`).join(', ');
      const rels = Object.entries(r.relations).map(([k, st]) => `${esc(g.players[k].name)}: ${PP.RELATIONS[st] ? PP.RELATIONS[st].name.toLowerCase() : st}`).join(' · ');
      this.openModal('intel', `<div class="modal-h">${crest(o.color, tribeIcon(o.tribe), 'crest-l')}<div class="mh-t"><h2>Relatório: ${esc(o.name)}</h2><div class="sub">Obtido no turno ${r.turn}</div></div>${this.closeX()}</div>
        <div class="modal-b"><div class="stats"><span class="st gold">★ ${r.stars}</span><span class="st sci">${SCI} ${r.science}</span>${this.stat('s_atk', `${r.units} unidades · força ${r.strength}`)}${this.stat('ui_tech', `${r.techs} tecnologias`)}${this.stat('ui_city', `${r.cities} cidades`)}</div>
        <p class="note">Exército: ${esc(types || 'nenhum')}</p>
        ${r.strategy && PP.AI_STRATEGIES ? `<p class="note">Objetivo atual: <b>${PP.AI_STRATEGIES[r.strategy].name}</b> — ${esc(PP.AI_STRATEGIES[r.strategy].desc)}${r.target != null && g.players[r.target] ? ` Alvo preferido: <b>${esc(g.players[r.target].name)}</b>.` : ''}</p>` : ''}
        <p class="note">Relações: ${rels || 'nenhuma conhecida'}</p>
        <p class="note">Opinião deles sobre você: ${r.opinionOfYou}</p></div>`, { narrow: true });
    },

    // ============================================================ Comércio, tributo e guerra conjunta
    openTrade(pid, refresh) {
      const g = this.game, me = this.me(), o = g.players[pid];
      if (!this.tradeState || this.tradeState.to !== pid) this.tradeState = { to: pid, give: { stars: 0, sci: 0, iron: 0, horses: 0 }, get: { stars: 0, sci: 0, iron: 0, horses: 0 } };
      const ts = this.tradeState;
      const side = (key, who, owner) => {
        const it = ts[key];
        const step = (k, label, max, unit) => `<div class="trade-row"><span>${label}</span>
          <button type="button" class="chip-btn" data-m="tradeSet" data-side="${key}" data-k="${k}" data-v="-5">−</button><b>${it[k]}${unit}</b>
          <button type="button" class="chip-btn" data-m="tradeSet" data-side="${key}" data-k="${k}" data-v="5">+</button><small class="muted">máx. ${max}</small></div>`;
        const tog = r => `<div class="trade-row"><span>${PP.STRATEGIC[r].name} (${PP.LEASE_TURNS} turnos)</span>
          <button type="button" class="chip-btn ${it[r] ? 'on' : ''}" data-m="tradeSet" data-side="${key}" data-k="${r}" data-v="t" ${g.ownsStrategic(owner, r) ? '' : 'disabled'}>${it[r] ? 'Incluído' : g.ownsStrategic(owner, r) ? 'Incluir' : 'Não possui'}</button></div>`;
        return `<div class="trade-side"><h3>${who}</h3>${step('stars', 'Estrelas', owner.stars, '★')}${step('sci', 'Ciência', owner.science, SCI)}${tog('iron')}${tog('horses')}</div>`;
      };
      const deal = { give: ts.give, get: ts.get };
      const chk = g.canPropose(me.id, pid, 'trade', deal);
      const html = `<div class="modal-h">${crest(o.color, tribeIcon(o.tribe), 'crest-l')}<div class="mh-t"><h2>Comércio com ${esc(o.name)}</h2><div class="sub">Recursos estratégicos são emprestados por ${PP.LEASE_TURNS} turnos e não podem ser revendidos.</div></div>${this.closeX()}</div>
        <div class="modal-b"><div class="trade">${side('give', 'Você dá', me)}${side('get', 'Você recebe', o)}</div>
        ${this.opinionLine(me.id, pid)}${chk.ok ? '' : `<p class="note"><span class="cr">${esc(chk.reason)}</span></p>`}</div>
        <div class="modal-f"><button type="button" class="btn ghost" data-m="close">Cancelar</button><button type="button" class="btn primary" data-m="tradeSend" data-p="${pid}" ${chk.ok ? '' : 'disabled'}>Propor acordo</button></div>`;
      if (refresh) this.replaceModal('trade', html); else this.openModal('trade', html, { narrow: true });
    },

    openTribute(pid) {
      const g = this.game, me = this.me(), o = g.players[pid];
      const opts = [0.15, 0.3, 0.5].map(f => Math.max(3, Math.floor(o.stars * f))).filter((v, i, a) => a.indexOf(v) === i && v <= o.stars);
      const gifts = [5, 10, 20].filter(v => v <= me.stars);
      const html = `<div class="modal-h">${crest(o.color, tribeIcon(o.tribe), 'crest-l')}<div class="mh-t"><h2>Tributo · ${esc(o.name)}</h2><div class="sub">Eles têm ${o.stars}★ · você tem ${me.stars}★</div></div>${this.closeX()}</div>
        <div class="modal-b"><div class="sec-lbl">Exigir tributo</div><p class="note">Tribos mais fracas tendem a pagar para evitar a guerra; exigir irrita quem paga.</p>
        <div class="acts">${opts.map(v => `<button type="button" class="chip-btn" data-m="tributeSend" data-p="${pid}" data-v="${v}" data-dir="demand">Exigir ${v}★</button>`).join('') || '<p class="note">Eles não têm estrelas.</p>'}</div>
        <div class="sec-lbl">Oferecer um presente</div><p class="note">Pagar tributo melhora a opinião deles sobre você.</p>
        <div class="acts">${gifts.map(v => `<button type="button" class="chip-btn" data-m="tributeSend" data-p="${pid}" data-v="${v}" data-dir="give">Dar ${v}★</button>`).join('') || '<p class="note">Estrelas insuficientes.</p>'}</div>
        ${this.opinionLine(me.id, pid)}</div>`;
      this.openModal('tribute', html, { narrow: true });
    },

    openJointWar(pid) {
      const g = this.game, me = this.me(), o = g.players[pid];
      const targets = g.players.filter(t => t.alive && t.id !== me.id && t.id !== pid && me.met[t.id]);
      const rows = targets.map(t => {
        const chk = g.canPropose(me.id, pid, 'joint_war', { target: t.id });
        return `<div class="row">${crest(t.color, tribeIcon(t.tribe), 'crest-s')}<div class="rt"><div class="rn">${esc(t.name)} ${this.relTag(t.id)}</div>${chk.ok ? '' : `<div class="rs">${esc(chk.reason)}</div>`}</div>
          <div class="ra"><button type="button" class="chip-btn" data-m="jointSend" data-p="${pid}" data-v="${t.id}" ${chk.ok ? '' : 'disabled'}>Propor</button></div></div>`;
      }).join('');
      this.openModal('joint', `<div class="modal-h">${crest(o.color, tribeIcon(o.tribe), 'crest-l')}<div class="mh-t"><h2>Guerra conjunta com ${esc(o.name)}</h2><div class="sub">Se aceitarem, vocês dois entram em guerra contra o alvo.</div></div>${this.closeX()}</div>
        <div class="modal-b"><div class="list">${rows || '<p class="note">Nenhum alvo possível.</p>'}</div></div>`, { narrow: true });
    },

    proposeResult(res, o) {
      if (res === 'accepted') this.toast(`${o.name} aceitou.`, 'good');
      else if (res === 'rejected') this.toast(`${o.name} recusou.`, 'bad');
      else if (res === 'pending') this.toast(`Proposta enviada a ${o.name}.`, '');
      else if (res === 'wait') this.toast('Você já fez essa proposta neste turno.', 'bad');
      else this.toast('Proposta inválida agora.', 'bad');
    },

    // ============================================================ Objetivos
    openObjectives() {
      if (!this.game) return;
      const g = this.game, me = this.me();
      const mine = g.victoryProgress(me);
      const rivals = g.players.filter(o => o.alive && o.id !== me.id && me.met[o.id]);
      const rows = mine.map(v => {
        let lead = '';
        let best = null;
        for (const o of rivals) {
          const pv = g.victoryProgress(o).find(x => x.id === v.id);
          if (pv && (!best || pv.pct > best.pct)) best = { o, pct: pv.pct };
        }
        if (best && v.id !== 'dominacao' && v.id !== 'sobrevivencia') lead = ` · rival mais próximo: ${esc(best.o.name)} ${Math.round(best.pct * 100)}%`;
        return `<div class="row">${ico(v.icon, 'ci big-ico')}<div class="rt"><div class="rn">${v.name}</div><div class="rs">${esc(v.desc)}</div>
          <div class="rs">${bar(v.pct)} ${Math.round(v.pct * 100)}% · ${esc(v.text)}${lead}</div></div></div>`;
      }).join('');
      const sc = PP.SCENARIOS[g.opts.scenario || 'normal'];
      const ev = g.events;
      let evHtml = '';
      if (ev && g.eventsEnabled()) {
        const act = ev.active.map(a => `<div class="row">${ico(PP.EVENTS[a.id].icon, 'ci big-ico')}<div class="rt"><div class="rn">${PP.EVENTS[a.id].name} <span class="tag bad">Ativo até o turno ${a.end}</span></div><div class="rs">${esc(PP.EVENTS[a.id].desc)}</div></div></div>`).join('');
        const up = ev.upcoming ? `<div class="row">${ico(PP.EVENTS[ev.upcoming.id].icon, 'ci big-ico')}<div class="rt"><div class="rn">${PP.EVENTS[ev.upcoming.id].name} <span class="tag gold">Começa no turno ${ev.upcoming.start}</span></div><div class="rs">${esc(PP.EVENTS[ev.upcoming.id].desc)}</div></div></div>` : '';
        evHtml = `<div class="sec-lbl">Eventos mundiais</div><div class="list">${act}${up || (act ? '' : `<p class="note">Nenhum evento previsto. O próximo pode ser anunciado a partir do turno ${Math.max(g.turn, ev.next - PP.EVENT_WARNING)}.</p>`)}</div>`;
      }
      this.openModal('objectives', `<div class="modal-h"><div><h2>Objetivos</h2><div class="sub">${sc ? esc(sc.name) : ''}${g.opts.scenario && g.opts.scenario !== 'normal' ? ' — ' + esc(sc.desc) : ''}</div></div>${this.closeX()}</div>
        <div class="modal-b"><div class="list">${rows}</div>${!g.opts.victories ? '<p class="note">Partida criada antes da expansão: valem as vitórias originais.</p>' : ''}${evHtml}</div>`, { narrow: true });
    },

    // ============================================================ Conquistas
    recordAchievements() {
      const g = this.game;
      if (!g || !g.achievementProgress) return;
      const saved = load(ACH_KEY) || {};
      let changed = false;
      for (const p of g.players) {
        if (!p.human) continue;
        for (const a of g.achievementProgress(p)) {
          if (a.unlocked && !saved[a.id]) { saved[a.id] = { date: Date.now(), tribe: p.tribe, turn: a.turn }; changed = true; }
        }
      }
      if (changed) store(ACH_KEY, saved);
    },

    gameAchievementsLine() {
      const g = this.game;
      const got = [];
      for (const p of g.players) if (p.human) for (const a of g.achievementProgress(p)) if (a.unlocked) got.push(a.name);
      return got.length ? `<p class="note">Conquistas nesta partida: ${esc(got.join(', '))}.</p>` : '';
    },

    openAchievements() {
      this.recordAchievements();
      const g = this.game;
      const saved = load(ACH_KEY) || {};
      const me = g && g.players[this.viewer] && g.players[this.viewer].human ? g.players[this.viewer] : null;
      const prog = me ? g.achievementProgress(me) : null;
      const cards = PP.ACHIEVEMENTS.map(a => {
        const pr = prog ? prog.find(x => x.id === a.id) : null;
        const un = !!saved[a.id] || (pr && pr.unlocked);
        return `<div class="card ach ${un ? 'go' : 'locked'}"><div class="card-row">${ico(un ? 'ach' : 'ach_locked', 'ci')}<span class="cn">${a.name}</span></div>
          <span class="cd">${esc(a.desc)}</span>${pr && !un ? `<span class="cd">${bar(pr.cur / pr.max)} ${pr.cur}/${pr.max}</span>` : ''}
          ${un && saved[a.id] ? `<span class="cd">Desbloqueada${saved[a.id].tribe ? ' com ' + PP.TRIBES[saved[a.id].tribe].name : ''}</span>` : ''}</div>`;
      }).join('');
      const n = PP.ACHIEVEMENTS.filter(a => saved[a.id]).length;
      this.openModal('achievements', `<div class="modal-h"><div><h2>Conquistas</h2><div class="sub">${n}/${PP.ACHIEVEMENTS.length} desbloqueadas neste aparelho</div></div>${this.closeX()}</div>
        <div class="modal-b"><div class="grid">${cards}</div></div>`);
    },

    // ============================================================ Estatísticas finais
    finalStatsTable() {
      const g = this.game;
      const rows = g.finalStats();
      const head = rows.map(r => `<th class="num"><span class="swatch" style="background:${r.color}"></span>${esc(r.name)}${r.winner ? ' ★' : ''}</th>`).join('');
      const body = PP.STAT_LABELS.map(([k, label]) => `<tr><td>${label}</td>${rows.map(r => `<td class="num">${r[k] != null ? r[k] : '—'}</td>`).join('')}</tr>`).join('');
      return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>
        <p class="note">Condição de vitória: ${g.endReason ? esc(PP.victoryLabel ? PP.victoryLabel(g.endReason) : g.endReason) : 'partida em andamento'}.</p>`;
    },

    // ============================================================ Replay
    openReplay() {
      const g = this.game;
      if (!g || !g.replay || !g.replay.frames.length) { this.toast('Ainda não há quadros de replay.', ''); return; }
      this.replayState = { i: g.replay.frames.length - 1, timer: null };
      const n = g.replay.frames.length;
      const html = `<div class="modal-h"><div><h2>Replay</h2><div class="sub">Um quadro por rodada: território, cidades e tropas.</div></div>${this.closeX()}</div>
        <div class="modal-b"><canvas id="replay-cv" class="replay-cv" width="560" height="560"></canvas>
        <div class="replay-ctl"><button type="button" class="chip-btn" data-m="rp" data-v="prev">${ico('ui_prev')}</button>
        <button type="button" class="chip-btn" data-m="rp" data-v="play" id="rp-play">Reproduzir</button>
        <button type="button" class="chip-btn" data-m="rp" data-v="next">${ico('ui_next')}</button>
        <input type="range" id="rp-range" min="0" max="${n - 1}" value="${n - 1}" aria-label="Rodada"><b id="rp-turn"></b></div>
        <div id="rp-legend" class="replay-legend"></div><div id="rp-marks" class="log-list"></div></div>`;
      const wrap = this.openModal('replay', html, { onClose: () => { if (this.replayState && this.replayState.timer) clearInterval(this.replayState.timer); this.replayState = null; } });
      const range = wrap.querySelector('#rp-range');
      range.addEventListener('input', () => { this.replayState.i = +range.value; this.drawReplay(); });
      wrap.querySelector('#rp-legend').innerHTML = g.players.map(p => `<span><span class="swatch" style="background:${p.color}"></span>${esc(p.name)}</span>`).join('');
      this.drawReplay();
    },

    drawReplay() {
      const g = this.game, st = this.replayState;
      if (!g || !st) return;
      const cv = $('#replay-cv');
      if (!cv) return;
      const f = g.replayFrame(st.i);
      if (!f) return;
      const ctx = cv.getContext('2d');
      const W = g.W, Hh = g.H, S = Math.floor(Math.min(cv.width / W, cv.height / Hh));
      const ox = (cv.width - S * W) / 2, oy = (cv.height - S * Hh) / 2;
      ctx.fillStyle = '#0d0c0b'; ctx.fillRect(0, 0, cv.width, cv.height);
      const base = { ocean: '#1a2a30', water: '#28414a', plains: '#5c5c3d', forest: '#3b442c', hills: '#646046', mountain: '#55514b', desert: '#86755a', tundra: '#61675f', swamp: '#40462f' };
      for (let i = 0; i < W * Hh; i++) {
        const t = g.tiles[i], x = i % W, y = (i / W) | 0;
        ctx.fillStyle = base[t.terrain] || '#333';
        ctx.fillRect(ox + x * S, oy + y * S, S, S);
        const o = f.owners[i];
        if (o >= 0 && g.players[o]) { ctx.fillStyle = PP.color.rgba(g.players[o].color, 0.55); ctx.fillRect(ox + x * S, oy + y * S, S, S); }
      }
      for (const c of f.cities) {
        const p = g.players[c.owner];
        ctx.fillStyle = '#0d0c0b'; ctx.fillRect(ox + c.x * S + 1, oy + c.y * S + 1, S - 2, S - 2);
        ctx.fillStyle = p ? p.color : '#999'; ctx.fillRect(ox + c.x * S + 3, oy + c.y * S + 3, S - 6, S - 6);
        if (c.capital) { ctx.strokeStyle = '#e3c47f'; ctx.lineWidth = 2; ctx.strokeRect(ox + c.x * S + 2, oy + c.y * S + 2, S - 4, S - 4); }
      }
      for (const u of f.units) {
        const p = g.players[u.owner];
        ctx.fillStyle = '#0d0c0b'; ctx.beginPath(); ctx.arc(ox + u.x * S + S / 2, oy + u.y * S + S / 2, Math.max(2, S * 0.24), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p ? PP.color.shade(p.color, 1.3) : '#ccc'; ctx.beginPath(); ctx.arc(ox + u.x * S + S / 2, oy + u.y * S + S / 2, Math.max(1.5, S * 0.17), 0, Math.PI * 2); ctx.fill();
      }
      const lbl = $('#rp-turn'); if (lbl) lbl.textContent = `Turno ${f.turn}`;
      const range = $('#rp-range'); if (range) range.value = st.i;
      const marks = $('#rp-marks');
      if (marks) marks.innerHTML = f.marks.length ? f.marks.map(m => `<div><em>T${m.t}</em>${esc(m.x)}</div>`).join('') : '<p class="note">Nada marcante nesta rodada.</p>';
    },

    // ============================================================ Eventos do jogo (sistemas novos)
    onGameEventExt(type, d) {
      const g = this.game, v = this.viewer;
      const me = g.players[v];
      switch (type) {
        case 'worldEvent': {
          const def = PP.EVENTS[d.id];
          if (d.phase === 'announce') this.toast(`Previsão: ${def.name} no turno ${d.start}.`, '');
          else if (d.phase === 'start') this.toast(`Evento: ${def.name}!`, 'gold');
          else if (d.phase === 'end') this.toast(`Fim: ${def.name}.`, '');
          this.renderEventChip();
          break;
        }
        case 'ruinChoice':
          if (d.player === v && this.myTurn()) this.openRuinChoice();
          break;
        case 'spy':
          if (d.victim === v && d.caught) this.toast(`Capturamos um espião de ${g.players[d.unit.owner].name}!`, 'gold');
          break;
        case 'pillage':
          if (d.victim === v) this.toast(`${g.players[d.unit.owner].name} saqueou nossa infraestrutura!`, 'bad');
          break;
        case 'routeBlocked':
          if (d.route.owner === v) this.toast('Uma rota comercial foi interrompida.', 'bad');
          break;
        case 'routeRestored':
          if (d.route.owner === v) this.toast('Rota comercial restabelecida.', 'good');
          break;
        case 'route':
          if (d.cancelled && d.reason && (d.route.owner === v || d.route.partner === v)) this.toast(`Rota encerrada: ${d.reason}.`, 'bad');
          else if (!d.cancelled && d.route.partner === v && d.route.owner !== v) this.toast(`${g.players[d.route.owner].name} abriu uma rota comercial com uma cidade sua (+1★ e +1${SCI} para você).`, 'good');
          break;
        case 'fortTaken':
          if (d.from === v) this.toast(`Perdemos uma fortificação para ${g.players[d.to].name}.`, 'bad');
          else if (d.to === v) this.toast('Tomamos uma fortificação inimiga.', 'good');
          break;
        case 'unrest':
          if (d.city.owner === v) this.toast(`${d.city.name} resiste à ocupação.`, 'bad');
          break;
        case 'integrated':
          if (d.city.owner === v) this.toast(`${d.city.name} foi integrada ao império.`, 'good');
          break;
        case 'revolt':
          if (d.from === v) this.toast(d.to === v ? `Revolta em ${d.city.name}!` : `${d.city.name} se revoltou e voltou para ${g.players[d.to].name}!`, 'bad');
          else if (d.to === v) this.toast(`${d.city.name} se revoltou e voltou para nós!`, 'good');
          break;
        case 'achievement':
          if (d.player === v) { this.toast(`Conquista desbloqueada: ${d.name}`, 'gold'); this.recordAchievements(); }
          break;
        case 'project':
          if (d.player === v || (me && me.met[d.player])) this.toast(`${g.players[d.player].name}: etapa ${d.stage} do ${PP.SCIENCE_PROJECT.name}.`, d.player === v ? 'good' : 'bad');
          break;
        case 'spec':
          break;
      }
    },

    // ============================================================ Ações dos modais novos
    modalActionExt(a, d, btn) {
      const g = this.game;
      if (!g) {
        if (a === 'achievements') this.openAchievements();
        return;
      }
      const me = this.me();
      const needTurn = () => { if (!this.myTurn()) { this.toast('Espere a sua vez.', 'bad'); return false; } return true; };
      switch (a) {
        case 'objectives': this.closeModal('menu'); this.openObjectives(); break;
        case 'achievements': this.openAchievements(); break;
        case 'replay': this.openReplay(); break;
        case 'rp': {
          const st = this.replayState;
          if (!st) break;
          const n = g.replay.frames.length;
          if (d.v === 'prev') st.i = Math.max(0, st.i - 1);
          else if (d.v === 'next') st.i = Math.min(n - 1, st.i + 1);
          else if (d.v === 'play') {
            if (st.timer) { clearInterval(st.timer); st.timer = null; btn.textContent = 'Reproduzir'; break; }
            if (st.i >= n - 1) st.i = 0;
            btn.textContent = 'Pausar';
            st.timer = setInterval(() => {
              if (!this.replayState) return;
              if (st.i >= n - 1) { clearInterval(st.timer); st.timer = null; const b = $('#rp-play'); if (b) b.textContent = 'Reproduzir'; return; }
              st.i++; this.drawReplay();
            }, 450);
          }
          this.drawReplay();
          break;
        }
        case 'propose': {
          if (!needTurn()) break;
          const o = g.players[+d.p];
          const res = d.t === 'nap' ? g.propose(me.id, o.id, 'nap', { turns: PP.NAP_TURNS }) : d.t === 'peace' ? g.proposePeace(me.id, o.id) : g.propose(me.id, o.id, d.t);
          if (res === 'invalid') { const chk = g.canPropose(me.id, o.id, d.t); this.toast(chk.reason || 'Proposta inválida.', 'bad'); }
          else this.proposeResult(res, o);
          this.afterAction();
          this.openDiplomacy(true);
          break;
        }
        case 'trade': if (needTurn()) { this.tradeState = null; this.openTrade(+d.p); } break;
        case 'tradeSet': {
          const ts = this.tradeState;
          if (!ts) break;
          const side = ts[d.side];
          const owner = d.side === 'give' ? me : g.players[ts.to];
          if (d.v === 't') side[d.k] = side[d.k] ? 0 : 1;
          else {
            const max = d.k === 'stars' ? owner.stars : owner.science;
            side[d.k] = Math.max(0, Math.min(max, (side[d.k] || 0) + (+d.v)));
          }
          this.openTrade(ts.to, true);
          break;
        }
        case 'tradeSend': {
          if (!needTurn()) break;
          const ts = this.tradeState, o = g.players[+d.p];
          const res = g.propose(me.id, o.id, 'trade', { give: Object.assign({}, ts.give), get: Object.assign({}, ts.get) });
          this.proposeResult(res, o);
          this.closeModal('trade');
          this.tradeState = null;
          this.afterAction();
          this.openDiplomacy(true);
          break;
        }
        case 'tribute': if (needTurn()) this.openTribute(+d.p); break;
        case 'tributeSend': {
          if (!needTurn()) break;
          const o = g.players[+d.p];
          if (d.dir === 'give') { if (g.payTribute(me.id, o.id, +d.v, false)) this.toast(`Você presenteou ${o.name} com ${d.v}★.`, 'good'); }
          else this.proposeResult(g.propose(me.id, o.id, 'tribute_demand', { amount: +d.v }), o);
          this.closeModal('tribute');
          this.afterAction();
          this.openDiplomacy(true);
          break;
        }
        case 'joint': if (needTurn()) this.openJointWar(+d.p); break;
        case 'jointSend': {
          if (!needTurn()) break;
          const o = g.players[+d.p];
          this.proposeResult(g.propose(me.id, o.id, 'joint_war', { target: +d.v }), o);
          this.closeModal('joint');
          this.afterAction();
          this.openDiplomacy(true);
          break;
        }
        case 'leave': {
          if (!needTurn()) break;
          const o = g.players[+d.p];
          this.ask('Encerrar a aliança?', `<p>Vocês voltam à paz comum. ${esc(o.name)} vai se lembrar disso, mas sem a mancha de uma traição.</p>`, 'Encerrar', 'Manter').then(ok => {
            if (ok && g.leaveAlliance(me.id, o.id)) this.afterAction();
            this.openDiplomacy(true);
          });
          break;
        }
        case 'intel': this.openIntel(+d.p); break;
        case 'spec': {
          if (!needTurn()) break;
          const c = g.cityMap[+d.city];
          const chk = g.specCheck(me, c, d.v);
          if (chk.current) break;
          if (!chk.ok) { this.toast(chk.reason, 'bad'); break; }
          const go = () => { if (g.setSpec(me, c, d.v)) { this.toast(`${c.name} agora é uma cidade ${PP.SPECS[d.v].name.toLowerCase()}.`, 'good'); this.afterAction(); } this.openCity(c, true); };
          if (c.spec) this.ask('Trocar a especialização?', `<p>Trocar custa ${chk.cost}★. As construções exclusivas da especialização atual ficam inativas.</p>`, 'Trocar', 'Cancelar').then(ok => { if (ok) go(); });
          else go();
          break;
        }
        case 'route': {
          if (!needTurn()) break;
          const c = g.cityMap[+d.city], to = g.cityMap[+d.to];
          const r = g.createRoute(me, c, to);
          if (r) this.toast(`Rota aberta até ${to.name}.`, 'good'); else this.toast(g.routeCheck(me, c, to).reason || 'Não foi possível abrir a rota.', 'bad');
          this.afterAction();
          this.openCity(c, true);
          break;
        }
        case 'cancelRoute': {
          if (!needTurn()) break;
          const r = (g.routes || []).find(x => x.id === +d.id);
          if (r && r.owner === me.id) g.cancelRoute(r, 'encerrada por você');
          else if (r) { this.toast('Só quem abriu a rota pode encerrá-la.', 'bad'); break; }
          this.afterAction();
          this.openCity(g.cityMap[+d.city], true);
          break;
        }
        case 'project': {
          if (!needTurn()) break;
          const c = g.cityMap[+d.city];
          if (!g.advanceProject(me, c)) { this.toast(g.projectCheck(me, c).reason || 'Indisponível', 'bad'); break; }
          this.afterAction();
          if (!g.over) this.openCity(c, true);
          break;
        }
        case 'ruin': {
          if (!this.myTurn()) break;
          if (g.resolveRuin(me, d.v)) { this.closeModal('ruin'); this.afterAction(); }
          else this.toast('Opção indisponível.', 'bad');
          break;
        }
      }
    },
  });
})(window.PP = window.PP || {});
