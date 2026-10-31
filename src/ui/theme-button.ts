import { $ } from '../core/dom';
import { applyTheme, getTheme, THEME_INFO, type ThemeMode } from '../core/theme';
import { icon } from './icons';

/**
 * Aplica um modo de tema e atualiza o botão do topo.
 * @param mode Modo a mostrar.
 */
export function showThemeMode(mode: ThemeMode): void {
  const themeButton = $('themeBtn');
  applyTheme(mode);
  themeButton.innerHTML = icon(THEME_INFO[mode].icon);
  themeButton.title = 'Tema: ' + THEME_INFO[mode].label;
  themeButton.setAttribute('aria-label', themeButton.title);
}

/**
 * Aplica o tema salvo do perfil ativo.
 */
export const showSavedTheme = (): void => showThemeMode(getTheme());
