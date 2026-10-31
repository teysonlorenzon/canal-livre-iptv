/**
 * Processo principal do Electron: abre a janela do Zapp IPTV.
 */
import path from 'node:path';

import { app, BrowserWindow, Menu, shell } from 'electron';

/**
 * Cria a janela principal. `webSecurity: false` desliga o bloqueio de CORS do navegador,
 * que impede várias listas IPTV e APIs Xtream de carregarem (o app não executa código
 * remoto nem tem acesso ao Node; só busca listas e vídeos). Links "abrir em nova aba" vão
 * para o navegador do sistema.
 */
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#0c0f11',
    title: 'Zapp IPTV',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { webSecurity: false, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  void mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

Menu.setApplicationMenu(null);
void app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
