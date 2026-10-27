// 极简 CDP 客户端：用星愿浏览器（Chromium）读网页正文。
// 用法: node page.mjs <url> [--wait 8000] [--max 20000] [--shot out.png] [--keep]
// 依赖：浏览器已用 --remote-debugging-port 启动（见 browser-start.ps1）。

const PORT = Number(process.env.CDP_PORT || 9228);
const BASE = `http://127.0.0.1:${PORT}`;

const argv = process.argv.slice(2);
const url = argv.find((a) => !a.startsWith("--") && /^https?:|^about:|^data:/.test(a));
if (!url) {
  console.error("用法: node page.mjs <url> [--wait 8000] [--max 20000] [--shot out.png] [--keep]");
  process.exit(2);
}
const flag = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
};
const WAIT = Number(flag("--wait", 10000));
const MAX = Number(flag("--max", 20000));
const SHOT = flag("--shot", null);
const KEEP = argv.includes("--keep");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function version() {
  const r = await fetch(`${BASE}/json/version`);
  if (!r.ok) throw new Error(`CDP 无响应: ${r.status}`);
  return r.json();
}

async function newTarget(u) {
  // Chrome 111+ 要求 PUT；老版本用 GET
  for (const method of ["PUT", "GET"]) {
    const r = await fetch(`${BASE}/json/new?${encodeURIComponent(u)}`, { method });
    if (r.ok) return r.json();
  }
  throw new Error("无法创建标签页");
}

async function closeTarget(id) {
  try {
    await fetch(`${BASE}/json/close/${id}`);
  } catch {}
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener("open", () => res());
      this.ws.addEventListener("error", (e) => rej(new Error("WebSocket 连接失败")));
    });
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        const arr = this.listeners.get(msg.method) || [];
        this.listeners.delete(msg.method);
        arr.forEach((fn) => fn(msg.params));
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`超时: ${method}`));
        }
      }, 30000);
    });
  }
  once(event, timeoutMs = 15000) {
    return new Promise((resolve) => {
      const arr = this.listeners.get(event) || [];
      arr.push(resolve);
      this.listeners.set(event, arr);
      setTimeout(() => resolve(null), timeoutMs);
    });
  }
  close() {
    try { this.ws.close(); } catch {}
  }
}

const t0 = Date.now();
const info = await version();
const target = await newTarget("about:blank");
const cdp = new Cdp(target.webSocketDebuggerUrl);
await cdp.ready;

await cdp.send("Page.enable");
await cdp.send("Runtime.enable");

const W = Number(flag("--width", 0));
const H = Number(flag("--height", 0));
if (W && H) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: W,
    height: H,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

const loaded = cdp.once("Page.loadEventFired", WAIT);
const nav = await cdp.send("Page.navigate", { url });
if (nav.errorText && nav.errorText !== "net::ERR_ABORTED") {
  throw new Error(`导航失败: ${nav.errorText}`);
}
await loaded;
await sleep(1200); // 给 SPA 一点渲染时间

const evalJs = async (expr) => {
  const r = await cdp.send("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
    userGesture: argv.includes('--gesture'),
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || "页面脚本出错");
  return r.result.value;
};

const title = await evalJs("document.title");
const EVAL = flag("--eval", null);
const evalResult = EVAL ? await evalJs(`(async () => { ${EVAL} })()`) : undefined;
const text = await evalJs(`document.body ? document.body.innerText : ""`);
const links = argv.includes("--nolinks")
  ? []
  : await evalJs(
      `Array.from(document.querySelectorAll('a[href]')).slice(0, 500).map(a => ({t:(a.innerText||'').trim().slice(0,80), h:a.href}))`
    );

const out = {
  browser: info.Browser,
  url,
  finalUrl: await evalJs("location.href"),
  title,
  chars: (text || "").length,
  elapsedMs: Date.now() - t0,
  text: (text || "").slice(0, MAX),
  links: (links || []).filter((l) => l.t),
};
if (evalResult !== undefined) out.eval = evalResult;

if (SHOT) {
  const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  const fs = await import("node:fs/promises");
  await fs.writeFile(SHOT, Buffer.from(shot.data, "base64"));
  out.screenshot = SHOT;
}

if (!KEEP) await closeTarget(target.id);
cdp.close();
console.log(JSON.stringify(out, null, 2));

