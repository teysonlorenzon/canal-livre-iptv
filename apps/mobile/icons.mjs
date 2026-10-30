/**
 * Troca os ícones e as telas de abertura padrão do Capacitor pelos da Zapp, nos projetos
 * android/ e ios/ (rodar depois de `cap add`/`cap sync`). Usa o ícone sem texto
 * (brand/icon-app.svg): no celular o nome já aparece embaixo do ícone. O iOS exige ícone sem
 * transparência e aplica o arredondamento sozinho.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderSvg } from '../../tools/bundle.mjs';

const appDir = dirname(fileURLToPath(import.meta.url));
const iconSvg = readFileSync(join(appDir, '..', '..', 'brand', 'icon-app.svg'), 'utf8');
/** Desenho do logo (sem o fundo arredondado), em coordenadas 0–130. */
const logoArt = iconSvg.replace(/^[\s\S]*?<rect[^>]*\/>/, '').replace(/<\/svg>\s*$/, '');
const BG = '#13171a',
  SPLASH_BG = '#0c0f11';

/**
 * SVG quadrado com fundo sólido e o logo ocupando `scale` do lado.
 * @param {string} background Cor de fundo.
 * @param {number} scale Fração do lado ocupada pelo logo.
 * @returns {string} Código SVG.
 */
const square = (background, scale) => {
  const logoSize = 130 * scale,
    offset = (130 - logoSize) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 130"><rect width="130" height="130" fill="${background}"/><g transform="translate(${offset} ${offset}) scale(${scale})">${logoArt}</g></svg>`;
};
/**
 * Primeiro plano do ícone adaptativo do Android (fundo transparente). A tela de desenho tem
 * 108 dp, o launcher mostra só os 72 dp do centro e a zona segura tem 66 dp; com 0,72 o "Z"
 * e o ponto ficam dentro da zona segura em qualquer formato de máscara.
 */
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 130"><g transform="translate(65 65) scale(0.72) translate(-65 -65)">${logoArt}</g></svg>`;
/**
 * Tela de abertura: fundo escuro com o logo no centro, ocupando `fraction` do menor lado.
 * @param {number} width Largura.
 * @param {number} height Altura.
 * @param {number} fraction Fração do menor lado ocupada pelo logo.
 * @returns {string} Código SVG.
 */
const splash = (width, height, fraction) => {
  const logoSize = Math.min(width, height) * fraction;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${SPLASH_BG}"/><g transform="translate(${(width - logoSize) / 2} ${(height - logoSize) / 2}) scale(${logoSize / 130})">${logoArt}</g></svg>`;
};
/**
 * Largura e altura de um PNG.
 * @param {string} filePath Arquivo PNG.
 * @returns {[number, number]} Largura e altura.
 */
const pngSize = filePath => {
  const fileBytes = readFileSync(filePath);
  return [fileBytes.readUInt32BE(16), fileBytes.readUInt32BE(20)];
};

const resDir = join(appDir, 'android', 'app', 'src', 'main', 'res');
if (existsSync(resDir)) {
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [density, multiplier] of Object.entries(densities)) {
    renderSvg(iconSvg, 48 * multiplier, 48 * multiplier, join(resDir, `mipmap-${density}`, 'ic_launcher.png'));
    renderSvg(
      iconSvg.replace(/rx="\d+"/, 'rx="65"'),
      48 * multiplier,
      48 * multiplier,
      join(resDir, `mipmap-${density}`, 'ic_launcher_round.png'),
    );
    renderSvg(foreground, 108 * multiplier, 108 * multiplier, join(resDir, `mipmap-${density}`, 'ic_launcher_foreground.png'));
  }
  writeFileSync(
    join(resDir, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG.toUpperCase()}</color>\n</resources>\n`,
  );
  for (const drawableDir of readdirSync(resDir).filter(dirName => dirName.startsWith('drawable'))) {
    const splashPath = join(resDir, drawableDir, 'splash.png');
    if (!existsSync(splashPath)) continue;
    const [width, height] = pngSize(splashPath);
    renderSvg(splash(width, height, 0.28), width, height, splashPath, '0c0f11ff');
  }
  console.log('Android: ícones e telas de abertura atualizados');
}

const assetsDir = join(appDir, 'ios', 'App', 'App', 'Assets.xcassets');
if (existsSync(assetsDir)) {
  renderSvg(square(BG, 1), 1024, 1024, join(assetsDir, 'AppIcon.appiconset', 'AppIcon-512@2x.png'), '13171aff');
  for (const fileName of readdirSync(join(assetsDir, 'Splash.imageset')).filter(name => name.endsWith('.png')))
    renderSvg(splash(2732, 2732, 0.22), 2732, 2732, join(assetsDir, 'Splash.imageset', fileName), '0c0f11ff');
  console.log('iOS: ícone e tela de abertura atualizados');
}
