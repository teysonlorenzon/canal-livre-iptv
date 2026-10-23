'use strict';
/**
 * Abre uma seção (carregando-a se preciso) e reinicia filtros.
 * @param {Secao} s Seção.
 * @returns {Promise<void>}
 */
async function openSection(s){ if (!(await ensureSection(s))) return; renderHome(); sec = s; cat = '*'; shown = 200; $('q').value = ''; $('sort').value = ''; show('section'); renderCats(); renderItems(); }

/**
 * Desenha a lista de categorias da seção atual com contagens.
 * @returns {void}
 */
function renderCats(){
  const cs = D[sec].cats.filter(c => !ux.hidden.includes(sec+':'+c.id));
  const cnt = new Map(); for (const i of D[sec].items) cnt.set(i.cat, (cnt.get(i.cat)||0) + 1);
  const total = D[sec].items.filter(i => !ux.hidden.includes(sec+':'+i.cat)).length;
  const rows = [{ id:'*', name:'Todos', n:total }, { id:'fav', name:'★ Favoritos', n:ux.fav[sec].length }];
  if (sec === 'live') rows.push({ id:'recent', name:'Recentes', n:ux.recentLive.length });
  rows.push(...cs.map(c => ({ ...c, n:cnt.get(c.id)||0 })));
  $('cats').innerHTML = rows.map(c => `<li data-c="${esc(c.id)}" class="${c.id === cat ? 'on' : ''}"><span>${esc(c.name)}</span>${ux.locked.includes(sec+':'+c.id) ? '<span class="lock" title="Bloqueada">🔒</span>' : ''}<small>${c.n}</small></li>`).join('');
  $('secTitle').textContent = SEC[sec];
  $('sort').querySelector('[value=new]').hidden = $('sort').querySelector('[value=rate]').hidden = sec === 'live';
}
/**
 * Seleciona uma categoria (pedindo PIN se bloqueada).
 * @param {MouseEvent} e Evento de clique.
 */
$('cats').onclick = e => {
  const li = e.target.closest('li'); if (!li) return;
  const c = li.dataset.c;
  withPin(sec+':'+c, () => { cat = c; shown = 200; renderCats(); renderItems(); $('items').scrollTop = 0; });
};

/**
 * Executa uma ação, pedindo o PIN do controle parental quando a chave estiver bloqueada.
 * @param {string} key Chave bloqueável (`secao:categoria`).
 * @param {Function} fn Ação a executar após liberar.
 * @param {boolean} [force] Exigir o PIN mesmo sem bloqueio.
 * @returns {*} Retorno de `fn` quando executada sem PIN.
 */
function withPin(key, fn, force){
  if (!force && (!ux.locked.includes(key) || unlocked.has(key))) return fn();
  $('pinIn').value = ''; $('dPin').showModal(); $('pinIn').focus();
  /**
   * Confere o PIN digitado e libera a ação se estiver correto.
   * @returns {void}
   */
  const check = () => { if ($('pinIn').value === (opts.pin || '0000')) { unlocked.add(key); $('dPin').close(); fn(); } else { $('pinIn').value = ''; toast('PIN incorreto.'); } };
  $('pinOk').onclick = check;
  $('pinIn').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); check(); } };
  $('pinForm').onsubmit = e => e.preventDefault();
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
  const q = $('q').value.trim().toLowerCase(), so = $('sort').value;
  let a = D[sec].items;
  if (cat === 'fav') a = ux.fav[sec].map(k => a.find(i => i.k === k)).filter(Boolean);
  else if (cat === 'recent') a = ux.recentLive.map(k => a.find(i => i.k === k)).filter(Boolean);
  else if (cat !== '*') a = a.filter(i => i.cat === cat);
  a = a.filter(i => !ux.hidden.includes(sec+':'+i.cat) && (cat === i.cat || !ux.locked.includes(sec+':'+i.cat) || unlocked.has(sec+':'+i.cat)));
  if (q) a = a.filter(i => i.name.toLowerCase().includes(q));
  if (so) { a = a.slice(); const f = { az:(x,y)=>x.name.localeCompare(y.name,'pt-BR'), za:(x,y)=>y.name.localeCompare(x.name,'pt-BR'), new:(x,y)=>(y.added||0)-(x.added||0), rate:(x,y)=>(y.rate||0)-(x.rate||0) }[so]; a.sort(f); }
  return a;
}

