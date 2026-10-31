/**
 * Prepara o jsdom com o que ele não implementa e guarda o que o app registra em `window` e
 * `document`, para cada teste começar numa página limpa.
 */

/** Evento registrado pelo app, para ser removido ao reiniciar a página. */
interface TrackedListener {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: AddEventListenerOptions | boolean;
}

const trackedListeners: TrackedListener[] = [];
const trackedObservers: MutationObserver[] = [];
const nativeAddEventListener = EventTarget.prototype.addEventListener;
const nativeWindowAddEventListener = window.addEventListener;
const NativeMutationObserver = MutationObserver;

EventTarget.prototype.addEventListener = function addTrackedListener(
  this: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject | null,
  options?: AddEventListenerOptions | boolean,
): void {
  if (listener) trackedListeners.push({ target: this, type, listener, options });
  nativeAddEventListener.call(this, type, listener, options);
};

window.addEventListener = function addTrackedWindowListener(
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: AddEventListenerOptions | boolean,
): void {
  trackedListeners.push({ target: window, type, listener, options });
  nativeWindowAddEventListener.call(window, type, listener, options);
};

globalThis.MutationObserver = class TrackedMutationObserver extends NativeMutationObserver {
  constructor(callback: MutationCallback) {
    super(callback);
    trackedObservers.push(this);
  }
};

/** `close()` do `<dialog>`, que o jsdom não implementa. */
function closeDialog(this: HTMLDialogElement, returnValue?: string): void {
  if (returnValue !== undefined) this.returnValue = returnValue;
  this.removeAttribute('open');
}

/** Métodos do navegador que o jsdom não implementa. */
function installBrowserStubs(): void {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement): void {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = closeDialog;
  HTMLMediaElement.prototype.load = jest.fn();
  HTMLMediaElement.prototype.pause = jest.fn();
  HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve());
  Element.prototype.scrollIntoView = jest.fn();
  Element.prototype.scrollBy = jest.fn();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: jest.fn((media: string) => ({ matches: false, media })),
  });
  Object.defineProperty(window, 'SVGPathElement', { configurable: true, writable: true, value: SVGElement });
  Object.defineProperty(SVGElement.prototype, 'getTotalLength', { configurable: true, value: () => 100 });
  Object.defineProperty(window, 'CSS', { configurable: true, writable: true, value: { escape: (text: string) => text } });
}

/**
 * Volta a página ao estado inicial: sem elementos, eventos, observadores nem dados salvos.
 */
export function resetBrowser(): void {
  for (const { target, type, listener, options } of trackedListeners.splice(0)) target.removeEventListener(type, listener, options);
  for (const observer of trackedObservers.splice(0)) observer.disconnect();
  document.documentElement.removeAttribute('class');
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = '';
  localStorage.clear();
  installBrowserStubs();
}

installBrowserStubs();
