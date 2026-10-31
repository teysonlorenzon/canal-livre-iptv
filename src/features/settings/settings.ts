import { $, closest, queryAll } from '../../core/dom';
import { errorMessage, isSectionName } from '../../core/guards';
import { saveOptions, saveUserData, state } from '../../core/state';
import type { Playlist, SectionName } from '../../core/types';
import { ADULT_PATTERN, esc, SECTION_NAMES, store, toast } from '../../core/utils';
import { buildFromM3U } from '../../data/m3u';
import { cancelLoading } from '../../data/xtream';
import { renderHome } from '../home/home';
import { openPlaylist, renderPlaylistSelect } from '../playlists/playlists';
import { renderProfileRows } from '../profiles/profiles';
import { renderCats, renderItems, withPin } from '../section/section';

/** Tipo de lista escolhido no formulário de adicionar. */
let addType = 'xtream';
/** Todas as seções, na ordem do app. */
const ALL_SECTIONS: SectionName[] = ['live', 'vod', 'series'];

/**
 * Abre o diálogo de configurações com os valores atuais.
 */
export function openSettings(): void {
  renderPlaylistSelect();
  renderProfileRows();
  renderCatRows();
  $('optFmt').value = state.options.fmt;
  $('optAuto').value = state.options.auto;
  $('dSettings').showModal();
}

/**
 * Desenha a tabela de bloqueio/ocultação de categorias da seção escolhida.
 */
function renderCatRows(): void {
  const rowsBox = $('catRows');
  if (!state.catalog) {
    rowsBox.innerHTML = '<p class="hint" style="padding:10px">Abra uma lista para configurar as categorias.</p>';
    return;
  }
  const sectionName = $('catSec').value;
  const sectionData = isSectionName(sectionName) ? state.catalog[sectionName] : null;
  if (!sectionData) {
    rowsBox.innerHTML = `<p class="hint" style="padding:10px">Abra a seção ${isSectionName(sectionName) ? SECTION_NAMES[sectionName] : ''} uma vez para carregar as categorias.</p>`;
    return;
  }
  rowsBox.innerHTML =
    `<label class="hd"><span>Categoria</span><span>Bloquear</span><span>Ocultar</span></label>` +
    sectionData.cats
      .map(category => {
        const categoryKey = sectionName + ':' + category.id;
        return `<label><span>${esc(category.name)}</span><input type="checkbox" data-k="${esc(categoryKey)}" data-t="locked" ${state.userData.locked.includes(categoryKey) ? 'checked' : ''}><input type="checkbox" data-k="${esc(categoryKey)}" data-t="hidden" ${state.userData.hidden.includes(categoryKey) ? 'checked' : ''}></label>`;
      })
      .join('');
}

/**
 * Liga os eventos desta parte do app. Chamada uma vez, na ordem de `main.ts`.
 */
