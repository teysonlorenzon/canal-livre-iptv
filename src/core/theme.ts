import type { IconName } from '../ui/icons';

/** Modo de tema escolhido pelo usuário. */
export type ThemeMode = 'auto' | 'light' | 'dark';

/** Ordem de alternância do botão de tema. */
const THEMES: ThemeMode[] = ['auto', 'light', 'dark'];

/** Ícone e nome de cada modo. */
export const THEME_INFO: Record<ThemeMode, { icon: IconName; label: string }> = {
  auto: { icon: 'themeAuto', label: 'Automático (sistema)' },
  light: { icon: 'themeLight', label: 'Claro' },
  dark: { icon: 'themeDark', label: 'Escuro' },
};

/**
 * Lê um valor JSON direto do `localStorage`: este arquivo roda no `<head>`, sem o resto do app.
 * @param storageKey Chave no `localStorage`.
 * @returns Valor salvo, ou `null` se não houver ou for inválido.
 */
function readSavedValue(storageKey: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? 'null');
  } catch {
    return null;
  }
}

/**
 * Chave do tema do perfil ativo: `cl_theme` no Principal, `cl_theme@<perfil>` nos outros.
 * @returns Chave no `localStorage`.
 */
function themeStorageKey(): string {
  const savedProfileId = readSavedValue('cl_user');
  const profileId = typeof savedProfileId === 'string' && savedProfileId ? savedProfileId : 'main';
  return profileId === 'main' ? 'cl_theme' : 'cl_theme@' + profileId;
}

/**
 * Lê o modo de tema salvo do perfil ativo.
 * @returns Modo salvo, ou `auto`.
 */
export function getTheme(): ThemeMode {
  const savedMode = readSavedValue(themeStorageKey());
  return THEMES.find(mode => mode === savedMode) ?? 'auto';
}

/**
 * Aplica um modo de tema na página.
 * @param mode Modo a aplicar.
 */
export function applyTheme(mode: ThemeMode): void {
  if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = mode;
}

/**
 * Passa para o próximo modo de tema, aplica e salva.
 * @returns Novo modo.
 */
export function cycleTheme(): ThemeMode {
  const mode = THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length] ?? 'auto';
  try {
    localStorage.setItem(themeStorageKey(), JSON.stringify(mode));
  } catch {}
  applyTheme(mode);
  return mode;
}
