---
name: ascii-animation-skill
description: 'Use when designing, converting, or embedding animated ASCII art, 1:1 pointillist particle video fields, video-to-ASCII code matrices, procedural noise or rain backgrounds, or terminal-style character animations into a Next.js or React website, or when exporting deterministic ASCII animations to .rune.json, standalone HTML, or MP4.'
---

# ASCII Animation Skill（网页与终端字符 / 点彩粒子动画工程管线）

将视频流（`.mp4`/`.webm`）、静态图像、程序化噪声场（Perlin/Rain/Dither）与终端精灵场景转化为高性能、无障碍合规的 **ASCII 字符矩阵** 或 **1:1 原画比例发光点彩粒子场（Pointillist Particle Field）**，服务于极客品牌登录页（双栏代码矩阵或点彩粒子视觉舞台，基准参考案例见 `references/inceptionlabs-login-recipe.md`）、开发者工具 Hero 舞台、状态加载器与产品叙事页。**配色、颗粒尺寸、字符集一律从目标站品牌 token 与契约配置派生，禁止默认携带任何参考站观感，且严禁在生产页面渲染任何调试控件。**

本 skill 综合收编并提炼自六大开源参考项目与线上标杆逆向成果：
- **Inception Labs Login (`platform.inceptionlabs.ai`)**：实时 `<video>` 离屏采样 + 语法级伪代码流底纹 (`0.15` alpha) + 25Hz 正弦相位微光突变 + HSL 增艳/15-bit 颜色缓存；
- **[`bas3line/ascii`](https://github.com/bas3line/ascii) (`ascii.rest`)**：零依赖 `Piece` 函数式帧契约 (`(t, env) => string`)、`Surface` 扁平类型化数组、1:1 正方形网格 (`cell: 1`) 非字符几何发光粒子渲染、Unicode 盲文 (`U+2800..U+28FF`) 2×4 亚像素（8 倍分辨率）、3D Z-Buffer 几何体、9 阶链式后处理 FX、零 JS 动画 SVG 导出 (`@keyframes` step-end) 与离屏字形图集 (Glyph Atlas) 脏格重绘；
- **[`kailashsr38/ascii-magic-art`](https://github.com/kailashsr38/ascii-magic-art)**：字形墨水覆盖率度量 (`COVER`)、反向覆盖率色彩增益、10 种 `look` 实时重映射（`dots`, `ascii`, `dense`, `numbers`, `binary`, `blocks`, `squares`, `lines`, `dither` 4×4 Bayer 有序抖动）与水面正弦波倒影 (`waterLine`)；
- **[`zeke-john/rune`](https://github.com/zeke-john/rune)**：视频离线转 `.rune.json` 的四边连通泛洪抠像 (Border-Connected Flood Fill)、帧间掩码迟滞 (Temporal Hysteresis + 1px 膨胀) 与 DOM/Canvas 12,000 格自动切换阈值；
- **[`Eoic/ASCIIGround`](https://github.com/Eoic/ASCIIGround)**：多八度分形 Perlin FBM 噪声、带白亮雨头与拖尾衰减的数字雨 (`RainPattern`)、WebGL2 亚像素裁剪着色器与鼠标交互力场；
- **[`GordenSun/asciivideo`](https://github.com/GordenSun/asciivideo) & [`mu-ct/awesome-ascii-animation`](https://github.com/mu-ct/awesome-ascii-animation)**：Studio Dumbar "code-feel" 纯黑磷光美学、6 种确定性转场 (`scatter` 极坐标飞入、`scramble` 矩阵乱码解码、`type`、`wipe`、`slide`、`dissolve`)、双层高斯模糊 CRT 辉光及 12 套复古显示器主题。

---

## 0. 任务类型与授权（独立使用 vs 建站流水线 S3B.25 集成）

本 skill 同时支持两种调用模式：
1. **单目录独立调用模式**：本目录自包含 `components/`、`scripts/` 与 `lib/arg-guard.mjs`，无任何跨 skill 代码依赖，可直接拷入任意 Next.js / React 仓库独立运行。
2. **建站 Pipeline 阶段调用模式（`S3B.25`）**：在 `.agents/skills` 建站流水线中，作为 **S3B 设计与视效工程阶段的可选字符/粒子动效轨（`S3B.25`）** 运行：
   - **上游输入**：读取 `docs/pipeline/intake.json`（S0 任务路由）、`docs/brand/brand-ip.json`（S1.5 品牌色板注入 `phosphorColor`）、`docs/design/creative-spec.json`（S3B 动效选型）与 `docs/asset-provenance.json`（S5 视频资产授权台账）；
   - **本阶段落盘**：通过 `scripts/init-ascii-spec.mjs` 生成 `docs/design/ascii-animation-spec.json`，并由 `scripts/validate-ascii-spec.mjs` 执行契约与生产页面纯净度门禁；
   - **下游消费**：组件内置 `prefers-reduced-motion` 静态帧回退与视口暂停，直接满足 `S3B.20`（effect 降级门禁）与 `S6.5`（`quality-gate-skill` 的静态质量与动效门禁）无障碍及性能门禁。

---

## 生产页面纯净度红线（严禁在页面 DOM 渲染调试控件与参数面板）

> **铁律（Zero Demo Chrome in Production DOM）**：交付给用户的网页（如登录页、Hero 首屏、特性展示区）必须像 [`stackedlol/ascii-sharks`](https://github.com/stackedlol/ascii-sharks) 与 `platform.inceptionlabs.ai/auth/login` 一样**克制、纯粹、只专注于单一动画视觉本身**。
> **即使收到“粒子颗粒大小是否可以调整”、“试试切换另一个视频”、“换一种粒子形态看看”等调优指令，也必须且只能通过修改 React 组件 Props（如 `particleSize={8.5}`、`mediaSource`、`particleStyle`）或更新 `docs/design/ascii-animation-spec.json` 来调整，严禁在页面 DOM 的任何角落（包括表单下方、页脚、悬浮窗、边栏）渲染任何可见的调节器或演示控件！**

| 严禁出现在生产页面的违规元素 | 违规示例（门禁 `debug-chrome-leak` 直接拦截） | 唯一合规的参数调节方式 |
|---|---|---|
| **颗粒度 / 字号滑块** | `<input type="range">`、`Particle Size: 8.5px` | 修改 `<AsciiMediaCanvas particleSize={8.5} />` 或 `grid.particleSize` |
| **预设档位按钮组** | `Presets: Fine (5px) \| Bold (8.5px) \| Chunky (12px)` | 在代码或 `ascii-animation-spec.json` 中直接设定目标数值 |
| **粒子形态 / Look 切换栏** | `Particle Form: Glowing Dots \| Diamonds \| Voxels` | 修改 `<AsciiMediaCanvas particleStyle="dots" />` |
| **演示视频源切换器** | `Video Clip: Cosmic Structure \| Cyber Portrait` | 修改 `<AsciiMediaCanvas mediaSource="/videos/hero.mp4" />` |
| **键盘调试快捷键提示** | `Shortcuts: [1/2] Switch Video · [+/-] Adjust Particle Size` | 生产页面禁止绑定或展示调试快捷键 |
| **性能与网格 HUD** | `FPS: 60`、`Grid: 120×68 cells`、模式切换开关 | 仅限开发期浏览器 DevTools 查看，禁止写入页面 JSX |

---

## 五条技术路由选型矩阵

| 路由代号 | 适用场景 | 推荐实现组件 / 工具 | 渲染载体 | 性能与体积特征 |
|---|---|---|---|---|
| **Route A：`live-media-matrix`** | 登录页/Hero 实时把 MP4 视频或图片渲染为 **1:1 点彩发光粒子场 (`renderMode="particles"`)** 或 **流动代码矩阵 (`renderMode="ascii"`)** | `components/AsciiMediaCanvas.tsx` | `<canvas>` (DPR 自适应 + 离屏视频帧采样) | 零帧包体积（直接复用优化后的 `.mp4`）；1:1 正方形网格零拉伸变形；15-bit RGB 缓存零 GC 抖动 |
| **Route B：`rune-frame-bundle`** | 3D 旋转物体、吉祥物、透明背景短片离线烘培为帧数据按需加载 | `scripts/video-to-ascii.mjs` + `components/AsciiFramePlayer.tsx` | `<pre>` (`< 12000` 格) / `<canvas>` (`>= 12000` 格) | 构建期四边泛洪抠像 + 帧间防闪烁；运行时无需解码 `<video>` |
| **Route C：`procedural-piece`** | 轻量几何体（Donut/Torus）、仪表盘、Logo 徽章、加载器 | `components/AsciiFramePlayer.tsx` (`piece` 属性) 或 `ascii.rest` / `ascii-magic-art` | `<pre>` 或 `<canvas>` + 10 种 `look` 切换 | 纯数学函数驱动，体积 `< 5KB`，60fps |
| **Route D：`pattern-background`** | 全屏/分栏生成式纹理背景（Perlin 云雾、Matrix 数字雨、Bayer 抖动） | `components/AsciiMediaCanvas.tsx` (`patternMode="perlin"`) 或 `asciiground` | `<canvas>` / WebGL2 | 无需外部媒体资产，支持高密度网格与主题色映射 |
| **Route E：`charvid-timeline`** | 独立宣传短片 MP4 或带时间轴控制的单文件终端叙事 HTML | `scripts/video-to-ascii.mjs --html` 或 `asciivideo` (`charvid`) | 离线 MP4 + 自包含 `.html` | 确定性种子 PRNG、磷光辉光层、原生支持中文 CJK 双宽格 |

---

## 输入契约

| 输入项 | 路径 / 来源 | 说明 |
|---|---|---|
| **ASCII / 粒子动效规格书** | `docs/design/ascii-animation-spec.json` | 声明所选 `route`、入口源码 `entryPoint`、网格参数 `grid{columns,rows,fps,fontRatio,renderMode,particleSize,particleStyle,aspectFit}`、纯净度策略 `purityPolicy`、退化策略 `degrade{reducedMotion,noJS}` 与无障碍属性 `accessibility{role,ariaLabel}` |
| **源视频 / 图像资产（可选）** | `public/videos/<name>.mp4`（示例占位 `<your-hero>.mp4`） | Route A 实时采样或 Route B 离线转码的输入源；所有落入 `public/` 的媒体须登记入 `docs/asset-provenance.json` |
| **品牌视觉 DNA（可选）** | `docs/brand/brand-ip.json` | 由 `scripts/init-ascii-spec.mjs` 自动提取品牌强调色注入 `phosphorColor` |

---

## 流程

### 阶段 1：路由判定与契约落盘 (`docs/design/ascii-animation-spec.json`)

优先运行初始化脚本 `.agents/skills/ascii-animation-skill/scripts/init-ascii-spec.mjs` 生成契约骨架（自动从 `docs/brand/brand-ip.json` 派生强调色）：

```bash
node .agents/skills/ascii-animation-skill/scripts/init-ascii-spec.mjs \
  --out docs/design/ascii-animation-spec.json \
  --route live-media-matrix \
  --render-mode particles \
  --particle-size 8.5 \
  --particle-style dots \
  --media-source /videos/hero.mp4 \
  --entry-point src/components/ascii-media-canvas.tsx \
  --force
```

生成的 `docs/design/ascii-animation-spec.json` 结构如下：

```json
{
  "version": 1,
  "route": "live-media-matrix",
  "mediaSource": "/videos/hero.mp4",
  "entryPoint": "src/components/ascii-media-canvas.tsx",
  "colorMode": "color",
  "phosphorColor": "#17C4C4",
  "patternMode": "dots",
  "look": "dots",
  "grid": {
    "columns": 120,
    "rows": 68,
    "fps": 30,
    "fontRatio": 1.0,
    "renderMode": "particles",
    "particleSize": 8.5,
    "particleStyle": "dots",
    "aspectFit": "contain"
  },
  "purityPolicy": {
    "forbidInPageControls": true,
    "forbidFpsHud": true,
    "forbidShortcutOverlay": true
  },
  "degrade": {
    "reducedMotion": "still-frame",
    "noJS": "static-poster-or-pre"
  },
  "accessibility": {
    "role": "img",
    "ariaLabel": "Animated visual stage"
  }
}
```

### 阶段 2：资产生成或离线烘培（Route B / Route E）

若采用离线帧包或需要单文件 HTML 预览，运行转换脚本 `.agents/skills/ascii-animation-skill/scripts/video-to-ascii.mjs`：

```bash
# 从 MP4 视频提取帧 + 四边泛洪去背 + 帧间迟滞防闪烁 → 生成 .rune.json、独立 HTML 预览与零 JS 动画 SVG
node .agents/skills/ascii-animation-skill/scripts/video-to-ascii.mjs \
  --input public/videos/hero-h-opt.mp4 \
  --output public/animations/hero.rune.json \
  --html temp/ascii-animation-e2e-preview/hero-ascii-preview.html \
  --svg public/animations/hero-animated.svg \
  --columns 90 \
  --fps 24 \
  --look ascii

# 无视频源时，直接生成程序化预设动画 (donut | torus3d | matrix | perlin | wave | scatter)
node .agents/skills/ascii-animation-skill/scripts/video-to-ascii.mjs \
  --preset torus3d \
  --output public/animations/torus3d.rune.json \
  --svg public/animations/torus3d.svg \
  --columns 56 \
  --fps 15
```

### 阶段 3：React / Next.js 组件挂载（Route A / B / C / D）

1. **1:1 原画比例发光点彩粒子场或实时代码矩阵（Route A）**：
   将 `.agents/skills/ascii-animation-skill/components/AsciiMediaCanvas.tsx` 复制到项目 `src/components/ascii-media-canvas.tsx` 并挂载（**严禁在宿主页面添加任何滑块或切换按钮**）：
   ```tsx
   import { AsciiMediaCanvas } from "@/components/ascii-media-canvas";

   <div className="hidden lg:block relative w-0 flex-1 bg-black overflow-hidden">
     <AsciiMediaCanvas
       mediaSource="/videos/hero.mp4"
       renderMode="particles"
       particleSize={8.5}
       particleStyle="dots"
       aspectFit="contain"
       colorMode="color"
       showPattern={true}
       label="Animated pointillist particle visual stage"
     />
   </div>
   ```
2. **离线 `.rune.json` 帧包或函数式 `Piece` 播放器（Route B / Route C）**：
   将 `.agents/skills/ascii-animation-skill/components/AsciiFramePlayer.tsx` 复制到项目 `src/components/ascii-frame-player.tsx`，支持 `look="dots" | "dither" | "blocks" | "ascii"`。

### 阶段 4：契约与生产页面纯净度门禁校验（`S3B.25`）

执行 `.agents/skills/ascii-animation-skill/scripts/validate-ascii-spec.mjs` 校验网格预算、渲染模式、无障碍退化策略以及页面源码零调试控件（`debug-chrome-leak`）。

---

## 输出契约

| 产物路径 | 产生方式 | 用途与约束 |
|---|---|---|
| `docs/design/ascii-animation-spec.json` | `scripts/init-ascii-spec.mjs` | 记录路由、网格尺寸、`renderMode`、`particleSize`、纯净度策略、退化与无障碍契约 |
| `src/components/ascii-media-canvas.tsx` | 复制自 `components/AsciiMediaCanvas.tsx` | Next.js App Router 客户端组件（支持 `"particles"` 1:1 发光点彩粒子态与 `"ascii"` 代码矩阵态；零调试 UI） |
| `src/components/ascii-frame-player.tsx` | 复制自 `components/AsciiFramePlayer.tsx` | `.rune.json` 与程序化 `Piece` 播放器（`>= 12000` 格自动切 Canvas） |
| `public/animations/*.rune.json` | `scripts/video-to-ascii.mjs` | 离线烘培的字符与十六进制色彩帧序列 |

---

## 门禁

| 门禁名称 | 可执行命令 | 通过标准 | 失败含义 |
|---|---|---|---|
| `ASCII_SPEC_GATE` (`S3B.25`) | `node .agents/skills/ascii-animation-skill/scripts/validate-ascii-spec.mjs docs/design/ascii-animation-spec.json --source src/ --json` | `exit 0`：`version=1`、`route` 合法、`columns * rows >= 12000` 或 `columns >= 140` 时禁用 `dom` 模式、`fontRatio` 与 `particleSize`（`3.5..18`）合规、`degrade.{reducedMotion,noJS}` 与 `accessibility` 齐全、本地 `mediaSource` 真实存在、且源码扫描 `debugChromeLeaks` 为空（0 滑块/0 调试按钮/0 快捷键栏） | 网格超预算导致主线程卡死、缺失无障碍退化声明、或页面残留 `<input type="range">` / `Particle Size:` / `Video Clip:` 等调试控件（`debug-chrome-leak`） |

---

## 明确不保证的能力

- **不保证无 `ffmpeg` 时离线解码本地视频文件**：`scripts/video-to-ascii.mjs --input <video>` 依赖系统 `PATH` 上的 `ffmpeg`（或 Python `imageio_ffmpeg`）提取 RGB24 原始帧；若宿主无 `ffmpeg`，请改用浏览器端实时解码路由（Route A `AsciiMediaCanvas.tsx`，由浏览器 `<video>` 原生解码）或 `--preset` 程序化生成路由。
- **不保证跨域第三方视频 URL 支持像素读取**：`AsciiMediaCanvas.tsx` 通过 `offscreenCtx.getImageData()` 采样视频像素；若外链视频未配置 `Access-Control-Allow-Origin` 响应头，Canvas 会被浏览器标记为 tainted，此时组件仅回退显示底层环境点阵，不会报错崩溃。生产环境应将视频存放于同源 `public/videos/` 下服务。
- **不替代版权审计**：从参考站下载的演示视频或第三方商标 Piece 仅用于技术验证；正式上线前必须通过 `asset-sourcing-skill` 登记自有或合规授权媒体。

---

## 常见失败

- **在生产页面左下角或底部渲染了粒子大小滑块、预设按钮、视频切换器或快捷键提示（`debug-chrome-leak`）** —— 将“可调节粒子颗粒度”误解为“在网页上放一个调节器面板”。生产页面必须保持 100% 视觉纯粹，一切参数微调只能改组件 Props（`particleSize={8.5}`）或 `docs/design/ascii-animation-spec.json`；
- **视频画面被横向或纵向拉伸变形** —— 等宽字符默认高度约为宽度的 `1.67` 倍，若未按实际 `stepX / fontSize` 比例采样或未使用 `renderMode="particles"` 的 `1:1` 正方形网格（配合 `aspectFit="contain"`），会导致人物面部或几何球体变成椭圆；
- **粒子过于密集导致画面粘连成普通马赛克视频** —— 当 `particleSize < 5` 且半径占满网格时，缺乏负空间暗隙，丢失点彩粒子颗粒感；应使用默认 `particleSize={8.5}`（`7.5–10px` 黄金区间），保留 ~24% 负空间暗隙、双层 Halation 辉光与高光白核；
- **大尺寸彩色字符画用 DOM `<span>` 渲染导致页面卡死** —— 当 `columns * rows >= 12000` 或 `columns >= 140` 时，每帧更新上万个 DOM 节点会耗尽 16.6ms 帧预算；必须使用 `<canvas>` 或 `particles` 模式；
- **未处理视口外暂停与 `prefers-reduced-motion`** —— 多个全屏 Canvas 同时后台跑 `requestAnimationFrame` 会拉满 GPU/CPU；必须保留 `IntersectionObserver` 与 `prefers-reduced-motion` 监听。

---

## 参考路由

- **六大开源项目源码拆解与算法基准** → `.agents/skills/ascii-animation-skill/references/ecosystem-and-benchmarks.md`
- **Inception Labs 登录页 (`hero-h-opt.mp4`) 1:1 逆向配方** → `.agents/skills/ascii-animation-skill/references/inceptionlabs-login-recipe.md`
- **高性能渲染（字形图集/Worker/DPR≤1.5）与无障碍规范** → `.agents/skills/ascii-animation-skill/references/performance-and-accessibility.md`
- **实时视频点彩粒子场 / 代码矩阵 React 组件** → `.agents/skills/ascii-animation-skill/components/AsciiMediaCanvas.tsx`
- **`.rune.json` 与程序化 Piece 播放器组件** → `.agents/skills/ascii-animation-skill/components/AsciiFramePlayer.tsx`
- **ASCII 动效规格初始化脚本** → `.agents/skills/ascii-animation-skill/scripts/init-ascii-spec.mjs`
- **视频/预设离线转 `.rune.json` 及 HTML 脚本** → `.agents/skills/ascii-animation-skill/scripts/video-to-ascii.mjs`
- **ASCII 动效规格与页面纯净度门禁脚本** → `.agents/skills/ascii-animation-skill/scripts/validate-ascii-spec.mjs`
## 双模运行与数据颗粒度契约（Standalone vs Pipeline）

- **独立运行（Standalone Mode）**：本目录 100% 自包含（组件、烘培脚本与门禁内置 `lib/`，**不依赖其他外部 skill**）。单拷即可在任意 React / Next.js / 静态页面落地 1:1 点彩粒子视频舞台、`.rune.json` 离线序列或程序化字符背景，并运行 `scripts/validate-ascii-spec.mjs --source` 拦截调试控件泄露。
- **流水线模式（Pipeline Mode）**：作为 S3B.25 可选视觉舞台轨，输出 `docs/design/ascii-animation-spec.json`（记录单位：一个独立字符/点彩舞台实例；唯一键：`stage_id` + 四态降级键 `node_id:degrade_state`），源视频版权同步登记至 S5 `docs/asset-provenance.json`（`file` + `sha256`）。
