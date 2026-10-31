# Zapp IPTV

Player IPTV (listas M3U e Xtream) que roda no navegador e é empacotado para TV LG (webOS),
Windows/Linux (Electron) e Android/iOS (Capacitor). Repositório público:
github.com/teysonlorenzon/canal-livre-iptv (o nome antigo do app era "Canal Livre").

**Responda sempre em português do Brasil.**

## Onde está cada coisa

- `src/main.ts` — entrada do player (TypeScript com módulos ES); `src/iptv-player.html` é o molde da página.
- `src/` — código do player, organizado por funcionalidade com camadas. Antes de mexer, leia
  [src/README.md](src/README.md) (ordem de carregamento e onde colocar código novo).
- `apps/tv-webos/`, `apps/desktop/`, `apps/mobile/` — empacotamento e ajustes de cada plataforma.
- `tools/bundle.ts` — monta o player para as plataformas; `tools/build-web.ts` gera `dist/`, a versão
  web minificada; `tools/dev-server.ts` serve em desenvolvimento.
- `tests/unit/` (Jest) e `tests/e2e/` (Playwright).
- `listas/brasil-gratis.m3u` + cópia em `src/data/default-list.ts` — lista padrão (manter iguais).
- `store/play/`, `store/lg/` — material e passo a passo das lojas.
- `.claude/agents/zapp-iptv-dev.md` — agente para desenvolver o app; `zapp-iptv-code-reviewer.md` e
  `zapp-iptv-qa.md` — revisão de código e QA;
  `.claude/agents/lg-webos-store-expert.md` + `.claude/skills/lg-webos-store/` — TV LG e LG Content Store.

## Comandos

```bash
npm install                              # uma vez, na raiz (único package.json do projeto)
npm run tv:package                       # .ipk da TV  (tv:install / tv:launch para a TV)
npm run desktop:dist:linux               # AppImage + .deb   (desktop:dist:win: .exe/.zip)
npm run android:apk                      # APK de teste      (android:aab: bundle assinado)
npm run web:dev                          # servidor em 127.0.0.1:8765, remonta a cada mudança
npm run web:build                        # gera dist/: minificado, abre em qualquer navegador
npm run tv:build | desktop:build | mobile:build   # só monta a pasta do app, para testar no navegador
npm run typecheck / lint / format        # tipos, ESLint e Prettier
npm test                                 # Jest; exige 100% de linhas e funções
npm run test:e2e                         # Playwright (web, celular e TV)
```

Android precisa de `JAVA_HOME=~/.jdks/jdk-21` e `ANDROID_HOME=~/Android/Sdk`.

## Regras do código

- **TypeScript com `any` proibido, sem exceção** (nem `as any`, `as unknown as`, `@ts-ignore`,
  `eslint-disable` ou `!`). Dado externo entra como `unknown` e é validado. Detalhes no agente
  `zapp-iptv-dev`. `tsconfig.json` e ESLint não podem ser afrouxados.
- Módulos ES: nada de global. Estado compartilhado fica em `state` (`core/state.ts`) e `playback`
  (`features/player/playback.ts`); a inicialização acontece em ordem a partir de `main.ts`.
- `lib` do `tsconfig.json` é ES2018 de propósito: barra APIs que o Chromium 68 das TVs LG não tem.
- Estilo do código: sem comentários `//` ou `/* */` — só JSDoc em português, sem repetir tipos;
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
- Código novo vem com teste: Jest mantém 100% de linhas e funções, e cada funcionalidade tem
  cobertura no Playwright.
- No navegador, teste em `http://127.0.0.1:8765/`: em `localhost` estão os dados reais do usuário
  (a lista Xtream dele).
- Celular: viewport 390×844 e 844×390; TV: 1280×720, simulando o controle (Voltar = keyCode 461).
- Detalhes por plataforma (emulador Android, Electron, TV real) no agente `zapp-iptv-dev`.

## Segurança e entrega

- Nunca leia, mostre nem commite `apps/mobile/android/keystore.properties`, `*.jks` ou
  credenciais de listas IPTV do usuário.
- Versões: TV em `apps/tv-webos/appinfo.json` (id `com.zappiptv.tv` está cadastrado na LG — não
  mudar), Android em `apps/mobile/android/app/build.gradle`, desktop em `package.json` (raiz, campo `version`).
- A política de privacidade (`store/play/politica-de-privacidade.html`) é publicada junto com o
  `dist/`: o endereço está cadastrado na Google Play e na LG e não pode mudar.
- Instale em aparelhos, faça commit ou push só quando o usuário pedir. Commits em português.
