import { type FocusMemory, isTvPlatform, lockBackground, preservingFocus, rememberFocus, unlockBackground } from '../../core/a11y';
import { $, $optional, closest, query, topOpenDialog } from '../../core/dom';
import { errorName } from '../../core/guards';
import { activeCatalog, isFav, profileKey, saveUserData, state, toggleFav } from '../../core/state';
import type { HistoryEntry, Item, MediaDescriptor, PlaybackStage, Programme, SeriesContext, TimerId } from '../../core/types';
import { esc, formatHourMinute, formatTime, initials, store, toast } from '../../core/utils';
import { getEpg, nowNext } from '../../data/epg';
import { xtreamStreamUrl, xtreamTimeshiftUrl } from '../../data/xtream';
import { icon } from '../../ui/icons';
import { playEpisode } from '../details/details';
import { renderHome } from '../home/home';
import { renderItems, withPin } from '../section/section';
import { liveGuardReset, liveRecover } from './live-guard';
import { type ActiveStage, playback, playerPlatformHooks, playerScreen, video } from './playback';

/** Título da página quando nada está tocando. */
const APP_TITLE = 'Zapp IPTV';
/** Texto só para leitor de tela que acompanha o indicador de carregamento. */
const SPINNER_HTML = '<div class="spinner"></div><span class="visually-hidden">Carregando…</span>';
/** Onde o foco estava quando o player abriu, para devolvê-lo ao fechar. */
let focusBeforePlayer: FocusMemory | null = null;

/** Momento (ms) do último salvamento do progresso. */
let lastProgressSaveAt = 0;
/** Se a barra de progresso está sendo arrastada. */
let isSeekDragging = false;

/**
 * Para e descarta os motores de reprodução (hls.js, mpegts.js e nativo).
 */
function stopEngines(): void {
  if (playback.hlsPlayer) {
    playback.hlsPlayer.destroy();
    playback.hlsPlayer = null;
  }
  if (playback.mpegtsPlayer) {
    try {
      playback.mpegtsPlayer.pause();
      playback.mpegtsPlayer.unload();
      playback.mpegtsPlayer.detachMediaElement();
      playback.mpegtsPlayer.destroy();
    } catch {}
    playback.mpegtsPlayer = null;
  }
  video().onerror = null;
  video().removeAttribute('src');
  video().load();
}
/**
 * Mostra uma mensagem sobre o vídeo.
 * @param html HTML da mensagem; vazio remove.
 */
export const showPlayerMessage = (html: string): void => {
  $('plMsg').innerHTML = html ? `<div>${html}</div>` : '';
};

/**
 * Tenta tocar usando cada etapa da cadeia até uma funcionar.
 * Cada etapa tem 20 s para começar antes de passar para a próxima; se o vídeo ainda
 * estiver chegando (servidor lento), espera até 60 s e oferece uma versão mais leve do canal.
 * @param chain Etapas em ordem de preferência.
 * @param live Se é transmissão ao vivo.
 */
function runChain(chain: PlaybackStage[], live: boolean): void {
  const chainToken = ++playback.playbackToken;
  let watchdog: TimerId | undefined;
  const reasons: string[] = [];
  lastChain = { chain, live };
  nativeError = null;
  /**
   * Inicia a etapa `stageIndex` da cadeia.
   * @param stageIndex Índice da etapa.
   * @param previousFailure Motivo da falha da etapa anterior.
   * @param retrying Se é uma reconexão da mesma etapa.
   */
  const startStage = (stageIndex: number, previousFailure?: string, retrying = false): void => {
    clearTimeout(watchdog);
    if (chainToken !== playback.playbackToken) return;
    const stage = chain[stageIndex];
    if (!stage) {
      playback.engine = null;
      return showPlaybackFailure(reasons);
    }
    stopEngines();
    const { eng: engineName, url } = stage;
    const currentStage: ActiveStage = {
      my: chainToken,
      eng: engineName,
      live,
      started: false,
      retrying,
      restart: () => startStage(stageIndex, previousFailure, true),
      giveUp: reason => {
        reasons.push(`${engineName.toUpperCase()}: ${reason}`);
        startStage(stageIndex + 1, reason);
      },
    };
    playback.engine = currentStage;
    /**
     * Marca a etapa atual como falha. No ao vivo, depois que o canal já tocou
     * (ou durante uma reconexão), tenta reconectar no mesmo motor antes de desistir.
     * @param reason Motivo da falha.
     */
    const failStage = (reason: string): void => {
      if (chainToken !== playback.playbackToken || playback.engine !== currentStage) return;
      if (live && (currentStage.started || currentStage.retrying)) return liveRecover(reason);
      currentStage.giveUp(reason);
    };
    let lastLoadedBytes = 0,
      extraWaitMs = 0;
    /**
     * Verifica se o vídeo começou. Se não, mas o pedaço de vídeo ainda está baixando,
     * dá mais tempo (servidor lento) em vez de desistir.
     */
    const checkStarted = (): void => {
      if (chainToken !== playback.playbackToken || playback.engine !== currentStage || video().readyState >= 2) return;
      const loadedBytes = currentStage.frag ? currentStage.frag.stats.loaded : 0;
      if (loadedBytes > lastLoadedBytes && extraWaitMs < 40000) {
        lastLoadedBytes = loadedBytes;
        extraWaitMs += 10000;
        showSlowServerMessage();
        watchdog = currentStage.wd = setTimeout(checkStarted, 10000);
        return;
      }
      failStage('tempo esgotado');
    };
    watchdog = currentStage.wd = setTimeout(checkStarted, 20000);
    if (!retrying) showPlayerMessage(SPINNER_HTML);
    if (engineName === 'hls') {
      const HlsLibrary = window.Hls;
      if (HlsLibrary && HlsLibrary.isSupported()) {
        const hlsPlayer = new HlsLibrary(
          live
            ? {
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 30,
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                liveSyncDurationCount: 3,
                liveMaxLatencyDurationCount: 10,
                maxLiveSyncPlaybackRate: 1.1,
                manifestLoadingMaxRetry: 3,
                levelLoadingMaxRetry: 4,
                fragLoadingMaxRetry: 6,
                nudgeMaxRetry: 6,
              }
            : { enableWorker: true, backBufferLength: 30, maxBufferLength: 60, fragLoadingMaxRetry: 6 },
        );
        playback.hlsPlayer = hlsPlayer;
        let recoveryAttempts = 0;
        hlsPlayer.on(HlsLibrary.Events.MANIFEST_PARSED, () => {
          setupTracks();
          video().play().catch(tapToPlay);
        });
        hlsPlayer.on(HlsLibrary.Events.FRAG_LOADING, (_eventName, eventData) => {
          currentStage.frag = eventData.frag;
        });
        hlsPlayer.on(HlsLibrary.Events.AUDIO_TRACKS_UPDATED, () => setupTracks());
        hlsPlayer.on(HlsLibrary.Events.SUBTITLE_TRACKS_UPDATED, () => setupTracks());
        hlsPlayer.on(HlsLibrary.Events.ERROR, (_eventName, errorData) => {
          if (!errorData.fatal) return;
          if (errorData.type === HlsLibrary.ErrorTypes.MEDIA_ERROR && recoveryAttempts++ < 2) return hlsPlayer.recoverMediaError();
          if (
            errorData.type === HlsLibrary.ErrorTypes.NETWORK_ERROR &&
            recoveryAttempts++ < 1 &&
            errorData.details !== HlsLibrary.ErrorDetails.MANIFEST_LOAD_ERROR
          )
            return hlsPlayer.startLoad();
          failStage(errorData.details);
        });
        hlsPlayer.loadSource(url);
        hlsPlayer.attachMedia(video());
      } else if (video().canPlayType('application/vnd.apple.mpegurl')) playNative(url, failStage);
      else failStage('HLS não suportado');
    } else if (engineName === 'ts') {
      const mpegtsLibrary = window.mpegts;
      if (!mpegtsLibrary || !mpegtsLibrary.isSupported()) return failStage('MPEG-TS não suportado');
      const mpegtsPlayer = mpegtsLibrary.createPlayer(
        { type: 'mpegts', isLive: live, url },
        live
          ? {
              enableWorker: true,
              lazyLoad: false,
              enableStashBuffer: true,
              stashInitialSize: 384 * 1024,
              autoCleanupSourceBuffer: true,
              liveBufferLatencyChasing: true,
              liveBufferLatencyMaxLatency: 8,
              liveBufferLatencyMinRemain: 3,
            }
          : { enableWorker: true, lazyLoad: true },
      );
      playback.mpegtsPlayer = mpegtsPlayer;
      mpegtsPlayer.on(mpegtsLibrary.Events.ERROR, (errorType: string, errorDetail: string) => failStage(errorDetail || errorType));
      mpegtsPlayer.attachMediaElement(video());
      mpegtsPlayer.load();
      const playPromise = mpegtsPlayer.play();
      if (playPromise) playPromise.catch(tapToPlay);
    } else playNative(url, failStage);
  };
  startStage(0);
}
/**
 * Versão mais leve do canal atual na lista (mesmo nome, qualidade menor),
 * ex.: "GLOBO RBS RS FHD" → "GLOBO RBS RS HD" ou "... SD".
 * @returns Canal mais leve, ou `null` se não houver.
 */
