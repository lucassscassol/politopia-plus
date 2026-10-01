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
      return `<div class="field"><span class="lbl">${PP.t('Cenário')}</span><div class="grid">${scen}</div></div>
        <div class="row2">
          <div class="field"><span class="lbl">${PP.t('Outras vitórias')}${forced ? ' · ' + PP.t('o cenário define as vitórias') : ''}</span><div class="seg">${vic}</div></div>
          <div class="field"><span class="lbl">${PP.t('Eventos mundiais')}</span><div class="seg"><button type="button" class="${s.events ? 'on' : ''}" data-s="events">${s.events ? PP.t('Ativados') : PP.t('Desativados')}</button></div></div>
          <div class="field"><span class="lbl">${PP.t('Organização do reino')}</span><div class="seg"><button type="button" class="${s.realm ? 'on' : ''}" data-s="realm" title="${esc(PP.t('Desordem administrativa e alcance da corte'))}">${s.realm ? PP.t('Ativada') : PP.t('Desativada')}</button></div></div>
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
        chip.innerHTML = `${ico(def.icon)}<span class="ev-name">${def.name}</span><b>${left}t</b>`;
        chip.title = def.desc;
      } else {
        const def = PP.EVENTS[ev.upcoming.id];
        chip.className = 'res res-event soon';
        chip.innerHTML = `${ico(def.icon)}<span class="ev-name">${PP.t('{x} em', { x: def.name })}</span><b>${Math.max(0, ev.upcoming.start - g.turn)}t</b>`;
        chip.title = PP.t('Previsão: {x}', { x: def.desc });
      }
      chip.hidden = false;
    },

    announceEvents() {
      const g = this.game, ev = g.events;
      if (!ev) return;
      for (const a of ev.active) if (a.start === g.turn) this.toast(`${PP.EVENTS[a.id].name}: ${PP.EVENTS[a.id].desc}`, 'gold');
      if (ev.upcoming && ev.upcoming.announced >= g.turn - 1) this.toast(PP.t('Previsão: {x} no turno {n}.', { x: PP.EVENTS[ev.upcoming.id].name, n: ev.upcoming.start }), '');
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
        if (o.iron) out.push(PP.t('{x} por {n} turnos', { x: PP.STRATEGIC.iron.name, n: PP.LEASE_TURNS }));
        if (o.horses) out.push(PP.t('{x} por {n} turnos', { x: PP.STRATEGIC.horses.name, n: PP.LEASE_TURNS }));
        return out.join(' + ') || PP.t('nada');
      };
      const x = from.name;
      const napWarn = t => (g.relState(this.viewer, t) === 'nap' ? ' ' + PP.t('Atenção: isso rompe o seu pacto com eles.') : '');
      switch (type) {
        case 'peace': return { title: PP.t('Proposta de paz'), short: PP.t('paz'), yes: PP.t('Aceitar a paz'), no: PP.t('Recusar'), okText: PP.t('Paz assinada com {x}.', { x }), noText: PP.t('Você recusou a paz com {x}.', { x }),
          body: PP.t('<b>{n}</b> propõe um tratado de paz. Em paz, nenhum dos dois pode atacar o outro nem entrar nas cidades do outro. Quebrar um tratado mancha sua reputação.', { n }) };
        case 'nap': return { title: PP.t('Pacto de não agressão'), short: PP.t('pacto'), yes: PP.t('Assinar o pacto'), no: PP.t('Recusar'), okText: PP.t('Pacto firmado com {x}.', { x }), noText: PP.t('Você recusou o pacto de {x}.', { x }),
          body: PP.t('<b>{n}</b> propõe um pacto de não agressão por {t} turnos. Cumprir o pacto melhora a reputação dos dois; rompê-lo custa 2 de reputação com todas as tribos.', { n, t: d.turns || PP.NAP_TURNS }) };
        case 'alliance': return { title: PP.t('Proposta de aliança'), short: PP.t('aliança'), yes: PP.t('Formar aliança'), no: PP.t('Recusar'), okText: PP.t('Aliança formada com {x}!', { x }), noText: PP.t('Você recusou a aliança com {x}.', { x }),
          body: PP.t('<b>{n}</b> quer uma aliança: visão compartilhada, tecnologias 20% mais baratas quando o aliado já as conhece e ajuda mútua na guerra (chamado às armas). Trair uma aliança custa 3 de reputação.', { n }) };
        case 'trade': return { title: PP.t('Acordo comercial'), short: PP.t('comércio'), yes: PP.t('Aceitar o acordo'), no: PP.t('Recusar'), okText: PP.t('Acordo fechado com {x}.', { x }), noText: PP.t('Você recusou o acordo de {x}.', { x }),
          body: PP.t('<b>{n}</b> oferece <b>{a}</b> em troca de <b>{b}</b>.', { n, a: items(d.give || {}), b: items(d.get || {}) }) };
        case 'tribute_demand': return { title: PP.t('Exigência de tributo'), short: PP.t('tributo'), yes: PP.t('Pagar {n}★', { n: d.amount }), no: PP.t('Recusar'), okText: PP.t('Você pagou {n}★ a {x}.', { n: d.amount, x }), noText: PP.t('Você recusou o tributo exigido por {x}.', { x }),
          body: PP.t('<b>{p}</b> exige <b>{n}★</b> de tributo. Pagar evita atrito agora; recusar pode levar à guerra.', { p: n, n: d.amount }) };
        case 'joint_war': { const t = g.players[d.target]; return { title: PP.t('Guerra conjunta'), short: PP.t('guerra conjunta'), yes: PP.t('Declarar guerra a {x}', { x: t.name }), no: PP.t('Recusar'), okText: PP.t('Você entrou na guerra contra {x}.', { x: t.name }), noText: PP.t('Você recusou a guerra conjunta.'),
          body: PP.t('<b>{n}</b> propõe que vocês dois declarem guerra a <b>{t}</b> juntos.', { n, t: esc(t.name) }) + napWarn(d.target) }; }
        case 'call_to_arms': { const t = g.players[d.target]; return { title: PP.t('Chamado às armas'), short: PP.t('chamado às armas'), yes: PP.t('Guerra contra {x}', { x: t.name }), no: PP.t('Ficar de fora'), okText: PP.t('Você honrou a aliança contra {x}.', { x: t.name }), noText: PP.t('Você ficou de fora da guerra.'),
          body: PP.t('Seu aliado <b>{n}</b> foi atacado por <b>{t}</b> e pede ajuda. Honrar o chamado melhora muito a relação; recusar decepciona o aliado.', { n, t: esc(t.name) }) + napWarn(d.target) }; }
      }
      return { title: PP.t('Proposta'), short: type, yes: PP.t('Aceitar'), no: PP.t('Recusar'), okText: PP.t('Aceito.'), noText: PP.t('Recusado.'), body: PP.t('<b>{n}</b> faz uma proposta.', { n }) };
    },

    opinionLine(pid, other) {
      const g = this.game;
      const theirs = g.opinion(other, pid), tl = g.opinionLabel(theirs);
      return `<p class="note">${PP.t('Opinião deles sobre você: {x}', { x: `<span class="tag ${tl.tag}">${tl.name} (${theirs > 0 ? '+' : ''}${theirs})</span>` })} · ${PP.t('Reputação deles: {n}', { n: g.players[other].reputation || 0 })}</p>`;
    },

    relTag(owner) {
      const g = this.game;
      const st = g.relState(this.viewer, owner);
      if (st === 'self') return '';
      const R = PP.RELATIONS[st] || PP.RELATIONS.war;
      return `<span class="tag ${R.tag}">${st === 'war' ? PP.t('Em guerra') : R.name}</span>`;
    },

    // ============================================================ Unidades
    unitStatus(u) {
      const g = this.game;
      const bits = [];
      if (g.isStealthed && g.isStealthed(u)) bits.push(`<span class="tag gold">${PP.t('Furtiva')}</span>`);
      if (u.owner === this.viewer && g.supplyLevel) {
        const lv = g.supplyLevel(u);
        if (lv > 0) bits.push(`<span class="tag bad">${PP.t('Sem suprimentos {x}', { x: lv === 2 ? '−35%' : '−20%' })}</span>`);
        else if (!g.isSupplied(u)) bits.push(`<span class="tag">${PP.t('Fora do abastecimento (penalidade no próximo turno)')}</span>`);
      }
      if (u.buff) {
        for (const k in u.buff) {
          if (!u.buff[k]) continue;
          const name = PP.ABILITIES[k] ? PP.ABILITIES[k].name : k === 'amphib' ? PP.t('Desembarque (−25% de ataque)') : null;
          if (name) bits.push(`<span class="tag gold">${name}</span>`);
        }
      }
      const dn = g.defenseNotes ? g.defenseNotes(u) : [];
      if (dn.length) bits.push(`<span class="tag">${PP.t('Defesa: {x}', { x: esc(dn.join(', ')) })}</span>`);
      if (u.cd) {
        const waits = Object.keys(u.cd).filter(k => u.cd[k] > g.turn && PP.ABILITIES[k]).map(k => PP.t('{x} em {n}t', { x: PP.ABILITIES[k].name, n: u.cd[k] - g.turn }));
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
          return this.act('unloadSel', 'u_' + x.type, PP.t('Desembarcar {u}', { u: UN[x.type].name }), `${x.hp}♥`, { off: !tg.length, reason: tg.length ? '' : x.boarded === g.turn ? PP.t('Embarcou agora') : PP.t('Sem praia livre'), data: { id: x.id } });
        });
        html += `<div class="sec-lbl">${PP.t('A bordo ({n}/{m})', { n: u.cargo.length, m: cap })}</div>${rows.length ? `<div class="acts">${rows.join('')}</div>` : `<p class="note">${PP.t('Vazio. Leve uma tropa terrestre até o transporte para embarcar.')}</p>`}`;
      }
      if (UN[u.type].spy) {
        const ms = g.spyMissions(u);
        const acts = ms.map(m => this.act('spy', m.def.icon, m.def.name, m.ok || m.risk ? PP.t('{n}% risco', { n: Math.round(m.risk * 100) }) : null,
          { off: !m.ok, reason: m.ok ? '' : m.reason, data: { id: m.id }, title: m.def.desc }));
        html += `<div class="sec-lbl">${PP.t('Missões')}</div><div class="acts">${acts.join('')}</div>`;
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
          <span class="cc star">${chk.current ? PP.t('Atual') : chk.cost + '★'}</span>
          <span class="cd"><b>${PP.t('Bônus:')}</b> ${esc(sp.bonus)}</span><span class="cd"><b>${PP.t('Custo:')}</b> ${esc(sp.cost)}</span>
          ${!chk.ok && !chk.current ? `<span class="cr">${esc(chk.reason)}</span>` : ''}</button>`;
      }).join('');
      html += `<div class="sec-lbl">${PP.t('Especialização')}${c.spec ? '' : ' · ' + PP.t('uma cidade não pode ser boa em tudo')}</div><div class="grid">${specs}</div>`;
      // Lealdade
      const st = g.cityStatus(c);
      const target = g.loyaltyTarget(c);
      const facs = g.loyaltyFactors(c).map(f => `${esc(f[0])} ${f[1] > 0 ? '+' : ''}${f[1]}`).join(' · ');
      const founder = g.players[c.founder];
      html += `<div class="sec-lbl">${PP.t('Lealdade')}</div>
        <p class="note">${bar(c.loyalty / 100, c.loyalty < 30 ? 'bad' : '')} ${c.loyalty}/100 ${st ? `<span class="tag ${st.tag}">${st.name}</span>` : ''}
        ${c.founder !== c.owner && founder ? ' · ' + PP.t('fundada por {p} · tende a {n}', { p: esc(founder.name), n: target }) : ''}</p>
        ${c.founder !== c.owner || c.unrest || c.occupied ? `<p class="note">${facs}</p>` : ''}`;
      // Rotas
      const slots = g.routeSlots(c);
      if (slots) {
        const mine = g.routesOf(c);
        const rows = mine.map(r => {
          const other = g.cityMap[r.a === c.id ? r.b : r.a];
          const y = g.routeYield(r);
          const state = !r.active ? `<span class="tag bad">${PP.t('Interrompida')}</span>` : r.threat ? `<span class="tag bad">${PP.t('Ameaçada')}</span>` : `<span class="tag good">${PP.t('Ativa')}</span>`;
          return `<div class="row"><div class="rt"><div class="rn">${esc(other ? other.name : '?')} ${state} ${r.kind === 'foreign' ? `<span class="tag gold">${esc(g.players[r.partner].name)}</span>` : ''}${r.sea ? ` <span class="tag">${PP.t('Marítima')}</span>` : ''}</div>
            <div class="rs">+${y.stars}★${y.sci ? ` · +${y.sci}${SCI}` : ''} · ${PP.t('{n} casas', { n: r.len })} · ${PP.t('há {n} turnos', { n: g.turn - r.since })}</div></div>
            ${my ? `<div class="ra"><button type="button" class="chip-btn danger" data-m="cancelRoute" data-id="${r.id}" data-city="${c.id}">${PP.t('Encerrar')}</button></div>` : ''}</div>`;
        }).join('');
        let cands = '';
        if (my && mine.length < slots) {
          const list = g.routeCandidates(p, c).slice(0, 6);
          cands = list.map(x => {
            const chk = x.check;
            const y = x.yield;
            return `<div class="row"><div class="rt"><div class="rn">${esc(x.city.name)} ${x.city.owner !== p.id ? `<span class="tag gold">${esc(g.players[x.city.owner].name)}</span>` : ''}</div>
              <div class="rs">${y ? `+${y.stars}★${y.sci ? ` · +${y.sci}${SCI}` : ''}${y.partnerStars ? ' (' + PP.t('eles +{n}★', { n: y.partnerStars }) + ')' : ''} · ${PP.t('{n} casas', { n: chk.len })}${chk.sea ? ' · ' + PP.t('marítima') : ''}` : ''}${!chk.ok ? ` · <span class="cr">${esc(chk.reason)}</span>` : ''}</div></div>
              <div class="ra"><button type="button" class="chip-btn" data-m="route" data-city="${c.id}" data-to="${x.city.id}" ${chk.ok ? '' : 'disabled'}>${PP.t('Abrir · {n}★', { n: chk.cost })}</button></div></div>`;
          }).join('') || `<p class="note">${PP.t('Nenhum destino alcançável. Ligue cidades por estradas ou portos (distância mínima de 3 casas).')}</p>`;
        }
        html += `<div class="sec-lbl">${PP.t('Rotas comerciais ({n}/{m})', { n: mine.length, m: slots })}</div><div class="list">${rows}${cands}</div>`;
      }
      // Grande Observatório
      if (g.victoryEnabled('ciencia') && c.spec === 'ciencia') {
        const chk = g.projectCheck(p, c);
        const P = PP.SCIENCE_PROJECT;
        html += `<div class="sec-lbl">${P.name} · ${PP.t('vitória científica')}</div>
          <div class="row"><div class="rt"><div class="rn">${PP.t('Etapa {n} de {m}', { n: Math.min(p.project.stage + 1, P.stages.length), m: P.stages.length })}</div>
          <div class="rs">${bar(p.project.stage / P.stages.length)} ${p.project.stage >= P.stages.length ? PP.t('Concluído') : `${chk.cost}${SCI}`}${!chk.ok ? ` · ${esc(chk.reason)}` : ''}</div></div>
          ${my ? `<div class="ra"><button type="button" class="chip-btn" data-m="project" data-city="${c.id}" ${chk.ok ? '' : 'disabled'}>${PP.t('Construir etapa')}</button></div>` : ''}</div>`;
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
      this.openModal('intel', `<div class="modal-h">${crest(o.color, tribeIcon(o.tribe), 'crest-l')}<div class="mh-t"><h2>${PP.t('Relatório: {x}', { x: esc(o.name) })}</h2><div class="sub">${PP.t('Obtido no turno {n}', { n: r.turn })}</div></div>${this.closeX()}</div>
        <div class="modal-b"><div class="stats"><span class="st gold">★ ${r.stars}</span><span class="st sci">${SCI} ${r.science}</span>${this.stat('s_atk', PP.t('{n} unidades · força {s}', { n: r.units, s: r.strength }))}${this.stat('ui_tech', PP.t('{n} tecnologias', { n: r.techs }))}${this.stat('ui_city', PP.t('{n} cidades', { n: r.cities }))}</div>
        <p class="note">${PP.t('Exército: {x}', { x: esc(types || PP.t('nenhum')) })}</p>
        ${r.strategy && PP.AI_STRATEGIES ? `<p class="note">${PP.t('Objetivo atual: <b>{x}</b> — {d}', { x: PP.AI_STRATEGIES[r.strategy].name, d: esc(PP.AI_STRATEGIES[r.strategy].desc) })}${r.target != null && g.players[r.target] ? ' ' + PP.t('Alvo preferido: <b>{x}</b>.', { x: esc(g.players[r.target].name) }) : ''}</p>` : ''}
        <p class="note">${PP.t('Relações: {x}', { x: rels || PP.t('nenhuma conhecida') })}</p>
        <p class="note">${PP.t('Opinião deles sobre você: {x}', { x: r.opinionOfYou })}</p></div>`, { narrow: true });
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
          <button type="button" class="chip-btn" data-m="tradeSet" data-side="${key}" data-k="${k}" data-v="5">+</button><small class="muted">${PP.t('máx. {n}', { n: max })}</small></div>`;
        const tog = r => `<div class="trade-row"><span>${PP.STRATEGIC[r].name} (${PP.t('{n} turnos', { n: PP.LEASE_TURNS })})</span>
          <button type="button" class="chip-btn ${it[r] ? 'on' : ''}" data-m="tradeSet" data-side="${key}" data-k="${r}" data-v="t" ${g.ownsStrategic(owner, r) ? '' : 'disabled'}>${it[r] ? PP.t('Incluído') : g.ownsStrategic(owner, r) ? PP.t('Incluir') : PP.t('Não possui')}</button></div>`;
        return `<div class="trade-side"><h3>${who}</h3>${step('stars', PP.t('Estrelas'), owner.stars, '★')}${step('sci', PP.t('Ciência'), owner.science, SCI)}${tog('iron')}${tog('horses')}</div>`;
      };
      const deal = { give: ts.give, get: ts.get };
      const chk = g.canPropose(me.id, pid, 'trade', deal);
      const html = `<div class="modal-h">${crest(o.color, tribeIcon(o.tribe), 'crest-l')}<div class="mh-t"><h2>${PP.t('Comércio com {x}', { x: esc(o.name) })}</h2><div class="sub">${PP.t('Recursos estratégicos são emprestados por {n} turnos e não podem ser revendidos.', { n: PP.LEASE_TURNS })}</div></div>${this.closeX()}</div>
        <div class="modal-b"><div class="trade">${side('give', PP.t('Você dá'), me)}${side('get', PP.t('Você recebe'), o)}</div>
        ${this.opinionLine(me.id, pid)}${chk.ok ? '' : `<p class="note"><span class="cr">${esc(chk.reason)}</span></p>`}</div>
        <div class="modal-f"><button type="button" class="btn ghost" data-m="close">${PP.t('Cancelar')}</button><button type="button" class="btn primary" data-m="tradeSend" data-p="${pid}" ${chk.ok ? '' : 'disabled'}>${PP.t('Propor acordo')}</button></div>`;
      if (refresh) this.replaceModal('trade', html); else this.openModal('trade', html, { narrow: true });
    },

    openTribute(pid) {
      const g = this.game, me = this.me(), o = g.players[pid];
      const opts = [0.15, 0.3, 0.5].map(f => Math.max(3, Math.floor(o.stars * f))).filter((v, i, a) => a.indexOf(v) === i && v <= o.stars);
      const gifts = [5, 10, 20].filter(v => v <= me.stars);
      const html = `<div class="modal-h">${crest(o.color, tribeIcon(o.tribe), 'crest-l')}<div class="mh-t"><h2>${PP.t('Tributo')} · ${esc(o.name)}</h2><div class="sub">${PP.t('Eles têm {a}★ · você tem {b}★', { a: o.stars, b: me.stars })}</div></div>${this.closeX()}</div>
        <div class="modal-b"><div class="sec-lbl">${PP.t('Exigir tributo')}</div><p class="note">${PP.t('Tribos mais fracas tendem a pagar para evitar a guerra; exigir irrita quem paga.')}</p>
        <div class="acts">${opts.map(v => `<button type="button" class="chip-btn" data-m="tributeSend" data-p="${pid}" data-v="${v}" data-dir="demand">${PP.t('Exigir {n}★', { n: v })}</button>`).join('') || `<p class="note">${PP.t('Eles não têm estrelas.')}</p>`}</div>
        <div class="sec-lbl">${PP.t('Oferecer um presente')}</div><p class="note">${PP.t('Pagar tributo melhora a opinião deles sobre você.')}</p>
        <div class="acts">${gifts.map(v => `<button type="button" class="chip-btn" data-m="tributeSend" data-p="${pid}" data-v="${v}" data-dir="give">${PP.t('Dar {n}★', { n: v })}</button>`).join('') || `<p class="note">${PP.t('Estrelas insuficientes.')}</p>`}</div>
        ${this.opinionLine(me.id, pid)}</div>`;
      this.openModal('tribute', html, { narrow: true });
    },

    openJointWar(pid) {
      const g = this.game, me = this.me(), o = g.players[pid];
      const targets = g.players.filter(t => t.alive && t.id !== me.id && t.id !== pid && me.met[t.id]);
      const rows = targets.map(t => {
        const chk = g.canPropose(me.id, pid, 'joint_war', { target: t.id });
        return `<div class="row">${crest(t.color, tribeIcon(t.tribe), 'crest-s')}<div class="rt"><div class="rn">${esc(t.name)} ${this.relTag(t.id)}</div>${chk.ok ? '' : `<div class="rs">${esc(chk.reason)}</div>`}</div>
          <div class="ra"><button type="button" class="chip-btn" data-m="jointSend" data-p="${pid}" data-v="${t.id}" ${chk.ok ? '' : 'disabled'}>${PP.t('Propor')}</button></div></div>`;
      }).join('');
      this.openModal('joint', `<div class="modal-h">${crest(o.color, tribeIcon(o.tribe), 'crest-l')}<div class="mh-t"><h2>${PP.t('Guerra conjunta com {x}', { x: esc(o.name) })}</h2><div class="sub">${PP.t('Se aceitarem, vocês dois entram em guerra contra o alvo.')}</div></div>${this.closeX()}</div>
        <div class="modal-b"><div class="list">${rows || `<p class="note">${PP.t('Nenhum alvo possível.')}</p>`}</div></div>`, { narrow: true });
    },

    proposeResult(res, o) {
      if (res === 'accepted') this.toast(PP.t('{x} aceitou.', { x: o.name }), 'good');
      else if (res === 'rejected') this.toast(PP.t('{x} recusou.', { x: o.name }), 'bad');
      else if (res === 'pending') this.toast(PP.t('Proposta enviada a {x}.', { x: o.name }), '');
      else if (res === 'wait') this.toast(PP.t('Você já fez essa proposta neste turno.'), 'bad');
      else this.toast(PP.t('Proposta inválida agora.'), 'bad');
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
        if (best && v.id !== 'dominacao' && v.id !== 'sobrevivencia') lead = ' · ' + PP.t('rival mais próximo: {x} {n}%', { x: esc(best.o.name), n: Math.round(best.pct * 100) });
        return `<div class="row">${ico(v.icon, 'ci big-ico')}<div class="rt"><div class="rn">${v.name}</div><div class="rs">${esc(v.desc)}</div>
          <div class="rs">${bar(v.pct)} ${Math.round(v.pct * 100)}% · ${esc(v.text)}${lead}</div></div></div>`;
      }).join('');
      const sc = PP.SCENARIOS[g.opts.scenario || 'normal'];
      const ev = g.events;
      let evHtml = '';
      if (ev && g.eventsEnabled()) {
        const act = ev.active.map(a => `<div class="row">${ico(PP.EVENTS[a.id].icon, 'ci big-ico')}<div class="rt"><div class="rn">${PP.EVENTS[a.id].name} <span class="tag bad">${PP.t('Ativo até o turno {n}', { n: a.end })}</span></div><div class="rs">${esc(PP.EVENTS[a.id].desc)}</div></div></div>`).join('');
        const up = ev.upcoming ? `<div class="row">${ico(PP.EVENTS[ev.upcoming.id].icon, 'ci big-ico')}<div class="rt"><div class="rn">${PP.EVENTS[ev.upcoming.id].name} <span class="tag gold">${PP.t('Começa no turno {n}', { n: ev.upcoming.start })}</span></div><div class="rs">${esc(PP.EVENTS[ev.upcoming.id].desc)}</div></div></div>` : '';
        evHtml = `<div class="sec-lbl">${PP.t('Eventos mundiais')}</div><div class="list">${act}${up || (act ? '' : `<p class="note">${PP.t('Nenhum evento previsto. O próximo pode ser anunciado a partir do turno {n}.', { n: Math.max(g.turn, ev.next - PP.EVENT_WARNING) })}</p>`)}</div>`;
      }
      this.openModal('objectives', `<div class="modal-h"><div><h2>${PP.t('Objetivos')}</h2><div class="sub">${sc ? esc(sc.name) : ''}${g.opts.scenario && g.opts.scenario !== 'normal' ? ' — ' + esc(sc.desc) : ''}</div></div>${this.closeX()}</div>
        <div class="modal-b"><div class="list">${rows}</div>${!g.opts.victories ? `<p class="note">${PP.t('Partida criada antes da expansão: valem as vitórias originais.')}</p>` : ''}${evHtml}</div>`, { narrow: true });
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
      return got.length ? `<p class="note">${PP.t('Conquistas nesta partida: {x}.', { x: esc(got.join(', ')) })}</p>` : '';
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
          ${un && saved[a.id] ? `<span class="cd">${saved[a.id].tribe && PP.TRIBES[saved[a.id].tribe] ? PP.t('Desbloqueada com {x}', { x: PP.TRIBES[saved[a.id].tribe].name }) : PP.t('Desbloqueada')}</span>` : ''}</div>`;
      }).join('');
      const n = PP.ACHIEVEMENTS.filter(a => saved[a.id]).length;
      this.openModal('achievements', `<div class="modal-h"><div><h2>${PP.t('Conquistas')}</h2><div class="sub">${PP.t('{n}/{m} desbloqueadas neste aparelho', { n, m: PP.ACHIEVEMENTS.length })}</div></div>${this.closeX()}</div>
        <div class="modal-b"><div class="grid">${cards}</div></div>`);
    },

    // ============================================================ Estatísticas finais
    finalStatsTable() {
      const g = this.game;
      const rows = g.finalStats();
      const head = rows.map(r => `<th class="num"><span class="swatch" style="background:${r.color}"></span>${esc(r.name)}${r.winner ? ' ★' : ''}</th>`).join('');
      const body = PP.STAT_LABELS.map(([k, label]) => `<tr><td>${PP.t(label)}</td>${rows.map(r => `<td class="num">${r[k] != null ? r[k] : '—'}</td>`).join('')}</tr>`).join('');
      return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>
        <p class="note">${PP.t('Condição de vitória: {x}.', { x: g.endReason ? esc(PP.victoryLabel ? PP.victoryLabel(g.endReason) : g.endReason) : PP.t('partida em andamento') })}</p>`;
    },

    // ============================================================ Replay
    openReplay() {
      const g = this.game;
      if (!g || !g.replay || !g.replay.frames.length) { this.toast(PP.t('Ainda não há quadros de replay.'), ''); return; }
      this.replayState = { i: g.replay.frames.length - 1, timer: null };
      const n = g.replay.frames.length;
      const html = `<div class="modal-h"><div><h2>${PP.t('Replay')}</h2><div class="sub">${PP.t('Um quadro por rodada: território, cidades e tropas.')}</div></div>${this.closeX()}</div>
        <div class="modal-b"><canvas id="replay-cv" class="replay-cv" width="560" height="560"></canvas>
        <div class="replay-ctl"><button type="button" class="chip-btn" data-m="rp" data-v="prev">${ico('ui_prev')}</button>
        <button type="button" class="chip-btn" data-m="rp" data-v="play" id="rp-play">${PP.t('Reproduzir')}</button>
        <button type="button" class="chip-btn" data-m="rp" data-v="next">${ico('ui_next')}</button>
        <input type="range" id="rp-range" min="0" max="${n - 1}" value="${n - 1}" aria-label="${PP.t('Rodada')}"><b id="rp-turn"></b></div>
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
      const lbl = $('#rp-turn'); if (lbl) lbl.textContent = PP.t('Turno {n}', { n: f.turn });
      const range = $('#rp-range'); if (range) range.value = st.i;
      const marks = $('#rp-marks');
      if (marks) marks.innerHTML = f.marks.length ? f.marks.map(m => `<div><em>T${m.t}</em>${esc(m.x)}</div>`).join('') : `<p class="note">${PP.t('Nada marcante nesta rodada.')}</p>`;
    },

    // ============================================================ Eventos do jogo (sistemas novos)
    onGameEventExt(type, d) {
      const g = this.game, v = this.viewer;
      const me = g.players[v];
      switch (type) {
        case 'worldEvent': {
          const def = PP.EVENTS[d.id];
          if (d.phase === 'announce') this.toast(PP.t('Previsão: {x} no turno {n}.', { x: def.name, n: d.start }), '');
          else if (d.phase === 'start') this.toast(PP.t('Evento: {x}!', { x: def.name }), 'gold');
          else if (d.phase === 'end') this.toast(PP.t('Fim: {x}.', { x: def.name }), '');
          this.renderEventChip();
          break;
        }
        case 'ruinChoice':
          if (d.player === v && this.myTurn()) this.openRuinChoice();
          break;
        case 'spy':
          if (d.victim === v && d.caught) this.toast(PP.t('Capturamos um espião de {x}!', { x: g.players[d.unit.owner].name }), 'gold');
          break;
        case 'pillage':
          if (d.victim === v) this.toast(PP.t('{x} saqueou nossa infraestrutura!', { x: g.players[d.unit.owner].name }), 'bad');
          break;
        case 'routeBlocked':
          if (d.route.owner === v) this.toast(PP.t('Uma rota comercial foi interrompida.'), 'bad');
          break;
        case 'routeRestored':
          if (d.route.owner === v) this.toast(PP.t('Rota comercial restabelecida.'), 'good');
          break;
        case 'route':
          if (d.cancelled && d.reason && (d.route.owner === v || d.route.partner === v)) this.toast(PP.t('Rota encerrada: {x}.', { x: d.reason }), 'bad');
          else if (!d.cancelled && d.route.partner === v && d.route.owner !== v) this.toast(PP.t('{x} abriu uma rota comercial com uma cidade sua (+1★ e +1{sci} para você).', { x: g.players[d.route.owner].name, sci: SCI }), 'good');
          break;
        case 'fortTaken':
          if (d.from === v) this.toast(PP.t('Perdemos uma fortificação para {x}.', { x: g.players[d.to].name }), 'bad');
          else if (d.to === v) this.toast(PP.t('Tomamos uma fortificação inimiga.'), 'good');
          break;
        case 'unrest':
          if (d.city.owner === v) this.toast(PP.t('{c} resiste à ocupação.', { c: d.city.name }), 'bad');
          break;
        case 'integrated':
          if (d.city.owner === v) this.toast(PP.t('{c} foi integrada ao império.', { c: d.city.name }), 'good');
          break;
        case 'revolt':
          if (d.from === v) this.toast(d.to === v ? PP.t('Revolta em {c}!', { c: d.city.name }) : PP.t('{c} se revoltou e voltou para {x}!', { c: d.city.name, x: g.players[d.to].name }), 'bad');
          else if (d.to === v) this.toast(PP.t('{c} se revoltou e voltou para nós!', { c: d.city.name }), 'good');
          break;
        case 'achievement':
          if (d.player === v) { this.toast(PP.t('Conquista desbloqueada: {x}', { x: PP.ACHIEVEMENT[d.id] ? PP.ACHIEVEMENT[d.id].name : d.name }), 'gold'); this.recordAchievements(); }
          break;
        case 'project':
          if (d.player === v || (me && me.met[d.player])) this.toast(PP.t('{x}: etapa {n} do {p}.', { x: g.players[d.player].name, n: d.stage, p: PP.SCIENCE_PROJECT.name }), d.player === v ? 'good' : 'bad');
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
      const needTurn = () => { if (!this.myTurn()) { this.toast(PP.t('Espere a sua vez.'), 'bad'); return false; } return true; };
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
            if (st.timer) { clearInterval(st.timer); st.timer = null; btn.textContent = PP.t('Reproduzir'); break; }
            if (st.i >= n - 1) st.i = 0;
            btn.textContent = PP.t('Pausar');
            st.timer = setInterval(() => {
              if (!this.replayState) return;
              if (st.i >= n - 1) { clearInterval(st.timer); st.timer = null; const b = $('#rp-play'); if (b) b.textContent = PP.t('Reproduzir'); return; }
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
          if (res === 'invalid') { const chk = g.canPropose(me.id, o.id, d.t); this.toast(chk.reason || PP.t('Proposta inválida.'), 'bad'); }
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
          if (d.dir === 'give') { if (g.payTribute(me.id, o.id, +d.v, false)) this.toast(PP.t('Você presenteou {x} com {n}★.', { x: o.name, n: d.v }), 'good'); }
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
          this.ask(PP.t('Encerrar a aliança?'), `<p>${PP.t('Vocês voltam à paz comum. {x} vai se lembrar disso, mas sem a mancha de uma traição.', { x: esc(o.name) })}</p>`, PP.t('Encerrar'), PP.t('Manter')).then(ok => {
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
          const go = () => { if (g.setSpec(me, c, d.v)) { this.toast(PP.t('{c} agora é uma cidade {s}.', { c: c.name, s: PP.SPECS[d.v].name.toLowerCase() }), 'good'); this.afterAction(); } this.openCity(c, true); };
          if (c.spec) this.ask(PP.t('Trocar a especialização?'), `<p>${PP.t('Trocar custa {n}★. As construções exclusivas da especialização atual ficam inativas.', { n: chk.cost })}</p>`, PP.t('Trocar'), PP.t('Cancelar')).then(ok => { if (ok) go(); });
          else go();
          break;
        }
        case 'route': {
          if (!needTurn()) break;
          const c = g.cityMap[+d.city], to = g.cityMap[+d.to];
          const r = g.createRoute(me, c, to);
          if (r) this.toast(PP.t('Rota aberta até {c}.', { c: to.name }), 'good'); else this.toast(g.routeCheck(me, c, to).reason || PP.t('Não foi possível abrir a rota.'), 'bad');
          this.afterAction();
          this.openCity(c, true);
          break;
        }
        case 'cancelRoute': {
          if (!needTurn()) break;
          const r = (g.routes || []).find(x => x.id === +d.id);
          if (r && r.owner === me.id) g.cancelRoute(r, PP.t('encerrada por você'));
          else if (r) { this.toast(PP.t('Só quem abriu a rota pode encerrá-la.'), 'bad'); break; }
          this.afterAction();
          this.openCity(g.cityMap[+d.city], true);
          break;
        }
        case 'project': {
          if (!needTurn()) break;
          const c = g.cityMap[+d.city];
          if (!g.advanceProject(me, c)) { this.toast(g.projectCheck(me, c).reason || PP.t('Indisponível'), 'bad'); break; }
          this.afterAction();
          if (!g.over) this.openCity(c, true);
          break;
        }
        case 'ruin': {
          if (!this.myTurn()) break;
          if (g.resolveRuin(me, d.v)) { this.closeModal('ruin'); this.afterAction(); }
          else this.toast(PP.t('Opção indisponível.'), 'bad');
          break;
        }
      }
    },
  });
})(window.PP = window.PP || {});
