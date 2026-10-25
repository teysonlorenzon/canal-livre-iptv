'use strict';
/**
 * Atalho para `document.getElementById`.
 * @param {string} id Id do elemento.
 * @returns {HTMLElement|null} O elemento encontrado.
 */
const $ = id => document.getElementById(id);
/**
 * Escapa caracteres especiais de HTML.
 * @param {*} s Valor a escapar (null/undefined viram string vazia).
 * @returns {string} Texto seguro para inserir em HTML.
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/**
 * Acesso ao `localStorage` com prefixo `cl_` e serialização JSON.
 * Todas as operações ignoram erros de armazenamento.
 */
const store = {
  /**
   * Lê um valor salvo.
   * @param {string} k Chave (sem prefixo).
   * @param {*} d Valor padrão caso não exista ou seja inválido.
   * @returns {*} Valor salvo ou o padrão.
   */
  get(k, d){ try{ const x = localStorage.getItem('cl_'+k); return x == null ? d : JSON.parse(x); }catch{ return d; } },
  /**
   * Salva um valor.
   * @param {string} k Chave (sem prefixo).
   * @param {*} v Valor serializável em JSON.
   * @returns {boolean} `true` se salvou, `false` se falhou (ex.: cota cheia).
   */
  set(k, v){ try{ localStorage.setItem('cl_'+k, JSON.stringify(v)); return true; }catch{ return false; } },
  /**
   * Remove um valor salvo.
   * @param {string} k Chave (sem prefixo).
   * @returns {void}
   */
  del(k){ try{ localStorage.removeItem('cl_'+k); }catch{} }
};
/**
 * Mostra uma mensagem temporária (3,2 s) no rodapé da tela.
 * @param {string} m Mensagem.
 * @returns {void}
 */
const toast = m => { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3200); };
let loadT0 = 0, loadTick;
/**
 * Mostra ou esconde a tela de carregamento, com contador de segundos.
 * @param {string|null} txt Texto a exibir; valor falso esconde a tela.
 * @returns {void}
 */
const loading = txt => {
  $('loading').hidden = !txt;
  clearInterval(loadTick);
  if (!txt) return;
  $('loadingTxt').textContent = txt;
  loadT0 = Date.now(); $('loadingSec').textContent = '';
  loadTick = setInterval(() => { $('loadingSec').textContent = Math.round((Date.now() - loadT0) / 1000) + ' s'; }, 1000);
};
/**
 * Formata segundos como `m:ss` ou `h:mm:ss`.
 * @param {number} s Tempo em segundos.
 * @returns {string} Tempo formatado (`0:00` se não for finito).
 */
const fmtT = s => { if (!isFinite(s)) return '0:00'; s = Math.floor(s); const h = s/3600|0, m = (s%3600)/60|0, x = s%60; return (h ? h+':'+String(m).padStart(2,'0') : m) + ':' + String(x).padStart(2,'0'); };
/**
 * Formata a hora como `HH:MM` (pt-BR).
 * @param {Date} d Data.
 * @returns {string} Hora formatada.
 */
const hm = d => d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
/**
 * Gera até duas iniciais de um nome, já escapadas para HTML.
 * @param {string} n Nome.
 * @returns {string} Iniciais em maiúsculas, ou `•` se não houver.
 */
const initials = n => esc(String(n).replace(/[^\p{L}\p{N} ]/gu,'').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase() || '•');
/**
 * Decodifica Base64 em UTF-8.
 * @param {string} s Texto em Base64.
 * @returns {string} Texto decodificado, ou o original se falhar.
 */
const b64 = s => { try { return decodeURIComponent(escape(atob(s))); } catch { return s || ''; } };
const SEC = { live:'TV ao vivo', vod:'Filmes', series:'Séries' };
const ADULT = /adult|xxx|18\s*\+|\+\s*18|adulto|porn|erotic/i;
