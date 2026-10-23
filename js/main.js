'use strict';
const act = store.get('active', null);
renderPlSel();
if (act && pls.some(p => p.id === act)) openPlaylist(act); else renderHome();
