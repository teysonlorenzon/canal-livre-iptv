import { dropdownHtml } from './dropdown';
import { scrollArrowsHtml } from './scroll-arrows';

/**
 * Liga os eventos desta parte do app. Chamada uma vez, na ordem de `main.ts`.
 */
export function renderAppView(): void {
  document.body.insertAdjacentHTML(
    'beforeend',
    `
<main id="app" tabindex="-1">
  <h1 class="visually-hidden" id="appTitle" tabindex="-1">Zapp IPTV</h1>
  <p class="visually-hidden" id="srStatus" role="status" aria-live="polite"></p>
  <div id="home" class="gut"></div>
  <div id="section" hidden>
    <nav class="cats-nav" aria-label="Categorias">
      <ul id="cats"></ul>
      ${scrollArrowsHtml('cats-arrows', 'catsArrows')}
    </nav>
    <div class="main">
      <div class="toolbar gut">
        <h2 id="secTitle" tabindex="-1"></h2>
        <input id="q" type="search" placeholder="Buscar…" aria-label="Buscar nesta seção" autocomplete="off">
        ${dropdownHtml('sortDd', 'Ordenar', [
          { value: '', label: 'Ordem da lista' },
          { value: 'az', label: 'A → Z' },
          { value: 'za', label: 'Z → A' },
          { value: 'new', label: 'Mais recentes' },
          { value: 'rate', label: 'Melhor avaliados' },
        ])}
      </div>
      <div id="items" class="gut"></div>
    </div>
  </div>
</main>
`,
  );
}
