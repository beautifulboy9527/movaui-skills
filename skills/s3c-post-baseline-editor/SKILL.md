---
name: s3c-post-baseline-editor
description: Use when making a bounded change to an existing local website after its baseline exists, especially when the visible target may be owned by canonical source, generated output, runtime-derived behavior, vendored code, or an unknown file and the edit must preserve unrelated behavior.
---
> **自包含声明**：本 skill 脚本依赖的共享实现已内置在本目录 `lib/`（与 `quality-gate-skill/lib` 为字节一致副本，任何一侧修改都须双向同步）。单独拷出本 skill 目录即可运行 —— 脚本无跨 skill import。

# S3C Post-Baseline Editor



已有基线站点的安全编辑能力。核心规则：**先定位来源，再写计划；只改获准边界；用请求特定证据证明结果。** 本 skill 不负责建站、原创设计、SEO、发布或替代既有质量门禁。

## 输入契约

必须从项目根目录读取：

- `docs/edit/edit-request.json`：请求、授权、目标、验收标准与保留不变量。
- `docs/edit/editability-map.json`：可见目标到候选 owner 的追踪证据与 source class。
- 已存在的基线站点源码、生成脚本、构建产物和运行时行为。

两份输入不存在时，**不要把它当作停工理由**。用户的自然语言请求就是授权依据：先把它译成 `edit-request.json`（并在 `source_of_request` 里写明是从指令重建的），再继续 trace。缺少输入只能阻止 patch，不能阻止取证。

Source class 只能是：

- `canonical`：可编辑的真实来源；
- `generated`：禁止手改，必须追踪 generator/input；
- `runtime-derived`：只能作为行为证据，不是写入 owner；
- `vendored`：需要许可/例外审批；
- `unknown`：不能假定安全，需补证据或明确批准例外。

### Source map 存在时：必须用它，不得以“是 generated”为由直接阻塞

`generated` 的含义是“不得作为编辑目标”，**不是**“无法追溯”。bundle 旁边有 `.map`（或末尾有 `sourceMappingURL`）时，它就是归属证据：

1. 读 `.map`，用 `mappings` 把可见字串的位置解回 `sources[i]`；
2. 把解出的路径写进地图的 `resolved_canonical`，并以 map 作为 `evidence`；
3. 只改解出的 canonical 文件，bundle 作为再生成输出声明。

**有 map 却直接输出 blocked 是错的**：那不是谨慎，而是没做追溯、只是拒绝一切看起来像构建产物的东西。反之，`sourcesContent` 缺失、`sourceRoot` 被重写、或解出的路径在仓库里不存在时，说明 map 不足以定 owner，此时才该阻塞，并把已解到哪一步写进地图。

### 非字面量内容（i18n / CMS / 模板插值）：「grep 未命中」不是归属结论

上面所有追溯路径都隐含一个前提：**可见字串以字面量形式存在于某个文件**，所以 grep 它总能落到一个 owner。真实项目经常不满足这个前提：文案来自 i18n 目录或 CMS 时，渲染出的句子是运行时拼出来的，**仓库里没有任何文件包含它**。

`docs/quality/fixtures/s3c-i18n-fixture` 实测：四个可见目标中 **三个全仓库 grep 零命中**，第四个文案在产物里但可读 key 已被抄成短哈希。四种失败理由各不相同：

| 屏幕上的文案 | grep 不到的原因 |
|---|---|
| `Ship faster with confidence` | 插值：目录里是 `Ship {speed} with {mood}`，值运行时注入 |
| `3 projects need review` | 复数：目录里是 one/other 两条，按 count 选 |
| `Welcome back, Rowan` | CMS 供给：名字从未存在于仓库 |
| `Analytics Overview` | key 被抄：构建把 `dashboard.analytics.title` 换成 `t540f12` 且不发布反查表 |

**此时直接输出 `blocked: 字串在任何源文件中找不到` 是错的**，与上一节「有 map 却阻塞」同一形态。正确追溯路径：

1. 找到 DOM 节点，读它的 `data-i18n-key`（或产生它的运行时查找）；
2. 拿 key 过目录解出**模板字串**；
3. grep **模板的特征片段**，不是渲染结果 —— `with {mood}` 能找到 `locales/en.json`，`Ship faster with confidence` 找不到任何东西；
4. key 被抄时，映射表是构建期产物；canonical owner 是目录文件加生成器，不是产物。
   夹具里这两份就是这个形状的**被测对象**：
   `docs/quality/fixtures/s3c-i18n-fixture/dist/messages.json`（文案在、可读 key 没了）与
   `docs/quality/fixtures/s3c-i18n-fixture/build/key-map.json`（追溯必须还原的构建期映射表）。
   **两者都必须入库** —— 少了哪一份，这份夹具都看起来完整而测不了它声称要测的事。
