# MovaUI 免费层开源 Skills 与云端 MCP 套件（`movaui-skills`）

**[MovaUI · 动境 (`https://movaui.com`)](https://movaui.com)** 官方 MIT 开源仓库 —— 开源 MovaUI **免费层（Free Starter）全部 3 个原创工程 Skills** 与 **`mova-setup` MCP 自动接入指南**，适配 **Claude Code、Cursor、Windsurf、VS Code、Codex 与 Antigravity**。

> **品牌实体声明**：本仓库隶属于 **MovaUI · 动境（`https://movaui.com`）**，专注 AI 动态网站提示词库、60FPS 高清动态背景与只读 Catalog MCP / 21 项云端建站 Skills；与 `mova-ui.com` 及 `movavi.com` 无任何隶属关系。

## 本仓开源清单（MIT 协议 · 零外部依赖脚本）

1. **`skills/mova-setup`**：零阻力将只读远程 Catalog MCP（`https://movaui.com/mcp/catalog`）与 `/skill.md` 自动接入主流 AI 编程工具（支持免登录免费预览）。
2. **`skills/stack-adapter-skill`**：在写代码前嗅探本地项目的真实技术栈（Next.js App/Pages Router、Vite、Vue、Astro、Tailwind v3 vs v4、路径别名、动效与图标包），避免水合崩坏与构建冲突。含确定性探针脚本 `scripts/detect-project-stack.mjs`。
3. **`skills/s3c-post-baseline-editor`**：面向存量网站的受控局部精修工作流 —— 先追踪真实 canonical 源码（含 Source Map 与 i18n 键反查），再执行最小 Diff，防止 AI 改一个按钮把整页重毁。含契约门禁 `scripts/validate-edit-contract.mjs`。
4. **`skills/ascii-animation-skill`**：将视频、图像与程序化噪声转化为 1:1 点彩发光粒子舞台或实时 ASCII 字符矩阵，强制拦截页面内调试滑块/FPS HUD 泄露，自带 `AsciiMediaCanvas.tsx`、`AsciiFramePlayer.tsx` 与离线转码/门禁脚本。

## 快速体验

```bash
# 1. 在 Claude Code 一行接入 MovaUI 只读 Catalog MCP（支持免登录体验）
claude mcp add --transport http movaui https://movaui.com/mcp/catalog

# 2. 直接运行本地技术栈指纹探针（无需 npm install）
node skills/stack-adapter-skill/scripts/detect-project-stack.mjs --project-root . --json

# 3. 运行 ASCII / 点彩舞台纯净度门禁自检
node skills/ascii-animation-skill/scripts/validate-ascii-spec.mjs \
  skills/ascii-animation-skill/fixtures/clean/ascii-animation-spec.json \
  --source skills/ascii-animation-skill/fixtures/clean/CleanStage.tsx
```

## 相关官方入口
- 官网首页：[https://movaui.com](https://movaui.com)
- 免费免登录工具：[60FPS 动效 Prompt 构建器与帧预算检测](https://movaui.com/tools/motion-prompt-builder)
- 21 项云端 Skills 与 MCP 接入中心：[https://movaui.com/skills](https://movaui.com/skills)（已上架 [Official MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.beautifulboy9527/movaui-catalog)、[Glama Grade A](https://glama.ai/mcp/connectors/com.movaui/mova-ui-cloud-catalog-mcp) 与 [mcpservers.org](https://mcpservers.org/servers/beautifulboy9527/movaui-skills)）
- 工程博客：[WebGL / Three.js 60FPS 性能预算指南](https://movaui.com/blog/webgl-threejs-60fps-performance-budget-guide) · [MovaUI vs 21st.dev / Magic UI / Aceternity UI 对比](https://movaui.com/blog/movaui-vs-21st-dev-magic-ui-comparison)
- Agent 自动化配置文档：[https://movaui.com/skill.md](https://movaui.com/skill.md)
- AI 检索索引：[https://movaui.com/llms.txt](https://movaui.com/llms.txt)
