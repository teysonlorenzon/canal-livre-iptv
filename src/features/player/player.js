'use strict';
const v = $('v'), player = $('player');
let hls = null, mts = null, token = 0, playing = null, liveList = [], saveT = 0;

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
function stopEngines(){
  if (hls) { hls.destroy(); hls = null; }
  if (mts) { try { mts.pause(); mts.unload(); mts.detachMediaElement(); mts.destroy(); } catch {} mts = null; }
  v.onerror = null; v.removeAttribute('src'); v.load();
}
/**
 * Mostra uma mensagem sobre o vídeo.
 * @param {string} html HTML da mensagem; vazio remove.
 * @returns {void}
 */
const msg = html => { $('plMsg').innerHTML = html ? `<div>${html}</div>` : ''; };

/**
 * Tenta tocar usando cada etapa da cadeia até uma funcionar.
 * Cada etapa tem 20 s para começar antes de passar para a próxima; se o vídeo ainda
 * estiver chegando (servidor lento), espera até 60 s e oferece uma versão mais leve do canal.
 * @param {EtapaReproducao[]} chain Etapas em ordem de preferência.
 * @param {boolean} live Se é transmissão ao vivo.
 * @returns {void}
 */
function runChain(chain, live){
  const my = ++token; let watchdog;
  const reasons = [];
  lastChain = { chain, live };
  nativeErr = null;
  /**
   * Inicia a etapa `i` da cadeia.
   * @param {number} i Índice da etapa.
   * @param {string} [why] Motivo da falha da etapa anterior.
   * @returns {void}
   */
  const next = (i, why, retrying = false) => {
    clearTimeout(watchdog);
    if (my !== token) return;
    if (i >= chain.length) { engine = null; return fail(reasons); }
    stopEngines();
    const { eng, url } = chain[i];
    const step = engine = { my, eng, live, started:false, retrying,
      restart: () => next(i, why, true),
      giveUp: w => { reasons.push(`${eng.toUpperCase()}: ${w}`); next(i + 1, w); } };
    /**
     * Marca a etapa atual como falha. No ao vivo, depois que o canal já tocou
     * (ou durante uma reconexão), tenta reconectar no mesmo motor antes de desistir.
     * @param {string} w Motivo da falha.
     * @returns {void}
     */
    const bad = w => {
      if (my !== token || engine !== step) return;
      if (live && (step.started || step.retrying)) return liveRecover(w);
      step.giveUp(w);
    };
    let lastLoaded = 0, waited = 0;
    /**
     * Verifica se o vídeo começou. Se não, mas o pedaço de vídeo ainda está baixando,
     * dá mais tempo (servidor lento) em vez de desistir.
     * @returns {void}
     */
    const check = () => {
      if (my !== token || engine !== step || v.readyState >= 2) return;
      const loaded = step.frag ? step.frag.stats.loaded : 0;
      if (loaded > lastLoaded && waited < 40000) {
        lastLoaded = loaded; waited += 10000;
        slowMsg();
        watchdog = step.wd = setTimeout(check, 10000);
        return;
      }
      bad('tempo esgotado');
    };
    watchdog = step.wd = setTimeout(check, 20000);
    if (!retrying) msg('<div class="spinner"></div>');
    if (eng === 'hls') {
      if (window.Hls && Hls.isSupported()) {
        hls = new Hls(live ? {
          enableWorker:true, lowLatencyMode:false, backBufferLength:30,
          maxBufferLength:30, maxMaxBufferLength:60, liveSyncDurationCount:3, liveMaxLatencyDurationCount:10, maxLiveSyncPlaybackRate:1.1,
          manifestLoadingMaxRetry:3, levelLoadingMaxRetry:4, fragLoadingMaxRetry:6, nudgeMaxRetry:6
        } : { enableWorker:true, backBufferLength:30, maxBufferLength:60, fragLoadingMaxRetry:6 });
        let r = 0;
        hls.on(Hls.Events.MANIFEST_PARSED, (_, d) => { setupTracks(d); v.play().catch(tapToPlay); });
        hls.on(Hls.Events.FRAG_LOADING, (_, d) => { step.frag = d.frag; });
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => setupTracks());
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => setupTracks());
        hls.on(Hls.Events.ERROR, (_, d) => {
          if (!d.fatal) return;
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR && r++ < 2) return hls.recoverMediaError();
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR && r++ < 1 && d.details !== 'manifestLoadError') return hls.startLoad();
          bad(d.details);
        });
        hls.loadSource(url); hls.attachMedia(v);
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) native(url, bad);
      else bad('HLS não suportado');
    } else if (eng === 'ts') {
      if (!(window.mpegts && mpegts.isSupported())) return bad('MPEG-TS não suportado');
      mts = mpegts.createPlayer({ type:'mpegts', isLive:live, url }, live ? {
        enableWorker:true, lazyLoad:false, enableStashBuffer:true, stashInitialSize:384 * 1024, autoCleanupSourceBuffer:true,
        liveBufferLatencyChasing:true, liveBufferLatencyMaxLatency:8, liveBufferLatencyMinRemain:3
      } : { enableWorker:true, lazyLoad:true });
      mts.on(mpegts.Events.ERROR, (t, d) => bad(d || t));
      mts.attachMediaElement(v); mts.load(); const p = mts.play(); if (p && p.catch) p.catch(tapToPlay);
    } else native(url, bad);
  };
  next(0);
}
/**
 * Versão mais leve do canal atual na lista (mesmo nome, qualidade menor),
 * ex.: "GLOBO RBS RS FHD" → "GLOBO RBS RS HD" ou "... SD".
 * @returns {Item|null} Canal mais leve, ou `null` se não houver.
 */