5. 值真的来自外部系统时，**那确实应该阻塞** —— 但理由是「值在运行时来自外部系统，需 CMS 权限而非代码编辑」，而不是「grep 没找到」。

所以这类请求的正确结果往往是**部分阻塞**：有的目标可改，有的不可，契约必须逐个说清哪个是哪个、为何。

门禁因此按**整份地图**（而非逐条）校验：若任一条证据自述「搜过这个字串但没找到」，则地图里**至少要有一条**展示另一条真实追溯路径（i18n key、模板片段、目录文件、运行时查找、source map……），或明确声明值源于仓库之外。**按条要求是错的**：「这个候选文件里没有该字串」本身就是好证据（排除候选是追溯收敛的方式），只要同一份地图里其他条目确实追到了 owner。

### Monorepo：包边界不是追溯终点

可见字串常不属于正在看的那个包。依赖的 `package.json` 指向 `main: dist/...` 时：

- **依赖包里的 `dist/` 同样是 `generated`**，尽管它不在当前应用的构建输出目录下。改它在本地看起来生效，下一次构建该包时会被静默覆盖。
- 要继续追到依赖包的 `src/`，而不是停在消费方。
- **共享组件的影响半径必须写进计划的 `risks`**：请求本身只提到一个页面，但改共享组件会改变每一个 import 它的包。不写这一条就是把跳出请求边界的变更当成局部修改上报。

### 内容哈希产物：重建会改名，必须声明 `replaces`

真实 bundler 按内容哈希命名 chunk（`index-DunFAchn.js` → `index-DUSBUmds.js`）。因此一次正确的重建**同时表现为删除旧文件 + 新增新文件**，而不是「同一个文件被改了」。

这带来两个后果，都必须处理：

1. **旧路径要在计划里认领。** 在对应的 `generated_files` 条目上写 `replaces`（字符串或数组），指明它取代了哪个产物。门禁会核对：被 `replaces` 的路径**必须真的不存在了** —— 若新旧并存，那就不是改名，而是多出了一个文件，声明就是在拿改名故事掩盖真实改动。
2. **新路径要进 `patch-log.changed_files`。** 新产物是 untracked 文件，`git diff` 看不到它们；只列旧名等于只报告了消失的东西，没报告新造出来的东西。

哈希改名还会连锁：入口 HTML 里注入的 script src 会跟着变，依赖该 chunk 的其他 chunk 也会因 import 目标变化而改名。这些都算再生成输出，一并声明。

### 取证脚本放 `docs/edit/evidence/`

为本次请求写的 probe、trace 脚本与其输出放在 `docs/edit/evidence/` 下，门禁视其为合同的一部分，不计作越界改动。

但**仓库根目录不要留临时诊断文件**。中间产物写进 evidence 目录，或用完删掉；工作树里的残留物门禁会如实报出来。



## 流程

1. **Inspect**：盘点入口、路由、源码、生成脚本/输出目录、runtime script、样式、资产和 source map（若有）。
2. **Trace**：把请求中的可见目标与地图中的 selector、文字、asset、route 或 behavior 对齐；记录候选 owner、source class、证据和置信度。
3. **Plan**：在任何源码改动前写 `docs/edit/edit-plan.json`。计划必须声明最小文件边界、符号/范围、风险、fallback、保留不变量与验证命令。
4. **Patch**：只改计划 allowlist 内的 canonical 文件。生成物变化必须由生成脚本产生；默认禁止手改 generated/vendored/unknown。若不得不改**生成器本身**（构建脚本、模板、配置），必须写进 `edit-plan.generator_edits`（`{ file, reason }`）。生成器虽然是 canonical，但它不是内容而是“产物如何被造出来”；改它可能影响请求从未提到的文件。这是**披露要求而非禁止**：“改了一个组件”与“改了整个 bundle 的构建方式”不应在 patch log 里长得一模一样。
5. **Validate**：写 `docs/edit/patch-log.json` 与 `docs/edit/before-after.json`；请求的每条 assertion 必须有 before、after、method、passed。再运行适用的现有质量/动效/无障碍门禁。
6. **Report**：明确哪些是请求级证据、哪些只是通用 gate；不能用“build passed”“文件已修改”代替目标已改变且不变量保持的证明。

