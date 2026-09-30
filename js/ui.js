/* Politopia+ — interface: entrada, HUD, painéis, modais e fluxo de turnos */
(function (PP) {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const UN = PP.UNITS, TER = PP.TERRAIN;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fmt = n => (Math.round(n * 10) / 10).toString().replace('.', ',');
  const SAVE_KEY = 'politopia-plus:save';
  const SET_KEY = 'politopia-plus:settings';
  const SCI = '⚗︎';
  const ERA = ['', 'Era I · Tribal', 'Era II · Bronze', 'Era III · Reinos', 'Era IV · Pólvora'];

  function store(key, val) { try { if (val == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } }
  function load(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } }

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
    const t = g.tileAt(u);
    if (TER[t.terrain].water) return ['n_boat', 'n_boat', 'n_ship', 'n_battleship'][Math.max(1, g.navalLevel(g.players[u.owner]))];
    return 'u_' + u.type;
  };
  const ACTION_ICON = { harvest: 'a_harvest', hunt: 'a_hunt', fishing: 'a_fishing', whaling: 'a_whaling', road: 'a_road', clear: 'a_clear', burn: 'a_burn', plant: 'a_plant', drain: 'a_drain' };
  const actionIcon = a => ACTION_ICON[a.id] || 'i_' + a.imp;
  const rewardIcon = r => r === 'walls' ? 'b_walls' : r === 'giant' ? 'u_giant' : 'rw_' + r;
  PP.ico = ico;
  PP.crest = crest;

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
      this.settings = Object.assign({ speed: this.reduced ? 'instant' : 'normal', follow: true, seenHelp: false, ash: !this.reduced }, load(SET_KEY) || {});
      this.applySettings();
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
          const p = local(e);
          const hit = this.game && this.r.unitAtScreen(p.x, p.y);
          const t = hit ? this.game.tileAt(hit) : this.r.screenToTile(p.x, p.y);
          if (t) this.handleTap(t); else this.deselect();
        }
      };
      c.addEventListener('pointerup', up);
      c.addEventListener('pointercancel', up);
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
      $('#btn-menu').onclick = () => this.openGameMenu();
      $('#btn-skip').onclick = () => { this.fastForward = true; $('#btn-skip').disabled = true; };
      $('#m-new').onclick = () => this.showSetup();
      $('#m-help').onclick = () => this.openHelp();
      $('#m-continue').onclick = () => this.continueSaved();
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
        size: saved.lastSize || 18, mapType: saved.lastMap || 'continentes', difficulty: saved.lastDiff || 'normal', victory: saved.lastVictory || 'dominacao',
      };
      this.renderSetup();
    }

    renderSetup() {
      const s = this.setupState;
      const f = $('#setup');
      const me = s.slots[0];
      const tribeCards = PP.TRIBE_IDS.map(id => {
        const t = PP.TRIBES[id];
        return `<button type="button" class="tribe-card ${me.tribe === id ? 'on' : ''}" style="--tribe:${t.color}" data-s="tribe" data-v="${id}">
          ${crest(t.color, tribeIcon(id), 'crest-m')}<span><span class="tn">${t.name}</span><span class="tp">${esc(t.perk)} Começa com ${PP.TECH[t.startTech].name}${t.extraTech ? ' e ' + PP.TECH[t.extraTech].name : ''}.</span></span></button>`;
      }).join('');
      const slots = s.slots.map((sl, i) => {
        const t = PP.TRIBES[sl.tribe];
        const opts = PP.TRIBE_IDS.map(id => `<option value="${id}" ${id === sl.tribe ? 'selected' : ''}>${PP.TRIBES[id].name}</option>`).join('');
        return `<div class="slot">${crest(t.color, tribeIcon(sl.tribe), 'crest-s')}
          <select id="slot-tribe-${i}" data-slot="${i}" aria-label="Tribo do jogador ${i + 1}">${opts}</select>
          <div class="seg">${i === 0 ? '<button type="button" class="on" disabled>Você</button>' :
            `<button type="button" class="${sl.human ? '' : 'on'}" data-s="ai" data-i="${i}">IA</button><button type="button" class="${sl.human ? 'on' : ''}" data-s="human" data-i="${i}">Humano</button>
             <button type="button" data-s="del" data-i="${i}" aria-label="Remover jogador">✕</button>`}</div></div>`;
      }).join('');
      const seg = (key, entries) => `<div class="seg">${entries.map(([v, l]) => `<button type="button" class="${String(s[key]) === String(v) ? 'on' : ''}" data-s="set" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
      f.innerHTML = `
        <div class="setup-h"><h2>Nova campanha</h2><button type="button" class="icon-btn" data-s="back" aria-label="Voltar">✕</button></div>
        <div class="setup-b">
          <div class="field"><span class="lbl">Sua tribo</span><div class="tribes">${tribeCards}</div></div>
          <div class="field"><span class="lbl">Tribos na partida (${s.slots.length}) · humanos extras jogam no mesmo aparelho</span><div class="slots">${slots}</div>
            ${s.slots.length < 6 ? '<p><button type="button" class="chip-btn" data-s="add">+ Adicionar tribo</button></p>' : ''}</div>
          <div class="row2">
            <div class="field"><span class="lbl">Tamanho do mapa</span>${seg('size', Object.entries(PP.MAP_SIZES).map(([k, v]) => [k, v.split(' ')[0]]))}</div>
            <div class="field"><span class="lbl">Tipo de mapa</span>${seg('mapType', Object.entries(PP.MAP_TYPES).map(([k, v]) => [k, v.name]))}</div>
            <div class="field"><span class="lbl">Dificuldade da IA</span>${seg('difficulty', Object.entries(PP.DIFFICULTY).map(([k, v]) => [k, v.name]))}</div>
            <div class="field"><span class="lbl">Vitória</span>${seg('victory', [['dominacao', 'Dominação'], ['pontos30', 'Pontos · 30 turnos'], ['pontos50', 'Pontos · 50 turnos']])}</div>
          </div>
        </div>
        <div class="setup-f"><button type="button" class="btn ghost" data-s="back">Voltar</button><button type="submit" class="btn primary">Começar</button></div>`;
      f.onclick = e => {
        const b = e.target.closest('[data-s]');
        if (!b) return;
        const a = b.dataset.s;
        if (a === 'tribe') this.setSlotTribe(0, b.dataset.v);
        else if (a === 'ai' || a === 'human') s.slots[+b.dataset.i].human = a === 'human';
        else if (a === 'del') s.slots.splice(+b.dataset.i, 1);
        else if (a === 'add') { const free = PP.TRIBE_IDS.find(t => !s.slots.some(x => x.tribe === t)); if (free) s.slots.push({ tribe: free, human: false }); }
        else if (a === 'set') s[b.dataset.k] = b.dataset.k === 'size' ? +b.dataset.v : b.dataset.v;
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
      Object.assign(this.settings, { lastTribe: s.slots[0].tribe, lastSize: s.size, lastMap: s.mapType, lastDiff: s.difficulty, lastVictory: s.victory });
      this.applySettings();
      const g = new PP.Game().setup({ size: s.size, mapType: s.mapType, difficulty: s.difficulty, victory, turnLimit,
        players: s.slots.map(x => ({ tribe: x.tribe, human: x.human || x === s.slots[0] })) });
      this.attach(g, true);
    }

    continueSaved() {
      const saved = load(SAVE_KEY);
      if (!saved || !saved.game) { this.toast('Não há partida salva neste aparelho.', 'bad'); return; }
      try { this.attach(PP.Game.fromJSON(saved.game), false); }
      catch (e) { console.error(e); this.toast('Não foi possível carregar a partida salva.', 'bad'); }
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
        this.toast(`Turno ${g.turn} · +${inc.stars}★ · +${inc.sci}${SCI}`, 'gold');
      }
      if (fresh && !this.settings.seenHelp) { this.settings.seenHelp = true; this.applySettings(); this.openQuickStart(); }
      await this.showProposals();
      this.checkRewards();
    }

    async endTurn() {
      if (!this.myTurn()) return;
      if (this.me().pendingRewards.length) { this.checkRewards(); return; }
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
        $('#ai-banner-text').innerHTML = `${crest(p.color, tribeIcon(p.tribe), 'crest-xs')} Vez de ${esc(p.name)}`;
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
        d.innerHTML = `${crest(t.color, tribeIcon(p.tribe), 'crest-xl')}<h2>Vez de ${esc(p.name)}</h2><p class="note">Passe o aparelho. Turno ${this.game.turn}.</p><button type="button" class="btn primary">Estou pronto</button>`;
        d.querySelector('button').onclick = () => { d.remove(); res(); };
        document.body.appendChild(d);
      });
    }

    async showProposals() {
      const g = this.game, p = this.me();
      while (p.proposals.length && !g.over) {
        const pr = p.proposals[0];
        const from = g.players[pr.from];
        const ok = await this.ask('Proposta de paz',
          `<div class="ask-head">${crest(from.color, tribeIcon(from.tribe), 'crest-l')}<p><b>${esc(from.name)}</b> propõe um tratado de paz. Em paz, nenhum dos dois pode atacar o outro nem entrar nas cidades do outro. Quebrar um tratado mancha sua reputação com todas as tribos.</p></div>`,
          'Aceitar a paz', 'Recusar');
        g.respondProposal(p, pr.from, ok);
        this.toast(ok ? `Paz assinada com ${from.name}.` : `Você recusou a paz com ${from.name}.`, ok ? 'good' : '');
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
          if (d.player === v && g.current === v) this.toast(d.tech === 'future' ? `Tecnologia do Futuro ${this.me().future} concluída.` : `Nova tecnologia: ${PP.TECH[d.tech].name}`, 'good');
          break;
        case 'capture':
          if (d.from === v) this.toast(`Perdemos ${d.city.name} para ${g.players[d.unit.owner].name}!`, 'bad');
          else if (d.unit.owner === v) this.toast(d.from >= 0 ? `Conquistamos ${d.city.name}.` : `Fundamos ${d.city.name}.`, 'good');
          break;
        case 'meet':
          if (d.a === v || d.b === v) { const o = g.players[d.a === v ? d.b : d.a]; this.toast(`Contato com a tribo ${o.name}.`, 'gold'); }
          break;
        case 'diplomacy':
          if (d.a === v || d.b === v) {
            const o = g.players[d.a === v ? d.b : d.a];
            this.toast(d.type === 'peace' ? `Paz com ${o.name}.` : (d.a === v ? `Você declarou guerra a ${o.name}.` : `${o.name} declarou guerra a você!`), d.type === 'peace' ? 'good' : 'bad');
          }
          break;
        case 'proposal':
          if (d.to === v) $('#diplo-dot').hidden = false;
          break;
        case 'wonder':
          if (d.player !== v && this.me().met[d.player]) this.toast(`${g.players[d.player].name} ergueu ${PP.WONDERS[d.wonder].name}.`, '');
          else if (d.player === v) this.toast(`Maravilha concluída: ${PP.WONDERS[d.wonder].name}.`, 'good');
          break;
        case 'eliminated':
          if (d.player === v) this.toast('Sua tribo foi eliminada.', 'bad');
          else if (this.me().met[d.player]) this.toast(`A tribo ${g.players[d.player].name} foi eliminada.`, 'gold');
          break;
        case 'ruin':
          if (d.player === v) this.toast('Ruínas: ' + d.text.charAt(0).toUpperCase() + d.text.slice(1), 'gold');
          break;
        case 'connected':
          if (d.city.owner === v) this.toast(`${d.city.name} está conectada à capital (+1 de população nas duas).`, 'good');
          break;
        case 'veteran':
          if (d.unit.owner === v) this.toast(`${UN[d.unit.type].name} virou ${g.rank(d.unit) === 2 ? 'Elite' : 'Veterano'}. Escolha uma promoção.`, 'gold');
          break;
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
    }

    unitCanAct(u) {
      const g = this.game;
      if (u.fortified && !g.attackTargets(u).length) return false;
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
      if (u.owner === this.viewer || this.r.visibleTo(t.x, t.y)) return u;
      return null;
    }

    handleTap(t) {
      const g = this.game;
      if (!g || this.modals.length) return;
      const s = this.sel;
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
      this.sel = { tile: t, mode };
      this.confirmDisband = null;
      this.refreshSelection();
    }

    deselect() {
      this.sel = null;
      this.r.clearHighlights();
      this.hidePanel();
    }

    refreshSelection() {
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
          s.reach = g.reachable(u);
          r.hl.reach = new Set(s.reach.keys());
          r.hl.attack = g.attackTargets(u);
          r.hl.convert = g.convertTargets(u);
        }
      }
      r.dirty = true;
      this.renderPanel();
    }

    nextUnit() {
      if (!this.myTurn()) return;
      const g = this.game;
      const list = g.unitsOf(this.viewer).filter(u => this.unitCanAct(u));
      if (!list.length) { this.toast('Todas as unidades já agiram.', ''); return; }
      const curId = this.sel && this.sel.mode === 'unit' ? (this.visibleUnitAt(this.sel.tile) || {}).id : null;
      const i = list.findIndex(u => u.id === curId);
      const u = list[(i + 1) % list.length];
      this.select(g.tileAt(u), 'unit');
      this.r.centerOn(u.x, u.y, true);
    }

    afterAction() {
      if (!this.game) return;
      this.renderHud();
      if (this.sel) this.refreshSelection();
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
      this.openModal('reward', `<div class="modal-h"><div><h2>${esc(c.name)}</h2><div class="sub">A cidade chegou ao nível ${PP.roman(pr.level)}. Escolha uma recompensa.</div></div></div>
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
      if (!p.explored[idx]) html = this.head(ico('ui_fog'), 'Terras desconhecidas', 'Mova unidades para perto para revelar.', null);
      else if (s.mode === 'unit') html = this.unitPanel(this.visibleUnitAt(t));
      else html = this.tilePanel(t);
      panel.innerHTML = html;
      panel.hidden = false;
    }

    head(iconHtml, title, sub, color) {
      const badge = color ? iconHtml : `<div class="ph-ico">${iconHtml}</div>`;
      return `<div class="ph">${badge}
        <div class="ph-txt"><div class="ph-title">${title}</div><div class="ph-sub">${sub}</div></div>
        <button type="button" class="ph-x" data-a="close" aria-label="Fechar">✕</button></div>`;
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
      const rankTag = rank === 2 ? '<span class="tag gold">Elite</span>' : rank === 1 ? '<span class="tag gold">Veterano</span>' : '';
      const title = `${st.name} ${rankTag}`;
      const sub = `${esc(owner.name)}${st.naval ? ' · ' + UN[u.type].name + ' embarcado' : ''} · ${TER[g.tileAt(u).terrain].name}`;
      const bonus = g.defenseBonus(u);
      let html = this.head(crest(owner.color, unitIcon(g, u), 'crest-l'), title, sub, owner.color);
      const next = PP.XP_LEVELS.find(x => x > u.xp);
      html += `<div class="stats">
        ${this.stat('s_hp', `${u.hp}/${st.maxHp}`)}${this.stat('s_atk', fmt(st.atk))}
        ${this.stat('s_def', fmt(st.def), bonus !== 1 ? '×' + fmt(bonus) : '')}
        ${this.stat('s_move', (u.owner === this.viewer ? fmt(u.mp) + '/' : '') + st.move)}${this.stat('s_range', st.range)}
        ${this.stat(rank === 2 ? 's_xp2' : 's_xp', `XP ${u.xp}${next ? '/' + next : ''}`)}
        ${u.fortified ? this.stat('ui_fortify', 'Fortificado') : ''}</div>`;
      const skills = Object.keys(st.skills).map(k => PP.SKILL_NAMES[k]).filter(Boolean);
      const promos = u.promos.map(k => PP.PROMOTIONS[k].name);
      if (skills.length || promos.length) html += `<p class="note">${skills.join(' · ')}${promos.length ? `<br>Promoções: ${promos.join(', ')}` : ''}</p>`;
      if (UN[u.type].mounted && !st.naval) html += '<p class="note">Montado: não entra em montanhas; Piqueiros são fortes contra ele.</p>';

      if (u.owner === this.viewer && this.myTurn()) {
        const acts = [];
        if (g.canCapture(u)) {
          const t = g.tileAt(u);
          acts.push(this.act('capture', 'ui_capture', t.village ? 'Capturar aldeia' : 'Conquistar cidade', null, { hot: true }));
        }
        if (u.pendingPromo) acts.push(this.act('promote', 'ui_promote', 'Promover', null, { hot: true }));
        if (g.canHealOthers(u)) acts.push(this.act('healOthers', 'ui_heal', 'Curar aliados', null));
        if (g.canRecover(u)) acts.push(this.act('recover', 'ui_recover', 'Recuperar', null, { title: 'Cura e encerra o turno da unidade' }));
        if (g.canFortify(u)) acts.push(this.act('fortify', 'ui_fortify', 'Fortificar', null, { title: '+25% de defesa até mover' }));
        const t = g.tileAt(u);
        if (t.city || t.owner === this.viewer) acts.push(this.act('tileview', 'ui_view', t.city ? 'Ver cidade' : 'Ver casa', null));
        acts.push(this.act('disband', 'ui_disband', this.confirmDisband === u.id ? 'Confirmar' : 'Dissolver', null, { confirm: this.confirmDisband === u.id }));
        html += `<div class="sec-lbl">Ordens</div><div class="acts">${acts.join('')}</div>`;
        const targets = g.attackTargets(u);
        const conv = g.convertTargets(u);
        if (targets.length || conv.length) {
          html += '<div class="sec-lbl">Alvos · toque no mapa ou aqui</div><div class="targets">';
          for (const d of targets) {
            const r = g.previewAttack(u, d);
            const ds = g.stat(d);
            html += `<button type="button" class="target" data-a="attack" data-id="${d.id}">${crest(g.players[d.owner].color, unitIcon(g, d), 'crest-s')}
              <span class="tn">${ds.name} · ${esc(g.players[d.owner].name)} <small>(${d.hp} de vida)</small></span>
              <span class="tp">causa <span class="dmg">${r.dmg}</span>${r.kill ? ' · abate' : ''} · recebe <span class="ret">${r.ret}</span>${r.retKill ? ' · morre' : ''}</span></button>`;
          }
          for (const d of conv) html += `<button type="button" class="target" data-a="convert" data-id="${d.id}">${crest(g.players[d.owner].color, unitIcon(g, d), 'crest-s')}<span class="tn">Converter ${g.stat(d).name}</span><span class="tp">passa para o seu lado</span></button>`;
          html += '</div>';
        }
        if (u.mp > 0 && this.sel && this.sel.reach && this.sel.reach.size) html += '<p class="note">Toque numa casa marcada para mover.</p>';
        else if (!targets.length && !g.canCapture(u) && u.mp <= 0) html += '<p class="note">Esta unidade já agiu neste turno.</p>';
      } else if (u.owner !== this.viewer) {
        const rel = g.atWar(this.viewer, u.owner) ? '<span class="tag bad">Em guerra</span>' : '<span class="tag good">Em paz</span>';
        html += `<p class="note">${rel}</p>`;
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
        html += this.head(crest(co.color, c.capital ? 'ui_capital' : 'ui_city', 'crest-l'), `${esc(c.name)} <span class="tag">Nível ${PP.roman(c.level)}</span>`, `${esc(co.name)}${c.capital ? ' · Capital' : ''} · ${ter.name}`, co.color);
        const need = c.level + 1;
        html += `<div class="popbar" aria-label="População">${Array.from({ length: need }, (_, k) => `<i class="${k < c.pop ? 'on' : ''}"></i>`).join('')}</div>`;
        if (mine) {
          const inc = g.cityIncome(c);
          html += `<div class="stats"><span class="st gold">★ +${inc.stars}</span><span class="st sci">${SCI} +${inc.sci}</span>
            ${this.stat('s_pop', `${c.pop}/${need} p/ nível ${PP.roman(c.level + 1)}`)}${this.stat('s_atk', `${g.cityUnits(c).length}/${g.capacity(c)} unidades`)}
            ${c.buildings.walls ? this.stat('b_walls', 'Muralhas') : ''}${c.connected ? this.stat('a_road', 'Conectada') : ''}</div>`;
          if (this.myTurn()) {
            const acts = [];
            for (const type of PP.TRAINABLE) {
              const d = UN[type];
              const chk = g.trainCheck(p, c, type);
              if (chk.locked) continue;
              acts.push(this.act('train', 'u_' + type, d.name, d.cost + '★', { off: !chk.ok, reason: chk.ok ? '' : chk.reason, data: { type, city: c.id } }));
            }
            html += `<div class="sec-lbl">Recrutar</div><div class="acts">${acts.join('')}</div>`;
            html += `<div class="acts" style="margin-top:4px">${this.act('city', 'ui_city', 'Governar cidade', null, { data: { city: c.id } })}</div>`;
          }
        } else {
          const rel = g.atWar(this.viewer, c.owner) ? '<span class="tag bad">Em guerra</span>' : '<span class="tag good">Em paz</span>';
          html += `<p class="note">${rel} ${c.buildings.walls ? '· Muralhas (defesa ×3)' : '· defesa ×1,5 na cidade'}. Para conquistar, termine o turno com uma unidade sobre a cidade e use <b>Conquistar</b> no turno seguinte.</p>`;
        }
        return html;
      }
      if (t.village) {
        html += this.head(ico('ui_village'), 'Aldeia', 'Neutra · ' + ter.name, null);
        html += '<p class="note">Leve uma unidade até aqui. No turno seguinte, sem mover, use <b>Capturar aldeia</b> para fundar uma cidade.</p>';
        return html;
      }
      const parts = [ter.name];
      if (t.res) parts.push(PP.RESOURCES[t.res].name);
      if (t.imp) parts.push(PP.IMPROVEMENTS[t.imp].name);
      if (t.road) parts.push('Estrada');
      const iconKey = t.wonder ? 'w_' + t.wonder : t.imp ? 'i_' + t.imp : t.res ? 'r_' + t.res : t.ruin ? 'ui_ruins' : 'g_' + t.terrain;
      const title = t.wonder ? PP.WONDERS[t.wonder].name : t.ruin ? 'Ruínas' : parts[parts.length > 1 ? 1 : 0];
      const sub = (owner ? `Território de ${esc(owner.name)}` : 'Sem dono') + ' · ' + parts.join(' · ');
      html += this.head(ico(iconKey), title, sub, null);
      const info = [];
      if (ter.info) info.push(ter.info + '.');
      if (t.res && PP.RESOURCES[t.res].info) info.push(PP.RESOURCES[t.res].info + '.');
      if (t.ruin) info.push('Mova uma unidade até aqui para explorar e ganhar uma recompensa.');
      if (t.wonder) info.push(PP.WONDERS[t.wonder].desc + '.');
      if (t.imp === 'market') info.push(`Rende +${g.marketValue(t)}★ por turno (soma das serrarias, moinhos e forjas vizinhas).`);
      if (t.imp === 'gemmine' || t.imp === 'plantation') info.push('Rende +2★ por turno.');
      if (t.imp === 'mine') info.push('Fornece Ferro (Espadachim, Mosqueteiro, Canhão).');
      if (t.imp === 'pasture') info.push('Fornece Cavalos (Cavaleiro).');
      if (info.length) html += `<p class="note">${info.join(' ')}</p>`;
      if (this.myTurn()) {
        const acts = g.tileActions(p, t).filter(a => !(a.def.road && a.locked)).map(a => this.act('tile', actionIcon(a.def), a.def.name, a.cost + '★', {
          off: !a.ok && !a.locked, locked: a.locked, reason: a.ok ? '' : a.reason, data: { id: a.id }, title: this.actionHint(a.def),
        }));
        const won = g.wonderActions(p, t).map(w => this.act('wonder', 'w_' + w.id, w.def.name, w.cost + '★', { off: !w.ok, reason: w.ok ? '' : w.reason, data: { id: w.id }, title: w.def.desc }));
        if (acts.length || won.length) html += `<div class="sec-lbl">Construir</div><div class="acts">${acts.concat(won).join('')}</div>`;
        else if (t.owner === this.viewer && !t.imp && !t.res) html += '<p class="note">Nada para construir aqui com suas tecnologias atuais.</p>';
      }
      if (t.res && t.owner !== this.viewer) html += '<p class="note">Recursos só podem ser usados dentro do seu território.</p>';
      return html;
    }

    actionHint(a) {
      const bits = [];
      if (a.pop) bits.push(`+${a.pop} população`);
      if (a.adj) bits.push(`+${a.per} população por ${PP.IMPROVEMENTS[a.adj].name} vizinha`);
      if (a.gold) bits.push(`+${a.gold}★`);
      if (a.income) bits.push(`+${a.income}★ por turno`);
      if (a.road) bits.push('Movimento dobrado; conecta cidades');
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
        case 'tile': {
          const chk = g.tileActionCheck(p, this.sel.tile, d.id);
          if (!chk.ok) { this.toast(chk.reason || 'Indisponível', 'bad'); break; }
          g.doTileAction(p, this.sel.tile, d.id);
          this.afterAction();
          break;
        }
        case 'wonder': {
          const chk = g.wonderCheck(p, this.sel.tile, d.id);
          if (!chk.ok) { this.toast(chk.reason || 'Indisponível', 'bad'); break; }
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
      const body = m.el.querySelector('.modal-b');
      const scroll = body ? body.scrollTop : 0;
      m.el.querySelector('.modal').innerHTML = html;
      const nb = m.el.querySelector('.modal-b');
      if (nb) nb.scrollTop = scroll;
      return m.el;
    }

    ask(title, body, yes, no) {
      return new Promise(res => {
        this.askResolve = res;
        this.openModal('ask', `<div class="modal-h"><h2>${title}</h2></div><div class="modal-b">${body}</div>
          <div class="modal-f"><button type="button" class="btn ghost" data-m="ask" data-v="0">${no}</button><button type="button" class="btn primary" data-m="ask" data-v="1">${yes}</button></div>`, { narrow: true, lock: true });
      });
    }

    closeX() { return '<button type="button" class="icon-btn" data-m="close" aria-label="Fechar">✕</button>'; }

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
          if (!this.myTurn()) { this.toast('Espere a sua vez.', 'bad'); break; }
          const p = this.me();
          if (d.v === 'future') { if (!g.researchFuture(p)) this.toast('Ciência insuficiente.', 'bad'); }
          else {
            const st = g.techState(p, d.v);
            if (st === 'done') break;
            if (st === 'locked') { this.toast('Pesquise os pré-requisitos primeiro.', 'bad'); break; }
            const cost = g.techCost(p, d.v);
            if (p.science < cost) { this.toast(`Faltam ${cost - p.science}${SCI} para ${PP.TECH[d.v].name}.`, 'bad'); break; }
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
          this.r.centerOn(c.x, c.y, true);
          this.select(g.tile(c.x, c.y), 'tile');
          break;
        }
        case 'peace': {
          const res = g.proposePeace(this.viewer, +d.p);
          const o = g.players[+d.p];
          if (res === 'accepted') this.toast(`${o.name} aceitou a paz.`, 'good');
          else if (res === 'rejected') this.toast(`${o.name} recusou a paz.`, 'bad');
          else if (res === 'pending') this.toast(`Proposta enviada a ${o.name}.`, '');
          else if (res === 'wait') this.toast('Você já fez uma proposta neste turno.', 'bad');
          this.afterAction();
          this.openDiplomacy(true);
          break;
        }
        case 'war': {
          const o = g.players[+d.p];
          this.ask('Declarar guerra?', `<p>Quebrar a paz com <b>${esc(o.name)}</b> reduz sua reputação: as outras tribos vão confiar menos em você nas negociações.</p>`, 'Declarar guerra', 'Manter a paz').then(ok => {
            if (ok && g.declareWar(this.viewer, +d.p)) this.afterAction();
            this.openDiplomacy(true);
          });
          break;
        }
        case 'respond': {
          g.respondProposal(this.me(), +d.p, d.v === '1');
          this.afterAction();
          this.openDiplomacy(true);
          break;
        }
        case 'resume': this.closeModal('menu'); break;
        case 'speed': this.settings.speed = d.v; this.applySettings(); this.openGameMenu(true); break;
        case 'follow': this.settings.follow = !this.settings.follow; this.applySettings(); this.openGameMenu(true); break;
        case 'ash': this.settings.ash = !this.settings.ash; this.applySettings(); this.openGameMenu(true); break;
        case 'help': this.openHelp(); break;
        case 'quit':
          this.ask('Voltar ao menu?', '<p>A partida fica salva neste aparelho e pode ser continuada depois.</p>', 'Salvar e sair', 'Cancelar').then(ok => {
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
      }
    }

    // ---------------------------------------------------------- Promoção
    openPromote(u) {
      const cards = Object.entries(PP.PROMOTIONS).map(([k, pr]) =>
        `<button type="button" class="card big" data-m="promo" data-id="${u.id}" data-v="${k}">${ico('p_' + k, 'ci')}<span class="cn">${pr.name}</span><span class="cd">${pr.desc}</span></button>`).join('');
      this.openModal('promote', `<div class="modal-h"><div><h2>Promover ${UN[u.type].name}</h2><div class="sub">A promoção também cura a unidade por completo.</div></div>${this.closeX()}</div>
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
        const needs = d.needs ? ` · requer ${PP.STRATEGIC[d.needs].name}` : '';
        return `<button type="button" class="card ${chk.ok && my ? 'go' : ''} ${chk.locked ? 'locked' : ''}" data-m="train" data-city="${c.id}" data-v="${type}">
          <div class="card-row">${crest(p.color, 'u_' + type, 'crest-s')}<span class="cn">${d.name}</span></div>
          <span class="cc star">${d.cost}★</span>
          <span class="mini-stats"><span>${ico('s_hp')}${d.hp}</span><span>${ico('s_atk')}${fmt(d.atk)}</span><span>${ico('s_def')}${d.def}</span><span>${ico('s_move')}${d.move}</span><span>${ico('s_range')}${d.range}</span></span>
          <span class="cd">${d.skills.map(k => (PP.SKILL_NAMES[k] || '').split(' (')[0]).join(', ')}${needs}</span>
          ${chk.ok ? '' : `<span class="cr">${esc(chk.reason)}</span>`}</button>`;
      }).join('');
      const blds = PP.BUILDING_ORDER.map(id => {
        const b = PP.BUILDINGS[id];
        const chk = g.buildingCheck(p, c, id);
        return `<button type="button" class="card ${chk.ok && my ? 'go' : ''} ${chk.done ? 'done' : ''} ${chk.locked ? 'locked' : ''}" data-m="build" data-city="${c.id}" data-v="${id}">
          <div class="card-row">${ico('b_' + id, 'ci')}<span class="cn">${b.name}</span></div>
          <span class="cc star">${chk.done ? 'Construído' : chk.cost + '★'}</span><span class="cd">${b.desc}</span>
          ${!chk.ok && !chk.done ? `<span class="cr">${esc(chk.reason)}</span>` : ''}</button>`;
      }).join('');
      const bonus = [];
      if (c.workshop) bonus.push(`Oficina ×${c.workshop}`);
      if (c.academy) bonus.push(`Academia ×${c.academy}`);
      if (c.parks) bonus.push(`Parque ×${c.parks}`);
      if (c.radius > 1) bonus.push('Fronteiras expandidas');
      if (c.connected) bonus.push('Conectada à capital');
      const need = c.level + 1;
      const html = `<div class="modal-h">${crest(p.color, c.capital ? 'ui_capital' : 'ui_city', 'crest-l')}<div class="mh-t"><h2>${esc(c.name)}</h2><div class="sub">Nível ${PP.roman(c.level)} · ${c.pop}/${need} de população para o próximo nível</div></div>
        ${this.closeX()}</div>
        <div class="modal-b">
          <div class="popbar">${Array.from({ length: need }, (_, k) => `<i class="${k < c.pop ? 'on' : ''}"></i>`).join('')}</div>
          <div class="stats"><span class="st gold">★ +${inc.stars} por turno</span><span class="st sci">${SCI} +${inc.sci} por turno</span>
          ${this.stat('s_atk', `${g.cityUnits(c).length}/${g.capacity(c)} unidades`)}${this.stat('s_def', `defesa ×${fmt((c.buildings.walls ? 3 : 1.5) + (g.wonders.great_wall === c.owner ? 0.5 : 0))}`)}</div>
          ${bonus.length ? `<p class="note">${bonus.join(' · ')}</p>` : ''}
          <div class="sec-lbl">Recrutar${g.unitAt(c.x, c.y) ? ' · a cidade precisa estar desocupada' : ''}</div><div class="grid">${units}</div>
          <div class="sec-lbl">Construções</div><div class="grid">${blds}</div>
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
          <div class="rt"><div class="rn">${esc(c.name)} · nível ${PP.roman(c.level)}</div><div class="rs">★ +${inc.stars} · ${SCI} +${inc.sci} · ${g.cityUnits(c).length}/${g.capacity(c)} unidades · população ${c.pop}/${c.level + 1}</div></div>
          <div class="ra"><button type="button" class="chip-btn" data-m="goto" data-city="${c.id}">Ir até lá</button></div></div>`;
      }).join('');
      this.openModal('cities', `<div class="modal-h"><div><h2>Suas cidades</h2><div class="sub">${list.length} ${list.length === 1 ? 'cidade' : 'cidades'}</div></div>${this.closeX()}</div>
        <div class="modal-b"><div class="list">${rows || '<p class="note">Nenhuma cidade.</p>'}</div></div>`, { narrow: true });
    }

    // ---------------------------------------------------------- Tecnologia
    openTech(refresh) {
      if (!this.game) return;
      const g = this.game, p = this.me();
      const inc = g.income(p);
      let html = `<div class="modal-h"><div><h2>Tecnologias</h2><div class="sub"><b class="sci">${SCI} ${p.science}</b> disponíveis · +${inc.sci} por turno · o custo cresce com o número de cidades</div></div>
        ${this.closeX()}</div><div class="modal-b">`;
      for (let tier = 1; tier <= 4; tier++) {
        html += `<div class="era"><h3>${ERA[tier]}</h3><div class="grid">`;
        for (const t of PP.TECHS.filter(x => x.tier === tier)) {
          const st = g.techState(p, t.id);
          const cost = g.techCost(p, t.id);
          const can = st === 'available' && p.science >= cost;
          const req = t.req.length ? `Requer ${t.req.map(r => PP.TECH[r].name).join(' + ')}` : '';
          html += `<button type="button" class="card ${st === 'done' ? 'done' : ''} ${st === 'locked' ? 'locked' : ''} ${can ? 'go sci-go' : ''}" data-m="tech" data-v="${t.id}">
            <div class="card-row">${ico('t_' + t.id, 'ci')}<span class="cn">${t.name}</span></div>
            <span class="cc ${st === 'done' ? '' : 'sci'}">${st === 'done' ? 'Pesquisada' : cost + SCI}</span>
            <span class="cd">${t.desc}</span>${st === 'locked' ? `<span class="cr">${req}</span>` : ''}</button>`;
        }
        html += '</div></div>';
      }
      if (g.allTechs(p)) {
        const c = g.futureCost(p);
        html += `<div class="era"><h3>Além</h3><div class="grid"><button type="button" class="card ${p.science >= c ? 'go sci-go' : ''}" data-m="tech" data-v="future">
          <div class="card-row">${ico('t_future', 'ci')}<span class="cn">Tecnologia do Futuro ${(p.future || 0) + 1}</span></div>
          <span class="cc sci">${c}${SCI}</span><span class="cd">+120 pontos cada. Pode ser pesquisada várias vezes.</span></button></div></div>`;
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
      let rows = '';
      let unknown = 0;
      for (const o of g.players) {
        if (o.id === me.id) continue;
        if (!me.met[o.id]) { unknown++; continue; }
        const rel = me.rel[o.id];
        const war = rel.state === 'war';
        const ratio = g.strength(o.id) / Math.max(1, myS);
        const power = !o.alive ? 'eliminada' : ratio > 1.5 ? 'muito mais forte' : ratio > 1.1 ? 'mais forte' : ratio > 0.9 ? 'equilibrada' : ratio > 0.6 ? 'mais fraca' : 'muito mais fraca';
        const rep = o.reputation < 0 ? ` · reputação ${o.reputation <= -2 ? 'traiçoeira' : 'duvidosa'}` : '';
        const pending = me.proposals.some(pr => pr.from === o.id);
        let actions = '';
        if (o.alive && this.myTurn()) {
          if (pending) actions = `<button type="button" class="chip-btn" data-m="respond" data-p="${o.id}" data-v="1">Aceitar paz</button><button type="button" class="chip-btn" data-m="respond" data-p="${o.id}" data-v="0">Recusar</button>`;
          else if (war) actions = `<button type="button" class="chip-btn" data-m="peace" data-p="${o.id}">${ico('ui_peace')} Propor paz</button>`;
          else actions = `<button type="button" class="chip-btn danger" data-m="war" data-p="${o.id}">${ico('ui_war')} Declarar guerra</button>`;
        }
        rows += `<div class="row">${crest(o.color, tribeIcon(o.tribe), 'crest-m')}
          <div class="rt"><div class="rn">${esc(o.name)} ${o.alive ? (war ? '<span class="tag bad">Guerra</span>' : '<span class="tag good">Paz</span>') : '<span class="tag">Eliminada</span>'} ${pending ? '<span class="tag gold">Propõe paz</span>' : ''}</div>
          <div class="rs">${g.score(o)} pontos · ${g.citiesOf(o.id).length} cidades · força ${power}${rep}${!war && o.alive ? ` · desde o turno ${rel.since}` : ''}</div></div>
          <div class="ra">${actions}</div></div>`;
      }
      if (unknown) rows += `<div class="row"><span class="crest crest-m unknown">${ico('ui_unknown', 'crest-ico')}</span><div class="rt"><div class="rn">${unknown} tribo${unknown > 1 ? 's' : ''} ainda desconhecida${unknown > 1 ? 's' : ''}</div><div class="rs">Explore o mapa para fazer contato.</div></div></div>`;
      const html = `<div class="modal-h"><h2>Diplomacia</h2>${this.closeX()}</div>
        <div class="modal-b"><p class="note">Todas as tribos começam em guerra. A IA aceita a paz com mais facilidade quando está mais fraca, quando já guerreia em outra frente ou quando você tem boa reputação.${me.reputation < 0 ? ` <b>Sua reputação está manchada (${me.reputation}).</b>` : ''}</p>
        <div class="list" style="margin-top:10px">${rows}</div></div>`;
      if (refresh) this.replaceModal('diplo', html); else this.openModal('diplo', html, { narrow: true });
    }

    // ---------------------------------------------------------- Placar
    scoreRows(all) {
      const g = this.game, me = this.me();
      return g.players.filter(o => all || o.id === me.id || me.met[o.id]).sort((a, b) => g.score(b) - g.score(a)).map(o => `<tr>
        <td><span class="swatch" style="background:${o.color}"></span>${esc(o.name)}${o.id === me.id ? ' (você)' : ''}${o.alive ? '' : ' †'}</td>
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
      let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pontuação ao longo dos turnos">`;
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
      const html = `<div class="modal-h"><div><h2>Placar</h2><div class="sub">${g.opts.victory === 'pontos' ? `Vence quem tiver mais pontos no fim do turno ${g.opts.turnLimit}.` : 'Vitória por dominação: elimine todas as outras tribos.'}</div></div>
        ${this.closeX()}</div>
        <div class="modal-b"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tribo</th><th class="num">Pontos</th><th class="num">Cidades</th><th class="num">Unidades</th><th class="num">Tecn.</th><th class="num">Abates</th></tr></thead>
        <tbody>${this.scoreRows(this.r.viewer === -1)}</tbody></table></div>${this.scoreChart(this.r.viewer === -1)}
        <p class="note">Pontos vêm de cidades e seus níveis, território, tecnologias, exército, maravilhas, parques e exploração.</p></div>`;
      this.openModal('stats', html);
    }

    openLog() {
      if (!this.game) return;
      const g = this.game;
      const items = g.logs.filter(l => !l.to || l.to.indexOf(this.viewer) >= 0).slice(-60).reverse();
      const html = `<div class="modal-h"><h2>Crônica</h2>${this.closeX()}</div>
        <div class="modal-b"><div class="log-list">${items.map(l => `<div><em>T${l.turn}</em>${esc(l.text)}</div>`).join('') || '<p class="note">Nada ainda.</p>'}</div></div>`;
      this.openModal('log', html, { narrow: true });
    }

    // ---------------------------------------------------------- Menu da partida
    openGameMenu(refresh) {
      const sp = this.settings.speed;
      const html = `<div class="modal-h"><h2>Menu</h2>${this.closeX()}</div>
        <div class="modal-b" style="display:grid;gap:14px">
          <div class="field"><span class="lbl">Velocidade da IA</span><div class="seg">
            ${[['normal', 'Normal'], ['fast', 'Rápida'], ['instant', 'Instantânea']].map(([k, l]) => `<button type="button" class="${sp === k ? 'on' : ''}" data-m="speed" data-v="${k}">${l}</button>`).join('')}</div></div>
          <div class="field"><span class="lbl">Câmera e ambiente</span><div class="seg">
            <button type="button" class="${this.settings.follow ? 'on' : ''}" data-m="follow">Seguir ações da IA</button>
            <button type="button" class="${this.settings.ash ? 'on' : ''}" data-m="ash">Cinzas no ar</button></div></div>
          <p class="note">Partida: mapa ${this.game.W}×${this.game.H} · ${PP.MAP_TYPES[this.game.opts.mapType].name} · IA ${PP.DIFFICULTY[this.game.opts.difficulty].name}. O jogo salva sozinho a cada turno.</p>
          <p class="note">Atalhos: Enter encerra o turno · N próxima unidade · T tecnologia · D diplomacia · C cidades · roda do mouse ou pinça para zoom.</p>
        </div>
        <div class="modal-f"><button type="button" class="btn ghost" data-m="help">Como jogar</button><button type="button" class="btn ghost" data-m="quit">Sair para o menu</button><button type="button" class="btn primary" data-m="resume">Voltar ao jogo</button></div>`;
      if (refresh) this.replaceModal('menu', html); else this.openModal('menu', html, { narrow: true });
    }

    // ---------------------------------------------------------- Fim de jogo
    showGameOver() {
      const g = this.game;
      if (!g || this.modals.some(m => m.kind === 'gameover')) return;
      const w = g.players[g.winner];
      const humanWon = w && w.human;
      const title = humanWon ? (this.hotseat ? `Vitória de ${w.name}` : 'Vitória') : 'Derrota';
      const reason = { dominacao: 'por dominação', pontos: `por pontos no turno ${g.opts.turnLimit}`, derrota: 'sua tribo foi eliminada' }[g.endReason] || '';
      const sub = humanWon ? `${esc(w.name)} venceu ${reason}.` : g.endReason === 'derrota' ? `Sua tribo foi eliminada. ${w ? esc(w.name) + ' lidera o mundo.' : ''}` : `${w ? esc(w.name) : 'Ninguém'} venceu ${reason}.`;
      store(SAVE_KEY, null);
      this.openModal('gameover', `<div class="modal-h">${w ? crest(w.color, tribeIcon(w.tribe), 'crest-l') : ''}<div class="mh-t"><h2>${title}</h2><div class="sub">${sub} Turno ${g.turn}.</div></div></div>
        <div class="modal-b"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tribo</th><th class="num">Pontos</th><th class="num">Cidades</th><th class="num">Unidades</th><th class="num">Tecn.</th><th class="num">Abates</th></tr></thead>
        <tbody>${this.scoreRows(true)}</tbody></table></div>${this.scoreChart(true)}</div>
        <div class="modal-f"><button type="button" class="btn ghost" data-m="viewmap">Ver o mapa</button><button type="button" class="btn ghost" data-m="quit">Menu</button><button type="button" class="btn primary" data-m="newgame">Nova campanha</button></div>`, { lock: true });
    }

    // ---------------------------------------------------------- Ajuda
    openQuickStart() {
      this.openModal('quick', `<div class="modal-h"><h2>Primeiros passos</h2>${this.closeX()}</div>
        <div class="modal-b help">
          <ul>
            <li><b>Toque na sua unidade</b> para ver onde ela pode ir (casas marcadas) e quem pode atacar (anéis vermelhos).</li>
            <li><b>Aldeias</b> viram cidades: pare uma unidade em cima e use <b>Capturar</b> no turno seguinte.</li>
            <li><b>Toque em casas do seu território</b> para colher recursos e construir melhorias. Isso aumenta a população e sobe o nível das cidades.</li>
            <li><b>★ Estrelas</b> pagam unidades e construções. <b>${SCI} Ciência</b> paga tecnologias (botão Tecnologia, à esquerda).</li>
            <li>Quando terminar, toque em <b>Fim do turno</b>.</li>
          </ul>
        </div>
        <div class="modal-f"><button type="button" class="btn ghost" data-m="help">Regras completas</button><button type="button" class="btn primary" data-m="close">Jogar</button></div>`, { narrow: true });
    }

    openHelp() {
      const tribes = PP.TRIBE_IDS.map(id => `<li><b>${PP.TRIBES[id].name}</b>: ${esc(PP.TRIBES[id].perk)}</li>`).join('');
      const credits = (PP.ICON_CREDITS || []).join(', ');
      this.openModal('help', `<div class="modal-h"><h2>Como jogar</h2>${this.closeX()}</div>
        <div class="modal-b help">
          <h3>Objetivo</h3>
          <p>No modo <b>Dominação</b>, vença eliminando todas as outras tribos (uma tribo é eliminada ao perder todas as cidades). No modo <b>Pontos</b>, tenha a maior pontuação ao fim do turno limite.</p>
          <h3>Duas moedas</h3>
          <p><b>★ Estrelas</b> vêm do nível das cidades, oficinas, parques, bancos, garimpos, plantações, mercados e rotas comerciais. Pagam unidades, melhorias, construções e maravilhas.</p>
          <p><b>${SCI} Ciência</b> vem das cidades, bibliotecas, universidades e academias. Paga tecnologias, cujo custo aumenta com o número de cidades que você tem.</p>
          <h3>Cidades e população</h3>
          <p>Colher recursos e construir melhorias dá população à cidade dona da casa. Com população suficiente a cidade sobe de nível e você escolhe uma recompensa (oficina, academia, muralhas, crescimento, fronteiras, parque ou um Gigante). Cada cidade sustenta <b>nível + 1</b> unidades (+2 com Quartel).</p>
          <p>Melhorias em cadeia: Serraria ganha +1 por Cabana de lenhador vizinha, Moinho +1 por Fazenda vizinha, Forja +2 por Mina vizinha, e o Mercado rende ★ pela soma dessas três ao redor.</p>
          <h3>Combate</h3>
          <p>Força de ataque = ataque × vida atual/máxima. Força de defesa = defesa × vida atual/máxima × bônus. O dano causado é <code>ataque × 4,5 × (força de ataque / soma das forças)</code>. Se o defensor sobreviver e o atacante estiver no alcance dele, ele revida.</p>
          <ul>
            <li>Bônus de defesa: cidade ×1,5, muralhas ×3, floresta ×1,5 (com Arco e Flecha), montanha ×1,5 (com Escalada), colinas ×1,25, pântano ×0,8 e fortificação +25%.</li>
            <li>Piqueiros têm defesa ×2 e ataque ×1,5 contra unidades montadas. Montados não entram em montanhas.</li>
            <li>Abates dão XP. Com 3 XP a unidade vira <b>Veterana</b> e com 7 vira <b>Elite</b>; cada patente permite uma promoção (Força, Escudo, Vigor ou Agilidade).</li>
            <li>Zona de controle: entrar ao lado de um inimigo encerra o movimento.</li>
          </ul>
          <h3>Recursos estratégicos</h3>
          <p>Uma <b>Mina</b> em minério de ferro fornece <b>Ferro</b> (Espadachim, Mosqueteiro e Canhão). Um <b>Pasto</b> em cavalos fornece <b>Cavalos</b> (Cavaleiro). Sem eles, essas unidades não podem ser treinadas.</p>
          <h3>Mar</h3>
          <p>Com Navegação, construa um Porto: unidades que entram nele embarcam e viram Barcos. Cartografia libera o oceano e Navios; Engenharia Naval, Couraçados. Desembarcar em qualquer praia encerra o movimento.</p>
          <h3>Diplomacia</h3>
          <p>Todas as tribos começam em guerra. Proponha paz no painel Diplomacia; em paz, ninguém ataca ninguém nem entra nas cidades do outro. Quebrar um tratado reduz sua reputação e a IA passa a confiar menos em você.</p>
          <h3>Maravilhas</h3>
          <p>Cada maravilha só pode ser construída uma vez no mundo, numa casa vazia do seu território. Todas dão +3 de população à cidade e 500 pontos, além do efeito próprio.</p>
          <h3>Tribos</h3><ul>${tribes}</ul>
          <h3>Ruínas</h3>
          <p>Ruínas marcadas com <b>?</b> dão um prêmio aleatório para a primeira unidade que chegar: estrelas, ciência, tecnologia, um veterano, um mapa ou população.</p>
          <h3>Créditos</h3>
          <p>Ícones de <b>game-icons.net</b>, licença CC BY 3.0, por ${esc(credits)}.</p>
        </div>`, {});
    }
  }

  PP.UI = UI;
})(window.PP = window.PP || {});
