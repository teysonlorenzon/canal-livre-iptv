# Instalar na TV pelo modo desenvolvedor

1. Conta gratuita em webostv.developer.lge.com (não é a conta do Seller Lounge).
2. Na TV: LG Content Store → app **Developer Mode** → entrar → **Dev Mode Status** ON (reinicia)
   → **Key Server** ON. Anotar IP e Passphrase.
3. No computador:

```bash
npx ares-setup-device --add tv --info "{'host':'IP_DA_TV','port':'9922','username':'prisoner'}"
npx ares-novacom --device tv --getkey        # pede a Passphrase (o usuário digita)
npx ares-install --device tv out/<id>_<versão>_all.ipk
npx ares-launch --device tv <id>
npx ares-install --device tv --list          # confere o que está instalado
```

## Erros comuns

| Erro | Causa / solução |
|---|---|
| `No matched device <name> : tv` | dispositivo não cadastrado (rodar `ares-setup-device --add`) |
| `Failed to get ssh private key` | usuário errado (tem que ser `prisoner`) ou **Key Server desligado** (porta 9991 fechada) |
| `Connection timed out` | TV desligada, IP mudou, modo desenvolvedor expirou ou porta 9922 fechada |
| `--capture-screen not supported by current profile` | não dá para capturar a tela da TV pelo ares no perfil tv |

Testar portas: `timeout 4 bash -c "echo > /dev/tcp/IP/9922"` (SSH do dev mode) e `.../9991`
(Key Server).

- O modo desenvolvedor expira em 50 h: abrir Developer Mode e usar **Extend**.
- Para atualizar um app instalado, a `version` do appinfo precisa subir.
- Mudar o `id` instala um segundo app ao lado do antigo.
- Ícone antigo pode ficar em cache no launcher: desligar/ligar a TV.
