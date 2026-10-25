// Capturas 1920x1080 (layout 1280x720 x 1,5, como na TV LG) em tema escuro, via DevTools.
// 1) Sirva o app (ex.: python3 -m http.server 8766 -d dist)
// 2) google-chrome --headless=new --remote-debugging-port=9400 --user-data-dir=/tmp/x http://localhost:8766/index.html &
// 3) node tv-screenshots.mjs 9400 /pasta/saida
// Edite STEPS: cada passo roda um JS na página, espera e salva <nome>.png.
import { writeFileSync } from 'node:fs';
const STEPS = [
  { name: 'tv-1-inicio', js: `void 0`, wait: 2500 },
  // { name: 'tv-2-lista', js: `openSection('live')`, wait: 2500 },
];
const [port, out] = process.argv.slice(2);
const pages = await (await fetch(`http://localhost:${port}/json`)).json();
const ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = m => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } };
const call = (method, params = {}) => new Promise(r => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1.5, mobile: false });
await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
await call('Page.reload'); await sleep(7000);
for (const s of STEPS) {
  await call('Runtime.evaluate', { expression: s.js, awaitPromise: true });
  await sleep(s.wait || 2000);
  const r = await call('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${s.name}.png`, Buffer.from(r.data, 'base64')); console.log('ok', s.name);
}
ws.close();
