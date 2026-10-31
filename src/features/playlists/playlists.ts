import { $, closest, query, queryAll } from '../../core/dom';
import { DEFAULT_PLAYLIST, loadUserData, profileKey, state } from '../../core/state';
import { esc, loading, store } from '../../core/utils';
import { DEFAULT_M3U } from '../../data/default-list';
import { epgCache, loadXmltv } from '../../data/epg';
import { buildFromM3U } from '../../data/m3u';
import { errText, fetchWithTimeout, loadAllSections, loadXtream } from '../../data/xtream';
import { renderHome, show } from '../home/home';
import { openSettings } from '../settings/settings';

/**
 * Atualiza o seletor de lista do topo e a lista de listas nas configurações.
 */
export function renderPlaylistSelect(): void {
  $('plSelTxt').textContent = state.activePlaylist ? state.activePlaylist.name : state.playlists.length ? 'Carregando…' : 'Nenhuma lista';
  $('plSel').title = 'Lista: ' + $('plSelTxt').textContent;
  $('plSel').setAttribute('aria-label', 'Lista ativa: ' + $('plSelTxt').textContent);
  $('plMenu').innerHTML =
    state.playlists
      .map(
        playlist =>
          `<li role="menuitemradio" tabindex="-1" data-id="${esc(playlist.id)}" aria-checked="${state.activePlaylist?.id === playlist.id}"><b>${esc(playlist.name)}</b><small>${playlist.type === 'xtream' ? 'Xtream' : playlist.url ? 'M3U' : 'Arquivo M3U'}</small></li>`,
      )
      .join('') +
    `<li role="menuitem" class="dd-act" tabindex="-1" data-manage="1">${state.playlists.length ? 'Gerenciar listas…' : 'Adicionar lista…'}</li>`;
  $('plList').innerHTML = state.playlists.length
    ? state.playlists
        .map(
          playlist => `<div class="plrow"><div><b>${esc(playlist.name)}</b><small>${playlist.type === 'xtream' ? 'Xtream · ' + esc(playlist.server) + ' · ' + esc(playlist.user) : playlist.url ? 'M3U · ' + esc(playlist.url) : 'M3U · arquivo local'}</small></div>
    <button type="button" class="btn sm" data-open="${playlist.id}" aria-label="Abrir ${esc(playlist.name)}">Abrir</button><button type="button" class="btn sm" data-reload="${playlist.id}" aria-label="Atualizar ${esc(playlist.name)}">Atualizar</button><button type="button" class="btn sm danger" data-del="${playlist.id}" aria-label="Remover ${esc(playlist.name)}">Remover</button></div>`,
        )
        .join('')
    : '<p class="hint">Nenhuma lista ainda. Adicione abaixo.</p>';
}
/**
 * Abre ou fecha o menu de listas do topo.
 * @param open `true` para abrir.
 * @param focus Ao abrir, focar a lista ativa (navegação por teclado).
 */
export function togglePlaylistMenu(open: boolean, focus?: boolean): void {
  $('plMenu').hidden = !open;
  $('plSel').setAttribute('aria-expanded', String(open));
  if (open && focus) (query($('plMenu'), '[aria-checked=true]') ?? query($('plMenu'), 'li'))?.focus();
}

/**
 * Executa a opção escolhida no menu de listas: abre a lista ou as configurações.
 * @param menuItem Item escolhido.
 */
function pickPlaylistMenuItem(menuItem: HTMLElement): void {
  togglePlaylistMenu(false);
  $('plSel').focus();
  if (menuItem.dataset.manage) {
    openSettings();
    return;
  }
  const playlistId = menuItem.dataset.id;
  if (playlistId && state.activePlaylist?.id !== playlistId) void openPlaylist(playlistId);
}

/**
 * Lista que o app abre quando nenhuma está ativa: a padrão, se ainda existir, senão a primeira.
 * @returns Id da lista, ou `null` se não houver nenhuma.
 */
export function fallbackPlaylistId(): string | null {
  const defaultPlaylist = state.playlists.find(playlist => playlist.id === DEFAULT_PLAYLIST.id);
  return defaultPlaylist?.id ?? state.playlists[0]?.id ?? null;
}
/**
 * Ativa uma lista e carrega seus dados.
 * @param id Id da lista.
 * @param force Baixar novamente a lista M3U em vez de usar o cache.
 */
export async function openPlaylist(id: string, force?: boolean): Promise<void> {
  const playlist = state.playlists.find(candidate => candidate.id === id);
  if (!playlist) return;
  state.activePlaylist = playlist;
  store.set('active', id);
  loadUserData();
  state.unlockedCategories.clear();
  epgCache.clear();
  state.lastError = '';
  state.catalog = null;
  renderPlaylistSelect();
  try {
    if (playlist.type === 'xtream') {
      state.catalog = await loadXtream();
      await loadAllSections();
    } else {
      let m3uText =
        playlist.id === DEFAULT_PLAYLIST.id ? DEFAULT_M3U : !force || !playlist.url ? store.getText('m3u_' + playlist.id) : null;
      if (!m3uText && playlist.url) {
        loading('Baixando lista…');
        const response = await fetchWithTimeout(playlist.url, 120000);
        m3uText = await response.text();
        store.set('m3u_' + playlist.id, m3uText);
      }
      if (!m3uText) throw new Error('Conteúdo da lista não encontrado. Adicione de novo.');
      loading('Organizando canais…');
      const m3uCatalog = buildFromM3U(m3uText);
      state.catalog = m3uCatalog;
      const epgUrl = playlist.epg || m3uCatalog.epgUrl;
      if (epgUrl) {
        loading('Baixando guia de programação…');
        const epgMap = await loadXmltv(epgUrl);
        if (epgMap) m3uCatalog.epg = epgMap;
      }
    }
    loading(null);
    show('home');
  } catch (error) {
    loading(null);
    state.catalog = null;
    state.lastError = errText(error);
    renderHome();
  }
}