function lighterChannel(): Item | null {
  const currentChannel = playback.currentMedia?.kind === 'live' ? playback.currentMedia.item : null;
  if (!currentChannel) return null;
  const QUALITY_SUFFIX = /\s*\b(4K|UHD|FHD|HD|SD)\b(\s*\[[^\]]*\])?\s*$/i;
  const qualityMatch = currentChannel.name.match(QUALITY_SUFFIX);
  if (!qualityMatch) return null;
  const baseName = currentChannel.name.replace(QUALITY_SUFFIX, '').trim().toUpperCase(),
    qualityOrder = ['4K', 'UHD', 'FHD', 'HD', 'SD'];
  const currentQualityIndex = qualityOrder.indexOf((qualityMatch[1] ?? '').toUpperCase());
  for (const quality of qualityOrder.slice(currentQualityIndex + 1)) {
    const lighterAlternative = playback.liveChannelList.find(
      candidate =>
        candidate !== currentChannel &&
        !/\[/.test(candidate.name) &&
        candidate.name.replace(QUALITY_SUFFIX, '').trim().toUpperCase() === baseName &&
        candidate.name.match(QUALITY_SUFFIX)?.[1]?.toUpperCase() === quality,
    );
    if (lighterAlternative) return lighterAlternative;
  }
  return null;
}

/**
 * Avisa que o servidor está lento e, se existir, oferece a versão mais leve do canal.
 */
function showSlowServerMessage(): void {
  const lighterAlternative = lighterChannel();
  showPlayerMessage(
    `<div class="spinner"></div><p style="margin-top:14px">O servidor está enviando este canal devagar. Aguardando o vídeo…</p>${lighterAlternative ? `<div class="row" style="justify-content:center;margin-top:12px"><button class="btn primary" id="fLighter">Assistir ${esc(lighterAlternative.name)}</button></div>` : ''}`,
  );
  if (lighterAlternative) {
    $('fLighter').onclick = () => playLive(lighterAlternative, playback.liveChannelList);
    if (document.documentElement.classList.contains('tv')) $('fLighter').focus();
  }
}

/**
 * Toca pelo elemento `<video>` nativo.
 * @param url URL do conteúdo.
 * @param onFailure Callback de falha.
 */
function playNative(url: string, onFailure: (reason: string) => void): void {
  video().onerror = () => {
    nativeError = video().error;
    onFailure(describeMediaError(video().error));
  };
  video().src = url;
  video().play().catch(tapToPlay);
}

/** Nome de cada código de erro do elemento `<video>`. */
const MEDIA_ERROR_NAMES: Record<number, string> = {
  1: 'interrompido',
  2: 'erro de rede',
  3: 'falha ao decodificar',
  4: 'formato não suportado',
};

/**
 * Descreve um erro do elemento `<video>` (código e detalhe do navegador).
 * @param mediaError Erro do vídeo.
 * @returns Descrição curta.
 */
function describeMediaError(mediaError: MediaError | null): string {
  if (!mediaError) return 'erro desconhecido';
  const name = MEDIA_ERROR_NAMES[mediaError.code] ?? 'erro ' + mediaError.code;
  return mediaError.message ? `${name} (${mediaError.message})` : name;
}
/**
 * Pede um toque do usuário quando o navegador bloqueia o autoplay.
 * @param playError Erro de `play()`.
 */
