'use strict';
/**
 * Abre uma seção (carregando-a se preciso) e reinicia filtros.
 * @param {Secao} sectionName Seção.
 * @returns {Promise<void>}
 */
async function openSection(sectionName){ if (!(await ensureSection(sectionName))) return; renderHome(); currentSection = sectionName; currentCategory = '*'; visibleItemCount = 200; $('q').value = ''; $('sort').value = ''; show('section'); renderCats(); renderItems(); }

/**
 * Desenha a lista de categorias da seção atual com contagens.
 * @returns {void}
 */
function renderCats(){
  const visibleCategories = catalog[currentSection].cats.filter(category => !userData.hidden.includes(currentSection+':'+category.id));
  const itemCountByCategory = new Map(); for (const item of catalog[currentSection].items) itemCountByCategory.set(item.cat, (itemCountByCategory.get(item.cat)||0) + 1);
  const totalVisible = catalog[currentSection].items.filter(item => !userData.hidden.includes(currentSection+':'+item.cat)).length;
  const categoryRows = [{ id:'*', name:'Todos', n:totalVisible }, { id:'fav', name:'★ Favoritos', n:userData.fav[currentSection].length }];
  if (currentSection === 'live') categoryRows.push({ id:'recent', name:'Recentes', n:userData.recentLive.length });
  categoryRows.push(...visibleCategories.map(category => ({ ...category, n:itemCountByCategory.get(category.id)||0 })));
  $('cats').innerHTML = categoryRows.map(categoryRow => `<li data-c="${esc(categoryRow.id)}" class="${categoryRow.id === currentCategory ? 'on' : ''}"><span>${esc(categoryRow.name)}</span>${userData.locked.includes(currentSection+':'+categoryRow.id) ? '<span class="lock" title="Bloqueada">🔒</span>' : ''}<small>${categoryRow.n}</small></li>`).join('');
  $('secTitle').textContent = SECTION_NAMES[currentSection];
  $('sort').querySelector('[value=new]').hidden = $('sort').querySelector('[value=rate]').hidden = currentSection === 'live';
}
/**
 * Seleciona uma categoria (pedindo PIN se bloqueada).
 * @param {MouseEvent} clickEvent Evento de clique.
 */
$('cats').onclick = clickEvent => {
  const categoryItem = clickEvent.target.closest('li'); if (!categoryItem) return;
  const categoryId = categoryItem.dataset.c;
  withPin(currentSection+':'+categoryId, () => { currentCategory = categoryId; visibleItemCount = 200; renderCats(); renderItems(); $('items').scrollTop = 0; });
};

/**
 * Executa uma ação, pedindo o PIN do controle parental quando a chave estiver bloqueada.
 * @param {string} key Chave bloqueável (`secao:categoria`).
 * @param {Function} action Ação a executar após liberar.
 * @param {boolean} [force] Exigir o PIN mesmo sem bloqueio.
 * @returns {*} Retorno de `action` quando executada sem PIN.
 */
function withPin(key, action, force){
  if (!force && (!userData.locked.includes(key) || unlockedCategories.has(key))) return action();
  $('pinIn').value = ''; $('dPin').showModal(); $('pinIn').focus();
  /**
   * Confere o PIN digitado e libera a ação se estiver correto.
   * @returns {void}
   */
  const checkPin = () => { if ($('pinIn').value === (options.pin || '0000')) { unlockedCategories.add(key); $('dPin').close(); action(); } else { $('pinIn').value = ''; toast('PIN incorreto.'); } };
  $('pinOk').onclick = checkPin;
  $('pinIn').onkeydown = keyEvent => { if (keyEvent.key === 'Enter') { keyEvent.preventDefault(); checkPin(); } };
  $('pinForm').onsubmit = submitEvent => submitEvent.preventDefault();
}
/**
 * Fecha o diálogo de PIN.
 */
$('pinCancel').onclick = () => $('dPin').close();

/**
 * Itens da seção atual após aplicar categoria, bloqueios, busca e ordenação.
 * @returns {Item[]} Itens filtrados.
 */
function currentItems(){
  const searchText = $('q').value.trim().toLowerCase(), sortOrder = $('sort').value;
  let filteredItems = catalog[currentSection].items;
  if (currentCategory === 'fav') filteredItems = userData.fav[currentSection].map(itemKey => filteredItems.find(item => item.k === itemKey)).filter(Boolean);
  else if (currentCategory === 'recent') filteredItems = userData.recentLive.map(itemKey => filteredItems.find(item => item.k === itemKey)).filter(Boolean);
  else if (currentCategory !== '*') filteredItems = filteredItems.filter(item => item.cat === currentCategory);
  filteredItems = filteredItems.filter(item => !userData.hidden.includes(currentSection+':'+item.cat) && (currentCategory === item.cat || !userData.locked.includes(currentSection+':'+item.cat) || unlockedCategories.has(currentSection+':'+item.cat)));
  if (searchText) filteredItems = filteredItems.filter(item => item.name.toLowerCase().includes(searchText));
  if (sortOrder) { filteredItems = filteredItems.slice(); const compareItems = { az:(firstItem,secondItem)=>firstItem.name.localeCompare(secondItem.name,'pt-BR'), za:(firstItem,secondItem)=>secondItem.name.localeCompare(firstItem.name,'pt-BR'), new:(firstItem,secondItem)=>(secondItem.added||0)-(firstItem.added||0), rate:(firstItem,secondItem)=>(secondItem.rate||0)-(firstItem.rate||0) }[sortOrder]; filteredItems.sort(compareItems); }
  return filteredItems;
}

