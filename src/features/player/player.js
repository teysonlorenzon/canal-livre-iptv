'use strict';
const video = $('v'),
  playerScreen = $('player');
let hlsPlayer = null,
  mpegtsPlayer = null,
  playbackToken = 0,
  currentMedia = null,
  liveChannelList = [],
  lastProgressSaveAt = 0;

/**
 * Etapa da cadeia de reprodução em uso, com os controles usados pelo guardião da TV ao vivo.
 * @typedef {Object} EtapaAtiva
 * @property {number} my Token da reprodução a que a etapa pertence.
 * @property {'hls'|'ts'|'native'} eng Motor em uso.
 * @property {boolean} live Se é transmissão ao vivo.
 * @property {boolean} started Se o vídeo já começou a tocar nesta etapa.
 * @property {boolean} retrying Se a etapa é uma reconexão automática.
 * @property {number} [wd] Timer do limite de 20 s para começar.
 * @property {function(): void} restart Recarrega a mesma etapa (reconexão).
 * @property {function(string): void} giveUp Desiste desta etapa e passa para a próxima.
 */
/** @type {EtapaAtiva|null} Etapa em uso. */
let engine = null;

/**
 * Para e descarta os motores de reprodução (hls.js, mpegts.js e nativo).
 * @returns {void}
 */
function stopEngines() {
  if (hlsPlayer) {
    hlsPlayer.destroy();
    hlsPlayer = null;
  }
  if (mpegtsPlayer) {
    try {
      mpegtsPlayer.pause();
      mpegtsPlayer.unload();
      mpegtsPlayer.detachMediaElement();
      mpegtsPlayer.destroy();
    } catch {}
    mpegtsPlayer = null;
  }
  video.onerror = null;
  video.removeAttribute('src');
  video.load();
}
/**
 * Mostra uma mensagem sobre o vídeo.
 * @param {string} html HTML da mensagem; vazio remove.
 * @returns {void}
 */
const showPlayerMessage = html => {
  $('plMsg').innerHTML = html ? `<div>${html}</div>` : '';
};

/**
 * Tenta tocar usando cada etapa da cadeia até uma funcionar.
 * Cada etapa tem 20 s para começar antes de passar para a próxima; se o vídeo ainda
 * estiver chegando (servidor lento), espera até 60 s e oferece uma versão mais leve do canal.
 * @param {EtapaReproducao[]} chain Etapas em ordem de preferência.
 * @param {boolean} live Se é transmissão ao vivo.
 * @returns {void}
 */
