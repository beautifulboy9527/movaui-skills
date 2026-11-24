---
name: stack-adapter-skill
description: Use before generating, integrating, or refactoring UI components, motion effects, or design tokens in any existing or heterogeneous web repository. Fingerprints the real local stack (Next.js App/Pages Router, Vite + React 18/19, Astro islands, Vue/Nuxt, SvelteKit, Vanilla HTML/CSS, Tailwind v3 vs v4, icon/motion packages, path aliases, and SSR boundaries) and translates code to match incumbent conventions without breaking builds.
---

# 异构工程嗅探与技术栈零冲突适配（Stack Adapter Skill）

## 为什么必须先做栈嗅探

真实工程环境极少是空白的单一模板。直接假定目标项目具备 `next/image`、`next/link`、Tailwind v4 `@theme`、`motion/react` 或 `@/*` 路径别名，会在 Vite、Astro、Next.js Pages Router、React 18 或 Tailwind v3 仓库中当场引发构建报错、SSR 水合崩溃（`window is not defined`）或样式失效。本技能在动笔改代码前建立确定性的本地栈指纹与桥接规则。

## 双模运行与数据颗粒度契约

- **独立运行（Standalone Mode）**：本目录自包含，不依赖外层流水线目录即可单独拷入任意项目运行 `node .agents/skills/stack-adapter-skill/scripts/detect-project-stack.mjs --project-root <dir> --json`，直接向标准输出打印技术栈指纹与适配指令（可选 `--out <path>` 落盘）。
- **流水线模式（Pipeline Mode）**：在完整建站或改站链路中承担前置环境探针职责，供下游生成、动效接线与局部精修阶段消费，避免下游写入不兼容语法。
- **输出契约与颗粒度**：记录单位为**一个目标工程 × 一个技术栈适配维度**（`framework` / `router` / `css_engine` / `motion_lib` / `alias_map` / `ssr_boundary`），唯一键为 `project_id:adapter_dimension`。

## 四维嗅探清单（写代码前必核）

1. **框架与路由边界（Framework & Router）**
   - 检查 `package.json` 与配置文件（`next.config.*`、`vite.config.*`、`astro.config.*`、`nuxt.config.*`、`svelte.config.*`）。
   - 区分 **Next.js App Router**（默认 Server Component，用到 `useState`/`useEffect`/`useRef`/浏览器事件的文件顶部必须声明 `"use client"`）与 **Vite / CRA / 纯客户端 SPA**（无 `"use client"` 要求，但严禁导入 `next/link`、`next/image`、`next/navigation`）。
   - **Astro Islands**：交互动效组件必须显式挂载客户端水合指令（首屏交互用 `client:load`，折叠区下用 `client:visible`）。
2. **CSS 与设计令牌引擎（Tailwind v3 vs v4 vs 原生 CSS）**
   - **Tailwind v4**：入口 CSS 含 `@import "tailwindcss";` 或 `@theme`。严禁混入 `@tailwind base;` 三行旧指令；严禁在 `@theme` 中覆盖 `--spacing-*`（会连带缩小 `max-w-*` 容器工具类，自定义间距一律写入 `:root { --space-*: ... }`）。
   - **Tailwind v3**：存在 `tailwind.config.{js,ts,mjs,cjs}` 且 CSS 含 `@tailwind utilities`。禁止写入 `@theme inline` 语法，扩展令牌写入 CSS 自定义属性并在 `tailwind.config` 的 `theme.extend` 中映射。
   - **无 Tailwind 项目**：自动退回语义化作用域 CSS（CSS Modules 或带组件前缀的原生 CSS 自定义属性），绝不往无 Tailwind 工程硬塞满屏原子类名。
3. **动效与图标依赖兼容（Motion & Icons）**
   - 先读 `package.json` 的 `dependencies`：
     - 已装 `motion`（v11+）→ `import { motion, AnimatePresence } from "motion/react"`；
     - 已装 `framer-motion` → `import { motion, AnimatePresence } from "framer-motion"`；
     - 两者均未安装且用户未要求装新包 → 优先使用原生 CSS Transitions / `@keyframes` / Web Animations API 实现等价动效，而非擅自引入重依赖。
   - 图标库同理：核实 `lucide-react`、`@heroicons/react` 或 `@phosphor-icons/react` 是否已安装；未安装时使用内联干净 SVG（`aria-hidden="true"`、`currentColor`）。
4. **路径别名、TypeScript 与既有代码风格继承（Exemplar Inheritance）**
   - 读取 `tsconfig.json` / `jsconfig.json` 的 `compilerOptions.paths`：确认 `@/*` 是否存在及指向 `./src/*` 还是 `./*`；无别名时一律使用精确相对路径。
   - 抽样阅读目标目录 1–2 个既有代表性组件（Golden Exemplars），继承其导出风格（具名导出 vs 默认导出）、类名合并工具（`cn()` vs 模板字符串）与状态命名习惯。

## SSR 与浏览器生命周期安全铁律

- 严禁在模块顶层或首次同步渲染分支中直接读取 `window`、`document`、`localStorage`、`navigator` 或 `matchMedia`（会导致服务端渲染与客户端首帧不一致的水合报错）。
- 所有 `ResizeObserver`、`IntersectionObserver`、`requestAnimationFrame`、定时器与全局事件监听必须在销毁钩子中成对清理。

## 命令行探针用法

```bash
node .agents/skills/stack-adapter-skill/scripts/detect-project-stack.mjs --project-root . --json
```

- 退出码：`0` = 指纹提取完成且无致命栈冲突；`1` = `--strict` 下检出冲突配置（如 Tailwind v3 与 v4 指令混写）；`2` = 参数错误或目标目录不存在。

## 参考路由

- 跨框架 API 映射表、Tailwind v3↔v4 双轨写法与水合防崩详情见 `references/framework-and-css-adapters.md`。
