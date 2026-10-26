/**
 * Processo principal do Electron: abre a janela do Zapp IPTV.
 */
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('node:path');

/**
 * Cria a janela principal. `webSecurity: false` desliga o bloqueio de CORS do navegador,
 * que impede várias listas IPTV e APIs Xtream de carregarem (o app não executa código
 * remoto nem tem acesso ao Node; só busca listas e vídeos). Links "abrir em nova aba" vão
 * para o navegador do sistema.
 * @returns {void}
 */
function createWindow(){
  const mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 800, minHeight: 500,
    backgroundColor: '#0c0f11', title: 'Zapp IPTV',
    icon: path.join(__dirname, 'app', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { webSecurity: false, contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));
}

Menu.setApplicationMenu(null);
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
