'use strict';
/**
 * Atualiza os relógios do topo e do player a cada segundo.
 */
setInterval(() => { const t = hm(new Date()); $('clock').textContent = t; $('plClock').textContent = t; }, 1000);

/**
 * Alterna entre a tela inicial e a tela de seção.
 * @param {'home'|'section'} view Tela a exibir.
 * @returns {void}
 */
function show(view){
  $('home').hidden = view !== 'home';
  $('section').hidden = view !== 'section';
  if (view === 'home') renderHome();
}
/**
 * Volta para a tela inicial.
 */
$('goHome').onclick = () => show('home');
applyTheme(getTheme());
/**
 * Alterna o tema (automático → claro → escuro) e avisa qual ficou ativo.
 */
$('themeBtn').onclick = () => toast('Tema: ' + THEME_INFO[cycleTheme()].label);

/**
 * Desenha a tela inicial: boas-vindas/erro, ou atalhos das seções,
 * dados da conta, "continuar assistindo", recentes e favoritos.
 * @returns {void}
 */
function renderHome(){
  const h = $('home');
  if (!P || !D) {
    const env = location.protocol === 'https:' ? '<p style="color:var(--accent)">Atenção: esta página está aberta em https. Listas e canais em http são bloqueados aqui. Baixe o arquivo e abra direto no navegador do computador.</p>' : '';
    h.innerHTML = lastError && P
      ? `<div class="welcome"><h2>Não foi possível abrir “${esc(P.name)}”</h2><p>${esc(lastError)}</p>${env}<div class="row" style="justify-content:center"><button class="btn primary" id="wRetry">Tentar de novo</button><button class="btn" id="wAdd">Configurações</button></div></div>`
      : `<div class="welcome"><h2>${pls.length ? 'Escolha uma lista para começar' : 'Adicione sua lista IPTV'}</h2><p>Funciona com login Xtream Codes (servidor, usuário e senha), URL M3U ou arquivo .m3u. Tudo fica salvo neste navegador.</p>${env}<button class="btn primary" id="wAdd">${pls.length ? 'Gerenciar listas' : 'Adicionar lista'}</button></div>`;
    $('wAdd').onclick = openSettings;
    if ($('wRetry')) $('wRetry').onclick = () => openPlaylist(P.id, true);
    return;
  }
  /**
   * Conta os itens visíveis (fora de categorias ocultas) de uma seção.
   * @param {Secao} s Seção.
   * @returns {number|null} Quantidade, ou `null` se ainda não carregada.
   */
  const vis = s => D[s] ? D[s].items.filter(i => !ux.hidden.includes(s+':'+i.cat)).length : null;
  /**
   * Texto de contagem do bloco de uma seção.
   * @param {Secao} s Seção.
   * @param {string} w Palavra da unidade (ex.: "títulos").
   * @returns {string} Texto exibido.
   */
  const cnt = (s, w) => vis(s) == null ? (sectionJobs[s] ? 'Carregando…' : 'Toque para carregar') : `${vis(s)} ${w}`;
  let acct = '';
  if (D.info) {
    const u = D.info.user_info, exp = +u.exp_date ? new Date(u.exp_date*1000).toLocaleDateString('pt-BR') : 'Ilimitado';
    acct = `<div class="acct"><span>Status <b>${esc(u.status)}</b></span><span>Vence <b>${exp}</b></span><span>Conexões <b>${esc(u.active_cons)}/${esc(u.max_connections)}</b></span><span>Usuário <b>${esc(u.username)}</b></span></div>`;
  }
  const cont = ux.hist.filter(x => !x.hidden && x.desc && x.dur && x.pos / x.dur < 0.95).slice(0, 20);
  const favLive = ux.fav.live.map(k => D.live.items.find(i => i.k === k)).filter(Boolean).slice(0, 20);
  const recLive = ux.recentLive.map(k => D.live.items.find(i => i.k === k)).filter(Boolean).slice(0, 20);
  h.innerHTML = `
    <div class="tiles">
      <button class="tile live" data-sec="live"><em>● AO VIVO</em><b>TV ao vivo</b><span>${vis('live')} canais</span></button>
      <button class="tile" data-sec="vod"><em>FILMES</em><b>Filmes</b><span>${cnt('vod','títulos')}</span></button>
      <button class="tile" data-sec="series"><em>SÉRIES</em><b>Séries</b><span>${cnt('series','séries')}</span></button>
    </div>
    ${acct}
    <div class="shelves">
      ${shelfHtml('cont', 'Continuar assistindo', 'De onde você parou', cont.length, cont.map((x,i) => cardHtml({ name:x.title, logo:x.logo, pg:x.pos/x.dur }, 'data-cont="'+i+'"')).join(''), 'Filmes e episódios que você começar aparecem aqui.')}
      ${shelfHtml('recent', 'Canais recentes', 'Assistidos por último', recLive.length, recLive.map(c => chipHtml(c)).join(''), 'Os canais que você assistir aparecem aqui.')}
      ${shelfHtml('fav', 'Canais favoritos', 'Seus canais marcados', favLive.length, favLive.map(c => chipHtml(c)).join(''), 'Toque na estrela ★ de um canal para favoritar.')}
    </div>`;
  h.querySelectorAll('[data-sec]').forEach(b => b.onclick = () => openSection(b.dataset.sec));
  h.querySelectorAll('[data-cont]').forEach(b => b.onclick = () => { const x = cont[+b.dataset.cont]; playMedia(x.desc, x.pos); });
  h.querySelectorAll('[data-live]').forEach(b => b.onclick = () => { const c = D.live.items.find(i => i.k === b.dataset.live); playLive(c, D.live.items); });
}
/**
 * HTML de uma prateleira da tela inicial: cabeçalho com ícone e contagem, e a faixa de
 * cartões (ou um estado vazio).
 * @param {'cont'|'recent'|'fav'} kind Tipo (define ícone e cor).
 * @param {string} title Título.
 * @param {string} sub Subtítulo.
 * @param {number} n Quantidade de itens.
 * @param {string} items HTML dos cartões.
 * @param {string} empty Texto do estado vazio.
 * @returns {string} HTML.
 */