### 视觉动效与图元调优协议（Visual & Motion Tuning Protocol）

当调优请求涉及画面质感、角色动作、交互情节增删或部件穿模（而非纯文案/纯静态 CSS）时，执行以下通用纪律以保证跨风格通用性，杜绝特定题材或画风绑定：

1. **Trace 阶段定位根因**：
   - 区分是 **Token 漂移**（色值/字阶脱离了 `designProfile`）、**变换矩阵叠加异常**（子级 `translate` 累加导致下沉穿透基准面）、还是 **未授权动效蔓延**（私自引入高噪冲突动画破坏原始意图）。
2. **Plan 阶段声明几何与行为不变量**：
   - 在 `edit-plan.json` 的 `preserved_invariants` 中声明必须保持的物理与行为规则（如“地平面连续性不变”、“已有图元的行进与跳跃逻辑不变”）；
   - 在 `risks` 中识别子图元变动对父级容器视口或相对布局的影响。
3. **Validate 阶段提供关键帧证据**：
   - 严禁仅以 `npm run build` 或“代码改完”作为动效调优完成依据；
   - 必须捕获关键行程（如启程 0%、中间交互 50%、终点 100%）的清晰 Before/After 截图，并在 `before-after.json` 中记录可见变化与几何不变量断言（例如悬挂物离地间距 $\ge 0$、无冲突动效节点）。
4. **目标锚定四维 Critic 与两轮停滞熔断（Target-Anchored Critic & 2-Round Stall Breaker）**：
   - **视觉目标基准先行（Target Image Anchor）**：对复杂场景、3D/Canvas 舞台或高保真图元调优时，先锁定一张实机目标基准图（存量调优以原站/当前基线截图为底，严禁脱离基线凭空发散）；若任务为「削减冗余动效」，必须遵守 `.agents/skills/references/native-css-interaction-primitives.md` §9.2 的卸载隐患检查（防 `opacity: 0` 残留或 `onAnimationEnd` 回调断链）。
   - **独立四维 10 分制评判（记录单位：`target_id:round`）**：每轮修改后对比实时渲染截图与目标基准，按四维量表客观打分：
     - `composition`（0–3 分）：相机视角、构图比例、主组件位置与尺度是否对齐基准；
     - `lighting`（0–3 分）：色板、明暗对比、阴影与氛围层级是否准确；
     - `materials`（0–3 分）：表面纹理、线条粗细层级、材质质感是否避免了廉价塑料感或过度抽象；
     - `details`（0–1 分）：微部件几何关系（如悬挂物、遮挡层级、边缘对齐）是否零穿模。
   - **两轮停滞熔断机制（2-Round Stall Breaker）**：若连续 **2 轮**最高总分提升 `< 1.0` 分，或同一个具体缺陷（`gap_id`）连续 **2 轮**未被消除，**立即触发 `stall` 熔断——严禁继续叠加增量微调补丁（Incremental Tweaks）**。此时必须退后一步重审底层实现路径（如坐标空间、图元结构或相机参数），若架构重调后仍无提升，立即诚实停机并输出 `partially_blocked` / `blocked` 交由用户决策，杜绝无收敛循环导致画面质感退化。

### 存量代码现代化与原生 Web API 升级协议（Modern Web Platform Modernization Protocol）

当编辑请求旨在清理存量代码中的过时 Web 反模式（如将手写遮罩弹窗升级为 `<dialog>` / `popover`、将 JS 高度计算升级为 `field-sizing: content`、修复输入法 `isComposing` 回车抢断、替换私有滚动条伪元素等）时，执行以下四步闭环（离线基线见 `.agents/skills/references/native-css-interaction-primitives.md` §八）：

1. **Trace 阶段（按 `guideId:ruleId:file:line` 颗粒度取证与双向判据过滤）**：
   - 可运行 `npx -y modern-web-guidance@latest legacy-scan <target-dir> --json` 采集候选遗留模式，输出存入 `docs/edit/evidence/`；
   - 每条匹配必须按 **`guideId:ruleId:file:line`** 原子颗粒度登记，先核对 source class（属 `generated` 或 `vendored` 的文件严禁手改），再逐条核对 `verifierRubric.keepWhen` 与 `verifierRubric.dropWhen`：若匹配项位于 `@supports` 渐进增强回退分支或满足 `dropWhen` 免责条件，必须在地图或取证记录中标明豁免，不得列入修改目标。