export function initSettings(): void {
  $('openSettings').onclick = openSettings;

  /**
   * Fecha as configurações.
   */
  $('closeSettings').onclick = () => $('dSettings').close();

  /**
   * Troca o tipo de lista a adicionar e mostra os campos correspondentes.
   * @param clickEvent Evento de clique.
   */
  $('addSeg').onclick = clickEvent => {
    const typeButton = closest(clickEvent.target, 'button');
    if (!typeButton) return;
    addType = typeButton.dataset.t ?? 'xtream';
    $('addSeg')
      .querySelectorAll('button')
      .forEach(segmentButton => segmentButton.classList.toggle('on', segmentButton === typeButton));
    queryAll($('addForm'), '[data-for]').forEach(fieldElement => {
      fieldElement.hidden = !fieldElement.dataset.for?.split(' ').includes(addType);
    });
  };

  /**
   * Impede o envio do formulário de adicionar lista (que recarregaria a página).
   * @param submitEvent Evento de envio.
   */
  $('addForm').addEventListener('submit', submitEvent => submitEvent.preventDefault());

  /**
   * Valida o formulário, cadastra a nova lista e a abre.
   * URLs `get.php` com usuário e senha viram Xtream automaticamente.
   */
  $('addBtn').onclick = async () => {
    const id = Date.now().toString(36),
      name = $('aName').value.trim() || 'Minha lista';
    let newPlaylist: Playlist | undefined;
    if (addType === 'xtream') {
      let server = $('aServer').value.trim();
      const user = $('aUser').value.trim(),
        pass = $('aPass').value;
      if (!server || !user) return toast('Preencha servidor, usuário e senha.');
      if (!/^https?:\/\//i.test(server)) server = 'http://' + server;
      newPlaylist = { id, name, type: 'xtream', server, user, pass };
    } else if (addType === 'm3u') {
      const url = $('aUrl').value.trim();
      if (!url) return toast('Informe a URL da lista.');
      try {
        const parsedUrl = new URL(url);
        const urlUsername = parsedUrl.searchParams.get('username'),
          urlPassword = parsedUrl.searchParams.get('password');
        if (/get\.php$/i.test(parsedUrl.pathname) && urlUsername && urlPassword)
          newPlaylist = { id, name, type: 'xtream', server: parsedUrl.origin, user: urlUsername, pass: urlPassword };
      } catch {}
      if (!newPlaylist) newPlaylist = { id, name, type: 'm3u', url, epg: $('aEpg').value.trim() };
    } else {
      const selectedFile = $('aFile').files?.[0],
        pastedText = $('aRaw').value.trim();
      const m3uText = selectedFile ? await selectedFile.text() : pastedText;
      if (!m3uText) return toast('Escolha um arquivo ou cole o conteúdo.');
      try {
        buildFromM3U(m3uText);
      } catch (error) {
        return toast(errorMessage(error));
      }
      newPlaylist = { id, name, type: 'm3u', epg: $('aEpg').value.trim() };
      if (!store.set('m3u_' + id, m3uText)) return toast('A lista é grande demais para salvar neste navegador. Use a URL.');
    }
    state.playlists.push(newPlaylist);
    store.set('pls', state.playlists);
    $('addForm').reset();
    $('dSettings').close();
    void openPlaylist(id);
  };

  /**
   * Altera o PIN do controle parental.
   */
  $('pinSave').onclick = () => {
    if ($('pinOld').value !== (state.options.pin || '0000')) return toast('PIN atual incorreto.');
    if (!/^\d{4,8}$/.test($('pinNew').value)) return toast('O novo PIN precisa ter de 4 a 8 números.');
    state.options.pin = $('pinNew').value;
    saveOptions();
    $('pinOld').value = $('pinNew').value = '';
    toast('PIN alterado.');
  };

  /**
   * Salva o formato da TV ao vivo.
   */
  $('optFmt').onchange = () => {
    state.options.fmt = $('optFmt').value === 'ts' ? 'ts' : 'm3u8';
    saveOptions();
  };

  /**
   * Salva a opção de próximo episódio automático.
   */
  $('optAuto').onchange = () => {
    state.options.auto = $('optAuto').value === '0' ? '0' : '1';
    saveOptions();
  };

  /**
   * Limpa o histórico e os canais recentes da lista ativa, só do perfil ativo.
   */
  $('clearHist').onclick = () => {
    if (!state.activePlaylist) return;
    state.userData.hist = [];
    state.userData.recentLive = [];
    saveUserData();
    toast('Histórico limpo.');
    renderHome();
  };

  $('catSec').onchange = renderCatRows;

  /**
   * Aplica bloqueio ou ocultação de categoria; remover bloqueio exige o PIN.
   * @param changeEvent Evento de mudança.
   */
  $('catRows').onchange = changeEvent => {
    const checkbox = changeEvent.target;
    if (!(checkbox instanceof HTMLInputElement)) return;
    const categoryKey = checkbox.dataset.k;
    if (!categoryKey) return;
    /**
     * Grava a alteração da caixa marcada e atualiza a seção aberta.
     */
    const applyChange = (): void => {
      const categoryKeys = checkbox.dataset.t === 'hidden' ? state.userData.hidden : state.userData.locked;
      if (!checkbox.checked) categoryKeys.splice(categoryKeys.indexOf(categoryKey), 1);
      else if (!categoryKeys.includes(categoryKey)) categoryKeys.push(categoryKey);
      saveUserData();
      if (!$('section').hidden) {
        renderCats();
        renderItems();
      }
    };
    if (!checkbox.checked && checkbox.dataset.t === 'locked') {
      checkbox.checked = true;
      $('dSettings').close();
      withPin(
        '__settings',
        () => {
          checkbox.checked = false;
          applyChange();
          $('dSettings').showModal();
        },
        true,
      );
      return;
    }
    applyChange();
  };

  /**
   * Bloqueia automaticamente as categorias com nome adulto.
   */
  $('autoAdult').onclick = () => {
    const catalog = state.catalog;
    if (!catalog) return;
    let lockedCount = 0;
    for (const sectionName of ALL_SECTIONS)
      for (const category of catalog[sectionName]?.cats ?? [])
        if (ADULT_PATTERN.test(category.name)) {
          const categoryKey = sectionName + ':' + category.id;
          if (!state.userData.locked.includes(categoryKey)) {
            state.userData.locked.push(categoryKey);
            lockedCount++;
          }
        }
    saveUserData();
    renderCatRows();
    toast(lockedCount ? `${lockedCount} categorias bloqueadas.` : 'Nenhuma categoria adulta encontrada.');
  };

  $('loadCancel').onclick = cancelLoading;
}