function tapToPlay(playError: unknown): void {
  if (errorName(playError) === 'NotAllowedError')
    showPlayerMessage('<h2>Toque para assistir</h2><p>O navegador pede um toque antes de tocar com som.</p>');
}
/** Última cadeia tentada, para "Tentar de novo". */
let lastChain: { chain: PlaybackStage[]; live: boolean } | null = null;
/** Último erro do player nativo. */
let nativeError: MediaError | null = null;

/**
 * Explica em linguagem simples por que o conteúdo não tocou.
 * @returns Texto da explicação.
 */
function failReason(): string {
  const lowerCaseUrl = ((playback.currentMedia && playback.currentMedia.url) || '').toLowerCase();
  if (location.protocol === 'https:' && /^http:/.test(lowerCaseUrl))
    return 'Este conteúdo usa http e a página está em https; o navegador bloqueia. Abra o player pelo arquivo salvo no computador.';
  if (/\.(mp4|m4v|mov)(\?|$)/.test(lowerCaseUrl) && !video().canPlayType('video/mp4; codecs="avc1.42E01E"'))
    return 'Este navegador não toca vídeos MP4 (H.264). Use Chrome, Edge ou Safari.';
  const errorCode = nativeError && nativeError.code;
  if (errorCode === 2) return 'A conexão com o servidor caiu enquanto o vídeo carregava. Tente de novo.';
  if (errorCode === 3)
    return 'O navegador não consegue decodificar este vídeo. Geralmente é vídeo HEVC/H.265 ou áudio AC3/DTS. Abra o link em um player como o VLC.';
  if (errorCode === 4 && /\.mkv(\?|$)/.test(lowerCaseUrl))
    return 'Arquivos .mkv costumam usar codecs que o navegador não abre. Abra o link em um player como o VLC.';
  if (errorCode === 4)
    return 'O servidor não entregou um vídeo que o navegador abre: o formato não é suportado, o link expirou ou a conta não tem acesso a este conteúdo.';
  return 'O conteúdo pode estar fora do ar, usar um formato que o navegador não abre ou o servidor bloqueou o acesso.';
}

/**
 * Verifica se o servidor de uma URL responde (sem ler o conteúdo, por causa do CORS).
 * Cancela o download assim que a resposta chega.
 * @param url URL a testar.
 * @returns `true` se o servidor respondeu em até 8 s.
 */
async function probeUrl(url: string): Promise<boolean> {
  const probeController = new AbortController(),
    probeTimeout = setTimeout(() => probeController.abort(), 8000);
  try {
    await fetch(url, { mode: 'no-cors', signal: probeController.signal, cache: 'no-store' });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(probeTimeout);
    probeController.abort();
  }
}

/**
 * Mostra a mensagem de falha de reprodução com o motivo e opções
 * para tentar de novo, copiar o link ou abri-lo fora do app.
 * @param reasons Motivos técnicos de cada tentativa.
 */
function showPlaybackFailure(reasons: string[] = []): void {
  const url = (playback.currentMedia && playback.currentMedia.url) || '';
  showPlayerMessage(`<h2>Não foi possível tocar</h2><p id="fWhy">${esc(failReason())}</p>
    <div class="row" style="justify-content:center;margin-top:14px">
      <button class="btn" id="fRetry">Tentar de novo</button>
      ${url ? `<button class="btn" id="fCopy">Copiar link</button><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Abrir em nova aba</a>` : ''}
    </div>
    ${reasons.length ? `<p class="hint" style="margin-top:10px">${reasons.map(esc).join('<br>')}</p>` : ''}`);
  $('fRetry').onclick = () => {
    if (lastChain) runChain(lastChain.chain, lastChain.live);
  };
  if (url && nativeError && nativeError.code === 4 && !(location.protocol === 'https:' && /^http:/i.test(url))) {
    const failureToken = playback.playbackToken;
    $('fWhy').textContent = 'Verificando a conexão com o servidor do vídeo…';
    void probeUrl(url).then(serverResponded => {
      const reasonElement = $optional('fWhy');
      if (failureToken !== playback.playbackToken || !reasonElement) return;
      reasonElement.textContent = serverResponded
        ? 'O servidor respondeu, mas não entregou um vídeo que o navegador abre. Pode ser formato não suportado (.mkv, HEVC/H.265, áudio AC3/DTS) ou link sem acesso. Tente abrir o link no VLC.'
        : 'Não foi possível conectar ao servidor do vídeo. Ele pode estar fora do ar, o link expirou ou a sua rede bloqueou o acesso.';
    });
  }
  const copyButton = $optional('fCopy');
  if (copyButton)
    copyButton.onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        toast('Link copiado. Cole no VLC em Mídia → Abrir fluxo de rede.');
      } catch {
        prompt('Copie o link:', url);
      }
    };
}

/**
 * Define a ordem de motores a tentar conforme a URL.
 * @param url URL do conteúdo.
 * @param live Se é transmissão ao vivo.
 * @returns Cadeia de tentativas.
 */
function chainFor(url: string, live: boolean): PlaybackStage[] {
  const lowerCaseUrl = url.toLowerCase();
  if (/\.m3u8(\?|$)/.test(lowerCaseUrl))
    return [
      { eng: 'hls', url },
      { eng: 'native', url },
    ];
  if (/\.ts(\?|$)/.test(lowerCaseUrl))
    return live && state.activePlaylist?.type === 'xtream'
      ? [
          { eng: 'hls', url: url.replace(/\.ts(\?|$)/i, '.m3u8$1') },
          { eng: 'ts', url },
        ]
      : [
          { eng: 'ts', url },
          { eng: 'native', url },
        ];
  if (/\.(mp4|m4v|webm|mov|mkv|avi)(\?|$)/.test(lowerCaseUrl))
    return !live && state.activePlaylist?.type === 'xtream'
      ? [
          { eng: 'native', url },
          { eng: 'hls', url: url.replace(/\.\w+(\?|$)/, '.m3u8$1') },
        ]
      : [{ eng: 'native', url }];
  return live
    ? [
        { eng: 'hls', url },
        { eng: 'ts', url },
        { eng: 'native', url },
      ]
    : [
        { eng: 'native', url },
        { eng: 'hls', url },
      ];
}

