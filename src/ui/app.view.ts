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
        <select id="sort" title="Ordenar" aria-label="Ordenar">
          <option value="">Ordem da lista</option>
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
          <option value="new">Mais recentes</option>
          <option value="rate">Melhor avaliados</option>
        </select>
      </div>
      <div id="items" class="gut"></div>
    </div>
  </div>
</main>
`,
  );
}
