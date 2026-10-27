// 打开 B 站登录页 → 截图二维码 → 轮询等待扫码登录
// 用法: node bili-login.mjs [等待秒数]
const PORT = Number(process.env.CDP_PORT || 9228);
const BASE = `http://127.0.0.1:${PORT}`;
const WAIT = Number(process.argv[2] || 150);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ver = await (await fetch(`${BASE}/json/version`)).json();
let target;
try {
  const r = await fetch(`${BASE}/json/new?${encodeURIComponent("https://passport.bilibili.com/login")}`, { method: "PUT" });
  target = await r.json();
} catch (e) {
  console.log("无法开新标签页");
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
});
await new Promise((r) => ws.addEventListener("open", r));
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++id;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  return r?.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "https://passport.bilibili.com/login" });
await sleep(4000);

const fs = await import("node:fs/promises");
const shot = await send("Page.captureScreenshot", { format: "png" });
await fs.writeFile(new URL("./bili-login.png", import.meta.url), Buffer.from(shot.data, "base64"));
console.log("二维码已截图: tools/bili-login.png");

const nav = `fetch('https://api.bilibili.com/x/web-interface/nav',{credentials:'include'}).then(r=>r.json())`;
const deadline = Date.now() + WAIT * 1000;
while (Date.now() < deadline) {
  await sleep(2500);
  const data = await evaluate(`(async () => { const n = await (${nav}); return n && n.data ? {login: !!n.data.isLogin, uname: n.data.uname, mid: n.data.mid} : {login:false}; })()`);
  if (data && data.login) {
    console.log(JSON.stringify({ ok: true, ...data }));
    ws.close();
    process.exit(0);
  }
}
console.log(JSON.stringify({ ok: false, reason: "timeout", seconds: WAIT }));
ws.close();
