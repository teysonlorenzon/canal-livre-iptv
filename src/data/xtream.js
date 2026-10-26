'use strict';
/**
 * URL base do servidor Xtream da lista ativa, sem barra final.
 * @returns {string} URL base.
 */
const xtreamBaseUrl = () => activePlaylist.server.replace(/\/+$/,'');
/** @type {{abort: function(): void}|null} Cancela o carregamento exibido na tela (botão "Cancelar"). */
let abortController = null;
/** @type {boolean} Se o usuário cancelou o carregamento atual. */
let cancelled = false;
/**
 * `fetch` com tempo limite e cancelamento pelo botão "Cancelar"
 * (sem depender de `AbortSignal`).
 * @param {string} url URL a buscar.
 * @param {number} [timeoutMs=30000] Tempo limite em milissegundos.
 * @param {boolean} [isBackground] Download em segundo plano: não pode ser cancelado pelo botão
 * e não interfere no carregamento exibido na tela.
 * @returns {Promise<Response>} Resposta com status de sucesso.
 * @throws {Error} Em caso de tempo esgotado, cancelamento ou status de erro.
 */
async function fetchWithTimeout(url, timeoutMs = 30000, isBackground = false){
  let timeoutTimer, rejectCancel;
  const cancelPromise = new Promise((_, reject) => { rejectCancel = reject; });
  if (!isBackground) {
    cancelled = false;
    abortController = { abort: () => { const abortError = new Error('Carregamento cancelado.'); abortError.name = 'AbortError'; rejectCancel(abortError); } };
  }
  const timeoutPromise = new Promise((_, reject) => { timeoutTimer = setTimeout(() => reject(new Error(`O servidor não respondeu em ${Math.round(timeoutMs/1000)} segundos`)), timeoutMs); });
  try {
    const response = await Promise.race([fetch(url), timeoutPromise, cancelPromise]);
    if (!response.ok) throw new Error('O servidor respondeu com erro ' + response.status);
    return response;
  } finally { clearTimeout(timeoutTimer); }
}
/**
 * Chama a API `player_api.php` do Xtream.
 * @param {string} action Ação da API (vazio para login/informações).
 * @param {string} [extraParams=''] Parâmetros extras já codificados (`&chave=valor`).
 * @param {number} [timeoutMs] Tempo limite em milissegundos.
 * @param {boolean} [isBackground] Download em segundo plano (ver {@link fetchWithTimeout}).
 * @returns {Promise<*>} JSON da resposta.
 * @throws {Error} Se a resposta não for JSON válido.
 */
const xtreamApi = async (action, extraParams='', timeoutMs, isBackground) => {
  const response = await fetchWithTimeout(`${xtreamBaseUrl()}/player_api.php?username=${encodeURIComponent(activePlaylist.user)}&password=${encodeURIComponent(activePlaylist.pass)}${action ? '&action='+action : ''}${extraParams}`, timeoutMs, isBackground);
  const responseText = await response.text();
  try { return JSON.parse(responseText); } catch { throw new Error('O servidor não respondeu no formato Xtream esperado'); }
};
/**
 * Converte um erro de carregamento em mensagem amigável.
 * @param {Error} err Erro capturado.
 * @returns {string} Mensagem para o usuário.
 */
function errText(err){
  if (cancelled) return 'Carregamento cancelado.';
  if (err instanceof TypeError) return location.protocol === 'https:'
    ? 'Bloqueado: esta página está em https e o servidor da lista usa http. Abra o arquivo baixado direto no navegador do computador.'
    : 'O servidor recusou a conexão vinda do navegador (CORS) ou está fora do ar.';
  return err.message;
}
/**
 * Monta a URL de um conteúdo Xtream.
 * @param {'live'|'movie'|'series'} kind Tipo do conteúdo.
 * @param {string|number} id Id do stream.
 * @param {string} ext Extensão do arquivo.
 * @returns {string} URL do stream.
 */
const xtreamStreamUrl = (kind, id, ext) => `${xtreamBaseUrl()}/${kind}/${encodeURIComponent(activePlaylist.user)}/${encodeURIComponent(activePlaylist.pass)}/${id}.${ext}`;

/**
 * Normaliza categorias vindas da API Xtream.
 * @param {*} apiCategories Resposta da API.
 * @returns {Categoria[]} Categorias.
 */
const xtreamCategories = apiCategories => (Array.isArray(apiCategories) ? apiCategories : []).map(apiCategory => ({ id:String(apiCategory.category_id), name:apiCategory.category_name }));
/**
 * Garante um array (a API às vezes devolve objeto ou nulo).
 * @param {*} value Valor qualquer.
 * @returns {Array} O próprio array ou um array vazio.
 */
const asArray = value => Array.isArray(value) ? value : [];
/**
 * Faz login no Xtream e baixa os canais ao vivo da lista ativa.
 * Filmes e séries ficam `null` e são baixados depois por {@link preloadSections}.
 * @returns {Promise<DadosLista>} Dados da lista.
 * @throws {Error} Se o login falhar ou a conta não estiver ativa.
 */
