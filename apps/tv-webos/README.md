# Zapp IPTV para TV LG (webOS)

Empacota o player web (`../../src/`) como app `.ipk` para TVs LG.

## Gerar o pacote

```bash
npm install
npm run tv:package
```

O arquivo sai em `out/com.zappiptv.tv_<versão>_all.ipk`.

`npm run tv:build` só monta a pasta `dist/` (útil para testar no navegador com
`python3 -m http.server -d dist`).

## Instalar na TV

1. Na TV, instale o app **Developer Mode** pela LG Content Store e entre com uma
   conta de desenvolvedor LG (gratuita, criada em webostv.developer.lge.com).
2. No Developer Mode, ligue **Dev Mode Status** e **Key Server**. Anote o IP da TV
   e a passphrase exibidos. A TV reinicia.
3. No computador (mesma rede da TV):

   ```bash
   npx ares-setup-device --add tv --info "{'host':'IP_DA_TV','port':'9922','username':'prisoner'}"
   npx ares-novacom --device tv --getkey
   npm run tv:install
   npm run tv:launch
   ```

   O `--getkey` pede a passphrase mostrada na TV.

O modo desenvolvedor expira após 50 horas; para não perder o app, abra o
Developer Mode e use **Extend** antes de acabar o prazo.

## Controle remoto

| Tecla                     | Ação                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Setas                     | Movem o foco entre botões, categorias e canais                                                                          |
| OK                        | Abre o item focado; num campo de texto, abre o teclado (OK de novo confirma)                                            |
| Voltar                    | Fecha diálogo / player / seção; na tela inicial pergunta se quer sair                                                   |
| Amarelo                   | Favorita/desfavorita o item focado (canal, filme ou série na seção ou na tela inicial; filme/série aberto nos detalhes) |
| Vermelho                  | Abre a busca da seção atual (na tela inicial, da seção atual; fecha antes o diálogo aberto)                             |
| ← / → no player           | Troca de canal (ao vivo) ou volta/avança 10 s (filmes e séries)                                                         |
| ↑ / ↓ no player           | Mostra os controles e foca o play/pause; depois as setas andam entre os botões                                          |
| Voltar no player          | Fecha a lista lateral, depois esconde os controles, depois sai do player                                                |
| Canal +/−                 | Troca de canal                                                                                                          |
| Amarelo no player         | Favorita o que está tocando; na lista lateral de canais, o canal focado                                                 |
| Vermelho no player        | Fecha o player e abre a busca da seção do que estava tocando                                                            |
| Verde no player           | Guia de programação (a lista de canais fica no botão "Canais" dos controles)                                            |
| Play, Pause, Stop, ⏩, ⏪ | Controle de reprodução                                                                                                  |
| Números no player         | Vai direto para o canal                                                                                                 |

## Como funciona

- A interface é renderizada em 1280×720 (`resolution` no `appinfo.json`) e o webOS
  estica para a tela inteira, deixando tudo maior para ver do sofá.
- `build.ts` gera o bundle a partir de `tv.ts` (que inicia o player e acrescenta a navegação pelo
  controle) e `tv.css` (foco visível), minificado e convertido para o Chromium 68 (webOS 5, TVs de
  2020), e copia `hls.js` e `mpegts.js` para dentro do pacote.
- Mudanças no player web entram no app da TV rodando `npm run package` de novo.
  Para atualizar uma TV que já tem o app, aumente `version` em `appinfo.json`.