const shelfHtml = (kind, title, sub, n, items, empty) => `<section class="shelf shelf-${kind}">
  <div class="shelf-h"><span class="shelf-ico">${icon(kind === 'fav' ? 'star' : kind)}</span><div><h3>${title}</h3><small>${sub}</small></div>${n ? `<span class="shelf-n">${n}</span>` : ''}</div>
  ${n ? `<div class="strip">${items}</div>` : `<div class="shelf-empty"><span class="shelf-ghost"></span><span class="shelf-ghost"></span><span class="shelf-ghost"></span><p>${empty}</p></div>`}
</section>`;
/**
 * HTML do cartão compacto de um canal.
 * @param {Item} c Canal.
 * @returns {string} HTML.
 */
const chipHtml = c => `<button class="card" data-live="${esc(c.k)}" style="flex:0 0 130px"><div class="poster" style="aspect-ratio:16/10">${c.logo ? `<img loading="lazy" src="${esc(c.logo)}" alt="" style="object-fit:contain;padding:10px" onerror="this.remove()">` : ''}${initials(c.name)}</div><b>${esc(c.name)}</b></button>`;
/**
 * HTML do cartão com pôster de um filme, série ou item do histórico.
 * @param {{name: string, logo?: string, rate?: number, pg?: number}} it Dados do cartão (`pg` = progresso de 0 a 1).
 * @param {string} attr Atributos extras do botão.
 * @returns {string} HTML.
 */
const cardHtml = (it, attr) => `<button class="card" ${attr}><div class="poster">${initials(it.name)}${it.logo ? `<img loading="lazy" src="${esc(it.logo)}" alt="" onerror="this.remove()">` : ''}${it.rate ? `<span class="rt">★ ${(+it.rate).toFixed(1)}</span>` : ''}${it.pg ? `<span class="pg" style="width:${Math.min(100, it.pg*100)}%"></span>` : ''}</div><b>${esc(it.name)}</b></button>`;
