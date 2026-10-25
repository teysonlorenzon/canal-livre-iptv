---
name: lg-webos-store
description: Criar, empacotar, instalar e publicar apps web para TVs LG (webOS) na LG Content Store pelo LG Seller Lounge. Use quando o pedido envolver TV LG, webOS, arquivo .ipk, appinfo.json, ares-cli (ares-package/ares-install), modo desenvolvedor da TV, navegação por controle remoto, LG Seller Lounge (seller.lgappstv.com), envio/QA/Self-check da LG ou imagens e textos para a loja da LG.
---

# Apps para TV LG (webOS) e publicação na LG Content Store

Conhecimento reunido na publicação real do Zapp IPTV (`com.zappiptv.tv`). Responda ao usuário em
português do Brasil.

## Quando usar cada referência

| Tarefa | Leia |
|---|---|
| Transformar um app web em app de TV (appinfo, build, controle remoto, ícones, armadilhas) | `references/webos-app.md` |
| Instalar na TV pelo modo desenvolvedor (ares-cli, chave, erros comuns) | `references/dev-mode.md` |
| Preparar imagens, textos, roteiro UX (PDF) e capturas 1920×1080 | `references/assets.md` |
| Preencher e enviar o formulário do Seller Lounge, etapa por etapa | `references/seller-lounge.md` |
| Automatizar o navegador no Seller Lounge (Claude in Chrome) sem travar | `references/browser-automation.md` |

## Fluxo completo (resumo)

1. **App de TV**: app web empacotado com `appinfo.json`, código convertido para o Chromium da TV
   (webOS 5 = Chromium 68), navegação por setas, botão Voltar (keyCode 461) com confirmação de
   saída na tela inicial, `resolution: 1280x720`. Modelo em `templates/appinfo.json`.
2. **Teste na TV**: Developer Mode + `ares-setup-device` (usuário `prisoner`, porta 9922) +
   `ares-novacom --getkey` (Key Server ligado) + `ares-install` + `ares-launch`.
3. **Material da loja**: ícone quadrado ≥ 400 px sem cantos transparentes, cor do bloco = fundo do
   ícone, ≥ 3 capturas 1920×1080, splash 1920×1080, descrição EN (50–4000 bytes, sem emojis) +
   idioma local, política de privacidade em URL pública, **roteiro UX em PDF (obrigatório)**.
4. **Seller Lounge**: Create App → File Upload → Images → Service Country → Display Info →
   Service Info → Feature Info → Test Info → Self-check list (53 itens) → SUBMIT → termos →
   CONFIRM. Status passa a "App Packaging Request"; QA leva semanas e é feito na Coreia.
5. **Reprovação/atualização**: ver Defect Info, corrigir, **subir a versão** no appinfo e no
   formulário; mudar a versão **zera o Self-check** (refazer antes de reenviar).

## Regras que não podem ser quebradas

- **Nunca digite senhas** (conta LG, chave de assinatura). Peça ao usuário para logar e para
  digitar senhas no terminal; a senha da chave nunca passa pela conversa.
- **Pare e confirme com o usuário antes de**: declarações (classificação, questionário ClassInd,
  conteúdo adulto, coleta de dados), aceitar termos (Seller Agreement e termos de QA) e clicar
  **SUBMIT/CONFIRM**. Mostre as respostas sugeridas em tabela e pergunte.
- **Self-check honesto**: "Pass" só para o que o app realmente faz; "N/A" para o que não existe.
  Marcar errado leva a recusa. Recomende testar o pacote exato na TV antes do SUBMIT.
- **Apps de vídeo/IPTV**: apresentar como player das listas do próprio usuário, frase "não
  fornece conteúdo", capturas só com conteúdo livre/público, sem citar canais pagos ou
  serviços de streaming. Não ajudar com listas piratas.
- **Id do app** (`com.empresa.app`) não muda depois de cadastrado; trocar o id na TV cria outro
  app (dados não migram).

## Scripts

- `scripts/cdp-eval.mjs <porta> <expressão>` — avalia JS numa página via DevTools (testar o app
  no Chrome/Electron/WebView com `--remote-debugging-port`).
- `scripts/tv-screenshots.mjs <porta> <pasta>` — capturas 1920×1080 (1280×720 × 1,5) em tema
  escuro de um app servido localmente; edite os passos no topo do arquivo.
- `scripts/svg-to-png.mjs <svg> <saida.png> <largura> [altura] [corRRGGBBAA]` — ícones e banners
  com o Chrome headless.
- `scripts/ux-scenario.py <saida.html> <titulo> <app-id> <versao> <tela.png:Título:Texto>...` —
  gera o HTML do roteiro UX; converta com
  `google-chrome --headless=new --no-pdf-header-footer --print-to-pdf=roteiro.pdf file://.../saida.html`.
