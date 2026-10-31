import { icon, isIconName, PROFILE_ICONS } from '../../../src/ui/icons';

describe('ícones', () => {
  it('monta o SVG com classe opcional', () => {
    expect(icon('back')).toContain('<svg class="ico" viewBox="0 0 24 24"');
    expect(icon('star', 'on')).toContain('class="ico on"');
  });

  it('reconhece nomes de ícones', () => {
    expect(isIconName('star')).toBe(true);
    expect(isIconName('inexistente')).toBe(false);
    expect(isIconName('')).toBe(false);
    expect(isIconName(undefined)).toBe(false);
  });

  it('todas as opções de foto de perfil existem', () => {
    expect(PROFILE_ICONS.filter(name => name !== '').every(isIconName)).toBe(true);
  });
});