function lighterChannel(){
  const c = playing && playing.kind === 'live' && playing.item; if (!c) return null;
  const QUAL = /\s*\b(4K|UHD|FHD|HD|SD)\b(\s*\[[^\]]*\])?\s*$/i;
  const m = c.name.match(QUAL); if (!m) return null;
  const base = c.name.replace(QUAL, '').trim().toUpperCase(), order = ['4K', 'UHD', 'FHD', 'HD', 'SD'];
  const cur = order.indexOf(m[1].toUpperCase());
  for (const q of order.slice(cur + 1)) {
    const alt = liveList.find(i => i !== c && !/\[/.test(i.name) && i.name.replace(QUAL, '').trim().toUpperCase() === base && (i.name.match(QUAL) || [])[1] && i.name.match(QUAL)[1].toUpperCase() === q);
    if (alt) return alt;
  }
  return null;
}

/**
 * Avisa que o servidor está lento e, se existir, oferece a versão mais leve do canal.
 * @returns {void}
 */
function slowMsg(){
  const alt = lighterChannel();
  msg(`<div class="spinner"></div><p style="margin-top:14px">O servidor está enviando este canal devagar. Aguardando o vídeo…</p>${alt ? `<div class="row" style="justify-content:center;margin-top:12px"><button class="btn primary" id="fLighter">Assistir ${esc(alt.name)}</button></div>` : ''}`);
  if (alt) { $('fLighter').onclick = () => playLive(alt, liveList); if (document.documentElement.classList.contains('tv')) $('fLighter').focus(); }
}

/**
 * Toca pelo elemento `<video>` nativo.
 * @param {string} url URL do conteúdo.
 * @param {function(string): void} bad Callback de falha.
 * @returns {void}
 */
function native(url, bad){ v.onerror = () => { nativeErr = v.error; bad(mediaErrText(v.error)); }; v.src = url; v.play().catch(tapToPlay); }

/**
 * Descreve um erro do elemento `<video>` (código e detalhe do navegador).
 * @param {MediaError|null} e Erro do vídeo.
 * @returns {string} Descrição curta.
 */
function mediaErrText(e){
  if (!e) return 'erro desconhecido';
  const name = { 1:'interrompido', 2:'erro de rede', 3:'falha ao decodificar', 4:'formato não suportado' }[e.code] || 'erro ' + e.code;
  return e.message ? `${name} (${e.message})` : name;
}
/**
 * Pede um toque do usuário quando o navegador bloqueia o autoplay.
 * @param {Error} [e] Erro de `play()`.
 * @returns {void}
 */
function tapToPlay(e){ if (e && e.name === 'NotAllowedError') msg('<h2>Toque para assistir</h2><p>O navegador pede um toque antes de tocar com som.</p>'); }
/** @type {{chain: EtapaReproducao[], live: boolean}|null} Última cadeia tentada, para "Tentar de novo". */
let lastChain = null;
/** @type {MediaError|null} Último erro do player nativo. */
let nativeErr = null;

/**
 * Explica em linguagem simples por que o conteúdo não tocou.
 * @returns {string} Texto da explicação.
 */