/**
 * Liga os eventos desta parte do app. Chamada uma vez, na ordem de `main.ts`.
 */
export function initPlaylists(): void {
  /**
   * Abre ou fecha o menu de listas.
   */
  $('plSel').onclick = () => togglePlaylistMenu(!!$('plMenu').hidden);

  /**
   * Abre o menu pelo teclado (setas, Enter ou Espaço) já com foco na lista ativa.
   * @param keyEvent Evento de tecla.
   */
  $('plSel').onkeydown = keyEvent => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(keyEvent.key)) {
      keyEvent.preventDefault();
      togglePlaylistMenu(true, true);
    }
  };

  /**
   * Escolhe uma opção do menu com o mouse.
   * @param clickEvent Evento de clique.
   */
  $('plMenu').onclick = clickEvent => {
    const menuItem = closest(clickEvent.target, 'li');
    if (menuItem) pickPlaylistMenuItem(menuItem);
  };

  /**
   * Navegação por teclado no menu: setas, Home/End, Enter/Espaço escolhem, Esc/Tab fecham.
   * @param keyEvent Evento de tecla.
   */
  $('plMenu').onkeydown = keyEvent => {
    const menuItems = queryAll($('plMenu'), 'li'),
      focusedIndex = menuItems.findIndex(menuItem => menuItem === document.activeElement);
    /**
     * Foca o item do menu no índice dado, circulando nas pontas.
     * @param targetIndex Índice desejado (pode passar das pontas).
     */
    const focusMenuItem = (targetIndex: number): void => {
      keyEvent.preventDefault();
      menuItems[(targetIndex + menuItems.length) % menuItems.length]?.focus();
    };
    if (keyEvent.key === 'ArrowDown') focusMenuItem(focusedIndex + 1);
    else if (keyEvent.key === 'ArrowUp') focusMenuItem(focusedIndex - 1);
    else if (keyEvent.key === 'Home') focusMenuItem(0);
    else if (keyEvent.key === 'End') focusMenuItem(menuItems.length - 1);
    else if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
      keyEvent.preventDefault();
      const focusedItem = menuItems[focusedIndex];
      if (focusedItem) pickPlaylistMenuItem(focusedItem);
    } else if (keyEvent.key === 'Escape') {
      keyEvent.preventDefault();
      togglePlaylistMenu(false);
      $('plSel').focus();
    } else if (keyEvent.key === 'Tab') togglePlaylistMenu(false);
  };

  /**
   * Fecha o menu de listas ao clicar fora dele.
   * @param clickEvent Evento de clique.
   */
  document.addEventListener('click', clickEvent => {
    if (!$('plMenu').hidden && !closest(clickEvent.target, '#plDd')) togglePlaylistMenu(false);
  });

  /**
   * Trata os botões Abrir, Atualizar e Remover (com confirmação) das listas.
   * @param clickEvent Evento de clique.
   */
  $('plList').onclick = clickEvent => {
    const actionButton = closest(clickEvent.target, 'button');
    if (!actionButton) return;
    if (actionButton.dataset.open) {
      $('dSettings').close();
      void openPlaylist(actionButton.dataset.open);
    }
    if (actionButton.dataset.reload) {
      $('dSettings').close();
      void openPlaylist(actionButton.dataset.reload, true);
    }
    if (actionButton.dataset.del) {
      if (actionButton.dataset.confirm !== '1') {
        actionButton.dataset.confirm = '1';
        actionButton.textContent = 'Confirmar';
        actionButton.setAttribute(
          'aria-label',
          'Confirmar a remoção de ' + (actionButton.closest('.plrow')?.querySelector('b')?.textContent ?? 'a lista'),
        );
        return;
      }
      const playlistId = actionButton.dataset.del;
      state.playlists = state.playlists.filter(playlist => playlist.id !== playlistId);
      store.set('pls', state.playlists);
      state.profiles.forEach(profile => store.del(profileKey('ux_' + playlistId, profile.id)));
      store.del('m3u_' + playlistId);
      if (state.activePlaylist && state.activePlaylist.id === playlistId) {
        state.activePlaylist = null;
        state.catalog = null;
        store.del('active');
      }
      renderPlaylistSelect();
      renderHome();
      const nextPlaylistId = fallbackPlaylistId();
      if (!state.activePlaylist && nextPlaylistId) void openPlaylist(nextPlaylistId);
    }
  };
}
