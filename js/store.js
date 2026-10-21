/* Chamas de Vardren — loja e anúncios (2.5). Catálogo dos produtos da Play Store, posse das compras e a ponte com o
   app Android (android/play: Google Play Billing + AdMob). As compras ficam na conta Google Play do jogador: o app
   consulta a Play Store a cada abertura e a resposta dela substitui o que estiver guardado neste aparelho, então uma
   compra continua valendo depois de reinstalar ou num aparelho novo (botão Restaurar compras), e uma compra
   reembolsada deixa de valer. Fora do app (navegador, APK avulso) não há loja: as tribos da loja ficam só para a IA.

   Ponte (window.VardrenNative, métodos @JavascriptInterface; só textos e booleanos):
     info() → JSON { billing, ads, store }   init()   buy(id)   restore()
     showInterstitial() → bool   showRewarded() → bool   privacyOptions()   setAdsRemoved(bool)
   O app responde chamando PP.store.fromNative(json) com { ev, ... }:
     products { list: [{ id, price, title }] } · owned { list: [id...], restored } (lista completa da conta)
     purchase { id, state: ok|pending|canceled|error, msg } · ad { kind: interstitial|rewarded, state: shown|closed|reward|failed }
     consent { canAds, privacyRequired } · billing { ok, msg } */
