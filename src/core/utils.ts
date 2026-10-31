import { icon } from '../ui/icons';
import { $, topOpenDialog } from './dom';
import type { SectionName, TimerId } from './types';

/** Entidades HTML de cada caractere especial. */
const HTML_ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escapa caracteres especiais de HTML.
 * @param value Valor a escapar (null/undefined viram string vazia).
 * @returns Texto seguro para inserir em HTML.
 */
export const esc = (value: string | number | null | undefined): string =>
  String(value ?? '').replace(/[&<>"']/g, character => HTML_ENTITIES[character] ?? character);

/**
 * Acesso ao `localStorage` com prefixo `cl_` e serialização JSON.
 * Todas as operações ignoram erros de armazenamento.
 */
export const store = {
  /**
   * Lê um valor salvo. O conteúdo vem de fora do código: valide antes de usar.
   * @param key Chave (sem prefixo).
   * @returns Valor salvo, ou `null` se não existir ou for inválido.
   */
  get(key: string): unknown {
    try {
      return JSON.parse(localStorage.getItem('cl_' + key) ?? 'null');
    } catch {
      return null;
    }
  },
  /**
   * Lê um texto salvo.
   * @param key Chave (sem prefixo).
   * @returns Texto salvo, ou `null` se não existir ou não for texto.
   */
  getText(key: string): string | null {
    const value = store.get(key);
    return typeof value === 'string' ? value : null;
  },
  /**
   * Salva um valor.
   * @param key Chave (sem prefixo).
   * @param value Valor serializável em JSON.
   * @returns `true` se salvou, `false` se falhou (ex.: cota cheia).
   */
  set(key: string, value: unknown): boolean {
    try {
      localStorage.setItem('cl_' + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  /**
   * Remove um valor salvo.
   * @param key Chave (sem prefixo).
   */
  del(key: string): void {
    try {
      localStorage.removeItem('cl_' + key);
    } catch {}
  },
};
/**
 * Executa uma função sempre que um diálogo fechar (botão, Esc, Voltar do controle ou do
 * Android). Observa o atributo `open` em vez do evento `close`, que nem todo navegador entrega.
 * @param dialog Diálogo.
 * @param handler Função chamada ao fechar.
 */
export const onDialogClose = (dialog: HTMLDialogElement, handler: () => void): void =>
  new MutationObserver(() => {
    if (!dialog.open) handler();
  }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
/**
 * Coloca o aviso (toast) dentro do diálogo em uso (o do elemento focado, ou o último aberto), ou
 * no corpo da página se não houver nenhum. Diálogos modais ficam numa camada acima de tudo e esconderiam o aviso.
 */
function placeToast(): void {
  const toastElement = $('toast');
  const focusedDialog = document.activeElement ? document.activeElement.closest('dialog[open]') : null;
  const toastParent = focusedDialog ?? topOpenDialog() ?? document.body;
  if (toastElement.parentElement !== toastParent) toastParent.appendChild(toastElement);
}
/** Timer que esconde o aviso atual. */
let toastHideTimer: TimerId | undefined;
/**
 * Mostra uma mensagem temporária (3,2 s) no rodapé da tela, por cima de diálogos abertos.
 * @param message Mensagem.
 */
export const toast = (message: string): void => {
  const toastElement = $('toast');
  placeToast();
  toastElement.textContent = message;
  toastElement.classList.add('show');
  clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(() => toastElement.classList.remove('show'), 3200);
};
/** Momento (ms) em que a tela de carregamento atual apareceu. */
let loadingStartedAt: number = 0;
/** Intervalo que atualiza o tempo decorrido do carregamento. */
let loadingTickTimer: TimerId | undefined;
/** Etapas já concluídas no carregamento atual. */
let completedLoadingSteps: string[] = [];
/** Segundos de espera a partir dos quais aparece a dica sobre servidores lentos. */
const LOADING_HINT_AFTER_SECONDS = 15;
/**
 * Atualiza o tempo decorrido do carregamento (ex.: "8 s", "1:05") e a dica de servidor lento.
 */
function renderLoadingTime(): void {
  const elapsedSeconds = Math.floor((Date.now() - loadingStartedAt) / 1000);
  $('loadingSec').textContent =
    elapsedSeconds < 2
      ? ''
      : elapsedSeconds < 60
        ? elapsedSeconds + ' s'
        : Math.floor(elapsedSeconds / 60) + ':' + String(elapsedSeconds % 60).padStart(2, '0');
  $('loadingHint').hidden = elapsedSeconds < LOADING_HINT_AFTER_SECONDS;
}
/**
 * Mostra ou esconde a tela de carregamento. Cada texto novo vira a etapa atual e a anterior
 * entra na lista de etapas concluídas; o tempo conta desde que a tela apareceu. Um trecho final
 * entre parênteses vira uma observação abaixo do título.
 * @param text Etapa atual (ex.: "Baixando lista… (pode levar até 1 minuto)"); valor falso esconde a tela.
 */
export const loading = (text: string | null): void => {
  clearInterval(loadingTickTimer);
  if (!text) {
    $('loading').hidden = true;
    completedLoadingSteps = [];
    return;
  }
  const noteMatch = text.match(/^(.*?)\s*\(([^)]+)\)$/),
    stepTitle = noteMatch?.[1] ?? text,
    note = noteMatch?.[2] ?? '';
  const previousStep = $('loadingTxt').textContent;
  if ($('loading').hidden) {
    loadingStartedAt = Date.now();
    completedLoadingSteps = [];
  } else if (previousStep !== stepTitle) completedLoadingSteps.push(previousStep);
  $('loading').hidden = false;
  $('loadingTxt').textContent = stepTitle;
  $('loadingNote').textContent = note.charAt(0).toUpperCase() + note.slice(1);
  $('loadingSteps').innerHTML = completedLoadingSteps
    .map(step => `<li>${icon('check')}<span>${esc(step.replace(/…$/, ''))}</span></li>`)
    .join('');
  renderLoadingTime();
  loadingTickTimer = setInterval(renderLoadingTime, 1000);
};
/**
 * Formata segundos como `m:ss` ou `h:mm:ss`.
 * @param totalSeconds Tempo em segundos.
 * @returns Tempo formatado (`0:00` se não for finito).
 */
export const formatTime = (totalSeconds: number): string => {
  if (!isFinite(totalSeconds)) return '0:00';
  const wholeSeconds = Math.floor(totalSeconds);
  const hours = (wholeSeconds / 3600) | 0,
    minutes = ((wholeSeconds % 3600) / 60) | 0,
    seconds = wholeSeconds % 60;
  return (hours ? hours + ':' + String(minutes).padStart(2, '0') : minutes) + ':' + String(seconds).padStart(2, '0');
};
/**
 * Formata a hora como `HH:MM` (pt-BR).
 * @param date Data.
 * @returns Hora formatada.
 */
export const formatHourMinute = (date: Date): string => date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
/**
 * Gera até duas iniciais de um nome, já escapadas para HTML.
 * @param name Nome.
 * @returns Iniciais em maiúsculas, ou `•` se não houver.
 */
export const initials = (name: string): string =>
  esc(
    String(name)
      .replace(/[^\p{L}\p{N} ]/gu, '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase() || '•',
  );
/**
 * Decodifica Base64 em UTF-8.
 * @param base64Text Texto em Base64.
 * @returns Texto decodificado, ou o original se falhar.
 */
export const decodeBase64 = (base64Text: string): string => {
  try {
    return decodeURIComponent(escape(atob(base64Text)));
  } catch {
    return base64Text || '';
  }
};
/** Nome exibido de cada seção. */
export const SECTION_NAMES: Record<SectionName, string> = { live: 'TV ao vivo', vod: 'Filmes', series: 'Séries' };
/** Reconhece nomes de categorias de conteúdo adulto. */
export const ADULT_PATTERN = /adult|xxx|18\s*\+|\+\s*18|adulto|porn|erotic/i;

/**
 * Liga os eventos desta parte do app. Chamada uma vez, na ordem de `main.ts`.
 */
export function initToast(): void {
  /**
   * Quando um diálogo fecha com o aviso dentro, o aviso volta para o próximo diálogo aberto ou
   * para a página, para continuar visível.
   */
  document.querySelectorAll('dialog').forEach(dialog =>
    onDialogClose(dialog, () => {
      if (dialog.contains($('toast'))) placeToast();
    }),
  );
}
