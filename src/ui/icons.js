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
  themeAuto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" class="ico-fill"/>',
  themeLight: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
  themeDark: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  playlist: '<path d="M4 6.5h13M4 12h13M4 17.5h7"/><path d="M15 14.5v6l5-3z" class="ico-fill"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  cont: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5z" class="ico-fill"/>',
  recent: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.5"/>',
  avSmile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4 4 0 0 0 7 0M9 9.5v.5M15 9.5v.5"/>',
  avCat: '<path d="M4.5 4l3.5 4h8l3.5-4v10a7.5 7 0 0 1-15 0z"/><path d="M9.5 13v.5M14.5 13v.5M11 16.5h2"/>',
  avDog: '<path d="M7 5C4 5 3 9 3.5 12L6 11M17 5c3 0 4 4 3.5 7L18 11"/><path d="M7 5h10l1 6v4a6 5 0 0 1-12 0v-4z"/><path d="M10 12v.5M14 12v.5M11 16h2"/>',
  avPaw: '<circle cx="12" cy="15.5" r="3.5"/><circle cx="6.5" cy="10" r="1.8"/><circle cx="10" cy="6.5" r="1.8"/><circle cx="14" cy="6.5" r="1.8"/><circle cx="17.5" cy="10" r="1.8"/>',
  avHeart: '<path d="M12 20s-7.5-4.5-7.5-10A4.2 4.2 0 0 1 12 7.5 4.2 4.2 0 0 1 19.5 10C19.5 15.5 12 20 12 20z"/>',
  avBolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  avRocket: '<path d="M12 3c3.5 2.5 5 6 4.5 11h-9C7 9 8.5 5.5 12 3z"/><path d="M7.5 14L5 18h4M16.5 14l2.5 4h-4M10.5 18.5l1.5 2.5 1.5-2.5"/><circle cx="12" cy="9.5" r="1.5"/>',
  avMusic: '<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  avBall: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5l4 3-1.5 4.5h-5L8 10.5z"/><path d="M12 3v4.5M16 10.5l4.5-1.5M14.5 15l2.5 4M9.5 15L7 19M8 10.5L3.5 9"/>',
  avCrown: '<path d="M4 18h16M4.5 15.5L3.5 7l5 4L12 5l3.5 6 5-4-1 8.5z"/>',
  avGame: '<path d="M7 8h10a4 4 0 0 1 4 4.5l-.5 3a2.5 2.5 0 0 1-4.3 1.3L14.5 15h-5l-1.7 1.8a2.5 2.5 0 0 1-4.3-1.3l-.5-3A4 4 0 0 1 7 8z"/><path d="M8 10.5v3M6.5 12h3M15.5 11.5v.5M17.5 13v.5"/>',
  avFilm: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M7.5 5v14M16.5 5v14M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4"/>',
  avPlus: '<path d="M12 5v14M5 12h14"/>'
};
/** @type {string[]} Ícones disponíveis como foto de perfil (vazio = inicial do nome). */
const PROFILE_ICONS = ['', 'avSmile', 'avCat', 'avDog', 'avPaw', 'star', 'avHeart', 'avBolt', 'avRocket', 'avMusic', 'avBall', 'avCrown', 'avGame', 'avFilm', 'themeDark', 'themeLight'];

/**
 * HTML de um ícone.
 * @param {string} name Nome em `ICONS`.
 * @param {string} [cls] Classe extra (ex.: `on` para preencher a estrela).
 * @returns {string} SVG.
 */
const icon = (name, cls) => `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