/**
 * Desenha os itens da seção atual (lista de canais ou grade de pôsteres), paginados.
 * @returns {void}
 */
function renderItems(){
  const a = currentItems(), box = $('items'), part = a.slice(0, shown);
  if (!a.length) { box.innerHTML = `<div class="empty">${cat === 'fav' ? 'Nenhum favorito nesta seção.' : 'Nada encontrado.'}</div>`; return; }
  if (sec === 'live') {
    const cur = playing && playing.kind === 'live' ? playing.item.k : null;
    box.innerHTML = `<ul class="list">${part.map((c,i) => {
      let sub = esc(catName('live', c.cat));
      if (D.epg) { const [n] = nowNext(D.epg.get(String(c.epg||'').toLowerCase()) || []); if (n) sub = `<span style="color:var(--fg)">${esc(n.title)}</span> · ${hm(new Date(n.s))}–${hm(new Date(n.e))}`; }
      return `<li data-i="${i}" class="${c.k === cur ? 'on' : ''}"><span class="num">${esc(c.num)}</span>${c.logo ? `<img class="logo" loading="lazy" src="${esc(c.logo)}" alt="" onerror="this.outerHTML='<span class=logo>${initials(c.name)}</span>'">` : `<span class="logo">${initials(c.name)}</span>`}<span class="nm"><b>${esc(c.name)}${c.archive ? '<span class="badge">CATCH-UP</span>' : ''}</b><small>${sub}</small></span><button class="star ${isFav('live', c.k) ? 'on' : ''}" aria-label="Favoritar">★</button></li>`;
    }).join('')}</ul>`;
  } else {
    box.innerHTML = `<div class="grid">${part.map((it,i) => cardHtml({ ...it, pg: progressOf(sec, it) }, `data-i="${i}"`)).join('')}</div>`;
  }
  if (a.length > shown) box.insertAdjacentHTML('beforeend', `<div class="more"><button class="btn" id="moreBtn">Mostrar mais (${a.length - shown} restantes)</button></div>`);
  const mb = $('moreBtn'); if (mb) mb.onclick = () => { shown += 300; renderItems(); };
  box._a = a;
}
/**
 * Nome de uma categoria.
 * @param {Secao} s Seção.
 * @param {string} id Id da categoria.
 * @returns {string} Nome, ou vazio se não existir.
 */
const catName = (s, id) => (D[s].cats.find(c => c.id === id) || {}).name || '';
/**
 * Progresso assistido de um item.
 * @param {Secao} s Seção.
 * @param {Item} it Item.
 * @returns {number} Fração de 0 a 1.
 */
const progressOf = (s, it) => { const h = ux.hist.find(x => x.ref === s + ':' + it.k); return h && h.dur ? h.pos / h.dur : 0; };

/**
 * Abre um item ou alterna seu favorito.
 * @param {MouseEvent} e Evento de clique.
 */
$('items').onclick = e => {
  const el = e.target.closest('[data-i]'); if (!el) return;
  const it = $('items')._a[+el.dataset.i];
  if (e.target.classList.contains('star')) { e.target.classList.toggle('on', toggleFav(sec, it.k)); if (cat === 'fav') renderItems(); renderCats(); return; }
  const go = () => sec === 'live' ? playLive(it, $('items')._a) : sec === 'vod' ? openMovie(it) : openSeries(it);
  withPin(sec+':'+it.cat, go);
};
let qT;
/**
 * Refaz a busca 150 ms após o usuário parar de digitar.
 */
$('q').oninput = () => { clearTimeout(qT); qT = setTimeout(() => { shown = 200; renderItems(); }, 150); };
/**
 * Reordena os itens.
 */
$('sort').onchange = () => { shown = 200; renderItems(); };
