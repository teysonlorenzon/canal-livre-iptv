// Avalia uma expressão JS na primeira página de um navegador aberto com --remote-debugging-port.
// Uso: node cdp-eval.mjs <porta> "<expressão>"   (aceita await; devolve o valor em JSON)
const [port, expr] = process.argv.slice(2);
const pages = await (await fetch(`http://localhost:${port}/json`)).json();
const ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id === 1) { console.log(JSON.stringify(d.result.result.value ?? d.result, null, 1)); ws.close(); } };