/**
 * Exibe o player e mantém a tela ligada.
 */
function openPlayer(): void {
  const wasOpen = !playerScreen().hidden;
  if (!wasOpen) {
    focusBeforePlayer = rememberFocus();
    lockBackground();
  }
  playerScreen().hidden = false;
  void requestWakeLock();
  poke();
  if (!wasOpen) playerPlatformHooks.focusPlayer();
  playerPlatformHooks.afterOpen();
}

/**
 * Põe o título do que está tocando no player, no vídeo (para o leitor de tela) e na aba do navegador.
 * @param title Título.
 */
function setPlayerTitle(title: string): void {
  $('plTitle').textContent = title;
  video().setAttribute('aria-label', title);
  document.title = `${title} · ${APP_TITLE}`;
}

/**
 * Mostra no botão de favorito do player se o canal é favorito.
 * @param isFavorite Se é favorito.
 */
export function showFavoriteButton(isFavorite: boolean): void {
  $('cFav').innerHTML = icon('star', isFavorite ? 'on' : '');
  $('cFav').setAttribute('aria-pressed', String(isFavorite));
}

/**
 * Fecha o painel lateral e devolve o foco ao botão que o abriu.
 */
function closeSidePanel(): void {
  const wasOpen = !$('side').hidden;
  const toggleId = $('side').dataset.mode === 'epg' ? '#cEpg' : '#cList';
  $('side').hidden = true;
  if (wasOpen && !isTvPlatform()) query(document, toggleId)?.focus();
}
/**
 * Fecha o player, salva o progresso e volta à tela anterior.
 */
export function closePlayer(): void {
  const wasOpen = !playerScreen().hidden;
  ++playback.playbackToken;
  playback.engine = null;
  liveGuardReset();
  saveProgress();
  stopEngines();
  playerScreen().hidden = true;
  $('side').hidden = true;
  playback.currentMedia = null;
  clearInterval(epgTimer);
  document.title = APP_TITLE;
  video().removeAttribute('aria-label');
  if (!$('section').hidden) renderItems();
  else renderHome();
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
  } catch {}
  if (wasOpen) {
    unlockBackground();
    if (!focusBeforePlayer?.restore() && !isTvPlatform()) query(document, '#app')?.focus();
    focusBeforePlayer = null;
  }
  playerPlatformHooks.afterClose();
}

/**
 * URL de um canal ao vivo no formato configurado.
 * @param channel Canal.
 * @returns URL do stream.
 */
function liveUrl(channel: Item): string {
  return channel.url || xtreamStreamUrl('live', channel.k, state.options.fmt === 'ts' ? 'ts' : 'm3u8');
}
/**
 * Toca um canal ao vivo.
 * @param channel Canal.
 * @param channelList Lista usada para trocar de canal (padrão: todos os canais).
 */
export function playLive(channel: Item | undefined, channelList?: Item[]): void {
  if (!channel) return;
  playback.liveChannelList = channelList && channelList.length ? channelList : activeCatalog().live.items;
  playback.currentMedia = { kind: 'live', item: channel, url: liveUrl(channel) };
  state.userData.recentLive = [channel.k, ...state.userData.recentLive.filter(recentKey => recentKey !== channel.k)].slice(0, 30);
  saveUserData();
  openPlayer();
  setPlayerTitle(`${channel.num}  ${channel.name}`);
  $('osdName').textContent = `${channel.num}  ${channel.name}`;
  $('osdLogo').innerHTML = channel.logo
    ? `<img src="${esc(channel.logo)}" alt="" onerror="this.outerHTML='${initials(channel.name)}'">`
    : initials(channel.name);
  $('epgNow').hidden = false;
  $('epgT').textContent = 'Carregando programação…';
  $('epgTime').textContent = $('epgLeft').textContent = $('epgN').textContent = '';
  $('epgP').style.width = '0';
  $('seekRow').hidden = true;
  $('cBack10').hidden = $('cFwd10').hidden = true;
  $('cList').hidden = false;
  $('cEpg').hidden = false;
  $('cFav').hidden = false;
  showFavoriteButton(isFav('live', channel.k));
  resetTracks();
  liveGuardReset();
  runChain(chainFor(playback.currentMedia.url, true), true);
  void updateEpg();
  if ($('side').hidden) return;
  if ($('side').dataset.mode === 'epg') void showEpgSide();
  else showChannelSide();
}
/**
 * Toca um filme ou episódio.
 * @param desc Descrição da mídia.
 * @param startPosition Posição inicial em segundos.
 * @param seriesContext Contexto da série, para navegar entre episódios.
 */
export function playMedia(desc: MediaDescriptor, startPosition = 0, seriesContext: SeriesContext | null = null): void {
  playback.currentMedia = { kind: desc.kind, desc, url: desc.url, ctx: seriesContext, resume: startPosition };
  openPlayer();
  setPlayerTitle(desc.title);
  $('epgNow').hidden = true;
  $('seekRow').hidden = false;
  $('cBack10').hidden = $('cFwd10').hidden = false;
  $('cList').hidden = !seriesContext;
  $('cList').textContent = seriesContext ? 'Episódios' : 'Canais';
  $('cEpg').hidden = true;
  $('cFav').hidden = true;
  resetTracks();
  liveGuardReset();
  runChain(chainFor(desc.url, false), false);
}

/**
 * Formata o início de um programa como no timeshift do Xtream (`AAAA-MM-DD:HH-MM`).
 * @param startTimestamp Início do programa em milissegundos.
 * @returns Data e hora formatadas.
 */
function formatTimeshiftStart(startTimestamp: number): string {
  const startDate = new Date(startTimestamp);
  const padTwoDigits = (value: number): string => String(value).padStart(2, '0');
  return `${startDate.getFullYear()}-${padTwoDigits(startDate.getMonth() + 1)}-${padTwoDigits(startDate.getDate())}:${padTwoDigits(startDate.getHours())}-${padTwoDigits(startDate.getMinutes())}`;
}

/**
 * Toca um programa já exibido (catch-up / timeshift).
 * @param channel Canal.
 * @param programme Programa.
 */
