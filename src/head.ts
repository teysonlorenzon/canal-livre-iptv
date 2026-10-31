import { applyTheme, getTheme } from './core/theme';

/** Aplica o tema antes da página aparecer, para não piscar o tema errado. */
applyTheme(getTheme());