function runChain(chain, live) {
  const chainToken = ++playbackToken;
  let watchdog;
  const reasons = [];
  lastChain = { chain, live };
  nativeError = null;
  /**
   * Inicia a etapa `stageIndex` da cadeia.
   * @param {number} stageIndex Índice da etapa.
   * @param {string} [previousFailure] Motivo da falha da etapa anterior.
   * @param {boolean} [retrying=false] Se é uma reconexão da mesma etapa.
   * @returns {void}
   */
  const startStage = (stageIndex, previousFailure, retrying = false) => {
    clearTimeout(watchdog);
    if (chainToken !== playbackToken) return;
    if (stageIndex >= chain.length) {
      engine = null;
      return showPlaybackFailure(reasons);
    }
    stopEngines();
    const { eng: engineName, url } = chain[stageIndex];
    const currentStage = (engine = {
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
    });
    /**
     * Marca a etapa atual como falha. No ao vivo, depois que o canal já tocou
     * (ou durante uma reconexão), tenta reconectar no mesmo motor antes de desistir.
     * @param {string} reason Motivo da falha.
     * @returns {void}
     */
    const failStage = reason => {
      if (chainToken !== playbackToken || engine !== currentStage) return;
      if (live && (currentStage.started || currentStage.retrying)) return liveRecover(reason);
      currentStage.giveUp(reason);
    };
    let lastLoadedBytes = 0,
      extraWaitMs = 0;
    /**
     * Verifica se o vídeo começou. Se não, mas o pedaço de vídeo ainda está baixando,
     * dá mais tempo (servidor lento) em vez de desistir.
     * @returns {void}
     */
    const checkStarted = () => {
      if (chainToken !== playbackToken || engine !== currentStage || video.readyState >= 2) return;
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
    if (!retrying) showPlayerMessage('<div class="spinner"></div>');
    if (engineName === 'hls') {
      if (window.Hls && Hls.isSupported()) {
        hlsPlayer = new Hls(
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
        let recoveryAttempts = 0;
        hlsPlayer.on(Hls.Events.MANIFEST_PARSED, (_eventName, eventData) => {
          setupTracks(eventData);
          video.play().catch(tapToPlay);
        });
        hlsPlayer.on(Hls.Events.FRAG_LOADING, (_eventName, eventData) => {
          currentStage.frag = eventData.frag;
        });
        hlsPlayer.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => setupTracks());
        hlsPlayer.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => setupTracks());
        hlsPlayer.on(Hls.Events.ERROR, (_eventName, errorData) => {
          if (!errorData.fatal) return;
          if (errorData.type === Hls.ErrorTypes.MEDIA_ERROR && recoveryAttempts++ < 2) return hlsPlayer.recoverMediaError();
          if (errorData.type === Hls.ErrorTypes.NETWORK_ERROR && recoveryAttempts++ < 1 && errorData.details !== 'manifestLoadError')
            return hlsPlayer.startLoad();
          failStage(errorData.details);
        });
        hlsPlayer.loadSource(url);
        hlsPlayer.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) playNative(url, failStage);
      else failStage('HLS não suportado');
    } else if (engineName === 'ts') {
      if (!(window.mpegts && mpegts.isSupported())) return failStage('MPEG-TS não suportado');
      mpegtsPlayer = mpegts.createPlayer(
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
      mpegtsPlayer.on(mpegts.Events.ERROR, (errorType, errorDetail) => failStage(errorDetail || errorType));
      mpegtsPlayer.attachMediaElement(video);
      mpegtsPlayer.load();
      const playPromise = mpegtsPlayer.play();
      if (playPromise && playPromise.catch) playPromise.catch(tapToPlay);
    } else playNative(url, failStage);
  };
  startStage(0);
}
/**
 * Versão mais leve do canal atual na lista (mesmo nome, qualidade menor),
 * ex.: "GLOBO RBS RS FHD" → "GLOBO RBS RS HD" ou "... SD".
 * @returns {Item|null} Canal mais leve, ou `null` se não houver.
 */
function lighterChannel() {
  const currentChannel = currentMedia && currentMedia.kind === 'live' && currentMedia.item;
  if (!currentChannel) return null;
  const QUALITY_SUFFIX = /\s*\b(4K|UHD|FHD|HD|SD)\b(\s*\[[^\]]*\])?\s*$/i;
  const qualityMatch = currentChannel.name.match(QUALITY_SUFFIX);
  if (!qualityMatch) return null;
  const baseName = currentChannel.name.replace(QUALITY_SUFFIX, '').trim().toUpperCase(),
    qualityOrder = ['4K', 'UHD', 'FHD', 'HD', 'SD'];
  const currentQualityIndex = qualityOrder.indexOf(qualityMatch[1].toUpperCase());
  for (const quality of qualityOrder.slice(currentQualityIndex + 1)) {
    const lighterAlternative = liveChannelList.find(
      candidate =>
        candidate !== currentChannel &&
        !/\[/.test(candidate.name) &&
        candidate.name.replace(QUALITY_SUFFIX, '').trim().toUpperCase() === baseName &&
        (candidate.name.match(QUALITY_SUFFIX) || [])[1] &&
        candidate.name.match(QUALITY_SUFFIX)[1].toUpperCase() === quality,
    );
    if (lighterAlternative) return lighterAlternative;
  }
  return null;
}

/**
 * Avisa que o servidor está lento e, se existir, oferece a versão mais leve do canal.
 * @returns {void}
 */
function showSlowServerMessage() {
  const lighterAlternative = lighterChannel();
  showPlayerMessage(
    `<div class="spinner"></div><p style="margin-top:14px">O servidor está enviando este canal devagar. Aguardando o vídeo…</p>${lighterAlternative ? `<div class="row" style="justify-content:center;margin-top:12px"><button class="btn primary" id="fLighter">Assistir ${esc(lighterAlternative.name)}</button></div>` : ''}`,
  );
  if (lighterAlternative) {
    $('fLighter').onclick = () => playLive(lighterAlternative, liveChannelList);
    if (document.documentElement.classList.contains('tv')) $('fLighter').focus();
  }
}

/**
 * Toca pelo elemento `<video>` nativo.
 * @param {string} url URL do conteúdo.
 * @param {function(string): void} onFailure Callback de falha.
 * @returns {void}
 */
function playNative(url, onFailure) {
  video.onerror = () => {
    nativeError = video.error;
    onFailure(describeMediaError(video.error));
  };
  video.src = url;
  video.play().catch(tapToPlay);
}

/**
 * Descreve um erro do elemento `<video>` (código e detalhe do navegador).
 * @param {MediaError|null} mediaError Erro do vídeo.
 * @returns {string} Descrição curta.
 */
function describeMediaError(mediaError) {
  if (!mediaError) return 'erro desconhecido';
  const name =
    { 1: 'interrompido', 2: 'erro de rede', 3: 'falha ao decodificar', 4: 'formato não suportado' }[mediaError.code] ||
    'erro ' + mediaError.code;
  return mediaError.message ? `${name} (${mediaError.message})` : name;
}
/**
 * Pede um toque do usuário quando o navegador bloqueia o autoplay.
 * @param {Error} [playError] Erro de `play()`.
 * @returns {void}
 */
function tapToPlay(playError) {
  if (playError && playError.name === 'NotAllowedError')
    showPlayerMessage('<h2>Toque para assistir</h2><p>O navegador pede um toque antes de tocar com som.</p>');
}
/** @type {{chain: EtapaReproducao[], live: boolean}|null} Última cadeia tentada, para "Tentar de novo". */
let lastChain = null;
/** @type {MediaError|null} Último erro do player nativo. */
let nativeError = null;

/**
 * Explica em linguagem simples por que o conteúdo não tocou.
 * @returns {string} Texto da explicação.
 */
function failReason() {
  const lowerCaseUrl = ((currentMedia && currentMedia.url) || '').toLowerCase();
  if (location.protocol === 'https:' && /^http:/.test(lowerCaseUrl))
    return 'Este conteúdo usa http e a página está em https; o navegador bloqueia. Abra o player pelo arquivo salvo no computador.';
  if (/\.(mp4|m4v|mov)(\?|$)/.test(lowerCaseUrl) && !video.canPlayType('video/mp4; codecs="avc1.42E01E"'))
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
 * @param {string} url URL a testar.
 * @returns {Promise<boolean>} `true` se o servidor respondeu em até 8 s.
 */
async function probeUrl(url) {
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
 * @param {string[]} [reasons] Motivos técnicos de cada tentativa.
 * @returns {void}
 */
function showPlaybackFailure(reasons = []) {
  const url = (currentMedia && currentMedia.url) || '';
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
    const failureToken = playbackToken;
    $('fWhy').textContent = 'Verificando a conexão com o servidor do vídeo…';
    probeUrl(url).then(serverResponded => {
      if (failureToken !== playbackToken || !$('fWhy')) return;
      $('fWhy').textContent = serverResponded
        ? 'O servidor respondeu, mas não entregou um vídeo que o navegador abre. Pode ser formato não suportado (.mkv, HEVC/H.265, áudio AC3/DTS) ou link sem acesso. Tente abrir o link no VLC.'
        : 'Não foi possível conectar ao servidor do vídeo. Ele pode estar fora do ar, o link expirou ou a sua rede bloqueou o acesso.';
    });
  }
  if ($('fCopy'))
    $('fCopy').onclick = async () => {
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
 * @param {string} url URL do conteúdo.
 * @param {boolean} live Se é transmissão ao vivo.
 * @returns {EtapaReproducao[]} Cadeia de tentativas.
 */
function chainFor(url, live) {
  const lowerCaseUrl = url.toLowerCase();
  if (/\.m3u8(\?|$)/.test(lowerCaseUrl))
    return [
      { eng: 'hls', url },
      { eng: 'native', url },
    ];
  if (/\.ts(\?|$)/.test(lowerCaseUrl))
    return live && activePlaylist.type === 'xtream'
      ? [
          { eng: 'hls', url: url.replace(/\.ts(\?|$)/i, '.m3u8$1') },
          { eng: 'ts', url },
        ]
      : [
          { eng: 'ts', url },
          { eng: 'native', url },
        ];
  if (/\.(mp4|m4v|webm|mov|mkv|avi)(\?|$)/.test(lowerCaseUrl))
    return !live && activePlaylist.type === 'xtream'
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
 * @returns {void}
 */
function openPlayer() {
  playerScreen.hidden = false;
  requestWakeLock();
  poke();
}
/**
 * Fecha o player, salva o progresso e volta à tela anterior.
 * @returns {void}
 */
function closePlayer() {
  ++playbackToken;
  engine = null;
  liveGuardReset();
  saveProgress(true);
  stopEngines();
  playerScreen.hidden = true;
  $('side').hidden = true;
  currentMedia = null;
  clearInterval(epgTimer);
  if (!$('section').hidden) renderItems();
  else renderHome();
  try {
    if (document.fullscreenElement) document.exitFullscreen();
  } catch {}
}
$('plBack').onclick = closePlayer;

/**
 * URL de um canal ao vivo no formato configurado.
 * @param {Item} channel Canal.
 * @returns {string} URL do stream.
 */
function liveUrl(channel) {
  return channel.url || xtreamStreamUrl('live', channel.k, options.fmt === 'ts' ? 'ts' : 'm3u8');
}
/**
 * Toca um canal ao vivo.
 * @param {Item} channel Canal.
 * @param {Item[]} [channelList] Lista usada para trocar de canal (padrão: todos os canais).
 * @returns {void}
 */
function playLive(channel, channelList) {
  if (!channel) return;
  liveChannelList = channelList && channelList.length ? channelList : catalog.live.items;
  currentMedia = { kind: 'live', item: channel, url: liveUrl(channel) };
  userData.recentLive = [channel.k, ...userData.recentLive.filter(recentKey => recentKey !== channel.k)].slice(0, 30);
  saveUserData();
  openPlayer();
  $('plTitle').textContent = `${channel.num}  ${channel.name}`;
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
  $('cFav').innerHTML = icon('star', isFav('live', channel.k) ? 'on' : '');
  resetTracks();
  liveGuardReset();
  runChain(chainFor(currentMedia.url, true), true);
  updateEpg();
  if (!$('side').hidden) $('side').dataset.mode === 'epg' ? showEpgSide() : showChannelSide();
}
/**
 * Toca um filme ou episódio.
 * @param {MidiaDesc} desc Descrição da mídia.
 * @param {number} [startPosition=0] Posição inicial em segundos.
 * @param {CtxSerie|null} [seriesContext=null] Contexto da série, para navegar entre episódios.
 * @returns {void}
 */
function playMedia(desc, startPosition = 0, seriesContext = null) {
  currentMedia = { kind: desc.kind, desc, url: desc.url, ctx: seriesContext, resume: startPosition };
  openPlayer();
  $('plTitle').textContent = desc.title;
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
 * @param {number} startTimestamp Início do programa em milissegundos.
 * @returns {string} Data e hora formatadas.
 */
function formatTimeshiftStart(startTimestamp) {
  const startDate = new Date(startTimestamp);
  const padTwoDigits = value => String(value).padStart(2, '0');
  return `${startDate.getFullYear()}-${padTwoDigits(startDate.getMonth() + 1)}-${padTwoDigits(startDate.getDate())}:${padTwoDigits(startDate.getHours())}-${padTwoDigits(startDate.getMinutes())}`;
}

/**
 * Toca um programa já exibido (catch-up / timeshift).
 * @param {Item} channel Canal.
 * @param {Programa} programme Programa.
 * @returns {void}
 */
function playCatchup(channel, programme) {
  const timeshiftStart = programme.start
    ? programme.start
        .replace(' ', ':')
        .replace(/:(\d\d):(\d\d)$/, '-$1')
        .slice(0, 16)
    : formatTimeshiftStart(programme.s);
  const durationMinutes = Math.ceil((programme.e - programme.s) / 60000);
  const url =
    channel.url && activePlaylist.type !== 'xtream'
      ? channel.url
      : `${xtreamBaseUrl()}/timeshift/${encodeURIComponent(activePlaylist.user)}/${encodeURIComponent(activePlaylist.pass)}/${durationMinutes}/${timeshiftStart}/${channel.k}.ts`;
  currentMedia = { kind: 'catchup', item: channel, url, desc: { title: `${channel.name} · ${programme.title}` } };
  $('plTitle').textContent = `${channel.name} · ${programme.title} (${formatHourMinute(new Date(programme.s))})`;
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

let epgTimer;
/**
 * Mostra no cartão do canal o programa atual (com progresso e tempo restante) e o
 * próximo, atualizando a cada 30 s. Sem guia, avisa que não há programação.
 * @returns {Promise<void>}
 */
async function updateEpg() {
  clearInterval(epgTimer);
  const channel = currentMedia && currentMedia.item;
  if (!channel) return;
  const programmeList = await getEpg(channel);
  if (!currentMedia || currentMedia.item !== channel) return;
  /**
   * Desenha o bloco "agora / a seguir".
   * @returns {void}
   */
  const draw = () => {
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

/**
 * Esconde e limpa os seletores de áudio, legenda e qualidade.
 * @returns {void}
 */
function resetTracks() {
  ['cAudio', 'cSub', 'cQual'].forEach(selectId => {
    $(selectId).hidden = true;
    $(selectId).innerHTML = '';
  });
}
/**
 * Preenche os seletores de qualidade, áudio e legenda a partir do hls.js.
 * @returns {void}
 */
function setupTracks() {
  if (!hlsPlayer) return;
  const qualityLevels = hlsPlayer.levels || [];
  if (qualityLevels.length > 1) {
    $('cQual').innerHTML =
      '<option value="-1">Auto</option>' +
      qualityLevels
        .map(
          (level, index) =>
            `<option value="${index}">${level.height ? level.height + 'p' : Math.round(level.bitrate / 1000) + ' kbps'}</option>`,
        )
        .join('');
    $('cQual').value = hlsPlayer.autoLevelEnabled ? -1 : hlsPlayer.currentLevel;
    $('cQual').hidden = false;
  }
  const audioTracks = hlsPlayer.audioTracks || [];
  if (audioTracks.length > 1) {
    $('cAudio').innerHTML = audioTracks
      .map((track, index) => `<option value="${index}">🔈 ${esc(track.name || track.lang || 'Áudio ' + (index + 1))}</option>`)
      .join('');
    $('cAudio').value = hlsPlayer.audioTrack;
    $('cAudio').hidden = false;
  }
  const subtitleTracks = hlsPlayer.subtitleTracks || [];
  if (subtitleTracks.length) {
    $('cSub').innerHTML =
      '<option value="-1">Sem legenda</option>' +
      subtitleTracks
        .map((track, index) => `<option value="${index}">CC ${esc(track.name || track.lang || 'Legenda ' + (index + 1))}</option>`)
        .join('');
    $('cSub').value = hlsPlayer.subtitleTrack;
    $('cSub').hidden = false;
  }
}
/**
 * Preenche os seletores de áudio e legenda na reprodução nativa.
 */
video.addEventListener('loadedmetadata', () => {
  if (hlsPlayer) return;
  const audioTracks = video.audioTracks;
  if (audioTracks && audioTracks.length > 1) {
    $('cAudio').innerHTML = [...audioTracks]
      .map((track, index) => `<option value="${index}">🔈 ${esc(track.label || track.language || 'Áudio ' + (index + 1))}</option>`)
      .join('');
    $('cAudio').hidden = false;
  }
  const textTracks = video.textTracks;
  if (textTracks && textTracks.length) {
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
 * @param {Event} changeEvent Evento de mudança.
 */
$('cQual').onchange = changeEvent => {
  if (hlsPlayer) hlsPlayer.currentLevel = +changeEvent.target.value;
};
/**
 * Troca a faixa de áudio.
 * @param {Event} changeEvent Evento de mudança.
 */
$('cAudio').onchange = changeEvent => {
  const selectedIndex = +changeEvent.target.value;
  if (hlsPlayer) hlsPlayer.audioTrack = selectedIndex;
  else if (video.audioTracks) [...video.audioTracks].forEach((track, index) => (track.enabled = index === selectedIndex));
};
/**
 * Troca ou desativa a legenda.
 * @param {Event} changeEvent Evento de mudança.
 */
$('cSub').onchange = changeEvent => {
  const selectedIndex = +changeEvent.target.value;
  if (hlsPlayer) {
    hlsPlayer.subtitleTrack = selectedIndex;
    hlsPlayer.subtitleDisplay = selectedIndex >= 0;
  } else [...video.textTracks].forEach((track, index) => (track.mode = index === selectedIndex ? 'showing' : 'disabled'));
};
/**
 * Troca o formato da tela e salva a preferência.
 * @param {Event} changeEvent Evento de mudança.
 */
$('cRatio').onchange = changeEvent => {
  video.style.objectFit = changeEvent.target.value;
  store.set(profileKey('ratio'), changeEvent.target.value);
};
/**
 * Aplica a proporção do vídeo salva no perfil ativo.
 * @returns {void}
 */
const applyVideoRatio = () => {
  video.style.objectFit = $('cRatio').value = store.get(profileKey('ratio'), 'contain');
};
applyVideoRatio();

/**
 * Remove mensagens quando o vídeo começa a tocar.
 */
video.addEventListener('playing', () => showPlayerMessage(''));
/**
 * Mostra o indicador de carregamento durante o buffer.
 */
video.addEventListener('waiting', () => {
  if (!playerScreen.hidden) showPlayerMessage('<div class="spinner"></div>');
});
/**
 * Retoma da posição salva quando o vídeo fica pronto.
 */
video.addEventListener('canplay', () => {
  if (currentMedia && currentMedia.resume > 5 && video.duration > currentMedia.resume + 30) {
    video.currentTime = currentMedia.resume;
    currentMedia.resume = 0;
  }
});
/**
 * Atualiza a barra de progresso e salva o progresso a cada 5 s.
 */
video.addEventListener('timeupdate', () => {
  if (!currentMedia || currentMedia.kind === 'live') return;
  const duration = video.duration;
  if (isFinite(duration) && duration > 0 && !$('seek')._drag) {
    $('seek').value = (video.currentTime / duration) * 1000;
    $('tCur').textContent = formatTime(video.currentTime);
    $('tDur').textContent = formatTime(duration);
  }
  if (Date.now() - lastProgressSaveAt > 5000) saveProgress();
});
/**
 * Ao terminar, salva o progresso e toca o próximo episódio se ativado.
 */
video.addEventListener('ended', () => {
  if (!currentMedia) return;
  saveProgress(true);
  const seriesContext = currentMedia.ctx;
  if (seriesContext && options.auto === '1' && seriesContext.i + 1 < seriesContext.flat.length) {
    toast('Próximo episódio');
    playEpisode(seriesContext.s, seriesContext.info, seriesContext.flat, seriesContext.i + 1);
  }
});
/**
 * Mostra o tempo enquanto a barra de progresso é arrastada.
 */
$('seek').addEventListener('input', () => {
  $('seek')._drag = true;
  $('tCur').textContent = formatTime(($('seek').value / 1000) * video.duration);
});
/**
 * Pula para a posição escolhida na barra de progresso.
 */
$('seek').addEventListener('change', () => {
  $('seek')._drag = false;
  if (isFinite(video.duration)) video.currentTime = ($('seek').value / 1000) * video.duration;
});

/**
 * Salva a posição atual no histórico (filmes e episódios com mais de 1 min).
 * @param {boolean} [force] Indica salvamento forçado (ao fechar ou terminar).
 * @returns {void}
 */
function saveProgress(force) {
  if (!currentMedia || !currentMedia.desc || currentMedia.kind === 'catchup' || !userData) return;
  const duration = video.duration;
  if (!isFinite(duration) || duration < 60 || video.currentTime < 5) return;
  lastProgressSaveAt = Date.now();
  const historyRecord = { ...currentMedia.desc, desc: currentMedia.desc, pos: video.currentTime, dur: duration, t: Date.now() };
  userData.hist = [
    historyRecord,
    ...userData.hist.filter(entry => entry.ref !== historyRecord.ref && !(historyRecord.series && entry.series === historyRecord.series)),
  ].slice(0, 60);
  if (historyRecord.series)
    userData.hist.push({ ref: historyRecord.ref, pos: historyRecord.pos, dur: duration, t: historyRecord.t, hidden: true });
  userData.hist = userData.hist
    .filter(
      (entry, index, entries) =>
        !entry.hidden || entries.findIndex(otherEntry => otherEntry.hidden && otherEntry.ref === entry.ref) === index,
    )
    .slice(0, 200);
  saveUserData();
}

/**
 * Vai para o canal ou episódio anterior/próximo.
 * @param {number} direction Direção: -1 anterior, 1 próximo.
 * @returns {void}
 */
const stepChannel = direction => {
  if (!currentMedia) return;
  if (currentMedia.kind === 'live' || currentMedia.kind === 'catchup') {
    const channelList = liveChannelList;
    let channelIndex = channelList.indexOf(currentMedia.item);
    channelIndex = (channelIndex + direction + channelList.length) % channelList.length;
    playLive(channelList[channelIndex], channelList);
  } else if (currentMedia.ctx) {
    const seriesContext = currentMedia.ctx,
      episodeIndex = seriesContext.i + direction;
    if (episodeIndex >= 0 && episodeIndex < seriesContext.flat.length)
      playEpisode(seriesContext.s, seriesContext.info, seriesContext.flat, episodeIndex);
  }
};
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
$('cPlay').onclick = () => (video.paused ? video.play().catch(() => {}) : video.pause());
/**
 * Mostra no botão a ação disponível: pausar enquanto toca, tocar quando pausado.
 */
const syncPlayIcon = () => {
  $('cPlay').innerHTML = icon(video.paused ? 'play' : 'pause');
};
video.addEventListener('play', syncPlayIcon);
video.addEventListener('pause', syncPlayIcon);
/**
 * Volta 10 segundos.
 */
$('cBack10').onclick = () => {
  video.currentTime = Math.max(0, video.currentTime - 10);
};
/**
 * Avança 10 segundos.
 */
$('cFwd10').onclick = () => {
  video.currentTime += 10;
};
/**
 * Liga ou desliga o som.
 */
$('cMute').onclick = () => {
  video.muted = !video.muted;
  $('cMute').innerHTML = icon(video.muted ? 'mute' : 'vol');
};
/**
 * Alterna o favorito do canal em reprodução.
 */
$('cFav').onclick = () => {
  if (currentMedia && currentMedia.item) $('cFav').innerHTML = icon('star', toggleFav('live', currentMedia.item.k) ? 'on' : '');
};
/**
 * Entra ou sai da tela cheia (travando em paisagem quando possível).
 */
$('cFs').onclick = () => {
  if (document.fullscreenElement) return document.exitFullscreen().catch(() => {});
  if (playerScreen.requestFullscreen)
    playerScreen
      .requestFullscreen()
      .then(() => {
        try {
          screen.orientation.lock('landscape').catch(() => {});
        } catch {}
      })
      .catch(() => video.webkitEnterFullscreen && video.webkitEnterFullscreen());
  else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
};
/**
 * Entra ou sai do Picture-in-Picture.
 * @returns {Promise<void>}
 */
$('cPip').onclick = async () => {
  try {
    document.pictureInPictureElement ? await document.exitPictureInPicture() : await video.requestPictureInPicture();
  } catch {
    toast('Picture-in-Picture indisponível neste navegador.');
  }
};

/**
 * Abre o painel lateral com os episódios da série ou a lista de canais.
 * @returns {void}
 */
function showChannelSide() {
  const sidePanel = $('side');
  sidePanel.hidden = false;
  sidePanel.dataset.mode = 'list';
  if (currentMedia && currentMedia.ctx) {
    const seriesContext = currentMedia.ctx;
    $('sideTitle').textContent = seriesContext.s.name;
    $('sideList').innerHTML = seriesContext.flat
      .map(
        (episode, index) =>
          `<li data-x="${index}" class="${index === seriesContext.i ? 'on' : ''}"><span class="tm">T${episode.season}E${episode.num}</span><span>${esc(episode.title)}</span></li>`,
      )
      .join('');
    $('sideList').onclick = clickEvent => {
      const listItem = clickEvent.target.closest('li');
      if (listItem) playEpisode(seriesContext.s, seriesContext.info, seriesContext.flat, +listItem.dataset.x);
    };
  } else {
    $('sideTitle').textContent = 'Canais';
    const channelList = liveChannelList,
      currentChannel = currentMedia && currentMedia.item;
    $('sideList').innerHTML = channelList
      .slice(0, 1500)
      .map(
        (channel, index) =>
          `<li data-x="${index}" class="${channel === currentChannel ? 'on' : ''}"><span class="tm">${esc(channel.num)}</span><span>${esc(channel.name)}</span></li>`,
      )
      .join('');
    $('sideList').onclick = clickEvent => {
      const listItem = clickEvent.target.closest('li');
      if (listItem) playLive(channelList[+listItem.dataset.x], channelList);
    };
  }
  const selectedItem = $('sideList').querySelector('.on');
  if (selectedItem) selectedItem.scrollIntoView({ block: 'center' });
}
/**
 * Abre o painel lateral com o guia do canal, permitindo catch-up.
 * @returns {Promise<void>}
 */
async function showEpgSide() {
  const sidePanel = $('side'),
    channel = currentMedia && currentMedia.item;
  if (!channel) return;
  sidePanel.hidden = false;
  sidePanel.dataset.mode = 'epg';
  $('sideTitle').textContent = 'Guia · ' + channel.name;
  $('sideList').innerHTML = '<li><span></span><span class="hint">Carregando guia…</span></li>';
  const programmeList = await getEpg(channel),
    now = Date.now();
  if (!programmeList.length) {
    $('sideList').innerHTML = '<li><span></span><span class="hint">Sem guia de programação para este canal.</span></li>';
    return;
  }
  $('sideList').innerHTML = programmeList
    .map((programme, index) => {
      const isPast = programme.e < now,
        isCurrent = programme.s <= now && programme.e > now,
        hasCatchup = isPast && (programme.archive || channel.archive);
      const dayLabel = new Date(programme.s).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });
      return `<li data-x="${index}" class="${isPast ? 'past' : ''} ${isCurrent ? 'cur' : ''}"><span class="tm">${dayLabel}<br>${formatHourMinute(new Date(programme.s))}</span><span><b style="font-weight:500">${esc(programme.title)}</b>${isCurrent ? ' <span class="badge" style="color:var(--live);border-color:var(--live)">AGORA</span>' : ''}${hasCatchup ? ' <span class="badge">▶ CATCH-UP</span>' : ''}${programme.desc ? `<br><small class="hint">${esc(programme.desc.slice(0, 140))}</small>` : ''}</span></li>`;
    })
    .join('');
  $('sideList').onclick = clickEvent => {
    const listItem = clickEvent.target.closest('li[data-x]');
    if (!listItem) return;
    const programme = programmeList[+listItem.dataset.x];
    if (programme.s <= Date.now() && programme.e > Date.now()) return playLive(channel, liveChannelList);
    if (programme.e < Date.now() && (programme.archive || channel.archive)) playCatchup(channel, programme);
    else toast(programme.e < Date.now() ? 'Este canal não tem catch-up para esse programa.' : 'Programa ainda não começou.');
  };
  const currentItem = $('sideList').querySelector('.cur');
  if (currentItem) currentItem.scrollIntoView({ block: 'center' });
}
/**
 * Abre ou fecha o painel de canais/episódios.
 */
$('cList').onclick = () => (!$('side').hidden && $('side').dataset.mode === 'list' ? ($('side').hidden = true) : showChannelSide());
/**
 * Abre ou fecha o painel do guia.
 */
$('cEpg').onclick = () => (!$('side').hidden && $('side').dataset.mode === 'epg' ? ($('side').hidden = true) : showEpgSide());
/**
 * Fecha o painel lateral.
 */
$('sideClose').onclick = () => {
  $('side').hidden = true;
};

let idleTimer;
/**
 * Mostra os controles e agenda escondê-los após 5 s parado. Se nesse momento o vídeo
 * estiver pausado ou a lista lateral aberta, verifica de novo a cada 5 s.
 * @returns {void}
 */
function poke() {
  playerScreen.classList.remove('idle');
  clearTimeout(idleTimer);
  const hideControls = () => {
    if (!video.paused && $('side').hidden) playerScreen.classList.add('idle');
    else idleTimer = setTimeout(hideControls, 5000);
  };
  idleTimer = setTimeout(hideControls, 5000);
}
['mousemove', 'touchstart', 'click'].forEach(eventName => playerScreen.addEventListener(eventName, poke, { passive: true }));
/**
 * Clique no vídeo (sem ação além de reexibir os controles).
 */
video.addEventListener('click', () => {
  if (playerScreen.classList.contains('idle')) return;
});
let wakeLock;
/**
 * Pede para manter a tela ligada (Wake Lock), quando suportado.
 * @returns {Promise<void>}
 */
async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {}
}

let typedChannelNumber = '',
  typedChannelTimer;
/**
 * Atalhos de teclado e controle remoto: troca de canal, busca, play/pause,
 * tela cheia, mudo, painéis e digitação do número do canal.
 * @param {KeyboardEvent} keyEvent Evento de tecla.
 */
document.addEventListener('keydown', keyEvent => {
  if (keyEvent.target.matches('input,textarea,select') || document.querySelector('dialog[open]')) return;
  if (playerScreen.hidden) {
    if (keyEvent.key === '/' && !$('section').hidden) {
      keyEvent.preventDefault();
      $('q').focus();
    }
    return;
  }
  poke();
  const isLive = currentMedia && currentMedia.kind === 'live';
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
        video.currentTime -= 10;
      }
      break;
    case 'ArrowRight':
      if (!isLive) {
        video.currentTime += 10;
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
      if (!$('side').hidden) $('side').hidden = true;
      else if (!document.fullscreenElement) closePlayer();
      break;
    default:
      if (isLive && /^\d$/.test(keyEvent.key)) {
        typedChannelNumber = (typedChannelNumber + keyEvent.key).slice(-4);
        $('numpad').hidden = false;
        $('numpad').textContent = typedChannelNumber;
        clearTimeout(typedChannelTimer);
        typedChannelTimer = setTimeout(() => {
          const typedChannel = catalog.live.items.find(
            channel => String(channel.num) === typedChannelNumber && !userData.hidden.includes('live:' + channel.cat),
          );
          $('numpad').hidden = true;
          if (typedChannel) withPin('live:' + typedChannel.cat, () => playLive(typedChannel, catalog.live.items));
          else toast('Canal ' + typedChannelNumber + ' não existe.');
          typedChannelNumber = '';
        }, 1500);
      }
  }
});
