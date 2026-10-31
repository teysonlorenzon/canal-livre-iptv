/**
 * Elementos da interface com id fixo e o tipo de cada um. `$()` só aceita estes ids, e um id
 * novo precisa entrar aqui. Os ids vêm das telas (`*.view.ts`) e do HTML gerado pelas funcionalidades.
 */
const ELEMENT_TYPES = {
  addBtn: HTMLButtonElement,
  addForm: HTMLFormElement,
  addSeg: HTMLElement,
  aEpg: HTMLInputElement,
  aFile: HTMLInputElement,
  aName: HTMLInputElement,
  aPass: HTMLInputElement,
  aRaw: HTMLTextAreaElement,
  aServer: HTMLInputElement,
  aUrl: HTMLInputElement,
  aUser: HTMLInputElement,
  autoAdult: HTMLButtonElement,
  catRows: HTMLElement,
  cats: HTMLElement,
  catsArrows: HTMLElement,
  catSec: HTMLSelectElement,
  cAudio: HTMLSelectElement,
  cBack10: HTMLButtonElement,
  cEpg: HTMLButtonElement,
  cFav: HTMLButtonElement,
  cFs: HTMLButtonElement,
  cFwd10: HTMLButtonElement,
  clearHist: HTMLButtonElement,
  cList: HTMLButtonElement,
  clock: HTMLElement,
  closeSettings: HTMLButtonElement,
  cMute: HTMLButtonElement,
  cNext: HTMLButtonElement,
  cPip: HTMLButtonElement,
  cPlay: HTMLButtonElement,
  cPrev: HTMLButtonElement,
  cQual: HTMLSelectElement,
  cRatio: HTMLSelectElement,
  cSub: HTMLSelectElement,
  dDetail: HTMLDialogElement,
  detailBody: HTMLElement,
  dPin: HTMLDialogElement,
  dProfileEdit: HTMLDialogElement,
  dProfiles: HTMLDialogElement,
  dSettings: HTMLDialogElement,
  epgLeft: HTMLElement,
  epgN: HTMLElement,
  epgNow: HTMLElement,
  epgP: HTMLElement,
  epgT: HTMLElement,
  epgTime: HTMLElement,
  fCopy: HTMLButtonElement,
  fLighter: HTMLButtonElement,
  fRetry: HTMLButtonElement,
  fWhy: HTMLElement,
  goHome: HTMLButtonElement,
  home: HTMLElement,
  inBurst: HTMLElement,
  intro: HTMLElement,
  items: HTMLElement,
  loadCancel: HTMLButtonElement,
  loading: HTMLElement,
  loadingHint: HTMLElement,
  loadingNote: HTMLElement,
  loadingSec: HTMLElement,
  loadingSteps: HTMLElement,
  loadingTxt: HTMLElement,
  mClose: HTMLButtonElement,
  mFav: HTMLButtonElement,
  moreBtn: HTMLButtonElement,
  mPlay: HTMLButtonElement,
  mResume: HTMLButtonElement,
  numpad: HTMLElement,
  openSettings: HTMLButtonElement,
  optAuto: HTMLSelectElement,
  optFmt: HTMLSelectElement,
  osdLogo: HTMLElement,
  osdName: HTMLElement,
  parentalTitle: HTMLElement,
  pinCancel: HTMLButtonElement,
  pinError: HTMLElement,
  pinForm: HTMLFormElement,
  pinHint: HTMLElement,
  pinIn: HTMLInputElement,
  pinNew: HTMLInputElement,
  pinOk: HTMLButtonElement,
  pinOld: HTMLInputElement,
  pinSave: HTMLButtonElement,
  pinTitle: HTMLElement,
  player: HTMLElement,
  plBack: HTMLButtonElement,
  plClock: HTMLElement,
  plDd: HTMLElement,
  plList: HTMLElement,
  plMenu: HTMLElement,
  plMsg: HTMLElement,
  plSel: HTMLButtonElement,
  plSelTxt: HTMLElement,
  plTitle: HTMLElement,
  profileAdd: HTMLButtonElement,
  profileBtn: HTMLButtonElement,
  profileCards: HTMLElement,
  profileColors: HTMLElement,
  profileEditCancel: HTMLButtonElement,
  profileEditForm: HTMLFormElement,
  profileEditName: HTMLInputElement,
  profileEditPreview: HTMLElement,
  profileEditSave: HTMLButtonElement,
  profileEditTitle: HTMLElement,
  profileIcons: HTMLElement,
  profileList: HTMLElement,
  profilesClose: HTMLButtonElement,
  profilesManage: HTMLButtonElement,
  q: HTMLInputElement,
  sClose: HTMLButtonElement,
  section: HTMLElement,
  secTitle: HTMLElement,
  seek: HTMLInputElement,
  seekRow: HTMLElement,
  sFav: HTMLButtonElement,
  side: HTMLElement,
  sideClose: HTMLButtonElement,
  sideList: HTMLElement,
  sideTitle: HTMLElement,
  sort: HTMLSelectElement,
  sResume: HTMLButtonElement,
  tCur: HTMLElement,
  tDur: HTMLElement,
  themeBtn: HTMLButtonElement,
  toast: HTMLElement,
  v: HTMLVideoElement,
  wAdd: HTMLButtonElement,
  wRetry: HTMLButtonElement,
};

