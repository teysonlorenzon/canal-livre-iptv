import '../../src/main';
import './tv.css';

import { $, blurActiveElement, closest, query, queryAll } from '../../src/core/dom';
import { isSectionName } from '../../src/core/guards';
import { isFav, state, toggleFav } from '../../src/core/state';
import type { CurrentMedia, SectionName } from '../../src/core/types';
import { toast } from '../../src/core/utils';
import { renderHome, show } from '../../src/features/home/home';
import { playback, playerPlatformHooks, playerScreen, video } from '../../src/features/player/playback';
import { closePlayer, poke, showFavoriteButton, stepChannel } from '../../src/features/player/player';
import { togglePlaylistMenu } from '../../src/features/playlists/playlists';
import { openSection, renderCats, renderItems } from '../../src/features/section/section';

/**
 * Adaptação para controle remoto de TV (LG webOS): navegação pelas setas entre os
 * elementos da tela, botão Voltar e botões de mídia. Carregado só no pacote da TV.
 */

/** Direção da navegação pelas setas. */
type Direction = 'up' | 'down' | 'left' | 'right';

/** Elemento candidato a receber o foco, com as distâncias até o elemento focado. */
interface FocusCandidate {
  element: HTMLElement;
  main: number;
  side: number;
  overlap: number;
}

/** Códigos de tecla do controle LG que não chegam com `event.key` padronizado. */
const TV_KEY = { BACK: 461, PLAY: 415, PAUSE: 19, STOP: 413, FF: 417, RW: 412, RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406 };

/** Seletor dos elementos que recebem foco pelas setas. */
const FOCUSABLE =
  'button:not([disabled]):not(.star):not(.del):not(.card-del),a[href]:not(.skip-link),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea,[tabindex]:not([tabindex="-1"]),.dd-menu li';

/** Mapa das teclas de seta para a direção da navegação. */
const ARROW_DIRECTIONS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

document.documentElement.classList.add('tv');
playerPlatformHooks.focusPlayer = () => undefined;

/**
 * Indica se o elemento está visível na tela.
 * @param element Elemento.
 * @returns `true` se ocupa espaço e não está oculto.
 */
const isShown = (element: Element): boolean => {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
};

/**
 * Primeiro diálogo aberto na página.
 * @returns O diálogo, ou `null` se não houver.
 */
const firstOpenDialog = (): HTMLDialogElement | null => query(document, 'dialog[open]', HTMLDialogElement);

/**
 * Elemento focado.
 * @returns O elemento, ou `null` se não houver.
 */
const focusedHtmlElement = (): HTMLElement | null => (document.activeElement instanceof HTMLElement ? document.activeElement : null);

/**
 * Área onde a navegação acontece agora: diálogo aberto, player ou o app.
 * @returns Raiz da navegação.
 */
function getNavigationRoot(): ParentNode {
  const openDialog = firstOpenDialog();
  if (openDialog) return openDialog;
  if (!$('player').hidden) return $('side').hidden ? $('player') : $('side');
  return document;
}

/**
 * Elementos focáveis visíveis dentro da área atual.
 * @returns Candidatos.
 */
function getFocusCandidates(): HTMLElement[] {
  const navigationRoot = getNavigationRoot();
  return queryAll(navigationRoot, FOCUSABLE).filter(
    element => isShown(element) && !element.closest('.dialog-ghost') && (navigationRoot !== document || !element.closest('#player,dialog')),
  );
}

/**
 * Move o foco para o elemento mais próximo na direção pedida. Para cima/baixo vai sempre
 * para a linha seguinte (sem pular linhas) e, nela, escolhe o mais alinhado na horizontal;
 * para os lados só anda dentro da mesma linha.
 * @param direction Direção.
 * @returns `true` se o foco mudou.
 */
