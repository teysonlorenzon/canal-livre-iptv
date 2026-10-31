import { $, $optional, closest, queryAll } from '../../core/dom';
import { activeCatalog, isFav, removeRecentChannel, state, toggleFav } from '../../core/state';
import type { Item, SectionName, TimerId } from '../../core/types';
import { esc, formatHourMinute, initials, onDialogClose, SECTION_NAMES, toast } from '../../core/utils';
import { nowNext } from '../../data/epg';
import { ensureSection } from '../../data/xtream';
import { icon } from '../../ui/icons';
import { bindScrollArrows, updateScrollArrows } from '../../ui/scroll-arrows';
import { openMovie, openSeries } from '../details/details';
import { cardHtml, renderHome, show } from '../home/home';
import { playback } from '../player/playback';
import { playLive } from '../player/player';

/**
 * Abre uma seção (carregando-a se preciso) e reinicia filtros.
 * @param sectionName Seção.
 */
export async function openSection(sectionName: SectionName): Promise<void> {
  if (!(await ensureSection(sectionName))) return;
  renderHome();
  state.currentSection = sectionName;
  state.currentCategory = '*';
  state.visibleItemCount = 200;
  $('q').value = '';
  $('sort').value = '';
  show('section');
  renderCats();
  renderItems();
}

/**
 * Desenha a lista de categorias da seção atual com contagens.
 */
export function renderCats(): void {
  const sectionData = activeCatalog()[state.currentSection];
  if (!sectionData) return;
  const visibleCategories = sectionData.cats.filter(category => !state.userData.hidden.includes(state.currentSection + ':' + category.id));
  const itemCountByCategory = new Map<string, number>();
  for (const item of sectionData.items) itemCountByCategory.set(item.cat, (itemCountByCategory.get(item.cat) || 0) + 1);
  const totalVisible = sectionData.items.filter(item => !state.userData.hidden.includes(state.currentSection + ':' + item.cat)).length;
  const categoryRows: { id: string; name: string; n: number }[] = [
    { id: '*', name: 'Todos', n: totalVisible },
    { id: 'fav', name: '★ Favoritos', n: state.userData.fav[state.currentSection].length },
  ];
  if (state.currentSection === 'live') categoryRows.push({ id: 'recent', name: 'Recentes', n: state.userData.recentLive.length });
  categoryRows.push(...visibleCategories.map(category => ({ ...category, n: itemCountByCategory.get(category.id) || 0 })));
  $('cats').innerHTML = categoryRows
    .map(
      categoryRow =>
        `<li data-c="${esc(categoryRow.id)}" class="${categoryRow.id === state.currentCategory ? 'on' : ''}"><span>${esc(categoryRow.name)}</span>${state.userData.locked.includes(state.currentSection + ':' + categoryRow.id) ? '<span class="lock" title="Bloqueada">🔒</span>' : ''}<small>${categoryRow.n}</small></li>`,
    )
    .join('');
  $('secTitle').textContent = SECTION_NAMES[state.currentSection];
  updateScrollArrows($('cats'), $('catsArrows'));
  queryAll($('sort'), '[value=new],[value=rate]').forEach(sortOption => {
    sortOption.hidden = state.currentSection === 'live';
  });
}

/**
 * Executa uma ação, pedindo o PIN do controle parental quando a chave estiver bloqueada.
 * @param key Chave bloqueável (`secao:categoria`).
 * @param action Ação a executar após liberar.
 * @param force Exigir o PIN mesmo sem bloqueio.
 */
export function withPin(key: string, action: () => void, force?: boolean): void {
  if (!force && (!state.userData.locked.includes(key) || state.unlockedCategories.has(key))) {
    action();
    return;
  }
  requestPin(state.options.pin || '0000', () => {
    state.unlockedCategories.add(key);
    action();
  });
}
/**
 * Abre o diálogo de PIN e executa a ação quando o PIN digitado for o esperado.
 * @param expectedPin PIN correto.
 * @param action Ação a executar após acertar.
 * @param message Texto do diálogo (padrão: aviso de conteúdo bloqueado).
 * @param onCancel Chamada se o usuário cancelar.
 * @param title Título do diálogo (padrão: "Digite o PIN" com mensagem, ou "Conteúdo bloqueado"); com título, o botão vira "Continuar".
 */
