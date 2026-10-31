import './styles/style.css';

import { activeProfile, state } from './core/state';
import { initToast, store } from './core/utils';
import { initHome, renderHome } from './features/home/home';
import { initLiveGuard } from './features/player/live-guard';
import { initPlayer } from './features/player/player';
import { renderPlayerView } from './features/player/player.view';
import { fallbackPlaylistId, initPlaylists, openPlaylist, renderPlaylistSelect } from './features/playlists/playlists';
import { initProfiles, openProfilePicker } from './features/profiles/profiles';
import { renderProfilesView } from './features/profiles/profiles.view';
import { initSection } from './features/section/section';
import { initSettings } from './features/settings/settings';
import { renderSettingsView } from './features/settings/settings.view';
import { renderAppView } from './ui/app.view';
import { installDialogFade } from './ui/dialog-motion';
import { renderDialogsView } from './ui/dialogs.view';
import { renderHeaderView } from './ui/header.view';
import { playIntro } from './ui/intro';
import { renderOverlaysView } from './ui/overlays.view';
import { initScrollArrows } from './ui/scroll-arrows';

/**
 * Inicia o app. A abertura vem primeiro; depois as telas entram na página e cada
 * funcionalidade liga seus eventos, nesta ordem.
 */
function startApp(): void {
  const introDone = playIntro();
  renderHeaderView();
  renderAppView();
  renderPlayerView();
  renderSettingsView();
  renderDialogsView();
  renderProfilesView();
  renderOverlaysView();
  installDialogFade();
  initToast();
  initScrollArrows();
  initPlaylists();
  initHome();
  initSection();
  initPlayer();
  initLiveGuard();
  initSettings();
  initProfiles();

  const savedActivePlaylistId = store.getText('active');
  renderPlaylistSelect();
  renderHome();
  void introDone.then(() => {
    if (state.profiles.length > 1) openProfilePicker(!!activeProfile().askPin);
    const playlistIdToOpen = state.playlists.some(playlist => playlist.id === savedActivePlaylistId)
      ? savedActivePlaylistId
      : fallbackPlaylistId();
    if (playlistIdToOpen) void openPlaylist(playlistIdToOpen);
  });
}

startApp();
