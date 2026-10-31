import { bootApp, element, preparePage } from './support/boot';

describe('início do app', () => {
  it('aplica o tema salvo antes da página aparecer', async () => {
    preparePage();
    localStorage.setItem('cl_theme', '"dark"');
    await import('../../src/head');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('mostra a abertura e, sem perfis extras, abre a lista salva', async () => {
    const { state } = await bootApp({ finishIntro: false });
    expect(element('#intro')).toBeDefined();
    expect(state.state.activePlaylist).toBeNull();
    await jest.advanceTimersByTimeAsync(3000);
    expect(state.state.activePlaylist?.id).toBe('br-gratis');
    expect(document.getElementById('intro')).toBeNull();
  });

  it('com perfil protegido, trava a escolha de perfil', async () => {
    await bootApp({
      storage: {
        users: [
          { id: 'main', name: 'Principal', askPin: true },
          { id: 'u1', name: 'Ana' },
        ],
      },
    });
    expect(element('#profilesClose').hidden).toBe(true);
  });

  it('sem nenhuma lista fica na tela de boas-vindas', async () => {
    await bootApp({ storage: { pls: [] } });
    expect(element('#home').textContent).toContain('Adicione sua lista IPTV');
  });
});