(function (PP) {
  'use strict';

  PP.STORE = {
    products: {
      tribe_kemet:   { kind: 'tribe', tribes: ['kemet'] },
      tribe_tarkhan: { kind: 'tribe', tribes: ['tarkhan'] },
      tribe_eriu:    { kind: 'tribe', tribes: ['eriu'] },
      tribes_bundle: { kind: 'bundle', tribes: ['kemet', 'tarkhan', 'eriu'], name: 'Pacote das três tribos', desc: 'Kemet, Tarkhan e Ériu com desconto.' },
      remove_ads:    { kind: 'noads', name: 'Sem anúncios', desc: 'Tira os anúncios entre as partidas. Os vídeos opcionais do tesouro continuam lá, só se você quiser.' },
    },
    order: ['tribe_kemet', 'tribe_tarkhan', 'tribe_eriu', 'tribes_bundle', 'remove_ads'],
    // intervalo mínimo entre anúncios de tela cheia (s), carência depois de abrir o app (s) e o vídeo opcional do tesouro
    ads: { gap: 240, grace: 150, rewardEvery: 10, rewardFrom: 3, rewardBase: 3, rewardPerTurns: 10, rewardMax: 10 },
  };

  const CACHE_KEY = 'vardren-owned';
  const now = () => Date.now() / 1000;
  const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
  const readCache = () => { try { const s = ls(); const v = s && JSON.parse(s.getItem(CACHE_KEY) || 'null'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const writeCache = ids => { try { const s = ls(); if (s) s.setItem(CACHE_KEY, JSON.stringify(ids)); } catch (e) { /* sem armazenamento */ } };

  const store = {
    owned: {}, prices: {}, pending: {}, listeners: [],
    started: now(), lastAd: 0, rewardCb: null,
    billing: false, ads: false, canAds: true, privacyRequired: false, synced: false, error: '',

    native() { return typeof window !== 'undefined' && window.VardrenNative ? window.VardrenNative : null; },

    init() {
      const n = this.native();
      if (!n) return this;
      let info = {};
      try { info = JSON.parse(n.info() || '{}'); } catch (e) { info = {}; }
      this.billing = !!info.billing; this.ads = !!info.ads;
      // enquanto a Play Store não responde (sem internet, por exemplo), vale o que ela disse da última vez
      if (this.billing) for (const id of readCache()) if (PP.STORE.products[id]) this.owned[id] = true;
      try { n.init(); } catch (e) { this.error = String(e); }
      this.emit();
      return this;
    },

    on(fn) { this.listeners.push(fn); },
    emit(ev) { for (const fn of this.listeners) { try { fn(ev || {}); } catch (e) { console.error(e); } } },

    available() { return this.billing; },
    owns(id) { return !!this.owned[id]; },
    // produto que libera a tribo (o pacote libera as três)
    tribeUnlocked(tid) {
      const t = PP.TRIBES[tid];
      if (!t || !t.premium) return !!t;
      return this.owns(t.premium) || PP.STORE.order.some(id => this.owned[id] && (PP.STORE.products[id].tribes || []).indexOf(tid) >= 0);
    },
    productOwned(id) {
      const d = PP.STORE.products[id];
      if (!d) return false;
      if (this.owns(id)) return true;
      return d.kind === 'bundle' && d.tribes.every(t => this.tribeUnlocked(t));
    },
    price(id) { return this.prices[id] || ''; },

    buy(id) {
      const n = this.native();
      if (!n || !this.billing || !PP.STORE.products[id] || this.productOwned(id)) return false;
      try { n.buy(id); return true; } catch (e) { this.error = String(e); return false; }
    },
    restore() {
      const n = this.native();
      if (!n || !this.billing) return false;
      try { n.restore(); return true; } catch (e) { return false; }
    },
    privacyOptions() { const n = this.native(); if (n && n.privacyOptions) { try { n.privacyOptions(); return true; } catch (e) { /* ignora */ } } return false; },

    // ------------------------------------------------------------ Anúncios
    adsActive() { return !!(this.native() && this.ads && this.canAds); },
    interstitialsOn() { return this.adsActive() && !this.owns('remove_ads'); },
    // anúncio de tela cheia só entre partidas, com intervalo mínimo e nunca logo depois de abrir o app
    maybeInterstitial() {
      if (!this.interstitialsOn()) return false;
      const t = now(), A = PP.STORE.ads;
      if (t - this.started < A.grace || t - this.lastAd < A.gap) return false;
      let shown = false;
      try { shown = !!this.native().showInterstitial(); } catch (e) { shown = false; }
      if (shown) this.lastAd = t;
      return shown;
    },
    // vídeo opcional: cb só é chamado quando o app confirma a recompensa
    showRewarded(cb) {
      if (!this.adsActive()) return false;
      let ok = false;
      try { ok = !!this.native().showRewarded(); } catch (e) { ok = false; }
      if (ok) { this.rewardCb = cb; this.lastAd = now(); }
      return ok;
    },

    // ------------------------------------------------------------ Respostas do app
    fromNative(json) {
      let m;
      try { m = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return; }
      if (!m || !m.ev) return;
      switch (m.ev) {
        case 'billing': this.billing = !!m.ok; this.error = m.ok ? '' : String(m.msg || ''); break;
        case 'products':
          for (const it of m.list || []) if (PP.STORE.products[it.id]) this.prices[it.id] = String(it.price || '');
          break;
        case 'owned': {
          // lista completa da conta: o que não veio deixou de valer (reembolso, outra conta)
          const ids = (m.list || []).filter(id => PP.STORE.products[id]);
          this.owned = {};
          for (const id of ids) { this.owned[id] = true; delete this.pending[id]; }
          writeCache(ids);
          this.synced = true;
          this.syncAds();
          break;
        }
        case 'purchase':
          if (!PP.STORE.products[m.id]) break; // id vazio: falha ao conferir as compras (a interface avisa)
          if (m.state === 'ok') { this.owned[m.id] = true; delete this.pending[m.id]; writeCache(Object.keys(this.owned)); this.syncAds(); }
          else if (m.state === 'pending') this.pending[m.id] = true;
          else delete this.pending[m.id];
          break;
        case 'consent': this.canAds = m.canAds !== false; this.privacyRequired = !!m.privacyRequired; break;
        case 'ad':
          if (m.state === 'shown') { if (PP.audio && PP.audio.background) PP.audio.background(true); }
          else if (m.state === 'closed' || m.state === 'failed') {
            // o app manda 'reward' antes de 'closed'; fechar sem recompensa não dá nada
            if (PP.audio && PP.audio.background) PP.audio.background(false);
            if (m.kind === 'rewarded') this.rewardCb = null;
          } else if (m.state === 'reward') {
            const cb = this.rewardCb; this.rewardCb = null;
            if (cb) { try { cb(); } catch (e) { console.error(e); } }
          }
          break;
      }
      this.emit(m);
    },

    syncAds() { const n = this.native(); if (n && n.setAdsRemoved) { try { n.setAdsRemoved(this.owns('remove_ads')); } catch (e) { /* ignora */ } } },
  };
  PP.store = store;

  // ------------------------------------------------------------ Regra do vídeo opcional (motor)
  // Só em partidas com um único humano, a partir do turno 3, uma vez a cada 10 turnos; rende 3★ + 1★ a cada 10 turnos (máx. 10★).
  if (PP.Game) {
    Object.assign(PP.Game.prototype, {
      adBonusAmount() { const A = PP.STORE.ads; return Math.min(A.rewardMax, A.rewardBase + Math.floor(this.turn / A.rewardPerTurns)); },
      adBonusCheck(p) {
        const A = PP.STORE.ads;
        const r = { ok: false, reason: '', amount: this.adBonusAmount(), next: 0 };
        if (!p || !p.human || this.over || this.players.filter(q => q.human).length !== 1) { r.reason = PP.t('Só em partidas com um jogador'); r.multi = true; return r; }
        if (p.id !== this.current) { r.reason = PP.t('Espere a sua vez.'); return r; }
        if (this.turn < A.rewardFrom) { r.reason = PP.t('A partir do turno {n}', { n: A.rewardFrom }); r.next = A.rewardFrom; return r; }
        if (p.adBonusTurn != null && this.turn - p.adBonusTurn < A.rewardEvery) { r.next = p.adBonusTurn + A.rewardEvery; r.reason = PP.t('De novo no turno {n}', { n: r.next }); return r; }
        r.ok = true;
        return r;
      },
      grantAdBonus(p) {
        const chk = this.adBonusCheck(p);
        if (!chk.ok) return false;
        p.stars += chk.amount;
        p.adBonusTurn = this.turn;
        p.stats.adBonus = (p.stats.adBonus || 0) + chk.amount;
        this.emit('adbonus', { player: p.id, amount: chk.amount });
        return true;
      },
    });
  }
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
