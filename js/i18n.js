/* Chamas de Vardren — idiomas. O português é o texto-fonte: t('texto em português', valores) devolve a tradução
   do idioma ativo (ou o próprio texto, se faltar tradução). Variáveis entram como {nome}.
   Os textos das regras (unidades, tecnologias, construções...) são traduzidos aplicando sobre os objetos de dados
   uma camada por idioma (PP.I18N_DATA), guardando os originais para poder voltar ao português. */
(function (PP) {
  'use strict';

  PP.LANGS = { pt: 'Português', en: 'English', es: 'Español' };
  PP.LANG_LOCALE = { pt: 'pt-BR', en: 'en', es: 'es' };
  PP.lang = 'pt';
  PP.I18N = PP.I18N || {};
  PP.I18N_DATA = PP.I18N_DATA || {};

  PP.t = function (s, v) {
    let out = s;
    if (PP.lang !== 'pt') {
      const d = PP.I18N[PP.lang];
      if (d && d[s] != null) out = d[s];
    }
    if (v) out = String(out).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
    return out;
  };

  // Número com o separador decimal do idioma
  PP.num = function (n) {
    const s = (Math.round(n * 10) / 10).toString();
    return PP.lang === 'en' ? s : s.replace('.', ',');
  };

  // Escolhe singular ou plural (t(...) já aplicado pelo chamador)
  PP.plural = (n, one, many) => (Math.abs(n) === 1 ? one : many);

  // ---------------------------------------------------------------- Camada de dados
  const originals = {};
  function resolve(path) {
    const parts = path.split('.');
    let o = PP;
    for (let i = 0; i < parts.length - 1; i++) {
      o = o[parts[i]];
      if (o == null) return null;
    }
    return { obj: o, key: parts[parts.length - 1] };
  }

  PP.applyLanguage = function (lang) {
    if (!PP.LANGS[lang]) lang = 'pt';
    // guarda os textos originais (português) de todos os caminhos que algum idioma traduz
    for (const l in PP.I18N_DATA) {
      for (const path in PP.I18N_DATA[l]) {
        if (path in originals) continue;
        const r = resolve(path);
        if (r && r.obj && r.key in r.obj) originals[path] = r.obj[r.key];
      }
    }
    for (const path in originals) {
      const r = resolve(path);
      if (!r || !r.obj) continue;
      const tr = lang !== 'pt' && PP.I18N_DATA[lang] ? PP.I18N_DATA[lang][path] : undefined;
      r.obj[r.key] = tr != null ? tr : originals[path];
    }
    PP.lang = lang;
    return lang;
  };
})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));
