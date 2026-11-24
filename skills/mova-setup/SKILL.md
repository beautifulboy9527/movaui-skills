---
name: mova-setup
description: Connect Claude Code, Cursor, Windsurf, VS Code, Codex, or Antigravity to the official MovaUI (movaui.com) read-only Cloud Catalog MCP (/mcp/catalog) and starter engineering skills.
---

# MovaUI Cloud MCP Setup (`mova-setup`)

Connect your AI coding agent to **[MovaUI · 动境](https://movaui.com)** — the AI Motion Website Prompt Library, 60FPS Animated Background Catalog, and Cloud Engineering Skills platform.

> **Official Endpoint**: `https://movaui.com/mcp/catalog` (Streamable HTTP JSON-RPC 2.0, read-only)  
> **Agent Bootstrap Spec**: `https://movaui.com/skill.md`  
> **Machine-Readable Site Index**: `https://movaui.com/llms.txt`

## 1. Quick Configuration by Editor

Guest preview works with **zero authentication header** (free showcase catalog & free-tier skills). For member quotas and VIP/SVIP cloud skills, generate a read-only Personal Access Token (`mova_pat_*`) at `https://movaui.com/skills` or `https://movaui.com/settings`.

### Claude Code CLI
```bash
# Free guest mode (no token required)
claude mcp add --transport http movaui https://movaui.com/mcp/catalog

# With Personal Access Token (optional)
claude mcp add --transport http movaui https://movaui.com/mcp/catalog \
  --header "Authorization: Bearer mova_pat_YOUR_TOKEN"
```

### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "movaui": {
      "url": "https://movaui.com/mcp/catalog"
    }
  }
}
```

### Windsurf / Antigravity
```json
{
  "mcpServers": {
    "movaui": {
      "serverUrl": "https://movaui.com/mcp/catalog"
    }
  }
}
```

### Stdio Bridge Fallback (for stdio-only clients)
```json
{
  "mcpServers": {
    "movaui": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://movaui.com/mcp/catalog"]
    }
  }
}
```

## 2. Security Rules
- **Never commit `mova_pat_*` tokens** to Git; store them in user-level config or `.gitignore`-protected files.
- Always run `stack-adapter-skill` before inserting motion components into non-Next.js repositories (Vite, Vue, Astro, Tailwind v3).
- When modifying an existing site after its baseline exists, invoke `s3c-post-baseline-editor` to preserve layout geometry and style invariants.

## 3. Available Read-Only MCP Tools
- `mova_catalog_search` — search curated motion website prompts by category, style, or keyword
- `mova_catalog_list_techniques` — inspect catalog taxonomy and live scale
- `mova_catalog_get_prompt` — retrieve structured motion engineering prompts
- `mova_catalog_get_background` — discover 60FPS loopable web backgrounds and embed templates
- `mova_skill_list` / `mova_skill_invoke` — discover and invoke the 21 tiered cloud engineering skills
