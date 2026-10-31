import {
  type AppModules,
  bootApp,
  element,
  fire,
  flush,
  inputField,
  openCatalog,
  pressKey,
  readStorage,
  selectField,
} from '../support/boot';
import { catalog, M3U_PLAYLIST, movie, SAMPLE_M3U, sectionData, userData, xtreamHandler } from '../support/fixtures';

/**
 * Preenche um campo do formulário.
 * @param id Id do campo.
 * @param value Valor.
 */
function fillField(id: string, value: string): void {
  const field = document.getElementById(id);
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement))
    throw new Error('não é campo: ' + id);
  field.value = value;
}

/**
 * Escolhe o tipo de lista a adicionar.
 * @param type Tipo.
 */
const chooseAddType = (type: 'xtream' | 'm3u' | 'file'): void => element(`#addSeg [data-t="${type}"]`).click();

/**
 * Inicia o app com as configurações abertas.
 * @param options Opções de boot.
 * @returns Módulos do app.
 */
async function bootSettings(options: Parameters<typeof bootApp>[0] = {}): Promise<AppModules> {
  const app = await bootApp(options);
  element('#openSettings').click();
  return app;
}

/**
 * Caixa de bloqueio ou ocultação de uma categoria.
 * @param key Chave da categoria.
 * @param type Tipo da caixa.
 * @returns A caixa.
 */
function categoryCheckbox(key: string, type: 'locked' | 'hidden'): HTMLInputElement {
  const box = element(`[data-k="${key}"][data-t="${type}"]`);
  if (!(box instanceof HTMLInputElement)) throw new Error('sem caixa');
  return box;
}

