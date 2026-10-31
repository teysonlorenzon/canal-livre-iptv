import { element, preparePage } from '../support/boot';

const OPTIONS = [
  { value: '', label: 'Ordem da lista' },
  { value: 'az', label: 'A → Z' },
  { value: 'za', label: 'Z → A' },
  { value: 'new', label: 'Mais recentes' },
];

describe('seletor personalizado', () => {
  let dropdown: typeof import('../../../src/ui/dropdown');
  let onChange: jest.Mock;

  beforeEach(async () => {
    preparePage();
    dropdown = await import('../../../src/ui/dropdown');
    document.body.innerHTML = `<button id="fora">Fora</button>${dropdown.dropdownHtml('ord', 'Ordenar', OPTIONS)}`;
    onChange = jest.fn();
    dropdown.initDropdown(element('#ord'), onChange);
  });

  const press = (target: Element, key: string): KeyboardEvent => {
    const keyEvent = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    target.dispatchEvent(keyEvent);
    return keyEvent;
  };

  it('começa na primeira opção, com nome acessível que diz o valor', () => {
    expect(dropdown.dropdownValue(element('#ord'))).toBe('');
    expect(element('#ord .dd-btn').getAttribute('aria-label')).toBe('Ordenar: Ordem da lista');
    expect(element('#ordMenu').getAttribute('role')).toBe('listbox');
    expect(element('#ordMenu').hidden).toBe(true);
  });

  it('abre pelo clique, foca a opção escolhida e fecha ao escolher outra', () => {
    element('#ord .dd-btn').click();
    expect(element('#ordMenu').hidden).toBe(false);
    expect(element('#ord .dd-btn').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(element('#ordMenu li'));
    element('#ordMenu [data-value=za]').click();
    expect(onChange).toHaveBeenCalledWith('za');
    expect(dropdown.dropdownValue(element('#ord'))).toBe('za');
    expect(element('#ord .dd-btn span').textContent).toBe('Z → A');
    expect(element('#ord .dd-btn').getAttribute('aria-label')).toBe('Ordenar: Z → A');
    expect(element('#ordMenu [data-value=za]').getAttribute('aria-selected')).toBe('true');
    expect(element('#ordMenu').hidden).toBe(true);
    expect(document.activeElement).toBe(element('#ord .dd-btn'));
  });

  it('escolher a opção que já estava escolhida não avisa ninguém', () => {
    element('#ord .dd-btn').click();
    element('#ordMenu [data-value=""]').click();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clicar no botão com a lista aberta fecha', () => {
    element('#ord .dd-btn').click();
    element('#ord .dd-btn').click();
    expect(element('#ordMenu').hidden).toBe(true);
  });

  it('abre pelo teclado com setas e Espaço, e ignora outras teclas', () => {
    const button = element('#ord .dd-btn');
    expect(press(button, 'a').defaultPrevented).toBe(false);
    expect(element('#ordMenu').hidden).toBe(true);
    for (const key of ['ArrowDown', 'ArrowUp', ' ']) {
      element('#ordMenu').hidden = true;
      expect(press(button, key).defaultPrevented).toBe(true);
      expect(element('#ordMenu').hidden).toBe(false);
    }
  });

  it('navega com setas, Home e End, circulando, e escolhe com Enter e Espaço', () => {
    element('#ord .dd-btn').click();
    const menu = element('#ordMenu');
    press(menu, 'ArrowDown');
    expect(document.activeElement).toBe(element('#ordMenu [data-value=az]'));
    press(menu, 'ArrowUp');
    press(menu, 'ArrowUp');
    expect(document.activeElement).toBe(element('#ordMenu [data-value=new]'));
    press(menu, 'Home');
    expect(document.activeElement).toBe(element('#ordMenu [data-value=""]'));
    press(menu, 'End');
    expect(document.activeElement).toBe(element('#ordMenu [data-value=new]'));
    press(menu, 'Enter');
    expect(onChange).toHaveBeenLastCalledWith('new');
    element('#ord .dd-btn').click();
    press(menu, 'ArrowUp');
    press(menu, ' ');
    expect(onChange).toHaveBeenLastCalledWith('za');
  });

  it('Enter sem nenhuma opção focada não escolhe nada', () => {
    element('#ord .dd-btn').click();
    (document.activeElement as HTMLElement).blur();
    press(element('#ordMenu'), 'Enter');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Esc fecha e devolve o foco ao botão; Tab só fecha', () => {
    element('#ord .dd-btn').click();
    const escape = press(element('#ordMenu'), 'Escape');
    expect(escape.defaultPrevented).toBe(true);
    expect(element('#ordMenu').hidden).toBe(true);
    expect(document.activeElement).toBe(element('#ord .dd-btn'));
    element('#ord .dd-btn').click();
    press(element('#ordMenu'), 'Tab');
    expect(element('#ordMenu').hidden).toBe(true);
  });

  it('clicar fora fecha, mas clicar dentro não', () => {
    element('#ord .dd-btn').click();
    element('#ordMenu').click();
    expect(element('#ordMenu').hidden).toBe(false);
    element('#fora').click();
    expect(element('#ordMenu').hidden).toBe(true);
    element('#fora').click();
    expect(element('#ordMenu').hidden).toBe(true);
  });

  it('opções escondidas ficam fora da navegação e voltam a aparecer', () => {
    dropdown.setDropdownOptionsHidden(element('#ord'), ['az'], true);
    element('#ord .dd-btn').click();
    press(element('#ordMenu'), 'ArrowDown');
    expect(document.activeElement).toBe(element('#ordMenu [data-value=za]'));
    dropdown.setDropdownOptionsHidden(element('#ord'), ['az'], false);
    expect(element('#ordMenu [data-value=az]').hidden).toBe(false);
  });

  it('escolher o valor por código ignora valores desconhecidos e não avisa', () => {
    dropdown.setDropdownValue(element('#ord'), 'za');
    expect(dropdown.dropdownValue(element('#ord'))).toBe('za');
    dropdown.setDropdownValue(element('#ord'), 'nada');
    expect(dropdown.dropdownValue(element('#ord'))).toBe('za');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('sem opções, o valor é vazio; sem botão ou lista, nada é ligado', () => {
    document.body.innerHTML = dropdown.dropdownHtml('vazio', 'Vazio', []);
    expect(dropdown.dropdownValue(element('#vazio'))).toBe('');
    document.body.innerHTML = '<div id="quebrado"></div>';
    expect(() => dropdown.initDropdown(element('#quebrado'), onChange)).not.toThrow();
    expect(() => dropdown.toggleDropdown(element('#quebrado'), true)).not.toThrow();
  });
});
