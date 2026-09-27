# dsh-llamacpp-bridge

> 把本地 **llama.cpp（llama-server）** 变成 DeepSeek Harness 的一等模型 Provider：进程与路由管理、模型目录同步、按需自动启动、**先停旧再起新**的模型切换，以及侧边栏「llama.cpp 终端输出监控」面板。

[English](README.en.md) | **中文**

![license](https://img.shields.io/badge/license-MIT-green)
![platform](https://img.shields.io/badge/platform-web%20profile-blue)
![dsh](https://img.shields.io/badge/DSH-web%20profile-6f42c1)
![llama.cpp](https://img.shields.io/badge/llama.cpp-llama--server-orange)
![node](https://img.shields.io/badge/node-%3E%3D20-339933)

---

## 这是什么

DeepSeek Harness（DSH）默认使用云端模型。本插件让你把**本机的 llama.cpp** 接入进来：在 DSH 的模型选择器里直接选 `llamacpp` 分组下的本地 GGUF 模型，发消息时自动拉起 `llama-server`，并把视觉投影文件（mmproj）、上下文长度、GPU 层数等一并交代清楚。

插件是标准的 DSH **双包插件**（host + client）：

- **host**（Node ESM）：注册 `llamacpp` 模型路由、管理 `llama-server` 子进程、同步模型目录、提供同源 HTTP/SSE 数据面；
- **client**（浏览器 bundle）：侧边栏入口行 + 自持面板 + 设置页图形引导。

---

## 特性

| 能力 | 说明 |
|---|---|
| **模型路由** | 注册 `llamacpp` provider，与云端 provider 并存；只拥有自己的路由，不干扰其它 provider 的模型订阅 |
| **按需自动启动** | 调用前 `ensure(model)`：服务器没跑就先跑起来，就绪后才走 OpenAI 兼容端口 |
| **先停旧再起新** | 切换模型时**先把先前模型停下来**，再启动目标模型（日志会写明这两步），避免显存里同时挂着两个模型 |
| **两种运行模式** | 单模型直启（`-m <model>`）与 router 模式（`--models-dir` + `/models/load`、`/models/unload` 动态装卸） |
| **目录同步** | 启动全量重扫 + 读取时按目录指纹按需重扫 + `fs.watch` + 兜底轮询；目录稍后才出现也能自愈监听 |
| **mmproj 视觉配对** | 三级配对：手动绑定 → 后缀约定 `<模型名>-mmproj.gguf` → **前缀模糊配对** `mmproj-*.gguf`（按归一化名打分）；配上就自动带 `--mmproj` |
| **终端输出监控面板** | 侧边栏入口行（与任务看板同级）→ 自持面板：实时 SSE 日志、流别标签、时间戳、关键字过滤、清屏、模型切换、刷新 |
| **优雅退出** | 面板按钮走真终端交互：**Ctrl+C（SIGINT 到前台进程组）→ 发送 Y 确认** → 等退出；不直接强杀（详见下文） |
| **图形化引导** | 设置页自动探测 `~/llama.cpp/build/bin` 等位置，列出候选可执行文件与模型目录，也可手动浏览选择 |
| **显示名截断** | 模型显示名超过 **30 字符**自动截断为前 30 字符 + `...`（**id 保持完整**，不影响选择与调用） |

---

## P0–P3 需求覆盖

| 项 | 状态 | 实现位置 |
|---|---|---|
| ① 后端模型切换（非启动脚本全量列表） | ✅ | `model-store` 扫描整个模型目录，与“启动脚本里的列表”解耦 |
| ② Web UI 侧边栏入口（Ollama 风格图标 + 模型切换 + 终端输出） | ✅ | DOM 注入入口行 → 自持面板：模型切换 + SSE 实时日志 |
| ③ 对话开始时自动启动 llama.cpp | ✅ | `adapter.stream()` → `server.ensure()`（真正连接端口前等待就绪） |
| ④ 切换模型前先卸载旧模型 | ✅ | `ensure()`：先 `stop()` 旧模型并确认停止，再启动目标模型 |
| ⑤ 不挂钩其它模型订阅 | ✅ | 仅 `llm.registerAdapter(['llamacpp'], …)` |
| ⑥ 安装即生成模型配置 | ✅ | 自有设置命名空间 `llamacpp-bridge` + 发现命名空间（含模型/投影器配对情况） |
| P1 目录新增模型自动同步 | ✅ | 启动重扫 + 指纹按需重扫 + `fs.watch` + 兜底轮询 |
| P1 mmproj 与模型一同加载 | ✅ | 三级配对 + `--mmproj` 参数 |
| P2 依显存设置上下文长度 | ✅ | `autoContext` + `pickContextLength` 启发式 |
| P3 长上下文提示（会话内询问） | ⚠️ | 上下文长度可在设置页设定；“对话中询问”尚无官方交互缝，未实现 |

行为测试（模拟真实子进程/文件系统）：模型切换顺序、目录增删即时反映、mmproj 配对与 `--mmproj` 参数、Ctrl+C → Y 退出流程、30 字符截断，均已逐项验证。

---

## 环境要求

| 项目 | 要求 |
|---|---|
| DSH | `web` profile。注意：`0.1.7-rc.2` 该版本本身有缺陷——DSH 不会加载插件的客户端 bundle（界面不可见），与本插件无关 |
| Node | ≥ 20 |
| llama.cpp | 提供 `llama-server`（router 模式需较新版本；单模型模式老版本亦可） |
| 平台 | macOS / Linux（Apple Silicon 已验证）；Windows 未验证 |

---

## 安装

### 方式 A：从 Release 安装（推荐）

到 Releases 页面下载 `dsh-llamacpp-bridge-<版本>.tgz`，然后：

```bash
dsh plugin --profile web add ./dsh-llamacpp-bridge-1.5.0.tgz
```

### 方式 B：从源码构建

> `dist/` 已随仓库提供，只想用的话 clone 后 `npm pack` 即可，不必构建。

需要重新构建时（`@deepseek-ai/*` 类型包不在 npm registry 上，随 DSH 本体提供，由脚本链接）：

```bash
git clone https://github.com/b8yg7vjstj-ctrl/dsh-llamacpp-bridge.git
cd dsh-llamacpp-bridge

npm install          # 1) 先装 devDependencies
npm run link:dsh     # 2) 再链接本机 DSH 的类型包（顺序不可颠倒：npm install 会清掉未声明的链接）
npm run check        # 3) 类型检查 + 构建
npm pack             # 4) 产出 dsh-llamacpp-bridge-<版本>.tgz

dsh plugin --profile web add ./dsh-llamacpp-bridge-*.tgz
```

脚本探测不到 DSH 位置时可手动指定：

```bash
DSH_INSTALL=/opt/homebrew/lib/node_modules/@deepseek-ai/dsh npm run link:dsh
```

### 安装后必做

1. **重启 host**：`dsh plugin add` 只改磁盘，运行中的 host 不会热加载新插件
   ```bash
   lsof -nP -iTCP:3080 -sTCP:LISTEN   # 取 PID
   kill <PID>
   cd ~ && dsh web
   ```
2. **浏览器强制刷新**：`Cmd/Ctrl + Shift + R`（旧页面缓存会继续请求已被替换的 bundle，表现为 `bundle script ... failed to load`）

> `dsh plugin add` 会**自动维护** `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles`，无需手工添加。卸载：`dsh plugin --profile web remove dsh-llamacpp-bridge`。

---

## 快速开始

1. 按上面步骤安装并重启，打开 DSH。
2. 侧边栏「新会话」下方出现入口行 **「llama.cpp 终端输出监控」**（线条终端图标，紧跟任务看板之后）。
3. 首次使用进入 **设置 → llama.cpp**：确认自动探测到的 `llama-server` 可执行文件与模型目录（探测不到就手动选）。
4. 在模型选择器里选 `llamacpp` 分组下的本地模型并直接发消息——插件会自动启动服务器，就绪后开始推理。
5. 点侧边栏入口行打开面板：看实时日志、切换模型、点「刷新」重扫目录、点「优雅退出」走 Ctrl+C → Y 流程。

---

## 模型切换语义（重要）

切换模型时**不会**在旧模型还在跑的时候直接调用 OpenAI 端口。实际顺序：

```
[manager] 切换模型：先停止先前模型 <旧模型>（pid <pid>）
[manager] 先前模型已停止，开始启动目标模型 <新模型>
…（服务器就绪）…
[manager] ready on http://127.0.0.1:8080 (single)
```

即 **先停旧、再起新**，然后才发起请求。router 模式下用 `/models/unload` + `/models/load` 完成等价流程。

---

## 配置

### 设置页（图形化引导）

**设置 → llama.cpp** 提供：

- 可执行文件候选（自动探测 `~/llama.cpp/build/bin/release`、`build/bin`、`build`、`bin`、`~/llama.cpp` 及 `PATH`），可手动选择或浏览；
- 模型目录候选（含 `.gguf` 计数），可手动选择或浏览；
- **③ 视觉投影文件（mmproj）**：列出目录内所有投影文件及其配对结果，未配对的可在该行填入目标模型 id 完成绑定；
- 高级项：端口、运行策略、GPU 层数、上下文长度/自动推断、mmproj 后缀、附加参数、启动超时、调试日志。

### 设置命名空间 `llamacpp-bridge`

| 字段 | 默认 | 说明 |
|---|---|---|
| `displayName` | `Local llama.cpp (bridge)` | provider 显示名 |
| `executable` | `''` | `llama-server` 路径；留空 = 自动探测 |
| `modelsDir` | `''` | 模型目录；留空 = 自动探测 |
| `host` / `port` | `127.0.0.1` / `8080` | 服务监听地址与端口 |
| `strategy` | `auto` | `auto` / `single` / `router` |
| `contextLength` | — | `-c` 上下文长度 |
| `autoContext` | `false` | 按显存自动推断上下文长度 |
| `gpuLayers` | `-1` | `-ngl`，`-1` = 交给 llama.cpp |
| `mmprojSuffix` | `-mmproj.gguf` | 后缀约定式投影文件名 |
| `mmprojOverrides` | `{}` | 手动绑定 `{ 模型id: 投影文件名 }`（优先级最高） |
| `additionalArgs` | `[]` | 追加给 `llama-server` 的参数 |
| `startTimeoutMs` | `120000` | 启动就绪超时 |
| `debug` | `false` | 打印实际执行参数等调试信息 |

### 发现命名空间 `llamacpp-bridge-discovery`（只读）

启动探测结果，供设置页展示：`executables[]`、`modelsDirs[]`、`models[]`、`projectors[]`（含 `file` 与已配对的 `modelId`）。

---

## 侧边栏面板与数据面

入口行由 DOM 注入（锚定侧边栏「新会话」区域，`MutationObserver` 自愈），点击开关**自持面板**（`createRoot` 挂进会话列；激活时隐藏会话列其它子元素以避免重叠）。返回方式有三条：面板头部「**← 返回会话**」、点侧边栏任一身份行、按 **Esc**；与其它插件面板通过 `dsh-panel-activate` 事件互斥。

面板内容：插件作用回显 → 状态行（phase / 模型 / pid / 上下文）→ 模型切换（带 👁 视觉标记，名称超 30 字符截断）→「刷新」→ 工具栏（优雅退出、清屏、跟随、过滤）→ 终端输出（时间戳 + 流别标签 `stdout` / `stderr` / `system` / `terminal`）。

数据面（同源 HTTP；栅栏：回环套接字 + 回环 Host + 同源标记）：

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/llamacpp-bridge/state` | GET | 快照：provider、插件作用、状态、模型清单、日志尾部 |
| `/api/llamacpp-bridge/events` | GET | SSE：`snapshot` 首帧 + `log` 增量 + `status` 差分 + 15s 心跳 |
| `/api/llamacpp-bridge/action` | POST | `{"action":"graceful-stop"}` → `{ok, steps}` |

> 为什么不用 cordis 事件把 host 日志推给客户端：host→client 的 `remote-event` 帧是**白名单制**（由 `dsh-api-remotes` 拥有），自定义事件发不出去。因此改用官方 `webServer.register` 的 SSE 通道。

---

## 优雅退出（Ctrl+C → Y）

面板上的「优雅退出（Ctrl+C → Y）」**不是强杀**：

1. **启动形态**：优先 `ctx.subprocess.spawnTerminal` 分配**真实 PTY**（日志：`已分配终端（支持 Ctrl+C / Y 交互）`）；终端不可用时回退管道模式（`stdin: 'pipe'`）。
2. **Ctrl+C**：终端模式 `signalForeground('SIGINT')`——把 SIGINT 送到**前台进程组**，与在终端按 Ctrl+C 等价；管道模式 `process.kill(pid, 'SIGINT')`（仍是 SIGINT，**不是 SIGKILL**）。
3. **Y 确认**：等 800ms 让服务器打印确认提示，再写 `Y\n`（终端 `write()` / 管道 stdin）。
4. **升级顺序**：SIGINT → Y → 等 8s → 再补一次 SIGINT → 等 5s → **最后才**回退 `terminate()`（SIGTERM → grace → SIGKILL）。全程不直接强杀。
5. 服务器打印的确认提示会原样进入面板日志（例如 `Press Y to confirm exit`）。

实测调用序列：`spawnTerminal → signalForeground:SIGINT → write:"Y\n"`，步骤回显 `["已发送 Ctrl+C","已发送 Y 确认","确认后已退出"]`。

---

## 架构

| 文件 | 职责 |
|---|---|
| `src/host/index.ts` | 插件入口：环境探测、设置注册、目录仓库、服务器管理器、provider 注册、路由注册 |
| `src/host/adapter.ts` | `llamacpp` 路由的 `LlmAdapter`：调用前 `ensure()`、DSH ↔ OpenAI SSE 双向翻译 |
| `src/host/llama-server.ts` | `llama-server` 进程管理：终端/管道双模式、单模型与 router、就绪探测、优雅退出 |
| `src/host/model-store.ts` | 目录扫描、mmproj 三级配对、指纹按需重扫、watcher 自愈 |
| `src/host/discover.ts` | 可执行文件/模型目录探测，投影文件配对结果上报 |
| `src/host/terminal-routes.ts` | 同源 HTTP/SSE 数据面（`state` / `events` / `action`） |
| `src/host/log-hub.ts` | 环形日志总线（序号、时间戳、流别、订阅、增量读取） |
| `src/host/config.ts` | 配置默认值、设置 schema、发现 schema |
| `src/client/index.tsx` | 客户端入口：服务注入、设置页注册、挂载入口行与面板 |
| `src/client/terminal-mount.ts` | DOM 注入入口行 + 自持面板（开合、返回路径、互斥、自愈） |
| `src/client/terminal-panel.tsx` | 面板 UI：状态、模型切换、日志流、优雅退出、过滤 |
| `src/client/setup.tsx` | 设置页：探测候选、目录浏览、mmproj 绑定、高级项 |
| `src/client/ollama-icon.ts` | 线条终端图标（内联 SVG） |
| `scripts/wrap-client.mjs` | 把 esbuild 的 CJS 产物包成 `window.__ModuleLoader__.load({...})` |
| `scripts/link-dsh-types.mjs` | 从本机 DSH 安装链接类型包，供源码构建 |

---

## 关键实现说明（踩坑记录）

以下都是实际踩过的坑，改代码前请先读：

1. **cordis 服务注入的两个相反陷阱**
   - 访问未在 `inject` 声明的服务 → 抛 `cannot get property "X" without inject`；
   - 把**当前作用域不可用**的服务写进导出的 `inject` → fiber **永久等待**，插件**静默不加载**（没有任何报错）。
   - 正确做法：核心服务放导出的 `inject`，其余用 `ctx.inject([...], cb)` 局部等待。
2. **`list` 类座位必须带 `id`**（`sidebar.footer.action` / `settings.section` / `conversation.view`），否则报 `list slot ... requires options.id`。
3. **不要再回退到「DOM 覆盖层 + CSS 隐藏原生会话」方案**：会造成控件重叠与「切不回会话」。
4. **原生 `conversation.view` 标签不适合当入口**：会话壳只在「已打开会话且标签数 > 1」时渲染标签，在首页/hero 点击会**找不到目标**（表现为「点不动」）。故改为入口行自持面板。
5. **`ctx.sessions` 是 Service，快照在 `ctx.sessions.list`**（传 Service 会 `getSnapshot is not a function`，座位被错误边界替换成崩溃提示）。
6. **客户端 bundle 契约**：必须 `window.__ModuleLoader__.load({ id: '<包名>', factory })`；react 是 external，classic JSX 需 `import * as React`（默认导入编译成 `require('react').default` = undefined）。
7. **esbuild 参数**：用 `--jsx=transform`（`--jsx=classic` 在 0.24 报错），且必须 `--external:react-dom/client`。
8. **类型跨版本**：插件只对 DSH 实际用到的接口做**最小结构类型**（消息块、设置作用域、子进程句柄 pid 等），避免 DSH 版本演进导致编译中断。
9. **pnpm 构建门禁**：`ERR_PNPM_IGNORED_BUILDS`（fsevents/sharp 等）会阻断任何 `dsh plugin add`，需在 profile 的 `pnpm-workspace.yaml` 里用 `allowBuilds` 放行。
10. **DSH 单实例**：再起一个 `dsh web` 会报 `task-board ledger is already owned by process <pid>`。

---

## 兼容性

- **环境**：DSH `web` profile + macOS（Apple Silicon）+ `llama.cpp` 的 `llama-server`（单模型与 router 两种模式）。
- **已知 DSH 侧问题**：`0.1.7-rc.2` 下 DSH 不加载插件的客户端 bundle（`/plugins/<包名>/client.js` 返回 404，宿主日志无插件侧报错），因此界面不可见；同一个包里 host 半包工作正常（路由可用）。请使用无此缺陷的 DSH 版本。
- **类型层**：对 DSH 接口采用最小结构类型，可在 DSH 类型修订之间继续编译；类型包由 `npm run link:dsh` 从本机安装链接。
- **运行期**：host 入口必须能在 DSH profile 内解析（用 `dsh plugin add` 安装即可满足）。
- **Windows**：未验证；终端原语与信号语义不同（`gracefulStop` 会自动回退管道模式）。

---

## 故障排查

| 现象 | 处理 |
|---|---|
| 0.1.7-rc.2 上完全看不到入口/设置页 | 该版本 DSH 未加载客户端 bundle（`/plugins/dsh-llamacpp-bridge/client.js` 为 404），属 DSH 侧问题，非本插件报错；换用可用版本 |
| 侧边栏没有入口行 | 确认插件已安装（`dsh plugin add` 已自动写入 `bundles`）→ **重启 host** → 浏览器 `Cmd/Ctrl+Shift+R` |
| `bundle script /plugins/... failed to load` | 旧页面缓存：强制刷新，或 `Cmd+Q` 整退出后重开 |
| 入口行点了没反应 | 打开 F12 Console，找 `[llamacpp-bridge]` 或 `slot entry crashed` 开头的行 |
| 模型列表不随目录变化 | 面板点「刷新」；host 每次启动都会重扫（日志 `scanned N model(s) ... (startup rescan)`），运行中靠 `fs.watch` + 30s 兜底轮询 |
| 视觉模型不生效 | 看 host 日志的 `vision: <模型> ← <投影文件>` 与 `unmatched mmproj: ...`；未配对的到 设置 → llama.cpp →「③ 视觉投影文件」手动绑定 |
| 启动即失败 | 日志会打印实际执行参数与错误；确认 `executable` / `modelsDir` 正确（设置页可浏览选择） |
| 端口被占用 | 改 `port`，或先停掉占用 8080 的进程 |
| `ERR_PNPM_IGNORED_BUILDS` | 在 `~/.dsh/profiles/web/pnpm-workspace.yaml` 添加 `allowBuilds: { fsevents: true, sharp: true }` |
| `ledger is already owned by process ...` | DSH 单实例限制：先关掉另一个 `dsh web` |

---

## 开发

```bash
npm install          # devDependencies
npm run link:dsh     # 链接本机 DSH 类型包（必须在 npm install 之后）
npm run typecheck    # host + client 类型检查
npm run build        # 构建 dist/（host 走 tsc，client 走 esbuild + 包装脚本）
npm run check        # typecheck + build
npm pack             # 产出可安装的 tgz
```

目录结构：

```
src/
  shared.ts              共享常量与工具（provider id、路由前缀、名称截断等）
  host/                  Node ESM 侧（provider、进程、目录、HTTP/SSE）
  client/                浏览器 bundle 侧（入口行、面板、设置页）
scripts/
  wrap-client.mjs        esbuild 产物 → __ModuleLoader__ 包装
  link-dsh-types.mjs     从本机 DSH 安装链接类型包
dist/                    构建产物（仓库内已包含，便于直接安装）
```

---

## 许可证

[MIT](LICENSE) © 2026 b8yg7vjstj-ctrl