describe('configurações', () => {
  describe('diálogo', () => {
    it('abre com os valores atuais e fecha', async () => {
      await bootSettings({ storage: { opts: { fmt: 'ts', auto: '0' } } });
      expect(element('#dSettings').hasAttribute('open')).toBe(true);
      expect(selectField('#optFmt').value).toBe('ts');
      expect(selectField('#optAuto').value).toBe('0');
      element('#closeSettings').click();
      expect(element('#dSettings').hasAttribute('open')).toBe(false);
    });
  });

  describe('adicionar lista', () => {
    it('mostra os campos do tipo escolhido', async () => {
      await bootSettings();
      expect(element('#aServer').closest<HTMLElement>('[data-for]')?.hidden).toBe(false);
      expect(element('#aUrl').closest<HTMLElement>('[data-for]')?.hidden).toBe(true);
      chooseAddType('m3u');
      expect(element('#aServer').closest<HTMLElement>('[data-for]')?.hidden).toBe(true);
      expect(element('#aUrl').closest<HTMLElement>('[data-for]')?.hidden).toBe(false);
      expect(element('#aEpg').closest<HTMLElement>('[data-for]')?.hidden).toBe(false);
      expect(element('#addSeg [data-t="m3u"]').classList.contains('on')).toBe(true);
      chooseAddType('file');
      expect(element('#aRaw').closest<HTMLElement>('[data-for]')?.hidden).toBe(false);
      element('#addSeg').click();
      expect(element('#addSeg [data-t="file"]').classList.contains('on')).toBe(true);
    });

    it('botão sem tipo volta para Xtream', async () => {
      await bootSettings();
      delete element('#addSeg [data-t="m3u"]').dataset.t;
      element('#addSeg button:nth-child(2)').click();
      expect(element('#aServer').closest<HTMLElement>('[data-for]')?.hidden).toBe(false);
    });

    it('o formulário não recarrega a página', async () => {
      await bootSettings();
      const submitEvent = new Event('submit', { cancelable: true });
      element('#addForm').dispatchEvent(submitEvent);
      expect(submitEvent.defaultPrevented).toBe(true);
    });

    it('exige servidor e usuário no Xtream', async () => {
      await bootSettings();
      element('#addBtn').click();
      await flush();
      expect(element('#addError').textContent).toBe('Preencha servidor, usuário e senha.');
    });

    it('o erro do formulário some ao digitar de novo', async () => {
      await bootSettings();
      element('#addBtn').click();
      await flush();
      expect(element('#aServer').getAttribute('aria-invalid')).toBe('true');
      element('#aServer').dispatchEvent(new Event('input', { bubbles: true }));
      expect(element('#addError').textContent).toBe('');
      expect(element('#aServer').hasAttribute('aria-invalid')).toBe(false);
    });

    it('cadastra Xtream completando o protocolo', async () => {
      const app = await bootSettings({ storage: { pls: [] }, fetch: xtreamHandler() });
      fillField('aName', 'Nova');
      fillField('aServer', 'servidor.test:8080');
      fillField('aUser', 'eu');
      fillField('aPass', 'senha');
      element('#addBtn').click();
      await flush();
      await flush();
      expect(readStorage('pls')).toEqual([
        expect.objectContaining({ name: 'Nova', type: 'xtream', server: 'http://servidor.test:8080', user: 'eu', pass: 'senha' }),
      ]);
      expect(element('#dSettings').hasAttribute('open')).toBe(false);
      expect(app.state.state.activePlaylist?.name).toBe('Nova');
    });

    it('mantém o protocolo informado e dá nome padrão', async () => {
      await bootSettings({ storage: { pls: [] }, fetch: xtreamHandler() });
      fillField('aServer', 'https://servidor.test');
      fillField('aUser', 'eu');
      element('#addBtn').click();
      await flush();
      expect(readStorage('pls')).toEqual([expect.objectContaining({ name: 'Minha lista', server: 'https://servidor.test' })]);
    });

    it('exige a URL da lista M3U', async () => {
      await bootSettings();
      chooseAddType('m3u');
      element('#addBtn').click();
      await flush();
      expect(element('#addError').textContent).toBe('Informe a URL da lista.');
    });

    it('cadastra M3U por URL', async () => {
      await bootSettings({ storage: { pls: [] }, fetch: () => new Response(SAMPLE_M3U) });
      chooseAddType('m3u');
      fillField('aUrl', 'http://lista.test/canais.m3u');
      fillField('aEpg', ' http://epg.test/guia.xml ');
      element('#addBtn').click();
      await flush();
      expect(readStorage('pls')).toEqual([
        expect.objectContaining({ type: 'm3u', url: 'http://lista.test/canais.m3u', epg: 'http://epg.test/guia.xml' }),
      ]);
    });

    it('aceita URL fora do formato de URL completa', async () => {
      await bootSettings({ storage: { pls: [] }, fetch: () => new Response(SAMPLE_M3U) });
      chooseAddType('m3u');
      fillField('aUrl', 'lista-sem-protocolo');
      element('#addBtn').click();
      await flush();
      expect(readStorage('pls')).toEqual([expect.objectContaining({ type: 'm3u', url: 'lista-sem-protocolo' })]);
    });

    it('URL get.php com usuário e senha vira Xtream', async () => {
      await bootSettings({ storage: { pls: [] }, fetch: xtreamHandler() });
      chooseAddType('m3u');
      fillField('aUrl', 'http://servidor.test:8080/get.php?username=eu&password=senha&type=m3u_plus');
      element('#addBtn').click();
      await flush();
      expect(readStorage('pls')).toEqual([
        expect.objectContaining({ type: 'xtream', server: 'http://servidor.test:8080', user: 'eu', pass: 'senha' }),
      ]);
    });

    it('get.php sem senha continua M3U', async () => {
      await bootSettings({ storage: { pls: [] }, fetch: () => new Response(SAMPLE_M3U) });
      chooseAddType('m3u');
      fillField('aUrl', 'http://servidor.test/get.php?username=eu');
      element('#addBtn').click();
      await flush();
      expect(readStorage('pls')).toEqual([expect.objectContaining({ type: 'm3u' })]);
    });

    it('exige arquivo ou conteúdo', async () => {
      await bootSettings();
      chooseAddType('file');
      element('#addBtn').click();
      await flush();
      expect(element('#addError').textContent).toBe('Escolha um arquivo ou cole o conteúdo.');
    });

    it('recusa conteúdo sem canais', async () => {
      await bootSettings();
      chooseAddType('file');
      fillField('aRaw', '#EXTM3U');
      element('#addBtn').click();
      await flush();
      expect(element('#addError').textContent).toBe('Nenhum canal encontrado no conteúdo');
    });

    it('cadastra o conteúdo colado e salva a cópia', async () => {
      const app = await bootSettings({ storage: { pls: [] } });
      chooseAddType('file');
      fillField('aRaw', SAMPLE_M3U);
      element('#addBtn').click();
      await flush();
      await flush();
      const playlist = app.state.state.playlists[0];
      expect(playlist).toMatchObject({ type: 'm3u', epg: '' });
      expect(readStorage('m3u_' + playlist?.id)).toBe(SAMPLE_M3U);
    });

    it('lê o arquivo escolhido', async () => {
      const app = await bootSettings({ storage: { pls: [] } });
      chooseAddType('file');
      const fileField = element('#aFile');
      const file = new File([SAMPLE_M3U], 'lista.m3u');
      Object.defineProperty(file, 'text', { value: () => Promise.resolve(SAMPLE_M3U) });
      Object.defineProperty(fileField, 'files', { configurable: true, value: [file] });
      element('#addBtn').click();
      await flush();
      await flush();
      expect(app.state.state.playlists).toHaveLength(1);
    });

    it('avisa se a lista é grande demais para salvar', async () => {
      await bootSettings({ storage: { pls: [] } });
      chooseAddType('file');
      fillField('aRaw', SAMPLE_M3U);
      const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('cheio');
      });
      element('#addBtn').click();
      await flush();
      setItem.mockRestore();
      expect(element('#addError').textContent).toBe('A lista é grande demais para salvar neste navegador. Use a URL.');
    });
  });

  describe('PIN e opções', () => {
    it('confere o PIN atual e o novo', async () => {
      await bootSettings();
      fillField('pinOld', '1111');
      element('#pinSave').click();
      expect(element('#pinFormError').textContent).toBe('PIN atual incorreto.');
      fillField('pinOld', '0000');
      fillField('pinNew', '12');
      element('#pinSave').click();
      expect(element('#pinFormError').textContent).toBe('O novo PIN precisa ter de 4 a 8 números.');
      fillField('pinNew', '4321');
      element('#pinSave').click();
      expect(element('#toast').textContent).toBe('PIN alterado.');
      expect(readStorage('opts')).toMatchObject({ pin: '4321' });
      expect(inputField('#pinOld').value).toBe('');
    });

    it('sem PIN salvo o atual é 0000', async () => {
      const app = await bootSettings();
      app.state.state.options.pin = '';
      fillField('pinOld', '0000');
      fillField('pinNew', '4321');
      element('#pinSave').click();
      expect(element('#toast').textContent).toBe('PIN alterado.');
    });

    it('salva o formato e o próximo episódio automático', async () => {
      await bootSettings();
      fillField('optFmt', 'ts');
      fire(element('#optFmt'), 'change');
      fillField('optAuto', '0');
      fire(element('#optAuto'), 'change');
      expect(readStorage('opts')).toMatchObject({ fmt: 'ts', auto: '0' });
      fillField('optFmt', 'm3u8');
      fire(element('#optFmt'), 'change');
      fillField('optAuto', '1');
      fire(element('#optAuto'), 'change');
      expect(readStorage('opts')).toMatchObject({ fmt: 'm3u8', auto: '1' });
    });
  });

  describe('carregamento', () => {
    it('Esc cancela o carregamento na tela e é ignorado sem carregamento', async () => {
      await bootApp({ storage: { pls: [M3U_PLAYLIST] }, fetch: () => new Promise<Response>(() => undefined) });
      expect(element('#loading').hidden).toBe(false);
      expect(pressKey(document.body, 'Escape').defaultPrevented).toBe(true);
      await flush();
      expect(element('#loading').hidden).toBe(true);
      expect(pressKey(document.body, 'Escape').defaultPrevented).toBe(false);
    });
  });

  describe('histórico', () => {
    it('limpa só o perfil ativo', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ recentLive: ['c1'] }));
      element('#clearHist').click();
      expect(app.state.state.userData.recentLive).toEqual([]);
      expect(element('#toast').textContent).toBe('Histórico limpo.');
    });

    it('sem lista não faz nada', async () => {
      await bootApp({ storage: { pls: [] } });
      element('#clearHist').click();
      expect(element('#toast').textContent).toBe('');
    });
  });

  describe('categorias', () => {
    it('sem lista pede para abrir uma', async () => {
      await bootSettings({ storage: { pls: [] } });
      expect(element('#catRows').textContent).toContain('Abra uma lista para configurar as categorias.');
    });

    it('seção não baixada pede para abrir', async () => {
      const app = await bootApp();
      openCatalog(app, catalog({ vod: null }));
      element('#openSettings').click();
      fillField('catSec', 'vod');
      fire(element('#catSec'), 'change');
      expect(element('#catRows').textContent).toContain('Abra a seção Filmes uma vez');
    });

    it('valor inesperado no seletor não quebra', async () => {
      const app = await bootApp();
      openCatalog(app, catalog());
      element('#openSettings').click();
      element('#catSec').innerHTML = '<option value="x" selected>X</option>';
      fire(element('#catSec'), 'change');
      expect(element('#catRows').textContent).toContain('Abra a seção  uma vez');
    });

    it('lista as categorias com o estado atual', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ locked: ['live:abertos'] }));
      element('#openSettings').click();
      expect(categoryCheckbox('live:abertos', 'locked').checked).toBe(true);
      expect(categoryCheckbox('live:abertos', 'hidden').checked).toBe(false);
    });

    it('ocultar e bloquear salvam e atualizam a seção aberta', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      await app.section.openSection('live');
      element('#openSettings').click();
      const hideBox = categoryCheckbox('live:abertos', 'hidden');
      hideBox.checked = true;
      fire(hideBox, 'change');
      expect(app.state.state.userData.hidden).toEqual(['live:abertos']);
      expect(element('#items').textContent).toBe('Nada encontrado.');
      fire(hideBox, 'change');
      expect(app.state.state.userData.hidden).toEqual(['live:abertos']);
      hideBox.checked = false;
      fire(hideBox, 'change');
      expect(app.state.state.userData.hidden).toEqual([]);
      const lockBox = categoryCheckbox('live:abertos', 'locked');
      lockBox.checked = true;
      fire(lockBox, 'change');
      expect(app.state.state.userData.locked).toEqual(['live:abertos']);
    });

    it('fora da seção só salva', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      element('#openSettings').click();
      const hideBox = categoryCheckbox('live:abertos', 'hidden');
      hideBox.checked = true;
      fire(hideBox, 'change');
      expect(app.state.state.userData.hidden).toEqual(['live:abertos']);
    });

    it('desbloquear exige o PIN e reabre as configurações', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ locked: ['live:abertos'] }));
      element('#openSettings').click();
      const lockBox = categoryCheckbox('live:abertos', 'locked');
      lockBox.checked = false;
      fire(lockBox, 'change');
      expect(lockBox.checked).toBe(true);
      expect(element('#dSettings').hasAttribute('open')).toBe(false);
      expect(element('#dPin').hasAttribute('open')).toBe(true);
      fillField('pinIn', '0000');
      element('#pinOk').click();
      expect(lockBox.checked).toBe(false);
      expect(app.state.state.userData.locked).toEqual([]);
      expect(element('#dSettings').hasAttribute('open')).toBe(true);
    });

    it('ignora mudanças fora das caixas', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      element('#openSettings').click();
      fire(element('#catRows'), 'change');
      element('#catRows').insertAdjacentHTML('beforeend', '<input id="semChave">');
      fire(element('#semChave'), 'change');
      expect(app.state.state.userData.hidden).toEqual([]);
    });

    it('bloqueia automaticamente as categorias adultas', async () => {
      const app = await bootApp();
      openCatalog(
        app,
        catalog({ vod: sectionData([movie(1)], { adulto: 'Adultos', xxx: 'XXX' }), series: null }),
        userData({ locked: ['vod:xxx'] }),
      );
      element('#openSettings').click();
      element('#autoAdult').click();
      expect(app.state.state.userData.locked).toEqual(['vod:xxx', 'vod:adulto']);
      expect(element('#toast').textContent).toBe('1 categorias bloqueadas.');
      element('#autoAdult').click();
      expect(element('#toast').textContent).toBe('Nenhuma categoria adulta encontrada.');
    });

    it('sem lista o bloqueio automático não faz nada', async () => {
      await bootSettings({ storage: { pls: [] } });
      element('#autoAdult').click();
      expect(element('#toast').textContent).toBe('');
    });
  });

  it('M3U salvo aparece nas configurações', async () => {
    await bootSettings({ storage: { pls: [M3U_PLAYLIST], m3u_l1: SAMPLE_M3U } });
    expect(element('#plList').textContent).toContain('Minha M3U');
  });
});