export function requestPin(
  expectedPin: string,
  action: () => void,
  message?: string,
  onCancel?: (() => void) | null,
  title?: string,
): void {
  $('pinTitle').textContent = title || (message ? 'Digite o PIN' : 'Conteúdo bloqueado');
  $('pinOk').textContent = title ? 'Continuar' : 'Desbloquear';
  $('pinHint').textContent = message || 'Digite o PIN do controle parental.';
  $('pinIn').value = '';
  $('pinError').hidden = true;
  $('pinIn').classList.remove('wrong');
  $('dPin').showModal();
  $('pinIn').focus();
  /**
   * Confere o PIN digitado e libera a ação se estiver correto.
   */
  const checkPin = (): void => {
    if ($('pinIn').value === expectedPin) {
      pinCancelAction = null;
      $('dPin').close();
      action();
      return;
    }
    $('pinIn').value = '';
    $('pinError').hidden = true;
    void $('pinError').offsetWidth;
    $('pinError').hidden = false;
    $('pinIn').classList.add('wrong');
    $('pinIn').focus();
  };
  pinCancelAction = onCancel || null;
  $('pinOk').onclick = checkPin;
  $('pinIn').onkeydown = keyEvent => {
    if (keyEvent.key === 'Enter') {
      keyEvent.preventDefault();
      checkPin();
    }
  };
  $('pinForm').onsubmit = submitEvent => submitEvent.preventDefault();
}
/** O que fazer se o pedido de PIN atual for cancelado. */
let pinCancelAction: (() => void) | null = null;

/** Comparação de itens de cada opção de ordenação. */
const ITEM_ORDERS: Record<string, (firstItem: Item, secondItem: Item) => number> = {
  az: (firstItem, secondItem) => firstItem.name.localeCompare(secondItem.name, 'pt-BR'),
  za: (firstItem, secondItem) => secondItem.name.localeCompare(firstItem.name, 'pt-BR'),
  new: (firstItem, secondItem) => (secondItem.added || 0) - (firstItem.added || 0),
  rate: (firstItem, secondItem) => (secondItem.rate || 0) - (firstItem.rate || 0),
};

/**
 * Itens da seção atual após aplicar categoria, bloqueios, busca e ordenação.
 * @returns Itens filtrados.
 */
function currentItems(): Item[] {
  const searchText = $('q').value.trim().toLowerCase(),
    sortOrder = $('sort').value;
  const sectionItems = activeCatalog()[state.currentSection]?.items ?? [];
  let filteredItems = sectionItems;
  if (state.currentCategory === 'fav')
    filteredItems = state.userData.fav[state.currentSection]
      .map(itemKey => sectionItems.find(item => item.k === itemKey))
      .filter(item => item !== undefined);
  else if (state.currentCategory === 'recent')
    filteredItems = state.userData.recentLive
      .map(itemKey => sectionItems.find(item => item.k === itemKey))
      .filter(item => item !== undefined);
  else if (state.currentCategory !== '*') filteredItems = filteredItems.filter(item => item.cat === state.currentCategory);
  filteredItems = filteredItems.filter(
    item =>
      !state.userData.hidden.includes(state.currentSection + ':' + item.cat) &&
      (state.currentCategory === item.cat ||
        !state.userData.locked.includes(state.currentSection + ':' + item.cat) ||
        state.unlockedCategories.has(state.currentSection + ':' + item.cat)),
  );
  if (searchText) filteredItems = filteredItems.filter(item => item.name.toLowerCase().includes(searchText));
  if (sortOrder) {
    filteredItems = filteredItems.slice();
    filteredItems.sort(ITEM_ORDERS[sortOrder]);
  }
  return filteredItems;
}

/**
 * Desenha os itens da seção atual (lista de canais ou grade de pôsteres), paginados.
 */
export function renderItems(): void {
  const allItems = currentItems(),
    itemsBox = $('items'),
    visibleItems = allItems.slice(0, state.visibleItemCount);
  if (!allItems.length) {
    itemsBox.innerHTML = `<div class="empty">${state.currentCategory === 'fav' ? 'Nenhum favorito nesta seção.' : 'Nada encontrado.'}</div>`;
    return;
  }
  if (state.currentSection === 'live') {
    const playingChannelKey = playback.currentMedia?.kind === 'live' ? playback.currentMedia.item.k : null;
    const isRecentCategory = state.currentCategory === 'recent';
    const programmesByChannel = activeCatalog().epg;
    itemsBox.innerHTML = `<ul class="list">${visibleItems
      .map((channel, index) => {
        let subtitleHtml = esc(catName('live', channel.cat));
        if (programmesByChannel) {
          const [currentProgram] = nowNext(programmesByChannel.get(String(channel.epg || '').toLowerCase()) || []);
          if (currentProgram)
            subtitleHtml = `<span style="color:var(--fg)">${esc(currentProgram.title)}</span> · ${formatHourMinute(new Date(currentProgram.s))}–${formatHourMinute(new Date(currentProgram.e))}`;
        }
        return `<li data-i="${index}" class="${channel.k === playingChannelKey ? 'on' : ''}${isRecentCategory ? ' rm' : ''}"><span class="num">${esc(channel.num)}</span>${channel.logo ? `<img class="logo" loading="lazy" src="${esc(channel.logo)}" alt="" onerror="this.outerHTML='<span class=logo>${initials(channel.name)}</span>'">` : `<span class="logo">${initials(channel.name)}</span>`}<span class="nm"><b>${esc(channel.name)}${channel.archive ? '<span class="badge">CATCH-UP</span>' : ''}</b><small>${subtitleHtml}</small></span>${isRecentCategory ? `<button class="del" aria-label="Remover dos recentes" title="Remover dos recentes">${icon('close')}</button>` : ''}<button class="star ${isFav('live', channel.k) ? 'on' : ''}" aria-label="Favoritar">★</button></li>`;
      })
      .join('')}</ul>`;
  } else {
    itemsBox.innerHTML = `<div class="grid">${visibleItems.map((item, index) => cardHtml({ ...item, pg: progressOf(state.currentSection, item) }, `data-i="${index}"`)).join('')}</div>`;
  }
  if (allItems.length > state.visibleItemCount)
    itemsBox.insertAdjacentHTML(
      'beforeend',
      `<div class="more"><button class="btn" id="moreBtn">Mostrar mais (${allItems.length - state.visibleItemCount} restantes)</button></div>`,
    );
  const moreButton = $optional('moreBtn');
  if (moreButton)
    moreButton.onclick = () => {
      state.visibleItemCount += 300;
      renderItems();
    };
  state.listedItems = allItems;
}
/**
 * Nome de uma categoria.
 * @param sectionName Seção.
 * @param id Id da categoria.
 * @returns Nome, ou vazio se não existir.
 */
