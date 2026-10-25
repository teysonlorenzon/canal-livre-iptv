# Navegação por controle remoto (exemplo real, do Zapp IPTV)

`tv.js` e `tv.css` foram aprovados no teste na TV: navegação espacial pelas setas, Voltar (461)
um nível por vez com "Sair do app?" na tela inicial, teclas coloridas e de mídia no player,
campos de texto que só abrem o teclado com OK e foco visível sem mudar tamanho.

Eles chamam funções do app de origem (`$`, `closePlayer`, `show`, `togglePlMenu`, `step`, `poke`,
`playing`, ids `#player`, `#side`, `#section`, `#items`, `#cats`, `#plMenu`). Adapte esses nomes ao
app novo; a lógica de `moveFocus`, `focusFirst`, `startEdit/stopEdit` e `confirmExit` é genérica.