2. **Plan 阶段（最小文件边界与视觉不变量声明）**：
   - 仅将确认属于 `canonical` 且满足 `keepWhen` 的源码文件列入 `edit-plan.json` 的 allowlist；
   - 在 `preserved_invariants` 中声明**视觉与交互等价不变量**（原生 API 替换仅升级底层机制，除非请求明确要求，不得擅自改变站点既有的配色、排版字阶、间距或品牌视觉风格）。
3. **Validate 阶段（复跑扫描清零 + 行为与视觉断言）**：
   - 在 `before-after.json` 中同时记录：① 目标 `guideId:ruleId:file:line` 在复跑 `legacy-scan` 后已清零；② 升级后的原生控件在真实浏览器中的计算态/键盘交互/视觉表现满足验收条件且未破坏保留不变量。

### 合法的阻塞结果

找不到安全 canonical owner 时，**停下来是正确结果**，不要为了让门禁通过而随便改一个文件。
但**停下来不等于不交付证据**。阻塞也必须把五份契约写完，否则下一任 agent 无法知道你查过什么、为何停下、人要决定什么，而且门禁无法校验这次拒绝是否诚实。只写在回复里的拒绝是不可审计的。

写入：

```json
{
  "decision": "blocked",
  "blocked_reason": "why no safe canonical patch exists",
  "unblock_options": ["what a human must decide or approve"]
}
```

并且：`patch-log.changed_files` 必须为空数组、实际不得有任何 source 改动、至少一条验收条件记为 `passed: false` 并带 `blocked_reason`。全部条件都通过却声称 blocked 会被门禁拒收。

### 部分阻塞：`decision: partially_blocked`

多目标请求很常见的真实结果是「一部分能改、一部分确实不能」—— 比如 tagline 归消息目录所有（可改），而用户名由 CMS 在运行时供给（改代码没用）。

这时**不要**在「全部阻塞」与「把不该改的也改了」之间二选一，也不要把验收条件重写成能通过的样子。写 `decision: partially_blocked`，它同时背两条路径的义务（而非任一条的放宽）：

- 已应用部分按完整的 changed-file 纪律校验（patch log 与 Git 一致、不超 allowlist）；
- **至少一条** assertion `passed: false` 且各自带 `blocked_reason`；
- **至少一条** assertion `passed: true` 且带 before/after —— 否则 partial 只是 blocked 的婉辞；
- `blocked_reason` 与 `unblock_options` 仍必需，限定在被阻那部分。

两个方向都会被校验：全部通过就是普通的 applied run，无一通过就是 blocked run，两者都不得借 `partial` 绕开更严的那条路径。

## 输出契约

以下五份文件缺一不可：

```text
docs/edit/edit-request.json
docs/edit/editability-map.json
docs/edit/edit-plan.json
docs/edit/patch-log.json
docs/edit/before-after.json
```

`validate-edit-contract.mjs` 会检查结构、source class、计划顺序所需字段、Git changed-file allowlist、generated-output **声明的再生成例外**与 request-specific assertions。它不会执行 JSON 中任意命令，也不能只凭一个声明反证 generated 文件从未被手改；需要可重复的生成器命令、Git diff、及项目级构建/浏览器证据共同支撑该结论。
## 门禁

从项目根运行：

```bash
node .agents/skills/s3c-post-baseline-editor/scripts/validate-edit-contract.mjs
```

门禁失败条件包括：请求/地图/计划/证据缺失；canonical owner 缺 trace evidence；计划没有 allowlist；实际 changed file 超出 allowlist；直接修改 generated 或 vendored 文件；patch log 与 Git diff 不一致；before-after 缺失某条请求 assertion 或 assertion 未通过；声称 blocked 却有 source 改动、缺 `blocked_reason` / `unblock_options`、或所有验收条件均通过；声明 `replaces` 的旧产物仍存在于盘上；以及地图自述字面量未命中却没任何条目展示另一条追溯路径。

变更文件的发现兼顾 `git diff --name-only HEAD` 与 `git ls-files --others --exclude-standard`。只用前者会遗漏全部 untracked 新产物 —— 内容哈希重建后，那恰好是真正新造出来的那一批。

默认拒绝以下合理化：

- “用户只看浏览器，所以直接改 generated HTML”；
- “canonical 和 generated 一起改更保险”；
- “build 通过就说明交互没坏”；
- “我列出了改动文件，所以不需要 edit plan”；
- “runtime attribute 看起来像 source，所以可以直接改 attribute”。

## 明确不保证的能力

