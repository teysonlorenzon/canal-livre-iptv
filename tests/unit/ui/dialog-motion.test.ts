import { advance, element, preparePage, REDUCED_MOTION } from '../support/boot';

/**
 * Abre um diálogo de teste com o fechamento suave instalado.
 * @param content Conteúdo do diálogo.
 * @returns Diálogo aberto.
 */
async function openDialog(content: string): Promise<HTMLDialogElement> {
  preparePage();
  const { installDialogFade } = await import('../../../src/ui/dialog-motion');
  installDialogFade();
  document.body.innerHTML = `<dialog id="dPin">${content}</dialog>`;
  const dialog = document.querySelector('dialog');
  if (!dialog) throw new Error('sem diálogo');
  dialog.showModal();
  return dialog;
}

describe('fechamento suave dos diálogos', () => {
  it('fecha na hora e deixa uma cópia sem ids nem foco, que some em 0,18 s', async () => {
    const dialog = await openDialog('<p id="texto">Oi</p><button id="botao">Ok</button><input><select></select><textarea></textarea>');
    jest
      .spyOn(dialog, 'getBoundingClientRect')
      .mockReturnValue({ left: 10, top: 20, width: 300, height: 200, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => null });
    dialog.scrollTop = 5;
    dialog.close('valor');
    expect(dialog.open).toBe(false);
    expect(dialog.returnValue).toBe('valor');
    const ghost = element('.dialog-ghost');
    expect(ghost.style.left).toBe('10px');
    expect(ghost.style.width).toBe('300px');
    expect(ghost.textContent).toContain('Oi');
    expect(ghost.querySelector('[id]')).toBeNull();
    expect(ghost.querySelectorAll('[disabled]')).toHaveLength(4);
    expect(ghost.querySelector('button')?.tabIndex).toBe(-1);
    expect(ghost.scrollTop).toBe(5);
    expect(ghost.parentElement).toBe(document.body);
    expect(document.querySelector('.dialog-ghost-backdrop')).not.toBeNull();
    await advance(180);
    expect(document.querySelector('.dialog-ghost')).toBeNull();
    expect(document.querySelector('.dialog-ghost-backdrop')).toBeNull();
  });

  it('a cópia fica por cima do diálogo que continuar aberto', async () => {
    const dialog = await openDialog('');
    document.body.insertAdjacentHTML('beforeend', '<dialog id="dDetail" open></dialog><dialog id="dPin2"></dialog>');
    dialog.close();
    expect(element('.dialog-ghost').parentElement?.id).toBe('dDetail');
  });

  it('diálogos muito grandes viram só a moldura', async () => {
    const dialog = await openDialog('<i></i>'.repeat(1501));
    dialog.close();
    expect(element('.dialog-ghost').childElementCount).toBe(0);
  });

  it('com movimento reduzido fecha sem efeito', async () => {
    const dialog = await openDialog('');
    jest.mocked(window.matchMedia).mockReturnValue(REDUCED_MOTION);
    dialog.close();
    expect(dialog.open).toBe(false);
    expect(document.querySelector('.dialog-ghost')).toBeNull();
  });

  it('fechar um diálogo já fechado não faz nada', async () => {
    const dialog = await openDialog('');
    dialog.close();
    await advance(180);
    dialog.close();
    expect(document.querySelector('.dialog-ghost')).toBeNull();
  });
});