async function loadXtream(){
  loading('Verificando login no servidor…');
  const info = await xtreamApi('', '', 25000);
  if (!info || !info.user_info || info.user_info.auth == 0) throw new Error('Usuário ou senha inválidos');
  if (info.user_info.status && !/active/i.test(info.user_info.status)) throw new Error('Conta ' + info.user_info.status + ' no servidor');
  loading('Baixando categorias de canais…');
  const liveCategories = await xtreamApi('get_live_categories', '', 30000);
  loading('Baixando lista de canais… (pode levar até 1 minuto)');
  const liveStreams = await xtreamApi('get_live_streams', '', 90000);
  return {
    info,
    live:{ cats:xtreamCategories(liveCategories), items:asArray(liveStreams).map((stream, index) => ({ k:String(stream.stream_id), name:stream.name, logo:stream.stream_icon, cat:String(stream.category_id), num:stream.num || index+1, epg:stream.epg_channel_id, archive:+stream.tv_archive ? +stream.tv_archive_duration || 1 : 0 })) },
    vod:null, series:null
  };
}
/** @type {Partial<Record<Secao, Promise<boolean>>>} Downloads de filmes/séries em segundo plano. */
let sectionJobs = {};

/**
 * Baixa as categorias e os itens de filmes ou séries do Xtream.
 * @param {'vod'|'series'} section Seção.
 * @param {boolean} [isBackground] Baixar em segundo plano, sem a tela de carregamento.
 * @returns {Promise<DadosSecao>} Dados da seção.
 * @throws {Error} Se o servidor falhar.
 */
async function fetchSection(section, isBackground = false){
  const showProgress = isBackground ? () => {} : loading;
  if (section === 'vod') {
    showProgress('Baixando categorias de filmes…'); const vodCategories = await xtreamApi('get_vod_categories', '', 30000, isBackground);
    showProgress('Baixando filmes… (listas grandes levam até 2 minutos)'); const vodStreams = await xtreamApi('get_vod_streams', '', 150000, isBackground);
    return { cats:xtreamCategories(vodCategories), items:asArray(vodStreams).map(stream => ({ k:String(stream.stream_id), name:stream.name, logo:stream.stream_icon, cat:String(stream.category_id), ext:stream.container_extension || 'mp4', rate:+stream.rating || 0, added:+stream.added || 0 })) };
  }
  showProgress('Baixando categorias de séries…'); const seriesCategories = await xtreamApi('get_series_categories', '', 30000, isBackground);
  showProgress('Baixando séries… (listas grandes levam até 2 minutos)'); const seriesList = await xtreamApi('get_series', '', 150000, isBackground);
  return { cats:xtreamCategories(seriesCategories), items:asArray(seriesList).map(series => ({ k:String(series.series_id), name:series.name, logo:series.cover, cat:String(series.category_id), rate:+series.rating || 0, added:+(series.last_modified||0), plot:series.plot })) };
}

/**
 * Começa a baixar filmes e depois séries em segundo plano, logo após abrir a lista.
 * Se a lista ativa mudar no meio, o resultado é descartado.
 * @returns {void}
 */
function preloadSections(){
  const loadedCatalog = catalog;
  let chain = Promise.resolve();
  sectionJobs = {};
  for (const section of ['vod', 'series']) {
    const job = chain = chain.then(async () => {
      if (catalog !== loadedCatalog || loadedCatalog[section]) return !!loadedCatalog[section];
      try {
        const sectionData = await fetchSection(section, true);
        if (catalog !== loadedCatalog) return false;
        loadedCatalog[section] = sectionData;
        renderHome();
        if ($('dSettings').open) renderCatRows();
        return true;
      } catch { return false; }
      finally { if (sectionJobs[section] === job) delete sectionJobs[section]; }
    });
    sectionJobs[section] = job;
  }
}

/**
 * Garante que filmes ou séries estejam carregados. Se o download em segundo plano
 * ainda estiver rodando, espera por ele; se tiver falhado, tenta de novo.
 * @param {Secao} section Seção.
 * @returns {Promise<boolean>} `true` se a seção está disponível.
 */
async function ensureSection(section){
  if (catalog[section]) return true;
  const job = sectionJobs[section];
  if (job) {
    loading(`Terminando de carregar ${SECTION_NAMES[section].toLowerCase()}…`);
    cancelled = false;
    const jobResult = await Promise.race([job, new Promise(resolve => { abortController = { abort: () => resolve('cancel') }; })]);
    loading(null);
    if (jobResult === 'cancel') return false;
    if (catalog[section]) return true;
  }
  try {
    catalog[section] = await fetchSection(section);
    loading(null); return true;
  } catch (err) { loading(null); if (err.name !== 'AbortError' || !cancelled) toast(errText(err)); return false; }
}
