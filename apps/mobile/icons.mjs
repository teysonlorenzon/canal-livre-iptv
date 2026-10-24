// Troca os ícones e as telas de abertura padrão do Capacitor pelos da Zapp, nos projetos
// android/ e ios/ (rodar depois de `cap add`/`cap sync`). Usa o ícone sem texto
// (brand/icon-app.svg): no celular o nome já aparece embaixo do ícone.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSvg } from '../../tools/bundle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const icon = readFileSync(join(here, '..', '..', 'brand', 'icon-app.svg'), 'utf8');
// Desenho do logo (sem o fundo arredondado), em coordenadas 0–130.
const art = icon.replace(/^[\s\S]*?<rect[^>]*\/>/, '').replace(/<\/svg>\s*$/, '');
const BG = '#13171a', SPLASH_BG = '#0c0f11';

/** SVG quadrado com fundo sólido e o logo ocupando `scale` do lado. */
const square = (bg, scale) => { const s = 130 * scale, o = (130 - s) / 2; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 130"><rect width="130" height="130" fill="${bg}"/><g transform="translate(${o} ${o}) scale(${scale})">${art}</g></svg>`; };
/**
 * Primeiro plano do ícone adaptativo do Android (fundo transparente). A tela de desenho tem
 * 108 dp, o launcher mostra só os 72 dp do centro e a zona segura tem 66 dp; com 0,72 o "Z"
 * e o ponto ficam dentro da zona segura em qualquer formato de máscara.
 */
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 130"><g transform="translate(65 65) scale(0.72) translate(-65 -65)">${art}</g></svg>`;
/** Tela de abertura: fundo escuro com o logo no centro, ocupando `frac` do menor lado. */
const splash = (w, h, frac) => { const s = Math.min(w, h) * frac; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${SPLASH_BG}"/><g transform="translate(${(w - s) / 2} ${(h - s) / 2}) scale(${s / 130})">${art}</g></svg>`; };
/** Largura e altura de um PNG. */
const pngSize = f => { const b = readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

const res = join(here, 'android', 'app', 'src', 'main', 'res');
if (existsSync(res)) {
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    renderSvg(icon, 48 * k, 48 * k, join(res, `mipmap-${d}`, 'ic_launcher.png'));
    renderSvg(icon.replace(/rx="\d+"/, 'rx="65"'), 48 * k, 48 * k, join(res, `mipmap-${d}`, 'ic_launcher_round.png'));
    renderSvg(foreground, 108 * k, 108 * k, join(res, `mipmap-${d}`, 'ic_launcher_foreground.png'));
  }
  writeFileSync(join(res, 'values', 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG.toUpperCase()}</color>\n</resources>\n`);
  for (const dir of readdirSync(res).filter(d => d.startsWith('drawable'))) {
    const f = join(res, dir, 'splash.png'); if (!existsSync(f)) continue;
    const [w, h] = pngSize(f); renderSvg(splash(w, h, 0.28), w, h, f, '0c0f11ff');
  }
  console.log('Android: ícones e telas de abertura atualizados');
}

const xc = join(here, 'ios', 'App', 'App', 'Assets.xcassets');
if (existsSync(xc)) {
  // O iOS exige ícone sem transparência e aplica o arredondamento sozinho.
  renderSvg(square(BG, 1), 1024, 1024, join(xc, 'AppIcon.appiconset', 'AppIcon-512@2x.png'), '13171aff');
  for (const f of readdirSync(join(xc, 'Splash.imageset')).filter(f => f.endsWith('.png'))) renderSvg(splash(2732, 2732, 0.22), 2732, 2732, join(xc, 'Splash.imageset', f), '0c0f11ff');
  console.log('iOS: ícone e tela de abertura atualizados');
}
