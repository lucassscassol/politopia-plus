/* Chamas de Vardren — interface da loja e dos anúncios (2.5): botão Loja no menu principal, tela da loja (tribos,
   pacote, Sem anúncios, restaurar compras, privacidade), tribos da loja travadas para os humanos na criação da
   partida, anúncios de tela cheia só entre partidas e o vídeo opcional do Tesouro. Usa PP.store (js/store.js).
   Estende PP.UI. */
(function (PP) {
  'use strict';
  const { esc, tribeIcon, crest, ico } = PP.uiHelpers;
  const $ = s => document.querySelector(s);
  const proto = PP.UI.prototype;
  const S = () => PP.store;

  Object.assign(proto, {
    tribeLocked(id) { return !!(PP.TRIBES[id] && PP.TRIBES[id].premium) && !S().tribeUnlocked(id); },

    // humanos não ficam com tribo travada (troca pela primeira livre)
    fixLockedSlots() {
      const s = this.setupState;
      if (!s) return;
      s.slots.forEach((sl, i) => {
        if ((i === 0 || sl.human) && this.tribeLocked(sl.tribe)) {
          const free = PP.TRIBE_IDS.find(t => !this.tribeLocked(t) && !s.slots.some(x => x.tribe === t));
          if (free) sl.tribe = free;
        }
      });
    },

    // ============================================================ Tela da loja
    openStore(focus, refresh) {
      const st = S(), live = st.available();
      const priceBtn = id => {
        if (st.productOwned(id)) return `<span class="tag good">${PP.t('Na sua conta')}</span>`;
        if (st.pending[id]) return `<span class="tag gold">${PP.t('Pagamento pendente')}</span>`;
        if (!live) return `<span class="tag">${PP.t('Só no app')}</span>`;
        const pr = st.price(id);
        return `<button type="button" class="chip-btn" data-m="storeBuy" data-v="${id}">${pr ? PP.t('Comprar · {p}', { p: esc(pr) }) : PP.t('Comprar')}</button>`;
      };
      const tribeCard = id => {
        const tid = PP.STORE.products[id].tribes[0], t = PP.TRIBES[tid];
        return `<div class="row store-item ${focus === tid ? 'focus' : ''}" style="--tribe:${t.color}">${crest(t.color, tribeIcon(tid), 'crest-m')}
          <div class="rt"><div class="rn">${t.name}</div><div class="rs">${esc(t.perk)}</div><div class="rs">${esc(t.unique)}</div>
          <div class="rs muted">${t.extraTech ? PP.t('Começa com {a} e {b}.', { a: PP.TECH[t.startTech].name, b: PP.TECH[t.extraTech].name }) : PP.t('Começa com {a}.', { a: PP.TECH[t.startTech].name })}</div></div>
          <div class="ra">${priceBtn(id)}</div></div>`;
      };
      const other = id => {
        const d = PP.STORE.products[id];
        const icon = d.kind === 'noads' ? 'ui_ad' : 'ui_premium';
        return `<div class="row store-item"><span class="row-ico">${ico(icon)}</span><div class="rt"><div class="rn">${d.name}</div><div class="rs">${esc(d.desc)}</div></div>
          <div class="ra">${priceBtn(id)}</div></div>`;
      };
      const tribes = PP.STORE.order.filter(id => PP.STORE.products[id].kind === 'tribe').map(tribeCard).join('');
      const extras = PP.STORE.order.filter(id => PP.STORE.products[id].kind !== 'tribe').map(other).join('');
      let status;
      if (!live && st.native()) status = `<p class="note"><span class="tag bad">${PP.t('Loja')}</span> ${PP.t('A Google Play não respondeu. Confira a internet e a conta Google do aparelho e abra a loja de novo.')}${st.error ? ' (' + esc(st.error) + ')' : ''}</p>`;
      else if (!live) status = `<p class="note">${PP.t('A loja funciona no app Chamas de Vardren da Google Play. Nesta versão, as tribos da loja aparecem só como adversárias da IA.')}</p>`;
      else status = `<p class="note">${PP.t('As compras ficam na sua conta Google Play: reinstalou o jogo ou trocou de aparelho? Toque em Restaurar compras.')}${st.synced ? '' : ' ' + PP.t('Conferindo suas compras…')}</p>`;
      if (st.error && live) status += `<p class="note"><span class="tag bad">${PP.t('Loja')}</span> ${esc(st.error)}</p>`;
      const acts = live ? `<button type="button" class="btn ghost" data-m="storeRestore">${ico('ui_restore')} ${PP.t('Restaurar compras')}</button>` : '';
      const priv = st.adsActive() || st.privacyRequired ? `<button type="button" class="btn ghost" data-m="storePrivacy">${PP.t('Privacidade e anúncios')}</button>` : '';
      const html = `<div class="modal-h">${crest('#c9a45c', 'ui_store', 'crest-l')}<div class="mh-t"><h2>${PP.t('Loja')}</h2>
        <div class="sub">${PP.t('Tribos novas com jogos próprios: não são mais fortes, só diferentes.')}</div></div>${this.closeX()}</div>
        <div class="modal-b">${status}
          <div class="sec-lbl">${PP.t('Tribos')}</div><div class="list">${tribes}</div>
          <div class="sec-lbl">${PP.t('Pacote e opções')}</div><div class="list">${extras}</div>
        </div>
        <div class="modal-f">${acts}${priv}<button type="button" class="btn primary" data-m="close">${PP.t('Fechar')}</button></div>`;
      if (refresh || this.modals.some(m => m.kind === 'store')) this.replaceModal('store', html); else this.openModal('store', html);
      if (focus && !refresh) setTimeout(() => { const el = document.querySelector('.store-item.focus'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' }); }, 40);
    },

    storeAction(a, d) {
      const st = S();
      if (a === 'storeBuy') { if (!st.buy(d.v)) this.toast(PP.t('A loja não está disponível agora.'), 'bad'); return true; }
      if (a === 'storeRestore') { if (st.restore()) this.toast(PP.t('Conferindo suas compras na Google Play…')); else this.toast(PP.t('A loja não está disponível agora.'), 'bad'); return true; }
      if (a === 'storePrivacy') { st.privacyOptions(); return true; }
      return false;
    },

    // respostas do app: atualiza a tela aberta e avisa das compras
    onStoreEvent(m) {
      if (m.ev === 'purchase' && !m.id) {
        if (m.state === 'error') this.toast(PP.t('Não foi possível conferir as compras agora.') + (m.msg ? ' ' + m.msg : ''), 'bad');
      } else if (m.ev === 'purchase') {
        const d = PP.STORE.products[m.id];
        const name = d ? (d.kind === 'tribe' ? PP.TRIBES[d.tribes[0]].name : d.name) : '';
        if (m.state === 'ok') this.toast(PP.t('{x} liberado na sua conta.', { x: name }), 'gold');
        else if (m.state === 'pending') this.toast(PP.t('Pagamento pendente: {x} é liberado quando o Google confirmar.', { x: name }));
        else if (m.state === 'error') this.toast(PP.t('A compra não foi concluída.') + (m.msg ? ' ' + m.msg : ''), 'bad');
      } else if (m.ev === 'owned' && m.restored) {
        this.toast(PP.t('Compras conferidas: {n}.', { n: (m.list || []).length }), 'good');
      }
      if (this.modals.some(x => x.kind === 'store')) this.openStore(null, true);
      if (!this.game && this.setupState && $('#setup') && !$('#setup').hidden) this.renderSetup();
      if (this.game && this.modals.some(x => x.kind === 'realm') && this.openRealm) this.openRealm(true);
    },

    // ============================================================ Tesouro: vídeo opcional
    adRow(p) {
      const st = S(), g = this.game;
      if (!st.adsActive() || !g || !g.adBonusCheck) return '';
      const chk = g.adBonusCheck(p);
      if (chk.multi) return '';
      return `<div class="row tight"><span class="row-ico">${ico('ui_ad')}</span><div class="rt"><div class="rn">${PP.t('Vídeo opcional: +{n}★', { n: chk.amount })}</div>
        <div class="rs">${PP.t('Assista a um anúncio para receber estrelas. Uma vez a cada {n} turnos.', { n: PP.STORE.ads.rewardEvery })}</div></div>
        <div class="ra"><button type="button" class="chip-btn" data-m="adBonus" ${chk.ok ? '' : 'disabled'}>${chk.ok ? PP.t('Assistir') : esc(chk.reason)}</button></div></div>`;
    },

    watchAdBonus() {
      const g = this.game, p = this.me();
      if (!g || !p || !g.adBonusCheck(p).ok) return;
      const ok = S().showRewarded(() => {
        const n = g.adBonusAmount();
        if (this.game !== g || !g.grantAdBonus(p)) return;
        this.toast(PP.t('+{n}★ no tesouro.', { n }), 'gold');
        this.renderHud();
        if (this.modals.some(m => m.kind === 'realm')) this.openRealm(true);
        this.save();
      });
      if (!ok) this.toast(PP.t('O vídeo ainda não carregou. Tente de novo em instantes.'), 'bad');
    },
  });

  // ---------------------------------------------------------- Ganchos nos métodos existentes
  const chain = (name, fn) => { const prev = proto[name]; proto[name] = function (...args) { return fn.call(this, prev, ...args); }; };

  chain('bindHud', function (prev, ...args) {
    const r = prev.apply(this, args);
    const b = $('#m-store');
    if (b) b.onclick = () => this.openStore();
    if (!this.storeBound) { this.storeBound = true; S().on(m => this.onStoreEvent(m)); S().init(); }
    return r;
  });

  chain('renderSetup', function (prev, keep) {
    if (keep === false) this.fixLockedSlots();
    return prev.call(this, keep);
  });

  // trocar um jogador para humano não pode deixá-lo com uma tribo travada
  chain('startFromSetup', function (prev, ...args) {
    const s = this.setupState;
    const bad = s && s.slots.find((x, i) => (i === 0 || x.human) && this.tribeLocked(x.tribe));
    if (bad) { this.toast(PP.t('{x} é uma tribo da loja: compre na Loja ou escolha outra.', { x: PP.TRIBES[bad.tribe].name }), 'bad'); this.openStore(bad.tribe); return undefined; }
    S().maybeInterstitial();
    return prev.apply(this, args);
  });

  // anúncio de tela cheia ao sair de uma partida (fim de jogo ou Salvar e sair)
  chain('showMenu', function (prev, ...args) {
    const had = !!this.game;
    const r = prev.apply(this, args);
    if (had) S().maybeInterstitial();
    return r;
  });

  chain('armyRow', function (prev, p, inc) { return (prev ? prev.call(this, p, inc) : '') + this.adRow(p); });

  chain('modalActionExt', function (prev, a, d, btn) {
    if (this.storeAction(a, d)) return;
    if (a === 'adBonus') { this.watchAdBonus(); return; }
    return prev.call(this, a, d, btn);
  });
})(window.PP);