/** Mapa de id para o tipo do elemento. */
type ElementTypes = { [Id in keyof typeof ELEMENT_TYPES]: InstanceType<(typeof ELEMENT_TYPES)[Id]> };

/** Id de um elemento da interface. */
export type ElementId = keyof ElementTypes;

/** Classe de um elemento do DOM. */
type ElementClass<ElementType extends Element> = abstract new () => ElementType;

/**
 * Indica se o elemento encontrado é do tipo esperado para o id.
 * @param element Elemento encontrado.
 * @param id Id procurado.
 * @returns `true` se o elemento existe e tem o tipo certo.
 */
const isElementOf = <Id extends ElementId>(element: Element | null, id: Id): element is ElementTypes[Id] =>
  element instanceof ELEMENT_TYPES[id];

/**
 * Procura um elemento que pode não estar na tela (ex.: botão que só aparece em alguns casos).
 * @param id Id do elemento.
 * @returns O elemento, ou `null` se não existir.
 */
export function $optional<Id extends ElementId>(id: Id): ElementTypes[Id] | null {
  const element = document.getElementById(id);
  return isElementOf(element, id) ? element : null;
}

/**
 * Atalho para `document.getElementById`, para elementos que sempre existem.
 * @param id Id do elemento.
 * @returns O elemento, já com o tipo certo.
 * @throws Se o elemento não existir.
 */
export function $<Id extends ElementId>(id: Id): ElementTypes[Id] {
  const element = $optional(id);
  if (!element) throw new Error('Elemento não encontrado: #' + id);
  return element;
}

/**
 * Primeiro elemento que atende ao seletor.
 * @param root Onde procurar.
 * @param selector Seletor CSS.
 * @param type Tipo do elemento (padrão: `HTMLElement`).
 * @returns O elemento, ou `null` se não existir ou for de outro tipo.
 */
export function query(root: ParentNode, selector: string): HTMLElement | null;
export function query<ElementType extends Element>(root: ParentNode, selector: string, type: ElementClass<ElementType>): ElementType | null;
export function query(root: ParentNode, selector: string, type: ElementClass<Element> = HTMLElement): Element | null {
  const element = root.querySelector(selector);
  return element instanceof type ? element : null;
}

/**
 * Elementos que atendem ao seletor.
 * @param root Onde procurar.
 * @param selector Seletor CSS.
 * @param type Tipo dos elementos (padrão: `HTMLElement`).
 * @returns Elementos encontrados.
 */
export function queryAll(root: ParentNode, selector: string): HTMLElement[];
export function queryAll<ElementType extends Element>(root: ParentNode, selector: string, type: ElementClass<ElementType>): ElementType[];
export function queryAll(root: ParentNode, selector: string, type: ElementClass<Element> = HTMLElement): Element[] {
  return [...root.querySelectorAll(selector)].filter(element => element instanceof type);
}

/**
 * Elemento mais próximo que atende ao seletor, a partir do alvo de um evento.
 * @param target Alvo do evento.
 * @param selector Seletor CSS.
 * @returns O elemento, ou `null` se não houver.
 */
export function closest(target: EventTarget | null, selector: string): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest(selector);
  return element instanceof HTMLElement ? element : null;
}

/**
 * Diálogo aberto mais recente.
 * @returns O diálogo, ou `null` se nenhum estiver aberto.
 */
export function topOpenDialog(): HTMLDialogElement | null {
  const openDialogs = queryAll(document, 'dialog[open]', HTMLDialogElement);
  return openDialogs[openDialogs.length - 1] ?? null;
}

/**
 * Tira o foco do elemento focado.
 */
export function blurActiveElement(): void {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}