export function playCatchup(channel: Item, programme: Programme): void {
  const timeshiftStart = programme.start
    ? programme.start
        .replace(' ', ':')
        .replace(/:(\d\d):(\d\d)$/, '-$1')
        .slice(0, 16)
    : formatTimeshiftStart(programme.s);
  const durationMinutes = Math.ceil((programme.e - programme.s) / 60000);
  const url =
    channel.url && state.activePlaylist?.type !== 'xtream' ? channel.url : xtreamTimeshiftUrl(durationMinutes, timeshiftStart, channel.k);
  playback.currentMedia = { kind: 'catchup', item: channel, url, desc: { title: `${channel.name} · ${programme.title}` } };
  setPlayerTitle(`${channel.name} · ${programme.title} (${formatHourMinute(new Date(programme.s))})`);
  $('seekRow').hidden = false;
  $('cBack10').hidden = $('cFwd10').hidden = false;
  $('epgNow').hidden = true;
  resetTracks();
  runChain(
    [
      { eng: 'ts', url },
      { eng: 'hls', url: url.replace(/\.ts$/, '.m3u8') },
      { eng: 'native', url },
    ],
    false,
  );
}

/** Timer que atualiza o programa atual no cartão do canal. */
let epgTimer: TimerId | undefined;
/**
 * Mostra no cartão do canal o programa atual (com progresso e tempo restante) e o
 * próximo, atualizando a cada 30 s. Sem guia, avisa que não há programação.
 */
async function updateEpg(): Promise<void> {
  clearInterval(epgTimer);
  const channel = playback.currentMedia && playback.currentMedia.item;
  if (!channel) return;
  const programmeList = await getEpg(channel);
  if (!playback.currentMedia || playback.currentMedia.item !== channel) return;
  /**
   * Desenha o bloco "agora / a seguir".
   */
  const draw = (): void => {
    const [nowProgramme, nextProgramme] = nowNext(programmeList);
    $('epgNow').hidden = false;
    $('epgNow').classList.toggle('none', !nowProgramme);
    $('epgT').textContent = nowProgramme ? nowProgramme.title : 'Programação não disponível para este canal';
    $('epgTime').textContent = nowProgramme
      ? `${formatHourMinute(new Date(nowProgramme.s))} – ${formatHourMinute(new Date(nowProgramme.e))}`
      : '';
    $('epgP').style.width = nowProgramme
      ? Math.min(100, ((Date.now() - nowProgramme.s) / (nowProgramme.e - nowProgramme.s)) * 100) + '%'
      : '0';
    const minutesLeft = nowProgramme ? Math.max(0, Math.round((nowProgramme.e - Date.now()) / 60000)) : 0;
    $('epgLeft').textContent = nowProgramme
      ? minutesLeft >= 60
        ? `faltam ${Math.floor(minutesLeft / 60)}h${String(minutesLeft % 60).padStart(2, '0')}`
        : `faltam ${minutesLeft} min`
      : '';
    $('epgN').innerHTML = nextProgramme
      ? `<span>A seguir</span> ${formatHourMinute(new Date(nextProgramme.s))} · ${esc(nextProgramme.title)}`
      : '';
  };
  draw();
  epgTimer = setInterval(draw, 30000);
}

/** Seletores de áudio, legenda e qualidade. */
const TRACK_SELECT_IDS = ['cAudio', 'cSub', 'cQual'] as const;

/**
 * Esconde e limpa os seletores de áudio, legenda e qualidade.
 */
function resetTracks(): void {
  TRACK_SELECT_IDS.forEach(selectId => {
    $(selectId).hidden = true;
    $(selectId).innerHTML = '';
  });
}
/**
 * Preenche os seletores de qualidade, áudio e legenda a partir do hls.js.
 */
function setupTracks(): void {
  const hlsPlayer = playback.hlsPlayer;
  if (!hlsPlayer) return;
  const qualityLevels = hlsPlayer.levels;
  if (qualityLevels.length > 1) {
    $('cQual').innerHTML =
      '<option value="-1">Auto</option>' +
      qualityLevels
        .map(
          (level, index) =>
            `<option value="${index}">${level.height ? level.height + 'p' : Math.round(level.bitrate / 1000) + ' kbps'}</option>`,
        )
        .join('');
    $('cQual').value = String(hlsPlayer.autoLevelEnabled ? -1 : hlsPlayer.currentLevel);
    $('cQual').hidden = false;
  }
  const audioTracks = hlsPlayer.audioTracks;
  if (audioTracks.length > 1) {
    $('cAudio').innerHTML = audioTracks
      .map((track, index) => `<option value="${index}">🔈 ${esc(track.name || track.lang || 'Áudio ' + (index + 1))}</option>`)
      .join('');
    $('cAudio').value = String(hlsPlayer.audioTrack);
    $('cAudio').hidden = false;
  }
  const subtitleTracks = hlsPlayer.subtitleTracks;
  if (subtitleTracks.length) {
    $('cSub').innerHTML =
      '<option value="-1">Sem legenda</option>' +
      subtitleTracks
        .map((track, index) => `<option value="${index}">CC ${esc(track.name || track.lang || 'Legenda ' + (index + 1))}</option>`)
        .join('');
    $('cSub').value = String(hlsPlayer.subtitleTrack);
    $('cSub').hidden = false;
  }
}
/**
 * Aplica a proporção do vídeo salva no perfil ativo.
 */
export const applyVideoRatio = (): void => {
  const savedRatio = store.getText(profileKey('ratio')) ?? 'contain';
  video().style.objectFit = savedRatio;
  $('cRatio').value = savedRatio;
};

/**
 * Salva a posição atual no histórico (filmes e episódios com mais de 1 min).
 * @param force Indica salvamento forçado (ao fechar ou terminar).
 */
function saveProgress(): void {
  const media = playback.currentMedia;
  if (!media || !media.desc || media.kind === 'catchup' || !state.activePlaylist) return;
  const duration = video().duration;
  if (!isFinite(duration) || duration < 60 || video().currentTime < 5) return;
  lastProgressSaveAt = Date.now();
  const historyRecord: HistoryEntry = { ...media.desc, desc: media.desc, pos: video().currentTime, dur: duration, t: Date.now() };
  state.userData.hist = [
    historyRecord,
    ...state.userData.hist.filter(
      entry => entry.ref !== historyRecord.ref && !(historyRecord.series && entry.series === historyRecord.series),
    ),
  ].slice(0, 60);
  if (historyRecord.series)
    state.userData.hist.push({ ref: historyRecord.ref, pos: historyRecord.pos, dur: duration, t: historyRecord.t, hidden: true });
  state.userData.hist = state.userData.hist
    .filter(
      (entry, index, entries) =>
        !entry.hidden || entries.findIndex(otherEntry => otherEntry.hidden && otherEntry.ref === entry.ref) === index,
    )
    .slice(0, 200);
  saveUserData();
}

