# Código do player (`src/`)

O player é o mesmo em todas as plataformas (navegador, TV LG, desktop e celular). Ele é
organizado **por funcionalidade com camadas** (feature-based / vertical slices):

```
src/
  main.ts      ponto de partida: inicia cada parte do app, em ordem
  head.ts      aplica o tema no <head>, antes da página aparecer
  iptv-player.html   molde da página
  core/        base sem interface, usada por todo o resto
    types.ts     tipos do domínio (listas, canais, histórico, perfis…)
    dom.ts       $, $optional, query, queryAll, closest: acesso tipado ao DOM
    guards.ts    leitura segura de dados externos (isRecord, readText, readNumber…)
    utils.ts     helpers (esc, store no localStorage, toast, loading, formatação)
    saved-data.ts  leitura e validação do que está salvo no localStorage
    state.ts     estado global (listas, lista ativa, dados carregados, preferências por lista)
    theme.ts     tema claro/escuro/automático
    platform.d.ts  tipos de hls.js, mpegts.js, Capacitor e recursos do Safari
  data/        de onde vêm os canais, filmes e séries
    default-list.ts  lista padrão embutida (cópia de listas/brasil-gratis.m3u)
    m3u.ts           leitura de listas M3U
    xtream.ts        API Xtream Codes e fetch com tempo limite
    epg.ts           guia de programação (XMLTV e Xtream)
  ui/          peças visuais comuns a várias telas
    icons.ts         ícones de traço (SVG) — sempre use icon('nome')
    intro.ts         abertura animada (playIntro libera o carregamento)
    theme-button.ts  botão de tema do topo
    *.view.ts        markup do cabeçalho, da estrutura do app, dos diálogos e avisos
  features/    uma pasta por funcionalidade; a tela (*.view.ts) fica junto da lógica
    home/        tela inicial (blocos e prateleiras), recomendações e troca de telas
    playlists/   seletor de listas e abertura de uma lista
    section/     categorias e itens de TV ao vivo, filmes e séries
    details/     detalhes de filme e série
    player/      player (hls.js / mpegts.js / nativo), controles, guia e reconexão;
                 playback.ts guarda o estado da reprodução
    settings/    configurações (listas, PIN, reprodução)
    profiles/    usuários sem login: seletor "Quem está assistindo?", editor (nome, ícone, cor)
  styles/style.css   tokens de cor, temas e layouts (computador, TV e celular)
```

## Regras

- **TypeScript com módulos ES**: cada arquivo importa o que usa, e `esbuild` gera o bundle. O
  navegador não executa `.ts`: use `npm run web:dev` ou um dos builds.
- **Nada roda ao importar**: cada tela exporta `render…View()` e cada funcionalidade exporta
  `init…()`, chamadas em ordem por `main.ts`. Assim a ordem de inicialização fica explícita.
- **Estado compartilhado** fica em `state` (`core/state.ts`) e `playback`
  (`features/player/playback.ts`): quem importa um `let` não consegue alterá-lo.
- **`any` é proibido**. Dado externo (`fetch`, `localStorage`, plataforma) entra como `unknown` e
  passa por `core/guards.ts` ou `core/saved-data.ts`. `$()` só aceita ids registrados em
  `core/dom.ts`: ao criar um id novo, registre-o lá com o tipo do elemento.
- **Onde colocar código novo**:
  - algo de uma funcionalidade só → na pasta dela em `features/` (crie uma pasta nova para uma
    funcionalidade nova, com `nome.view.ts` para o markup e `nome.ts` para a lógica);
  - algo usado por várias funcionalidades → `ui/` (visual) ou `core/` (sem interface);
  - uma nova fonte de canais/dados → `data/`.
    Depois, chame o `init…()` e o `render…View()` dela em `main.ts`.
- **Ajustes de plataforma não entram aqui**: ficam em `apps/<plataforma>/` (`tv.ts`/`tv.css`,
  `desktop.ts`, `mobile.ts`/`mobile.css`). Cada um importa `src/main` e é a entrada do bundle da
  plataforma. Para reagir ao abrir ou fechar o player, use `playerPlatformHooks`.
- **Testes**: todo código novo vem com teste. Jest em `tests/unit/` (100% de linhas e funções) e
  Playwright em `tests/e2e/`.
- **Estilo do código**: sem comentários `//` ou `/* */` — só JSDoc em
  português, sem repetir os tipos; variáveis e funções com nomes autodeclarativos (sem abreviações
  como `e`, `el`, `cur`), ícones via `icon()` e cores via variáveis CSS (`var(--accent)` etc.).
- Layouts responsivos: regras de celular em `@media (max-width:600px)` e de pouca altura em
  `@media (max-height:500px)`; a TV usa 1280×720 (sem regra especial além de `tv.css`).
- **Usuários (perfis)**: só as listas (`cl_pls`, `cl_m3u_*`) e a lista ativa (`cl_active`) são
  compartilhadas. Dados por usuário (histórico, favoritos, bloqueios, PIN, opções, tema, proporção)
  usam `profileKey(chave)`: o perfil Principal (`main`) usa a chave antiga e os outros
  `chave@<id>`. Ao criar um dado novo por usuário, salve com `profileKey()`.
