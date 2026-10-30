'use strict';
/**
 * Adaptação para controle remoto de TV (LG webOS): navegação pelas setas entre os
 * elementos da tela, botão Voltar e botões de mídia. Carregado só no pacote da TV.
 */

/** Códigos de tecla do controle LG que não chegam com `event.key` padronizado. */
const TV_KEY = { BACK: 461, PLAY: 415, PAUSE: 19, STOP: 413, FF: 417, RW: 412, RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406 };

/** Seletor dos elementos que recebem foco pelas setas. */
const FOCUSABLE =
  'button:not([disabled]):not(.star):not(.del),a[href],input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea,[tabindex]:not([tabindex="-1"]),.dd-menu li,#cats li,#items li[data-i],#sideList li[data-x],.eps li[data-e]';

/** Mapa das teclas de seta para a direção da navegação. */
const ARROW_DIRECTIONS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

document.documentElement.classList.add('tv');

/**
 * Indica se o elemento está visível na tela.
 * @param {Element} element Elemento.
 * @returns {boolean} `true` se ocupa espaço e não está oculto.
 */
const isShown = element => {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
};

/**
 * Área onde a navegação acontece agora: diálogo aberto, player ou o app.
 * @returns {ParentNode} Raiz da navegação.
 */
function getNavigationRoot() {
  const openDialog = document.querySelector('dialog[open]');
  if (openDialog) return openDialog;
  if (!$('player').hidden) return $('side').hidden ? $('player') : $('side');
  return document;
}

/**
 * Elementos focáveis visíveis dentro da área atual.
 * @returns {HTMLElement[]} Candidatos.
 */
function getFocusCandidates() {
  const navigationRoot = getNavigationRoot();
  return [...navigationRoot.querySelectorAll(FOCUSABLE)].filter(
    element => isShown(element) && !element.closest('.dialog-ghost') && (navigationRoot !== document || !element.closest('#player,dialog')),
  );
}

/**
 * Move o foco para o elemento mais próximo na direção pedida. Para cima/baixo vai sempre
 * para a linha seguinte (sem pular linhas) e, nela, escolhe o mais alinhado na horizontal;
 * para os lados só anda dentro da mesma linha.
 * @param {'up'|'down'|'left'|'right'} direction Direção.
 * @returns {boolean} `true` se o foco mudou.
 */
function moveFocus(direction) {
  const candidateList = getFocusCandidates();
  if (!candidateList.length) return false;
  const focusedElement = document.activeElement;
  if (!focusedElement || focusedElement === document.body || !candidateList.includes(focusedElement)) {
    focusElement(candidateList[0]);
    return true;
  }
  const focusedRect = focusedElement.getBoundingClientRect(),
    focusedCenterX = focusedRect.left + focusedRect.width / 2,
    focusedCenterY = focusedRect.top + focusedRect.height / 2;
  const isVertical = direction === 'up' || direction === 'down';
  const found = [];
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
  let pool;
  if (isVertical) {
    const nearestDistance = Math.min(...found.map(candidate => candidate.main));
    pool = found.filter(candidate => candidate.main <= nearestDistance + 8);
  } else {
    pool = found.filter(candidate => candidate.overlap > 0);
    if (!pool.length) return false;
  }
  pool.sort((first, second) => (isVertical ? first.side - second.side : first.main + first.side * 2 - (second.main + second.side * 2)));
  focusElement(pool[0].element);
  return true;
}

/**
 * Foca um elemento e o rola para dentro da tela.
 * @param {HTMLElement} element Elemento.
 * @returns {void}
 */
function focusElement(element) {
  if (!element.hasAttribute('tabindex') && element.matches('li')) element.tabIndex = -1;
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: 'center', inline: 'nearest' });
}

/**
 * Executa o botão Voltar do controle: fecha o que estiver aberto, um nível por vez.
 * Na tela inicial, fecha o aplicativo.
 * @returns {void}
 */