/**
 * Vai para o canal ou episódio anterior/próximo.
 * @param direction Direção: -1 anterior, 1 próximo.
 */
export const stepChannel = (direction: number): void => {
  if (!playback.currentMedia) return;
  if (playback.currentMedia.kind === 'live' || playback.currentMedia.kind === 'catchup') {
    const channelList = playback.liveChannelList;
    let channelIndex = channelList.indexOf(playback.currentMedia.item);
    channelIndex = (channelIndex + direction + channelList.length) % channelList.length;
    playLive(channelList[channelIndex], channelList);
  } else if (playback.currentMedia.ctx) {
    const seriesContext = playback.currentMedia.ctx,
      episodeIndex = seriesContext.i + direction;
    if (episodeIndex >= 0 && episodeIndex < seriesContext.flat.length)
      playEpisode(seriesContext.s, seriesContext.info, seriesContext.flat, episodeIndex);
  }
};
/**
 * Mostra no botão a ação disponível: pausar enquanto toca, tocar quando pausado.
 */
const syncPlayIcon = () => {
  $('cPlay').innerHTML = icon(video().paused ? 'play' : 'pause');
};

/**
 * Abre o painel lateral com os episódios da série ou a lista de canais.
 */
function showChannelSide(): void {
  const sidePanel = $('side');
  const wasHidden = sidePanel.hidden;
  sidePanel.hidden = false;
  sidePanel.dataset.mode = 'list';
  if (playback.currentMedia && playback.currentMedia.ctx) {
    const seriesContext = playback.currentMedia.ctx;
    $('sideTitle').textContent = seriesContext.s.name;
    setSideList(
      seriesContext.flat
        .map(
          (episode, index) =>
            `<li data-x="${index}" class="${index === seriesContext.i ? 'on' : ''}"><button type="button" class="side-btn"${index === seriesContext.i ? ' aria-current="true"' : ''}><span class="tm">T${episode.season}E${episode.num}</span><span>${esc(episode.title)}</span></button></li>`,
        )
        .join(''),
    );
    $('sideList').onclick = clickEvent => {
      const listItem = closest(clickEvent.target, 'li');
      if (listItem) playEpisode(seriesContext.s, seriesContext.info, seriesContext.flat, Number(listItem.dataset.x));
    };
  } else {
    $('sideTitle').textContent = 'Canais';
    const channelList = playback.liveChannelList,
      currentChannel = playback.currentMedia && playback.currentMedia.item;
    setSideList(
      channelList
        .slice(0, 1500)
        .map(
          (channel, index) =>
            `<li data-x="${index}" class="${channel === currentChannel ? 'on' : ''}"><button type="button" class="side-btn"${channel === currentChannel ? ' aria-current="true"' : ''}><span class="tm">${esc(channel.num)}</span><span>${esc(channel.name)}</span></button></li>`,
        )
        .join(''),
    );
    $('sideList').onclick = clickEvent => {
      const listItem = closest(clickEvent.target, 'li');
      if (listItem) playLive(channelList[Number(listItem.dataset.x)], channelList);
    };
  }
  const selectedItem = $('sideList').querySelector('.on');
  if (selectedItem) selectedItem.scrollIntoView({ block: 'center' });
  if (wasHidden) focusSidePanel();
}

/**
 * Troca o conteúdo da lista lateral sem derrubar o foco de quem usa o teclado.
 * @param html HTML dos itens.
 */
function setSideList(html: string): void {
  preservingFocus($('sideList'), () => {
    $('sideList').innerHTML = html;
  });
}

/**
 * Leva o foco para dentro do painel lateral recém-aberto (o item atual, ou o primeiro). Na TV o controle remoto move o foco.
 */
function focusSidePanel(): void {
  if (isTvPlatform()) return;
  (query($('sideList'), '.on .side-btn, .cur .side-btn') ?? query($('sideList'), '.side-btn') ?? $('sideClose')).focus();
}
/**
 * Abre o painel lateral com o guia do canal, permitindo catch-up.
 */
async function showEpgSide(): Promise<void> {
  const sidePanel = $('side'),
    channel = playback.currentMedia && playback.currentMedia.item;
  if (!channel) return;
  const wasHidden = sidePanel.hidden;
  sidePanel.hidden = false;
  sidePanel.dataset.mode = 'epg';
  $('sideTitle').textContent = 'Guia · ' + channel.name;
  setSideList('<li class="side-note"><span></span><span class="hint">Carregando guia…</span></li>');
  const programmeList = await getEpg(channel),
    now = Date.now();
  if (!programmeList.length) {
    setSideList('<li class="side-note"><span></span><span class="hint">Sem guia de programação para este canal.</span></li>');
    if (wasHidden) focusSidePanel();
    return;
  }
  setSideList(
    programmeList
      .map((programme, index) => {
        const isPast = programme.e < now,
          isCurrent = programme.s <= now && programme.e > now,
          hasCatchup = isPast && (programme.archive || channel.archive);
        const dayLabel = new Date(programme.s).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });
        return `<li data-x="${index}" class="${isPast ? 'past' : ''} ${isCurrent ? 'cur' : ''}"><button type="button" class="side-btn"${isCurrent ? ' aria-current="true"' : ''}><span class="tm">${dayLabel}<br>${formatHourMinute(new Date(programme.s))}</span><span><b style="font-weight:500">${esc(programme.title)}</b>${isCurrent ? ' <span class="badge" style="color:var(--live-text);border-color:var(--live-text)">AGORA</span>' : ''}${hasCatchup ? ' <span class="badge">▶ CATCH-UP</span>' : ''}${programme.desc ? `<br><small class="hint">${esc(programme.desc.slice(0, 140))}</small>` : ''}</span></button></li>`;
      })
      .join(''),
  );
  $('sideList').onclick = clickEvent => {
    const listItem = closest(clickEvent.target, 'li[data-x]');
    if (!listItem) return;
    const programme = programmeList[Number(listItem.dataset.x)];
    if (!programme) return;
    if (programme.s <= Date.now() && programme.e > Date.now()) return playLive(channel, playback.liveChannelList);
    if (programme.e < Date.now() && (programme.archive || channel.archive)) playCatchup(channel, programme);
    else toast(programme.e < Date.now() ? 'Este canal não tem catch-up para esse programa.' : 'Programa ainda não começou.');
  };
  const currentItem = $('sideList').querySelector('.cur');
  if (currentItem) currentItem.scrollIntoView({ block: 'center' });
  if (wasHidden) focusSidePanel();
}

