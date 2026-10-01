/* Chamas de Vardren — interface: entrada, HUD, painéis, modais e fluxo de turnos */
(function (PP) {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const UN = PP.UNITS, TER = PP.TERRAIN;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fmt = n => PP.num(n);
  const SAVE_KEY = 'chamas-vardren:save';
  const SET_KEY = 'chamas-vardren:settings';
  const SCI = '⚗︎';
  const ERA = () => ['', PP.t('Era I · Tribal'), PP.t('Era II · Bronze'), PP.t('Era III · Reinos'), PP.t('Era IV · Pólvora'), PP.t('Era V · Impérios')];

  // Redesenhar com innerHTML recria as áreas roláveis e a rolagem voltaria ao início. keepScroll guarda a rolagem
  // de root e das áreas roláveis dentro dele, roda o redesenho e devolve cada uma à posição anterior.
  const SCROLLERS = '.setup-b, .modal-b, .acts, .tbl-wrap, .log-list, .list';
  function keepScroll(root, redraw) {
    const saved = [];
    if (root) {
      saved.push([null, root.scrollTop, root.scrollLeft]);
      root.querySelectorAll(SCROLLERS).forEach((el, i) => { if (el.scrollTop || el.scrollLeft) saved.push([i, el.scrollTop, el.scrollLeft]); });
    }
    redraw();
    if (!root) return;
    const now = root.querySelectorAll(SCROLLERS);
    for (const [i, top, left] of saved) {
      const el = i == null ? root : now[i];
      if (el) { el.scrollTop = top; el.scrollLeft = left; }
    }
  }

  function store(key, val) { try { if (val == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } }
  function load(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } }

  // O jogo se chamava Politopia+: copia uma única vez a partida salva, as opções e as conquistas guardadas
  // com o nome antigo para as chaves novas (as antigas ficam intactas, nada é apagado).
  (function migrateLegacyStorage() {
    try {
      if (localStorage.getItem('chamas-vardren:migrated')) return;
      for (const k of ['save', 'settings', 'achievements']) {
        const old = localStorage.getItem('politopia-plus:' + k);
        if (old && !localStorage.getItem('chamas-vardren:' + k)) localStorage.setItem('chamas-vardren:' + k, old);
      }
      localStorage.setItem('chamas-vardren:migrated', '1');
    } catch (e) { /* armazenamento indisponível: segue sem migrar */ }
  })();

  // ------------------------------------------------------------ Ícones e brasões (SVG inline)
  function ico(key, cls) {
    const d = PP.ICONS && PP.ICONS[key];
    return d ? `<svg class="ico ${cls || ''}" viewBox="0 0 512 512" aria-hidden="true"><path d="${d}"/></svg>` : '';
  }
  function crest(color, key, cls) {
    return `<span class="crest ${cls || ''}" style="--tribe:${color}"><svg class="crest-bg" viewBox="0 0 40 46" aria-hidden="true"><path d="M2 2H38V20Q38 33 20 44Q2 33 2 20Z"/><path class="crest-rim" d="M5.5 5H34.5V20Q34.5 30.5 20 39.8Q5.5 30.5 5.5 20Z"/></svg>${ico(key, 'crest-ico')}</span>`;
  }
  const tribeIcon = id => 'tr_' + id;
  const unitIcon = (g, u) => {
    if (UN[u.type].naval) return 'u_' + u.type;
    const t = g.tileAt(u);
    if (TER[t.terrain].water && t.landmark !== 'vau') return ['n_raft', 'n_raft', 'n_ship', 'n_battleship'][Math.max(1, g.navalLevel(g.players[u.owner]))];
    return 'u_' + u.type;
  };
  const ACTION_ICON = { harvest: 'a_harvest', hunt: 'a_hunt', fishing: 'a_fishing', whaling: 'a_whaling', road: 'a_road', clear: 'a_clear', burn: 'a_burn', plant: 'a_plant', drain: 'a_drain',
    whalestation: 'a_whaling', terrace: 'a_terrace', tower: 'f_tower', outpost: 'f_outpost', fort: 'f_fort', fortress: 'f_fortress', repair: 'a_repair' };
  const IMP_ICON = { whalestation: 'a_whaling', terrace: 'a_terrace' };
  const actionIcon = a => ACTION_ICON[a.id] || 'i_' + a.imp;
  const impIcon = imp => IMP_ICON[imp] || 'i_' + imp;
  const rewardIcon = r => r === 'walls' ? 'b_walls' : r === 'giant' ? 'u_giant' : /^m_/.test(r) ? 'rw_milestone' : 'rw_' + r;
  PP.ico = ico;
  PP.crest = crest;
  PP.uiHelpers = { esc, fmt, SCI, tribeIcon, unitIcon, crest, ico, store, load, sleep };

  class UI {
    constructor() {
      this.canvas = $('#map');
      this.r = new PP.Renderer(this.canvas);
      this.fx = $('#fx') ? new PP.AshFX($('#fx')) : null;
      this.game = null;
      this.viewer = 0;
      this.sel = null;
      this.busy = false;
      this.modals = [];
      this.confirmDisband = null;
      this.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this.settings = Object.assign({ speed: this.reduced ? 'instant' : 'normal', follow: true, seenHelp: false, ash: !this.reduced, lang: 'pt' }, load(SET_KEY) || {});
      this.applySettings();
      this.applyLang();
      this.hydrateIcons(document);
      this.bindInput();
      this.bindHud();
      window.addEventListener('resize', () => { this.r.resize(); });
    }

    applySettings() {
      this.r.speed = { normal: 1, fast: 2.2, instant: 0 }[this.settings.speed] ?? 1;
      this.r.followAI = !!this.settings.follow;
      if (this.fx) this.fx.setOn(!!this.settings.ash);
      store(SET_KEY, this.settings);
    }

    hydrateIcons(root) {
      root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = ico(el.dataset.icon); });
    }

    // ============================================================ Idioma
    // Aplica o idioma salvo nas regras (nomes de unidades, tecnologias...) e nos textos fixos da página.
    applyLang() {
      PP.applyLanguage(this.settings.lang || 'pt');
      document.documentElement.lang = PP.LANG_LOCALE[PP.lang];
      this.translateStatic(document);
    }

    // Textos fixos do index.html: data-i18n traduz o conteúdo; data-i18n-attr="title,aria-label" traduz atributos.
    // O texto original em português fica guardado no próprio elemento para poder trocar de idioma várias vezes.
    translateStatic(root) {
      root.querySelectorAll('[data-i18n]').forEach(el => {
        if (el.dataset.i18nSrc == null) el.dataset.i18nSrc = el.innerHTML.trim();
        el.innerHTML = PP.t(el.dataset.i18nSrc);
      });
      root.querySelectorAll('[data-i18n-attr]').forEach(el => {
        for (const a of el.dataset.i18nAttr.split(',')) {
          const k = 'i18n' + a.replace(/(^|-)(\w)/g, (m, s, c) => c.toUpperCase());
          if (el.dataset[k] == null) el.dataset[k] = el.getAttribute(a) || '';
          el.setAttribute(a, PP.t(el.dataset[k]));
        }
      });
      const desc = document.querySelector('meta[name="description"]');
      if (desc) {
        if (desc.dataset.i18nSrc == null) desc.dataset.i18nSrc = desc.getAttribute('content');
        desc.setAttribute('content', PP.t(desc.dataset.i18nSrc));
      }
    }

    // Troca o idioma na hora: regras, textos fixos, HUD, painel, tela de criação e o menu aberto.
    setLang(lang) {
      if (!PP.LANGS[lang] || lang === PP.lang) return;
      this.settings.lang = lang;
      store(SET_KEY, this.settings);
      this.applyLang();
      this.hydrateIcons(document);
      if (this.setupState && !$('#setup').hidden) this.renderSetup();
      if (this.game) {
        this.renderHud();
        if (this.sel) this.refreshSelection();
        this.r.dirty = true;
      }
      if (this.modals.some(m => m.kind === 'menu')) this.openGameMenu(true);
      this.renderLangPicker();
    }

    // Seletor de idioma do menu principal (os nomes ficam sempre no próprio idioma, para quem não lê o atual)
    renderLangPicker() {
      const box = $('#m-lang');
      if (!box) return;
      box.innerHTML = Object.keys(PP.LANGS).map(k =>
        `<button type="button" class="${PP.lang === k ? 'on' : ''}" data-lang="${k}" lang="${PP.LANG_LOCALE[k]}" aria-pressed="${PP.lang === k}">${PP.LANGS[k]}</button>`).join('');
    }

    // ============================================================ Entrada
    bindInput() {
      const c = this.canvas;
      const pts = new Map();
      let start = null, panning = false, pinch = null;
      const local = e => { const b = c.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
      c.addEventListener('pointerdown', e => {
        c.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, local(e));
        if (pts.size === 1) { start = local(e); panning = false; }
        pinch = null;
      });
      c.addEventListener('pointermove', e => {
        const cur = local(e);
        if (!pts.has(e.pointerId)) {
          if (e.pointerType === 'mouse' && this.game) {
            const t = this.r.screenToTile(cur.x, cur.y);
            if (t !== this.r.hl.hover) { this.r.hl.hover = t; this.r.dirty = true; }
          }
          return;
        }
        const prev = pts.get(e.pointerId);
        pts.set(e.pointerId, cur);
        if (pts.size === 1) {
          if (!panning && Math.hypot(cur.x - start.x, cur.y - start.y) > 8) panning = true;
          if (panning) this.r.pan(cur.x - prev.x, cur.y - prev.y);
        } else if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          if (pinch && pinch.d > 0) { this.r.zoomAt(d / pinch.d, mx, my); this.r.pan(mx - pinch.mx, my - pinch.my); }
          pinch = { d, mx, my };
          panning = true;
        }
      });
      const up = e => {
        const had = pts.has(e.pointerId);
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch = null;
        if (had && pts.size === 0 && !panning && e.type === 'pointerup') {
          this.lastMapTap = performance.now();
          const p = local(e);
          const hit = this.game && this.r.unitAtScreen(p.x, p.y);
          const t = hit ? this.game.tileAt(hit) : this.r.screenToTile(p.x, p.y);
          if (t) this.handleTap(t); else this.deselect();
        }
      };
      c.addEventListener('pointerup', up);
      c.addEventListener('pointercancel', up);
      // No celular, depois de um toque o navegador ainda dispara um "click" no ponto tocado. Se o toque abriu
      // um painel, esse clique cairia num botão que acabou de aparecer ali (ex.: Fim do turno). Cancelar o
      // touchend do mapa impede esse clique; o filtro abaixo cobre navegadores que o disparam mesmo assim.
      c.addEventListener('touchend', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
      window.addEventListener('click', e => {
        if (e.target === c || !this.lastMapTap || performance.now() - this.lastMapTap > 450) return;
        if (e.target.closest && e.target.closest('#hud, #modal-root')) { e.stopPropagation(); e.preventDefault(); }
      }, true);
      c.addEventListener('pointerleave', () => { if (this.r.hl.hover) { this.r.hl.hover = null; this.r.dirty = true; } });
      c.addEventListener('wheel', e => {
        e.preventDefault();
        const p = local(e);
        this.r.zoomAt(Math.exp(-e.deltaY * 0.0016), p.x, p.y);
      }, { passive: false });
      window.addEventListener('keydown', e => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
        if (e.key === 'Escape') { if (this.modals.length) this.closeModal(); else this.deselect(); return; }
        if (!this.game || this.modals.length || !$('#menu').hidden) return;
        const k = e.key.toLowerCase();
        if ((k === 'enter' || k === ' ') && this.myTurn()) { e.preventDefault(); this.endTurn(); }
        else if (k === 'n') this.nextUnit();
        else if (k === 't') this.openTech();
        else if (k === 'd') this.openDiplomacy();
        else if (k === 'c') this.openCities();
        else if (k === 'o') this.openObjectives();
        else if (k === '+' || k === '=') this.r.zoomAt(1.2, this.r.w / 2, this.r.h / 2);
        else if (k === '-') this.r.zoomAt(1 / 1.2, this.r.w / 2, this.r.h / 2);
      });
    }

    bindHud() {
      $('#btn-end').onclick = () => this.endTurn();
      $('#btn-next').onclick = () => this.nextUnit();
      $('#btn-tech').onclick = () => this.openTech();
      $('#btn-diplo').onclick = () => this.openDiplomacy();
      $('#btn-stats').onclick = () => this.openStats();
      $('#btn-log').onclick = () => this.openLog();
      $('#btn-cities').onclick = () => this.openCities();
      $('#btn-goals').onclick = () => this.openObjectives();
      $('#tb-event').onclick = () => this.openObjectives();
      $('#btn-menu').onclick = () => this.openGameMenu();
      $('#btn-skip').onclick = () => { this.fastForward = true; $('#btn-skip').disabled = true; };
      $('#m-new').onclick = () => this.showSetup();
      $('#m-help').onclick = () => this.openHelp();
      $('#m-ach').onclick = () => this.openAchievements();
      $('#m-continue').onclick = () => this.continueSaved();
      if ($('#m-lang')) {
        $('#m-lang').onclick = e => { const b = e.target.closest('[data-lang]'); if (b) this.setLang(b.dataset.lang); };
        this.renderLangPicker();
      }
      $('#panel').addEventListener('click', e => {
        const b = e.target.closest('[data-a]');
        if (b) this.panelAction(b.dataset.a, b.dataset);
      });
      $('#modal-root').addEventListener('click', e => {
        const b = e.target.closest('[data-m]');
        if (b) { this.modalAction(b.dataset.m, b.dataset, b); return; }
        if (e.target.classList.contains('modal-wrap') && !e.target.dataset.lock) this.closeModal();
      });
    }

    // ============================================================ Menu e demonstração
    showMenu() {
      $('#hud').hidden = true;
      $('#menu').hidden = false;
      $('#menu-main').hidden = false;
      $('#setup').hidden = true;
      this.game = null;
      this.closeAllModals();
      const saved = load(SAVE_KEY);
      $('#m-continue').hidden = !(saved && saved.game && !saved.game.over);
      this.startDemo();
    }

    startDemo() {
      const tribes = PP.TRIBE_IDS.slice();
      const rng = new PP.RNG((Math.random() * 1e9) | 0);
      rng.shuffle(tribes);
      const g = new PP.Game().setup({ size: 16, mapType: rng.pick(['continentes', 'pangeia', 'lagos']), difficulty: 'dificil',
        players: tribes.slice(0, 4).map(t => ({ tribe: t })), seed: rng.int(1e9) + 1 });
      this.demo = g;
      this.r.setGame(g, -1);
      this.r.speed = 1.4; this.r.followAI = false;
      this.r.cam.z = PP.clamp(Math.max(this.r.w / (g.W * PP.TILE.TW * 0.9), this.r.h / (g.H * PP.TILE.TH * 1.6)), 0.3, 0.9);
      this.r.centerOn(g.W / 2, g.H / 2);
      g.players.forEach(p => p.explored.fill(1));
      let drift = 0;
      const tick = () => {
        if (this.demo !== g) return;
        if (!this.reduced) { drift += 0.004; this.r.cam.x += Math.cos(drift) * 0.18; this.r.cam.y += Math.sin(drift * 0.7) * 0.09; this.r.dirty = true; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      const run = async () => {
        while (this.demo === g && !g.over && g.turn < 80) {
          await PP.AI.takeTurn(g, { pause: () => this.demo === g ? this.r.waitIdle().then(() => sleep(90)) : new Promise(() => {}) });
          if (this.demo !== g) return;
          g.endTurn();
          g.players.forEach(p => p.explored.fill(1));
          await sleep(250);
        }
        if (this.demo === g) setTimeout(() => { if (this.demo === g) this.startDemo(); }, 2500);
      };
      run();
    }

    stopDemo() { this.demo = null; this.applySettings(); }

    showSetup() {
      $('#menu-main').hidden = true;
      const f = $('#setup');
      f.hidden = false;
      const saved = load(SET_KEY) || {};
      const prefTribe = saved.lastTribe && PP.TRIBES[saved.lastTribe] ? saved.lastTribe : 'tupina';
      const others = PP.TRIBE_IDS.filter(t => t !== prefTribe);
      new PP.RNG((Math.random() * 1e9) | 0).shuffle(others);
      this.setupState = {
        slots: [{ tribe: prefTribe, human: true }].concat(others.slice(0, 3).map(t => ({ tribe: t, human: false }))),
        size: saved.lastSize || 18, mapType: saved.lastMap && PP.MAP_TYPES[saved.lastMap] && !PP.MAP_TYPES[saved.lastMap].hidden ? saved.lastMap : 'continentes',
        difficulty: saved.lastDiff || 'normal', victory: saved.lastVictory || 'dominacao',
        scenario: saved.lastScenario && PP.SCENARIOS[saved.lastScenario] ? saved.lastScenario : 'normal',
        victories: Object.assign({ ciencia: true, economia: true, maravilhas: true, territorio: true, diplomacia: true }, saved.lastVictories || {}),
        events: saved.lastEvents !== false,
        realm: saved.lastRealm !== false,
      };
      this.renderSetup(false);
    }

    // keep: mantém a rolagem da tela (ao escolher uma opção); false ao abrir a tela, que começa do topo
    renderSetup(keep) {
      const f = $('#setup');
      if (keep !== false) { keepScroll(f, () => this.renderSetup(false)); return; }
      const s = this.setupState;
      const me = s.slots[0];
      const tribeCards = PP.TRIBE_IDS.map(id => {
        const t = PP.TRIBES[id];
        return `<button type="button" class="tribe-card ${me.tribe === id ? 'on' : ''}" style="--tribe:${t.color}" data-s="tribe" data-v="${id}">
          ${crest(t.color, tribeIcon(id), 'crest-m')}<span><span class="tn">${t.name}</span><span class="tp">${esc(t.perk)} ${t.extraTech ? PP.t('Começa com {a} e {b}.', { a: PP.TECH[t.startTech].name, b: PP.TECH[t.extraTech].name }) : PP.t('Começa com {a}.', { a: PP.TECH[t.startTech].name })}</span></span></button>`;
      }).join('');
      const slots = s.slots.map((sl, i) => {
        const t = PP.TRIBES[sl.tribe];
        const opts = PP.TRIBE_IDS.map(id => `<option value="${id}" ${id === sl.tribe ? 'selected' : ''}>${PP.TRIBES[id].name}</option>`).join('');
        return `<div class="slot">${crest(t.color, tribeIcon(sl.tribe), 'crest-s')}
          <select id="slot-tribe-${i}" data-slot="${i}" aria-label="${PP.t('Tribo do jogador {n}', { n: i + 1 })}">${opts}</select>
          <div class="seg">${i === 0 ? '<button type="button" class="on" disabled>' + PP.t('Você') + '</button>' :
            `<button type="button" class="${sl.human ? '' : 'on'}" data-s="ai" data-i="${i}">${PP.t('IA')}</button><button type="button" class="${sl.human ? 'on' : ''}" data-s="human" data-i="${i}">${PP.t('Humano')}</button>
             <button type="button" data-s="del" data-i="${i}" aria-label="${PP.t('Remover jogador')}">✕</button>`}</div></div>`;
      }).join('');
      const seg = (key, entries) => `<div class="seg">${entries.map(([v, l]) => `<button type="button" class="${String(s[key]) === String(v) ? 'on' : ''}" data-s="set" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
      f.innerHTML = `
        <div class="setup-h"><h2>${PP.t('Nova campanha')}</h2><button type="button" class="icon-btn" data-s="back" aria-label="${PP.t('Voltar')}">✕</button></div>
        <div class="setup-b">
          <div class="field"><span class="lbl">${PP.t('Sua tribo')}</span><div class="tribes">${tribeCards}</div></div>
          <div class="field"><span class="lbl">${PP.t('Tribos na partida ({n}) · humanos extras jogam no mesmo aparelho', { n: s.slots.length })}</span><div class="slots">${slots}</div>
            ${s.slots.length < 6 ? '<p><button type="button" class="chip-btn" data-s="add">' + PP.t('+ Adicionar tribo') + '</button></p>' : ''}</div>
          <div class="row2">
            <div class="field"><span class="lbl">${PP.t('Tamanho do mapa')}</span>${seg('size', Object.entries(PP.MAP_SIZES).map(([k, v]) => [k, v.split(' ')[0]]))}</div>
            <div class="field"><span class="lbl">${PP.t('Tipo de mapa')}${PP.SCENARIOS[s.scenario].configure && /mapType/.test(String(PP.SCENARIOS[s.scenario].configure)) ? ' · ' + PP.t('definido pelo cenário') : ''}</span>${seg('mapType', Object.entries(PP.MAP_TYPES).filter(([k, v]) => !v.hidden).map(([k, v]) => [k, v.name]))}</div>
            <div class="field"><span class="lbl">${PP.t('Dificuldade da IA')}</span>${seg('difficulty', Object.entries(PP.DIFFICULTY).map(([k, v]) => [k, v.name]))}</div>
            <div class="field"><span class="lbl">${PP.t('Vitória')}</span>${seg('victory', [['dominacao', PP.t('Dominação')], ['pontos30', PP.t('Pontos · {n} turnos', { n: 30 })], ['pontos50', PP.t('Pontos · {n} turnos', { n: 50 })]])}</div>
          </div>
          ${this.setupExtras(s)}
        </div>
        <div class="setup-f"><button type="button" class="btn ghost" data-s="back">${PP.t('Voltar')}</button><button type="submit" class="btn primary">${PP.t('Começar')}</button></div>`;
      f.onclick = e => {
        const b = e.target.closest('[data-s]');
        if (!b) return;
        const a = b.dataset.s;
        if (a === 'tribe') this.setSlotTribe(0, b.dataset.v);
        else if (a === 'ai' || a === 'human') s.slots[+b.dataset.i].human = a === 'human';
        else if (a === 'del') s.slots.splice(+b.dataset.i, 1);
        else if (a === 'add') { const free = PP.TRIBE_IDS.find(t => !s.slots.some(x => x.tribe === t)); if (free) s.slots.push({ tribe: free, human: false }); }
        else if (a === 'set') s[b.dataset.k] = b.dataset.k === 'size' ? +b.dataset.v : b.dataset.v;
        else if (a === 'vic') s.victories[b.dataset.k] = !s.victories[b.dataset.k];
        else if (a === 'events') s.events = !s.events;
        else if (a === 'realm') s.realm = !s.realm;
        else if (a === 'scenario') s.scenario = b.dataset.v;
        else if (a === 'back') { f.hidden = true; $('#menu-main').hidden = false; return; }
        if (s.slots.length < 2) s.slots.push({ tribe: PP.TRIBE_IDS.find(t => !s.slots.some(x => x.tribe === t)), human: false });
        this.renderSetup();
      };
      f.onchange = e => { if (e.target.dataset.slot != null) { this.setSlotTribe(+e.target.dataset.slot, e.target.value); this.renderSetup(); } };
      f.onsubmit = e => { e.preventDefault(); this.startFromSetup(); };
    }

    setSlotTribe(i, tribe) {
      const s = this.setupState;
      const j = s.slots.findIndex(x => x.tribe === tribe);
      if (j >= 0 && j !== i) s.slots[j].tribe = s.slots[i].tribe;
      s.slots[i].tribe = tribe;
    }

    startFromSetup() {
      const s = this.setupState;
      const victory = s.victory.startsWith('pontos') ? 'pontos' : 'dominacao';
      const turnLimit = s.victory === 'pontos50' ? 50 : 30;
      const players = s.slots.map(x => ({ tribe: x.tribe, human: x.human || x === s.slots[0] }));
      const chk = PP.scenarioCheck(s.scenario, players);
      if (!chk.ok) { this.toast(`${PP.SCENARIOS[s.scenario].name}: ${chk.reason}.`, 'bad'); return; }
      Object.assign(this.settings, { lastTribe: s.slots[0].tribe, lastSize: s.size, lastMap: s.mapType, lastDiff: s.difficulty, lastVictory: s.victory,
        lastScenario: s.scenario, lastVictories: s.victories, lastEvents: s.events, lastRealm: s.realm });
      this.applySettings();
      const victories = Object.assign({ dominacao: true, pontos: victory === 'pontos' }, s.victories);
      const g = new PP.Game().setup({ size: s.size, mapType: s.mapType, difficulty: s.difficulty, victory, turnLimit, victories, events: s.events, realm: s.realm, scenario: s.scenario, players });
      this.attach(g, true);
    }

    continueSaved() {
      const saved = load(SAVE_KEY);
      if (!saved || !saved.game) { this.toast(PP.t('Não há partida salva neste aparelho.'), 'bad'); return; }
      try { this.attach(PP.Game.fromJSON(saved.game), false); }
      catch (e) { console.error(e); this.toast(PP.t('Não foi possível carregar a partida salva.'), 'bad'); }
    }

    attach(g, fresh) {
      this.stopDemo();
      this.game = g;
      this.sel = null;
      this.fastForward = false;
      g.on((t, d) => this.onGameEvent(t, d));
      const humans = g.players.filter(p => p.human);
      this.hotseat = humans.length > 1;
      const cur = g.currentPlayer;
      this.viewer = cur.human ? cur.id : (humans[0] ? humans[0].id : 0);
      this.r.setGame(g, this.viewer);
      this.r.fitZoom();
      const cap = g.cityMap[g.players[this.viewer].capital] || g.citiesOf(this.viewer)[0];
      if (cap) this.r.centerOn(cap.x, cap.y); else this.r.centerOn(g.W / 2, g.H / 2);
      $('#menu').hidden = true;
      $('#hud').hidden = false;
      this.renderHud();
      this.hidePanel();
      if (g.over) { this.showGameOver(); return; }
      if (!cur.human) { this.runAI(); return; }
      this.beginHumanTurn(fresh);
    }

    // ============================================================ Fluxo de turnos
    myTurn() { return !!(this.game && !this.game.over && !this.busy && this.game.current === this.viewer && this.game.currentPlayer.human); }
    me() { return this.game.players[this.viewer]; }

    async beginHumanTurn(fresh) {
      const g = this.game, p = g.currentPlayer;
      this.busy = true;
      if (this.hotseat && (this.viewer !== p.id || fresh)) {
        this.r.viewer = -9; this.r.dirty = true;
        await this.passScreen(p);
      }
      this.viewer = p.id;
      this.r.viewer = p.id;
      this.r.dirty = true;
      this.busy = false;
      this.fastForward = false;
      this.save();
      this.renderHud();
      const cap = g.cityMap[p.capital];
      if (fresh || this.hotseat) { const c = cap || g.citiesOf(p.id)[0]; if (c) this.r.centerOn(c.x, c.y, !fresh); }
      if (g.turn > 1) {
        const inc = g.income(p);
        this.toast(`${PP.t('Turno {n}', { n: g.turn })} · +${inc.stars}★ · +${inc.sci}${SCI}`, 'gold');
      }
      if (fresh && !this.settings.seenHelp) { this.settings.seenHelp = true; this.applySettings(); this.openQuickStart(); }
      if (fresh && g.opts.scenario && g.opts.scenario !== 'normal') this.toast(PP.t('Cenário: {x}', { x: PP.SCENARIOS[g.opts.scenario].name }), 'gold');
      this.announceEvents();
      await this.showProposals();
      if (p.pendingRuin) this.openRuinChoice();
      this.checkRewards();
    }

    async endTurn() {
      if (!this.myTurn()) return;
      if (this.me().pendingRewards.length) { this.checkRewards(); return; }
      if (this.me().pendingRuin) { this.openRuinChoice(); return; }
      this.deselect();
      this.busy = true;
      this.game.endTurn();
      this.save();
      await this.runAI();
    }

    async runAI() {
      const g = this.game;
      this.busy = true;
      this.renderHud();
      if (this.hotseat) { this.r.viewer = -9; this.r.dirty = true; }
      let tick = 0;
      while (!g.over && !g.currentPlayer.human && this.game === g) {
        const p = g.currentPlayer;
        $('#ai-banner').hidden = false;
        $('#ai-banner-text').innerHTML = `${crest(p.color, tribeIcon(p.tribe), 'crest-xs')} ${PP.t('Vez de {x}', { x: esc(p.name) })}`;
        $('#btn-skip').disabled = !!this.fastForward;
        const pause = async () => {
          if (this.game !== g) return new Promise(() => {});
          if (this.fastForward || this.r.speed <= 0) { if (++tick % 12 === 0) await sleep(0); return; }
          if (this.r.busy()) { await this.r.waitIdle(); await sleep(45 / this.r.speed); }
          else if (++tick % 10 === 0) await sleep(0);
        };
        const saved = this.r.speed;
        if (this.fastForward) this.r.speed = 0;
        await PP.AI.takeTurn(g, { pause });
        this.r.speed = saved;
        if (this.game !== g) return;
        await this.r.waitIdle();
        if (g.over) break;
        g.endTurn();
        this.renderHud();
      }
      $('#ai-banner').hidden = true;
      if (this.game !== g) return;
      if (g.over) { this.busy = false; this.renderHud(); this.showGameOver(); this.save(); return; }
      await this.beginHumanTurn(false);
    }

    save() {
      if (!this.game) return;
      store(SAVE_KEY, { game: this.game.toJSON(), at: Date.now() });
    }

    passScreen(p) {
      return new Promise(res => {
        const t = PP.TRIBES[p.tribe];
        const d = document.createElement('div');
        d.className = 'pass';
        d.innerHTML = `${crest(t.color, tribeIcon(p.tribe), 'crest-xl')}<h2>${PP.t('Vez de {x}', { x: esc(p.name) })}</h2><p class="note">${PP.t('Passe o aparelho. Turno {n}.', { n: this.game.turn })}</p><button type="button" class="btn primary">${PP.t('Estou pronto')}</button>`;
        d.querySelector('button').onclick = () => { d.remove(); res(); };
        document.body.appendChild(d);
      });
    }

    async showProposals() {
      const g = this.game, p = this.me();
      let guard = 0;
      while (p.proposals.length && !g.over && guard++ < 20) {
        const pr = p.proposals[0];
        const from = g.players[pr.from];
        const info = this.proposalInfo(pr);
        const ok = await this.ask(info.title,
          `<div class="ask-head">${crest(from.color, tribeIcon(from.tribe), 'crest-l')}<div><p>${info.body}</p>${this.opinionLine(p.id, pr.from)}</div></div>`,
          info.yes, info.no);
        const key = pr.id != null ? pr.id : pr.from;
        g.respondProposal(p, key, ok);
        this.toast(ok ? info.okText : info.noText, ok ? 'good' : '');
        this.renderHud();
      }
    }

    // ============================================================ Eventos do jogo → avisos
    onGameEvent(type, d) {
      const g = this.game;
      if (!g) return;
      const v = this.viewer;
      switch (type) {
        case 'tech':
          if (d.player === v && g.current === v) this.toast(d.tech === 'future' ? PP.t('Tecnologia do Futuro {n} concluída.', { n: this.me().future }) : PP.t('Nova tecnologia: {x}', { x: PP.TECH[d.tech].name }), 'good');
          break;
        case 'capture':
          if (d.from === v) this.toast(PP.t('Perdemos {c} para {p}!', { c: d.city.name, p: g.players[d.unit.owner].name }), 'bad');
          else if (d.unit.owner === v) this.toast(d.from >= 0 ? PP.t('Conquistamos {c}.', { c: d.city.name }) : PP.t('Fundamos {c}.', { c: d.city.name }), 'good');
          break;
        case 'meet':
          if (d.a === v || d.b === v) { const o = g.players[d.a === v ? d.b : d.a]; this.toast(PP.t('Contato com a tribo {x}.', { x: o.name }), 'gold'); }
          break;
        case 'diplomacy':
          if (d.a === v || d.b === v) {
            const o = g.players[d.a === v ? d.b : d.a];
            const msg = {
              peace: [PP.t('Paz com {x}.', { x: o.name }), 'good'], nap: [PP.t('Pacto de não agressão com {x}.', { x: o.name }), 'good'], alliance: [PP.t('Aliança com {x}!', { x: o.name }), 'gold'],
              left: [d.a === v ? PP.t('Você encerrou a aliança com {x}.', { x: o.name }) : PP.t('{x} encerrou a aliança com você.', { x: o.name }), 'bad'],
              trade: [PP.t('Acordo comercial com {x}.', { x: o.name }), 'good'],
              tribute: [d.a === v ? PP.t('Você pagou {n}★ de tributo a {x}.', { n: d.amount, x: o.name }) : PP.t('{x} pagou {n}★ de tributo.', { n: d.amount, x: o.name }), d.a === v ? '' : 'gold'],
              nap_end: [PP.t('O pacto com {x} terminou e foi cumprido.', { x: o.name }), 'good'],
              rejected: [d.b === v ? PP.t('{x} recusou: {w}.', { x: o.name, w: (PP.PROPOSAL_TYPES[d.what] || '').toLowerCase() }) : '', 'bad'],
              tribute_refused: [d.b === v ? PP.t('{x} se recusou a pagar tributo.', { x: o.name }) : '', 'bad'],
            }[d.type];
            if (d.type === 'war') {
              const tag = d.kind === 'betrayed_ally' ? ' (' + PP.t('aliança traída') + ')' : d.kind === 'broke_treaty' ? ' (' + PP.t('pacto rompido') + ')' : '';
              const theirs = d.kind === 'betrayed_ally' ? PP.t('{x} traiu a aliança e declarou guerra a você!', { x: o.name })
                : d.kind === 'broke_treaty' ? PP.t('{x} rompeu o pacto e declarou guerra a você!', { x: o.name }) : PP.t('{x} declarou guerra a você!', { x: o.name });
              this.toast(d.a === v ? PP.t('Você declarou guerra a {x}{tag}.', { x: o.name, tag }) : theirs, 'bad');
            } else if (msg && msg[0]) this.toast(msg[0], msg[1]);
          }
          break;
        case 'proposal':
          if (d.to === v) $('#diplo-dot').hidden = false;
          break;
        case 'wonder':
          if (d.player !== v && this.me().met[d.player]) this.toast(PP.t('{p} ergueu {w}.', { p: g.players[d.player].name, w: PP.WONDERS[d.wonder].name }), '');
          else if (d.player === v) this.toast(PP.t('Maravilha concluída: {w}.', { w: PP.WONDERS[d.wonder].name }), 'good');
          break;
        case 'eliminated':
          if (d.player === v) this.toast(PP.t('Sua tribo foi eliminada.'), 'bad');
          else if (this.me().met[d.player]) this.toast(PP.t('A tribo {x} foi eliminada.', { x: g.players[d.player].name }), 'gold');
          break;
        case 'ruin':
          if (d.player === v) this.toast(PP.t('Ruínas: {x}', { x: d.text.charAt(0).toUpperCase() + d.text.slice(1) }), 'gold');
          break;
        case 'connected':
          if (d.city.owner === v) this.toast(PP.t('{c} está conectada à capital (+1 de população nas duas).', { c: d.city.name }), 'good');
          break;
        case 'veteran':
          if (d.unit.owner === v) this.toast(PP.t('{u} virou {r}. Escolha uma promoção.', { u: UN[d.unit.type].name, r: g.rank(d.unit) === 2 ? PP.t('Elite') : PP.t('Veterano') }), 'gold');
          break;
        default:
          if (this.onGameEventExt) this.onGameEventExt(type, d);
      }
    }

    // ============================================================ HUD
    renderHud() {
      const g = this.game;
      if (!g) return;
      const p = this.me();
      const chip = $('#tb-tribe');
      chip.innerHTML = `${crest(p.color, tribeIcon(p.tribe), 'crest-s')}<span class="nm">${esc(p.name)}</span>`;
      const inc = g.income(p);
      $('#tb-stars').textContent = p.stars;
      $('#tb-stars-inc').textContent = '+' + inc.stars;
      $('#tb-sci').textContent = p.science;
      $('#tb-sci-inc').textContent = '+' + inc.sci;
      $('#tb-turn').textContent = g.opts.victory === 'pontos' ? `${Math.min(g.turn, g.opts.turnLimit)}/${g.opts.turnLimit}` : g.turn;
      const my = this.myTurn();
      $('#btn-end').disabled = !my;
      $('#btn-next').disabled = !my;
      const idle = my && g.unitsOf(p.id).every(u => !this.unitCanAct(u));
      $('#btn-end').classList.toggle('pulse', idle);
      $('#diplo-dot').hidden = !p.proposals.length;
      this.renderEventChip();
    }

    unitCanAct(u) {
      const g = this.game;
      if (u.fortified && !g.attackTargets(u).length) return false;
      if (u.cargo && u.cargo.some(x => g.unloadTargets(u, x).length)) return true;
      return (u.mp > 0 && g.reachable(u).size > 0) || g.attackTargets(u).length > 0 || g.canCapture(u);
    }

    toast(text, kind) {
      const box = $('#toasts');
      const d = document.createElement('div');
      d.className = 'toast ' + (kind || '');
      d.textContent = text;
      box.appendChild(d);
      while (box.children.length > 4) box.firstChild.remove();
      setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 350); }, 3200);
    }

    // ============================================================ Seleção
    visibleUnitAt(t) {
      const u = this.game.unitAt(t.x, t.y);
      if (!u) return null;
      if (u.owner === this.viewer || this.r.unitShown(u)) return u;
      return null;
    }

    handleTap(t) {
      const g = this.game;
      if (!g || this.modals.length) return;
      const s = this.sel;
      if (this.myTurn() && s && s.unload) {
        const tr = g.units.find(x => x.id === s.unload.transport);
        if (tr && s.unload.tiles.some(n => n === t)) {
          if (g.unload(tr, s.unload.unit, t.x, t.y)) { this.sel = { tile: t, mode: 'unit' }; this.afterAction(); return; }
        }
        s.unload = null;
      }
      if (this.myTurn() && s && s.mode === 'unit') {
        const u = this.visibleUnitAt(s.tile);
        if (u && u.owner === this.viewer) {
          const target = this.visibleUnitAt(t);
          if (target && this.r.hl.attack && this.r.hl.attack.indexOf(target) >= 0) { this.doAttack(u, target); return; }
          if (target && this.r.hl.convert && this.r.hl.convert.indexOf(target) >= 0) { this.doConvert(u, target); return; }
          if (s.reach && s.reach.has(t.y * g.W + t.x)) { this.doMove(u, t); return; }
        }
      }
      if (s && s.tile === t) {
        if (s.mode === 'unit') this.select(t, 'tile'); else this.deselect();
        return;
      }
      this.select(t, this.visibleUnitAt(t) ? 'unit' : 'tile');
    }

    select(t, mode) {
      const prev = this.sel;
      this.sel = { tile: t, mode };
      this.confirmDisband = null;
      // objeto novo: centraliza na área livre; mesma casa (unidade ↔ casa): só se ficou escondida
      this.refreshSelection(!prev || prev.tile !== t ? 'center' : 'reveal');
    }

    // Partes do mapa que o HUD não cobre: acima do painel (celular) ou ao lado dele (computador, onde o painel
    // fica no canto inferior esquerdo). Coordenadas da tela do mapa.
    freeAreas() {
      const r = this.r, cv = this.canvas.getBoundingClientRect();
      const box = sel => {
        const e = $(sel);
        if (!e || e.hidden) return null;
        const b = e.getBoundingClientRect();
        return b.width > 0 && b.height > 0 ? { left: b.left - cv.left, right: b.right - cv.left, top: b.top - cv.top, bottom: b.bottom - cv.top } : null;
      };
      const bar = box('#topbar'), side = box('#sidebar'), panel = box('#panel'), row = box('#bottom-row');
      const top = bar ? Math.max(0, bar.bottom) : 0;
      const dock = side && side.right - side.left > side.bottom - side.top; // abas no rodapé (celular)
      const left = side && !dock ? side.right : 0;
      let floor = r.h;
      if (dock) floor = Math.min(floor, side.top);
      if (row) floor = Math.min(floor, row.top);
      const areas = [{ left, right: r.w, top, bottom: panel ? Math.min(floor, panel.top) : floor }];
      if (panel) areas.push({ left: Math.max(left, panel.right), right: r.w, top, bottom: row && row.left >= panel.right ? row.top : floor });
      const size = a => Math.max(0, a.right - a.left) * Math.max(0, a.bottom - a.top);
      const ok = areas.filter(a => a.right - a.left >= 120 && a.bottom - a.top >= 100).sort((a, b) => size(b) - size(a));
      return ok.length ? ok : [{ left: 0, right: r.w, top: 0, bottom: r.h }];
    }

    // Mantém o objeto selecionado à vista. 'center': centraliza na maior área livre se ele não estiver perto do
    // centro dela; 'reveal': só move a câmera se o painel ou as barras estiverem cobrindo o objeto.
    focusSelection(how) {
      const s = this.sel, r = this.r;
      if (!how || !s || !this.game || this.demo) return;
      const t = s.tile, z = r.cam.z;
      const p = r.tileScreen(t.x, t.y);
      const lift = 18 * z; // o escudo da unidade e as construções ficam acima do centro da casa
      const o = { x: p.x, y: p.y - lift, hw: 34 * z, top: 52 * z, bottom: 22 * z };
      const areas = this.freeAreas();
      const inside = a => o.x - o.hw >= a.left + 4 && o.x + o.hw <= a.right - 4 && o.y - o.top >= a.top + 4 && o.y + o.bottom <= a.bottom - 4;
      const a = areas[0];
      const cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
      if (how === 'reveal' && areas.some(inside)) return;
      if (how === 'center' && inside(a) && Math.abs(o.x - cx) <= (a.right - a.left) / 4 && Math.abs(o.y - cy) <= (a.bottom - a.top) / 4) return;
      r.placeAt(t.x, t.y, cx, cy + lift, !this.reduced);
    }

    deselect() {
      this.sel = null;
      this.r.clearHighlights();
      this.hidePanel();
    }

    refreshSelection(focus) {
      const g = this.game, r = this.r;
      r.clearHighlights();
      const s = this.sel;
      if (!s || !g) { this.hidePanel(); return; }
      if (s.mode === 'unit' && !this.visibleUnitAt(s.tile)) s.mode = 'tile';
      r.hl.selected = s.tile;
      s.reach = null;
      if (s.mode === 'unit') {
        const u = this.visibleUnitAt(s.tile);
        if (u.owner === this.viewer && this.myTurn()) {
          if (s.unload) {
            r.hl.reach = new Set(s.unload.tiles.map(t => t.y * g.W + t.x));
          } else {
            s.reach = g.reachable(u);
            r.hl.reach = new Set(s.reach.keys());
            r.hl.attack = g.attackTargets(u);
            r.hl.convert = g.convertTargets(u);
          }
        }
      }
      r.dirty = true;
      this.renderPanel();
      this.focusSelection(focus);
    }

    nextUnit() {
      if (!this.myTurn()) return;
      const g = this.game;
      const list = g.unitsOf(this.viewer).filter(u => this.unitCanAct(u));
      if (!list.length) { this.toast(PP.t('Todas as unidades já agiram.'), ''); return; }
      const curId = this.sel && this.sel.mode === 'unit' ? (this.visibleUnitAt(this.sel.tile) || {}).id : null;
      const i = list.findIndex(u => u.id === curId);
      const u = list[(i + 1) % list.length];
      this.select(g.tileAt(u), 'unit');
      this.focusSelection('center');
    }

    afterAction() {
      if (!this.game) return;
      this.renderHud();
      // depois de mover ou agir, a seleção segue a unidade; a câmera só anda se o painel passar a cobri-la
      if (this.sel) this.refreshSelection('reveal');
      this.checkRewards();
      if (this.game.over) { this.busy = true; this.r.waitIdle().then(() => { this.busy = false; this.renderHud(); this.showGameOver(); }); }
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.save(), 800);
    }

    doMove(u, t) {
      const g = this.game;
      if (!g.moveUnit(u, t.x, t.y, this.sel.reach)) return;
      this.sel = u.dead ? null : { tile: g.tileAt(u), mode: 'unit' };
      this.afterAction();
      if (!this.sel) this.hidePanel();
    }

    doAttack(u, target) {
      const g = this.game;
      const ev = g.attack(u, target);
      if (!ev) return;
      this.sel = u.dead ? null : { tile: g.tileAt(u), mode: 'unit' };
      if (!this.sel) this.deselect();
      this.afterAction();
    }

    doConvert(u, target) {
      if (this.game.convert(u, target)) this.afterAction();
    }

    checkRewards() {
      const g = this.game;
      if (!g || g.over || this.modals.some(m => m.kind === 'reward')) return;
      const p = this.me();
      if (!this.myTurn() || !p.pendingRewards.length) return;
      const pr = p.pendingRewards[0];
      const c = g.cityMap[pr.cityId];
      const cards = pr.options.map(o => {
        const r = PP.REWARDS[o];
        return `<button type="button" class="card big" data-m="reward" data-v="${o}">${ico(rewardIcon(o), 'ci')}<span class="cn">${r.name}</span><span class="cd">${r.desc}</span></button>`;
      }).join('');
      this.openModal('reward', `<div class="modal-h"><div><h2>${esc(c.name)}</h2><div class="sub">${PP.t('A cidade chegou ao nível {n}. Escolha uma recompensa.', { n: PP.roman(pr.level) })}</div></div></div>
        <div class="modal-b"><div class="grid">${cards}</div></div>`, { narrow: true, lock: true });
    }

    // ============================================================ Painel inferior
    hidePanel() { $('#panel').hidden = true; }

    renderPanel() {
      const g = this.game, s = this.sel;
      const panel = $('#panel');
      if (!s) { panel.hidden = true; return; }
      const t = s.tile;
      const idx = t.y * g.W + t.x;
      const p = this.me();
      let html;
      if (!p.explored[idx]) html = this.head(ico('ui_fog'), PP.t('Terras desconhecidas'), PP.t('Mova unidades para perto para revelar.'), null);
      else if (s.mode === 'unit') html = this.unitPanel(this.visibleUnitAt(t));
      else html = this.tilePanel(t);
      const same = this.panelFor === idx + ':' + s.mode && !panel.hidden;
      this.panelFor = idx + ':' + s.mode;
      if (same) keepScroll(panel, () => { panel.innerHTML = html; });
      else { panel.innerHTML = html; panel.scrollTop = 0; }
      panel.hidden = false;
    }

    head(iconHtml, title, sub, color) {
      const badge = color ? iconHtml : `<div class="ph-ico">${iconHtml}</div>`;
      return `<div class="ph">${badge}
        <div class="ph-txt"><div class="ph-title">${title}</div><div class="ph-sub">${sub}</div></div>
        <button type="button" class="ph-x" data-a="close" aria-label="${PP.t('Fechar')}">✕</button></div>`;
    }

    act(a, iconKey, name, cost, opts) {
      opts = opts || {};
      const cls = ['act'];
      if (opts.hot) cls.push('hot');
      if (opts.off) cls.push('off');
      if (opts.locked) cls.push('locked');
      if (opts.confirm) cls.push('confirm');
      const data = Object.entries(opts.data || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
      return `<button type="button" class="${cls.join(' ')}" data-a="${a}" ${data} ${opts.title ? `title="${esc(opts.title)}"` : ''}>
        ${ico(iconKey, 'ai')}<span class="an">${name}</span>${cost != null ? `<span class="ac">${cost}</span>` : ''}${opts.reason ? `<span class="ar">${esc(opts.reason)}</span>` : ''}</button>`;
    }

    stat(key, text, extra) { return `<span class="st">${ico(key)}${text}${extra ? ` <em>${extra}</em>` : ''}</span>`; }

    unitPanel(u) {
      const g = this.game;
      const st = g.stat(u);
      const owner = g.players[u.owner];
      const rank = g.rank(u);
      const rankTag = rank === 2 ? `<span class="tag gold">${PP.t('Elite')}</span>` : rank === 1 ? `<span class="tag gold">${PP.t('Veterano')}</span>` : '';
      const title = `${st.name}${u.name ? ' ' + esc(u.name) : ''} ${rankTag}`;
      const sub = `${esc(owner.name)}${st.naval && !UN[u.type].naval ? ' · ' + PP.t('{u} embarcado', { u: UN[u.type].name }) : ''}${u.cargo ? ' · ' + PP.t('{n}/{m} a bordo', { n: u.cargo.length, m: UN[u.type].cargo }) : ''} · ${TER[g.tileAt(u).terrain].name}`;
      const bonus = g.defenseBonus(u);
      let html = this.head(crest(owner.color, unitIcon(g, u), 'crest-l'), title, sub, owner.color);
      const next = PP.XP_LEVELS.find(x => x > u.xp);
      html += `<div class="stats">
        ${this.stat('s_hp', `${u.hp}/${st.maxHp}`)}${this.stat('s_atk', fmt(st.atk))}
        ${this.stat('s_def', fmt(st.def), bonus !== 1 ? '×' + fmt(bonus) : '')}
        ${this.stat('s_move', (u.owner === this.viewer ? fmt(u.mp) + '/' : '') + st.move)}${this.stat('s_range', st.range)}
        ${this.stat(rank === 2 ? 's_xp2' : 's_xp', `XP ${u.xp}${next ? '/' + next : ''}`)}
        ${u.fortified ? this.stat('ui_fortify', PP.t('Fortificado')) : ''}</div>`;
      const skills = Object.keys(st.skills).map(k => PP.SKILL_NAMES[k]).filter(Boolean);
      const promos = u.promos.map(k => PP.PROMOTIONS[k].name);
      if (skills.length || promos.length) html += `<p class="note">${skills.join(' · ')}${promos.length ? '<br>' + PP.t('Promoções: {x}', { x: promos.join(', ') }) : ''}</p>`;
      if (UN[u.type].mounted && !st.naval) html += `<p class="note">${PP.t('Montado: não entra em montanhas; Piqueiros são fortes contra ele.')}</p>`;
      html += this.unitStatus(u);

      if (u.owner === this.viewer && this.myTurn()) {
        const acts = [];
        if (g.canCapture(u)) {
          const t = g.tileAt(u);
          acts.push(this.act('capture', 'ui_capture', t.village ? PP.t('Capturar aldeia') : PP.t('Conquistar cidade'), null, { hot: true }));
        }
        if (u.pendingPromo) acts.push(this.act('promote', 'ui_promote', PP.t('Promover'), null, { hot: true }));
        if (g.canHealOthers(u)) acts.push(this.act('healOthers', 'ui_heal', PP.t('Curar aliados'), null));
        if (g.canRecover(u)) acts.push(this.act('recover', 'ui_recover', PP.t('Recuperar'), null, { title: PP.t('Cura e encerra o turno da unidade') }));
        if (g.canFortify(u)) acts.push(this.act('fortify', 'ui_fortify', PP.t('Fortificar'), null, { title: PP.t('+25% de defesa até mover') }));
        for (const id of g.abilitiesOf(u)) {
          const ab = PP.ABILITIES[id], chk = g.abilityCheck(u, id);
          acts.push(this.act('ability', ab.icon, ab.name, `${ab.cd}t`, { off: !chk.ok, reason: chk.ok ? '' : chk.reason, data: { id }, title: ab.desc, hot: chk.ok && !!ab.before && !u.moved }));
        }
        const pc = g.pillageCheck(u);
        if (pc.visible) acts.push(this.act('pillage', 'a_pillage', { fort: PP.t('Destruir fortificação'), imp: PP.t('Saquear melhoria'), road: PP.t('Cortar estrada') }[pc.what], null, { off: !pc.ok, reason: pc.ok ? '' : pc.reason, title: PP.t('Rende estrelas e corta a produção ou as rotas do inimigo') }));
        const t = g.tileAt(u);
        if (t.city || t.owner === this.viewer) acts.push(this.act('tileview', 'ui_view', t.city ? PP.t('Ver cidade') : PP.t('Ver casa'), null));
        acts.push(this.act('disband', 'ui_disband', this.confirmDisband === u.id ? PP.t('Confirmar') : PP.t('Dissolver'), null, { confirm: this.confirmDisband === u.id }));
        html += `<div class="sec-lbl">${PP.t('Ordens')}</div><div class="acts">${acts.join('')}</div>`;
        html += this.unitExtraSections(u);
        const targets = g.attackTargets(u);
        const conv = g.convertTargets(u);
        if (targets.length || conv.length) {
          html += `<div class="sec-lbl">${PP.t('Alvos · toque no mapa ou aqui')}</div><div class="targets">`;
          for (const d of targets) {
            const r = g.previewAttack(u, d);
            const ds = g.stat(d);
            html += `<button type="button" class="target" data-a="attack" data-id="${d.id}">${crest(g.players[d.owner].color, unitIcon(g, d), 'crest-s')}
              <span class="tn">${ds.name} · ${esc(g.players[d.owner].name)} <small>(${PP.t('{n} de vida', { n: d.hp })})</small></span>
              <span class="tp">${PP.t('causa {d}', { d: `<span class="dmg">${r.dmg}</span>` })}${r.kill ? ' · ' + PP.t('abate') : ''} · ${PP.t('recebe {r}', { r: `<span class="ret">${r.ret}</span>` })}${r.retKill ? ' · ' + PP.t('morre') : ''}${r.notes && r.notes.length ? `<br><small>${esc(r.notes.join(' · '))}</small>` : ''}</span></button>`;
          }
          for (const d of conv) html += `<button type="button" class="target" data-a="convert" data-id="${d.id}">${crest(g.players[d.owner].color, unitIcon(g, d), 'crest-s')}<span class="tn">${PP.t('Converter {u}', { u: g.stat(d).name })}</span><span class="tp">${PP.t('passa para o seu lado')}</span></button>`;
          html += '</div>';
        }
        if (u.mp > 0 && this.sel && this.sel.reach && this.sel.reach.size) html += `<p class="note">${PP.t('Toque numa casa marcada para mover.')}</p>`;
        else if (!targets.length && !g.canCapture(u) && u.mp <= 0) html += `<p class="note">${PP.t('Esta unidade já agiu neste turno.')}</p>`;
      } else if (u.owner !== this.viewer) {
        html += `<p class="note">${this.relTag(u.owner)}</p>`;
      }
      return html;
    }

    tilePanel(t) {
      const g = this.game, p = this.me();
      const ter = TER[t.terrain];
      const owner = t.owner >= 0 ? g.players[t.owner] : null;
      let html = '';
      if (t.city) {
        const c = g.cityMap[t.city];
        const co = g.players[c.owner];
        const mine = c.owner === this.viewer;
        html += this.head(crest(co.color, c.capital ? 'ui_capital' : 'ui_city', 'crest-l'), `${esc(c.name)} <span class="tag">${PP.t('Nível {n}', { n: PP.roman(c.level) })}</span>${c.spec ? ` <span class="tag gold">${PP.SPECS[c.spec].name}</span>` : ''}${c.metropolis ? ` <span class="tag gold">${PP.t('Metrópole')}</span>` : ''}`, `${esc(co.name)}${c.capital ? ' · ' + PP.t('Capital') : ''} · ${ter.name}`, co.color);
        const status = g.cityStatus(c);
        if (status) html += `<p class="note"><span class="tag ${status.tag}">${status.name}</span>${mine ? ' ' + PP.t('Lealdade {n}/100.', { n: c.loyalty }) : ''}</p>`;
        if (mine && this.realmCityNote) html += this.realmCityNote(c);
        const need = c.level + 1;
        html += `<div class="popbar" aria-label="${PP.t('População')}">${Array.from({ length: need }, (_, k) => `<i class="${k < c.pop ? 'on' : ''}"></i>`).join('')}</div>`;
        if (mine) {
          const inc = g.cityIncome(c);
          html += `<div class="stats"><span class="st gold">★ +${inc.stars}</span><span class="st sci">${SCI} +${inc.sci}</span>
            ${this.stat('s_pop', PP.t('{a}/{b} p/ nível {n}', { a: c.pop, b: need, n: PP.roman(c.level + 1) }))}${this.stat('s_atk', PP.t('{a}/{b} unidades', { a: g.cityUnits(c).length, b: g.capacity(c) }))}
            ${c.buildings.walls ? this.stat('b_walls', PP.t('Muralhas')) : ''}${c.connected ? this.stat('a_road', PP.t('Conectada')) : ''}
            ${this.stat('ui_loyalty', PP.t('Lealdade {n}', { n: c.loyalty }))}${g.routeSlots(c) ? this.stat('d_trade', PP.t('Rotas {a}/{b}', { a: g.routesOf(c).length, b: g.routeSlots(c) })) : ''}</div>`;
          if (this.myTurn()) {
            const acts = [];
            for (const type of PP.TRAINABLE) {
              const d = UN[type];
              const chk = g.trainCheck(p, c, type);
              if (chk.locked || chk.unique) continue;
              acts.push(this.act('train', 'u_' + type, d.name, chk.cost + '★', { off: !chk.ok, reason: chk.ok ? '' : chk.reason, data: { type, city: c.id } }));
            }
            html += `<div class="sec-lbl">${PP.t('Recrutar')}</div><div class="acts">${acts.join('')}</div>`;
            html += `<div class="acts" style="margin-top:4px">${this.act('city', 'ui_city', PP.t('Governar cidade'), null, { data: { city: c.id } })}</div>`;
          }
        } else {
          const rel = this.relTag(c.owner);
          html += `<p class="note">${rel} · ${c.buildings.walls ? PP.t('Muralhas (defesa ×3)') : PP.t('defesa ×1,5 na cidade')}. ${PP.t('Para conquistar, termine o turno com uma unidade sobre a cidade e use <b>Conquistar</b> no turno seguinte. Cidades conquistadas ficam ocupadas por {n} turnos antes de se integrar (ou resistir).', { n: PP.OCCUPATION_TURNS })}</p>`;
        }
        return html;
      }
      if (t.village) {
        html += this.head(ico('ui_village'), PP.t('Aldeia'), PP.t('Neutra') + ' · ' + ter.name, null);
        html += `<p class="note">${PP.t('Leve uma unidade até aqui. No turno seguinte, sem mover, use <b>Capturar aldeia</b> para fundar uma cidade.')}</p>`;
        return html;
      }
      const parts = [ter.name];
      if (t.res) parts.push(PP.RESOURCES[t.res].name);
      if (t.imp) parts.push(PP.IMPROVEMENTS[t.imp].name);
      if (t.road) parts.push(PP.t('Estrada'));
      if (t.fort) parts.push(PP.FORTS[t.fort.type].name);
      if (t.landmark) parts.push(PP.LANDMARKS[t.landmark].name);
      const ruinDef = t.ruin && t.ruinType ? PP.RUIN_TYPES[t.ruinType] : null;
      const iconKey = t.wonder ? 'w_' + t.wonder : t.fort ? PP.FORTS[t.fort.type].icon : t.imp ? impIcon(t.imp) : t.res ? 'r_' + t.res : t.ruin ? 'ui_ruins' : t.landmark ? PP.LANDMARKS[t.landmark].icon : 'g_' + t.terrain;
      const title = t.wonder ? PP.WONDERS[t.wonder].name : ruinDef ? ruinDef.name : t.ruin ? PP.t('Ruínas') : t.fort ? PP.FORTS[t.fort.type].name : t.landmark && !t.imp && !t.res ? PP.LANDMARKS[t.landmark].name : parts[parts.length > 1 ? 1 : 0];
      const sub = (owner ? PP.t('Território de {p}', { p: esc(owner.name) }) : PP.t('Sem dono')) + ' · ' + parts.join(' · ');
      html += this.head(ico(iconKey), title, sub, null);
      const info = [];
      if (ter.info) info.push(ter.info + '.');
      if (t.res && PP.RESOURCES[t.res].info) info.push(PP.RESOURCES[t.res].info + '.');
      if (ruinDef) {
        const choices = [PP.t('explorar'), PP.t('saquear')];
        if (ruinDef.restore) choices.push(PP.t('restaurar'));
        if (ruinDef.honor) choices.push(PP.t('honrar'));
        info.push(ruinDef.text + ' ' + PP.t('Leve uma unidade até aqui para decidir: {x}.', { x: choices.join(', ') }));
      } else if (t.ruin) info.push(PP.t('Mova uma unidade até aqui para explorar e ganhar uma recompensa.'));
      if (t.landmark) info.push(`<b>${PP.LANDMARKS[t.landmark].name}:</b> ${PP.LANDMARKS[t.landmark].desc}.`);
      if (t.fort) info.push(PP.t('<b>{f}</b> de {p}: {d}. Inimigos que entram aqui tomam a fortificação.', { f: PP.FORTS[t.fort.type].name, p: esc(g.players[t.fort.owner].name), d: PP.FORTS[t.fort.type].desc }));
      if (t.pillaged) info.push(PP.t('<b>Saqueada:</b> não produz nem fornece recursos até ser reparada.'));
      if (t.shrine != null && t.shrine >= 0) info.push(PP.t('Santuário restaurado por {p}: +1{sci} por turno.', { p: esc(g.players[t.shrine].name), sci: SCI }));
      if (t.imp === 'whalestation') info.push(PP.t('Rende +1★ por turno e conta como luxo (Baleias).'));
      if (t.wonder) info.push(PP.WONDERS[t.wonder].desc + '.');
      if (t.imp === 'market') info.push(PP.t('Rende +{n}★ por turno (soma das serrarias, moinhos e forjas vizinhas).', { n: g.marketValue(t) }));
      if (t.imp === 'gemmine' || t.imp === 'plantation') info.push(PP.t('Rende +2★ por turno e conta como luxo.'));
      if (t.imp === 'mine') info.push(PP.t('Fornece Ferro (Espadachim, Mosqueteiro, Canhão).'));
      if (t.imp === 'pasture') info.push(PP.t('Fornece Cavalos (Cavaleiro).'));
      if (info.length) html += `<p class="note">${info.map(x => /<b>/.test(x) ? x : esc(x)).join(' ')}</p>`;
      if (this.myTurn()) {
        const acts = g.tileActions(p, t).filter(a => !(a.def.road && a.locked)).map(a => this.act('tile', actionIcon(a.def), a.def.name, a.cost + '★', {
          off: !a.ok && !a.locked, locked: a.locked, reason: a.ok ? '' : a.reason, data: { id: a.id }, title: this.actionHint(a.def),
        }));
        const won = g.wonderActions(p, t).map(w => this.act('wonder', 'w_' + w.id, w.def.name, w.cost + '★', { off: !w.ok, reason: w.ok ? '' : w.reason, data: { id: w.id }, title: w.def.desc }));
        if (acts.length || won.length) html += `<div class="sec-lbl">${PP.t('Construir')}</div><div class="acts">${acts.concat(won).join('')}</div>`;
        else if (t.owner === this.viewer && !t.imp && !t.res) html += `<p class="note">${PP.t('Nada para construir aqui com suas tecnologias atuais.')}</p>`;
      }
      if (t.res && t.owner !== this.viewer) html += `<p class="note">${PP.t('Recursos só podem ser usados dentro do seu território.')}</p>`;
      return html;
    }

    actionHint(a) {
      const bits = [];
      if (a.pop) bits.push(PP.t('+{n} população', { n: a.pop }));
      if (a.adj) bits.push(PP.t('+{n} população por {x} vizinha', { n: a.per, x: PP.IMPROVEMENTS[a.adj].name }));
      if (a.gold) bits.push(`+${a.gold}★`);
      if (a.income) bits.push(PP.t('+{n}★ por turno', { n: a.income }));
      if (a.road) bits.push(PP.t('Movimento dobrado; conecta cidades e rotas comerciais'));
      if (a.fort) bits.push(PP.FORTS[a.fort].desc);
      if (a.repair) bits.push(PP.t('A melhoria volta a produzir'));
      return bits.join(' · ');
    }

    panelAction(a, d) {
      const g = this.game;
      if (a === 'close') { this.deselect(); return; }
      if (!this.myTurn() || !this.sel) return;
      const p = this.me();
      const u = this.sel.mode === 'unit' ? this.visibleUnitAt(this.sel.tile) : null;
      switch (a) {
        case 'capture': if (u && g.capture(u)) this.afterAction(); break;
        case 'recover': if (u && g.recover(u)) this.afterAction(); break;
        case 'fortify': if (u && g.fortify(u)) this.afterAction(); break;
        case 'healOthers': if (u && g.healOthers(u)) this.afterAction(); break;
        case 'promote': if (u) this.openPromote(u); break;
        case 'tileview': this.select(this.sel.tile, 'tile'); break;
        case 'disband':
          if (!u) break;
          if (this.confirmDisband === u.id) { g.disband(u); this.confirmDisband = null; this.deselect(); this.afterAction(); }
          else { this.confirmDisband = u.id; this.renderPanel(); }
          break;
        case 'attack': { const t = g.units.find(x => x.id === +d.id); if (u && t) this.doAttack(u, t); break; }
        case 'convert': { const t = g.units.find(x => x.id === +d.id); if (u && t) this.doConvert(u, t); break; }
        case 'train': {
          const c = g.cityMap[+d.city];
          const chk = g.trainCheck(p, c, d.type);
          if (!chk.ok) { this.toast(chk.reason, 'bad'); break; }
          const nu = g.train(p, c, d.type);
          if (nu) { this.sel = { tile: g.tileAt(nu), mode: 'tile' }; this.afterAction(); }
          break;
        }
        case 'city': this.openCity(g.cityMap[+d.city]); break;
        case 'ability': if (u && g.useAbility(u, d.id)) this.afterAction(); else if (u) this.toast(g.abilityCheck(u, d.id).reason || PP.t('Indisponível'), 'bad'); break;
        case 'pillage': if (u && g.pillage(u)) this.afterAction(); break;
        case 'spy': {
          if (!u) break;
          const res = g.spyMission(u, d.id);
          if (!res) { this.toast(PP.t('Missão indisponível.'), 'bad'); break; }
          this.toast(res.caught ? PP.t('O espião foi capturado!') : res.text, res.caught ? 'bad' : 'good');
          if (res.caught) this.deselect();
          this.afterAction();
          if (!res.caught && d.id === 'infiltrate') this.openIntel(res.victim);
          break;
        }
        case 'unloadSel': {
          if (!u) break;
          const x = (u.cargo || []).find(c => c.id === +d.id);
          const tiles = x ? g.unloadTargets(u, x) : [];
          if (!tiles.length) { this.toast(PP.t('Nenhuma praia livre ao lado (ou a tropa embarcou neste turno).'), 'bad'); break; }
          this.sel.unload = { transport: u.id, unit: x.id, tiles };
          this.refreshSelection();
          this.toast(PP.t('Toque numa casa marcada para desembarcar.'), '');
          break;
        }
        case 'tile': {
          const chk = g.tileActionCheck(p, this.sel.tile, d.id);
          if (!chk.ok) { this.toast(chk.reason || PP.t('Indisponível'), 'bad'); break; }
          g.doTileAction(p, this.sel.tile, d.id);
          this.afterAction();
          break;
        }
        case 'wonder': {
          const chk = g.wonderCheck(p, this.sel.tile, d.id);
          if (!chk.ok) { this.toast(chk.reason || PP.t('Indisponível'), 'bad'); break; }
          g.buildWonder(p, this.sel.tile, d.id);
          this.afterAction();
          break;
        }
      }
    }

    // ============================================================ Modais
    openModal(kind, html, opts) {
      opts = opts || {};
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      if (opts.lock) wrap.dataset.lock = '1';
      wrap.innerHTML = `<div class="modal ${opts.narrow ? 'narrow' : ''}" role="dialog" aria-modal="true">${html}</div>`;
      $('#modal-root').appendChild(wrap);
      this.modals.push({ kind, el: wrap, onClose: opts.onClose });
      const btn = wrap.querySelector('.btn.primary, button');
      if (btn && opts.focus !== false) setTimeout(() => { try { btn.focus({ preventScroll: true }); } catch (e) { /* ignora */ } }, 30);
      return wrap;
    }

    closeModal(kind) {
      let i = this.modals.length - 1;
      if (kind) i = this.modals.findIndex(m => m.kind === kind);
      if (i < 0) return;
      const m = this.modals[i];
      if (m.el.dataset.lock && !kind) return;
      m.el.remove();
      this.modals.splice(i, 1);
      if (m.onClose) m.onClose();
    }

    closeAllModals() { while (this.modals.length) { const m = this.modals.pop(); m.el.remove(); } }

    replaceModal(kind, html, opts) {
      const m = this.modals.find(x => x.kind === kind);
      if (!m) return this.openModal(kind, html, opts);
      const box = m.el.querySelector('.modal');
      keepScroll(box, () => { box.innerHTML = html; });
      return m.el;
    }

    ask(title, body, yes, no) {
      return new Promise(res => {
        this.askResolve = res;
        this.openModal('ask', `<div class="modal-h"><h2>${title}</h2></div><div class="modal-b">${body}</div>
          <div class="modal-f"><button type="button" class="btn ghost" data-m="ask" data-v="0">${no}</button><button type="button" class="btn primary" data-m="ask" data-v="1">${yes}</button></div>`, { narrow: true, lock: true });
      });
    }

    closeX() { return `<button type="button" class="icon-btn" data-m="close" aria-label="${PP.t('Fechar')}">✕</button>`; }

    modalAction(a, d, btn) {
      const g = this.game;
      switch (a) {
        case 'close': this.closeModal(btn.closest('.modal-wrap').dataset.lock ? this.modals[this.modals.length - 1].kind : undefined); break;
        case 'ask': { this.closeModal('ask'); const r = this.askResolve; this.askResolve = null; if (r) r(d.v === '1'); break; }
        case 'reward': {
          const p = this.me();
          if (g.chooseReward(p, d.v)) { this.closeModal('reward'); this.afterAction(); }
          break;
        }
        case 'promo': {
          const u = g.units.find(x => x.id === +d.id);
          if (u && g.promote(u, d.v)) { this.closeModal('promote'); this.afterAction(); }
          break;
        }
        case 'tech': {
          if (!this.myTurn()) { this.toast(PP.t('Espere a sua vez.'), 'bad'); break; }
          const p = this.me();
          if (d.v === 'future') { if (!g.researchFuture(p)) this.toast(PP.t('Ciência insuficiente.'), 'bad'); }
          else {
            const st = g.techState(p, d.v);
            if (st === 'done') break;
            if (st === 'locked') { this.toast(PP.t('Pesquise os pré-requisitos primeiro.'), 'bad'); break; }
            const cost = g.techCost(p, d.v);
            if (p.science < cost) { this.toast(PP.t('Faltam {n}{sci} para {t}.', { n: cost - p.science, sci: SCI, t: PP.TECH[d.v].name }), 'bad'); break; }
            g.research(p, d.v);
          }
          this.renderHud();
          this.openTech(true);
          if (this.sel) this.refreshSelection();
          break;
        }
        case 'build': {
          const c = g.cityMap[+d.city], p = this.me();
          if (!this.myTurn()) break;
          const chk = g.buildingCheck(p, c, d.v);
          if (!chk.ok) { this.toast(chk.reason, 'bad'); break; }
          g.build(p, c, d.v);
          this.afterAction();
          this.openCity(c, true);
          break;
        }
        case 'train': {
          const c = g.cityMap[+d.city], p = this.me();
          if (!this.myTurn()) break;
          const chk = g.trainCheck(p, c, d.v);
          if (!chk.ok) { this.toast(chk.reason, 'bad'); break; }
          const nu = g.train(p, c, d.v);
          this.closeModal('city');
          if (nu) this.sel = { tile: g.tileAt(nu), mode: 'tile' };
          this.afterAction();
          break;
        }
        case 'goto': {
          const c = g.cityMap[+d.city];
          this.closeModal('cities');
          this.select(g.tile(c.x, c.y), 'tile');
          this.focusSelection('center');
          break;
        }
        case 'peace': {
          const res = g.proposePeace(this.viewer, +d.p);
          const o = g.players[+d.p];
          if (res === 'accepted') this.toast(PP.t('{x} aceitou a paz.', { x: o.name }), 'good');
          else if (res === 'rejected') this.toast(PP.t('{x} recusou a paz.', { x: o.name }), 'bad');
          else if (res === 'pending') this.toast(PP.t('Proposta enviada a {x}.', { x: o.name }), '');
          else if (res === 'wait') this.toast(PP.t('Você já fez uma proposta neste turno.'), 'bad');
          this.afterAction();
          this.openDiplomacy(true);
          break;
        }
        case 'war': {
          const o = g.players[+d.p];
          const st = g.relState(this.viewer, +d.p);
          const warn = st === 'alliance' ? PP.t('Trair uma aliança custa <b>3 de reputação</b>, a vítima nunca esquece e todas as tribos que conhecem você passam a desconfiar.')
            : st === 'nap' ? PP.t('Romper um pacto de não agressão custa <b>2 de reputação</b> e todas as tribos que conhecem você passam a desconfiar.')
            : PP.t('Quebrar a paz custa 1 de reputação: as outras tribos vão confiar menos em você nas negociações.');
          const allies = g.alliesOf(+d.p).map(a => g.players[a].name);
          this.ask(PP.t('Declarar guerra?'), `<p>${warn}${allies.length ? ' ' + PP.t('Os aliados de {x} ({y}) serão chamados às armas.', { x: esc(o.name), y: esc(allies.join(', ')) }) : ''}</p>`, PP.t('Declarar guerra'), PP.t('Manter a paz')).then(ok => {
            if (ok && g.declareWar(this.viewer, +d.p)) this.afterAction();
            this.openDiplomacy(true);
          });
          break;
        }
        case 'respond': {
          g.respondProposal(this.me(), d.id ? +d.id : +d.p, d.v === '1');
          this.afterAction();
          this.openDiplomacy(true);
          break;
        }
        case 'resume': this.closeModal('menu'); break;
        case 'speed': this.settings.speed = d.v; this.applySettings(); this.openGameMenu(true); break;
        case 'follow': this.settings.follow = !this.settings.follow; this.applySettings(); this.openGameMenu(true); break;
        case 'ash': this.settings.ash = !this.settings.ash; this.applySettings(); this.openGameMenu(true); break;
        case 'lang': this.setLang(d.v); break;
        case 'help': this.openHelp(); break;
        case 'quit':
          this.ask(PP.t('Voltar ao menu?'), `<p>${PP.t('A partida fica salva neste aparelho e pode ser continuada depois.')}</p>`, PP.t('Salvar e sair'), PP.t('Cancelar')).then(ok => {
            if (!ok) return;
            this.save(); this.closeAllModals(); this.deselect(); this.showMenu();
          });
          break;
        case 'newgame':
          this.closeAllModals(); this.deselect(); this.showMenu(); this.showSetup();
          break;
        case 'viewmap':
          this.closeModal('gameover'); this.r.viewer = -1; this.r.dirty = true;
          break;
        default:
          if (this.modalActionExt) this.modalActionExt(a, d, btn);
      }
    }

    // ---------------------------------------------------------- Promoção
    openPromote(u) {
      const cards = Object.entries(PP.PROMOTIONS).map(([k, pr]) =>
        `<button type="button" class="card big" data-m="promo" data-id="${u.id}" data-v="${k}">${ico('p_' + k, 'ci')}<span class="cn">${pr.name}</span><span class="cd">${pr.desc}</span></button>`).join('');
      this.openModal('promote', `<div class="modal-h"><div><h2>${PP.t('Promover {u}', { u: UN[u.type].name })}</h2><div class="sub">${PP.t('A promoção também cura a unidade por completo.')}</div></div>${this.closeX()}</div>
        <div class="modal-b"><div class="grid">${cards}</div></div>`, { narrow: true });
    }

    // ---------------------------------------------------------- Cidade
    openCity(c, refresh) {
      const g = this.game, p = this.me();
      const inc = g.cityIncome(c);
      const my = this.myTurn();
      const units = PP.TRAINABLE.map(type => {
        const d = UN[type];
        const chk = g.trainCheck(p, c, type);
        if (d.character || (chk.locked && (d.naval || d.spy))) return ''; // personagens têm seção própria
        const needs = d.needs ? ' · ' + PP.t('requer {x}', { x: PP.STRATEGIC[d.needs].name }) : '';
        return `<button type="button" class="card ${chk.ok && my ? 'go' : ''} ${chk.locked ? 'locked' : ''}" data-m="train" data-city="${c.id}" data-v="${type}">
          <div class="card-row">${crest(p.color, 'u_' + type, 'crest-s')}<span class="cn">${d.name}</span></div>
          <span class="cc star">${chk.cost}★${chk.cost !== d.cost ? ` <small class="muted">(${d.cost})</small>` : ''}</span>
          <span class="mini-stats"><span>${ico('s_hp')}${d.hp}</span><span>${ico('s_atk')}${fmt(d.atk)}</span><span>${ico('s_def')}${d.def}</span><span>${ico('s_move')}${d.move}</span><span>${ico('s_range')}${d.range}</span></span>
          <span class="cd">${d.skills.map(k => (PP.SKILL_NAMES[k] || '').split(' (')[0]).join(', ')}${needs}</span>
          ${chk.ok ? '' : `<span class="cr">${esc(chk.reason)}</span>`}</button>`;
      }).join('');
      const blds = PP.BUILDING_ORDER.map(id => {
        const b = PP.BUILDINGS[id];
        const chk = g.buildingCheck(p, c, id);
        if (b.spec && b.spec !== c.spec && !c.buildings[id]) return '';
        return `<button type="button" class="card ${chk.ok && my ? 'go' : ''} ${chk.done ? 'done' : ''} ${chk.locked ? 'locked' : ''}" data-m="build" data-city="${c.id}" data-v="${id}">
          <div class="card-row">${ico('b_' + id, 'ci')}<span class="cn">${b.name}</span>${b.spec ? `<span class="tag gold">${PP.SPECS[b.spec].name}</span>` : ''}</div>
          <span class="cc star">${chk.done ? PP.t('Construído') : chk.cost + '★'}</span><span class="cd">${b.desc}</span>
          ${!chk.ok && !chk.done ? `<span class="cr">${esc(chk.reason)}</span>` : ''}</button>`;
      }).join('');
      const bonus = [];
      if (c.workshop) bonus.push(PP.t('Oficina ×{n}', { n: c.workshop }));
      if (c.academy) bonus.push(PP.t('Academia ×{n}', { n: c.academy }));
      if (c.parks) bonus.push(PP.t('Parque ×{n}', { n: c.parks }));
      if (c.radius > 1) bonus.push(PP.t('Fronteiras expandidas'));
      if (c.connected) bonus.push(PP.t('Conectada à capital'));
      if (c.metropolis) bonus.push(PP.t('Metrópole'));
      for (const m in c.milestones || {}) if (PP.REWARDS[m]) bonus.push(PP.REWARDS[m].name);
      const need = c.level + 1;
      const defX = (c.buildings.walls ? 3 : 1.5) + (g.wonders.great_wall === c.owner ? 0.5 : 0) + g.cityDefenseExtra(c);
      const html = `<div class="modal-h">${crest(p.color, c.capital ? 'ui_capital' : 'ui_city', 'crest-l')}<div class="mh-t"><h2>${esc(c.name)}</h2><div class="sub">${PP.t('Nível {n}', { n: PP.roman(c.level) })}${c.spec ? ' · ' + PP.t('Cidade {s}', { s: PP.SPECS[c.spec].name.toLowerCase() }) : ''} · ${PP.t('{a}/{b} de população para o próximo nível', { a: c.pop, b: need })}</div></div>
        ${this.closeX()}</div>
        <div class="modal-b">
          <div class="popbar">${Array.from({ length: need }, (_, k) => `<i class="${k < c.pop ? 'on' : ''}"></i>`).join('')}</div>
          <div class="stats"><span class="st gold">★ ${PP.t('+{n} por turno', { n: inc.stars })}</span><span class="st sci">${SCI} ${PP.t('+{n} por turno', { n: inc.sci })}</span>
          ${this.stat('s_atk', PP.t('{a}/{b} unidades', { a: g.cityUnits(c).length, b: g.capacity(c) }))}${this.stat('s_def', PP.t('defesa ×{x}', { x: fmt(defX) }))}${this.stat('ui_loyalty', PP.t('lealdade {n}', { n: c.loyalty }))}</div>
          ${inc.notes && inc.notes.length ? `<p class="note">${esc(inc.notes.join(' · '))}</p>` : ''}
          ${bonus.length ? `<p class="note">${bonus.join(' · ')}</p>` : ''}
          ${this.citySections(c)}
          ${this.realmCitySection ? this.realmCitySection(c) : ''}
          <div class="sec-lbl">${PP.t('Recrutar')}${g.unitAt(c.x, c.y) ? ' · ' + PP.t('a cidade precisa estar desocupada (navios nascem no porto)') : ''}</div><div class="grid">${units}</div>
          <div class="sec-lbl">${PP.t('Construções')}</div><div class="grid">${blds}</div>
        </div>`;
      if (refresh) this.replaceModal('city', html); else this.openModal('city', html);
    }

    openCities() {
      if (!this.game) return;
      const g = this.game, me = this.me();
      const list = g.citiesOf(this.viewer).sort((a, b) => b.level - a.level);
      const rows = list.map(c => {
        const inc = g.cityIncome(c);
        return `<div class="row">${crest(me.color, c.capital ? 'ui_capital' : 'ui_city', 'crest-m')}
          <div class="rt"><div class="rn">${esc(c.name)} · ${PP.t('nível {n}', { n: PP.roman(c.level) })}${c.spec ? ` <span class="tag gold">${PP.SPECS[c.spec].name}</span>` : ''}${g.cityStatus(c) ? ` <span class="tag bad">${g.cityStatus(c).name}</span>` : ''}${this.realmCityTag ? this.realmCityTag(c) : ''}</div><div class="rs">★ +${inc.stars} · ${SCI} +${inc.sci} · ${PP.t('{a}/{b} unidades', { a: g.cityUnits(c).length, b: g.capacity(c) })} · ${PP.t('população {a}/{b}', { a: c.pop, b: c.level + 1 })} · ${PP.t('lealdade {n}', { n: c.loyalty })}${g.routeSlots(c) ? ' · ' + PP.t('rotas {a}/{b}', { a: g.routesOf(c).length, b: g.routeSlots(c) }) : ''}</div></div>
          <div class="ra"><button type="button" class="chip-btn" data-m="goto" data-city="${c.id}">${PP.t('Ir até lá')}</button></div></div>`;
      }).join('');
      this.openModal('cities', `<div class="modal-h"><div><h2>${PP.t('Suas cidades')}</h2><div class="sub">${PP.plural(list.length, PP.t('{n} cidade', { n: list.length }), PP.t('{n} cidades', { n: list.length }))}</div></div>${this.closeX()}</div>
        <div class="modal-b">${this.realmSummary ? this.realmSummary() : ''}<div class="list">${rows || `<p class="note">${PP.t('Nenhuma cidade.')}</p>`}</div></div>`, { narrow: true });
    }

    // ---------------------------------------------------------- Tecnologia
    openTech(refresh) {
      if (!this.game) return;
      const g = this.game, p = this.me();
      const inc = g.income(p);
      let html = `<div class="modal-h"><div><h2>${PP.t('Tecnologias')}</h2><div class="sub">${PP.t('{x} disponíveis', { x: `<b class="sci">${SCI} ${p.science}</b>` })} · ${PP.t('+{n} por turno', { n: inc.sci })} · ${PP.t('o custo cresce com o número de cidades')}</div></div>
        ${this.closeX()}</div><div class="modal-b">`;
      const maxTier = Math.max(...PP.TECHS.map(t => t.tier));
      for (let tier = 1; tier <= maxTier; tier++) {
        html += `<div class="era"><h3>${ERA()[tier]}</h3><div class="grid">`;
        for (const t of PP.TECHS.filter(x => x.tier === tier)) {
          const st = g.techState(p, t.id);
          const cost = g.techCost(p, t.id);
          const can = st === 'available' && p.science >= cost;
          const req = t.req.length ? PP.t('Requer {x}', { x: t.req.map(r => PP.TECH[r].name).join(' + ') }) : '';
          html += `<button type="button" class="card ${st === 'done' ? 'done' : ''} ${st === 'locked' ? 'locked' : ''} ${can ? 'go sci-go' : ''}" data-m="tech" data-v="${t.id}">
            <div class="card-row">${ico('t_' + t.id, 'ci')}<span class="cn">${t.name}</span></div>
            <span class="cc ${st === 'done' ? '' : 'sci'}">${st === 'done' ? PP.t('Pesquisada') : cost + SCI}</span>
            <span class="cd">${t.desc}</span>${st === 'locked' ? `<span class="cr">${req}</span>` : ''}</button>`;
        }
        html += '</div></div>';
      }
      if (g.allTechs(p)) {
        const c = g.futureCost(p);
        html += `<div class="era"><h3>${PP.t('Além')}</h3><div class="grid"><button type="button" class="card ${p.science >= c ? 'go sci-go' : ''}" data-m="tech" data-v="future">
          <div class="card-row">${ico('t_future', 'ci')}<span class="cn">${PP.t('Tecnologia do Futuro {n}', { n: (p.future || 0) + 1 })}</span></div>
          <span class="cc sci">${c}${SCI}</span><span class="cd">${PP.t('+120 pontos cada. Pode ser pesquisada várias vezes.')}</span></button></div></div>`;
      }
      html += '</div>';
      if (refresh) this.replaceModal('tech', html); else this.openModal('tech', html);
    }

    // ---------------------------------------------------------- Diplomacia
    openDiplomacy(refresh) {
      if (!this.game) return;
      const g = this.game, me = this.me();
      $('#diplo-dot').hidden = true;
      const myS = g.strength(me.id);
      const my = this.myTurn();
      let rows = '';
      let unknown = 0;
      for (const o of g.players) {
        if (o.id === me.id) continue;
        if (!me.met[o.id]) { unknown++; continue; }
        const rel = me.rel[o.id];
        const st = rel.state;
        const ratio = g.strength(o.id) / Math.max(1, myS);
        const power = !o.alive ? PP.t('eliminada') : ratio > 1.5 ? PP.t('muito mais forte') : ratio > 1.1 ? PP.t('mais forte') : ratio > 0.9 ? PP.t('equilibrada') : ratio > 0.6 ? PP.t('mais fraca') : PP.t('muito mais fraca');
        const rep = o.reputation < 0 ? ' · ' + (o.reputation <= -2 ? PP.t('reputação traiçoeira ({n})', { n: o.reputation }) : PP.t('reputação duvidosa ({n})', { n: o.reputation }))
          : o.reputation > 0 ? ' · ' + PP.t('reputação boa (+{n})', { n: o.reputation }) : '';
        const pend = me.proposals.filter(pr => pr.from === o.id);
        const R = PP.RELATIONS[st] || PP.RELATIONS.war;
        const extra = st === 'nap' && rel.until != null ? ' · ' + PP.t('pacto até o turno {n}', { n: rel.until }) : st !== 'war' ? ' · ' + PP.t('{r} desde o turno {n}', { r: R.name.toLowerCase(), n: rel.since }) : '';
        let actions = '';
        if (o.alive && my) {
          const btn = (m, label, icon, type, cls) => `<button type="button" class="chip-btn ${cls || ''}" data-m="${m}" data-p="${o.id}" ${type ? `data-t="${type}"` : ''}>${icon ? ico(icon) : ''} ${label}</button>`;
          for (const pr of pend) {
            actions += `<button type="button" class="chip-btn" data-m="respond" data-p="${o.id}" data-id="${pr.id != null ? pr.id : ''}" data-v="1">${ico('d_treaty')} ${PP.t('Aceitar: {x}', { x: esc(this.proposalInfo(pr).short) })}</button><button type="button" class="chip-btn danger" data-m="respond" data-p="${o.id}" data-id="${pr.id != null ? pr.id : ''}" data-v="0">${PP.t('Recusar')}</button>`;
          }
          if (st === 'war') actions += btn('propose', PP.t('Propor paz'), 'ui_peace', 'peace');
          else {
            if (st === 'peace') actions += btn('propose', PP.t('Pacto ({n}t)', { n: PP.NAP_TURNS }), 'd_nap', 'nap');
            if (st !== 'alliance') actions += btn('propose', PP.t('Aliança'), 'd_alliance', 'alliance');
            actions += btn('trade', PP.t('Comércio'), 'd_trade');
            actions += btn('tribute', PP.t('Tributo'), 'd_tribute');
            actions += btn('joint', PP.t('Guerra conjunta'), 'd_joint');
            if (st === 'alliance') actions += btn('leave', PP.t('Sair da aliança'), 'd_break', null, 'danger');
            actions += btn('war', st === 'alliance' ? PP.t('Trair e atacar') : st === 'nap' ? PP.t('Romper pacto') : PP.t('Declarar guerra'), 'ui_war', null, 'danger');
          }
        }
        const op = g.opinion(o.id, me.id);
        const ol = g.opinionLabel(op);
        const mem = g.memorySummary(o.id, me.id).slice(0, 3).map(m => `${esc(m.label)} (${m.value > 0 ? '+' : ''}${m.value})`).join(' · ');
        const intel = me.intel && me.intel[o.id] ? me.intel[o.id] : null;
        const others = g.players.filter(q => q.alive && q.id !== o.id && q.id !== me.id && me.met[q.id] && o.met[q.id])
          .map(q => { const s2 = g.relState(o.id, q.id); return s2 === 'war' ? '' : `${esc(q.name)}: ${PP.RELATIONS[s2].name.toLowerCase()}`; }).filter(Boolean).join(', ');
        rows += `<div class="row">${crest(o.color, tribeIcon(o.tribe), 'crest-m')}
          <div class="rt"><div class="rn">${esc(o.name)} ${o.alive ? `<span class="tag ${R.tag}">${R.name}</span>` : `<span class="tag">${PP.t('Eliminada')}</span>`} ${o.alive ? `<span class="tag ${ol.tag}">${ol.name} (${op > 0 ? '+' : ''}${op})</span>` : ''} ${pend.length ? `<span class="tag gold">${PP.t('Proposta')}</span>` : ''}</div>
          <div class="rs">${PP.t('{s} pontos · {c} cidades · força {p}', { s: g.score(o), c: g.citiesOf(o.id).length, p: power })}${rep}${extra}</div>
          ${mem ? `<div class="rs">${PP.t('Lembram: {x}', { x: mem })}</div>` : ''}
          ${others ? `<div class="rs">${PP.t('Tratados: {x}', { x: others })}</div>` : ''}
          ${intel ? `<div class="rs">${PP.t('Relatório de espionagem (T{t}): {s}★ · {c}{sci} · {u} unidades · {k} tecnologias', { t: intel.turn, s: intel.stars, c: intel.science, sci: SCI, u: intel.units, k: intel.techs })}${intel.strategy && PP.AI_STRATEGIES ? ' · ' + PP.t('objetivo: {x}', { x: PP.AI_STRATEGIES[intel.strategy].name }) : ''} <button type="button" class="chip-btn" data-m="intel" data-p="${o.id}">${PP.t('Ver')}</button></div>` : ''}</div>
          <div class="ra">${actions}</div></div>`;
      }
      if (unknown) rows += `<div class="row"><span class="crest crest-m unknown">${ico('ui_unknown', 'crest-ico')}</span><div class="rt"><div class="rn">${PP.plural(unknown, PP.t('{n} tribo ainda desconhecida', { n: unknown }), PP.t('{n} tribos ainda desconhecidas', { n: unknown }))}</div><div class="rs">${PP.t('Explore o mapa para fazer contato.')}</div></div></div>`;
      const lock = g.opts.diploLockUntil && g.turn < g.opts.diploLockUntil ? ` <b>${PP.t('Guerra total: a paz só é possível a partir do turno {n}.', { n: g.opts.diploLockUntil })}</b>` : '';
      const html = `<div class="modal-h"><h2>${PP.t('Diplomacia')}</h2>${this.closeX()}</div>
        <div class="modal-b"><p class="note">${PP.t('Todas as tribos começam em guerra. Cada tribo lembra o que você fez: guerras, tratados cumpridos ou rompidos, comércio, ajuda militar e cidades tomadas. Romper um pacto ou trair uma aliança derruba sua reputação com o mundo inteiro. Aliados compartilham visão, pagam 20% menos pelas tecnologias que o outro já tem e podem chamar você para a guerra.')}${me.reputation < 0 ? ` <b>${PP.t('Sua reputação está manchada ({n}).', { n: me.reputation })}</b>` : me.reputation > 0 ? ' ' + PP.t('Sua reputação é boa (+{n}).', { n: me.reputation }) : ''}${lock}</p>
        <div class="list" style="margin-top:10px">${rows}</div></div>`;
      if (refresh) this.replaceModal('diplo', html); else this.openModal('diplo', html, { narrow: false });
    }

    // ---------------------------------------------------------- Placar
    scoreHead() {
      return `<thead><tr><th>${PP.t('Tribo')}</th><th class="num">${PP.t('Pontos')}</th><th class="num">${PP.t('Cidades')}</th><th class="num">${PP.t('Unidades')}</th><th class="num">${PP.t('Tecn.')}</th><th class="num">${PP.t('Abates')}</th></tr></thead>`;
    }

    scoreRows(all) {
      const g = this.game, me = this.me();
      return g.players.filter(o => all || o.id === me.id || me.met[o.id]).sort((a, b) => g.score(b) - g.score(a)).map(o => `<tr>
        <td><span class="swatch" style="background:${o.color}"></span>${esc(o.name)}${o.id === me.id ? ' (' + PP.t('você') + ')' : ''}${o.alive ? '' : ' †'}</td>
        <td class="num">${g.score(o)}</td><td class="num">${g.citiesOf(o.id).length}</td><td class="num">${g.unitsOf(o.id).length}</td>
        <td class="num">${Object.keys(o.techs).length}</td><td class="num">${o.stats.kills}</td></tr>`).join('');
    }

    scoreChart(all) {
      const g = this.game, me = this.me();
      const hist = g.history;
      if (hist.length < 2) return '';
      const players = g.players.filter(o => all || o.id === me.id || me.met[o.id]);
      const W = 600, H = 220, L = 44, R = 12, T = 12, B = 26;
      let max = 1;
      for (const h of hist) for (const o of players) max = Math.max(max, h.scores[o.id] || 0);
      const nice = Math.pow(10, Math.floor(Math.log10(max)));
      max = Math.ceil(max / nice) * nice;
      const x = i => L + (i / (hist.length - 1)) * (W - L - R);
      const y = v => T + (1 - v / max) * (H - T - B);
      let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${PP.t('Pontuação ao longo dos turnos')}">`;
      for (let k = 0; k <= 4; k++) {
        const v = (max / 4) * k;
        s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(201,164,92,0.14)" stroke-width="1"/>`;
        s += `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`;
      }
      const step = Math.max(1, Math.ceil(hist.length / 8));
      for (let i = 0; i < hist.length; i += step) s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">T${hist[i].turn}</text>`;
      for (const o of players) {
        const pts = hist.map((h, i) => `${x(i).toFixed(1)},${y(h.scores[o.id] || 0).toFixed(1)}`).join(' ');
        s += `<polyline points="${pts}" fill="none" stroke="${o.color}" stroke-width="${o.id === me.id ? 3 : 2}" stroke-linejoin="round" stroke-linecap="round"/>`;
        const last = hist.length - 1;
        s += `<circle cx="${x(last)}" cy="${y(hist[last].scores[o.id] || 0)}" r="4" fill="${o.color}"/>`;
      }
      return s + '</svg>';
    }

    openStats() {
      if (!this.game) return;
      const g = this.game;
      const html = `<div class="modal-h"><div><h2>${PP.t('Placar')}</h2><div class="sub">${g.opts.victory === 'pontos' ? PP.t('Vence quem tiver mais pontos no fim do turno {n}.', { n: g.opts.turnLimit }) : PP.t('Vitória por dominação: elimine todas as outras tribos.')}${g.opts.victories ? ' ' + PP.t('Veja as outras vitórias em Objetivos.') : ''}</div></div>
        ${this.closeX()}</div>
        <div class="modal-b"><div class="tbl-wrap"><table class="tbl">${this.scoreHead()}
        <tbody>${this.scoreRows(this.r.viewer === -1)}</tbody></table></div>${this.scoreChart(this.r.viewer === -1)}
        <p class="note">${PP.t('Pontos vêm de cidades e seus níveis, território, tecnologias, exército, maravilhas, parques e exploração.')}</p></div>`;
      this.openModal('stats', html);
    }

    openLog() {
      if (!this.game) return;
      const g = this.game;
      const items = g.logs.filter(l => !l.to || l.to.indexOf(this.viewer) >= 0).slice(-60).reverse();
      const html = `<div class="modal-h"><h2>${PP.t('Crônica')}</h2>${this.closeX()}</div>
        <div class="modal-b"><div class="log-list">${items.map(l => `<div><em>T${l.turn}</em>${esc(l.text)}</div>`).join('') || `<p class="note">${PP.t('Nada ainda.')}</p>`}</div></div>`;
      this.openModal('log', html, { narrow: true });
    }

    // ---------------------------------------------------------- Menu da partida
    openGameMenu(refresh) {
      const sp = this.settings.speed;
      const o = this.game.opts;
      const html = `<div class="modal-h"><h2>${PP.t('Menu')}</h2>${this.closeX()}</div>
        <div class="modal-b" style="display:grid;gap:14px">
          <div class="field"><span class="lbl">${PP.t('Velocidade da IA')}</span><div class="seg">
            ${[['normal', PP.t('Normal')], ['fast', PP.t('Rápida')], ['instant', PP.t('Instantânea')]].map(([k, l]) => `<button type="button" class="${sp === k ? 'on' : ''}" data-m="speed" data-v="${k}">${l}</button>`).join('')}</div></div>
          <div class="field"><span class="lbl">${PP.t('Câmera e ambiente')}</span><div class="seg">
            <button type="button" class="${this.settings.follow ? 'on' : ''}" data-m="follow">${PP.t('Seguir ações da IA')}</button>
            <button type="button" class="${this.settings.ash ? 'on' : ''}" data-m="ash">${PP.t('Cinzas no ar')}</button></div></div>
          <div class="field"><span class="lbl">${PP.t('Idioma')}</span><div class="seg lang-seg">
            ${Object.keys(PP.LANGS).map(k => `<button type="button" class="${PP.lang === k ? 'on' : ''}" data-m="lang" data-v="${k}" lang="${PP.LANG_LOCALE[k]}">${PP.LANGS[k]}</button>`).join('')}</div></div>
          <p class="note">${PP.t('Partida: mapa {w}×{h} · {type} · IA {diff}', { w: this.game.W, h: this.game.H, type: (PP.MAP_TYPES[o.mapType] || { name: o.mapType }).name, diff: PP.DIFFICULTY[o.difficulty].name })}${o.scenario && o.scenario !== 'normal' ? ' · ' + PP.t('Cenário {x}', { x: PP.SCENARIOS[o.scenario].name }) : ''}. ${PP.t('O jogo salva sozinho a cada turno.')}</p>
          <p class="note">${PP.t('Atalhos: Enter encerra o turno · N próxima unidade · T tecnologia · D diplomacia · C cidades · O objetivos · roda do mouse ou pinça para zoom.')}</p>
        </div>
        <div class="modal-f"><button type="button" class="btn ghost" data-m="objectives">${PP.t('Objetivos')}</button><button type="button" class="btn ghost" data-m="achievements">${PP.t('Conquistas')}</button><button type="button" class="btn ghost" data-m="replay">${PP.t('Replay')}</button>
          <button type="button" class="btn ghost" data-m="help">${PP.t('Como jogar')}</button><button type="button" class="btn ghost" data-m="quit">${PP.t('Sair para o menu')}</button><button type="button" class="btn primary" data-m="resume">${PP.t('Voltar ao jogo')}</button></div>`;
      if (refresh) this.replaceModal('menu', html); else this.openModal('menu', html, { narrow: true });
    }

    // ---------------------------------------------------------- Fim de jogo
    showGameOver() {
      const g = this.game;
      if (!g || this.modals.some(m => m.kind === 'gameover')) return;
      const w = g.players[g.winner];
      const humanWon = w && w.human;
      const title = humanWon ? (this.hotseat ? PP.t('Vitória de {x}', { x: w.name }) : PP.t('Vitória')) : PP.t('Derrota');
      const reason = { dominacao: PP.t('por dominação'), pontos: PP.t('por pontos no turno {n}', { n: g.opts.turnLimit }), derrota: PP.t('sua tribo foi eliminada') }[g.endReason] ||
        (PP.VICTORIES[g.endReason] ? PP.t('pela vitória {x}', { x: PP.VICTORIES[g.endReason].name.toLowerCase() }) : '');
      this.recordAchievements();
      const sub = humanWon ? PP.t('{x} venceu {r}.', { x: esc(w.name), r: reason })
        : g.endReason === 'derrota' ? PP.t('Sua tribo foi eliminada.') + (w ? ' ' + PP.t('{x} lidera o mundo.', { x: esc(w.name) }) : '')
          : PP.t('{x} venceu {r}.', { x: w ? esc(w.name) : PP.t('Ninguém'), r: reason });
      store(SAVE_KEY, null);
      this.openModal('gameover', `<div class="modal-h">${w ? crest(w.color, tribeIcon(w.tribe), 'crest-l') : ''}<div class="mh-t"><h2>${title}</h2><div class="sub">${sub} ${PP.t('Turno {n}.', { n: g.turn })}</div></div></div>
        <div class="modal-b"><div class="tbl-wrap"><table class="tbl">${this.scoreHead()}
        <tbody>${this.scoreRows(true)}</tbody></table></div>${this.scoreChart(true)}
        <div class="sec-lbl">${PP.t('Estatísticas completas')}</div>${this.finalStatsTable()}
        ${this.gameAchievementsLine()}</div>
        <div class="modal-f"><button type="button" class="btn ghost" data-m="viewmap">${PP.t('Ver o mapa')}</button><button type="button" class="btn ghost" data-m="replay">${PP.t('Replay')}</button><button type="button" class="btn ghost" data-m="achievements">${PP.t('Conquistas')}</button><button type="button" class="btn ghost" data-m="quit">${PP.t('Menu')}</button><button type="button" class="btn primary" data-m="newgame">${PP.t('Nova campanha')}</button></div>`, { lock: true });
    }

    // ---------------------------------------------------------- Ajuda
    openQuickStart() {
      const li = k => `<li>${PP.t(k, { sci: SCI })}</li>`;
      this.openModal('quick', `<div class="modal-h"><h2>${PP.t('Primeiros passos')}</h2>${this.closeX()}</div>
        <div class="modal-b help">
          <ul>
            ${li('<b>Objetivos</b> (barra lateral) mostra todas as formas de vencer e o seu progresso.')}
            ${li('<b>Toque na sua unidade</b> para ver onde ela pode ir (casas marcadas) e quem pode atacar (anéis vermelhos).')}
            ${li('<b>Aldeias</b> viram cidades: pare uma unidade em cima e use <b>Capturar</b> no turno seguinte.')}
            ${li('<b>Toque em casas do seu território</b> para colher recursos e construir melhorias. Isso aumenta a população e sobe o nível das cidades.')}
            ${li('<b>★ Estrelas</b> pagam unidades e construções. <b>{sci} Ciência</b> paga tecnologias (botão Tecnologia, à esquerda).')}
            ${li('Quando terminar, toque em <b>Fim do turno</b>.')}
          </ul>
        </div>
        <div class="modal-f"><button type="button" class="btn ghost" data-m="help">${PP.t('Regras completas')}</button><button type="button" class="btn primary" data-m="close">${PP.t('Jogar')}</button></div>`, { narrow: true });
    }

    openHelp() {
      const tribes = PP.TRIBE_IDS.map(id => `<li><b>${PP.TRIBES[id].name}</b>: ${esc(PP.TRIBES[id].perk)}</li>`).join('');
      const credits = (PP.ICON_CREDITS || []).join(', ');
      const v = { sci: SCI, n: PP.OCCUPATION_TURNS };
      const h = k => `<h3>${PP.t(k)}</h3>`;
      const p = k => `<p>${PP.t(k, v)}</p>`;
      const li = k => `<li>${PP.t(k, v)}</li>`;
      this.openModal('help', `<div class="modal-h"><h2>${PP.t('Como jogar')}</h2>${this.closeX()}</div>
        <div class="modal-b help">
          ${h('Objetivo')}
          ${p('No modo <b>Dominação</b>, vença eliminando todas as outras tribos (uma tribo é eliminada ao perder todas as cidades). No modo <b>Pontos</b>, tenha a maior pontuação ao fim do turno limite.')}
          ${p('Em partidas novas também valem (se ativadas na criação): <b>Científica</b> (com a árvore de tecnologias completa, o Grande Observatório em 3 etapas de 150, 250 e 350{sci} — mais em mapas grandes —, uma a cada 3 turnos, numa cidade científica de nível 5 ou mais), <b>Econômica</b> (estrelas acumuladas em rotas comerciais e ao menos uma rota com outra tribo), <b>Maravilhas</b> (6 das 8 maravilhas mantidas por 8 turnos; quem conquista a cidade leva a maravilha, e cada maravilha que você já tem encarece a próxima em 10★), <b>Territorial</b> (a maior parte das terras por 8 turnos: 63% com 2 tribos, até 45% com 5 ou mais) e <b>Diplomática</b> (alianças com metade das tribos, nenhuma guerra e reputação positiva por 5 turnos). O botão <b>Objetivos</b> mostra o progresso de todos.')}
          ${h('Duas moedas')}
          ${p('<b>★ Estrelas</b> vêm do nível das cidades, oficinas, parques, bancos, garimpos, plantações, mercados e rotas comerciais. Pagam unidades, melhorias, construções e maravilhas.')}
          ${p('<b>{sci} Ciência</b> vem das cidades, bibliotecas, universidades e academias. Paga tecnologias, cujo custo aumenta com o número de cidades que você tem.')}
          ${h('Cidades e população')}
          ${p('Colher recursos e construir melhorias dá população à cidade dona da casa. Com população suficiente a cidade sobe de nível e você escolhe uma recompensa (oficina, academia, muralhas, crescimento, fronteiras, parque ou um Gigante). Cada cidade sustenta <b>nível + 1</b> unidades (+2 com Quartel).')}
          ${p('Melhorias em cadeia: Serraria ganha +1 por Cabana de lenhador vizinha, Moinho +1 por Fazenda vizinha, Forja +2 por Mina vizinha, e o Mercado rende ★ pela soma dessas três ao redor.')}
          ${h('Combate')}
          ${p('Força de ataque = ataque × vida atual/máxima. Força de defesa = defesa × vida atual/máxima × bônus. O dano causado é <code>ataque × 4,5 × (força de ataque / soma das forças)</code>. Se o defensor sobreviver e o atacante estiver no alcance dele, ele revida.')}
          <ul>
            ${li('Bônus de defesa: cidade ×1,5, muralhas ×3, floresta ×1,5 (com Arco e Flecha), montanha ×1,5 (com Escalada), colinas ×1,25, pântano ×0,8 e fortificação +25%.')}
            ${li('Piqueiros têm defesa ×2 e ataque ×1,5 contra unidades montadas. Montados não entram em montanhas.')}
            ${li('Abates dão XP. Com 3 XP a unidade vira <b>Veterana</b> e com 7 vira <b>Elite</b>; cada patente permite uma promoção (Força, Escudo, Vigor ou Agilidade).')}
            ${li('Zona de controle: entrar ao lado de um inimigo encerra o movimento.')}
          </ul>
          ${h('Recursos estratégicos')}
          ${p('Uma <b>Mina</b> em minério de ferro fornece <b>Ferro</b> (Espadachim, Mosqueteiro e Canhão). Um <b>Pasto</b> em cavalos fornece <b>Cavalos</b> (Cavaleiro). Sem eles, essas unidades não podem ser treinadas.')}
          ${h('Mar')}
          ${p('Com Navegação, construa um Porto: unidades que entram nele embarcam e viram Balsas (Nau com Cartografia, Nau de guerra com Engenharia Naval). Desembarcar em qualquer praia encerra o movimento.')}
          ${p('Cidades com porto também constroem <b>navios de verdade</b>, que nascem no porto e só andam na água: <b>Escuna</b> (rápida, visão 3), <b>Transporte</b> (leva 2 tropas: entre nele com a tropa e use <b>Desembarcar</b> num turno seguinte), <b>Fragata</b> (+50% contra alvos na água) e <b>Couraçado</b> (só em cidades portuárias, com Ferro). Tropas que atacam no turno do desembarque sofrem −25%; se o transporte afundar, a carga afunda junto.')}
          ${h('Diplomacia')}
          ${p('Todas as tribos começam em guerra. No painel Diplomacia você propõe <b>paz</b>, <b>pacto de não agressão</b> (com prazo), <b>aliança</b> (visão compartilhada, tecnologias 20% mais baratas quando o aliado já as tem, chamado às armas), <b>comércio</b> (estrelas, ciência, Ferro e Cavalos por 10 turnos), <b>tributo</b> e <b>guerra conjunta</b>. Cada tribo guarda uma memória do que você fez; romper um pacto (−2) ou trair uma aliança (−3) derruba sua reputação com todos.')}
          ${h('Cidades especializadas')}
          ${p('A partir do nível 2, cada cidade pode escolher uma especialização (5★; trocar custa 12★): <b>Militar</b>, <b>Científica</b>, <b>Comercial</b>, <b>Agrícola</b> ou <b>Portuária</b>. Cada uma tem bônus e custos claros, construções próprias (Arsenal, Cidadela, Observatório, Academia Real, Guilda, Bolsa, Silos, Aqueduto, Estaleiro, Farol, Alfândega) e marcos nos níveis 6, 8 e 10. No nível 12 a cidade pode virar <b>Metrópole</b>.')}
          ${h('Comércio, logística e recursos')}
          ${p('Rotas comerciais ligam duas cidades por estrada, porto ou mar e rendem estrelas (e ciência nas rotas com outras tribos). Inimigos sobre o caminho bloqueiam a rota; inimigos ao lado a ameaçam (metade do lucro), a menos que uma fortificação sua proteja o trecho. Estradas podem ser cortadas e melhorias saqueadas; o dono repara.')}
          ${p('Tropas longe de cidades, território, estradas, portos e fortificações ficam <b>sem suprimentos</b> depois de um turno: −20% (e −35% após 4 turnos) e cura pela metade. O deserto consome suprimentos em dobro. Cavalos aumentam o raio de abastecimento das cidades.')}
          ${p('Fontes extras de Ferro e Cavalos barateiam as unidades que dependem deles. Gemas, Especiarias e Baleias (Estação baleeira) são <b>luxos</b>: dão lealdade às cidades; gemas barateiam maravilhas e especiarias melhoram rotas com outras tribos.')}
          ${h('Combate tático')}
          <ul>
            ${li('<b>Flanco</b>: +10% por aliado colado no defensor (máx. +20%); <b>pelas costas</b>: +20% se um aliado estiver do lado oposto.')}
            ${li('<b>Formação</b>: defensores com aliados ao lado ganham até +20%. <b>Terreno elevado</b>: tiros de colinas ou montanhas +25%. <b>Emboscada</b>: quem ataca de uma floresta sem ter se movido ganha +20%.')}
            ${li('<b>Linha de visão</b>: montanhas (e florestas, para quem não está no alto) bloqueiam tiros; catapultas e canhões atiram por cima.')}
            ${li('<b>Ataque de oportunidade</b>: sair do lado de um inimigo corpo a corpo custa um golpe de 35% (unidades com Fuga escapam).')}
            ${li('<b>Habilidades ativas</b> com recarga: Tiro Preciso, Carga, Provocar, Formação Cerrada, Bombardeio, Bênção, Reconhecimento e Bordada.')}
            ${li('<b>Fortificações</b>: Torre de vigia (visão e detecção), Posto avançado (abastece), Forte (defesa ×2) e Fortaleza (×2,5). Inimigos que entram numa fortificação a tomam.')}
          </ul>
          ${h('Ocupação e lealdade')}
          ${p('Cidades conquistadas ficam <b>ocupadas</b> por {n} turnos (produção pela metade). Depois se integram se a lealdade for alta; senão entram em <b>resistência</b>. Guarnição, templo, luxos e paz com o antigo dono ajudam; uma cidade em resistência sem guarnição e com lealdade muito baixa pode se revoltar e voltar ao fundador.')}
          ${h('Espionagem e névoa')}
          ${p('Espiões (Espionagem) são invisíveis para quem não está colado neles. Ao lado de uma cidade estrangeira eles infiltram, roubam mapas, ciência ou tecnologias e sabotam a produção ou as estradas; o risco sobe com a Guarda da Cidade, torres e espiões do alvo. No mapa, casas vistas há pouco mostram as últimas tropas avistadas (inteligência recente).')}
          ${h('Eventos mundiais e marcos')}
          ${p('Secas, invernos, corridas do ouro, pragas, migrações, descobertas e tempestades são anunciados dois turnos antes e têm duração conhecida (chip no topo da tela). O mapa também tem pontos estratégicos: passos de montanha, estreitos, pontes antigas, portos naturais, minas abandonadas e ruínas imperiais.')}
          ${h('Organização do reino')}
          ${p('Cada reino governa bem um número limitado de cidades: a <b>capacidade administrativa</b> (4, mais Organização, Escrita, Código de Leis e Burocracia, Tribunais, Casas da Imprensa, Paços Regionais, a Chancelaria e o Governador). Cada cidade além disso causa <b>desordem</b>: −5% das estrelas e da ciência das cidades (máx. −25%).')}
          ${p('As cidades também precisam estar ao <b>alcance da corte</b>: 7 casas da capital (9 com Chancelaria), 5 de um Paço Regional ou 4 da cidade do Governador; estrada ou porto até a capital encurta a distância em 2. Fora do alcance a cidade rende 20% menos (10% com Tribunal) e, se foi conquistada, perde lealdade. Partidas criadas antes desta versão não têm desordem nem distância.')}
          ${h('Era V e personagens')}
          ${p('A Era V (Impérios) traz Burocracia, Diplomacia Real, Arte da Guerra, Siderurgia e Imprensa, com Chancelaria, Paço Regional, Embaixada, Academia Militar, Fundição Real, Casa da Imprensa, o Dragão (atirador montado) e o Morteiro.')}
          ${p('<b>Personagens</b> têm nome próprio e só pode haver um de cada por reino (marcados com uma estrela dourada): o <b>General</b> dá +20% de ataque e +10% de defesa às tropas vizinhas; o <b>Governador</b>, dentro ou ao lado de uma cidade sua, faz dela um centro administrativo (+2★, +10 de lealdade, +1 de capacidade); o <b>Embaixador</b>, no território de uma tribo em paz com você, rende +2 de opinião por turno e um relatório dela. Personagens não ocupam vaga nas cidades e não podem ser convertidos.')}
          ${h('Maravilhas')}
          ${p('Cada maravilha só pode ser construída uma vez no mundo, numa casa vazia do seu território. Todas dão +3 de população à cidade e 500 pontos, além do efeito próprio.')}
          ${h('Tribos')}<ul>${tribes}</ul>
          ${h('Ruínas')}
          ${p('Ruínas marcadas com <b>?</b> têm um tipo (fortaleza, templo, biblioteca, acampamento ou túmulo). Quem chega escolhe: <b>Explorar</b> (prêmio aleatório: estrelas, ciência, tecnologia, veterano, mapa ou população), <b>Saquear</b> (estrelas na hora, mas as outras tribos lembram), <b>Restaurar</b> (vira forte, posto ou santuário) ou <b>Honrar</b> (túmulos).')}
          ${h('Créditos')}
          <p>${PP.t('Ícones de <b>game-icons.net</b>, licença CC BY 3.0, por {x}.', { x: esc(credits) })}</p>
        </div>`, {});
    }
  }

  PP.UI = UI;
})(window.PP = window.PP || {});
