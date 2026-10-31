<p align="center"><img src="brand/icon-app.svg" width="96" alt="Zapp IPTV"></p>

<h1 align="center">Zapp IPTV</h1>

<p align="center">Player IPTV para as suas listas M3U e Xtream, no navegador, na TV LG, no computador e no celular.</p>

<p align="center"><img src="store/play/destaque-1024x500.png" width="640" alt="Zapp IPTV"></p>

## Plataformas

| Plataforma      | Onde fica                                  | Formato                                         |
| --------------- | ------------------------------------------ | ----------------------------------------------- |
| Navegador       | `dist/index.html` (`npm run web:build`)    | abre direto, sem instalação                     |
| TV LG (webOS)   | [`apps/tv-webos`](apps/tv-webos/README.md) | `.ipk`                                          |
| Windows e Linux | [`apps/desktop`](apps/README.md)           | `.exe` / `.zip`, `.AppImage`, `.deb` (Electron) |
| Android e iOS   | [`apps/mobile`](apps/README.md)            | `.apk` / `.aab`, projeto Xcode (Capacitor)      |

Todas usam o mesmo código em TypeScript: `tools/bundle.ts` monta o player para cada plataforma e
acrescenta os ajustes de cada uma (controle remoto na TV, CORS liberado no desktop, botão
Voltar e requisições nativas no celular).

## Recursos

- Listas **Xtream Codes** (servidor, usuário e senha), **URL M3U** ou **arquivo .m3u**
- Lista de exemplo com canais abertos e públicos, transmitidos gratuitamente pelos próprios canais
- TV ao vivo, filmes e séries, com guia de programação (EPG) e catch-up
- Cartão do canal no player com o programa atual, o tempo restante e o próximo
- Favoritos, canais recentes e "Continuar assistindo" (inclusive por episódio)
- Reconexão automática quando o sinal trava; espera servidores lentos e oferece a versão HD/SD do canal
- Controle parental com PIN e bloqueio/ocultação de categorias
- Tema claro, escuro ou automático, com layout para TV, computador e celular
- Navegação por controle remoto e atalhos de teclado (setas, números do canal, F, M, L, G)

## Usar no navegador

Acesse o [site](https://teysonlorenzon.github.io/canal-livre-iptv/) ou gere a pasta `dist/` com `npm run web:build` e abra o `dist/index.html` (Chrome ou Edge recomendados). A lista de exemplo já abre sozinha;
para adicionar a sua, vá em **Configurações**. Tudo fica salvo só no navegador (`localStorage`).

> Por causa de CORS, alguns servidores só funcionam com a página aberta direto do arquivo
> (`file://`) ou de `http://`, e páginas em `https://` não tocam conteúdo `http://`.
> Os apps de desktop e celular não têm essa limitação.

## Gerar os apps

Instale as dependências uma vez, na raiz (Node 22 ou mais novo):

```bash
npm install
```

| App     | Comando                      | Guia                                               |
| ------- | ---------------------------- | -------------------------------------------------- |
| TV LG   | `npm run tv:package`         | [apps/tv-webos/README.md](apps/tv-webos/README.md) |
| Linux   | `npm run desktop:dist:linux` | [apps/README.md](apps/README.md)                   |
| Windows | `npm run desktop:dist:win`   | [apps/README.md](apps/README.md)                   |
| Android | `npm run android:apk`        | [apps/README.md](apps/README.md)                   |
| iOS     | `npm run ios:sync` (no Mac)  | [apps/README.md](apps/README.md)                   |

O workflow [`build-apps.yml`](.github/workflows/build-apps.yml) gera o instalador do Windows,
os pacotes de Linux, o APK e um build de verificação do iOS no GitHub Actions
(aba **Actions** → **Build dos apps** → **Run workflow**, ou criando uma tag `v*`).

Material para publicar na Google Play (imagens, textos, formulários e passo a passo):
[store/play/README.md](store/play/README.md).

## Desenvolvimento

O código é TypeScript com módulos ES; o navegador não executa `.ts` direto, então use um dos comandos:

| Comando                | O que faz                                                        |
| ---------------------- | ---------------------------------------------------------------- |
| `npm run web:dev`      | Servidor em `http://127.0.0.1:8765`, remontando a cada mudança   |
| `npm run web:build`    | Gera `dist/`: tudo minificado, abre em qualquer navegador        |
| `npm test`             | Testes com Jest; exige 100% de linhas e funções                  |
| `npm run test:e2e`     | Testes com Playwright em navegador de verdade (web, celular, TV) |
| `npm run typecheck`    | Verifica os tipos                                                |
| `npm run lint`         | ESLint (`any` é proibido)                                        |
| `npm run format:check` | Confere a formatação do Prettier                                 |

Na primeira vez, instale o navegador dos testes: `npx playwright install chromium`.

A versão web é publicada no GitHub Pages pelo workflow
[`pages.yml`](.github/workflows/pages.yml) a cada push na `main`, se as checagens passarem.

## Estrutura

Monorepo organizado por funcionalidade: o código do player fica em `src/` (camadas `core`,
`data`, `ui` e uma pasta por funcionalidade em `features/`) e cada plataforma em `apps/`.
Detalhes e regras de onde colocar código novo em [src/README.md](src/README.md).

```
src/
  iptv-player.html   molde da página
  core/              base: tipos, DOM, utilidades, estado global, tema
  data/              fontes de dados: lista padrão, M3U, Xtream, guia (EPG)
  ui/                peças visuais comuns: ícones, abertura, cabeçalho, diálogos
  features/          home, playlists, section, details, player, settings (tela + lógica)
  styles/style.css   tokens de cor, temas e layouts (computador, TV e celular)
  main.ts            ponto de partida: inicia cada parte do app, em ordem
apps/
  tv-webos/          app para TV LG (webOS)
  desktop/           app para Windows e Linux (Electron)
  mobile/            app para Android e iOS (Capacitor)
tools/               build (bundle.ts), versão web (build-web.ts) e servidor de desenvolvimento
tests/unit/          testes com Jest (100% de linhas e funções)
tests/e2e/           testes de ponta a ponta com Playwright
brand/               ícones da marca (app e TV)
listas/              lista de exemplo com canais abertos e públicos
store/               material das lojas (play/ e lg/)
.claude/             agentes e skills do Claude Code para este projeto
```

Bibliotecas: [hls.js](https://github.com/video-dev/hls.js) e [mpegts.js](https://github.com/xqq/mpegts.js)
(embutidas em todas as plataformas, em `vendor/`).

## Privacidade e conteúdo

O Zapp IPTV não coleta dados: listas, credenciais, favoritos e histórico ficam só no aparelho.
Veja a [política de privacidade](https://teysonlorenzon.github.io/canal-livre-iptv/store/play/politica-de-privacidade.html).

O app não fornece, vende nem hospeda conteúdo; ele reproduz as listas que você adiciona.
Use somente listas e serviços aos quais você tem direito de acesso.
