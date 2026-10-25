'use strict';
/**
 * URL base do servidor Xtream da lista ativa, sem barra final.
 * @returns {string} URL base.
 */
const xBase = () => P.server.replace(/\/+$/,'');
let abortCtl = null, cancelled = false;
/**
 * `fetch` com tempo limite e cancelamento pelo botão "Cancelar"
 * (sem depender de `AbortSignal`).
 * @param {string} url URL a buscar.
 * @param {number} [ms=30000] Tempo limite em milissegundos.
 * @param {boolean} [bg] Download em segundo plano: não pode ser cancelado pelo botão
 * e não interfere no carregamento exibido na tela.
 * @returns {Promise<Response>} Resposta com status de sucesso.
 * @throws {Error} Em caso de tempo esgotado, cancelamento ou status de erro.
 */
async function fetchT(url, ms = 30000, bg = false){
  let t, rejectCancel;
  const cancel = new Promise((_, rej) => { rejectCancel = rej; });
  if (!bg) {
    cancelled = false;
    abortCtl = { abort: () => { const e = new Error('Carregamento cancelado.'); e.name = 'AbortError'; rejectCancel(e); } };
  }
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`O servidor não respondeu em ${Math.round(ms/1000)} segundos`)), ms); });
  try {
    const r = await Promise.race([fetch(url), timeout, cancel]);
    if (!r.ok) throw new Error('O servidor respondeu com erro ' + r.status);
    return r;
  } finally { clearTimeout(t); }
}
/**
 * Chama a API `player_api.php` do Xtream.
 * @param {string} action Ação da API (vazio para login/informações).
 * @param {string} [extra=''] Parâmetros extras já codificados (`&chave=valor`).
 * @param {number} [ms] Tempo limite em milissegundos.
 * @param {boolean} [bg] Download em segundo plano (ver {@link fetchT}).
 * @returns {Promise<*>} JSON da resposta.
 * @throws {Error} Se a resposta não for JSON válido.
 */
const xApi = async (action, extra='', ms, bg) => {
  const r = await fetchT(`${xBase()}/player_api.php?username=${encodeURIComponent(P.user)}&password=${encodeURIComponent(P.pass)}${action ? '&action='+action : ''}${extra}`, ms, bg);
  const txt = await r.text();
  try { return JSON.parse(txt); } catch { throw new Error('O servidor não respondeu no formato Xtream esperado'); }
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
const xUrl = (kind, id, ext) => `${xBase()}/${kind}/${encodeURIComponent(P.user)}/${encodeURIComponent(P.pass)}/${id}.${ext}`;

/**
 * Normaliza categorias vindas da API Xtream.
 * @param {*} a Resposta da API.
 * @returns {Categoria[]} Categorias.
 */
const xCats = a => (Array.isArray(a) ? a : []).map(c => ({ id:String(c.category_id), name:c.category_name }));
/**
 * Garante um array (a API às vezes devolve objeto ou nulo).
 * @param {*} a Valor qualquer.
 * @returns {Array} O próprio array ou um array vazio.
 */
const xArr = a => Array.isArray(a) ? a : [];
/**
 * Faz login no Xtream e baixa os canais ao vivo da lista ativa.
 * Filmes e séries ficam `null` e são baixados depois por {@link preloadSections}.
 * @returns {Promise<DadosLista>} Dados da lista.
 * @throws {Error} Se o login falhar ou a conta não estiver ativa.
 */
async function loadXtream(){
  loading('Verificando login no servidor…');
  const info = await xApi('', '', 25000);
  if (!info || !info.user_info || info.user_info.auth == 0) throw new Error('Usuário ou senha inválidos');
  if (info.user_info.status && !/active/i.test(info.user_info.status)) throw new Error('Conta ' + info.user_info.status + ' no servidor');
  loading('Baixando categorias de canais…');
  const lc = await xApi('get_live_categories', '', 30000);
  loading('Baixando lista de canais… (pode levar até 1 minuto)');
  const ls = await xApi('get_live_streams', '', 90000);
  return {
    info,
    live:{ cats:xCats(lc), items:xArr(ls).map((s,i) => ({ k:String(s.stream_id), name:s.name, logo:s.stream_icon, cat:String(s.category_id), num:s.num || i+1, epg:s.epg_channel_id, archive:+s.tv_archive ? +s.tv_archive_duration || 1 : 0 })) },
    vod:null, series:null
  };
}
/** @type {Partial<Record<Secao, Promise<boolean>>>} Downloads de filmes/séries em segundo plano. */
let sectionJobs = {};

/**
 * Baixa as categorias e os itens de filmes ou séries do Xtream.
 * @param {'vod'|'series'} s Seção.
 * @param {boolean} [bg] Baixar em segundo plano, sem a tela de carregamento.
 * @returns {Promise<DadosSecao>} Dados da seção.
 * @throws {Error} Se o servidor falhar.
 */
async function fetchSection(s, bg = false){
  const step = bg ? () => {} : loading;
  if (s === 'vod') {
    step('Baixando categorias de filmes…'); const vc = await xApi('get_vod_categories', '', 30000, bg);
    step('Baixando filmes… (listas grandes levam até 2 minutos)'); const vs = await xApi('get_vod_streams', '', 150000, bg);
    return { cats:xCats(vc), items:xArr(vs).map(s => ({ k:String(s.stream_id), name:s.name, logo:s.stream_icon, cat:String(s.category_id), ext:s.container_extension || 'mp4', rate:+s.rating || 0, added:+s.added || 0 })) };
  }
  step('Baixando categorias de séries…'); const sc = await xApi('get_series_categories', '', 30000, bg);
  step('Baixando séries… (listas grandes levam até 2 minutos)'); const ss = await xApi('get_series', '', 150000, bg);
  return { cats:xCats(sc), items:xArr(ss).map(s => ({ k:String(s.series_id), name:s.name, logo:s.cover, cat:String(s.category_id), rate:+s.rating || 0, added:+(s.last_modified||0), plot:s.plot })) };
}

/**
 * Começa a baixar filmes e depois séries em segundo plano, logo após abrir a lista.
 * Se a lista ativa mudar no meio, o resultado é descartado.
 * @returns {void}
 */
function preloadSections(){
  const d = D;
  let chain = Promise.resolve();
  sectionJobs = {};
  for (const s of ['vod', 'series']) {
    const job = chain = chain.then(async () => {
      if (D !== d || d[s]) return !!d[s];
      try {
        const data = await fetchSection(s, true);
        if (D !== d) return false;
        d[s] = data;
        renderHome();
        if ($('dSettings').open) renderCatRows();
        return true;
      } catch { return false; }
      finally { if (sectionJobs[s] === job) delete sectionJobs[s]; }
    });
    sectionJobs[s] = job;
  }
}

/**
 * Garante que filmes ou séries estejam carregados. Se o download em segundo plano
 * ainda estiver rodando, espera por ele; se tiver falhado, tenta de novo.
 * @param {Secao} s Seção.
 * @returns {Promise<boolean>} `true` se a seção está disponível.
 */
async function ensureSection(s){
  if (D[s]) return true;
  const job = sectionJobs[s];
  if (job) {
    loading(`Terminando de carregar ${SEC[s].toLowerCase()}…`);
    cancelled = false;
    const done = await Promise.race([job, new Promise(r => { abortCtl = { abort: () => r('cancel') }; })]);
    loading(null);
    if (done === 'cancel') return false;
    if (D[s]) return true;
  }
  try {
    D[s] = await fetchSection(s);
    loading(null); return true;
  } catch (err) { loading(null); if (err.name !== 'AbortError' || !cancelled) toast(errText(err)); return false; }
}
