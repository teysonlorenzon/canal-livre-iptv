'use strict';
let addType = 'xtream';
/**
 * Abre o diálogo de configurações com os valores atuais.
 * @returns {void}
 */
function openSettings(){ renderPlSel(); renderCatRows(); $('optFmt').value = opts.fmt; $('optAuto').value = opts.auto; $('dSettings').showModal(); }
$('openSettings').onclick = openSettings;
/**
 * Fecha as configurações.
 */
$('closeSettings').onclick = () => $('dSettings').close();
/**
 * Troca o tipo de lista a adicionar e mostra os campos correspondentes.
 * @param {MouseEvent} e Evento de clique.
 */
$('addSeg').onclick = e => {
  const b = e.target.closest('button'); if (!b) return; addType = b.dataset.t;
  $('addSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  $('addForm').querySelectorAll('[data-for]').forEach(el => el.hidden = !el.dataset.for.split(' ').includes(addType));
};
/**
 * Impede o envio do formulário de adicionar lista (que recarregaria a página).
 * @param {SubmitEvent} e Evento de envio.
 */
$('addForm').addEventListener('submit', e => e.preventDefault());
/**
 * Valida o formulário, cadastra a nova lista e a abre.
 * URLs `get.php` com usuário e senha viram Xtream automaticamente.
 * @returns {Promise<void>}
 */
$('addBtn').onclick = async () => {
  const id = Date.now().toString(36), name = $('aName').value.trim() || 'Minha lista';
  let p;
  if (addType === 'xtream') {
    let server = $('aServer').value.trim(); const user = $('aUser').value.trim(), pass = $('aPass').value;
    if (!server || !user) return toast('Preencha servidor, usuário e senha.');
    if (!/^https?:\/\//i.test(server)) server = 'http://' + server;
    p = { id, name, type:'xtream', server, user, pass };
  } else if (addType === 'm3u') {
    const url = $('aUrl').value.trim(); if (!url) return toast('Informe a URL da lista.');
    try { const u = new URL(url); const us = u.searchParams.get('username'), pw = u.searchParams.get('password');
      if (/get\.php$/i.test(u.pathname) && us && pw) p = { id, name, type:'xtream', server:u.origin, user:us, pass:pw };
    } catch {}
    if (!p) p = { id, name, type:'m3u', url, epg:$('aEpg').value.trim() };
  } else {
    const f = $('aFile').files[0], raw = $('aRaw').value.trim();
    const text = f ? await f.text() : raw;
    if (!text) return toast('Escolha um arquivo ou cole o conteúdo.');
    try { buildFromM3U(text); } catch (err) { return toast(err.message); }
    p = { id, name, type:'m3u', epg:$('aEpg').value.trim() };
    if (!store.set('m3u_' + id, text)) return toast('A lista é grande demais para salvar neste navegador. Use a URL.');
  }
  pls.push(p); store.set('pls', pls);
  $('addForm').reset(); $('dSettings').close();
  openPlaylist(id);
};
/**
 * Altera o PIN do controle parental.
 */
$('pinSave').onclick = () => {
  if ($('pinOld').value !== (opts.pin || '0000')) return toast('PIN atual incorreto.');
  if (!/^\d{4,8}$/.test($('pinNew').value)) return toast('O novo PIN precisa ter de 4 a 8 números.');
  opts.pin = $('pinNew').value; store.set('opts', opts); $('pinOld').value = $('pinNew').value = ''; toast('PIN alterado.');
};
/**
 * Salva o formato da TV ao vivo.
 * @param {Event} e Evento de mudança.
 */
$('optFmt').onchange = e => { opts.fmt = e.target.value; store.set('opts', opts); };
/**
 * Salva a opção de próximo episódio automático.
 * @param {Event} e Evento de mudança.
 */
$('optAuto').onchange = e => { opts.auto = e.target.value; store.set('opts', opts); };
/**
 * Limpa o histórico e os canais recentes da lista ativa.
 */
$('clearHist').onclick = () => { if (!ux) return; ux.hist = []; ux.recentLive = []; saveUx(); toast('Histórico limpo.'); renderHome(); };

/**
 * Desenha a tabela de bloqueio/ocultação de categorias da seção escolhida.
 * @returns {void}
 */
function renderCatRows(){
  const box = $('catRows');
  if (!D) { box.innerHTML = '<p class="hint" style="padding:10px">Abra uma lista para configurar as categorias.</p>'; return; }
  const s = $('catSec').value;
  if (!D[s]) { box.innerHTML = `<p class="hint" style="padding:10px">Abra a seção ${SEC[s]} uma vez para carregar as categorias.</p>`; return; }
  box.innerHTML = `<label class="hd"><span>Categoria</span><span>Bloquear</span><span>Ocultar</span></label>` + D[s].cats.map(c => {
    const k = s+':'+c.id;
    return `<label><span>${esc(c.name)}</span><input type="checkbox" data-k="${esc(k)}" data-t="locked" ${ux.locked.includes(k) ? 'checked' : ''}><input type="checkbox" data-k="${esc(k)}" data-t="hidden" ${ux.hidden.includes(k) ? 'checked' : ''}></label>`;
  }).join('');
}
$('catSec').onchange = renderCatRows;
/**
 * Aplica bloqueio ou ocultação de categoria; remover bloqueio exige o PIN.
 * @param {Event} e Evento de mudança.
 */
$('catRows').onchange = e => {
  const cb = e.target; if (!cb.dataset.k) return;
  /**
   * Grava a alteração da caixa marcada e atualiza a seção aberta.
   * @returns {void}
   */
  const apply = () => { const a = ux[cb.dataset.t], k = cb.dataset.k; cb.checked ? (a.includes(k) || a.push(k)) : a.splice(a.indexOf(k), 1); saveUx(); if (!$('section').hidden) { renderCats(); renderItems(); } };
  if (!cb.checked && cb.dataset.t === 'locked') { cb.checked = true; $('dSettings').close(); withPin('__settings', () => { cb.checked = false; apply(); $('dSettings').showModal(); }, true); return; }
  apply();
};
/**
 * Bloqueia automaticamente as categorias com nome adulto.
 */
$('autoAdult').onclick = () => {
  if (!D) return;
  let n = 0;
  for (const s of ['live','vod','series']) for (const c of (D[s] ? D[s].cats : [])) if (ADULT.test(c.name)) { const k = s+':'+c.id; if (!ux.locked.includes(k)) { ux.locked.push(k); n++; } }
  saveUx(); renderCatRows(); toast(n ? `${n} categorias bloqueadas.` : 'Nenhuma categoria adulta encontrada.');
};

/**
 * Cancela o carregamento em andamento.
 */
$('loadCancel').onclick = () => { cancelled = true; if (abortCtl) abortCtl.abort(); loading(null); };
