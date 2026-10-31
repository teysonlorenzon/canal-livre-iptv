import { asRecords, errorMessage, errorName, isRecord, readNumber, readText } from '../core/guards';
import { activeCatalog, state } from '../core/state';
import type { Catalog, Category, OnDemandSection, SectionData, SectionName, TimerId, XtreamAccount, XtreamPlaylist } from '../core/types';
import { loading, SECTION_NAMES, toast } from '../core/utils';

/**
 * Lista Xtream ativa.
 * @returns Lista ativa.
 * @throws Se a lista ativa não for Xtream.
 */
function activeXtreamPlaylist(): XtreamPlaylist {
  const playlist = state.activePlaylist;
  if (!playlist || playlist.type !== 'xtream') throw new Error('A lista ativa não é Xtream.');
  return playlist;
}

/**
 * URL base do servidor Xtream da lista ativa, sem barra final.
 * @returns URL base.
 */
const xtreamBaseUrl = (): string => activeXtreamPlaylist().server.replace(/\/+$/, '');

/** Cancela o carregamento exibido na tela (botão "Cancelar"). */
let abortController: { abort: () => void } | null = null;
/** Se o usuário cancelou o carregamento atual. */
let cancelled = false;

/**
 * Cancela o carregamento em andamento.
 */
export function cancelLoading(): void {
  cancelled = true;
  if (abortController) abortController.abort();
  loading(null);
}

/**
 * `fetch` com tempo limite e cancelamento pelo botão "Cancelar"
 * (sem depender de `AbortSignal`).
 * @param url URL a buscar.
 * @param timeoutMs Tempo limite em milissegundos.
 * @returns Resposta com status de sucesso.
 * @throws Em caso de tempo esgotado, cancelamento ou status de erro.
 */
export async function fetchWithTimeout(url: string, timeoutMs = 30000): Promise<Response> {
  let timeoutTimer: TimerId | undefined;
  cancelled = false;
  const cancelPromise = new Promise<never>((_, reject) => {
    abortController = {
      abort: () => {
        const abortError = new Error('Carregamento cancelado.');
        abortError.name = 'AbortError';
        reject(abortError);
      },
    };
  });
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutTimer = setTimeout(() => reject(new Error(`O servidor não respondeu em ${Math.round(timeoutMs / 1000)} segundos`)), timeoutMs);
  });
  try {
    const response = await Promise.race([fetch(url), timeoutPromise, cancelPromise]);
    if (!response.ok) throw new Error('O servidor respondeu com erro ' + response.status);
    return response;
  } finally {
    clearTimeout(timeoutTimer);
  }
}

/**
 * Chama a API `player_api.php` do Xtream.
 * @param action Ação da API (vazio para login/informações).
 * @param extraParams Parâmetros extras já codificados (`&chave=valor`).
 * @param timeoutMs Tempo limite em milissegundos.
 * @returns JSON da resposta, ainda sem validar.
 * @throws Se a resposta não for JSON válido.
 */
export const xtreamApi = async (action: string, extraParams = '', timeoutMs?: number): Promise<unknown> => {
  const playlist = activeXtreamPlaylist();
  const response = await fetchWithTimeout(
    `${xtreamBaseUrl()}/player_api.php?username=${encodeURIComponent(playlist.user)}&password=${encodeURIComponent(playlist.pass)}${action ? '&action=' + action : ''}${extraParams}`,
    timeoutMs,
  );
  const responseText = await response.text();
  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error('O servidor não respondeu no formato Xtream esperado');
  }
};

/**
 * Converte um erro de carregamento em mensagem amigável.
 * @param err Erro capturado.
 * @returns Mensagem para o usuário.
 */
export function errText(err: unknown): string {
  if (cancelled) return 'Carregamento cancelado.';
  if (err instanceof TypeError)
    return location.protocol === 'https:'
      ? 'Bloqueado: esta página está em https e o servidor da lista usa http. Abra o arquivo baixado direto no navegador do computador.'
      : 'O servidor recusou a conexão vinda do navegador (CORS) ou está fora do ar.';
  return errorMessage(err);
}

/**
 * Monta a URL de um conteúdo Xtream.
 * @param kind Tipo do conteúdo.
 * @param id Id do stream.
 * @param ext Extensão do arquivo.
 * @returns URL do stream.
 */
export const xtreamStreamUrl = (kind: 'live' | 'movie' | 'series', id: string, ext: string): string => {
  const playlist = activeXtreamPlaylist();
  return `${xtreamBaseUrl()}/${kind}/${encodeURIComponent(playlist.user)}/${encodeURIComponent(playlist.pass)}/${id}.${ext}`;
};

/**
 * Monta a URL de um programa já exibido (timeshift do Xtream).
 * @param durationMinutes Duração do programa em minutos.
 * @param timeshiftStart Início no formato `AAAA-MM-DD:HH-MM`.
 * @param channelKey Chave do canal.
 * @returns URL do stream.
 */
export const xtreamTimeshiftUrl = (durationMinutes: number, timeshiftStart: string, channelKey: string): string => {
  const playlist = activeXtreamPlaylist();
  return `${xtreamBaseUrl()}/timeshift/${encodeURIComponent(playlist.user)}/${encodeURIComponent(playlist.pass)}/${durationMinutes}/${timeshiftStart}/${channelKey}.ts`;
};

/**
 * Normaliza categorias vindas da API Xtream.
 * @param apiCategories Resposta da API.
 * @returns Categorias.
 */
