# Canal Livre IPTV

Player IPTV que roda direto no navegador, sem instalação e sem build.

## Recursos

- Listas **Xtream Codes** (servidor, usuário e senha), **URL M3U** ou **arquivo .m3u**
- TV ao vivo, filmes e séries, com guia de programação (EPG) e catch-up
- Favoritos, canais recentes e "Continuar assistindo" (inclusive por episódio)
- Controle parental com PIN e bloqueio/ocultação de categorias
- Tema claro, escuro ou automático
- Reconexão automática da TV ao vivo quando o sinal trava ou a internet cai
- Atalhos de teclado e controle remoto (setas, números do canal, F, M, L, G)

## Como usar

Abra o `iptv-player.html` no navegador (Chrome ou Edge recomendados) e adicione sua lista em **Configurações**.
Tudo fica salvo apenas no `localStorage` do navegador.

> Por causa de CORS, alguns servidores só funcionam com a página aberta direto do arquivo (`file://`) ou de `http://`.
> Páginas em `https://` não conseguem tocar conteúdo `http://`.

## Estrutura

```
iptv-player.html   página principal (só carrega CSS e scripts)
css/style.css      estilos e temas
js/views/          markup de cada parte da interface
js/*.js            lógica do app (scripts clássicos, a ordem no HTML importa)
```

Bibliotecas via CDN: [hls.js](https://github.com/video-dev/hls.js) e [mpegts.js](https://github.com/xqq/mpegts.js).
