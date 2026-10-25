# App web para TV LG (webOS)

## appinfo.json (ver `templates/appinfo.json`)

| Campo | Valor recomendado | Observação |
|---|---|---|
| `id` | `com.empresa.app` | minúsculas, dígitos, `.` e `-`; definitivo depois de cadastrado |
| `version` | `1.0.0` | subir a cada envio/atualização; a TV só atualiza se a versão subir |
| `type` / `main` | `web` / `index.html` | |
| `title`, `vendor` | nome do app | |
| `icon` / `largeIcon` | `icon.png` 80×80 / `largeIcon.png` 130×130 | **quadrados, sem cantos transparentes** (o launcher aplica o próprio formato; com cantos vazios o ícone parece menor e com moldura) |
| `bgColor` | igual ao fundo do ícone | cor diferente aparece como moldura |
| `resolution` | `1280x720` | o webOS renderiza em 720p e estica: interface "maior" sem CSS `zoom` |
| `disableBackHistoryAPI` | `true` | o app recebe a tecla Voltar (keyCode 461) |
| `requiredACG` | `[]` | evita aviso do ares-package quando não usa APIs Luna |

## Navegador das TVs

- webOS 5 (2020) = Chromium 68; webOS 6 (2021) = 79; webOS 22 = 87. Converter o código com
  esbuild (`target: 'chrome68'`) — `?.`, `??` quebram nas TVs de 2020/2021.
- CSS: evitar `:has()`, `aspect-ratio` (88+), `color-mix`; `inset` o esbuild converte.
- **Não usar CSS `zoom` para ampliar**: quebra `vh` em diálogos (passam da tela). Use
  `resolution: 1280x720`.
- Juntar os scripts num só arquivo (scripts clássicos compartilham o escopo global) e embutir
  bibliotecas (hls.js, mpegts.js) no pacote, sem CDN.
- Apps empacotados rodam em `file://`; em geral podem buscar URLs de outros domínios (não houve
  bloqueio de CORS na prática), mas teste na TV.

## Controle remoto

| Tecla | keyCode / `e.key` |
|---|---|
| Voltar | 461 (sem `e.key` padrão) |
| OK | `Enter` |
| Setas | `ArrowUp/Down/Left/Right` |
| Vermelho / Verde / Amarelo / Azul | 403 / 404 / 405 / 406 |
| Play / Pause / Stop / ⏩ / ⏪ | 415 / 19 / 413 / 417 / 412 |
| Canal + / − | `PageUp` / `PageDown` (ou `ChannelUp/Down`) |

Padrões que passaram no teste do usuário:
- **Navegação espacial própria** (listener em captura no `document`): para cima/baixo vai sempre
  para a linha seguinte (o item com menor distância vertical, depois o mais alinhado na
  horizontal); para os lados só dentro da mesma linha. `scrollIntoView({block:'center'})`.
- **Foco inicial** num item principal assim que a tela aparece (MutationObserver), nunca no
  `body`; ao abrir um player em camada, tirar o foco do que ficou por trás.
- **Voltar fecha um nível por vez** (diálogo → menu → painel lateral → controles → player →
  seção) e, na tela inicial, **pergunta "Sair do <app>?"** (foco em Cancelar) — a LG espera isso.
- **Campos de texto**: `readOnly` ao receber foco pela navegação; OK tira o `readOnly` e refoca
  (abre o teclado virtual); OK/Voltar confirma. Sem isso o teclado abre ao passar pelo campo e as
  setas laterais ficam presas no cursor.
- Checkbox/linhas de lista: Enter deve chamar `.click()`.
- **Foco visível sem mudar tamanho** (`box-shadow`/borda), senão a grade desalinha.
- Player: ←/→ trocam de canal, ↑/↓ mostram os controles e focam o play; controles somem após
  ~5 s (e as setas voltam a trocar de canal); teclas de mídia mapeadas.

## Desempenho

- Animações de abertura travam se o app processar listas grandes ao mesmo tempo: carregar dados
  depois da animação (Promise que resolve no fim da abertura).
- Evitar `filter: drop-shadow`, `mix-blend-mode` e muitas camadas animadas na TV.
- Servidores lentos: não desistir do vídeo em tempo fixo se os bytes ainda estão chegando.

## Empacotar

```bash
npm i -D @webos-tools/cli esbuild
npx ares-package dist -o out --no-minify     # gera out/<id>_<versão>_all.ipk
```
