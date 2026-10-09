/* Chamas de Vardren — som na interface: liga os eventos da partida aos efeitos de js/audio.js (no tempo das animações,
   com pan pela posição na tela e só para o que o jogador enxerga), toca cliques, seleção, sino do turno e fanfarras,
   e guarda o volume dos efeitos e da música nas opções. Estende PP.UI. */
(function (PP) {
  'use strict';
  const UN = PP.UNITS;
  // Desligado, Baixo, Médio, Alto
  PP.SFX_LEVELS = [0, 0.35, 0.7, 1];
  PP.MUSIC_LEVELS = [0, 0.22, 0.42, 0.65];
  const LEVEL_NAMES = () => [PP.t('Desligado'), PP.t('Baixo'), PP.t('Médio'), PP.t('Alto')];
  const SIEGE = { catapult: 1, cannon: 1, mortar: 1 };
  const GUNS = { cannon: 1, mortar: 1, frigate: 1, ironclad: 1 };
  const SHOTS = { musketeer: 1, dragoon: 1 };
  const ABILITY_SFX = { charge: 'horn', aim: 'creak', bombard: 'creak', taunt: 'clank', phalanx: 'clank', bless: 'heal', recon: 'horn', broadside: 'cannon' };

  const proto = PP.UI.prototype;

  Object.assign(proto, {
    // Pan e volume pela posição da casa na tela (fora da tela soa mais baixo)
    soundAt(name, x, y, o) {
      const a = PP.audio;
      if (!a) return;
      o = o || {};
      let pan = 0, gain = o.gain == null ? 1 : o.gain;
      const r = this.r;
      if (x != null && r && r.game) {
        const s = r.tileScreen(x, y);
        pan = PP.clamp((s.x / Math.max(1, r.w)) * 2 - 1, -1, 1) * 0.6;
        if (s.x < -40 || s.x > r.w + 40 || s.y < -40 || s.y > r.h + 40) gain *= 0.55;
      }
      a.play(name, { pan, gain, delay: o.delay || 0, rate: o.rate });
    },

    // IA em velocidade instantânea ou pulando turnos: só o essencial, sem passos
    soundQuiet() { return !this.r || this.r.speed <= 0 || this.fastForward; },

    moveSound(g, u, at) {
      const t = g.tile(at.x, at.y);
      if (UN[u.type].naval || (t && PP.TERRAIN[t.terrain] && PP.TERRAIN[t.terrain].water)) return 'oars';
      if (UN[u.type].mounted) return 'hooves';
      if (SIEGE[u.type]) return 'creak';
      return 'step';
    },

    soundAttack(g, d) {
      const r = this.r, v = this.viewer;
      if (!(r.visibleTo(d.from.x, d.from.y) || r.visibleTo(d.to.x, d.to.y))) return;
      const a = d.attacker, mine = a.owner === v || d.defender.owner === v;
      if (mine && PP.audio) PP.audio.combat();
      const quiet = this.soundQuiet() && a.owner !== v;
      const dur = r.dur(280), hitAt = dur * 0.5;
      const fromW = g.tile(d.from.x, d.from.y), water = fromW && PP.TERRAIN[fromW.terrain] && PP.TERRAIN[fromW.terrain].water;
      const type = a.type, far = Math.max(Math.abs(d.from.x - d.to.x), Math.abs(d.from.y - d.to.y)) > 1;
      const gain = mine ? 1 : 0.8;
      let launch = null, impact = 'sword', impactGain = gain;
      if (type === 'catapult') { launch = 'catapult'; impact = 'crash'; }
      else if (GUNS[type]) { launch = 'cannon'; impact = 'crash'; impactGain = gain * 0.55; }
      else if (SHOTS[type]) { launch = 'musket'; impact = 'hit'; }
      else if (type === 'archer' || far || (water && !UN[type].naval)) { launch = 'bow'; impact = 'hit'; }
      else if (type === 'giant') { impact = 'crash'; }
      if (launch && !quiet) this.soundAt(launch, d.from.x, d.from.y, { gain });
      else if (launch && quiet) { this.soundAt(launch, d.from.x, d.from.y, { gain }); return; }
      if (!launch && UN[type].mounted && !quiet) this.soundAt('hooves', d.from.x, d.from.y, { gain: gain * 0.5, rate: 1.15 });
      this.soundAt(impact, d.to.x, d.to.y, { gain: impactGain, delay: hitAt });
      if (quiet) return;
      if (d.killed) this.soundAt('death', d.to.x, d.to.y, { gain, delay: hitAt + 40 });
      else if (d.ret) this.soundAt(far ? 'hit' : 'sword', d.from.x, d.from.y, { gain: gain * 0.6, delay: dur * 0.8, rate: 0.92 });
      if (d.attackerKilled) this.soundAt('death', d.from.x, d.from.y, { gain, delay: dur });
      if (d.splash && d.splash.length) this.soundAt('crash', d.to.x, d.to.y, { gain: gain * 0.5, delay: hitAt + 60 });
    },

    // Evento da partida → som
    soundEvent(type, d) {
      const g = this.game, r = this.r;
      if (!g || !PP.audio) return;
      const v = this.viewer, me = g.players[v];
      const vis = (x, y) => r.visibleTo(x, y);
      switch (type) {
        case 'move': {
          if (this.soundQuiet() && d.unit.owner !== v) return;
          const pts = [d.from].concat(d.path);
          if (d.unit.owner !== v && !pts.some(p => vis(p.x, p.y))) return;
          const at = d.path[0] || d.from, snd = this.moveSound(g, d.unit, at);
          this.soundAt(snd, at.x, at.y, { gain: d.unit.owner === v ? 1 : 0.7 });
          if (d.board) this.soundAt('splash', at.x, at.y, { gain: 0.7, delay: 150 });
          const step = r.dur(d.unit.owner === v ? 120 : 160);
          if (pts.length > 3 && step > 0) { const mid = pts[Math.floor(pts.length / 2)]; this.soundAt(this.moveSound(g, d.unit, mid), mid.x, mid.y, { gain: 0.8, delay: step * (pts.length - 1) / 2 }); }
          break;
        }
        case 'unload':
          if (d.unit.owner === v) this.soundAt('splash', d.unit.x, d.unit.y, { gain: 0.6 });
          break;
        case 'attack':
          this.soundAttack(g, d);
          break;
        case 'ability':
          if (vis(d.unit.x, d.unit.y) && (d.unit.owner === v || !(g.isStealthed && g.isStealthed(d.unit)))) {
            this.soundAt(ABILITY_SFX[d.ability] || 'horn', d.unit.x, d.unit.y);
            if (d.hits && d.hits.some(h => h.unit.dead)) this.soundAt('death', d.unit.x, d.unit.y, { delay: 200 });
          }
          break;
        case 'train':
          if (d.unit.owner === v) this.soundAt(UN[d.unit.type].naval ? 'splash' : 'recruit', d.unit.x, d.unit.y);
          break;
        case 'capture':
          if (!vis(d.city.x, d.city.y) && d.from !== v) return;
          if (d.from === v) this.soundAt('lost', d.city.x, d.city.y);
          else if (d.from < 0) { if (d.unit.owner === v) this.soundAt('found', d.city.x, d.city.y); }
          else this.soundAt('capture', d.city.x, d.city.y, { gain: d.unit.owner === v ? 1 : 0.6 });
          break;
        case 'fortTaken':
          if (d.to === v || d.from === v) this.soundAt(d.to === v ? 'horn' : 'error', d.tile.x, d.tile.y);
          break;
        case 'levelup':
          if (d.city.owner === v) this.soundAt('levelup', d.city.x, d.city.y);
          break;
        case 'pop':
          if (d.city.owner === v) this.soundAt('pop', d.city.x, d.city.y);
          break;
        case 'build':
          if (d.player === v) this.soundAt('build', d.tile.x, d.tile.y);
          break;
        case 'building':
          if (d.player === v) this.soundAt('building', d.city.x, d.city.y);
          break;
        case 'wonder':
          if (d.player === v) this.soundAt('wonder', d.tile.x, d.tile.y);
          else if (me && me.met[d.player]) this.soundAt('gong', null, null, { gain: 0.6 });
          break;
        case 'tech':
          if (d.player === v) this.soundAt('tech');
          break;
        case 'project':
          if (d.player === v) this.soundAt('tech');
          break;
        case 'heal':
          if (d.units.some(h => h.amount > 0 && h.unit.owner === v)) { const u = d.healer || d.units[0].unit; this.soundAt('heal', u.x, u.y); }
          break;
        case 'convert':
          if (vis(d.target.x, d.target.y)) this.soundAt('convert', d.target.x, d.target.y);
          break;
        case 'fortify':
          if (d.unit.owner === v) this.soundAt('clank', d.unit.x, d.unit.y);
          break;
        case 'veteran':
          if (d.unit.owner === v) this.soundAt('promote', d.unit.x, d.unit.y);
          break;
        case 'ruin':
          if (d.player === v) this.soundAt('ruin', d.tile.x, d.tile.y);
          break;
        case 'pillage':
          if (vis(d.tile.x, d.tile.y) || d.victim === v) this.soundAt('pillage', d.tile.x, d.tile.y);
          break;
        case 'spy':
          if (d.unit.owner === v) this.soundAt(d.caught ? 'error' : 'spy', d.unit.x, d.unit.y);
          else if (d.victim === v && d.caught) this.soundAt('clank', d.unit.x, d.unit.y);
          break;
        case 'route':
          if (!d.cancelled && (d.route.owner === v || d.route.partner === v)) this.soundAt('coin');
          break;
        case 'connected':
          if (d.city.owner === v) this.soundAt('coin', d.city.x, d.city.y);
          break;
        case 'diplomacy':
          if (d.a !== v && d.b !== v) return;
          if (d.type === 'war') { this.soundAt('war'); if (PP.audio) PP.audio.combat(); }
          else if (d.type === 'peace' || d.type === 'nap' || d.type === 'alliance' || d.type === 'trade') this.soundAt('peace');
          else if (d.type === 'tribute') this.soundAt('coin');
          else if (d.type === 'left' || (d.type === 'rejected' && d.b === v) || (d.type === 'tribute_refused' && d.b === v)) this.soundAt('error');
          break;
        case 'proposal':
          if (d.to === v) this.soundAt('seal');
          break;
        case 'meet':
          if (d.a === v || d.b === v) this.soundAt('meet');
          break;
        case 'worldEvent':
          if (d.phase === 'start') this.soundAt('gong');
          break;
        case 'revolt':
          if (d.from === v || d.to === v) this.soundAt(d.to === v && d.from !== v ? 'capture' : 'lost', d.city.x, d.city.y);
          break;
        case 'achievement':
          if (d.player === v) this.soundAt('achievement');
          break;
        case 'character':
          if (d.player === v) this.soundAt(d.type === 'new' ? 'promote' : 'death');
          break;
        case 'turnStart': {
          const p = g.players[d.player];
          if (p && p.human && (this.hotseat || d.player === v)) this.soundAt('turn', null, null, { delay: 250 });
          break;
        }
        case 'eliminated':
          if (d.player !== v && me && me.met[d.player]) this.soundAt('gong', null, null, { gain: 0.7 });
          break;
        // governo, tesouro e vassalos (js/government.js e js/vassals.js)
        case 'gov':
          if (d.player === v && d.type === 'change') this.soundAt(d.gov === 'imperio' ? 'wonder' : 'seal');
          else if (d.player === v && d.type === 'stable') this.soundAt('promote');
          else if (d.type === 'change' && d.gov === 'imperio' && me && me.met[d.player]) this.soundAt('gong', null, null, { gain: 0.7 });
          break;
        case 'loan':
          if (d.player !== v) break;
          this.soundAt(d.type === 'bankrupt' ? 'lost' : d.type === 'missed' ? 'error' : 'coin');
          break;
        case 'vassal':
          if (d.type === 'new' || d.type === 'annexed') {
            if (d.overlord === v) this.soundAt(d.type === 'annexed' ? 'wonder' : 'capture');
            else if (d.vassal === v) this.soundAt('lost');
          } else if (d.type === 'released' && d.vassal === v) this.soundAt('peace');
          break;
        case 'terms':
          if (d.winner === v || d.loser === v) this.soundAt('seal', null, null, { delay: 350 });
          break;
        case 'cession':
          if (d.to === v || d.from === v) this.soundAt(d.to === v ? 'capture' : 'lost', d.city.x, d.city.y);
          break;
      }
    },

    // ---------------------------------------------------------- Opções
    applySound() {
      const s = this.settings;
      if (s.sfxLevel == null) s.sfxLevel = 2;
      if (s.musicLevel == null) s.musicLevel = 2;
      if (PP.audio) {
        PP.audio.musicWanted = true;
        PP.audio.setVolumes(PP.SFX_LEVELS[s.sfxLevel] || 0, PP.MUSIC_LEVELS[s.musicLevel] || 0);
      }
    },

    // Campo "Som" do Menu da partida
    soundField() {
      const s = this.settings, names = LEVEL_NAMES();
      const row = (key, lvl) => names.map((n, i) => `<button type="button" class="${lvl === i ? 'on' : ''}" data-m="${key}" data-v="${i}">${n}</button>`).join('');
      return `<div class="field"><span class="lbl">${PP.t('Efeitos sonoros')}</span><div class="seg">${row('sfx', s.sfxLevel)}</div></div>
          <div class="field"><span class="lbl">${PP.t('Música')}</span><div class="seg">${row('music', s.musicLevel)}</div></div>`;
    },

    // Liga/desliga no menu principal
    renderSoundPicker() {
      const box = document.getElementById('m-sound');
      if (!box) return;
      const s = this.settings;
      box.innerHTML = `<button type="button" class="${s.sfxLevel ? 'on' : ''}" data-snd="sfx" aria-pressed="${!!s.sfxLevel}">${PP.t('Efeitos')}</button>`
        + `<button type="button" class="${s.musicLevel ? 'on' : ''}" data-snd="music" aria-pressed="${!!s.musicLevel}">${PP.t('Música')}</button>`;
    },

    toggleSound(key) {
      const s = this.settings, k = key === 'music' ? 'musicLevel' : 'sfxLevel', last = key === 'music' ? 'lastMusicLevel' : 'lastSfxLevel';
      if (s[k]) { s[last] = s[k]; s[k] = 0; } else s[k] = s[last] || 2;
      this.applySettings();
      this.renderSoundPicker();
    },
  });

  // ---------------------------------------------------------- Ganchos nos métodos existentes
  const chain = (name, fn) => { const prev = proto[name]; proto[name] = function (...args) { return fn.call(this, prev, ...args); }; };

  chain('applySettings', function (prev, ...args) { const r = prev.apply(this, args); this.applySound(); return r; });

  chain('onGameEvent', function (prev, type, d) {
    try { this.soundEvent(type, d); } catch (e) { console.error(e); }
    return prev.call(this, type, d);
  });

  chain('bindHud', function (prev, ...args) {
    const r = prev.apply(this, args);
    const box = document.getElementById('m-sound');
    if (box) {
      box.onclick = e => { const b = e.target.closest('[data-snd]'); if (b) this.toggleSound(b.dataset.snd); };
      this.renderSoundPicker();
    }
    // clique de botão (o som do próprio efeito, quando houver, toca por cima)
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('button');
      if (b && !b.disabled && PP.audio) PP.audio.play('click');
    }, true);
    return r;
  });

  chain('setLang', function (prev, ...args) { const r = prev.apply(this, args); this.renderSoundPicker(); return r; });

  chain('openModal', function (prev, kind, html, opts) {
    if (PP.audio && kind !== 'gameover') PP.audio.play('open');
    return prev.call(this, kind, html, opts);
  });

  chain('select', function (prev, t, mode) {
    const before = this.sel && this.sel.tile;
    const r = prev.call(this, t, mode);
    const g = this.game;
    if (g && t && before !== t) {
      const u = mode === 'unit' ? g.unitAt(t.x, t.y) : null;
      if (u && u.owner === this.viewer) this.soundAt('select', t.x, t.y);
      else if (mode !== 'unit') { const c = g.cityAt(t.x, t.y); if (c && c.owner === this.viewer) this.soundAt('selectCity', t.x, t.y); }
    }
    return r;
  });

  chain('endTurn', function (prev, ...args) {
    const p = this.game && this.myTurn() && this.me();
    const ends = p && !p.pendingRewards.length && !p.pendingRuin;
    const r = prev.apply(this, args);
    if (ends) this.soundAt('endTurn');
    return r;
  });

  chain('showGameOver', function (prev, ...args) {
    const g = this.game;
    const first = g && !this.modals.some(m => m.kind === 'gameover');
    const r = prev.apply(this, args);
    if (first && PP.audio) {
      const w = g.players[g.winner];
      PP.audio.play(w && w.human ? 'victory' : 'defeat');
    }
    return r;
  });

  chain('modalActionExt', function (prev, a, d, btn) {
    if (a === 'sfx' || a === 'music') {
      this.settings[a === 'sfx' ? 'sfxLevel' : 'musicLevel'] = PP.clamp(+d.v || 0, 0, 3);
      this.applySettings();
      this.openGameMenu(true);
      this.renderSoundPicker();
      if (a === 'sfx' && PP.audio) setTimeout(() => PP.audio.play('select'), 30);
      return;
    }
    if (prev) prev.call(this, a, d, btn);
  });
})(window.PP = window.PP || {});
