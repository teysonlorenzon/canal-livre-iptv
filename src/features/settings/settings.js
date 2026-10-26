'use strict';
let addType = 'xtream';
/**
 * Abre o diálogo de configurações com os valores atuais.
 * @returns {void}
 */
function openSettings(){ renderPlaylistSelect(); renderCatRows(); $('optFmt').value = options.fmt; $('optAuto').value = options.auto; $('optIntroAudio').value = options.introAudio === '0' ? '0' : '1'; $('introAudioField').hidden = !isIntroAudioDetectionSupported(); $('dSettings').showModal(); }
$('openSettings').onclick = openSettings;
/**
 * Fecha as configurações.
 */
$('closeSettings').onclick = () => $('dSettings').close();
/**
 * Troca o tipo de lista a adicionar e mostra os campos correspondentes.
 * @param {MouseEvent} clickEvent Evento de clique.
 */
$('addSeg').onclick = clickEvent => {
  const typeButton = clickEvent.target.closest('button'); if (!typeButton) return; addType = typeButton.dataset.t;
  $('addSeg').querySelectorAll('button').forEach(segmentButton => segmentButton.classList.toggle('on', segmentButton === typeButton));
  $('addForm').querySelectorAll('[data-for]').forEach(fieldElement => fieldElement.hidden = !fieldElement.dataset.for.split(' ').includes(addType));
};
/**
 * Impede o envio do formulário de adicionar lista (que recarregaria a página).
 * @param {SubmitEvent} submitEvent Evento de envio.
 */
$('addForm').addEventListener('submit', submitEvent => submitEvent.preventDefault());
/**
 * Valida o formulário, cadastra a nova lista e a abre.
 * URLs `get.php` com usuário e senha viram Xtream automaticamente.
 * @returns {Promise<void>}
 */
