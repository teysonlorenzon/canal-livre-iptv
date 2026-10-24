# Publicação na LG Content Store

Material para enviar o Zapp IPTV pelo **LG Seller Lounge** (seller.lgappstv.com).

| Item | Valor |
|---|---|
| Id do app | `com.zappiptv.tv` (não muda depois de cadastrado) |
| Versão | `1.0.0` (`tv/webos/appinfo.json`) |
| Pacote | `tv/webos/out/com.zappiptv.tv_1.0.0_all.ipk` (`npm run package -w tv/webos`) |
| Política de privacidade | https://teysonlorenzon.github.io/canal-livre-iptv/store/play/politica-de-privacidade.html |
| Contato | teyson_lorenzon@hotmail.com |

## Imagens

| Arquivo | Uso |
|---|---|
| `icone-80.png`, `icone-130.png` | ícones do app (os mesmos que vão dentro do `.ipk`) |
| `icone-400.png`, `icone-512.png` | ícone da página da loja (use o tamanho que o formulário pedir) |
| `destaque-1920x1080.png` | imagem de destaque / banner |
| `tv-1-inicio.png` … `tv-5-listas.png` | capturas de tela em 1920×1080, só com a lista de canais públicos |

Se o formulário pedir um tamanho que não está aqui, os ícones saem de `tv/webos/icon.svg`
e o banner de `store/play/feature.svg`.

## Textos

**Nome do app:** Zapp IPTV

**Categoria:** Entretenimento (ou Vídeo, se existir)

**Descrição curta:** Player para suas listas IPTV M3U e Xtream, com guia de programação e favoritos.

**Descrição completa:**

```
O Zapp IPTV é um player de vídeo para assistir às suas próprias listas IPTV na TV, com uma interface simples, moderna e feita para o controle remoto.

COMO FUNCIONA
Adicione a sua lista em Configurações: login Xtream Codes (servidor, usuário e senha) ou endereço de lista M3U. Tudo fica salvo só na sua TV.

RECURSOS
• TV ao vivo organizada por categorias, com números de canal
• Guia de programação (EPG): programa atual, tempo restante e o próximo
• Favoritos, canais recentes e "continuar assistindo"
• Troca de canal pelas setas, pelos botões Canal +/− ou digitando o número
• Lista lateral de canais e guia no próprio player (botões vermelho e verde)
• Reconexão automática quando o sinal trava ou a internet oscila
• Controle parental com PIN
• Tema claro, escuro ou automático

LISTA DE EXEMPLO
O app já vem com uma lista de canais abertos e públicos, transmitidos gratuitamente pelos próprios canais.

IMPORTANTE
O Zapp IPTV não fornece, vende nem hospeda conteúdo. Ele apenas reproduz as listas que você adiciona. Use somente listas e serviços aos quais você tem direito de acesso.
```

**Classificação indicativa:** 18+ (listas de terceiros podem conter qualquer conteúdo).

**Preço:** gratuito, sem compras no app e sem anúncios.

**Países:** Brasil (e outros, se quiser).

## Informações para a equipe de testes da LG

```
O app abre com uma lista de exemplo de canais públicos e gratuitos, sem login. Para testar uma lista própria, use Configurações > URL M3U.
Controle remoto: setas e OK navegam; Voltar fecha um nível por vez e, na tela inicial, pergunta se quer sair; no player, setas laterais e Canal +/− trocam de canal, setas para cima/baixo mostram os controles, vermelho abre a lista de canais e verde o guia.
```

## Passo a passo no Seller Lounge

1. Entre no Seller Lounge com a conta de vendedor (o cadastro é gratuito).
2. **Apps → Registrar novo app**: escolha **webOS TV**, app web, e informe o id `com.zappiptv.tv`.
3. Envie o `.ipk`, preencha os textos acima, as imagens e os países.
4. Marque o app como gratuito, sem compras e sem anúncios; informe a política de privacidade.
5. Envie para revisão (QA). A LG testa numa TV de verdade e devolve um relatório se algo
   falhar; os testes costumam levar algumas semanas.

## Cuidados para não ser recusado

- Não cite canais pagos, Globo, filmes ou séries de serviços de streaming nos textos e imagens.
- Mantenha a frase de que o app não fornece conteúdo.
- As capturas usam só a lista de canais públicos; não envie capturas com listas de provedores.
- Se a LG pedir comprovação de direitos sobre o conteúdo, responda que o app é um player e
  que a lista de exemplo tem apenas transmissões gratuitas e públicas dos próprios canais.