- 不保证能在 bundle、minified mirror 或无 source map 的站点中找到 canonical owner。
- 不保证跨工具链的 map 解析。已实测 Vite 8 与 esbuild 0.28 的真实产物（`docs/quality/fixtures/s3c-vite-fixture`），**未**覆盖 webpack 的 `webpack://` 协议式 `sources`、`sections` 形式的嵌套 index map、以及 CSS/资产归属。
- 非字面量内容只覆盖到「要求地图里有真实追溯路径」。门禁**不能**校验那条追溯是否正确 —— 它读不了目录、不会解 key、也不验证 `data-i18n-key` 真的指向声称的条目；它只能分辨「做过某种追溯」与「仅凭 grep 未命中就下结论」。
- 不保证支持任何框架、构建器、WebGL 实现或静态导出；适配器和请求级浏览器证据仍需项目验证。
- 不保证生成物、vendored code 或 unknown target 可以安全编辑。
- 对 generated output，门禁只验证**例外已显式声明且可审计**，不执行任意 contract 命令、也不能单独证明文件从未被手改；需用项目生成器、diff 与运行时证据补足。
- 不保证通用 quality/release gate 证明了本次请求；必须有 before-after assertions。
- 不等价于 NT Site Editor，也不证明视觉等价、真机性能或生产结果。

## 常见失败

- **生成物被改**：回滚生成物，找到 generator/input，将 canonical 文件加入计划后重新生成并记录命令。
- **多个候选 owner**：不要猜；扩大 inspect/trace，或把不确定性和人工批准写入地图与请求。若仍无法定下，输出 `decision: blocked` 而不是任选一个文件修改；把每个候选连同其证据一并记入地图，让人能直接挑。
- **可见字串 grep 不到**：不要归因为「无法追溯」。先看元素上的 i18n key、再拿 key 解模板、然后 grep 模板片段（不是渲染结果）。只有确认值来自外部系统时才阻塞，且理由要写清是「外部所有」而非「搜不到」。
- **拒绝了但没留契约**：仅在回复里说明为何不改等于没有证据；补全五份契约并跑门禁，让阻塞也可被复核。
- **交互被“保留”但未验证**：把点击、键盘、计算样式、属性或截图等具体行为写成 assertion。
- **无关 diff**：恢复格式化、重命名和 opportunistic refactor；让 changed-file allowlist 与 patch log 一一对应。
- **地图过时**：重新生成相关 trace evidence；不要靠旧 map 继续 patch。

## 参考路由
- RED 证据：`docs/quality/s3c-red-baseline.md`
- 不安全来源（应阻塞）证据：`docs/quality/s3c-hard-source-baseline.md`
- source map / monorepo 证据：`docs/quality/s3c-map-monorepo-baseline.md`
- 真实 bundler 产物证据（Vite + esbuild）：`docs/quality/s3c-real-bundler-baseline.md`
- 非字面量内容证据（i18n / CMS / key 被抄）：`docs/quality/s3c-nonliteral-content-baseline.md`
- 竞争能力分析：`docs/quality/competitive-capability-analysis.md`
- 合同门禁：`scripts/validate-edit-contract.mjs`
- 根因排查、验证铁律、最小范围纪律与 Next.js 16 / Tailwind v4 安全编辑：`references/surgical-editing-and-debugging-discipline.md`
- 既有质量验证：`.agents/skills/quality-gate-skill/`
- 授权基线与复刻边界：`.agents/skills/website-cloner-skill/`
- 现代 Web 平台原生原语与反遗留基线：`.agents/skills/references/native-css-interaction-primitives.md`（§八）
## 双模运行与数据颗粒度契约（Standalone vs Pipeline）

- **独立运行（Standalone Mode）**：单拷本目录即可对**任意已存在的本地网站项目**执行有界最小修改（脚本自包含 `lib/`，**不依赖任何外部流水线或特定建站历史**）。直接针对用户修改请求依次建立 `docs/edit/{edit-request,editability-map,edit-plan,patch-log,before-after}.json` 并运行 `scripts/validate-edit-contract.mjs` 验证零越界与证据完备。
- **流水线模式（Pipeline Mode）**：作为 S3C 基线后修订阶段（与 S3A 复刻、S3B 原创互斥），严格按以下记录单位交接：
  - 编辑追踪与补丁契约：`edit_id` × `allowlist` 最小白名单文件集；
  - 独立四维视觉 Critic 评判：`target_id:round`（连续 2 轮提分 `< 1.0` 或同 `gap_id` 复现即触发 `stall` 熔断）；
  - 遗留 Web 反模式清理：`guideId:ruleId:file:line`（逐条核验 `keepWhen` / `dropWhen`，禁删渐进增强回退）。
