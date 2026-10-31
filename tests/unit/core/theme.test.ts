import { applyTheme, cycleTheme, getTheme, THEME_INFO } from '../../../src/core/theme';
import { preparePage } from '../support/boot';

describe('tema', () => {
  beforeEach(() => preparePage());

  it('começa em automático', () => {
    expect(getTheme()).toBe('auto');
  });

  it('ignora valores inválidos', () => {
    localStorage.setItem('cl_theme', '"rosa"');
    expect(getTheme()).toBe('auto');
    localStorage.setItem('cl_theme', '{');
    expect(getTheme()).toBe('auto');
  });

  it('usa a chave do perfil ativo', () => {
    localStorage.setItem('cl_user', '"u1"');
    localStorage.setItem('cl_theme@u1', '"dark"');
    localStorage.setItem('cl_theme', '"light"');
    expect(getTheme()).toBe('dark');
  });

  it('o Principal usa a chave antiga', () => {
    localStorage.setItem('cl_user', '"main"');
    localStorage.setItem('cl_theme', '"light"');
    expect(getTheme()).toBe('light');
  });

  it('aplica o modo na página', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    applyTheme('auto');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('alterna automático → claro → escuro → automático e salva', () => {
    expect(cycleTheme()).toBe('light');
    expect(localStorage.getItem('cl_theme')).toBe('"light"');
    expect(cycleTheme()).toBe('dark');
    expect(cycleTheme()).toBe('auto');
  });

  it('continua funcionando sem armazenamento', () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cheio');
    });
    expect(cycleTheme()).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    setItem.mockRestore();
  });

  it('descreve cada modo', () => {
    expect(THEME_INFO.dark.label).toBe('Escuro');
  });
});
