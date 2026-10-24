'use strict';
const act = store.get('active', null);
renderPlSel();
renderHome();
introDone.then(() => { if (act && pls.some(p => p.id === act)) openPlaylist(act); });