function moveFocus(direction: Direction): boolean {
  const candidateList = getFocusCandidates();
  const firstCandidate = candidateList[0];
  if (!firstCandidate) return false;
  const focusedElement = focusedHtmlElement();
  if (!focusedElement || focusedElement === document.body || !candidateList.includes(focusedElement)) {
    focusElement(firstCandidate);
    return true;
  }
  const focusedRect = focusedElement.getBoundingClientRect(),
    focusedCenterX = focusedRect.left + focusedRect.width / 2,
    focusedCenterY = focusedRect.top + focusedRect.height / 2;
  const isVertical = direction === 'up' || direction === 'down';
  const found: FocusCandidate[] = [];
  for (const element of candidateList) {
    if (element === focusedElement) continue;
    const candidateRect = element.getBoundingClientRect();
    let mainDistance;
    if (direction === 'down') mainDistance = candidateRect.top - focusedRect.bottom;
    else if (direction === 'up') mainDistance = focusedRect.top - candidateRect.bottom;
    else if (direction === 'right') mainDistance = candidateRect.left - focusedRect.right;
    else mainDistance = focusedRect.left - candidateRect.right;
    if (mainDistance < -2) continue;
    const overlap = isVertical
      ? Math.min(focusedRect.right, candidateRect.right) - Math.max(focusedRect.left, candidateRect.left)
      : Math.min(focusedRect.bottom, candidateRect.bottom) - Math.max(focusedRect.top, candidateRect.top);
    const sideDistance = isVertical
      ? Math.abs(candidateRect.left + candidateRect.width / 2 - focusedCenterX)
      : Math.abs(candidateRect.top + candidateRect.height / 2 - focusedCenterY);
    found.push({ element, main: Math.max(mainDistance, 0), side: sideDistance, overlap });
  }
  if (!found.length) return false;
  let pool: FocusCandidate[];
  if (isVertical) {
    const nearestDistance = Math.min(...found.map(candidate => candidate.main));
    pool = found.filter(candidate => candidate.main <= nearestDistance + 8);
  } else {
    pool = found.filter(candidate => candidate.overlap > 0);
    if (!pool.length) return false;
  }
  pool.sort((first, second) => (isVertical ? first.side - second.side : first.main + first.side * 2 - (second.main + second.side * 2)));
  const nearestCandidate = pool[0];
  if (!nearestCandidate) return false;
  focusElement(nearestCandidate.element);
  return true;
}

/**
 * Foca um elemento e o rola para dentro da tela.
 * @param element Elemento.
 */
function focusElement(element: HTMLElement): void {
  if (!element.hasAttribute('tabindex') && element.matches('li')) element.tabIndex = -1;
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: 'center', inline: 'nearest' });
}

/**
 * Executa o botão Voltar do controle: fecha o que estiver aberto, um nível por vez.
 * Na tela inicial, fecha o aplicativo.
 */
function tvBack(): void {
  const openDialog = firstOpenDialog();
  if (openDialog) {
    openDialog.close();
    return;
  }
  if (!$('plMenu').hidden) {
    togglePlaylistMenu(false);
    $('plSel').focus();
    return;
  }
  if (!$('player').hidden) {
    if (!$('side').hidden) {
      $('side').hidden = true;
      blurActiveElement();
    } else if (inPlayerUi()) {
      blurActiveElement();
      playerScreen().classList.add('idle');
    } else closePlayer();
    return;
  }
  if (!$('section').hidden) {
    show('home');
    focusFirst();
    return;
  }
  confirmExit();
}

/**
 * Pergunta antes de fechar o app (Voltar na tela inicial), como pedem as diretrizes da LG.
 * O foco começa em "Cancelar"; Voltar de novo fecha só a pergunta.
 */
