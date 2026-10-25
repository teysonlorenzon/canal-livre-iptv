# Material para a LG Content Store

| Item | Requisito |
|---|---|
| Ícone do app (formulário) | JPG/PNG ≤ 5 MB, quadrado, ≥ 400×400, **sem gradiente no fundo** |
| Cor do bloco (App Tile Color) | hex igual ao fundo do ícone |
| Capturas de tela | **mínimo 3**, 1920×1080 ou 1280×720, ≤ 5 MB; a primeira é a principal |
| Splash (opcional) | 1920×1080, ≤ 10 MB |
| Título | até 95 bytes |
| Descrição | 50–4000 bytes, **sem emojis**; inglês obrigatório + idiomas locais |
| Palavras-chave | separadas por espaço, sem caracteres especiais/emojis |
| Política de privacidade | URL pública (na TV aparece como texto); repositório privado não serve → GitHub Pages (com `.nojekyll`), Google Sites ou Gist |
| **Roteiro UX (UX Scenario)** | **obrigatório**, até 3 arquivos (PDF, DOC, PPT, XLS, imagens, ZIP ≤ 10 MB) |

## Capturas 1920×1080 de um app web

Servir o build (ex.: `python3 -m http.server 8766 -d dist`), abrir um Chrome headless com
`--remote-debugging-port` e rodar `scripts/tv-screenshots.mjs`: ele aplica
`Emulation.setDeviceMetricsOverride` (1280×720, deviceScaleFactor 1,5) e
`prefers-color-scheme: dark`, recarrega e tira as capturas. Sem o override, o headless
desconta a barra do navegador (sai 1920×950).

Usar só conteúdo livre/público nas capturas (sem listas de provedores, sem canais pagos).

## Ícones e banners

`scripts/svg-to-png.mjs` renderiza SVG em PNG com o Chrome headless (caminhos absolutos).
Para a TV: o mesmo SVG com `rx="0"` (quadrado cheio) e fundo opaco.

## Roteiro UX em PDF

Conteúdo que funcionou: capa com id, versão, plataforma mínima, o que o app faz e se exige
login; fluxo (abertura → início → seção → player); tabela de teclas do controle; uma página por
tela com captura e texto do que cada tecla faz; seção "Authentication" (sem login, PIN padrão).
Gerar com `scripts/ux-scenario.py` e converter com `google-chrome --headless=new
--no-pdf-header-footer --print-to-pdf=...`.

## Textos (modelo de player)

- Descrição: o que é (player das suas listas), como funciona, recursos em tópicos com "-",
  lista de exemplo com conteúdo livre e o aviso "não fornece, vende nem hospeda conteúdo".
- Nota para os testadores (inglês): primeira submissão, plataforma mínima, como testar sem
  login, mapa das teclas, "ver o roteiro UX anexo".
