'use strict';
/**
 * Modo de tema escolhido pelo usuário.
 * @typedef {'auto'|'light'|'dark'} ModoTema
 */

/** @type {ModoTema[]} Ordem de alternância do botão de tema. */
const THEMES = ['auto', 'light', 'dark'];

/** @type {Record<ModoTema, {icon: string, label: string}>} Ícone e nome de cada modo. */
const THEME_INFO = {
  auto: { icon:'◐', label:'Automático (sistema)' },
  light: { icon:'☀', label:'Claro' },
  dark: { icon:'☾', label:'Escuro' }
};

/**
 * Lê o modo de tema salvo. Usa o `localStorage` direto porque roda no `<head>`,
 * antes de `store` existir.
 * @returns {ModoTema} Modo salvo, ou `auto`.
 */
function getTheme(){
  try { const t = JSON.parse(localStorage.getItem('cl_theme')); return THEMES.includes(t) ? t : 'auto'; } catch { return 'auto'; }
}

/**
 * Aplica um modo de tema na página e atualiza o botão do topo, se já existir.
 * @param {ModoTema} mode Modo a aplicar.
 * @returns {void}
 */
function applyTheme(mode){
  if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = mode;
  const b = document.getElementById('themeBtn');
  // Ícone de traço (src/ui/icons.js); antes dele carregar, usa o símbolo de texto.
  if (b) { if (typeof icon === 'function') b.innerHTML = icon({ auto:'themeAuto', light:'themeLight', dark:'themeDark' }[mode]); else b.textContent = THEME_INFO[mode].icon; b.title = 'Tema: ' + THEME_INFO[mode].label; b.setAttribute('aria-label', b.title); }
}

/**
 * Passa para o próximo modo de tema, aplica e salva.
 * @returns {ModoTema} Novo modo.
 */
function cycleTheme(){
  const mode = THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length];
  try { localStorage.setItem('cl_theme', JSON.stringify(mode)); } catch {}
  applyTheme(mode);
  return mode;
}

applyTheme(getTheme());
