'use strict';
/** @type {string|null} Id da lista que estava ativa na última sessão (sem ela, abre a padrão). */
const savedActivePlaylistId = store.get('active', null);
renderPlaylistSelect();
renderHome();
introDone.then(() => {
  if (profiles.length > 1) openProfilePicker(!!activeProfile().askPin);
  const playlistIdToOpen = playlists.some(playlist => playlist.id === savedActivePlaylistId) ? savedActivePlaylistId : fallbackPlaylistId();
  if (playlistIdToOpen) openPlaylist(playlistIdToOpen);
});
