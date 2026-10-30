# Publicação na Google Play

Tudo o que o Play Console pede para o Zapp IPTV (`com.zappiptv.app`).

## 1. Criar a chave de upload (uma vez só)

Na pasta `apps/mobile/android`, rode o comando abaixo e responda às perguntas. Ele pede uma
senha: **anote-a**. Guarde o arquivo `zapp-upload.jks` e a senha num lugar seguro e fora do
git (o `.gitignore` já ignora `.jks`). Sem eles não é possível atualizar o app.

```bash
~/.jdks/jdk-21/bin/keytool -genkeypair -v -keystore zapp-upload.jks -alias zapp-upload -keyalg RSA -keysize 2048 -validity 10000
```

Depois copie `keystore.properties.example` para `keystore.properties` (também fora do git) e
troque `SENHA_DA_CHAVE` pela senha que você escolheu.

## 2. Gerar o `.aab`

Na raiz do repositório:

```bash
npm run android:aab
```

O arquivo sai em `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`.
A cada nova versão enviada, aumente `versionCode` (e `versionName`) em
`apps/mobile/android/app/build.gradle`.

No primeiro envio, aceite a **Assinatura de apps do Google Play** (o Google guarda a chave
final; a sua `zapp-upload.jks` serve só para enviar as versões).

## 3. Ficha da loja

| Campo | Conteúdo |
|---|---|
| Nome do app (até 30) | Zapp IPTV – Player de TV |
| Descrição curta (até 80) | Player para suas listas IPTV M3U e Xtream, com guia de programação e favoritos. |
| Categoria | Vídeo players e editores |
| Ícone | `icone-512.png` |
| Recurso gráfico | `destaque-1024x500.png` |
| Capturas de tela (celular) | `captura-1-inicio.png`, `captura-2-canais.png`, `captura-3-player.png`, `captura-4-listas.png` |
| Política de privacidade | link público para `politica-de-privacidade.html` (veja abaixo) |

### Descrição completa

```
O Zapp IPTV é um player de vídeo para assistir às suas próprias listas IPTV no celular, com uma interface simples, moderna e pensada para TV ao vivo.

COMO FUNCIONA
Adicione a sua lista em segundos: login Xtream Codes (servidor, usuário e senha), endereço de lista M3U ou arquivo .m3u. Tudo fica salvo só no seu aparelho.

RECURSOS
• TV ao vivo organizada por categorias, com busca e números de canal
• Guia de programação (EPG): programa atual, tempo restante e o próximo
• Favoritos, canais recentes e "continuar assistindo" para filmes e episódios da sua lista
• Troca rápida de canal e lista lateral de canais no player
• Reconexão automática quando o sinal trava ou a internet oscila
• Suporte a HLS (.m3u8) e MPEG-TS
• Controle parental com PIN e ocultação de categorias
• Tema claro, escuro ou automático

LISTA DE EXEMPLO
O app já vem com uma lista de canais abertos e públicos, transmitidos gratuitamente pelos próprios canais, para você experimentar.

IMPORTANTE
O Zapp IPTV não fornece, vende nem hospeda conteúdo. Ele apenas reproduz as listas que você adiciona. Use somente listas e serviços aos quais você tem direito de acesso.
```

## 4. Formulários do Play Console

**Segurança dos dados**
- O app coleta ou compartilha dados do usuário? **Não.** As listas, credenciais Xtream,
  favoritos e histórico ficam guardados só no aparelho e nunca são enviados ao desenvolvedor.
- Os dados são criptografados em trânsito? Depende do servidor da lista do usuário
  (http ou https); como o app não coleta dados, essa pergunta não se aplica.
- O usuário pode pedir a exclusão dos dados? Sim: removendo a lista nas Configurações ou
  desinstalando o app.

**Classificação do conteúdo**: responda ao questionário como app de reprodução de mídia em que
o conteúdo vem do usuário. Não há violência, compras, chat nem compartilhamento de localização.

**Público-alvo**: 18 anos ou mais (listas IPTV de terceiros podem conter qualquer conteúdo;
apontar crianças como público exige seguir a política Famílias).

**Anúncios**: não contém anúncios.

**Acesso ao app**: todas as funções estão disponíveis sem login (a lista de exemplo abre sozinha).

## 5. Política de privacidade com link público

O repositório é privado, então o link do GitHub não serve. Opções:
- criar um **Gist público** no GitHub com o conteúdo de `politica-de-privacidade.html` e usar o
  link "Raw" pelo serviço htmlpreview, ou colar o texto num **Google Sites** gratuito;
- tornar o repositório público e ativar o **GitHub Pages**.

Link público: https://teysonlorenzon.github.io/canal-livre-iptv/store/play/politica-de-privacidade.html

## 6. Envio

1. Crie o app no Play Console (nome, idioma padrão português, app, gratuito).
2. Preencha a ficha da loja e os formulários acima.
3. Contas pessoais criadas depois de novembro de 2023: envie primeiro para um **teste fechado**
   com pelo menos **12 testadores por 14 dias seguidos**; depois peça acesso à produção.
4. Envie o `.aab` e aguarde a revisão (normalmente alguns dias).

## Cuidados para não ser recusado

- Nos textos e nas capturas, nunca mostre ou cite canais pagos, Globo, filmes ou séries de
  serviços de streaming. As capturas daqui usam só a lista de canais gratuitos.
- Mantenha a frase de que o app não fornece conteúdo.
- Não troque o id `com.zappiptv.app` depois de publicar: a Play Store trata como outro app.
