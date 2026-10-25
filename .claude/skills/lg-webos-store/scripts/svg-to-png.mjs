// Renderiza um SVG em PNG com o Chrome headless.
// Uso: node svg-to-png.mjs <entrada.svg> <saida.png> <largura> [altura] [fundo RRGGBBAA, padrão transparente]
// Ícone de TV LG: use um SVG quadrado com fundo opaco e sem cantos arredondados (rx="0").
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const [inp, outRel, w, h = w, bg = '00000000'] = process.argv.slice(2);
const out = resolve(outRel), tmp = out + '.html';
const chrome = ['google-chrome', 'chromium', 'chromium-browser'].find(b => { try { execFileSync('which', [b], { stdio: 'ignore' }); return true; } catch { return false; } });
const svg = readFileSync(inp, 'utf8').replace('<svg ', `<svg width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" `);
writeFileSync(tmp, `<html><body style="margin:0;background:transparent">${svg}</body></html>`);
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--default-background-color=${bg}`, `--window-size=${w},${h}`, `--screenshot=${out}`, 'file://' + tmp], { stdio: 'ignore' });
rmSync(tmp); console.log(out);
