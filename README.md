# MovaUI Open-Source Starter Skills & Cloud MCP (`movaui-skills`)

[![Website](https://img.shields.io/badge/Website-movaui.com-7c3aed?style=flat-square)](https://movaui.com)
[![MCP Endpoint](https://img.shields.io/badge/MCP-Streamable%20HTTP-0ea5e9?style=flat-square)](https://movaui.com/skills)
[![Official MCP Registry](https://img.shields.io/badge/MCP_Registry-io.github.beautifulboy9527%2Fmovaui--catalog-2563eb?style=flat-square)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.beautifulboy9527/movaui-catalog)
[![MovaUI Cloud Catalog MCP connector](https://glama.ai/mcp/connectors/com.movaui/mova-ui-cloud-catalog-mcp/badges/score.svg)](https://glama.ai/mcp/connectors/com.movaui/mova-ui-cloud-catalog-mcp)
[![Listed on mcpservers.org](https://mcpservers.org/badge.svg)](https://mcpservers.org/servers/beautifulboy9527/movaui-skills)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981?style=flat-square)](./LICENSE)
[![LLMs.txt](https://img.shields.io/badge/GEO-llms.txt-f59e0b?style=flat-square)](https://movaui.com/llms.txt)

Official **MIT-licensed free-tier Agent Skills** and **Cloud Catalog MCP connector** from **[MovaUI · 动境 (`movaui.com`)](https://movaui.com)** — built for **Claude Code, Cursor, Windsurf, VS Code, Codex, and Antigravity**.

> **Brand & Entity Note**: This repository is the official open-source project of **MovaUI · 动境 (`https://movaui.com`)** — an AI motion website prompt library, 60FPS animated background catalog, and Cloud MCP / Skills platform. It is **independent of and unaffiliated with** `mova-ui.com` or `movavi.com`.

[中文说明 (README.zh-CN.md)](./README.zh-CN.md) · [Live Site (movaui.com)](https://movaui.com) · [MCP Setup (`skill.md`)](https://movaui.com/skill.md) · [AI Index (`llms.txt`)](https://movaui.com/llms.txt)

---

## What's Open-Sourced in This Repository (100% Free Tier · MIT)

Unlike bloated prompt dumps, this repository open-sources the **4 standalone engineering skills** from MovaUI's **Free Starter tier** — complete with deterministic Node.js validators and production React/Canvas components:

| Skill | What It Solves | Included Deterministic Tools / Components |
|---|---|---|
| **[`mova-setup`](./skills/mova-setup/SKILL.md)** | Zero-friction MCP registration across Claude Code, Cursor, Windsurf, Codex & Antigravity | Streamable HTTP & `mcp-remote` stdio bridge templates pointing to `https://movaui.com/mcp/catalog` |
| **[`stack-adapter-skill`](./skills/stack-adapter-skill/SKILL.md)** | Prevents build & hydration crashes when dropping motion UI into Vite, Vue, Astro, Next.js Pages/App Router, or Tailwind v3 vs v4 | [`scripts/detect-project-stack.mjs`](./skills/stack-adapter-skill/scripts/detect-project-stack.mjs) + [`references/framework-and-css-adapters.md`](./skills/stack-adapter-skill/references/framework-and-css-adapters.md) |
| **[`s3c-post-baseline-editor`](./skills/s3c-post-baseline-editor/SKILL.md)** | Stops AI agents from rewriting whole pages during small edits; traces canonical owners (including source maps & i18n keys) and enforces bounded diffs | [`scripts/validate-edit-contract.mjs`](./skills/s3c-post-baseline-editor/scripts/validate-edit-contract.mjs) + [`references/surgical-editing-and-debugging-discipline.md`](./skills/s3c-post-baseline-editor/references/surgical-editing-and-debugging-discipline.md) |
| **[`ascii-animation-skill`](./skills/ascii-animation-skill/SKILL.md)** | Builds 1:1 pointillist particle fields & real-time video-to-ASCII stages with zero debug chrome, `prefers-reduced-motion`, and offline `.rune.json` baking | [`components/AsciiMediaCanvas.tsx`](./skills/ascii-animation-skill/components/AsciiMediaCanvas.tsx), [`components/AsciiFramePlayer.tsx`](./skills/ascii-animation-skill/components/AsciiFramePlayer.tsx), [`scripts/init-ascii-spec.mjs`](./skills/ascii-animation-skill/scripts/init-ascii-spec.mjs), [`scripts/validate-ascii-spec.mjs`](./skills/ascii-animation-skill/scripts/validate-ascii-spec.mjs), [`scripts/video-to-ascii.mjs`](./skills/ascii-animation-skill/scripts/video-to-ascii.mjs) |

---

## Quick Start

### 1. Connect the Read-Only MovaUI Cloud Catalog MCP (Guest Preview = Free)

```bash
# Claude Code CLI
claude mcp add --transport http movaui https://movaui.com/mcp/catalog
```

Or add to `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "movaui": {
      "url": "https://movaui.com/mcp/catalog"
    }
  }
}
```

Full setup instructions for VS Code, Windsurf, Codex, and Antigravity are served live at [`https://movaui.com/skill.md`](https://movaui.com/skill.md).

### 2. Run the Included Standalone Skill Validators Locally (Node.js 18+, Zero npm Install)

```bash
# Fingerprint any local web repo (Next.js / Vite / Astro / Vue / Tailwind v3 vs v4)
node skills/stack-adapter-skill/scripts/detect-project-stack.mjs --project-root . --json

# Verify clean ASCII / pointillist stage purity (blocks debug sliders & FPS HUD leaks)
node skills/ascii-animation-skill/scripts/validate-ascii-spec.mjs \
  skills/ascii-animation-skill/fixtures/clean/ascii-animation-spec.json \
  --source skills/ascii-animation-skill/fixtures/clean/CleanStage.tsx
```

---

## Full MovaUI Cloud Ecosystem (`movaui.com`)

These 4 MIT starter skills connect seamlessly to the broader **MovaUI · 动境** catalog hosted at [`https://movaui.com`](https://movaui.com):

- **Motion Prompt Library**: [865+ curated AI website motion prompts](https://movaui.com/search) with 60FPS live previews and a 4-field customizer (including 95 free showcase assets).
- **60FPS Animated Backgrounds**: [218 loopable video & shader backgrounds](https://movaui.com/backgrounds) with responsive HTML/React embed code.
- **Zero-Login Free Utility**: [60FPS Motion Prompt Builder & Frame-Budget Checker](https://movaui.com/tools/motion-prompt-builder) — assemble stack-adapted prompts with DPR caps, viewport pausing, and `prefers-reduced-motion` guardrails with zero signup.
- **21 Cloud Engineering Skills (`/skills`)**: 3 Free Starter skills (open-sourced right here) + 7 VIP Design & Motion skills + 11 SVIP Quality, SEO/GEO & Release Gate skills accessible on-demand through `/mcp/catalog` (MCP `2025-03-26` standard `Read-only` & `Idempotent` tool annotations; First-Party Verified on Glama).
- **Curated Guides & Engineering Dispatches**:
  - [Claude Code Motion & Landing Page Prompts](https://movaui.com/for/claude-code-motion-prompts)
  - [Cursor & Windsurf SaaS Landing Page Prompts](https://movaui.com/for/cursor-landing-page-prompts)
  - [Three.js & WebGL 3D Shader Prompts](https://movaui.com/for/threejs-webgl-shaders)
  - [WebGL / Three.js 60FPS Performance Budget Guide](https://movaui.com/blog/webgl-threejs-60fps-performance-budget-guide)
  - [MovaUI vs 21st.dev, Magic UI & Aceternity UI](https://movaui.com/blog/movaui-vs-21st-dev-magic-ui-comparison)

---

## License

MIT © 2026 [MovaUI · 动境 (`movaui.com`)](https://movaui.com).