const catName = (sectionName: SectionName, id: string): string =>
  activeCatalog()[sectionName]?.cats.find(category => category.id === id)?.name ?? '';
/**
 * Progresso assistido de um item.
 * @param sectionName Seção.
 * @param item Item.
 * @returns Fração de 0 a 1.
 */
const progressOf = (sectionName: SectionName, item: Item): number => {
  const historyEntry = state.userData.hist.find(entry => entry.ref === sectionName + ':' + item.k);
  return historyEntry && historyEntry.dur ? historyEntry.pos / historyEntry.dur : 0;
};
/** Timer que refaz a busca depois da digitação. */
let searchDebounceTimer: TimerId | undefined;

/**
 * Liga os eventos desta parte do app. Chamada uma vez, na ordem de `main.ts`.
 */
export function initSection(): void {
  bindScrollArrows($('cats'), $('catsArrows'));

  /**
   * Seleciona uma categoria (pedindo PIN se bloqueada).
   * @param clickEvent Evento de clique.
   */
  $('cats').onclick = clickEvent => {
    const categoryItem = closest(clickEvent.target, 'li');
    if (!categoryItem) return;
    const categoryId = categoryItem.dataset.c ?? '*';
    withPin(state.currentSection + ':' + categoryId, () => {
      state.currentCategory = categoryId;
      state.visibleItemCount = 200;
      renderCats();
      renderItems();
      $('items').scrollTop = 0;
    });
  };

  /**
   * Ao digitar de novo, some o aviso de PIN incorreto.
   */
  $('pinIn').addEventListener('input', () => {
    $('pinError').hidden = true;
    $('pinIn').classList.remove('wrong');
  });

  /**
   * Fecha o diálogo de PIN.
   */
  $('pinCancel').onclick = () => $('dPin').close();

  /**
   * Ao fechar sem acertar o PIN (Cancelar, Esc ou Voltar), executa a ação de cancelamento.
   */
  onDialogClose($('dPin'), () => {
    const cancelAction = pinCancelAction;
    pinCancelAction = null;
    if (cancelAction) cancelAction();
  });

  /**
   * Abre um item, alterna seu favorito ou o remove dos recentes.
   * @param clickEvent Evento de clique.
   */
  $('items').onclick = clickEvent => {
    const itemElement = closest(clickEvent.target, '[data-i]');
    if (!itemElement) return;
    const item = state.listedItems[Number(itemElement.dataset.i)];
    if (!item) return;
    if (closest(clickEvent.target, '.del')) {
      removeRecentChannel(item.k);
      toast('Removido dos recentes.');
      renderItems();
      renderCats();
      return;
    }
    if (clickEvent.target instanceof Element && clickEvent.target.classList.contains('star')) {
      clickEvent.target.classList.toggle('on', toggleFav(state.currentSection, item.k));
      if (state.currentCategory === 'fav') renderItems();
      renderCats();
      return;
    }
    withPin(state.currentSection + ':' + item.cat, () => {
      if (state.currentSection === 'live') playLive(item, state.listedItems);
      else if (state.currentSection === 'vod') void openMovie(item);
      else void openSeries(item);
    });
  };

  /**
   * Refaz a busca 150 ms após o usuário parar de digitar.
   */
  $('q').oninput = () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      state.visibleItemCount = 200;
      renderItems();
    }, 150);
  };

  /**
   * Reordena os itens.
   */
  $('sort').onchange = () => {
    state.visibleItemCount = 200;
    renderItems();
  };
}
