// Minimal headless Chrome driver over the DevTools protocol (Node ≥ 22, no npm deps).
// Launched with Metal ANGLE so WebGL and transmission render like a real tab.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function findChrome(): string | undefined {
  if (process.env.CHROME) return process.env.CHROME;
  const home = process.env.HOME || '';
  const fromCache = (dir: string, test: (d: string) => string): string | null => {
    if (!existsSync(dir)) return null;
    for (const d of readdirSync(dir).sort().reverse()) { const p = test(join(dir, d)); if (p && existsSync(p)) return p; }
    return null;
  };
  return fromCache(join(home, 'Library/Caches/ms-playwright'), (d) => join(d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'))
    || fromCache(join(home, 'Library/Caches/ms-playwright'), (d) => join(d, 'chrome-headless-shell-mac-x64/chrome-headless-shell'))
    || fromCache(join(home, '.cache/ms-playwright'), (d) => join(d, 'chrome-headless-shell-linux64/chrome-headless-shell'))
    || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
}

export interface Browser {
  send(method: string, params?: object): Promise<any>;
  evalJs(expression: string): Promise<any>;
  /** Navigate and wait until `ready` (a JS expression) is true. */
  open(url: string, ready: string, timeoutMs?: number): Promise<void>;
  screenshot(): Promise<Buffer>;
  errors: string[];
  close(): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function launch(width: number, height: number): Promise<Browser> {
  const chrome = findChrome();
  if (!chrome) throw new Error('No Chrome found. Set CHROME=/path/to/chrome (or `npx playwright install chromium-headless-shell`).');
  if (!(width > 0 && height > 0)) throw new Error(`Bad viewport size ${width}x${height}.`);
  const profile = mkdtempSync(join(tmpdir(), 'resin-chrome-'));
  // Port 0 lets Chrome pick a free port and write it to DevToolsActivePort, so two
  // exports running at once never attach to each other's browser.
  const proc = spawn(chrome, ['--remote-debugging-port=0', '--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
    `--window-size=${width},${height}`, '--hide-scrollbars', '--force-device-scale-factor=1', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let spawnError: Error | null = null;
  proc.on('error', (e) => { spawnError = e; });
  const close = () => { try { proc.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
  try {
    return await connect(proc.pid, profile, width, height, () => spawnError, close);
  } catch (e) {
    close();
    throw e;
  }
}

async function connect(pid: number | undefined, profile: string, width: number, height: number, spawnError: () => Error | null, close: () => void): Promise<Browser> {
  let port = 0;
  for (let i = 0; i < 100 && !port; i++) {
    if (spawnError()) throw new Error(`Chrome failed to start: ${spawnError()!.message}`);
    try { port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch {}
    if (!port) await sleep(100);
  }
  if (!port || pid === undefined) throw new Error('Chrome did not start.');

  interface Target { type: string; webSocketDebuggerUrl: string }
  let list: Target[] = [];
  for (let i = 0; i < 60 && !list.length; i++) { try { list = ((await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Target[]).filter((t) => t.type === 'page'); } catch {} if (!list.length) await sleep(200); }
  if (!list.length) throw new Error('Chrome did not open a page.');
  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('Could not connect to Chrome.')); });
  type Reply = { id?: number; method?: string; params?: any; result?: any; error?: { message: string } };
  let id = 0; const pending = new Map<number, (d: Reply) => void>(); const errors: string[] = [];
  // If Chrome dies mid-export, fail every waiting call instead of hanging.
  ws.onclose = () => { for (const cb of pending.values()) cb({ error: { message: 'Chrome connection closed' } }); pending.clear(); };
  ws.onmessage = (m: MessageEvent<string>) => {
    const d: Reply = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)!(d); pending.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' '));
  };
  const send = (method: string, params: object = {}, timeoutMs = 120000): Promise<any> => new Promise((res, rej) => {
    const i = ++id;
    const timer = setTimeout(() => { pending.delete(i); rej(new Error(`${method}: no reply in ${timeoutMs / 1000}s`)); }, timeoutMs);
    pending.set(i, (d) => { clearTimeout(timer); if (d.error) rej(new Error(`${method}: ${d.error.message}`)); else res(d.result); });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evalJs = async (expression: string): Promise<any> => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  return {
    send, evalJs, errors,
    async open(url, ready, timeoutMs = 20000) {
      await send('Page.navigate', { url });
      for (const t0 = Date.now(); Date.now() - t0 < timeoutMs;) {
        await sleep(150);
        try { if (await evalJs(`Boolean(${ready}) && document.readyState === "complete"`)) { await sleep(300); return; } } catch {}
      }
      throw new Error(`Page never became ready (${ready}). ${errors.join('\n')}`);
    },
    async screenshot() { const { data } = await send('Page.captureScreenshot', { format: 'png' }); return Buffer.from(data, 'base64'); },
    close() { try { ws.close(); } catch {} close(); },
  };
}