/**
 * Desenha os itens da seção atual (lista de canais ou grade de pôsteres), paginados.
 * @returns {void}
 */
function renderItems(){
  const allItems = currentItems(), itemsBox = $('items'), visibleItems = allItems.slice(0, visibleItemCount);
  if (!allItems.length) { itemsBox.innerHTML = `<div class="empty">${currentCategory === 'fav' ? 'Nenhum favorito nesta seção.' : 'Nada encontrado.'}</div>`; return; }
  if (currentSection === 'live') {
    const playingChannelKey = currentMedia && currentMedia.kind === 'live' ? currentMedia.item.k : null;
    itemsBox.innerHTML = `<ul class="list">${visibleItems.map((channel, index) => {
      let subtitleHtml = esc(catName('live', channel.cat));
      if (catalog.epg) { const [currentProgram] = nowNext(catalog.epg.get(String(channel.epg||'').toLowerCase()) || []); if (currentProgram) subtitleHtml = `<span style="color:var(--fg)">${esc(currentProgram.title)}</span> · ${formatHourMinute(new Date(currentProgram.s))}–${formatHourMinute(new Date(currentProgram.e))}`; }
      return `<li data-i="${index}" class="${channel.k === playingChannelKey ? 'on' : ''}"><span class="num">${esc(channel.num)}</span>${channel.logo ? `<img class="logo" loading="lazy" src="${esc(channel.logo)}" alt="" onerror="this.outerHTML='<span class=logo>${initials(channel.name)}</span>'">` : `<span class="logo">${initials(channel.name)}</span>`}<span class="nm"><b>${esc(channel.name)}${channel.archive ? '<span class="badge">CATCH-UP</span>' : ''}</b><small>${subtitleHtml}</small></span><button class="star ${isFav('live', channel.k) ? 'on' : ''}" aria-label="Favoritar">★</button></li>`;
    }).join('')}</ul>`;
  } else {
    itemsBox.innerHTML = `<div class="grid">${visibleItems.map((item, index) => cardHtml({ ...item, pg: progressOf(currentSection, item) }, `data-i="${index}"`)).join('')}</div>`;
  }
  if (allItems.length > visibleItemCount) itemsBox.insertAdjacentHTML('beforeend', `<div class="more"><button class="btn" id="moreBtn">Mostrar mais (${allItems.length - visibleItemCount} restantes)</button></div>`);
  const moreButton = $('moreBtn'); if (moreButton) moreButton.onclick = () => { visibleItemCount += 300; renderItems(); };
  itemsBox._a = allItems;
}
/**
 * Nome de uma categoria.
 * @param {Secao} sectionName Seção.
 * @param {string} id Id da categoria.
 * @returns {string} Nome, ou vazio se não existir.
 */
const catName = (sectionName, id) => (catalog[sectionName].cats.find(category => category.id === id) || {}).name || '';
/**
 * Progresso assistido de um item.
 * @param {Secao} sectionName Seção.
 * @param {Item} item Item.
 * @returns {number} Fração de 0 a 1.
 */
const progressOf = (sectionName, item) => { const historyEntry = userData.hist.find(entry => entry.ref === sectionName + ':' + item.k); return historyEntry && historyEntry.dur ? historyEntry.pos / historyEntry.dur : 0; };

/**
 * Abre um item ou alterna seu favorito.
 * @param {MouseEvent} clickEvent Evento de clique.
 */
$('items').onclick = clickEvent => {
  const itemElement = clickEvent.target.closest('[data-i]'); if (!itemElement) return;
  const item = $('items')._a[+itemElement.dataset.i];
  if (clickEvent.target.classList.contains('star')) { clickEvent.target.classList.toggle('on', toggleFav(currentSection, item.k)); if (currentCategory === 'fav') renderItems(); renderCats(); return; }
  const openItem = () => currentSection === 'live' ? playLive(item, $('items')._a) : currentSection === 'vod' ? openMovie(item) : openSeries(item);
  withPin(currentSection+':'+item.cat, openItem);
};
let searchDebounceTimer;
/**
 * Refaz a busca 150 ms após o usuário parar de digitar.
 */
$('q').oninput = () => { clearTimeout(searchDebounceTimer); searchDebounceTimer = setTimeout(() => { visibleItemCount = 200; renderItems(); }, 150); };
/**
 * Reordena os itens.
 */
$('sort').onchange = () => { visibleItemCount = 200; renderItems(); };
