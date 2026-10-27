// 优雅关闭我们自己那个浏览器实例（走 CDP Browser.close）
// 用法: node close.mjs   （CDP_PORT 可覆盖端口）
const PORT = Number(process.env.CDP_PORT || 9228);

const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
if (!r.ok) {
  console.log("没在跑（端口无响应）");
  process.exit(0);
}
const { webSocketDebuggerUrl } = await r.json();
const ws = new WebSocket(webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener("open", res);
  ws.addEventListener("error", rej);
});
ws.send(JSON.stringify({ id: 1, method: "Browser.close" }));
await new Promise((r) => setTimeout(r, 800));
console.log("已发送关闭指令");
