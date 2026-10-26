'use strict';
/** @type {string|null} Id da lista que estava ativa na última sessão. */
const savedActivePlaylistId = store.get('active', null);
renderPlaylistSelect();
renderHome();
introDone.then(() => { if (savedActivePlaylistId && playlists.some(playlist => playlist.id === savedActivePlaylistId)) openPlaylist(savedActivePlaylistId); });
