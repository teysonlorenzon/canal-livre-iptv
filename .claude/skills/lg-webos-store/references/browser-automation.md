# Automatizar o Seller Lounge no navegador

- Use **Claude in Chrome** (`mcp__claude-in-chrome__*`): só ele tem `file_upload` (o navegador
  embutido do app não anexa arquivos). Carregue as ferramentas em uma única ToolSearch,
  incluindo `file_upload`, `form_input`, `find`, `browser_batch` e `javascript_tool`.
- O usuário faz o login (sessões expiram de um dia para o outro). Nunca digite senha.
- **Depois de alguns SAVE/SUBMIT o site abre `alert()`/`confirm()` nativo** e a extensão para de
  responder ("Script injection timed out"). Espere ~10 s, tente 1–2 vezes e então peça ao usuário
  para clicar **OK** na janela no Chrome.
- `get_page_text` costuma devolver o texto de um modal oculto (lista de países) — use
  screenshots, `zoom`, `find` e `read_page` com `ref_id`.
- `<select>` estilizados: `form_input` no combobox funciona (o visual acompanha).
- Listas de idioma/rádios: clicar no texto do item e depois na seta; conferir com zoom.
- Self-check: está em `document.querySelectorAll('iframe')[0].contentDocument`; dá para definir
  os 53 `select` por JS (disparar `change` e `input`) e conferir o visual com zoom.
- Questionário ClassInd: marcar por JS com `.click()` nos rádios `eval_N` cujo valor é `N:N:*`
  (só depois de o usuário aprovar as respostas) e conferir que 75 foram respondidos e 0 "Sim".
- Coordenadas mudam com a rolagem: refazer `find` antes de clicar; rolar com `scroll_to`.
- Feche as abas criadas ao terminar e salve o progresso na memória do projeto (etapas salvas,
  respostas dadas, o que falta), porque o envio costuma atravessar mais de uma conversa.