$('addBtn').onclick = async () => {
  const id = Date.now().toString(36), name = $('aName').value.trim() || 'Minha lista';
  let newPlaylist;
  if (addType === 'xtream') {
    let server = $('aServer').value.trim(); const user = $('aUser').value.trim(), pass = $('aPass').value;
    if (!server || !user) return toast('Preencha servidor, usuário e senha.');
    if (!/^https?:\/\//i.test(server)) server = 'http://' + server;
    newPlaylist = { id, name, type:'xtream', server, user, pass };
  } else if (addType === 'm3u') {
    const url = $('aUrl').value.trim(); if (!url) return toast('Informe a URL da lista.');
    try { const parsedUrl = new URL(url); const urlUsername = parsedUrl.searchParams.get('username'), urlPassword = parsedUrl.searchParams.get('password');
      if (/get\.php$/i.test(parsedUrl.pathname) && urlUsername && urlPassword) newPlaylist = { id, name, type:'xtream', server:parsedUrl.origin, user:urlUsername, pass:urlPassword };
    } catch {}
    if (!newPlaylist) newPlaylist = { id, name, type:'m3u', url, epg:$('aEpg').value.trim() };
  } else {
    const selectedFile = $('aFile').files[0], pastedText = $('aRaw').value.trim();
    const m3uText = selectedFile ? await selectedFile.text() : pastedText;
    if (!m3uText) return toast('Escolha um arquivo ou cole o conteúdo.');
    try { buildFromM3U(m3uText); } catch (error) { return toast(error.message); }
    newPlaylist = { id, name, type:'m3u', epg:$('aEpg').value.trim() };
    if (!store.set('m3u_' + id, m3uText)) return toast('A lista é grande demais para salvar neste navegador. Use a URL.');
  }
  playlists.push(newPlaylist); store.set('pls', playlists);
  $('addForm').reset(); $('dSettings').close();
  openPlaylist(id);
};
/**
 * Altera o PIN do controle parental.
 */
$('pinSave').onclick = () => {
  if ($('pinOld').value !== (options.pin || '0000')) return toast('PIN atual incorreto.');
  if (!/^\d{4,8}$/.test($('pinNew').value)) return toast('O novo PIN precisa ter de 4 a 8 números.');
  options.pin = $('pinNew').value; store.set('opts', options); $('pinOld').value = $('pinNew').value = ''; toast('PIN alterado.');
};
/**
 * Salva o formato da TV ao vivo.
 * @param {Event} changeEvent Evento de mudança.
 */
$('optFmt').onchange = changeEvent => { options.fmt = changeEvent.target.value; store.set('opts', options); };
/**
 * Salva a opção de próximo episódio automático.
 * @param {Event} changeEvent Evento de mudança.
 */
$('optAuto').onchange = changeEvent => { options.auto = changeEvent.target.value; store.set('opts', options); };
/**
 * Limpa o histórico e os canais recentes da lista ativa.
 */
$('clearHist').onclick = () => { if (!userData) return; userData.hist = []; userData.recentLive = []; saveUserData(); toast('Histórico limpo.'); renderHome(); };
/**
 * Liga ou desliga a detecção da abertura pelo som.
 * @param {Event} changeEvent Evento de mudança.
 */
$('optIntroAudio').onchange = changeEvent => { options.introAudio = changeEvent.target.value; store.set('opts', options); if (options.introAudio === '0') stopIntroAudioSession(false); };
/**
 * Esquece as aberturas aprendidas (por temporada e no formato antigo, por série) e as
 * impressões digitais do som da lista ativa.
 */
$('forgetIntros').onclick = () => { if (!userData) return; userData.intro = {}; saveUserData(); forgetIntroPrints(); toast('Aberturas esquecidas. O app vai aprender de novo.'); };

/**
 * Desenha a tabela de bloqueio/ocultação de categorias da seção escolhida.
 * @returns {void}
 */
function renderCatRows(){
  const rowsBox = $('catRows');
  if (!catalog) { rowsBox.innerHTML = '<p class="hint" style="padding:10px">Abra uma lista para configurar as categorias.</p>'; return; }
  const sectionName = $('catSec').value;
  if (!catalog[sectionName]) { rowsBox.innerHTML = `<p class="hint" style="padding:10px">Abra a seção ${SECTION_NAMES[sectionName]} uma vez para carregar as categorias.</p>`; return; }
  rowsBox.innerHTML = `<label class="hd"><span>Categoria</span><span>Bloquear</span><span>Ocultar</span></label>` + catalog[sectionName].cats.map(category => {
    const categoryKey = sectionName+':'+category.id;
    return `<label><span>${esc(category.name)}</span><input type="checkbox" data-k="${esc(categoryKey)}" data-t="locked" ${userData.locked.includes(categoryKey) ? 'checked' : ''}><input type="checkbox" data-k="${esc(categoryKey)}" data-t="hidden" ${userData.hidden.includes(categoryKey) ? 'checked' : ''}></label>`;
  }).join('');
}
$('catSec').onchange = renderCatRows;
/**
 * Aplica bloqueio ou ocultação de categoria; remover bloqueio exige o PIN.
 * @param {Event} changeEvent Evento de mudança.
 */
$('catRows').onchange = changeEvent => {
  const checkbox = changeEvent.target; if (!checkbox.dataset.k) return;
  /**
   * Grava a alteração da caixa marcada e atualiza a seção aberta.
   * @returns {void}
   */
  const applyChange = () => { const categoryKeys = userData[checkbox.dataset.t], categoryKey = checkbox.dataset.k; checkbox.checked ? (categoryKeys.includes(categoryKey) || categoryKeys.push(categoryKey)) : categoryKeys.splice(categoryKeys.indexOf(categoryKey), 1); saveUserData(); if (!$('section').hidden) { renderCats(); renderItems(); } };
  if (!checkbox.checked && checkbox.dataset.t === 'locked') { checkbox.checked = true; $('dSettings').close(); withPin('__settings', () => { checkbox.checked = false; applyChange(); $('dSettings').showModal(); }, true); return; }
  applyChange();
};
/**
 * Bloqueia automaticamente as categorias com nome adulto.
 */
$('autoAdult').onclick = () => {
  if (!catalog) return;
  let lockedCount = 0;
  for (const sectionName of ['live','vod','series']) for (const category of (catalog[sectionName] ? catalog[sectionName].cats : [])) if (ADULT_PATTERN.test(category.name)) { const categoryKey = sectionName+':'+category.id; if (!userData.locked.includes(categoryKey)) { userData.locked.push(categoryKey); lockedCount++; } }
  saveUserData(); renderCatRows(); toast(lockedCount ? `${lockedCount} categorias bloqueadas.` : 'Nenhuma categoria adulta encontrada.');
};

/**
 * Cancela o carregamento em andamento.
 */
$('loadCancel').onclick = () => { cancelled = true; if (abortController) abortController.abort(); loading(null); };