function failReason(){
  const u = (playing && playing.url || '').toLowerCase();
  if (location.protocol === 'https:' && /^http:/.test(u)) return 'Este conteúdo usa http e a página está em https; o navegador bloqueia. Abra o player pelo arquivo salvo no computador.';
  if (/\.(mp4|m4v|mov)(\?|$)/.test(u) && !v.canPlayType('video/mp4; codecs="avc1.42E01E"')) return 'Este navegador não toca vídeos MP4 (H.264). Use Chrome, Edge ou Safari.';
  const code = nativeErr && nativeErr.code;
  if (code === 2) return 'A conexão com o servidor caiu enquanto o vídeo carregava. Tente de novo.';
  if (code === 3) return 'O navegador não consegue decodificar este vídeo. Geralmente é vídeo HEVC/H.265 ou áudio AC3/DTS. Abra o link em um player como o VLC.';
  if (code === 4 && /\.mkv(\?|$)/.test(u)) return 'Arquivos .mkv costumam usar codecs que o navegador não abre. Abra o link em um player como o VLC.';
  if (code === 4) return 'O servidor não entregou um vídeo que o navegador abre: o formato não é suportado, o link expirou ou a conta não tem acesso a este conteúdo.';
  return 'O conteúdo pode estar fora do ar, usar um formato que o navegador não abre ou o servidor bloqueou o acesso.';
}

/**
 * Verifica se o servidor de uma URL responde (sem ler o conteúdo, por causa do CORS).
 * Cancela o download assim que a resposta chega.
 * @param {string} url URL a testar.
 * @returns {Promise<boolean>} `true` se o servidor respondeu em até 8 s.
 */
async function probeUrl(url){
  const c = new AbortController(), t = setTimeout(() => c.abort(), 8000);
  try { await fetch(url, { mode:'no-cors', signal:c.signal, cache:'no-store' }); return true; }
  catch { return false; }
  finally { clearTimeout(t); c.abort(); }
}

/**
 * Mostra a mensagem de falha de reprodução com o motivo e opções
 * para tentar de novo, copiar o link ou abri-lo fora do app.
 * @param {string[]} [reasons] Motivos técnicos de cada tentativa.
 * @returns {void}
 */
function fail(reasons = []){
  const url = playing && playing.url || '';
  msg(`<h2>Não foi possível tocar</h2><p id="fWhy">${esc(failReason())}</p>
    <div class="row" style="justify-content:center;margin-top:14px">
      <button class="btn" id="fRetry">Tentar de novo</button>
      ${url ? `<button class="btn" id="fCopy">Copiar link</button><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Abrir em nova aba</a>` : ''}
    </div>
    ${reasons.length ? `<p class="hint" style="margin-top:10px">${reasons.map(esc).join('<br>')}</p>` : ''}`);
  $('fRetry').onclick = () => { if (lastChain) runChain(lastChain.chain, lastChain.live); };
  if (url && nativeErr && nativeErr.code === 4 && !(location.protocol === 'https:' && /^http:/i.test(url))) {
    const my = token;
    $('fWhy').textContent = 'Verificando a conexão com o servidor do vídeo…';
    probeUrl(url).then(ok => {
      if (my !== token || !$('fWhy')) return;
      $('fWhy').textContent = ok
        ? 'O servidor respondeu, mas não entregou um vídeo que o navegador abre. Pode ser formato não suportado (.mkv, HEVC/H.265, áudio AC3/DTS) ou link sem acesso. Tente abrir o link no VLC.'
        : 'Não foi possível conectar ao servidor do vídeo. Ele pode estar fora do ar, o link expirou ou a sua rede bloqueou o acesso.';
    });
  }
  if ($('fCopy')) $('fCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast('Link copiado. Cole no VLC em Mídia → Abrir fluxo de rede.'); }
    catch { prompt('Copie o link:', url); }
  };
}

/**
 * Define a ordem de motores a tentar conforme a URL.
 * @param {string} url URL do conteúdo.
 * @param {boolean} live Se é transmissão ao vivo.
 * @returns {EtapaReproducao[]} Cadeia de tentativas.
 */
function chainFor(url, live){
  const u = url.toLowerCase();
  if (/\.m3u8(\?|$)/.test(u)) return [{ eng:'hls', url }, { eng:'native', url }];
  if (/\.ts(\?|$)/.test(u)) return live && P.type === 'xtream' ? [{ eng:'hls', url:url.replace(/\.ts(\?|$)/i,'.m3u8$1') }, { eng:'ts', url }] : [{ eng:'ts', url }, { eng:'native', url }];
  if (/\.(mp4|m4v|webm|mov|mkv|avi)(\?|$)/.test(u)) return !live && P.type === 'xtream' ? [{ eng:'native', url }, { eng:'hls', url:url.replace(/\.\w+(\?|$)/, '.m3u8$1') }] : [{ eng:'native', url }];
  return live ? [{ eng:'hls', url }, { eng:'ts', url }, { eng:'native', url }] : [{ eng:'native', url }, { eng:'hls', url }];
}