function confirmExit(): void {
  if (!query(document, '#dExit')) {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<dialog id="dExit" style="width:min(380px,calc(100vw - 32px))"><div class="dlg"><h3>Sair do Zapp IPTV?</h3><div class="row"><button class="btn" id="exitNo">Cancelar</button><button class="btn primary" id="exitYes">Sair</button></div></div></dialog>`,
    );
    const cancelButton = query(document, '#exitNo'),
      exitButton = query(document, '#exitYes');
    if (cancelButton) cancelButton.onclick = () => query(document, '#dExit', HTMLDialogElement)?.close();
    if (exitButton) exitButton.onclick = () => window.close();
  }
  query(document, '#dExit', HTMLDialogElement)?.showModal();
  const cancelButton = query(document, '#exitNo');
  if (cancelButton) focusElement(cancelButton);
}

/**
 * Indica se o foco está nos controles do player (barra de botões ou topo).
 * @returns `true` se um controle do player está focado.
 */
const inPlayerUi = (): boolean => {
  const focusedElement = document.activeElement;
  return (
    !!focusedElement &&
    focusedElement !== document.body &&
    focusedElement !== $('v') &&
    $('player').contains(focusedElement) &&
    !$('side').contains(focusedElement)
  );
};

/**
 * Setas no player. Com os controles escondidos: ↑/↓ mostram os controles e focam o
 * play/pause; ←/→ trocam de canal (ao vivo) ou avançam/voltam 10 s (filmes e séries).
 * Com os controles focados ou a lista lateral aberta, as setas navegam entre os itens.
 * @param direction Direção.
 */
function playerArrow(direction: Direction): void {
  poke();
  if (!$('side').hidden || inPlayerUi()) {
    moveFocus(direction);
    return;
  }
  if (direction === 'up' || direction === 'down') {
    focusElement($('cPlay'));
    return;
  }
  const isLive = playback.currentMedia && playback.currentMedia.kind === 'live';
  if (isLive) stepChannel(direction === 'left' ? -1 : 1);
  else video().currentTime += direction === 'left' ? -10 : 10;
}

/** Quando os controles do player somem por inatividade, tira o foco deles: as setas voltam a trocar de canal. */
new MutationObserver(() => {
  if (playerScreen().classList.contains('idle') && inPlayerUi()) blurActiveElement();
}).observe(playerScreen(), { attributes: true, attributeFilter: ['class'] });

/** Campos de texto: só entram em edição (e abrem o teclado virtual da TV) ao apertar OK. */
const TEXT_FIELD_SELECTOR = 'input[type=text],input[type=search],input[type=url],input[type=password],input:not([type]),textarea';

/**
 * Indica se o elemento é um campo de texto controlado pelo modo de edição.
 * @param element Elemento.
 * @returns `true` se for campo de texto.
 */
const isTextField = (element: EventTarget | null): element is HTMLInputElement | HTMLTextAreaElement =>
  (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.matches(TEXT_FIELD_SELECTOR);

/**
 * Coloca o campo em edição: libera a digitação e reabre o foco para a TV mostrar o teclado.
 * @param textField Campo.
 */
function startEdit(textField: HTMLInputElement | HTMLTextAreaElement): void {
  textField.readOnly = false;
  textField.dataset.editing = '1';
  textField.blur();
  textField.focus();
}

/**
 * Sai da edição do campo, mantendo o foco nele para continuar navegando.
 * @param textField Campo.
 */
function stopEdit(textField: HTMLInputElement | HTMLTextAreaElement): void {
  delete textField.dataset.editing;
  textField.readOnly = true;
}

/** Ao chegar num campo pela navegação, deixa-o só leitura para não abrir o teclado sozinho. */
document.addEventListener('focusin', event => {
  const target = event.target;
  if (isTextField(target) && !target.dataset.editing) target.readOnly = true;
});
/** Ao sair do campo, encerra a edição. */
document.addEventListener('focusout', event => {
  const target = event.target;
  if (isTextField(target) && target.dataset.editing && event.relatedTarget) stopEdit(target);
});

/** Se o foco inicial em "TV ao vivo" já foi feito. */
let startFocused = false;

/**
 * Coloca o foco no primeiro elemento da área atual, se nada estiver focado.
 * Na abertura do app, começa sempre em "TV ao vivo", assim que a tela inicial aparece.
 * No player, o foco só vai para os controles quando o usuário aperta ↑/↓; na lista lateral,
 * começa no item atual.
 */
function focusFirst(): void {
  if (!startFocused) {
    const liveTile = query(document, '#home:not([hidden]) .tile.live');
    if (liveTile) {
      startFocused = true;
      focusElement(liveTile);
      return;
    }
  }
  const focusedElement = focusedHtmlElement();
  if (focusedElement && focusedElement !== document.body && isShown(focusedElement) && getFocusCandidates().includes(focusedElement))
    return;
  if (!$('player').hidden && !firstOpenDialog()) {
    if (focusedElement && focusedElement !== document.body && !$('player').contains(focusedElement)) focusedElement.blur();
    if (!$('side').hidden) {
      const sideList = $('sideList'),
        sideItem = query(sideList, '.on .side-btn') ?? query(sideList, '.cur .side-btn') ?? query(sideList, '.side-btn');
      if (sideItem) focusElement(sideItem);
    }
    return;
  }
  const mainElement =
    getNavigationRoot() === document
      ? query(
          document,
          '#home:not([hidden]) .tile, #section:not([hidden]) #items li.on .row-main, #section:not([hidden]) #items .row-main, #section:not([hidden]) #items .card[data-i]',
        )
      : null;
  const elementToFocus = mainElement && isShown(mainElement) ? mainElement : getFocusCandidates()[0];
  if (elementToFocus) focusElement(elementToFocus);
}

/**
 * Mostra o aviso de favorito adicionado ou removido.
 * @param isNowFavorite Se o item ficou favorito.
 */
const announceFavorite = (isNowFavorite: boolean): void => toast(isNowFavorite ? 'Adicionado aos favoritos' : 'Removido dos favoritos');

/** Item que pode ser favoritado. */
interface FavoriteTarget {
  section: SectionName;
  key: string;
}

/**
 * Separa uma referência de favorito no formato `seção:chave` (ex.: `vod:123`, `series:45`).
 * @param favoriteRef Referência.
 * @returns Seção e chave, ou `null` se inválida.
 */
function parseFavoriteRef(favoriteRef: string | undefined): FavoriteTarget | null {
  if (!favoriteRef) return null;
  const separatorIndex = favoriteRef.indexOf(':');
  const section = favoriteRef.slice(0, Math.max(separatorIndex, 0));
  return isSectionName(section) ? { section, key: favoriteRef.slice(separatorIndex + 1) } : null;
}

/**
 * Alterna o favorito de um item da seção (canal da lista ou cartão de filme/série) e mantém
 * o foco na mesma posição se a lista for redesenhada (ex.: na categoria Favoritos).
 * @param itemElement Item focado (`#items [data-i]`).
 */
function toggleSectionItemFavorite(itemElement: HTMLElement): void {
  const itemIndex = Number(itemElement.dataset.i),
    item = state.listedItems[itemIndex];
  if (!item) return;
  const starButton = query(itemElement, '.star');
  if (starButton) starButton.click();
  else {
    toggleFav(state.currentSection, item.k);
    if (state.currentCategory === 'fav') renderItems();
    renderCats();
  }
  announceFavorite(isFav(state.currentSection, item.k));
  if (itemElement.isConnected) return;
  const sectionItems = queryAll($('items'), '.row-main, .card[data-i]');
  const itemToFocus = sectionItems[Math.min(itemIndex, sectionItems.length - 1)] ?? query(document, '#cats li.on .cat-btn');
  if (itemToFocus) focusElement(itemToFocus);
}

/**
 * Alterna o favorito de um cartão da tela inicial (canal das prateleiras ou filme/série de
 * "Continuar assistindo"). Se for um canal, redesenha a tela inicial (prateleira de favoritos)
 * e devolve o foco ao mesmo cartão, ou ao vizinho da mesma prateleira se ele sumiu.
 * @param cardElement Cartão focado (`#home .card`).
 */
function toggleHomeCardFavorite(cardElement: HTMLElement): void {
  const favoriteTarget = parseFavoriteRef(cardElement.dataset.live ? 'live:' + cardElement.dataset.live : cardElement.dataset.fav);
  if (!favoriteTarget) return;
  announceFavorite(toggleFav(favoriteTarget.section, favoriteTarget.key));
  if (favoriteTarget.section !== 'live') return;
  const shelfElement = cardElement.closest('.shelf'),
    shelfKindClass = shelfElement ? [...shelfElement.classList].find(className => className.indexOf('shelf-') === 0) : '';
  const cardIndex = shelfElement ? queryAll(shelfElement, '.card').indexOf(cardElement) : 0;
  const cardSelector = '[data-live="' + CSS.escape(favoriteTarget.key) + '"]';
  renderHome();
  const shelfCards = shelfKindClass ? queryAll(document, '#home .' + shelfKindClass + ' .card') : [];
  const cardToFocus =
    shelfCards.find(card => card.matches(cardSelector)) ??
    shelfCards[Math.min(cardIndex, shelfCards.length - 1)] ??
    query(document, '#home ' + cardSelector) ??
    query(document, '#home .tile');
  if (cardToFocus) focusElement(cardToFocus);
}

/**
 * Alterna o favorito do filme ou da série aberta no diálogo de detalhes, pelo botão
 * "Favoritar" do próprio diálogo (que atualiza o texto).
 */
function toggleDetailFavorite(): void {
  const favoriteButton = query($('detailBody'), '#mFav,#sFav');
  if (!favoriteButton) return;
  favoriteButton.click();
  announceFavorite(favoriteButton.textContent.indexOf('★') === 0);
}

/**
 * Botão amarelo fora do player: favorita o que estiver selecionado (item da seção, cartão
 * da tela inicial ou o filme/série do diálogo de detalhes).
 * @param focusedElement Elemento focado.
 */
function toggleFocusedFavorite(focusedElement: EventTarget | null): void {
  const openDialog = firstOpenDialog();
  if (openDialog) {
    if (openDialog.id === 'dDetail') toggleDetailFavorite();
    return;
  }
  const sectionItem = closest(focusedElement, '#items [data-i]');
  if (sectionItem) {
    toggleSectionItemFavorite(sectionItem);
    return;
  }
  const homeCard = closest(focusedElement, '#home .card');
  if (homeCard) toggleHomeCardFavorite(homeCard);
}

/**
 * Botão azul fora do player: remove do histórico o que estiver selecionado (cartão de
 * "Continuar assistindo" ou "Canais recentes", ou canal da categoria Recentes) e devolve o
 * foco ao vizinho da mesma prateleira ou lista.
 * @param focusedElement Elemento focado.
 */
function removeFocusedHistoryItem(focusedElement: EventTarget | null): void {
  if (firstOpenDialog()) return;
  const sectionItem = closest(focusedElement, '#items li[data-i]');
  const sectionRemoveButton = sectionItem && query(sectionItem, '.del');
  if (sectionItem && sectionRemoveButton) {
    const itemIndex = Number(sectionItem.dataset.i);
    sectionRemoveButton.click();
    const sectionItems = queryAll($('items'), '.row-main, .card[data-i]');
    const itemToFocus = sectionItems[Math.min(itemIndex, sectionItems.length - 1)] ?? query(document, '#cats li.on .cat-btn');
    if (itemToFocus) focusElement(itemToFocus);
    return;
  }
  const homeCard = closest(focusedElement, '#home .card');
  const cardRemoveButton = homeCard && query(homeCard.parentElement ?? homeCard, '.card-del');
  const shelfElement = homeCard && homeCard.closest('.shelf');
  if (!homeCard || !cardRemoveButton || !shelfElement) return;
  const shelfKindClass = [...shelfElement.classList].find(className => className.indexOf('shelf-') === 0);
  const cardIndex = queryAll(shelfElement, '.card').indexOf(homeCard);
  cardRemoveButton.click();
  const shelfCards = queryAll(document, '#home .' + shelfKindClass + ' .card');
  const cardToFocus = shelfCards[Math.min(cardIndex, shelfCards.length - 1)] ?? query(document, '#home .tile');
  if (cardToFocus) focusElement(cardToFocus);
}

/**
 * Favorito correspondente ao que está tocando: o canal (ao vivo ou catch-up), o filme ou a série do episódio.
 * @returns Seção e chave, ou `null` se não houver.
 */
function playingFavoriteTarget(): FavoriteTarget | null {
  if (!playback.currentMedia) return null;
  if (playback.currentMedia.item) return { section: 'live', key: playback.currentMedia.item.k };
  return parseFavoriteRef(playback.currentMedia.desc.series || playback.currentMedia.desc.ref);
}

/**
 * Botão amarelo no player: na lista lateral de canais, favorita o canal focado; senão,
 * o que está tocando. Atualiza a estrela dos controles quando o canal é o atual.
 */
function togglePlayerFavorite(): void {
  const focusedElement = focusedHtmlElement();
  const isChannelSideList = !$('side').hidden && $('side').dataset.mode === 'list' && !(playback.currentMedia && playback.currentMedia.ctx);
  const focusedSideItem = closest(focusedElement, '#sideList li[data-x]');
  const focusedSideChannel = isChannelSideList && focusedSideItem ? playback.liveChannelList[Number(focusedSideItem.dataset.x)] : null;
  const favoriteTarget: FavoriteTarget | null = focusedSideChannel
    ? { section: 'live', key: focusedSideChannel.k }
    : playingFavoriteTarget();
  if (!favoriteTarget) return;
  const isNowFavorite = toggleFav(favoriteTarget.section, favoriteTarget.key);
  if (
    favoriteTarget.section === 'live' &&
    playback.currentMedia &&
    playback.currentMedia.item &&
    playback.currentMedia.item.k === favoriteTarget.key
  )
    showFavoriteButton(isNowFavorite);
  announceFavorite(isNowFavorite);
}

/** Seção de cada tipo de mídia do player, para o botão vermelho buscar no lugar certo. */
const SECTION_OF_MEDIA_KIND: Record<CurrentMedia['kind'], SectionName> = { live: 'live', catchup: 'live', vod: 'vod', series: 'series' };

/**
 * Coloca o campo de busca da seção em edição (abre o teclado da TV).
 */
function focusSearchField(): void {
  const searchField = $('q');
  focusElement(searchField);
  startEdit(searchField);
}

/**
 * Botão vermelho: abre a busca. Fecha antes o diálogo ou o menu de listas aberto; no player,
 * fecha o player e busca na seção do que estava tocando; na tela inicial, abre a seção atual.
 */
function openSearch(): void {
  queryAll(document, 'dialog[open]', HTMLDialogElement).forEach(openDialog => openDialog.close());
  if (!$('plMenu').hidden) togglePlaylistMenu(false);
  let targetSection = state.currentSection;
  if (!$('player').hidden) {
    if (playback.currentMedia) targetSection = SECTION_OF_MEDIA_KIND[playback.currentMedia.kind];
    closePlayer();
  }
  if (!$('section').hidden && state.currentSection === targetSection) {
    focusSearchField();
    return;
  }
  if (!state.catalog) return;
  void openSection(targetSection).then(() => {
    if (!$('section').hidden && state.currentSection === targetSection) focusSearchField();
  });
}

/**
 * Trata as teclas do player aberto: mídia, teclas coloridas, setas e OK. Com os controles
 * escondidos (foco fora deles), o OK pausa/retoma e mostra os controles.
 * @param event Evento de tecla.
 */
function handlePlayerKey(event: KeyboardEvent): void {
  const focusedTarget = event.target instanceof HTMLElement ? event.target : null;
  if (event.keyCode === TV_KEY.PLAY || event.keyCode === TV_KEY.PAUSE) {
    event.preventDefault();
    $('cPlay').click();
  } else if (event.keyCode === TV_KEY.STOP) {
    event.preventDefault();
    closePlayer();
  } else if (event.keyCode === TV_KEY.FF) {
    event.preventDefault();
    $('cFwd10').click();
  } else if (event.keyCode === TV_KEY.RW) {
    event.preventDefault();
    $('cBack10').click();
  } else if (event.keyCode === TV_KEY.RED) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openSearch();
  } else if (event.keyCode === TV_KEY.YELLOW) {
    event.preventDefault();
    event.stopImmediatePropagation();
    togglePlayerFavorite();
    poke();
  } else if (event.keyCode === TV_KEY.GREEN) {
    event.preventDefault();
    $('cEpg').click();
  } else if (event.key === 'Enter' && focusedTarget?.matches('#sideList .side-btn')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    focusedTarget.click();
  } else {
    const direction = ARROW_DIRECTIONS[event.key];
    if (direction && !(direction !== 'up' && direction !== 'down' && focusedTarget?.matches('input[type=range]'))) {
      event.preventDefault();
      event.stopImmediatePropagation();
      playerArrow(direction);
    } else if (event.key === 'Enter' && inPlayerUi()) poke();
    else if (event.key === 'Enter' && $('side').hidden) {
      event.preventDefault();
      event.stopImmediatePropagation();
      $('cPlay').click();
      poke();
    }
  }
}

/**
 * Trata as teclas do controle antes dos atalhos do app. Num campo de texto em edição, o OK
 * confirma: sai da edição e deixa o Enter seguir para o app (ex.: PIN).
 * @param event Evento de tecla.
 */
document.addEventListener(
  'keydown',
  event => {
    if (event.keyCode === TV_KEY.BACK) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const backTarget = event.target;
      if (isTextField(backTarget) && backTarget.dataset.editing) stopEdit(backTarget);
      else tvBack();
      return;
    }
    const isPlayerOpen = !$('player').hidden && !firstOpenDialog();
    if (isPlayerOpen) {
      handlePlayerKey(event);
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (event.key === 'Enter' && target?.matches('input[type=checkbox],input[type=radio]')) {
      event.preventDefault();
      target.click();
      return;
    }
    if (event.key === 'Enter' && isTextField(target) && !(target instanceof HTMLTextAreaElement && target.dataset.editing)) {
      if (target.dataset.editing) {
        stopEdit(target);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      startEdit(target);
      return;
    }
    if (event.keyCode === TV_KEY.RED) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openSearch();
      return;
    }
    if (event.keyCode === TV_KEY.YELLOW) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleFocusedFavorite(target);
      return;
    }
    if (event.keyCode === TV_KEY.BLUE) {
      event.preventDefault();
      event.stopImmediatePropagation();
      removeFocusedHistoryItem(target);
      return;
    }
    const direction = ARROW_DIRECTIONS[event.key];
    if (!direction) return;
    if (target?.closest('#plMenu')) return;
    if (target?.id === 'plSel' && direction === 'down') return;
    if (isTextField(target) && target.dataset.editing) {
      if (direction === 'left' || direction === 'right') return;
      stopEdit(target);
    }
    if (target?.matches('input[type=range]') && (direction === 'left' || direction === 'right')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    moveFocus(direction);
  },
  true,
);

/**
 * Abas de temporada da série: o clique redesenha o diálogo e o botão focado some. Devolve o
 * foco para a aba recém-criada da mesma temporada, para o usuário descer até os episódios.
 */
document.addEventListener('click', event => {
  const seasonButton = event.target;
  if (!(seasonButton instanceof HTMLElement) || !seasonButton.matches('.stabs [data-s]') || seasonButton.isConnected) return;
  const newSeasonButton = query(document, 'dialog[open] .stabs [data-s="' + seasonButton.dataset.s + '"]');
  if (newSeasonButton) focusElement(newSeasonButton);
});

/** Mantém sempre um elemento focado quando a tela muda. */
new MutationObserver(() => requestAnimationFrame(focusFirst)).observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['hidden', 'open'],
});
focusFirst();
