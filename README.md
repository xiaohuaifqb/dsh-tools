# dsh-tools

给 DeepSeek Harness（DSH）里跑的 agent 用的一小组网页工具：**直接驱动本机一个 Chromium 浏览器**，
不走内置抓取，也不需要任何云端浏览器服务。

写这套东西的原因很朴素：很多页面是脚本渲染的，普通抓取只能拿到一个空壳；而 agent 需要一个
"能看、能点、能截图"的浏览器。与其接一个远端浏览器服务，不如在本机开一个独立配置的 Chrome，
用 CDP 说话。

## 里面有什么

| 文件 | 干什么 |
|---|---|
| `tools/browser-start.ps1` | 用独立配置目录 + 调试端口启动本机 Chromium（默认无头，`-Headful` 可视化） |
| `tools/page.mjs` | 打开 URL，取标题 / 正文 / 链接 / 截图；`--eval` 可在页面里执行 JS |
| `tools/close.mjs` | 走 CDP `Browser.close` 关掉这个实例，不影响日常浏览器 |
| `tools/bili-login.mjs` | 示例：B 站扫码登录，二维码截图 + 轮询等待 |

## 设计取舍

- **独立配置目录**（`.browser/<name>/`）：agent 的 cookie、历史、登录态与使用者本人完全隔离。
- **无头优先**：不弹窗、不抢焦点；需要人操作时再加 `-Headful`。
- **CDP 直连**：只用 Node 内置的 `fetch` + `WebSocket`，没有 playwright/puppeteer 依赖。
- **服务端零依赖**：所有逻辑都在本地脚本里，删掉目录即清空。

## 用法

```powershell
# 1) 起浏览器（Windows 示例；换成你自己的 Chromium 路径即可）
powershell -ExecutionPolicy Bypass -File .\tools\browser-start.ps1

# 2) 读页面
node .\tools\page.mjs "https://example.com/" --max 3000
node .\tools\page.mjs "https://example.com/" --shot shot.png
node .\tools\page.mjs "https://example.com/" --eval "return document.title"
```

`page.mjs` 参数：`--wait` 等加载最长毫秒、`--max` 正文字符上限、`--shot` 截图到文件、
`--keep` 读完不关标签、`--width/--height` 视口、`--nolinks` 不返回链接。

## 踩过的坑（都是真金白银）

1. **合成点击不算用户手势**。`element.click()` 打不开文件选择框，得用
   `Runtime.evaluate` 的 `userGesture: true`，或 `Input.dispatchMouseEvent` 发真实鼠标事件。
2. **标签页会累积**。每次开新页都会留下 target，几十个之后浏览器明显变卡；
   用完 `GET /json/close/{id}` 关掉，或让脚本读完自动关。
3. **Chromium 的崩溃处理器在受限沙箱下会自毁**：`crashpad ... OpenProcess: 拒绝访问`
   然后进程直接退出。要么放宽沙箱，要么接受"启动需要人工批准"这件事。
4. **`--user-data-dir` 一定要显式给**，否则会跟使用者日常浏览器的配置打架。

## 许可

MIT