/**
 * Exibe o player e mantém a tela ligada.
 * @returns {void}
 */
function openPlayer(){ player.hidden = false; wake(); poke(); }
/**
 * Fecha o player, salva o progresso e volta à tela anterior.
 * @returns {void}
 */
function closePlayer(){ ++token; engine = null; liveGuardReset(); saveProgress(true); stopEngines(); player.hidden = true; $('side').hidden = true; playing = null; clearInterval(epgTimer); if (!$('section').hidden) renderItems(); else renderHome(); try { if (document.fullscreenElement) document.exitFullscreen(); } catch {} }
$('plBack').onclick = closePlayer;

/**
 * URL de um canal ao vivo no formato configurado.
 * @param {Item} c Canal.
 * @returns {string} URL do stream.
 */
function liveUrl(c){ return c.url || xUrl('live', c.k, opts.fmt === 'ts' ? 'ts' : 'm3u8'); }
/**
 * Toca um canal ao vivo.
 * @param {Item} c Canal.
 * @param {Item[]} [list] Lista usada para trocar de canal (padrão: todos os canais).
 * @returns {void}
 */
function playLive(c, list){
  if (!c) return;
  liveList = list && list.length ? list : D.live.items;
  playing = { kind:'live', item:c, url:liveUrl(c) };
  ux.recentLive = [c.k, ...ux.recentLive.filter(k => k !== c.k)].slice(0, 30); saveUx();
  openPlayer();
  $('plTitle').textContent = `${c.num}  ${c.name}`;
  $('osdName').textContent = `${c.num}  ${c.name}`;
  $('osdLogo').innerHTML = c.logo ? `<img src="${esc(c.logo)}" alt="" onerror="this.outerHTML='${initials(c.name)}'">` : initials(c.name);
  $('epgNow').hidden = false; $('epgT').textContent = 'Carregando programação…'; $('epgTime').textContent = $('epgLeft').textContent = $('epgN').textContent = ''; $('epgP').style.width = '0';
  $('seekRow').hidden = true; $('cBack10').hidden = $('cFwd10').hidden = true;
  $('cList').hidden = false; $('cEpg').hidden = false; $('cFav').hidden = false;
  $('cFav').innerHTML = icon('star', isFav('live', c.k) ? 'on' : '');
  resetTracks();
  liveGuardReset();
  runChain(chainFor(playing.url, true), true);
  updateEpg();
  if (!$('side').hidden) $('side').dataset.mode === 'epg' ? showEpgSide() : showChannelSide();
}
/**
 * Toca um filme ou episódio.
 * @param {MidiaDesc} desc Descrição da mídia.
 * @param {number} [pos=0] Posição inicial em segundos.
 * @param {CtxSerie|null} [ctx=null] Contexto da série, para navegar entre episódios.
 * @returns {void}
 */
function playMedia(desc, pos=0, ctx=null){
  playing = { kind:desc.kind, desc, url:desc.url, ctx, resume:pos };
  openPlayer();
  $('plTitle').textContent = desc.title;
  $('epgNow').hidden = true; $('seekRow').hidden = false; $('cBack10').hidden = $('cFwd10').hidden = false;
  $('cList').hidden = !ctx; $('cList').textContent = ctx ? 'Episódios' : 'Canais';
  $('cEpg').hidden = true; $('cFav').hidden = true;
  resetTracks();
  liveGuardReset();
  runChain(chainFor(desc.url, false), false);
}

/**
 * Toca um programa já exibido (catch-up / timeshift).
 * @param {Item} c Canal.
 * @param {Programa} p Programa.
 * @returns {void}
 */
