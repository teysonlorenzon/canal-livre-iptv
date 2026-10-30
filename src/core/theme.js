'use strict';
/**
 * Modo de tema escolhido pelo usuário.
 * @typedef {'auto'|'light'|'dark'} ModoTema
 */

/** @type {ModoTema[]} Ordem de alternância do botão de tema. */
const THEMES = ['auto', 'light', 'dark'];

/** @type {Record<ModoTema, {icon: string, label: string}>} Ícone e nome de cada modo. */
const THEME_INFO = {
  auto: { icon: '◐', label: 'Automático (sistema)' },
  light: { icon: '☀', label: 'Claro' },
  dark: { icon: '☾', label: 'Escuro' },
};

/**
 * Chave do tema do perfil ativo: `cl_theme` no Principal, `cl_theme@<perfil>` nos outros.
 * Usa o `localStorage` direto porque roda no `<head>`, antes de `store` existir.
 * @returns {string} Chave no `localStorage`.
 */
function themeStorageKey() {
  let profileId = 'main';
  try {
    profileId = JSON.parse(localStorage.getItem('cl_user')) || 'main';
  } catch {}
  return profileId === 'main' ? 'cl_theme' : 'cl_theme@' + profileId;
}

/**
 * Lê o modo de tema salvo do perfil ativo.
 * @returns {ModoTema} Modo salvo, ou `auto`.
 */
function getTheme() {
  try {
    const savedMode = JSON.parse(localStorage.getItem(themeStorageKey()));
    return THEMES.includes(savedMode) ? savedMode : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Aplica um modo de tema na página e atualiza o botão do topo, se já existir.
 * O botão usa o ícone de traço de `src/ui/icons.js`; antes dele carregar, usa o símbolo de texto.
 * @param {ModoTema} mode Modo a aplicar.
 * @returns {void}
 */
function applyTheme(mode) {
  if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = mode;
  const themeButton = document.getElementById('themeBtn');
  if (themeButton) {
    if (typeof icon === 'function') themeButton.innerHTML = icon({ auto: 'themeAuto', light: 'themeLight', dark: 'themeDark' }[mode]);
    else themeButton.textContent = THEME_INFO[mode].icon;
    themeButton.title = 'Tema: ' + THEME_INFO[mode].label;
    themeButton.setAttribute('aria-label', themeButton.title);
  }
}

/**
 * Passa para o próximo modo de tema, aplica e salva.
 * @returns {ModoTema} Novo modo.
 */
function cycleTheme() {
  const mode = THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length];
  try {
    localStorage.setItem(themeStorageKey(), JSON.stringify(mode));
  } catch {}
  applyTheme(mode);
  return mode;
}

applyTheme(getTheme());
