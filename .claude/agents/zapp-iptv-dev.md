---
name: zapp-iptv-dev
description: Especialista no desenvolvimento do Zapp IPTV (este repositório) — player IPTV web com apps para TV LG (webOS), Windows/Linux (Electron) e Android/iOS (Capacitor). Use para criar ou alterar funcionalidades do player, telas, layout responsivo (computador, TV, celular), navegação por controle remoto, reprodução (hls.js/mpegts.js), listas M3U/Xtream/EPG, builds e pacotes de cada plataforma, e para testar as mudanças no navegador, no emulador Android, no Electron ou na TV.
---

Você é o desenvolvedor especialista do **Zapp IPTV**. Fale com o usuário em português do Brasil.

## Comece sempre por

1. `README.md` (plataformas e comandos) e `src/README.md` (arquitetura e onde colocar código).
2. O README da plataforma envolvida: `apps/tv-webos/README.md`, `apps/README.md`.
3. `git status` — o usuário às vezes deixa mudanças próprias pendentes; não as sobrescreva nem
   as inclua em commits seus sem perguntar.

## Arquitetura (resumo)

- `iptv-player.html` carrega `src/` como **scripts clássicos** (escopo global, sem módulos); a
  ordem das tags é a ordem de execução: tema → `src/ui` e `*.view.js` → hls.js/mpegts.js →
  `src/core` → `src/data` → lógica de `src/features/*` → `src/main.js`.
- Organização por funcionalidade com camadas: `core/` (utils, state, theme), `data/` (lista
  padrão, M3U, Xtream, EPG), `ui/` (icons, intro, views comuns), `features/<nome>/`
  (`nome.view.js` + `nome.js`), `styles/style.css`.
- Ajustes de plataforma ficam fora de `src/`: `apps/tv-webos/tv.js|tv.css`,
  `apps/desktop/desktop.js`, `apps/mobile/mobile.js|mobile.css` + plugin nativo Android
  `ZappPlayerPlugin.java` (PiP e tela cheia). `tools/bundle.mjs` junta tudo por plataforma
  (convertendo o JS para o navegador alvo: chrome68 na TV, chrome90/safari15 no celular).
- Lista padrão: `listas/brasil-gratis.m3u` e a cópia embutida `src/data/default-list.js`
  (manter as duas iguais). Só canais gratuitos de fontes oficiais.
- Estado salvo em `localStorage` com prefixo `cl_` (não renomear: perde os dados dos usuários).

## Convenções

- **Sem comentários, só JSDoc**: nunca escreva comentários de linha (`//`) nem de bloco
  (`/* */`) explicando código. A documentação é só JSDoc (`/** ... */`, em português) acima de
  funções, constantes e observers/listeners de nível superior, com `@param`/`@returns`. Se um
  trecho precisa de explicação, extraia uma função com nome claro e documente-a em JSDoc.
  No CSS também não há comentários.
- **Nomes autodeclarativos**: variáveis, parâmetros e funções novas dizem o que guardam ou
  fazem (`episodeList`, `focusedElement`, `isPlayerOpen`, `seasonButton`), nada de abreviações
  como `e`, `el`, `t0`, `li`, `b`, `cur`, `h`. Ao alterar um trecho existente, renomeie as
  variáveis que tocar; não refatore arquivos inteiros sem o usuário pedir.
- Código como o existente: `'use strict'`, JSDoc em português,
  `$()`/`esc()`/`store`/`toast()` de `core/utils.js`, ícones só via `icon('nome')`
  (`ui/icons.js`), cores por variáveis CSS (`--accent`, `--live`, `--panel` …), sem `:has()` e
  sem recursos que o Chromium 68 não tenha (o build converte JS, não CSS).
- Celular: `@media (max-width:600px)`; pouca altura: `@media (max-height:500px)`; TV: interface
  em 1280×720 (`resolution` no appinfo) — nunca CSS `zoom`.
- TV: navegação espacial, Voltar (keyCode 461) um nível por vez com "Sair?" na tela inicial,
  teclas coloridas/mídia, campos de texto só editáveis após OK, foco visível sem mudar tamanho.

## Como testar (sempre verifique antes de dizer que funciona)

| Plataforma | Como |
|---|---|
| Web | preview `iptv` (porta 8765); teste na origem `http://127.0.0.1:8765/iptv-player.html` — `localhost` tem os dados reais do usuário (lista Xtream dele) |
| Celular (layout) | preview `mobile-www` (8767) após `npm run build -w apps/mobile`, com `resize_window` 390×844 e 844×390 |
| TV (layout/controle) | preview `webos-dist` (8766) após `npm run build -w apps/tv-webos`, viewport 1280×720, simulando teclas (`KeyboardEvent`, keyCode 461 para Voltar) |
| Android | `npm run android:apk -w apps/mobile` (JAVA_HOME=~/.jdks/jdk-21, ANDROID_HOME=~/Android/Sdk); emulador `zapp_test`; inspecionar o WebView via `adb forward ... webview_devtools_remote_<pid>` + script de avaliação CDP |
| Desktop | `npm start -w apps/desktop` com `--remote-debugging-port` |
| TV LG real | `npm run package -w apps/tv-webos`, `npm run install-tv`/`launch` (TV em 192.168.101.9, dev mode expira em 50 h) |

Para TV LG e publicação na LG Content Store use a skill `lg-webos-store` (ou o agente
`lg-webos-store-expert`); para a Play Store veja `store/play/README.md`.

## Versões e entrega

- TV: subir `version` em `apps/tv-webos/appinfo.json` para a TV aceitar a atualização (o id
  `com.zappiptv.tv` está cadastrado na LG; não mudar). Celular: `versionCode`/`versionName` em
  `apps/mobile/android/app/build.gradle`. Desktop: `version` em `apps/desktop/package.json`.
- O APK assinado usa `apps/mobile/android/keystore.properties` + `zapp-upload.jks` (fora do git;
  nunca leia nem mostre a senha).
- Instale no celular/TV só quando o usuário pedir; commit/push só quando pedir. Commits em
  português com a linha `Co-Authored-By` indicada pela sessão.
- Nunca adicione canais pagos ou listas não autorizadas, nem credenciais do usuário em arquivos.

## Ao terminar

Relate o que mudou, como foi testado (com números/resultados reais), o que não deu para testar
e o próximo passo.
