import { $, $optional, blurActiveElement, closest, query, queryAll, topOpenDialog } from '../../../src/core/dom';
import { preparePage } from '../support/boot';

describe('acesso ao DOM', () => {
  beforeEach(() => {
    preparePage();
    document.body.innerHTML = `
      <button id="addBtn"><i id="inner"></i></button>
      <div id="toast"><span class="item">a</span><span class="item">b</span></div>
      <svg class="icon" id="catsArrows"><path></path></svg>
      <dialog id="dPin"></dialog>
      <dialog id="dDetail"></dialog>`;
  });

  it('$ devolve o elemento com o tipo certo', () => {
    expect($('addBtn').disabled).toBe(false);
  });

  it('$ falha se o elemento não existir ou tiver outro tipo', () => {
    expect(() => $('moreBtn')).toThrow('Elemento não encontrado: #moreBtn');
    expect(() => $('catsArrows')).toThrow('Elemento não encontrado: #catsArrows');
  });

  it('$optional devolve null se não existir', () => {
    expect($optional('moreBtn')).toBeNull();
    expect($optional('addBtn')).not.toBeNull();
  });

  it('query filtra pelo tipo', () => {
    expect(query(document, '#addBtn')).not.toBeNull();
    expect(query(document, '#addBtn', HTMLButtonElement)).not.toBeNull();
    expect(query(document, '#addBtn', HTMLInputElement)).toBeNull();
    expect(query(document, '.nada')).toBeNull();
  });

  it('queryAll filtra pelo tipo', () => {
    expect(queryAll(document, '.item')).toHaveLength(2);
    expect(queryAll(document, '.item', HTMLButtonElement)).toHaveLength(0);
  });

  it('closest sobe a partir do alvo de um evento', () => {
    expect(closest(document.getElementById('inner'), 'button')?.id).toBe('addBtn');
    expect(closest(document, 'button')).toBeNull();
    expect(closest(null, 'button')).toBeNull();
    expect(closest(document.querySelector('path'), 'svg')).toBeNull();
  });

  it('topOpenDialog devolve o último diálogo aberto', () => {
    expect(topOpenDialog()).toBeNull();
    $('dPin').showModal();
    $('dDetail').showModal();
    expect(topOpenDialog()?.id).toBe('dDetail');
  });

  it('blurActiveElement tira o foco', () => {
    const button = $('addBtn');
    button.focus();
    expect(document.activeElement).toBe(button);
    blurActiveElement();
    expect(document.activeElement).toBe(document.body);
    blurActiveElement();
  });
});
