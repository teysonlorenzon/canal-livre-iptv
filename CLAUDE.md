# Zapp IPTV

Player IPTV (listas M3U e Xtream) que roda no navegador e é empacotado para TV LG (webOS),
Windows/Linux (Electron) e Android/iOS (Capacitor). Repositório público:
github.com/teysonlorenzon/canal-livre-iptv (o nome antigo do app era "Canal Livre").

**Responda sempre em português do Brasil.**

## Onde está cada coisa

- `src/iptv-player.html` — entrada do player; carrega `src/` como scripts clássicos.
- `src/` — código do player, organizado por funcionalidade com camadas. Antes de mexer, leia
  [src/README.md](src/README.md) (ordem de carregamento e onde colocar código novo).
- `apps/tv-webos/`, `apps/desktop/`, `apps/mobile/` — empacotamento e ajustes de cada plataforma.
- `tools/bundle.mjs` — monta o player para as plataformas (converte JS para o navegador alvo).
- `listas/brasil-gratis.m3u` + cópia em `src/data/default-list.js` — lista padrão (manter iguais).
- `store/play/`, `store/lg/` — material e passo a passo das lojas.
- `.claude/agents/zapp-iptv-dev.md` — agente para desenvolver o app;
  `.claude/agents/lg-webos-store-expert.md` + `.claude/skills/lg-webos-store/` — TV LG e LG Content Store.

## Comandos

```bash
npm install                              # uma vez, na raiz (único package.json do projeto)
npm run tv:package                       # .ipk da TV  (tv:install / tv:launch para a TV)
npm run desktop:dist:linux               # AppImage + .deb   (desktop:dist:win: .exe/.zip)
npm run android:apk                      # APK de teste      (android:aab: bundle assinado)
npm run tv:build | desktop:build | mobile:build   # só monta a pasta do app, para testar no navegador
npm run lint / npm run format            # ESLint e Prettier (configs na raiz)
```

Android precisa de `JAVA_HOME=~/.jdks/jdk-21` e `ANDROID_HOME=~/Android/Sdk`.

## Regras do código

- Scripts clássicos com escopo global: **a ordem das tags no `src/iptv-player.html` importa**.
- Estilo do código: `'use strict'`, sem comentários `//` ou `/* */` — só JSDoc em português;
  nomes de variáveis e funções autodeclarativos (sem abreviações); `icon('nome')`
  para ícones, variáveis CSS para cores, nada que o Chromium 68 (TVs LG de 2020) não suporte
  em CSS (`:has()`, `aspect-ratio`, `color-mix`). Nunca use CSS `zoom` na TV.
- Ajustes de plataforma ficam em `apps/<plataforma>/`, não em `src/`.
- `localStorage` usa o prefixo `cl_` — não renomear (perde os dados dos usuários).
- Lista padrão: só canais gratuitos de fontes oficiais. Não adicionar canais pagos nem listas
  não autorizadas.

## Testes

- Verifique toda mudança antes de dizer que funciona (previews em `.claude/launch.json`:
  `iptv` 8765, `webos-dist` 8766, `mobile-www` 8767).
- No navegador, teste em `http://127.0.0.1:8765/src/iptv-player.html`: em `localhost` estão os dados
  reais do usuário (a lista Xtream dele).
- Celular: viewport 390×844 e 844×390; TV: 1280×720, simulando o controle (Voltar = keyCode 461).
- Detalhes por plataforma (emulador Android, Electron, TV real) no agente `zapp-iptv-dev`.

## Segurança e entrega

- Nunca leia, mostre nem commite `apps/mobile/android/keystore.properties`, `*.jks` ou
  credenciais de listas IPTV do usuário.
- Versões: TV em `apps/tv-webos/appinfo.json` (id `com.zappiptv.tv` está cadastrado na LG — não
  mudar), Android em `apps/mobile/android/app/build.gradle`, desktop em `package.json` (raiz, campo `version`).
- Instale em aparelhos, faça commit ou push só quando o usuário pedir. Commits em português.
