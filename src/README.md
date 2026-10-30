# Código do player (`src/`)

O player é o mesmo em todas as plataformas (navegador, TV LG, desktop e celular). Ele é
organizado **por funcionalidade com camadas** (feature-based / vertical slices):

```
src/
  core/        base sem interface, usada por todo o resto
    utils.js     helpers ($, esc, store no localStorage, toast, formatação)
    state.js     estado global (listas, lista ativa, dados carregados, preferências por lista)
    theme.js     tema claro/escuro/automático (roda no <head>)
  data/        de onde vêm os canais, filmes e séries
    default-list.js  lista padrão embutida (cópia de listas/brasil-gratis.m3u)
    m3u.js           leitura de listas M3U
    xtream.js        API Xtream Codes e fetch com tempo limite
    epg.js           guia de programação (XMLTV e Xtream)
  ui/          peças visuais comuns a várias telas
    icons.js         ícones de traço (SVG) — sempre use icon('nome')
    intro.js         abertura animada (introDone libera o carregamento)
    *.view.js        markup do cabeçalho, da estrutura do app, dos diálogos e avisos
  features/    uma pasta por funcionalidade; a tela (*.view.js) fica junto da lógica
    home/        tela inicial (blocos e prateleiras) e troca de telas
    playlists/   seletor de listas e abertura de uma lista
    section/     categorias e itens de TV ao vivo, filmes e séries
    details/     detalhes de filme e série
    player/      player (hls.js / mpegts.js / nativo), controles, guia e reconexão
    settings/    configurações (listas, PIN, reprodução)
    profiles/    usuários sem login: seletor "Quem está assistindo?", editor (nome, ícone, cor)
  styles/style.css   tokens de cor, temas e layouts (computador, TV e celular)
  main.js      ponto de partida
```

## Regras

- **Scripts clássicos, sem módulos**: tudo compartilha o escopo global e a **ordem no
  `iptv-player.html` importa**. Um arquivo só pode usar, ao carregar, o que veio antes dele;
  dentro de funções pode usar qualquer coisa. Ordem: tema (head) → `ui` e telas (`*.view.js`) →
  hls.js/mpegts.js → `core` → `data` → lógica das `features` → `main.js`.
- **Onde colocar código novo**:
  - algo de uma funcionalidade só → na pasta dela em `features/` (crie uma pasta nova para uma
    funcionalidade nova, com `nome.view.js` para o markup e `nome.js` para a lógica);
  - algo usado por várias funcionalidades → `ui/` (visual) ou `core/` (sem interface);
  - uma nova fonte de canais/dados → `data/`.
    Depois, inclua o arquivo no `iptv-player.html` na posição certa.
- **Ajustes de plataforma não entram aqui**: ficam em `apps/<plataforma>/` (`tv.js`/`tv.css`,
  `desktop.js`, `mobile.js`/`mobile.css`) e são acrescentados no build por `tools/bundle.mjs`.
- **Estilo do código**: `'use strict'` no topo, sem comentários `//` ou `/* */` — só JSDoc em
  português; variáveis e funções com nomes autodeclarativos (sem abreviações como `e`, `el`,
  `cur`), ícones via `icon()` e cores via variáveis CSS (`var(--accent)` etc.).
- Layouts responsivos: regras de celular em `@media (max-width:600px)` e de pouca altura em
  `@media (max-height:500px)`; a TV usa 1280×720 (sem regra especial além de `tv.css`).
- **Usuários (perfis)**: só as listas (`cl_pls`, `cl_m3u_*`) e a lista ativa (`cl_active`) são
  compartilhadas. Dados por usuário (histórico, favoritos, bloqueios, PIN, opções, tema, proporção)
  usam `profileKey(chave)`: o perfil Principal (`main`) usa a chave antiga e os outros
  `chave@<id>`. Ao criar um dado novo por usuário, salve com `profileKey()`.