/**
 * Mostra o tempo atual e a duração ao lado da barra de progresso e no texto lido pelo leitor de tela.
 * @param currentTime Posição em segundos.
 * @param duration Duração em segundos.
 */
function showSeekTimes(currentTime: number, duration: number): void {
  $('tCur').textContent = formatTime(currentTime);
  $('tDur').textContent = formatTime(duration);
  $('seek').setAttribute('aria-valuetext', `${formatTime(currentTime)} de ${formatTime(duration)}`);
}

/** Timer que esconde os controles do player. */
let idleTimer: TimerId | undefined;
/**
 * Mostra os controles e agenda escondê-los após 5 s parado. Se nesse momento o vídeo
 * estiver pausado ou a lista lateral aberta, verifica de novo a cada 5 s.
 */
export function poke(): void {
  playerScreen().classList.remove('idle');
  clearTimeout(idleTimer);
  const hideControls = (): void => {
    if (!video().paused && $('side').hidden) playerScreen().classList.add('idle');
    else idleTimer = setTimeout(hideControls, 5000);
  };
  idleTimer = setTimeout(hideControls, 5000);
}
/**
 * Pede para manter a tela ligada (Wake Lock), quando suportado.
 */
async function requestWakeLock(): Promise<void> {
  try {
    await navigator.wakeLock.request('screen');
  } catch {}
}

/** Número de canal sendo digitado no controle. */
let typedChannelNumber = '';
/** Timer que troca para o canal digitado. */
let typedChannelTimer: TimerId | undefined;

/**
 * Liga os eventos desta parte do app. Chamada uma vez, na ordem de `main.ts`.
 */
