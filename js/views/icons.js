'use strict';
/**
 * Ícones de traço usados no app (player e prateleiras da tela inicial), todos no mesmo
 * estilo: grade 24×24, traço de 1,8 com pontas arredondadas, na cor do texto.
 * @type {Record<string, string>} Conteúdo SVG de cada ícone.
 */
const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  prev: '<path d="M6 5v14"/><path d="M18 6.5v11L10 12z"/>',
  next: '<path d="M18 5v14"/><path d="M6 6.5v11L14 12z"/>',
  play: '<path d="M8 5.5v13L19 12z"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  rew10: '<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v4h4"/><text x="12.3" y="15.2" text-anchor="middle">10</text>',
  fwd10: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4h-4"/><text x="11.7" y="15.2" text-anchor="middle">10</text>',
  vol: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17.5" r="1"/>',
  guide: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M7 13.5h4M7 17h7"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  pip: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><rect x="12" y="11.5" width="7" height="5" rx="1"/>',
  fs: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
  cont: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5z" class="ico-fill"/>',
  recent: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'
};

/**
 * HTML de um ícone.
 * @param {string} name Nome em `ICONS`.
 * @param {string} [cls] Classe extra (ex.: `on` para preencher a estrela).
 * @returns {string} SVG.
 */
const icon = (name, cls) => `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
