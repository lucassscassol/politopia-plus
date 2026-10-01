/* Chamas de Vardren — inicialização */
(function (PP) {
  'use strict';
  function start(data) {
    const ui = new PP.UI();
    PP.ui = ui;
    if (data && data.save) {
      try { ui.attach(PP.Game.fromJSON(data.save), false); return; } catch (e) { console.error(e); }
    }
    ui.showMenu();
  }
  // Preserva a partida quando a página é atualizada ao vivo (visualizador de Artifacts)
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ save: PP.ui && PP.ui.game && !PP.ui.game.over ? PP.ui.game.toJSON() : null }));
  if (hot && hot.ready) hot.ready(start);
  else start((hot && hot.data) || {});
})(window.PP);
