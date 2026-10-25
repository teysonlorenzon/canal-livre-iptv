# Zapp IPTV: desktop e celular

Os apps usam o mesmo player web da raiz (`iptv-player.html`). `tools/bundle.mjs` junta os
scripts, copia hls.js/mpegts.js para dentro do app e acrescenta os ajustes de cada plataforma.

Instale as dependências uma vez, na raiz do repositório:

```bash
npm install
```

## Desktop (Windows e Linux): `apps/desktop`

Electron. A janela desliga o bloqueio de CORS do navegador, então listas e APIs Xtream que
não carregam no navegador funcionam aqui.

| Comando | O que faz |
|---|---|
| `npm start -w apps/desktop` | Abre o app para testar |
| `npm run dist:linux -w apps/desktop` | Gera `out/Zapp IPTV-<versão>.AppImage` e `out/zapp-iptv-desktop_<versão>_amd64.deb` |
| `npm run dist:win -w apps/desktop` | Gera o instalador `.exe` e um `.zip` portátil (o `.exe` precisa do Wine no Linux; sem Wine, use `npx electron-builder --win zip` ou o GitHub Actions) |

No Ubuntu 22.04 ou mais novo, o AppImage precisa da `libfuse2`
(`sudo apt install libfuse2`) ou de ser aberto com `--appimage-extract-and-run`.

## Celular (Android e iOS): `apps/mobile`

Capacitor. Listas e APIs são buscadas pelo lado nativo (sem CORS); os vídeos tocam no player
web. Conexões `http` estão liberadas no Android (`usesCleartextTraffic`) e no iOS (ATS).

### Android

Precisa do Java 21 e do Android SDK (`JAVA_HOME` e `ANDROID_HOME` apontando para eles).

```bash
npm run android:apk -w apps/mobile
```

O APK sai em `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Para instalar,
ligue a **Depuração USB** no celular e rode `npm run android:install -w apps/mobile`, ou copie
o APK para o celular e abra (permitindo "instalar apps desconhecidos").

### iOS

Só compila num Mac com Xcode:

```bash
npm run ios:sync -w apps/mobile
npx cap open ios
```

No Xcode, escolha seu time de assinatura (Signing & Capabilities) e rode no iPhone. Sem Mac,
o GitHub Actions (`.github/workflows/build-apps.yml`) compila uma versão para o simulador,
só para conferir que o projeto está certo; instalar num iPhone exige assinatura da Apple.

### Ícones

Os ícones e telas de abertura já estão nos projetos `android/` e `ios/`. Para recriá-los a
partir de `brand/icon-app.svg` (precisa do Chrome): `npm run icons -w apps/mobile`.

## GitHub Actions

`.github/workflows/build-apps.yml` gera tudo em máquinas Windows, Linux e macOS. Rode pela
aba **Actions** do repositório (Build dos apps → Run workflow) ou criando uma tag `v*`. Os
arquivos ficam nos artefatos da execução.