export function initPlayer(): void {
  $('plBack').onclick = closePlayer;

  /**
   * Preenche os seletores de áudio e legenda na reprodução nativa.
   */
  video().addEventListener('loadedmetadata', () => {
    if (playback.hlsPlayer) return;
    const audioTracks = video().audioTracks;
    if (audioTracks && audioTracks.length > 1) {
      $('cAudio').innerHTML = [...audioTracks]
        .map((track, index) => `<option value="${index}">🔈 ${esc(track.label || track.language || 'Áudio ' + (index + 1))}</option>`)
        .join('');
      $('cAudio').hidden = false;
    }
    const textTracks = video().textTracks;
    if (textTracks.length) {
      $('cSub').innerHTML =
        '<option value="-1">Sem legenda</option>' +
        [...textTracks]
          .map((track, index) => `<option value="${index}">CC ${esc(track.label || track.language || 'Legenda ' + (index + 1))}</option>`)
          .join('');
      $('cSub').hidden = false;
    }
  });

  /**
   * Troca a qualidade (hls.js).
   * @param changeEvent Evento de mudança.
   */
  $('cQual').onchange = () => {
    if (playback.hlsPlayer) playback.hlsPlayer.currentLevel = Number($('cQual').value);
  };

  /**
   * Troca a faixa de áudio.
   * @param changeEvent Evento de mudança.
   */
  $('cAudio').onchange = () => {
    const selectedIndex = Number($('cAudio').value);
    if (playback.hlsPlayer) playback.hlsPlayer.audioTrack = selectedIndex;
    else
      [...(video().audioTracks ?? [])].forEach((track, index) => {
        track.enabled = index === selectedIndex;
      });
  };

  /**
   * Troca ou desativa a legenda.
   * @param changeEvent Evento de mudança.
   */
  $('cSub').onchange = () => {
    const selectedIndex = Number($('cSub').value);
    if (playback.hlsPlayer) {
      playback.hlsPlayer.subtitleTrack = selectedIndex;
      playback.hlsPlayer.subtitleDisplay = selectedIndex >= 0;
    } else [...video().textTracks].forEach((track, index) => (track.mode = index === selectedIndex ? 'showing' : 'disabled'));
  };

  /**
   * Troca o formato da tela e salva a preferência.
   * @param changeEvent Evento de mudança.
   */
  $('cRatio').onchange = () => {
    video().style.objectFit = $('cRatio').value;
    store.set(profileKey('ratio'), $('cRatio').value);
  };

  applyVideoRatio();

  /**
   * Remove mensagens quando o vídeo começa a tocar.
   */
  video().addEventListener('playing', () => showPlayerMessage(''));

  /**
   * Mostra o indicador de carregamento durante o buffer.
   */
  video().addEventListener('waiting', () => {
    if (!playerScreen().hidden) showPlayerMessage(SPINNER_HTML);
  });

  /**
   * Retoma da posição salva quando o vídeo fica pronto.
   */
  video().addEventListener('canplay', () => {
    const media = playback.currentMedia;
    if (media?.resume && media.resume > 5 && video().duration > media.resume + 30) {
      video().currentTime = media.resume;
      media.resume = 0;
    }
  });

  /**
   * Atualiza a barra de progresso e salva o progresso a cada 5 s.
   */
  video().addEventListener('timeupdate', () => {
    if (!playback.currentMedia || playback.currentMedia.kind === 'live') return;
    const duration = video().duration;
    if (isFinite(duration) && duration > 0 && !isSeekDragging) {
      $('seek').value = String((video().currentTime / duration) * 1000);
      showSeekTimes(video().currentTime, duration);
    }
    if (Date.now() - lastProgressSaveAt > 5000) saveProgress();
  });

  /**
   * Ao terminar, salva o progresso e toca o próximo episódio se ativado.
   */
  video().addEventListener('ended', () => {
    if (!playback.currentMedia) return;
    saveProgress();
    const seriesContext = playback.currentMedia.ctx;
    if (seriesContext && state.options.auto === '1' && seriesContext.i + 1 < seriesContext.flat.length) {
      toast('Próximo episódio');
      playEpisode(seriesContext.s, seriesContext.info, seriesContext.flat, seriesContext.i + 1);
    }
  });

  /**
   * Mostra o tempo enquanto a barra de progresso é arrastada.
   */
  $('seek').addEventListener('input', () => {
    isSeekDragging = true;
    showSeekTimes((Number($('seek').value) / 1000) * video().duration, video().duration);
  });

  /**
   * Pula para a posição escolhida na barra de progresso.
   */
  $('seek').addEventListener('change', () => {
    isSeekDragging = false;
    if (isFinite(video().duration)) video().currentTime = (Number($('seek').value) / 1000) * video().duration;
  });

  /**
   * Canal ou episódio anterior.
   */
  $('cPrev').onclick = () => stepChannel(-1);

  /**
   * Próximo canal ou episódio.
   */
  $('cNext').onclick = () => stepChannel(1);

  /**
   * Alterna entre tocar e pausar.
   */
  $('cPlay').onclick = () =>
    video().paused
      ? video()
          .play()
          .catch(() => {})
      : video().pause();

  video().addEventListener('play', syncPlayIcon);

  video().addEventListener('pause', syncPlayIcon);

  /**
   * Volta 10 segundos.
   */
  $('cBack10').onclick = () => {
    video().currentTime = Math.max(0, video().currentTime - 10);
  };

  /**
   * Avança 10 segundos.
   */
  $('cFwd10').onclick = () => {
    video().currentTime += 10;
  };

  /**
   * Liga ou desliga o som.
   */
  $('cMute').onclick = () => {
    video().muted = !video().muted;
    $('cMute').innerHTML = icon(video().muted ? 'mute' : 'vol');
    $('cMute').setAttribute('aria-pressed', String(video().muted));
  };

  /**
   * Alterna o favorito do canal em reprodução.
   */
  $('cFav').onclick = () => {
    if (playback.currentMedia && playback.currentMedia.item) showFavoriteButton(toggleFav('live', playback.currentMedia.item.k));
  };

  /**
   * Entra ou sai da tela cheia (travando em paisagem quando possível).
   */
  $('cFs').onclick = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
      return;
    }
    if ('requestFullscreen' in playerScreen())
      playerScreen()
        .requestFullscreen()
        .then(() => {
          try {
            screen.orientation.lock('landscape').catch(() => undefined);
          } catch {}
        })
        .catch(() => video().webkitEnterFullscreen?.());
    else video().webkitEnterFullscreen?.();
  };

  /**
   * Entra ou sai do Picture-in-Picture.
   */
  $('cPip').onclick = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video().requestPictureInPicture();
    } catch {
      toast('Picture-in-Picture indisponível neste navegador.');
    }
  };

  /**
   * Abre ou fecha o painel de canais/episódios.
   */
  $('cList').onclick = () => (!$('side').hidden && $('side').dataset.mode === 'list' ? closeSidePanel() : showChannelSide());

  /**
   * Abre ou fecha o painel do guia.
   */
  $('cEpg').onclick = () => (!$('side').hidden && $('side').dataset.mode === 'epg' ? closeSidePanel() : void showEpgSide());

  /**
   * Fecha o painel lateral.
   */
  $('sideClose').onclick = closeSidePanel;

  ['mousemove', 'touchstart', 'click', 'focusin'].forEach(eventName => playerScreen().addEventListener(eventName, poke, { passive: true }));

  /**
   * Atalhos de teclado e controle remoto: troca de canal, busca, play/pause,
   * tela cheia, mudo, painéis e digitação do número do canal.
   * @param keyEvent Evento de tecla.
   */
  document.addEventListener('keydown', keyEvent => {
    if ((keyEvent.target instanceof Element && keyEvent.target.matches('input,textarea,select')) || topOpenDialog()) return;
    if (playerScreen().hidden) {
      if (keyEvent.key === '/' && $('section').contains(document.activeElement)) {
        keyEvent.preventDefault();
        $('q').focus();
      }
      return;
    }
    const focusedElement = document.activeElement;
    if (focusedElement && focusedElement !== document.body && !playerScreen().contains(focusedElement)) return;
    poke();
    const isLive = playback.currentMedia && playback.currentMedia.kind === 'live';
    switch (keyEvent.key) {
      case 'ArrowUp':
      case 'PageUp':
      case 'ChannelUp':
        keyEvent.preventDefault();
        stepChannel(-1);
        break;
      case 'ArrowDown':
      case 'PageDown':
      case 'ChannelDown':
        keyEvent.preventDefault();
        stepChannel(1);
        break;
      case 'ArrowLeft':
        if (!isLive) {
          video().currentTime -= 10;
        }
        break;
      case 'ArrowRight':
        if (!isLive) {
          video().currentTime += 10;
        }
        break;
      case ' ':
      case 'MediaPlayPause':
        keyEvent.preventDefault();
        $('cPlay').click();
        break;
      case 'f':
      case 'F':
        $('cFs').click();
        break;
      case 'm':
      case 'M':
        $('cMute').click();
        break;
      case 'l':
      case 'L':
        $('cList').click();
        break;
      case 'g':
      case 'G':
        if (isLive) $('cEpg').click();
        break;
      case 'Escape':
      case 'Backspace':
      case 'BrowserBack':
        if (!$('side').hidden) closeSidePanel();
        else if (!document.fullscreenElement) closePlayer();
        break;
      default:
        if (isLive && /^\d$/.test(keyEvent.key)) {
          typedChannelNumber = (typedChannelNumber + keyEvent.key).slice(-4);
          $('numpad').hidden = false;
          $('numpad').textContent = typedChannelNumber;
          clearTimeout(typedChannelTimer);
          typedChannelTimer = setTimeout(() => {
            const liveItems = activeCatalog().live.items;
            const typedChannel = liveItems.find(
              channel => String(channel.num) === typedChannelNumber && !state.userData.hidden.includes('live:' + channel.cat),
            );
            $('numpad').hidden = true;
            if (typedChannel) withPin('live:' + typedChannel.cat, () => playLive(typedChannel, liveItems));
            else toast('Canal ' + typedChannelNumber + ' não existe.');
            typedChannelNumber = '';
          }, 1500);
        }
    }
  });
}
