# dsh-llamacpp-bridge

> 让你电脑里的 llama.cpp，像云端模型一样出现在 DSH 的模型列表里。

[English](README.en.md) | **中文**

![license](https://img.shields.io/badge/license-MIT-green)
![platform](https://img.shields.io/badge/platform-DSH%20web%20profile-blue)
![llama.cpp](https://img.shields.io/badge/llama.cpp-llama--server-orange)
![node](https://img.shields.io/badge/node-%3E%3D20-339933)

---

## 先说它在解决什么

如果本机已经有一份 llama.cpp 和几个 GGUF 模型，平时用起来大概是这样的：开一个终端，敲一长串参数，等模型慢慢加载进显存，然后回到另一个界面里把接口地址和模型名对一遍；想换个模型，上面这套从头再来；模型文件夹里加了一个，还得记得把列表也改一下。

这个插件就是把这些杂事接过来。模型列表直接从你的模型目录里读；你选好模型发出第一条消息时，它负责把 `llama-server` 拉起来，并等到真正就绪才让请求出去；要换模型，它先把旧的停下来，再起新的；跑起来的日志、当前状态、用了哪个模型，在侧边栏的一个面板里都能看到。

你要做的只有一件事：把 GGUF 放进文件夹。

## 用起来大概是这样

装好、重启 DSH 之后，侧边栏「新会话」下面会多出一行 **「llama.cpp 终端输出监控」**——线条画的终端图标，和任务看板排在同一个位置。

第一次用先打开 **设置 → llama.cpp**。它会自己去常见的地方找 `llama-server` 和模型目录（比如 `~/llama.cpp/build/bin`、`~/llama.cpp/models`），找到了就列成候选让你确认，没找到也可以用浏览文件夹的方式手动指定。这一步只需要做一次。

然后回到对话，在模型选择器里挑一个本地模型。你按下发送的那一刻，插件会在后台把服务器启动起来；等它就绪之后请求才真正发出去，所以在 DSH 里用起来和云端模型没什么区别。

想看它在干什么，点侧边栏那行入口，面板就展开了：上面是当前状态（模型、pid、上下文长度），中间是一排模型按钮（带视觉投影的会标一个 👁），下面是滚动的终端输出——`llama-server` 自己打印的每一行都在里面，带时间戳和来源标签。想换模型，点另一个按钮就行。

看完点面板左上角的 **「← 返回会话」** 就回去了；点侧边栏任意一个会话、或者按 Esc，效果一样。

## 装它

前提是一份 DSH（`web` profile）、一份带 `llama-server` 的 llama.cpp，以及 Node 20 以上。

### 从 Release 装（最省事）

到 Releases 页面下载 `dsh-llamacpp-bridge-1.5.0.tgz`，然后：

```bash
dsh plugin --profile web add ./dsh-llamacpp-bridge-1.5.0.tgz
```

### 从源码装

仓库里的 `dist/` 是构建好的产物，只想用的话克隆下来直接打包就行：

```bash
git clone https://github.com/b8yg7vjstj-ctrl/dsh-llamacpp-bridge.git
cd dsh-llamacpp-bridge
npm pack
dsh plugin --profile web add ./dsh-llamacpp-bridge-1.5.0.tgz
```

想自己重新构建，就多两步。这里有个小前提：`@deepseek-ai/*` 这些类型包并不在 npm 上，它们跟着 DSH 本体一起安装，所以要先让脚本把它们链接到项目里来——**顺序不能颠倒**，因为 `npm install` 会把没有在 `package.json` 里声明的东西清掉：

```bash
npm install          # 1) 先装 devDependencies
npm run link:dsh     # 2) 再把本机 DSH 的类型包链接进来
npm run check        # 3) 类型检查 + 构建
npm pack             # 4) 得到可安装的 tgz
```

脚本找不到 DSH 的位置时，可以手动告诉它：

```bash
DSH_INSTALL=/opt/homebrew/lib/node_modules/@deepseek-ai/dsh npm run link:dsh
```

### 装完之后有两步不能省

第一，**重启 host**。`dsh plugin add` 只是把文件放到了磁盘上，正在运行的那个 DSH 不会自己把新插件加载进来：

```bash
lsof -nP -iTCP:3080 -sTCP:LISTEN   # 看一眼 PID
kill <PID>
cd ~ && dsh web
```

第二，**在浏览器里硬刷新**（`Cmd/Ctrl + Shift + R`）。如果页面还停在旧版本，它会继续去要一个已经被替换掉的脚本，控制台里就会冒出 `bundle script ... failed to load` 之类的报错——那不是插件坏了，刷新一下就好。

顺带一提，`dsh plugin add` 会顺手把插件登记进 `dsh.profile.bundles`，不需要手动改 `package.json`；卸载就是反过来一条命令：

```bash
dsh plugin --profile web remove dsh-llamacpp-bridge
```

## 它到底管着哪些事

**把服务器管起来。** 它支持两种跑法：一种一次只服务一个模型（`-m <模型>`），另一种是 router 模式（`--models-dir` 配合 `/models/load`、`/models/unload`，换模型不用重启进程）。用哪种由设置里的 `strategy` 决定，默认让它自己判断。启动后它会轮询 HTTP 端口，日志里出现 `ready on http://...` 才算就绪，请求才会往下走。

**换模型先停旧的。** 这一点是刻意做成这样的：切换时它先停掉当前模型、确认确实停了，再去启动目标模型，两步都会写进日志。这样显存里不会同时挂着两个模型。

**让模型列表跟着文件夹走。** 每次启动都会把整个目录重扫一遍（日志里那句 `scanned N model(s) ... (startup rescan)`）；之后的每次读取会比对目录的修改时间和条目数，变了就重扫，没变就直接用上次结果。磁盘上真发生变动时会通过 `fs.watch` 感知，另外还有 30 秒一次的兜底轮询，防止某些文件系统漏掉事件。如果目录一开始还不存在（比如外置盘还没挂上），它会每 5 秒重试一次，出现了就自动接上。面板里另有一个「刷新」按钮，随时可以手动重扫。

**顺手把视觉投影文件配上。** 带视觉能力的 GGUF 需要一个 mmproj 文件才能看图，插件按三级去配：你在设置页手动绑定的最优先；其次是 `<模型名>-mmproj.gguf` 这种后缀命名；最后是 `mmproj-xxx.gguf` 这种前缀命名——它会先把两边的名字归一化（去掉量化精度、`it`、`instruct` 这类跟「是哪个模型」无关的词），再做包含匹配并打分，挑最像的那个。配上之后，启动参数里就会自动带上 `--mmproj`。信息太少、没法判断的（比如目录里只有一个 `mmproj-F32.gguf`），它不会硬猜，而是在启动日志里写一句 `unmatched mmproj: ...`，提醒你去设置页手动指定。

**名字太长就截短显示。** 模型显示名超过 30 个字符时，列表里会显示成前 30 个字符加 `...`；真正的 id 不动，所以选择和调用都不受影响。鼠标停在按钮上能看到完整名字。

## 设置里那些项

**设置 → llama.cpp** 就是那块图形化界面：挑可执行文件、挑模型目录（都支持浏览文件夹）、给 mmproj 配绑定，以及改下面这些参数。保存后热生效，多数项不需要重启 DSH。

| 字段 | 默认值 | 意思是 |
|---|---|---|
| `displayName` | `Local llama.cpp (bridge)` | 模型选择器里显示的名字 |
| `executable` | 空 | `llama-server` 的路径，留空就自动探测 |
| `modelsDir` | 空 | 模型目录，留空就自动探测 |
| `host` / `port` | `127.0.0.1` / `8080` | 服务监听的地址和端口 |
| `strategy` | `auto` | `auto` / `single` / `router` |
| `contextLength` | — | 传给 `-c` 的上下文长度 |
| `autoContext` | `false` | 按可用显存推算上下文长度 |
| `gpuLayers` | `-1` | 传给 `-ngl`，`-1` 表示交给 llama.cpp 决定 |
| `mmprojSuffix` | `-mmproj.gguf` | 后缀式投影文件的命名约定 |
| `mmprojOverrides` | 空 | 手动绑定，形如 `{ 模型id: 投影文件名 }` |
| `additionalArgs` | 空 | 想额外塞给 `llama-server` 的参数 |
| `startTimeoutMs` | `120000` | 等就绪的最长时间 |
| `debug` | `false` | 把实际执行的命令行之类也打进日志 |

另外还有一个只读的「发现」命名空间 `llamacpp-bridge-discovery`，里面装着启动时探测到的可执行文件、模型目录、模型清单和投影文件配对情况——设置页上显示的就是这些内容。

## 侧边栏那个面板

入口行不是注册在 DSH 的某个座位上的，而是直接注入到侧边栏「新会话」附近（用 `MutationObserver` 盯着，被别的插件挪动或重渲染之后会自己补回去），所以它和任务看板是同级并列的。

点开之后展开的是一个独立面板：它挂在会话列上，激活时会把会话列里原本的内容暂时藏起来，免得两块内容叠在一起。面板上依次是——插件作用的回显（一句话说明这个插件干嘛用）、当前状态、模型切换按钮、刷新按钮，以及终端输出区（带时间戳和 `stdout` / `stderr` / `system` / `terminal` 标签，支持关键字过滤、清屏、自动跟随）。

面板和前端之间走的是同源 HTTP，没有用 DSH 内部的事件通道：

| 地址 | 方法 | 用途 |
|---|---|---|
| `/api/llamacpp-bridge/state` | GET | 取一份当前快照：provider、插件作用、状态、模型清单、日志尾部 |
| `/api/llamacpp-bridge/events` | GET | SSE 实时流：首帧快照，之后是日志增量、状态差分，15 秒一次心跳 |
| `/api/llamacpp-bridge/action` | POST | 目前只有 `{"action":"graceful-stop"}`，返回执行步骤 |

这几个地址都做了同源栅栏（要求回环套接字、回环 Host、同源标记同时成立），外部页面拿不到。

## 「优雅退出」到底做了什么

面板上那个按钮**不是强杀**，它模拟的是你在终端里按 Ctrl+C、再敲一个 Y 的整个过程。

插件启动 `llama-server` 时会尽量申请一个真正的终端（PTY），日志里会写一句 `已分配终端（支持 Ctrl+C / Y 交互）`。点下按钮之后，它先把 SIGINT 送到前台进程组——这和你在终端按 Ctrl+C 是同一件事；然后等 800 毫秒，让服务器把确认提示打出来，再把 `Y` 写进终端输入。接下来就是等它退出。

没退才会往下升级：再补一次 Ctrl+C，再等 5 秒，最后一步才动用常规的 `terminate()`（先 SIGTERM，过了宽限期才是 SIGKILL）。整个流程不会一上来就强杀。申请不到终端的场合会退回管道模式，流程一样，只是信号改从进程号发、`Y` 写进 stdin。

服务器自己打印的提示（比如 `Press Y to confirm exit`）会原样出现在面板日志里，所以整个过程你都看得见。

## 它是怎么拼起来的

这是一个标准的 DSH 双包插件：`package.json` 里的 `.` 指向 host 侧的 Node 入口，`./client` 指向浏览器里跑的那份 bundle，`cordis.patch.yml` 负责把它挂进 DSH 的组合。两边各管各的：

- `src/host/index.ts` —— 入口：探测环境、注册设置、建目录仓库、建进程管理器、注册 provider 路由和数据面
- `src/host/adapter.ts` —— `llamacpp` 这条路由的适配器：调用前先 `ensure()`，以及 DSH 消息/流与 OpenAI 兼容 SSE 之间的互相翻译
- `src/host/llama-server.ts` —— 进程管理：终端/管道两种启动方式、单模型与 router、就绪探测、优雅退出
- `src/host/model-store.ts` —— 目录扫描、mmproj 三级配对、按指纹重扫、监听自愈
- `src/host/discover.ts` —— 启动时寻找可执行文件和模型目录，报告投影文件配对情况
- `src/host/terminal-routes.ts` —— 上面那三个 HTTP/SSE 地址
- `src/host/log-hub.ts` —— 环形日志缓冲，供面板取增量
- `src/host/config.ts` —— 默认值、设置 schema、发现 schema
- `src/client/index.tsx` —— 客户端入口：注入服务、注册设置页、挂载入口行与面板
- `src/client/terminal-mount.ts` —— 注入入口行和自持面板（开合、返回路径、互斥、自愈都在这里）
- `src/client/terminal-panel.tsx` —— 面板界面与模型切换
- `src/client/setup.tsx` —— 设置页
- `scripts/wrap-client.mjs` —— 把 esbuild 的输出包成 DSH 模块加载器认识的样子
- `scripts/link-dsh-types.mjs` —— 从本机 DSH 安装里链接类型包

## 给后来改代码的人

下面这些是实际踩过、并且真能让人浪费一整天的地方：

1. **cordis 的服务注入有两种相反的坑。** 访问一个没在 `inject` 里声明的服务，会直接抛 `cannot get property "X" without inject`；但如果把「当前作用域里还不存在」的服务写进导出的 `inject`，这个 fiber 就会一直等下去——插件**静默地不加载，什么错都不报**。稳妥的写法是：核心服务放导出的 `inject`，其余用 `ctx.inject([...], cb)` 局部等待。
2. **`list` 类座位必须带 `id`**（`sidebar.footer.action`、`settings.section`、`conversation.view`），否则会报 `list slot ... requires options.id`。
3. **别再用「DOM 覆盖层 + CSS 把原生会话藏起来」那套方案**，它会造成控件重叠、并且切不回会话。
4. **拿原生 `conversation.view` 标签当入口是不可靠的**：会话壳只在一个会话打开、并且标签多于一个时才渲染标签，在首页点它会找不到目标，表现就是「点了没反应」。所以入口行改成自己持有面板。
5. **`ctx.sessions` 是个 Service，快照在 `ctx.sessions.list`。** 传错的话，创建面板时会报 `getSnapshot is not a function`，整个座位被错误边界替换掉。
6. **客户端 bundle 有固定契约**：必须调用 `window.__ModuleLoader__.load({ id: '<包名>', factory })`；react 是外部依赖，用 classic JSX 时要 `import * as React`（默认导入会被编译成 `require('react').default`，那是 undefined）。
7. **esbuild 的参数**要用 `--jsx=transform`（0.24 已经不接受 `--jsx=classic`），也别漏掉 `--external:react-dom/client`。
8. **类型尽量只依赖真正用到的那点结构。** 插件对消息块、设置作用域、子进程句柄这些东西只声明了最小的结构类型，这样 DSH 的类型修订不会轻易把编译弄挂。
9. **pnpm 的构建门禁**：`ERR_PNPM_IGNORED_BUILDS`（fsevents、sharp 之类）会拦住任何 `dsh plugin add`，需要在 profile 的 `pnpm-workspace.yaml` 里用 `allowBuilds` 放行。
10. **DSH 是单实例的**：再起一个 `dsh web` 会报 `task-board ledger is already owned by process <pid>`。

## 遇到问题先看这里

**侧边栏没有入口。** 先确认插件确实被加载了：浏览器控制台里看一眼 `/plugins/dsh-llamacpp-bridge/client.js` 是不是 200，如果是 404，说明当前这份 DSH 没有装载插件的客户端半包。另外记得装完要重启一次 `dsh web`，并把页面硬刷新。

**控制台报 `bundle script ... failed to load`。** 这是页面缓存：强制刷新，或者干脆把整个窗口退掉（`Cmd+Q`）再打开。

**点了入口没反应。** 打开 F12 控制台，找以 `[llamacpp-bridge]` 或者 `slot entry crashed` 开头的行，那里会写清楚是哪一步出的问题。

**模型列表不跟着目录变。** 面板里点一下「刷新」。如果还不对，看启动日志里 `scanned N model(s)` 那句提到的目录，是不是你现在正在用的那个。

**视觉模型不能看图。** 看启动日志里有没有 `vision: <模型> ← <投影文件>`；如果某一行的位置写着 `unmatched mmproj: ...`，就到设置页把那个文件绑到对应的模型上。

**启动就失败。** 日志里会打印实际的命令行和错误原因，先确认 `executable` 和 `modelsDir` 指向的路径对不对。

**端口被占用。** 改设置里的 `port`，或者先把占用 8080 的进程停掉。

**`ERR_PNPM_IGNORED_BUILDS`。** 在 `~/.dsh/profiles/web/pnpm-workspace.yaml` 里加上 `allowBuilds: { fsevents: true, sharp: true }`。

**`ledger is already owned by process ...`。** DSH 只允许跑一个实例，先把另一个 `dsh web` 关掉。

## 如果你想自己改

```bash
npm install          # devDependencies
npm run link:dsh     # 链接本机 DSH 的类型包（必须在 npm install 之后）
npm run typecheck    # host 与 client 的类型检查
npm run build        # 构建 dist/
npm run check        # typecheck + build
npm pack             # 打包成可安装的 tgz
```

`src/` 下面分成 host 和 client 两半，`src/shared.ts` 是两边共用的常量和小工具（provider id、路由前缀、名字截断之类）。改完记得重新 `npm pack`、用 `dsh plugin add` 覆盖安装，然后重启 host、硬刷新页面。

## 还没做的

原始需求里有一条是「长上下文时在对话里询问用户」，目前只能到设置页里改上下文长度——DSH 还没有合适的交互缝让插件在对话中插入提问，所以这条暂时留着没做。

## 许可证

[MIT](LICENSE) © 2026 b8yg7vjstj-ctrl
