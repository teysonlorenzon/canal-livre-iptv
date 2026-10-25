#!/usr/bin/env python3
"""Gera o HTML do roteiro UX exigido pela LG (depois converter em PDF com o Chrome).

Uso: python3 ux-scenario.py saida.html "Nome do App" com.empresa.app 1.0.0 \
       "tela1.png:1. Home:O que aparece e o que cada tecla faz" "tela2.png:2. Player:..."
PDF: google-chrome --headless=new --no-pdf-header-footer --print-to-pdf=roteiro.pdf file:///abs/saida.html
Edite KEYS e INTRO conforme o app.
"""
import base64, html, sys

INTRO = ("Video player for the user's own content. No account, login or payment is required; "
         "the app opens with sample content so it can be tested right away.")
KEYS = [("Arrows / OK", "Move focus / open the focused item"),
        ("Back", "Closes one level at a time; on Home asks to exit"),
        ("Left / Right in player", "Change channel or seek"),
        ("Up / Down in player", "Show the controls"),
        ("Red / Green / Yellow", "Channel list / guide / favorite"),
        ("Play, Pause, Stop, FF, RW", "Playback control")]

out, title, app_id, version, *screens = sys.argv[1:]
img = lambda f: "data:image/png;base64," + base64.b64encode(open(f, "rb").read()).decode()
pages = ""
for s in screens:
    f, t, d = s.split(":", 2)
    pages += f'<section><h2>{html.escape(t)}</h2><img src="{img(f)}"><p>{html.escape(d)}</p></section>'
rows = "".join(f"<tr><td>{html.escape(k)}</td><td>{html.escape(v)}</td></tr>" for k, v in KEYS)
doc = f"""<!doctype html><html><head><meta charset="utf-8"><style>
@page {{ size: A4 landscape; margin: 14mm; }} body {{ font-family: "DejaVu Sans", Arial, sans-serif; color:#14191c }}
section {{ page-break-after: always }} h1 {{ font-size:26px }} h2 {{ font-size:18px }}
img {{ width:100%; max-height:135mm; object-fit:contain; border:1px solid #ccc }} p, td, th {{ font-size:12.5px; line-height:1.5 }}
table {{ border-collapse:collapse }} td, th {{ border:1px solid #bbb; padding:4px 8px; text-align:left }}
</style></head><body><section><h1>{html.escape(title)} - UX Scenario</h1>
<p><b>App ID:</b> {app_id} &nbsp; <b>Version:</b> {version}</p><p>{html.escape(INTRO)}</p>
<h2>Remote control</h2><table><tr><th>Key</th><th>Action</th></tr>{rows}</table>
<h2>Authentication</h2><p>None.</p></section>{pages}</body></html>"""
open(out, "w").write(doc)
print(out)
