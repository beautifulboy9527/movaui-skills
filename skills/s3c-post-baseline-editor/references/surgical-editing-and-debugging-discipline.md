# 精准最小编辑、根因排查与验证铁律（S3C 工程纪律）

> **来源与吸收声明（A2/A3 原始综合）**：
> - `obra/superpowers`（MIT，`skills/verification-before-completion/SKILL.md`、`skills/systematic-debugging/SKILL.md`，A2 机制重写）：完成声明前的鲜活证据铁律、四阶段根因排查、红绿回归验证。
> - `addyosmani/agent-skills`（MIT，`skills/incremental-implementation/SKILL.md`，A2 机制重写）：薄垂直切片、Rule 0 简洁优先、Rule 0.5 范围纪律与“发现但不越界修改”记录法。
> - **明确不迁移项**：不强行引入特定 Git 工作流/分支命名或特定任务追踪器格式；所有编辑契约仍以 `docs/edit/*.json` 与 `validate-edit-contract.mjs` 为准。

## 1. 根因排查先行（严禁盲目叠加症状补丁）

当 S3C 请求旨在修复已有站点的视觉错位、交互失灵或构建回归时，进入 `Plan` / `Patch` 前必须走完根因定位，**禁止在未证实根因前连续试错打补丁**：

1. **复现并固定最小证据**：记录确切触发条件（视口宽度、路由、状态、控制台/网络输出），写入 `docs/edit/evidence/`。
2. **顺数据流反向追源**：从出错的 DOM/样式/渲染值沿调用链回溯到第一个错误值产生点（区分 `canonical`、`generated`、`runtime-derived`、`vendored`）。
3. **单变量假设检验**：每次只提一个可证伪假设，用最小改动或独立探针验证；若连续 **2–3 次假设被推翻**，立即停止堆补丁，退回重审架构假设或升级给用户决策（与 SKILL.md 的两轮停滞熔断规则同源）。
4. **红绿回归闭环**：修复缺陷时，在 `before-after.json` 中记录修复前确凿失败（Red）与修复后确凿通过（Green）的同一条校验命令/断言，避免“原本就绿”的假验证。

## 2. 验证先行铁律（Verification Before Completion）

在宣称本次 S3C 修改“已完成 / 已修复 / 无回归”之前，必须按顺序完成五步门禁函数：

1. **IDENTIFY**：明确哪条命令或浏览器断言能直接证明本次目标已达成且不变量未破；
2. **RUN**：在最终代码状态下**重新完整执行**（绝不复用改代码之前的历史输出）；
3. **READ**：读取完整退出码、错误计数与关键输出；
4. **VERIFY**：确认输出逐条匹配 `edit-request.json` 的全部验收标准；
5. **CLAIM**：只陈述证据实际覆盖的范围——`lint` 通过不等于 `build` 通过，`build` 通过不等于运行时交互正常，修改了文件不等于问题已解决。

## 3. 范围纪律与“发现但不越界”（Scope Discipline）

S3C 的核心价值是**零意外连带改动**：

- **只改 `edit-plan.json` 的 `allowlist` 文件**，绝不顺手格式化无关文件、重排无关 import、删掉没完全读懂的注释、或“顺便现代化”未在请求范围内的代码。
- **简洁优先**：能用 5 行局部修改解决的问题，绝不为假想的未来需求引入新抽象层或全局状态容器。
- **越界发现单列上报**：排查过程中若发现范围之外的潜在缺陷（例如相邻组件的无障碍问题或未用导入），**不要顺手改掉**，而是单独记录在交付报告的 `Noticed But Not Touching` 列表交由用户决定是否另开任务。
- **可回滚原则**：优先采用可独立回退的增量改动，避免一次编辑同时混合逻辑重构与视觉微调。

## 4. 现代前端框架安全编辑防坑指南（Next.js 16 / React 19 / Tailwind v4）

| 高发越界陷阱 | 隐蔽后果 | S3C 安全边界 |
|---|---|---|
| 在顶层布局或父容器盲目添加 `'use client'` | 把整棵服务端组件子树拖进客户端 Bundle，破坏 SSR 元数据/SEO 与首屏 LCP | 仅将需要浏览器事件/Hook 的最小叶子组件拆为 Client Component，保持父级为 Server Component |
| 直接修改 Next.js / Vite 生成的构建产物或内容哈希 chunk | 下次 `build` 静默覆盖，且 `validate-edit-contract.mjs` 判红 | 必须经 `.map` 或入口配置追溯到 `canonical` 源，生成器变更须在 `generator_edits` 显式披露 |
| 在 Tailwind v4 CSS 入口中于规则块之后追加 `@import`，或写未分层的全局元素选择器 | 后续 `@import` 被浏览器静默忽略；未分层元素选择器压垮所有 Tailwind utility 类 | `@import` 必须在文件最顶部；基础复位必须归入 `@layer base` |
| 用 `!important` 或更高权重选择器强压旧样式 | 制造层叠债务，破坏响应式断点与暗黑模式覆盖 | 先在 DevTools/源码定位原生效规则的 `canonical` 来源，就地修改或走语义令牌 |
| 删减“多余动效”时顺手移除触发状态回调的容器 | 导致 `opacity: 0` 永久残留或依赖 `onAnimationEnd` 的下游逻辑死锁 | 删减动效前必须排查回调依赖与最终态样式，并在 `before-after.json` 验明静态终态可见 |