function playCatchup(c, p){
  const st = p.start ? p.start.replace(' ', ':').replace(/:(\d\d):(\d\d)$/, '-$1').slice(0, 16) : (() => { const d = new Date(p.s); const z = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}:${z(d.getHours())}-${z(d.getMinutes())}`; })();
  const dur = Math.ceil((p.e - p.s) / 60000);
  const url = c.url && P.type !== 'xtream' ? c.url : `${xBase()}/timeshift/${encodeURIComponent(P.user)}/${encodeURIComponent(P.pass)}/${dur}/${st}/${c.k}.ts`;
  playing = { kind:'catchup', item:c, url, desc:{ title:`${c.name} · ${p.title}` } };
  $('plTitle').textContent = `${c.name} · ${p.title} (${hm(new Date(p.s))})`;
  $('seekRow').hidden = false; $('cBack10').hidden = $('cFwd10').hidden = false; $('epgNow').hidden = true;
  resetTracks();
  runChain([{ eng:'ts', url }, { eng:'hls', url:url.replace(/\.ts$/, '.m3u8') }, { eng:'native', url }], false);
}

let epgTimer;
/**
 * Mostra no cartão do canal o programa atual (com progresso e tempo restante) e o
 * próximo, atualizando a cada 30 s. Sem guia, avisa que não há programação.
 * @returns {Promise<void>}
 */
async function updateEpg(){
  clearInterval(epgTimer);
  const c = playing && playing.item; if (!c) return;
  const l = await getEpg(c);
  if (!playing || playing.item !== c) return;
  /**
   * Desenha o bloco "agora / a seguir".
   * @returns {void}
   */
  const draw = () => {
    const [n, x] = nowNext(l);
    $('epgNow').hidden = false;
    $('epgNow').classList.toggle('none', !n);
    $('epgT').textContent = n ? n.title : 'Programação não disponível para este canal';
    $('epgTime').textContent = n ? `${hm(new Date(n.s))} – ${hm(new Date(n.e))}` : '';
    $('epgP').style.width = n ? Math.min(100, (Date.now() - n.s) / (n.e - n.s) * 100) + '%' : '0';
    const left = n ? Math.max(0, Math.round((n.e - Date.now()) / 60000)) : 0;
    $('epgLeft').textContent = n ? (left >= 60 ? `faltam ${Math.floor(left / 60)}h${String(left % 60).padStart(2, '0')}` : `faltam ${left} min`) : '';
    $('epgN').innerHTML = x ? `<span>A seguir</span> ${hm(new Date(x.s))} · ${esc(x.title)}` : '';
  };
  draw(); epgTimer = setInterval(draw, 30000);
}

/**
 * Esconde e limpa os seletores de áudio, legenda e qualidade.
 * @returns {void}
 */
function resetTracks(){ ['cAudio','cSub','cQual'].forEach(id => { $(id).hidden = true; $(id).innerHTML = ''; }); }
/**
 * Preenche os seletores de qualidade, áudio e legenda a partir do hls.js.
 * @returns {void}
 */
function setupTracks(){
  if (!hls) return;
  const lv = hls.levels || [];
  if (lv.length > 1) { $('cQual').innerHTML = '<option value="-1">Auto</option>' + lv.map((l,i) => `<option value="${i}">${l.height ? l.height+'p' : Math.round(l.bitrate/1000)+' kbps'}</option>`).join(''); $('cQual').value = hls.autoLevelEnabled ? -1 : hls.currentLevel; $('cQual').hidden = false; }
  const at = hls.audioTracks || [];
  if (at.length > 1) { $('cAudio').innerHTML = at.map((t,i) => `<option value="${i}">🔈 ${esc(t.name || t.lang || 'Áudio '+(i+1))}</option>`).join(''); $('cAudio').value = hls.audioTrack; $('cAudio').hidden = false; }
  const st = hls.subtitleTracks || [];
  if (st.length) { $('cSub').innerHTML = '<option value="-1">Sem legenda</option>' + st.map((t,i) => `<option value="${i}">CC ${esc(t.name || t.lang || 'Legenda '+(i+1))}</option>`).join(''); $('cSub').value = hls.subtitleTrack; $('cSub').hidden = false; }
}
/**
 * Preenche os seletores de áudio e legenda na reprodução nativa.
 */
v.addEventListener('loadedmetadata', () => {
  if (hls) return;
  const at = v.audioTracks;
  if (at && at.length > 1) { $('cAudio').innerHTML = [...at].map((t,i) => `<option value="${i}">🔈 ${esc(t.label || t.language || 'Áudio '+(i+1))}</option>`).join(''); $('cAudio').hidden = false; }
  const tt = v.textTracks;
  if (tt && tt.length) { $('cSub').innerHTML = '<option value="-1">Sem legenda</option>' + [...tt].map((t,i) => `<option value="${i}">CC ${esc(t.label || t.language || 'Legenda '+(i+1))}</option>`).join(''); $('cSub').hidden = false; }
});
/**
 * Troca a qualidade (hls.js).
 * @param {Event} e Evento de mudança.
 */
$('cQual').onchange = e => { if (hls) hls.currentLevel = +e.target.value; };
/**
 * Troca a faixa de áudio.
 * @param {Event} e Evento de mudança.
 */
$('cAudio').onchange = e => { const i = +e.target.value; if (hls) hls.audioTrack = i; else if (v.audioTracks) [...v.audioTracks].forEach((t,j) => t.enabled = j === i); };
/**
 * Troca ou desativa a legenda.
 * @param {Event} e Evento de mudança.
 */
$('cSub').onchange = e => { const i = +e.target.value; if (hls) { hls.subtitleTrack = i; hls.subtitleDisplay = i >= 0; } else [...v.textTracks].forEach((t,j) => t.mode = j === i ? 'showing' : 'disabled'); };
/**
 * Troca o formato da tela e salva a preferência.
 * @param {Event} e Evento de mudança.
 */
$('cRatio').onchange = e => { v.style.objectFit = e.target.value; store.set('ratio', e.target.value); };
v.style.objectFit = $('cRatio').value = store.get('ratio', 'contain');

/**
 * Remove mensagens quando o vídeo começa a tocar.
 */
v.addEventListener('playing', () => msg(''));
/**
 * Mostra o indicador de carregamento durante o buffer.
 */
v.addEventListener('waiting', () => { if (!player.hidden) msg('<div class="spinner"></div>'); });
/**
 * Retoma da posição salva quando o vídeo fica pronto.
 */
v.addEventListener('canplay', () => { if (playing && playing.resume > 5 && v.duration > playing.resume + 30) { v.currentTime = playing.resume; playing.resume = 0; } });
/**
 * Atualiza a barra de progresso e salva o progresso a cada 5 s.
 */
v.addEventListener('timeupdate', () => {
  if (!playing || playing.kind === 'live') return;
  const d = v.duration;
  if (isFinite(d) && d > 0 && !$('seek')._drag) { $('seek').value = v.currentTime / d * 1000; $('tCur').textContent = fmtT(v.currentTime); $('tDur').textContent = fmtT(d); }
  if (Date.now() - saveT > 5000) saveProgress();
});
/**
 * Ao terminar, salva o progresso e toca o próximo episódio se ativado.
 */
v.addEventListener('ended', () => {
  if (!playing) return;
  saveProgress(true);
  const c = playing.ctx;
  if (c && opts.auto === '1' && c.i + 1 < c.flat.length) { toast('Próximo episódio'); playEpisode(c.s, c.info, c.flat, c.i + 1); }
});
/**
 * Mostra o tempo enquanto a barra de progresso é arrastada.
 */
$('seek').addEventListener('input', () => { $('seek')._drag = true; $('tCur').textContent = fmtT($('seek').value / 1000 * v.duration); });
/**
 * Pula para a posição escolhida na barra de progresso.
 */
$('seek').addEventListener('change', () => { $('seek')._drag = false; if (isFinite(v.duration)) v.currentTime = $('seek').value / 1000 * v.duration; });

/**
 * Salva a posição atual no histórico (filmes e episódios com mais de 1 min).
 * @param {boolean} [force] Indica salvamento forçado (ao fechar ou terminar).
 * @returns {void}
 */
function saveProgress(force){
  if (!playing || !playing.desc || playing.kind === 'catchup' || !ux) return;
  const d = v.duration; if (!isFinite(d) || d < 60 || v.currentTime < 5) return;
  saveT = Date.now();
  const rec = { ...playing.desc, desc:playing.desc, pos:v.currentTime, dur:d, t:Date.now() };
  ux.hist = [rec, ...ux.hist.filter(x => x.ref !== rec.ref && !(rec.series && x.series === rec.series))].slice(0, 60);
  if (rec.series) ux.hist.push({ ref:rec.ref, pos:rec.pos, dur:d, t:rec.t, hidden:true });
  ux.hist = ux.hist.filter((x, i, a) => !x.hidden || a.findIndex(y => y.hidden && y.ref === x.ref) === i).slice(0, 200);
  saveUx();
}

/**
 * Vai para o canal ou episódio anterior/próximo.
 * @param {number} d Direção: -1 anterior, 1 próximo.
 * @returns {void}
 */
const step = d => {
  if (!playing) return;
  if (playing.kind === 'live' || playing.kind === 'catchup') {
    const l = liveList; let i = l.indexOf(playing.item); i = (i + d + l.length) % l.length; playLive(l[i], l);
  } else if (playing.ctx) { const c = playing.ctx, i = c.i + d; if (i >= 0 && i < c.flat.length) playEpisode(c.s, c.info, c.flat, i); }
};
/**
 * Canal ou episódio anterior.
 */
$('cPrev').onclick = () => step(-1);
/**
 * Próximo canal ou episódio.
 */
$('cNext').onclick = () => step(1);
/**
 * Alterna entre tocar e pausar.
 */
$('cPlay').onclick = () => v.paused ? v.play().catch(()=>{}) : v.pause();
/**
 * Mostra no botão a ação disponível: pausar enquanto toca, tocar quando pausado.
 */
const syncPlayIcon = () => { $('cPlay').innerHTML = icon(v.paused ? 'play' : 'pause'); };
v.addEventListener('play', syncPlayIcon);
v.addEventListener('pause', syncPlayIcon);
/**
 * Volta 10 segundos.
 */
$('cBack10').onclick = () => { v.currentTime = Math.max(0, v.currentTime - 10); };
/**
 * Avança 10 segundos.
 */
$('cFwd10').onclick = () => { v.currentTime += 10; };
/**
 * Liga ou desliga o som.
 */
$('cMute').onclick = () => { v.muted = !v.muted; $('cMute').innerHTML = icon(v.muted ? 'mute' : 'vol'); };
/**
 * Alterna o favorito do canal em reprodução.
 */
$('cFav').onclick = () => { if (playing && playing.item) $('cFav').innerHTML = icon('star', toggleFav('live', playing.item.k) ? 'on' : ''); };
/**
 * Entra ou sai da tela cheia (travando em paisagem quando possível).
 */
$('cFs').onclick = () => {
  if (document.fullscreenElement) return document.exitFullscreen().catch(()=>{});
  if (player.requestFullscreen) player.requestFullscreen().then(() => { try { screen.orientation.lock('landscape').catch(()=>{}); } catch {} }).catch(() => v.webkitEnterFullscreen && v.webkitEnterFullscreen());
  else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
};
/**
 * Entra ou sai do Picture-in-Picture.
 * @returns {Promise<void>}
 */
$('cPip').onclick = async () => { try { document.pictureInPictureElement ? await document.exitPictureInPicture() : await v.requestPictureInPicture(); } catch { toast('Picture-in-Picture indisponível neste navegador.'); } };

/**
 * Abre o painel lateral com os episódios da série ou a lista de canais.
 * @returns {void}
 */
function showChannelSide(){
  const side = $('side'); side.hidden = false; side.dataset.mode = 'list';
  if (playing && playing.ctx) {
    const c = playing.ctx; $('sideTitle').textContent = c.s.name;
    $('sideList').innerHTML = c.flat.map((e,i) => `<li data-x="${i}" class="${i === c.i ? 'on' : ''}"><span class="tm">T${e.season}E${e.num}</span><span>${esc(e.title)}</span></li>`).join('');
    $('sideList').onclick = ev => { const li = ev.target.closest('li'); if (li) playEpisode(c.s, c.info, c.flat, +li.dataset.x); };
  } else {
    $('sideTitle').textContent = 'Canais';
    const l = liveList, cur = playing && playing.item;
    $('sideList').innerHTML = l.slice(0, 1500).map((c,i) => `<li data-x="${i}" class="${c === cur ? 'on' : ''}"><span class="tm">${esc(c.num)}</span><span>${esc(c.name)}</span></li>`).join('');
    $('sideList').onclick = ev => { const li = ev.target.closest('li'); if (li) playLive(l[+li.dataset.x], l); };
  }
  const on = $('sideList').querySelector('.on'); if (on) on.scrollIntoView({ block:'center' });
}
/**
 * Abre o painel lateral com o guia do canal, permitindo catch-up.
 * @returns {Promise<void>}
 */
async function showEpgSide(){
  const side = $('side'), c = playing && playing.item; if (!c) return;
  side.hidden = false; side.dataset.mode = 'epg'; $('sideTitle').textContent = 'Guia · ' + c.name;
  $('sideList').innerHTML = '<li><span></span><span class="hint">Carregando guia…</span></li>';
  const l = await getEpg(c), t = Date.now();
  if (!l.length) { $('sideList').innerHTML = '<li><span></span><span class="hint">Sem guia de programação para este canal.</span></li>'; return; }
  $('sideList').innerHTML = l.map((p,i) => {
    const past = p.e < t, cur = p.s <= t && p.e > t, can = past && (p.archive || c.archive);
    const day = new Date(p.s).toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit' });
    return `<li data-x="${i}" class="${past ? 'past' : ''} ${cur ? 'cur' : ''}"><span class="tm">${day}<br>${hm(new Date(p.s))}</span><span><b style="font-weight:500">${esc(p.title)}</b>${cur ? ' <span class="badge" style="color:var(--live);border-color:var(--live)">AGORA</span>' : ''}${can ? ' <span class="badge">▶ CATCH-UP</span>' : ''}${p.desc ? `<br><small class="hint">${esc(p.desc.slice(0, 140))}</small>` : ''}</span></li>`;
  }).join('');
  $('sideList').onclick = ev => {
    const li = ev.target.closest('li[data-x]'); if (!li) return; const p = l[+li.dataset.x];
    if (p.s <= Date.now() && p.e > Date.now()) return playLive(c, liveList);
    if (p.e < Date.now() && (p.archive || c.archive)) playCatchup(c, p);
    else toast(p.e < Date.now() ? 'Este canal não tem catch-up para esse programa.' : 'Programa ainda não começou.');
  };
  const on = $('sideList').querySelector('.cur'); if (on) on.scrollIntoView({ block:'center' });
}
/**
 * Abre ou fecha o painel de canais/episódios.
 */
$('cList').onclick = () => !$('side').hidden && $('side').dataset.mode === 'list' ? ($('side').hidden = true) : showChannelSide();
/**
 * Abre ou fecha o painel do guia.
 */
$('cEpg').onclick = () => !$('side').hidden && $('side').dataset.mode === 'epg' ? ($('side').hidden = true) : showEpgSide();
/**
 * Fecha o painel lateral.
 */
$('sideClose').onclick = () => { $('side').hidden = true; };

let idleT;
/**
 * Mostra os controles e agenda escondê-los após 5 s parado. Se nesse momento o vídeo
 * estiver pausado ou a lista lateral aberta, verifica de novo a cada 5 s.
 * @returns {void}
 */
function poke(){
  player.classList.remove('idle'); clearTimeout(idleT);
  const hide = () => { if (!v.paused && $('side').hidden) player.classList.add('idle'); else idleT = setTimeout(hide, 5000); };
  idleT = setTimeout(hide, 5000);
}
['mousemove','touchstart','click'].forEach(e => player.addEventListener(e, poke, { passive:true }));
/**
 * Clique no vídeo (sem ação além de reexibir os controles).
 */
v.addEventListener('click', () => { if (player.classList.contains('idle')) return; });
let wl;
/**
 * Pede para manter a tela ligada (Wake Lock), quando suportado.
 * @returns {Promise<void>}
 */
async function wake(){ try { wl = await navigator.wakeLock.request('screen'); } catch {} }

let numBuf = '', numT;
/**
 * Atalhos de teclado e controle remoto: troca de canal, busca, play/pause,
 * tela cheia, mudo, painéis e digitação do número do canal.
 * @param {KeyboardEvent} e Evento de tecla.
 */
document.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,select') || document.querySelector('dialog[open]')) return;
  if (player.hidden) { if (e.key === '/' && !$('section').hidden) { e.preventDefault(); $('q').focus(); } return; }
  poke();
  const live = playing && playing.kind === 'live';
  switch (e.key) {
    case 'ArrowUp': case 'PageUp': case 'ChannelUp': e.preventDefault(); step(-1); break;
    case 'ArrowDown': case 'PageDown': case 'ChannelDown': e.preventDefault(); step(1); break;
    case 'ArrowLeft': if (!live) { v.currentTime -= 10; } break;
    case 'ArrowRight': if (!live) { v.currentTime += 10; } break;
    case ' ': case 'MediaPlayPause': e.preventDefault(); $('cPlay').click(); break;
    case 'f': case 'F': $('cFs').click(); break;
    case 'm': case 'M': $('cMute').click(); break;
    case 'l': case 'L': $('cList').click(); break;
    case 'g': case 'G': if (live) $('cEpg').click(); break;
    case 'Escape': case 'Backspace': case 'BrowserBack': if (!$('side').hidden) $('side').hidden = true; else if (!document.fullscreenElement) closePlayer(); break;
    default:
      if (live && /^\d$/.test(e.key)) {
        numBuf = (numBuf + e.key).slice(-4); $('numpad').hidden = false; $('numpad').textContent = numBuf;
        clearTimeout(numT); numT = setTimeout(() => {
          const c = D.live.items.find(i => String(i.num) === numBuf && !ux.hidden.includes('live:'+i.cat));
          $('numpad').hidden = true;
          if (c) withPin('live:'+c.cat, () => playLive(c, D.live.items)); else toast('Canal ' + numBuf + ' não existe.');
          numBuf = '';
        }, 1500);
      }
  }
});
