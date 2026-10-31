import { $ } from '../../core/dom';
import { toast } from '../../core/utils';
import { playback, video } from '../player/playback';

/**
 * Destino remoto do vídeo, que só existe nos navegadores com a Remote Playback API.
 * @returns O destino, ou `undefined` sem a API.
 */
function remotePlayback(): RemotePlayback | undefined {
  const videoElement = video();
  return 'remote' in videoElement ? videoElement.remote : undefined;
}

/**
 * Oferece ao `<video>` o endereço original da mídia como fonte alternativa. O hls.js e o
 * mpegts.js tocam por um `blob:` (MSE), que o aparelho remoto não consegue abrir; o
 * navegador usa este `<source>` para pedir a mídia direto à TV.
 */
function syncRemoteSource(): void {
  const mediaUrl = playback.currentMedia?.url;
  const videoElement = video();
  videoElement.querySelectorAll('source').forEach(sourceElement => sourceElement.remove());
  if (!mediaUrl) return;
  const sourceElement = document.createElement('source');
  sourceElement.src = mediaUrl;
  videoElement.appendChild(sourceElement);
}

/**
 * Atualiza o botão conforme a transmissão esteja ligada ou não.
 * @param connected Se o vídeo está sendo transmitido.
 */
function showCastState(connected: boolean): void {
  $('cCast').setAttribute('aria-pressed', String(connected));
  $('cCast').classList.toggle('on', connected);
}

/**
 * Abre o seletor de aparelhos para transmitir o vídeo para a TV: Remote Playback (Chrome,
 * Edge e outros, para Chromecast e TVs compatíveis) ou AirPlay (Safari). Onde nenhum dos
 * dois existe, ensina a transmitir a aba pelo menu do navegador.
 */
async function openCastPicker(): Promise<void> {
  const videoElement = video();
  videoElement.disableRemotePlayback = false;
  syncRemoteSource();
  const remote = remotePlayback();
  if (remote) {
    try {
      await remote.prompt();
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'NotAllowedError')
        toast('Nenhuma TV encontrada na rede. Confira se o aparelho está no mesmo Wi-Fi.');
    }
    return;
  }
  if (videoElement.webkitShowPlaybackTargetPicker) return videoElement.webkitShowPlaybackTargetPicker();
  toast('Este navegador não transmite o vídeo. Use o menu do navegador: Transmitir aba ou tela.');
}

/**
 * Liga o botão de transmitir para a TV do player. Fora da TV (a TV esconde o botão em `tv.css`).
 */
export function initCast(): void {
  const remote = remotePlayback();
  remote?.addEventListener('connect', () => showCastState(true));
  remote?.addEventListener('disconnect', () => showCastState(false));
  $('cCast').onclick = () => void openCastPicker();
}
