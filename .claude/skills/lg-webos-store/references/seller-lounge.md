# LG Seller Lounge — formulário etapa por etapa

URL: https://seller.lgappstv.com · lista de apps:
`/seller/appmgmt/application/appInfo/RetrieveApplicationList.lge` (rascunho → **Edit**).
Cada etapa tem **SAVE** próprio e ganha ✓ na barra lateral; o **SUBMIT** só habilita com todas ✓.
Cadastro de vendedor é gratuito. A página "App Transfer" (logo após login) é só para migrar apps
de conta antiga — ignorar.

## 1. File Upload
- **Set App ID** → **Confirm** (mostra "OK" se livre). Marcar plataforma **webOS** → **DONE**.
- **File Upload** → input de arquivo (`browse.`) recebe o `.ipk`.
- Pergunta "usar dados do appinfo.json?" → **YES** (preenche título, versão, ícone, resolução).
- Chipset: para app web já vem **All** → **Add File**.
- Na linha do arquivo: **Service Platform** = ano mínimo (ex.: "2020 and later" para webOS 5 /
  Chromium 68) → SDK vem 5.0.0; resolução 1280×720 (aviso: só 720p pode perder qualidade em UHD;
  recomendam também um pacote 1920×1080, opcional). **SAVE**.

## 2. Images
Ícone (≥ 400 px), **App Tile Color** (hex = fundo do ícone), capturas (**um arquivo por vez** —
enviar vários no mesmo input só anexa o primeiro), splash opcional. **SAVE**.

## 3. Service Country Info
- Países: abrir a região (+) e marcar (ex.: só **Brazil** em Middle/South America). Menos países
  = menos testes de conteúdo.
- **Select App Service Languages**: idioma da interface do app (ex.: Portuguese) → seta →. **SAVE**.

## 4. Display Info
- Título e descrição em inglês (obrigatórios; descrição 50–4000 bytes, sem emojis).
- Outros idiomas: marcar o idioma na lista → seta → botão ao lado → escolher variante (ex.:
  **Portuguese (All)**) → preencher título/descrição → **Save** do idioma (ganha ✓) → **SAVE**.

## 5. Service Info (tem declarações — confirmar com o usuário)
- Categoria (Game, Entertainment, Life, Education, News Info) + subcategoria (ex.:
  Entertainment → Live).
- Versão (3 campos, igual ao appinfo).
- **App Rating**: General Audiences / 4+ / 12+ / 16+ / 18+. Com classificação ≠ 18+ aparece
  **"Enter Rating for Selected Country"** (obrigatório: confirmar por país).
- **Brasil — ClassInd**: "Assessment of Content Rating" abre questionário de **75 itens**
  (violência, medo, crime, sexo, drogas), cada "Sim" eleva a idade mínima. Inputs são rádios
  `eval_N` com valores `N:Y:<idade>` / `N:N:<idade>`. Tudo "Não" → classificação "All" (Livre).
  Manter coerente com o App Rating geral (Livre ↔ General Audiences).
- **Conteúdo adulto?** Sim/Não (Sim exige método de autenticação).
- Palavras-chave; contato (URL e/ou e-mail).
- Coleta de dados: **Privacy Policy** Sim abre campo de URL; Data collected; Shared Data.
- **SAVE** (às vezes demora/trava alguns segundos).

## 6. Feature Info
Requisitos do aparelho (None / 3D / Camera / Gesture / Gamepad), tipo de controle (**Both Magic
and general remote**, Only Magic, Magic + voz), DIAL (vazio se não usa). **SAVE**.

## 7. Test Info
| Campo | Observação |
|---|---|
| Reference E-mail | até 5, recebem o resultado do QA (digitar → **Add**) |
| **UX Scenario File** | obrigatório (ver assets.md) |
| Note for Tester | marcar a opção (ex.: **Other Information**) → abre textarea (até 2000 bytes) |
| Test Account / Voucher | credenciais/vouchers de teste ou **Not applicable** |
| Test IPK / URL | opcional |
| Geo IP Block | Não, se o app não bloqueia por país |
| Billing | Not Applicable / webOS Pay / 3rd Party / ambos |
| In-App Ad | Not Applicable / Banner / AVOD |
| Player Specification | acordeões DRM, Streaming Protocol, Video Codec, Audio Codec, HDR — **só um aberto por vez** e cliques em outro fecham o atual: abrir um, marcar, depois o próximo. Ex. player HLS: HTTP/HTTPS progressive download + HLS; H.264 + H.265; AAC + HE-AAC |

## 8. Self-check list (53 itens, dentro do `iframe[0]`)
Cada item: `select` com `Pass` / `N/A` (há botão "All Pass" — não usar às cegas). Mudar a versão
zera a lista. Itens normalmente **N/A** para um app sem login/pagamento/anúncio:
4 (anúncios), 18 (termos), 19–21 (cadastro/login/logout), 23 (autenticação adulto),
24–25 (pagamento), 34–35 (só Magic Remote), 39 (tecla LIVE de NetCast/webOS 1.0),
41 (troca de idioma no app), 52 (DRM de conteúdo pago). O resto (execução, tela, foco,
Voltar/EXIT, teclado, busca, controles, teclas coloridas, som, reprodução, formato de tela,
legendas, continuar assistindo, codecs, reset de fábrica) é **Pass** se o app realmente faz.
O botão **SAVE** fica na página principal, no fim da lista.

## 9. SUBMIT
1. **SUBMIT** (barra lateral) → aviso de resolução 1280×720 em UHD → **YES**.
2. Página Submit: **Seller Agreement** (I agree) + termos do Function Test:
   - QA na Coreia: bloqueio por país reprova sem teste (liberar IPs do QA se houver geo-block);
   - 5 reprovações seguidas ou 3 pelo mesmo problema → 3 meses sem QA;
   - liberar com defeitos menores: **I agree / I disagree**.
   Aceitar só com autorização explícita do usuário.
3. **CONFIRM** → lista mostra **"App Packaging Request"** com a data de envio.

Etapas do QA: Pretest (arquivos/ícones/documentos) → Function Test (TV real, baseado no
Self-check) → Content Test (país). Resultado por e-mail e em **Defect Info / Defect History**.
