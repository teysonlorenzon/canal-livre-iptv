'use strict';
/**
 * Atalho para `document.getElementById`.
 * @param {string} id Id do elemento.
 * @returns {HTMLElement|null} O elemento encontrado.
 */
const $ = id => document.getElementById(id);
/**
 * Escapa caracteres especiais de HTML.
 * @param {*} value Valor a escapar (null/undefined viram string vazia).
 * @returns {string} Texto seguro para inserir em HTML.
 */
const esc = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
/**
 * Acesso ao `localStorage` com prefixo `cl_` e serialização JSON.
 * Todas as operações ignoram erros de armazenamento.
 */
const store = {
  /**
   * Lê um valor salvo.
   * @param {string} key Chave (sem prefixo).
   * @param {*} defaultValue Valor padrão caso não exista ou seja inválido.
   * @returns {*} Valor salvo ou o padrão.
   */
  get(key, defaultValue) {
    try {
      const rawValue = localStorage.getItem('cl_' + key);
      return rawValue == null ? defaultValue : JSON.parse(rawValue);
    } catch {
      return defaultValue;
    }
  },
  /**
   * Salva um valor.
   * @param {string} key Chave (sem prefixo).
   * @param {*} value Valor serializável em JSON.
   * @returns {boolean} `true` se salvou, `false` se falhou (ex.: cota cheia).
   */
  set(key, value) {
    try {
      localStorage.setItem('cl_' + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  /**
   * Remove um valor salvo.
   * @param {string} key Chave (sem prefixo).
   * @returns {void}
   */
  del(key) {
    try {
      localStorage.removeItem('cl_' + key);
    } catch {}
  },
};
/**
 * Executa uma função sempre que um diálogo fechar (botão, Esc, Voltar do controle ou do
 * Android). Observa o atributo `open` em vez do evento `close`, que nem todo navegador entrega.
 * @param {HTMLDialogElement} dialog Diálogo.
 * @param {Function} handler Função chamada ao fechar.
 * @returns {void}
 */
const onDialogClose = (dialog, handler) =>
  new MutationObserver(() => {
    if (!dialog.open) handler();
  }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
/**
 * Coloca o aviso (toast) dentro do diálogo em uso (o do elemento focado, ou o último aberto), ou
 * no corpo da página se não houver nenhum. Diálogos modais ficam numa camada acima de tudo e esconderiam o aviso.
 * @returns {void}
 */
function placeToast() {
  const toastElement = $('toast'),
    openDialogs = document.querySelectorAll('dialog[open]'),
    focusedElement = document.activeElement;
  const focusedDialog = focusedElement && focusedElement.closest ? focusedElement.closest('dialog[open]') : null;
  const toastParent = focusedDialog || (openDialogs.length ? openDialogs[openDialogs.length - 1] : document.body);
  if (toastElement.parentElement !== toastParent) toastParent.appendChild(toastElement);
}
/**
 * Quando um diálogo fecha com o aviso dentro, o aviso volta para o próximo diálogo aberto ou
 * para a página, para continuar visível.
 */
document.querySelectorAll('dialog').forEach(dialog =>
  onDialogClose(dialog, () => {
    if (dialog.contains($('toast'))) placeToast();
  }),
);
/**
 * Mostra uma mensagem temporária (3,2 s) no rodapé da tela, por cima de diálogos abertos.
 * @param {string} message Mensagem.
 * @returns {void}
 */
const toast = message => {
  const toastElement = $('toast');
  placeToast();
  toastElement.textContent = message;
  toastElement.classList.add('show');
  clearTimeout(toastElement._h);
  toastElement._h = setTimeout(() => toastElement.classList.remove('show'), 3200);
};
/** @type {number} Momento (ms) em que a tela de carregamento atual apareceu. */
let loadingStartedAt = 0;
/** @type {number|undefined} Intervalo que atualiza o tempo decorrido do carregamento. */
let loadingTickTimer;
/** @type {string[]} Etapas já concluídas no carregamento atual. */
let completedLoadingSteps = [];
/** @type {number} Segundos de espera a partir dos quais aparece a dica sobre servidores lentos. */
const LOADING_HINT_AFTER_SECONDS = 15;
/**
 * Atualiza o tempo decorrido do carregamento (ex.: "8 s", "1:05") e a dica de servidor lento.
 * @returns {void}
 */
function renderLoadingTime() {
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
 * @param {string|null} text Etapa atual (ex.: "Baixando lista… (pode levar até 1 minuto)"); valor falso esconde a tela.
 * @returns {void}
 */
const loading = text => {
  clearInterval(loadingTickTimer);
  if (!text) {
    $('loading').hidden = true;
    completedLoadingSteps = [];
    return;
  }
  const noteMatch = text.match(/^(.*?)\s*\(([^)]+)\)$/),
    stepTitle = noteMatch ? noteMatch[1] : text;
  const previousStep = $('loadingTxt').textContent;
  if ($('loading').hidden) {
    loadingStartedAt = Date.now();
    completedLoadingSteps = [];
  } else if (previousStep !== stepTitle) completedLoadingSteps.push(previousStep);
  $('loading').hidden = false;
  $('loadingTxt').textContent = stepTitle;
  $('loadingNote').textContent = noteMatch ? noteMatch[2].charAt(0).toUpperCase() + noteMatch[2].slice(1) : '';
  $('loadingSteps').innerHTML = completedLoadingSteps
    .map(step => `<li>${icon('check')}<span>${esc(step.replace(/…$/, ''))}</span></li>`)
    .join('');
  renderLoadingTime();
  loadingTickTimer = setInterval(renderLoadingTime, 1000);
};
/**
 * Formata segundos como `m:ss` ou `h:mm:ss`.
 * @param {number} totalSeconds Tempo em segundos.
 * @returns {string} Tempo formatado (`0:00` se não for finito).
 */
const formatTime = totalSeconds => {
  if (!isFinite(totalSeconds)) return '0:00';
  const wholeSeconds = Math.floor(totalSeconds);
  const hours = (wholeSeconds / 3600) | 0,
    minutes = ((wholeSeconds % 3600) / 60) | 0,
    seconds = wholeSeconds % 60;
  return (hours ? hours + ':' + String(minutes).padStart(2, '0') : minutes) + ':' + String(seconds).padStart(2, '0');
};
/**
 * Formata a hora como `HH:MM` (pt-BR).
 * @param {Date} date Data.
 * @returns {string} Hora formatada.
 */
const formatHourMinute = date => date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
/**
 * Gera até duas iniciais de um nome, já escapadas para HTML.
 * @param {string} name Nome.
 * @returns {string} Iniciais em maiúsculas, ou `•` se não houver.
 */
const initials = name =>
  esc(
    String(name)
      .replace(/[^\p{L}\p{N} ]/gu, '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word[0])
      .join('')
      .toUpperCase() || '•',
  );
/**
 * Decodifica Base64 em UTF-8.
 * @param {string} base64Text Texto em Base64.
 * @returns {string} Texto decodificado, ou o original se falhar.
 */
const decodeBase64 = base64Text => {
  try {
    return decodeURIComponent(escape(atob(base64Text)));
  } catch {
    return base64Text || '';
  }
};
/** @type {Record<Secao, string>} Nome exibido de cada seção. */
const SECTION_NAMES = { live: 'TV ao vivo', vod: 'Filmes', series: 'Séries' };
/** @type {RegExp} Reconhece nomes de categorias de conteúdo adulto. */
const ADULT_PATTERN = /adult|xxx|18\s*\+|\+\s*18|adulto|porn|erotic/i;
