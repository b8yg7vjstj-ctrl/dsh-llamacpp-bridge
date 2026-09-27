/**
 * 共享常量 —— host 与 client 两端都引用（各自打包内联，无运行时依赖）。
 */

/** 本插件注册/拥有的 provider 路由键。 */
export const PROVIDER_ID = 'llamacpp';

/** 本插件自有的用户设置命名空间（settings.yaml 中的节名）。 */
export const SETTINGS_NS = 'llamacpp-bridge';

/**
 * 只读的“自动发现结果”命名空间：host 把扫描到的 llama-server 可执行文件与
 * 模型目录候选放进该命名空间的 base 层，浏览器端设置页据此做图形化引导
 * （用户无需手改 YAML）。用户层为空 = 始终只反映插件自动检测。
 */
export const DISCOVERY_NS = 'llamacpp-bridge-discovery';


/** llama.cpp 服务器默认监听地址。 */
export const DEFAULT_HOST = '127.0.0.1';
/** llama.cpp 服务器默认端口。 */
export const DEFAULT_PORT = 8080;
/** 服务器启动就绪探测上限（毫秒）。 */
export const START_TIMEOUT_MS = 120_000;
/** 服务器进程退出的优雅期（毫秒）。 */
export const TERMINATE_GRACE_MS = 5_000;
/** 进程输出收集的环形缓冲上限（行）。 */
export const LOG_TAIL_LINES = 2000;

/** 模型 id（gguf 文件基名）中允许的字符。 */
export const MODEL_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

/** 自动为视觉模型匹配的 mmproj 后缀（默认约定：`<模型名>-mmproj.gguf`）。 */
export const DEFAULT_MMPROJ_SUFFIX = '-mmproj.gguf';

/**
 * 浏览器端“可达性探测”的默认目标。仅用于本地 Web 部署（llama.cpp 与
 * DSH 同机）时的状态展示；跨域/远程部署下该探测会失败并被面板隐藏。
 */
export const PROBE_URL = `http://${DEFAULT_HOST}:${DEFAULT_PORT}/v1/models`;

/**
 * 切换模型策略：
 * - 'restart'：停止现有 llama.cpp 进程并以新模型重启（最通用，默认）。
 * - 'api'    ：优先尝试 llama-server 的多模型管理接口（卸载 + 加载），失败时回退 restart。
 */
export type SwitchStrategy = 'restart' | 'api';

/** 「llama.cpp 终端输出监控」面板的同源路由前缀（host 注册，浏览器读取）。 */
export const TERMINAL_ROUTE_PREFIX = '/api/llamacpp-bridge';

/**
 * 会话视图环里的标签页 id（原生 `conversation.view` 座位）：
 * 由会话壳渲染成标签并一次只显示一个视图，因此不需要 DOM 浮层，
 * 切换/返回完全由原生壳管理。
 */
export const TERMINAL_VIEW_ID = 'llamacpp-terminal';

/** 面板/入口显示名。 */
export const TERMINAL_PANEL_LABEL = 'llama.cpp 终端输出监控';

/**
 * “插件作用回显”：在面板顶部（Deep Diving 状态输出之前）先说明本插件做什么，
 * 让用户一眼看到数据来自哪里、为什么会出现这些输出。
 */
export const PLUGIN_PURPOSE_LINES: readonly string[] = [
  '本插件（dsh-llamacpp-bridge）在 DSH 中注册 llamacpp provider 路由，并管理本机 llama.cpp（llama-server）进程。',
  '此面板实时回传 llama-server 的终端输出与运行状态：启动、加载模型、就绪、停止、错误都会原样显示。',
  '模型切换语义：先停止先前模型，再启动目标新模型，之后才向 OpenAI 兼容端口转发请求。',
  '下方输出为 llama.cpp 进程的原始 stdout/stderr（含插件自身的管理行，前缀 [manager]）。',
];

/** 模型显示名上限：超过则截断并加省略号（id 不受影响）。 */
export const MODEL_NAME_MAX = 30;

/** 截断过长的模型显示名：保留前 max 个字符，尾部以 `...` 表示省略。 */
export function truncateModelName(name: string, max = MODEL_NAME_MAX): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max)}...`;
}