function tvBack() {
  const openDialog = document.querySelector('dialog[open]');
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
      document.activeElement.blur();
    } else if (inPlayerUi()) {
      document.activeElement.blur();
      playerScreen.classList.add('idle');
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
 * @returns {void}
 */
function confirmExit() {
  let exitDialog = document.getElementById('dExit');
  if (!exitDialog) {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<dialog id="dExit" style="width:min(380px,calc(100vw - 32px))"><div class="dlg"><h3>Sair do Zapp IPTV?</h3><div class="row"><button class="btn" id="exitNo">Cancelar</button><button class="btn primary" id="exitYes">Sair</button></div></div></dialog>`,
    );
    exitDialog = document.getElementById('dExit');
    document.getElementById('exitNo').onclick = () => exitDialog.close();
    document.getElementById('exitYes').onclick = () => window.close();
  }
  exitDialog.showModal();
  focusElement(document.getElementById('exitNo'));
}

/**
 * Indica se o foco está nos controles do player (barra de botões ou topo).
 * @returns {boolean} `true` se um controle do player está focado.
 */
const inPlayerUi = () => {
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
 * @param {'up'|'down'|'left'|'right'} direction Direção.
 * @returns {void}
 */
function playerArrow(direction) {
  poke();
  if (!$('side').hidden || inPlayerUi()) {
    moveFocus(direction);
    return;
  }
  if (direction === 'up' || direction === 'down') {
    focusElement($('cPlay'));
    return;
  }
  const isLive = currentMedia && currentMedia.kind === 'live';
  if (isLive) stepChannel(direction === 'left' ? -1 : 1);
  else video.currentTime += direction === 'left' ? -10 : 10;
}

/** Quando os controles do player somem por inatividade, tira o foco deles: as setas voltam a trocar de canal. */
new MutationObserver(() => {
  if (playerScreen.classList.contains('idle') && inPlayerUi()) document.activeElement.blur();
}).observe(playerScreen, { attributes: true, attributeFilter: ['class'] });

/** Campos de texto: só entram em edição (e abrem o teclado virtual da TV) ao apertar OK. */
const TEXT_FIELD_SELECTOR = 'input[type=text],input[type=search],input[type=url],input[type=password],input:not([type]),textarea';

/**
 * Indica se o elemento é um campo de texto controlado pelo modo de edição.
 * @param {EventTarget} element Elemento.
 * @returns {boolean} `true` se for campo de texto.
 */
const isTextField = element => !!(element && element.matches && element.matches(TEXT_FIELD_SELECTOR));

/**
 * Coloca o campo em edição: libera a digitação e reabre o foco para a TV mostrar o teclado.
 * @param {HTMLInputElement|HTMLTextAreaElement} textField Campo.
 * @returns {void}
 */
function startEdit(textField) {
  textField.readOnly = false;
  textField.dataset.editing = '1';
  textField.blur();
  textField.focus();
}

/**
 * Sai da edição do campo, mantendo o foco nele para continuar navegando.
 * @param {HTMLInputElement|HTMLTextAreaElement} textField Campo.
 * @returns {void}
 */
function stopEdit(textField) {
  delete textField.dataset.editing;
  textField.readOnly = true;
}

/** Ao chegar num campo pela navegação, deixa-o só leitura para não abrir o teclado sozinho. */
document.addEventListener('focusin', event => {
  if (isTextField(event.target) && !event.target.dataset.editing) event.target.readOnly = true;
});
/** Ao sair do campo, encerra a edição. */
document.addEventListener('focusout', event => {
  if (isTextField(event.target) && event.target.dataset.editing && event.relatedTarget) stopEdit(event.target);
});

/** Se o foco inicial em "TV ao vivo" já foi feito. */
let startFocused = false;

/**
 * Coloca o foco no primeiro elemento da área atual, se nada estiver focado.
 * Na abertura do app, começa sempre em "TV ao vivo", assim que a tela inicial aparece.
 * No player, o foco só vai para os controles quando o usuário aperta ↑/↓; na lista lateral,
 * começa no item atual.
 * @returns {void}
 */
function focusFirst() {
  if (!startFocused) {
    const liveTile = document.querySelector('#home:not([hidden]) .tile.live');
    if (liveTile) {
      startFocused = true;
      focusElement(liveTile);
      return;
    }
  }
  const focusedElement = document.activeElement;
  if (focusedElement && focusedElement !== document.body && isShown(focusedElement) && getFocusCandidates().includes(focusedElement))
    return;
  if (!$('player').hidden && !document.querySelector('dialog[open]')) {
    if (focusedElement && focusedElement !== document.body && !$('player').contains(focusedElement)) focusedElement.blur();
    if (!$('side').hidden) {
      const sideList = $('sideList'),
        sideItem = sideList.querySelector('li.on') || sideList.querySelector('li.cur') || sideList.querySelector('li[data-x]');
      if (sideItem) focusElement(sideItem);
    }
    return;
  }
  const mainElement =
    getNavigationRoot() === document
      ? document.querySelector('#home:not([hidden]) .tile, #section:not([hidden]) #items li.on, #section:not([hidden]) #items [data-i]')
      : null;
  const elementToFocus = mainElement && isShown(mainElement) ? mainElement : getFocusCandidates()[0];
  if (elementToFocus) focusElement(elementToFocus);
}

/**
 * Mostra o aviso de favorito adicionado ou removido.
 * @param {boolean} isNowFavorite Se o item ficou favorito.
 * @returns {void}
 */
const announceFavorite = isNowFavorite => toast(isNowFavorite ? 'Adicionado aos favoritos' : 'Removido dos favoritos');

/**
 * Separa uma referência de favorito no formato `seção:chave` (ex.: `vod:123`, `series:45`).
 * @param {string} favoriteRef Referência.
 * @returns {{section: string, key: string}|null} Seção e chave, ou `null` se inválida.
 */
function parseFavoriteRef(favoriteRef) {
  const separatorIndex = favoriteRef ? favoriteRef.indexOf(':') : -1;
  const section = separatorIndex > 0 ? favoriteRef.slice(0, separatorIndex) : '';
  return userData && userData.fav[section] ? { section, key: favoriteRef.slice(separatorIndex + 1) } : null;
}

/**
 * Alterna o favorito de um item da seção (canal da lista ou cartão de filme/série) e mantém
 * o foco na mesma posição se a lista for redesenhada (ex.: na categoria Favoritos).
 * @param {HTMLElement} itemElement Item focado (`#items [data-i]`).
 * @returns {void}
 */
function toggleSectionItemFavorite(itemElement) {
  const itemIndex = +itemElement.dataset.i,
    item = $('items')._a[itemIndex];
  if (!item) return;
  const starButton = itemElement.querySelector('.star');
  if (starButton) starButton.click();
  else {
    toggleFav(currentSection, item.k);
    if (currentCategory === 'fav') renderItems();
    renderCats();
  }
  announceFavorite(isFav(currentSection, item.k));
  if (itemElement.isConnected) return;
  const sectionItems = $('items').querySelectorAll('[data-i]');
  const itemToFocus = sectionItems[Math.min(itemIndex, sectionItems.length - 1)] || document.querySelector('#cats li.on');
  if (itemToFocus) focusElement(itemToFocus);
}

/**
 * Alterna o favorito de um cartão da tela inicial (canal das prateleiras ou filme/série de
 * "Continuar assistindo"). Se for um canal, redesenha a tela inicial (prateleira de favoritos)
 * e devolve o foco ao mesmo cartão, ou ao vizinho da mesma prateleira se ele sumiu.
 * @param {HTMLElement} cardElement Cartão focado (`#home .card`).
 * @returns {void}
 */
function toggleHomeCardFavorite(cardElement) {
  const favoriteTarget = parseFavoriteRef(cardElement.dataset.live ? 'live:' + cardElement.dataset.live : cardElement.dataset.fav);
  if (!favoriteTarget) return;
  announceFavorite(toggleFav(favoriteTarget.section, favoriteTarget.key));
  if (favoriteTarget.section !== 'live') return;
  const shelfElement = cardElement.closest('.shelf'),
    shelfKindClass = shelfElement ? [...shelfElement.classList].find(className => className.indexOf('shelf-') === 0) : '';
  const cardIndex = shelfElement ? [...shelfElement.querySelectorAll('.card')].indexOf(cardElement) : 0;
  const cardSelector = '[data-live="' + CSS.escape(favoriteTarget.key) + '"]';
  renderHome();
  const shelfCards = shelfKindClass ? [...document.querySelectorAll('#home .' + shelfKindClass + ' .card')] : [];
  const cardToFocus =
    shelfCards.find(card => card.matches(cardSelector)) ||
    shelfCards[Math.min(cardIndex, shelfCards.length - 1)] ||
    document.querySelector('#home ' + cardSelector) ||
    document.querySelector('#home .tile');
  if (cardToFocus) focusElement(cardToFocus);
}

/**
 * Alterna o favorito do filme ou da série aberta no diálogo de detalhes, pelo botão
 * "Favoritar" do próprio diálogo (que atualiza o texto).
 * @returns {void}
 */
function toggleDetailFavorite() {
  const favoriteButton = $('detailBody').querySelector('#mFav,#sFav');
  if (!favoriteButton) return;
  favoriteButton.click();
  announceFavorite(favoriteButton.textContent.indexOf('★') === 0);
}

/**
 * Botão amarelo fora do player: favorita o que estiver selecionado (item da seção, cartão
 * da tela inicial ou o filme/série do diálogo de detalhes).
 * @param {EventTarget} focusedElement Elemento focado.
 * @returns {void}
 */
function toggleFocusedFavorite(focusedElement) {
  const openDialog = document.querySelector('dialog[open]');
  if (openDialog) {
    if (openDialog.id === 'dDetail') toggleDetailFavorite();
    return;
  }
  if (!focusedElement || !focusedElement.closest) return;
  const sectionItem = focusedElement.closest('#items [data-i]');
  if (sectionItem) {
    toggleSectionItemFavorite(sectionItem);
    return;
  }
  const homeCard = focusedElement.closest('#home .card');
  if (homeCard) toggleHomeCardFavorite(homeCard);
}

/**
 * Botão azul fora do player: remove do histórico o que estiver selecionado (cartão de
 * "Continuar assistindo" ou "Canais recentes", ou canal da categoria Recentes) e devolve o
 * foco ao vizinho da mesma prateleira ou lista.
 * @param {EventTarget} focusedElement Elemento focado.
 * @returns {void}
 */
function removeFocusedHistoryItem(focusedElement) {
  if (document.querySelector('dialog[open]') || !focusedElement || !focusedElement.closest) return;
  const sectionItem = focusedElement.closest('#items li[data-i]');
  const sectionRemoveButton = sectionItem && sectionItem.querySelector('.del');
  if (sectionRemoveButton) {
    const itemIndex = +sectionItem.dataset.i;
    sectionRemoveButton.click();
    const sectionItems = $('items').querySelectorAll('[data-i]');
    const itemToFocus = sectionItems[Math.min(itemIndex, sectionItems.length - 1)] || document.querySelector('#cats li.on');
    if (itemToFocus) focusElement(itemToFocus);
    return;
  }
  const homeCard = focusedElement.closest('#home .card');
  const cardRemoveButton = homeCard && homeCard.querySelector('.card-del');
  if (!cardRemoveButton) return;
  const shelfElement = homeCard.closest('.shelf'),
    shelfKindClass = [...shelfElement.classList].find(className => className.indexOf('shelf-') === 0);
  const cardIndex = [...shelfElement.querySelectorAll('.card')].indexOf(homeCard);
  cardRemoveButton.click();
  const shelfCards = [...document.querySelectorAll('#home .' + shelfKindClass + ' .card')];
  const cardToFocus = shelfCards[Math.min(cardIndex, shelfCards.length - 1)] || document.querySelector('#home .tile');
  if (cardToFocus) focusElement(cardToFocus);
}

/**
 * Favorito correspondente ao que está tocando: o canal (ao vivo ou catch-up), o filme ou a série do episódio.
 * @returns {{section: string, key: string}|null} Seção e chave, ou `null` se não houver.
 */
function playingFavoriteTarget() {
  if (!currentMedia) return null;
  if (currentMedia.item) return { section: 'live', key: currentMedia.item.k };
  return currentMedia.desc ? parseFavoriteRef(currentMedia.desc.series || currentMedia.desc.ref) : null;
}

/**
 * Botão amarelo no player: na lista lateral de canais, favorita o canal focado; senão,
 * o que está tocando. Atualiza a estrela dos controles quando o canal é o atual.
 * @returns {void}
 */
function togglePlayerFavorite() {
  const focusedElement = document.activeElement;
  const isChannelSideList = !$('side').hidden && $('side').dataset.mode === 'list' && !(currentMedia && currentMedia.ctx);
  const focusedSideChannel =
    isChannelSideList && focusedElement && focusedElement.matches && focusedElement.matches('#sideList li[data-x]')
      ? liveChannelList[+focusedElement.dataset.x]
      : null;
  const favoriteTarget = focusedSideChannel ? { section: 'live', key: focusedSideChannel.k } : playingFavoriteTarget();
  if (!favoriteTarget) return;
  const isNowFavorite = toggleFav(favoriteTarget.section, favoriteTarget.key);
  if (favoriteTarget.section === 'live' && currentMedia && currentMedia.item && currentMedia.item.k === favoriteTarget.key)
    $('cFav').innerHTML = icon('star', isNowFavorite ? 'on' : '');
  announceFavorite(isNowFavorite);
}

/** Seção de cada tipo de mídia do player, para o botão vermelho buscar no lugar certo. */
const SECTION_OF_MEDIA_KIND = { live: 'live', catchup: 'live', vod: 'vod', series: 'series' };

/**
 * Coloca o campo de busca da seção em edição (abre o teclado da TV).
 * @returns {void}
 */
function focusSearchField() {
  const searchField = $('q');
  focusElement(searchField);
  startEdit(searchField);
}

/**
 * Botão vermelho: abre a busca. Fecha antes o diálogo ou o menu de listas aberto; no player,
 * fecha o player e busca na seção do que estava tocando; na tela inicial, abre a seção atual.
 * @returns {void}
 */
function openSearch() {
  document.querySelectorAll('dialog[open]').forEach(openDialog => openDialog.close());
  if (!$('plMenu').hidden) togglePlaylistMenu(false);
  let targetSection = currentSection || 'live';
  if (!$('player').hidden) {
    targetSection = SECTION_OF_MEDIA_KIND[currentMedia && currentMedia.kind] || targetSection;
    closePlayer();
  }
  if (!$('section').hidden && currentSection === targetSection) {
    focusSearchField();
    return;
  }
  if (!catalog) return;
  openSection(targetSection).then(() => {
    if (!$('section').hidden && currentSection === targetSection) focusSearchField();
  });
}

/**
 * Trata as teclas do player aberto: mídia, teclas coloridas, setas e OK. Com os controles
 * escondidos (foco fora deles), o OK pausa/retoma e mostra os controles.
 * @param {KeyboardEvent} event Evento de tecla.
 * @returns {void}
 */
function handlePlayerKey(event) {
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
  } else if (event.keyCode === TV_KEY.GREEN && $('cEpg')) {
    event.preventDefault();
    $('cEpg').click();
  } else if (event.key === 'Enter' && event.target.matches && event.target.matches('#sideList li[data-x]')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.target.click();
  } else {
    const direction = ARROW_DIRECTIONS[event.key];
    if (direction && !(direction !== 'up' && direction !== 'down' && event.target.matches && event.target.matches('input[type=range]'))) {
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
 * @param {KeyboardEvent} event Evento de tecla.
 */
document.addEventListener(
  'keydown',
  event => {
    if (event.keyCode === TV_KEY.BACK) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (isTextField(event.target) && event.target.dataset.editing) stopEdit(event.target);
      else tvBack();
      return;
    }
    const isPlayerOpen = !$('player').hidden && !document.querySelector('dialog[open]');
    if (isPlayerOpen) {
      handlePlayerKey(event);
      return;
    }
    const target = event.target;
    if (
      event.key === 'Enter' &&
      target.matches &&
      target.matches('#cats li,#items li[data-i],.eps li[data-e],input[type=checkbox],input[type=radio]')
    ) {
      event.preventDefault();
      target.click();
      return;
    }
    if (event.key === 'Enter' && isTextField(target) && !(target.matches('textarea') && target.dataset.editing)) {
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
    if (target.closest && target.closest('#plMenu')) return;
    if (target.id === 'plSel' && direction === 'down') return;
    if (isTextField(target) && target.dataset.editing) {
      if (direction === 'left' || direction === 'right') return;
      stopEdit(target);
    }
    if (target.matches && target.matches('input[type=range]') && (direction === 'left' || direction === 'right')) return;
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
  if (!seasonButton.matches || !seasonButton.matches('.stabs [data-s]') || seasonButton.isConnected) return;
  const newSeasonButton = document.querySelector('dialog[open] .stabs [data-s="' + seasonButton.dataset.s + '"]');
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
