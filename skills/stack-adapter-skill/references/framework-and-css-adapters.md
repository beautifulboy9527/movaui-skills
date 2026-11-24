# 跨框架、样式引擎与动效依赖桥接手册

## 1. 框架与路由原语等价替换表

| 能力场景 | Next.js App Router (13–16) | Vite + React Router / SPA | Astro 5 + Islands | Vue 3 / Nuxt 3 | 原生 HTML / Vanilla |
|---|---|---|---|---|---|
| 客户端交互声明 | 文件首行 `"use client"` | 无需指令 | 模板挂载 `client:load` 或 `client:visible` | `<script setup lang="ts">` | `<script type="module">` |
| 站内路由跳转 | `import Link from "next/link"` (`href`) | `import { Link } from "react-router-dom"` (`to`) 或原生 `<a href>` | 原生 `<a href="...">` | `<NuxtLink to="...">` 或 `<RouterLink>` | 原生 `<a href="...">` |
| 响应式图片 | `next/image` 或带 `width`/`height`/`loading` 的 `<img>` | 原生 `<img>` + 显式宽高比容器 + `decoding="async"` | `astro:assets` `<Image />` 或原生 `<img>` | `<NuxtImg>` 或原生 `<img>` | `<picture>` + `<img>` |
| 当前路径感知 | `usePathname()` (`next/navigation`) | `useLocation().pathname` | `Astro.url.pathname` | `useRoute().path` | `window.location.pathname` |

## 2. Tailwind CSS v3 与 v4 双轨适配规则

### 2.1 识别信号
- **Tailwind v4**：`package.json` 中 `tailwindcss` 主版本为 `^4` 或存在 `@tailwindcss/vite` / `@tailwindcss/postcss`，且全局 CSS 使用 `@import "tailwindcss";`。
- **Tailwind v3**：`package.json` 中 `tailwindcss` 主版本为 `^3`，根部有 `tailwind.config.*`，全局 CSS 使用 `@tailwind base; @tailwind components; @tailwind utilities;`。

### 2.2 常见跨版本事故与修法
1. **间距命名空间陷阱（v4 专属）**：
   - 错误：在 `@theme` 中定义 `--spacing-sm: 0.75rem;`，会覆盖 Tailwind v4 的基础间距乘数体系并破坏 `max-w-sm` 等宽度工具。
   - 正确：在 `:root` 中定义 `--space-section: clamp(4rem, 7vw, 7rem);`，或使用任意值 `py-[var(--space-section)]`。
2. **暗黑模式选择器兼容**：
   - 先核查目标工程是跟系统（`@media (prefers-color-scheme: dark)`）、类名切换（`.dark`）还是属性切换（`[data-theme="dark"]` / `[data-mode="dark"]`）。新增组件必须复用宿主现有的暗色变量（如 `var(--bg-card)`、`var(--fg-muted)`），严禁在一套已有主题变量的工程里硬编码孤立的 `bg-slate-900 text-slate-100`。
3. **透明度修饰符与色彩变量**：
   - 若宿主令牌存储为完整色彩值（如 `--brand: #7c3aed` 或 `oklch(...)`），优先用现代 CSS `color-mix(in oklab, var(--brand) 14%, transparent)` 构造半透明背景与边框，在 Tailwind v3 与 v4 中均 100% 稳定生效，不依赖 `--brand-rgb` 拆分通道。

## 3. 动效库零摩擦降级策略

1. **包名精确匹配**：
   - `motion` 包存在 → 从 `"motion/react"` 导入；
   - 仅 `framer-motion` 存在 → 从 `"framer-motion"` 导入；
   - 严禁在只装了 `framer-motion` 的仓库里写 `"motion/react"`（直接导致构建失败）。
2. **零新增依赖优先**：
   - 对于按钮按压反馈、胶囊切换高亮、手风琴展开（`grid-template-rows: 0fr -> 1fr`）、悬停聚光灯（CSS 变量 `--mx`/`--my` + `radial-gradient`）与首屏轻入场，原生 CSS 的包体积开销为 `0 KB`，且天然支持中途打断重定目标（Retargeting）。
3. **GSAP / Lenis 共存守卫**：
   - 若宿主已挂载全局平滑滚动（Lenis / Locomotive），新增局部组件严禁再实例化第二个全局滚动接管器；GSAP 动画必须包在 `gsap.context(() => { ... }, scopeRef)` 并在 `useEffect` 返回函数中执行 `ctx.revert()`。

## 4. 水合安全（SSR Hydration）标准模板

当组件需要读取视口尺寸、`prefers-reduced-motion` 或本地存储时：
- **首帧确定性渲染**：初始状态必须与服务端输出完全一致（不得用 `typeof window !== "undefined" ? window.innerWidth : 1200` 直接分支渲染不同 DOM 结构）。
- **挂载后增强**：将依赖浏览器的测量放入 `useEffect` 或 CSS 媒体查询中，避免首屏闪烁与 React #418/#425 水合错误。