const xtreamCategories = (apiCategories: unknown): Category[] =>
  asRecords(apiCategories).map(apiCategory => ({
    id: readText(apiCategory, 'category_id'),
    name: readText(apiCategory, 'category_name'),
  }));

/**
 * Lê os dados da conta informados no login.
 * @param userInfo Campo `user_info` da resposta.
 * @returns Dados da conta.
 */
const parseAccount = (userInfo: Record<string, unknown>): XtreamAccount => ({
  status: readText(userInfo, 'status'),
  expiresAt: readNumber(userInfo, 'exp_date'),
  activeConnections: readText(userInfo, 'active_cons'),
  maxConnections: readText(userInfo, 'max_connections'),
  username: readText(userInfo, 'username'),
});

/**
 * Faz login no Xtream e baixa os canais ao vivo da lista ativa.
 * Filmes e séries ficam `null` e são baixados em seguida por {@link loadAllSections}.
 * @returns Dados da lista.
 * @throws Se o login falhar ou a conta não estiver ativa.
 */
export async function loadXtream(): Promise<Catalog> {
  loading('Verificando login no servidor…');
  const loginResponse = await xtreamApi('', '', 25000);
  const userInfo = isRecord(loginResponse) ? loginResponse.user_info : null;
  if (!isRecord(userInfo) || (userInfo.auth != null && Number(userInfo.auth) === 0)) throw new Error('Usuário ou senha inválidos');
  const account = parseAccount(userInfo);
  if (account.status && !/active/i.test(account.status)) throw new Error('Conta ' + account.status + ' no servidor');
  loading('Baixando categorias de canais…');
  const liveCategories = await xtreamApi('get_live_categories', '', 30000);
  loading('Baixando lista de canais… (pode levar até 1 minuto)');
  const liveStreams = await xtreamApi('get_live_streams', '', 90000);
  return {
    account,
    live: {
      cats: xtreamCategories(liveCategories),
      items: asRecords(liveStreams).map((stream, index) => ({
        k: readText(stream, 'stream_id'),
        name: readText(stream, 'name'),
        logo: readText(stream, 'stream_icon'),
        cat: readText(stream, 'category_id'),
        num: readNumber(stream, 'num') || index + 1,
        epg: readText(stream, 'epg_channel_id'),
        archive: readNumber(stream, 'tv_archive') ? readNumber(stream, 'tv_archive_duration') || 1 : 0,
      })),
    },
    vod: null,
    series: null,
  };
}

/**
 * Baixa as categorias e os itens de filmes ou séries do Xtream.
 * @param section Seção.
 * @returns Dados da seção.
 * @throws Se o servidor falhar.
 */
async function fetchSection(section: OnDemandSection): Promise<SectionData> {
  if (section === 'vod') {
    loading('Baixando categorias de filmes…');
    const vodCategories = await xtreamApi('get_vod_categories', '', 30000);
    loading('Baixando filmes… (listas grandes levam até 2 minutos)');
    const vodStreams = await xtreamApi('get_vod_streams', '', 150000);
    return {
      cats: xtreamCategories(vodCategories),
      items: asRecords(vodStreams).map(stream => ({
        k: readText(stream, 'stream_id'),
        name: readText(stream, 'name'),
        logo: readText(stream, 'stream_icon'),
        cat: readText(stream, 'category_id'),
        ext: readText(stream, 'container_extension') || 'mp4',
        rate: readNumber(stream, 'rating'),
        added: readNumber(stream, 'added'),
      })),
    };
  }
  loading('Baixando categorias de séries…');
  const seriesCategories = await xtreamApi('get_series_categories', '', 30000);
  loading('Baixando séries… (listas grandes levam até 2 minutos)');
  const seriesList = await xtreamApi('get_series', '', 150000);
  return {
    cats: xtreamCategories(seriesCategories),
    items: asRecords(seriesList).map(series => ({
      k: readText(series, 'series_id'),
      name: readText(series, 'name'),
      logo: readText(series, 'cover'),
      cat: readText(series, 'category_id'),
      rate: readNumber(series, 'rating'),
      added: readNumber(series, 'last_modified'),
      plot: readText(series, 'plot'),
    })),
  };
}

/** Seções baixadas depois dos canais, nesta ordem. */
const ON_DEMAND_SECTIONS: OnDemandSection[] = ['vod', 'series'];

/**
 * Baixa filmes e depois séries da lista Xtream ativa, com a tela de carregamento principal.
 * Se uma seção falhar, avisa e segue com a próxima; se o usuário cancelar, para. Em ambos os
 * casos o app abre com o que já foi baixado, e a seção que faltar é tentada de novo ao ser aberta.
 */
export async function loadAllSections(): Promise<void> {
  const loadedCatalog = activeCatalog();
  for (const section of ON_DEMAND_SECTIONS) {
    try {
      loadedCatalog[section] = await fetchSection(section);
    } catch (err) {
      if (cancelled) return;
      toast(SECTION_NAMES[section] + ': ' + errText(err));
    }
  }
}

/**
 * Garante que filmes ou séries estejam carregados; se um download anterior falhou ou foi
 * cancelado, tenta de novo com a tela de carregamento.
 * @param section Seção.
 * @returns `true` se a seção está disponível.
 */
export async function ensureSection(section: SectionName): Promise<boolean> {
  const catalog = activeCatalog();
  if (section === 'live' || catalog[section]) return true;
  try {
    catalog[section] = await fetchSection(section);
    loading(null);
    return true;
  } catch (err) {
    loading(null);
    if (errorName(err) !== 'AbortError' || !cancelled) toast(errText(err));
    return false;
  }
}
