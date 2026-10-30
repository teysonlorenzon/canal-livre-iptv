document.body.insertAdjacentHTML(
  'beforeend',
  `
<div id="app">
  <div id="home" class="gut"></div>
  <div id="section" hidden>
    <ul id="cats"></ul>
    ${scrollArrowsHtml('cats-arrows', 'catsArrows')}
    <div class="main">
      <div class="toolbar gut">
        <h2 id="secTitle"></h2>
        <input id="q" type="search" placeholder="Buscar…" autocomplete="off">
        <select id="sort" title="Ordenar">
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
</div>
`,
);
